/**
 * Benny's P3GL — the board renderer.
 *
 * Draws a P3.Match: glossy instanced pegs and bricks with soft shadows and
 * glow halos, goal markers, balls with light trails, the launcher, the base
 * plate (its Catch / Bounce state is shown by shape and colour, never colour
 * alone), the aim guide and the bonus slots. Orthographic camera, board
 * pixels, y up: board point (x, y) sits at world (x, -y).
 *
 *   const board = P3.board.create(renderer)
 *   board.setLayout(L) · board.setTheme(themeId, modeId) · board.load(match)
 *   board.update(dt, t) every frame · board.setAim(deg) · board.setGuide(pred|null)
 *   board.react(event) for match events that change how a body looks
 *   board.shake(px) · board.focus(x, y, zoom) · board.unfocus()
 */
(function (root) {
  'use strict';

  const P3 = root.P3 = root.P3 || {};
  const C = P3.catalog, U = P3.util;
  const B = C.BOARD;

  function create(renderer) {
    const THREE = root.THREE;
    const A = P3.art;
    A.init(THREE);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(0, B.W, 0, -B.H, 1, 2000);
    camera.position.set(0, 0, 900);

    /* ── Lights ─────────────────────────────────────────────────────────── */
    const hemi = new THREE.HemisphereLight(0xffffff, 0x404060, 0.5);
    const key = new THREE.DirectionalLight(0xffffff, 1.8);
    key.position.set(-0.45, 0.55, 0.7);
    const rim = new THREE.DirectionalLight(0xffffff, 0.6);
    rim.position.set(0.7, -0.35, 0.45);
    scene.add(hemi, key, rim);

    /* ── Board frame ────────────────────────────────────────────────────── */
    const frame = new THREE.Group();
    scene.add(frame);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(B.W, B.H + 40), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false }));
    glass.position.set(B.W / 2, -B.H / 2 + 20, -60);
    glass.renderOrder = -5;
    frame.add(glass);
    const railMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    const rails = [];
    [[-4, -B.H / 2, 8, B.H + 60], [B.W + 4, -B.H / 2, 8, B.H + 60], [B.W / 2, 4, B.W + 16, 8]].forEach(([x, y, w, h]) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), railMat);
      m.position.set(x, y, -20); frame.add(m); rails.push(m);
    });
    // Soft glow strips along the rails (additive halos).
    const railGlowMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, map: (() => {
      const c = document.createElement('canvas'); c.width = 64; c.height = 4;
      const g = c.getContext('2d'); const grd = g.createLinearGradient(0, 0, 64, 0);
      grd.addColorStop(0, 'rgba(255,255,255,0)'); grd.addColorStop(0.5, 'rgba(255,255,255,1)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd; g.fillRect(0, 0, 64, 4); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    })() });
    [[-4, 60], [B.W + 4, 60]].forEach(([x, w]) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, B.H + 60), railGlowMat); m.position.set(x, -B.H / 2, -21); frame.add(m); });

    /* ── Launcher ───────────────────────────────────────────────────────── */
    const launcher = new THREE.Group();
    launcher.position.set(B.LAUNCH_X, -B.LAUNCH_Y, 20);
    scene.add(launcher);
    const metal = new THREE.MeshStandardMaterial({ color: 0xd8dde8, metalness: 0.85, roughness: 0.28 });
    const accentMat = new THREE.MeshStandardMaterial({ color: 0xff66aa, metalness: 0.3, roughness: 0.35, emissive: 0x000000 });
    // A bracket hangs from the top rail; the hub pivots; the barrel points where you aim.
    const bracket = new THREE.Mesh(new THREE.CylinderGeometry(48, 48, 10, 40, 1, false, Math.PI / 2, Math.PI), accentMat);
    bracket.rotation.x = Math.PI / 2;
    bracket.position.set(0, 0, -6);
    const bracketRim = new THREE.Mesh(new THREE.TorusGeometry(48, 3.5, 8, 40, Math.PI), metal);
    bracketRim.rotation.z = 0;
    bracketRim.position.set(0, 0, 0);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(21, 32, 16), metal);
    const collar = new THREE.Mesh(new THREE.TorusGeometry(24, 4, 12, 40), accentMat);
    const barrel = new THREE.Group();
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(15, 18, 60, 28, 1, false), metal);
    tube.position.y = -34;
    const band = new THREE.Mesh(new THREE.TorusGeometry(17.5, 3, 10, 28), accentMat);
    band.position.y = -22; band.rotation.x = Math.PI / 2;
    const muzzleRing = new THREE.Mesh(new THREE.TorusGeometry(17, 4.5, 10, 28), accentMat);
    muzzleRing.position.y = -64; muzzleRing.rotation.x = Math.PI / 2;
    const loaded = new THREE.Mesh(new THREE.SphereGeometry(11, 24, 16), new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.12 }));
    loaded.position.set(0, -64, 14);
    barrel.add(tube, band, muzzleRing, loaded);
    launcher.add(bracket, bracketRim, barrel, dome, collar);
    // Power badges orbiting the launcher (saved next-shot powers).
    const badgeGroup = new THREE.Group();
    launcher.add(badgeGroup);

    /* ── Instanced layers ───────────────────────────────────────────────── */
    const MAXI = 360;
    const quad = A.quadGeometry();
    function quadLayer(blend, renderOrder, depthTest) {
      const geo = quad.clone();
      const tile = new THREE.InstancedBufferAttribute(new Float32Array(MAXI * 2), 2);
      const tint = new THREE.InstancedBufferAttribute(new Float32Array(MAXI * 3), 3);
      const alpha = new THREE.InstancedBufferAttribute(new Float32Array(MAXI), 1);
      geo.setAttribute('aTile', tile); geo.setAttribute('aTint', tint); geo.setAttribute('aAlpha', alpha);
      const mesh = new THREE.InstancedMesh(geo, A.atlasMaterial(blend, { depthTest }), MAXI);
      mesh.count = 0; mesh.frustumCulled = false; mesh.renderOrder = renderOrder;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(mesh);
      return { mesh, tile, tint, alpha, n: 0 };
    }
    const shadows = quadLayer('normal', 1, true);
    const halos = quadLayer('add', 3, false);
    const symbols = quadLayer('normal', 6, true);
    const marks = quadLayer('add', 7, false);       // goal rings
    const guideDots = quadLayer('add', 8, false);

    function solidLayer(geo, mat) {
      const g = geo.clone();
      const glow = new THREE.InstancedBufferAttribute(new Float32Array(MAXI), 1);
      g.setAttribute('aGlow', glow);
      const mesh = new THREE.InstancedMesh(g, mat, MAXI);
      mesh.count = 0; mesh.frustumCulled = false; mesh.renderOrder = 2;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.setColorAt(0, new THREE.Color(1, 1, 1));
      scene.add(mesh);
      return { mesh, glow, n: 0 };
    }
    const layers = {
      peg: solidLayer(A.pegGeometry(), A.glowStandard({ roughness: 0.22, metalness: 0.05 })),
      metal: solidLayer(A.pegGeometry(), A.glowStandard({ roughness: 0.3, metalness: 0.9 })),
      gem: solidLayer(A.gemGeometry(), A.glowStandard({ roughness: 0.06, metalness: 0.35, flatShading: true })),
      lantern: solidLayer(A.lanternGeometry(), A.glowStandard({ roughness: 0.75, metalness: 0 })),
      bumper: solidLayer(A.bumperGeometry(), A.glowStandard({ roughness: 0.18, metalness: 0.2 })),
      spike: solidLayer(A.spikeGeometry(), A.glowStandard({ roughness: 0.25, metalness: 0.7 })),
      portal: solidLayer(A.ringGeometry(), A.glowStandard({ roughness: 0.3, metalness: 0.4 }))
    };
    const brickLayers = {};       // by size key
    const brickMat = A.glowStandard({ roughness: 0.32, metalness: 0.08 });
    const glassMat = A.glowStandard({ roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.45 });

    // Black holes: a few individual swirl discs.
    const holeMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { time: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float time; varying vec2 vUv;
        void main(){
          vec2 p = vUv * 2.0 - 1.0; float r = length(p); float a = atan(p.y, p.x);
          float swirl = sin(a * 3.0 + time * 3.0 - r * 9.0) * 0.5 + 0.5;
          float ring = smoothstep(0.42, 0.62, r) * smoothstep(1.0, 0.62, r);
          vec3 c = mix(vec3(0.35, 0.1, 0.9), vec3(1.0, 0.45, 1.0), swirl) * ring * 2.4;
          float core = smoothstep(0.46, 0.3, r);
          float alpha = max(ring * (0.55 + swirl * 0.45), core);
          gl_FragColor = vec4(c * (1.0 - core), alpha * smoothstep(1.0, 0.85, r));
        }`
    });
    const holeMeshes = [];
    // Portal centres: swirling discs.
    const portalDiscMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { time: { value: 0 }, color: { value: new THREE.Color(1, 1, 1) } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float time; uniform vec3 color; varying vec2 vUv;
        void main(){ vec2 p = vUv*2.0-1.0; float r = length(p); float a = atan(p.y,p.x);
          float s = sin(a*4.0 - time*5.0 + r*10.0)*0.5+0.5;
          gl_FragColor = vec4(color * (0.6 + s) * 1.6, smoothstep(1.0, 0.2, r) * 0.8); }`
    });
    const portalDiscs = [];

    /* ── Balls ──────────────────────────────────────────────────────────── */
    const ballGeo = new THREE.SphereGeometry(1, 28, 18);
    const ballPool = [];
    const trailPool = [];
    const TRAIL_N = 22;
    function ballMesh(i) {
      if (ballPool[i]) return ballPool[i];
      const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1.0, roughness: 0.12, emissive: 0x000000 });
      const m = new THREE.Mesh(ballGeo, mat);
      m.renderOrder = 9;
      scene.add(m);
      const halo = new THREE.Mesh(quad, new THREE.MeshBasicMaterial({ map: A.buildAtlas().texture, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: 0xffffff }));
      setQuadUV(halo.geometry = quad.clone(), 'halo');
      halo.renderOrder = 8;
      scene.add(halo);
      // Light trail: a ribbon.
      const tg = new THREE.BufferGeometry();
      tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_N * 2 * 3), 3));
      tg.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(TRAIL_N * 2), 1));
      const idx = [];
      for (let k = 0; k < TRAIL_N - 1; k++) { const a = k * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      tg.setIndex(idx);
      const tm = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { color: { value: new THREE.Color(1, 1, 1) } },
        vertexShader: 'attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: 'uniform vec3 color; varying float vA; void main(){ gl_FragColor = vec4(color, vA); }'
      });
      const trail = new THREE.Mesh(tg, tm);
      trail.frustumCulled = false; trail.renderOrder = 7;
      scene.add(trail);
      ballPool[i] = { mesh: m, halo, trail, hist: [], id: -1 };
      return ballPool[i];
    }
    function setQuadUV(geo, tileName) {
      const [u0, v0] = A.tileUV(tileName), s = 1 / 8;
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * s, v0 + uv.getY(i) * s);
      uv.needsUpdate = true;
    }

    /* ── Plate ──────────────────────────────────────────────────────────── */
    const plate = new THREE.Group();
    scene.add(plate);
    const plateMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.3, roughness: 0.3, emissive: 0x000000 });
    let plateBar = null, plateW = 0;
    const lipMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.4, roughness: 0.3 });
    const lips = [0, 1].map(() => { const m = new THREE.Mesh(new THREE.CapsuleGeometry(5, 18, 4, 10), lipMat); plate.add(m); return m; });
    const springs = [];
    const springMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.9, roughness: 0.25 });
    for (let i = 0; i < 3; i++) { const s = new THREE.Mesh(new THREE.TorusGeometry(6, 1.6, 6, 16), springMat); s.rotation.x = Math.PI / 2; plate.add(s); springs.push(s); }
    const plateTimer = new THREE.Mesh(new THREE.PlaneGeometry(1, 3), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
    plate.add(plateTimer);
    const plateGlow = new THREE.Mesh(quad.clone(), new THREE.MeshBasicMaterial({ map: A.buildAtlas().texture, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    setQuadUV(plateGlow.geometry, 'halo');
    plate.add(plateGlow);

    /* ── Bonus slots (the finale) ───────────────────────────────────────── */
    const slots = new THREE.Group();
    slots.visible = false;
    scene.add(slots);
    let slotMeshes = [];

    /* ── State ──────────────────────────────────────────────────────────── */
    let match = null, theme = null, modeId = 'vivid';
    let entries = [];        // per body render state
    let introT = 0;
    let aimDeg = 0, aimShown = 0;
    let guide = null, guideColor = new THREE.Color('#ffffff'), guideScale = 1;
    let shakeAmt = 0, shakeT = 0, reduced = false;
    const focusState = { k: 1, x: B.W / 2, y: B.H / 2, target: 1, tx: B.W / 2, ty: B.H / 2 };
    let layout = null;
    let backdropLevel = 1;   // 0 clear, 1 dim (theme), 2 dark
    const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3(), tmpE = new THREE.Euler(), tmpC = new THREE.Color();
    const Z = new THREE.Vector3(0, 0, 1);

    function colorFor(body) {
      const it = body.item;
      if (body.t === 'peg') return C.PEG_COLORS[it.c || 'blue'].hex;
      if (body.t === 'key' || body.t === 'gate') return C.PEG_COLORS[it.k || 'blue'].hex;
      if (body.t === 'portal') return C.PORTAL_COLORS[it.p || 0];
      if (body.t === 'brick') return C.BRICK_HP[Math.max(1, Math.min(4, body.hp === undefined ? it.hp || 1 : body.hp))].hex;
      return C.TYPES[body.t].color || '#cccccc';
    }

    function layerFor(t) {
      if (t === 'steel') return 'metal';
      if (t === 'gem') return 'gem';
      if (t === 'lantern') return 'lantern';
      if (t === 'bumper') return 'bumper';
      if (t === 'spike') return 'spike';
      if (t === 'portal') return 'portal';
      if (t === 'hole') return null;
      return 'peg';
    }

    function symbolFor(body) {
      const t = body.t;
      if (t === 'peg') return match && match.isTarget(body) && match.goal.type === 'color' ? 'target' : null;
      if (t === 'gem' || t === 'spike' || t === 'hole' || t === 'portal' || t === 'lantern' || t === 'bumper') return null;
      if (t === 'brick') return 'hp' + Math.max(1, Math.min(4, body.hp === undefined ? body.item.hp || 1 : body.hp));
      if (t === 'steel') return 'steel';
      return t;
    }

    function brickLayer(w, h, isGlass) {
      const k = (isGlass ? 'g' : 'b') + Math.round(w) + 'x' + Math.round(h);
      if (!brickLayers[k]) {
        const L = solidLayer(A.brickGeometry(w, h), isGlass ? glassMat : brickMat);
        brickLayers[k] = L;
      }
      return brickLayers[k];
    }

    /** Build render entries for every body of a match. */
    function load(m) {
      match = m;
      entries = [];
      Object.values(layers).forEach(L => { L.n = 0; L.mesh.count = 0; });
      Object.values(brickLayers).forEach(L => { L.n = 0; L.mesh.count = 0; });
      [shadows, halos, symbols, marks].forEach(L => { L.n = 0; L.mesh.count = 0; });
      holeMeshes.forEach(h => { scene.remove(h); h.geometry.dispose(); }); holeMeshes.length = 0;
      portalDiscs.forEach(h => { scene.remove(h); h.geometry.dispose(); h.material.dispose(); }); portalDiscs.length = 0;
      for (const body of m.bodies) {
        const e = { body, layer: null, li: -1, sym: -1, sh: -1, halo: -1, mark: -1, glow: 0, glowT: 0, flash: 0, bump: 0, pop: 0, popping: false, gone: !body.alive, appear: 0, crack: 0, shake: 0 };
        if (body.shape === 'brick') {
          const L = brickLayer(body.hw * 2, body.hh * 2, body.t === 'glass');
          e.layer = L; e.li = L.n++;
        } else if (body.t === 'hole') {
          const h = new THREE.Mesh(new THREE.PlaneGeometry(body.r * 4.2, body.r * 4.2), holeMat);
          h.renderOrder = 4; scene.add(h); holeMeshes.push(h); e.holeMesh = h;
          // The pull field, drawn faintly so players can see where it reaches.
          const f = new THREE.Mesh(new THREE.RingGeometry(body.r * 5.0, body.r * 5.2, 64), new THREE.MeshBasicMaterial({ color: 0x9a6bff, transparent: true, opacity: 0.22, depthWrite: false }));
          f.renderOrder = 4; scene.add(f); holeMeshes.push(f); e.fieldMesh = f;
        } else {
          const L = layers[layerFor(body.t)];
          e.layer = L; e.li = L.n++;
          if (body.t === 'portal') {
            const d = new THREE.Mesh(new THREE.CircleGeometry(body.r * 0.86, 32), portalDiscMat.clone());
            d.material.uniforms.color.value = new THREE.Color(colorFor(body));
            d.renderOrder = 3; scene.add(d); portalDiscs.push(d); e.disc = d;
          }
        }
        e.sh = shadows.n++;
        e.halo = halos.n++;
        const sym = symbolFor(body);
        if (sym || body.shape === 'brick') e.sym = symbols.n++;
        e.symName = sym;
        e.mark = marks.n++;
        if (e.layer) e.layer.mesh.setColorAt(e.li, tmpC.set(colorFor(body)));
        entries.push(e);
      }
      Object.values(layers).forEach(L => { L.mesh.count = L.n; if (L.mesh.instanceColor) L.mesh.instanceColor.needsUpdate = true; });
      Object.values(brickLayers).forEach(L => { L.mesh.count = L.n; if (L.mesh.instanceColor) L.mesh.instanceColor.needsUpdate = true; });
      [shadows, halos, symbols, marks].forEach(L => { L.mesh.count = L.n; });
      buildPlate();
      slots.visible = false;
      introT = 0;
      guide = null;
      update(0, 0);
    }

    function buildPlate() {
      if (!match) return;
      const P = match.world.plate;
      if (plateBar && plateW === P.w) return;
      if (plateBar) { plate.remove(plateBar); plateBar.geometry.dispose(); }
      plateW = P.w;
      plateBar = new THREE.Mesh(new THREE.CapsuleGeometry(P.h / 2, Math.max(1, P.w - P.h), 6, 20), plateMat);
      plateBar.rotation.z = Math.PI / 2;
      plate.add(plateBar);
      lips[0].position.set(-P.w / 2 + 6, 14, 6); lips[1].position.set(P.w / 2 - 6, 14, 6);
      springs.forEach((s, i) => s.position.set((i - 1) * P.w * 0.28, -14, 4));
      plateGlow.scale.set(P.w * 1.5, 70, 1);
      plateGlow.position.set(0, 0, -2);
    }

    /* ── Theme ──────────────────────────────────────────────────────────── */
    function setTheme(themeId, mode) {
      theme = P3.themes.theme(themeId);
      modeId = mode || theme.mode;
      const env = A.environment(renderer, theme);
      scene.environment = env;
      glass.material.color.set(theme.glass);
      applyBackdrop();
      railMat.color.copy(A.col(theme.rail, 1.5));
      railGlowMat.color.copy(A.col(theme.rail, 1));
      accentMat.color.set(theme.accent);
      accentMat.emissive.copy(A.col(theme.accent, 0.35));
      hemi.color.set(theme.sky[2]); hemi.groundColor.set(theme.sky[0]);
      rim.color.set(theme.accent2);
      key.intensity = modeId === 'hyper' ? 1.5 : 1.8;
      Object.values(layers).forEach(Lr => { Lr.mesh.material.envMapIntensity = 0.55; });
      brickMat.envMapIntensity = 0.5;
    }

    function setBackdrop(level) { backdropLevel = level; applyBackdrop(); }
    function applyBackdrop() {
      if (!theme) return;
      const base = theme.glassAlpha;
      // HDR scenery needs a substantial tint to keep small phone pegs readable.
      glass.material.opacity = backdropLevel === 0 ? Math.max(0.12, base * 0.45) : backdropLevel === 2 ? 1 : 0.92;
    }

    /* ── Layout ─────────────────────────────────────────────────────────── */
    function setLayout(L) { layout = L; applyCamera(); }
    function applyCamera() {
      if (!layout) return;
      const f = P3.layout.frustum(layout);
      const k = focusState.k;
      // Zoom about the focus point (board coords → world y is negative).
      const fx = focusState.x, fy = -focusState.y;
      camera.left = fx + (f.left - fx) / k; camera.right = fx + (f.right - fx) / k;
      camera.top = fy + (f.top - fy) / k; camera.bottom = fy + (f.bottom - fy) / k;
      const sx = shakeAmt ? (Math.sin(shakeT * 61) + Math.sin(shakeT * 37)) * 0.5 * shakeAmt : 0;
      const sy = shakeAmt ? (Math.cos(shakeT * 53) + Math.sin(shakeT * 29)) * 0.5 * shakeAmt : 0;
      camera.position.set(sx, sy, 900);
      camera.updateProjectionMatrix();
    }

    /* ── Per-frame ──────────────────────────────────────────────────────── */

    function setQuad(L, i, x, y, z, sx, sy, rot, tile, r, g, b, a) {
      tmpE.set(0, 0, rot || 0); tmpQ.setFromEuler(tmpE);
      tmpP.set(x, y, z); tmpS.set(sx, sy, 1);
      tmpM.compose(tmpP, tmpQ, tmpS);
      L.mesh.setMatrixAt(i, tmpM);
      const uv = A.tileUV(tile);
      L.tile.setXY(i, uv[0], uv[1]);
      L.tint.setXYZ(i, r, g, b);
      L.alpha.setX(i, a);
    }

    function update(dt, t) {
      if (!match) return;
      introT += dt;
      const time = t || 0;
      // Camera effects.
      if (shakeAmt > 0) { shakeT += dt; shakeAmt = Math.max(0, shakeAmt - dt * shakeAmt * 4 - dt * 2); }
      focusState.k = U.damp(focusState.k, focusState.target, 5, dt);
      focusState.x = U.damp(focusState.x, focusState.tx, 5, dt);
      focusState.y = U.damp(focusState.y, focusState.ty, 5, dt);
      applyCamera();

      const pulse = 0.5 + 0.5 * Math.sin(time * 4.2);
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i], b = e.body;
        // Appear: pegs pop in, staggered by height, at level start.
        const appearAt = 0.15 + (b.by / B.H) * 0.55 + (i % 7) * 0.012;
        const ap = U.clamp((introT - appearAt) / 0.35, 0, 1);
        const appear = reduced || introT > 2 ? 1 : U.easeOutBack(ap);
        // Glow eases toward lit; a flash spikes on the hit.
        const lit = b.lit && b.alive;
        e.glow = U.damp(e.glow, lit ? (b.t === 'lantern' ? 1.6 : 1.15) : 0, 10, dt);
        e.flash = Math.max(0, e.flash - dt * 3);
        e.bump = Math.max(0, e.bump - dt * 4);
        e.shake = Math.max(0, e.shake - dt * 6);
        let scale = appear * (1 + Math.sin(e.bump * Math.PI) * 0.22 * e.bump);
        let gone = !b.alive;
        if (e.popping) {
          e.pop += dt / 0.2;
          if (e.pop >= 1) { e.popping = false; e.gone = true; }
          else scale *= 1 + e.pop * 0.35, gone = false;
        } else if (gone) e.gone = true;
        if (gone && !e.popping) scale = 0;
        const visible = scale > 0.001;
        const glowV = e.glow + e.flash * 1.8;
        const x = b.x, y = -b.y;
        const jitter = !reduced && e.shake ? Math.sin(time * 90 + i) * 2.5 * e.shake : 0;

        if (e.layer) {
          if (b.shape === 'brick') {
            tmpE.set(0, 0, -b.a); tmpQ.setFromEuler(tmpE);
            tmpP.set(x + jitter, y, 0); tmpS.set(visible ? scale : 0.0001, visible ? scale : 0.0001, visible ? scale : 0.0001);
          } else {
            const r = b.r;
            const spin = b.t === 'gem' ? time * 0.6 + i : b.t === 'spike' ? time * 0.4 : b.t === 'portal' ? -time * 1.5 : 0;
            tmpE.set(0, 0, spin - (b.a || 0)); tmpQ.setFromEuler(tmpE);
            const s = visible ? r * scale : 0.0001;
            tmpP.set(x + jitter, y, 0); tmpS.set(s, s, s);
          }
          tmpM.compose(tmpP, tmpQ, tmpS);
          e.layer.mesh.setMatrixAt(e.li, tmpM);
          e.layer.glow.setX(e.li, glowV + (b.t === 'bumper' ? 0.15 : 0) + (b.t === 'portal' ? 0.8 : 0));
          if (e.recolor) { e.layer.mesh.setColorAt(e.li, tmpC.set(colorFor(b))); e.layer.mesh.instanceColor.needsUpdate = true; e.recolor = false; }
        }
        if (e.holeMesh) {
          e.holeMesh.position.set(x, y, 2); e.holeMesh.rotation.z = -time * 0.8; e.holeMesh.scale.setScalar(Math.max(0.0001, appear));
          e.fieldMesh.position.set(x, y, 1); e.fieldMesh.material.opacity = 0.12 + 0.1 * pulse;
          holeMat.uniforms.time.value = time;
        }
        if (e.disc) { e.disc.position.set(x, y, 6); e.disc.material.uniforms.time.value = time; e.disc.scale.setScalar(Math.max(0.0001, appear)); }

        // Shadow (offset down-right, soft).
        const sr = b.shape === 'brick' ? Math.max(b.hw, b.hh) * 2.3 : b.r * 2.7;
        setQuad(shadows, e.sh, x + 5, y - 7, -30, visible ? sr * (b.shape === 'brick' ? 1 : 1) : 0.0001, visible ? (b.shape === 'brick' ? sr * (b.hh / Math.max(b.hw, b.hh)) * 1.2 : sr) : 0.0001, b.shape === 'brick' ? -b.a : 0, 'shadow', 0, 0, 0, b.t === 'hole' ? 0 : 0.42);

        // Halo when lit (and a soft standing glow on lanterns/bumpers/portals).
        const hcol = tmpC.set(colorFor(b));
        const haloA = visible ? U.clamp(glowV * 0.55, 0, 1.4) : 0;
        const hs = b.shape === 'brick' ? Math.max(b.hw, b.hh) * 2.4 : b.r * (3.2 + e.flash * 1.4);
        setQuad(halos, e.halo, x, y, 10, hs, hs, 0, 'halo', hcol.r * 1.4, hcol.g * 1.4, hcol.b * 1.4, haloA);

        // Symbols.
        if (e.sym >= 0) {
          let name = symbolFor(b);
          if (b.shape === 'brick' && b.t === 'brick') name = 'hp' + Math.max(1, Math.min(4, b.hp === undefined ? b.item.hp || 1 : b.hp));
          const bright = 1 + glowV * 0.6;
          if (b.shape === 'brick') {
            const hh = b.hh * 2, ss = Math.min(hh * 1.25, b.hw * 2 * 0.9);
            setQuad(symbols, e.sym, x + jitter, y, 14, visible ? ss * scale : 0.0001, visible ? ss * scale : 0.0001, -b.a, name || 'crack', bright, bright, bright, name ? 1 : 0);
          } else {
            const ss = b.r * (name === 'target' ? 2.3 : 1.55) * scale;
            setQuad(symbols, e.sym, x + jitter, y, b.r * 0.66 + 2, visible ? ss : 0.0001, visible ? ss : 0.0001, 0, name || 'target', bright, bright, bright, name ? 1 : 0);
          }
        }

        // Goal ring: pulsing around anything the goal still needs.
        const open = match.isOpenTarget(b) && !e.popping;
        const ms = (b.shape === 'brick' ? Math.max(b.hw, b.hh) * 2.6 : b.r * 2.9) * (1 + pulse * 0.12);
        const mcol = tmpC.set(theme ? theme.glow : '#ffffff');
        setQuad(marks, e.mark, x, y, 16, ms, ms, 0, 'ringTile', mcol.r * 1.2, mcol.g * 1.2, mcol.b * 1.2, open && visible && introT > 1.2 ? 0.28 + pulse * 0.32 : 0);
      }
      Object.values(layers).concat(Object.values(brickLayers)).forEach(L => { if (L.n) { L.mesh.instanceMatrix.needsUpdate = true; L.glow.needsUpdate = true; } });
      [shadows, halos, symbols, marks].forEach(L => { L.mesh.instanceMatrix.needsUpdate = true; L.tile.needsUpdate = true; L.tint.needsUpdate = true; L.alpha.needsUpdate = true; });

      updateBalls(dt, time);
      updatePlate(dt, time);
      updateLauncher(dt, time);
      updateGuide(time);
      updateSlots(dt, time);
    }

    function updateBalls(dt, time) {
      const balls = match.world.balls;
      const used = new Set();
      balls.forEach((ball, i) => {
        const P = ballMesh(i);
        used.add(i);
        if (P.id !== ball.id) { P.id = ball.id; P.hist.length = 0; }
        const x = ball.x, y = -ball.y;
        P.mesh.visible = true; P.halo.visible = true; P.trail.visible = true;
        P.mesh.position.set(x, y, 26);
        P.mesh.scale.setScalar(ball.r);
        const fire = ball.fireUntil > ball.age, net = ball.netUntil > ball.age;
        const em = fire ? [1.6, 0.5, 0.1] : ball.blast ? [1.2, 0.2, 0.25 + 0.3 * Math.sin(time * 18)] : net ? [0.5, 0.5, 0.55] : [0, 0, 0];
        P.mesh.material.emissive.setRGB(em[0], em[1], em[2]);
        P.halo.position.set(x, y, 24);
        P.halo.scale.setScalar(ball.r * (fire ? 7 : 4.2));
        const hc = fire ? [1.6, 0.6, 0.2] : theme ? new THREE.Color(theme.glow).toArray() : [1, 1, 1];
        P.halo.material.color.setRGB(hc[0] * 0.5, hc[1] * 0.5, hc[2] * 0.5);
        // Trail.
        P.hist.unshift(x, y);
        if (P.hist.length > TRAIL_N * 2) P.hist.length = TRAIL_N * 2;
        const pos = P.trail.geometry.attributes.position, al = P.trail.geometry.attributes.alpha;
        const n = P.hist.length / 2;
        for (let k = 0; k < TRAIL_N; k++) {
          const kk = Math.min(k, n - 1);
          const px = P.hist[kk * 2], py = P.hist[kk * 2 + 1];
          const qx = P.hist[Math.min(kk + 1, n - 1) * 2], qy = P.hist[Math.min(kk + 1, n - 1) * 2 + 1];
          let dx = px - qx, dy = py - qy; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
          const w = ball.r * 0.9 * (1 - k / TRAIL_N);
          pos.setXYZ(k * 2, px - dy * w, py + dx * w, 18);
          pos.setXYZ(k * 2 + 1, px + dy * w, py - dx * w, 18);
          const a = k < n ? (1 - k / TRAIL_N) * (fire ? 0.9 : 0.55) : 0;
          al.setX(k * 2, a); al.setX(k * 2 + 1, a);
        }
        pos.needsUpdate = true; al.needsUpdate = true;
        P.trail.material.uniforms.color.value.setRGB(...(fire ? [1.6, 0.55, 0.15] : (theme ? new THREE.Color(theme.glow).multiplyScalar(1.3).toArray() : [1.3, 1.3, 1.3])));
      });
      ballPool.forEach((P, i) => { if (!used.has(i) && P) { P.mesh.visible = false; P.halo.visible = false; P.trail.visible = false; P.id = -1; } });
    }

    function updatePlate(dt, time) {
      const P = match.world.plate;
      buildPlate();
      const off = match.world.plateOff;
      plate.visible = !off;
      if (off) return;
      plate.position.set(P.x, -P.y, 12);
      const st = P.state;
      const catchCol = A.col('#3ddc97', 1), bounceCol = A.col('#ff7a3d', 1);
      const target = st === 'catch' ? catchCol : bounceCol;
      plateMat.color.lerp(target, 1 - Math.exp(-12 * dt));
      plateMat.emissive.copy(plateMat.color).multiplyScalar(0.45);
      // Shape tells the state too: catch raises lips (a cup), bounce shows springs.
      const lipT = st === 'catch' ? 1 : 0;
      lips.forEach(l => { l.scale.y = U.damp(l.scale.y, Math.max(0.01, lipT), 12, dt); l.visible = l.scale.y > 0.05; lipMat.color.copy(plateMat.color); });
      springs.forEach((s, i) => { const k = U.damp(s.scale.x, st === 'bounce' ? 1 : 0.01, 12, dt); s.scale.set(k, k, k); s.visible = k > 0.05; s.position.y = -14 + Math.sin(time * 9 + i) * 1.5; });
      plateGlow.material.color.copy(plateMat.color).multiplyScalar(0.5);
      // Timed plate: a bar showing time until it switches.
      if (P.mode === 'timed') {
        const frac = 1 - ((match.world.t / P.period) % 1);
        plateTimer.visible = true;
        plateTimer.scale.set(Math.max(1, (P.w - 24) * frac), 1, 1);
        plateTimer.position.set(-(P.w - 24) * (1 - frac) / 2, 0, 14);
        plateTimer.material.color.setRGB(2, 2, 2);
      } else plateTimer.visible = false;
    }

    function updateLauncher(dt, time) {
      aimShown = U.damp(aimShown, aimDeg, 22, dt);
      barrel.rotation.z = U.rad(aimShown);
      const ready = match.phase === 'aim' && match.ballsLeft > 0;
      loaded.visible = ready;
      loaded.material.emissive.setRGB(0, 0, 0);
      collar.rotation.z = time * 0.6;
      accentMat.emissiveIntensity = ready ? 1 + 0.5 * Math.sin(time * 3) : 0.6;
      // Saved powers as little badges around the launcher.
      const ids = Object.keys(match.banked);
      while (badgeGroup.children.length > ids.length) { const c = badgeGroup.children.pop(); c.geometry.dispose(); c.material.dispose(); }
      ids.forEach((id, i) => {
        let m = badgeGroup.children[i];
        if (!m || m.userData.id !== id) {
          if (m) { badgeGroup.remove(m); m.geometry.dispose(); m.material.dispose(); }
          m = new THREE.Mesh(new THREE.CircleGeometry(13, 24), new THREE.MeshBasicMaterial({ map: iconTexture(id), transparent: true, depthWrite: false }));
          m.userData.id = id;
          badgeGroup.add(m);
          if (badgeGroup.children.indexOf(m) !== i) { badgeGroup.remove(m); badgeGroup.children.splice(i, 0, m); m.parent = badgeGroup; }
        }
        const a = Math.PI + (i - (ids.length - 1) / 2) * 0.62;
        m.position.set(Math.cos(a) * 62, Math.sin(a) * 26 + 6, 10);
        m.scale.setScalar(1 + 0.08 * Math.sin(time * 4 + i));
      });
    }

    const iconTex = {};
    function iconTexture(id) {
      if (iconTex[id]) return iconTex[id];
      const c = document.createElement('canvas'); c.width = c.height = 96;
      P3.icons.item(c.getContext('2d'), id, 48, 48, 92);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      iconTex[id] = t;
      return t;
    }

    function updateGuide(time) {
      const L = guideDots;
      let n = 0;
      if (guide && match.phase === 'aim') {
        const pts = guide.points;
        const total = pts.length;
        const step = Math.max(1, Math.round(total / 70));
        const r = guideColor.r * 1.6, g = guideColor.g * 1.6, b = guideColor.b * 1.6;
        for (let i = 1; i < total && n < 340; i += step) {
          const p = pts[i];
          const u = i / total;
          const s = (11 - u * 4) * guideScale;
          const a = (1 - u * 0.75) * (0.75 + 0.25 * Math.sin(time * 8 - i * 0.35));
          setQuad(L, n++, p.x, -p.y, 30, s, s, 0, 'dot', r, g, b, a);
        }
        for (const h of guide.hits.slice(0, 8)) {
          if (n >= 350) break;
          setQuad(L, n++, h.x, -h.y, 31, 26 * guideScale, 26 * guideScale, 0, 'ringTile', r, g, b, 0.85);
        }
      }
      L.mesh.count = n;
      L.mesh.instanceMatrix.needsUpdate = true; L.tile.needsUpdate = true; L.tint.needsUpdate = true; L.alpha.needsUpdate = true;
    }

    /* ── Bonus slots ────────────────────────────────────────────────────── */
    function showSlots() {
      slotMeshes.forEach(m => { slots.remove(m); m.geometry.dispose(); if (m.material.map) m.material.map.dispose(); m.material.dispose(); });
      slotMeshes = [];
      const vals = match.mode.slots, n = vals.length, w = B.W / n;
      vals.forEach((v, i) => {
        const big = v === Math.max.apply(null, vals);
        const col = big ? '#ffd23f' : i % 2 ? '#7ad7ff' : '#ff8ad8';
        const panel = new THREE.Mesh(new THREE.PlaneGeometry(w - 10, 64), new THREE.MeshBasicMaterial({ color: A.col(col, 0.55), transparent: true, opacity: 0.85, depthWrite: false }));
        panel.position.set(w * i + w / 2, -(B.H - 34), 8);
        const label = new THREE.Mesh(new THREE.PlaneGeometry(w - 16, 52), new THREE.MeshBasicMaterial({ map: A.textTexture(U.fmt(v), { w: 256, h: 84, size: 46 }), transparent: true, depthWrite: false }));
        label.position.set(w * i + w / 2, -(B.H - 34), 9);
        panel.userData = { base: A.col(col, 0.55), lit: 0 };
        slots.add(panel, label);
        slotMeshes.push(panel, label);
        if (i > 0) {
          const div = new THREE.Mesh(new THREE.PlaneGeometry(6, 90), new THREE.MeshBasicMaterial({ color: A.col('#ffffff', 2), toneMapped: false }));
          div.position.set(w * i, -(B.H - 38), 10);
          slots.add(div); slotMeshes.push(div);
        }
      });
      slots.visible = true;
      slots.userData.t = 0;
    }
    function lightSlot(i) {
      const panel = slotMeshes.filter((m, k) => m.userData && m.userData.base)[i];
      if (panel) panel.userData.lit = 1;
    }
    function updateSlots(dt) {
      if (!slots.visible) return;
      slots.userData.t += dt;
      const rise = U.easeOutBack(U.clamp(slots.userData.t / 0.6, 0, 1));
      slots.position.y = -(1 - rise) * 90;
      slotMeshes.forEach(m => {
        if (!m.userData || !m.userData.base) return;
        m.userData.lit = Math.max(0, m.userData.lit - dt * 0.7);
        m.material.color.copy(m.userData.base).multiplyScalar(1 + m.userData.lit * 4);
      });
    }

    /* ── Reacting to match events ───────────────────────────────────────── */
    function entryOf(body) { return body && entries[body.index]; }
    function react(ev) {
      const e = entryOf(ev.body);
      switch (ev.type) {
        case 'light': case 'litBy': if (e) { e.flash = 1; e.bump = 1; } break;
        case 'relight': case 'bumper': case 'clank': if (e) { e.bump = 0.7; e.flash = Math.max(e.flash, 0.4); } break;
        case 'crack': if (e) { e.recolor = true; e.shake = 1; e.flash = 0.6; } break;
        case 'pop': case 'brickBreak': if (e) { e.popping = true; e.pop = 0; } break;
        case 'gates': (ev.gates || []).forEach(g => { const ge = entryOf(g); if (ge) { ge.popping = true; ge.pop = 0; } }); break;
        case 'goalMet': showSlots(); break;
        case 'slot': lightSlot(ev.index); break;
      }
    }

    return {
      scene, camera,
      load, update, setTheme, setLayout, setBackdrop, react,
      setAim(d) { aimDeg = d; },
      snapAim(d) { aimDeg = d; aimShown = d; },
      setGuide(pred, color, scale) { guide = pred; if (color) guideColor.set(color); if (scale) guideScale = scale; },
      setReduced(value) { reduced = !!value; if (reduced) { shakeAmt = 0; focusState.target = 1; } },
      shake(px) { if (!reduced) shakeAmt = Math.min(16, shakeAmt + px); },
      focus(x, y, k) { focusState.tx = x; focusState.ty = y; focusState.target = k; },
      unfocus() { focusState.target = 1; focusState.tx = B.W / 2; focusState.ty = B.H / 2; },
      skipIntro() { introT = 3; },
      get introDone() { return introT > 1.6; },
      get launcherWorld() { return { x: B.LAUNCH_X, y: B.LAUNCH_Y }; },
      entryOf
    };
  }

  P3.board = { create };
})(typeof window !== 'undefined' ? window : globalThis);
