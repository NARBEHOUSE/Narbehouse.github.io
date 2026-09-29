/**
 * NARBE Racer — Sunshine Cup props: meadow, shores, candy and dunes.
 *
 * Every scenery prop and hazard the four Sunshine themes list in DESIGN §9.4,
 * registered as NK.art.props[name](rng) and NK.art.hazard[name](rng). Hazards
 * are also registered as NK.art.hazard['kind:theme'] (e.g. 'block:meadow'),
 * the other spelling DESIGN §10.1 uses, so either lookup works.
 *
 * How the props are built, and why:
 *   - Scenery is painted with vertex colours and drawn with the ONE shared,
 *     flat-shaded Lambert material (NK.art.mat.lambertV), so every prop welds
 *     to a single draw call here, and a whole chunk of them welds again in
 *     world.js.
 *   - Each face gets a small lightness jitter and a darker base (a cheap
 *     ambient-occlusion read that sits props on the ground), and every builder
 *     draws its size, colour and shape from the rng it is given, so a field of
 *     the same prop never looks stamped out.
 *   - Hazards are gameplay-critical: cel-shaded (toonV) with a dark ink hull,
 *     in the strongest colours their theme allows, and sized to the lanes —
 *     a block fills one lane, a roller is about 2 m across, a puddle is a flat
 *     lane-wide patch 6 m long lying at y = 0.02.
 *   - Moving parts are pre-welded child nodes marked userData.keep and listed
 *     in root.userData.anim, so world.js can drive them knowing nothing about
 *     the prop (see "Animation contract" below).
 *
 * Conventions: origin on the ground (lowest point at y = 0), front facing -Z,
 * metres (a kart is 2.8 m long).
 */
