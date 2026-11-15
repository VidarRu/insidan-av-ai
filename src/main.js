// Huvudlogiken: scroll styr bilden, reglagen styr datan, och modellen i
// Web Workern räknar när den är laddad. Innan dess visas förberäknade exempel.
import { Stage, FIL_COLORS } from './scene/stage.js';
import { softmax } from './scene/shapes.js';
import { createModelClient } from './model/client.js';
import { MODEL_BASE, MODEL_FILE } from './model/config.js';

const $ = (sel) => document.querySelector(sel);
const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const params = new URLSearchParams(location.search);
// Visningsläge för storbild och publika dragningar: bara färdiga meningar.
const SHOW_MODE = params.has('visning');

const stage = new Stage($('#scene'), $('#labels'), { reduced: reducedQuery.matches });
const model = createModelClient();

const state = {
  text: 'Biblioteket i Västervik ligger',
  ids: [], pieces: [],
  preset: 0,            // index i examples.presets, eller -1 för egen text
  logits: null,         // Float32Array med 64 000 värden, eller null
  temperature: 0.7,
  modelReady: false, tokenizerReady: false,
  data: null,           // förberäknad data
  lang: 'sv', tokenizer: 'sw3',
  filActive: 0,
  runCount: 0,
};

// ---------- Hjälpfunktioner ----------
const fmtPct = (p) => {
  const v = p * 100;
  const s = v >= 10 ? v.toFixed(0) : v >= 1 ? v.toFixed(1) : v >= 0.1 ? v.toFixed(2) : '<0,1';
  return s.replace('.', ',') + ' %';
};
const fmtNum = (x, d = 2) => x.toFixed(d).replace('.', ',');
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// Visa en bit: ▁ i början betyder mellanslag före, <0x0A> är radbrytning
function pieceHtml(piece) {
  if (piece === '▁') return '<span class="sp">␣</span>';
  const m = /^<0x([0-9A-F]{2})>$/.exec(piece);
  if (m) return m[1] === '0A' ? '<span class="sp">↵</span>' : `<span class="sp">byte ${m[1]}</span>`;
  return (piece.startsWith('▁') ? '<span class="sp">␣</span>' : '') + esc(piece.replace(/^▁/, ''));
}
function pieceText(piece) { return piece === '▁' ? '␣' : /^<0x0A>$/.test(piece) ? '↵' : piece.replace(/^▁/, ''); }

function float16ToFloat32(u16) {
  const out = new Float32Array(u16.length);
  for (let i = 0; i < u16.length; i++) {
    const h = u16[i], s = h & 0x8000 ? -1 : 1, e = (h >> 10) & 0x1f, f = h & 0x3ff;
    out[i] = e === 0 ? s * 2 ** -14 * (f / 1024) : e === 31 ? (f ? NaN : s * Infinity) : s * 2 ** (e - 15) * (1 + f / 1024);
  }
  return out;
}

// ---------- Scroll: var i resan kameran är ----------
// Varje scen är en sträcka att scrolla. Den första delen av sträckan (data-in,
// räknat i skärmhöjder) är övergången från scenen före. Resten är scenens egen
// åkning, där q går från 0 till 1.
const scenes = [...document.querySelectorAll('.scene')];
const navLinks = [...document.querySelectorAll('.steps a')];
const sceneLines = scenes.map((s) => [...s.querySelectorAll('.line')]);
const clamp01 = (x) => Math.max(0, Math.min(1, x));
let currentStep = -1, currentLine = -1, scrollPos = window.scrollY;

function sceneRange(i) {
  const s = scenes[i], top = s.offsetTop, len = s.offsetHeight;
  const into = i === 0 ? 0 : parseFloat(s.dataset.in || '1') * window.innerHeight;
  // Den sista scenen går inte att scrolla förbi: en skärmhöjd av den blir aldrig åkning
  const hold = len - into - (i === scenes.length - 1 ? window.innerHeight : 0);
  return { top, into, hold: Math.max(1, hold) };
}

function locate(y) {
  let i = 0;
  while (i < scenes.length - 1 && y >= scenes[i + 1].offsetTop) i++;
  const r = sceneRange(i), local = y - r.top;
  if (local < r.into) return { k: i - 1, t: local / r.into, qa: 1, qb: 0 };
  return { k: i, t: 0, qa: clamp01((local - r.into) / r.hold), qb: 0 };
}

