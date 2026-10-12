/* Chasing Rainbows - the weather sky (js/sky.js)
 *
 * A full-screen Canvas 2D sky that sits BEHIND the DOM card table (the canvas is
 * position:fixed; inset:0; z-index:0). It paints a persistent "mood" (day, rain,
 * night ...) and layers short weather "effects" over it when cards are played.
 *
 *   CRSky.init(canvas)   setMotion('full'|'calm'|'off')   setMood(mood, {ms})
 *   getMood()   play(name, opts) -> Promise   stop()   resize()   destroy()
 *   __debug()   (counts, caps, fps mode, lightning log - for tests)
 *
 * Photosensitivity (WCAG 2.3.1) - these are rules, not suggestions:
 *   - Nothing flashes. Lightning is a soft in-cloud glow (radial, alpha <= 0.22)
 *     with an optional faint bolt (alpha <= 0.4) that fades over ~400 ms, and the
 *     whole module allows at most ONE glow per 1.2 s however many storms overlap.
 *     There is never a white full-screen flash.
 *   - Big brightness changes are slow. A mood crossfade is stretched (guardMs) so
 *     the sky's estimated luminance never moves more than ~0.2 in 1/3 s, and the
 *     effects that swing the whole sky (storm, dayNight, nightNight, rainbow,
 *     sunshower) have minimum durations and ramps for the same reason.
 * Performance (low-end tablets, Electron iframe):
 *   - devicePixelRatio is capped at 1.5, and 1 when the canvas would pass 2.5 MP.
 *   - Clouds, sun, moon, glints, leaves and the fog noise are pre-rendered to
 *     offscreen canvases once (clouds/sun/moon again only when a resize changes
 *     the size class), never per frame. Rainbows are cached per geometry. Clouds,
 *     fog and rainbows are rendered at reduced resolution and upscaled: they are
 *     soft anyway.
 *   - Ambient frames are drawn at ~30 fps; 60 fps only while a transient effect
 *     (or its leaves/sparkles) is running.
 *   - The rAF loop stops while document.hidden and resumes on visibilitychange.
 *     Every effect promise also has a timer backstop, so a hidden tab never leaves
 *     the game waiting.
 *   - Particle caps: rain 500, splashes 80, leaves 40, sparkles 120, stars 220.
 * Motion levels:
 *   full - everything.
 *   calm - no particles, clouds drift very slowly, effects are short (~600-900 ms)
 *          gentle crossfades of still imagery: a rainbow fades in complete, a
 *          storm is a darker tint with no lightning, fog is a still noise overlay.
 *   off  - no loop at all: the mood is painted once per change/resize and effects
 *          resolve at once (nightNight and a lingering rainbow leave their mood).
 * play() never throws: an unknown name resolves at once.
 */