NK.propsSunshine = (function () {
  'use strict';

  const A = NK.art;
  const U = NK.util;
  const TAU = Math.PI * 2;
  const HALF_PI = Math.PI / 2;

  /* ── Catalogue ───────────────────────────────────────────────────────────
   * The names are the contract with themes.js and world.js (DESIGN §9.4).
   * Kept here as data so the gallery and the tests walk exactly this list.
   */
  const THEMES = {
    meadow: {
      near: ['tree_round', 'tree_pine', 'bush', 'flower_patch', 'fence_wood', 'hay_bale', 'rock_small', 'toadstool'],
      far: ['windmill', 'barn', 'silo', 'hill_round', 'tree_cluster'],
      landmarks: ['hot_air_balloon', 'water_tower'],
      hazards: { block: 'hay_stack', roller: 'hay_roll', geyser: null, puddle: 'mud_puddle' }
    },
    shores: {
      near: ['palm_tree', 'beach_umbrella', 'sand_castle', 'beach_ball', 'rock_sand', 'seashell', 'surf_stand', 'beach_grass'],
      far: ['lighthouse', 'beach_hut', 'sailboat', 'sea_rock', 'pier'],
      landmarks: ['lighthouse', 'pier'],
      hazards: { block: 'castle_big', roller: 'crab', geyser: null, puddle: 'tide_pool' }
    },
    candy: {
      near: ['lollipop_tree', 'candy_cane', 'gumdrop', 'cupcake', 'donut', 'ice_cream', 'wafer_fence'],
      far: ['cake_mountain', 'cookie_house', 'choco_fountain', 'candy_hill'],
      landmarks: ['giant_cake'],
      hazards: { block: 'cupcake_big', roller: 'gumball', geyser: null, puddle: 'choco_puddle' }
    },
    dunes: {
      near: ['cactus', 'cactus_barrel', 'rock_desert', 'dry_shrub', 'desert_sign', 'bones'],
      far: ['mesa', 'pyramid', 'oasis_palm', 'dune_hill'],
      landmarks: ['pyramid', 'cat_statue'],
      hazards: { block: 'boulder_desert', roller: 'tumbleweed', geyser: null, puddle: 'quicksand' }
    }
  };

  /* ── Colour ──────────────────────────────────────────────────────────────
   * Tones are chosen in sRGB HSL (how the eye judges "a bit lighter"), then
   * handed to THREE.Color, which converts to the linear working space the
   * vertex colours live in.
   */
  const _col = new THREE.Color();
  const _hsl = { h: 0, s: 0, l: 0 };

  /** A sibling of `hex`: lightness nudged by up to ±dl, hue by a hair. */
  function tone(hex, rng, dl) {
    _col.setHex(hex);
    _col.getHSL(_hsl, THREE.SRGBColorSpace);
    const h = _hsl.h + rng.range(-0.012, 0.012);
    _col.setHSL(h - Math.floor(h), _hsl.s, U.clamp(_hsl.l + rng.range(-dl, dl), 0, 1), THREE.SRGBColorSpace);
    return _col.getHex();
  }

  /** One colour from a family, nudged, so repeated props never match exactly. */
  function pick(list, rng, dl) { return tone(rng.pick(list), rng, dl === undefined ? 0.04 : dl); }

  /** `hex` made lighter (dl > 0) or darker (dl < 0) by a fixed amount. */
  function shade(hex, dl) {
    _col.setHex(hex);
    _col.getHSL(_hsl, THREE.SRGBColorSpace);
    _col.setHSL(_hsl.h, _hsl.s, U.clamp(_hsl.l + dl, 0, 1), THREE.SRGBColorSpace);
    return _col.getHex();
  }

  const _col2 = new THREE.Color();
  /** Blend two colours: t = 0 gives a, 1 gives b. */
  function mixHex(a, b, t) {
    return _col.setHex(a).lerp(_col2.setHex(b), U.clamp(t, 0, 1)).getHex();
  }

  /* ── Painting ────────────────────────────────────────────────────────────
   * Colour is baked per TRIANGLE (not per vertex), which is what gives the
   * crisp low-poly facet look. `col` is a hex, or a function of the face
   * centroid (cx, cy, cz, faceIndex) → hex, which is how stripes, swirls and
   * strata are painted without a single texture. o.jit jiggles each face's
   * lightness; o.grad lightens toward the top of [o.y0, o.y1] (default: the
   * part's own height) — dark feet, sunny tops.
   */
  function paintFaces(geo, col, rng, o) {
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
    const span = grad ? ((y1 - y0) || 1) : 1;
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
      if (grad) d += grad * (U.clamp((cy - y0) / span, 0, 1) - 0.5);
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

  /**
   * Bake scale (o.s) → rotation (o.r, Euler, order o.order or 'XYZ') →
   * position (o.p) into a geometry. With 'YXZ' a part tilts before it yaws.
   */
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
  /** Turn a geometry built along +Y to point along direction d, then move it to p. */
  function orient(geo, d, p) {
    _dir.set(d[0], d[1], d[2]).normalize();
    _q.setFromUnitVectors(_up, _dir);
    _p.set(p[0], p[1], p[2]);
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

  /**
   * Push vertices in or out from the geometry's centre by up to ±amt (a
   * fraction of their distance) — the difference between a CAD sphere and a
   * shrub. Vertices at or below `keepBelow` stay put (a hill keeps its rim on
   * the ground).
   */
  function lump(geo, amt, seed, keepBelow) {
    const P = geo.attributes.position;
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
      if (keepBelow !== undefined && y <= keepBelow) continue;
      const k = 1 + amt * hash3(x, y, z, seed);
      P.setXYZ(i, x * k, y * k, z * k);
    }
    P.needsUpdate = true;
    geo.computeVertexNormals();
    return geo;
  }

  /**
   * Round a segmented box's faces outward like a stuffed cushion (hay bales,
   * sponge tiers): face centres bulge by `amt` metres, edge midpoints by
   * about half that, corners tuck in. Needs at least 2 segments per axis.
   */
  function pillow(geo, amt) {
    geo.computeBoundingBox();
    const b = geo.boundingBox, P = geo.attributes.position;
    const hx = (b.max.x - b.min.x) / 2, hy = (b.max.y - b.min.y) / 2, hz = (b.max.z - b.min.z) / 2;
    const W = [-0.35, 0.45, 1];
    for (let i = 0; i < P.count; i++) {
      let x = P.getX(i), y = P.getY(i), z = P.getZ(i);
      const zx = Math.abs(x) < hx * 0.02, zy = Math.abs(y) < hy * 0.02, zz = Math.abs(z) < hz * 0.02;
      const w = W[zx + zy + zz] * amt;
      if (!zx) x += Math.sign(x) * w;
      if (!zy) y += Math.sign(y) * w;
      if (!zz) z += Math.sign(z) * w;
      P.setXYZ(i, x, y, z);
    }
    P.needsUpdate = true;
    geo.computeVertexNormals();
    return geo;
  }

  /**
   * A flat disc in the XZ plane facing +Y, built from rings of quads so it can
   * be painted by radius and angle (puddles, lollipops, bale ends, ponds).
   * `radii` are ascending ring radii; shape(angle) scales the outline.
   */
  function disc(radii, segs, shape) {
    const pos = [0, 0, 0];
    for (let j = 0; j < radii.length; j++) {
      for (let i = 0; i < segs; i++) {
        const a = (i / segs) * TAU;
        const r = radii[j] * (shape ? shape(a) : 1);
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

  /** A wobbly closed outline for disc(): puddles and ponds never look stamped. */
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

  /** A double-sided copy of a sheet: sails, fronds, leaves, flags. */
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

  /* ── Kit: one prop under construction ────────────────────────────────────
   * add() bakes a part's transform into its geometry, paints it and hangs it
   * on the root (or on a moving node). Transforms are baked rather than left
   * on meshes so ink outlines are sized in real metres and the weld is a copy.
   */
  function Kit(rng, toon) {
    this.rng = rng;
    this.mat = toon ? A.mat.toonV() : A.mat.lambertV();
    this.root = new THREE.Group();
  }

  /**
   * @param geo     a fresh geometry (consumed)
   * @param col     hex, face-colour function, or null when already painted
   * @param o       { s, r, p, jit, grad, y0, y1, noInk, ground }
   * @param parent  a moving node to hang the part on (default: the root)
   */
  Kit.prototype.add = function (geo, col, o, parent) {
    o = o || {};
    place(geo, o);
    if (o.ground) {
      // Sit this part on y = 0 by itself (rock piles: every stone touches down).
      geo.computeBoundingBox();
      geo.translate(0, -geo.boundingBox.min.y, 0);
    }
    const g = col === null ? geo : paintFaces(geo, col, this.rng, o);
    if (g.attributes.uv) g.deleteAttribute('uv');
    const m = new THREE.Mesh(g, this.mat);
    if (o.noInk) m.userData.noOutline = true;
    (parent || this.root).add(m);
    return m;
  };

  /** Weld a moving part to one mesh per material and flag it to survive later welds. */
  function keep(node) {
    const out = A.mergeByMaterial(node);
    out.userData.keep = true;
    return out;
  }

  /**
   * Ink shell from a simple closed hull that is never drawn itself. Busy parts
   * (twigs, spirals, open drums) get one clean silhouette line instead of a
   * scribble of shells round every piece.
   */
  function inkHull(geo, parent, thickness) {
    const tmp = new THREE.Mesh(geo, A.mat.lambertV());
    const shell = A.outline(tmp, thickness);
    tmp.remove(shell);
    geo.dispose();
    parent.add(shell);
    return shell;
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

  /**
   * Sit the prop on its ground line and weld it. Lumps and random tilts make
   * the exact lowest point unpredictable, so it is measured, not assumed.
   * `ground` is 0 for everything except puddles (0.02) and the few props
   * whose origin is a waterline instead (see userData.waterline).
   */
  function finish(kit, ground) {
    const b = bounds(kit.root);
    const dy = (ground || 0) - b.min.y;
    if (Math.abs(dy) > 1e-5) kit.root.children.forEach((c) => { c.position.y += dy; });
    return A.mergeByMaterial(kit.root);
  }

  /* ── Animation contract ──────────────────────────────────────────────────
   * root.userData.anim = [{ node, type, axis, speed, amp, phase }]
   *   spin : node.rotation[axis] += speed * dt                    (rad/s)
   *   sway : node.rotation[axis] = rest + amp * sin(speed*t + phase)
   *   bob  : node.position[axis] = rest + amp * sin(speed*t + phase)
   * `rest` is the node's value the first time it is driven. Each node is a
   * welded child flagged userData.keep; to freeze a far-away copy instead,
   * clear the keep flags before welding its chunk.
   * The array also carries a (non-enumerable) update(t, dt) that drives every
   * entry exactly as above, for callers that would rather not interpret it.
   */
  function driveAnim(t, dt) {
    for (let i = 0; i < this.length; i++) {
      const a = this[i], n = a.node;
      if (a.type === 'spin') { n.rotation[a.axis] += a.speed * dt; continue; }
      const obj = a.type === 'bob' ? n.position : n.rotation;
      if (a.rest === undefined) a.rest = obj[a.axis];
      obj[a.axis] = a.rest + a.amp * Math.sin(a.speed * t + a.phase);
    }
  }

  function anim(kit, node, type, axis, speed, amp, phase) {
    const ud = kit.root.userData;
    if (!ud.anim) {
      ud.anim = [];
      Object.defineProperty(ud.anim, 'update', { value: driveAnim });
    }
    ud.anim.push({ node, type, axis, speed, amp: amp || 0, phase: phase || 0 });
  }

  /**
   * A soft contact shadow under a hazard. Flagged keep so any later weld
   * leaves it alone: it must stay a separate transparent mesh with its own
   * render order, and it must never be welded into a rolling part.
   */
  function shadow(root, w, d) {
    const s = A.blobShadow(1);
    s.scale.set(w, d, 1);          // the plane lies flat, so its local y is world z
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
   * Hazards also carry userData.kind, and userData.idle(t, dt) whenever they
   * move on their own (it drives their anim entries). Rollers that roll carry
   * rollRadius and rollNode: the child to spin about its local Z as the
   * hazard slides along its local X (rotation.z = -x / rollRadius). They are
   * built with their bounds centred on that axis and with no ground shadow,
   * so spinning the whole hazard about its bounding-box centre works too.
   * Never spin about the root's origin: it is on the ground, so the ball
   * would swing through the road.
   * Characters (the crab) look toward +Z, at the karts coming up behind them,
   * because world.js lines hazards up with the road (local -Z points the way
   * the karts race); everything else looks the same from either end.
   */
  function hazard(name, kind, themeId, build) {
    const fn = function (rng) {
      const obj = build(rng || U.rng(U.hash(name)));
      obj.name = name;
      obj.userData.kind = kind;
      const an = obj.userData.anim;
      if (an && !obj.userData.idle) obj.userData.idle = (t, dt) => an.update(t, dt || 0);
      return obj;
    };
    A.hazard[name] = fn;
    A.hazard[kind + ':' + themeId] = fn;
  }

  /* ════════════════════════════════════════════════════════════════════════
   * MEADOW — lush greens, wildflowers, a red barn, white fences, golden hay
   * ════════════════════════════════════════════════════════════════════════ */

  const LEAF = [0x58b83a, 0x4ba634, 0x69c444, 0x3f9838, 0x7ccf4d];
  const PINE = [0x2f8a4e, 0x2a7c46, 0x3a9656, 0x24703f];
  const BARK = [0x8a5a3b, 0x7b4e33, 0x96633f];
  const HAY = [0xf2c14e, 0xeab442, 0xf6cd61];
  const STONE = [0x9ba2ac, 0x8d949e, 0xa9afb7];
  const PETALS = [0xff4f8b, 0xffd23f, 0xfaf7ef, 0xa66cff, 0xff8a3d, 0x4fb3ff, 0xff5a5a];
  const WHITE = 0xf6f3ea;
  const BARN_RED = [0xd23a2e, 0xc7342a, 0xdc4634];
  const TWINE = 0xb3261e;

  /**
   * Round-canopy tree: a leaning trunk under a cloud of lumpy leaf balls,
   * sometimes with fruit or blossom. `lite` swaps the balls for dodecahedra
   * (a third of the triangles) for trees that are only ever seen far off.
   */
  function roundTree(k, x, y, z, sc, lite) {
    const r = k.rng;
    const th = r.range(2.2, 3.1) * sc;
    const lean = r.range(-0.08, 0.08);
    const tr = r.range(0.3, 0.4) * sc;
    k.add(new THREE.CylinderGeometry(tr * 0.7, tr, th + 0.8 * sc, 6), pick(BARK, r),
      { r: [0, 0, lean], p: [x, y + (th + 0.8 * sc) / 2, z], jit: 0.05, grad: 0.3 });
    const R = r.range(2.0, 2.6) * sc;
    // The trunk leans about its middle, so follow its axis up to the canopy centre.
    const cx = x - Math.sin(lean) * (th + R * 0.75 - (th + 0.8 * sc) / 2), cy = y + th + R * 0.75;
    const leaf = pick(LEAF, r, 0.05);
    const paint = { jit: 0.07, grad: 0.45, y0: y + th - R * 0.2, y1: cy + R * 1.5 };
    const ball = (rad) => lite ? lump(new THREE.DodecahedronGeometry(rad, 0), 0.08, r.next() * 99)
                               : lump(new THREE.IcosahedronGeometry(rad, 1), 0.09, r.next() * 99);
    k.add(ball(R), leaf, Object.assign({ p: [cx, cy, z] }, paint));
    const n = lite ? 2 : r.int(3, 4);
    const a0 = r.range(0, TAU);
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * TAU + r.range(-0.4, 0.4);
      const d = R * r.range(0.6, 0.78), rad = R * r.range(0.55, 0.7);
      k.add(ball(rad), leaf, Object.assign({ p: [cx + Math.cos(a) * d, cy + r.range(-0.3, 0.2) * R, z + Math.sin(a) * d] }, paint));
    }
    if (!lite) k.add(ball(R * 0.62), leaf, Object.assign({ p: [cx + r.range(-0.3, 0.3) * R, cy + R * 0.72, z + r.range(-0.3, 0.3) * R] }, paint));
    if (!lite && r.chance(0.35)) {
      const fruit = r.pick([0xe23b3b, 0xff9f1c, 0xff8fc8, 0xfdf8f0]);
      const count = r.int(5, 8);
      for (let i = 0; i < count; i++) {
        const a = r.range(0, TAU), up = r.range(-0.15, 0.75), h = Math.sqrt(1 - up * up);
        k.add(new THREE.IcosahedronGeometry(0.2 * sc, 0), tone(fruit, r, 0.04),
          { p: [cx + Math.cos(a) * h * R * 1.02, cy + up * R, z + Math.sin(a) * h * R * 1.02] });
      }
    }
  }

  /**
   * Stacked-cone pine. Every tier's skirt is pulled into drooping points like
   * a paper cut-out, and alternate tiers are a shade apart, so the silhouette
   * reads as layered boughs rather than one smooth cone.
   */
  function pineTree(k, x, y, z, sc) {
    const r = k.rng;
    const th = r.range(1.2, 1.6) * sc;
    const tiers = r.int(4, 6);
    const hs = [];
    let top = y + th;
    for (let i = 0; i < tiers; i++) {
      hs.push(r.range(2.1, 2.6) * sc * (1 - i * 0.06));
      top += i < tiers - 1 ? hs[i] * 0.48 : hs[i];
    }
    k.add(new THREE.CylinderGeometry(0.2 * sc, 0.34 * sc, th + 1.2, 6), pick(BARK, r),
      { p: [x, y + (th + 1.2) / 2, z], jit: 0.05, grad: 0.3 });
    const col = pick(PINE, r, 0.04), alt = shade(col, 0.045);
    let yy = y + th, R = r.range(2.1, 2.5) * sc;
    for (let i = 0; i < tiers; i++) {
      const h = hs[i];
      const g = new THREE.ConeGeometry(R, h, 8, 1);
      const P = g.attributes.position;
      for (let v = 0; v < P.count; v++) {
        const px = P.getX(v), pz = P.getZ(v);
        if (P.getY(v) > -h / 2 + 1e-3 || Math.hypot(px, pz) < 1e-3) continue;
        const even = Math.round(Math.atan2(px, pz) / (TAU / 8)) % 2 === 0;
        const f = even ? 1.18 : 0.84;
        P.setXYZ(v, px * f, even ? -h / 2 - h * 0.2 : -h / 2 + h * 0.04, pz * f);
      }
      k.add(g, i & 1 ? alt : col, { r: [0, r.range(0, TAU), 0], p: [x, yy + h / 2, z], jit: 0.06, grad: 0.5, y0: y + th - 0.4, y1: top });
      yy += h * 0.48;
      R *= 0.8;
    }
  }

  /** A shrub of lumpy leaf balls, sometimes dotted with berries or flowers. */
  function bushParts(k, x, z, sc) {
    const r = k.rng;
    const col = pick(LEAF, r, 0.06);
    const R = r.range(0.75, 1.1) * sc;
    const paint = { jit: 0.07, grad: 0.4, y0: 0, y1: R * 1.9 };
    k.add(lump(new THREE.IcosahedronGeometry(R, 1), 0.1, r.next() * 99), col, Object.assign({ s: [1, 0.85, 1], p: [x, R * 0.82, z] }, paint));
    const n = r.int(2, 4);
    for (let i = 0; i < n; i++) {
      const a = r.range(0, TAU), rad = R * r.range(0.5, 0.72), d = R * r.range(0.6, 0.9);
      k.add(lump(new THREE.DodecahedronGeometry(rad, 0), 0.1, r.next() * 99), col,
        Object.assign({ p: [x + Math.cos(a) * d, rad * 0.8, z + Math.sin(a) * d] }, paint));
    }
    if (r.chance(0.4)) {
      const dot = r.pick([0xe0303a, 0x4d5bd8, 0xfdf8f0, 0xff7cc0]);
      const count = r.int(5, 8);
      for (let i = 0; i < count; i++) {
        const a = r.range(0, TAU), up = r.range(0.1, 0.8), h = Math.sqrt(1 - up * up);
        k.add(new THREE.OctahedronGeometry(0.11 * sc, 0), dot,
          { p: [x + Math.cos(a) * h * R, R * 0.82 + up * R * 0.85, z + Math.sin(a) * h * R] });
      }
    }
  }

  /** A round bale lying on its side, with the rolled spiral painted on its ends. */
  function roundBale(k, x, z, rad, len, yaw) {
    const r = k.rng;
    const col = pick(HAY, r, 0.03), dark = tone(0xc4912c, r, 0.03);
    k.add(lump(new THREE.CylinderGeometry(rad, rad, len, 14, 1, true), 0.035, r.next() * 99), col,
      { r: [0, yaw, HALF_PI], p: [x, rad, z], jit: 0.08 });
    const spiral = (cx, cy, cz) => ((Math.floor(Math.hypot(cx, cz) / rad * 3.2 + Math.atan2(cz, cx) / TAU) & 1) ? col : dark);
    for (let s = -1; s <= 1; s += 2) {
      const d = paintFaces(disc([0.25, 0.5, 0.75, 1].map((v) => v * rad), 14), spiral, r, { jit: 0.04 });
      place(d, { r: [0, 0, -s * HALF_PI], p: [s * len / 2, 0, 0] });
      k.add(d, null, { r: [0, yaw, 0], p: [x, rad, z] });
    }
  }

  prop('tree_round', (r) => {
    const k = new Kit(r);
    roundTree(k, 0, 0, 0, r.range(0.85, 1.2));
    return finish(k);
  });

  prop('tree_pine', (r) => {
    const k = new Kit(r);
    pineTree(k, 0, 0, 0, r.range(1.0, 1.3));
    return finish(k);
  });

  prop('bush', (r) => {
    const k = new Kit(r);
    bushParts(k, 0, 0, r.range(0.85, 1.25));
    return finish(k);
  });

  /**
   * Ground cover: grass tufts and a spray of wildflowers in one or two
   * colours — cartoon-sized heads so they still register as colour at speed.
   * A third of the patches grow a clump of tall lupin spikes instead.
   */
  prop('flower_patch', (r) => {
    const k = new Kit(r);
    const spread = r.range(1.3, 2.0);
    const grass = pick(LEAF, r, 0.05), stem = 0x3f9838;
    const tufts = r.int(3, 5);
    for (let t = 0; t < tufts; t++) {
      const a = r.range(0, TAU), d = Math.sqrt(r.next()) * spread;
      const tx = Math.cos(a) * d, tz = Math.sin(a) * d;
      const blades = r.int(3, 5);
      for (let b = 0; b < blades; b++) {
        const h = r.range(0.4, 0.75), ba = r.range(0, TAU);
        k.add(new THREE.ConeGeometry(0.09, h, 3, 1, true), grass,
          { r: [Math.sin(ba) * 0.35, ba, Math.cos(ba) * 0.35], p: [tx, h / 2, tz], jit: 0.08 });
      }
    }
    const main = r.pick(PETALS), second = r.chance(0.6) ? r.pick(PETALS) : 0xfaf7ef;
    if (r.chance(0.33)) {
      const spikes = r.int(3, 5);
      for (let i = 0; i < spikes; i++) {
        const a = r.range(0, TAU), d = Math.sqrt(r.next()) * spread * 0.6;
        const fx = Math.cos(a) * d, fz = Math.sin(a) * d, h = r.range(0.9, 1.4);
        const col = tone(i & 1 ? main : second, r, 0.05);
        k.add(new THREE.ConeGeometry(0.035, h * 0.5, 3, 1, true), stem, { p: [fx, h * 0.25, fz] });
        k.add(new THREE.ConeGeometry(0.16, h * 0.55, 6), col, { p: [fx, h * 0.72, fz], jit: 0.08, grad: 0.25 });
      }
    }
    // A low leafy mound or two gives the patch a body for the flowers to sit in.
    const mounds = r.int(1, 2);
    for (let i = 0; i < mounds; i++) {
      const rad = r.range(0.55, 0.8);
      k.add(lump(new THREE.DodecahedronGeometry(rad, 0), 0.12, r.next() * 99), shade(grass, -0.06),
        { s: [1.3, 0.45, 1.3], p: [r.range(-0.6, 0.6), 0, r.range(-0.6, 0.6)], jit: 0.07, ground: true });
    }
    const n = r.int(10, 15);
    for (let i = 0; i < n; i++) {
      const a = r.range(0, TAU), d = Math.sqrt(r.next()) * spread;
      const fx = Math.cos(a) * d, fz = Math.sin(a) * d, h = r.range(0.5, 1.0);
      const col = tone(r.chance(0.65) ? main : second, r, 0.05);
      const tilt = [r.range(-0.3, 0.3), r.range(0, TAU), r.range(-0.3, 0.3)];
      k.add(new THREE.CylinderGeometry(0.028, 0.04, h, 3, 1, true), stem, { p: [fx, h / 2, fz] });
      if (r.chance(0.7)) {
        // Daisy: a star of petals facing up, with a domed centre.
        const hr = r.range(0.26, 0.36);
        k.add(starFlower(hr, 7), col, { r: tilt, p: [fx, h, fz] });
        k.add(new THREE.IcosahedronGeometry(hr * 0.34, 0), r.pick([0xffc21a, 0xff9f1c, 0x7a4a26]),
          { s: [1, 0.55, 1], r: tilt, p: [fx, h + 0.04, fz] });
      } else {
        // Tulip: a cup whose rim rises into three petal points.
        k.add(crown(new THREE.CylinderGeometry(0.17, 0.08, 0.3, 6, 1), 0.12), col, { r: [0, r.range(0, TAU), 0], p: [fx, h + 0.12, fz], jit: 0.05 });
      }
    }
    return finish(k);
  });

  /** A flat star of `n` petals (a daisy head), facing up, centred on the origin. */
  function starFlower(rad, n) {
    const g = new THREE.CircleGeometry(rad, n * 2);
    const P = g.attributes.position;
    for (let i = 1; i < P.count; i++) {
      const a = Math.atan2(P.getY(i), P.getX(i));
      const inner = Math.round(((a + TAU) % TAU) / (Math.PI / n)) & 1;
      const f = inner ? 0.45 : 1;
      P.setXYZ(i, P.getX(i) * f, P.getY(i) * f, inner ? 0 : -0.05 * rad);
    }
    g.rotateX(-HALF_PI);
    return twoSided(g);
  }

  /**
   * Raise every other rim vertex of a cylinder's top edge into points: tulip
   * petals, castle battlements. `n` is the cylinder's radial segment count.
   */
  function crown(geo, lift, n) {
    geo.computeBoundingBox();
    const top = geo.boundingBox.max.y, P = geo.attributes.position, seg = n || 6;
    for (let i = 0; i < P.count; i++) {
      if (P.getY(i) < top - 1e-4 || Math.hypot(P.getX(i), P.getZ(i)) < 1e-4) continue;
      const k = Math.round(((Math.atan2(P.getX(i), P.getZ(i)) + TAU) % TAU) / (TAU / seg));
      if (k & 1) P.setY(i, top + lift);
    }
    geo.computeVertexNormals();
    return geo;
  }

  /** A white fence section running along X (front rails on the -Z side). */
  prop('fence_wood', (r) => {
    const k = new Kit(r);
    const posts = r.int(4, 5), gap = r.range(1.8, 2.2);
    const L = (posts - 1) * gap;
    const col = tone(WHITE, r, 0.02);
    const paint = { grad: 0.18, y0: 0, y1: 1.45 };
    for (let i = 0; i < posts; i++) {
      const x = -L / 2 + i * gap, h = 1.3 + r.range(-0.05, 0.05);
      k.add(new THREE.BoxGeometry(0.2, h, 0.2), col, Object.assign({ p: [x, h / 2, 0] }, paint));
      k.add(new THREE.ConeGeometry(0.17, 0.2, 4), col, Object.assign({ r: [0, Math.PI / 4, 0], p: [x, h + 0.1, 0] }, paint));
    }
    if (r.chance(0.5)) {
      // Picket fence: two rails with pointed pickets in front of them.
      [0.32, 0.86].forEach((y) => k.add(new THREE.BoxGeometry(L + 0.2, 0.12, 0.07), col, Object.assign({ p: [0, y, -0.13] }, paint)));
      const sh = new THREE.Shape();
      sh.moveTo(-0.065, 0); sh.lineTo(0.065, 0); sh.lineTo(0.065, 0.96); sh.lineTo(0, 1.08); sh.lineTo(-0.065, 0.96); sh.closePath();
      const per = Math.floor(gap / 0.27);
      for (let i = 0; i < posts - 1; i++) {
        for (let j = 1; j < per; j++) {
          const x = -L / 2 + i * gap + (j / per) * gap;
          k.add(new THREE.ExtrudeGeometry(sh, { depth: 0.045, bevelEnabled: false }), col,
            Object.assign({ p: [x, 0.04, -0.215] }, paint));
        }
      }
    } else {
      // Ranch fence: three long rails.
      [0.35, 0.72, 1.08].forEach((y) => k.add(new THREE.BoxGeometry(L + 0.3, 0.14, 0.08), col, Object.assign({ p: [0, y, -0.14] }, paint)));
    }
    return finish(k);
  });

  /** One or two round bales, or a little stack of square ones. */
  prop('hay_bale', (r) => {
    const k = new Kit(r);
    const v = r.next();
    if (v < 0.5) {
      roundBale(k, 0, 0, r.range(0.75, 0.9), r.range(1.2, 1.5), r.range(0, TAU));
    } else if (v < 0.75) {
      const yaw = r.range(0, TAU);
      roundBale(k, -0.95, r.range(-0.3, 0.3), r.range(0.75, 0.85), 1.35, yaw);
      roundBale(k, 0.95, r.range(-0.3, 0.3), r.range(0.75, 0.85), 1.35, yaw + r.range(-0.3, 0.3));
    } else {
      const col = pick(HAY, r, 0.03), tw = tone(TWINE, r, 0.03);
      const bale = (x, y, z, yaw) => {
        k.add(pillow(new THREE.BoxGeometry(1.0, 0.62, 1.6, 2, 2, 2), 0.05), col, { r: [0, yaw, 0], p: [x, y, z], jit: 0.08 });
        for (let s = -1; s <= 1; s += 2) {
          k.add(new THREE.BoxGeometry(0.06, 0.7, 1.68), tw,
            { r: [0, yaw, 0], p: [x + Math.cos(yaw) * s * 0.25, y, z - Math.sin(yaw) * s * 0.25] });
        }
      };
      bale(-0.55, 0.31, 0, 0);
      bale(0.55, 0.31, 0, r.range(-0.08, 0.08));
      if (r.chance(0.7)) bale(r.range(-0.2, 0.2), 0.93, r.range(-0.1, 0.1), HALF_PI + r.range(-0.15, 0.15));
    }
    return finish(k);
  });

  /** A little pile of grey stones, some with a mossy cap. */
  prop('rock_small', (r) => {
    const k = new Kit(r);
    const n = r.int(1, 3);
    for (let i = 0; i < n; i++) {
      const rad = r.range(0.4, 0.85) * (i === 0 ? 1.2 : 0.8);
      const a = r.range(0, TAU), d = i === 0 ? 0 : r.range(0.7, 1.2);
      const col = pick(STONE, r, 0.05), sy = r.range(0.6, 0.85);
      const moss = r.chance(0.4) ? tone(0x6fae44, r, 0.04) : col;
      const top = rad * sy * 1.3;          // the part is painted after it is grounded
      k.add(lump(new THREE.DodecahedronGeometry(rad, 0), 0.18, r.next() * 99),
        (cx, cy) => (cy > top ? moss : col),
        { s: [1, sy, r.range(0.8, 1.15)], r: [0, r.range(0, TAU), 0], p: [Math.cos(a) * d, 0, Math.sin(a) * d], jit: 0.07, ground: true });
    }
    return finish(k);
  });

  /** A cluster of giant storybook toadstools. */
  prop('toadstool', (r) => {
    const k = new Kit(r);
    const capCol = r.chance(0.7) ? 0xe53935 : r.pick([0xf28c28, 0x9b59d0]);
    const n = r.int(1, 3);
    for (let i = 0; i < n; i++) {
      const s = i === 0 ? r.range(1.2, 1.7) : r.range(0.6, 1.0);
      const a = r.range(0, TAU), d = i === 0 ? 0 : r.range(0.9, 1.4);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      const h = r.range(0.75, 0.95) * s, R = r.range(0.55, 0.72) * s;
      k.add(new THREE.CylinderGeometry(0.16 * s, 0.24 * s, h, 8, 1, true), tone(0xf3ead3, r, 0.03), { p: [x, h / 2, z], grad: 0.25 });
      k.add(new THREE.CylinderGeometry(0.26 * s, 0.2 * s, 0.09 * s, 8, 1, true), 0xe9dcc0, { p: [x, h * 0.7, z] });
      const cap = tone(capCol, r, 0.04);
      k.add(new THREE.SphereGeometry(R, 10, 4, 0, TAU, 0, HALF_PI), cap, { s: [1, 0.62, 1], p: [x, h - 0.04 * s, z], jit: 0.04, grad: 0.2 });
      k.add(new THREE.CircleGeometry(R * 0.97, 10), 0xe6d3ad, { r: [HALF_PI, 0, 0], p: [x, h - 0.035 * s, z] });
      const spots = i === 0 ? r.int(6, 8) : r.int(3, 5);
      for (let j = 0; j < spots; j++) {
        const sa = (j / spots) * TAU + r.range(-0.3, 0.3), phi = j === 0 ? 0.1 : r.range(0.45, 1.1);
        k.add(new THREE.IcosahedronGeometry(r.range(0.13, 0.19) * s, 0), 0xfff8e7,
          { s: [1, 0.4, 1], p: [x + Math.sin(phi) * Math.cos(sa) * R, h - 0.04 * s + Math.cos(phi) * R * 0.62, z + Math.sin(phi) * Math.sin(sa) * R] });
      }
    }
    return finish(k);
  });

  /** A white Dutch windmill with a red cap; the sails turn (anim: spin z). */
  prop('windmill', (r) => {
    const k = new Kit(r);
    const BH = 2.3, H = r.range(9.4, 10.4), rb = 2.6, rt = 1.65;
    const body = tone(0xf1e6cf, r, 0.02), stone = pick(STONE, r, 0.03), wood = pick(BARK, r, 0.03);
    const cap = pick([0xc0392b, 0xd8452f, 0x2f6fae], r, 0.03);
    const oct = Math.cos(Math.PI / 8);     // apothem / radius of an octagon
    // Octagonal tower on a stone base, turned so a flat face (with the door) looks down -Z.
    k.add(new THREE.CylinderGeometry(rb + 0.15, rb + 0.3, BH, 8), stone, { r: [0, Math.PI / 8, 0], p: [0, BH / 2, 0], jit: 0.08, grad: 0.2 });
    k.add(new THREE.CylinderGeometry(rt, rb, H, 8, 3), body, { r: [0, Math.PI / 8, 0], p: [0, BH + H / 2, 0], grad: 0.2 });
    k.add(new THREE.CylinderGeometry(3.15, 3.15, 0.25, 8), wood, { r: [0, Math.PI / 8, 0], p: [0, BH + 2.2, 0] });
    const faceZ = (y) => -oct * U.lerp(rb, rt, (y - BH) / H);
    k.add(new THREE.BoxGeometry(1.25, 2.0, 0.3), 0x6b4a33, { p: [0, 1.0, -oct * (rb + 0.2) - 0.05] });
    [BH + 4.2, BH + 7.0].forEach((y) => k.add(new THREE.BoxGeometry(0.8, 1.0, 0.25), 0x3c4a63, { p: [0, y, faceZ(y) + 0.05] }));
    const top = BH + H;
    k.add(new THREE.ConeGeometry(2.15, 2.8, 8), cap, { r: [0, Math.PI / 8, 0], p: [0, top + 1.4, 0] });
    k.add(new THREE.IcosahedronGeometry(0.3, 0), 0xffd23f, { p: [0, top + 2.9, 0] });
    // Sails on a windshaft sticking out of the cap, far enough forward to
    // sweep in front of the balcony: four lattice arms with canvas panels.
    const hub = new THREE.Group();
    hub.position.set(0, top - 0.6, -3.45);
    const cloth = tone(0xfbf3e0, r, 0.02);
    k.add(new THREE.CylinderGeometry(0.42, 0.42, 1.9, 8), 0x4a3526, { r: [HALF_PI, 0, 0], p: [0, 0, 0.9] }, hub);
    const len = r.range(6.6, 7.4);
    for (let i = 0; i < 4; i++) {
      const rot = { r: [0, 0, i * HALF_PI] };
      k.add(place(new THREE.BoxGeometry(0.22, len, 0.16), { p: [0, len / 2, -0.1] }), wood, rot, hub);
      k.add(place(new THREE.BoxGeometry(1.35, len - 1.5, 0.07), { p: [0.8, 1.2 + (len - 1.5) / 2, -0.05] }), cloth, rot, hub);
      for (let j = 0; j < 4; j++) {
        k.add(place(new THREE.BoxGeometry(1.5, 0.1, 0.1), { p: [0.8, 1.3 + j * (len - 1.6) / 3, -0.12] }), wood, rot, hub);
      }
    }
    const sails = keep(hub);
    k.root.add(sails);
    anim(k, sails, 'spin', 'z', r.range(0.45, 0.8));
    return finish(k);
  });

  /**
   * Red gambrel barn: the end profile is one extruded shape (walls and gables
   * together), the roof is four slabs laid along that profile, and the white
   * trim and X-braced doors do the "barn!" read from a long way off.
   */
  prop('barn', (r) => {
    const k = new Kit(r);
    const W = r.range(8.2, 9.4), D = r.range(10.5, 12.5), Hw = r.range(4.6, 5.3);
    const kneeX = W * 0.34, R1 = W * 0.3, R2 = W * 0.5;
    const red = pick(BARN_RED, r, 0.03), trim = tone(WHITE, r, 0.02);
    const roof = r.pick([0x4a4e62, 0x6e2a24, 0x2f6a6e, 0x5b4636]);
    const sh = new THREE.Shape();
    sh.moveTo(-W / 2, 0); sh.lineTo(W / 2, 0); sh.lineTo(W / 2, Hw); sh.lineTo(kneeX, Hw + R1);
    sh.lineTo(0, Hw + R2); sh.lineTo(-kneeX, Hw + R1); sh.lineTo(-W / 2, Hw); sh.closePath();
    k.add(new THREE.ExtrudeGeometry(sh, { depth: D, bevelEnabled: false }), red, { p: [0, 0, -D / 2], grad: 0.2 });
    // Roof slabs along the profile (counter-clockwise, so the outward normal is (dy, -dx)).
    const prof = [[W / 2, Hw], [kneeX, Hw + R1], [0, Hw + R2], [-kneeX, Hw + R1], [-W / 2, Hw]];
    for (let i = 0; i < 4; i++) {
      const a = prof[i], b = prof[i + 1];
      const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
      const ux = dx / len, uy = dy / len, e0 = i === 0 ? 0.55 : 0.18, e1 = i === 3 ? 0.55 : 0.18;
      const mx = (a[0] - ux * e0 + b[0] + ux * e1) / 2 + uy * 0.16, my = (a[1] - uy * e0 + b[1] + uy * e1) / 2 - ux * 0.16;
      k.add(new THREE.BoxGeometry(len + e0 + e1, 0.32, D + 0.9), roof, { r: [0, 0, Math.atan2(dy, dx)], p: [mx, my, 0] });
    }
    const fz = -D / 2;
    // Big X-braced doors and the hayloft on the front gable.
    const dw = W * 0.38, dh = Hw * 0.74;
    k.add(new THREE.BoxGeometry(dw, dh, 0.14), shade(red, -0.1), { p: [0, dh / 2, fz - 0.07] });
    [[-dw / 2, dh / 2, 0.24, dh + 0.24], [dw / 2, dh / 2, 0.24, dh + 0.24], [0, dh, dw + 0.24, 0.24], [0, dh / 2, 0.16, dh]]
      .forEach(([x, y, w, h]) => k.add(new THREE.BoxGeometry(w, h, 0.2), trim, { p: [x, y, fz - 0.14] }));
    const diag = Math.atan2(dh, dw * 0.5);
    for (let s = -1; s <= 1; s += 2) {
      for (let t = -1; t <= 1; t += 2) {
        k.add(new THREE.BoxGeometry(Math.hypot(dw * 0.5, dh) * 0.92, 0.2, 0.2), trim,
          { r: [0, 0, s * t * diag], p: [s * dw / 4, dh / 2, fz - 0.16] });
      }
    }
    const ly = Hw + R1 * 0.35;
    k.add(new THREE.BoxGeometry(1.5, 1.3, 0.12), 0x3a2618, { p: [0, ly, fz - 0.05] });
    [[-0.8, ly, 0.2, 1.5], [0.8, ly, 0.2, 1.5], [0, ly + 0.72, 1.8, 0.2], [0, ly - 0.72, 1.8, 0.2]]
      .forEach(([x, y, w, h]) => k.add(new THREE.BoxGeometry(w, h, 0.18), trim, { p: [x, y, fz - 0.1] }));
    for (let i = 0; i < 3; i++) {
      k.add(new THREE.ConeGeometry(0.22, 0.7, 4), pick(HAY, r, 0.04),
        { r: [-HALF_PI + r.range(-0.3, 0.3), 0, r.range(-0.4, 0.4)], p: [-0.4 + i * 0.4, ly - 0.45, fz - 0.3] });
    }
    // White corner boards and side windows.
    for (let sx = -1; sx <= 1; sx += 2) {
      for (let sz = -1; sz <= 1; sz += 2) k.add(new THREE.BoxGeometry(0.28, Hw, 0.28), trim, { p: [sx * W / 2, Hw / 2, sz * D / 2] });
      for (let j = -1; j <= 1; j += 2) {
        k.add(new THREE.BoxGeometry(0.12, 1.2, 1.2), trim, { p: [sx * (W / 2 + 0.04), Hw * 0.58, j * D / 4] });
        k.add(new THREE.BoxGeometry(0.14, 0.8, 0.8), 0x3a2618, { p: [sx * (W / 2 + 0.06), Hw * 0.58, j * D / 4] });
      }
    }
    if (r.chance(0.7)) {
      const cy = Hw + R2 + 0.2;
      k.add(new THREE.BoxGeometry(1.3, 1.2, 1.3), trim, { p: [0, cy + 0.6, 0] });
      k.add(new THREE.BoxGeometry(1.34, 0.6, 0.8), 0x3a2618, { p: [0, cy + 0.65, 0] });
      k.add(new THREE.ConeGeometry(1.15, 0.9, 4), roof, { r: [0, Math.PI / 4, 0], p: [0, cy + 1.65, 0] });
      k.add(new THREE.CylinderGeometry(0.04, 0.04, 1.2, 4), 0x2b2b35, { p: [0, cy + 2.6, 0] });
      k.add(new THREE.BoxGeometry(0.9, 0.08, 0.08), 0x2b2b35, { p: [0, cy + 2.9, 0] });
      k.add(new THREE.ConeGeometry(0.14, 0.3, 3), 0x2b2b35, { r: [0, 0, -HALF_PI], p: [0.5, cy + 2.9, 0] });
    }
    return finish(k);
  });

  /** A grain silo: banded metal or red brick, with a dome and a ladder up the front. */
  prop('silo', (r) => {
    const k = new Kit(r);
    const R = r.range(1.8, 2.4), H = r.range(9, 13);
    const metal = r.chance(0.55);
    const base = metal ? pick([0xc8d1da, 0xb9c4cf], r, 0.02) : pick([0xb8483a, 0xa9412f], r, 0.03);
    const band = metal ? tone(0x9aa8b6, r, 0.02) : tone(WHITE, r, 0.02);
    const hs = metal ? 8 : 6;
    k.add(new THREE.CylinderGeometry(0.4, 0.4, 1, 4), 0xa9a39a, { s: [R * 2.7, 0.5, R * 2.7], p: [0, 0.25, 0], r: [0, Math.PI / 4, 0] });
    k.add(new THREE.CylinderGeometry(R, R, H, 12, hs, true), (cx, cy) => {
      if (metal) return (Math.floor(cy / (H / hs)) & 1) ? base : band;
      return cy > H - 0.5 ? band : base;
    }, { p: [0, 0.5 + H / 2, 0] });
    const dome = metal ? tone(0x8fa8bf, r, 0.03) : tone(WHITE, r, 0.02);
    if (r.chance(0.7)) k.add(new THREE.SphereGeometry(R * 1.03, 12, 4, 0, TAU, 0, HALF_PI), dome, { p: [0, 0.5 + H, 0] });
    else k.add(new THREE.ConeGeometry(R * 1.1, R * 1.1, 12), dome, { p: [0, 0.5 + H + R * 0.55, 0] });
    const lz = -R - 0.18, steel = 0x5a6270;
    for (let s = -1; s <= 1; s += 2) k.add(new THREE.BoxGeometry(0.08, H, 0.08), steel, { p: [s * 0.3, 0.5 + H / 2, lz] });
    for (let i = 1; i < 8; i++) k.add(new THREE.BoxGeometry(0.6, 0.06, 0.06), steel, { p: [0, 0.5 + (i / 8) * H, lz] });
    return finish(k);
  });

  /** A big grassy hump with a lone tree or a sprinkling of flowers on top. */
  prop('hill_round', (r) => {
    const k = new Kit(r);
    const Rx = r.range(14, 26), Hy = r.range(6, 13), Rz = Rx * r.range(0.7, 1.0);
    k.add(lump(new THREE.SphereGeometry(1, 16, 6, 0, TAU, 0, HALF_PI), 0.035, r.next() * 99, 0.001),
      pick(LEAF, r, 0.04), { s: [Rx, Hy, Rz], jit: 0.05, grad: 0.35 });
    if (r.chance(0.5)) {
      roundTree(k, r.range(-0.2, 0.2) * Rx, Hy * 0.93, r.range(-0.2, 0.2) * Rz, 0.8, true);
    } else {
      const cols = [r.pick(PETALS), 0xfaf7ef];
      const n = r.int(14, 22);
      for (let i = 0; i < n; i++) {
        const a = r.range(0, TAU), phi = r.range(0.1, 1.25);
        k.add(new THREE.IcosahedronGeometry(0.4, 0), r.pick(cols),
          { p: [Math.sin(phi) * Math.cos(a) * Rx, Math.cos(phi) * Hy + 0.1, Math.sin(phi) * Math.sin(a) * Rz] });
      }
    }
    const out = finish(k);
    out.userData.embed = true;         // a landform: meant to be sunk into uneven ground
    return out;
  });

  /** A clump of round trees and pines with a few bushes: one far-off copse. */
  prop('tree_cluster', (r) => {
    const k = new Kit(r);
    const n = r.int(4, 7), rad = r.range(5.5, 8.5);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + r.range(-0.4, 0.4), d = i === 0 ? 0 : rad * Math.sqrt(r.range(0.3, 1));
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (r.chance(0.6)) roundTree(k, x, 0, z, r.range(0.8, 1.15), true);
      else pineTree(k, x, 0, z, r.range(0.9, 1.25));
    }
    const b = r.int(2, 3);
    for (let i = 0; i < b; i++) {
      const a = r.range(0, TAU);
      bushParts(k, Math.cos(a) * (rad + 1.5), Math.sin(a) * (rad + 1.5), r.range(0.9, 1.2));
    }
    return finish(k);
  });

  /**
   * Tethered hot-air balloon. The whole balloon, rope included, is one node
   * pivoting on its ground anchor, so it can drift and sway (anim: sway x/z,
   * spin y) without the rope ever coming loose from the stake.
   */
  prop('hot_air_balloon', (r) => {
    const k = new Kit(r);
    const SCHEMES = [
      [[0xe63946, 0xffd166], 0x3d5a80], [[0x2a9d8f, 0xfdfbf5], 0xf4a261], [[0x9b5de5, 0xf15bb5], 0xfee440],
      [[0xff7b00, 0xfdfbf5], 0xe63946], [[0xe63946, 0xff9f1c, 0xffd23f, 0x3fb950, 0x3d8bff, 0x9b5de5], 0xfdfbf5]
    ];
    const [stripes, bandCol] = r.pick(SCHEMES);
    const sc = r.range(0.9, 1.1);
    const node = new THREE.Group();
    const basketY = 3.4 * sc, mouthY = basketY + 3.2 * sc;
    const prof = [[0.9, 0], [1.5, 0.9], [2.7, 2.5], [3.9, 4.4], [4.7, 6.3], [4.95, 7.9], [4.6, 9.5], [3.6, 10.9], [2.1, 11.8], [0.05, 12.2]]
      .map(([x, y]) => new THREE.Vector2(x * sc, y * sc));
    const segs = 16;
    k.add(new THREE.LatheGeometry(prof, segs), (cx, cy, cz) => {
      const yy = cy - mouthY;
      if (yy > 6.2 * sc && yy < 8.1 * sc) return bandCol;
      const seg = Math.floor(((Math.atan2(cx, cz) + Math.PI) / TAU) * segs);
      return stripes[seg % stripes.length];
    }, { p: [0, mouthY, 0] }, node);
    k.add(new THREE.CircleGeometry(0.92 * sc, 10), 0x3a2a22, { r: [HALF_PI, 0, 0], p: [0, mouthY + 0.02, 0] }, node);
    const wicker = tone(0x9b6a3c, r, 0.03), dark = 0x5e3d22;
    k.add(new THREE.BoxGeometry(1.6 * sc, 1.1 * sc, 1.6 * sc), wicker, { p: [0, basketY + 0.55 * sc, 0], jit: 0.06 }, node);
    k.add(new THREE.BoxGeometry(1.75 * sc, 0.18 * sc, 1.75 * sc), dark, { p: [0, basketY + 1.1 * sc, 0] }, node);
    k.add(new THREE.BoxGeometry(0.7 * sc, 0.35 * sc, 0.7 * sc), 0x3a3f4a, { p: [0, basketY + 2.1 * sc, 0] }, node);
    for (let sx = -1; sx <= 1; sx += 2) {
      for (let sz = -1; sz <= 1; sz += 2) {
        k.add(rod([sx * 0.75 * sc, basketY + 1.15 * sc, sz * 0.75 * sc], [sx * 0.7 * sc, mouthY + 0.1, sz * 0.7 * sc], 0.035, 0.035, 3), dark, {}, node);
      }
      k.add(new THREE.DodecahedronGeometry(0.2 * sc, 0), 0xd9c29a, { s: [1, 1.3, 1], p: [sx * 0.92 * sc, basketY + 0.5 * sc, 0] }, node);
    }
    k.add(rod([0, 0, 0], [0, basketY, 0], 0.04, 0.04, 3), 0xe8dcc0, {}, node);
    const balloon = keep(node);
    k.root.add(balloon);
    k.add(new THREE.CylinderGeometry(0.08, 0.12, 0.7, 5), 0x6b4a33, { p: [0, 0.35, 0] });
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + r.range(-0.3, 0.3);
      k.add(new THREE.DodecahedronGeometry(0.28, 0), tone(0xd9c29a, r, 0.05), { s: [1.2, 0.7, 1], p: [Math.cos(a) * 0.45, 0.2, Math.sin(a) * 0.45] });
    }
    anim(k, balloon, 'sway', 'z', r.range(0.55, 0.8), 0.035, r.range(0, TAU));
    anim(k, balloon, 'sway', 'x', r.range(0.4, 0.6), 0.028, r.range(0, TAU));
    anim(k, balloon, 'spin', 'y', r.range(0.04, 0.09) * r.sign());
    return finish(k);
  });

  /** A water tower on splayed, braced legs, with a walkway and a ladder. */
  prop('water_tower', (r) => {
    const k = new Kit(r);
    const SCHEMES = [[0x6fb7e3, WHITE, 0xd23a2e], [0xd8453a, WHITE, 0x3c4a63], [0xefe6cf, 0x3f9838, 0x3f9838]];
    const [tankCol, bandCol, roofCol] = r.pick(SCHEMES);
    const legH = r.range(10, 11.5), foot = 2.8, headR = 1.9, R = 3.0, TH = 4.2;
    const legCol = r.pick([0x8f5f3e, 0xe9e2d2, 0x5a6270]);
    const corners = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
    corners.forEach(([sx, sz]) => {
      k.add(bar([sx * foot, 0, sz * foot], [sx * headR, legH, sz * headR], 0.36), legCol);
    });
    for (let i = 0; i < 4; i++) {
      const [ax, az] = corners[i], [bx, bz] = corners[(i + 1) % 4];
      for (const [y0, y1] of [[0.8, legH * 0.48], [legH * 0.48, legH - 0.4]]) {
        const w0 = U.lerp(foot, headR, y0 / legH), w1 = U.lerp(foot, headR, y1 / legH);
        k.add(bar([ax * w0, y0, az * w0], [bx * w1, y1, bz * w1], 0.12), legCol);
        k.add(bar([bx * w0, y0, bz * w0], [ax * w1, y1, az * w1], 0.12), legCol);
      }
    }
    const ty = legH;                       // the legs carry the walkway and the tank floor
    k.add(new THREE.ConeGeometry(R, 1.0, 14), tankCol, { r: [Math.PI, 0, 0], p: [0, ty - 0.5, 0] });
    k.add(new THREE.CylinderGeometry(R, R, TH, 14, 3), (cx, cy) => (cy > ty + TH * 0.36 && cy < ty + TH * 0.66 ? bandCol : tankCol),
      { p: [0, ty + TH / 2, 0] });
    k.add(new THREE.ConeGeometry(R * 1.1, 1.9, 14), roofCol, { p: [0, ty + TH + 0.95, 0] });
    k.add(new THREE.IcosahedronGeometry(0.3, 0), 0xffd23f, { p: [0, ty + TH + 2.0, 0] });
    k.add(new THREE.CylinderGeometry(R + 0.7, R + 0.7, 0.15, 14), 0x5a6270, { p: [0, ty, 0] });
    k.add(new THREE.TorusGeometry(R + 0.65, 0.05, 3, 24), 0x5a6270, { r: [HALF_PI, 0, 0], p: [0, ty + 0.95, 0] });
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU;
      k.add(new THREE.BoxGeometry(0.07, 0.95, 0.07), 0x5a6270, { p: [Math.cos(a) * (R + 0.65), ty + 0.5, Math.sin(a) * (R + 0.65)] });
    }
    const lz = -(R + 0.55);
    for (let s = -1; s <= 1; s += 2) k.add(new THREE.BoxGeometry(0.07, ty, 0.07), 0x5a6270, { p: [s * 0.3, ty / 2, lz] });
    for (let i = 1; i < 12; i++) k.add(new THREE.BoxGeometry(0.6, 0.05, 0.05), 0x5a6270, { p: [0, (i / 12) * ty, lz] });
    return finish(k);
  });

  /* ── Meadow hazards ───────────────────────────────────────────────────── */

  /** Block: three straw bales stacked like bricks, bound with red twine. */
  hazard('hay_stack', 'block', 'meadow', (r) => {
    const k = new Kit(r, true);
    const col = pick(HAY, r, 0.03), tw = tone(TWINE, r, 0.03), tuft = tone(0xfbe08a, r, 0.03);
    const bale = (w, h, d, x, y, z, yaw) => {
      k.add(pillow(new THREE.BoxGeometry(w, h, d, 2, 2, 2), 0.07), col, { r: [0, yaw, 0], p: [x, y, z], jit: 0.08, grad: 0.12 });
      for (let s = -1; s <= 1; s += 2) {
        k.add(new THREE.BoxGeometry(0.1, h + 0.14, d + 0.14), tw,
          { r: [0, yaw, 0], p: [x + Math.cos(yaw) * s * w * 0.26, y, z - Math.sin(yaw) * s * w * 0.26], noInk: true });
      }
    };
    // Bottom bales run the full length of world.js's 2.6 m collision box.
    bale(1.3, 0.92, 2.3, -0.67, 0.46, 0, r.range(-0.03, 0.03));
    bale(1.3, 0.92, 2.3, 0.67, 0.46, 0, r.range(-0.03, 0.03));
    bale(1.3, 0.92, 1.9, r.range(-0.12, 0.12), 1.38, r.range(-0.1, 0.1), HALF_PI + r.range(-0.1, 0.1));
    const n = r.int(5, 8);
    for (let i = 0; i < n; i++) {
      const s = r.sign();
      k.add(new THREE.ConeGeometry(0.07, i < 3 ? 0.38 : 0.26, 3), tuft, i < 3
        ? { r: [r.range(-0.5, 0.5), 0, r.range(-0.5, 0.5)], p: [r.range(-0.5, 0.5), 1.98, r.range(-0.5, 0.5)], noInk: true }
        : { r: [0, 0, -s * r.range(1.2, 1.8)], p: [s * 1.3, r.range(0.2, 0.8), r.range(-0.6, 0.6)], noInk: true });
    }
    A.ink(k.root, 0.06);
    const out = finish(k);
    shadow(out, 3.7, 2.7);
    return out;
  });

  /** Roller: a round bale on the loose, spiral ends and twine hoops showing the roll. */
  hazard('hay_roll', 'roller', 'meadow', (r) => {
    const k = new Kit(r, true);
    const R = 1.0, L = 1.55;
    const col = pick(HAY, r, 0.03), dark = tone(0xc4912c, r, 0.03), tw = tone(TWINE, r, 0.03);
    const node = new THREE.Group();
    node.position.y = R;
    k.add(lump(new THREE.CylinderGeometry(R, R, L, 18, 2, true), 0.02, r.next() * 99), col, { r: [HALF_PI, 0, 0], jit: 0.08 }, node);
    const spiral = (cx, cy, cz) => ((Math.floor(Math.hypot(cx, cz) / R * 3.4 + Math.atan2(cz, cx) / TAU) & 1) ? col : dark);
    for (let s = -1; s <= 1; s += 2) {
      const d = paintFaces(disc([0.2, 0.42, 0.62, 0.82, 1].map((v) => v * R), 18), spiral, r, { jit: 0.04 });
      k.add(d, null, { r: [s * HALF_PI, 0, 0], p: [0, 0, s * L / 2] }, node);
    }
    for (let s = -1; s <= 1; s += 2) k.add(new THREE.TorusGeometry(R + 0.02, 0.045, 4, 22), tw, { p: [0, 0, s * 0.42] }, node);
    // Loose straw lies flat along the drum: nothing may stick out, or the
    // bounds would no longer be centred on the rolling axis.
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU + r.range(-0.3, 0.3);
      k.add(new THREE.BoxGeometry(0.05, 0.03, r.range(0.5, 0.9)), tone(0xfbe08a, r, 0.03),
        { r: [0, 0, a], p: [Math.cos(a) * (R + 0.005), Math.sin(a) * (R + 0.005), r.range(-0.3, 0.3)], noInk: true }, node);
    }
    inkHull(new THREE.CylinderGeometry(R, R, L, 18).rotateX(HALF_PI), node, 0.06);
    const roll = keep(node);
    roll.name = 'roll';
    k.root.add(roll);
    const out = finish(k);
    out.userData.rollRadius = R;
    out.userData.rollNode = roll;
    return out;
  });

  /**
   * Puddle builder shared by the four themes: a lane-wide, 6 m blob at
   * y = 0.02 whose outermost ring is painted dark (the puddle's ink line —
   * a flat decal cannot have an inverted-hull outline). `fill(rho, x, z)`
   * colours the inside by normalised radius; the caller adds 3D details.
   */
  const PUDDLE_RADII = [0.2, 0.42, 0.62, 0.78, 0.88, 0.94, 1.0];
  function puddleBase(k, rim, fill, halfW, halfL) {
    const shape = blobShape(k.rng, 0.12);
    const g = paintFaces(disc(PUDDLE_RADII, 32, shape), (cx, cy, cz) => {
      const rho = Math.hypot(cx, cz) / shape(Math.atan2(cz, cx));
      return rho > 0.94 ? rim : fill(rho, cx, cz);
    }, k.rng, { jit: 0.03 });
    const out = k.add(g, null, { s: [halfW || 1.6, 1, halfL || 3.0], p: [0, 0.02, 0], noInk: true });
    return { shape, mesh: out };
  }

  /**
   * A lumpy raised lip round a puddle: a flat decal all but vanishes at a
   * chase-camera angle, but a ring of inked lumps gives it a silhouette.
   */
  function puddleLip(k, shape, col, halfW, halfL, count, size) {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * TAU + k.rng.range(-0.12, 0.12);
      const s = shape(a) * 0.88, rad = size * k.rng.range(0.75, 1.2);   // on the wet ring, inside the lane
      k.add(new THREE.DodecahedronGeometry(rad, 0), tone(col, k.rng, 0.04),
        { s: [1.3, 0.42, 1.3], r: [0, k.rng.range(0, TAU), 0], p: [Math.cos(a) * s * halfW, 0.02 + rad * 0.2, Math.sin(a) * s * halfL], jit: 0.06 });
    }
  }

  /** Puddle: thick farmyard mud with a wet edge and fat bubbles. Slows, never spins. */
  hazard('mud_puddle', 'puddle', 'meadow', (r) => {
    const k = new Kit(r, true);
    const mud = tone(0x6b4226, r, 0.03), deep = tone(0x4e2f19, r, 0.03), wet = tone(0x8c5e37, r, 0.03);
    const seed = r.next() * 99, HW = 1.45, HL = 2.95;
    const base = puddleBase(k, 0x2a180c, (rho, x, z) => (rho > 0.8 ? wet : (hash3(Math.round(x * 3), 0, Math.round(z * 3), seed) > 0.25 ? deep : mud)), HW, HL);
    puddleLip(k, base.shape, 0x7a4d2b, HW, HL, 12, 0.2);
    const n = r.int(4, 6);
    for (let i = 0; i < n; i++) {
      const a = r.range(0, TAU), d = Math.sqrt(r.next()) * 0.6;
      const rb = r.range(0.18, 0.34), x = Math.cos(a) * d * HW, z = Math.sin(a) * d * HL;
      k.add(new THREE.SphereGeometry(rb, 8, 4, 0, TAU, 0, HALF_PI), tone(0x5a371e, r, 0.04), { p: [x, 0.02, z] });
      k.add(new THREE.OctahedronGeometry(rb * 0.22, 0), 0xf3e6d0, { p: [x - rb * 0.35, 0.02 + rb * 0.8, z - rb * 0.35], noInk: true });
    }
    A.ink(k.root, 0.035);
    return finish(k, 0.02);
  });

  /* ── Public ───────────────────────────────────────────────────────────── */
  /* The remaining Sunshine worlds use the same painted geometry kit as
     Meadow. All decoration welds to one material; no external assets. */
  const SWEET = [0xff87bd, 0x97dfd0, 0xb99bef, 0xffd572, 0x89c8f2];
  const sb = (k, w, h, d, c, x, y, z, rot) => k.add(new THREE.BoxGeometry(w, h, d), c, { p: [x, y, z], r: rot, jit: 0.04 });
  const so = (k, rad, c, x, y, z, sc) => k.add(new THREE.IcosahedronGeometry(rad, 1), c, { p: [x, y, z], s: sc, jit: 0.055, grad: 0.18 });
  const scy = (k, rt, rb, h, c, x, y, z, n) => k.add(new THREE.CylinderGeometry(rt, rb, h, n || 10), c, { p: [x, y, z], jit: 0.035 });
  const sco = (k, rad, h, c, x, y, z, rot, n) => k.add(new THREE.ConeGeometry(rad, h, n || 8), c, { p: [x, y, z], r: rot, jit: 0.035 });
  const sto = (k, rad, tube, c, x, y, z, rot, scale) => k.add(new THREE.TorusGeometry(rad, tube, 6, 24), c, { p: [x, y, z], r: rot, s: scale });

  function sizeHazard(k, dims) {
    const b = bounds(k.root), size = new THREE.Vector3(); b.getSize(size);
    const sx = dims[0] / size.x, sy = dims[1] / size.y, sz = dims[2] / size.z;
    // New hazard geometry is already in root coordinates, like the Meadow kit.
    k.root.traverse((m) => { if (m.isMesh) m.geometry.scale(sx, sy, sz); });
    A.ink(k.root, 0.055);
    return finish(k);
  }

  // SHORES — palms with cut-paper leaves, striped canvas and sand toys.
  function palm(k, x, z, scale) {
    const h = k.rng.range(7, 10) * scale, lean = scale * 1.25;
    for (let i = 0; i < 5; i++) {
      const a = [x + lean * Math.pow(i / 5, 2), h * i / 5, z];
      const b = [x + lean * Math.pow((i + 1) / 5, 2), h * (i + 1) / 5, z];
      k.add(rod(a, b, (0.43 - i * 0.04) * scale, (0.39 - i * 0.04) * scale, 7), i % 2 ? 0xaa744d : 0xc88a57, { jit: 0.05 });
    }
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * TAU, len = k.rng.range(3.5, 4.7) * scale;
      const pts = [0, 0, 0, Math.cos(a - 0.35) * len * 0.48, scale * 0.5, Math.sin(a - 0.35) * len * 0.48,
        Math.cos(a) * len, -scale * 1.15, Math.sin(a) * len,
        Math.cos(a + 0.35) * len * 0.48, scale * 0.5, Math.sin(a + 0.35) * len * 0.48];
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); g.setIndex([0, 1, 2, 0, 2, 3]); g.computeVertexNormals();
      k.add(twoSided(g), i % 2 ? 0x449955 : 0x6cbb57, { p: [x + lean, h, z], jit: 0.06 });
    }
    for (let i = 0; i < 3; i++) so(k, scale * 0.38, 0x8b573e, x + lean + Math.cos(i * 2.1) * scale * 0.45, h - scale * 0.2, z + Math.sin(i * 2.1) * scale * 0.45);
  }
  prop('palm_tree', (r) => { const k = new Kit(r); palm(k, 0, 0, r.range(0.8, 1.2)); return finish(k); });
  prop('beach_umbrella', (r) => {
    const k = new Kit(r), color = r.pick([0xef655c, 0x50bfc4, 0x8b7fe0]), rad = r.range(2.2, 2.8);
    scy(k, 0.07, 0.09, 3.8, 0xf2e3cb, 0, 1.9, 0, 6);
    k.add(new THREE.ConeGeometry(rad, 1.1, 12, 1, true), (x, y, z) => (Math.floor((Math.atan2(z, x) + Math.PI) / TAU * 12) & 1) ? color : WHITE, { p: [0, 3.75, 0] });
    // The underside is visible when the road is below the beach.
    k.add(flip(new THREE.ConeGeometry(rad, 1.1, 12, 1, true)), 0xeedcc8, { p: [0, 3.75, 0] });
    so(k, 0.12, color, 0, 4.37, 0); return finish(k);
  });
  function sandCastle(k, scale) {
    const sand = 0xecc789;
    sb(k, 2.7 * scale, 1.15 * scale, 2 * scale, sand, 0, 0.58 * scale, 0);
    for (const s of [-1, 1]) {
      scy(k, 0.52 * scale, 0.67 * scale, 1.9 * scale, sand, s * 1.05 * scale, 0.95 * scale, 0, 8);
      for (let i = 0; i < 5; i++) { const a = i * TAU / 5; sb(k, 0.22 * scale, 0.3 * scale, 0.22 * scale, 0xf9daa0, s * 1.05 * scale + Math.cos(a) * 0.42 * scale, 2.04 * scale, Math.sin(a) * 0.42 * scale); }
    }
    sb(k, 0.6 * scale, 0.86 * scale, 0.08 * scale, 0xb38b55, 0, 0.43 * scale, -1.04 * scale);
    for (let i = 0; i < 4; i++) sb(k, 0.36 * scale, 0.3 * scale, 0.35 * scale, 0xf9daa0, i * 0.57 * scale - 0.855 * scale, 1.28 * scale, -0.82 * scale);
    k.add(rod([0, 1.15 * scale, 0], [0, 2.7 * scale, 0], 0.04 * scale, 0.04 * scale, 5), 0xece7db);
    sb(k, 0.65 * scale, 0.42 * scale, 0.05 * scale, 0xef7664, 0.325 * scale, 2.45 * scale, 0);
  }
  prop('sand_castle', (r) => { const k = new Kit(r); sandCastle(k, r.range(0.75, 1.05)); k.root.userData.faceRoad = true; return finish(k); });
  prop('beach_ball', (r) => {
    const k = new Kit(r), rad = r.range(0.65, 1.05), cols = [0xee665e, 0xffd77c, WHITE, 0x66bfcf, 0xffd77c, WHITE];
    k.add(new THREE.SphereGeometry(rad, 12, 8), (x, y, z) => cols[Math.floor((Math.atan2(z, x) + Math.PI) / TAU * 6) % 6], { p: [0, rad, 0] }); return finish(k);
  });
  prop('rock_sand', (r) => { const k = new Kit(r); so(k, r.range(1, 1.8), 0xcab397, 0, 0, 0, [1.45, 0.7, 1]); return finish(k); });
  prop('seashell', (r) => {
    const k = new Kit(r), color = r.pick([0xf8d7c6, 0xefb6b1, 0xf7dfae]);
    for (let i = 0; i < 7; i++) {
      const a = (i / 6 - 0.5) * 1.8, len = 1.3 - Math.abs(i - 3) * 0.07;
      k.add(rod([0, 0.07, 0.5], [Math.sin(a) * len, 0.25, -Math.cos(a) * len], 0.1, 0.22, 6), i % 2 ? color : WHITE);
    }
    return finish(k);
  });
  prop('surf_stand', (r) => {
    const k = new Kit(r); sb(k, 4, 0.17, 0.5, 0xad7b50, 0, 1.1, 0.5);
    [-1.7, 1.7].forEach((x) => sb(k, 0.2, 2.1, 0.3, 0xad7b50, x, 1.05, 0.5));
    for (let i = 0; i < 3; i++) {
      const color = [0xf76c66, 0x72d2c7, 0xf6cc64][i], x = (i - 1) * 1.15;
      so(k, 1, color, x, 1.8, 0, [0.45, 1.8, 0.14]);
      sb(k, 0.1, 2.8, 0.08, WHITE, x, 1.8, -0.15);
    }
    k.root.userData.faceRoad = true; return finish(k);
  });
  prop('beach_grass', (r) => {
    const k = new Kit(r);
    for (let i = 0; i < 9; i++) sco(k, 0.09, r.range(0.8, 1.6), i % 2 ? 0x94ae62 : 0xc3c87c, r.range(-0.6, 0.6), 0.5, r.range(-0.4, 0.4), [r.range(-0.3, 0.3), 0, r.range(-0.3, 0.3)], 3);
    return finish(k);
  });
  prop('lighthouse', (r) => {
    const k = new Kit(r), h = r.range(21, 27);
    k.add(new THREE.CylinderGeometry(2.1, 3.2, h, 12, 8), (x, y) => Math.floor(y / h * 8) % 2 ? 0xeb6259 : WHITE, { p: [0, h / 2, 0], jit: 0.02 });
    scy(k, 3, 3, 0.45, 0x44566d, 0, h, 0, 12);
    scy(k, 1.9, 1.9, 3.1, 0xffdc84, 0, h + 1.6, 0, 10);
    for (let i = 0; i < 8; i++) { const a = i * TAU / 8; sb(k, 0.15, 3.4, 0.15, 0x48566a, Math.cos(a) * 1.9, h + 1.5, Math.sin(a) * 1.9); }
    sco(k, 2.7, 2.2, 0xdd5a54, 0, h + 4.1, 0, null, 10);
    sb(k, 1.3, 2.4, 0.2, 0x546886, 0, 1.2, -3.02); k.root.userData.faceRoad = true; return finish(k);
  });
  prop('beach_hut', (r) => {
    const k = new Kit(r), c = r.pick([0x74c6c2, 0xf39e88, 0x95b8ed]);
    sb(k, 8, 5, 6, c, 0, 3, 0);
    k.add(new THREE.CylinderGeometry(5.7, 5.7, 7, 3), 0xe6bb75, { r: [0, 0, HALF_PI], p: [0, 6.9, 0] });
    sb(k, 1.8, 3.7, 0.15, 0xf7e5c7, 0, 2.4, -3.08);
    [-2.4, 2.4].forEach((x) => { sb(k, 1.8, 1.8, 0.2, WHITE, x, 3.6, -3.1); sb(k, 1.35, 1.3, 0.24, 0x5893b1, x, 3.6, -3.14); });
    sb(k, 9, 0.3, 2.2, 0xcaa16d, 0, 0.6, -3.5); k.root.userData.faceRoad = true; return finish(k);
  });
  prop('sailboat', (r) => {
    const k = new Kit(r);
    k.add(new THREE.SphereGeometry(4, 12, 5, 0, TAU, HALF_PI, HALF_PI), 0xe87664, { s: [0.55, 0.42, 1.6], p: [0, 0.2, 0] });
    sb(k, 3.8, 0.25, 10.5, 0xf6e1b5, 0, 0.25, 0); scy(k, 0.13, 0.17, 12, 0xc8a174, 0, 6.2, 0, 7);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0, 1, 0, 0, 11.8, 0, 0, 1, 5.4], 3)); g.computeVertexNormals();
    k.add(twoSided(g), 0xfff1d6); k.add(twoSided(g.clone().scale(1, 0.75, -0.8)), 0x64bcca);
    const out = finish(k); out.userData.waterline = true; return out;
  });
  prop('sea_rock', (r) => {
    const k = new Kit(r); for (let i = 0; i < 3; i++) so(k, r.range(4, 7), i % 2 ? 0x858e9f : 0x9b9b9a, (i - 1) * 5, 1, i * 2, [0.8, 1.3, 1]); return finish(k);
  });
  prop('pier', (r) => {
    const k = new Kit(r);
    for (let i = 0; i < 13; i++) { const z = i * 1.5 - 9; sb(k, 6, 0.25, 1.4, i % 2 ? 0xba875b : 0xcfa174, 0, 3.1, z); }
    for (const x of [-2.5, 2.5]) for (const z of [-9, -3, 3, 9]) { scy(k, 0.3, 0.4, 5, 0x856344, x, 2.5, z, 7); }
    [-2.6, 2.6].forEach((x) => sb(k, 0.18, 0.2, 19, 0xf1dec1, x, 4.5, 0));
    const out = finish(k); out.userData.waterline = true; return out;
  });
  hazard('castle_big', 'block', 'shores', (r) => { const k = new Kit(r, true); sandCastle(k, 1); return sizeHazard(k, [2.8, 2.45, 2.6]); });
  hazard('crab', 'roller', 'shores', (r) => {
    const k = new Kit(r, true); so(k, 0.78, 0xf3744e, 0, 0.65, 0, [1.2, 0.7, 0.75]);
    for (const s of [-1, 1]) {
      for (let i = 0; i < 3; i++) k.add(rod([s * 0.55, 0.65, i * 0.3 - 0.3], [s * 1.05, 0.12, i * 0.45 - 0.45], 0.09, 0.055, 5), 0xec6242);
      k.add(rod([s * 0.6, 0.7, 0.25], [s * 0.9, 1.05, 0.7], 0.12, 0.16, 5), 0xf58d58);
      so(k, 0.28, 0xffb16c, s * 0.9, 1.1, 0.72, [1.1, 0.8, 1]);
      scy(k, 0.06, 0.08, 0.5, 0xf8905b, s * 0.27, 1.14, 0.36, 5);
      so(k, 0.18, WHITE, s * 0.27, 1.42, 0.4); so(k, 0.09, 0x2c3148, s * 0.27, 1.43, 0.56);
    }
    return sizeHazard(k, [2.15, 1.45, 1.7]);
  });
  hazard('tide_pool', 'puddle', 'shores', (r) => {
    const k = new Kit(r, true); puddleBase(k, 0x3e6479, (rho) => rho > 0.7 ? 0x97e4e9 : 0x55b7d3, 1.45, 2.95); return finish(k, 0.02);
  });

  // CANDY — folded wrappers, striped sticks and layers of bright frosting.
  function lolly(k, x, y, z, radius, color) {
    scy(k, 0.1, 0.12, y, WHITE, x, y / 2, z, 6);
    k.add(new THREE.CylinderGeometry(radius, radius, 0.45, 24), color, { r: [HALF_PI, 0, 0], p: [x, y, z] });
    for (const s of [-1, 1]) {
      const g = paintFaces(disc([0.16, 0.32, 0.48, 0.64, 0.8, 1].map(v => v * radius), 36), (cx, cy, cz) =>
        (Math.floor(Math.hypot(cx, cz) / radius * 4 + Math.atan2(cz, cx) / TAU * 3) & 1) ? WHITE : color, k.rng, {});
      k.add(g, null, { r: [s * HALF_PI, 0, 0], p: [x, y, z + s * 0.231] });
    }
  }
  prop('lollipop_tree', (r) => { const k = new Kit(r); lolly(k, 0, r.range(5, 7), 0, r.range(1.8, 2.3), r.pick(SWEET)); return finish(k); });
  prop('candy_cane', (r) => {
    const k = new Kit(r), c = r.pick([0xe95b86, 0x65c7b1]);
    k.add(new THREE.CylinderGeometry(0.32, 0.32, 5, 8, 14), (x, y) => Math.floor(y * 2.8) % 2 ? c : WHITE, { p: [0, 2.5, 0] });
    k.add(new THREE.TorusGeometry(0.9, 0.32, 8, 18, Math.PI), (x, y) => Math.floor(Math.atan2(y - 5, x - 0.9) * 4) % 2 ? c : WHITE, { p: [0.9, 5, 0] });
    scy(k, 0.32, 0.32, 0.5, c, 1.8, 4.75, 0, 8); return finish(k);
  });
  function gumdrop(k, size, color) {
    k.add(new THREE.SphereGeometry(size, 12, 6, 0, TAU, 0, HALF_PI), color, { s: [1, 1.3, 1] });
    scy(k, size, size, size * 0.35, color, 0, -size * 0.175, 0, 12);
    for (let i = 0; i < 12; i++) { const a = i * 2.4, y = k.rng.range(0.1, 0.95); so(k, size * 0.045, WHITE, Math.cos(a) * size * Math.sqrt(1 - y * y), y * size * 1.3, Math.sin(a) * size * Math.sqrt(1 - y * y)); }
  }
  prop('gumdrop', (r) => { const k = new Kit(r); gumdrop(k, r.range(0.9, 1.6), r.pick(SWEET)); return finish(k); });
  function cupcake(k, scale) {
    const c = k.rng.pick(SWEET);
    k.add(new THREE.CylinderGeometry(1.05 * scale, 0.8 * scale, 1.15 * scale, 16), (x, y, z) => Math.floor((Math.atan2(z, x) + Math.PI) / TAU * 16) % 2 ? c : shade(c, -0.1), { p: [0, 0.575 * scale, 0] });
    so(k, 1.1 * scale, 0xffecc8, 0, 1.25 * scale, 0, [1, 0.6, 1]);
    for (let i = 0; i < 6; i++) { const a = i * TAU / 6; so(k, 0.47 * scale, 0xfff2e1, Math.cos(a) * 0.57 * scale, 1.65 * scale, Math.sin(a) * 0.57 * scale); }
    so(k, 0.55 * scale, 0xfff2e1, 0, 1.9 * scale, 0);
    so(k, 0.25 * scale, 0xe95b69, 0, 2.36 * scale, 0);
    for (let i = 0; i < 8; i++) { const a = i * 2.4; sb(k, 0.22 * scale, 0.06 * scale, 0.09 * scale, SWEET[i % SWEET.length], Math.cos(a) * 0.68 * scale, 1.9 * scale, Math.sin(a) * 0.68 * scale, [0, a, 0]); }
  }
  prop('cupcake', (r) => { const k = new Kit(r); cupcake(k, r.range(0.8, 1.15)); return finish(k); });
  prop('donut', (r) => {
    const k = new Kit(r), rad = r.range(1, 1.5), c = r.pick(SWEET);
    sto(k, rad, rad * 0.42, 0xdca768, 0, rad * 1.4, 0);
    sto(k, rad, rad * 0.36, c, 0, rad * 1.4, -rad * 0.25);
    for (let i = 0; i < 12; i++) { const a = i * TAU / 12; sb(k, 0.2, 0.08, 0.08, SWEET[i % 5], Math.cos(a) * rad, rad * 1.4 + Math.sin(a) * rad, -rad * 0.63, [0, 0, a]); }
    return finish(k);
  });
  prop('ice_cream', (r) => {
    const k = new Kit(r); sco(k, 0.9, 2.5, 0xdca46b, 0, 1.25, 0, [Math.PI, 0, 0], 12);
    for (let i = 0; i < 3; i++) so(k, 1.05, [0xf6d4b3, 0xe994bb, 0xa2d6c1][i], (i - 1) * 0.12, 2.6 + i * 1.25, 0);
    return finish(k);
  });
  prop('wafer_fence', (r) => {
    const k = new Kit(r); sb(k, 6.5, 1.8, 0.3, 0xe3b675, 0, 1, 0);
    for (let i = 0; i < 11; i++) sb(k, 0.1, 1.9, 0.06, 0xbe8d57, i * 0.6 - 3, 1, -0.19);
    [0.4, 1, 1.6].forEach((y) => sb(k, 6.5, 0.08, 0.06, 0xbe8d57, 0, y, -0.2));
    [-3, 3].forEach((x) => { scy(k, 0.18, 0.18, 2.7, 0xf6d5a1, x, 1.35, 0, 6); so(k, 0.28, 0xf297b8, x, 2.7, 0); }); return finish(k);
  });
  function cake(k, scale, tiers) {
    const colors = [0xf6b0c8, 0xb9dccc, 0xc4b1e8];
    for (let i = 0; i < tiers; i++) {
      const rad = (5 - i * 1.2) * scale, y = i * 3.1 * scale;
      scy(k, rad, rad, 3 * scale, colors[i % 3], 0, y + 1.5 * scale, 0, 16);
      scy(k, rad * 1.015, rad * 1.015, 0.45 * scale, WHITE, 0, y + 2.95 * scale, 0, 16);
      for (let j = 0; j < 10; j++) { const a = j * TAU / 10; so(k, scale * 0.3, 0xe8738d, Math.cos(a) * rad * 0.85, y + 3.25 * scale, Math.sin(a) * rad * 0.85); }
    }
    scy(k, 0.3 * scale, 0.3 * scale, 2 * scale, 0x89c4e5, 0, (tiers * 3.1 + 1) * scale, 0, 6);
    so(k, 0.4 * scale, 0xffc45f, 0, (tiers * 3.1 + 2.4) * scale, 0, [0.7, 1.5, 0.7]);
  }
  prop('cake_mountain', (r) => { const k = new Kit(r); cake(k, r.range(1.7, 2.4), 3); return finish(k); });
  prop('giant_cake', (r) => { const k = new Kit(r); cake(k, 3.8, 3); return finish(k); });
  prop('cookie_house', (r) => {
    const k = new Kit(r); sb(k, 9, 7, 7, 0xca8e58, 0, 3.5, 0);
    k.add(new THREE.CylinderGeometry(6, 6, 9, 3), 0x8d5b42, { r: [0, 0, HALF_PI], p: [0, 8, 0] });
    sb(k, 2.2, 4, 0.2, 0x6d4c40, 0, 2, -3.6);
    [-2.6, 2.6].forEach((x) => { sto(k, 1, 0.18, WHITE, x, 4.2, -3.6); scy(k, 0.09, 0.09, 7, 0xf4d4b5, x * 1.5, 3.5, -3.55, 6); });
    for (let i = 0; i < 10; i++) so(k, 0.3, 0x704a37, r.range(-4, 4), r.range(0.5, 6.5), -3.55, [1, 1, 0.3]);
    k.root.userData.faceRoad = true; return finish(k);
  });
  prop('choco_fountain', (r) => {
    const k = new Kit(r); scy(k, 5, 5.2, 1.3, 0xe6b292, 0, 0.65, 0, 14);
    scy(k, 4.5, 4.5, 0.2, 0x84513b, 0, 1.35, 0, 14);
    for (let i = 0; i < 3; i++) { const rad = 3.2 - i; sco(k, rad, 1.6, 0x9a6041, 0, 3 + i * 2.3, 0, [Math.PI, 0, 0], 12); scy(k, 0.42, 0.55, 3, 0x84513b, 0, 2.8 + i * 2.3, 0, 8); }
    return finish(k);
  });
  prop('candy_hill', (r) => {
    const k = new Kit(r), rad = r.range(10, 18);
    k.add(new THREE.SphereGeometry(rad, 12, 5, 0, TAU, 0, HALF_PI), r.pick(SWEET), { s: [1.5, 0.7, 1], jit: 0.05 });
    k.root.userData.embed = true; return finish(k);
  });
  hazard('cupcake_big', 'block', 'candy', (r) => { const k = new Kit(r, true); cupcake(k, 1); return sizeHazard(k, [2.8, 2.45, 2.65]); });
  hazard('gumball', 'roller', 'candy', (r) => {
    const k = new Kit(r, true), c = r.pick([0xf578b4, 0x74d2ce, 0xaf8bf2]); so(k, 1, c, 0, 1, 0);
    so(k, 0.22, WHITE, -0.36, 1.53, -0.7, [1, 1, 0.18]); return sizeHazard(k, [2, 2, 2]);
  });
  hazard('choco_puddle', 'puddle', 'candy', (r) => {
    const k = new Kit(r, true); puddleBase(k, 0x472c26, (rho) => rho > 0.7 ? 0xbc835d : 0x885338, 1.45, 2.95); return finish(k, 0.02);
  });

  // DUNES — warm sandstone, turquoise details and oversized cactus flowers.
  function cactus(k, scale, barrel) {
    const green = k.rng.pick([0x629e63, 0x78aa68, 0x4c976e]);
    if (barrel) {
      so(k, scale, green, 0, scale, 0, [1, 1.3, 1]);
      for (let i = 0; i < 8; i++) { const a = i * TAU / 8; k.add(rod([Math.cos(a) * scale * 0.75, scale * 0.35, Math.sin(a) * scale * 0.75], [Math.cos(a) * scale * 0.75, scale * 1.8, Math.sin(a) * scale * 0.75], scale * 0.055, scale * 0.04, 4), 0xb5ce7b); }
    } else {
      scy(k, scale * 0.43, scale * 0.5, scale * 5, green, 0, scale * 2.5, 0, 8); so(k, scale * 0.43, green, 0, scale * 5, 0);
      [-1, 1].forEach((s) => {
        const y = (s > 0 ? 2.7 : 1.7) * scale;
        k.add(rod([0, y, 0], [s * 1.4 * scale, y, 0], 0.27 * scale, 0.32 * scale, 7), green);
        scy(k, 0.26 * scale, 0.31 * scale, 1.65 * scale, green, s * 1.4 * scale, y + 0.8 * scale, 0, 7);
        so(k, 0.26 * scale, green, s * 1.4 * scale, y + 1.65 * scale, 0);
      });
    }
    const h = barrel ? scale * 2.3 : scale * 5.35;
    for (let i = 0; i < 5; i++) { const a = i * TAU / 5; so(k, scale * 0.18, 0xf19bb6, Math.cos(a) * scale * 0.24, h, Math.sin(a) * scale * 0.24, [1, 0.6, 1]); }
    so(k, scale * 0.16, 0xf9d471, 0, h + scale * 0.08, 0);
  }
  prop('cactus', (r) => { const k = new Kit(r); cactus(k, r.range(0.8, 1.4), false); return finish(k); });
  prop('cactus_barrel', (r) => { const k = new Kit(r); cactus(k, r.range(0.9, 1.5), true); return finish(k); });
  function desertRock(k, scale) { so(k, scale, 0xc27e55, 0, 0, 0, [1.2, 0.85, 1]); so(k, scale * 0.5, 0xe0a474, -scale * 0.7, -scale * 0.2, scale * 0.45); }
  prop('rock_desert', (r) => { const k = new Kit(r); desertRock(k, r.range(1, 2)); return finish(k); });
  prop('dry_shrub', (r) => {
    const k = new Kit(r); for (let i = 0; i < 7; i++) { const a = i * TAU / 7, h = r.range(0.8, 1.5), x = Math.cos(a) * h, z = Math.sin(a) * h; k.add(rod([0, 0, 0], [x, h, z], 0.09, 0.025, 5), 0xb18d60); k.add(rod([x * 0.6, h * 0.6, z * 0.6], [x * 1.2, h * 0.65, z * 1.2], 0.045, 0.015, 4), 0xc3a66d); } return finish(k);
  });
  prop('desert_sign', (r) => {
    const k = new Kit(r); sb(k, 0.23, 3.5, 0.25, 0x93674e, 0, 1.75, 0);
    sb(k, 3.3, 1.1, 0.2, 0xe7b76e, 0, 2.7, 0, [0, 0, -0.06]);
    sb(k, 1.6, 0.15, 0.08, 0x845542, 0, 2.7, -0.15);
    k.add(new THREE.ConeGeometry(0.42, 0.09, 3), 0x845542, { p: [0.7, 2.7, -0.16], r: [-HALF_PI, 0, -HALF_PI] }); k.root.userData.faceRoad = true; return finish(k);
  });
  prop('bones', (r) => {
    const k = new Kit(r); for (let i = 0; i < 3; i++) { const z = (i - 1) * 0.75; sto(k, 0.8, 0.11, 0xf2dfb7, 0, 0, z, null); }
    k.add(rod([0, 0.25, -1.4], [0, 0.25, 1.4], 0.14, 0.14, 6), 0xe1c99e); return finish(k);
  });
  prop('mesa', (r) => {
    const k = new Kit(r), h = r.range(16, 28), rad = r.range(12, 19);
    k.add(new THREE.CylinderGeometry(rad * 0.65, rad, h, 7, 9), (x, y) => [0xb8764d, 0xe5ac75, 0xc78b5c][Math.abs(Math.floor(y / 3)) % 3], { p: [0, h / 2, 0] });
    scy(k, rad * 0.66, rad * 0.7, 1.6, 0xe2ad73, 0, h, 0, 7); k.root.userData.embed = true; return finish(k);
  });
  prop('pyramid', (r) => {
    const k = new Kit(r), h = r.range(24, 34), rad = h * 0.85;
    k.add(new THREE.ConeGeometry(rad, h, 4, 12), (x, y) => Math.floor(y / 2.6) % 2 ? 0xe5bd80 : 0xd7a568, { p: [0, h / 2, 0], r: [0, Math.PI / 4, 0] });
    k.root.userData.embed = true; return finish(k);
  });
  prop('oasis_palm', (r) => { const k = new Kit(r); palm(k, 0, 0, 1.7); palm(k, 4, 1.5, 1.3); return finish(k); });
  prop('dune_hill', (r) => {
    const k = new Kit(r); k.add(new THREE.SphereGeometry(r.range(15, 24), 12, 5, 0, TAU, 0, HALF_PI), 0xe8bb78, { s: [1.5, 0.35, 1], jit: 0.045 });
    k.root.userData.embed = true; return finish(k);
  });
  prop('cat_statue', (r) => {
    const k = new Kit(r), gold = 0xd7ac68;
    sb(k, 10, 1.4, 9, 0xc59360, 0, 0.7, 0);
    so(k, 4, gold, 0, 5.3, 0, [0.8, 1.35, 0.8]); so(k, 3.1, 0xe4ba76, 0, 10.3, 0);
    [-1, 1].forEach((s) => { sco(k, 1.3, 3.4, gold, s * 1.9, 12.6, 0, [0, 0, -s * 0.13], 4); so(k, 0.55, 0x56aaa5, s * 1.05, 10.65, -2.65, [1, 0.7, 0.22]); sb(k, 1.5, 5.4, 1.7, gold, s * 1.7, 3.7, -1.7); });
    sco(k, 0.45, 0.15, 0x8b684d, 0, 9.8, -3.12, [-HALF_PI, 0, 0], 3);
    sto(k, 2.5, 0.22, 0x58a8a9, 0, 7.8, 0, [HALF_PI, 0, 0]); k.root.userData.faceRoad = true; return finish(k);
  });
  hazard('boulder_desert', 'block', 'dunes', (r) => { const k = new Kit(r, true); desertRock(k, 1.4); return sizeHazard(k, [2.8, 2.35, 2.6]); });
  hazard('tumbleweed', 'roller', 'dunes', (r) => {
    const k = new Kit(r, true);
    for (let i = 0; i < 8; i++) sto(k, 0.87, 0.075, i % 2 ? 0xc39c60 : 0xdab679, 0, 1, 0, [i * 0.8, i * 1.3, i * 0.7]);
    for (let i = 0; i < 7; i++) { const a = i * 2.4; k.add(rod([Math.cos(a) * 0.7, 1 + Math.sin(a) * 0.7, -0.25], [-Math.cos(a) * 0.7, 1 - Math.sin(a) * 0.7, 0.3], 0.045, 0.03, 5), 0xc5a572); }
    return sizeHazard(k, [2, 2, 2]);
  });
  hazard('quicksand', 'puddle', 'dunes', (r) => {
    const k = new Kit(r, true); puddleBase(k, 0x987142, (rho) => Math.floor(rho * 8) % 2 ? 0xc69a5e : 0xe1b778, 1.45, 2.95); return finish(k, 0.02);
  });
  return { THEMES };
})();
