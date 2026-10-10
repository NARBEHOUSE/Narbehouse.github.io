/**
 * NARBE Racer — CPU renderer for visual checks without a browser (dev-only).
 *
 * Browsers, Electron and software WebGL are off-limits on the development PC
 * (they pinned the CPU and froze it), so this file renders the game's REAL
 * scene graph in plain Node: the game scripts build the world, racers and
 * props exactly as in the browser; a small 2D-canvas implementation paints
 * their procedural textures into pixel buffers; and a perspective-correct
 * rasteriser draws the result with the scene's own lights and fog.
 *
 *   node tools/node_render.cjs track <id> [--at f] [--secs s] [--mode open|nofail]
 *        [--mirror] [--x lane] [--w 480 --h 270] [--ss 2] [--out file.png]
 *   node tools/node_render.cjs props <name,name,...> [--out file.png]
 *
 * As a module: boot(), race(), chase(), render(), sheet(), text(), writePNG(),
 * propGallery(). One process, one core, no GPU. Approximations: flat lighting
 * per triangle, no shadows, no shader effects (Power Box glass and particle
 * sprites are drawn plainly or skipped), canvas clip() and text are ignored.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');

const GAME = path.join(__dirname, '..');

/* ══ Mini 2D canvas ══════════════════════════════════════════════════════ */
const NAMED = { white: [255, 255, 255, 1], black: [0, 0, 0, 1], transparent: [0, 0, 0, 0], red: [255, 0, 0, 1],
  yellow: [255, 255, 0, 1], blue: [0, 0, 255, 1], green: [0, 128, 0, 1], gold: [255, 215, 0, 1], orange: [255, 165, 0, 1],
  pink: [255, 192, 203, 1], purple: [128, 0, 128, 1], gray: [128, 128, 128, 1], grey: [128, 128, 128, 1] };
function hsl2rgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  const f = (n) => { const k = (n + h * 12) % 12; return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}
const colourCache = new Map();
function parseColour(s) {
  if (typeof s !== 'string') return [0, 0, 0, 1];
  let c = colourCache.get(s);
  if (c) return c;
  const t = s.trim().toLowerCase();
  if (t[0] === '#') {
    let h = t.slice(1);
    if (h.length === 3 || h.length === 4) h = h.split('').map((x) => x + x).join('');
    c = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), h.length >= 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1];
  } else if (t.startsWith('rgb')) {
    const n = t.slice(t.indexOf('(') + 1, t.indexOf(')')).split(/[\s,\/]+/).filter(Boolean).map(parseFloat);
    c = [n[0], n[1], n[2], n.length > 3 ? n[3] : 1];
  } else if (t.startsWith('hsl')) {
    const n = t.slice(t.indexOf('(') + 1, t.indexOf(')')).split(/[\s,\/]+/).filter(Boolean).map(parseFloat);
    c = hsl2rgb(n[0], n[1] / 100, n[2] / 100).concat([n.length > 3 ? n[3] : 1]);
  } else c = NAMED[t] || [128, 128, 128, 1];
  colourCache.set(s, c);
  return c;
}

class Gradient {
  constructor(kind, a) { this.kind = kind; this.a = a; this.stops = []; }
  addColorStop(o, col) { this.stops.push([o, parseColour(col)]); this.stops.sort((p, q) => p[0] - q[0]); }
  at(x, y) {
    const a = this.a;
    let t;
    if (this.kind === 'linear') {
      const dx = a[2] - a[0], dy = a[3] - a[1], L2 = dx * dx + dy * dy || 1;
      t = ((x - a[0]) * dx + (y - a[1]) * dy) / L2;
    } else {
      const d = Math.hypot(x - a[3], y - a[4]);
      t = (d - a[2]) / ((a[5] - a[2]) || 1);
    }
    const S = this.stops;
    if (!S.length) return [0, 0, 0, 0];
    if (t <= S[0][0]) return S[0][1];
    for (let i = 1; i < S.length; i++) {
      if (t <= S[i][0]) {
        const u = (t - S[i - 1][0]) / ((S[i][0] - S[i - 1][0]) || 1), p = S[i - 1][1], q = S[i][1];
        return [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u, p[2] + (q[2] - p[2]) * u, p[3] + (q[3] - p[3]) * u];
      }
    }
    return S[S.length - 1][1];
  }
}
class Pattern { constructor(img) { this.img = img; } at(x, y) { return this.img._px ? this.img._px(x, y) : [128, 128, 128, 1]; } }

