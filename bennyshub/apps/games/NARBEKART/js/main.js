/** NARBE Racer — renderer, split views, adaptive quality and boot. */
NK.main = (function () {
  'use strict';
  let renderer, scene, views = [], layout = 'single', running = false, last = 0;
  const frames = [], before = [], steps = [0.66, 0.8, 1, 1.25, 1.5, 2];
  let ratio = 3, sampleTime = 0, sampleFrames = 0, fps = 60, errors = 0, errorAt = 0;
  let calls = 0, tris = 0;
  function resize() {
    if (!renderer) return;
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  function setViews(next, mode) { views = next || []; layout = mode || 'single'; resize(); }
  function quality(dt) {
    sampleTime += dt; sampleFrames++;
    if (sampleTime < 3) return;
    fps = sampleFrames / sampleTime; sampleTime = sampleFrames = 0;
    const cap = Math.min(window.devicePixelRatio || 1, 2);
    if (fps < (views.length > 1 ? 42 : 48)) {
      if (renderer.shadowMap.enabled) { renderer.shadowMap.enabled = false; scene.traverse(o => { if (o.material) o.material.needsUpdate = true; }); }
      else if (ratio > 0) { ratio--; renderer.setPixelRatio(Math.min(cap, steps[ratio])); resize(); }
    } else if (fps > 59 && ratio < steps.length - 1 && steps[ratio] < cap) {
      ratio++; renderer.setPixelRatio(Math.min(cap, steps[ratio])); resize();
    }
  }
  function render() {
    const w = window.innerWidth, h = window.innerHeight, two = views.length > 1;
    renderer.setScissorTest(false); renderer.setViewport(0, 0, w, h); renderer.setClearColor(0x1d1b2e, 1); renderer.clear();
    renderer.setScissorTest(true); calls = tris = 0;
    views.forEach((view, i) => {
      let x = 0, y = 0, vw = w, vh = h;
      if (two && layout === 'stack') { vh = Math.floor((h - 6) / 2); y = i ? 0 : h - vh; }
      else if (two) { vw = Math.floor((w - 6) / 2); x = i ? w - vw : 0; }
      const cam = view.camera;
      if (cam.aspect !== vw / vh) { cam.aspect = vw / vh; cam.updateProjectionMatrix(); }
      renderer.setViewport(x, y, vw, vh); renderer.setScissor(x, y, vw, vh);
      before.forEach(fn => fn(i, view));
      renderer.info.reset(); renderer.render(view.scene || scene, cam);
      calls = Math.max(calls, renderer.info.render.calls); tris += renderer.info.render.triangles;
    });
    renderer.setScissorTest(false);
  }
  function fail(err) {
    console.error('NARBE Racer:', err && err.stack || err);
    running = false;
    if (NK.audio) NK.audio.stopAll();
    if (NK.controls) NK.controls.stop();
    const el = document.getElementById('loading');
    if (!el) return;
    el.replaceChildren(); el.style.display = 'flex'; el.style.zIndex = '1000';
    const title = document.createElement('h1'); title.textContent = 'The engine needs a restart';
    const msg = document.createElement('p'); msg.textContent = 'Press Enter, Space, or choose Restart to try again.';
    const btn = document.createElement('button'); btn.textContent = 'Restart game'; btn.style.cssText = 'font:inherit;min-height:64px;padding:16px 32px;border-radius:16px';
    btn.onclick = () => location.reload(); el.append(title, msg, btn);
    window.addEventListener('keyup', e => { if (['Enter', 'NumpadEnter', 'Space'].includes(e.code)) { e.stopImmediatePropagation(); location.reload(); } }, true);
    NK.util.speak('The engine needs a restart. Press Enter or Space to restart the game.');
  }
  function loop(now) {
    requestAnimationFrame(loop); if (!running) return;
    const raw = Math.max(0, (now - last) / 1000); last = now;
    if (!raw || document.hidden) return;
    try {
      if (now - errorAt > 4000) errors = 0;
      quality(raw); const dt = Math.min(raw, 0.05);
      frames.forEach(fn => fn(dt)); render();
    } catch (err) {
      errorAt = now; errors++;
      if (errors >= 5) fail(err); else console.error('NARBE Racer frame:', err && err.stack || err);
    }
  }
  function init() {
    if (renderer) return;
    scene = new THREE.Scene();
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.useLegacyLights = false; renderer.toneMapping = THREE.NoToneMapping;
    // All karts have blob shadows; world shadow maps are an optional expense.
    renderer.shadowMap.enabled = false; renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.autoClear = false; renderer.info.autoReset = false;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, steps[ratio]));
    (document.getElementById('canvasWrap') || document.body).appendChild(renderer.domElement);
    resize(); window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', () => { last = performance.now(); if (document.hidden && NK.game) NK.game.pause(); });
    renderer.domElement.addEventListener('webglcontextlost', e => { e.preventDefault(); fail(new Error('Graphics context lost')); });
    running = true; last = performance.now(); requestAnimationFrame(loop);
  }
  function perf() {
    if (!renderer) return null;
    return { calls, tris, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures,
      pixelRatio: renderer.getPixelRatio(), size: renderer.getSize(new THREE.Vector2()).toArray(), fps: +fps.toFixed(1) };
  }
  const api = { init, setViews, onFrame: fn => frames.push(fn), onBeforeView: fn => before.push(fn), perf,
    get renderer() { return renderer; }, get scene() { return scene; } };
  NK.perf = perf;
  function boot() {
    if (window.NK_AUTOBOOT === false) return;
    try {
      init(); NK.game.init({ renderer, scene }); NK.ui.init();
      api.onFrame(dt => { NK.ui.tick(dt); NK.controls.tick(dt); NK.game.update(dt); });
      api.onBeforeView(i => NK.game.beforeView(i));
      const loading = document.getElementById('loading'); if (loading) loading.style.display = 'none';
    } catch (err) { fail(err); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else setTimeout(boot, 0);
  return api;
})();
