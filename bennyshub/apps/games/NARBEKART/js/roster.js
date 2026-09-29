/**
 * NARBE Racer — the roster: twelve original animal racers and four karts.
 *
 * The first half is data the menus, the race and the CPUs read (CHARACTERS,
 * VEHICLES, statsFor). The second half builds a racer model entirely from
 * primitives — no model or texture files.
 *
 * Why the models are built the way they are:
 *   - The chase camera sees racers from BEHIND and a little above, so every
 *     animal's tell sits where that camera looks: tall ears, a crest, back
 *     spikes, an antenna, a scarf streaming out, a tail swept out to one side
 *     (never straight up the middle, where it would hide the head). Faces
 *     are for the menus, the podium and the 3/4 views.
 *   - Chibi proportions. The head is ~45 % of the racer's height because a
 *     big head is what a low-vision player recognises first. Seat backs stop
 *     at the shoulder blades so the driver's back and arms show too.
 *   - Draw calls, not triangles, are what hurt on a Surface Pro. Every part
 *     is painted with a vertex colour and welded, so a whole chassis is ONE
 *     mesh and a whole driver is ONE mesh on the shared toon vertex-colour
 *     material. The ink outline is baked into that same mesh as an inverted
 *     hull with flipped winding (see bakedInk), so it costs no extra call.
 *     A Classic Race Car racer is 6 draw calls: chassis, driver, four wheels.
 *     Parts the camera never sees (floor pans, legs inside a cockpit) skip
 *     the outline to keep the triangle count down.
 *   - Moving parts stay separate nodes: the body (bob / squash), the driver
 *     (lean / bounce / celebrate), each wheel (spin about local X) and the
 *     front-wheel pivots (steering yaw).
 *
 * Body space for every builder: origin at the road contact centre, -Z is
 * forward, +Y up, metres. A racer is ~2.8 m nose to tail (NK.C.KART_LEN).
 */