class Ctx2D {
  constructor(cv) {
    this.canvas = cv;
    this.st = { fill: [0, 0, 0, 1], stroke: [0, 0, 0, 1], lineWidth: 1, alpha: 1, comp: 'source-over', m: [1, 0, 0, 1, 0, 0] };
    this.stack = []; this.paths = []; this.cur = null;
    this.font = '10px sans-serif'; this.textAlign = 'start'; this.textBaseline = 'alphabetic';
    this.lineCap = 'butt'; this.lineJoin = 'miter'; this.shadowBlur = 0; this.shadowColor = ''; this.filter = 'none';
    this.imageSmoothingEnabled = true; this.miterLimit = 10;
  }
  set fillStyle(v) { this.st.fill = typeof v === 'string' ? parseColour(v) : v; this._fs = v; }
  get fillStyle() { return this._fs; }
  set strokeStyle(v) { this.st.stroke = typeof v === 'string' ? parseColour(v) : v; this._ss = v; }
  get strokeStyle() { return this._ss; }
  set lineWidth(v) { this.st.lineWidth = v; } get lineWidth() { return this.st.lineWidth; }
  set globalAlpha(v) { this.st.alpha = v; } get globalAlpha() { return this.st.alpha; }
  set globalCompositeOperation(v) { this.st.comp = v; } get globalCompositeOperation() { return this.st.comp; }
  save() { this.stack.push(JSON.parse(JSON.stringify({ m: this.st.m, lineWidth: this.st.lineWidth, alpha: this.st.alpha, comp: this.st.comp })));
    this.stack[this.stack.length - 1].fill = this.st.fill; this.stack[this.stack.length - 1].stroke = this.st.stroke; }
  restore() { const s = this.stack.pop(); if (s) Object.assign(this.st, s); }
  setTransform(a, b, c, d, e, f) { if (typeof a === 'object') { const M = a; this.st.m = [M.a, M.b, M.c, M.d, M.e, M.f]; } else this.st.m = [a, b, c, d, e, f]; }
  resetTransform() { this.st.m = [1, 0, 0, 1, 0, 0]; }
  getTransform() { const m = this.st.m; return { a: m[0], b: m[1], c: m[2], d: m[3], e: m[4], f: m[5] }; }
  transform(a, b, c, d, e, f) {
    const m = this.st.m;
    this.st.m = [m[0] * a + m[2] * b, m[1] * a + m[3] * b, m[0] * c + m[2] * d, m[1] * c + m[3] * d, m[0] * e + m[2] * f + m[4], m[1] * e + m[3] * f + m[5]];
  }
  translate(x, y) { this.transform(1, 0, 0, 1, x, y); }
  scale(x, y) { this.transform(x, 0, 0, y, 0, 0); }
  rotate(a) { const c = Math.cos(a), s = Math.sin(a); this.transform(c, s, -s, c, 0, 0); }
  tp(x, y) { const m = this.st.m; return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; }
  beginPath() { this.paths = []; this.cur = null; }
  moveTo(x, y) { this.cur = [this.tp(x, y)]; this.paths.push(this.cur); this.last = [x, y]; }
  lineTo(x, y) { if (!this.cur) return this.moveTo(x, y); this.cur.push(this.tp(x, y)); this.last = [x, y]; }
  closePath() { if (this.cur && this.cur.length) { const p = this.cur[0]; this.cur.closed = true; this.cur = [p.slice()]; this.paths.push(this.cur); } }
  rect(x, y, w, h) { this.moveTo(x, y); this.lineTo(x + w, y); this.lineTo(x + w, y + h); this.lineTo(x, y + h); this.closePath(); }
  roundRect(x, y, w, h) { this.rect(x, y, w, h); }
  arc(x, y, r, a0, a1, ccw) { this.ellipse(x, y, r, r, 0, a0, a1, ccw); }
  ellipse(x, y, rx, ry, rot, a0, a1, ccw) {
    let sweep = a1 - a0;
    if (!ccw && sweep < 0) sweep = (sweep % (2 * Math.PI)) + 2 * Math.PI;
    if (ccw && sweep > 0) sweep = (sweep % (2 * Math.PI)) - 2 * Math.PI;
    if (Math.abs(a1 - a0) >= 2 * Math.PI) sweep = ccw ? -2 * Math.PI : 2 * Math.PI;
    const n = Math.max(6, Math.ceil(Math.abs(sweep) * Math.max(rx, ry) / 3));
    const cr = Math.cos(rot || 0), sr = Math.sin(rot || 0);
    for (let i = 0; i <= n; i++) {
      const a = a0 + sweep * i / n, px = Math.cos(a) * rx, py = Math.sin(a) * ry;
      const X = x + px * cr - py * sr, Y = y + px * sr + py * cr;
      if (i === 0 && !this.cur) this.moveTo(X, Y); else this.lineTo(X, Y);
    }
  }
  arcTo(x1, y1, x2, y2) { this.lineTo(x1, y1); this.lineTo(x2, y2); }
  quadraticCurveTo(cx, cy, x, y) {
    const p = this.last || [x, y];
    for (let i = 1; i <= 10; i++) { const t = i / 10, u = 1 - t; this.lineTo(u * u * p[0] + 2 * u * t * cx + t * t * x, u * u * p[1] + 2 * u * t * cy + t * t * y); }
  }
  bezierCurveTo(c1x, c1y, c2x, c2y, x, y) {
    const p = this.last || [x, y];
    for (let i = 1; i <= 14; i++) {
      const t = i / 14, u = 1 - t;
      this.lineTo(u * u * u * p[0] + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * x, u * u * u * p[1] + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * y);
    }
  }
  clip() {} setLineDash() {} getLineDash() { return []; }
  isPointInPath() { return false; }
  createLinearGradient(x0, y0, x1, y1) {
    const p = this.tp(x0, y0), q = this.tp(x1, y1);
    return new Gradient('linear', [p[0], p[1], q[0], q[1]]);
  }
  createRadialGradient(x0, y0, r0, x1, y1, r1) {
    const q = this.tp(x1, y1), sc = Math.hypot(this.st.m[0], this.st.m[1]);
    return new Gradient('radial', [0, 0, r0 * sc, q[0], q[1], r1 * sc]);
  }
  createConicGradient() { const g = new Gradient('linear', [0, 0, 1, 1]); return g; }
  createPattern(img) { return new Pattern(img); }
  measureText(s) { const px = parseFloat((/(\d+(\.\d+)?)px/.exec(this.font) || [0, 10])[1]); return { width: String(s).length * px * 0.55, actualBoundingBoxAscent: px * 0.7, actualBoundingBoxDescent: px * 0.2 }; }
  fillText() {} strokeText() {}
  polys() { return this.paths.filter((p) => p.length >= 2); }
  fill() { this.cv()._fillPolys(this.polys().filter((p) => p.length >= 3), this.st.fill, this.st.alpha, this.st.comp); }
  stroke() {
    const w = Math.max(1, this.st.lineWidth * Math.hypot(this.st.m[0], this.st.m[1])) / 2, quads = [];
    this.polys().forEach((p) => {
      const pts = p.slice();
      for (let i = 0; i + 1 < pts.length; i++) {
        const a = pts[i], b = pts[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L * w, ny = dx / L * w;
        quads.push([[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]]);
      }
    });
    quads.forEach((q) => this.cv()._fillPolys([q], this.st.stroke, this.st.alpha, this.st.comp));
  }
  fillRect(x, y, w, h) {
    const q = [this.tp(x, y), this.tp(x + w, y), this.tp(x + w, y + h), this.tp(x, y + h)];
    this.cv()._fillPolys([q], this.st.fill, this.st.alpha, this.st.comp);
  }
  strokeRect(x, y, w, h) { this.beginPath(); this.rect(x, y, w, h); this.stroke(); }
  clearRect(x, y, w, h) { const q = [this.tp(x, y), this.tp(x + w, y), this.tp(x + w, y + h), this.tp(x, y + h)]; this.cv()._fillPolys([q], [0, 0, 0, 0], 1, 'copy'); }
  drawImage(img, ...a) {
    if (!img || !img._buf) return;
    let sx = 0, sy = 0, sw = img.width, sh = img.height, dx, dy, dw, dh;
    if (a.length === 2) { [dx, dy] = a; dw = sw; dh = sh; } else if (a.length === 4) { [dx, dy, dw, dh] = a; } else { [sx, sy, sw, sh, dx, dy, dw, dh] = a; }
    const cv = this.cv(), d0 = this.tp(dx, dy), d1 = this.tp(dx + dw, dy + dh);
    for (let y = Math.max(0, Math.floor(Math.min(d0[1], d1[1]))); y < Math.min(cv.height, Math.ceil(Math.max(d0[1], d1[1]))); y++)
      for (let x = Math.max(0, Math.floor(Math.min(d0[0], d1[0]))); x < Math.min(cv.width, Math.ceil(Math.max(d0[0], d1[0]))); x++) {
        const u = (x + 0.5 - d0[0]) / (d1[0] - d0[0]), v = (y + 0.5 - d0[1]) / (d1[1] - d0[1]);
        const c = img._px(sx + u * sw, sy + v * sh);
        cv._blend(x, y, c, this.st.alpha, this.st.comp);
      }
  }
  getImageData(x, y, w, h) {
    const cv = this.cv(), d = new Uint8ClampedArray(w * h * 4);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const X = x + i, Y = y + j; if (X < 0 || Y < 0 || X >= cv.width || Y >= cv.height) continue;
      const s = (Y * cv.width + X) * 4, o = (j * w + i) * 4;
      d[o] = cv._buf[s]; d[o + 1] = cv._buf[s + 1]; d[o + 2] = cv._buf[s + 2]; d[o + 3] = cv._buf[s + 3];
    }
    return { width: w, height: h, data: d };
  }
  putImageData(img, x, y) {
    const cv = this.cv();
    for (let j = 0; j < img.height; j++) for (let i = 0; i < img.width; i++) {
      const X = x + i, Y = y + j; if (X < 0 || Y < 0 || X >= cv.width || Y >= cv.height) continue;
      const s = (j * img.width + i) * 4, o = (Y * cv.width + X) * 4;
      for (let k = 0; k < 4; k++) cv._buf[o + k] = img.data[s + k];
    }
  }
  createImageData(w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; }
  cv() { this.canvas._ensure(); return this.canvas; }
}

