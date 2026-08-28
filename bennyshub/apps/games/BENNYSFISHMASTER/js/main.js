/**
 * Benny's FishMaster — bootstrap.
 *
 * Sets up the renderer, owns the animation loop, and hands time to the game
 * and UI modules.
 */
(function () {
  'use strict';

  const U = RT.util;

  let renderer, scene, camera;
  let last = 0;
  let running = true;

  function init() {
    const wrap = U.$('canvasWrap');

    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.5, 1400);
    camera.position.set(0, 8, 20);

    renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance'
    });
    // Start conservative and climb only if the machine can take it. A Surface
    // Pro reports devicePixelRatio 2 on an integrated GPU, so rendering at
    // full native resolution costs 4x the pixels for no visible gain at this
    // chunky art style — that alone is most of the difference between smooth
    // and sluggish there.
    applyPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Physically-correct light units (three r155's default). Punchy, unfiltered
    // colour suits the paper-craft palette and the high contrast Ben needs, so
    // no tone mapping.
    renderer.useLegacyLights = false;
    renderer.toneMapping = THREE.NoToneMapping;
    wrap.appendChild(renderer.domElement);

    RT.game.init({ scene: scene, camera: camera, renderer: renderer });
    RT.game.loadAttract();
    RT.ui.init();

    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', () => {
      // Avoid a giant dt spike when the tab comes back.
      if (document.visibilityState === 'visible') last = performance.now();
    });

    U.$('loading').style.display = 'none';
    requestAnimationFrame(loop);
  }

  /* ── Adaptive quality ───────────────────────────────────────────────────
   * Rather than guess the hardware, watch the frame rate and settle on a
   * resolution the machine can actually hold. Steps are coarse and hysteretic
   * so it lands somewhere and stays there instead of oscillating.
   */
  const PR_STEPS = [0.66, 0.8, 1.0, 1.25, 1.5, 2.0];
  let prIndex = 3;                 // matches the 1.25 start above
  let sampleFrames = 0, sampleTime = 0, settled = false;

  function applyPixelRatio(r) {
    renderer.setPixelRatio(r);
    renderer.setSize(window.innerWidth, window.innerHeight);
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
      // Bottomed out and still struggling: shadows are the next biggest cost.
      if (prIndex === 0 && renderer.shadowMap.enabled) {
        renderer.shadowMap.enabled = false;
        scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
      }
    } else if (fps > 58 && PR_STEPS[prIndex] < cap && prIndex < PR_STEPS.length - 1) {
      prIndex++;
      applyPixelRatio(Math.min(PR_STEPS[prIndex], cap));
    } else {
      settled = true;    // comfortable here; stop fiddling
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
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  function loop(now) {
    requestAnimationFrame(loop);
    if (!running) return;

    const rawDt = (now - last) / 1000;
    last = now;
    if (!isFinite(rawDt) || rawDt <= 0) return;
    const dt = Math.min(rawDt, 0.05);   // clamp so a hitch can't tunnel through obstacles

    try {
      // Sample with the *unclamped* delta: the clamp would hide exactly the
      // slow frames the quality check exists to detect.
      adaptQuality(rawDt);
      RT.ui.tick(dt);
      RT.game.update(dt);
      renderer.render(scene, camera);
    } catch (err) {
      console.error('FishMaster frame error:', err);
      running = false;
      const el = U.$('loading');
      el.style.display = 'flex';
      el.innerHTML = '<div style="max-width:640px;text-align:center;padding:24px;font-size:1.1rem">' +
        '<div style="font-size:2rem;margin-bottom:12px">😵 Something went wrong</div>' +
        '<div style="opacity:.8">' + String(err && err.message ? err.message : err) + '</div></div>';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
