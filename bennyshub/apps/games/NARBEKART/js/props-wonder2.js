/**
 * NARBE Racer — Wonder Cup II scenery and hazards: Coral Reef and Dino Valley.
 *
 * Every prop and hazard the two themes list, registered exactly like the
 * other kits: NK.art.props[name](rng) and NK.art.hazard[name](rng), hazards
 * also as NK.art.hazard['kind:theme']. The trench / river / tar-pit dressing
 * and the drive-through set pieces (coral_gate, coral_ring, rib_arch) are
 * registered as props too and listed in DRESSING.
 *
 * How they are built (same rules as props-wonder.js):
 *   - Scenery is vertex-painted and drawn with the ONE shared flat Lambert
 *     material (NK.art.mat.lambertV), welded to one mesh per material.
 *     Glowing accents (jellyfish, lures, lava, glow-coral) use the shared
 *     unlit vertex-colour material (NK.art.mat.basic + vertexColors).
 *   - Hazards are cel-shaded (toonV) with a dark ink hull and sized to their
 *     collision boxes (DESIGN §9.4): a block fills one lane (2.8 × ≤2.5 × 2.6),
 *     a roller is a 2 m ball (or log) centred on its rolling axis, a geyser
 *     column is 1.6 m wide and 6 m tall when active, a puddle is 3.6 × 6 m at
 *     y = 0.02. Characters look toward +Z.
 *   - Animation: root.userData.anim(t, dt) is a function (props-gaps style).
 *     Rigid movers are welded child nodes flagged userData.keep. Flocks and
 *     swaying plants are ONE kept mesh whose vertices move per group, so a
 *     whole school of fish or a kelp bed costs a single draw call. A copy
 *     that world.js freezes welds in the pose it was built in.
 *
 * Origins: on the ground (lowest point y = 0) facing -Z, except things that
 * hang in the water or sky (userData.floats: origin = body centre) and the
 * river / tar dressing (origin = the liquid surface, as noted).
 *
 * The arches (coral_gate, coral_ring, rib_arch) straddle the road with their
 * span along X: nothing is built where |x| < 12.5 and 0 ≤ y ≤ 12, so karts
 * always have a clear opening (a final pass guarantees it vertex by vertex).
 */