class MiniCanvas {
  constructor() { this._w = 300; this._h = 150; this._buf = null; this.style = {}; this.nodeName = 'CANVAS'; this.tagName = 'CANVAS'; }
  get width() { return this._w; } set width(v) { this._w = Math.max(1, v | 0); this._buf = null; }
  get height() { return this._h; } set height(v) { this._h = Math.max(1, v | 0); this._buf = null; }
  getContext() { return this._ctx || (this._ctx = new Ctx2D(this)); }
  _ensure() { if (!this._buf) this._buf = new Uint8ClampedArray(this._w * this._h * 4); }
  addEventListener() {} removeEventListener() {} getBoundingClientRect() { return { left: 0, top: 0, width: this._w, height: this._h }; }
  toDataURL() { return 'data:,'; }
  _px(x, y) {
    this._ensure();
    const X = ((Math.floor(x) % this._w) + this._w) % this._w, Y = ((Math.floor(y) % this._h) + this._h) % this._h, o = (Y * this._w + X) * 4;
    return [this._buf[o], this._buf[o + 1], this._buf[o + 2], this._buf[o + 3] / 255];
  }
  _blend(x, y, c, alpha, comp) {
    const o = (y * this._w + x) * 4, b = this._buf, a = (c[3] === undefined ? 1 : c[3]) * alpha;
    if (comp === 'copy') { b[o] = c[0]; b[o + 1] = c[1]; b[o + 2] = c[2]; b[o + 3] = a * 255; return; }
    if (comp === 'destination-out') { b[o + 3] = b[o + 3] * (1 - a); return; }
    if (a <= 0) return;
    const da = b[o + 3] / 255;
    if (comp === 'lighter') { b[o] += c[0] * a; b[o + 1] += c[1] * a; b[o + 2] += c[2] * a; b[o + 3] = Math.min(1, da + a) * 255; return; }
    if (comp === 'destination-over') {
      const oa = da + a * (1 - da);
      if (oa <= 0) return;
      for (let k = 0; k < 3; k++) b[o + k] = (b[o + k] * da + c[k] * a * (1 - da)) / oa;
      b[o + 3] = oa * 255; return;
    }
    if (comp === 'source-atop') { if (da <= 0) return; for (let k = 0; k < 3; k++) b[o + k] = b[o + k] * (1 - a) + c[k] * a; return; }
    const oa = a + da * (1 - a);
    for (let k = 0; k < 3; k++) b[o + k] = (c[k] * a + b[o + k] * da * (1 - a)) / oa;
    b[o + 3] = oa * 255;
  }
  /** Scanline fill (non-zero winding) of transformed polygons with a colour, gradient or pattern. */
  _fillPolys(polys, style, alpha, comp) {
    if (!polys.length) return;
    let minY = Infinity, maxY = -Infinity;
    const edges = [];
    polys.forEach((p) => {
      for (let i = 0; i < p.length; i++) {
        const a = p[i], b = p[(i + 1) % p.length];
        if (a[1] === b[1]) continue;
        edges.push(a[1] < b[1] ? [a[0], a[1], b[0], b[1], 1] : [b[0], b[1], a[0], a[1], -1]);
        minY = Math.min(minY, a[1], b[1]); maxY = Math.max(maxY, a[1], b[1]);
      }
    });
    const y0 = Math.max(0, Math.floor(minY)), y1 = Math.min(this._h - 1, Math.ceil(maxY));
    const solid = Array.isArray(style) ? style : null;
    for (let y = y0; y <= y1; y++) {
      const py = y + 0.5, xs = [];
      for (const e of edges) if (py >= e[1] && py < e[3]) xs.push([e[0] + (py - e[1]) / (e[3] - e[1]) * (e[2] - e[0]), e[4]]);
      if (!xs.length) continue;
      xs.sort((p, q) => p[0] - q[0]);
      let wind = 0;
      for (let k = 0; k < xs.length - 1; k++) {
        wind += xs[k][1];
        if (!wind) continue;
        const xa = Math.max(0, Math.ceil(xs[k][0] - 0.5)), xb = Math.min(this._w - 1, Math.floor(xs[k + 1][0] - 0.5));
        for (let x = xa; x <= xb; x++) this._blend(x, y, solid || style.at(x + 0.5, py), alpha, comp);
      }
    }
  }
}

/* ══ Booting the game scripts ═══════════════════════════════════════════ */
let booted = null;
const LOAD = ['spline', 'util', 'constants', 'art', 'art-items', 'props-sunshine', 'props-moonlight', 'props-gaps', 'props-wonder', 'props-wonder2', 'props-dream1', 'props-dream2',
  'roster', 'themes', 'tracks', 'world', 'items', 'guide', 'ai', 'race', 'camera'];
