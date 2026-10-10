/**
 * NARBE Racer — gap set dressing.
 *
 * Every track's big full-width jump flies over a real landscape gap (a creek,
 * a sea inlet, a chocolate river canyon, a red-rock canyon, a glacier
 * crevasse, a misty bog ravine, a lava moat, the void). world.js cuts the
 * road and carves the gap; these are the free-standing props placed in and
 * around it to make each one a "wow" view.
 *
 * Conventions follow props-sunshine / props-moonlight:
 *   - metres (a kart is 2.8 m long), front faces -Z;
 *   - parts are vertex-painted per face and drawn with the ONE shared
 *     NK.art.mat.lambertV(), so a prop welds to one mesh per material;
 *   - glowing parts share one unlit vertex-colour material (the same cached
 *     NK.art.mat.basic world.js uses for its glows); the falls scroll ONE
 *     shared canvas texture per kind (water, chocolate, lava);
 *   - every builder draws only from the rng it is given.
 *
 * Origins are NOT all on the ground — each builder says where its origin is:
 * water props sit on the water surface (userData.waterline), falls stand on
 * their base, hanging things hang from their attachment line, bridges start
 * at the rim edge and the space props are centred.
 *
 * Animation: root.userData.anim(t, dt) is a function. Rigid movers (a mill
 * wheel, a raft, a dangling bridge) are welded child nodes flagged
 * userData.keep. Flocks (ducks, wisps, lava blobs, dolphins, asteroids) are
 * ONE kept mesh whose vertices move per group, so a whole flock costs a
 * single draw call. A copy that world.js freezes (keep flags cleared, anim
 * dropped) welds in the pose it was built in.
 */
