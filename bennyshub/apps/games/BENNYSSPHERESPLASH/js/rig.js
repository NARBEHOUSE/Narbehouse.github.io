/** Benny's Sphere Splash - custom body motion layered over the canned clips.
 *
 * The Quaternius clips are a base, not a limit. After the mixer has posed the whole
 * body from a clip, this module overrides chosen limbs every frame:
 *  - bodyFrame(): the swimmer's own forward / right / belly directions, measured from
 *    the bones, so "hold the ball under your chest" means the same thing whatever
 *    way up the swimmer is in the water;
 *  - twoBone(): an analytic two-bone reach (shoulder-elbow-wrist or hip-knee-ankle).
 *    Say where the hand goes and which way the elbow points; it bends the arm to get
 *    there. Works in world space, so it never depends on how a bone's local axes were
 *    authored.
 * Carrying, catching, keeper saves and tackles are all built from these two pieces.
 */
SS.rig = (function () {
  'use strict';

  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
  const _q = new THREE.Quaternion(), _qw = new THREE.Quaternion(), _qp = new THREE.Quaternion();
  const _dir = new THREE.Vector3(), _pole = new THREE.Vector3(), _elbow = new THREE.Vector3();

  function find(root, name) {
    let bone = null;
    root.traverse(n => { if (!bone && n.isBone && n.name === name) bone = n; });
    return bone;
  }

  /** Rotate `bone` in world space so that the direction `from` becomes `to`. */
  function rotateWorld(bone, from, to) {
    _q.setFromUnitVectors(from.normalize(), to.normalize());
    bone.getWorldQuaternion(_qw);
    _qw.premultiply(_q);                                  // new world rotation
    bone.parent.getWorldQuaternion(_qp).invert();
    bone.quaternion.copy(_qp.multiply(_qw));              // back into the parent's space
    bone.updateMatrixWorld(true);
  }

  /**
   * Bend upper -> lower -> end so `end` reaches `target`, elbow toward `pole`.
   * All points in world space. Out-of-reach targets are reached as far as the
   * limb allows, straight toward them - never a snapped or inverted joint.
   */
  function twoBone(upper, lower, end, target, pole) {
    const S = upper.getWorldPosition(_a), E = lower.getWorldPosition(_b), W = end.getWorldPosition(_c);
    const la = S.distanceTo(E), lb = E.distanceTo(W);
    _dir.subVectors(target, S);
    const dist = THREE.MathUtils.clamp(_dir.length(), Math.abs(la - lb) + 1e-3, la + lb - 1e-3);
    _dir.normalize();
    // Where the elbow must be: law of cosines along the reach, lifted toward the pole.
    const x = (la * la - lb * lb + dist * dist) / (2 * dist);
    const h = Math.sqrt(Math.max(0, la * la - x * x));
    _pole.subVectors(pole, S); _pole.addScaledVector(_dir, -_pole.dot(_dir));
    if (_pole.lengthSq() < 1e-8) _pole.set(0, 1, 0).addScaledVector(_dir, -_dir.y);
    _pole.normalize();
    _elbow.copy(S).addScaledVector(_dir, x).addScaledVector(_pole, h);
    rotateWorld(upper, _d.subVectors(E, S), _b.subVectors(_elbow, S));
    const W2 = end.getWorldPosition(_c), E2 = lower.getWorldPosition(_b);
    rotateWorld(lower, _d.subVectors(W2, E2), _a.subVectors(target, E2));
  }

  /** The swimmer's own axes, from its bones: forward = toward the head, right = toward
   *  the right shoulder, belly = the way the chest faces. */
  function bodyFrame(b, out) {
    b.pelvis.getWorldPosition(_a); b.neck.getWorldPosition(_b);
    out.forward.subVectors(_b, _a).normalize();
    b.clavicleL.getWorldPosition(_a); b.clavicleR.getWorldPosition(_c);
    out.right.subVectors(_c, _a).normalize();
    out.belly.crossVectors(out.forward, out.right).normalize();
    b.chest.getWorldPosition(out.chest);
    return out;
  }

  /** Bones a limb override needs, looked up once per swimmer. */
  function bonesOf(root) {
    const names = { pelvis: 'pelvis', chest: 'spine_03', neck: 'neck_01', head: 'Head',
      clavicleL: 'clavicle_l', clavicleR: 'clavicle_r',
      upperL: 'upperarm_l', lowerL: 'lowerarm_l', handL: 'hand_l',
      upperR: 'upperarm_r', lowerR: 'lowerarm_r', handR: 'hand_r',
      thighR: 'thigh_r', calfR: 'calf_r', footR: 'foot_r',
      thighL: 'thigh_l', calfL: 'calf_l', footL: 'foot_l' };
    const out = {};
    for (const k in names) out[k] = find(root, names[k]);
    return out;
  }

  return { twoBone, bodyFrame, bonesOf, find };
})();