function boot(opts) {
  if (booted) return booted;
  const g = globalThis;
  g.window = g; g.self = g; g.devicePixelRatio = 1; g.innerWidth = 1280; g.innerHeight = 720;
  g.addEventListener = () => {}; g.removeEventListener = () => {};
  g.document = { createElement: (t) => (t === 'canvas' ? new MiniCanvas() : { style: {}, appendChild() {}, setAttribute() {}, addEventListener() {} }),
    getElementById: () => null, addEventListener() {}, removeEventListener() {}, body: { appendChild() {} }, querySelector: () => null };
  const store = new Map();
  g.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  g.requestAnimationFrame = () => 0;
  const warn = console.warn;
  if (!(opts && opts.verbose)) console.warn = () => {};
  g.THREE = require(path.join(GAME, 'js/three.min.js'));
  g.NK = {};
  const OPTIONAL = { 'props-gaps': 1, 'props-wonder': 1, 'props-wonder2': 1, 'props-dream1': 1, 'props-dream2': 1 };
  LOAD.forEach((name) => {
    const file = path.join(GAME, 'js', name + '.js');
    if (!fs.existsSync(file)) return;
    try { vm.runInThisContext(fs.readFileSync(file, 'utf8'), { filename: name + '.js' }); }
    catch (e) {
      if (!OPTIONAL[name] || (opts && opts.strict)) throw e;
      process.stderr.write('node_render: skipped ' + name + '.js (' + e.message + ')\n');
    }
  });
  console.warn = warn;
  booted = { THREE: g.THREE, NK: g.NK };
  return booted;
}

/** Build a track and a 12-racer field. Racer 0 is a human on autopilot. */
function race(trackId, o) {
  o = o || {};
  const { THREE, NK } = boot(o);
  const scene = new THREE.Scene();
  const W = NK.world.build(scene, trackId, { mode: o.mode || 'open', mirror: !!o.mirror, quality: { shadows: false, detail: 'high' } });
  const chars = NK.roster.CHARACTERS.map((c) => c.id);
  const R = NK.race.create({ world: W, scene, mode: o.mode || 'open', classId: o.classId || 'medium', laps: 3,
    humans: [{ charId: o.charId || 'pip', vehicleId: o.vehicleId || 'kart' }],
    cpus: o.cpus === 0 ? [] : chars.slice(1, 1 + (o.cpus || 11)).map((id, i) => ({ charId: id, vehicleId: NK.roster.VEHICLES[i % 4].id })) });
  R.skipIntro();
  R.setAutopilot(0, true);
  const camera = new THREE.PerspectiveCamera(55, (o.w || 480) / (o.h || 270), 0.35, 1600);
  const view = { camera, world: W, racer: R.racers[0] };
  return { THREE, NK, scene, W, R, view, camera, t: 0 };
}

/** Put racer 0 at lap fraction `at` (others spread just ahead/behind), then simulate. */
function place(S, at, o) {
  o = o || {};
  const { NK, R, W } = S;
  const p = at * W.L;
  R.racers.forEach((r, i) => {
    const off = i === 0 ? 0 : (o.spread === false ? -1000 - i * 20 : ((i % 2 ? 1 : -1) * (8 + i * 4)));
    Object.assign(r, { progress: p + off, s: NK.util.mod(p + off, W.L), x: NK.C.laneX(i === 0 ? (o.lane === undefined ? 2 : o.lane) : i % 5),
      v: R.classDef.speed * 0.95, y: 0, vy: 0, airT: 0, _jump: null, gliding: false, stepTarget: null, steer: 0,
      _prevProgress: p + off, _prevX: 0 });
    r.targetLane = NK.C.laneOf(r.x); r.lane = r.targetLane; r._prevX = r.x;
  });
  step(S, o.secs || 0.5);
}
function step(S, secs, dt) {
  dt = dt || 1 / 30;
  const n = Math.max(1, Math.round(secs / dt));
  for (let i = 0; i < n; i++) {
    S.R.update(dt); S.t += dt;
    S.NK.camera.chase(S.view, S.view.racer, dt, i === 0 && !S.snapped);
    S.snapped = true;
    S.W.update(dt, S.t, S.camera.position);
  }
}

/* ══ Rasteriser ══════════════════════════════════════════════════════════ */
const toLin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const toSRGB = (c) => { c = Math.max(0, Math.min(1, c)); return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; };
const LIN = new Float32Array(256); for (let i = 0; i < 256; i++) LIN[i] = toLin(i / 255);

function texSampler(THREE, tex) {
  if (!tex || !tex.image) return null;
  const img = tex.image;
  if (img._buf === undefined && !(img.data && img.width)) return null;
  const srgb = tex.colorSpace === THREE.SRGBColorSpace;
  const rx = tex.repeat ? tex.repeat.x : 1, ry = tex.repeat ? tex.repeat.y : 1, ox = tex.offset ? tex.offset.x : 0, oy = tex.offset ? tex.offset.y : 0;
  const flip = tex.flipY !== false;
  const wrapS = tex.wrapS === THREE.RepeatWrapping, wrapT = tex.wrapT === THREE.RepeatWrapping;
  let buf, W, H, chans = 4;
  if (img._buf !== undefined) { img._ensure(); buf = img._buf; W = img.width; H = img.height; }
  else { buf = img.data; W = img.width; H = img.height; chans = buf.length / (W * H); }
  return (u, v, out) => {
    u = u * rx + ox; v = v * ry + oy;
    u = wrapS ? u - Math.floor(u) : Math.min(1, Math.max(0, u));
    v = wrapT ? v - Math.floor(v) : Math.min(1, Math.max(0, v));
    if (flip) v = 1 - v;
    const x = Math.min(W - 1, Math.floor(u * W)), y = Math.min(H - 1, Math.floor(v * H)), o = (y * W + x) * chans;
    if (srgb) { out[0] = LIN[buf[o]]; out[1] = LIN[buf[o + 1]]; out[2] = LIN[buf[o + 2]]; }
    else { out[0] = buf[o] / 255; out[1] = buf[o + 1] / 255; out[2] = buf[o + 2] / 255; }
    out[3] = chans === 4 ? buf[o + 3] / 255 : 1;
    return out;
  };
}

/**
 * Render scene through camera to an RGB image { W, H, data }.
 * opts: { ss: supersample, sky: [top, mid, horizon] css, voidSky: bool, maxTris }
 */
