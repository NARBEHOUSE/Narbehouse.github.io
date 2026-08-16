/**
 * Benny's Race Tracks — paper-craft art kit.
 *
 * Every model is built procedurally out of chunky, flat-shaded primitives with
 * a shared paper-fibre texture, which is what sells the folded-paper diorama
 * look without shipping a single asset file.
 *
 * Two rules run through all of it:
 *   1. Big, round, saturated shapes — toy-like rather than realistic.
 *   2. Anything the player must react to (obstacles, pickups, the vehicle, the
 *      gap markers) gets a dark ink outline. It reads as craft-paper edging and
 *      it is the cheapest way to buy the contrast Ben's low vision needs.
 */
RT.art = (function () {
  'use strict';

  const U = RT.util;

  /* ── Shared texture ───────────────────────────────────────────────────── */

  let PAPER = null;

  /** Near-white so material.color can tint it freely. */
  function paperTexture() {
    if (PAPER) return PAPER;
    const size = 256;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const r = U.rng(90210);

    g.fillStyle = '#f7f2e8';
    g.fillRect(0, 0, size, size);

    // Fibres: short random strokes, half lighter and half darker than the base.
    for (let i = 0; i < 2400; i++) {
      const x = r.range(0, size), y = r.range(0, size);
      const len = r.range(2, 10), ang = r.range(0, Math.PI * 2);
      g.strokeStyle = r.chance(0.5) ? 'rgba(130,112,90,0.07)' : 'rgba(255,255,255,0.5)';
      g.lineWidth = r.range(0.5, 1.3);
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
      g.stroke();
    }
    for (let i = 0; i < 180; i++) {
      g.fillStyle = 'rgba(150,132,108,0.08)';
      g.beginPath();
      g.arc(r.range(0, size), r.range(0, size), r.range(0.5, 1.7), 0, Math.PI * 2);
      g.fill();
    }

    PAPER = new THREE.CanvasTexture(c);
    PAPER.wrapS = PAPER.wrapT = THREE.RepeatWrapping;
    PAPER.colorSpace = THREE.SRGBColorSpace;
    PAPER.anisotropy = 4;
    return PAPER;
  }

  /**
   * Road surface. `u` runs across the road and `v` along it, so all the lane
   * markings are painted rather than extra geometry. Lines are drawn with a
   * slight wobble so they look brushed on by hand instead of CAD-perfect.
   */
  function roadTexture(opts) {
    const w = 256, h = 512;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    const r = U.rng(opts.seed || 7);

    g.fillStyle = opts.base;
    g.fillRect(0, 0, w, h);

    // Very gentle mottling — enough to read as paper, not as tarmac grit.
    for (let i = 0; i < 500; i++) {
      g.fillStyle = r.chance(0.5) ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.025)';
      g.beginPath();
      g.arc(r.range(0, w), r.range(0, h), r.range(3, 11), 0, Math.PI * 2);
      g.fill();
    }

    function wobbleBar(x, width, color, from, to) {
      g.fillStyle = color;
      for (let y = from; y < to; y += 8) {
        const jitter = Math.sin(y * 0.05 + x) * 0.9;
        g.fillRect(x + jitter, y, width, 8.6);
      }
    }

    // Solid edge lines.
    wobbleBar(w * 0.035, w * 0.055, opts.edge, 0, h);
    wobbleBar(w * 0.910, w * 0.055, opts.edge, 0, h);

    // Faint dashed lane guides help judge lateral position at a glance.
    [0.335, 0.665].forEach((u) => {
      for (let y = 0; y < h; y += 68) wobbleBar(w * u, w * 0.02, opts.lane, y, y + 36);
    });

    // Bold centre dashes.
    for (let y = 0; y < h; y += 100) wobbleBar(w * 0.482, w * 0.036, opts.center, y, y + 58);

    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
  }

  /** Vertical gradient sky, drawn into a dome. */
  function skyTexture(top, mid, bottom) {
    const c = document.createElement('canvas');
    c.width = 8; c.height = 256;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0.0, top);
    grad.addColorStop(0.58, mid);
    grad.addColorStop(1.0, bottom);
    g.fillStyle = grad;
    g.fillRect(0, 0, 8, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /* ── Materials ────────────────────────────────────────────────────────── */

  const matCache = {};

  /** The workhorse: flat-shaded, papery, no shine. */
  function paper(color, opts) {
    opts = opts || {};
    const key = color + '|' + JSON.stringify(opts);
    if (matCache[key]) return matCache[key];
    const m = new THREE.MeshStandardMaterial({
      color: color,
      map: opts.noMap ? null : paperTexture(),
      roughness: opts.roughness === undefined ? 0.92 : opts.roughness,
      metalness: 0,
      flatShading: opts.flat === undefined ? true : opts.flat,
      side: opts.side || THREE.FrontSide,
      transparent: !!opts.transparent,
      opacity: opts.opacity === undefined ? 1 : opts.opacity,
      emissive: opts.emissive === undefined ? 0x000000 : opts.emissive,
      emissiveIntensity: opts.emissiveIntensity === undefined ? 1 : opts.emissiveIntensity
    });
    matCache[key] = m;
    return m;
  }

  /** Self-lit material for anything that should glow. */
  function glow(color, intensity) {
    return paper(color, {
      emissive: color,
      emissiveIntensity: intensity === undefined ? 0.9 : intensity,
      roughness: 0.55,
      noMap: true
    });
  }

  const INK = 0x2f231a;

  function outline(mesh, color, angle) {
    try {
      const edges = new THREE.EdgesGeometry(mesh.geometry, angle === undefined ? 26 : angle);
      const line = new THREE.LineSegments(
        edges,
        new THREE.LineBasicMaterial({ color: color === undefined ? INK : color })
      );
      line.raycast = function () {};
      mesh.add(line);
      return line;
    } catch (e) {
      return null;
    }
  }

  /** Outline every mesh in a group — used on gameplay-critical props only. */
  function ink(group, color) {
    group.traverse((o) => { if (o.isMesh) outline(o, color); });
    return group;
  }

  function part(geo, mat, opts) {
    opts = opts || {};
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = opts.cast !== false;
    m.receiveShadow = !!opts.receive;
    if (opts.outline) outline(m, opts.outlineColor, opts.outlineAngle);
    if (opts.pos) m.position.set(opts.pos[0], opts.pos[1], opts.pos[2]);
    if (opts.rot) m.rotation.set(opts.rot[0], opts.rot[1], opts.rot[2]);
    if (opts.scale) {
      if (typeof opts.scale === 'number') m.scale.setScalar(opts.scale);
      else m.scale.set(opts.scale[0], opts.scale[1], opts.scale[2]);
    }
    return m;
  }

  function setShadow(root, cast, receive) {
    root.traverse((o) => {
      if (o.isMesh) { o.castShadow = cast; o.receiveShadow = receive; }
    });
    return root;
  }

  /* ── Sky furniture ────────────────────────────────────────────────────── */

  /** Flat paper sun with cut-out rays. The world billboards it at the camera. */
  function paperSun(coreColor, rayColor) {
    const g = new THREE.Group();
    const core = new THREE.Mesh(
      new THREE.CircleGeometry(18, 24),
      new THREE.MeshBasicMaterial({ color: coreColor, fog: false })
    );
    g.add(core);
    const rayMat = new THREE.MeshBasicMaterial({ color: rayColor, fog: false });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const ray = new THREE.Mesh(new THREE.CircleGeometry(5.5, 3), rayMat);
      ray.position.set(Math.cos(a) * 23, Math.sin(a) * 23, -0.4);
      ray.rotation.z = a - Math.PI / 2;
      g.add(ray);
    }
    g.renderOrder = -8;
    return g;
  }

  /**
   * Chunky stacked-lobe cloud. Smooth spheres rather than icosahedra — faceted
   * lobes read as rubble against a blue sky, which is the opposite of the
   * soft, cut-out feel we want up there.
   */
  function cloud(r) {
    const g = new THREE.Group();
    const white = paper(0xfffefb, { roughness: 1, flat: false, noMap: true });
    const n = r.int(4, 6);
    let x = 0;
    for (let i = 0; i < n; i++) {
      const rad = r.range(4.2, 7.0) * (1 - Math.abs(i - (n - 1) / 2) / (n * 1.5));
      g.add(part(new THREE.SphereGeometry(rad, 12, 9), white, {
        pos: [x, r.range(-0.4, 0.8), r.range(-1.2, 1.2)],
        scale: [1, r.range(0.62, 0.8), 1],
        cast: false
      }));
      x += rad * r.range(1.0, 1.35);
    }
    g.position.x = -x / 2;
    const wrap = new THREE.Group();
    wrap.add(g);
    return wrap;
  }

  /** Big soft shapes along the horizon so the world doesn't end at the fog. */
  function hillBackdrop(r, colors) {
    const g = new THREE.Group();
    const rad = r.range(45, 90);
    g.add(part(new THREE.SphereGeometry(rad, 9, 5, 0, Math.PI * 2, 0, Math.PI / 2), paper(r.pick(colors)), {
      pos: [0, -rad * r.range(0.35, 0.55), 0],
      scale: [r.range(1.2, 2.2), r.range(0.3, 0.5), 1],
      cast: false
    }));
    g.userData.embed = true;
    return g;
  }

  /* ── Scenery: countryside ─────────────────────────────────────────────── */

  const GREENS = [0x5fbf4a, 0x4ba83c, 0x76cf55, 0x3f9a49, 0x93d959];
  const TRUNKS = [0xa06a43, 0x8d5a37, 0xb47c4f];

  function pineTree(r) {
    const g = new THREE.Group();
    const trunkH = r.range(1.8, 2.8);
    g.add(part(new THREE.CylinderGeometry(0.32, 0.46, trunkH, 6), paper(r.pick(TRUNKS)), {
      pos: [0, trunkH / 2, 0]
    }));
    const green = r.pick(GREENS);
    let y = trunkH * 0.8;
    const tiers = r.int(3, 4);
    for (let i = 0; i < tiers; i++) {
      const rad = r.range(2.3, 2.9) * (1 - i * 0.20);
      const hgt = r.range(2.2, 3.0) * (1 - i * 0.10);
      g.add(part(new THREE.ConeGeometry(rad, hgt, 7), paper(green), { pos: [0, y + hgt / 2, 0] }));
      y += hgt * 0.52;
    }
    return g;
  }

  function roundTree(r) {
    const g = new THREE.Group();
    const trunkH = r.range(2.0, 3.2);
    g.add(part(new THREE.CylinderGeometry(0.34, 0.5, trunkH, 6), paper(r.pick(TRUNKS)), {
      pos: [0, trunkH / 2, 0]
    }));
    const green = r.pick(GREENS);
    const rad = r.range(2.1, 3.0);
    g.add(part(new THREE.IcosahedronGeometry(rad, 0), paper(green), {
      pos: [0, trunkH + rad * 0.55, 0],
      scale: [1, r.range(0.85, 1.1), 1]
    }));
    g.add(part(new THREE.IcosahedronGeometry(rad * 0.66, 0), paper(green), {
      pos: [r.range(-1.1, 1.1), trunkH + rad * 1.05, r.range(-0.8, 0.8)]
    }));
    // A few paper fruit dots for colour.
    if (r.chance(0.35)) {
      const fruit = paper(r.pick([0xe63946, 0xffb703, 0xf77f00]));
      for (let i = 0; i < 4; i++) {
        const a = r.range(0, 6.28), rr = rad * 0.85;
        g.add(part(new THREE.IcosahedronGeometry(0.24, 0), fruit, {
          pos: [Math.cos(a) * rr, trunkH + rad * r.range(0.4, 0.9), Math.sin(a) * rr], cast: false
        }));
      }
    }
    return g;
  }

  function bush(r) {
    const g = new THREE.Group();
    const green = r.pick(GREENS);
    for (let i = 0; i < 3; i++) {
      const rad = r.range(0.6, 1.2);
      g.add(part(new THREE.IcosahedronGeometry(rad, 0), paper(green), {
        pos: [r.range(-0.8, 0.8), rad * 0.8, r.range(-0.8, 0.8)]
      }));
    }
    return g;
  }

  /** Low colour pops scattered over the grass. */
  function flowerPatch(r) {
    const g = new THREE.Group();
    const col = r.pick([0xffd166, 0xf7a1c4, 0xfdf6e3, 0xb388eb, 0xff8fab]);
    const n = r.int(5, 9);
    for (let i = 0; i < n; i++) {
      const x = r.range(-1.8, 1.8), z = r.range(-1.8, 1.8);
      const h = r.range(0.4, 0.75);
      g.add(part(new THREE.CylinderGeometry(0.04, 0.05, h, 4), paper(0x4ba83c), {
        pos: [x, h / 2, z], cast: false
      }));
      g.add(part(new THREE.IcosahedronGeometry(0.2, 0), paper(col), { pos: [x, h + 0.12, z], cast: false }));
    }
    return g;
  }

  function barn(r) {
    const g = new THREE.Group();
    const w = r.range(6, 8), h = r.range(3.8, 5.0), d = r.range(7, 9);
    const red = r.pick([0xd94436, 0xc0392b, 0xe8543f]);
    g.add(part(new THREE.BoxGeometry(w, h, d), paper(red), { pos: [0, h / 2, 0] }));

    // Gable roof from a 3-sided prism. CylinderGeometry puts its first vertex
    // at +Z, which lands pointing straight *down* once the prism is laid on its
    // side — hence thetaStart = PI to swing the apex upright. The transforms are
    // baked into the geometry rather than set as Euler angles, because with the
    // default XYZ order the Z spin is applied before the X tilt and ends up
    // rotating about the wrong axis entirely.
    const rr = w * 0.62;          // base half-width 0.54w, so it overhangs a little
    const pitch = 0.45;
    const roofGeo = new THREE.CylinderGeometry(rr, rr, d * 1.04, 3, 1, false, Math.PI);
    roofGeo.rotateX(Math.PI / 2); // ridge runs front-to-back
    roofGeo.scale(1, pitch, 1);   // flatten to a barn-ish slope
    g.add(part(roofGeo, paper(0xfdf6e3), { pos: [0, h + 0.5 * rr * pitch, 0] }));
    g.add(part(new THREE.BoxGeometry(w * 0.32, h * 0.6, 0.2), paper(0xfdf6e3), {
      pos: [0, h * 0.3, d / 2 + 0.11]
    }));
    // Cross-braces on the door — instantly reads as "barn".
    g.add(part(new THREE.BoxGeometry(w * 0.34, 0.22, 0.1), paper(red), {
      pos: [0, h * 0.3, d / 2 + 0.23], rot: [0, 0, 0.6]
    }));
    return g;
  }

  function silo(r) {
    const g = new THREE.Group();
    const h = r.range(7, 10), rad = r.range(1.4, 1.9);
    g.add(part(new THREE.CylinderGeometry(rad, rad, h, 10), paper(0xe8e0cd), { pos: [0, h / 2, 0] }));
    g.add(part(new THREE.SphereGeometry(rad, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), paper(0x8ecae6), {
      pos: [0, h, 0]
    }));
    return g;
  }

  function hayBale(r) {
    const rad = r.range(0.9, 1.3);
    const g = new THREE.Group();
    g.add(part(new THREE.CylinderGeometry(rad, rad, rad * 1.8, 9), paper(0xf2c14e), {
      pos: [0, rad, 0], rot: [0, 0, Math.PI / 2]
    }));
    return g;
  }

  function fence(r) {
    const g = new THREE.Group();
    const wood = paper(0xc08552);
    for (let i = 0; i < 4; i++) {
      g.add(part(new THREE.BoxGeometry(0.24, 1.6, 0.24), wood, { pos: [i * 2.3, 0.8, 0] }));
    }
    g.add(part(new THREE.BoxGeometry(7.6, 0.2, 0.15), wood, { pos: [3.45, 1.22, 0] }));
    g.add(part(new THREE.BoxGeometry(7.6, 0.2, 0.15), wood, { pos: [3.45, 0.7, 0] }));
    return g;
  }

  function windmill(r) {
    const g = new THREE.Group();
    const h = r.range(8, 10);
    g.add(part(new THREE.CylinderGeometry(0.8, 1.7, h, 8), paper(0xf0e6cd), { pos: [0, h / 2, 0] }));
    g.add(part(new THREE.ConeGeometry(1.8, 1.8, 8), paper(0xd94436), { pos: [0, h + 0.9, 0] }));
    const hub = new THREE.Group();
    hub.position.set(0, h * 0.84, 1.7);
    for (let i = 0; i < 4; i++) {
      const arm = new THREE.Group();
      arm.rotation.z = (i * Math.PI) / 2;
      arm.add(part(new THREE.BoxGeometry(0.6, 4.6, 0.14), paper(0xfdf6e3), { pos: [0, 2.3, 0] }));
      hub.add(arm);
    }
    hub.userData.spin = r.range(0.5, 1.1);
    g.add(hub);
    g.userData.spinner = hub;
    return g;
  }

  function hill(r) {
    const rad = r.range(11, 24);
    const g = new THREE.Group();
    g.add(part(new THREE.SphereGeometry(rad, 9, 5, 0, Math.PI * 2, 0, Math.PI / 2), paper(r.pick(GREENS)), {
      pos: [0, -rad * r.range(0.25, 0.5), 0],
      scale: [1, r.range(0.35, 0.6), 1],
      cast: false, receive: true
    }));
    g.userData.embed = true;
    return g;
  }

  /* ── Scenery: desert ──────────────────────────────────────────────────── */

  const CACTI = [0x5f9e46, 0x4d8a3a, 0x74b357];
  const ROCKS = [0xc38a63, 0xb0744f, 0xd9a077, 0x9c6247];

  function cactus(r) {
    const g = new THREE.Group();
    const col = r.pick(CACTI);
    const h = r.range(3.6, 6.0);
    g.add(part(new THREE.CylinderGeometry(0.62, 0.74, h, 9), paper(col), { pos: [0, h / 2, 0] }));
    const arms = r.int(1, 2);
    for (let i = 0; i < arms; i++) {
      const side = i === 0 ? -1 : 1;
      const ah = r.range(1.4, 2.3);
      const y = r.range(h * 0.42, h * 0.66);
      g.add(part(new THREE.CylinderGeometry(0.38, 0.42, 1.7, 8), paper(col), {
        pos: [side * 0.82, y, 0], rot: [0, 0, side * Math.PI / 2]
      }));
      g.add(part(new THREE.CylinderGeometry(0.38, 0.42, ah, 8), paper(col), {
        pos: [side * 1.6, y + ah / 2, 0]
      }));
      g.add(part(new THREE.SphereGeometry(0.38, 8, 5), paper(col), { pos: [side * 1.6, y + ah, 0] }));
    }
    g.add(part(new THREE.SphereGeometry(0.62, 9, 5), paper(col), { pos: [0, h, 0] }));
    if (r.chance(0.4)) {
      g.add(part(new THREE.IcosahedronGeometry(0.3, 0), paper(0xff8fab), { pos: [0, h + 0.5, 0] }));
    }
    return g;
  }

  function barrelCactus(r) {
    const rad = r.range(0.8, 1.3);
    const g = new THREE.Group();
    g.add(part(new THREE.SphereGeometry(rad, 10, 6), paper(r.pick(CACTI)), {
      pos: [0, rad * 0.85, 0], scale: [1, r.range(0.8, 1.15), 1]
    }));
    if (r.chance(0.6)) {
      g.add(part(new THREE.ConeGeometry(rad * 0.35, rad * 0.55, 6), paper(0xff8fab), {
        pos: [0, rad * 1.75, 0]
      }));
    }
    return g;
  }

  function mesa(r) {
    const g = new THREE.Group();
    const h = r.range(14, 30);
    const rad = r.range(10, 20);
    const base = r.pick(ROCKS);
    g.add(part(new THREE.CylinderGeometry(rad * 0.84, rad, h, r.int(7, 9)), paper(base), {
      pos: [0, h / 2, 0], cast: false, receive: true
    }));
    // Strata bands — the classic layered-butte read.
    g.add(part(new THREE.CylinderGeometry(rad * 0.9, rad * 0.95, h * 0.12, 8), paper(0xe0a878), {
      pos: [0, h * 0.40, 0], cast: false
    }));
    g.add(part(new THREE.CylinderGeometry(rad * 0.86, rad * 0.9, h * 0.08, 8), paper(0xa8623f), {
      pos: [0, h * 0.62, 0], cast: false
    }));
    g.userData.embed = true;
    return g;
  }

  function rock(r) {
    const rad = r.range(1.0, 2.8);
    const g = new THREE.Group();
    g.add(part(new THREE.IcosahedronGeometry(rad, 0), paper(r.pick(ROCKS)), {
      pos: [0, rad * 0.55, 0],
      scale: [1, r.range(0.55, 0.9), r.range(0.8, 1.2)],
      rot: [r.range(0, 1), r.range(0, 6), r.range(0, 1)]
    }));
    return g;
  }

  /**
   * A tangle of twigs rather than a solid lump — as a shaded ball it just read
   * as a rock that had come loose and rolled off.
   *
   * The rolling part is a child centred on the group origin, so world.update
   * can spin it in place. Spinning the group itself would swing the ball around
   * a pivot at ground level and bury half of it in the sand.
   */
  function tumbleweed(r) {
    const rad = r.range(0.75, 1.15);
    const g = new THREE.Group();
    const ball = new THREE.Group();

    const twig = new THREE.MeshBasicMaterial({ color: 0x8a6642 });
    // Open lattice of crossing rings.
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(rad * r.range(0.8, 1.0), rad * 0.05, 4, 9), twig);
      ring.rotation.set(r.range(0, 3.14), r.range(0, 3.14), r.range(0, 3.14));
      ball.add(ring);
    }
    // Wire overlay for the scratchy dried-out silhouette.
    const wire = new THREE.LineSegments(
      new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(rad, 1)),
      new THREE.LineBasicMaterial({ color: 0xa9835c })
    );
    wire.raycast = function () {};
    ball.add(wire);

    g.add(ball);
    g.userData.rollMesh = ball;
    g.userData.roll = r.range(1.5, 3.0);
    return g;
  }

  function desertSign(r) {
    const g = new THREE.Group();
    g.add(part(new THREE.BoxGeometry(0.2, 3.4, 0.2), paper(0x8d5a37), { pos: [0, 1.7, 0] }));
    g.add(part(new THREE.BoxGeometry(3.0, 1.3, 0.14), paper(0xf2c14e), { pos: [0, 3.2, 0] }));
    g.add(part(new THREE.BoxGeometry(2.4, 0.18, 0.05), paper(0x8d5a37), { pos: [0, 3.4, 0.1] }));
    g.add(part(new THREE.BoxGeometry(1.8, 0.18, 0.05), paper(0x8d5a37), { pos: [-0.2, 3.0, 0.1] }));
    return g;
  }

  /* ── Scenery: space ───────────────────────────────────────────────────── */

  function asteroid(r) {
    const rad = r.range(1.4, 4.0);
    const g = new THREE.Group();
    g.add(part(new THREE.IcosahedronGeometry(rad, 0), paper(r.pick([0x7d7490, 0x655c78, 0x8f86a3])), {
      scale: [1, r.range(0.7, 1.1), r.range(0.75, 1.15)],
      rot: [r.range(0, 6), r.range(0, 6), r.range(0, 6)]
    }));
    g.userData.tumble = [r.range(-0.4, 0.4), r.range(-0.4, 0.4), r.range(-0.4, 0.4)];
    return g;
  }

  function planet(r) {
    const g = new THREE.Group();
    const rad = r.range(11, 26);
    const col = r.pick([0xe76f51, 0xf4a261, 0x8ecae6, 0xb388eb, 0x76c893, 0xff8fab]);
    g.add(part(new THREE.IcosahedronGeometry(rad, 1), paper(col, { emissive: col, emissiveIntensity: 0.2 }), {
      cast: false
    }));
    // A lighter cap reads as an ice pole and breaks up the ball.
    g.add(part(new THREE.SphereGeometry(rad * 1.01, 10, 6, 0, Math.PI * 2, 0, 0.5), paper(0xfdf6e3, {
      emissive: 0xfdf6e3, emissiveIntensity: 0.15
    }), { cast: false }));
    if (r.chance(0.6)) {
      g.add(part(new THREE.TorusGeometry(rad * 1.6, rad * 0.07, 6, 28), paper(0xffd166, {
        emissive: 0xffd166, emissiveIntensity: 0.3
      }), { rot: [Math.PI / 2 + r.range(-0.35, 0.35), 0, r.range(-0.4, 0.4)], cast: false }));
    }
    return g;
  }

  function crystalSpire(r) {
    const g = new THREE.Group();
    const col = r.pick([0x8ecae6, 0xb388eb, 0x9be7c4, 0xff8fab]);
    const h = r.range(3.5, 8);
    g.add(part(new THREE.ConeGeometry(r.range(0.6, 1.2), h, 5), glow(col, 0.6), { pos: [0, h / 2, 0] }));
    g.add(part(new THREE.ConeGeometry(r.range(0.3, 0.6), h * 0.5, 5), glow(col, 0.6), {
      pos: [r.range(-0.9, 0.9), h * 0.25, r.range(-0.9, 0.9)]
    }));
    return g;
  }

  function satellite(r) {
    const g = new THREE.Group();
    g.add(part(new THREE.BoxGeometry(1.6, 1.2, 1.2), paper(0xe8e0cd), {}));
    const panel = paper(0x3d5a80, { emissive: 0x2b3f5c, emissiveIntensity: 0.5 });
    g.add(part(new THREE.BoxGeometry(3.6, 0.1, 1.6), panel, { pos: [2.7, 0, 0] }));
    g.add(part(new THREE.BoxGeometry(3.6, 0.1, 1.6), panel, { pos: [-2.7, 0, 0] }));
    g.add(part(new THREE.SphereGeometry(0.55, 9, 6, 0, Math.PI * 2, 0, Math.PI / 2), paper(0xfdf6e3), {
      pos: [0, 0.6, 0]
    }));
    g.userData.tumble = [0, r.range(0.2, 0.5), 0];
    return g;
  }

  /* ── Obstacles ────────────────────────────────────────────────────────── */

  function trafficCone() {
    const g = new THREE.Group();
    g.add(part(new THREE.BoxGeometry(1.6, 0.2, 1.6), paper(0x2f231a), { pos: [0, 0.1, 0] }));
    g.add(part(new THREE.ConeGeometry(0.72, 2.1, 8), paper(0xf4581f), { pos: [0, 1.2, 0], outline: true }));
    g.add(part(new THREE.CylinderGeometry(0.48, 0.56, 0.3, 8), paper(0xfdf6e3), { pos: [0, 1.15, 0] }));
    return g;
  }

  function barrier() {
    const g = new THREE.Group();
    g.add(part(new THREE.BoxGeometry(3.6, 1.3, 0.55), paper(0xfdf6e3), { pos: [0, 1.0, 0], outline: true }));
    for (let i = -1; i <= 1; i++) {
      g.add(part(new THREE.BoxGeometry(0.9, 1.3, 0.6), paper(0xf4581f), { pos: [i * 1.2, 1.0, 0] }));
    }
    g.add(part(new THREE.BoxGeometry(0.34, 1.0, 0.34), paper(0x6b6478), { pos: [-1.5, 0.5, 0] }));
    g.add(part(new THREE.BoxGeometry(0.34, 1.0, 0.34), paper(0x6b6478), { pos: [1.5, 0.5, 0] }));
    return g;
  }

  function boulder(r) {
    const g = new THREE.Group();
    const rad = 1.6;
    g.add(part(new THREE.IcosahedronGeometry(rad, 0), paper(0x9c6247), {
      pos: [0, rad * 0.85, 0], scale: [1.1, 0.95, 1],
      rot: [0.3, r ? r.range(0, 6) : 1.1, 0.2], outline: true
    }));
    return g;
  }

  function obstacleCactus() {
    const g = new THREE.Group();
    g.add(part(new THREE.CylinderGeometry(0.6, 0.78, 3.6, 9), paper(0x5f9e46), { pos: [0, 1.8, 0], outline: true }));
    g.add(part(new THREE.CylinderGeometry(0.34, 0.38, 1.5, 8), paper(0x5f9e46), {
      pos: [-0.85, 2.2, 0], rot: [0, 0, Math.PI / 2]
    }));
    g.add(part(new THREE.CylinderGeometry(0.34, 0.38, 1.4, 8), paper(0x5f9e46), { pos: [-1.55, 2.85, 0] }));
    g.add(part(new THREE.SphereGeometry(0.6, 9, 5), paper(0x5f9e46), { pos: [0, 3.6, 0] }));
    return g;
  }

  function spaceMine() {
    const g = new THREE.Group();
    g.add(part(new THREE.IcosahedronGeometry(1.25, 0), paper(0x6b6478), { pos: [0, 1.5, 0], outline: true }));
    const spike = glow(0xf4581f, 0.9);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      g.add(part(new THREE.ConeGeometry(0.25, 1.0, 5), spike, {
        pos: [Math.cos(a) * 1.4, 1.5, Math.sin(a) * 1.4],
        rot: [Math.PI / 2, 0, -a]
      }));
    }
    g.userData.tumble = [0.4, 0.7, 0.2];
    return g;
  }

  function debrisChunk() {
    const g = new THREE.Group();
    g.add(part(new THREE.OctahedronGeometry(1.5, 0), paper(0x655c78), {
      pos: [0, 1.5, 0], scale: [1.2, 0.9, 1], outline: true
    }));
    g.userData.tumble = [0.25, 0.35, 0.15];
    return g;
  }

  /* ── Collectibles & power-ups ─────────────────────────────────────────── */

  function balloon(r) {
    const g = new THREE.Group();
    const cols = [0xe63946, 0xffd166, 0x8ecae6, 0xb388eb, 0x9be7c4, 0xff8fab];
    for (let i = 0; i < 3; i++) {
      const col = r ? r.pick(cols) : cols[i];
      const ox = (i - 1) * 0.85, oz = (i % 2) * 0.4;
      g.add(part(new THREE.SphereGeometry(0.8, 11, 9), glow(col, 0.3), {
        pos: [ox, 2.9 + (i % 2) * 0.4, oz], scale: [1, 1.22, 1], outline: true, outlineAngle: 45
      }));
      g.add(part(new THREE.ConeGeometry(0.18, 0.32, 6), paper(col), {
        pos: [ox, 2.1 + (i % 2) * 0.4, oz], rot: [Math.PI, 0, 0]
      }));
      g.add(part(new THREE.CylinderGeometry(0.03, 0.03, 1.9, 4), paper(0xfdf6e3), {
        pos: [ox * 0.5, 1.15, oz * 0.5], rot: [0, 0, ox * 0.12]
      }));
    }
    return g;
  }

  function flower(r) {
    const g = new THREE.Group();
    const petalCol = (r ? r.pick([0xe63946, 0xffd166, 0xff8fab, 0xb388eb, 0xfdf6e3]) : 0xff8fab);
    g.add(part(new THREE.CylinderGeometry(0.08, 0.1, 2.2, 5), paper(0x4ba83c), { pos: [0, 1.1, 0] }));
    g.add(part(new THREE.SphereGeometry(0.32, 9, 7), glow(0xffd166, 0.5), { pos: [0, 2.35, 0], outline: true }));
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      g.add(part(new THREE.SphereGeometry(0.4, 8, 6), glow(petalCol, 0.3), {
        pos: [Math.cos(a) * 0.55, 2.35, Math.sin(a) * 0.55], scale: [1, 0.32, 1]
      }));
    }
    g.add(part(new THREE.SphereGeometry(0.26, 7, 5), paper(0x4ba83c), {
      pos: [0.35, 1.3, 0], scale: [1.7, 0.3, 0.9]
    }));
    g.add(part(new THREE.SphereGeometry(0.26, 7, 5), paper(0x4ba83c), {
      pos: [-0.35, 0.9, 0], scale: [1.7, 0.3, 0.9]
    }));
    return g;
  }

  function artifact(r) {
    const g = new THREE.Group();
    const col = (r ? r.pick([0x8ecae6, 0xb388eb, 0x9be7c4, 0xffd166]) : 0x8ecae6);
    g.add(part(new THREE.OctahedronGeometry(0.95, 0), glow(col, 0.9), {
      pos: [0, 2.5, 0], scale: [1, 1.5, 1], outline: true, outlineAngle: 40
    }));
    g.add(part(new THREE.TorusGeometry(1.35, 0.08, 5, 20), glow(0xffd166, 0.8), {
      pos: [0, 2.5, 0], rot: [Math.PI / 2, 0, 0]
    }));
    g.add(part(new THREE.TorusGeometry(1.15, 0.06, 5, 20), glow(0xfdf6e3, 0.8), {
      pos: [0, 2.5, 0], rot: [Math.PI / 2.4, 0.5, 0]
    }));
    return g;
  }

  /**
   * Marker that makes a casual collectible findable from far down the road.
   * The item itself is only a metre or so across, which is nearly invisible at
   * a hundred metres, so a stack of big arrows rains down onto it. They spin
   * as they fall so they never present edge-on, and they are unlit and outlined
   * so they stay legible against a bright sky or pale sand alike.
   */
  function itemBeacon(color) {
    const g = new THREE.Group();
    const d = { arrows: [] };

    // Unlit so they stay bright against any sky, and ink-outlined so they read
    // against pale ground too. No depth write, so they never z-fight the item.
    d.mat = new THREE.MeshBasicMaterial({
      color: color, transparent: true, opacity: 0.95, depthWrite: false
    });

    // Plain triangles pointing straight down — just scaled up from the small
    // chevrons they replace. No shaft, no column: the shape reads instantly.
    const headGeo = new THREE.ConeGeometry(1.25, 1.9, 4);
    headGeo.rotateX(Math.PI);                       // tip downward

    // A tapered stack: biggest up top where it is seen first, each one below
    // half the size of the one above. Heights are spaced so no arrow overlaps
    // its neighbour or the pickup sitting underneath them.
    const STACK = [
      { y: 14.0, scale: 1.5 },
      { y: 10.8, scale: 0.75 },
      { y: 8.6, scale: 0.375 }
    ];
    for (let i = 0; i < STACK.length; i++) {
      const arrow = new THREE.Mesh(headGeo, d.mat);
      outline(arrow, INK, 40);
      arrow.position.y = STACK[i].y;
      arrow.scale.setScalar(STACK[i].scale);
      arrow.userData.baseY = STACK[i].y;
      arrow.userData.phase = i * 0.6;
      g.add(arrow);
      d.arrows.push(arrow);
    }

    g.userData = d;
    return g;
  }

  function updateItemBeacon(b, t) {
    const d = b.userData;
    for (let i = 0; i < d.arrows.length; i++) {
      const a = d.arrows[i];
      // Gentle staggered bob keeps them alive without disturbing the taper.
      a.position.y = a.userData.baseY + Math.sin(t * 2.2 + a.userData.phase) * 0.45;
      a.rotation.y = t * 1.1;                       // spin so they never read edge-on
    }
    d.mat.opacity = 0.72 + 0.28 * (0.5 + 0.5 * Math.sin(t * 3));
  }

  /** Floating badge used by every power-up, colour-coded per kind. */
  function powerup(kind) {
    const spec = {
      boost:  { col: 0xffd166 },
      shield: { col: 0x8ecae6 },
      magnet: { col: 0xf4581f }
    }[kind] || { col: 0xffd166 };

    const g = new THREE.Group();
    g.add(part(new THREE.IcosahedronGeometry(1.35, 0), paper(spec.col, {
      emissive: spec.col, emissiveIntensity: 0.6, transparent: true, opacity: 0.42, noMap: true
    }), { pos: [0, 2.4, 0], cast: false, outline: true, outlineColor: spec.col }));

    if (kind === 'boost') {
      for (let i = 0; i < 2; i++) {
        g.add(part(new THREE.ConeGeometry(0.5, 0.62, 3), glow(0xfffdf7, 1.2), {
          pos: [0, 2.1 + i * 0.6, 0], rot: [Math.PI / 2, 0, 0]
        }));
      }
    } else if (kind === 'shield') {
      g.add(part(new THREE.SphereGeometry(0.66, 10, 8), glow(0xfffdf7, 1.0), { pos: [0, 2.4, 0] }));
    } else {
      g.add(part(new THREE.TorusGeometry(0.55, 0.18, 6, 16, Math.PI), glow(0xfffdf7, 1.1), { pos: [0, 2.3, 0] }));
      g.add(part(new THREE.BoxGeometry(0.2, 0.35, 0.2), glow(0xfffdf7, 1.1), { pos: [-0.55, 2.1, 0] }));
      g.add(part(new THREE.BoxGeometry(0.2, 0.35, 0.2), glow(0xfffdf7, 1.1), { pos: [0.55, 2.1, 0] }));
    }
    g.userData.spin = 1.4;
    return g;
  }

  function stuntRing() {
    const g = new THREE.Group();
    g.add(part(new THREE.TorusGeometry(5.0, 0.5, 8, 28), glow(0xffd166, 1.0), { pos: [0, 5.4, 0], cast: false }));
    g.add(part(new THREE.TorusGeometry(4.3, 0.16, 6, 26), glow(0xfffdf7, 1.2), { pos: [0, 5.4, 0], cast: false }));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      g.add(part(new THREE.ConeGeometry(0.34, 0.9, 4), glow(0xf4581f, 1.0), {
        pos: [Math.cos(a) * 5.75, 5.4 + Math.sin(a) * 5.75, 0],
        rot: [0, 0, -a - Math.PI / 2], cast: false
      }));
    }
    g.userData.spin = 0.6;
    return g;
  }

  function finishArch() {
    const g = new THREE.Group();
    const post = paper(0xfdf6e3);
    g.add(part(new THREE.BoxGeometry(1.1, 10, 1.1), post, { pos: [-11.5, 5, 0] }));
    g.add(part(new THREE.BoxGeometry(1.1, 10, 1.1), post, { pos: [11.5, 5, 0] }));
    g.add(part(new THREE.BoxGeometry(24, 2.6, 0.7), paper(0xd94436), { pos: [0, 10.4, 0] }));

    const light = paper(0xfdf6e3), dark = paper(0x2f231a);
    for (let i = 0; i < 22; i++) {
      for (let j = 0; j < 2; j++) {
        g.add(part(new THREE.BoxGeometry(1.1, 1.1, 0.15), ((i + j) % 2 === 0) ? light : dark, {
          pos: [-11.55 + i * 1.1, 9.5 + j * 1.1, 0.45], cast: false
        }));
      }
    }
    // Bunting flags across the top for a party feel.
    const flagCols = [0xffd166, 0x8ecae6, 0xff8fab, 0x9be7c4];
    for (let i = 0; i < 16; i++) {
      g.add(part(new THREE.ConeGeometry(0.42, 1.1, 3), paper(flagCols[i % flagCols.length]), {
        pos: [-11 + i * 1.47, 11.4, 0], rot: [Math.PI, 0, 0], cast: false
      }));
    }
    return g;
  }

  function checkerStrip(width) {
    const g = new THREE.Group();
    const cols = 18, rows = 2;
    const cw = width / cols, ch = 1.6;
    const light = paper(0xfdf6e3), dark = paper(0x2f231a);
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        g.add(part(new THREE.BoxGeometry(cw, 0.09, ch), ((i + j) % 2 === 0) ? light : dark, {
          pos: [-width / 2 + cw * (i + 0.5), 0.07, (j - 0.5) * ch],
          cast: false, receive: true
        }));
      }
    }
    return g;
  }

  /* ── Vehicles ─────────────────────────────────────────────────────────── */

  /**
   * All three face -Z (the direction of travel) with their wheels on y = 0, so
   * the game can drop them straight onto a track frame. Proportions are
   * deliberately toy-like: short, wide and tall-cabined.
   */

  function wheelMat() { return paper(0x2f231a, { roughness: 1 }); }

  function makeWheel(radius, width, hubColor) {
    const w = part(new THREE.CylinderGeometry(radius, radius, width, 12), wheelMat(), {
      rot: [0, 0, Math.PI / 2], outline: true, outlineAngle: 50
    });
    w.add(part(new THREE.CylinderGeometry(radius * 0.46, radius * 0.46, width * 1.06, 8), paper(hubColor || 0xfdf6e3), {}));
    return w;
  }

  /**
   * A limb that actually spans two points. Posing arms by eye with a position
   * and an Euler angle leaves hands floating near — but not on — whatever they
   * are supposed to be holding, so build them from the joint positions instead.
   */
  function limb(from, to, thickness, mat) {
    const a = new THREE.Vector3(from[0], from[1], from[2]);
    const b = new THREE.Vector3(to[0], to[1], to[2]);
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    const m = new THREE.Mesh(new THREE.BoxGeometry(thickness, len, thickness), mat);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    m.castShadow = true;
    return m;
  }

  function driver(helmetCol, skinCol) {
    const g = new THREE.Group();
    g.add(part(new THREE.SphereGeometry(0.46, 12, 9), paper(skinCol || 0xe8b48b), { pos: [0, 0, 0] }));
    g.add(part(new THREE.SphereGeometry(0.52, 12, 9, 0, Math.PI * 2, 0, Math.PI * 0.62), paper(helmetCol), {
      pos: [0, 0.06, 0], outline: true, outlineAngle: 60
    }));
    // Visor.
    g.add(part(new THREE.BoxGeometry(0.62, 0.24, 0.4), paper(0x3d5a80, {
      emissive: 0x27405e, emissiveIntensity: 0.4
    }), { pos: [0, 0.02, -0.3] }));
    return g;
  }

  /**
   * Read from behind, which is the only angle that matters for a chase camera:
   * one solid body colour, a narrower cabin so the rear deck shows, and the
   * wing lifted clear of the roof so the two never merge into one slab.
   */
  function car(bodyCol, accentCol, variant) {
    variant = variant || 0;
    const g = new THREE.Group();
    const body = paper(bodyCol);
    const accent = paper(accentCol || 0xfdf6e3);
    const trim = paper(0x2f231a);

    // Hull.
    g.add(part(new THREE.BoxGeometry(3.2, 1.25, 5.2), body, { pos: [0, 1.05, 0], outline: true }));
    g.add(part(new THREE.BoxGeometry(2.8, 0.8, 1.6), body, { pos: [0, 0.9, -3.0], outline: true }));
    // Dark side skirts read as shadow and separate body from wheels.
    g.add(part(new THREE.BoxGeometry(3.34, 0.34, 4.2), trim, { pos: [0, 0.5, 0.1] }));

    // Cabin — body-coloured and narrower than the hull.
    g.add(part(new THREE.BoxGeometry(2.1, 1.05, 2.3), body, { pos: [0, 2.15, 0.45], outline: true }));
    g.add(part(new THREE.BoxGeometry(2.2, 0.16, 2.4), accent, { pos: [0, 2.74, 0.45] }));
    const glass = paper(0x2c4a6e, { emissive: 0x1d3352, emissiveIntensity: 0.35 });
    g.add(part(new THREE.BoxGeometry(1.9, 0.6, 0.16), glass, { pos: [0, 2.24, -0.72] }));
    g.add(part(new THREE.BoxGeometry(1.9, 0.6, 0.16), glass, { pos: [0, 2.24, 1.62] }));
    g.add(part(new THREE.BoxGeometry(0.16, 0.6, 1.9), glass, { pos: [-1.06, 2.24, 0.45] }));
    g.add(part(new THREE.BoxGeometry(0.16, 0.6, 1.9), glass, { pos: [1.06, 2.24, 0.45] }));

    // No driver figure: the car is a closed cockpit, and a head poking through
    // the roof read as a glitch rather than a character.

    // Cream racing stripes down the spine — the classic toy-car read.
    g.add(part(new THREE.BoxGeometry(0.36, 0.1, 5.24), accent, { pos: [-0.42, 1.69, 0], cast: false }));
    g.add(part(new THREE.BoxGeometry(0.36, 0.1, 5.24), accent, { pos: [0.42, 1.69, 0], cast: false }));

    // Rear wing: body-coloured and set back behind the cabin, so from the chase
    // camera it never merges with the cream roof into one anonymous slab.
    if (variant !== 1) {
      const wingY = variant === 2 ? 3.5 : 3.15;
      g.add(part(new THREE.BoxGeometry(2.9, 0.24, 0.85), body, { pos: [0, wingY, 3.05], outline: true }));
      g.add(part(new THREE.BoxGeometry(0.22, wingY - 2.25, 0.9), accent, { pos: [-1.5, wingY - 0.4, 3.05] }));
      g.add(part(new THREE.BoxGeometry(0.22, wingY - 2.25, 0.9), accent, { pos: [1.5, wingY - 0.4, 3.05] }));
    }
    // Per-variant bodywork so a pack of rivals doesn't read as four clones.
    if (variant === 1) {
      // Hot rod: roof scoop, no wing.
      g.add(part(new THREE.BoxGeometry(1.1, 0.5, 1.3), accent, { pos: [0, 2.95, -0.2], outline: true }));
    } else if (variant === 3) {
      // Rally: roof light bar.
      g.add(part(new THREE.BoxGeometry(2.0, 0.3, 0.35), paper(0x2f231a), { pos: [0, 2.95, -0.7] }));
      for (let i = -1; i <= 1; i++) {
        g.add(part(new THREE.SphereGeometry(0.17, 8, 6), glow(0xfff3c4, 1.3), { pos: [i * 0.62, 2.95, -0.88] }));
      }
    }

    // Lights.
    g.add(part(new THREE.SphereGeometry(0.3, 9, 7), glow(0xfff3c4, 1.3), { pos: [-0.95, 1.15, -3.7] }));
    g.add(part(new THREE.SphereGeometry(0.3, 9, 7), glow(0xfff3c4, 1.3), { pos: [0.95, 1.15, -3.7] }));
    g.add(part(new THREE.BoxGeometry(0.7, 0.34, 0.16), glow(0xff3b30, 1.1), { pos: [-1.05, 1.4, 2.62] }));
    g.add(part(new THREE.BoxGeometry(0.7, 0.34, 0.16), glow(0xff3b30, 1.1), { pos: [1.05, 1.4, 2.62] }));

    // Exhausts.
    [-0.55, 0.55].forEach((x) => {
      g.add(part(new THREE.CylinderGeometry(0.2, 0.22, 0.5, 8), paper(0x9aa5a8), {
        pos: [x, 0.72, 2.75], rot: [Math.PI / 2, 0, 0]
      }));
    });

    const wheels = [];
    [[-1.72, -1.8], [1.72, -1.8], [-1.72, 1.9], [1.72, 1.9]].forEach((p) => {
      const w = makeWheel(0.92, 0.68, accentCol || 0xfdf6e3);
      w.position.set(p[0], 0.92, p[1]);
      g.add(w);
      wheels.push(w);
    });
    g.userData.wheels = wheels;
    g.userData.kind = 'car';
    return g;
  }

  function motorcycle(bodyCol, accentCol, variant) {
    variant = variant || 0;
    const g = new THREE.Group();
    const body = paper(bodyCol);
    const accent = paper(accentCol || 0xfdf6e3);

    g.add(part(new THREE.BoxGeometry(0.85, 0.8, 3.2), body, { pos: [0, 1.3, 0], outline: true }));
    g.add(part(new THREE.CylinderGeometry(0.5, 0.36, 1.5, 7), body, {
      pos: [0, 1.55, -1.7], rot: [Math.PI / 2.4, 0, 0]
    }));
    g.add(part(new THREE.BoxGeometry(1.0, 0.5, 1.3), accent, { pos: [0, 1.8, 0.2], outline: true }));
    g.add(part(new THREE.BoxGeometry(1.9, 0.14, 0.14), paper(0x2f231a), { pos: [0, 2.0, -1.2] }));
    g.add(part(new THREE.SphereGeometry(0.3, 9, 7), glow(0xfff3c4, 1.3), { pos: [0, 1.7, -2.2] }));
    g.add(part(new THREE.CylinderGeometry(0.18, 0.24, 1.1, 8), paper(0x9aa5a8), {
      pos: [0.4, 0.95, 1.7], rot: [Math.PI / 2, 0, 0]
    }));

    const wheels = [];
    [-1.95, 1.75].forEach((z) => {
      const w = makeWheel(0.95, 0.4, accentCol || 0xfdf6e3);
      w.position.set(0, 0.95, z);
      g.add(w);
      wheels.push(w);
    });
    g.userData.wheels = wheels;

    // Rider, scaled up so they read from the chase camera.
    const rider = new THREE.Group();
    const jacket = paper(accentCol || 0xe63946);
    rider.add(part(new THREE.BoxGeometry(1.05, 1.3, 0.8), jacket, { pos: [0, 2.65, 0.25], outline: true }));
    // Bright helmet, deliberately not the body or jacket colour, so the rider
    // stays legible against the bike at chase-camera distance.
    const d = driver(0x3d5a80);
    d.position.set(0, 3.6, 0.05);
    d.scale.setScalar(1.15);
    rider.add(d);
    // Arms run shoulder → grip, so the hands sit on the handlebar (which spans
    // x = ±0.95 at y 2.0, z -1.2) instead of waving in the air behind it.
    const arm = paper(accentCol || 0xe63946);
    const glove = paper(0x2f231a);
    [-1, 1].forEach((side) => {
      rider.add(limb([side * 0.48, 3.02, 0.12], [side * 0.92, 2.06, -1.12], 0.28, arm));
      rider.add(part(new THREE.BoxGeometry(0.34, 0.3, 0.42), glove, { pos: [side * 0.94, 2.03, -1.16] }));
    });

    // Legs run hip → footrest for the same reason.
    const leg = paper(0x3d5a80);
    const boot = paper(0x2f231a);
    [-1, 1].forEach((side) => {
      rider.add(limb([side * 0.42, 2.15, 0.42], [side * 0.6, 1.05, 0.82], 0.36, leg));
      rider.add(part(new THREE.BoxGeometry(0.36, 0.26, 0.6), boot, { pos: [side * 0.6, 0.92, 0.72] }));
    });
    g.add(rider);
    g.userData.rider = rider;
    g.userData.kind = 'motorcycle';
    return g;
  }

  /** Flat wing: a 4-sided pyramid squashed thin and laid on its side. */
  function wingGeo(len, span, dir) {
    const geo = new THREE.ConeGeometry(span, len, 4);
    geo.scale(0.16, 1, 1);
    geo.rotateZ(dir * -Math.PI / 2);
    geo.translate(dir * len / 2, 0, 0);
    return geo;
  }

  function spaceship(bodyCol, accentCol, variant) {
    variant = variant || 0;
    const g = new THREE.Group();
    const body = paper(bodyCol);
    const accent = paper(accentCol || 0xfdf6e3);

    // Fuselage: cone nose (rotateX -90° points +Y down the -Z travel axis).
    g.add(part(new THREE.ConeGeometry(1.25, 4.0, 8), body, {
      pos: [0, 1.9, -2.2], rot: [-Math.PI / 2, 0, 0], outline: true
    }));
    g.add(part(new THREE.CylinderGeometry(1.25, 1.15, 3.4, 8), body, {
      pos: [0, 1.9, 1.4], rot: [Math.PI / 2, 0, 0], outline: true
    }));
    g.add(part(new THREE.CylinderGeometry(1.15, 1.35, 0.9, 8), accent, {
      pos: [0, 1.9, 3.2], rot: [Math.PI / 2, 0, 0]
    }));

    // Wings.
    const wl = new THREE.Mesh(wingGeo(3.4, 1.7, -1), accent);
    wl.position.set(-1.0, 1.6, 1.3); wl.castShadow = true; outline(wl); g.add(wl);
    const wr = new THREE.Mesh(wingGeo(3.4, 1.7, 1), accent);
    wr.position.set(1.0, 1.6, 1.3); wr.castShadow = true; outline(wr); g.add(wr);

    // Tail fin.
    const fin = new THREE.Mesh(new THREE.ConeGeometry(1.3, 2.2, 4), accent);
    fin.geometry.scale(0.16, 1, 1);
    fin.geometry.rotateY(Math.PI / 2);
    fin.position.set(0, 3.0, 2.4);
    fin.castShadow = true; outline(fin); g.add(fin);

    // Bubble canopy + pilot.
    g.add(part(new THREE.SphereGeometry(0.9, 12, 9, 0, Math.PI * 2, 0, Math.PI / 2), paper(0x8ecae6, {
      emissive: 0x4a7fa5, emissiveIntensity: 0.55, transparent: true, opacity: 0.8
    }), { pos: [0, 2.7, 0.1] }));
    const d = driver(accentCol || 0xfdf6e3);
    d.position.set(0, 2.85, 0.1);
    d.scale.setScalar(0.8);
    g.add(d);

    const thrusters = [];
    [-0.68, 0.68].forEach((x) => {
      g.add(part(new THREE.CylinderGeometry(0.46, 0.55, 0.8, 8), paper(0x655c78), {
        pos: [x, 1.9, 3.7], rot: [Math.PI / 2, 0, 0]
      }));
      const flame = part(new THREE.ConeGeometry(0.4, 2.0, 7), glow(0x8ecae6, 1.5), {
        pos: [x, 1.9, 4.8], rot: [-Math.PI / 2, 0, 0], cast: false
      });
      g.add(flame);
      thrusters.push(flame);
    });
    g.userData.thrusters = thrusters;
    g.userData.kind = 'spaceship';
    g.userData.wheels = [];
    return g;
  }

  /** @param {number} [variant] 0 = the player's hero build, 1-3 = rival bodywork. */
  function buildVehicle(kind, bodyCol, accentCol, variant) {
    if (kind === 'motorcycle') return motorcycle(bodyCol, accentCol, variant);
    if (kind === 'spaceship') return spaceship(bodyCol, accentCol, variant);
    return car(bodyCol, accentCol, variant);
  }

  /* ── Vehicle power-up effects ─────────────────────────────────────────── */

  /**
   * The rig that shows an active power-up on the vehicle. Built once per run and
   * driven by updateVehicleFx; every piece starts hidden.
   *
   * It deliberately lives *beside* the vehicle rather than parented to it, so
   * the crash-invulnerability blink (which toggles the vehicle's visibility)
   * can't strobe the shield bubble along with it.
   */
  function vehicleFx() {
    const g = new THREE.Group();
    const d = {};

    /* Shield — a faceted paper bubble. */
    d.shieldMat = new THREE.MeshStandardMaterial({
      color: 0x8ecae6, emissive: 0x8ecae6, emissiveIntensity: 0.9,
      transparent: true, opacity: 0.24, flatShading: true,
      roughness: 0.35, metalness: 0, side: THREE.DoubleSide, depthWrite: false
    });
    d.shield = new THREE.Mesh(new THREE.IcosahedronGeometry(3.3, 1), d.shieldMat);
    d.shield.position.y = 1.7;
    d.shield.visible = false;
    g.add(d.shield);

    /* Boost — trailing flames plus chevrons streaking past. */
    d.boost = new THREE.Group();
    d.boost.visible = false;
    d.flames = [];
    const flameMat = new THREE.MeshBasicMaterial({
      color: 0xffd166, transparent: true, opacity: 0.9, depthWrite: false
    });
    d.flameMat = flameMat;
    [-1.0, 0, 1.0].forEach((x, i) => {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.5, 2.6, 6), flameMat);
      f.position.set(x, 1.0, 3.4 + (i === 1 ? 0.5 : 0));
      f.rotation.x = -Math.PI / 2;   // point backwards, away from travel
      d.boost.add(f);
      d.flames.push(f);
    });
    d.streaks = [];
    const streakMat = new THREE.MeshBasicMaterial({
      color: 0xfffdf7, transparent: true, opacity: 0.65,
      depthWrite: false, side: THREE.DoubleSide
    });
    d.streakMat = streakMat;
    for (let i = 0; i < 8; i++) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 4.5), streakMat);
      s.userData.seed = i / 8;
      d.boost.add(s);
      d.streaks.push(s);
    }
    g.add(d.boost);

    /* Magnet — counter-rotating rings drawing everything in. */
    d.magnet = new THREE.Group();
    d.magnet.visible = false;
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xf4581f, transparent: true, opacity: 0.75, depthWrite: false
    });
    d.magnetMat = ringMat;
    d.rings = [];
    [[3.3, 0.14], [2.5, 0.11]].forEach((spec, i) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(spec[0], spec[1], 6, 22), ringMat);
      ring.position.y = 1.7;
      ring.rotation.x = Math.PI / 2 + (i ? 0.5 : -0.4);
      d.magnet.add(ring);
      d.rings.push(ring);
    });
    g.add(d.magnet);

    g.userData = d;
    return g;
  }

  /**
   * @param {object} state { shield, boost, magnet } remaining seconds each.
   * @param {number} t     seconds, for the wobbles.
   */
  function updateVehicleFx(fx, state, dt, t) {
    const d = fx.userData;

    /* Shield */
    d.shield.visible = state.shield > 0;
    if (d.shield.visible) {
      d.shield.rotation.y += dt * 0.9;
      d.shield.rotation.x = Math.sin(t * 0.8) * 0.16;
      d.shield.scale.setScalar(1 + Math.sin(t * 4.5) * 0.045);
      // Flicker out over the last second and a half so it telegraphs expiry.
      d.shieldMat.opacity = state.shield < 1.5
        ? 0.24 * (0.3 + 0.7 * Math.abs(Math.sin(state.shield * 11)))
        : 0.24;
    }

    /* Boost */
    d.boost.visible = state.boost > 0;
    if (d.boost.visible) {
      const flick = 0.75 + Math.abs(Math.sin(t * 26)) * 0.5;
      for (let i = 0; i < d.flames.length; i++) {
        d.flames[i].scale.set(1, flick * (i === 1 ? 1.25 : 1), 1);
      }
      d.flameMat.opacity = 0.65 + Math.abs(Math.sin(t * 18)) * 0.3;
      d.flameMat.color.setHSL(0.09 + Math.sin(t * 12) * 0.03, 1, 0.6);

      // Streaks fly past the vehicle on a loop to sell the speed.
      for (let i = 0; i < d.streaks.length; i++) {
        const s = d.streaks[i];
        const p = ((t * 2.2 + s.userData.seed) % 1);
        const side = (i % 2 === 0) ? -1 : 1;
        s.position.set(side * (2.2 + (i % 4) * 0.55), 0.6 + (i % 3) * 1.1, -10 + p * 22);
        s.scale.y = 0.5 + p * 1.2;
      }
      d.streakMat.opacity = 0.5;
    }

    /* Magnet */
    d.magnet.visible = state.magnet > 0;
    if (d.magnet.visible) {
      d.rings[0].rotation.z += dt * 2.2;
      d.rings[1].rotation.z -= dt * 3.0;
      const pulse = 1 + Math.sin(t * 6) * 0.07;
      d.rings[0].scale.setScalar(pulse);
      d.rings[1].scale.setScalar(2 - pulse);
      d.magnetMat.opacity = state.magnet < 1.5
        ? 0.75 * (0.3 + 0.7 * Math.abs(Math.sin(state.magnet * 11)))
        : 0.75;
    }
  }

  /* ── Particles ────────────────────────────────────────────────────────── */

  /** Confetti-ish paper flecks reused for pickups, crashes and stunts. */
  function burst(color, count) {
    const g = new THREE.Group();
    const geo = new THREE.PlaneGeometry(0.42, 0.42);
    const mat = new THREE.MeshBasicMaterial({
      color: color, side: THREE.DoubleSide, transparent: true
    });
    const bits = [];
    for (let i = 0; i < (count || 16); i++) {
      const m = new THREE.Mesh(geo, mat);
      const a = Math.random() * Math.PI * 2;
      const up = 4 + Math.random() * 7;
      const sp = 3 + Math.random() * 9;
      m.userData.vel = new THREE.Vector3(Math.cos(a) * sp, up, Math.sin(a) * sp);
      m.userData.spin = new THREE.Vector3(
        (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14
      );
      g.add(m);
      bits.push(m);
    }
    g.userData.bits = bits;
    g.userData.life = 0;
    g.userData.maxLife = 1.2;
    g.userData.mat = mat;
    return g;
  }

  function updateBurst(g, dt) {
    g.userData.life += dt;
    const t = g.userData.life / g.userData.maxLife;
    if (t >= 1) return false;
    g.userData.mat.opacity = 1 - t;
    g.userData.bits.forEach((m) => {
      m.userData.vel.y -= 22 * dt;
      m.position.addScaledVector(m.userData.vel, dt);
      m.rotation.x += m.userData.spin.x * dt;
      m.rotation.y += m.userData.spin.y * dt;
      m.rotation.z += m.userData.spin.z * dt;
    });
    return true;
  }

  return {
    paperTexture, roadTexture, skyTexture,
    paper, glow, outline, ink, part, setShadow, INK,
    // sky
    paperSun, cloud, hillBackdrop,
    // countryside
    pineTree, roundTree, bush, flowerPatch, barn, silo, hayBale, fence, windmill, hill,
    // desert
    cactus, barrelCactus, mesa, rock, tumbleweed, desertSign,
    // space
    asteroid, planet, crystalSpire, satellite,
    // gameplay props
    trafficCone, barrier, boulder, obstacleCactus, spaceMine, debrisChunk,
    balloon, flower, artifact, powerup, itemBeacon, updateItemBeacon,
    stuntRing, finishArch, checkerStrip,
    // vehicles + fx
    buildVehicle, limb, vehicleFx, updateVehicleFx, burst, updateBurst
  };
})();