NK.propsWonder2 = (function () {
  'use strict';

  const A = NK.art;
  const U = NK.util;
  const TAU = Math.PI * 2;
  const HALF_PI = Math.PI / 2;

  /* ── Catalogue (the contract with themes.js and world.js) ─────────────── */
  const THEMES = {
    reef: {
      near: ['coral_branch', 'coral_fan', 'brain_coral', 'kelp', 'sea_anemone', 'giant_clam', 'starfish_rock'],
      far: ['coral_tower', 'kelp_forest', 'sunken_temple', 'fish_school'],
      landmarks: ['giant_turtle', 'treasure_galleon'],
      hazards: { block: 'clam_block', roller: 'pufferfish', geyser: 'bubble_vent', puddle: 'seagrass_patch' }
    },
    dino: {
      near: ['cycad', 'tree_fern', 'horsetail', 'egg_nest', 'mossy_boulder', 'baby_dino', 'fossil_rock'],
      far: ['volcano_smoking', 'conifer_tall', 'mesa_green', 'pterodactyl_flock'],
      landmarks: ['long_neck', 'triceratops_big'],
      hazards: { block: 'egg_block', roller: 'rolling_log', geyser: 'hot_spring', puddle: 'tar_puddle' }
    }
  };
  /** Gap dressing and drive-through set pieces: props, but not in a theme list. */
  const DRESSING = ['glow_jellyfish', 'angler_light', 'trench_coral', 'bubble_column', 'coral_gate', 'coral_ring',
    'sauropod_wading', 'river_ferns', 'tar_bubbles', 'tar_bones', 'pterodactyl', 'rib_arch'];

  /* ── Colour ──────────────────────────────────────────────────────────── */
  const _col = new THREE.Color();
  const _col2 = new THREE.Color();
  const _hsl = { h: 0, s: 0, l: 0 };

  /** A sibling of `hex`: lightness nudged by up to ±dl, hue by a hair. */
  function tone(hex, rng, dl) {
    _col.setHex(hex);
    _col.getHSL(_hsl, THREE.SRGBColorSpace);
    const h = _hsl.h + rng.range(-0.012, 0.012);
    _col.setHSL(h - Math.floor(h), _hsl.s, U.clamp(_hsl.l + rng.range(-dl, dl), 0, 1), THREE.SRGBColorSpace);
    return _col.getHex();
  }
  function pick(list, rng, dl) { return tone(rng.pick(list), rng, dl === undefined ? 0.04 : dl); }
  function shade(hex, dl) {
    _col.setHex(hex);
    _col.getHSL(_hsl, THREE.SRGBColorSpace);
    _col.setHSL(_hsl.h, _hsl.s, U.clamp(_hsl.l + dl, 0, 1), THREE.SRGBColorSpace);
    return _col.getHex();
  }
  function mixHex(a, b, t) { return _col.setHex(a).lerp(_col2.setHex(b), U.clamp(t, 0, 1)).getHex(); }

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
  /** Point a geometry built along +Y (centred) from a to b. */
  function span(geo, a, b) {
    _dir.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
    _q.setFromUnitVectors(_up, _dir);
    _p.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
    geo.applyMatrix4(_m4.compose(_p, _q, _s.set(1, 1, 1)));
    return geo;
  }
  /** Turn a geometry built along +Y to point along d, then move it to p. */
  function orient(geo, d, p) {
    _dir.set(d[0], d[1], d[2]).normalize();
    _q.setFromUnitVectors(_up, _dir);
    _p.set(p[0], p[1], p[2]);
    geo.applyMatrix4(_m4.compose(_p, _q, _s.set(1, 1, 1)));
    return geo;
  }
  const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  /** A round rod from a to b (radius r0 at a, r1 at b); `open` drops the end caps. */
  const rod = (a, b, r0, r1, seg, open) =>
    span(new THREE.CylinderGeometry(r1, r0, Math.max(1e-3, dist(a, b)), seg || 5, 1, !!open), a, b);
  /** A square bar from a to b. */
  const bar = (a, b, w, d) => span(new THREE.BoxGeometry(w, Math.max(1e-3, dist(a, b)), d === undefined ? w : d), a, b);
  const ico = (r, d) => new THREE.IcosahedronGeometry(r, d === undefined ? 1 : d);

  /** Pseudo-random -1..1 from a position, so vertices duplicated along seams agree. */
  function hash3(x, y, z, seed) {
    const h = Math.sin(Math.round(x * 997) * 0.1373 + Math.round(y * 997) * 0.2711 +
                       Math.round(z * 997) * 0.1619 + seed * 7.31) * 43758.5453;
    return (h - Math.floor(h)) * 2 - 1;
  }

  /** Push vertices in or out from the geometry's origin by up to ±amt of their distance. */
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
   * Push every vertex along its (seam-welded) normal by up to ±amt metres:
   * lumpy coral and rock on tubes and lathes built away from their origin.
   */
  function bumpN(geo, amt, seed) {
    const P = geo.attributes.position;
    geo.computeVertexNormals();
    const N = geo.attributes.normal, acc = new Map();
    const key = (i) => Math.round(P.getX(i) * 500) + ',' + Math.round(P.getY(i) * 500) + ',' + Math.round(P.getZ(i) * 500);
    for (let i = 0; i < P.count; i++) {
      const k = key(i);
      let a = acc.get(k);
      if (!a) { a = [0, 0, 0]; acc.set(k, a); }
      a[0] += N.getX(i); a[1] += N.getY(i); a[2] += N.getZ(i);
    }
    for (let i = 0; i < P.count; i++) {
      const a = acc.get(key(i)), l = Math.hypot(a[0], a[1], a[2]) || 1;
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i), d = amt * hash3(x, y, z, seed);
      P.setXYZ(i, x + a[0] / l * d, y + a[1] / l * d, z + a[2] / l * d);
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
    if (g.attributes.normal) g.deleteAttribute('normal');
    if (g.attributes.uv) g.deleteAttribute('uv');
    g.computeVertexNormals();
    return g;
  }
  /** A double-sided copy of a sheet: leaves, fronds, sails, fins. */
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
  /** Join several geometries (positions only) into one. */
  function joinGeo(list) {
    let n = 0;
    const parts = list.map((g) => { const ng = g.index ? g.toNonIndexed() : g; n += ng.attributes.position.count; return [g, ng]; });
    const pos = new Float32Array(n * 3);
    let o = 0;
    parts.forEach(([g, ng]) => { pos.set(ng.attributes.position.array, o * 3); o += ng.attributes.position.count; if (ng !== g) ng.dispose(); g.dispose(); });
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.computeVertexNormals();
    return out;
  }

  /**
   * A curved leaf (or frond, blade, petal) growing along +X and arching in
   * the XY plane: it leaves the base at elevation a0 and bends down by `curl`
   * radians over its length. Width follows a sine bulge (o.shape: lower =
   * fuller), o.serr makes alternate rows jut out (fern leaflets) and o.fold
   * raises the midrib into a shallow tent. Single-sided; see twoSided.
   */
  function leafGeo(len, wid, o) {
    o = o || {};
    const n = o.n || 8, a0 = o.a0 === undefined ? 0.6 : o.a0, curl = o.curl === undefined ? 1.2 : o.curl, pw = o.pow || 1;
    const fold = o.fold === undefined ? 0.22 : o.fold, serr = o.serr || 0, shape = o.shape || 0.6;
    const base = o.base === undefined ? 0.08 : o.base;
    const rows = [];
    let x = 0, y = 0;
    const ds = len / n;
    for (let i = 0; i <= n; i++) {
      const s = i / n;
      let w = wid * Math.pow(Math.max(0, Math.sin(Math.PI * (base + (1 - base) * s))), shape);
      if (serr && (i % 2) && i < n) w *= 1 + serr;
      rows.push([x, y, w]);
      const phi = a0 - curl * Math.pow(s + 0.5 / n, pw);
      x += Math.cos(phi) * ds; y += Math.sin(phi) * ds;
    }
    const pos = [];
    const P = (r, k) => (k === 0 ? [r[0], r[1], r[2]] : k === 1 ? [r[0], r[1] + fold * r[2], 0] : [r[0], r[1], -r[2]]);
    const tri = (p, q, s) => { pos.push(p[0], p[1], p[2], q[0], q[1], q[2], s[0], s[1], s[2]); };
    for (let i = 0; i < n; i++) {
      const a = rows[i], b = rows[i + 1];
      tri(P(a, 0), P(b, 0), P(a, 1)); tri(P(a, 1), P(b, 0), P(b, 1));
      tri(P(a, 1), P(b, 1), P(a, 2)); tri(P(a, 2), P(b, 1), P(b, 2));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return g;
  }

  /** An arc of a ring in the XY plane, centred on the bottom (smile) or top (happy eye / brow). */
  function arcGeo(R, tube, arc, top) {
    const g = new THREE.TorusGeometry(R, tube, 5, 12, arc);
    g.rotateZ((top ? HALF_PI : -HALF_PI) - arc / 2);
    return g;
  }

  /** A tube along a list of points (CatmullRom). */
  function tubeGeo(points, radius, segs, radial, closed) {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p[0], p[1], p[2])), !!closed);
    return new THREE.TubeGeometry(curve, segs || 24, radius, radial || 5, !!closed);
  }

  /**
   * A tapering tube along points: radius follows radFn(t) (t = 0..1 along
   * the curve). Ends are closed with small fans so the tube reads solid.
   */
  function taperTube(points, radFn, segs, radial) {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
    const fr = curve.computeFrenetFrames(segs, false);
    const pos = [], idx = [];
    const v = new THREE.Vector3();
    for (let i = 0; i <= segs; i++) {
      const t = i / segs, c = curve.getPointAt(t), r = Math.max(0.001, radFn(t));
      for (let j = 0; j < radial; j++) {
        const a = j / radial * TAU, cs = Math.cos(a), sn = Math.sin(a);
        v.copy(fr.normals[i]).multiplyScalar(cs * r).addScaledVector(fr.binormals[i], sn * r).add(c);
        pos.push(v.x, v.y, v.z);
      }
    }
    for (let i = 0; i < segs; i++) {
      for (let j = 0; j < radial; j++) {
        const a = i * radial + j, b = i * radial + (j + 1) % radial, c = a + radial, d = b + radial;
        idx.push(a, c, b, b, c, d);
      }
    }
    // End caps: a point at each end of the axis.
    const c0 = curve.getPointAt(0), c1 = curve.getPointAt(1), s0 = pos.length / 3;
    pos.push(c0.x, c0.y, c0.z, c1.x, c1.y, c1.z);
    const last = segs * radial;
    for (let j = 0; j < radial; j++) {
      idx.push(s0, j, (j + 1) % radial);
      idx.push(s0 + 1, last + (j + 1) % radial, last + j);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  /** A five-armed star lying in the XZ plane, domed toward +Y (starfish, crests). */
  function starGeo(R, r, h, arms) {
    const n = (arms || 5) * 2, pos = [];
    const pt = (i) => { const a = i / n * TAU + HALF_PI, rr = i % 2 ? r : R; return [Math.cos(a) * rr, i % 2 ? h * 0.15 : h * 0.08, Math.sin(a) * rr]; };
    for (let i = 0; i < n; i++) {
      const p = pt(i), q = pt((i + 1) % n);
      pos.push(0, h, 0, q[0], q[1], q[2], p[0], p[1], p[2]);
      pos.push(0, 0, 0, p[0], 0, p[2], q[0], 0, q[2]);
      pos.push(p[0], 0, p[2], p[0], p[1], p[2], q[0], q[1], q[2]);
      pos.push(p[0], 0, p[2], q[0], q[1], q[2], q[0], 0, q[2]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return g;
  }

  /** Distance along a ray to the first hit on a (placed) geometry, or -1. */
  const _ra = new THREE.Vector3(), _rb = new THREE.Vector3(), _rc = new THREE.Vector3(), _ro = new THREE.Vector3(), _rd = new THREE.Vector3();
  const _ray = new THREE.Ray(), _hit = new THREE.Vector3();
  function rayHit(geo, o, d) {
    const P = geo.attributes.position, I = geo.index;
    _ray.set(_ro.set(o[0], o[1], o[2]), _rd.set(d[0], d[1], d[2]).normalize());
    const n = I ? I.count : P.count;
    let best = -1;
    for (let i = 0; i + 2 < n; i += 3) {
      const a = I ? I.getX(i) : i, b = I ? I.getX(i + 1) : i + 1, c = I ? I.getX(i + 2) : i + 2;
      _ra.fromBufferAttribute(P, a); _rb.fromBufferAttribute(P, b); _rc.fromBufferAttribute(P, c);
      if (_ray.intersectTriangle(_ra, _rb, _rc, false, _hit)) {
        const dd = _hit.distanceTo(_ro);
        if (best < 0 || dd < best) best = dd;
      }
    }
    return best;
  }

  /* ── Kit: one prop under construction ────────────────────────────────── */
  function Kit(rng, toon) {
    this.rng = rng;
    this.mat = toon ? A.mat.toonV() : A.mat.lambertV();
    this.root = new THREE.Group();
  }
  /**
   * @param geo     a fresh geometry (consumed)
   * @param col     hex, face-colour function, or null when already painted
   * @param o       { s, r, p, order, jit, grad, y0, y1, noInk, mat }
   * @param parent  a node to hang the part on (default: the root)
   */
  Kit.prototype.add = function (geo, col, o, parent) {
    o = o || {};
    place(geo, o);
    const g = col === null ? geo : paintFaces(geo, col, this.rng, o);
    if (g.attributes.uv) g.deleteAttribute('uv');
    if (!g.attributes.normal) g.computeVertexNormals();
    const m = new THREE.Mesh(g, o.mat || this.mat);
    if (o.noInk) m.userData.noOutline = true;
    (parent || this.root).add(m);
    return m;
  };

  /** Shared materials: one lit, one unlit glow (both vertex-coloured). */
  const LIT = () => A.mat.lambertV();
  const GLOW = () => A.mat.basic(0xffffff, { vertexColors: true });

  /** Welded ink shells keep their outline flag, so tools can tell hull from body. */
  function flagInk(out) {
    out.traverse((m) => { if (m.isMesh && m.material && m.material.side === THREE.BackSide) m.userData.outline = true; });
    return out;
  }
  /** Weld a moving part to one mesh per material and flag it to survive later welds. */
  function keep(node) {
    const out = flagInk(A.mergeByMaterial(node));
    out.userData.keep = true;
    return out;
  }
  /** Ink shell from a simple closed hull that is never drawn itself. */
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
  function shiftY(kit, dy) {
    if (Math.abs(dy) > 1e-5) kit.root.children.forEach((c) => { c.position.y += dy; });
  }
  /** Sit the prop on its ground line (lowest point at `ground`) and weld it. */
  function finish(kit, ground) {
    shiftY(kit, (ground || 0) - bounds(kit.root).min.y);
    return flagInk(A.mergeByMaterial(kit.root));
  }
  /** Things that hang in the water or sky keep the origin they were built around. */
  function finishFloat(kit) {
    kit.root.userData.floats = true;
    return flagInk(A.mergeByMaterial(kit.root));
  }
  /** Keep the built origin (liquid-surface dressing, arches). */
  function finishAt(kit) { return flagInk(A.mergeByMaterial(kit.root)); }

  /* ── Animation: root.userData.anim(t, dt) is one function ─────────────── */
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

  /** Gather painted meshes from nodes into flat arrays with a group id per vertex. */
  function gather(nodes) {
    let n = 0;
    const list = [];
    nodes.forEach((node, g) => node.children.forEach((m) => {
      if (!m.isMesh) return;
      m.updateMatrix();
      const geo = m.geometry.clone().applyMatrix4(m.matrix);
      list.push([geo, g]);
      n += geo.attributes.position.count;
      m.geometry.dispose();
    }));
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), gid = new Uint16Array(n);
    let o = 0;
    list.forEach(([geo, g]) => {
      const P = geo.attributes.position, C = geo.attributes.color;
      for (let i = 0; i < P.count; i++) {
        pos[(o + i) * 3] = P.getX(i); pos[(o + i) * 3 + 1] = P.getY(i); pos[(o + i) * 3 + 2] = P.getZ(i);
        col[(o + i) * 3] = C ? C.getX(i) : 1; col[(o + i) * 3 + 1] = C ? C.getY(i) : 1; col[(o + i) * 3 + 2] = C ? C.getZ(i) : 1;
        gid[o + i] = g;
      }
      o += P.count;
      geo.dispose();
    });
    return { n, pos, col, gid };
  }
  function keptMesh(k, d, mat, margin) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(d.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(d.col, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData.keep = true;
    k.root.add(mesh);
    mesh.userData.margin = margin || 1;
    return mesh;
  }
  function settle(mesh) {
    const geo = mesh.geometry;
    geo.attributes.position.needsUpdate = true;
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    geo.boundingSphere.radius += mesh.userData.margin;
  }

  /**
   * A rig: every node in `nodes` (a Group of parts built in prop space)
   * becomes one vertex group of a single kept mesh. fn(g, t, M) sets the
   * Matrix4 M (identity on entry) that moves group g at time t.
   */
  function rig(k, nodes, mat, fn, margin) {
    const d = gather(nodes), base = d.pos.slice(), mesh = keptMesh(k, d, mat, margin);
    const M = new THREE.Matrix4(), mats = nodes.map(() => new Float32Array(16)), pos = d.pos;
    function apply(t) {
      for (let g = 0; g < nodes.length; g++) { M.identity(); fn(g, t, M); mats[g].set(M.elements); }
      for (let i = 0; i < d.n; i++) {
        const e = mats[d.gid[i]], x = base[i * 3], y = base[i * 3 + 1], z = base[i * 3 + 2];
        pos[i * 3] = e[0] * x + e[4] * y + e[8] * z + e[12];
        pos[i * 3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
        pos[i * 3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
      }
      mesh.geometry.attributes.position.needsUpdate = true;
    }
    apply(0);
    settle(mesh);
    onAnim(k, (t) => apply(t));
    return mesh;
  }
  /** Matrix helpers for rigs. */
  const _rq = new THREE.Quaternion(), _rv = new THREE.Vector3(), _rs = new THREE.Vector3(), _re = new THREE.Euler(), _rm = new THREE.Matrix4();
  /** M ← M · (translate p · rotate euler(rx, ry, rz) · scale s · translate -p). */
  function aboutPivot(M, p, rx, ry, rz, sx, sy, sz) {
    _re.set(rx || 0, ry || 0, rz || 0);
    _rq.setFromEuler(_re);
    _rm.compose(_rv.set(p[0], p[1], p[2]), _rq, _rs.set(sx === undefined ? 1 : sx, sy === undefined ? (sx === undefined ? 1 : sx) : sy, sz === undefined ? (sx === undefined ? 1 : sx) : sz));
    M.multiply(_rm);
    M.multiply(_rm.makeTranslation(-p[0], -p[1], -p[2]));
    return M;
  }

  /**
   * Swaying plants: each node is a stalk group rooted at piv = [x, y, z] and
   * `h` tall; its vertices lean by (ax, az) × s² (s = height fraction) with a
   * travelling wave, so tall kelp and ferns ripple rather than tilt stiffly.
   * params[g] = { piv, h, ax, az, w, ph, kw }.
   */
  function waver(k, nodes, mat, params, margin) {
    const d = gather(nodes), base = d.pos.slice(), mesh = keptMesh(k, d, mat, margin);
    const pos = d.pos;
    function apply(t) {
      for (let i = 0; i < d.n; i++) {
        const q = params[d.gid[i]], y = base[i * 3 + 1];
        const s = U.clamp((y - q.piv[1]) / q.h, 0, 1), f = s * s;
        const ph = q.w * t + q.ph - s * q.kw;
        pos[i * 3] = base[i * 3] + q.ax * f * Math.sin(ph);
        pos[i * 3 + 2] = base[i * 3 + 2] + q.az * f * Math.cos(ph * 0.83 + 0.7);
      }
      mesh.geometry.attributes.position.needsUpdate = true;
    }
    apply(0);
    settle(mesh);
    onAnim(k, (t) => apply(t));
    return mesh;
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
    node.children.forEach((m) => { if (m.isMesh) m.geometry.translate(-c.x, -c.y, -c.z).scale(s, s, s); });
  }

  /**
   * Geyser rig: an inked base and a separate column node that rises from
   * y = 0. setState follows props-moonlight's geyser(): hidden when idle, a
   * steady low stub while warning, full height (with a gentle surge) while
   * active — never a flashing effect.
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
   * Puddle builder: a lane-wide 3.6 × 6 m blob at y = 0.02 whose outermost
   * ring is painted dark (its ink line — a flat decal cannot carry a hull).
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

  /* ── Arch openings ───────────────────────────────────────────────────── */
  const GATE_HALF = 12.5, GATE_TOP = 12;
  /**
   * Push any vertex that strays into the drive-through box (|x| < 12.5 + m,
   * 0 < y < 12 + m) back out through the nearest wall: a last guarantee on
   * top of arches already designed with clearance.
   */
  function clearOpening(root, m) {
    const hx = GATE_HALF + m, hy = GATE_TOP + m;
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      if (!o.isMesh) return;
      const P = o.geometry.attributes.position;
      let moved = false;
      for (let i = 0; i < P.count; i++) {
        const x = P.getX(i), y = P.getY(i);
        if (Math.abs(x) >= hx || y >= hy || y <= 0) continue;
        if (hx - Math.abs(x) < hy - y) P.setX(i, Math.sign(x || 1) * hx);
        else P.setY(i, hy);
        moved = true;
      }
      if (moved) { P.needsUpdate = true; o.geometry.computeVertexNormals(); o.geometry.computeBoundingBox(); o.geometry.computeBoundingSphere(); }
    });
  }

  /* ── Small shared pieces ──────────────────────────────────────────────── */
  const INK = 0x1f1b2e;
  const WHITE = 0xffffff;

  /** A friendly eye: white, pupil and glint, looking along dz (+1 or -1 in Z). */
  function eye(k, x, y, z, s, dz, o) {
    o = o || {};
    k.add(ico(1, 1), o.white || WHITE, { s: [s * 0.78, s, s * 0.42], p: [x, y, z], mat: o.mat }, o.parent);
    const lx = (o.look || 0) * s * 0.22;
    k.add(ico(1, 1), o.pupil || INK, { s: [s * 0.46, s * 0.56, s * 0.3], p: [x + lx, y - s * 0.1, z + dz * s * 0.22], noInk: true, mat: o.mat }, o.parent);
    k.add(ico(1, 0), WHITE, { s: [s * 0.15, s * 0.15, s * 0.1], p: [x + lx + s * 0.13, y + s * 0.08, z + dz * s * 0.47], noInk: true, mat: o.mat }, o.parent);
  }
  /**
   * An eye on a side-facing head: the white bulges out along `n` (unit
   * [x, y, z]) from point p, pupil and glint in front of it.
   */
  function eyeAt(k, p, n, s, parent, o) {
    o = o || {};
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(n[0], n[1], n[2]).normalize());
    const e = new THREE.Euler().setFromQuaternion(q);
    const r = [e.x, e.y, e.z];
    const at = (d) => [p[0] + n[0] * d, p[1] + n[1] * d, p[2] + n[2] * d];
    k.add(ico(1, 1), o.white || WHITE, { s: [s * 0.8, s, s * 0.45], r, p: p, mat: o.mat }, parent);
    const pp = at(s * 0.24);
    k.add(ico(1, 1), o.pupil || INK, { s: [s * 0.5, s * 0.6, s * 0.3], r, p: [pp[0], pp[1] - s * 0.08, pp[2]], noInk: true, mat: o.mat }, parent);
    const gp = at(s * 0.46);
    k.add(ico(1, 0), WHITE, { s: [s * 0.17, s * 0.17, s * 0.1], r, p: [gp[0], gp[1] + s * 0.1, gp[2]], noInk: true, mat: o.mat }, parent);
  }

  /** A lumpy leaf/rock ball, flattened by `sq`, lighter on top. */
  function lobe(k, x, y, z, R, col, sq, lite, parent) {
    const g = lump(lite ? new THREE.DodecahedronGeometry(1, 0) : ico(1, 1), lite ? 0.1 : 0.12, k.rng.next() * 99);
    return k.add(g, col, { s: [R, R * (sq || 0.7), R], p: [x, y, z], jit: 0.07, grad: 0.45 }, parent);
  }

  /** A soft round puff (steam, smoke, foam): white on top, a tint underneath. */
  function puff(k, x, y, z, R, sq, cols, segs, parent, mat) {
    const base = y - R * (sq || 1) * 0.15;
    const sh = cols[1];
    return k.add(new THREE.SphereGeometry(1, segs || 11, segs ? Math.max(5, segs - 4) : 7), (cx, cy) => (cy < base ? sh : cols[0]),
      { s: [R, R * (sq || 1), R], p: [x, y, z], jit: 0.02, grad: 0.12, mat }, parent);
  }

  /** A sprig of leaves (two-sided) fanning from a point. */
  function sprig(k, x, y, z, n, len, wid, cols, o) {
    o = o || {};
    const r = k.rng, a0 = r.range(0, TAU);
    for (let i = 0; i < n; i++) {
      const a = a0 + i / n * TAU + r.range(-0.25, 0.25);
      const g = paintFaces(twoSided(leafGeo(len * r.range(0.85, 1.1), wid, { n: o.n || 4, a0: o.a0 || r.range(0.9, 1.3), curl: o.curl || 1.6, serr: o.serr || 0, fold: 0.15, shape: o.shape || 0.6, pow: o.pow || 1 })),
        (cx) => mixHex(cols[0], cols[1], cx / len), r, { jit: 0.05 });
      k.add(g, null, { r: [0, a, 0], order: 'YZX', p: [x, y, z], noInk: o.noInk }, o.parent);
    }
  }

  /* ════════════════════════════════════════════════════════════════════════
   * CORAL REEF — coral in every colour, sea-green kelp, pale sand, teal light
   * ════════════════════════════════════════════════════════════════════════ */
  const CORAL = [0xff6f91, 0xff8a3d, 0xb377ff, 0xffcf3a, 0xff5a6e, 0x4fd6c8];
  const KELP = [0x3fae6a, 0x4cbf6e, 0x2f9a5c, 0x5cc878];
  const KELP_TIP = 0xb4ea86;
  const STIPE = 0x6f9a3c;
  const SAND = [0xf1dca4, 0xe2c98c, 0xead39a];
  const REEFROCK = [0xb9a3b5, 0xa892a8, 0xc4aebb];
  const PEARL = 0xfff1f7;

  /** A lumpy reef rock (lilac-grey, pink coralline crust on top). */
  function reefRock(k, x, y, z, R, sq, parent) {
    const seed = k.rng.next() * 99, stone = pick(REEFROCK, k.rng, 0.03), crust = pick([0xff9fb8, 0xf58fb0, 0xe9a0d0], k.rng, 0.03);
    return k.add(lump(new THREE.DodecahedronGeometry(1, 0), 0.14, seed), (cx, cy, cz) =>
      (cy - y > R * sq * 0.35 && hash3(Math.round(cx * 2 / R), 0, Math.round(cz * 2 / R), seed) > -0.2 ? crust : stone),
    { s: [R, R * sq, R], r: [0, k.rng.range(0, TAU), 0], p: [x, y, z], jit: 0.06, grad: 0.25 }, parent);
  }

  /**
   * Staghorn coral: `n` trunks fan out from a point and fork `depth` times,
   * every joint rounded by a ball; tips are a lighter tone of the colour.
   */
  function branchCoral(k, x, y, z, sc, col, o) {
    o = o || {};
    const r = k.rng, tip = shade(col, 0.17), deep = shade(col, -0.08);
    const depth = o.depth === undefined ? 2 : o.depth, n = o.n || r.int(4, 5), a0 = r.range(0, TAU);
    const v = new THREE.Vector3(), w = new THREE.Vector3(), s = new THREE.Vector3(), nd = new THREE.Vector3();
    function grow(p, d, len, rad, lvl) {
      const q = [p[0] + d[0] * len, p[1] + d[1] * len, p[2] + d[2] * len];
      const c = lvl === 0 ? tip : mixHex(deep, col, 1 - lvl / (depth + 1));
      k.add(rod(p, q, rad, rad * 0.8, 5, true), c, { jit: 0.05 }, o.parent);
      k.add(lvl === 0 ? ico(rad, 0) : new THREE.OctahedronGeometry(rad * 0.95, 0), lvl === 0 ? tip : c, { p: q }, o.parent);
      if (lvl === 0) return;
      const m = r.chance(0.3) ? 3 : 2;
      v.set(d[0], d[1], d[2]);
      w.set(0, 1, 0).cross(v);
      if (w.lengthSq() < 1e-4) w.set(1, 0, 0);
      w.normalize();
      const b0 = r.range(0, TAU);
      const kids = [];
      for (let i = 0; i < m; i++) {
        s.copy(w).applyAxisAngle(v, b0 + i / m * TAU);
        const spread = r.range(0.45, 0.75);
        nd.copy(v).multiplyScalar(Math.cos(spread)).addScaledVector(s, Math.sin(spread));
        nd.y += 0.4;
        nd.normalize();
        kids.push([nd.x, nd.y, nd.z]);
      }
      kids.forEach((kd) => grow(q, kd, len * r.range(0.66, 0.8), rad * 0.74, lvl - 1));
    }
    for (let i = 0; i < n; i++) {
      const a = a0 + i / n * TAU + r.range(-0.3, 0.3), el = r.range(0.8, 1.2);
      grow([x, y, z], [Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el)],
        (o.len || 1.0) * sc * r.range(0.85, 1.1), (o.rad || 0.16) * sc, depth);
    }
  }

  /**
   * A sea fan: a ruffled fan-shaped lattice sheet in the XY plane (two-sided,
   * a checker of light and dark cells reads as the net) with thicker veins
   * radiating from a short stalk. Built at (x, y, z), turned by `yaw`.
   */
  function seaFan(k, x, y, z, R, col, yaw, o) {
    o = o || {};
    const r = k.rng, na = 12, nr = 6, th0 = 0.18, th1 = Math.PI - 0.18, stalk = R * 0.22;
    const light = shade(col, 0.16), dark = shade(col, -0.14), ph = r.range(0, TAU);
    const edge = blobShape(r, 0.1);
    const pt = (i, j) => {
      const th = th0 + (th1 - th0) * i / na, rr = R * (0.06 + 0.94 * j / nr) * (j === nr ? edge(th * 2) : 1 + 0.5 * (edge(th * 2) - 1) * j / nr);
      return [Math.cos(th) * rr, stalk + Math.sin(th) * rr, 0.12 * R * Math.sin(th * 4 + ph) * j / nr];
    };
    const pos = [];
    for (let i = 0; i < na; i++) {
      for (let j = 0; j < nr; j++) {
        const a = pt(i, j), b = pt(i + 1, j), c = pt(i + 1, j + 1), d = pt(i, j + 1);
        pos.push(...a, ...b, ...c, ...a, ...c, ...d);
      }
    }
    const g0 = new THREE.BufferGeometry();
    g0.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g0.computeVertexNormals();
    const g = paintFaces(twoSided(g0), (cx, cy) => {
      const th = Math.atan2(cy - stalk, cx), rr = Math.hypot(cx, cy - stalk) / R;
      const i = Math.floor((th - th0) / (th1 - th0) * na * 2), j = Math.floor(rr * nr * 2);
      return ((i + j) & 1) ? col : dark;
    }, r, { jit: 0.04 });
    const rot = { r: [o.tilt || 0, yaw, 0], order: 'YXZ', p: [x, y, z] };
    k.add(g, null, rot, o.parent);
    // Veins: a stalk and five ribs, built in fan space and turned the same way.
    const veins = [];
    veins.push(rod([0, 0, 0], [0, stalk + R * 0.06, 0], R * 0.07, R * 0.05, 5));
    for (let i = 0; i < 5; i++) {
      const th = th0 + 0.15 + (th1 - th0 - 0.3) * i / 4, ii = Math.round((th - th0) / (th1 - th0) * na);
      const pm = pt(ii, Math.round(nr * 0.45)), p1 = pt(ii, nr - 1);
      veins.push(rod([0, stalk + R * 0.04, 0], pm, R * 0.05, R * 0.035, 4, true));
      veins.push(rod(pm, [p1[0] * 0.97, stalk + (p1[1] - stalk) * 0.97, p1[2]], R * 0.035, R * 0.02, 4, true));
      if (i < 4) {
        const pf = pt(Math.min(na, ii + 1), nr - 1);
        veins.push(rod(pm, [pf[0] * 0.97, stalk + (pf[1] - stalk) * 0.97, pf[2]], R * 0.03, R * 0.018, 4, true));
      }
    }
    veins.forEach((vg) => k.add(vg, light, rot, o.parent));
  }

  /** Brain-coral dome: meandering grooves pressed into a hemisphere and painted darker. */
  function brainDome(k, x, y, z, R, sq, col, parent) {
    const seed = k.rng.range(0, 9), groove = shade(col, -0.2), ridge = shade(col, 0.05);
    const g = new THREE.SphereGeometry(1, 26, 10, 0, TAU, 0, HALF_PI * 1.04);
    const P = g.attributes.position;
    const val = (px, py, pz) => Math.sin(px * 7.5 + 1.7 * Math.sin(pz * 4.2 + seed) + 0.9 * Math.sin(py * 5 - seed));
    for (let i = 0; i < P.count; i++) {
      const px = P.getX(i), py = P.getY(i), pz = P.getZ(i), dip = Math.abs(val(px, py, pz)) < 0.4 ? 0.94 : 1;
      P.setXYZ(i, px * dip, py * dip, pz * dip);
    }
    g.computeVertexNormals();
    const pg = paintFaces(g, (cx, cy, cz) => (Math.abs(val(cx, cy, cz)) < 0.4 ? groove : (cy > 0.75 ? ridge : col)), k.rng, { jit: 0.03 });
    return k.add(pg, null, { s: [R, R * sq, R], p: [x, y, z] }, parent);
  }

  /**
   * A kelp frond: a slim stipe rising to H with blades on alternate sides and
   * gold float bladders, ending in a long tip blade. Parts go on `parent`.
   */
  function kelpFrond(k, x, z, H, o, parent) {
    o = o || {};
    const r = k.rng, lx = r.range(-0.07, 0.07) * H, lz = r.range(-0.07, 0.07) * H;
    const at = (s) => [x + lx * s * s, H * s, z + lz * s * s];
    const segs = o.segs || 3, rad = o.rad || 0.07;
    for (let i = 0; i < segs; i++) k.add(rod(at(i / segs), at((i + 1) / segs), rad * (1 - 0.5 * i / segs), rad * (1 - 0.5 * (i + 1) / segs), 4, true), STIPE, {}, parent);
    const step = o.step || 0.95, bl = o.blade || 1.9, bw = o.bw || 0.5, col = pick(KELP, r, 0.04);
    let side = r.range(0, TAU);
    const blade = (p, len, wid, a0, curl) => {
      const g = paintFaces(twoSided(leafGeo(len, wid, { n: 3, a0, curl, fold: 0.12, shape: 0.5 })), (cx) => mixHex(col, KELP_TIP, cx / len * 0.85), r, { jit: 0.05 });
      k.add(g, null, { r: [0, side, 0], order: 'YZX', p }, parent);
    };
    for (let h = step * 0.6; h < H - bl * 0.4; h += step * r.range(0.85, 1.15)) {
      const sh = h / H, p = at(sh);
      side += Math.PI + r.range(-0.6, 0.6);
      blade(p, bl * (1 - 0.3 * sh) * r.range(0.85, 1.1), bw, r.range(0.75, 1.1), 0.9);
      if (r.chance(0.45)) k.add(new THREE.OctahedronGeometry(rad * 1.6, 0), 0xd2b84a, { p: [p[0] + Math.cos(side) * rad * 2, p[1] - rad, p[2] - Math.sin(side) * rad * 2] }, parent);
    }
    side += Math.PI;
    blade(at(0.97), bl * 0.95, bw * 0.9, 1.35, 1.1);
  }

  /** A little clownfish: orange with white bands, swimming along +X. */
  function clownfish(k, x, y, z, L, yaw, parent) {
    const at = (u, v, w) => [x + Math.cos(yaw) * u + Math.sin(yaw) * w, y + v, z - Math.sin(yaw) * u + Math.cos(yaw) * w];
    k.add(ico(1, 1), (cx, cy, cz) => {
      const u = (cx - x) * Math.cos(yaw) - (cz - z) * Math.sin(yaw);
      return (Math.abs(u - L * 0.18) < L * 0.07 || Math.abs(u + L * 0.12) < L * 0.06) ? WHITE : 0xff7a1a;
    }, { s: [L * 0.5, L * 0.3, L * 0.2], r: [0, yaw, 0], p: at(0, 0, 0), jit: 0.03 }, parent);
    k.add(new THREE.OctahedronGeometry(1, 0), 0xff7a1a, { s: [L * 0.2, L * 0.22, L * 0.04], r: [0, yaw, 0], p: at(-L * 0.55, 0, 0) }, parent);
    [-1, 1].forEach((s) => k.add(ico(L * 0.06, 0), INK, { p: at(L * 0.33, L * 0.05, s * L * 0.09) }, parent));
  }

  /* ── Reef near ──────────────────────────────────────────────────────── */

  prop('coral_branch', (r) => {
    const k = new Kit(r), col = pick(CORAL, r, 0.03);
    reefRock(k, 0, 0.15, 0, 0.55, 0.55);
    branchCoral(k, 0, 0.3, 0, r.range(1.15, 1.35), col, { n: 4 });
    if (r.chance(0.7)) {
      const a = r.range(0, TAU), c2 = pick(CORAL.filter((c) => c !== col), r, 0.03);
      branchCoral(k, Math.cos(a) * 1.1, 0.05, Math.sin(a) * 1.1, 0.7, c2, { n: 3, depth: 1 });
    }
    return finish(k);
  });

  prop('coral_fan', (r) => {
    const k = new Kit(r), cols = [0xb377ff, 0xff5a6e, 0xffa53d, 0xff6fb5], c0 = r.int(0, 3);
    reefRock(k, 0, 0.12, 0.1, 0.5, 0.5);
    seaFan(k, 0, 0.15, 0, r.range(1.45, 1.6), tone(cols[c0], r, 0.03), r.range(-0.2, 0.2), { tilt: r.range(0.22, 0.36) });
    seaFan(k, r.sign() * r.range(0.6, 0.9), 0.05, 0.45, r.range(0.85, 1.0), tone(cols[(c0 + 1 + r.int(0, 2)) % 4], r, 0.03), r.range(-0.6, 0.6), { tilt: r.range(0.15, 0.3) });
    k.root.userData.faceRoad = true;
    return finish(k);
  });

  prop('brain_coral', (r) => {
    const k = new Kit(r), cols = [0xd4dc6a, 0xff9fb8, 0xffb35c, 0xc7a6ff, 0x8fe0c0], c0 = r.int(0, 4);
    const R = r.range(0.95, 1.1);
    reefRock(k, 0, 0.08, 0, R * 1.05, 0.3);
    brainDome(k, 0, 0.12, 0, R, 0.8, tone(cols[c0], r, 0.03));
    const a = r.range(0, TAU);
    brainDome(k, Math.cos(a) * R * 1.15, 0.02, Math.sin(a) * R * 1.15, R * 0.45, 0.75, tone(cols[(c0 + 2) % 5], r, 0.03));
    for (let i = 0; i < 4; i++) {
      const b = a + 1.2 + i * 0.9;
      k.add(lump(new THREE.DodecahedronGeometry(0.12, 0), 0.1, i), pick(SAND, r, 0.04), { s: [1.3, 0.6, 1.1], p: [Math.cos(b) * R * 1.12, 0.05, Math.sin(b) * R * 1.12] });
    }
    return finish(k);
  });

  prop('kelp', (r) => {
    const k = new Kit(r), n = r.int(3, 5), nodes = [], params = [];
    reefRock(k, 0, 0.25, 0, 0.75, 0.6);
    reefRock(k, r.range(0.6, 0.8), 0.12, r.range(-0.5, 0.5), 0.4, 0.6);
    for (let i = 0; i < n; i++) {
      const a = i * 2.4 + r.range(-0.3, 0.3), d = i ? r.range(0.3, 0.65) : 0.05;
      const x = Math.cos(a) * d, z = Math.sin(a) * d, H = i === 0 ? r.range(8, 9) : r.range(4.5, 8);
      const node = new THREE.Group();
      kelpFrond(k, x, z, H, {}, node);
      nodes.push(node);
      params.push({ piv: [x, 0, z], h: H, ax: 0.1 * H, az: 0.07 * H, w: r.range(0.55, 0.75), ph: r.range(0, TAU), kw: 1.8 });
    }
    waver(k, nodes, LIT(), params, 1.2);
    return finish(k);
  });

  prop('sea_anemone', (r) => {
    const k = new Kit(r), n = r.int(2, 3), nodes = [], params = [];
    const schemes = [[0xff7aa8, 0xffe0ee, 0xc4508e], [0xff9a3d, 0xfff2c4, 0xd0602a], [0xa47aff, 0xf2dcff, 0x6e4ac8], [0x5fd6a0, 0xf6ff9a, 0x2f9a70]];
    const s0 = r.int(0, 3), a0 = r.range(0, TAU);
    let mainH = 0.5;
    for (let i = 0; i < n; i++) {
      const sch = schemes[(s0 + i) % 4], R = i ? r.range(0.3, 0.38) : r.range(0.48, 0.56), h = R * r.range(0.75, 0.95);
      const a = a0 + i * 2.3, d = i ? r.range(0.6, 0.75) : 0, x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (!i) mainH = h;
      k.add(new THREE.CylinderGeometry(R * 0.86, R, h, 9, 1, true), sch[2], { p: [x, h / 2, z], jit: 0.04 });
      k.add(new THREE.CircleGeometry(R * 0.88, 9), shade(sch[2], 0.12), { r: [-HALF_PI, 0, 0], p: [x, h + 0.01, z] });
      k.add(new THREE.CircleGeometry(R * 0.2, 6), sch[1], { r: [-HALF_PI, 0, 0], p: [x, h + 0.02, z] });
      const node = new THREE.Group(), nt = i ? 10 : 14;
      for (let j = 0; j < nt; j++) {
        const inner = j % 2 === 1, ta = j / nt * TAU + r.range(-0.1, 0.1), rr = R * (inner ? 0.45 : 0.78);
        const len = R * (inner ? 0.95 : 1.1) * r.range(0.9, 1.1), out = inner ? 0.35 : 0.8, bend = inner ? 0.8 : 1.6;
        const base = [x + Math.cos(ta) * rr, h, z + Math.sin(ta) * rr];
        const step = (p, ox, oy, l) => { const L = Math.hypot(ox, oy); return [p[0] + Math.cos(ta) * ox / L * l, p[1] + oy / L * l, p[2] + Math.sin(ta) * ox / L * l]; };
        const mid = step(base, out, 1, len * 0.55), tipP = step(mid, bend, inner ? 1 : 0.35, len * 0.5);
        // Fat, soft tentacles that curl outward, round tips: wavy fingers, not spikes.
        k.add(rod(base, mid, R * 0.16, R * 0.13, 4, true), sch[0], {}, node);
        k.add(rod(mid, tipP, R * 0.13, R * 0.1, 4, true), mixHex(sch[0], sch[1], 0.4), {}, node);
        k.add(ico(R * 0.13, 0), sch[1], { p: tipP }, node);
      }
      nodes.push(node);
      params.push({ piv: [x, h, z], h: R * 1.3, ax: R * 0.14, az: R * 0.12, w: r.range(1.1, 1.5), ph: r.range(0, TAU), kw: 1.2 });
    }
    waver(k, nodes, LIT(), params, 0.3);
    clownfish(k, r.range(-0.2, 0.2), mainH + 0.95, r.range(-0.2, 0.2), 0.55, r.range(0, TAU));
    for (let i = 0; i < 3; i++) {
      const b = a0 + 1.1 + i * 1.7;
      k.add(lump(new THREE.DodecahedronGeometry(0.1, 0), 0.1, i), pick(REEFROCK, r, 0.04), { s: [1.3, 0.6, 1.1], p: [Math.cos(b) * 0.7, 0.04, Math.sin(b) * 0.7] });
    }
    return finish(k);
  });

  /**
   * One fluted clam valve in unit space: a bowl with its rim at y = 0 and
   * belly at y = -1, `ribs` broad folds whose crests wave the rim up and
   * down. `lid` mirrors it into a dome (rim at 0, crown at +1).
   */
  function clamValve(ribs, wave, lid) {
    const g = new THREE.SphereGeometry(1, ribs * 4, 6, 0, TAU, HALF_PI, HALF_PI);
    const P = g.attributes.position;
    for (let i = 0; i < P.count; i++) {
      let x = P.getX(i), y = P.getY(i), z = P.getZ(i);
      const c = Math.cos(ribs * Math.atan2(z, x)), rim = 1 + y, f = 1 + 0.07 * c * rim;
      x *= f; z *= f;
      y += wave * c * rim * rim * rim;
      P.setXYZ(i, x, y, z);
    }
    if (lid) { g.scale(1, -1, 1); return flip(g); }
    g.computeVertexNormals();
    return g;
  }
  /** Paint a valve (unit space) with light crests on its folds. */
  function paintValve(g, ribs, col, crest, rng) {
    return paintFaces(g, (cx, cy, cz) => (Math.cos(ribs * Math.atan2(cz, cx)) > 0.45 ? crest : col), rng, { jit: 0.03, grad: 0.15 });
  }

  prop('giant_clam', (r) => {
    const k = new Kit(r), ribs = 7, W = r.range(1.2, 1.3), D = W * 0.74, Hb = 0.58;
    const shells = [[0xc8a4f0, 0xf0e0ff], [0xff9fbf, 0xffe2ec], [0x8fc8f0, 0xe2f4ff]], sc = shells[r.int(0, 2)];
    const col = tone(sc[0], r, 0.03), crest = sc[1];
    const bottom = paintValve(clamValve(ribs, 0.09, false), ribs, col, crest, r);
    k.add(bottom, null, { s: [W, Hb, D], p: [0, Hb, 0] });
    const open = r.range(0.8, 0.95);
    const lidG = paintValve(clamValve(ribs, 0.09, true), ribs, col, crest, r);
    lidG.scale(W, Hb * 0.95, D).translate(0, 0, -D).rotateX(open).translate(0, Hb, D);
    k.add(lidG, null);
    const lining = paintFaces(flip(clamValve(ribs, 0.09, true)), 0xffe8f0, r, { jit: 0.02 });
    lining.scale(W * 0.95, Hb * 0.86, D * 0.95).translate(0, 0, -D * 0.95).rotateX(open).translate(0, Hb + 0.01, D * 0.97);
    k.add(lining, null);
    // The mantle: a wavy, vivid blue-green disc filling the lower valve.
    const mantle = [0x2f7fe0, 0x29b3c8, 0x5f6fe8][r.int(0, 2)], spot = 0x9ff4ff;
    const wav = (a) => 1 + 0.06 * Math.cos(ribs * a);
    const mg = paintFaces(disc([0.35, 0.6, 0.82, 0.94], 28, wav), (cx, cy, cz) => {
      const rr = Math.hypot(cx, cz);
      return rr > 0.86 ? shade(mantle, 0.12) : (hash3(Math.round(cx * 7), 0, Math.round(cz * 7), 3) > 0.45 ? spot : mantle);
    }, r, { jit: 0.03 });
    k.add(mg, null, { s: [W, 1, D], p: [0, Hb + 0.02, 0] });
    k.add(ico(1, 1), PEARL, { s: 0.3, p: [0, Hb + 0.3, -D * 0.12], grad: 0.25 });
    k.add(ico(0.07, 0), WHITE, { p: [0.12, Hb + 0.46, -D * 0.12 - 0.17] });
    for (let i = 0; i < 3; i++) {
      const b = r.range(0, TAU);
      k.add(lump(new THREE.DodecahedronGeometry(0.13, 0), 0.1, i), pick(SAND, r, 0.04), { s: [1.4, 0.6, 1.1], p: [Math.cos(b) * W * 1.15, 0.05, Math.sin(b) * D * 1.2] });
    }
    k.root.userData.faceRoad = true;
    return finish(k);
  });

  /** A five-armed starfish lying on a surface with normal n at point p. */
  function starfish(k, p, n, R, col, parent) {
    const g = starGeo(R, R * 0.36, R * 0.24, 5);
    g.rotateY(k.rng.range(0, TAU));
    const dot = shade(col, 0.2);
    const pg = paintFaces(g, (cx, cy, cz) => (cy > R * 0.2 ? dot : col), k.rng, { jit: 0.04 });
    k.add(orient(pg, n, p), null, {}, parent);
  }

  prop('starfish_rock', (r) => {
    const k = new Kit(r), sx = r.range(1.0, 1.15), sy = r.range(0.7, 0.85), sz = r.range(0.85, 0.95), seed = r.next() * 99;
    const stone = pick(REEFROCK, r, 0.03), crust = pick([0xff9fb8, 0xf2a0d4], r, 0.03);
    const rock = lump(ico(1, 2), 0.1, seed);
    place(rock, { s: [sx, sy, sz], p: [0, sy * 0.8, 0] });
    const rockMesh = k.add(rock, (cx, cy, cz) => (cy > sy * 1.25 && hash3(Math.round(cx * 2.5), 0, Math.round(cz * 2.5), seed) > 0 ? crust : stone), { jit: 0.06, grad: 0.25 });
    const cols = [0xff7a1a, 0xff4f6e, 0xb377ff, 0xffc93a];
    const c0 = r.int(0, 3), spots = [[-0.35, 0.45, -1], [0.55, 0.85, -0.6], [0.1, 1.0, 0.5]];
    const nStar = r.int(2, 3);
    for (let i = 0; i < nStar; i++) {
      const d = spots[i], L = Math.hypot(d[0], d[1], d[2]);
      const o = [d[0] / L * 4, sy * 0.8 + d[1] / L * 4, d[2] / L * 4];
      const t = rayHit(rockMesh.geometry, o, [-d[0], -d[1], -d[2]]);
      if (t < 0) continue;
      const hp = [o[0] - d[0] / L * t, o[1] - d[1] / L * t, o[2] - d[2] / L * t];
      const nn = [hp[0] / (sx * sx), (hp[1] - sy * 0.8) / (sy * sy), hp[2] / (sz * sz)];
      starfish(k, hp, nn, r.range(0.3, 0.38), cols[(c0 + i) % 4]);
    }
    // Shells on the sand: a scallop and a spiral conch.
    const a = r.range(-0.6, 0.6) - HALF_PI;
    const scallop = paintFaces(clamValve(5, 0.0, true), (cx, cy, cz) => (Math.cos(5 * Math.atan2(cz, cx)) > 0.3 ? 0xffe2c8 : 0xff9f7a), r, {});
    k.add(scallop, null, { s: [0.22, 0.12, 0.2], r: [0, r.range(0, TAU), 0], p: [Math.cos(a) * 1.3, 0, Math.sin(a) * 1.25] });
    const b = a + r.sign() * 0.7;
    k.add(new THREE.ConeGeometry(0.13, 0.42, 7, 3), (cx, cy, cz, f) => ((f >> 3) & 1 ? 0xfff0dc : 0xf2b38a), { r: [0, 0, HALF_PI + 0.2], p: [Math.cos(b) * 1.35, 0.12, Math.sin(b) * 1.3] });
    k.add(new THREE.CircleGeometry(0.12, 8), 0xffb0b8, { r: [0, -HALF_PI, 0], p: [Math.cos(b) * 1.35 + 0.2, 0.1, Math.sin(b) * 1.3] });
    starfish(k, [Math.cos(a + 1.3) * 1.25, 0.01, Math.sin(a + 1.3) * 1.2], [0, 1, 0], 0.26, cols[(c0 + 2) % 4]);
    return finish(k);
  });

  /* ── Reef far ───────────────────────────────────────────────────────── */

  /** Radius of a lathe profile [[r, h], …] (bottom to top, normalised) at height fraction h. */
  function profRad(prof, h) {
    for (let i = 1; i < prof.length; i++) {
      const a = prof[i - 1], b = prof[i];
      if (h <= b[1]) return a[0] + (b[0] - a[0]) * (h - a[1]) / ((b[1] - a[1]) || 1);
    }
    return prof[prof.length - 1][0];
  }

  /** A table coral: a flat plate on a short stalk, lighter on top and at the rim. */
  function plateCoral(k, x, y, z, R, col, tilt, yaw, parent) {
    const top = shade(col, 0.12);
    k.add(new THREE.CylinderGeometry(R, R * 0.82, R * 0.22, 10, 1), (cx, cy) => (cy > y ? top : col), { r: [tilt, yaw, 0], order: 'YXZ', p: [x, y, z], jit: 0.04 }, parent);
    k.add(new THREE.CylinderGeometry(R * 0.18, R * 0.3, R * 0.6, 5, 1, true), shade(col, -0.1), { p: [x, y - R * 0.38, z] }, parent);
  }

  prop('coral_tower', (r) => {
    const k = new Kit(r), H = r.range(22, 28), R0 = r.range(8, 9.5), seed = r.next() * 99;
    const prof = [[1, 0], [0.9, 0.06], [0.66, 0.14], [0.5, 0.24], [0.44, 0.36], [0.5, 0.46], [0.38, 0.58], [0.32, 0.7], [0.37, 0.8], [0.26, 0.9], [0.12, 0.97], [0, 1]];
    const g = bumpN(new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x * R0, y * H)), 12), 0.7, seed);
    const bands = [0xff7fa0, 0xff9a52, 0xc08cff, 0xff6a7a, 0xffb48a, 0xe58fd8];
    const b0 = r.int(0, 5);
    k.add(g, (cx, cy, cz) => {
      const band = Math.floor(cy / 3.4 + 0.6 * hash3(Math.round(cx / 4), 0, Math.round(cz / 4), seed));
      return cy < 1.2 ? 0xd9c08f : bands[(b0 + band) % bands.length];
    }, { jit: 0.06, grad: 0.2 });
    // Table corals jut out on every side, brain domes and staghorn sit on them.
    const plates = [0xffd23f, 0x7fe0a0, 0x4fd6c8, 0xffa53d, 0xb8f05a];
    const np = r.int(5, 6), a0 = r.range(0, TAU);
    for (let i = 0; i < np; i++) {
      const h = 0.18 + 0.68 * i / (np - 1) + r.range(-0.03, 0.03), a = a0 + i * 2.2, R = r.range(2.4, 3.4) * (1.1 - 0.4 * h);
      const d = profRad(prof, h) * R0 + R * 0.55, x = Math.cos(a) * d, z = Math.sin(a) * d;
      plateCoral(k, x, h * H, z, R, tone(plates[(i + b0) % plates.length], r, 0.03), r.range(-0.1, 0.1), r.range(0, TAU));
      if (i % 2 === 0) brainDomeLite(k, x + Math.cos(a) * R * 0.2, h * H + R * 0.1, z + Math.sin(a) * R * 0.2, R * 0.5, tone(r.pick([0xff9fb8, 0xd4dc6a, 0xc7a6ff]), r, 0.03));
      else branchCoral(k, x, h * H + R * 0.1, z, R * 0.55, tone(r.pick(CORAL), r, 0.03), { n: 3, depth: 1, len: 1.2 });
    }
    branchCoral(k, 0, H * 0.96, 0, 2.6, tone(r.pick(CORAL), r, 0.03), { n: 5, depth: 1, len: 1.1 });
    const fa = a0 + r.range(0.8, 1.4), fd = profRad(prof, 0.3) * R0;
    seaFan(k, Math.cos(fa) * fd, 0.25 * H, Math.sin(fa) * fd, 4.2, tone(0xb377ff, r, 0.03), -fa + HALF_PI, { tilt: 0.2 });
    for (let i = 0; i < 5; i++) {
      const a = r.range(0, TAU);
      reefRock(k, Math.cos(a) * R0 * 0.95, 0.4, Math.sin(a) * R0 * 0.95, r.range(1.2, 2.0), 0.6);
    }
    k.root.userData.embed = true;
    return finish(k);
  });

  /** A low-detail brain dome for far props (pattern only, no pressed grooves). */
  function brainDomeLite(k, x, y, z, R, col, parent) {
    const groove = shade(col, -0.2), seed = k.rng.range(0, 9);
    const val = (px, py, pz) => Math.sin(px * 6 + 1.7 * Math.sin(pz * 4 + seed));
    const g = paintFaces(new THREE.SphereGeometry(1, 14, 6, 0, TAU, 0, HALF_PI), (cx, cy, cz) => (Math.abs(val(cx, cy, cz)) < 0.45 ? groove : col), k.rng, { jit: 0.03 });
    return k.add(g, null, { s: [R, R * 0.8, R], p: [x, y, z] }, parent);
  }

  prop('kelp_forest', (r) => {
    const k = new Kit(r), n = r.int(9, 10), nodes = [], params = [];
    for (let i = 0; i < n; i++) {
      const a = i * 2.4 + r.range(-0.3, 0.3), d = Math.sqrt((i + 0.4) / n) * r.range(5.5, 7.5);
      const x = Math.cos(a) * d, z = Math.sin(a) * d, H = (i === 0 ? 25 : r.range(15, 24)) * (1 - 0.15 * d / 7);
      const node = new THREE.Group();
      kelpFrond(k, x, z, H, { step: 2.3, blade: 3.8, bw: 1.0, rad: 0.18, segs: 4 }, node);
      nodes.push(node);
      params.push({ piv: [x, 0, z], h: H, ax: 0.06 * H, az: 0.045 * H, w: r.range(0.35, 0.5), ph: r.range(0, TAU), kw: 2.2 });
    }
    waver(k, nodes, LIT(), params, 2);
    for (let i = 0; i < 4; i++) {
      const a = r.range(0, TAU), d = r.range(1, 6);
      reefRock(k, Math.cos(a) * d, 0.3, Math.sin(a) * d, r.range(0.9, 1.7), 0.6);
    }
    return finish(k);
  });

  const TEMPLE = [0xcfd9d2, 0xbfcdca, 0xd9ddcf];
  const SEAMOSS = [0x6fb05a, 0x5aa24c, 0x84bf5e];

  /** A fluted column with base and capital; `broken` snaps it off with a jagged stub. */
  function column(k, x, y, z, h, rad, stone, moss, broken, parent) {
    const dark = shade(stone, -0.1), seed = k.rng.next() * 99;
    k.add(new THREE.BoxGeometry(rad * 2.5, rad * 0.55, rad * 2.5), (cx, cy) => (cy > y + rad * 0.5 ? moss : dark), { p: [x, y + rad * 0.27, z], jit: 0.04 }, parent);
    const ch = broken ? h * k.rng.range(0.3, 0.7) : h;
    k.add(new THREE.CylinderGeometry(rad, rad * 1.08, ch, 10, 1, true), (cx, cy, cz) => {
      const f = Math.floor((Math.atan2(cz - z, cx - x) / TAU + 1) * 20) & 1;
      return (cy > y + ch * 0.75 && hash3(Math.round(cx), Math.round(cy), Math.round(cz), seed) > 0.4) ? moss : (f ? stone : dark);
    }, { p: [x, y + rad * 0.55 + ch / 2, z], jit: 0.03 }, parent);
    const top = y + rad * 0.55 + ch;
    if (broken) {
      k.add(new THREE.CylinderGeometry(rad * 0.5, rad, rad * 1.1, 6, 1), stone, { r: [k.rng.range(-0.3, 0.3), 0, k.rng.range(-0.3, 0.3)], p: [x, top + rad * 0.3, z], jit: 0.05 }, parent);
      k.add(new THREE.CircleGeometry(rad * 0.98, 10), moss, { r: [-HALF_PI, 0, 0], p: [x, top - 0.02, z] }, parent);
      return top;
    }
    k.add(new THREE.CylinderGeometry(rad * 1.35, rad, rad * 0.5, 10, 1), stone, { p: [x, top + rad * 0.25, z] }, parent);
    k.add(new THREE.BoxGeometry(rad * 2.7, rad * 0.45, rad * 2.7), (cx, cy) => (cy > top + rad * 0.9 ? moss : stone), { p: [x, top + rad * 0.72, z], jit: 0.04 }, parent);
    return top + rad * 0.95;
  }

  prop('sunken_temple', (r) => {
    const k = new Kit(r), stone = pick(TEMPLE, r, 0.03), dark = shade(stone, -0.1), moss = pick(SEAMOSS, r, 0.03), seed = r.next() * 99;
    const W = 22, D = 13, rad = 0.85, colH = 10.5;
    for (let i = 0; i < 3; i++) {
      const top = 0.8 * (i + 1);
      k.add(new THREE.BoxGeometry(W + 4 - i * 2, 0.8, D + 4 - i * 2), (cx, cy, cz) =>
        (cy > top - 0.05 && hash3(Math.round(cx / 2), i, Math.round(cz / 2), seed) > 0.25 ? moss : (i % 2 ? stone : dark)), { p: [0, top - 0.4, 0], jit: 0.04 });
    }
    const base = 2.4, xs = [-9, -5.4, -1.8, 1.8, 5.4, 9];
    // Front row: the left three still carry a piece of the beam and pediment.
    const broken = [false, false, false, r.chance(0.5), true, r.chance(0.3)];
    let capTop = base;
    xs.forEach((x, i) => { const t = column(k, x, base, -D / 2 + 1.6, colH, rad, stone, moss, broken[i]); if (i === 0) capTop = t; });
    xs.forEach((x, i) => { if (i !== 2 && i !== 4) column(k, x, base, D / 2 - 1.6, colH, rad, stone, moss, i % 3 === 1 || r.chance(0.35)); });
    // The cella wall behind, crumbling at the top, with a dark doorway.
    for (let i = 0; i < 7; i++) {
      const x = -7.5 + i * 2.5, h = (i === 3 ? 7.5 : r.range(4, 8));
      if (i === 3) {
        k.add(new THREE.BoxGeometry(2.5, 7.5 - 4.6, 1.4), stone, { p: [x, base + 4.6 + (7.5 - 4.6) / 2, 2.6], jit: 0.03 });
        k.add(new THREE.BoxGeometry(2.4, 4.6, 0.4), 0x1d4a5e, { p: [x, base + 2.3, 2.0] });
        continue;
      }
      k.add(new THREE.BoxGeometry(2.5, h, 1.4), (cx, cy) => (cy > base + h - 0.6 ? moss : (Math.floor(cy) % 2 ? stone : dark)), { p: [x, base + h / 2, 2.6], jit: 0.03 });
    }
    // Beam and half a pediment over the left columns.
    const bx0 = xs[0] - 1.2, bx1 = xs[2] + 1.2, bw = bx1 - bx0, bz = -D / 2 + 1.6;
    k.add(new THREE.BoxGeometry(bw, 1.3, 2.4), (cx, cy) => (cy > capTop + 1.2 ? moss : stone), { p: [(bx0 + bx1) / 2, capTop + 0.65, bz], jit: 0.03 });
    k.add(new THREE.BoxGeometry(bw + 0.3, 0.3, 2.6), dark, { p: [(bx0 + bx1) / 2, capTop + 1.45, bz] });
    const ped = new THREE.CylinderGeometry(1, 1, 2.2, 3, 1).rotateX(HALF_PI).rotateZ(Math.PI);
    k.add(ped, (cx, cy) => (cy > capTop + 4 ? moss : stone), { s: [bw / 1.732 * 0.98, 3.4 / 1.5, 1], p: [(bx0 + bx1) / 2, capTop + 1.6 + 3.4 / 3, bz], jit: 0.03 });
    // Fallen drums and a block in the sand in front.
    for (let i = 0; i < 2; i++) {
      const x = r.range(-4, 6) + i * 4, z = -D / 2 - 3.5 - r.range(0, 2);
      k.add(new THREE.CylinderGeometry(rad, rad, 2.2, 10, 1), (cx, cy) => (cy > rad * 1.5 ? moss : stone), { r: [0, r.range(0, TAU), HALF_PI], order: 'YZX', p: [x, rad, z], jit: 0.04 });
    }
    // Life on the ruins: corals, a fan, kelp swaying beside the steps.
    branchCoral(k, -5, capTop + 1.6, bz, 1.2, tone(0xff6f91, r, 0.03), { n: 4, depth: 1, len: 1.2 });
    brainDomeLite(k, xs[4], base + 0.6 + colH * 0.5, -D / 2 + 1.6, 1.0, tone(0xffb35c, r, 0.03));
    seaFan(k, W / 2 - 0.5, 2.4, -2, 2.6, tone(0xb377ff, r, 0.03), -0.4, { tilt: 0.25 });
    plateCoral(k, -W / 2 + 0.5, 2.6, 3, 1.8, tone(0xffd23f, r, 0.03), 0.1, 0);
    starfish(k, [xs[1], base + 3.2, -D / 2 + 1.6 - rad * 1.02], [0, 0, -1], 0.6, 0xff7a1a);
    const nodes = [], params = [];
    [[-W / 2 - 1.5, -3], [W / 2 + 1.5, 4], [-W / 2 - 2.2, 4]].forEach(([x, z]) => {
      const node = new THREE.Group(), H = r.range(10, 14);
      kelpFrond(k, x, z, H, { step: 1.8, blade: 3.0, bw: 0.8, rad: 0.14 }, node);
      nodes.push(node);
      params.push({ piv: [x, 0, z], h: H, ax: 0.07 * H, az: 0.05 * H, w: r.range(0.4, 0.6), ph: r.range(0, TAU), kw: 2 });
    });
    waver(k, nodes, LIT(), params, 1.5);
    k.root.userData.faceRoad = true;
    return finish(k);
  });

  /** A small bright fish (nose along +Z, then turned by yaw) at point p. */
  function fishAt(k, p, yaw, L, body, fin, parent) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const at = (u, v, w) => [p[0] + u * c + w * s, p[1] + v, p[2] - u * s + w * c];
    k.add(new THREE.OctahedronGeometry(1, 0), body, { s: [L * 0.16, L * 0.3, L * 0.5], r: [0, yaw, 0], p: at(0, 0, 0) }, parent);
    k.add(new THREE.OctahedronGeometry(1, 0), fin, { s: [L * 0.03, L * 0.24, L * 0.2], r: [0, yaw, 0], p: at(0, 0, -L * 0.58) }, parent);
    [-1, 1].forEach((sd) => k.add(new THREE.OctahedronGeometry(L * 0.055, 0), INK, { p: at(sd * L * 0.1, L * 0.06, L * 0.28) }, parent));
  }

  prop('fish_school', (r) => {
    const k = new Kit(r);
    const kinds = [[0xffd23f, 0xffa51f], [0x3f86ec, 0xffd23f], [0xff7a1a, 0xffffff], [0xff6fb5, 0x8a5cff]];
    const k0 = r.int(0, 3), rings = [[5.6, 0, 17], [4.0, 1.7, 13], [6.6, -1.6, 15]], nodes = [], spin = [];
    rings.forEach(([R, y, n], g) => {
      const node = new THREE.Group(), kind = kinds[(k0 + g) % kinds.length], dir = 1;
      for (let i = 0; i < n; i++) {
        const a = i / n * TAU + r.range(-0.12, 0.12), rr = R + r.range(-0.8, 0.8), yy = y + 0.7 * Math.sin(a * 3 + g) + r.range(-0.4, 0.4);
        fishAt(k, [Math.cos(a) * rr, yy, -Math.sin(a) * rr], a + Math.PI, r.range(0.95, 1.2), tone(kind[0], r, 0.04), kind[1], node);
      }
      nodes.push(node);
      spin.push({ w: dir * r.range(0.35, 0.5) * (g === 1 ? 1.2 : 1), tilt: r.range(-0.15, 0.15), ph: r.range(0, TAU) });
    });
    rig(k, nodes, LIT(), (g, t, M) => {
      const q = spin[g];
      M.makeTranslation(0, 0.5 * Math.sin(0.6 * t + q.ph), 0);
      aboutPivot(M, [0, 0, 0], q.tilt, q.w * t, 0);
    }, 8);
    return finishFloat(k);
  });

  /* ── Reef landmarks ─────────────────────────────────────────────────── */

  /** A friendly sea turtle, head toward -Z, built around the shell centre. Returns its rig groups. */
  function seaTurtle(k, S, cols, groups) {
    const body = groups[0], shell = cols.shell, scute = cols.scute, skin = cols.skin, belly = 0xf3e3a0;
    const a = 8.5 * S, b = 4.6 * S, c = 10.5 * S;
    k.add(new THREE.SphereGeometry(1, 18, 7, 0, TAU, 0, HALF_PI), shell, { s: [a, b, c], jit: 0.04 }, body);
    k.add(new THREE.SphereGeometry(1, 14, 4, 0, TAU, HALF_PI, HALF_PI), belly, { s: [a * 0.94, 1.7 * S, c * 0.95], jit: 0.03 }, body);
    k.add(new THREE.TorusGeometry(1, 0.09, 4, 28), shade(scute, -0.1), { s: [a * 1.01, c * 1.01, 7 * S], r: [HALF_PI, 0, 0], p: [0, 0.1 * S, 0] }, body);
    const surf = (u, v) => {
      const x = u * a, z = v * c, y = b * Math.sqrt(Math.max(0, 1 - u * u - v * v));
      const n = new THREE.Vector3(x / (a * a), y / (b * b), z / (c * c)).normalize();
      return { p: [x, y, z], n: [n.x, n.y, n.z] };
    };
    const plates = [[0, -0.56, 1], [0, -0.28, 1], [0, 0, 1], [0, 0.28, 1], [0, 0.55, 0.9]];
    [-1, 1].forEach((s) => [-0.42, -0.14, 0.14, 0.42].forEach((v) => plates.push([s * 0.5, v * 0.95, 0.9])));
    plates.forEach(([u, v, sz]) => {
      const q = surf(u, v), g = place(ico(1, 1), { s: [2.3 * S * sz, 0.32 * S, 2.5 * S * sz] });
      k.add(orient(g, q.n, q.p), (cx, cy, cz) => tone(scute, k.rng, 0.03), { jit: 0.04 }, body);
    });
    // Neck and a big round head with happy eyes, a smile and rosy cheeks.
    const hz = -c - 2.8 * S, hy = 0.7 * S, hr = [2.4 * S, 2.1 * S, 2.9 * S];
    k.add(rod([0, -0.2 * S, -c + 2 * S], [0, 0.4 * S, hz + 1.5 * S], 1.9 * S, 1.7 * S, 8), skin, { jit: 0.04 }, body);
    k.add(ico(1, 2), (cx, cy, cz) => (hash3(Math.round(cx / S * 1.5), Math.round(cy / S * 1.5), Math.round(cz / S * 1.5), 4) > 0.55 ? shade(skin, 0.1) : skin), { s: hr, p: [0, hy, hz], jit: 0.03 }, body);
    [-1, 1].forEach((s) => {
      const d = new THREE.Vector3(s * 0.62, 0.45, -0.64), t = 1 / Math.sqrt((d.x / hr[0]) ** 2 + (d.y / hr[1]) ** 2 + (d.z / hr[2]) ** 2);
      const p = [d.x * t, hy + d.y * t, hz + d.z * t], n = new THREE.Vector3(p[0] / hr[0] ** 2, (p[1] - hy) / hr[1] ** 2, (p[2] - hz) / hr[2] ** 2).normalize();
      eyeAt(k, p, [n.x, n.y, n.z], 0.95 * S, body);
      const d2 = new THREE.Vector3(s * 0.75, -0.15, -0.6), t2 = 1 / Math.sqrt((d2.x / hr[0]) ** 2 + (d2.y / hr[1]) ** 2 + (d2.z / hr[2]) ** 2);
      k.add(ico(1, 1), 0xff9fb0, { s: [0.5 * S, 0.32 * S, 0.5 * S], p: [d2.x * t2 * 0.97, hy + d2.y * t2 * 0.97, hz + d2.z * t2 * 0.97] }, body);
    });
    const sm = [];
    for (let i = 0; i <= 8; i++) {
      const u = i / 8 * 2 - 1, x = 1.1 * S * u, y = hy - 0.55 * S - 0.35 * S * (1 - u * u);
      const zz = 1 - (x / hr[0]) ** 2 - ((y - hy) / hr[1]) ** 2;
      sm.push([x, y, hz - hr[2] * Math.sqrt(Math.max(0, zz)) * 0.99]);
    }
    k.add(tubeGeo(sm, 0.13 * S, 14, 4), 0x2d4a3a, {}, body);
    k.add(new THREE.ConeGeometry(0.8 * S, 2.4 * S, 6), skin, { r: [HALF_PI, 0, 0], p: [0, 0, c + 0.8 * S] }, body);
    // Flippers: long front paddles and short rear ones, spotted.
    const fl = [[1, 7.0, -5.8, 6.2, 1.9, 0.42], [-1, 7.0, -5.8, 6.2, 1.9, 0.42], [1, 6.0, 7.4, 3.0, 1.6, 0.6], [-1, 6.0, 7.4, 3.0, 1.6, 0.6]];
    const piv = [];
    fl.forEach(([s, px, pz, len, wid, yaw], i) => {
      const node = groups[1 + i], dir = [Math.cos(yaw), 0, -Math.sin(-yaw)];
      const cx = s * (px * S + dir[0] * len * S * 0.5), cz = pz * S + dir[2] * len * S * 0.5;
      k.add(ico(1, 1), (x, y) => (y > -0.5 * S ? skin : shade(skin, 0.12)), { s: [len * S * 0.55, 0.45 * S, wid * S * 0.5], r: [0, -s * yaw, s * -0.12], p: [cx, -0.6 * S, cz], jit: 0.03 }, node);
      for (let j = 0; j < 2; j++) k.add(ico(1, 0), shade(skin, 0.14), { s: [0.5 * S, 0.12 * S, 0.4 * S], p: [cx + s * (j - 0.3) * len * S * 0.25, -0.3 * S, cz + (j - 0.5) * 0.4 * S] }, node);
      piv.push([s * px * S, -0.5 * S, pz * S]);
    });
    return piv;
  }

  prop('giant_turtle', (r) => {
    const k = new Kit(r), S = 1.15;
    const palettes = [{ shell: 0x3f8f6a, scute: 0x86c66a, skin: 0x8fd0b8 }, { shell: 0x7a5a36, scute: 0xd0a860, skin: 0x9fd6a0 }, { shell: 0x2f7f8a, scute: 0x6fc8b0, skin: 0xa8dcc0 }];
    const cols = palettes[r.int(0, 2)];
    const groups = [0, 1, 2, 3, 4].map(() => new THREE.Group());
    const piv = seaTurtle(k, S, cols, groups);
    // A baby turtle hitching a ride on the shell.
    const bb = groups[0], by = 4.6 * S + 0.45 * S, bz = 1.5 * S, bs = 0.24;
    k.add(new THREE.SphereGeometry(1, 10, 4, 0, TAU, 0, HALF_PI), cols.scute, { s: [8.5 * bs, 4.6 * bs, 10.5 * bs], p: [1.0, by + 0.1, bz], jit: 0.04 }, bb);
    k.add(ico(1, 1), cols.skin, { s: [0.75, 0.65, 0.85], p: [1.0, by + 0.45, bz - 10.5 * bs - 0.6] }, bb);
    [-1, 1].forEach((s) => {
      eye(k, 1.0 + s * 0.33, by + 0.65, bz - 10.5 * bs - 1.25, 0.28, -1, { parent: bb });
      k.add(ico(1, 0), cols.skin, { s: [0.9, 0.15, 0.35], r: [0, s * 0.5, 0], p: [1.0 + s * 1.9, by - 0.1, bz - 1.1] }, bb);
    });
    const ph = r.range(0, TAU);
    rig(k, groups, LIT(), (g, t, M) => {
      const w = 0.9 * t + ph, bobY = 0.45 * Math.sin(w + 1.2);
      M.makeTranslation(0, bobY, 0);
      if (g === 0) return;
      const s = g % 2 ? 1 : -1, front = g < 3;
      if (front) aboutPivot(M, piv[g - 1], 0, -s * 0.22 * Math.cos(w), s * 0.38 * Math.sin(w));
      else aboutPivot(M, piv[g - 1], 0, s * 0.2 * Math.sin(w + 1), 0);
    }, 3);
    k.root.userData.faceRoad = true;
    return finishFloat(k);
  });

  /**
   * Loft closed cross-sections (lists of [x, y, z], all the same length, wound
   * the same way) into a skin; each end is closed with a fan.
   */
  function loft(secs) {
    const pos = [], n = secs[0].length;
    const tri = (a, b, c) => pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    for (let i = 0; i + 1 < secs.length; i++) {
      const A = secs[i], B = secs[i + 1];
      for (let j = 0; j < n; j++) {
        const j1 = (j + 1) % n;
        tri(A[j], B[j], B[j1]); tri(A[j], B[j1], A[j1]);
      }
    }
    [[secs[0], true], [secs[secs.length - 1], false]].forEach(([S, first]) => {
      const c = [0, 0, 0];
      S.forEach((p) => { c[0] += p[0] / n; c[1] += p[1] / n; c[2] += p[2] / n; });
      for (let j = 0; j < n; j++) { const j1 = (j + 1) % n; if (first) tri(c, S[j1], S[j]); else tri(c, S[j], S[j1]); }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return g;
  }

  /** A tattered sail: a billowing cloth grid in the XY plane, ragged along the bottom. */
  function sailGeo(w, h, rng) {
    const nx = 4, ny = 4, pos = [], P = [];
    for (let j = 0; j <= ny; j++) {
      P.push([]);
      for (let i = 0; i <= nx; i++) {
        const u = i / nx, v = j / ny, rag = j === 0 ? rng.range(0, 0.3) * h : 0;
        P[j].push([(u - 0.5) * w, -h * (1 - v) + rag, 0.18 * w * Math.sin(Math.PI * u) * Math.sin(Math.PI * (0.3 + 0.7 * v))]);
      }
    }
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        if (j === 0 && rng.chance(0.25)) continue;
        const a = P[j][i], b = P[j][i + 1], c = P[j + 1][i + 1], d = P[j + 1][i];
        pos.push(...a, ...b, ...c, ...a, ...c, ...d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    return twoSided(g);
  }

  prop('treasure_galleon', (r) => {
    const k = new Kit(r), L = 30, Bm = 5.2, Dm = 7;
    const ship = new THREE.Group();
    ship.rotation.set(-0.24, 0, -0.05);
    ship.position.set(0, 1.4, 1.5);
    k.root.add(ship);
    const wood = pick([0x8a5a36, 0x94603a], r, 0.02), plank = shade(wood, -0.08), gold = 0xf2b632, deck = 0xc89a64;
    const beam = (t) => Bm * (t < 0.4 ? 0.72 + 0.28 * Math.sin(HALF_PI * t / 0.4) : Math.max(0.05, Math.cos(HALF_PI * Math.pow((t - 0.4) / 0.6, 1.4))));
    const deckY = (t) => Dm * (1 + 0.5 * (t - 0.42) * (t - 0.42));
    const keelY = (t) => (t > 0.78 ? Dm * 0.85 * Math.pow((t - 0.78) / 0.22, 2) : 0);
    const secs = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12, x = -L / 2 + t * L, b = beam(t), yd = deckY(t), y0 = Math.min(keelY(t), yd - 0.6), dy = yd - y0;
      const side = [[yd, b], [yd - 0.3 * dy, b * 1.03], [y0 + 0.4 * dy, b * 0.9], [y0 + 0.12 * dy, b * 0.5]];
      const pts = side.map(([y, z]) => [x, y, -z]);
      pts.push([x, y0, 0]);
      side.slice().reverse().forEach(([y, z]) => pts.push([x, y, z]));
      secs.push(pts);
    }
    const hull = paintFaces(loft(secs), (cx, cy, cz) => {
      const t = U.clamp((cx + L / 2) / L, 0, 1), yd = deckY(t);
      if (cy > yd - 0.12 && Math.abs(cz) < beam(t) * 0.97) return (Math.floor(cz / 0.9) & 1) ? deck : shade(deck, -0.06);
      if (cy > yd - 1.0 && cy < yd - 0.45) return gold;
      return (Math.floor(cy / 0.8) & 1) ? wood : plank;
    }, r, { jit: 0.03 });
    k.add(hull, null, {}, ship);
    // Stern castle with windows, a little forecastle, gun ports along the sides.
    const sx0 = -L / 2, sb = beam(0.08);
    k.add(new THREE.BoxGeometry(7, 3.6, sb * 1.9), (cx, cy) => (cy > deckY(0.1) + 3.3 ? deck : wood), { p: [sx0 + 3.4, deckY(0.1) + 1.6, 0], jit: 0.03 }, ship);
    k.add(new THREE.BoxGeometry(7.3, 0.35, sb * 2), gold, { p: [sx0 + 3.4, deckY(0.1) + 3.5, 0] }, ship);
    [-1, 1].forEach((s) => {
      for (let i = 0; i < 3; i++) k.add(new THREE.BoxGeometry(1.0, 1.1, 0.2), 0x1d3550, { p: [sx0 + 1.4 + i * 2, deckY(0.1) + 1.8, s * (sb * 0.95 + 0.06)] }, ship);
      for (let i = 0; i < 5; i++) {
        const t = 0.25 + i * 0.12, b = beam(t);
        k.add(new THREE.BoxGeometry(0.9, 0.8, 0.3), 0x2a1d14, { p: [-L / 2 + t * L, deckY(t) - 1.9, s * (b * 1.02)] }, ship);
      }
    });
    for (let i = 0; i < 3; i++) k.add(new THREE.BoxGeometry(0.2, 1.1, 1.0), 0x1d3550, { p: [sx0 - 0.05, deckY(0.1) + 1.8, (i - 1) * 1.8] }, ship);
    k.add(new THREE.BoxGeometry(4.5, 1.8, beam(0.8) * 1.8), wood, { p: [L / 2 - 6.5, deckY(0.78) + 0.7, 0], jit: 0.03 }, ship);
    // Masts: the main mast snapped, the fore and mizzen with braced yards and torn sails.
    const mast = (x, h, yardW, broken) => {
      const y0 = deckY((x + L / 2) / L) - 0.2;
      k.add(rod([x, y0, 0], [x, y0 + h, 0], 0.45, 0.3, 6), 0x6b4428, { jit: 0.04 }, ship);
      if (broken) {
        k.add(new THREE.ConeGeometry(0.32, 1.2, 5), 0x6b4428, { r: [0.3, 0, 0.4], p: [x + 0.2, y0 + h + 0.4, 0] }, ship);
        return;
      }
      const yy = y0 + h * 0.8, yaw = 0.75;
      k.add(rod([x - Math.sin(yaw) * yardW / 2, yy, -Math.cos(yaw) * yardW / 2], [x + Math.sin(yaw) * yardW / 2, yy, Math.cos(yaw) * yardW / 2], 0.2, 0.2, 5), 0x6b4428, {}, ship);
      const sail = paintFaces(sailGeo(yardW * 0.9, h * 0.55, r), (cx, cy) => (hash3(Math.round(cx / 1.5), Math.round(cy / 1.5), 0, 5) > 0.6 ? 0xd8c49a : 0xf3e6c8), r, { jit: 0.03 });
      k.add(sail, null, { r: [0, yaw + HALF_PI, 0], p: [x, yy - 0.2, 0] }, ship);
      k.add(new THREE.ConeGeometry(0.5, 0.8, 6), gold, { p: [x, y0 + h + 0.3, 0] }, ship);
    };
    mast(-8.5, 13, 8, false);
    mast(0.5, 9, 0, true);
    mast(8.5, 15, 10, false);
    const bow = deckY(1);
    k.add(rod([L / 2 - 1, bow - 0.5, 0], [L / 2 + 6, bow + 2.2, 0], 0.35, 0.2, 5), 0x6b4428, {}, ship);
    // A pennant (stripes, no skull) fluttering from the fore mast.
    const pen = paintFaces(twoSided(leafGeo(3.2, 0.5, { n: 4, a0: 0.1, curl: 0.4, fold: 0, shape: 0.25, base: 0.5 })), (cx) => ((Math.floor(cx / 0.8) & 1) ? 0xff5a6e : 0xffffff), r, {});
    k.add(pen, null, { r: [0, 0.4, 0], p: [8.5, deckY(0.83) + 15.6, 0] }, ship);
    // Sea life on the wreck.
    branchCoral(k, -4, deckY(0.35), -1, 1.6, tone(0xff6f91, r, 0.03), { n: 4, depth: 1, len: 1.1, parent: ship });
    brainDomeLite(k, 4, deckY(0.6), 1, 1.3, tone(0xd4dc6a, r, 0.03), ship);
    seaFan(k, -11, deckY(0.1) + 3.6, 0.5, 2.0, tone(0xb377ff, r, 0.03), 0.2, { parent: ship, tilt: 0.2 });
    plateCoral(k, 3, 2.0, -beam(0.6) - 0.6, 1.6, tone(0xffd23f, r, 0.03), 0.3, 0, ship);
    // The sand bank the hull has settled into.
    k.add(lump(new THREE.SphereGeometry(1, 16, 5, 0, TAU, 0, HALF_PI), 0.06, 3), (cx, cy, cz) => pick(SAND, r, 0.02),
      { s: [L * 0.62, 3.6, 9.5], p: [0, 0, 1.5], jit: 0.04 });
    // The treasure chest, lid thrown back, spilling gold and gems toward the road.
    const tx = -3, tz = -10.5;
    k.add(new THREE.BoxGeometry(3.4, 1.9, 2.2), (cx, cy) => (Math.abs(cx - tx) > 1.45 || Math.abs(cy - 1.0) > 0.75 ? gold : 0x8a4f2a), { p: [tx, 0.95, tz], jit: 0.03 });
    k.add(new THREE.CylinderGeometry(1.1, 1.1, 3.4, 8, 1, false, 0, Math.PI), (cx) => (Math.abs(cx - tx) > 1.45 ? gold : 0x9a5a30), { r: [1.25, 0, HALF_PI], order: 'XZY', p: [tx, 1.95, tz + 1.15] });
    k.add(lump(new THREE.SphereGeometry(1, 10, 4, 0, TAU, 0, HALF_PI), 0.08, 5), 0xffc93a, { s: [1.55, 0.7, 0.95], p: [tx, 1.85, tz] });
    k.add(lump(new THREE.SphereGeometry(1, 12, 4, 0, TAU, 0, HALF_PI), 0.08, 6), 0xffc93a, { s: [2.4, 0.8, 1.9], p: [tx + 0.3, 0, tz - 1.9] });
    for (let i = 0; i < 16; i++) {
      const a = r.range(-2.4, -0.7), d = r.range(1.5, 4.2);
      k.add(new THREE.CylinderGeometry(0.3, 0.3, 0.09, 8), i % 5 ? 0xffd84a : 0xffe58a, { r: [r.range(-0.5, 0.5), 0, r.range(-0.5, 0.5)], p: [tx + Math.cos(a) * d * 1.2, 0.08 + r.range(0, 0.25), tz + Math.sin(a) * d] });
    }
    [0xff3a5a, 0x3fd06a, 0x4f8fff, 0xb85cff].forEach((c, i) => k.add(new THREE.OctahedronGeometry(0.32, 0), c, { s: [1, 1.3, 1], p: [tx - 1 + i * 0.7, 2.2 + (i % 2) * 0.15, tz - 0.3] }));
    for (let i = 0; i < 9; i++) k.add(ico(0.13, 0), PEARL, { p: [tx + 1.0 + Math.cos(i * 0.5) * 0.9, 1.9 - i * 0.2, tz - 1.15 - Math.sin(i * 0.4) * 0.3] });
    k.root.userData.faceRoad = true;
    return finish(k);
  });

  /* ── Reef hazards ───────────────────────────────────────────────────── */

  /**
   * A clam valve whose ribs fan out from a hinge at the back (z = -1), as on
   * a real shell: a bowl (rim at y = 0, belly at -1) or, with `lid`, a dome.
   * The lip waves up and down with the ribs so two valves interlock.
   */
  function hingeValve(ribs, wave, lid) {
    const g = new THREE.SphereGeometry(1, 28, 8, 0, TAU, HALF_PI, HALF_PI);
    const P = g.attributes.position;
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
      const c = Math.cos(2 * ribs * Math.atan2(x, z + 1.05)), rim = 1 + y, f = 1 + 0.09 * c * rim;
      P.setXYZ(i, x * f, y + wave * c * rim * rim * rim, (z + 1.05) * f - 1.05);
    }
    if (lid) { g.scale(1, -1, 1); return flip(g); }
    g.computeVertexNormals();
    return g;
  }
  const hingeRib = (ribs, x, z) => Math.cos(2 * ribs * Math.atan2(x, z + 1.05));

  /**
   * A scallop valve standing on its hinge (at the origin): a fan of `ribs`
   * corrugated folds bulging toward +Z (or -Z with `back`), outline a circle
   * of radius Rc through the hinge. The lip waves in Z with the folds so the
   * two valves interlock. Returns { g, at(phi, rf) → { p, n } } in valve space.
   */
  function scallopValve(Rc, T, ribs, wave, back) {
    const na = ribs * 4, nr = 5, fm = 1.42, sg = back ? -1 : 1;
    const S = (phi, rf) => {
      const rho = rf * 2 * Rc * Math.cos(phi), x = rho * Math.sin(phi), y = rho * Math.cos(phi);
      const c = Math.cos(2 * ribs * phi), d2 = (x * x + (y - Rc) * (y - Rc)) / (Rc * Rc);
      const bulge = T * Math.sqrt(Math.max(0, 1 - d2) * Math.max(0, 1 - Math.pow(Math.abs(phi) / fm, 6))) * (1 + 0.1 * c * rf);
      return [x, y, sg * bulge + wave * c * Math.pow(rf, 4)];
    };
    const pos = [];
    for (let i = 0; i < na; i++) {
      for (let j = 0; j < nr; j++) {
        const f0 = -fm + 2 * fm * i / na, f1 = -fm + 2 * fm * (i + 1) / na, r0 = j / nr, r1 = (j + 1) / nr;
        const a = S(f0, r0), b = S(f1, r0), c = S(f1, r1), d = S(f0, r1);
        if (back) pos.push(...a, ...c, ...b, ...a, ...d, ...c);
        else pos.push(...a, ...b, ...c, ...a, ...c, ...d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    const at = (phi, rf) => {
      const p = S(phi, rf), pa = S(phi + 0.01, rf), pb = S(phi, rf + 0.01);
      const u = new THREE.Vector3(pa[0] - p[0], pa[1] - p[1], pa[2] - p[2]), v = new THREE.Vector3(pb[0] - p[0], pb[1] - p[1], pb[2] - p[2]);
      const n = (back ? v.cross(u) : u.cross(v)).normalize();
      if (n.z * sg < 0) n.negate();
      return { p, n: [n.x, n.y, n.z] };
    };
    return { g, at, rib: (x, y) => Math.cos(2 * ribs * Math.atan2(x, y)) };
  }

  /**
   * Block: a giant scallop standing on its hinge, fan ribs front and back, a
   * pearl held in its wavy lips and two eyes peeking over the top (looks
   * toward +Z).
   */
  hazard('clam_block', 'block', 'reef', (r) => {
    const k = new Kit(r, true), ribs = 6, col = pick([0xff7fa8, 0xff8a5e, 0xb98bff, 0x5fb8f0], r, 0.02), crest = mixHex(col, WHITE, 0.55);
    const Rc = 1.35, T = 1.05, hy = 0.32, wave = 0.12;
    k.add(lump(roundBox(2.4, 0.5, 2.2, 0.45, 10, 6), 0.05, 3), (x, y) => (y > 0.16 ? 0xd9b8c8 : 0xb9a3b5), { p: [0, 0.25, 0], jit: 0.05 });
    const front = scallopValve(Rc, T, ribs, wave, false), backV = scallopValve(Rc, T * 0.9, ribs, wave, true);
    [front, backV].forEach((v) => k.add(paintFaces(v.g, (cx, cy) => (v.rib(cx, cy) > 0.25 ? crest : col), r, { jit: 0.03, grad: 0.15 }), null, { p: [0, hy, 0] }));
    k.add(new THREE.SphereGeometry(1, 8, 5), shade(col, -0.1), { s: [0.5, 0.35, 0.45], p: [0, hy + 0.12, 0] });
    // Eyes peeking over the top of the front valve, rosy cheeks, a little smile, the pearl on top.
    const on = (phi, rf, lift) => { const q = front.at(phi, rf); return { p: [q.p[0] + q.n[0] * (lift || 0), hy + q.p[1] + q.n[1] * (lift || 0), q.p[2] + q.n[2] * (lift || 0)], n: q.n }; };
    [-1, 1].forEach((s) => {
      const e = on(s * 0.3, 0.8, 0.05);
      eyeAt(k, e.p, e.n, 0.32, null);
      const c = on(s * 0.62, 0.55, 0.02);
      k.add(ico(1, 1), 0xff6f8f, { s: [0.16, 0.1, 0.06], r: [0, s * 0.5, 0], p: c.p, noInk: true });
    });
    const sm = [];
    for (let i = 0; i <= 6; i++) { const u = i / 6 * 2 - 1; sm.push(on(u * 0.26, 0.56 - 0.07 * (1 - u * u), 0.03).p); }
    k.add(tubeGeo(sm, 0.045, 10, 4), shade(col, -0.4), { noInk: true });
    k.add(ico(1, 1), PEARL, { s: 0.3, p: [0, hy + 2 * Rc - 0.05, 0.05], grad: 0.2 });
    k.add(ico(0.07, 0), WHITE, { p: [0.1, hy + 2 * Rc + 0.08, 0.32], noInk: true });
    const out = sizeHazard(k, [2.8, 2.45, 2.6]);
    shadow(out, 3.4, 3.1);
    return out;
  });

  /** Roller: a round, puffed-up pufferfish with soft spines and a pursed little mouth. */
  hazard('pufferfish', 'roller', 'reef', (r) => {
    const k = new Kit(r, true), R = 1.0, node = new THREE.Group();
    node.position.y = R;
    const top = pick([0xffd23f, 0xffb43a, 0xa8e06a], r, 0.02), belly = 0xfff6dc, spot = shade(top, -0.2), spine = 0xfff3cf;
    k.add(ico(0.8, 2), (cx, cy, cz) => (cy < -0.18 ? belly : (hash3(Math.round(cx * 4), Math.round(cy * 4), Math.round(cz * 4), 7) > 0.5 ? spot : top)), { jit: 0.03 }, node);
    const n = 40;
    for (let i = 0; i < n; i++) {
      const y = 1 - (i + 0.5) / n * 2, rr = Math.sqrt(1 - y * y), a = i * 2.39996;
      const d = [Math.cos(a) * rr, y, Math.sin(a) * rr];
      if (d[2] > 0.45 && Math.abs(d[0]) < 0.75 && d[1] > -0.55) continue;
      k.add(orient(new THREE.ConeGeometry(0.11, 0.3, 5).translate(0, 0.15, 0), d, [d[0] * 0.76, d[1] * 0.76, d[2] * 0.76]), spine, {}, node);
    }
    [-1, 1].forEach((s) => {
      eye(k, s * 0.31, 0.2, 0.7, 0.3, 1, { parent: node });
      k.add(ico(1, 1), 0xff8f9f, { s: [0.13, 0.08, 0.05], p: [s * 0.5, -0.06, 0.62], noInk: true }, node);
      k.add(new THREE.OctahedronGeometry(1, 0), shade(top, 0.08), { s: [0.06, 0.24, 0.3], r: [0, s * 0.5, 0], p: [s * 0.78, -0.12, 0.2] }, node);
    });
    k.add(new THREE.TorusGeometry(0.085, 0.045, 5, 10), 0xff6f7d, { p: [0, -0.22, 0.79] }, node);
    k.add(new THREE.OctahedronGeometry(1, 0), shade(top, 0.05), { s: [0.05, 0.36, 0.3], p: [0, 0.05, -0.93] }, node);
    centreBall(node, R);
    A.ink(node, 0.05);
    const roll = keep(node);
    roll.name = 'roll';
    k.root.add(roll);
    const out = finish(k);
    out.userData.rollRadius = R;
    out.userData.rollNode = roll;
    return out;
  });

  /** Geyser: a rocky vent that bursts into a spiralling 6 m column of bubbles. */
  hazard('bubble_vent', 'geyser', 'reef', (r) => {
    const k = new Kit(r, true), stone = pick(REEFROCK, r, 0.02), crust = 0xf59fc0;
    k.add(new THREE.CylinderGeometry(0.8, 1.0, 0.32, 12), stone, { p: [0, 0.16, 0], jit: 0.05 });
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * TAU + r.range(-0.15, 0.15), R = r.range(0.3, 0.38);
      k.add(lump(new THREE.DodecahedronGeometry(1, 0), 0.12, i), (cx, cy) => (cy > R * 0.75 ? crust : stone), { s: [R * 1.3, R * 0.9, R], r: [0, -a, 0], p: [Math.cos(a) * 1.0, R * 0.42, Math.sin(a) * 1.0], jit: 0.05 });
    }
    k.add(new THREE.CircleGeometry(0.66, 12), 0x163248, { r: [-HALF_PI, 0, 0], p: [0, 0.33, 0], noInk: true });
    k.add(new THREE.CircleGeometry(0.3, 10), 0x2f6f9a, { r: [-HALF_PI, 0, 0], p: [0, 0.335, 0], noInk: true });
    for (let i = 0; i < 3; i++) k.add(ico(0.1 + i * 0.03, 1), 0xdff8ff, { p: [-0.2 + i * 0.2, 0.42 + i * 0.05, 0.1 - i * 0.12] });
    branchCoral(k, 1.15, 0.2, -0.4, 0.28, 0xff6f91, { n: 3, depth: 1, len: 0.9, rad: 0.16 });
    A.ink(k.root, 0.05);
    const out = finish(k);
    const ck = new Kit(r, true);
    ck.add(new THREE.CylinderGeometry(0.22, 0.34, 5.3, 8, 1, true), 0x8fdcf5, { p: [0, 2.85, 0], noInk: true });
    // Bubbles in a loose double spiral, each with a bright glint: spinning, they seem to rise.
    const bub = (x, y, z, R) => {
      ck.add(ico(1, 1), (cx, cyy) => (cyy < y - R * 0.45 ? 0x7fd0f0 : 0xbdf0ff), { s: R, p: [x, y, z] });
      ck.add(ico(1, 0), WHITE, { s: [R * 0.3, R * 0.22, R * 0.12], p: [x + R * 0.38, y + R * 0.45, z + R * 0.75], noInk: true });
      ck.add(ico(1, 0), WHITE, { s: [R * 0.3, R * 0.22, R * 0.12], p: [x - R * 0.38, y + R * 0.45, z - R * 0.75], noInk: true });
    };
    const nb = 16;
    for (let i = 0; i < nb; i++) {
      const t = i / nb, a = t * 2.6 * TAU + (i % 2) * Math.PI, R = 0.2 + 0.18 * ((i * 7) % 5) / 4, rr = 0.8 - R;      // outer edge 0.8 m: the column is as wide as the hazard (1.6 m)
      bub(Math.cos(a) * rr, 0.45 + t * 5.0, Math.sin(a) * rr, R);
    }
    [[0, 5.72, 0, 0.4], [0.36, 5.5, 0.12, 0.28], [-0.3, 5.55, -0.22, 0.3]].forEach(([x, y, z, R]) => bub(x, y, z, R));
    A.ink(ck.root, 0.045);
    const column = flagInk(A.mergeByMaterial(ck.root));
    geyserRig(out, column);
    spin({ root: out }, column, 'y', 1.8);
    return out;
  });

  /** Puddle: a soft patch of swaying seagrass on pale sand. */
  hazard('seagrass_patch', 'puddle', 'reef', (r) => {
    const k = new Kit(r, true), HW = 1.7, HL = 2.86, seed = r.next() * 99;
    const shape = puddleBase(k, [0.22, 0.45, 0.66, 0.82, 0.9, 0.955, 1], (rho, x, z) =>
      (rho > 0.84 ? 0xe4cf95 : (hash3(Math.round(x * 3), 0, Math.round(z * 3), seed) > 0.2 ? 0x3f9a5a : 0x5ab068)), 0x1f4a32, HW, HL);
    for (let c = 0; c < 11; c++) {
      const a = r.range(0, TAU), d = Math.sqrt(r.next()) * 0.72, x = Math.cos(a) * d * HW, z = Math.sin(a) * d * HL;
      for (let i = 0; i < 4; i++) {
        const len = r.range(0.32, 0.5);
        const g = paintFaces(twoSided(leafGeo(len, 0.07, { n: 2, a0: r.range(1.15, 1.4), curl: 0.9, fold: 0, shape: 0.8 })), (cx, cy) => mixHex(0x2f8a4a, 0x9be070, cy / len), r, {});
        k.add(g, null, { r: [0, r.range(0, TAU), 0], order: 'YZX', p: [x + r.range(-0.12, 0.12), 0.02, z + r.range(-0.12, 0.12)], noInk: true });
      }
    }
    const ra = r.range(0, TAU);
    starfish(k, [Math.cos(ra) * 0.5 * HW, 0.03, Math.sin(ra) * 0.5 * HL], [0, 1, 0], 0.26, r.pick([0xff7a1a, 0xff4f6e, 0xffc93a]));
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU + r.range(-0.12, 0.12), s = shape(a) * 0.87, rad = 0.15 * r.range(0.8, 1.2);
      k.add(new THREE.DodecahedronGeometry(rad, 0), pick(REEFROCK, r, 0.04), { s: [1.3, 0.5, 1.3], p: [Math.cos(a) * s * HW, 0.02 + rad * 0.4, Math.sin(a) * s * HL], jit: 0.05 });
    }
    A.ink(k.root, 0.035);
    return finish(k, 0.02);
  });

  /* ── Trench dressing (the deep blue trench the karts glide over) ───────── */

  prop('glow_jellyfish', (r) => {
    const k = new Kit(r), n = r.int(4, 6), nodes = [], params = [], G = GLOW();
    const cols = [[0xff6fcf, 0x9a2a8a], [0x5fd8ff, 0x1f5a9a], [0xb48cff, 0x4a2a9a], [0x6ff0c0, 0x1f7a6a], [0xffa86f, 0x9a3a2a]];
    const c0 = r.int(0, 4);
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU + r.range(-0.3, 0.3), d = i ? r.range(1.7, 2.6) : 0, R = i ? r.range(0.5, 0.75) : 0.95;
      const x = Math.cos(a) * d, y = i ? r.range(-1.3, 1.3) : 0.4, z = Math.sin(a) * d;
      const node = new THREE.Group(), c = cols[(c0 + i) % cols.length], top = mixHex(c[0], WHITE, 0.4);
      // The bell: a dome over a shallow, deep-coloured underside, lighter toward the crown.
      const bell = new THREE.SphereGeometry(1, 12, 6);
      const P = bell.attributes.position;
      for (let v = 0; v < P.count; v++) if (P.getY(v) < 0) P.setY(v, P.getY(v) * 0.22);
      k.add(bell, (cx, cy) => (cy < y - R * 0.05 ? c[1] : (cy > y + R * 0.5 ? top : c[0])), { s: [R, R * 0.85, R], p: [x, y, z], mat: G }, node);
      for (let j = 0; j < 5; j++) {
        const sa = j / 5 * TAU + 0.6;
        k.add(ico(1, 0), top, { s: R * 0.1, p: [x + Math.cos(sa) * R * 0.6, y + R * 0.58, z + Math.sin(sa) * R * 0.6], mat: G }, node);
      }
      k.add(new THREE.TorusGeometry(1, 0.07, 3, 14), mixHex(c[0], WHITE, 0.2), { s: [R * 0.98, R * 0.98, R], r: [HALF_PI, 0, 0], p: [x, y - R * 0.04, z], mat: G }, node);
      // Trailing tentacles and two frilly oral arms.
      const nt = 4 + (i ? 0 : 1);
      for (let j = 0; j < nt; j++) {
        const ta = j / nt * TAU + r.range(-0.2, 0.2), L = R * r.range(2.2, 3.2), pts = [];
        for (let s = 0; s <= 4; s++) {
          const u = s / 4, w = 0.18 * R * Math.sin(u * 5 + j);
          pts.push([x + Math.cos(ta) * (R * 0.7 + w), y - R * 0.1 - u * L, z + Math.sin(ta) * (R * 0.7 + w)]);
        }
        k.add(taperTube(pts, (t) => R * 0.055 * (1 - 0.6 * t), 6, 3), c[0], { mat: G }, node);
      }
      for (let j = 0; j < 2; j++) {
        const ta = j * Math.PI + 0.8, L = R * 1.6, pts = [];
        for (let s = 0; s <= 3; s++) { const u = s / 3; pts.push([x + Math.cos(ta) * R * 0.18 * (1 + Math.sin(u * 6)), y - R * 0.12 - u * L, z + Math.sin(ta) * R * 0.18 * (1 + Math.sin(u * 6))]); }
        k.add(taperTube(pts, (t) => R * 0.13 * (1 - 0.5 * t), 6, 4), top, { mat: G }, node);
      }
      if (i === 0) {
        // The big one smiles.
        [-1, 1].forEach((s) => k.add(ico(1, 0), 0x2a1640, { s: [R * 0.09, R * 0.13, R * 0.05], p: [x + s * R * 0.3, y + R * 0.25, z - R * 0.83], mat: G }, node));
        k.add(arcGeo(R * 0.16, R * 0.035, 2.4), 0x2a1640, { p: [x, y + R * 0.1, z - R * 0.86], mat: G }, node);
      }
      nodes.push(node);
      params.push({ c: [x, y, z], w: r.range(1.3, 1.8), ph: r.range(0, TAU) });
    }
    rig(k, nodes, G, (g, t, M) => {
      const q = params[g], p = Math.sin(q.w * t + q.ph);
      M.makeTranslation(0, 0.3 * Math.sin(q.w * 0.5 * t + q.ph + 1) + 0.12 * p, 0);
      aboutPivot(M, q.c, 0, 0, 0, 1 + 0.07 * p, 1 - 0.07 * p, 1 + 0.07 * p);
    }, 1);
    return finishFloat(k);
  });

  prop('angler_light', (r) => {
    const k = new Kit(r), G = GLOW();
    const body = pick([0x6a58c8, 0x4f6ad0, 0x7a52b8], r, 0.02), belly = mixHex(body, WHITE, 0.45), fin = shade(body, 0.1);
    const lit = [new THREE.Group(), new THREE.Group()], glow = [new THREE.Group(), new THREE.Group()];
    const B = [1.5, 1.3, 1.65];
    k.add(ico(1, 2), (cx, cy) => (cy < -0.35 ? belly : body), { s: B, jit: 0.03 }, lit[0]);
    const surf = (d) => {
      const v = new THREE.Vector3(d[0], d[1], d[2]).normalize(), t = 1 / Math.sqrt((v.x / B[0]) ** 2 + (v.y / B[1]) ** 2 + (v.z / B[2]) ** 2);
      const p = [v.x * t, v.y * t, v.z * t], n = new THREE.Vector3(p[0] / B[0] ** 2, p[1] / B[1] ** 2, p[2] / B[2] ** 2).normalize();
      return { p, n: [n.x, n.y, n.z] };
    };
    [-1, 1].forEach((s) => {
      const e = surf([s * 0.45, 0.42, -0.78]);
      eyeAt(k, e.p, e.n, 0.55, lit[0]);
      k.add(ico(1, 1), fin, { s: [0.1, 0.5, 0.42], r: [0, s * 0.4, s * 0.3], p: [s * 1.5, -0.25, 0.2] }, lit[0]);
      const ck = surf([s * 0.75, -0.05, -0.65]);
      k.add(ico(1, 1), 0xff9fc0, { s: [0.22, 0.14, 0.12], p: ck.p }, lit[0]);
    });
    // A wide, toothless grin.
    const sm = [];
    for (let i = 0; i <= 8; i++) { const u = i / 8 * 2 - 1; sm.push(surf([u * 0.62, -0.22 - 0.22 * (1 - u * u), -0.9]).p); }
    k.add(tubeGeo(sm, 0.07, 14, 4), 0x2a1640, {}, lit[0]);
    k.add(new THREE.OctahedronGeometry(1, 0), fin, { s: [0.08, 0.75, 0.6], p: [0, 0.2, 1.95] }, lit[0]);
    k.add(new THREE.OctahedronGeometry(1, 0), fin, { s: [0.06, 0.4, 0.5], p: [0, 1.25, 0.6] }, lit[0]);
    // The lure: a curved rod from the brow to a glowing bulb.
    const rodPts = [[0, 1.1, -0.6], [0, 2.0, -1.2], [0, 2.2, -2.0], [0, 1.85, -2.5]];
    k.add(taperTube(rodPts, (t) => 0.09 - 0.04 * t, 8, 4), shade(body, -0.1), {}, lit[1]);
    const bulb = [0, 1.62, -2.62];
    k.add(ico(1, 1), (cx, cy) => (cy > bulb[1] + 0.12 ? 0xffffc8 : 0xfff06a), { s: 0.34, p: bulb, mat: G }, glow[1]);
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * TAU;
      k.add(new THREE.OctahedronGeometry(0.07, 0), 0xfff6a0, { p: [bulb[0] + Math.cos(a) * 0.55, bulb[1] + Math.sin(a) * 0.55, bulb[2]], mat: G }, glow[1]);
    }
    // Glowing freckles along the flanks.
    for (let i = 0; i < 10; i++) {
      const s = i % 2 ? 1 : -1, q = surf([s * 0.9, -0.1 + 0.12 * Math.sin(i), -0.3 + (i >> 1) * 0.25]);
      k.add(ico(1, 0), 0x7ff4ff, { s: 0.09, p: [q.p[0] + q.n[0] * 0.02, q.p[1], q.p[2]], mat: G }, glow[0]);
    }
    const ph = r.range(0, TAU), piv = [0, 1.1, -0.6];
    const fn = (g, t, M) => {
      M.makeTranslation(0, 0.3 * Math.sin(0.8 * t + ph), 0);
      if (g === 1) aboutPivot(M, piv, 0.12 * Math.sin(1.3 * t + ph), 0, 0.1 * Math.sin(0.9 * t));
    };
    rig(k, lit, LIT(), fn, 0.5);
    rig(k, glow, G, fn, 0.5);
    return finishFloat(k);
  });

  prop('trench_coral', (r) => {
    const k = new Kit(r), G = GLOW(), H = r.range(13, 15), seed = r.next() * 99;
    const stem = pick([0x5a3fa8, 0x3f5fa8, 0x7a3f98], r, 0.03), glowC = [0x6ff4ff, 0xff7ae0, 0xb8ff6a][r.int(0, 2)];
    const sway = [r.range(-1, 1), r.range(-1, 1)];
    const at = (u) => [sway[0] * Math.sin(u * 2.4) * 1.2, u * H, sway[1] * Math.sin(u * 2.0) * 1.2];
    const pts = [0, 0.2, 0.4, 0.6, 0.8, 1].map(at);
    const g = bumpN(taperTube(pts, (t) => 1.7 * (1 - 0.78 * t), 12, 7), 0.12, seed);
    k.add(g, (cx, cy) => shade(stem, 0.1 * Math.sin(cy * 0.9)), { jit: 0.05, grad: 0.25 });
    reefRock(k, 0, 0.3, 0, 2.2, 0.5);
    reefRock(k, 1.6, 0.2, -0.8, 1.1, 0.6);
    // Glowing bands round the spire and glowing tips on every branch.
    for (let i = 1; i <= 4; i++) {
      const u = i / 5, p = at(u), rr = 1.7 * (1 - 0.78 * u) * 1.04;
      k.add(new THREE.TorusGeometry(rr, 0.12, 3, 12), glowC, { r: [HALF_PI, 0, 0], p, mat: G });
    }
    const nb = r.int(6, 8), b0 = r.range(0, TAU);
    for (let i = 0; i < nb; i++) {
      const u = 0.25 + 0.65 * i / (nb - 1), p = at(u), a = b0 + i * 2.4, len = (1 - u * 0.5) * r.range(2.4, 3.4);
      const q1 = [p[0] + Math.cos(a) * len * 0.6, p[1] + len * 0.35, p[2] + Math.sin(a) * len * 0.6];
      const q2 = [p[0] + Math.cos(a) * len, p[1] + len * 1.0, p[2] + Math.sin(a) * len];
      k.add(taperTube([p, q1, q2], (t) => 0.32 * (1 - 0.55 * t), 5, 5), stem, { jit: 0.04 });
      k.add(ico(1, 1), (cx, cy) => (cy > q2[1] + 0.1 ? WHITE : glowC), { s: 0.38, p: q2, mat: G });
    }
    k.add(ico(1, 1), (cx, cy) => (cy > H + 0.3 ? WHITE : glowC), { s: 0.55, p: at(1.02), mat: G });
    for (let i = 0; i < 14; i++) {
      const u = r.range(0.08, 0.9), p = at(u), a = r.range(0, TAU), rr = 1.7 * (1 - 0.78 * u);
      k.add(new THREE.OctahedronGeometry(0.12, 0), glowC, { p: [p[0] + Math.cos(a) * rr, p[1], p[2] + Math.sin(a) * rr], mat: G });
    }
    return finish(k);
  });

  prop('bubble_column', (r) => {
    const k = new Kit(r), H = 30, nodes = [], params = [];
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * TAU + r.range(-0.3, 0.3);
      reefRock(k, Math.cos(a) * 1.3, 0.25, Math.sin(a) * 1.3, r.range(0.55, 0.8), 0.6);
    }
    k.add(new THREE.CircleGeometry(0.9, 10), 0x163248, { r: [-HALF_PI, 0, 0], p: [0, 0.3, 0] });
    const nb = 56;
    for (let i = 0; i < nb; i++) {
      const node = new THREE.Group(), big = i % 4 === 0, R = big ? r.range(0.5, 0.72) : r.range(0.22, 0.42);
      const a = r.range(0, TAU), d = Math.sqrt(r.next()) * (1.5 - R), x = Math.cos(a) * d, z = Math.sin(a) * d, y0 = (i + r.next()) / nb * H;
      k.add(big ? ico(1, 1) : ico(1, 0), (cx, cy) => (cy < y0 - R * 0.4 ? 0x8fdcf5 : 0xc8f4ff), { s: R, p: [x, y0, z] }, node);
      k.add(new THREE.OctahedronGeometry(1, 0), WHITE, { s: [R * 0.28, R * 0.2, R * 0.12], p: [x + R * 0.35, y0 + R * 0.45, z - R * 0.78] }, node);
      nodes.push(node);
      params.push({ c: [x, y0, z], y0, v: r.range(1.6, 2.6) * (big ? 0.85 : 1), wa: r.range(0.1, 0.3), ww: r.range(1.5, 3), ph: r.range(0, TAU) });
    }
    rig(k, nodes, LIT(), (g, t, M) => {
      const q = params[g], y = (q.y0 + q.v * t) % H, u = y / H;
      const s = Math.min(1, u / 0.04) * Math.min(1, (1 - u) / 0.06) * (0.85 + 0.35 * u);
      M.makeTranslation(q.wa * Math.sin(q.ww * t + q.ph), y - q.y0, q.wa * Math.cos(q.ww * 0.8 * t + q.ph));
      aboutPivot(M, q.c, 0, 0, 0, Math.max(0.001, s));
    }, H * 0.6);
    return finish(k);
  });

  /* ── Reef set pieces: arches the road runs through ─────────────────────── */

  /** A lumpy coral boulder for arches (banded colour from `cols`). */
  function coralBlob(k, x, y, z, R, cols, seed) {
    const c = cols[Math.abs(Math.round(x * 0.37 + y * 0.53)) % cols.length];
    return k.add(lump(ico(1, 1), 0.13, seed), (cx, cy, cz) => (hash3(Math.round(cx * 0.8), Math.round(cy * 0.8), Math.round(cz * 0.8), seed) > 0.55 ? shade(c, 0.12) : c),
      { s: [R, R, R * 0.85], r: [0, k.rng.range(0, TAU), 0], p: [x, y, z], jit: 0.05, grad: 0.15 });
  }

  prop('coral_gate', (r) => {
    const k = new Kit(r), seed = r.next() * 99;
    const cols = [0xff7fa0, 0xff9a52, 0xc08cff, 0xff6a7a, 0xffb48a, 0xe58fd8];
    const cs = cols.slice(r.int(0, 2)).concat(cols.slice(0, 2));
    // Two chunky pillars of stacked coral boulders (an inner stack and a lower
    // outer buttress), every boulder kept clear of the opening.
    [-1, 1].forEach((s) => {
      let y = 0.8;
      for (let i = 0; i < 6 && y < 14.5; i++) {
        const R = (i === 0 ? 3.0 : r.range(2.4, 2.9)), x = s * (12.9 + 1.15 * R + r.range(0, 0.4));
        coralBlob(k, x, y, r.range(-0.5, 0.5), R, cs, seed + i * 3 + s);
        y += R * r.range(0.95, 1.1);
      }
      let y2 = 0.6;
      for (let i = 0; i < 3; i++) {
        const R = r.range(1.8, 2.3);
        coralBlob(k, s * (18.6 + r.range(-0.3, 0.3)), y2, r.range(-1.2, 1.2), R, cs, seed + 30 + i * 5 + s);
        y2 += R * 1.2;
      }
    });
    // The lintel: two rows of boulders along a gentle arch, every one above y = 12.3 inside the span.
    const nTop = 11;
    for (let i = 0; i < nTop; i++) {
      const u = i / (nTop - 1) * 2 - 1, x = u * 15.6, R = r.range(2.1, 2.5);
      const y = Math.max(12.3 + 1.15 * R, 14.8 + 1.4 * (1 - u * u)) + r.range(0, 0.3);
      coralBlob(k, x, y, r.range(-0.6, 0.6), R, cs, seed + 60 + i);
      if (i % 2 === 1 && Math.abs(u) < 0.85) coralBlob(k, x + r.range(-0.8, 0.8), y + R * 1.05, r.range(-0.6, 0.6), R * 0.7, cs, seed + 90 + i);
    }
    // Life on top and on the outer faces of the pillars.
    branchCoral(k, -7, 18.6, 0, 1.6, tone(0xff5a6e, r, 0.03), { n: 4, depth: 1, len: 1.2 });
    branchCoral(k, 6.5, 18.6, 0.3, 1.5, tone(0xffcf3a, r, 0.03), { n: 4, depth: 1, len: 1.2 });
    brainDomeLite(k, -0.5, 19.2, -0.2, 1.6, tone(0x8fe0c0, r, 0.03));
    seaFan(k, -13.5, 17.5, 0.6, 2.4, tone(0xb377ff, r, 0.03), 0.2, { tilt: 0.1 });
    seaFan(k, 14.5, 17.2, -0.4, 2.0, tone(0xff6fb5, r, 0.03), -0.3, { tilt: 0.1 });
    [-1, 1].forEach((s) => {
      plateCoral(k, s * 19.0, 6.8, 0.3, 1.5, tone(0xffd23f, r, 0.03), 0.15, 0);
      starfish(k, [s * 16.4, 4.5, -2.6], [0, 0.2, -1], 0.8, s > 0 ? 0xff7a1a : 0xb377ff);
      for (let i = 0; i < 2; i++) kelpFrond(k, s * (17.2 + i * 2.6), r.range(-2.2, -1.2) * (i ? -1 : 1), r.range(6, 9), { step: 1.3, blade: 2.2, bw: 0.6, rad: 0.1 });
    });
    clearOpening(k.root, 0.25);
    k.root.userData.faceRoad = true;
    const out = finishAt(k);
    clearOpening(out, 0.25);
    return out;
  });

  prop('coral_ring', (r) => {
    const k = new Kit(r), seed = r.next() * 99, A2 = 15.2, B2 = 15.0, p = 6, rad = 1.3;
    const cols = [0xff7fa0, 0xff9a52, 0xc08cff, 0xffcf3a, 0x4fd6c8, 0xff6a7a];
    const c0 = r.int(0, 5);
    const at = (th) => { const c = Math.cos(th), s = Math.sin(th); return [A2 * Math.sign(c) * Math.pow(Math.abs(c), 2 / p), B2 * Math.pow(Math.abs(s), 2 / p), 0]; };
    const pts = [];
    for (let i = 0; i <= 16; i++) pts.push(at(i / 16 * Math.PI));
    pts[0][1] = -0.6; pts[16][1] = -0.6;
    const g = bumpN(taperTube(pts, (t) => rad * (1 + 0.12 * Math.sin(t * Math.PI * 9)), 64, 7), 0.18, seed);
    k.add(g, (cx, cy) => {
      const band = Math.floor((Math.atan2(cy, cx) / Math.PI) * 7 + 0.3 * hash3(Math.round(cx), Math.round(cy), 0, seed));
      return cols[(c0 + Math.abs(band)) % cols.length];
    }, { jit: 0.05, grad: 0.15 });
    [-1, 1].forEach((s) => coralBlob(k, s * A2, 0.4, 0, 1.9, [cols[(c0 + 2) % 6], cols[(c0 + 4) % 6]], seed + s));
    // Kelp leaves streaming outward from the hoop, little corals on its crown.
    for (let i = 0; i < 14; i++) {
      const th = 0.15 + i / 13 * (Math.PI - 0.3), q = at(th), n = [q[0] / A2, q[1] / B2], nl = Math.hypot(n[0], n[1]);
      const out = [q[0] + n[0] / nl * rad * 0.8, q[1] + n[1] / nl * rad * 0.8, r.range(-0.6, 0.6)];
      const len = r.range(2.2, 3.4), lc = pick(KELP, r, 0.04);
      const lg = paintFaces(twoSided(leafGeo(len, 0.55, { n: 4, a0: 0.3, curl: 1.0, fold: 0.1, shape: 0.5 })), (cx) => mixHex(lc, KELP_TIP, cx / len), r, { jit: 0.04 });
      k.add(lg, null, { r: [r.range(-0.4, 0.4), 0, Math.atan2(n[1], n[0])], order: 'YXZ', p: out });
    }
    branchCoral(k, -4, B2 + 0.8, 0, 1.1, tone(cols[(c0 + 3) % 6], r, 0.03), { n: 4, depth: 1, len: 1.1 });
    brainDomeLite(k, 5, B2 + 0.9, 0, 1.1, tone(cols[(c0 + 1) % 6], r, 0.03));
    starfish(k, [-A2 + 0.6, 7, -rad * 0.95], [0, 0, -1], 0.6, 0xff7a1a);
    clearOpening(k.root, 0.25);
    k.root.userData.faceRoad = true;
    const out = finishAt(k);
    clearOpening(out, 0.25);
    return out;
  });

  /* ════════════════════════════════════════════════════════════════════════
   * DINO VALLEY — lush greens, warm browns, ochre rock, friendly pastel dinosaurs
   * ════════════════════════════════════════════════════════════════════════ */
  const FERN = [0x4caf50, 0x5cbf4a, 0x3f9f45, 0x6cc552];
  const FERN_TIP = 0xc6ee7c;
  const BARK = [0x8a5a36, 0x7a4e2e, 0x96643c];
  const OCHRE = [0xc79a5c, 0xb58a56, 0xd0a868, 0xbf8f58];
  const STONE = [0xa89c84, 0xb4a68a, 0x9c907a];
  const MOSS = [0x6fb04a, 0x5ea43e, 0x7fc052];
  const BONE = 0xf4e9cf;
  const BONE_SH = 0xdccaa4;
  const TAR = 0x231a2a;
  const TAR_SHEEN = 0x5e4e7e;
  const CHEEK = 0xff9fb0;
  /** Friendly dinosaur colourways: skin, pale belly, soft spots, back plates. */
  const DINO = [
    { skin: 0x7fd39a, belly: 0xf6f0c4, spot: 0x4fae78, plate: 0xffc24a },
    { skin: 0xb59cf0, belly: 0xf6eaff, spot: 0x8a6ad8, plate: 0xffd25a },
    { skin: 0x7fbef0, belly: 0xeaf6ff, spot: 0x4f8fd0, plate: 0xffa04a },
    { skin: 0xffa86f, belly: 0xfff0cf, spot: 0xe07a4a, plate: 0x7fd06a },
    { skin: 0xf2d35a, belly: 0xfff8dc, spot: 0xe0a030, plate: 0x6fc0f0 }
  ];

  /** Skin painter: pale belly where belly(x, y, z), soft spots in cells of `cell` metres elsewhere. */
  function skinPaint(c, seed, cell, belly) {
    return (cx, cy, cz) => (belly && belly(cx, cy, cz) ? c.belly
      : (hash3(Math.round(cx / cell), Math.round(cy / cell), Math.round(cz / cell), seed) > 0.6 ? c.spot : c.skin));
  }

  /**
   * taperTube wound so its faces point outward: the Frenet frames of some
   * curves (flat spirals, arcs) come out mirrored, which would turn the tube
   * inside out.
   */
  function limb(points, radFn, segs, radial) {
    const g = taperTube(points, radFn, segs, radial), P = g.attributes.position;
    const c = new THREE.Vector3(), a = new THREE.Vector3().fromBufferAttribute(P, 0);
    for (let j = 0; j < radial; j++) c.add(_rv.fromBufferAttribute(P, j));
    c.multiplyScalar(1 / radial);
    const b = new THREE.Vector3().fromBufferAttribute(P, 1).sub(a), d = new THREE.Vector3().fromBufferAttribute(P, radial).sub(a);
    return d.cross(b).dot(a.sub(c)) < 0 ? flip(g) : g;
  }

  /** Point on an ellipsoid (centre c, radii R) in direction d, with its outward normal. */
  function onEllipsoid(c, R, d) {
    const v = new THREE.Vector3(d[0], d[1], d[2]).normalize();
    const t = 1 / Math.sqrt((v.x / R[0]) ** 2 + (v.y / R[1]) ** 2 + (v.z / R[2]) ** 2);
    const p = [c[0] + v.x * t, c[1] + v.y * t, c[2] + v.z * t];
    const n = new THREE.Vector3((p[0] - c[0]) / R[0] ** 2, (p[1] - c[1]) / R[1] ** 2, (p[2] - c[2]) / R[2] ** 2).normalize();
    return { p, n: [n.x, n.y, n.z] };
  }

  /**
   * A happy face on an ellipsoid head looking toward -Z (dz = -1) or +Z:
   * two eyes, rosy cheeks, a toothless smile and two nostril dots.
   * o = { eye, eyeUp, eyeSide, smileW, smileY, nose }
   */
  function happyFace(k, c, R, dz, parent, o) {
    o = o || {};
    const es = o.eye || R[1] * 0.42, ey = o.eyeUp === undefined ? 0.42 : o.eyeUp, ex = o.eyeSide === undefined ? 0.6 : o.eyeSide;
    [-1, 1].forEach((s) => {
      const e = onEllipsoid(c, R, [s * ex, ey, dz * 0.7]);
      eyeAt(k, e.p, e.n, es, parent, o.mat ? { mat: o.mat } : undefined);
      const ck = onEllipsoid(c, R, [s * 0.72, -0.12, dz * 0.62]);
      k.add(ico(1, 0), CHEEK, { s: [R[0] * 0.17, R[1] * 0.11, R[2] * 0.08], p: ck.p, noInk: true, mat: o.mat }, parent);
      if (o.nose !== false) {
        const nn = onEllipsoid(c, R, [s * 0.16, 0.12, dz]);
        k.add(ico(1, 0), shade(o.skin || 0x888888, -0.25), { s: R[1] * 0.05, p: nn.p, noInk: true, mat: o.mat }, parent);
      }
    });
    const sm = [], w = o.smileW || 0.42, sy = o.smileY === undefined ? -0.22 : o.smileY;
    for (let i = 0; i <= 8; i++) {
      const u = i / 8 * 2 - 1;
      sm.push(onEllipsoid(c, R, [u * w, sy - 0.16 * (1 - u * u), dz]).p);
    }
    k.add(tubeGeo(sm, R[1] * 0.045, 12, 4), 0x3a2430, { noInk: true, mat: o.mat }, parent);
  }

  /** An ochre or grey boulder, optionally with a moss cap. */
  function dinoRock(k, x, y, z, R, sq, o, parent) {
    o = o || {};
    const seed = k.rng.next() * 99, stone = pick(o.cols || OCHRE, k.rng, 0.03), moss = pick(MOSS, k.rng, 0.03);
    const cap = o.moss === undefined ? 0.45 : o.moss;
    return k.add(lump(o.lite ? new THREE.DodecahedronGeometry(1, 0) : ico(1, 1), 0.14, seed), (cx, cy, cz) =>
      (cap < 1 && cy - y > R * sq * cap + 0.12 * R * sq * hash3(Math.round(cx * 3 / R), 0, Math.round(cz * 3 / R), seed) ? moss : stone),
    { s: [R, R * sq, R * (o.d || 1)], r: [0, o.yaw === undefined ? k.rng.range(0, TAU) : o.yaw, 0], p: [x, y, z], jit: 0.06, grad: 0.25, mat: o.mat }, parent);
  }

  /** A fern crown: `n` serrated fronds arching out of one point. */
  function fernCrown(k, x, y, z, n, len, wid, o, parent) {
    o = o || {};
    const r = k.rng, col = o.col || pick(FERN, r, 0.04), tip = o.tip || FERN_TIP, a0 = r.range(0, TAU);
    for (let i = 0; i < n; i++) {
      const a = a0 + i / n * TAU + r.range(-0.2, 0.2), L = len * r.range(0.85, 1.1);
      const g = paintFaces(twoSided(leafGeo(L, wid, { n: o.segs || 7, a0: (o.a0 || 0.9) * r.range(0.8, 1.15), curl: o.curl || 1.5, serr: o.serr === undefined ? 0.9 : o.serr, fold: 0.2, shape: 0.45, pow: o.pow || 1.2 })),
        (cx) => mixHex(col, tip, cx / L * 0.9), r, { jit: 0.05 });
      k.add(g, null, { r: [0, a, 0], order: 'YZX', p: [x, y, z], noInk: o.noInk, mat: o.mat }, parent);
    }
  }

  /** A horsetail stem: jointed green tube with dark rings, whorls and maybe a cone tip. */
  function horsetailStem(k, x, z, H, lean, yaw, o, parent) {
    o = o || {};
    const r = k.rng, n = o.joints || 5, rad = o.rad || 0.06, seg = H / n, col = pick([0x5aa83e, 0x6cb84a, 0x4f9a3a], r, 0.03);
    const dir = [Math.sin(lean) * Math.cos(yaw), Math.cos(lean), Math.sin(lean) * Math.sin(yaw)];
    const at = (h) => [x + dir[0] * h, dir[1] * h, z + dir[2] * h];
    const g = new THREE.CylinderGeometry(rad * 0.75, rad, H, 4, n * 2, true).translate(0, H / 2, 0);
    k.add(orient(g, dir, [x, 0, z]), (cx, cy) => ((cy / dir[1] / seg) % 1 > 0.82 ? 0x2f5a2a : col), {}, parent);
    for (let j = 1; j < n && !o.bare; j++) {
      const p = at(j * seg), wr = rad * 4.5 * (1 - 0.5 * j / n);
      k.add(orient(new THREE.ConeGeometry(wr, wr * 0.7, 5, 1, true).rotateX(Math.PI), dir, p), 0x8fd06a, { mat: o.mat }, parent);
    }
    if (o.cone) k.add(orient(place(ico(1, 0), { s: [rad * 1.8, rad * 3.2, rad * 1.8] }).translate(0, rad * 2.2, 0), dir, at(H)), 0xc08a44, { mat: o.mat }, parent);
    return at(H);
  }

  /** An egg (origin at its middle): fat bottom, narrower top, R wide and H tall. */
  function eggGeo(R, H, segs) {
    const g = new THREE.SphereGeometry(1, segs || 14, segs ? Math.round(segs * 0.7) : 10);
    const P = g.attributes.position;
    for (let i = 0; i < P.count; i++) {
      const y = P.getY(i), f = 1 - 0.16 * y;
      P.setXYZ(i, P.getX(i) * f * R, y * H / 2, P.getZ(i) * f * R);
    }
    g.computeVertexNormals();
    return g;
  }
  function eggPaint(base, spot, seed, cell) {
    return (cx, cy, cz) => (hash3(Math.round(cx / cell), Math.round(cy / cell), Math.round(cz / cell), seed) > 0.62 ? spot : base);
  }
  const EGGS = [[0xfff1cc, 0xc8803a], [0xbfeccc, 0x3f9a62], [0xc4dcff, 0x4f7ad0], [0xffd6e4, 0xd0608e], [0xffe98a, 0xe07a2a]];

  /* ── Dino near ──────────────────────────────────────────────────────── */

  prop('cycad', (r) => {
    const k = new Kit(r), th = r.range(1.1, 1.5), seed = r.next() * 99;
    const b0 = pick([0x8a6a3a, 0x9a7444], r, 0.02), b1 = shade(b0, 0.12);
    const trunk = lump(new THREE.CylinderGeometry(0.4, 0.52, th, 8, 4), 0.06, seed);
    k.add(trunk, (cx, cy, cz) => ((Math.floor((Math.atan2(cz, cx) / TAU + 0.5) * 8 + cy * 3.2) % 2) ? b1 : b0), { p: [0, th / 2, 0], jit: 0.04 });
    k.add(ico(1, 1), shade(b0, -0.05), { s: [0.62, 0.22, 0.62], p: [0, 0.08, 0] });
    // Two tiers of stiff, glossy, comb-like fronds.
    const col = pick(FERN, r, 0.03);
    fernCrown(k, 0, th, 0, r.int(6, 7), r.range(1.7, 2.0), 0.36, { a0: 0.55, curl: 1.0, serr: 0.55, segs: 8, col, tip: mixHex(col, FERN_TIP, 0.5) });
    fernCrown(k, 0, th + 0.05, 0, 5, r.range(1.3, 1.5), 0.3, { a0: 1.15, curl: 1.0, serr: 0.55, segs: 6, col: shade(col, 0.05), tip: FERN_TIP });
    // A bright cone in the middle.
    k.add(ico(1, 1), (cx, cy, cz) => ((Math.floor((Math.atan2(cz, cx) / TAU + 0.5) * 6 + cy * 7) % 2) ? 0xffb43a : 0xff8a2a), { s: [0.26, 0.38, 0.26], p: [0, th + 0.3, 0], jit: 0.03 });
    return finish(k);
  });

  prop('tree_fern', (r) => {
    const k = new Kit(r), H = r.range(4.3, 4.8), lx = r.range(-0.35, 0.35), lz = r.range(-0.35, 0.35);
    const at = (s) => [lx * s * s, H * s, lz * s * s];
    const bark = pick(BARK, r, 0.03), seed = r.next() * 99;
    k.add(bumpN(limb([at(0), at(0.33), at(0.66), at(1)], (t) => 0.34 - 0.1 * t, 6, 6), 0.04, seed),
      (cx, cy, cz) => (hash3(Math.round(cx * 6), Math.round(cy * 4), Math.round(cz * 6), seed) > 0.3 ? shade(bark, -0.08) : bark), { jit: 0.06 });
    k.add(ico(1, 1), shade(bark, -0.05), { s: [0.6, 0.4, 0.6], p: [0, 0.15, 0] });
    // A shaggy skirt of old fronds under the crown.
    const top = at(1);
    k.add(new THREE.ConeGeometry(0.55, 0.9, 7, 1, true), 0xa0743e, { p: [top[0], top[1] - 0.35, top[2]], jit: 0.08 });
    k.add(ico(1, 1), pick(FERN, r, 0.03), { s: [0.32, 0.22, 0.32], p: top });
    fernCrown(k, top[0], top[1], top[2], r.int(8, 10), r.range(2.6, 3.0), 0.48, { a0: 0.85, curl: 1.7, segs: 9, pow: 1.4 });
    // Two curled fiddleheads unrolling in the middle.
    for (let i = 0; i < 2; i++) {
      const a = i * Math.PI + r.range(0, 1);
      k.add(new THREE.TorusGeometry(0.13, 0.045, 4, 8, 4.6), 0xa8e070, { r: [0, a, 0], p: [top[0] + Math.cos(a) * 0.12, top[1] + 0.32, top[2] + Math.sin(a) * 0.12] });
      k.add(rod([top[0], top[1], top[2]], [top[0] + Math.cos(a) * 0.1, top[1] + 0.2, top[2] + Math.sin(a) * 0.1], 0.05, 0.045, 4), 0x8fd06a);
    }
    return finish(k);
  });

  prop('horsetail', (r) => {
    const k = new Kit(r), n = r.int(10, 12);
    k.add(lump(ico(1, 1), 0.12, 2), pick([0x7a5a3a, 0x6f8a3a], r, 0.03), { s: [0.75, 0.22, 0.75], p: [0, 0.05, 0], jit: 0.06 });
    for (let i = 0; i < n; i++) {
      const a = i * 2.4 + r.range(-0.3, 0.3), d = Math.sqrt(i / n) * 0.55, x = Math.cos(a) * d, z = Math.sin(a) * d;
      const H = (i < 3 ? r.range(2.1, 2.5) : r.range(1.2, 2.2)), lean = 0.05 + d * 0.35;
      horsetailStem(k, x, z, H, lean, a, { joints: H > 1.8 ? 5 : 4, cone: i % 3 === 1, bare: i % 3 === 1, rad: 0.05 + 0.015 * (H / 2.5) });
    }
    return finish(k);
  });

  prop('egg_nest', (r) => {
    const k = new Kit(r), seed = r.next() * 99, twig = pick(BARK, r, 0.03);
    const ring = lump(new THREE.TorusGeometry(0.72, 0.3, 6, 16), 0.1, seed);
    k.add(ring, (cx, cy, cz) => (hash3(Math.round(cx * 7), Math.round(cy * 7), Math.round(cz * 7), seed) > 0.2 ? twig : shade(twig, 0.14)), { r: [HALF_PI, 0, 0], s: [1, 1, 0.75], p: [0, 0.28, 0], jit: 0.08 });
    k.add(disc([0.55, 0.75], 10), 0xd8b870, { p: [0, 0.2, 0], jit: 0.06 });
    // Loose twigs criss-crossing the rim.
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * TAU + r.range(-0.2, 0.2), c = [Math.cos(a) * 0.82, 0.38 + r.range(-0.05, 0.08), Math.sin(a) * 0.82];
      const t = [-Math.sin(a), r.range(-0.25, 0.25), Math.cos(a)], L = r.range(0.35, 0.55);
      k.add(rod([c[0] - t[0] * L, c[1] - t[1] * L, c[2] - t[2] * L], [c[0] + t[0] * L, c[1] + t[1] * L, c[2] + t[2] * L], 0.035, 0.025, 4), shade(twig, r.range(-0.05, 0.12)));
    }
    // Three spotted eggs snuggled in.
    const e0 = r.int(0, EGGS.length - 1);
    [[-0.22, 0.12, 0.6], [0.28, 0.1, -0.5], [0.05, -0.32, 0.1]].forEach(([x, z, tilt], i) => {
      const c = EGGS[(e0 + i * 2) % EGGS.length], s = i === 2 ? 0.92 : 1;
      k.add(eggGeo(0.3 * s, 0.6 * s), eggPaint(c[0], c[1], seed + i, 0.07), { r: [tilt * 0.5, 0, tilt * 0.6], p: [x, 0.47 * s, z], grad: 0.15 });
    });
    return finish(k);
  });

  prop('mossy_boulder', (r) => {
    const k = new Kit(r), R = r.range(1.15, 1.3);
    dinoRock(k, 0, R * 0.55, 0, R, 0.82, { cols: STONE, moss: 0.25, d: 0.9 });
    dinoRock(k, R * 0.95, 0.25, R * 0.45, R * 0.38, 0.7, { cols: STONE, moss: 0.3 });
    for (let i = 0; i < 4; i++) {
      const a = i * 1.7 + r.range(0, 0.4);
      lobe(k, Math.cos(a) * R * 0.5, R * 1.2 - i * 0.08, Math.sin(a) * R * 0.4, R * r.range(0.22, 0.3), pick(MOSS, r, 0.04), 0.5);
    }
    fernCrown(k, -R * 0.8, 0.05, -R * 0.4, 5, 0.9, 0.22, { a0: 1.0, curl: 1.6, segs: 5 });
    // Two little red toadstools.
    [[-0.3, 0.6], [0.1, 0.8]].forEach(([dx, s], i) => {
      const x = R * 0.55 + dx, z = -R * 0.75 + i * 0.25;
      k.add(new THREE.CylinderGeometry(0.06 * s, 0.08 * s, 0.3 * s, 5), 0xfff4dc, { p: [x, 0.15 * s, z] });
      k.add(new THREE.SphereGeometry(0.2 * s, 8, 4, 0, TAU, 0, HALF_PI), (cx, cy, cz) => (hash3(Math.round(cx * 30), Math.round(cy * 30), Math.round(cz * 30), i) > 0.55 ? WHITE : 0xff4a3a), { p: [x, 0.28 * s, z] });
    });
    return finish(k);
  });

  prop('fossil_rock', (r) => {
    const k = new Kit(r), seed = r.next() * 99, stone = pick(OCHRE, r, 0.03), tilt = { r: [0.55, 0, 0], p: [0, 0.75, 0] };
    // A sandstone block whose front face is cut flat and tipped up to the sky.
    const g = place(lump(ico(1, 1), 0.1, seed), { s: [1.05, 0.85, 0.72] });
    const P = g.attributes.position, zf = -0.5;
    for (let i = 0; i < P.count; i++) if (P.getZ(i) < zf) P.setZ(i, zf + (P.getZ(i) - zf) * 0.15);
    k.add(place(g, tilt), (cx, cy) => (Math.floor(cy * 4.2 + 0.4 * hash3(Math.round(cx * 2), 0, 0, seed)) % 2 ? stone : shade(stone, 0.07)), { jit: 0.05 });
    // The ammonite: a ribbed logarithmic spiral standing proud of that face.
    const pts = [], N = 40, a = 0.034, b = 0.2, cx0 = r.range(-0.12, 0.12);
    for (let i = 0; i <= N; i++) { const th = i / N * 4 * Math.PI, rr = a * Math.exp(b * th); pts.push([cx0 + Math.cos(th) * rr, Math.sin(th) * rr, 0]); }
    const shell = pick([0xffe0a8, 0xffd2a0, 0xf8dcc8], r, 0.02), rib = shade(shell, -0.16), E = Math.exp(b * 4 * Math.PI);
    const am = place(limb(pts, (t) => 0.37 * a * (1 + t * (E - 1)), 56, 6), { s: [1, 1, 0.8], p: [0, 0, zf - 0.03] });
    k.add(place(paintFaces(am, (cx, cy) => (Math.floor((Math.atan2(cy, cx - cx0) / Math.PI) * 9 + 20) % 2 ? shell : rib), r, { grad: 0.1 }), tilt), null, {});
    // Little shells and a fern on top.
    for (let i = 0; i < 3; i++) k.add(new THREE.ConeGeometry(0.09, 0.2, 5), shell, { r: [r.range(-1, 1), 0, r.range(-1, 1)], p: [r.range(-0.9, 0.9), 0.08, r.range(-1.0, -0.75)] });
    fernCrown(k, 0.4, 1.35, 0.35, 4, 0.7, 0.18, { a0: 1.0, curl: 1.5, segs: 5 });
    k.root.userData.faceRoad = true;
    return finish(k);
  });

  /** Little dinosaur standing on two feet; head is a separate group so it can bob. */
  prop('baby_dino', (r) => {
    const k = new Kit(r), c = DINO[r.int(0, DINO.length - 1)], seed = r.next() * 99;
    const body = new THREE.Group(), head = new THREE.Group();
    const bc = [0, 0.86, 0.05], bR = [0.58, 0.66, 0.6];
    k.add(new THREE.SphereGeometry(1, 12, 8), skinPaint(c, seed, 0.3, (x, y, z) => z < -0.22 && Math.abs(x) < 0.36), { s: bR, p: bc, jit: 0.03 }, body);
    [-1, 1].forEach((s) => {
      k.add(ico(1, 1), c.skin, { s: [0.3, 0.33, 0.38], p: [s * 0.38, 0.45, 0.02], jit: 0.03 }, body);
      k.add(new THREE.SphereGeometry(1, 7, 4), shade(c.skin, -0.05), { s: [0.22, 0.12, 0.33], p: [s * 0.4, 0.11, -0.16] }, body);
      k.add(new THREE.SphereGeometry(1, 6, 4), c.skin, { s: [0.09, 0.09, 0.2], r: [0.6, 0, 0], p: [s * 0.42, 0.95, -0.46] }, body);
    });
    k.add(limb([[0, 0.62, 0.4], [0, 0.34, 0.92], [0.15, 0.14, 1.32], [0.38, 0.1, 1.58]], (t) => 0.33 * (1 - 0.82 * t), 8, 6), skinPaint(c, seed, 0.3), { jit: 0.03 }, body);
    const hc = [0, 1.48, -0.24], hR = [0.48, 0.44, 0.52];
    k.add(new THREE.SphereGeometry(1, 12, 8), skinPaint(c, seed + 1, 0.3), { s: hR, p: hc, jit: 0.02 }, head);
    k.add(ico(1, 1), c.skin, { s: [0.35, 0.27, 0.32], p: [0, 1.38, -0.6], jit: 0.02 }, head);
    happyFace(k, [0, 1.42, -0.42], [0.46, 0.42, 0.52], -1, head, { eye: 0.19, eyeUp: 0.45, eyeSide: 0.55, smileW: 0.36, smileY: -0.3, skin: c.skin });
    // Soft rounded back plates from the crown of the head down to the tail.
    const plates = [[1.92, -0.28, 0.6, 1], [1.8, 0.05, 0.75, 1], [1.38, 0.38, 0.95, 0], [1.12, 0.58, 0.9, 0], [0.82, 0.78, 0.75, 0], [0.5, 1.0, 0.6, 0]];
    plates.forEach(([y, z, s, h]) => k.add(ico(1, 0), c.plate, { s: [0.05, 0.13 * s, 0.12 * s], p: [0, y, z] }, h ? head : body));
    const ph = r.range(0, TAU), piv = [0, 1.2, -0.12];
    rig(k, [body, head], LIT(), (g, t, M) => {
      if (g === 1) aboutPivot(M, piv, 0.07 * Math.sin(2.1 * t + ph), 0, 0.06 * Math.sin(1.05 * t + ph));
    }, 0.2);
    k.root.userData.faceRoad = true;
    return finish(k);
  });

  /* ── Dino far ───────────────────────────────────────────────────────── */

  /** Revolve a profile [[radius, y], ...] (bottom to top) and wobble it by `shape(angle)`. */
  function latheShape(prof, segs, shape) {
    const g = new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), segs);
    if (g.attributes.uv) g.deleteAttribute('uv');
    const P = g.attributes.position;
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), z = P.getZ(i), f = shape ? shape(Math.atan2(z, x)) : 1;
      P.setXYZ(i, x * f, P.getY(i), z * f);
    }
    g.computeVertexNormals();
    return g;
  }

  prop('volcano_smoking', (r) => {
    const k = new Kit(r), G = GLOW(), H = r.range(34, 37), R0 = 34, Rt = 6.5, seed = r.next() * 99, shape = blobShape(r, 0.07);
    const rad = (y) => Rt + (R0 - Rt) * Math.pow(1 - y / H, 1.9);
    const prof = [];
    for (let i = 0; i <= 9; i++) prof.push([rad(i / 9 * H), i / 9 * H]);
    prof.push([Rt - 1.0, H + 0.9], [Rt - 2.4, H - 2.2], [0.01, H - 2.6]);
    const g = bumpN(latheShape(prof, 22, shape), 0.9, seed);
    const green = pick([0x5aa043, 0x63ab48], r, 0.02), earth = pick([0x9a6a42, 0xa47448], r, 0.02), rock = pick([0x6e5450, 0x76584e], r, 0.02);
    k.add(g, (cx, cy, cz) => {
      const n = 2.2 * hash3(Math.round(cx / 4), Math.round(cy / 3), Math.round(cz / 4), seed);
      if (cy > H - 0.5) return 0x4a3436;
      if (cy < H * 0.3 + n * 1.5) return cy < H * 0.12 ? shade(green, 0.05) : green;
      return cy < H * 0.62 + n ? earth : rock;
    }, { jit: 0.06 });
    // A glowing crater and lava rivers running down the front.
    k.add(disc([1.6, Rt - 2.0], 14), (cx, cy, cz) => (Math.hypot(cx, cz) < 2.2 ? 0xffd84a : 0xff7a1a), { p: [0, H - 1.6, 0], mat: G });
    const streams = r.int(2, 3), a0 = -HALF_PI + r.range(-0.4, 0.4);
    for (let i = 0; i < streams; i++) {
      const a = a0 + (i - (streams - 1) / 2) * 0.55, pts = [];
      for (let j = 0; j <= 6; j++) {
        const y = H + 0.6 - j / 6 * H * (0.55 + 0.1 * i), aa = a + 0.08 * Math.sin(j * 1.7 + i), R = rad(Math.min(H, y)) * shape(aa) + (j === 0 ? -0.3 : 0.95);
        pts.push([Math.cos(aa) * R, y, Math.sin(aa) * R]);
      }
      k.add(limb(pts, (t) => 0.95 * (1 - 0.45 * t), 18, 5), (cx, cy) => (cy > H * 0.75 ? 0xffc23a : 0xff8a1a), { mat: G });
    }
    // Leafy bushes around the foot.
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * TAU + r.range(-0.2, 0.2), y = r.range(1, 7), R = rad(y) * shape(a) + 0.5;
      lobe(k, Math.cos(a) * R, y, Math.sin(a) * R, r.range(2.2, 3.4), pick([0x3f8f3a, 0x4fa043, 0x2f7f36], r, 0.03), 0.7, true);
    }
    // A soft plume of smoke drifting off on the breeze.
    const smoke = [], sp = [];
    for (let i = 0; i < 6; i++) {
      const node = new THREE.Group(), u = i / 5, R = 3.0 + 3.2 * u;
      const c = [3.5 * u * u * 2.2 + r.range(-0.5, 0.5), H + 2.5 + 13 * u, r.range(-1, 1)];
      puff(k, c[0], c[1], c[2], R, 0.75, [shade(0xeeeae8, -0.05 * u), 0xb4acae], 11, node);
      if (i % 2 === 0) puff(k, c[0] + R * 0.7, c[1] - R * 0.25, c[2] + 0.5, R * 0.6, 0.8, [0xe4dfde, 0xaaa2a4], 9, node);
      smoke.push(node); sp.push({ c, ph: i * 0.9 });
    }
    rig(k, smoke, LIT(), (g, t, M) => {
      const q = sp[g];
      M.makeTranslation(0.6 * Math.sin(0.25 * t + q.ph), 0.5 * Math.sin(0.35 * t + q.ph), 0);
      aboutPivot(M, q.c, 0, 0, 0, 1 + 0.06 * Math.sin(0.5 * t + q.ph));
    }, 2);
    k.root.userData.embed = true;
    return finish(k);
  });

  prop('conifer_tall', (r) => {
    const k = new Kit(r), H = r.range(27, 31), bark = pick(BARK, r, 0.03), seed = r.next() * 99;
    const lean = [r.range(-0.6, 0.6), r.range(-0.6, 0.6)];
    const at = (u) => [lean[0] * u * u, H * u, lean[1] * u * u];
    k.add(limb([at(0), at(0.3), at(0.65), at(1)], (t) => 1.05 * (1 - 0.72 * t), 8, 7), (cx, cy) => (Math.floor(cy * 0.8) % 3 === 0 ? shade(bark, -0.09) : bark), { jit: 0.05 });
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * TAU + r.range(-0.2, 0.2);
      k.add(rod([0, 2.2, 0], [Math.cos(a) * 2.0, -0.2, Math.sin(a) * 2.0], 0.55, 0.25, 5), shade(bark, -0.04));
    }
    // Monkey-puzzle tiers: up-curving arms clad in rope-like dark foliage, a domed crown.
    const leaf = pick([0x2f7a3a, 0x37843e, 0x2b7036], r, 0.02), lite = shade(leaf, 0.12), tiers = 6;
    const clad = (cx, cy, cz) => (hash3(Math.round(cx * 1.5), Math.round(cy * 1.5), Math.round(cz * 1.5), seed) > 0.3 ? leaf : lite);
    for (let i = 0; i < tiers; i++) {
      const u = 0.52 + 0.44 * i / (tiers - 1), p = at(u), L = (1 - 0.62 * i / (tiers - 1)) * r.range(6.2, 7.2), nb = 5, a0 = i * 0.63 + r.range(0, 0.3);
      for (let j = 0; j < nb; j++) {
        const a = a0 + j / nb * TAU + r.range(-0.15, 0.15), dx = Math.cos(a), dz = Math.sin(a);
        const q1 = [p[0] + dx * L * 0.25, p[1] - 0.2, p[2] + dz * L * 0.25];
        const q2 = [p[0] + dx * L * 0.7, p[1] - 0.6 - L * 0.05, p[2] + dz * L * 0.7];
        const q3 = [p[0] + dx * L, p[1] + L * 0.18, p[2] + dz * L];
        k.add(rod(p, q1, 0.32, 0.22, 4), bark);
        k.add(limb([q1, q2, q3], (t) => 0.95 - 0.35 * t, 6, 5), clad, { jit: 0.06 });
        k.add(ico(1, 0), lite, { s: [0.7, 0.9, 0.7], p: q3 });
      }
    }
    lobe(k, at(1)[0], H + 0.4, at(1)[2], 2.4, leaf, 0.7, true);
    return finish(k);
  });

  prop('mesa_green', (r) => {
    const k = new Kit(r), H = r.range(20, 25), R = r.range(16.5, 18.5), shape = blobShape(r, 0.13), seed = r.next() * 99;
    const prof = [[R * 1.32, 0], [R * 1.12, H * 0.12], [R * 1.0, H * 0.22], [R * 0.98, H * 0.5], [R * 0.93, H * 0.56], [R * 0.95, H * 0.86], [R * 0.9, H], [R * 0.86, H + 0.4], [R * 0.5, H + 0.9], [0.01, H + 1.1]];
    const strata = [0xc98a52, 0xb5703f, 0xd9a566, 0xa86a40, 0xd29a5e];
    const g = bumpN(latheShape(prof, 20, shape), 0.7, seed);
    k.add(g, (cx, cy, cz) => {
      const n = hash3(Math.round(cx / 3), Math.round(cy / 2), Math.round(cz / 3), seed);
      if (cy > H - 0.2) return 0x6fbf4a;
      if (cy < H * 0.16 + n * 1.2) return cy < H * 0.08 ? 0x6aaa44 : 0x8a9a4a;
      return strata[Math.abs(Math.floor((cy + n * 0.8) / 2.3)) % strata.length];
    }, { jit: 0.05 });
    // A frill of green along the rim and a little forest on top.
    for (let i = 0; i < 14; i++) {
      const a = i / 14 * TAU + r.range(-0.15, 0.15), rr = R * 0.9 * shape(a);
      lobe(k, Math.cos(a) * rr, H + 0.3, Math.sin(a) * rr, r.range(1.6, 2.4), pick([0x5aa843, 0x6cbf4a, 0x4f9a3a], r, 0.03), 0.6, true);
    }
    for (let i = 0; i < 4; i++) {
      const a = i * 1.9 + r.range(0, 0.6), d = R * r.range(0.15, 0.55), x = Math.cos(a) * d, z = Math.sin(a) * d, h = r.range(4, 6.5);
      k.add(rod([x, H, z], [x, H + h, z], 0.35, 0.2, 5), pick(BARK, r, 0.03));
      const leaf = pick([0x2f7a3a, 0x3f8f45, 0x4fa043], r, 0.03);
      k.add(new THREE.ConeGeometry(2.0, 3.2, 7), leaf, { p: [x, H + h * 0.55, z], jit: 0.06, grad: 0.3 });
      k.add(new THREE.ConeGeometry(1.4, 2.6, 7), shade(leaf, 0.05), { p: [x, H + h * 0.55 + 1.8, z], jit: 0.06, grad: 0.3 });
    }
    for (let i = 0; i < 3; i++) {
      const a = i * 2.3 + 1, d = R * r.range(0.3, 0.6);
      fernCrown(k, Math.cos(a) * d, H + 0.8, Math.sin(a) * d, 6, 2.6, 0.6, { a0: 0.8, curl: 1.4, segs: 5 });
    }
    k.root.userData.embed = true;
    return finish(k);
  });

  /* ── Pterosaurs ────────────────────────────────────────────────────── */
  const PTERO = [
    { skin: 0xff8a5a, wing: 0xffc49a, crest: 0xffd23f },
    { skin: 0x6fa8e8, wing: 0xbfe0ff, crest: 0xff7a9a },
    { skin: 0x9a7ae0, wing: 0xd8c8ff, crest: 0xffc24a },
    { skin: 0x5fc49a, wing: 0xc4f2dc, crest: 0xff8a3a }
  ];
  const _rm2 = new THREE.Matrix4();
  /**
   * A friendly pterosaur at the origin, beak toward -Z, wings along ±X:
   * parts go into body / wingL / wingR groups. Returns the two shoulder pivots.
   */
  function pterosaur(k, S, c, body, wingL, wingR) {
    const P3 = (x, y, z) => [x * S, y * S, z * S];
    k.add(ico(1, 1), (cx, cy) => (cy < -0.12 * S ? mixHex(c.skin, WHITE, 0.5) : c.skin), { s: [0.42 * S, 0.4 * S, 1.05 * S], p: P3(0, 0, 0.15), jit: 0.03 }, body);
    k.add(limb([P3(0, 0.05, 1.0), P3(0, 0.1, 1.6), P3(0, 0.25, 2.05)], (t) => 0.14 * S * (1 - 0.7 * t), 5, 4), c.skin, {}, body);
    const hc = P3(0, 0.38, -1.0), hR = [0.36 * S, 0.38 * S, 0.5 * S];
    k.add(rod(P3(0, 0.1, -0.6), hc, 0.22 * S, 0.2 * S, 6), c.skin, {}, body);
    k.add(ico(1, 1), c.skin, { s: hR, p: hc, jit: 0.02 }, body);
    // A long rounded beak and a bright swept-back crest.
    k.add(rod(P3(0, 0.3, -1.35), P3(0, 0.18, -2.3), 0.17 * S, 0.07 * S, 6), 0xffc94a, {}, body);
    k.add(ico(1, 0), 0xffc94a, { s: 0.08 * S, p: P3(0, 0.18, -2.3) }, body);
    k.add(new THREE.OctahedronGeometry(1, 0), c.crest, { s: [0.06 * S, 0.22 * S, 0.62 * S], r: [-0.55, 0, 0], p: P3(0, 0.78, -0.62) }, body);
    [-1, 1].forEach((s) => {
      const e = onEllipsoid(hc, hR, [s * 0.75, 0.35, -0.5]);
      eyeAt(k, e.p, e.n, 0.2 * S, body);
      const ck = onEllipsoid(hc, hR, [s * 0.8, -0.2, -0.45]);
      k.add(ico(1, 0), CHEEK, { s: [0.08 * S, 0.06 * S, 0.06 * S], p: ck.p }, body);
      k.add(ico(1, 0), shade(c.skin, -0.1), { s: [0.1 * S, 0.08 * S, 0.16 * S], p: P3(s * 0.2, -0.3, 1.0) }, body);
    });
    // Wings: an arm bone along the leading edge and a membrane back to the hip.
    const piv = [];
    [[-1, wingL], [1, wingR]].forEach(([s, node]) => {
      const sh = P3(s * 0.32, 0.12, -0.3), wr = P3(s * 1.55, 0.3, -0.5), tp = P3(s * 3.0, 0.08, 0.1), md = P3(s * 1.55, 0.04, 0.5), hp = P3(s * 0.32, 0, 0.7);
      const pos = [];
      const tri = (a, b, d) => { if (s > 0) pos.push(...a, ...b, ...d); else pos.push(...a, ...d, ...b); };
      tri(sh, md, wr); tri(wr, md, tp); tri(sh, hp, md);
      const mg = new THREE.BufferGeometry();
      mg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      k.add(twoSided(mg), (cx) => mixHex(c.wing, WHITE, Math.abs(cx) / (3 * S) * 0.35), {}, node);
      k.add(limb([sh, wr, tp], (t) => 0.11 * S * (1 - 0.55 * t), 6, 4), c.skin, {}, node);
      piv.push(sh);
    });
    return piv;
  }

  prop('pterodactyl', (r) => {
    const k = new Kit(r), c = PTERO[r.int(0, PTERO.length - 1)], groups = [new THREE.Group(), new THREE.Group(), new THREE.Group()];
    const piv = pterosaur(k, 1.0, c, groups[0], groups[1], groups[2]), ph = r.range(0, TAU);
    rig(k, groups, LIT(), (g, t, M) => {
      const w = 2.2 * t + ph, flap = 0.32 * Math.sin(w);
      M.makeTranslation(0, -0.25 * Math.sin(w), 0);
      M.multiply(_rm2.makeRotationZ(0.08 * Math.sin(0.4 * t + ph)));
      if (g) aboutPivot(M, piv[g - 1], 0, 0, (g === 2 ? 1 : -1) * flap);
    }, 1.5);
    return finishFloat(k);
  });

  prop('pterodactyl_flock', (r) => {
    const k = new Kit(r), n = r.int(3, 5), groups = [], birds = [], c0 = r.int(0, PTERO.length - 1);
    for (let i = 0; i < n; i++) {
      const g3 = [new THREE.Group(), new THREE.Group(), new THREE.Group()], S = r.range(0.7, 0.85);
      const piv = pterosaur(k, S, PTERO[(c0 + i) % PTERO.length], g3[0], g3[1], g3[2]);
      groups.push(...g3);
      birds.push({ piv, th: i / n * TAU + r.range(-0.3, 0.3), R: r.range(6.5, 8), y: r.range(-1.6, 1.6), ph: r.range(0, TAU), w: r.range(1.9, 2.5) });
    }
    const om = 0.22;
    rig(k, groups, LIT(), (g, t, M) => {
      const b = birds[Math.floor(g / 3)], part = g % 3, th = b.th + om * t, w = b.w * t + b.ph;
      M.makeTranslation(Math.cos(th) * b.R, b.y + 0.5 * Math.sin(0.5 * t + b.ph) - 0.15 * Math.sin(w), Math.sin(th) * b.R);
      M.multiply(_rm2.makeRotationY(Math.PI - th));
      M.multiply(_rm2.makeRotationZ(-0.28));
      if (part) aboutPivot(M, b.piv[part - 1], 0, 0, (part === 2 ? 1 : -1) * 0.34 * Math.sin(w));
    }, 3);
    return finishFloat(k);
  });

  /* ── Dino landmarks ─────────────────────────────────────────────────── */

  /**
   * A gentle long-neck sauropod facing -Z with its feet at y = y0 (S = 1:
   * head top ≈ 29.5 m above the feet). Body parts go into `body`, neck and
   * head into `neck`. Returns the neck pivot, the neck height and the feet.
   */
  function sauropod(k, S, c, body, neck, y0) {
    const r = k.rng, seed = r.next() * 99;
    const P = (x, y, z) => [x * S, y * S + y0, z * S];
    const paint = skinPaint(c, seed, 1.7 * S, (x, y) => y < 9.0 * S + y0);
    const plain = skinPaint(c, seed, 1.7 * S);
    k.add(ico(1, 2), paint, { s: [4.4 * S, 4.0 * S, 7.6 * S], p: P(0, 11, 1), jit: 0.03 }, body);
    const feet = [];
    [[-1, -4.2], [1, -4.2], [-1, 5.4], [1, 5.4]].forEach(([s, z]) => {
      const x = s * 2.7, back = z > 0;
      k.add(rod(P(x, 0.6, z), P(x, 10, z), 1.35 * S, 1.6 * S, 8), c.skin, {}, body);
      k.add(ico(1, 1), plain, { s: back ? [1.9 * S, 2.8 * S, 2.6 * S] : [1.6 * S, 2.2 * S, 2.0 * S], p: P(x * 0.95, back ? 9.4 : 9.8, z), jit: 0.03 }, body);
      k.add(new THREE.CylinderGeometry(1.62 * S, 1.8 * S, 1.1 * S, 10), shade(c.skin, -0.06), { p: P(x, 0.55, z) }, body);
      for (let t = -1; t <= 1; t++) k.add(ico(1, 0), c.belly, { s: [0.38 * S, 0.3 * S, 0.3 * S], p: P(x + t * 0.75, 0.32, z - 1.55) }, body);
      feet.push([x * S, z * S]);
    });
    k.add(limb([P(0, 12, 7.5), P(0, 10.5, 12), P(0.4, 7.5, 16), P(2, 5, 20), P(4.2, 4.2, 23)], (t) => S * (2.7 * Math.pow(1 - t, 0.9) + 0.22), 16, 8), plain, { jit: 0.03 }, body);
    const nk = [P(0, 12.5, -4.5), P(0, 16.5, -7.2), P(0, 21, -8.6), P(0, 25, -9.2), P(0, 27.2, -9.4)];
    k.add(limb(nk, (t) => S * (2.6 - 1.25 * t), 14, 8), plain, { jit: 0.03 }, neck);
    const hc = P(0, 28.1, -10.4), hR = [1.75 * S, 1.5 * S, 2.25 * S];
    k.add(ico(1, 2), plain, { s: hR, p: hc, jit: 0.02 }, neck);
    happyFace(k, hc, hR, -1, neck, { eye: 0.62 * S, eyeUp: 0.42, eyeSide: 0.62, smileW: 0.42, smileY: -0.28, skin: c.skin });
    // A row of soft round plates from the crown, down the neck and along the back.
    for (let i = 0; i < 6; i++) {
      const u = i / 6, a = nk[Math.min(3, Math.floor(u * 4))], b = nk[Math.min(4, Math.floor(u * 4) + 1)], f = (u * 4) % 1;
      const p = lerp3(a, b, f), rr = S * (2.6 - 1.25 * u);
      k.add(ico(1, 0), c.plate, { s: [0.25 * S, 0.55 * S, 0.5 * S], r: [0.5, 0, 0], p: [p[0], p[1] + rr * 0.45, p[2] + rr * 0.85] }, neck);
    }
    k.add(ico(1, 0), c.plate, { s: [0.25 * S, 0.5 * S, 0.45 * S], p: [hc[0], hc[1] + hR[1] * 0.95, hc[2] + hR[2] * 0.3] }, neck);
    for (let z = -2.5; z <= 9.5; z += 1.7) {
      const yt = 11 + 4.0 * Math.sqrt(Math.max(0, 1 - ((z - 1) / 7.6) ** 2));
      k.add(ico(1, 0), c.plate, { s: [0.3 * S, 0.6 * S, 0.55 * S], p: P(0, yt + 0.15, z) }, body);
    }
    return { piv: nk[0], h: hc[1] + hR[1] - nk[0][1], feet };
  }
  const STILL = { piv: [0, 0, 0], h: 1, ax: 0, az: 0, w: 0, ph: 0, kw: 0 };

  prop('long_neck', (r) => {
    const k = new Kit(r), c = DINO[r.int(0, DINO.length - 1)], body = new THREE.Group(), neck = new THREE.Group();
    const q = sauropod(k, 1, c, body, neck, 0);
    waver(k, [body, neck], LIT(), [STILL, { piv: q.piv, h: q.h, ax: 1.1, az: 0.5, w: 0.45, ph: r.range(0, TAU), kw: 0.6 }], 2);
    fernCrown(k, -6.5, 0, -3, 7, 3.2, 0.7, { a0: 0.8, curl: 1.4, segs: 6 });
    fernCrown(k, 6.5, 0, 1.5, 6, 2.8, 0.6, { a0: 0.9, curl: 1.4, segs: 6 });
    k.root.userData.faceRoad = true;
    return finish(k);
  });

  prop('sauropod_wading', (r) => {
    const k = new Kit(r), c = DINO[r.int(0, DINO.length - 1)], body = new THREE.Group(), neck = new THREE.Group(), S = 0.96;
    const q = sauropod(k, S, c, body, neck, -3.4);
    waver(k, [body, neck], LIT(), [STILL, { piv: q.piv, h: q.h, ax: 1.0, az: 0.45, w: 0.4, ph: r.range(0, TAU), kw: 0.6 }], 2);
    // Ripples where the legs and tail meet the river.
    q.feet.forEach(([x, z]) => {
      k.add(new THREE.TorusGeometry(2.1, 0.17, 3, 16), 0xe6fbff, { r: [HALF_PI, 0, 0], p: [x, 0.06, z] });
      k.add(new THREE.TorusGeometry(3.1, 0.12, 3, 18), 0xbfeaf2, { r: [HALF_PI, 0, 0], p: [x, 0.04, z] });
    });
    k.root.userData.faceRoad = true;
    return finishAt(k);
  });

  prop('triceratops_big', (r) => {
    const k = new Kit(r), c = DINO[r.int(0, DINO.length - 1)], seed = r.next() * 99, S = 0.82;
    const P = (x, y, z) => [x * S, y * S, z * S];
    const paint = skinPaint(c, seed, 0.9 * S, (x, y) => y < 2.6 * S), plain = skinPaint(c, seed, 0.9 * S);
    k.add(ico(1, 2), paint, { s: [2.6 * S, 2.4 * S, 3.9 * S], p: P(0, 3.7, 0.6), jit: 0.03 });
    [[-1, -2.0], [1, -2.0], [-1, 3.0], [1, 3.0]].forEach(([s, z]) => {
      const x = s * 1.7;
      k.add(rod(P(x, 0.5, z), P(x, 3.6, z), 0.75 * S, 0.85 * S, 8), c.skin);
      if (z > 0) k.add(ico(1, 1), plain, { s: [1.1 * S, 1.5 * S, 1.5 * S], p: P(x * 0.95, 3.5, z), jit: 0.03 });
      k.add(new THREE.CylinderGeometry(0.9 * S, 1.0 * S, 0.6 * S, 9), shade(c.skin, -0.06), { p: P(x, 0.3, z) });
      for (let t = -1; t <= 1; t++) k.add(ico(1, 0), c.belly, { s: 0.2 * S, p: P(x + t * 0.42, 0.18, z - 0.88) });
    });
    k.add(limb([P(0, 4.2, 4.2), P(0, 3.4, 6.0), P(0.4, 2.2, 7.6), P(1.1, 1.4, 8.6)], (t) => S * (1.3 * (1 - t) + 0.14), 10, 7), plain, { jit: 0.03 });
    // The frill: a big scalloped shield behind the head, ringed with knobs.
    const fc = P(0, 5.1, -3.0), FR = 3.1 * S, frill = c.plate;
    const fg = twoSided(disc([0.45, 0.8, 1], 18, (a) => 1 + 0.07 * Math.cos(9 * a)));
    k.add(fg, (cx, cy, cz) => mixHex(c.skin, frill, U.clamp((Math.hypot(cx - fc[0], cy - fc[1], cz - fc[2]) / FR - 0.35) * 1.6, 0, 1)), { s: [FR, 1, FR], r: [-HALF_PI + 0.45, 0, 0], p: fc, jit: 0.03 });
    for (let i = 0; i < 9; i++) {
      const a = -0.15 + i / 8 * (Math.PI + 0.3), d = [Math.cos(a) * FR * 1.03, Math.sin(a) * FR * 1.03 * Math.cos(0.45), Math.sin(a) * FR * Math.sin(0.45)];
      k.add(ico(1, 0), c.belly, { s: 0.3 * S, p: [fc[0] + d[0], fc[1] + d[1], fc[2] + d[2]] });
    }
    // Head, beak, three rounded horns and a happy face.
    const hc = P(0, 3.7, -4.3), hR = [1.45 * S, 1.35 * S, 1.8 * S];
    k.add(ico(1, 2), plain, { s: hR, p: hc, jit: 0.02 });
    k.add(rod(P(0, 3.25, -5.4), P(0, 2.75, -6.45), 0.62 * S, 0.24 * S, 7), 0xffcf7a);
    k.add(ico(1, 1), 0xffcf7a, { s: 0.26 * S, p: P(0, 2.72, -6.45) });
    const horn = (base, dir, len, rad) => {
      k.add(orient(new THREE.ConeGeometry(rad, len, 7).translate(0, len / 2, 0), dir, base), (cx, cy, cz) => (dist([cx, cy, cz], base) < len * 0.35 ? 0xf2dcb0 : 0xfff6e2), {});
      const tip = [base[0] + dir[0] / Math.hypot(...dir) * len * 0.92, base[1] + dir[1] / Math.hypot(...dir) * len * 0.92, base[2] + dir[2] / Math.hypot(...dir) * len * 0.92];
      k.add(ico(1, 0), 0xfff6e2, { s: rad * 0.35, p: tip });
    };
    horn(P(0, 4.3, -5.55), [0, 1, -0.45], 0.8 * S, 0.3 * S);
    [-1, 1].forEach((s) => horn(P(s * 0.7, 4.65, -4.75), [s * 0.22, 0.85, -1], 2.0 * S, 0.3 * S));
    happyFace(k, hc, hR, -1, null, { eye: 0.5 * S, eyeUp: 0.32, eyeSide: 0.66, smileW: 0.42, smileY: -0.38, skin: c.skin, nose: false });
    k.root.userData.faceRoad = true;
    return finish(k);
  });

  /* ── Dino hazards (cel-shaded, inked, sized to their collision boxes) ─── */

  /** Block: a giant spotted egg in a twig nest, hatching: a baby dino peeks out wearing the cap. */
  hazard('egg_block', 'block', 'dino', (r) => {
    const k = new Kit(r, true), seed = r.next() * 99, ec = EGGS[r.int(0, EGGS.length - 1)], twig = pick(BARK, r, 0.03), c = DINO[r.int(0, DINO.length - 1)];
    k.add(lump(new THREE.TorusGeometry(1.02, 0.38, 6, 16), 0.08, seed), (cx, cy, cz) => (hash3(Math.round(cx * 5), Math.round(cy * 5), Math.round(cz * 5), seed) > 0.2 ? twig : shade(twig, 0.14)),
      { r: [HALF_PI, 0, 0], s: [1, 1, 0.8], p: [0, 0.3, 0], jit: 0.06 });
    for (let i = 0; i < 9; i++) {
      const a = i / 9 * TAU + r.range(-0.2, 0.2), cc = [Math.cos(a) * 1.12, 0.48 + r.range(-0.05, 0.08), Math.sin(a) * 1.12];
      const t = [-Math.sin(a), r.range(-0.2, 0.2), Math.cos(a)], L = r.range(0.4, 0.55);
      k.add(rod([cc[0] - t[0] * L, cc[1] - t[1] * L, cc[2] - t[2] * L], [cc[0] + t[0] * L, cc[1] + t[1] * L, cc[2] + t[2] * L], 0.05, 0.035, 4), shade(twig, r.range(-0.05, 0.12)), { noInk: true });
    }
    // The shell, open at the top with a zig-zag rim (inside a shade darker).
    const ey = 1.12, eH = 1.85, eR = 0.92, th0 = 0.95, ytop = Math.cos(th0);
    const eggPart = (t0, tl, zig) => {
      const g = new THREE.SphereGeometry(1, 16, 9, 0, TAU, t0, tl), P = g.attributes.position;
      for (let i = 0; i < P.count; i++) {
        let y = P.getY(i);
        const f = 1 - 0.16 * y, x = P.getX(i) * f * eR, z = P.getZ(i) * f * eR;
        if (Math.abs(y - ytop) < 1e-4) y += (Math.round((Math.atan2(z, x) / TAU + 1) * 16) % 2 ? 1 : -0.6) * zig;
        P.setXYZ(i, x, y * eH / 2, z);
      }
      g.computeVertexNormals();
      return g;
    };
    k.add(eggPart(th0, Math.PI - th0, 0.1), ec[0], { p: [0, ey, 0], grad: 0.18 });
    k.add(flip(eggPart(th0, Math.PI - th0, 0.1)), shade(ec[0], -0.2), { s: 0.96, p: [0, ey, 0], noInk: true });
    const rimY = ey + ytop * eH / 2;
    for (let i = 0; i < 18; i++) {
      const y = ey + (((i * 0.618) % 1) * 2 - 1) * 0.8, a = i * 2.4 + 0.5;
      if (y > rimY - 0.15) continue;
      const yn = (y - ey) / (eH / 2), R = eR * (1 - 0.16 * yn) * Math.sqrt(Math.max(0, 1 - yn * yn)), sz = 0.13 + 0.07 * ((i * 7) % 3) / 2;
      k.add(orient(place(new THREE.SphereGeometry(1, 7, 3), { s: [sz, 0.04, sz] }), [Math.cos(a), 0.3 * yn, Math.sin(a)], [Math.cos(a) * R, y, Math.sin(a) * R]), ec[1], { noInk: true });
    }
    // The baby: a round head with a happy face, little hands on the rim, the cap on its head.
    const hc = [0, rimY + 0.22, 0.06], hR = [0.6, 0.52, 0.56];
    k.add(new THREE.SphereGeometry(1, 14, 10), skinPaint(c, seed, 0.25), { s: hR, p: hc });
    happyFace(k, hc, hR, 1, null, { eye: 0.2, eyeUp: 0.32, eyeSide: 0.52, smileW: 0.4, smileY: -0.32, skin: c.skin });
    [-1, 1].forEach((s) => k.add(ico(1, 1), c.skin, { s: [0.13, 0.1, 0.12], p: [s * 0.5, rimY + 0.04, 0.5] }));
    const cap = eggPart(0, th0, 0.1).translate(0, -ytop * eH / 2, 0);
    k.add(cap, ec[0], { r: [-0.3, 0, 0.32], p: [0.1, hc[1] + hR[1] * 0.72, hc[2] - 0.08], grad: 0.15 });
    k.add(orient(place(ico(1, 1), { s: [0.14, 0.04, 0.14] }), [0.3, 0.8, 0.4], [0.28, hc[1] + hR[1] * 0.72 + 0.26, hc[2] + 0.12]), ec[1], { noInk: true });
    const out = sizeHazard(k, [2.8, 2.45, 2.6]);
    shadow(out, 3.4, 3.1);
    return out;
  });

  /** Roller: a mossy log rolling end-over-end, its cut ends showing their rings. */
  hazard('rolling_log', 'roller', 'dino', (r) => {
    const k = new Kit(r, true), R = 1.0, L = 2.4, node = new THREE.Group(), seed = r.next() * 99;
    node.position.y = R;
    const bark = pick(BARK, r, 0.03), dark = shade(bark, -0.1), moss = pick(MOSS, r, 0.03);
    k.add(bumpN(new THREE.CylinderGeometry(0.96, 0.96, L - 0.04, 12, 3, true), 0.025, seed), (cx, cy, cz) => {
      if (cy > 0.55 && hash3(Math.round(cx * 3), 0, Math.round(cz * 3), seed) > -0.3) return moss;
      return Math.floor((Math.atan2(cy, cx) / TAU + 0.5) * 12) % 2 ? bark : dark;
    }, { r: [HALF_PI, 0, 0], jit: 0.05 }, node);
    const rings = [0x6a4a2a, 0xe2bf86, 0xf3d9a4, 0xe2bf86, 0xf3d9a4, bark];
    [-1, 1].forEach((s) => {
      k.add(disc([0.12, 0.3, 0.5, 0.68, 0.84, 0.96], 12), (cx, cy) => rings[Math.min(5, Math.floor(Math.hypot(cx, cy) / 0.96 * 5.99))],
        { r: [s * HALF_PI, 0, 0], p: [0, 0, s * L / 2] }, node);
    });
    for (let i = 0; i < 3; i++) {
      const a = 0.9 + i * 0.6 + r.range(-0.1, 0.1), z = (i - 1) * 0.7;
      k.add(ico(1, 1), moss, { s: [0.28, 0.1, 0.34], r: [0, 0, a - HALF_PI], p: [Math.cos(a) * 0.96, Math.sin(a) * 0.96, z] }, node);
    }
    centreBall(node, R);
    A.ink(node, 0.05);
    const roll = keep(node);
    roll.name = 'roll';
    k.root.add(roll);
    const out = finish(k);
    out.userData.rollRadius = R;
    out.userData.rollNode = roll;
    return out;
  });

  /** Geyser: a rocky hot-spring pool that bursts into a steaming 6 m water spout. */
  hazard('hot_spring', 'geyser', 'dino', (r) => {
    const k = new Kit(r, true), stone = pick(OCHRE, r, 0.02), crusts = [0xfff0c8, 0xffb45a, 0xff8a4a];
    k.add(new THREE.CylinderGeometry(0.85, 1.05, 0.3, 12), stone, { p: [0, 0.15, 0], jit: 0.05 });
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * TAU + r.range(-0.12, 0.12), R = r.range(0.28, 0.36), crust = crusts[i % 3];
      k.add(lump(new THREE.DodecahedronGeometry(1, 0), 0.12, i), (cx, cy) => (cy > R * 0.75 ? crust : stone), { s: [R * 1.3, R * 0.85, R], r: [0, -a, 0], p: [Math.cos(a) * 0.98, R * 0.42, Math.sin(a) * 0.98], jit: 0.05 });
    }
    k.add(disc([0.3, 0.55, 0.7], 14), (cx, cy, cz) => (Math.hypot(cx, cz) < 0.33 ? 0xbff6f2 : (Math.hypot(cx, cz) < 0.58 ? 0x5fd6dc : 0x2fa8c0)), { p: [0, 0.31, 0], noInk: true });
    puff(k, 0.2, 0.55, 0.1, 0.16, 1, [WHITE, 0xd8eef0], 7);
    puff(k, -0.15, 0.7, -0.1, 0.12, 1, [WHITE, 0xd8eef0], 7);
    A.ink(k.root, 0.05);
    const out = finish(k);
    const ck = new Kit(r, true);
    ck.add(new THREE.CylinderGeometry(0.46, 0.6, 5.2, 9, 1, true), (cx, cy, cz) => (Math.floor(Math.atan2(cz, cx) / TAU * 9 + 9 + cy * 0.6) % 2 ? 0xbff2ff : 0x8fdcf2), { p: [0, 2.85, 0], noInk: true });
    // Steam puffs spiralling round the spout and a frothy crown on top.
    for (let i = 0; i < 16; i++) {
      const t = i / 16, a = t * 2.6 * TAU + (i % 2) * Math.PI, R = 0.3 + 0.14 * ((i * 5) % 4) / 3, rr = 0.8 - R;
      puff(ck, Math.cos(a) * rr, 0.5 + t * 4.8, Math.sin(a) * rr, R, 0.9, [WHITE, 0xcfe6ee], 8);
    }
    [[0, 5.6, 0, 0.45], [0.38, 5.42, 0.1, 0.36], [-0.36, 5.46, -0.2, 0.38], [0.05, 5.38, 0.4, 0.34], [-0.1, 5.4, -0.42, 0.32]].forEach(([x, y, z, R]) => puff(ck, x, y, z, R, 0.9, [WHITE, 0xcfe6ee], 9));
    A.ink(ck.root, 0.045);
    const column = flagInk(A.mergeByMaterial(ck.root));
    geyserRig(out, column);
    spin({ root: out }, column, 'y', 1.5);
    return out;
  });

  /** Puddle: a glossy black tar pool with slow bubbles. */
  hazard('tar_puddle', 'puddle', 'dino', (r) => {
    const k = new Kit(r, true), HW = 1.7, HL = 2.86, sa = r.range(0, TAU);
    const shape = puddleBase(k, [0.25, 0.45, 0.62, 0.78, 0.9, 0.955, 1], (rho, x, z) => {
      const a = Math.atan2(z / HL, x / HW), da = Math.abs(((a - sa + Math.PI * 3) % TAU) - Math.PI);
      if (rho > 0.5 && rho < 0.7 && da < 0.9) return TAR_SHEEN;
      return rho > 0.82 ? 0x3a2c3a : TAR;
    }, 0x0c0810, HW, HL);
    for (let i = 0; i < 5; i++) {
      const a = r.range(0, TAU), d = Math.sqrt(r.next()) * 0.6 * shape(a), x = Math.cos(a) * d * HW, z = Math.sin(a) * d * HL, R = r.range(0.14, 0.32);
      k.add(new THREE.SphereGeometry(1, 10, 5, 0, TAU, 0, HALF_PI), (cx, cy) => (cy > 0.02 + R * 0.55 ? 0x6a5a8a : TAR), { s: [R, R * 0.8, R], p: [x, 0.02, z] });
      k.add(ico(1, 0), WHITE, { s: [R * 0.22, R * 0.12, R * 0.16], p: [x - R * 0.3, 0.02 + R * 0.62, z - R * 0.35], noInk: true });
    }
    A.ink(k.root, 0.035);
    return finish(k, 0.02);
  });

  /* ── River and tar-pit dressing ─────────────────────────────────────── */

  prop('river_ferns', (r) => {
    const k = new Kit(r);
    dinoRock(k, r.range(-0.6, 0.6), 0.32, r.range(-0.4, 0.4), 0.85, 0.6, { cols: STONE, moss: 0.3 });
    fernCrown(k, -1.3, 0, 0.3, 8, 2.2, 0.5, { a0: 0.95, curl: 1.5, segs: 7 });
    fernCrown(k, 1.35, 0, -0.45, 7, 1.9, 0.45, { a0: 1.0, curl: 1.5, segs: 6 });
    fernCrown(k, 0.2, 0, 1.45, 6, 1.5, 0.4, { a0: 1.05, curl: 1.5, segs: 5 });
    // Cattails and sword-leaved reeds at the water's edge.
    for (let i = 0; i < 6; i++) {
      const x = r.range(-0.9, 1.2), z = r.range(-1.6, -0.6), h = r.range(1.7, 2.5), lx = r.range(-0.15, 0.15);
      k.add(rod([x, 0, z], [x + lx, h, z], 0.035, 0.025, 4, true), 0x5a9a3a);
      k.add(new THREE.CylinderGeometry(0.075, 0.075, 0.42, 6), 0x8a5a2a, { p: [x + lx * (h - 0.35) / h, h - 0.35, z] });
    }
    for (let i = 0; i < 9; i++) {
      const len = r.range(1.3, 1.9);
      const g = paintFaces(twoSided(leafGeo(len, 0.09, { n: 4, a0: r.range(1.25, 1.45), curl: 0.7, fold: 0, shape: 0.7 })), (cx, cy) => mixHex(0x3f8a3a, 0x9fd66a, cy / len), r, {});
      k.add(g, null, { r: [0, r.range(0, TAU), 0], order: 'YZX', p: [r.range(-1.2, 1.4), 0, r.range(-1.4, -0.4)] });
    }
    return finish(k);
  });

  prop('tar_bubbles', (r) => {
    const k = new Kit(r), shape = blobShape(r, 0.12), sa = r.range(0, TAU);
    // A glossy slick a hair above the tar, with a lilac sheen across it.
    k.add(disc([0.3, 0.55, 0.75, 0.9, 1], 20, shape), (cx, cy, cz) => {
      const rho = Math.hypot(cx, cz) / 3.1, a = Math.atan2(cz, cx), da = Math.abs(((a - sa + Math.PI * 3) % TAU) - Math.PI);
      return rho > 0.45 && rho < 0.7 && da < 0.8 ? TAR_SHEEN : (rho > 0.85 ? 0x1c1422 : 0x2c2234);
    }, { s: [3.1, 1, 3.1], p: [0, 0.03, 0], jit: 0.03 });
    const nodes = [], bp = [];
    for (let i = 0; i < 7; i++) {
      const a = i * 2.4 + r.range(-0.3, 0.3), d = i ? r.range(0.9, 2.3) : 0.2, x = Math.cos(a) * d * shape(a), z = Math.sin(a) * d * shape(a);
      const R = i ? r.range(0.35, 0.7) : 0.9, b = new THREE.Group(), ring = new THREE.Group();
      k.add(new THREE.SphereGeometry(1, 12, 6, 0, TAU, 0, HALF_PI), (cx, cy) => (cy > R * 0.62 ? 0x7a6a9a : (cy > R * 0.35 ? 0x3e3250 : TAR)), { s: [R, R * 0.85, R], p: [x, 0, z] }, b);
      k.add(ico(1, 0), WHITE, { s: [R * 0.2, R * 0.1, R * 0.15], p: [x - R * 0.32, R * 0.7, z - R * 0.32] }, b);
      k.add(new THREE.TorusGeometry(R * 1.1, 0.05, 3, 16), TAR_SHEEN, { r: [HALF_PI, 0, 0], p: [x, 0.05, z] }, ring);
      nodes.push(b, ring);
      bp.push({ c: [x, 0, z], T: r.range(3.2, 5.2), ph: r.range(0, 5) });
    }
    rig(k, nodes, LIT(), (g, t, M) => {
      const q = bp[g >> 1], u = ((t + q.ph) % q.T) / q.T;
      let s;
      if (g % 2 === 0) s = u < 0.86 ? 0.3 + 0.7 * Math.sin(u / 0.86 * HALF_PI) : Math.max(0.001, 1 - (u - 0.86) / 0.08);
      else s = u > 0.88 ? 1 + (u - 0.88) / 0.12 * 1.3 : 0.001;
      aboutPivot(M, q.c, 0, 0, 0, s, g % 2 === 0 ? s : 1, s);
    }, 1.6);
    return finishAt(k);
  });

  prop('tar_bones', (r) => {
    const k = new Kit(r), seed = r.next() * 99;
    const bone = (cx, cy, cz) => (cy < 0.25 ? 0x8a7866 : (hash3(Math.round(cx * 3), Math.round(cy * 3), Math.round(cz * 3), seed) > 0.55 ? BONE_SH : BONE));
    const collar = (x, z, R) => {
      k.add(new THREE.TorusGeometry(R, R * 0.35, 4, 12), TAR, { r: [HALF_PI, 0, 0], s: [1, 1, 0.6], p: [x, 0.02, z] });
      k.add(new THREE.TorusGeometry(R * 1.05, 0.03, 3, 12), TAR_SHEEN, { r: [HALF_PI, 0, 0], p: [x, R * 0.2, z] });
    };
    // A row of ribs arching up out of the tar along a sunken backbone.
    const H = [2.6, 3.2, 3.3, 2.7];
    H.forEach((h, i) => {
      const z = -1.6 + i * 1.05 + r.range(-0.08, 0.08), lean = r.range(-0.08, 0.08);
      const pts = [[-1.3, -0.6, z], [-1.1, h * 0.55, z], [-0.3, h, z + lean], [0.7, h * 0.92, z + lean], [1.3, h * 0.55, z + lean * 2]];
      k.add(limb(pts, (t) => 0.3 - 0.12 * t, 18, 6), bone, { jit: 0.03 });
      k.add(ico(1, 1), BONE, { s: 0.19, p: pts[4] });
      collar(-1.28, z, 0.32);
    });
    for (let i = 0; i < 5; i++) {
      const z = -2.0 + i * 1.0;
      k.add(new THREE.CylinderGeometry(0.34, 0.34, 0.5, 8), bone, { r: [HALF_PI, 0, 0], p: [-1.55, -0.12, z] });
      k.add(ico(1, 1), BONE, { s: [0.16, 0.26, 0.2], p: [-1.55, 0.26, z] });
    }
    // A big thigh bone leaning out of the tar, with a little flower growing on its knob.
    const fa = [2.3, -0.6, 1.0], fb = [3.0, 2.5, 1.5];
    k.add(rod(fa, fb, 0.26, 0.22, 8), bone, { jit: 0.03 });
    [-1, 1].forEach((s) => k.add(ico(1, 1), bone, { s: [0.36, 0.34, 0.34], p: [fb[0] + s * 0.24, fb[1] + 0.12, fb[2] + s * 0.06] }));
    collar(2.45, 1.1, 0.42);
    const fl = [fb[0], fb[1] + 0.48, fb[2]];
    k.add(rod([fb[0], fb[1] + 0.3, fb[2]], fl, 0.03, 0.03, 4), 0x5aa83e);
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * TAU;
      k.add(ico(1, 1), 0xff9ab8, { s: [0.12, 0.04, 0.08], r: [0, -a, 0], p: [fl[0] + Math.cos(a) * 0.12, fl[1], fl[2] + Math.sin(a) * 0.12] });
    }
    k.add(ico(1, 0), 0xffd23f, { s: 0.07, p: [fl[0], fl[1] + 0.03, fl[2]] });
    return finishAt(k);
  });

  /* ── Rib arch: a pair of giant fossil ribs meeting over the road ─────── */
  prop('rib_arch', (r) => {
    const k = new Kit(r), seed = r.next() * 99;
    const bone = (cx, cy, cz) => (cy < 1.2 ? 0xc8ae84 : (hash3(Math.round(cx * 0.9), Math.round(cy * 0.9), Math.round(cz * 0.9), seed) > 0.5 ? BONE_SH : BONE));
    [-1, 1].forEach((s) => {
      const pts = [[s * 15.2, -0.8, 0], [s * 15.15, 4, 0], [s * 14.7, 9, 0], [s * 13.9, 12.6, 0], [s * 11.0, 15.4, 0], [s * 6.2, 16.9, 0], [s * 1.7, 17.3, 0]];
      k.add(limb(pts, (t) => 1.85 - 0.75 * t, 44, 8), bone, { s: [1, 1, 0.74], jit: 0.03 });
      dinoRock(k, s * 15.2, 0.5, 0, 2.3, 0.55, { moss: 0.2, d: 0.52, yaw: 0 });
      lobe(k, s * 16.7, 3.2, 0.2, 0.9, pick(MOSS, r, 0.03), 0.6);
      lobe(k, s * 16.4, 6.5, -0.3, 0.7, pick(MOSS, r, 0.03), 0.6);
      fernCrown(k, s * 17.3, 0.3, 0.1, 6, 1.5, 0.36, { a0: 0.9, curl: 1.5, segs: 5 });
      fernCrown(k, s * 13.6, 0.1, 0.6, 4, 1.0, 0.3, { a0: 1.1, curl: 1.5, segs: 4 });
    });
    // The vertebra where the ribs meet, with a rounded spine knob and two side wings.
    k.add(new THREE.CylinderGeometry(1.5, 1.5, 2.3, 12), bone, { r: [HALF_PI, 0, 0], p: [0, 17.3, 0], jit: 0.03 });
    [-1, 1].forEach((s) => k.add(new THREE.CylinderGeometry(1.75, 1.75, 0.22, 14), BONE_SH, { r: [HALF_PI, 0, 0], p: [0, 17.3, s * 1.15] }));
    k.add(ico(1, 1), BONE, { s: [0.8, 1.3, 0.95], p: [0, 19.1, 0], jit: 0.03 });
    [-1, 1].forEach((s) => k.add(rod([0, 17.8, 0], [s * 3.2, 18.6, 0], 0.6, 0.4, 6), bone, { jit: 0.03 }));
    clearOpening(k.root, 0.25);
    k.root.userData.faceRoad = true;
    const out = finishAt(k);
    clearOpening(out, 0.25);
    return out;
  });

  return { THEMES, DRESSING };
})();
