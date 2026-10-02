/**
 * NARBE Mini Golf — bootstrap: renderer, the loop, adaptive quality.
 */
(function () {
  'use strict';

  const U = MG.util;
  let renderer, scene, camera;
  let last = 0, running = true;

  function init() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 900);

    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    // Start modest and climb only if the machine keeps up (Race Tracks' lesson:
    // a Surface Pro reports DPR 2 on an integrated GPU).
    applyPixelRatio(Math.min(window.devicePixelRatio || 1, 1.0));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.useLegacyLights = false;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;   // the soft variant costs several times more per pixel
    U.$('canvasWrap').appendChild(renderer.domElement);

    MG.game.init({ scene, camera, renderer });
    MG.audio.preloadAll();
    MG.ui.init().then(() => { U.$('loading').style.display = 'none'; });

    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') last = performance.now(); });
    requestAnimationFrame(loop);
  }

  /* ── Adaptive quality ─────────────────────────────────────────────────── */
  const PR_STEPS = [0.66, 0.8, 1.0, 1.25, 1.5, 2.0];
  let prIndex = 2, sampleFrames = 0, sampleTime = 0, settled = false;

  function applyPixelRatio(r) {
    renderer.setPixelRatio(r);
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  function adaptQuality(dt) {
    if (settled) return;
    sampleFrames++; sampleTime += dt;
    if (sampleTime < 2.5) return;
    const fps = sampleFrames / sampleTime;
    sampleFrames = 0; sampleTime = 0;
    const cap = Math.min(window.devicePixelRatio || 1, 2);
    if (fps < 40 && prIndex > 0) {
      prIndex--;
      applyPixelRatio(Math.min(PR_STEPS[prIndex], cap));
      if (prIndex === 0 && renderer.shadowMap.enabled) {
        renderer.shadowMap.enabled = false;
        scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
      }
    } else if (fps > 58 && PR_STEPS[prIndex] < cap && prIndex < PR_STEPS.length - 1) {
      prIndex++;
      applyPixelRatio(Math.min(PR_STEPS[prIndex], cap));
    } else {
      settled = true;
    }
  }

  function onResize() {
    if (!renderer) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  let frames = 0;
  /**
   * Frame cap: 60 fps in play, 30 behind menus and while paused. A
   * high-refresh monitor would otherwise render 144 frames a second of a
   * scene that doesn't need it, and that is most of the CPU/GPU load.
   */
  function frameBudget() {
    const c = MG.ui.context;
    return (c === 'menu' || c === 'idle') ? 1 / 30 : 1 / 60;
  }

  function loop(now) {
    requestAnimationFrame(loop);
    if (!running) return;
    const rawDt = (now - last) / 1000;
    if (!isFinite(rawDt) || rawDt <= 0) { last = now; return; }
    if (rawDt < frameBudget() - 0.002) return;   // not due yet; let the time accumulate
    last = now;
    const dt = Math.min(rawDt, 0.05);
    try {
      // Only judge quality while playing: behind menus the cap holds us at 30.
      if (frameBudget() < 1 / 40) adaptQuality(rawDt);
      MG.ui.tick(dt);
      MG.game.update(dt);
      renderer.render(scene, camera);
      frames++;
    } catch (err) {
      console.error("Mini Golf frame error:", err);
      running = false;
      const el = U.$('loading');
      el.style.display = 'flex';
      el.innerHTML = '<div style="max-width:640px;text-align:center;padding:24px;font-size:1.1rem">' +
        '<div style="font-size:2rem;margin-bottom:12px">Something went wrong</div>' +
        '<div style="opacity:.8">' + U.escapeHtml(String(err && err.message ? err.message : err)) + '</div></div>';
    }
  }

  MG.main = {
    get camera() { return camera; },
    get scene() { return scene; },
    get renderer() { return renderer; },
    get frames() { return frames; },
    perf() {
      const i = renderer.info;
      return { calls: i.render.calls, tris: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures, pixelRatio: renderer.getPixelRatio() };
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