NK.propsGaps = (function () {
  'use strict';

  const A = NK.art;
  const U = NK.util;
  const TAU = Math.PI * 2;
  const HALF = Math.PI / 2;
  const INK = 0x1d1b2e;

  /** The names are the contract with world.js — exactly these. */
  const NAMES = [
    'lily_pads', 'duck_family', 'reed_clump', 'stepping_stones', 'watermill',
    'sea_arch', 'shipwreck', 'dolphin_pod', 'buoy_bell',
    'choco_falls', 'rock_candy', 'marshmallow_stones', 'candy_raft',
    'rope_bridge_dangling', 'natural_arch_red', 'canyon_falls', 'river_rocks',
    'icicle_row', 'frozen_falls', 'ice_floe', 'ice_spire',
    'broken_bridge_wood', 'wisp_lights', 'lantern_boat', 'twisted_roots',
    'lava_falls', 'lava_plume', 'chain_bridge_broken', 'obsidian_spire',
    'ring_gate_big', 'black_hole', 'asteroid_cluster'
  ];

  /* ── Materials (all shared and cached by NK.art.mat) ─────────────────── */
  const LIT = () => A.mat.lambertV();
  const GLOW = () => A.mat.basic(0xffffff, { vertexColors: true });
  const HALO = () => A.mat.basic(0xffffff, { vertexColors: true, transparent: true, opacity: 0.3, depthWrite: false });

  /* ── Colour ───────────────────────────────────────────────────────────── */
  const _c = new THREE.Color();
  const _c2 = new THREE.Color();
  /** Blend two hex colours (t = 0 → a, 1 → b). */
  function mix(a, b, t) { return _c.setHex(a).lerp(_c2.setHex(b), U.clamp(t, 0, 1)).getHex(); }

  /**
   * Bake a colour per TRIANGLE (the crisp low-poly facet look). `col` is a
   * hex or a function of the face centroid (x, y, z, faceIndex) → hex; `jit`
   * nudges each face's lightness so big surfaces stay lively.
   */
  function paint(geo, col, rng, jit) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    const P = g.attributes.position, out = new Float32Array(P.count * 3);
    const fixed = typeof col === 'number';
    if (fixed) _c.setHex(col);
    for (let t = 0; t + 2 < P.count; t += 3) {
      if (!fixed) {
        const x = (P.getX(t) + P.getX(t + 1) + P.getX(t + 2)) / 3;
        const y = (P.getY(t) + P.getY(t + 1) + P.getY(t + 2)) / 3;
        const z = (P.getZ(t) + P.getZ(t + 1) + P.getZ(t + 2)) / 3;
        _c.setHex(col(x, y, z, t / 3));
      }
      const f = jit ? 1 + (rng.next() * 2 - 1) * jit : 1;
      for (let j = 0; j < 3; j++) {
        out[(t + j) * 3] = _c.r * f; out[(t + j) * 3 + 1] = _c.g * f; out[(t + j) * 3 + 2] = _c.b * f;
      }
    }
    g.setAttribute('color', new THREE.BufferAttribute(out, 3));
    if (g.attributes.uv) g.deleteAttribute('uv');
    if (!g.attributes.normal) g.computeVertexNormals();
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

  /** Bake scale (o.s) → rotation (o.r, Euler o.order) → position (o.p). No negative scales. */
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

  /** Point a geometry built along +Y from a to b (its length must already be |b - a|). */
  function span(geo, a, b) {
    _dir.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
    _q.setFromUnitVectors(_up, _dir);
    _p.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
    geo.applyMatrix4(_m4.compose(_p, _q, _s.set(1, 1, 1)));
    return geo;
  }
  const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);

  /** Pseudo-random -1..1 from a position, so vertices duplicated along seams agree. */
  function hash3(x, y, z, seed) {
    const h = Math.sin(Math.round(x * 997) * 0.1373 + Math.round(y * 997) * 0.2711 +
      Math.round(z * 997) * 0.1619 + seed * 7.31) * 43758.5453;
    return (h - Math.floor(h)) * 2 - 1;
  }

  /** Push vertices in or out from the geometry's own origin by up to ±amt (a fraction). */
  function lump(geo, amt, seed, keepBelow) {
    const P = geo.attributes.position;
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
      if (keepBelow !== undefined && y <= keepBelow) continue;
      const k = 1 + amt * hash3(x, y, z, seed);
      P.setXYZ(i, x * k, y * k, z * k);
    }
    P.needsUpdate = true;
    return geo;
  }

  /** Nudge every vertex by up to ±amt metres per axis (rock faces, ice). Rows at y <= floor keep their y. */
  function jiggle(geo, amt, seed, floor) {
    const P = geo.attributes.position;
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
      const dy = floor !== undefined && y <= floor + 1e-4 ? 0 : amt * hash3(x, y, z, seed + 2);
      P.setXYZ(i, x + amt * hash3(x, y, z, seed), y + dy, z + amt * hash3(x, y, z, seed + 5));
    }
    P.needsUpdate = true;
    return geo;
  }

  /** A five-pointed star slab facing -Z (flags, sparkles). */
  function starGeo(radius, depth) {
    const sh = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const a = HALF + i * Math.PI / 5, r = radius * (i % 2 ? 0.45 : 1);
      if (i === 0) sh.moveTo(Math.cos(a) * r, Math.sin(a) * r); else sh.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    sh.closePath();
    return new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false, curveSegments: 1 }).translate(0, 0, -depth / 2);
  }

  /* ── Kit: one prop under construction ────────────────────────────────── */
  function Kit(rng) { this.rng = rng; this.root = new THREE.Group(); }
  /** o: { s, r, p, order, jit, mat } — parent: a moving node (default the root). */
  Kit.prototype.add = function (geo, col, o, parent) {
    o = o || {};
    place(geo, o);
    const g = col === null ? geo : paint(geo, col, this.rng, o.jit === undefined ? 0.06 : o.jit);
    const m = new THREE.Mesh(g, o.mat || LIT());
    (parent || this.root).add(m);
    return m;
  };
  function add(k, geo, col, p, x) {
    x = x || {};
    return k.add(geo, col, { p, r: x.r, s: x.s, order: x.order, jit: x.jit, mat: x.mat }, x.parent);
  }
  const box = (k, w, h, d, col, p, x) => add(k, new THREE.BoxGeometry(w, h, d), col, p, x);
  const ball = (k, rad, col, p, x) => add(k, new THREE.IcosahedronGeometry(rad, x && x.det !== undefined ? x.det : 1), col, p, x);
  const cyl = (k, rt, rb, h, col, p, x) => add(k, new THREE.CylinderGeometry(rt, rb, h, (x && x.n) || 8, 1), col, p, x);
  const cone = (k, rad, h, col, p, x) => add(k, new THREE.ConeGeometry(rad, h, (x && x.n) || 7), col, p, x);
  const torus = (k, R, tube, col, p, x) => add(k, new THREE.TorusGeometry(R, tube, (x && x.rs) || 4, (x && x.ts) || 18, (x && x.arc) || TAU), col, p, x);
  /** A round rod from a to b (radius r0 at a, r1 at b); x.open drops the end caps (hidden joints). */
  function rod(k, a, b, r0, r1, col, x) {
    const g = span(new THREE.CylinderGeometry(r1, r0, Math.max(1e-3, dist(a, b)), (x && x.n) || 5, 1, !!(x && x.open)), a, b);
    return k.add(g, col, { jit: x && x.jit, mat: x && x.mat }, x && x.parent);
  }
  /** A square bar from a to b. */
  function bar(k, a, b, w, d, col, x) {
    const g = span(new THREE.BoxGeometry(w, Math.max(1e-3, dist(a, b)), d), a, b);
    return k.add(g, col, { jit: x && x.jit, mat: x && x.mat }, x && x.parent);
  }
  /** A thin flat ripple ring lying on the water. */
  function ripple(k, R, x, z, col, x2) {
    return torus(k, R, 0.035 + R * 0.02, col || 0xe6f6ff, [x, 0.02, z], Object.assign({ r: [HALF, 0, 0], s: [1, 1, 0.35], rs: 3, ts: 16 }, x2 || {}));
  }

  /* ── Welding, animation ──────────────────────────────────────────────── */
  function finish(k) { return A.mergeByMaterial(k.root); }

  /** Weld a moving part to one mesh per material and flag it to survive later welds. */
  function keep(node) {
    const out = A.mergeByMaterial(node);
    out.userData.keep = true;
    return out;
  }

  /** Register fn(t, dt) on the prop's single userData.anim function. */
  function onAnim(k, fn) {
    const ud = k.root.userData;
    if (!ud.anim) {
      const fns = [];
      ud.anim = function (t, dt) { for (let i = 0; i < fns.length; i++) fns[i](t || 0, dt || 0); };
      Object.defineProperty(ud.anim, 'fns', { value: fns });
    }
    ud.anim.fns.push(fn);
  }
  // Rest values are read on the first call, after every weld has settled.
  function sway(k, node, axis, speed, amp, phase) {
    let rest;
    onAnim(k, (t) => { if (rest === undefined) rest = node.rotation[axis]; node.rotation[axis] = rest + amp * Math.sin(speed * t + (phase || 0)); });
  }
  function bob(k, node, axis, speed, amp, phase) {
    let rest;
    onAnim(k, (t) => { if (rest === undefined) rest = node.position[axis]; node.position[axis] = rest + amp * Math.sin(speed * t + (phase || 0)); });
  }
  function spin(k, node, axis, speed) {
    let rest;
    onAnim(k, (t) => { if (rest === undefined) rest = node.rotation[axis]; node.rotation[axis] = rest + speed * t; });
  }

  /**
   * A flock: every node in `nodes` (a Group holding parts built in prop
   * space) becomes one vertex group of a single kept mesh. motion(g, t)
   * returns { x, y, z, rx, ry, rz, s } (all optional) applied about the
   * group's pivot (node.userData.pivot, else its bounds centre).
   */
  function flock(k, nodes, mat, motion, margin) {
    let n = 0;
    const list = [];
    nodes.forEach((node, g) => node.children.forEach((m) => { list.push([m.geometry, g]); n += m.geometry.attributes.position.count; }));
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), gid = new Uint16Array(n);
    const lo = nodes.map(() => [Infinity, Infinity, Infinity]), hi = nodes.map(() => [-Infinity, -Infinity, -Infinity]);
    let o = 0;
    list.forEach(([geo, g]) => {
      const P = geo.attributes.position, C = geo.attributes.color;
      for (let i = 0; i < P.count; i++) {
        const v = [P.getX(i), P.getY(i), P.getZ(i)];
        for (let a = 0; a < 3; a++) {
          pos[(o + i) * 3 + a] = v[a];
          col[(o + i) * 3 + a] = C ? C.array[i * 3 + a] : 1;
          if (v[a] < lo[g][a]) lo[g][a] = v[a];
          if (v[a] > hi[g][a]) hi[g][a] = v[a];
        }
        gid[o + i] = g;
      }
      o += P.count;
      geo.dispose();
    });
    const piv = nodes.map((node, g) => node.userData.pivot || [0, 1, 2].map((a) => (lo[g][a] + hi[g][a]) / 2));
    const geo = new THREE.BufferGeometry();
    const base = pos.slice();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData.keep = true;
    k.root.add(mesh);
    const M = new THREE.Matrix4(), T = new THREE.Matrix4(), E = new THREE.Euler(), Q = new THREE.Quaternion();
    const V = new THREE.Vector3(), S = new THREE.Vector3(), mats = nodes.map(() => new Float32Array(16));
    function apply(t) {
      for (let g = 0; g < nodes.length; g++) {
        const m = motion(g, t) || {}, p = piv[g], s = m.s === undefined ? 1 : m.s;
        E.set(m.rx || 0, m.ry || 0, m.rz || 0);
        Q.setFromEuler(E);
        M.compose(V.set(p[0] + (m.x || 0), p[1] + (m.y || 0), p[2] + (m.z || 0)), Q, S.set(s, s, s));
        M.multiply(T.makeTranslation(-p[0], -p[1], -p[2]));
        mats[g].set(M.elements);
      }
      for (let i = 0; i < n; i++) {
        const e = mats[gid[i]], x = base[i * 3], y = base[i * 3 + 1], z = base[i * 3 + 2];
        pos[i * 3] = e[0] * x + e[4] * y + e[8] * z + e[12];
        pos[i * 3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
        pos[i * 3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
      }
      geo.attributes.position.needsUpdate = true;
    }
    apply(0);
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    geo.boundingSphere.radius += margin || 1;
    onAnim(k, (t) => apply(t));
    return mesh;
  }

  /* ── Registration ─────────────────────────────────────────────────────── */
  function prop(name, build) {
    A.props[name] = function (rng) {
      const obj = build(rng || U.rng(U.hash(name)));
      obj.name = name;
      return obj;
    };
  }
  /** Finish a prop whose origin is the water surface. */
  function wet(k) { const o = finish(k); o.userData.waterline = true; return o; }

  /* ════════════════════════════════════════════════════════════════════════
   * MEADOW — "Babbling Brook": a creek ~26 m wide, water ~5 m below the road
   * ════════════════════════════════════════════════════════════════════════ */
  const PAD = [0x4caf3f, 0x3e9a37, 0x5cbf4a, 0x46a83c];

  function blossom(k, x, y, z, rng) {
    const pinkish = rng.chance(0.6);
    const outer = pinkish ? 0xff8fc0 : 0xfff6fa, inner = pinkish ? 0xffc6de : 0xffd9ea;
    for (let ring = 0; ring < 2; ring++) {
      const n = ring ? 5 : 7, tilt = ring ? 0.95 : 0.45, len = ring ? 0.17 : 0.24;
      for (let i = 0; i < n; i++) {
        const a = (i + ring * 0.5) / n * TAU + rng.range(-0.1, 0.1);
        const g = place(new THREE.OctahedronGeometry(1, 0), { s: [0.085, 0.035, len], p: [0, 0, len * 0.9] });
        place(g, { r: [-tilt, 0, 0] });
        k.add(g, ring ? inner : outer, { r: [0, a, 0], p: [x, y + ring * 0.03, z] });
      }
    }
    ball(k, 0.07, 0xffd23f, [x, y + 0.08, z], { det: 0 });
  }

  /** Lily pads (origin: the water surface; pads float at y ≈ 0.05). */
  prop('lily_pads', (r) => {
    const k = new Kit(r), n = r.int(6, 9), pads = [];
    for (let i = 0; i < n; i++) {
      let x = 0, z = 0, rad = 0.6, tries = 0;
      do {
        const a = r.range(0, TAU), d = Math.sqrt(r.next()) * 1.55;
        x = Math.cos(a) * d; z = Math.sin(a) * d; rad = r.range(0.4, 0.82); tries++;
      } while (tries < 14 && pads.some((p) => Math.hypot(p[0] - x, p[1] - z) < (p[2] + rad) * 0.9));
      pads.push([x, z, rad]);
      const notch = r.range(0.4, 0.65), green = r.pick(PAD), vein = mix(green, 0xb6ec7a, 0.35);
      const geo = new THREE.CylinderGeometry(rad, rad, 0.05, 14, 1, false, r.range(0, TAU), TAU - notch);
      k.add(geo, (cx, cy, cz, i) => (cy > 0.06 ? (i % 2 ? vein : green) : 0x2d6e2a), { p: [x, 0.04 + i * 0.004, z], jit: 0.04 });
    }
    const flowers = r.int(2, 3);
    for (let f = 0; f < flowers; f++) {
      const p = pads[(f * 3 + 1) % pads.length];
      blossom(k, p[0] + r.range(-0.15, 0.15) * p[2], 0.1, p[1] + r.range(-0.15, 0.15) * p[2], r);
    }
    return wet(k);
  });

  function duck(k, sc, body, wing, bill, parent) {
    const x = { parent }, chick = sc < 0.6;
    ball(k, 1, body, [0, 0.07 * sc, 0], Object.assign({ s: [0.36 * sc, 0.25 * sc, 0.5 * sc] }, x));
    if (!chick) ball(k, 0.3 * sc, body, [0, 0.13 * sc, -0.26 * sc], Object.assign({ s: [1, 0.9, 0.9], det: 0 }, x));
    cone(k, 0.15 * sc, 0.34 * sc, body, [0, 0.2 * sc, 0.48 * sc], Object.assign({ r: [1.05, 0, 0], n: 5 }, x));
    rod(k, [0, 0.18 * sc, -0.3 * sc], [0, 0.45 * sc, -0.36 * sc], 0.12 * sc, 0.11 * sc, body, Object.assign({ n: 5 }, x));
    ball(k, 0.2 * sc, body, [0, 0.52 * sc, -0.38 * sc], x);
    ball(k, 1, bill, [0, 0.47 * sc, -0.58 * sc], Object.assign({ s: [0.1 * sc, 0.04 * sc, 0.14 * sc], det: 0 }, x));
    [-1, 1].forEach((sd) => {
      ball(k, 0.042 * sc, INK, [sd * 0.115 * sc, 0.58 * sc, -0.5 * sc], Object.assign({ det: 0 }, x));
      ball(k, 1, wing, [sd * 0.31 * sc, 0.16 * sc, 0.06 * sc], Object.assign({ s: [0.08 * sc, 0.15 * sc, 0.3 * sc], r: [0.25, 0, -sd * 0.2], det: 0 }, x));
      if (!chick) ball(k, 0.05 * sc, 0xff9fb4, [sd * 0.15 * sc, 0.48 * sc, -0.47 * sc], Object.assign({ det: 0, s: [1, 0.6, 0.6] }, x));
    });
  }
  /** A mother duck and three ducklings paddling in a line toward -Z (origin: water surface). */
  prop('duck_family', (r) => {
    const k = new Kit(r), nodes = [];
    const spots = [[0, -0.5, 1], [r.range(0.08, 0.16), 0.34, 0.48], [-r.range(0.06, 0.14), 0.74, 0.46], [r.range(0.06, 0.16), 1.12, 0.44]];
    spots.forEach((s, i) => {
      const node = new THREE.Group();
      const kk = { rng: r, root: node, add: Kit.prototype.add };
      if (i === 0) duck(kk, 1, 0xfbf7ec, 0xe9dfc7, 0xff9a1f);
      else duck(kk, s[2], 0xffd83a, 0xf4bf22, 0xff8a1a);
      node.children.forEach((m) => m.geometry.translate(s[0], 0, s[1]));
      node.userData.pivot = [s[0], 0, s[1]];
      nodes.push(node);
      ripple(k, (i ? 0.3 : 0.62), s[0], s[1] + (i ? 0.05 : 0.1), null, { ts: i ? 10 : 12 });
    });
    const ph = nodes.map((n, i) => i * 1.35 + r.range(0, 0.4));
    flock(k, nodes, LIT(), (g, t) => ({
      y: 0.028 * Math.sin(2.3 * t + ph[g]),
      rx: 0.07 * Math.sin(2.3 * t + ph[g] + 0.9),
      rz: 0.05 * Math.sin(1.6 * t + ph[g] * 1.7),
      ry: 0.08 * Math.sin(0.7 * t + ph[g])
    }), 0.5);
    return wet(k);
  });

  /** Cattails and reed blades (origin: ground). */
  prop('reed_clump', (r) => {
    const k = new Kit(r), n = r.int(11, 15);
    const greens = [0x5f9e3a, 0x6fae43, 0x4f8f34, 0x7cbd4b];
    for (let i = 0; i < n; i++) {
      const a = i * 2.39996 + r.range(-0.3, 0.3), d = Math.sqrt((i + 0.5) / n) * 0.42;
      const x = Math.cos(a) * d, z = Math.sin(a) * d, h = r.range(1.35, 2.15);
      const lx = Math.cos(a) * r.range(0.02, 0.1), lz = Math.sin(a) * r.range(0.02, 0.1);
      const top = [x + lx * h, h, z + lz * h], g = r.pick(greens);
      rod(k, [x, 0, z], top, 0.035, 0.018, g, { n: 4 });
      if (i % 3 !== 2) {
        const f0 = 0.72, f1 = 0.88, p0 = [x + lx * h * f0, h * f0, z + lz * h * f0], p1 = [x + lx * h * f1, h * f1, z + lz * h * f1];
        rod(k, p0, p1, 0.075, 0.07, r.pick([0x7a4a2a, 0x83502c, 0x6e4126]), { n: 6 });
      }
    }
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * TAU + r.range(-0.3, 0.3), len = r.range(0.9, 1.5), lean = r.range(0.25, 0.45);
      const x = Math.cos(a) * 0.25, z = Math.sin(a) * 0.25;
      rod(k, [x, 0, z], [x + Math.cos(a) * len * lean, len, z + Math.sin(a) * len * lean], 0.07, 0.004, r.pick(greens), { n: 3 });
    }
    return finish(k);
  });

  /** Five flat mossy stones in a gentle curve across ~6 m (origin: water surface, tops 0.2 m up). */
  prop('stepping_stones', (r) => {
    const k = new Kit(r), bend = r.range(0.5, 0.8) * r.sign(), seed = r.range(0, 99);
    for (let i = 0; i < 5; i++) {
      const u = i / 4, x = (u - 0.5) * 5.2 + r.range(-0.15, 0.15), z = bend * Math.sin(u * Math.PI) + r.range(-0.1, 0.1);
      const rad = r.range(0.5, 0.66);
      const geo = lump(new THREE.CylinderGeometry(rad * 0.82, rad, 0.55, 8, 1), 0.07, seed + i);
      const grey = r.pick([0x9aa0a8, 0x8f969e, 0xa7aab0]), moss = r.pick([0x6fae45, 0x7dba4c, 0x5f9f3c]);
      k.add(geo, (cx, cy, cz) => {
        if (cy > 0.16) return hash3(cx, cy, cz, seed) > -0.2 ? moss : grey;
        return cy < 0.02 ? mix(grey, 0x4a5560, 0.4) : grey;
      }, { p: [x, -0.075, z], r: [r.range(-0.05, 0.05), r.range(0, TAU), r.range(-0.05, 0.05)] });
      ripple(k, rad * 1.12, x, z);
    }
    return wet(k);
  });

  /** A storybook mill with a turning wheel on its +X side (origin: ground at the house base). */
  prop('watermill', (r) => {
    const k = new Kit(r);
    const W = 6, D = 6, BASE = 0.6, WALL = 3.6, top = BASE + WALL, RISE = 2.4;
    const plaster = r.pick([0xf3e3c3, 0xf6ead2, 0xefdcb8]), timber = 0x7a4f2c, roof = r.pick([0xc8473a, 0xbf3f4a, 0xd0553a]);
    const stone = (cx, cy, cz) => (hash3(cx, cy, cz, 3) > 0 ? 0xa3a6ad : 0x8f939c);
    box(k, W + 0.3, BASE, D + 0.3, stone, [0, BASE / 2, 0], { jit: 0.1 });
    box(k, W, WALL, D, plaster, [0, BASE + WALL / 2, 0]);
    const gable = new THREE.Shape();
    gable.moveTo(-W / 2, 0); gable.lineTo(W / 2, 0); gable.lineTo(0, RISE); gable.closePath();
    k.add(new THREE.ExtrudeGeometry(gable, { depth: D, bevelEnabled: false }), plaster, { p: [0, top, -D / 2] });
    // Roof slabs, overhanging every edge.
    const slope = Math.atan2(RISE, W / 2), len = Math.hypot(W / 2, RISE) + 0.55;
    [-1, 1].forEach((sd) => {
      box(k, len, 0.28, D + 0.9, (cx, cy, cz, i) => (i % 4 < 2 ? roof : mix(roof, 0x7a2028, 0.25)),
        [sd * (W / 4 + 0.12), top + RISE / 2 + 0.2, 0], { r: [0, 0, -sd * slope] });
    });
    box(k, 0.3, 0.3, D + 1, mix(roof, 0x5a1820, 0.5), [0, top + RISE + 0.2, 0]);
    // Timber frame.
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(k, 0.26, WALL, 0.26, timber, [sx * W / 2, BASE + WALL / 2, sz * D / 2]);
    [[W + 0.1, 0.22, 0.12, 0, -D / 2 - 0.02], [W + 0.1, 0.22, 0.12, 0, D / 2 + 0.02], [0.12, 0.22, D + 0.1, -W / 2 - 0.02, 0], [0.12, 0.22, D + 0.1, W / 2 + 0.02, 0]]
      .forEach((b) => { box(k, b[0], b[1], b[2], timber, [b[3], top - 0.1, b[4]]); box(k, b[0], b[1], b[2], timber, [b[3], BASE + 1.75, b[4]]); });
    // Front: door, steps, windows with shutters, a round gable window.
    box(k, 1.3, 2.1, 0.18, 0x6b4226, [-1.2, BASE + 1.05, -D / 2 - 0.06]);
    box(k, 0.12, 0.12, 0.1, 0xffcf4a, [-0.75, BASE + 1.0, -D / 2 - 0.18], { jit: 0 });
    box(k, 1.7, 0.3, 0.6, 0x9ea2aa, [-1.2, 0.15, -D / 2 - 0.45]);
    box(k, 1.7, 0.3, 0.35, 0x9ea2aa, [-1.2, 0.45, -D / 2 - 0.3]);
    const windowAt = (x, y, z, ry) => {
      const rr = [0, ry, 0], o = (dx, dz) => [x + Math.cos(ry) * dx + Math.sin(ry) * dz, y, z - Math.sin(ry) * dx + Math.cos(ry) * dz];
      box(k, 1.1, 1.1, 0.12, 0xffd57a, o(0, -0.02), { r: rr, jit: 0.02 });
      box(k, 1.25, 0.14, 0.18, timber, [o(0, -0.06)[0], y + 0.6, o(0, -0.06)[2]], { r: rr });
      box(k, 1.25, 0.14, 0.18, timber, [o(0, -0.06)[0], y - 0.6, o(0, -0.06)[2]], { r: rr });
      box(k, 0.1, 1.1, 0.16, timber, o(0, -0.06), { r: rr });
      box(k, 1.1, 0.1, 0.16, timber, o(0, -0.06), { r: rr });
      [-1, 1].forEach((sd) => box(k, 0.5, 1.15, 0.08, 0x4f9e5a, o(sd * 0.85, -0.08), { r: rr }));
    };
    windowAt(1.3, BASE + 2.3, -D / 2 - 0.02, 0);
    windowAt(-W / 2 - 0.02, BASE + 2.3, 0.2, -HALF);
    windowAt(-0.6, BASE + 2.3, D / 2 + 0.02, Math.PI);
    k.add(new THREE.CylinderGeometry(0.45, 0.45, 0.1, 12), 0xffd57a, { r: [HALF, 0, 0], p: [0, top + 0.9, -D / 2 - 0.02] });
    torus(k, 0.5, 0.08, timber, [0, top + 0.9, -D / 2 - 0.06], { ts: 12 });
    box(k, 1.1, 2.4, 1.1, stone, [-1.6, top + RISE - 0.1, 1.4], { jit: 0.1 });
    box(k, 1.3, 0.25, 1.3, 0x7d828b, [-1.6, top + RISE + 1.1, 1.4]);
    // Flume on posts bringing water over the top of the wheel from behind.
    const WX = W / 2 + 0.85, WY = 2.9, WR = 3;
    const fy = WY + WR + 0.35;
    box(k, 0.95, 0.12, 3.8, 0x8a5a33, [WX, fy - 0.3, 2.2]);
    [-1, 1].forEach((sd) => box(k, 0.1, 0.42, 3.8, 0x7a4f2c, [WX + sd * 0.45, fy - 0.12, 2.2]));
    box(k, 0.78, 0.06, 3.8, 0x6cc4f0, [WX, fy - 0.2, 2.2], { jit: 0.03 });
    box(k, 0.7, 0.9, 0.08, 0x8fd5f5, [WX, fy - 0.7, 0.28], { r: [0.25, 0, 0], jit: 0.03 });
    [1.2, 3.6].forEach((z) => box(k, 0.22, fy - 0.35, 0.22, timber, [WX, (fy - 0.35) / 2, z]));
    for (let i = 0; i < 5; i++) ball(k, r.range(0.25, 0.4), i % 2 ? 0xffffff : 0xdff3ff, [WX + r.range(-0.6, 0.6), 0.05, r.range(-1.6, 1.6)], { s: [1, 0.5, 1] });
    // The wheel: built round its own axle, then welded and kept so it turns.
    const hub = new THREE.Group();
    hub.position.set(WX, WY, 0);
    const wood = 0x8a5a33, dark = 0x6b4226, x = { parent: hub };
    [-0.42, 0.42].forEach((ox) => {
      torus(k, WR - 0.15, 0.13, dark, [ox, 0, 0], Object.assign({ r: [0, HALF, 0], ts: 22 }, x));
      for (let i = 0; i < 4; i++) box(k, 0.12, (WR - 0.2) * 2, 0.18, wood, [ox, 0, 0], Object.assign({ r: [i * Math.PI / 4, 0, 0] }, x));
    });
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * TAU;
      box(k, 1.05, 0.6, 0.08, i % 2 ? 0x9c6b3f : 0xa8784a, [0, Math.cos(a) * (WR - 0.35), Math.sin(a) * (WR - 0.35)], Object.assign({ r: [a, 0, 0] }, x));
    }
    cyl(k, 0.38, 0.38, 1.15, 0x4a3426, [0, 0, 0], Object.assign({ r: [0, 0, HALF], n: 8 }, x));
    cyl(k, 0.13, 0.13, 1.2, 0x4a3426, [-0.85, 0, 0], Object.assign({ r: [0, 0, HALF], n: 6 }, x));
    const wheel = keep(hub);
    k.root.add(wheel);
    spin(k, wheel, 'x', -r.range(0.45, 0.6));
    k.root.userData.faceRoad = true;
    return finish(k);
  });

  /* ════════════════════════════════════════════════════════════════════════
   * SHORES — "Sea Arch Inlet": a sea channel ~47 m wide, water 6-8 m down
   * ════════════════════════════════════════════════════════════════════════ */

  /**
   * A natural rock arch built as a stack of rock strata: each layer is a
   * squircle slab (one across the span, two where the opening splits the
   * legs), nudged in and out so ledges catch the light. Legs stand on y = 0
   * (a footing row continues below to `foot`), the opening is centred on x = 0.
   * o: { w, h, open, legW, depth, rowH:[min,max], bands, foot, wetY, wetCol,
   *      ledge, capCol, capFrom, shoulder }
   * Returns the top of every slab as [x0, x1, yTop] for dressing.
   */
  function layeredArch(k, r, o) {
    const a0 = o.w / 2 - o.legW, straight = o.open * 0.45;
    const outer = (y) => (o.w / 2) * Math.sqrt(Math.max(0.04, 1 - Math.pow(Math.max(0, y) / o.h, o.shoulder)));
    const inner = (y) => {
      if (y >= o.open) return -1;
      if (y < straight) return a0;
      return a0 * Math.sqrt(Math.max(0, 1 - Math.pow((y - straight) / (o.open - straight), 2)));
    };
    const tops = [];
    let y = o.foot, j = 0;
    while (y < o.h - 0.25) {
      const hb = Math.min(r.range(o.rowH[0], o.rowH[1]), o.h - y);
      const ym = y + hb / 2, ow = outer(ym) + r.range(-0.35, 0.35), iw = inner(ym), dz = r.range(-0.35, 0.35);
      const half = (o.depth / 2) * r.range(0.88, 1.06) * (1 + 0.12 * (1 - Math.max(0, ym) / o.h));
      const side = ym < o.wetY ? o.wetCol : o.bands[(j + r.int(0, 1)) % o.bands.length];
      const cap = ym > o.capFrom ? o.capCol : mix(side, o.ledge, 0.45);
      const under = mix(side, 0x3a2a2a, 0.25);
      const slabs = iw > 0.6 && ow - iw > 0.9 ? [[-ow, -iw], [iw, ow]] : [[-ow, ow]];
      slabs.forEach(([x0, x1]) => {
        const hw = (x1 - x0) / 2 + 0.3;
        const geo = new THREE.CylinderGeometry(1, 1, hb, 14, 1);
        const P = geo.attributes.position;
        for (let i = 0; i < P.count; i++) {
          const px = P.getX(i), pz = P.getZ(i), rr = Math.hypot(px, pz);
          if (rr < 1e-6) continue;
          const c = px / rr, s = pz / rr;
          P.setX(i, Math.sign(c) * Math.pow(Math.abs(c), 0.45) * hw);
          P.setZ(i, Math.sign(s) * Math.pow(Math.abs(s), 0.45) * half);
        }
        jiggle(geo, 0.32, j * 7 + x0, Infinity);
        k.add(geo, (cx, cy) => (cy > ym + 0.01 ? cap : cy < ym - 0.01 ? under : side),
          { p: [(x0 + x1) / 2, ym, dz], r: [0, r.range(-0.03, 0.03), 0], jit: 0.05 });
        tops.push([x0 + 0.3, x1 - 0.3, y + hb, dz]);
      });
      y += hb; j++;
    }
    return tops;
  }

  /** Sandstone sea arch, ~26 × 18 × 8 m (origin: water level between its legs). A landform. */
  prop('sea_arch', (r) => {
    const k = new Kit(r);
    const W = r.range(24.5, 27.5), H = r.range(16.5, 19), D = r.range(7, 8.4);
    const tops = layeredArch(k, r, {
      w: W, h: H, open: H * 0.62, legW: W * 0.24, depth: D, rowH: [1.05, 1.5], foot: -1.2, shoulder: 3.2,
      bands: [0xe8c48f, 0xd9a066, 0xf0d6a8, 0xcf8a52, 0xe3b27a, 0xdcae74], wetY: 0.9, wetCol: 0x9a7350,
      ledge: 0xfff1d6, capCol: 0x6dbb4a, capFrom: H - 1.7
    });
    // A grassy crown and a few bushes on the top layers.
    const crown = tops.filter((t) => t[2] > H - 2.8);
    for (let i = 0; i < 7; i++) {
      const t = crown[i % crown.length], x = r.range(t[0] * 0.85, t[1] * 0.85);
      ball(k, r.range(0.9, 1.5), r.pick([0x5aa83f, 0x4e9a3a, 0x7cc552]), [x, t[2] + 0.35, t[3] + r.range(-D * 0.3, D * 0.3)], { s: [1.2, 0.8, 1.1] });
    }
    // Boulders and surf round the feet.
    const a0 = W / 2 - W * 0.24;
    [-1, 1].forEach((sd) => {
      const fx = sd * (a0 + W * 0.12);
      for (let i = 0; i < 3; i++) {
        const geo = lump(new THREE.IcosahedronGeometry(r.range(0.9, 1.5), 0), 0.15, i + sd * 3);
        k.add(geo, r.pick([0xc99a66, 0xb98955, 0xa77a4c]), { p: [fx + r.range(-3.5, 3.5), r.range(-0.3, 0.1), (i % 2 ? -1 : 1) * D * r.range(0.45, 0.6)], s: [1.2, 0.8, 1] });
      }
      for (let i = 0; i < 7; i++) {
        const a = i / 7 * TAU;
        ball(k, r.range(0.6, 1.0), i % 2 ? 0xffffff : 0xe2f5ff, [fx + Math.cos(a) * W * 0.16, 0.05, Math.sin(a) * D * 0.6], { s: [1.4, 0.3, 1], det: 0 });
      }
    });
    const out = finish(k);
    out.userData.embed = true;
    out.userData.waterline = true;
    return out;
  });

  /**
   * A hull: a segmented box painted in its own flat rows FIRST (so stripes
   * follow the planks), then pinched into a boat — keel V, tapered bow,
   * sheer rising to both ends. Length along x, bow at +x.
   * col(x, y, z) is called with BOX coordinates (y in -H/2..H/2).
   * Returns the geometry plus halfW(x, y) and at(x, yBox) → deformed y.
   */
  function hullGeo(L, H, B, seg, rows, rng, col) {
    const halfW = (x, y) => {
      const xn = x / (L / 2), yn = U.clamp((y + H / 2) / H, 0, 1);
      const bow = xn > 0.25 ? 1 - Math.pow((xn - 0.25) / 0.75, 2) * 0.9 : 1;
      const stern = xn < -0.7 ? 1 - ((-0.7 - xn) / 0.3) * 0.22 : 1;
      return (B / 2) * bow * stern * (0.32 + 0.68 * Math.sqrt(yn));
    };
    const lift = (x, yn) => { const xn = x / (L / 2); return (0.55 * xn * xn + (xn > 0 ? 0.35 * xn : 0)) * H * yn + (1 - yn) * H * 0.35 * xn * xn; };
    const geo = paint(new THREE.BoxGeometry(L, H, B, seg, rows, 2), col, rng, 0.05);
    const P = geo.attributes.position;
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
      P.setXYZ(i, x, y + lift(x, (y + H / 2) / H), Math.sign(z) * halfW(x, y) * Math.abs(z) / (B / 2));
    }
    P.needsUpdate = true;
    geo.computeVertexNormals();
    const at = (x, y) => y + lift(x, (y + H / 2) / H);
    return { geo, halfW, at, deck: (x) => at(x, H / 2) };
  }

  /** A cute broken pirate-style ship, bow up, ~16 m long, its lower third under water (origin: water surface). */
  prop('shipwreck', (r) => {
    const k = new Kit(r);
    const L = 16, H = 3.6, B = 5.2, ROWS = 6, rowH = H / ROWS;
    const ship = new THREE.Group();
    const x = { parent: ship };
    const holeX = r.range(-2.5, -0.5), holeY = r.range(-0.5, 0.1);
    const red = r.pick([0xa0522d, 0x9a4a2a, 0xad5a32]), plank = mix(red, 0x5a2a18, 0.3);
    const hull = hullGeo(L, H, B, 12, ROWS, r, (cx, cy, cz) => {
      if (cy > H / 2 - 0.01) return Math.floor(cx * 0.8) % 2 ? 0xc89a5e : 0xb98a50;
      if (cz < 0 && Math.pow((cx - holeX) / 1.4, 2) + Math.pow((cy - holeY) / 0.75, 2) < 1) return 0x2a1f2e;
      const row = Math.floor((cy + H / 2) / rowH);
      if (row >= ROWS - 1) return 0xf2d38a;
      if (row <= 1) return mix(0x5a7a6a, red, 0.25);
      return row % 2 ? red : plank;
    });
    k.add(hull.geo, null, {}, ship);
    // Broken planks round the hole.
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * TAU + 0.4, px = holeX + Math.cos(a) * 1.35, py = holeY + Math.sin(a) * 0.7;
      box(k, r.range(0.8, 1.3), 0.22, 0.12, plank, [px, hull.at(px, py), -hull.halfW(px, py) - 0.02], Object.assign({ r: [0, r.range(-0.3, 0.3), a + r.range(-0.4, 0.4)] }, x));
    }
    // Portholes on both sides.
    [-4.6, 2.2, 4.2].forEach((px) => [-1, 1].forEach((sd) => {
      const py = 0.45, z = sd * (hull.halfW(px, py) + 0.04), wy = hull.at(px, py);
      torus(k, 0.3, 0.08, 0xf2b134, [px, wy, z], Object.assign({ ts: 10 }, x));
      cyl(k, 0.26, 0.26, 0.06, 0x3b5f9e, [px, wy, z - sd * 0.02], Object.assign({ r: [HALF, 0, 0], n: 10 }, x));
    }));
    // Stern cabin with lit windows.
    const cx = -L / 2 + 2.3, cd = hull.deck(cx);
    box(k, 3, 1.6, B * 0.62, 0xc28a4e, [cx, cd + 0.75, 0], x);
    box(k, 3.4, 0.25, B * 0.7, 0x7a3f22, [cx, cd + 1.65, 0], x);
    [-0.7, 0.7].forEach((ox) => [-1, 1].forEach((sd) => box(k, 0.6, 0.6, 0.06, 0xffd57a, [cx + ox, cd + 0.85, sd * B * 0.31], x)));
    // Main mast: crow's nest, a torn striped sail and a star flag.
    const mx = 1.2, md = hull.deck(mx), mTop = md + 7.2;
    rod(k, [mx, md - 0.5, 0], [mx, mTop, 0], 0.22, 0.16, 0x7a4f2c, Object.assign({ n: 6 }, x));
    cyl(k, 0.65, 0.5, 0.55, 0x8a5a33, [mx, mTop - 1.3, 0], Object.assign({ n: 8 }, x));
    rod(k, [mx, mTop - 2.2, -2.3], [mx, mTop - 2.2, 2.3], 0.1, 0.1, 0x6b4226, Object.assign({ n: 5 }, x));
    const sail = new THREE.Shape();
    sail.moveTo(-2.2, 0.4); sail.lineTo(-1.3, 0); sail.lineTo(-0.5, 0.7); sail.lineTo(0.3, 0.1); sail.lineTo(0.9, 0.9); sail.lineTo(1.6, 0.2);
    sail.lineTo(2.2, 0.5); sail.lineTo(2.2, 3.4); sail.lineTo(-2.2, 3.4); sail.closePath();
    const sailGeo = new THREE.ExtrudeGeometry(sail, { depth: 0.1, bevelEnabled: false, curveSegments: 1 });
    k.add(sailGeo, (sx, sy, sz) => (Math.floor((sz + 2.2) / 0.88) % 2 ? 0xf7f1e3 : 0xe0474c),
      { r: [0, HALF, 0], p: [mx + 0.25, mTop - 5.6, 0], jit: 0.02 }, ship);
    box(k, 1.5, 0.95, 0.06, 0x3e6fd8, [mx - 0.8, mTop - 0.45, 0], x);
    [-1, 1].forEach((sd) => k.add(starGeo(0.32, 0.04), 0xffd23f, { p: [mx - 0.8, mTop - 0.45, sd * 0.05] }, ship));
    // Rear mast snapped off; its top half lies across the deck into the sea.
    const sx = -2.6, sd0 = hull.deck(sx);
    rod(k, [sx, sd0 - 0.4, 0], [sx, sd0 + 2.2, 0], 0.2, 0.18, 0x7a4f2c, Object.assign({ n: 6 }, x));
    cone(k, 0.2, 0.5, 0xc89a5e, [sx + 0.05, sd0 + 2.4, 0], Object.assign({ r: [0, 0, 0.5], n: 5 }, x));
    rod(k, [sx + 0.4, sd0 + 0.2, 0.3], [sx - 3.2, sd0 - 2.2, B * 0.85], 0.17, 0.15, 0x7a4f2c, Object.assign({ n: 6 }, x));
    rod(k, [L / 2 - 0.4, hull.deck(L / 2 - 0.4) - 0.2, 0], [L / 2 + 2.1, hull.deck(L / 2) + 1.1, 0], 0.14, 0.07, 0x6b4226, Object.assign({ n: 5 }, x));
    // Seaweed and barnacles low on the hull.
    for (let i = 0; i < 6; i++) {
      const px = r.range(-L / 2 + 1, 1), py = r.range(-1.3, -0.6), sd = r.sign();
      ball(k, r.range(0.25, 0.45), r.pick([0x4f9a5a, 0x6fb35e, 0xd6ccb8]), [px, hull.at(px, py), sd * hull.halfW(px, py)], Object.assign({ s: [1, 0.7, 0.5], det: 0 }, x));
    }
    ship.rotation.set(r.range(0.08, 0.14), r.range(-0.1, 0.1), 0.35);
    ship.position.set(0, 0.7, 0);
    k.root.add(ship);
    // Foam where the hull meets the sea.
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * TAU;
      ball(k, r.range(0.5, 0.9), i % 2 ? 0xffffff : 0xe2f5ff, [Math.cos(a) * 5.2 - 0.6, 0.05, Math.sin(a) * 3.1], { s: [1.5, 0.28, 1], det: 0 });
    }
    return wet(k);
  });

  /** A dolphin built along +X (head forward), bent over an arc of radius R about (0, -R). */
  function dolphin(k, node, R, rng) {
    const tmp = new THREE.Group(), x = { parent: tmp };
    const back = rng.pick([0x3f7fd9, 0x4a88e0, 0x3a74c8]), belly = 0xd2e8f8;
    const twoTone = (cx, cy) => (cy < -0.06 ? belly : back);
    k.add(new THREE.IcosahedronGeometry(1, 1), twoTone, { s: [1.05, 0.38, 0.4] }, tmp);
    k.add(new THREE.IcosahedronGeometry(1, 0), twoTone, { s: [0.3, 0.11, 0.12], p: [1.1, -0.05, 0] }, tmp);
    cone(k, 0.22, 0.42, back, [-0.05, 0.38, 0], Object.assign({ r: [0, 0, 0.55], n: 4, s: [1, 1, 0.3] }, x));
    cone(k, 0.2, 0.6, back, [-0.95, 0, 0], Object.assign({ r: [0, 0, HALF], n: 5, s: [1, 1, 0.8] }, x));
    [-1, 1].forEach((sd) => {
      ball(k, 1, back, [-1.32, 0.02, sd * 0.22], Object.assign({ s: [0.16, 0.04, 0.3], r: [0, sd * 0.5, 0], det: 0 }, x));
      ball(k, 1, back, [0.42, -0.2, sd * 0.28], Object.assign({ s: [0.2, 0.04, 0.12], r: [0, -sd * 0.5, sd * 0.4], det: 0 }, x));
      ball(k, 0.055, INK, [0.78, 0.07, sd * 0.2], Object.assign({ det: 0 }, x));
    });
    tmp.children.slice().forEach((m) => {
      const P = m.geometry.attributes.position;
      for (let i = 0; i < P.count; i++) {
        const th = P.getX(i) / R, rr = R + P.getY(i);
        P.setXYZ(i, rr * Math.sin(th), rr * Math.cos(th) - R, P.getZ(i));
      }
      P.needsUpdate = true;
      node.add(m);
    });
  }

  /** Three dolphins leaping one after another along +X, ~7 m span (origin: water surface). */
  prop('dolphin_pod', (r) => {
    const k = new Kit(r), nodes = [], R = 2.2, depth = 1.4, ph = [];
    for (let i = 0; i < 3; i++) {
      const node = new THREE.Group(), px = (i - 1) * 2.1, pz = (i % 2 ? 0.9 : -0.3) + r.range(-0.2, 0.2);
      dolphin(k, node, R, r);
      node.children.forEach((m) => m.geometry.translate(px, -depth + R, pz));
      node.userData.pivot = [px, -depth, pz];
      nodes.push(node);
      ph.push(0.08 + i * 0.13 + r.range(-0.02, 0.02));
      [-1, 1].forEach((sd) => ripple(k, r.range(0.4, 0.55), px + sd * 1.45, pz, 0xffffff, { ts: 10 }));
      ball(k, 0.12, 0xe6f6ff, [px - 1.45, 0.35, pz + 0.2], { det: 0 });
      ball(k, 0.09, 0xffffff, [px - 1.6, 0.6, pz - 0.15], { det: 0 });
    }
    // A leap is a turn about the pivot under the water, +1.6 → -1.6 rad, then
    // a pause below the surface (the hop back to the start is out of sight).
    flock(k, nodes, LIT(), (g, t) => {
      const u = ((t * 0.3 + ph[g]) % 1 + 1) % 1;
      return { rz: u < 0.62 ? 1.6 - 3.2 * (u / 0.62) : -1.6 };
    }, 2.5);
    return wet(k);
  });

  /** A red-and-white channel buoy with a swinging bell and a lamp (origin: water surface). */
  prop('buoy_bell', (r) => {
    const k = new Kit(r);
    const node = new THREE.Group(), x = { parent: node }, RED = 0xe0393e, WHITE = 0xf7f7f2;
    k.add(new THREE.CylinderGeometry(0.95, 0.75, 0.95, 12), (cx, cy) => (cy > 0.18 ? WHITE : RED), {}, node);
    cyl(k, 1.02, 1.02, 0.14, 0x4a4f5e, [0, 0.52, 0], Object.assign({ n: 12 }, x));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      rod(k, [sx * 0.62, 0.55, sz * 0.62], [sx * 0.26, 2.35, sz * 0.26], 0.07, 0.06, RED, Object.assign({ n: 4 }, x));
    }
    torus(k, 0.5, 0.06, WHITE, [0, 1.25, 0], Object.assign({ r: [HALF, 0, 0], ts: 12 }, x));
    torus(k, 0.36, 0.06, RED, [0, 1.95, 0], Object.assign({ r: [HALF, 0, 0], ts: 12 }, x));
    box(k, 0.62, 0.5, 0.05, WHITE, [0, 1.62, -0.42], Object.assign({ r: [0.19, 0, 0] }, x));
    box(k, 0.36, 0.3, 0.06, RED, [0, 1.62, -0.45], Object.assign({ r: [0.19, 0, 0] }, x));
    cyl(k, 0.42, 0.42, 0.14, 0x4a4f5e, [0, 2.4, 0], Object.assign({ n: 10 }, x));
    cyl(k, 0.2, 0.24, 0.12, 0x4a4f5e, [0, 2.5, 0], Object.assign({ n: 8 }, x));
    ball(k, 0.2, 0xffd84a, [0, 2.72, 0], Object.assign({ mat: GLOW() }, x));
    cone(k, 0.24, 0.24, RED, [0, 2.98, 0], Object.assign({ n: 8 }, x));
    // The bell swings on its own pin under the tower top.
    const bellNode = new THREE.Group();
    bellNode.position.set(0, 2.22, 0);
    const bx = { parent: bellNode };
    cyl(k, 0.16, 0.3, 0.42, 0xf2b134, [0, -0.33, 0], Object.assign({ n: 10 }, bx));
    ball(k, 0.16, 0xf2b134, [0, -0.13, 0], Object.assign({ s: [1, 0.6, 1], det: 0 }, bx));
    ball(k, 0.08, 0x5a4a3a, [0, -0.58, 0], Object.assign({ det: 0 }, bx));
    rod(k, [0, 0.14, 0], [0, -0.06, 0], 0.04, 0.04, 0x4a4f5e, Object.assign({ n: 4 }, bx));
    const bell = keep(bellNode);
    node.add(bell);
    const buoy = keep(node);
    k.root.add(buoy);
    ripple(k, 1.25, 0, 0, null, { ts: 18 });
    const ph = r.range(0, TAU);
    bob(k, buoy, 'y', 1.4, 0.1, ph);
    sway(k, buoy, 'x', 1.1, 0.07, ph + 0.8);
    sway(k, buoy, 'z', 0.9, 0.06, ph + 2.1);
    sway(k, bell, 'x', 2.2, 0.28, ph);
    return wet(k);
  });

  /* ════════════════════════════════════════════════════════════════════════
   * FALLS — one builder for the chocolate, water and lava falls
   * ════════════════════════════════════════════════════════════════════════ */

  /** Flow palettes: a base, vertical streaks and short highlight dashes. */
  const FLOW = {
    water: { base: '#4fb6ea', streaks: ['#86d4f6', '#bfe9fb', '#3a9fdc', '#e8f8ff', '#6cc6f2'], dash: '#ffffff', dashes: 26 },
    choco: { base: '#6a3519', streaks: ['#7d4424', '#552810', '#8f5530', '#e9cfa6', '#74401f'], dash: '#f6e7c8', dashes: 10 },
    lava: { base: '#b8360c', streaks: ['#e0601a', '#f08a1c', '#c94410', '#f5b52e', '#d85016'], dash: '#5e1c08', dashes: 18 }
  };
  /** ONE shared canvas texture per kind; every falls of that kind scrolls together. */
  function flowTex(kind) {
    return A.tex.cached('gapflow|' + kind, () => A.tex.canvas(128, 256, (g, w, h) => {
      const P = FLOW[kind], rr = U.rng(U.hash('gapflow' + kind));
      g.fillStyle = P.base;
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 24; i++) {
        const x0 = rr.range(0, w), sw = i % 5 === 3 ? rr.range(2, 4) : rr.range(4, 13), amp = rr.range(1, 5), ph = rr.range(0, TAU), n = rr.int(1, 3);
        g.fillStyle = P.streaks[i % P.streaks.length];
        for (const off of [-w, 0, w]) {
          g.beginPath();
          for (let y = 0; y <= h; y += 16) g.lineTo(off + x0 + amp * Math.sin(y / h * TAU * n + ph), y);
          for (let y = h; y >= 0; y -= 16) g.lineTo(off + x0 + sw + amp * Math.sin(y / h * TAU * n + ph), y);
          g.closePath();
          g.fill();
        }
      }
      g.fillStyle = P.dash;
      for (let i = 0; i < P.dashes; i++) {
        const x = rr.range(0, w), y = rr.range(0, h), len = rr.range(8, 26), wd = rr.range(1.5, 3);
        for (const oy of [-h, 0, h]) { g.beginPath(); g.ellipse(x, y + oy, wd, len, 0, 0, TAU); g.fill(); }
      }
    }, { repeat: true }));
  }
  function flowMat(kind) {
    const map = flowTex(kind);
    if (kind === 'water') return A.mat.basic(0xffffff, { map, transparent: true, opacity: 0.85, side: 'double' });
    if (kind === 'lava') return A.mat.basic(0xffffff, { map, side: 'double' });
    return A.mat.lambert(0xffffff, { map, side: 'double' });
  }

  /**
   * The flowing sheet: a grid along a path in (y, z) from the pool's back
   * edge (+Z), over the crest at z ≈ 0, down to the base, bulging toward -Z
   * and drifting out as it falls. UV v runs WITH the flow, so
   * offset.y = -t × speed scrolls it downstream.
   * o: { w, h, pool, lip, drift, bulge, flare, repU, texLen, speed, kind }
   */
  function fallsSheet(k, o) {
    const rows = 14, cols = 8, crestY = o.h - 0.35;
    const path = [[o.h + o.pool, o.lip], [o.h + o.pool, 0.6], [o.h + o.pool * 0.55, 0.05], [crestY, -0.42]];
    for (let j = 1; j <= rows; j++) {
      const v = j / rows;
      path.push([crestY * (1 - v), -0.42 - o.drift * Math.pow(v, 1.4)]);
    }
    const s = [0];
    for (let i = 1; i < path.length; i++) s.push(s[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
    const pos = [], uv = [], idx = [];
    path.forEach((p, i) => {
      const down = i < 3 ? 0 : (i - 3) / rows;
      for (let c = 0; c <= cols; c++) {
        const u = c / cols;
        const bul = i < 3 ? 0 : o.bulge * Math.sin(Math.PI * u) * (0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, down * 1.3)));
        pos.push((u - 0.5) * o.w * (1 + o.flare * down), p[0], p[1] - bul);
        uv.push(u * o.repU, s[i] / o.texLen);
      }
    });
    for (let i = 0; i + 1 < path.length; i++) {
      for (let c = 0; c < cols; c++) {
        const a = i * (cols + 1) + c, b = a + 1, d = a + cols + 1, e = d + 1;
        idx.push(a, d, b, b, d, e);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const mat = flowMat(o.kind);
    k.root.add(new THREE.Mesh(g, mat));
    const tex = mat.map;
    onAnim(k, (t) => { tex.offset.y = -t * o.speed; });
    return { baseZ: -0.42 - o.drift };
  }

  /**
   * A cliff block built from stacked layers (cake tiers, sandstone, stone
   * courses). layer(j, y) → [height, colour]; the top layer wears capCol.
   */
  function cliffBack(k, r, o) {
    let y = o.y0, j = 0;
    while (y < o.y1 - 0.05) {
      const L = o.layer(j, y), hb = Math.min(L[0], o.y1 - y), side = L[1];
      const last = y + hb >= o.y1 - 0.01;
      const top = last && o.capCol !== undefined ? o.capCol : mix(side, 0xffffff, 0.14);
      const geo = new THREE.BoxGeometry(o.x1 - o.x0 + r.range(0, o.wob || 0.6), hb, o.z1 - o.z0, 4, 1, 2);
      if (o.jig) jiggle(geo, o.jig, j * 3.1 + o.x0 + o.y0, Infinity);
      const y0 = y;
      k.add(geo, (cx, cy) => (cy > y0 + hb - 0.01 ? top : side),
        { p: [(o.x0 + o.x1) / 2 + r.range(-0.2, 0.2), y + hb / 2, (o.z0 + o.z1) / 2 + r.range(-(o.wob || 0.6), (o.wob || 0.6)) * 0.4], jit: 0.04 });
      y += hb; j++;
    }
  }

  /** A ring of squashed foam / mist blobs round the foot of a falls. */
  function splash(k, r, o) {
    for (let i = 0; i < o.n; i++) {
      const a = i / o.n * TAU + r.range(-0.2, 0.2);
      const x = Math.cos(a) * o.rx * r.range(0.75, 1.05), z = o.z + Math.sin(a) * o.rz * r.range(0.7, 1.05);
      ball(k, r.range(o.r[0], o.r[1]), r.pick(o.cols), [x, o.y, z], { s: [1.3, o.flat, 1.1], mat: o.mat, det: o.det });
    }
  }

  /* ════════════════════════════════════════════════════════════════════════
   * CANDY — "Chocolate River Canyon": ~78 m wide, river ~16 m below the road
   * ════════════════════════════════════════════════════════════════════════ */
  const CAKE = [[1.5, 0xf2c48d], [0.35, 0xfff3e0], [1.1, 0x7a4426], [0.35, 0xf7a1c4]];

  /** Chocolate waterfall pouring off a layer-cake cliff (origin: base centre at river level; viewer at -Z). */
  prop('choco_falls', (r) => {
    const k = new Kit(r);
    const W = r.range(9.5, 10.5), H = r.range(17.2, 18.6), LIP = 3.2;
    const f = fallsSheet(k, { kind: 'choco', w: W, h: H, pool: 0.35, lip: LIP, drift: 1.6, bulge: 0.9, flare: 0.14, repU: 2, texLen: 6, speed: 0.35 });
    const off = r.int(0, 3);
    cliffBack(k, r, { x0: -W / 2 - 1.1, x1: W / 2 + 1.1, z0: 0.05, z1: LIP + 1.4, y0: -0.6, y1: H + 0.15, layer: (j) => CAKE[(j + off) % 4], capCol: 0xfff8f0, wob: 0.4 });
    // Frosted rim round the pool, with drips down the cliff and a cherry on top.
    [-1, 1].forEach((sd) => {
      box(k, 1.0, 0.9, LIP + 1.4, 0xf2c48d, [sd * (W / 2 + 0.6), H + 0.6, (LIP + 1.4) / 2 + 0.05]);
      box(k, 1.1, 0.3, LIP + 1.5, 0xfff8f0, [sd * (W / 2 + 0.6), H + 1.15, (LIP + 1.4) / 2 + 0.05]);
      for (let i = 0; i < 2; i++) {
        const x = sd * (W / 2 + 0.35 + i * 0.5 + r.range(0, 0.1)), len = r.range(0.5, 1.6);
        cyl(k, 0.2, 0.2, len, 0xfff8f0, [x, H + 0.15 - len / 2, -0.02], { n: 6 });
        ball(k, 0.2, 0xfff8f0, [x, H + 0.15 - len, -0.02], { det: 0 });
      }
    });
    box(k, W + 2.2, 0.9, 1, 0xf2c48d, [0, H + 0.6, LIP + 0.95]);
    box(k, W + 2.3, 0.3, 1.1, 0xfff8f0, [0, H + 1.15, LIP + 0.95]);
    const cs = r.sign(), chx = cs * (W / 2 + 0.6);
    ball(k, 0.7, 0xe0203c, [chx, H + 1.95, 1.0]);
    rod(k, [chx, H + 2.5, 1.0], [chx + cs * 0.4, H + 3.4, 1.3], 0.07, 0.05, 0x5f8a2c, { n: 4 });
    const SPR = [0xff5fa2, 0x5fc8ff, 0xffd23f, 0x7fe07a, 0xb38aff];
    for (let i = 0; i < 14; i++) {
      const sd = i % 2 ? 1 : -1;
      box(k, 0.32, 0.08, 0.1, SPR[i % SPR.length], [sd * (W / 2 + r.range(0.25, 0.95)), H + 1.32, r.range(0.4, LIP + 1.2)], { r: [0, r.range(0, TAU), 0], jit: 0 });
    }
    // A frothy cream splash at the foot.
    k.add(new THREE.CylinderGeometry(1, 1, 0.12, 16), 0xd9b48a, { s: [W / 2 + 0.4, 1, 2.3], p: [0, 0.06, f.baseZ] });
    splash(k, r, { n: 16, rx: W / 2 - 0.4, rz: 1.7, z: f.baseZ, y: 0.15, r: [0.6, 1.1], flat: 0.55, cols: [0xfff3dc, 0xf6e2c0, 0xe9cfa6] });
    k.root.userData.faceRoad = true;
    return finish(k);
  });

  /** One crystal: a hexagonal prism with a pointed tip, built along +Y from its foot. */
  function crystal(k, len, rad, col, tip, p, rot, x) {
    const body = new THREE.CylinderGeometry(rad, rad * 1.08, len * 0.74, 6, 1).translate(0, len * 0.37, 0);
    const cap = new THREE.ConeGeometry(rad, len * 0.26, 6, 1).translate(0, len * 0.87, 0);
    const o = { r: rot, p, order: 'YXZ' };
    k.add(body, (cx, cy, cz, i) => (i % 2 ? col : mix(col, 0xffffff, 0.3)), Object.assign({ mat: x && x.mat }, o), x && x.parent);
    k.add(cap, (cx, cy, cz, i) => (i % 2 ? tip : mix(tip, 0xffffff, 0.35)), Object.assign({ mat: x && x.mat }, o), x && x.parent);
  }

  /** Chunky pastel rock-candy crystals on a sugar mound, ~3 m (origin: ground). */
  prop('rock_candy', (r) => {
    const k = new Kit(r);
    const PAST = [0xffa6d2, 0xc4a8ff, 0x9eecd2, 0xa0d4ff, 0xfff09a];
    ball(k, 1, 0xfdf6ff, [0, 0.12, 0], { s: [1.35, 0.42, 1.2], jit: 0.12 });
    const n = r.int(7, 9);
    for (let i = 0; i < n; i++) {
      const a = i * 2.39996 + r.range(-0.2, 0.2), d = i ? r.range(0.35, 0.95) : 0;
      const len = i ? r.range(1.2, 2.3) : r.range(2.6, 3), rad = i ? r.range(0.2, 0.32) : 0.42;
      const col = PAST[(i + r.int(0, 4)) % PAST.length];
      crystal(k, len, rad, col, mix(col, 0xffffff, 0.2), [Math.cos(a) * d, 0, Math.sin(a) * d], [i ? r.range(0.35, 0.75) : 0.05, -a + HALF, 0]);
    }
    for (let i = 0; i < 6; i++) {
      const a = r.range(0, TAU);
      box(k, 0.22, 0.22, 0.22, r.pick(PAST), [Math.cos(a) * r.range(1.1, 1.5), 0.08, Math.sin(a) * r.range(1.0, 1.4)], { r: [r.range(0, 1), r.range(0, 1), 0] });
    }
    return finish(k);
  });

  /** Pink and white marshmallows standing in the chocolate river, ~4 m (origin: river surface). */
  prop('marshmallow_stones', (r) => {
    const k = new Kit(r), n = r.int(4, 6), spots = [];
    const COL = [0xffb6d0, 0xfff6f6, 0xf4dcff, 0xffc9de];
    for (let i = 0; i < n; i++) {
      let x = 0, z = 0, rad = 0.5, tries = 0;
      do {
        const a = r.range(0, TAU), d = Math.sqrt(r.next()) * 1.5;
        x = Math.cos(a) * d; z = Math.sin(a) * d; rad = r.range(0.45, 0.68); tries++;
      } while (tries < 14 && spots.some((p) => Math.hypot(p[0] - x, p[1] - z) < p[2] + rad + 0.1));
      spots.push([x, z, rad]);
      const h = r.range(1.0, 1.7), col = COL[i % COL.length], toasted = i === 2;
      const tilt = [r.range(-0.18, 0.18), r.range(0, TAU), r.range(-0.18, 0.18)];
      const g = new THREE.CylinderGeometry(rad * 0.97, rad, h, 14, 1).translate(0, h / 2 - 0.6, 0);
      k.add(g, (cx, cy) => (toasted && cy > h - 0.75 ? 0xe9b878 : col), { r: tilt, p: [x, 0, z] });
      const cap = new THREE.SphereGeometry(rad * 0.97, 14, 3, 0, TAU, 0, HALF).scale(1, 0.32, 1).translate(0, h - 0.6, 0);
      k.add(cap, toasted ? 0xdba264 : mix(col, 0xffffff, 0.25), { r: tilt, p: [x, 0, z] });
      ripple(k, rad * 1.18, x, z, 0xf2dcb8, { ts: 14 });
    }
    return wet(k);
  });

  /** A graham-cracker raft with a lollipop mast and a pennant, ~4 m, bobbing (origin: river surface). */
  prop('candy_raft', (r) => {
    const k = new Kit(r);
    const node = new THREE.Group(), x = { parent: node };
    const CR = 0xd9a05b, HOLE = 0xa8743c;
    for (let i = 0; i < 3; i++) {
      const px = (i - 1) * 1.08;
      box(k, 1.0, 0.22, 3.7, mix(CR, 0xffffff, (i % 2) * 0.08), [px, 0.08, 0], Object.assign({ r: [0, r.range(-0.03, 0.03), 0] }, x));
      for (let j = 0; j < 6; j++) box(k, 0.09, 0.03, 0.09, HOLE, [px + (j % 2 ? 0.22 : -0.22), 0.2, -1.4 + Math.floor(j / 2) * 1.4], Object.assign({ jit: 0 }, x));
      box(k, 0.04, 0.03, 3.6, HOLE, [px, 0.2, 0], Object.assign({ jit: 0 }, x));
    }
    [-1.25, 1.25].forEach((z) => {
      box(k, 3.4, 0.13, 0.2, 0xd8283c, [0, 0.21, z], x);
      [-1.6, 1.6].forEach((sx) => torus(k, 0.18, 0.07, 0xd8283c, [sx, 0.1, z], Object.assign({ r: [0, HALF, 0], ts: 8, rs: 3 }, x)));
    });
    // Lollipop mast: a striped stick, a swirl disc facing -Z and a pennant.
    cyl(k, 0.07, 0.07, 3.6, 0xfff8f0, [0, 1.95, 0.4], Object.assign({ n: 6 }, x));
    const swirl = (cx, cy) => {
      const dx = cx, dy = cy - 2.9, a = Math.atan2(dy, dx), rr = Math.hypot(dx, dy);
      return Math.floor(a / TAU * 3 + rr / 0.26 + 3) % 2 ? 0xff5fa2 : 0xfff2f8;
    };
    [-1, 1].forEach((sd) => {
      const ring = new THREE.RingGeometry(0.03, 0.78, 18, 4);
      k.add(ring, swirl, { r: [0, sd < 0 ? Math.PI : 0, 0], p: [0, 2.9, 0.4 + sd * 0.09], jit: 0.02 }, node);
    });
    k.add(new THREE.CylinderGeometry(0.78, 0.78, 0.18, 18, 1, true), 0xff8cc0, { r: [HALF, 0, 0], p: [0, 2.9, 0.4] }, node);
    const flag = new THREE.Shape();
    flag.moveTo(0, 0); flag.lineTo(-0.95, -0.27); flag.lineTo(0, -0.55); flag.closePath();
    k.add(new THREE.ExtrudeGeometry(flag, { depth: 0.04, bevelEnabled: false }), (cx, cy) => (cy > 3.48 ? 0x5fc8ff : 0xffd23f), { p: [-0.04, 3.75, 0.38] }, node);
    ball(k, 0.1, 0xffd23f, [0, 3.8, 0.4], Object.assign({ det: 0 }, x));
    // Gumdrop cargo.
    [[0.7, -1.0, 0x7fe07a], [-0.75, 0.9, 0xff9a3a], [0.85, 1.1, 0xb38aff]].forEach((g) => {
      k.add(new THREE.SphereGeometry(0.3, 8, 4, 0, TAU, 0, HALF), g[2], { s: [1, 1.2, 1], p: [g[0], 0.19, g[1]] }, node);
    });
    const raft = keep(node);
    k.root.add(raft);
    ripple(k, 2.0, 0, 0, 0xf2dcb8, { s: [0.95, 1.08, 0.35], ts: 20 });
    const ph = r.range(0, TAU);
    bob(k, raft, 'y', 1.3, 0.06, ph);
    sway(k, raft, 'x', 0.9, 0.04, ph + 1);
    sway(k, raft, 'z', 1.1, 0.035, ph + 2);
    return wet(k);
  });

  /* ════════════════════════════════════════════════════════════════════════
   * DUNES — "Red Rock Canyon": ~78 m wide, turquoise river ~20 m below
   * ════════════════════════════════════════════════════════════════════════ */
  const REDROCK = [0xc4502e, 0xd9733a, 0xb5432a, 0xe89a5a, 0xcc5f34, 0xf0b27a];

  /**
   * The snapped half of a hanging bridge. Origin = the rim edge at ground
   * level between the posts; the posts stand on y = 0 toward +Z, the span
   * goes over the edge and hangs down a cliff face at z ≈ -0.5 to y = -drop.
   * o: { drop, chain, planks:[hex], rope, post(k, x) }
   */
  function danglingBridge(k, r, o) {
    const PX = 1.15, PZ = 0.75, RX = 0.95;
    [-1, 1].forEach((sd) => o.post(k, sd * PX, PZ));
    // Ropes or chains from the posts to the lip, and the first planks on the ground.
    const line = (a, b, x) => {
      if (!o.chain) { rod(k, a, b, 0.07, 0.07, o.rope, Object.assign({ n: 5 }, x)); return; }
      const n = Math.max(2, Math.round(dist(a, b) / 0.3));
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n, p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
        const g = new THREE.TorusGeometry(0.1, 0.035, 3, 6).scale(1, 1.55, 1);
        if (i % 2) g.rotateY(HALF);
        _dir.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
        _q.setFromUnitVectors(_up, _dir);
        g.applyQuaternion(_q).translate(p[0], p[1], p[2]);
        k.add(g, o.rope, { jit: 0.08, mat: x && x.mat }, x && x.parent);
      }
    };
    [-1, 1].forEach((sd) => line([sd * PX * 0.95, 1.3, PZ], [sd * RX, 0.06, -0.45]));
    [0.25, -0.2].forEach((z, i) => box(k, 2.15, 0.09, 0.36, o.planks[i % o.planks.length], [r.range(-0.05, 0.05), 0.05, z], { r: [0, r.range(-0.08, 0.08), 0] }));
    // The dangling part hangs from a pin at the lip and sways (kept).
    const node = new THREE.Group();
    node.position.set(0, 0, -0.5);
    const x = { parent: node };
    const zAt = (y) => -0.12 - 0.22 * Math.min(1, -y / 3);
    const pts = (sd) => [0, -1.5, -4, -o.drop * 0.6, -o.drop].map((y, i) => [sd * RX + (i ? r.range(-0.08, 0.08) : 0), y, zAt(y)]);
    const left = pts(-1), right = pts(1);
    right[4][1] += 0.6;
    for (let i = 0; i + 1 < left.length; i++) { line(left[i], left[i + 1], x); line(right[i], right[i + 1], x); }
    const lerpX = (side, y) => {
      for (let i = 0; i + 1 < side.length; i++) {
        if (y <= side[i][1] && y >= side[i + 1][1]) { const t = (y - side[i][1]) / (side[i + 1][1] - side[i][1]); return side[i][0] + (side[i + 1][0] - side[i][0]) * t; }
      }
      return side[side.length - 1][0];
    };
    for (let y = -0.45; y > -o.drop + 0.7; y -= 0.56) {
      if (r.chance(0.12)) continue;
      const xl = lerpX(left, y), xr = lerpX(right, y), crooked = r.chance(0.15) ? r.range(-0.3, 0.3) : r.range(-0.06, 0.06);
      box(k, xr - xl + 0.3, 0.32, 0.08, r.pick(o.planks), [(xl + xr) / 2, y, zAt(y) - 0.05], Object.assign({ r: [0, 0, crooked] }, x));
    }
    // The last plank hangs by one rope.
    box(k, 1.6, 0.32, 0.08, r.pick(o.planks), [-RX + 0.6, -o.drop + 0.1, zAt(-o.drop) - 0.05], Object.assign({ r: [0, 0, -0.85] }, x));
    const dangle = keep(node);
    k.root.add(dangle);
    const ph = r.range(0, TAU);
    sway(k, dangle, 'z', 0.55, 0.022, ph);
    let rest;
    onAnim(k, (t) => { if (rest === undefined) rest = dangle.rotation.x; dangle.rotation.x = rest + 0.008 * (1 + Math.sin(0.8 * t + ph + 1)); });
    return dangle;
  }
  function woodPost(k, x, z) {
    cyl(k, 0.17, 0.2, 1.75, 0x7a4f2c, [x, 0.87, z], { n: 7 });
    cone(k, 0.2, 0.25, 0x6b4226, [x, 1.87, z], { n: 7 });
    [1.15, 1.32].forEach((y) => torus(k, 0.2, 0.05, 0xd8b47a, [x, y, z], { r: [HALF, 0, 0], ts: 9, rs: 3 }));
  }

  /** The snapped half of an old rope bridge hanging ~14 m down the cliff (origin: rim edge at ground level). */
  prop('rope_bridge_dangling', (r) => {
    const k = new Kit(r);
    danglingBridge(k, r, { drop: r.range(13, 14.5), chain: false, planks: [0x9a6a3c, 0x8a5a30, 0xa8784a, 0x7f5530], rope: 0xd8b47a, post: woodPost });
    // A frayed rope end flapping from the left post.
    rod(k, [-1.15, 1.25, 0.75], [-1.5, 0.3, 0.2], 0.05, 0.03, 0xd8b47a, { n: 4 });
    return finish(k);
  });

  /** A red sandstone arch ~28 m wide, ~32 m tall, standing on the canyon floor (origin: floor between its legs). A landform. */
  prop('natural_arch_red', (r) => {
    const k = new Kit(r);
    const W = r.range(26.5, 29.5), H = r.range(30.5, 33.5), D = r.range(8.5, 10);
    const tops = layeredArch(k, r, {
      w: W, h: H, open: H * 0.68, legW: W * 0.22, depth: D, rowH: [1.5, 2.2], foot: -0.6, shoulder: 3.6,
      bands: REDROCK, wetY: -1, wetCol: 0x8a3a24, ledge: 0xffd9a8, capCol: 0xe9b57f, capFrom: H - 2.4
    });
    const crown = tops.filter((t) => t[2] > H - 2.6);
    for (let i = 0; i < 4; i++) {
      const t = crown[i % crown.length];
      ball(k, r.range(0.5, 0.8), r.pick([0x8a9a4a, 0x7a8c3e, 0x9aa858]), [r.range(t[0] * 0.8, t[1] * 0.8), t[2] + 0.3, t[3] + r.range(-2.5, 2.5)], { s: [1.2, 0.8, 1.1], det: 0 });
    }
    for (let i = 0; i < 5; i++) {
      const sd = i % 2 ? 1 : -1;
      const geo = lump(new THREE.IcosahedronGeometry(r.range(1, 2.2), 0), 0.15, i);
      k.add(geo, r.pick(REDROCK), { p: [sd * r.range(W * 0.3, W * 0.55), r.range(0, 0.4), r.range(-D * 0.7, D * 0.7)], s: [1.2, 0.7, 1] });
    }
    const out = finish(k);
    out.userData.embed = true;
    return out;
  });

  /** A white-water falls off red rock, ~9 × 22 m, mist at its foot (origin: base centre at river level; viewer at -Z). */
  prop('canyon_falls', (r) => {
    const k = new Kit(r);
    const W = r.range(8.5, 9.5), H = r.range(21, 23), LIP = 2.6;
    const f = fallsSheet(k, { kind: 'water', w: W, h: H, pool: 0.3, lip: LIP, drift: 1.8, bulge: 0.8, flare: 0.1, repU: 2, texLen: 7, speed: 0.6 });
    const off = r.int(0, 5);
    cliffBack(k, r, { x0: -W / 2 - 0.9, x1: W / 2 + 0.9, z0: 0.05, z1: LIP + 1.6, wob: 0.4, y0: -0.6, y1: H + 0.15,
      layer: (j) => [r.range(1.3, 2.1), REDROCK[(j + off) % REDROCK.length]], capCol: 0xe9b57f, jig: 0.25 });
    [-1, 1].forEach((sd) => {
      box(k, 1.2, 1.3, LIP + 1.6, REDROCK[(off + 2) % 6], [sd * (W / 2 + 0.65), H + 0.75, (LIP + 1.6) / 2 + 0.05]);
      box(k, 0.9, 0.8, 1.0, REDROCK[(off + 3) % 6], [sd * (W / 2 + 0.35), H + 0.5, 0.3]);
    });
    k.add(new THREE.CylinderGeometry(1, 1, 0.12, 16), 0xe8f7ff, { s: [W / 2 + 0.4, 1, 2.4], p: [0, 0.06, f.baseZ] });
    splash(k, r, { n: 14, rx: W / 2 - 0.4, rz: 1.7, z: f.baseZ, y: 0.15, r: [0.5, 1.0], flat: 0.55, cols: [0xffffff, 0xe2f5ff, 0xc9ecfb] });
    for (let i = 0; i < 9; i++) {
      ball(k, r.range(0.9, 1.6), r.pick([0xf4fbff, 0xe6f4fb, 0xffffff]), [r.range(-W / 2 + 1, W / 2 - 1), r.range(0.8, 3.6), f.baseZ - r.range(0.4, 2.2)], { s: [1.2, 0.9, 1] });
    }
    k.root.userData.faceRoad = true;
    return finish(k);
  });

  /** Rounded red boulders half in the turquoise river, ~6 m (origin: water surface). */
  prop('river_rocks', (r) => {
    const k = new Kit(r), n = r.int(3, 5), spots = [];
    for (let i = 0; i < n; i++) {
      let x = 0, z = 0, rad = 1, tries = 0;
      do {
        const a = r.range(0, TAU), d = Math.sqrt(r.next()) * 2.1;
        x = Math.cos(a) * d; z = Math.sin(a) * d * 0.7; rad = i ? r.range(0.7, 1.2) : 1.45; tries++;
      } while (tries < 14 && spots.some((p) => Math.hypot(p[0] - x, p[1] - z) < (p[2] + rad) * 0.8));
      spots.push([x, z, rad]);
      const col = r.pick([0xb0623e, 0xc77d4f, 0x9c5a3c, 0xd08a5a]);
      const geo = lump(new THREE.IcosahedronGeometry(rad, 1), 0.1, i * 3.3);
      k.add(geo, (cx, cy) => (cy < 0.22 ? mix(col, 0x3a2a2a, 0.35) : cy > rad * 0.55 ? mix(col, 0xffe0c0, 0.18) : col),
        { s: [1.2, 0.8, 1], r: [0, r.range(0, TAU), 0], p: [x, r.range(-0.15, 0.1), z] });
      ripple(k, rad * 1.25, x, z, 0xffffff, { s: [1.1, 1, 0.35], ts: 16 });
    }
    for (let i = 0; i < 4; i++) ball(k, r.range(0.2, 0.35), r.pick([0xb0623e, 0xc77d4f]), [r.range(-2.5, 2.5), 0, r.range(-1.6, 1.6)], { s: [1.2, 0.6, 1], det: 0 });
    return wet(k);
  });

  /* ════════════════════════════════════════════════════════════════════════
   * FROST — "Glacier Crevasse": ~78 m wide, frozen-blue water ~22 m below
   * ════════════════════════════════════════════════════════════════════════ */
  const ICE = [0xe6f7ff, 0xc4ecff, 0xa9e0fa, 0x8fd3f5];

  /** A downward icicle (apex at y = -len) as a fresh geometry hanging from y = 0. */
  const icicle = (rad, len, n) => new THREE.ConeGeometry(rad, len, n || 6, 1).rotateX(Math.PI).translate(0, -len / 2, 0);

  /** A ~12 m row of icicles hanging DOWN from a snowy strip (origin: the attachment line, centre). */
  prop('icicle_row', (r) => {
    const k = new Kit(r), W = r.range(11.5, 12.5);
    const strip = jiggle(new THREE.BoxGeometry(W + 0.4, 0.34, 0.9, 12, 1, 2), 0.07, 3, Infinity);
    k.add(strip, (cx, cy) => (cy > 0.12 ? 0xffffff : 0xe2f3ff), { p: [0, 0.03, 0] });
    for (let i = 0; i < 6; i++) ball(k, r.range(0.35, 0.55), 0xffffff, [(i / 5 - 0.5) * W * 0.9 + r.range(-0.4, 0.4), 0.2, r.range(-0.15, 0.15)], { s: [1.5, 0.45, 1], det: 0 });
    let x = -W / 2 + 0.25;
    while (x < W / 2 - 0.15) {
      const big = r.chance(0.3), len = big ? r.range(2.6, 4) : r.range(0.9, 2.2), rad = big ? r.range(0.26, 0.36) : r.range(0.13, 0.24);
      const col = r.pick(ICE), z = r.range(-0.22, 0.22);
      k.add(icicle(rad, len), (cx, cy) => (cy > -len * 0.28 ? mix(col, 0xffffff, 0.35) : col), { p: [x, -0.1, z], r: [r.range(-0.04, 0.04), r.range(0, 1), r.range(-0.04, 0.04)] });
      if (r.chance(0.45)) k.add(icicle(rad * 0.5, len * r.range(0.3, 0.5), 5), mix(col, 0xffffff, 0.2), { p: [x + rad + 0.06, -0.1, z + r.range(-0.1, 0.1)] });
      x += rad * 2 + r.range(0.06, 0.3);
    }
    return finish(k);
  });

  /** A frozen waterfall: bulging ice drapes hanging from a snowy lip, ~10 × 20 m (origin: base centre; viewer at -Z). */
  prop('frozen_falls', (r) => {
    const k = new Kit(r), W = r.range(9.5, 10.5), H = r.range(19, 21);
    const SHADES = [0xe8f8ff, 0xc8ecfc, 0xa6dcf5, 0x84c8ee, 0xd8f3ff];
    cliffBack(k, r, { x0: -W / 2 - 0.8, x1: W / 2 + 0.8, z0: 0.3, z1: 2.8, y0: -0.4, y1: H,
      layer: () => [r.range(1.6, 2.6), r.pick([0x9cc9e6, 0xb2d6ee, 0x8dbfe0])], capCol: 0xffffff, jig: 0.2, wob: 0.4 });
    const n = r.int(8, 10), seed = r.range(0, 50);
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n, x = (u - 0.5) * W * 0.92 + r.range(-0.25, 0.25), z = -r.range(0.2, 1.1);
      const reach = i % 3 === 1 ? r.range(0.45, 0.75) : 1, h = (H - 0.1) * reach, rt = r.range(0.9, 1.3), rb = reach < 1 ? rt * 0.55 : rt * 1.25;
      const g = new THREE.CylinderGeometry(rt, rb, h, 7, 6);
      const P = g.attributes.position, ph = r.range(0, TAU);
      for (let v = 0; v < P.count; v++) {
        const yn = (P.getY(v) + h / 2) / h;
        let s = 1 + 0.16 * Math.sin(yn * Math.PI * 3 + ph);
        if (reach === 1 && yn < 0.12) s *= 1 + (0.12 - yn) * 4;
        P.setX(v, P.getX(v) * s); P.setZ(v, P.getZ(v) * s * 0.8);
      }
      lump(g, 0.03, seed + i);
      const base = SHADES[(i + r.int(0, 1)) % 5];
      k.add(g, (cx, cy) => mix(base, 0x6fbde6, (1 - cy / H) * 0.35), { p: [x, H - h / 2, z], jit: 0.07 });
      if (reach < 1) k.add(icicle(rb, r.range(1.2, 2.2), 7), mix(SHADES[1], 0x84c8ee, 0.3), { p: [x, H - h, z] });
    }
    // Snowy lip with an icicle fringe, and the frozen pool at the foot.
    k.add(jiggle(new THREE.BoxGeometry(W + 2, 1.1, 3.6, 6, 1, 2), 0.15, 9, Infinity), (cx, cy) => (cy > H + 0.4 ? 0xffffff : 0xd6eefb), { p: [0, H + 0.35, 1.2] });
    for (let i = 0; i < 12; i++) {
      const len = r.range(0.7, 2.2), rad = r.range(0.14, 0.3), col = r.pick(ICE);
      k.add(icicle(rad, len), (cx, cy) => (cy > H - len * 0.3 ? mix(col, 0xffffff, 0.3) : col), { p: [(i / 11 - 0.5) * (W + 1.4) + r.range(-0.2, 0.2), H - 0.15, -0.55 + r.range(-0.1, 0.1)] });
    }
    k.add(new THREE.CylinderGeometry(1, 1.08, 0.7, 14, 1), (cx, cy) => (cy > 0.2 ? 0xe6f7ff : 0xa9e0fa), { s: [W / 2 + 1.2, 1, 2.6], p: [0, 0.05, -1.2] });
    for (let i = 0; i < 5; i++) {
      k.add(lump(new THREE.IcosahedronGeometry(r.range(0.5, 0.9), 0), 0.15, i), r.pick(ICE), { p: [r.range(-W / 2, W / 2), 0.45, -r.range(2.2, 3.4)], r: [r.range(0, 1), r.range(0, 3), 0] });
    }
    k.root.userData.faceRoad = true;
    return finish(k);
  });

  function penguin(k, sc, px, pz, ry, parent, scarf) {
    const g = new THREE.Group(), x = { parent: g }, NAVY = 0x283553, WHITE = 0xffffff, ORANGE = 0xff9a2a;
    ball(k, 1, (cx, cy, cz) => (cz < -0.12 * sc && cy < 0.78 * sc ? WHITE : NAVY), [0, 0.47 * sc, 0], Object.assign({ s: [0.34 * sc, 0.46 * sc, 0.31 * sc] }, x));
    ball(k, 0.25 * sc, (cx, cy, cz) => (cz < -0.12 * sc && cy < 1.02 * sc ? WHITE : NAVY), [0, 0.98 * sc, -0.02 * sc], x);
    [-1, 1].forEach((sd) => {
      ball(k, 0.045 * sc, INK, [sd * 0.09 * sc, 1.03 * sc, -0.22 * sc], Object.assign({ det: 0 }, x));
      ball(k, 0.05 * sc, 0xffa6c0, [sd * 0.15 * sc, 0.93 * sc, -0.19 * sc], Object.assign({ det: 0, s: [1, 0.6, 0.5] }, x));
      ball(k, 1, NAVY, [sd * 0.33 * sc, 0.52 * sc, 0], Object.assign({ s: [0.06 * sc, 0.26 * sc, 0.14 * sc], r: [0, 0, sd * 0.35], det: 0 }, x));
      ball(k, 1, ORANGE, [sd * 0.12 * sc, 0.03 * sc, -0.12 * sc], Object.assign({ s: [0.12 * sc, 0.045 * sc, 0.17 * sc], det: 0 }, x));
    });
    cone(k, 0.065 * sc, 0.2 * sc, ORANGE, [0, 0.95 * sc, -0.3 * sc], Object.assign({ r: [-HALF, 0, 0], n: 5 }, x));
    if (scarf) {
      torus(k, 0.22 * sc, 0.06 * sc, 0xe0393e, [0, 0.8 * sc, -0.01 * sc], Object.assign({ r: [HALF, 0, 0], ts: 10, rs: 3 }, x));
      box(k, 0.1 * sc, 0.28 * sc, 0.05 * sc, 0xe0393e, [0.12 * sc, 0.66 * sc, -0.22 * sc], Object.assign({ r: [0.2, 0, 0.25] }, x));
    }
    g.position.set(px, 0, pz);
    g.rotation.y = ry;
    parent.add(g);
  }

  /** A floating ice slab with one or two penguins, ~5 m, bobbing (origin: water surface). */
  prop('ice_floe', (r) => {
    const k = new Kit(r);
    const node = new THREE.Group(), x = { parent: node };
    const slab = new THREE.CylinderGeometry(2.4, 2.2, 0.6, 11, 1);
    const P = slab.attributes.position, p1 = r.range(0, TAU), p2 = r.range(0, TAU);
    for (let i = 0; i < P.count; i++) {
      const a = Math.atan2(P.getZ(i), P.getX(i)), s = 1 + 0.13 * Math.sin(3 * a + p1) + 0.07 * Math.sin(5 * a + p2);
      P.setX(i, P.getX(i) * s); P.setZ(i, P.getZ(i) * s);
    }
    k.add(slab, (cx, cy) => (cy > 0.2 ? 0xf6fcff : cy > -0.05 ? 0xcdebfa : 0x9dd5f0), { p: [0, -0.05, 0] }, node);
    ball(k, 0.7, 0xffffff, [r.range(0.6, 1.2), 0.3, r.range(0.4, 1.0)], Object.assign({ s: [1.4, 0.45, 1] }, x));
    const two = r.chance(0.65);
    const yFeet = 0.25;
    const pg = new THREE.Group(); pg.position.y = yFeet; node.add(pg);
    penguin(k, r.range(0.95, 1.1), two ? -0.55 : 0, -0.2, r.range(-0.4, 0.2), pg, false);
    if (two) penguin(k, r.range(0.7, 0.8), 0.45, -0.45, r.range(-0.3, 0.5), pg, true);
    // A little fish for supper.
    ball(k, 1, 0xff8a3a, [-0.2, yFeet + 0.06, -1.1], Object.assign({ s: [0.22, 0.08, 0.1], det: 0 }, x));
    cone(k, 0.08, 0.14, 0xff8a3a, [0.06, yFeet + 0.06, -1.1], Object.assign({ r: [0, 0, -HALF], n: 4, s: [1, 1, 0.4] }, x));
    const floe = keep(node);
    k.root.add(floe);
    ripple(k, 2.7, 0, 0, null, { ts: 20 });
    const ph = r.range(0, TAU);
    bob(k, floe, 'y', 1.1, 0.07, ph);
    sway(k, floe, 'x', 0.8, 0.03, ph + 1);
    sway(k, floe, 'z', 0.95, 0.035, ph + 2);
    sway(k, floe, 'y', 0.12, 0.25, ph);
    return wet(k);
  });

  /** A tall faceted ice spire with smaller crystals round its foot, ~10 m (origin: ground). */
  prop('ice_spire', (r) => {
    const k = new Kit(r);
    const BLUE = [0x7fd3f7, 0x5fb8ea, 0xa8e4fb, 0x6cc6f2];
    crystal(k, r.range(9.6, 10.4), 1.3, r.pick(BLUE), 0xe0f7ff, [0, -0.2, 0], [r.range(-0.06, 0.06), r.range(0, 1), r.range(-0.06, 0.06)]);
    const n = r.int(6, 8);
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU + r.range(-0.2, 0.2), d = r.range(1.2, 1.9);
      crystal(k, r.range(1.6, 4.2), r.range(0.35, 0.6), r.pick(BLUE), 0xd6f3ff, [Math.cos(a) * d, -0.2, Math.sin(a) * d], [r.range(0.3, 0.65), -a + HALF, 0]);
    }
    ball(k, 1, 0xffffff, [0, 0.1, 0], { s: [2.7, 0.55, 2.5], jit: 0.08 });
    for (let i = 0; i < 4; i++) {
      const a = r.range(0, TAU);
      ball(k, r.range(0.4, 0.7), 0xf2faff, [Math.cos(a) * 2.6, 0.12, Math.sin(a) * 2.4], { s: [1.4, 0.5, 1], det: 0 });
    }
    return finish(k);
  });

  /* ════════════════════════════════════════════════════════════════════════
   * SPOOKY — "Misty Bog Ravine": ~26 m wide, glowing green bog ~8 m below
   * Cute-spooky: crooked, purple-grey, glowing — never scary.
   * ════════════════════════════════════════════════════════════════════════ */
  const OLDWOOD = [0x7d6a5a, 0x8a735e, 0x6e5c4e, 0x7a6470];

  /** A little hanging lantern: dark frame, glowing core (GLOW), tiny roof. */
  function lantern(k, x, y, z, glowCol, parent) {
    const o = { parent }, FR = 0x3a2a4a;
    box(k, 0.34, 0.07, 0.34, FR, [x, y + 0.2, z], o);
    box(k, 0.38, 0.07, 0.38, FR, [x, y - 0.2, z], o);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(k, 0.05, 0.4, 0.05, FR, [x + sx * 0.15, y, z + sz * 0.15], o);
    box(k, 0.24, 0.32, 0.24, glowCol, [x, y, z], Object.assign({ mat: GLOW(), jit: 0 }, o));
    cone(k, 0.28, 0.2, FR, [x, y + 0.33, z], Object.assign({ n: 4, r: [0, Math.PI / 4, 0] }, o));
    torus(k, 0.06, 0.02, FR, [x, y + 0.48, z], Object.assign({ ts: 6, rs: 3 }, o));
  }

  /** The stub of a broken plank bridge jutting ~6 m over the ravine, a few planks dangling (origin: rim edge at ground level). */
  prop('broken_bridge_wood', (r) => {
    const k = new Kit(r);
    const POST = 0x6d5a6e, ROPE = 0xc9b48a, END = -r.range(5.6, 6.3), SAG = 0.75;
    const deckY = (z) => (z > 0 ? 0.08 : 0.08 - SAG * Math.pow(-z / -END, 1.6));
    [-1, 1].forEach((sd) => {
      cyl(k, 0.17, 0.21, 1.9, POST, [sd * 1.2, 0.95, 0.9], { n: 7 });
      ball(k, 0.2, POST, [sd * 1.2, 1.93, 0.9], { det: 0, s: [1, 0.6, 1] });
      torus(k, 0.21, 0.05, ROPE, [sd * 1.2, 1.5, 0.9], { r: [HALF, 0, 0], ts: 9, rs: 3 });
      const tip = END + (sd > 0 ? 0.7 : 0.15);
      bar(k, [sd * 0.95, -0.05, 1.4], [sd * 0.95, deckY(tip) - 0.14, tip], 0.18, 0.2, 0x5e4c46);
      const rail = [[sd * 1.2, 1.55, 0.9], [sd * 1.13, 1.0, -1.8], [sd * 1.07, 0.66, -4.0], [sd * 1.02, deckY(END) + 0.5, END + 0.5]];
      for (let i = 0; i + 1 < rail.length; i++) rod(k, rail[i], rail[i + 1], 0.045, 0.045, ROPE, { n: 4 });
      const rz = -2.6, broken = sd < 0;
      rod(k, [sd * 1.08, deckY(rz), rz], [sd * (broken ? 1.25 : 1.1), deckY(rz) + (broken ? 0.55 : 0.95), rz - (broken ? 0.2 : 0)], 0.07, 0.06, POST, { n: 5 });
    });
    for (let z = 1.2; z > END + 0.3; z -= 0.48) {
      if (z < 0 && r.chance(0.12)) continue;
      const nearEnd = z < END + 1.6, slope = (deckY(z + 0.01) - deckY(z - 0.01)) / 0.02;
      const wd = nearEnd ? r.range(1.0, 1.7) : 2.3, off = nearEnd ? r.range(-0.45, 0.45) : r.range(-0.05, 0.05);
      box(k, wd, 0.1, 0.4, r.pick(OLDWOOD), [off, deckY(z) + 0.06, z], { r: [-Math.atan(slope), r.range(-0.05, 0.05), nearEnd ? r.range(-0.12, 0.12) : 0] });
    }
    // A lantern hung from the right-hand post.
    rod(k, [1.2, 1.85, 0.9], [1.62, 1.92, 0.9], 0.035, 0.035, 0x3a2a4a, { n: 4 });
    rod(k, [1.6, 1.92, 0.9], [1.6, 1.7, 0.9], 0.015, 0.015, 0x3a2a4a, { n: 3 });
    lantern(k, 1.6, 1.42, 0.9, 0xffc94a);
    // Planks dangling from the broken end on ropes, in two swaying bunches.
    const yEnd = deckY(END) - 0.08, nodes = [];
    [-1, 1].forEach((sd) => {
      const node = new THREE.Group();
      node.position.set(sd * 0.55, yEnd, END + 0.25);
      const x = { parent: node }, drop = sd < 0 ? r.range(2.2, 2.6) : r.range(1.5, 1.9);
      [-0.36, 0.36].forEach((ox, i) => rod(k, [ox, 0, 0], [ox + r.range(-0.05, 0.05), -drop + (sd > 0 && i ? 0.7 : 0), 0], 0.035, 0.035, ROPE, Object.assign({ n: 4 }, x)));
      if (sd < 0) {
        [-0.9, -1.75].forEach((y) => box(k, 0.95, 0.3, 0.07, r.pick(OLDWOOD), [0, y, 0], Object.assign({ r: [0, 0, r.range(-0.08, 0.08)] }, x)));
      } else {
        box(k, 0.95, 0.3, 0.07, r.pick(OLDWOOD), [0, -0.75, 0], x);
        box(k, 0.95, 0.3, 0.07, r.pick(OLDWOOD), [-0.12, -drop + 0.05, 0], Object.assign({ r: [0, 0, 0.75] }, x));
      }
      const kept = keep(node);
      k.root.add(kept);
      nodes.push(kept);
    });
    const ph = r.range(0, TAU);
    nodes.forEach((n, i) => { sway(k, n, 'x', 0.9 + i * 0.2, 0.09, ph + i * 1.7); sway(k, n, 'z', 0.7 + i * 0.15, 0.06, ph + i * 2.3); });
    return finish(k);
  });

  /** 5-7 friendly will-o'-wisps with little eyes, bobbing at 1-4 m over a ~6 m patch (origin: ground/water at the centre). */
  prop('wisp_lights', (r) => {
    const k = new Kit(r), n = r.int(5, 7), cores = [], halos = [], ph = [];
    const SOFT = [[0xb8ffd8, 0x2fcf8a], [0x9ff5f0, 0x23b8c0], [0xe2c0ff, 0x8a4ee0], [0xd8ff9a, 0x6fcf2a]];
    for (let i = 0; i < n; i++) {
      const a = i * 2.39996 + r.range(-0.3, 0.3), d = i ? r.range(1.3, 2.8) : 0.3;
      const p = [Math.cos(a) * d, r.range(1.3, 3.8), Math.sin(a) * d], rad = r.range(0.24, 0.36), c = SOFT[(i + r.int(0, 3)) % 4];
      const core = new THREE.Group(), halo = new THREE.Group();
      const kc = { rng: r, root: core, add: Kit.prototype.add }, kh = { rng: r, root: halo, add: Kit.prototype.add };
      ball(kc, rad, c[0], p, { s: [1, 1.12, 1], mat: GLOW(), jit: 0.03 });
      cone(kc, rad * 0.75, rad * 2.2, c[0], [p[0], p[1] - rad * 1.35, p[2] + rad * 0.75], { r: [Math.PI - 0.5, 0, 0.3], n: 6, mat: GLOW(), jit: 0.03 });
      [-1, 1].forEach((sd) => add(kc, new THREE.OctahedronGeometry(rad * 0.16, 0), 0x2a1840, [p[0] + sd * rad * 0.36, p[1] + rad * 0.15, p[2] - rad * 0.92], { s: [1, 1.5, 0.6], mat: GLOW(), jit: 0 }));
      ball(kh, rad * 1.9, c[1], p, { mat: HALO(), jit: 0 });
      core.userData.pivot = p; halo.userData.pivot = p;
      cores.push(core); halos.push(halo); ph.push(r.range(0, TAU));
    }
    const motion = (g, t) => ({
      y: 0.28 * Math.sin(1.2 * t + ph[g]), x: 0.18 * Math.sin(0.7 * t + ph[g] * 1.3), z: 0.18 * Math.cos(0.6 * t + ph[g]),
      ry: 0.35 * Math.sin(0.5 * t + ph[g]), s: 1 + 0.06 * Math.sin(2.1 * t + ph[g])
    });
    flock(k, cores, GLOW(), motion, 1);
    flock(k, halos, HALO(), motion, 1);
    return finish(k);
  });

  /** A little rowing boat with a glowing lantern on a crooked pole, ~4 m, bobbing (origin: water surface). */
  prop('lantern_boat', (r) => {
    const k = new Kit(r);
    const node = new THREE.Group(), boat = new THREE.Group();
    boat.rotation.y = HALF;          // built with the bow at +X; this turns it to face -Z
    node.add(boat);
    const x = { parent: boat };
    const L = 3.4, H = 0.75, B = 1.5, PLUM = r.pick([0x5a3d6e, 0x4f3a72, 0x63406a]);
    const hull = hullGeo(L, H, B, 6, 3, r, (cx, cy) => (cy > H / 2 - 0.01 ? 0x3a2a2a : Math.floor((cy + H / 2) / (H / 3)) >= 2 ? 0xd9a54a : PLUM));
    k.add(hull.geo, null, { p: [0, 0.12, 0] }, boat);
    [-0.55, 0.6].forEach((bx) => box(k, 0.36, 0.08, B * 0.78, 0x8a735e, [bx, hull.deck(bx) + 0.18, 0], x));
    [-1, 1].forEach((sd) => {
      rod(k, [0.1, 0.62, sd * 0.62], [-1.0, -0.02, sd * 1.55], 0.04, 0.04, 0x8a735e, Object.assign({ n: 4 }, x));
      box(k, 0.5, 0.04, 0.2, 0x8a735e, [-1.15, -0.05, sd * 1.62], Object.assign({ r: [0, sd * -0.6, 0] }, x));
    });
    rod(k, [1.25, 0.4, 0], [1.45, 2.05, 0], 0.06, 0.05, 0x3a2a4a, Object.assign({ n: 5 }, x));
    rod(k, [1.45, 2.03, 0], [1.95, 2.15, 0], 0.045, 0.04, 0x3a2a4a, Object.assign({ n: 4 }, x));
    rod(k, [1.95, 2.15, 0], [1.95, 1.95, 0], 0.015, 0.015, 0x3a2a4a, Object.assign({ n: 3 }, x));
    lantern(k, 1.95, 1.68, 0, 0xffb84a, boat);
    ball(k, 0.22, 0xff8a1a, [-0.55, hull.deck(-0.55) + 0.38, 0.2], Object.assign({ s: [1.1, 0.8, 1.1] }, x));
    rod(k, [-0.55, hull.deck(-0.55) + 0.52, 0.2], [-0.52, hull.deck(-0.55) + 0.66, 0.2], 0.035, 0.03, 0x4a7a2a, Object.assign({ n: 4 }, x));
    const kept = keep(node);
    k.root.add(kept);
    ripple(k, 1.9, 0, 0, 0xa8f0c0, { s: [0.75, 1.15, 0.35], ts: 18 });
    const ph = r.range(0, TAU);
    bob(k, kept, 'y', 1.2, 0.06, ph);
    sway(k, kept, 'x', 0.9, 0.04, ph + 1);
    sway(k, kept, 'z', 0.75, 0.05, ph + 2);
    return wet(k);
  });

  /** Big gnarled roots bursting out of an earthy rim and drooping into the ravine, with glowing mushrooms (origin: rim edge; roots reach -Z). */
  prop('twisted_roots', (r) => {
    const k = new Kit(r);
    const BARK = [0x6b5466, 0x7a6070, 0x5e4a5e, 0x735a68], SOIL = [0x4a3c40, 0x54444a, 0x3e3236];
    // The crumbly rim the roots burst out of.
    for (let i = 0; i < 6; i++) {
      const x = (i / 5 - 0.5) * 6.4 + r.range(-0.3, 0.3);
      k.add(lump(new THREE.IcosahedronGeometry(1, 0), 0.2, i * 2.7), r.pick(SOIL), { s: [r.range(1.2, 1.6), r.range(0.55, 0.8), r.range(1.3, 1.8)], p: [x, r.range(-0.35, -0.1), r.range(1.0, 1.6)] });
    }
    for (let i = 0; i < 4; i++) ball(k, r.range(0.4, 0.7), 0x5f8a4a, [r.range(-3, 3), 0.3, r.range(1.2, 2.2)], { s: [1.5, 0.35, 1.2], det: 0 });
    const n = r.int(4, 5), knots = [], SEG = 8;
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1) - 0.5, x0 = u * 4 + r.range(-0.3, 0.3), spread = r.range(-2.2, 2.2);
      const main = i % 2 === 0, droop = main ? r.range(4, 5.5) : r.range(2.2, 3.6), len = main ? r.range(9, 10.4) : r.range(5.5, 7.5);
      const wig = r.range(0.35, 0.7), ph = r.range(0, TAU), peak = main ? r.range(1.1, 1.6) : r.range(0.5, 0.9), start = r.range(1.6, 2.3);
      const rad = main ? r.range(0.6, 0.8) : r.range(0.35, 0.5), col = r.pick(BARK);
      const pts = [];
      for (let j = 0; j <= SEG; j++) {
        const s = j / SEG;
        const y = s < 0.3 ? -0.45 + (peak + 0.45) * Math.sin(s / 0.3 * HALF) : peak - (peak + droop) * Math.pow((s - 0.3) / 0.7, 1.6);
        pts.push([x0 + spread * s * s + wig * Math.sin(s * TAU * 1.2 + ph) * s, y + (j && j < SEG ? r.range(-0.12, 0.12) : 0), start - len * s]);
      }
      for (let j = 0; j < SEG; j++) {
        const r0 = rad * (1 - 0.88 * j / SEG) + 0.05, r1 = rad * (1 - 0.88 * (j + 1) / SEG) + 0.05;
        rod(k, pts[j], pts[j + 1], r0 * 1.04, r1, col, { n: 5, open: j < SEG - 1 });
        knots.push([pts[j], r0, j]);
      }
      // A gnarl on the crown of the arch, and rootlets hanging off the drooping part.
      ball(k, rad * 1.25, mix(col, 0x2a2030, 0.12), pts[2], { det: 0, s: [1, 0.85, 1.3] });
      for (let j = 4; j < 7; j += 2) {
        const p = pts[j];
        rod(k, p, [p[0] + r.range(-0.7, 0.7), p[1] - r.range(0.8, 1.6), p[2] + r.range(-0.5, 0.5)], 0.08, 0.02, col, { n: 4 });
      }
      ball(k, 0.45 * rad / 0.7, 0x5f8a4a, [pts[2][0], pts[2][1] + rad * 0.9, pts[2][2]], { s: [1.5, 0.4, 1.3], det: 0 });
    }
    const MUSH = [0x5ff0d0, 0xc08aff, 0x9aff6a, 0x6fd8ff];
    const spots = knots.filter((kn) => kn[2] >= 1 && kn[2] <= 5);
    for (let i = 0; i < 7; i++) {
      const kn = spots[(i * 5 + 2) % spots.length], p = kn[0], s = r.range(0.75, 1.25);
      const top = [p[0] + r.range(-0.12, 0.12), p[1] + kn[1] * 0.8, p[2] + r.range(-0.15, 0.15)];
      cyl(k, 0.06 * s, 0.08 * s, 0.3 * s, 0xe8e0d0, [top[0], top[1] + 0.15 * s, top[2]], { n: 4 });
      k.add(new THREE.SphereGeometry(0.24 * s, 7, 2, 0, TAU, 0, HALF), r.pick(MUSH), { p: [top[0], top[1] + 0.28 * s, top[2]], s: [1, 0.75, 1], mat: GLOW() });
    }
    return finish(k);
  });

  /* ════════════════════════════════════════════════════════════════════════
   * LAVA — "Lava Moat": ~78 m wide, lava ~19 m below, beside the castle
   * Lava parts are unlit (GLOW / the lava flow texture) so they light
   * themselves; their colours stay deep orange, never near-white.
   * ════════════════════════════════════════════════════════════════════════ */
  const STONE = [0x4a3a44, 0x5a4652, 0x3e3038, 0x54404c];
  const CRUST = [0x2e2430, 0x3a2c38, 0x4a3a44];

  /** A lava cascade pouring off a stone wall lip, ~8 × 20 m (origin: base centre at lava level; viewer at -Z). */
  prop('lava_falls', (r) => {
    const k = new Kit(r);
    const W = r.range(7.5, 8.5), H = r.range(19, 21), LIP = 2.2;
    const f = fallsSheet(k, { kind: 'lava', w: W, h: H, pool: 0.3, lip: LIP, drift: 1.2, bulge: 0.5, flare: 0.12, repU: 1.5, texLen: 6, speed: 0.25 });
    cliffBack(k, r, { x0: -W / 2 - 0.6, x1: W / 2 + 0.6, z0: 0.05, z1: LIP + 1.4, y0: -0.6, y1: H + 0.15,
      layer: (j) => [r.range(1.0, 1.6), STONE[j % 4]], capCol: 0x2e2430, jig: 0.12, wob: 0.3 });
    // Stone cheeks either side of the lip, capped like battlements.
    [-1, 1].forEach((sd) => {
      box(k, 0.7, 1.6, LIP + 1.8, 0x5a4652, [sd * (W / 2 + 0.35), H + 0.65, (LIP + 1.8) / 2 - 0.4], { jit: 0.1 });
      box(k, 0.9, 0.35, 0.9, 0x2e2430, [sd * (W / 2 + 0.35), H + 1.6, -0.1]);
      box(k, 0.9, 0.35, 0.9, 0x2e2430, [sd * (W / 2 + 0.35), H + 1.6, LIP + 0.6]);
    });
    k.add(new THREE.CylinderGeometry(1, 1, 0.1, 16), (cx, cy, cz) => (Math.abs(cx) < W * 0.3 ? 0xe0601a : 0xc94410), { s: [W / 2 + 0.4, 1, 2.2], p: [0, 0.05, f.baseZ], mat: GLOW() });
    splash(k, r, { n: 12, rx: W / 2 - 0.6, rz: 1.4, z: f.baseZ, y: 0.15, r: [0.45, 0.9], flat: 0.6, cols: [0xf08a1c, 0xf5a52a, 0xe0601a], mat: GLOW() });
    splash(k, r, { n: 10, rx: W / 2 + 0.3, rz: 2.4, z: f.baseZ, y: 0.05, r: [0.5, 0.9], flat: 0.5, cols: CRUST, det: 0 });
    k.root.userData.faceRoad = true;
    return finish(k);
  });

  /** An erupting lava fountain: glowing blobs rise and fall round a pulsing column (origin: lava surface). */
  prop('lava_plume', (r) => {
    const k = new Kit(r), nodes = [], mot = [];
    for (let i = 0; i < 14; i++) {
      const a = i / 14 * TAU + r.range(-0.15, 0.15), d = r.range(1.8, 2.5);
      k.add(lump(new THREE.IcosahedronGeometry(r.range(0.45, 0.8), 0), 0.2, i), r.pick(CRUST), { p: [Math.cos(a) * d, r.range(-0.05, 0.12), Math.sin(a) * d], s: [1.3, 0.55, 1.1], r: [0, r.range(0, 3), 0] });
    }
    const group = (pivot, build, motion) => {
      const n = new THREE.Group();
      n.userData.pivot = pivot;
      build({ rng: r, root: n, add: Kit.prototype.add });
      nodes.push(n); mot.push(motion);
    };
    const G = { mat: GLOW(), jit: 0.06 };
    group([0, 0, 0], (kk) => kk.add(new THREE.CylinderGeometry(1.9, 1.9, 0.1, 16), (cx, cy, cz) => (Math.hypot(cx, cz) < 0.9 ? 0xf5a52a : 0xe0601a), Object.assign({ p: [0, 0.03, 0] }, G)), () => ({}));
    const cph = r.range(0, TAU);
    group([0, 0, 0], (kk) => {
      kk.add(new THREE.CylinderGeometry(0.3, 0.95, 3.4, 9, 2), (cx, cy) => (cy > 2.3 ? 0xf5b52e : cy > 1 ? 0xf08a1c : 0xe0601a), Object.assign({ p: [0, 1.7, 0] }, G));
      ball(kk, 0.6, 0xf5b52e, [0, 3.45, 0], Object.assign({ s: [1, 0.8, 1] }, G));
      ball(kk, 1.15, 0xf08a1c, [0, 0.12, 0], Object.assign({ s: [1, 0.4, 1] }, G));
    }, (t) => ({ s: 1 + 0.12 * Math.sin(3.1 * t + cph), ry: t * 0.6 }));
    const nb = r.int(6, 8);
    for (let i = 0; i < nb; i++) {
      const rad = r.range(0.32, 0.7), a = r.range(0, TAU), reach = r.range(0.8, 2.6), top = r.range(5.2, 8) - rad, sp = r.range(0.28, 0.4), p0 = i / nb + r.range(-0.04, 0.04);
      group([0, 0, 0], (kk) => {
        ball(kk, rad, r.pick([0xf5a52a, 0xf08a1c, 0xf5b52e]), [0, 0, 0], Object.assign({ s: [1, 1.15, 1] }, G));
        cone(kk, rad * 0.72, rad * 1.25, 0xf08a1c, [0, -rad * 0.95, 0], Object.assign({ r: [Math.PI, 0, 0], n: 6 }, G));
      }, (t) => {
        const u = ((t * sp + p0) % 1 + 1) % 1;
        const flip = U.clamp((u - 0.38) / 0.24, 0, 1);
        return { x: Math.cos(a) * reach * u, z: Math.sin(a) * reach * u, y: 4 * top * u * (1 - u), rx: Math.PI * flip * flip * (3 - 2 * flip), s: Math.max(0.001, Math.min(1, Math.sin(Math.PI * u) * 2.5)) };
      });
    }
    for (let i = 0; i < 4; i++) {
      const a = r.range(0, TAU), d = r.range(0.9, 1.5), sp = r.range(0.4, 0.7), p0 = r.range(0, 1), p = [Math.cos(a) * d, 0.05, Math.sin(a) * d];
      group(p, (kk) => kk.add(new THREE.SphereGeometry(0.32, 6, 2, 0, TAU, 0, HALF), 0xf5a52a, Object.assign({ p }, G)),
        (t) => ({ s: Math.max(0.001, (((t * sp + p0) % 1) + 1) % 1 * 1.4) }));
    }
    flock(k, nodes, GLOW(), (g, t) => mot[g](t), 4);
    return wet(k);
  });

  function stonePost(k, x, z) {
    box(k, 0.62, 1.9, 0.62, 0x4a3a44, [x, 0.95, z], { jit: 0.1 });
    box(k, 0.8, 0.22, 0.8, 0x3a3f4e, [x, 1.95, z]);
    cone(k, 0.4, 0.45, 0x3a3f4e, [x, 2.28, z], { n: 4, r: [0, Math.PI / 4, 0] });
    torus(k, 0.2, 0.06, 0x6a7080, [x, 1.3, z - 0.34], { ts: 8, rs: 3 });
  }
  /** A broken iron chain bridge hanging ~12 m down the moat wall (origin: rim edge at ground level). */
  prop('chain_bridge_broken', (r) => {
    const k = new Kit(r);
    danglingBridge(k, r, { drop: r.range(11.3, 12.5), chain: true, planks: [0x3e2d2a, 0x4a3530, 0x352624, 0x46302c], rope: 0x6a7080, post: stonePost });
    return finish(k);
  });

  /** A black glassy spire with glowing orange cracks, ~14 m (origin: ground / lava surface). */
  prop('obsidian_spire', (r) => {
    const k = new Kit(r);
    const H = r.range(13.4, 14.6), R0 = r.range(1.6, 2.0), N = 7, TW = r.range(0.04, 0.07) * r.sign(), BASE = -0.3;
    const OBS = [0x1b1424, 0x2a2033, 0x3a2c4a, 0x241a30];
    const spire = new THREE.Group();
    spire.rotation.set(r.range(-0.04, 0.04), r.range(0, TAU), r.range(-0.04, 0.04));
    k.root.add(spire);
    const x = { parent: spire };
    const g = new THREE.CylinderGeometry(0.06, R0, H, N, 6).translate(0, H / 2 + BASE, 0);
    const twist = (px, py, pz) => { const a = (py - BASE) * TW; return [px * Math.cos(a) - pz * Math.sin(a), py, px * Math.sin(a) + pz * Math.cos(a)]; };
    const P = g.attributes.position;
    for (let i = 0; i < P.count; i++) { const v = twist(P.getX(i), P.getY(i), P.getZ(i)); P.setXYZ(i, v[0], v[1], v[2]); }
    k.add(g, (cx, cy, cz, i) => (i % 5 === 2 ? 0x5a4a78 : OBS[i % 4]), { jit: 0.1 }, spire);
    // Cracks: zig-zags of glowing rods laid on the facet planes.
    const Rat = (y) => R0 + (0.06 - R0) * ((y - BASE) / H);
    const onFacet = (f, y, t) => {
      const th = (f + 0.5) / N * TAU, R = Rat(y), d = R * Math.cos(Math.PI / N) + 0.05, hw = R * Math.sin(Math.PI / N);
      return twist(Math.sin(th) * d + Math.cos(th) * t * hw, y, Math.cos(th) * d - Math.sin(th) * t * hw);
    };
    const cracks = r.int(3, 4);
    for (let c = 0; c < cracks; c++) {
      const f = (c * 2 + r.int(0, 1)) % N, y0 = r.range(0.3, 1.5), y1 = H * r.range(0.45, 0.7), steps = r.int(5, 7);
      let prev = onFacet(f, y0, r.range(-0.3, 0.3));
      for (let s = 1; s <= steps; s++) {
        const y = y0 + (y1 - y0) * s / steps, next = onFacet(f, y, (s % 2 ? 0.45 : -0.45) + r.range(-0.15, 0.15));
        const w = 0.11 * (1 - s / (steps + 2));
        rod(k, prev, next, w + 0.02, w, s % 3 ? 0xf08a1c : 0xe0601a, Object.assign({ n: 4, mat: GLOW() }, x));
        if (s === 3) rod(k, next, onFacet(f, y + 0.9, -0.8), w, 0.03, 0xe0601a, Object.assign({ n: 4, mat: GLOW() }, x));
        prev = next;
      }
    }
    // Shards and a glowing seam round the foot.
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * TAU + r.range(-0.3, 0.3), d = R0 + r.range(0.4, 1.2);
      cone(k, r.range(0.35, 0.6), r.range(1.2, 3.2), r.pick(OBS), [Math.cos(a) * d, 0.4, Math.sin(a) * d], { r: [r.range(-0.4, 0.4), 0, r.range(-0.4, 0.4)], n: 5, jit: 0.12 });
    }
    torus(k, R0 + 0.35, 0.22, 0xe0601a, [0, 0.02, 0], { r: [HALF, 0, 0], s: [1, 1, 0.5], ts: 16, rs: 3, mat: GLOW() });
    return finish(k);
  });

  /* ════════════════════════════════════════════════════════════════════════
   * STARLIGHT — "Void Leap": the rainbow road breaks for ~78 m over space
   * ════════════════════════════════════════════════════════════════════════ */

  /** A giant glowing ring the karts fly through, inner radius 14 m, in the XY plane (origin: the ring's CENTRE). */
  prop('ring_gate_big', (r) => {
    const k = new Kit(r), TUBE = 1.2, R = 14 + TUBE, SEGS = 12;
    const C1 = 0x1fc8e8, C2 = 0xd23cf0;
    k.add(new THREE.TorusGeometry(R, TUBE, 8, 72), (cx, cy) => {
      const a = (Math.atan2(cy, cx) + TAU) % TAU;
      return Math.floor(a / TAU * SEGS) % 2 ? C1 : C2;
    }, { mat: GLOW(), jit: 0.06 });
    k.add(new THREE.TorusGeometry(R - TUBE * 0.92, 0.2, 4, 72), 0x9ff0ff, { mat: GLOW(), jit: 0 });
    for (let i = 0; i < SEGS; i++) {
      const a = i / SEGS * TAU;
      box(k, TUBE * 2.9, 0.8, TUBE * 2.9, 0x2a2f6a, [Math.cos(a) * R, Math.sin(a) * R, 0], { r: [0, 0, a] });
      [-1, 1].forEach((sd) => ball(k, 0.28, 0xffc94a, [Math.cos(a) * (R + TUBE * 0.9), Math.sin(a) * (R + TUBE * 0.9), sd * TUBE * 1.47], { det: 0 }));
    }
    const node = new THREE.Group();
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * TAU + r.range(-0.2, 0.2), rr = R + r.range(2.4, 3.4);
      k.add(starGeo(r.range(0.8, 1.25), 0.3), r.pick([0xffe066, 0xfff0a0, 0xff9ad5, 0x9af5ff]),
        { p: [Math.cos(a) * rr, Math.sin(a) * rr, r.range(-1.6, 1.6)], r: [0, 0, r.range(0, TAU)], mat: GLOW(), jit: 0 }, node);
    }
    const sparkles = keep(node);
    k.root.add(sparkles);
    spin(k, sparkles, 'z', 0.25 * r.sign());
    return finish(k);
  });

  /** A friendly swirling galaxy vortex ~80 m across, lying in the XZ plane, slowly turning (origin: disc centre). */
  prop('black_hole', (r) => {
    const k = new Kit(r), RAD = 40, SEG = 64;
    const radii = [0, 0.8, 1.8, 3, 4.6, 6.6, 9, 12, 15.5, 19.5, 24, 29, 34.5, 40];
    const depth = r.range(9, 12), arms = r.int(2, 3), twist = r.range(2.2, 2.8), ph = r.range(0, TAU);
    const yAt = (rr) => -depth * (Math.exp(-rr / 7) - Math.exp(-RAD / 7));
    const pos = [], idx = [];
    radii.forEach((rr, j) => {
      if (j === 0) { pos.push(0, yAt(0), 0); return; }
      for (let i = 0; i < SEG; i++) { const a = i / SEG * TAU; pos.push(Math.cos(a) * rr, yAt(rr), Math.sin(a) * rr); }
    });
    for (let i = 0; i < SEG; i++) idx.push(0, 1 + (i + 1) % SEG, 1 + i);
    for (let j = 1; j + 1 < radii.length; j++) {
      const a0 = 1 + (j - 1) * SEG, b0 = 1 + j * SEG;
      for (let i = 0; i < SEG; i++) { const i1 = (i + 1) % SEG; idx.push(a0 + i, a0 + i1, b0 + i, a0 + i1, b0 + i1, b0 + i); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    const STOPS = [[0, 0x0b0f3a], [0.15, 0x16206a], [0.35, 0x3a2a9a], [0.55, 0x7a35c8], [0.75, 0xd94fb0], [0.9, 0xff7f7a], [1.0, 0xffa04a]];
    const grad = (t) => {
      for (let i = 0; i + 1 < STOPS.length; i++) if (t <= STOPS[i + 1][0]) return mix(STOPS[i][1], STOPS[i + 1][1], (t - STOPS[i][0]) / (STOPS[i + 1][0] - STOPS[i][0]));
      return STOPS[STOPS.length - 1][1];
    };
    const node = new THREE.Group();
    k.add(geo, (cx, cy, cz) => {
      const rr = Math.hypot(cx, cz), th = Math.atan2(cz, cx), base = grad(rr / RAD);
      const arm = Math.cos(arms * th - twist * Math.log(1 + rr) + ph);
      return arm > 0.3 ? mix(base, 0xffd6f4, (arm - 0.3) * 0.5 * Math.min(1, rr / 8)) : arm < -0.5 ? mix(base, 0x0b0f3a, 0.25) : base;
    }, { mat: A.mat.basic(0xffffff, { vertexColors: true, side: 'double' }), jit: 0.04 }, node);
    torus(k, RAD, 0.7, 0xffb060, [0, 0.05, 0], { r: [HALF, 0, 0], ts: 64, rs: 3, mat: GLOW(), parent: node, jit: 0.05 });
    for (let i = 0; i < 24; i++) {
      const a = r.range(0, TAU), rr = r.range(6, 37);
      ball(k, r.range(0.25, 0.55), r.pick([0xfff3c0, 0xc8e8ff, 0xffd6f4]), [Math.cos(a) * rr, yAt(rr) + 0.4, Math.sin(a) * rr], { det: 0, mat: GLOW(), parent: node, jit: 0 });
    }
    const disc = keep(node);
    k.root.add(disc);
    spin(k, disc, 'y', 0.06 * r.sign());
    return finish(k);
  });

  /** 5-8 lumpy purple-grey asteroids spread ~20 m round the origin, slowly tumbling (origin: cluster centre). */
  prop('asteroid_cluster', (r) => {
    const k = new Kit(r), n = r.int(5, 8), nodes = [], tumble = [];
    const ROCK = [0x8e7fb0, 0x7a6d99, 0xa699c4, 0x6f6390];
    for (let i = 0; i < n; i++) {
      const a = i * 2.39996 + r.range(-0.3, 0.3), d = i ? r.range(5.5, 10) : r.range(0, 1.5);
      const p = [Math.cos(a) * d, i ? r.range(-5, 5) : 0, Math.sin(a) * d], rad = i ? r.range(1, 2.3) : r.range(2.6, 3.1), col = r.pick(ROCK);
      const node = new THREE.Group(), kk = { rng: r, root: node, add: Kit.prototype.add };
      kk.add(lump(new THREE.IcosahedronGeometry(rad, 1), 0.18, i * 5.1), col, { p, s: [1.15, 0.9, 1], jit: 0.09 });
      for (let c = 0; c < 3; c++) {
        const u = r.range(-1, 1), th = r.range(0, TAU), q = Math.sqrt(1 - u * u);
        const dir = [q * Math.cos(th), u, q * Math.sin(th)];
        ball(kk, rad * r.range(0.22, 0.32), mix(col, 0x3a3050, 0.35), [p[0] + dir[0] * rad * 0.95, p[1] + dir[1] * rad * 0.8, p[2] + dir[2] * rad * 0.9], { det: 0 });
      }
      node.userData.pivot = p;
      nodes.push(node);
      tumble.push([r.range(-0.25, 0.25), r.range(-0.25, 0.25), r.range(-0.2, 0.2), r.range(0, TAU)]);
    }
    flock(k, nodes, LIT(), (g, t) => {
      const s = tumble[g];
      return { rx: s[0] * t + s[3], ry: s[1] * t, rz: s[2] * t + s[3] * 0.5, y: 0.35 * Math.sin(0.4 * t + s[3]) };
    }, 2);
    return finish(k);
  });

  return { NAMES };
})();
