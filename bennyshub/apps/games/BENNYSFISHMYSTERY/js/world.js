/**
 * Whispering Lake, in three dimensions.
 *
 * Built from the chart in js/lake.js, which is built from content/lake.json.
 * Nothing about the shape of the lake is decided here - this only turns a
 * chart into geometry, so dragging a shoreline in the editor moves the world.
 *
 * WHAT THIS REPLACED, AND WHY IT IS SMALLER. The old world was a closed
 * trolling loop with the water swept as a band either side of it, streamed in
 * chunks as the boat went round. That bought a lot of machinery - lap
 * wrapping, chunk tiling, loop closure, a wrap sentinel, an interior fill -
 * and every one of those was a source of bugs: the lap that did not close, the
 * bank that folded through itself, the chunk that ended in mid-lake.
 *
 * None of it is needed. The lake is 2700 units across, which at fifteen units
 * a cell is a bed of about thirty thousand vertices - so it is built ONCE, in
 * full, and never touched again. The boat moves freely over it rather than
 * along a rail. There is no lap, so there is nothing to close.
 *
 * THREE PIECES OF GEOMETRY:
 *
 *   the bed      one heightfield over the whole extent. Under the water it is
 *                the depth from the chart; over the shoreline it climbs into
 *                the bank. Coloured by depth, so the drop-off reads from the
 *                surface.
 *   the water    one flat sheet across the whole lake, never clipped to the
 *                shoreline. The LAND is what shapes the lake, by rising
 *                through the sheet wherever there is bank - the same trick the
 *                old world used, and the one part of it worth keeping.
 *   the shore    trees, rocks and reeds scattered on the land near the water,
 *                and hills behind them for the far side to fade into.
 */
window.RT = window.RT || {};

