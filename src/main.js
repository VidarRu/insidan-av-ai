// Huvudlogiken: scroll styr bilden, reglagen styr datan, och modellen i
// Web Workern räknar när den är laddad. Innan dess visas förberäknade exempel.
import { Stage, FIL_COLORS } from './scene/stage.js';
import { softmax } from './scene/shapes.js';
import { createModelClient } from './model/client.js';
import { MODEL_BASE, MODEL_WEIGHTS, MODEL_CACHE, OLD_CACHES } from './model/config.js';

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
const LAST_STEP = scenes.length - 1, RATE_STEP = 8, HALLU_STEP = 10;
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
    $('#yours').hidden = step === 0 || step === LAST_STEP;
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
  if (step === RATE_STEP) setRateAmount(q);
  scenes[LAST_STEP].classList.toggle('late', step === LAST_STEP && (q > 0.45 || stage.reduced));
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
const statusEl = $('#model-status'), statusText = $('#model-status-text'), loadBtn = $('#load-model'), noteEl = $('#model-note');
function setStatus(stateName, text) { statusEl.dataset.state = stateName; statusText.textContent = text; }
function setNote(text) { $('#model-note-text').textContent = text || ''; noteEl.hidden = !text; }
$('#model-note-close').addEventListener('click', () => setNote(''));

// Mobil och surfplatta. Där startar modellen aldrig av sig själv, och den körs i
// ett snålare läge som tar mindre minne men räknar långsammare (se worker.js).
const small = window.matchMedia('(max-width: 820px), (pointer: coarse)').matches;
const lean = small || params.has('snal');

// När en telefon får slut på minne stänger den hela fliken, och ingen felhantering
// hinner köras. Därför läggs en lapp i webbläsarens lagring innan modellen startar,
// och tas bort när starten är klar eller har misslyckats på vanligt sätt. Finns
// lappen kvar när sidan öppnas nästa gång, blev förra försöket aldrig klart.
const GUARD = 'insidan-modellen-startar';
const guard = {
  set() { try { localStorage.setItem(GUARD, String(Date.now())); } catch {} },
  clear() { try { localStorage.removeItem(GUARD); } catch {} },
  wasLeft() { try { return localStorage.getItem(GUARD) !== null; } catch { return false; } },
};

const CALM = 'Sidan visar i stället färdiga exempel, uträknade i förväg med samma modell. Bara egna meningar kräver modellen.';

async function startModel() {
  loadBtn.hidden = true;
  setNote('');
  setStatus('loading', 'Hämtar modellen …');
  guard.set();
  try {
    const info = await model.loadModel((m) => {
      if (m.type === 'progress') {
        setStatus('loading', m.cached ? 'Läser in modellen …'
          : `Hämtar modellen: ${Math.round(m.loaded / 1e6)} av ${Math.round((m.total || 272e6) / 1e6)} MB`);
      } else setStatus('loading', 'Startar modellen …');
    }, params.get('backend') || undefined, lean);
    guard.clear();
    state.modelReady = true;
    setStatus('ready', 'Modellen räknar i din webbläsare' + (info.backend === 'webgpu' ? ' (WebGPU)' : ''));
    if (lean) setNote('Här räknar modellen långsammare än på en dator, för att ta mindre minne.');
    document.body.classList.add('model-ready');
    await computeNext();
  } catch (e) {
    guard.clear();
    console.error(e);
    setStatus('idle', 'Visar färdiga exempel');
    setNote('Modellen gick inte att starta här. ' + CALM);
    loadBtn.hidden = false; loadBtn.textContent = 'Försök igen';
  }
}
loadBtn.addEventListener('click', startModel);

