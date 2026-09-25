/**
 * Benny's Ballista — game state and camera director.
 *
 * Runs the real six-phase camera director (ATTRACT / AIM / FLIGHT / IMPACT /
 * SETTLE / RESULTS, the impact-seat scorer, screen shake, Steady Camera —
 * work-order step 5) over real levels loaded from RT.levels (the stacked-
 * ASCII-layer format and optional full-campaign stability diagnostics).
 * js/ui.js drives the meters and input and calls into the fire()/traceShot()
 * API at the bottom of this file; everything about the world, the live castle
 * and the camera stays here.
 *
 * Also owns progress: stars, score, ammo unlocks, the results/out-of-bolts/
 * menu overlays (RESULTS_MENU / OUTOFBOLTS / MENU, three more CAM phases
 * alongside the camera director's own six), and the save file itself — one
 * combined object under RT.util's `rt-ballista` key, same shape as
 * FishMaster's save. Endless Bolts defaults on (the hub's no-fail default);
 * it, Steady Camera, Sound and minimap size are all reachable from the MENU
 * phase's Settings screen, which js/ui.js renders.
 *
 * Destruction audio is wired through this file into js/audio-safe.js — see the
 * "Audio" block below `disposeBlockMesh()` for the two helpers everything
 * routes through, and note that `auditing` is what keeps the one remaining
 * developer audit (auditLevels()) silent while it settles every castle.
 *
 * A former second boot audit, auditReach() ("every crown is destroyable by
 * some single sampled shot"), was removed — it only ever tested a single
 * shot per candidate, so a level whose intended solution is a sequence
 * (break the support, then hit the now-exposed crown) failed it despite
 * being perfectly playable, and its simulated tier had already proven
 * order-dependent in practice (see commit 2f1c6b9: passed in a warm test
 * session, failed on a genuine fresh boot). A crown never needed a clear
 * shot — it's an ordinary hp-bearing body, destroyable by direct hit,
 * collateral impact, or a fall — so that's now true by construction rather
 * than proved by sampling. Recoverable at 2f1c6b9:js/game.js:524-623 if a
 * future session wants to look at it. The one genuine authoring bug it ever
 * caught (a castle placed beyond an ammo's physical max range — see commit
 * 64b1aca) is now checked separately and deterministically by
 * js/data.js's ammoReachReport(), surfaced here via auditAmmoOffers()
 * (warn-only, never blocks a boot).
 *
 * Still outstanding: no way to open MENU mid-cinematic (see js/ui.js's
 * header).
 */