// Scrolla till en scen, förbi övergången in till den
function goTo(i, smooth = true) {
  const r = sceneRange(i);
  window.scrollTo({ top: i === 0 ? 0 : r.top + r.into + 2, behavior: smooth && !stage.reduced ? 'smooth' : 'instant' });
}
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#steg-"]');
  if (!a) return;
  e.preventDefault();
  const i = Number(a.getAttribute('href').slice(6));
  goTo(i);
  // Tangentbord och skärmläsare: flytta också fokus till scenens rubrik
  const h = scenes[i].querySelector('h1, h2');
  if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); }
});
// Den som tabbar till ett reglage i en scen som inte syns åker dit
scenes.forEach((s, i) => s.addEventListener('focusin', () => { if (i !== currentStep) goTo(i, false); }));

function updateProgress(dt) {
  if (stage.reduced) scrollPos = window.scrollY;
  else scrollPos += (window.scrollY - scrollPos) * Math.min(1, dt * 7);
  const at = locate(scrollPos);
  if (stage.reduced) {
    // Minskad rörelse: inga åkningar. Bilden byter mellan fasta lägen.
    if (at.t > 0) { if (at.t >= 0.5) { at.k++; at.qa = 0; } at.t = 0; }
    at.qa = Math.round(at.qa * 3) / 3;
  }
  Object.assign(stage, at);
  const step = at.t >= 0.5 ? at.k + 1 : at.k;
  const q = at.t > 0 ? (step === at.k ? 1 : 0) : at.qa;
  const lines = sceneLines[step];
  const line = lines.length ? Math.min(lines.length - 1, Math.floor(q * lines.length)) : -1;
  if (step !== currentStep) {
    currentStep = step; currentLine = -1;
    scenes.forEach((s, i) => s.classList.toggle('on', i === step));
    navLinks.forEach((a, i) => { if (i === step) a.setAttribute('aria-current', 'step'); else a.removeAttribute('aria-current'); });
    $('#yours').hidden = step === 0 || step === 8;
    if (state.data) onStep();
  }
  if (line !== currentLine) {
    currentLine = line;
    lines.forEach((l, i) => l.classList.toggle('on', i === line));
  }
  // Mitt i en övergång är bilden ren: texten tonas bort och kommer tillbaka när kameran är framme
  document.body.classList.toggle('travel', at.t > 0.12 && at.t < 0.62);
  if (step === 4) updateFilReadout();
  // I slutscenen visas först bilden med en rad text, sedan frågorna
  scenes[8].classList.toggle('late', step === 8 && (q > 0.45 || stage.reduced));
}

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  updateProgress(dt);
  stage.frame(dt);
  requestAnimationFrame(loop);
}

// ---------- Paus och minskad rörelse ----------
const pauseBtn = $('#pause');
function setPaused(p) {
  stage.paused = p;
  pauseBtn.setAttribute('aria-pressed', String(p));
  pauseBtn.textContent = p ? 'Starta rörelse' : 'Pausa rörelse';
}
pauseBtn.addEventListener('click', () => setPaused(!stage.paused));
reducedQuery.addEventListener('change', (e) => { stage.reduced = e.matches; setPaused(e.matches); });
setPaused(reducedQuery.matches);

// ---------- Modellens status ----------
const statusEl = $('#model-status'), statusText = $('#model-status-text'), loadBtn = $('#load-model');
function setStatus(stateName, text) { statusEl.dataset.state = stateName; statusText.textContent = text; }

async function startModel() {
  loadBtn.hidden = true;
  setStatus('loading', 'Hämtar modellen …');
  try {
    const info = await model.loadModel((m) => {
      if (m.type === 'progress') {
        setStatus('loading', m.cached ? 'Startar modellen …'
          : `Hämtar modellen: ${Math.round(m.loaded / 1e6)} av ${Math.round((m.total || 272e6) / 1e6)} MB`);
      } else setStatus('loading', 'Startar modellen …');
    }, params.get('backend') || undefined);
    state.modelReady = true;
    setStatus('ready', 'Modellen räknar i din webbläsare' + (info.backend === 'webgpu' ? ' (WebGPU)' : ''));
    document.body.classList.add('model-ready');
    await computeNext();
  } catch (e) {
    console.error(e);
    setStatus('error', 'Modellen kunde inte startas. Sidan visar förberäknade exempel.');
    loadBtn.hidden = false; loadBtn.textContent = 'Försök igen';
  }
}
loadBtn.addEventListener('click', startModel);