async function modelIsCached() {
  try {
    for (const name of OLD_CACHES) await caches.delete(name); // den gamla filen behövs inte längre
    const c = await caches.open(MODEL_CACHE);
    return !!(await c.match(MODEL_BASE + MODEL_WEIGHTS));
  } catch { return false; }
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
  $('#bias-form').hidden = true; $('#lean-form').hidden = true;
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

// ---------- Steg 7 till 9: skevheten, efterträningen och medhållet ----------
// De färdiga exemplen är sparade som de 4 096 mest sannolika bitarna per mening.
// Resten av sannolikheten fördelas jämnt på de övriga bitarna.
function presetProbs(row) {
  const { extra, extraIds, extraProbs, vocab } = state.data, K = extra.k, n = vocab.length;
  let sum = 0;
  for (let j = 0; j < K; j++) sum += extraProbs[row * K + j];
  const p = new Float64Array(n).fill(Math.max(0, 1 - sum) / (n - K));
  for (let j = 0; j < K; j++) p[extraIds[row * K + j]] = extraProbs[row * K + j];
  return p;
}
async function liveProbs(text) { return softmax((await model.next(text, { k: 1 })).logits, 1); }
const topWords = (probs, k = 5) => topIndices(probs, k).map((id) => `${esc(pieceText(state.data.vocab[id]))} ${fmtPct(probs[id])}`).join(', ');
const quoteHtml = (text) => esc(text).replace(/\n/g, '<br>');
// Etiketter vid en solfjäder: de mest sannolika bitarna, och de som ska lyftas fram
function fanLabels(probs, getPos, { k = 5, highlight = [], pct = true, mark = () => '' } = {}) {
  const { vocab } = state.data;
  const ids = topIndices(probs, k);
  for (const id of highlight) if (!ids.includes(id)) ids.push(id);
  return ids.map((id, r) => ({
    html: `<b>${esc(pieceText(vocab[id]))}</b>${pct ? `<small>${fmtPct(probs[id])}</small>` : ''}${mark(id)}`,
    cls: highlight.includes(id) ? 'hl' : r === 0 ? 'top1' : '', getPos: () => getPos(id), dy: -4,
  }));
}
// Meningen står över sin solfjäder
function caption(name, side, html) {
  const [x, y] = stage.fanOffset(name, side);
  return { html, cls: 'cap', getPos: () => stage.fanPosition(0, 'fan').set(x, y + 1.32, stage.fanPosition(0, 'fan').z) };
}
function chip(text, pressed, onClick) {
  const b = document.createElement('button');
  b.type = 'button'; b.textContent = text; b.setAttribute('aria-pressed', String(pressed));
  b.addEventListener('click', onClick);
  return b;
}

// Steg 7: två yrken, samma mening
const bias = { pair: 0, left: null, right: null }; // left och right: { word, text, probs }
function biasEntry(word) {
  const w = state.data.extra.bias.words[word];
  return { word, text: w.text, probs: presetProbs(w.row) };
}
function renderBias(animate = true) {
  const { extra, vocabIndex } = state.data;
  const hon = vocabIndex.get('▁hon'), han = vocabIndex.get('▁han');
  $('#bias-pairs').replaceChildren(...extra.bias.pairs.map(([a, b], i) =>
    chip(`${a} och ${b}`, bias.pair === i, () => { bias.pair = i; bias.left = biasEntry(a); bias.right = biasEntry(b); $('#bias-msg').hidden = true; renderBias(); })));
  stage.setProbabilities(bias.left.probs, animate, 'bias');
  stage.setSideProbabilities('bias', bias.right.probs, animate);
  stage.setLabels('bias.a', fanLabels(bias.left.probs, (id) => stage.fanPosition(id, 'bias'), { highlight: [hon, han] }));
  stage.setLabels('bias.b', fanLabels(bias.right.probs, (id) => stage.sidePosition(id, 'bias'), { highlight: [hon, han] }));
  stage.setLabels('bias.cap', [bias.left, bias.right].map((e, i) => caption('bias', i ? 1 : -1, `${esc(e.text)} …`)));
  $('#bias-table').innerHTML = [bias.left, bias.right].map((e) =>
    `<tr><th scope="row">${esc(e.text)}</th><td>${fmtPct(e.probs[hon])}</td><td>${fmtPct(e.probs[han])}</td><td>${topWords(e.probs)}</td></tr>`).join('');
}
$('#bias-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('#bias-msg');
  let word = $('#bias-input').value.trim().replace(/\s+/g, ' ');
  if (!word) return;
  if (!state.modelReady) { msg.textContent = 'Egna ord kräver att modellen är startad. Välj ett av de färdiga paren så länge.'; msg.hidden = false; return; }
  word = word[0].toUpperCase() + word.slice(1);
  const text = state.data.extra.bias.template.replace('{}', word);
  msg.textContent = 'Räknar …'; msg.hidden = false;
  try {
    bias.left = { word, text, probs: await liveProbs(text) };
    bias.pair = -1; msg.hidden = true;
    renderBias();
  } catch { msg.textContent = 'Det gick inte att räkna just nu.'; }
});

