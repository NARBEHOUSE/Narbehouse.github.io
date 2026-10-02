/**
 * Benny's P3GL — effects: particles, shards, rings, lightning, popups.
 *
 * Two instanced particle pools on the board scene (additive light, and
 * normal-blended shards/confetti), lightning as fading line strips, and DOM
 * popups for numbers and callouts (crisp text at any size, and screen
 * readers ignore them because the game speaks outcomes itself).
 *
 *   const fx = P3.fx.create(board.scene, layer)       layer = DOM element over the canvas
 *   fx.burst(x, y, opts) · fx.ring(x, y, color, size, life) · fx.lightning(x1, y1, x2, y2, color)
 *   fx.popup(x, y, text, cls) · fx.callout(text, sub, cls) · fx.confetti(n) · fx.update(dt)
 *   fx.setLayout(L) · fx.setReduced(bool) · fx.clear()
 */
(function (root) {
  'use strict';

  const P3 = root.P3 = root.P3 || {};
  const U = P3.util, C = P3.catalog;

  function create(scene, layer) {
    const THREE = root.THREE;
    const A = P3.art;
    const MAX = 1400;

    function pool(blend, renderOrder) {
      const geo = A.quadGeometry().clone();
      const tile = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 2), 2);
      const tint = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
      const alpha = new THREE.InstancedBufferAttribute(new Float32Array(MAX), 1);
      geo.setAttribute('aTile', tile); geo.setAttribute('aTint', tint); geo.setAttribute('aAlpha', alpha);
      const mesh = new THREE.InstancedMesh(geo, A.atlasMaterial(blend, { depthTest: false }), MAX);
      mesh.count = 0; mesh.frustumCulled = false; mesh.renderOrder = renderOrder;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(mesh);
      const P = {
        mesh, tile, tint, alpha, n: 0,
        x: new Float32Array(MAX), y: new Float32Array(MAX), vx: new Float32Array(MAX), vy: new Float32Array(MAX),
        life: new Float32Array(MAX), max: new Float32Array(MAX), s0: new Float32Array(MAX), s1: new Float32Array(MAX),
        rot: new Float32Array(MAX), vr: new Float32Array(MAX), g: new Float32Array(MAX), drag: new Float32Array(MAX),
        r: new Float32Array(MAX), gg: new Float32Array(MAX), b: new Float32Array(MAX), a0: new Float32Array(MAX),
        tu: new Float32Array(MAX), tv: new Float32Array(MAX), stretch: new Uint8Array(MAX)
      };
      return P;
    }
    const glow = pool('add', 12);
    const solid = pool('normal', 11);

    const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpP = new THREE.Vector3(), tmpS = new THREE.Vector3(), tmpC = new THREE.Color();
    let reduced = false, layout = null;

    function spawn(P, o) {
      if (P.n >= MAX) return;
      const i = P.n++;
      P.x[i] = o.x; P.y[i] = o.y; P.vx[i] = o.vx || 0; P.vy[i] = o.vy || 0;
      P.life[i] = 0; P.max[i] = o.life || 0.6;
      P.s0[i] = o.size || 10; P.s1[i] = o.size1 !== undefined ? o.size1 : (o.size || 10) * 0.2;
      P.rot[i] = o.rot || 0; P.vr[i] = o.vr || 0; P.g[i] = o.gravity || 0; P.drag[i] = o.drag || 0;
      tmpC.set(o.color || '#ffffff');
      const k = o.bright || 1;
      P.r[i] = tmpC.r * k; P.gg[i] = tmpC.g * k; P.b[i] = tmpC.b * k; P.a0[i] = o.alpha === undefined ? 1 : o.alpha;
      const uv = A.tileUV(o.tile || 'spark'); P.tu[i] = uv[0]; P.tv[i] = uv[1];
      P.stretch[i] = o.stretch ? 1 : 0;
    }

    /** A burst of particles at board point (x, y). */
    function burst(x, y, o) {
      o = o || {};
      let n = o.count || 14;
      if (reduced) n = Math.ceil(n * 0.35);
      const P = o.solid ? solid : glow;
      for (let k = 0; k < n; k++) {
        const a = (o.angle !== undefined ? o.angle : 0) + (Math.random() - 0.5) * (o.spread !== undefined ? o.spread : Math.PI * 2);
        const sp = (o.speed || 260) * (0.35 + Math.random() * 0.8) * (reduced ? 0.5 : 1);
        spawn(P, {
          x: x + (Math.random() - 0.5) * (o.jitter || 0), y: y + (Math.random() - 0.5) * (o.jitter || 0),
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          life: (o.life || 0.55) * (0.6 + Math.random() * 0.7),
          size: (o.size || 12) * (0.6 + Math.random() * 0.8), size1: o.size1,
          rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * (o.spin || 8),
          gravity: o.gravity !== undefined ? o.gravity : 300, drag: o.drag !== undefined ? o.drag : 1.5,
          color: Array.isArray(o.color) ? o.color[k % o.color.length] : o.color, bright: o.bright || 1.6,
          tile: o.tile || 'spark', alpha: o.alpha, stretch: o.stretch
        });
      }
    }

    function ring(x, y, color, size, life, width) {
      spawn(glow, { x, y, life: life || 0.45, size: (size || 60) * 0.3, size1: size || 60, color, bright: 2, tile: 'ringTile', drag: 0, gravity: 0, alpha: 0.95 });
    }

    function glowPuff(x, y, color, size, life) {
      spawn(glow, { x, y, life: life || 0.35, size: size || 50, size1: (size || 50) * 1.6, color, bright: 1.6, tile: 'halo', gravity: 0, alpha: 0.9 });
    }

    /* ── Lightning ──────────────────────────────────────────────────────── */
    const bolts = [];
    function lightning(x1, y1, x2, y2, color) {
      const segs = 12, pts = [];
      const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
      for (let i = 0; i <= segs; i++) {
        const u = i / segs, off = (i === 0 || i === segs) ? 0 : (Math.random() - 0.5) * len * 0.18;
        pts.push(new THREE.Vector3(x1 + dx * u + nx * off, -(y1 + dy * u + ny * off), 40));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({ color: new THREE.Color(color || '#b8a6ff').multiplyScalar(3), transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthTest: false });
      const line = new THREE.Line(geo, mat);
      line.renderOrder = 13;
      scene.add(line);
      bolts.push({ line, life: 0, max: 0.4 });
      glowPuff(x2, y2, color || '#b8a6ff', 40, 0.3);
    }

    /* ── DOM popups ─────────────────────────────────────────────────────── */
    function popup(x, y, text, cls) {
      if (!layer || !layout) return;
      const p = P3.layout.toScreen(layout, x, y);
      const d = document.createElement('div');
      d.className = 'fxPop ' + (cls || '');
      d.textContent = text;
      d.style.left = p.x + 'px'; d.style.top = p.y + 'px';
      d.style.fontSize = Math.max(13, Math.min(30, 30 * layout.scale + 6)) + 'px';
      layer.appendChild(d);
      setTimeout(() => d.remove(), 1300);
    }

    let calloutTimer = null;
    function callout(text, sub, cls) {
      if (!layer) return;
      let d = layer.querySelector('.fxCallout');
      if (!d) { d = document.createElement('div'); d.className = 'fxCallout'; layer.appendChild(d); }
      d.innerHTML = U.escapeHtml(text) + (sub ? '<small>' + U.escapeHtml(sub) + '</small>' : '');
      d.className = 'fxCallout ' + (cls || '');
      if (layout) { d.style.left = (layout.board.x + layout.board.w / 2) + 'px'; d.style.top = (layout.board.y + layout.board.h * 0.42) + 'px'; d.style.fontSize = Math.max(28, Math.min(84, layout.board.w * 0.085)) + 'px'; }
      void d.offsetWidth;
      d.classList.add('on');
      clearTimeout(calloutTimer);
      calloutTimer = setTimeout(() => d.classList.remove('on'), 1500);
    }

    function confetti(n, colors) {
      n = reduced ? Math.ceil((n || 120) * 0.3) : (n || 120);
      const cols = colors || ['#ff4fa3', '#ffd21f', '#38e1ff', '#3ddc84', '#9b5cff', '#ff7a1a'];
      const B = C.BOARD;
      for (let i = 0; i < n; i++) {
        spawn(solid, {
          x: Math.random() * B.W, y: -20 - Math.random() * 200, vx: (Math.random() - 0.5) * 120, vy: 120 + Math.random() * 260,
          life: 2.6 + Math.random() * 1.2, size: 14 + Math.random() * 10, size1: 12, rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 10,
          gravity: 120, drag: 0.4, color: cols[i % cols.length], bright: 1, tile: Math.random() < 0.3 ? 'star' : 'confetti'
        });
      }
    }

    function update(dt) {
      for (const P of [glow, solid]) {
        let w = 0;
        for (let i = 0; i < P.n; i++) {
          P.life[i] += dt;
          if (P.life[i] >= P.max[i]) continue;
          const dragK = Math.exp(-P.drag[i] * dt);
          P.vx[i] *= dragK; P.vy[i] = P.vy[i] * dragK + P.g[i] * dt;
          P.x[i] += P.vx[i] * dt; P.y[i] += P.vy[i] * dt; P.rot[i] += P.vr[i] * dt;
          if (w !== i) {
            for (const k of ['x', 'y', 'vx', 'vy', 'life', 'max', 's0', 's1', 'rot', 'vr', 'g', 'drag', 'r', 'gg', 'b', 'a0', 'tu', 'tv', 'stretch']) P[k][w] = P[k][i];
          }
          const u = P.life[w] / P.max[w];
          const s = U.lerp(P.s0[w], P.s1[w], u);
          const fade = u < 0.15 ? u / 0.15 : 1 - (u - 0.15) / 0.85;
          let sx = s, sy = s, rot = P.rot[w];
          if (P.stretch[w]) { const sp = Math.hypot(P.vx[w], P.vy[w]); sx = s * (1 + sp / 300); sy = s * 0.5; rot = Math.atan2(-P.vy[w], P.vx[w]); }
          tmpE.set(0, 0, rot); tmpQ.setFromEuler(tmpE);
          tmpP.set(P.x[w], -P.y[w], 50); tmpS.set(sx, sy, 1);
          tmpM.compose(tmpP, tmpQ, tmpS);
          P.mesh.setMatrixAt(w, tmpM);
          P.tile.setXY(w, P.tu[w], P.tv[w]);
          P.tint.setXYZ(w, P.r[w], P.gg[w], P.b[w]);
          P.alpha.setX(w, Math.max(0, fade) * P.a0[w]);
          w++;
        }
        P.n = w;
        P.mesh.count = w;
        P.mesh.instanceMatrix.needsUpdate = true; P.tile.needsUpdate = true; P.tint.needsUpdate = true; P.alpha.needsUpdate = true;
      }
      for (let i = bolts.length - 1; i >= 0; i--) {
        const b = bolts[i];
        b.life += dt;
        b.line.material.opacity = Math.max(0, 1 - b.life / b.max);
        if (b.life >= b.max) { scene.remove(b.line); b.line.geometry.dispose(); b.line.material.dispose(); bolts.splice(i, 1); }
      }
    }

    function clear() {
      glow.n = 0; solid.n = 0; glow.mesh.count = 0; solid.mesh.count = 0;
      bolts.forEach(b => { scene.remove(b.line); b.line.geometry.dispose(); b.line.material.dispose(); }); bolts.length = 0;
      if (layer) layer.querySelectorAll('.fxPop').forEach(n => n.remove());
    }

    return {
      burst, ring, glowPuff, lightning, popup, callout, confetti, update, clear,
      setLayout(L) { layout = L; },
      setReduced(v) { reduced = !!v; },
      get count() { return glow.n + solid.n; }
    };
  }

  P3.fx = { create };
})(typeof window !== 'undefined' ? window : globalThis);
