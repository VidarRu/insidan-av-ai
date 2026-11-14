import { createModelClient } from './model/client.js';

const $ = (id) => document.getElementById(id);
const model = createModelClient();
const status = (t) => { $('status').textContent = t; };
const show = (piece) => piece.replace(/^▁/, '␣');

async function tokens() {
  const { ids, pieces } = await model.tokenize($('text').value);
  $('tokens').replaceChildren(...pieces.map((p, i) => {
    const s = document.createElement('span'); s.className = 'tok'; s.textContent = show(p); s.title = `nummer ${ids[i]}`; return s;
  }));
}

async function next() {
  const r = await model.next($('text').value, { k: 10 });
  $('top').innerHTML = '<tr><th>Bit</th><th>Sannolikhet</th><th></th></tr>' + r.top.map((t) =>
    `<tr><td><span class="tok"></span></td><td>${(t.p * 100).toFixed(1).replace('.', ',')} %</td><td><span class="bar" style="width:${t.p * 300}px"></span></td></tr>`).join('');
  $('top').querySelectorAll('.tok').forEach((el, i) => { el.textContent = show(r.top[i].piece); });
  status(`Klart. Uträkningen tog ${Math.round(r.ms)} ms (${window.__backend}).`);
  window.__last = r;
}

$('text').addEventListener('input', tokens);
$('run').addEventListener('click', next);
$('gen').addEventListener('click', async () => {
  $('out').textContent = '';
  const t0 = performance.now(); let n = 0;
  const r = await model.generate($('text').value, { maxNew: 30, temperature: Number($('temp').value) }, (s) => { n++; $('out').textContent = s.text; });
  status(`Klart. ${n} bitar på ${Math.round(performance.now() - t0)} ms (${window.__backend}).`);
  window.__gen = r;
});

try {
  await model.loadTokenizer();
  await tokens();
  status('Tokeniseraren är laddad. Hämtar modellen…');
  const prefer = new URLSearchParams(location.search).get('backend') || undefined;
  const info = await model.loadModel((m) => {
    if (m.type === 'progress') status(m.cached ? 'Modellen finns sparad i webbläsaren. Startar…' : `Hämtar modellen: ${Math.round(m.loaded / 1e6)} av ${Math.round(m.total / 1e6)} MB`);
    else status('Startar modellen…');
  }, prefer);
  window.__backend = info.backend === 'webgpu' ? 'WebGPU' : `WebAssembly, ${info.threads} trådar`;
  status(`Modellen är laddad (${window.__backend}).`);
  await next();
  window.__ready = true;
} catch (e) {
  status('Fel: ' + e.message); window.__error = e.message; console.error(e);
}
