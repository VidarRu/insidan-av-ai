// Var modellfilerna ligger: på Hugging Face, eftersom de är för stora för Git.
// Vill du i stället köra med egna lokala filer under utveckling, lägg dem i
// public/models/gpt-sw3-126m/ och skriv VITE_MODEL_BASE=/models/gpt-sw3-126m/
// i en fil som heter .env.local (den läggs inte i Git).
const HUGGING_FACE = 'https://huggingface.co/HuggingVidar/gpt-sw3-126m-onnx/resolve/main/';
export const MODEL_BASE = (import.meta.env.VITE_MODEL_BASE || HUGGING_FACE).replace(/\/?$/, '/');
export const MODEL_FILE = 'onnx/model.onnx';
export const N_LAYER = 12;
export const N_HEAD = 12;
export const HEAD_DIM = 64;
