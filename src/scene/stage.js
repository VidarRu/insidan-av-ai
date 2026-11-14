// Scenen: ett enda partikelsystem med 64 000 partiklar som byter form när
// besökaren scrollar. Dessutom linjer, etiketter och kamera.
import * as THREE from 'three';
import {
  N, N_LAYERS, buildBrain, buildBrainLinks, buildDust, buildGalaxy, buildLayers, buildFan, buildStream,
  FAN_PIVOT, layerY, LAYER_BOTTOM, LAYER_TOP,
} from './shapes.js';

export const ACCENT = 0xffb24a;
const RIBS = 1400;
const FIL_COLORS = [0xffd166, 0x5fe3c0, 0xff7fb0]; // yoghurt, körfält, dator

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
  varying vec3 vColor;
  varying float vAlpha;

  vec3 palette(float mode, vec3 p, vec4 rnd, float bright) {
    if (mode < 0.5) {            // hjärnan: elektriskt blå
      vec3 c = mix(vec3(0.08, 0.3, 1.0), vec3(0.4, 0.85, 1.0), bright * bright);
      return c * (0.03 + 0.22 * bright * bright);
    } else if (mode < 1.5) {     // stoft
      return mix(vec3(0.16, 0.24, 0.5), vec3(0.4, 0.5, 0.8), rnd.x) * (0.12 + 0.3 * rnd.y * rnd.y);
    } else if (mode < 2.5) {     // galaxen: färg efter plats
      float a = 0.5 + 0.5 * sin(p.x * 1.7 + p.z * 1.1);
      float b = 0.5 + 0.5 * sin(p.y * 2.1 - p.x * 0.7 + 1.3);
      vec3 c = mix(vec3(0.16, 0.32, 1.0), vec3(0.62, 0.3, 0.95), a);
      c = mix(c, vec3(0.1, 0.75, 0.8), b * 0.55);
      c = mix(c, vec3(1.0), step(0.965, rnd.z) * 0.8);
      return c * (0.3 + 0.55 * rnd.y);
    } else if (mode < 3.5) {     // lagren: från blått nederst till turkost överst
      float h = clamp((p.y + 1.0) * 0.5, 0.0, 1.0);
      return mix(vec3(0.14, 0.3, 0.95), vec3(0.15, 0.85, 0.8), h) * (0.22 + 0.4 * rnd.y);
    } else if (mode < 4.5) {     // solfjädern: ljusstyrka = sannolikhet
      vec3 c = mix(vec3(0.13, 0.22, 0.6), vec3(1.0, 0.86, 0.6), smoothstep(0.02, 0.5, bright));
      return c * (0.05 + 2.2 * bright);
    }
    // strömmen
    return mix(vec3(0.2, 0.3, 0.85), vec3(0.75, 0.4, 0.9), rnd.x) * (0.22 + 0.4 * rnd.y);
  }

  float sizeFor(float mode, float bright) {
    if (mode < 0.5) return 0.45 + 0.45 * bright;
    if (mode > 0.5 && mode < 1.5) return 0.7;
    if (mode > 3.5 && mode < 4.5) return 0.7 + 5.0 * bright;
    return 1.0;
  }

  void main() {
    float delay = aRnd.x * 0.4;
    float t = clamp((uT - delay) / 0.6, 0.0, 1.0);
    t = t * t * (3.0 - 2.0 * t);
    vec3 p = mix(aFrom, aTo, t);
    // På vägen mellan två former virvlar partiklarna ut i en båge
    float mid = sin(t * 3.14159265);
    vec3 swirl = vec3(sin(aRnd.y * 40.0 + uTime * 0.3), cos(aRnd.z * 37.0 + uTime * 0.25), sin(aRnd.w * 51.0 - uTime * 0.2));
    vec3 tangent = cross(normalize(p + vec3(0.001)), vec3(0.0, 1.0, 0.0));
    p += mid * (swirl * 0.3 + tangent * 0.55);
    // Lugn egenrörelse
    p += 0.006 * vec3(sin(uTime * 0.7 + aRnd.y * 60.0), cos(uTime * 0.6 + aRnd.z * 60.0), sin(uTime * 0.5 + aRnd.w * 60.0));

    float bright = mix(aBrightFrom, aBrightTo, t);
    vec3 c = mix(palette(uModeFrom, aFrom, aRnd, aBrightFrom), palette(uModeTo, aTo, aRnd, aBrightTo), t);
    float size = mix(sizeFor(uModeFrom, aBrightFrom), sizeFor(uModeTo, aBrightTo), t);
    c *= uDim;
    float accent = aAccent * mix(uAccentFrom, uAccentTo, t);
    c = mix(c, vec3(1.0, 0.7, 0.29) * 1.6, accent);
    size *= 1.0 + 4.5 * accent;
    // Markerade bitar (sökta ord och grannar) lyser vitt
    c = mix(c, vec3(1.0), aMark);
    size *= 1.0 + 2.2 * aMark;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = min(uSize * size * uScale / -mv.z, 40.0 * uScale / 900.0);
    vColor = c;
    vAlpha = 1.0;
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

// Kamerans plats och blickpunkt för varje steg i berättelsen
const VIEWS = [
  { shape: 'brain', mode: MODE.brain, cam: [2.35, 0.35, 1.9], look: [0, 0, 0], spin: 0.12, accent: 0, shiftX: 0.55 },
  { shape: 'dust', mode: MODE.dust, cam: [0, 0.2, 3.6], look: [0, 0, 0], spin: 0.03, accent: 0, shiftX: 0 },
  { shape: 'dust', mode: MODE.dust, cam: [0, 0.1, 3.2], look: [0, 0, 0], spin: 0.03, accent: 0, shiftX: 0 },
  { shape: 'galaxy', mode: MODE.galaxy, cam: [0, 0.5, 4.3], look: [0, 0, 0], spin: 0.035, accent: 1, shiftX: 0.5 },
  { shape: 'layers', mode: MODE.layers, cam: [3.3, 1.5, 3.9], look: [0, 0.05, 0], spin: 0, accent: 0, shiftX: 0.5 },
  { shape: 'fan', mode: MODE.fan, cam: [0, 0.0, 3.9], look: [0, 0.0, 0], spin: 0, accent: 0, shiftX: 0.5 },
  { shape: 'fan', mode: MODE.fan, cam: [0, 0.0, 3.9], look: [0, 0.0, 0], spin: 0, accent: 0, shiftX: 0.5 },
  { shape: 'stream', mode: MODE.stream, cam: [0, 0.15, 3.3], look: [0, 0, 0], spin: 0, accent: 0, shiftX: 0 },
  { shape: 'galaxy', mode: MODE.galaxy, cam: [0, 0.9, 3.1], look: [0, 0, 0], spin: 0.03, accent: 1, shiftX: 0 },
];

export class Stage {
  constructor(canvas, labelRoot, { reduced = false } = {}) {
    this.canvas = canvas;
    this.labelRoot = labelRoot;
    this.reduced = reduced;
    this.paused = reduced;
    this.stage = 0;          // flyttal: 3.4 betyder 40 % av vägen från steg 3 till steg 4
    this.pair = -1;
    this.time = 0;
    this.spinAngle = 0;
    this.labels = new Map();
    this.focus = null;       // { pos: Vector3 } när kameran tittar på ett sökt ord
    this.focusAmount = 0;
    this.pointer = new THREE.Vector2();

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
    this.renderer = renderer;
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(this.pixelRatio);
    renderer.setClearColor(0x04050c, 1);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.05, 60);
    this.group = new THREE.Group();
    this.scene.add(this.group);

    // Former
    const brain = buildBrain();
    this.shapes = {
      brain: { pos: brain.pos, bright: brain.bright },
      dust: { pos: buildDust().pos, bright: new Float32Array(N) },
      galaxy: { pos: new Float32Array(buildDust().pos), bright: new Float32Array(N) }, // ersätts när galaxens data har laddats
      layers: { pos: buildLayers().pos, bright: new Float32Array(N) },
      fan: { pos: new Float32Array(N * 3), bright: new Float32Array(N) },
      stream: { pos: buildStream().pos, bright: new Float32Array(N) },
    };
    // Innan några sannolikheter finns: en jämn solfjäder
    const flat = new Float64Array(N).fill(1 / N);
    buildFan(flat, this.shapes.fan);
    this.fanTarget = null;

    // Partiklarna
    const geo = new THREE.BufferGeometry();
    const rnd = new Float32Array(N * 4);
    let s = 1234567;
    for (let i = 0; i < rnd.length; i++) { s = (Math.imul(s, 1664525) + 1013904223) | 0; rnd[i] = (s >>> 0) / 4294967296; }
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
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 20);
    this.uniforms = {
      uT: { value: 0 }, uTime: { value: 0 }, uSize: { value: 0.02 }, uScale: { value: 1 },
      uModeFrom: { value: 0 }, uModeTo: { value: 0 }, uAccentFrom: { value: 0 }, uAccentTo: { value: 0 }, uDim: { value: 1 },
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

    // Lagrens ramar och de tre vägarna för "fil"
    this.layerFrames = this.buildLayerFrames();
    this.group.add(this.layerFrames);
    this.filGroup = new THREE.Group();
    this.group.add(this.filGroup);
    this.filDots = [];

    // Solfjäderns ribbor
    this.fanRibs = this.makeSegments(0xffd9a0, RIBS, true);
    this.group.add(this.fanRibs);

    this.camPos = new THREE.Vector3(...VIEWS[0].cam);
    this.camLook = new THREE.Vector3(...VIEWS[0].look);
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
    const h = 0.86, pts = [];
    for (let l = 0; l < N_LAYERS; l++) {
      const y = layerY(l);
      const c = [[-h, y, -h], [h, y, -h], [h, y, h], [-h, y, h]];
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
    this.shapes.galaxy.pos = buildGalaxy(int16).pos;
    this.pair = -1; // ladda upp på nytt
  }

  // Din menings bitar lyser i accentfärgen
  setSentence(ids) {
    this.sentenceIds = ids;
    const a = this.attr.accent.array; a.fill(0);
    for (const id of ids) a[id] = 1;
    this.attr.accent.needsUpdate = true;
    const g = this.shapes.galaxy.pos, arr = this.pathLine.geometry.attributes.position.array;
    const n = Math.min(ids.length, 64);
    for (let i = 0; i < n; i++) { arr[i * 3] = g[ids[i] * 3]; arr[i * 3 + 1] = g[ids[i] * 3 + 1]; arr[i * 3 + 2] = g[ids[i] * 3 + 2]; }
    this.pathLine.geometry.attributes.position.needsUpdate = true;
    this.pathLine.geometry.setDrawRange(0, n);
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
      this.focus = { pos: new THREE.Vector3(g[ids[0] * 3], g[ids[0] * 3 + 1], g[ids[0] * 3 + 2]) };
    } else this.focus = null;
    this.attr.mark.needsUpdate = true;
    this.neighborLines.geometry.attributes.position.needsUpdate = true;
    this.neighborLines.geometry.setDrawRange(0, n * 2);
  }

  galaxyPosition(id) {
    const g = this.shapes.galaxy.pos;
    return new THREE.Vector3(g[id * 3], g[id * 3 + 1], g[id * 3 + 2]);
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
    return new THREE.Vector3(f[id * 3], f[id * 3 + 1], f[id * 3 + 2]);
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

  // De tre vägarna för ordet "fil" genom lagren. triangles: 13 x 3 x 2
  setFil(triangles, active = -1) {
    this.filData = triangles;
    while (this.filGroup.children.length) this.filGroup.remove(this.filGroup.children[0]);
    this.filDots = [];
    const scale = 1.35, steps = triangles.length;
    const yOf = (l) => LAYER_BOTTOM - 0.16 + (l / (steps - 1)) * (LAYER_TOP - LAYER_BOTTOM + 0.32);
    for (let s = 0; s < 3; s++) {
      const pts = triangles.map((tri, l) => new THREE.Vector3(tri[s][0] * scale, yOf(l), tri[s][1] * scale));
      const curve = new THREE.CatmullRomCurve3(pts);
      const dim = active >= 0 && active !== s;
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 120, dim ? 0.006 : 0.011, 8),
        new THREE.MeshBasicMaterial({ color: FIL_COLORS[s], transparent: true, opacity: 0, depthTest: false, blending: THREE.AdditiveBlending }));
      tube.userData.base = dim ? 0.45 : 1;
      this.filGroup.add(tube);
      for (const p of pts) {
        const dot = new THREE.Mesh(new THREE.SphereGeometry(dim ? 0.012 : 0.019, 12, 12),
          new THREE.MeshBasicMaterial({ color: FIL_COLORS[s], transparent: true, opacity: 0, depthTest: false, blending: THREE.AdditiveBlending }));
        dot.position.copy(p); dot.userData.base = dim ? 0.45 : 0.9;
        this.filGroup.add(dot);
      }
      this.filDots.push(pts);
    }
  }

  // ---------- Etiketter (HTML-element som följer punkter i 3D) ----------
  // group: vilken form etiketten hör till. getPos: funktion som ger platsen.
  setLabels(group, items) {
    for (const [key, l] of this.labels) if (l.group === group) { l.el.remove(); this.labels.delete(key); }
    items.forEach((it, i) => {
      const el = document.createElement('div');
      el.className = 'label ' + (it.cls || '');
      el.setAttribute('aria-hidden', 'true');
      el.innerHTML = it.html;
      this.labelRoot.appendChild(el);
      this.labels.set(group + ':' + i, { group, el, getPos: it.getPos, dx: it.dx || 0, dy: it.dy || 0 });
    });
  }

  // ---------- Form, kamera, bild ----------
  uploadShape(name) {
    const k = Math.max(0, Math.min(VIEWS.length - 2, this.pair));
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

  // Hur mycket en viss form syns just nu (0..1)
  weight(shape) {
    const k = Math.max(0, Math.min(VIEWS.length - 2, Math.floor(this.stage)));
    const t = Math.max(0, Math.min(1, this.stage - k));
    let w = 0;
    if (VIEWS[k].shape === shape) w += 1 - t;
    if (VIEWS[k + 1].shape === shape) w += t;
    return w;
  }

  weightOfStep(step) { return Math.max(0, 1 - Math.abs(this.stage - step)); }

  frame(dt) {
    if (!this.paused) this.time += dt;
    const stage = this.stage;
    const k = Math.max(0, Math.min(VIEWS.length - 2, Math.floor(stage)));
    const t = Math.max(0, Math.min(1, stage - k));
    if (k !== this.pair) this.applyPair(k);
    this.uniforms.uT.value = t;
    this.uniforms.uTime.value = this.time;

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

    // Kamera
    const a = VIEWS[k], b = VIEWS[k + 1];
    const e = t * t * (3 - 2 * t);
    const lerp = (x, y) => x + (y - x) * e;
    const pos = new THREE.Vector3(lerp(a.cam[0], b.cam[0]), lerp(a.cam[1], b.cam[1]), lerp(a.cam[2], b.cam[2]));
    const look = new THREE.Vector3(lerp(a.look[0], b.look[0]), lerp(a.look[1], b.look[1]), lerp(a.look[2], b.look[2]));
    const spin = lerp(a.spin, b.spin);
    // På smala skärmar ligger texten under bilden: backa kameran lite
    if (this.narrow) pos.multiplyScalar(1.5);
    if (!this.paused) this.spinAngle += spin * dt * (this.focus ? 0.15 : 1);
    this.group.rotation.y = this.spinAngle * Math.min(1, Math.abs(spin) * 60 + (this.weight('galaxy') + this.weight('brain') + this.weight('dust') > 0 ? 1 : 0));
    // Lager, solfjäder och ström ska alltid ses rakt framifrån
    const straight = this.weight('layers') + this.weight('fan') + this.weight('stream');
    this.group.rotation.y = this.spinAngle * (1 - Math.min(1, straight * 1.6));
    this.group.updateMatrixWorld();

    // Sökt ord: kameran går närmare
    const wantFocus = this.focus && this.weightOfStep(3) > 0.6 ? 1 : 0;
    this.focusAmount += (wantFocus - this.focusAmount) * Math.min(1, dt * (this.reduced ? 100 : 2.5));
    if (this.focusAmount > 0.001 && this.focus) {
      const wp = this.focus.pos.clone().applyMatrix4(this.group.matrixWorld);
      // Samma riktning som förut, men närmare och med ordet i mitten
      const fpos = wp.clone().add(pos.clone().sub(look).normalize().multiplyScalar(2.3));
      pos.lerp(fpos, this.focusAmount); look.lerp(wp, this.focusAmount);
    }
    if (!this.paused) { pos.x += this.pointer.x * 0.08; pos.y += -this.pointer.y * 0.05; }
    const smooth = this.reduced ? 1 : Math.min(1, dt * 6);
    this.camPos.lerp(pos, smooth); this.camLook.lerp(look, smooth);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    // Flytta bilden åt sidan, så att den hamnar bredvid textrutan
    const shift = this.narrow ? 0 : lerp(a.shiftX, b.shiftX) * (k % 2 === 0 ? 1 : 1);
    const side = this.sideFor ? this.sideFor(stage) : 1;
    // På smala skärmar ligger texten under bilden, utom i första steget där den ligger över
    const up = this.narrow ? this.height * (0.2 - 0.42 * this.weightOfStep(0)) : 0;
    this.camera.setViewOffset(this.width, this.height, -shift * side * this.width * 0.22, up, this.width, this.height);
    this.camera.updateMatrixWorld();

    // Synlighet för linjer och annat som hör till en viss form
    const brainW = this.weight('brain');
    this.brainLinks.material.opacity = 0.22 * Math.max(0, brainW * 2 - 1);
    this.brainLinks.visible = brainW > 0.5;
    const galW = Math.max(0, this.weightOfStep(3) * 2 - 1);
    this.pathLine.material.opacity = 0.75 * galW; this.pathLine.visible = galW > 0;
    this.neighborLines.material.opacity = 0.55 * galW; this.neighborLines.visible = galW > 0;
    const layW = Math.max(0, this.weight('layers') * 2 - 1);
    this.layerFrames.material.opacity = 0.3 * layW; this.layerFrames.visible = layW > 0;
    this.filGroup.visible = layW > 0;
    for (const m of this.filGroup.children) m.material.opacity = layW * m.userData.base;
    const fanW = Math.max(0, this.weight('fan') * 2 - 1);
    this.fanRibs.material.opacity = 0.6 * fanW; this.fanRibs.visible = fanW > 0;
    this.uniforms.uDim.value = 1 - 0.45 * this.weightOfStep(7) - 0.25 * Math.max(0, this.stage - 7);

    // Etiketter
    const v = new THREE.Vector3();
    const groupWeight = { galaxy: galW, fan: Math.max(0, this.weightOfStep(5) * 2 - 1) + Math.max(0, this.weightOfStep(6) * 2 - 1), fil: layW, search: galW };
    const placed = [];
    for (const l of this.labels.values()) {
      const w = Math.min(1, groupWeight[l.group] ?? 0);
      if (w <= 0.01) { l.el.style.opacity = 0; l.el.style.visibility = 'hidden'; continue; }
      v.copy(l.getPos()).applyMatrix4(this.group.matrixWorld).project(this.camera);
      if (v.z > 1) { l.el.style.visibility = 'hidden'; continue; }
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
