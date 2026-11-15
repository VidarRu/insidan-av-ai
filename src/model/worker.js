// Web Worker: här räknar språkmodellen, vid sidan av själva sidan så att
// animationerna inte hackar. Tokeniseraren (@huggingface/tokenizers) och
// ONNX Runtime Web är samma byggstenar som Transformers.js använder.
import * as ort from 'onnxruntime-web/webgpu';
import { Tokenizer } from '@huggingface/tokenizers';
import { MODEL_BASE, MODEL_GRAPH, MODEL_WEIGHTS, MODEL_CACHE, OLD_CACHES, N_LAYER, N_HEAD, HEAD_DIM } from './config.js';

ort.env.wasm.wasmPaths = new URL('/ort/', self.location.origin).href;
ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
ort.env.logLevel = 'error';

let tokenizer = null;
let gpt2 = null;
let session = null;
let backend = null;
let cancelled = new Set();

const post = (msg, transfer) => self.postMessage(msg, transfer || []);

async function openCache() {
  if (!self.caches) return null;
  try {
    for (const name of OLD_CACHES) await caches.delete(name);
    return await caches.open(MODEL_CACHE);
  } catch { return null; }
}

// Läser en nedladdning rakt in i en enda buffert av rätt storlek. Ingen lista
// med bitar som sätts ihop efteråt, och ingen arrayBuffer(), som i Chromium
// tillfälligt tar ungefär dubbelt så mycket minne som filen.
async function readAll(res, total, onBytes) {
  const reader = res.body.getReader();
  let buf = new Uint8Array(total), loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (loaded + value.length > buf.length) {
      // Storleken var okänd eller fel. Hugging Face anger den, så det här är en reserv.
      const bigger = new Uint8Array(Math.max(2 * buf.length, loaded + value.length));
      bigger.set(buf.subarray(0, loaded)); buf = bigger;
    }
    buf.set(value, loaded); loaded += value.length;
    onBytes?.(loaded);
  }
  return buf.subarray(0, loaded);
}

async function roomFor(bytes) {
  try { const { quota, usage } = await navigator.storage.estimate(); return quota - usage > bytes * 1.2; } catch { return true; }
}

