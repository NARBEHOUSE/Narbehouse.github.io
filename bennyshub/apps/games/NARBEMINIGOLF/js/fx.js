/**
 * NARBE Mini Golf — effects: particles, the aim line, markers.
 *
 * Particles are two pooled systems, so a confetti storm costs two draw calls:
 *   bits  — instanced flat quads (confetti, leaves, droplets) that tumble
 *   glows — additive points (sparkles, fireworks, sand dust)
 *
 * The aim line is a ribbon laid on the turf with scrolling dashes over a dark
 * outline, thick enough to read from across the room, ending in an arrowhead.
 */
(function () {
  'use strict';

  const U = MG.util, A = MG.art, C = MG.course;
  const S = C.S;

  let scene = null, view = null;

  /* ── Bits (instanced quads) ───────────────────────────────────────────── */

  const MAX_BITS = 900;
  let bitsMesh = null;
  const bits = [];
  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpV = new THREE.Vector3(), tmpS = new THREE.Vector3(), tmpC = new THREE.Color();
  const AXIS = new THREE.Vector3();

  function initBits() {
    const geo = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false });
    bitsMesh = new THREE.InstancedMesh(geo, mat, MAX_BITS);
    bitsMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    bitsMesh.count = 0;
    bitsMesh.frustumCulled = false;
    for (let i = 0; i < MAX_BITS; i++) bitsMesh.setColorAt(i, tmpC.set('#ffffff'));
    scene.add(bitsMesh);
  }

  function addBit(p) {
    if (bits.length >= MAX_BITS) bits.shift();
    bits.push(p);
  }

  function updateBits(dt) {
    let n = 0;
    for (let i = bits.length - 1; i >= 0; i--) {
      const b = bits[i];
      b.life -= dt;
      if (b.life <= 0 || b.pos.y < b.floor - 0.5) { bits.splice(i, 1); continue; }
      b.vel.y -= b.g * dt;
      const drag = Math.exp(-b.drag * dt);
      b.vel.x *= drag; b.vel.y *= drag; b.vel.z *= drag;
      if (b.flutter) { b.vel.x += Math.sin(b.t * 3 + b.seed) * b.flutter * dt; b.vel.z += Math.cos(b.t * 2.6 + b.seed) * b.flutter * dt; }
      b.pos.addScaledVector(b.vel, dt);
      if (b.pos.y < b.floor) { b.pos.y = b.floor; b.vel.set(0, 0, 0); b.spin *= 0.9; b.g = 0; }
      b.t += dt;
      b.angle += b.spin * dt;
    }
    for (let i = 0; i < bits.length; i++) {
      const b = bits[i];
      const fade = Math.min(1, b.life / 0.6);
      tmpQ.setFromAxisAngle(b.axis, b.angle);
      tmpS.set(b.size * fade, b.size * b.aspect * fade, 1);
      tmpM.compose(b.pos, tmpQ, tmpS);
      bitsMesh.setMatrixAt(n, tmpM);
      bitsMesh.setColorAt(n, b.color);
      n++;
    }
    bitsMesh.count = n;
    bitsMesh.instanceMatrix.needsUpdate = true;
    if (bitsMesh.instanceColor) bitsMesh.instanceColor.needsUpdate = true;
  }

  /* ── Glows (additive points) ──────────────────────────────────────────── */

  const MAX_GLOWS = 1200;
  let glowPoints = null, glowGeo = null;
  const glows = [];
  const GLOW_VS = `
    attribute float size; attribute vec3 tint; attribute float alpha;
    varying vec3 vTint; varying float vAlpha;
    void main() {
      vTint = tint; vAlpha = alpha;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = size * (300.0 / -mv.z);
      gl_Position = projectionMatrix * mv;
    }`;
  const GLOW_FS = `
    uniform sampler2D map; varying vec3 vTint; varying float vAlpha;
    void main() {
      vec4 t = texture2D(map, gl_PointCoord);
      gl_FragColor = vec4(vTint * t.rgb, t.a * vAlpha);
    }`;

  function initGlows() {
    glowGeo = new THREE.BufferGeometry();
    glowGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_GLOWS * 3), 3).setUsage(THREE.DynamicDrawUsage));
    glowGeo.setAttribute('size', new THREE.BufferAttribute(new Float32Array(MAX_GLOWS), 1).setUsage(THREE.DynamicDrawUsage));
    glowGeo.setAttribute('tint', new THREE.BufferAttribute(new Float32Array(MAX_GLOWS * 3), 3).setUsage(THREE.DynamicDrawUsage));
    glowGeo.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(MAX_GLOWS), 1).setUsage(THREE.DynamicDrawUsage));
    glowGeo.setDrawRange(0, 0);
    const mat = new THREE.ShaderMaterial({
      vertexShader: GLOW_VS, fragmentShader: GLOW_FS,
      uniforms: { map: { value: A.glowSprite() } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    });
    glowPoints = new THREE.Points(glowGeo, mat);
    glowPoints.frustumCulled = false;
    scene.add(glowPoints);
  }

  function addGlow(p) {
    if (glows.length >= MAX_GLOWS) glows.shift();
    glows.push(p);
  }

  function updateGlows(dt) {
    const pos = glowGeo.attributes.position.array, size = glowGeo.attributes.size.array;
    const tint = glowGeo.attributes.tint.array, alpha = glowGeo.attributes.alpha.array;
    let n = 0;
    for (let i = glows.length - 1; i >= 0; i--) {
      const g = glows[i];
      g.life -= dt;
      if (g.life <= 0) { glows.splice(i, 1); continue; }
      g.vel.y -= g.g * dt;
      const drag = Math.exp(-g.drag * dt);
      g.vel.multiplyScalar(drag);
      g.pos.addScaledVector(g.vel, dt);
      if (g.trail && Math.random() < dt * 30) addGlow({ pos: g.pos.clone(), vel: new THREE.Vector3(), g: 0.6, drag: 1, life: 0.45, max: 0.45, size: g.size * 0.5, color: g.color, trail: false });
    }
    for (let i = 0; i < glows.length && n < MAX_GLOWS; i++) {
      const g = glows[i];
      const k = g.life / g.max;
      pos[n * 3] = g.pos.x; pos[n * 3 + 1] = g.pos.y; pos[n * 3 + 2] = g.pos.z;
      size[n] = g.size * (g.grow ? (1 + (1 - k) * g.grow) : 1);
      tint[n * 3] = g.color.r; tint[n * 3 + 1] = g.color.g; tint[n * 3 + 2] = g.color.b;
      alpha[n] = Math.min(1, k * 1.6) * (g.alpha || 1);
      n++;
    }
    glowGeo.setDrawRange(0, n);
    glowGeo.attributes.position.needsUpdate = true;
    glowGeo.attributes.size.needsUpdate = true;
    glowGeo.attributes.tint.needsUpdate = true;
    glowGeo.attributes.alpha.needsUpdate = true;
  }

  /* ── Bursts ───────────────────────────────────────────────────────────── */

  const CONFETTI = ['#ff4d6d', '#ffd23f', '#3ddc97', '#4cc9f0', '#b388eb', '#ff8c42', '#ffffff'];
  const rand = (a, b) => a + Math.random() * (b - a);

  function randomAxis() {
    return new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize();
  }

  /**
   * kind: confetti | splash | sand | leaves | sparkle | firework | bumper | tunnel
   * at:   THREE.Vector3 (world)
   */
  function burst(kind, at, opts) {
    opts = opts || {};
    const floor = opts.floor !== undefined ? opts.floor : at.y - 0.6;
    if (kind === 'confetti') {
      const n = opts.count || 160;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, up = rand(6, 15), out = rand(2, 7);
        addBit({
          pos: at.clone().add(tmpV.set(rand(-0.4, 0.4), rand(0, 0.5), rand(-0.4, 0.4))),
          vel: new THREE.Vector3(Math.cos(a) * out, up, Math.sin(a) * out),
          g: 9, drag: 1.6, flutter: 6, seed: Math.random() * 10, t: 0,
          axis: randomAxis(), angle: Math.random() * 6, spin: rand(4, 12),
          size: rand(0.16, 0.28), aspect: rand(0.5, 1), life: rand(3, 5), floor,
          color: new THREE.Color(CONFETTI[(Math.random() * CONFETTI.length) | 0])
        });
      }
    } else if (kind === 'splash') {
      const n = opts.count || 70;
      const col = new THREE.Color(opts.color || '#d8f1ff');
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, out = rand(0.6, 3.2);
        addBit({
          pos: at.clone(), vel: new THREE.Vector3(Math.cos(a) * out, rand(3, 8), Math.sin(a) * out),
          g: 16, drag: 0.6, axis: randomAxis(), angle: 0, spin: rand(2, 8),
          size: rand(0.08, 0.18), aspect: 1, life: rand(0.6, 1.2), floor: at.y - 0.05, color: col
        });
      }
      // A ring of foam glows on the surface.
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        addGlow({ pos: at.clone(), vel: new THREE.Vector3(Math.cos(a) * 2.4, 0, Math.sin(a) * 2.4), g: 0, drag: 2.2, life: 0.9, max: 0.9, size: 1.1, color: new THREE.Color('#bfe6ff'), alpha: 0.7, grow: 0.8 });
      }
    } else if (kind === 'sand') {
      const col = new THREE.Color(opts.color || '#e9d39a');
      for (let i = 0; i < 26; i++) {
        const a = Math.random() * Math.PI * 2, out = rand(0.5, 2.2);
        addGlow({ pos: at.clone().add(tmpV.set(0, 0.1, 0)), vel: new THREE.Vector3(Math.cos(a) * out, rand(1, 3), Math.sin(a) * out), g: 4, drag: 2.5, life: rand(0.5, 1), max: 1, size: rand(0.6, 1.2), color: col, alpha: 0.45, grow: 1 });
      }
      for (let i = 0; i < 20; i++) {
        const a = Math.random() * Math.PI * 2, out = rand(0.5, 2.4);
        addBit({ pos: at.clone(), vel: new THREE.Vector3(Math.cos(a) * out, rand(2, 4), Math.sin(a) * out), g: 14, drag: 1, axis: randomAxis(), angle: 0, spin: 4, size: 0.07, aspect: 1, life: 0.8, floor: at.y - 0.05, color: col });
      }
    } else if (kind === 'leaves') {
      const cols = opts.colors || ['#3c9a39', '#4fb046', '#2f8a33'];
      for (let i = 0; i < (opts.count || 26); i++) {
        const a = Math.random() * Math.PI * 2, out = rand(1, 3.5);
        addBit({ pos: at.clone().add(tmpV.set(rand(-0.5, 0.5), rand(0.3, 1.2), rand(-0.5, 0.5))), vel: new THREE.Vector3(Math.cos(a) * out, rand(2, 5), Math.sin(a) * out), g: 5, drag: 1.8, flutter: 4, seed: Math.random() * 9, t: 0, axis: randomAxis(), angle: Math.random() * 6, spin: rand(3, 8), size: rand(0.18, 0.3), aspect: 0.6, life: rand(1.5, 2.5), floor, color: new THREE.Color(cols[(Math.random() * cols.length) | 0]) });
      }
    } else if (kind === 'ripple') {
      // A soft ring spreading on the water (the alligator, a ball sinking).
      for (let i = 0; i < 22; i++) {
        const a = (i / 22) * Math.PI * 2;
        addGlow({ pos: at.clone(), vel: new THREE.Vector3(Math.cos(a) * 1.3, 0, Math.sin(a) * 1.3), g: 0, drag: 1.1, life: 1.4, max: 1.4, size: 0.75, color: new THREE.Color('#d7f1ff'), alpha: 0.55, grow: 0.5 });
      }
    } else if (kind === 'sparkle' || kind === 'bumper' || kind === 'tunnel') {
      const col = new THREE.Color(opts.color || (kind === 'bumper' ? '#ffd23f' : '#ffffff'));
      const n = opts.count || 18;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, out = rand(1, 4);
        addGlow({ pos: at.clone(), vel: new THREE.Vector3(Math.cos(a) * out, rand(1, 4), Math.sin(a) * out), g: 3, drag: 2, life: rand(0.4, 0.8), max: 0.8, size: rand(0.5, 0.9), color: col });
      }
    } else if (kind === 'firework') {
      const col = new THREE.Color(opts.color || CONFETTI[(Math.random() * 5) | 0]);
      const n = opts.count || 80;
      for (let i = 0; i < n; i++) {
        const v = randomAxis().multiplyScalar(rand(5, 9));
        addGlow({ pos: at.clone(), vel: v, g: 2.5, drag: 1.2, life: rand(1.1, 1.7), max: 1.7, size: rand(0.8, 1.3), color: col, trail: true });
      }
      addGlow({ pos: at.clone(), vel: new THREE.Vector3(), g: 0, drag: 0, life: 0.35, max: 0.35, size: 9, color: new THREE.Color('#fff7d6'), grow: 0.5 });
    }
  }

  /** Launch a rocket that bursts high above `at`. */
  const rockets = [];
  function firework(at, color) {
    rockets.push({ pos: at.clone(), vel: new THREE.Vector3(rand(-1, 1), rand(14, 18), rand(-1, 1)), t: rand(0.7, 1.0), color });
  }

  function updateRockets(dt) {
    for (let i = rockets.length - 1; i >= 0; i--) {
      const r = rockets[i];
      r.vel.y -= 9 * dt;
      r.pos.addScaledVector(r.vel, dt);
      addGlow({ pos: r.pos.clone(), vel: new THREE.Vector3(rand(-0.3, 0.3), -1, rand(-0.3, 0.3)), g: 1, drag: 1, life: 0.35, max: 0.35, size: 0.55, color: new THREE.Color('#ffe9a8') });
      r.t -= dt;
      if (r.t <= 0) {
        burst('firework', r.pos, { color: r.color });
        if (MG.audio) MG.audio.play('pop', 0.35);
        rockets.splice(i, 1);
      }
    }
  }

  /* ── Aim line ─────────────────────────────────────────────────────────── */

  const MAX_RIB = 1200;
  let ribbon = null, outline = null, arrow = null, arrowOut = null, ghost = null, ghostRing = null;
  let dashTex = null;

  function makeRibbonMesh(mat) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_RIB * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(MAX_RIB * 2 * 2), 2).setUsage(THREE.DynamicDrawUsage));
    const idx = new Uint16Array((MAX_RIB - 1) * 6);
    for (let i = 0; i < MAX_RIB - 1; i++) {
      const a = i * 2;
      idx.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], i * 6);
    }
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.setDrawRange(0, 0);
    const m = new THREE.Mesh(g, mat);
    m.frustumCulled = false;
    m.renderOrder = 5;
    return m;
  }

  function initAim() {
    dashTex = A.dashTexture().clone();
    dashTex.needsUpdate = true;
    dashTex.wrapS = THREE.RepeatWrapping;
    ribbon = makeRibbonMesh(new THREE.MeshBasicMaterial({ map: dashTex, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
    outline = makeRibbonMesh(new THREE.MeshBasicMaterial({ color: '#0b1d14', transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }));
    outline.renderOrder = 4;
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, -1, 0, -0.62, -1, 0, 0.62], 3));
    tri.setIndex([0, 1, 2]);
    arrow = new THREE.Mesh(tri, new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
    arrow.renderOrder = 6;
    arrowOut = new THREE.Mesh(tri, new THREE.MeshBasicMaterial({ color: '#0b1d14', side: THREE.DoubleSide, depthWrite: false, transparent: true, opacity: 0.6 }));
    arrowOut.renderOrder = 4;
    ghost = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.35, depthWrite: false }));
    ghostRing = new THREE.Mesh(new THREE.RingGeometry(1.25, 1.6, 32), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
    ghostRing.rotation.x = -Math.PI / 2;
    for (const m of [ribbon, outline, arrow, arrowOut, ghost, ghostRing]) { m.visible = false; scene.add(m); }
  }

  /**
   * The predicted path keeps only its corners, so a straight putt is just two
   * points. Laid on the turf like that, the ribbon would cut straight through
   * a mound. Add points every few px so it can follow every hill and bridge.
   */
  function densify(seg, step) {
    const out = [seg[0]];
    for (let i = 1; i < seg.length; i++) {
      const a = seg[i - 1], b = seg[i];
      const n = Math.min(120, Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step)));
      for (let k = 1; k <= n; k++) out.push({ x: a.x + (b.x - a.x) * k / n, y: a.y + (b.y - a.y) * k / n });
    }
    return out;
  }

  function fillRibbon(mesh, segs, width, lift, uScale) {
    const pos = mesh.geometry.attributes.position.array, uv = mesh.geometry.attributes.uv.array;
    let v = 0;
    const idx = mesh.geometry.index.array;
    // Rebuild indices so separate segments (tunnel jumps) are not joined.
    let ii = 0;
    for (const rawSeg of segs) {
      const seg = densify(rawSeg, 12);
      let dist = 0;
      const start = v;
      for (let i = 0; i < seg.length && v < MAX_RIB; i++) {
        const p = seg[i];
        const a = seg[Math.max(0, i - 1)], b = seg[Math.min(seg.length - 1, i + 1)];
        let tx = b.x - a.x, ty = b.y - a.y;
        const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
        if (i > 0) dist += Math.hypot(p.x - seg[i - 1].x, p.y - seg[i - 1].y);
        const nx = -ty * width / 2, ny = tx * width / 2;
        // Each edge sits on the turf under it, so the ribbon also lies flat
        // across a side-slope instead of burying one edge in the hill.
        const yl = view.surfaceY(p.x + nx, p.y + ny) + lift, yr = view.surfaceY(p.x - nx, p.y - ny) + lift;
        pos[v * 6] = (p.x + nx) * S; pos[v * 6 + 1] = yl; pos[v * 6 + 2] = (p.y + ny) * S;
        pos[v * 6 + 3] = (p.x - nx) * S; pos[v * 6 + 4] = yr; pos[v * 6 + 5] = (p.y - ny) * S;
        uv[v * 4] = dist * uScale; uv[v * 4 + 1] = 0; uv[v * 4 + 2] = dist * uScale; uv[v * 4 + 3] = 1;
        if (v > start) {
          const a2 = (v - 1) * 2;
          idx[ii++] = a2; idx[ii++] = a2 + 1; idx[ii++] = a2 + 2;
          idx[ii++] = a2 + 1; idx[ii++] = a2 + 3; idx[ii++] = a2 + 2;
        }
        v++;
      }
    }
    mesh.geometry.index.needsUpdate = true;
    mesh.geometry.setDrawRange(0, ii);
    mesh.geometry.attributes.position.needsUpdate = true;
    mesh.geometry.attributes.uv.needsUpdate = true;
  }

  /**
   * Draw the aim line.
   *   points  [{x,y,jump?}] in course px, starting at the ball
   *   o.width px · o.color · o.ghostR (px; show a ghost ball where it stops)
   *   o.startGap px to leave clear around the ball
   */
  function setAim(points, o) {
    o = o || {};
    if (!points || points.length < 2) { hideAim(); return; }
    // Trim the start so the line begins just in front of the ball.
    const gap = o.startGap || 0;
    let pts = points.slice();
    let trimmed = 0;
    // (Works for a two-point line too — the Arrow aimer is just two points.)
    while (pts.length >= 2 && trimmed < gap) {
      const d = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      if (trimmed + d > gap || pts.length === 2) {
        const t = Math.min(1, (gap - trimmed) / Math.max(d, 1e-6));
        pts[0] = { x: pts[0].x + (pts[1].x - pts[0].x) * t, y: pts[0].y + (pts[1].y - pts[0].y) * t };
        break;
      }
      trimmed += d; pts.shift();
    }
    const arrowLen = o.width * 2.4;
    // Pull the line back so it meets the arrowhead's base.
    const segs = [[]];
    for (const p of pts) {
      if (p.jump) segs.push([]);
      segs[segs.length - 1].push(p);
    }
    const last = segs[segs.length - 1];
    let end = last[last.length - 1], prev = last[Math.max(0, last.length - 2)];
    // The head's base is arrowLen behind its tip; stop the line just inside it
    // so the line runs up to the head and the head sits on the end, never under it.
    let back = arrowLen * 0.85;
    while (last.length >= 2 && back > 0) {
      const a = last[last.length - 2], b = last[last.length - 1];
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      if (d > back) {
        const t = (d - back) / d;
        last[last.length - 1] = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
        break;
      }
      if (last.length === 2) { last.pop(); break; }   // the whole line fits under the head
      back -= d; last.pop();
    }
    const goodSegs = segs.filter(s => s.length >= 2);
    fillRibbon(ribbon, goodSegs, o.width, 0.07, 1 / (o.width * 5.5));
    fillRibbon(outline, goodSegs, o.width + Math.max(6, o.width * 0.6), 0.055, 0.01);
    ribbon.material.color.set(o.color || '#ffffff');
    ribbon.visible = outline.visible = true;

    const dir = Math.atan2(end.y - prev.y, end.x - prev.x);
    const ay = view.surfaceY(end.x, end.y) + 0.075;
    const sc = arrowLen * S;
    arrow.position.set(end.x * S, ay, end.y * S);
    arrow.rotation.set(0, -dir, 0);
    arrow.scale.set(sc, 1, sc);
    arrow.material.color.set(o.color || '#ffffff');
    arrowOut.position.set(end.x * S, ay - 0.012, end.y * S);
    arrowOut.rotation.set(0, -dir, 0);
    arrowOut.scale.set(sc * 1.35, 1, sc * 1.35);
    arrowOut.position.x += Math.cos(dir) * sc * 0.18; arrowOut.position.z += Math.sin(dir) * sc * 0.18;
    arrow.visible = arrowOut.visible = !o.noArrow;

    if (o.ghostR && o.ghostAt) {
      const g = o.ghostAt;
      const r = o.ghostR * S;
      ghost.scale.setScalar(r);
      ghost.position.set(g.x * S, view.surfaceY(g.x, g.y) + r, g.y * S);
      ghostRing.scale.setScalar(r);
      ghostRing.position.set(g.x * S, view.surfaceY(g.x, g.y) + 0.05, g.y * S);
      ghost.material.color.set(o.color || '#ffffff');
      ghostRing.material.color.set(o.color || '#ffffff');
      ghost.visible = ghostRing.visible = true;
    } else {
      ghost.visible = ghostRing.visible = false;
    }
  }

  function hideAim() {
    if (!ribbon) return;
    ribbon.visible = outline.visible = arrow.visible = arrowOut.visible = ghost.visible = ghostRing.visible = false;
  }

  /* ── "This is your ball" marker ───────────────────────────────────────── */

  let ring = null, chevron = null, markerOn = false, markerAt = new THREE.Vector3(), markerR = 1;

  function initMarker() {
    ring = new THREE.Mesh(new THREE.RingGeometry(1, 1.28, 40), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.renderOrder = 3;
    chevron = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.8, 4), new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.25 }));
    chevron.rotation.x = Math.PI;
    ring.visible = chevron.visible = false;
    scene.add(ring, chevron);
  }

  function showMarker(at, color, r) {
    markerOn = true;
    markerAt.copy(at);
    markerR = r;
    ring.material.color.set(color);
    chevron.material.color.set(color);
    chevron.material.emissive.set(color);
    ring.visible = chevron.visible = true;
  }

  function hideMarker() { markerOn = false; if (ring) ring.visible = chevron.visible = false; }

  /* ── Cup glow (the predicted line drops) ──────────────────────────────── */

  let cupGlow = null, cupGlowOn = false, cupGlowK = 0;

  function initCupGlow() {
    cupGlow = new THREE.Mesh(new THREE.RingGeometry(1, 1.6, 48), new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
    cupGlow.rotation.x = -Math.PI / 2;
    cupGlow.renderOrder = 3;
    scene.add(cupGlow);
  }

  function setCupGlow(on) { cupGlowOn = on; }

  /* ── Lifecycle ────────────────────────────────────────────────────────── */

  function init(sc) {
    scene = sc;
    initBits(); initGlows(); initAim(); initMarker(); initCupGlow();
  }

  /** Drop every particle and rocket at once (an instant replay starts clean). */
  function clearParticles() { bits.length = 0; glows.length = 0; rockets.length = 0; }

  function setView(v) {
    view = v;
    hideAim(); hideMarker();
    bits.length = 0; glows.length = 0; rockets.length = 0;
    const r = v.ch.cup.r * S;
    cupGlow.scale.setScalar(r * 1.08);
    cupGlow.position.copy(v.cupWorld).y += 0.04;
    cupGlowOn = false; cupGlowK = 0;
  }

  let clock = 0;
  function update(dt) {
    clock += dt;
    updateRockets(dt);
    updateBits(dt);
    updateGlows(dt);
    if (dashTex && ribbon.visible) dashTex.offset.x -= dt * 0.9;
    if (markerOn) {
      const pulse = 0.5 + 0.5 * Math.sin(clock * 4);
      ring.scale.setScalar(markerR * (1.55 + pulse * 0.25));
      ring.position.set(markerAt.x, markerAt.y - markerR + 0.04, markerAt.z);
      ring.material.opacity = 0.55 + pulse * 0.35;
      chevron.position.set(markerAt.x, markerAt.y + markerR + 1.1 + Math.abs(Math.sin(clock * 2.6)) * 0.45, markerAt.z);
      chevron.rotation.y = clock * 1.5;
    }
    cupGlowK = U.damp(cupGlowK, cupGlowOn ? 1 : 0, 8, dt);
    if (cupGlow) {
      const p = 0.5 + 0.5 * Math.sin(clock * 7);
      cupGlow.material.opacity = cupGlowK * (0.55 + p * 0.4);
      cupGlow.scale.setScalar((view ? view.ch.cup.r * S : 1) * (1.08 + p * 0.12));
      cupGlow.visible = cupGlowK > 0.02;
    }
  }

  MG.fx = { init, setView, update, burst, firework, clearParticles, setAim, hideAim, showMarker, hideMarker, setCupGlow };
})();
