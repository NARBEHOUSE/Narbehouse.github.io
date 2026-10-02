/** P3GL's three Vivid worlds and two quiet Cozy worlds, using a shared mesh kit. */
(function (root) {
  'use strict';
  const P3 = root.P3 = root.P3 || {};
  const TAU = Math.PI * 2;

  function world(ctx, build) {
    const { THREE: T, scene, camera, helpers: H, theme } = ctx;
    const low = ctx.quality === 'low', rnd = H.rng(ctx.seed);
    const group = new T.Group(); scene.add(group);
    const sky = H.skyDome(T, theme.sky); scene.add(sky);
    const cozy = theme.mode === 'cozy';
    scene.add(new T.HemisphereLight(cozy ? 0xc1d7ff : 0xffffff, cozy ? 0x162833 : 0x777eb8, cozy ? 1.2 : 2.1));
    const light = new T.DirectionalLight(cozy ? 0xd4e2ff : 0xfff0dc, cozy ? 1.6 : 2.5); light.position.set(-80, 140, 100); scene.add(light);
    camera.position.set(0, 15, 150); camera.lookAt(0, 0, -150);
    const anim = [], pulseMats = [], spheres = new Map(), materials = new Map();
    let time = 0, energy = 0, variant = 0;
    const s = {
      T, H, group, scene, camera, rnd, low, anim,
      mat(color, glow) {
        const key = color + ':' + (glow || 0);
        if (!materials.has(key)) {
          const m = new T.MeshStandardMaterial({ color, roughness: 0.42, metalness: 0.08, emissive: color, emissiveIntensity: glow || 0 });
          materials.set(key, m); if (glow) pulseMats.push({ m, glow });
        }
        return materials.get(key);
      },
      mesh(geo, color, parent, glow) { const m = new T.Mesh(geo, s.mat(color, glow)); (parent || group).add(m); return m; },
      ball(x, y, z, r, color, scale, parent, glow) {
        const detail = low ? 12 : 20;
        if (!spheres.has(detail)) spheres.set(detail, new T.SphereGeometry(1, detail, detail / 2));
        const m = s.mesh(spheres.get(detail), color, parent, glow); m.position.set(x, y, z);
        m.scale.set(r * (scale ? scale[0] : 1), r * (scale ? scale[1] : 1), r * (scale ? scale[2] : 1)); return m;
      },
      rod(a, b, r, color, parent) {
        const av = new T.Vector3(...a), bv = new T.Vector3(...b), d = bv.clone().sub(av);
        const m = s.mesh(new T.CylinderGeometry(r, r, d.length(), low ? 6 : 10), color, parent);
        m.position.copy(av.add(bv).multiplyScalar(0.5)); m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize()); return m;
      },
      tube(points, radius, color, parent) {
        return s.mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points.map(p => new T.Vector3(...p))), low ? 16 : 30, radius, low ? 5 : 8, false), color, parent);
      },
      cloud(x, y, z, size, color = '#fff7fd') {
        const g = new T.Group(); g.position.set(x, y, z); group.add(g);
        for (let j = 0; j < 5; j++) s.ball((j - 2) * size * 0.53, Math.sin(j * 2) * size * 0.15, 0, size * (0.7 + rnd() * 0.3), color, [1.3, 0.54, 0.7], g);
        anim.push(t => { g.position.x = x + Math.sin(t * 0.05 + x) * 5; }); return g;
      }
    };
    build(s);
    return {
      update(dt, t, beat, fever) {
        // A private clock makes reduced motion independent of game time.
        time += Math.min(dt, 0.1) * (ctx.reducedMotion ? 0.04 : cozy ? 0.45 : 1);
        energy += ((ctx.reducedMotion ? 0 : Math.min(0.7, (fever || 0) * 0.4)) - energy) * Math.min(1, dt * 2.5);
        anim.forEach(f => f(time, energy, variant));
        pulseMats.forEach(o => { o.m.emissiveIntensity = o.glow * (1 + energy * 0.35); });
      },
      resize(w, h) { H.fitCamera(camera, w, h, 50); },
      setVariant(n) {
        variant = Math.max(0, Math.min(19, n | 0));
        light.color.setHSL(0.09 + variant * 0.001, 0.12, 0.92);
        sky.material.uniforms.gain.value = 0.96 + (variant % 5) * 0.015;
      },
      pulse(kind, strength) { if (!ctx.reducedMotion) energy = Math.max(energy, Math.min(0.8, (strength || 1) * (kind === 'win' ? 0.6 : 0.18))); },
      dispose() { H.disposeTree(scene); scene.clear(); }
    };
  }

  function candy(s) {
    const { T, rnd, group, anim, low } = s;
    // Soft distant hills frame the board without adding moving detail behind it.
    [[-170, -130, -320, 100, '#ffa4d2'], [150, -145, -350, 130, '#a985ff'], [-310, -140, -280, 120, '#7bdbd4'], [310, -135, -310, 140, '#ffb99d']].forEach(([x, y, z, r, c]) => s.ball(x, y, z, r, c, [1.8, 0.7, 1]));
    for (let i = 0; i < (low ? 4 : 7); i++) s.cloud((i - 3) * 105, 96 + rnd() * 38, -380 - rnd() * 80, 26 + rnd() * 18);
    const candyColors = ['#ff63a9', '#72d9ee', '#a794ff', '#ffd56b'];
    const lollipop = (x, y, z, r, color) => {
      const g = new T.Group(); g.position.set(x, y, z); group.add(g);
      s.rod([0, -80, 0], [0, 0, 0], 2.3, '#fff5db', g);
      s.ball(0, 0, 0, r, color, [1, 1, 0.32], g);
      const points = [];
      for (let i = 0; i < 90; i++) { const a = i / 89 * TAU * 2.3, q = 1 + i / 89 * (r - 4); points.push([Math.cos(a) * q, Math.sin(a) * q, r * 0.33]); }
      s.tube(points, 1.65, '#fff5eb', g);
      const phase = rnd() * TAU; anim.push(t => { g.rotation.z = Math.sin(t * 0.23 + phase) * 0.025; });
    };
    [[-148, -12, -170, 31], [160, 21, -230, 42], [-245, 6, -260, 43], [265, -28, -230, 26], [-108, -72, -100, 23], [118, -85, -115, 25]].forEach((p, i) => lollipop(...p, candyColors[i % 4]));
    // A frosted donut on the horizon and tiny sugar beads.
    const donut = new T.Group(); donut.position.set(175, 95, -420); donut.rotation.set(0.1, -0.18, 0.15); group.add(donut);
    s.mesh(new T.TorusGeometry(43, 17, low ? 10 : 16, low ? 32 : 56), '#edaa70', donut);
    const icing = s.mesh(new T.TorusGeometry(43, 15.3, low ? 10 : 16, low ? 32 : 56), '#ff6fad', donut); icing.position.z = 5;
    for (let i = 0; i < (low ? 12 : 28); i++) { const a = rnd() * TAU, r = 35 + rnd() * 17; const m = s.mesh(new T.CapsuleGeometry(0.9, 3, 2, 5), candyColors[i % 4], donut); m.position.set(Math.cos(a) * r, Math.sin(a) * r, 18); m.rotation.z = rnd() * TAU; }
    anim.push(t => { donut.rotation.z = 0.15 + Math.sin(t * 0.08) * 0.05; });
    for (const side of [-1, 1]) {
      for (let i = 0; i < (low ? 3 : 6); i++) {
        const x = side * (100 + i * 28), z = -80 - i * 25;
        s.ball(x, -103 - i * 5, z, 18 + rnd() * 12, candyColors[i % 4], [1, 0.8, 0.9]);
        for (let k = 0; k < 3; k++) s.ball(x + (rnd() - 0.5) * 17, -85 - i * 5 + rnd() * 5, z + 10, 1, '#fff8f2');
      }
    }
    motes(s, '#fff1cf', 40, false);
  }

  function carnival(s) {
    const { T, group, rnd, anim, low } = s;
    for (let i = 0; i < (low ? 6 : 10); i++) s.cloud((i % 5 - 2) * 130, -95 - Math.floor(i / 5) * 55, -250 - rnd() * 180, 45 + rnd() * 24, i % 2 ? '#ffedcc' : '#e9f8ff');
    const colors = ['#ff6676', '#ffc746', '#9c87ed', '#55cfce'];
    const balloon = (x, y, z, r, index) => {
      const g = new T.Group(); group.add(g); g.position.set(x, y, z);
      const geo = new T.SphereGeometry(r, low ? 24 : 40, low ? 16 : 24);
      const pos = geo.attributes.position, cols = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        const yy = pos.getY(i) / r, taper = 0.78 + yy * 0.22;
        const a = Math.atan2(pos.getZ(i), pos.getX(i));
        pos.setX(i, pos.getX(i) * taper); pos.setZ(i, pos.getZ(i) * taper); pos.setY(i, pos.getY(i) * 1.2);
        const c = new T.Color(Math.floor((a + Math.PI) / TAU * 12) % 2 ? '#fff6d6' : colors[index % 4]); c.toArray(cols, i * 3);
      }
      geo.setAttribute('color', new T.BufferAttribute(cols, 3)); geo.computeVertexNormals();
      const m = new T.Mesh(geo, new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.56, metalness: 0.03 })); g.add(m);
      const basket = s.mesh(new T.BoxGeometry(r * 0.4, r * 0.3, r * 0.35), '#b57a4a', g); basket.position.y = -r * 1.7;
      for (const sign of [-1, 1]) s.rod([sign * r * 0.2, -r, 0], [sign * r * 0.17, -r * 1.6, 0], 0.45, '#fff0d4', g);
      const phase = rnd() * TAU; anim.push(t => { g.position.y = y + Math.sin(t * 0.15 + phase) * 7; g.rotation.z = Math.sin(t * 0.13 + phase) * 0.055; });
    };
    [[-170, 20, -185, 36], [200, 30, -300, 54], [-280, 100, -420, 33], [120, 135, -390, 24], [295, -25, -350, 31]].forEach((p, i) => balloon(...p, i));
    // A working ferris wheel seen through the cloud bank at the left edge.
    const wheel = new T.Group(); wheel.position.set(-250, -78, -310); group.add(wheel);
    s.rod([-31, -85, 0], [0, 0, 0], 2.1, '#faf1d6', wheel); s.rod([31, -85, 0], [0, 0, 0], 2.1, '#faf1d6', wheel);
    const spin = new T.Group(); wheel.add(spin);
    s.mesh(new T.TorusGeometry(70, 1.7, 6, 64), '#fff4bf', spin, 0.3);
    const cars = [];
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * TAU, x = Math.cos(a) * 70, y = Math.sin(a) * 70;
      s.rod([0, 0, 0], [x, y, 0], 0.8, '#ffdc8b', spin);
      const car = s.mesh(new T.BoxGeometry(13, 10, 9), colors[i % 4], spin); car.position.set(x, y - 4, 0); cars.push(car);
    }
    anim.push(t => { spin.rotation.z = t * 0.06; cars.forEach(c => { c.rotation.z = -spin.rotation.z; }); });
    // Kites and silk tails at the opposite edge.
    for (let i = 0; i < (low ? 2 : 4); i++) {
      const g = new T.Group(); g.position.set(120 + i * 50, 70 - i * 20, -200 - i * 70); group.add(g);
      const shape = new T.Shape(); shape.moveTo(0, 23); shape.lineTo(15, 0); shape.lineTo(0, -25); shape.lineTo(-15, 0); shape.closePath();
      const mat = s.mat(colors[(i + 1) % 4]); mat.side = T.DoubleSide;
      g.add(new T.Mesh(new T.ShapeGeometry(shape), mat));
      s.rod([0, -25, 1], [0, 23, 1], 0.5, '#fff4db', g); s.rod([-15, 0, 1], [15, 0, 1], 0.5, '#fff4db', g);
      s.tube([[0, -24, 0], [10, -40, 0], [-5, -59, 0], [9, -76, 0]], 0.7, '#fff1d1', g);
      for (let k = 0; k < 3; k++) { const bow = s.mesh(new T.OctahedronGeometry(3), colors[k % 4], g); bow.position.set(k % 2 ? -1 : 8, -39 - k * 16, 0); bow.scale.set(1.7, 0.7, 0.4); }
      anim.push(t => { g.rotation.z = Math.sin(t * 0.25 + i) * 0.1; g.position.y = 70 - i * 20 + Math.sin(t * 0.17 + i) * 6; });
    }
    motes(s, '#fff4be', low ? 30 : 65, false);
  }

  function reef(s) {
    const { T, group, rnd, anim, low, scene } = s;
    scene.fog = new T.FogExp2('#067b95', 0.0015);
    // Sea bed and soft sun shafts stay behind all of the living reef.
    s.ball(0, -160, -230, 300, '#5ccdc1', [2, 0.24, 1]);
    const rayMaterial = new T.MeshBasicMaterial({ color: '#a7ffdf', transparent: true, opacity: 0.035, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending });
    for (let i = 0; i < 7; i++) { const ray = new T.Mesh(new T.PlaneGeometry(16 + i * 3, 500), rayMaterial); ray.position.set(-280 + i * 100, 35, -380); ray.rotation.z = -0.25; group.add(ray); anim.push(t => { ray.rotation.z = -0.25 + Math.sin(t * 0.07 + i) * 0.035; }); }
    const coralColors = ['#ff8972', '#ffbad1', '#af8dff', '#ffe078'];
    const branch = (g, x, y, z, length, angle, depth, color) => {
      const end = [x + Math.sin(angle) * length, y + Math.cos(angle) * length, z];
      s.rod([x, y, z], end, depth === 2 ? 3.8 : depth === 1 ? 2.4 : 1.4, color, g);
      s.ball(...end, depth === 2 ? 4 : 2.5, color, null, g, 0.08);
      if (depth > 0) for (const sign of [-1, 1]) branch(g, ...end, length * 0.65, angle + sign * 0.55, depth - 1, color);
    };
    for (const sign of [-1, 1]) {
      for (let i = 0; i < (low ? 3 : 5); i++) {
        const x = sign * (110 + i * 43), z = -115 - i * 42, g = new T.Group(); g.position.set(x, -100 - i * 10, z); group.add(g);
        branch(g, 0, 0, 0, 30 + rnd() * 20, (rnd() - 0.5) * 0.5, 2, coralColors[i % 4]);
        s.ball(x, -110 - i * 10, z, 24, '#688fbb', [1.6, 0.55, 1.1]);
        anim.push(t => { g.rotation.z = Math.sin(t * 0.22 + i + sign) * 0.02; });
      }
      for (let i = 0; i < (low ? 3 : 6); i++) {
        const g = new T.Group(); const x = sign * (155 + i * 27); g.position.set(x, -115, -240 - i * 15); group.add(g);
        const height = 50 + rnd() * 85;
        s.tube([[0, 0, 0], [-5, height * 0.35, 0], [5, height * 0.68, 0], [0, height, 0]], 2, '#3dc5a6', g);
        for (let k = 1; k <= 4; k++) { const leaf = s.ball((k % 2 ? -1 : 1) * 5, k * height / 5, 0, 9, k % 2 ? '#49dabb' : '#70e9b7', [0.55, 1.7, 0.14], g); leaf.rotation.z = (k % 2 ? 1 : -1) * 0.6; }
        anim.push(t => { g.rotation.z = Math.sin(t * 0.38 + i) * 0.06; });
      }
    }
    // Two small schools swim on loops at the edges, never over the pegs.
    for (let i = 0; i < (low ? 10 : 20); i++) {
      const side = i % 2 ? -1 : 1, g = new T.Group(); group.add(g);
      const r = 3 + rnd() * 2.3, z = -180 - rnd() * 210, x = side * (125 + rnd() * 135), y = -40 + rnd() * 170;
      s.ball(0, 0, 0, r, i % 3 ? '#ffe385' : '#ff9d91', [1.7, 0.75, 0.5], g);
      const tail = s.mesh(new T.ConeGeometry(r * 0.9, r * 1.5, 3), '#ff917a', g); tail.rotation.z = -Math.PI / 2; tail.position.x = -r * 2;
      s.ball(r, r * 0.15, r * 0.46, r * 0.15, '#153647', null, g);
      anim.push(t => { g.position.set(x + Math.sin(t * 0.16 + i) * 23, y + Math.sin(t * 0.31 + i) * 5, z); g.rotation.y = side < 0 ? Math.PI : 0; tail.rotation.y = Math.sin(t * 3 + i) * 0.25; });
    }
    // Wire spheres keep bubbles translucent without sorting artifacts.
    const bubbleGeo = new T.SphereGeometry(1, 10, 6), bubbleMat = new T.MeshBasicMaterial({ color: '#b9fff3', transparent: true, opacity: 0.18, wireframe: true, depthWrite: false });
    for (let i = 0; i < (low ? 12 : 28); i++) {
      const b = new T.Mesh(bubbleGeo, bubbleMat); const x = (i % 2 ? -1 : 1) * (120 + rnd() * 170), z = -100 - rnd() * 220, offset = rnd() * 290;
      b.scale.setScalar(1.5 + rnd() * 3); group.add(b); anim.push(t => { b.position.set(x + Math.sin(t * 0.3 + i) * 3, (offset + t * 5) % 290 - 130, z); });
    }
    motes(s, '#98ffe2', low ? 20 : 50, true);
  }

  function motes(s, color, count, rising) {
    const { T, H, rnd, scene, anim } = s;
    const f = H.pointField(T, count, { scale: 250, opacity: rising ? 0.24 : 0.35 });
    const offsets = [], c = new T.Color(color);
    for (let i = 0; i < count; i++) {
      f.positions[i * 3] = (rnd() - 0.5) * 700; f.positions[i * 3 + 1] = rnd() * 310 - 140; f.positions[i * 3 + 2] = -100 - rnd() * 350;
      offsets.push(f.positions[i * 3 + 1]); c.toArray(f.colors, i * 3); f.sizes[i] = 0.7 + rnd() * 1.3;
    }
    scene.add(f.points);
    anim.push(t => { for (let i = 0; i < count; i++) f.positions[i * 3 + 1] = rising ? (offsets[i] + 140 + t * 1.6) % 310 - 140 : offsets[i] + Math.sin(t * 0.2 + i) * 5; f.geometry.attributes.position.needsUpdate = true; });
  }

  // The two quieter mesh worlds share the same geometry/lifetime helpers.
  function lake(s) {
    const { T, group, scene, rnd, anim, low } = s;
    scene.fog = new T.FogExp2('#122847', 0.0014);
    s.ball(-290, 125, -390, 30, '#fff3cd', null, null, 1.2);
    for (let i = 0; i < 7; i++) s.ball((i - 3) * 120, -64, -400 - rnd() * 90, 80 + rnd() * 35, i % 2 ? '#253c6c' : '#344879', [1.4, 0.6, 0.7]);
    const water = s.mesh(new T.PlaneGeometry(1600, 1600), '#183f67'); water.rotation.x = -Math.PI / 2; water.position.set(0, -91, -250); water.material.roughness = 0.23; water.material.metalness = 0.3;
    // Long broken reflections of the moon on the water, without a mirror render.
    for (let i = 0; i < (low ? 12 : 22); i++) {
      const line = s.mesh(new T.PlaneGeometry(12 + i * 2.7, 1.2), i % 2 ? '#5c86aa' : '#809bad', null, 0.18); line.rotation.x = -Math.PI / 2; line.position.set(-175 + Math.sin(i) * 8, -90.5, -335 + i * 12);
      anim.push(t => { line.scale.x = 0.8 + Math.sin(t * 0.4 + i) * 0.15; });
    }
    // Reed banks and glowing water lilies at the edges.
    for (const sign of [-1, 1]) {
      for (let i = 0; i < (low ? 8 : 15); i++) {
        const g = new T.Group(), x = sign * (100 + rnd() * 125), z = -90 - rnd() * 210, height = 12 + rnd() * 35;
        g.position.set(x, -91, z); group.add(g); s.tube([[0, 0, 0], [2, height * 0.6, 0], [5, height, 0]], 0.65, '#406f73', g);
        const tip = s.mesh(new T.CapsuleGeometry(1.1, 6, 3, 6), '#9c856e', g); tip.position.set(5, height, 0);
        anim.push(t => { g.rotation.z = Math.sin(t * 0.32 + i) * 0.035; });
      }
      for (let i = 0; i < 4; i++) {
        const x = sign * (118 + i * 39), z = -100 - i * 45;
        s.ball(x, -90, z, 9, '#37796f', [1.2, 0.07, 0.9]);
        for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; s.ball(x + Math.cos(a) * 2.4, -87, z + Math.sin(a) * 2.4, 2.6, '#f0c4ed', [0.7, 1, 0.8], null, 0.12); }
        s.ball(x, -85, z, 1.8, '#ffe2a2', null, null, 0.5);
      }
    }
    // A small rowboat drifts near the far shore.
    const boat = new T.Group(); boat.position.set(180, -84, -255); group.add(boat);
    s.ball(0, 0, 0, 18, '#6c5561', [1.8, 0.28, 0.65], boat); s.rod([-12, 5, 0], [12, 5, 0], 1.5, '#b49c86', boat); s.rod([-8, 3, -10], [22, 3, 16], 0.9, '#c7b293', boat);
    const lantern = s.ball(0, 9, 0, 2.2, '#ffc47a', null, boat, 1.2);
    anim.push(t => { boat.position.y = -84 + Math.sin(t * 0.6) * 0.6; boat.rotation.z = Math.sin(t * 0.36) * 0.017; lantern.material.emissiveIntensity = 1.1 + Math.sin(t * 0.5) * 0.05; });
    motes(s, '#b8d1ff', low ? 55 : 120, false);
  }

  function snow(s) {
    const { T, H, group, scene, rnd, anim, low } = s;
    scene.fog = new T.FogExp2('#304b70', 0.0012);
    s.ball(300, 130, -420, 23, '#eff7ff', null, null, 0.65);
    s.ball(0, -163, -250, 300, '#b7cce4', [2, 0.27, 1]);
    for (let i = 0; i < 5; i++) s.ball((i - 2) * 180, -95, -460, 130, i % 2 ? '#7894b9' : '#98b0cc', [1.4, 0.7, 1]);
    // A soft aurora curtain sweeps only the distant sky.
    const aurora = new T.Mesh(new T.PlaneGeometry(900, 250), new T.ShaderMaterial({
      transparent: true, depthWrite: false, blending: T.AdditiveBlending,
      uniforms: { uTime: { value: 0 } },
      vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: `varying vec2 vUv;uniform float uTime;void main(){float ribbon=0.45+0.1*sin(vUv.x*12.0+uTime*0.06)+0.08*sin(vUv.x*21.0-uTime*0.05);float glow=exp(-pow((vUv.y-ribbon)*9.0,2.0));float edge=smoothstep(0.0,0.18,vUv.x)*(1.0-smoothstep(0.82,1.0,vUv.x));vec3 col=mix(vec3(0.15,0.8,0.55),vec3(0.45,0.26,0.8),vUv.x);gl_FragColor=vec4(col,glow*edge*0.19);}`
    })); aurora.position.set(0, 105, -590); scene.add(aurora); anim.push(t => { aurora.material.uniforms.uTime.value = t; });
    const house = (x, y, z, size, color) => {
      const g = new T.Group(); g.position.set(x, y, z); group.add(g);
      const body = s.mesh(new T.BoxGeometry(size * 1.5, size, size), color, g); body.position.y = size * 0.5;
      const roof = s.mesh(new T.ConeGeometry(size * 1.12, size * 0.7, 4), '#dce9f5', g); roof.rotation.y = Math.PI / 4; roof.scale.z = 0.8; roof.position.y = size * 1.22;
      const door = s.mesh(new T.BoxGeometry(size * 0.23, size * 0.55, 0.4), '#433f58', g); door.position.set(0, size * 0.275, size * 0.51);
      for (const sign of [-1, 1]) {
        const window = s.mesh(new T.BoxGeometry(size * 0.25, size * 0.29, 0.5), '#ffc77c', g, 0.8); window.position.set(sign * size * 0.45, size * 0.57, size * 0.51);
        s.rod([sign * size * 0.45, size * 0.425, size * 0.53], [sign * size * 0.45, size * 0.715, size * 0.53], 0.4, '#544654', g);
      }
      const chimney = s.mesh(new T.BoxGeometry(size * 0.18, size * 0.6, size * 0.2), '#857183', g); chimney.position.set(size * 0.4, size * 1.25, 0);
      if (!low) for (let i = 0; i < 3; i++) { const puff = s.ball(size * 0.4, size * 1.65 + i * 5, 0, 3 + i, '#91a6bf', [1.2, 0.6, 1], g); anim.push(t => { puff.position.x = size * 0.4 + Math.sin(t * 0.16 + i) * 3 + i * 2; }); }
    };
    [[-145, -100, -180, 24, '#9e7f96'], [175, -102, -230, 31, '#607d9a'], [-270, -108, -310, 35, '#738cb5'], [310, -113, -350, 27, '#a38b9c']].forEach(p => house(...p));
    for (const sign of [-1, 1]) for (let i = 0; i < (low ? 4 : 7); i++) {
      const x = sign * (115 + i * 31), z = -140 - i * 43, size = 16 + rnd() * 13;
      s.rod([x, -113, z], [x, -80, z], 1.8, '#665e75');
      for (let k = 0; k < 3; k++) { const cone = s.mesh(new T.ConeGeometry(size * (1 - k * 0.2), size * 1.2, low ? 7 : 12), k % 2 ? '#cee0ef' : '#8daac4'); cone.position.set(x, -95 + k * size * 0.6, z); }
    }
    const f = H.pointField(T, low ? 80 : 180, { opacity: 0.55, scale: 300, additive: false }), offsets = [];
    for (let i = 0; i < f.count; i++) { f.positions[i * 3] = (rnd() - 0.5) * 650; f.positions[i * 3 + 1] = rnd() * 330 - 130; f.positions[i * 3 + 2] = -100 - rnd() * 350; offsets.push(f.positions[i * 3 + 1]); f.colors.set([0.85, 0.92, 1], i * 3); f.sizes[i] = 0.7 + rnd() * 1.5; }
    scene.add(f.points); anim.push(t => { for (let i = 0; i < f.count; i++) f.positions[i * 3 + 1] = (offsets[i] + 130 - t * 4 % 330 + 330) % 330 - 130; f.geometry.attributes.position.needsUpdate = true; });
  }

  P3.backdrops.register('sugar-rush', ctx => world(ctx, candy));
  P3.backdrops.register('carnival-skies', ctx => world(ctx, carnival));
  P3.backdrops.register('coral-groove', ctx => world(ctx, reef));
  P3.backdrops.register('moonlit-lake', ctx => world(ctx, lake));
  P3.backdrops.register('snowglobe-hollow', ctx => world(ctx, snow));
})(typeof window !== 'undefined' ? window : globalThis);
