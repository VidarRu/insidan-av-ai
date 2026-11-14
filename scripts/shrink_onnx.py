"""Krymper den exporterade ONNX-modellen utan att ändra vad den räknar fram.

1. Vikterna sparas med 16 bitar i stället för 32. När modellen laddas görs de
   om till 32 bitar igen (en Cast-nod per vikt), så själva räknandet sker med
   32 bitar både med WebGPU och med WebAssembly.
2. Ordtabellen (wte) används både först och sist i modellen. Exporten sparar
   den två gånger. Här sparas den en gång och vänds (Transpose) vid laddning.

Kör: python scripts/shrink_onnx.py <export/model.onnx> <ut/onnx/model.onnx>
"""
import sys, numpy as np, onnx
from onnx import helper, numpy_helper, TensorProto

src, dst = sys.argv[1], sys.argv[2]
m = onnx.load(src)
g = m.graph
inits = {i.name: i for i in g.initializer}

wte = numpy_helper.to_array(inits["transformer.wte.weight"])
head = [n for n, i in inits.items() if list(i.dims) == [wte.shape[1], wte.shape[0]]]
assert len(head) == 1, head
assert np.array_equal(numpy_helper.to_array(inits[head[0]]), wte.T), "lm_head är inte samma som wte"

new_nodes, new_inits = [], []
for name, init in inits.items():
    if name == head[0]:
        new_nodes.append(helper.make_node("Transpose", ["transformer.wte.weight"], [name], perm=[1, 0], name="tied_lm_head"))
        continue
    arr = numpy_helper.to_array(init)
    if init.data_type == TensorProto.FLOAT and arr.size >= 512:
        a16 = arr.astype(np.float16)
        assert np.isfinite(a16).all()
        new_inits.append(numpy_helper.from_array(a16, name + "_f16"))
        new_nodes.append(helper.make_node("Cast", [name + "_f16"], [name], to=TensorProto.FLOAT, name="cast_" + name))
    else:
        new_inits.append(init)
# Cast-noderna först, sedan Transpose (som behöver wte), sedan resten av grafen
casts = [n for n in new_nodes if n.op_type == "Cast"]
rest = [n for n in new_nodes if n.op_type != "Cast"]
old = list(g.node)
del g.node[:]; g.node.extend(casts + rest + old)
del g.initializer[:]; g.initializer.extend(new_inits)
onnx.save(m, dst)
onnx.checker.check_model(dst)
import os
print(f"{dst}: {os.path.getsize(dst) / 2**20:.0f} MB")
