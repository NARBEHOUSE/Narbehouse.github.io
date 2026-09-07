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
  /* How many frames have thrown, and when the last one did. A run of them is
     a broken game; one on its own is a hiccup the player should never have to
     think about. The count decays, so a fault an hour apart never adds up. */
  let frameErrors = 0, lastErrorAt = 0;

  /**
   * Boot, and SAY SO if it fails. An exception in here used to leave the
   * loading screen spinning forever with the reason only in the console -
   * which is the one place a player never looks.
   */
  function init() {
    try { initInner(); }
    catch (err) {
      console.error('FishMaster boot error:', err);
      const el = U.$('loading');
      el.style.display = 'flex';
      el.innerHTML = '<div style="max-width:640px;text-align:center;padding:24px;font-size:1.1rem">' +
        '<div style="font-size:1.6rem;margin-bottom:12px">The lake did not fill</div>' +
        '<div style="opacity:.8">' + String(err && err.message ? err.message : err) + '</div>' +
        '<div style="opacity:.6;margin-top:10px;font-size:.9rem">Press F12 for the details, or clear the saved data for this game and reload.</div></div>';
    }
  }

  function initInner() {
    const wrap = U.$('canvasWrap');

    scene = new THREE.Scene();

    /* Far enough to see the sky. The dome is 2600 units across and the far
       shore up to 2700 away; at 1400 the whole sky clipped to black. The fog
       does the hazing - the far plane only has to not cut things off. */
    camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.5, 6000);
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
    // Soft shadows: hard-edged ones read as cut card sitting on a surface.
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.useLegacyLights = false;
    /* Filmic tone mapping. Unfiltered output suited the paper palette — flat,
       punchy, poster-like — but it is also the single loudest reason a
       three.js scene reads as "a WebGL demo" rather than as a place: highlights
       clip to white and skies go chalky. ACES rolls the top end off and gives
       the water somewhere to be bright without blowing out.
       Exposure sits slightly above 1 to win back the brightness the roll-off
       costs, because contrast is an accessibility requirement here, not just a
       preference. */
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    wrap.appendChild(renderer.domElement);

    // For the browser test tools: a way to look at the scene from outside.
    window.__fm = { scene: scene, camera: camera, renderer: renderer };
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
      if (frameErrors && now - lastErrorAt > 4000) frameErrors = 0;   // it recovered
      adaptQuality(rawDt);
      RT.ui.tick(dt);
      RT.game.update(dt);
      renderer.render(scene, camera);
    } catch (err) {
      /* ONE BAD FRAME IS NOT THE END OF A TRIP.
         This used to stop the loop dead on the first exception and paint a
         card over the game - so a single hiccup somewhere in a landing ended
         the session, and anybody who did not read it just saw something
         appear and the game stop responding. Now: it is logged, counted, and
         the loop keeps going. Only a frame that fails over and over is a
         broken game, and that still says so plainly. */
      frameErrors++;
      console.error('FishMaster frame error #' + frameErrors + ':', err);
      lastErrorAt = now;
      if (frameErrors >= 6) {
        running = false;
        const el = U.$('loading');
        el.style.display = 'flex';
        el.innerHTML = '<div style="max-width:640px;text-align:center;padding:24px;font-size:1.1rem">' +
          '<div style="font-size:1.6rem;margin-bottom:12px">The game has stopped</div>' +
          '<div style="opacity:.8">' + String(err && err.message ? err.message : err) + '</div>' +
          '<div style="opacity:.6;margin-top:10px;font-size:.9rem">Reload the page to carry on. ' +
          'Your progress is saved.</div></div>';
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