async function download(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Kunde inte hämta ${url} (${res.status})`);
  return res;
}

// Hämtar en fil så att den bara finns en gång i minnet åt gången. Första
// gången flödar den direkt till webbläsarens cache (till disken), och läses
// sedan tillbaka in i en buffert. Utan cache läses den direkt in i bufferten.
async function fetchFile(url, onProgress = () => {}) {
  const cache = await openCache();
  let res = cache && (await cache.match(url));
  const cached = !!res;
  if (!res) {
    res = await download(url);
    const total = Number(res.headers.get('content-length')) || 0;
    if (cache && total && (await roomFor(total))) {
      let loaded = 0;
      const count = new TransformStream({ transform(chunk, ctl) { loaded += chunk.length; onProgress(loaded, total, false); ctl.enqueue(chunk); } });
      try {
        await cache.put(url, new Response(res.body.pipeThrough(count), {
          headers: { 'content-type': 'application/octet-stream', 'content-length': String(total) },
        }));
        res = await cache.match(url);
        if (!res) throw new Error('Filen sparades inte');
      } catch (e) {
        // Sparandet misslyckades, till exempel för att disken var full. Hämta en gång till, utan cache.
        console.warn('Kunde inte spara i cachen:', e);
        try { await cache.delete(url); } catch {}
        res = await download(url);
      }
    }
  }
  const total = Number(res.headers.get('content-length')) || 0;
  const buf = await readAll(res, total, (n) => onProgress(n, total, cached));
  if (total && buf.length !== total) {
    if (cache) { try { await cache.delete(url); } catch {} }
    throw new Error(`${url} blev ofullständig (${buf.length} av ${total} byte)`);
  }
  return buf;
}

async function loadTokenizer() {
  if (tokenizer) return;
  const [tj, tc] = await Promise.all([
    fetch(MODEL_BASE + 'tokenizer.json').then((r) => r.json()),
    fetch(MODEL_BASE + 'tokenizer_config.json').then((r) => r.json()),
  ]);
  tokenizer = new Tokenizer(tj, tc);
}

async function hasWebGPU() {
  try { return !!(navigator.gpu && (await navigator.gpu.requestAdapter())); } catch { return false; }
}

// lean = snålt läge för mobil: vikterna görs om från 16 till 32 bitar varje
// gång modellen räknar, i stället för en gång för alla vid starten. Uppmätt i
// Chromium 2026-11-15, bara modellen: 1,2–1,3 GB i stället för 1,6–1,75 GB som
// mest, men varje ny bit tar ungefär dubbelt så lång tid (170–200 ms mot 88 ms).
// Toppvalen blir desamma (logits skiljer högst 0,00003, se scripts/split_onnx.py).
async function loadModel(id, prefer, lean) {
  if (session) return;
  let graph = await fetchFile(MODEL_BASE + MODEL_GRAPH);
  let weights = await fetchFile(MODEL_BASE + MODEL_WEIGHTS, (loaded, total, cached) =>
    post({ id, type: 'progress', loaded, total, cached }));
  post({ id, type: 'status', status: 'startar' });
  const options = lean
    ? { graphOptimizationLevel: 'disabled', enableCpuMemArena: false, enableMemPattern: false }
    : { graphOptimizationLevel: 'all' };
  const tryOrder = [];
  // WebGPU provas inte i snålt läge: det är oprovat på mobil och kan lägga minne både här och i grafikkortet.
  if (!lean && prefer !== 'wasm' && (await hasWebGPU())) tryOrder.push('webgpu');
  tryOrder.push('wasm');
  let lastErr;
  for (const ep of tryOrder) {
    try {
      session = await ort.InferenceSession.create(graph, {
        executionProviders: [ep], ...options,
        externalData: [{ path: MODEL_WEIGHTS.split('/').pop(), data: weights }],
      });
      backend = ep;
      // ONNX Runtime har nu en egen kopia av vikterna. Är det sista försöket behövs
      // sidans kopia inte längre, och den släpps innan provkörningen tar mer minne.
      if (ep === tryOrder[tryOrder.length - 1]) graph = weights = null;
      // Provkör en gång, så att fel i grafikkortet upptäcks här och inte mitt i berättelsen.
      await forward([2], null);
      graph = weights = null;
      return;
    } catch (e) {
      lastErr = e;
      // Släpp det misslyckade försöket helt innan nästa provas, så att två modeller inte ligger i minnet.
      if (session) { try { await session.release(); } catch {} }
      session = null; backend = null;
    }
  }
  throw lastErr;
}

function emptyPast() {
  const past = {};
  for (let i = 0; i < N_LAYER; i++) {
    for (const kv of ['key', 'value']) {
      past[`past_key_values.${i}.${kv}`] = new ort.Tensor('float32', new Float32Array(0), [1, N_HEAD, 0, HEAD_DIM]);
    }
  }
  return past;
}

// Ett varv genom modellen. ids = nya bitar, past = minnet av de tidigare bitarna.
// Ger logits för den sista positionen och ett uppdaterat minne.
async function forward(ids, state) {
  const pastLen = state ? state.len : 0;
  const n = ids.length;
  const feeds = {
    input_ids: new ort.Tensor('int64', BigInt64Array.from(ids.map(BigInt)), [1, n]),
    attention_mask: new ort.Tensor('int64', new BigInt64Array(pastLen + n).fill(1n), [1, pastLen + n]),
    position_ids: new ort.Tensor('int64', BigInt64Array.from({ length: n }, (_, i) => BigInt(pastLen + i)), [1, n]),
    ...(state ? state.past : emptyPast()),
  };
  const out = await session.run(feeds);
  const vocab = out.logits.dims[2];
  const all = out.logits.data;
  const last = new Float32Array(all.buffer, all.byteOffset + (n - 1) * vocab * 4, vocab).slice();
  const past = {};
  for (let i = 0; i < N_LAYER; i++) {
    for (const kv of ['key', 'value']) past[`past_key_values.${i}.${kv}`] = out[`present.${i}.${kv}`];
  }
  return { logits: last, state: { past, len: pastLen + n } };
}

function encode(text) {
  const enc = tokenizer.encode(text, { add_special_tokens: false });
  return { ids: Array.from(enc.ids), pieces: Array.from(enc.tokens) };
}

// Bitens text så som den ska visas: ▁ i början betyder mellanslag före.
function pieceOf(id) { return tokenizer.id_to_token(id); }

// Gör om logits till sannolikheter vid en viss temperatur.
function softmax(logits, temperature = 1) {
  let max = -Infinity;
  for (let i = 0; i < logits.length; i++) if (logits[i] > max) max = logits[i];
  const p = new Float64Array(logits.length); let sum = 0;
  for (let i = 0; i < logits.length; i++) { const v = Math.exp((logits[i] - max) / temperature); p[i] = v; sum += v; }
  for (let i = 0; i < p.length; i++) p[i] /= sum;
  return p;
}

function topK(probs, k) {
  const idx = [];
  for (let i = 0; i < probs.length; i++) {
    if (idx.length < k) { idx.push(i); if (idx.length === k) idx.sort((a, b) => probs[a] - probs[b]); }
    else if (probs[i] > probs[idx[0]]) {
      idx[0] = i; let j = 0;
      while (j + 1 < k && probs[idx[j]] > probs[idx[j + 1]]) { [idx[j], idx[j + 1]] = [idx[j + 1], idx[j]]; j++; }
    }
  }
  return idx.sort((a, b) => probs[b] - probs[a]).map((id) => ({ id, piece: pieceOf(id), p: probs[id] }));
}

// Liten slumpgenerator med frö (mulberry32), så att en körning går att upprepa.
function rng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function sample(probs, rand) {
  let r = rand(), acc = 0;
  for (let i = 0; i < probs.length; i++) { acc += probs[i]; if (r < acc) return i; }
  return probs.length - 1;
}

const BANNED = [0, 1, 2]; // <pad>, <unk>, <s> ska aldrig väljas

const handlers = {
  async loadTokenizer() { await loadTokenizer(); return { ok: true }; },
  async loadModel({ id, prefer, lean }) {
    await loadTokenizer(); await loadModel(id, prefer, lean);
    return { backend, threads: ort.env.wasm.numThreads };
  },
  async tokenize({ text }) { await loadTokenizer(); return encode(text); },
  // Jämförelse: samma text med GPT-2:s engelsktränade tokeniserare. Den arbetar
  // med byte, så en bokstav som ä kan delas mitt itu. Då visas bokstaven i den
  // bit där den blir hel, och biten före markeras med half.
  async tokenizeGpt2({ text }) {
    if (!gpt2) {
      const tj = await fetch(new URL('/data/gpt2-tokenizer.json', self.location.origin)).then((r) => r.json());
      gpt2 = new Tokenizer(tj, {});
    }
    const ids = Array.from(gpt2.encode(text, { add_special_tokens: false }).ids);
    const pieces = []; let prev = '';
    for (let i = 0; i < ids.length; i++) {
      const cur = gpt2.decode(ids.slice(0, i + 1), { clean_up_tokenization_spaces: false }).replace(/\uFFFD+$/, '');
      pieces.push({ text: cur.slice(prev.length), half: cur.length === prev.length });
      prev = cur;
    }
    return { pieces };
  },
  // De mest sannolika nästa bitarna efter en text. Skickar också med alla
  // logits, så att sidan kan räkna om sannolikheterna vid en annan temperatur.
  async next({ text, k = 10, temperature = 1 }) {
    const { ids, pieces } = encode(text);
    const t0 = performance.now();
    const { logits } = await forward(ids.length ? ids : [2], null);
    for (const b of BANNED) logits[b] = -Infinity;
    const probs = softmax(logits, temperature);
    return { ids, pieces, top: topK(probs, k), logits, ms: performance.now() - t0, _transfer: [logits.buffer] };
  },
  // Fortsätter texten en bit i taget. Varje steg skickas direkt till sidan.
  async generate({ id, text, maxNew = 30, temperature = 1, seed = Date.now(), k = 10, stopAtSentence = false }) {
    const rand = rng(seed);
    let { ids } = encode(text);
    let { logits, state } = await forward(ids.length ? ids : [2], null);
    const steps = [];
    for (let step = 0; step < maxNew; step++) {
      if (cancelled.has(id)) break;
      for (const b of BANNED) logits[b] = -Infinity;
      const probs = softmax(logits, temperature <= 0 ? 1 : temperature);
      let chosen;
      if (temperature <= 0) { chosen = 0; for (let i = 1; i < probs.length; i++) if (probs[i] > probs[chosen]) chosen = i; }
      else chosen = sample(probs, rand);
      if (chosen === 3) break; // <|endoftext|>
      const s = { step, id: chosen, piece: pieceOf(chosen), p: probs[chosen], top: topK(probs, k) };
      const prevText = step === 0 ? tokenizer.decode(ids, { skip_special_tokens: true }) : steps[step - 1].text;
      ids.push(chosen);
      s.text = tokenizer.decode(ids, { skip_special_tokens: true });
      s.added = s.text.slice(prevText.length);
      steps.push(s);
      post({ id, type: 'step', step: s });
      if (stopAtSentence && step > 3 && /[.!?]["”]?$/.test(s.text)) break;
      ({ logits, state } = await forward([chosen], state));
    }
    cancelled.delete(id);
    return { steps, text: tokenizer.decode(ids, { skip_special_tokens: true }) };
  },
  async cancel({ target }) { cancelled.add(target); return {}; },
};

self.onmessage = async (e) => {
  const { id, type } = e.data;
  try {
    const result = await handlers[type](e.data);
    const transfer = result._transfer; delete result._transfer;
    post({ id, type: 'done', result }, transfer);
  } catch (err) {
    post({ id, type: 'error', message: String(err && err.message || err) });
  }
};
