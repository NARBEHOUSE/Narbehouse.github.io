/** Benny's Sphere Splash - swimmer bodies: load, recolour into team kit, outline, animate.
 *
 * The bodies and clips come from js/model-data.js (base64 GLB, CC0 Quaternius, built
 * by tools/build/prep-models.mjs). Textures were stripped at build time: a swimmer is
 * painted in flat toon colours here, so a team reads as one bold shape and colour at
 * any distance - small detail does not read for the player this is built for.
 *
 * The kit is painted by bone: every vertex mostly weighted to a hip, spine or leg bone
 * is kit colour, chest and arms are the accent, the head above the brow is the cap, the
 * rest is skin. That gives every body the same wetsuit silhouette without any
 * hand-painted masks. Role gear (pads, fins) is one extra skinned mesh: see buildGear.
 */
SS.models = (function () {
  'use strict';

  const KIT = new Set(['pelvis', 'spine_01', 'spine_02', 'thigh_l', 'thigh_r']);
  const ACCENT = new Set(['spine_03', 'clavicle_l', 'clavicle_r', 'upperarm_l', 'upperarm_r']);
  const INK = 0x14161f;
  const GLOW = 0xffe14d, GLOW_PX = 5;   // the ball carrier's glow round the ink line (round 3)
  /* On a yellow or orange kit a gold glow reads as more kit, so those carriers glow white. */
  const _hsl = {};
  const goldish = hex => { new THREE.Color(hex).getHSL(_hsl, THREE.SRGBColorSpace); return _hsl.h > 0.04 && _hsl.h < 0.2 && _hsl.s > 0.5 && _hsl.l > 0.35; };
  const glowFor = o => o.glow || (goldish(o.kit) || goldish(o.accent) ? 0xffffff : GLOW);

  /* Body styles. Proportions are sculpted into the bind-pose geometry once, so the bones
     and clips are untouched and every move, IK reach and ball hold still lines up.
     head/hand/foot scale about that joint; limb and torso push the surface out along its
     normal, in metres. outlinePx is the ink line's thickness on screen at any distance,
     never thinner than outlineMin metres up close.
     chunky (Bryan's pick, 2026-10-02, of four side by side): the only one where every
     swimmer stands out from the water by a clear margin, and big cartoon shapes read for
     a low-vision player. classic is the original body, kept for before/after captures. */
  const STYLES = {
    chunky:  { head: 1.35, hand: 1.6, foot: 1.5, limb: 0.025, torso: 0.03, outlinePx: 2.5, outlineMin: 0.03 },
    classic: { head: 1,    hand: 1,   foot: 1,   limb: 0,     torso: 0,    outlinePx: 0,   outlineMin: 0.018 },
  };
  let style = STYLES.chunky;
  const FINGER = /^(index|middle|ring|pinky|thumb)_/;
  // Which sculpt part a bone belongs to, and the joint that part scales about.
  function partOf(name) {
    if (name === 'Head') return ['head', 'Head'];
    const side = name.slice(-2);
    if (name.startsWith('hand_') || FINGER.test(name)) return ['hand', 'hand' + side];
    if (/^(foot|ball|ball_leaf)_/.test(name)) return ['foot', 'foot' + side];
    if (/^(upperarm|lowerarm|thigh|calf)_/.test(name)) return ['limb', null];
    if (/^(pelvis|spine_0\d|clavicle_)/.test(name)) return ['torso', null];
    return [null, null];
  }

  let bodies = null, clips = {}, gradient = null;

  function bufferFrom(b64) {
    const bin = atob(b64), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }
  function parse(key) {
    return new Promise((resolve, reject) =>
      new THREE.GLTFLoader().parse(bufferFrom(SS.MODEL_DATA[key]), '', resolve, reject));
  }

  // Three flat bands of light: the cartoon look, and it keeps kit colours readable
  // instead of shading them into mud in the teal water.
  function makeGradient() {
    const data = new Uint8Array([90, 170, 255]);
    const tex = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
    tex.minFilter = tex.magFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.needsUpdate = true;
    return tex;
  }

  async function load() {
    if (bodies) return;
    const [male, female, anim] = await Promise.all([parse('male'), parse('female'), parse('clips')]);
    bodies = { male: male.scene, female: female.scene };
    anim.animations.forEach(a => { clips[a.name] = a; });
    gradient = makeGradient();
    SS.theme.onChange(applyTheme);
  }

  function toonMaterial() {
    return new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradient });
  }
  /* Colour profiles (theme.js): every ink outline wears the profile's line colour (white on
     High Contrast's black pool) and its extra thickness, one shared uniform. (Flat, unshaded
     swimmers were tried for High Contrast and lost: overlapping bodies merged into one shape.) */
  const inkMats = new Set(), outlineAdd = { value: 0 };
  function applyTheme(p) {
    outlineAdd.value = p.outlineAdd;
    inkMats.forEach(m => m.color.set(p.outline));
  }

  const get = ['getX', 'getY', 'getZ', 'getW'];       // r155 has no getComponent()
  const jointOf = (skel, name) => new THREE.Vector3().setFromMatrixPosition(
    skel.boneInverses[skel.bones.findIndex(b => b.name === name)].clone().invert());

  /* Where the head is, in bind space, measured off the sculpted mesh: its centre, up
     (pelvis to head), front (towards the eyes), right, radius and eye height. The cap's
     edge is drawn from this, so it fits whatever size the head is. */
  function headFrame(body, eyes) {
    const g = body.geometry, pos = g.attributes.position, idx = g.attributes.skinIndex, wt = g.attributes.skinWeight;
    const head = body.skeleton.bones.findIndex(b => b.name === 'Head');
    const centre = new THREE.Vector3(), p = new THREE.Vector3(), pts = [];
    for (let v = 0; v < pos.count; v++) {
      let w = 0;
      for (let k = 0; k < 4; k++) if (idx[get[k]](v) === head) w += wt[get[k]](v);
      if (w > 0.5) { p.fromBufferAttribute(pos, v).applyMatrix4(body.bindMatrix); pts.push(p.clone()); centre.add(p); }
    }
    centre.divideScalar(pts.length);
    const eye = new THREE.Vector3(), ep = eyes.geometry.attributes.position;
    for (let v = 0; v < ep.count; v++) eye.add(p.fromBufferAttribute(ep, v).applyMatrix4(eyes.bindMatrix));
    eye.divideScalar(ep.count);
    const up = centre.clone().sub(jointOf(body.skeleton, 'pelvis')).normalize();
    const d = eye.clone().sub(centre);
    const front = d.clone().addScaledVector(up, -d.dot(up)).normalize();
    const right = new THREE.Vector3().crossVectors(up, front);
    let radius = 0;
    pts.forEach(q => { q.sub(centre); radius = Math.max(radius, Math.hypot(q.dot(front), q.dot(right))); });
    return { centre, up, front, right, radius, eye: d.dot(up) };
  }

  /* A water-polo cap: the skull from the brow back and down to the nape, sides over the ears. */
  const _d = new THREE.Vector3();
  function capAt(p, hf) {
    _d.copy(p).sub(hf.centre);
    const u = _d.dot(hf.up), f = _d.dot(hf.front) / hf.radius;
    const brow = hf.eye + 0.35 * hf.radius, nape = hf.eye - 0.55 * hf.radius;
    return u > nape + (brow - nape) * (f + 1) / 2;
  }

  /* Paint the body in its kit, and shape the cap and gloves: those regions are pushed
     out a little so they read as something worn (and the ink outline goes round them). */
  const CAP_LIFT = 0.012, GLOVE_LIFT = 0.02;
  function paint(mesh, o, hf) {
    const g = mesh.geometry, bones = mesh.skeleton.bones, count = g.attributes.position.count;
    const pos = g.attributes.position, nrm = g.attributes.normal, idx = g.attributes.skinIndex, wt = g.attributes.skinWeight;
    const out = new Float32Array(count * 3), c = new THREE.Color();
    const nToBind = new THREE.Matrix3().getNormalMatrix(mesh.bindMatrix);
    const p = new THREE.Vector3(), n = new THREE.Vector3();
    for (let v = 0; v < count; v++) {
      let kit = 0, accent = 0, head = 0, hand = 0;
      for (let k = 0; k < 4; k++) {
        const name = bones[idx[get[k]](v)].name, w = wt[get[k]](v);
        if (KIT.has(name) || name.startsWith('calf_')) kit += w;
        else if (ACCENT.has(name) || name.startsWith('lowerarm_')) accent += w;
        else if (name === 'Head') head += w;
        else if (name.startsWith('hand_') || FINGER.test(name)) hand += w;
      }
      let colour = accent > 0.5 ? o.accent : kit > 0.5 ? o.kit : o.skin, lift = 0;
      p.fromBufferAttribute(pos, v).applyMatrix4(mesh.bindMatrix);
      if (o.gloves && hand > 0.5) { colour = o.gloves; lift = GLOVE_LIFT; }
      else if (o.cap && head > 0.5) {
        if (capAt(p, hf)) { colour = o.cap; lift = CAP_LIFT; }
      }
      if (lift) {
        n.fromBufferAttribute(nrm, v).applyMatrix3(nToBind).normalize();
        p.addScaledVector(n, lift).applyMatrix4(mesh.bindMatrixInverse);
        pos.setXYZ(v, p.x, p.y, p.z);
      }
      c.set(colour);
      out[v * 3] = c.r; out[v * 3 + 1] = c.g; out[v * 3 + 2] = c.b;
    }
    pos.needsUpdate = true;
    g.setAttribute('color', new THREE.BufferAttribute(out, 3));
  }

  /* Position gear, built in bind space and skinned to the body's own skeleton so it moves
     with the arm it is on. All of a swimmer's gear is ONE mesh (one draw, one outline).
     pad: two-plate shoulder pads on the back of both shoulders. fins: a bracer on each
     forearm with a fin blade swept back along it. */
  function buildGear(body, hf, o) {
    const skel = body.skeleton, boneIdx = name => skel.bones.findIndex(b => b.name === name);
    const P = [], N = [], C = [], SI = [], SW = [], gearCol = new THREE.Color(o.gearColour);
    const m4 = new THREE.Matrix4(), m3 = new THREE.Matrix3(), v = new THREE.Vector3();
    function add(geo, matrix, weights, col = gearCol) {
      geo = geo.index ? geo.toNonIndexed() : geo;
      m3.getNormalMatrix(matrix);
      const gp = geo.attributes.position, gn = geo.attributes.normal;
      for (let i = 0; i < gp.count; i++) {
        v.fromBufferAttribute(gp, i).applyMatrix4(matrix); P.push(v.x, v.y, v.z);
        v.fromBufferAttribute(gn, i).applyMatrix3(m3).normalize(); N.push(v.x, v.y, v.z);
        C.push(col.r, col.g, col.b);
        SI.push(weights[0][0], weights[1] ? weights[1][0] : 0, 0, 0);
        SW.push(weights[0][1], weights[1] ? weights[1][1] : 0, 0, 0);
      }
    }
    // The body's surface height over a point, from the given bones' skin only (on a small
    // body the scaled-up head is within reach of the shoulder).
    function topAbove(at, reach, names, dir = hf.up) {
      const g = body.geometry, pos = g.attributes.position, idx = g.attributes.skinIndex, wt = g.attributes.skinWeight;
      const ids = names.map(boneIdx), q = new THREE.Vector3(), d = new THREE.Vector3();
      let top = -Infinity;
      for (let i = 0; i < pos.count; i++) {
        let w = 0;
        for (let k = 0; k < 4; k++) if (ids.includes(idx[get[k]](i))) w += wt[get[k]](i);
        if (w < 0.5) continue;
        q.fromBufferAttribute(pos, i).applyMatrix4(body.bindMatrix);
        d.copy(q).sub(at);
        const u = d.dot(dir);
        if (d.addScaledVector(dir, -u).length() < reach) top = Math.max(top, u);
      }
      return top;
    }
    /* Shoulder pads, one on the back of each shoulder over the blade. A flat swimmer's back
       faces the camera, so they stand up out of its outline from either side (on top of
       the shoulder they tucked in beside the cap and merged with it; Bryan picked these
       2026-10-02 over a single pad and a back plate). Mostly on the chest bone, so they
       do not ride up beside the head when the arms go overhead. */
    function pad(side) {
      const shoulder = jointOf(skel, 'upperarm' + side), clav = jointOf(skel, 'clavicle' + side);
      const out = shoulder.clone().sub(clav); out.addScaledVector(hf.up, -out.dot(hf.up)).normalize();
      const dir = hf.up.clone().multiplyScalar(0.55).sub(hf.front).normalize();      // up and back
      const side3 = new THREE.Vector3().crossVectors(out, dir).normalize();
      const at = shoulder.clone().addScaledVector(out, -0.02);
      const base = at.clone().addScaledVector(dir, topAbove(at, 0.07, ['clavicle' + side, 'upperarm' + side, 'spine_03'], dir));
      const weights = [[boneIdx('spine_03'), 0.6], [boneIdx('clavicle' + side), 0.4]];
      const tilt = new THREE.Quaternion().setFromAxisAngle(side3, -0.45);
      [[0.2, 0.085, 0.19, 0.01, 0.015], [0.15, 0.065, 0.16, 0.11, -0.045]].forEach(([rx, ry, rz, o1, u1]) => {
        const x = out.clone().applyQuaternion(tilt), y = dir.clone().applyQuaternion(tilt);
        m4.makeBasis(x.multiplyScalar(rx), y.multiplyScalar(ry), side3.clone().multiplyScalar(rz));
        m4.setPosition(base.clone().addScaledVector(out, o1).addScaledVector(dir, u1));
        add(new THREE.SphereGeometry(1, 20, 12), m4, weights);
      });
    }
    if (o.gear === 'pad') { pad('_l'); pad('_r'); }
    if (o.gear === 'fins') ['_l', '_r'].forEach(side => {
      const elbow = jointOf(skel, 'lowerarm' + side), wrist = jointOf(skel, 'hand' + side);
      const along = wrist.clone().sub(elbow), len = along.length(); along.normalize();
      const back = hf.up.clone().addScaledVector(along, -hf.up.dot(along)).normalize();
      const across = new THREE.Vector3().crossVectors(along, back);
      const weights = [[boneIdx('lowerarm' + side), 1]];
      // A bracer round the forearm (cylinder axis is its local y, laid along the arm)...
      m4.makeBasis(across, along, back).setPosition(elbow.clone().addScaledVector(along, 0.5 * len));
      add(new THREE.CylinderGeometry(0.068, 0.078, 0.6 * len, 16, 1), m4, weights);
      // ...and a fin standing off its back, swept towards the elbow: profile in (along,
      // back) metres, extruded across the arm.
      const shape = new THREE.Shape();
      shape.moveTo(0.72 * len, 0.06); shape.lineTo(0.22 * len, 0.06);
      shape.quadraticCurveTo(0.0 * len, 0.12, -0.12 * len, 0.25);
      shape.quadraticCurveTo(0.35 * len, 0.17, 0.72 * len, 0.06);
      const fin = new THREE.ExtrudeGeometry(shape, { depth: 0.026, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 1, curveSegments: 6 });
      fin.translate(0, 0, -0.013);
      m4.makeBasis(along, back, across).setPosition(elbow);
      add(fin, m4, weights);
    });
    /* The team's ornament: a pair, one on each side of the cap where the horns grow
       (Bryan, 2026-10-02: on the sides like the horns, not along the top). Flat shapes
       face sideways, so the side-on camera sees the whole shape whichever way the swimmer
       faces; the horns are real tapered tubes. Shapes are drawn in (back, up) metres and
       centred on the mount point. */
    const CREST_SCALE = { round: 0.8, star: 0.8, hex: 0.8, gear: 0.8 };   // Bryan: these four a bit smaller
    const CREST_UP = 0.6, CREST_BACK = 0.3;                                  // mount point, x head radius
    function crest(kind, col, k) {
      const head = [[boneIdx('Head'), 1]], back = hf.front.clone().negate();
      k *= CREST_SCALE[kind] || 1;
      if (kind === 'horn') {
        [-1, 1].forEach(side => {
          const out = hf.right.clone().multiplyScalar(side);
          const root = hf.centre.clone().addScaledVector(hf.up, 0.35 * hf.radius).addScaledVector(out, 0.75 * hf.radius);
          const curve = new THREE.QuadraticBezierCurve3(root,
            root.clone().addScaledVector(out, 0.13 * k).addScaledVector(hf.up, 0.06 * k),
            root.clone().addScaledVector(out, 0.12 * k).addScaledVector(hf.up, 0.17 * k).addScaledVector(back, 0.1 * k));
          add(taperTube(curve, 0.055 * k, 0.008 * k), new THREE.Matrix4(), head, col);
        });
        return;
      }
      const sh = new THREE.Shape();
      if (kind === 'star') {
        const cx = 0.02, cy = 0.1;
        for (let i = 0; i < 10; i++) {
          const a = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.06 : 0.14;
          const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
          i ? sh.lineTo(x, y) : sh.moveTo(x, y);
        }
      } else if (kind === 'hex') {                                   // shark fin, swept back
        sh.moveTo(-0.08, 0); sh.quadraticCurveTo(0.0, 0.08, 0.1, 0.22);
        sh.quadraticCurveTo(0.08, 0.1, 0.14, 0); sh.lineTo(-0.08, 0);
      } else if (kind === 'gear') {                                   // a cog with a hole
        const cx = 0.02, cy = 0.09, teeth = 8;
        for (let i = 0; i < teeth * 4; i++) {
          const a = (i / (teeth * 4)) * Math.PI * 2, r = (i % 4 < 2) ? 0.125 : 0.09;
          const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
          i ? sh.lineTo(x, y) : sh.moveTo(x, y);
        }
        const hole = new THREE.Path(); hole.absarc(cx, cy, 0.04, 0, Math.PI * 2, true); sh.holes.push(hole);
      } else if (kind === 'leaf') {                                   // a leaf leaning back
        sh.moveTo(-0.04, -0.01); sh.quadraticCurveTo(-0.07, 0.14, 0.13, 0.24);
        sh.quadraticCurveTo(0.12, 0.06, -0.04, -0.01);
      } else {                                                        // 'round': a rising sun
        const cx = 0.02, rays = 7;
        sh.moveTo(cx - 0.17, 0);
        for (let i = 0; i <= rays * 2; i++) {
          const a = Math.PI - (i / (rays * 2)) * Math.PI, r = i % 2 ? 0.17 : 0.1;
          sh.lineTo(cx + Math.cos(a) * r, Math.sin(a) * r);
        }
        sh.lineTo(cx - 0.17, 0);
      }
      const depth = 0.03;
      const geo = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 1, curveSegments: 8 });
      geo.computeBoundingBox();
      const mid = geo.boundingBox.getCenter(new THREE.Vector3());
      geo.translate(-mid.x, -mid.y, -depth / 2); geo.scale(k, k, 1);
      const across = new THREE.Vector3().crossVectors(back, hf.up);
      [-1, 1].forEach(side => {
        const out = hf.right.clone().multiplyScalar(side);
        // Up and back on the side of the cap, clear of the cheek and neck (Bryan, 2026-10-02).
        const level = hf.centre.clone().addScaledVector(hf.up, CREST_UP * hf.radius).addScaledVector(back, CREST_BACK * hf.radius);
        const at = level.addScaledVector(out, topAbove(level, 0.04, ['Head'], out) + depth / 2 + 0.006);   // on the cap's side
        m4.makeBasis(back, hf.up, across).setPosition(at);
        add(geo, m4, head, col);
      });
    }
    // A tube along a curve that tapers from r0 to r1: a horn.
    function taperTube(curve, r0, r1) {
      const segs = 12, radial = 12, geo = new THREE.TubeGeometry(curve, segs, 1, radial, false);
      const pos = geo.attributes.position, frames = curve.computeFrenetFrames(segs, false), c = new THREE.Vector3();
      for (let i = 0; i <= segs; i++) {
        const t = i / segs, r = r0 + (r1 - r0) * t; curve.getPointAt(t, c);
        for (let j = 0; j <= radial; j++) {
          const k = i * (radial + 1) + j;
          v.fromBufferAttribute(pos, k).sub(c).multiplyScalar(r).add(c);
          pos.setXYZ(k, v.x, v.y, v.z);
        }
      }
      geo.computeVertexNormals();
      return geo;
    }
    if (o.crest) crest(o.crest, new THREE.Color(o.crestColour), o.crestSize || 1);
    if (!P.length) return null;
    const geo = new THREE.BufferGeometry();
    const inv = body.bindMatrixInverse, ninv = new THREE.Matrix3().getNormalMatrix(inv);
    for (let i = 0; i < P.length; i += 3) {
      v.set(P[i], P[i + 1], P[i + 2]).applyMatrix4(inv); P[i] = v.x; P[i + 1] = v.y; P[i + 2] = v.z;
      v.set(N[i], N[i + 1], N[i + 2]).applyMatrix3(ninv).normalize(); N[i] = v.x; N[i + 1] = v.y; N[i + 2] = v.z;
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(SI, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(SW, 4));
    return geo;
  }

  /* The outline needs one normal per corner: hard-edged gear (the fin) has split normals,
     and pushing those apart would crack the ink line at every edge. */
  function smoothNormals(geo) {
    const out = geo.clone(), pos = out.attributes.position, nrm = out.attributes.normal, sum = new Map();
    const key = i => Math.round(pos.getX(i) * 1e4) + ',' + Math.round(pos.getY(i) * 1e4) + ',' + Math.round(pos.getZ(i) * 1e4);
    for (let i = 0; i < pos.count; i++) {
      const k = key(i), s = sum.get(k) || new THREE.Vector3();
      s.x += nrm.getX(i); s.y += nrm.getY(i); s.z += nrm.getZ(i); sum.set(k, s);
    }
    for (let i = 0; i < pos.count; i++) { const s = sum.get(key(i)).clone().normalize(); nrm.setXYZ(i, s.x, s.y, s.z); }
    return out;
  }
  function paintSolid(geometry, hex) {
    const n = geometry.attributes.position.count, out = new Float32Array(n * 3), c = new THREE.Color(hex);
    for (let v = 0; v < n; v++) { out[v * 3] = c.r; out[v * 3 + 1] = c.g; out[v * 3 + 2] = c.b; }
    geometry.setAttribute('color', new THREE.BufferAttribute(out, 3));
  }

  /* Reshape one skinned mesh in bind space: each vertex moves by its skin weights, so a
     wrist or neck blends smoothly between a scaled part and the unscaled one next to it. */
  function sculpt(mesh, st) {
    if (st.head === 1 && st.hand === 1 && st.foot === 1 && !st.limb && !st.torso) return;
    const g = mesh.geometry, skel = mesh.skeleton;
    const pos = g.attributes.position, nrm = g.attributes.normal, idx = g.attributes.skinIndex, wt = g.attributes.skinWeight;
    const byName = {};
    skel.bones.forEach((b, i) => { byName[b.name] = i; });
    // A joint's bind-space centre is the inverse of its inverse-bind matrix.
    const centreOf = name => new THREE.Vector3().setFromMatrixPosition(skel.boneInverses[byName[name]].clone().invert());
    const parts = skel.bones.map(b => {
      const [kind, joint] = partOf(b.name);
      if (kind === 'limb' || kind === 'torso') return { push: st[kind] };
      if (kind) return { scale: st[kind] - 1, centre: centreOf(joint) };
      return null;
    });
    const toBind = mesh.bindMatrix, fromBind = mesh.bindMatrixInverse;
    const nToBind = new THREE.Matrix3().getNormalMatrix(toBind);
    const get = ['getX', 'getY', 'getZ', 'getW'];
    const p = new THREE.Vector3(), n = new THREE.Vector3(), d = new THREE.Vector3(), q = new THREE.Vector3();
    for (let v = 0; v < pos.count; v++) {
      p.fromBufferAttribute(pos, v).applyMatrix4(toBind);
      n.fromBufferAttribute(nrm, v).applyMatrix3(nToBind).normalize();
      q.copy(p);
      for (let k = 0; k < 4; k++) {
        const w = wt[get[k]](v), part = parts[idx[get[k]](v)];
        if (!w || !part) continue;
        if (part.push) q.addScaledVector(n, part.push * w);
        else if (part.scale) q.add(d.copy(p).sub(part.centre).multiplyScalar(part.scale * w));
      }
      q.applyMatrix4(fromBind);
      pos.setXYZ(v, q.x, q.y, q.z);
    }
    pos.needsUpdate = true;
  }

  // The outline's on-screen thickness needs the view height in CSS pixels.
  const viewH = { value: window.innerHeight };
  window.addEventListener('resize', () => { viewH.value = window.innerHeight; });

  // Inverted hull, skinned: a second copy of the body on the same skeleton, pushed
  // out along its normals in bind pose and drawn back-faces-only in ink. The offset
  // is applied before skinning, so the outline follows every bend of the body. It
  // grows with distance (projectionMatrix[1][1] is 1/tan of half the field of view),
  // so a far swimmer keeps the same ink line as a near one. A thick hull pokes through
  // the body's own creases (a dark line down the small of the back), so each vertex is
  // also pushed straight away from the camera: that leaves where it lands on screen, and
  // so the silhouette, unchanged, and sinks the hull behind any crease shallower than
  // three outline widths.
  // `extraPx` / `colour` make a wider hull behind the ink one: the ball carrier's glow.
  function outlineFor(mesh, st, geometry = mesh.geometry, extraPx = 0, colour = null) {
    // No colour: the ink line, in the colour profile's line colour. A colour: the carrier's glow.
    const mat = new THREE.MeshBasicMaterial({ color: colour == null ? SS.theme.palette().outline : colour, side: THREE.BackSide });
    if (colour == null) inkMats.add(mat);
    mat.onBeforeCompile = shader => {
      shader.uniforms.uOutlineMin = { value: st.outlineMin * (extraPx ? 1.6 : 1) }; shader.uniforms.uOutlinePx = { value: st.outlinePx + extraPx };
      shader.uniforms.uViewH = viewH; shader.uniforms.uOutlineAdd = outlineAdd;
      shader.vertexShader = 'uniform float uOutlineMin, uOutlinePx, uViewH, uOutlineAdd;\n' + shader.vertexShader.replace(
        '#include <begin_vertex>', `#include <begin_vertex>
  float oDist = distance(cameraPosition, (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz);
  float oWidth = max(uOutlineMin, (uOutlinePx + uOutlineAdd) * oDist * 2.0 / (projectionMatrix[1][1] * uViewH));
  transformed += normal * oWidth;`).replace('#include <project_vertex>', `#include <project_vertex>
  mvPosition.xyz += normalize(mvPosition.xyz) * oWidth * 3.0;
  gl_Position = projectionMatrix * mvPosition;`);
    };
    const hull = new THREE.SkinnedMesh(geometry, mat);
    hull.bind(mesh.skeleton, mesh.bindMatrix);
    hull.position.copy(mesh.position); hull.quaternion.copy(mesh.quaternion); hull.scale.copy(mesh.scale);
    hull.frustumCulled = false;
    return hull;
  }

  /**
   * One swimmer. `o` = { body:'male'|'female', kit, accent, skin, hair, style } plus
   * what they wear (lookFor): { cap, gloves, gear, gearColour, crest, crestColour }.
   * `style` is a STYLES name or object; without one, the style set by setStyle().
   * Returns { group, play(name, fade), update(dt) }. `group` faces +Z.
   */
  function makeSwimmer(o) {
    const st = typeof o.style === 'object' ? o.style : STYLES[o.style] || style;
    const root = THREE.SkeletonUtils.clone(bodies[o.body || 'male']);
    const meshes = [];
    root.traverse(n => { if (n.isSkinnedMesh) meshes.push(n); });
    meshes.forEach(mesh => {
      mesh.geometry = mesh.geometry.clone();         // each swimmer owns its colours and shape
      sculpt(mesh, st);
    });
    const glows = [];
    const glowHull = (mesh, geometry) => { const h = outlineFor(mesh, st, geometry, GLOW_PX, glowFor(o)); h.visible = false; glows.push(h); return h; };
    const body = meshes.find(n => n.geometry.attributes.position.count > 3000);
    const eyes = meshes.find(n => n.material.name === 'MI_Eyes');
    const hf = headFrame(body, eyes);
    meshes.slice().forEach(mesh => {
      if (mesh === body) paint(mesh, o, hf);
      else if (mesh === eyes || mesh.name === 'Eyebrows') paintSolid(mesh.geometry, mesh === eyes ? INK : (o.hair || 0x3a2a1c));
      else if (o.cap) { mesh.parent.remove(mesh); meshes.splice(meshes.indexOf(mesh), 1); return; }   // hair, under the cap
      else paintSolid(mesh.geometry, o.hair || 0x3a2a1c);
      mesh.material = toonMaterial();
      mesh.frustumCulled = false;                    // skinned bounds are the bind pose, not the pose
      if (mesh === body) mesh.parent.add(outlineFor(mesh, st), glowHull(mesh));
    });
    // One skeleton per swimmer. The clone gives the eyes and brows a copy each of the body's,
    // and every copy is posed and uploaded to the GPU every frame (36 for 12 swimmers, not 12).
    meshes.forEach(mesh => {
      const a = mesh.skeleton, b = body.skeleton;
      if (a === b || a.bones.length !== b.bones.length || a.bones.some((bn, i) => bn !== b.bones[i]) ||
        a.boneInverses.some((m, i) => !m.equals(b.boneInverses[i]))) return;
      a.dispose(); mesh.bind(b, mesh.bindMatrix);
    });
    const gearGeo = buildGear(body, hf, o);
    if (gearGeo) {
      const gear = new THREE.SkinnedMesh(gearGeo, toonMaterial());
      gear.position.copy(body.position); gear.quaternion.copy(body.quaternion); gear.scale.copy(body.scale);
      body.parent.add(gear);
      gear.bind(body.skeleton, body.bindMatrix);
      gear.frustumCulled = false;
      const smooth = smoothNormals(gearGeo);
      body.parent.add(outlineFor(gear, st, smooth), glowHull(gear, smooth));
      meshes.push(gear);
    }
    const group = new THREE.Group();
    // The body sits in a pivot so a move can lean or dive the whole swimmer (moves.js).
    const tilt = new THREE.Group();
    group.add(tilt); tilt.add(root);
    const mixer = new THREE.AnimationMixer(root);
    let current = null, lock = 0;
    function play(name, fade = 0.25) {
      const clip = clips[name];
      if (!clip) return;
      const next = mixer.clipAction(clip);
      if (next === current) return;
      next.reset().setLoop(THREE.LoopRepeat, Infinity).setEffectiveWeight(1).fadeIn(fade).play();
      if (current) current.fadeOut(fade);
      current = next;
    }
    /** A move played once (a throw, a tackle); `busy` stays true until it has mostly played. */
    function once(name, fade = 0.12) {
      const clip = clips[name];
      if (!clip) return;
      const next = mixer.clipAction(clip);
      next.reset().setLoop(THREE.LoopOnce, 1);
      next.clampWhenFinished = true;
      next.setEffectiveWeight(1).fadeIn(fade).play();
      if (current && current !== next) current.fadeOut(fade);
      current = next;
      lock = clip.duration * 0.85;
    }
    // Named bones, so the ball can sit in the hands and a badge over the head
    // whatever pose the body is in (a swimmer is mostly horizontal, not upright).
    const bones = SS.rig.bonesOf(root);
    const frame = { forward: new THREE.Vector3(), right: new THREE.Vector3(), belly: new THREE.Vector3(), chest: new THREE.Vector3() };
    const ballPoint = new THREE.Vector3(), handAt = new THREE.Vector3(), elbowPole = new THREE.Vector3(), shoulder = new THREE.Vector3();
    let carrying = false;

    /* The carry: the clip keeps swimming the legs, hips and left arm; the right arm
       is re-posed every frame to cradle the ball against the belly, hand wrapped
       round the outside of it, elbow tucked out and back like a rugby carry. */
    function holdBall() {
      group.updateMatrixWorld(true);
      SS.rig.bodyFrame(bones, frame);
      ballPoint.copy(frame.chest).addScaledVector(frame.belly, 0.3).addScaledVector(frame.forward, -0.1).addScaledVector(frame.right, 0.08);
      handAt.copy(ballPoint).addScaledVector(frame.right, 0.17).addScaledVector(frame.belly, 0.05);
      bones.upperR.getWorldPosition(shoulder);
      elbowPole.copy(shoulder).addScaledVector(frame.right, 0.5).addScaledVector(frame.forward, -0.35);
      SS.rig.twoBone(bones.upperR, bones.lowerR, bones.handR, handAt, elbowPole);
    }

    /* See-through, for a swimmer in the camera's way: the body fades, the ink outline
       goes (a ghost with a hard outline reads as a solid body), and at nothing the whole
       swimmer is hidden. */
    let opacity = 1;
    function setOpacity(a) {
      if (a === opacity) return;
      opacity = a;
      const solid = a >= 0.99;
      root.traverse(n => {
        if (!n.isSkinnedMesh) return;
        if (!meshes.includes(n)) { n.visible = solid && !glows.includes(n); return; }
        if (n.material.transparent === solid) { n.material.transparent = !solid; n.material.needsUpdate = true; }
        n.material.opacity = solid ? 1 : a;
        n.material.depthWrite = solid;
      });
      group.visible = a > 0.02;
    }

    /* A move (moves.js): a throw, a save, a block, re-posed over the clip every frame.
       The lean pivots at the pelvis; with no move the body eases back to the clip's. */
    let move = null;
    const _tq = new THREE.Quaternion(), _tp = new THREE.Vector3(), _rest = new THREE.Quaternion();
    /* The turn is about the pelvis where the clip has it this frame. (It was the bind
       pose's pelvis, 1.3 m higher than the clips hold it, so every lean also slid the body:
       a keeper's full dive slid back into the post. Bryan's round-3 fix, 2026-10-03.) */
    const _lp = new THREE.Vector3();
    function setTilt(q, shift) {
      const pv = tilt.worldToLocal(bones.pelvis.getWorldPosition(_lp));
      tilt.quaternion.copy(q);
      _tp.copy(pv).applyQuaternion(q);
      tilt.position.copy(pv).sub(_tp).add(shift);
      tilt.updateMatrixWorld(true);
    }
    function settle(dt) {
      if (tilt.position.lengthSq() < 1e-8 && tilt.quaternion.equals(_rest)) return;
      const k = 1 - Math.exp(-dt * 6);
      _tq.copy(tilt.quaternion).slerp(_rest, k);
      tilt.quaternion.copy(_tq); tilt.position.multiplyScalar(1 - k);
      if (tilt.position.lengthSq() < 1e-6 && 1 - Math.abs(tilt.quaternion.w) < 1e-6) { tilt.position.set(0, 0, 0); tilt.quaternion.identity(); }
    }
    function setMove(name, opts) { move = name ? { name, t: 0, opts: opts || {} } : null; }

    function update(dt) {
      mixer.update(dt);
      if (lock > 0) lock -= dt;
      if (!move) settle(dt);
      // Fresh world matrices only for what reads them now (a move; the carry makes its own);
      // the renderer updates everything once before it draws.
      if (move) group.updateMatrixWorld(true);
      if (carrying) holdBall();
      if (move) { move.t += dt; if (SS.moves.apply(api, move)) move = null; }
    }
    /** Free the GPU copies this swimmer owns (its painted geometry and materials). */
    function dispose() {
      mixer.stopAllAction();
      root.traverse(n => {
        if (!n.isSkinnedMesh) return;
        n.geometry.dispose();                                // an outline may share its body's: disposing twice is harmless
        if (n.material) { inkMats.delete(n.material); n.material.dispose(); }
      });
    }
    const api = { group, root, play, once, update, dispose, setOpacity, mixer, bones, frame, ballPoint,
      head: bones.head, chest: bones.chest, handL: bones.handL, handR: bones.handR, pelvis: bones.pelvis,
      setCarry(on) { carrying = on; }, get carrying() { return carrying; }, get busy() { return lock > 0; },
      setMove, setTilt, get move() { return move; }, faceTarget: null,
      /** The ball carrier's glow: a band of light round the ink outline. */
      setGlow(on) { glows.forEach(h => { h.visible = on && opacity >= 0.99; }); } };
    return api;
  }

  /* ── team look ────────────────────────────────────────────────────────────
     Every player wears the team's colours in a full suit and a cap in the main colour.
     Gear says the role by shape: defenders and the midfielder shoulder pads, forwards
     fin blades on the forearms, the keeper big bright gloves and a keeper cap. The
     keeper wears the team's colours (swapping them made keepers look like the other
     team). The red keeper cap is water polo's own rule; white gloves beat red ones (red
     sat too close to the Monarchs' pink). */
  const KEEPER_CAP = 0xe8322e, KEEPER_GLOVES = 0xffffff;
  const CREST_SIZE = 1.05;           // the team ornament on the cap, x its drawn size (Bryan: 1.4 was too big, 2026-10-02)
  function lookFor(kit, pos) {
    const keeper = pos === 'GL';
    return {
      kit: kit.kit, accent: kit.accent,
      cap: keeper ? KEEPER_CAP : kit.kit,
      gloves: keeper ? KEEPER_GLOVES : null,
      gear: keeper ? null : pos === 'LF' || pos === 'RF' ? 'fins' : 'pad', gearColour: kit.kit,
      crest: kit.badge, crestColour: kit.accent, crestSize: CREST_SIZE,
    };
  }

  /** The two sides' match colours: in a listed clash (SS.DATA.CLASHES) the named team
      wears its away kit, whichever side it is on. */
  function matchKits(a, b) {
    const changes = (x, y) => SS.DATA.CLASHES.some(([c, o]) => c === x.id && o === y.id);
    const dress = (t, o) => (changes(t, o) && t.alt ? Object.assign({}, t, t.alt) : t);
    return [dress(a, b), dress(b, a)];
  }

  /** The style every new swimmer gets (for captures; the next buildScene uses it). */
  function setStyle(name) { style = STYLES[name] || STYLES.chunky; }

  return { load, makeSwimmer, setStyle, STYLES, lookFor, matchKits, get clipNames() { return Object.keys(clips); } };
})();