RT.game = (function () {
  'use strict';

  const U = RT.util;
  const A = RT.art;
  const W = RT.world;
  const D = RT.data;
  const LV = RT.levels;
  const P = RT.physics;
  const AU = RT.audio;
  const CFG = D.CFG;

  let scene, camera, renderer;
  let world = null;      // world.js handles (sky/ground/lights)
  let ballista = null;   // { root, pivot }
  let guardDecor = null;  // decorative storybook attendant beside the ballista
  let guardDecor2 = null; // second decorative guard, mirrored on the other side
  let physicsReady = false;
  let blocks = [];       // { mesh, body, mat, half:Vector3, hp, alive } — the live level's blocks
  let shots = [];        // live bolts: { mesh, ammo, trace, t, resolved }
  let levelWon = false;
  let levelIx = 0;
  // Valid from module load (level 0), same as TEST_LEVEL used to be — ui.js
  // computes yaw/range windows against currentLevel() before physics (and so
  // loadLevel()) has run at all, and needs something real to read.
  let liveLevel = LV.LEVELS[0];
  let boltsUsed = 0;    // this level, since loadLevel() — resets to 0 there
  let levelScore = 0;   // this level's points, folded into save.totalScore on a win
  let lastResult = null; // { stars, earned, bonus, newAmmo } for the results overlay
  let shotKeyKills = 0; // guards+tyrant killed by the CURRENT bolt (direct/splash/seam/linger) — reset in fire()

  /** Per-level ammo scarcity — id -> uses left, only for AMMO entries that
   *  carry a `limit`. Reset every loadLevel() (including a retry), never
   *  persisted, so scarcity is a per-attempt puzzle constraint, not a
   *  session-wide one. See D.AMMO's limit field. */
  let ammoLeft = {};
  const crateSupply={stone:4,fire:3,splitter:3,bomb:2};
  /* Deliberately iterates D.AMMO, not availableAmmo() — loadLevel() (below)
   * calls this BEFORE it assigns the new liveLevel, so an ammo-aware version
   * here would reset limits against the PREVIOUS level's offered set, not the
   * one about to load. Extra map entries for ammo the new level doesn't even
   * offer are inert — ammoRemaining() is never asked about an ammo the player
   * can't select. */
  function resetAmmoLeft(){ammoLeft={boulder:liveLevel.bolts||3};if(customLevel&&!liveLevel.layers.some(l=>l.some(r=>[...r].some(ch=>D.MAT[ch]?.pickup))))for(const id of liveLevel.ammo||D.AMMO.map(a=>a.id))if(id!=='boulder')ammoLeft[id]=crateSupply[id]||3;}
  function ammoRemaining(ammo){return save?.endlessBolts?Infinity:Math.max(0,ammoLeft[ammo.id]||0);}
  function shotsRemaining(){return save?.endlessBolts?Infinity:Object.values(ammoLeft).reduce((sum,n)=>sum+Math.max(0,n),0);}

  /* ── Save / progress ──────────────────────────────────────────────────────
   * One combined object (progress + the one setting that affects rules),
   * same shape as FishMaster's save — not the bare `bennysballista_*` keys
   * the 2D version used, since this game is RT-based now and RT.util's
   * load()/save() already namespace everything under one `rt-` prefix.
   */
  const SAVE_KEY = 'ballista';
  const SAVE_VERSION = 3;
  let save = null;
  let customAmmo=[],levelPickups=[],collectedGoals=new Set();
  function defaultSave() {
    return {
      version: SAVE_VERSION,
      level: 0,          // most recently played campaign checkpoint for the background scene
      stars: {},         // campaign level ID -> best stars earned (1-3)
      kingdoms: {},      // kingdom ID -> next level and highest number cleared
      totalScore: 0,
      endlessBolts: true, // recommended default, matches the hub's no-fail philosophy
      minimapSize: 'medium', // 'large' | 'medium' | 'none' — js/ui.js's Settings screen
      theme: 'storybook',      // 'ben' | 'dark' | 'light' | 'contrast' — the four colour profiles
      aimSounds: false, // optional proximity cues during manual aiming
      easyAim: false, // optional target selection even with Auto Scan off
      aimMode: 'easy',  // 'sweep' | 'target' — js/ui.js's Settings screen
      // null = follow the OS's prefers-reduced-motion; true/false = the player
      // overrode it in Settings. Kept tri-state rather than baking the OS value
      // in at first save, so someone who later turns reduced-motion on still
      // gets Steady Camera automatically unless they explicitly chose otherwise.
      steadyCamera: null
    };
  }
  function loadSave() {
    const raw = U.load(SAVE_KEY, null);
    save = (raw && [1,2,SAVE_VERSION].includes(raw.version)) ? Object.assign(defaultSave(), raw) : defaultSave();
    if(raw?.version===1){save.legacyStars=raw.stars||{};save.legacyScore=raw.totalScore||0;save.stars={};save.level=0;save.kingdoms={};}
    save.version=SAVE_VERSION;save.easyAim=save.easyAim===true;save.aimSounds=save.aimSounds===true;
    if(!save.stars||typeof save.stars!=='object'||Array.isArray(save.stars))save.stars={};
    if(!save.kingdoms||typeof save.kingdoms!=='object'||Array.isArray(save.kingdoms))save.kingdoms={};
    if(raw?.version===2){
      // Existing milestone IDs and scores stay valid. Resume immediately after
      // the last cleared old milestone; finished short campaigns resume at the
      // first added encounter, rather than silently skipping the expansion.
      const orders=RT.campaigns.legacyOrders;
      for(const k of RT.campaigns.kingdoms){
        const p=save.kingdoms[k.id];if(!p)continue;
        const old=Number.isInteger(p.next)?U.clamp(p.next,0,7):0;
        p.next=old===7?1:old?orders[old-1]+1:0;p.cleared=p.next;
      }
      if(Number.isInteger(save.level)&&save.level>=0&&save.level<21){
        const k=RT.campaigns.kingdoms[Math.floor(save.level/7)];
        save.level=k.levels[save.kingdoms[k.id]?.next??orders[save.level%7]];
      }
    }
    save.level=Number.isInteger(save.level)?U.clamp(save.level,0,LV.LEVELS.length-1):0;
  }
  /** Set while runBootAudits() is settling every level (auditLevels(), below)
   *  — that settling steps stepPhysicsWithImpacts(), which can legitimately
   *  kill a level's only crown via collateral/fall damage and trip
   *  checkWin()/finishLevel(), which would otherwise write bogus progress
   *  into the player's real save. runBootAudits() also snapshots/restores
   *  `save` itself around the whole audit, so this is defense in depth, not
   *  the only guard — see that function's own comment for why both halves
   *  are independently required. */
  let suppressSaveWrites = false;
  function persistSave() { if (!suppressSaveWrites) U.save(SAVE_KEY, save); }

  /** Auto-enabled under prefers-reduced-motion, same as FishMaster's
   *  reducedMotion() — unless the player explicitly overrode it from the
   *  menu's Settings screen (setSteadyCamera below). */
  const REDUCED_MOTION = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  /** Live value of the Steady Camera setting: the player's explicit choice
   *  if they made one in Settings, otherwise whatever the OS asks for. */
  function steadyCameraOn() {
    if (!save || save.steadyCamera == null) return REDUCED_MOTION;
    return !!save.steadyCamera;
  }

  /* ── Theming ──────────────────────────────────────────────────────────────
   * getComputedStyle is far too slow to call per frame, so the palette is
   * read once per theme change and served from a cache — same pattern
   * FishMaster uses (game.js:270-295 there). Anything added here MUST also
   * exist as a CSS custom property in index.html or it silently comes out
   * black (getPropertyValue returns '').
   */
  const PALETTE_VARS = [
    'sky1', 'sky2', 'sky3', 'sun', 'ground', 'hill', 'dirt', 'focus', 'ink',
    'wood', 'stone', 'glass', 'barrel', 'crown', 'steel', 'guard'
  ];
  let PAL = {};

  function refreshPalette() {
    const cs = getComputedStyle(document.body);
    PAL = {};
    for (const v of PALETTE_VARS) {
      PAL[v] = cs.getPropertyValue('--' + v).trim() || '#888';
    }
  }
  function css(name) { return PAL[name] || '#888'; }

  /** True for the High Contrast profile, which wants unlit flat geometry
   *  rather than the paper-craft shading. */
  function isFlat() { return document.body.dataset.theme === 'contrast'; }

  /** Push the two things art.js can't work out for itself — which material
   *  class this profile wants, and what colour the ink is. art.js never reads
   *  the DOM (same rule as world.js), so it has to be told. */
  function applyProfileToArt() {
    A.setInk(css('ink'));
    return A.setFlat(isFlat());     // true when the material class actually changed
  }

  /* ── Camera phases ────────────────────────────────────────────────────── */
  const CAM = {
    phase: 'ATTRACT',
    attractT: 0,
    impactPoint: new THREE.Vector3(),
    lookAt: new THREE.Vector3(),      // center of the current damage area
    seatPos: new THREE.Vector3(),
    impactT: 0,
    settleT: 0,
    resultsT: 0,
    shake: 0,
    // AIM-phase zoom (see updateAimZoom()) — eased 0..1, how far the camera
    // has dollied in from AIM_POS toward aimTarget right now. aimTarget is
    // wherever the live trace currently lands (updateAimPreview() below);
    // aimTracing is false only in the instant before a level's first trace
    // exists.
    aimZoom: 0,
    aimTarget: new THREE.Vector3(),
    aimTracing: false
  };

  /** The anchor pose AIM eases from/to: zoomed all the way out, this is what
   *  the player sees. Its look-at point re-centres on whatever castle is live
   *  (see loadLevel()) so a distant level doesn't leave the frame aimed short
   *  of it. Never moves on its own — all camera personality beyond the zoom
   *  (see updateAimZoom()) happens after Return is pressed. */
  const AIM_POS = new THREE.Vector3(0, 3.6, 7.5);
  const AIM_LOOKAT = new THREE.Vector3(0, 2.0, -20);

  /** The palette bundle world.js and art.js are handed. Built here in one
   *  place so build-time and theme-change-time can never drift apart. */
  function worldPalette() {
    return {
      sky1: css('sky1'), sky2: css('sky2'), sky3: css('sky3'),
      ground: css('ground'), hill: css('hill'), dirt: css('dirt'),
      wood: css('wood'), sunColor: css('sun'),
      flat: isFlat()
    };
  }

  function buildWorldAndBallista() {
    refreshPalette();
    applyProfileToArt();
    world = W.build(scene, worldPalette());
    ballista = A.buildBallista(css('wood'), css('steel'));
    ballista.pivot.rotation.order = 'YXZ';   // yaw about world-up first, then pitch — a turret, not a gimbal
    scene.add(ballista.root);

    /* Decorative only — no physics body, not in `blocks[]`, invisible to
       auditLevels(). Storybook attendants share the castle cast’s rounded art
       and stand beside each wheel with upright spears. */
    guardDecor = RT.castleArt.attendant(1);
    if (guardDecor) { guardDecor.position.set(1.5, 0, 0.6); scene.add(guardDecor); }
    guardDecor2 = RT.castleArt.attendant(-1);
    if (guardDecor2) { guardDecor2.position.set(-1.5, 0, 0.6); scene.add(guardDecor2); }

    buildAimPreview();
  }

  /* ── Aim preview: the arm, a dotted flight path, and a ground reticle ──────
   * "The dots never lie" (see traceShot()'s header) used to mean only the
   * narrated outcome; this is the same trace made visible in the view the
   * player is actually watching, not just the minimap (js/ui.js) or the
   * footer text. Built once and repositioned rather than rebuilt, since
   * updatePreview() in js/ui.js calls in fairly often while a meter moves.
   */
  const PREVIEW_DOTS = 10;
  let previewGroup = null, previewDots = [], previewRing = null, previewMat = null;

  /** The ring's own geometry lies flat in its local XY plane (normal along
   *  local +Z). Three fixed orientations cover the three faces a shot can
   *  land on — flush against the surface either way, not just tilted to
   *  "read okay from the aim camera": a wall's front face wants the same
   *  Z-facing default the ring already has, a roof/ground hit wants it
   *  tipped to face +Y (the one case this used to handle), and a side face
   *  (rare — a pillar's flank) wants it turned to face +X. Built once, not
   *  per frame. */
  const _RING_FLAT_Q  = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  const _RING_FRONT_Q = new THREE.Quaternion();
  const _RING_SIDE_Q  = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
  const _previewLocal = new THREE.Vector3();
  const _previewNormal = new THREE.Vector3();
  const _previewInvQuat = new THREE.Quaternion();

  function buildAimPreview() {
    /* depthTest:false alone isn't enough this far from the camera: this
     * game's near/far planes (see the camera director) span a wide enough
     * ratio that depth-buffer precision at ~25-30 units out is coarser than
     * the ring's few-centimetre stand-off from a block's surface, so the
     * block can still win the depth test and cover the ring — invisible
     * against the ground (a shallow, near-perpendicular offset) but glaring
     * against a wall (the offset runs straight along the view axis there,
     * exactly where precision is worst). depthWrite:false plus a high
     * renderOrder sidesteps the whole precision question: the ring/dots
     * never touch the depth buffer and always paint dead last, so nothing
     * drawn before them — at any distance, on any face — can cover them. */
    previewMat = new THREE.MeshBasicMaterial({ color: css('focus'), depthTest: false, depthWrite: false });
    previewGroup = new THREE.Group();
    previewGroup.visible = false;
    previewGroup.renderOrder = 999;

    const dotGeo = new THREE.SphereGeometry(0.08, 8, 6);
    for (let i = 0; i < PREVIEW_DOTS; i++) {
      const dot = new THREE.Mesh(dotGeo, previewMat);
      dot.castShadow = false;
      dot.renderOrder = 999;
      previewDots.push(dot);
      previewGroup.add(dot);
    }

    const ringGeo = new THREE.RingGeometry(0.32, 0.5, 24);
    previewRing = new THREE.Mesh(ringGeo, previewMat);
    previewRing.renderOrder = 999;
    previewRing.quaternion.copy(_RING_FLAT_Q);   // default: lying flat, as for a ground hit
    previewGroup.add(previewRing);

    scene.add(previewGroup);
  }

  /** Repaints the arm/dots/reticle to match one trace (the exact object
   *  js/ui.js's updatePreview() just computed via traceShot()), or hides
   *  everything when there's nothing to show. Also points the ballista's
   *  arm at the shot — cosmetic, but "the arm points where you're about to
   *  fire" is the single biggest legibility win available here for free,
   *  since traceShot() already solves the elevation this needs. */
  function setLoadedAmmo(ammo){if(!ballista?.ammoMount||!ammo)return;const mount=ballista.ammoMount;mount.visible=true;if(mount.userData.ammo===ammo.id)return;for(const old of [...mount.children]){mount.remove(old);disposeBlockMesh(old);}const model=RT.castleArt.projectile(ammo);model.rotation.y=Math.PI;const bolt=ammo.id==='stone'||ammo.id==='fire';model.scale.setScalar(bolt?.7:1);model.position.y=bolt?.02:ammo.r+.02;mount.add(model);mount.userData.ammo=ammo.id;}
  function updateAimPreview(trace) {
    if (!previewGroup) return;
    if (!trace || CAM.phase !== 'AIM') { previewGroup.visible = false; CAM.aimTracing = false; CAM.areaAiming = false; return; }
    previewGroup.visible = !CAM.targetScene;
    CAM.aimTracing = save.aimMode === "sweep";
    CAM.areaAiming = !CAM.aimTracing;

    setLoadedAmmo(trace.ammo);
    const pts = trace.points;
    for (let i = 0; i < PREVIEW_DOTS; i++) {
      const t = i / (PREVIEW_DOTS - 1);
      const idx = Math.min(pts.length - 1, Math.round(t * (pts.length - 1)));
      previewDots[i].position.copy(pts[idx]);
    }
    /* The ring used to sit flat on CFG.GROUND_Y no matter what — last.x/z (the
     * real impact column) were already right, but forcing ground height meant
     * a shot that actually stops on a wall/roof drew its reticle down at the
     * base of it instead, reading as if the shot had sailed straight through
     * to the ground behind the structure. last.y IS the real impact height
     * (findHitBlock() stops the trace within `r` of the block's own surface),
     * so use it directly — it already falls back to ground height on its own
     * for an unobstructed shot, since that's genuinely where those land.
     *
     * Orientation needs the same fix for the same reason: a ring lying flat
     * against a wall's vertical face reads as floating in front of it, not
     * resting on it. Which face got hit isn't reported by findHitBlock() (it
     * only returns the block), so it's re-derived here the same way that
     * function tests it — the axis with the least remaining margin inside
     * the block's (rotated) half-extents is the face the shot just crossed. */
    const last = pts[pts.length - 1];
    CAM.aimTarget.copy(last);
    const hitBlock = trace.hit.type === 'block' ? trace.hit.block : null;
    if (hitBlock) {
      _previewInvQuat.copy(hitBlock.mesh.quaternion).invert();
      _previewLocal.copy(last).sub(hitBlock.mesh.position).applyQuaternion(_previewInvQuat);
      const mx = hitBlock.half.x - Math.abs(_previewLocal.x);
      const mz = hitBlock.half.z - Math.abs(_previewLocal.z);
      const my = hitBlock.half.y - Math.abs(_previewLocal.y);
      let faceQuat, axis;
      if (mx <= mz && mx <= my)      { faceQuat = _RING_SIDE_Q;  axis = 'x'; }
      else if (mz <= my)             { faceQuat = _RING_FRONT_Q; axis = 'z'; }
      else                           { faceQuat = _RING_FLAT_Q;  axis = 'y'; }
      previewRing.quaternion.copy(hitBlock.mesh.quaternion).multiply(faceQuat);
      const sign = Math.sign(_previewLocal[axis]) || 1;
      _previewNormal.set(axis === 'x' ? sign : 0, axis === 'y' ? sign : 0, axis === 'z' ? sign : 0);
      _previewNormal.applyQuaternion(hitBlock.mesh.quaternion);
      previewRing.position.copy(last).addScaledVector(_previewNormal, 0.03);
    } else {
      previewRing.quaternion.copy(_RING_FLAT_Q);
      previewRing.position.set(last.x, last.y + 0.03, last.z);
    }

    if (ballista) {
      ballista.pivot.rotation.y = -trace.yaw;
      ballista.pivot.rotation.x = trace.elevation;
    }
  }

  /* ── Blocks ───────────────────────────────────────────────────────────────
   * Ties one Ammo body to one Three.js mesh — loadLevel() below is what
   * calls this once per parsed block spec from RT.levels.parseLevel().
   */
  /** `spec` is one js/levels.js parser block — {matId, x, y, z, w, h, d} plus
   *  the cell provenance (layer/row/col) the parser attaches. It's kept on
   *  the record so anything reporting a problem with a block can name the
   *  cell its author actually drew rather than a world-space coordinate. */
  function spawnBlock(spec) {
    const { matId, x, y, z, w, h, d } = spec;
    const mat = D.MAT[matId];
    const color = css(mat.css.replace('--', ''));
    const mesh = A.buildBlock(w, h, d, color, { glow: !!mat.crown, shape: mat.shape, matId });
    mesh.position.set(x, y, z);
    scene.add(mesh);

    const mass = mat.static ? 0 : w * h * d;   // mass ∝ volume, per the plan
    const body = P.addBlock(x, y, z, w, h, d, mass);

    const rec = {
      mesh: mesh, body: body, mat: mat, alive: true,
      half: new THREE.Vector3(w / 2, h / 2, d / 2),
      hp: mat.hp, spec: spec
    };
    blocks.push(rec);
    return rec;
  }

  /** Frees a mesh's own geometry and its ink-outline child's geometry.
   *  Materials are cached and shared (see art.js's paper()/glow()), so they
   *  outlive any one block and are never disposed here. */
  function disposeBlockMesh(mesh) {
    mesh.traverse((o) => {o.userData.charMaterial?.dispose();if (o.geometry) o.geometry.dispose(); });
  }

  /* ── Rubble ───────────────────────────────────────────────────────────────
   * A destroyed building block breaks into real physics debris rather than
   * blinking out. Most visible on a merged run: js/levels.js fuses a row of
   * the same letter into ONE wide body, so the full-width stone beam over a
   * gateway was a single block that vanished whole the moment its hp ran
   * out. There are no welds INSIDE a merged body to break at — the merge
   * happened at parse time — so the equivalent is to split it back along the
   * cell boundaries it was drawn on, which is what this does.
   *
   * Debris lives in its own array, NOT in `blocks`. Everything that reads
   * `blocks` means "the castle": auditLevels() settles it and fails on
   * anything destroyed, targetableBlocks() offers it to Select-Target aim,
   * destroyBlockRec() scores it. Rubble belongs in none of those — it must
   * not be aimable, must not pay points, and must never make a level's own
   * audit think the castle came apart. It is still a real Bullet body, so it
   * falls, piles up, and is shoved around by the collapse around it.
   */
  let debris = [];

  const _rubbleOff = new THREE.Vector3();
  // Physical rubble has its own stream: visual quality and mesh UUIDs cannot change its scatter.
  let debrisRandom=U.rng(1935).next;
  const jitter = (amount) => (debrisRandom() - 0.5) * 2 * amount;

  /** Breaks `b` into chunks at its CURRENT transform — call before its body
   *  and mesh are torn down, while there is still a velocity to inherit and
   *  a place to spawn from. Silent for anything without a `rubble` material
   *  (glass, kegs, crown, guards, rubble itself — see js/data.js's MAT). */
  function spawnDebris(b) {
    const rubbleId = b.mat.rubble;
    /* Developer audits settle all castles; they destroy nothing, but if a
       level ever did lose a piece there, spawning bodies mid-audit would
       make it cost more and leave rubble sitting in the world behind the
       next castle. Nothing watches the audit, so nothing needs to see it. */
    if (!rubbleId || auditing || debris.length >= CFG.DEBRIS_MAX) return;

    const mat = D.MAT[rubbleId];
    const color = css(mat.css.replace('--', ''));
    const motion = P.motion(b.body), vel=motion.v; // inherit both translation and rotation
    const structuralHits=new Map(); // one broken piece has a bounded collateral budget per target

    // One chunk per cell the dead block spanned. A plank is a fraction of a
    // cell tall, so round its thin axis up to one rather than down to none.
    const nx = Math.max(1, Math.round(b.half.x * 2));
    const ny = Math.max(1, Math.round(b.half.y * 2));
    const nz = Math.max(1, Math.round(b.half.z * 2));
    const spots = [];
    for (let ix = 0; ix < nx; ix++) {
      for (let iy = 0; iy < ny; iy++) {
        for (let iz = 0; iz < nz; iz++) {
          spots.push([
            -b.half.x + (ix + 0.5) * (b.half.x * 2 / nx),
            -b.half.y + (iy + 0.5) * (b.half.y * 2 / ny),
            -b.half.z + (iz + 0.5) * (b.half.z * 2 / nz)
          ]);
        }
      }
    }
    // A single cell would otherwise "break" into one chunk, which just reads
    // as the block shrinking.
    if (spots.length === 1) spots.push([0, 0, 0]);

    const count=Math.min(24,spots.length,CFG.DEBRIS_MAX-debris.length);
    for (let i=0;i<count;i++) {
      const [ox,oy,oz]=spots[Math.floor((i+.5)*spots.length/count)];
      if (debris.length >= CFG.DEBRIS_MAX) break;
      // Offsets are in the dead block's own frame — rotate them by however it
      // was lying at the moment it died, or a toppled beam sheds its rubble
      // along the axis it was originally drawn on.
      _rubbleOff.set(ox, oy, oz).applyQuaternion(b.mesh.quaternion).add(b.mesh.position);
      const wood=b.mat.family==='wood',variant=i%3;
      const dims=wood?[.32,.24,.65+variant*.12]:[.4+variant*.08,.36+variant*.06,.46];
      const mesh = A.buildBlock(...dims, color, {});
      mesh.quaternion.copy(b.mesh.quaternion);
      mesh.position.copy(_rubbleOff);
      scene.add(mesh);
      const body = P.addBlock(_rubbleOff.x, _rubbleOff.y, _rubbleOff.z, ...dims, dims[0]*dims[1]*dims[2]*(wood?1:2));
      const off=_rubbleOff.clone().sub(b.mesh.position),spin=new THREE.Vector3(motion.a.x,motion.a.y,motion.a.z),angular=spin.clone().cross(off);
      const scatter=CFG.DEBRIS_SCATTER*Math.min(1.5,1+(b._lastHitSpeed||0)/35);
      P.addVelocity(body,
        vel.x + angular.x + jitter(scatter),
        vel.y + angular.y + Math.abs(jitter(scatter)) * 0.5,
        vel.z + angular.z + jitter(scatter));
      P.setRotation(body,mesh.quaternion);
      P.setSpin(body,spin.x+jitter(5),spin.y+jitter(5),spin.z+jitter(5));
      debris.push({mesh,body,mat,half:new THREE.Vector3(...dims).multiplyScalar(.5),age:0,structuralHits,hitStructures:new Set(),previous:mesh.position.clone(),hitCharacters:new Set()});
    }
  }

  function clearDebris() {
    debrisRandom=U.rng(1935).next;
    for (const r of debris) {
      scene.remove(r.mesh);
      disposeBlockMesh(r.mesh);
      P.destroyBlock(r.body);
    }
    debris = [];
  }

  /* ── Audio ────────────────────────────────────────────────────────────────
   * Sound is never load-bearing: every call goes through these two helpers so
   * a missing or broken js/audio-safe.js can only ever cost noise, never gameplay.
   */

  /** Set while the boot audits run. They fire real test shots that genuinely
   *  destroy blocks and can win a level — none of which the player should
   *  hear, any more than the save file should record it. */
  let auditing = false;

  const _panV = new THREE.Vector3();
  /** Where a world point sits across the screen, -1 (hard left) to 1 (hard
   *  right), so an impact arrives in the ear it happened on. Points behind the
   *  camera project with a flipped sign, so those fall back to centre rather
   *  than being confidently wrong. */
  function panFor(pos) {
    if (!camera || !pos) return 0;
    _panV.copy(pos).project(camera);
    if (!isFinite(_panV.x) || _panV.z > 1) return 0;
    return U.clamp(_panV.x, -1, 1);
  }

  function sfx(fn, a, b, c) {
    if (auditing || !AU) return;
    try { AU[fn](a, b, c); } catch (e) { /* audio is never load-bearing */ }
  }

  /** Points for a kill are 500 for a crown, 350 for a guard, 100 for anything
   *  else — ported from the 2D version's damageBlock() (crown/other split),
   *  folded in here since every kill (a direct hit via applyHit(), or
   *  collateral via stepPhysicsWithImpacts()) already funnels through this
   *  one function. Destruction audio funnels through here for the same
   *  reason: a crown toppled by collateral collapse has to sound exactly as
   *  final as one shot off its perch.
   *
   *  Guards and the crown ("key targets") also add an efficiency bonus here,
   *  immediately on kill — bigger the earlier boltsUsed is, so killing one
   *  on an early bolt actually pays out more than limping to the same kill
   *  late. This is separate from (and stacks with) the flat per-kill value
   *  above and the existing unused-bolts bonus in finishLevel() — that one
   *  only ever looks at the FINAL total, not when a key target actually died.
   *  shotKeyKills also increments here, driving the combo bonus a few lines
   *  down — a kill counts toward it regardless of whether it came from the
   *  direct hit, a seam/linger neighbour, or a collateral chain the same
   *  shot set off, since destroyBlockRec() is the one place all of those
   *  paths already meet. Reset to 0 in fire() at the start of each shot. */
  function destroyBlockRec(b) {
    if (!b.alive) return;
    if(b.mat.protected && liveLevel.objective==='rescue'){rescueFailed=true;levelWon=false;lastResult=null;sfx('stopFlight');return;}
    if(b.mat.pickup)collectAmmo(b);
    b.alive = false;
    if (!auditing && RT.effects) {RT.effects.burst(b.mesh.position, b.mat, true, steadyCameraOn());if(b.mat.rubble&&!b.mat.pickup)RT.effects.fracture(b,steadyCameraOn());}
    if (b.mat.crown || b.mat.guard) {
      levelScore += b.mat.crown ? 500 : 350;
      levelScore += Math.max(0, CFG.KEY_BUDGET - boltsUsed) * CFG.KEY_BONUS_PER_BOLT;
      shotKeyKills++;
      /* Combo bonus, paid incrementally as each extra key kill in this same
         shot happens (rather than computed once at the end): the tyrant
         itself can be the kill that ends the level, and finishLevel() reads
         levelScore synchronously the instant checkWin() sees it die — so
         this has to already be folded in by then, not added later once the
         whole shot/collapse finishes. Total payout across a shot is the same
         either way; paying it here just means it can never miss a win. */
      if (shotKeyKills > 1) levelScore += CFG.COMBO_BONUS_PER_KILL;
    } else {
      levelScore += 100;
    }
    sfx('destroy', b.mat, b._lastHitSpeed || 24, panFor(b.mesh.position));
    /* A powder keg's own death is an explosion, wired through the same
       applySplash() the Powder Bomb ammo uses. Runs before the mesh/body
       teardown below so impactPos still has somewhere to read a position
       from; a keg's blast can chain into a neighbouring keg (applySplash
       excludes only the primary block, so a second keg dies and calls back
       in here), which is the chain-reaction spectacle, not a bug. */
    if (b.mat.explodes){if(!auditing){RT.castleLife.ignite(b.mesh.position,(D.KEG_BLAST.splashRadius||3.2)+.6);RT.effects?.explosion(b.mesh.position,steadyCameraOn());}applySplash(D.KEG_BLAST,b.mesh.position,b);}
    wakeBlocksAbove(b);
    /* Before the teardown below: the chunks are placed from this block's
       live transform and inherit its velocity, both of which are gone once
       the body is destroyed. */
    spawnDebris(b);
    scene.remove(b.mesh);
    disposeBlockMesh(b.mesh);
    P.destroyBlock(b.body);
  }

  const _wakeBox = new THREE.Box3(), _wakeOtherBox = new THREE.Box3();
  /** See physics.js's wake() for why this exists at all: removing a body
   *  from the world wakes nothing resting on it, so without this, anything
   *  asleep on top of a block that just died would float in place forever
   *  with nothing underneath it. Same geometric "resting directly on top
   *  of" test as applyCrush() below, just to wake rather than to damage —
   *  real gravity, not this function, decides whether it actually falls.
   *  Own scratch Box3s, not shared with applyCrush()'s, since this runs from
   *  inside destroyBlockRec() and applyCrush() can itself call
   *  destroyBlockRec() (a crushed block dying) while its own scratch boxes
   *  are still in use partway through its loop. */
  function wakeBlocksAbove(b) {
    _wakeBox.setFromObject(b.mesh);
    for (const other of blocks) {
      if (!other.alive || other === b || other.mat.static) continue;
      _wakeOtherBox.setFromObject(other.mesh);
      const xzOverlap = _wakeBox.max.x > _wakeOtherBox.min.x && _wakeBox.min.x < _wakeOtherBox.max.x &&
                         _wakeBox.max.z > _wakeOtherBox.min.z && _wakeBox.min.z < _wakeOtherBox.max.z;
      if (!xzOverlap) continue;
      const gap = _wakeOtherBox.min.y - _wakeBox.max.y;
      if (gap < -0.05 || gap > 0.1) continue;   // resting ON b, not through or beside it
      P.wake(other.body);
    }
  }

  /**
   * Tears down every block of whatever level is currently live. Loading a
   * new level (or replaying this one) always goes through here first —
   * this has to remove each mesh from the scene and dispose its geometry
   * itself, the same as destroyBlockRec() above, or every level swap leaks
   * one level's worth of draw calls forever (caught by RT.perf() climbing
   * well past its budget after cycling through a handful of levels).
   */
  function clearBlocks() {
    setExploring(false);RT.castleLife?.clear();
    for (const b of blocks) {
      if (!b.alive) continue;
      scene.remove(b.mesh);
      disposeBlockMesh(b.mesh);
      P.destroyBlock(b.body);
    }
    blocks = [];
    clearDebris();
  }

  /**
   * Loads level `ix` from RT.levels.LEVELS: tears down whatever castle is
   * live, parses the new one's stacked ASCII layers, and spawns every
   * resulting block spec. The parser (js/levels.js) already did the row/
   * depth merge and the world-unit placement math — this is just the
   * spawn loop, identical in shape to the old hand-built test castle it
   * replaces.
   */
  let customLevel = null, rescueFailed = false;
  function loadLevel(ix, custom) {
    viewZoom=1;overview=false;viewIntroduced=false;manualOrbit=false;applyViewZoom(1);
    damageBounds=null;damageSnapshots.clear();damageTargets.clear();
    customLevel = custom || null;rescueFailed=false;levelPickups=[];collectedGoals.clear();
    clearBlocks();
    if (RT.effects) RT.effects.clear();
    for (const s of shots) scene.remove(s.mesh);
    shots = [];
    levelWon = false;
    boltsUsed = 0;
    levelScore = 0;
    lastResult = null;

    levelIx = ((ix % LV.LEVELS.length) + LV.LEVELS.length) % LV.LEVELS.length;
    liveLevel = customLevel || LV.LEVELS[levelIx];
    resetAmmoLeft();if(!auditing)setLoadedAmmo(D.AMMO.find(a=>a.id==='boulder'));
    const parsed = LV.parseLevel(liveLevel);
    for (const b of parsed.blocks) spawnBlock(b);
    /* Bond touching boards into one assembly — spawnBlock() appends in the
       order it's called, so a weldPairs() index IS the blocks[] index. Every
       body has to exist before any weld references it, hence a second pass
       rather than welding inside the loop above. How strong each bond is —
       and which ones can break at all — is LV.weldBreak()'s call, shared
       with the editor's stability test so the two can't disagree. */
    for (const [i, j, axis] of LV.weldPairs(parsed.blocks)) {
      P.addWeld(blocks[i].body, blocks[j].body, LV.weldBreak(parsed.blocks[i], parsed.blocks[j], axis));
    }

    if (RT.castleArt && !auditing) RT.castleArt.dress(blocks, levelIx);
    if(!auditing)RT.castleLife.init(scene,blocks,liveLevel,(b,damage)=>{b.hp-=damage;if(b.hp<=0)destroyBlockRec(b);});
    aimFrameBlocks=parsed.blocks;refreshAimFrame(true);
    if (world) { W.recenterShadow(world, liveLevel.dist); if(!auditing) W.setLevel(world,liveLevel,worldPalette()); }
  }

  /* Full-campaign diagnostics. These simulate every castle and belong in
   * development checks, never in the normal player startup path. Launch
   * index.html?audit=levels to run them using the real game physics. */

  /** Every castle stands unaided: build it, step ~4 simulated seconds, and
   *  check no crown drifted and nothing is still awake. Reuses loadLevel()
   *  itself, so this is exercising the exact path the player's first look
   *  at each level goes through, not a parallel code path. */
  function auditLevels() {
    const wasAuditing = auditing;
    auditing = true;              // diagnostics should not play destruction sounds
    try {
      auditLevelsInner();
    } finally {
      auditing = wasAuditing;
    }
  }

  /** Describes a block the way a level author drew it — the cell provenance
   *  js/levels.js's parser attaches to every spec — since "the board at layer
   *  2, row 5, col 6" is something you can go and look at, and a world-space
   *  Y is not. */
  function whereBlock(b) {
    const s = b.spec;
    if (!s) return b.mat.id;
    return `${b.mat.name} at layer ${s.layer + 1}, row ${s.row + 1}, col ${s.col + 1}`;
  }

  function auditLevelsInner() {
    for (let ix = 0; ix < LV.LEVELS.length; ix++) {
      loadLevel(ix);
      const name = LV.LEVELS[ix].name;
      /* Same shared verdict the editor's stability button computes — see
         RT.settle.standingReport() for why asking "did anything move or die"
         beats asking "is it quiet yet", and for what shipped while the two
         callers were each asking their own narrower question. */
      const report = RT.settle.standingReport(blocks, undefined, {
        onImpact: (b, drop) => { sfx('impact', b.mat, drop, panFor(b.mesh.position)); },
        onDestroy: destroyBlockRec
      });
      checkWin();
      if (report.crownsLost.length) {
        throw new Error(`auditLevels: "${name}" lost a crown just from standing (${whereBlock(report.crownsLost[0])})`);
      }
      if (report.destroyed.length) {
        throw new Error(`auditLevels: "${name}" destroyed ${report.destroyed.length} piece(s) just from standing — first: ${whereBlock(report.destroyed[0])}. It doesn't stand on its own.`);
      }
      if (report.moved.length) {
        const w = report.worst;
        throw new Error(`auditLevels: "${name}" shifted ${report.moved.length} piece(s) while settling — worst: ${whereBlock(w.rec)} moved ${w.dist.toFixed(3)} units (limit ${RT.settle.STILL_EPS}). It doesn't stand on its own.`);
      }
      if (report.awake.length) {
        throw new Error(`auditLevels: "${name}" never settled to sleep within ${report.steps} steps (${report.awake.length} still awake, e.g. ${whereBlock(report.awake[0])})`);
      }
    }
  }

  /** Pure-data level sanity check — no physics, in the spirit of FishMaster's
   *  auditMissions(). THROWS: an `ammo` field that isn't a real array of real
   *  js/data.js AMMO ids is malformed, save-independent data with no tuning
   *  to get wrong — exactly the silent-typo class this codebase keeps getting
   *  bitten by (see js/data.js's MAT.css note, and the PALETTE_VARS comment
   *  above). A level with no `ammo` field is untouched by this — that's the
   *  common case and there's nothing to check. */
  function auditLevelData() {
    const ids = D.AMMO.map((a) => a.id);
    for (const lvl of LV.LEVELS) {
      if (lvl.ammo === undefined || lvl.ammo === null) continue;
      if (!Array.isArray(lvl.ammo)) {
        throw new Error(`auditLevelData: "${lvl.name}" has an ammo field that is not an array`);
      }
      if (!lvl.ammo.length) {
        throw new Error(`auditLevelData: "${lvl.name}" has an empty ammo array — omit the field entirely for "no restriction"`);
      }
      const seen = new Set();
      for (const id of lvl.ammo) {
        if (ids.indexOf(id) === -1) {
          throw new Error(`auditLevelData: "${lvl.name}" lists unknown ammo id "${id}" — every entry must match an id in data.js's AMMO (${ids.join(', ')})`);
        }
        if (seen.has(id)) throw new Error(`auditLevelData: "${lvl.name}" lists ammo id "${id}" more than once`);
        seen.add(id);
      }
    }
  }

  /** Boot-time ammo-offer sanity: pure arithmetic (js/data.js's
   *  ammoReachReport()), WARN ONLY, never throws — deliberately, since the
   *  whole point of removing auditReach() was that a check must not block
   *  creative level design, and an offered set can be narrowed by SAVE STATE
   *  (see availableAmmoAt() below), so a throwing version here would
   *  reintroduce exactly the save-dependent boot flakiness commit 2f1c6b9
   *  fixed the hard way. Prints nothing at all when every level is fine, so a
   *  clean boot stays a clean console — ammoReachReport()'s `notes` (e.g.
   *  "Powder Bomb can't reach this level's full meter range", true on every
   *  shipped level today) are deliberately never printed here, only
   *  returned, or every boot would emit noise nobody asked for. */
  function auditAmmoOffers() {
    const reports = [];
    for (let ix = 0; ix < LV.LEVELS.length; ix++) {
      const report = D.ammoReachReport(LV.LEVELS[ix], availableAmmoAt(ix));
      for (const p of report.problems) console.error('auditAmmoOffers: "' + report.name + '" — ' + p);
      for (const w of report.warnings) console.warn('auditAmmoOffers: "' + report.name + '" — ' + w);
      reports.push(report);
    }
    return reports;
  }

  /** Runs the optional developer audit (auditLevels() leaves the last level it built live
   *  in the scene) and, once it passes, resumes at the furthest level the
   *  save file has reached. A failure throws synchronously to the caller —
   *  see loadAttract() for how that gets surfaced instead of just hanging
   *  silently.
   *
   *  The save snapshot/suppressSaveWrites guard below is NOT a leftover from
   *  the removed auditReach() (which used to fire real test shots) — it is
   *  independently required by auditLevelsInner() itself: that audit steps
   *  stepPhysicsWithImpacts(), which can kill a crown while merely settling
   *  (its own first assertion, above) via destroyBlockRec() -> checkWin() ->
   *  finishLevel(), which mutates `save` (stars/level/totalScore) and calls
   *  persistSave(). Suppressing the write alone is not enough either:
   *  finishLevel() mutates the live `save` object BEFORE persisting, so a
   *  suppressed write still leaves a corrupted in-memory save that the very
   *  next legitimate persistSave() (a theme change, the player's next real
   *  win) would faithfully write out. Both halves — the snapshot/restore AND
   *  suppressSaveWrites — are load-bearing on their own. Do not remove either
   *  just because auditReach() is gone. */
  function runBootAudits() {
    auditLevelData();
    const saveSnapshot = JSON.parse(JSON.stringify(save));
    suppressSaveWrites = true;
    try {
      auditLevels();
    } finally {
      suppressSaveWrites = false;
      save = saveSnapshot;
    }
    loadLevel(save.level);
    auditAmmoOffers();
  }

  /* ── Shot pipeline ──────────────────────────────────────────────────────
   * Bolts are hand-integrated (constant gravity, straight-line steps), never
   * Ammo bodies — see the plan's "Projectile" section. That means the whole
   * flight is deterministic given the launch state, so it's computed once,
   * in full, at fire time (traceShot()) rather than stepped incrementally;
   * updateShots() just plays that precomputed path back over time and
   * resolves the hit when playback reaches the end. The live shot and the
   * aim-time preview call the exact same traceShot() — "the dots never
   * lie" because there is only one function that can lie.
   */

  /** Oriented-box hit test against a block's *rendered* transform (not the
   *  raw Ammo body) — so a hit always matches what's on screen, including a
   *  block that's already toppling from an earlier hit this shot. */
  const _hitLocal = new THREE.Vector3();
  const _hitInvQuat = new THREE.Quaternion();
  function findHitBlock(point, r) {
    for (const b of blocks) {
      if (!b.alive) continue;
      _hitInvQuat.copy(b.mesh.quaternion).invert();
      _hitLocal.copy(point).sub(b.mesh.position).applyQuaternion(_hitInvQuat);
      if (Math.abs(_hitLocal.x) < b.half.x + r &&
          Math.abs(_hitLocal.y) < b.half.y + r &&
          Math.abs(_hitLocal.z) < b.half.z + r) {
        return b;
      }
    }
    return null;
  }

  const _normLocal = new THREE.Vector3(), _normInvQuat = new THREE.Quaternion(), _normOut = new THREE.Vector3();
  /** World-space outward normal of whichever face of `b` is nearest `point` —
   *  the same least-margin-axis test findHitBlock() (above) and the aim
   *  reticle (updateAimPreview()) already use to find/orient a hit, re-derived
   *  here for the one thing neither of those needed before: a direction to
   *  deflect a lingering bolt off of (see startLinger()/stepLinger() below).
   *  Returns a shared scratch vector — clone it to keep it past the call. */
  function hitNormal(b, point) {
    _normInvQuat.copy(b.mesh.quaternion).invert();
    _normLocal.copy(point).sub(b.mesh.position).applyQuaternion(_normInvQuat);
    const mx = b.half.x - Math.abs(_normLocal.x);
    const mz = b.half.z - Math.abs(_normLocal.z);
    const my = b.half.y - Math.abs(_normLocal.y);
    let axis;
    if (mx <= mz && mx <= my) axis = 'x';
    else if (mz <= my) axis = 'z';
    else axis = 'y';
    const sign = Math.sign(_normLocal[axis]) || 1;
    _normOut.set(axis === 'x' ? sign : 0, axis === 'y' ? sign : 0, axis === 'z' ? sign : 0);
    _normOut.applyQuaternion(b.mesh.quaternion);
    return _normOut;
  }

  const OUT_OF_BOUNDS_Z_FAR = -80, OUT_OF_BOUNDS_Z_NEAR = 20, OUT_OF_BOUNDS_X = 60;

  /**
   * Full deterministic flight for one shot, from muzzle to first contact
   * (or the ground, or flying off the field). Pure — spawns nothing, does
   * no damage. `level` defaults to whatever level is actually live, so
   * preview calls from js/ui.js don't need to track that themselves.
   */
  function traceShot(ammo, yawRad, rangePct, level, elevation) {
    if(Number.isFinite(elevation)){const vh=ammo.speed*Math.cos(elevation);return traceFlight(ammo,new THREE.Vector3(0,CFG.MUZZLE_Y,0),new THREE.Vector3(vh*Math.sin(yawRad),ammo.speed*Math.sin(elevation),-vh*Math.cos(yawRad)),yawRad,elevation);}
    const launch = D.launchFor(ammo, level || liveLevel, yawRad, rangePct);
    if (!launch) return null;

    return traceFlight(ammo, new THREE.Vector3(launch.pos.x, launch.pos.y, launch.pos.z), new THREE.Vector3(launch.vel.x, launch.vel.y, launch.vel.z), yawRad, launch.elevation);
  }

  function traceFlight(ammo, pos, vel, yawRad, elevation) {
    const dt = CFG.DT;
    const points = [pos.clone()];
    let hit = { type: 'none' };

    const maxSteps = Math.ceil(6 / dt);
    for (let i = 0; i < maxSteps; i++) {
      vel.y -= CFG.GRAVITY * dt;
      pos.addScaledVector(vel, dt);
      points.push(pos.clone());

      const b = findHitBlock(pos, ammo.r);
      if (b) { hit = { type: 'block', block: b }; break; }
      if (pos.y <= CFG.GROUND_Y + (ammo.id==='boulder'?ammo.r:0.02)) { if(ammo.id==='boulder'){pos.y=CFG.GROUND_Y+ammo.r;points[points.length-1].copy(pos);}hit = { type: 'ground' }; break; }
      if (Math.abs(pos.x) > OUT_OF_BOUNDS_X || pos.z < OUT_OF_BOUNDS_Z_FAR || pos.z > OUT_OF_BOUNDS_Z_NEAR) break;
    }
    return {
      points: points, hit: hit, ammo: ammo, impactVel: vel.clone(),
      yaw: yawRad, elevation: elevation   // for the aim-preview arm/reticle, see updateAimPreview()
    };
  }

  /** Fires for real: traces the shot, spawns the bolt mesh, and queues it
   *  for updateShots() to play back and resolve. Returns the trace (same
   *  shape the preview uses) so ui.js can narrate the outcome immediately —
   *  the outcome is already fully determined, only the *watching* of it
   *  takes time. Returns null (and spends nothing) if this ammo is out for
   *  the level — js/ui.js already refuses to lock a depleted ammo in at
   *  commit time, so this is a backstop, not the primary gate. */
  function fire(ammo, yawRad, rangePct, elevation) {
    applyViewZoom(1);
    RT.castleLife?.stop();CAM.targetScene=null;CAM.chargeAiming=false;
    if (!availableAmmo().some(a=>a.id===ammo.id) || ammoRemaining(ammo) <= 0) return null;
    const trace = traceShot(ammo, yawRad, rangePct, undefined, elevation);
    if (!trace) return null;
    damageBounds=null;damageTargets.clear();damageSnapshots=new Map(blocks.filter(b=>b.alive).map(b=>[b,{hp:b.hp,position:b.mesh.position.clone()}]));
    boltsUsed++;
    shotKeyKills = 0;
    if(!save.endlessBolts)ammoLeft[ammo.id]=ammoRemaining(ammo)-1;
    const mesh = RT.castleArt ? RT.castleArt.projectile(ammo) : A.buildBolt(ammo.r);
    mesh.position.copy(trace.points[0]);
    scene.add(mesh);
    shots.push({ mesh: mesh, trace: trace, t: 0, resolved: false, splitIndex: ammo.id === "splitter" ? Math.max(1, Math.floor((trace.points.length - 1) * .4)) : null });
    if(ballista?.ammoMount)ballista.ammoMount.visible=false;
    sfx('fireShot', ammo);
    sfx('startFlight');
    CAM.phase = 'FLIGHT';
    return trace;
  }

  // Large merged walls should topple, not launch as fast as a single loose brick.
  function impactMobility(b){const s=b.spec;return 1/Math.sqrt(Math.max(1,s?s.w*s.h*s.d:8*b.half.x*b.half.y*b.half.z));}

  function applyHit(b, ammo, impactVel, impactPos) {
    if (!b.alive) return;
    
    if(impactPos&&!auditing){RT.castleLife.react(impactPos);RT.effects?.strike(impactPos,ammo.id,steadyCameraOn());if(ammo.id==='fire'){RT.castleLife.ignite(impactPos);sfx('ignite');}if(ammo.id==='bomb')sfx('explosion');}
    const dmg = D.damageFor(ammo, b.mat);
    const speed = impactVel ? impactVel.length() : 24;
    b._lastHitSpeed = speed;
    /* The hit itself. If this kills the block, destroyBlockRec() adds the
       heavier kill layer on top a few lines down. */
    if(ammo.id!=='boulder')sfx('impact', b.mat, speed, panFor(impactPos || b.mesh.position));
    b.hp -= dmg;
    if (!auditing && RT.effects) RT.effects.burst(impactPos || b.mesh.position, b.mat, false, steadyCameraOn());
    if (RT.castleArt && b.hp > 0 && b.hp < b.mat.hp) RT.castleArt.damage(b.mesh,1-b.hp/b.mat.hp,b.mat,b.spec);
    if (!b.mat.static) {
      const knock=CFG.KNOCK_SCALE*impactMobility(b)*(ammo.id==='fire'?.1:1);
      P.addVelocity(b.body, impactVel.x * knock, impactVel.y * knock, impactVel.z * knock);
    }
    if (b.hp <= 0) destroyBlockRec(b);
    if (impactPos && ammo.id!=='fire') applySeamHit(ammo, impactPos, b);
    if (ammo.splash && impactPos) applySplash(ammo, impactPos, b);
    checkWin();
  }

  const _splashDir = new THREE.Vector3();
  /** Area damage around a splash ammo's direct hit — everything alive within
   *  `splashRadius` of the impact (the primary block excluded, it already
   *  took a full direct hit above) takes falloff-scaled damage and a knock
   *  away from the blast centre. Distance is measured to each block's centre
   *  rather than a real explosion-vs-box overlap test, which is plenty for
   *  a block grid this coarse. */
  function applySplash(ammo, impactPos, primaryBlock) {
    const radius = ammo.splashRadius || 0;
    if (radius <= 0) return;
    for (const other of blocks) {
      if (!other.alive || other === primaryBlock) continue;
      const local=impactPos.clone().sub(other.mesh.position).applyQuaternion(other.mesh.quaternion.clone().invert());
      const dist=Math.hypot(Math.max(0,Math.abs(local.x)-other.half.x),Math.max(0,Math.abs(local.y)-other.half.y),Math.max(0,Math.abs(local.z)-other.half.z));
      if (dist > radius) continue;
      const falloff = 1 - dist / radius;
      /* Blast-driven hits are quieter than a direct strike and there can be a
         lot of them at once, so they lean on audio-safe.js's voice cap to fold the
         tail of the ring into one rumble rather than a burst of clicks. */
      other._lastHitSpeed = ammo.speed * falloff;
      sfx('impact', other.mat, ammo.speed * falloff, panFor(other.mesh.position));
      other.hp -= D.damageFor(ammo, other.mat) * (ammo.splashDmgScale || 1) * falloff;
      if (!other.mat.static) {
        _splashDir.subVectors(other.mesh.position, impactPos).normalize();
        const kick = ammo.speed * CFG.KNOCK_SCALE * falloff * impactMobility(other);
        P.addVelocity(other.body, _splashDir.x * kick, _splashDir.y * kick + kick * 0.4, _splashDir.z * kick);
      }
      if (other.hp <= 0) destroyBlockRec(other);
    }
  }

  const _seamDir = new THREE.Vector3();
  const _seamLocal = new THREE.Vector3(), _seamInvQuat = new THREE.Quaternion();
  /** Every direct/linger hit also nicks whatever else the bolt is physically
   *  touching right at the impact point — independent of (and much tighter
   *  than) any ammo's own splashRadius, so a shot landing where two parts
   *  meet, or a guard standing flush against a wall, can take out both with
   *  one bolt instead of only whichever one findHitBlock() happened to pick.
   *  Shares applySplash()'s falloff/knockback shape on purpose (same recipe),
   *  just a much tighter radius and much less falloff: this represents the
   *  same solid bolt actually overlapping the neighbour, not a shockwave
   *  reaching it, so it stays close to full damage across its whole radius.
   *
   *  Distance is to the block's own (rotated) SURFACE, not its centre — same
   *  local-space test findHitBlock() uses, extended to a real distance rather
   *  than a boolean contains-point. applySplash()'s centre-to-centre distance
   *  is fine at its large blast radius, but a wide merged wall's centre can
   *  sit cells away from the edge actually touching the primary block, which
   *  would make this radius (deliberately much tighter) never register a
   *  seam at all — confirmed empirically: a guard standing directly against
   *  a 4-cell merged wall run took no seam damage until this was fixed. */
  function applySeamHit(ammo, impactPos, primaryBlock) {
    const radius = CFG.SEAM_RADIUS;
    for (const other of blocks) {
      if (!other.alive || other === primaryBlock) continue;
      _seamInvQuat.copy(other.mesh.quaternion).invert();
      _seamLocal.copy(impactPos).sub(other.mesh.position).applyQuaternion(_seamInvQuat);
      const dx = Math.max(0, Math.abs(_seamLocal.x) - other.half.x);
      const dy = Math.max(0, Math.abs(_seamLocal.y) - other.half.y);
      const dz = Math.max(0, Math.abs(_seamLocal.z) - other.half.z);
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist > radius) continue;
      const falloff = 1 - (dist / radius) * 0.3;
      other._lastHitSpeed = ammo.speed * falloff;
      sfx('impact', other.mat, ammo.speed * falloff, panFor(other.mesh.position));
      other.hp -= D.damageFor(ammo, other.mat) * CFG.SEAM_DMG_SCALE * falloff;
      if (!other.mat.static) {
        _seamDir.subVectors(other.mesh.position, impactPos).normalize();
        const kick = ammo.speed * CFG.KNOCK_SCALE * falloff * impactMobility(other);
        P.addVelocity(other.body, _seamDir.x * kick, _seamDir.y * kick + kick * 0.4, _seamDir.z * kick);
      }
      if (other.hp <= 0) destroyBlockRec(other);
    }
  }

  function checkWin() {
    if (levelWon || rescueFailed || RT.castleLife?.active()) return;
    if(liveLevel.objective==='rescue' && (blocks.some(b=>b.alive&&b.mat.prison)||shots.some(s=>!s.resolved)||blocks.some(b=>b.alive&&!b.mat.static&&P.isAwake(b.body)&&!RT.castleLife.patrolling(b))))return;
    if (!remainingGoals()) {
      levelWon = true;
      finishLevel();
      if(liveLevel.objective==='rescue'&&CAM.phase==='AIM')CAM.phase='RESULTS_MENU';
    }
  }

  /** Stars/score/unlock, computed once the instant the last crown dies —
   *  not deferred to whenever the results overlay happens to open, so nothing
   *  is lost if that transition is ever interrupted. Formula ported from the
   *  2D version's levelComplete(). */
  function finishLevel() {
    const par = liveLevel.par;
    const stars = boltsUsed <= par ? 3 : (boltsUsed <= par + 2 ? 2 : 1);
    const bonus = save.endlessBolts ? 0 : shotsRemaining() * 150;
    const earned = levelScore + bonus;

    if (customLevel) { lastResult = { stars, earned, bonus, newAmmo: null, pickups:levelPickups.slice() }; return; }
    
    const prevStars = save.stars[liveLevel.id] || 0;
    if (stars > prevStars) save.stars[liveLevel.id] = stars;
    const kingdom=RT.campaigns.forLevel(liveLevel),progress=kingdomProgress(kingdom.id);
    // Replaying a cleared castle cannot move a later checkpoint backwards.
    const next=Math.max(progress.next,liveLevel.order+1);
    const results={...progress.results},record={earned,shots:boltsUsed,stars},before=results[liveLevel.id];
    if(!before||earned>before.earned||(earned===before.earned&&boltsUsed<before.shots))results[liveLevel.id]=record;
    save.kingdoms[kingdom.id]={...progress,next,cleared:Math.max(progress.cleared,next),results};
    save.totalScore=(save.legacyScore||0)+RT.campaigns.kingdoms.reduce((sum,k)=>sum+kingdomScore(k.id).points,0);
    save.level=kingdom.levels[Math.min(next,kingdom.levels.length-1)];
    const newAmmo = null;
    persistSave();

    lastResult = { stars: stars, earned: earned, bonus: bonus, newAmmo: newAmmo || null, pickups:levelPickups.slice() };
    // Not spoken here — js/ui.js announces it once the results overlay
    // actually opens (after the SETTLE/RESULTS camera hold plays out), not
    // the instant the crown dies mid-cinematic.
  }

  /** What comes after a shot's cinematic (or its immediate miss) finishes:
   *  the results overlay on a win, the out-of-bolts overlay if this was the
   *  last bolt and Endless Bolts is off, or straight back to aiming. Shared
   *  by the clean-miss branch in updateShots() and the RESULTS timeout in
   *  update() below, so the two paths can't drift apart on this check. */
  function advanceAfterShot() {
    if(rescueFailed){CAM.phase="RESCUE_FAILED";} else if (levelWon) {
      CAM.phase = 'RESULTS_MENU';
    } else if (!save.endlessBolts && shotsRemaining()<=0) {
      CAM.phase = 'OUTOFBOLTS';
    } else {
      enterAim();
    }
  }

  /** Kicks off the ~2s post-impact linger (see stepLinger() just below): the
   *  bolt deflects off the surface it just hit and keeps existing as a real,
   *  if simplified, moving object rather than vanishing on first contact —
   *  same deterministic step-under-gravity style traceShot() already uses,
   *  not a real Ammo.js body (this codebase's bolts have never been one). */
  function startLinger(s, primaryBlock, impactPos, impactVel) {
    if(s.trace.ammo.id==='boulder'){startBoulderRoll(s,primaryBlock,impactPos,impactVel);return;}
    s.linger = true;
    s.lingerT = 0;
    s.hitBlocks = new Set([primaryBlock]);
    s.lingerPos = impactPos.clone();
    const n = hitNormal(primaryBlock, impactPos);
    s.lingerVel = impactVel.clone().addScaledVector(n, -2 * impactVel.dot(n)).multiplyScalar(CFG.LINGER_RESTITUTION);
  }

  /** A scaled-down applyHit() for a bolt that already spent its main impact —
   *  same damage/knock/kill/checkWin shape, just decayed per additional
   *  linger hit (`decay`) so one bolt can't bulldoze an entire structure, and
   *  without ammo.splash's own big blast (only the PRIMARY impact triggers
   *  that) — applySeamHit() still applies, at its own small radius. */
  function lingerHit(b, ammo, vel, pos, decay) {
    if (!b.alive) return;
    const speed = vel.length();
    b._lastHitSpeed = speed;
    sfx('impact', b.mat, speed, panFor(pos));
    b.hp -= D.damageFor(ammo, b.mat) * decay;
    if (!b.mat.static) {
      P.addVelocity(b.body, vel.x * CFG.KNOCK_SCALE * decay * impactMobility(b), vel.y * CFG.KNOCK_SCALE * decay * impactMobility(b), vel.z * CFG.KNOCK_SCALE * decay * impactMobility(b));
    }
    if (b.hp <= 0) destroyBlockRec(b);
    applySeamHit(ammo, pos, b);
    checkWin();
  }

  /** Steps a lingering bolt one frame: gravity + its current (deflected)
   *  velocity, checking for a NEW block (anything this same bolt hasn't
   *  already hit) along the way. Ends on a timeout, on settling near-still,
   *  on touching the ground, or on leaving the same out-of-bounds box
   *  traceShot() already checks — whichever comes first. */
  function stepLinger(s, dt) {
    s.lingerT += dt;
    s.lingerVel.y -= CFG.GRAVITY * dt;
    s.lingerPos.addScaledVector(s.lingerVel, dt);
    s.mesh.position.copy(s.lingerPos);

    const b = findHitBlock(s.lingerPos, s.trace.ammo.r);
    if (b && !s.hitBlocks.has(b)) {
      s.hitBlocks.add(b);
      const decay = Math.pow(CFG.LINGER_DMG_DECAY, s.hitBlocks.size - 1);
      lingerHit(b, s.trace.ammo, s.lingerVel, s.lingerPos, decay);
      const n = hitNormal(b, s.lingerPos);
      s.lingerVel.addScaledVector(n, -2 * s.lingerVel.dot(n)).multiplyScalar(CFG.LINGER_RESTITUTION);
    }

    const done = s.lingerT > CFG.LINGER_MS / 1000 ||
                 s.lingerVel.lengthSq() < 0.4 ||
                 s.lingerPos.y <= CFG.GROUND_Y + 0.02 ||
                 Math.abs(s.lingerPos.x) > OUT_OF_BOUNDS_X ||
                 s.lingerPos.z < OUT_OF_BOUNDS_Z_FAR || s.lingerPos.z > OUT_OF_BOUNDS_Z_NEAR;
    if (done) {
      s.resolved = true;
      scene.remove(s.mesh);
    }
  }

  function startBoulderRoll(s,primaryBlock,pos,velocity){
    sfx('boulderLand');
    s.linger=true;s.rolling=true;s.lingerT=0;s.hitBlocks=new Set(primaryBlock?[primaryBlock]:[]);
    s.lingerPos=pos.clone();s.lingerVel=velocity.clone().multiplyScalar(.78);
    if(primaryBlock?.alive){const n=hitNormal(primaryBlock,pos);resolveBoulderContact(s,primaryBlock,n);}
    else if(primaryBlock)s.lingerVel.y*=.55;
    if(!primaryBlock){s.lingerPos.y=CFG.GROUND_Y+s.trace.ammo.r;s.lingerVel.y=Math.min(2.4,Math.abs(velocity.y)*.15);}
    s.mesh.position.copy(s.lingerPos);
    if(!auditing)RT.effects?.burst(pos,D.MAT.S,false,steadyCameraOn());
  }
  function resolveBoulderContact(s,b,n){
    const local=s.lingerPos.clone().sub(b.mesh.position).applyQuaternion(b.mesh.quaternion.clone().invert());
    const normal=n.clone().applyQuaternion(b.mesh.quaternion.clone().invert());
    const axis=Math.abs(normal.y)>.5?'y':Math.abs(normal.x)>.5?'x':'z';
    local[axis]=Math.sign(normal[axis])*(b.half[axis]+s.trace.ammo.r+.008);
    s.lingerPos.copy(local.applyQuaternion(b.mesh.quaternion).add(b.mesh.position));
    const inward=s.lingerVel.dot(n);if(inward<0)s.lingerVel.addScaledVector(n,-inward*1.22);
  }
  function stepBoulderRoll(s,dt){
    // Small distance-limited steps keep fast rolls from skipping thin pieces.
    let remaining=dt;
    while(remaining>0&&!s.resolved){
      const step=Math.min(remaining,CFG.DT,.16/Math.max(1,s.lingerVel.length()));remaining-=step;s.lingerT+=step;
      s.lingerVel.y-=CFG.GRAVITY*step;s.lingerPos.addScaledVector(s.lingerVel,step);
      const floor=CFG.GROUND_Y+s.trace.ammo.r;
      if(s.lingerPos.y<=floor){s.lingerPos.y=floor;s.lingerVel.y=Math.abs(s.lingerVel.y)>1.4?-s.lingerVel.y*.16:0;const drag=Math.exp(-.65*step);s.lingerVel.x*=drag;s.lingerVel.z*=drag;}
      const b=findHitBlock(s.lingerPos,s.trace.ammo.r);
      if(b){
        if(!s.hitBlocks.has(b)&&s.lingerVel.length()>1){
          s.hitBlocks.add(b);const decay=Math.pow(.85,s.hitBlocks.size-1)*U.clamp(s.lingerVel.length()/10,.35,1);
          lingerHit(b,s.trace.ammo,s.lingerVel,s.lingerPos,decay);s.lingerVel.multiplyScalar(.82);
          if(!auditing)RT.effects?.burst(s.lingerPos,b.mat,false,steadyCameraOn());
        }
        if(b.alive)resolveBoulderContact(s,b,hitNormal(b,s.lingerPos));
      }
      s.mesh.rotateOnWorldAxis(new THREE.Vector3(s.lingerVel.z,0,-s.lingerVel.x).normalize(),Math.hypot(s.lingerVel.x,s.lingerVel.z)*step/s.trace.ammo.r);
      const settled=s.lingerVel.lengthSq()<.4&&(b||s.lingerPos.y<=floor+.02);
      if(settled||s.lingerT>s.trace.ammo.rollSeconds||Math.abs(s.lingerPos.x)>OUT_OF_BOUNDS_X||s.lingerPos.z<OUT_OF_BOUNDS_Z_FAR||s.lingerPos.z>OUT_OF_BOUNDS_Z_NEAR){s.resolved=true;scene.remove(s.mesh);}
    }
    s.mesh.position.copy(s.lingerPos);
  }

  function updateShots(dt) {
    if (!shots.length) return;
    const dtStep = CFG.DT;
    const spawned = [];
    for (const s of shots) {
      if (s.resolved) continue;
      if (s.linger) { if(s.rolling){stepBoulderRoll(s,dt);if(!auditing&&s.lingerVel.length()>1){RT.effects?.roll(s.mesh.position,s.lingerVel.length(),steadyCameraOn());}}else stepLinger(s, dt);continue; }
      s.t += dt;
      const idx = Math.min(s.trace.points.length - 1, Math.floor(s.t / dtStep));
      if (s.splitIndex != null && idx >= s.splitIndex && s.splitIndex < s.trace.points.length - 1) {
        const at = s.trace.points[s.splitIndex];
        if(!auditing)RT.effects?.split(at,steadyCameraOn());sfx('split');
        const velocity = at.clone().sub(s.trace.points[s.splitIndex - 1]).divideScalar(dtStep);
        const side = new THREE.Vector3(-velocity.z, 0, velocity.x).normalize();
        for (const offset of [0, -1, 1]) {
          const childAmmo = Object.assign({}, s.trace.ammo, { fragment: true });
          const v = velocity.clone().addScaledVector(side, offset * 3.2);
          const trace = traceFlight(childAmmo, at.clone(), v, s.trace.yaw, s.trace.elevation);
          const mesh = RT.castleArt.projectile(childAmmo);
          mesh.position.copy(at); scene.add(mesh);
          spawned.push({ mesh, trace, t: 0, resolved: false });
        }
        scene.remove(s.mesh); s.resolved = true;
        continue;
      }
      s.mesh.position.copy(s.trace.points[idx]);
      if (idx + 1 < s.trace.points.length) s.mesh.lookAt(s.trace.points[idx + 1]);
      if (RT.effects && !steadyCameraOn()) RT.effects.trail(s.mesh.position, s.trace.ammo.id, dt);
      /* Whoosh follows the bolt: pitch from how fast it is actually moving
         along the traced path, stereo position from where it is on screen. */
      if (idx > 0) {
        const step = s.trace.points[idx].distanceTo(s.trace.points[idx - 1]) / dtStep;
        sfx('updateFlight', U.clamp(step / 45, 0, 1), panFor(s.mesh.position));
      }
      if (idx >= s.trace.points.length - 1) {
        sfx('stopFlight');
        if (s.trace.hit.type === 'block') {
          const impactPos = s.trace.points[s.trace.points.length - 1];
          applyHit(s.trace.hit.block, s.trace.ammo, s.trace.impactVel, impactPos);
          beginImpact(impactPos, s.trace.impactVel);
          // Fire bolts and powder bombs are consumed on contact; only solid shots ricochet.
          if(s.trace.ammo.id==='fire'||s.trace.ammo.id==='bomb'){s.resolved=true;scene.remove(s.mesh);}else startLinger(s, s.trace.hit.block, impactPos, s.trace.impactVel);
        } else {
          if(!auditing){RT.effects?.strike(s.trace.points[s.trace.points.length-1],s.trace.ammo.id,steadyCameraOn());if(s.trace.ammo.id==='bomb')sfx('explosion');if(s.trace.ammo.id==='fire')sfx('ignite');}
          if(s.trace.ammo.id==='boulder'&&s.trace.hit.type==='ground'){const pos=s.trace.points[s.trace.points.length-1];applySplash(s.trace.ammo,pos,null);startBoulderRoll(s,null,pos,s.trace.impactVel);beginImpact(pos,s.trace.impactVel);checkWin();continue;}
          s.resolved = true;
          scene.remove(s.mesh);
          /* A clean miss still landed somewhere — a dull thud into the dirt,
             so "nothing happened" is never silent. */
          sfx('noise', 0.22, { freq: 380, freqTo: 60, vol: 0.13,
                               pan: panFor(s.trace.points[s.trace.points.length - 1]) });
          if(s.trace.ammo.id==='fire'){const pos=s.trace.points[s.trace.points.length-1];RT.castleLife.ignite(pos);}
          beginImpact(s.trace.points[s.trace.points.length-1],s.trace.impactVel);
          if (s.trace.ammo.splash) applySplash(s.trace.ammo, s.trace.points[s.trace.points.length - 1], null);
          checkWin();
        }
      }
    }
    shots = shots.filter((s) => !s.resolved).concat(spawned);
    if (!shots.length && CAM.phase === "FLIGHT") advanceAfterShot();
  }

  /**
   * One physics step, plus the collateral damage that comes with it: blocks
   * smashing into each other during a collapse, detected as a before/after
   * speed check rather than an Ammo contact listener — ported from the 2D
   * version's stepWorld(). "This block just got stopped hard" is exactly
   * what a sudden loss of speed means, whether that's landing or crashing
   * into a neighbour.
   *
   * The peak-speed tracking, hp loss and crush detection itself now live in
   * js/settle.js (RT.settle) — extracted so the level editor's stability test
   * can settle a candidate castle with this exact damage model instead of a
   * bare P.step() that can't see a crown getting crushed in place. This is a
   * thin wrapper supplying the two things that are genuinely game-specific:
   * sound (sfx/panFor) and destruction (destroyBlockRec, which also handles
   * score, a keg's splash chain, and waking whatever was resting on top).
   */
  function stepPhysicsWithImpacts(dt) {
    for(const r of debris){r.beforeSpeed=P.speed(r.body);r.age+=dt;}
    RT.settle.step(blocks, dt, {
      onImpact: (b, drop) => {
        sfx('impact', b.mat, drop, panFor(b.mesh.position));
        if(!auditing&&b.alive&&b.hp>0){RT.castleArt.damage(b.mesh,1-b.hp/b.mat.hp,b.mat,b.spec);RT.effects?.burst(b._fracturePoint?new THREE.Vector3(b._fracturePoint.x,b._fracturePoint.y,b._fracturePoint.z):b.mesh.position,b.mat,false,steadyCameraOn());}
      },
      onDestroy: destroyBlockRec
    });
    /* Rubble isn't in `blocks` (see spawnDebris), so RT.settle.step's own
       sync never sees it — but it is in the same Bullet world and has been
       moved by that same step, so its meshes have to be caught up here or it
       would fall on screen only when something else happened to redraw. */
    // Cache target transforms once per step, not once per fragment/target pair.
    const rubbleTargets=debris.length?blocks.filter(b=>b.alive&&!b.mat.static).map(b=>({
      b,inverse:new THREE.Matrix4().compose(b.mesh.position,b.mesh.quaternion,new THREE.Vector3(1,1,1)).invert(),
      radius:b.half.length()
    })):[];
    for (const r of debris.slice()) {
      const from=r.mesh.position.clone(),speed=Math.max(r.beforeSpeed||0,P.speed(r.body));P.sync(r.mesh,r.body);const delta=r.mesh.position.clone().sub(from),length=delta.length();
      // Sweep the whole fragment between frames so a fast chip cannot tunnel
      // through a small character. Resting rubble never deals repeated damage.
      if(speed<2||length<.001)continue;const ray=new THREE.Ray(from,delta.clone().normalize());
      for(const {b,inverse,radius} of rubbleTargets){
        const reach=radius+r.half.length()+length,center=b.mesh.position;
        if(Math.abs(center.x-from.x)>reach||Math.abs(center.y-from.y)>reach||Math.abs(center.z-from.z)>reach)continue;
        const character=b.mat.guard||b.mat.crown||b.mat.protected;
        if(!b.alive||b.mat.static||(character?r.hitCharacters.has(b):speed<5.5||r.age<.08||r.hitStructures.has(b)||(r.structuralHits.get(b)||0)>=24))continue;
        const local=ray.clone().applyMatrix4(inverse),box=new THREE.Box3(b.half.clone().negate(),b.half.clone()).expandByScalar(Math.max(r.half.x,r.half.y,r.half.z)),hit=box.containsPoint(local.origin)?local.origin:local.intersectBox(box,new THREE.Vector3());
        if(!hit||hit.distanceTo(local.origin)>length+.02)continue;
        if(character){r.hitCharacters.add(b);b.hp-=Math.min(30,speed*5);}
        else{
          const damage=Math.min(24-(r.structuralHits.get(b)||0),12,(speed-4)*2);
          r.hitStructures.add(b);r.structuralHits.set(b,(r.structuralHits.get(b)||0)+damage);b.hp-=damage;
          if(!auditing&&b.hp>0)RT.castleArt.damage(b.mesh,1-b.hp/b.mat.hp,b.mat,b.spec);
        }
        b._lastHitSpeed=speed;sfx('impact',b.mat,speed,panFor(b.mesh.position));const knock=character?.2:.035;P.addVelocity(b.body,delta.x/length*speed*knock,Math.max(.1,delta.y/length*speed*knock),delta.z/length*speed*knock);if(b.hp<=0)destroyBlockRec(b);
      }
    }
    checkWin();
  }

  /**
   * Call after a theme change (settings menu) to repaint the live scene.
   *
   * Repainting is not optional and it is not just the sky: a mesh keeps
   * whatever material it was handed when it was built, so switching profile
   * used to leave every block, and the ballista itself, painted in the
   * *previous* profile's colours — only the sky, ground and aim preview
   * followed. High Contrast made that impossible to miss, since the profile
   * changes the material class as well as the colours.
   */
  function onThemeChanged() {
    if (!world) return;
    refreshPalette();
    applyProfileToArt();
    W.refresh(world, worldPalette(), scene);
    repaintBlocks();
    if (ballista) A.repaint(ballista.root, { wood: css('wood'), steel: css('steel') });
    if (guardDecor) A.repaint(guardDecor, { guard: css('guard') });
    if (guardDecor2) A.repaint(guardDecor2, { guard: css('guard') });
    if (previewMat) previewMat.color.set(css('focus'));
  }

  /** Hand every live block a material from the current palette. Same colour
   *  lookup spawnBlock() uses, so a repainted castle and a freshly built one
   *  can't disagree. */
  function repaintBlocks() {
    for (const b of blocks) {
      if (!b.alive) continue;
      const color = css(b.mat.css.replace('--', ''));
      if(!b.mesh.userData.rascal && !b.mesh.userData.prison)b.mesh.material = b.mat.crown ? A.glow(color) : A.paper(color);
      if (RT.castleArt) RT.castleArt.repaint(b.mesh, color, b.mat.id);
    }
    // Rubble already on the ground is part of the scene too — switching
    // colour profile mid-collapse would otherwise leave it in the old palette.
    for (const r of debris) r.mesh.material = A.paper(css(r.mat.css.replace('--', '')));
  }

  function init(opts) {
    scene = opts.scene;
    if (RT.effects) RT.effects.init(scene);
    camera = opts.camera;
    renderer = opts.renderer;
  }

  function loadAttract() {
    if (!save) loadSave();   // before ui.js's synchronous init() reads unlockedAmmo()/liveLevel
    // The saved profile has to be on the body BEFORE the world is built, or
    // the first frame is painted from the default palette and only corrects
    // itself on the next theme change.
    if (save.theme) document.body.setAttribute('data-theme', save.theme);
    if (!world) buildWorldAndBallista();
    if (!physicsReady) {
      // Ammo's module factory resolves asynchronously (see js/physics.js) —
      // the scene renders and the attract camera runs on its own in the
      // meantime; update() below simply doesn't step physics until this
      // resolves, so there's nothing to block on here.
      P.init().then(() => {
        physicsReady = true;
        try {
          if (new URLSearchParams(window.location.search).get('audit') === 'levels') {
            performance.mark('ballista-audit-start');
            runBootAudits();
            performance.measure('ballista-campaign-audit', 'ballista-audit-start');
          } else {
            // Build only the saved castle. Full stability checks stay opt-in.
            auditLevelData();
            loadLevel(save.level);
          }
        } catch (err) {
          // An unhandled rejection here would just look like a silent hang
          // — surface it the same way main.js's own frame-loop errors do,
          // then still throw so it also lands loudly in the console.
          console.error('Ballista startup failed:', err);
          const el = document.getElementById('loading');
          if (el) {
            el.style.display = 'flex';
            el.innerHTML = '<div style="max-width:640px;text-align:center;padding:24px;font-size:1.1rem">'
              + '<div style="font-size:2rem;margin-bottom:12px">\u{1F635} Unable to load castle</div>'
              + '<div style="opacity:.8">' + String(err && err.message ? err.message : err) + '</div></div>';
          }
          throw err;
        }
        // The UI observes ATTRACT -> AIM and opens the welcome menu.
        enterAim();
      });
    }
    CAM.phase = 'ATTRACT';
    CAM.attractT = 0;
  }

  /** Slow orbit around the ballista while physics initializes. */
  function updateAttract(dt) {
    CAM.attractT += dt;
    const radius = 9, height = 4.2;
    const speed = 0.12; // full turn every ~52s — meant to be glanced at, not watched
    const a = CAM.attractT * speed;
    camera.position.set(Math.sin(a) * radius, height, Math.cos(a) * radius);
    camera.lookAt(0, 1.4, -2);
  }

  /**
   * The fixed fallback pose — no zoom, no dolly. Everything about a shot
   * used to be judged from exactly this frame; it's still what OUTOFBOLTS/
   * MENU hold underneath their overlay, and what Steady Camera forces every
   * frame (see update() below) for anyone the zoom below would bother.
   */
  let aimFrameBlocks=[],aimFrameAspect=0,compactAim=0;
  let viewZoom=1,overview=false,viewIntroduced=false,manualOrbit=false;
  // Fit occupied pieces rather than the grid's empty margins. Keep space for HUD
  // controls and crate emblems, and include protected characters in the foreground.
  function castleFrame(direction,frameBlocks=aimFrameBlocks,fitZoom=camera.zoom){
    const bounds=new THREE.Box3(),corners=[];
    for(const b of frameBlocks){const mat=D.MAT[b.matId];for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1]){const point=new THREE.Vector3(b.x+x*(b.w/2+.12),Math.max(0,b.y+y*b.h/2+(y>0?(mat.pickup?1.6:.25):-.08)),b.z+z*(b.d/2+.12));corners.push(point);bounds.expandByPoint(point);}}
    if(!corners.length)return{position:new THREE.Vector3(0,6,0),look:new THREE.Vector3(0,2,-24)};
    const look=bounds.getCenter(new THREE.Vector3()),back=direction.clone().normalize(),right=new THREE.Vector3().crossVectors(camera.up,back).normalize(),up=new THREE.Vector3().crossVectors(back,right).normalize();
    const vertical=Math.tan(THREE.MathUtils.degToRad(camera.fov/2))/fitZoom,horizontal=vertical*camera.aspect;
    let distance=7;
    for(const point of corners){const offset=point.clone().sub(look),depth=offset.dot(back);distance=Math.max(distance,depth+Math.abs(offset.dot(right))/(horizontal*.84),depth+Math.abs(offset.dot(up))/(vertical*.72));}
    return{position:look.clone().addScaledVector(back,distance),look,size:bounds.getSize(new THREE.Vector3())};
  }
  function refreshAimFrame(force=false){if(!camera||(!force&&aimFrameAspect===camera.aspect))return;aimFrameAspect=camera.aspect;const frame=castleFrame(new THREE.Vector3(.18,.3,1),aimFrameBlocks,1),size=frame.size;compactAim=size?U.clamp((14-Math.max(size.x,size.z,size.y*1.3))/8,0,1):0;AIM_POS.copy(frame.position).sub(frame.look).multiplyScalar(1+.18*compactAim).add(frame.look);AIM_LOOKAT.copy(frame.look);}
  function applyViewZoom(value){if(camera&&camera.zoom!==value){camera.zoom=value;camera.updateProjectionMatrix();}}
  function updateAim(force=false) {
    applyViewZoom(viewZoom);if(manualOrbit&&!force)return;
    refreshAimFrame();
    if(overview){camera.position.set(5,4.6,8);camera.lookAt(0,1.5,-5);}else{camera.position.copy(AIM_POS);camera.lookAt(AIM_LOOKAT);}
  }
  function prepareShotView(){if(!viewIntroduced&&boltsUsed===0){viewIntroduced=true;showView('ballista');}}
  function showView(kind){overview=kind==='ballista';manualOrbit=false;CAM.pointerAiming=false;CAM.targetScene=null;chargeZoomActive=false;updateAim(true);}
  function beginAimView(){if(overview)showView('aim');applyViewZoom(viewZoom);}
  function zoomView(amount){viewZoom=U.clamp(viewZoom*Math.exp(amount),.55,1.65);applyViewZoom(viewZoom);return Math.round(viewZoom*100);}
  function orbitView(dx,dy){
    const target=overview?new THREE.Vector3(0,1.5,-5):CAM.targetScene?.point||AIM_LOOKAT;
    const offset=camera.position.clone().sub(target),sphere=new THREE.Spherical().setFromVector3(offset);
    sphere.theta-=U.clamp(dx,-80,80)*.004;sphere.phi=U.clamp(sphere.phi+U.clamp(dy,-80,80)*.004,.18,1.43);
    camera.position.copy(target).add(new THREE.Vector3().setFromSpherical(sphere));camera.lookAt(target);manualOrbit=true;CAM.pointerAiming=true;
  }

  let chargeZoomActive=false,chargeRadius=7;
  const _chargeSeat=new THREE.Vector3(),_chargeLook=new THREE.Vector3();

  // Manual aim holds its framing. Only an Enter-owned charge requests a close-up;
  // pointer aim keeps the scene under the cursor still, even while charging.
  function updateAimZoom(dt) {
    const resized=aimFrameAspect!==camera.aspect;refreshAimFrame();
    if(resized&&CAM.targetScene)focusTargetScene(CAM.targetScene.point);
    applyViewZoom(viewZoom);if(CAM.targetScene&&!manualOrbit){updateTargetScene(dt);return;}
    if(CAM.chargeAiming&&CAM.aimTracing&&!steadyCameraOn()){
      if(!chargeZoomActive){chargeRadius=U.clamp(camera.position.distanceTo(CAM.aimTarget)*.48,3+1.5*compactAim,7/Math.min(1,camera.aspect));camera.getWorldDirection(_chargeLook);_chargeLook.multiplyScalar(camera.position.distanceTo(CAM.aimTarget)).add(camera.position);chargeZoomActive=true;}
      const k=1-Math.exp(-dt*4);
      // Frame the actual first contact, including a roof or wall blocking the shot.
      _chargeSeat.copy(AIM_POS).sub(CAM.aimTarget);_chargeSeat.y=0;_chargeSeat.normalize().multiplyScalar(chargeRadius);
      _chargeSeat.add(CAM.aimTarget);_chargeSeat.y=CAM.aimTarget.y+chargeRadius*.5;
      if(segmentBlocked(_chargeSeat,CAM.aimTarget))_chargeSeat.y+=Math.max(4,liveLevel._extent*.5);
      camera.position.lerp(_chargeSeat,k);_chargeLook.lerp(CAM.aimTarget,k);camera.lookAt(_chargeLook);return;
    }
    chargeZoomActive=false;
    if(manualOrbit)return;
    if(CAM.pointerAiming){if(resized)updateAim();return;}
    updateAim();
  }

  /** Every new shot starts from the normal manual aiming frame. */
  function enterAim() {
    CAM.phase = 'AIM';
    overview=false;manualOrbit=false;applyViewZoom(viewZoom);
    CAM.targetScene=null;CAM.pointerAiming=false;CAM.chargeAiming=false;CAM.aimTracing=false;CAM.areaAiming=false;chargeZoomActive=false;CAM.aimZoom = 0;
  }

  const _flightEye = new THREE.Vector3();
  function updateFlight(dt) {
    const s = shots[0];
    if (!s) return;
    const p = s.mesh.position;
    _flightEye.set(p.x, p.y + 2.2, p.z + 5);
    camera.position.lerp(_flightEye, Math.min(1, dt * 2.5));
    camera.lookAt(p.x, p.y, p.z);
  }

  /* ── Impact-seat scorer ───────────────────────────────────────────────────
   * Score candidate poses on a ring around the impact point and take the
   * best. Three rules, in order of how hard they are: never cross the aim
   * camera's 180 degree line (a cut to the far side reverses left and right,
   * which is genuinely disorienting — this one is load-bearing, not just a
   * preference); prefer a three-quarter view over dead side-on; prefer
   * seeing the most destructible mass still in play.
   */

  const _segPoint = new THREE.Vector3();
  const SEAT_SAMPLE_STEP = 0.5;
  /** Cheap occlusion test — reuses the same oriented-box test the shot
   *  itself hits blocks with, rather than a real ray query, so a candidate
   *  seat is rejected if any surviving block sits between it and the
   *  impact point.
   *
   *  Sampled every SEAT_SAMPLE_STEP world units rather than at four fixed
   *  fractions: the seat now sits up to three times further out for a big
   *  castle (data.js's cinematicSeat), and four samples spread along a
   *  segment that long leave gaps a whole 1-unit block can sit inside
   *  unnoticed — which would seat the camera behind a wall. Still ignores
   *  the last 20% at either end, so a block right at the impact point (or
   *  right under the camera) doesn't veto every seat on the ring. */
  function segmentBlocked(from, to) {
    const span = from.distanceTo(to) * 0.6;      // the 0.2..0.8 window
    const n = Math.max(4, Math.ceil(span / SEAT_SAMPLE_STEP));
    for (let i = 0; i <= n; i++) {
      _segPoint.lerpVectors(from, to, 0.2 + 0.6 * (i / n));
      if (findHitBlock(_segPoint, 0.15)) return true;
    }
    return false;
  }

  let damageBounds=null,damageSnapshots=new Map(),damageTargets=new Set(),damageDirection=new THREE.Vector3(.18,.5,1);
  const IMPACT_HOLD_S=.25;
  function includeDamageBlock(b){
    const box=new THREE.Box3(b.half.clone().negate(),b.half.clone()).applyMatrix4(new THREE.Matrix4().compose(b.mesh.position,b.mesh.quaternion,new THREE.Vector3(1,1,1)));
    box.min.y=Math.min(0,box.min.y);damageBounds.union(box);
  }
  function damageFrame(direction=damageDirection){const c=damageBounds.getCenter(new THREE.Vector3()),size=damageBounds.getSize(new THREE.Vector3());return castleFrame(direction,[{x:c.x,y:c.y,z:c.z,w:size.x,h:size.y,d:size.z,matId:'S'}]);}
  function updateDamageBounds(){
    if(!damageBounds)return;
    for(const [b,before]of damageSnapshots){const character=b.mat.guard||b.mat.crown||b.mat.protected;if(b.hp<before.hp||!b.alive||(!character&&b.mesh.position.distanceToSquared(before.position)>.09))damageTargets.add(b);}
    for(const b of damageTargets)includeDamageBlock(b);
  }
  function beginImpact(impactPoint,impactVel){
    const first=!damageBounds;CAM.impactPoint.copy(impactPoint);
    if(first)damageBounds=new THREE.Box3();
    // Include ground below the strike so collapsing towers remain inside the frame.
    damageBounds.expandByPoint(new THREE.Vector3(impactPoint.x-2.5,0,impactPoint.z-2.5));
    damageBounds.expandByPoint(new THREE.Vector3(impactPoint.x+2.5,impactPoint.y+2,impactPoint.z+2.5));
    for(const b of blocks){if(!b.alive&&!damageSnapshots.has(b))continue;const dx=Math.max(0,Math.abs(b.mesh.position.x-impactPoint.x)-b.half.x),dz=Math.max(0,Math.abs(b.mesh.position.z-impactPoint.z)-b.half.z);if(Math.hypot(dx,dz)<3)damageTargets.add(b);}
    updateDamageBounds();
    if(first){
      const centre=damageBounds.getCenter(new THREE.Vector3()),home=Math.atan2(AIM_POS.x-centre.x,AIM_POS.z-centre.z);let found=false;
      for(const elevation of [.5,1.1]){for(const offset of [0,.45,-.45,.9,-.9,1.4,-1.4]){const direction=new THREE.Vector3(Math.sin(home+offset),elevation,Math.cos(home+offset)),frame=damageFrame(direction);if(!segmentBlocked(frame.position,impactPoint)){damageDirection.copy(direction);found=true;break;}}if(found)break;}
      if(!found)damageDirection.set(0,1,.12);
      CAM.phase='IMPACT';CAM.impactT=0;
    }
    const frame=damageFrame();CAM.lookAt.copy(frame.look);CAM.seatPos.copy(frame.position);
    CAM.shake=Math.max(CAM.shake,Math.min(1,(impactVel?impactVel.length():20)/30));
  }
  // Keep the actual damage area in view; no orbit that can drift behind intact walls.
  function positionAtSeat(dt=0){
    if(damageBounds&&!steadyCameraOn()&&['IMPACT','SETTLE'].includes(CAM.phase)){
      updateDamageBounds();const frame=damageFrame(),k=1-Math.exp(-Math.max(0,dt)*5);CAM.seatPos.lerp(frame.position,k);CAM.lookAt.lerp(frame.look,k);
    }
    camera.position.copy(CAM.seatPos);camera.lookAt(CAM.lookAt);
  }

  /** Scales with impact energy, zeroed under reduced motion or Steady
   *  Camera. Applied after whatever positioned the camera this frame, as a
   *  small additive jitter rather than a replacement. */
  function updateShake(dt) {
    CAM.shake = Math.max(0, CAM.shake - dt * 1.5);
    if (CAM.shake <= 0 || steadyCameraOn()) return;
    const s = CAM.shake * 0.12;
    camera.position.x += (Math.random() * 2 - 1) * s;
    camera.position.y += (Math.random() * 2 - 1) * s;
  }

  let narrator=null,narratorAge=0;const narratorModels=new Map();
  function focusTargetScene(point){
    overview=false;manualOrbit=false;applyViewZoom(viewZoom);
    refreshAimFrame();const target=point.clone(),distance=(5.8+compactAim)/Math.min(1,camera.aspect);let seat=null;
    // Pick a clear three-quarter view of this actual impact area.
    for(const a of [.25,-.35,.7,-.8,1.3,-1.3,Math.PI]){const p=new THREE.Vector3(target.x+Math.sin(a)*distance,Math.max(2,target.y+2),target.z+Math.cos(a)*distance);if(!segmentBlocked(p,target)){seat=p;break;}}
    if(!seat)seat=new THREE.Vector3(target.x,target.y+distance,target.z+distance*.3);
    CAM.targetScene={point:target,seat};if(previewGroup)previewGroup.visible=false;updateTargetScene(steadyCameraOn()?1:0);
  }
  function updateTargetScene(dt){const s=CAM.targetScene;if(!s)return;const k=steadyCameraOn()?1:1-Math.exp(-dt*9);camera.position.lerp(s.seat,k);camera.lookAt(s.point);}
  const narratorMark=new THREE.Vector3();
  function showNarrator(on){
    if(on)applyViewZoom(1);
    if(on){const guide=RT.courses.narrator(liveLevel.narrator);if(narrator?.userData.narratorStyle!==guide.style){if(narrator)narrator.visible=false;narrator=narratorModels.get(guide.style);if(!narrator){narrator=RT.castleArt.narrator(guide.style);narrator.visible=false;scene.add(narrator);narratorModels.set(guide.style,narrator);}}narrator.name=guide.name;}
    if(!narrator)return;
    if(on&&!narrator.visible){narratorAge=0;const bounds=D.castleBounds(liveLevel);narratorMark.set(((liveLevel._centre?.x||0)-1.5)*.7,0,Math.max((-bounds.near+3.5)*.7,W.dryForegroundZ(liveLevel)));}
    narrator.visible=!!on;updateNarrator(0);
  }
  function updateNarrator(dt){
    if(!narrator?.visible)return;narratorAge+=dt;
    const reduced=steadyCameraOn()||REDUCED_MOTION,t=reduced?1:Math.min(1,narratorAge/1.5),ease=t*t*(3-2*t);
    // Rowan shares the field's ground plane and perspective with the castle.
    narrator.position.copy(narratorMark);narrator.position.x-=5*(1-ease);narrator.scale.setScalar(.56);
    const zoom=reduced?1:U.clamp((narratorAge-1.5)/.9,0,1),k=zoom*zoom*(3-2*zoom),aspect=Math.min(1,camera.aspect);
    camera.position.lerpVectors(new THREE.Vector3(narratorMark.x+4.5,5.2,narratorMark.z+15/aspect),new THREE.Vector3(narratorMark.x+1.5,1.8,narratorMark.z+4.8/aspect),k);camera.lookAt(narratorMark.x+.2,1.05,narratorMark.z-.3);
    const facing=Math.atan2(camera.position.x-narrator.position.x,camera.position.z-narrator.position.z);narrator.rotation.y=t<1?Math.PI/2:facing;
    const speaking=!reduced&&window.speechSynthesis?.speaking,body=narrator.userData.walkBody;
    if(body){body.rotation.z=t<1?Math.sin(narratorAge*14)*.06:speaking?Math.sin(narratorAge*5)*.035:0;body.position.y=t<1?Math.abs(Math.sin(narratorAge*14))*.03:0;}
    narrator.userData.legs.forEach((leg,i)=>leg.rotation.x=t<1?Math.sin(narratorAge*14+i*Math.PI)*.65:0);
  }
  function narratorHead(){if(!narrator?.visible)return null;camera.updateMatrixWorld();return narrator.position.clone().add(new THREE.Vector3(0,1.05,0)).project(camera);}
  function update(dt) {
    updateNarrator(dt);
    if (CAM.phase === 'RESCUE_FAILED') return;
    if (CAM.phase === 'MENU') { RT.castleLife?.stop(); if(exploring)RT.castleLife?.preview(dt,REDUCED_MOTION); sfx('tick', dt, 'MENU'); return; }
    if (world && !steadyCameraOn()) W.update(world, dt);
    if (RT.effects && !auditing) RT.effects.update(dt, steadyCameraOn());

    /* Flushes whatever the impact voice cap folded into a rumble this frame,
       and fades the background music toward whatever CAM.phase wants it at
       right now (js/audio-safe.js's musicTick) — one call so the two can never
       drift out of step on what "this frame" means. Called before the
       physics step so a rumble follows the collapse it came from rather than
       lagging a frame behind it. */
    sfx('tick', dt, CAM.phase);
    if (physicsReady) {
      if(!auditing)RT.castleLife.update(dt,{patrol:(CAM.phase==='AIM'&&!CAM.targetScene)||RT.castleLife.active(),reduced:REDUCED_MOTION});
      stepPhysicsWithImpacts(dt);
      updateShots(dt);
      if(!auditing){RT.effects?.observe(blocks,dt,steadyCameraOn());if(RT.castleLife.active())sfx('fireBed');}
      if(rescueFailed){CAM.phase="RESCUE_FAILED";if(previewGroup)previewGroup.visible=false;return;}
    }

    // The preview is only ever *shown* from updateAimPreview() (called by
    // js/ui.js whenever it recomputes a trace), but it has to be *hidden*
    // the instant the phase leaves AIM even if ui.js never calls in again —
    // e.g. the moment a shot fires and the camera cuts to FLIGHT.
    if (previewGroup && CAM.phase !== 'AIM') previewGroup.visible = false;

    if (CAM.phase === 'ATTRACT') {
      updateAttract(dt);
    } else if (CAM.phase === 'FLIGHT') {
      updateFlight(dt);
    } else if (CAM.phase === 'IMPACT') {
      CAM.impactT += dt;
      positionAtSeat(dt);
      if (CAM.impactT > IMPACT_HOLD_S) { CAM.phase = 'SETTLE'; CAM.settleT = 0; }
    } else if (CAM.phase === 'SETTLE') {
      CAM.settleT += dt;
      positionAtSeat(dt);
      // Also waits out a still-lingering bolt (see stepLinger()) — the
      // cinematic shouldn't cut away to results while it's still visibly
      // knocking things around.
      const stillMoving = blocks.some((b) => b.alive && !b.mat.static && P.isAwake(b.body)) ||
                           shots.some((s) => !s.resolved)||RT.castleLife.active();
      if ((!stillMoving && CAM.settleT > CFG.SETTLE_MIN) || (CAM.settleT > CFG.SETTLE_MAX && !RT.castleLife.active())) {
        CAM.phase = 'RESULTS'; CAM.resultsT = 0;
      }
    } else if (CAM.phase === 'RESULTS') {
      CAM.resultsT += dt;
      positionAtSeat();   // hold the SETTLE framing
      if (CAM.resultsT > CFG.WIN_PAUSE) advanceAfterShot();
    } else if (CAM.phase === 'RESULTS_MENU') {
      // js/ui.js owns input now (the results overlay) — keep holding the
      // same wrecked-castle framing underneath it until confirmResults()
      // moves on to the next level.
      positionAtSeat();
    } else if (CAM.phase === 'OUTOFBOLTS') {
      if(damageBounds)positionAtSeat();else updateAim();
    } else if (CAM.phase === 'MENU') {
      // Player-invoked, always from AIM (see openMenu()) — same fixed
      // framing underneath, same as OUTOFBOLTS.
      updateAim();
    } else {
      if (CAM.phase !== 'AIM') enterAim();
      updateAimZoom(dt);
    }

    // Reduced movement holds the aim view before the hit, then a fixed damage view.
    if (steadyCameraOn()&&!CAM.targetScene&&!['IMPACT','SETTLE','RESULTS','RESULTS_MENU','OUTOFBOLTS'].includes(CAM.phase)) updateAim();

    updateShake(dt);
  }

  /** Every campaign can be completed with its starting Boulder. */
  function unlockedAmmoAt(levelIx) { return D.AMMO.filter(a=>a.id==='boulder'); }
  /** PROGRESSION ONLY — what the player has earned, same gate as the 2D
   *  version's unlockedAmmo(). Deliberately NOT what a level offers to play
   *  with right now; see availableAmmo() below for that. Kept off the public
   *  RT.game surface at the bottom of this file (only one external consumer
   *  ever existed, js/ui.js's own now-renamed wrapper) so no call site can
   *  reach the un-narrowed list by accident — that mistake would have no
   *  visible symptom until the day a level actually narrows its own list. */
  function unlockedAmmo() { const ids=customLevel?customAmmo:kingdomProgress(liveLevel.kingdomId).ammo;return D.AMMO.filter(a=>ids.includes(a.id)); }

  const _warnedAmmo = new Set();
  function warnOnceAmmo(level, reason) {
    const key = (level && level.name) + '|' + reason;
    if (_warnedAmmo.has(key)) return;
    _warnedAmmo.add(key);
    console.warn('availableAmmo: "' + (level && level.name) + '" ' + reason + ' — falling back to the full unlocked set.');
  }
  /** The intersection, plus the "never present zero ammo" rule the shot
   *  pipeline and the ammo scan lane both assume at least one entry exists.
   *  `warnOnceAmmo` matters here specifically because this sits on the hot
   *  path — every frame a meter is moving calls currentAmmo() ->
   *  availableAmmo() (js/ui.js:709-735) — so a bare console.warn would emit
   *  hundreds per second and bury the message it's trying to deliver. */
  function narrowToLevel(list, level) {
    const ids = level && level.ammo;
    if (ids === undefined || ids === null) return list;   // no field = today's behaviour, byte for byte
    if (!Array.isArray(ids)) { warnOnceAmmo(level, 'has an ammo field that is not an array'); return list; }
    // Filtering D.AMMO (via `list`) rather than mapping over `ids` keeps the
    // result in D.AMMO's canonical order regardless of how the level's own
    // array is ordered — the ammo lane is a scan list, and a chip's POSITION
    // is something a switch-scanning player learns; it must not move between
    // levels just because a level's authored list happens to be in a
    // different order.
    const set = new Set(ids);
    const narrowed = list.filter((a) => set.has(a.id));
    if (narrowed.length) return narrowed;
    warnOnceAmmo(level, 'lists ammo none of which the player has unlocked yet');
    return list;   // never present zero ammo — narrowing can empty a set, never the game
  }
  /** What THIS level actually offers to play with: (the level's own list) ∩
   *  (what progression has unlocked). Narrows, never grants — an early level
   *  can never hand out the Powder Bomb just by listing it. `level` defaults
   *  to whatever is live, the same convention traceShot() already uses. */
  function availableAmmo(level) {
    if(!save.endlessBolts)return D.AMMO.filter(a=>(ammoLeft[a.id]||0)>0);
    const l=level||liveLevel,hasPickups=l.layers.some(layer=>layer.some(row=>[...row].some(ch=>D.MAT[ch]?.pickup)));
    if(!customLevel||hasPickups)return unlockedAmmo();
    return narrowToLevel(D.AMMO,l);
  }
  /** Save-independent form, for auditAmmoOffers() — see that function's own
   *  comment for why it must never depend on `save`. */
  function availableAmmoAt(ix) { return narrowToLevel(unlockedAmmoAt(ix), LV.LEVELS[ix]); }

  function currentLevel() { return liveLevel; }

  /** Every crown still standing, in world x/z — js/ui.js's minimap marks
   *  these as objectives regardless of whether they're actually exposed to
   *  a direct shot right now (a crown can be a legitimate target while
   *  fully hidden behind another layer — see the splash/collateral damage
   *  path). */
  function remainingGoals(){return blocks.filter(b=>b.alive&&RT.levelBrief.isTarget(liveLevel,b.mat)).length+RT.levelBrief.goals(liveLevel).collect.filter(id=>!collectedGoals.has(id)).length;}
  function objectivePositions(){return blocks.filter(b=>b.alive&&(RT.levelBrief.isTarget(liveLevel,b.mat)||(RT.levelBrief.isCollectTarget(liveLevel,b.mat)&&!collectedGoals.has(b.mat.pickup)))).map(b=>({x:b.mesh.position.x,z:b.mesh.position.z}));}

  function crownPositions() {
    return blocks.filter((b) => b.alive && b.mat.crown).map((b) => ({ x: b.mesh.position.x, z: b.mesh.position.z }));
  }

  /** Select-target aim mode's scan list: every alive, non-static block —
   *  steel girders excluded, same "never breaks, go around it" reasoning as
   *  crownPositions() only ever mattering for the destructible ones. Sorted
   *  left-to-right by yaw so a player who already knows the sweep meter
   *  carries the same mental model over, distance as a tiebreaker for two
   *  blocks stacked in depth at the same angle. */
  function targetableBlocks() {
    return blocks
      .filter((b) => b.alive && !b.mat.static && !b.mat.protected)
      .map((b) => ({ x: b.mesh.position.x, y: b.mesh.position.y, z: b.mesh.position.z, matId: b.mat.id, matName: b.mat.name, crown: !!b.mat.crown, w:b.half.x*2, h:b.half.y*2, d:b.half.z*2 }))
      .sort((a, c) => Math.atan2(a.x, -a.z) - Math.atan2(c.x, -c.z) || (Math.hypot(a.x, a.z) - Math.hypot(c.x, c.z)));
  }

  /* ── Results / out-of-bolts overlays ──────────────────────────────────────
   * js/ui.js renders these (the #overlay markup already in index.html) and
   * calls back into whichever of these the player picks. Both just resolve
   * CAM.phase back to 'AIM', which is what lets js/ui.js's existing
   * canAct()-edge-detect (enterShot() on the phase becoming 'AIM') pick the
   * meters back up exactly like it does after any other cinematic.
   */
  function kingdomProgress(id){
    const k=RT.campaigns.find(id);if(!k)return{next:0,cleared:0};
    const p=save.kingdoms[id]||{},valid=n=>Number.isInteger(n)?U.clamp(n,0,k.levels.length):0;
    const next=valid(p.next),ammo=Array.isArray(p.ammo)?p.ammo.filter(id=>D.AMMO.some(a=>a.id===id)):[];
    const results={};for(const ix of k.levels){const l=LV.LEVELS[ix],r=p.results?.[l.id];if(r&&Number.isFinite(r.earned)&&r.earned>=0&&Number.isInteger(r.shots)&&r.shots>=0)results[l.id]={earned:r.earned,shots:r.shots,stars:U.clamp(r.stars||1,1,3)};}
    return{next,cleared:Math.max(next,valid(p.cleared)),ammo:[...new Set(['boulder',...ammo])],results};
  }
  function kingdomScore(id){const results=Object.values(kingdomProgress(id).results||{});return{points:results.reduce((n,r)=>n+r.earned,0),shots:results.reduce((n,r)=>n+r.shots,0),levels:results.length};}
  function collectAmmo(b){
    const id=b.mat.pickup;if(!id||auditing||b.collected)return;const goalCollected=RT.levelBrief.isCollectTarget(liveLevel,b.mat)&&!collectedGoals.has(id);b.collected=true;collectedGoals.add(id);
    const name=D.AMMO.find(a=>a.id===id).name;let unlocked=false;
    if(customLevel){if(!customAmmo.includes(id)){customAmmo.push(id);unlocked=true;}}
    else{const k=RT.campaigns.forLevel(liveLevel),p=kingdomProgress(k.id);if(!p.ammo.includes(id)){p.ammo.push(id);save.kingdoms[k.id]=p;persistSave();unlocked=true;}}
    const count=crateSupply[id]||3;if(!save.endlessBolts)ammoLeft[id]=(ammoLeft[id]||0)+count;
    if(unlocked||!save.endlessBolts||goalCollected){sfx('pickup');RT.effects?.burst(b.mesh.position,{crown:true},true,steadyCameraOn());levelPickups.push(name);document.dispatchEvent(new CustomEvent('ballista-ammo-unlocked',{detail:{id,name,goalCollected,count:save.endlessBolts?null:count}}));}
  }
  function previewKingdom(id){const k=RT.campaigns.find(id);if(!k)return false;loadLevel(k.levels[Math.min(kingdomProgress(id).next,k.levels.length-1)]);enterAim();return true;}
  function startKingdom(id,fresh=false){
    const k=RT.campaigns.find(id);if(!k)return false;
    const p=kingdomProgress(id);if(fresh||p.next===k.levels.length){p.next=0;p.ammo=['boulder'];}
    save.kingdoms[id]=p;save.level=k.levels[p.next];persistSave();loadLevel(save.level);enterAim();return true;
  }
  // Clear only campaign records; control preferences and Workshop castles are separate.
  function resetKingdomProgress(id) {
    const k=RT.campaigns.find(id);if(!k)return false;
    delete save.kingdoms[id];
    for(const ix of k.levels)delete save.stars[LV.LEVELS[ix].id];
    if(k.levels.includes(save.level))save.level=k.levels[0];
    save.totalScore=(save.legacyScore||0)+RT.campaigns.kingdoms.reduce((sum,c)=>sum+kingdomScore(c.id).points,0);
    persistSave();return true;
  }
  function resetAllCampaigns() {
    save.kingdoms={};save.stars={};save.totalScore=0;save.level=0;
    delete save.legacyStars;delete save.legacyScore;
    persistSave();
    // Discard the paused shot too, so continuing it cannot restore erased progress.
    loadLevel(0);enterAim();
  }
  function confirmResults() {
    const k=RT.campaigns.forLevel(liveLevel);
    if(customLevel||!levelWon||!k||liveLevel.order>=k.levels.length-1)return false;
    loadLevel(k.levels[liveLevel.order+1]);enterAim();return true;
  }
  function retryLevel() {
    loadLevel(levelIx, customLevel);
    enterAim();
  }
  /** Diagnostic/authoring jump. Player menus use kingdom checkpoints. */
  function goToLevel(ix) {
    loadLevel(ix);
    enterAim();
  }
  function enableEndlessAndContinue() {
    save.endlessBolts = true;
    persistSave();
    enterAim();   // same wreckage, no rebuild — just allowed to keep firing
  }

  /** The context/pause menu — a third overlay phase alongside RESULTS_MENU/
   *  OUTOFBOLTS, but player-invoked (Return-hold, or the header's Help/
   *  Settings buttons) rather than reached automatically, so it only opens
   *  from AIM rather than interrupting a cinematic. js/ui.js owns which
   *  *screen* within it is showing (root / how-to-play / settings) and
   *  renders all of them through the same #overlay/#panel list machinery. */
  let pausedPhase = 'AIM';
  let exploring=false;
  function setExploring(on){exploring=!!on;if(!exploring)RT.castleLife?.endPreview();}
  function openMenu() { if (CAM.phase !== 'MENU' && CAM.phase !== 'ATTRACT') { pausedPhase = CAM.phase; CAM.phase = 'MENU'; sfx('stopFlight'); } }
  function closeMenu() { setExploring(false); CAM.phase = pausedPhase; if (CAM.phase === 'FLIGHT') sfx('startFlight'); }

  function setMinimapSize(size) {
    if (['large', 'medium', 'none'].indexOf(size) === -1) return;
    save.minimapSize = size;
    persistSave();
  }
  function setSteadyCamera(on) { save.steadyCamera = !!on; persistSave(); }

  function aimModeOn() { return save && save.aimMode !== 'sweep'; }
  function setAimMode(mode) { save.aimMode = ['easy', 'target', 'sweep'].includes(mode) ? mode : 'easy'; persistSave(); }

  /* ── Colour profile ───────────────────────────────────────────────────────
   * index.html has carried four full palettes since the step-2 rewrite, but
   * nothing ever set `data-theme` and nothing ever called onThemeChanged() —
   * so three of the four profiles, High Contrast included, were unreachable.
   * Same shape as FishMaster's getTheme()/setTheme() (game.js:2862 there),
   * which js/ui.js's Settings screen drives.
   */
  function getTheme() { return (save && save.theme) || 'ben'; }
  function setTheme(t) {
    save.theme = t;
    document.body.setAttribute('data-theme', t);
    onThemeChanged();
    persistSave();
  }
  function setAimSounds(on) { save.aimSounds=!!on;persistSave(); }
  function setEasyAim(on) { save.easyAim=!!on;persistSave(); }
  function setEndlessBolts(on) {const changed=save.endlessBolts!==!!on;save.endlessBolts = !!on;if(changed&&!on)resetAmmoLeft();persistSave(); }

  /**
   * Console-driven checks — no results panel or narration for a miss/hit
   * exists yet beyond the "Level cleared" line, so behaviour is verified by
   * hand: fire a shot, read back state, screenshot the outcome. See the
   * ballista-3d plan's verification section for how this gets driven from
   * outside the page via mcp__chrome-devtools__evaluate_script.
   */
  function aimAtPointer(x,y,ammo){
    camera.updateMatrixWorld();const r=renderer.domElement.getBoundingClientRect(),ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((x-r.left)/r.width*2-1,1-(y-r.top)/r.height*2),camera);
    let point=null,nearest=Infinity,target=null;
    for(const b of blocks){if(!b.alive)continue;const inverse=new THREE.Matrix4().compose(b.mesh.position,b.mesh.quaternion,new THREE.Vector3(1,1,1)).invert(),local=ray.ray.clone().applyMatrix4(inverse),p=local.intersectBox(new THREE.Box3(b.half.clone().negate(),b.half),new THREE.Vector3());if(!p)continue;p.applyQuaternion(b.mesh.quaternion).add(b.mesh.position);const distance=p.distanceTo(ray.ray.origin);if(distance<nearest){nearest=distance;point=p;target=b;}}
    if(!point)point=ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),0),new THREE.Vector3());
    if(!point||point.z>=-2)return null;
    const d=Math.hypot(point.x,point.z),v=ammo.speed,g=CFG.GRAVITY,v2=v*v,yawRad=Math.atan2(point.x,-point.z);let phi=null;
    // Correct for the fixed-step integrator's half-step gravity drop.
    let height=point.y-CFG.MUZZLE_Y;
    for(let i=0;i<3;i++){const discriminant=v2*v2-g*(g*d*d+2*height*v2);if(discriminant<0)return{point,reachable:false};phi=Math.atan2(v2+(ammo.lob?1:-1)*Math.sqrt(discriminant),g*d);height=point.y-CFG.MUZZLE_Y+g*(d/(v*Math.cos(phi)))*CFG.DT/2;}
    if(Math.abs(yawRad)>D.yawLimit(liveLevel))return{point,reachable:false};
    const rangePct=D.rangeToPct(liveLevel,D.flatRangeOf(v,phi));const trace=traceShot(ammo,yawRad,rangePct,undefined,phi),last=trace.points[trace.points.length-1];
    return{point,yawRad,rangePct,elevation:phi,reachable:true,blocked:target?trace.hit.block!==target:last.distanceTo(point)>1,trace};
  }

  const __test = {
    loadedAmmo:()=>({id:ballista?.ammoMount.userData.ammo,visible:ballista?.ammoMount.visible,parts:ballista?.ammoMount.children.length}),
    life:()=>RT.castleLife.debug(),
    igniteAt(x,y,z){RT.castleLife.ignite(new THREE.Vector3(x,y,z));},
    narratorState(){return{visible:!!narrator?.visible,name:narrator?.name,style:narrator?.userData.narratorStyle,age:narratorAge,position:narrator?.position.toArray(),mark:narratorMark.toArray(),legs:narrator?.userData.legs.map(l=>l.rotation.x)};},
    blockCount() { return blocks.length; },
    blockSpeed(index) { const b = blocks[index]; return b && b.alive ? P.speed(b.body) : null; },
    blockState() {
      return blocks.map((b) => ({
        alive: b.alive, hp: b.hp, mat: b.mat.id,
        y: b.mesh.position.y, awake: b.alive ? P.isAwake(b.body) : null
      }));
    },
    breakBlock(index,scatterRandom){const b=blocks[index],previous=debrisRandom;try{if(scatterRandom)debrisRandom=scatterRandom;if(b?.alive)destroyBlockRec(b);}finally{debrisRandom=previous;}},
    debrisCount() { return debris.length; },
    debrisStates() {
      return debris.map((r) => ({ mat: r.mat.id, x: r.mesh.position.x, y: r.mesh.position.y, z: r.mesh.position.z }));
    },
    spin(index,x,y,z){const b=blocks[index];if(b?.alive)P.setSpin(b.body,x,y,z);},
    knock(index, vx, vy, vz) {
      const b = blocks[index];
      if (!b || !b.alive) return false;
      P.addVelocity(b.body, vx || 0, vy || 0, vz || 0);
      return true;
    },
    fire(ammoIx, yawDeg, rangePct) {
      const ammo = availableAmmo()[ammoIx];
      if (!ammo) return null;
      const trace = fire(ammo, yawDeg * Math.PI / 180, rangePct);
      return trace && { hit: trace.hit.type, matHit: trace.hit.block ? trace.hit.block.mat.id : null };
    },
    availableAmmoIds() { return availableAmmo().map((a) => a.id); },
    shotCount() { return shots.length; },
    shotDebug() {
      return shots.map((s) => ({
        rolling:!!s.rolling,rollTime:s.lingerT||0,hitCount:s.hitBlocks?.size||0,velocity:s.lingerVel?.toArray(),rotation:s.mesh?.quaternion.toArray(),fragment: !!s.trace.ammo.fragment, matHit: s.trace.hit.block?.mat.id, t: s.t, resolved: s.resolved, points: s.trace.points.length,
        pos: s.mesh ? s.mesh.position.toArray() : null, hit: s.trace.hit.type
      }));
    },
    targetsAlive() { return remainingGoals(); },
    crownsAlive() { return blocks.filter((b) => b.alive && b.mat.crown).length; },
    levelWon() { return levelWon; },
    rangeWindow() { return D.rangeWindow(liveLevel); },
    yawLimitDeg() { return D.yawLimit(liveLevel) * 180 / Math.PI; },
    rebuildCastle() { loadLevel(levelIx); },
    levelCount() { return LV.LEVELS.length; },
    levelIx() { return levelIx; },
    levelName() { return liveLevel ? liveLevel.name : null; },
    loadLevel(ix) { loadLevel(ix); },
    auditLevels, auditLevelData, auditAmmoOffers,
    unlockedAmmo, availableAmmo, availableAmmoAt,
    environmentState:()=>RT.scenery.inspect(world),
    camState() {
      return {
        phase: CAM.phase, shake: CAM.shake,
        impactPoint: CAM.impactPoint.toArray(), seatPos: CAM.seatPos.toArray(),
        camPos: camera.position.toArray()
      };
    },
    isSteadyCamera() { return steadyCameraOn(); },
    setSteadyCamera(on) { setSteadyCamera(on); },
    isReducedMotion() { return REDUCED_MOTION; },
    boltsUsed() { return boltsUsed; },
    levelScore() { return levelScore; },
    save() { return save; },
    lastResult() { return lastResult; },
    ammoLeft() { return Object.assign({}, ammoLeft); },
    /** Diagnostic, not a real audit: world-space AABB overlap between every
     *  pair of alive blocks, shrunk by `epsilon` first so flush resting
     *  contact doesn't count — only genuine interpenetration does. Used to
     *  sanity-check that real multi-layer levels aren't visibly clipping. */
    checkOverlaps(epsilon) {
      const eps = epsilon === undefined ? 0.03 : epsilon;
      const boxes = blocks.filter((b) => b.alive).map((b) => ({
        b: b, box: new THREE.Box3().setFromObject(b.mesh).expandByScalar(-eps)
      }));
      const overlaps = [];
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          if (boxes[i].box.intersectsBox(boxes[j].box)) {
            overlaps.push({
              a: { mat: boxes[i].b.mat.id, pos: boxes[i].b.mesh.position.toArray() },
              b: { mat: boxes[j].b.mat.id, pos: boxes[j].b.mesh.position.toArray() }
            });
          }
        }
      }
      return overlaps;
    },
    pivotRotation() { return ballista ? { y: ballista.pivot.rotation.y, x: ballista.pivot.rotation.x } : null; },
    previewVisible() { return previewGroup ? previewGroup.visible : null; },
    previewDotCount() { return previewDots.length; },
    previewRingPos() { return previewRing ? previewRing.position.toArray() : null; },
    setEndlessBolts(on) { setEndlessBolts(on); },
    resetSave() { save = defaultSave(); persistSave(); }
  };

  return {
    init, loadAttract, update, prepareShotView,beginAimView,showView,zoomView,orbitView,viewState:()=>({zoom:viewZoom,overview,orbit:manualOrbit}), showNarrator, narratorHead, focusTargetScene, aimAtPointer, setLoadedAmmo,
    yawForPointer(x,y) { const r=renderer.domElement.getBoundingClientRect();const dir=new THREE.Vector3((x-r.left)/r.width*2-1,1-(y-r.top)/r.height*2,.5).unproject(camera).sub(camera.position).normalize();if(Math.abs(dir.z)<.001)return 0;const t=(-liveLevel.dist-camera.position.z)/dir.z;const hitX=camera.position.x+dir.x*t;return U.clamp(Math.atan2(hitX,liveLevel.dist),-D.yawLimit(liveLevel),D.yawLimit(liveLevel)); },
    projectTarget(point) { camera.updateMatrixWorld();const p=point.clone().project(camera);return {x:p.x,y:p.y,z:p.z}; },
    onThemeChanged, isFlat,
    availableAmmo, ammoRemaining, shotsRemaining, currentLevel, crownPositions, objectivePositions, remainingGoals, targetableBlocks, fire, traceShot, updateAimPreview,
    confirmResults, retryLevel, goToLevel, enableEndlessAndContinue, kingdomProgress, kingdomScore, previewKingdom, startKingdom, resetKingdomProgress, resetAllCampaigns,
    playCustom(raw) { customAmmo=['boulder'];loadLevel(levelIx, RT.courses.prepare(raw)); enterAim(); },
    isCustom() { return !!customLevel; },
    rescueFailed() { return rescueFailed; },
    openMenu, closeMenu, setMinimapSize, setSteadyCamera, setEndlessBolts, steadyCameraOn,
    getTheme, setTheme, aimModeOn, setAimMode, setEasyAim, setAimSounds,
    setExploring,
    exploreView(index) { const names=['Front view','Right view','Back view','Left view','Overhead view'],angle=[.18,Math.PI/2,Math.PI,-Math.PI/2,0][index];const frame=castleFrame(index===4?new THREE.Vector3(0,1,.12):new THREE.Vector3(Math.sin(angle),.36,Math.cos(angle)));camera.position.copy(frame.position);camera.lookAt(frame.look);return names[index]; },
    showcase() { if (!liveLevel) return; camera.position.set(17, 10, -liveLevel.dist + 23); camera.lookAt(-5, 2.5, -liveLevel.dist); },
    get CAM() { return CAM; },
    get levelIx() { return levelIx; },
    get lastResult() { return lastResult; },
    get boltsUsed() { return boltsUsed; },
    get levelScore() { return levelScore; },
    get save() { return save; },
    __test: __test
  };
})();