function render(THREE, scene, camera, W, H, opts) {
  opts = opts || {};
  const ss = opts.ss || 1, w = W * ss, h = H * ss;
  scene.updateMatrixWorld(true); camera.updateMatrixWorld(true);
  camera.aspect = W / H; camera.updateProjectionMatrix();
  const col = new Float32Array(w * h * 3), zb = new Float32Array(w * h);
  const V = camera.matrixWorldInverse.elements, P = camera.projectionMatrix.elements, near = camera.near;
  const camPos = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);

  /* Background: the sky dome's gradient by view elevation (as world.js maps it). */
  const sky = (opts.sky || ['#2a86dd', '#79c3f1', '#e0f4fb']).map((c) => parseColour(c).slice(0, 3).map((v) => LIN[Math.round(v)]));
  const invPV = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).invert();
  const dir = new THREE.Vector3(), q = new THREE.Vector3();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x += 4) {
    q.set((x + 0.5) / w * 2 - 1, 1 - (y + 0.5) / h * 2, 0.5).applyMatrix4(invPV);
    dir.copy(q).sub(camPos).normalize();
    let e = Math.asin(Math.max(-1, Math.min(1, dir.y))) / (Math.PI / 2);
    if (e < 0) e = opts.voidSky ? -e : 0;
    const t = 1 - Math.pow(e, 0.72);
    const c = t < 0.55 ? sky[0].map((v, i) => v + (sky[1][i] - v) * t / 0.55) : sky[1].map((v, i) => v + (sky[2][i] - v) * (t - 0.55) / 0.45);
    for (let k = 0; k < 4 && x + k < w; k++) { const o = (y * w + x + k) * 3; col[o] = c[0]; col[o + 1] = c[1]; col[o + 2] = c[2]; }
  }

  /* Lights (three r155, physically based: irradiance × albedo / π). */
  let hemi = null, amb = [0, 0, 0];
  const suns = [];
  scene.traverseVisible((o) => {
    if (o.isHemisphereLight) hemi = { sky: [o.color.r, o.color.g, o.color.b].map((v) => v * o.intensity), gnd: [o.groundColor.r, o.groundColor.g, o.groundColor.b].map((v) => v * o.intensity) };
    if (o.isAmbientLight) amb = amb.map((v, i) => v + [o.color.r, o.color.g, o.color.b][i] * o.intensity);
    if (o.isDirectionalLight) {
      const d = new THREE.Vector3().setFromMatrixPosition(o.matrixWorld).sub(new THREE.Vector3().setFromMatrixPosition(o.target.matrixWorld)).normalize();
      suns.push({ d, c: [o.color.r, o.color.g, o.color.b].map((v) => v * o.intensity) });
    }
  });
  const fog = scene.fog ? { c: [scene.fog.color.r, scene.fog.color.g, scene.fog.color.b], near: scene.fog.near, far: scene.fog.far } : null;
  const INV_PI = 1 / Math.PI;

  function light(mat, n, out) {
    // out = multiplier on albedo (linear), per channel.
    let r = amb[0], g = amb[1], b = amb[2];
    if (hemi) { const t = 0.5 * n.y + 0.5; r += hemi.gnd[0] + (hemi.sky[0] - hemi.gnd[0]) * t; g += hemi.gnd[1] + (hemi.sky[1] - hemi.gnd[1]) * t; b += hemi.gnd[2] + (hemi.sky[2] - hemi.gnd[2]) * t; }
    for (const s of suns) {
      let d = n.x * s.d.x + n.y * s.d.y + n.z * s.d.z;
      if (mat.isMeshToonMaterial) d = d < -1 / 3 ? 0.47 : d < 1 / 3 ? 0.78 : 1;
      else d = Math.max(0, d);
      r += s.c[0] * d; g += s.c[1] * d; b += s.c[2] * d;
    }
    out[0] = r * INV_PI; out[1] = g * INV_PI; out[2] = b * INV_PI;
    return out;
  }

  const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  const sphere = new THREE.Sphere();
  const transparent = [];
  const mw = new THREE.Matrix4(), im = new THREE.Matrix4();
  const va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), nn = new THREE.Vector3();
  const lt = [0, 0, 0], tx = [0, 0, 0, 1], ex = [0, 0, 0, 1];
  let tris = 0;

  function view(p) {
    const x = p.x, y = p.y, z = p.z;
    return [V[0] * x + V[4] * y + V[8] * z + V[12], V[1] * x + V[5] * y + V[9] * z + V[13], V[2] * x + V[6] * y + V[10] * z + V[14]];
  }
  function proj(v) {
    const cx = P[0] * v[0] + P[4] * v[1] + P[8] * v[2] + P[12], cy = P[1] * v[0] + P[5] * v[1] + P[9] * v[2] + P[13], cw = P[3] * v[0] + P[7] * v[1] + P[11] * v[2] + P[15];
    return [(cx / cw + 1) / 2 * w, (1 - cy / cw) / 2 * h, 1 / cw];
  }

  /** Draw one triangle. a/b/c: world Vector3; attrs: per-vertex [r,g,b,u,v] (any may be null). */
  function tri(a, b, c, A, B, Cc, job) {
    tris++;
    e1.subVectors(b, a); e2.subVectors(c, a); nn.crossVectors(e1, e2);
    if (nn.lengthSq() < 1e-16) return;
    nn.normalize();
    const mx = (a.x + b.x + c.x) / 3, my = (a.y + b.y + c.y) / 3, mz = (a.z + b.z + c.z) / 3;
    const toCamDot = (camPos.x - mx) * nn.x + (camPos.y - my) * nn.y + (camPos.z - mz) * nn.z;
    const mat = job.mat, side = mat.side;
    const front = toCamDot > 0;
    if (side === THREE.FrontSide && !front) return;
    if (side === THREE.BackSide && front) return;
    if (!front) nn.negate();
    const unlit = mat.isMeshBasicMaterial || mat.isShaderMaterial || mat.isLineBasicMaterial;
    if (!unlit) light(mat, nn, lt);
    // Fog is per pixel from view depth, as three.js does (smoothstep near..far).
    const fogT = !!(fog && mat.fog !== false);
    // clip against the near plane in view space, carrying attributes
    const verts = [[view(a), A], [view(b), B], [view(c), Cc]];
    const poly = [];
    for (let i = 0; i < 3; i++) {
      const p = verts[i], q2 = verts[(i + 1) % 3];
      const inP = p[0][2] <= -near, inQ = q2[0][2] <= -near;
      if (inP) poly.push(p);
      if (inP !== inQ) {
        const t = (-near - p[0][2]) / (q2[0][2] - p[0][2]);
        const vv = [p[0][0] + (q2[0][0] - p[0][0]) * t, p[0][1] + (q2[0][1] - p[0][1]) * t, -near];
        const at = p[1] && q2[1] ? p[1].map((x, k) => x + (q2[1][k] - x) * t) : null;
        poly.push([vv, at]);
      }
    }
    if (poly.length < 3) return;
    const sp = poly.map((p) => { const s = proj(p[0]); return [s[0], s[1], s[2], p[1]]; });
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    sp.forEach((s) => { minX = Math.min(minX, s[0]); maxX = Math.max(maxX, s[0]); minY = Math.min(minY, s[1]); maxY = Math.max(maxY, s[1]); });
    if (maxX < 0 || minX >= w || maxY < 0 || minY >= h) return;
    for (let i = 1; i + 1 < sp.length; i++) raster(sp[0], sp[i], sp[i + 1], job, unlit, fogT);
  }

  function raster(s0, s1, s2, job, unlit, fogT) {
    const minX = Math.max(0, Math.floor(Math.min(s0[0], s1[0], s2[0]))), maxX = Math.min(w - 1, Math.ceil(Math.max(s0[0], s1[0], s2[0])));
    const minY = Math.max(0, Math.floor(Math.min(s0[1], s1[1], s2[1]))), maxY = Math.min(h - 1, Math.ceil(Math.max(s0[1], s1[1], s2[1])));
    if (minX > maxX || minY > maxY) return;
    const area = (s1[0] - s0[0]) * (s2[1] - s0[1]) - (s1[1] - s0[1]) * (s2[0] - s0[0]);
    if (Math.abs(area) < 1e-12) return;
    const mat = job.mat, A0 = s0[3], A1 = s1[3], A2 = s2[3];
    const hasAttr = !!(A0 && A1 && A2);
    const base = job.base, smp = job.map, emap = job.emap, alpha0 = job.alpha, aTest = mat.alphaTest || 0, blend = job.blend;
    for (let y = minY; y <= maxY; y++) {
      const py = y + 0.5;
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5;
        let w0 = ((s1[0] - px) * (s2[1] - py) - (s1[1] - py) * (s2[0] - px)) / area;
        let w1 = ((s2[0] - px) * (s0[1] - py) - (s2[1] - py) * (s0[0] - px)) / area;
        let w2 = 1 - w0 - w1;
        if (w0 < -1e-7 || w1 < -1e-7 || w2 < -1e-7) continue;
        const iz = w0 * s0[2] + w1 * s1[2] + w2 * s2[2];
        const o = y * w + x;
        if (iz <= zb[o]) continue;
        let r = base[0], g = base[1], b = base[2], a = alpha0;
        if (hasAttr) {
          // perspective-correct attribute weights
          const p0 = w0 * s0[2] / iz, p1 = w1 * s1[2] / iz, p2 = w2 * s2[2] / iz;
          if (A0[0] !== undefined && job.vcol) { r *= A0[0] * p0 + A1[0] * p1 + A2[0] * p2; g *= A0[1] * p0 + A1[1] * p1 + A2[1] * p2; b *= A0[2] * p0 + A1[2] * p1 + A2[2] * p2; }
          if (smp && A0[3] !== undefined) {
            const u = A0[3] * p0 + A1[3] * p1 + A2[3] * p2, v = A0[4] * p0 + A1[4] * p1 + A2[4] * p2;
            smp(u, v, tx); r *= tx[0]; g *= tx[1]; b *= tx[2]; a *= tx[3];
            if (emap) emap(u, v, ex);
          }
        }
        if (a < aTest || a <= 0.003) continue;
        if (!unlit) { r *= lt[0]; g *= lt[1]; b *= lt[2]; }
        if (job.em) {
          if (emap && hasAttr) { r += job.em[0] * ex[0]; g += job.em[1] * ex[1]; b += job.em[2] * ex[2]; }
          else { r += job.em[0]; g += job.em[1]; b += job.em[2]; }
        }
        if (fogT) {
          const u = Math.max(0, Math.min(1, (1 / iz - fog.near) / (fog.far - fog.near))), ft = u * u * (3 - 2 * u);
          r += (fog.c[0] - r) * ft; g += (fog.c[1] - g) * ft; b += (fog.c[2] - b) * ft;
        }
        const k = o * 3;
        if (blend === 'add') { col[k] += r * a; col[k + 1] += g * a; col[k + 2] += b * a; continue; }
        if (a >= 0.999 && !job.isTransparent) { zb[o] = iz; col[k] = r; col[k + 1] = g; col[k + 2] = b; }
        else { col[k] += (r - col[k]) * a; col[k + 1] += (g - col[k + 1]) * a; col[k + 2] += (b - col[k + 2]) * a; if (job.depthWrite) zb[o] = iz; }
      }
    }
  }

  function jobFor(obj, mat) {
    const c = mat.color ? [mat.color.r, mat.color.g, mat.color.b] : [0.8, 0.8, 0.8];
    let base = c;
    if (mat.isShaderMaterial) base = mat.transparent ? [0.55, 0.8, 1] : [1, 1, 1];
    const em = mat.emissive && mat.emissiveIntensity ? [mat.emissive.r * mat.emissiveIntensity, mat.emissive.g * mat.emissiveIntensity, mat.emissive.b * mat.emissiveIntensity] : null;
    return {
      mat, base, em,
      vcol: !!mat.vertexColors,
      map: texSampler(THREE, mat.map), emap: em ? texSampler(THREE, mat.emissiveMap) : null,
      alpha: mat.transparent ? (mat.opacity === undefined ? 1 : mat.opacity) * (mat.isShaderMaterial ? 0.55 : 1) : 1,
      isTransparent: !!mat.transparent,
      depthWrite: mat.depthWrite !== false,
      blend: mat.blending === THREE.AdditiveBlending ? 'add' : 'normal'
    };
  }

  function drawMesh(obj, mat, matrix, list) {
    const g = obj.geometry, pos = g.attributes.position;
    if (!pos) return;
    const idx = g.index, colA = g.attributes.color, uvA = g.attributes.uv;
    const job = jobFor(obj, mat);
    const n = idx ? idx.count : pos.count;
    const wantUV = !!job.map, wantC = job.vcol && !!colA;
    const P3 = [va, vb, vc];
    for (let i = 0; i + 2 < n; i += 3) {
      const ids = [idx ? idx.getX(i) : i, idx ? idx.getX(i + 1) : i + 1, idx ? idx.getX(i + 2) : i + 2];
      const attrs = [null, null, null];
      for (let k = 0; k < 3; k++) {
        const id = ids[k];
        P3[k].set(pos.getX(id), pos.getY(id), pos.getZ(id)).applyMatrix4(matrix);
        if (wantUV || wantC) attrs[k] = [wantC ? colA.getX(id) : 1, wantC ? colA.getY(id) : 1, wantC ? colA.getZ(id) : 1, wantUV && uvA ? uvA.getX(id) : 0, wantUV && uvA ? uvA.getY(id) : 0];
      }
      if (list) list.push([va.clone(), vb.clone(), vc.clone(), attrs[0], attrs[1], attrs[2], job]);
      else tri(va, vb, vc, attrs[0], attrs[1], attrs[2], job);
    }
  }

  scene.traverseVisible((obj) => {
    if (!obj.isMesh && !obj.isPoints) return;
    const mat = Array.isArray(obj.material) ? obj.material[0] : obj.material;
    if (!mat || mat.visible === false) return;
    // The sky dome is replaced by the gradient background above.
    if (obj.isMesh && mat.side === THREE.BackSide && obj.renderOrder === -10) return;
    if (obj.isPoints) {
      if (mat.isShaderMaterial || !obj.geometry.attributes.position) return;
      const pos = obj.geometry.attributes.position, cA = obj.geometry.attributes.color;
      for (let i = 0; i < pos.count; i += 2) {
        va.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(obj.matrixWorld);
        const v = view(va); if (v[2] > -near) continue;
        const s = proj(v), X = Math.round(s[0]), Y = Math.round(s[1]);
        if (X < 0 || Y < 0 || X >= w || Y >= h || zb[Y * w + X] > 0) continue;
        const k = (Y * w + X) * 3;
        col[k] = cA ? cA.getX(i) : 1; col[k + 1] = cA ? cA.getY(i) : 1; col[k + 2] = cA ? cA.getZ(i) : 1;
      }
      return;
    }
    const g = obj.geometry;
    if (!g.boundingSphere) g.computeBoundingSphere();
    const list = mat.transparent ? transparent : null;
    if (obj.isInstancedMesh) {
      for (let i = 0; i < obj.count; i++) {
        obj.getMatrixAt(i, im);
        if (Math.abs(im.determinant()) < 1e-9) continue;
        mw.multiplyMatrices(obj.matrixWorld, im);
        sphere.copy(g.boundingSphere).applyMatrix4(mw);
        if (!frustum.intersectsSphere(sphere)) continue;
        drawMesh(obj, mat, mw, list);
      }
      return;
    }
    if (obj.frustumCulled !== false) {
      sphere.copy(g.boundingSphere).applyMatrix4(obj.matrixWorld);
      if (!frustum.intersectsSphere(sphere)) return;
    }
    drawMesh(obj, mat, obj.matrixWorld, list);
  });
  transparent.forEach((t) => { t.d = Math.min(t[0].distanceToSquared(camPos), t[1].distanceToSquared(camPos), t[2].distanceToSquared(camPos)); });
  transparent.sort((p, q2) => q2.d - p.d).forEach((t) => tri(t[0], t[1], t[2], t[3], t[4], t[5], t[6]));

  const out = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) for (let c = 0; c < 3; c++) {
    let s = 0;
    for (let j = 0; j < ss; j++) for (let i = 0; i < ss; i++) s += col[((y * ss + j) * w + x * ss + i) * 3 + c];
    out[(y * W + x) * 3 + c] = Math.round(toSRGB(s / (ss * ss)) * 255);
  }
  return { W, H, data: out, tris };
}

