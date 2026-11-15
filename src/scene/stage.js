// Scenen: ett enda partikelsystem med 64 000 partiklar och en kamera som åker
// inåt genom det när besökaren scrollar. Dessutom linjer och etiketter.
import * as THREE from 'three';
import {
  N, N_LAYERS, buildBrain, buildBrainLinks, buildDust, buildGalaxy, buildLayers, buildFan, buildStream,
  FAN_PIVOT, FAN_Z, GALAXY_IN, GALAXY_FAR, FAR_CENTER, STREAM_Z0, STREAM_LEN, LAYER_HALF, LAYER_GAP, THREAD_Z0, threadZ, layerZ,
} from './shapes.js';

export const ACCENT = 0xffb24a;
const RIBS = 1400;
const FIL_COLORS = [0xffd166, 0x5fe3c0, 0xff7fb0]; // yoghurt, körfält, dator
const FIL_SCALE = 1.0, TUBE_SEGMENTS = 156;
const V3 = THREE.Vector3;
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };

// Färglägen i shadern
const MODE = { brain: 0, dust: 1, galaxy: 2, layers: 3, fan: 4, stream: 5 };

const VERT = /* glsl */ `
  attribute vec3 aFrom;
  attribute vec3 aTo;
  attribute vec4 aRnd;
  attribute float aBrightFrom;
  attribute float aBrightTo;
  attribute float aAccent;
  attribute float aMark;
  uniform float uT;
  uniform float uTime;
  uniform float uSize;
  uniform float uScale;
  uniform float uModeFrom;
  uniform float uModeTo;
  uniform float uAccentFrom;
  uniform float uAccentTo;
  uniform float uDim;
  uniform float uFog;
  uniform float uFlow;
  varying vec3 vColor;
  varying float vAlpha;

  vec3 palette(float mode, vec3 p, vec4 rnd, float bright) {
    if (mode < 0.5) {            // hjärnan: elektriskt blå
      vec3 c = mix(vec3(0.08, 0.3, 1.0), vec3(0.4, 0.85, 1.0), bright * bright);
      return c * (0.03 + 0.22 * bright * bright);
    } else if (mode < 1.5) {     // stoft
      return mix(vec3(0.16, 0.24, 0.5), vec3(0.4, 0.5, 0.8), rnd.x) * (0.12 + 0.3 * rnd.y * rnd.y);
    } else if (mode < 2.5) {     // galaxen: färg efter plats
      float a = 0.5 + 0.5 * sin(p.x * 0.9 + p.z * 0.6);
      float b = 0.5 + 0.5 * sin(p.y * 1.1 - p.x * 0.4 + 1.3);
      vec3 c = mix(vec3(0.16, 0.32, 1.0), vec3(0.62, 0.3, 0.95), a);
      c = mix(c, vec3(0.1, 0.75, 0.8), b * 0.55);
      c = mix(c, vec3(1.0), step(0.965, rnd.z) * 0.8);
      return c * (0.5 + 0.8 * rnd.y);
    } else if (mode < 3.5) {     // lagren: från blått i första lagret till turkost i sista
      float h = clamp((${THREAD_Z0.toFixed(2)} - p.z) / ${(12 * LAYER_GAP).toFixed(2)}, 0.0, 1.0);
      return mix(vec3(0.14, 0.3, 0.95), vec3(0.15, 0.85, 0.8), h) * (0.3 + 0.55 * rnd.y);
    } else if (mode < 4.5) {     // solfjädern: ljusstyrka = sannolikhet
      vec3 c = mix(vec3(0.13, 0.22, 0.6), vec3(1.0, 0.86, 0.6), smoothstep(0.02, 0.5, bright));
      return c * (0.05 + 2.2 * bright);
    }
    // strömmen
    return mix(vec3(0.2, 0.35, 1.0), vec3(0.8, 0.4, 0.95), rnd.x) * (0.6 + 0.9 * rnd.y);
  }

  float sizeFor(float mode, float bright) {
    if (mode < 0.5) return 0.45 + 0.45 * bright;
    if (mode > 0.5 && mode < 1.5) return 0.7;
    if (mode > 3.5 && mode < 4.5) return 0.7 + 5.0 * bright;
    return 1.0;
  }

  // Strömmen rinner mot kameran och börjar om längst in
  vec3 place(float mode, vec3 p) {
    if (mode > 4.5) p.z = ${STREAM_Z0.toFixed(2)} - mod(${STREAM_Z0.toFixed(2)} - p.z - uFlow, ${STREAM_LEN.toFixed(2)});
    return p;
  }

  void main() {
    float delay = aRnd.x * 0.4;
    float t = clamp((uT - delay) / 0.6, 0.0, 1.0);
    t = t * t * (3.0 - 2.0 * t);
    vec3 from = place(uModeFrom, aFrom), to = place(uModeTo, aTo);
    vec3 p = mix(from, to, t);
    // På vägen mellan två former virvlar partiklarna ut i en båge
    float mid = sin(t * 3.14159265);
    vec3 swirl = vec3(sin(aRnd.y * 40.0 + uTime * 0.3), cos(aRnd.z * 37.0 + uTime * 0.25), sin(aRnd.w * 51.0 - uTime * 0.2));
    vec3 tangent = cross(normalize(p + vec3(0.001)), vec3(0.0, 1.0, 0.0));
    p += mid * (swirl * 0.3 + tangent * 0.55);
    // Lugn egenrörelse
    p += 0.006 * vec3(sin(uTime * 0.7 + aRnd.y * 60.0), cos(uTime * 0.6 + aRnd.z * 60.0), sin(uTime * 0.5 + aRnd.w * 60.0));

    float bright = mix(aBrightFrom, aBrightTo, t);
    vec3 c = mix(palette(uModeFrom, from, aRnd, aBrightFrom), palette(uModeTo, to, aRnd, aBrightTo), t);
    float size = mix(sizeFor(uModeFrom, aBrightFrom), sizeFor(uModeTo, aBrightTo), t);
    c *= uDim;
    float accent = aAccent * mix(uAccentFrom, uAccentTo, t);
    c = mix(c, vec3(1.0, 0.7, 0.29) * 1.6, accent);
    // Markerade bitar (sökta ord och grannar) lyser vitt
    float mark = aMark * mix(uAccentFrom, uAccentTo, t); // bara i galaxen
    c = mix(c, vec3(1.0), mark);
    float hero = max(accent, mark);

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float d = max(-mv.z, 0.02);
    float px = uSize * size * uScale / d;
    // Djup: punkter långt bort bleknar, punkter nära blir stora och mjuka som
    // i en kamera med kort skärpedjup, och de allra närmaste tonas bort.
    float soft = max(1.0, px / (0.011 * uScale));
    float fog = exp(-max(d - 0.6, 0.0) * uFog);
    vAlpha = smoothstep(0.05, 0.45, d) * mix(fog / pow(soft, 0.9), 1.0, hero);
    px *= 1.0 + 4.5 * accent + 2.2 * mark;
    gl_PointSize = min(px, 0.1 * uScale);
    vColor = c;
  }
`;

