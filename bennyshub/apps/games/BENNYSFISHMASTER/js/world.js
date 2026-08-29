/**
 * Benny's Race Tracks — world building.
 *
 * A track is a seeded centreline: a list of nodes each carrying a position, an
 * (unwrapped, so it interpolates cleanly) heading, and a banking angle. Every
 * other piece of geometry — road, shoulders, terrain, scenery — is a ribbon
 * swept along those nodes, so the whole level is one deterministic function of
 * its seed. That is what lets competitive levels be replayed identically.
 */
RT.world = (function () {
  'use strict';

  const U = RT.util;
  const A = RT.art;

  const SEG = 4;          // metres between centreline nodes
  const ROAD_HALF = 9.5;  // half the drivable width
  const SHOULDER = 4.5;   // paved-ish verge either side

  /* ── Themes ───────────────────────────────────────────────────────────── */

  const THEMES = {
    countryside: {
      id: 'countryside',
      name: 'Sunny Countryside',
      sky: ['#3d9ee0', '#8fd2f0', '#dff2f7'],
      fog: 0xdaf0f7, fogNear: 190, fogFar: 760,
      hemiSky: 0xd6efff, hemiGround: 0x74a352, hemiInt: 2.1,
      sunColor: 0xfff4dc, sunInt: 3.1, ambInt: 0.6,
      sunDir: [-0.55, 1.0, 0.45],
      sunDisc: [0xfff3b0, 0xffd166], sunSky: [-360, 210, -520],
      road: { base: '#a89b8a', edge: '#fffaf0', lane: 'rgba(255,250,240,0.34)', center: '#ffc233', seed: 11 },
      shoulder: 0xc9b48d,
      ground: [0x7cc45c, 0x64ad4c],
      backdrop: [0x5aa84a, 0x71bd57, 0x4d9a52],
      hasTerrain: true, hasStars: false, hasClouds: true, cloudCount: 1.0
    },
    desert: {
      id: 'desert',
      name: 'Dusty Desert',
      sky: ['#ef7f52', '#ffbb82', '#ffe6c4'],
      fog: 0xffdcb4, fogNear: 175, fogFar: 700,
      hemiSky: 0xffd9a8, hemiGround: 0xcf9556, hemiInt: 2.2,
      sunColor: 0xffe6b8, sunInt: 3.2, ambInt: 0.65,
      sunDir: [0.6, 0.85, 0.35],
      sunDisc: [0xfff0c4, 0xff9e4f], sunSky: [420, 190, -560],
      road: { base: '#b28a68', edge: '#fdf6e3', lane: 'rgba(253,246,227,0.28)', center: '#f2c14e', seed: 23 },
      shoulder: 0xe3b87c,
      ground: [0xecc384, 0xd8a866],
      backdrop: [0xc38a63, 0xd9a077, 0xb0744f],
      hasTerrain: true, hasStars: false, hasClouds: true, cloudCount: 0.4
    },
    space: {
      id: 'space',
      name: 'Deep Space',
      sky: ['#170d33', '#3a1d68', '#6b3180'],
      fog: 0x241546, fogNear: 220, fogFar: 900,
      hemiSky: 0xa98ce8, hemiGround: 0x33265c, hemiInt: 1.7,
      sunColor: 0xe4eeff, sunInt: 2.5, ambInt: 1.1,
      sunDir: [0.4, 0.9, -0.5],
      sunDisc: null, sunSky: null,
      road: { base: '#423a63', edge: '#8ecae6', lane: 'rgba(142,202,230,0.32)', center: '#ffd166', seed: 37 },
      shoulder: 0x8ecae6,
      ground: null,
      backdrop: null,
      // No tarmac in space: just glowing edge rails and a see-through centre
      // line, so the track reads as a course marked out in open space.
      roadSurface: false, railWidth: 1.4, centreLine: 0x8ecae6,
      hasTerrain: false, hasStars: true, hasClouds: false, cloudCount: 0
    }
  };

  /* ── Centreline ───────────────────────────────────────────────────────── */

  /**
   * Curvature comes from three summed sine waves with seeded phases: smooth,
   * repeatable, and cheap, with no risk of the sharp kinks a random walk gives.
   */
  function buildNodes(seed, length, curviness, hilliness) {
    const r = U.rng(seed);
    const count = Math.ceil(length / SEG) + 2;

    const f1 = r.range(0.006, 0.011), p1 = r.range(0, 6.283);
    const f2 = r.range(0.017, 0.028), p2 = r.range(0, 6.283);
    const f3 = r.range(0.040, 0.062), p3 = r.range(0, 6.283);
    const h1 = r.range(0.008, 0.015), ph1 = r.range(0, 6.283);
    const h2 = r.range(0.026, 0.040), ph2 = r.range(0, 6.283);

    const nodes = [];
    let heading = 0, x = 0, z = 0, s = 0;

    for (let i = 0; i < count; i++) {
      // Ease the curvature in over the first stretch so every level starts
      // straight — the player needs a moment to settle before the first turn.
      const warm = U.smoothstep(U.clamp(i / 26, 0, 1));
      const k = curviness * warm * (
        Math.sin(i * f1 + p1) * 0.62 +
        Math.sin(i * f2 + p2) * 0.28 +
        Math.sin(i * f3 + p3) * 0.10
      );
      const y = hilliness * (Math.sin(i * h1 + ph1) * 1.0 + Math.sin(i * h2 + ph2) * 0.45) * warm;

      nodes.push({ i: i, x: x, y: y, z: z, h: heading, s: s, k: k, bank: 0 });

      heading += k * SEG;
      x += Math.sin(heading) * SEG;
      z += -Math.cos(heading) * SEG;
      s += SEG;
    }

    // Bank into the corners, smoothed so the roll never snaps.
    for (let i = 0; i < nodes.length; i++) {
      let acc = 0, n = 0;
      for (let j = Math.max(0, i - 4); j <= Math.min(nodes.length - 1, i + 4); j++) { acc += nodes[j].k; n++; }
      nodes[i].bank = U.clamp((acc / n) * 42, -0.20, 0.20);
    }
    return nodes;
  }

  /* ── Ground height ────────────────────────────────────────────────────── */

  /**
   * Vertical shift from the track's banking at a lateral offset.
   *
   * Banking pivots about the centreline, so the shift grows with distance from
   * it — which is right for the road, but ruinous further out: unclamped, a
   * 0.2 rad bank would lift terrain 500 m away by 100 m. Past the verge the
   * offset stops growing, so the landscape stays flush with the road edge and
   * level beyond it.
   */
  function bankOffset(node, off) {
    const clamped = U.clamp(off, -(ROAD_HALF + SHOULDER), ROAD_HALF + SHOULDER);
    return -clamped * Math.sin(node.bank);
  }

  /* ── Ribbon sweeping ──────────────────────────────────────────────────── */

  /**
   * Sweep a strip between two lateral offsets along the centreline.
   * @param {function} heightFn (node, lateralOffset) → extra height
   * @param {function} colorFn  (node, lateralOffset) → THREE.Color | null
   */
  function ribbon(nodes, fromOff, toOff, steps, opts) {
    opts = opts || {};
    const heightFn = opts.heightFn;
    const colorFn = opts.colorFn;
    const uScale = opts.uScale || 1;
    const vScale = opts.vScale || 1;
    const skip = opts.skip || 1;

    const rows = [];
    for (let i = 0; i < nodes.length; i += skip) rows.push(nodes[i]);
    if (rows[rows.length - 1] !== nodes[nodes.length - 1]) rows.push(nodes[nodes.length - 1]);

    const cols = steps + 1;
    const pos = new Float32Array(rows.length * cols * 3);
    const uv = new Float32Array(rows.length * cols * 2);
    const col = colorFn ? new Float32Array(rows.length * cols * 3) : null;
    const idx = [];
    const tmp = new THREE.Color();

    for (let ri = 0; ri < rows.length; ri++) {
      const n = rows[ri];
      const cosH = Math.cos(n.h), sinH = Math.sin(n.h);
      for (let ci = 0; ci < cols; ci++) {
        const t = ci / steps;
        // `ease` biases the samples toward `fromOff`, so a strip that runs from
        // the verge out to the horizon can still be finely sampled where the
        // player (and all the scenery) actually is.
        const off = U.lerp(fromOff, toOff, opts.ease ? Math.pow(t, opts.ease) : t);
        const extra = heightFn ? heightFn(n, off) : 0;
        const bankY = bankOffset(n, off);
        const p = (ri * cols + ci) * 3;
        pos[p] = n.x + cosH * off;
        pos[p + 1] = n.y + extra + bankY;
        pos[p + 2] = n.z + sinH * off;

        const q = (ri * cols + ci) * 2;
        uv[q] = (opts.uAbsolute ? off : t) * uScale;
        uv[q + 1] = n.s * vScale;

        if (col) {
          const c = colorFn(n, off) || tmp.setRGB(1, 1, 1);
          col[p] = c.r; col[p + 1] = c.g; col[p + 2] = c.b;
        }
      }
    }

    // Winding has to follow the sweep direction: a strip swept right-to-left
    // produces the mirror image of one swept left-to-right, and getting this
    // backwards leaves the surface facing the ground and culled away.
    const flip = toOff < fromOff;
    for (let ri = 0; ri < rows.length - 1; ri++) {
      for (let ci = 0; ci < cols - 1; ci++) {
        const a = ri * cols + ci;
        const b = a + 1;
        const c = (ri + 1) * cols + ci;
        const d = c + 1;
        if (flip) idx.push(a, c, b, b, c, d);
        else      idx.push(a, b, c, b, d, c);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    if (col) geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  }

  /* ── Scenery ──────────────────────────────────────────────────────────── */

  /**
   * Height of the ground above the centreline at a lateral offset. Shared by
   * the terrain ribbon and by scenery placement, so props always sit *on* the
   * hills instead of hovering at road height beside them.
   */
  /* Terrain ribbon sampling — shared so placement can reproduce it exactly. */
  const TERRAIN_INNER = ROAD_HALF + SHOULDER;
  const TERRAIN_OUTER = 950;
  const TERRAIN_STEPS = 30;
  const TERRAIN_EASE = 2;      // sample density concentrated near the road

  function terrainRise(theme, n, off) {
    if (!theme.hasTerrain) return -0.35;
    const d = Math.abs(off) - TERRAIN_INNER;
    if (d <= 0) return -0.45;
    const rise = Math.sin(n.i * 0.031 + off * 0.012) * 2.6 +
                 Math.sin(n.i * 0.011 - off * 0.005) * 6.5 +
                 Math.sin(n.i * 0.006 + off * 0.002) * 14.0;
    return -0.45 + rise * U.smoothstep(U.clamp(d / 90, 0, 1)) - d * 0.004;
  }

  /**
   * Height of the terrain *as actually drawn*.
   *
   * The mesh only evaluates terrainRise at its sample offsets and draws flat
   * chords between them, so a prop placed with the true curve can sit below the
   * triangle it is standing on. Reproducing the same linear interpolation here
   * makes placement agree with the geometry by construction, whatever the
   * sampling resolution is.
   */
  function terrainRiseDrawn(theme, n, off) {
    if (!theme.hasTerrain) return -0.35;
    const a = Math.abs(off);
    if (a <= TERRAIN_INNER) return terrainRise(theme, n, off);

    const sign = off < 0 ? -1 : 1;
    const span = TERRAIN_OUTER - TERRAIN_INNER;
    const t = Math.pow(U.clamp((a - TERRAIN_INNER) / span, 0, 1), 1 / TERRAIN_EASE);
    const k = U.clamp(t * TERRAIN_STEPS, 0, TERRAIN_STEPS);
    const i0 = Math.min(Math.floor(k), TERRAIN_STEPS - 1);
    const frac = k - i0;

    const offAt = (i) => sign * (TERRAIN_INNER + span * Math.pow(i / TERRAIN_STEPS, TERRAIN_EASE));
    return U.lerp(terrainRise(theme, n, offAt(i0)),
                  terrainRise(theme, n, offAt(i0 + 1)), frac);
  }

  function populateScenery(group, nodes, theme, seed) {
    const r = U.rng(seed ^ 0x5bd1e995);
    const animated = [];
    const edge = ROAD_HALF + SHOULDER;
    const placeAt = (obj, node, off) => placeOn(obj, node, off, r, theme);

    /* Keep a handful of props moving; strip the animation from the rest so
       they can be batched. A hundred spinning tumbleweeds cost hundreds of
       draw calls and nobody notices the ones far off the road. */
    const noteAnimated = (obj) => {
      if (!(obj.userData.spinner || obj.userData.roll || obj.userData.tumble)) return;
      if (animated.length < MAX_ANIMATED) { animated.push(obj); return; }
      delete obj.userData.spinner;
      delete obj.userData.roll;
      delete obj.userData.tumble;
    };

    const near = {
      countryside: [A.pineTree, A.roundTree, A.roundTree, A.bush, A.bush, A.hayBale, A.fence],
      desert: [A.cactus, A.cactus, A.barrelCactus, A.rock, A.rock, A.tumbleweed, A.desertSign],
      space: [A.asteroid, A.asteroid, A.crystalSpire, A.debrisChunk]
    }[theme.id];

    const far = {
      countryside: [A.barn, A.silo, A.windmill, A.hill, A.hill],
      desert: [A.mesa, A.mesa, A.rock],
      space: [A.planet, A.satellite, A.asteroid]
    }[theme.id];

    // Roadside dressing — dense enough that the verge always feels inhabited.
    for (let i = 6; i < nodes.length - 4; i++) {
      const n = nodes[i];
      [-1, 1].forEach((side) => {
        if (!r.chance(0.62)) return;
        const obj = r.pick(near)(r);
        const off = side * r.range(edge + 2.5, edge + 55);
        obj.scale.multiplyScalar(r.range(0.8, 1.4));
        placeAt(obj, n, off);
        group.add(obj);
        noteAnimated(obj);
      });
    }

    // Ground-cover colour, countryside only.
    if (theme.id === 'countryside') {
      for (let i = 6; i < nodes.length - 4; i += 3) {
        [-1, 1].forEach((side) => {
          if (!r.chance(0.45)) return;
          const patch = A.flowerPatch(r);
          placeAt(patch, nodes[i], side * r.range(edge + 1.5, edge + 30));
          group.add(patch);
        });
      }
    }

    // Landmarks in the middle distance.
    for (let i = 10; i < nodes.length - 10; i += 14) {
      const n = nodes[i];
      [-1, 1].forEach((side) => {
        if (!r.chance(0.55)) return;
        const obj = r.pick(far)(r);
        const off = side * r.range(edge + 60, edge + 200);
        placeAt(obj, n, off);
        if (theme.id === 'space') obj.position.y += r.range(-50, 110);
        group.add(obj);
        noteAnimated(obj);
      });
    }

    // Soft hills closing off the horizon so the world doesn't end at the fog.
    if (theme.backdrop) {
      for (let i = 10; i < nodes.length; i += 22) {
        [-1, 1].forEach((side) => {
          if (!r.chance(0.75)) return;
          const h = A.hillBackdrop(r, theme.backdrop);
          placeAt(h, nodes[i], side * r.range(230, 420));
          h.rotation.z = 0; h.rotation.x = 0;
          group.add(h);
        });
      }
    }

    // Clouds overhead — big, close and plentiful.
    if (theme.hasClouds) {
      const stride = Math.max(6, Math.round(11 / (theme.cloudCount || 1)));
      for (let i = 8; i < nodes.length; i += stride) {
        if (!r.chance(0.75)) continue;
        const n = nodes[i];
        const c = A.cloud(r);
        placeAt(c, n, r.range(-240, 240));
        c.position.y = r.range(48, 120);
        c.rotation.set(0, r.range(0, 6.283), 0);
        c.scale.setScalar(r.range(0.9, 1.9));
        group.add(c);
      }
    }

    return animated;
  }

  const _box = new THREE.Box3();

  /* ── Static-scenery batching ──────────────────────────────────────────────
   * Every roadside prop was its own Group of small meshes, which put ~3900
   * draw calls on screen per frame — fine on a desktop GPU, hopeless on a
   * tablet, and doubled again by the shadow pass. The geometry itself is
   * trivial (under 200k triangles), so the fix is to weld props that share a
   * material into one mesh.
   *
   * Merging happens per chunk of track rather than per level, so frustum
   * culling still throws away everything behind and far ahead of the camera.
   */
  const MERGE_CHUNK = 420;   // metres of track per batch
  /** Only this many props keep their own transform (and their own draw calls)
   *  for animation; the rest get welded into the static batches. */
  const MAX_ANIMATED = 14;

  /** Weld a list of same-material meshes into one world-space geometry. */
  function mergeMeshes(meshes) {
    let vCount = 0, iCount = 0;
    for (let i = 0; i < meshes.length; i++) {
      const g = meshes[i].geometry;
      vCount += g.attributes.position.count;
      iCount += g.index ? g.index.count : g.attributes.position.count;
    }
    const pos = new Float32Array(vCount * 3);
    const nor = new Float32Array(vCount * 3);
    const uv = new Float32Array(vCount * 2);
    const idx = vCount > 65535 ? new Uint32Array(iCount) : new Uint16Array(iCount);

    const v = new THREE.Vector3();
    const nm = new THREE.Matrix3();
    let vo = 0, io = 0;

    for (let m = 0; m < meshes.length; m++) {
      const mesh = meshes[m];
      const g = mesh.geometry;
      const mat = mesh.matrixWorld;
      nm.getNormalMatrix(mat);
      const p = g.attributes.position, n = g.attributes.normal, t = g.attributes.uv;

      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(mat);
        pos[(vo + i) * 3] = v.x; pos[(vo + i) * 3 + 1] = v.y; pos[(vo + i) * 3 + 2] = v.z;
        if (n) {
          v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize();
          nor[(vo + i) * 3] = v.x; nor[(vo + i) * 3 + 1] = v.y; nor[(vo + i) * 3 + 2] = v.z;
        }
        if (t) { uv[(vo + i) * 2] = t.getX(i); uv[(vo + i) * 2 + 1] = t.getY(i); }
      }
      if (g.index) {
        for (let i = 0; i < g.index.count; i++) idx[io + i] = vo + g.index.getX(i);
        io += g.index.count;
      } else {
        for (let i = 0; i < p.count; i++) idx[io + i] = vo + i;
        io += p.count;
      }
      vo += p.count;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeBoundingSphere();
    return geo;
  }

  /** Replace every static prop in `group` with a handful of batched meshes. */
  function mergeScenery(group) {
    const buckets = new Map();
    const kids = group.children.slice();
    let merged = 0;

    for (let k = 0; k < kids.length; k++) {
      const obj = kids[k];
      if (obj.userData.chunk === undefined) continue;        // road, terrain, …
      if (obj.userData.spinner || obj.userData.roll || obj.userData.tumble) continue;

      obj.updateMatrixWorld(true);
      obj.traverse((o) => {
        if (!o.isMesh) return;
        // Keep shadow flags in the key so clouds don't start casting shadows.
        const key = o.material.uuid + '|' + obj.userData.chunk +
                    '|' + (o.castShadow ? 1 : 0) + (o.receiveShadow ? 1 : 0);
        let b = buckets.get(key);
        if (!b) {
          b = { mat: o.material, cast: o.castShadow, receive: o.receiveShadow, meshes: [] };
          buckets.set(key, b);
        }
        b.meshes.push(o);
      });
      group.remove(obj);
      merged++;
    }

    buckets.forEach((b) => {
      const mesh = new THREE.Mesh(mergeMeshes(b.meshes), b.mat);
      mesh.castShadow = b.cast;
      mesh.receiveShadow = b.receive;
      group.add(mesh);
      // The source geometries were never uploaded — drop them now.
      for (let i = 0; i < b.meshes.length; i++) b.meshes[i].geometry.dispose();
    });

    return { props: merged, batches: buckets.size };
  }

  function placeOn(obj, node, lateralOffset, r, theme) {
    obj.userData.chunk = Math.floor(node.s / MERGE_CHUNK);
    const cosH = Math.cos(node.h), sinH = Math.sin(node.h);
    // Must match the terrain ribbon exactly — same rise, same bank — or props
    // hover above the hills and sink into the dips.
    const groundY = node.y + terrainRiseDrawn(theme, node, lateralOffset)
                  + bankOffset(node, lateralOffset);

    obj.position.set(node.x + cosH * lateralOffset, groundY, node.z + sinH * lateralOffset);
    obj.rotation.y = r.range(0, Math.PI * 2);
    // A couple of degrees of lean keeps everything looking hand-placed.
    obj.rotation.z = r.range(-0.05, 0.05);
    obj.rotation.x = r.range(-0.04, 0.04);

    // Settle it onto the surface: anything whose geometry (or random lean)
    // reaches below its own origin would otherwise clip through the ground.
    // Landforms opt out with userData.embed — they are meant to be buried.
    if (theme.hasTerrain && !obj.userData.embed) {
      obj.updateMatrixWorld(true);
      _box.setFromObject(obj);
      if (isFinite(_box.min.y)) {
        const lift = groundY - _box.min.y;
        if (lift > 0) obj.position.y += lift;
      }
    }
    return obj;
  }

  function starfield(r) {
    const count = 1400;
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      // Rejection-free spherical distribution.
      const u = r.range(-1, 1);
      const th = r.range(0, Math.PI * 2);
      const sq = Math.sqrt(1 - u * u);
      const rad = 900;
      pos[i * 3] = Math.cos(th) * sq * rad;
      pos[i * 3 + 1] = Math.abs(u) * rad * 0.75 + 40;
      pos[i * 3 + 2] = Math.sin(th) * sq * rad;
      c.setHSL(r.range(0.5, 0.75), r.range(0, 0.4), r.range(0.7, 1));
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return new THREE.Points(geo, new THREE.PointsMaterial({
      size: 2.6, sizeAttenuation: false, vertexColors: true, fog: false
    }));
  }

  /* ── Build ────────────────────────────────────────────────────────────── */

  /**
   * @param {THREE.Scene} scene
   * @param {object} cfg { themeId, seed, length, curviness, hilliness }
   */
  function build(scene, cfg) {
    const theme = THEMES[cfg.themeId] || THEMES.countryside;
    const seed = cfg.seed >>> 0;
    const length = cfg.length || 2400;
    const nodes = buildNodes(seed, length, cfg.curviness === undefined ? 0.0022 : cfg.curviness,
                             cfg.hilliness === undefined ? 1.6 : cfg.hilliness);
    const r = U.rng(seed ^ 0xa5a5a5);

    const group = new THREE.Group();
    scene.add(group);

    /* Sky + fog */
    scene.fog = new THREE.Fog(theme.fog, theme.fogNear, theme.fogFar);
    scene.background = new THREE.Color(theme.fog);

    const skyMat = new THREE.MeshBasicMaterial({
      map: A.skyTexture(theme.sky[0], theme.sky[1], theme.sky[2]),
      side: THREE.BackSide, fog: false, depthWrite: false
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 20, 14), skyMat);
    sky.renderOrder = -10;
    scene.add(sky);

    let stars = null;
    if (theme.hasStars) {
      stars = starfield(r);
      stars.renderOrder = -9;
      scene.add(stars);
    }

    // Cut-out paper sun, billboarded at the camera each frame.
    let sunDisc = null;
    if (theme.sunDisc) {
      sunDisc = A.paperSun(theme.sunDisc[0], theme.sunDisc[1]);
      scene.add(sunDisc);
    }

    /* Lights */
    const hemi = new THREE.HemisphereLight(theme.hemiSky, theme.hemiGround, theme.hemiInt);
    scene.add(hemi);

    const amb = new THREE.AmbientLight(0xffffff, theme.ambInt);
    scene.add(amb);

    const sun = new THREE.DirectionalLight(theme.sunColor, theme.sunInt);
    sun.castShadow = true;
    // 1024 is indistinguishable from 2048 at this chunky scale and a quarter
    // of the shadow-pass fill cost.
    sun.shadow.mapSize.set(1024, 1024);
    // A tight frustum that follows the player keeps shadows crisp on a track
    // that is thousands of metres long.
    const SH = 70;
    sun.shadow.camera.left = -SH;
    sun.shadow.camera.right = SH;
    sun.shadow.camera.top = SH;
    sun.shadow.camera.bottom = -SH;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 320;
    sun.shadow.bias = -0.0016;
    sun.shadow.normalBias = 0.035;
    scene.add(sun);
    scene.add(sun.target);

    /* Road */
    let roadTex = null, roadMat = null;

    if (theme.roadSurface === false) {
      // Rails only: a glowing kerb down each edge…
      const railMat = A.glow(theme.shoulder, 1.0);
      [-1, 1].forEach((side) => {
        const geo = ribbon(nodes, side * ROAD_HALF, side * (ROAD_HALF + theme.railWidth), 1, {
          heightFn: () => 0.22
        });
        group.add(new THREE.Mesh(geo, railMat));
      });
      // …and a see-through ribbon down the middle to read the racing line.
      const centreMat = new THREE.MeshBasicMaterial({
        color: theme.centreLine, transparent: true, opacity: 0.3,
        depthWrite: false, side: THREE.DoubleSide, fog: true
      });
      const centreGeo = ribbon(nodes, -0.45, 0.45, 1, { heightFn: () => 0.04 });
      const centre = new THREE.Mesh(centreGeo, centreMat);
      centre.renderOrder = 1;
      group.add(centre);
    } else {
      roadTex = A.roadTexture(theme.road);
      roadTex.repeat.set(1, 1 / 26); // one texture tile per 26 m of track
      roadMat = new THREE.MeshStandardMaterial({
        map: roadTex, roughness: 0.95, metalness: 0, flatShading: false
      });
      const road = new THREE.Mesh(ribbon(nodes, -ROAD_HALF, ROAD_HALF, 6, { vScale: 1, uScale: 1 }), roadMat);
      road.receiveShadow = true;
      group.add(road);

      /* Shoulders */
      const shoulderMat = A.paper(theme.shoulder, { flat: false, roughness: 1 });
      [-1, 1].forEach((side) => {
        const geo = ribbon(nodes, side * ROAD_HALF, side * (ROAD_HALF + SHOULDER), 2, {
          uScale: 0.25, vScale: 0.25, uAbsolute: true,
          heightFn: (n, off) => -0.06 - Math.abs(Math.abs(off) - ROAD_HALF) * 0.02
        });
        const m = new THREE.Mesh(geo, shoulderMat);
        m.receiveShadow = true;
        group.add(m);
      });
    }

    /* Terrain */
    if (theme.hasTerrain) {
      const gA = new THREE.Color(theme.ground[0]);
      const gB = new THREE.Color(theme.ground[1]);
      const tmp = new THREE.Color();
      const terrainMat = new THREE.MeshStandardMaterial({
        map: A.paperTexture(), vertexColors: true,
        roughness: 1, metalness: 0, flatShading: true
      });
      [-1, 1].forEach((side) => {
        const inner = side * TERRAIN_INNER;
        // Reaches well past the fog so the ground never visibly runs out.
        const outer = side * TERRAIN_OUTER;
        const geo = ribbon(nodes, inner, outer, TERRAIN_STEPS, {
          uScale: 0.12, vScale: 0.12, uAbsolute: true, ease: TERRAIN_EASE,
          // Exactly the function scenery placement uses, so props sit on the
          // hills rather than hovering above or sinking into them.
          heightFn: (n, off) => terrainRise(theme, n, off),
          colorFn: (n, off) => {
            const t = U.clamp((Math.sin(n.i * 0.07 + off * 0.03) + 1) * 0.5, 0, 1);
            return tmp.copy(gA).lerp(gB, t);
          }
        });
        const m = new THREE.Mesh(geo, terrainMat);
        m.receiveShadow = true;
        group.add(m);
      });
    }

    /* Scenery — built as individual props, then batched down to a few dozen
       draw calls. Animated props (windmills, tumbleweeds, tumbling rocks) are
       left alone since they need their own transforms. */
    const animated = populateScenery(group, nodes, theme, seed);
    mergeScenery(group);

    /* ── Frame lookup ───────────────────────────────────────────────────── */
    const _pos = new THREE.Vector3();
    const _right = new THREE.Vector3();
    const _fwd = new THREE.Vector3();

    /**
     * Interpolated centreline frame at distance `s`.
     * Forward is (sin h, 0, -cos h); right is (cos h, 0, sin h).
     */
    function frameAt(s) {
      const f = U.clamp(s / SEG, 0, nodes.length - 1.0001);
      const i = Math.floor(f);
      const t = f - i;
      const a = nodes[i];
      const b = nodes[Math.min(i + 1, nodes.length - 1)];
      const h = U.lerp(a.h, b.h, t);
      _pos.set(U.lerp(a.x, b.x, t), U.lerp(a.y, b.y, t), U.lerp(a.z, b.z, t));
      _right.set(Math.cos(h), 0, Math.sin(h));
      _fwd.set(Math.sin(h), 0, -Math.cos(h));
      return {
        pos: _pos, right: _right, forward: _fwd,
        heading: h,
        // Y rotation that points a -Z-facing model down the track. Models face
        // -Z, and Ry(t)*(0,0,-1) = (-sin t, 0, -cos t), so matching the forward
        // vector (sin h, 0, -cos h) requires t = -h. Always use this for meshes;
        // using `heading` directly yaws them backwards, which only looks correct
        // where the track happens to point north.
        yaw: -h,
        bank: U.lerp(a.bank, b.bank, t),
        curvature: U.lerp(a.k, b.k, t),
        y: _pos.y
      };
    }

    /** World position on the road surface at (s, lateral offset). */
    function pointAt(s, off, out) {
      const fr = frameAt(s);
      const v = out || new THREE.Vector3();
      v.copy(fr.pos).addScaledVector(fr.right, off);
      v.y += -off * Math.sin(fr.bank);
      return v;
    }

    const _sunOffset = new THREE.Vector3(theme.sunDir[0], theme.sunDir[1], theme.sunDir[2])
      .normalize().multiplyScalar(120);

    function update(dt, cameraPos, focusPos) {
      sky.position.copy(cameraPos);
      if (stars) stars.position.copy(cameraPos);
      if (sunDisc) {
        // Parked at a fixed offset from the camera so it reads as infinitely far.
        sunDisc.position.set(
          cameraPos.x + theme.sunSky[0],
          theme.sunSky[1],
          cameraPos.z + theme.sunSky[2]
        );
        sunDisc.lookAt(cameraPos);
      }

      // Drag the shadow frustum along with the action.
      sun.target.position.copy(focusPos);
      sun.position.copy(focusPos).add(_sunOffset);

      for (let i = 0; i < animated.length; i++) {
        const o = animated[i];
        if (o.userData.spinner) o.userData.spinner.rotation.z += o.userData.spinner.userData.spin * dt;
        // Spin the inner mesh about its own centre; rotating the group would
        // swing it around a pivot at ground level and sink it into the sand.
        if (o.userData.roll && o.userData.rollMesh) o.userData.rollMesh.rotation.x += o.userData.roll * dt;
        if (o.userData.tumble) {
          o.rotation.x += o.userData.tumble[0] * dt;
          o.rotation.y += o.userData.tumble[1] * dt;
          o.rotation.z += o.userData.tumble[2] * dt;
        }
      }
    }

    function dispose() {
      scene.remove(group);
      scene.remove(sky);
      scene.remove(hemi);
      scene.remove(amb);
      scene.remove(sun);
      scene.remove(sun.target);
      if (stars) scene.remove(stars);
      if (sunDisc) scene.remove(sunDisc);
      scene.fog = null;

      const seen = new Set();
      group.traverse((o) => {
        if (o.geometry && !seen.has(o.geometry.uuid)) { seen.add(o.geometry.uuid); o.geometry.dispose(); }
      });
      sky.geometry.dispose();
      skyMat.dispose();
      if (roadTex) roadTex.dispose();
      if (roadMat) roadMat.dispose();
      if (stars) { stars.geometry.dispose(); stars.material.dispose(); }
    }

    return {
      theme, nodes, group, sun, length: length,
      roadHalf: ROAD_HALF, shoulder: SHOULDER,
      frameAt, pointAt, update, dispose
    };
  }

  /* ══════════════════════════════════════════════════════════════════════
     FISHMASTER II — the endless lake
     Same centreline machinery as a race track: the road ribbon becomes a
     water ribbon, and the curves and hills become the route bending around
     points and swelling gently. terrainRise() and bankOffset() are kept.

     The difference is that this route never ends. A mission finishes when its
     target is caught, not at a finish line, and a player who never presses
     anything has to be able to sit on the track with zones cycling past
     forever — so the centreline is extended and the geometry is built in
     chunks ahead of the boat and disposed behind it.
     ══════════════════════════════════════════════════════════════════════ */

  /* The boat's lane, the water sheet, and the band the shoreline wanders
     through. The lane is the only one of these the player can feel: it is
     how far the helm will take you off the route. The rest is scenery.

     The bank sits 300 to 400 units out, which is far enough that it reads
     as the other side of a lake rather than as a wall beside the boat, and
     close enough to be worth looking at. */
  const LANE_HALF = 46;       // how far either side of the route the boat may go
  const WATER_HALF = 520;     // half-width of the water sheet, past the far bank
  const SHORE_NEAR = 300;     // the waterline never comes in closer than this
  const SHORE_FAR = 400;      // ...nor goes out further than this
  const SHORE_OUTER = 900;    // where the land ribbon stops; the fog eats it
  const CHUNK_NODES = 105;    // 105 * SEG = 420 units, Race Tracks' merge chunk
  const CHUNK_LEN = CHUNK_NODES * SEG;
  const AHEAD = 3;            // chunks kept built in front of the boat
  const BEHIND = 1;           // and behind

  /**
   * Banking, clamped to the water's edge rather than the road's.
   *
   * Same reasoning as bankOffset(): the shift grows with distance from the
   * centreline, so without a clamp a 0.2 rad bank would lift the far shore
   * hundreds of units. Everything flat on the water — the surface, the shore
   * seam, the zone rings, every prop — goes through THIS one function, or the
   * outer edge sinks through the surface wherever the route banks. (Trap 2/3.)
   */
  function lakeBank(node, off) {
    const clamped = U.clamp(off, -WATER_HALF, WATER_HALF);
    return -clamped * Math.sin(node.bank);
  }

  /**
   * Where the waterline is on this side of the route, at this node.
   *
   * It wanders, or the lake is a canal. Two slow sines against the node index,
   * a different phase per bank, so the two shores are never a mirror image of
   * one another and the boat is never exactly in the middle of anything.
   *
   * Everything that has to know where the water ends comes through here: the
   * bank geometry, the colour of the water and the sand, the reeds, the dock,
   * and the props on the shore. One answer, so nothing can stand in the lake.
   */
  function shoreEdge(n, dir) {
    const side = dir < 0 ? 0 : 1;
    const w = Math.sin(n.i * 0.0041 + side * 2.37) * 0.6 +
              Math.sin(n.i * 0.0125 - side * 1.13) * 0.4;
    return SHORE_NEAR + (SHORE_FAR - SHORE_NEAR) * (0.5 + 0.5 * w);
  }

  /**
   * Height of the ground at a lateral offset: the bed under the water, then
   * the bank rising away past the waterline. Used by the shore ribbon AND by
   * prop placement, so nothing hovers and nothing sinks. (Trap 3.)
   */
  function shoreRise(n, off) {
    const a = Math.abs(off);
    const edge = shoreEdge(n, off < 0 ? -1 : 1);
    const d = a - edge;
    // Under water: the bed drops away from the margin, gently.
    if (d <= 0) return -0.35 - U.smoothstep(U.clamp(-d / 90, 0, 1)) * 1.6;
    /* Ashore, and OUT of the water fast.
     *
     * A bank that eases up over seventy units is a bank that is still under
     * the surface for the first thirty of them, and everything standing on it
     * - the tackle shop above all - looks like it is standing in the lake.
     * Sand first, up clear of the water within a couple of paces, and only
     * then the ground rolling away inland. */
    const roll = Math.sin(n.i * 0.031 + off * 0.012) * 2.2 +
                 Math.sin(n.i * 0.011 - off * 0.005) * 5.5 +
                 Math.sin(n.i * 0.006 + off * 0.002) * 12.0;
    const beach = U.smoothstep(U.clamp(d / 6, 0, 1)) * 1.15;
    const bank = U.smoothstep(U.clamp((d - 6) / 85, 0, 1)) * (3.2 + roll);
    return -0.35 + beach + bank - d * 0.002;
  }

  /**
   * A centreline that can be extended forever.
   *
   * buildNodes() derives node i from the index alone (summed sines with seeded
   * phases) and accumulates position as it walks, so continuing the walk from
   * the last node's state produces exactly the nodes a longer track would have
   * had. Nodes are small and are kept for the whole session — an hour of
   * trolling is about 13,000 of them — while the GEOMETRY is chunked and
   * recycled.
   */
  function makeCentreline(seed, curviness, hilliness) {
    const r = U.rng(seed);
    const f1 = r.range(0.006, 0.011), p1 = r.range(0, 6.283);
    const f2 = r.range(0.017, 0.028), p2 = r.range(0, 6.283);
    const f3 = r.range(0.040, 0.062), p3 = r.range(0, 6.283);
    const h1 = r.range(0.008, 0.015), ph1 = r.range(0, 6.283);
    const h2 = r.range(0.026, 0.040), ph2 = r.range(0, 6.283);

    const nodes = [];
    let heading = 0, x = 0, z = 0, s = 0, built = 0;

    function extendTo(count) {
      for (let i = nodes.length; i < count; i++) {
        // Ease the curvature in over the first stretch so every trip starts
        // straight — the player needs a moment to settle before the first bend.
        const warm = U.smoothstep(U.clamp(i / 26, 0, 1));
        const k = curviness * warm * (
          Math.sin(i * f1 + p1) * 0.62 +
          Math.sin(i * f2 + p2) * 0.28 +
          Math.sin(i * f3 + p3) * 0.10
        );
        const y = hilliness * (Math.sin(i * h1 + ph1) * 1.0 + Math.sin(i * h2 + ph2) * 0.45) * warm;
        nodes.push({ i: i, x: x, y: y, z: z, h: heading, s: s, k: k, bank: 0 });
        heading += k * SEG;
        x += Math.sin(heading) * SEG;
        z += -Math.cos(heading) * SEG;
        s += SEG;
      }
      // Bank into the bends, smoothed over a +/-4 window — so a node's bank is
      // only final once four more exist ahead of it.
      const upto = Math.max(0, nodes.length - 5);
      for (let i = built; i < upto; i++) {
        let acc = 0, n = 0;
        for (let j = Math.max(0, i - 4); j <= Math.min(nodes.length - 1, i + 4); j++) { acc += nodes[j].k; n++; }
        nodes[i].bank = U.clamp((acc / n) * 42, -0.20, 0.20);
      }
      built = upto;
    }

    return { nodes, extendTo, get length() { return nodes.length * SEG; } };
  }

  function buildLake(scene, cfg) {
    cfg = cfg || {};
    const seed = (cfg.seed || 1) >>> 0;
    const C = cfg.colors || {};
    const flat = !!cfg.flat;

    const col = (hex, fallback) => new THREE.Color(hex || fallback);
    const cWaterShallow = col(C.waterShallow, '#39a0a6');
    const cWaterMid     = col(C.waterMid,     '#1d6070');
    const cWaterDeep    = col(C.waterDeep,    '#0a2c3d');
    const cGrass        = col(C.bankGrass,    '#4a7a35');
    const cSoil         = col(C.bankSoil,     '#54412b');
    const cSand         = col(C.sand,         '#c9b184');
    const fogHex        = C.fog || '#cfe9f2';

    const line = makeCentreline(seed, 0.0018, 1.1);
    const group = new THREE.Group();
    scene.add(group);

    /* Sky + fog. The lake reads as a bright overcast day rather than Race
       Tracks' hard sun: less contrast on the water, more on the rings. */
    /* Brought in close. The shoals you fish are all within about 110 units,
       so they stay perfectly clear, while the bank - now 300 to 400 out - sits
       deep enough in the haze to read as distance rather than as a wall. */
    scene.fog = new THREE.Fog(new THREE.Color(fogHex).getHex(), 150, 520);
    scene.background = new THREE.Color(fogHex);

    const skyMat = new THREE.MeshBasicMaterial({
      map: A.skyTexture(C.skyHigh || '#3d9ee0', C.skyMid || '#8fd2f0', C.skyLow || '#dff2f7'),
      side: THREE.BackSide, fog: false, depthWrite: false
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 20, 14), skyMat);
    sky.renderOrder = -10;
    scene.add(sky);

    /* Clouds. Race Tracks has had them all along and the lake never did, which
       is most of why one trip looked exactly like the next: the sky was a
       painted dome and nothing in it ever moved. They sit high and drift
       slowly across the route, and they are the cheapest sense of weather
       there is. */
    const clouds = new THREE.Group();
    clouds.name = 'lakeClouds';
    scene.add(clouds);
    (function seedClouds() {
      const cr = U.rng(U.hash('lakecloud' + seed));
      for (let i = 0; i < 16; i++) {
        const c = A.cloud(cr);
        c.userData.drift = cr.range(0.6, 1.8) * (cr.chance(0.5) ? 1 : -1);
        c.userData.spanX = 900;
        c.position.set(cr.range(-450, 450), cr.range(90, 190), cr.range(-450, 450));
        c.scale.setScalar(cr.range(1.4, 3.2));
        c.rotation.y = cr.range(0, 6.283);
        clouds.add(c);
      }
    })();

    const hemi = new THREE.HemisphereLight(0xd6efff, 0x5f7a55, 2.2);
    scene.add(hemi);
    const amb = new THREE.AmbientLight(0xffffff, 0.55);
    scene.add(amb);
    const sun = new THREE.DirectionalLight(0xfff4dc, 2.6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 420;
    sun.shadow.camera.left = -150;
    sun.shadow.camera.right = 150;
    sun.shadow.camera.top = 150;
    sun.shadow.camera.bottom = -150;
    sun.shadow.bias = -0.0012;
    scene.add(sun);
    scene.add(sun.target);

    /* Water material. One scrolling wash — no reflections, no transparency
       stack. Vertex colours carry the depth gradient. */
    const waterTex = A.waterTexture(flat);
    waterTex.repeat.set(3, 60);
    const waterMat = new THREE.MeshStandardMaterial({
      map: flat ? null : waterTex,
      vertexColors: true,
      roughness: flat ? 1 : 0.55,
      metalness: 0,
      flatShading: false
    });
    const shoreMat = A.paper(0xffffff, { flat: true });
    shoreMat.vertexColors = true;

    /* ── Chunks ──────────────────────────────────────────────────────────── */

    const chunks = new Map();       // index → {group, geoms[]}
    const _tmpCol = new THREE.Color();

    /**
     * Bright in the boat's lane, darkening out into the lake, then lifting
     * again into a shallow margin where the bank comes up — so a fishing spot's
     * distance off the route reads as its depth, and the shoreline meets lit
     * water instead of a hard black edge.
     */
    function waterColorAt(n, off) {
      const a = Math.abs(off);
      const edge = RT.world.shoreEdge(n, off < 0 ? -1 : 1);
      const c = _tmpCol.copy(cWaterShallow);
      c.lerp(cWaterMid, U.smoothstep(U.clamp(a / 70, 0, 1)));
      if (a > 55) c.lerp(cWaterDeep, U.smoothstep(U.clamp((a - 55) / 60, 0, 1)));
      // Shallow again in the last stretch before the bank.
      const toShore = edge - a;
      if (toShore < 55) {
        c.lerp(cWaterShallow, U.smoothstep(U.clamp((55 - toShore) / 55, 0, 1)) * 0.8);
      }
      return c;
    }

    function shoreColorAt(n, off) {
      const edge = RT.world.shoreEdge(n, off < 0 ? -1 : 1);
      const d = Math.abs(off) - edge;
      const c = _tmpCol.copy(cSand);
      if (d > 10) c.lerp(cGrass, U.smoothstep(U.clamp((d - 10) / 55, 0, 1)));
      if (d > 160) c.lerp(cSoil, U.smoothstep(U.clamp((d - 160) / 300, 0, 1)));
      return c;
    }

    /** Sine-driven ripples, baked into the surface. Held flat under reduced
        motion and in High Contrast, where a rippled surface just adds noise. */
    function rippleAt(n, off) {
      if (flat || cfg.reducedMotion) return 0;
      return Math.sin(n.i * 0.22 + off * 0.05) * 0.10 +
             Math.sin(n.i * 0.09 - off * 0.11) * 0.07 +
             Math.sin(n.i * 0.41 + off * 0.02) * 0.04;
    }

    function buildChunk(ci) {
      if (chunks.has(ci)) return;
      const from = ci * CHUNK_NODES;
      const to = from + CHUNK_NODES;
      line.extendTo(to + 6);          // +6 so every node in the chunk has a settled bank
      const nodes = line.nodes.slice(from, to + 1);
      if (nodes.length < 2) return;

      const g = new THREE.Group();
      const geoms = [];

      /* The water is one flat sheet across the whole lake. It is never clipped
         to the shoreline — the LAND is what shapes the lake, by rising through
         this sheet wherever there is bank. */
      const water = ribbon(nodes, -WATER_HALF, WATER_HALF, 34, {
        heightFn: (n, off) => rippleAt(n, off) + (lakeBank(n, off) - bankOffset(n, off)),
        colorFn: waterColorAt,
        uScale: 1, vScale: 0.02
      });
      geoms.push(water);
      const wm = new THREE.Mesh(water, waterMat);
      wm.receiveShadow = true;
      g.add(wm);

      /* The bed and bank, both sides. Split into two sweeps per side: an inner
         one sampled evenly across the band the shoreline actually wanders
         through, and an outer one eased out to the fog. A single eased sweep
         put all its resolution in the wrong place and left the shoreline
         faceted. */
      for (const dir of [-1, 1]) {
        // Evenly sampled across the whole band the shoreline now wanders
        // through. The segment count goes up with the span, or the extra
        // width would simply come out faceted.
        const inner = ribbon(nodes, dir * 30, dir * 450, 46, {
          heightFn: (n, off) => shoreRise(n, off) + (lakeBank(n, off) - bankOffset(n, off)),
          colorFn: shoreColorAt
        });
        geoms.push(inner);
        const mi = new THREE.Mesh(inner, shoreMat);
        mi.receiveShadow = true;
        g.add(mi);

        const outer = ribbon(nodes, dir * 450, dir * SHORE_OUTER, 14, {
          heightFn: (n, off) => shoreRise(n, off),
          colorFn: shoreColorAt,
          ease: 1.7
        });
        geoms.push(outer);
        g.add(new THREE.Mesh(outer, shoreMat));
      }

      populateShore(g, nodes, ci);
      // Batch per material per chunk — 3904 draw calls down to a few hundred
      // was most of Race Tracks' optimisation pass, and chunking rather than
      // whole-level merging keeps frustum culling useful. (§11.1)
      mergeScenery(g);

      group.add(g);
      chunks.set(ci, { group: g, geoms });
    }

    /** Reeds, pads, buoys, deadheads, bank planting. Scenery only — no hazards. */
    function populateShore(g, nodes, ci) {
      const r = U.rng(U.hash('lake' + seed + ':shore' + ci));

      const place = (obj, n, off, floats) => {
        const y = floats
          ? n.y + lakeBank(n, off) + 0.06
          : n.y + shoreRise(n, off) + lakeBank(n, off);
        obj.position.set(n.x + Math.cos(n.h) * off, y, n.z + Math.sin(n.h) * off);
        obj.rotation.y = -n.h + r.range(-0.6, 0.6);
        // mergeScenery() only batches children that carry a chunk id. Without
        // this every prop stays its own draw call — which is the difference
        // between ~400 and ~1900 on this scene.
        obj.userData.chunk = ci;
        g.add(obj);
      };

      for (let i = 4; i < nodes.length - 4; i += 4) {
        const n = nodes[i];

        for (const dir of [-1, 1]) {
          const edge = shoreEdge(n, dir);

          // Reeds standing in the shallows just off the bank.
          if (r.chance(0.30)) {
            const off = dir * (edge - r.range(2, 26));
            const clump = new THREE.Group();
            const count = r.int(4, 8);
            for (let k = 0; k < count; k++) {
              clump.add(A.part(new THREE.CylinderGeometry(0.05, 0.09, r.range(1.8, 3.6), 4),
                               A.paper(C.reed || 0x7a9c3f),
                               { pos: [r.range(-0.9, 0.9), r.range(0.9, 1.8), r.range(-0.9, 0.9)], cast: false }));
            }
            place(clump, n, off, true);
          }

          // Lily pads, in the shallow margin.
          if (r.chance(0.26)) {
            const off = dir * (edge - r.range(6, 44));
            const pad = A.part(new THREE.CylinderGeometry(r.range(1.1, 2.4), r.range(1.1, 2.4), 0.12, 7),
                               A.paper(C.lily || 0x39914a), { cast: false, receive: true });
            place(pad, n, off, true);
          }

          // Bank planting, on dry land.
          if (r.chance(0.42)) {
            const off = dir * (edge + r.range(8, 240));
            const t = r.chance(0.55) ? A.pineTree(r) : A.roundTree(r);
            t.scale.setScalar(r.range(0.9, 1.9));
            place(t, n, off, false);
          }
          if (r.chance(0.16)) {
            const off = dir * (edge + r.range(2, 40));
            const b = A.bush(r);
            b.scale.setScalar(r.range(0.8, 1.5));
            place(b, n, off, false);
          }
        }

        /* Somewhere to have got to.
         *
         * Reeds and trees make a shore; they do not make a PLACE. Every few
         * hundred units there is now something you could point at from the
         * helm - a jetty, a boathouse, a beached rowboat, a heron standing on
         * a snag - so trolling reads as going somewhere rather than as the
         * same bank looping past. Scenery only: none of it is in the water
         * you fish, and none of it can be hit. */
        if (r.chance(0.09)) {
          const dir = r.sign();
          const edge = shoreEdge(n, dir);
          const kind = r.int(0, 3);
          const mark = new THREE.Group();
          if (kind === 0) {
            // A jetty, running out from the bank.
            const j = A.jetty(r.range(6, 11), { dock: C.dock, dark: C.log });
            j.rotation.y = Math.PI / 2;
            mark.add(j);
            place(mark, n, dir * (edge - 5), true);
          } else if (kind === 1) {
            // A boathouse up on the bank, roof to the water.
            const wall = A.paper(C.shack || 0xb08d5f), roof = A.paper(C.roof || 0x7a3b2e);
            mark.add(A.part(new THREE.BoxGeometry(5.2, 3.4, 4.6), wall, { pos: [0, 1.7, 0] }));
            mark.add(A.part(new THREE.ConeGeometry(4.4, 2.1, 4), roof,
                            { pos: [0, 4.4, 0], rot: [0, Math.PI / 4, 0] }));
            A.ink(mark);
            place(mark, n, dir * (edge + r.range(6, 16)), false);
          } else if (kind === 2) {
            // A rowboat pulled up on the sand, upside down.
            const hull = A.part(new THREE.SphereGeometry(1.5, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2),
                                A.paper(C.hull || 0xdcd3c2), { pos: [0, 0.2, 0], rot: [Math.PI, 0, 0] });
            hull.scale.set(1, 0.55, 2.4);
            mark.add(hull);
            A.ink(mark);
            place(mark, n, dir * (edge + r.range(1, 6)), false);
          } else {
            // A heron on a snag, standing in the shallows.
            const snag = A.part(new THREE.CylinderGeometry(0.3, 0.36, 3.2, 6),
                                A.paper(C.log || 0x4b3a28), { pos: [0, 0.5, 0], rot: [0.35, 0, 0.2] });
            mark.add(snag);
            const body = A.part(new THREE.SphereGeometry(0.42, 8, 6), A.paper(0xb9c4cc),
                                { pos: [0, 2.2, 0] });
            body.scale.set(1, 1.5, 1);
            mark.add(body);
            mark.add(A.part(new THREE.CylinderGeometry(0.07, 0.07, 1.1, 5), A.paper(0xb9c4cc),
                            { pos: [0, 3.1, 0], rot: [0.2, 0, 0] }));
            mark.add(A.part(new THREE.ConeGeometry(0.09, 0.5, 4), A.paper(0xe8c34a),
                            { pos: [0, 3.6, 0.28], rot: [1.4, 0, 0] }));
            A.ink(mark);
            place(mark, n, dir * (edge - r.range(2, 9)), true);
          }
        }

        // A buoy or a deadhead out in open water, clear of the boat's lane.
        if (r.chance(0.14)) {
          const off = r.sign() * r.range(LANE_HALF + 8, LANE_HALF + 60);
          if (r.chance(0.5)) {
            const buoy = new THREE.Group();
            buoy.add(A.part(new THREE.ConeGeometry(0.6, 1.7, 8), A.paper(0xff6b35), { pos: [0, 0.85, 0] }));
            buoy.add(A.part(new THREE.SphereGeometry(0.7, 8, 6), A.paper(0xf7f2e8), { pos: [0, 0.1, 0] }));
            A.ink(buoy);
            place(buoy, n, off, true);
          } else {
            const log = A.part(new THREE.CylinderGeometry(0.42, 0.5, r.range(3.5, 7), 6),
                               A.paper(C.log || 0x4b3a28), { rot: [0, 0, Math.PI / 2] });
            A.outline(log);
            place(log, n, off, true);
          }
        }
      }
    }

    function disposeChunk(ci) {
      const c = chunks.get(ci);
      if (!c) return;
      group.remove(c.group);
      c.group.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
      });
      chunks.delete(ci);
    }

    /** Build ahead of the boat and recycle behind it. Called every frame. */
    function ensureAround(s) {
      const here = Math.floor(s / CHUNK_LEN);
      for (let i = here - BEHIND; i <= here + AHEAD; i++) if (i >= 0) buildChunk(i);
      for (const ci of Array.from(chunks.keys())) {
        if (ci < here - BEHIND || ci > here + AHEAD) disposeChunk(ci);
      }
    }

    /* ── Frame lookup ────────────────────────────────────────────────────── */

    const _pos = new THREE.Vector3();
    const _right = new THREE.Vector3();
    const _fwd = new THREE.Vector3();

    function frameAt(s) {
      const nodes = line.nodes;
      const f = U.clamp(s / SEG, 0, Math.max(0, nodes.length - 1.0001));
      const i = Math.floor(f);
      const t = f - i;
      const a = nodes[i] || nodes[0];
      const b = nodes[Math.min(i + 1, nodes.length - 1)] || a;
      const h = U.lerp(a.h, b.h, t);
      _pos.set(U.lerp(a.x, b.x, t), U.lerp(a.y, b.y, t), U.lerp(a.z, b.z, t));
      _right.set(Math.cos(h), 0, Math.sin(h));
      _fwd.set(Math.sin(h), 0, -Math.cos(h));
      return {
        pos: _pos, right: _right, forward: _fwd,
        heading: h,
        // Models face -Z, so a mesh's Y rotation is -heading. Using `heading`
        // directly yaws it backwards, which only looks right where the route
        // happens to point north. (Trap 1.)
        yaw: -h,
        bank: U.lerp(a.bank, b.bank, t),
        curvature: U.lerp(a.k, b.k, t),
        y: _pos.y
      };
    }

    /** World position on the water surface at (s, lateral offset). */
    function pointAt(s, off, out) {
      const fr = frameAt(s);
      const v = out || new THREE.Vector3();
      v.copy(fr.pos).addScaledVector(fr.right, off);
      v.y += lakeBank({ bank: fr.bank }, off);
      return v;
    }

    const _sunOffset = new THREE.Vector3(-0.5, 1.0, 0.4).normalize().multiplyScalar(140);
    let scroll = 0;

    /**
     * Keep the sky over the boat, and let the weather move through it.
     *
     * The clouds are parked relative to the camera rather than the route -
     * a lake this long would otherwise leave them all behind in the first
     * minute - and they wrap round when they reach the edge of the dome.
     */
    function driftClouds(dt, cameraPos) {
      if (!clouds) return;
      clouds.position.set(cameraPos.x, 0, cameraPos.z);
      for (const c of clouds.children) {
        c.position.x += (c.userData.drift || 1) * dt;
        if (c.position.x > 460) c.position.x = -460;
        else if (c.position.x < -460) c.position.x = 460;
      }
    }

    function update(dt, cameraPos, focusPos) {
      driftClouds(dt, cameraPos);
      sky.position.copy(cameraPos);
      sun.target.position.copy(focusPos);
      sun.position.copy(focusPos).add(_sunOffset);
      // The wash scrolls; the surface itself never moves. Held still under
      // reduced motion.
      if (!flat && !cfg.reducedMotion) {
        scroll += dt * 0.055;
        waterTex.offset.y = -scroll;
        waterTex.offset.x = Math.sin(scroll * 0.6) * 0.02;
      }
    }

    function dispose() {
      for (const ci of Array.from(chunks.keys())) disposeChunk(ci);
      scene.remove(group);
      /* The clouds hang off the SCENE rather than the lake's group, because
         they follow the camera rather than the route - so they have to be
         taken down by hand, or every trip leaves its weather behind for the
         next one to fly through. */
      clouds.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      scene.remove(clouds);
      scene.remove(sky);
      scene.remove(hemi);
      scene.remove(amb);
      scene.remove(sun);
      scene.remove(sun.target);
      scene.fog = null;
      sky.geometry.dispose();
      skyMat.dispose();
    }

    line.extendTo(CHUNK_NODES * (AHEAD + 2));
    ensureAround(0);

    return {
      group, sun, nodes: line.nodes,
      waterHalf: WATER_HALF, laneHalf: LANE_HALF, shoreEdge,
      frameAt, pointAt, ensureAround, update, dispose,
      lakeBank, shoreRise,
      get built() { return chunks.size; }
    };
  }

  return { build, buildLake, THEMES, SEG, ROAD_HALF, SHOULDER,
           WATER_HALF, LANE_HALF, SHORE_NEAR, SHORE_FAR,
           ribbon, lakeBank, shoreRise, shoreEdge, makeCentreline };
})();
