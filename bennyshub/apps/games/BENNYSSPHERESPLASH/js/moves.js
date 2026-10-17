/** Benny's Sphere Splash - the big moves: a shooter's throw, a keeper's save, a block.
 *
 * The free animation library has no throw, dive or catch, so these are built the rig.js
 * way: the clip poses the body, then every frame each move re-poses what it needs -
 * the whole body (a lean or a dive, pivoting at the pelvis, via swimmer.setTilt) and
 * the arms (rig.twoBone), always blended in from the clip's own pose so nothing snaps.
 * Angles come from pose references (Projects/Assets/SphereSplash/pose-refs):
 *  - throw (water polo): upright, throwing hand cocked behind the head, elbow high and
 *    out, the other arm pointing at the target; then the arm whips straight forward at
 *    shoulder height while the other swings down and back;
 *  - dive: the body one straight line from feet to fingertips, pointed at the ball;
 *  - catch: ball clutched to the chest, forearms round it, elbows in;
 *  - punch: one fist through the ball, up and out, the other arm low for balance;
 *  - celebrate: arms up in a V, a twirl, two fist pumps.
 * A move only shows what the sim already decided; it never changes an outcome.
 */
SS.moves = (function () {
  'use strict';

  const ease = x => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
  const ramp = (t, a, b) => ease((t - a) / (b - a));
  const V = () => new THREE.Vector3();
  const _h = V(), _el = V(), _t = V(), _p = V(), _s = V(), _d = V(), _loc = V(), _shift = V(), _aim = V(), _pel = V();
  const _q = new THREE.Quaternion(), _qi = new THREE.Quaternion(), _qid = new THREE.Quaternion();
  const UP = new THREE.Vector3(0, 1, 0);

  /** Reach one hand to `target` (world), elbow toward `pole`, blended by w from the clip. */
  function reach(sw, side, target, pole, w) {
    if (w <= 0.001) return;
    const b = sw.bones, R = side === 'R';
    const up = R ? b.upperR : b.upperL, lo = R ? b.lowerR : b.lowerL, hd = R ? b.handR : b.handL;
    hd.getWorldPosition(_h); lo.getWorldPosition(_el);
    _t.copy(_h).lerp(target, w); _p.copy(_el).lerp(pole, w);
    SS.rig.twoBone(up, lo, hd, _t, _p);
  }
  /** Lean the whole body so the head points along `dir` (world), pelvis moved by `shift` (world), by w. */
  function lean(sw, dir, shift, w) {
    _qi.copy(sw.group.quaternion).invert();
    _loc.copy(dir).applyQuaternion(_qi).normalize();
    _q.setFromUnitVectors(UP, _loc);
    _q.slerp(_qid.identity(), 1 - w);                     // slerp toward identity by (1 - w)
    _shift.copy(shift).applyQuaternion(_qi).multiplyScalar(w);
    sw.setTilt(_q, _shift);
  }
  function shoulder(sw, side, out) { return (side === 'R' ? sw.bones.upperR : sw.bones.upperL).getWorldPosition(out); }

  /* ── throw: the shooter's normal shot ──────────────────────────────────
     t (seconds since the shot): 0-0.45 wind up, 0.45-0.58 release, then settle. The
     ball stays in the right hand until the release (game.js reads ballPoint). */
  const THROW = { windup: 0.45, release: 0.58, end: 1.25 };
  const _hr = V(), _hl = V(), _pr = V(), _pl = V(), _sr = V(), _sl = V(), _head = V();
  function throwMove(sw, mv) {
    const t = mv.t, f = sw.frame;
    SS.rig.bodyFrame(sw.bones, f);
    _aim.subVectors(mv.opts.to, f.chest).normalize();
    shoulder(sw, 'R', _sr); shoulder(sw, 'L', _sl); sw.head.getWorldPosition(_head);
    const w = ramp(t, 0, 0.25) * (1 - ramp(t, 0.8, THROW.end));
    const k = ramp(t, THROW.windup, THROW.release);       // 0 = cocked, 1 = released
    // A small lean: back while cocking, into the throw on release.
    _d.copy(UP).applyAxisAngle(_s.crossVectors(UP, _aim).normalize(), -0.18 + 0.4 * k);
    lean(sw, _d, _pel.set(0, 0, 0), w);
    SS.rig.bodyFrame(sw.bones, f);
    shoulder(sw, 'R', _sr); shoulder(sw, 'L', _sl); sw.head.getWorldPosition(_head);
    // Right hand: behind the head, a little above, elbow high and out -> straight at the target.
    _hr.copy(_head).addScaledVector(f.forward, 0.16).addScaledVector(_aim, -0.28).addScaledVector(f.right, 0.14);
    _t.copy(_sr).addScaledVector(_aim, 0.6).addScaledVector(f.forward, 0.06);
    _hr.lerp(_t, k);
    _pr.copy(_sr).addScaledVector(f.right, 0.45).addScaledVector(f.forward, 0.35 - 0.5 * k).addScaledVector(_aim, -0.2 + 0.2 * k);
    reach(sw, 'R', _hr, _pr, w);
    // Left arm: points at the target, then drops down and back.
    _hl.copy(_sl).addScaledVector(_aim, 0.55);
    _t.copy(_sl).addScaledVector(_aim, -0.2).addScaledVector(f.forward, -0.45);
    _hl.lerp(_t, k);
    _pl.copy(_sl).addScaledVector(f.forward, -0.5).addScaledVector(f.right, -0.2);
    reach(sw, 'L', _hl, _pl, w);
    if (t < THROW.release + 0.02) sw.bones.handR.getWorldPosition(sw.ballPoint).addScaledVector(_aim, 0.12);
    return t >= THROW.end;
  }

  /* ── keeper: ready, reach, then catch / punch / miss ───────────────────
     From soccer-goalie and volleyball references (Bryan: the first dive threw the arms
     up, or behind the keeper). A shot is aimed at the goal, which is BEHIND the keeper
     (1.5 m on average), so the keeper goes for `to` = where the ball crosses them
     (game.js works it out), never the aim point. Ready is the goalie's set position:
     hands in front of the chest, palms out, elbows down. The reach goes the short way
     from there, always in front of the body, arms leading and the body following: a
     small lean for a ball close by, a full stretch only for one far out.
     opts: { to (where the ball crosses the keeper, world), ball (its live position),
     result: 'catch' | 'parry' | 'goal', progress: () => 0..1, 1 = the ball reaches them }. */
  const _k = V(), _dir = V(), _hand = V(), _pole = V(), _side = V(), _ready = V();
  function keeperMove(sw, mv) {
    const o = mv.opts, f = sw.frame, p = o.progress();
    if (p >= 1 && mv.arrived == null) mv.arrived = mv.t;
    const ta = mv.arrived == null ? -1 : mv.t - mv.arrived;
    const miss = o.result === 'goal';
    SS.rig.bodyFrame(sw.bones, f);
    _k.copy(f.chest);
    _dir.subVectors(o.to, _k); const dist = _dir.length(); _dir.divideScalar(dist || 1);
    // The reach: from 35% of the ball's way to the keeper, done as it arrives.
    let reachK = ease((p - 0.35) / 0.65);
    // After arrival: a catch or a punch comes back up; a miss hangs, then sags.
    const back = ta < 0 ? 0 : miss ? ramp(ta, 0.35, 1.2) : ramp(ta, 0.15, 0.6);
    reachK *= 1 - back;
    const w = ramp(mv.t, 0, 0.25) * (1 - ramp(ta, 1.0, 1.5));
    // The body follows the arms, as far as the ball is out of reach: a ball half a metre
    // away is taken with the arms and a small lean; a full-length dive only past ~1.6 m.
    // Never head-down: the lean takes the sideways and upward part of the way (volleyball
    // digs lean forward, head up), the drop to a low ball is the hips moving down.
    // A ball above the shoulders turns the whole body to it however close it is, so it
    // ends up straight over the head and the arms go up in line with the body (Bryan: a
    // high diagonal save left the body upright and the arms crossed over the face).
    const high = ramp(_dir.y, 0.2, 0.55);
    const stretch = Math.max(miss ? 0.6 : 0, ramp(dist, 0.5, 1.6), high);   // beaten: a committed stretch
    _shift.copy(_dir).multiplyScalar(Math.max(0, Math.min(1.2, dist - 0.8)));
    _d.copy(_dir).setY(0).addScaledVector(UP, Math.max(0, _dir.y) + 0.3).normalize();
    _d.lerp(_dir, high).normalize();                        // a high ball: the body points right at it
    lean(sw, _d, _shift, reachK * stretch * w);
    SS.rig.bodyFrame(sw.bones, f);
    const up = f.forward;
    ['L', 'R'].forEach(side => {
      shoulder(sw, side, _s);
      _side.copy(f.right).multiplyScalar(side === 'R' ? 1 : -1);
      // Ready: hands in front of the chest, a hand's width apart, elbows down and out.
      _ready.copy(f.chest).addScaledVector(f.belly, 0.32).addScaledVector(up, 0.1).addScaledVector(_side, 0.14);
      _hand.copy(_ready);
      _pole.copy(_s).addScaledVector(_side, 0.3).addScaledVector(up, -0.45).addScaledVector(f.belly, 0.1);
      // Reach: both hands to where the ball crosses, palms to it (a miss: fingertips short).
      if (miss) _t.copy(_k).addScaledVector(_dir, Math.max(0.35, dist - 0.4)).addScaledVector(_side, 0.1);
      else _t.copy(o.to).lerp(o.ball, ramp(p, 0.85, 1)).addScaledVector(_side, 0.12);
      _hand.lerp(_t, reachK);
      // Elbows out to the side and a little back from the reach, never flipped up.
      _pole.lerp(_d.copy(_s).addScaledVector(_side, 0.35).addScaledVector(_dir, -0.25).addScaledVector(up, -0.15), reachK);
      if (ta >= 0 && o.result === 'catch') {
        // Clutch it to the chest, forearms round it.
        const c = ramp(ta, 0, 0.3);
        _t.copy(f.chest).addScaledVector(f.belly, 0.26).addScaledVector(_side, 0.13);
        _hand.lerp(_t, c);
        _pole.lerp(_d.copy(_s).addScaledVector(_side, 0.35).addScaledVector(up, -0.45), c);
      } else if (ta >= 0 && o.result === 'parry' && side === 'R') {
        // Punch on through the ball.
        _t.copy(o.to).addScaledVector(_dir, 0.25);
        _hand.lerp(_t, 1 - ramp(ta, 0.25, 0.7));
      }
      reach(sw, side, _hand, _pole, w);
    });
    if (ta >= 0 && o.result === 'catch') sw.chest.getWorldPosition(sw.ballPoint).addScaledVector(f.belly, 0.3);
    return ta > 1.5;
  }

  /* ── block: a defender reaches for the ball where it stops ─────────────
     opts: { to (where the ball stops), ball, result: 'blocked' | 'intercepted', progress }. */
  function blockMove(sw, mv) {
    const o = mv.opts, f = sw.frame, p = o.progress();
    if (p >= 1 && mv.arrived == null) mv.arrived = mv.t;
    const ta = mv.arrived == null ? -1 : mv.t - mv.arrived;
    SS.rig.bodyFrame(sw.bones, f);
    sw.pelvis.getWorldPosition(_k);
    _dir.subVectors(o.to, _k); const dist = _dir.length(); _dir.divideScalar(dist || 1);
    const r = ease((p - 0.35) / 0.65) * (1 - ramp(ta, 0.3, 0.9));
    const w = ramp(mv.t, 0, 0.2) * (1 - ramp(ta, 0.8, 1.2));
    // A partial lean toward the ball, not a full dive.
    _d.copy(UP).lerp(_dir, 0.45).normalize();
    _shift.copy(_dir).multiplyScalar(Math.max(0, Math.min(0.8, dist - 1.1)));
    lean(sw, _d, _shift, r * w);
    SS.rig.bodyFrame(sw.bones, f);
    // The arm on the ball's side reaches; an interception takes it with both.
    const rightSide = _s.subVectors(o.to, _k).dot(f.right) >= 0;
    const sides = o.result === 'intercepted' ? ['L', 'R'] : [rightSide ? 'R' : 'L'];
    sides.forEach(side => {
      shoulder(sw, side, _s);
      _side.copy(f.right).multiplyScalar(side === 'R' ? 1 : -1);
      _hand.copy(o.ball).addScaledVector(_side, 0.1);
      _pole.copy(_s).addScaledVector(_side, 0.45).addScaledVector(f.forward, -0.2);
      reach(sw, side, _hand, _pole, r * w);
    });
    return ta > 1.2;
  }

  /* ── kick: a technique shot, the flashy one (Bryan: throws for normal shots, kicks
     for techniques). A volley: the ball is let go in front of the shins, the body leans
     back to counter, the right leg cocks behind and then swings straight through at
     the target, arms out wide for balance. Same timing as the throw. */
  const _hip = V(), _foot = V(), _knee = V(), _spot = V();
  function kickMove(sw, mv) {
    const t = mv.t, f = sw.frame;
    SS.rig.bodyFrame(sw.bones, f);
    _aim.subVectors(mv.opts.to, f.chest).normalize();
    const w = ramp(t, 0, 0.2) * (1 - ramp(t, 0.85, THROW.end));
    const k = ramp(t, THROW.windup, THROW.release);
    // Lean back, away from the target: more as the leg comes through.
    _d.copy(UP).applyAxisAngle(_s.crossVectors(UP, _aim).normalize(), -(0.55 + 0.35 * k));
    lean(sw, _d, _pel.set(0, 0, 0), w);
    SS.rig.bodyFrame(sw.bones, f);
    const b = sw.bones;
    b.thighR.getWorldPosition(_hip);
    // The foot: cocked behind and under, then straight through at the target.
    _foot.copy(_hip).addScaledVector(_aim, -0.45).addScaledVector(f.forward, -0.55);
    _t.copy(_hip).addScaledVector(_aim, 0.9).addScaledVector(f.forward, -0.15);
    _foot.lerp(_t, k);
    _knee.copy(_hip).addScaledVector(_aim, 0.7).addScaledVector(f.forward, -0.2);
    if (w > 0.001) { b.footR.getWorldPosition(_h); b.calfR.getWorldPosition(_el);
      _t.copy(_h).lerp(_foot, w); _p.copy(_el).lerp(_knee, w); SS.rig.twoBone(b.thighR, b.calfR, b.footR, _t, _p); }
    // Arms out wide.
    ['L', 'R'].forEach(side => {
      shoulder(sw, side, _s);
      _side.copy(f.right).multiplyScalar(side === 'R' ? 1 : -1);
      _hand.copy(_s).addScaledVector(_side, 0.55).addScaledVector(_aim, -0.1).addScaledVector(f.forward, 0.1);
      _pole.copy(_s).addScaledVector(f.forward, -0.4).addScaledVector(_side, 0.2);
      reach(sw, side, _hand, _pole, w);
    });
    // The ball: let go from the carry, it hangs in front of the shins for the strike.
    _spot.copy(_hip).addScaledVector(_aim, 0.75).addScaledVector(f.forward, -0.2);
    if (t < THROW.release + 0.02) sw.ballPoint.lerp(_spot, ramp(t, 0.05, 0.3));
    return t >= THROW.end;
  }

  /* ── celebrate: the scorer, facing the camera (game.js turns them to it) ─────
     Big and simple, to read from across the pool: both arms shoot up into a V, fists
     high, chest out (a small lean back); the whole body twirls once round, rising in
     the water; then two fist pumps (fists down beside the head and back up) and the V
     held to the end. The legs keep the tread clip's kick. */
  const CELEBRATE = { spin: [0.2, 0.85], pumps: [1.0, 1.9], end: 2.5 };   // Bryan: a bit shorter (was 3.4 s)
  const _spinQ = new THREE.Quaternion(), _leanQ = new THREE.Quaternion(), _rise = V(), X = new THREE.Vector3(1, 0, 0);
  function celebrateMove(sw, mv) {
    const t = mv.t, f = sw.frame, C = CELEBRATE;
    const w = ramp(t, 0, 0.3) * (1 - ramp(t, C.end - 0.45, C.end));
    // The body: a twirl about its own upright axis, rising ~0.4 m, leaning back a little.
    _spinQ.setFromAxisAngle(UP, Math.PI * 2 * ease((t - C.spin[0]) / (C.spin[1] - C.spin[0])));
    _leanQ.setFromAxisAngle(X, -0.2 * w);
    _spinQ.multiply(_leanQ);
    _rise.set(0, 0.4 * ramp(t, 0.15, 0.6) * w, 0);
    sw.setTilt(_spinQ, _rise);
    SS.rig.bodyFrame(sw.bones, f);
    const up = f.forward;
    // Two pumps: 0 = arms straight up in the V, 1 = fists down beside the head.
    const pp = (t - C.pumps[0]) / (C.pumps[1] - C.pumps[0]);
    const pump = pp > 0 && pp < 1 ? 0.5 - 0.5 * Math.cos(pp * Math.PI * 4) : 0;
    const armsUp = ramp(t, 0.05, 0.3);
    ['L', 'R'].forEach(side => {
      shoulder(sw, side, _s);
      _side.copy(f.right).multiplyScalar(side === 'R' ? 1 : -1);
      _hand.copy(_s).addScaledVector(up, 0.5).addScaledVector(_side, 0.28).addScaledVector(f.belly, 0.06);       // the V
      _t.copy(_s).addScaledVector(up, 0.18).addScaledVector(_side, 0.3).addScaledVector(f.belly, 0.16);         // fist by the head
      _hand.lerp(_t, pump);
      _pole.copy(_s).addScaledVector(_side, 0.45).addScaledVector(f.belly, -0.1).addScaledVector(up, -0.1);
      reach(sw, side, _hand, _pole, w * armsUp);
    });
    return t >= C.end;
  }

  /* ── the big technique kicks ───────────────────────────────────────────
     Each family of technique shot gets its own body shape, big enough to tell apart at
     match size (Bryan, 2026-10-03; refs flip-kick / spin-kick / scorpion in pose-refs):
      - flip (Beamin' Blast): back to the goal, a backflip, and the ball struck over the
        face at the top of it, then round the rest of the somersault;
      - spin (Spin Shot): the ball tossed up, one full turn with the leg out, and a
        sweeping side kick as it comes down, the body leaning away from the leg;
      - scorpion (Ghost Shot): back to the goal, pitched forward, the heel curled over the
        back, then whipped straight back at the goal.
     The status shots keep the volley (kickMove). The clock waits until `release` (game.js
     holds the shot that long), and the ball leaves from where the foot meets it: a spot
     fixed in the pool when the move starts, so the foot reaches for the ball and not the
     other way round. */
  const FLIP = { release: 0.8, end: 1.7 }, SPIN = { release: 0.75, end: 1.4 }, SCORPION = { release: 0.75, end: 1.45 };
  const _cq = V(), _rc = V(), _yawQ = new THREE.Quaternion(), _bodyQ = new THREE.Quaternion();
  const Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
  /** Turn the whole body by `q` (group space, from the swimmer facing the goal) about a
      point `up` metres above the pelvis, lifted by `rise`, blended in by w. */
  function turn(sw, q, up, rise, w) {
    _q.identity().slerp(q, w);
    _cq.set(0, up, 0); _rc.copy(_cq).applyQuaternion(_q);
    _shift.subVectors(_cq, _rc); _shift.y += rise * w;
    sw.setTilt(_q, _shift);
  }
  /** One leg's foot to `target` (world), knee toward `pole`, blended by w from the clip. */
  const _ft = V(), _kn = V();
  function legTo(sw, side, target, pole, w) {
    if (w <= 0.001) return;
    const b = sw.bones, R = side === 'R';
    const th = R ? b.thighR : b.thighL, ca = R ? b.calfR : b.calfL, ft = R ? b.footR : b.footL;
    ft.getWorldPosition(_ft); ca.getWorldPosition(_kn);
    _ft.lerp(target, w); _kn.lerp(pole, w);
    SS.rig.twoBone(th, ca, ft, _ft, _kn);
  }
  /** Set up a kick the first frame: the aim, the world's own right, and the strike spot. */
  function strikeSpot(sw, mv, up, aim, right) {
    if (mv.spot) return;
    const f = sw.frame;
    SS.rig.bodyFrame(sw.bones, f);
    mv.aim = V().subVectors(mv.opts.to, f.chest).setY(0).normalize();
    mv.right = V().crossVectors(mv.aim, UP).normalize();       // the swimmer's right, facing the goal
    mv.spot = sw.pelvis.getWorldPosition(V()).addScaledVector(UP, up).addScaledVector(mv.aim, aim).addScaledVector(mv.right, right);
    mv.carry = sw.ballPoint.clone();
  }
  /** The kicking foot: its own path, pulled onto the ball for the strike. */
  function strike(t, release) { return ramp(t, release - 0.2, release) * (1 - ramp(t, release + 0.05, release + 0.3)); }
  const _hipR = V(), _hipL = V(), _fR = V(), _fL = V(), _kR = V(), _kL = V(), _u = V();
  function hips(sw) { sw.bones.thighR.getWorldPosition(_hipR); sw.bones.thighL.getWorldPosition(_hipL); }
  /** Both arms flung out wide, a little toward the head (balance, and a big shape). */
  function armsWide(sw, w, toHead, toBelly) {
    const f = sw.frame;
    ['L', 'R'].forEach(side => {
      shoulder(sw, side, _s);
      _side.copy(f.right).multiplyScalar(side === 'R' ? 1 : -1);
      _hand.copy(_s).addScaledVector(_side, 0.55).addScaledVector(f.forward, toHead).addScaledVector(f.belly, toBelly);
      _pole.copy(_s).addScaledVector(f.forward, -0.4).addScaledVector(f.belly, -0.2).addScaledVector(_side, 0.2);
      reach(sw, side, _hand, _pole, w);
    });
  }

  function flipMove(sw, mv) {
    const t = mv.t, f = sw.frame, R = FLIP.release;
    // Where the foot meets the ball at the top of the flip (worked out from the pose: the
    // body upside down past the horizontal, the leg up over the face).
    strikeSpot(sw, mv, 1.25, 0.5, 0);
    const w = ramp(t, 0, 0.15) * (1 - ramp(t, FLIP.end - 0.35, FLIP.end));
    // Back to the goal, then over backwards: 115 degrees by the strike (hanging there a
    // moment), on round the full somersault after it.
    const theta = 2.0 * ramp(t, 0.2, R) + (Math.PI * 2 - 2.0) * ramp(t, R + 0.05, FLIP.end - 0.4);
    _yawQ.setFromAxisAngle(Y, Math.PI * ramp(t, 0, 0.3));
    _bodyQ.setFromAxisAngle(X, -theta);
    turn(sw, _yawQ.multiply(_bodyQ), 0.35, 0.3 * ramp(t, 0.1, 0.5), w);
    SS.rig.bodyFrame(sw.bones, f);
    hips(sw);
    const ext = ramp(t, 0.45, R), tuck = ramp(t, R + 0.15, R + 0.4) * (1 - ramp(t, FLIP.end - 0.6, FLIP.end - 0.3));
    // Kicking leg: knee to the chest, then straight up over the face, then tucked for the turn.
    _fR.copy(_hipR).addScaledVector(f.belly, 0.45).addScaledVector(f.forward, 0.15);
    _u.copy(f.belly).multiplyScalar(0.8).addScaledVector(f.forward, 0.6).normalize();
    _fR.lerp(_t.copy(_hipR).addScaledVector(_u, 0.95), ext);
    _fR.lerp(mv.spot, strike(t, R));
    _kR.copy(_hipR).addScaledVector(f.belly, 0.8).addScaledVector(f.forward, 0.4);
    // The other leg trails low, then tucks with it.
    _fL.copy(_hipL).addScaledVector(f.forward, -0.75).addScaledVector(f.belly, 0.25);
    _kL.copy(_hipL).addScaledVector(f.belly, 0.6).addScaledVector(f.forward, -0.2);
    _t.copy(_hipR).addScaledVector(f.belly, 0.35).addScaledVector(f.forward, -0.1); _fR.lerp(_t, tuck);
    _t.copy(_hipL).addScaledVector(f.belly, 0.35).addScaledVector(f.forward, -0.1); _fL.lerp(_t, tuck);
    legTo(sw, 'R', _fR, _kR, w);
    legTo(sw, 'L', _fL, _kL, w);
    armsWide(sw, w, 0.05, 0.1);
    if (t < R + 0.02) sw.ballPoint.lerpVectors(mv.carry, mv.spot, ramp(t, 0.05, 0.45));
    return t >= FLIP.end;
  }

  function spinMove(sw, mv) {
    const t = mv.t, f = sw.frame, R = SPIN.release;
    strikeSpot(sw, mv, 0.4, 0.22, 0.8);
    const w = ramp(t, 0, 0.15) * (1 - ramp(t, SPIN.end - 0.35, SPIN.end));
    // One full turn to the left (the right leg leads round), ending square to the goal on
    // the strike; the body leans away from the leg as it comes up.
    _yawQ.setFromAxisAngle(Y, Math.PI * 2 * ramp(t, 0.05, R));
    _bodyQ.setFromAxisAngle(Z, -0.55 * ramp(t, 0.2, 0.55));
    turn(sw, _yawQ.multiply(_bodyQ), 0.2, 0, w);
    SS.rig.bodyFrame(sw.bones, f);
    hips(sw);
    // Kicking leg: out to the side through the turn, sweeping on through the ball.
    const out = ramp(t, 0.12, 0.4), s = (-0.25 + 0.5 * ramp(t, R - 0.15, R) + 0.6 * ramp(t, R, R + 0.3));
    _u.copy(f.right).multiplyScalar(Math.cos(s)).addScaledVector(f.belly, Math.sin(s));
    _fR.copy(_hipR).addScaledVector(f.forward, -0.8);
    _fR.lerp(_t.copy(_hipR).addScaledVector(_u, 0.85), out);
    _fR.lerp(mv.spot, strike(t, R));
    _kR.copy(_hipR).addScaledVector(f.belly, 0.5).addScaledVector(f.forward, 0.3);
    // Standing leg straight down the body.
    _fL.copy(_hipL).addScaledVector(f.forward, -0.85).addScaledVector(f.right, 0.05);
    _kL.copy(_hipL).addScaledVector(f.belly, 0.6).addScaledVector(f.forward, -0.4);
    legTo(sw, 'R', _fR, _kR, w);
    legTo(sw, 'L', _fL, _kL, w);
    armsWide(sw, w, 0.12, 0);
    // The ball: tossed up over the head for the turn, dropping onto the foot for the strike.
    if (t < R + 0.02) {
      const toss = Math.sin(Math.PI * ramp(t, 0.05, R));
      sw.ballPoint.lerpVectors(mv.carry, mv.spot, ramp(t, 0.05, 0.3)).addScaledVector(UP, 0.6 * toss);
    }
    return t >= SPIN.end;
  }

  function scorpionMove(sw, mv) {
    const t = mv.t, f = sw.frame, R = SCORPION.release;
    strikeSpot(sw, mv, 0.45, 0.75, 0);
    const w = ramp(t, 0, 0.15) * (1 - ramp(t, SCORPION.end - 0.35, SCORPION.end));
    // Back to the goal, then pitched forward, head down and away from it.
    _yawQ.setFromAxisAngle(Y, Math.PI * ramp(t, 0.02, 0.3));
    _bodyQ.setFromAxisAngle(X, 0.95 * ramp(t, 0.2, 0.6));
    turn(sw, _yawQ.multiply(_bodyQ), 0, 0, w);
    SS.rig.bodyFrame(sw.bones, f);
    hips(sw);
    // Both heels curled up over the back (the scorpion's tail, knees out behind), then the
    // right leg whipped straight back at the goal while the left stays curled.
    const curl = ramp(t, 0.25, 0.55), ext = ramp(t, R - 0.15, R);
    _fR.copy(_hipR).addScaledVector(f.forward, -0.8);
    _fR.lerp(_t.copy(_hipR).addScaledVector(f.belly, -0.55).addScaledVector(f.forward, 0.5), curl);
    _u.copy(f.belly).multiplyScalar(-0.85).addScaledVector(f.forward, -0.5).normalize();
    _fR.lerp(_t.copy(_hipR).addScaledVector(_u, 0.95), ext);
    _fR.lerp(mv.spot, strike(t, R));
    _kR.copy(_hipR).addScaledVector(f.forward, -0.25).addScaledVector(f.belly, -0.7).addScaledVector(f.right, 0.1);
    _fL.copy(_hipL).addScaledVector(f.forward, -0.85).addScaledVector(f.belly, -0.15);
    _fL.lerp(_t.copy(_hipL).addScaledVector(f.belly, -0.55).addScaledVector(f.forward, 0.45), curl);
    _kL.copy(_hipL).addScaledVector(f.forward, -0.25).addScaledVector(f.belly, -0.7).addScaledVector(f.right, -0.1);
    legTo(sw, 'R', _fR, _kR, w);
    legTo(sw, 'L', _fL, _kL, w);
    armsWide(sw, w, 0.35, 0.15);
    if (t < R + 0.02) sw.ballPoint.lerpVectors(mv.carry, mv.spot, ramp(t, 0.05, 0.35));
    return t >= SCORPION.end;
  }

  /* ── tackle: a defender lunges at the carrier ──────────────────────────
     Bryan's round-3 pick (2026-10-03), in place of the stock dive clip. A tackler is
     usually swimming flat out, so the lunge aims the body from wherever the clip has it
     (aimBody), not from upright. Wind up (arms cocked), then the whole body shoots at the
     carrier, head first, both arms wrapping round their chest; a winner rips the ball
     away and pulls it in to their own chest, a loser grabs at water and sags back.
     opts: { at: the carrier's chest bone, win: true if this tackler took the ball }. */
  const TACKLE = { lunge: [0.12, 0.4], end: 1.0 };
  const _fl = V(), _nl = V(), _dl = V(), _grab = V(), _ct = V();
  /** Turn the body so its head (pelvis -> neck, as the clip has it) points along `dir`
      (world), moved by `shift` (world), by w. Works from swimming or treading alike. */
  function aimBody(sw, dir, shift, w) {
    const tilt = sw.root.parent;
    tilt.worldToLocal(sw.pelvis.getWorldPosition(_fl));
    tilt.worldToLocal(sw.bones.neck.getWorldPosition(_nl));
    _nl.sub(_fl).normalize();                                        // the clip's own head direction, group space
    _qi.copy(sw.group.quaternion).invert();
    _dl.copy(dir).applyQuaternion(_qi).normalize();
    _q.setFromUnitVectors(_nl, _dl);
    _q.slerp(_qid.identity(), 1 - w);
    _shift.copy(shift).applyQuaternion(_qi).multiplyScalar(w);
    sw.setTilt(_q, _shift);
  }
  function tackleMove(sw, mv) {
    const t = mv.t, o = mv.opts, f = sw.frame, T = TACKLE;
    const w = ramp(t, 0, 0.12) * (1 - ramp(t, T.end - 0.35, T.end));
    // The carrier's chest: followed until the arms close on it, then where it was (a
    // carrier who broke free swims out of the grab).
    if (t < T.lunge[1] || o.win) o.at.getWorldPosition(_ct); else _ct.copy(mv.last || o.at.getWorldPosition(_ct));
    if (t < T.lunge[1]) mv.last = _ct.clone();
    sw.chest.getWorldPosition(_k);
    _dir.subVectors(_ct, _k); const dist = _dir.length(); _dir.divideScalar(dist || 1);
    const lunge = ramp(t, T.lunge[0], T.lunge[1]);
    const back = o.win ? ramp(t, 0.5, 0.85) : ramp(t, 0.45, 0.9);
    const reachK = lunge * (1 - back * (o.win ? 0.7 : 1));
    // Head first at the carrier, the body thrown all the way there (a winner can start a
    // couple of metres off: the match hands them the ball at once, so they must go and get it).
    _shift.copy(_dir).multiplyScalar(Math.max(0, Math.min(3.0, dist - 0.55)) * reachK);
    aimBody(sw, _dir, _pel.copy(_shift), w * (0.35 + 0.65 * lunge));
    SS.rig.bodyFrame(sw.bones, f);
    ['L', 'R'].forEach(side => {
      shoulder(sw, side, _s);
      _side.copy(f.right).multiplyScalar(side === 'R' ? 1 : -1);
      // Cocked: elbows back, hands by the shoulders.
      _hand.copy(_s).addScaledVector(f.belly, 0.2).addScaledVector(f.forward, -0.1).addScaledVector(_side, 0.15);
      _pole.copy(_s).addScaledVector(f.forward, -0.4).addScaledVector(_side, 0.3);
      // The grab: round either side of the carrier's chest.
      _grab.copy(_ct).addScaledVector(_side, 0.2).addScaledVector(_dir, -0.05);
      _hand.lerp(_grab, reachK);
      _pole.lerp(_t.copy(_s).addScaledVector(_side, 0.45).addScaledVector(f.forward, -0.15), reachK);
      // A winner pulls the ball in to their own chest.
      if (o.win) _hand.lerp(_t.copy(f.chest).addScaledVector(f.belly, 0.28).addScaledVector(_side, 0.12), back);
      reach(sw, side, _hand, _pole, w);
    });
    if (o.win) {
      // The ball stays on the carrier until the hands close on it, comes away in both hands,
      // then settles into the carry.
      _t.lerpVectors(sw.handL.getWorldPosition(_hand), sw.handR.getWorldPosition(_s), 0.5);
      _t.lerp(_ct, 1 - ramp(t, T.lunge[1] - 0.05, T.lunge[1] + 0.05));
      sw.ballPoint.lerp(_t, 1 - ramp(t, 0.75, T.end));
    }
    return t >= T.end;
  }

  /* ── knocked: the carrier hit by a tackle ───────────────────────────────
     Thrown back away from the tackler, arms flung up, then swimming again; one who lost
     the ball reaches after it. opts: { from: the tackler's chest bone, lost }. */
  const KNOCKED = { end: 0.9 };
  function knockedMove(sw, mv) {
    const t = mv.t, o = mv.opts, f = sw.frame;
    if (!mv.from) mv.from = o.from.getWorldPosition(V());
    sw.chest.getWorldPosition(_k);
    _dir.subVectors(_k, mv.from).setY(0); if (_dir.lengthSq() < 1e-6) _dir.set(1, 0, 0); _dir.normalize();   // away from the hit
    const hit = ramp(t, 0, 0.12) * (1 - ramp(t, 0.35, KNOCKED.end));
    // The head snaps back away from the tackler: tilt the body's own head direction away.
    const tilt = sw.root.parent;
    tilt.worldToLocal(sw.pelvis.getWorldPosition(_fl)); tilt.worldToLocal(sw.bones.neck.getWorldPosition(_nl));
    _nl.sub(_fl).normalize().applyQuaternion(sw.group.quaternion);  // head direction, world
    _d.copy(_nl).addScaledVector(_dir, 0.9).normalize();
    aimBody(sw, _d, _pel.copy(_dir).multiplyScalar(0.45), hit);
    SS.rig.bodyFrame(sw.bones, f);
    ['L', 'R'].forEach(side => {
      shoulder(sw, side, _s);
      _side.copy(f.right).multiplyScalar(side === 'R' ? 1 : -1);
      _hand.copy(_s).addScaledVector(_side, 0.45).addScaledVector(f.forward, 0.3).addScaledVector(f.belly, 0.1);
      if (o.lost && side === 'R') _hand.copy(_s).addScaledVector(_dir, -0.6).addScaledVector(f.forward, 0.1);   // after the ball
      _pole.copy(_s).addScaledVector(_side, 0.4).addScaledVector(f.forward, -0.3);
      reach(sw, side, _hand, _pole, hit);
    });
    return t >= KNOCKED.end;
  }

  /* ── pass: a one-arm push at the teammate ──────────────────────────────
     The match lets the ball go the instant the pass is made, so this is quick: the right
     arm punches out along the line of the pass with the ball (game.js draws the ball
     leaving from the hand), holds there a beat so it reads, and comes back; the left arm
     swings back for balance. opts: { to: where the ball is going (world) }. */
  const PASS = { end: 0.75 };
  function passMove(sw, mv) {
    const t = mv.t, f = sw.frame;
    SS.rig.bodyFrame(sw.bones, f);
    _aim.subVectors(mv.opts.to, f.chest).normalize();
    const w = ramp(t, 0, 0.06) * (1 - ramp(t, 0.4, PASS.end));
    shoulder(sw, 'R', _s);
    _hand.copy(_s).addScaledVector(_aim, 0.62).addScaledVector(f.forward, 0.05);
    _pole.copy(_s).addScaledVector(f.right, 0.35).addScaledVector(f.belly, -0.2).addScaledVector(_aim, -0.2);
    reach(sw, 'R', _hand, _pole, w);
    shoulder(sw, 'L', _s);
    _hand.copy(_s).addScaledVector(_aim, -0.35).addScaledVector(f.right, -0.35).addScaledVector(f.forward, -0.1);
    _pole.copy(_s).addScaledVector(f.right, -0.3).addScaledVector(f.forward, -0.3);
    reach(sw, 'L', _hand, _pole, w * 0.7);
    return t >= PASS.end;
  }

  /* ── catch: a teammate (or an intercepting defender) takes the ball ─────────
     Hands come up to meet it as it comes in, palms to it; on arrival both hands close on
     it and bring it in to the carry. An interception lunges a little at it as well.
     opts: { ball: the drawn ball (live), progress: () => 0..1 (1 = it has arrived), lunge }. */
  const _bm = V(), _cy = V();
  function catchMove(sw, mv) {
    const o = mv.opts, f = sw.frame, p = o.progress();
    if (p >= 1 && mv.arrived == null) mv.arrived = mv.t;
    const ta = mv.arrived == null ? -1 : mv.t - mv.arrived;
    const reachK = ease((p - 0.4) / 0.6), pull = ramp(ta, 0, 0.3);
    const w = ramp(mv.t, 0, 0.2) * (1 - ramp(ta, 0.35, 0.65));
    sw.chest.getWorldPosition(_k);
    _dir.subVectors(o.ball, _k); const dist = _dir.length(); _dir.divideScalar(dist || 1);
    if (o.lunge) {
      _shift.copy(_dir).multiplyScalar(Math.max(0, Math.min(0.8, dist - 0.6)) * reachK * (1 - pull));
      aimBody(sw, _dir, _pel.copy(_shift), w * reachK * 0.6);
    }
    SS.rig.bodyFrame(sw.bones, f);
    _cy.copy(f.chest).addScaledVector(f.belly, 0.3).addScaledVector(f.forward, -0.1).addScaledVector(f.right, 0.08);   // the carry
    ['L', 'R'].forEach(side => {
      shoulder(sw, side, _s);
      _side.copy(f.right).multiplyScalar(side === 'R' ? 1 : -1);
      // Toward the ball, as far as the arm goes; the hands a ball's width apart.
      _d.subVectors(o.ball, _s); const reachD = Math.min(0.62, _d.length()); _d.normalize();
      _hand.copy(_s).addScaledVector(_d, reachD).addScaledVector(_side, 0.11);
      _hand.lerp(_t.copy(_cy).addScaledVector(_side, 0.13), pull);
      _pole.copy(_s).addScaledVector(_side, 0.4).addScaledVector(f.forward, -0.3).addScaledVector(f.belly, -0.1);
      reach(sw, side, _hand, _pole, w * Math.max(reachK, pull));
    });
    if (ta >= 0) {
      // Caught: the ball sits between the hands, then settles into the carry.
      _bm.lerpVectors(sw.handL.getWorldPosition(_hand), sw.handR.getWorldPosition(_t), 0.5);
      sw.ballPoint.lerp(_bm, 1 - ramp(ta, 0.3, 0.6));
    }
    return ta > 0.65 || mv.t > 6;
  }

  /* ── dodge: the carrier breaks a tackle ──────────────────────────────────
     A barrel roll along the body, swerving away from the tackler and back, the ball held
     tight through it. opts: { from: the nearest tackler's chest bone }. */
  const DODGE = { roll: [0.05, 0.6], end: 0.8 };
  const _ax = V();
  function dodgeMove(sw, mv) {
    const t = mv.t, o = mv.opts, f = sw.frame;
    sw.chest.getWorldPosition(_k);
    if (!mv.away) { mv.away = V().subVectors(_k, o.from.getWorldPosition(V())); if (mv.away.lengthSq() < 1e-6) mv.away.set(1, 0, 0); mv.away.normalize(); }
    // The roll: about the body's own long axis, as the clip has it (swimming or upright).
    const tilt = sw.root.parent;
    tilt.worldToLocal(sw.pelvis.getWorldPosition(_fl)); tilt.worldToLocal(sw.bones.neck.getWorldPosition(_nl));
    _ax.subVectors(_nl, _fl).normalize();
    _q.setFromAxisAngle(_ax, Math.PI * 2 * ramp(t, DODGE.roll[0], DODGE.roll[1]));
    const swerve = Math.sin(Math.PI * ramp(t, 0, DODGE.end));
    _qi.copy(sw.group.quaternion).invert();
    _shift.copy(mv.away).applyQuaternion(_qi).multiplyScalar(0.6 * swerve);
    sw.setTilt(_q, _shift);
    // The ball stays tucked in the carry as the body turns over.
    SS.rig.bodyFrame(sw.bones, f);
    sw.ballPoint.copy(f.chest).addScaledVector(f.belly, 0.3).addScaledVector(f.forward, -0.1).addScaledVector(f.right, 0.08);
    _hand.copy(sw.ballPoint).addScaledVector(f.right, 0.17).addScaledVector(f.belly, 0.05);
    shoulder(sw, 'R', _s);
    _pole.copy(_s).addScaledVector(f.right, 0.5).addScaledVector(f.forward, -0.35);
    reach(sw, 'R', _hand, _pole, 1);
    return t >= DODGE.end;
  }

  const MOVES = { pass: passMove, catch: catchMove, dodge: dodgeMove, tackle: tackleMove, knocked: knockedMove, throw: throwMove, keeper: keeperMove, block: blockMove, kick: kickMove, celebrate: celebrateMove,
    flip: flipMove, spin: spinMove, scorpion: scorpionMove };
  /** The shooter's moves (the shooter treads through them), and when each lets the ball go. */
  const RELEASE = { throw: 0.6, kick: 0.6, flip: FLIP.release, spin: SPIN.release, scorpion: SCORPION.release };
  /** Pose a swimmer for its move this frame (after the clip and the carry). True = finished. */
  function apply(sw, mv) { const fn = MOVES[mv.name]; return fn ? fn(sw, mv) : true; }
  const isShot = mv => !!(mv && RELEASE[mv.name]);

  return { apply, isShot, RELEASE, THROW, CELEBRATE };
})();
