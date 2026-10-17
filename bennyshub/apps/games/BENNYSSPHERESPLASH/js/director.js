/** Benny's Sphere Splash - the camera director.
 *
 *  One viewpoint the player can learn: a broadcast camera on the side of the pool, so
 *  our team always attacks to the RIGHT of the screen and theirs to the left. Every
 *  shot is framed from that side; only the distance and aim change:
 *   - menu:      a slow orbit of the whole sphere;
 *   - wide:      the whole pool (kickoff);
 *   - orbit:     halftime and full time, behind the card: a slow circle round the outside
 *                of the sphere, starting from wherever the camera is, so it never jumps;
 *   - broadcast: live play, in tight on the ball (Bryan: "follow the ball ... focus more
 *                tightly on the ball during plays"), looking a little ahead of where it
 *                is going; while a pass or shot is in the air it widens to keep where
 *                the ball is headed (the receiver, the goal) in the picture too;
 *   - decision:  pulled back just enough that everything the choice is about - the
 *                carrier, the teammates, the defenders, the goal - is on screen at once;
 *   - shot:      (Shot Camera: Cinematic) in behind the shooter's shoulder, on the same
 *                side of the pool, looking down the shot at the goal; as the ball gets
 *                halfway it swings to the goal mouth, framing the ball and the keeper;
 *   - goal:      (after a goal, Shot Camera on Cinematic) in close on the scorer
 *                celebrating, from our side as ever, pushing slowly in;
 *   - replay:    a goal again (game.js), in tighter on the ball than live play and from
 *                lower down and a little behind the attack, so it looks like a replay
 *                and not live; still from our side, so the attack still runs the same way;
 *   - intro:     the kickoff sweep (game.js): from wherever the camera is, down into the
 *                pool past our team, across past theirs, and into the live-play spot.
 *                A spline through keyframes, timed by game.js, so Pause holds it.
 *  Moves are eased, never cut, so the view never jumps under the player's eyes. The
 *  one cut is after a goal, to the wide view, while everyone resets for the kickoff.
 */