async function modelIsCached() {
  try { const c = await caches.open('inuti-sprakmodellen-v1'); return !!(await c.match(MODEL_BASE + MODEL_FILE)); } catch { return false; }
}

// ---------- Steg 1: meningen ----------
const sentenceInput = $('#sentence');
function renderPresets() {
  // De färdiga meningarna går att välja både i inledningen och vid solfjädern
  for (const box of [$('#presets'), $('#presets-next')]) {
    box.replaceChildren(...state.data.examples.presets.map((p, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = p.text; b.setAttribute('aria-pressed', String(state.preset === i));
      b.addEventListener('click', () => setSentence(p.text));
      return b;
    }));
  }
}

async function setSentence(text) {
  text = text.trim().replace(/\s+/g, ' ');
  if (!text) return;
  state.text = text;
  sentenceInput.value = text;
  state.preset = state.data.examples.presets.findIndex((p) => p.text === text);
  renderPresets();
  const preset = state.data.examples.presets[state.preset];
  if (state.tokenizerReady) {
    const r = await model.tokenize(text);
    state.ids = r.ids; state.pieces = r.pieces;
  } else if (preset) { state.ids = preset.ids; state.pieces = preset.pieces; }
  stage.setSentence(state.ids);
  // Etiketterna tänds en i taget när kameran når fram till biten
  stage.setLabels('galaxy', state.ids.slice(0, 24).map((id, i) => ({
    html: esc(pieceText(state.pieces[i])), cls: 'accent', getPos: () => stage.galaxyPosition(id),
    vis: () => clamp01((stage.pathU - i + 0.4) * 4),
  })));
  $('#next-context').textContent = text;
  $('#yours-text').textContent = text;
  // Vid solfjädern räcker den markerade knappen när meningen är en av de färdiga
  $('#next-context').parentElement.classList.toggle('sr-only', !!preset);
  // Språkbytet finns bara för de färdiga meningarna, där det finns en översättning
  const langSet = document.querySelector('input[name="lang"]').closest('fieldset');
  langSet.disabled = !preset;
  // Sökningen hörde till den förra meningens plats i rummet
  stage.setMarked(null); stage.setLabels('search', []);
  if (!preset && state.lang === 'en') { state.lang = 'sv'; document.querySelector('input[name="lang"][value="sv"]').checked = true; }
  renderTokens();
  $('#runs').replaceChildren();
  await computeNext();
}

$('#sentence-form').addEventListener('submit', (e) => { e.preventDefault(); setSentence(sentenceInput.value); });
if (SHOW_MODE) {
  sentenceInput.readOnly = true;
  $('#sentence-form button').hidden = true;
  $('#sentence-note').textContent = 'Visningsläge: välj en av de färdiga meningarna.';
  $('#hallu-input').readOnly = true;
}

// ---------- Steg 2: bitar ----------
async function renderTokens() {
  const preset = state.data.examples.presets[state.preset];
  const text = state.lang === 'en' && preset ? preset.en.text : state.text;
  let items; // { html, half }
  if (state.tokenizer === 'sw3') {
    let pieces;
    if (state.lang === 'en' && preset) pieces = preset.en.pieces;
    else pieces = state.pieces;
    items = pieces.map((p) => ({ html: pieceHtml(p) }));
  } else {
    let pieces;
    if (preset) pieces = state.lang === 'en' ? preset.gpt2_en : preset.gpt2;
    else if (state.tokenizerReady) pieces = (await model.tokenizeGpt2(text)).pieces;
    else pieces = [];
    items = pieces.map((p) => ({ half: p.half, html: p.half ? '½' : (p.text.startsWith(' ') ? '<span class="sp">␣</span>' : '') + esc(p.text.replace(/^ /, '')) }));
  }
  const n = items.length;
  $('#tok-count').textContent = `${n} ${n === 1 ? 'bit' : 'bitar'}`;
  $('#tok-which').textContent = state.tokenizer === 'sw3' ? 'med modellens egen nordiska tokeniserare' : 'med en tokeniserare byggd av engelsk text (GPT-2)';
  $('#tokens').innerHTML = items.map((it, i) =>
    `<span class="tok${it.half ? ' half' : ''}" style="--h:${(i * 47 + 200) % 360};--i:${i}">${it.html}</span>`).join('');
}
document.querySelectorAll('input[name="lang"]').forEach((r) => r.addEventListener('change', () => { state.lang = r.value; renderTokens(); }));
document.querySelectorAll('input[name="tokenizer"]').forEach((r) => r.addEventListener('change', () => { state.tokenizer = r.value; renderTokens(); }));