RT.world = (function () {
  'use strict';

  const A = RT.art;
  const U = RT.util;

  /* A foot of depth, in world units. The hull is 9.4 units long and a small
     boat is about five metres, so a unit is roughly half a metre and a foot is
     about six tenths of one. Kept as a named constant because the chart talks
     in feet and the scene talks in units, and mixing them up would put the bed
     three times too deep. */
  const FT = 0.61;

  const CELL = 15;          // bed resolution, in units
  const BANK_OUT = 420;     // how far the land is built past the shoreline
  const BANK_RISE = 26;     // how high it gets by then
  const FOG_NEAR = 140;
  const FOG_FAR = 1250;     // the far shore hazes rather than ending

  const smooth = (t) => t * t * (3 - 2 * t);

  /**
   * Build the lake.
   *
   * @param {THREE.Scene} scene
   * @param {object} cfg  { chart, colors, flat, reducedMotion }
   *   chart   an RT.lake chart. Required: there is no lake without one.
   *   colors  the palette, read from CSS by game.js
   *   flat    High Contrast: no ripple, flat shading
   */
  function buildLake(scene, cfg) {
    cfg = cfg || {};
    const C = cfg.colors || {};
    const L = cfg.chart;
    if (!L) throw new Error('buildLake needs a chart - see js/lake.js');

    const flat = !!cfg.flat;
    const still = flat || !!cfg.reducedMotion;

    const col = (hex, fallback) => new THREE.Color(hex || fallback);
    const cShallow = col(C.waterShallow, '#39a0a6');
    const cMid = col(C.waterMid, '#1d6070');
    const cDeep = col(C.waterDeep, '#0a2c3d');
    const cSand = col(C.sand, '#c9b184');
    const cGrass = col(C.bankGrass, '#4a7a35');
    const cSoil = col(C.bankSoil, '#54412b');
    const fogHex = C.fog || '#cfe9f2';

    const group = new THREE.Group();
    scene.add(group);
    const geoms = [];

    /* NAMED FEATURES ON THE CHART. A place in content/lake.json can declare
       what is actually THERE - so far, the submerged log jam - and it is
       built with the lake rather than with the job that mentions it. Two
       jobs send you to that jam; a pile of timber that appeared for one of
       them and not the other would be a stage set rather than a lake. */
    (L.barriers || []).forEach(function (b, bi) {
      if (b.kind !== 'logjam') return;
      /* TWO ARMS AND A CHANNEL. The chart works out where the timber runs
         and where the gap is; the art is laid along exactly that, so what a
         player can see is what the hull is stopped by. Anything else and the
         lake is lying about where it can be crossed. */
      const arms = [[b.fromX, b.gapX - b.gapHalf], [b.gapX + b.gapHalf, b.toX]];
      arms.forEach(function (arm, ai) {
        const span = arm[1] - arm[0];
        if (span < 12) return;
        const jam = A.logJam({
          seed: 7919 * (bi + 1) + 131 * ai + Math.round(b.z),
          radius: 30, run: span,
          colors: { wood: C.dock, dark: C.bankSoil, deep: C.waterDeep },
        });
        jam.position.set((arm[0] + arm[1]) / 2, 0, b.z);
        group.add(jam);
      });
    });

    /* ── Sky and fog ────────────────────────────────────────────────────
       Brought in close on purpose. The far shore is up to 2700 units away and
       a lake that reads to its opposite bank in full clarity looks like a
       model of a lake; hazing it at 1250 makes the far side distance rather
       than a wall, and it is also what lets Foggy Island earn its name. */
    scene.fog = new THREE.Fog(new THREE.Color(fogHex).getHex(), FOG_NEAR, FOG_FAR);
    const skyMat = new THREE.MeshBasicMaterial({
      map: A.skyTexture(C.skyHigh || '#7fb8d8', C.skyMid || '#a8d4e6', C.skyLow || '#cfe9f2'), side: THREE.BackSide, depthWrite: false, fog: false,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(2600, 24, 16), skyMat);
    group.add(sky);

    const sun = new THREE.DirectionalLight(0xffffff, 1.35);
    /* From over the water (north is -Z), so the faces you look at from the
       lake - the shop front, the boards, the hulls - are the lit ones. From
       the south they were all in their own shadow. */
    sun.position.set(-420, 640, -380);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 40;
    sun.shadow.camera.far = 1600;
    sun.shadow.camera.left = -420;
    sun.shadow.camera.right = 420;
    sun.shadow.camera.top = 420;
    sun.shadow.camera.bottom = -420;
    group.add(sun);
    group.add(sun.target);
    const hemi = new THREE.HemisphereLight(0xdff0f6, 0x36502f, 0.62);
    group.add(hemi);
    /* Where the weather goes: the lake's own haze, and the cold grey it turns
       toward over the deep water. Kept as objects rather than made every
       frame - setGloom runs sixty times a second. */
    const _fogWarm = new THREE.Color(fogHex);
    const _fogGrey = new THREE.Color('#7c8b93');
    const _fogCold = new THREE.Color(fogHex);
    /* A plain dome for when the weather closes in: no gradient, no painting,
       just the colour of the air you are sat in. */
    const _fogSkyMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(fogHex), side: THREE.BackSide, depthWrite: false, fog: false });

    /* ── The bed ────────────────────────────────────────────────────────
       One heightfield over the whole extent, water and land together, so the
       shoreline is where the surface happens to cross zero rather than a seam
       between two meshes. That is the thing the old world got wrong: it built
       water and bank as separate ribbons and spent a fortnight on the join. */
    const e = L.extent;
    const x0 = e.minX - BANK_OUT, x1 = e.maxX + BANK_OUT;
    const z0 = e.minZ - BANK_OUT, z1 = e.maxZ + BANK_OUT;
    const nx = Math.ceil((x1 - x0) / CELL);
    const nz = Math.ceil((z1 - z0) / CELL);

    /**
     * Ground height at a point.
     *
     * Under water: minus the charted depth. Over land: climbing away from the
     * shoreline, so the lake sits in something rather than on it. The two meet
     * at zero at the waterline by construction, which is the whole reason the
     * bed is one mesh.
     */
    function groundAt(x, z) {
      const ft = L.depthAt(x, z);
      if (ft > 0) return -ft * FT;
      /* On land. `toShore` is the distance to the nearest waterline - the
         island's counting - so the bank climbs out of the water on every side
         including the island's. */
      const d = Math.min(BANK_OUT, L.toShore(x, z));
      const t = smooth(d / BANK_OUT);
      // A little roll, so it is a bank and not a ramp.
      const roll = Math.sin(x * 0.0071) * Math.cos(z * 0.0063) * 3.4;
      /* The foreshore: a quick first rise out of the water, so the beach is
         a beach and not a film of land at water level. Without it a barrel
         ten units up the sand stood four centimetres above the lake and read
         as standing in it. */
      const fore = smooth(Math.min(1, d / 16)) * 1.1;
      return fore + t * BANK_RISE + t * roll;
    }

    /** What the bed looks like at a point: sand, weed, mud, or grass ashore. */
    const _c = new THREE.Color();
    function bedColour(x, z) {
      const ft = L.depthAt(x, z);
      if (ft <= 0) {
        const d = Math.min(BANK_OUT, L.toShore(x, z));
        _c.copy(cSand).lerp(cGrass, smooth(Math.min(1, d / 90)));
        if (d > 200) _c.lerp(cSoil, smooth(Math.min(1, (d - 200) / 260)));
        return _c;
      }
      // Under water, the bottom pales in the shallows and darkens in the hole.
      _c.copy(cSand).lerp(cShallow, smooth(Math.min(1, ft / 6)));
      _c.lerp(cMid, smooth(Math.min(1, Math.max(0, (ft - 5) / 14))));
      if (ft > 18) _c.lerp(cDeep, smooth(Math.min(1, (ft - 18) / 24)));
      return _c;
    }

    (function buildBed() {
      const verts = (nx + 1) * (nz + 1);
      const pos = new Float32Array(verts * 3);
      const colr = new Float32Array(verts * 3);
      const idx = [];
      for (let j = 0; j <= nz; j++) {
        for (let i = 0; i <= nx; i++) {
          const x = x0 + i * CELL, z = z0 + j * CELL;
          const o = (j * (nx + 1) + i);
          pos[o * 3] = x;
          pos[o * 3 + 1] = groundAt(x, z);
          pos[o * 3 + 2] = z;
          const c = bedColour(x, z);
          colr[o * 3] = c.r; colr[o * 3 + 1] = c.g; colr[o * 3 + 2] = c.b;
        }
      }
      for (let j = 0; j < nz; j++) {
        for (let i = 0; i < nx; i++) {
          const a = j * (nx + 1) + i, b = a + 1;
          const c = (j + 1) * (nx + 1) + i, d = c + 1;
          idx.push(a, c, b, b, c, d);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(colr, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      geoms.push(g);
      const m = new THREE.MeshStandardMaterial({
        vertexColors: true, roughness: 0.92, metalness: 0.02,
        flatShading: flat,
      });
      const mesh = new THREE.Mesh(g, m);
      mesh.receiveShadow = true;
      group.add(mesh);
    })();

    /* ── The water ──────────────────────────────────────────────────────
       One sheet, flat, across the whole lake. Never clipped to the shoreline:
       the bed rises through it and that is what draws the shore. Coloured by
       the depth beneath, so the drop-off and the deep hole read from the
       surface - which on a lake you cross in a straight line is the only
       navigation aid there is until the sonar is bought. */
    const waterMat = new THREE.MeshStandardMaterial({
      vertexColors: true, transparent: true, opacity: 0.9,
      roughness: still ? 0.55 : 0.28, metalness: 0.06,
      side: THREE.DoubleSide, flatShading: flat,
    });
    let waterMesh = null, waterGeo = null;
    let scroll = 0;

    (function buildWater() {
      const WC = 22;                     // the sheet can be coarser than the bed
      const wnx = Math.ceil((e.maxX - e.minX + 200) / WC);
      const wnz = Math.ceil((e.maxZ - e.minZ + 200) / WC);
      const wx0 = e.minX - 100, wz0 = e.minZ - 100;
      const verts = (wnx + 1) * (wnz + 1);
      const pos = new Float32Array(verts * 3);
      const colr = new Float32Array(verts * 3);
      const uv = new Float32Array(verts * 2);
      const idx = [];
      for (let j = 0; j <= wnz; j++) {
        for (let i = 0; i <= wnx; i++) {
          const x = wx0 + i * WC, z = wz0 + j * WC;
          const o = j * (wnx + 1) + i;
          pos[o * 3] = x;
          pos[o * 3 + 1] = still ? 0 : rippleAt(x, z);
          pos[o * 3 + 2] = z;
          const ft = L.depthAt(x, z);
          _c.copy(cShallow)
            .lerp(cMid, smooth(Math.min(1, ft / 14)))
            .lerp(cDeep, smooth(Math.min(1, Math.max(0, (ft - 14) / 26))));
          colr[o * 3] = _c.r; colr[o * 3 + 1] = _c.g; colr[o * 3 + 2] = _c.b;
          uv[o * 2] = x / 260; uv[o * 2 + 1] = z / 260;
        }
      }
      for (let j = 0; j < wnz; j++) {
        for (let i = 0; i < wnx; i++) {
          const a = j * (wnx + 1) + i, b = a + 1;
          const c = (j + 1) * (wnx + 1) + i, d = c + 1;
          idx.push(a, c, b, b, c, d);
        }
      }
      waterGeo = new THREE.BufferGeometry();
      waterGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      waterGeo.setAttribute('color', new THREE.BufferAttribute(colr, 3));
      waterGeo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      waterGeo.setIndex(idx);
      waterGeo.computeVertexNormals();
      geoms.push(waterGeo);
      waterMat.map = A.waterTexture(flat);
      if (waterMat.map) {
        waterMat.map.wrapS = waterMat.map.wrapT = THREE.RepeatWrapping;
      }
      waterMesh = new THREE.Mesh(waterGeo, waterMat);
      waterMesh.receiveShadow = true;
      group.add(waterMesh);
    })();

    /** Small standing ripple, baked into the surface. Held flat when asked. */
    function rippleAt(x, z) {
      if (still) return 0;
      return Math.sin(x * 0.021 + z * 0.013) * 0.11
           + Math.sin(x * 0.008 - z * 0.031) * 0.07;
    }

    /* ── The shore ──────────────────────────────────────────────────────
       Scattered once, on land, near the water. Seeded, so the lake looks the
       same every time you come out to it - the old world seeded its scenery
       per mission, which quietly rearranged the trees between one job and the
       next. */
    /* THE TOWN DOCK, SEEN FROM THE LAKE.
       The shop, the jetty and the sign are built by the dock scene and thrown
       away the moment you push off, so paddling back toward the bank showed
       an empty shore - and the one landmark on a lake with no landmarks was
       missing exactly when it would have been useful. These are the same
       shapes at the same place, built into the world itself: something to
       steer by, and the way home. */
    let townDock = null;
    (function buildTownDock() {
      const d = L.dock;
      let z = d.z - 90;
      for (let i = 0; i < 260; i++) { if (!L.inWater(d.x, z + 1)) break; z += 1; }
      const g2 = new THREE.Group();
      const jet = A.jetty(31, C);
      jet.position.set(d.x, Math.max(0.55, groundAt(d.x, z + 9) + 0.35), z + 9);
      g2.add(jet);
      const shop = A.tackleShop(C);
      shop.position.set(d.x, groundAt(d.x, z + 12) + 0.04, z + 12);
      shop.rotation.y = Math.PI;
      g2.add(shop);
      const sign = A.signBoard('MAIN MENU', C);
      sign.position.set(d.x - 17, groundAt(d.x - 17, z + 7) + 0.04, z + 7);
      sign.rotation.y = Math.PI;
      g2.add(sign);
      /* The scene builds its own detailed dock when you are standing on it -
         with the shop you can walk into and the sign you can press - so this
         one is only ever the view from the water. Two of everything, half a
         unit apart, is what you get otherwise. */
      g2.name = 'townDock';
      townDock = g2;
      group.add(g2);
    })();

    (function populateShore() {
      const r = U.rng(U.hash('whispering:' + (cfg.seed || 1)));
      const props = new THREE.Group();
      /* More attempts than there are props: most are thrown away for being in
         the water, too far from the shore or simply unlucky. The woods behind
         the shop want a lot of hits in a small area, so the count went up
         with them. */
      const tries = 5200;
      for (let n = 0; n < tries; n++) {
        const x = e.minX - 200 + r.range(0, (e.maxX - e.minX) + 400);
        const z = e.minZ - 200 + r.range(0, (e.maxZ - e.minZ) + 400);
        if (L.inWater(x, z)) continue;
        const d = L.toShore(x, z);
        if (d > BANK_OUT * 0.8) continue;

        /* Nothing right on top of the town dock: that is a built-up shore.
           Behind the shop is different - the bank climbs into timber there,
           and a bare green field behind a research station on a lake nobody
           visits any more read as a mown lawn. */
        const dock = Math.hypot(x - L.dock.x, z - L.dock.z);
        /* BEHIND the shop is timber, and it comes close. The clear radius
           round the dock is what keeps the beach and the yard tidy, so it
           applies to the shore - not to the bank behind the buildings, where
           excluding a hundred and fifty units left the one stretch of ground
           the player looks at all game as mown lawn. `d` is the distance from
           the water, and thirty of it is yard enough for the shop, the sign
           and the drying rack. */
        const behindTheShop = dock < 700 && z > L.dock.z + 30 && d > 30;
        if (!behindTheShop && dock < 150) continue;

        let obj = null;
        if (behindTheShop) {
          // Dense, mostly conifer, with brush in the gaps.
          if (!r.chance(0.82)) continue;
          obj = r.chance(0.7) ? A.pineTree(r, C)
              : r.chance(0.6) ? A.roundTree(r, C) : A.bush(r, C);
        } else if (d < 16 && r.chance(0.5)) {
          // Reeds standing in the margin.
          const clump = new THREE.Group();
          const count = r.int(3, 7);
          for (let k = 0; k < count; k++) {
            clump.add(A.part(new THREE.CylinderGeometry(0.05, 0.09, r.range(1.8, 3.6), 4),
                             A.paper(C.reed || 0x7a9c3f),
                             { pos: [r.range(-0.9, 0.9), r.range(0.9, 1.8), r.range(-0.9, 0.9)],
                               cast: false }));
          }
          obj = clump;
        } else if (d > 40 && r.chance(0.34)) {
          obj = r.chance(0.55) ? A.pineTree(r, C) : A.roundTree(r, C);
        } else if (r.chance(0.16)) {
          obj = r.chance(0.5) ? A.rock(r, C) : A.bush(r, C);
        }
        if (!obj) continue;
        obj.position.set(x, groundAt(x, z), z);
        obj.rotation.y = r.range(0, Math.PI * 2);
        props.add(obj);
      }

      /* Hills behind the tree line, for the far shore to fade into. Sparse and
         large: they sit at eight hundred units and out, where anything sized
         to be read up close is a few pixels of nothing. */
      const HILLS = [C.foliageDark || '#3f7a3a', C.bankGrass || '#4a7a35',
                     C.foliageLight || '#5f9a45'];
      for (let n = 0; n < 90; n++) {
        const a = (n / 90) * Math.PI * 2 + r.range(-0.03, 0.03);
        const rad = r.range(1500, 2100);
        const x = (e.minX + e.maxX) / 2 + Math.cos(a) * rad;
        const z = (e.minZ + e.maxZ) / 2 + Math.sin(a) * rad;
        const h = A.hillBackdrop(r, HILLS);
        h.scale.setScalar(r.range(2.4, 4.6));
        h.position.set(x, 0, z);
        props.add(h);
      }
      group.add(props);
    })();

    /* ── What the rest of the game asks the lake ────────────────────────
       Deliberately thin, and all of it forwarded to the chart. The world holds
       no opinion about where anything is: if the world and the chart could
       disagree, one of them would be wrong. */
    function update(dt, cameraPos, focusPos) {
      if (cameraPos) sky.position.copy(cameraPos);
      if (focusPos) {
        sun.target.position.copy(focusPos);
        sun.position.copy(focusPos).add(new THREE.Vector3(-420, 640, -380));
      }
      if (!still && waterMat.map) {
        scroll += dt * 0.05;
        waterMat.map.offset.y = -scroll;
        waterMat.map.offset.x = Math.sin(scroll * 0.6) * 0.02;
      }
    }

    function dispose() {
      group.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
      });
      geoms.forEach(function (g) { g.dispose(); });
      scene.remove(group);
      scene.fog = null;
      skyMat.dispose();
      waterMat.dispose();
    }

    return {
      group: group, sun: sun, chart: L,

      // Straight through to the chart, so there is one answer to each.
      depthAt: L.depthAt, inWater: L.inWater, stageAt: L.stageAt,
      toShore: L.toShore, fromDock: L.fromDock, reachable: L.reachable,
      stage: L.stage, dock: L.dock, extent: L.extent,
      /* The dock as seen from the lake. Hidden while the real one is up. */
      showTownDock: (on) => { if (townDock) townDock.visible = !!on; },

      /** Height of the ground - the bed under the water, the bank over it. */
      groundAt: groundAt,
      /** Surface height at a point, which is the ripple and nothing else. */
      surfaceAt: rippleAt,
      /** A foot, in world units. Everything converting depth needs this. */
      FT: FT,

      /**
       * How closed-in it is out here, 0 to 1.
       *
       * The lake had one fog setting from the dock to the trench, so the
       * middle of it - the whole point of which is that nobody can see what
       * is out there - was as bright and as clear as the shallows. This is
       * called every frame with a number worked out from the water under the
       * boat; it brings the fog in, cools its colour, and takes some of the
       * strength out of the sun and the sky with it.
       */
      setGloom: function (k) {
        k = Math.max(0, Math.min(1, k || 0));
        if (!scene.fog) return;
        /* FOG IS BRIGHT, NOT DARK. The first go at this dimmed the sun hard
           and pulled the fog in, and what came out looked like night: a dark
           lake under a dark sky with the horizon a long way off. Real haze
           SCATTERS light - it flattens the shadows and washes everything
           toward one pale colour - so the sun comes down a little, the sky
           light comes UP, and the fog closes in a long way. */
        scene.fog.near = FOG_NEAR * (1 - 0.72 * k);
        scene.fog.far = FOG_FAR * (1 - 0.80 * k);
        _fogCold.copy(_fogWarm).lerp(_fogGrey, k * 0.85);
        scene.fog.color.copy(_fogCold);
        /* AND THE SKY IS THE FOG. The dome is deliberately exempt from fog -
           it is a painted gradient and fogging it would grey the whole sky
           at any distance - so tinting it does almost nothing: the picture
           kept a bright blue sky over a hazed lake, which reads as evening
           rather than weather. Inside real fog there is no sky to see, so
           past a certain thickness the dome becomes the fog colour itself. */
        if (k > 0.3) {
          _fogSkyMat.color.copy(_fogCold);
          if (sky.material !== _fogSkyMat) sky.material = _fogSkyMat;
        } else if (sky.material !== skyMat) {
          sky.material = skyMat;
        }
        sun.intensity = 1.35 * (1 - 0.22 * k);
        if (hemi) hemi.intensity = 0.62 * (1 + 0.45 * k);
      },

      update: update, dispose: dispose,
    };
  }

  return { buildLake: buildLake, FT: FT, CELL: CELL };
})();
