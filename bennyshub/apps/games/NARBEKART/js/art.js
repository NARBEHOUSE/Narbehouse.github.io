/**
 * NARBE Racer — art kit core.
 *
 * Everything in the game is built procedurally from primitives: no model or
 * texture files. This file holds the shared toolbox every builder uses —
 * cached materials, the part() helper, cartoon outlines, merging and the base
 * canvas textures. Item meshes, effects and set pieces extend NK.art further
 * down this file; theme props live in props.js, racers in roster.js.
 *
 * House style: chunky, toy-like low-poly with big readable silhouettes and
 * saturated colour. Karts, characters and items use MeshToonMaterial (a crisp
 * three-step cel ramp); the world uses flat-shaded Lambert. Anything the player
 * has to react to wears a dark outline — the cheapest contrast there is for a
 * low-vision player (the same rule Race Tracks follows with its ink lines).
 *
 * Rules for everything built with this kit:
 *   - Models face -Z and sit with their lowest point at y = 0.
 *   - Materials from NK.art.mat are SHARED and cached. Never mutate one; call
 *     .clone() first if an object needs its own colour/opacity/emissive.
 *   - Emissive colours must be deep: under NoToneMapping light ones blow out.
 */
NK.art = (function () {
  'use strict';

  const INK = 0x1d1b2e;          // outline / trim colour: a deep blue-black

  /* ── Toon ramp ───────────────────────────────────────────────────────────
   * A tiny 3-texel gradient sampled with NearestFilter gives the hard cel
   * bands. Shadow band is kept fairly bright so colours stay readable.
   */
  let toonRamp = null;
  function ramp() {
    if (toonRamp) return toonRamp;
    const data = new Uint8Array([120, 120, 120, 255, 200, 200, 200, 255, 255, 255, 255, 255]);
    toonRamp = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
    toonRamp.minFilter = THREE.NearestFilter;
    toonRamp.magFilter = THREE.NearestFilter;
    toonRamp.generateMipmaps = false;
    toonRamp.needsUpdate = true;
    return toonRamp;
  }

  /* ── Material cache ───────────────────────────────────────────────────── */
  const cache = new Map();

  function norm(hex) {
    if (typeof hex === 'string') return new THREE.Color(hex).getHex();
    return hex >>> 0;
  }

  function keyOf(kind, hex, opts) {
    const o = opts || {};
    const keys = Object.keys(o).sort();
    let k = kind + '|' + norm(hex);
    for (let i = 0; i < keys.length; i++) {
      const v = o[keys[i]];
      k += '|' + keys[i] + '=' + (v && v.isTexture ? 'tex:' + v.uuid : String(v));
    }
    return k;
  }

  function common(m, o) {
    if (o.transparent) { m.transparent = true; m.opacity = o.opacity === undefined ? 1 : o.opacity; }
    if (o.depthWrite === false) m.depthWrite = false;
    if (o.side === 'double') m.side = THREE.DoubleSide;
    else if (o.side === 'back') m.side = THREE.BackSide;
    if (o.fog === false) m.fog = false;
    if (o.vertexColors) m.vertexColors = true;
    if (o.map) m.map = o.map;
    return m;
  }

  /** Cel-shaded: karts, characters, items, anything "alive". */
  function toon(hex, opts) {
    const o = opts || {};
    const k = keyOf('toon', hex, o);
    let m = cache.get(k);
    if (m) return m;
    m = new THREE.MeshToonMaterial({ color: norm(hex), gradientMap: ramp() });
    if (o.emissive !== undefined) { m.emissive = new THREE.Color(norm(o.emissive)); m.emissiveIntensity = o.emissiveIntensity === undefined ? 1 : o.emissiveIntensity; }
    common(m, o);
    cache.set(k, m);
    return m;
  }

  /** Flat-shaded matte: terrain, props, buildings. */
  function lambert(hex, opts) {
    const o = opts || {};
    const k = keyOf('lambert', hex, o);
    let m = cache.get(k);
    if (m) return m;
    m = new THREE.MeshLambertMaterial({ color: norm(hex), flatShading: o.smooth ? false : true });
    if (o.emissive !== undefined) { m.emissive = new THREE.Color(norm(o.emissive)); m.emissiveIntensity = o.emissiveIntensity === undefined ? 1 : o.emissiveIntensity; }
    common(m, o);
    cache.set(k, m);
    return m;
  }

  /** Physically based, for the odd glossy thing (chrome trim, candy, ice). */
  function standard(hex, opts) {
    const o = opts || {};
    const k = keyOf('std', hex, o);
    let m = cache.get(k);
    if (m) return m;
    m = new THREE.MeshStandardMaterial({
      color: norm(hex),
      roughness: o.roughness === undefined ? 0.6 : o.roughness,
      metalness: o.metalness === undefined ? 0 : o.metalness,
      flatShading: o.smooth ? false : true
    });
    if (o.emissive !== undefined) { m.emissive = new THREE.Color(norm(o.emissive)); m.emissiveIntensity = o.emissiveIntensity === undefined ? 1 : o.emissiveIntensity; }
    common(m, o);
    cache.set(k, m);
    return m;
  }

  /** Self-lit: pads, lamps, lava, boost flames. Keep the colour deep. */
  function glow(hex, intensity, opts) {
    const o = Object.assign({}, opts || {});
    o.emissive = norm(hex);
    o.emissiveIntensity = intensity === undefined ? 1 : intensity;
    return lambert(hex, o);
  }

  /** Unlit: sky, sprites, particles, HUD-ish world markers. */
  function basic(hex, opts) {
    const o = opts || {};
    const k = keyOf('basic', hex, o);
    let m = cache.get(k);
    if (m) return m;
    m = new THREE.MeshBasicMaterial({ color: norm(hex) });
    common(m, o);
    cache.set(k, m);
    return m;
  }

  /** Shared vertex-colour materials: paint parts with paint() and they all
   *  weld into ONE mesh per object, whatever colours they are. */
  const toonV = (opts) => toon(0xffffff, Object.assign({ vertexColors: true }, opts || {}));
  const lambertV = (opts) => lambert(0xffffff, Object.assign({ vertexColors: true }, opts || {}));

  const mat = { toon, lambert, standard, glow, basic, toonV, lambertV, ramp, INK };

  /* ── Vertex colour ───────────────────────────────────────────────────────
   * Bake a flat colour into a geometry's 'color' attribute (linear space, as
   * three r155's colour management expects). A dozen differently coloured
   * parts painted this way and drawn with mat.toonV()/lambertV() merge into a
   * single draw call — the main tool for keeping karts and props cheap.
   */
  const _c = new THREE.Color();
  function paint(geo, hex, jitter) {
    _c.set(norm(hex));
    const n = geo.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      // Optional per-vertex lightness jitter (0..1) keeps big flat props lively.
      const j = jitter ? 1 + (Math.sin(i * 12.9898) * 43758.5453 % 1) * jitter : 1;
      arr[i * 3] = _c.r * j; arr[i * 3 + 1] = _c.g * j; arr[i * 3 + 2] = _c.b * j;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return geo;
  }

  /** part() with a painted geometry on the shared toon (or lambert) vertex-colour material. */
  function partV(geo, hex, opts) {
    const o = opts || {};
    return part(paint(geo, hex, o.jitter), o.lambert ? lambertV() : toonV(), o);
  }

  /* ── part() ───────────────────────────────────────────────────────────── */

  /**
   * One mesh, positioned. Shadows default to off: the game uses blob shadows
   * for karts and only lets big static scenery cast (see world.js).
   * @param {object} [opts] { pos:[x,y,z], rot:[x,y,z], scale:n|[x,y,z],
   *                          cast, receive, name, outline: thickness|true }
   */
  function part(geo, material, opts) {
    const o = opts || {};
    const m = new THREE.Mesh(geo, material);
    m.castShadow = !!o.cast;
    m.receiveShadow = !!o.receive;
    if (o.pos) m.position.set(o.pos[0], o.pos[1], o.pos[2]);
    if (o.rot) m.rotation.set(o.rot[0], o.rot[1], o.rot[2]);
    if (o.scale !== undefined) {
      if (typeof o.scale === 'number') m.scale.setScalar(o.scale);
      else m.scale.set(o.scale[0], o.scale[1], o.scale[2]);
    }
    if (o.name) m.name = o.name;
    if (o.outline) outline(m, o.outline === true ? undefined : o.outline);
    return m;
  }

  /* ── Cartoon outlines (inverted hull) ─────────────────────────────────────
   * A back-face-only copy of the geometry, pushed out along smoothed normals
   * and drawn in ink. Flat-shaded primitives have split normals at every hard
   * edge, which would tear the shell open; averaging the normals of vertices
   * that share a position keeps it watertight. Thickness is in the mesh's own
   * units, so outline after sizing the geometry, not after scaling the mesh.
   */
  const inkBack = () => basic(INK, { side: 'back' });

  function shellGeometry(geo, thickness) {
    const src = geo.index ? geo.toNonIndexed() : geo.clone();
    const pos = src.attributes.position;
    if (!src.attributes.normal) src.computeVertexNormals();
    const nor = src.attributes.normal;
    const acc = new Map();
    const key = (i) => pos.getX(i).toFixed(3) + ',' + pos.getY(i).toFixed(3) + ',' + pos.getZ(i).toFixed(3);
    for (let i = 0; i < pos.count; i++) {
      const k = key(i);
      let a = acc.get(k);
      if (!a) { a = [0, 0, 0]; acc.set(k, a); }
      a[0] += nor.getX(i); a[1] += nor.getY(i); a[2] += nor.getZ(i);
    }
    const out = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const a = acc.get(key(i));
      const l = Math.hypot(a[0], a[1], a[2]) || 1;
      out[i * 3] = pos.getX(i) + (a[0] / l) * thickness;
      out[i * 3 + 1] = pos.getY(i) + (a[1] / l) * thickness;
      out[i * 3 + 2] = pos.getZ(i) + (a[2] / l) * thickness;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(out, 3));
    g.computeVertexNormals();
    src.dispose();
    return g;
  }

  /** Give a mesh an ink outline. Returns the shell (a child of the mesh). */
  function outline(mesh, thickness) {
    if (!mesh || !mesh.geometry) return null;
    const shell = new THREE.Mesh(shellGeometry(mesh.geometry, thickness === undefined ? 0.06 : thickness), inkBack());
    shell.userData.outline = true;
    shell.castShadow = false;
    shell.receiveShadow = false;
    shell.raycast = function () {};
    mesh.add(shell);
    return shell;
  }

  /** Outline every mesh under a group (skips existing shells). */
  function ink(root, thickness) {
    const targets = [];
    root.traverse((o) => { if (o.isMesh && !o.userData.outline && !o.userData.noOutline) targets.push(o); });
    targets.forEach((m) => outline(m, thickness));
    return root;
  }

  /* ── Merging ─────────────────────────────────────────────────────────────
   * Draw calls, not triangles, are what hurt on a tablet (Race Tracks went
   * from ~3900 to ~200 by welding). mergeByMaterial() bakes every mesh under a
   * root into one mesh per material, in the root's local space.
   *
   * Anything that must keep moving on its own (wheels, a head that turns, a
   * spinning windmill hub) is marked userData.keep = true; it is left as a
   * separate child, still positioned correctly, and never welded.
   */
  const _m = new THREE.Matrix4();
  const _inv = new THREE.Matrix4();
  const _v = new THREE.Vector3();
  const _n3 = new THREE.Matrix3();

  function weld(entries) {
    // entries: [{ geo, matrix }]
    let vCount = 0;
    const parts = entries.map((e) => {
      const g = e.geo.index ? e.geo.toNonIndexed() : e.geo;
      vCount += g.attributes.position.count;
      return { g: g, matrix: e.matrix, owned: g !== e.geo };
    });
    const pos = new Float32Array(vCount * 3);
    const nor = new Float32Array(vCount * 3);
    let hasUv = parts.every((p) => !!p.g.attributes.uv);
    let hasCol = parts.some((p) => !!p.g.attributes.color);
    const uv = hasUv ? new Float32Array(vCount * 2) : null;
    const col = hasCol ? new Float32Array(vCount * 3) : null;
    let o = 0;
    for (let k = 0; k < parts.length; k++) {
      const p = parts[k];
      const P = p.g.attributes.position, N = p.g.attributes.normal, T = p.g.attributes.uv, C = p.g.attributes.color;
      _n3.getNormalMatrix(p.matrix);
      for (let i = 0; i < P.count; i++) {
        _v.fromBufferAttribute(P, i).applyMatrix4(p.matrix);
        pos[(o + i) * 3] = _v.x; pos[(o + i) * 3 + 1] = _v.y; pos[(o + i) * 3 + 2] = _v.z;
        if (N) {
          _v.fromBufferAttribute(N, i).applyMatrix3(_n3).normalize();
          nor[(o + i) * 3] = _v.x; nor[(o + i) * 3 + 1] = _v.y; nor[(o + i) * 3 + 2] = _v.z;
        }
        if (uv && T) { uv[(o + i) * 2] = T.getX(i); uv[(o + i) * 2 + 1] = T.getY(i); }
        if (col) {
          if (C) { col[(o + i) * 3] = C.getX(i); col[(o + i) * 3 + 1] = C.getY(i); col[(o + i) * 3 + 2] = C.getZ(i); }
          else { col[(o + i) * 3] = 1; col[(o + i) * 3 + 1] = 1; col[(o + i) * 3 + 2] = 1; }
        }
      }
      o += P.count;
      if (p.owned) p.g.dispose();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    if (uv) g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    if (col) g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }

  /**
   * Weld everything under `root` (except userData.keep subtrees) into one mesh
   * per material. Returns a NEW Group whose children are the welded meshes plus
   * the kept subtrees; `root.userData` is copied across. Source geometries of
   * welded meshes are disposed. The result keeps root's own transform.
   */
  function mergeByMaterial(root) {
    root.updateMatrixWorld(true);
    _inv.copy(root.matrixWorld).invert();
    const buckets = new Map();
    const kept = [];

    (function walk(obj) {
      for (let i = 0; i < obj.children.length; i++) {
        const c = obj.children[i];
        if (c.userData && c.userData.keep) { kept.push(c); continue; }
        if (c.isMesh && !c.isInstancedMesh && !c.isSkinnedMesh) {
          const mt = c.material;
          if (Array.isArray(mt)) { kept.push(c); continue; }
          const k = mt.uuid + '|' + (c.castShadow ? 1 : 0) + (c.receiveShadow ? 1 : 0);
          let b = buckets.get(k);
          if (!b) { b = { mat: mt, cast: c.castShadow, receive: c.receiveShadow, list: [] }; buckets.set(k, b); }
          _m.multiplyMatrices(_inv, c.matrixWorld);
          b.list.push({ geo: c.geometry, matrix: _m.clone() });
        } else if (c.isLine || c.isPoints || c.isSprite) {
          kept.push(c);
          continue;
        }
        walk(c);
      }
    })(root);

    const out = new THREE.Group();
    out.name = root.name;
    out.position.copy(root.position);
    out.quaternion.copy(root.quaternion);
    out.scale.copy(root.scale);
    out.userData = root.userData;

    buckets.forEach((b) => {
      const mesh = new THREE.Mesh(weld(b.list), b.mat);
      mesh.castShadow = b.cast;
      mesh.receiveShadow = b.receive;
      out.add(mesh);
      b.list.forEach((e) => e.geo.dispose());
    });

    // Re-parent kept subtrees with their transform expressed relative to root.
    kept.forEach((c) => {
      c.updateMatrixWorld(true);
      _m.multiplyMatrices(_inv, c.matrixWorld);
      if (c.parent) c.parent.remove(c);
      _m.decompose(c.position, c.quaternion, c.scale);
      out.add(c);
    });
    return out;
  }

  /** Dispose every geometry under a root (materials are shared — never disposed). */
  function disposeTree(root) {
    const seen = new Set();
    root.traverse((o) => {
      if (o.geometry && !seen.has(o.geometry.uuid)) { seen.add(o.geometry.uuid); o.geometry.dispose(); }
    });
  }

  /* ── Canvas textures ──────────────────────────────────────────────────── */

  function canvasTex(w, h, draw, opts) {
    const o = opts || {};
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const g = cv.getContext('2d');
    draw(g, w, h);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    if (o.repeat) { t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping; }
    if (o.wrapS) t.wrapS = o.wrapS;
    if (o.wrapT) t.wrapT = o.wrapT;
    if (o.nearest) { t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; }
    t.anisotropy = o.anisotropy || 4;
    t.needsUpdate = true;
    return t;
  }

  const texCache = new Map();
  function cachedTex(key, make) {
    let t = texCache.get(key);
    if (!t) { t = make(); texCache.set(key, t); }
    return t;
  }

  /** Vertical sky gradient for a BackSide sphere. */
  function sky(top, mid, horizon) {
    return cachedTex('sky|' + top + mid + horizon, () => canvasTex(8, 256, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, top);
      gr.addColorStop(0.55, mid);
      gr.addColorStop(1, horizon);
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
    }));
  }

  /** Checkerboard, e.g. the start/finish band. */
  function checker(cols, rows, a, b) {
    cols = cols || 8; rows = rows || 2;
    a = a || '#fdfdfd'; b = b || '#1d1b2e';
    return cachedTex('checker|' + cols + 'x' + rows + a + b, () => canvasTex(cols * 32, rows * 32, (g) => {
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          g.fillStyle = ((i + j) % 2 === 0) ? a : b;
          g.fillRect(i * 32, j * 32, 32, 32);
        }
      }
    }, { nearest: true }));
  }

  /** Soft round shadow for blob shadows under karts, items and props. */
  function blob() {
    return cachedTex('blob', () => {
      const t = canvasTex(128, 128, (g, w, h) => {
        const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
        gr.addColorStop(0, 'rgba(0,0,0,0.55)');
        gr.addColorStop(0.55, 'rgba(0,0,0,0.32)');
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr;
        g.fillRect(0, 0, w, h);
      });
      t.colorSpace = THREE.NoColorSpace;
      return t;
    });
  }

  /** Round soft glow sprite for sparks, lamps and item auras (white; tint via material colour). */
  function glowSprite() {
    return cachedTex('glowSprite', () => {
      const t = canvasTex(64, 64, (g, w, h) => {
        const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
        gr.addColorStop(0, 'rgba(255,255,255,1)');
        gr.addColorStop(0.35, 'rgba(255,255,255,0.8)');
        gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr;
        g.fillRect(0, 0, w, h);
      });
      t.colorSpace = THREE.NoColorSpace;
      return t;
    });
  }

  const tex = { canvas: canvasTex, cached: cachedTex, sky, checker, blob, glowSprite };

  /* ── Small shared shapes ──────────────────────────────────────────────── */

  /** A flat, transparent quad lying on the ground (y = 0.02) for blob shadows. */
  function blobShadow(size) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size),
      basic(0x000000, { transparent: true, opacity: 1, depthWrite: false, map: blob() }));
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.03;
    m.renderOrder = 1;
    m.userData.noOutline = true;
    return m;
  }

  /** Tint helper: THREE.Color → '#rrggbb'. */
  function css(hex) { return '#' + new THREE.Color(norm(hex)).getHexString(); }

  /* ── Extension point ─────────────────────────────────────────────────────
   * The item meshes, effects and set pieces (items, fx, drone, startGantry,
   * podium, trophy, glider, tex.road, tex.rainbow, tex.pad …) are added to this
   * object below, and props.js attaches NK.art.props / NK.art.hazard. Keep the
   * helper signatures above stable — other modules depend on them.
   */
  return {
    INK,
    mat, part, partV, paint, outline, ink, mergeByMaterial, disposeTree,
    tex, blobShadow, css, norm,
    // filled in below / by props.js
    items: {}, fx: {}, props: {}, hazard: {}
  };
})();
