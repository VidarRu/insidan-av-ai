"""Gör om den krympta modellen så att webbläsaren behöver mindre minne.

   python scripts/split_onnx.py out/onnx/model.onnx out/onnx/model_split.onnx

Ger model_split.onnx (själva grafen, under 1 MB) och model_split.onnx_data
(vikterna, byte för byte samma 16-bitarstal som i model.onnx). Två ändringar:

1. Vikterna läggs i en egen fil. När allt ligger i en fil läser ONNX Runtime
   in hela filen och kopierar sedan ut vikterna ur den. Med en egen fil
   slipper den kopian.
2. Sista steget, från tal till sannolikheter för varje bit, använder samma
   ordtabell som början (64 000 × 768 tal). Originalet vänder tabellen med en
   Transpose-nod, och då gör ONNX Runtime en vänd kopia på 197 MB. Här görs
   steget med Gemm(transB=1), som läser tabellen som den är.

Uppmätt i Chromium 2026-11-15 (bara modellen, inga partiklar), som mest:
  model.onnx                  2,2 GB
  delad fil                   1,8 GB
  delad fil och Gemm          1,6–1,75 GB  (snålt läge för mobil: 1,2–1,3 GB)

Kontroll: samma logits som model.onnx (skillnad 0,0 med full optimering,
högst 0,00003 utan optimering, samma toppval). Se kontrollen längst ned.
"""
import sys
import os
import numpy as np
import onnx
from onnx import helper, numpy_helper

src, dst = sys.argv[1], sys.argv[2]
m = onnx.load(src)
g = m.graph
nodes = list(g.node)

# Byt Transpose(ordtabell) + MatMul mot Reshape + Gemm(transB=1) + Reshape
tr = next(n for n in nodes if n.name == "tied_lm_head" and n.op_type == "Transpose")
mm = next(n for n in nodes if n.op_type == "MatMul" and "logits" in n.output)
x, table = mm.input[0], tr.input[0]
vocab, dim = next(list(i.dims) for i in g.initializer if i.name == table + "_f16")
new = [
    helper.make_node("Shape", [x], ["lmh_shape"], name="lmh_shape"),
    helper.make_node("Slice", ["lmh_shape", "lmh_c0", "lmh_c2"], ["lmh_bn"], name="lmh_slice"),
    helper.make_node("Concat", ["lmh_bn", "lmh_vocab"], ["lmh_outshape"], axis=0, name="lmh_concat"),
    helper.make_node("Reshape", [x, "lmh_flat"], ["lmh_x2d"], name="lmh_reshape_in"),
    helper.make_node("Gemm", ["lmh_x2d", table], ["lmh_y2d"], transB=1, name="lm_head_gemm"),
    helper.make_node("Reshape", ["lmh_y2d", "lmh_outshape"], ["logits"], name="lmh_reshape_out"),
]
for name, val in [("lmh_c0", [0]), ("lmh_c2", [2]), ("lmh_vocab", [vocab]), ("lmh_flat", [-1, dim])]:
    g.initializer.append(numpy_helper.from_array(np.array(val, np.int64), name))
out = []
for n in nodes:
    if n is tr:
        continue
    out.extend(new if n is mm else [n])
del g.node[:]
g.node.extend(out)

location = os.path.basename(dst) + "_data"
# onnx lägger till i en befintlig viktfil i stället för att skriva över den
if os.path.exists(os.path.join(os.path.dirname(dst) or ".", location)):
    os.remove(os.path.join(os.path.dirname(dst) or ".", location))
onnx.save_model(m, dst, save_as_external_data=True, all_tensors_to_one_file=True,
                location=location, size_threshold=1024)
onnx.checker.check_model(dst)
print("klart:", dst, "och", location)

# Kontroll mot originalet, om onnxruntime finns installerat
try:
    import onnxruntime as ort
except ImportError:
    sys.exit(0)


def run(path, level):
    so = ort.SessionOptions()
    so.graph_optimization_level = level
    s = ort.InferenceSession(path, so, providers=["CPUExecutionProvider"])
    rng = np.random.default_rng(0)
    res = []
    for n in [1, 5, 17, 40]:
        ids = rng.integers(4, vocab, size=(1, n)).astype(np.int64)
        feeds = {"input_ids": ids, "attention_mask": np.ones((1, n), np.int64),
                 "position_ids": np.arange(n, dtype=np.int64)[None]}
        for i in s.get_inputs():
            if i.name.startswith("past_key_values"):
                feeds[i.name] = np.zeros((1, i.shape[1], 0, i.shape[3]), np.float32)
        res.append(s.run(["logits"], feeds)[0])
    return res


L = ort.GraphOptimizationLevel
a = run(src, L.ORT_ENABLE_ALL)
for name, level in [("full optimering", L.ORT_ENABLE_ALL), ("ingen optimering", L.ORT_DISABLE_ALL)]:
    b = run(dst, level)
    diff = max(float(np.abs(p - q).max()) for p, q in zip(a, b))
    same = all((p.argmax(-1) == q.argmax(-1)).all() for p, q in zip(a, b))
    print(f"{name}: största skillnad i logits {diff:.2g}, samma toppval: {same}")