const FRAG = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.05, d);
    gl_FragColor = vec4(vColor * a * a * vAlpha, 1.0);
  }
`;

// En vy per scen i berättelsen. Kamerans plats räknas ut i Stage.view().
// morph: när under övergången in till scenen som partiklarna byter form.
// shift: bilden flyttas åt höger (rubriken står till vänster). lift: bilden lyfts ovanför undertexten.
const VIEWS = [
  { shape: 'brain', mode: MODE.brain, accent: 0, fog: 0, shift: 1, lift: 0 },
  { shape: 'galaxy', mode: MODE.galaxy, accent: 1, fog: 0.1, shift: 0, lift: 0.03, morph: [0.42, 1] },
  { shape: 'galaxy', mode: MODE.galaxy, accent: 1, fog: 0.1, shift: 0, lift: 0.06 },
  { shape: 'galaxy', mode: MODE.galaxy, accent: 1, fog: 0.1, shift: 0, lift: 0.06 },
  { shape: 'layers', mode: MODE.layers, accent: 0, fog: 0.09, shift: 0, lift: 0.06 },
  { shape: 'fan', mode: MODE.fan, accent: 0, fog: 0, shift: 0, lift: 0.14 },
  { shape: 'fan', mode: MODE.fan, accent: 0, fog: 0, shift: 0, lift: 0.14 },
  { shape: 'stream', mode: MODE.stream, accent: 0, fog: 0.06, shift: 0, lift: 0 },
  { shape: 'far', mode: MODE.galaxy, accent: 1, fog: 0, shift: 0, lift: 0 },
];
const LAST = VIEWS.length - 1;
// Kameran står snett bakom den bit den följer i rummet
const TOKEN_OFFSET = new V3(0.3, 0.18, 1.25);

export class Stage {
  constructor(canvas, labelRoot, { reduced = false } = {}) {
    this.canvas = canvas;
    this.labelRoot = labelRoot;
    this.reduced = reduced;
    this.paused = reduced;
    // Var i resan vi är: scen k, andel t av övergången till scen k + 1, och hur
    // långt in i scenen kameran har åkt (qa för scen k, qb för scen k + 1).
    this.k = 0; this.t = 0; this.qa = 0; this.qb = 0;
    this.stage = 0;          // k + t, för synlighet av linjer och etiketter
    this.pair = -1;
    this.time = 0;
    this.labels = new Map();
    this.focus = null;       // { pos: Vector3 } när kameran åker till ett sökt ord
    this.focusAmount = 0;
    this.pointer = new THREE.Vector2();
    this.tokenPts = [];
    this.pathU = 0;
    this.filPts = null; this.filActive = 0; this.filL = 0;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
    this.renderer = renderer;
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(this.pixelRatio);
    renderer.setClearColor(0x04050c, 1);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.03, 80);
    this.group = new THREE.Group();
    this.scene.add(this.group);

    // Former
    const brain = buildBrain();
    const dust = buildDust().pos;
    this.shapes = {
      brain: { pos: brain.pos, bright: brain.bright },
      // galaxy och far ersätts när galaxens data har laddats
      galaxy: { pos: dust.map((v) => v * 1.6), bright: new Float32Array(N) },
      far: { pos: dust.map((v, i) => v * 0.8 + FAR_CENTER[i % 3]), bright: new Float32Array(N) },
      layers: { pos: buildLayers().pos, bright: new Float32Array(N) },
      fan: { pos: new Float32Array(N * 3), bright: new Float32Array(N) },
      stream: { pos: buildStream().pos, bright: new Float32Array(N) },
    };
    // Innan några sannolikheter finns: en jämn solfjäder
    buildFan(new Float64Array(N).fill(1 / N), this.shapes.fan);
    this.fanTarget = null;

    // Partiklarna
    const geo = new THREE.BufferGeometry();
    const rnd = new Float32Array(N * 4);
    let seed = 1234567;
    for (let i = 0; i < rnd.length; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; rnd[i] = (seed >>> 0) / 4294967296; }
    this.attr = {
      from: new THREE.BufferAttribute(new Float32Array(N * 3), 3),
      to: new THREE.BufferAttribute(new Float32Array(N * 3), 3),
      brightFrom: new THREE.BufferAttribute(new Float32Array(N), 1),
      brightTo: new THREE.BufferAttribute(new Float32Array(N), 1),
      accent: new THREE.BufferAttribute(new Float32Array(N), 1),
      mark: new THREE.BufferAttribute(new Float32Array(N), 1),
    };
    for (const a of Object.values(this.attr)) a.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.attr.to); // krävs av three.js, används inte i shadern
    geo.setAttribute('aFrom', this.attr.from);
    geo.setAttribute('aTo', this.attr.to);
    geo.setAttribute('aRnd', new THREE.BufferAttribute(rnd, 4));
    geo.setAttribute('aBrightFrom', this.attr.brightFrom);
    geo.setAttribute('aBrightTo', this.attr.brightTo);
    geo.setAttribute('aAccent', this.attr.accent);
    geo.setAttribute('aMark', this.attr.mark);
    geo.boundingSphere = new THREE.Sphere(new V3(), 100);
    this.uniforms = {
      uT: { value: 0 }, uTime: { value: 0 }, uSize: { value: 0.02 }, uScale: { value: 1 },
      uModeFrom: { value: 0 }, uModeTo: { value: 0 }, uAccentFrom: { value: 0 }, uAccentTo: { value: 0 }, uDim: { value: 1 },
      uFog: { value: 0 }, uFlow: { value: 0 },
    };
    this.points = new THREE.Points(geo, new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG,
      blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, transparent: true,
    }));
    this.points.frustumCulled = false;
    this.group.add(this.points);

    // Hjärnans "nervtrådar"
    const linkGeo = new THREE.BufferGeometry();
    linkGeo.setAttribute('position', new THREE.BufferAttribute(buildBrainLinks(brain.pos), 3));
    this.brainLinks = new THREE.LineSegments(linkGeo, new THREE.LineBasicMaterial({
      color: 0x4aa8ff, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false,
    }));
    this.group.add(this.brainLinks);

    // Linjer i galaxen: din menings väg, och grannarna till ett sökt ord
    this.pathLine = this.makeLine(ACCENT, 64);
    this.neighborLines = this.makeSegments(0xffffff, 16);
    this.group.add(this.pathLine, this.neighborLines);

    // Lagrens ramar och de tre trådarna för "fil"
    this.layerFrames = this.buildLayerFrames();
    this.group.add(this.layerFrames);
    this.filGroup = new THREE.Group();
    this.group.add(this.filGroup);

    // Solfjäderns ribbor
    this.fanRibs = this.makeSegments(0xffd9a0, RIBS, true);
    this.group.add(this.fanRibs);

    const v = this.view(0, 0);
    this.camPos = v.pos.clone(); this.camLook = v.look.clone();
    this.resize();
    this.applyPair(0);
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('pointermove', (e) => {
      this.pointer.set((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
    }, { passive: true });
  }

  makeLine(color, max) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(max * 3), 3));
    g.setDrawRange(0, 0);
    const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthTest: false }));
    l.frustumCulled = false;
    return l;
  }

  makeSegments(color, max, vertexColors = false) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(max * 6), 3));
    if (vertexColors) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(max * 6), 3));
    g.setDrawRange(0, 0);
    const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: vertexColors ? 0xffffff : color, vertexColors, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthTest: false }));
    l.frustumCulled = false;
    return l;
  }

  buildLayerFrames() {
    const h = LAYER_HALF + 0.04, pts = [];
    for (let l = 1; l <= N_LAYERS; l++) {
      const z = layerZ(l);
      const c = [[-h, -h, z], [h, -h, z], [h, h, z], [-h, h, z]];
      for (let k = 0; k < 4; k++) pts.push(...c[k], ...c[(k + 1) % 4]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3));
    const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x4fd0e0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthTest: false }));
    l.frustumCulled = false;
    return l;
  }

  // ---------- Data in ----------
  setGalaxy(int16) {
    this.shapes.galaxy.pos = buildGalaxy(int16, GALAXY_IN).pos;
    this.shapes.far.pos = buildGalaxy(int16, GALAXY_FAR, FAR_CENTER).pos;
    this.pair = -1; // ladda upp på nytt
  }

  // Din menings bitar lyser i accentfärgen
  setSentence(ids) {
    this.sentenceIds = ids;
    const a = this.attr.accent.array; a.fill(0);
    for (const id of ids) a[id] = 1;
    this.attr.accent.needsUpdate = true;
    this.tokenPts = ids.slice(0, 64).map((id) => this.galaxyPosition(id));
  }

  // Markera ett sökt ord och dess grannar i galaxen (ids[0] är ordet självt)
  setMarked(ids) {
    const m = this.attr.mark.array; m.fill(0);
    const g = this.shapes.galaxy.pos, arr = this.neighborLines.geometry.attributes.position.array;
    let n = 0;
    if (ids && ids.length) {
      for (const id of ids) m[id] = 1;
      for (let i = 1; i < ids.length && n < 16; i++, n++) {
        arr.set([g[ids[0] * 3], g[ids[0] * 3 + 1], g[ids[0] * 3 + 2], g[ids[i] * 3], g[ids[i] * 3 + 1], g[ids[i] * 3 + 2]], n * 6);
      }
      this.focus = { pos: this.galaxyPosition(ids[0]) };
    } else this.focus = null;
    this.attr.mark.needsUpdate = true;
    this.neighborLines.geometry.attributes.position.needsUpdate = true;
    this.neighborLines.geometry.setDrawRange(0, n * 2);
  }

  galaxyPosition(id) {
    const g = this.shapes.galaxy.pos;
    return new V3(g[id * 3], g[id * 3 + 1], g[id * 3 + 2]);
  }

  // Nya sannolikheter: solfjädern formas om
  setProbabilities(probs, animate = true) {
    const target = buildFan(probs);
    this.fanOrder = target.order;
    this.fanProbs = probs;
    if (!animate || this.reduced) {
      this.shapes.fan.pos.set(target.pos); this.shapes.fan.bright.set(target.bright);
      this.fanTarget = null; this.uploadShape('fan'); this.updateRibs();
    } else {
      this.fanTarget = { from: { pos: this.shapes.fan.pos.slice(), bright: this.shapes.fan.bright.slice() }, to: target, t: 0 };
    }
  }

  fanPosition(id) {
    const f = this.shapes.fan.pos;
    return new V3(f[id * 3], f[id * 3 + 1], f[id * 3 + 2]);
  }

  updateRibs() {
    if (!this.fanOrder) return;
    const pos = this.fanRibs.geometry.attributes.position.array, col = this.fanRibs.geometry.attributes.color.array;
    const f = this.shapes.fan.pos, b = this.shapes.fan.bright;
    const n = RIBS;
    for (let r = 0; r < n; r++) {
      const id = this.fanOrder[r], k = Math.min(1, b[id] * 1.5 + 0.035) * (0.2 + 0.8 / (1 + r / 90));
      pos.set([FAN_PIVOT[0], FAN_PIVOT[1], FAN_PIVOT[2], f[id * 3], f[id * 3 + 1], f[id * 3 + 2]], r * 6);
      col.set([k * 0.1, k * 0.09, k * 0.12, k, k * 0.82, k * 0.58], r * 6);
    }
    this.fanRibs.geometry.attributes.position.needsUpdate = true;
    this.fanRibs.geometry.attributes.color.needsUpdate = true;
    this.fanRibs.geometry.setDrawRange(0, n * 2);
  }

  // De tre trådarna för ordet "fil" genom lagren. triangles: 13 x 3 x 2.
  // Trådarna växer fram när kameran åker genom lagren.
  setFil(triangles, active = 0) {
    this.filActive = active;
    for (const m of [...this.filGroup.children]) { this.filGroup.remove(m); m.geometry.dispose(); m.material.dispose(); }
    this.filPts = [0, 1, 2].map((s) => triangles.map((tri, j) => new V3(tri[s][0] * FIL_SCALE, tri[s][1] * FIL_SCALE, threadZ(j))));
    const mat = (color, base) => {
      const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthTest: false, blending: THREE.AdditiveBlending });
      m.userData.base = base; return m;
    };
    this.filTubes = []; this.filHeads = [];
    for (let s = 0; s < 3; s++) {
      const dim = active !== s;
      const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(this.filPts[s]), TUBE_SEGMENTS, dim ? 0.004 : 0.007, 8), mat(FIL_COLORS[s], dim ? 0.6 : 1));
      const head = new THREE.Mesh(new THREE.SphereGeometry(dim ? 0.018 : 0.026, 16, 16), mat(FIL_COLORS[s], 1));
      tube.frustumCulled = head.frustumCulled = false;
      this.filGroup.add(tube, head);
      this.filTubes.push(tube); this.filHeads.push(head);
    }
    // Triangeln mellan de tre trådarnas spetsar
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
    this.filTriangle = new THREE.LineLoop(g, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthTest: false, blending: THREE.AdditiveBlending }));
    this.filTriangle.material.userData.base = 0.35;
    this.filTriangle.frustumCulled = false;
    this.filGroup.add(this.filTriangle);
  }

  // Tråd s vid lager L (flyttal, 0 = före första lagret, 12 = efter sista)
  filPoint(s, L) {
    const pts = this.filPts[s], n = pts.length - 1;
    L = Math.max(0, Math.min(n, L));
    const j = Math.min(n - 1, Math.floor(L));
    return pts[j].clone().lerp(pts[j + 1], L - j);
  }

  // Punkten på din menings väg genom rummet. u = 2.5 är mitt emellan bit 2 och 3.
  tokenPoint(u) {
    const pts = this.tokenPts, n = pts.length;
    if (!n) return new V3();
    if (n === 1) return pts[0].clone();
    u = Math.max(0, Math.min(n - 1, u));
    const j = Math.min(n - 2, Math.floor(u));
    return pts[j].clone().lerp(pts[j + 1], smooth(u - j));
  }

  // ---------- Etiketter (HTML-element som följer punkter i 3D) ----------
  // group: vilken scen etiketten hör till. getPos: funktion som ger platsen.
  // vis: funktion som ger 0..1, text: funktion som ger texten för varje bild.
  setLabels(group, items) {
    for (const [key, l] of this.labels) if (l.group === group) { l.el.remove(); this.labels.delete(key); }
    items.forEach((it, i) => {
      const el = document.createElement('div');
      el.className = 'label ' + (it.cls || '');
      el.setAttribute('aria-hidden', 'true');
      el.innerHTML = it.html || '';
      this.labelRoot.appendChild(el);
      this.labels.set(group + ':' + i, { group, el, getPos: it.getPos, vis: it.vis, text: it.text, dx: it.dx || 0, dy: it.dy || 0 });
    });
  }

  // ---------- Kameran ----------
  // Kamerans plats och blickpunkt i scen i, när besökaren har scrollat andelen q genom scenen.
  view(i, q) {
    const time = this.time;
    switch (i) {
      case 0: { // utanför hjärnan, som sakta vrider sig
        const a = 0.55 + 0.3 * Math.sin(time * 0.17), r = (this.narrow ? 5.2 : 3.7) - 0.5 * q;
        return { pos: new V3(Math.sin(a) * r, 0.35, Math.cos(a) * r), look: new V3(0, 0, 0) };
      }
      case 1: { // inne i rummet, på väg rakt in
        const yaw = 0.3 * Math.sin(time * 0.13);
        const pos = new V3(0.15 * Math.sin(time * 0.09), 0.05, 1.3 - 1.1 * q);
        return { pos, look: new V3(pos.x + Math.sin(yaw) * 3, 0.05 + 0.4 * Math.sin(time * 0.11), pos.z - 3) };
      }
      case 2: { // följer din mening från bit till bit
        const n = this.tokenPts.length;
        const p = this.tokenPoint(clamp01((q - 0.06) / 0.86) * (n - 1));
        return { pos: p.clone().add(TOKEN_OFFSET), look: p };
      }
      case 3: { // backar från sista biten och ser mer av rummet
        const p = this.tokenPoint(this.tokenPts.length - 1);
        return { pos: p.clone().addScaledVector(TOKEN_OFFSET, 2.1 + 0.6 * q), look: p };
      }
      case 4: { // genom de tolv lagren, strax bakom trådarnas spetsar
        const L = q * 12, z = THREAD_Z0 - L * LAYER_GAP;
        if (!this.filPts) return { pos: new V3(0, 0.1, z + 1.9), look: new V3(0, 0, z - 1.2) };
        // Mitt emellan de tre trådarna, lite ovanför, så att ingen tråd går rakt genom kameran
        const mid = (l) => { const c = new V3(); for (let s = 0; s < 3; s++) c.add(this.filPoint(s, l)); return c.multiplyScalar(1 / 3); };
        const b = mid(L - 1), c = mid(L + 0.8);
        return { pos: new V3(b.x * 0.5, b.y * 0.5 + 0.14, z + (this.narrow ? 3.2 : 1.9)), look: new V3(c.x * 0.6, c.y * 0.6, z - 1.2) };
      }
      case 5: return { pos: new V3(0, 0, FAN_Z + (this.narrow ? 6.6 : 5.0) - 0.2 * q), look: new V3(0, 0, FAN_Z) };
      case 6: return { pos: new V3(0, 0, FAN_Z + (this.narrow ? 6.4 : 4.8) - 0.1 * q), look: new V3(0, 0, FAN_Z) };
      case 7: { // genom solfjädern och in i strömmen
        const z = FAN_Z - 2.5 - 2 * q;
        return { pos: new V3(0, 0, z), look: new V3(0.3 * Math.sin(time * 0.1), 0, z - 5) };
      }
      default: { // backar ut och ser hela rummet på håll
        const c = new V3(...FAR_CENTER), a = 0.25 * Math.sin(time * 0.08), r = (this.narrow ? 7 : 4.6) + 1.2 * q;
        return { pos: new V3(c.x + Math.sin(a) * r, 0.8, c.z + Math.cos(a) * r), look: c };
      }
    }
  }

  // ---------- Form och bild ----------
  uploadShape(name) {
    const k = Math.max(0, Math.min(LAST - 1, this.pair));
    if (VIEWS[k].shape === name) { this.attr.from.array.set(this.shapes[name].pos); this.attr.from.needsUpdate = true; this.attr.brightFrom.array.set(this.shapes[name].bright); this.attr.brightFrom.needsUpdate = true; }
    if (VIEWS[k + 1].shape === name) { this.attr.to.array.set(this.shapes[name].pos); this.attr.to.needsUpdate = true; this.attr.brightTo.array.set(this.shapes[name].bright); this.attr.brightTo.needsUpdate = true; }
  }

  applyPair(k) {
    this.pair = k;
    const a = VIEWS[k], b = VIEWS[k + 1];
    this.attr.from.array.set(this.shapes[a.shape].pos); this.attr.to.array.set(this.shapes[b.shape].pos);
    this.attr.brightFrom.array.set(this.shapes[a.shape].bright); this.attr.brightTo.array.set(this.shapes[b.shape].bright);
    this.attr.from.needsUpdate = this.attr.to.needsUpdate = this.attr.brightFrom.needsUpdate = this.attr.brightTo.needsUpdate = true;
    this.uniforms.uModeFrom.value = a.mode; this.uniforms.uModeTo.value = b.mode;
    this.uniforms.uAccentFrom.value = a.accent; this.uniforms.uAccentTo.value = b.accent;
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.width = w; this.height = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.uniforms.uScale.value = h * this.pixelRatio;
    this.narrow = w < 820;
  }

  // Hur mycket scen nummer step syns just nu (0..1), och samma sak för ett spann av scener
  weightOfStep(step) { return Math.max(0, 1 - Math.abs(this.stage - step)); }
  inScenes(a, b) { return clamp01(Math.min(this.stage - a + 1, b + 1 - this.stage) * 2 - 1); }
  weight(shape) {
    const k = Math.min(LAST - 1, Math.floor(this.stage)), t = clamp01(this.stage - k);
    return (VIEWS[k].shape === shape ? 1 - t : 0) + (VIEWS[k + 1].shape === shape ? t : 0);
  }

  frame(dt) {
    if (!this.paused) this.time += dt;
    let { k, t, qa, qb } = this;
    if (k >= LAST) { k = LAST - 1; t = 1; qb = qa; qa = 1; }
    this.stage = k + t;
    if (k !== this.pair) this.applyPair(k);
    const A = VIEWS[k], B = VIEWS[k + 1];
    const m = B.morph || [0, 1];
    this.uniforms.uT.value = clamp01((t - m[0]) / (m[1] - m[0]));
    this.uniforms.uTime.value = this.time;
    this.uniforms.uFlow.value = (this.time * 0.55) % STREAM_LEN;

    // Solfjädern formas om mjukt när sannolikheterna ändras
    if (this.fanTarget) {
      const f = this.fanTarget; f.t = Math.min(1, f.t + dt / 0.7);
      const e = f.t * f.t * (3 - 2 * f.t);
      const p = this.shapes.fan.pos, b = this.shapes.fan.bright;
      for (let i = 0; i < p.length; i++) p[i] = f.from.pos[i] + (f.to.pos[i] - f.from.pos[i]) * e;
      for (let i = 0; i < b.length; i++) b[i] = f.from.bright[i] + (f.to.bright[i] - f.from.bright[i]) * e;
      if (f.t >= 1) this.fanTarget = null;
      this.uploadShape('fan'); this.updateRibs();
    }

    // Kamera: scenens egen åkning, och en mjuk övergång mellan två scener
    const e = smooth(t), lerp = (x, y) => x + (y - x) * e;
    const va = this.view(k, qa), vb = this.view(k + 1, qb);
    const pos = va.pos.lerp(vb.pos, e), look = va.look.lerp(vb.look, e);
    this.uniforms.uFog.value = lerp(A.fog, B.fog);

    // Sökt ord: kameran åker dit
    const wantFocus = this.focus && this.weightOfStep(3) > 0.6 ? 1 : 0;
    this.focusAmount += (wantFocus - this.focusAmount) * Math.min(1, dt * (this.reduced ? 100 : 2.5));
    if (this.focusAmount > 0.001 && this.focus) {
      pos.lerp(this.focus.pos.clone().addScaledVector(TOKEN_OFFSET, 0.8), this.focusAmount);
      look.lerp(this.focus.pos, this.focusAmount);
    }
    if (!this.paused) { pos.x += this.pointer.x * 0.06; pos.y += -this.pointer.y * 0.04; }
    const follow = this.reduced ? 1 : Math.min(1, dt * 6);
    this.camPos.lerp(pos, follow); this.camLook.lerp(look, follow);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    // Bilden flyttas åt sidan när rubriken står till vänster, och uppåt när det står text under
    const shift = this.narrow ? 0 : lerp(A.shift, B.shift) * 0.12;
    const lift = this.narrow ? lerp(k === 0 ? -0.27 : 0.16, 0.16) : lerp(A.lift, B.lift);
    this.camera.setViewOffset(this.width, this.height, -shift * this.width, lift * this.height, this.width, this.height);
    this.camera.updateMatrixWorld();

    // Synlighet för linjer och annat som hör till en viss scen
    const brainW = this.weight('brain');
    this.brainLinks.material.opacity = 0.22 * Math.max(0, brainW * 2 - 1);
    this.brainLinks.visible = brainW > 0.5;

    // Din menings väg ritas fram bit för bit i scen 2 och ligger kvar i scen 3
    const galW = this.inScenes(2, 3), n = this.tokenPts.length;
    this.pathU = this.stage >= 2 ? (n - 1) * (k === 2 && t === 0 ? clamp01((qa - 0.06) / 0.86) : 1) : 0;
    this.pathLine.visible = galW > 0 && n > 1;
    if (this.pathLine.visible) {
      const arr = this.pathLine.geometry.attributes.position.array, j = Math.min(n - 2, Math.floor(this.pathU));
      for (let i = 0; i <= j; i++) this.tokenPts[i].toArray(arr, i * 3);
      this.tokenPoint(this.pathU).toArray(arr, (j + 1) * 3);
      this.pathLine.geometry.attributes.position.needsUpdate = true;
      this.pathLine.geometry.setDrawRange(0, j + 2);
      this.pathLine.material.opacity = 0.75 * galW;
    }
    const searchW = Math.max(0, this.weightOfStep(3) * 2 - 1);
    this.neighborLines.material.opacity = 0.55 * searchW; this.neighborLines.visible = searchW > 0;

    // Lagren och trådarna för "fil"
    const layW = Math.max(0, this.weight('layers') * 2 - 1);
    this.layerFrames.material.opacity = 0.32 * layW; this.layerFrames.visible = layW > 0;
    this.filGroup.visible = layW > 0 && !!this.filPts;
    this.filL = k === 4 ? qa * 12 : k > 4 ? 12 : 0;
    if (this.filGroup.visible) {
      const tri = this.filTriangle.geometry.attributes.position;
      for (let s = 0; s < 3; s++) {
        const head = this.filPoint(s, this.filL);
        this.filHeads[s].position.copy(head); head.toArray(tri.array, s * 3);
        // Bara den senaste biten av tråden ritas, som svansen på en komet
        const seg = (l) => Math.floor((Math.max(0, l) / 12) * TUBE_SEGMENTS);
        this.filTubes[s].geometry.setDrawRange(seg(this.filL - 1.35) * 48, (seg(this.filL) - seg(this.filL - 1.35)) * 48);
      }
      tri.needsUpdate = true;
      for (const o of this.filGroup.children) o.material.opacity = layW * o.material.userData.base;
    }

    const fanW = Math.max(0, this.weight('fan') * 2 - 1);
    this.fanRibs.material.opacity = 0.6 * fanW; this.fanRibs.visible = fanW > 0;
    // Bakom texten i de två sista scenerna lyser partiklarna svagare
    this.uniforms.uDim.value = 1 - 0.3 * clamp01(this.stage - 7.2);

    // Etiketter
    const v = new V3();
    const groupWeight = { galaxy: galW, search: searchW, fil: Math.max(0, this.weightOfStep(4) * 2 - 1), fan: this.inScenes(5, 6) };
    const placed = [];
    for (const l of this.labels.values()) {
      const w = Math.min(1, groupWeight[l.group] ?? 0) * (l.vis ? l.vis() : 1);
      if (w <= 0.01) { l.el.style.opacity = 0; l.el.style.visibility = 'hidden'; continue; }
      v.copy(l.getPos()).applyMatrix4(this.camera.matrixWorldInverse);
      if (v.z > -0.08) { l.el.style.visibility = 'hidden'; continue; } // bakom kameran
      v.applyMatrix4(this.camera.projectionMatrix);
      if (l.text) { const s = l.text(); if (s !== l.last) { l.last = s; l.el.innerHTML = s; l.w = 0; } }
      const x = (v.x * 0.5 + 0.5) * this.width + l.dx; let y = (-v.y * 0.5 + 0.5) * this.height + l.dy;
      // Etiketter som skulle hamna på varandra flyttas nedåt
      const lw = l.w || (l.w = l.el.offsetWidth + 8);
      for (let pass = 0; pass < 12; pass++) {
        const hit = placed.find((q) => x < q.x + q.w && q.x < x + lw && Math.abs(y - q.y) < 23);
        if (!hit) break;
        y = hit.y + 23;
      }
      placed.push({ x, y, w: lw });
      l.el.style.visibility = 'visible';
      l.el.style.opacity = w;
      l.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    }

    this.renderer.render(this.scene, this.camera);
  }
}

export { VIEWS, FIL_COLORS };