/* ══ Images ═════════════════════════════════════════════════════════════ */
const FONT = { A: '01110100011000111111100011000110001', B: '11110100011000111110100011000111110', C: '01110100011000010000100001000101110', D: '11110100011000110001100011000111110', E: '11111100001000011110100001000011111', F: '11111100001000011110100001000010000', G: '01110100011000010111100011000101111', H: '10001100011000111111100011000110001', I: '01110001000010000100001000010001110', J: '00111000100001000010000101001001100', K: '10001100101010011000101001001010001', L: '10000100001000010000100001000011111', M: '10001110111010110101100011000110001', N: '10001110011010110011100011000110001', O: '01110100011000110001100011000101110', P: '11110100011000111110100001000010000', Q: '01110100011000110001101011001001101', R: '11110100011000111110101001001010001', S: '01111100001000001110000010000111110', T: '11111001000010000100001000010000100', U: '10001100011000110001100011000101110', V: '10001100011000110001100010101000100', W: '10001100011000110101101011010101010', X: '10001100010101000100010101000110001', Y: '10001100010101000100001000010000100', Z: '11111000010001000100010001000011111', 0: '01110100011001110101110011000101110', 1: '00100011000010000100001000010001110', 2: '01110100010000100010001000100011111', 3: '11111000100010000010000011000101110', 4: '00010001100101010010111110001000010', 5: '11111100001111000001000011000101110', 6: '00110010001000011110100011000101110', 7: '11111000010001000100010000100001000', 8: '01110100011000101110100011000101110', 9: '01110100011000101111000010001001100', '.': '00000000000000000000000000110001100', '-': '00000000000000011111000000000000000', ':': '00000011000110000000011000110000000', '=': '00000000001111100000111110000000000', '/': '00001000010001000100010001000010000', '+': '00000001000010011111001000010000000', ' ': '00000000000000000000000000000000000', '(': '00010001000100001000010000010000010', ')': '01000001000001000010000100010001000', '%': '11000110010001000100010001001100011', _: '00000000000000000000000000000011111', ',': '00000000000000000000001100010001000' };
function text(img, x, y, str, scale, color, bg) {
  scale = scale || 2; color = color || [255, 255, 255]; bg = bg || [0, 0, 0];
  str = String(str).toUpperCase();
  const cw = 6 * scale;
  for (let yy = y - scale; yy < y + 8 * scale; yy++) for (let xx = x - scale; xx < x + str.length * cw + scale; xx++) {
    if (xx < 0 || yy < 0 || xx >= img.W || yy >= img.H) continue;
    const o = (yy * img.W + xx) * 3; img.data[o] = bg[0]; img.data[o + 1] = bg[1]; img.data[o + 2] = bg[2];
  }
  for (let k = 0; k < str.length; k++) {
    const gl = FONT[str[k]] || FONT[' '];
    for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) if (gl[r * 5 + c] === '1') for (let j = 0; j < scale; j++) for (let i = 0; i < scale; i++) {
      const xx = x + k * cw + c * scale + i, yy = y + r * scale + j;
      if (xx < 0 || yy < 0 || xx >= img.W || yy >= img.H) continue;
      const o = (yy * img.W + xx) * 3; img.data[o] = color[0]; img.data[o + 1] = color[1]; img.data[o + 2] = color[2];
    }
  }
  return img;
}
function sheet(tiles, cols) {
  const tw = tiles[0].W, th = tiles[0].H, rows = Math.ceil(tiles.length / cols);
  const W = cols * tw + (cols - 1) * 4, H = rows * th + (rows - 1) * 4, data = Buffer.alloc(W * H * 3, 40);
  tiles.forEach((t, i) => {
    const ox = (i % cols) * (tw + 4), oy = Math.floor(i / cols) * (th + 4);
    for (let y = 0; y < th; y++) t.data.copy(data, ((oy + y) * W + ox) * 3, y * tw * 3, (y + 1) * tw * 3);
  });
  return { W, H, data };
}
function crc32(buf) { let c, crc = 0xffffffff; for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xffffffff) >>> 0; }
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]), crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); }
function writePNG(file, img) {
  const raw = Buffer.alloc((img.W * 3 + 1) * img.H);
  for (let y = 0; y < img.H; y++) { raw[y * (img.W * 3 + 1)] = 0; img.data.copy(raw, y * (img.W * 3 + 1) + 1, y * img.W * 3, (y + 1) * img.W * 3); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(img.W, 0); ihdr.writeUInt32BE(img.H, 4); ihdr[8] = 8; ihdr[9] = 2;
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}

/** Render a track view: racer 0 at lap fraction `at`, chase camera. */
function trackShot(S, o) {
  o = o || {};
  const theme = S.W.theme;
  return render(S.THREE, S.scene, o.camera || S.camera, o.w || 480, o.h || 270,
    { ss: o.ss || 2, sky: theme.sky, voidSky: !theme.ground || theme.ground.type === 'none' });
}

/** Studio gallery of props: each in its own tile, camera framed on its bounds. */
function propGallery(names, o) {
  o = o || {};
  const { THREE, NK } = boot(o);
  const tiles = [];
  names.forEach((name) => {
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xd8efff, 0x6aa84a, 2.1), new THREE.AmbientLight(0xffffff, 0.6));
    const sun = new THREE.DirectionalLight(0xfff2d6, 3.2); sun.position.set(-5.5, 10, 4.5); scene.add(sun, sun.target);
    const fn = NK.art.props[name] || NK.art.hazard[name];
    let obj = null, err = null;
    try { obj = fn ? fn(NK.util.rng(NK.util.hash(name))) : null; } catch (e) { err = e.message; }
    const tw = o.w || 320, th = o.h || 240;
    if (!obj) { const img = { W: tw, H: th, data: Buffer.alloc(tw * th * 3, 60) }; text(img, 6, 6, name + (err ? ' ERR' : ' MISSING'), 2, [255, 120, 120]); tiles.push(img); return; }
    if (obj.userData && typeof obj.userData.anim === 'function') { try { obj.userData.anim(1.3, 0.016); } catch (e) { /* ignore */ } }
    if (obj.userData && typeof obj.userData.setState === 'function') { try { obj.userData.setState(true, false, 0.2); } catch (e) { /* ignore */ } }
    scene.add(obj);
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj), size = new THREE.Vector3(), c = new THREE.Vector3();
    box.getSize(size); box.getCenter(c);
    const r = Math.max(size.x, size.y, size.z) * 0.5 + 0.01;
    const cam = new THREE.PerspectiveCamera(35, tw / th, Math.max(0.05, r * 0.02), r * 40);
    const yaw = o.yaw === undefined ? -0.6 : o.yaw;
    const dist = r / Math.sin(35 * Math.PI / 360) * 1.05;
    cam.position.set(c.x + Math.sin(yaw) * dist * 0.85, c.y + dist * 0.38, c.z - Math.cos(yaw) * dist * 0.85);
    cam.lookAt(c);
    // ground grid so scale reads: 1 m checker under the prop
    const gsz = Math.max(4, Math.ceil(r * 2.4));
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(gsz, gsz).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x8a9a7a }));
    ground.position.set(c.x, box.min.y - 0.01, c.z); scene.add(ground);
    let tri = 0; obj.traverse((m) => { if (m.isMesh) tri += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; });
    let calls = 0; obj.traverse((m) => { if (m.isMesh) calls++; });
    const img = render(THREE, scene, cam, tw, th, { ss: o.ss || 2, sky: ['#7fb2d9', '#bcd9ec', '#eef6fb'] });
    text(img, 4, 4, name, 1);
    text(img, 4, th - 12, size.x.toFixed(1) + 'X' + size.y.toFixed(1) + 'X' + size.z.toFixed(1) + 'M ' + calls + ' MESH ' + Math.round(tri) + ' TRI', 1);
    tiles.push(img);
  });
  return sheet(tiles, o.cols || Math.min(4, tiles.length));
}