// ---------- Steg 3: galaxen ----------
const SUGGEST = ['måndag', 'glad', 'Stockholm', 'hund', 'bibliotek', 'röd'];
function wordIndex(word) {
  // Bara ord som är en enda bit finns som en egen punkt
  const { vocabIndex } = state.data;
  return vocabIndex.get('▁' + word) ?? vocabIndex.get('▁' + word.toLowerCase()) ?? vocabIndex.get('▁' + word[0].toUpperCase() + word.slice(1).toLowerCase());
}
async function search(word) {
  word = word.trim();
  const box = $('#neighbors'), msg = $('#search-msg');
  if (!word) return;
  msg.hidden = true;
  $('#search').value = word;
  const { vocab, words, wordRow, neighbors, neighborsSim } = state.data;
  const id = wordIndex(word);
  const row = id === undefined ? undefined : wordRow.get(id);
  if (row === undefined) {
    let extra = '';
    if (state.tokenizerReady) {
      const r = await model.tokenize(word);
      if (r.pieces.length > 1) extra = ` Modellen klyver det i ${r.pieces.length} bitar: ${r.pieces.map((p) => `<em>${esc(pieceText(p))}</em>`).join(' ')}.`;
    }
    msg.innerHTML = `<strong>${esc(word)}</strong> finns inte som en egen bit i modellens ordförråd.${extra} Rummet visar bara bitar. Prova ett vanligare ord.`;
    msg.hidden = false;
    box.innerHTML = '<p>Sök ett ord, så visas dess närmaste grannar här.</p>';
    stage.setMarked(null); stage.setLabels('search', []);
    return;
  }
  const ids = [id], sims = [];
  for (let k = 0; k < 8; k++) { ids.push(neighbors[row * 8 + k]); sims.push(neighborsSim[row * 8 + k] / 255); }
  box.innerHTML = `<p>Närmast <strong>${esc(pieceText(vocab[id]))}</strong> i modellens rum:</p><ol>` + ids.slice(1).map((nid, k) =>
    `<li><span>${esc(pieceText(vocab[nid]))}</span><span class="bar"><i style="width:${Math.round(sims[k] * 100)}%"></i></span><span>${fmtNum(sims[k])}</span></li>`).join('') +
    '</ol><p class="note">Talet är likheten mellan ordens vektorer. 1 betyder identiska.</p>';
  stage.setMarked(ids);
  stage.setLabels('search', ids.map((nid, k) => ({
    html: esc(pieceText(vocab[nid])) + (k ? `<small>${fmtNum(sims[k - 1])}</small>` : ''), cls: k === 0 ? 'focus' : '', getPos: () => stage.galaxyPosition(nid),
  })));
}
$('#search-form').addEventListener('submit', (e) => { e.preventDefault(); search($('#search').value); });
$('#search-suggestions').replaceChildren(...SUGGEST.map((w) => {
  const b = document.createElement('button'); b.type = 'button'; b.textContent = w;
  b.addEventListener('click', () => search(w)); return b;
}));

