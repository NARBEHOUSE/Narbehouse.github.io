/** Benny's Sphere Splash - the arena: a floating sphere of water inside a stadium bowl.
 *
 * No post-processing library (EffectComposer is not in the hub's vendored Three): the
 * underwater look is the sphere's skin (a Fresnel shader: clear glass from outside, the
 * water's own hazy colour from inside) and teal depth fog. The water has no ambient
 * decoration - no caustics, drifting bubbles or light shafts (Bryan, pool round 4:
 * visibility first; they moved behind and across every play and helped nobody read it).
 * techBurst() is a technique's sparkle round the player; goalBurst() is the net's part of a goal: bubbles burst out of it, a ring of the
 * scorers' colour spreads across the mouth, the net lights up and the crowd jumps.
 */
SS.world = (function () {
  'use strict';

  const R = 20;                         // sphere radius in metres; the whole pool
  const GOAL_Z = R - 2.2;               // goals hang just inside the skin at the poles
  const uniforms = { uTime: { value: 0 }, uCheer: { value: 0 }, uCalm: { value: 0 }, uSway: { value: 1 } };
  let scene, crowd, bubbleTex, goals = [], bursts = [], cheer = 0;

  /* ── the sphere's skin ─────────────────────────────────────────────────── */
  /* Seen from inside, the skin is the backdrop of every play, so it is also the depth of the
     water: a haze that softens the stadium's tiers behind the swimmers (Bryan picked a light
     one, so the stadium still shows as soft shapes), bright above (the surface) and deeper
     below, so up and down read at a glance. Teal, not blue: blue water hid the blue kits.
     From outside the skin stays clear glass: the near side is a window, and through it the
     far side is the same water (the inside of the skin is always water, the outside glass). */
  const WATER = { haze: 0.55, top: 0xb8f3f0, mid: 0x4fc4c8, deep: 0x2a8fa8, surface: 0.5 };
  const skinU = { uTime: uniforms.uTime, uTint: { value: new THREE.Color(0x1fb3c9) }, uRim: { value: new THREE.Color(0xdff9ff) },
    uHaze: { value: WATER.haze }, uSurface: { value: WATER.surface },
    uTop: { value: new THREE.Color(WATER.top) }, uMid: { value: new THREE.Color(WATER.mid) }, uDeep: { value: new THREE.Color(WATER.deep) } };
  function waterSkin() {
    const mat = new THREE.ShaderMaterial({
      uniforms: skinU,
      vertexShader: `
        varying vec3 vN; varying vec3 vView; varying vec3 vW;
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
          vN = normalize(mat3(modelMatrix) * normal); vView = normalize(cameraPosition - w.xyz);
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: `
        uniform float uTime; uniform vec3 uTint; uniform vec3 uRim;
        uniform float uHaze; uniform float uSurface; uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uDeep;
        varying vec3 vN; varying vec3 vView; varying vec3 vW;
        void main() {
          vec3 n = normalize(vN + 0.06 * vec3(sin(vW.y * 0.9 + uTime), sin(vW.z * 0.8 - uTime * 1.2), sin(vW.x * 0.7 + uTime * 0.8)));
          float f = pow(1.0 - abs(dot(n, vView)), 2.2);
          float glint = pow(max(0.0, sin(vW.x * 1.3 + vW.y * 0.7 + uTime * 1.5)), 12.0) * 0.35;
          vec3 col = mix(uTint, uRim, f) + glint;
          float a = mix(0.16, 0.85, f);
          // Inside: the water's own colour, by height on the sphere.
          float h = normalize(vW).y;
          vec3 depth = h > 0.0 ? mix(uMid, uTop, smoothstep(0.0, 0.85, h)) : mix(uMid, uDeep, smoothstep(0.0, -0.8, h));
          float sheen = pow(max(0.0, sin(vW.x * 0.35 + uTime * 0.6) * sin(vW.z * 0.3 - uTime * 0.45)), 3.0);
          depth += vec3(0.9, 1.0, 1.0) * uSurface * smoothstep(0.55, 0.95, h) * (0.25 + 0.35 * sheen);
          // No glint inside: its bands read as rings across the top of the picture.
          gl_FragColor = gl_FrontFacing ? vec4(col, a) : vec4(depth, max(a, uHaze));
        }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    const skin = new THREE.Mesh(new THREE.SphereGeometry(R, 96, 64), mat);
    skin.renderOrder = 10;
    return skin;
  }

  /* ── goals: big triangular frames, one per pole ─────────────────────────
     The mouth is the sim's (RULES.GOAL_SIZE: a triangle's "radius"); the frame is one
     thick rounded tube round it with an ink shell like the swimmers', lit from within so
     it stays bright in the haze, and a net with a visible mesh. Each goal is in the colour
     of the team that DEFENDS it (Bryan's pick, M3): you shoot at the goal in their colours.
     The -z goal is ours (team 0 attacks +z) and nobody changes ends. */
  const GOAL_TUBE = 0.42, GOAL_DEFAULT = [0xff4f9a, 0xff8a3d];      // -z, +z when no match is on
  let goalKits = null, netTex = null, netOpacity = 0.7;            // the net's opacity is the colour profile's (--w-net)
  /** A net you can see: diamond mesh lines over a light fill (white; the material tints it). */
  function makeNetTex() {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(255,255,255,0.32)'; g.fillRect(0, 0, 64, 64);
    g.strokeStyle = 'rgba(255,255,255,1)'; g.lineWidth = 5;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(64, 64); g.moveTo(64, 0); g.lineTo(0, 64); g.stroke();
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1.1, 1.1);
    return t;
  }
  function goal(z, colour) {
    const g = new THREE.Group(), s = SS.DATA.RULES.GOAL_SIZE;
    const pts = [0, 1, 2].map(i => new THREE.Vector3(Math.sin(i * 2.094) * s, Math.cos(i * 2.094) * s, 0));
    // Along each side, short of the corners: the closed spline rounds them.
    const path = [];
    for (let i = 0; i < 3; i++) for (let k = 0; k <= 6; k++) path.push(pts[i].clone().lerp(pts[(i + 1) % 3], 0.1 + 0.8 * k / 6));
    const curve = new THREE.CatmullRomCurve3(path, true, 'centripetal');
    const frameMat = new THREE.MeshToonMaterial({ color: colour, emissive: new THREE.Color(colour).multiplyScalar(0.35) });
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 160, GOAL_TUBE, 14, true), frameMat));
    const shellMat = new THREE.MeshBasicMaterial({ color: 0x10202a, side: THREE.BackSide });
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 160, GOAL_TUBE + 0.08, 10, true), shellMat));
    netTex = netTex || makeNetTex();
    const net = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(pts.map(p => new THREE.Vector2(p.x, p.y)))), new THREE.MeshBasicMaterial({
      color: colour, map: netTex, transparent: true, opacity: netOpacity, side: THREE.DoubleSide, depthWrite: false }));
    g.add(net);
    g.position.z = z;
    goals.push({ group: g, net, z, colour: new THREE.Color(colour), flash: 0, shake: 0, frameMat, shellMat });
    return g;
  }
  /** The match's kit colours, ours (the -z goal) and theirs (+z); null between matches. */
  function setGoalKits(ours, theirs) {
    goalKits = ours == null ? null : [ours, theirs];
    const c = goalKits || GOAL_DEFAULT;
    goals.forEach(gl => {
      gl.colour.set(c[gl.z < 0 ? 0 : 1]);
      gl.frameMat.color.copy(gl.colour); gl.frameMat.emissive.copy(gl.colour).multiplyScalar(0.35);
      gl.net.material.color.copy(gl.colour);
    });
    colourCrowd();
  }

  /* ── a goal: the net bursts ───────────────────────────────────────────────
     One flash, never a flicker: the net lights up in the scorers' colour and fades over
     a second and a half. ~140 bubbles (white and the team colour) fly out of where the
     ball went in, slow down in the water and rise; a ring spreads across the goal mouth;
     the frame shudders; the crowd jumps for four seconds. */
  const BURST_LIFE = 2.4, RING_LIFE = 0.8;
  function goalBurst(at, colour, opts) {
    const gl = goals.reduce((a, b) => Math.abs(b.z - at.z) < Math.abs(a.z - at.z) ? b : a, goals[0]);
    const into = Math.sign(gl.z) || 1;                              // the pool is the other way: -into
    // Reduced motion: a softer flash, no shudder, the crowd stays seated, fewer and slower bubbles.
    const calm = SS.util.reducedMotion();
    gl.flash = calm ? 0.5 : 1; gl.shake = calm ? 0 : 1; gl.net.material.color.set(colour);
    // Out of the net into the pool: a wide cone, mostly away from the goal. A replay's
    // camera is right at the net, so its burst has no ring (it would fill the view).
    burst(at, colour, { n: 140, cone: new THREE.Vector3(0, 0, -into), spread: 1.15, speed: [4, 11], size: 0.5,
      ring: !(opts && opts.ring === false), ringAt: new THREE.Vector3(at.x, at.y, at.z - into * 0.3), ringGrow: 2.6 });
    cheer = calm ? 0 : 4;
  }
  /* ── a technique: a sparkle burst round the player who used it ─────────────
     Its colour (game.js picks it: violet stings, blue snoozes, gold blasts...), all
     round them, smaller and quicker than a goal's; the ring faces the camera. */
  function techBurst(at, colour, cameraQuat) {
    burst(at, colour, { n: 70, cone: null, speed: [2.5, 5.5], size: 0.38, ring: true, ringQuat: cameraQuat, ringGrow: 0.9, mix: 2 });
  }
  /** Bubbles flying out of `at` (a cone round o.cone, or every way), and a spreading ring. */
  function burst(at, colour, o) {
    const calm = SS.util.reducedMotion(), slow = calm ? 0.6 : 1;
    const n = calm ? Math.max(8, Math.round(o.n * 0.35)) : o.n, fx = new THREE.Color(colour), white = new THREE.Color(0xffffff), c = new THREE.Color();
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), vel = [];
    const q = o.cone ? new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), o.cone) : null;
    for (let i = 0; i < n; i++) {
      pos[i * 3] = at.x; pos[i * 3 + 1] = at.y; pos[i * 3 + 2] = at.z;
      const sp = (o.speed[0] + Math.random() * (o.speed[1] - o.speed[0])) * slow;
      const v = new THREE.Vector3();
      if (q) {
        const a = Math.random() * Math.PI * 2, spread = Math.random() * o.spread;
        v.set(Math.cos(a) * Math.sin(spread), Math.sin(a) * Math.sin(spread), Math.cos(spread)).applyQuaternion(q);
        v.y += 0.25;
      } else v.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize();
      vel.push(v.multiplyScalar(sp));
      c.copy(i % (o.mix || 3) ? white : fx).toArray(col, i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: o.size, map: bubbleTex, vertexColors: true, transparent: true,
      opacity: 1, depthWrite: false, sizeAttenuation: true }));
    pts.frustumCulled = false; pts.renderOrder = 15;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.15, 48), new THREE.MeshBasicMaterial({ color: fx, transparent: true,
      opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
    ring.position.copy(o.ringAt || at); ring.renderOrder = 15;
    if (o.ringQuat) ring.quaternion.copy(o.ringQuat);
    ring.visible = !!o.ring;
    scene.add(pts, ring);
    bursts.push({ t: 0, pts, vel, ring, ringOn: ring.visible, grow: o.ringGrow || 2.6 });
  }
  function updateGoals(dt) {
    goals.forEach(g => {
      if (g.flash > 0) {
        g.flash = Math.max(0, g.flash - dt / 1.5);
        g.net.material.opacity = Math.min(1, netOpacity + 0.6 * g.flash);
        if (!g.flash) g.net.material.color.copy(g.colour);
      }
      if (g.shake > 0) {
        g.shake = Math.max(0, g.shake - dt / 0.9);
        const k = g.shake * g.shake * 0.18;
        g.group.position.set(Math.sin(g.shake * 47) * k, Math.sin(g.shake * 61) * k, g.z);
      }
    });
    for (let b = bursts.length - 1; b >= 0; b--) {
      const br = bursts[b];
      br.t += dt;
      const a = br.pts.geometry.attributes.position.array, drag = Math.exp(-dt * 2.6);
      br.vel.forEach((v, i) => {
        v.multiplyScalar(drag); v.y += dt * 1.6;                       // the water slows them; then they rise
        a[i * 3] += v.x * dt; a[i * 3 + 1] += v.y * dt; a[i * 3 + 2] += v.z * dt;
      });
      br.pts.geometry.attributes.position.needsUpdate = true;
      br.pts.material.opacity = 1 - Math.max(0, (br.t - BURST_LIFE * 0.5) / (BURST_LIFE * 0.5));
      const r = Math.min(1, br.t / RING_LIFE);
      br.ring.scale.setScalar(1 + r * br.grow);       // a goal's: out to the goal's own size
      br.ring.material.opacity = 0.9 * (1 - r);
      br.ring.visible = br.ringOn && r < 1;
      if (br.t >= BURST_LIFE) {
        scene.remove(br.pts, br.ring);
        br.pts.geometry.dispose(); br.pts.material.dispose(); br.ring.geometry.dispose(); br.ring.material.dispose();
        bursts.splice(b, 1);
      }
    }
    if (cheer > 0) cheer = Math.max(0, cheer - dt);
    uniforms.uCheer.value = Math.min(1, cheer / 1.2);
    uniforms.uSway.value = SS.util.reducedMotion() ? 0 : 1;          // reduced motion: the crowd sits still
  }

  /* ── a bubble: the ring the goal and technique bursts are made of ───────── */
  function bubbleTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'); g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 6;
    g.beginPath(); g.arc(32, 32, 24, 0, Math.PI * 2); g.stroke();
    return new THREE.CanvasTexture(c);
  }

  /* ── the arena: a stadium at a time of day ─────────────────────────────────
     Any stadium at any time of day (Bryan, M3): each match picks one of each at random
     unless Settings fixes them. A stadium is the building - its paint, what holds the
     sphere up, its lights, its flags; a time of day is the sky, a shade over the whole
     building (darker and bluer at night, warmer at sunset) and whether the lights are on.
     Neither touches the lights the swimmers are lit by, so their kits read the same in
     every arena. Seen from outside (kickoff sweep, halftime, the menu) the stadium frames
     the sphere; from inside it is what shows through the water's haze, behind every play,
     so there the crowd melts into its seats (uCalm). Stadium parts are out of the water,
     so the underwater fog skips them. */
  const STADIUMS = {
    towers: { name: 'Floodlight Towers', tread: [0x5a6488, 0x555f83], riser: 0x4a5274, floor: 0x3f4a66,
      fixtures: 'towers', cradle: 'ring', cradleCol: 0x4d557a, glow: 0x6ff3ff },
    arches: { name: 'Stone Arches', tread: [0xd9d0bd, 0xd2c9b6], riser: 0xbdb4a1, floor: 0x5f8a4a,
      fixtures: 'uplights', cradle: 'arches', cradleCol: 0x9d9483, glow: 0xffe2a8, bunting: true },
    lamps: { name: 'Lamp Ring', tread: [0xb07a5e, 0xa97459], riser: 0x96664f, floor: 0x6b5446,
      fixtures: 'halo', cradle: 'cup', cradleCol: 0x8c6440, glow: 0xffd27a },
  };
  const TIMES = {
    day:    { name: 'Day', sky: ['#2f7ee8', '#93d2ff', '#e9f7ff'], clouds: true, shade: 0xffffff, lit: false, phones: 0 },
    sunset: { name: 'Sunset', sky: ['#2c2463', '#d0649a', '#ffb067', '#ffb067'], shade: 0xf2cdbd, lit: true, lightCol: 0xffc77a, phones: 0.01 },
    night:  { name: 'Night', sky: ['#070b24', '#1b2463', '#47407f'], stars: true, shade: 0x5a6494, lit: true, lightCol: 0xfff1cc, phones: 0.04 },
  };
  const CROWD_CALM = 0.75;                  // inside the water, how far the fans melt into their seats
  let stadiumGroup = null, skyMesh = null, arena = null, crowdAng = null, crowdMute = null, phones = null, fanTex = null;

  function sky(T) {
    const c = document.createElement('canvas'); c.width = T.clouds || T.stars ? 1024 : 4; c.height = 256;
    const g = c.getContext('2d'), grad = g.createLinearGradient(0, 0, 0, 256);
    // Three stops: top, horizon, below. Four: top, high up, horizon, below (a sunset's bands).
    const at = T.sky.length === 4 ? [0, 0.4, 0.5, 1] : [0, 0.5, 1];
    T.sky.forEach((s, i) => grad.addColorStop(at[i], s));
    g.fillStyle = grad; g.fillRect(0, 0, c.width, 256);
    if (T.clouds) {                                   // fat cartoon clouds in a band above the stadium's rim
      g.fillStyle = 'rgba(255,255,255,0.92)';
      for (let i = 0; i < 9; i++) {
        const x = i * 114 + 30 * Math.sin(i * 2.1), y = 92 + 12 * Math.sin(i * 1.7);
        for (let k = 0; k < 5; k++) for (const dx of [0, 1024]) {
          g.beginPath(); g.ellipse(x + (k - 2) * 15 - dx, y - (k % 2) * 7, 16 + (k % 3) * 5, 8 + (k % 2) * 4, 0, 0, Math.PI * 2); g.fill();
        }
      }
    }
    if (T.stars) {                                    // a scatter of stars, thinning towards the horizon
      g.fillStyle = '#fff';
      for (let i = 0; i < 260; i++) {
        const x = (i * 397) % 1024, y = ((i * 7919) % 1000) / 1000 * 112;
        g.globalAlpha = 0.5 + 0.5 * (1 - y / 112); g.fillRect(x, y, i % 9 ? 1 : 2, i % 9 ? 1 : 2);
      }
      g.globalAlpha = 1;
    }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = THREE.RepeatWrapping;
    return new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16),
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false }));
  }

  /** Stepped tiers as one mesh: each row a flat tread (alternating shades) and a riser. */
  function tierGeometry(rows, colours, riser) {
    const seg = 128, pos = [], nor = [], col = [], c = new THREE.Color();
    const strip = (r0, y0, r1, y1, hex, up) => {
      c.set(hex);
      for (let i = 0; i < seg; i++) {
        const a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2;
        [[r0, y0, a0], [r1, y1, a0], [r1, y1, a1], [r0, y0, a0], [r1, y1, a1], [r0, y0, a1]].forEach(([r, y, a]) => {
          pos.push(Math.cos(a) * r, y, Math.sin(a) * r);
          if (up) nor.push(0, 1, 0); else nor.push(-Math.cos(a), 0, -Math.sin(a));
          col.push(c.r, c.g, c.b);
        });
      }
    };
    rows.forEach((t, i) => { strip(t.r0, t.y, t.r1, t.y, colours[i % 2], true); strip(t.r1, t.y, t.r1, t.y + t.dy, riser, false); });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return geo;
  }
  /** A fan: head and shoulders, white so the instance colour tints it. No arms: from inside the
      pool arms were a fizz of little edges behind the play. They jump on a goal instead. */
  function fanTexture() {
    if (fanTex) return fanTex;
    const c = document.createElement('canvas'); c.width = 64; c.height = 96;
    const g = c.getContext('2d'); g.fillStyle = '#fff';
    g.beginPath(); g.arc(32, 30, 15, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.roundRect(8, 42, 48, 54, 22); g.fill();
    return (fanTex = new THREE.CanvasTexture(c));
  }
  /** A soft round glow for lamps. */
  let glowTex = null;
  function glowTexture() {
    if (glowTex) return glowTex;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return (glowTex = new THREE.CanvasTexture(c));
  }
  function glowSprite(colour, size, opacity) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: colour, blending: THREE.AdditiveBlending,
      depthWrite: false, fog: false, transparent: true, opacity }));
    s.scale.setScalar(size);
    return s;
  }

  function buildStadium(S, T) {
    const g = new THREE.Group(), ROWS = 14, r0 = R + 9, y0 = -R - 6, dr = 34 / ROWS, dy = 30 / ROWS;
    const shade = new THREE.Color(T.shade);
    // Everything the building is made of, in its paint, under the time of day's shade.
    const paint = hex => new THREE.MeshToonMaterial({ color: new THREE.Color(hex).multiply(shade), fog: false });
    const ctx = { S, T, shade, paint, lamp: T.lit ? T.lightCol : null, top: { r: r0 + 34, y: y0 + 30 }, floorY: y0 - 2 };
    const rows = [];
    for (let i = 0; i < ROWS; i++) rows.push({ r0: r0 + i * dr, r1: r0 + (i + 1) * dr, y: y0 + i * dy, dy });
    const bowlMat = new THREE.MeshToonMaterial({ color: shade, vertexColors: true, side: THREE.DoubleSide, fog: false });
    g.add(new THREE.Mesh(tierGeometry(rows, S.tread, S.riser), bowlMat));
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(ctx.top.r, ctx.top.r, 3, 128, 1, true), paint(S.riser));
    wall.material.side = THREE.DoubleSide; wall.position.y = ctx.top.y + 1.5; g.add(wall);          // the rim above the top row
    const floor = new THREE.Mesh(new THREE.CircleGeometry(r0 + 1, 64), paint(S.floor));
    floor.rotation.x = -Math.PI / 2; floor.position.y = ctx.floorY; g.add(floor);
    g.add(buildCrowd(ctx, rows));
    if (S.fixtures === 'towers') g.add(towers(ctx));
    if (S.fixtures === 'halo') g.add(halo(ctx));
    if (S.bunting) g.add(bunting(ctx));
    g.add(cradle(ctx));
    return g;
  }
  function buildCrowd(ctx, rows) {
    const { S, T, shade } = ctx;
    // Packed shoulder to shoulder. Each team's fans sit at the end of the goal it defends.
    const per = rows.map(t => Math.round(Math.PI * 2 * (t.r0 + (t.r1 - t.r0) * 0.55) / 0.95)), n = per.reduce((a, b) => a + b, 0);
    // Lit like the seats (toon, like the risers right behind them), so calm really melts them in.
    const mat = new THREE.MeshToonMaterial({ color: shade, map: fanTexture(), alphaTest: 0.5, side: THREE.DoubleSide, fog: false });
    const seat = new THREE.Color(S.riser).multiply(shade);
    mat.onBeforeCompile = shader => {
      shader.uniforms.uTime = uniforms.uTime; shader.uniforms.uCheer = uniforms.uCheer; shader.uniforms.uSway = uniforms.uSway;
      shader.uniforms.uCalm = uniforms.uCalm; shader.uniforms.uSeat = { value: seat };
      shader.fragmentShader = 'uniform float uCalm; uniform vec3 uSeat;\n' + shader.fragmentShader.replace('#include <color_fragment>',
        '#include <color_fragment>\n  diffuseColor.rgb = mix(diffuseColor.rgb, uSeat, uCalm * ' + CROWD_CALM.toFixed(2) + ');');
      // A slow sway all match; on a goal everyone jumps.
      shader.vertexShader = 'uniform float uTime; uniform float uCheer; uniform float uSway;\n' + shader.vertexShader.replace('#include <begin_vertex>',
        `#include <begin_vertex>
         float ph = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.23;
         transformed.x += sin(uTime * 1.1 + ph) * 0.06 * transformed.y * uSway;
         transformed.y += max(0.0, sin(uTime * 9.0 + ph)) * 0.8 * uCheer;`);
    };
    const m = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.1, 1.6), mat, n);
    const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
    const phonePos = [];
    crowdAng = [];
    let k = 0;
    rows.forEach((t, r) => {
      for (let i = 0; i < per[r]; i++, k++) {
        const a = (i / per[r]) * Math.PI * 2 + r * 0.21, rad = t.r0 + (t.r1 - t.r0) * 0.55;
        p.set(Math.cos(a) * rad, t.y + 0.8, Math.sin(a) * rad);
        q.setFromAxisAngle(Y, -a - Math.PI / 2);
        mtx.compose(p, q, s); m.setMatrixAt(k, mtx);
        crowdAng.push(a);
        if (T.phones && ((i * 13 + r * 7) % 97) / 97 < T.phones) phonePos.push(p.x, p.y + 1.1, p.z);
      }
    });
    crowd = m;
    crowdMute = new THREE.Color(S.tread[0]).lerp(new THREE.Color(S.tread[1]), 0.5);
    colourCrowd();
    const grp = new THREE.Group(); grp.add(m);
    phones = null;
    if (phonePos.length) {                             // phone lights held up in the dark
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(phonePos, 3));
      phones = new THREE.Points(geo, new THREE.PointsMaterial({ map: glowTexture(), color: 0xfff3c4, size: 1.6, transparent: true,
        depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      grp.add(phones);
    }
    return grp;
  }
  /** Fans in the two teams' colours (pink and orange between matches): each team's end
      behind the goal it defends, mixed along the sides, toned towards the seats. */
  function colourCrowd() {
    if (!crowdAng || !crowd) return;
    const kits = goalKits || GOAL_DEFAULT, a = new THREE.Color(kits[0]), b = new THREE.Color(kits[1]);
    const neutral = [0xe6e0d0, 0x9aa7b8, 0xc8b8a0], c = new THREE.Color();
    crowdAng.forEach((ang, k) => {
      const z = Math.sin(ang), h = (k * 2654435761 % 1000) / 1000;      // -1 our end .. +1 theirs; a fixed shuffle
      if (h > 0.85 && Math.abs(z) < 0.6) c.set(neutral[k % 3]); else c.copy(h < 0.5 + z * 0.45 ? b : a).lerp(crowdMute, 0.35);
      crowd.setColorAt(k, c);
    });
    crowd.instanceColor.needsUpdate = true;
  }
  /** Four floodlight towers on the rim, at the diagonals (clear of the broadcast side). */
  function towers(ctx) {
    const g = new THREE.Group(), mastMat = ctx.paint(0xc3c8d6);
    const lampMat = new THREE.MeshBasicMaterial({ color: ctx.lamp || new THREE.Color(0xe4e6ec).multiply(ctx.shade), fog: false });
    // All 48 lamps are one instanced mesh: one draw call, not 48 (a Surface's CPU feels each).
    const lamps = new THREE.InstancedMesh(new THREE.CircleGeometry(0.85, 16), lampMat, 48), _m = new THREE.Matrix4();
    let n = 0;
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + Math.PI / 4, h = 22, t = new THREE.Group();
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.3, h, 10), mastMat);
      mast.position.y = h / 2; t.add(mast);
      const head = new THREE.Group(); head.position.y = h + 2.5;
      head.add(new THREE.Mesh(new THREE.BoxGeometry(10, 6, 0.8), mastMat));
      if (ctx.lamp) { const gl = glowSprite(ctx.lamp, 26, 0.75); gl.position.z = 1.5; head.add(gl); }
      t.add(head);
      t.position.set(Math.cos(a) * (ctx.top.r + 2), ctx.top.y, Math.sin(a) * (ctx.top.r + 2));
      t.lookAt(0, ctx.top.y, 0);
      head.rotation.x = 0.45;                        // tipped down at the sphere
      g.add(t);
      t.updateMatrixWorld(true);
      for (let x = 0; x < 4; x++) for (let y = 0; y < 3; y++) {
        _m.makeTranslation(-3.6 + x * 2.4, -1.8 + y * 1.8, 0.45).premultiply(head.matrixWorld);
        lamps.setMatrixAt(n++, _m);
      }
    }
    g.add(lamps);
    return g;
  }
  /** A ring of lamps all round the rim. */
  function halo(ctx) {
    const g = new THREE.Group(), r = ctx.top.r - 0.5, y = ctx.top.y + 3.4;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.6, 8, 160),
      ctx.lamp ? new THREE.MeshBasicMaterial({ color: ctx.lamp, fog: false }) : ctx.paint(0xe9e1d6));
    ring.rotation.x = Math.PI / 2; ring.position.y = y; g.add(ring);
    if (ctx.lamp) {                                    // 24 glows as one Points: one draw call
      const pts = [];
      for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; pts.push(Math.cos(a) * r, y + 0.2, Math.sin(a) * r); }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      g.add(new THREE.Points(geo, new THREE.PointsMaterial({ map: glowTexture(), color: ctx.lamp, size: 6, transparent: true, opacity: 0.5,
        depthWrite: false, blending: THREE.AdditiveBlending, fog: false })));
    }
    return g;
  }
  /** Bright pennants strung round the rim. */
  function bunting(ctx) {
    const n = 180, cols = [0xff4f5e, 0xffc21a, 0x3fbf6b, 0x2f8cff, 0xff8a3d, 0xb46cff], pos = [], col = [], c = new THREE.Color();
    const r = ctx.top.r - 0.6, y = ctx.top.y + 3.2;
    for (let i = 0; i < n; i++) {
      const a0 = i / n * Math.PI * 2, a1 = (i + 0.8) / n * Math.PI * 2, am = (a0 + a1) / 2;
      pos.push(Math.cos(a0) * r, y, Math.sin(a0) * r, Math.cos(a1) * r, y, Math.sin(a1) * r, Math.cos(am) * (r - 0.3), y - 1.6, Math.sin(am) * (r - 0.3));
      c.set(cols[i % cols.length]).multiply(ctx.shade); for (let k = 0; k < 3; k++) col.push(c.r, c.g, c.b);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: false }));
  }
  /** What holds the sphere up: a ring on four legs, four arches, or a cup on one stem. Each
      has a light strip round the rim it rests in, lit when the lights are on. */
  function cradle(ctx) {
    const { S, floorY } = ctx, g = new THREE.Group(), mat = ctx.paint(S.cradleCol);
    const ringY = -R * 0.8, ringR = Math.sqrt(R * R - ringY * ringY) + 0.6;          // where the sphere would rest in it
    const ring = new THREE.Mesh(new THREE.TorusGeometry(ringR, 0.75, 12, 96), mat);
    ring.rotation.x = Math.PI / 2; ring.position.y = ringY; g.add(ring);
    const strip = new THREE.Mesh(new THREE.TorusGeometry(ringR + 0.75, 0.22, 6, 96), ctx.lamp
      ? new THREE.MeshBasicMaterial({ color: S.glow, fog: false }) : ctx.paint(new THREE.Color(S.cradleCol).lerp(new THREE.Color(0xffffff), 0.4)));
    strip.rotation.x = Math.PI / 2; strip.position.y = ringY + 0.3; g.add(strip);
    if (S.cradle === 'cup') {                          // one stem, flaring into a cup under the sphere
      const prof = [[2.6, floorY], [2.6, -R - 3.5], [4, -R - 1], [5.6, -R + 0.5], [9.8, -R + 2], [ringR, ringY]].map(([x, y]) => new THREE.Vector2(x, y));
      const cup = new THREE.Mesh(new THREE.LatheGeometry(prof, 48), mat);
      cup.material.side = THREE.DoubleSide; g.add(cup);
      return g;
    }
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + Math.PI / 4, cx = Math.cos(a), cz = Math.sin(a);
      if (S.cradle === 'ring') {
        const from = new THREE.Vector3(cx * ringR, ringY, cz * ringR), to = new THREE.Vector3(cx * (ringR + 7), floorY, cz * (ringR + 7));
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.6, from.distanceTo(to), 12), mat);
        leg.position.copy(from).add(to).multiplyScalar(0.5);
        leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), from.clone().sub(to).normalize());
        g.add(leg);
      } else {                                         // arches, lit from their feet at night
        const foot = new THREE.Vector3(cx * (ringR + 12), floorY, cz * (ringR + 12));
        const curve = new THREE.QuadraticBezierCurve3(foot, new THREE.Vector3(cx * (ringR + 9), ringY + 1, cz * (ringR + 9)),
          new THREE.Vector3(cx * ringR, ringY, cz * ringR));
        g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 1.1, 12), mat));
        if (ctx.lamp && S.fixtures === 'uplights') {
          const up = glowSprite(ctx.lamp, 6, 0.8); up.position.copy(foot).add(new THREE.Vector3(-cx * 2.5, 3.5, -cz * 2.5)); g.add(up);
        }
      }
    }
    return g;
  }
  function disposeTree(o) {
    o.traverse(n => {
      if (n.geometry) n.geometry.dispose();
      if (n.material) [].concat(n.material).forEach(mt => { if (mt.map && mt.map !== glowTex && mt.map !== fanTex) mt.map.dispose(); mt.dispose(); });
    });
  }
  /** Build the arena: setArena('towers', 'night'). Rebuilds only when it changes. */
  function setArena(stadium, time) {
    if (!STADIUMS[stadium]) stadium = 'towers';
    if (!TIMES[time]) time = 'night';
    if (arena && arena.stadium === stadium && arena.time === time) return;
    arena = { stadium, time };
    if (stadiumGroup) { scene.remove(stadiumGroup); disposeTree(stadiumGroup); }
    if (skyMesh) { scene.remove(skyMesh); disposeTree(skyMesh); }
    skyMesh = sky(TIMES[time]); stadiumGroup = buildStadium(STADIUMS[stadium], TIMES[time]);
    scene.add(skyMesh, stadiumGroup);
    if (themed) applyTheme(SS.theme.palette());
  }

  /* ── colour profiles (theme.js): the water, sky, stadium and goals repaint ── */
  let themed = false;
  function applyTheme(p) {
    themed = true;
    skinU.uTop.value.set(p.top); skinU.uMid.value.set(p.mid); skinU.uDeep.value.set(p.deep);
    skinU.uHaze.value = p.haze; skinU.uSurface.value = p.surface;
    skinU.uTint.value.set(p.glass); skinU.uRim.value.set(p.rim);
    scene.fog.color.set(p.fog); scene.fog.density = p.fogDensity; scene.background.set(p.sky);
    // High Contrast: nothing behind the water - the plain background is the sky.
    if (stadiumGroup) stadiumGroup.visible = p.stadium > 0;
    if (skyMesh) skyMesh.visible = p.stadium > 0;
    if (crowd) crowd.visible = p.crowd > 0;
    if (phones) phones.userData.themeOff = !(p.crowd > 0);
    netOpacity = p.net;
    goals.forEach(g => { g.shellMat.color.set(p.goalInk); if (!g.flash) g.net.material.opacity = netOpacity; });
  }
  /** A random stadium and time of day, or the ones asked for ('random' or missing = any). */
  function pickArena(stadium, time) {
    const any = o => { const k = Object.keys(o); return k[Math.floor(Math.random() * k.length)]; };
    return { stadium: STADIUMS[stadium] ? stadium : any(STADIUMS), time: TIMES[time] ? time : any(TIMES) };
  }

  function build(targetScene, arena0) {
    arena0 = arena0 || pickArena();
    scene = targetScene;
    scene.fog = new THREE.FogExp2(0x0e6f86, 0.011);
    scene.background = new THREE.Color(0x0e6f86);
    scene.add(new THREE.HemisphereLight(0xcff6ff, 0x0b3a52, 1.0));
    const sun = new THREE.DirectionalLight(0xffffff, 1.3); sun.position.set(12, 30, 8); scene.add(sun);
    setArena(arena0.stadium, arena0.time);
    scene.add(waterSkin());
    scene.add(goal(-GOAL_Z, GOAL_DEFAULT[0]), goal(GOAL_Z, GOAL_DEFAULT[1]));
    bubbleTex = bubbleTexture();
    SS.theme.onChange(applyTheme);
  }

  function update(dt, t) {
    uniforms.uTime.value = t;
    const cam = SS.main && SS.main.camera;
    if (cam) {                                        // the camera is in the water: calm the crowd
      uniforms.uCalm.value = 1 - THREE.MathUtils.smoothstep(cam.position.length(), R - 1, R + 3);
      if (phones) { phones.material.opacity = 1 - uniforms.uCalm.value; phones.visible = uniforms.uCalm.value < 1 && !phones.userData.themeOff; }
    }
    updateGoals(dt);
  }

  /* ── the ball's trail ──────────────────────────────────────────────────────
     A ribbon of light behind a ball that is in the air or loose, so a low-vision player
     can follow a pass or a shot and see where it came from. It is built from where the
     ball is DRAWN each frame, so slow motion and replays get it for free. Length is in
     metres of path, not seconds, so slow motion does not shrink it. Caught, it shrinks
     away into the hands; a jump (a kickoff reset) clears it. */
  function makeTrail(scene, { length = 4.5, width = 0.4, colour = 0xffc21a, core = 0xfffbe6 } = {}) {
    const MAX = 80, STEP = 0.05;
    const pos = new Float32Array(MAX * 2 * 3), col = new Float32Array(MAX * 2 * 4);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
    const idx = [];
    for (let i = 0; i < MAX - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    geo.setIndex(idx);
    // Solid colour, not additive light: light washes out against the bright water.
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false,
      side: THREE.DoubleSide, fog: false }));
    mesh.frustumCulled = false; mesh.renderOrder = 5;
    scene.add(mesh);
    const pts = [], base = new THREE.Color(colour), hot = new THREE.Color(core), c = new THREE.Color();
    let budget = 0;
    const t = new THREE.Vector3(), side = new THREE.Vector3(), view = new THREE.Vector3();
    function clear() { pts.length = 0; budget = 0; geo.setDrawRange(0, 0); }
    function setColours(a, b) { base.set(a); hot.set(b); }
    function update(dt, ball, camera, free) {
      if (pts.length && pts[0].distanceTo(ball) > 4) clear();           // teleported
      if (!pts.length || pts[0].distanceTo(ball) > STEP) pts.unshift(ball.clone());
      else pts[0].copy(ball);
      budget = free ? length : Math.max(0, budget - dt * 14);           // caught: shrink into the hands
      let run = 0;                                                      // trim the tail to the budget
      for (let i = 1; i < pts.length; i++) {
        const d = pts[i].distanceTo(pts[i - 1]);
        if (run + d > budget) {
          if (budget > run) { pts[i].lerpVectors(pts[i - 1], pts[i], (budget - run) / d); pts.length = i + 1; } else pts.length = i;
          break;
        }
        run += d;
      }
      if (pts.length > MAX) pts.length = MAX;
      const n = pts.length;
      if (n < 2) { geo.setDrawRange(0, 0); return; }
      let along = 0;
      for (let i = 0; i < n; i++) {
        if (i) along += pts[i].distanceTo(pts[i - 1]);
        const k = Math.max(0, 1 - along / length);                      // 1 at the ball, 0 at the tail
        t.subVectors(pts[Math.max(0, i - 1)], pts[Math.min(n - 1, i + 1)]).normalize();
        view.subVectors(camera.position, pts[i]).normalize();
        side.crossVectors(t, view).normalize().multiplyScalar(width * 0.5 * Math.sqrt(k));
        pos.set([pts[i].x + side.x, pts[i].y + side.y, pts[i].z + side.z, pts[i].x - side.x, pts[i].y - side.y, pts[i].z - side.z], i * 6);
        c.copy(base).lerp(hot, Math.max(0, k * 2 - 1));                // white-hot at the ball, gold behind
        const a = Math.min(1, k * 1.6);
        col.set([c.r, c.g, c.b, a, c.r, c.g, c.b, a], i * 8);
      }
      geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true;
      geo.setDrawRange(0, (n - 1) * 6);
    }
    return { update, clear, setColours, mesh };
  }

  return { build, update, setGoalKits, setArena, pickArena, STADIUMS, TIMES, get arena() { return arena; }, goalBurst, techBurst, makeTrail, R, GOAL_Z };
})();
