/**
 * Benny's Ballista — paper-craft art kit.
 *
 * Every model is built procedurally out of chunky, flat-shaded primitives with
 * a shared paper-fibre texture, which is what sells the folded-paper diorama
 * look without shipping a single asset file. Ported from BENNYSRACETRACKS'
 * art.js core (paperTexture / paper / glow / outline / ink / part / setShadow,
 * lines 1-205 there) — byte-identical except for the road/cloud/hill helpers
 * this game has no use for, which were dropped rather than carried as dead
 * code (see AGENTS.md and the ballista-3d plan on FishMaster's world.js wart).
 *
 * Two rules run through all of it:
 *   1. Big, round, saturated shapes — toy-like rather than realistic.
 *   2. Anything the player must react to gets a dark ink outline. It reads as
 *      craft-paper edging and it is the cheapest way to buy the contrast
 *      Ben's low vision needs — every block gets one, and so does the crown.
 */
RT.art = (function () {
  'use strict';

  const U = RT.util;

  /* ── Shared texture ───────────────────────────────────────────────────── */

  let PAPER = null;

  /** Near-white so material.color can tint it freely. */
  function paperTexture() {
    if (PAPER) return PAPER;
    const size = 256;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const r = U.rng(90210);

    g.fillStyle = '#f7f2e8';
    g.fillRect(0, 0, size, size);

    for (let i = 0; i < 2400; i++) {
      const x = r.range(0, size), y = r.range(0, size);
      const len = r.range(2, 10), ang = r.range(0, Math.PI * 2);
      g.strokeStyle = r.chance(0.5) ? 'rgba(130,112,90,0.07)' : 'rgba(255,255,255,0.5)';
      g.lineWidth = r.range(0.5, 1.3);
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
      g.stroke();
    }
    for (let i = 0; i < 180; i++) {
      g.fillStyle = 'rgba(150,132,108,0.08)';
      g.beginPath();
      g.arc(r.range(0, size), r.range(0, size), r.range(0.5, 1.7), 0, Math.PI * 2);
      g.fill();
    }

    PAPER = new THREE.CanvasTexture(c);
    PAPER.wrapS = PAPER.wrapT = THREE.RepeatWrapping;
    PAPER.colorSpace = THREE.SRGBColorSpace;
    PAPER.anisotropy = 4;
    return PAPER;
  }

  /** Vertical gradient sky, drawn into a dome. */
  function skyTexture(top, mid, bottom) {
    const c = document.createElement('canvas');
    c.width = 8; c.height = 256;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0.0, top);
    grad.addColorStop(0.58, mid);
    grad.addColorStop(1.0, bottom);
    g.fillStyle = grad;
    g.fillRect(0, 0, 8, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /* ── Materials ────────────────────────────────────────────────────────────
   * This module never reads the DOM or the theme; it is *told* what to look
   * like, the same way world.js is handed its colours rather than fetching
   * them. game.js reads the CSS custom properties once per theme change and
   * calls setFlat()/setInk() here.
   */

  let matCache = {};
  let flatProfile = false;

  /**
   * High Contrast wants unlit, solid-fill geometry rather than the paper-craft
   * shading — flat colour and heavy outlines, no gradients, no texture. That
   * is a different *material class*, not a different colour, so it has to be
   * decided here where materials are made. game.js drives it from isFlat().
   */
  function setFlat(on) {
    on = !!on;
    if (on === flatProfile) return false;
    flatProfile = on;
    clearMatCache();
    return true;                        // caller needs to rebuild/repaint
  }
  function isFlatProfile() { return flatProfile; }

  /** Materials are cached and shared across every block, so nothing may
   *  dispose them per-mesh (see game.js's disposeBlockMesh). Dropping the
   *  cache wholesale is how a theme change gets clean materials — without
   *  this, the cache key (colour + opts) matches across themes and the OLD
   *  material is handed back, so the world keeps the previous profile's look.
   *
   *  Deliberately does NOT dispose the old materials. Live meshes still hold
   *  references until game.js repaints them, and disposing a material that is
   *  still on a mesh is a use-after-free waiting on someone forgetting to
   *  repaint one thing. The cost of not disposing is a handful of tiny
   *  materials per theme switch, which is not worth that risk. */
  function clearMatCache() { matCache = {}; }

  /** The workhorse: flat-shaded, papery, no shine — or unlit solid fill in
   *  the High Contrast profile. */
  function paper(color, opts) {
    opts = opts || {};
    const key = (flatProfile ? 'f|' : 'p|') + color + '|' + JSON.stringify(opts);
    if (matCache[key]) return matCache[key];

    let m;
    if (flatProfile) {
      /* Unlit: the colour on screen is exactly the palette colour, with no
         light, no shadow and no paper fibre to wash it out. An emissive glow
         has no meaning here — an unlit material is already at full value —
         so the crown/tyrant simply renders as its own solid colour, which in
         this profile is the brightest thing on a black field anyway. */
      m = new THREE.MeshBasicMaterial({
        color: color,
        side: opts.side || THREE.FrontSide,
        transparent: !!opts.transparent,
        opacity: opts.opacity === undefined ? 1 : opts.opacity,
        fog: false                      // distance must not eat contrast
      });
    } else {
      m = new THREE.MeshStandardMaterial({
        color: color,
        map: opts.noMap ? null : paperTexture(),
        roughness: opts.roughness === undefined ? 0.92 : opts.roughness,
        metalness: opts.metalness === undefined ? 0 : opts.metalness,
        flatShading: opts.flat === undefined ? true : opts.flat,
        side: opts.side || THREE.FrontSide,
        transparent: !!opts.transparent,
        opacity: opts.opacity === undefined ? 1 : opts.opacity,
        emissive: opts.emissive === undefined ? 0x000000 : opts.emissive,
        emissiveIntensity: opts.emissiveIntensity === undefined ? 1 : opts.emissiveIntensity
      });
    }
    matCache[key] = m;
    return m;
  }

  /** Self-lit material for anything that should glow (the crown). */
  function glow(color, intensity) {
    return paper(color, {
      emissive: color,
      emissiveIntensity: intensity === undefined ? 0.9 : intensity,
      roughness: 0.55,
      noMap: true
    });
  }

  /* One shared ink material for every outline in the scene. Two reasons it is
   * shared rather than one material per outline: there is an outline on every
   * block of every castle, and — the point here — re-inking for a new theme is
   * then a single colour assignment that every existing outline picks up,
   * with no traversal and nothing to rebuild. */
  const INK = 0x2f231a;                 // the paper-craft default, still the fallback
  const inkMat = new THREE.LineBasicMaterial({ color: INK });

  function setInk(color) {
    try { inkMat.color.set(color || INK); } catch (e) { inkMat.color.set(INK); }
  }

  function outline(mesh, color, angle) {
    try {
      const edges = new THREE.EdgesGeometry(mesh.geometry, angle === undefined ? 26 : angle);
      /* A caller asking for a specific colour gets its own material; everything
         else shares the themed one. Nothing currently passes a colour, but the
         parameter predates this and removing it would be a silent behaviour
         change for any caller added since. */
      const mat = color === undefined ? inkMat : new THREE.LineBasicMaterial({ color: color });
      const line = new THREE.LineSegments(edges, mat);
      line.raycast = function () {};
      mesh.add(line);
      return line;
    } catch (e) {
      return null;
    }
  }

  /** Outline every mesh in a group — used on gameplay-critical props only. */
  function ink(group, color) {
    group.traverse((o) => { if (o.isMesh) outline(o, color); });
    return group;
  }

  function part(geo, mat, opts) {
    opts = opts || {};
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = opts.cast !== false;
    m.receiveShadow = !!opts.receive;
    if (opts.outline) outline(m, opts.outlineColor, opts.outlineAngle);
    if (opts.pos) m.position.set(opts.pos[0], opts.pos[1], opts.pos[2]);
    if (opts.rot) m.rotation.set(opts.rot[0], opts.rot[1], opts.rot[2]);
    if (opts.scale) {
      if (typeof opts.scale === 'number') m.scale.setScalar(opts.scale);
      else m.scale.set(opts.scale[0], opts.scale[1], opts.scale[2]);
    }
    return m;
  }

  function setShadow(root, cast, receive) {
    root.traverse((o) => {
      if (o.isMesh) { o.castShadow = cast; o.receiveShadow = receive; }
    });
    return root;
  }

  /* ── Environment scenery ──────────────────────────────────────────────────
   * Ported from BENNYSRACETRACKS' art.js (cloud/hillBackdrop, unchanged) —
   * the ATTRACT/SETTLE camera orbits the arena, so the horizon needs real
   * geometry that reads correctly from every angle, not a single painted
   * backdrop (see the ballista-3d plan on why this is fully procedural).
   */

  /** Always near-white regardless of theme; broken out so world.js can
   *  re-fetch it after a profile change flips paper() between the lit and
   *  unlit material class (clouds don't repaint via A.repaint() since they
   *  carry no palette key — there is nothing about their colour that varies
   *  by theme, only the material class does). */
  function cloudMaterial() {
    return paper(0xfffefb, { roughness: 1, flat: false, noMap: true });
  }

  /** Chunky stacked-lobe cloud. Smooth spheres rather than facets — a soft
   *  cut-out shape reads as weather; a faceted one reads as rubble. */
  function cloud(r) {
    const g = new THREE.Group();
    const white = cloudMaterial();
    const n = r.int(4, 6);
    let x = 0;
    for (let i = 0; i < n; i++) {
      const rad = r.range(4.2, 7.0) * (1 - Math.abs(i - (n - 1) / 2) / (n * 1.5));
      g.add(part(new THREE.SphereGeometry(rad, 12, 9), white, {
        pos: [x, r.range(-0.4, 0.8), r.range(-1.2, 1.2)],
        scale: [1, r.range(0.62, 0.8), 1],
        cast: false
      }));
      x += rad * r.range(1.0, 1.35);
    }
    g.position.x = -x / 2;
    const wrap = new THREE.Group();
    wrap.add(g);
    return wrap;
  }

  /** Big soft shape along the horizon so the world doesn't end at the fog.
   *  Tagged 'hill' so a theme change repaints it the same way as any other
   *  palette-driven part (see repaint()). */
  function hillBackdrop(r, colors) {
    const g = new THREE.Group();
    const rad = r.range(45, 90);
    const mesh = part(new THREE.SphereGeometry(rad, 9, 5, 0, Math.PI * 2, 0, Math.PI / 2), paper(r.pick(colors)), {
      pos: [0, -rad * r.range(0.35, 0.55), 0],
      scale: [r.range(1.2, 2.2), r.range(0.3, 0.5), 1],
      cast: false
    });
    mesh.userData.pal = 'hill';
    g.add(mesh);
    return g;
  }

  /* Extra material options per palette entry, so repaint() can rebuild the
     exact material a part was first given rather than a plain one. */
  const PAL_OPTS = { wood: undefined, steel: { roughness: 0.5, metalness: 0.15 } };

  /**
   * Repaint an already-built assembly for a new palette.
   *
   * A mesh holds whatever material it was handed when it was built, so a
   * palette change does not reach it on its own — clearing the material cache
   * only affects things built *after* the switch. Each part records which
   * palette entry it was painted from (`userData.pal`), which makes this a
   * lookup rather than a rebuild: the ballista keeps its live aim rotation and
   * nothing has to be removed from the scene.
   *
   * @param {THREE.Object3D} root
   * @param {object} colors  palette entry name -> css colour
   */
  function repaint(root, colors) {
    root.traverse((o) => {
      const key = o.isMesh && o.userData ? o.userData.pal : null;
      if (!key || colors[key] === undefined) return;
      o.material = paper(colors[key], PAL_OPTS[key]);
    });
    return root;
  }

  /**
   * A block of the siege wall — the visual half of a level cell. The physics
   * body (Ammo) is a separate box built to match these same dimensions;
   * see js/physics.js. Given an ink outline unconditionally: every block is
   * something the player is judging a shot against.
   */
  function buildBlock(w, h, d, color, opts) {
    opts = opts || {};
    const mat = opts.glow ? glow(color) : paper(color);
    const mesh = part(blockGeometry(w, h, d, opts.shape), mat,
                      { cast: true, receive: true, outline: true });
    return mesh;
  }

  /**
   * Two things Ben has to tell apart must differ in SHAPE as well as colour —
   * a marking or a shade alone does not survive low vision. Materials that are
   * always a single cell can therefore afford their own silhouette, and the
   * powder keg is the clearest case: as a box it was indistinguishable from
   * every other block until it exploded.
   *
   * Only ever called for non-mergeable materials, whose runs are always one
   * cell (see levels.js's rowRuns — it only extends a run when mat.mergeable),
   * so a shaped mesh can never be asked to stretch across a merged wall. The
   * physics body stays the same box either way, which is fine at this scale
   * and keeps js/physics.js free of shape special cases.
   */
  function blockGeometry(w, h, d, shape) {
    if (shape === 'barrel') {
      const r = Math.min(w, d) * 0.5;
      // 10 sides, not 16: chunky and faceted reads as craft, and gives
      // EdgesGeometry real corners to ink instead of a smooth tube.
      return new THREE.CylinderGeometry(r, r, h, 10);
    }
    if (shape === 'crown') {
      /* The crown is the win condition, so it is the one thing that must
       * never be ambiguous — and up to now it relied on glow()'s emissive to
       * stand out. That works in the three lit profiles and does nothing at
       * all in High Contrast, where materials are unlit and every colour is
       * already at full value: there the crown was a yellow box among orange
       * boxes, i.e. distinguished by hue alone, in exactly the profile that
       * exists because hue alone is not enough. A real humanoid silhouette
       * (the baked tyrant model, once approved — see js/models.js) solves
       * that on shape alone, same as every other block here; the faceted
       * gem is the fallback for as long as that model isn't baked yet. */
      /* Guarded, not a bare RT.models.geometry() call: the fallback below
       * already handles "the model isn't baked yet", and a page that simply
       * doesn't load js/models.js deserves the same graceful path rather than
       * a TypeError. editor.html was exactly that page for months — it omitted
       * models.js, so every level threw here on its first crown, the throw
       * escaped before requestAnimationFrame ever started, and the whole tool
       * rendered black. One missing script tag should degrade a silhouette,
       * not kill the page. */
      const tyrant = (RT.models && RT.models.geometry) ? RT.models.geometry('tyrant') : null;
      /* model_prep.py's `prop` mode centres X/Z on the cell but floors Y (feet
       * at local y=0, top at the model's own height) — a resting-on-a-shelf
       * convention, not the symmetric ±h/2 box every OTHER shape here assumes.
       * Every block (this one included) gets its MESH positioned at the
       * block's CENTRE by the caller, so a floor-based geometry placed there
       * lands with its feet at the centre instead of the cell's floor —
       * visibly floating half the block's height above whatever it's really
       * standing on. Shift it down by h/2 so its local y=0 lands exactly on
       * the block's bottom face instead, same as a real box would. Confirmed
       * empirically, not assumed: the baked bbox is y:[0, 0.88] before this,
       * meaning a crown block centred at y=4.5 (bottom face at 4.0) rendered
       * with its feet at 4.5 — a 0.5-unit gap, matching what was reported. */
      if (tyrant) return tyrant.translate(0, -h / 2, 0);
      /* Sized to the cell's inscribed radius so it fills the cell without
       * overhanging it (the interpenetration audit has to stay honest). */
      return new THREE.OctahedronGeometry(Math.min(w, h, d) * 0.5);
    }
    if (shape === 'guard-spear' || shape === 'guard-halberd') {
      /* Real, placed guards — same baked models the decorative guardDecor/
       * guardDecor2 already use (js/game.js), same guarded lookup and same
       * floor-Y shift as the crown above (both were prepped with a
       * feet-at-local-y=0 convention, confirmed empirically when each model
       * was first proven — see [[ballista-3d-rework]]). The shape name IS
       * the baked model name, so no separate lookup table is needed here. */
      const guard = (RT.models && RT.models.geometry) ? RT.models.geometry(shape) : null;
      if (guard) return guard.translate(0, -h / 2, 0);
      // Fallback silhouette if the model isn't baked (or this page never
      // loaded js/models.js) — a person-ish capsule, not a crash.
      const r = Math.min(w, d) * 0.32;
      return new THREE.CapsuleGeometry(r, Math.max(0.1, h - r * 2), 4, 8);
    }
    return new THREE.BoxGeometry(w, h, d);
  }

  /** Only the wheeled base is a generated model now — the crossbow on top of
   *  it is built from primitives by buildCrossbow() below. See the note there
   *  for why. */
  const HERO_BALLISTA_PARTS = ['ballista-base'];

  /* 2026-08-31: the three-piece tall A-frame (base + straight arm + two
     mirrored bow-limbs) was scrapped for a low-profile two-piece crossbow —
     the A-frame obstructed the AIM camera's view downrange. See
     [[comfyui-mesh-generation-pipeline]] for the regeneration itself.
     ballista-mech now fuses what used to be three separate parts (arm,
     both limbs, and the trigger housing) into ONE mesh, so it needs only
     one rotation/position, not three, and — being a single wide bent prod
     rather than a thin rod — never hit the old ~5:1 aspect-ratio ceiling
     that forced HERO_ARM_SCALE/HERO_LIMB_SCALE's axial stretch hack. Box-fit
     at its own native proportions (no stretch): `normalize_part`'s scale is
     1.0 on every axis for both new pieces. */
  /* Why the crossbow is hand-built while the base is generated.
     ------------------------------------------------------------------
     A crossbow is a T in PLAN view: a rail running downrange, a prod
     crossing it at the FRONT, strings drawn back to a catch at the rear.
     (Bryan's top-down reference was twice misread here as a front
     elevation, which produced a bow with a handle in the same plane — an
     arc, with no depth along the firing axis at all. A three-quarter view
     hides that error, and the in-game camera IS three-quarter, so
     screenshots were the least diagnostic thing to judge it by. The check
     that settles it is the mesh's own top-down silhouette against the
     reference's: flat line vs T.)

     Image-to-mesh generation never landed that shape. Across six concept
     attempts it produced, in turn: an arc; a prod at the wrong end; one
     limb at the front-left and another at the rear-right (two L's rather
     than a prod); and a rail skewed enough that mirroring the good half
     doubled it into an A-frame. Each repair uncovered the next defect,
     because the reconstruction was never structurally a crossbow.

     A crossbow is also trivial geometry — a rail, two mirrored limbs, a
     string, a bolt. Built from primitives it is exactly symmetric by
     construction rather than by hope, it reads at any size (which is the
     whole point for Ben — see the accessibility notes), and it can be
     genuinely two-tone: a baked model is repainted ONE flat palette
     colour at runtime, so wood-vs-steel separation is impossible for it
     but free here. That is Bryan's call, made after seeing the two L's.

     The base stays generated: a wheeled cart has surface detail worth
     having and it reconstructed cleanly. */
  /* normalize_part centres the baked base on all three axes, including Y —
     there's no floor convention for `part` kind (see model_prep.py) — so it
     has to be lifted by its own half-height to rest on the ground the way
     the sled/wheels it replaces always did. Read straight off model_prep's
     own printed bbox for the low-profile base (half-height 0.398); re-tune
     if the base is ever regenerated. */
  const HERO_BASE_LIFT_Y = 0.398;
  /* CFG.MUZZLE_Y (the pivot's world height, 2.35) is a gameplay constant —
     real shots spawn from it and every trajectory in data.js is solved
     against it, so it must never move for a cosmetic reason (changing it
     would need re-auditing all twelve levels' reachability, same caveat as
     CFG.GRAVITY). The new mechanism sits much lower than that on purpose
     (that's the whole point of the low-profile rework), so — same trick the
     old arm used — it's drawn well below the pivot's actual rotation origin
     purely cosmetically: this offsets where the mesh is drawn within
     pivot-local space, not the pivot's own world position, so aim/trajectory
     math is completely untouched. Tuned by eye against the real AIM camera
     pose, not derived from a measurement — re-tune if either piece is ever
     regenerated (this is a bigger offset than the base's own lift because
     world height obviously didn't move — the new mechanism sits close to
     its own low base, nowhere near as far below the pivot as the old tall
     A-frame's arm did). Re-tuned for the hand-built crossbow, which is
     modelled about its own rail centreline (y=0), so this is just "drop it
     until the rail rests on the cart deck". */
  const HERO_MECH_DRAW_Y = -1.46;
  /* Slides the whole crossbow along its own length so the prod sits over the
     cart's front axle rather than hanging off the nose, matching how the
     real toy in Bryan's reference photos is mounted. */
  const HERO_MECH_DRAW_Z = 0.2;

  /* Where the prod crosses the rail, and how far each limb reaches. The span
     (2 x LIMB_REACH, about 1.7) is a little wider than the cart itself, so
     the prod is the widest thing on the engine and therefore what the eye
     catches first — the feature that says "crossbow" rather than "cart". */
  const PROD_Z = -1.25;
  const LIMB_REACH = 0.85;
  /* Each limb is three straight segments whose sweep-back angle increases
     down its length: a curve cheap enough to ink cleanly, where a smooth
     tube would just read as a wire. Angles are from +X (straight out
     sideways) toward +Z (back toward the player), so the prod cups the
     shooter the way a real bow's limbs do. */
  const LIMB_SEGMENTS = [
    { angle: 0.16, length: 0.32, thick: 0.13 },
    { angle: 0.50, length: 0.30, thick: 0.11 },
    { angle: 0.92, length: 0.28, thick: 0.09 }
  ];
  /* Where both strings meet behind the prod — the nock the bolt sits against. */
  const CATCH_Z = 0.18;

  /**
   * The crossbow that sits on the cart: rail, two mirrored limbs, strings,
   * and a nocked bolt. Modelled about its own rail centreline (origin at
   * y=0, mid-rail) so the caller only has to drop it onto the deck.
   *
   * Built from primitives rather than a generated mesh — see the long note
   * above HERO_BASE_LIFT_Y. The two properties that buys, and that a baked
   * model could not give: exact left/right symmetry by construction, and a
   * real wood/steel split (a baked model is repainted one flat colour).
   *
   * Ink outlines are on here, unlike the generated mechanism, which had to
   * go without: an outlined faceted mesh viewed nearly end-on turns into a
   * scribble of facet edges, but a box seen end-on is just four clean
   * corners, which is exactly the case the aim camera looks at.
   */
  function buildCrossbow(wood, steel, tag) {
    const group = new THREE.Group();
    group.name = 'crossbow';
    const add = (mesh, pal) => { group.add(tag(mesh, pal)); return mesh; };

    /* The rail. Runs from well ahead of the prod back past the catch, so the
       prod crosses a continuous beam rather than capping its end. */
    add(part(new THREE.BoxGeometry(0.17, 0.15, 2.6), wood, {
      pos: [0, 0, -0.15], outline: true
    }), 'wood');

    /* A stock block at the rear, giving the tail some weight so the engine
       doesn't taper away to nothing from behind — which is the angle the
       player spends the whole game looking from. */
    add(part(new THREE.BoxGeometry(0.26, 0.20, 0.5), wood, {
      pos: [0, -0.01, 0.9], outline: true
    }), 'wood');

    [1, -1].forEach((side) => {
      /* Walk the limb outward from the rail, accumulating each segment's
         direction so the pieces meet end to end instead of overlapping. */
      let x = 0;
      let z = PROD_Z;
      LIMB_SEGMENTS.forEach((seg) => {
        const dx = Math.cos(seg.angle);
        const dz = Math.sin(seg.angle);
        add(part(new THREE.BoxGeometry(seg.length, seg.thick, seg.thick), steel, {
          pos: [side * (x + dx * seg.length / 2), 0, z + dz * seg.length / 2],
          /* A box is symmetric about its own centre, so the mirrored limb can
             reuse the same angle negated rather than needing a flipped one. */
          rot: [0, -seg.angle * side, 0],
          outline: true
        }), 'steel');
        x += dx * seg.length;
        z += dz * seg.length;
      });

      /* Scale the reach to the span we actually want, whatever the segment
         lengths happened to sum to. */
      const tipX = side * LIMB_REACH;
      const tipZ = z;
      const last = LIMB_SEGMENTS[LIMB_SEGMENTS.length - 1];

      /* A steel spike at each tip — four blade points total counting the
         bend, the detail that reads as "siege weapon" in Bryan's reference. */
      add(part(new THREE.ConeGeometry(0.055, 0.2, 6), steel, {
        pos: [tipX, 0, tipZ],
        rot: [0, -last.angle * side, -Math.PI / 2 * side],
        outline: true
      }), 'steel');

      /* The drawn string, tip back to the catch. A thin box rather than a
         line so it survives the ink pass and reads at distance. */
      const sx = tipX - 0;
      const sz = tipZ - CATCH_Z;
      const len = Math.sqrt(sx * sx + sz * sz);
      add(part(new THREE.BoxGeometry(len, 0.035, 0.035), steel, {
        pos: [tipX / 2, 0, (tipZ + CATCH_Z) / 2],
        rot: [0, -Math.atan2(sz, sx), 0],
        outline: false
      }), 'steel');
    });

    const ammoMount=new THREE.Group();ammoMount.name='loaded-ammo';ammoMount.position.set(0,.16,-.45);group.add(ammoMount);

    /* The catch the string is hooked over. */
    add(part(new THREE.BoxGeometry(0.16, 0.13, 0.16), steel, {
      pos: [0, 0.06, CATCH_Z], outline: true
    }), 'steel');

    return group;
  }

  /**
   * The ballista itself: a paper-craft siege engine sitting at the world
   * origin, facing -Z (downrange — see data.js's coordinate-system note).
   * Uses the two generated hero pieces once both are baked (see
   * HERO_BALLISTA_PARTS): a static low wheeled base, and a single mechanism
   * mesh (arms + firing mechanism fused into one) that rotates with the
   * pivot for aim. Falls back to the original chunky-primitive body
   * otherwise. The shot pipeline needs to swing the mechanism to the solved
   * elevation and yaw, so the whole assembly is returned with named parts a
   * later step can rotate rather than being baked into one mesh.
   */
  function buildBallista(woodColor, steelColor) {
    const wood = paper(woodColor || 0xa9682f);
    const steel = paper(steelColor || 0x4a5160, PAL_OPTS.steel);

    /* Tag each part with the palette entry it was painted from, so
       repaint() can re-colour the whole engine on a theme change without
       rebuilding it and losing the pivot's current aim. */
    const tag = (mesh, pal) => { mesh.userData.pal = pal; return mesh; };

    const root = new THREE.Group();
    root.name = 'ballista';

    /* The pivot group: everything that actually points at the target lives
       under here, so aiming (step 4) only ever has to set this group's
       rotation rather than rebuild geometry. Sits at MUZZLE_Y so a shot
       leaving here matches what data.js assumes. */
    const pivot = new THREE.Group();
    pivot.name = 'pivot';
    pivot.position.set(0, RT.data.CFG.MUZZLE_Y, 0);
    root.add(pivot);

    if (HERO_BALLISTA_PARTS.every((n) => RT.models.geometry(n))) {
      const base = part(RT.models.geometry('ballista-base'), wood, { outline: true });
      base.position.y = HERO_BASE_LIFT_Y;
      /* The generated mesh's wheel axles land along world Z, so the wheels'
         flat hubcap faces pointed at the AIM camera instead of rolling
         front-to-back — caught from Bryan's own in-game screenshot, not
         this file's own review renders. A 90° yaw here is enough: it's the
         wheel axis that was wrong, not the whole chassis's footprint (which
         reads fine from either angle since the base is close to square in
         plan view). Confirmed against the real AIM camera pose, not assumed
         from the axle direction alone. */
      base.rotation.y = Math.PI / 2;
      root.add(tag(base, 'wood'));

      const crossbow = buildCrossbow(wood, steel, tag);
      crossbow.position.set(0, HERO_MECH_DRAW_Y, HERO_MECH_DRAW_Z);
      pivot.add(crossbow);
    } else {
      /* Base sled: a low, wide plank the whole engine sits on. */
      const base = part(new THREE.BoxGeometry(1.6, 0.32, 2.6), wood, {
        pos: [0, 0.16, 0], outline: true
      });
      root.add(tag(base, 'wood'));

      /* Two wheels, one either side, purely for silhouette — the engine
         never rolls. */
      [-0.95, 0.95].forEach((x) => {
        const wheel = part(new THREE.CylinderGeometry(0.55, 0.55, 0.22, 16), wood, {
          pos: [x, 0.55, 0.7], rot: [0, 0, Math.PI / 2], outline: true
        });
        root.add(tag(wheel, 'wood'));
      });

      /* A-frame uprights that carry the pivot. */
      [-0.55, 0.55].forEach((x) => {
        const upright = part(new THREE.BoxGeometry(0.26, 1.7, 0.3), wood, {
          pos: [x, 0.32 + 0.85, -0.1], outline: true
        });
        root.add(tag(upright, 'wood'));
      });

      const armPart = part(new THREE.BoxGeometry(0.24, 0.24, 3.0), steel, {
        pos: [0, 0, -0.4], outline: true
      });
      pivot.add(tag(armPart, 'steel'));

      /* Bow arms, splayed out from the front of the arm — pure silhouette,
         the two-curve shape that reads as "ballista" at a glance. */
      [-1, 1].forEach((side) => {
        const bow = part(new THREE.BoxGeometry(0.14, 0.14, 1.3), wood, {
          pos: [side * 0.55, 0, -1.7],
          rot: [0, side * 0.5, 0],
          outline: true
        });
        pivot.add(tag(bow, 'wood'));
      });
    }

    setShadow(root, true, false);

    let ammoMount=root.getObjectByName('loaded-ammo');if(!ammoMount){ammoMount=new THREE.Group();ammoMount.name='loaded-ammo';ammoMount.position.set(0,.16,-.45);pivot.add(ammoMount);}
    return { root: root, pivot: pivot,ammoMount };
  }

  /** The projectile. A plain sphere is enough to read clearly against the
   *  paper-craft blocks without needing per-ammo models yet. No ink outline —
   *  a fast-moving sphere doesn't get the same "judge this at a glance"
   *  treatment as a static obstacle, and EdgesGeometry on a sphere is
   *  effectively a full wireframe. */
  function buildBolt(radius, color) {
    const geo = new THREE.SphereGeometry(radius, 10, 8);
    return part(geo, paper(color === undefined ? 0x3a3226 : color, { roughness: 0.7 }), {
      cast: true, receive: false
    });
  }

  /**
   * A baked hero model (see js/models.js), painted and outlined exactly like
   * every procedural part above. Returns null when the name hasn't been
   * baked yet, so a caller can no-op rather than build a placeholder — same
   * "not approved yet" convention `RT.models.geometry()` itself documents.
   */
  function buildModel(name, color, pal) {
    const geo = RT.models.geometry(name);
    if (!geo) return null;
    const mesh = part(geo, paper(color), { outline: true });
    if (pal) mesh.userData.pal = pal;
    return mesh;
  }

  return {
    paperTexture, skyTexture,
    paper, glow, outline, ink, part, setShadow, buildModel,
    buildBlock, blockGeometry, buildBallista, buildBolt,
    setFlat, isFlatProfile, clearMatCache, setInk, repaint,
    cloudMaterial, cloud, hillBackdrop,
    INK
  };
})();