// Steg 8: efterträningen. Solfjädern före är uträknad. Förändringen är ett
// påhittat exempel: några bitar får tummen upp och några tummen ner, och deras
// sannolikheter flyttas i takt med scrollen. Inga siffror visas.
const RATE_UP = ['Ja', 'Absolut', 'Självklart', 'Javisst', 'Gärna'], RATE_DOWN = ['Nej', 'Varför', 'Inte', 'Aldrig'];
const RATE_STRENGTH = 3.5; // hur mycket en tumme flyttar en bit vid full förändring (i logit-enheter)
const rate = { base: null, up: [], down: [], amount: -1 };
function setRateAmount(q) {
  if (!rate.base) return;
  const amount = Math.round(clamp01((q - 0.22) / 0.56) * 8) / 8;
  if (amount === rate.amount) return;
  const first = rate.amount < 0;
  rate.amount = amount;
  const p = Float64Array.from(rate.base);
  for (const id of rate.up) p[id] *= Math.exp(RATE_STRENGTH * amount);
  for (const id of rate.down) p[id] *= Math.exp(-RATE_STRENGTH * amount);
  let sum = 0; for (let i = 0; i < p.length; i++) sum += p[i];
  for (let i = 0; i < p.length; i++) p[i] /= sum;
  stage.setProbabilities(p, !first, 'rate');
  const rated = [...rate.up, ...rate.down];
  const thumb = (id) => (rate.up.includes(id) ? '<span class="th">👍</span>' : rate.down.includes(id) ? '<span class="th">👎</span>' : '');
  stage.setLabels('rate.words', fanLabels(p, (id) => stage.fanPosition(id, 'rate'), { k: 7, highlight: rated.filter((id) => p[id] > 0.004), pct: false, mark: thumb }));
  // Tummar som faller in mot de betygsatta bitarna medan solfjädern formas om
  const falling = amount > 0 && amount < 1;
  stage.setLabels('rate.rain', !falling ? [] : rated.flatMap((id, i) => [0, 0.5].map((phase) => {
    const f = () => (stage.time * 0.2 + i * 0.37 + phase) % 1;
    return { html: rate.up.includes(id) ? '👍' : '👎', cls: 'thumb', vis: () => Math.sin(Math.PI * f()),
      getPos: () => { const v = stage.fanPosition(id, 'rate'), k = 1 - f(); v.y += 1.6 * k; v.x += 0.5 * k * Math.sin(i * 2.1); return v; } };
  })));
  $('#rate-readout').textContent = amount === 0 ? 'Före efterträningen' : amount === 1 ? 'Efter efterträningen (påhittat exempel)' : 'Betygen kommer in …';
}

// Steg 9: samma fråga utan åsikt och med åsikt
const tilt = { topic: 0, side: 'for', entries: null }; // entries: { name, neutral, for, against } med { text, probs }
function leanPreset(i) {
  const t = state.data.extra.lean.topics[i];
  const e = { name: t.name };
  for (const k of ['neutral', 'for', 'against']) e[k] = { text: t[k].text, probs: presetProbs(t[k].row) };
  return e;
}
function renderLean(animate = true) {
  const { extra } = state.data, e = tilt.entries, right = e[tilt.side];
  $('#lean-topics').replaceChildren(...extra.lean.topics.map((t, i) =>
    chip(t.name, tilt.topic === i, () => { tilt.topic = i; tilt.entries = leanPreset(i); $('#lean-msg').hidden = true; renderLean(); })));
  stage.setProbabilities(e.neutral.probs, animate, 'lean');
  stage.setSideProbabilities('lean', right.probs, animate);
  stage.setLabels('lean.a', fanLabels(e.neutral.probs, (id) => stage.fanPosition(id, 'lean')));
  stage.setLabels('lean.b', fanLabels(right.probs, (id) => stage.sidePosition(id, 'lean')));
  stage.setLabels('lean.cap', [e.neutral, right].map((x, i) => caption('lean', i ? 1 : -1, esc(x.text.split('\n')[0]))));
  $('#lean-context').textContent = e.neutral.text.split('\n')[1];
  $('#lean-note').hidden = tilt.side !== 'against';
  const names = { neutral: 'Utan åsikt', for: 'Med åsikten jättebra idé', against: 'Med åsikten jättedålig idé' };
  $('#lean-table').innerHTML = ['neutral', 'for', 'against'].map((k) => {
    const [q, a] = e[k].text.split('\n');
    return `<tr><th scope="row">${names[k]}<br><small>${esc(q)}</small></th><td>${esc(a)} …</td><td>${topWords(e[k].probs)}</td></tr>`;
  }).join('');
}
document.querySelectorAll('input[name="lean"]').forEach((r) => r.addEventListener('change', () => { tilt.side = r.value; renderLean(); }));
$('#lean-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('#lean-msg');
  const name = $('#lean-input').value.trim().replace(/\s+/g, ' ');
  if (!name) return;
  if (!state.modelReady) { msg.textContent = 'Egna ämnen kräver att modellen är startad. Välj ett av de färdiga ämnena så länge.'; msg.hidden = false; return; }
  msg.textContent = 'Räknar tre frågor …'; msg.hidden = false;
  try {
    const entries = { name };
    for (const [k, t] of Object.entries(state.data.extra.lean.templates)) {
      const text = t.replaceAll('{0}', name);
      entries[k] = { text, probs: await liveProbs(text) };
    }
    tilt.entries = entries; tilt.topic = -1; msg.hidden = true;
    renderLean();
  } catch { msg.textContent = 'Det gick inte att räkna just nu.'; }
});