module.exports = { boot, race, place, step, render, trackShot, propGallery, text, sheet, writePNG, MiniCanvas };

/* ══ CLI ═════════════════════════════════════════════════════════════════ */
if (require.main === module) {
  const a = process.argv.slice(2);
  const arg = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : d; };
  const flag = (k) => a.includes('--' + k);
  const t0 = Date.now();
  if (a[0] === 'track') {
    const S = race(a[1], { mode: arg('mode', 'open'), mirror: flag('mirror'), w: +arg('w', 480), h: +arg('h', 270) });
    place(S, +arg('at', 0.05), { secs: +arg('secs', 0.6), lane: +arg('x', 2) });
    const img = trackShot(S, { w: +arg('w', 480), h: +arg('h', 270), ss: +arg('ss', 2) });
    text(img, 4, 4, a[1] + ' @' + arg('at', 0.05), 1);
    const out = arg('out', path.join(GAME, '../../../../tmp/nk-render/' + a[1] + '.png'));
    writePNG(out, img);
    console.log('wrote', path.resolve(out), img.tris + ' tris', (Date.now() - t0) + ' ms');
  } else if (a[0] === 'props') {
    const img = propGallery(a[1].split(','), { cols: +arg('cols', 4), w: +arg('w', 320), h: +arg('h', 240) });
    const out = arg('out', path.join(GAME, '../../../../tmp/nk-render/props.png'));
    writePNG(out, img);
    console.log('wrote', path.resolve(out), (Date.now() - t0) + ' ms');
  } else {
    console.log('usage: node tools/node_render.cjs track <id> [--at f] [--secs s] | props <a,b,c>');
  }
}
