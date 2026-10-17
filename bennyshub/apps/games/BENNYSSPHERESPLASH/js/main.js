/** Benny's Sphere Splash - renderer, adaptive quality, frame loop and boot.
 *  Adaptive quality has one lever, the pixel ratio (how sharp the picture is): everything
 *  else on screen is there for Ben to see, so nothing is switched off. Started from NARBE
 *  Racer's loop (NARBEKART/js/main.js), made to settle: a step up that does not hold waits
 *  1, then 2, 4, 8... minutes before another try, so the picture does not keep flicking. */
SS.main = (function () {
  'use strict';
  const hubGraphics = NarbeGraphics.openGame('spheresplash');
  let renderer, scene, camera, running = false, last = 0, t = 0;
  const frames = [], steps = [0.66, 0.8, 1, 1.25, 1.5, 2];
  let ratio = 3, sampleTime = 0, sampleFrames = 0, fps = 60, errors = 0, errorAt = 0;
  let clock = 0, good = 0, raisedAt = -1;
  const failed = {};                                           // step -> { at, n }: when it last failed to hold 60, how often

  function resize() {
    if (!renderer) return;
    renderer.setPixelRatio(hubGraphics.pixelRatio(Math.min(cap(), steps[ratio]), window.innerWidth, window.innerHeight));
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
  }
  const cap = () => Math.min(window.devicePixelRatio || 1, 2);
  function setRatio(i) { ratio = i; resize(); }
  /* Every 2 s: under 54 fps drops a step (two under 30); over 58 fps twice running steps
     up, unless that step failed lately (it waits a minute after its first failure, then twice
     as long after each one). A step that drops back within 6 s of being taken has failed. Under 10 fps is a stall (a hidden or throttled window), not
     the device, and is ignored. */
  function quality(dt) {
    if (hubGraphics.get().mode !== 'standard') return;
    clock += dt; sampleTime += dt; sampleFrames++;
    if (sampleTime < 2) return;
    fps = sampleFrames / sampleTime; sampleTime = sampleFrames = 0;
    if (fps < 10) return;
    if (fps < 54) {
      good = 0;
      if (raisedAt >= 0 && clock - raisedAt < 6) failed[ratio] = { at: clock, n: (failed[ratio] ? failed[ratio].n : 0) + 1 };
      raisedAt = -1;
      if (ratio > 0) setRatio(Math.max(0, ratio - (fps < 30 ? 2 : 1)));
    } else if (fps > 58) {
      const next = ratio + 1;
      if (++good >= 2 && next < steps.length && steps[ratio] < cap() && !(failed[next] && clock - failed[next].at < 60 * 2 ** (failed[next].n - 1))) {
        setRatio(next); raisedAt = clock; good = 0;
      }
    } else good = 0;
  }
  function fail(err) {
    console.error("Benny's Sphere Splash:", err && err.stack || err);
    running = false;
    const el = document.getElementById('loading');
    if (!el) return;
    el.replaceChildren(); el.style.display = 'flex';
    const h = document.createElement('h1'); h.textContent = 'The game needs a restart';
    const b = document.createElement('button'); b.textContent = 'Restart game'; b.onclick = () => location.reload();
    el.append(h, b);
    window.addEventListener('keyup', e => { if (['Enter', 'NumpadEnter', 'Space'].includes(e.code)) location.reload(); }, true);
    if (window.NarbeVoiceManager) NarbeVoiceManager.speak('The game needs a restart. Press Enter or Space to restart.');
  }
  function loop(now) {
    requestAnimationFrame(loop); if (!running) return;
    const raw = Math.max(0, (now - last) / 1000); last = now;
    if (!raw || document.hidden) return;
    hubGraphics.frame(now);
    try {
      if (now - errorAt > 4000) errors = 0;
      quality(Math.min(raw, 1)); const dt = Math.min(raw, 0.05); t += dt;
      frames.forEach(fn => fn(dt, t));
      renderer.info.reset(); renderer.render(scene, camera);
    } catch (err) {
      errorAt = now; errors++;
      if (errors >= 5) fail(err); else console.error('frame:', err && err.stack || err);
    }
  }
  function init() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 900);
    renderer = new THREE.WebGLRenderer(hubGraphics.rendererOptions({ antialias: true, powerPreference: 'high-performance' }));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping; renderer.info.autoReset = false;
    renderer.setPixelRatio(hubGraphics.pixelRatio(Math.min(window.devicePixelRatio || 1, steps[ratio]), window.innerWidth, window.innerHeight));
    document.getElementById('canvasWrap').appendChild(renderer.domElement);
    resize(); hubGraphics.subscribe(resize); window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', () => { last = performance.now(); });
    renderer.domElement.addEventListener('webglcontextlost', e => { e.preventDefault(); fail(new Error('Graphics context lost')); });
  }
  function start() { running = true; last = performance.now(); requestAnimationFrame(loop); }
  function perf() {
    if (!renderer) return null;
    return { fps: +fps.toFixed(1), calls: renderer.info.render.calls, tris: renderer.info.render.triangles,
      pixelRatio: renderer.getPixelRatio(), geometries: renderer.info.memory.geometries };
  }
  SS.perf = perf;

  async function boot() {
    try {
      await hubGraphics.ready;
      init();
      SS.theme.apply();                      // the colour profile, before anything is painted
      await SS.models.load();
      SS.world.build(scene, SS.save.lastArena());
      SS.worldui.init(camera);
      SS.director.init(camera);
      SS.hud.build();
      SS.game.init({ scene, camera });
      SS.ui.init();
      SS.audio.init();
      frames.push((dt, time) => { SS.world.update(dt, time); SS.game.update(dt, time); SS.worldui.update(); perfHud(time); });
      document.getElementById('loading').style.display = 'none';
      SS.ui.setScreen('title');
      start();
    } catch (err) { fail(err); }
  }
  /* Frame rate readout for testing: add ?perf to the address. */
  const showPerf = /[?&]perf\b/.test(location.search);
  let perfT = 0;
  function perfHud(time) {
    if (!showPerf || time - perfT < 0.5) return;
    perfT = time;
    const el = document.getElementById('perf'), p = perf();
    el.classList.add('on');
    el.textContent = `${p.fps} fps · ${p.calls} draws · ${(p.tris / 1000).toFixed(0)}k tris · ×${p.pixelRatio}`;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else setTimeout(boot, 0);
  return { perf, get renderer() { return renderer; }, get scene() { return scene; }, get camera() { return camera; } };
})();
