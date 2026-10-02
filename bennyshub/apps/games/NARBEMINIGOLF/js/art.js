/**
 * NARBE Mini Golf — art.
 *
 * Every texture is painted on a canvas and every model is built from
 * primitives at load time, so there are no asset files to ship or to fail to
 * load. Static scenery is merged per material (draw calls are what hurt on a
 * Surface Pro), and vertex colours carry the variation that would otherwise
 * need extra materials.
 */
(function () {
  'use strict';

  const U = MG.util;

  /* ── Themes ───────────────────────────────────────────────────────────── */

  const THEMES = {
    sunny: {
      label: 'Sunny Park',
      skyTop: '#2f8fe0', skyMid: '#8fcdf7', skyHorizon: '#e3f4ff', skyGround: '#cfe7c0',
      sunColor: '#fff2d8', sunIntensity: 3.1, sunDir: [-0.42, 0.82, 0.38],
      hemiSky: '#d6ecff', hemiGround: '#6a9a50', hemiIntensity: 1.25,
      fog: '#d5ecfb', fogNear: 110, fogFar: 330, exposure: 1.0,
      carpet: '#27a24a', carpetStripe: '#2bb052', grass: '#69bd4c', grass2: '#58a840', soil: '#7a5a3a',
      rail: '#f4f1e8', railTop: '#ffffff', railStyle: 'stone',
      wall: 'brick', water: '#2b8fd8', waterDeep: '#0d4f8a', sand: '#efdca3', ice: '#b9e6ff',
      foliage: ['#3c9a39', '#4fb046', '#2f8a33', '#5bbd4a'], trunk: '#7b5331',
      flowers: ['#ff5d86', '#ffd440', '#ffffff', '#b38cff', '#ff8a3d'],
      trees: 'round', props: 'park', clouds: true
    },
    sunset: {
      label: 'Sunset Lagoon',
      skyTop: '#4b3a8f', skyMid: '#ef7f63', skyHorizon: '#ffd59a', skyGround: '#e9b98a',
      sunColor: '#ffc68a', sunIntensity: 2.7, sunDir: [0.75, 0.32, -0.45],
      hemiSky: '#ffc9a8', hemiGround: '#6b5a3c', hemiIntensity: 1.05,
      fog: '#f4b98f', fogNear: 100, fogFar: 300, exposure: 1.02,
      carpet: '#1f9a5c', carpetStripe: '#22a764', grass: '#c9b27a', grass2: '#b89f68', soil: '#8d6a43',
      rail: '#e7c99a', railTop: '#f5dfb6', railStyle: 'sandstone',
      wall: 'stone', water: '#1fa4b8', waterDeep: '#0a5f74', sand: '#f3dca6', ice: '#c4ecff',
      foliage: ['#3f8f3a', '#5aa443', '#2f7a33', '#7cb34a'], trunk: '#8a6038',
      flowers: ['#ff5d86', '#ffd440', '#ff8a3d', '#ffffff'],
      trees: 'palm', props: 'beach', clouds: true
    },
    night: {
      label: 'Glow Golf Night',
      skyTop: '#060a1f', skyMid: '#111a44', skyHorizon: '#2a2f6e', skyGround: '#0c0f24',
      sunColor: '#a9b8ff', sunIntensity: 0.9, sunDir: [-0.3, 0.85, -0.42],
      hemiSky: '#4050a8', hemiGround: '#141832', hemiIntensity: 0.75,
      fog: '#10153a', fogNear: 90, fogFar: 260, exposure: 1.15,
      carpet: '#1d3fa8', carpetStripe: '#2148b8', grass: '#1b2d4a', grass2: '#16263f', soil: '#20243e',
      rail: '#1b1f3a', railTop: '#2a2f55', railStyle: 'neon', neon: ['#3df5ff', '#ff3df0', '#fff23d', '#5dff6a'],
      wall: 'neon', water: '#2a5cff', waterDeep: '#0a1760', sand: '#c9a8ff', ice: '#b8fbff',
      foliage: ['#1e5a5a', '#246b62', '#1a4f55', '#2a7a6a'], trunk: '#2d2a3f',
      flowers: ['#3df5ff', '#ff3df0', '#fff23d', '#5dff6a'],
      trees: 'round', props: 'night', stars: true, glow: true
    },
    autumn: {
      label: 'Autumn Grove',
      skyTop: '#4f86c9', skyMid: '#a9c8e6', skyHorizon: '#f4e2c4', skyGround: '#d8c09a',
      sunColor: '#ffe0b0', sunIntensity: 2.8, sunDir: [0.5, 0.6, 0.55],
      hemiSky: '#ffe3c4', hemiGround: '#7a5a34', hemiIntensity: 1.1,
      fog: '#efdcc0', fogNear: 100, fogFar: 300, exposure: 1.0,
      carpet: '#2e8f46', carpetStripe: '#329b4c', grass: '#9a9a4a', grass2: '#86883f', soil: '#6d4a2c',
      rail: '#8a5a34', railTop: '#a8754a', railStyle: 'wood',
      wall: 'stone', water: '#3a86b8', waterDeep: '#174d73', sand: '#e6cf98', ice: '#c0e8ff',
      foliage: ['#d9531e', '#e8892a', '#c23b22', '#f2b233', '#9c3a1c'], trunk: '#5e3d24',
      flowers: ['#ffd440', '#ff8a3d', '#c23b22', '#ffffff'],
      trees: 'round', props: 'autumn', leaves: true, clouds: true
    }
  };

  function theme(name) { return THEMES[name] || THEMES.sunny; }

  /* ── Canvas helpers ───────────────────────────────────────────────────── */

  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  function tex(c, opts) {
    opts = opts || {};
    const t = new THREE.CanvasTexture(c);
    if (opts.srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
    if (opts.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(opts.repeat[0], opts.repeat[1]); }
    t.anisotropy = opts.anisotropy || 4;
    t.needsUpdate = true;
    return t;
  }

  function rgb(hex) {
    const c = new THREE.Color(hex);
    return [Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255)];
  }

  function shade(hex, amt) {
    const c = new THREE.Color(hex);
    const hsl = {}; c.getHSL(hsl);
    c.setHSL(hsl.h, hsl.s, U.clamp(hsl.l + amt, 0, 1));
    return '#' + c.getHexString();
  }

  /** Height map (0..1 per pixel) → tangent-space normal map canvas. */
  function heightToNormal(hgt, w, h, strength) {
    const c = canvas(w, h), g = c.getContext('2d');
    const img = g.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const l = hgt[y * w + ((x - 1 + w) % w)], r = hgt[y * w + ((x + 1) % w)];
      const u = hgt[((y - 1 + h) % h) * w + x], d = hgt[((y + 1) % h) * w + x];
      let nx = (l - r) * strength, ny = (u - d) * strength, nz = 1;
      const len = Math.hypot(nx, ny, nz); nx /= len; ny /= len; nz /= len;
      const i = (y * w + x) * 4;
      img.data[i] = (nx * 0.5 + 0.5) * 255; img.data[i + 1] = (ny * 0.5 + 0.5) * 255;
      img.data[i + 2] = (nz * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  const cache = {};
  function once(key, fn) { return cache[key] || (cache[key] = fn()); }

  /* ── Tiling textures ──────────────────────────────────────────────────── */

  /** Carpet fibre detail, multiplied over the painted carpet for close-ups. */
  function carpetDetail() {
    return once('carpetDetail', () => {
      const n = 256, c = canvas(n, n), g = c.getContext('2d');
      const rnd = U.mulberry32(11);
      g.fillStyle = '#808080'; g.fillRect(0, 0, n, n);
      for (let i = 0; i < 9000; i++) {
        const v = 100 + rnd() * 70 | 0;
        g.fillStyle = `rgb(${v},${v},${v})`;
        const x = rnd() * n, y = rnd() * n;
        g.fillRect(x, y, 1 + rnd() * 1.5, 1 + rnd() * 1.5);
      }
      const t = tex(c, { repeat: [1, 1], srgb: false });
      return t;
    });
  }

  function grassTexture(th) {
    return once('grass:' + th.grass, () => {
      const n = 512, c = canvas(n, n), g = c.getContext('2d');
      const rnd = U.mulberry32(21);
      g.fillStyle = th.grass; g.fillRect(0, 0, n, n);
      for (let i = 0; i < 260; i++) {
        g.fillStyle = rnd() < 0.5 ? th.grass2 : shade(th.grass, 0.05);
        g.globalAlpha = 0.25 + rnd() * 0.3;
        g.beginPath(); g.arc(rnd() * n, rnd() * n, 6 + rnd() * 30, 0, Math.PI * 2); g.fill();
      }
      g.globalAlpha = 1;
      for (let i = 0; i < 14000; i++) {
        g.fillStyle = rnd() < 0.5 ? shade(th.grass, -0.08) : shade(th.grass, 0.08);
        const x = rnd() * n, y = rnd() * n;
        g.fillRect(x, y, 1, 2 + rnd() * 3);
      }
      return tex(c, { repeat: [1, 1] });
    });
  }

  function brickTexture() {
    return once('brick', () => {
      const w = 256, h = 128, c = canvas(w, h), g = c.getContext('2d');
      const rnd = U.mulberry32(5);
      g.fillStyle = '#d8cfc0'; g.fillRect(0, 0, w, h);
      const bh = 32, bw = 64;
      for (let row = 0; row < h / bh; row++) {
        const off = (row % 2) * bw / 2;
        for (let col = -1; col < w / bw + 1; col++) {
          const base = [168 + rnd() * 30, 66 + rnd() * 20, 50 + rnd() * 14];
          g.fillStyle = `rgb(${base[0] | 0},${base[1] | 0},${base[2] | 0})`;
          g.fillRect(col * bw + off + 3, row * bh + 3, bw - 6, bh - 6);
          g.fillStyle = 'rgba(255,255,255,0.08)';
          g.fillRect(col * bw + off + 3, row * bh + 3, bw - 6, 4);
        }
      }
      return tex(c, { repeat: [1, 1] });
    });
  }

  function stoneTexture(tint) {
    return once('stone:' + tint, () => {
      const n = 256, c = canvas(n, n), g = c.getContext('2d');
      const rnd = U.mulberry32(9);
      g.fillStyle = shade(tint, -0.25); g.fillRect(0, 0, n, n);
      // Irregular blocks.
      for (let row = 0; row < 4; row++) {
        let x = -rnd() * 40;
        while (x < n) {
          const bw = 40 + rnd() * 50;
          g.fillStyle = shade(tint, (rnd() - 0.5) * 0.12);
          const y = row * 64;
          g.beginPath();
          g.roundRect ? g.roundRect(x + 3, y + 3, bw - 6, 58, 8) : g.rect(x + 3, y + 3, bw - 6, 58);
          g.fill();
          x += bw;
        }
      }
      for (let i = 0; i < 3000; i++) {
        g.fillStyle = `rgba(0,0,0,${rnd() * 0.08})`;
        g.fillRect(rnd() * n, rnd() * n, 2, 2);
      }
      return tex(c, { repeat: [1, 1] });
    });
  }

  function woodTexture(tint) {
    return once('wood:' + tint, () => {
      const w = 256, h = 256, c = canvas(w, h), g = c.getContext('2d');
      const rnd = U.mulberry32(17);
      const plank = 32;
      for (let i = 0; i < h / plank; i++) {
        g.fillStyle = shade(tint, (rnd() - 0.5) * 0.1);
        g.fillRect(0, i * plank, w, plank);
        for (let k = 0; k < 22; k++) {
          g.strokeStyle = `rgba(60,30,10,${0.06 + rnd() * 0.08})`;
          g.lineWidth = 1;
          g.beginPath();
          const y = i * plank + rnd() * plank;
          g.moveTo(0, y);
          g.bezierCurveTo(w * 0.3, y + (rnd() - 0.5) * 6, w * 0.6, y + (rnd() - 0.5) * 6, w, y);
          g.stroke();
        }
        g.fillStyle = 'rgba(40,20,5,0.55)';
        g.fillRect(0, i * plank, w, 2);
      }
      return tex(c, { repeat: [1, 1] });
    });
  }

  /** Golf ball dimples as a normal map. */
  function dimpleNormal() {
    return once('dimples', () => {
      const n = 256, hgt = new Float32Array(n * n);
      const cells = 16, cs = n / cells;
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const row = Math.floor(y / cs);
        const off = (row % 2) * cs / 2;
        const cx = (Math.floor((x + off) / cs) + 0.5) * cs - off;
        const cy = (row + 0.5) * cs;
        const d = Math.hypot(x - cx, y - cy) / (cs * 0.46);
        hgt[y * n + x] = d < 1 ? -Math.cos(d * Math.PI / 2) : 0;
      }
      const t = tex(heightToNormal(hgt, n, n, 2.2), { srgb: false, repeat: [3, 2] });
      return t;
    });
  }

  /** Gentle ripples for water, tiling. */
  function waterNormal() {
    return once('waterN', () => {
      const n = 256, hgt = new Float32Array(n * n);
      const waves = [];
      const rnd = U.mulberry32(33);
      for (let i = 0; i < 9; i++) waves.push({ kx: Math.round(rnd() * 6 - 3) || 1, ky: Math.round(rnd() * 6 - 3) || 1, p: rnd() * 6.28, a: 0.3 + rnd() * 0.7 });
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        let v = 0;
        for (const w of waves) v += w.a * Math.sin((w.kx * x + w.ky * y) / n * Math.PI * 2 + w.p);
        hgt[y * n + x] = v * 0.15;
      }
      return tex(heightToNormal(hgt, n, n, 3), { srgb: false, repeat: [1, 1] });
    });
  }

  function glowSprite() {
    return once('glow', () => {
      const n = 128, c = canvas(n, n), g = c.getContext('2d');
      const gr = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
      gr.addColorStop(0, 'rgba(255,255,255,1)');
      gr.addColorStop(0.25, 'rgba(255,255,255,0.55)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, n, n);
      return tex(c);
    });
  }

  function softDisc() {
    return once('disc', () => {
      const n = 64, c = canvas(n, n), g = c.getContext('2d');
      const gr = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
      gr.addColorStop(0, 'rgba(0,0,0,0.55)');
      gr.addColorStop(0.6, 'rgba(0,0,0,0.3)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(0, 0, n, n);
      return tex(c);
    });
  }

  /** Dashes for the aim line: bright core, dark edge, transparent gaps. */
  function dashTexture() {
    return once('dash', () => {
      const w = 128, h = 32, c = canvas(w, h), g = c.getContext('2d');
      g.clearRect(0, 0, w, h);
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.roundRect ? g.roundRect(8, 4, 76, 24, 12) : g.rect(8, 4, 76, 24);
      g.fill();
      const t = tex(c);
      t.wrapS = THREE.RepeatWrapping;
      return t;
    });
  }

  function cloudTexture() {
    return once('cloud', () => {
      const w = 256, h = 128, c = canvas(w, h), g = c.getContext('2d');
      const rnd = U.mulberry32(41);
      for (let i = 0; i < 16; i++) {
        const x = 50 + rnd() * 156, y = 50 + rnd() * 40, r = 18 + rnd() * 30;
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, 'rgba(255,255,255,0.95)');
        gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr;
        g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      }
      return tex(c);
    });
  }

  /* ── Geometry helpers ─────────────────────────────────────────────────── */

  /**
   * Merge geometries into one, keeping position/normal/uv/color. Core three
   * r155 has no mergeGeometries (it lives in the addons), so here's a small one.
   */
  function merge(list) {
    let vCount = 0, iCount = 0, hasColor = false;
    const prepared = list.map((g) => {
      const geo = g.index ? g : indexify(g);
      vCount += geo.attributes.position.count;
      iCount += geo.index.count;
      if (geo.attributes.color) hasColor = true;
      return geo;
    });
    const pos = new Float32Array(vCount * 3), nor = new Float32Array(vCount * 3), uv = new Float32Array(vCount * 2);
    const col = hasColor ? new Float32Array(vCount * 3) : null;
    const idx = new (vCount > 65535 ? Uint32Array : Uint16Array)(iCount);
    let vo = 0, io = 0;
    for (const g of prepared) {
      const n = g.attributes.position.count;
      pos.set(g.attributes.position.array, vo * 3);
      if (g.attributes.normal) nor.set(g.attributes.normal.array, vo * 3);
      if (g.attributes.uv) uv.set(g.attributes.uv.array, vo * 2);
      if (col) {
        if (g.attributes.color) col.set(g.attributes.color.array, vo * 3);
        else col.fill(1, vo * 3, (vo + n) * 3);
      }
      const gi = g.index.array;
      for (let i = 0; i < gi.length; i++) idx[io + i] = gi[i] + vo;
      vo += n; io += gi.length;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.setIndex(new THREE.BufferAttribute(idx, 1));
    out.computeBoundingSphere();
    return out;
  }

  function indexify(g) {
    const n = g.attributes.position.count;
    const idx = new Uint32Array(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    if (!g.attributes.normal) g.computeVertexNormals();
    return g;
  }

  /** Paint a whole geometry one colour (for merged, vertex-coloured scenery). */
  function paint(geo, hex, jitter, rnd) {
    const n = geo.attributes.position.count;
    const col = new Float32Array(n * 3);
    const c = new THREE.Color(hex);
    for (let i = 0; i < n; i++) {
      const j = jitter ? 1 + (rnd() - 0.5) * jitter : 1;
      col[i * 3] = c.r * j; col[i * 3 + 1] = c.g * j; col[i * 3 + 2] = c.b * j;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return geo;
  }

  /** Displace each vertex a little so primitives read as hand-made, not CAD. */
  function lumpy(geo, amount, rnd) {
    const p = geo.attributes.position;
    const seen = new Map();
    for (let i = 0; i < p.count; i++) {
      const key = p.getX(i).toFixed(3) + ',' + p.getY(i).toFixed(3) + ',' + p.getZ(i).toFixed(3);
      let d = seen.get(key);
      if (d === undefined) { d = 1 + (rnd() - 0.5) * amount; seen.set(key, d); }
      p.setXYZ(i, p.getX(i) * d, p.getY(i) * d, p.getZ(i) * d);
    }
    geo.computeVertexNormals();
    return geo;
  }

  function place(geo, x, y, z, ry, sx, sy, sz) {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry || 0);
    m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx || 1, sy || sx || 1, sz || sx || 1));
    geo.applyMatrix4(m);
    return geo;
  }

  /* ── Materials ────────────────────────────────────────────────────────── */

  function vcMaterial(opts) {
    return new THREE.MeshStandardMaterial(Object.assign({ vertexColors: true, roughness: 0.85, metalness: 0 }, opts || {}));
  }

  /* ── Scenery models (geometry, vertex-coloured, for merging) ──────────── */

  function treeRound(th, rnd, s) {
    const parts = [];
    const trunkH = 2.2 * s;
    parts.push(paint(place(new THREE.CylinderGeometry(0.22 * s, 0.32 * s, trunkH, 6), 0, trunkH / 2, 0), th.trunk, 0.1, rnd));
    const blobs = 3 + (rnd() * 3 | 0);
    for (let i = 0; i < blobs; i++) {
      const r = (1.1 + rnd() * 0.8) * s;
      const g = lumpy(new THREE.IcosahedronGeometry(r, 1), 0.22, rnd);
      const a = rnd() * Math.PI * 2, d = i === 0 ? 0 : (0.6 + rnd() * 0.5) * s;
      place(g, Math.cos(a) * d, trunkH + r * 0.6 + rnd() * 0.9 * s, Math.sin(a) * d);
      parts.push(paint(g, th.foliage[(rnd() * th.foliage.length) | 0], 0.18, rnd));
    }
    return merge(parts);
  }

  function treePine(th, rnd, s) {
    const parts = [];
    parts.push(paint(place(new THREE.CylinderGeometry(0.2 * s, 0.28 * s, 1.6 * s, 6), 0, 0.8 * s, 0), th.trunk, 0.1, rnd));
    const tiers = 3;
    for (let i = 0; i < tiers; i++) {
      const r = (1.9 - i * 0.45) * s, h = (2.0 - i * 0.3) * s;
      const g = lumpy(new THREE.ConeGeometry(r, h, 8, 1), 0.12, rnd);
      place(g, 0, 1.4 * s + i * 1.05 * s + h / 2, 0, rnd() * 3);
      parts.push(paint(g, th.foliage[(rnd() * th.foliage.length) | 0], 0.15, rnd));
    }
    return merge(parts);
  }

  function treePalm(th, rnd, s) {
    const parts = [];
    const segs = 7, lean = (rnd() - 0.5) * 0.5, h = 0.75 * s;
    let x = 0, y = 0;
    for (let i = 0; i < segs; i++) {
      const g = new THREE.CylinderGeometry(0.2 * s * (1 - i * 0.05), 0.24 * s * (1 - i * 0.05), h, 7);
      place(g, x, y + h / 2, 0);
      parts.push(paint(g, i % 2 ? th.trunk : shade(th.trunk, -0.06), 0.06, rnd));
      y += h * 0.95; x += lean * (i / segs) * s * 0.6;
    }
    const fronds = 7;
    for (let i = 0; i < fronds; i++) {
      const a = (i / fronds) * Math.PI * 2 + rnd() * 0.3;
      const g = new THREE.ConeGeometry(0.45 * s, 3.2 * s, 4, 1);
      g.rotateZ(Math.PI / 2 + 0.5);
      g.translate(1.5 * s, -0.3 * s, 0);
      g.scale(1, 0.35, 1);
      g.rotateY(a);
      g.translate(x, y, 0);
      parts.push(paint(g, th.foliage[i % th.foliage.length], 0.12, rnd));
    }
    // Coconuts.
    for (let i = 0; i < 3; i++) {
      const a = rnd() * Math.PI * 2;
      parts.push(paint(place(new THREE.IcosahedronGeometry(0.22 * s, 0), x + Math.cos(a) * 0.3 * s, y - 0.25 * s, Math.sin(a) * 0.3 * s), '#6b4a2a', 0.1, rnd));
    }
    return merge(parts);
  }

  function rock(th, rnd, s) {
    const g = lumpy(new THREE.DodecahedronGeometry(s, 0), 0.35, rnd);
    g.scale(1, 0.6 + rnd() * 0.3, 1);
    g.translate(0, s * 0.25, 0);
    return paint(g, th.railStyle === 'neon' ? '#2a2f55' : shade(th.rail, -0.25 - rnd() * 0.1), 0.15, rnd);
  }

  function flowerPatch(th, rnd, s) {
    const parts = [];
    const n = 7 + (rnd() * 6 | 0);
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2, d = rnd() * s;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      const stemH = 0.25 + rnd() * 0.35;
      parts.push(paint(place(new THREE.CylinderGeometry(0.03, 0.03, stemH, 3), x, stemH / 2, z), '#3d8a35', 0, rnd));
      parts.push(paint(place(new THREE.IcosahedronGeometry(0.13 + rnd() * 0.06, 0), x, stemH, z), th.flowers[(rnd() * th.flowers.length) | 0], 0.1, rnd));
    }
    // Leafy base.
    const base = lumpy(new THREE.SphereGeometry(s * 0.9, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), 0.3, rnd);
    base.scale(1, 0.25, 1);
    parts.push(paint(base, th.foliage[0], 0.2, rnd));
    return merge(parts);
  }

  /** A bush the ball can get caught in: a clump of leafy lumps, a few flowers. */
  function bushGeometry(th, rnd, r) {
    const parts = [];
    const n = 4 + (rnd() * 3 | 0);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd() * 0.5;
      const d = i === 0 ? 0 : r * (0.35 + rnd() * 0.3);
      const br = r * (0.5 + rnd() * 0.25) * (i === 0 ? 1.15 : 1);
      const g = lumpy(new THREE.IcosahedronGeometry(br, 1), 0.25, rnd);
      g.scale(1, 0.8, 1);
      place(g, Math.cos(a) * d, br * 0.62, Math.sin(a) * d);
      parts.push(paint(g, th.foliage[(rnd() * th.foliage.length) | 0], 0.2, rnd));
    }
    for (let i = 0; i < 6; i++) {
      const a = rnd() * Math.PI * 2, d = r * (0.3 + rnd() * 0.6);
      parts.push(paint(place(new THREE.IcosahedronGeometry(r * 0.07, 0), Math.cos(a) * d, r * (0.7 + rnd() * 0.4), Math.sin(a) * d), th.flowers[(rnd() * th.flowers.length) | 0], 0, rnd));
    }
    return merge(parts);
  }

  function lampPost(th, rnd) {
    const parts = [];
    parts.push(paint(place(new THREE.CylinderGeometry(0.09, 0.14, 3.4, 8), 0, 1.7, 0), '#2b2f3a', 0, rnd));
    parts.push(paint(place(new THREE.CylinderGeometry(0.3, 0.38, 0.25, 8), 0, 0.12, 0), '#2b2f3a', 0, rnd));
    parts.push(paint(place(new THREE.ConeGeometry(0.42, 0.35, 8), 0, 3.75, 0), '#2b2f3a', 0, rnd));
    return merge(parts);
  }

  function fencePanel(th, rnd, len) {
    const parts = [];
    const col = th.railStyle === 'wood' ? '#9a6a3e' : '#ffffff';
    const pickets = Math.max(2, Math.round(len / 0.45));
    for (let i = 0; i < pickets; i++) {
      const x = -len / 2 + (i + 0.5) * (len / pickets);
      const g = new THREE.BoxGeometry(0.16, 1.1, 0.06);
      place(g, x, 0.55, 0);
      parts.push(paint(g, col, 0.04, rnd));
      parts.push(paint(place(new THREE.ConeGeometry(0.11, 0.18, 4), x, 1.19, 0, Math.PI / 4), col, 0.04, rnd));
    }
    parts.push(paint(place(new THREE.BoxGeometry(len, 0.1, 0.05), 0, 0.35, -0.05), col, 0, rnd));
    parts.push(paint(place(new THREE.BoxGeometry(len, 0.1, 0.05), 0, 0.85, -0.05), col, 0, rnd));
    return merge(parts);
  }

  /* ── Hero models (individual meshes) ──────────────────────────────────── */

  const BALL_COLORS = {
    white: '#fbfbf7', red: '#f0403c', orange: '#ff8c2a', yellow: '#ffd93b', lime: '#8fe33b',
    green: '#2fbf5a', cyan: '#33d6e6', blue: '#3d7bff', purple: '#9b5cff', pink: '#ff6fb5'
  };
  const BALL_COLOR_NAMES = Object.keys(BALL_COLORS);

  function makeBall(colorName, radius) {
    const geo = new THREE.SphereGeometry(radius, 32, 20);
    const mat = new THREE.MeshPhysicalMaterial({
      color: BALL_COLORS[colorName] || colorName || '#ffffff',
      roughness: 0.32, metalness: 0,
      clearcoat: 0.7, clearcoatRoughness: 0.18,
      normalMap: dimpleNormal(), normalScale: new THREE.Vector2(0.55, 0.55)
    });
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    return m;
  }

  /** The putter: grip, shaft, a chunky blade head. Pivot is at the grip end. */
  function makePutter() {
    const g = new THREE.Group();
    const shaftLen = 3.2;
    const steel = new THREE.MeshStandardMaterial({ color: '#e8ecf2', metalness: 0.85, roughness: 0.25 });
    const grip = new THREE.MeshStandardMaterial({ color: '#1d1f24', roughness: 0.75 });
    const head = new THREE.MeshStandardMaterial({ color: '#d4dae3', metalness: 0.85, roughness: 0.2 });
    const accent = new THREE.MeshStandardMaterial({ color: '#ff5a3c', roughness: 0.5 });

    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, shaftLen, 10), steel);
    shaft.position.y = -shaftLen / 2;
    g.add(shaft);
    const gripM = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.07, 0.9, 12), grip);
    gripM.position.y = -0.45;
    g.add(gripM);
    const headM = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.3, 0.3), head);
    headM.position.set(0.25, -shaftLen - 0.08, 0);
    g.add(headM);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.31), accent);
    stripe.position.set(0.25, -shaftLen + 0.08, 0);
    g.add(stripe);
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    g.userData.shaftLen = shaftLen;
    return g;
  }

  /** Flagstick with a cloth flag that carries the hole number. */
  function makeFlag(number, th) {
    const g = new THREE.Group();
    const poleH = 5.2;
    const poleMat = new THREE.MeshStandardMaterial({ color: '#fdfdfb', roughness: 0.35 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, poleH, 8), poleMat);
    pole.position.y = poleH / 2;
    pole.castShadow = true;
    g.add(pole);
    // Red/white bands near the top, like the real thing.
    for (let i = 0; i < 3; i++) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.22, 8), new THREE.MeshStandardMaterial({ color: '#e8352f', roughness: 0.4 }));
      band.position.y = poleH - 1.9 + i * 0.45;
      g.add(band);
    }
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), new THREE.MeshStandardMaterial({ color: '#ffd23b', metalness: 0.6, roughness: 0.3 }));
    ball.position.y = poleH + 0.06;
    g.add(ball);

    const c = canvas(256, 160), x = c.getContext('2d');
    x.fillStyle = th.glow ? '#ff3df0' : '#e8352f'; x.fillRect(0, 0, 256, 160);
    x.fillStyle = 'rgba(255,255,255,0.15)'; x.fillRect(0, 0, 256, 20);
    x.fillStyle = '#ffffff';
    x.font = 'bold 120px "Trebuchet MS", Arial, sans-serif';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(String(number), 128, 86);
    const flagTex = tex(c);
    const cloth = new THREE.PlaneGeometry(1.9, 1.2, 12, 6);
    cloth.translate(0.95, 0, 0);
    const flag = new THREE.Mesh(cloth, new THREE.MeshStandardMaterial({
      map: flagTex, side: THREE.DoubleSide, roughness: 0.8,
      emissive: th.glow ? '#ff3df0' : '#000000', emissiveIntensity: th.glow ? 0.35 : 0
    }));
    flag.position.y = poleH - 0.65;
    flag.castShadow = true;
    g.add(flag);
    const base = cloth.attributes.position.array.slice();
    g.userData.wave = function (t, wind) {
      const p = cloth.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const bx = base[i * 3], by = base[i * 3 + 1];
        const k = bx / 1.9;
        p.setZ(i, Math.sin(t * 5.2 - bx * 2.6 + by * 0.6) * 0.18 * k * wind + Math.sin(t * 2.3 - bx) * 0.06 * k);
        p.setY(i, by - k * k * 0.12);
      }
      p.needsUpdate = true;
      cloth.computeVertexNormals();
    };
    g.userData.poleH = poleH;
    return g;
  }

  /** A tee sign: post and board reading "HOLE 3 · PAR 2". */
  function makeSign(number, par, name, th) {
    const g = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: th.glow ? '#2a2f55' : '#8a5a34', roughness: 0.8 });
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.4, 0.22), wood);
    post.position.y = 1.2;
    post.castShadow = true;
    g.add(post);
    const c = canvas(512, 320), x = c.getContext('2d');
    x.fillStyle = th.glow ? '#10153a' : '#fff6e2';
    x.fillRect(0, 0, 512, 320);
    x.lineWidth = 16; x.strokeStyle = th.glow ? '#3df5ff' : '#3b2a1c';
    x.strokeRect(8, 8, 496, 304);
    x.fillStyle = th.glow ? '#ffffff' : '#3b2a1c';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = 'bold 54px "Trebuchet MS", Arial, sans-serif';
    x.fillText('HOLE', 256, 62);
    x.font = 'bold 150px "Trebuchet MS", Arial, sans-serif';
    x.fillStyle = th.glow ? '#ff3df0' : '#e8352f';
    x.fillText(String(number), 256, 168);
    x.font = 'bold 54px "Trebuchet MS", Arial, sans-serif';
    x.fillStyle = th.glow ? '#fff23d' : '#3b2a1c';
    x.fillText('PAR ' + par, 256, 272);
    const board = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.375, 0.14), [
      wood, wood, wood, wood,
      new THREE.MeshStandardMaterial({ map: tex(c), roughness: 0.7, emissive: th.glow ? '#ffffff' : '#000000', emissiveMap: th.glow ? tex(c) : null, emissiveIntensity: th.glow ? 0.5 : 0 }),
      wood
    ]);
    board.position.y = 2.35;
    board.castShadow = true;
    g.add(board);
    return g;
  }

  function makeBumper(radius, th) {
    const g = new THREE.Group();
    const h = Math.max(0.9, radius * 1.1);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.08, h, 24), new THREE.MeshStandardMaterial({ color: th.glow ? '#ff3df0' : '#e8352f', roughness: 0.35 }));
    body.position.y = h / 2;
    body.castShadow = true;
    g.add(body);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius * 1.02, radius * 0.16, 10, 28), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3 }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = h * 0.45;
    g.add(ring);
    const capMat = new THREE.MeshStandardMaterial({ color: '#ffd23b', emissive: '#ffb000', emissiveIntensity: 0.25, roughness: 0.3 });
    const cap = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.92, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), capMat);
    cap.position.y = h;
    g.add(cap);
    g.userData.cap = capMat;
    g.userData.body = body;
    return g;
  }

  /**
   * Windmill. Footprint w x d world units; the tunnel runs along local +x
   * through a low base, a tapered tower stands on it, and the sails turn on
   * the -x face (toward the tee), sweeping down across the tunnel mouth.
   * The sail reach matches the physics gate in course.js: a sail within
   * 15 degrees of straight down is closing the mouth.
   */
  function makeWindmill(w, d, gap, th) {
    const g = new THREE.Group();
    const glow = !!th.glow;
    const wallMat = new THREE.MeshStandardMaterial({ color: glow ? '#24285a' : '#fff4e0', roughness: 0.85 });
    const towerMat = new THREE.MeshStandardMaterial({ color: glow ? '#1c2050' : '#f7ead0', roughness: 0.8, flatShading: true });
    const trimMat = new THREE.MeshStandardMaterial({ color: glow ? '#3df5ff' : '#c9412e', roughness: 0.6, emissive: glow ? '#3df5ff' : '#000000', emissiveIntensity: glow ? 0.7 : 0 });
    const roofMat = new THREE.MeshStandardMaterial({ color: glow ? '#ff3df0' : '#b8382a', roughness: 0.7, flatShading: true, emissive: glow ? '#ff3df0' : '#000000', emissiveIntensity: glow ? 0.35 : 0 });
    const sailMat = new THREE.MeshStandardMaterial({ color: glow ? '#fff23d' : '#fbf6ea', roughness: 0.8, side: THREE.DoubleSide, emissive: glow ? '#fff23d' : '#000000', emissiveIntensity: glow ? 0.5 : 0 });
    const frameMat = new THREE.MeshStandardMaterial({ color: glow ? '#3df5ff' : '#6b4527', roughness: 0.7 });
    const innerMat = new THREE.MeshBasicMaterial({ color: '#0b0b0b', side: THREE.BackSide });

    const baseH = 2.3;
    const side = Math.max(0.2, (d - gap) / 2);
    const tunnelH = Math.min(baseH - 0.5, Math.max(1.5, gap * 0.55));
    for (const s of [-1, 1]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, baseH, side), wallMat);
      b.position.set(0, baseH / 2, s * (gap / 2 + side / 2));
      g.add(b);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(w, baseH - tunnelH, gap + 0.02), wallMat);
    lintel.position.set(0, tunnelH + (baseH - tunnelH) / 2, 0);
    g.add(lintel);
    // Dark tunnel interior so the mouth reads as a hole, not a slot.
    const inner = new THREE.Mesh(new THREE.BoxGeometry(w + 0.02, tunnelH, gap), innerMat);
    inner.position.set(0, tunnelH / 2, 0);
    g.add(inner);
    // Trim: a band round the base top and a frame round each mouth.
    const band = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, 0.22, d + 0.2), trimMat);
    band.position.y = baseH;
    g.add(band);
    for (const sx of [-1, 1]) {
      const arch = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.26, gap + 0.5), trimMat);
      arch.position.set(sx * (w / 2 + 0.05), tunnelH + 0.13, 0);
      g.add(arch);
      for (const sz of [-1, 1]) {
        const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.2, tunnelH, 0.22), trimMat);
        jamb.position.set(sx * (w / 2 + 0.05), tunnelH / 2, sz * (gap / 2 + 0.11));
        g.add(jamb);
      }
    }

    // Tower and cap.
    const rBot = Math.min(w, d) * 0.46, rTop = rBot * 0.68, towerH = 4.4;
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, towerH, 8), towerMat);
    tower.position.y = baseH + towerH / 2;
    g.add(tower);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(rTop * 1.25, 2.6, 8), roofMat);
    roof.position.y = baseH + towerH + 1.3;
    g.add(roof);
    const win = new THREE.Mesh(new THREE.CircleGeometry(0.42, 16), new THREE.MeshStandardMaterial({ color: '#ffe9a8', emissive: '#ffcc55', emissiveIntensity: glow ? 1.4 : 0.35 }));
    win.position.set(-rBot * 0.83, baseH + towerH * 0.42, 0);
    win.rotation.y = -Math.PI / 2;
    g.add(win);

    // Sails. The hub sits out in front of the base so the blades clear it.
    const hubY = baseH + towerH * 0.72;
    const reach = hubY - 0.12;
    const hubX = -w / 2 - 0.45;
    const sails = new THREE.Group();
    sails.position.set(hubX, hubY, 0);
    const axleLen = Math.abs(hubX) - rBot * 0.6;
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, axleLen, 10), frameMat);
    axle.rotation.z = Math.PI / 2;
    axle.position.set(hubX + axleLen / 2, hubY, 0);
    g.add(axle);
    for (let i = 0; i < 4; i++) {
      const blade = new THREE.Group();
      const spar = new THREE.Mesh(new THREE.BoxGeometry(0.14, reach, 0.14), frameMat);
      spar.position.y = -reach / 2;
      blade.add(spar);
      // Lattice sail: a cloth panel plus a few cross-battens.
      const sailW = Math.min(1.5, reach * 0.34), sailLen = reach * 0.74;
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(sailW, sailLen), sailMat);
      cloth.rotation.y = Math.PI / 2;
      cloth.position.set(-0.02, -reach * 0.58, sailW / 2 + 0.07);
      blade.add(cloth);
      for (let k = 0; k < 4; k++) {
        const batten = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, sailW + 0.1), frameMat);
        batten.position.set(-0.05, -reach * 0.24 - k * sailLen / 3.2, sailW / 2 + 0.07);
        blade.add(batten);
      }
      blade.rotation.x = i * Math.PI / 2;
      sails.add(blade);
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.45, 12), trimMat);
    hub.rotation.z = Math.PI / 2;
    sails.add(hub);
    g.add(sails);
    g.traverse(o => { if (o.isMesh && o.material !== innerMat) { o.castShadow = true; o.receiveShadow = true; } });
    g.userData.sails = sails;
    g.userData.height = baseH + towerH + 2.6;
    return g;
  }

  /**
   * Tunnel mouths. The way in is a ringed hole in the carpet with a little
   * arch over it; the way out is a pipe spout lying on its side, pointing the
   * way the ball will roll out, so it can never be mistaken for the cup.
   * Local +x is the exit direction for the spout.
   */
  function makeTunnelMouth(radius, th, exit) {
    const g = new THREE.Group();
    const glow = !!th.glow;
    const ringCol = exit ? (glow ? '#5dff6a' : '#2f9e4f') : (glow ? '#fff23d' : '#f2a22c');
    const ringMat = new THREE.MeshStandardMaterial({ color: ringCol, roughness: 0.45, metalness: 0.1, emissive: glow ? ringCol : '#000000', emissiveIntensity: glow ? 0.8 : 0 });
    const dark = new THREE.MeshBasicMaterial({ color: '#060606' });
    if (!exit) {
      const throat = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.95, 28), dark);
      throat.rotation.x = -Math.PI / 2;
      throat.position.y = 0.03;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, radius * 0.18, 10, 32), ringMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.08;
      // An arch over the hole, so it is visible from any angle.
      const arch = new THREE.Mesh(new THREE.TorusGeometry(radius * 1.05, radius * 0.12, 8, 24, Math.PI), ringMat);
      arch.position.y = 0.05;
      g.add(throat, ring, arch);
      g.userData.arch = arch;
    } else {
      const len = radius * 2.2;
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.05, radius * 1.05, len, 28, 1, true), new THREE.MeshStandardMaterial({ color: ringCol, roughness: 0.4, side: THREE.DoubleSide, emissive: glow ? ringCol : '#000000', emissiveIntensity: glow ? 0.5 : 0 }));
      pipe.rotation.z = Math.PI / 2;
      pipe.position.set(-len / 2 + radius * 0.3, radius * 0.7, 0);
      const lip = new THREE.Mesh(new THREE.TorusGeometry(radius * 1.05, radius * 0.16, 10, 28), ringMat);
      lip.rotation.y = Math.PI / 2;
      lip.position.set(radius * 0.3, radius * 0.7, 0);
      const back = new THREE.Mesh(new THREE.CircleGeometry(radius * 1.04, 24), dark);
      back.rotation.y = Math.PI / 2;
      back.position.set(-len + radius * 0.35, radius * 0.7, 0);
      g.add(pipe, lip, back);
    }
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    return g;
  }

  /**
   * The alligator, as a chain of pieces that gator.js poses one at a time:
   * the head (with its hinged jaw), then the neck, chest, hips and three bits
   * of tail. Each piece is built hanging back from its joint along -x, to the
   * sizes in MG.gator.PIECES, so the checks there match what is drawn.
   * userData: head, jaw, pieces[], mouth (where a caught ball sits, in head
   * space). The root group stays at the origin; gator.apply() places every
   * piece in the world.
   */
  function makeGator() {
    const GD = MG.gator;
    const root = new THREE.Group();
    const SKIN = '#4f9a36', BACK = '#2f6b24', BELLY = '#d9e7a0';
    const skin = new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.65 });
    const belly = new THREE.MeshStandardMaterial({ color: BELLY, roughness: 0.7 });
    const mouthM = new THREE.MeshStandardMaterial({ color: '#d9576a', roughness: 0.6 });
    const eyeW = new THREE.MeshStandardMaterial({ color: '#ffe14a', roughness: 0.3, emissive: '#aa8800', emissiveIntensity: 0.7 });
    const pupil = new THREE.MeshStandardMaterial({ color: '#111111' });
    const toothM = new THREE.MeshStandardMaterial({ color: '#fffbe8', roughness: 0.4 });

    // Head: skull and snout on top, the jaw hinged underneath. Its pivot is the neck joint.
    const head = new THREE.Group();
    head.rotation.order = 'YXZ';
    const skull = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.5, 1.0), skin);
    skull.position.set(0.55, 0.22, 0);
    const snout = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.32, 0.78), skin);
    snout.position.set(1.95, 0.16, 0);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), skin);
    nose.scale.set(1, 0.6, 1.6);
    nose.position.set(2.7, 0.22, 0);
    const palate = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.04, 0.66), mouthM);
    palate.position.set(1.6, -0.01, 0);
    head.add(skull, snout, nose, palate);
    for (const s of [-1, 1]) {
      const bump = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), skin);
      bump.position.set(0.25, 0.52, s * 0.3);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), eyeW);
      eye.position.set(0.38, 0.6, s * 0.3);
      const pu = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.24, 0.07), pupil);
      pu.position.set(0.54, 0.6, s * 0.3);
      const nostril = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), pupil);
      nostril.position.set(2.82, 0.32, s * 0.1);
      head.add(bump, eye, pu, nostril);
      for (let i = 0; i < 6; i++) {
        const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.18, 4), toothM);
        tooth.rotation.x = Math.PI;
        tooth.position.set(1.0 + i * 0.32, -0.05, s * 0.34);
        head.add(tooth);
      }
    }
    const jawPivot = new THREE.Group();
    jawPivot.position.set(GD.HEAD.jawPivot, 0.0, 0);
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.24, 0.8), belly);
    jaw.position.set(1.35, -0.14, 0);
    const tongue = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.04, 0.56), mouthM);
    tongue.position.set(1.3, -0.01, 0);
    jawPivot.add(jaw, tongue);
    for (const s of [-1, 1]) for (let i = 0; i < 5; i++) {
      const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.16, 4), toothM);
      tooth.position.set(1.15 + i * 0.32, 0.04, s * 0.32);
      jawPivot.add(tooth);
    }
    head.add(jawPivot);
    root.add(head);

    // The body: one vertex-coloured mesh per piece.
    const ell = (rx, ry, rz, x, y, hex) => { const g = new THREE.SphereGeometry(1, 14, 10); g.scale(rx, ry, rz); g.translate(x, y, 0); return paint(g, hex); };
    const box = (w, h, d, x, y, z, hex, tilt) => { const g = new THREE.BoxGeometry(w, h, d); if (tilt) g.rotateX(tilt); g.translate(x, y, z); return paint(g, hex); };
    const ridge = (parts, xs, base, h, zs, r) => {
      for (const x of xs) for (const z of zs) { const g = new THREE.ConeGeometry(r, h, 4); g.translate(x, base + h / 2, z); parts.push(paint(g, BACK)); }
    };
    const legs = (parts, x, thick) => {
      for (const s of [-1, 1]) {
        parts.push(box(thick, 0.38, thick, x, -0.36, s * 0.56, SKIN, s * 0.5));      // splayed out to the side
        parts.push(box(0.4, 0.1, 0.3, x + 0.08, -0.57, s * 0.7, SKIN));               // a flat foot, sole at -0.62
      }
    };
    const BUILD = {
      neck(p) {
        p.push(ell(0.52, 0.38, 0.56, -0.2, 0.03, SKIN));
        ridge(p, [-0.3], 0.3, 0.12, [-0.17, 0.17], 0.08);
      },
      chest(p) {
        p.push(ell(0.95, 0.5, 0.72, -0.58, 0, SKIN), ell(0.86, 0.38, 0.62, -0.58, -0.13, BELLY));
        legs(p, -0.2, 0.26);
        ridge(p, [-0.05, -0.5, -0.95, -1.35], 0.44, 0.18, [-0.2, 0.2], 0.1);
      },
      hips(p) {
        p.push(ell(0.92, 0.48, 0.7, -0.6, 0, SKIN), ell(0.84, 0.36, 0.6, -0.6, -0.12, BELLY));
        legs(p, -1.0, 0.3);
        ridge(p, [-0.15, -0.6, -1.05], 0.42, 0.18, [-0.2, 0.2], 0.1);
      },
      tail1(p) {
        p.push(ell(0.76, 0.42, 0.32, -0.45, 0.05, SKIN));
        ridge(p, [-0.15, -0.55, -0.95], 0.4, 0.1, [-0.11, 0.11], 0.07);
      },
      tail2(p) {
        p.push(ell(0.68, 0.34, 0.25, -0.42, 0.04, SKIN));
        ridge(p, [-0.1, -0.45, -0.8], 0.32, 0.08, [0], 0.07);
      },
      tail3(p) {
        const g = new THREE.ConeGeometry(0.25, 1.25, 8);
        g.rotateZ(Math.PI / 2);            // the tip points back (-x)
        g.scale(1, 1, 0.7);                // tall and thin, like a real tail
        g.translate(-0.42, 0.03, 0);
        p.push(paint(g, SKIN));
        ridge(p, [-0.05, -0.35], 0.22, 0.06, [0], 0.06);
      }
    };
    const vc = vcMaterial({ roughness: 0.68 });
    const pieces = GD.PIECES.map((spec) => {
      const parts = [];
      BUILD[spec.name](parts);
      const piece = new THREE.Group();
      piece.rotation.order = 'YXZ';
      const mesh = new THREE.Mesh(merge(parts), vc);
      mesh.name = 'gator-' + spec.name;
      piece.add(mesh);
      root.add(piece);
      return piece;
    });

    // Hand gator.js the outline of these meshes, so its checks see what is drawn: in slices
    // 0.18 units long, the widest, highest and lowest points of each, and both ends.
    if (!GD.hasShape) {
      const v = new THREE.Vector3();
      const collect = (meshes) => {
        const slices = new Map();
        let front = null, back = null;
        const keep = (sl, key, p, better) => { if (!sl[key] || better(p, sl[key])) sl[key] = p; };
        for (const m of meshes) {
          m.updateMatrix();
          const pos = m.geometry.attributes.position;
          for (let i = 0; i < pos.count; i++) {
            v.fromBufferAttribute(pos, i).applyMatrix4(m.matrix);
            const p = [v.x, v.y, v.z], k = Math.round(v.x / 0.18);
            const sl = slices.get(k) || {};
            keep(sl, 'left', p, (a, b) => a[2] > b[2]);
            keep(sl, 'right', p, (a, b) => a[2] < b[2]);
            keep(sl, 'top', p, (a, b) => a[1] > b[1]);
            keep(sl, 'bottom', p, (a, b) => a[1] < b[1]);
            slices.set(k, sl);
            if (!front || p[0] > front[0]) front = p;
            if (!back || p[0] < back[0]) back = p;
          }
        }
        const out = [front, back];
        for (const sl of slices.values()) for (const key of ['left', 'right', 'top', 'bottom']) if (out.indexOf(sl[key]) < 0) out.push(sl[key]);
        return out;
      };
      GD.setShape({
        head: collect(head.children.filter(o => o.isMesh)),
        jaw: collect(jawPivot.children.filter(o => o.isMesh)),
        pieces: pieces.map(p => collect(p.children))
      });
    }
    head.traverse(o => { if (o.isMesh && !o.name) o.name = 'gator-head'; });
    jawPivot.traverse(o => { if (o.isMesh) o.name = 'gator-jaw'; });
    root.traverse(o => { if (o.isMesh) o.castShadow = true; });
    root.userData.head = head;
    root.userData.jaw = jawPivot;
    root.userData.pieces = pieces;
    root.userData.mouth = new THREE.Vector3(GD.MOUTH.x, GD.MOUTH.y, GD.MOUTH.z);
    return root;
  }

  MG.art = {
    THEMES, theme, shade, rgb, canvas, tex,
    carpetDetail, grassTexture, brickTexture, stoneTexture, woodTexture,
    dimpleNormal, waterNormal, glowSprite, softDisc, dashTexture, cloudTexture,
    merge, paint, lumpy, place, vcMaterial,
    treeRound, treePine, treePalm, rock, flowerPatch, bushGeometry, lampPost, fencePanel,
    BALL_COLORS, BALL_COLOR_NAMES,
    makeBall, makePutter, makeFlag, makeSign, makeBumper, makeWindmill, makeTunnelMouth, makeGator
  };
})();