NK.roster = (function () {
  'use strict';

  const A = NK.art;
  const U = NK.util;
  const TAU = Math.PI * 2;

  /* ══ Characters ═════════════════════════════════════════════════════════
   * Stats are 1..5. Light racers get up to speed and change lanes quickly but
   * top out lower and get pushed around; heavy racers are the reverse. Every
   * character's stats add up to 13, so no pick is simply better than another.
   * Colours are CSS strings, like themes.js: they work as canvas / DOM styles
   * and as THREE.Color inputs alike. Blurbs are spoken in the menus.
   */
  const CHARACTERS = [
    {
      id: 'pip', name: 'Pip', animal: 'bunny', weight: 'light',
      stats: { speed: 2, accel: 5, handling: 4, weight: 2 },
      colors: { primary: '#f7f3ee', secondary: '#ff9dbd', accent: '#2fa8ff', kart: '#ff5c9d' },
      blurb: 'Pip bursts off the start line and hops from lane to lane in a flash.',
      emoji: '🐰'
    },
    {
      id: 'mochi', name: 'Mochi', animal: 'kitten', weight: 'light',
      stats: { speed: 2, accel: 4, handling: 5, weight: 2 },
      colors: { primary: '#a3a8bc', secondary: '#fbf6ef', accent: '#ffc41a', kart: '#7f55f0' },
      blurb: 'Mochi is light on her paws and the sharpest steerer on the grid.',
      emoji: '🐱'
    },
    {
      id: 'sunny', name: 'Sunny', animal: 'chick', weight: 'light',
      stats: { speed: 3, accel: 5, handling: 4, weight: 1 },
      colors: { primary: '#ffd22e', secondary: '#ff8c1a', accent: '#2fa8ff', kart: '#e8392d' },
      blurb: 'Sunny is the smallest racer of all, but the fastest of the little ones.',
      emoji: '🐤'
    },
    {
      id: 'pixel', name: 'Pixel', animal: 'mouse', weight: 'light',
      stats: { speed: 2, accel: 5, handling: 5, weight: 1 },
      colors: { primary: '#c49c7c', secondary: '#ffa3c0', accent: '#a4d620', kart: '#14b3a6' },
      blurb: 'Pixel is the nimblest racer around and zips through the tiniest gaps.',
      emoji: '🐭'
    },
    {
      id: 'rusty', name: 'Rusty', animal: 'fox', weight: 'medium',
      stats: { speed: 3, accel: 3, handling: 4, weight: 3 },
      colors: { primary: '#f26d1f', secondary: '#fff2de', accent: '#ffc41a', kart: '#2f63e3' },
      blurb: 'Rusty is a clever all-rounder who always finds the inside line.',
      emoji: '🦊'
    },
    {
      id: 'biscuit', name: 'Biscuit', animal: 'puppy', weight: 'medium',
      stats: { speed: 3, accel: 4, handling: 3, weight: 3 },
      colors: { primary: '#e3a862', secondary: '#fbe6c4', accent: '#e8392d', kart: '#35adff' },
      blurb: 'Biscuit is eager and steady, and bounces back quickly after a bump.',
      emoji: '🐶'
    },
    {
      id: 'waddles', name: 'Waddles', animal: 'penguin', weight: 'medium',
      stats: { speed: 4, accel: 3, handling: 3, weight: 3 },
      colors: { primary: '#34457a', secondary: '#fafaf5', accent: '#e8392d', kart: '#ffc41a' },
      blurb: 'Waddles slides along like the road is made of ice and keeps his speed up.',
      emoji: '🐧'
    },
    {
      id: 'hopper', name: 'Hopper', animal: 'frog', weight: 'medium',
      stats: { speed: 3, accel: 4, handling: 4, weight: 2 },
      colors: { primary: '#5cc83b', secondary: '#eef6a8', accent: '#2f63e3', kart: '#ff7d14' },
      blurb: 'Hopper is a lively all-rounder who springs off the start line.',
      emoji: '🐸'
    },
    {
      id: 'bruno', name: 'Bruno', animal: 'bear', weight: 'heavy',
      stats: { speed: 4, accel: 2, handling: 2, weight: 5 },
      colors: { primary: '#8e5a35', secondary: '#dcb58a', accent: '#e8392d', kart: '#27a94f' },
      blurb: 'Bruno is big and strong, and nudges other vehicles right out of his way.',
      emoji: '🐻'
    },
    {
      id: 'bolt', name: 'Bolt', animal: 'robot', weight: 'heavy',
      stats: { speed: 5, accel: 2, handling: 2, weight: 4 },
      colors: { primary: '#7f97bd', secondary: '#19d3ff', accent: '#ffc41a', kart: '#eef2f6' },
      blurb: 'Bolt runs on pure power and has one of the highest top speeds around.',
      emoji: '🤖'
    },
    {
      id: 'rex', name: 'Rex', animal: 'dinosaur', weight: 'heavy',
      stats: { speed: 5, accel: 1, handling: 2, weight: 5 },
      colors: { primary: '#26b39e', secondary: '#f5ecc6', accent: '#ff7d14', kart: '#d13cc8' },
      blurb: 'Rex takes a moment to get rolling, but at full speed nothing stops him.',
      emoji: '🦖'
    },
    {
      id: 'hattie', name: 'Hattie', animal: 'hippo', weight: 'heavy',
      stats: { speed: 4, accel: 2, handling: 3, weight: 4 },
      colors: { primary: '#b39ae6', secondary: '#ffb3cf', accent: '#ff5c9d', kart: '#a4d620' },
      blurb: 'Hattie is heavy and stylish, and steers better than you might expect.',
      emoji: '🦛'
    }
  ];

  /* ══ Vehicles ═══════════════════════════════════════════════════════════
   * Mods shift a character's stats by up to one point either way and always
   * sum to zero: each kart is a trade, never an upgrade.
   */
  const VEHICLES = [
    {
      id: 'kart', name: 'Classic Race Car', emoji: '🏎️',
      blurb: 'The Classic Race Car is balanced and dependable, and good at everything.',
      mods: { speed: 0, accel: 0, handling: 0, weight: 0 }
    },
    {
      id: 'bike', name: 'Zoom Bike', emoji: '🏍️',
      blurb: 'The Zoom Bike steers quicker than anything, but it is easier to push around.',
      mods: { speed: 0, accel: 0, handling: 1, weight: -1 }
    },
    {
      id: 'buggy', name: 'Monster Buggy', emoji: '🚙',
      blurb: 'The Monster Buggy shoves others aside, but takes longer to get going.',
      mods: { speed: 0, accel: -1, handling: 0, weight: 1 }
    },
    {
      id: 'hover', name: 'Hover Vehicle', emoji: '🛸',
      blurb: 'The Hover Vehicle floats on glowing pads, a little faster but slower to steer.',
      mods: { speed: 1, accel: 0, handling: -1, weight: 0 }
    }
  ];

  function find(list, id) {
    for (let i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  /** Unknown ids fall back to the first entry, so a stale save never breaks a build. */
  function character(id) { return find(CHARACTERS, id) || CHARACTERS[0]; }
  function vehicle(id) { return find(VEHICLES, id) || VEHICLES[0]; }

  /* ── Stats → driving numbers ─────────────────────────────────────────────
   * A stat (1..5) plus a kart mod (-1..+1) gives 0..6, with 3 as the balanced
   * middle. Each number bends through its middle value, so a medium racer on
   * the Classic Race Car is exactly the class baseline and only the extremes
   * (a 5 on a kart that adds 1) reach the ends of the ranges.
   */
  const CURVES = {
    speedMul:    [0.97, 1.00, 1.05],
    accelRate:   [1.10, 1.55, 2.00],   // damp lambda toward vTarget (1/s)
    handlingMul: [1.10, 1.00, 0.90],   // lane-time multiplier: LOWER steers faster
    weight:      [0.70, 1.00, 1.40]    // contact push share
  };
  function bend(v, c) {
    const x = U.clamp(v, 0, 6);
    return x <= 3 ? U.lerp(c[0], c[1], x / 3) : U.lerp(c[1], c[2], (x - 3) / 3);
  }
  const r3 = (x) => Math.round(x * 1000) / 1000;

  function statsFor(charId, vehicleId) {
    const s = character(charId).stats, m = vehicle(vehicleId).mods;
    return {
      speedMul: r3(bend(s.speed + m.speed, CURVES.speedMul)),
      accelRate: r3(bend(s.accel + m.accel, CURVES.accelRate)),
      handlingMul: r3(bend(s.handling + m.handling, CURVES.handlingMul)),
      weight: r3(bend(s.weight + m.weight, CURVES.weight))
    };
  }

  /** Menu stat bars for a pairing, 0..1 each (0.5 = balanced; higher = more of it). */
  function bars(charId, vehicleId) {
    const s = character(charId).stats, m = vehicle(vehicleId).mods;
    const f = (v) => r3(U.clamp(v, 0, 6) / 6);
    return {
      speed: f(s.speed + m.speed), accel: f(s.accel + m.accel),
      handling: f(s.handling + m.handling), weight: f(s.weight + m.weight)
    };
  }

  /* ══ Hardware palette ═══════════════════════════════════════════════════
   * Colours that are the same on every racer. Charcoal trim is lighter than
   * ink on purpose, so a dark bumper still shows its shape inside its outline.
   */
  const INK = A.INK;
  const TRIM = 0x3a3847;       // frames, bumpers, seats
  const METAL = 0x9aa4b6;      // engine blocks
  const PIPE = 0xaab3c2;       // exhausts: steel, darker than white so they never read as trim
  const CHROME = 0xd3d9e2;     // forks, springs
  const TIRE = 0x2f2d39;
  const TREAD = 0x45434f;
  const RIM = 0xf1f1ec;
  const WHITE = 0xfbfaf6;
  const GLASS = 0x9fd8f7;      // goggle lenses
  const SCREEN = 0x4f9fd8;     // windscreens: deeper tint, reads as glass at a distance
  const LAMP = 0xfff0a0;       // headlamps (bright paint, not emissive: stays one draw call)
  const TAIL_LAMP = 0xff3b30;
  const EYE = 0x1d1b2e;
  const BLUSH = 0xff8fa8;
  const PAD_GLOW = 0x0a86d8;   // hover pads: a deep cyan, so the emissive never blows out to white
  const INK_T = 0.03;          // baked outline thickness (m)

  /* ══ Geometry kit ═══════════════════════════════════════════════════════ */

  const X_AXIS = new THREE.Vector3(1, 0, 0);
  const Y_AXIS = new THREE.Vector3(0, 1, 0);
  const Z_AXIS = new THREE.Vector3(0, 0, 1);
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const vec = (a) => (a.isVector3 ? a.clone() : new THREE.Vector3(a[0], a[1], a[2]));

  /** Ellipsoid. */
  function ell(rx, ry, rz, ws, hs) {
    return new THREE.SphereGeometry(1, ws || 12, hs || 8).scale(rx, ry, rz);
  }

  /**
   * Rounded box with analytic normals, so toon bands stay clean across the
   * corners. A (2m+1)-segment box is remapped so the outer m segments on
   * each axis sweep the corner arc in equal angles, then every vertex is
   * projected onto the rounded shape: inner box + unit offset × r.
   */
  function rbox(w, h, d, r, m) {
    if (!(r > 0)) return new THREE.BoxGeometry(w, h, d);
    m = m || 2;
    const s = 2 * m + 1;
    const g = new THREE.BoxGeometry(2, 2, 2, s, s, s);
    const half = [w / 2, h / 2, d / 2];
    r = Math.min(r, half[0], half[1], half[2]);
    const inner = [half[0] - r, half[1] - r, half[2] - r];
    const P = g.attributes.position.array, N = g.attributes.normal.array;
    const q = [0, 0, 0], c = [0, 0, 0];
    for (let i = 0; i < P.length; i += 3) {
      for (let a = 0; a < 3; a++) {
        const idx = Math.round((P[i + a] + 1) * s / 2);          // grid index 0..s
        const neg = idx <= m;
        const band = neg ? (m - idx) / m : (idx - (s - m)) / m;  // 0 = start of arc, 1 = face
        q[a] = (neg ? -1 : 1) * (inner[a] + r * Math.tan(band * Math.PI / 4));
        c[a] = U.clamp(q[a], -inner[a], inner[a]);
      }
      let dx = q[0] - c[0], dy = q[1] - c[1], dz = q[2] - c[2];
      const l = Math.hypot(dx, dy, dz) || 1;
      dx /= l; dy /= l; dz /= l;
      P[i] = c[0] + dx * r; P[i + 1] = c[1] + dy * r; P[i + 2] = c[2] + dz * r;
      N[i] = dx; N[i + 1] = dy; N[i + 2] = dz;
    }
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }

  /**
   * Narrow a geometry toward its front (-Z) end: there its x/y extent is
   * multiplied by fx/fy, easing linearly back to 1 at the rear. y scales about
   * the bottom when pivot is 'bottom' (keeps a flat floor), else the centre.
   * Normals go through the warp's inverse-transpose so the shading stays true.
   */
  function taper(geo, fx, fy, pivot) {
    geo.computeBoundingBox();
    const bb = geo.boundingBox;
    const z0 = bb.min.z, dz = (bb.max.z - bb.min.z) || 1;
    const py = pivot === 'bottom' ? bb.min.y : 0;
    const dsx = (1 - fx) / dz, dsy = (1 - fy) / dz;
    const P = geo.attributes.position.array, N = geo.attributes.normal.array;
    for (let i = 0; i < P.length; i += 3) {
      const x = P[i], y = P[i + 1] - py, t = (P[i + 2] - z0) / dz;
      const sx = fx + (1 - fx) * t, sy = fy + (1 - fy) * t;
      P[i] = x * sx;
      P[i + 1] = py + y * sy;
      const nx = N[i] / sx, ny = N[i + 1] / sy;
      const nz = N[i + 2] - (x * dsx * N[i]) / sx - (y * dsy * N[i + 1]) / sy;
      const l = Math.hypot(nx, ny, nz) || 1;
      N[i] = nx / l; N[i + 1] = ny / l; N[i + 2] = nz / l;
    }
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    return geo;
  }

  /** Tapered tube along a smooth curve through `pts` (tails, pipes). */
  function tube(pts, r0, r1, segs, radial) {
    const curve = new THREE.CatmullRomCurve3(pts.map(vec));
    const g = new THREE.TubeGeometry(curve, segs, 1, radial, false);
    // TubeGeometry builds ring i around curve.getPointAt(i / segs) at radius 1;
    // rescale each ring about its centre for the taper.
    const P = g.attributes.position.array;
    const per = radial + 1;
    const c = new THREE.Vector3();
    for (let i = 0; i <= segs; i++) {
      curve.getPointAt(i / segs, c);
      const r = U.lerp(r0, r1, i / segs);
      for (let j = 0; j < per; j++) {
        const k = (i * per + j) * 3;
        P[k] = c.x + (P[k] - c.x) * r;
        P[k + 1] = c.y + (P[k + 1] - c.y) * r;
        P[k + 2] = c.z + (P[k + 2] - c.z) * r;
      }
    }
    g.computeBoundingSphere();
    return { geo: g, end: curve.getPointAt(1), tangent: curve.getTangentAt(1) };
  }

  /** Point on a sphere of radius R (head space): yaw from the front toward +X, pitch up. */
  function sph(R, yaw, pitch) {
    const cp = Math.cos(pitch);
    return V(Math.sin(yaw) * cp * R, Math.sin(pitch) * R, -Math.cos(yaw) * cp * R);
  }

  /**
   * Quaternion that lays a part's local Z along `n` while keeping its local Y
   * as close to world up as possible — eyes, lenses and discs stay upright on
   * a curved face instead of spinning to wherever the shortest arc lands.
   */
  const _basis = new THREE.Matrix4();
  function surfaceQ(n) {
    const z = n.clone().normalize();
    const x = new THREE.Vector3().crossVectors(Y_AXIS, z);
    if (x.lengthSq() < 1e-6) x.copy(X_AXIS); else x.normalize();
    const y = new THREE.Vector3().crossVectors(z, x);
    return new THREE.Quaternion().setFromRotationMatrix(_basis.makeBasis(x, y, z));
  }

  function place(o, at, rot, q) {
    if (at) { if (at.isVector3) o.position.copy(at); else o.position.set(at[0], at[1], at[2]); }
    if (q) o.quaternion.copy(q);
    else if (rot) o.rotation.set(rot[0], rot[1], rot[2]);
  }

  /** Relative luminance of a colour (0..1), to keep hubs from vanishing on pale karts. */
  const _lc = new THREE.Color();
  function luma(hex) {
    _lc.set(A.norm(hex));
    return 0.2126 * _lc.r + 0.7152 * _lc.g + 0.0722 * _lc.b;
  }

  /* ── Baked ink ───────────────────────────────────────────────────────────
   * NK.art.outline() builds an inverted hull drawn with a back-face ink
   * material — a second draw call per object. Flipping the hull's triangle
   * winding makes its inside faces the FRONT faces, so the same silhouette
   * shell renders on the ordinary front-side toon material, painted ink, and
   * welds into the part's own mesh. Same look, zero extra draw calls. The
   * shell keeps its outward normals, which face away from the camera where
   * the rim shows, so it stays as dark as the kit's unlit ink.
   */
  let _host = null;
  function bakedInk(geo, t) {
    if (!_host) _host = new THREE.Mesh();
    _host.geometry = geo;
    const shell = A.outline(_host, t);      // reuse the kit's watertight shell maths
    _host.remove(shell);
    _host.geometry = null;
    const g = shell.geometry;
    const p = g.attributes.position.array, n = g.attributes.normal.array;
    for (let i = 0; i < p.length; i += 9) {  // swap vertices 1 and 2 of every triangle
      for (let k = 3; k < 6; k++) {
        let tmp = p[i + k]; p[i + k] = p[i + k + 3]; p[i + k + 3] = tmp;
        tmp = n[i + k]; n[i + k] = n[i + k + 3]; n[i + k + 3] = tmp;
      }
    }
    return A.paint(g, INK);
  }

  /**
   * A kit collects painted parts (and their baked shells) under a scratch
   * root, then welds them into one mesh on the shared toon vertex-colour
   * material. Parts can be added inside sub-groups (a leaning spine, a tilted
   * head): the weld flattens every transform.
   */
  function makeKit(ink) {
    const root = new THREE.Group();
    const kit = {
      root,
      /** A transform to build inside (at / rot relative to parent, default root). */
      group(at, rot, parent) {
        const g = new THREE.Group();
        place(g, at, rot);
        (parent || root).add(g);
        return g;
      },
      /** Paint one part and place it. o: { at, rot, q, parent, ink (0 = none) }. */
      add(geo, color, o) {
        o = o || {};
        A.paint(geo, color);
        const m = new THREE.Mesh(geo, A.mat.toonV());
        place(m, o.at, o.rot, o.q);
        const parent = o.parent || root;
        parent.add(m);
        const t = o.ink === undefined ? ink : o.ink;
        if (t > 0) {
          const s = new THREE.Mesh(bakedInk(geo, t), A.mat.toonV());
          s.position.copy(m.position);
          s.quaternion.copy(m.quaternion);
          parent.add(s);
        }
        return m;
      },
      /** A capsule (or, with o.flat, a cylinder) spanning points a → b. */
      bar(a, b, r, color, o) {
        const p = vec(a), d = vec(b).sub(p);
        const len = d.length();
        const radial = (o && o.radial) || 6;
        const geo = (o && o.flat) ? new THREE.CylinderGeometry(r, r, len, radial)
          : new THREE.CapsuleGeometry(r, len, (o && o.cap) || 2, radial);
        const q = new THREE.Quaternion().setFromUnitVectors(Y_AXIS, d.clone().normalize());
        return kit.add(geo, color, Object.assign({}, o, { at: p.addScaledVector(d, 0.5), q }));
      },
      /** A point given in `g`'s space, expressed in the kit root's space. */
      toRoot(g, p) {
        g.updateWorldMatrix(true, false);
        return g.localToWorld(vec(p));
      },
      weld(name) {
        const merged = A.mergeByMaterial(root);
        const mesh = merged.children[0];
        if (merged.children.length !== 1) console.warn('NK.roster: ' + name + ' welded into ' + merged.children.length + ' meshes');
        merged.remove(mesh);
        mesh.name = name || '';
        return mesh;
      }
    };
    return kit;
  }

  /* ══ Wheels ═════════════════════════════════════════════════════════════
   * Each wheel is ONE vertex-coloured mesh (tyre, rim, hub, spokes) with its
   * axle along local X, so the game spins it with rotation.x. Geometry is
   * cached per size / style / colour / side and shared by every matching
   * wheel. Spokes go on the outer face only (side = sign of the wheel's x;
   * 0 for a bike wheel, which shows both faces). w.r is the CONTACT radius:
   * the wheel centre sits at y = w.r.
   */
  const wheelCache = new Map();
  function wheelGeometry(w, hubColor, side) {
    const key = w.style + '|' + w.r + '|' + w.w + '|' + hubColor + '|' + side;
    const hit = wheelCache.get(key);
    if (hit) return hit;
    const K = makeKit(0);
    const knobbly = w.style === 'knobbly';
    // Knobbly tread blocks stand proud of a slightly smaller tyre, up to exactly w.r.
    const r = knobbly ? w.r - 0.055 : w.r, hw = w.w / 2;
    const ri = r * (knobbly ? 0.56 : 0.62);
    const cr = Math.min(hw * 0.55, r * 0.3);
    // Tyre: a rounded-shoulder profile revolved around the axle.
    const prof = [new THREE.Vector2(ri, -hw)];
    for (let i = 0; i <= 3; i++) {
      const a = -Math.PI / 2 + (i / 3) * (Math.PI / 2);
      prof.push(new THREE.Vector2(r - cr + Math.cos(a) * cr, -hw + cr + Math.sin(a) * cr));
    }
    for (let i = 0; i <= 3; i++) {
      const a = (i / 3) * (Math.PI / 2);
      prof.push(new THREE.Vector2(r - cr + Math.cos(a) * cr, hw - cr + Math.sin(a) * cr));
    }
    prof.push(new THREE.Vector2(ri, hw));
    K.add(new THREE.LatheGeometry(prof, 14).rotateZ(Math.PI / 2), TIRE);
    // Rim disc and hub cap.
    K.add(new THREE.CylinderGeometry(ri * 1.02, ri * 1.02, w.w * 0.8, 12).rotateZ(Math.PI / 2), RIM);
    K.add(new THREE.CylinderGeometry(ri * 0.36, ri * 0.36, w.w * 0.92, 8).rotateZ(Math.PI / 2), hubColor);
    // Five spokes in the hub colour: they make the spin readable.
    const faces = side ? [side] : [-1, 1];
    faces.forEach((f) => {
      for (let i = 0; i < 5; i++) {
        const len = ri * 0.62;
        const g = new THREE.BoxGeometry(0.03, len, ri * 0.24).translate(0, ri * 0.36 + len / 2, 0).rotateX((i / 5) * TAU);
        K.add(g, hubColor, { at: [f * w.w * 0.41, 0, 0] });
      }
    });
    if (knobbly) {
      // Two staggered rows of chunky tread blocks: the monster-truck read.
      const n = 10;
      for (let i = 0; i < n * 2; i++) {
        const row = i % 2 ? 1 : -1;
        const a = (Math.floor(i / 2) + (row > 0 ? 0.5 : 0)) / n * TAU;
        const g = new THREE.BoxGeometry(hw * 0.86, 0.09, r * 0.34).translate(0, r + 0.01, 0).rotateX(a);
        K.add(g, TREAD, { at: [row * hw * 0.46, 0, 0] });
      }
    }
    const geo = K.weld('wheel').geometry;
    wheelCache.set(key, geo);
    return geo;
  }

  /* ══ Vehicles ═══════════════════════════════════════════════════════════
   * Each builder returns the welded chassis plus the layout the rest of the
   * racer hangs off (all in body space):
   *   wheels     [{ x, z, r, w, steer, style }]
   *   seat       { hip, grips:[L, R], knees:[L, R], feet:[L, R], lean, showLegs }
   *   exhaust    pipe tips            rearContacts  where drift sparks leave the road
   *   gliderFoot where the glider's mast stands, behind the driver's head
   */

  /** Steering wheel on a column; returns the two grip points (10 and 2 o'clock). */
  function steeringWheel(K, base, centre, ringR, hubColor) {
    const c = vec(centre), axis = c.clone().sub(vec(base)).normalize();
    K.bar(base, centre, 0.03, TRIM, { flat: true, ink: 0.02 });
    const q = surfaceQ(axis);
    K.add(new THREE.TorusGeometry(ringR, 0.034, 5, 14), TRIM, { at: c, q, ink: 0.02 });
    K.add(new THREE.CylinderGeometry(ringR * 0.32, ringR * 0.32, 0.05, 8).rotateX(Math.PI / 2), hubColor, { at: c, q, ink: 0 });
    K.add(new THREE.BoxGeometry(ringR * 2, 0.03, 0.03), TRIM, { at: c, q, ink: 0 });
    return [-1, 1].map((s) => V(s * ringR * 0.9, ringR * 0.42, 0).applyQuaternion(q).add(c));
  }

  /** Steel pipe along a curve with a dark tip ring; returns the tip point. */
  function exhaustPipe(K, pts, r) {
    const t = tube(pts, r, r * 1.08, 6, 6);
    K.add(t.geo, PIPE, { ink: 0.02 });
    const q = new THREE.Quaternion().setFromUnitVectors(Y_AXIS, t.tangent);
    K.add(new THREE.CylinderGeometry(r * 1.3, r * 1.3, 0.06, 8), TRIM, { at: t.end, q, ink: 0 });
    return t.end.clone();
  }

  /* ── Classic Race Car: open go-kart, chunky nose, side pods, twin exhausts ─── */
  function kartChassis(c) {
    const K = makeKit(INK_T);
    const body = c.colors.kart, acc = c.colors.accent;

    K.add(rbox(1.1, 0.1, 2.3, 0.04, 1), TRIM, { at: [0, 0.2, 0.02], ink: 0 });               // floor pan
    // Nose fairing: a chunky wedge that narrows and drops toward the front.
    K.add(taper(rbox(1.2, 0.38, 0.86, 0.16, 2), 0.72, 0.6, 'bottom'), body, { at: [0, 0.37, -0.93] });
    // Number plate following the nose's downward slope, with an accent dot.
    K.add(rbox(0.46, 0.05, 0.28, 0.024, 1), WHITE, { at: [0, 0.53, -0.9], rot: [-0.18, 0, 0], ink: 0.018 });
    K.add(ell(0.08, 0.02, 0.07, 10, 4), acc, { at: [0, 0.557, -0.9], rot: [-0.18, 0, 0], ink: 0 });
    K.bar([-0.6, 0.23, -1.33], [0.6, 0.23, -1.33], 0.07, TRIM, { radial: 8 });               // front bumper
    [-1, 1].forEach((s) => {
      K.bar([s * 0.6, 0.23, -1.33], [s * 0.66, 0.24, -1.1], 0.05, TRIM, { ink: 0 });
      K.add(rbox(0.3, 0.28, 0.9, 0.12, 2), body, { at: [s * 0.58, 0.33, -0.02] });           // side pod
      K.add(rbox(0.09, 0.04, 0.76, 0.02, 1), WHITE, { at: [s * 0.58, 0.47, -0.02], ink: 0 });
    });
    // Seat: dark, so the driver separates from the kart colour, and low
    // enough that the driver's shoulders show from the chase camera.
    K.add(rbox(0.58, 0.1, 0.46, 0.04, 1), TRIM, { at: [0, 0.3, 0.28], ink: 0 });
    K.add(rbox(0.62, 0.4, 0.12, 0.05, 1), TRIM, { at: [0, 0.52, 0.58], rot: [0.2, 0, 0] });
    // Engine block behind the seat, with fins and an air filter in the accent colour.
    K.add(rbox(0.56, 0.3, 0.36, 0.08, 1), METAL, { at: [0, 0.42, 0.97] });
    for (let i = -1; i <= 1; i++) K.add(new THREE.BoxGeometry(0.5, 0.05, 0.05), METAL, { at: [0, 0.6, 0.97 + i * 0.1], ink: 0 });
    K.add(new THREE.CylinderGeometry(0.1, 0.1, 0.14, 10).rotateZ(Math.PI / 2), acc, { at: [-0.37, 0.46, 0.92] });
    // Twin exhausts sweeping up over the rear bumper.
    const exhaust = [-1, 1].map((s) => exhaustPipe(K, [[s * 0.14, 0.42, 1.08], [s * 0.2, 0.47, 1.26], [s * 0.26, 0.64, 1.38]], 0.055));
    // Rear bumper in the kart colour: the biggest patch of colour the chase camera sees.
    K.add(rbox(1.86, 0.2, 0.18, 0.08, 2), body, { at: [0, 0.3, 1.3] });
    K.add(rbox(0.5, 0.14, 0.04, 0.03, 1), WHITE, { at: [0, 0.31, 1.395], ink: 0.015 });
    K.add(ell(0.05, 0.05, 0.02, 8, 6), acc, { at: [0, 0.31, 1.418], ink: 0 });
    [-1, 1].forEach((s) => K.bar([s * 0.45, 0.28, 1.2], [s * 0.45, 0.28, 1.05], 0.04, TRIM, { ink: 0 }));
    // Axles, peeking out between the wheels.
    K.bar([-0.72, 0.3, -0.92], [0.72, 0.3, -0.92], 0.035, TRIM, { flat: true, ink: 0 });
    K.bar([-0.7, 0.36, 0.84], [0.7, 0.36, 0.84], 0.045, TRIM, { flat: true, ink: 0 });

    const grips = steeringWheel(K, [0, 0.36, -0.62], [0, 0.8, -0.2], 0.16, acc);
    return {
      chassis: K.weld('chassis'),
      wheels: [
        { x: -0.86, z: -0.92, r: 0.3, w: 0.3, steer: true, style: 'kart' },
        { x: 0.86, z: -0.92, r: 0.3, w: 0.3, steer: true, style: 'kart' },
        { x: -0.88, z: 0.84, r: 0.36, w: 0.42, style: 'kart' },
        { x: 0.88, z: 0.84, r: 0.36, w: 0.42, style: 'kart' }
      ],
      seat: {
        hip: V(0, 0.4, 0.3), grips, lean: 0.08,
        knees: [V(-0.15, 0.5, -0.1), V(0.15, 0.5, -0.1)],
        feet: [V(-0.16, 0.3, -0.42), V(0.16, 0.3, -0.42)]
      },
      exhaust,
      rearContacts: [V(-0.88, 0, 0.84), V(0.88, 0, 0.84)],
      gliderFoot: V(0, 0.62, 0.86)                    // on the engine, clear of the head
    };
  }

  /* ── Zoom Bike: sporty motorbike ridden astride ───────────────────────── */
  function bikeChassis(c) {
    const K = makeKit(INK_T);
    const body = c.colors.kart;

    K.add(rbox(0.36, 0.34, 0.6, 0.08, 1), METAL, { at: [0, 0.5, 0.02] });                   // engine
    K.bar([0, 1.0, -0.64], [0, 0.78, 0.46], 0.06, TRIM, { ink: 0.02 });                      // spine
    K.add(ell(0.26, 0.2, 0.4, 14, 10), body, { at: [0, 0.86, -0.28] });                        // tank
    K.add(ell(0.08, 0.205, 0.34, 8, 8), WHITE, { at: [0, 0.865, -0.3], ink: 0 });             // tank stripe
    // Front cowl with headlamp and a tinted screen.
    K.add(taper(rbox(0.5, 0.42, 0.46, 0.15, 2), 0.72, 0.8), body, { at: [0, 0.96, -0.76] });
    K.add(ell(0.13, 0.11, 0.05, 10, 6), LAMP, { at: [0, 0.92, -1.0], ink: 0.015 });
    // Screen: a slab that narrows toward its top edge, stood up leaning back
    // toward the rider (its narrow -Z end becomes the top), with a glint.
    const screen = taper(rbox(0.44, 0.035, 0.3, 0.015, 1), 0.62, 1).rotateX(Math.PI / 2 + 0.55);
    K.add(screen, SCREEN, { at: [0, 1.2, -0.84], ink: 0.02 });
    K.add(rbox(0.05, 0.012, 0.18, 0.005, 1).rotateX(Math.PI / 2 + 0.55), WHITE, { at: [-0.1, 1.21, -0.86], ink: 0 });
    // Side fairings over the engine with a white race-number oval.
    [-1, 1].forEach((s) => {
      K.add(rbox(0.08, 0.32, 0.62, 0.04, 1), body, { at: [s * 0.2, 0.6, -0.26] });
      K.add(ell(0.02, 0.1, 0.13, 8, 6), WHITE, { at: [s * 0.245, 0.62, -0.26], ink: 0 });
    });
    // Fork (legs wide of the tyre so a steered wheel clears them) and
    // handlebars pulled back toward the rider, so chibi arms reach them.
    [-1, 1].forEach((s) => K.bar([s * 0.17, 1.1, -0.58], [s * 0.17, 0.4, -0.98], 0.035, CHROME, { ink: 0.018 }));
    K.bar([-0.2, 0.48, -0.98], [0.2, 0.48, -0.98], 0.025, CHROME, { ink: 0 });
    K.add(ell(0.2, 0.05, 0.22, 10, 6), body, { at: [0, 0.86, -0.98], ink: 0.02 });            // front mudguard
    K.bar([0, 1.1, -0.58], [0, 1.18, -0.46], 0.04, TRIM, { ink: 0 });
    K.bar([-0.3, 1.18, -0.44], [0.3, 1.18, -0.44], 0.028, TRIM, { ink: 0.02 });
    [-1, 1].forEach((s) => K.bar([s * 0.28, 1.18, -0.44], [s * 0.38, 1.18, -0.44], 0.045, TRIM, { ink: 0 }));
    // Seat, and a broad tail that rises to the rear: the bike's face from the
    // chase camera, so it carries the kart colour, a big tail lamp and a plate.
    K.add(rbox(0.3, 0.1, 0.62, 0.05, 1), TRIM, { at: [0, 0.86, 0.3] });
    K.add(taper(rbox(0.46, 0.26, 0.6, 0.11, 2), 0.66, 0.72), body, { at: [0, 1.0, 0.8], rot: [0, Math.PI, 0] });
    K.add(rbox(0.26, 0.08, 0.04, 0.025, 1), TAIL_LAMP, { at: [0, 1.02, 1.1], ink: 0.012 });
    K.add(rbox(0.26, 0.14, 0.03, 0.02, 1), WHITE, { at: [0, 0.8, 1.15], rot: [0.35, 0, 0], ink: 0.012 });
    K.add(ell(0.05, 0.05, 0.02, 8, 6), c.colors.accent, { at: [0, 0.8, 1.172], rot: [0.35, 0, 0], ink: 0 });
    K.bar([0, 0.92, 1.02], [0, 0.82, 1.13], 0.025, TRIM, { ink: 0 });                          // plate hanger
    K.add(ell(0.2, 0.06, 0.34, 10, 6), TRIM, { at: [0, 0.9, 0.96], ink: 0.015 });              // rear hugger
    // Swingarm to the rear axle.
    [-1, 1].forEach((s) => K.bar([s * 0.17, 0.44, 0.2], [s * 0.17, 0.42, 0.96], 0.035, TRIM, { ink: 0 }));
    K.bar([-0.2, 0.42, 0.96], [0.2, 0.42, 0.96], 0.03, CHROME, { flat: true, ink: 0 });
    // Twin pipes up the sides of the tail.
    const exhaust = [-1, 1].map((s) => exhaustPipe(K, [[s * 0.14, 0.38, 0.1], [s * 0.24, 0.42, 0.66], [s * 0.28, 0.6, 1.2]], 0.055));
    // Foot pegs.
    [-1, 1].forEach((s) => K.bar([s * 0.14, 0.44, 0.34], [s * 0.3, 0.44, 0.34], 0.022, CHROME, { ink: 0 }));

    return {
      chassis: K.weld('chassis'),
      wheels: [
        { x: 0, z: -0.98, r: 0.4, w: 0.22, steer: true, style: 'sport' },
        { x: 0, z: 0.96, r: 0.42, w: 0.34, style: 'sport' }
      ],
      // The bike's wheels ride on the body node, so they lean with it.
      wheelsOnBody: true,
      seat: {
        hip: V(0, 0.92, 0.22), lean: 0.3, showLegs: true,
        grips: [V(-0.33, 1.18, -0.44), V(0.33, 1.18, -0.44)],
        knees: [V(-0.26, 0.82, -0.2), V(0.26, 0.82, -0.2)],
        feet: [V(-0.26, 0.46, 0.34), V(0.26, 0.46, 0.34)]
      },
      exhaust,
      rearContacts: [V(0, 0, 0.96)],
      gliderFoot: V(0, 1.12, 0.74)                    // on top of the tail
    };
  }

  /* ── Monster Buggy: big knobbly wheels, raised tub, roll cage ─────────── */
  function buggyChassis(c) {
    const K = makeKit(INK_T);
    const body = c.colors.kart, acc = c.colors.accent;

    K.add(rbox(1.12, 0.42, 1.72, 0.16, 2), body, { at: [0, 0.82, 0.06] });                  // tub
    K.add(rbox(0.92, 0.12, 1.5, 0.05, 1), TRIM, { at: [0, 0.56, 0.06], ink: 0 });            // skid plate
    K.add(taper(rbox(1.02, 0.3, 0.64, 0.12, 2), 0.86, 0.7, 'bottom'), body, { at: [0, 1.0, -0.64] }); // hood
    K.add(rbox(0.3, 0.08, 0.4, 0.04, 1), TRIM, { at: [0, 1.16, -0.66], ink: 0.02 });         // hood scoop
    [-0.3, 0.3].forEach((x) => K.add(rbox(0.14, 0.02, 1.64, 0.01, 1), WHITE, { at: [x, 1.035, 0.12], ink: 0 })); // stripes
    // Push bar with two lamps.
    K.bar([-0.62, 0.64, -1.16], [0.62, 0.64, -1.16], 0.07, TRIM);
    [-1, 1].forEach((s) => K.bar([s * 0.4, 0.64, -1.16], [s * 0.4, 1.08, -1.08], 0.05, TRIM));
    K.bar([-0.44, 1.08, -1.08], [0.44, 1.08, -1.08], 0.05, TRIM);
    [-1, 1].forEach((s) => K.add(new THREE.CylinderGeometry(0.09, 0.09, 0.08, 10).rotateX(Math.PI / 2), LAMP, { at: [s * 0.2, 1.14, -1.1], ink: 0.02 }));
    // Mudguards: wide arcs over the top of each wheel, in the kart colour,
    // clear of the tread blocks even when a front wheel is steered.
    [[-0.9, -0.86, 0.52], [0.9, -0.86, 0.52], [-0.9, 0.84, 0.54], [0.9, 0.84, 0.54]].forEach((w) => {
      const g = new THREE.TorusGeometry(w[2] + 0.14, 0.07, 5, 10, 1.64).rotateZ(0.75).rotateY(Math.PI / 2).scale(3.4, 1, 1);
      K.add(g, body, { at: [w[0], w[2], w[1]] });
    });
    // Seat, steering and the engine on the rear deck with twin stacks.
    K.add(rbox(0.6, 0.12, 0.5, 0.05, 1), TRIM, { at: [0, 0.98, 0.28], ink: 0 });
    K.add(rbox(0.62, 0.44, 0.12, 0.05, 1), TRIM, { at: [0, 1.22, 0.58], rot: [0.2, 0, 0] });
    K.add(rbox(0.62, 0.3, 0.3, 0.08, 1), METAL, { at: [0, 1.18, 0.8] });
    const exhaust = [-1, 1].map((s) => exhaustPipe(K, [[s * 0.3, 1.1, 0.86], [s * 0.31, 1.26, 0.88], [s * 0.32, 1.46, 0.9]], 0.06));
    // Roll cage: a rear hoop at shoulder height (the head stays in view above
    // it from the chase camera) and side rails forward to the dash.
    [-1, 1].forEach((s) => {
      K.bar([s * 0.56, 1.02, 0.7], [s * 0.52, 1.66, 0.74], 0.05, TRIM);
      K.bar([s * 0.52, 1.08, -0.4], [s * 0.48, 1.5, -0.14], 0.05, TRIM);
      K.bar([s * 0.48, 1.5, -0.14], [s * 0.52, 1.66, 0.74], 0.05, TRIM);
    });
    K.bar([-0.52, 1.66, 0.74], [0.52, 1.66, 0.74], 0.05, TRIM);
    // Coil springs at the front, inboard of the tyres — they sell the
    // suspension from the 3/4 view.
    [-1, 1].forEach((s) => {
      const pts = [];
      for (let i = 0; i <= 24; i++) {
        const a = i / 24 * 5 * TAU;
        pts.push(V(s * (0.5 + i / 24 * 0.06) + Math.cos(a) * 0.06, 0.98 - i / 24 * 0.38, -0.86 + Math.sin(a) * 0.06));
      }
      K.add(tube(pts, 0.018, 0.018, 48, 4).geo, CHROME, { ink: 0 });
    });

    const grips = steeringWheel(K, [0, 1.02, -0.44], [0, 1.34, -0.18], 0.17, acc);
    return {
      chassis: K.weld('chassis'),
      wheels: [
        { x: -0.9, z: -0.86, r: 0.52, w: 0.46, steer: true, style: 'knobbly' },
        { x: 0.9, z: -0.86, r: 0.52, w: 0.46, steer: true, style: 'knobbly' },
        { x: -0.9, z: 0.84, r: 0.54, w: 0.5, style: 'knobbly' },
        { x: 0.9, z: 0.84, r: 0.54, w: 0.5, style: 'knobbly' }
      ],
      seat: {
        hip: V(0, 1.06, 0.3), grips, lean: 0.06,
        knees: [V(-0.16, 1.18, -0.12), V(0.16, 1.18, -0.12)],
        feet: [V(-0.16, 0.98, -0.44), V(0.16, 0.98, -0.44)]
      },
      exhaust,
      rearContacts: [V(-0.9, 0, 0.84), V(0.9, 0, 0.84)],
      gliderFoot: V(0, 1.7, 0.74)                     // on the roll hoop's top bar
    };
  }

  /* ── Hover Vehicle: sleek pod on four glowing pads, no wheels ─────────────── */
  function hoverChassis(c) {
    const K = makeKit(INK_T);
    const body = c.colors.kart, acc = c.colors.accent;

    K.add(taper(rbox(1.24, 0.36, 2.5, 0.17, 2), 0.46, 0.6, 'bottom'), body, { at: [0, 0.62, -0.07] }); // hull
    // Side pontoons that carry the pads.
    [-1, 1].forEach((s) => K.add(ell(0.2, 0.17, 1.12, 14, 8), WHITE, { at: [s * 0.66, 0.55, -0.02] }));
    // Pad housings (the glowing faces are a separate mesh, see hoverGlow()).
    const pads = [[-0.66, -0.76], [0.66, -0.76], [-0.66, 0.74], [0.66, 0.74]];
    pads.forEach((p) => K.add(new THREE.CylinderGeometry(0.2, 0.23, 0.12, 12), TRIM, { at: [p[0], 0.42, p[1]] }));
    // Low canopy in a deeper tint than goggle glass, so it reads as a screen, not a cushion.
    K.add(taper(ell(0.34, 0.13, 0.42, 14, 8), 0.7, 0.8), SCREEN, { at: [0, 0.82, -0.56] });
    K.add(ell(0.05, 0.02, 0.2, 6, 4), WHITE, { at: [-0.12, 0.93, -0.6], rot: [0.2, 0.3, 0], ink: 0 });  // glint
    // Rear wing on two fins, twin thrusters under it.
    K.add(rbox(1.5, 0.07, 0.36, 0.03, 1), body, { at: [0, 1.2, 1.0] });
    [-1, 1].forEach((s) => {
      K.add(rbox(0.06, 0.4, 0.42, 0.03, 1), WHITE, { at: [s * 0.6, 1.02, 0.98] });
      K.add(new THREE.CylinderGeometry(0.15, 0.13, 0.34, 12).rotateX(Math.PI / 2), METAL, { at: [s * 0.3, 0.68, 1.16] });
    });
    // Seat and a butterfly yoke.
    K.add(rbox(0.58, 0.1, 0.46, 0.04, 1), TRIM, { at: [0, 0.8, 0.2], ink: 0 });
    K.add(rbox(0.62, 0.4, 0.12, 0.05, 1), TRIM, { at: [0, 1.02, 0.48], rot: [0.22, 0, 0] });
    K.bar([0, 0.8, -0.62], [0, 1.06, -0.28], 0.03, TRIM, { flat: true, ink: 0.02 });
    K.bar([-0.24, 1.08, -0.26], [0.24, 1.08, -0.26], 0.035, TRIM, { ink: 0.02 });
    [-1, 1].forEach((s) => K.bar([s * 0.24, 1.02, -0.26], [s * 0.24, 1.16, -0.26], 0.045, acc, { ink: 0 }));

    return {
      chassis: K.weld('chassis'),
      wheels: [],
      pads: pads.map((p) => V(p[0], 0.355, p[1])),
      thrusters: [V(-0.3, 0.68, 1.335), V(0.3, 0.68, 1.335)],
      seat: {
        hip: V(0, 0.9, 0.22), lean: 0.12,
        grips: [V(-0.24, 1.09, -0.26), V(0.24, 1.09, -0.26)],
        knees: [V(-0.16, 0.98, -0.24), V(0.16, 0.98, -0.24)],
        feet: [V(-0.15, 0.8, -0.56), V(0.15, 0.8, -0.56)]
      },
      exhaust: [V(-0.3, 0.68, 1.34), V(0.3, 0.68, 1.34)],
      rearContacts: [V(-0.66, 0.34, 0.74), V(0.66, 0.34, 0.74)],
      gliderFoot: V(0, 1.24, 0.98)                    // on the rear wing
    };
  }

  const CHASSIS = { kart: kartChassis, bike: bikeChassis, buggy: buggyChassis, hover: hoverChassis };

  /* ══ Drivers ════════════════════════════════════════════════════════════
   * Driver space: origin at the hip (where the seat takes the weight), -Z
   * forward. A spine group leans the torso toward the grips; the head sits
   * on top and counter-leans so the eyes stay on the road. Arms and legs are
   * built from joint positions to the vehicle's grips and pedals, so hands
   * really hold the wheel whatever the character's size.
   *
   * Head space: origin at the head centre, -Z forward, radius R.
   */

  /** Big bead eyes with a glint, a small smile and (optionally) blush. */
  function face(K, h, R, o) {
    o = o || {};
    const yaw = o.yaw || 0.34, pitch = o.pitch === undefined ? 0.02 : o.pitch;
    const ew = R * (o.ew || 0.15), eh = R * (o.eh || 0.2), ed = R * 0.07;
    const surf = R * (o.surf || 1);
    [-1, 1].forEach((s) => {
      const n = sph(1, s * yaw, pitch);
      const q = surfaceQ(n);
      const p = n.clone().multiplyScalar(surf);
      K.add(ell(ew, eh, ed, 10, 6), EYE, { at: p, q, parent: h, ink: 0 });
      const gl = V(-ew * 0.3, eh * 0.38, ed * 0.75).applyQuaternion(q).add(p);
      K.add(ell(ew * 0.36, ew * 0.36, ed * 0.5, 6, 4), WHITE, { at: gl, q, parent: h, ink: 0 });
      if (o.brow) {
        // A short, bold, angled brow: reads as "focused racer", not "baby".
        const bp = sph(surf * 1.01, s * (yaw + 0.02), pitch + (o.browPitch || 0.3));
        const bq = surfaceQ(bp.clone()).multiply(new THREE.Quaternion().setFromAxisAngle(Z_AXIS, -s * 0.24));
        K.add(new THREE.CapsuleGeometry(R * 0.045, R * 0.2, 2, 6).rotateZ(Math.PI / 2).scale(1, 1, 0.6), EYE, { at: bp, q: bq, parent: h, ink: 0 });
      }
    });
    if (o.mouth !== false) {
      // A half torus laid on the face: the lower half of a ring is a smile.
      const n = sph(1, 0, o.mouthPitch === undefined ? -0.24 : o.mouthPitch);
      const arc = new THREE.TorusGeometry(R * (o.mouthW || 0.1), R * 0.026, 4, 10, Math.PI).rotateZ(Math.PI);
      K.add(arc, EYE, { at: n.clone().multiplyScalar(R * (o.mouthSurf || 1.01)), q: surfaceQ(n), parent: h, ink: 0 });
    }
    if (o.cheeks !== false) {
      [-1, 1].forEach((s) => {
        const n = sph(1, s * (o.cheekYaw || 0.66), o.cheekPitch || -0.16);
        K.add(ell(R * 0.12, R * 0.075, R * 0.03, 8, 4), BLUSH, { at: n.clone().multiplyScalar(R * (o.cheekSurf || 1)), q: surfaceQ(n), parent: h, ink: 0 });
      });
    }
  }

  /**
   * A strap around the head through a front point (pitch pf) and a back point
   * (pitch pb). Riding high on the forehead and low at the back is what makes
   * goggles read from behind. `sc` squashes it onto an ellipsoidal head;
   * `gap` (radians) leaves the front open, for straps that end at the eyes.
   */
  function band(K, h, R, pf, pb, color, tube, sc, gap) {
    const F = sph(R, 0, pf), B = sph(R, Math.PI, pb);
    const n = new THREE.Vector3().crossVectors(X_AXIS, F.clone().sub(B)).normalize();
    if (n.y < 0) n.negate();
    const d = n.dot(F);
    const rr = Math.sqrt(Math.max(0.0001, R * R - d * d)) + tube * 0.35;
    const gp = gap || 0;
    // The ring is laid from +Z onto n; its local +Y ends up pointing forward,
    // so turning the arc's start by 90° + gap/2 centres the opening at the front.
    const g = new THREE.TorusGeometry(rr, tube, 5, 24, TAU - gp).rotateZ(Math.PI / 2 + gp / 2);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Z_AXIS, n));
    g.translate(n.x * d, n.y * d, n.z * d);
    if (sc) g.scale(sc[0], sc[1], sc[2]);
    K.add(g, color, { parent: h, ink: 0.018 });
  }

  /** Racing goggles pushed up on the forehead, strap in the accent colour. */
  function goggles(K, h, R, strap, o) {
    o = o || {};
    const pf = o.pf === undefined ? 0.5 : o.pf;
    band(K, h, R, pf, o.pb === undefined ? 0.08 : o.pb, strap, R * 0.075);
    const lens = o.lens || GLASS;
    [-1, 1].forEach((s) => {
      const n = sph(1, s * 0.3, pf + 0.02);
      const at = n.clone().multiplyScalar(R * 1.04);
      const q = surfaceQ(n);
      if (o.square) K.add(rbox(R * 0.4, R * 0.32, R * 0.16, R * 0.06, 1), TRIM, { at, q, parent: h, ink: 0.015 });
      else K.add(new THREE.CylinderGeometry(R * 0.2, R * 0.22, R * 0.16, 12).rotateX(Math.PI / 2), TRIM, { at, q, parent: h, ink: 0.015 });
      const lp = n.clone().multiplyScalar(R * 1.13);
      if (o.square) K.add(rbox(R * 0.32, R * 0.24, R * 0.04, R * 0.04, 1), lens, { at: lp, q, parent: h, ink: 0 });
      else K.add(ell(R * 0.155, R * 0.155, R * 0.035, 10, 4), lens, { at: lp, q, parent: h, ink: 0 });
      K.add(ell(R * 0.05, R * 0.04, R * 0.02, 6, 4), WHITE, { at: V(-R * 0.06, R * 0.06, R * 0.03).applyQuaternion(q).add(lp), q, parent: h, ink: 0 });
    });
  }

  /** Open-face racing helmet: a shell over the top and back, a white stripe, goggles on top. */
  function helmet(K, h, R, color) {
    const tilt = 0.42;
    K.add(new THREE.SphereGeometry(R * 1.08, 18, 10, 0, TAU, 0, 1.64).rotateX(tilt), color, { parent: h, ink: 0.025 });
    const stripe = new THREE.TorusGeometry(R * 1.095, R * 0.05, 4, 18, 2.9).rotateZ(0.12).rotateY(Math.PI / 2);
    stripe.scale(2.2, 1, 1).rotateX(tilt);
    K.add(stripe, WHITE, { parent: h, ink: 0 });
    goggles(K, h, R * 1.08, TRIM, { pf: 0.62, pb: 0.3 });
  }

  /** An ear (or crest, or tuft) grown from a base point on the head: rot tilts it. */
  function ear(K, h, base, rot, build) {
    const g = K.group(base, rot, h);
    build(g);
    return g;
  }

  /** A round ear disc on the head's surface facing `n`, with a coloured inside. */
  function roundEar(K, h, at, n, r, depth, outer, inner) {
    const q = surfaceQ(n);
    K.add(ell(r, r, depth, 12, 8), outer, { at, q, parent: h });
    K.add(ell(r * 0.64, r * 0.64, depth * 0.4, 10, 6), inner, { at: at.clone().addScaledVector(n, depth * 0.8), q, parent: h, ink: 0 });
  }

  /* ── Per-animal heads, torsos and tails ────────────────────────────────── */
  const ANIMALS = {
    bunny: {
      head(K, h, R, c) {
        K.add(ell(R, R * 0.95, R * 0.97, 18, 12), c.colors.primary, { parent: h });
        face(K, h, R, { mouthPitch: -0.34, mouthW: 0.08 });
        K.add(ell(R * 0.1, R * 0.075, R * 0.06, 8, 6), c.colors.secondary, { at: sph(R * 0.99, 0, -0.14), parent: h, ink: 0 });
        [-1, 1].forEach((s) => K.add(rbox(R * 0.08, R * 0.1, R * 0.04, R * 0.02, 1), WHITE,
          { at: sph(R * 0.985, s * 0.05, -0.45), q: surfaceQ(sph(1, 0, -0.4)), parent: h, ink: 0.01 }));
        // Tall ears — the bunny's tell from behind. The right one flops out a little.
        [-1, 1].forEach((s) => ear(K, h, sph(R * 0.82, s * 0.3, 1.05), [0.2, 0, -s * (s > 0 ? 0.32 : 0.14)], (g) => {
          K.add(new THREE.CapsuleGeometry(R * 0.21, R * 1.2, 3, 10).scale(1, 1, 0.52), c.colors.primary, { at: [0, R * 0.8, 0], parent: g });
          K.add(new THREE.CapsuleGeometry(R * 0.12, R * 0.98, 3, 8).scale(1, 1, 0.3), c.colors.secondary, { at: [0, R * 0.84, -R * 0.07], parent: g, ink: 0 });
        }));
      },
      tail(K, sp, k) {
        K.add(ell(0.11 * k, 0.11 * k, 0.1 * k, 8, 6), WHITE, { at: [0, 0.14 * k, 0.24 * k], parent: sp });
      }
    },

    kitten: {
      head(K, h, R, c) {
        K.add(ell(R, R * 0.93, R * 0.96, 18, 12), c.colors.primary, { parent: h });
        K.add(ell(R * 0.44, R * 0.3, R * 0.3, 12, 8), c.colors.secondary, { at: sph(R * 0.78, 0, -0.34), parent: h, ink: 0.015 });
        face(K, h, R, { mouthPitch: -0.36, mouthW: 0.07, yaw: 0.36 });
        K.add(ell(R * 0.08, R * 0.055, R * 0.05, 8, 6), 0xff8fb0, { at: sph(R * 1.0, 0, -0.17), parent: h, ink: 0 });
        // Cheek fluff points outward: a cat's face shape even in silhouette.
        [-1, 1].forEach((s) => K.add(new THREE.ConeGeometry(R * 0.16, R * 0.34, 6).rotateZ(s * -1.9), c.colors.primary,
          { at: sph(R * 0.9, s * 1.25, -0.3), parent: h, ink: 0.02 }));
        // Big pointed ears with pink insides.
        [-1, 1].forEach((s) => ear(K, h, sph(R * 0.86, s * 0.55, 0.9), [-0.05, 0, -s * 0.38], (g) => {
          K.add(new THREE.ConeGeometry(R * 0.34, R * 0.72, 10).scale(1, 1, 0.6), c.colors.primary, { at: [0, R * 0.34, 0], parent: g });
          K.add(new THREE.ConeGeometry(R * 0.2, R * 0.46, 8).scale(1, 1, 0.3), 0xff9dbd, { at: [0, R * 0.3, -R * 0.11], parent: g, ink: 0 });
        }));
      },
      tail(K, sp, k, c) {
        // Swept out to the right and hooked at the tip, beside the head rather than behind it.
        const t = tube([[0, 0.12, 0.16], [0.12, 0.24, 0.36], [0.32, 0.46, 0.44], [0.46, 0.72, 0.38], [0.42, 0.9, 0.24]].map((p) => p.map((x) => x * k)),
          0.07 * k, 0.055 * k, 14, 6);
        K.add(t.geo, c.colors.primary, { parent: sp, ink: 0.022 });
        K.add(ell(0.07 * k, 0.07 * k, 0.07 * k, 8, 6), c.colors.secondary, { at: t.end, parent: sp, ink: 0.02 });
      }
    },

    chick: {
      head(K, h, R, c) {
        K.add(ell(R, R * 0.97, R * 0.97, 18, 12), c.colors.primary, { parent: h });
        face(K, h, R, { mouth: false, yaw: 0.36, cheekPitch: -0.22 });
        // Beak: an upper and a lower cone, pointing down the road (flattened
        // on local Z, which becomes vertical once the cone is laid forward).
        K.add(new THREE.ConeGeometry(R * 0.17, R * 0.34, 8).scale(1, 1, 0.62).rotateX(-Math.PI / 2), c.colors.secondary,
          { at: [0, -R * 0.14, -R * 1.02], parent: h, ink: 0.015 });
        K.add(new THREE.ConeGeometry(R * 0.12, R * 0.2, 8).scale(1, 1, 0.5).rotateX(-Math.PI / 2), 0xe86a0c,
          { at: [0, -R * 0.26, -R * 0.96], parent: h, ink: 0.012 });
        // Crest: three big feathers fanned on top — the chick's tell from behind.
        const cg = K.group(sph(R * 0.9, 0, 1.2), [-0.3, 0, 0], h);
        [-0.55, 0, 0.55].forEach((a) => {
          const fg = K.group([0, 0, 0], [0, 0, a], cg);
          K.add(ell(R * 0.13, R * (a ? 0.36 : 0.46), R * 0.1, 8, 6), c.colors.primary, { at: [0, R * (a ? 0.3 : 0.38), 0], parent: fg });
        });
      },
      arm: 'wing', foot: 'secondary'
    },

    mouse: {
      head(K, h, R, c) {
        K.add(ell(R, R * 0.92, R * 0.96, 18, 12), c.colors.primary, { parent: h });
        // A pointed snout with a pink nose at its tip.
        K.add(ell(R * 0.34, R * 0.26, R * 0.34, 12, 8), 0xe6cdb8, { at: [0, -R * 0.22, -R * 0.78], parent: h, ink: 0.015 });
        K.add(ell(R * 0.1, R * 0.08, R * 0.08, 8, 6), c.colors.secondary, { at: [0, -R * 0.14, -R * 1.1], parent: h, ink: 0 });
        face(K, h, R, { mouthPitch: -0.46, mouthW: 0.07, yaw: 0.4, pitch: 0.08, cheekYaw: 0.74 });
        // Big round ears standing out at the top-sides: the mouse's tell from behind.
        [-1, 1].forEach((s) => roundEar(K, h, sph(R * 1.1, s * 1.3, 0.72), V(s * 0.62, 0.3, -0.72).normalize(),
          R * 0.56, R * 0.1, c.colors.primary, c.colors.secondary));
      },
      tail(K, sp, k, c) {
        // A thin tail curling out to the left.
        const t = tube([[0, 0.1, 0.18], [-0.08, 0.16, 0.44], [-0.3, 0.26, 0.6], [-0.46, 0.46, 0.56], [-0.42, 0.62, 0.42]].map((p) => p.map((x) => x * k)),
          0.035 * k, 0.02 * k, 16, 5);
        K.add(t.geo, c.colors.secondary, { parent: sp, ink: 0.015 });
      },
      gear: { square: true, lens: 0xc8f06a }
    },

    fox: {
      head(K, h, R, c) {
        K.add(ell(R, R * 0.92, R * 0.95, 18, 12), c.colors.primary, { parent: h });
        // White cheek ruff sweeping out to points.
        [-1, 1].forEach((s) => K.add(new THREE.ConeGeometry(R * 0.26, R * 0.5, 8).rotateZ(s * -2.0), c.colors.secondary,
          { at: sph(R * 0.82, s * 1.05, -0.36), parent: h, ink: 0.02 }));
        // A long, pointed muzzle with a black nose: fox, not bear, from the front.
        K.add(taper(ell(R * 0.34, R * 0.26, R * 0.56, 12, 8), 0.45, 0.6), c.colors.secondary, { at: [0, -R * 0.3, -R * 0.72], parent: h, ink: 0.015 });
        K.add(ell(R * 0.1, R * 0.08, R * 0.08, 8, 6), EYE, { at: [0, -R * 0.26, -R * 1.27], parent: h, ink: 0 });
        face(K, h, R, { mouth: false, yaw: 0.38, pitch: 0.12, brow: true, cheeks: false });
        // Tall pointed ears with dark tips.
        [-1, 1].forEach((s) => ear(K, h, sph(R * 0.84, s * 0.5, 0.88), [-0.08, 0, -s * 0.3], (g) => {
          K.add(new THREE.ConeGeometry(R * 0.36, R * 0.9, 10).scale(1, 1, 0.58), c.colors.primary, { at: [0, R * 0.44, 0], parent: g });
          K.add(new THREE.ConeGeometry(R * 0.15, R * 0.34, 8).scale(1, 1, 0.62), 0x4a2c1c, { at: [0, R * 0.74, 0.002], parent: g, ink: 0 });
          K.add(new THREE.ConeGeometry(R * 0.2, R * 0.52, 8).scale(1, 1, 0.3), c.colors.secondary, { at: [0, R * 0.34, -R * 0.13], parent: g, ink: 0 });
        }));
      },
      tail(K, sp, k, c) {
        // The big bushy tail sweeps up and out to the left, framing the head
        // instead of covering it — the fox's tell from behind.
        const g = K.group([-0.06 * k, 0.2 * k, 0.26 * k], [0.9, 0, 0.75], sp);
        K.add(ell(0.2 * k, 0.44 * k, 0.2 * k, 12, 10), c.colors.primary, { at: [0, 0.4 * k, 0], parent: g });
        K.add(ell(0.15 * k, 0.2 * k, 0.15 * k, 10, 8), c.colors.secondary, { at: [0, 0.8 * k, 0], parent: g });
      },
      gear: { pf: 0.66 }             // goggles pushed high, clear of the brows
    },

    puppy: {
      head(K, h, R, c) {
        K.add(ell(R, R * 0.94, R * 0.96, 18, 12), c.colors.primary, { parent: h });
        K.add(ell(R * 0.44, R * 0.32, R * 0.34, 12, 8), c.colors.secondary, { at: [0, -R * 0.28, -R * 0.72], parent: h, ink: 0.015 });
        K.add(ell(R * 0.16, R * 0.11, R * 0.1, 10, 6), EYE, { at: [0, -R * 0.12, -R * 1.04], parent: h, ink: 0 });
        K.add(ell(R * 0.1, R * 0.12, R * 0.05, 8, 6), 0xff7a9a, { at: [0.04 * R, -R * 0.58, -R * 0.84], rot: [0.5, 0, 0], parent: h, ink: 0.01 });
        face(K, h, R, { mouthPitch: -0.44, mouthW: 0.1, mouthSurf: 1.04, yaw: 0.38, pitch: 0.12 });
        // Big floppy ears hanging out from under the helmet, flared so they
        // show beside the head from behind.
        [-1, 1].forEach((s) => ear(K, h, sph(R * 1.04, s * 1.4, 0.36), [0.12, 0, s * 0.5], (g) => {
          K.add(ell(R * 0.24, R * 0.5, R * 0.3, 10, 8), 0x8b5733, { at: [0, -R * 0.4, 0], parent: g });
        }));
      },
      tail(K, sp, k, c) {
        K.bar([0, 0.14 * k, 0.2 * k], [0.16 * k, 0.46 * k, 0.36 * k], 0.055 * k, c.colors.primary, { parent: sp, ink: 0.02 });
      },
      gear: { helmet: true }
    },

    penguin: {
      head(K, h, R, c) {
        K.add(ell(R, R * 0.96, R * 0.96, 18, 12), c.colors.primary, { parent: h });
        // White face mask the eyes sit on.
        K.add(ell(R * 0.74, R * 0.64, R * 0.6, 14, 10), c.colors.secondary, { at: [0, -R * 0.08, -R * 0.44], parent: h, ink: 0.012 });
        face(K, h, R, { mouth: false, surf: 1.02, yaw: 0.32, pitch: 0.0, cheekSurf: 1.02 });
        K.add(new THREE.ConeGeometry(R * 0.15, R * 0.34, 8).scale(1, 1, 0.6).rotateX(-Math.PI / 2), 0xff9a1f,
          { at: [0, -R * 0.2, -R * 1.12], parent: h, ink: 0.015 });
      },
      torso(K, sp, T, c) {
        // A round egg body: the penguin reads as one plump shape.
        K.add(ell(T[0] * 1.3, T[1] * 1.22, T[2] * 1.3, 14, 10), c.colors.primary, { at: [0, T[1] * 1.1, 0.03], parent: sp });
        K.add(ell(T[0] * 0.95, T[1] * 0.95, T[2] * 0.7, 12, 8), c.colors.secondary, { at: [0, T[1] * 1.0, 0.03 - T[2] * 0.72], parent: sp, ink: 0 });
      },
      neck(K, sp, T, c) {
        // Red scarf: a ring at the neck and two tails streaming out behind to
        // the right, like a flag — the penguin's tell from behind.
        const y = T[1] * 2.1;
        K.add(new THREE.TorusGeometry(T[0] * 0.95, T[0] * 0.24, 6, 16).rotateX(Math.PI / 2), c.colors.accent, { at: [0, y, 0.03], parent: sp, ink: 0.02 });
        [0, 1].forEach((i) => {
          const g = K.group([0.08, y - 0.02 - i * 0.06, T[2] * 0.9], [0.1 + i * 0.24, 1.05 + i * 0.3, 0], sp);
          const len = 0.56 - i * 0.14;
          K.add(rbox(0.17, 0.04, len, 0.018, 1), c.colors.accent, { at: [0, 0, len / 2 - 0.04], parent: g, ink: 0.02 });
          K.add(rbox(0.17, 0.046, 0.05, 0.012, 1), WHITE, { at: [0, 0, len - 0.12], parent: g, ink: 0 });
        });
      },
      arm: 'flipper', foot: 0xff9a1f,
      // A white strap stands out on a navy head, and stays distinct from the red scarf.
      gear: { strap: WHITE }
    },

    frog: {
      head(K, h, R, c) {
        const sc = [1.16, 0.8, 0.98];
        K.add(ell(R * sc[0], R * sc[1], R * sc[2], 20, 12), c.colors.primary, { parent: h });
        K.add(ell(R * 0.8, R * 0.36, R * 0.52, 14, 8), c.colors.secondary, { at: [0, -R * 0.34, -R * 0.4], parent: h, ink: 0 });
        // Eyes on top: the frog's tell from behind is the two bumps.
        [-1, 1].forEach((s) => {
          const b = V(s * R * 0.48, R * 0.6, -R * 0.24);
          K.add(ell(R * 0.3, R * 0.3, R * 0.3, 14, 10), c.colors.primary, { at: b, parent: h });
          const n = V(s * 0.25, 0.1, -1).normalize();
          const q = surfaceQ(n);
          const ep = b.clone().addScaledVector(n, R * 0.24);
          K.add(ell(R * 0.21, R * 0.21, R * 0.08, 12, 8), WHITE, { at: ep, q, parent: h, ink: 0 });
          const pp = ep.clone().addScaledVector(n, R * 0.05);
          K.add(ell(R * 0.11, R * 0.14, R * 0.05, 10, 6), EYE, { at: pp, q, parent: h, ink: 0 });
          K.add(ell(R * 0.04, R * 0.04, R * 0.02, 6, 4), WHITE, { at: V(-R * 0.035, R * 0.05, R * 0.03).applyQuaternion(q).add(pp), q, parent: h, ink: 0 });
          // Goggle rims round each eye bump.
          K.add(new THREE.TorusGeometry(R * 0.24, R * 0.055, 5, 14), TRIM, { at: b.clone().addScaledVector(n, R * 0.2), q, parent: h, ink: 0.012 });
        });
        // The strap runs round the back only, from one eye rim to the other.
        band(K, h, R, 0.42, 0.14, c.colors.accent, R * 0.07, sc, 1.9);
        const arc = new THREE.TorusGeometry(R * 0.42, R * 0.03, 4, 14, Math.PI * 0.8).rotateZ(Math.PI * 1.1);
        K.add(arc, EYE, { at: [0, -R * 0.04, -R * 0.96], parent: h, rot: [-0.25, 0, 0], ink: 0 });
        [-1, 1].forEach((s) => K.add(ell(R * 0.14, R * 0.08, R * 0.03, 8, 4), BLUSH, { at: V(s * R * 0.72, -R * 0.2, -R * 0.66), q: surfaceQ(V(s * 0.6, -0.1, -0.8)), parent: h, ink: 0 }));
      },
      gear: { none: true }
    },

    bear: {
      head(K, h, R, c) {
        K.add(ell(R, R * 0.95, R * 0.96, 18, 12), c.colors.primary, { parent: h });
        K.add(ell(R * 0.42, R * 0.3, R * 0.3, 12, 8), c.colors.secondary, { at: [0, -R * 0.3, -R * 0.78], parent: h, ink: 0.015 });
        K.add(ell(R * 0.15, R * 0.1, R * 0.09, 10, 6), EYE, { at: [0, -R * 0.16, -R * 1.04], parent: h, ink: 0 });
        face(K, h, R, { mouthPitch: -0.48, mouthW: 0.09, mouthSurf: 1.06, yaw: 0.36, pitch: 0.1, brow: true, browPitch: 0.26, cheeks: false });
        // Round ears on top.
        [-1, 1].forEach((s) => roundEar(K, h, sph(R * 0.98, s * 0.95, 0.86), V(s * 0.4, 0.35, -0.85).normalize(),
          R * 0.32, R * 0.15, c.colors.primary, c.colors.secondary));
      },
      gear: { pf: 0.64 }
    },

    robot: {
      head(K, h, R, c) {
        K.add(rbox(R * 1.9, R * 1.62, R * 1.76, R * 0.4, 2), c.colors.primary, { parent: h });
        // Visor with glowing-blue eyes and a smile.
        K.add(rbox(R * 1.56, R * 0.62, R * 0.2, R * 0.14, 1), 0x1e2a44, { at: [0, R * 0.08, -R * 0.82], parent: h, ink: 0.015 });
        [-1, 1].forEach((s) => K.add(rbox(R * 0.26, R * 0.3, R * 0.06, R * 0.08, 1), c.colors.secondary, { at: [s * R * 0.34, R * 0.1, -R * 0.93], parent: h, ink: 0 }));
        K.add(new THREE.TorusGeometry(R * 0.16, R * 0.035, 4, 10, Math.PI).rotateZ(Math.PI), c.colors.secondary, { at: [0, -R * 0.36, -R * 0.89], parent: h, ink: 0 });
        // Ear bolts in the accent colour.
        [-1, 1].forEach((s) => K.add(new THREE.CylinderGeometry(R * 0.24, R * 0.24, R * 0.18, 12).rotateZ(Math.PI / 2), c.colors.accent, { at: [s * R * 0.98, 0, 0], parent: h, ink: 0.015 }));
        // Antenna with a bobble: the robot's tell from behind, plus a light
        // panel on the back of the head.
        K.bar([0, R * 0.78, R * 0.05], [0, R * 1.5, R * 0.1], R * 0.05, TRIM, { parent: h, ink: 0.012 });
        K.add(ell(R * 0.16, R * 0.16, R * 0.16, 10, 8), c.colors.accent, { at: [0, R * 1.58, R * 0.1], parent: h, ink: 0.015 });
        K.add(rbox(R * 1.1, R * 0.62, R * 0.1, R * 0.08, 1), 0x46597a, { at: [0, R * 0.05, R * 0.87], parent: h, ink: 0.012 });
        [0xff3b30, 0xffc41a, 0x2ee06a].forEach((col, i) => K.add(rbox(R * 0.2, R * 0.2, R * 0.06, R * 0.05, 1), col, { at: [(i - 1) * R * 0.3, R * 0.12, R * 0.93], parent: h, ink: 0 }));
        K.add(rbox(R * 0.8, R * 0.06, R * 0.05, R * 0.02, 1), c.colors.secondary, { at: [0, -R * 0.12, R * 0.93], parent: h, ink: 0 });
      },
      torso(K, sp, T, c) {
        K.add(rbox(T[0] * 2.1, T[1] * 1.9, T[2] * 1.9, T[0] * 0.4, 2), c.colors.primary, { at: [0, T[1], 0.02], parent: sp });
        K.add(rbox(T[0] * 1.2, T[1] * 0.8, 0.04, 0.04, 1), 0x1e2a44, { at: [0, T[1] * 1.1, 0.02 - T[2] * 0.96], parent: sp, ink: 0 });
        K.add(ell(0.05, 0.05, 0.02, 8, 6), c.colors.secondary, { at: [0, T[1] * 1.1, 0.02 - T[2] * 0.99], parent: sp, ink: 0 });
        K.add(rbox(T[0] * 1.3, T[1] * 1.1, 0.05, 0.04, 1), 0x46597a, { at: [0, T[1] * 1.05, 0.02 + T[2] * 0.95], parent: sp, ink: 0 });
        [-1, 1].forEach((s) => K.add(rbox(T[0] * 0.3, 0.04, 0.03, 0.01, 1), c.colors.accent, { at: [s * T[0] * 0.36, T[1] * 1.5, 0.03 + T[2] * 0.97], parent: sp, ink: 0 }));
      },
      arm: 'robot', foot: 0x46597a, gear: { none: true }
    },

    dinosaur: {
      head(K, h, R, c) {
        K.add(ell(R, R * 0.92, R * 0.98, 18, 12), c.colors.primary, { parent: h });
        // A big friendly snout with nostrils and two little fangs.
        K.add(ell(R * 0.64, R * 0.46, R * 0.56, 14, 10), c.colors.primary, { at: [0, -R * 0.26, -R * 0.66], parent: h });
        K.add(ell(R * 0.52, R * 0.2, R * 0.42, 12, 6), c.colors.secondary, { at: [0, -R * 0.5, -R * 0.7], parent: h, ink: 0 });
        [-1, 1].forEach((s) => {
          K.add(ell(R * 0.06, R * 0.04, R * 0.04, 6, 4), 0x145e52, { at: [s * R * 0.2, -R * 0.1, -R * 1.18], parent: h, ink: 0 });
          K.add(new THREE.ConeGeometry(R * 0.06, R * 0.14, 5).rotateX(Math.PI), WHITE, { at: [s * R * 0.26, -R * 0.5, -R * 1.06], parent: h, ink: 0.008 });
        });
        const arc = new THREE.TorusGeometry(R * 0.36, R * 0.03, 4, 12, Math.PI * 0.8).rotateZ(Math.PI * 1.1);
        K.add(arc, EYE, { at: [0, -R * 0.14, -R * 1.12], rot: [-0.35, 0, 0], parent: h, ink: 0 });
        face(K, h, R, { mouth: false, yaw: 0.44, pitch: 0.26, brow: true, browPitch: 0.25, cheeks: false });
        // Chunky spikes from the crown down the back of the head: the dino's
        // tell. Only slightly flattened, so they still read as spikes when the
        // chase camera sees them end-on; the crown ones clear the head outline.
        [[1.45, 0.5], [1.12, 0.58], [0.76, 0.54], [0.4, 0.46], [0.04, 0.36]].forEach((sp) => {
          const n = sph(1, Math.PI, sp[0]);
          K.add(new THREE.ConeGeometry(R * sp[1] * 0.5, R * sp[1] * 1.3, 6).scale(0.8, 1, 1), c.colors.accent,
            { at: n.clone().multiplyScalar(R * 0.92), q: new THREE.Quaternion().setFromUnitVectors(Y_AXIS, n), parent: h, ink: 0.015 });
        });
      },
      torso(K, sp, T, c) {
        K.add(ell(T[0], T[1], T[2], 14, 10), c.colors.primary, { at: [0, T[1], 0.02], parent: sp });
        K.add(ell(T[0] * 0.7, T[1] * 0.72, T[2] * 0.5, 10, 8), c.colors.secondary, { at: [0, T[1] * 0.9, 0.02 - T[2] * 0.62], parent: sp, ink: 0 });
        // Spikes continue down the back.
        [0.82, 0.56].forEach((y, i) => K.add(new THREE.ConeGeometry(0.09 - i * 0.02, 0.22 - i * 0.04, 6).scale(0.8, 1, 1).rotateX(Math.PI / 2 - 0.35), c.colors.accent,
          { at: [0, T[1] * 2 * y + 0.06, 0.02 + T[2] * 0.95], parent: sp, ink: 0.012 }));
      },
      tail(K, sp, k, c) {
        // A thick tail sweeping back and out to the right, over the rear wheel.
        const t = tube([[0, 0.1, 0.12], [0.1, 0.12, 0.44], [0.32, 0.2, 0.72], [0.54, 0.34, 0.86]].map((p) => p.map((x) => x * k)),
          0.16 * k, 0.05 * k, 12, 8);
        K.add(t.geo, c.colors.primary, { parent: sp, ink: 0.022 });
        K.add(ell(0.05 * k, 0.05 * k, 0.05 * k, 6, 4), c.colors.primary, { at: t.end, parent: sp, ink: 0.02 });
      },
      headScale: 1.08,
      gear: { pf: 0.8 }              // eyes sit high on a dino head, so the goggles go higher still
    },

    hippo: {
      head(K, h, R, c) {
        K.add(ell(R * 1.04, R * 0.94, R * 0.98, 18, 12), c.colors.primary, { parent: h });
        // Big round snout with nostrils on top.
        K.add(ell(R * 0.66, R * 0.46, R * 0.46, 14, 10), 0xc9b5f0, { at: [0, -R * 0.32, -R * 0.68], parent: h, ink: 0.015 });
        [-1, 1].forEach((s) => K.add(ell(R * 0.07, R * 0.05, R * 0.04, 6, 4), 0x5a4a86, { at: [s * R * 0.22, -R * 0.02, -R * 0.96], rot: [-0.9, 0, 0], parent: h, ink: 0 }));
        const arc = new THREE.TorusGeometry(R * 0.3, R * 0.03, 4, 12, Math.PI * 0.8).rotateZ(Math.PI * 1.1);
        K.add(arc, EYE, { at: [0, -R * 0.3, -R * 1.12], rot: [-0.2, 0, 0], parent: h, ink: 0 });
        // Eyes sit just under the helmet rim, above the snout.
        face(K, h, R, { mouth: false, yaw: 0.36, pitch: 0.15, ew: 0.13, eh: 0.17, cheekPitch: -0.12, cheekYaw: 0.84 });
        // Small round ears poking up through the helmet: the hippo's tell from behind.
        [-1, 1].forEach((s) => roundEar(K, h, sph(R * 1.12, s * 0.78, 0.9), V(s * 0.35, 0.45, -0.82).normalize(),
          R * 0.2, R * 0.12, c.colors.primary, c.colors.secondary));
      },
      gear: { helmet: true }
    }
  };

  /** Per-character body size and proportions (heavier racers are bigger). */
  const SIZE = { light: 0.9, medium: 1.0, heavy: 1.1 };
  const TORSO = {
    bunny: [0.24, 0.29, 0.21], kitten: [0.24, 0.28, 0.21], chick: [0.24, 0.27, 0.22], mouse: [0.23, 0.28, 0.2],
    fox: [0.25, 0.3, 0.21], puppy: [0.25, 0.3, 0.22], penguin: [0.25, 0.28, 0.22], frog: [0.27, 0.28, 0.23],
    bear: [0.29, 0.31, 0.25], robot: [0.26, 0.29, 0.22], dinosaur: [0.27, 0.3, 0.24], hippo: [0.3, 0.31, 0.26]
  };
  const PAWS = { bunny: WHITE, fox: 0x4a2c1c, bear: 0x6b4226, robot: 0x46597a };

  function buildDriver(c, seat) {
    const K = makeKit(INK_T);
    const fx = ANIMALS[c.animal];
    const k = SIZE[c.weight] || 1;
    const T = TORSO[c.animal].map((v) => v * k);
    const R = 0.4 * k * (fx.headScale || 1);
    const col = c.colors;
    const lean = seat.lean || 0;
    const hip = seat.hip;
    const spine = K.group([0, 0, 0], [-lean, 0, 0]);

    // Torso: fur-coloured, with a lighter belly for the 3/4 views.
    if (fx.torso) fx.torso(K, spine, T, c);
    else {
      K.add(ell(T[0], T[1], T[2], 14, 10), col.primary, { at: [0, T[1], 0.02], parent: spine });
      K.add(ell(T[0] * 0.68, T[1] * 0.66, T[2] * 0.5, 10, 8), c.animal === 'bunny' ? WHITE : col.secondary,
        { at: [0, T[1] * 0.9, 0.02 - T[2] * 0.62], parent: spine, ink: 0 });
    }
    if (fx.neck) fx.neck(K, spine, T, c);

    // Head, counter-leaned so the face looks down the road.
    const head = K.group([0, T[1] * 2 + R * 0.7, 0], [lean * 0.8, 0, 0], spine);
    fx.head(K, head, R, c);
    const gear = fx.gear || {};
    if (gear.helmet) helmet(K, head, R, col.accent);
    else if (!gear.none) goggles(K, head, R, gear.strap || col.accent, gear);

    // Arms from the shoulders to the vehicle's grips.
    const armCol = c.animal === 'robot' ? 0x9fb2d0 : col.primary;
    const pawCol = PAWS[c.animal] || (/kitten|puppy|mouse/.test(c.animal) ? col.secondary : col.primary);
    const armR = 0.065 * k;
    [-1, 1].forEach((s, i) => {
      const sh = K.toRoot(spine, [s * T[0] * 0.8, T[1] * 1.52, 0.03]);
      const grip = seat.grips[i].clone().sub(hip);
      K.bar(sh, grip, armR, armCol, { radial: 8 });
      if (fx.arm === 'wing' || fx.arm === 'flipper') {
        // Feathered wing tip / flipper wrapped round the grip.
        const d = grip.clone().sub(sh).normalize();
        K.add(ell(armR * 1.3, armR * 0.9, armR * 2.4, 8, 6), col.primary, { at: grip, q: new THREE.Quaternion().setFromUnitVectors(Z_AXIS, d), ink: 0.015 });
      } else {
        K.add(ell(armR * 1.4, armR * 1.3, armR * 1.4, 8, 6), pawCol, { at: grip, ink: 0.015 });
      }
    });

    // Legs from the hips to the pedals or foot pegs. Inside a cockpit they
    // are barely seen, so only the bike's legs pay for an outline.
    const footCol = fx.foot === 'secondary' ? col.secondary : (typeof fx.foot === 'number' ? fx.foot : pawCol);
    const legR = 0.075 * k;
    const legInk = seat.showLegs ? 0.02 : 0;
    [-1, 1].forEach((s, i) => {
      const hp = K.toRoot(spine, [s * T[0] * 0.45, T[1] * 0.35, -T[2] * 0.2]);
      const knee = seat.knees[i].clone().sub(hip);
      const foot = seat.feet[i].clone().sub(hip);
      K.bar(hp, knee, legR * 1.1, col.primary, { ink: legInk });
      K.bar(knee, foot, legR, col.primary, { ink: legInk });
      K.add(ell(legR * 1.25, legR * 0.95, legR * 1.9, 8, 6), footCol, { at: foot.clone().add(V(0, 0, -legR * 0.8)), ink: legInk ? 0.015 : 0 });
    });

    if (fx.tail) fx.tail(K, spine, k, c);
    return K.weld('driver');
  }

  /* ══ Glider ═════════════════════════════════════════════════════════════
   * The mount is a hidden group at the vehicle's glider foot, behind the
   * driver (engine deck, bike tail, roll hoop, hover wing); the game shows it
   * on glide ramps. NK.art.glider(color) provides the real wing when it
   * exists. Both it and this placeholder put their origin at the foot of the
   * mast with the sail about 1.15 m up, in the top quarter of the model.
   */
  function placeholderGlider(color) {
    const K = makeKit(0.035);
    const H = 1.15;
    // A four-sided cone laid flat with its apex forward is a delta planform.
    K.add(new THREE.ConeGeometry(1.9, 1.5, 4).rotateX(-Math.PI / 2).scale(1, 0.06, 1), color, { at: [0, H, -0.1] });
    K.add(rbox(0.08, 0.05, 1.4, 0.02, 1), WHITE, { at: [0, H + 0.075, -0.05], ink: 0 });          // keel
    K.add(rbox(2.5, 0.02, 0.12, 0.01, 1), WHITE, { at: [0, H + 0.06, 0.3], ink: 0 });             // stripe
    K.bar([0, 0, 0], [0, H, 0.05], 0.05, TRIM, { ink: 0.015 });                                    // mast
    [-1, 1].forEach((s) => K.bar([0, 0.35, 0], [s * 0.9, H - 0.02, 0.1], 0.03, TRIM, { ink: 0.012 }));
    return K.weld('glider');
  }

  /* ══ Hover glow ═════════════════════════════════════════════════════════
   * Pads and thruster cores share one emissive mesh (its material cloned per
   * racer, so the game can pulse one racer's glow). A soft additive disc on
   * the road under each pad sells the float for one more call.
   */
  let glowDecalMat = null;
  function hoverGlow(spec) {
    const mat = A.mat.glow(PAD_GLOW, 1.5).clone();
    const tmp = new THREE.Group();
    const add = (geo, at) => tmp.add(new THREE.Mesh(geo.translate(at.x, at.y, at.z), mat));
    spec.pads.forEach((p) => add(new THREE.CylinderGeometry(0.17, 0.19, 0.05, 12), p));
    spec.thrusters.forEach((p) => add(new THREE.CylinderGeometry(0.1, 0.1, 0.03, 10).rotateX(Math.PI / 2), p));
    const pads = A.mergeByMaterial(tmp).children[0];
    pads.name = 'hoverPads';

    if (!glowDecalMat) {
      glowDecalMat = new THREE.MeshBasicMaterial({
        color: PAD_GLOW, map: A.tex.glowSprite(), transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, opacity: 0.9
      });
    }
    const dtmp = new THREE.Group();
    spec.pads.forEach((p) => dtmp.add(new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.95).rotateX(-Math.PI / 2).translate(p.x, 0.04, p.z), glowDecalMat)));
    const decal = A.mergeByMaterial(dtmp).children[0];
    decal.name = 'hoverGlow';
    decal.renderOrder = 2;
    return { pads, decal };
  }

  /* ══ build() ════════════════════════════════════════════════════════════ */

  /**
   * One racer, ready to drop onto a track frame (rotation.y = -heading).
   *   root ─ body (bob / squash / roll) ─ chassis mesh
   *        │                           ├ driver (lean / bounce) ─ driver mesh
   *        │                           ├ glider mount (hidden)
   *        │                           └ hover pads (hover only)
   *        ├ rear wheels / front steer pivots → wheel meshes (bike: on body)
   *        └ hover ground glow (hover only)
   * userData.wheels spin about local X (rolling forward = rotation.x
   * decreasing by v·dt / wheel.userData.radius); steerWheels yaw about local Y
   * (positive = wheels turned left). exhaust / rearContacts are root-local
   * points with the body at rest. The glider mount is the mast's foot behind
   * the driver; show it (glider.visible = true) on glide ramps.
   */
  function build(charId, vehicleId) {
    const c = character(charId), v = vehicle(vehicleId);
    const spec = CHASSIS[v.id](c);

    const root = new THREE.Group();
    root.name = 'racer:' + c.id + ':' + v.id;
    const body = new THREE.Group();
    body.name = 'body';
    root.add(body);
    body.add(spec.chassis);

    // Hubs in the kart colour, unless the kart is so pale they'd vanish into the rim.
    const hub = luma(c.colors.kart) > 0.7 ? c.colors.accent : c.colors.kart;
    const wheels = [], steerWheels = [];
    const wheelParent = spec.wheelsOnBody ? body : root;
    spec.wheels.forEach((w, i) => {
      const mesh = new THREE.Mesh(wheelGeometry(w, hub, Math.sign(w.x)), A.mat.toonV());
      mesh.name = 'wheel' + i;
      mesh.userData.radius = w.r;
      if (w.steer) {
        const pivot = new THREE.Group();
        pivot.name = 'steer' + i;
        pivot.position.set(w.x, w.r, w.z);
        pivot.add(mesh);
        wheelParent.add(pivot);
        steerWheels.push(pivot);
      } else {
        mesh.position.set(w.x, w.r, w.z);
        wheelParent.add(mesh);
      }
      wheels.push(mesh);
    });

    const driver = new THREE.Group();
    driver.name = 'driver';
    driver.position.copy(spec.seat.hip);
    driver.add(buildDriver(c, spec.seat));
    body.add(driver);

    let hoverPads = [];
    if (v.id === 'hover') {
      const g = hoverGlow(spec);
      body.add(g.pads);
      root.add(g.decal);
      hoverPads = [g.pads];
    }

    // Height before the glider goes on (Box3 ignores visibility).
    const box = new THREE.Box3().setFromObject(root);
    const height = Math.round(box.max.y * 100) / 100;

    // Glider on its mount behind the driver. The mast stretches (y only) when
    // the racer is tall, so the sail always clears the top of the head —
    // bunny ears need the most room.
    const glider = new THREE.Group();
    glider.name = 'glider';
    glider.visible = false;
    glider.position.copy(spec.gliderFoot);
    const wing = typeof A.glider === 'function' ? A.glider(c.colors.kart) : placeholderGlider(c.colors.kart);
    const sailY = 0.75 * new THREE.Box3().setFromObject(wing).max.y;
    wing.scale.y = Math.max(1, (height + 0.12 - spec.gliderFoot.y) / sailY);
    glider.add(wing);
    body.add(glider);

    root.userData = {
      wheels, steerWheels, body, driver,
      exhaust: spec.exhaust, rearContacts: spec.rearContacts,   // fresh per build: safe to keep
      glider, hoverPads, height,
      vehicleId: v.id, charId: c.id
    };
    return root;
  }

  return {
    CHARACTERS, VEHICLES,
    statsFor, build,
    // Small conveniences for the menus: lookups with a safe fallback, and
    // combined stat bars for a character + kart pairing.
    character, vehicle, bars
  };
})();
