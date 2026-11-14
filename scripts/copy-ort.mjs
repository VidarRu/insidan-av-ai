// Kopierar ONNX Runtimes WebAssembly-filer till public/ort så att sidan inte
// behöver hämta dem från en extern server. Körs automatiskt efter npm install.
import { cpSync, mkdirSync, readdirSync } from 'node:fs';
const from = 'node_modules/onnxruntime-web/dist';
mkdirSync('public/ort', { recursive: true });
for (const f of readdirSync(from)) {
  if (/^ort-wasm-simd-threaded.*\.(mjs|wasm)$/.test(f)) cpSync(`${from}/${f}`, `public/ort/${f}`);
}