// ---------- Steg 4: fil ----------
const FIL_NAMES = ['mat', 'körfält', 'datorfil'];
function renderFil() {
  const fil = state.data.fil;
  const css = FIL_COLORS.map((c) => '#' + c.toString(16).padStart(6, '0'));
  $('#fil-pick').replaceChildren(...fil.sentences.map((s, i) => {
    const b = document.createElement('button'); b.type = 'button'; b.style.setProperty('--c', css[i]);
    b.textContent = s.text; b.setAttribute('aria-pressed', String(state.filActive === i));
    b.addEventListener('click', () => { state.filActive = i; renderFil(); });
    return b;
  }));
  const s = fil.sentences[state.filActive];
  // Attention från "fil" till de tidigare bitarna: medel över lagren, första biten borträknad
  const n = s.pieces.length, avg = new Array(n).fill(0);
  for (const layer of s.attention) for (let j = 0; j < n; j++) avg[j] += layer[j] / s.attention.length;
  let rest = 0; for (let j = 1; j < n - 1; j++) rest += avg[j];
  const share = avg.map((a, j) => (j === 0 || j === n - 1 ? null : a / rest));
  $('#fil-sentence').innerHTML = s.pieces.map((p, j) => {
    const cls = j === n - 1 ? 'target' : j === 0 ? 'first' : '';
    const h = share[j] === null ? 0 : Math.round(share[j] * 64);
    const lab = share[j] === null ? (j === 0 ? '–' : '') : Math.round(share[j] * 100) + ' %';
    return `<span class="filtok ${cls}" style="--c:${css[state.filActive]}"><small>${lab}</small><span class="w" style="height:${h}px"></span><span class="t">${esc(pieceText(p))}</span></span>`;
  }).join('');
  const pairs = [[0, 1], [0, 2], [1, 2]], lastRow = fil.cosine[fil.cosine.length - 1];
  $('#fil-table').innerHTML = pairs.map(([a, b], k) =>
    `<tr><th scope="row"><span class="pairdot" style="--c:${css[a]}"></span><span class="pairdot" style="--c:${css[b]}"></span> ${FIL_NAMES[a]} och ${FIL_NAMES[b]}</th><td>${fmtNum(fil.cosine[0][k])}</td><td>${fmtNum(lastRow[k])}</td></tr>`).join('');
  stage.setFil(fil.triangles, state.filActive);
  // I bilden: ordet vid varje tråds spets, och likheten mellan två trådar mitt emellan dem.
  // Likheten är uppmätt efter varje lager och visas för det lager kameran senast passerade.
  const row = () => fil.cosine[Math.min(fil.cosine.length - 1, Math.floor(stage.filL + 0.02))];
  const apart = () => clamp01(stage.filL * 1.5 - 0.6);
  stage.setLabels('fil', [
    ...fil.sentences.map((sent, i) => ({ html: `<span style="color:${css[i]}">fil</span> <small>${FIL_NAMES[i]}</small>`, cls: 'fil', getPos: () => stage.filPoint(i, stage.filL), dy: -16, vis: apart })),
    ...pairs.map(([a, b], k) => ({ cls: 'sim', text: () => fmtNum(row()[k]), vis: apart,
      getPos: () => stage.filPoint(a, stage.filL).lerp(stage.filPoint(b, stage.filL), 0.5) })),
    { html: '<span>fil</span> <small>samma tal i alla tre meningarna</small>', cls: 'fil', getPos: () => stage.filPoint(0, 0), dy: -16, vis: () => 1 - clamp01(stage.filL * 3) },
  ]);
}

let filShown = '';
function updateFilReadout() {
  const l = Math.min(12, Math.floor(stage.filL + 0.02));
  const text = l === 0 ? 'Före första lagret' : `Efter lager ${l} av 12`;
  if (text !== filShown) { filShown = text; $('#fil-readout').textContent = text; }
}

// ---------- Steg 5 och 6: sannolikheter och solfjäder ----------
function showDistribution(animate = true) {
  const list = $('#top-list');
  if (!state.logits) {
    list.innerHTML = '';
    list.insertAdjacentHTML('beforeend', `<li class="waiting" style="display:block">Den här meningen har inget förberäknat exempel. ${state.modelReady ? 'Räknar …' : 'Starta modellen, så räknar den fram sannolikheterna.'}</li>`);
    stage.setLabels('fan', []);
    return;
  }
  const { vocab } = state.data;
  // Listan visar modellens sannolikheter utan att temperaturen ändrat dem (temperatur 1)
  const base = softmax(state.logits, 1);
  const order = topIndices(base, 10);
  const max = base[order[0]];
  list.innerHTML = order.map((id) =>
    `<li><span class="piece">${pieceHtml(vocab[id])}</span><span class="bar"><i style="width:${Math.max(1, (base[id] / max) * 100)}%"></i></span><span class="pct">${fmtPct(base[id])}</span></li>`).join('');
  updateFan(animate);
}

