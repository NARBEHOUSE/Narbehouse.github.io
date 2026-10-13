/**
 * NARBE Racer — Dream Cup scenery and hazards: Toy Room and Funfair.
 *
 * Every prop and hazard the two Dream themes list, registered exactly like
 * the other kits: NK.art.props[name](rng) and NK.art.hazard[name](rng),
 * hazards also as NK.art.hazard['kind:theme'].
 *
 * How they are built (same rules as props-wonder.js):
 *   - Scenery is vertex-painted and drawn with the ONE shared flat Lambert
 *     material (NK.art.mat.lambertV), welded to one mesh per material. Bulbs
 *     and neon use one shared unlit vertex-colour material (deep colours, so
 *     they never blow out to white), lit ferris gondolas a lambertV with a
 *     deep warm emissive.
 *   - Hazards are cel-shaded (toonV) with a dark ink hull and sized to their
 *     collision boxes (DESIGN §9.4): a block fills one lane (2.8 × ≤2.5 × 2.6),
 *     a roller is a 2 m ball centred on its rolling axis, a geyser column is
 *     1.6 m wide and 6 m tall when active, a puddle is 3.6 × 6 m at y = 0.02.
 *     Faces and letters look toward +Z, at the karts coming up behind them.
 *   - Moving parts are pre-welded child nodes flagged userData.keep, driven by
 *     ONE root.userData.anim(t, dt) function (absolute time, so any number of
 *     calls agree). Groups of separate movers (gondolas, teacups, horses, a
 *     jack-in-the-box's lid, spring and jester) are ONE kept "rig" mesh whose
 *     vertex groups each follow their own matrix, positions and normals both.
 *     A copy that world.js freezes welds in the pose it was built in.
 *
 * Scale: the Toy Room is GIANT — a crayon is as long as a kart, a stack of
 * books is a building, the teddy is a hill.
 *
 * Origins: on the ground (lowest point y = 0) facing -Z, except the ball-pit
 * dressing (giant_ball, toy_slide, beach_bucket), whose origin is the
 * ball-pit SURFACE with the sunk parts below it, and the road-straddling set
 * pieces (bubble_machine_gate, toy_arch, balloon_gate, light_arch), whose
 * origin is the road's centre line on the ground, spanning X, with nothing
 * at all where |x| < 12.5 and y < 12 (the karts' opening).
 */