function initExtra() {
  const { extra, vocabIndex } = state.data;
  const [a, b] = extra.bias.pairs[0];
  bias.left = biasEntry(a); bias.right = biasEntry(b);
  renderBias(false);
  rate.base = presetProbs(extra.rate.row);
  const ids = (words) => words.map((w) => vocabIndex.get('▁' + w)).filter((id) => id !== undefined);
  rate.up = ids(RATE_UP); rate.down = ids(RATE_DOWN);
  $('#rate-context').innerHTML = quoteHtml(extra.rate.text);
  setRateAmount(0);
  tilt.entries = leanPreset(0);
  renderLean(false);
}

// När en scen kommer in i bild
let halluShown = false;
function onStep() {
  updateFan();
  if (currentStep === HALLU_STEP && !halluShown) { halluShown = true; runHallu(); }
}

// ---------- Start ----------
async function loadData() {
  // En fil som saknas ska ge ett tydligt fel, inte ett felmeddelande som läses som data.
  const get = (name) => fetch(`/data/${name}`).then((r) => { if (!r.ok) throw new Error(`/data/${name} saknas (${r.status})`); return r; });
  const bin = (name) => get(name).then((r) => r.arrayBuffer());
  const json = (name) => get(name).then((r) => r.json());
  const [vocab, galaxy, words, neighbors, neighborsSim, examples, exLogits, fil, extra, extraIds, extraProbs] = await Promise.all([
    json('vocab.json'), bin('galaxy.bin'), bin('words.bin'), bin('neighbors.bin'), bin('neighbors_sim.bin'),
    json('examples.json'), bin('examples_logits.bin'), json('fil.json'),
    json('extra.json'), bin('extra_ids.bin'), bin('extra_probs.bin'),
  ]);
  const wordsArr = new Uint16Array(words);
  const all = float16ToFloat32(new Uint16Array(exLogits));
  const rows = all.length / vocab.length;
  return {
    vocab, vocabIndex: new Map(vocab.map((v, i) => [v, i])),
    galaxy: new Int16Array(galaxy), words: wordsArr, wordRow: new Map(Array.from(wordsArr, (id, row) => [id, row])),
    neighbors: new Uint16Array(neighbors), neighborsSim: new Uint8Array(neighborsSim),
    examples, fil,
    extra, extraIds: new Uint16Array(extraIds), extraProbs: new Float32Array(extraProbs),
    presetLogits: Array.from({ length: rows }, (_, r) => all.subarray(r * vocab.length, (r + 1) * vocab.length)),
  };
}

async function init() {
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  requestAnimationFrame(loop);
  state.data = await loadData();
  stage.setGalaxy(state.data.galaxy);
  renderFil();
  initExtra();
  await setSentence(state.text);
  halluStart($('#hallu-input').value);
  onStep();
  const m = /^#steg-(\d+)$/.exec(location.hash);
  if (m && Number(m[1]) <= LAST_STEP) goTo(Number(m[1]), false);
  window.__ready = true;

  // Tokeniseraren är liten och laddas alltid. Då klyvs också egen text direkt.
  model.loadTokenizer().then(() => { state.tokenizerReady = true; }).catch(() => {});

  // Modellen är stor. På mobil och surfplatta startar den bara när besökaren
  // trycker på knappen, även om den redan är sparad: sidan ska alltid gå att öppna.
  // På dator startar den direkt, utom i datasparläge (om den inte redan är sparad).
  const saveData = navigator.connection && navigator.connection.saveData;
  const cached = await modelIsCached();
  const leftOver = guard.wasLeft();
  guard.clear();
  setStatus('idle', 'Visar färdiga exempel');
  if (cached) loadBtn.textContent = 'Starta modellen (redan hämtad)';
  if (leftOver) {
    setNote('Förra försöket att starta modellen blev inte klart, troligen för att minnet tog slut. ' + CALM);
    loadBtn.textContent = 'Försök igen';
    loadBtn.hidden = false;
  } else if (params.has('ingenmodell') || small || (saveData && !cached)) loadBtn.hidden = false;
  else startModel();
}

init().catch((e) => { console.error(e); setStatus('error', 'Något gick fel när sidan laddades.'); });
window.__stage = stage; window.__state = state;
