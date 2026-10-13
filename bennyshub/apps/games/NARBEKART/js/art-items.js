/**
 * NARBE Racer — road textures, item meshes, set pieces and particle effects.
 *
 * Extends the art kit in art.js (which must load first) with everything a
 * race puts on and beside the road:
 *
 *   A) Canvas textures: the road surface in six styles with the five lanes
 *      painted on, Power Pad and Boost Pad decals, guardrail stripes and
 *      wall faces.
 *   B) Items and track features: the Power Box, coins, pads, ramps and the
 *      mesh for every item that appears in the world.
 *   C) Set pieces: the Rescue Drone, start gantry, podium, trophies, the
 *      glider wing and the trackside props every track shares.
 *   D) One pooled particle system: three draw calls however busy it gets.
 *
 * It follows art.js's house rules: models face -Z with their origin on the
 * ground; materials are shared and cached (anything that animates its own
 * opacity gets a private clone); parts are painted with vertex colours and
 * welded, so an object costs a draw call or two; and anything a player must
 * react to wears a dark ink outline. Colours are chosen a notch darker than
 * they should appear: with NoToneMapping the sun and sky lights brighten a
 * lit face by about 1.8x, and bright pastels would clip to white.
 */
(function () {
  'use strict';

  const A = NK.art;
  const C = NK.C;
  const U = NK.util;
  const INK = A.INK;
  const INK_CSS = A.css(INK);
  const TAU = Math.PI * 2;

  /* ── Palette ──────────────────────────────────────────────────────────── */
  const P = {
    white: 0xf2efe8, cream: 0xfff0c2, red: 0xd62839, orange: 0xef6a1a,
    yellow: 0xf2b600, gold: 0xe09a00, lime: 0x78c43c, green: 0x2aa84a,
    teal: 0x12a39b, sky: 0x2a8ce0, blue: 0x2449d6, violet: 0x6a2fd6,
    pink: 0xef5b9c, grey: 0x8b8ea3, steel: 0xa7b0c2, dark: 0x2a2c40, brown: 0x7a4a26
  };
  /** Bright colours for crowds, balloons, flags and confetti. */
  const PARTY = [P.red, P.orange, P.yellow, P.lime, P.green, P.teal, P.sky, P.blue, P.violet, P.pink, P.white];

  /* ══ Helpers ═══════════════════════════════════════════════════════════ */

  const cache = new Map();
  /** This file's cache for materials and textures built from a recipe. */
  function own(key, make) {
    let v = cache.get(key);
    if (v === undefined) { v = make(); cache.set(key, v); }
    return v;
  }

  const cssOf = (c) => (typeof c === 'number' ? A.css(c) : String(c));
  const rngOf = (r) => (r && typeof r.next === 'function' ? r : U.rng(typeof r === 'number' ? r : 1234));
  const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
  /** art.js's shared outline material (the cache hands back the same instance). */
  const inkMat = () => A.mat.basic(INK, { side: 'back' });
  /** Mark a subtree so mergeByMaterial leaves it separate (it animates). */
  const keep = (o) => { o.userData.keep = true; return o; };

  /* ── Geometry ───────────────────────────────────────────────────────────
   * Transforms are baked into geometries rather than set on meshes: outline
   * shells are offset in the geometry's own units, so a part scaled after the
   * fact would get a stretched, uneven ink line.
   */
  const _m4 = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _e = new THREE.Euler();
  const _a = new THREE.Vector3();
  const _b = new THREE.Vector3();
  const _s = new THREE.Vector3();
  const ORIGIN = new THREE.Vector3();
  const Y_AXIS = new THREE.Vector3(0, 1, 0);
  const Z_AXIS = new THREE.Vector3(0, 0, 1);

  function bake(geo, pos, rot, scale) {
    _a.set(pos ? pos[0] : 0, pos ? pos[1] : 0, pos ? pos[2] : 0);
    _q.setFromEuler(_e.set(rot ? rot[0] : 0, rot ? rot[1] : 0, rot ? rot[2] : 0));
    if (scale === undefined || scale === null) _s.set(1, 1, 1);
    else if (typeof scale === 'number') _s.setScalar(scale);
    else _s.set(scale[0], scale[1], scale[2]);
    geo.applyMatrix4(_m4.compose(_a, _q, _s));
    return geo;
  }

  /** Stretch a unit-height, +Y-aligned geometry (cylinder, box) from a to b. */
  function span(geo, a, b) {
    _a.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const len = _a.length();
    _q.setFromUnitVectors(Y_AXIS, _a.normalize());
    _b.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
    geo.applyMatrix4(_m4.compose(_b, _q, _s.set(1, len, 1)));
    return geo;
  }

  /** Turn a geometry so its +Z points along dir (keeping +Y roughly up), then move it to at. */
  function aim(geo, dir, at) {
    _a.set(dir[0], dir[1], dir[2]).normalize();
    _m4.identity().lookAt(_a, ORIGIN, Math.abs(_a.y) > 0.99 ? Z_AXIS : Y_AXIS);
    _m4.setPosition(at[0], at[1], at[2]);
    geo.applyMatrix4(_m4);
    return geo;
  }

  const ellipsoid = (rx, ry, rz, ws, hs) => bake(new THREE.SphereGeometry(1, ws || 16, hs || 12), null, null, [rx, ry, rz]);
  const tube = (a, b, r, seg) => span(new THREE.CylinderGeometry(r, r, 1, seg || 8), a, b);
  const bar = (a, b, w, d) => span(new THREE.BoxGeometry(w, 1, d === undefined ? w : d), a, b);

  const _col = new THREE.Color();
  /** Vertex colour per vertex from fn(x, y, z) → hex (soft blends between vertices). */
  function paintBy(geo, fn) {
    const p = geo.attributes.position;
    const arr = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      _col.set(A.norm(fn(p.getX(i), p.getY(i), p.getZ(i))));
      arr[i * 3] = _col.r; arr[i * 3 + 1] = _col.g; arr[i * 3 + 2] = _col.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return geo;
  }

  /** Vertex colour per triangle from fn(cx, cy, cz) at its centroid: crisp
   *  stripes and panels. `attr` picks the attribute the centroid is taken
   *  from (default 'position'). Returns a non-indexed geometry. */
  function paintFaces(geo, fn, attr) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    const p = g.attributes[attr || 'position'];
    const arr = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i += 3) {
      const cx = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3;
      const cy = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
      const cz = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
      _col.set(A.norm(fn(cx, cy, cz)));
      for (let k = 0; k < 3; k++) { arr[(i + k) * 3] = _col.r; arr[(i + k) * 3 + 1] = _col.g; arr[(i + k) * 3 + 2] = _col.b; }
    }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return g;
  }

  /** Join geometries into one non-indexed geometry (position and normal, uv
   *  when every part has it, colour when any part has it). Sources are disposed. */
  function concat(list) {
    const parts = list.map((g) => (g.index ? g.toNonIndexed() : g));
    let n = 0;
    for (let i = 0; i < parts.length; i++) n += parts[i].attributes.position.count;
    const hasUv = parts.every((g) => !!g.attributes.uv);
    const hasCol = parts.some((g) => !!g.attributes.color);
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
    const uv = hasUv ? new Float32Array(n * 2) : null;
    const col = hasCol ? new Float32Array(n * 3) : null;
    let o = 0;
    for (let i = 0; i < parts.length; i++) {
      const g = parts[i], c = g.attributes.position.count;
      pos.set(g.attributes.position.array.subarray(0, c * 3), o * 3);
      if (g.attributes.normal) nor.set(g.attributes.normal.array.subarray(0, c * 3), o * 3);
      if (uv) uv.set(g.attributes.uv.array.subarray(0, c * 2), o * 2);
      if (col) {
        const src = g.attributes.color;
        if (src && src.itemSize === 3) col.set(src.array.subarray(0, c * 3), o * 3);
        else col.fill(1, o * 3, (o + c) * 3);
      }
      o += c;
    }
    parts.forEach((g, i) => { if (g !== list[i]) g.dispose(); list[i].dispose(); });
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    if (uv) out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.computeBoundingSphere();
    return out;
  }

  /** The ink shell geometry art.js would give a mesh of this geometry. */
  function shellOf(geo, thickness) {
    const tmp = new THREE.Mesh(geo);
    const sh = A.outline(tmp, thickness);
    tmp.remove(sh);
    return sh.geometry;
  }

  /**
   * Box with rounded edges and true smooth normals: a port of three's
   * RoundedBoxGeometry, which is not in the core build. Each vertex of a
   * finely divided unit box is snapped to its octant's inner corner and
   * pushed out along its own direction, so the middle row of every face stays
   * flat and the rest rolls round the edge.
   */
  function roundedBox(w, h, d, r, seg) {
    const s = (seg || 2) * 2 + 1;
    r = Math.min(w / 2, h / 2, d / 2, r);
    const geo = new THREE.BoxGeometry(1, 1, 1, s, s, s).toNonIndexed();
    const p = geo.attributes.position.array, n = geo.attributes.normal.array;
    const bx = w / 2 - r, by = h / 2 - r, bz = d / 2 - r, half = 0.5 / s;
    for (let i = 0; i < p.length; i += 3) {
      const sx = Math.sign(p[i]), sy = Math.sign(p[i + 1]), sz = Math.sign(p[i + 2]);
      let nx = p[i] - sx * half, ny = p[i + 1] - sy * half, nz = p[i + 2] - sz * half;
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l; ny /= l; nz /= l;
      p[i] = bx * sx + nx * r; p[i + 1] = by * sy + ny * r; p[i + 2] = bz * sz + nz * r;
      n[i] = nx; n[i + 1] = ny; n[i + 2] = nz;
    }
    return geo;
  }

  /** A flat 2D shape from normalised points (u right, v down, as on a canvas). */
  function shapeOf(points, w, h) {
    const s = new THREE.Shape();
    points.forEach((pt, i) => {
      const x = (pt[0] - 0.5) * w, y = (0.5 - pt[1]) * h;
      if (i) s.lineTo(x, y); else s.moveTo(x, y);
    });
    s.closePath();
    return s;
  }

  function starShape(outer, inner, points) {
    const s = new THREE.Shape();
    for (let i = 0; i < points * 2; i++) {
      const a = Math.PI / 2 + i * Math.PI / points;
      const r = i % 2 ? inner : outer;
      if (i) s.lineTo(Math.cos(a) * r, Math.sin(a) * r); else s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    s.closePath();
    return s;
  }

  /* ── Part shortcuts ─────────────────────────────────────────────────── */
  /** Painted toon part on the shared vertex-colour material. */
  const tp = (geo, hex, opts) => A.partV(geo, hex, opts);
  /** Painted flat-shaded Lambert part: set-piece structures and scenery. */
  const lp = (geo, hex, opts) => A.partV(geo, hex, Object.assign({ lambert: true }, opts));
  /** Part from a geometry already painted with paintBy / paintFaces. */
  const vp = (geo, opts) => A.part(geo, A.mat.toonV(), opts);
  /** Weld a built group down to one mesh per material (kept subtrees survive). */
  const finish = (g) => A.mergeByMaterial(g);
  /** Soft blob shadow for things near the road; consumers can find and drop it. */
  function groundShadow(size) {
    const s = keep(A.blobShadow(size));
    s.userData.shadow = true;
    return s;
  }

  /* ══ A) Textures ════════════════════════════════════════════════════════
   * Canvas-drawn once and cached by recipe, so every track sharing a theme
   * shares its textures. Anything that repeats tiles seamlessly: random marks
   * near a repeating edge are drawn again on the far side.
   */

  const FONT = '"Arial Black", "Segoe UI Black", "Arial Bold", Arial, sans-serif';

  function rrect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function wrapY(h, y, reach, fn) {
    fn(y);
    if (y < reach) fn(y + h);
    if (y > h - reach) fn(y - h);
  }

  function wrapX(w, x, reach, fn) {
    fn(x);
    if (x < reach) fn(x + w);
    if (x > w - reach) fn(x - w);
  }

  /** Lighten (amt > 0) or darken (amt < 0) a CSS colour, in sRGB lightness. */
  const _hsl = { h: 0, s: 0, l: 0 };
  function shade(css, amt) {
    _col.set(css);
    _col.getHSL(_hsl, THREE.SRGBColorSpace);
    const l = amt > 0 ? _hsl.l + (1 - _hsl.l) * amt : _hsl.l * (1 + amt);
    _col.setHSL(_hsl.h, _hsl.s, clamp01(l), THREE.SRGBColorSpace);
    return '#' + _col.getHexString();
  }

  /** Four-pointed twinkle. */
  function sparkle(g, x, y, s, color) {
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(x, y - s);
    g.quadraticCurveTo(x, y, x + s, y);
    g.quadraticCurveTo(x, y, x, y + s);
    g.quadraticCurveTo(x, y, x - s, y);
    g.quadraticCurveTo(x, y, x, y - s);
    g.fill();
  }

  /** The ⚡ emblem, normalised to a unit box (canvas coordinates, v down). */
  const BOLT = [[0.60, 0.00], [0.16, 0.56], [0.45, 0.56], [0.33, 1.00], [0.84, 0.40], [0.55, 0.40], [0.74, 0.00]];

  function boltPath(g, x, y, w, h) {
    g.beginPath();
    BOLT.forEach((pt, i) => {
      const px = x + pt[0] * w, py = y + pt[1] * h;
      if (i) g.lineTo(px, py); else g.moveTo(px, py);
    });
    g.closePath();
  }

  /** A bold bolt: thick ink edge, warm gradient, and a white glint along its
   *  upper-left edges (the same outline shifted down-right, clipped inside). */
  function drawBolt(g, x, y, w, h, inkW) {
    g.lineJoin = 'round';
    boltPath(g, x, y, w, h);
    g.lineWidth = inkW; g.strokeStyle = INK_CSS; g.stroke();
    const gr = g.createLinearGradient(0, y, 0, y + h);
    gr.addColorStop(0, '#fff47a'); gr.addColorStop(0.45, '#ffd21a'); gr.addColorStop(1, '#ff8a00');
    g.fillStyle = gr; g.fill();
    g.save();
    boltPath(g, x, y, w, h); g.clip();
    g.translate(inkW * 0.3, inkW * 0.3);
    boltPath(g, x, y, w, h);
    g.lineWidth = inkW * 0.4; g.strokeStyle = 'rgba(255,255,255,0.85)'; g.stroke();
    g.restore();
  }

  /** A forward-pointing chevron (^) filling the box. */
  function chevronPath(g, x, y, w, h) {
    g.beginPath();
    g.moveTo(x + w / 2, y);
    g.lineTo(x + w, y + h * 0.55);
    g.lineTo(x + w, y + h);
    g.lineTo(x + w / 2, y + h * 0.45);
    g.lineTo(x, y + h);
    g.lineTo(x, y + h * 0.55);
    g.closePath();
  }

  /** Big cartoon lettering: ink outline, optional light rim, then the fill. */
  function inkText(g, text, x, y, px, fill, maxW, rim) {
    let size = px;
    g.font = '900 ' + size + 'px ' + FONT;
    while (maxW && g.measureText(text).width > maxW && size > 10) { size -= 2; g.font = '900 ' + size + 'px ' + FONT; }
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    g.lineWidth = size * 0.24; g.strokeStyle = INK_CSS; g.strokeText(text, x, y);
    if (rim) { g.lineWidth = size * 0.1; g.strokeStyle = rim; g.strokeText(text, x, y); }
    g.fillStyle = fill; g.fillText(text, x, y);
    return size;
  }

  /* ── Road surface ─────────────────────────────────────────────────────────
   * UV contract (world.js): u = (x + ROAD_HALF) / (2 * ROAD_HALF) across the
   * paving and v = s / ROAD_TILE along it; wrapS clamps, wrapT repeats, and
   * texture.repeat stays (1, 1). The canvas top is "forward".
   *
   * Whatever the style, the lanes are painted the same way, because they are
   * what a switch player steers by: dashed dividers between lanes, with the
   * pair either side of the middle lane in the `center` colour so the middle
   * is findable at a glance; solid edge lines at ±9 m; and kerb blocks out to
   * the paving edge (the drop in Open mode). Every line carries a soft ink
   * border, which keeps it readable on pale ice and sand as well as tarmac.
   */
  const ROAD_TILE = 16;
  const RW = 1024, RH = 1024;
  const PXM = RW / (2 * C.ROAD_HALF);          // canvas px per metre across (~54)
  const PYM = RH / ROAD_TILE;                  // canvas px per metre along (64)
  const xpx = (x) => (x + C.ROAD_HALF) * PXM;
  const EDGE_X = C.ROAD_HALF - 0.5;            // centre of the solid edge line
  const EDGE_W = 0.36, DIV_W = 0.24;           // line widths, metres
  const DASH = 4, DASH_GAP = 4;                // metres; 16 m tile = two dashes
  const DIVIDERS = [];
  for (let i = 0; i < C.LANE_COUNT - 1; i++) DIVIDERS.push((C.laneX(i) + C.laneX(i + 1)) / 2);
  const LINE_PX = DIVIDERS.concat([-EDGE_X, EDGE_X]).map(xpx);
  const nearLine = (x, margin) => LINE_PX.some((lx) => Math.abs(x - lx) < margin);

  const ROAD_STYLES = {
    asphalt: { base: '#5c5f6e', edge: '#f7f5ee', lane: '#f7f5ee', center: '#ffc21a', kerb: '#d7263d' },
    rainbow: { base: '#170a3a', edge: '#7ff6ff', lane: '#ffffff', center: '#fff3a0', kerb: '#7ff6ff' },
    ice:     { base: '#a6d6ec', edge: '#ffffff', lane: '#1d5bbf', center: '#1d5bbf', kerb: '#2f6fe0' },
    candy:   { base: '#f29abf', edge: '#ffffff', lane: '#ffffff', center: '#e8174f', kerb: '#e8174f' },
    stone:   { base: '#8a7f77', edge: '#f2ead6', lane: '#f2ead6', center: '#ffb627', kerb: '#b8322a' },
    sand:    { base: '#d9b173', edge: '#fff7e2', lane: '#fff7e2', center: '#ff8a1a', kerb: '#c2462b' }
  };

  /**
   * @param {string|object} style 'asphalt'|'rainbow'|'ice'|'candy'|'stone'|'sand',
   *        or a theme road object { style, base, edge, lane, center }
   * @param {object} [colors] { base, edge, lane, center, kerb } (css or hex numbers)
   */
  function road(style, colors) {
    if (style && typeof style === 'object') { colors = style; style = style.style; }
    if (!ROAD_STYLES[style]) style = 'asphalt';
    const c = Object.assign({}, ROAD_STYLES[style]);
    if (colors) Object.keys(c).forEach((k) => { if (colors[k] !== undefined && colors[k] !== null) c[k] = cssOf(colors[k]); });
    const key = 'nk-road|' + style + '|' + [c.base, c.edge, c.lane, c.center, c.kerb].join('|');
    return A.tex.cached(key, () => {
      const t = A.tex.canvas(RW, RH, (g) => {
        const r = U.rng(U.hash('nk-road-' + style));
        SURFACE[style](g, c, r);
        markings(g, c, style);
      }, { anisotropy: 8 });
      t.wrapS = THREE.ClampToEdgeWrapping;
      t.wrapT = THREE.RepeatWrapping;
      return t;
    });
  }

  /* Surface building blocks. Low contrast on purpose: the lane lines must be
     the loudest thing on the road, and fine noise just shimmers at speed. */

  function patches(g, r, n, rMin, rMax, light, dark) {
    for (let i = 0; i < n; i++) {
      const x = r.range(0, RW), y = r.range(0, RH), rad = r.range(rMin, rMax);
      const col = r.chance(0.5) ? light : dark;
      wrapY(RH, y, rad, (yy) => {
        const gr = g.createRadialGradient(x, yy, 0, x, yy, rad);
        gr.addColorStop(0, col[0]); gr.addColorStop(1, col[1]);
        g.fillStyle = gr;
        g.fillRect(x - rad, yy - rad, rad * 2, rad * 2);
      });
    }
  }

  function speckle(g, r, n, light, dark, sMin, sMax) {
    for (let i = 0; i < n; i++) {
      const s = r.range(sMin, sMax);
      g.fillStyle = r.chance(0.5) ? light : dark;
      g.fillRect(r.range(0, RW), r.range(0, RH - s), s, s);
    }
  }

  /** Worn tyre tracks either side of every lane centre: they whisper where
   *  the lanes are without adding another line. */
  function wear(g, rgb, a) {
    for (let i = 0; i < C.LANE_COUNT; i++) {
      [-1, 1].forEach((s) => {
        const x = xpx(C.laneX(i) + s * 0.85), hw = 0.34 * PXM;
        const gr = g.createLinearGradient(x - hw, 0, x + hw, 0);
        gr.addColorStop(0, 'rgba(' + rgb + ',0)');
        gr.addColorStop(0.5, 'rgba(' + rgb + ',' + a + ')');
        gr.addColorStop(1, 'rgba(' + rgb + ',0)');
        g.fillStyle = gr;
        g.fillRect(x - hw, 0, hw * 2, RH);
      });
    }
  }

  function cracks(g, r, n, color, w) {
    g.strokeStyle = color; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round';
    for (let i = 0; i < n; i++) {
      const x0 = r.range(40, RW - 40), y0 = r.range(0, RH);
      const pts = [[x0, y0]];
      let x = x0, y = y0, a = r.range(-0.6, 0.6) + (r.chance(0.5) ? 0 : Math.PI);
      const steps = r.int(5, 11);
      for (let k = 0; k < steps; k++) {
        a += r.range(-0.7, 0.7);
        x += Math.sin(a) * 14; y += Math.cos(a) * 14;
        pts.push([x, y]);
      }
      wrapY(RH, y0, 170, (yy) => {
        const dy = yy - y0;
        g.beginPath();
        pts.forEach((pt, k) => { if (k) g.lineTo(pt[0], pt[1] + dy); else g.moveTo(pt[0], pt[1] + dy); });
        g.stroke();
      });
    }
  }

  function pebbles(g, r, n, cols) {
    for (let i = 0; i < n; i++) {
      const x = r.range(0, RW), y = r.range(4, RH - 4), rx = r.range(1.5, 4.2);
      g.fillStyle = r.pick(cols);
      g.beginPath();
      g.ellipse(x, y, rx, rx * r.range(0.6, 1), r.range(0, Math.PI), 0, TAU);
      g.fill();
    }
  }

  /** A stone or ice block with a light top edge and a dark bottom edge. */
  function block(g, x, y, w, h, col, rad) {
    rrect(g, x, y, w, h, rad === undefined ? 6 : rad);
    g.fillStyle = col; g.fill();
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x + 4, y + 1, w - 8, 2.5);
    g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(x + 4, y + h - 3.5, w - 8, 2.5);
  }

  const SURFACE = {
    asphalt(g, c, r) {
      g.fillStyle = c.base; g.fillRect(0, 0, RW, RH);
      patches(g, r, 70, 40, 130, ['rgba(255,255,255,0.05)', 'rgba(255,255,255,0)'], ['rgba(0,0,0,0.08)', 'rgba(0,0,0,0)']);
      speckle(g, r, 12000, 'rgba(255,255,255,0.12)', 'rgba(0,0,0,0.16)', 1, 2.2);
      wear(g, '15,15,25', 0.11);
      cracks(g, r, 6, 'rgba(20,20,30,0.28)', 1.4);
    },

    /* Starlight Road: every lane its own rainbow colour — which is also the
       clearest lane read of any style — on a night-violet road with star
       glints and forward-pointing sheen. */
    rainbow(g, c, r) {
      g.fillStyle = c.base; g.fillRect(0, 0, RW, RH);
      const BANDS = ['#e62e5c', '#f7802a', '#f4cc2e', '#2fc27a', '#2b84ea'];
      for (let i = 0; i < C.LANE_COUNT; i++) {
        const x0 = xpx(C.laneX(i) - C.LANE_W / 2) + 5, x1 = xpx(C.laneX(i) + C.LANE_W / 2) - 5;
        const gr = g.createLinearGradient(x0, 0, x1, 0);
        gr.addColorStop(0, shade(BANDS[i], -0.3));
        gr.addColorStop(0.5, shade(BANDS[i], 0.12));
        gr.addColorStop(1, shade(BANDS[i], -0.3));
        g.fillStyle = gr;
        g.fillRect(x0, 0, x1 - x0, RH);
        // soft chevrons every 4 m pull the eye up the road
        g.strokeStyle = 'rgba(255,255,255,0.16)'; g.lineWidth = 16; g.lineJoin = 'miter'; g.lineCap = 'butt';
        for (let k = 0; k < ROAD_TILE / 4; k++) {
          const y = (k * 4 + 1) * PYM;
          g.beginPath(); g.moveTo(x0 + 10, y + 46); g.lineTo((x0 + x1) / 2, y); g.lineTo(x1 - 10, y + 46); g.stroke();
        }
      }
      for (let i = 0; i < 90; i++) {
        const x = r.range(16, RW - 16);
        if (nearLine(x, 26)) continue;
        const y = r.range(14, RH - 14), s = r.range(4, 11);
        sparkle(g, x, y, s, r.chance(0.7) ? 'rgba(255,255,255,0.9)' : 'rgba(255,245,170,0.9)');
      }
    },

    ice(g, c, r) {
      g.fillStyle = c.base; g.fillRect(0, 0, RW, RH);
      const gr = g.createLinearGradient(0, 0, RW, 0);
      gr.addColorStop(0, 'rgba(255,255,255,0.28)'); gr.addColorStop(0.5, 'rgba(20,90,160,0.10)'); gr.addColorStop(1, 'rgba(255,255,255,0.28)');
      g.fillStyle = gr; g.fillRect(0, 0, RW, RH);
      // polished streaks run the way the karts do
      for (let i = 0; i < 260; i++) {
        const x = r.range(0, RW), y = r.range(0, RH), len = r.range(40, 360), w = r.range(1, 3.5);
        g.fillStyle = r.chance(0.7) ? 'rgba(255,255,255,' + r.range(0.08, 0.22).toFixed(3) + ')' : 'rgba(20,70,130,0.07)';
        wrapY(RH, y, len, (yy) => g.fillRect(x, yy - len, w, len));
      }
      cracks(g, r, 16, 'rgba(24,78,140,0.30)', 1.6);
      // snow dust drifting in from both edges
      for (let i = 0; i < 3200; i++) {
        const side = r.sign(), d = Math.pow(r.next(), 2.4) * 4.5;
        const x = xpx(side * (C.ROAD_HALF - d)), y = r.range(4, RH - 4), rad = r.range(1, 3.5);
        g.fillStyle = 'rgba(255,255,255,' + r.range(0.25, 0.7).toFixed(3) + ')';
        g.beginPath(); g.arc(x, y, rad, 0, TAU); g.fill();
      }
      speckle(g, r, 2500, 'rgba(255,255,255,0.35)', 'rgba(40,100,160,0.08)', 1, 1.8);
    },

    candy(g, c, r) {
      g.fillStyle = c.base; g.fillRect(0, 0, RW, RH);
      // swirl stripes at 45°: a vertical period of 128 px divides the tile
      g.fillStyle = 'rgba(255,255,255,0.13)';
      for (let k = -RH; k < RW + RH; k += 128) {
        g.beginPath(); g.moveTo(k, 0); g.lineTo(k + 52, 0); g.lineTo(k + 52 + RH, RH); g.lineTo(k + RH, RH); g.closePath(); g.fill();
      }
      // sprinkles: sparse, and never white, which is the lane-mark colour
      const cols = ['#ff4d6d', '#ffd23f', '#3ec1ff', '#7cf29a', '#b388ff', '#ff9f1c'];
      g.lineCap = 'round'; g.lineWidth = 5;
      for (let i = 0; i < 280; i++) {
        const x = r.range(14, RW - 14);
        if (nearLine(x, 26)) continue;
        const y = r.range(16, RH - 16), a = r.range(0, Math.PI), l = r.range(6, 10);
        g.strokeStyle = r.pick(cols);
        g.beginPath(); g.moveTo(x - Math.cos(a) * l, y - Math.sin(a) * l); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
      }
    },

    stone(g, c, r) {
      g.fillStyle = shade(c.base, -0.45); g.fillRect(0, 0, RW, RH);
      const ROW = 0.8 * PYM;                          // 20 courses per tile
      for (let row = 0; row < ROAD_TILE / 0.8; row++) {
        let x = -r.range(0.2, 1.1) * PXM;
        while (x < RW) {
          const w = r.range(0.95, 1.6) * PXM;
          block(g, x + 2.5, row * ROW + 2.5, w - 5, ROW - 5, shade(c.base, r.range(-0.12, 0.1)));
          x += w;
        }
      }
      speckle(g, r, 5000, 'rgba(255,255,255,0.08)', 'rgba(0,0,0,0.12)', 1, 2);
      wear(g, '0,0,0', 0.09);
    },

    sand(g, c, r) {
      g.fillStyle = c.base; g.fillRect(0, 0, RW, RH);
      patches(g, r, 60, 50, 140, ['rgba(255,245,220,0.08)', 'rgba(255,245,220,0)'], ['rgba(120,70,20,0.08)', 'rgba(120,70,20,0)']);
      // wind ripples across the road
      for (let i = 0; i < 34; i++) {
        const y = r.range(0, RH), amp = r.range(2, 6), per = r.range(60, 140), ph = r.range(0, TAU);
        wrapY(RH, y, 12, (yy) => {
          g.beginPath();
          for (let x = 0; x <= RW; x += 8) { const py = yy + Math.sin(x / per + ph) * amp; if (x) g.lineTo(x, py); else g.moveTo(x, py); }
          g.strokeStyle = 'rgba(110,65,20,0.10)'; g.lineWidth = 3; g.stroke();
          g.translate(0, 3); g.strokeStyle = 'rgba(255,246,225,0.12)'; g.stroke(); g.translate(0, -3);
        });
      }
      wear(g, '100,60,20', 0.15);
      pebbles(g, r, 700, ['rgba(120,80,40,0.45)', 'rgba(90,60,30,0.35)', 'rgba(255,240,210,0.5)']);
      speckle(g, r, 5000, 'rgba(255,250,235,0.14)', 'rgba(100,60,20,0.12)', 1, 2);
    }
  };

  function markLine(g, x0, y0, x1, y1, w, color, round, glow) {
    g.lineCap = round ? 'round' : 'butt';
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1);
    g.strokeStyle = 'rgba(29,27,46,0.62)'; g.lineWidth = w + 7; g.stroke();
    if (glow) { g.shadowColor = color; g.shadowBlur = 18; }
    g.strokeStyle = color; g.lineWidth = w; g.stroke();
    g.shadowBlur = 0;
  }

  function kerbs(g, c, style) {
    const x0 = EDGE_X + EDGE_W / 2 + 0.02;
    const w = (C.ROAD_HALF - x0) * PXM;
    [-1, 1].forEach((s) => {
      const px = s < 0 ? 0 : xpx(x0);
      if (style === 'rainbow') {
        // no kerb in space: a dark lip with runway lights every 2 m
        g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(px, 0, w, RH);
        g.fillStyle = c.kerb; g.shadowColor = c.kerb; g.shadowBlur = 14;
        for (let k = 0; k < ROAD_TILE / 2; k++) { g.beginPath(); g.arc(px + w / 2, (k * 2 + 1) * PYM, w * 0.34, 0, TAU); g.fill(); }
        g.shadowBlur = 0;
      } else {
        for (let k = 0; k < ROAD_TILE; k++) { g.fillStyle = k % 2 ? c.edge : c.kerb; g.fillRect(px, k * PYM, w, PYM); }
        // ink seam at the paving edge, so the road ends crisply on any ground
        g.fillStyle = 'rgba(29,27,46,0.6)'; g.fillRect(s < 0 ? 0 : RW - 3, 0, 3, RH);
      }
    });
  }

  function markings(g, c, style) {
    const glow = style === 'rainbow';
    kerbs(g, c, style);
    [-1, 1].forEach((s) => {
      const x = xpx(s * EDGE_X), w = EDGE_W * PXM;
      markLine(g, x, -20, x, RH + 20, w, c.edge, false, glow);
      if (style === 'candy') {
        // candy-cane edge: twists of the kerb colour on the white line
        g.save(); g.beginPath(); g.rect(x - w / 2, 0, w, RH); g.clip();
        g.fillStyle = c.kerb;
        for (let y = -64; y < RH + 64; y += 64) {
          g.beginPath(); g.moveTo(x - w / 2, y); g.lineTo(x + w / 2, y - w); g.lineTo(x + w / 2, y - w + 26); g.lineTo(x - w / 2, y + 26); g.closePath(); g.fill();
        }
        g.restore();
      }
    });
    DIVIDERS.forEach((dx) => {
      const x = xpx(dx), col = Math.abs(dx) < C.LANE_W ? c.center : c.lane;
      for (let k = 0; k < ROAD_TILE / (DASH + DASH_GAP); k++) {
        const y0 = (k * (DASH + DASH_GAP) + DASH_GAP / 2) * PYM;
        markLine(g, x, y0, x, y0 + DASH * PYM, DIV_W * PXM, col, true, glow);
      }
    });
  }

  /* ── Power Pad and Boost Pad decals ───────────────────────────────────────
   * 256 x 512, laid with the canvas top pointing forward (-Z, or up a road
   * ribbon's v). Alpha is zero outside the rounded panel, so a decal sits on
   * any road; the ink rim is part of the panel, as the outline rule asks.
   * The emblem fills the panel because a pad is only ever seen at a grazing
   * angle: from 60 m a 6 m pad is a few pixels tall, so its colour and glow
   * do most of the work and the emblem has to be enormous.
   */
  function padTex(kind) {
    kind = kind === 'boost' ? 'boost' : 'power';
    return A.tex.cached('nk-pad|' + kind, () => A.tex.canvas(256, 512, (g, w, h) => {
      const m = 8;
      rrect(g, m, m, w - m * 2, h - m * 2, 40); g.fillStyle = INK_CSS; g.fill();
      rrect(g, m + 12, m + 12, w - m * 2 - 24, h - m * 2 - 24, 30);
      const gr = g.createLinearGradient(0, 0, 0, h);
      if (kind === 'power') { gr.addColorStop(0, '#2a0b8c'); gr.addColorStop(0.5, '#1c3cff'); gr.addColorStop(1, '#2a0b8c'); }
      else { gr.addColorStop(0, '#6e1000'); gr.addColorStop(0.5, '#ad2800'); gr.addColorStop(1, '#6e1000'); }
      g.fillStyle = gr; g.fill();
      g.lineWidth = 7; g.strokeStyle = kind === 'power' ? '#40e6ff' : '#ffb000'; g.stroke();
      if (kind === 'power') {
        // faint circuit traces give the panel an electric grain
        g.save(); rrect(g, m + 16, m + 16, w - m * 2 - 32, h - m * 2 - 32, 26); g.clip();
        g.strokeStyle = 'rgba(120,220,255,0.22)'; g.lineWidth = 3;
        for (let y = 40; y < h; y += 56) { g.beginPath(); g.moveTo(0, y); g.lineTo(60, y); g.lineTo(84, y + 24); g.lineTo(w, y + 24); g.stroke(); }
        g.restore();
        drawBolt(g, w * 0.1, h * 0.09, w * 0.8, h * 0.82, 22);
      } else {
        for (let k = 0; k < 3; k++) {
          const x = w * 0.14, y = h * (0.1 + k * 0.28), cw = w * 0.72, ch = h * 0.24;
          chevronPath(g, x, y, cw, ch);
          g.lineJoin = 'round'; g.lineWidth = 18; g.strokeStyle = INK_CSS; g.stroke();
          const cg = g.createLinearGradient(0, y, 0, y + ch);
          cg.addColorStop(0, '#fff27a'); cg.addColorStop(1, '#ff7a00');
          g.fillStyle = cg; g.fill();
        }
      }
    }, { anisotropy: 8 }));
  }

  /* ── Guardrail and wall faces ─────────────────────────────────────────────
   * Both repeat along u and span the rail's or wall's height in v (0 bottom,
   * 1 top). A rail texture is 4:1 and reads right repeated every RAIL_TILE
   * metres; a wall texture is 2:1, so repeat it every 2 x wall height.
   * Both carry a dark top edge: that line is the silhouette a player sees.
   */
  const RAIL_TILE = 3.2;

  function rail(a, b) {
    const ca = cssOf(a === undefined ? '#e63946' : a), cb = cssOf(b === undefined ? '#f7f5ee' : b);
    return A.tex.cached('nk-rail|' + ca + cb, () => A.tex.canvas(256, 64, (g, w, h) => {
      g.fillStyle = cb; g.fillRect(0, 0, w, h);
      g.fillStyle = ca;
      for (let k = -h; k < w + h; k += 64) {
        g.beginPath(); g.moveTo(k, h); g.lineTo(k + 32, h); g.lineTo(k + 32 + h, 0); g.lineTo(k + h, 0); g.closePath(); g.fill();
      }
      g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(0, 7, w, 3);
      g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(0, h - 12, w, 5);
      g.fillStyle = INK_CSS; g.fillRect(0, 0, w, 6); g.fillRect(0, h - 6, w, 6);
    }, { repeat: true, anisotropy: 8 }));
  }

  function wallEdges(g, w, h) {
    const gr = g.createLinearGradient(0, h - 14, 0, h);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.35)');
    g.fillStyle = gr; g.fillRect(0, h - 14, w, 14);
    g.fillStyle = INK_CSS; g.fillRect(0, 0, w, 4);
  }

  const WALL_COLORS = { stone: '#9a8f86', hedge: '#3f8f3a', fence: '#b67a45', candy: '#e8174f', ice: '#9fd6f0', metal: '#8f98ab', glow: '#39e0ff' };

  const WALLS = {
    stone(g, w, h, col, r) {
      g.fillStyle = shade(col, -0.45); g.fillRect(0, 0, w, h);
      const rows = 4, top = 18, rh = (h - top) / rows, n = 4, bw = w / n;
      for (let row = 0; row < rows; row++) {
        // colours per block index, so the block cut by the repeat seam matches itself
        const tones = [];
        for (let k = 0; k < n; k++) tones.push(shade(col, r.range(-0.12, 0.08)));
        const off = (row % 2) * bw / 2;
        for (let k = -1; k < n; k++) block(g, off + k * bw + 2, top + row * rh + 2, bw - 4, rh - 4, tones[(k + n) % n]);
      }
      for (let k = 0; k < 4; k++) block(g, k * 64 + 1, 3, 62, 14, shade(col, 0.2), 4);
      wallEdges(g, w, h);
    },
    hedge(g, w, h, col, r) {
      g.fillStyle = shade(col, -0.35); g.fillRect(0, 0, w, h);
      for (let i = 0; i < 900; i++) {
        const x = r.range(0, w), y = r.range(6, h - 6), rad = r.range(4, 10);
        g.fillStyle = shade(col, r.range(-0.2, 0.1) + (0.5 - y / h) * 0.3);
        wrapX(w, x, rad, (xx) => { g.beginPath(); g.arc(xx, y, rad, 0, TAU); g.fill(); });
      }
      wallEdges(g, w, h);
    },
    fence(g, w, h, col, r) {
      g.fillStyle = shade(col, -0.55); g.fillRect(0, 0, w, h);
      const n = 8, pw = w / n;
      for (let k = 0; k < n; k++) {
        const x = k * pw;
        g.fillStyle = shade(col, r.range(-0.1, 0.1)); g.fillRect(x + 2, 6, pw - 4, h - 12);
        g.fillStyle = 'rgba(60,30,10,0.2)';
        for (let j = 0; j < 3; j++) g.fillRect(x + 6 + j * 8 + r.range(-1, 1), 10, 1.5, h - 20);
      }
      [h * 0.3, h * 0.72].forEach((y) => {
        g.fillStyle = shade(col, -0.22); g.fillRect(0, y - 7, w, 14);
        g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, y + 5, w, 3);
        g.fillStyle = '#3a2a1c';
        for (let k = 0; k < n; k++) { g.beginPath(); g.arc(k * pw + pw / 2, y, 2.2, 0, TAU); g.fill(); }
      });
      wallEdges(g, w, h);
    },
    candy(g, w, h, col) {
      g.fillStyle = '#fff7fb'; g.fillRect(0, 0, w, h);
      g.fillStyle = col;
      for (let k = -h; k < w + h; k += 64) { g.beginPath(); g.moveTo(k, h); g.lineTo(k + 32, h); g.lineTo(k + 32 + h, 0); g.lineTo(k + h, 0); g.closePath(); g.fill(); }
      const gr = g.createLinearGradient(0, h * 0.18, 0, h * 0.45);
      gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.4)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, h * 0.18, w, h * 0.27);
      wallEdges(g, w, h);
    },
    ice(g, w, h, col, r) {
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, shade(col, 0.45)); gr.addColorStop(1, shade(col, -0.2));
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      for (let row = 0; row < 2; row++) {
        for (let k = -1; k < 3; k++) {
          const off = row * 42, x = off + k * 85 + 3, y = 14 + row * 56 + 3;
          rrect(g, x, y, 79, 50, 8);
          g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 3; g.stroke();
          g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x + 8, y + 6, 30, 8);
        }
      }
      g.strokeStyle = 'rgba(30,90,150,0.25)'; g.lineWidth = 1.5;
      for (let i = 0; i < 8; i++) {
        let x = r.range(10, w - 10), y = r.range(20, h - 20);
        g.beginPath(); g.moveTo(x, y);
        for (let k = 0; k < 4; k++) { x += r.range(-14, 14); y += r.range(-10, 10); g.lineTo(x, y); }
        g.stroke();
      }
      g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillRect(0, 4, w, 10);
      wallEdges(g, w, h);
    },
    metal(g, w, h, col) {
      g.fillStyle = col; g.fillRect(0, 0, w, h);
      [0.32, 0.66].forEach((f) => {
        const y = h * f, gr = g.createLinearGradient(0, y - 18, 0, y + 18);
        gr.addColorStop(0, shade(col, -0.25)); gr.addColorStop(0.4, shade(col, 0.4)); gr.addColorStop(1, shade(col, -0.35));
        g.fillStyle = gr; g.fillRect(0, y - 18, w, 36);
        g.fillStyle = '#3a3f52';
        for (let x = 32; x < w; x += 128) { g.beginPath(); g.arc(x, y, 5, 0, TAU); g.fill(); }
      });
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, 0, 3, h); g.fillRect(128, 0, 3, h);
      wallEdges(g, w, h);
    },
    glow(g, w, h, col) {
      g.fillStyle = '#120a2a'; g.fillRect(0, 0, w, h);
      g.shadowColor = col; g.shadowBlur = 12; g.strokeStyle = col; g.lineWidth = 5; g.lineJoin = 'miter';
      [14, h - 16].forEach((y) => { g.beginPath(); g.moveTo(-10, y); g.lineTo(w + 10, y); g.stroke(); });
      g.beginPath();
      for (let x = 0; x <= w; x += 32) g.lineTo(x, (x / 32) % 2 ? h * 0.35 : h * 0.65);
      g.stroke();
      g.shadowBlur = 0;
      g.fillStyle = INK_CSS; g.fillRect(0, 0, w, 4);
    }
  };

  function wall(style, colorHex) {
    if (!WALLS[style]) style = 'stone';
    const col = cssOf(colorHex === undefined || colorHex === null ? WALL_COLORS[style] : colorHex);
    return A.tex.cached('nk-wall|' + style + col, () => A.tex.canvas(256, 128, (g, w, h) => {
      WALLS[style](g, w, h, col, U.rng(U.hash('nk-wall-' + style)));
    }, { repeat: true, anisotropy: 8 }));
  }

  /** Horizontal rainbow gradient (u = hue), e.g. for trails and UI-ish accents. */
  function rainbowTex() {
    return A.tex.cached('nk-rainbow', () => A.tex.canvas(256, 4, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, w, 0);
      ['#e62e5c', '#f7802a', '#f4cc2e', '#2fc27a', '#2b84ea', '#7b3fe4'].forEach((c, i, a) => gr.addColorStop(i / (a.length - 1), c));
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    }));
  }

  /** The ⚡ badge on a transparent square: Power Box faces, the Zapper. */
  function boltTex() {
    return A.tex.cached('nk-bolt', () => A.tex.canvas(128, 128, (g, w, h) => {
      drawBolt(g, w * 0.14, h * 0.07, w * 0.72, h * 0.86, 13);
    }));
  }

  function rampTex(kind) {
    return A.tex.cached('nk-ramp|' + kind, () => A.tex.canvas(256, 512, (g, w, h) => {
      const glide = kind === 'glide';
      g.fillStyle = glide ? '#1680e2' : '#1d56d8'; g.fillRect(0, 0, w, h);
      const gr = g.createLinearGradient(0, 0, w, 0);
      gr.addColorStop(0, 'rgba(0,0,20,0.28)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.12)'); gr.addColorStop(1, 'rgba(0,0,20,0.28)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      const arrow = (y, ch, fill) => {
        chevronPath(g, w * 0.14, y, w * 0.72, ch);
        g.lineJoin = 'round'; g.lineWidth = 14; g.strokeStyle = INK_CSS; g.stroke();
        g.fillStyle = fill; g.fill();
      };
      if (glide) {
        // a glider seen from above says "you will fly": a white delta wing
        // with a yellow stripe, nose forward, below two arrows
        const top = h * 0.5, bot = h * 0.92;
        const wing = [[0.5, 0], [0.97, 0.82], [0.62, 0.7], [0.5, 1], [0.38, 0.7], [0.03, 0.82]];
        const path = () => {
          g.beginPath();
          wing.forEach((pt, i) => { const x = pt[0] * w, y = top + pt[1] * (bot - top); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
          g.closePath();
        };
        path(); g.lineJoin = 'round'; g.lineWidth = 14; g.strokeStyle = INK_CSS; g.stroke();
        g.fillStyle = '#ffffff'; g.fill();
        g.save(); path(); g.clip();
        g.fillStyle = '#ffc21a'; g.fillRect(0, top + (bot - top) * 0.46, w, (bot - top) * 0.16);
        g.restore();
        g.fillStyle = INK_CSS; g.fillRect(w / 2 - 3, top + 12, 6, (bot - top) * 0.8);
        arrow(h * 0.05, h * 0.19, '#ffffff');
        arrow(h * 0.26, h * 0.19, '#ffffff');
      } else {
        for (let k = 0; k < 3; k++) arrow(h * (0.08 + k * 0.3), h * 0.22, '#ffffff');
      }
      g.fillStyle = INK_CSS; g.fillRect(0, 0, 4, h); g.fillRect(w - 4, 0, 4, h);
    }, { repeat: true, anisotropy: 8 }));
  }

  /** "NARBE RACER" banner for the gantry, grandstand and pit building. */
  function bannerTex() {
    return A.tex.cached('nk-banner', () => A.tex.canvas(2048, 192, (g, w, h) => {
      g.fillStyle = '#1d1b2e'; g.fillRect(0, 0, w, h);
      const sq = h / 4;
      for (let i = 0; i < 5; i++) {
        for (let j = 0; j < 4; j++) {
          if ((i + j) % 2) continue;
          g.fillStyle = '#f7f5ee';
          g.fillRect(i * sq, j * sq, sq, sq);
          g.fillRect(w - (i + 1) * sq, j * sq, sq, sq);
        }
      }
      g.fillStyle = '#ffc21a';
      g.fillRect(5 * sq + 10, 10, w - 10 * sq - 20, 8);
      g.fillRect(5 * sq + 10, h - 18, w - 10 * sq - 20, 8);
      [0.3, 0.7].forEach((f) => sparkle(g, w * f + (f < 0.5 ? -330 : 330), h / 2, 40, '#ffc21a'));
      const gr = g.createLinearGradient(0, h * 0.2, 0, h * 0.8);
      gr.addColorStop(0, '#fff47a'); gr.addColorStop(0.5, '#ffc21a'); gr.addColorStop(1, '#ff7a00');
      inkText(g, 'NARBE RACER', w / 2, h / 2 + 6, 128, gr, w * 0.54, '#ffffff');
    }, { anisotropy: 8 }));
  }

  const BILL_SCHEMES = [['#1f5fe0', '#3a7bff'], ['#d6283c', '#f04058'], ['#1a9e5b', '#27bf72'], ['#6a2fd6', '#8450f0'], ['#e8700c', '#ff8f2a']];
  const SLOGANS = ['GO GO GO!', 'FULL SPEED!', 'RACE DAY!', 'HOLD ON TIGHT!', 'YOU CAN DO IT!', 'BOOST ZONE', 'WAVE HELLO!', 'FINISH STRONG!'];

  function billboardTex(line2, scheme) {
    return A.tex.cached('nk-bill|' + scheme + '|' + line2, () => A.tex.canvas(1008, 448, (g, w, h) => {
      const cols = BILL_SCHEMES[scheme];
      g.fillStyle = cols[0]; g.fillRect(0, 0, w, h);
      g.fillStyle = cols[1];
      for (let i = 0; i < 16; i += 2) {
        g.beginPath(); g.moveTo(w / 2, h * 0.55); g.arc(w / 2, h * 0.55, w, i / 16 * TAU, (i + 1) / 16 * TAU); g.closePath(); g.fill();
      }
      const sq = 28;
      for (let x = 0; x < w; x += sq) {
        for (let y = 0; y < h; y += sq) {
          if (x >= sq && y >= sq && x < w - sq && y < h - sq) continue;
          g.fillStyle = ((x + y) / sq) % 2 ? '#f7f5ee' : '#1d1b2e';
          g.fillRect(x, y, sq, sq);
        }
      }
      const gr = g.createLinearGradient(0, h * 0.25, 0, h * 0.58);
      gr.addColorStop(0, '#fff47a'); gr.addColorStop(1, '#ff9d00');
      inkText(g, 'NARBE RACER', w / 2, h * 0.42, 150, gr, w - 120, '#ffffff');
      if (line2) inkText(g, line2, w / 2, h * 0.76, 70, '#ffffff', w - 140);
    }, { anisotropy: 8 }));
  }

  function podiumTex() {
    return A.tex.cached('nk-podium', () => A.tex.canvas(768, 256, (g) => {
      ['1', '2', '3'].forEach((d, i) => inkText(g, d, i * 256 + 128, 138, 220, '#ffffff'));
    }));
  }

  /** A tiny sunny-day cube map so the trophies' metal has something to reflect. */
  function envCube() {
    return own('env', () => {
      const face = (top, mid, bottom, sun) => {
        const cv = document.createElement('canvas');
        cv.width = cv.height = 64;
        const g = cv.getContext('2d');
        const gr = g.createLinearGradient(0, 0, 0, 64);
        gr.addColorStop(0, top); gr.addColorStop(0.5, mid); gr.addColorStop(1, bottom);
        g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
        if (sun) {
          const s = g.createRadialGradient(40, 18, 0, 40, 18, 22);
          s.addColorStop(0, 'rgba(255,255,255,1)'); s.addColorStop(1, 'rgba(255,255,255,0)');
          g.fillStyle = s; g.fillRect(0, 0, 64, 64);
        }
        return cv;
      };
      // The lower half stays fairly bright: a metal cup reflects the ground
      // over most of its bowl, and a dark ground reads as tarnish.
      const side = face('#6fb8ee', '#fbfbf2', '#d9cfa4');
      const cube = new THREE.CubeTexture([face('#6fb8ee', '#fbfbf2', '#d9cfa4', true), side,
        face('#d4ecff', '#e9f6ff', '#d4ecff'), face('#c4b88e', '#c4b88e', '#c4b88e'),
        face('#6fb8ee', '#fbfbf2', '#d9cfa4', true), side]);
      cube.colorSpace = THREE.SRGBColorSpace;
      cube.needsUpdate = true;
      return cube;
    });
  }

  /* ══ Shaders ════════════════════════════════════════════════════════════
   * Three small ShaderMaterials: the Power Box's rainbow glass, the Super
   * Star aura, and the particle sprite used by the FX pool and every other
   * glow. The first two keep their colour in display (sRGB) terms, convert
   * to linear, and let three's colorspace chunk convert back, so they match
   * the built-in materials under the same renderer settings.
   */
  const HUE_GLSL = 'vec3 hue(float h) { return clamp(abs(fract(h + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0) - 1.0, 0.0, 1.0); }';

  /** Translucent rainbow glass: bands of hue drifting diagonally through the
   *  box, whitening and thickening toward the rim (fresnel). Self-lit, so a
   *  Power Box reads the same by day, at night and in fog. Instancing-ready. */
  function prismMaterial() {
    return own('mat:prism', () => {
      const m = new THREE.ShaderMaterial({
        uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 } }]),
        vertexShader: [
          'varying vec3 vN;', 'varying vec3 vV;', 'varying vec3 vL;', 'varying float vPhase;',
          '#include <fog_pars_vertex>',
          'void main() {',
          '  vec4 p = vec4(position, 1.0);',
          '  vec3 n = normal;',
          '  #ifdef USE_INSTANCING',
          '    p = instanceMatrix * p;',
          '    n = mat3(instanceMatrix) * n;',
          '  #endif',
          '  vL = position;',
          '  vec4 wp = modelMatrix * p;',
          '  vPhase = (wp.x + wp.z) * 0.07;',
          '  vec4 mvPosition = viewMatrix * wp;',
          '  vN = normalize(normalMatrix * n);',
          '  vV = -mvPosition.xyz;',
          '  gl_Position = projectionMatrix * mvPosition;',
          '  #include <fog_vertex>',
          '}'
        ].join('\n'),
        fragmentShader: [
          'uniform float uTime;',
          'varying vec3 vN;', 'varying vec3 vV;', 'varying vec3 vL;', 'varying float vPhase;',
          '#include <fog_pars_fragment>',
          HUE_GLSL,
          'void main() {',
          '  float fr = 1.0 - abs(dot(normalize(vN), normalize(vV)));',
          '  float h = dot(vL, vec3(0.34, 0.46, 0.24)) + vPhase + uTime * 0.2;',
          '  vec3 c = hue(fract(h));',
          '  c = mix(c, vec3(1.0), 0.2 + 0.6 * smoothstep(0.55, 0.95, fr));',
          '  float a = 0.5 + 0.42 * smoothstep(0.25, 0.9, fr);',
          '  gl_FragColor = vec4(pow(c, vec3(2.2)), a);',
          '  #include <colorspace_fragment>',
          '  #include <fog_fragment>',
          '}'
        ].join('\n'),
        transparent: true,
        depthWrite: false,
        fog: true
      });
      m.onBeforeRender = () => { m.uniforms.uTime.value = performance.now() * 0.001; m.uniformsNeedUpdate = true; };
      return m;
    });
  }

  /** Rainbow rim bubble: nearly clear face-on so the kart stays visible,
   *  bright where the shell turns away, with bands swirling round it. */
  function auraMaterial() {
    return own('mat:aura', () => new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: [
        'varying vec3 vN;', 'varying vec3 vV;', 'varying vec3 vP;',
        'void main() {',
        '  vP = position;',
        '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
        '  vN = normalize(normalMatrix * normal);',
        '  vV = -mv.xyz;',
        '  gl_Position = projectionMatrix * mv;',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform float uTime;',
        'varying vec3 vN;', 'varying vec3 vV;', 'varying vec3 vP;',
        HUE_GLSL,
        'void main() {',
        '  float fr = 1.0 - abs(dot(normalize(vN), normalize(vV)));',
        '  float ang = atan(vP.x, vP.z);',
        '  vec3 c = hue(fract(vP.y * 0.45 + ang * 0.1592 + uTime * 0.5));',
        '  float band = 0.5 + 0.5 * sin(vP.y * 7.0 + ang * 3.0 - uTime * 7.0);',
        '  float a = smoothstep(0.3, 1.0, fr) * 0.9 + band * 0.12 * fr;',
        '  c = mix(c, vec3(1.0), smoothstep(0.8, 1.0, fr) * 0.45);',
        '  gl_FragColor = vec4(pow(c, vec3(2.2)), a);',
        '  #include <colorspace_fragment>',
        '}'
      ].join('\n'),
      transparent: true,
      depthWrite: false
    }));
  }

  /** Point sprite with world-space size. Shapes: 0 soft glow (the shared
   *  glowSprite texture), 1 smoke puff, 2 confetti flake (spins and flutters),
   *  3 four-point sparkle. Colour is linear with its own alpha. */
  const FX_VERT = [
    'uniform float uScale;',
    'attribute vec4 aColor;', 'attribute float aSize;', 'attribute float aSpin;', 'attribute float aShape;',
    'varying vec4 vColor;', 'varying float vSpin;', 'varying float vShape;',
    'void main() {',
    '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
    '  gl_Position = projectionMatrix * mv;',
    '  gl_PointSize = min(aSize * projectionMatrix[1][1] * uScale / max(-mv.z, 0.05), 1024.0);',
    '  vColor = aColor; vSpin = aSpin; vShape = aShape;',
    '}'
  ].join('\n');

  const FX_FRAG = [
    'uniform sampler2D uMap;',
    'varying vec4 vColor;', 'varying float vSpin;', 'varying float vShape;',
    'void main() {',
    '  vec2 p = gl_PointCoord - 0.5;',
    '  float c = cos(vSpin), s = sin(vSpin);',
    '  vec2 q = vec2(c * p.x - s * p.y, s * p.x + c * p.y);',
    '  vec3 rgb = vColor.rgb;',
    '  float a;',
    '  if (vShape < 0.5) {',
    '    a = texture2D(uMap, gl_PointCoord).a;',
    '  } else if (vShape < 1.5) {',
    '    a = smoothstep(0.5, 0.16, length(p));',
    '  } else if (vShape < 2.5) {',
    '    float w = 0.07 + 0.26 * abs(cos(vSpin * 1.7));',
    '    a = step(abs(q.x), w) * step(abs(q.y), 0.3);',
    '    rgb *= 0.72 + 0.28 * cos(vSpin * 1.7);',
    '  } else {',
    '    vec2 k = abs(q) * 2.0;',
    '    float arms = max(1.0 - (k.x * 7.0 + k.y), 1.0 - (k.y * 7.0 + k.x));',
    '    a = clamp(max(arms, 0.0) * 1.4 + texture2D(uMap, gl_PointCoord).a * 0.45, 0.0, 1.0);',
    '  }',
    '  if (a < 0.004) discard;',
    '  gl_FragColor = vec4(rgb, vColor.a * a);',
    '  #include <colorspace_fragment>',
    '}'
  ].join('\n');

  const _vp = new THREE.Vector4();
  function fxMaterial(blending) {
    return own('mat:fx|' + blending, () => {
      const m = new THREE.ShaderMaterial({
        uniforms: { uMap: { value: A.tex.glowSprite() }, uScale: { value: 450 } },
        vertexShader: FX_VERT,
        fragmentShader: FX_FRAG,
        transparent: true,
        depthWrite: false,
        blending: blending
      });
      // Pixel size comes from the viewport being drawn, so split views match.
      m.onBeforeRender = (renderer) => {
        renderer.getCurrentViewport(_vp);
        m.uniforms.uScale.value = _vp.w * 0.5;
        m.uniformsNeedUpdate = true;
      };
      return m;
    });
  }

  /** A small static set of glow sprites (lamp halos, fuse sparks, aura glints). */
  function glowPoints(list, blending) {
    const n = list.length;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 4), size = new Float32Array(n), spin = new Float32Array(n), shape = new Float32Array(n);
    list.forEach((pt, i) => {
      pos.set(pt.pos, i * 3);
      _col.set(pt.color === undefined ? 0xffffff : pt.color);
      col[i * 4] = _col.r; col[i * 4 + 1] = _col.g; col[i * 4 + 2] = _col.b; col[i * 4 + 3] = pt.alpha === undefined ? 1 : pt.alpha;
      size[i] = pt.size; spin[i] = pt.spin || 0; shape[i] = pt.shape || 0;
    });
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 4));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('aSpin', new THREE.BufferAttribute(spin, 1));
    geo.setAttribute('aShape', new THREE.BufferAttribute(shape, 1));
    geo.computeBoundingSphere();
    const pts = new THREE.Points(geo, fxMaterial(blending === undefined ? THREE.AdditiveBlending : blending));
    pts.renderOrder = 6;
    return pts;
  }

  /** Additive vertex-colour glow for flames and comet tails: black = invisible,
   *  so a colour ramp to black fades a cone out with no sorting worries. */
  function addGlowMat() {
    return own('mat:addV', () => {
      const m = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
      m.forceSinglePass = true;
      return m;
    });
  }

  /** An open cone along +Z, bright at its base and fading to black at the tip. */
  const _lc = new THREE.Color();
  function glowCone(radius, length, base, segs) {
    const geo = new THREE.ConeGeometry(radius, length, segs || 16, 4, true);
    const cb = new THREE.Color(base), black = new THREE.Color(0x000000);
    paintBy(geo, (x, y) => _lc.copy(cb).lerp(black, clamp01(y / length + 0.5)).getHex());
    geo.rotateX(Math.PI / 2);           // tip → +Z
    geo.translate(0, 0, length / 2);    // base at the origin
    return geo;
  }

  /* ══ B) Items and track features ════════════════════════════════════════ */

  /* ── Power Box ────────────────────────────────────────────────────────────
   * A 1.6 m rainbow glass cube floating at kart height, a ⚡ badge on every
   * face and a chunky ink cage on its twelve edges. The cage stands in for an
   * inverted-hull outline: behind translucent glass a hull would show through
   * as a dark fill, while bars read as a crisp frame from every side.
   */
  const BOX_SIZE = 1.6;
  const BOX_Y = 1.3;
  const BOX_R = 0.22;

  function boxParts() {
    const h = BOX_SIZE / 2;
    const body = roundedBox(BOX_SIZE, BOX_SIZE, BOX_SIZE, BOX_R, 3);

    const faces = [[0, 0, 0], [0, Math.PI, 0], [0, Math.PI / 2, 0], [0, -Math.PI / 2, 0], [-Math.PI / 2, 0, 0], [Math.PI / 2, 0, 0]];
    const badge = concat(faces.map((rot) => bake(new THREE.PlaneGeometry(0.98, 0.98).translate(0, 0, h + 0.012), null, rot)));

    // Cage: a bar along each rounded edge's crest, joined at the corners
    // through the corner's diagonal point.
    const a = h - BOX_R, e = a + BOX_R * Math.SQRT1_2, c = a + BOX_R / Math.sqrt(3), rb = 0.07;
    const geos = [];
    [-1, 1].forEach((s1) => [-1, 1].forEach((s2) => {
      geos.push(tube([-a, s1 * e, s2 * e], [a, s1 * e, s2 * e], rb));
      geos.push(tube([s1 * e, -a, s2 * e], [s1 * e, a, s2 * e], rb));
      geos.push(tube([s1 * e, s2 * e, -a], [s1 * e, s2 * e, a], rb));
    }));
    [-1, 1].forEach((sx) => [-1, 1].forEach((sy) => [-1, 1].forEach((sz) => {
      const d = [sx * c, sy * c, sz * c];
      geos.push(tube([sx * a, sy * e, sz * e], d, rb, 6));
      geos.push(tube([sx * e, sy * a, sz * e], d, rb, 6));
      geos.push(tube([sx * e, sy * e, sz * a], d, rb, 6));
      geos.push(new THREE.SphereGeometry(rb * 1.25, 8, 6).translate(d[0], d[1], d[2]));
    })));
    const shell = concat(geos);

    return {
      body: { geometry: body, material: prismMaterial() },
      badge: { geometry: badge, material: own('mat:boxBadge', () => new THREE.MeshBasicMaterial({ map: boltTex(), alphaTest: 0.5 })) },
      shell: { geometry: shell, material: A.mat.basic(INK) }
    };
  }

  /** Build a floating pickup from instancing parts: a spinner group at height y. */
  function fromParts(parts, y, shadow, kind) {
    const g = new THREE.Group();
    const spin = new THREE.Group();
    spin.position.y = y;
    ['body', 'badge', 'shell'].forEach((k) => spin.add(new THREE.Mesh(parts[k].geometry, parts[k].material)));
    g.add(keep(spin));
    g.add(groundShadow(shadow));
    g.userData = { spin, baseY: y, kind };
    return g;
  }

  function box() { return fromParts(boxParts(), BOX_Y, 1.9, 'box'); }

  /* ── Coin ─────────────────────────────────────────────────────────────── */
  const COIN_Y = 0.95;

  function coinParts() {
    // Profile runs bottom → top: LatheGeometry faces point outward only that way.
    const prof = [[0, -0.075], [0.33, -0.075], [0.36, -0.1], [0.43, -0.1], [0.465, -0.065], [0.465, 0.065], [0.43, 0.1], [0.36, 0.1], [0.33, 0.075], [0, 0.075]];
    const body = new THREE.LatheGeometry(prof.map((p) => new THREE.Vector2(p[0], p[1])), 28).rotateX(Math.PI / 2);
    const star = () => new THREE.ExtrudeGeometry(starShape(0.21, 0.095, 5), { depth: 0.035, bevelEnabled: false });
    const badge = concat([star().translate(0, 0, -0.11), star().translate(0, 0, 0.075)]);
    return {
      body: { geometry: body, material: A.mat.toon(0xe29d00, { emissive: 0x3a2000 }) },
      badge: { geometry: badge, material: A.mat.toon(0xffd84a, { emissive: 0x4a3000 }) },
      shell: { geometry: shellOf(body, 0.045), material: inkMat() }
    };
  }

  function coin() { return fromParts(coinParts(), COIN_Y, 0.9, 'coin'); }

  /* ── Pads ─────────────────────────────────────────────────────────────────
   * Pad materials are shared by every pad of a kind. The Power Pad material
   * pulses while padGlow(true) is set, which world.js can flip per view just
   * before that view renders (DESIGN §6.2): it is one flag, no material swap.
   */
  const PAD_W = C.LANE_W - 0.4;     // one lane with a margin
  const PAD_L = 6.4;                // long, because pads are seen edge-on
  const PAD_GLOW = { idle: 0.45, lit: 1.05 };
  let padLit = false;

  function padMaterial(kind) {
    kind = kind === 'boost' ? 'boost' : 'power';
    return own('mat:pad|' + kind, () => {
      const map = padTex(kind);
      const m = new THREE.MeshLambertMaterial({
        map: map, emissiveMap: map, emissive: 0xffffff, emissiveIntensity: PAD_GLOW.idle,
        transparent: true, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4
      });
      if (kind === 'power') {
        m.onBeforeRender = () => {
          m.emissiveIntensity = padLit ? PAD_GLOW.lit + 0.4 * Math.sin(performance.now() * 0.011) : PAD_GLOW.idle;
        };
      }
      return m;
    });
  }

  function padGlow(on) { padLit = !!on; }

  /* A decal all but vanishes at a grazing angle (from 60 m a pad is a few
     pixels tall), so each pad also gets a low glowing rim: vertical, so it
     stays a bright line far down the road. Additive, fading to nothing at its
     top edge, and pulsing with the decal while padGlow(true) is set. */
  const RIM = { power: 0x19b8ff, boost: 0xff7a00 };

  function padRimMaterial(kind) {
    return own('mat:padRim|' + kind, () => {
      const m = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
      m.forceSinglePass = true;
      if (kind === 'power') {
        m.onBeforeRender = () => { m.color.setScalar(padLit ? 1.5 + 0.6 * Math.sin(performance.now() * 0.011) : 0.85); };
      }
      return m;
    });
  }

  /** Geometry of a pad's rim: four low walls just inside its edge. */
  function padRimGeo(kind, width, length) {
    const hw = width / 2 - 0.08, hl = length / 2 - 0.08, H = 0.3;
    const c = new THREE.Color(RIM[kind]);
    const pos = [], col = [];
    const wall = (x0, z0, x1, z1) => {
      pos.push(x0, 0, z0, x1, 0, z1, x1, H, z1, x0, 0, z0, x1, H, z1, x0, H, z0);
      [1, 1, 0, 1, 0, 0].forEach((k) => col.push(c.r * k, c.g * k, c.b * k));
    };
    wall(-hw, -hl, hw, -hl); wall(hw, -hl, hw, hl); wall(hw, hl, -hw, hl); wall(-hw, hl, -hw, -hl);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.computeVertexNormals();
    return geo;
  }

  /** A pad's glowing rim on its own (for pads laid as road-ribbon patches). */
  function padRim(kind, width, length) {
    kind = kind === 'boost' ? 'boost' : 'power';
    const m = new THREE.Mesh(padRimGeo(kind, width || PAD_W, length || PAD_L), padRimMaterial(kind));
    m.renderOrder = 2;
    return m;
  }

  function pad(kind, width, length) {
    kind = kind === 'boost' ? 'boost' : 'power';
    const W = width || PAD_W, L = length || PAD_L;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(W, L).rotateX(-Math.PI / 2), padMaterial(kind));
    m.position.y = 0.02;
    m.renderOrder = 1;
    const rim = padRim(kind, W, L);
    const g = new THREE.Group();
    g.add(m, rim);
    g.userData = { kind, decal: m, rim, material: m.material };
    return g;
  }

  /* ── Ramps ────────────────────────────────────────────────────────────────
   * A straight wedge, origin at the low front edge's centre, rising toward
   * -Z. Straight on purpose: a simulation that lerps height along the ramp
   * then matches the drawn surface exactly. The top carries one arrow column
   * per lane (the texture repeats every LANE_W), framed by yellow side rails
   * and a kicker lip; the back face wears hazard stripes.
   */
  const RAMPS = Object.fromEntries(Object.entries(C.JUMPS).map(([kind, spec]) =>
    [kind, { length: spec.rampLength, height: spec.rampHeight }]));

  function ramp(kind, width) {
    if (typeof kind !== 'string') {
      // DESIGN §10.1 form ramp(lanes, kind): lanes = an array of lane indices or a count
      const lanes = kind;
      kind = width;
      width = (Array.isArray(lanes) ? lanes.length : (lanes || C.LANE_COUNT)) * C.LANE_W;
    }
    kind = RAMPS[kind] ? kind : 'jump';
    const L = RAMPS[kind].length, H = RAMPS[kind].height;
    const W = width || C.LANE_W * C.LANE_COUNT;
    const hw = W / 2, reps = W / C.LANE_W;
    const g = new THREE.Group();

    const top = new THREE.BufferGeometry();
    top.setAttribute('position', new THREE.Float32BufferAttribute([-hw, 0, 0, hw, 0, 0, hw, H, -L, -hw, 0, 0, hw, H, -L, -hw, H, -L], 3));
    top.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, reps, 0, reps, 1, 0, 0, reps, 1, 0, 1], 2));
    top.computeVertexNormals();
    g.add(A.part(top, A.mat.toon(0xffffff, { map: rampTex(kind) })));

    const sides = new THREE.BufferGeometry();
    sides.setAttribute('position', new THREE.Float32BufferAttribute([
      -hw, 0, 0, -hw, H, -L, -hw, 0, -L,
      hw, 0, 0, hw, 0, -L, hw, H, -L
    ], 3));
    sides.computeVertexNormals();
    g.add(tp(sides, 0x163fa6));

    const back = paintFaces(new THREE.PlaneGeometry(W, H, Math.max(2, Math.round(W / 0.9)), 1).rotateY(Math.PI),
      (x) => (Math.floor((x + hw) / 0.9) % 2 ? INK : P.yellow));
    g.add(vp(back, { pos: [0, H / 2, -L] }));

    // side rails along the sloped edges, and the kicker lip at the top
    const slope = Math.hypot(L, H), ang = Math.atan2(H, L);
    [-1, 1].forEach((s) => g.add(tp(new THREE.BoxGeometry(0.3, 0.24, slope), P.yellow, {
      pos: [s * (hw - 0.15), H / 2 + 0.1, -L / 2], rot: [ang, 0, 0], outline: 0.04
    })));
    g.add(tp(new THREE.BoxGeometry(W, 0.16, 0.4), P.yellow, { pos: [0, H + 0.06, -L + 0.2], outline: 0.04 }));

    // ink hull of the whole wedge
    const wedge = new THREE.BufferGeometry();
    wedge.setAttribute('position', new THREE.Float32BufferAttribute([
      -hw, 0, 0, hw, 0, 0, hw, H, -L, -hw, 0, 0, hw, H, -L, -hw, H, -L,
      -hw, 0, 0, -hw, H, -L, -hw, 0, -L, hw, 0, 0, hw, 0, -L, hw, H, -L,
      -hw, 0, -L, -hw, H, -L, hw, H, -L, -hw, 0, -L, hw, H, -L, hw, 0, -L
    ], 3));
    wedge.computeVertexNormals();
    g.add(A.part(shellOf(wedge, 0.06), inkMat()));
    wedge.dispose();

    const out = finish(g);
    out.userData = { kind, length: L, height: H, width: W };
    return out;
  }

  /* ── Banana Peel ──────────────────────────────────────────────────────── */

  /** One floppy flap: a flat leaf bent down an arc until its tip rests on the
   *  road. Painted before bending: skin on top, pale flesh underneath. */
  function flapGeo() {
    const LEN = 0.9, R = 0.42, A0 = -0.35;
    const geo = ellipsoid(0.27, 0.05, LEN / 2, 14, 10).translate(0, 0, LEN / 2);
    paintBy(geo, (x, y, z) => (z > LEN * 0.87 ? 0x6b3f1d : (y >= 0 ? 0xf2c200 : 0xfff0b8)));
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), s = Math.max(0, p.getZ(i));
      const th = A0 + s / R;
      const cy = R * (Math.cos(th) - Math.cos(A0)), cz = R * (Math.sin(th) - Math.sin(A0));
      p.setXYZ(i, x, cy + y * Math.cos(th), cz + y * Math.sin(th));
    }
    geo.computeVertexNormals();
    return geo;
  }

  function peel() {
    const g = new THREE.Group();
    g.add(tp(new THREE.CylinderGeometry(0.12, 0.17, 0.46, 12), 0xf2c200, { pos: [0, 0.3, 0], outline: 0.05 }));
    g.add(tp(new THREE.CylinderGeometry(0.045, 0.08, 0.16, 8), 0x6b3f1d, { pos: [0, 0.6, 0], outline: 0.035 }));
    for (let i = 0; i < 3; i++) g.add(vp(bake(flapGeo(), [0, 0.52, 0], [0, i * TAU / 3 + 0.4, 0]), { outline: 0.05 }));
    g.add(groundShadow(1.7));
    const out = finish(g);
    out.userData = { kind: 'peel' };
    return out;
  }

  /* ── Bumper Ball ──────────────────────────────────────────────────────────
   * Green ball with a white band and a cheeky scowl. userData.roll is the
   * ball itself, centred on its middle, so spinning its rotation.x rolls it
   * in place instead of swinging it round a point on the road. The face is a
   * separate child that does not roll: it keeps glaring down the lane while
   * the band tumbles underneath it.
   */
  function onSphere(geo, R, th, ph, lift) {
    const d = [Math.sin(th) * Math.sin(ph), Math.cos(th), -Math.sin(th) * Math.cos(ph)];
    const k = R + (lift || 0);
    return aim(geo, d, [d[0] * k, d[1] * k, d[2] * k]);
  }

  function ball() {
    const R = 0.62;
    const body = new THREE.Group();
    body.add(vp(paintFaces(new THREE.SphereGeometry(R, 24, 18), (x, y) => {
      const a = Math.abs(y) / R;
      return a < 0.15 ? P.white : (a < 0.35 ? 0x1c6b2e : 0x2fb54a);
    }), { outline: 0.06 }));
    const face = new THREE.Group();
    [-1, 1].forEach((s) => {
      face.add(tp(onSphere(ellipsoid(0.15, 0.17, 0.07), R, 0.95, s * 0.36, -0.02), P.white));
      face.add(tp(onSphere(ellipsoid(0.075, 0.09, 0.04), R, 0.97, s * 0.3, 0.035), INK));
      face.add(tp(onSphere(bake(new THREE.BoxGeometry(0.24, 0.06, 0.06), null, [0, 0, -s * 0.45]), R, 0.62, s * 0.36, 0.03), INK));
    });
    const roll = finish(body), look = finish(face);
    roll.position.y = look.position.y = R;
    const g = new THREE.Group();
    g.add(keep(roll), keep(look));
    g.add(groundShadow(1.5));
    g.userData = { roll, face: look, radius: R, kind: 'ball' };
    return g;
  }

  /* ── Homing Bee ───────────────────────────────────────────────────────────
   * Hovers at kart height (userData.body, for bobbing); userData.wings are
   * the two wing pivots — flap them with rotation.z = ±sin(t · 40) · 0.6.
   */
  function bee() {
    const fly = new THREE.Group();
    fly.position.y = 1.25;
    const parts = new THREE.Group();
    const body = paintFaces(bake(new THREE.SphereGeometry(1, 20, 16).rotateX(Math.PI / 2), [0, 0, 0.1], null, [0.46, 0.44, 0.64]), (x, y, z) => {
      const t = (z - 0.1) / 0.64;
      if (t < -0.45) return P.yellow;
      return Math.floor((t + 0.45) / 0.3) % 2 ? P.yellow : INK;
    });
    parts.add(vp(body, { outline: 0.05 }));
    parts.add(tp(new THREE.SphereGeometry(0.38, 18, 14), P.yellow, { pos: [0, 0.1, -0.62], outline: 0.05 }));
    [-1, 1].forEach((s) => {
      parts.add(tp(new THREE.SphereGeometry(0.13, 12, 10), P.white, { pos: [s * 0.15, 0.2, -0.9], outline: 0.025 }));
      parts.add(tp(new THREE.SphereGeometry(0.075, 10, 8), INK, { pos: [s * 0.14, 0.19, -1.0] }));
      parts.add(tp(new THREE.SphereGeometry(0.028, 6, 5), P.white, { pos: [s * 0.12, 0.23, -1.07] }));
      parts.add(tp(ellipsoid(0.08, 0.05, 0.03), 0xff8fa8, { pos: [s * 0.25, 0.0, -0.9] }));
      parts.add(tp(tube([s * 0.1, 0.42, -0.78], [s * 0.22, 0.72, -0.95], 0.025, 5), INK));
      parts.add(tp(new THREE.SphereGeometry(0.06, 8, 6), INK, { pos: [s * 0.22, 0.73, -0.96] }));
    });
    parts.add(tp(new THREE.TorusGeometry(0.09, 0.022, 5, 12, Math.PI).rotateZ(Math.PI), INK, { pos: [0, 0.03, -0.98] }));
    parts.add(tp(new THREE.ConeGeometry(0.08, 0.26, 8).rotateX(Math.PI / 2), INK, { pos: [0, 0, 0.84] }));

    const wingMat = own('mat:wing', () => A.mat.toon(0xffffff, { vertexColors: true, transparent: true, opacity: 0.78 }));
    const wings = [-1, 1].map((s) => {
      const pivot = new THREE.Group();
      pivot.position.set(s * 0.16, 0.38, -0.02);
      pivot.rotation.y = s * -0.35;
      const w = paintBy(ellipsoid(0.44, 0.03, 0.26, 14, 8).translate(s * 0.44, 0, 0), (x) => (Math.abs(x) > 0.6 ? 0xbfe6ff : 0xffffff));
      pivot.add(new THREE.Mesh(w, wingMat));
      parts.add(keep(pivot));
      return pivot;
    });
    const welded = finish(parts);
    fly.add(welded);
    const g = new THREE.Group();
    g.add(keep(fly));
    g.add(groundShadow(1.3));
    g.userData = { body: fly, wings, kind: 'bee' };
    return g;
  }

  /* ── Leader Zapper ────────────────────────────────────────────────────────
   * A spiky electric-blue comet orb with ⚡ fins trailing behind and a glowing
   * tail. userData.spin is the orb — spin its rotation.z (the travel axis) so
   * the fins swirl and the tail stays behind.
   */
  function zapper() {
    const orb = new THREE.Group();
    orb.position.y = 1.6;
    const parts = new THREE.Group();
    // One self-lit vertex-colour material for the whole orb, so it glows at
    // night too and still welds into a single mesh.
    const lit = A.mat.toon(0xffffff, { vertexColors: true, emissive: 0x0a1f80, emissiveIntensity: 0.6 });
    const r = U.rng(4077);
    // faceted core in three blues, girdled by a zig-zag lightning belt
    parts.add(A.part(paintFaces(new THREE.IcosahedronGeometry(0.58, 1), (x, y, z) => {
      if (Math.abs(y - 0.2 * Math.sin(Math.atan2(z, x) * 5)) < 0.1) return 0xbff6ff;
      return r.pick([0x2458ff, 0x1a3fd6, 0x3b7bff]);
    }), lit, { outline: 0.05 }));
    // spikes along the icosahedron's twelve vertex directions
    const ico = new THREE.IcosahedronGeometry(1, 0), seen = new Set(), ip = ico.attributes.position;
    for (let i = 0; i < ip.count; i++) {
      const d = [ip.getX(i), ip.getY(i), ip.getZ(i)];
      const key = d.map((v) => v.toFixed(2)).join();
      if (seen.has(key)) continue;
      seen.add(key);
      const spike = paintBy(new THREE.ConeGeometry(0.13, 0.5, 6).rotateX(Math.PI / 2).translate(0, 0, 0.25), (x, y, z) => (z > 0.3 ? P.white : 0x5fe3ff));
      parts.add(A.part(aim(spike, d, [d[0] * 0.46, d[1] * 0.46, d[2] * 0.46]), lit, { outline: 0.03 }));
    }
    ico.dispose();
    // lightning fins, swept back like a shuttlecock's feathers: each bolt
    // lies in a plane through the travel axis and reaches out past the orb's
    // silhouette, so the fins show from in front as well as from behind
    for (let k = 0; k < 3; k++) {
      const fin = A.paint(new THREE.ExtrudeGeometry(shapeOf(BOLT, 0.7, 1.3), { depth: 0.08, bevelEnabled: false }), P.yellow);
      fin.translate(0, 0, -0.04).rotateX(Math.PI / 2).rotateY(0.35).translate(0.95, 0, 0.45).rotateZ(k * TAU / 3 + 0.5);
      parts.add(A.part(fin, lit, { outline: 0.04 }));
    }
    orb.add(finish(parts));
    orb.add(new THREE.Mesh(glowCone(0.5, 2.8, 0x38b6ff), addGlowMat()));
    orb.add(glowPoints([{ pos: [0, 0, 0], color: 0x2f7dff, size: 2.4, alpha: 0.6 }]));
    const g = new THREE.Group();
    g.add(keep(orb));
    g.add(groundShadow(1.5));
    g.userData = { spin: orb, kind: 'zapper' };
    return g;
  }

  /* ── Boom Box ─────────────────────────────────────────────────────────────
   * A retro boombox with speaker "eyes", scowling brows, a carry handle and a
   * lit fuse. userData.fuse is the spark at the fuse tip: flicker its scale.
   */
  function bomb() {
    const g = new THREE.Group();
    const Y = 0.52;
    g.add(vp(paintFaces(roundedBox(1.25, 0.8, 0.52, 0.12, 2), (x, y) => (y < -0.27 ? 0x9e1b22 : 0xd8262e)), { pos: [0, Y, 0], outline: 0.06 }));
    [-1, 1].forEach((s) => {
      const x = s * 0.34;
      g.add(tp(new THREE.TorusGeometry(0.2, 0.055, 8, 22), INK, { pos: [x, Y - 0.05, -0.26] }));
      g.add(tp(new THREE.ConeGeometry(0.19, 0.08, 20).rotateX(-Math.PI / 2), 0x8a90a6, { pos: [x, Y - 0.05, -0.28] }));
      g.add(tp(new THREE.SphereGeometry(0.07, 10, 8), INK, { pos: [x, Y - 0.05, -0.31] }));
      g.add(tp(new THREE.BoxGeometry(0.34, 0.07, 0.06), INK, { pos: [x, Y + 0.24, -0.27], rot: [0, 0, s * 0.35] }));
      g.add(tp(new THREE.CylinderGeometry(0.06, 0.07, 0.12, 8), INK, { pos: [s * 0.48, 0.06, -0.16] }));
      g.add(tp(new THREE.CylinderGeometry(0.06, 0.07, 0.12, 8), INK, { pos: [s * 0.48, 0.06, 0.16] }));
    });
    g.add(tp(new THREE.BoxGeometry(0.3, 0.13, 0.05), P.dark, { pos: [0, Y + 0.16, -0.26] }));
    [-1, 1].forEach((s) => g.add(tp(new THREE.CylinderGeometry(0.035, 0.035, 0.04, 10).rotateX(Math.PI / 2), P.white, { pos: [s * 0.07, Y + 0.16, -0.29] })));
    g.add(tp(new THREE.TorusGeometry(0.4, 0.055, 8, 20, Math.PI), INK, { pos: [0, Y + 0.4, 0] }));
    [-0.1, 0.05, 0.2].forEach((x) => g.add(tp(new THREE.CylinderGeometry(0.045, 0.045, 0.06, 10), P.yellow, { pos: [x, Y + 0.42, -0.14] })));
    const path = new THREE.CatmullRomCurve3([[0.44, Y + 0.38, 0.04], [0.55, Y + 0.6, 0.1], [0.46, Y + 0.8, 0.05], [0.58, Y + 0.92, 0]].map((p) => new THREE.Vector3(p[0], p[1], p[2])));
    g.add(tp(new THREE.TubeGeometry(path, 16, 0.035, 6), 0xd8b27a, { outline: 0.02 }));
    const tip = path.getPoint(1);
    const spark = new THREE.Group();
    spark.position.copy(tip);
    spark.add(new THREE.Mesh(new THREE.ExtrudeGeometry(starShape(0.13, 0.05, 5), { depth: 0.03, bevelEnabled: false }).translate(0, 0, -0.015),
      A.mat.basic(0xffe066)));
    spark.add(glowPoints([{ pos: [0, 0, 0], color: 0xff9d2a, size: 0.75 }]));
    g.add(keep(spark));
    g.add(groundShadow(1.6));
    const out = finish(g);
    out.userData = { fuse: spark, kind: 'bomb' };
    return out;
  }

  /* ── Honk Horn shockwave ──────────────────────────────────────────────────
   * Two rings racing out over the road and a fading wall of sound between
   * them. Each wave owns its materials (they fade), so call
   * obj.userData.dispose() when it is done; the geometry is shared.
   */
  const HORN_RADIUS = 8;

  function hornWave() {
    const ringGeo = own('geo:hornRing', () => {
      // hot yellow inside, orange through the middle, a burnt edge for contrast on pale ground
      const geo = new THREE.RingGeometry(0.82, 1, 64, 2).rotateX(-Math.PI / 2);
      return paintBy(geo, (x, y, z) => { const d = Math.hypot(x, z); return d < 0.86 ? 0xffe14d : (d < 0.95 ? 0xff7a00 : 0x9a2e00); });
    });
    const bandGeo = own('geo:hornBand', () => {
      const geo = new THREE.CylinderGeometry(1, 1, 1, 64, 1, true).translate(0, 0.5, 0);
      const p = geo.attributes.position, col = new Float32Array(p.count * 4);
      for (let i = 0; i < p.count; i++) {
        const up = p.getY(i);
        col[i * 4] = 1; col[i * 4 + 1] = 0.55 + 0.4 * up; col[i * 4 + 2] = 0.08 + 0.5 * up; col[i * 4 + 3] = 0.8 * (1 - up);
      }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
      return geo;
    });
    const ringMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const bandMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    ringMat.forceSinglePass = bandMat.forceSinglePass = true;
    const g = new THREE.Group();
    const ring = new THREE.Mesh(ringGeo, ringMat), echo = new THREE.Mesh(ringGeo, ringMat), band = new THREE.Mesh(bandGeo, bandMat);
    ring.position.y = echo.position.y = 0.12;
    ring.renderOrder = echo.renderOrder = band.renderOrder = 4;
    g.add(ring, echo, band);
    g.userData = {
      kind: 'hornWave', ring, echo, band, ringMat, bandMat,
      dispose() { ringMat.dispose(); bandMat.dispose(); }
    };
    updateHornWave(g, 0);
    return g;
  }

  const easeOut3 = (x) => 1 - Math.pow(1 - clamp01(x), 3);

  /** t01: 0 = the moment of the honk, 1 = gone (the object hides itself). */
  function updateHornWave(obj, t01) {
    const u = obj.userData, t = clamp01(t01);
    const R = 0.8 + easeOut3(t) * (HORN_RADIUS - 0.8);
    const R2 = 0.8 + easeOut3((t - 0.18) / 0.82) * (HORN_RADIUS * 0.8 - 0.8);
    u.ring.scale.set(R, 1, R);
    u.echo.scale.set(R2, 1, R2);
    u.echo.visible = t > 0.18;
    u.band.scale.set(R * 0.985, 0.4 + 2.2 * Math.sin(Math.PI * Math.min(1, t * 1.4)), R * 0.985);
    u.ringMat.opacity = 1 - t * t;
    u.bandMat.opacity = 0.8 * Math.pow(1 - t, 1.2);
    obj.visible = t < 1;
  }

  /* ── Super Star aura ──────────────────────────────────────────────────────
   * A rainbow rim bubble round a 2.8 m kart plus orbiting twinkles.
   * Call userData.update(t) every frame with the race clock in seconds.
   */
  function starAura() {
    const g = new THREE.Group();
    const shell = new THREE.Mesh(bake(new THREE.SphereGeometry(1, 36, 24), [0, 0.85, 0], null, [1.6, 1.25, 2.05]), auraMaterial());
    shell.renderOrder = 5;
    g.add(shell);
    const r = U.rng(99), list = [];
    for (let i = 0; i < 36; i++) {
      const a = r.range(0, TAU), y = r.range(-0.8, 0.9), k = Math.sqrt(1 - y * y * 0.8);
      list.push({ pos: [Math.sin(a) * 1.7 * k, 0.85 + y * 1.3, Math.cos(a) * 2.1 * k], color: r.pick([0xffffff, 0xfff27a, 0xff9ee6, 0x9ef3ff]), size: r.range(0.35, 0.6), shape: 3, spin: r.range(0, TAU) });
    }
    const glints = glowPoints(list);
    g.add(glints);
    const sizes = glints.geometry.attributes.aSize, base = Float32Array.from(sizes.array);
    const mat = auraMaterial();
    g.userData = {
      kind: 'starAura',
      update(t) {
        mat.uniforms.uTime.value = t;
        mat.uniformsNeedUpdate = true;
        glints.rotation.y = t * 1.6;
        for (let i = 0; i < base.length; i++) sizes.array[i] = base[i] * (0.35 + 0.65 * Math.abs(Math.sin(t * 5 + i * 1.7)));
        sizes.needsUpdate = true;
      }
    };
    return g;
  }

  /* ── Jet Mode casing ──────────────────────────────────────────────────────
   * A shiny white jet pod that swallows a 2.8 m kart: a squashed
   * super-ellipsoid, open on top with a glass canopy so the driver still
   * shows, swept wings, a low V-tail (a tall fin would block the chase camera)
   * and an afterburner. userData.flames is the flame cone: flicker its scale.
   */
  function jetShell() {
    const g = new THREE.Group();
    const RX = 1.45, RY = 0.92, RZ = 2.2, PW = 2.6, CY = 0.78;
    const WHITE = 0xf4f6fb, RED = P.red, BLUE = P.blue;
    const pod = new THREE.SphereGeometry(1, 48, 24, 0, TAU, 0.62, Math.PI - 0.62);
    const pa = pod.attributes.position;
    // Paint by the unit-sphere position (kept aside before shaping): the
    // sphere's rows are lines of latitude there, so stripes come out straight.
    pod.setAttribute('unit', pa.clone());
    for (let i = 0; i < pa.count; i++) {
      const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i);
      const k = Math.pow(Math.pow(Math.abs(x / RX), PW) + Math.pow(Math.abs(y / RY), PW) + Math.pow(Math.abs(z / RZ), PW), -1 / PW);
      const pz = z * k, tz = pz / RZ;
      const taper = tz < 0 ? 1 - 0.42 * tz * tz : 1 - 0.28 * tz * tz;
      pa.setXYZ(i, x * k * taper, y * k * (tz < 0 ? 1 - 0.3 * tz * tz : 1 - 0.1 * tz * tz) + CY, pz);
    }
    pod.computeVertexNormals();
    const shiny = own('mat:phongV', () => new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 60, specular: 0x6a6a6a }));
    const podP = paintFaces(pod, (ux, uy) => {
      if (uy > 0.74) return 0x2b2d42;                          // cockpit rim
      if (Math.abs(uy) < 0.11 && Math.abs(ux) > 0.3) return BLUE;   // speed stripe
      if (uy < -0.55) return 0xd4d9e6;                         // belly
      return WHITE;
    }, 'unit');
    podP.deleteAttribute('unit');
    g.add(A.part(podP, shiny, { outline: 0.05 }));
    // red nose cone on a red collar: a separate part, so its edge is a clean circle
    // (its base sits where the pod narrows to the cone's radius, ~0.3 m behind the pod tip)
    g.add(A.part(paintBy(new THREE.ConeGeometry(0.62, 0.95, 24).rotateX(-Math.PI / 2), () => RED), shiny, { pos: [0, CY - 0.02, -RZ - 0.185], outline: 0.04 }));
    g.add(A.part(paintBy(new THREE.TorusGeometry(0.62, 0.08, 8, 24), () => RED), shiny, { pos: [0, CY - 0.02, -RZ + 0.29] }));
    [-1, 1].forEach((s) => {
      const sh = new THREE.Shape();
      sh.moveTo(0, -0.45); sh.lineTo(s * 1.35, 0.7); sh.lineTo(s * 1.35, 1.2); sh.lineTo(0, 0.95); sh.closePath();
      const wing = new THREE.ExtrudeGeometry(sh, { depth: 0.1, bevelEnabled: false }).rotateX(Math.PI / 2).translate(s * 1.1, CY, 0);
      g.add(A.part(paintFaces(wing, (x) => (Math.abs(x) > 2.05 ? RED : WHITE)), shiny, { outline: 0.035 }));
      const fin = new THREE.Shape();
      fin.moveTo(0.95, 0); fin.lineTo(1.75, 0); fin.lineTo(1.95, 0.55); fin.lineTo(1.6, 0.55); fin.closePath();
      const f = new THREE.ExtrudeGeometry(fin, { depth: 0.08, bevelEnabled: false }).rotateY(-Math.PI / 2);
      bake(f, [s * 0.62, CY + 0.52, 0], [0, 0, s * -0.45]);
      g.add(A.part(paintBy(f, () => RED), shiny, { outline: 0.03 }));
    });
    g.add(A.part(paintBy(new THREE.CylinderGeometry(0.5, 0.6, 0.45, 20, 1, true).rotateX(Math.PI / 2), () => 0x4a4f63), shiny, { pos: [0, CY, RZ + 0.05] }));
    const canopy = own('mat:canopy', () => new THREE.MeshPhongMaterial({ color: 0x7fdcff, transparent: true, opacity: 0.32, shininess: 120, specular: 0xffffff, depthWrite: false }));
    g.add(A.part(bake(new THREE.SphereGeometry(1, 24, 12, 0, TAU, 0, Math.PI / 2), [0, CY + 0.72, 0.1], null, [0.74, 0.62, 0.95]), canopy));
    const flame = new THREE.Mesh(glowCone(0.44, 1.9, 0xff9a2e), addGlowMat());
    flame.position.set(0, CY, RZ + 0.25);
    g.add(keep(flame));
    const out = finish(g);
    out.userData = { flames: flame, kind: 'jetShell' };
    return out;
  }

  /* ── Shrink puff ──────────────────────────────────────────────────────────
   * A lilac poof. userData.update(t01): 0 = the moment of shrinking, 1 =
   * gone. Owns its material (it fades): call userData.dispose() after.
   */
  function shrinkPuff() {
    const r = U.rng(314);
    const geos = [];
    for (let i = 0; i < 9; i++) {
      const a = i / 9 * TAU, rad = r.range(0.34, 0.58);
      geos.push(A.paint(new THREE.IcosahedronGeometry(rad, 2).translate(Math.cos(a) * 0.72, 0.62 + r.range(-0.22, 0.3), Math.sin(a) * 0.72), r.pick([0xa66cff, 0xff7fd0, 0xffffff, 0x8f5cff])));
    }
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * TAU + 0.3;
      geos.push(A.paint(new THREE.ShapeGeometry(starShape(0.24, 0.08, 4)).translate(Math.cos(a) * 1.25, 0.9 + r.range(-0.3, 0.5), Math.sin(a) * 1.25), 0xffe14d));
    }
    // a little self-light keeps the poof candy-bright rather than grey in shade
    const mat = A.mat.toon(0xffffff, { vertexColors: true, transparent: true, depthWrite: false, side: 'double', emissive: 0x3a1a5a }).clone();
    mat.forceSinglePass = true;          // a transparent double-sided material otherwise draws twice
    const puff = new THREE.Mesh(concat(geos), mat);
    const g = new THREE.Group();
    g.add(puff);
    g.userData = {
      kind: 'shrinkPuff',
      update(t01) {
        const t = clamp01(t01);
        puff.scale.setScalar(0.45 + (1 - Math.pow(1 - t, 3)));
        puff.rotation.y = t * 2.2;
        mat.opacity = t < 0.15 ? 1 : Math.max(0, 1 - (t - 0.15) / 0.85);
        g.visible = t < 1;
      },
      dispose() { puff.geometry.dispose(); mat.dispose(); }
    };
    g.userData.update(0);
    return g;
  }

  /* ══ C) Set pieces and shared props ═════════════════════════════════════ */

  /* ── Rescue Drone ─────────────────────────────────────────────────────────
   * Origin = where a carried kart's origin hangs, so the race can put the
   * drone exactly at the kart it is rescuing; the body flies 3.4 m above.
   * userData.props: the four propellers (spin rotation.y). userData.claw:
   * the gripper; userData.setClaw(open01) swings its arms (0 = gripping a
   * kart's sides, 1 = wide open).
   */
  const DRONE_BODY_Y = 3.4;

  function drone() {
    const HB = DRONE_BODY_Y;
    const g = new THREE.Group();
    g.add(vp(paintFaces(bake(new THREE.SphereGeometry(1, 28, 18), [0, HB, 0], null, [1.18, 0.8, 1.05]), (x, y) => (y < HB - 0.28 ? P.white : 0xf2a300)), { outline: 0.07 }));
    [-1, 1].forEach((s) => {
      g.add(tp(ellipsoid(0.3, 0.36, 0.16).translate(s * 0.4, HB + 0.1, -0.9), P.white, { outline: 0.035 }));
      g.add(tp(ellipsoid(0.16, 0.19, 0.08).translate(s * 0.37, HB + 0.06, -1.03), INK));
      g.add(tp(new THREE.SphereGeometry(0.055, 8, 6).translate(s * 0.31, HB + 0.15, -1.1), P.white));
      g.add(tp(ellipsoid(0.13, 0.08, 0.05).translate(s * 0.7, HB - 0.12, -0.78), 0xff8fa8));
    });
    g.add(tp(new THREE.TorusGeometry(0.15, 0.035, 6, 14, Math.PI).rotateZ(Math.PI).translate(0, HB - 0.14, -0.99), INK));
    g.add(A.part(new THREE.SphereGeometry(0.2, 12, 8, 0, TAU, 0, Math.PI / 2), A.mat.glow(0xd81c0c, 1.2), { pos: [0, HB + 0.77, 0] }));
    g.add(tp(new THREE.CylinderGeometry(0.26, 0.28, 0.1, 14), INK, { pos: [0, HB + 0.77, 0] }));

    const props = [];
    [[-1.65, -1.4], [1.65, -1.4], [-1.65, 1.4], [1.65, 1.4]].forEach((pp) => {
      const px = pp[0], pz = pp[1];
      g.add(tp(span(new THREE.CylinderGeometry(0.12, 0.14, 1, 8), [px * 0.45, HB + 0.05, pz * 0.45], [px, HB + 0.2, pz]), P.dark));
      g.add(tp(new THREE.CylinderGeometry(0.27, 0.31, 0.44, 14), P.red, { pos: [px, HB + 0.22, pz], outline: 0.035 }));
      g.add(tp(new THREE.TorusGeometry(0.82, 0.075, 6, 32).rotateX(Math.PI / 2), P.white, { pos: [px, HB + 0.42, pz], outline: 0.03 }));
      [0.8, 0.8 + Math.PI].forEach((a) => g.add(tp(bar([px, HB + 0.3, pz], [px + Math.cos(a) * 0.8, HB + 0.42, pz + Math.sin(a) * 0.8], 0.07), P.dark)));
      const prop = tp(concat([new THREE.BoxGeometry(1.38, 0.04, 0.2), new THREE.CylinderGeometry(0.09, 0.09, 0.12, 10)]), 0x3b3f58, { pos: [px, HB + 0.5, pz] });
      g.add(keep(prop));
      props.push(prop);
    });

    g.add(tp(new THREE.CylinderGeometry(0.13, 0.13, 0.7, 10), P.steel, { pos: [0, HB - 0.95, 0] }));
    g.add(tp(roundedBox(1.0, 0.32, 0.56, 0.08, 1), P.dark, { pos: [0, HB - 1.3, 0], outline: 0.04 }));
    const claw = new THREE.Group();
    const arms = [-1, 1].map((s) => {
      const pivot = new THREE.Group();
      pivot.position.set(s * 0.42, HB - 1.32, 0);
      const armParts = new THREE.Group();
      armParts.add(tp(bar([0, 0, 0], [s * 0.9, -0.28, 0], 0.2, 0.34), P.dark));
      armParts.add(tp(bar([s * 0.9, -0.28, 0], [s * 0.93, -1.45, 0], 0.2, 0.34), P.dark));
      armParts.add(tp(bar([s * 0.93, -1.45, 0], [s * 0.66, -1.6, 0], 0.2, 0.34), P.yellow));
      armParts.add(tp(new THREE.SphereGeometry(0.15, 10, 8), P.steel, { pos: [s * 0.9, -0.28, 0] }));
      armParts.add(tp(new THREE.SphereGeometry(0.14, 10, 8), P.steel, { pos: [s * 0.93, -1.45, 0] }));
      pivot.add(finish(armParts));
      claw.add(pivot);
      return pivot;
    });
    g.add(keep(claw));

    const setClaw = (open01) => { arms[0].rotation.z = -clamp01(open01) * 0.55; arms[1].rotation.z = clamp01(open01) * 0.55; };
    g.userData = { props, claw, clawArms: arms, setClaw, bodyY: HB, kind: 'drone' };
    return finish(g);
  }

  /* ── Start / finish gantry ────────────────────────────────────────────────
   * Spans the road (width = clear span between the pillars). The karts come
   * from +Z, so the lights face both ways and each face fills from its own
   * viewer's left. userData.setLights(n): 3/2/1 = that many red lights lit,
   * 0 = all four green (GO), -1 = all off. One draw call lights all eight
   * lenses (vertex colours) and one more draws their halos.
   */
  const LIGHT_X = [-1.95, -0.65, 0.65, 1.95];
  const LIGHT = {
    red: [1.0, 0.05, 0.02], redDim: [0.16, 0.012, 0.01], green: [0.1, 1.0, 0.18], off: [0.035, 0.035, 0.045]
  };

  function startGantry(width) {
    const W = width || 2 * (C.ROAD_HALF + 1.6);
    const H = 7.4, NAVY = 0x243170;
    const g = new THREE.Group();
    const ph = H + 2.2;
    [-1, 1].forEach((s) => {
      const x = s * (W / 2 + 0.8);
      g.add(lp(new THREE.BoxGeometry(2.3, 0.6, 2.3), P.grey, { pos: [x, 0.3, 0], cast: true }));
      g.add(vp(paintFaces(new THREE.BoxGeometry(1.4, ph, 1.4, 1, 12, 1), (cx, cy) => {
        const row = Math.floor((cy + ph / 2) / (ph / 12));
        return row === 2 || row === 3 ? P.yellow : NAVY;
      }), { pos: [x, ph / 2, 0], outline: 0.06, cast: true }));
      g.add(vp(paintFaces(new THREE.BoxGeometry(1.7, 1.7, 1.7, 4, 4, 4), (cx, cy, cz) => {
        const k = Math.floor(cx / 0.425 + 8) + Math.floor(cy / 0.425 + 8) + Math.floor(cz / 0.425 + 8);
        return k % 2 ? INK : P.white;
      }), { pos: [x, ph + 0.85, 0], outline: 0.05, cast: true }));
      g.add(tp(new THREE.CylinderGeometry(0.06, 0.06, 2.4, 6), P.steel, { pos: [x, ph + 2.9, 0], cast: true }));
      [0, Math.PI].forEach((ry) => g.add(vp(paintFaces(bake(new THREE.PlaneGeometry(1.6, 1.0, 4, 3), [s * 0.8, 0, 0], [0, ry, 0]), (fx, fy) => {
        return (Math.floor((fx + 3.2) / 0.4) + Math.floor((fy + 1.5) / 0.3334)) % 2 ? INK : P.white;
      }), { pos: [x, ph + 3.55, 0], cast: true })));
    });
    g.add(tp(new THREE.BoxGeometry(W + 3.4, 1.9, 1.1), NAVY, { pos: [0, H + 0.95, 0], outline: 0.06, cast: true }));
    g.add(tp(new THREE.BoxGeometry(W + 3.6, 0.28, 1.35), P.yellow, { pos: [0, H + 2.0, 0], cast: true }));
    g.add(tp(new THREE.BoxGeometry(W + 3.6, 0.2, 1.3), P.yellow, { pos: [0, H - 0.05, 0], cast: true }));
    const bannerMat = A.mat.basic(0xffffff, { map: bannerTex() });
    [1, -1].forEach((f) => {
      const p = new THREE.PlaneGeometry(W + 2.2, 1.45);
      if (f < 0) p.rotateY(Math.PI);
      g.add(A.part(p, bannerMat, { pos: [0, H + 0.95, f * 0.56] }));
    });

    const LY = H - 1.6;
    [-1.8, 1.8].forEach((x) => g.add(tp(new THREE.BoxGeometry(0.22, 1.0, 0.22), P.dark, { pos: [x, H - 0.45, 0], cast: true })));
    g.add(tp(roundedBox(5.7, 1.5, 0.95, 0.2, 2), 0x1b1c2c, { pos: [0, LY, 0], outline: 0.05, cast: true }));
    const discs = [];
    [1, -1].forEach((f) => LIGHT_X.forEach((lx) => {
      g.add(tp(new THREE.TorusGeometry(0.5, 0.06, 6, 24).translate(0, 0, f * 0.5), P.steel, { pos: [lx, LY, 0], cast: true }));
      g.add(tp(new THREE.BoxGeometry(1.04, 0.12, 0.42), P.dark, { pos: [lx, LY + 0.56, f * 0.66], cast: true }));
      const d = new THREE.CircleGeometry(0.46, 20);
      if (f < 0) d.rotateY(Math.PI);
      discs.push(d.translate(lx, LY, f * 0.53));
    }));
    const perDisc = 20 * 3;
    const lensGeo = concat(discs);
    const lensCol = new Float32Array(lensGeo.attributes.position.count * 3);
    lensGeo.setAttribute('color', new THREE.BufferAttribute(lensCol, 3));
    const fall = new Float32Array(lensGeo.attributes.position.count);
    const lp3 = lensGeo.attributes.position;
    for (let i = 0; i < lp3.count; i++) {
      const k = Math.floor(i / perDisc), lx = LIGHT_X[k % 4];
      fall[i] = 1 - Math.min(1, Math.hypot(lp3.getX(i) - lx, lp3.getY(i) - LY) / 0.46);
    }
    const lens = new THREE.Mesh(lensGeo, own('mat:lens', () => new THREE.MeshBasicMaterial({ vertexColors: true })));
    g.add(keep(lens));
    // Halos are soft glow decals on each face of the pod rather than sprites:
    // a decal only shows from its own side, so a light lit for the grid can
    // never glow through the housing at the other face. Normal blending keeps
    // red red against a bright sky (additive red on blue turns pink).
    const quads = [];
    [1, -1].forEach((f) => LIGHT_X.forEach((lx) => {
      const q = new THREE.PlaneGeometry(1.9, 1.9);
      if (f < 0) q.rotateY(Math.PI);
      quads.push(q.translate(lx, LY, f * 0.6));
    }));
    const haloGeo = concat(quads);
    const perQuad = 6;
    const haloCol = new Float32Array(haloGeo.attributes.position.count * 4);
    haloGeo.setAttribute('color', new THREE.BufferAttribute(haloCol, 4));
    const halo = new THREE.Mesh(haloGeo, own('mat:lensHalo', () => new THREE.MeshBasicMaterial({
      map: A.tex.glowSprite(), vertexColors: true, transparent: true, depthWrite: false
    })));
    halo.renderOrder = 3;
    g.add(keep(halo));

    function setLights(n) {
      for (let k = 0; k < 8; k++) {
        const face = k < 4 ? 0 : 1, i = k % 4;
        const slot = face ? 3 - i : i;
        let base, lit = true;
        if (n === 0) base = LIGHT.green;
        else if (n > 0 && slot < n) base = LIGHT.red;
        else { base = n > 0 ? LIGHT.redDim : LIGHT.off; lit = false; }
        for (let v = k * perDisc; v < (k + 1) * perDisc; v++) {
          // a lit lens keeps its colour and burns a little paler at the centre
          const f = fall[v], hot = lit ? f * f * 0.32 : 0, dim = 0.6 + 0.4 * f;
          lensCol[v * 3] = base[0] * dim * (1 - hot) + hot;
          lensCol[v * 3 + 1] = base[1] * dim * (1 - hot) + hot;
          lensCol[v * 3 + 2] = base[2] * dim * (1 - hot) + hot;
        }
        for (let v = k * perQuad; v < (k + 1) * perQuad; v++) {
          haloCol[v * 4] = base[0]; haloCol[v * 4 + 1] = base[1]; haloCol[v * 4 + 2] = base[2];
          haloCol[v * 4 + 3] = lit ? 0.75 : 0;
        }
      }
      lensGeo.attributes.color.needsUpdate = true;
      haloGeo.attributes.color.needsUpdate = true;
      out.userData.lights = n;
    }
    g.userData = { setLights, lights: -1, kind: 'startGantry', width: W };
    const out = finish(g);
    setLights(-1);
    return out;
  }

  /* ── Podium ───────────────────────────────────────────────────────────────
   * Faces -Z (the camera stands at -Z): 2nd on the viewer's left (+X), 3rd on
   * the right. userData.spots = top-centre points for 1st, 2nd and 3rd.
   */
  function podium() {
    const g = new THREE.Group();
    const BASE = 0.35;
    const STEPS = [
      { place: 1, x: 0, h: 1.9, col: 0xe3a400 },
      { place: 2, x: 3.95, h: 1.3, col: 0xb4bfd2 },
      { place: 3, x: -3.95, h: 0.85, col: 0xc0702c }
    ];
    g.add(tp(roundedBox(12.6, BASE, 5.4, 0.1, 1), 0x27306a, { pos: [0, BASE / 2, 0], outline: 0.05, cast: true }));
    g.add(tp(new THREE.BoxGeometry(12.2, 0.08, 0.06), P.yellow, { pos: [0, BASE * 0.55, -2.71], cast: true }));
    const numMat = A.mat.basic(0xffffff, { map: podiumTex(), transparent: true });
    const spots = [];
    STEPS.forEach((st) => {
      g.add(tp(roundedBox(3.8, st.h, 3.8, 0.14, 2), st.col, { pos: [st.x, BASE + st.h / 2, 0], outline: 0.06, cast: true }));
      g.add(tp(new THREE.BoxGeometry(3.4, 0.05, 3.4), 0xc81d25, { pos: [st.x, BASE + st.h + 0.02, 0], cast: true }));
      const size = Math.min(1.6, st.h * 0.82);
      const plane = new THREE.PlaneGeometry(size, size).rotateY(Math.PI);
      const uv = plane.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setX(i, (st.place - 1 + uv.getX(i)) / 3);
      g.add(A.part(plane, numMat, { pos: [st.x, BASE + st.h / 2, -1.92] }));
      spots[st.place - 1] = new THREE.Vector3(st.x, BASE + st.h + 0.05, 0);
    });
    g.userData = { spots, kind: 'podium' };
    return finish(g);
  }

  /* ── Trophies ─────────────────────────────────────────────────────────── */
  const METAL = { gold: 0xffc93c, silver: 0xd9dee8, bronze: 0xd48a4c };

  function metalMat(kind) {
    return own('mat:metal|' + kind, () => new THREE.MeshStandardMaterial({ color: METAL[kind], metalness: 1, roughness: 0.28, envMap: envCube(), envMapIntensity: 1.3 }));
  }

  function trophy(kind) {
    if (!METAL[kind]) kind = 'gold';
    const g = new THREE.Group();
    const metal = metalMat(kind);
    const prof = [[0, 0], [0.3, 0], [0.3, 0.07], [0.22, 0.11], [0.09, 0.2], [0.07, 0.34], [0.13, 0.4], [0.07, 0.46], [0.1, 0.53],
      [0.3, 0.64], [0.4, 0.82], [0.44, 1.0], [0.4, 1.02], [0.36, 0.84], [0.26, 0.68], [0.05, 0.6], [0, 0.6]];
    g.add(A.part(new THREE.LatheGeometry(prof.map((p) => new THREE.Vector2(p[0], p[1])), 36), metal, { pos: [0, 0.36, 0], outline: 0.025 }));
    // ear handles: out of the wall below the rim, round, and back into the bowl
    [-1, 1].forEach((s) => {
      const ear = new THREE.CatmullRomCurve3([[0.38, 1.24], [0.6, 1.2], [0.66, 1.02], [0.46, 0.9], [0.24, 0.98]]
        .map((p) => new THREE.Vector3(s * p[0], p[1], 0)));
      g.add(A.part(new THREE.TubeGeometry(ear, 20, 0.045, 8), metal, { outline: 0.02 }));
    });
    g.add(tp(roundedBox(0.78, 0.36, 0.78, 0.05, 1), P.dark, { pos: [0, 0.18, 0], outline: 0.025 }));
    g.add(A.part(new THREE.BoxGeometry(0.42, 0.14, 0.02), metal, { pos: [0, 0.18, -0.4] }));
    g.userData = { kind: 'trophy', metal: kind };
    return finish(g);
  }

  /* ── Glider wing ──────────────────────────────────────────────────────────
   * A striped hang-glider sail on a mast, origin at the mount point (the
   * roster fixes that to the kart). The sail is a billowed delta: every
   * point is a blend between the leading-edge spar and the trailing edge.
   */
  function glider(colorHex) {
    const col = colorHex === undefined || colorHex === null ? P.red : A.norm(colorHex);
    const H = 1.15;
    const N = [0, H + 0.05, -1.35], LT = [-2.8, H - 0.12, 0.95], RT = [2.8, H - 0.12, 0.95], K = [0, H + 0.12, 1.1];
    const NU = 16, NV = 6, verts = [], cols = [];
    const stripe = [col, P.white, col, P.yellow];
    const at = (u, v) => {
      const tip = u < 0 ? LT : RT, au = Math.abs(u);
      const le = [N[0] + (tip[0] - N[0]) * au, N[1] + (tip[1] - N[1]) * au, N[2] + (tip[2] - N[2]) * au];
      const te = [K[0] + (tip[0] - K[0]) * au, K[1] + (tip[1] - K[1]) * au, K[2] + (tip[2] - K[2]) * au];
      const billow = 0.2 * Math.sin(Math.PI * v) * (1 - au * au);
      return [le[0] + (te[0] - le[0]) * v, le[1] + (te[1] - le[1]) * v + billow, le[2] + (te[2] - le[2]) * v];
    };
    for (let i = 0; i < NU; i++) {
      const u0 = -1 + 2 * i / NU, u1 = -1 + 2 * (i + 1) / NU;
      // stripes mirror about the keel: body colour in the middle, yellow tips
      _col.set(stripe[Math.min(3, Math.floor(Math.abs(u0 + u1) * 2))]);
      for (let j = 0; j < NV; j++) {
        const v0 = j / NV, v1 = (j + 1) / NV;
        const a = at(u0, v0), b = at(u1, v0), c = at(u1, v1), d = at(u0, v1);
        verts.push(...a, ...c, ...b, ...a, ...d, ...c);
        for (let k = 0; k < 6; k++) cols.push(_col.r, _col.g, _col.b);
      }
    }
    const sail = new THREE.BufferGeometry();
    sail.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    sail.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    sail.computeVertexNormals();
    const g = new THREE.Group();
    g.add(A.part(sail, A.mat.toon(0xffffff, { vertexColors: true, side: 'double' })));
    const spar = (a, b, r) => g.add(tp(tube(a, b, r || 0.05, 6), INK));
    spar(N, LT, 0.06); spar(N, RT, 0.06); spar(N, K);
    spar(LT, K, 0.03); spar(RT, K, 0.03);
    const xa = at(-0.55, 0.3), xb = at(0.55, 0.3);
    spar(xa, xb, 0.045);
    spar([0, 0, 0], [0, H, 0.05], 0.06);
    spar([0, 0.35, 0], xa, 0.035); spar([0, 0.35, 0], xb, 0.035);
    g.userData = { kind: 'glider' };
    return finish(g);
  }

  /* ── Shared trackside props ───────────────────────────────────────────────
   * NK.art.props[name](rng) → Object3D, origin on the ground, fronts facing
   * -Z: yaw a grandstand, billboard or pit building so -Z points at the road.
   * balloon_arch spans the road like the start gantry (place it at x = 0).
   * Structures cast shadows; nothing here is outlined (nothing to react to)
   * except the traffic cone, which can sit right on the verge.
   */
  const TEAMS = [[P.red, P.white], [P.blue, P.yellow], [P.green, P.white], [P.violet, P.yellow], [P.orange, P.blue]];

  /** One blobby spectator, added as painted geometries to `out`. */
  function spectator(out, x, y, z, r) {
    const col = r.pick(PARTY), t = r.range(0.9, 1.15);
    out.push(A.paint(ellipsoid(0.27, 0.34 * t, 0.23, 7, 5).translate(x, y + 0.34 * t, z), col));
    out.push(A.paint(new THREE.IcosahedronGeometry(0.21, 0).translate(x, y + 0.8 * t, z - 0.02), col));
    [-1, 1].forEach((s) => out.push(A.paint(new THREE.OctahedronGeometry(0.055, 0).translate(x + s * 0.08, y + 0.84 * t, z - 0.2), P.white)));
    if (r.chance(0.5)) {
      [-1, 1].forEach((s) => out.push(A.paint(tube([x + s * 0.22, y + 0.5 * t, z], [x + s * 0.36, y + 1.05 * t, z - 0.06], 0.06, 5), col)));
    }
    if (r.chance(0.12)) {
      out.push(A.paint(tube([x + 0.3, y + 0.4, z], [x + 0.3, y + 1.7, z], 0.025, 4), P.dark));
      const flag = new THREE.BufferGeometry();
      flag.setAttribute('position', new THREE.Float32BufferAttribute([x + 0.3, y + 1.7, z, x + 0.3, y + 1.35, z, x + 0.85, y + 1.52, z, x + 0.3, y + 1.7, z, x + 0.85, y + 1.52, z, x + 0.3, y + 1.35, z], 3));
      flag.computeVertexNormals();
      out.push(A.paint(flag, r.pick(PARTY)));
    }
  }

  function grandstand(rng) {
    const r = rngOf(rng);
    const L = 20, TIERS = 5, TD = 1.35, RISE = 0.7, FRONT = 1.3;
    const topY = FRONT + (TIERS - 1) * RISE, depth = TIERS * TD, roofY = topY + 3.6;
    const team = r.pick(TEAMS);
    const g = new THREE.Group();
    const CAST = { cast: true };
    g.add(lp(new THREE.BoxGeometry(L, FRONT, 0.4), P.white, Object.assign({ pos: [0, FRONT / 2, -0.2] }, CAST)));
    for (let i = 0; i < TIERS; i++) {
      const h = FRONT + i * RISE;
      g.add(lp(new THREE.BoxGeometry(L, h, TD), i % 2 ? 0xa9afc2 : 0xb9bfd0, Object.assign({ pos: [0, h / 2, i * TD + TD / 2] }, CAST)));
    }
    g.add(lp(new THREE.BoxGeometry(L + 0.4, roofY, 0.4), team[0], Object.assign({ pos: [0, roofY / 2, depth + 0.2] }, CAST)));
    [-1, 1].forEach((s) => {
      const side = new THREE.Shape();
      side.moveTo(-0.4, 0); side.lineTo(-0.4, FRONT + 0.5); side.lineTo(depth, topY + 1.2); side.lineTo(depth + 0.4, roofY); side.lineTo(depth + 0.4, 0); side.closePath();
      g.add(lp(new THREE.ExtrudeGeometry(side, { depth: 0.4, bevelEnabled: false }).rotateY(-Math.PI / 2), team[0], Object.assign({ pos: [s * (L / 2 + 0.2) + 0.2, 0, 0] }, CAST)));
    });
    g.add(lp(new THREE.BoxGeometry(L + 1.2, 0.35, depth + 2.4), team[1], Object.assign({ pos: [0, roofY + 0.25, depth / 2 - 0.5], rot: [-0.07, 0, 0] }, CAST)));
    for (let k = 0; k < 5; k++) {
      const x = -L / 2 + 1 + k * (L - 2) / 4;
      g.add(lp(tube([x, FRONT, -0.2], [x, roofY, -0.2], 0.12, 8), P.steel, CAST));
    }
    for (let k = 0; k < 26; k++) {
      const x = -L / 2 - 0.4 + (k + 0.5) * (L + 0.8) / 26;
      g.add(lp(new THREE.ConeGeometry(0.42, 0.7, 3).rotateX(Math.PI), k % 2 ? team[0] : P.white, Object.assign({ pos: [x, roofY + 0.2 - 0.55, -1.72], rot: [0, Math.PI / 6, 0] }, CAST)));
    }
    const crowdA = [], crowdB = [];
    for (let i = 0; i < TIERS; i++) {
      const y = FRONT + i * RISE, z = i * TD + TD * 0.45;
      for (let k = 0; k < 21; k++) {
        const x = -L / 2 + 0.75 + k * ((L - 1.5) / 20);
        g.add(lp(new THREE.BoxGeometry(0.72, 0.26, 0.5), (i + k) % 2 ? team[0] : team[1], Object.assign({ pos: [x, y + 0.13, z] }, CAST)));
        if (r.chance(0.86)) spectator((i + k) % 2 ? crowdA : crowdB, x + r.range(-0.08, 0.08), y + 0.26, z - 0.05, r);
      }
    }
    const crowds = [crowdA, crowdB].map((list) => keep(new THREE.Mesh(concat(list), A.mat.toonV())));
    crowds.forEach((m) => g.add(m));
    const banner = new THREE.PlaneGeometry(L - 1.5, 0.9).rotateY(Math.PI);
    g.add(A.part(banner, A.mat.basic(0xffffff, { map: bannerTex() }), { pos: [0, FRONT * 0.52, -0.41] }));
    g.userData = {
      kind: 'grandstand',
      /** Crowd bounce; optional, costs nothing if never called. */
      anim(t) { crowds[0].position.y = Math.abs(Math.sin(t * 4.2)) * 0.07; crowds[1].position.y = Math.abs(Math.sin(t * 4.2 + 1.3)) * 0.07; }
    };
    return finish(g);
  }

  function billboard(rng, text2) {
    const r = rngOf(rng);
    const scheme = r.int(0, BILL_SCHEMES.length - 1);
    const line2 = text2 === undefined ? r.pick(SLOGANS) : text2;
    const BW = 9.2, BH = 4.1, Y0 = 2.6;
    const g = new THREE.Group();
    [-1, 1].forEach((s) => {
      g.add(lp(new THREE.BoxGeometry(0.4, Y0 + BH * 0.5, 0.4), P.dark, { pos: [s * 3.2, (Y0 + BH * 0.5) / 2, 0.3], cast: true }));
      g.add(lp(new THREE.BoxGeometry(1.0, 0.3, 1.0), P.grey, { pos: [s * 3.2, 0.15, 0.3], cast: true }));
      g.add(lp(bar([s * 3.2, 0.8, 0.3], [s * 1.2, Y0 + 0.2, 0.3], 0.18), P.dark, { cast: true }));
    });
    g.add(lp(new THREE.BoxGeometry(BW + 0.5, BH + 0.5, 0.36), P.dark, { pos: [0, Y0 + BH / 2, 0], cast: true }));
    const signMat = A.mat.basic(0xffffff, { map: billboardTex(line2, scheme) });
    g.add(A.part(new THREE.PlaneGeometry(BW, BH).rotateY(Math.PI), signMat, { pos: [0, Y0 + BH / 2, -0.19] }));
    g.add(A.part(new THREE.PlaneGeometry(BW, BH), signMat, { pos: [0, Y0 + BH / 2, 0.19] }));
    g.userData = { kind: 'billboard', text: line2 };
    return finish(g);
  }

  function balloonArch(rng, width) {
    const r = rngOf(rng);
    const W = width || 2 * (C.ROAD_HALF + 1.6), H = 9.5;
    const scheme = r.pick([[P.red, P.white, P.blue, P.yellow], [P.pink, P.violet, P.sky, P.white], [P.orange, P.yellow, P.lime, P.teal], [P.red, P.yellow, P.green, P.blue]]);
    const path = [];
    let len = 0;
    for (let i = 0; i <= 240; i++) {
      const th = Math.PI * i / 240, p = [-Math.cos(th) * W / 2, Math.sin(th) * H];
      if (i) len += Math.hypot(p[0] - path[i - 1][0], p[1] - path[i - 1][1]);
      path.push([p[0], p[1], len]);
    }
    const geos = [];
    const STEP = 0.78, n = Math.floor(len / STEP);
    let j = 0;
    for (let k = 0; k <= n; k++) {
      const d = k * len / n;
      while (j < path.length - 2 && path[j + 1][2] < d) j++;
      const a = path[j], b = path[j + 1], f = (d - a[2]) / Math.max(1e-6, b[2] - a[2]);
      const x = a[0] + (b[0] - a[0]) * f, y = a[1] + (b[1] - a[1]) * f;
      const tx = b[0] - a[0], ty = b[1] - a[1], tl = Math.hypot(tx, ty) || 1;
      const nx = -ty / tl, ny = tx / tl;
      for (let q = 0; q < 4; q++) {
        const phi = q * Math.PI / 2 + k * Math.PI / 4;
        const ox = Math.cos(phi) * nx * 0.36, oy = Math.cos(phi) * ny * 0.36, oz = Math.sin(phi) * 0.36;
        geos.push(A.paint(ellipsoid(0.4, 0.45, 0.4, 7, 5).translate(x + ox, y + oy + 0.35, oz), scheme[(k + q) % 4]));
      }
    }
    const g = new THREE.Group();
    g.add(A.part(concat(geos), A.mat.toonV(), { cast: true }));
    [-1, 1].forEach((s) => {
      g.add(lp(new THREE.BoxGeometry(1.6, 0.8, 1.6), P.white, { pos: [s * W / 2, 0.4, 0], cast: true }));
      g.add(lp(new THREE.BoxGeometry(1.7, 0.16, 1.7), scheme[0], { pos: [s * W / 2, 0.84, 0], cast: true }));
    });
    g.userData = { kind: 'balloon_arch', width: W };
    return finish(g);
  }

  function pitBuilding(rng) {
    const r = rngOf(rng);
    const L = 26, D = 9, H = 5.2;
    const team = r.pick(TEAMS);
    const g = new THREE.Group();
    const CAST = { cast: true };
    g.add(lp(new THREE.BoxGeometry(L, H, D), P.white, Object.assign({ pos: [0, H / 2, D / 2] }, CAST)));
    g.add(lp(new THREE.BoxGeometry(L + 0.8, 0.4, D + 0.8), P.grey, Object.assign({ pos: [0, H + 0.2, D / 2] }, CAST)));
    g.add(lp(new THREE.BoxGeometry(L + 0.2, 1.3, 0.3), team[0], Object.assign({ pos: [0, H - 0.65, -0.15] }, CAST)));
    for (let k = 0; k < 4; k++) {
      const bx = -L / 2 + 3.25 + k * 6.5;
      g.add(lp(new THREE.BoxGeometry(5.2, 3.4, 0.2), 0x22243a, Object.assign({ pos: [bx, 1.7, -0.02] }, CAST)));
      // roll-up door, half open: slats in two tones of the team colour
      const slat = shade(A.css(team[1]), -0.2);
      g.add(A.part(paintFaces(new THREE.BoxGeometry(5.0, 1.5, 0.12, 1, 6, 1), (x, y) => (Math.floor((y + 0.75) / 0.25) % 2 ? team[1] : slat)),
        A.mat.lambertV(), Object.assign({ pos: [bx, 2.65, -0.12] }, CAST)));
      if (k) g.add(lp(new THREE.BoxGeometry(0.7, H - 1.3, 0.5), team[0], Object.assign({ pos: [bx - 3.25, (H - 1.3) / 2, -0.1] }, CAST)));
    }
    g.add(lp(new THREE.BoxGeometry(5, 3, 5), P.white, Object.assign({ pos: [L / 2 - 3, H + 1.9, D / 2] }, CAST)));
    g.add(lp(new THREE.BoxGeometry(5.1, 1.2, 5.1), 0x3a78c8, Object.assign({ pos: [L / 2 - 3, H + 2.1, D / 2] }, CAST)));
    g.add(lp(new THREE.BoxGeometry(5.6, 0.3, 5.6), team[0], Object.assign({ pos: [L / 2 - 3, H + 3.55, D / 2] }, CAST)));
    for (let k = 0; k < 13; k++) g.add(lp(new THREE.BoxGeometry(0.1, 0.9, 0.1), P.steel, Object.assign({ pos: [-L / 2 + 0.5 + k * 1.3, H + 0.85, -0.3] }, CAST)));
    g.add(lp(new THREE.BoxGeometry(16.6, 0.1, 0.1), P.steel, Object.assign({ pos: [-L / 2 + 8.3, H + 1.3, -0.3] }, CAST)));
    [-9, -3, 3].forEach((x, i) => {
      g.add(lp(tube([x, H + 0.4, D - 1], [x, H + 4.6, D - 1], 0.07, 6), P.steel, CAST));
      const flag = new THREE.BufferGeometry();
      flag.setAttribute('position', new THREE.Float32BufferAttribute([x, H + 4.6, D - 1, x, H + 3.7, D - 1, x + 1.6, H + 4.15, D - 1, x, H + 4.6, D - 1, x + 1.6, H + 4.15, D - 1, x, H + 3.7, D - 1], 3));
      flag.computeVertexNormals();
      g.add(lp(flag, PARTY[(i * 3 + 1) % PARTY.length], CAST));
    });
    g.add(A.part(new THREE.PlaneGeometry(L - 3, 1.05).rotateY(Math.PI), A.mat.basic(0xffffff, { map: bannerTex() }), { pos: [0, H - 0.65, -0.31] }));
    g.userData = { kind: 'pit_building' };
    return finish(g);
  }

  function trafficCone() {
    const g = new THREE.Group();
    g.add(tp(new THREE.BoxGeometry(0.56, 0.07, 0.56), P.dark, { pos: [0, 0.035, 0] }));
    g.add(vp(paintFaces(new THREE.CylinderGeometry(0.035, 0.25, 0.74, 14, 5), (x, y) => (Math.abs(y) < 0.07 ? P.white : 0xf0561a)), { pos: [0, 0.44, 0], outline: 0.035 }));
    g.userData = { kind: 'traffic_cone' };
    return finish(g);
  }

  /* ══ D) Particle effects ════════════════════════════════════════════════
   * One fixed-capacity pool per blend mode, each a single THREE.Points:
   *   glow — additive: sparks, flames, bursts, star sparkles;
   *   soft — normal blend: smoke, dust, water;
   *   flat — normal blend: confetti.
   * So the system costs at most three draw calls however busy it is. Each
   * particle lives in plain typed arrays; a dead one is swapped with the last
   * live one so the live set stays packed at the front, and only that range
   * is re-uploaded each frame. Emitting and updating never allocate. Sizes
   * are world-space diameters (the shader scales them by distance and by the
   * view's own viewport), so effects match in one view or two.
   */
  const FX_CAP = { glow: 1500, soft: 900, flat: 600 };
  const SHAPE = { glow: 0, puff: 1, flake: 2, star: 3 };
  const rand = (a, b) => a + Math.random() * (b - a);   // effects need not repeat

  function makePool(cap, blending) {
    const geo = new THREE.BufferGeometry();
    const p = {
      cap, n: 0, cursor: 0, geo,
      pos: new Float32Array(cap * 3), col: new Float32Array(cap * 4), size: new Float32Array(cap),
      spin: new Float32Array(cap), shape: new Float32Array(cap),
      vel: new Float32Array(cap * 3), age: new Float32Array(cap), life: new Float32Array(cap),
      s0: new Float32Array(cap), s1: new Float32Array(cap),
      rgb0: new Float32Array(cap * 3), rgb1: new Float32Array(cap * 3),
      alpha: new Float32Array(cap), fade: new Float32Array(cap), grav: new Float32Array(cap),
      drag: new Float32Array(cap), spinV: new Float32Array(cap), floor: new Float32Array(cap)
    };
    const dyn = (arr, n) => new THREE.BufferAttribute(arr, n).setUsage(THREE.DynamicDrawUsage);
    p.attrs = [dyn(p.pos, 3), dyn(p.col, 4), dyn(p.size, 1), dyn(p.spin, 1), dyn(p.shape, 1)];
    ['position', 'aColor', 'aSize', 'aSpin', 'aShape'].forEach((name, i) => geo.setAttribute(name, p.attrs[i]));
    geo.setDrawRange(0, 0);
    // every per-particle array with its stride, for swap-removal
    p.fields = [[p.pos, 3], [p.col, 4], [p.size, 1], [p.spin, 1], [p.shape, 1], [p.vel, 3], [p.age, 1], [p.life, 1],
      [p.s0, 1], [p.s1, 1], [p.rgb0, 3], [p.rgb1, 3], [p.alpha, 1], [p.fade, 1], [p.grav, 1], [p.drag, 1], [p.spinV, 1], [p.floor, 1]];
    p.points = new THREE.Points(geo, fxMaterial(blending));
    p.points.frustumCulled = false;
    p.points.visible = false;
    p.points.renderOrder = 10;
    return p;
  }

  /* The spawn record: an emitter fills it in, emit() copies it into a slot. */
  const S = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 1, s0: 1, s1: 1, r0: 1, g0: 1, b0: 1, r1: 1, g1: 1, b1: 1,
    a: 1, fade: 1, grav: 0, drag: 0, shape: 0, spin: 0, spinV: 0, floor: -1e9 };
  const _fc = new THREE.Color();
  function startCol(hex, towardWhite) {
    _fc.set(hex);
    const w = towardWhite || 0;
    S.r0 = _fc.r + (1 - _fc.r) * w; S.g0 = _fc.g + (1 - _fc.g) * w; S.b0 = _fc.b + (1 - _fc.b) * w;
  }
  function endCol(hex) { _fc.set(hex); S.r1 = _fc.r; S.g1 = _fc.g; S.b1 = _fc.b; }
  function sameCol() { S.r1 = S.r0; S.g1 = S.g0; S.b1 = S.b0; }

  function emit(p) {
    let i;
    if (p.n < p.cap) i = p.n++;
    else { i = p.cursor; p.cursor = (p.cursor + 1) % p.cap; }    // full: recycle round-robin
    const i3 = i * 3, i4 = i * 4;
    p.pos[i3] = S.x; p.pos[i3 + 1] = S.y; p.pos[i3 + 2] = S.z;
    p.vel[i3] = S.vx; p.vel[i3 + 1] = S.vy; p.vel[i3 + 2] = S.vz;
    p.rgb0[i3] = S.r0; p.rgb0[i3 + 1] = S.g0; p.rgb0[i3 + 2] = S.b0;
    p.rgb1[i3] = S.r1; p.rgb1[i3 + 1] = S.g1; p.rgb1[i3 + 2] = S.b1;
    p.col[i4] = S.r0; p.col[i4 + 1] = S.g0; p.col[i4 + 2] = S.b0; p.col[i4 + 3] = 0;
    p.age[i] = 0; p.life[i] = S.life; p.s0[i] = S.s0; p.s1[i] = S.s1; p.size[i] = S.s0;
    p.alpha[i] = S.a; p.fade[i] = S.fade; p.grav[i] = S.grav; p.drag[i] = S.drag;
    p.shape[i] = S.shape; p.spin[i] = S.spin; p.spinV[i] = S.spinV; p.floor[i] = S.floor;
  }

  function kill(p, i) {
    const last = --p.n;
    if (i === last) return;
    const f = p.fields;
    for (let k = 0; k < f.length; k++) {
      const arr = f[k][0], s = f[k][1];
      for (let j = 0; j < s; j++) arr[i * s + j] = arr[last * s + j];
    }
  }

  function stepPool(p, dt) {
    let i = 0;
    while (i < p.n) {
      const age = p.age[i] + dt;
      if (age >= p.life[i]) { kill(p, i); continue; }
      p.age[i] = age;
      const t = age / p.life[i];
      const i3 = i * 3, i4 = i * 4;
      const k = 1 / (1 + p.drag[i] * dt);
      let vx = p.vel[i3] * k, vy = p.vel[i3 + 1] * k + p.grav[i] * dt, vz = p.vel[i3 + 2] * k;
      let y = p.pos[i3 + 1] + vy * dt;
      if (y < p.floor[i]) { y = p.floor[i]; vy = -vy * 0.3; vx *= 0.55; vz *= 0.55; p.spinV[i] *= 0.4; }
      p.pos[i3] += vx * dt; p.pos[i3 + 1] = y; p.pos[i3 + 2] += vz * dt;
      p.vel[i3] = vx; p.vel[i3 + 1] = vy; p.vel[i3 + 2] = vz;
      p.size[i] = p.s0[i] + (p.s1[i] - p.s0[i]) * t;
      p.col[i4] = p.rgb0[i3] + (p.rgb1[i3] - p.rgb0[i3]) * t;
      p.col[i4 + 1] = p.rgb0[i3 + 1] + (p.rgb1[i3 + 1] - p.rgb0[i3 + 1]) * t;
      p.col[i4 + 2] = p.rgb0[i3 + 2] + (p.rgb1[i3 + 2] - p.rgb0[i3 + 2]) * t;
      p.col[i4 + 3] = p.alpha[i] * Math.min(1, t * 12) * Math.pow(1 - t, p.fade[i]);
      p.spin[i] += p.spinV[i] * dt;
      i++;
    }
    const n = p.n;
    p.geo.setDrawRange(0, n);
    p.points.visible = n > 0;
    if (!n) return;
    for (let a = 0; a < p.attrs.length; a++) {
      const at = p.attrs[a];
      at.updateRange.offset = 0;
      at.updateRange.count = n * at.itemSize;
      at.needsUpdate = true;
    }
  }

  /**
   * @param {THREE.Scene} scene  the three Points objects are added to it
   * @returns {object} emitters (pos: anything with x, y, z) + update(dt) / clear() / dispose() / stats()
   */
  function createFx(scene) {
    const glow = makePool(FX_CAP.glow, THREE.AdditiveBlending);
    const soft = makePool(FX_CAP.soft, THREE.NormalBlending);
    const flat = makePool(FX_CAP.flat, THREE.NormalBlending);
    const pools = [glow, soft, flat];
    pools.forEach((p) => scene.add(p.points));

    const at = (pos, j) => { S.x = pos.x + rand(-j, j); S.y = pos.y + rand(-j, j) * 0.5; S.z = pos.z + rand(-j, j); };

    /** Drift / scrape sparks: hot, fast, falling, bouncing off the road at
     *  pos.y. Kept close to colorHex, because for drift sparks the colour is
     *  the message (blue / orange / purple charge). */
    function sparks(pos, colorHex, n) {
      const hex = colorHex === undefined ? 0xffa21a : colorHex;
      for (let k = 0, cnt = n === undefined ? 6 : n; k < cnt; k++) {
        at(pos, 0.12); S.y = pos.y + rand(0.02, 0.15);
        const a = Math.random() * TAU, sp = rand(2, 6.5);
        S.vx = Math.cos(a) * sp; S.vz = Math.sin(a) * sp; S.vy = rand(2.5, 6.5);
        S.life = rand(0.22, 0.5); S.s0 = rand(0.18, 0.28); S.s1 = 0.05;
        startCol(hex, 0.2); endCol(hex);
        S.a = 0.85; S.fade = 1.2; S.grav = -17; S.drag = 1.1; S.floor = pos.y;
        S.shape = k % 3 === 0 ? SHAPE.star : SHAPE.glow; S.spin = Math.random() * TAU; S.spinV = rand(-6, 6);
        emit(glow);
      }
    }

    /** Exhaust / boost flame blown along dir (world units, e.g. the kart's
     *  backward vector). Each puff is yellow at birth and burns down to deep
     *  orange-red; alpha stays moderate so a burst stacks up as fire rather
     *  than blowing out to a white blob under additive blending. */
    function flame(pos, dir, n) {
      const dx = dir ? dir.x : 0, dy = dir ? dir.y : 0, dz = dir ? dir.z : 1;
      for (let k = 0, cnt = n === undefined ? 3 : n; k < cnt; k++) {
        at(pos, 0.06);
        const sp = rand(7, 12);
        S.vx = dx * sp + rand(-0.7, 0.7); S.vy = dy * sp + rand(-0.2, 0.8); S.vz = dz * sp + rand(-0.7, 0.7);
        S.life = rand(0.14, 0.26); S.s0 = rand(0.34, 0.5); S.s1 = rand(0.1, 0.18);
        startCol(0xffc43a, 0.25); endCol(0xd62a00);
        S.a = 0.6; S.fade = 1; S.grav = 2.5; S.drag = 2.2; S.floor = -1e9;
        S.shape = SHAPE.glow; S.spin = 0; S.spinV = 0;
        emit(glow);
      }
    }

    function smoke(pos, n) {
      for (let k = 0, cnt = n === undefined ? 2 : n; k < cnt; k++) {
        at(pos, 0.2);
        S.vx = rand(-0.6, 0.6); S.vy = rand(0.6, 1.4); S.vz = rand(-0.6, 0.6);
        S.life = rand(0.9, 1.6); S.s0 = rand(0.5, 0.8); S.s1 = rand(1.8, 2.6);
        startCol(0x8f8f9c); endCol(0xd7d7df);
        S.a = 0.5; S.fade = 1.5; S.grav = 0.5; S.drag = 1.0; S.floor = -1e9;
        S.shape = SHAPE.puff; S.spin = 0; S.spinV = 0;
        emit(soft);
      }
    }

    /** Wheel dust; colorHex lets a theme tint it (sand, snow, ash). */
    function dust(pos, n, colorHex) {
      const hex = colorHex === undefined ? 0xc9a36b : colorHex;
      for (let k = 0, cnt = n === undefined ? 2 : n; k < cnt; k++) {
        at(pos, 0.25); S.y = pos.y + 0.1;
        const a = Math.random() * TAU, sp = rand(1, 3);
        S.vx = Math.cos(a) * sp; S.vz = Math.sin(a) * sp; S.vy = rand(0.4, 1.2);
        S.life = rand(0.5, 0.9); S.s0 = rand(0.35, 0.5); S.s1 = rand(1.1, 1.5);
        startCol(hex); endCol(hex); S.r1 += (1 - S.r1) * 0.3; S.g1 += (1 - S.g1) * 0.3; S.b1 += (1 - S.b1) * 0.3;
        S.a = 0.55; S.fade = 1.3; S.grav = -1.5; S.drag = 2.2; S.floor = pos.y;
        S.shape = SHAPE.puff; S.spin = 0; S.spinV = 0;
        emit(soft);
      }
    }

    /** Party confetti: tumbling flakes that flutter down and settle on the ground at pos.y. */
    function confetti(pos, n) {
      for (let k = 0, cnt = n === undefined ? 60 : n; k < cnt; k++) {
        at(pos, 0.3);
        S.vx = rand(-4, 4); S.vy = rand(6, 12); S.vz = rand(-4, 4);
        S.life = rand(2.4, 3.6); S.s0 = S.s1 = rand(0.24, 0.32);
        startCol(PARTY[(Math.random() * PARTY.length) | 0]); sameCol();
        S.a = 1; S.fade = 0.6; S.grav = -9; S.drag = 1.6; S.floor = pos.y;
        S.shape = SHAPE.flake; S.spin = Math.random() * TAU; S.spinV = rand(-10, 10);
        emit(flat);
      }
    }

    /** Radial pop (box smash, hits): white-hot flecks turning colorHex, with a few twinkles. */
    function burst(pos, colorHex, n) {
      const hex = colorHex === undefined ? 0xffd21a : colorHex;
      for (let k = 0, cnt = n === undefined ? 24 : n; k < cnt; k++) {
        at(pos, 0.1);
        const u = rand(-1, 1), a = Math.random() * TAU, q = Math.sqrt(1 - u * u), sp = rand(4, 10);
        S.vx = Math.cos(a) * q * sp; S.vy = u * sp + 1.5; S.vz = Math.sin(a) * q * sp;
        S.life = rand(0.35, 0.7);
        const star = k % 5 === 0;
        S.s0 = star ? rand(0.7, 0.95) : rand(0.4, 0.6); S.s1 = 0.08;
        startCol(hex, 0.7); endCol(hex);
        S.a = 1; S.fade = 1; S.grav = -5; S.drag = 3.2; S.floor = -1e9;
        S.shape = star ? SHAPE.star : SHAPE.glow; S.spin = Math.random() * TAU; S.spinV = rand(-4, 4);
        emit(glow);
      }
    }

    /** Water splash: droplets thrown up and falling back, plus a little mist. */
    function splash(pos, n) {
      for (let k = 0, cnt = n === undefined ? 30 : n; k < cnt; k++) {
        at(pos, 0.3);
        const a = Math.random() * TAU, sp = rand(1.5, 4.5);
        S.vx = Math.cos(a) * sp; S.vz = Math.sin(a) * sp; S.vy = rand(5, 10);
        const mist = k % 6 === 0;
        S.life = mist ? rand(0.8, 1.2) : rand(0.6, 1.0);
        S.s0 = mist ? rand(0.8, 1.1) : rand(0.24, 0.34); S.s1 = mist ? 2.0 : 0.12;
        startCol(0xe6f6ff); endCol(0x6fc2ff);
        S.a = mist ? 0.35 : 0.9; S.fade = 1; S.grav = mist ? -3 : -22; S.drag = mist ? 2 : 0.4; S.floor = pos.y;
        S.shape = mist ? SHAPE.puff : SHAPE.glow; S.spin = 0; S.spinV = 0;
        emit(soft);
      }
    }

    /** Golden twinkles: coins, tricks, star power. */
    function stars(pos, n) {
      for (let k = 0, cnt = n === undefined ? 10 : n; k < cnt; k++) {
        at(pos, 0.3);
        const u = rand(-0.3, 1), a = Math.random() * TAU, q = Math.sqrt(1 - u * u), sp = rand(1.5, 4);
        S.vx = Math.cos(a) * q * sp; S.vy = u * sp + 1; S.vz = Math.sin(a) * q * sp;
        S.life = rand(0.6, 1.1); S.s0 = rand(0.6, 0.85); S.s1 = 0.15;
        startCol(0xffdf4a, 0.4); endCol(0xffffff);
        S.a = 1; S.fade = 1; S.grav = -3; S.drag = 2; S.floor = -1e9;
        S.shape = SHAPE.star; S.spin = Math.random() * TAU; S.spinV = rand(-3, 3);
        emit(glow);
      }
    }

    function update(dt) {
      if (!(dt > 0)) return;
      const d = Math.min(dt, 0.1);
      for (let k = 0; k < pools.length; k++) stepPool(pools[k], d);
    }

    function clear() {
      pools.forEach((p) => { p.n = 0; p.cursor = 0; p.geo.setDrawRange(0, 0); p.points.visible = false; });
    }

    function dispose() {
      pools.forEach((p) => { if (p.points.parent) p.points.parent.remove(p.points); p.geo.dispose(); });
    }

    function stats() {
      return { live: glow.n + soft.n + flat.n, glow: glow.n, soft: soft.n, flat: flat.n, capacity: glow.cap + soft.cap + flat.cap };
    }

    return { sparks, flame, smoke, dust, confetti, burst, splash, stars, update, clear, dispose, stats, objects: pools.map((p) => p.points) };
  }

  /* ══ Export ════════════════════════════════════════════════════════════ */
  A.ROAD_TILE = ROAD_TILE;
  A.RAIL_TILE = RAIL_TILE;
  Object.assign(A.tex, { road, pad: padTex, rail, wall, rainbow: rainbowTex, bolt: boltTex });
  Object.assign(A.items, {
    box, boxParts, coin, coinParts, pad, padMaterial, padRim, padGlow, ramp,
    peel, ball, bee, zapper, bomb, hornWave, updateHornWave, starAura, jetShell, shrinkPuff,
    BOX_Y, BOX_SIZE, COIN_Y, PAD_W, PAD_L, RAMPS, HORN_RADIUS
  });
  A.fx.create = createFx;
  A.fx.CAPACITY = FX_CAP.glow + FX_CAP.soft + FX_CAP.flat;
  A.drone = drone;
  A.DRONE_BODY_Y = DRONE_BODY_Y;
  A.startGantry = startGantry;
  A.podium = podium;
  A.trophy = trophy;
  A.glider = glider;
  Object.assign(A.props, {
    grandstand, billboard, balloon_arch: balloonArch, pit_building: pitBuilding, traffic_cone: trafficCone
  });
})();
