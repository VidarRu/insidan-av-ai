# Skript för modellen

De här skripten körs en gång, på en vanlig dator med Python, för att göra om
GPT-SW3 126M till filer som en webbläsare kan köra. Resultatet läggs upp på
Hugging Face, aldrig i Git.

```bash
pip install torch transformers "optimum[onnxruntime]" optimum-onnx sentencepiece onnx tokenizers
# 1. Hämta originalet (kopian timpal0l/gpt-sw3-126m kräver ingen inloggning)
hf download timpal0l/gpt-sw3-126m --local-dir src-model
# 2. Gör om tokeniseraren och kontrollera den mot originalet
python scripts/convert_tokenizer.py src-model out
# 3. Exportera modellen till ONNX
optimum-cli export onnx --model src-model --task text-generation-with-past --opset 17 onnx-export
# 4. Krymp filen (16-bitars lagring, ordtabellen sparas en gång): 740 MB blir 259 MB
python scripts/shrink_onnx.py onnx-export/model.onnx out/onnx/model.onnx
# 4b. Dela filen i graf och vikter, så att webbläsaren behöver mindre minne (sidan använder den här)
pip install onnxruntime   # bara för kontrollen i slutet av skriptet
python scripts/split_onnx.py out/onnx/model.onnx out/onnx/model_split.onnx
cp onnx-export/config.json onnx-export/generation_config.json src-model/LICENSE src-model/GPT-SW3_MODEL_GUIDELINES out/
# 5. Kontrollera att den krympta modellen räknar fram samma sannolikheter som originalet
python scripts/compare_variants.py src-model out onnx/model.onnx
```

Lägg sedan ett modellkort (`README.md`) i `out/` och ladda upp mappen till Hugging Face:

```bash
hf upload HuggingVidar/gpt-sw3-126m-onnx out .
```

Vill du prova lokala filer i stället, kopiera `out/` till `public/models/gpt-sw3-126m/` och sätt `VITE_MODEL_BASE` enligt `src/model/config.js`.

Uppmätt 2026-11-14: tokeniseraren ger identiska bitar för alla testmeningar, och
den krympta modellen ger samma toppval i 299 av 299 positioner jämfört med
originalet i PyTorch. En vanlig 8-bitarskvantisering provades och valdes bort:
den gav samma toppval i bara 65 procent av positionerna.
