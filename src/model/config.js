// Var modellfilerna ligger: på Hugging Face, eftersom de är för stora för Git.
// Vill du i stället köra med egna lokala filer under utveckling, lägg dem i
// public/models/gpt-sw3-126m/ och skriv VITE_MODEL_BASE=/models/gpt-sw3-126m/
// i en fil som heter .env.local (den läggs inte i Git).
const HUGGING_FACE = 'https://huggingface.co/HuggingVidar/gpt-sw3-126m-onnx/resolve/main/';
export const MODEL_BASE = (import.meta.env.VITE_MODEL_BASE || HUGGING_FACE).replace(/\/?$/, '/');
// Modellen ligger i två filer: grafen (under 1 MB) och vikterna (259 MB).
// Delningen sparar minne när modellen startar, se scripts/split_onnx.py.
// Den gamla filen onnx/model.onnx, med allt i ett, ligger kvar på Hugging Face.
export const MODEL_GRAPH = 'onnx/model_split.onnx';
export const MODEL_WEIGHTS = 'onnx/model_split.onnx_data';
// Webbläsarens cache för modellfilerna. Byts namnet, tas den gamla bort.
export const MODEL_CACHE = 'inuti-sprakmodellen-v2';
export const OLD_CACHES = ['inuti-sprakmodellen-v1'];
export const N_LAYER = 12;
export const N_HEAD = 12;
export const HEAD_DIM = 64;
