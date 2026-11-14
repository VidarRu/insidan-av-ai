"""Gör om GPT-SW3:s SentencePiece-tokeniserare (spiece.model) till tokenizer.json,
det format som Transformers.js läser, och kontrollerar att resultatet ger exakt
samma bitar som originalet.

Kör: python scripts/convert_tokenizer.py <mapp med originalmodellen> <utmapp>
"""
import json, re, sys, unicodedata
from pathlib import Path

from tokenizers import Tokenizer, decoders, normalizers, Regex
from tokenizers.models import BPE
from transformers import AutoTokenizer
from transformers.convert_slow_tokenizer import SentencePieceExtractor

src, out = Path(sys.argv[1]), Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)

slow = AutoTokenizer.from_pretrained(src)
vocab, merges = SentencePieceExtractor(str(src / "spiece.model")).extract()

tok = Tokenizer(BPE(vocab, merges, unk_token="<unk>", fuse_unk=True, byte_fallback=True))

# Samma förbehandling som GPTSw3Tokenizer.preprocess_text: ta bort styrtecken,
# gör alla sorters blanksteg till vanliga blanksteg och normalisera till NFC.
whitespaces = "".join(sorted(slow.whitespaces))
non_printing = slow.non_printing_characters_re.pattern
tok.normalizer = normalizers.Sequence([
    normalizers.Replace(Regex(non_printing), ""),
    normalizers.Replace(Regex("[" + re.escape(whitespaces) + "]"), " "),
    normalizers.NFC(),
    normalizers.Prepend("▁"),
    normalizers.Replace(" ", "▁"),
])
tok.decoder = decoders.Sequence([
    decoders.Replace("▁", " "),
    decoders.ByteFallback(),
    decoders.Fuse(),
    decoders.Strip(content=" ", left=1, right=0),
])
specials = ["<pad>", "<unk>", "<s>", "<|endoftext|>"]
tok.add_special_tokens(specials)
tok.save(str(out / "tokenizer.json"))
(out / "tokenizer_config.json").write_text(json.dumps({
    "tokenizer_class": "PreTrainedTokenizerFast",
    "model_max_length": 2048,
    "unk_token": "<unk>", "bos_token": "<s>", "eos_token": "<|endoftext|>", "pad_token": "<pad>",
    "clean_up_tokenization_spaces": False,
}, indent=2))

# Kontroll mot originalet
tests = Path(__file__).with_name("tokenizer_tests.txt").read_text(encoding="utf-8").splitlines()
tests = [t for t in tests if t.strip()]
bad = 0
for t in tests:
    a, b = slow(t).input_ids, tok.encode(t).ids
    if a != b:
        bad += 1
        print("SKILLNAD:", repr(t), "\n  original:", slow.convert_ids_to_tokens(a), "\n  ny:      ", tok.encode(t).tokens)
print(f"{len(tests) - bad} av {len(tests)} testmeningar ger identiska bitar")
sys.exit(1 if bad else 0)
