/**
 * Benny's P3GL — Hyper backdrops: Neon Highway, Starlight Warp, Quasar Core.
 *
 * Synthwave / deep-space worlds for the Hyper campaign. Everything is
 * procedural (geometry in code, shaders, one small canvas atlas). Every
 * custom shader knows where the board sits on screen (uBoard) and dims what
 * passes behind it, so the spectacle lives at the sides (wide screens) or
 * above and below the board (tall phones) while pegs stay readable.
 *
 * Photosensitivity: no full-screen flashes. Beat reactions are local (grid
 * lines, streaks, rings) and eased; 'win' swells over ~0.4 s and settles over
 * seconds. reducedMotion = slow drift only, no beat pulses.
 *
 * Registers 'neon-highway', 'starlight-warp', 'quasar-core' with P3.backdrops
 * (see js/backdrops.js for the factory contract).
 */
(function (root) {
  'use strict';

  const P3 = root.P3 = root.P3 || {};

  /* ── GLSL shared by every hyper shader ────────────────────────────────── */

  const NOISE = `
const mat2 ROT2 = mat2(0.8, 0.6, -0.6, 0.8);
float hash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash13(vec3 p3) { p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
float vnoise3(vec3 p) {
  vec3 i = floor(p), f = fract(p); vec3 u = f * f * (3.0 - 2.0 * f);
  float a = mix(mix(hash13(i), hash13(i + vec3(1.0, 0.0, 0.0)), u.x), mix(hash13(i + vec3(0.0, 1.0, 0.0)), hash13(i + vec3(1.0, 1.0, 0.0)), u.x), u.y);
  float b = mix(mix(hash13(i + vec3(0.0, 0.0, 1.0)), hash13(i + vec3(1.0, 0.0, 1.0)), u.x), mix(hash13(i + vec3(0.0, 1.0, 1.0)), hash13(i + vec3(1.0, 1.0, 1.0)), u.x), u.y);
  return mix(a, b, u.z);
}
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < OCT; i++) { s += a * vnoise(p); p = ROT2 * p * 2.03 + vec2(11.7, 5.3); a *= 0.5; } return s; }
float fbm3(vec3 p) { float s = 0.0, a = 0.5; for (int i = 0; i < OCT; i++) { s += a * vnoise3(p); p = p * 2.03 + vec3(7.1, 3.7, 9.2); a *= 0.5; } return s; }
`;

  // Board-aware dimming. uBoard = board rect in screen uv (x0, y0, x1, y1, y up);
  // uView = (css width, css height, how much to dim behind the board).
  const MASK = `
uniform vec4 uBoard;
uniform vec3 uView;
vec2 sUV() { return vClip.xy / vClip.w * 0.5 + 0.5; }
float boardMask(vec2 s) {
  vec2 px = s * uView.xy;
  vec2 d = max(uBoard.xy * uView.xy - px, px - uBoard.zw * uView.xy);
  float e = max(d.x, d.y);
  float soft = 0.06 * min(uView.x, uView.y);
  return 1.0 - smoothstep(-soft, soft * 0.5, e);
}
float calm(vec2 s) { return 1.0 - boardMask(s) * uView.z; }
`;

  // Expands a 3D segment (view space, tail a → head b) into a screen-space
  // ribbon of constant pixel width with soft caps. corner.x 0 tail / 1 head,
  // corner.y -1 / 1 across.
  const RIBBON = `
uniform vec4 uBoard;
uniform vec3 uView;
vec4 ribbon(vec3 a, vec3 b, vec2 corner, float widthPx) {
  float nz = -0.6;
  if (b.z > nz) return vec4(2.0, 2.0, 2.0, 1.0);
  if (a.z > nz) a = mix(b, a, clamp((b.z - nz) / max(b.z - a.z, 1e-4), 0.0, 1.0));
  vec4 ca = projectionMatrix * vec4(a, 1.0);
  vec4 cb = projectionMatrix * vec4(b, 1.0);
  vec2 half_ = uView.xy * 0.5;
  vec2 d = (cb.xy / cb.w - ca.xy / ca.w) * half_;
  float L = length(d);
  vec2 dir = L > 1e-4 ? d / L : vec2(0.0, 1.0);
  vec2 n = vec2(-dir.y, dir.x);
  vec4 c = mix(ca, cb, corner.x);
  vec2 off = n * corner.y * widthPx + dir * (corner.x * 2.0 - 1.0) * widthPx;
  c.xy += off / half_ * c.w;
  return c;
}
`;

  const OUT = '\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n';

  /* ── Small JS helpers ─────────────────────────────────────────────────── */

  const TAU = Math.PI * 2;
  const clamp01 = (x) => x < 0 ? 0 : x > 1 ? 1 : x;
  const smooth01 = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
  const lerp = (a, b, k) => a + (b - a) * k;

  /** Uniforms every shader of a world shares (board rect, view size, clock). */
  function makeCommon(ctx) {
    const THREE = ctx.THREE;
    return {
      THREE,
      oct: ctx.quality === 'low' ? 3 : 5,
      uBoard: { value: new THREE.Vector4(0.25, 0.02, 0.75, 0.98) },
      uView: { value: new THREE.Vector3(1600, 900, 0.62) },
      uTime: { value: 0 }
    };
  }

  /** ShaderMaterial with the shared chunks and uniforms wired in. */
  function shader(C, o) {
    const THREE = C.THREE;
    const uniforms = Object.assign({ uBoard: C.uBoard, uView: C.uView, uTime: C.uTime }, o.uniforms || {});
    const m = new THREE.ShaderMaterial({
      uniforms,
      defines: Object.assign({ OCT: C.oct }, o.defines || {}),
      vertexShader: 'varying vec4 vClip;\n' + NOISE + (o.ribbon ? RIBBON : '') + o.vert,
      fragmentShader: 'varying vec4 vClip;\n' + NOISE + MASK + o.frag,
      transparent: !!o.transparent,
      depthWrite: o.depthWrite !== undefined ? o.depthWrite : !o.transparent,
      depthTest: o.depthTest !== false,
      side: o.side !== undefined ? o.side : THREE.FrontSide,
      blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      extensions: { derivatives: true }
    });
    if (o.premul) {   // rgb is added, alpha occludes what's behind
      m.blending = THREE.CustomBlending;
      m.blendEquation = THREE.AddEquation;
      m.blendSrc = THREE.OneFactor;
      m.blendDst = THREE.OneMinusSrcAlphaFactor;
    }
    if (o.additive) { // pure add, ignore alpha for the colour factor
      m.blending = THREE.CustomBlending;
      m.blendEquation = THREE.AddEquation;
      m.blendSrc = THREE.OneFactor;
      m.blendDst = THREE.OneFactor;
    }
    return m;
  }

  /** Board rect (screen uv, y up) for this viewport; mirrors js/layout.js. */
  function boardRect(w, h, v4) {
    let b = null;
    try { if (P3.layout && P3.layout.compute) b = P3.layout.compute(w, h).board; } catch (e) { b = null; }
    if (!b) {
      const A = 1000 / 1080;
      if (w / h > 1.18) {
        let bh = h * 0.964, bw = bh * A;
        const side = Math.max(150, Math.min(300, w * 0.16));
        if (w - bw < side * 2) { bw = w - side * 2; bh = bw / A; }
        b = { x: (w - bw) / 2, y: (h - bh) / 2, w: bw, h: bh };
      } else {
        const tb = Math.max(64, Math.min(110, h * 0.09)), bb = Math.max(84, Math.min(130, h * 0.11));
        let bw = w * 0.976, bh = bw / A;
        const room = h - tb - bb;
        if (bh > room) { bh = room; bw = bh * A; }
        b = { x: (w - bw) / 2, y: tb + (room - bh) * 0.35, w: bw, h: bh };
      }
    }
    v4.set(b.x / w, 1 - (b.y + b.h) / h, (b.x + b.w) / w, 1 - b.y / h);
    return { wide: w / h > 1.18, x0: v4.x, y0: v4.y, x1: v4.z, y1: v4.w };
  }

  /** World point on the ray through screen uv (u, v; y up) at distance d from the camera. */
  function screenRay(camera, u, v, d, out) {
    camera.updateMatrixWorld(true);
    out.set(u * 2 - 1, v * 2 - 1, 0.5).unproject(camera).sub(camera.position).normalize();
    return out.multiplyScalar(d).add(camera.position);
  }
  /** World units per CSS pixel at distance d (vertical). */
  function unitsPerPx(camera, h, d) { return 2 * d * Math.tan(camera.fov * Math.PI / 360) / Math.max(1, h); }

  /**
   * Beat envelopes: kick (fast attack, decays over the beat) and bar swell
   * (smooth over four beats). Zero when reduced motion or no music.
   */
  function makeBeat() {
    const s = { kick: 0, bar: 0, barPhase: 0, index: -1, barIndex: -1, newBeat: false, newBar: false, on: 0 };
    s.step = function (beat, reduced, dt) {
      s.newBeat = false; s.newBar = false;
      const playing = !!(beat && beat.playing && !reduced);
      s.on += ((playing ? 1 : 0) - s.on) * Math.min(1, dt * 2);
      if (!playing) { s.kick *= Math.exp(-dt * 6); s.bar *= Math.exp(-dt * 2); return s; }
      const ph = beat.phase || 0;
      const k = ph < 0.06 ? ph / 0.06 : Math.exp(-(ph - 0.06) * 5.0);
      s.kick = k * s.on;
      const b = beat.beat || 0;
      s.barPhase = (((b % 4) + 4) % 4) / 4;
      s.bar = (0.5 - 0.5 * Math.cos(s.barPhase * TAU)) * s.on;
      const bi = Math.floor(b), bari = Math.floor(b / 4);
      if (bi !== s.index) { s.newBeat = s.index >= 0; s.index = bi; }
      if (bari !== s.barIndex) { s.newBar = s.barIndex >= 0; s.barIndex = bari; }
      return s;
    };
    return s;
  }

  /** Eased impulse envelopes for pulse(kind). Re-firing never dips. */
  function makePulses() {
    const K = ['hit', 'beat', 'fever', 'goal', 'win'];
    const T = { hit: [0.03, 0.22], beat: [0.03, 0.25], fever: [0.25, 1.6], goal: [0.2, 1.1], win: [0.45, 2.2] };  // [rise, decay]
    const st = {};
    K.forEach(k => { st[k] = { t: 99, s: 0, base: 0 }; });
    function env(k) {
      const e = st[k], r = T[k][0], d = T[k][1];
      const fresh = e.s * smooth01(e.t / r) * Math.exp(-Math.max(0, e.t - r) / d);
      return Math.max(fresh, e.base * Math.exp(-e.t / d));
    }
    return {
      fire(kind, s) {
        const e = st[kind]; if (!e) return;
        e.base = env(kind); e.t = 0;
        e.s = Math.max(0.2, Math.min(1.5, (s === undefined || s === null) ? 1 : +s || 1));
      },
      step(dt) { for (let i = 0; i < K.length; i++) st[K[i]].t += dt; },
      env
    };
  }

  /** Keyframed palette: array of {v, colors:{name:hex}} → lerps into THREE.Colors. */
  function makePalette(THREE, keys) {
    const names = Object.keys(keys[0].c);
    const frames = keys.map(k => ({ v: k.v, c: names.map(n => new THREE.Color(k.c[n])) }));
    const out = {};
    names.forEach(n => { out[n] = new THREE.Color(); });
    out.at = function (v) {
      let i = 0;
      while (i < frames.length - 2 && v > frames[i + 1].v) i++;
      const a = frames[i], b = frames[Math.min(frames.length - 1, i + 1)];
      const k = b.v > a.v ? smooth01((v - a.v) / (b.v - a.v)) : 0;
      for (let j = 0; j < names.length; j++) out[names[j]].copy(a.c[j]).lerp(b.c[j], k);
      return out;
    };
    return out;
  }

  /** Instanced quad: corner attribute (x 0..1, y -1..1) + per-instance vec4 attributes. */
  function instancedQuad(THREE, count, attrs) {
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, -1, 0, 1, -1, 0, 1, 1, 0, 0, 1, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    Object.keys(attrs).forEach(n => g.setAttribute(n, new THREE.InstancedBufferAttribute(attrs[n], 4)));
    g.instanceCount = count;
    return g;
  }

  /** Points shader material for star fields: per-point size/colour/twinkle phase. */
  function starPoints(C, count, place, opts) {
    const THREE = C.THREE;
    opts = opts || {};
    const pos = new Float32Array(count * 3), col = new Float32Array(count * 3), aux = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) place(i, pos, col, aux);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aux', new THREE.BufferAttribute(aux, 2));
    const m = shader(C, {
      transparent: true, additive: true, depthWrite: false,
      uniforms: { uGain: { value: 1 }, uScale: { value: 1 }, uTw: { value: opts.twinkle === undefined ? 1 : opts.twinkle } },
      vert: `
attribute vec3 color; attribute vec2 aux;
uniform float uTime; uniform float uScale; uniform float uTw; uniform float uGain;
varying vec3 vC;
void main() {
  float tw = 1.0 + uTw * 0.45 * sin(uTime * (1.3 + aux.y * 2.7) + aux.y * 40.0);
  vC = color * tw * uGain;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = max(1.0, aux.x * uScale);
  vClip = gl_Position;
}`,
      frag: `
varying vec3 vC;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(q, q);
  float a = exp(-r2 * 4.5) + 0.25 * exp(-r2 * 1.2);
  if (a < 0.01) discard;
  gl_FragColor = vec4(vC * a * calm(sUV()), 1.0);
  ${OUT}
}`
    });
    const p = new THREE.Points(g, m);
    p.frustumCulled = false;
    p.renderOrder = -8;
    return p;
  }

  /* ════════════════════════════════════════════════════════════════════════
   * 1. NEON HIGHWAY — outrun road, striped sun, grid mountains, palms.
   * ════════════════════════════════════════════════════════════════════════ */

  function neonHighway(ctx) {
    const { THREE, scene, camera, helpers } = ctx;
    const high = ctx.quality !== 'low';
    const reduced = !!ctx.reducedMotion;
    const C = makeCommon(ctx);
    const rnd = helpers.rng((ctx.seed || 1) ^ 0x9e3779b);
    const beat = makeBeat(), pulses = makePulses();
    const ROAD = 9;              // road half width
    const PERIOD = 2048;         // scroll wraps here (terrain noise is periodic in it)
    const DZ = high ? 8 : 16;    // ground row spacing (divides PERIOD)
    const CELL = 8;              // grid cell
    const tmp = new THREE.Vector3();

    camera.near = 0.5; camera.far = 4000;
    camera.rotation.order = 'YXZ';
    camera.position.set(0, 5.2, 0);

    const pal = makePalette(THREE, [
      { v: 0, c: { top: '#0a0220', mid: '#3a0a5c', hor: '#ff3d8b', haze: '#c42a7c', ground: '#0d0322', grid: '#ff3df2', hill: '#ff6ad5', edge: '#2de2ff', sunTop: '#ffe86b', sunMid: '#ff7a3a', sunBot: '#ff1f7a', sunGlow: '#ff4f8f', star: '#ffd6f4', rim: '#ff7ae0', auroraA: '#2dffb0', auroraB: '#ff3df2', planet: '#6b4cff', planetRim: '#2de2ff', ring: '#ff9ce8', ridge: '#16052a', lamp: '#ff9cf0', winA: '#ffb36b', winB: '#ff5ad8' } },
      { v: 6, c: { top: '#060118', mid: '#260a52', hor: '#d81e7a', haze: '#8a1c74', ground: '#0a0220', grid: '#e83cff', hill: '#7a6bff', edge: '#2de2ff', sunTop: '#ffc35c', sunMid: '#ff5a3a', sunBot: '#ff1f6a', sunGlow: '#ff3d7a', star: '#e8dcff', rim: '#c46bff', auroraA: '#2dffb0', auroraB: '#ff3df2', planet: '#5a3cff', planetRim: '#2de2ff', ring: '#ff9ce8', ridge: '#12042a', lamp: '#ff9cf0', winA: '#ffc46b', winB: '#ff5ad8' } },
      { v: 12, c: { top: '#02010c', mid: '#0d0a33', hor: '#4a157a', haze: '#2a1460', ground: '#05031a', grid: '#2de2ff', hill: '#b44cff', edge: '#ff3df2', sunTop: '#ff9a4c', sunMid: '#ff4a4a', sunBot: '#ff1f8a', sunGlow: '#ff2f6a', star: '#dfe8ff', rim: '#2de2ff', auroraA: '#2dffb0', auroraB: '#ff3df2', planet: '#4cc4ff', planetRim: '#9bf6ff', ring: '#ffb0f0', ridge: '#070420', lamp: '#9cf2ff', winA: '#ffd08a', winB: '#5ae8ff' } },
      { v: 19, c: { top: '#000309', mid: '#03182a', hor: '#0e4f63', haze: '#0b3a52', ground: '#020a16', grid: '#21ffc8', hill: '#8f5cff', edge: '#ff3df2', sunTop: '#ff9a4c', sunMid: '#ff4a4a', sunBot: '#ff1f8a', sunGlow: '#ff2f6a', star: '#e0fff6', rim: '#21ffc8', auroraA: '#21ffa8', auroraB: '#d34cff', planet: '#3df0c0', planetRim: '#b8fff0', ring: '#d6b0ff', ridge: '#020c18', lamp: '#9cffe6', winA: '#b8fff0', winB: '#d48aff' } }
    ]);

    /* Sky dome: gradient, sun glow on the horizon, aurora curtains. */
    const skyU = {
      uTop: { value: new THREE.Color() }, uMid: { value: new THREE.Color() }, uHor: { value: new THREE.Color() },
      uSunCol: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(0.5, 0.05, -1).normalize() },
      uAurora: { value: 0 }, uAurA: { value: new THREE.Color() }, uAurB: { value: new THREE.Color() }, uGlow: { value: 1 }, uAurBase: { value: 0.06 }
    };
    const sky = new THREE.Mesh(new THREE.SphereGeometry(2600, 48, 24), shader(C, {
      side: THREE.BackSide, depthWrite: false, uniforms: skyU,
      vert: `varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); vClip = gl_Position; }`,
      frag: `
uniform vec3 uTop, uMid, uHor, uSunCol, uSunDir, uAurA, uAurB; uniform float uAurora, uTime, uGlow, uAurBase;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float e = d.y;
  vec3 c = mix(uHor * 0.75, uMid, smoothstep(-0.01, 0.2, e));
  c = mix(c, uTop, smoothstep(0.16, 0.7, e));
  c += uHor * exp(-abs(e) * 38.0) * 0.55 * uGlow;
  float sd = max(dot(d, uSunDir), 0.0);
  c += uSunCol * (pow(sd, 24.0) * 0.9 + pow(sd, 5.0) * 0.18) * (1.0 - smoothstep(-0.05, 0.45, e)) * uGlow;
  float az0 = atan(d.x, -d.z);
  float cb = smoothstep(0.015, 0.05, e) * (1.0 - smoothstep(0.12, 0.3, e));
  if (cb > 0.0) {
    float cl = fbm(vec2(az0 * 2.2 + uTime * 0.004, e * 26.0));
    float cm2 = smoothstep(0.5, 0.72, cl) * cb;
    vec3 lit = mix(uHor * 0.5, uSunCol * 0.9, pow(sd, 3.0));
    c = mix(c, uTop * 0.6 + lit * (0.5 + 0.8 * (1.0 - smoothstep(0.5, 0.66, cl))), cm2 * 0.75);
  }
  if (uAurora > 0.001 && e > -0.02) {
    float az = atan(d.x, -d.z);
    float base = uAurBase + 0.09 * fbm(vec2(az * 1.6 + uTime * 0.02, 3.1));
    float h = e - base;
    float wav = fbm(vec2(az * 3.0, uTime * 0.03));
    float rays = 0.45 + 0.55 * vnoise(vec2(az * 70.0 + wav * 9.0, uTime * 0.15));
    float prof = smoothstep(-0.03, 0.012, h) * exp(-max(h, 0.0) * 5.0);
    float band = smoothstep(0.32, 0.72, fbm(vec2(az * 2.4 - uTime * 0.025, 7.0 + uTime * 0.01)));
    vec3 ac = mix(uAurA, uAurB, smoothstep(0.0, 0.3, h));
    c += ac * prof * rays * band * uAurora * 1.25;
  }
  c *= mix(1.0, 0.75, boardMask(sUV()) * uView.z);
  gl_FragColor = vec4(c, 1.0);
  ${OUT}
}`
    }));
    sky.renderOrder = -10;
    scene.add(sky);

    /* Stars above the horizon. */
    const starCount = high ? 1500 : 700;
    const stars = starPoints(C, starCount, (i, pos, col, aux) => {
      const az = (rnd() - 0.5) * Math.PI * 1.4;
      const el = Math.asin(0.02 + Math.pow(rnd(), 0.8) * 0.96);
      const r = 2200;
      pos[i * 3] = Math.sin(az) * Math.cos(el) * r; pos[i * 3 + 1] = Math.sin(el) * r; pos[i * 3 + 2] = -Math.cos(az) * Math.cos(el) * r;
      const b = 0.35 + Math.pow(rnd(), 3) * 2.2;
      const tint = rnd();
      col[i * 3] = b * (tint < 0.3 ? 0.8 : 1); col[i * 3 + 1] = b * 0.85; col[i * 3 + 2] = b * (tint > 0.7 ? 0.8 : 1);
      aux[i * 2] = 1.5 + Math.pow(rnd(), 4) * 3.5; aux[i * 2 + 1] = rnd();
    });
    scene.add(stars);

    /* The striped retro sun (premultiplied: the disc hides the sky, the halo adds). */
    const sunU = {
      uTopC: { value: new THREE.Color() }, uMidC: { value: new THREE.Color() }, uBotC: { value: new THREE.Color() }, uGlowC: { value: new THREE.Color() },
      uI: { value: 1 }, uHalo: { value: 1 }, uScroll: { value: 0 }, uVis: { value: 1 }
    };
    const SUN_Q = 3.2;   // quad size in sun radii
    const sun = new THREE.Mesh(new THREE.PlaneGeometry(SUN_Q, SUN_Q), shader(C, {
      transparent: true, premul: true, depthWrite: false, uniforms: sunU,
      vert: `varying vec2 vP; void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); vClip = gl_Position; }`,
      frag: `
uniform vec3 uTopC, uMidC, uBotC, uGlowC; uniform float uI, uHalo, uScroll, uVis;
varying vec2 vP;
void main() {
  float r = length(vP);
  float aa = fwidth(r) * 1.2;
  float disc = 1.0 - smoothstep(1.0 - aa, 1.0, r);
  float y = vP.y;
  float zone = 1.0 - smoothstep(0.38, 0.48, y);
  float per = 0.17;
  float f = fract((y - uScroll) / per);
  float gapW = clamp((0.45 - y) * 0.30, 0.0, 0.62);
  float fa = fwidth((y - uScroll) / per) * 1.5;
  float gap = zone * (smoothstep(0.0, fa, f) - smoothstep(gapW, gapW + fa, f));
  float fill = disc * (1.0 - clamp(gap, 0.0, 1.0));
  vec3 col = y > 0.3 ? mix(uMidC, uTopC, smoothstep(0.3, 0.95, y)) : mix(uBotC, uMidC, smoothstep(-0.6, 0.3, y));
  col *= 1.0 + 0.35 * smoothstep(0.55, 1.0, y);
  float rim = smoothstep(0.86, 1.0, r) * disc;
  col += uTopC * rim * 0.4;
  float halo = exp(-max(r - 1.0, 0.0) * 4.2) * 0.55 + exp(-max(r - 1.0, 0.0) * 1.4) * 0.22;
  halo *= (1.0 - disc) * uHalo;
  float cm = calm(sUV());
  vec3 rgb = col * fill * uI * 1.25 + uGlowC * halo * 0.9;
  gl_FragColor = vec4(rgb * cm * uVis, fill * uVis);
  ${OUT}
}`
    }));
    sun.renderOrder = -7;
    scene.add(sun);

    /* Ringed planet for the night levels. */
    const planetU = {
      uBase: { value: new THREE.Color() }, uRimC: { value: new THREE.Color() }, uLight: { value: new THREE.Vector3(1, 0.3, 0.4).normalize() },
      uVis: { value: 0 }
    };
    const planetGroup = new THREE.Group();
    const planet = new THREE.Mesh(new THREE.SphereGeometry(1, high ? 48 : 28, high ? 32 : 18), shader(C, {
      uniforms: planetU, transparent: true, premul: true, depthWrite: true,
      vert: `varying vec3 vN; varying vec3 vO; varying vec3 vV;
void main() { vO = position; vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vV = normalize(cameraPosition - w.xyz);
  gl_Position = projectionMatrix * viewMatrix * w; vClip = gl_Position; }`,
      frag: `
uniform vec3 uBase, uRimC, uLight; uniform float uVis, uTime;
varying vec3 vN; varying vec3 vO; varying vec3 vV;
void main() {
  vec3 n = normalize(vN);
  float lat = vO.y;
  float bands = fbm(vec2(lat * 7.0 + fbm(vec2(atan(vO.z, vO.x) * 1.5 + uTime * 0.01, lat * 3.0)) * 0.8, 0.5));
  vec3 base = uBase * (0.35 + 0.9 * bands);
  float lam = smoothstep(-0.15, 0.6, dot(n, uLight));
  float fr = pow(1.0 - max(dot(n, normalize(vV)), 0.0), 2.6);
  vec3 c = base * lam * 0.9 + uRimC * fr * (0.6 + 2.2 * smoothstep(-0.3, 0.5, dot(n, uLight)));
  c += uBase * 0.03;
  gl_FragColor = vec4(c * uVis * calm(sUV()), uVis);
  ${OUT}
}`
    }));
    planet.renderOrder = -6;
    planetGroup.add(planet);
    const ringU = { uCol: { value: new THREE.Color() }, uVis: { value: 0 }, uLight: planetU.uLight, uCenter: { value: new THREE.Vector3() }, uR: { value: 1 } };
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.35, 2.35, high ? 128 : 64, 1), shader(C, {
      transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: ringU,
      vert: `varying vec3 vW; varying float vR; void main() { vR = length(position.xy); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; vClip = gl_Position; }`,
      frag: `
uniform vec3 uCol, uLight, uCenter; uniform float uVis, uR;
varying vec3 vW; varying float vR;
void main() {
  float t = (vR - 1.35) / 1.0;
  float bands = 0.55 + 0.45 * sin(vR * 38.0) * sin(vR * 13.0 + 1.0);
  bands *= smoothstep(0.0, 0.06, t) * (1.0 - smoothstep(0.82, 1.0, t));
  float gap = (1.0 - smoothstep(0.0, 0.012, abs(t - 0.62) - 0.025));
  bands *= 1.0 - 0.85 * gap;
  vec3 d = vW - uCenter; float al = dot(d, uLight); float pd = length(d - al * uLight);
  float shadow = (al < 0.0 && pd < uR) ? 0.15 : 1.0;
  vec3 c = uCol * bands * shadow * 1.6;
  gl_FragColor = vec4(c * uVis * calm(sUV()), bands * 0.85 * uVis);
  ${OUT}
}`
    }));
    ring.rotation.x = -Math.PI / 2 + 0.32;
    ring.rotation.y = -0.38;
    planetGroup.add(ring);
    planetGroup.renderOrder = -6;
    scene.add(planetGroup);

    /* Far mountain silhouettes with a neon rim. */
    function ridgeMesh(z, span, n, hmin, hmax, seedOff) {
      const r2 = helpers.rng((ctx.seed || 1) + seedOff);
      const pos = [], top = [], idx = [];
      const hs = [];
      let a = r2() * 10, b = r2() * 10;
      for (let i = 0; i <= n; i++) {
        const x = -span + (2 * span) * i / n;
        const k = i / n;
        // sum of octaves of jagged 1D noise
        let hgt = 0, amp = 1, f = 3;
        for (let o = 0; o < 5; o++) { hgt += amp * (Math.sin(k * f * 6.283 + a * (o + 1)) * 0.5 + Math.sin(k * f * 2.31 * 6.283 + b * (o + 2)) * 0.5); amp *= 0.5; f *= 2.1; }
        hgt = 0.5 + 0.5 * hgt / 1.6;
        const valley = smooth01((Math.abs(x) - span * 0.04) / (span * 0.3));
        hs.push(hmin + (hmax - hmin) * Math.max(0, hgt) * (0.35 + 0.65 * valley));
      }
      for (let i = 0; i <= n; i++) {
        const x = -span + (2 * span) * i / n;
        pos.push(x, -60, z, x, hs[i], z);
        top.push(hs[i], hs[i]);
        if (i < n) { const q = i * 2; idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('aTop', new THREE.Float32BufferAttribute(top, 1));
      g.setIndex(idx);
      return g;
    }
    const ridgeU = { uFill: { value: new THREE.Color() }, uRimC: { value: new THREE.Color() }, uHaze: { value: new THREE.Color() }, uFade: { value: 0.5 }, uRimI: { value: 1 } };
    const ridgeMat = (fade, rimI) => shader(C, {
      uniforms: Object.assign({}, ridgeU, { uFade: { value: fade }, uRimI: { value: rimI } }),
      vert: `attribute float aTop; varying float vY; varying float vTop; void main() { vY = position.y; vTop = aTop; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); vClip = gl_Position; }`,
      frag: `
uniform vec3 uFill, uRimC, uHaze; uniform float uFade, uRimI;
varying float vY; varying float vTop;
void main() {
  float dTop = vTop - vY;
  float fw = fwidth(vY) + 1e-3;
  float rim = exp(-dTop / (fw * 2.2)) + 0.25 * exp(-dTop / (fw * 14.0));
  float g = clamp(vY / max(vTop, 1.0), 0.0, 1.0);
  vec3 c = mix(uFill * 0.6, mix(uFill, uHaze, uFade * 0.6), g);
  c += uHaze * uFade * exp(-max(vY, 0.0) / 30.0) * 0.5;
  c += uRimC * rim * uRimI;
  gl_FragColor = vec4(c * calm(sUV()), 1.0);
  ${OUT}
}`
    });
    const ridgeFar = new THREE.Mesh(ridgeMesh(-2050, 3200, high ? 320 : 160, 30, 250, 11), ridgeMat(0.8, 0.9));
    const ridgeNear = new THREE.Mesh(ridgeMesh(-1500, 2400, high ? 300 : 150, 10, 150, 23), ridgeMat(0.35, 1.6));
    ridgeFar.material.uniforms.uFill = ridgeU.uFill; ridgeNear.material.uniforms.uFill = ridgeU.uFill;
    ridgeFar.material.uniforms.uRimC = ridgeU.uRimC; ridgeNear.material.uniforms.uRimC = ridgeU.uRimC;
    ridgeFar.material.uniforms.uHaze = ridgeU.uHaze; ridgeNear.material.uniforms.uHaze = ridgeU.uHaze;
    scene.add(ridgeFar, ridgeNear);

    /* Neon city skyline on the right horizon: silhouette at sunset, lit at night. */
    const cityU = { uFill: ridgeU.uFill, uRimC: ridgeU.uRimC, uHaze: ridgeU.uHaze, uWinA: { value: new THREE.Color() }, uWinB: { value: new THREE.Color() }, uLit: { value: 0.2 } };
    const cityGeo = (function () {
      const pos = [], top = [], id = [], idx = [];
      let x = 90, n = 0;
      const zc = -1050;
      while (x < 1150) {
        const wB = 14 + rnd() * 34;
        const far = smooth01((x - 90) / 420);
        let hB = (24 + Math.pow(rnd(), 1.5) * 150) * (0.3 + 0.7 * far) * (x > 1050 ? 0.65 : 1);
        if (rnd() < 0.12) hB *= 1.5;
        const z = zc - rnd() * 60;
        const q = n * 4;
        pos.push(x, -30, z, x + wB, -30, z, x + wB, hB, z, x, hB, z);
        top.push(hB, hB, hB, hB); id.push(n, n, n, n);
        idx.push(q, q + 1, q + 2, q, q + 2, q + 3);
        n++;
        if (rnd() < 0.18 && hB > 60) {          // spire
          const sx = x + wB * 0.5, sh = hB + 12 + rnd() * 26, q2 = n * 4;
          pos.push(sx - 0.8, hB, z, sx + 0.8, hB, z, sx + 0.8, sh, z, sx - 0.8, sh, z);
          top.push(sh, sh, sh, sh); id.push(-1, -1, -1, -1);
          idx.push(q2, q2 + 1, q2 + 2, q2, q2 + 2, q2 + 3);
          n++;
        }
        x += wB + (rnd() < 0.3 ? rnd() * 14 : 0.5);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('aTop', new THREE.Float32BufferAttribute(top, 1));
      g.setAttribute('aId', new THREE.Float32BufferAttribute(id, 1));
      g.setIndex(idx);
      return g;
    })();
    const city = new THREE.Mesh(cityGeo, shader(C, {
      uniforms: cityU,
      vert: `attribute float aTop; attribute float aId; varying vec3 vP; varying float vTop; varying float vId;
void main() { vP = position; vTop = aTop; vId = aId; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); vClip = gl_Position; }`,
      frag: `
uniform vec3 uFill, uRimC, uHaze, uWinA, uWinB; uniform float uLit, uTime;
varying vec3 vP; varying float vTop; varying float vId;
void main() {
  float dTop = vTop - vP.y;
  float fw = fwidth(vP.y) + 1e-3;
  vec3 c = uFill * 0.55 + uHaze * 0.22 * exp(-max(vP.y, 0.0) / 40.0);
  c += uRimC * exp(-dTop / (fw * 1.6)) * 0.9;
  if (vId >= 0.0) {
    vec2 cell = floor(vec2(vP.x / 3.2, vP.y / 4.2));
    vec2 f = fract(vec2(vP.x / 3.2, vP.y / 4.2));
    float h = hash12(cell + vId * 13.1);
    float on = step(1.0 - uLit, h) * step(0.25, f.x) * step(f.x, 0.75) * step(0.3, f.y) * step(f.y, 0.75);
    on *= step(3.0, dTop) * step(1.0, vP.y);
    float flick = 0.75 + 0.25 * sin(uTime * (0.5 + h * 2.0) + h * 30.0);
    float far = fwidth(vP.x);
    on *= 1.0 - smoothstep(1.0, 2.5, far);
    c += mix(uWinA, uWinB, step(0.6, hash12(cell + 7.7))) * on * flick * 1.5;
    c += mix(uWinA, uWinB, 0.5) * uLit * 0.18 * smoothstep(1.0, 2.5, far) * step(3.0, dTop);
  } else {
    c += uRimC * 2.5 * step(vTop - 2.0, vP.y) * (0.5 + 0.5 * sin(uTime * 3.0 + vP.x));
  }
  gl_FragColor = vec4(c * calm(sUV()), 1.0);
  ${OUT}
}`
    }));
    scene.add(city);

    /* Ground: scrolling grid with neon hills either side of the road. */
    const GW = 760, GD = 1488;   // GD multiple of 16
    const segX = high ? 152 : 76, segZ = GD / DZ;
    const gpos = new Float32Array((segX + 1) * (segZ + 1) * 3);
    for (let j = 0, k = 0; j <= segZ; j++) for (let i = 0; i <= segX; i++, k += 3) {
      // denser columns near the road
      const u = i / segX * 2 - 1;
      gpos[k] = Math.sign(u) * Math.pow(Math.abs(u), 1.6) * GW / 2;
      gpos[k + 1] = 0; gpos[k + 2] = 16 - j * DZ;
    }
    const gidx = [];
    for (let j = 0; j < segZ; j++) for (let i = 0; i < segX; i++) {
      const a = j * (segX + 1) + i, b = a + 1, c = a + segX + 1, d = c + 1;
      gidx.push(a, b, c, b, d, c);
    }
    const ggeo = new THREE.BufferGeometry();
    ggeo.setAttribute('position', new THREE.BufferAttribute(gpos, 3));
    ggeo.setIndex(gidx);
    const groundU = {
      uScroll: { value: 0 }, uDz: { value: DZ }, uRoad: { value: ROAD }, uHill: { value: 60 }, uHillR: { value: 1 }, uCell: { value: CELL },
      uGround: { value: new THREE.Color() }, uGrid: { value: new THREE.Color() }, uHillC: { value: new THREE.Color() }, uEdge: { value: new THREE.Color() },
      uHaze: { value: new THREE.Color() }, uGain: { value: 1 }, uKick: { value: 0 }, uWave: { value: -2000 }, uWaveI: { value: 0 }
    };
    const ground = new THREE.Mesh(ggeo, shader(C, {
      uniforms: groundU, defines: { TOCT: high ? 4 : 3 },
      vert: `
uniform float uScroll, uDz, uRoad, uHill, uHillR;
varying vec3 vW; varying vec2 vF; varying float vH;
float pn(vec2 p, float per) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  float y0 = mod(i.y, per), y1 = mod(i.y + 1.0, per);
  return mix(mix(hash12(vec2(i.x, y0)), hash12(vec2(i.x + 1.0, y0)), u.x), mix(hash12(vec2(i.x, y1)), hash12(vec2(i.x + 1.0, y1)), u.x), u.y);
}
float terrain(vec2 q) {
  float ax = abs(q.x);
  float ramp = smoothstep(uRoad + 10.0, uRoad + 130.0, ax);
  if (ramp <= 0.0) return 0.0;
  vec2 p = q / 64.0; float per = 32.0, s = 0.0, a = 0.5;
  for (int i = 0; i < TOCT; i++) { s += a * pn(p, per); p *= 2.0; per *= 2.0; a *= 0.5; }
  float r = 1.0 - abs(s * 2.0 - 1.0);
  return ramp * (r * r * r * uHill * (q.x > 0.0 ? uHillR : 1.0) + s * 4.0);
}
void main() {
  float shift = mod(uScroll, uDz);
  vec3 p = position; p.z += shift;
  vec2 q = vec2(position.x, position.z - (uScroll - shift));
  float h = terrain(q) * mix(1.0, 0.4, smoothstep(250.0, 1150.0, -p.z));
  p.y += h;
  vec4 w = modelMatrix * vec4(p, 1.0);
  vW = w.xyz; vF = q; vH = h;
  gl_Position = projectionMatrix * viewMatrix * w;
  vClip = gl_Position;
}`,
      frag: `
uniform float uRoad, uCell, uGain, uKick, uWave, uWaveI;
uniform vec3 uGround, uGrid, uHillC, uEdge, uHaze;
varying vec3 vW; varying vec2 vF; varying float vH;
float gline(float c, float w) {
  float fw = max(fwidth(c), 1e-4);
  float d = abs(fract(c - 0.5) - 0.5) / fw;
  float l = (1.0 - smoothstep(0.35 + w, 1.4 + w, d)) + exp(-d * 0.45) * 0.3;
  return mix(l, min(fw * 2.2, 0.6), smoothstep(0.1, 0.4, fw));
}
void main() {
  vec2 s = sUV();
  float dist = length(vW - cameraPosition);
  float ax = abs(vF.x);
  vec2 g = vF / uCell;
  float grid = max(gline(g.x, 0.0), gline(g.y, 0.0));
  float hk = smoothstep(2.0, 45.0, vH);
  vec3 lc = mix(uGrid, uHillC, hk);
  float near = exp(-dist / 230.0);
  float li = uGain * (0.45 + 2.4 * near) * (1.0 + 0.45 * uKick);
  float wave = exp(-abs(vW.z - uWave) / 9.0) * uWaveI;
  li *= 1.0 + 1.6 * wave;
  vec3 base = uGround * (1.0 + hk * 0.8);
  vec3 col = base + lc * grid * li;
  if (ax < uRoad + 0.6) {
    float road = 1.0 - smoothstep(uRoad - 0.2, uRoad + 0.6, ax);
    vec3 rc = uGround * 0.45 + uHaze * 0.12 * (1.0 - smoothstep(30.0, 400.0, dist)) * (0.6 + 0.4 * sin(vF.y * 0.02));
    float fw = fwidth(vF.x) + 1e-3;
    float edge = 1.0 - smoothstep(max(0.1, fw * 0.6), max(0.1, fw * 0.6) + fw * 1.5, abs(ax - (uRoad - 0.55)));
    float dash = step(fract(vF.y / 14.0), 0.45);
    float lane = (1.0 - smoothstep(max(0.08, fw * 0.5), max(0.08, fw * 0.5) + fw * 1.5, abs(ax - uRoad * 0.5))) * dash;
    float cross = gline(g.y, 0.0) * 0.35;
    rc += uEdge * edge * (0.7 + 1.5 * near) * uGain + uGrid * lane * (0.5 + 1.4 * near) * uGain + lc * cross * li * 0.5;
    col = mix(col, rc, road);
  }
  float hz = smoothstep(90.0, 1350.0, dist);
  col = mix(col, uHaze * 0.55, hz * hz * (3.0 - 2.0 * hz));
  gl_FragColor = vec4(col * calm(s), 1.0);
  ${OUT}
}`
    }));
    scene.add(ground);

    /* Roadside palms and light poles (one instanced draw, canvas atlas). */
    function propAtlas() {
      const S = 512, cv = document.createElement('canvas');
      cv.width = S; cv.height = S;
      const g = cv.getContext('2d');
      g.globalCompositeOperation = 'lighter';
      // Palm (left half): R = silhouette, G = rim.
      const trunk = (style, lw) => {
        g.beginPath();
        for (let i = 0; i <= 24; i++) {
          const k = i / 24, y = 512 - k * 330, x = 112 + Math.sin(k * 2.2) * 34 * k;
          const w = lw === undefined ? (11 - k * 5) : lw;
          if (i === 0) g.moveTo(x - w, y); else g.lineTo(x - w, y);
        }
        for (let i = 24; i >= 0; i--) {
          const k = i / 24, y = 512 - k * 330, x = 112 + Math.sin(k * 2.2) * 34 * k;
          const w = lw === undefined ? (11 - k * 5) : lw;
          g.lineTo(x + w, y);
        }
        g.closePath();
        if (style === 'fill') g.fill(); else g.stroke();
      };
      const cx = 112 + Math.sin(2.2) * 34, cy = 182;
      const frond = (ang, len, droop, mode) => {
        const ex = cx + Math.cos(ang) * len, ey = cy - Math.sin(ang) * len * 0.55 + droop;
        const mx = cx + Math.cos(ang) * len * 0.5, my = cy - Math.sin(ang) * len * 0.5 - 18;
        g.beginPath(); g.moveTo(cx, cy); g.quadraticCurveTo(mx, my, ex, ey);
        if (mode === 'rim') { g.lineWidth = 3; g.stroke(); }
        else { g.lineWidth = 5; g.stroke(); }
        // leaflets
        for (let i = 2; i < 16; i++) {
          const k = i / 16;
          const px = (1 - k) * (1 - k) * cx + 2 * (1 - k) * k * mx + k * k * ex;
          const py = (1 - k) * (1 - k) * cy + 2 * (1 - k) * k * my + k * k * ey;
          const l = (1 - k * 0.7) * 30;
          const nx = Math.cos(ang) > 0 ? 1 : -1;
          g.lineWidth = mode === 'rim' ? 1.5 : 3.2;
          g.beginPath(); g.moveTo(px, py); g.lineTo(px + nx * l * 0.35, py + l); g.stroke();
          g.beginPath(); g.moveTo(px, py); g.lineTo(px - nx * l * 0.15, py + l * 0.8); g.stroke();
        }
      };
      const fr = [[0.15, 120, 60], [0.55, 105, 30], [1.1, 80, 6], [1.6, 70, -4], [2.0, 82, 8], [2.55, 108, 34], [3.0, 120, 62], [-0.25, 95, 85], [3.4, 92, 88]];
      g.fillStyle = '#ff0000'; g.strokeStyle = '#ff0000';
      trunk('fill'); fr.forEach(f => frond(f[0], f[1], f[2], 'fill'));
      g.beginPath(); g.arc(cx, cy, 10, 0, TAU); g.fill();
      g.strokeStyle = '#00ff00'; g.lineWidth = 2; trunk('stroke');
      fr.forEach(f => frond(f[0], f[1], f[2], 'rim'));
      // Pole (right half): R = silhouette, B = lamp glow.
      g.fillStyle = '#ff0000'; g.strokeStyle = '#ff0000';
      g.fillRect(380, 150, 9, 362);
      g.lineWidth = 7; g.beginPath(); g.moveTo(384, 156); g.quadraticCurveTo(384, 108, 330, 110); g.lineTo(300, 112); g.stroke();
      g.fillRect(282, 106, 36, 12);
      const lg = g.createRadialGradient(300, 120, 0, 300, 120, 48);
      lg.addColorStop(0, 'rgba(0,0,255,1)'); lg.addColorStop(0.25, 'rgba(0,0,255,0.55)'); lg.addColorStop(1, 'rgba(0,0,255,0)');
      g.fillStyle = lg; g.fillRect(250, 70, 100, 100);
      g.fillStyle = '#00ff00'; g.fillRect(389, 150, 2, 362);
      const tex = new THREE.CanvasTexture(cv);
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.generateMipmaps = true;
      return tex;
    }
    const PROPS = high ? 26 : 14, SPAN = high ? 780 : 560;
    const propInst = new Float32Array(PROPS * 2 * 4);
    for (let i = 0; i < PROPS * 2; i++) {
      propInst[i * 4] = (Math.floor(i / 2) + (i % 2) * 0.5 + rnd() * 0.18) * SPAN / PROPS;
      propInst[i * 4 + 1] = (i % 2) ? 1 : -1;
      propInst[i * 4 + 2] = rnd();
      propInst[i * 4 + 3] = 0.85 + rnd() * 0.3;
    }
    const propGeo = new THREE.InstancedBufferGeometry();
    propGeo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3));
    propGeo.setIndex([0, 1, 2, 0, 2, 3]);
    propGeo.setAttribute('aInst', new THREE.InstancedBufferAttribute(propInst, 4));
    propGeo.instanceCount = PROPS * 2;
    const propU = {
      uMap: { value: propAtlas() }, uScroll: { value: 0 }, uSpan: { value: SPAN }, uRoad: { value: ROAD }, uPoleMix: { value: 0 },
      uSil: { value: new THREE.Color() }, uRimC: { value: new THREE.Color() }, uLamp: { value: new THREE.Color() }, uHaze: { value: new THREE.Color() }
    };
    const props = new THREE.Mesh(propGeo, shader(C, {
      uniforms: propU, side: THREE.DoubleSide,
      vert: `
attribute vec4 aInst;
uniform float uScroll, uSpan, uRoad, uPoleMix;
varying vec2 vUv; varying float vType; varying float vDist; varying float vFade;
void main() {
  float type = step(aInst.z, uPoleMix);
  float z = mod(aInst.x + uScroll, uSpan) - uSpan + 14.0;
  float x = aInst.y * (uRoad + 5.0 + type * 0.5);
  float hgt = mix(17.0, 14.0, type) * aInst.w;
  float wid = hgt * mix(0.5, 0.5, type);
  vec3 toCam = normalize(vec3(cameraPosition.x - x, 0.0, cameraPosition.z - z));
  vec3 right = vec3(toCam.z, 0.0, -toCam.x);
  vec3 p = vec3(x, 0.0, z) + right * position.x * wid * aInst.y + vec3(0.0, position.y * hgt, 0.0);
  vUv = vec2((position.x + 0.5) * 0.5 + type * 0.5, position.y);
  vType = type;
  vec4 w = vec4(p, 1.0);
  vDist = length(w.xyz - cameraPosition);
  vFade = smoothstep(uSpan * 0.72, uSpan - 14.0, -z);
  gl_Position = projectionMatrix * viewMatrix * w;
  vClip = gl_Position;
}`,
      frag: `
uniform sampler2D uMap; uniform vec3 uSil, uRimC, uLamp, uHaze;
varying vec2 vUv; varying float vType; varying float vDist; varying float vFade;
void main() {
  vec4 t = texture2D(uMap, vUv);
  float a = smoothstep(0.25, 0.6, t.r);
  if (a < 0.02) discard;
  float hz = smoothstep(60.0, 820.0, vDist);
  vec3 c = uSil;
  c += uRimC * t.g * (0.35 + 0.6 * exp(-vDist / 150.0));
  c += uLamp * t.b * 7.0;
  c = mix(c, uHaze * 0.5, hz);
  c *= (1.0 - vFade);
  gl_FragColor = vec4(c * calm(sUV()), a);
  ${OUT}
}`
    }));
    props.material.alphaToCoverage = true;
    props.frustumCulled = false;
    scene.add(props);

    /* Lamp glows (additive sprites at the lamp heads, so poles bloom properly). */
    // Folded into the props atlas B channel; the bloom pass does the rest.

    /* Speed lines rushing past at the edges. */
    const SL = high ? 90 : 44;
    const slA = new Float32Array(SL * 4);
    for (let i = 0; i < SL; i++) {
      const side = i % 2 ? 1 : -1;
      slA[i * 4] = side * (ROAD + 4 + Math.pow(rnd(), 0.7) * 70);
      slA[i * 4 + 1] = 0.6 + rnd() * 16;
      slA[i * 4 + 2] = rnd() * 600;
      slA[i * 4 + 3] = rnd();
    }
    const speedU = { uTravel: { value: 0 }, uLen: { value: 10 }, uAlpha: { value: 0.3 }, uColA: { value: new THREE.Color() }, uColB: { value: new THREE.Color() } };
    const speedLines = new THREE.Mesh(instancedQuad(THREE, SL, { aI: slA }), shader(C, {
      transparent: true, additive: true, depthWrite: false, ribbon: true, uniforms: speedU,
      vert: `
attribute vec4 aI;
uniform float uTravel, uLen;
varying float vA; varying vec2 vC; varying float vR;
void main() {
  float z = -mod(aI.z - uTravel * (0.9 + aI.w * 0.5), 600.0) + 20.0;
  vec3 head = vec3(aI.x, aI.y, z);
  vec3 tail = head - vec3(0.0, 0.0, uLen * (0.6 + aI.w));
  vec3 a = (viewMatrix * vec4(tail, 1.0)).xyz, b = (viewMatrix * vec4(head, 1.0)).xyz;
  gl_Position = ribbon(a, b, position.xy, 0.8 + 1.6 * smoothstep(-200.0, -10.0, z));
  vC = position.xy; vR = aI.w;
  vA = smoothstep(-580.0, -380.0, z) * (1.0 - smoothstep(0.0, 20.0, z));
  vClip = gl_Position;
}`,
      frag: `
uniform float uAlpha; uniform vec3 uColA, uColB;
varying float vA; varying vec2 vC; varying float vR;
void main() {
  float across = 1.0 - vC.y * vC.y;
  float a = across * across * vC.x * vA * uAlpha;
  vec3 c = mix(uColA, uColB, vR) * a * 2.2;
  gl_FragColor = vec4(c * calm(sUV()), 1.0);
  ${OUT}
}`
    }));
    speedLines.frustumCulled = false;
    scene.add(speedLines);

    /* Shooting stars: screen-space streaks, placed beside / above the board. */
    const SS = 4;
    const ssA = new Float32Array(SS * 4);
    for (let i = 0; i < SS; i++) { ssA[i * 4] = 5.5 + rnd() * 6; ssA[i * 4 + 1] = rnd() * 10; ssA[i * 4 + 2] = rnd(); ssA[i * 4 + 3] = rnd(); }
    const shootU = { uHorizon: { value: 0.55 }, uWide: { value: 1 }, uRate: { value: 1 }, uCol: { value: new THREE.Color() } };
    const shooting = new THREE.Mesh(instancedQuad(THREE, SS, { aI: ssA }), shader(C, {
      transparent: true, additive: true, depthWrite: false, uniforms: shootU,
      vert: `
attribute vec4 aI;
uniform float uTime, uHorizon, uWide, uRate;
varying vec2 vC; varying float vA;
uniform vec4 uBoard; uniform vec3 uView;
void main() {
  float tt = uTime * uRate + aI.y;
  float cyc = floor(tt / aI.x);
  float lt = (tt - cyc * aI.x) / 1.1;
  float h1 = hash12(vec2(cyc, aI.z * 91.0)), h2 = hash12(vec2(cyc + 7.3, aI.w * 53.0)), h3 = hash12(vec2(cyc * 1.7, 3.1 + aI.z));
  vec2 st;
  if (uWide > 0.5) {
    st.x = h1 < 0.5 ? mix(0.03, uBoard.x - 0.03, h1 * 2.0) : mix(uBoard.z + 0.03, 0.97, h1 * 2.0 - 1.0);
    st.y = mix(max(uHorizon + 0.12, 0.45), 0.97, h2);
  } else {
    st.x = mix(0.08, 0.92, h1);
    st.y = mix(max(uBoard.w, uHorizon + 0.08) + 0.02, 0.98, h2);
  }
  float ang = -0.45 - h3 * 0.5; if (h1 > 0.5) ang = 3.14159 - ang;
  vec2 dir = vec2(cos(ang), sin(ang)); dir.x *= uView.y / uView.x;
  float vis = step(lt, 1.0) * smoothstep(0.0, 0.12, lt) * (1.0 - smoothstep(0.6, 1.0, lt));
  vec2 head = st + dir * lt * 0.22;
  vec2 tail = head - dir * 0.09 * smoothstep(0.0, 0.3, lt);
  vec2 d = (head - tail) * uView.xy; float L = max(length(d), 1e-3); vec2 n = vec2(-d.y, d.x) / L;
  vec2 p = mix(tail, head, position.x) + n * position.y * 1.4 / uView.xy;
  gl_Position = vec4(p * 2.0 - 1.0, 0.99995, 1.0);
  vC = position.xy; vA = vis;
  vClip = gl_Position;
}`,
      frag: `
uniform vec3 uCol;
varying vec2 vC; varying float vA;
void main() {
  float a = (1.0 - vC.y * vC.y) * pow(vC.x, 1.5) * vA;
  gl_FragColor = vec4(uCol * a * 3.0 * calm(sUV()), 1.0);
  ${OUT}
}`
    }));
    shooting.frustumCulled = false;
    shooting.renderOrder = -5;
    scene.add(shooting);

    /* ── Layout ── */
    let W = 1600, H = 900, wide = true, horizonV = 0.55, pitch = 0;
    const sunPos = new THREE.Vector3(), planetPos = new THREE.Vector3();
    let sunR = 100, planetR = 60, sunBaseV = 0, sunDist = 1900, planetDist = 1700, planetBaseV = 0, planetU0 = 0, sunU0 = 0;
    let variant = 0, speedBase = 40, scroll = 0, travel = 0, clock = 0, camH = 5.2;
    let sunSink = 0, planetRise = 0;

    function placeSky() {
      // sun: sinks with the level; planet rises
      const uS = unitsPerPx(camera, H, sunDist);
      const vS = sunBaseV - sunSink * (sunR * (wide ? 2.1 : 1.6) / H);
      sunU.uVis.value = wide ? 1 : 1 - smooth01(sunSink * 1.1);
      screenRay(camera, sunU0, vS, sunDist, sunPos);
      sun.position.copy(sunPos);
      sun.scale.setScalar(sunR * uS);
      sun.lookAt(camera.position);
      skyU.uSunDir.value.copy(sunPos).sub(camera.position).normalize();
      const uP = unitsPerPx(camera, H, planetDist);
      const vP = planetBaseV - (1 - planetRise) * (planetR * (wide ? 3.2 : 1.2) / H);
      screenRay(camera, planetU0, vP, planetDist, planetPos);
      planetGroup.position.copy(planetPos);
      planetGroup.scale.setScalar(planetR * uP);
      ringU.uCenter.value.copy(planetPos); ringU.uR.value = planetR * uP;
      planetU.uLight.value.copy(sunPos).sub(planetPos).normalize();
    }

    function resize(w, h) {
      W = Math.max(1, w); H = Math.max(1, h);
      helpers.fitCamera(camera, W, H, 50);
      const R = boardRect(W, H, C.uBoard.value);
      wide = R.wide;
      C.uView.value.set(W, H, 0.72);
      shootU.uWide.value = wide ? 1 : 0;
      if (wide) {
        horizonV = 0.53;
        const panel = R.x0 * W;
        sunR = Math.max(Math.min(panel * 0.44, H * 0.22), H * 0.12);
        sunU0 = 1 - R.x0 * 0.5;
        sunBaseV = horizonV + sunR * 0.85 / H;
        planetR = Math.max(Math.min(panel * 0.26, H * 0.14), H * 0.07);
        planetU0 = R.x0 * 0.5; planetBaseV = horizonV + 0.26;
      } else {
        horizonV = Math.max(0.12, R.y0 + 0.035);
        sunR = Math.min(W * 0.3, (1 - R.y1) * H * 0.9);
        sunU0 = 0.5;
        sunBaseV = R.y1 + (1 - R.y1) * 0.42;
        planetR = W * 0.085;
        planetU0 = 0.15; planetBaseV = R.y1 + (1 - R.y1) * 0.55;
      }
      shootU.uHorizon.value = horizonV;
      camH = wide ? 5.2 : 10.5;
      camera.position.set(0, camH, 0);
      groundU.uHillR.value = wide ? 0.32 : 1.0;
      skyU.uAurBase.value = wide ? 0.06 : 0.5;
      const tanHalf = Math.tan(camera.fov * Math.PI / 360);
      pitch = -Math.atan((horizonV * 2 - 1) * tanHalf);
      camera.rotation.set(pitch, 0, 0);
      camera.updateMatrixWorld(true);
      placeSky();
    }

    function setVariant(n) {
      variant = Math.max(0, Math.min(19, n | 0));
      const p = pal.at(variant);
      skyU.uTop.value.copy(p.top); skyU.uMid.value.copy(p.mid); skyU.uHor.value.copy(p.hor);
      skyU.uSunCol.value.copy(p.sunGlow); skyU.uAurA.value.copy(p.auroraA); skyU.uAurB.value.copy(p.auroraB);
      sunU.uTopC.value.copy(p.sunTop); sunU.uMidC.value.copy(p.sunMid); sunU.uBotC.value.copy(p.sunBot); sunU.uGlowC.value.copy(p.sunGlow);
      groundU.uGround.value.copy(p.ground); groundU.uGrid.value.copy(p.grid); groundU.uHillC.value.copy(p.hill);
      groundU.uEdge.value.copy(p.edge); groundU.uHaze.value.copy(p.haze);
      ridgeU.uFill.value.copy(p.ridge); ridgeU.uRimC.value.copy(p.rim); ridgeU.uHaze.value.copy(p.haze);
      propU.uSil.value.copy(p.ground).multiplyScalar(0.6); propU.uRimC.value.copy(p.rim); propU.uLamp.value.copy(p.lamp); propU.uHaze.value.copy(p.haze);
      speedU.uColA.value.copy(p.grid); speedU.uColB.value.copy(p.edge);
      shootU.uCol.value.copy(p.star);
      cityU.uWinA.value.copy(p.winA); cityU.uWinB.value.copy(p.winB); cityU.uLit.value = 0.12 + 0.4 * smooth01((variant - 3) / 9);
      planetU.uBase.value.copy(p.planet); planetU.uRimC.value.copy(p.planetRim); ringU.uCol.value.copy(p.ring);
      stars.material.uniforms.uGain.value = 0.55 + 0.45 * smooth01(variant / 10);
      // journey: the sun sets, the planet rises, then the aurora
      sunSink = smooth01((variant - 1) / 10) * 1.15;
      planetRise = smooth01((variant - 5) / 7);
      const pv = smooth01((variant - 5) / 3);
      planetU.uVis.value = pv; ringU.uVis.value = pv; planetGroup.visible = pv > 0.01;
      skyU.uAurora.value = smooth01((variant - 12) / 4);
      propU.uPoleMix.value = smooth01((variant - 4) / 10) * 0.85;
      groundU.uHill.value = 34 + variant * 1.2;
      speedBase = 38 + variant * 3.2;
      placeSky();
    }

    function update(dt, t, b, energy) {
      dt = Math.min(0.1, Math.max(0, dt || 0));
      energy = clamp01(energy || 0);
      clock = (clock + dt) % 3600;
      C.uTime.value = clock;
      beat.step(b, reduced, dt); pulses.step(dt);
      const win = pulses.env('win'), goal = pulses.env('goal'), fever = pulses.env('fever'), hit = pulses.env('hit');
      const kick = Math.max(beat.kick, pulses.env('beat') * 0.8);
      let speed = speedBase * (1 + 0.7 * energy + 0.25 * fever) * (1 + 2.2 * win);
      if (reduced) speed = 4;
      scroll = (scroll + speed * dt) % PERIOD;
      travel = (travel + speed * dt) % 6000;
      groundU.uScroll.value = scroll;
      propU.uScroll.value = scroll;
      speedU.uTravel.value = travel;
      speedU.uLen.value = 4 + speed * 0.22;
      speedU.uAlpha.value = reduced ? 0 : (0.12 + 0.55 * energy + 0.9 * win + 0.3 * fever);
      groundU.uKick.value = reduced ? 0 : kick;
      groundU.uGain.value = 1 + 0.35 * energy + 0.6 * hit * 0.5 + 0.8 * win + 0.3 * goal;
      // a bright band sweeps the grid toward the camera each bar
      if (!reduced) {
        groundU.uWave.value = -900 + Math.pow(beat.barPhase, 0.8) * 910;
        groundU.uWaveI.value = beat.on * (0.7 + 0.6 * energy) + goal;
      } else groundU.uWaveI.value = 0;
      sunU.uScroll.value = reduced ? 0 : (clock * 0.035) % 1000;
      sunU.uHalo.value = 0.9 + 0.35 * beat.bar + 0.35 * energy + 0.9 * win + 0.4 * goal;
      sunU.uI.value = 1 + 0.25 * win;
      skyU.uGlow.value = 1 + 0.15 * beat.bar + 0.35 * win;
      shootU.uRate.value = reduced ? 0.25 : 1;
      // gentle drive sway
      if (!reduced) {
        camera.position.x = Math.sin(clock * 0.21) * 0.7;
        camera.position.y = camH + Math.sin(clock * 0.37) * 0.15;
        camera.rotation.set(pitch + Math.sin(clock * 0.29) * 0.004, Math.sin(clock * 0.17) * 0.012, Math.sin(clock * 0.21 + 0.6) * 0.012);
      }
      stars.rotation.y = reduced ? 0 : Math.sin(clock * 0.01) * 0.01;
    }

    function pulse(kind, strength) { pulses.fire(kind, strength); }

    function dispose() {
      helpers.disposeTree(scene);
      while (scene.children.length) scene.remove(scene.children[0]);
    }

    setVariant(0);
    resize(1600, 900);
    return { update, setVariant, resize, pulse, dispose };
  }

  /* ── Registration ─────────────────────────────────────────────────────── */

  /** Shared deep-space renderer. All bright surfaces use the screen board mask. */
  function deepSpace(ctx, quasar) {
    const { THREE: T, scene, camera, helpers: H } = ctx;
    const C = makeCommon(ctx), rnd = H.rng(ctx.seed), low = ctx.quality === 'low';
    const reduced = ctx.reducedMotion, beat = makeBeat(), pulses = makePulses();
    const objects = [], rings = [], sparks = [];
    let clock = 0, variant = 0;
    camera.position.set(0, 0, 80); camera.lookAt(0, 0, -200);
    const sky = H.skyDome(T, ctx.theme.sky); scene.add(sky);
    const flatVert = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); vClip = gl_Position; }`;
    // Layered gas clouds: quiet behind the board, saturated at its edges.
    for (let i = 0; i < (low ? 2 : 3); i++) {
      const mat = shader(C, {
        transparent: true, depthWrite: false, additive: true,
        uniforms: { uColor: { value: new T.Color(quasar ? (i % 2 ? '#ff245e' : '#ff8b22') : (i % 2 ? '#28c5e9' : '#7947ee')) }, uPhase: { value: i * 11.7 }, uGain: { value: 0.5 } },
        vert: flatVert,
        frag: `varying vec2 vUv; uniform float uTime; uniform float uPhase; uniform float uGain; uniform vec3 uColor;
          void main(){ vec2 p = vUv * vec2(4.0,3.0); float n = fbm(p + vec2(uPhase,uTime*0.012));
            float fil = fbm(p*2.0 + vec2(n*2.0,uPhase)); float edge = pow(max(0.0,1.0-length((vUv-0.5)*2.0)),0.7);
            float fog = pow(smoothstep(0.33,0.83,n),2.0)*(0.5+fil)*edge;
            gl_FragColor = vec4(uColor*fog*uGain*calm(sUV()),1.0); ${OUT} }`
      });
      const m = new T.Mesh(new T.PlaneGeometry(840, 600), mat); m.position.set((i - 1) * 80, i * 45 - 35, -570 - i * 35); m.rotation.z = i * 1.4; scene.add(m); objects.push(m);
    }
    const stars = starPoints(C, low ? 280 : 850, (i, p, c, a) => {
      const z = -100 - rnd() * 1100, x = (rnd() - 0.5) * 1700, y = (rnd() - 0.5) * 1000;
      p.set([x, y, z], i * 3); const co = new T.Color(quasar ? '#ffceb2' : (i % 3 ? '#b9c7ff' : '#a0f8ff')).multiplyScalar(0.35 + rnd() * 0.9); co.toArray(c, i * 3); a[i * 2] = 0.8 + rnd() * 2; a[i * 2 + 1] = rnd();
    }, { twinkle: reduced ? 0 : 0.12 }); scene.add(stars);

    const glowMat = (color, gain) => shader(C, {
      uniforms: { uColor: { value: new T.Color(color) }, uGain: { value: gain } },
      vert: `void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);vClip=gl_Position;}`,
      frag: `uniform vec3 uColor;uniform float uGain;void main(){gl_FragColor=vec4(uColor*uGain*calm(sUV()),1.0);${OUT}}`
    });
    const cyan = glowMat('#39cfea', 1.7), violet = glowMat('#865cff', 1.6), fire = glowMat('#ff963e', 1.8);
    // Warp gates pass the viewer in a tunnel; Quasar gets concentric hot orbits.
    if (!quasar) {
      for (let i = 0; i < (low ? 7 : 13); i++) {
        const ring = new T.Mesh(new T.TorusGeometry(220, i % 3 ? 0.6 : 1.5, 5, low ? 48 : 80), i % 2 ? cyan : violet);
        ring.position.z = -90 - i * 95; ring.rotation.z = i * 0.3; scene.add(ring); rings.push(ring);
      }
      // Peripheral ribbons give speed without flicker or screen-wide flashes.
      for (let i = 0; i < (low ? 28 : 70); i++) {
        const a = rnd() * TAU, r = 150 + rnd() * 260;
        const mesh = new T.Mesh(new T.CylinderGeometry(0.32, 0.32, 12 + rnd() * 38, 3), i % 2 ? cyan : violet); mesh.rotation.x = Math.PI / 2;
        mesh.position.set(Math.cos(a) * r, Math.sin(a) * r, -rnd() * 1200); scene.add(mesh); sparks.push({ mesh, base: mesh.position.z });
      }
    } else {
      // A black sphere, luminous photon ring and textured accretion disk.
      const core = new T.Group(); scene.add(core); objects.push(core); core.userData.core = true;
      const sphere = new T.Mesh(new T.SphereGeometry(54, low ? 28 : 48, low ? 18 : 32), new T.MeshBasicMaterial({ color: '#030106' })); core.add(sphere);
      for (let i = 0; i < 3; i++) {
        const ring = new T.Mesh(new T.TorusGeometry(58 + i * 5, i === 0 ? 2.2 : 0.6, 8, 96), i === 1 ? violet : fire); core.add(ring);
      }
      const diskMat = shader(C, {
        transparent: true, depthWrite: false, side: T.DoubleSide, additive: true,
        uniforms: { uGain: { value: 1.5 } }, vert: flatVert,
        frag: `varying vec2 vUv;uniform float uTime;uniform float uGain;
          void main(){ vec2 p=(vUv-0.5)*2.0;float r=length(p);float a=atan(p.y,p.x);
            float edge=smoothstep(0.33,0.40,r)*(1.0-smoothstep(0.78,1.0,r));
            float flow=0.45+0.55*fbm(vec2(a*2.0-uTime*0.13,r*24.0-uTime*0.04));
            vec3 col=mix(vec3(1.0,0.055,0.12),vec3(1.0,0.62,0.16),1.0-r);
            gl_FragColor=vec4(col*edge*flow*uGain*calm(sUV()),1.0);${OUT}}`
      });
      const disk = new T.Mesh(new T.PlaneGeometry(310, 310), diskMat); disk.rotation.x = 1.1; core.add(disk);
      const jetMat = shader(C, {
        transparent: true, depthWrite: false, additive: true,
        uniforms: { uGain: { value: 0.75 } }, vert: flatVert,
        frag: `varying vec2 vUv;uniform float uGain;void main(){float a=exp(-pow((vUv.x-0.5)*11.0,2.0))*pow(1.0-vUv.y,1.7)*smoothstep(0.0,0.15,vUv.y);gl_FragColor=vec4(vec3(0.52,0.19,1.0)*a*uGain*calm(sUV()),1.0);${OUT}}`
      });
      for (const sign of [-1, 1]) { const jet = new T.Mesh(new T.PlaneGeometry(30, 300), jetMat); jet.position.y = sign * 178; if (sign < 0) jet.rotation.z = Math.PI; core.add(jet); }
      const debrisGeo = new T.IcosahedronGeometry(3, 0), debrisMat = new T.MeshStandardMaterial({ color: '#75535f', roughness: 0.8, metalness: 0.3 });
      scene.add(new T.AmbientLight('#814558', 2)); const sun = new T.PointLight('#ff6e20', 18000, 700, 2); sun.position.set(-90, 40, -170); scene.add(sun);
      for (let i = 0; i < (low ? 24 : 65); i++) { const mesh = new T.Mesh(debrisGeo, debrisMat); mesh.scale.setScalar(0.5 + rnd() * 1.5); core.add(mesh); sparks.push({ mesh, a: rnd() * TAU, r: 175 + rnd() * 105, y: (rnd() - 0.5) * 20 }); }
    }
    function resize(w, h) {
      H.fitCamera(camera, w, h, 52); boardRect(w, h, C.uBoard.value); C.uView.value.set(w, h, 0.77);
      stars.material.uniforms.uScale.value = Math.min(1.5, Math.max(0.75, h / 750));
      // Portrait places the core above the board; landscape uses its right edge.
      const core = objects.find(o => o.userData.core);
      if (core) { const p = new T.Vector3(); screenRay(camera, w / h > 1.18 ? 0.88 : 0.77, w / h > 1.18 ? 0.58 : 0.91, 480, p); core.position.copy(p); core.scale.setScalar(w / h > 1.18 ? 1 : 0.55); }
    }
    function update(dt, t, music, energy) {
      dt = Math.min(dt, 0.1); clock += dt * (reduced ? 0.025 : 1); C.uTime.value = clock;
      beat.step(music, reduced, dt); pulses.step(dt);
      const swell = reduced ? 0 : 0.1 * beat.bar + 0.18 * pulses.env('win') + (energy || 0) * 0.09;
      cyan.uniforms.uGain.value = 1.6 + swell; violet.uniforms.uGain.value = 1.5 + swell; fire.uniforms.uGain.value = 1.7 + swell;
      if (!quasar) {
        rings.forEach((r, i) => { r.position.z = -90 - (((i * 95 - clock * 28) % 1400 + 1400) % 1400); r.rotation.z = clock * 0.03 + i * 0.3; });
        sparks.forEach(s => { s.mesh.position.z = -40 - (((-s.base - clock * 64) % 1200 + 1200) % 1200); });
      } else sparks.forEach(s => { const a = s.a + clock * (0.03 + 10 / s.r); s.mesh.position.set(Math.cos(a) * s.r, Math.sin(a) * s.r * 0.31 + s.y, Math.sin(a) * s.r * 0.5); s.mesh.rotation.set(a, a * 1.3, a * 0.7); });
      stars.rotation.z = Math.sin(clock * 0.025) * 0.025;
    }
    function setVariant(n) { variant = Math.max(0, Math.min(19, n | 0)); sky.material.uniforms.gain.value = 0.75 + variant * 0.012; }
    resize(1600, 900); update(0, 0, null, 0);
    return { update, resize, setVariant, pulse(kind, strength) { if (!reduced) pulses.fire(kind, strength); }, dispose() { H.disposeTree(scene); scene.clear(); } };
  }
  function starlightWarp(ctx) { return deepSpace(ctx, false); }
  function quasarCore(ctx) { return deepSpace(ctx, true); }

  function install() {
    if (!P3.backdrops || typeof P3.backdrops.register !== 'function') return false;
    P3.backdrops.register('neon-highway', neonHighway);
    if (typeof starlightWarp === 'function') P3.backdrops.register('starlight-warp', starlightWarp);
    if (typeof quasarCore === 'function') P3.backdrops.register('quasar-core', quasarCore);
    return true;
  }
  if (!install() && root.document) root.document.addEventListener('DOMContentLoaded', install);
})(typeof window !== 'undefined' ? window : globalThis);