SS.director = (function () {
  'use strict';

  let camera, mode = 'menu', points = [], t = 0, first = true;
  const pos = new THREE.Vector3(), aim = new THREE.Vector3(), wantPos = new THREE.Vector3(), wantAim = new THREE.Vector3();
  const _c = new THREE.Vector3();
  const ACTION_SHARE = 0.6;                                   // decision frames: the action fills the lower 60% of the view
  const SIDE = new THREE.Vector3(-1, 0.32, 0).normalize();   // camera sits on -x: +z (our attack) is screen right
  let follow = null;                                          // () => { ball, to }: the ball, and where a pass or shot is headed (or null)
  let shot = null;                                            // () => { from, to, ball, keeper, stage } while a shot plays (game.js shotFrame)
  let star = null, starT = 0;                                 // () => the scorer's chest (world), after a goal
  const REPLAY_HALF = 4.2, repSide = new THREE.Vector3();      // replay: tighter, lower, behind the attack
  let intro = null;                                           // { at: () => 0..1, pos: Curve, aim: Curve } while a kickoff sweep plays
  let orbitA = 0, menuA = 0;                                  // the orbit's and the menu's angle round the pool
  const ORBIT_R = 34, ORBIT_Y = 10, ORBIT_SPEED = 0.05;        // metres, metres, radians a second (a lap every two minutes)
  const _g = new THREE.Vector3(), _side = new THREE.Vector3(), POOL_R = 20;
  // Live play. TIGHT_HALF is how much pool shows either side of the ball: tune by feel.
  const TIGHT_HALF = 6, LEAD_SECS = 0.5, LEAD_MAX = 3;
  const vel = new THREE.Vector3(), lastBall = new THREE.Vector3(), lead = new THREE.Vector3(), _d = new THREE.Vector3();
  let dist = 0;                                               // live play's eased distance; 0 = start from where the camera is

  function init(cam) { camera = cam; }
  function setMode(m, opts) {
    if (m === 'broadcast' && mode !== 'broadcast') dist = 0;
    mode = m;
    if (opts && opts.points) points = opts.points;
    if (opts && opts.follow) follow = opts.follow;
    if (opts && opts.shot) shot = opts.shot;
    if (opts && opts.star) { star = opts.star; starT = 0; }
    if (m === 'intro') intro = makeIntro(opts.kind, opts.at);
    if (m === 'orbit') orbitA = Math.atan2(camera.position.x, camera.position.z);
    if (m === 'replay') {
      dist = 0;
      repSide.set(-1, 0.14, -0.5 * ((opts && opts.dir) || 1)).normalize();
    }
    if (opts && opts.cut) first = true;
    // Reduced motion: no camera travel between views - a cut to the menu, the halftime
    // view or the wide kickoff view. (Live play still follows the ball, gently.)
    if ((m === 'menu' || m === 'orbit' || m === 'wide') && SS.util.reducedMotion()) first = true;
  }

  /** Where live play's camera starts, looking at the centre spot: broadcast's own framing. */
  function liveStart(out) {
    const v = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2), h = v * camera.aspect;
    return out.copy(SIDE).multiplyScalar(Math.max(TIGHT_HALF / h, 2.5 / v));
  }
  /* The kickoff sweep. Keyframes are evenly spaced in time and game.js eases the whole
     run, so it starts and lands gently and glides through the middle. Our team kicks off
     from the -z half (screen left), theirs from +z (screen right).
      full:   the start of a match - down past our lineup, across past theirs, home;
      second: the second half - a shorter drop from the wide view to the centre. */
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  function makeIntro(kind, at) {
    const from = camera.position.clone(), look = aim.clone(), home = liveStart(new THREE.Vector3());
    const keys = kind === 'second'
      ? [[from, look], [V3(-15, 7, 9), V3(0, 0, 3)], [home, V3(0, 0, 0)]]
      : [[from, look], [V3(-21, 13, -21), V3(0, -1, -4)], [V3(-9.5, 1.8, -5.5), V3(0, 0.4, -5)],
        [V3(-9.5, 1.8, 6), V3(0, 0.4, 5)], [home, V3(0, 0, 0)]];
    return { at, pos: new THREE.CatmullRomCurve3(keys.map(k => k[0]), false, 'centripetal'),
      aim: new THREE.CatmullRomCurve3(keys.map(k => k[1]), false, 'centripetal') };
  }

  /** Distance at which a sphere of radius r fills the view, whichever of width or height is tighter. */
  function fitDistance(r) {
    const v = THREE.MathUtils.degToRad(camera.fov) / 2, h = Math.atan(Math.tan(v) * camera.aspect);
    return r / Math.sin(Math.min(v, h));
  }

  function update(dt) {
    t += dt;
    let rate = 2.2;
    switch (mode) {
      case 'menu': {
        if (!SS.util.reducedMotion()) menuA += dt * 0.06;       // reduced motion: a still view
        const a = menuA;
        wantPos.set(Math.sin(a) * 50, 14, Math.cos(a) * 50); wantAim.set(0, -2, 0); rate = 1.2;
        break;
      }
      case 'orbit':
        if (!SS.util.reducedMotion()) orbitA += dt * ORBIT_SPEED;
        wantPos.set(Math.sin(orbitA) * ORBIT_R, ORBIT_Y, Math.cos(orbitA) * ORBIT_R); wantAim.set(0, -1, 0); rate = 0.9;
        break;
      case 'wide':
        wantAim.set(0, 0, 0); wantPos.copy(SIDE).multiplyScalar(fitDistance(21)); rate = 1.6;
        break;
      case 'broadcast': case 'replay': {
        const rep = mode === 'replay', side = rep ? repSide : SIDE;
        const f = follow ? follow() : null, b = f ? f.ball : _c.set(0, 0, 0), to = f && f.to;
        // The ball's speed, smoothed, so the frame can look ahead of it. A jump (a kickoff
        // reset, a restored save) is not a speed.
        if (dt > 0) { _d.copy(b).sub(lastBall).divideScalar(dt); if (_d.length() > 30) _d.set(0, 0, 0); vel.lerp(_d, 1 - Math.exp(-dt * 3)); }
        lastBall.copy(b);
        const v = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2), h = v * camera.aspect;
        const tight = rep ? REPLAY_HALF : TIGHT_HALF;
        let halfW = tight, halfH = 2.5, depth = 0;
        if (to) {
          // In the air: frame the ball and where it is going.
          _c.copy(b).add(to).multiplyScalar(0.5);
          halfW = Math.max(tight, Math.abs(to.z - b.z) / 2 + 3);
          halfH = Math.abs(to.y - b.y) / 2 + 2.5;
          depth = Math.abs(to.x - b.x);
          lead.multiplyScalar(1 - Math.min(1, dt * 4));
        } else {
          lead.copy(vel).multiplyScalar(LEAD_SECS).clampLength(0, LEAD_MAX);
          _c.copy(b).add(lead);
        }
        const want = Math.max(halfW / h, halfH / v) + depth * 0.35;
        // Widen quickly (a pass is under two seconds in the air), close in slowly.
        if (!dist) dist = first ? want : pos.distanceTo(aim);
        dist += (want - dist) * (1 - Math.exp(-dt * (want > dist ? 3.5 : 1)));
        wantAim.copy(_c);
        wantPos.copy(_c).addScaledVector(side, dist);
        if (rep && wantPos.length() > POOL_R - 1.5) wantPos.setLength(POOL_R - 1.5);   // in close: stay inside the sphere
        rate = 3;
        break;
      }
      case 'shot': {
        const f = shot ? shot() : null;
        if (!f) break;
        _g.subVectors(f.to, f.from);
        const len = Math.max(1, _g.length());
        _g.divideScalar(len);
        _side.copy(SIDE).setY(0).normalize();                  // toward our side of the pool
        if (f.stage === 0) {
          // Over the shooter's shoulder, looking down the shot: aimed between shooter and
          // goal so both stay in the picture (aimed at the goal, a low shooter fell out of it).
          wantPos.copy(f.from).addScaledVector(_g, -5).addScaledVector(_side, 3.6); wantPos.y += 1.6;
          wantAim.copy(f.from).lerp(f.to, 0.4);
          rate = 2.6;
        } else {
          // At the goal mouth, from the shooter's side: the ball and the keeper.
          _c.copy(f.ball).lerp(f.keeper, 0.5);
          wantPos.copy(f.to).addScaledVector(_g, -6.5).addScaledVector(_side, 3.8); wantPos.y += 1.2;
          wantAim.copy(_c);
          rate = 3.2;
        }
        if (wantPos.length() > POOL_R - 1.5) wantPos.setLength(POOL_R - 1.5);   // stay inside the sphere
        break;
      }
      case 'goal': {
        const p = star ? star() : null;
        if (!p) break;
        starT += dt;
        // From 5.2 m to 3.6 m over three seconds. The scorer sits low in the frame (chest
        // ~65% of the way down), so the goal banner across the top never covers the V of
        // the arms.
        const d = 3.6 + 1.6 * Math.exp(-starT * 0.8), v = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
        wantAim.copy(p); wantAim.y += 0.3 * v * d;
        wantPos.copy(p).addScaledVector(SIDE, d); wantPos.y += 0.3 * v * d;
        if (wantPos.length() > POOL_R - 1.5) wantPos.setLength(POOL_R - 1.5);
        rate = 2.4;
        break;
      }
      case 'intro': {
        if (!intro) break;
        const u = THREE.MathUtils.clamp(intro.at(), 0, 1);
        intro.pos.getPoint(u, wantPos); intro.aim.getPoint(u, wantAim);
        pos.copy(wantPos); aim.copy(wantAim);                 // on the rails: the curve is already smooth
        break;
      }
      case 'decision': {
        // Fit the box round the points that matter, as the side camera sees it: across
        // the screen is z, up the screen is y. The action sits in the lower part of the
        // view, so the choices above the carrier have room and cover nobody.
        let z0 = Infinity, z1 = -Infinity, y0 = Infinity, y1 = -Infinity, x0 = Infinity, x1 = -Infinity;
        points.forEach(p => { z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); });
        if (!points.length) { z0 = z1 = y0 = y1 = x0 = x1 = 0; }
        const v = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2), h = v * camera.aspect;
        const halfW = (z1 - z0) / 2 + 2.5, halfH = (y1 - y0) / 2 + 2;
        const dist = Math.max(8, halfW / h, halfH / (v * ACTION_SHARE * 0.9)) + (x1 - x0) * 0.35;
        _c.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
        wantAim.copy(_c); wantAim.y += v * dist * (1 - ACTION_SHARE);
        wantPos.copy(_c).addScaledVector(SIDE, dist); wantPos.y += v * dist * (1 - ACTION_SHARE);
        rate = 3.2;
        break;
      }
    }
    if (first) { pos.copy(wantPos); aim.copy(wantAim); first = false; }
    const k = 1 - Math.exp(-dt * rate);
    pos.lerp(wantPos, k); aim.lerp(wantAim, k);
    camera.position.copy(pos);
    camera.lookAt(aim);
  }

  return { init, setMode, update, get mode() { return mode; } };
})();
