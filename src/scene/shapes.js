// Formerna som partiklarna ordnar sig i. Varje form är en Float32Array med
// x, y, z för var och en av de 64 000 partiklarna. Partikel nummer i är alltid
// bit nummer i i modellens ordförråd.

export const N = 64000;
export const N_LAYERS = 12;

// ---------- Slump och brus med frö, så att formerna blir likadana varje gång ----------
function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash3(x, y, z) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Mjukt brus i tre dimensioner (värdebrus), ungefär -1..1
function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const l = (a, b, t) => a + (b - a) * t;
  const c = (dx, dy, dz) => hash3(xi + dx, yi + dy, zi + dz);
  return l(l(l(c(0, 0, 0), c(1, 0, 0), u), l(c(0, 1, 0), c(1, 1, 0), u), v),
           l(l(c(0, 0, 1), c(1, 0, 1), u), l(c(0, 1, 1), c(1, 1, 1), u), v), w) * 2 - 1;
}

function randomDirection(rand) {
  const z = rand() * 2 - 1, a = rand() * Math.PI * 2, r = Math.sqrt(1 - z * z);
  return [r * Math.cos(a), z, r * Math.sin(a)];
}

// ---------- Hjärnan ----------
// Koordinater: x = vänster/höger, y = upp, z = fram (pannan) / bak.
function cortexRadius(dx, dy, dz) {
  // Grundform: en avlång, lite tillplattad ellipsoid
  const ax = 0.78, ay = 0.68, az = 1.0;
  let r = 1 / Math.sqrt((dx * dx) / (ax * ax) + (dy * dy) / (ay * ay) + (dz * dz) / (az * az));
  // Plattare undersida
  if (dy < 0) r *= 1 - 0.22 * Math.pow(-dy, 1.5);
  // Tinningloberna buktar ut på sidorna, lite nedanför mitten och framåt
  const temporal = Math.exp(-(((Math.abs(dx) - 0.75) ** 2) / 0.08 + ((dy + 0.35) ** 2) / 0.06 + ((dz - 0.15) ** 2) / 0.25));
  r *= 1 + 0.16 * temporal;
  // Pannloben är något smalare än nackloben
  r *= 1 - 0.06 * dz;
  // Skåran mellan hjärnhalvorna
  r *= 1 - 0.2 * Math.exp(-((dx / 0.085) ** 2)) * (0.35 + 0.65 * Math.max(0, dy + 0.3));
  return r;
}

// Vindlingarna: åsar som slingrar sig. Ger ett värde 0 (fåra) till 1 (ås).
function gyri(x, y, z) {
  const wx = x + 0.35 * noise3(x * 2.1 + 7, y * 2.1, z * 2.1);
  const wy = y + 0.35 * noise3(x * 2.1, y * 2.1 + 13, z * 2.1);
  const wz = z + 0.35 * noise3(x * 2.1, y * 2.1, z * 2.1 + 29);
  const n = noise3(wx * 4.6, wy * 4.6, wz * 4.6);
  return 1 - Math.abs(Math.sin(n * 5.2));
}

