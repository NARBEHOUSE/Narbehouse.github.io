/**
 * NARBE Mini Golf — camera director.
 *
 * One camera, many "shots". Each mode computes where the camera wants to be
 * (position, look-at, field of view) and how stiffly to get there; the pose
 * is then damped toward it, so every change of shot is a smooth move rather
 * than a cut unless a cut is asked for.
 *
 * Comfort rules, because the player may watch for hours:
 *   • the aim view is locked for the whole turn — it never moves while the
 *     player turns the aim, charges, or Auto Scan sweeps the line;
 *   • the follow camera's yaw has a capped turn rate, so a rebound never whips
 *     the view through 180°;
 *   • shake is tiny and only on hard hits.
 */
(function () {
  'use strict';

  const U = MG.util, C = MG.course;
  const S = C.S;

  let camera = null, view = null;
  const pose = { pos: new THREE.Vector3(0, 30, 30), look: new THREE.Vector3(), fov: 50 };
  const want = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 50 };
  let lam = { pos: 3, look: 4, fov: 3 };
  let mode = { name: 'idle' };
  let shake = 0, shakeT = 0;
  let fovKick = 0;
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();

  function init(cam) { camera = cam; }
  function setView(v) { view = v; }

  function cut() {
    pose.pos.copy(want.pos); pose.look.copy(want.look); pose.fov = want.fov;
    apply();
  }

  function apply() {
    camera.position.copy(pose.pos);
    if (shake > 0.001) {
      camera.position.x += (Math.sin(shakeT * 61) + Math.sin(shakeT * 23)) * shake * 0.5;
      camera.position.y += Math.sin(shakeT * 47) * shake * 0.5;
    }
    camera.lookAt(pose.look);
    const f = pose.fov + fovKick;
    if (Math.abs(camera.fov - f) > 0.01) { camera.fov = f; camera.updateProjectionMatrix(); }
  }

  /* ── Pose builders ────────────────────────────────────────────────────── */

  /** Place the camera at `dist` from `target`, looking along yaw (course angle) at elevation `elev`. */
  function orbitPose(target, yaw, dist, elev, out) {
    const ce = Math.cos(elev), se = Math.sin(elev);
    out.set(target.x - Math.cos(yaw) * ce * dist, target.y + se * dist, target.z - Math.sin(yaw) * ce * dist);
    return out;
  }

  /** How far the hole stretches from a point, for framing. */
  function holeSpan() {
    const bb = view.ch.bounds;
    return Math.max(bb.x1 - bb.x0, bb.y1 - bb.y0) * S;
  }

  /* ── Modes ────────────────────────────────────────────────────────────── */

  /**
   * Aim. o = { ball: Vector3 (world), viewYaw: angle, style: 'hole'|'overhead' }
   *
   * The aim view is locked for the whole turn. It is worked out from where
   * the ball and the line of play are — never from the aim itself — so turning
   * the aim, Auto Scan sweeping it, charging, or scanning the power list leaves
   * the camera perfectly still. Calling aim() again with the same ball and
   * view is a no-op, so the game can call it every frame.
   */
  function aim(o) {
    const key = o.style + ':' + o.ball.x.toFixed(3) + ',' + o.ball.y.toFixed(3) + ',' + o.ball.z.toFixed(3) + ':' + (o.viewYaw || 0).toFixed(4);
    if (mode.name === 'aim' && mode.key === key) return;
    mode = { name: 'aim', key, ball: o.ball.clone(), viewYaw: o.viewYaw || 0, style: o.style, yaw: o.viewYaw || 0 };
    aimTarget(mode);
  }

  /** The fixed aim pose for a ball and a viewing direction, written into want. */
  function aimTarget(m) {
    if (m.style === 'overhead') { overheadPose(); return; }
    const ball = m.ball;
    const cup = view.cupWorld;
    const dCup = Math.hypot(cup.x - ball.x, cup.z - ball.z);
    const yaw = m.viewYaw;
    // High enough (about 45°) that a line aimed sideways or back toward the
    // camera is still easy to see around the ball.
    const elev = 0.8;
    const dist = U.clamp(dCup * 0.4 + 12, 14, 30);
    const lookAhead = Math.min(dCup, 26) * 0.28;
    want.look.set(ball.x + Math.cos(yaw) * lookAhead, ball.y, ball.z + Math.sin(yaw) * lookAhead);
    orbitPose(ball, yaw, dist, elev, want.pos);
    want.pos.y = Math.max(want.pos.y, ball.y + 5);
    want.fov = 50;
  }

  function updateAim() {
    // want was fixed when the turn began; just glide there and stay.
    if (mode.style === 'overhead') overheadPose();
    lam = { pos: 3.4, look: 4, fov: 2.5 };
  }
  /** The whole hole from above, tilted a little for depth. */
  function overheadPose() {
    const bb = view.ch.bounds;
    const cx = (bb.x0 + bb.x1) / 2 * S, cz = (bb.y0 + bb.y1) / 2 * S;
    const w = (bb.x1 - bb.x0) * S, h = (bb.y1 - bb.y0) * S;
    const aspect = camera.aspect || 16 / 9;
    const vfov = 46 * Math.PI / 180;
    const needV = Math.max(h, w / aspect) * 1.12;
    const dist = (needV / 2) / Math.tan(vfov / 2) + 4;
    const tilt = 0.32;   // radians off vertical
    want.look.set(cx, 0, cz);
    want.pos.set(cx, Math.cos(tilt) * dist, cz + Math.sin(tilt) * dist);
    want.fov = 46;
  }

  function overhead() { mode = { name: 'overhead' }; }

  /**
   * Follow a rolling ball. getBall() → { pos: Vector3, vel: {x,y} course px/frame }.
   * startYaw continues from the aim view so the hand-off is seamless.
   */
  function follow(getBall, o) {
    o = o || {};
    mode = { name: 'follow', getBall, yaw: o.yaw !== undefined ? o.yaw : (mode.yaw !== undefined ? mode.yaw : 0), style: o.style, dist: null };
  }

  function updateFollow(dt) {
    if (mode.style === 'overhead') { overheadPose(); lam = { pos: 2, look: 2.5, fov: 2 }; return; }
    const b = mode.getBall();
    if (!b) return;
    const sp = Math.hypot(b.vel.x, b.vel.y);
    if (sp > 2.5) {
      const vy = Math.atan2(b.vel.y, b.vel.x);
      // Capped turn rate: at most ~55°/s, and only once the ball is clearly going somewhere.
      const d = U.angleDiff(mode.yaw, vy);
      const maxTurn = 0.95 * dt * U.clamp((sp - 2.5) / 10, 0, 1);
      mode.yaw += U.clamp(d * 0.9 * dt * 2.2, -maxTurn, maxTurn);
    }
    const dist = U.clamp(12 + sp * 0.22, 12, 24);
    mode.dist = mode.dist === null ? dist : U.damp(mode.dist, dist, 1.5, dt);
    const lead = U.clamp(sp * 0.12, 0, 5);
    const vx = sp > 0.1 ? b.vel.x / sp : 0, vy = sp > 0.1 ? b.vel.y / sp : 0;
    want.look.set(b.pos.x + vx * lead, b.pos.y, b.pos.z + vy * lead);
    orbitPose(b.pos, mode.yaw, mode.dist, 0.6, want.pos);
    want.fov = 52;
    lam = { pos: 2.6, look: 4.5, fov: 2 };
  }

  /** Low at the cup, looking back up the line at the incoming ball. */
  function cupCam(getBall, approachYaw) {
    const cup = view.cupWorld;
    const back = approachYaw;   // direction the ball is travelling
    const p = new THREE.Vector3(cup.x + Math.cos(back) * 4.2, cup.y + 1.25, cup.z + Math.sin(back) * 4.2);
    // Offset sideways a touch so the flagstick doesn't block the shot.
    p.x += -Math.sin(back) * 1.4; p.z += Math.cos(back) * 1.4;
    mode = { name: 'cup', getBall, at: p, t: 0 };
    updateCup(0);
    cut();
  }

  function updateCup(dt) {
    mode.t += dt;
    const cup = view.cupWorld;
    const b = mode.getBall();
    want.pos.copy(mode.at);
    // A slow push-in.
    want.pos.lerp(tmp.copy(cup).setY(cup.y + 0.9), Math.min(0.25, mode.t * 0.12));
    if (b) want.look.copy(cup).lerp(b.pos, 0.45);
    else want.look.copy(cup);
    want.look.y = cup.y + 0.1;
    want.fov = 38;
    lam = { pos: 5, look: 6, fov: 3 };
  }

  /** Circle a point (celebrations). */
  function orbit(center, o) {
    o = o || {};
    const start = Math.atan2(pose.pos.z - center.z, pose.pos.x - center.x);
    mode = { name: 'orbit', center: center.clone(), a: start, speed: o.speed || 0.32, radius: o.radius || 7.5, height: o.height || 3.4, fov: o.fov || 46 };
  }

  function updateOrbit(dt) {
    mode.a += mode.speed * dt;
    want.pos.set(mode.center.x + Math.cos(mode.a) * mode.radius, mode.center.y + mode.height, mode.center.z + Math.sin(mode.a) * mode.radius);
    want.look.copy(mode.center).y += 0.6;
    want.fov = mode.fov;
    lam = { pos: 1.6, look: 2.5, fov: 2 };
  }

  /** Watch a fixed spot from a fixed spot (splash, gator, tunnel exit). */
  function watch(from, at, fov, stiff) {
    mode = { name: 'watch', from: from.clone(), at: at.clone(), fov: fov || 44, stiff: stiff || 3 };
  }

  function updateWatch() {
    want.pos.copy(mode.from); want.look.copy(mode.at); want.fov = mode.fov;
    lam = { pos: mode.stiff, look: mode.stiff * 1.4, fov: 2 };
  }

  /** Side-on tracking for replays. */
  function track(getBall, side) {
    mode = { name: 'track', getBall, side: side || 1, yaw: null };
  }

  function updateTrack(dt) {
    const b = mode.getBall();
    if (!b) return;
    const sp = Math.hypot(b.vel.x, b.vel.y);
    if (sp > 1) {
      const vy = Math.atan2(b.vel.y, b.vel.x);
      mode.yaw = mode.yaw === null ? vy : U.dampAngle(mode.yaw, vy, 1.2, dt);
    }
    const yaw = (mode.yaw || 0) + mode.side * Math.PI / 2;
    orbitPose(b.pos, yaw, 9, 0.28, want.pos);
    want.look.copy(b.pos);
    want.fov = 44;
    lam = { pos: 3, look: 6, fov: 2 };
  }

  /* ── Scripted flyover ─────────────────────────────────────────────────── */

  /**
   * From the flag back down the line of play to the tee, ending exactly on
   * the aim pose so play starts without a jolt. Follows the lane's own nodes
   * when the fairway is a lane, so a dogleg is flown as a dogleg.
   */
  function flyover(endPose, duration, onDone) {
    const ch = view.ch;
    const cup = view.cupWorld;
    const route = [];
    const raw = ch.raw.fairway;
    if (raw && raw.lane && raw.lane.length >= 2) {
      // Lane nodes, ordered from the cup's end back to the tee's end.
      const nodes = raw.lane.map(n => ({ x: n.x, y: n.y }));
      const dStart = Math.hypot(nodes[0].x - ch.start.x, nodes[0].y - ch.start.y);
      const dEnd = Math.hypot(nodes[nodes.length - 1].x - ch.start.x, nodes[nodes.length - 1].y - ch.start.y);
      if (dStart < dEnd) nodes.reverse();
      nodes.shift(); nodes.pop();
      route.push({ x: ch.cup.x, y: ch.cup.y }, ...nodes, { x: ch.start.x, y: ch.start.y });
    } else {
      route.push({ x: ch.cup.x, y: ch.cup.y }, { x: (ch.cup.x + ch.start.x) / 2, y: (ch.cup.y + ch.start.y) / 2 }, { x: ch.start.x, y: ch.start.y });
    }
    const span = holeSpan();
    const lookPts = route.map(p => view.toWorld(p.x, p.y, 0));
    const camPts = [];
    // Open beyond the flag, low, looking back at it.
    const r0 = route[0], r1 = route[1];
    const away = Math.atan2(r0.y - r1.y, r0.x - r1.x);
    camPts.push(new THREE.Vector3(cup.x + Math.cos(away) * 11 + Math.cos(away + 1.2) * 4, cup.y + 6.5, cup.z + Math.sin(away) * 11 + Math.sin(away + 1.2) * 4));
    // Then rise and travel back over the route, offset to one side.
    for (let i = 1; i < route.length - 1; i++) {
      const p = lookPts[i];
      const a = Math.atan2(route[i + 1].y - route[i - 1].y, route[i + 1].x - route[i - 1].x);
      camPts.push(new THREE.Vector3(p.x - Math.cos(a) * 4 + Math.sin(a) * 6, p.y + U.clamp(span * 0.35, 9, 20), p.z - Math.sin(a) * 4 - Math.cos(a) * 6));
    }
    camPts.push(endPose.pos.clone());
    const lookCurvePts = [cup.clone().setY(cup.y + 1.6), ...lookPts.slice(1, -1), endPose.look.clone()];
    if (camPts.length < 3) camPts.splice(1, 0, camPts[0].clone().lerp(camPts[1], 0.5).setY(Math.max(camPts[0].y, camPts[1].y) + 8));
    while (lookCurvePts.length < camPts.length) lookCurvePts.splice(1, 0, lookCurvePts[0].clone().lerp(lookCurvePts[lookCurvePts.length - 1], 0.5));
    const camCurve = new THREE.CatmullRomCurve3(camPts, false, 'centripetal');
    const lookCurve = new THREE.CatmullRomCurve3(lookCurvePts, false, 'centripetal');
    mode = { name: 'fly', camCurve, lookCurve, t: 0, duration: duration || 5.5, onDone, endPose };
    // Start exactly on the curve.
    camCurve.getPoint(0, pose.pos); lookCurve.getPoint(0, pose.look); pose.fov = 44;
    apply();
  }

  function updateFly(dt) {
    mode.t += dt;
    const u = U.easeInOutCubic(Math.min(1, mode.t / mode.duration));
    mode.camCurve.getPoint(u, want.pos);
    mode.lookCurve.getPoint(u, want.look);
    want.fov = U.lerp(44, mode.endPose.fov || 50, u);
    pose.pos.copy(want.pos); pose.look.copy(want.look); pose.fov = want.fov;
    if (mode.t >= mode.duration) {
      const cb = mode.onDone;
      mode = { name: 'hold' };
      want.pos.copy(pose.pos); want.look.copy(pose.look);
      if (cb) cb();
    }
  }

  /** Skip a flyover to its end (switch press during the intro). */
  function finishFly() {
    if (mode.name === 'fly') { mode.t = mode.duration; updateFly(0); }
  }

  /** A slow high circle of the whole hole, for the title screen. */
  function attract() {
    const bb = view.ch.bounds;
    const c = new THREE.Vector3((bb.x0 + bb.x1) / 2 * S, 0, (bb.y0 + bb.y1) / 2 * S);
    const r = holeSpan() * 0.62 + 8;
    mode = { name: 'orbit', center: c, a: 0.6, speed: 0.06, radius: r, height: r * 0.62, fov: 48 };
    updateOrbit(0); cut();
  }

  /** Compute (without applying) the aim pose, for flyovers to land on. */
  function aimPoseFor(o) {
    const save = mode, savePos = want.pos.clone(), saveLook = want.look.clone(), saveFov = want.fov;
    mode = { name: 'aim', key: '', ball: o.ball.clone(), viewYaw: o.viewYaw || 0, style: o.style, yaw: o.viewYaw || 0 };
    aimTarget(mode);
    const out = { pos: want.pos.clone(), look: want.look.clone(), fov: want.fov };
    mode = save; want.pos.copy(savePos); want.look.copy(saveLook); want.fov = saveFov;
    return out;
  }

  /* ── Per-frame ────────────────────────────────────────────────────────── */

  function update(dt) {
    if (!camera || !view) return;
    switch (mode.name) {
      case 'aim': updateAim(); break;
      case 'overhead': overheadPose(); lam = { pos: 2, look: 2.5, fov: 2 }; break;
      case 'follow': updateFollow(dt); break;
      case 'cup': updateCup(dt); break;
      case 'orbit': updateOrbit(dt); break;
      case 'watch': updateWatch(); break;
      case 'track': updateTrack(dt); break;
      case 'fly': updateFly(dt); apply(); return;
      default: break;
    }
    pose.pos.x = U.damp(pose.pos.x, want.pos.x, lam.pos, dt);
    pose.pos.y = U.damp(pose.pos.y, want.pos.y, lam.pos, dt);
    pose.pos.z = U.damp(pose.pos.z, want.pos.z, lam.pos, dt);
    pose.look.x = U.damp(pose.look.x, want.look.x, lam.look, dt);
    pose.look.y = U.damp(pose.look.y, want.look.y, lam.look, dt);
    pose.look.z = U.damp(pose.look.z, want.look.z, lam.look, dt);
    pose.fov = U.damp(pose.fov, want.fov, lam.fov, dt);
    // Never dip under the turf.
    if (view) {
      const gx = pose.pos.x / S, gy = pose.pos.z / S;
      const floor = view.surfaceY(gx, gy) + 0.8;
      if (pose.pos.y < floor) pose.pos.y = floor;
    }
    shakeT += dt;
    shake = U.damp(shake, 0, 6, dt);
    fovKick = U.damp(fovKick, 0, 4, dt);
    apply();
  }

  function bump(amount) { shake = Math.min(0.35, shake + amount); }
  function kick(deg) { fovKick += deg; }

  MG.cam = {
    init, setView, update, cut, aim, overhead, follow, cupCam, orbit, watch, track,
    flyover, finishFly, attract, aimPoseFor, bump, kick,
    get mode() { return mode.name; },
    get pose() { return pose; }
  };
})();
