"""Bygger galaxen till steg 3 av modellens egna ordvektorer (inbäddningsmatrisen wte).

Varje bit i ordförrådet (64 000 stycken) får en plats i 3D genom att de 768
dimensionerna projiceras med UMAP. Grannarna till varje ord räknas däremot ut i
det riktiga rummet med 768 dimensioner (cosinuslikhet), inte i 3D-bilden.

Kör: python scripts/build_galaxy.py <originalmapp> <utmapp med tokenizer.json> public/data
Filer som skapas:
  vocab.json      alla bitar i ordförrådet, i nummerordning
  galaxy.bin      Int16, 64 000 x 3 koordinater (skalade till -32767..32767)
  neighbors.bin   Uint16, för varje ordbit: de 8 närmaste ordbitarnas nummer
  neighbors_sim.bin  Uint8, cosinuslikheten för samma grannar (0..255 = 0..1)
  words.bin       Uint16, numren på de bitar som räknas som hela ord
"""
import json, re, sys, numpy as np
from pathlib import Path
from safetensors.numpy import load_file
from tokenizers import Tokenizer
import umap

src, tokdir, out = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
out.mkdir(parents=True, exist_ok=True)
W = load_file(src / "model.safetensors")["transformer.wte.weight"].astype(np.float32)
tok = Tokenizer.from_file(str(tokdir / "tokenizer.json"))
vocab = [tok.id_to_token(i) for i in range(W.shape[0])]
json.dump(vocab, open(out / "vocab.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))

Wn = W / np.linalg.norm(W, axis=1, keepdims=True)

# Hela ord: bitar som börjar med mellanslag (▁) och sedan bara har bokstäver.
is_word = np.array([bool(re.fullmatch(r"▁[^\W\d_]{2,}", v)) for v in vocab])
words = np.where(is_word)[0].astype(np.uint16)
words.tofile(out / "words.bin")
K = 8
nb = np.zeros((len(words), K), dtype=np.uint16); sim = np.zeros((len(words), K), dtype=np.uint8)
Ww = Wn[words]
for s in range(0, len(words), 2000):
    S = Ww[s:s + 2000] @ Ww.T
    S[np.arange(S.shape[0]), np.arange(s, s + S.shape[0])] = -1
    idx = np.argpartition(-S, K, axis=1)[:, :K]
    val = np.take_along_axis(S, idx, 1); order = np.argsort(-val, axis=1)
    idx = np.take_along_axis(idx, order, 1); val = np.take_along_axis(val, order, 1)
    nb[s:s + 2000] = words[idx]; sim[s:s + 2000] = np.clip(np.round(val * 255), 0, 255)
nb.tofile(out / "neighbors.bin"); sim.tofile(out / "neighbors_sim.bin")
print("ord:", len(words))

emb = umap.UMAP(n_components=3, n_neighbors=30, min_dist=0.3, metric="cosine", random_state=7, verbose=True).fit_transform(Wn)
emb -= np.median(emb, axis=0)
scale = np.percentile(np.abs(emb), 99.9)
q = np.clip(emb / scale, -1, 1)
(q * 32767).astype(np.int16).tofile(out / "galaxy.bin")
np.save(out.parent.parent / "galaxy_raw.npy", emb) if False else None
print("klart", emb.shape, "skala", scale)
