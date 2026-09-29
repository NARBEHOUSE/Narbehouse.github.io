/** NARBE Racer — independent cameras for each player's view. */
NK.camera = (function () {
  'use strict';
  const U = NK.util;
  const pos = new THREE.Vector3(), target = new THREE.Vector3();
  function world(view) { return view.world || (NK.debug && NK.debug.race() && NK.debug.race().world); }
  function aim(view, dt, snap) {
    const camera = view.camera;
    if (!view.look) view.look = target.clone();
    const k = snap ? 1 : 1 - Math.exp(-7 * dt);
    camera.position.lerp(pos, k); view.look.lerp(target, k);
    camera.lookAt(view.look);
  }
  function chase(view, racer, dt, snap) {
    const W = world(view); if (!W) return;
    W.pointAt(racer.progress - 12.5, racer.x * 0.72, pos); pos.y += 7.4 + Math.min(racer.y || 0, 7) * 0.35;
    W.pointAt(racer.progress + 25, racer.x * 0.28, target); target.y += 1.9 + Math.min(0, racer.y || 0) * 0.9;
    if (NK.game && NK.game.settings.get('shake') && racer.wobbleT > 0) pos.x += Math.sin(racer.wobbleT * 45) * 0.10;
    aim(view, dt, snap);
  }
  function intro(view, W, t) {
    const s = view.racer ? view.racer.progress : -30;
    const x = view.racer ? view.racer.x : 0;
    W.pointAt(s, x, target); target.y += 1.2;
    const f = W.frameAt(s), angle = Math.max(0, 1 - t / 2.5) * 1.0;
    pos.copy(target).addScaledVector(f.forward, -12 * Math.cos(angle)).addScaledVector(f.right, 12 * Math.sin(angle)); pos.y += 6.8;
    aim(view, 1, true);
  }
  function finish(view, racer, dt) {
    view.orbit = (view.orbit || 0) + dt * 0.28;
    const W = world(view); W.pointAt(racer.progress, racer.x, target); target.y += 1.1;
    const f = W.frameAt(racer.progress);
    pos.copy(target).addScaledVector(f.forward, -10 * Math.cos(view.orbit)).addScaledVector(f.right, 10 * Math.sin(view.orbit)); pos.y += 5.3;
    aim(view, dt, false);
  }
  function attract(view, W, t) {
    if (view.racer) { chase(view, view.racer, 1 / 60, true); return; }
    const s = t * 15; W.pointAt(s, 0, target); target.y += 1;
    W.pointAt(s - 24, 7, pos); pos.y += 13; aim(view, 1, true);
  }
  function podium(view, anchor, t) {
    target.copy(anchor); target.y += 2;
    pos.copy(anchor); pos.x += Math.sin(t * 0.18) * 2.5; pos.y += 6; pos.z -= 15;
    aim(view, 1, true);
  }
  return { chase, intro, finish, attract, podium };
})();