function topIndices(probs, k) {
  const idx = [];
  for (let i = 0; i < probs.length; i++) {
    if (idx.length < k) { idx.push(i); if (idx.length === k) idx.sort((a, b) => probs[a] - probs[b]); }
    else if (probs[i] > probs[idx[0]]) {
      idx[0] = i; let j = 0;
      while (j + 1 < k && probs[idx[j]] > probs[idx[j + 1]]) { [idx[j], idx[j + 1]] = [idx[j + 1], idx[j]]; j++; }
    }
  }
  return idx.sort((a, b) => probs[b] - probs[a]);
}

// Solfjädern följer temperaturen i steg 6, annars visar den temperatur 1
function updateFan(animate = true) {
  if (!state.logits) return;
  const useT = currentStep >= 6 ? Math.max(0.05, state.temperature) : 1;
  if (state.fanT === useT && state.fanLogits === state.logits) return;
  state.fanT = useT; state.fanLogits = state.logits;
  const probs = softmax(state.logits, useT);
  stage.setProbabilities(probs, animate);
  const { vocab } = state.data;
  const order = topIndices(probs, 10);
  stage.setLabels('fan', order.map((id, r) => ({
    html: `<b>${esc(pieceText(vocab[id]))}</b><small>${fmtPct(probs[id])}</small>`, cls: r === 0 ? 'top1' : '',
    getPos: () => stage.fanPosition(id), dy: -4,
  })));
}

let nextToken = 0;
async function computeNext() {
  const my = ++nextToken;
  const preset = state.data.examples.presets[state.preset];
  if (preset) state.logits = state.data.presetLogits[preset.logitsRow];
  else if (!state.modelReady) state.logits = null;
  showDistribution();
  if (state.modelReady) {
    const r = await model.next(state.text, { k: 10 });
    if (my !== nextToken) return;
    state.logits = r.logits;
    showDistribution();
  }
}

// ---------- Steg 6: slumpen ----------
const tempInput = $('#temperature');
tempInput.addEventListener('input', () => {
  state.temperature = Number(tempInput.value);
  $('#temperature-out').textContent = fmtNum(state.temperature, 1);
  updateFan();
});

function addRun(temperature, live) {
  const li = document.createElement('li');
  li.innerHTML = `<span class="meta">temperatur ${fmtNum(temperature, 1)}${live ? '' : ' · förberäknat exempel'}</span><span class="start"></span><span class="cont"></span>`;
  li.querySelector('.start').textContent = state.text;
  const list = $('#runs');
  list.prepend(li);
  while (list.children.length > 2) list.lastChild.remove();
  return li.querySelector('.cont');
}

async function typeOut(el, steps, startLen, render) {
  for (const s of steps) {
    render(el, s, startLen);
    if (!stage.reduced) await new Promise((r) => setTimeout(r, 45));
  }
}

const runBtn = $('#run-again');
runBtn.addEventListener('click', async () => {
  runBtn.disabled = true;
  const T = state.temperature;
  try {
    if (state.modelReady) {
      const el = addRun(T, true);
      await model.generate(state.text, { maxNew: 28, temperature: T, seed: (Math.random() * 2 ** 31) | 0 }, (s) => { el.textContent = s.text.slice(state.text.length); });
    } else {
      const preset = state.data.examples.presets[state.preset];
      if (!preset) { const el = addRun(T, false); el.textContent = ' … starta modellen för att fortsätta din egen mening.'; return; }
      // Närmaste förberäknade temperatur, och en ny körning för varje tryck
      const temps = [...new Set(preset.runs.map((r) => r.temperature))];
      const nearest = temps.reduce((a, b) => (Math.abs(b - T) < Math.abs(a - T) ? b : a));
      const runs = preset.runs.filter((r) => r.temperature === nearest);
      const run = runs[state.runCount++ % runs.length];
      const el = addRun(nearest, false);
      await typeOut(el, run.steps, state.text.length, (e, s, n) => { e.textContent = s.text.slice(n); });
    }
  } finally { runBtn.disabled = false; runBtn.textContent = 'Kör igen'; }
});