(function () {
  'use strict';

  /* ── limits and tuning ───────────────────────────────────────────────── */
  const CAPS = Object.freeze({ rain: 500, splashes: 80, leaves: 40, sparkles: 120, stars: 220 });
  const MAX_DPR = 1.5;
  const MAX_PIXELS = 2.5e6;
  const AMBIENT_FRAME = 1000 / 30;
  const FAST_FRAME = 1000 / 60;
  const GLOW_GAP = 1200;        // ms between lightning glows, module-wide
  const GLOW_PEAK = 0.22;       // in-cloud glow alpha (rule: <= 0.25)
  const BOLT_PEAK = 0.4;        // faint bolt alpha (rule: <= 0.45)
  const LUM_GUARD = 3400;       // crossfade ms per unit of luminance change (sRGB blends are not linear)
  const CALM_MS = 800;
  const DYING_MS = 400;         // a cancelled effect's visuals fade over this
  const CLOUD_RES = 0.6, SUN_RES = 0.5, RB_RES = 0.35, FOG_RES = 0.25;
  const NOISE = 256;
  const TAU = Math.PI * 2;

  /* ── small helpers ───────────────────────────────────────────────────── */
  const clamp = (v, a, b) => (v > a ? (v < b ? v : b) : a);      // NaN -> a
  const lerp = (a, b, k) => a + (b - a) * k;
  const smooth = k => { k = clamp(k, 0, 1); return k * k * (3 - 2 * k); };
  const ramp = (v, a, b) => smooth((v - a) / (b - a));           // 0 at a .. 1 at b
  const easeOut = k => 1 - Math.pow(1 - clamp(k, 0, 1), 3);
  const isNum = v => typeof v === 'number' && isFinite(v);
  const num = (v, d, lo, hi) => (isNum(v) ? clamp(v, lo == null ? -1e9 : lo, hi == null ? 1e9 : hi) : d);
  const pt = (o, d) => (o && isNum(o.x) && isNum(o.y) ? { x: o.x, y: o.y } : d);
  const now = () => { const p = window.performance; return p && p.now ? p.now() : Date.now(); };
  const hex = h => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const mixRGB = (a, b, k) => [Math.round(lerp(a[0], b[0], k)), Math.round(lerp(a[1], b[1], k)), Math.round(lerp(a[2], b[2], k))];
  const rgba = (c, a) => 'rgba(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ',' + (+clamp(a, 0, 1).toFixed(3)) + ')';
  const lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const relLum = c => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);

  function rng(seed) {   // mulberry32: sprites look the same on every load
    return function () {
      seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w));
    c.height = Math.max(1, Math.ceil(h));
    return c;
  }
  function newBuf(w, h) { const c = makeCanvas(w, h); return { c, g: c.getContext('2d'), w: c.width, h: c.height }; }

  /* ── moods ───────────────────────────────────────────────────────────────
     A mood is a flat set of numbers (plus colours) so any two can be blended.
     sky: four gradient stops top -> horizon. cover: share of cloud instances
     shown. deck: textured overcast layer (deckFront rolls it in from the left).
     dim: dark veil. rainbow: lingering arc alpha. */
  const BASE = {
    sky: ['#000000', '#000000', '#000000', '#000000'], sun: 0, sunX: 0.74, sunY: 0.2, warm: 0, sunBoost: 0,
    moon: 0, moonX: 0.26, moonY: 0.2, moonGlow: 0, stars: 0, cloudA: 1, cover: 0.55, cloudDark: 0, cloudWarm: 0,
    drift: 1, deck: 0, deckFront: 0, deckColor: '#c9d0d8', rain: 0, heavy: 0, fog: 0, wind: 0, rainbow: 0, dim: 0
  };
  const MOOD_DEFS = {
    day: { sky: ['#1d5fbf', '#3f8be0', '#88bff0', '#d9edfb'], sun: 1 },
    overcast: { sky: ['#6c7a8a', '#8592a0', '#a4aeb9', '#c5cbd2'], sun: 0.12, cover: 1, cloudDark: 0.35, deck: 0.75, deckFront: 1, deckColor: '#d5dbe2', drift: 1.2 },
    rain: { sky: ['#465260', '#596573', '#74808c', '#939ca6'], cover: 1, cloudDark: 0.6, deck: 0.9, deckFront: 1, deckColor: '#9aa4ae', rain: 0.5, fog: 0.12, drift: 1.6 },
    storm: { sky: ['#1b2027', '#262d36', '#353d47', '#4c5660'], cover: 1, cloudDark: 1, deck: 1, deckFront: 1, deckColor: '#5a636e', rain: 1, heavy: 1, wind: 0.35, drift: 2.6, dim: 0.08 },
    fog: { sky: ['#949da6', '#aab2ba', '#c3c9cf', '#d8dcdf'], sun: 0.22, cover: 0.3, cloudDark: 0.15, fog: 0.85, drift: 0.6 },
    wind: { sky: ['#1f63c2', '#4590e0', '#8dc3f1', '#d3e9fa'], sun: 1, cover: 0.62, drift: 4, wind: 1 },
    sunshower: { sky: ['#386db6', '#5c93d2', '#9cc4e8', '#dce9f2'], sun: 1, sunBoost: 0.3, cover: 0.72, cloudDark: 0.3, deck: 0.25, deckFront: 0.55, deckColor: '#b9c3cf', rain: 0.3 },
    dusk: { sky: ['#23285e', '#6a3b88', '#d75f78', '#f7a25a'], sun: 0.9, sunY: 0.82, warm: 1, stars: 0.25, cloudA: 0.9, cover: 0.45, cloudDark: 0.25, cloudWarm: 1 },
    night: { sky: ['#03060f', '#081128', '#0f1d40', '#1b2d58'], moon: 1, moonGlow: 0.35, stars: 1, cloudA: 0.35, cover: 0.35, cloudDark: 0.85 },
    dawn: { sky: ['#2c3f74', '#7f78aa', '#d9a090', '#f4c890'], sun: 0.85, sunY: 0.8, warm: 0.75, stars: 0.08, cloudA: 0.9, cover: 0.4, cloudDark: 0.1, cloudWarm: 0.8 },
    rainbow: { sky: ['#1c62c4', '#4791e2', '#8fc5f1', '#ddf0fc'], sun: 1, cover: 0.4, rainbow: 0.3 }
  };
  const NUM_KEYS = Object.keys(BASE).filter(k => typeof BASE[k] === 'number' && !/[XY]$/.test(k));
  const MOODS = {};
  Object.keys(MOOD_DEFS).forEach(name => {
    const d = Object.assign({}, BASE, MOOD_DEFS[name]);
    d.sky = d.sky.map(hex);
    d.deckColor = hex(d.deckColor);
    MOODS[name] = Object.freeze(d);
  });

  /** Blend two parameter sets. Always returns a new object (callers may edit it). */
  function mix(a, b, k) {
    k = clamp(k, 0, 1);
    const o = { sky: [], deckColor: mixRGB(a.deckColor, b.deckColor, k) };
    for (let i = 0; i < NUM_KEYS.length; i++) o[NUM_KEYS[i]] = lerp(a[NUM_KEYS[i]], b[NUM_KEYS[i]], k);
    for (let i = 0; i < 4; i++) o.sky.push(mixRGB(a.sky[i], b.sky[i], k));
    place(o, a, b, k, 'sun', 'sunX', 'sunY');
    place(o, a, b, k, 'moon', 'moonX', 'moonY');
    return o;
  }
  // The sun and moon only travel while visible: positions are weighted by alpha,
  // so a sun fading out does not slide across the sky.
  function place(o, a, b, k, w, x, y) {
    const wa = (a[w] + 1e-4) * (1 - k), wb = (b[w] + 1e-4) * k, s = wa + wb || 1;
    o[x] = (a[x] * wa + b[x] * wb) / s;
    o[y] = (a[y] * wa + b[y] * wb) / s;
  }
  const copyP = p => mix(p, p, 0);
  /** frames: [[k, params | null (= P)], ...], smoothstepped segment by segment. */
  function keyframes(P, frames, k) {
    let i = 1;
    while (i < frames.length - 1 && k > frames[i][0]) i++;
    const a = frames[i - 1], b = frames[i];
    return mix(a[1] || P, b[1] || P, smooth((k - a[0]) / Math.max(1e-6, b[0] - a[0])));
  }
  /** Rough mean relative luminance of what the sky shows (for the brightness guard). */
  function lumP(p) {
    const w = [0.2, 0.3, 0.3, 0.2];
    let y = 0;
    for (let i = 0; i < 4; i++) y += w[i] * relLum(p.sky[i]);
    return y * (1 - p.dim) + 0.04 * p.sun * (1 + p.sunBoost);
  }
  function guardMs(from, to, ms) { return Math.max(ms, Math.abs(lumP(to) - lumP(from)) * LUM_GUARD); }

  /* ── state ───────────────────────────────────────────────────────────── */
  const S = {
    canvas: null, ctx: null, W: 1, H: 1, dpr: 1, speedUnit: 1, builtFor: null,
    motion: 'full', mood: 'day', serial: 0, from: MOODS.day, fadeT0: 0, fadeMs: 0, P: null, lum: 0,
    raf: 0, hidden: false, lastDraw: 0, fpsMode: 0, frames: 0, staticRenders: 0, errors: 0, busyUntil: 0,
    fx: [], drops: [], splashes: [], leaves: [], sparks: [], glows: [], gusts: [], stars: [],
    layers: null, clouds: null, sun: null, moon: null, glints: null, leafSprites: null,
    noise: null, rainTex: null, rainPat: null, bufs: {}, rbCache: new Map(), rbGeom: null,
    skyKey: '', skyGrad: null, lastGlow: -1e9, glowLog: [], maxGlow: 0, maxBolt: 0, nextGust: 0, canFilter: false
  };

  /* ── pre-rendered sprites ──────────────────────────────────────────────── */
  function detectFilter(g) {
    try {
      const C = window.CanvasRenderingContext2D;
      if (typeof C === 'function' && C.prototype && !('filter' in C.prototype)) return false;   // old Safari
      g.filter = 'blur(1px)';
      const ok = g.filter === 'blur(1px)';
      g.filter = 'none';
      return ok;
    } catch (e) { return false; }
  }

  /** Tileable fractal value noise, 4 octaves, as a white alpha mask (fog, overcast). */
  function makeNoise(seed) {
    const s = NOISE, c = makeCanvas(s, s), g = c.getContext('2d'), r = rng(seed);
    const img = g.createImageData(s, s), d = img.data;
    const cells = [4, 8, 16, 32], amps = [0.5, 0.25, 0.125, 0.0625];
    const grids = cells.map(n => { const a = new Float32Array(n * n); for (let i = 0; i < a.length; i++) a[i] = r(); return a; });
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        let v = 0;
        for (let o = 0; o < 4; o++) {
          const n = cells[o], gx = x / s * n, gy = y / s * n, ix = gx | 0, iy = gy | 0;
          const tx = gx - ix, ty = gy - iy, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
          const x1 = (ix + 1) % n, y1 = (iy + 1) % n, q = grids[o];
          v += amps[o] * lerp(lerp(q[iy * n + ix], q[iy * n + x1], sx), lerp(q[y1 * n + ix], q[y1 * n + x1], sx), sy);
        }
        const a = smooth((v / 0.9375 - 0.3) / 0.45), i = (y * s + x) * 4;
        d[i] = 240; d[i + 1] = 243; d[i + 2] = 247; d[i + 3] = Math.round(a * 255);
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  /** Still rain streaks (calm/off show this texture instead of particles). */
  function makeRainTex() {
    const s = 256, c = makeCanvas(s, s), g = c.getContext('2d'), r = rng(9);
    g.lineCap = 'round';
    for (let i = 0; i < 110; i++) {
      const x = r() * s, y = r() * s, len = 10 + r() * 22, dx = len * 0.16;
      g.strokeStyle = rgba([215, 228, 245], 0.25 + r() * 0.35);
      g.lineWidth = 0.8 + r() * 0.7;
      g.beginPath();
      for (let ox = -s; ox <= s; ox += s) for (let oy = -s; oy <= s; oy += s) { g.moveTo(x + ox, y + oy); g.lineTo(x + ox + dx, y + oy + len); }
      g.stroke();
    }
    return c;
  }

  /* Clouds: overlapping radial-gradient billows heaped into a dome over a flat
     base, top-lit, shaded underneath, then blurred. Every shape is rendered in
     three palettes and the mood blends them (lit -> warm rims -> dark slate). */
  const CLOUD_SHAPES = [
    { w: 0.26, a: 0.5 }, { w: 0.3, a: 0.45 }, { w: 0.22, a: 0.56 }, { w: 0.34, a: 0.42 },
    { w: 0.2, a: 0.6 }, { w: 0.28, a: 0.5 }, { w: 0.3, a: 0.78, puff: true }
  ];
  const PUFF = 6;
  const CLOUD_PAL = {
    lit: { top: hex('#ffffff'), mid: hex('#f2f5f9'), shade: hex('#c2cedc'), under: hex('#8796ab') },
    warm: { top: hex('#ffe3c2'), mid: hex('#f7b9a4'), shade: hex('#b8879f'), under: hex('#5f4a6c') },
    dark: { top: hex('#9ba3ae'), mid: hex('#6e7782'), shade: hex('#4a525c'), under: hex('#262b31') }
  };
  function cloudBlobs(seed, sh) {
    const r = rng(seed), blobs = [], pad = 0.07, base = sh.a * 0.8, top = pad + 0.02;
    const nb = sh.puff ? 5 : 7;
    for (let i = 0; i < nb; i++) {                       // the flat base row
      const rad = 0.075 + r() * 0.035;
      const x = clamp(pad + 0.08 + (1 - 2 * pad - 0.16) * i / (nb - 1) + (r() - 0.5) * 0.03, pad + rad, 1 - pad - rad);
      blobs.push({ x, y: base - rad * 0.55, r: rad });
    }
    const n = sh.puff ? 22 : 26 + Math.floor(r() * 10);
    for (let i = 0; i < n; i++) {                        // billows, biggest and highest mid-cloud
      const u = r() * 2 - 1, dome = 1 - u * u;
      const rad = Math.min(0.2, (0.06 + r() * 0.07) * (0.55 + 0.6 * dome) * (sh.puff ? 1.25 : 1));
      const x = clamp(0.5 + u * (0.5 - pad - rad), pad + rad, 1 - pad - rad);
      const yMax = base - rad * 0.5, yMin = Math.min(yMax, top + rad);
      blobs.push({ x, y: yMax - r() * (yMax - yMin) * (0.3 + 0.7 * dome), r: rad });
    }
    blobs.base = base;
    return blobs;
  }
  function renderCloud(blobs, pw, ph, pal) {
    const tmp = makeCanvas(pw, ph), g = tmp.getContext('2d'), s = pw;
    blobs.slice().sort((p, q) => q.y - p.y).forEach(b => {   // low billows first, high ones over them
      const x = b.x * s, y = b.y * s, rr = Math.max(1, b.r * s);
      const gr = g.createRadialGradient(x - rr * 0.2, y - rr * 0.5, rr * 0.05, x, y, rr);
      gr.addColorStop(0, rgba(pal.top, 1));
      gr.addColorStop(0.5, rgba(pal.mid, 1));
      gr.addColorStop(0.86, rgba(pal.shade, 1));
      gr.addColorStop(1, rgba(pal.shade, 0));
      g.fillStyle = gr;
      g.beginPath(); g.arc(x, y, rr, 0, TAU); g.fill();
    });
    const by = blobs.base * s;
    g.globalCompositeOperation = 'source-atop';              // shaded underside
    const vg = g.createLinearGradient(0, ph * 0.3, 0, by);
    vg.addColorStop(0, rgba(pal.under, 0)); vg.addColorStop(1, rgba(pal.under, 0.5));
    g.fillStyle = vg; g.fillRect(0, 0, pw, ph);
    g.globalCompositeOperation = 'destination-out';          // trim to a flat base
    const cut = g.createLinearGradient(0, by - pw * 0.02, 0, by + pw * 0.03);
    cut.addColorStop(0, 'rgba(0,0,0,0)'); cut.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = cut; g.fillRect(0, 0, pw, ph);
    g.globalCompositeOperation = 'source-over';
    const out = makeCanvas(pw, ph), o = out.getContext('2d'), blur = Math.max(1, pw * 0.01);
    if (S.canFilter) {
      o.filter = 'blur(' + blur.toFixed(1) + 'px)'; o.drawImage(tmp, 0, 0); o.filter = 'none';
    } else {                                                  // no ctx.filter: stack nudged copies
      o.globalAlpha = 0.6; o.drawImage(tmp, 0, 0);
      o.globalAlpha = 0.22;
      for (let i = 0; i < 6; i++) o.drawImage(tmp, Math.cos(i / 6 * TAU) * blur * 1.5, Math.sin(i / 6 * TAU) * blur * 1.5);
      o.globalAlpha = 1;
    }
    return out;
  }
  function makeCloud(sh, idx, u) {
    const w = sh.w * u, h = w * sh.a, blobs = cloudBlobs(1000 + idx * 77, sh);
    const pw = Math.max(16, Math.round(w * CLOUD_RES)), ph = Math.max(10, Math.round(h * CLOUD_RES));
    return { w, h, lit: renderCloud(blobs, pw, ph, CLOUD_PAL.lit), warm: renderCloud(blobs, pw, ph, CLOUD_PAL.warm), dark: renderCloud(blobs, pw, ph, CLOUD_PAL.dark) };
  }

  /** Sun: layered bloom (wide halo, ring hugging the disc, soft-edged disc). */
  function makeSun(m, warm) {
    const rs = clamp(m * 0.045, 20, 62), R = rs * 7, px = Math.ceil(R * 2 * SUN_RES);
    const c = makeCanvas(px, px), g = c.getContext('2d');
    g.setTransform(SUN_RES, 0, 0, SUN_RES, 0, 0);
    const halo = warm ? [255, 170, 95] : [255, 244, 214], core = warm ? [255, 222, 170] : [255, 253, 240];
    let gr = g.createRadialGradient(R, R, 0, R, R, R);
    gr.addColorStop(0, rgba(halo, 0.5)); gr.addColorStop(0.1, rgba(halo, 0.3));
    gr.addColorStop(0.3, rgba(halo, 0.1)); gr.addColorStop(1, rgba(halo, 0));
    g.fillStyle = gr; g.fillRect(0, 0, R * 2, R * 2);
    gr = g.createRadialGradient(R, R, rs * 0.7, R, R, rs * 2.2);
    gr.addColorStop(0, rgba(core, 0.7)); gr.addColorStop(1, rgba(halo, 0));
    g.fillStyle = gr; g.beginPath(); g.arc(R, R, rs * 2.2, 0, TAU); g.fill();
    gr = g.createRadialGradient(R, R, 0, R, R, rs * 1.08);
    gr.addColorStop(0, rgba(core, 1)); gr.addColorStop(0.82, rgba(core, 1)); gr.addColorStop(1, rgba(core, 0));
    g.fillStyle = gr; g.beginPath(); g.arc(R, R, rs * 1.08, 0, TAU); g.fill();
    return { c, size: R * 2 };
  }

  /** Moon: soft glow, off-centre lit disc, faint maria, darker limb; plus a big halo. */
  function makeMoon(m) {
    const rm = clamp(m * 0.034, 16, 46), R = rm * 6, res = 0.75, r = rng(42);
    const c = makeCanvas(R * 2 * res, R * 2 * res), g = c.getContext('2d');
    g.setTransform(res, 0, 0, res, 0, 0);
    let gr = g.createRadialGradient(R, R, 0, R, R, R);
    gr.addColorStop(0, 'rgba(215,225,255,0.32)'); gr.addColorStop(0.16, 'rgba(190,205,255,0.16)');
    gr.addColorStop(0.45, 'rgba(170,190,250,0.05)'); gr.addColorStop(1, 'rgba(170,190,250,0)');
    g.fillStyle = gr; g.fillRect(0, 0, R * 2, R * 2);
    g.save();
    g.beginPath(); g.arc(R, R, rm, 0, TAU); g.clip();
    gr = g.createRadialGradient(R - rm * 0.35, R - rm * 0.35, rm * 0.1, R, R, rm * 1.02);
    gr.addColorStop(0, '#fdfcf3'); gr.addColorStop(0.7, '#e8e7da'); gr.addColorStop(1, '#c9c8bc');
    g.fillStyle = gr; g.fillRect(R - rm, R - rm, rm * 2, rm * 2);
    for (let i = 0; i < 7; i++) {
      const a = r() * TAU, d = (0.15 + r() * 0.45) * rm, mr = (0.16 + r() * 0.18) * rm;
      const x = R + Math.cos(a) * d, y = R + Math.sin(a) * d;
      gr = g.createRadialGradient(x, y, 0, x, y, mr);
      gr.addColorStop(0, 'rgba(118,122,128,0.3)'); gr.addColorStop(1, 'rgba(118,122,128,0)');
      g.fillStyle = gr; g.fillRect(x - mr, y - mr, mr * 2, mr * 2);
    }
    gr = g.createRadialGradient(R, R, rm * 0.62, R, R, rm);
    gr.addColorStop(0, 'rgba(140,140,132,0)'); gr.addColorStop(1, 'rgba(140,140,132,0.3)');
    g.fillStyle = gr; g.fillRect(R - rm, R - rm, rm * 2, rm * 2);
    g.restore();
    const HR = rm * 12, hres = 0.3, halo = makeCanvas(HR * 2 * hres, HR * 2 * hres), h = halo.getContext('2d');
    h.setTransform(hres, 0, 0, hres, 0, 0);
    gr = h.createRadialGradient(HR, HR, 0, HR, HR, HR);
    gr.addColorStop(0, 'rgba(200,212,255,0.35)'); gr.addColorStop(0.25, 'rgba(190,205,255,0.12)'); gr.addColorStop(1, 'rgba(190,205,255,0)');
    h.fillStyle = gr; h.fillRect(0, 0, HR * 2, HR * 2);
    return { c, size: R * 2, halo, haloSize: HR * 2 };
  }

  /** Four-point glints for sparkles and the brightest stars. */
  const GLINT_COLS = [[255, 255, 255], [255, 222, 130], [255, 175, 215], [160, 232, 255], [205, 180, 255]];
  function makeGlint(col) {
    const s = 32, h = s / 2, c = makeCanvas(s, s), g = c.getContext('2d');
    const gr = g.createRadialGradient(h, h, 0, h, h, h);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, rgba(col, 0.85));
    gr.addColorStop(0.45, rgba(col, 0.2)); gr.addColorStop(1, rgba(col, 0));
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
    g.globalCompositeOperation = 'lighter';
    const hz = g.createLinearGradient(0, h, s, h), vt = g.createLinearGradient(h, 0, h, s);
    [hz, vt].forEach(lg => { lg.addColorStop(0, rgba(col, 0)); lg.addColorStop(0.5, 'rgba(255,255,255,0.9)'); lg.addColorStop(1, rgba(col, 0)); });
    g.fillStyle = hz; g.fillRect(0, h - 0.75, s, 1.5);
    g.fillStyle = vt; g.fillRect(h - 0.75, 0, 1.5, s);
    return c;
  }

  /** Leaves and petals for the wind. */
  const LEAF_KINDS = [['leaf', '#6fae3a'], ['leaf', '#a9c63c'], ['leaf', '#e3a12b'], ['leaf', '#c4572e'], ['petal', '#f7b7d0'], ['petal', '#fff2f7']];
  function makeLeaf(kind, color) {
    const s = 48, c = makeCanvas(s, s), g = c.getContext('2d'), col = hex(color), dark = mixRGB(col, [40, 40, 20], 0.35);
    g.translate(s / 2, s / 2);
    if (kind === 'leaf') {
      g.beginPath(); g.moveTo(-20, 0); g.quadraticCurveTo(-4, -15, 20, 0); g.quadraticCurveTo(-4, 15, -20, 0); g.closePath();
      const gr = g.createLinearGradient(0, -12, 0, 12);
      gr.addColorStop(0, rgba(mixRGB(col, [255, 255, 255], 0.25), 1)); gr.addColorStop(1, rgba(dark, 1));
      g.fillStyle = gr; g.fill();
      g.strokeStyle = rgba(dark, 0.8); g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(-23, 0); g.lineTo(16, 0); g.stroke();
    } else {
      const gr = g.createRadialGradient(-5, -3, 1, 0, 0, 15);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, rgba(col, 1));
      g.fillStyle = gr; g.beginPath(); g.ellipse(0, 0, 15, 9, 0, 0, TAU); g.fill();
    }
    return c;
  }

  /* Three parallax cloud layers. Positions are fractions, so they survive resizes;
     each cloud has a rank and shows only while the mood's cover is above it. */
  const LAYERS = [
    { n: 7, s0: 0.48, s1: 0.66, y0: 0.04, y1: 0.34, alpha: 0.82, speed: 5 },
    { n: 6, s0: 0.72, s1: 0.92, y0: 0.02, y1: 0.42, alpha: 0.94, speed: 9 },
    { n: 4, s0: 1.0, s1: 1.2, y0: -0.02, y1: 0.22, alpha: 1, speed: 15 }
  ];
  function buildCloudField() {
    const maxW = Math.max.apply(null, S.clouds.slice(0, PUFF).map(c => c.w));
    S.layers = LAYERS.map((L, li) => {
      let items = S.layers && S.layers[li] && S.layers[li].items;
      if (!items) {
        const ranks = [];
        for (let i = 0; i < L.n; i++) ranks.splice(Math.floor(Math.random() * (i + 1)), 0, (i + 0.5) / L.n);
        items = ranks.map((rank, i) => ({
          fx: (i + Math.random() * 0.6) / L.n, fy: lerp(L.y0, L.y1, Math.random()),
          s: lerp(L.s0, L.s1, Math.random()), shape: Math.floor(Math.random() * PUFF), rank
        }));
      }
      return { L, items, margin: maxW * L.s1 + 20 };
    });
  }
  function makeStars() {
    const n = Math.min(CAPS.stars, Math.round(S.W * S.H / 6500));
    S.stars = [];
    for (let i = 0; i < n; i++) {
      const r = Math.random();
      S.stars.push({ x: Math.random(), y: Math.pow(Math.random(), 1.35) * 0.82, s: 0.6 + r * r * 1.4, a: 0.35 + Math.random() * 0.65,
        sp: 0.35 + Math.random() * 1.1, ph: Math.random() * TAU, big: Math.random() < 0.07 });
    }
  }
  /** Size-dependent sprites; rebuilt only when a resize changes the size class by >12%. */
  function buildSprites() {
    const u = Math.max(S.W, S.H), m = Math.min(S.W, S.H), b = S.builtFor;
    if (b && Math.abs(u - b.u) / b.u < 0.12 && Math.abs(m - b.m) / b.m < 0.12) return;
    S.builtFor = { u, m };
    S.speedUnit = u / 1280;
    S.clouds = CLOUD_SHAPES.map((sh, i) => makeCloud(sh, i, u));
    S.sun = { day: makeSun(m, false), warm: makeSun(m, true) };
    S.moon = makeMoon(m);
    buildCloudField();
    makeStars();
  }

  /* ── offscreen buffers and masks ───────────────────────────────────────── */
  function buffer(name, w, h) {
    w = Math.max(1, Math.ceil(w)); h = Math.max(1, Math.ceil(h));
    let b = S.bufs[name];
    if (!b || b.w !== w || b.h !== h) b = S.bufs[name] = newBuf(w, h);
    return b;
  }
  /** Draws the noise tile at `size` px, wrapping, shifted right/down by sx/sy. */
  function tileNoise(g, w, h, size, sx, sy, alpha) {
    if (!S.noise) return;
    size = Math.max(8, size);
    const x0 = ((sx % size) + size) % size - size, y0 = ((sy % size) + size) % size - size;
    g.globalAlpha = clamp(alpha, 0, 1);
    for (let y = y0; y < h; y += size) for (let x = x0; x < w; x += size) g.drawImage(S.noise, x, y, size + 0.5, size + 0.5);
    g.globalAlpha = 1;
  }
  /** Horizontal mask: opaque left of c, clear right of it, soft over +-half (fractions). */
  function edgeGrad(g, w, c, half) {
    const gr = g.createLinearGradient(0, 0, w, 0), a = x => clamp((c + half - x) / (2 * half), 0, 1);
    [0, clamp(c - half, 0, 1), clamp(c + half, 0, 1), 1].forEach(p => gr.addColorStop(p, 'rgba(0,0,0,' + (+a(p).toFixed(3)) + ')'));
    return gr;
  }
  /** Rectangle with feathered edges (product of two linear ramps). */
  function featherMask(w, h, fp) {
    const c = makeCanvas(w, h), g = c.getContext('2d');
    const ramp2 = (gr, f) => { gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(f, 'rgba(0,0,0,1)'); gr.addColorStop(1 - f, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); return gr; };
    g.fillStyle = ramp2(g.createLinearGradient(0, 0, c.width, 0), clamp(fp / c.width, 0.01, 0.49));
    g.fillRect(0, 0, c.width, c.height);
    g.globalCompositeOperation = 'destination-in';
    g.fillStyle = ramp2(g.createLinearGradient(0, 0, 0, c.height), clamp(fp / c.height, 0.01, 0.49));
    g.fillRect(0, 0, c.width, c.height);
    return c;
  }
  const drift = t => (S.motion === 'full' ? t / 1000 : S.motion === 'calm' ? t / 4000 : 0);

  /* ── sky, stars, sun, moon ─────────────────────────────────────────────── */
  const SKY_STOPS = [0, 0.42, 0.78, 1];
  function drawSky(ctx, P) {
    const key = P.sky.join('|');
    if (key !== S.skyKey || !S.skyGrad) {
      const g = ctx.createLinearGradient(0, 0, 0, S.H);
      for (let i = 0; i < 4; i++) g.addColorStop(SKY_STOPS[i], rgba(P.sky[i], 1));
      S.skyGrad = g; S.skyKey = key;
    }
    ctx.fillStyle = S.skyGrad;
    ctx.fillRect(0, 0, S.W, S.H);
  }
  function drawStars(ctx, P, t) {
    const vis = P.stars * (1 - 0.8 * P.deck) * (1 - 0.7 * P.fog);
    if (vis < 0.01 || !S.stars.length) return;
    const tw = S.motion === 'off' ? 0 : S.motion === 'calm' ? 0.12 : 0.3, ts = t / 1000;   // slow sine, never a blink
    const buckets = [[], [], [], [], []], bright = [];
    for (const st of S.stars) {
      const a = vis * st.a * (1 - tw * (0.5 + 0.5 * Math.sin(ts * st.sp + st.ph)));
      buckets[clamp(Math.floor(a * 5), 0, 4)].push(st);
      if (st.big) bright.push([st, a]);
    }
    ctx.fillStyle = '#f4f7ff';
    for (let b = 0; b < 5; b++) {
      if (!buckets[b].length) continue;
      ctx.globalAlpha = (b + 0.5) / 5;
      for (const st of buckets[b]) ctx.fillRect(st.x * S.W - st.s / 2, st.y * S.H - st.s / 2, st.s, st.s);
    }
    if (S.glints) {
      ctx.globalCompositeOperation = 'lighter';
      for (const [st, a] of bright) { ctx.globalAlpha = clamp(a * 0.6, 0, 1); ctx.drawImage(S.glints[0], st.x * S.W - 7, st.y * S.H - 7, 14, 14); }
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1;
  }
  function drawMoon(ctx, P) {
    if (P.moon < 0.01 || !S.moon) return;
    const m = S.moon, x = P.moonX * S.W, y = P.moonY * S.H;
    if (P.moonGlow > 0.01) {
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = clamp(P.moonGlow * P.moon, 0, 1);
      ctx.drawImage(m.halo, x - m.haloSize / 2, y - m.haloSize / 2, m.haloSize, m.haloSize);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = clamp(P.moon, 0, 1);
    ctx.drawImage(m.c, x - m.size / 2, y - m.size / 2, m.size, m.size);
    ctx.globalAlpha = 1;
  }
  function drawSun(ctx, P) {
    if (P.sun < 0.01 || !S.sun) return;
    const x = P.sunX * S.W, y = P.sunY * S.H, boost = Math.max(0, P.sunBoost);
    ctx.globalCompositeOperation = 'screen';
    [[S.sun.day, P.sun * (1 - P.warm)], [S.sun.warm, P.sun * P.warm]].forEach(pair => {
      if (pair[1] < 0.005) return;
      const sz = pair[0].size * (1 + boost * 0.35);
      ctx.globalAlpha = clamp(pair[1] * (1 + boost * 0.4), 0, 1);
      ctx.drawImage(pair[0].c, x - sz / 2, y - sz / 2, sz, sz);
    });
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  /* ── clouds, overcast deck, fog ────────────────────────────────────────── */
  function drawTinted(ctx, sp, x, y, w, h, a, P) {
    const dark = clamp(P.cloudDark, 0, 1), warm = clamp(P.cloudWarm, 0, 1);
    if (dark < 0.98) { ctx.globalAlpha = clamp(a, 0, 1); ctx.drawImage(sp.lit, x, y, w, h); }
    if (warm > 0.01) { ctx.globalAlpha = clamp(a * warm * (1 - dark * 0.5), 0, 1); ctx.drawImage(sp.warm, x, y, w, h); }
    if (dark > 0.01) { ctx.globalAlpha = clamp(a * dark, 0, 1); ctx.drawImage(sp.dark, x, y, w, h); }
    ctx.globalAlpha = 1;
  }
  function drawCloudLayer(ctx, P, li) {
    const layer = S.layers && S.layers[li];
    if (!layer || P.cloudA < 0.01) return;
    const span = S.W + 2 * layer.margin;
    for (const it of layer.items) {
      const a = P.cloudA * layer.L.alpha * ramp(P.cover - it.rank, -0.08, 0.08);
      if (a < 0.01) continue;
      const sp = S.clouds[it.shape], w = sp.w * it.s, h = sp.h * it.s;
      const x = it.fx * span - layer.margin, y = it.fy * S.H - h / 2;
      if (x > S.W || x + w < 0) continue;
      drawTinted(ctx, sp, x, y, w, h, a, P);
    }
  }
  function drawDeck(ctx, P, t) {
    if (P.deck < 0.01 || P.deckFront < 0.01 || !S.noise) return;
    const dh = S.H * 0.72, bw = Math.max(8, Math.round(S.W * FOG_RES)), bh = Math.max(8, Math.round(dh * FOG_RES));
    const b = buffer('deck', bw, bh), n = buffer('deckNoise', bw, bh), g = b.g, gn = n.g;
    const tt = drift(t), v = 3 * P.drift;
    gn.globalCompositeOperation = 'source-over';
    gn.clearRect(0, 0, bw, bh);
    tileNoise(gn, bw, bh, bw * 0.7, tt * v, 0, 1);                 // light billows ...
    tileNoise(gn, bw, bh, bw * 0.42, tt * v * 1.7 + 50, 20, 0.8);
    gn.globalCompositeOperation = 'source-in';                      // ... tinted a little lighter than the deck
    gn.fillStyle = rgba(mixRGB(P.deckColor, [255, 255, 255], 0.3), 1);
    gn.fillRect(0, 0, bw, bh);
    gn.globalCompositeOperation = 'source-over';
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, bw, bh);
    g.fillStyle = rgba(P.deckColor, 0.7);
    g.fillRect(0, 0, bw, bh);
    g.globalAlpha = 0.9; g.drawImage(n.c, 0, 0); g.globalAlpha = 1;
    g.globalCompositeOperation = 'destination-in';                  // thins toward the horizon
    const vg = g.createLinearGradient(0, 0, 0, bh);
    vg.addColorStop(0, 'rgba(0,0,0,1)'); vg.addColorStop(0.55, 'rgba(0,0,0,0.75)'); vg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = vg; g.fillRect(0, 0, bw, bh);
    if (P.deckFront < 0.995) { g.fillStyle = edgeGrad(g, bw, P.deckFront * 1.3 - 0.15, 0.15); g.fillRect(0, 0, bw, bh); }   // rolls in from the left
    g.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = clamp(P.deck, 0, 1);
    ctx.drawImage(b.c, 0, 0, S.W, dh);
    ctx.globalAlpha = 1;
  }
  /** Fog: a milky haze plus three noise layers drifting at different speeds, in a low-res buffer. */
  function paintFog(g, bw, bh, el, seed) {
    const big = Math.max(bw, bh);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.clearRect(0, 0, bw, bh);
    g.fillStyle = 'rgba(234,238,242,0.5)';
    g.fillRect(0, 0, bw, bh);
    tileNoise(g, bw, bh, big * 0.95, seed + el * big * 0.05, seed * 0.7, 0.95);
    tileNoise(g, bw, bh, big * 0.6, seed * 1.3 + el * big * 0.09, el * big * 0.01, 0.75);
    tileNoise(g, bw, bh, big * 0.38, seed * 0.4 + el * big * 0.14, seed, 0.55);
  }
  function drawMoodFog(ctx, P, t) {
    if (P.fog < 0.01 || !S.noise) return;
    const b = buffer('moodFog', S.W * FOG_RES, S.H * FOG_RES), g = b.g;
    paintFog(g, b.w, b.h, drift(t) * 0.5, 31);
    g.globalCompositeOperation = 'destination-in';                  // denser near the ground
    const vg = g.createLinearGradient(0, 0, 0, b.h);
    vg.addColorStop(0, 'rgba(0,0,0,0.5)'); vg.addColorStop(0.6, 'rgba(0,0,0,0.85)'); vg.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = vg; g.fillRect(0, 0, b.w, b.h);
    g.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = clamp(P.fog, 0, 1);
    ctx.drawImage(b.c, 0, 0, S.W, S.H);
    ctx.globalAlpha = 1;
  }

  /* ── rainbows ─────────────────────────────────────────────────────────────
     Bands are ONE radial gradient (soft concentric ROYGBIV, red outermost on the
     primary), painted at low resolution into a buffer, masked so the feet fade,
     and composited with 'screen' so the sky shows through. Cached per geometry. */
  const RB = [[255, 64, 64], [255, 146, 52], [255, 228, 84], [88, 204, 108], [70, 148, 255], [92, 92, 222], [162, 92, 216]];
  const ONES = [1, 1, 1, 1, 1, 1, 1];
  function rbDefault() { return { cx: S.W / 2, cy: S.H * 0.97, R: 0.45 * Math.min(S.W, S.H * 1.6) }; }
  function rbFrom(o) {
    const d = rbDefault();
    return { cx: num(o.cx, d.cx), cy: num(o.cy, d.cy), R: num(o.radius, d.R, 24, 1e5) };
  }
  function moodRbGeom() {
    const g = S.rbGeom;
    return g ? { cx: g.fx * S.W, cy: g.fy * S.H, R: g.fr * Math.min(S.W, S.H * 1.6) } : rbDefault();
  }
  function rbLayout(geom, kind) {
    const R = geom.R, bw = R * 0.085, fe = bw * 0.4, R2 = R * 1.22, bw2 = bw * 1.6;
    const outer = (kind === 'single' ? R : R2) + fe * 2;
    return { R, bw, fe, R2, bw2, x: geom.cx - outer, y: geom.cy - outer, w: outer * 2, h: outer + fe };
  }
  function bands(g, cx, cy, rIn, rOut, fe, alphas, reversed) {
    const r0 = Math.max(0, rIn - fe), r1 = rOut + fe, span = r1 - r0;
    const gr = g.createRadialGradient(cx, cy, r0, cx, cy, r1);
    gr.addColorStop(0, rgba(RB[reversed ? 0 : 6], 0));
    for (let i = 0; i < 7; i++) {                                   // i = 0 is the inner edge
      const ci = reversed ? i : 6 - i, r = rIn + (i + 0.5) / 7 * (rOut - rIn);
      gr.addColorStop(clamp((r - r0) / span, 0, 1), rgba(RB[ci], alphas[ci]));
    }
    gr.addColorStop(1, rgba(RB[reversed ? 6 : 0], 0));
    g.fillStyle = gr;
    g.fillRect(cx - r1, cy - r1, r1 * 2, r1 + fe);
  }
  /** kind: 'single' | 'double' (primary + reversed secondary) | 'dark' (Alexander's band). */
  function paintRainbow(b, geom, kind, alphas, sweep) {
    const L = rbLayout(geom, kind), g = b.g, cx = geom.cx, cy = geom.cy;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    g.clearRect(0, 0, b.w, b.h);
    g.setTransform(RB_RES, 0, 0, RB_RES, -L.x * RB_RES, -L.y * RB_RES);
    if (kind === 'dark') {
      const r0 = L.R + L.fe * 0.5, r1 = Math.max(r0 + 1, L.R2 - L.bw2 - L.fe * 0.5);
      const gr = g.createRadialGradient(cx, cy, r0, cx, cy, r1);
      gr.addColorStop(0, 'rgba(12,20,40,0)'); gr.addColorStop(0.3, 'rgba(12,20,40,0.22)');
      gr.addColorStop(0.7, 'rgba(12,20,40,0.22)'); gr.addColorStop(1, 'rgba(12,20,40,0)');
      g.fillStyle = gr; g.fillRect(L.x, L.y, L.w, L.h);
    } else {
      const ri = L.R - L.bw, i0 = ri * 0.55, i1 = ri + L.fe;      // the sky inside a bow is a touch brighter
      const gi = g.createRadialGradient(cx, cy, i0, cx, cy, i1);
      gi.addColorStop(0, 'rgba(255,255,255,0)');
      gi.addColorStop((ri - i0) / (i1 - i0), rgba([255, 255, 255], 0.16 * alphas[6]));
      gi.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gi; g.fillRect(L.x, L.y, L.w, L.h);
      bands(g, cx, cy, L.R - L.bw, L.R, L.fe, alphas, false);
      if (kind === 'double') bands(g, cx, cy, L.R2 - L.bw2, L.R2, L.fe * 1.4, alphas.map(a => a * 0.45), true);
    }
    g.globalCompositeOperation = 'destination-in';
    const top = cy - L.R * 0.5, m = g.createLinearGradient(0, top, 0, cy + L.fe);   // the feet fade a little
    m.addColorStop(0, 'rgba(0,0,0,1)'); m.addColorStop((cy - top) / (cy + L.fe - top), 'rgba(0,0,0,0.2)'); m.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = m; g.fillRect(L.x, L.y, L.w, L.h);
    if (sweep < 1 && typeof g.createConicGradient === 'function') {  // the arc grows from the left foot over the top
      const cg = g.createConicGradient(Math.PI, cx, cy), c = clamp(sweep, 0, 1) * 0.5, half = 0.035;
      const a = x => clamp((c + half - x) / (2 * half), 0, 1);
      if (cg && cg.addColorStop) {
        [0, clamp(c - half, 0, 1), clamp(c + half, 0, 1), 1].forEach(p => cg.addColorStop(p, 'rgba(0,0,0,' + (+a(p).toFixed(3)) + ')'));
        g.fillStyle = cg; g.fillRect(L.x, L.y, L.w, L.h);
      }
    }
    g.globalCompositeOperation = 'source-over';
    g.setTransform(1, 0, 0, 1, 0, 0);
    return L;
  }
  function rainbowSprite(geom, kind) {
    const key = kind + ':' + Math.round(geom.cx) + ',' + Math.round(geom.cy) + ',' + Math.round(geom.R);
    let sp = S.rbCache.get(key);
    if (!sp) {
      const L = rbLayout(geom, kind), b = newBuf(L.w * RB_RES, L.h * RB_RES);
      paintRainbow(b, geom, kind, ONES, 1);
      sp = { c: b.c, x: L.x, y: L.y, w: b.w / RB_RES, h: b.h / RB_RES };
      if (S.rbCache.size >= 5) S.rbCache.delete(S.rbCache.keys().next().value);
      S.rbCache.set(key, sp);
    }
    return sp;
  }
  function drawRainbowSprite(ctx, geom, double, alpha) {
    if (alpha < 0.005) return;
    if (double) {
      const d = rainbowSprite(geom, 'dark');
      ctx.globalAlpha = clamp(alpha / 0.5, 0, 1);
      ctx.drawImage(d.c, d.x, d.y, d.w, d.h);
    }
    const sp = rainbowSprite(geom, double ? 'double' : 'single');
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = clamp(alpha, 0, 1);
    ctx.drawImage(sp.c, sp.x, sp.y, sp.w, sp.h);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
  /** p 0..1: bands fade in one by one from red (outside) to violet while the arc sweeps. */
  function drawRainbowGrowing(ctx, geom, p, alpha) {
    if (p >= 1) { drawRainbowSprite(ctx, geom, false, alpha); return; }
    if (alpha < 0.005) return;
    const L = rbLayout(geom, 'single'), b = buffer('rbGrow', L.w * RB_RES, L.h * RB_RES);
    paintRainbow(b, geom, 'single', RB.map((c, i) => ramp(p, i * 0.07, i * 0.07 + 0.5)), ramp(p, 0, 0.55));
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = clamp(alpha, 0, 1);
    ctx.drawImage(b.c, L.x, L.y, b.w / RB_RES, b.h / RB_RES);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  /* ── particles: rain, leaves, sparkles, gusts, lightning ───────────────── */
  const RAIN_A = [0.2, 0.32, 0.48], RAIN_W = [0.8, 1.1, 1.5];
  function resetDrop(d, P, first) {
    const sp = lerp(850, 1400, P.heavy) * (0.75 + Math.random() * 0.5), slant = 0.12 + P.wind * 0.18;
    d.vx = sp * slant; d.vy = sp;
    d.len = lerp(16, 30, P.heavy) * (0.6 + Math.random() * 0.8);
    d.k = d.len / sp;
    d.x = Math.random() * (S.W + S.H * slant) - S.H * slant;
    d.y = first ? -d.len - Math.random() * S.H * 0.5 : -d.len - Math.random() * 60;
    d.ground = S.H - Math.random() * S.H * 0.06;
    const r = Math.random();
    d.b = r < 0.5 ? 0 : r < 0.85 ? 1 : 2;
    d.splash = Math.random() < 0.45;
    return d;
  }
  function updateRain(P, dt) {
    const target = Math.min(CAPS.rain, Math.round(P.rain * (170 + 330 * P.heavy)));
    const drops = S.drops;
    let budget = Math.max(3, Math.ceil(target * dt * 2.2));
    while (drops.length < target && budget-- > 0) drops.push(resetDrop({}, P, true));
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      d.x += d.vx * dt; d.y += d.vy * dt;
      if (d.y < d.ground) continue;
      if (d.splash && S.splashes.length < CAPS.splashes) S.splashes.push({ x: d.x, y: d.ground, age: 0, life: 0.3 + Math.random() * 0.2, r: 4 + Math.random() * 7 });
      if (drops.length > target) { drops[i] = drops[drops.length - 1]; drops.pop(); } else resetDrop(d, P, false);
    }
    const sp = S.splashes;
    for (let i = sp.length - 1; i >= 0; i--) { sp[i].age += dt; if (sp[i].age >= sp[i].life) { sp[i] = sp[sp.length - 1]; sp.pop(); } }
  }
  function drawRain(ctx, P) {
    if (S.motion !== 'full') {                                       // calm/off: still texture, no particles
      if (P.rain > 0.01 && S.rainPat) {
        ctx.globalAlpha = clamp(P.rain * (0.45 + 0.25 * P.heavy), 0, 1);
        ctx.fillStyle = S.rainPat; ctx.fillRect(0, 0, S.W, S.H);
        ctx.globalAlpha = 1;
      }
      return;
    }
    if (!S.drops.length && !S.splashes.length) return;
    const col = mixRGB([222, 232, 250], [150, 168, 196], clamp(S.lum * 2.2 - 0.3, 0, 1));
    ctx.lineCap = 'butt';
    for (let b = 0; b < 3; b++) {
      ctx.strokeStyle = rgba(col, RAIN_A[b]); ctx.lineWidth = RAIN_W[b];
      ctx.beginPath();
      let any = false;
      for (const d of S.drops) if (d.b === b && d.y > -d.len) { ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - d.vx * d.k, d.y - d.len); any = true; }
      if (any) ctx.stroke();
    }
    ctx.lineWidth = 0.9;
    for (let half = 0; half < 2; half++) {
      ctx.strokeStyle = rgba(col, half ? 0.12 : 0.3);
      ctx.beginPath();
      let any = false;
      for (const s of S.splashes) {
        const k = s.age / s.life;
        if ((k >= 0.5) !== !!half) continue;
        const rr = s.r * (0.3 + 0.7 * k);
        ctx.moveTo(s.x + rr, s.y); ctx.ellipse(s.x, s.y, rr, rr * 0.28, 0, 0, TAU); any = true;
      }
      if (any) ctx.stroke();
    }
  }
  function makeGust(from, to, n, strength) {
    const dx = to.x - from.x, dy = to.y - from.y, dist = Math.hypot(dx, dy) || 1, nx = -dy / dist, ny = dx / dist;
    const bend = dist * 0.12, spread = Math.min(S.W, S.H) * 0.12, streaks = [];
    for (let i = 0; i < n; i++) {
      streaks.push({ off: (Math.random() * 2 - 1) * spread, start: Math.random() * 0.35, len: 0.16 + Math.random() * 0.16,
        w: 1.2 + Math.random() * 2.4, a: 0.5 + Math.random() * 0.5, wob: Math.random() * TAU });
    }
    return { p0: from, p1: { x: from.x + dx / 3 + nx * bend, y: from.y + dy / 3 + ny * bend },
      p2: { x: from.x + dx * 2 / 3 - nx * bend, y: from.y + dy * 2 / 3 - ny * bend }, p3: to, nx, ny, dist, streaks, strength };
  }
  function bez(g, u, off) {
    const v = 1 - u, a = v * v * v, b = 3 * v * v * u, c = 3 * v * u * u, d = u * u * u;
    return [a * g.p0.x + b * g.p1.x + c * g.p2.x + d * g.p3.x + g.nx * off, a * g.p0.y + b * g.p1.y + c * g.p2.y + d * g.p3.y + g.ny * off];
  }
  /** Curved translucent streaks travelling along the gust path, alpha graded along each. */
  function drawGust(ctx, g, k, amp, still) {
    ctx.lineCap = 'round';
    for (const s of g.streaks) {
      let head, life = 1;
      if (still) head = 0.3 + s.start + s.len;
      else {
        const q = (k - s.start) / 0.62;
        if (q <= 0 || q >= 1) continue;
        head = q * (1 + s.len); life = Math.sin(Math.PI * q);
      }
      const u0 = clamp(head - s.len, 0, 1), u1 = clamp(head, 0, 1), a = g.strength * 0.34 * s.a * life * amp;
      if (u1 - u0 < 0.01 || a < 0.01) continue;
      const pA = bez(g, u0, s.off), pB = bez(g, u1, s.off);
      if (Math.abs(pB[0] - pA[0]) + Math.abs(pB[1] - pA[1]) < 2) continue;
      const gr = ctx.createLinearGradient(pA[0], pA[1], pB[0], pB[1]);
      gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.65, rgba([255, 255, 255], a)); gr.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.strokeStyle = gr; ctx.lineWidth = s.w;
      ctx.beginPath();
      for (let j = 0; j <= 10; j++) {
        const u = lerp(u0, u1, j / 10), p = bez(g, u, s.off + Math.sin(u * 9 + s.wob) * g.dist * 0.008);
        if (j) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]);
      }
      ctx.stroke();
    }
  }
  function spawnLeaf(g, ms) {
    const dx = g.p3.x - g.p0.x, dy = g.p3.y - g.p0.y, sp = g.dist / (ms * 0.0006) * (0.8 + Math.random() * 0.4);
    const off = (Math.random() * 2 - 1) * Math.min(S.W, S.H) * 0.14, back = Math.random() * 40;
    S.leaves.push({ x: g.p0.x + g.nx * off - dx / g.dist * back, y: g.p0.y + g.ny * off - dy / g.dist * back,
      vx: dx / g.dist * sp, vy: dy / g.dist * sp, rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 7,
      flip: Math.random() * TAU, vf: 3 + Math.random() * 5, size: 14 + Math.random() * 12,
      spr: Math.floor(Math.random() * LEAF_KINDS.length), ph: Math.random() * TAU, age: 0, life: ms / 1000 * 1.1, ambient: false });
    S.busyUntil = Math.max(S.busyUntil, now() + ms * 1.1);
  }
  function updateWind(P, t, dt) {
    if (P.wind > 0.05) {                                             // ambient leaves and gusts (mood 'wind', storms)
      let ambient = 0;
      for (const L of S.leaves) if (L.ambient) ambient++;
      if (ambient < 10 * P.wind && S.leaves.length < CAPS.leaves && Math.random() < dt * 1.2 * P.wind) {
        S.leaves.push({ x: -30, y: S.H * (0.1 + Math.random() * 0.8), vx: 130 + Math.random() * 120, vy: -15 + Math.random() * 40,
          rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 5, flip: Math.random() * TAU, vf: 2 + Math.random() * 4,
          size: 12 + Math.random() * 10, spr: Math.floor(Math.random() * LEAF_KINDS.length), ph: Math.random() * TAU, age: 0, life: 16, ambient: true });
      }
      if (t > S.nextGust) {
        S.nextGust = t + 2500 + Math.random() * 3000;
        S.gusts.push({ t0: t, ms: 2600, g: makeGust({ x: -S.W * 0.05, y: S.H * (0.25 + Math.random() * 0.5) },
          { x: S.W * 1.05, y: S.H * (0.15 + Math.random() * 0.6) }, 5, P.wind * 0.75) });
      }
    }
    for (let i = S.gusts.length - 1; i >= 0; i--) if (t - S.gusts[i].t0 >= S.gusts[i].ms) S.gusts.splice(i, 1);
    const ls = S.leaves;
    for (let i = ls.length - 1; i >= 0; i--) {
      const L = ls[i];
      L.age += dt;
      L.x += (L.vx + Math.sin(L.age * 4 + L.ph) * 30) * dt;
      L.y += (L.vy + Math.cos(L.age * 3.1 + L.ph) * 24 + 18) * dt;
      L.rot += L.vr * dt; L.flip += L.vf * dt;
      const gone = L.age > L.life || (L.x > S.W + 80 && L.vx >= 0) || (L.x < -80 && L.vx <= 0) || L.y > S.H + 80 || (L.y < -120 && L.vy <= 0);
      if (gone) { ls[i] = ls[ls.length - 1]; ls.pop(); }
    }
  }
  function drawLeaves(ctx) {
    if (!S.leafSprites) return;
    for (const L of S.leaves) {
      const a = clamp(L.age / 0.25, 0, 1) * (1 - ramp(L.age, L.life - 0.6, L.life));
      if (a < 0.01) continue;
      ctx.save();
      ctx.translate(L.x, L.y); ctx.rotate(L.rot);
      ctx.scale(1, 0.25 + 0.75 * Math.abs(Math.cos(L.flip)));       // tumbling
      ctx.globalAlpha = a;
      ctx.drawImage(S.leafSprites[L.spr], -L.size / 2, -L.size / 2, L.size, L.size);
      ctx.restore();
    }
  }
  function burst(x, y, n) {
    n = Math.min(n, CAPS.sparkles - S.sparks.length);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, sp = 90 + Math.random() * 240;
      S.sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, life: 0.7 + Math.random() * 0.6, age: 0,
        size: 7 + Math.random() * 10, spr: i % GLINT_COLS.length, ph: Math.random() * TAU });
    }
  }
  function updateSparks(dt) {
    const ps = S.sparks, drag = Math.max(0, 1 - 2.4 * dt);
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.age += dt; p.vx *= drag; p.vy = p.vy * drag + 90 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.age >= p.life) { ps[i] = ps[ps.length - 1]; ps.pop(); }
    }
  }
  function drawSparks(ctx) {
    if (!S.sparks.length || !S.glints) return;
    ctx.globalCompositeOperation = 'lighter';
    for (const p of S.sparks) {
      const k = p.age / p.life, s = p.size * (1 - k * 0.4);
      ctx.globalAlpha = clamp(Math.pow(1 - k, 0.7) * (0.75 + 0.25 * Math.sin(p.age * 8 + p.ph)), 0, 1);
      ctx.drawImage(S.glints[p.spr], p.x - s / 2, p.y - s / 2, s, s);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
  /** Lightning: refused unless 1.2 s have passed since the last glow anywhere. */
  function tryGlow(t, withBolt) {
    if (t - S.lastGlow < GLOW_GAP) return false;
    S.lastGlow = t;
    S.glowLog.push(t);
    if (S.glowLog.length > 40) S.glowLog.shift();
    const x = S.W * (0.15 + Math.random() * 0.7), y = S.H * (0.08 + Math.random() * 0.22);
    S.glows.push({ t0: t, x, y, r: Math.min(S.W, S.H) * (0.22 + Math.random() * 0.12), bolt: withBolt ? makeBolt(x, y) : null });
    return true;
  }
  function makeBolt(x, y) {
    const segs = 9, step = S.H * (0.22 + Math.random() * 0.16) / segs, main = [[x, y]];
    let cx = x, cy = y;
    for (let i = 0; i < segs; i++) { cx += (Math.random() - 0.5) * step * 1.3; cy += step * (0.7 + Math.random() * 0.6); main.push([cx, cy]); }
    const k = 3 + Math.floor(Math.random() * 3), side = Math.random() < 0.5 ? -1 : 1, branch = [main[k].slice()];
    let bx = main[k][0], by = main[k][1];
    for (let i = 0; i < 4; i++) { bx += step * (0.4 + Math.random() * 0.6) * side; by += step * (0.5 + Math.random() * 0.5); branch.push([bx, by]); }
    return [main, branch];
  }
  function drawGlows(ctx, t) {
    for (let i = S.glows.length - 1; i >= 0; i--) {
      const gl = S.glows[i], el = t - gl.t0;
      if (el > 900) { S.glows.splice(i, 1); continue; }
      const a = GLOW_PEAK * (el < 220 ? smooth(el / 220) : 1 - smooth((el - 220) / 600));
      if (a > 0.002) {                                               // soft in-cloud glow, never a flash
        const g = ctx.createRadialGradient(gl.x, gl.y, 0, gl.x, gl.y, gl.r);
        g.addColorStop(0, rgba([226, 231, 255], a)); g.addColorStop(0.45, rgba([200, 208, 245], a * 0.45)); g.addColorStop(1, 'rgba(190,200,240,0)');
        ctx.globalCompositeOperation = 'screen';
        ctx.fillStyle = g; ctx.fillRect(gl.x - gl.r, gl.y - gl.r, gl.r * 2, gl.r * 2);
        ctx.globalCompositeOperation = 'source-over';
        S.maxGlow = Math.max(S.maxGlow, a);
      }
      const ba = gl.bolt ? BOLT_PEAK * (el < 80 ? el / 80 : 1 - clamp((el - 80) / 400, 0, 1)) : 0;
      if (ba > 0.003) {                                              // thin faint bolt, fades over ~400 ms
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        [[5, ba * 0.25], [1.4, ba]].forEach(pass => {
          ctx.lineWidth = pass[0]; ctx.strokeStyle = rgba([236, 240, 255], pass[1]);
          ctx.beginPath();
          for (const path of gl.bolt) path.forEach((p, j) => (j ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
          ctx.stroke();
        });
        S.maxBolt = Math.max(S.maxBolt, ba);
      }
    }
  }

  /* ── transient effects ────────────────────────────────────────────────────
     Each factory returns { ms, layer?, mix?, update?, draw?, start?, endMood? }.
       mix(P, k, t, fx)    -> new params layered over the mood (never edits P)
       draw(ctx, fx, k, t, P, amp) on layer 'rainbow' (behind mid clouds) or 'top'
       endMood             -> mood left behind when it finishes naturally
     Calm versions are short crossfades of still imagery with no particles. */
  function fxEnv(fx, t, riseF, fallF, minRamp) {
    const ms = fx.ms, el = clamp(t - fx.t0, 0, ms);
    let rise = Math.max(ms * riseF, minRamp || 0, 1), fall = Math.max(ms * fallF, minRamp || 0, 1);
    if (rise + fall > ms) { const s = ms / (rise + fall); rise *= s; fall *= s; }
    return smooth(el / rise) * (1 - smooth((el - (ms - fall)) / fall));
  }
  const calmEnv = (fx, t) => fxEnv(fx, t, 0.45, 0.45);

  function makeRays(n) {
    const rays = [];
    for (let i = 0; i < n; i++) rays.push({ a: i / n * TAU + (Math.random() - 0.5) * 0.25, w: 0.02 + Math.random() * 0.04, l: 0.55 + Math.random() * 0.45 });
    return rays;
  }
  function fillRays(ctx, rays, R) {
    ctx.beginPath();
    for (const r of rays) {
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(r.a - r.w) * R * r.l, Math.sin(r.a - r.w) * R * r.l);
      ctx.lineTo(Math.cos(r.a + r.w) * R * r.l, Math.sin(r.a + r.w) * R * r.l);
      ctx.closePath();
    }
    ctx.fill();
  }
  function drawSunburst(ctx, fx, k, t, P, amp) {
    const e = (fx.calm ? calmEnv(fx, t) : fxEnv(fx, t, 0.3, 0.45, 600)) * amp;
    if (e < 0.005) return;
    const el = (t - fx.t0) / 1000;
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = clamp(e, 0, 1);
    ctx.fillStyle = fx.bloom;
    ctx.fillRect(fx.x - fx.R * 0.7, fx.y - fx.R * 0.7, fx.R * 1.4, fx.R * 1.4);
    ctx.translate(fx.x, fx.y);
    ctx.rotate(fx.calm ? 0 : el * 0.1);                              // rays turn slowly
    ctx.fillStyle = fx.rayFill;
    ctx.globalAlpha = clamp(e * 0.8, 0, 1);
    fillRays(ctx, fx.rays, fx.R);
    if (!fx.calm) {
      ctx.rotate(-el * 0.26);
      ctx.globalAlpha = clamp(e * 0.45, 0, 1);
      fillRays(ctx, fx.rays2, fx.R * 0.8);
    }
  }
  function drawFogFx(ctx, fx, k, t, P, amp) {
    const r = fx.rect || { x: 0, y: 0, w: S.W, h: S.H }, f = fx.rect ? Math.min(r.w, r.h) * 0.25 + 18 : 0;
    const ow = r.w + 2 * f, oh = r.h + 2 * f, res = fx.rect ? clamp(220 / Math.max(ow, oh), FOG_RES, 0.5) : FOG_RES;
    const bw = Math.max(8, Math.round(ow * res)), bh = Math.max(8, Math.round(oh * res));
    if (!fx.buf || fx.buf.w !== bw || fx.buf.h !== bh) { fx.buf = newBuf(bw, bh); fx.mask = fx.rect ? featherMask(bw, bh, f * res) : null; }
    let dens, front = 1.3;
    if (fx.calm) dens = calmEnv(fx, t);
    else {                                                           // rolls in, thickens, thins
      dens = (0.7 * ramp(k, 0, 0.3) + 0.3 * ramp(k, 0.3, 0.55)) * (1 - ramp(k, 0.62, 1));
      front = ramp(k, 0, 0.42) * 1.3;
    }
    dens *= amp;
    if (dens < 0.005) return;
    const g = fx.buf.g;
    paintFog(g, bw, bh, fx.calm ? 0 : (t - fx.t0) / 1000, fx.seed);
    g.globalCompositeOperation = 'destination-in';
    if (fx.mask) g.drawImage(fx.mask, 0, 0);
    if (front < 1.25) { g.fillStyle = edgeGrad(g, bw, front - 0.15, 0.15); g.fillRect(0, 0, bw, bh); }
    g.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = clamp(dens, 0, 1);
    ctx.drawImage(fx.buf.c, r.x - f, r.y - f, ow, oh);
  }
  function drawPuff(ctx, fx, k, t, P, amp) {
    const sp = S.clouds && S.clouds[PUFF];
    if (!sp) return;
    let s = 1, a, spread = 0.5;
    if (fx.calm) a = calmEnv(fx, t);
    else {                                                           // billows up, then dissolves outward
      s = (0.3 + 0.7 * easeOut(k / 0.4)) * (1 + 0.18 * ramp(k, 0.4, 1));
      a = ramp(k, 0, 0.15) * (1 - ramp(k, 0.55, 1));
      spread = 0.15 + 0.45 * easeOut(k / 0.5) + 0.35 * ramp(k, 0.55, 1);
    }
    a *= amp;
    if (a < 0.005) return;
    const w = fx.size * s, h = w * sp.h / sp.w, rise = fx.calm ? 0 : fx.size * 0.1 * k;
    for (const sub of fx.subs) {
      const sw = w * sub.s, sh = sw * sp.h / sp.w, d = fx.size * spread * sub.d * 0.5;
      drawTinted(ctx, sp, fx.x + Math.cos(sub.a) * d - sw / 2, fx.y - rise + Math.sin(sub.a) * d * 0.5 - sh / 2, sw, sh, a * 0.85, P);
    }
    drawTinted(ctx, sp, fx.x - w / 2, fx.y - rise - h / 2, w, h, a, P);
  }
  function drawSparkleFx(ctx, fx, k, t, P, amp) {
    if (!S.glints) return;
    ctx.globalCompositeOperation = 'lighter';
    if (fx.calm) {                                                   // one still glint that fades in and out
      const e = calmEnv(fx, t) * amp;
      if (e < 0.005) return;
      ctx.globalAlpha = clamp(e, 0, 1);
      ctx.drawImage(S.glints[1], fx.x - 36, fx.y - 36, 72, 72);
      ctx.globalAlpha = clamp(e * 0.7, 0, 1);
      for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + 0.4; ctx.drawImage(S.glints[(i + 2) % 5], fx.x + Math.cos(a) * 46 - 10, fx.y + Math.sin(a) * 46 - 10, 20, 20); }
      return;
    }
    const b = ramp(k, 0, 0.04) * (1 - ramp(k, 0.05, 0.35)) * amp;
    if (b < 0.005) return;
    ctx.globalAlpha = clamp(b * 0.5, 0, 1);
    ctx.drawImage(S.glints[0], fx.x - 50, fx.y - 50, 100, 100);
  }
  function drawShootingStar(ctx, fx, k, t, P, amp) {
    const q = (k - 0.66) / 0.08;
    if (fx.calm || q <= 0 || q >= 1) return;
    const x0 = S.W * 0.66, y0 = S.H * 0.07, x1 = S.W * 0.44, y1 = S.H * 0.19, tq = Math.max(0, q - 0.3);
    const hx = lerp(x0, x1, q), hy = lerp(y0, y1, q), tx = lerp(x0, x1, tq), ty = lerp(y0, y1, tq);
    if (Math.abs(hx - tx) + Math.abs(hy - ty) < 2) return;
    const gr = ctx.createLinearGradient(tx, ty, hx, hy);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, rgba([255, 255, 255], 0.55 * Math.sin(Math.PI * q) * amp));
    ctx.strokeStyle = gr; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(hx, hy); ctx.stroke();
  }
  function geomFrac(o, geom) {
    if (!isNum(o.cx) && !isNum(o.cy) && !isNum(o.radius)) return null;
    return { fx: geom.cx / S.W, fy: geom.cy / S.H, fr: geom.R / Math.max(1, Math.min(S.W, S.H * 1.6)) };
  }

  const EFFECTS = {
    rain(o, calm) {
      const heavy = !!o.heavy;
      return {
        ms: calm ? CALM_MS : num(o.ms, 3500, 1200, 60000),
        mix(P, k, t, fx) {
          if (fx.calm) { const e = calmEnv(fx, t), Q = copyP(P); Q.rain = Math.max(Q.rain, e * 0.55); Q.dim = Math.max(Q.dim, e * 0.05); return Q; }
          const e = fxEnv(fx, t, 0.18, 0.28, 900), Q = mix(P, MOODS.rain, e * (heavy ? 0.6 : 0.45));
          Q.rain = Math.max(Q.rain, e * (heavy ? 1 : 0.6));
          if (heavy) Q.heavy = Math.max(Q.heavy, e);
          return Q;
        }
      };
    },
    sunburst(o, calm) {
      const P = S.P || MOODS[S.mood], ctx = S.ctx, R = 0.55 * Math.min(S.W, S.H);
      const x = num(o.x, P.sun > 0.2 ? P.sunX * S.W : S.W * 0.5), y = num(o.y, P.sun > 0.2 ? P.sunY * S.H : S.H * 0.25);
      const bloom = ctx.createRadialGradient(x, y, 0, x, y, R * 0.7);
      bloom.addColorStop(0, 'rgba(255,250,228,0.7)'); bloom.addColorStop(0.25, 'rgba(255,226,160,0.35)');
      bloom.addColorStop(0.7, 'rgba(255,200,120,0.08)'); bloom.addColorStop(1, 'rgba(255,200,120,0)');
      const rayFill = ctx.createRadialGradient(0, 0, R * 0.08, 0, 0, R);
      rayFill.addColorStop(0, 'rgba(255,240,190,0.4)'); rayFill.addColorStop(0.5, 'rgba(255,220,150,0.14)'); rayFill.addColorStop(1, 'rgba(255,220,150,0)');
      return { ms: calm ? CALM_MS : num(o.ms, 2500, 900, 30000), layer: 'top', x, y, R, bloom, rayFill,
        rays: makeRays(calm ? 12 : 16), rays2: makeRays(11), draw: drawSunburst };
    },
    storm(o, calm) {
      if (calm) {                                                    // darker tint only, no lightning
        return { ms: CALM_MS, mix(P, k, t, fx) { const e = calmEnv(fx, t), Q = copyP(P); Q.dim = Math.max(Q.dim, e * 0.2); Q.cloudDark = lerp(Q.cloudDark, 1, e * 0.5); return Q; } };
      }
      const ms = num(o.ms, 4500, 2600, 60000), rise = Math.min(ms / 2, Math.max(ms * 0.25, 1300)), glowTimes = [];
      for (let i = 0; i < 3; i++) { const at = rise * 0.85 + i * 1300 + Math.random() * 250; if (at < ms - 650) glowTimes.push(at); }
      return {
        ms, glowTimes, nextGlow: 0,
        mix: (P, k, t, fx) => mix(P, MOODS.storm, fxEnv(fx, t, 0.25, 0.25, 1300)),   // clouds darken and roll in
        update(fx, t) {
          const el = t - fx.t0;
          while (fx.nextGlow < fx.glowTimes.length && el >= fx.glowTimes[fx.nextGlow]) {
            if (el > fx.ms - 650) { fx.nextGlow = fx.glowTimes.length; break; }
            if (!tryGlow(t, Math.random() < 0.6)) break;            // too soon after another glow: wait
            fx.nextGlow++;
          }
        }
      };
    },
    fog(o, calm) {
      const rc = o.rect, ok = rc && isNum(rc.left) && isNum(rc.top) && isNum(rc.width) && isNum(rc.height) && rc.width > 4 && rc.height > 4;
      return { ms: calm ? 900 : num(o.ms, 4000, 1500, 60000), layer: 'top', seed: Math.random() * 500, draw: drawFogFx,
        rect: ok ? { x: rc.left, y: rc.top, w: rc.width, h: rc.height } : null, cleanup(fx) { fx.buf = fx.mask = null; } };
    },
    wind(o, calm) {
      const from = pt(o.from, { x: -S.W * 0.05, y: S.H * 0.62 }), to = pt(o.to, { x: S.W * 1.05, y: S.H * 0.38 });
      const fx = { ms: calm ? CALM_MS : num(o.ms, 3000, 1200, 30000), layer: 'top', gust: makeGust(from, to, calm ? 5 : 9, 1), spawned: 0 };
      fx.draw = (ctx, f, k, t, P, amp) => drawGust(ctx, f.gust, k, amp * (f.calm ? calmEnv(f, t) * 0.7 : 1), f.calm);
      if (calm) return fx;
      fx.mix = (P, k, t, f) => { const Q = copyP(P); Q.drift += 2.5 * fxEnv(f, t, 0.3, 0.4); return Q; };
      fx.update = (f, t) => {                                        // tumbling leaves ride the gust
        const want = Math.round(26 * ramp((t - f.t0) / f.ms, 0, 0.45));
        while (f.spawned < want) { f.spawned++; if (S.leaves.length < CAPS.leaves) spawnLeaf(f.gust, f.ms); }
      };
      return fx;
    },
    cloudPuff(o, calm) {
      const fx = { ms: calm ? CALM_MS : num(o.ms, 2500, 1000, 30000), layer: 'top', draw: drawPuff, subs: [],
        x: num(o.x, S.W / 2), y: num(o.y, S.H * 0.4), size: num(o.size, clamp(Math.min(S.W, S.H) * 0.32, 140, 420), 40, 3000) };
      for (let i = 0; i < 5; i++) fx.subs.push({ a: i / 5 * TAU + Math.random() * 0.8, d: 0.6 + Math.random() * 0.4, s: 0.4 + Math.random() * 0.2 });
      return fx;
    },
    doubleRainbow(o, calm) {
      return { ms: calm ? 900 : num(o.ms, 4000, 1500, 60000), layer: 'rainbow', geom: rbFrom(o),
        draw(ctx, fx, k, t, P, amp) { drawRainbowSprite(ctx, fx.geom, true, (fx.calm ? calmEnv(fx, t) : fxEnv(fx, t, 0.3, 0.3, 600)) * amp * 0.5); } };
    },
    rainbow(o, calm) {
      const geom = rbFrom(o), linger = o.linger !== false;
      const fx = { ms: calm ? 900 : num(o.ms, 5000, 2400, 60000), layer: 'rainbow', geom };
      if (linger) S.rbGeom = geomFrac(o, geom);                     // the lingering glow sits on this arc
      if (calm) {                                                    // fades in complete, hands over to the mood
        if (linger) { setMood('rainbow', { ms: 900 }); fx.ms = Math.max(fx.ms, S.fadeMs); }
        fx.draw = (ctx, f, k, t, P, amp) => drawRainbowSprite(ctx, f.geom, false, 0.5 * ramp(k, 0, 0.4) * (1 - ramp(k, 0.6, 1)) * amp);
        return fx;
      }
      if (linger) { fx.endMood = 'rainbow'; fx.mix = (P, k) => mix(P, MOODS.rainbow, ramp(k, 0.45, 1)); }
      fx.draw = (ctx, f, k, t, P, amp) => drawRainbowGrowing(ctx, f.geom, clamp(k / 0.45, 0, 1), 0.5 * (1 - ramp(k, 0.62, 1)) * amp);
      return fx;
    },
    sunshower(o, calm) {
      const fx = { ms: calm ? CALM_MS : num(o.ms, 4500, 3000, 60000), layer: 'rainbow', geom: rbFrom(o) };
      if (calm) {
        fx.mix = (P, k, t, f) => { const Q = copyP(P); Q.sunBoost += calmEnv(f, t) * 0.5; return Q; };
        fx.draw = (ctx, f, k, t, P, amp) => drawRainbowSprite(ctx, f.geom, false, calmEnv(f, t) * 0.42 * amp);
        return fx;
      }
      fx.mix = (P, k, t, f) => { const e = fxEnv(f, t, 0.25, 0.3, 1400), Q = mix(P, MOODS.sunshower, e); Q.sunBoost += e * 0.5; return Q; };
      fx.draw = (ctx, f, k, t, P, amp) => {                         // sun brightens, rain falls, a rainbow forms
        const p = clamp((k - 0.28) / 0.34, 0, 1);
        if (p > 0) drawRainbowGrowing(ctx, f.geom, p, 0.45 * (1 - ramp(k, 0.8, 1)) * amp);
      };
      return fx;
    },
    dayNight(o, calm) {
      if (calm) return { ms: 900, mix: (P, k, t, fx) => mix(P, MOODS.dusk, calmEnv(fx, t) * 0.45) };
      const frames = [[0, null], [0.2, MOODS.dusk], [0.38, MOODS.night], [0.58, MOODS.night], [0.82, MOODS.dawn], [1, null]];
      return { ms: num(o.ms, 5000, 4500, 60000), mix: (P, k) => keyframes(P, frames, k) };
    },
    nightNight(o, calm) {
      if (calm) { setMood('night', { ms: 900 }); return { ms: Math.max(900, S.fadeMs) }; }
      const dark = lumP(baseAt(now())) < 0.06;
      const frames = dark ? [[0, null], [1, MOODS.night]] : [[0, null], [0.4, MOODS.dusk], [0.75, MOODS.night], [1, MOODS.night]];
      return { ms: num(o.ms, 6000, 3000, 60000), layer: 'top', endMood: 'night', draw: drawShootingStar,
        mix(P, k) { const Q = keyframes(P, frames, k); Q.moonGlow += 0.9 * ramp(k, 0.55, 0.8) * (1 - ramp(k, 0.85, 1)); return Q; } };
    },
    sparkles(o, calm) {
      const fx = { ms: calm ? 700 : num(o.ms, 1400, 500, 1500), layer: 'top', x: num(o.x, S.W / 2), y: num(o.y, S.H / 2), draw: drawSparkleFx };
      if (!calm) fx.start = (f, t) => { burst(f.x, f.y, 60); S.busyUntil = Math.max(S.busyUntil, t + 1500); };
      return fx;
    }
  };
  /** What an effect leaves behind when motion is 'off' (it resolves at once). */
  const OFF_END = {
    nightNight() { setMood('night'); },
    rainbow(o) { if (o.linger !== false) { S.rbGeom = geomFrac(o, rbFrom(o)); setMood('rainbow'); } }
  };

  /* ── mood crossfade and the composed parameters ────────────────────────── */
  function baseAt(t) {
    const to = MOODS[S.mood];
    if (!S.fadeMs) return to;
    const k = (t - S.fadeT0) / S.fadeMs;
    if (k >= 1) { S.fadeMs = 0; S.from = to; return to; }
    return mix(S.from, to, smooth(k));
  }
  /** Crossfade from whatever is showing (`from`) to the current mood, brightness-guarded. */
  function startFade(from, ms, t) {
    S.from = from; S.fadeT0 = t;
    S.fadeMs = S.motion === 'off' ? 0 : guardMs(from, MOODS[S.mood], ms);
    if (!S.fadeMs) S.from = MOODS[S.mood];
  }
  function computeF(t) {
    let P = baseAt(t);
    for (const fx of S.fx) if (!fx.done && fx.mix) P = fx.mix(P, clamp((t - fx.t0) / fx.ms, 0, 1), t, fx);
    return P;
  }

  /* ── frame ─────────────────────────────────────────────────────────────── */
  function update(P, t, dt) {
    const calmF = S.motion === 'full' ? 1 : 0.25;                    // calm: clouds drift very slowly
    if (S.layers) {
      for (const layer of S.layers) {
        const v = layer.L.speed * S.speedUnit * P.drift * calmF * dt / (S.W + 2 * layer.margin);
        for (const c of layer.items) { c.fx += v; if (c.fx >= 1) c.fx -= 1; }
      }
    }
    if (S.motion !== 'full') return;
    updateRain(P, dt);
    updateWind(P, t, dt);
    updateSparks(dt);
    for (const fx of S.fx) if (!fx.done && fx.update) fx.update(fx, t, dt, P);
  }
  function drawFxLayer(ctx, P, t, layer) {
    for (const fx of S.fx) {
      if (!fx.draw || (fx.layer || 'top') !== layer || (fx.done && fx.dying == null)) continue;
      const amp = fx.dying == null ? 1 : 1 - clamp((t - fx.dying) / DYING_MS, 0, 1);
      if (amp <= 0) continue;
      ctx.save();
      fx.draw(ctx, fx, fx.dying == null ? clamp((t - fx.t0) / fx.ms, 0, 1) : fx.kDied, t, P, amp);
      ctx.restore();
    }
  }
  function draw(ctx, P, t) {
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    drawSky(ctx, P);
    drawStars(ctx, P, t);
    drawMoon(ctx, P);
    drawSun(ctx, P);
    drawDeck(ctx, P, t);
    drawCloudLayer(ctx, P, 0);
    if (P.rainbow > 0.005) drawRainbowSprite(ctx, moodRbGeom(), false, P.rainbow);
    drawFxLayer(ctx, P, t, 'rainbow');
    drawCloudLayer(ctx, P, 1);
    drawCloudLayer(ctx, P, 2);
    drawGlows(ctx, t);
    if (P.dim > 0.003) { ctx.globalAlpha = clamp(P.dim, 0, 1); ctx.fillStyle = '#06080f'; ctx.fillRect(0, 0, S.W, S.H); ctx.globalAlpha = 1; }
    drawMoodFog(ctx, P, t);
    drawRain(ctx, P);
    for (const gu of S.gusts) drawGust(ctx, gu.g, (t - gu.t0) / gu.ms, 1, false);
    drawLeaves(ctx);
    drawFxLayer(ctx, P, t, 'top');
    drawSparks(ctx);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
  function frame(t) {
    const dt = S.lastDraw ? clamp((t - S.lastDraw) / 1000, 0, 0.1) : 1 / 30;
    S.lastDraw = t;
    const P = computeF(t);
    S.P = P;
    S.lum = lumP(P);
    update(P, t, dt);
    draw(S.ctx, P, t);
    for (const fx of S.fx.slice()) {
      if (fx.dying != null) { if (t - fx.dying >= DYING_MS) dropFx(fx); }
      else if (!fx.done && t - fx.t0 >= fx.ms) finishFx(fx, false);
    }
    S.frames++;
  }
  function renderStatic() {
    if (!S.ctx) return;
    const t = now();
    S.from = MOODS[S.mood]; S.fadeMs = 0;
    S.P = computeF(t);
    S.lum = lumP(S.P);
    try { draw(S.ctx, S.P, t); } catch (e) { S.errors++; if (S.errors <= 3 && window.console) window.console.error('[CRSky] render failed', e); }
    S.staticRenders++;
  }

  /* ── loop: 30 fps ambient, 60 fps while something moves; none while hidden ─ */
  function ensureLoop() {
    if (!S.ctx || S.raf || S.motion === 'off' || S.hidden) return;
    S.raf = window.requestAnimationFrame(tick);
  }
  function stopLoop() {
    if (S.raf) window.cancelAnimationFrame(S.raf);
    S.raf = 0;
    S.fpsMode = 0;
  }
  function tick() {
    S.raf = 0;
    if (!S.ctx || S.motion === 'off' || S.hidden) { S.fpsMode = 0; return; }
    const t = now(), fast = S.motion === 'full' && (S.fx.length > 0 || t < S.busyUntil);
    S.fpsMode = fast ? 60 : 30;
    if (!S.lastDraw || t - S.lastDraw >= (fast ? FAST_FRAME : AMBIENT_FRAME) - 4) {
      try { frame(t); } catch (e) { S.errors++; if (S.errors <= 3 && window.console) window.console.error('[CRSky] frame failed', e); }
    }
    if (!S.raf) S.raf = window.requestAnimationFrame(tick);         // frame() may already have asked
  }
  function onVisibility() {
    S.hidden = !!document.hidden;
    if (S.hidden) { stopLoop(); return; }
    S.lastDraw = 0;
    if (S.motion === 'off') renderStatic(); else ensureLoop();
  }
  function onResize() { resize(); }

  /* ── effect bookkeeping ────────────────────────────────────────────────── */
  function dropFx(fx) {
    const i = S.fx.indexOf(fx);
    if (i >= 0) S.fx.splice(i, 1);
    if (fx.cleanup) fx.cleanup(fx);
  }
  function finishFx(fx, cancelled) {
    if (fx.done) return;
    const t = now();
    fx.done = true;
    if (fx.timer) { window.clearTimeout(fx.timer); fx.timer = 0; }
    if (!cancelled && fx.endMood && MOODS[fx.endMood]) {
      if (S.serial === fx.serial) { S.mood = fx.endMood; S.from = MOODS[fx.endMood]; S.fadeMs = 0; S.serial++; }
      else startFade(S.P || baseAt(t), 600, t);                      // the game changed mood meanwhile
    }
    if (cancelled && fx.draw && S.ctx && S.motion !== 'off') { fx.dying = t; fx.kDied = clamp((t - fx.t0) / fx.ms, 0, 1); }
    else dropFx(fx);
    try { fx.resolve({ effect: fx.name, cancelled: !!cancelled }); } catch (e) { /* a resolve never throws */ }
  }

  /* ── public API ────────────────────────────────────────────────────────── */
  function init(canvas) {
    if (S.canvas) destroy();
    const ctx = canvas && canvas.getContext && canvas.getContext('2d', { alpha: false });
    if (!ctx) return false;
    S.canvas = canvas; S.ctx = ctx;
    S.canFilter = detectFilter(makeCanvas(2, 2).getContext('2d'));
    S.noise = makeNoise(7);
    S.rainTex = makeRainTex();
    S.rainPat = ctx.createPattern(S.rainTex, 'repeat');
    S.glints = GLINT_COLS.map(makeGlint);
    S.leafSprites = LEAF_KINDS.map(k => makeLeaf(k[0], k[1]));
    S.builtFor = null; S.layers = null; S.lastDraw = 0;
    S.from = MOODS[S.mood]; S.fadeMs = 0;
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVisibility);
    S.hidden = !!document.hidden;
    resize();
    if (S.motion === 'off') renderStatic(); else ensureLoop();
    return true;
  }
  function resize() {
    if (!S.canvas) return;
    const w = Math.max(1, Math.round(window.innerWidth || S.canvas.clientWidth || 1));
    const h = Math.max(1, Math.round(window.innerHeight || S.canvas.clientHeight || 1));
    let dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
    if (w * h * dpr * dpr > MAX_PIXELS) dpr = 1;
    S.W = w; S.H = h; S.dpr = dpr;
    S.canvas.width = Math.round(w * dpr);
    S.canvas.height = Math.round(h * dpr);
    if (S.canvas.style) { S.canvas.style.width = w + 'px'; S.canvas.style.height = h + 'px'; }
    S.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    S.skyKey = '';
    S.rbCache.clear();
    S.bufs = {};
    buildSprites();
    if (S.motion === 'off') renderStatic();
  }
  function setMotion(level) {
    if (level !== 'full' && level !== 'calm' && level !== 'off') return false;
    if (level === S.motion) return true;
    const t = now(), F = S.ctx ? computeF(t) : null;
    S.motion = level;
    for (const fx of S.fx.slice()) { if (fx.done) dropFx(fx); else finishFx(fx, false); }   // land where they were heading
    if (level !== 'full') { S.drops.length = 0; S.splashes.length = 0; S.leaves.length = 0; S.sparks.length = 0; S.glows.length = 0; S.gusts.length = 0; }
    if (!S.ctx) return true;
    if (level === 'off') { stopLoop(); renderStatic(); return true; }
    if (F) startFade(F, level === 'calm' ? 600 : 1000, t);
    S.lastDraw = 0;
    ensureLoop();
    return true;
  }
  function setMood(mood, opts) {
    if (!Object.prototype.hasOwnProperty.call(MOODS, mood)) return false;
    opts = opts || {};
    const t = now(), from = S.ctx ? baseAt(t) : MOODS[mood];
    S.mood = mood;
    S.serial++;
    if (!S.ctx || S.motion === 'off') { S.from = MOODS[mood]; S.fadeMs = 0; renderStatic(); return true; }
    startFade(from, num(opts.ms, S.motion === 'calm' ? 600 : 1500, 0, 60000), t);
    ensureLoop();
    return true;
  }
  function getMood() { return S.mood; }
  function play(name, opts) {
    opts = opts && typeof opts === 'object' ? opts : {};
    const make = typeof name === 'string' && Object.prototype.hasOwnProperty.call(EFFECTS, name) ? EFFECTS[name] : null;
    if (!make || !S.ctx) return Promise.resolve({ effect: String(name), cancelled: false, skipped: true });
    if (S.motion === 'off') {                                        // instant, maybe leaving a still end state
      try { if (OFF_END[name]) OFF_END[name](opts); } catch (e) { S.errors++; }
      return Promise.resolve({ effect: name, cancelled: false });
    }
    const t = now();
    let fx;
    try { fx = make(opts, S.motion === 'calm'); } catch (e) {
      S.errors++;
      if (window.console) window.console.error('[CRSky] effect failed', name, e);
      return Promise.resolve({ effect: name, cancelled: true });
    }
    Object.assign(fx, { name, t0: t, calm: S.motion === 'calm', serial: S.serial, done: false, dying: null });
    return new Promise(resolve => {
      fx.resolve = resolve;
      S.fx.push(fx);
      if (fx.start) fx.start(fx, t);
      // backstop: resolves even if frames stop (hidden tab, throttled iframe)
      fx.timer = window.setTimeout(() => { fx.timer = 0; finishFx(fx, false); }, fx.ms + 400);
      ensureLoop();
    });
  }
  function stop() {
    const pending = S.fx.filter(f => !f.done);
    if (!pending.length) return;
    const t = now(), F = S.ctx ? computeF(t) : null;
    for (const fx of pending) finishFx(fx, true);
    if (F && S.motion !== 'off') { startFade(F, 600, t); ensureLoop(); }   // ease back to the mood
  }
  function destroy() {
    for (const fx of S.fx.slice()) {
      if (!fx.done) { fx.done = true; if (fx.timer) window.clearTimeout(fx.timer); try { fx.resolve({ effect: fx.name, cancelled: true }); } catch (e) { /* ignore */ } }
    }
    S.fx = [];
    stopLoop();
    window.removeEventListener('resize', onResize);
    document.removeEventListener('visibilitychange', onVisibility);
    S.canvas = S.ctx = null;
    S.drops = []; S.splashes = []; S.leaves = []; S.sparks = []; S.glows = []; S.gusts = []; S.stars = [];
    S.layers = S.clouds = S.sun = S.moon = S.glints = S.leafSprites = S.noise = S.rainTex = S.rainPat = null;
    S.bufs = {}; S.rbCache.clear(); S.builtFor = null; S.skyGrad = null; S.skyKey = ''; S.P = null; S.lastDraw = 0;
  }
  function debug() {
    let px = 0;
    const add = c => { if (c) px += c.width * c.height; };
    if (S.clouds) S.clouds.forEach(c => { add(c.lit); add(c.warm); add(c.dark); });
    if (S.sun) { add(S.sun.day.c); add(S.sun.warm.c); }
    if (S.moon) { add(S.moon.c); add(S.moon.halo); }
    [S.noise, S.rainTex].concat(S.glints || [], S.leafSprites || []).forEach(add);
    Object.keys(S.bufs).forEach(k => add(S.bufs[k].c));
    S.rbCache.forEach(sp => add(sp.c));
    S.fx.forEach(fx => { if (fx.buf) add(fx.buf.c); add(fx.mask); });
    return {
      motion: S.motion, mood: S.mood, running: !!S.raf, hidden: S.hidden, fps: S.raf ? S.fpsMode : 0,
      frames: S.frames, staticRenders: S.staticRenders, errors: S.errors,
      effects: S.fx.filter(f => !f.done).map(f => f.name), dying: S.fx.filter(f => f.done).length,
      counts: { rain: S.drops.length, splashes: S.splashes.length, leaves: S.leaves.length, sparkles: S.sparks.length,
        stars: S.stars.length, glows: S.glows.length, gusts: S.gusts.length },
      caps: Object.assign({}, CAPS),
      lightning: { times: S.glowLog.slice(), minGap: GLOW_GAP, maxGlowAlpha: S.maxGlow, maxBoltAlpha: S.maxBolt },
      lum: S.lum, fadeMs: S.fadeMs, dpr: S.dpr, width: S.W, height: S.H,
      canvas: S.canvas ? [S.canvas.width, S.canvas.height] : null, filterBlur: S.canFilter, offscreenPixels: px
    };
  }

  window.CRSky = {
    init, setMotion, setMood, getMood, play, stop, resize, destroy,
    moods: Object.keys(MOODS), effects: Object.keys(EFFECTS), __debug: debug
  };
})();
