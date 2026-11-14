// Var modellfilerna ligger. Under utveckling ligger de lokalt i public/models
// (den mappen läggs aldrig i Git). I produktion pekar VITE_MODEL_BASE på
// modellens mapp på Hugging Face, till exempel
// https://huggingface.co/<konto>/gpt-sw3-126m-onnx/resolve/main/
export const MODEL_BASE = (import.meta.env.VITE_MODEL_BASE || '/models/gpt-sw3-126m/').replace(/\/?$/, '/');
export const MODEL_FILE = 'onnx/model.onnx';
export const N_LAYER = 12;
export const N_HEAD = 12;
export const HEAD_DIM = 64;