export function buildBrain() {
  const rand = mulberry(11);
  const pos = new Float32Array(N * 3);
  const bright = new Float32Array(N);
  const put = (i, x, y, z, b) => { pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z; bright[i] = b; };
  for (let i = 0; i < N; i++) {
    const u = rand();
    if (u < 0.83) {
      // Hjärnbarken
      let d, g, tries = 0;
      do {
        d = randomDirection(rand);
        g = gyri(d[0] * 1.2, d[1] * 1.2, d[2] * 1.2);
        tries++;
        // Fler partiklar på åsarna än i fårorna, så att vindlingarna syns
      } while (rand() > 0.12 + 0.88 * g * g && tries < 8);
      let r = cortexRadius(d[0], d[1], d[2]) * (1 + 0.075 * (g - 0.55));
      const inner = rand() < 0.12 ? 0.55 + 0.4 * rand() : 1 - 0.015 * rand();
      r *= inner;
      put(i, d[0] * r, d[1] * r + 0.08, d[2] * r, inner < 0.97 ? 0.25 : 0.35 + 0.65 * g);
    } else if (u < 0.95) {
      // Lillhjärnan, baktill och under, med täta vågräta strimmor
      const d = randomDirection(rand);
      const stripe = 0.5 + 0.5 * Math.sin((d[1] * 0.8 + d[2] * 0.25) * 46);
      if (rand() > 0.25 + 0.75 * stripe) { i--; continue; }
      const r = 1 - 0.02 * rand();
      const side = d[0] < 0 ? -1 : 1;
      put(i, d[0] * 0.42 * r + side * 0.06, d[1] * 0.24 * r - 0.42, d[2] * 0.3 * r - 0.62, 0.3 + 0.5 * stripe);
    } else {
      // Hjärnstammen
      const t = rand(), a = rand() * Math.PI * 2, rr = (0.13 - 0.05 * t) * Math.sqrt(0.6 + 0.4 * rand());
      put(i, Math.cos(a) * rr, -0.38 - t * 0.55, -0.3 - t * 0.12 + Math.sin(a) * rr, 0.4);
    }
  }
  return { pos, bright };
}

// Linjer mellan närliggande punkter i hjärnan: den klassiska bilden av "noder".
export function buildBrainLinks(pos, count = 2600) {
  const rand = mulberry(5);
  const picks = [];
  for (let k = 0; k < count; k++) picks.push(Math.floor(rand() * N));
  const segs = [];
  for (let a = 0; a < picks.length; a++) {
    const ia = picks[a] * 3; let found = 0;
    for (let b = a + 1; b < picks.length && found < 2; b++) {
      const ib = picks[b] * 3;
      const dx = pos[ia] - pos[ib], dy = pos[ia + 1] - pos[ib + 1], dz = pos[ia + 2] - pos[ib + 2];
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < 0.03 && d2 > 0.004) { segs.push(pos[ia], pos[ia + 1], pos[ia + 2], pos[ib], pos[ib + 1], pos[ib + 2]); found++; }
    }
  }
  return new Float32Array(segs);
}

// ---------- Stoftmoln: hjärnan har lösts upp ----------
export function buildDust() {
  const rand = mulberry(23);
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const d = randomDirection(rand);
    const r = 0.5 + 2.1 * Math.pow(rand(), 0.6);
    const sw = noise3(d[0] * 1.5, d[1] * 1.5, d[2] * 1.5);
    pos[i * 3] = d[0] * r * 1.5; pos[i * 3 + 1] = d[1] * r * 0.8 + sw * 0.3; pos[i * 3 + 2] = d[2] * r * 1.2;
  }
  return { pos };
}

// ---------- Galaxen: de riktiga platserna från modellens ordvektorer ----------
export const GALAXY_SCALE = 1.7;
export function buildGalaxy(int16) {
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N * 3; i++) pos[i] = (int16[i] / 32767) * GALAXY_SCALE;
  return { pos };
}

// ---------- Lagren: tolv staplade skikt ----------
export const LAYER_BOTTOM = -0.95, LAYER_TOP = 0.95, LAYER_HALF = 0.82;
export function layerY(l) { return LAYER_BOTTOM + (l / (N_LAYERS - 1)) * (LAYER_TOP - LAYER_BOTTOM); }
export function buildLayers() {
  const rand = mulberry(31);
  const pos = new Float32Array(N * 3);
  const perLayer = Math.ceil(N / N_LAYERS), side = Math.ceil(Math.sqrt(perLayer));
  for (let i = 0; i < N; i++) {
    const l = i % N_LAYERS, k = Math.floor(i / N_LAYERS);
    const gx = k % side, gz = Math.floor(k / side);
    pos[i * 3] = ((gx + 0.5) / side * 2 - 1) * LAYER_HALF + (rand() - 0.5) * 0.004;
    pos[i * 3 + 1] = layerY(l) + (rand() - 0.5) * 0.012;
    pos[i * 3 + 2] = ((gz + 0.5) / side * 2 - 1) * LAYER_HALF + (rand() - 0.5) * 0.004;
  }
  return { pos };
}

