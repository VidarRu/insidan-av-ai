"""Räknar ut de förberäknade exemplen som sidan visar innan modellen har laddats,
och "fil"-exemplet till steg 4. Allt räknas med originalmodellen i PyTorch.

Kör: python scripts/precompute.py <originalmapp> <utmapp med tokenizer.json> public/data
Skapar examples.json, examples_logits.bin (Float16) och fil.json.
"""
import json, sys, numpy as np, torch
from pathlib import Path
from tokenizers import Tokenizer
from transformers import AutoModelForCausalLM

src, tokdir, out = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
tok = Tokenizer.from_file(str(tokdir / "tokenizer.json"))
gpt2 = Tokenizer.from_file(str(out / "gpt2-tokenizer.json"))
model = AutoModelForCausalLM.from_pretrained(src, attn_implementation="eager").eval()
BANNED = [0, 1, 2]

PRESETS = [
    ("Biblioteket i Västervik ligger", "The library in Västervik is located"),
    ("Sveriges huvudstad är", "The capital of Sweden is"),
    ("Det var en gång en", "Once upon a time there was a"),
    ("Min favoritbok handlar om", "My favourite book is about"),
]
# Något som inte finns. Förberäknade exempel ska inte peka ut verkliga personer,
# därför används en mening där fortsättningen sällan blir ett personnamn.
HALLU = [
    "Nobelpriset i bibliotekskunskap delades år 2019 ut till",
]

def logits_for(ids):
    with torch.no_grad():
        l = model(torch.tensor([ids])).logits[0, -1].double()
    l[BANNED] = -float("inf")
    return l

def top(l, k=10, temperature=1.0):
    p = torch.softmax(l / temperature, -1); v, i = p.topk(k)
    return [{"id": int(a), "piece": tok.id_to_token(int(a)), "p": round(float(b), 5)} for a, b in zip(i, v)]

# De förberäknade exemplen visas på storbild i bibliotek. Körningar som råkar
# innehålla något av de här orden görs om med ett annat slumpfrö.
AVOID = [" sex", "skit", "Anonym", "narkotika", "porr", "knark", "fitta", "kuk", "hora", "våldt", "mörd", "död", "sälja sex"]

def generate(text, temperature, seed, max_new=28):
    while True:
        r = _generate(text, temperature, seed, max_new)
        if temperature <= 0 or not any(a in r["text"] for a in AVOID): return r
        seed += 50

def _generate(text, temperature, seed, max_new):
    g = torch.Generator().manual_seed(seed)
    ids = tok.encode(text).ids; steps = []
    for _ in range(max_new):
        l = logits_for(ids)
        p = torch.softmax(l / (temperature if temperature > 0 else 1), -1)
        c = int(p.argmax()) if temperature <= 0 else int(torch.multinomial(p, 1, generator=g))
        if c == 3: break
        ids.append(c)
        steps.append({"id": c, "piece": tok.id_to_token(c), "p": round(float(p[c]), 5), "text": tok.decode(ids), "top": top(l, 5, temperature if temperature > 0 else 1)})
    return {"temperature": temperature, "seed": seed, "steps": steps, "text": tok.decode(ids)}

def gpt2_pieces(text):
    """Bitarna som GPT-2:s engelsktränade tokeniserare ger. Den arbetar med byte,
    så en bokstav som ä kan delas mitt itu. Då redovisas bokstaven i den bit där
    den blir hel, och biten före markeras med half=True."""
    ids = gpt2.encode(text).ids; res = []; prev = ""
    for i in range(len(ids)):
        cur = gpt2.decode(ids[: i + 1]).rstrip("�")
        res.append({"text": cur[len(prev):], "half": len(cur) == len(prev)}); prev = cur
    return res

logit_rows = []; examples = {"presets": [], "hallucination": []}
for pi, (sv, en) in enumerate(PRESETS):
    e = tok.encode(sv); l = logits_for(e.ids)
    logit_rows.append(l.clamp(min=-1e4).numpy().astype(np.float16))
    examples["presets"].append({
        "text": sv, "ids": e.ids, "pieces": e.tokens,
        "en": {"text": en, "pieces": tok.encode(en).tokens},
        "gpt2": gpt2_pieces(sv), "gpt2_en": gpt2_pieces(en),
        "top": top(l, 10), "logitsRow": len(logit_rows) - 1,
        "runs": [generate(sv, t, 100 * pi + 10 * int(t * 10) + s) for t in (0, 0.7, 1.0, 1.5) for s in ((1,) if t == 0 else (1, 2, 3))],
    })
for h in HALLU:
    e = tok.encode(h)
    examples["hallucination"].append({"text": h, "ids": e.ids, "pieces": e.tokens,
        "runs": [generate(h, t, s, 36) for t, s in ((0, 1), (0.7, 1), (0.7, 2), (0.7, 3))]})
json.dump(examples, open(out / "examples.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
np.stack(logit_rows).tofile(out / "examples_logits.bin")

# ---- "fil" i tre sammanhang ----
SENT = [("yoghurt", "Jag hällde upp en tallrik fil"), ("körfält", "På motorvägen bytte bilen snabbt fil"), ("dator", "På datorn sparade jag en ny fil")]
H = []; fil = {"sentences": []}
for label, s in SENT:
    e = tok.encode(s); assert e.tokens[-1] == "▁fil" and len(e.ids) == 7
    with torch.no_grad():
        o = model(torch.tensor([e.ids]), output_hidden_states=True, output_attentions=True)
    H.append(torch.stack([h[0, -1] for h in o.hidden_states]).double().numpy())
    att = torch.stack([a[0, :, -1, :].mean(0) for a in o.attentions]).numpy()  # lager x bitar, medel över huvuden
    l = o.logits[0, -1].double(); l[BANNED] = -float("inf")
    fil["sentences"].append({"label": label, "text": s, "pieces": e.tokens,
        "attention": np.round(att, 4).tolist(), "next": top(l, 6)})
H = np.array(H)  # 3 x 13 x 768
unit = H / np.linalg.norm(H, axis=-1, keepdims=True)
cos = np.einsum("ald,bld->lab", unit, unit)  # 13 x 3 x 3
fil["cosine"] = [[round(float(c[0, 1]), 4), round(float(c[0, 2]), 4), round(float(c[1, 2]), 4)] for c in cos]
# Vinklarna mellan tre vektorer går att rita exakt som en triangel i ett plan.
tri = []; prev = None
for c in cos:
    a01, a02, a12 = (float(np.arccos(np.clip(c[i, j], -1, 1))) for i, j in ((0, 1), (0, 2), (1, 2)))
    if a01 < 1e-6: P = np.zeros((3, 2))
    else:
        x = (a01**2 + a02**2 - a12**2) / (2 * a01); y = np.sqrt(max(a02**2 - x**2, 0))
        P = np.array([[0, 0], [a01, 0], [x, y]]); P -= P.mean(0)
        if prev is not None and np.abs(prev).sum() > 0:  # vrid så att triangeln ligger som i förra lagret
            best = None
            for flip in (1, -1):
                Q = P * [1, flip]; U, _, Vt = np.linalg.svd(Q.T @ prev); R = U @ Vt
                if np.linalg.det(R) < 0: continue
                d = np.linalg.norm(Q @ R - prev)
                if best is None or d < best[0]: best = (d, Q @ R)
            P = best[1]
    prev = P; tri.append(np.round(P, 4).tolist())
fil["triangles"] = tri
json.dump(fil, open(out / "fil.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print("klart")
