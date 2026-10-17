/** Benny's Sphere Splash - the replay recorder: the last few seconds, exactly as seen.
 *
 * A goal replay has to show what the player saw - the wind-up, the throw or the kick,
 * the keeper's dive - and those are posed on screen (moves.js), not in the sim. So this
 * records the DISPLAY, not the match: 30 times a second of live play, every swimmer's
 * place, heading, body lean and every bone, and the ball. Playback puts them back,
 * blended between samples, so it is smooth at any speed. Nothing is recorded while play
 * is frozen (a choice, a card), so a replay never stops for a decision.
 *
 * Memory: 12 swimmers x ~65 bones x 7 numbers x 30 a second x 10 s, about 7 MB, kept in
 * one ring that is reused for the whole match.
 */
SS.replay = (function () {
  'use strict';

  const RATE = 30, SECONDS = 10, CAP = RATE * SECONDS;
  let sws = [], bones = [], per = 0, stride = 0, buf = null, times = null;
  let head = 0, count = 0, now = 0, since = 0;

  /** Start recording these swimmers (a new match on the scene); forgets everything before. */
  function init(swimmers) {
    sws = swimmers;
    bones = swimmers.map(sw => { const b = []; sw.root.traverse(n => { if (n.isBone) b.push(n); }); return b; });
    per = bones.map(b => 14 + b.length * 7);
    stride = per.reduce((a, b) => a + b, 0) + 4;               // + the ball and who holds it
    if (!buf || buf.length !== stride * CAP) buf = new Float32Array(stride * CAP);
    times = times || new Float64Array(CAP);
    clear();
  }
  /** Forget what has been recorded (everyone was just moved: a kickoff, a restored save). */
  function clear() { head = 0; count = 0; since = 1; }

  /** Call once a frame of live play, after everything is drawn. */
  function record(dt, ballPos, owner) {
    if (!buf || !sws.length) return;
    now += dt; since += dt;
    if (since < 1 / RATE) return;
    since = 0;
    let o = head * stride;
    sws.forEach((sw, j) => {
      const tilt = sw.root.parent;
      sw.group.position.toArray(buf, o); sw.group.quaternion.toArray(buf, o + 3);
      tilt.position.toArray(buf, o + 7); tilt.quaternion.toArray(buf, o + 10);
      o += 14;
      bones[j].forEach(b => { b.position.toArray(buf, o); b.quaternion.toArray(buf, o + 3); o += 7; });
    });
    ballPos.toArray(buf, o); buf[o + 3] = owner == null ? -1 : owner;
    times[head] = now;
    head = (head + 1) % CAP; count = Math.min(CAP, count + 1);
  }

  const slot = k => (head - count + k + CAP) % CAP;          // k-th oldest sample
  function earliest() { return count ? times[slot(0)] : now; }

  /** Pose everyone as they were at recorded time t; returns who had the ball (or null). */
  const _qa = new Float32Array(4);
  function pose(t, ballOut) {
    if (!count) return null;
    // The two samples either side of t (binary search: samples are in time order).
    let lo = 0, hi = count - 1;
    if (t <= times[slot(0)]) hi = 0;
    else if (t >= times[slot(hi)]) lo = hi;
    else while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (times[slot(mid)] <= t) lo = mid; else hi = mid; }
    const a = slot(lo), b = slot(hi), ta = times[a], tb = times[b];
    const k = tb > ta ? Math.min(1, Math.max(0, (t - ta) / (tb - ta))) : 0;
    let oa = a * stride, ob = b * stride;
    const vec = (target, i) => target.set(buf[oa + i] + (buf[ob + i] - buf[oa + i]) * k,
      buf[oa + i + 1] + (buf[ob + i + 1] - buf[oa + i + 1]) * k, buf[oa + i + 2] + (buf[ob + i + 2] - buf[oa + i + 2]) * k);
    const quat = (target, i) => { THREE.Quaternion.slerpFlat(_qa, 0, buf, oa + i, buf, ob + i, k); target.fromArray(_qa); };
    sws.forEach((sw, j) => {
      const tilt = sw.root.parent;
      vec(sw.group.position, 0); quat(sw.group.quaternion, 3);
      vec(tilt.position, 7); quat(tilt.quaternion, 10);
      oa += 14; ob += 14;
      bones[j].forEach(bn => { vec(bn.position, 0); quat(bn.quaternion, 3); oa += 7; ob += 7; });
      sw.group.updateMatrixWorld(true);
    });
    if (ballOut) vec(ballOut, 0);
    const owner = buf[(k < 0.5 ? oa : ob) + 3];
    return owner < 0 ? null : owner;
  }

  return { init, clear, record, pose, earliest, get now() { return now; } };
})();
