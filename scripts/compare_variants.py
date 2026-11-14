"""Jämför de krympta ONNX-varianterna med originalmodellen i PyTorch:
hur ofta toppvalet är detsamma och hur mycket sannolikheterna skiljer sig.

Kör: python scripts/compare_variants.py <originalmapp> <utmapp> [fil.onnx ...]
"""
import sys, numpy as np, torch, onnxruntime as ort
from pathlib import Path
from tokenizers import Tokenizer
from transformers import AutoModelForCausalLM

src, out = Path(sys.argv[1]), Path(sys.argv[2])
files = sys.argv[3:] or ["onnx/model_quantized.onnx", "onnx/model_fp16.onnx"]
tok = Tokenizer.from_file(str(out / "tokenizer.json"))
model = AutoModelForCausalLM.from_pretrained(src).eval()
texts = [t for t in Path(__file__).with_name("tokenizer_tests.txt").read_text(encoding="utf-8").splitlines() if len(t.strip()) > 3]

def softmax(x):
    x = x - x.max(-1, keepdims=True); e = np.exp(x); return e / e.sum(-1, keepdims=True)

ref = []
for t in texts:
    ids = torch.tensor([tok.encode(t).ids])
    with torch.no_grad(): ref.append(softmax(model(ids).logits[0].numpy().astype(np.float64)))

for f in files:
    s = ort.InferenceSession(str(out / f), providers=["CPUExecutionProvider"])
    top1 = n = 0; kl = []; overlap = []
    for t, p in zip(texts, ref):
        ids = np.array([tok.encode(t).ids], dtype=np.int64)
        feeds = {"input_ids": ids, "attention_mask": np.ones_like(ids)}
        for i in s.get_inputs():
            if i.name.startswith("past"):
                feeds[i.name] = np.zeros((1, 12, 0, 64), dtype=np.float32)
            if i.name == "position_ids":
                feeds[i.name] = np.arange(ids.shape[1], dtype=np.int64)[None]
        q = softmax(s.run(["logits"], feeds)[0][0].astype(np.float64))
        top1 += (q.argmax(-1) == p.argmax(-1)).sum(); n += len(p)
        kl += list((p * (np.log(p + 1e-12) - np.log(q + 1e-12))).sum(-1))
        for a, b in zip(p, q):
            overlap.append(len(set(np.argsort(-a)[:10]) & set(np.argsort(-b)[:10])))
    print(f"{f}: samma toppval {top1}/{n} ({100*top1/n:.1f} %), "
          f"KL-divergens medel {np.mean(kl):.4f} max {np.max(kl):.4f}, "
          f"gemensamma i topp tio: {np.mean(overlap):.2f} av 10")
