// Sidans väg in till modellen i Web Workern. Varje anrop ger ett löfte.
export function createModelClient() {
  const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  let nextId = 1;
  const pending = new Map();
  worker.onmessage = (e) => {
    const { id, type } = e.data;
    const p = pending.get(id);
    if (!p) return;
    if (type === 'done') { pending.delete(id); p.resolve(e.data.result); }
    else if (type === 'error') { pending.delete(id); p.reject(new Error(e.data.message)); }
    else p.onEvent?.(e.data);
  };
  worker.onerror = (e) => { for (const p of pending.values()) p.reject(new Error(e.message || 'Fel i modellens arbetstråd')); pending.clear(); };
  function call(type, args = {}, onEvent) {
    const id = nextId++;
    const promise = new Promise((resolve, reject) => pending.set(id, { resolve, reject, onEvent }));
    worker.postMessage({ id, type, ...args });
    promise.id = id;
    return promise;
  }
  return {
    loadTokenizer: () => call('loadTokenizer'),
    loadModel: (onEvent, prefer) => call('loadModel', { prefer }, onEvent),
    tokenize: (text) => call('tokenize', { text }),
    tokenizeGpt2: (text) => call('tokenizeGpt2', { text }),
    next: (text, opts = {}) => call('next', { text, ...opts }),
    generate: (text, opts = {}, onStep) => call('generate', { text, ...opts }, (m) => m.type === 'step' && onStep?.(m.step)),
    cancel: (target) => call('cancel', { target }),
  };
}

// Samma uträkning som i workern, för att räkna om vid en annan temperatur.
export function softmaxTop(logits, temperature, k) {
  let max = -Infinity;
  for (let i = 0; i < logits.length; i++) if (logits[i] > max) max = logits[i];
  const p = new Float64Array(logits.length); let sum = 0;
  for (let i = 0; i < logits.length; i++) { const v = Math.exp((logits[i] - max) / temperature); p[i] = v; sum += v; }
  const idx = Array.from({ length: logits.length }, (_, i) => i).sort((a, b) => p[b] - p[a]).slice(0, k);
  return idx.map((id) => ({ id, p: p[id] / sum }));
}