// ---------- Steg 7: hallucinationen ----------
const halluText = $('#hallu-text');
function halluStart(text) {
  halluText.innerHTML = '<span class="start"></span>';
  halluText.firstChild.textContent = text;
}
function halluAppend(added, p) {
  const span = document.createElement('span');
  span.className = 'p'; span.style.setProperty('--p', Math.sqrt(p).toFixed(3));
  span.title = `Sannolikhet ${fmtPct(p)}`;
  span.textContent = added;
  halluText.appendChild(span);
}
let halluCount = 0, halluBusy = false;
async function runHallu() {
  if (halluBusy) return;
  halluBusy = true; $('#hallu-run').disabled = true;
  const text = $('#hallu-input').value.trim();
  const pre = state.data.examples.hallucination.find((h) => h.text === text);
  try {
    halluStart(text);
    if (state.modelReady) {
      await model.generate(text, { maxNew: 40, temperature: 0.7, seed: (Math.random() * 2 ** 31) | 0 }, (s) => halluAppend(s.added, s.p));
    } else if (pre) {
      const run = pre.runs[1 + (halluCount++ % (pre.runs.length - 1))];
      let prev = text;
      for (const s of run.steps) {
        halluAppend(s.text.slice(prev.length), s.p); prev = s.text;
        if (!stage.reduced) await new Promise((r) => setTimeout(r, 55));
      }
    } else {
      halluText.insertAdjacentHTML('beforeend', '<span> … starta modellen för att fortsätta din egen mening.</span>');
    }
  } finally { halluBusy = false; $('#hallu-run').disabled = false; $('#hallu-run').textContent = 'Kör igen'; }
}
$('#hallu-form').addEventListener('submit', (e) => { e.preventDefault(); runHallu(); });

// När en scen kommer in i bild
let halluShown = false;
function onStep() {
  updateFan();
  if (currentStep === 7 && !halluShown) { halluShown = true; runHallu(); }
}

// ---------- Start ----------
async function loadData() {
  // En fil som saknas ska ge ett tydligt fel, inte ett felmeddelande som läses som data.
  const get = (name) => fetch(`/data/${name}`).then((r) => { if (!r.ok) throw new Error(`/data/${name} saknas (${r.status})`); return r; });
  const bin = (name) => get(name).then((r) => r.arrayBuffer());
  const json = (name) => get(name).then((r) => r.json());
  const [vocab, galaxy, words, neighbors, neighborsSim, examples, exLogits, fil] = await Promise.all([
    json('vocab.json'), bin('galaxy.bin'), bin('words.bin'), bin('neighbors.bin'), bin('neighbors_sim.bin'),
    json('examples.json'), bin('examples_logits.bin'), json('fil.json'),
  ]);
  const wordsArr = new Uint16Array(words);
  const all = float16ToFloat32(new Uint16Array(exLogits));
  const rows = all.length / vocab.length;
  return {
    vocab, vocabIndex: new Map(vocab.map((v, i) => [v, i])),
    galaxy: new Int16Array(galaxy), words: wordsArr, wordRow: new Map(Array.from(wordsArr, (id, row) => [id, row])),
    neighbors: new Uint16Array(neighbors), neighborsSim: new Uint8Array(neighborsSim),
    examples, fil,
    presetLogits: Array.from({ length: rows }, (_, r) => all.subarray(r * vocab.length, (r + 1) * vocab.length)),
  };
}

async function init() {
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  requestAnimationFrame(loop);
  state.data = await loadData();
  stage.setGalaxy(state.data.galaxy);
  renderFil();
  await setSentence(state.text);
  halluStart($('#hallu-input').value);
  onStep();
  const m = /^#steg-(\d)$/.exec(location.hash);
  if (m) goTo(Number(m[1]), false);
  window.__ready = true;

  // Tokeniseraren är liten och laddas alltid. Då klyvs också egen text direkt.
  model.loadTokenizer().then(() => { state.tokenizerReady = true; }).catch(() => {});

  // Modellen är stor. På mobil och vid datasparläge hämtas den bara om besökaren ber om det.
  const small = window.matchMedia('(max-width: 820px), (pointer: coarse)').matches;
  const saveData = navigator.connection && navigator.connection.saveData;
  if (params.has('ingenmodell')) { setStatus('idle', 'Visar förberäknade exempel'); loadBtn.hidden = false; }
  else if ((await modelIsCached()) || (!small && !saveData)) startModel();
  else { setStatus('idle', 'Visar förberäknade exempel'); loadBtn.hidden = false; }
}

init().catch((e) => { console.error(e); setStatus('error', 'Något gick fel när sidan laddades.'); });
window.__stage = stage; window.__state = state;