// ---------- Solfjädern: en partikel per möjlig nästa bit ----------
export const FAN_PIVOT = [0, -1.05, 0];
const FAN_SPREAD = (80 * Math.PI) / 180;
const FAN_INNER = 0.5, FAN_OUTER = 2.1;

export function softmax(logits, temperature = 1) {
  const n = logits.length, p = new Float64Array(n);
  let max = -Infinity;
  for (let i = 0; i < n; i++) if (logits[i] > max) max = logits[i];
  let sum = 0;
  for (let i = 0; i < n; i++) { const v = Math.exp((logits[i] - max) / temperature); p[i] = v; sum += v; }
  for (let i = 0; i < n; i++) p[i] /= sum;
  return p;
}

// Räknar ut solfjädern från sannolikheterna. Den mest sannolika biten står i
// mitten, och sedan följer bitarna i ordning växelvis åt höger och vänster.
// Avståndet från fästet visar sannolikheten i en skala där varje steg utåt är
// tio gånger mer sannolikt, och ljusstyrkan visar sannolikheten direkt.
export function fanAngle(rank, n) {
  if (rank === 0) return 0;
  const m = Math.ceil(rank / 2), side = rank % 2 === 1 ? 1 : -1;
  return side * FAN_SPREAD * Math.pow(Math.log(1 + m) / Math.log(1 + n / 2), 0.6);
}

export function buildFan(probs, out) {
  const n = probs.length;
  const order = new Uint32Array(n);
  for (let i = 0; i < n; i++) order[i] = i;
  order.sort((a, b) => probs[b] - probs[a]);
  const pos = out?.pos || new Float32Array(n * 3);
  const bright = out?.bright || new Float32Array(n);
  for (let r = 0; r < n; r++) {
    const id = order[r], p = probs[id];
    const angle = fanAngle(r, n);
    const lp = Math.max(0, Math.min(1, (Math.log10(Math.max(p, 1e-12)) + 6) / 6)); // 0,000001 .. 1
    const radius = FAN_INNER + (FAN_OUTER - FAN_INNER) * lp;
    // Bitar med nästan ingen sannolikhet bildar en mjuk kant längst in
    const rr = lp > 0 ? radius : radius * (0.35 + 0.65 * Math.sqrt(hash3(id, 17, 3)));
    pos[id * 3] = FAN_PIVOT[0] + Math.sin(angle) * rr;
    pos[id * 3 + 1] = FAN_PIVOT[1] + Math.cos(angle) * rr;
    pos[id * 3 + 2] = FAN_PIVOT[2] + (hash3(id, 5, 9) - 0.5) * 0.04;
    bright[id] = Math.pow(p, 0.42);
  }
  return { pos, bright, order };
}

// ---------- Strömmen: text som rinner fram, bit för bit ----------
export function buildStream() {
  const rand = mulberry(47);
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const t = rand() * 2 - 1;
    const x = t * 3.4;
    const band = Math.floor(rand() * 5) - 2;
    const wave = Math.sin(x * 1.3 + band * 0.9) * 0.28 + Math.sin(x * 0.55 + band * 2.1) * 0.22;
    const spread = 0.05 + 0.1 * Math.abs(noise3(x * 0.8, band, 0));
    const g = (rand() + rand() + rand() - 1.5) * spread * 2;
    pos[i * 3] = x; pos[i * 3 + 1] = wave + band * 0.2 + g; pos[i * 3 + 2] = Math.cos(x * 0.9 + band) * 0.5 + (rand() - 0.5) * 0.12 - 0.3;
  }
  return { pos };
}
