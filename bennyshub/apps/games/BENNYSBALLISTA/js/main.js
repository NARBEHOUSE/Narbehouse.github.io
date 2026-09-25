/**
 * Benny's Ballista — bootstrap.
 *
 * Sets up the renderer, owns the animation loop, and hands time to the game
 * and UI modules. Ported from BENNYSRACETRACKS' main.js, unchanged apart from
 * the element id (`cvWrap`, Ballista's existing canvas host) and a wider,
 * lower default camera framing to match the reference "low wide launcher
 * view" the ballista-3d plan calls for.
 */
(function () {
  'use strict';

  const U = RT.util;

  let renderer, scene, camera;
  let last = 0;
  let running = true;

  function init() {
    const wrap = U.$('cvWrap');

    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.5, 900);
    camera.position.set(0, 4, 9);

    renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance'
    });
    applyPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.useLegacyLights = false;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    wrap.appendChild(renderer.domElement);

    RT.game.init({ scene: scene, camera: camera, renderer: renderer });
    RT.game.loadAttract();
    RT.ui.init();

    window.addEventListener('resize', onResize);
    new ResizeObserver(onResize).observe(wrap);
    onResize();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') last = performance.now();
    });

    const loading = U.$('loading');
    if (loading) loading.style.display = 'none';
    requestAnimationFrame(loop);
  }

  /* ── Adaptive quality ───────────────────────────────────────────────────
   * Rather than guess the hardware, watch the frame rate and settle on a
   * resolution the machine can actually hold. Steps are coarse and hysteretic
   * so it lands somewhere and stays there instead of oscillating.
   */
  const PR_STEPS = [0.66, 0.8, 1.0, 1.25, 1.5, 2.0];
  let prIndex = 3;
  let sampleFrames = 0, sampleTime = 0, settled = false;

  function applyPixelRatio(r) {
    renderer.setPixelRatio(r);
    onResize();
  }

  function adaptQuality(dt) {
    if (settled) return;
    sampleFrames++;
    sampleTime += dt;
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

  /** Scene handles, for inspecting or staging a single prop while tuning art. */
  RT.debug = {
    get scene() { return scene; },
    get camera() { return camera; },
    get renderer() { return renderer; }
  };

  /** Render cost snapshot — draw calls are the thing that hurts on a tablet. */
  RT.perf = function () {
    if (!renderer) return null;
    const i = renderer.info;
    return {
      calls: i.render.calls,
      tris: i.render.triangles,
      geometries: i.memory.geometries,
      textures: i.memory.textures,
      pixelRatio: renderer.getPixelRatio(),
      size: renderer.getSize(new THREE.Vector2()).toArray(),
      shadows: renderer.shadowMap.enabled,
      dpr: window.devicePixelRatio || 1
    };
  };

  function onResize() {
    if (!renderer) return;
    const wrap = U.$("cvWrap");
    const w = Math.max(1, wrap.clientWidth), h = Math.max(1, wrap.clientHeight);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }

  function loop(now) {
    requestAnimationFrame(loop);
    if (!running) return;

    const rawDt = (now - last) / 1000;
    last = now;
    if (!isFinite(rawDt) || rawDt <= 0) return;
    const dt = Math.min(rawDt, 0.05);

    try {
      adaptQuality(rawDt);
      RT.ui.tick(dt);
      RT.game.update(dt);
      renderer.render(scene, camera);
    } catch (err) {
      console.error('Ballista frame error:', err);
      running = false;
      const el = U.$('loading');
      if (el) {
        el.style.display = 'flex';
        el.innerHTML = '<div style="max-width:640px;text-align:center;padding:24px;font-size:1.1rem">' +
          '<div style="font-size:2rem;margin-bottom:12px">😵 Something went wrong</div>' +
          '<div style="opacity:.8">' + String(err && err.message ? err.message : err) + '</div></div>';
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