NK.propsDream1 = (function () {
  'use strict';

  const A = NK.art;
  const U = NK.util;
  const TAU = Math.PI * 2;
  const HALF_PI = Math.PI / 2;

  /* ── Catalogue (the contract with themes.js and world.js) ─────────────── */
  const THEMES = {
    toybox: {
      near: ['toy_blocks', 'crayon_bundle', 'rubber_duck', 'spinning_top', 'wind_up_robot', 'marble_pile', 'dominoes'],
      far: ['book_stack', 'toy_castle', 'block_tower', 'stuffed_bunny'],
      landmarks: ['teddy_giant', 'toy_rocket_big'],
      hazards: { block: 'toy_block', roller: 'bouncy_ball', geyser: 'jack_in_box', puddle: 'juice_spill' }
    },
    carnival: {
      near: ['balloon_cart', 'popcorn_stand', 'lamp_garland', 'prize_booth', 'carnival_flag', 'teacup_ride'],
      far: ['ferris_wheel', 'circus_tent', 'carousel', 'coaster_hill'],
      landmarks: ['ferris_giant', 'drop_tower'],
      hazards: { block: 'gift_block', roller: 'circus_ball', geyser: 'confetti_cannon', puddle: 'soda_spill' }
    }
  };
  /** Set dressing placed by world.js itself (ball pit, bumper-car arena, road set pieces). */
  const DRESSING = ['giant_ball', 'toy_slide', 'beach_bucket', 'bubble_machine_gate', 'toy_arch',
    'bumper_car', 'arena_lights', 'balloon_gate', 'light_arch'];

  /* ── Colour ──────────────────────────────────────────────────────────── */
  const _col = new THREE.Color();
  const _col2 = new THREE.Color();
  const _hsl = { h: 0, s: 0, l: 0 };

  /** A sibling of `hex`: lightness nudged by up to ±dl, hue by a hair. */
  function tone(hex, rng, dl) {
    _col.setHex(hex);
    _col.getHSL(_hsl, THREE.SRGBColorSpace);
    const h = _hsl.h + rng.range(-0.01, 0.01);
    _col.setHSL(h - Math.floor(h), _hsl.s, U.clamp(_hsl.l + rng.range(-dl, dl), 0, 1), THREE.SRGBColorSpace);
    return _col.getHex();
  }
  function pick(list, rng, dl) { return tone(rng.pick(list), rng, dl === undefined ? 0.03 : dl); }
  function shade(hex, dl) {
    _col.setHex(hex);
    _col.getHSL(_hsl, THREE.SRGBColorSpace);
    _col.setHSL(_hsl.h, _hsl.s, U.clamp(_hsl.l + dl, 0, 1), THREE.SRGBColorSpace);
    return _col.getHex();
  }
  function mixHex(a, b, t) { return _col.setHex(a).lerp(_col2.setHex(b), U.clamp(t, 0, 1)).getHex(); }
  /** n distinct entries of `list`, shuffled by rng. */
  function shuffled(list, rng) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng.next() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  /**
   * Bake a colour per TRIANGLE (the crisp low-poly facet look). `col` is a hex
   * or a function of the face centroid (cx, cy, cz, faceIndex) → hex. o.jit
   * jiggles each face's lightness; o.grad lightens toward the top of
   * [o.y0, o.y1] (default: the part's own height).
   */
  function paintFaces(geo, col, rng, o) {
    o = o || {};
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    const P = g.attributes.position, n = P.count;
    const jit = o.jit || 0, grad = o.grad || 0;
    let y0 = o.y0, y1 = o.y1;
    if (grad && (y0 === undefined || y1 === undefined)) {
      g.computeBoundingBox();
      if (y0 === undefined) y0 = g.boundingBox.min.y;
      if (y1 === undefined) y1 = g.boundingBox.max.y;
    }
    const spanY = grad ? ((y1 - y0) || 1) : 1;
    const fixed = typeof col === 'number';
    if (fixed) _col.setHex(col);
    const out = new Float32Array(n * 3);
    for (let t = 0; t + 2 < n; t += 3) {
      const cy = (P.getY(t) + P.getY(t + 1) + P.getY(t + 2)) / 3;
      if (!fixed) {
        const cx = (P.getX(t) + P.getX(t + 1) + P.getX(t + 2)) / 3;
        const cz = (P.getZ(t) + P.getZ(t + 1) + P.getZ(t + 2)) / 3;
        _col.setHex(col(cx, cy, cz, t / 3));
      }
      let d = jit ? (rng.next() * 2 - 1) * jit : 0;
      if (grad) d += grad * (U.clamp((cy - y0) / spanY, 0, 1) - 0.5);
      const f = d ? Math.pow(Math.max(0.1, 1 + d), 2.2) : 1;
      for (let k = 0; k < 9; k += 3) {
        out[t * 3 + k] = _col.r * f;
        out[t * 3 + k + 1] = _col.g * f;
        out[t * 3 + k + 2] = _col.b * f;
      }
    }
    g.setAttribute('color', new THREE.BufferAttribute(out, 3));
    return g;
  }

  /* ── Geometry helpers ─────────────────────────────────────────────────── */
  const _m4 = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _e = new THREE.Euler();
  const _p = new THREE.Vector3();
  const _s = new THREE.Vector3();
  const _up = new THREE.Vector3(0, 1, 0);
  const _dir = new THREE.Vector3();

  /** Bake scale (o.s) → rotation (o.r, Euler order o.order) → position (o.p). */
  function place(geo, o) {
    if (!o || (o.s === undefined && !o.r && !o.p)) return geo;
    const s = o.s === undefined ? 1 : o.s;
    if (typeof s === 'number') _s.set(s, s, s); else _s.set(s[0], s[1], s[2]);
    _e.set(o.r ? o.r[0] : 0, o.r ? o.r[1] : 0, o.r ? o.r[2] : 0, o.order || 'XYZ');
    _q.setFromEuler(_e);
    _p.set(o.p ? o.p[0] : 0, o.p ? o.p[1] : 0, o.p ? o.p[2] : 0);
    geo.applyMatrix4(_m4.compose(_p, _q, _s));
    return geo;
  }
  /** Point a geometry built along +Y from a to b. */
  function span(geo, a, b) {
    _dir.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
    _q.setFromUnitVectors(_up, _dir);
    _p.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
    geo.applyMatrix4(_m4.compose(_p, _q, _s.set(1, 1, 1)));
    return geo;
  }
  const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  /** A round rod from a to b (radius r0 at a, r1 at b). */
  const rod = (a, b, r0, r1, seg) => span(new THREE.CylinderGeometry(r1, r0, dist(a, b), seg || 5, 1), a, b);
  /** A square bar from a to b. */
  const bar = (a, b, w, d) => span(new THREE.BoxGeometry(w, dist(a, b), d === undefined ? w : d), a, b);

  /** Pseudo-random -1..1 from a position, so vertices duplicated along seams agree. */
  function hash3(x, y, z, seed) {
    const h = Math.sin(Math.round(x * 997) * 0.1373 + Math.round(y * 997) * 0.2711 +
                       Math.round(z * 997) * 0.1619 + seed * 7.31) * 43758.5453;
    return (h - Math.floor(h)) * 2 - 1;
  }

  /** Push vertices in or out from the origin by up to ±amt of their distance. */
  function lump(geo, amt, seed) {
    const P = geo.attributes.position;
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
      const k = 1 + amt * hash3(x, y, z, seed);
      P.setXYZ(i, x * k, y * k, z * k);
    }
    P.needsUpdate = true;
    geo.computeVertexNormals();
    return geo;
  }

  /** A rounded box ("squircle" sphere): p < 1 squares it off, 1 is a sphere. */
  function roundBox(w, h, d, p, ws, hs) {
    const g = new THREE.SphereGeometry(1, ws || 12, hs || 9);
    const P = g.attributes.position;
    const f = (v) => Math.sign(v) * Math.pow(Math.abs(v), p);
    for (let i = 0; i < P.count; i++) P.setXYZ(i, f(P.getX(i)) * w / 2, f(P.getY(i)) * h / 2, f(P.getZ(i)) * d / 2);
    g.computeVertexNormals();
    return g;
  }

  /** A flat disc in the XZ plane facing +Y, in rings so it can be painted by radius. */
  function disc(radii, segs, shape) {
    const pos = [0, 0, 0];
    for (let j = 0; j < radii.length; j++) {
      for (let i = 0; i < segs; i++) {
        const a = (i / segs) * TAU, r = radii[j] * (shape ? shape(a) : 1);
        pos.push(Math.cos(a) * r, 0, Math.sin(a) * r);
      }
    }
    const idx = [];
    for (let i = 0; i < segs; i++) idx.push(0, 1 + ((i + 1) % segs), 1 + i);
    for (let j = 1; j < radii.length; j++) {
      const a0 = 1 + (j - 1) * segs, b0 = 1 + j * segs;
      for (let i = 0; i < segs; i++) {
        const i1 = (i + 1) % segs;
        idx.push(a0 + i, a0 + i1, b0 + i, a0 + i1, b0 + i1, b0 + i);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const nor = new Float32Array(pos.length);
    for (let i = 1; i < nor.length; i += 3) nor[i] = 1;
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setIndex(idx);
    return g;
  }
  function blobShape(rng, amt) {
    const p1 = rng.range(0, TAU), p2 = rng.range(0, TAU), p3 = rng.range(0, TAU);
    return (a) => 1 + amt * (0.55 * Math.sin(2 * a + p1) + 0.3 * Math.sin(3 * a + p2) + 0.15 * Math.sin(5 * a + p3));
  }

  /** Reverse every triangle, so a single-sided sheet can be seen from its back. */
  function flip(geo) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    const P = g.attributes.position;
    for (let t = 0; t + 2 < P.count; t += 3) {
      const x = P.getX(t + 1), y = P.getY(t + 1), z = P.getZ(t + 1);
      P.setXYZ(t + 1, P.getX(t + 2), P.getY(t + 2), P.getZ(t + 2));
      P.setXYZ(t + 2, x, y, z);
    }
    g.computeVertexNormals();
    return g;
  }
  /** A double-sided copy of a sheet: flags, pennants, awnings. */
  function twoSided(geo) {
    const back = flip(geo.clone());
    const front = geo.index ? geo.toNonIndexed() : geo;
    if (front !== geo) geo.dispose();
    const a = front.attributes.position.array, b = back.attributes.position.array;
    const pos = new Float32Array(a.length + b.length);
    pos.set(a, 0); pos.set(b, a.length);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.computeVertexNormals();
    front.dispose(); back.dispose();
    return g;
  }

  /** An arc of a ring in the XY plane, centred on the bottom (smile) or top (happy eye). */
  function arcGeo(R, tube, arc, top) {
    const g = new THREE.TorusGeometry(R, tube, 5, 12, arc);
    g.rotateZ((top ? HALF_PI : -HALF_PI) - arc / 2);
    return g;
  }

  /** A tube along a list of points (CatmullRom): strings, streamers, coaster rails. */
  function tubeGeo(points, radius, segs, radial, closed) {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p[0], p[1], p[2])), !!closed);
    return new THREE.TubeGeometry(curve, segs || 24, radius, radial || 5, !!closed);
  }

  /** A five-pointed (or n-pointed) star outline in the XY plane. */
  function starShape(R, r, n) {
    const s = new THREE.Shape();
    n = n || 5;
    for (let i = 0; i < 2 * n; i++) {
      const a = HALF_PI + i * Math.PI / n, rr = i % 2 ? r : R;
      if (i) s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    s.closePath();
    return s;
  }
  /** A heart outline (about 1 × 0.95) centred on the origin in the XY plane. */
  function heartShape(sz) {
    const s = sz || 1, h = new THREE.Shape();
    h.moveTo(0, -0.45 * s);
    h.bezierCurveTo(-0.15 * s, -0.3 * s, -0.5 * s, -0.06 * s, -0.5 * s, 0.17 * s);
    h.bezierCurveTo(-0.5 * s, 0.42 * s, -0.18 * s, 0.52 * s, 0, 0.27 * s);
    h.bezierCurveTo(0.18 * s, 0.52 * s, 0.5 * s, 0.42 * s, 0.5 * s, 0.17 * s);
    h.bezierCurveTo(0.5 * s, -0.06 * s, 0.15 * s, -0.3 * s, 0, -0.45 * s);
    return h;
  }
  /** A flat solid from a shape, `depth` thick, front face at z = +depth/2. */
  function slab(shape, depth, curveSegs) {
    return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: curveSegs || 4 }).translate(0, 0, -depth / 2);
  }

  /** A basis for a face: outward normal n, letter-up u, centred at p. */
  const _fr = new THREE.Vector3(), _fu = new THREE.Vector3(), _fn = new THREE.Vector3();
  function faceM(n, up, p) {
    _fn.set(n[0], n[1], n[2]).normalize();
    _fu.set(up[0], up[1], up[2]).normalize();
    _fr.crossVectors(_fu, _fn).normalize();
    _fu.crossVectors(_fn, _fr).normalize();
    return new THREE.Matrix4().makeBasis(_fr, _fu, _fn).setPosition(p[0], p[1], p[2]);
  }

  /* ── Chunky toy letters, numbers and shapes ───────────────────────────────
   * Strokes in a unit cell (x -0.5..0.5, y -0.5..0.5): [x0, y0, x1, y1] bars
   * and ['a', cx, cy, r, from, sweep] arcs; '*' a star, '<' a heart, 'o' a dot.
   */
  const GLYPHS = {
    A: [[-0.3, -0.5, 0, 0.5], [0, 0.5, 0.3, -0.5], [-0.16, -0.1, 0.16, -0.1]],
    B: [[-0.26, -0.5, -0.26, 0.5], [-0.26, 0.5, 0, 0.5], [-0.26, 0, 0.02, 0], [-0.26, -0.5, 0.02, -0.5],
      ['a', 0, 0.25, 0.25, -HALF_PI, Math.PI], ['a', 0.02, -0.25, 0.25, -HALF_PI, Math.PI]],
    C: [['a', 0.04, 0, 0.42, 0.8, TAU - 1.6]],
    D: [[-0.26, -0.5, -0.26, 0.5], [-0.26, 0.5, -0.06, 0.5], [-0.26, -0.5, -0.06, -0.5], ['a', -0.06, 0, 0.5, -HALF_PI, Math.PI]],
    E: [[-0.26, -0.5, -0.26, 0.5], [-0.26, 0.5, 0.28, 0.5], [-0.26, 0, 0.18, 0], [-0.26, -0.5, 0.28, -0.5]],
    H: [[-0.28, -0.5, -0.28, 0.5], [0.28, -0.5, 0.28, 0.5], [-0.28, 0, 0.28, 0]],
    K: [[-0.26, -0.5, -0.26, 0.5], [-0.26, -0.06, 0.28, 0.5], [-0.1, 0.1, 0.28, -0.5]],
    L: [[-0.24, 0.5, -0.24, -0.5], [-0.24, -0.5, 0.28, -0.5]],
    M: [[-0.34, -0.5, -0.34, 0.5], [-0.34, 0.5, 0, -0.05], [0, -0.05, 0.34, 0.5], [0.34, 0.5, 0.34, -0.5]],
    N: [[-0.28, -0.5, -0.28, 0.5], [-0.28, 0.5, 0.28, -0.5], [0.28, -0.5, 0.28, 0.5]],
    O: [['a', 0, 0, 0.42, 0, TAU]],
    P: [[-0.26, -0.5, -0.26, 0.5], [-0.26, 0.5, 0, 0.5], [-0.26, 0, 0, 0], ['a', 0, 0.25, 0.25, -HALF_PI, Math.PI]],
    R: [[-0.26, -0.5, -0.26, 0.5], [-0.26, 0.5, 0, 0.5], [-0.26, 0, 0, 0], ['a', 0, 0.25, 0.25, -HALF_PI, Math.PI], [-0.02, 0, 0.3, -0.5]],
    T: [[-0.32, 0.5, 0.32, 0.5], [0, 0.5, 0, -0.5]],
    V: [[-0.32, 0.5, 0, -0.5], [0, -0.5, 0.32, 0.5]],
    X: [[-0.3, -0.5, 0.3, 0.5], [-0.3, 0.5, 0.3, -0.5]],
    Y: [[-0.3, 0.5, 0, 0], [0.3, 0.5, 0, 0], [0, 0, 0, -0.5]],
    Z: [[-0.28, 0.5, 0.28, 0.5], [0.28, 0.5, -0.28, -0.5], [-0.28, -0.5, 0.28, -0.5]],
    1: [[0.04, -0.5, 0.04, 0.5], [0.04, 0.5, -0.2, 0.28], [-0.2, -0.5, 0.28, -0.5]],
    4: [[0.14, -0.5, 0.14, 0.5], [0.14, 0.5, -0.3, -0.12], [-0.3, -0.12, 0.3, -0.12]],
    7: [[-0.28, 0.5, 0.28, 0.5], [0.28, 0.5, -0.06, -0.5]],
    '*': 'star', '<': 'heart', 'o': 'dot'
  };
  /** Letters drawn only with bars (cheap): what the scenery blocks use. */
  const BAR_LETTERS = 'AEHKLMNTVXYZ147*';
  /**
   * Raise a glyph `size` tall and `depth` proud on the face basis M (its +Z out
   * of the face, z = 0 on the surface). Every part goes to k.add with `col`.
   */
  function glyph(k, ch, M, size, depth, col, parent, o) {
    const def = GLYPHS[ch] || GLYPHS.A, w = 0.17 * size;
    const opt = Object.assign({ m: M }, o || {});
    const add = (geo) => k.add(geo, col, opt, parent);
    if (def === 'star') { add(slab(starShape(0.55 * size, 0.24 * size), depth).translate(0, -0.03 * size, depth / 2)); return; }
    if (def === 'heart') { add(slab(heartShape(1.05 * size), depth).translate(0, 0, depth / 2)); return; }
    if (def === 'dot') { add(new THREE.CylinderGeometry(0.4 * size, 0.4 * size, depth, 12).rotateX(HALF_PI).translate(0, 0, depth / 2)); return; }
    def.forEach((s) => {
      if (s[0] === 'a') {
        const g = new THREE.TorusGeometry(s[3] * size, w / 2, 4, Math.max(4, Math.round(s[5] * 2.2)), s[5]);
        g.scale(1, 1, depth / w).rotateZ(s[4]).translate(s[1] * size, s[2] * size, depth / 2);
        add(g);
      } else {
        const a = [s[0] * size, s[1] * size, depth / 2], b = [s[2] * size, s[3] * size, depth / 2];
        const L = dist(a, b) || 1, ex = w * 0.42 / L;
        const a2 = [a[0] - (b[0] - a[0]) * ex, a[1] - (b[1] - a[1]) * ex, a[2]];
        const b2 = [b[0] + (b[0] - a[0]) * ex, b[1] + (b[1] - a[1]) * ex, b[2]];
        add(bar(a2, b2, w, depth));
      }
    });
  }

  /* ── Shared materials ─────────────────────────────────────────────────── */
  /** Unlit vertex colour: bulbs and neon (paint them DEEP, never pale). */
  const GLOW = () => A.mat.basic(0xffffff, { vertexColors: true });
  /** Warm self-lit Lambert: lit ferris gondolas, glowing windows. */
  const LIT = () => A.mat.lambertV({ emissive: 0x3a2206, emissiveIntensity: 1 });

  /* ── Kit: one prop under construction ────────────────────────────────── */
  function Kit(rng, toon) {
    this.rng = rng;
    this.mat = toon ? A.mat.toonV() : A.mat.lambertV();
    this.root = new THREE.Group();
  }
  /**
   * @param geo     a fresh geometry (consumed)
   * @param col     hex, face-colour function, or null when already painted
   * @param o       { s, r, p, order, m, jit, grad, y0, y1, noInk, mat }
   *                Colour functions see the part after s/r/p but BEFORE the
   *                frame matrix o.m, so a painted pattern moves with its frame.
   * @param parent  a node to hang the part on (default: the root)
   */
  Kit.prototype.add = function (geo, col, o, parent) {
    o = o || {};
    place(geo, o);
    const g = col === null ? geo : paintFaces(geo, col, this.rng, o);
    if (o.m) g.applyMatrix4(o.m);
    if (g.attributes.uv) g.deleteAttribute('uv');
    if (!g.attributes.normal) g.computeVertexNormals();
    const m = new THREE.Mesh(g, o.mat || this.mat);
    if (o.noInk) m.userData.noOutline = true;
    (parent || this.root).add(m);
    return m;
  };
  /** A glowing part (unlit, deep colour, never inked). */
  Kit.prototype.glow = function (geo, col, o, parent) {
    return this.add(geo, col, Object.assign({ mat: GLOW(), noInk: true }, o || {}), parent);
  };

  /** Weld a moving part to one mesh per material and flag it to survive later welds. */
  function keep(node) {
    const out = flagInk(A.mergeByMaterial(node));
    out.userData.keep = true;
    return out;
  }

  const _box = new THREE.Box3();
  const _bb = new THREE.Box3();
  /** Bounds of the drawn geometry — ink shells and shadows excluded. */
  function bounds(root) {
    root.updateMatrixWorld(true);
    _box.makeEmpty();
    root.traverse((o) => {
      if (!o.isMesh || o.userData.outline || o.userData.shadow) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      _bb.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
      _box.union(_bb);
    });
    return _box;
  }
  function shiftY(kit, dy) {
    if (Math.abs(dy) > 1e-5) kit.root.children.forEach((c) => { c.position.y += dy; });
  }
  /** Welded ink shells keep their outline flag, so tools can tell hull from body. */
  function flagInk(out) {
    out.traverse((m) => { if (m.isMesh && m.material && m.material.side === THREE.BackSide) m.userData.outline = true; });
    return out;
  }
  /** Sit the prop on its ground line (lowest point at `ground`) and weld it. */
  function finish(kit, ground) {
    shiftY(kit, (ground || 0) - bounds(kit.root).min.y);
    return flagInk(A.mergeByMaterial(kit.root));
  }
  /** Weld in place: the builder put the origin where it belongs (pit surface, road line). */
  function finishHere(kit) {
    return flagInk(A.mergeByMaterial(kit.root));
  }

  /* ── Animation: ONE root.userData.anim(t, dt) per prop ──────────────────
   * Helpers register small functions of absolute time; rest values are read
   * on the first call, after every weld has settled.
   */
  function onAnim(k, fn) {
    const ud = k.root.userData;
    if (!ud.anim) {
      const fns = [];
      ud.anim = function (t, dt) { for (let i = 0; i < fns.length; i++) fns[i](t || 0, dt || 0); };
      Object.defineProperty(ud.anim, 'fns', { value: fns });
    }
    ud.anim.fns.push(fn);
  }
  function spin(k, node, axis, speed, phase) {
    let rest;
    onAnim(k, (t) => { if (rest === undefined) rest = node.rotation[axis]; node.rotation[axis] = rest + speed * t + (phase || 0); });
  }
  function sway(k, node, axis, speed, amp, phase) {
    let rest;
    onAnim(k, (t) => { if (rest === undefined) rest = node.rotation[axis]; node.rotation[axis] = rest + amp * Math.sin(speed * t + (phase || 0)); });
  }
  function bob(k, node, axis, speed, amp, phase) {
    let rest;
    onAnim(k, (t) => { if (rest === undefined) rest = node.position[axis]; node.position[axis] = rest + amp * Math.sin(speed * t + (phase || 0)); });
  }

  /**
   * A vertex rig: every node in `nodes` (a Group of parts built in the rig's
   * own space) becomes one vertex group of a single kept mesh. pose(fn) asks
   * fn(g, M) to fill the Matrix4 M for each group (it starts as identity) and
   * moves positions and normals to match. Many movers, one draw call.
   */
  function Rig(nodes, mat, flags) {
    const list = [];
    let n = 0;
    nodes.forEach((node, g) => node.children.forEach((m) => {
      if (!m.isMesh) return;
      const geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry;
      if (!geo.attributes.normal) geo.computeVertexNormals();
      list.push([geo, g]);
      n += geo.attributes.position.count;
    }));
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3), gid = new Uint16Array(n);
    let o = 0;
    list.forEach(([geo, g]) => {
      const P = geo.attributes.position.array, N = geo.attributes.normal.array, C = geo.attributes.color;
      pos.set(P, o * 3); nor.set(N, o * 3);
      if (C) col.set(C.array, o * 3); else col.fill(1, o * 3, o * 3 + P.length);
      gid.fill(g, o, o + P.length / 3);
      o += P.length / 3;
      geo.dispose();
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.base = pos.slice();
    this.baseN = nor.slice();
    this.gid = gid;
    this.groups = nodes.length;
    this.mats = nodes.map(() => new THREE.Matrix4());
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.userData.keep = true;
    if (flags) Object.assign(this.mesh.userData, flags);
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
  }
  Rig.prototype.pose = function (fn) {
    for (let g = 0; g < this.groups; g++) { this.mats[g].identity(); fn(g, this.mats[g]); }
    const geo = this.mesh.geometry, pos = geo.attributes.position.array, nor = geo.attributes.normal.array;
    const B = this.base, BN = this.baseN, gid = this.gid, mats = this.mats;
    for (let i = 0, n = gid.length; i < n; i++) {
      const e = mats[gid[i]].elements, j = i * 3;
      const x = B[j], y = B[j + 1], z = B[j + 2];
      pos[j] = e[0] * x + e[4] * y + e[8] * z + e[12];
      pos[j + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
      pos[j + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
      const a = BN[j], b = BN[j + 1], c = BN[j + 2];
      const nx = e[0] * a + e[4] * b + e[8] * c, ny = e[1] * a + e[5] * b + e[9] * c, nz = e[2] * a + e[6] * b + e[10] * c;
      const l = Math.hypot(nx, ny, nz) || 1;
      nor[j] = nx / l; nor[j + 1] = ny / l; nor[j + 2] = nz / l;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.normal.needsUpdate = true;
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
  };
  /** Ink shells for rig nodes: a parallel node list whose parts are the hulls. */
  function inkNodes(nodes, thickness) {
    let inkMat = null;
    const out = nodes.map((node) => {
      const g = new THREE.Group();
      node.children.forEach((m) => {
        if (!m.isMesh || m.userData.noOutline) return;
        const shell = A.outline(m, thickness);
        m.remove(shell);
        inkMat = shell.material;
        g.add(new THREE.Mesh(shell.geometry, shell.material));
      });
      return g;
    });
    return { nodes: out, mat: inkMat };
  }
  /** M = translate(p) · rotate(euler rx, ry, rz) · scale(s) · translate(-pivot). */
  const _rq = new THREE.Quaternion(), _re = new THREE.Euler(), _rv = new THREE.Vector3(), _rs = new THREE.Vector3(), _rt = new THREE.Matrix4();
  function poseM(M, pivot, p, rx, ry, rz, s, order) {
    _re.set(rx || 0, ry || 0, rz || 0, order || 'XYZ');
    _rq.setFromEuler(_re);
    if (typeof s === 'number' || s === undefined) _rs.set(s === undefined ? 1 : s, s === undefined ? 1 : s, s === undefined ? 1 : s);
    else _rs.set(s[0], s[1], s[2]);
    M.compose(_rv.set(p[0], p[1], p[2]), _rq, _rs);
    M.multiply(_rt.makeTranslation(-pivot[0], -pivot[1], -pivot[2]));
    return M;
  }

  /** A soft contact shadow under a hazard (flagged keep: never welded into it). */
  function shadow(root, w, d) {
    const s = A.blobShadow(1);
    s.scale.set(w, d, 1);
    s.userData.shadow = true;
    s.userData.keep = true;
    root.add(s);
    return s;
  }

  /* ── Registration ─────────────────────────────────────────────────────── */
  function prop(name, build) {
    A.props[name] = function (rng) {
      const obj = build(rng || U.rng(U.hash(name)));
      obj.name = name;
      return obj;
    };
  }
  /**
   * Hazards also carry userData.kind and, when they move on their own,
   * userData.idle(t, dt). Rollers carry rollRadius and rollNode (the child to
   * spin about its local Z as the hazard slides along X) and are built with
   * their bounds centred on that axis and no ground shadow.
   */
  function hazard(name, kind, themeId, build) {
    const fn = function (rng) {
      const obj = build(rng || U.rng(U.hash(name)));
      obj.name = name;
      obj.userData.kind = kind;
      const an = obj.userData.anim;
      if (typeof an === 'function' && !obj.userData.idle) obj.userData.idle = an;
      return obj;
    };
    A.hazard[name] = fn;
    A.hazard[kind + ':' + themeId] = fn;
  }
  /** Scale a hazard's baked geometry to exact collision dims, ink it and weld it. */
  function sizeHazard(k, dims) {
    const b = bounds(k.root), size = new THREE.Vector3(), c = new THREE.Vector3();
    b.getSize(size); b.getCenter(c);
    const sx = dims[0] / size.x, sy = dims[1] / size.y, sz = dims[2] / size.z;
    k.root.traverse((m) => {
      if (m.isMesh) m.geometry.translate(-c.x, -b.min.y, -c.z).scale(sx, sy, sz);
    });
    A.ink(k.root, 0.055);
    return finish(k);
  }
  /**
   * Centre a roller's baked parts on its rolling axis and size it to 2R across,
   * so spinning about the bounds centre (world.js) or rollNode never wobbles.
   */
  function centreBall(node, R) {
    const b = new THREE.Box3(), c = new THREE.Vector3(), size = new THREE.Vector3();
    node.children.forEach((m) => {
      if (!m.isMesh || m.userData.outline) return;
      m.geometry.computeBoundingBox();
      b.union(m.geometry.boundingBox);
    });
    b.getCenter(c); b.getSize(size);
    const s = 2 * R / Math.max(size.x, size.y);
    node.children.forEach((m) => { if (m.isMesh) m.geometry.translate(-c.x, -c.y, 0).scale(s, s, s); });
  }
  /** Finish a roller: centre, ink (plus one clean silhouette hull) and key it. */
  function finishRoller(k, node, R) {
    centreBall(node, R);
    A.ink(node, 0.04);
    const hull = new THREE.Mesh(new THREE.IcosahedronGeometry(R, 2), A.mat.lambertV());
    const shell = A.outline(hull, 0.05);
    hull.remove(shell);
    hull.geometry.dispose();
    node.add(shell);
    const roll = keep(node);
    roll.name = 'roll';
    k.root.add(roll);
    const out = finish(k);
    out.userData.rollRadius = R;
    out.userData.rollNode = roll;
    return out;
  }
  /**
   * Geyser rig (props-moonlight geyser()): an inked base plus a column node
   * that rises from its own origin — hidden when idle, a steady low stub while
   * warning, full height with a gentle surge while active. Never flashing.
   */
  function geyserRig(base, column) {
    column.userData.keep = true;
    base.add(column);
    column.visible = false;
    base.userData.setState = function (active, warn, u) {
      column.visible = !!(active || warn);
      column.scale.set(1, active ? 0.93 + 0.07 * Math.sin((u || 0) * TAU * 3) : 0.08, 1);
    };
    return base;
  }
  /**
   * Puddle base: a lane-wide 3.6 × 6 m blob at y = 0.02 whose outermost ring is
   * painted dark (its ink line — a flat decal cannot carry a hull).
   */
  function puddleBase(k, radii, fill, rim, halfW, halfL) {
    const shape = blobShape(k.rng, 0.05);
    const g = paintFaces(disc(radii, 36, shape), (cx, cy, cz) => {
      const rho = Math.hypot(cx, cz) / shape(Math.atan2(cz, cx));
      return rho > 0.955 ? rim : fill(rho, cx, cz);
    }, k.rng, { jit: 0.025 });
    k.add(g, null, { s: [halfW, 1, halfL], p: [0, 0.02, 0], noInk: true });
    return shape;
  }

  /* ── Small shared pieces ──────────────────────────────────────────────── */
  const INK = 0x1f1b2e;
  const WHITE = 0xffffff;
  const ico = (r, d) => new THREE.IcosahedronGeometry(r, d === undefined ? 1 : d);
  const sph = (ws, hs) => new THREE.SphereGeometry(1, ws || 12, hs || 8);

  /** A friendly eye: white, pupil and glint, looking along dz (+1 or -1 in Z). */
  function eye(k, x, y, z, s, dz, o) {
    o = o || {};
    k.add(ico(1, 1), o.white || WHITE, { s: [s * 0.78, s, s * 0.42], p: [x, y, z] }, o.parent);
    const lx = (o.look || 0) * s * 0.22;
    k.add(ico(1, 1), o.pupil || INK, { s: [s * 0.46, s * 0.56, s * 0.3], p: [x + lx, y - s * 0.1, z + dz * s * 0.22], noInk: true }, o.parent);
    k.add(ico(1, 0), WHITE, { s: [s * 0.15, s * 0.15, s * 0.1], p: [x + lx + s * 0.13, y + s * 0.08, z + dz * s * 0.47], noInk: true }, o.parent);
  }
  /** A shiny black button eye with a glint (plush toys), facing dz. */
  function buttonEye(k, x, y, z, r, dz, parent) {
    k.add(sph(10, 6), 0x1c1824, { s: [r, r, r * 0.55], p: [x, y, z] }, parent);
    k.add(ico(1, 0), WHITE, { s: [r * 0.28, r * 0.28, r * 0.12], p: [x + r * 0.32, y + r * 0.34, z + dz * r * 0.45], noInk: true }, parent);
  }
  /** Angle-wedge painter: n wedges round Y cycling through `cols`. */
  const wedges = (cols, n, off) => (cx, cy, cz) => {
    const a = (Math.atan2(cz, cx) / TAU + 1 + (off || 0)) % 1;
    return cols[Math.floor(a * n) % cols.length];
  };

  /* ════════════════════════════════════════════════════════════════════════
   * TOY ROOM — a giant playroom floor: primary colours, wood, plush, plastic
   * ════════════════════════════════════════════════════════════════════════ */
  const RED = 0xe8392f, BLUE = 0x2a7de1, YELLOW = 0xffc928, GREEN = 0x37b34a;
  const ORANGE = 0xff8a1e, PURPLE = 0x8e5bd8, PINK = 0xff6aa8, TEAL = 0x1fb8b0;
  const BRIGHTS = [RED, BLUE, YELLOW, GREEN, ORANGE, PURPLE, PINK, TEAL];
  const CREAM = 0xfff3dc;

  /**
   * A lettered wooden toy block of edge s on `node` (centred, bottom at -s/2):
   * a painted body, cream panels on the sides and top, a raised letter on each.
   */
  function letterBlock(k, s, body, node, o) {
    o = o || {};
    const r = k.rng, ink = shuffled(BRIGHTS.filter((c) => c !== body && c !== YELLOW), r);
    k.add(new THREE.BoxGeometry(s, s, s), body, { jit: 0.03 }, node);
    const faces = [[0, 0, -1], [1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 1, 0]];
    const pool = o.letters || BAR_LETTERS;
    faces.forEach((n, i) => {
      if (o.skip && o.skip.indexOf(i) >= 0) return;
      const up = i === 4 ? [0, 0, -1] : [0, 1, 0], e = s / 2 + 0.012;
      const M = faceM(n, up, [n[0] * e, n[1] * e, n[2] * e]);
      k.add(new THREE.PlaneGeometry(s * 0.8, s * 0.8), o.panel || CREAM, { m: M, noInk: true }, node);
      const ch = o.face && i === (o.faceIdx || 0) ? o.face : pool[Math.floor(r.next() * pool.length)];
      glyph(k, ch, M, s * 0.56, s * 0.07, ink[i % ink.length], node, { noInk: true });
    });
  }

  /* ── Toy Room near ──────────────────────────────────────────────────── */

  /** A jumbled stack of lettered blocks: three, two, one, and a tumbled one. */
  prop('toy_blocks', (r) => {
    const k = new Kit(r), s = r.range(0.95, 1.05), cols = shuffled(BRIGHTS, r);
    const spots = [];
    for (let i = 0; i < 3; i++) spots.push([(i - 1) * s * 1.06 + r.range(-0.04, 0.04), s / 2, r.range(-0.08, 0.08), r.range(-0.18, 0.18)]);
    for (let i = 0; i < 2; i++) spots.push([(i - 0.5) * s * 1.08 + r.range(-0.1, 0.1), s * 1.5, r.range(-0.1, 0.1), r.range(-0.3, 0.3)]);
    spots.push([r.range(-0.2, 0.2), s * 2.5, r.range(-0.1, 0.1), r.range(0.3, 0.6)]);
    // One tumbled off the pile, lying on the floor a little way out.
    const ta = r.range(0, TAU);
    spots.push([Math.cos(ta) * 0.4 + s * 2.2 * r.sign(), s * 0.45, -s * 1.1, r.range(0.4, 1.1), 0.9]);
    spots.forEach((p, i) => {
      const node = new THREE.Group(), sc = p[4] || 1;
      letterBlock(k, s * sc, cols[i % cols.length], node, { skip: i < 3 ? [] : [] });
      node.position.set(p[0], p[1] * (p[4] ? 1 : 1), p[2]);
      node.rotation.y = p[3];
      k.root.add(node);
    });
    return finish(k);
  });

  /**
   * A giant wax crayon built along +X from its flat end (x = 0) to its tip
   * (x = L): bare wax at both ends, dark paper bands, a papered middle.
   * Painted in its own frame, then moved by the matrix M.
   */
  function crayon(k, col, L, R, M) {
    const wrap = shade(col, 0.12), band = shade(col, -0.28), tipL = R * 1.7, bodyL = L - tipL;
    const g = paintFaces(new THREE.CylinderGeometry(R, R, bodyL, 8, 10).rotateZ(-HALF_PI).translate(bodyL / 2, 0, 0), (cx) => {
      const u = cx / bodyL;                                // 0 at the flat end, 1 at the tip
      if (u < 0.1 || u > 0.9) return col;                  // bare wax at both ends
      if (u < 0.2 || u > 0.8) return band;                 // dark paper bands
      return (u > 0.42 && u < 0.58) ? shade(col, -0.12) : wrap;
    }, k.rng, { jit: 0.02 });
    k.add(g, null, { m: M });
    k.add(new THREE.CylinderGeometry(R * 0.3, R, tipL, 8, 1).rotateZ(-HALF_PI).translate(bodyL + tipL / 2, 0, 0), col, { m: M, jit: 0.02 });
    k.add(new THREE.CircleGeometry(R, 8).rotateY(-HALF_PI), shade(col, -0.06), { m: M });
  }
  prop('crayon_bundle', (r) => {
    const k = new Kit(r), R = 0.42, cols = shuffled([RED, BLUE, YELLOW, GREEN, PURPLE, ORANGE, PINK], r);
    /* yaw turns the crayon's +X (its tip) about Y; pitch lifts the tip. */
    const M = (x, y, z, yaw, pitch) => new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0, yaw, pitch || 0, 'YZX')).setPosition(x, y, z);
    // Three lying side by side along X (two touching, one a little apart), tips
    // pointing either way, and a fourth resting in the groove on top.
    [-R, R, R * 3.3].forEach((z, i) => {
      const L = r.range(4.6, 5.2), back = r.chance(0.5), x0 = r.range(-0.35, 0.35);
      crayon(k, cols[i], L, R, M(back ? x0 + L / 2 : x0 - L / 2, R, z, (back ? Math.PI : 0) + (i === 2 ? r.range(-0.08, 0.08) : 0)));
    });
    const L4 = r.range(4.4, 4.9), b4 = r.chance(0.5);
    crayon(k, cols[3], L4, R, M(b4 ? L4 / 2 : -L4 / 2, R + R * Math.sqrt(3), 0, b4 ? Math.PI : 0));
    // A fifth leans across the pile: flat end on the floor in front, resting on the top crayon.
    if (r.chance(0.8)) {
      const pitch = 0.48, x = r.range(-1.2, 1.2);
      crayon(k, cols[4], 4.7, R, M(x, R * Math.cos(pitch), -3.2, -HALF_PI + r.range(-0.15, 0.15), pitch));
    }
    return finish(k);
  });

  /** A big squeaky rubber duck with an orange beak (faces -Z). */
  prop('rubber_duck', (r) => {
    const k = new Kit(r), sc = r.range(0.95, 1.08), yel = pick([0xffd21f, 0xffcc1a], r, 0.02), deep = shade(yel, -0.12);
    const beak = 0xff8a1e;
    const S = (v) => v.map((x) => x * sc);
    k.add(sph(14, 9), (cx, cy) => (cy < 0.35 * sc ? deep : yel), { s: S([1.08, 0.78, 1.32]), p: S([0, 0.78, 0.18]), grad: 0.18, jit: 0.015 });
    // Upturned tail at the back.
    k.add(new THREE.ConeGeometry(0.5, 0.95, 10), yel, { s: S([1, 1, 0.55]), r: [-0.95, 0, 0], p: S([0, 1.22, 1.32]), jit: 0.015 });
    // Wings tucked on the sides.
    [-1, 1].forEach((sd) => k.add(sph(10, 7), shade(yel, -0.05), { s: S([0.2, 0.42, 0.72]), r: [0.2, 0, sd * 0.12], p: S([sd * 1.0, 0.98, 0.32]), jit: 0.02 }));
    // Head, a cheeky curl on top.
    k.add(sph(14, 10), yel, { s: S([0.7, 0.68, 0.68]), p: S([0, 1.84, -0.5]), grad: 0.15, jit: 0.015 });
    [-0.25, 0.1, 0.42].forEach((a, i) => k.add(new THREE.ConeGeometry(0.09, 0.42 - i * 0.07, 5), yel, { s: sc, r: [a, 0, 0], p: S([0, 2.5 - i * 0.02, -0.5 + i * 0.1]) }));
    // Beak: upper and lower bills, a hint of a smile between.
    k.add(sph(10, 6), beak, { s: S([0.44, 0.14, 0.4]), p: S([0, 1.74, -1.12]) });
    k.add(sph(10, 6), shade(beak, -0.08), { s: S([0.36, 0.1, 0.32]), r: [-0.18, 0, 0], p: S([0, 1.6, -1.06]) });
    [-1, 1].forEach((sd) => {
      eye(k, sd * 0.3 * sc, 2.0 * sc, -1.02 * sc, 0.22 * sc, -1, { look: sd * -0.2 });
      k.add(ico(1, 0), 0xff9a8a, { s: S([0.16, 0.1, 0.06]), p: S([sd * 0.5, 1.72, -1.0]), r: [0, sd * 0.5, 0] });
    });
    return finish(k);
  });

  /** A striped spinning top balanced on its point (spins and gently precesses). */
  prop('spinning_top', (r) => {
    const k = new Kit(r), sc = r.range(0.95, 1.08), cols = shuffled([RED, BLUE, YELLOW, GREEN, PURPLE, TEAL], r).slice(0, 3);
    const prof = [[0.001, 0], [0.12, 0.08], [0.45, 0.42], [1.0, 0.92], [1.24, 1.12], [1.22, 1.24], [1.0, 1.4], [0.55, 1.62], [0.24, 1.72], [0.001, 1.74]];
    const node = new THREE.Group();
    const lathe = new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x * sc, y * sc)), 18);
    k.add(lathe, (cx, cy, cz) => {
      if (cy < 0.12 * sc) return 0x6b6f78;                               // metal point
      if (cy > 1.08 * sc && cy < 1.28 * sc) return 0xfff3dc;             // pale rim band
      const a = (Math.atan2(cz, cx) / TAU + 1 + cy * 0.18) % 1;          // swirling wedges
      return cols[Math.floor(a * 6) % 3];
    }, { jit: 0.02 }, node);
    k.add(new THREE.CylinderGeometry(0.15 * sc, 0.17 * sc, 0.7 * sc, 8), cols[0], { p: [0, 2.05 * sc, 0] }, node);
    k.add(sph(10, 7), YELLOW, { s: 0.26 * sc, p: [0, 2.42 * sc, 0], grad: 0.2 }, node);
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * TAU;
      k.add(ico(0.1 * sc, 0), WHITE, { p: [Math.cos(a) * 1.24 * sc, 1.18 * sc, Math.sin(a) * 1.24 * sc] }, node);
    }
    const top = keep(node);
    k.root.add(top);
    const ph = r.range(0, TAU);
    onAnim(k, (t) => {
      top.rotation.set(0.07 * Math.cos(1.3 * t + ph), 0, 0.07 * Math.sin(1.3 * t + ph));
      top.rotateY(5.5 * t);
    });
    return finish(k);
  });

  /** A cute tin wind-up robot; the key on its back turns (faces -Z). */
  prop('wind_up_robot', (r) => {
    const k = new Kit(r), ways = [[RED, 0xc9d3dc, YELLOW], [TEAL, 0xd8dee6, ORANGE], [BLUE, 0xd0d8e2, RED]];
    const [body, tin, trim] = r.pick(ways), dark = 0x3a3f4a;
    [-1, 1].forEach((s) => {
      k.add(new THREE.BoxGeometry(0.55, 0.3, 0.85), dark, { p: [s * 0.42, 0.15, -0.08] });
      k.add(new THREE.CylinderGeometry(0.17, 0.19, 0.48, 8), tin, { p: [s * 0.42, 0.54, 0] });
      k.add(new THREE.TorusGeometry(0.19, 0.05, 3, 8), trim, { r: [HALF_PI, 0, 0], p: [s * 0.42, 0.56, 0] });
    });
    k.add(new THREE.BoxGeometry(1.5, 1.3, 1.1), body, { p: [0, 1.42, 0], jit: 0.03 });
    k.add(new THREE.BoxGeometry(1.56, 0.12, 1.16), trim, { p: [0, 0.8, 0] });
    k.add(new THREE.BoxGeometry(1.56, 0.12, 1.16), trim, { p: [0, 2.03, 0] });
    // Chest panel: two gauges and a row of buttons.
    k.add(new THREE.BoxGeometry(1.0, 0.7, 0.06), tin, { p: [0, 1.42, -0.57] });
    [-1, 1].forEach((s) => {
      k.add(new THREE.CylinderGeometry(0.17, 0.17, 0.06, 10), WHITE, { r: [HALF_PI, 0, 0], p: [s * 0.24, 1.55, -0.61] });
      k.add(new THREE.BoxGeometry(0.03, 0.14, 0.02), RED, { r: [0, 0, s * 0.6], p: [s * 0.24 + s * 0.03, 1.58, -0.645] });
    });
    [RED, YELLOW, GREEN].forEach((c, i) => k.add(ico(0.075, 0), c, { p: [(i - 1) * 0.2, 1.24, -0.61] }));
    // Shoulders, arms and pincer hands.
    [-1, 1].forEach((s) => {
      k.add(sph(8, 6), trim, { s: 0.22, p: [s * 0.82, 1.86, 0] });
      k.add(new THREE.CylinderGeometry(0.11, 0.11, 0.78, 6), tin, { r: [0, 0, s * 0.22], p: [s * 0.94, 1.48, -0.08] });
      k.add(new THREE.TorusGeometry(0.17, 0.06, 3, 7, Math.PI * 1.45), dark, { r: [HALF_PI, 0, s > 0 ? 1.6 : -1.6 + Math.PI], p: [s * 1.04, 1.02, -0.12] });
    });
    // Head with lamp eyes, a grille mouth, ear bolts and an antenna.
    k.add(new THREE.CylinderGeometry(0.2, 0.24, 0.2, 8), dark, { p: [0, 2.16, 0] });
    k.add(new THREE.BoxGeometry(1.12, 0.86, 0.92), tin, { p: [0, 2.68, 0], jit: 0.02 });
    [-1, 1].forEach((s) => {
      k.add(new THREE.CylinderGeometry(0.2, 0.2, 0.1, 10), YELLOW, { r: [HALF_PI, 0, 0], p: [s * 0.26, 2.78, -0.48] });
      k.add(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 8), 0x1c1824, { r: [HALF_PI, 0, 0], p: [s * 0.26, 2.76, -0.54] });
      k.add(new THREE.CylinderGeometry(0.15, 0.15, 0.16, 8), trim, { r: [0, 0, HALF_PI], p: [s * 0.62, 2.7, 0] });
      k.add(ico(1, 0), 0xff9a8a, { s: [0.1, 0.06, 0.03], p: [s * 0.42, 2.5, -0.47], noInk: true });
    });
    for (let i = 0; i < 4; i++) k.add(new THREE.BoxGeometry(0.06, 0.14, 0.05), dark, { p: [(i - 1.5) * 0.12, 2.45, -0.47] });
    k.add(rod([0, 3.1, 0], [0.05, 3.42, 0], 0.035, 0.03, 5), dark);
    k.add(sph(8, 6), RED, { s: 0.11, p: [0.05, 3.46, 0] });
    // The wind-up key on its back: a shaft and a butterfly grip.
    const key = new THREE.Group();
    key.position.set(0, 1.45, 0.55);
    k.add(rod([0, 0, 0], [0, 0, 0.42], 0.06, 0.06, 6), 0xd9a520, {}, key);
    [-1, 1].forEach((s) => k.add(sph(10, 6), 0xf2c033, { s: [0.32, 0.22, 0.06], p: [s * 0.28, 0, 0.44] }, key));
    k.add(new THREE.CylinderGeometry(0.09, 0.09, 0.1, 8), 0xd9a520, { r: [HALF_PI, 0, 0], p: [0, 0, 0.44] }, key);
    const kn = keep(key);
    k.root.add(kn);
    spin(k, kn, 'z', 1.6, r.range(0, TAU));
    return finish(k);
  });

  /** A heap of giant glass marbles with cat's-eye swirls and glints. */
  prop('marble_pile', (r) => {
    const k = new Kit(r), R = r.range(0.5, 0.56), cols = shuffled([0x2a7de1, 0x2fbf6a, 0xe8392f, 0xffa31a, 0x8e5bd8, 0x1fb8b0, 0xff5fa2], r);
    const spots = [];
    // A triangle of three, three more round them, two in the hollows above, one on top.
    const tri = (cx, cz, d, a0) => [0, 1, 2].map((i) => [cx + Math.cos(a0 + i * TAU / 3) * d, cz + Math.sin(a0 + i * TAU / 3) * d]);
    const d0 = 2 * R / Math.sqrt(3) * 1.02, a0 = r.range(0, TAU);
    const base = tri(0, 0, d0, a0).concat(tri(0, 0, d0 * 2.05, a0 + Math.PI / 3));
    base.forEach(([x, z]) => spots.push([x, R, z, R]));
    const hz = R + Math.sqrt(4 * R * R - d0 * d0);
    tri(0, 0, d0 * 1.02, a0 + Math.PI / 3).slice(0, 2).forEach(([x, z]) => spots.push([x, hz, z, R]));
    spots.push([r.range(-0.15, 0.15), hz + R * 1.55, r.range(-0.15, 0.15), R * 0.95]);
    spots.push([d0 * 3.3, R * 0.7, r.range(-0.5, 0.5), R * 0.7]);
    spots.forEach(([x, y, z, rr], i) => {
      const c = cols[i % cols.length], hi = shade(c, 0.18), seed = i * 3.1;
      k.add(sph(10, 7), (cx, cy, cz) => {
        const lx = cx - x, ly = cy - y, lz = cz - z;
        const a = Math.atan2(lz, lx) + ly / rr * 1.7 + seed;
        return Math.abs(Math.sin(a * 1.5)) < 0.22 ? 0xf6fbff : (ly > rr * 0.35 ? hi : c);
      }, { s: rr, p: [x, y, z], jit: 0.02, grad: 0.2, y0: y - rr, y1: y + rr });
      k.add(ico(1, 0), WHITE, { s: [rr * 0.2, rr * 0.13, rr * 0.08], r: [0.5, -0.6, 0], p: [x - rr * 0.38, y + rr * 0.55, z - rr * 0.6], noInk: true });
    });
    return finish(k);
  });

  /** A curving row of colourful standing dominoes, the first few toppling. */
  prop('dominoes', (r) => {
    const k = new Kit(r), n = 9, W = 1.25, H = 2.5, T = 0.42, cols = shuffled([RED, BLUE, YELLOW, GREEN, PURPLE, ORANGE, TEAL], r);
    const bend = r.range(0.7, 1.1) * r.sign(), ph = r.range(-0.4, 0.4);
    const PIPS = [[], [[0, 0]], [[-1, 1], [1, -1]], [[-1, 1], [0, 0], [1, -1]], [[-1, -1], [-1, 1], [1, -1], [1, 1]],
      [[-1, -1], [-1, 1], [0, 0], [1, -1], [1, 1]], [[-1, -1], [-1, 0], [-1, 1], [1, -1], [1, 0], [1, 1]]];
    const at = (u) => [-3.4 + 6.8 * u, bend * Math.sin(u * Math.PI * 1.4 + ph)];
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1), p = at(u), q = at(Math.min(1, u + 0.01)), p0 = at(Math.max(0, u - 0.01));
      const yaw = Math.atan2(-(q[1] - p0[1]), q[0] - p0[0]);
      // The first three topple toward the rest, each resting on the next.
      const tip = i < 3 ? [0.62, 0.4, 0.17][i] : 0;
      const node = new THREE.Group(), col = cols[i % cols.length], pipC = col === YELLOW ? 0x2a2a3a : WHITE;
      k.add(new THREE.BoxGeometry(T, H, W), col, { p: [0, H / 2, 0], jit: 0.03 }, node);
      [-1, 1].forEach((sd) => {
        const fx = sd * (T / 2 + 0.01);
        k.add(new THREE.PlaneGeometry(W * 0.8, 0.07), pipC, { r: [0, sd * HALF_PI, 0], p: [fx, H / 2, 0], noInk: true }, node);
        [0, 1].forEach((half) => {
          const cnt = Math.floor(r.next() * 7), cy = half ? H * 0.75 : H * 0.25;
          PIPS[cnt].forEach(([a, b]) => k.add(new THREE.CircleGeometry(0.11, 8), pipC,
            { r: [0, sd * HALF_PI, 0], p: [fx, cy + b * 0.3, a * 0.3 * sd], noInk: true }, node));
        });
      });
      // Pivot about the leading bottom edge (+X in the domino's frame).
      node.children.forEach((m) => m.geometry.translate(-T / 2, 0, 0));
      node.position.set(p[0] + Math.cos(yaw) * T / 2, 0, p[1] - Math.sin(yaw) * T / 2);
      node.rotation.set(0, yaw, -tip, 'YXZ');
      k.root.add(node);
    }
    return finish(k);
  });

  /* ── Toy Room far ───────────────────────────────────────────────────── */

  /** An arch outline in the XY plane: a rectangle hRect tall capped by a half-circle, half-width hw. */
  function archShape(hw, hRect) {
    const s = new THREE.Shape();
    s.moveTo(-hw, 0);
    s.lineTo(-hw, hRect);
    s.absarc(0, hRect, hw, Math.PI, 0, true);
    s.lineTo(hw, 0);
    s.closePath();
    return s;
  }

  /** The front (-Z) surface of an ellipsoid centred c with radii e, at offsets dx, dy from its centre. */
  const frontZ = (c, e, dx, dy) => c[2] - e[2] * Math.sqrt(Math.max(0, 1 - (dx / e[0]) * (dx / e[0]) - (dy / e[1]) * (dy / e[1])));

  /** A shiny apple sitting at (x, y, z) on its base, R round. */
  function apple(k, x, y, z, R, parent) {
    const red = 0xe8302a;
    k.add(lump(sph(12, 9), 0.03, 4), (cx, cy) => (cy > 0.45 ? shade(red, 0.08) : red), { s: [R, R * 0.9, R], p: [x, y + R * 0.88, z], grad: 0.2, jit: 0.02 }, parent);
    k.add(ico(1, 0), WHITE, { s: [R * 0.22, R * 0.12, R * 0.06], r: [0, 0.6, 0.4], p: [x - R * 0.42, y + R * 1.25, z - R * 0.72], noInk: true }, parent);
    k.add(rod([x, y + R * 1.6, z], [x + R * 0.12, y + R * 2.15, z], R * 0.07, R * 0.05, 5), 0x6b4226, {}, parent);
    k.add(new THREE.OctahedronGeometry(1, 0), 0x45b84a, { s: [R * 0.38, R * 0.07, R * 0.18], r: [0, 0.5, 0.3], p: [x + R * 0.38, y + R * 1.98, z - R * 0.08] }, parent);
  }

  /**
   * A giant hardback lying flat in the frame M (bottom at y = 0): cover boards,
   * a rounded spine toward -Z with two gold bands and a label, and lined cream
   * page edges on the other three sides.
   */
  function book(k, w, h, d, col, M) {
    const r = k.rng, ct = Math.min(0.34, h * 0.13), cover = tone(col, r, 0.03);
    const label = r.pick([CREAM, 0xfff0a8, WHITE]);
    k.add(new THREE.BoxGeometry(w, ct, d), cover, { p: [0, h - ct / 2, 0], m: M, jit: 0.02 });
    k.add(new THREE.BoxGeometry(w, ct, d), cover, { p: [0, ct / 2, 0], m: M, jit: 0.02 });
    const spine = (len, rr, c, x) => k.add(new THREE.CylinderGeometry(rr, rr, len, 10, 1, false, HALF_PI, Math.PI).rotateZ(HALF_PI), c,
      { s: [1, 1, 0.45], p: [x, h / 2, -d / 2 + 0.03], m: M });
    spine(w, h / 2, cover, 0);
    [-1, 1].forEach((s) => spine(w * 0.05, h / 2 * 1.04, 0xf2c033, s * w * 0.36));
    spine(w * 0.3, h / 2 * 1.025, label, 0);
    const ph = h - 2 * ct, nl = Math.max(3, Math.round(ph / 0.24));
    k.add(new THREE.BoxGeometry(w - 0.5, ph, d - 0.3, 1, nl, 1),
      (cx, cy) => (Math.floor((cy - ct) / ph * nl) % 2 ? 0xfff7e6 : 0xeadcbc), { p: [0, h / 2, -0.1], m: M });
    // Now and then a ribbon bookmark trails out over the page edge.
    if (r.chance(0.35)) k.add(new THREE.BoxGeometry(0.55, h * 0.5 + 1.2, 0.06), r.pick([RED, BLUE, 0xf2c033]), { p: [r.range(-w * 0.3, w * 0.3), h * 0.6 - (h * 0.5 + 1.2) / 2, d / 2 - 0.12], m: M });
  }

  /** A tower of giant books with a shiny apple on top (spines toward the road). */
  prop('book_stack', (r) => {
    const k = new Kit(r), cols = shuffled([RED, BLUE, GREEN, PURPLE, ORANGE, TEAL, YELLOW, PINK], r);
    const w0 = r.range(14, 15.5), d0 = r.range(10.5, 11.5);
    let y = 0, top = null;
    for (let i = 0; i < 8; i++) {
      const f = 1 - i * 0.045, w = w0 * f * r.range(0.9, 1.04), d = d0 * f * r.range(0.9, 1.04), h = r.range(2.2, 3.1);
      const yaw = (i % 4 === 2 ? HALF_PI * r.sign() : 0) + r.range(-0.12, 0.12);
      top = [r.range(-0.6, 0.6), r.range(-0.5, 0.5)];
      book(k, w, h, d, cols[i % cols.length], new THREE.Matrix4().makeRotationY(yaw).setPosition(top[0], y, top[1]));
      y += h;
    }
    apple(k, top[0] + r.range(-1.5, 1.5), y, top[1] + r.range(-1, 0.5), 1.9);
    k.root.userData.faceRoad = true;
    return finish(k);
  });

  /** Paint wooden-block bricks on a box or tower: colour by grid cell (ix + iy + iz). */
  const blockPaint = (cols, bw, bh, ox, oz) => (cx, cy, cz) =>
    cols[(Math.floor((cx + ox) / bw + 1e3) + Math.floor(cy / bh + 1e3) + Math.floor((cz + oz) / bw + 1e3)) % cols.length];

  /** A round toy tower: block bands, a yellow collar, a striped cone roof, a ball and a pennant. */
  function toyTower(k, x, z, R, H, y0, cols, roof, flagC) {
    const r = k.rng;
    k.add(new THREE.CylinderGeometry(R, R, H, 12, Math.max(2, Math.round(H / 3))), (cx, cy, cz) => {
      const a = Math.floor(((Math.atan2(cz - z, cx - x) / TAU + 1) % 1) * 6);
      return cols[(a + Math.floor((cy - y0) / (H / Math.max(2, Math.round(H / 3))))) % cols.length];
    }, { p: [x, y0 + H / 2, z], jit: 0.03 });
    k.add(new THREE.CylinderGeometry(R * 1.16, R * 1.16, 0.9, 12), YELLOW, { p: [x, y0 + H + 0.45, z] });
    const ch = R * 2.1;
    k.add(new THREE.ConeGeometry(R * 1.16, ch, 12), wedges([roof, WHITE], 8), { p: [x, y0 + H + 0.9 + ch / 2, z], jit: 0.02 });
    const tip = y0 + H + 0.9 + ch;
    k.add(sph(8, 6), YELLOW, { s: R * 0.17, p: [x, tip + R * 0.1, z] });
    k.add(rod([x, tip, z], [x, tip + R * 0.85, z], 0.09, 0.07, 5), 0x6b5a4a);
    const fl = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -R * 0.36, 0), new THREE.Vector3(R * 0.75, -R * 0.18, 0)]);
    k.add(twoSided(fl), flagC, { r: [0, r.range(-0.6, 0.6), 0], p: [x, tip + R * 0.85, z] });
    // Two arched windows toward the road.
    [0.35, 0.68].forEach((f, i) => k.add(slab(archShape(R * 0.2, R * 0.28), 0.12), 0x24305e,
      { p: [x + (i ? -0.18 : 0.18) * R, y0 + H * f, z - R + 0.02], r: [0, Math.PI, 0] }));
  }

  /** A bright block-built toy castle: a wall, two round towers, a keep and its tower (faces the road). */
  prop('toy_castle', (r) => {
    const k = new Kit(r), c = shuffled([RED, BLUE, YELLOW, GREEN, PURPLE, ORANGE], r);
    const roofs = shuffled([RED, BLUE, PURPLE, PINK], r), flagC = [YELLOW, RED, BLUE];
    const W = 22, WH = 8, WD = 6;
    // The keep behind the wall, then the wall itself.
    k.add(new THREE.BoxGeometry(11, 13, 7, 4, 5, 3), blockPaint([c[2], c[3], c[4]], 2.75, 2.6, 5.5, 0), { p: [0, 6.5, 4.2], jit: 0.03 });
    k.add(new THREE.BoxGeometry(W, WH, WD, 8, 3, 2), blockPaint([c[0], c[1], c[5]], 2.75, WH / 3, W / 2, WD / 2), { p: [0, WH / 2, 0], jit: 0.03 });
    for (let i = -3; i <= 3; i++) {
      [-1, 1].forEach((s) => k.add(new THREE.BoxGeometry(1.8, 1.6, 1.4), (i + (s > 0 ? 1 : 0)) & 1 ? c[3] : c[2], { p: [i * 2.95, WH + 0.8, s * (WD / 2 - 0.7)], jit: 0.03 }));
    }
    for (let i = -1; i <= 1; i++) k.add(new THREE.BoxGeometry(1.8, 1.6, 1.4), i & 1 ? c[0] : c[1], { p: [i * 3.6, 13.8, 0.7 + 0.01], jit: 0.03 });
    // Arched gate with a golden frame and a dark doorway.
    k.add(slab(archShape(3.3, 3.6), 0.3), YELLOW, { p: [0, 0, -WD / 2 - 0.12], jit: 0.02 });
    k.add(slab(archShape(2.5, 3.2), 0.12), 0x24305e, { p: [0, 0, -WD / 2 - 0.3] });
    // Round windows in the keep.
    [-1, 1].forEach((s) => {
      k.add(new THREE.TorusGeometry(0.95, 0.24, 4, 12), YELLOW, { p: [s * 3, 10.8, 0.62] });
      k.add(new THREE.CircleGeometry(0.95, 12), 0x24305e, { r: [0, Math.PI, 0], p: [s * 3, 10.8, 0.66] });
    });
    toyTower(k, -12.2, 0, 3.3, 15, 0, [c[1], c[3], c[0]], roofs[0], flagC[0]);
    toyTower(k, 12.2, 0, 3.3, 15, 0, [c[5], c[2], c[1]], roofs[1], flagC[1]);
    toyTower(k, 0, 4.6, 2.8, 7, 13, [c[0], c[4], c[3]], roofs[2], flagC[2]);
    k.root.userData.faceRoad = true;
    return finish(k);
  });

  /** A tall, slightly wobbly tower of toy blocks: cubes, pillars, a plank, an arch and a roof. */
  prop('block_tower', (r) => {
    const k = new Kit(r), cols = shuffled(BRIGHTS, r);
    let y = 0, ci = 0, x = 0, z = 0;
    const drift = [r.range(-0.12, 0.12), r.range(-0.12, 0.12)];
    const nudge = () => { x += drift[0] + r.range(-0.12, 0.12); z += drift[1] + r.range(-0.12, 0.12); };
    const cube = (s) => {
      const node = new THREE.Group();
      letterBlock(k, s, cols[ci++ % cols.length], node);
      node.position.set(x, y + s / 2, z);
      node.rotation.y = r.range(-0.35, 0.35);
      k.root.add(node);
      y += s; nudge();
    };
    cube(4.6); cube(4.3);
    // Two round pillars carrying a plank.
    const pc = cols[ci++ % cols.length], pa = r.range(-0.3, 0.3);
    [-1, 1].forEach((s) => k.add(new THREE.CylinderGeometry(0.8, 0.8, 3.6, 10), pc, { p: [x + Math.cos(pa) * s * 1.55, y + 1.8, z - Math.sin(pa) * s * 1.55], jit: 0.03 }));
    y += 3.6;
    k.add(new THREE.BoxGeometry(5.4, 0.9, 3.4), cols[ci++ % cols.length], { r: [0, pa, 0], p: [x, y + 0.45, z], jit: 0.03 });
    y += 0.9; nudge();
    cube(3.9); cube(3.7);
    // An arch block (a bridge with a round hole).
    const ar = new THREE.Shape();
    ar.moveTo(-2.2, 0); ar.lineTo(-2.2, 2.6); ar.lineTo(2.2, 2.6); ar.lineTo(2.2, 0); ar.lineTo(1.1, 0);
    ar.absarc(0, 0, 1.1, 0, Math.PI, false); ar.lineTo(-2.2, 0);
    k.add(slab(ar, 3.4, 6), cols[ci++ % cols.length], { r: [0, r.range(-0.3, 0.3), 0], p: [x, y, z], jit: 0.03 });
    y += 2.6; nudge();
    cube(3.5); cube(3.3);
    // A triangle roof block and a little flag.
    const rc = cols[ci++ % cols.length], ry = r.range(-0.3, 0.3);
    const tri = new THREE.Shape();
    tri.moveTo(-2, 0); tri.lineTo(2, 0); tri.lineTo(0, 2.8); tri.closePath();
    k.add(slab(tri, 3.0), rc, { r: [0, ry, 0], p: [x, y, z], jit: 0.03 });
    k.add(rod([x, y + 2.7, z], [x, y + 4.6, z], 0.1, 0.08, 5), 0x6b5a4a);
    const fl = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -0.9, 0), new THREE.Vector3(1.5, -0.45, 0)]);
    k.add(twoSided(fl), YELLOW, { r: [0, ry + 0.5, 0], p: [x, y + 4.6, z] });
    return finish(k);
  });

  /** A big plush bunny sitting on the rug: one ear up, one flopped (faces the road). */
  prop('stuffed_bunny', (r) => {
    const k = new Kit(r);
    const [fur, inner] = r.pick([[0xc9b3ff, 0xff9ec4], [0xffbfd6, 0xff86b0], [0xa8d8ff, 0xffa3c4], [0xf4ece2, 0xff9ec0]]);
    const lite = shade(fur, 0.07), seed = r.next() * 99;
    const plush = (g) => lump(g, 0.02, seed);
    k.add(plush(sph(14, 10)), fur, { s: [3.8, 4.2, 3.5], p: [0, 4.2, 0.2], jit: 0.025, grad: 0.12 });
    k.add(sph(10, 7), lite, { s: [2.4, 2.8, 0.7], p: [0, 4.1, -2.85], jit: 0.02 });
    k.add(plush(sph(14, 10)), fur, { s: [3.4, 3.1, 3.1], p: [0, 10.4, 0], jit: 0.025, grad: 0.12 });
    // Ears: built upright from their base, one standing, one flopped to the side.
    const flop = r.sign();
    [-1, 1].forEach((sd) => {
      const node = new THREE.Group();
      k.add(sph(10, 7), fur, { s: [0.95, 2.3, 0.55], p: [0, 2.1, 0], jit: 0.02 }, node);
      k.add(sph(8, 6), inner, { s: [0.55, 1.8, 0.2], p: [0, 2.15, -0.42], noInk: true }, node);
      node.position.set(sd * 1.25, 12.9, 0.2);
      node.rotation.set(sd === flop ? 0.15 : -0.12, 0, sd === flop ? -sd * 1.75 : -sd * 0.2, 'XZY');
      k.root.add(node);
    });
    // Face: button eyes, a pink nose, white cheek puffs, two teeth and a blush.
    [-1, 1].forEach((sd) => {
      buttonEye(k, sd * 1.2, 11.1, -2.8, 0.42, -1);
      k.add(sph(8, 6), WHITE, { s: [0.75, 0.58, 0.45], p: [sd * 0.5, 9.75, -2.85] });
      k.add(ico(1, 0), inner, { s: [0.55, 0.3, 0.12], p: [sd * 1.95, 9.95, -2.42], r: [0, sd * 0.6, 0] });
    });
    k.add(new THREE.ConeGeometry(0.42, 0.42, 3), inner, { r: [Math.PI, 0, 0], s: [1, 1, 0.6], p: [0, 10.25, -3.2] });
    k.add(new THREE.BoxGeometry(0.62, 0.42, 0.14), WHITE, { p: [0, 9.18, -2.92] });
    k.add(new THREE.BoxGeometry(0.03, 0.42, 0.06), 0xd8d0c8, { p: [0, 9.18, -2.99] });
    // Arms resting on the belly, big feet stuck out in front with pink paw pads.
    [-1, 1].forEach((sd) => {
      k.add(sph(10, 7), fur, { s: [1.1, 2.5, 1.1], r: [-0.5, 0, sd * 0.35], p: [sd * 3.1, 5.7, -1.4], jit: 0.02 });
      k.add(sph(12, 8), fur, { s: [1.45, 1.05, 2.4], p: [sd * 1.9, 1.05, -2.9], jit: 0.02 });
      k.add(ico(1, 1), inner, { s: [0.75, 0.62, 0.14], p: [sd * 1.9, 0.95, -5.24], noInk: true });
      [-0.55, 0, 0.55].forEach((dx) => {
        const dy = 0.62 - Math.abs(dx) * 0.2;
        k.add(ico(1, 0), inner, { s: [0.22, 0.22, 0.1], p: [sd * 1.9 + dx, 1.05 + dy, frontZ([0, 0, -2.9], [1.45, 1.05, 2.4], dx, dy) + 0.02], noInk: true });
      });
    });
    // A satin bow at the neck and a cotton tail.
    const bowC = r.pick([0xff4f7a, 0x3a8de0, 0xffc928]);
    [-1, 1].forEach((sd) => k.add(new THREE.ConeGeometry(0.7, 1.4, 4), bowC, { r: [0, 0, sd * HALF_PI], s: [1, 1, 0.5], p: [sd * 0.75, 7.75, -2.75] }));
    k.add(sph(8, 6), shade(bowC, -0.1), { s: [0.42, 0.42, 0.3], p: [0, 7.75, -2.95] });
    k.add(lump(ico(1.3, 1), 0.1, seed), WHITE, { p: [0, 1.9, 3.7], jit: 0.03 });
    k.root.userData.faceRoad = true;
    return finish(k);
  });

  /* ── Toy Room landmarks ─────────────────────────────────────────────── */

  /** A teddy bear the size of a hill, sitting with its feet out (faces the road). */
  prop('teddy_giant', (r) => {
    const k = new Kit(r), sc = 2.5 * r.range(0.97, 1.03), seed = r.next() * 99;
    const [fur, lite] = r.pick([[0xc98a4b, 0xf2d0a0], [0xb7773c, 0xefc994], [0xd99a58, 0xf6dcb4]]);
    const nose = 0x3a2318, bowC = r.pick([RED, BLUE, GREEN]);
    const S = (v) => v.map((x) => x * sc);
    const plush = (g) => lump(g, 0.018, seed);
    k.add(plush(sph(18, 12)), fur, { s: S([4.2, 4.6, 3.7]), p: S([0, 4.6, 0.3]), jit: 0.025, grad: 0.1 });
    k.add(sph(12, 8), lite, { s: S([2.7, 2.9, 0.6]), p: S([0, 4.1, -3.0]), jit: 0.02 });
    k.add(plush(sph(18, 12)), fur, { s: S([3.6, 3.3, 3.2]), p: S([0, 10.3, -0.2]), jit: 0.025, grad: 0.1 });
    [-1, 1].forEach((sd) => {
      k.add(sph(12, 8), fur, { s: S([1.3, 1.3, 0.75]), p: S([sd * 2.75, 12.6, 0]), jit: 0.02 });
      k.add(sph(10, 6), lite, { s: S([0.8, 0.8, 0.3]), p: S([sd * 2.75, 12.55, -0.55]) });
      buttonEye(k, sd * 1.3 * sc, 10.9 * sc, (frontZ([0, 0, -0.2], [3.6, 3.3, 3.2], 1.3, 0.6) + 0.12) * sc, 0.42 * sc, -1);
      k.add(ico(1, 1), 0xff9a8a, { s: S([0.55, 0.32, 0.12]), p: S([sd * 2.25, 9.5, -2.55]), r: [0, sd * 0.55, 0], noInk: true });
    });
    // Muzzle, nose and a stitched smile.
    k.add(sph(12, 8), lite, { s: S([1.7, 1.25, 1.1]), p: S([0, 9.3, -2.95]), jit: 0.02 });
    k.add(sph(10, 7), nose, { s: S([0.62, 0.42, 0.42]), p: S([0, 9.95, -3.95]), grad: 0.3 });
    k.add(ico(1, 0), WHITE, { s: S([0.16, 0.08, 0.05]), p: S([-0.2, 10.15, -4.3]), noInk: true });
    k.add(new THREE.BoxGeometry(0.1 * sc, 0.55 * sc, 0.1 * sc), nose, { p: S([0, 9.35, -4.03]) });
    k.add(arcGeo(0.6, 0.09, 2.6), nose, { s: [sc, sc, sc], p: S([0, 9.66, -4.0]) });
    // Arms hanging by the tummy; legs stuck out with soft foot pads.
    [-1, 1].forEach((sd) => {
      k.add(sph(12, 8), fur, { s: S([1.35, 2.9, 1.35]), r: [-0.35, 0, sd * 0.45], p: S([sd * 3.9, 5.4, -1.0]), jit: 0.02 });
      k.add(sph(14, 9), fur, { s: S([1.6, 1.5, 2.8]), p: S([sd * 2.25, 1.5, -2.7]), jit: 0.02 });
      k.add(ico(1, 2), lite, { s: S([1.05, 1.1, 0.2]), p: S([sd * 2.25, 1.35, -5.42]), noInk: true });
      [-0.6, 0, 0.6].forEach((dx) => {
        const dy = 1.05 - Math.abs(dx) * 0.25;
        k.add(ico(1, 0), lite, { s: S([0.28, 0.26, 0.1]), p: S([sd * 2.25 + dx, 1.5 + dy, frontZ([0, 0, -2.7], [1.6, 1.5, 2.8], dx, dy) + 0.03]), noInk: true });
      });
    });
    // A patch sewn on its head with big stitches, and a bow tie.
    const PM = faceM([-0.49, 0.52, -0.7], [0, 1, 0], S([-1.9, 12.0, -2.33])).multiply(new THREE.Matrix4().makeRotationZ(0.25));
    const ps = 0.55 * sc;
    k.add(new THREE.BoxGeometry(2 * ps, 2 * ps, 0.1 * sc), r.pick([0x3a8de0, 0x37b34a, 0x8e5bd8]), { m: PM });
    [[0, 1], [0, -1], [1, 0], [-1, 0]].forEach(([ex, ey]) => [-0.55, 0, 0.55].forEach((t) =>
      k.add(new THREE.BoxGeometry(0.08 * sc, 0.34 * sc, 0.06 * sc), WHITE,
        { r: [0, 0, ex ? HALF_PI : 0], p: [ex ? ex * ps : t * ps, ex ? t * ps : ey * ps, 0.06 * sc], m: PM, noInk: true })));
    [-1, 1].forEach((sd) => k.add(new THREE.ConeGeometry(0.85, 1.6, 4), bowC, { r: [0, 0, sd * HALF_PI], s: [sc, sc, sc * 0.5], p: S([sd * 0.85, 7.35, -3.05]) }));
    k.add(sph(8, 6), shade(bowC, -0.12), { s: S([0.5, 0.5, 0.35]), p: S([0, 7.35, -3.3]) });
    k.root.userData.faceRoad = true;
    return finish(k);
  });

  /** A tall toy rocket standing on four fins, portholes toward the road. */
  prop('toy_rocket_big', (r) => {
    const k = new Kit(r), body = WHITE, [nose, band] = r.pick([[RED, BLUE], [BLUE, RED], [ORANGE, TEAL]]);
    const prof = [[0.001, 4.0], [4.2, 4.0], [5.0, 6.2], [5.4, 10], [5.4, 22], [5.1, 26.5], [4.3, 30.5], [3.0, 34], [1.5, 36.8], [0.001, 38.2]];
    k.add(new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 16), (cx, cy) => {
      if (cy > 30.6) return nose;
      if (cy > 29.2) return YELLOW;
      if (cy > 23.2 && cy < 25.4) return band;
      if (cy < 7.4) return nose;
      if (cy < 8.6) return YELLOW;
      return body;
    }, { jit: 0.02 });
    k.add(sph(10, 7), YELLOW, { s: 1.0, p: [0, 38.6, 0] });
    k.add(new THREE.LatheGeometry([[0.001, 4.05], [2.2, 4.05], [2.6, 3.0], [3.2, 1.7], [3.25, 1.5], [0.001, 1.5]].map(([x, y]) => new THREE.Vector2(x, y)), 12), 0x5a6070, { jit: 0.02 });
    // Four curved fins down to the floor, set diagonally.
    const fin = new THREE.Shape();
    fin.moveTo(4.6, 16.5);
    fin.bezierCurveTo(7.2, 14, 10.2, 8, 10.6, 0);
    fin.lineTo(8.6, 0);
    fin.bezierCurveTo(8.0, 3, 6.4, 4.6, 4.6, 5.0);
    fin.closePath();
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + i * HALF_PI;
      k.add(slab(fin, 1.0, 6), (cx, cy, cz) => (Math.hypot(cx, cz) > 9.2 || cy < 1.2 ? YELLOW : nose), { r: [0, a, 0], jit: 0.02 });
    }
    // Portholes: gold rims, blue glass with a glint.
    [12.5, 18.0].forEach((y, i) => {
      k.add(new THREE.TorusGeometry(1.6 - i * 0.2, 0.36, 5, 14), YELLOW, { p: [0, y, -5.3] });
      k.add(new THREE.CircleGeometry(1.6 - i * 0.2, 14), 0x3fa0e8, { r: [0, Math.PI, 0], p: [0, y, -5.32] });
      k.add(ico(1, 0), 0xdff4ff, { s: [0.38, 0.22, 0.05], r: [0, 0, 0.6], p: [-0.55, y + 0.55, -5.45], noInk: true });
    });
    // A big star on the nose and rivets round the band.
    k.add(slab(starShape(1.7, 0.75), 0.25), YELLOW, { p: [0, 31.6, -3.7], r: [0.38, Math.PI, 0] });
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * TAU;
      k.add(ico(0.2, 0), 0xd0d6e0, { p: [Math.cos(a) * 5.42, 22.6, Math.sin(a) * 5.42] });
    }
    k.root.userData.faceRoad = true;
    return finish(k);
  });

  /* ── Toy Room hazards ───────────────────────────────────────────────── */

  /** Block: a chunky lettered toy block, its big letter looking toward +Z. */
  hazard('toy_block', 'block', 'toybox', (r) => {
    const k = new Kit(r, true), node = new THREE.Group();
    letterBlock(k, 2.4, r.pick([RED, BLUE, GREEN, PURPLE, ORANGE]), node, { face: r.pick(['A', 'B', 'C', 'K', '*', '<']), faceIdx: 2 });
    node.position.y = 1.2;
    k.root.add(node);
    const out = sizeHazard(k, [2.8, 2.4, 2.6]);
    shadow(out, 3.4, 3.0);
    return out;
  });

  /** Roller: a striped bouncy ball; its wedges meet on the rolling axis, so they wheel round as it rolls. */
  hazard('bouncy_ball', 'roller', 'toybox', (r) => {
    const k = new Kit(r, true), R = 1.0, node = new THREE.Group();
    const cols = shuffled([RED, YELLOW, BLUE, GREEN, ORANGE, PURPLE], r);
    node.position.y = R;
    k.add(new THREE.SphereGeometry(R, 18, 12).rotateX(HALF_PI), (cx, cy, cz) => {
      if (Math.abs(cz) > 0.85 * R) return WHITE;             // clean caps: the first two rings
      return cols[Math.floor(((Math.atan2(cy, cx) / TAU + 1) % 1) * 6) % 6];
    }, { jit: 0.02 }, node);
    [-1, 1].forEach((sd) => {
      k.add(slab(starShape(0.32, 0.14), 0.06), sd > 0 ? RED : BLUE, { r: [0, sd > 0 ? 0 : Math.PI, 0], p: [0, 0, sd * (R - 0.01)], noInk: true }, node);
    });
    k.add(ico(1, 0), WHITE, { s: [0.2, 0.12, 0.05], r: [0, 0, 0.6], p: [-0.42, 0.55, 0.72], noInk: true }, node);
    return finishRoller(k, node, R);
  });

  /**
   * Geyser: a jack-in-the-box. Idle: lid shut. Warning: the lid sits ajar
   * (steady). Active: lid flung back and a grinning jester pops up on his
   * spring to 6 m (1.6 m wide), bobbing gently. Lid, spring, jester and the
   * crank on the side are one kept rig (plus its ink rig).
   */
  hazard('jack_in_box', 'geyser', 'toybox', (r) => {
    const k = new Kit(r, true), B = 2.1, H = 1.9, cols = shuffled([RED, BLUE, GREEN, PURPLE], r);
    k.add(new THREE.BoxGeometry(B, H, B), (cx, cy, cz) => {
      if (cy > H - 0.01) return 0x2a2140;                       // the dark inside, seen when open
      if (Math.abs(cz) > B / 2 - 0.01) return cz > 0 ? cols[0] : cols[2];
      return cols[1];
    }, { p: [0, H / 2, 0], jit: 0.02 });
    const gold = 0xf2c033;
    [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([sx, sz]) => k.add(new THREE.BoxGeometry(0.2, H + 0.04, 0.2), gold, { p: [sx * B / 2, H / 2, sz * B / 2] }));
    [-1, 1].forEach((s) => {
      k.add(new THREE.BoxGeometry(B + 0.2, 0.2, 0.2), gold, { p: [0, H - 0.08, s * B / 2] });
      k.add(new THREE.BoxGeometry(0.2, 0.2, B + 0.2), gold, { p: [s * B / 2, H - 0.08, 0] });
    });
    k.add(slab(starShape(0.62, 0.27), 0.08), YELLOW, { p: [0, 0.95, B / 2 + 0.03], noInk: true });
    k.add(slab(heartShape(0.95), 0.08), PINK, { r: [0, -HALF_PI, 0], p: [-B / 2 - 0.03, 0.95, 0], noInk: true });
    k.add(slab(starShape(0.5, 0.22), 0.08), YELLOW, { r: [0, Math.PI, 0], p: [0, 0.95, -B / 2 - 0.03], noInk: true });
    k.add(new THREE.CylinderGeometry(0.2, 0.2, 0.12, 10), gold, { r: [0, 0, HALF_PI], p: [B / 2 + 0.06, 1.0, 0] });
    A.ink(k.root, 0.055);

    // The movers, each built in its own frame.
    const lid = new THREE.Group(), spring = new THREE.Group(), jester = new THREE.Group(), crank = new THREE.Group();
    k.add(new THREE.BoxGeometry(B + 0.22, 0.22, B + 0.22), cols[3], { p: [0, H + 0.11, 0], jit: 0.02 }, lid);
    k.add(new THREE.CylinderGeometry(0.22, 0.26, 0.2, 10), gold, { p: [0, H + 0.3, 0.3] }, lid);
    const coil = [];
    for (let i = 0; i <= 44; i++) { const a = i / 44 * 5.5 * TAU; coil.push([Math.cos(a) * 0.36, i / 44, Math.sin(a) * 0.36]); }
    k.add(tubeGeo(coil, 0.075, 52, 4), 0xc9d3dc, {}, spring);
    // Jester: ruff, round face, red nose, big grin and a two-horned hat with bells.
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * TAU;
      k.add(sph(6, 4), i % 2 ? YELLOW : WHITE, { s: [0.3, 0.16, 0.3], p: [Math.cos(a) * 0.5, 0.16, Math.sin(a) * 0.5] }, jester);
    }
    k.add(new THREE.CylinderGeometry(0.42, 0.3, 0.3, 10), cols[0], { p: [0, 0.12, 0] }, jester);
    k.add(sph(12, 9), 0xfff0e2, { s: [0.62, 0.64, 0.6], p: [0, 0.86, 0] }, jester);
    [-1, 1].forEach((sd) => {
      eye(k, sd * 0.22, 0.98, 0.5, 0.15, 1, { parent: jester });
      k.add(ico(1, 0), 0xff8f9a, { s: [0.13, 0.08, 0.04], p: [sd * 0.38, 0.72, 0.5], noInk: true }, jester);
    });
    k.add(sph(8, 6), RED, { s: 0.13, p: [0, 0.82, 0.62] }, jester);
    k.add(arcGeo(0.25, 0.05, 2.6), 0xc0283a, { p: [0, 0.82, 0.55] }, jester);
    k.add(new THREE.CylinderGeometry(0.58, 0.62, 0.22, 12), YELLOW, { p: [0, 1.28, 0] }, jester);
    [-1, 1].forEach((sd) => {
      const tip = [sd * 0.74, 2.02, -0.05];
      k.add(rod([sd * 0.22, 1.3, 0], tip, 0.34, 0.06, 8), sd > 0 ? cols[1] : RED, {}, jester);
      k.add(sph(6, 4), YELLOW, { s: 0.14, p: tip }, jester);
    });
    k.add(sph(6, 4), YELLOW, { s: 0.13, p: [0, 1.58, 0] }, jester);
    k.add(new THREE.BoxGeometry(0.1, 0.1, 0.5), 0x9aa3ae, { p: [0, 0, 0.25] }, crank);
    k.add(new THREE.BoxGeometry(0.1, 0.55, 0.12), 0x9aa3ae, { p: [0.05, 0.27, 0.5] }, crank);
    k.add(new THREE.CylinderGeometry(0.09, 0.09, 0.32, 8), RED, { r: [0, 0, HALF_PI], p: [0.2, 0.52, 0.5] }, crank);
    crank.children.forEach((m) => m.geometry.rotateY(-HALF_PI));
    const nodes = [lid, spring, jester, crank];
    const inks = inkNodes(nodes, 0.05);
    const body = new Rig(nodes, k.mat), hull = new Rig(inks.nodes, inks.mat, { outline: true });
    body.mesh.name = 'jack';
    k.root.add(body.mesh, hull.mesh);
    const out = finish(k);

    const SPRING = 1.95, BASE = H - 0.1, CRANK = [B / 2 + 0.12, 1.0, 0];
    const st = { a: false, w: false, u: 0 };
    let crankA = 0;
    const f = (g, M) => {
      const ext = st.a ? 0.93 + 0.07 * Math.sin(st.u * TAU * 3) : 0;
      if (g === 0) poseM(M, [0, H, -B / 2 - 0.11], [0, H, -B / 2 - 0.11], st.a ? -1.95 : (st.w ? -0.32 : 0), 0, 0);
      else if (g === 1) poseM(M, [0, 0, 0], [0, BASE, 0], 0, 0, 0, ext ? [1, SPRING * ext, 1] : [0.9, 0.05, 0.9]);
      else if (g === 2) {
        if (ext) poseM(M, [0, 0, 0], [0, BASE + SPRING * ext, 0], 0, 0, 0.07 * Math.sin(st.u * TAU * 2));
        else poseM(M, [0, 0, 0], [0, 0.8, 0], 0, 0, 0, 0.001);
      } else poseM(M, [0, 0, 0], CRANK, crankA, 0, 0);
    };
    const pose = () => { body.pose(f); hull.pose(f); };
    pose();
    out.userData.setState = function (active, warn, u) {
      st.a = !!active; st.w = !!warn && !active; st.u = u || 0;
      pose();
    };
    out.userData.anim = function (t) { crankA = (t || 0) * 1.8; pose(); };
    return out;
  });

  /** Puddle: a spill of orange juice with floating slices, pulp and ice. */
  hazard('juice_spill', 'puddle', 'toybox', (r) => {
    const k = new Kit(r, true), HW = 1.7, HL = 2.86, seed = r.next() * 99;
    const juice = 0xffa21f, deep = 0xff8400, lite = 0xffc24d;
    const shape = puddleBase(k, [0.2, 0.42, 0.62, 0.8, 0.9, 0.955, 1],
      (rho, x, z) => (rho > 0.86 ? deep : (hash3(Math.round(x * 2.2), 0, Math.round(z * 2.2), seed) > 0.35 ? lite : juice)), 0xa04800, HW, HL);
    // Glossy streaks.
    for (let i = 0; i < 3; i++) {
      k.add(new THREE.CircleGeometry(1, 8), 0xfff1c4, { s: [0.12, 1, 0.5 + i * 0.12], r: [-HALF_PI, 0, 0], p: [r.range(-0.7, 0.7), 0.035, r.range(-1.6, 1.6)], noInk: true });
    }
    // Two orange slices lying in it.
    for (let i = 0; i < 2; i++) {
      const g = paintFaces(disc([0.15, 0.7, 0.84, 1], 12), (cx, cy, cz) => {
        const rho = Math.hypot(cx, cz);
        if (rho > 0.88) return 0xff7a00;
        if (rho > 0.72) return 0xfff3dc;
        return (Math.floor(((Math.atan2(cz, cx) / TAU + 1) % 1) * 12) % 2) ? 0xffb030 : 0xffcf5a;
      }, r, {});
      k.add(g, null, { s: [0.5, 1, 0.5], p: [r.range(-0.6, 0.6), 0.045 + i * 0.005, (i ? 1 : -1) * r.range(0.6, 1.6)], noInk: true });
    }
    // Ice cubes, and splashes round the rim.
    for (let i = 0; i < 3; i++) {
      k.add(new THREE.BoxGeometry(0.34, 0.26, 0.34), 0xe6f6ff, { r: [r.range(-0.3, 0.3), r.range(0, TAU), r.range(-0.3, 0.3)], p: [r.range(-0.9, 0.9), 0.1, r.range(-2, 2)], jit: 0.04 });
    }
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU + r.range(-0.12, 0.12), sd = shape(a) * 0.86, rad = 0.17 * r.range(0.8, 1.2);
      k.add(new THREE.SphereGeometry(rad, 8, 4, 0, TAU, 0, HALF_PI), i % 3 ? juice : lite, { s: [1.4, 0.6, 1.4], p: [Math.cos(a) * sd * HW, 0.02, Math.sin(a) * sd * HL], jit: 0.03 });
    }
    A.ink(k.root, 0.035);
    return finish(k, 0.02);
  });

  /* ── Ball-pit dressing (origin = the balls' surface) ─────────────────── */

  /** A shiny plastic ball, centre (x, y, z). */
  function plasticBall(k, x, y, z, R, col, segs) {
    k.add(new THREE.SphereGeometry(R, segs || 16, Math.round((segs || 16) * 0.75)), (cx, cy) => (cy - y > R * 0.45 ? shade(col, 0.1) : col),
      { jit: 0.015, grad: 0.16, y0: y - R, y1: y + R, p: [x, y, z] });
    k.add(ico(1, 0), WHITE, { s: [R * 0.2, R * 0.12, R * 0.06], r: [0.5, -0.6, 0.4], p: [x - R * 0.4, y + R * 0.58, z - R * 0.6] });
  }

  /** Two or three big bright balls bobbing half-sunk in the pit. */
  prop('giant_ball', (r) => {
    const k = new Kit(r), cols = shuffled([RED, YELLOW, BLUE, GREEN, ORANGE, PURPLE, PINK], r);
    const n = r.chance(0.5) ? 3 : 2;
    let a = r.range(0, TAU);
    const R0 = r.range(1.9, 2.2);
    plasticBall(k, 0, R0 * r.range(0.05, 0.25), 0, R0, cols[0]);
    for (let i = 1; i < n; i++) {
      const R = r.range(1.6, 2.1), d = R0 + R + r.range(0.3, 1.2);
      plasticBall(k, Math.cos(a) * d, R * r.range(0.0, 0.25), Math.sin(a) * d, R, cols[i]);
      a += r.range(1.7, 2.6);
    }
    return finishHere(k);
  });

  /**
   * A sweep of a closed cross-section along a path in the YZ plane (x across):
   * sec = [[x, n], ...] where n is the offset along the path's upward normal.
   */
  function sweepYZ(path, sec) {
    const pos = [], idx = [], M = sec.length;
    for (let i = 0; i < path.length; i++) {
      const p = path[i], a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)];
      let ty = b[1] - a[1], tz = b[2] - a[2];
      const l = Math.hypot(ty, tz) || 1; ty /= l; tz /= l;
      const ny = Math.abs(tz), nz = -ty * Math.sign(tz || 1);   // the up-ish normal, perpendicular in YZ
      sec.forEach(([sx, sn]) => pos.push(p[0] + sx, p[1] + ny * sn, p[2] + nz * sn));
    }
    for (let i = 0; i + 1 < path.length; i++) {
      for (let j = 0; j < M; j++) {
        const j1 = (j + 1) % M, a = i * M + j, b = i * M + j1, c = (i + 1) * M + j, d = (i + 1) * M + j1;
        idx.push(a, c, b, b, c, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  /** A toy slide: ladder at the back, a wavy chute whose foot dips into the balls (faces the road). */
  prop('toy_slide', (r) => {
    const k = new Kit(r), [chute, rail, leg] = r.pick([[RED, YELLOW, BLUE], [YELLOW, BLUE, RED], [BLUE, YELLOW, GREEN], [PURPLE, YELLOW, TEAL]]);
    const PY = 6.2, deck = r.pick([GREEN, ORANGE, PINK]);
    k.add(new THREE.BoxGeometry(3.0, 0.4, 3.0), deck, { p: [0, PY - 0.2, 0.2], jit: 0.02 });
    [[-1.3, -1.1], [1.3, -1.1]].forEach(([x, z]) => k.add(new THREE.CylinderGeometry(0.2, 0.2, PY + 2.2, 8), leg, { p: [x, (PY - 2.2) / 2 - 0.2, z] }));
    // Ladder rails lean back to the pit; chunky rungs.
    [-1.3, 1.3].forEach((x) => k.add(rod([x, -2.4, 4.2], [x, PY + 1.2, 1.4], 0.2, 0.2, 8), leg));
    for (let i = 0; i < 7; i++) {
      const t = (i + 0.6) / 7.4, y = -2.4 + t * (PY + 3.6), z = 4.2 - t * 2.8;
      if (y > -0.4) k.add(new THREE.CylinderGeometry(0.13, 0.13, 2.6, 6), rail, { r: [0, 0, HALF_PI], p: [0, y, z] });
    }
    // Hand rails round the deck and a round sign with a star.
    [-1.4, 1.4].forEach((x) => {
      k.add(rod([x, PY, -1.2], [x, PY + 1.3, -1.2], 0.12, 0.12, 6), rail);
      k.add(rod([x, PY + 1.3, -1.2], [x, PY + 1.3, 1.4], 0.12, 0.12, 6), rail);
    });
    k.add(new THREE.CylinderGeometry(0.9, 0.9, 0.25, 14), WHITE, { r: [HALF_PI, 0, 0], p: [0, PY + 2.0, 1.4] });
    k.add(slab(starShape(0.65, 0.28), 0.1), YELLOW, { r: [0, Math.PI, 0], p: [0, PY + 2.0, 1.22] });
    k.add(rod([0, PY + 0.2, 1.4], [0, PY + 1.1, 1.4], 0.12, 0.12, 6), rail);
    // The chute: a U trough sweeping down and away with one happy bump.
    const ctrl = [[0, PY, -1.3], [0, PY - 0.5, -2.4], [0, PY - 2.6, -4.4], [0, PY - 3.6, -5.8], [0, PY - 3.7, -6.6], [0, PY - 4.9, -8.2], [0, -0.5, -10], [0, -1.4, -10.9]];
    const curve = new THREE.CatmullRomCurve3(ctrl.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
    const path = curve.getPoints(26).map((v) => [v.x, v.y, v.z]);
    const sec = [];
    const U = [[-1.25, 0.75], [-1.2, 0.25], [-1.0, -0.05], [-0.6, -0.2], [0, -0.25], [0.6, -0.2], [1.0, -0.05], [1.2, 0.25], [1.25, 0.75]];
    U.forEach((p) => sec.push(p));
    for (let i = U.length - 1; i >= 0; i--) sec.push([U[i][0] * 1.13, U[i][1] - 0.2]);
    k.add(sweepYZ(path, sec), chute, { jit: 0.02 });
    // Built at playground size, then shrunk to sit ~10 m long in the pit.
    k.root.traverse((m) => { if (m.isMesh) m.geometry.scale(0.72, 0.72, 0.72); });
    k.root.userData.faceRoad = true;
    return finishHere(k);
  });

  /** A beach bucket full of balls and a spade, half sunk and tipped. */
  prop('beach_bucket', (r) => {
    const k = new Kit(r), [col, spadeC] = r.pick([[RED, BLUE], [BLUE, YELLOW], [YELLOW, RED], [GREEN, ORANGE], [PINK, TEAL]]);
    const node = new THREE.Group();
    const H = 2.4, R1 = 1.35, R0 = 1.05;
    k.add(new THREE.CylinderGeometry(R1, R0, H, 14, 2, true), (cx, cy) => (Math.abs(cy) < 0.3 ? WHITE : col), { p: [0, 0, 0], jit: 0.02 }, node);
    k.add(flip(new THREE.CylinderGeometry(R1 * 0.95, R0 * 0.95, H, 14, 1, true)), shade(col, -0.18), {}, node);
    k.add(new THREE.TorusGeometry(R1, 0.13, 5, 16), shade(col, 0.08), { r: [HALF_PI, 0, 0], p: [0, H / 2, 0] }, node);
    k.add(new THREE.CircleGeometry(R0, 14), shade(col, -0.1), { r: [HALF_PI, 0, 0], p: [0, -H / 2, 0] }, node);
    // Full to the brim with little pit balls.
    const balls = [RED, YELLOW, BLUE, GREEN, ORANGE, PINK];
    for (let i = 0; i < 9; i++) {
      const a = i * 2.4, d = i ? 0.35 + (i % 3) * 0.3 : 0;
      k.add(sph(8, 6), balls[i % balls.length], { s: 0.34, p: [Math.cos(a) * d, H / 2 - 0.12 + (i % 2) * 0.12, Math.sin(a) * d] }, node);
    }
    // A handle arching over, pinned on two lugs.
    k.add(new THREE.TorusGeometry(R1 * 0.98, 0.07, 4, 14, Math.PI), 0xe8e0d0, { r: [0, 0, 0], p: [0, H / 2 - 0.2, 0], s: [1, 0.9, 1] }, node);
    [-1, 1].forEach((sd) => k.add(new THREE.CylinderGeometry(0.14, 0.14, 0.16, 8), shade(col, -0.1), { r: [0, 0, HALF_PI], p: [sd * R1 * 1.0, H / 2 - 0.2, 0] }, node));
    node.rotation.set(r.range(0.25, 0.4), r.range(0, TAU), r.range(-0.1, 0.1), 'YXZ');
    node.position.y = 0.15;
    k.root.add(node);
    // The spade leans on the bucket, grip sunk in the balls and blade up.
    const sa = r.range(0, TAU), ca = Math.cos(sa), sn = Math.sin(sa);
    const foot = [ca * 2.6, -0.8, sn * 2.6], top = [ca * 1.75, 1.9, sn * 1.75];
    k.add(rod(foot, top, 0.11, 0.11, 6), YELLOW);
    const L = dist(foot, top), d = [(top[0] - foot[0]) / L, (top[1] - foot[1]) / L, (top[2] - foot[2]) / L];
    const blade = new THREE.Shape();
    blade.moveTo(-0.16, -0.75); blade.lineTo(0.16, -0.75); blade.lineTo(0.55, -0.35); blade.lineTo(0.5, 0.35);
    blade.quadraticCurveTo(0, 0.95, -0.5, 0.35); blade.lineTo(-0.55, -0.35); blade.closePath();
    k.add(span(slab(blade, 0.12, 4), top, [top[0] + d[0] * 1.5, top[1] + d[1] * 1.5, top[2] + d[2] * 1.5]), spadeC);
    return finishHere(k);
  });

  /* ── Road set pieces: shared arch path ──────────────────────────────────
   * Points every `step` metres along a door-shaped arch in the XY plane: up
   * the left leg (x = -a) from y0 to legTop, over a half-ellipse crown
   * (semi-axes a, b) and down the right leg. Each point carries its unit
   * tangent and its inward normal (toward the opening).
   */
  function archPath(a, legTop, b, y0, step) {
    const dense = [];
    for (let i = 0; i <= 40; i++) dense.push([-a, y0 + (legTop - y0) * i / 40]);
    for (let i = 1; i <= 120; i++) { const t = Math.PI - Math.PI * i / 120; dense.push([a * Math.cos(t), legTop + b * Math.sin(t)]); }
    for (let i = 1; i <= 40; i++) dense.push([a, legTop - (legTop - y0) * i / 40]);
    const cum = [0];
    for (let i = 1; i < dense.length; i++) cum.push(cum[i - 1] + Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]));
    const L = cum[cum.length - 1], n = Math.max(2, Math.round(L / step)), out = [];
    let j = 0;
    for (let i = 0; i <= n; i++) {
      const s = L * i / n;
      while (j < dense.length - 2 && cum[j + 1] < s) j++;
      const u = (s - cum[j]) / ((cum[j + 1] - cum[j]) || 1);
      const p = [dense[j][0] + (dense[j + 1][0] - dense[j][0]) * u, dense[j][1] + (dense[j + 1][1] - dense[j][1]) * u];
      const tx = dense[j + 1][0] - dense[j][0], ty = dense[j + 1][1] - dense[j][1], tl = Math.hypot(tx, ty) || 1;
      out.push({ p: [p[0], p[1], 0], t: [tx / tl, ty / tl, 0], n: [ty / tl, -tx / tl, 0], s, L });
    }
    return out;
  }
  const _za = new THREE.Vector3(0, 0, 1), _ta = new THREE.Vector3(), _qa = new THREE.Quaternion();
  /** A matrix turning local +Z onto the tangent t at p. */
  function alongM(p, t) {
    _qa.setFromUnitVectors(_za, _ta.set(t[0], t[1], t[2]));
    return new THREE.Matrix4().makeRotationFromQuaternion(_qa).setPosition(p[0], p[1], p[2]);
  }

  /** A soap bubble: pale, with pink and cyan tints round its rim and a glint. */
  function bubble(k, x, y, z, R, parent) {
    k.add(sph(10, 7), (cx, cy, cz) => {
      const nx = (cx - x) / R, ny = (cy - y) / R;
      if (ny > 0.55 && nx < 0) return 0xffffff;
      return nx > 0.45 ? 0xffc6ec : (ny < -0.45 ? 0xb4ecff : 0xdff6ff);
    }, { s: R, p: [x, y, z] }, parent);
    k.add(ico(1, 0), WHITE, { s: [R * 0.24, R * 0.14, R * 0.06], r: [0, 0, 0.6], p: [x - R * 0.42, y + R * 0.5, z - R * 0.74] }, parent);
  }

  /**
   * A giant toy bubble machine straddling the road: two chunky machine
   * towers with fan grilles, a beam with button lights, a spinning wheel of
   * bubble wands and bubble-mix bottles on top, bubbles bobbing above.
   */
  prop('bubble_machine_gate', (r) => {
    const k = new Kit(r), [body, beam, trim] = r.pick([[TEAL, YELLOW, PINK], [PURPLE, YELLOW, TEAL], [BLUE, ORANGE, YELLOW]]);
    const PX = 15.0, PW = 4.2, PD = 6.0, BY = 12.6, BH = 3.0;
    [-1, 1].forEach((sd) => {
      const x = sd * PX;
      k.add(roundBox(PW + 0.6, 1.2, PD + 0.6, 0.35, 10, 6), shade(body, -0.12), { p: [x, 0.6, 0], jit: 0.02 });
      k.add(roundBox(PW, BY - 0.6, PD, 0.25, 10, 8), body, { p: [x, 0.6 + (BY - 0.6) / 2, 0], jit: 0.02, grad: 0.12 });
      // A big round fan grille toward the karts, a smaller one on the inside face.
      [[0, -PD / 2 - 0.05, 1.7, 7.4], [-sd * (PW / 2 + 0.05), 0, 1.2, 4.6]].forEach(([dx, dz, rr, y], i) => {
        const M = i ? faceM([-sd, 0, 0], [0, 1, 0], [x + dx, y, dz]) : faceM([0, 0, -1], [0, 1, 0], [x, y, dz]);
        k.add(new THREE.TorusGeometry(rr, 0.26, 5, 16), trim, { m: M });
        k.add(new THREE.CircleGeometry(rr, 16), 0x2a2f4a, { m: M });
        for (let s = 0; s < 4; s++) k.add(new THREE.BoxGeometry(rr * 2, 0.14, 0.1), 0xdfe6ee, { r: [0, 0, s * Math.PI / 4], p: [0, 0, 0.06], m: M });
        k.add(new THREE.CylinderGeometry(rr * 0.3, rr * 0.3, 0.3, 10), trim, { r: [HALF_PI, 0, 0], p: [0, 0, 0.1], m: M });
      });
      // Three big buttons under the fan.
      [RED, YELLOW, GREEN].forEach((c, i) => k.add(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 10), c, { r: [HALF_PI, 0, 0], p: [x + (i - 1) * 1.2, 4.2, -PD / 2 - 0.08] }));
    });
    // The beam across the top, with a row of coloured lights along its front.
    k.add(roundBox(2 * PX + PW, BH, 4.4, 0.25, 16, 6), beam, { p: [0, BY + BH / 2, 0], jit: 0.02, grad: 0.1 });
    const lights = [RED, BLUE, GREEN, PINK, ORANGE, PURPLE];
    for (let i = 0; i < 12; i++) {
      const x = -15.4 + i * 2.8;
      if (Math.abs(x) < 4.6) continue;
      k.glow(sph(8, 6), shade(lights[i % lights.length], -0.08), { s: [0.42, 0.42, 0.25], p: [x, BY + BH / 2, -2.2] });
    }
    // Bubble-mix bottles on top of each tower.
    [-1, 1].forEach((sd) => {
      const x = sd * (PX - 0.2);
      k.add(new THREE.CylinderGeometry(1.25, 1.35, 3.2, 12), (cx, cy) => (cy > BY + BH + 0.9 && cy < BY + BH + 2.3 ? WHITE : 0xff7ac0), { p: [x, BY + BH + 1.6, 0.4], jit: 0.02 });
      k.add(new THREE.CylinderGeometry(0.75, 1.25, 0.6, 12), 0xff7ac0, { p: [x, BY + BH + 3.5, 0.4] });
      k.add(new THREE.CylinderGeometry(0.62, 0.62, 0.7, 10), trim, { p: [x, BY + BH + 4.15, 0.4] });
      k.add(slab(heartShape(1.1), 0.1), 0xff4f9a, { r: [0, Math.PI, 0], p: [x, BY + BH + 1.6, 0.4 - 1.32] });
    });
    // The wand wheel: a hub and eight rainbow wand loops, spinning.
    const wheel = new THREE.Group(), WY = BY + BH + 0.9;
    k.add(new THREE.CylinderGeometry(1.3, 1.3, 0.5, 14), trim, { r: [HALF_PI, 0, 0] }, wheel);
    k.add(slab(starShape(0.9, 0.4), 0.2), YELLOW, { r: [0, Math.PI, 0], p: [0, 0, -0.32] }, wheel);
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * TAU, c = BRIGHTS[i % BRIGHTS.length];
      k.add(new THREE.BoxGeometry(0.22, 1.6, 0.22), 0xdfe6ee, { r: [0, 0, a - HALF_PI], p: [Math.cos(a) * 1.75, Math.sin(a) * 1.75, 0] }, wheel);
      k.add(new THREE.TorusGeometry(0.75, 0.2, 5, 12), c, { p: [Math.cos(a) * 3.0, Math.sin(a) * 3.0, 0] }, wheel);
    }
    const wn = keep(wheel);
    wn.position.set(0, WY, -2.6);
    k.root.add(wn);
    spin(k, wn, 'z', 0.7, r.range(0, TAU));
    // Bubbles drifting up off the machine.
    const bub = new THREE.Group();
    const spots = [[-8.5, 17.4, -0.8, 1.5], [-5.2, 19.6, 0.6, 1.0], [6.0, 18.2, -1.0, 1.7], [9.8, 20.6, 0.4, 1.1], [-11.2, 21.0, 1.0, 0.9], [13.0, 22.0, -0.4, 0.8]];
    spots.forEach(([x, y, z, R]) => bubble(k, x, y, z, R * r.range(0.9, 1.1), bub));
    const bn = keep(bub);
    k.root.add(bn);
    bob(k, bn, 'y', 0.9, 0.35, r.range(0, TAU));
    k.root.userData.faceRoad = true;
    return finishHere(k);
  });

  /**
   * A rainbow arch of stacking rings threaded round a door-shaped path,
   * standing on two round toy bases, a star on top. Static (welded).
   */
  prop('toy_arch', (r) => {
    const k = new Kit(r), rainbow = [RED, ORANGE, YELLOW, GREEN, BLUE, PURPLE];
    const A0 = 14.6, LEG = 12.5, CROWN = 2.6;
    const pts = archPath(A0, LEG, CROWN, 1.6, 1.32);
    const off = r.int(0, 5);
    pts.forEach((q, i) => {
      if (i === 0 || i === pts.length - 1) return;
      k.add(new THREE.TorusGeometry(0.95, 0.5, 6, 10), rainbow[(i + off) % 6], { m: alongM(q.p, q.t), jit: 0.03 });
    });
    [-1, 1].forEach((sd) => {
      k.add(new THREE.CylinderGeometry(2.0, 2.2, 1.3, 14), sd > 0 ? BLUE : RED, { s: [1, 1, 0.66], p: [sd * A0, 0.65, 0], jit: 0.02 });
      k.add(new THREE.CylinderGeometry(0.5, 0.5, 0.5, 10), YELLOW, { p: [sd * A0, 1.45, 0] });
    });
    k.add(slab(starShape(1.9, 0.85), 0.7), YELLOW, { p: [0, LEG + CROWN + 1.45 + 1.7, 0], jit: 0.02 });
    return finishHere(k);
  });

  /* ════════════════════════════════════════════════════════════════════════
   * FUNFAIR — sunset golds and pinks, red-and-white stripes, gold trim, bulbs
   * ════════════════════════════════════════════════════════════════════════ */
  const FRED = 0xe8392f, FWHITE = 0xfff6ea, GOLD = 0xf2c033, DGOLD = 0xc98f1c, NAVY = 0x2b2f6b;
  const FPINK = 0xff6aa8, SKY = 0x48b6f0, LILAC = 0xa77bf0, MINT = 0x4fd6a0;
  /** Bulb colours: deep and saturated, so the unlit material never reads as white. */
  const BULBS = [0xffa514, 0xff4f6e, 0xffcf1f, 0xff6ac0, 0x3fc8ff];
  const BALLOONS = [FRED, FPINK, 0xffc928, SKY, LILAC, MINT, 0xff8a1e];

  /** Vertical stripes round a centre: n bands alternating a / b. */
  const stripesA = (a, b, n, cx0, cz0) => (cx, cy, cz) => ((Math.floor(((Math.atan2(cz - (cz0 || 0), cx - (cx0 || 0)) / TAU + 1) % 1) * n) & 1) ? b : a);
  /** A glowing bulb. */
  function bulb(k, x, y, z, r, col, parent) {
    k.glow(ico(r, 0), col, { p: [x, y, z] }, parent);
  }
  /** A party balloon at (x, y, z): an egg with a knot, R round; heart/star foils when shape says so. */
  function balloon(k, x, y, z, R, col, parent, shape) {
    if (shape === 'star' || shape === 'heart') {
      const g = shape === 'star' ? slab(starShape(R * 1.25, R * 0.58), R * 0.45, 3) : slab(heartShape(R * 2.3), R * 0.45, 3);
      k.add(g, col, { p: [x, y, z], r: [0, k.rng.range(-0.5, 0.5), 0] }, parent);
      return;
    }
    k.add(sph(8, 5), (cx, cy) => (cy - y > R * 0.5 ? shade(col, 0.1) : col), { s: [R, R * 1.17, R], p: [x, y, z], jit: 0.015 }, parent);
    k.add(new THREE.ConeGeometry(R * 0.16, R * 0.24, 4), shade(col, -0.1), { p: [x, y - R * 1.2, z] }, parent);
  }
  /** A row of scalloped flaps (a valance) along X from x0 to x1 at height y, hanging toward -Y, facing -Z. */
  function scallops(k, x0, x1, y, z, n, cols, R, o) {
    const w = (x1 - x0) / n;
    for (let i = 0; i < n; i++) {
      const g = new THREE.CircleGeometry(w / 2, 6, Math.PI, Math.PI);
      k.add(twoSided(g), cols[i % cols.length], Object.assign({ s: [1, (R || 1), 1], p: [x0 + w * (i + 0.5), y, z] }, o || {}));
    }
  }
  /** A ring of scalloped flaps round Y at radius rad, hanging from y. */
  function scallopRing(k, rad, y, n, cols, drop) {
    const w = TAU * rad / n;
    for (let i = 0; i < n; i++) {
      const a = (i + 0.5) / n * TAU;
      const g = twoSided(new THREE.CircleGeometry(w / 2, 6, Math.PI, Math.PI));
      k.add(g, cols[i % cols.length], { s: [1, drop || 1, 1], r: [0, HALF_PI - a, 0], p: [Math.cos(a) * rad, y, Math.sin(a) * rad] });
    }
  }
  /** A spoked cart wheel in the YZ plane (axle along X). */
  function cartWheel(k, x, y, z, R, rim, hub, parent) {
    k.add(new THREE.TorusGeometry(R, R * 0.12, 4, 14), rim, { r: [0, HALF_PI, 0], p: [x, y, z] }, parent);
    for (let i = 0; i < 4; i++) k.add(new THREE.BoxGeometry(0.06, R * 2, 0.06), rim, { r: [i * Math.PI / 4, 0, 0], p: [x, y, z] }, parent);
    k.add(new THREE.CylinderGeometry(R * 0.2, R * 0.2, 0.18, 8), hub, { r: [0, 0, HALF_PI], p: [x, y, z] }, parent);
  }

  /* ── Funfair near ───────────────────────────────────────────────────── */

  /** The balloon seller's cart: a red-and-gold barrow with a swaying bunch of balloons. */
  prop('balloon_cart', (r) => {
    const k = new Kit(r), body = r.pick([FRED, SKY, FPINK]);
    k.add(new THREE.BoxGeometry(2.2, 1.0, 1.3), (cx, cy) => (cy > 1.7 ? GOLD : ((Math.floor((cx + 1.1) / 0.275) & 1) ? body : FWHITE)), { p: [0, 1.4, 0], jit: 0.02 });
    k.add(new THREE.BoxGeometry(2.36, 0.14, 1.46), GOLD, { p: [0, 0.9, 0] });
    k.add(new THREE.BoxGeometry(2.36, 0.14, 1.46), GOLD, { p: [0, 1.93, 0] });
    [-1, 1].forEach((sd) => cartWheel(k, sd * 1.24, 0.62, 0, 0.6, DGOLD, FRED));
    k.add(new THREE.CylinderGeometry(0.06, 0.06, 2.5, 6), DGOLD, { r: [0, 0, HALF_PI], p: [0, 0.62, 0] });
    // Handles and a resting leg at the back.
    [-1, 1].forEach((sd) => {
      k.add(rod([sd * 0.8, 1.1, 0.6], [sd * 0.75, 1.15, 1.9], 0.06, 0.06, 5), DGOLD);
      k.add(rod([sd * 0.8, 1.0, 0.55], [sd * 0.8, 0.0, 0.75], 0.06, 0.06, 5), DGOLD);
    });
    k.add(slab(starShape(0.32, 0.14), 0.06), GOLD, { r: [0, Math.PI, 0], p: [0, 1.4, -0.68] });
    // The pole and the bunch, which sways about the pole top.
    k.add(rod([0, 1.9, 0], [0, 2.95, 0], 0.07, 0.06, 6), FWHITE);
    const bunch = new THREE.Group(), cols = shuffled(BALLOONS, r), top = [0, 0, 0];
    const spots = [[0, 2.15, 0], [-0.75, 1.75, 0.2], [0.75, 1.8, -0.15], [-0.4, 1.6, -0.65], [0.4, 1.65, 0.65], [0, 1.45, 0.75],
      [-1.15, 1.0, -0.3], [1.15, 1.05, 0.35], [-0.35, 2.55, 0.4], [0.5, 2.5, -0.35], [0.05, 1.15, -0.95]];
    spots.forEach((p, i) => {
      const R = 0.42 * r.range(0.92, 1.08), x = p[0] + r.range(-0.06, 0.06), y = p[1] + r.range(-0.06, 0.06), z = p[2];
      const shape = i === 0 ? 'star' : (i === 5 ? 'heart' : null);
      balloon(k, x, y, z, R, shape === 'star' ? GOLD : (shape === 'heart' ? FRED : cols[i % cols.length]), bunch, shape);
      k.add(bar(top, [x, y - R * 1.25, z], 0.025), 0x5a5560, {}, bunch);
    });
    const bn = keep(bunch);
    bn.position.set(0, 2.95, 0);
    k.root.add(bn);
    const ph = r.range(0, TAU);
    onAnim(k, (t) => bn.rotation.set(0.06 * Math.sin(0.9 * t + ph), 0.2 * Math.sin(0.4 * t + ph), 0.07 * Math.sin(1.1 * t + ph * 1.3)));
    return finish(k);
  });

  /** A fluffy popcorn puff: two overlapping lumps. */
  function popcorn(k, x, y, z, R, i) {
    const c = i % 4 ? 0xfff4d0 : 0xffd770;
    k.add(lump(ico(R, 0), 0.12, i), c, { p: [x, y, z] });
    k.add(lump(ico(R * 0.75, 0), 0.12, i + 7), shade(c, 0.04), { r: [0.6, i, 0.3], p: [x + R * 0.45, y + R * 0.35, z - R * 0.25] });
  }

  /** A striped popcorn kiosk with a counter toward the road and a giant bucket on its roof. */
  prop('popcorn_stand', (r) => {
    const k = new Kit(r), st = r.pick([FRED, FPINK, SKY]);
    const W = 2.6, D = 2.0, H = 2.1, y0 = 0.25;
    // Four striped walls (planes, so the stripes cost nothing on the roof and floor).
    const stripe = (u, w) => ((Math.floor(u / w) & 1) ? FWHITE : st);
    [-1, 1].forEach((sd) => {
      k.add(paintFaces(new THREE.PlaneGeometry(W, H, 8, 1), (cx) => stripe(cx + W / 2, W / 8), r, { jit: 0.02 }), null, { r: [0, sd > 0 ? 0 : Math.PI, 0], p: [0, y0 + H / 2, sd * D / 2] });
      k.add(paintFaces(new THREE.PlaneGeometry(D, H, 6, 1), (cx) => stripe(cx + D / 2, D / 6), r, { jit: 0.02 }), null, { r: [0, sd * HALF_PI, 0], p: [sd * W / 2, y0 + H / 2, 0] });
    });
    [y0 + 0.08, y0 + H - 0.05].forEach((y) => k.add(new THREE.BoxGeometry(W + 0.14, 0.16, D + 0.14), GOLD, { p: [0, y, 0] }));
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => k.add(new THREE.CylinderGeometry(0.17, 0.17, 0.12, 8), 0x3a3f4a, { r: [0, 0, HALF_PI], p: [sx * (W / 2 - 0.3), 0.17, sz * (D / 2 + 0.07)] }));
    // Serving window full of popcorn, a gold counter under it.
    k.add(new THREE.BoxGeometry(1.7, 0.95, 0.06), NAVY, { p: [0, y0 + 1.45, -D / 2 - 0.02] });
    k.add(new THREE.BoxGeometry(1.95, 0.12, 0.45), GOLD, { p: [0, y0 + 0.92, -D / 2 - 0.2] });
    for (let i = 0; i < 6; i++) popcorn(k, -0.62 + i * 0.25, y0 + 1.07 + (i % 2) * 0.1, -D / 2 - 0.1, 0.16, i);
    // Roof with a scalloped valance, then the bucket overflowing with popcorn.
    k.add(new THREE.BoxGeometry(W + 0.5, 0.18, D + 0.5), st, { p: [0, y0 + H + 0.09, 0] });
    scallops(k, -W / 2 - 0.25, W / 2 + 0.25, y0 + H, -D / 2 - 0.26, 7, [GOLD, st]);
    const by = y0 + H + 0.18;
    k.add(new THREE.CylinderGeometry(0.95, 0.68, 1.35, 12, 1, true), stripesA(FRED, FWHITE, 12), { p: [0, by + 0.68, 0] });
    k.add(new THREE.TorusGeometry(0.95, 0.07, 4, 14), GOLD, { r: [HALF_PI, 0, 0], p: [0, by + 1.35, 0] });
    k.add(new THREE.CircleGeometry(0.92, 12), 0xfff0c0, { r: [-HALF_PI, 0, 0], p: [0, by + 1.3, 0] });
    for (let i = 0; i < 11; i++) {
      const a = i * 2.4, d = i ? 0.25 + (i % 3) * 0.24 : 0;
      popcorn(k, Math.cos(a) * d, by + 1.4 + (0.62 - d) * 0.45 + (i % 2) * 0.08, Math.sin(a) * d, 0.22, i);
    }
    k.add(slab(starShape(0.32, 0.14), 0.06), GOLD, { r: [0, Math.PI, 0], p: [0, by + 0.62, -0.84] });
    for (let i = 0; i < 6; i++) bulb(k, -W / 2 + 0.1 + i * (W - 0.2) / 5, y0 + H - 0.12, -D / 2 - 0.28, 0.09, BULBS[i % BULBS.length]);
    k.root.userData.faceRoad = true;
    return finish(k);
  });

  /** A striped post whose lantern top trails four swags of glowing bulbs down to little stakes. */
  prop('lamp_garland', (r) => {
    const k = new Kit(r), H = 5.0, cols = shuffled(BULBS, r);
    k.add(new THREE.CylinderGeometry(0.13, 0.15, H, 8, 10), (cx, cy, cz) => ((Math.floor(cy * 2.2 + Math.atan2(cz, cx) / TAU * 2 + 10) & 1) ? FRED : FWHITE), { p: [0, H / 2, 0] });
    k.add(new THREE.CylinderGeometry(0.45, 0.55, 0.25, 10), DGOLD, { p: [0, 0.12, 0] });
    k.add(new THREE.CylinderGeometry(0.3, 0.2, 0.2, 8), GOLD, { p: [0, H + 0.05, 0] });
    bulb(k, 0, H + 0.42, 0, 0.3, 0xffa514);
    k.add(new THREE.ConeGeometry(0.4, 0.35, 8), GOLD, { p: [0, H + 0.85, 0] });
    k.add(sph(6, 4), GOLD, { s: 0.12, p: [0, H + 1.08, 0] });
    const n = 4, a0 = r.range(0, TAU);
    for (let s = 0; s < n; s++) {
      const a = a0 + s / n * TAU + r.range(-0.15, 0.15), R = r.range(3.4, 4.2);
      const end = [Math.cos(a) * R, 1.0, Math.sin(a) * R], top = [Math.cos(a) * 0.15, H - 0.15, Math.sin(a) * 0.15];
      k.add(rod([end[0], 0, end[2]], [end[0], 1.1, end[2]], 0.06, 0.05, 5), DGOLD);
      const pts = [];
      for (let i = 0; i <= 10; i++) {
        const t = i / 10;
        pts.push([top[0] + (end[0] - top[0]) * t, top[1] + (end[1] - top[1]) * t - 0.7 * Math.sin(Math.PI * t), top[2] + (end[2] - top[2]) * t]);
      }
      k.add(tubeGeo(pts, 0.025, 12, 3), 0x3a3540);
      for (let i = 1; i <= 6; i++) {
        const t = i / 7, x = top[0] + (end[0] - top[0]) * t, z = top[2] + (end[2] - top[2]) * t;
        const y = top[1] + (end[1] - top[1]) * t - 0.7 * Math.sin(Math.PI * t) - 0.12;
        bulb(k, x, y, z, 0.12, cols[(i + s) % cols.length]);
      }
    }
    return finish(k);
  });

  /** A small plush prize: a round-headed bear or bunny, sitting (cheap: ~90 triangles). */
  function plushPrize(k, x, y, z, s, col, kind) {
    k.add(ico(1, 0), col, { s: [s * 0.42, s * 0.4, s * 0.36], p: [x, y + s * 0.38, z] });
    k.add(sph(6, 4), col, { s: s * 0.34, p: [x, y + s * 0.95, z] });
    if (kind === 'bunny') [-1, 1].forEach((sd) => k.add(new THREE.OctahedronGeometry(1, 0), col, { s: [s * 0.08, s * 0.3, s * 0.06], r: [0, 0, -sd * 0.2], p: [x + sd * s * 0.14, y + s * 1.4, z] }));
    else [-1, 1].forEach((sd) => k.add(new THREE.OctahedronGeometry(1, 0), col, { s: [s * 0.12, s * 0.12, s * 0.07], p: [x + sd * s * 0.26, y + s * 1.22, z] }));
    [-1, 1].forEach((sd) => k.add(new THREE.OctahedronGeometry(1, 0), 0x1c1824, { s: s * 0.055, p: [x + sd * s * 0.12, y + s * 1.0, z - s * 0.31] }));
  }

  /** A hoopla booth: striped counter and roof, shelves of plush prizes, bulbs round the front. */
  prop('prize_booth', (r) => {
    const k = new Kit(r), st = r.pick([FRED, LILAC, SKY]), W = 4.4, D = 2.6, H = 3.5;
    k.add(new THREE.BoxGeometry(W, H, 0.2), shade(st, -0.15), { p: [0, H / 2, D / 2] });
    [-1, 1].forEach((sd) => k.add(new THREE.BoxGeometry(0.2, H, D), FWHITE, { p: [sd * W / 2, H / 2, 0] }));
    // Counter with a striped front.
    k.add(new THREE.BoxGeometry(W, 1.05, 0.3, 10, 1, 1), (cx) => ((Math.floor((cx + W / 2) / (W / 10)) & 1) ? FWHITE : st), { p: [0, 0.53, -D / 2 + 0.15] });
    k.add(new THREE.BoxGeometry(W + 0.2, 0.14, 0.7), GOLD, { p: [0, 1.12, -D / 2 + 0.2] });
    // A can pyramid to knock down, at one end of the counter.
    const canC = [0xd8dee6, FRED, 0xd8dee6];
    [[0, 0], [1, 0], [0.5, 1]].forEach(([i, j], n) => k.add(new THREE.CylinderGeometry(0.13, 0.13, 0.3, 6), canC[n % 3], { p: [1.1 + i * 0.28, 1.34 + j * 0.31, -D / 2 + 0.2] }));
    // Shelves of plush prizes.
    const pc = shuffled([FPINK, SKY, 0xffc928, LILAC, MINT, 0xff8a1e, 0xffffff], r);
    [1.5, 2.45].forEach((y, row) => {
      k.add(new THREE.BoxGeometry(W - 0.3, 0.1, 0.7), DGOLD, { p: [0, y, D / 2 - 0.45] });
      for (let i = 0; i < 3; i++) plushPrize(k, -1.3 + i * 1.3 + row * 0.3, y + 0.05, D / 2 - 0.45, 0.7, pc[(i + row * 3) % pc.length], (i + row) % 2 ? 'bunny' : 'bear');
    });
    // Corner posts and a striped gable roof with a scalloped front and a star sign.
    [-1, 1].forEach((sd) => k.add(new THREE.CylinderGeometry(0.1, 0.1, H, 6, 4), (cx, cy) => ((Math.floor(cy * 1.15) & 1) ? FRED : FWHITE), { p: [sd * (W / 2 - 0.05), H / 2, -D / 2 + 0.05] }));
    [-1, 1].forEach((sd) => k.add(new THREE.BoxGeometry(W + 0.6, 0.12, D / 2 + 0.55, 10, 1, 1), (cx) => ((Math.floor((cx + W / 2 + 0.3) / ((W + 0.6) / 10)) & 1) ? FWHITE : st),
      { r: [sd * 0.42, 0, 0], p: [0, H + 0.3, sd * (D / 4 + 0.2)] }));
    scallops(k, -W / 2 - 0.3, W / 2 + 0.3, H - 0.02, -D / 2 - 0.5, 9, [GOLD, st]);
    k.add(new THREE.CylinderGeometry(0.75, 0.75, 0.16, 12), GOLD, { r: [HALF_PI, 0, 0], p: [0, H + 1.25, 0.05] });
    k.add(new THREE.CylinderGeometry(0.62, 0.62, 0.2, 12), FRED, { r: [HALF_PI, 0, 0], p: [0, H + 1.25, 0.03] });
    k.add(slab(starShape(0.48, 0.21), 0.08), GOLD, { r: [0, Math.PI, 0], p: [0, H + 1.25, -0.1] });
    for (let i = 0; i < 7; i++) bulb(k, -W / 2 + 0.05 + i * (W - 0.1) / 6, H - 0.62, -D / 2 - 0.55, 0.11, BULBS[i % BULBS.length]);
    k.root.userData.faceRoad = true;
    return finish(k);
  });

  /**
   * Make a kept sheet flutter: z pushed out by a travelling wave that grows
   * from the hoist (x = 0) to the fly end (x = len).
   */
  function flutter(k, node, len, amp, speed, phase) {
    const mesh = node.children.find((m) => m.isMesh);
    if (!mesh) return;
    const g = mesh.geometry, P = g.attributes.position, base = P.array.slice();
    onAnim(k, (t) => {
      const a = P.array;
      for (let i = 0; i < P.count; i++) {
        const x = base[i * 3], u = Math.max(0, x / len);
        a[i * 3 + 2] = base[i * 3 + 2] + amp * u * Math.sin(x * 2.6 - speed * t + phase);
        a[i * 3 + 1] = base[i * 3 + 1] - amp * 0.25 * u * u;
      }
      P.needsUpdate = true;
      g.computeVertexNormals();
    });
  }

  /** A barber-striped pole flying a long striped pennant that flutters. */
  prop('carnival_flag', (r) => {
    const k = new Kit(r), H = r.range(4.8, 5.2), [ca, cb] = r.pick([[FRED, FWHITE], [FPINK, GOLD], [SKY, FWHITE], [LILAC, GOLD]]);
    k.add(new THREE.CylinderGeometry(0.09, 0.12, H, 8, 12), (cx, cy, cz) => ((Math.floor(cy * 2.4 + Math.atan2(cz, cx) / TAU * 2 + 10) & 1) ? FRED : FWHITE), { p: [0, H / 2, 0] });
    k.add(new THREE.CylinderGeometry(0.32, 0.4, 0.22, 10), DGOLD, { p: [0, 0.11, 0] });
    k.add(sph(8, 6), GOLD, { s: 0.2, p: [0, H + 0.12, 0] });
    const L = 2.7, F = 1.1, flag = new THREE.Group();
    const g = new THREE.PlaneGeometry(L, F, 10, 1).translate(L / 2, 0, 0);
    const P = g.attributes.position;
    for (let i = 0; i < P.count; i++) P.setY(i, P.getY(i) * (1 - 0.88 * P.getX(i) / L));
    k.add(twoSided(g), (cx) => ((Math.floor(cx / (L / 5)) & 1) ? cb : ca), {}, flag);
    const fn = keep(flag);
    fn.position.set(0.05, H - F / 2 - 0.05, 0);
    fn.rotation.y = r.range(0, TAU);
    k.root.add(fn);
    flutter(k, fn, L, 0.32, 4.2, r.range(0, TAU));
    return finish(k);
  });

  /**
   * Spinning teacups: a striped platform, a turntable with a teapot in the
   * middle, three polka-dot cups each spinning on its own as the table turns.
   * The turntable and cups are one rig.
   */
  prop('teacup_ride', (r) => {
    const k = new Kit(r), pc = r.pick([[FPINK, FWHITE], [LILAC, FWHITE], [SKY, FWHITE]]);
    k.add(new THREE.CylinderGeometry(4.0, 4.15, 0.45, 18), stripesA(pc[0], pc[1], 18), { p: [0, 0.22, 0], jit: 0.02 });
    k.add(new THREE.TorusGeometry(4.02, 0.12, 3, 20), GOLD, { r: [HALF_PI, 0, 0], p: [0, 0.45, 0] });
    for (let i = 0; i < 9; i++) {
      const a = i / 9 * TAU;
      k.add(new THREE.OctahedronGeometry(0.16, 0), i % 3 ? GOLD : FRED, { p: [Math.cos(a) * 4.1, 0.25, Math.sin(a) * 4.1] });
    }
    const table = new THREE.Group();
    k.add(new THREE.CylinderGeometry(3.6, 3.6, 0.16, 18), wedges([0xfff1c9, 0xffd6e6], 12), { p: [0, 0.53, 0] }, table);
    // The teapot in the middle.
    const tp = r.pick([0x48b6f0, 0xff6aa8, 0x4fd6a0]);
    k.add(sph(10, 7), tp, { s: [1.05, 0.85, 1.05], p: [0, 1.4, 0], grad: 0.15 }, table);
    k.add(new THREE.CylinderGeometry(0.55, 0.75, 0.25, 12), shade(tp, 0.08), { p: [0, 2.25, 0] }, table);
    k.add(sph(6, 4), GOLD, { s: 0.2, p: [0, 2.48, 0] }, table);
    k.add(rod([0.9, 1.25, 0], [1.75, 2.05, 0], 0.22, 0.1, 6), tp, {}, table);
    k.add(new THREE.TorusGeometry(0.42, 0.1, 4, 10, Math.PI * 1.2), tp, { r: [0, 0, HALF_PI - 0.6], p: [-1.05, 1.45, 0] }, table);
    const cupC = shuffled([FRED, 0xffc928, SKY, MINT, LILAC], r);
    const cups = [], spots = [];
    for (let i = 0; i < 3; i++) {
      const a = i / 3 * TAU + 0.5, p = [Math.cos(a) * 2.45, 0.61, Math.sin(a) * 2.45], cup = new THREE.Group(), c = cupC[i];
      k.add(new THREE.CylinderGeometry(1.05, 0.9, 0.1, 12), FWHITE, { p: [p[0], p[1] + 0.05, p[2]] }, cup);
      const prof = [[0.001, 0.1], [0.55, 0.1], [0.95, 0.4], [1.08, 1.05], [1.12, 1.2], [1.0, 1.2], [0.9, 0.75], [0.001, 0.75]];
      k.add(new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 10), (cx, cy, cz) => {
        if (cy > p[1] + 1.15) return GOLD;
        if (cy < p[1] + 0.78 && Math.hypot(cx - p[0], cz - p[2]) < 0.88) return shade(c, -0.25);
        return (hash3(Math.round((cx - p[0]) * 2.2), Math.round((cy - p[1]) * 2.2), Math.round((cz - p[2]) * 2.2), i) > 0.55) ? WHITE : c;
      }, { p }, cup);
      k.add(new THREE.TorusGeometry(0.3, 0.09, 4, 8, Math.PI * 1.3), c, { r: [0, 0, -HALF_PI - 0.65], p: [p[0] + 1.1, p[1] + 0.68, p[2]] }, cup);
      cups.push(cup); spots.push(p);
    }
    const rig = new Rig([table].concat(cups), k.mat);
    k.root.add(rig.mesh);
    const out = finish(k);
    const ph = r.range(0, TAU), v = new THREE.Vector3();
    onAnim({ root: out }, (t) => {
      const A0 = 0.55 * t + ph;
      rig.pose((g, M) => {
        if (g === 0) { M.makeRotationY(A0); return; }
        const p = spots[g - 1];
        v.set(p[0], p[1], p[2]).applyAxisAngle(_up, A0);
        poseM(M, p, [v.x, v.y, v.z], 0, A0 + (g % 2 ? 1.4 : -1.1) * t + g, 0);
      });
    });
    return out;
  });

  /* ── Funfair far and landmarks ──────────────────────────────────────── */

  /**
   * A ferris wheel (shared by ferris_wheel and ferris_giant). o: { R, hubY,
   * n (gondolas), w (half width of the wheel), legX, glow (bulbs on their own
   * unlit material), lit (gondolas on the warm LIT material), giant (extra
   * detail) }. The wheel is a kept node turning about Z; the gondolas are one
   * rig that follows the rim but stays upright.
   */
  function ferris(k, o) {
    const r = k.rng, R = o.R, HY = o.hubY, w = o.w, s = o.R / 18.5;
    const frame = o.giant ? FWHITE : 0xf6efe4, rimA = FRED, rimB = FWHITE;
    // A-frames front and back, a cross brace each, and the axle.
    [-1, 1].forEach((sz) => {
      const z = sz * (w + 0.9 * s), zb = sz * (w + 2.4 * s);
      [-1, 1].forEach((sx) => {
        k.add(bar([sx * o.legX, 0, zb], [sx * 0.6 * s, HY, z], 0.75 * s, 0.6 * s), frame, { jit: 0.02 });
        k.add(new THREE.BoxGeometry(2.2 * s, 0.7 * s, 2.0 * s), GOLD, { p: [sx * o.legX, 0.35 * s, zb] });
      });
      [0.3, 0.62].forEach((f) => {
        const y = HY * f, x = o.legX * (1 - f) + 0.6 * s * f;
        k.add(bar([-x, y, zb + (z - zb) * f], [x, y, zb + (z - zb) * f], 0.42 * s, 0.42 * s), o.giant ? GOLD : frame);
      });
      if (o.giant) {
        // Lattice zig-zags up each leg pair.
        for (let i = 0; i < 6; i++) {
          const f0 = i / 6, f1 = (i + 1) / 6;
          const p0 = [-(o.legX * (1 - f0) + 0.6 * s * f0), HY * f0, zb + (z - zb) * f0], p1 = [o.legX * (1 - f1) + 0.6 * s * f1, HY * f1, zb + (z - zb) * f1];
          if (i % 2) { p0[0] *= -1; p1[0] *= -1; }
          k.add(bar(p0, p1, 0.3 * s, 0.3 * s), frame);
        }
      }
    });
    k.add(new THREE.CylinderGeometry(0.9 * s, 0.9 * s, 2 * (w + 1.4 * s), 10), GOLD, { r: [HALF_PI, 0, 0], p: [0, HY, 0] });
    // The wheel.
    const wheel = new THREE.Group(), nSp = o.n, bulbN = o.giant ? 48 : 24;
    [-1, 1].forEach((sz) => {
      k.add(new THREE.TorusGeometry(R, 0.42 * s, 4, o.giant ? 48 : 36), (cx, cy) => ((Math.floor(((Math.atan2(cy, cx) / TAU + 1) % 1) * nSp * 2) & 1) ? rimB : rimA), { p: [0, 0, sz * w] }, wheel);
      k.add(new THREE.TorusGeometry(R * 0.42, 0.3 * s, 4, 20), GOLD, { p: [0, 0, sz * w] }, wheel);
      for (let i = 0; i < nSp; i++) {
        const a = (i + 0.5) / nSp * TAU;
        k.add(bar([Math.cos(a) * 1.4 * s, Math.sin(a) * 1.4 * s, sz * w], [Math.cos(a) * R, Math.sin(a) * R, sz * w], 0.26 * s, 0.26 * s), frame, {}, wheel);
      }
      if (o.giant) {
        for (let i = 0; i < nSp; i++) {
          const a0 = (i + 0.5) / nSp * TAU, a1 = (i + 1.5) / nSp * TAU;
          k.add(bar([Math.cos(a0) * R * 0.42, Math.sin(a0) * R * 0.42, sz * w], [Math.cos(a1) * R, Math.sin(a1) * R, sz * w], 0.2 * s, 0.2 * s), GOLD, {}, wheel);
        }
      }
    });
    for (let i = 0; i < nSp; i++) {
      const a = i / nSp * TAU;
      k.add(new THREE.CylinderGeometry(0.22 * s, 0.22 * s, 2 * w + 0.6 * s, 5), GOLD, { r: [HALF_PI, 0, 0], p: [Math.cos(a) * R, Math.sin(a) * R, 0] }, wheel);
    }
    k.add(new THREE.CylinderGeometry(2.0 * s, 2.0 * s, 2 * w + 0.4 * s, 12), FRED, { r: [HALF_PI, 0, 0] }, wheel);
    [-1, 1].forEach((sz) => k.add(slab(starShape(2.6 * s, 1.1 * s), 0.3 * s), GOLD, { r: [0, sz > 0 ? 0 : Math.PI, 0], p: [0, 0, sz * (w + 0.35 * s)] }, wheel));
    for (let i = 0; i < bulbN; i++) {
      const a = (i + 0.25) / bulbN * TAU, c = BULBS[i % BULBS.length];
      [-1, 1].forEach((sz) => {
        if (sz > 0 && !o.giant) return;
        const p = [Math.cos(a) * (R + 0.5 * s), Math.sin(a) * (R + 0.5 * s), sz * (w + 0.1 * s)];
        if (o.glow) bulb(k, p[0], p[1], p[2], 0.42 * s, c, wheel);
        else k.add(new THREE.OctahedronGeometry(0.5 * s, 0), i % 2 ? 0xffd23f : 0xff8a3c, { p }, wheel);
      });
    }
    const wn = keep(wheel);
    wn.position.set(0, HY, 0);
    k.root.add(wn);
    // Gondolas: one rig, each hanging from its pivot on the rim.
    const gk = o.lit ? LIT() : k.mat, pivots = [], nodes = [];
    const gc = shuffled([FRED, 0xffc928, SKY, MINT, FPINK, LILAC, 0xff8a1e], r);
    for (let i = 0; i < nSp; i++) {
      const a = i / nSp * TAU, pv = [Math.cos(a) * R, HY + Math.sin(a) * R, 0], g = new THREE.Group(), c = gc[i % gc.length];
      const top = pv[1] - 0.9 * s, cab = top - 1.6 * s;
      k.add(bar(pv, [pv[0], top, 0], 0.18 * s, 0.18 * s), DGOLD, {}, g);
      k.add(new THREE.ConeGeometry(1.25 * s, 0.75 * s, o.giant ? 8 : 6), wedges([c, FWHITE], o.giant ? 8 : 6), { p: [pv[0], top - 0.2 * s, 0] }, g);
      [-1, 1].forEach((sx) => k.add(bar([pv[0] + sx * 0.9 * s, top - 0.5 * s, 0], [pv[0] + sx * 0.9 * s, cab, 0], 0.12 * s, 0.12 * s), GOLD, {}, g));
      k.add(new THREE.CylinderGeometry(1.1 * s, 0.85 * s, 1.1 * s, o.giant ? 8 : 6), (cx, cy) => (cy > cab - 0.12 * s ? GOLD : c), { p: [pv[0], cab - 0.5 * s, 0] }, g);
      if (o.giant) k.add(new THREE.CylinderGeometry(0.95 * s, 0.95 * s, 0.1 * s, 8), 0xffd890, { p: [pv[0], cab + 0.02 * s, 0] }, g);
      pivots.push(pv); nodes.push(g);
    }
    const rig = new Rig(nodes, gk);
    k.root.add(rig.mesh);
    return { wheel: wn, rig, pivots, R, HY };
  }
  /** Turn the wheel and keep every gondola hanging under its pivot, swinging a little. */
  function ferrisAnim(out, f, speed, phase) {
    let ry0;
    onAnim({ root: out }, (t) => {
      if (ry0 === undefined) ry0 = f.wheel.rotation.z;
      const th = speed * t + phase;
      f.wheel.rotation.z = ry0 + th;
      const c = Math.cos(th), sn = Math.sin(th);
      f.rig.pose((g, M) => {
        const p = f.pivots[g], x = p[0], y = p[1] - f.HY;
        poseM(M, p, [x * c - y * sn, f.HY + x * sn + y * c, 0], 0, 0, 0.05 * Math.sin(1.3 * t + g));
      });
    });
  }

  /** A ferris wheel with red-and-white rims, bulbs and ten bright gondolas (faces the road). */
  prop('ferris_wheel', (r) => {
    const k = new Kit(r);
    const f = ferris(k, { R: 18.5, hubY: 23.4, n: 10, w: 1.6, legX: 10.5 });
    k.add(new THREE.BoxGeometry(12, 1.0, 6), FRED, { p: [0, 0.5, -1.0], jit: 0.02 });
    k.add(new THREE.BoxGeometry(12.4, 0.2, 6.4), GOLD, { p: [0, 1.05, -1.0] });
    k.root.userData.faceRoad = true;
    const out = finish(k);
    ferrisAnim(out, f, 0.12, r.range(0, TAU));
    return out;
  });

  /** A big top: striped walls and roof, a scalloped valance, bulbs down the seams, a flag. */
  prop('circus_tent', (r) => {
    const k = new Kit(r), [ca, cb] = r.pick([[FRED, FWHITE], [FRED, 0xffe3a0], [FPINK, FWHITE], [0x3a6fd8, FWHITE]]);
    const R = 15.2, WH = 6.6, N = 24;
    k.add(new THREE.CylinderGeometry(R - 0.6, R - 0.6, WH, N, 1, true), stripesA(ca, cb, N), { p: [0, WH / 2, 0], jit: 0.02 });
    const prof = [[0.001, 20.6], [0.9, 20.3], [3.2, 17.2], [7.2, 12.6], [11.8, 8.9], [R, WH]];
    k.add(new THREE.LatheGeometry(prof.reverse().map(([x, y]) => new THREE.Vector2(x, y)), N), stripesA(ca, cb, N), { jit: 0.02 });
    scallopRing(k, R, WH + 0.02, N, [GOLD, ca], 1.1);
    k.add(new THREE.TorusGeometry(R, 0.18, 3, N), GOLD, { r: [HALF_PI, 0, 0], p: [0, WH, 0] });
    // Entrance toward -Z: a dark doorway, tied-back flaps and a gold frame.
    const ez = -(R - 0.6);
    k.add(slab(archShape(3.0, 3.2), 0.3), GOLD, { p: [0, 0, ez - 0.05] });
    k.add(slab(archShape(2.5, 3.0), 0.14), NAVY, { p: [0, 0, ez - 0.25] });
    [-1, 1].forEach((sd) => {
      const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 5.6, 0), new THREE.Vector3(sd * 2.4, 5.6, 0), new THREE.Vector3(sd * 2.6, 0.2, 0)]);
      k.add(twoSided(g), sd > 0 ? ca : cb, { p: [0, 0, ez - 0.36] });
    });
    // The pole, a gold ball and a flag.
    k.add(rod([0, 20.4, 0], [0, 23.4, 0], 0.18, 0.14, 6), DGOLD);
    k.add(sph(8, 6), GOLD, { s: 0.45, p: [0, 23.5, 0] });
    const fl = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -1.4, 0), new THREE.Vector3(2.6, -0.7, 0)]);
    k.add(twoSided(fl), r.pick([0xffc928, FPINK, SKY]), { r: [0, r.range(0, TAU), 0], p: [0, 23.2, 0] });
    // Strings of bulbs down every third seam.
    for (let sIdx = 0; sIdx < 8; sIdx++) {
      const a = sIdx / 8 * TAU + (0.5 / N) * TAU;
      for (let i = 1; i <= 7; i++) {
        const t = i / 8, y = 20.3 + (WH + 0.3 - 20.3) * t;
        // Follow the roof profile (it bows): find the radius at y.
        let rad = 0;
        for (let j = 0; j + 1 < prof.length; j++) {
          const [r0, y0] = prof[j], [r1, y1] = prof[j + 1];
          if ((y - y0) * (y - y1) <= 0) { rad = r0 + (r1 - r0) * ((y - y0) / ((y1 - y0) || 1)); break; }
        }
        bulb(k, Math.cos(a) * (rad + 0.35), y + 0.25, Math.sin(a) * (rad + 0.35), 0.3, BULBS[(i + sIdx) % BULBS.length]);
      }
    }
    return finish(k);
  });

  /** A cheerful galloping horse on a pole, built facing -Z at the origin of its own frame. */
  function horse(k, col, saddle, parent, M) {
    const o = { m: M };
    const add = (g, c, extra) => k.add(g, c, Object.assign({}, extra || {}, o), parent);
    add(sph(8, 5), col, { s: [0.42, 0.42, 0.95], p: [0, 0, 0] });
    add(rod([0, 0.15, -0.65], [0, 0.85, -1.05], 0.24, 0.18, 5), col);
    add(sph(6, 4), col, { s: [0.22, 0.24, 0.42], r: [0.55, 0, 0], p: [0, 0.95, -1.25] });
    [-1, 1].forEach((sd) => add(new THREE.ConeGeometry(0.07, 0.22, 4), col, { p: [sd * 0.1, 1.2, -1.1] }));
    add(new THREE.BoxGeometry(0.1, 0.18, 0.75), saddle, { r: [0.55, 0, 0], p: [0, 0.82, -0.86] });
    // Legs: front pair tucked, back pair stretched out.
    [[-0.2, -0.55, -1.0, 0.95], [0.2, -0.55, -0.6, 0.9], [-0.2, -0.45, 0.55, -0.6], [0.2, -0.55, 0.7, -0.4]].forEach(([x, y, z, a]) =>
      add(new THREE.BoxGeometry(0.12, 0.85, 0.14), col, { r: [a, 0, 0], p: [x, y, z] }));
    add(new THREE.ConeGeometry(0.16, 0.8, 5), saddle, { r: [-2.2, 0, 0], p: [0, 0.05, 1.15] });
    add(new THREE.BoxGeometry(0.62, 0.14, 0.8), saddle, { p: [0, 0.4, 0.05] });
    add(new THREE.BoxGeometry(0.66, 0.06, 0.84), GOLD, { p: [0, 0.32, 0.05] });
  }

  /**
   * A carousel: a striped canopy with bulbs round its crown on a mirrored
   * column, and a turning platform of horses rising and falling on gold poles
   * (platform, poles and horses are one rig).
   */
  prop('carousel', (r) => {
    const k = new Kit(r), [ca, cb] = r.pick([[FRED, FWHITE], [FPINK, FWHITE], [LILAC, FWHITE], [SKY, FWHITE]]);
    const RB = 7.6, TOP = 7.3, NP = 8;
    k.add(new THREE.CylinderGeometry(RB, RB + 0.2, 0.6, 20), wedges([GOLD, FRED], 20), { p: [0, 0.3, 0] });
    k.add(new THREE.CylinderGeometry(1.3, 1.3, TOP - 0.6, 10), (cx, cy, cz) => ((Math.floor(((Math.atan2(cz, cx) / TAU + 1) % 1) * 10) & 1) ? 0xfff0d0 : GOLD), { p: [0, 0.6 + (TOP - 0.6) / 2, 0] });
    const prof = [[RB + 0.3, TOP], [RB + 0.3, TOP + 0.75], [5.6, TOP + 2.0], [2.6, TOP + 3.4], [0.6, TOP + 4.2], [0.001, TOP + 4.3]];
    k.add(new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 16), (cx, cy, cz) => (cy < TOP + 0.76 ? GOLD : stripesA(ca, cb, 16)(cx, cy, cz)), { jit: 0.02 });
    k.add(new THREE.CircleGeometry(RB + 0.3, 16), wedges([0xfff0d0, shade(ca, 0.2)], 16), { r: [HALF_PI, 0, 0], p: [0, TOP, 0] });
    scallopRing(k, RB + 0.3, TOP + 0.02, 20, [ca, GOLD], 0.9);
    for (let i = 0; i < 20; i++) {
      const a = (i + 0.5) / 20 * TAU;
      bulb(k, Math.cos(a) * (RB + 0.42), TOP + 0.38, Math.sin(a) * (RB + 0.42), 0.17, BULBS[i % BULBS.length]);
    }
    k.add(sph(8, 6), GOLD, { s: 0.42, p: [0, TOP + 4.6, 0] });
    k.add(rod([0, TOP + 4.6, 0], [0, TOP + 6.0, 0], 0.07, 0.06, 5), DGOLD);
    const fl = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -0.7, 0), new THREE.Vector3(1.3, -0.35, 0)]);
    k.add(twoSided(fl), ca, { p: [0, TOP + 6.0, 0] });
    // The turning platform, its poles, and the horses.
    const plat = new THREE.Group(), horses = [], spots = [];
    k.add(new THREE.CylinderGeometry(RB - 0.4, RB - 0.4, 0.25, 20), wedges([0xfff0d0, shade(ca, 0.15)], 20), { p: [0, 0.72, 0] }, plat);
    const hc = shuffled([0xfffaf2, 0xffd6e6, 0xd9ecff, 0xfff0b8, 0xe6dcff], r), sc = shuffled([FRED, SKY, FPINK, MINT, LILAC, 0xffc928], r);
    for (let i = 0; i < NP; i++) {
      const a = i / NP * TAU, x = Math.cos(a) * 5.5, z = Math.sin(a) * 5.5;
      k.add(new THREE.CylinderGeometry(0.09, 0.09, TOP - 0.85, 5), GOLD, { p: [x, 0.85 + (TOP - 0.85) / 2, z] }, plat);
      const g = new THREE.Group(), T = [z, 0, -x], yaw = Math.atan2(-T[0], -T[2]);
      horse(k, hc[i % hc.length], sc[i % sc.length], g, new THREE.Matrix4().makeRotationY(yaw).setPosition(x, 2.6, z));
      horses.push(g); spots.push([x, 2.6, z]);
    }
    const rig = new Rig([plat].concat(horses), k.mat);
    k.root.add(rig.mesh);
    const out = finish(k);
    const ph = r.range(0, TAU);
    onAnim({ root: out }, (t) => {
      const A0 = 0.35 * t + ph;
      rig.pose((g, M) => {
        if (g === 0) { M.makeRotationY(A0); return; }
        M.makeTranslation(0, 0.45 * Math.sin(2.0 * t + g * 1.9), 0).premultiply(_rt.makeRotationY(A0));
      });
    });
    return out;
  });

  /** A camel-back roller-coaster hill on a white lattice, a little train climbing it. */
  prop('coaster_hill', (r) => {
    const k = new Kit(r), track = r.pick([FRED, 0x3a6fd8, 0xff8a1e]), lattice = FWHITE;
    const ctrl = [[-20.5, 2.8], [-14.5, 8], [-8, 19.5], [-3.2, 24.2], [0.8, 22.4], [5.8, 11], [9.6, 7.4], [13.4, 11.4], [16.8, 10.2], [20.6, 3.4]];
    const curve = new THREE.CatmullRomCurve3(ctrl.map(([x, y]) => new THREE.Vector3(x, y, 0)), false, 'centripetal');
    const pts = curve.getSpacedPoints(54).map((v) => [v.x, v.y, v.z]);
    [-0.75, 0.75].forEach((z) => k.add(tubeGeo(pts.map((p) => [p[0], p[1], z]), 0.17, 54, 4), track));
    k.add(tubeGeo(pts.map((p) => [p[0], p[1] - 0.5, 0]), 0.3, 54, 5), shade(track, -0.1));
    const yAt = (x) => {
      for (let i = 0; i + 1 < pts.length; i++) if ((x - pts[i][0]) * (x - pts[i + 1][0]) <= 0) return pts[i][1] + (pts[i + 1][1] - pts[i][1]) * ((x - pts[i][0]) / ((pts[i + 1][0] - pts[i][0]) || 1));
      return 0;
    };
    // Ties across the rails.
    for (let i = 1; i < pts.length - 1; i += 2) {
      const p = pts[i], q = pts[i + 1], a = Math.atan2(q[1] - p[1], q[0] - p[0]);
      k.add(new THREE.BoxGeometry(0.3, 0.14, 1.9), FWHITE, { r: [0, 0, a], p: [p[0], p[1] - 0.2, 0] });
    }
    // Lattice towers: two legs and X braces per level.
    for (let x = -18.4; x <= 19; x += 3.4) {
      const top = yAt(x) - 0.75;
      if (top < 1.5) continue;
      [-1.1, 1.1].forEach((z) => k.add(new THREE.BoxGeometry(0.24, top, 0.24), lattice, { p: [x, top / 2, z] }));
      const lv = Math.max(1, Math.round(top / 4));
      for (let j = 0; j < lv; j++) {
        const y0 = top * j / lv, y1 = top * (j + 1) / lv;
        k.add(bar([x, y0, -1.1], [x, y1, 1.1], 0.12, 0.12), lattice);
        k.add(bar([x, y0, 1.1], [x, y1, -1.1], 0.12, 0.12), lattice);
        k.add(new THREE.BoxGeometry(0.16, 0.16, 2.2), GOLD, { p: [x, y1, 0] });
      }
    }
    // A three-car train climbing the lift hill.
    const cars = [0xffc928, MINT, FPINK];
    for (let i = 0; i < 3; i++) {
      const u = 0.24 - i * 0.042, p = curve.getPointAt(u), tg = curve.getTangentAt(u), a = Math.atan2(tg.y, tg.x);
      const M = new THREE.Matrix4().makeRotationZ(a).setPosition(p.x, p.y, 0);
      k.add(roundBox(1.9, 0.75, 1.55, 0.4, 8, 6), cars[i], { p: [0, 0.55, 0], m: M });
      k.add(new THREE.BoxGeometry(0.2, 0.6, 1.35), shade(cars[i], -0.15), { p: [-0.65, 1.0, 0], m: M });
      if (i === 0) k.add(slab(starShape(0.3, 0.13), 0.06), WHITE, { r: [0, HALF_PI, 0], p: [0.96, 0.55, 0], m: M });
    }
    return finish(k);
  });

  /** A giant ferris wheel with bulbs all round its rims and warmly lit gondolas (faces the road). */
  prop('ferris_giant', (r) => {
    const k = new Kit(r);
    const f = ferris(k, { R: 34, hubY: 43, n: 16, w: 2.6, legX: 18, glow: true, lit: true, giant: true });
    // The boarding station: a striped-roof platform with steps.
    k.add(new THREE.BoxGeometry(18, 1.6, 10), FWHITE, { p: [0, 0.8, -1.5], jit: 0.02 });
    k.add(new THREE.BoxGeometry(18.6, 0.3, 10.6), GOLD, { p: [0, 1.7, -1.5] });
    for (let i = 0; i < 3; i++) k.add(new THREE.BoxGeometry(5, 0.5, 1.0), FRED, { p: [0, 0.25 + i * 0.5, -7.2 + i * 0.9] });
    k.root.userData.faceRoad = true;
    const out = finish(k);
    ferrisAnim(out, f, 0.07, r.range(0, TAU));
    return out;
  });

  /** A tall drop tower: striped column, light strips, a crown and a ring of seats that rises and drops. */
  prop('drop_tower', (r) => {
    const k = new Kit(r), H = 56, [ca, cb] = r.pick([[FRED, FWHITE], [0x3a6fd8, FWHITE], [FPINK, FWHITE]]);
    k.add(new THREE.CylinderGeometry(6.2, 6.6, 1.4, 16), wedges([GOLD, ca], 16), { p: [0, 0.7, 0] });
    k.add(new THREE.TorusGeometry(5.8, 0.12, 3, 24), GOLD, { r: [HALF_PI, 0, 0], p: [0, 2.6, 0] });
    for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; k.add(new THREE.BoxGeometry(0.14, 1.2, 0.14), GOLD, { p: [Math.cos(a) * 5.8, 2.0, Math.sin(a) * 5.8] }); }
    k.add(new THREE.CylinderGeometry(1.6, 2.1, H, 12, 14), (cx, cy) => ((Math.floor(cy / 4) & 1) ? cb : ca), { p: [0, 1.4 + H / 2, 0] });
    const rails = 4;
    for (let i = 0; i < rails; i++) {
      const a = i / rails * TAU + Math.PI / 4;
      k.add(new THREE.BoxGeometry(0.4, H - 2, 0.4), GOLD, { p: [Math.cos(a) * 2.0, 1.4 + (H - 2) / 2, Math.sin(a) * 2.0] });
      for (let j = 0; j < 20; j++) bulb(k, Math.cos(a) * 2.32, 4 + j * 2.6, Math.sin(a) * 2.32, 0.24, BULBS[(j + i) % BULBS.length]);
    }
    // The crown: a gold ring with bulbs, a striped cap and a star.
    const cy = 1.4 + H;
    k.add(new THREE.CylinderGeometry(3.4, 2.4, 1.6, 16), GOLD, { p: [0, cy + 0.8, 0] });
    for (let i = 0; i < 16; i++) { const a = (i + 0.5) / 16 * TAU; bulb(k, Math.cos(a) * 3.2, cy + 0.9, Math.sin(a) * 3.2, 0.28, BULBS[i % BULBS.length]); }
    k.add(new THREE.ConeGeometry(2.8, 3.2, 16), wedges([ca, cb], 16), { p: [0, cy + 3.2, 0] });
    k.add(slab(starShape(1.5, 0.65), 0.4), YELLOW, { p: [0, cy + 6.0, 0] });
    // The seat ring: ten bright seats facing out.
    const ring = new THREE.Group(), sc = shuffled([FRED, 0xffc928, SKY, MINT, FPINK, LILAC, 0xff8a1e], r);
    k.add(new THREE.TorusGeometry(3.3, 0.5, 4, 20), GOLD, { r: [HALF_PI, 0, 0] }, ring);
    k.add(new THREE.CylinderGeometry(2.9, 2.9, 1.2, 12, 1, true), ca, {}, ring);
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * TAU, c = sc[i % sc.length], x = Math.cos(a), z = Math.sin(a);
      const M = new THREE.Matrix4().makeRotationY(-a + HALF_PI).setPosition(x * 4.0, 0, z * 4.0);
      k.add(new THREE.BoxGeometry(1.1, 0.25, 0.9), c, { p: [0, -0.3, 0.2], m: M });
      k.add(new THREE.BoxGeometry(1.1, 1.3, 0.22), c, { p: [0, 0.3, -0.25], m: M });
      k.add(new THREE.TorusGeometry(0.32, 0.07, 3, 8, Math.PI), GOLD, { r: [0, HALF_PI, 0], p: [0, 0.75, 0.0], m: M });
    }
    const rn = keep(ring);
    rn.position.set(0, 5, 0);
    k.root.add(rn);
    k.root.userData.faceRoad = true;
    const out = finish(k);
    const base = rn.position.y, ph = r.range(0, 10);
    onAnim({ root: out }, (t) => {
      const u = (((t + ph) % 10) + 10) % 10 / 10, lo = base, hi = base + 42;
      let y;
      if (u < 0.55) { const e = u / 0.55; y = lo + (hi - lo) * (e * e * (3 - 2 * e)); }
      else if (u < 0.68) y = hi;
      else if (u < 0.76) { const e = (u - 0.68) / 0.08; y = hi - (hi - lo) * e * e; }
      else if (u < 0.84) { const e = (u - 0.76) / 0.08; y = lo + 2.2 * Math.sin(Math.PI * e); }
      else y = lo;
      rn.position.y = y;
    });
    return out;
  });

  /* ── Funfair hazards ────────────────────────────────────────────────── */

  /** Block: a striped present tied with a ribbon and a big bow, its gift tag looking toward +Z. */
  hazard('gift_block', 'block', 'carnival', (r) => {
    const k = new Kit(r, true), W = 2.8, H = 1.75, D = 2.6, sx = W / 7, sz = D / 6;
    const [pa, pb] = r.pick([[FRED, FWHITE], [FPINK, FWHITE], [SKY, FWHITE], [LILAC, FWHITE]]);
    const rib = pa === FRED ? GOLD : r.pick([GOLD, FRED]);
    // Stripes run up the front/back and the sides (segment-aligned, so they stay crisp).
    k.add(new THREE.BoxGeometry(W, H, D, 7, 1, 6), (cx, cy, cz) =>
      (((Math.floor((cx + W / 2) / sx + 1e-3) + Math.floor((cz + D / 2) / sz + 1e-3)) & 1) ? pb : pa), { p: [0, H / 2, 0], jit: 0.02 });
    k.add(new THREE.BoxGeometry(W + 0.06, H + 0.06, 0.44), rib, { p: [0, H / 2, 0] });
    k.add(new THREE.BoxGeometry(0.44, H + 0.06, D + 0.06), rib, { p: [0, H / 2, 0] });
    // The bow: two plump loops, a knot and two tails lying on the lid.
    [-1, 1].forEach((sd) => {
      k.add(new THREE.TorusGeometry(0.42, 0.14, 5, 10), rib, { s: [1, 0.72, 1.3], r: [0, 0, sd * 0.38], p: [sd * 0.5, H + 0.36, 0] });
      k.add(new THREE.BoxGeometry(0.34, 0.07, 0.95), shade(rib, -0.06), { r: [0, sd * 0.45, 0], p: [sd * 0.3, H + 0.05, sd * 0.55] });
    });
    k.add(sph(8, 6), shade(rib, 0.05), { s: [0.26, 0.24, 0.26], p: [0, H + 0.24, 0] });
    // A gift tag with a heart, hanging off the ribbon toward the karts.
    k.add(roundBox(0.62, 0.46, 0.06, 0.4, 8, 6), FWHITE, { r: [0, 0, 0.22], p: [0.62, H * 0.55, D / 2 + 0.06] });
    k.add(slab(heartShape(0.34), 0.04), FPINK, { r: [0, 0, 0.22], p: [0.62, H * 0.55, D / 2 + 0.1], noInk: true });
    k.add(bar([0.26, H * 0.72, D / 2 + 0.05], [0.45, H * 0.6, D / 2 + 0.06], 0.03), shade(rib, -0.1), { noInk: true });
    const out = sizeHazard(k, [2.8, 2.4, 2.6]);
    shadow(out, 3.4, 3.0);
    return out;
  });

  /** Roller: a circus ball — red and blue wedges meeting on the rolling axis, gold and white stars, starry white caps. */
  hazard('circus_ball', 'roller', 'carnival', (r) => {
    const k = new Kit(r, true), R = 1.0, node = new THREE.Group();
    const [ca, cb] = r.pick([[FRED, 0x2f6fd8], [FPINK, 0x6a4fd0], [FRED, 0x1f9f86]]);
    node.position.y = R;
    k.add(new THREE.SphereGeometry(R, 18, 12).rotateX(HALF_PI), (cx, cy, cz) => {
      if (Math.abs(cz) > 0.85 * R) return FWHITE;
      return (Math.floor(((Math.atan2(cy, cx) / TAU + 1) % 1) * 6) & 1) ? cb : ca;
    }, { jit: 0.02 }, node);
    const star = (n, up, s, col) => {
      k.add(slab(starShape(s, s * 0.45), 0.1), col, { m: faceM(n, up, [n[0] * R, n[1] * R, n[2] * R]), noInk: true }, node);
    };
    for (let i = 0; i < 6; i++) {
      const a = (i + 0.5) / 6 * TAU, c = Math.cos(a), s = Math.sin(a), l = (i & 1 ? 1 : -1) * 0.85, cl = Math.cos(l);
      star([c, s, 0], [0, 0, 1], 0.3, 0xffd23a);
      star([c * cl, s * cl, Math.sin(l)], [0, 0, 1], 0.17, FWHITE);
    }
    [-1, 1].forEach((sd) => star([0, 0, sd], [0, 1, 0], 0.36, sd > 0 ? ca : cb));
    return finishRoller(k, node, R);
  });

  /**
   * Geyser: a confetti cannon — a fat mortar on a two-wheeled carriage, its
   * fuse sparking toward +Z. Warning: a steady fizz of confetti in the
   * muzzle. Active: a 1.6 m column of confetti and corkscrew streamers up to
   * 6 m with a starry puff on top, turning slowly.
   */
  hazard('confetti_cannon', 'geyser', 'carnival', (r) => {
    const k = new Kit(r, true), [ca, cb] = r.pick([[FRED, GOLD], [0x2f6fd8, GOLD], [FPINK, 0xffd23a]]), MOUTH = 1.85;
    k.add(roundBox(1.25, 0.6, 1.5, 0.45, 10, 6), NAVY, { p: [0, 0.55, 0], jit: 0.02 });
    [-1, 1].forEach((sd) => {
      const x = sd * 0.8, y = 0.6;
      k.add(new THREE.CylinderGeometry(0.6, 0.6, 0.22, 16), (cx, cy, cz) =>
        ((Math.floor(((Math.atan2(cy - y, cz) / TAU + 1) % 1) * 8) & 1) ? FWHITE : ca), { r: [0, 0, HALF_PI], p: [x, y, 0] });
      k.add(new THREE.CylinderGeometry(0.17, 0.17, 0.32, 8), cb, { r: [0, 0, HALF_PI], p: [x + sd * 0.06, y, 0] });
    });
    const prof = [[0.42, 0.75], [0.62, 0.8], [0.66, 1.2], [0.6, 1.55], [0.78, 1.66], [0.8, MOUTH], [0.62, MOUTH], [0.55, 1.5]];
    k.add(new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 14), (cx, cy, cz) => {
      if (Math.hypot(cx, cz) < 0.6 && cy > 1.45) return 0x2a2140;
      if (cy > 1.58) return cb;
      return (cy > 1.1 && cy < 1.3) ? cb : ca;
    }, { jit: 0.02 });
    k.add(new THREE.CircleGeometry(0.57, 12), 0x2a2140, { r: [-HALF_PI, 0, 0], p: [0, 1.52, 0], noInk: true });
    k.add(new THREE.TorusGeometry(0.67, 0.07, 4, 16), cb, { r: [HALF_PI, 0, 0], p: [0, 0.95, 0] });
    [-1, 1].forEach((sd) => k.add(slab(starShape(0.24, 0.1), 0.06), FWHITE, { r: [0, sd > 0 ? 0 : Math.PI, 0], p: [0, 1.38, sd * 0.64], noInk: true }));
    k.add(tubeGeo([[0.3, 0.8, 0.7], [0.32, 0.95, 0.95], [0.2, 1.12, 1.02], [0.26, 1.28, 0.94]], 0.04, 10, 4), 0x3a3540, {});
    k.add(slab(starShape(0.2, 0.08), 0.06), 0xffc928, { p: [0.26, 1.34, 0.95], noInk: true });
    A.ink(k.root, 0.05);
    const out = finish(k);
    // The column, built up from the muzzle.
    const ck = new Kit(r, true), CH = 6.25 - MOUTH, cc = [FRED, GOLD, SKY, FPINK, MINT, LILAC, 0xff8a1e, FWHITE];
    [FPINK, GOLD, SKY].forEach((c, s) => {
      const pts = [];
      for (let i = 0; i <= 24; i++) {
        const u = i / 24, a = u * 2.2 * TAU + s * TAU / 3, rad = 0.18 + 0.44 * u;
        pts.push([Math.cos(a) * rad, u * (CH - 0.5), Math.sin(a) * rad]);
      }
      ck.add(tubeGeo(pts, 0.1, 48, 3), c, {});
    });
    for (let i = 0; i < 46; i++) {
      const y = 0.15 + Math.sqrt(r.next()) * (CH - 0.7), rad = (0.18 + 0.5 * y / CH) * Math.sqrt(r.next()), a = r.range(0, TAU);
      const p = [Math.cos(a) * rad, y, Math.sin(a) * rad], rot = [r.range(0, TAU), r.range(0, TAU), r.range(0, TAU)];
      if (i % 6 === 0) ck.add(slab(starShape(0.13, 0.06), 0.04), cc[i % cc.length], { r: rot, p, noInk: true });
      else ck.add(new THREE.BoxGeometry(0.22, 0.03, 0.15), cc[i % cc.length], { r: rot, p, noInk: true });
    }
    // A pop of smoke at the muzzle and a starry puff on top.
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * TAU + 0.4;
      ck.add(lump(ico(0.26, 1), 0.1, i), 0xfff2f8, { p: [Math.cos(a) * 0.42, 0.18, Math.sin(a) * 0.42] });
    }
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * TAU;
      ck.add(lump(ico(0.3, 1), 0.1, i + 9), i & 1 ? 0xfff2f8 : 0xffe3ef, { p: [Math.cos(a) * 0.4, CH - 0.42, Math.sin(a) * 0.4] });
      ck.add(slab(starShape(0.2, 0.09), 0.06), i & 1 ? GOLD : FPINK, { r: [0, HALF_PI - a, 0], p: [Math.cos(a + 0.6) * 0.55, CH - 0.2, Math.sin(a + 0.6) * 0.55] });
    }
    ck.add(lump(ico(0.38, 1), 0.1, 31), WHITE, { p: [0, CH - 0.3, 0] });
    A.ink(ck.root, 0.045);
    const column = flagInk(A.mergeByMaterial(ck.root));
    geyserRig(out, column);
    column.position.y = MOUTH - 0.25;
    // Warning: a narrower, taller fizz peeking out of the muzzle (steady).
    const setBase = out.userData.setState;
    out.userData.setState = function (active, warn, u) {
      setBase(active, warn, u);
      if (!active && warn) column.scale.set(0.75, 0.13, 0.75);
    };
    onAnim({ root: out }, (t) => { column.rotation.y = 1.6 * t; });
    return out;
  });

  /** Puddle: spilt fizzy soda — a tipped striped cup and its straw, fizz, ice cubes and a stray piece of popcorn. */
  hazard('soda_spill', 'puddle', 'carnival', (r) => {
    const k = new Kit(r, true), HW = 1.7, HL = 2.86, seed = r.next() * 99;
    const [soda, deep, lite, rim] = r.pick([[0xff4f8a, 0xe02a6a, 0xff8fb6, 0x7a1038], [0x9a5ae8, 0x7a38cc, 0xc29cff, 0x3a1a6a]]);
    const shape = puddleBase(k, [0.2, 0.42, 0.62, 0.8, 0.9, 0.955, 1],
      (rho, x, z) => (rho > 0.86 ? deep : (hash3(Math.round(x * 2.2), 0, Math.round(z * 2.2), seed) > 0.35 ? lite : soda)), rim, HW, HL);
    for (let i = 0; i < 3; i++) {
      k.add(new THREE.CircleGeometry(1, 8), 0xffeef6, { s: [0.12, 1, 0.5 + i * 0.12], r: [-HALF_PI, 0, 0], p: [r.range(-0.7, 0.7), 0.035, r.range(-1.2, 1.6)], noInk: true });
    }
    // Fizz: little bubbles all over the spill.
    for (let i = 0; i < 16; i++) {
      const a = r.range(0, TAU), d = Math.sqrt(r.next()) * 0.78;
      k.add(new THREE.SphereGeometry(r.range(0.05, 0.1), 6, 3, 0, TAU, 0, HALF_PI), WHITE, { p: [Math.cos(a) * d * HW, 0.025, Math.sin(a) * d * HL], noInk: true });
    }
    // The tipped cup at the far (-Z) end, mouth toward the spill, a bent straw and its lid.
    const cupC = r.pick([FRED, SKY, FPINK]), cupM = new THREE.Matrix4().makeRotationY(r.range(-0.45, 0.45)).setPosition(r.range(-0.45, 0.45), 0, -HL * 0.66);
    k.add(new THREE.CylinderGeometry(0.27, 0.2, 0.68, 12, 1), (cx, cy, cz) => {
      if (cz > 0.32) return deep;
      if (cz < -0.32) return FWHITE;
      return (Math.floor(((Math.atan2(cy - 0.29, cx) / TAU + 1) % 1) * 12) & 1) ? FWHITE : cupC;
    }, { r: [HALF_PI - 0.1, 0, 0], p: [0, 0.29, 0], m: cupM });
    const straw = (cx, cy, cz) => ((Math.floor((cx + cz) * 7 + 20) & 1) ? FWHITE : FRED);
    k.add(rod([0.05, 0.07, 0.3], [0.16, 0.07, 1.0], 0.04, 0.04, 6), straw, { m: cupM });
    k.add(rod([0.16, 0.07, 1.0], [0.4, 0.07, 1.22], 0.04, 0.04, 6), straw, { m: cupM });
    k.add(new THREE.CylinderGeometry(0.29, 0.29, 0.05, 12), FWHITE, { r: [0.08, 0, 0.05], p: [-0.52, 0.06, 0.2], m: cupM });
    k.add(sph(8, 4), FWHITE, { s: [0.11, 0.07, 0.11], p: [-0.52, 0.09, 0.2], m: cupM });
    for (let i = 0; i < 3; i++) {
      k.add(new THREE.BoxGeometry(0.3, 0.24, 0.3), 0xe6f6ff, { r: [r.range(-0.2, 0.2), r.range(0, TAU), r.range(-0.2, 0.2)], p: [r.range(-0.9, 0.9), 0.17, r.range(-0.6, 2.0)], jit: 0.04 });
    }
    for (let i = 0; i < 2; i++) popcorn(k, r.range(-1.0, 1.0), 0.2, (i ? 1 : -1) * r.range(0.4, 1.6), 0.15, i + 1);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU + r.range(-0.12, 0.12), sd = shape(a) * 0.86, rad = 0.17 * r.range(0.8, 1.2);
      k.add(new THREE.SphereGeometry(rad, 8, 4, 0, TAU, 0, HALF_PI), i % 3 ? soda : lite, { s: [1.4, 0.6, 1.4], p: [Math.cos(a) * sd * HW, 0.02, Math.sin(a) * sd * HL], jit: 0.03 });
    }
    A.ink(k.root, 0.035);
    return finish(k, 0.02);
  });

  /* ── Bumper-car arena dressing (origin = the arena floor) ───────────── */

  /**
   * A bumper car: a glossy tub on a fat rubber bumper, an empty seat and a
   * steering wheel, headlights, and its striped pole up to a sparking brush.
   * The whole car is one kept node that wiggles as if just nudged.
   */
  prop('bumper_car', (r) => {
    const k = new Kit(r), car = new THREE.Group(), body = r.pick([FRED, SKY, MINT, FPINK, 0xffc928, LILAC, 0xff8a1e]);
    const trim = body === 0xffc928 ? FRED : GOLD;
    k.add(new THREE.CylinderGeometry(1.0, 1.0, 0.2, 14), 0x34303e, { s: [0.8, 1, 1.18], p: [0, 0.1, 0] }, car);
    k.add(new THREE.TorusGeometry(1.0, 0.24, 5, 18), 0x2a2733, { s: [0.86, 1.24, 1], r: [HALF_PI, 0, 0], p: [0, 0.34, 0] }, car);
    k.add(roundBox(1.75, 0.7, 2.5, 0.4, 12, 8), body, { p: [0, 0.72, 0], jit: 0.02, grad: 0.14 }, car);
    k.add(new THREE.TorusGeometry(1.0, 0.06, 3, 18), trim, { s: [0.88, 1.26, 1], r: [HALF_PI, 0, 0], p: [0, 0.74, 0] }, car);
    // Dashboard hump, steering wheel, and the empty seat.
    k.add(roundBox(1.3, 0.36, 0.55, 0.5, 10, 6), shade(body, 0.08), { p: [0, 1.06, -0.66] }, car);
    k.add(rod([0, 1.12, -0.55], [0, 1.42, -0.27], 0.05, 0.05, 5), 0x34303e, {}, car);
    k.add(new THREE.TorusGeometry(0.24, 0.05, 4, 12), 0x34303e, { r: [-Math.PI / 4, 0, 0], p: [0, 1.45, -0.25] }, car);
    k.add(roundBox(1.05, 0.3, 0.7, 0.5, 10, 6), FWHITE, { p: [0, 1.12, 0.35] }, car);
    k.add(roundBox(1.15, 0.95, 0.3, 0.5, 10, 6), FWHITE, { r: [0.15, 0, 0], p: [0, 1.5, 0.8] }, car);
    k.add(slab(starShape(0.26, 0.11), 0.06), trim, { r: [0, Math.PI, 0], p: [0, 1.56, 0.62] }, car);
    // A big star on the nose between two headlights.
    k.add(slab(starShape(0.36, 0.16), 0.08), trim, { r: [0, Math.PI, 0], p: [0, 0.74, -1.26] }, car);
    [-1, 1].forEach((sd) => bulb(k, sd * 0.52, 0.86, -1.13, 0.13, 0xffcf1f, car));
    // The pole: a mount, red-and-white bands, a pennant, and the sparking brush on top.
    k.add(new THREE.BoxGeometry(0.3, 0.22, 0.3), 0x34303e, { p: [0, 1.02, 1.06] }, car);
    k.add(rod([0, 1.0, 1.06], [0, 3.0, 1.22], 0.06, 0.05, 6), (cx, cy) => ((Math.floor(cy * 3) & 1) ? FRED : FWHITE), {}, car);
    const pen = new THREE.Shape();
    pen.moveTo(0, 0); pen.lineTo(0.6, 0.17); pen.lineTo(0, 0.34); pen.closePath();
    k.add(twoSided(new THREE.ShapeGeometry(pen)), body === FRED ? GOLD : body, { r: [0, -HALF_PI, 0], p: [0, 2.45, 1.19] }, car);
    k.add(new THREE.ConeGeometry(0.12, 0.22, 6), 0x34303e, { r: [Math.PI, 0, 0], p: [0, 3.08, 1.23] }, car);
    bulb(k, 0, 3.22, 1.23, 0.13, 0x3fc8ff, car);
    const cn = keep(car);
    k.root.add(cn);
    const ph = r.range(0, TAU);
    onAnim(k, (t) => cn.rotation.set(0.015 * Math.sin(2.3 * t + ph), 0.14 * Math.sin(0.7 * t + ph), 0.02 * Math.sin(1.9 * t + ph * 1.7)));
    return finish(k);
  });

  /** A lighting rig: a candy-striped mast wound with bulbs, a crown ring of bulbs and four spotlights. */
  prop('arena_lights', (r) => {
    const k = new Kit(r), H = 6.8, cols = shuffled(BULBS, r);
    k.add(new THREE.CylinderGeometry(0.85, 1.0, 0.36, 12), NAVY, { p: [0, 0.18, 0] });
    k.add(new THREE.CylinderGeometry(0.55, 0.72, 0.3, 12), GOLD, { p: [0, 0.5, 0] });
    k.add(new THREE.CylinderGeometry(0.16, 0.2, H, 8, 14), (cx, cy, cz) => ((Math.floor(cy * 1.6 + Math.atan2(cz, cx) / TAU * 2 + 10) & 1) ? FRED : FWHITE), { p: [0, 0.65 + H / 2, 0] });
    for (let i = 0; i < 11; i++) {
      const a = i * 1.05, y = 1.3 + i * 0.5;
      bulb(k, Math.cos(a) * 0.3, y, Math.sin(a) * 0.3, 0.12, cols[i % cols.length]);
    }
    const yT = 0.65 + H, RR = 1.5;
    k.add(new THREE.CylinderGeometry(0.3, 0.24, 0.3, 8), GOLD, { p: [0, yT, 0] });
    k.add(new THREE.TorusGeometry(RR, 0.09, 4, 24), GOLD, { r: [HALF_PI, 0, 0], p: [0, yT - 0.3, 0] });
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * TAU;
      k.add(bar([0, yT - 0.05, 0], [Math.cos(a) * RR, yT - 0.3, Math.sin(a) * RR], 0.08), GOLD);
    }
    for (let i = 0; i < 12; i++) {
      const a = (i + 0.5) / 12 * TAU;
      bulb(k, Math.cos(a) * RR, yT - 0.42, Math.sin(a) * RR, 0.15, BULBS[i % BULBS.length]);
    }
    // Four spotlight cans hanging off the ring, tipped down and out, their lenses lit.
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * TAU + Math.PI / 4, c = Math.cos(a), s = Math.sin(a);
      const p0 = [c * RR, yT - 0.38, s * RR], p1 = [c * (RR + 0.42), yT - 0.95, s * (RR + 0.42)];
      k.add(span(new THREE.CylinderGeometry(0.3, 0.22, dist(p0, p1), 8), p0, p1), NAVY);
      k.glow(new THREE.CircleGeometry(0.26, 8), 0xffb52a, { m: faceM([p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]], [0, 1, 0], [p1[0] + (p1[0] - p0[0]) * 0.03, p1[1] + (p1[1] - p0[1]) * 0.03, p1[2] + (p1[2] - p0[2]) * 0.03]) });
    }
    k.add(new THREE.ConeGeometry(0.22, 0.4, 8), GOLD, { p: [0, yT + 0.35, 0] });
    k.add(slab(starShape(0.48, 0.21), 0.14), 0xffc928, { p: [0, yT + 0.95, 0] });
    return finish(k);
  });

  /* ── Funfair set pieces (straddle the road; opening |x| < 12.5, y < 12) ─ */

  /**
   * A huge balloon arch: clusters of four balloons spiralling round a
   * door-shaped path, a gold star foil at the crown and hearts on the
   * shoulders, on striped weighted pedestals ringed with bulbs. A loose bunch
   * tied outside each leg sways on its strings (one kept rig).
   */
  prop('balloon_gate', (r) => {
    const k = new Kit(r), cols = r.pick([[FPINK, GOLD, FWHITE, LILAC], [FRED, GOLD, FWHITE, SKY], [FPINK, 0xff8a1e, 0xffc928, MINT]]);
    const AX = 15.0, LEG = 13.6, CROWN = 2.8, Y0 = 2.3, BR = 1.12, RING = 1.0;
    archPath(AX, LEG, CROWN, Y0 + 0.3, 1.9).forEach((q, i) => {
      for (let j = 0; j < 4; j++) {
        const a = (j / 4 + (i & 1) / 8) * TAU, c = Math.cos(a) * RING;
        const x = q.p[0] + q.n[0] * c, y = q.p[1] + q.n[1] * c, z = Math.sin(a) * RING, col = cols[(j + i) % cols.length];
        k.add(sph(7, 4), (cx, cy) => (cy - y > BR * 0.5 ? shade(col, 0.08) : col), { s: [BR, BR * 1.08, BR], p: [x, y, z], jit: 0.015 });
      }
    });
    [-1, 1].forEach((sd) => {
      const x = sd * AX;
      k.add(new THREE.CylinderGeometry(1.75, 1.95, Y0, 14), stripesA(cols[0], FWHITE, 14, x, 0), { p: [x, Y0 / 2, 0], jit: 0.02 });
      k.add(new THREE.TorusGeometry(1.78, 0.14, 4, 20), GOLD, { r: [HALF_PI, 0, 0], p: [x, Y0, 0] });
      k.add(new THREE.CylinderGeometry(2.1, 2.1, 0.3, 14), GOLD, { p: [x, 0.15, 0] });
      for (let i = 0; i < 10; i++) {
        const a = (i + 0.5) / 10 * TAU;
        bulb(k, x + Math.cos(a) * 1.9, Y0 * 0.55, Math.sin(a) * 1.9, 0.17, BULBS[i % BULBS.length]);
      }
      // Heart foils on the shoulders, front and back.
      const hx = sd * 9.5, hy = LEG + CROWN * Math.sqrt(1 - (9.5 / AX) * (9.5 / AX));
      [-1, 1].forEach((fz) => k.add(slab(heartShape(2.6), 0.5, 3), FRED, { r: [0, fz < 0 ? Math.PI : 0, sd * 0.12], p: [hx, hy, fz * (RING + BR + 0.05)] }));
    });
    k.add(slab(starShape(1.7, 0.76), 0.8, 3), GOLD, { p: [0, LEG + CROWN + RING + BR + 0.9, 0], jit: 0.02 });
    // The loose bunches, one rig: each sways about its tie on the pedestal.
    const ties = [], bunches = [-1, 1].map((sd, g) => {
      const node = new THREE.Group(), tie = [sd * (AX + 1.95), 1.4, 0], cs = shuffled(BALLOONS, r);
      ties.push(tie);
      k.add(new THREE.CylinderGeometry(0.18, 0.18, 0.3, 8), GOLD, { r: [0, 0, HALF_PI], p: [tie[0] - sd * 0.1, tie[1], 0] }, node);
      [[0, 8.4, 0], [-0.95, 7.5, 0.5], [0.95, 7.7, -0.4], [0.25, 6.7, 0.95], [-0.35, 6.8, -0.95]].forEach((p, i) => {
        const R = 0.85 * r.range(0.92, 1.08), x = tie[0] + sd * (0.7 + p[0]), y = p[1], z = p[2];
        balloon(k, x, y, z, R, i === 0 ? GOLD : cs[(i + g) % cs.length], node, i === 0 ? 'star' : null);
        k.add(bar(tie, [x, y - R * 1.25, z], 0.03), 0x5a5560, {}, node);
      });
      return node;
    });
    const rig = new Rig(bunches, k.mat);
    k.root.add(rig.mesh);
    const ph = r.range(0, TAU);
    onAnim(k, (t) => rig.pose((g, M) => {
      const tie = ties[g];
      poseM(M, tie, tie, 0.05 * Math.sin(0.8 * t + ph + g), 0, 0.06 * Math.sin(0.6 * t + ph * 1.3 + g * 2));
    }));
    k.root.userData.faceRoad = true;
    return finishHere(k);
  });

  /**
   * An arch of carnival bulbs: two candy-striped rails joined by a gold
   * zigzag truss, a bulb on every metre of both rails, pennants hanging high
   * under the crown, striped footings and a gold star. Static (welded).
   */
  prop('light_arch', (r) => {
    const k = new Kit(r), [ca, cb] = r.pick([[FRED, FWHITE], [FPINK, FWHITE], [0x3a6fd8, FWHITE]]);
    const Y0 = 1.3, LEG = 11.2, OA = 14.8, OB = 5.2, IA = 13.5, IB = 4.0, TR = 0.26;
    const candy = (a, b) => (cx, cy) => {
      let u = cy;
      if (cy > LEG) { const th = Math.atan2((cy - LEG) / b, cx / a); u = LEG + Math.min(th, Math.PI - th) * 8; }
      return (Math.floor(u / 0.9) & 1) ? cb : ca;
    };
    [[OA, OB], [IA, IB]].forEach(([a, b], ri) => {
      k.add(tubeGeo(archPath(a, LEG, b, Y0, 0.7).map((q) => q.p), TR, 96, 5), candy(a, b), {});
      archPath(a, LEG, b, Y0 + 0.5, 1.05).forEach((q, i) => bulb(k, q.p[0], q.p[1], q.p[2], 0.36, BULBS[(i + ri * 2) % BULBS.length]));
    });
    const dO = archPath(OA, LEG, OB, Y0 + 0.4, 0.05), dI = archPath(IA, LEG, IB, Y0 + 0.4, 0.05), N = 44;
    const at = (d, f) => d[Math.round(f * (d.length - 1))].p;
    for (let i = 0; i < N; i++) k.add(bar(at(i & 1 ? dI : dO, i / N), at(i & 1 ? dO : dI, (i + 1) / N), 0.16), GOLD);
    // Pennants hanging under the inner crown (all well above the karts' 12 m).
    const pen = new THREE.Shape();
    pen.moveTo(-0.45, 0); pen.lineTo(0.45, 0); pen.lineTo(0, -1.1); pen.closePath();
    const pc = [ca === FRED ? GOLD : FRED, SKY, GOLD, FPINK];
    for (let i = 0; i < 13; i++) {
      const x = -8.4 + i * 1.4, y = LEG + IB * Math.sqrt(1 - (x / IA) * (x / IA)) - TR + 0.05;
      k.add(twoSided(new THREE.ShapeGeometry(pen)), pc[i % pc.length], { p: [x, y, 0] });
    }
    [-1, 1].forEach((sd) => {
      const x = sd * (OA + IA) / 2;
      k.add(new THREE.CylinderGeometry(1.1, 1.25, Y0 + 0.2, 12), stripesA(ca, GOLD, 12, x, 0), { p: [x, (Y0 + 0.2) / 2, 0], jit: 0.02 });
      k.add(new THREE.CylinderGeometry(0.85, 1.05, 0.3, 12), GOLD, { p: [x, Y0 + 0.35, 0] });
    });
    const ty = LEG + OB + 1.35;
    k.add(slab(starShape(1.5, 0.66), 0.5), GOLD, { p: [0, ty, 0] });
    for (let i = 0; i < 5; i++) {
      const a = HALF_PI + i / 5 * TAU;
      bulb(k, Math.cos(a) * 1.55, ty + Math.sin(a) * 1.55, 0, 0.22, BULBS[i % BULBS.length]);
    }
    return finishHere(k);
  });

  return { THEMES, DRESSING };
})();
