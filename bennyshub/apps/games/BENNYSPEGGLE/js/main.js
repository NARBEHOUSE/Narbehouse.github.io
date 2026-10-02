/**
 * Benny's P3GL — bootstrap: renderer, layout, the loop, adaptive quality.
 */
(function (root) {
  'use strict';

  const P3 = root.P3;
  const U = P3.util;
  let renderer, post, board, fx, layout = null;
  let last = 0, running = true, frames = 0, errors = 0, errorAt = 0;

  function init() {
    renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', alpha: false });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setPixelRatio(startRatio());
    renderer.setSize(root.innerWidth, root.innerHeight);
    U.$('stage').appendChild(renderer.domElement);

    post = P3.post.create(renderer);
    const q = P3.game.store.get('quality');
    post.setQuality(q === 'low' ? 'low' : 'high');
    post.setSize(root.innerWidth, root.innerHeight, renderer.getPixelRatio());
    applyQualitySetting();

    board = P3.board.create(renderer);
    fx = P3.fx.create(board.scene, U.$('fxLayer'));

    P3.game.init({ renderer, post, board, fx });
    P3.game.on('settings', (s) => { if (s.key === 'quality') applyQualitySetting(); });
    relayout();

    root.addEventListener('resize', onResize);
    root.addEventListener('orientationchange', () => setTimeout(onResize, 120));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) last = performance.now(); });

    P3.ui.init().then(() => { U.$('loading').classList.add('gone'); setTimeout(() => U.$('loading').remove(), 600); }).catch(showStartupError);
    requestAnimationFrame(loop);
  }

  function showStartupError(err) {
    console.error('P3GL could not start:', err);
    running = false;
    const el = U.$('loading');
    if (!el) return;
    el.className = 'crash';
    el.innerHTML = '<div><b>The game could not start.</b><p>Try reloading, or return to the hub.</p><div class="menu"><button class="mi" type="button">Reload game</button><button class="mi" type="button">Back to Hub</button></div><p>Space = next · Enter = choose</p></div>';
    const buttons = el.querySelectorAll('button');
    const actions = [() => location.reload(), () => { if (root.parent !== root) root.parent.postMessage({ action: 'focusBackButton' }, '*'); else location.href = '../../../index.html'; }];
    let index = -1, held = null;        // nothing highlighted until the first Space
    const speak = (t) => { const vm = U.vm(); if (vm) vm.speak(t || buttons[index].textContent); };
    const focus = i => { if (index >= 0) buttons[index].classList.remove('focused'); index = i; buttons[index].classList.add('focused'); speak(); };
    const next = () => focus(index < 0 ? 0 : 1 - index);
    buttons.forEach((b, i) => { b.addEventListener('click', actions[i]); b.addEventListener('focus', () => focus(i)); });
    if (U.isOneSwitch()) setInterval(() => { if (!held && !document.hidden) next(); }, U.scanInterval());
    const switchKey = e => e.code === 'Space' ? 'Space' : /^(Enter|NumpadEnter)$/.test(e.code) ? 'Enter' : null;
    document.addEventListener('keydown', e => { const k = switchKey(e); if (!k) return; e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) held = k; }, true);
    document.addEventListener('keyup', e => { const k = switchKey(e); if (!k) return; e.preventDefault(); e.stopImmediatePropagation(); if (held !== k) return; held = null; if (k === 'Space') next(); else if (index >= 0) actions[index](); }, true);
    root.addEventListener('blur', () => { held = null; });
    speak('The game could not start. Try reloading, or return to the hub.');
  }

  /* ── Layout ───────────────────────────────────────────────────────────── */
  function safeInsets() {
    const cs = getComputedStyle(document.documentElement);
    const v = (n) => parseFloat(cs.getPropertyValue(n)) || 0;
    return { top: v('--sat'), right: v('--sar'), bottom: v('--sab'), left: v('--sal') };
  }

  function relayout() {
    const w = root.innerWidth, h = root.innerHeight;
    const safe = safeInsets();
    const menuSafe = P3.ui && P3.ui.layoutSafe ? P3.ui.layoutSafe() : null;
    if (menuSafe) { safe.left += menuSafe.left; }
    layout = P3.layout.compute(w, h, safe);
    board.setLayout(layout);
    fx.setLayout(layout);
    if (P3.ui && P3.ui.applyLayout) P3.ui.applyLayout(layout);
  }

  function onResize() {
    renderer.setSize(root.innerWidth, root.innerHeight);
    post.setSize(root.innerWidth, root.innerHeight, renderer.getPixelRatio());
    P3.game.resizeBackdrop();
    relayout();
  }

  /* ── Adaptive quality ─────────────────────────────────────────────────── */
  // Start modest and climb only if the machine keeps up (a tablet can report
  // DPR 2 on a weak GPU). Bloom drops to 'low', then off, before resolution
  // goes below 1.
  const STEPS = [0.6, 0.75, 1.0, 1.25, 1.5, 2.0];
  let step = 2, sampleN = 0, sampleT = 0, settled = false, postLevel = 2;   // postLevel 2 high, 1 low, 0 off

  function startRatio() { return Math.min(root.devicePixelRatio || 1, U.isPhone() ? 1.25 : 1.0); }

  function applyQualitySetting() {
    const q = P3.game.store.get('quality');
    settled = q !== 'auto';
    if (q === 'high') { post.setQuality('high'); postLevel = 2; setRatio(Math.min(root.devicePixelRatio || 1, 1.5)); }
    else if (q === 'low') { post.setQuality('low'); postLevel = 1; setRatio(Math.min(root.devicePixelRatio || 1, 0.85)); }
    else { settled = false; sampleN = 0; sampleT = 0; }
  }

  function setRatio(r) {
    renderer.setPixelRatio(r);
    renderer.setSize(root.innerWidth, root.innerHeight);
    post.setSize(root.innerWidth, root.innerHeight, r);
  }

  function adapt(dt) {
    if (settled) return;
    sampleN++; sampleT += dt;
    if (sampleT < 2.5) return;
    const fps = sampleN / sampleT;
    sampleN = 0; sampleT = 0;
    const cap = Math.min(root.devicePixelRatio || 1, 2);
    if (fps < 42) {
      if (postLevel === 2 && step <= 2) { postLevel = 1; post.setQuality('low'); }
      else if (step > 0) { step--; setRatio(Math.min(STEPS[step], cap)); }
      else if (postLevel === 1) { postLevel = 0; post.setQuality('off'); }
      else settled = true;
    } else if (fps > 57 && step < STEPS.length - 1 && STEPS[step + 1] <= cap) {
      step++; setRatio(Math.min(STEPS[step], cap));
    } else settled = true;
  }

  /* ── The loop ─────────────────────────────────────────────────────────── */
  function budget() {
    // 60 fps in play; 30 behind menus with nothing moving fast (saves battery and heat).
    const g = P3.game;
    return (P3.ui && P3.ui.overlayOn && !g.attracting) ? 1 / 30 : 1 / 60;
  }

  function loop(now) {
    requestAnimationFrame(loop);
    if (!running) return;
    const raw = (now - last) / 1000;
    if (!isFinite(raw) || raw <= 0) { last = now; return; }
    if (raw < budget() - 0.002) return;
    last = now;
    const dt = Math.min(raw, 0.05);
    try {
      if (budget() < 1 / 40 && P3.game.state === 'play') adapt(raw);
      P3.game.update(dt);
      post.render(P3.game.layers(), now / 1000);
      frames++;
      if (frames === 20) root.__ready = true;
    } catch (err) {
      console.error('P3GL frame error:', err);
      // Survive a stray error; stop only if they keep coming.
      if (now - errorAt > 4000) errors = 0;
      errors++; errorAt = now;
      if (errors > 5) {
        running = false;
        const el = document.createElement('div');
        el.className = 'crash';
        el.innerHTML = '<div><b>Something went wrong.</b><br>' + U.escapeHtml(String(err && err.message || err)) + '<br><br>Press Enter to reload.</div>';
        document.body.appendChild(el);
        document.addEventListener('keyup', (e) => { if (e.code === 'Enter' || e.code === 'NumpadEnter') location.reload(); });
        el.addEventListener('click', () => location.reload());
      }
    }
  }

  P3.main = {
    relayout,
    get layout() { return layout; },
    get renderer() { return renderer; },
    get post() { return post; },
    get board() { return board; },
    get fx() { return fx; },
    get frames() { return frames; },
    perf() { const i = renderer.info; return { calls: i.render.calls, tris: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures, ratio: renderer.getPixelRatio(), post: post.quality }; }
  };

  function boot() { try { init(); } catch (err) { showStartupError(err); } }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
