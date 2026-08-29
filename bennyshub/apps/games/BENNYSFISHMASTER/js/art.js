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
    // `noInk` opts a mesh out. A lofted hull has an edge at every station, and
    // outlining them all turns the boat into a wire cage when seen end-on.
    group.traverse((o) => { if (o.isMesh && !o.userData.noInk) outline(o, color); });
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

  /**
   * The optional star hidden in every Race level. Deliberately a different
   * shape language from the power-up badges — a real five-pointed star rather
   * than a glowing sphere — so it reads as "a thing to collect" at a glance.
   */
  function star() {
    const g = new THREE.Group();
    const shape = new THREE.Shape();
    const points = 5, outer = 1.25, inner = 0.55;
    for (let i = 0; i < points * 2; i++) {
      const rad = (i % 2 === 0) ? outer : inner;
      const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
      const x = Math.cos(a) * rad, y = Math.sin(a) * rad;
      if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
    }
    shape.closePath();

    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.4, bevelEnabled: false });
    geo.center();
    g.add(part(geo, glow(0xffd400, 0.9), { pos: [0, 2.8, 0], outline: true, outlineAngle: 40 }));

    // A faint halo so it still catches the eye from a long way back.
    g.add(part(new THREE.TorusGeometry(1.75, 0.09, 6, 20), glow(0xfff3b0, 0.8), {
      pos: [0, 2.8, 0], cast: false
    }));
    return g;
  }

  /** Floating badge used by every power-up, colour-coded per kind. */
  function powerup(kind) {
    const spec = {
      boost:  { col: 0xffd166 },
      shield: { col: 0x8ecae6 },
      magnet: { col: 0xf4581f },
      heart:  { col: 0xff3b6b }
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
    } else if (kind === 'heart') {
      // Two lobes and a point — reads as a heart even at a glance and at speed.
      const lobe = glow(0xff5c86, 1.0);
      g.add(part(new THREE.SphereGeometry(0.36, 10, 8), lobe, { pos: [-0.27, 2.62, 0] }));
      g.add(part(new THREE.SphereGeometry(0.36, 10, 8), lobe, { pos: [0.27, 2.62, 0] }));
      g.add(part(new THREE.ConeGeometry(0.56, 0.95, 8), lobe, {
        pos: [0, 2.05, 0], rot: [Math.PI, 0, 0]
      }));
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


  /* ══════════════════════════════════════════════════════════════════════
     FISHMASTER — lake, boat, dock, rod, zone rings
     Everything here is generated at runtime. The only asset files in this
     game are the catch-card PNGs. (§10.1)
     ══════════════════════════════════════════════════════════════════════ */

  /**
   * The water's surface wash: a paper-grain tile with a few soft glints, meant
   * to be scrolled rather than simulated. No reflections, no transparency
   * stack — Race Tracks' Deep Space map already establishes that a surface
   * here can be suggested rather than simulated.
   */
  let WATERTEX = null;
  function waterTexture(flat) {
    if (WATERTEX) return WATERTEX;
    const size = 256;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const r = U.rng(4242);

    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, size, size);

    if (!flat) {
      // Long horizontal fibres read as the drag of a current across paper.
      for (let i = 0; i < 900; i++) {
        const y = r.range(0, size), x = r.range(0, size), len = r.range(8, 34);
        g.strokeStyle = r.chance(0.5) ? 'rgba(120,140,150,0.10)' : 'rgba(255,255,255,0.75)';
        g.lineWidth = r.range(0.6, 1.8);
        g.beginPath();
        g.moveTo(x, y);
        g.quadraticCurveTo(x + len * 0.5, y + r.range(-2, 2), x + len, y);
        g.stroke();
      }
      // A scattering of cut-paper glints.
      for (let i = 0; i < 60; i++) {
        g.fillStyle = 'rgba(255,255,255,0.55)';
        const x = r.range(0, size), y = r.range(0, size), w = r.range(3, 11);
        g.beginPath();
        g.ellipse(x, y, w, w * 0.28, r.range(-0.3, 0.3), 0, Math.PI * 2);
        g.fill();
      }
    }

    WATERTEX = new THREE.CanvasTexture(c);
    WATERTEX.wrapS = WATERTEX.wrapT = THREE.RepeatWrapping;
    WATERTEX.colorSpace = THREE.SRGBColorSpace;
    WATERTEX.anisotropy = 4;
    return WATERTEX;
  }

  /* ── Hull lofting ──────────────────────────────────────────────────────────
   * The hull is one shape described by a handful of stations (cross-sections
   * down its length), and every surface — the paint bands, the bottom, the
   * gunwale — is swept from that same table.
   *
   * The previous pass stacked three separately-tapered boxes on top of each
   * other. Their fore and aft heights were hand-tuned and did not agree, so
   * every seam zigzagged; and a straight taper from transom to stem narrowed
   * the middle of the boat so hard that the benches poked out through the
   * sides. Sharing one station table makes mismatched seams impossible.
   * ────────────────────────────────────────────────────────────────────────── */

  /** Transom (+Z) to stem (-Z). `hw` is half-beam at the sheer. */
  const HULL_STATIONS = [
    { z:  3.90, hw: 2.28, y0: 0.10, y1: 2.02 },
    { z:  2.20, hw: 2.32, y0: 0.02, y1: 2.04 },
    { z:  0.40, hw: 2.24, y0: 0.06, y1: 2.10 },
    { z: -1.40, hw: 1.98, y0: 0.20, y1: 2.22 },
    { z: -2.70, hw: 1.44, y0: 0.44, y1: 2.40 },
    { z: -3.60, hw: 0.72, y0: 0.72, y1: 2.56 },
    { z: -4.05, hw: 0.16, y0: 0.96, y1: 2.66 }
  ];

  /** Height at fraction `f` of a station: 0 is the keel, 1 the sheer. */
  function stationY(st, f) { return st.y0 + f * (st.y1 - st.y0); }
  /** Half-beam at that height — narrower low down, which is the deadrise. */
  function stationHW(st, f) { return st.hw * (0.54 + 0.46 * f); }

  function geoFrom(pos, idx) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const uv = [];
    for (let i = 0; i < pos.length; i += 3) uv.push((pos[i] + 5) * 0.1, (pos[i + 2] + 5) * 0.1);
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  /** A painted band down both flanks, between two height fractions. */
  function hullBand(sts, f0, f1) {
    const pos = [], idx = [];
    let v = 0;
    for (const side of [-1, 1]) {
      for (let i = 0; i < sts.length - 1; i++) {
        const a = sts[i], b = sts[i + 1];
        const quad = [
          [side * stationHW(a, f0), stationY(a, f0), a.z],
          [side * stationHW(b, f0), stationY(b, f0), b.z],
          [side * stationHW(b, f1), stationY(b, f1), b.z],
          [side * stationHW(a, f1), stationY(a, f1), a.z]
        ];
        for (const q of quad) pos.push(q[0], q[1], q[2]);
        // Winding flips with the side, or one flank faces inward and vanishes.
        if (side > 0) idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
        else          idx.push(v, v + 2, v + 1, v, v + 3, v + 2);
        v += 4;
      }
    }
    return geoFrom(pos, idx);
  }

  /** The bottom, closing the hull across the keel. */
  function hullBottom(sts, f) {
    const pos = [], idx = [];
    let v = 0;
    for (let i = 0; i < sts.length - 1; i++) {
      const a = sts[i], b = sts[i + 1];
      const quad = [
        [-stationHW(a, f), stationY(a, f), a.z],
        [-stationHW(b, f), stationY(b, f), b.z],
        [ stationHW(b, f), stationY(b, f), b.z],
        [ stationHW(a, f), stationY(a, f), a.z]
      ];
      for (const q of quad) pos.push(q[0], q[1], q[2]);
      idx.push(v, v + 2, v + 1, v, v + 3, v + 2);
      v += 4;
    }
    return geoFrom(pos, idx);
  }

  /**
   * A solid deck right across the hull at height fraction `f`.
   *
   * The foredeck used to be built by asking hullSheer() for a lip 999 wide and
   * letting it clamp at the centreline. The two halves met there but did not
   * knit, leaving a slot straight down the middle of the bow that you could
   * see the lake through. One surface spanning the full beam cannot have a
   * seam to leak through.
   */
  function hullCap(sts, f) {
    const pos = [], idx = [];
    let v = 0;
    for (let i = 0; i < sts.length - 1; i++) {
      const a = sts[i], b = sts[i + 1];
      const quad = [
        [-stationHW(a, f), stationY(a, f), a.z],
        [-stationHW(b, f), stationY(b, f), b.z],
        [ stationHW(b, f), stationY(b, f), b.z],
        [ stationHW(a, f), stationY(a, f), a.z]
      ];
      for (const q of quad) pos.push(q[0], q[1], q[2]);
      idx.push(v, v + 1, v + 2, v, v + 2, v + 3);   // facing up
      v += 4;
    }
    return geoFrom(pos, idx);
  }

  /** A flat lip running round the sheer, `inset` wide. */
  function hullSheer(sts, inset) {
    const pos = [], idx = [];
    let v = 0;
    for (const side of [-1, 1]) {
      for (let i = 0; i < sts.length - 1; i++) {
        const a = sts[i], b = sts[i + 1];
        const ao = stationHW(a, 1), bo = stationHW(b, 1);
        const quad = [
          [side * ao, stationY(a, 1), a.z],
          [side * bo, stationY(b, 1), b.z],
          [side * Math.max(0, bo - inset), stationY(b, 1), b.z],
          [side * Math.max(0, ao - inset), stationY(a, 1), a.z]
        ];
        for (const q of quad) pos.push(q[0], q[1], q[2]);
        if (side > 0) idx.push(v, v + 2, v + 1, v, v + 3, v + 2);
        else          idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
        v += 4;
      }
    }
    return geoFrom(pos, idx);
  }

  /**
   * A flat face closing one end of the hull.
   *
   * `outward` is +1 for the stern (facing +Z) and -1 for the stem (facing -Z).
   * Only the stern used to get one, which left the bow as an open hole between
   * the two flanks — narrow, but a straight sightline from the helm out to the
   * horizon, which is the "gap I can see water through".
   */
  function hullEndCap(st, outward) {
    const pos = [], idx = [];
    const N = 4;
    let v = 0;
    for (let i = 0; i < N; i++) {
      const f0 = i / N, f1 = (i + 1) / N;
      const quad = [
        [-stationHW(st, f0), stationY(st, f0), st.z],
        [ stationHW(st, f0), stationY(st, f0), st.z],
        [ stationHW(st, f1), stationY(st, f1), st.z],
        [-stationHW(st, f1), stationY(st, f1), st.z]
      ];
      for (const q of quad) pos.push(q[0], q[1], q[2]);
      if (outward > 0) idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
      else             idx.push(v, v + 2, v + 1, v, v + 3, v + 2);
      v += 4;
    }
    return geoFrom(pos, idx);
  }

  /** The station either side of a given z, and how far between them it is. */
  function stationSpan(z) {
    const sts = HULL_STATIONS;
    for (let i = 0; i < sts.length - 1; i++) {
      const a = sts[i], b = sts[i + 1];
      if (z <= a.z && z >= b.z) return { a, b, t: (a.z - z) / (a.z - b.z) };
    }
    return z > sts[0].z ? { a: sts[0], b: sts[0], t: 0 }
                        : { a: sts[sts.length - 1], b: sts[sts.length - 1], t: 0 };
  }

  /**
   * Half-beam at a point INSIDE the hull — at a given z and a given height.
   *
   * Sizing cockpit fittings by the beam at the sheer is what pushed the
   * benches and the sole out through the sides: they sit low, where the hull
   * has drawn in. This asks the hull how wide it actually is where the thing
   * is going.
   */
  function beamAtY(z, y) {
    const sp = stationSpan(z);
    const y0 = U.lerp(sp.a.y0, sp.b.y0, sp.t);
    const y1 = U.lerp(sp.a.y1, sp.b.y1, sp.t);
    const f = U.clamp((y - y0) / Math.max(0.001, y1 - y0), 0, 1);
    return U.lerp(stationHW(sp.a, f), stationHW(sp.b, f), sp.t);
  }

  /** Widest a box spanning z0..z1 at height `y` may be and still fit inside. */
  function fitWidth(z0, z1, y, margin) {
    const m = margin === undefined ? 0.34 : margin;
    const hw = Math.min(beamAtY(z0, y), beamAtY(z1, y), beamAtY((z0 + z1) / 2, y));
    return Math.max(0.7, (hw - m) * 2);
  }

  /**
   * The boat: a white-and-red runabout with an outboard on the transom.
   *
   * Built facing -Z like every other model in the kit, so its yaw is
   * `frame.yaw` and never `frame.heading`. (Trap 1.)
   */
  function boat(colors) {
    const c = colors || {};
    const white = c.hull || 0xf4f1e8;
    const red   = c.hullTrim || 0xd2352b;
    const deck  = c.deck || 0xe4d9c2;
    const dark  = c.dark || 0x33302c;
    const g = new THREE.Group();

    const matWhite = paper(white);
    const matRed   = paper(red);
    const matDeck  = paper(deck);
    const matDark  = paper(dark, { noMap: true });
    /* The hull is an open shell, so from astern you look straight into it and
       the far side's inner faces get culled away — which left the boat reading
       as a transparent wire cage. Painting both faces closes it up. */
    const hullWhite = paper(white, { side: THREE.DoubleSide });
    const hullRed   = paper(red,   { side: THREE.DoubleSide });

    const S = HULL_STATIONS;
    const SHEER = 1.0, STRIPE_LO = 0.40, STRIPE_HI = 0.53;

    /* Topsides, boot stripe and bottom — three bands off one station table, so
       the seams are exact by construction. */
    const hullPieces = [
      part(hullBand(S, STRIPE_HI, SHEER), hullWhite, { receive: true }),
      part(hullBand(S, STRIPE_LO, STRIPE_HI), hullRed, { receive: true }),
      part(hullBand(S, 0, STRIPE_LO), hullWhite, { receive: true }),
      part(hullBottom(S, 0), hullWhite, { cast: false }),
      part(hullEndCap(S[0], 1), hullWhite, { receive: true }),          // stern
      part(hullEndCap(S[S.length - 1], -1), hullWhite, { receive: true }) // stem
    ];
    // The station edges are construction lines, not creases — no ink on them.
    for (const m of hullPieces) { m.userData.noInk = true; g.add(m); }
    // The gunwale IS a real edge, so it keeps its outline and gives the boat
    // its silhouette.
    g.add(part(hullSheer(S, 0.34), matRed, { cast: false }));

    /* A closed bilge floor, just above the waterline.
     *
     * The hull is an open shell and the cockpit sole below is inset well clear
     * of the sides, which leaves a slot down each flank. That was invisible
     * while the boat was parked ABOVE the water — there was nothing down there
     * to see. Now that she actually floats (BOAT_DRAUGHT in game.js) the lake
     * surface passes through the hull, and those slots looked straight down at
     * open water inside the boat.
     *
     * hullBottom() closes it: one surface across the full section, following
     * the hull's own shape, so there is no gap left at any station. At 0.45 it
     * sits above the waterline everywhere and still below the sole, so it is
     * only ever glimpsed edge-on in the slots — as floor, not as lake. */
    g.add(part(hullBottom(S, 0.45), matDeck, { cast: false, receive: true }));

    /* Cockpit sole, inset well clear of the sides. */
    const soleY = 1.14;
    // Runs well forward, UNDER the foredeck, so there is no line of sight
    // between the two.
    const soleZ0 = S[4].z, soleZ1 = 3.2;
    g.add(part(new THREE.BoxGeometry(fitWidth(soleZ0, soleZ1, soleY, 0.30), 0.14,
                                     soleZ1 - soleZ0), matDeck,
               { pos: [0, soleY, (soleZ0 + soleZ1) / 2], receive: true }));

    /* No foredeck. This is an open boat — a motorised canoe — so the bow is
       just the hull coming to a point, and you look straight down into it.
       The cap that used to be here read as a white lid over the front. */

    /* No windscreen: it sat just behind the wheel, cutting the horizon in
       half from the helm. */

    /* ── The helm ──────────────────────────────────────────────────────────
     * A console and a wheel, set just forward of where the player's eye sits,
     * so trolling along you are looking over your own wheel. It turns with the
     * helm, which is the only moving part of the boat you can see from in it —
     * and therefore the thing that tells you the boat is answering.
     */
    const helm = new THREE.Group();
    /* A wheel on a slim pedestal — nothing else. A console slab across the
       cockpit hid the wheel, the windscreen and the bow all at once, which is
       everything there is to look at from the helm. */
    /* The column stops BELOW the wheel, and a short raked shaft carries the
       last of the way up to the hub.

       It used to be a single post 1.02 tall with the wheel hung on the front
       of it at the same z. The wheel is a 0.34 rim tilted back 0.3 radians, so
       its bottom sits about a quarter of a unit below its own hub - which put
       the lower third of the rim inside the post. From the helm you watched
       the wheel saw through its own column every time it turned. */
    const COL_TOP = 0.70;                     // clears the rim's lowest point
    helm.add(part(new THREE.CylinderGeometry(0.10, 0.16, COL_TOP, 8), matDark,
                  { pos: [0, soleY + COL_TOP / 2, -0.88] }));
    helm.add(part(new THREE.CylinderGeometry(0.26, 0.30, 0.10, 10), matDark,
                  { pos: [0, soleY + 0.05, -0.88], cast: false }));
    // The shaft, raked to meet the wheel square on its own axis.
    helm.add(part(new THREE.CylinderGeometry(0.055, 0.068, 0.42, 8), matDark,
                  { pos: [0, soleY + 0.90, -0.85], rot: [0.149, 0, 0], cast: false }));
    // One small dial on the column, and that is the whole dashboard.
    helm.add(part(new THREE.CylinderGeometry(0.10, 0.10, 0.05, 10), matWhite,
                  { pos: [0, soleY + 0.50, -0.76], rot: [Math.PI / 2, 0, 0], cast: false }));

    const wheel = new THREE.Group();
    const rimR = 0.34;
    // A thin rim. The old one had a tube nearly a fifth of its own diameter,
    // which is the proportion of a tyre, not a ship's wheel.
    wheel.add(part(new THREE.TorusGeometry(rimR, 0.033, 6, 22), matDark, { cast: false }));
    // Six slim spokes out to the rim, and a small hub.
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3;
      wheel.add(part(new THREE.BoxGeometry(0.036, rimR - 0.06, 0.036), matDark, {
        pos: [Math.cos(a + Math.PI / 2) * (rimR / 2 - 0.03),
              Math.sin(a + Math.PI / 2) * (rimR / 2 - 0.03), 0],
        rot: [0, 0, a], cast: false
      }));
    }
    wheel.add(part(new THREE.CylinderGeometry(0.085, 0.085, 0.10, 12), matDark,
                   { rot: [Math.PI / 2, 0, 0], cast: false }));
    wheel.add(part(new THREE.CylinderGeometry(0.055, 0.055, 0.12, 10), matWhite,
                   { pos: [0, 0, 0.06], rot: [Math.PI / 2, 0, 0], cast: false }));
    // The turning knob every helm has.
    wheel.add(part(new THREE.SphereGeometry(0.062, 8, 6), matRed,
                   { pos: [0, rimR, 0.05], cast: false }));
    wheel.position.set(0, soleY + 1.10, -0.82);   // and forward of the column
    wheel.rotation.x = -0.30;
    helm.add(wheel);
    g.add(helm);
    g.userData.wheel = wheel;

    /* Benches, each cut to the beam actually available where it sits. */
    const SEAT_TOP = 1.86;
    function bench(z) {
      // Each piece is cut to the beam at ITS OWN z. Sizing the backrest by the
      // seat's z put it through the side, because it sits half a unit further
      // forward where the hull has already narrowed.
      // Measured at the bottom of each piece, which is its widest demand.
      const seatW = fitWidth(z - 0.39, z + 0.39, soleY, 0.30);
      const backZ = z + 0.5;
      const backW = fitWidth(backZ - 0.09, backZ + 0.09, SEAT_TOP, 0.30);
      g.add(part(new THREE.BoxGeometry(seatW, SEAT_TOP - soleY, 0.78), matRed,
                 { pos: [0, (SEAT_TOP + soleY) / 2, z] }));
      g.add(part(new THREE.BoxGeometry(backW, 0.52, 0.18), matRed,
                 { pos: [0, SEAT_TOP + 0.26, backZ] }));
    }
    bench(1.55);   // the helm seat: you sit here, wheel in front of you
    bench(3.05);   // and a spare bench aft

    /* Outboard on the transom: red cowl, dark leg, prop in the water. */
    const motor = new THREE.Group();
    motor.add(part(new THREE.BoxGeometry(0.88, 0.94, 0.80), matRed, { pos: [0, 0.47, 0] }));
    motor.add(part(new THREE.BoxGeometry(0.92, 0.15, 0.84), matDark, { pos: [0, -0.03, 0] }));
    motor.add(part(new THREE.BoxGeometry(0.34, 1.45, 0.34), matDark, { pos: [0, -0.82, 0] }));
    motor.add(part(new THREE.BoxGeometry(0.30, 0.32, 0.96), matDark, { pos: [0, -1.58, 0.12] }));
    motor.add(part(new THREE.CylinderGeometry(0.30, 0.30, 0.07, 10), matWhite,
                   { pos: [0, -1.54, 0.40], rot: [0, 0, Math.PI / 2] }));
    motor.add(part(new THREE.BoxGeometry(0.13, 0.13, 1.10), matDark,
                   { pos: [-0.24, 0.30, -0.66], rot: [0.2, 0.28, 0] }));   // tiller
    motor.position.set(0, 1.55, S[0].z + 0.45);
    g.add(motor);
    g.userData.motor = motor;

    /* The angler, on the helm bench facing the bow. */
    const man = angler(c);
    man.scale.setScalar(1.02);
    man.position.set(0, SEAT_TOP, 1.95);
    g.add(man);
    g.userData.angler = man;

    ink(g);
    setShadow(g, true, false);
    return g;
  }

  /**
   * A seated man. The previous pass read as a scarecrow: a wide flat brim, a
   * featureless capsule body and no arms. What fixes it is a cap instead of a
   * sun hat, real shoulders, and arms that go somewhere — the near one out to
   * the rod.
   */
  function angler(colors, pose) {
    const c = colors || {};
    const skin  = c.angler || 0xe0a878;
    const shirt = c.shirt || 0x2f6690;
    const jeans = c.jeans || 0x3a4a63;
    const cap   = c.cap || 0xd2352b;
    const g = new THREE.Group();

    const matSkin  = paper(skin);
    const matShirt = paper(shirt);
    const matJeans = paper(jeans);

    /* Torso: a box with sloped shoulders on top, rather than a capsule. The
       shoulder block is what stops the silhouette reading as a post. */
    g.add(part(new THREE.BoxGeometry(0.86, 0.92, 0.54), matShirt, { pos: [0, 0.40, 0] }));
    g.add(part(new THREE.BoxGeometry(1.06, 0.30, 0.56), matShirt, { pos: [0, 0.90, 0] }));
    // Collar.
    g.add(part(new THREE.BoxGeometry(0.46, 0.12, 0.46), matShirt, { pos: [0, 1.06, 0] }));

    // Neck + head. A slightly boxy head takes the papercraft lighting better
    // than a sphere and keeps a readable jaw at distance.
    g.add(part(new THREE.CylinderGeometry(0.13, 0.15, 0.16, 8), matSkin, { pos: [0, 1.13, 0] }));
    g.add(part(new THREE.BoxGeometry(0.42, 0.46, 0.40), matSkin, { pos: [0, 1.44, 0] }));
    // Nose, so the head has a facing at a glance.
    g.add(part(new THREE.BoxGeometry(0.10, 0.12, 0.10), matSkin, { pos: [0, 1.42, -0.23] }));
    // Ears.
    for (const x of [-0.22, 0.22]) {
      g.add(part(new THREE.BoxGeometry(0.06, 0.14, 0.10), matSkin, { pos: [x, 1.44, 0.02] }));
    }
    // Stubble/hair at the back and sides, under the cap.
    g.add(part(new THREE.BoxGeometry(0.44, 0.20, 0.42), paper(0x4a3a2c), { pos: [0, 1.56, 0.02] }));

    /* Baseball cap: crown plus a short forward peak. This is the single change
       that stops it reading as a scarecrow — a wide circular brim does not. */
    g.add(part(new THREE.BoxGeometry(0.48, 0.22, 0.46), paper(cap), { pos: [0, 1.74, 0.01] }));
    g.add(part(new THREE.SphereGeometry(0.25, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2),
               paper(cap), { pos: [0, 1.82, 0.01] }));
    g.add(part(new THREE.BoxGeometry(0.44, 0.06, 0.30), paper(cap), { pos: [0, 1.68, -0.30] }));

    /* Arms. The right arm reaches out and up to where the rod is held; the
       left rests on the knee. */
    if (pose === 'counter') {
      // Leaning on a counter: both arms out and down, hands planted level,
      // which is what someone serving you actually looks like.
      for (const side of [-1, 1]) {
        g.add(limb([side * 0.52, 0.86, 0.02], [side * 0.66, 0.46, -0.42], 0.20, matShirt));
        g.add(limb([side * 0.66, 0.46, -0.42], [side * 0.60, 0.30, -0.86], 0.17, matSkin));
        g.add(part(new THREE.BoxGeometry(0.24, 0.14, 0.30), matSkin,
                   { pos: [side * 0.58, 0.24, -0.98] }));
      }
    } else {
      g.add(limb([0.50, 0.86, 0.02], [0.82, 0.62, -0.34], 0.20, matShirt));   // upper R
      g.add(limb([0.82, 0.62, -0.34], [1.02, 0.74, -0.72], 0.17, matSkin));   // fore R
      g.add(part(new THREE.BoxGeometry(0.18, 0.18, 0.18), matSkin, { pos: [1.04, 0.76, -0.78] }));
      g.add(limb([-0.50, 0.86, 0.02], [-0.62, 0.42, -0.30], 0.20, matShirt)); // upper L
      g.add(limb([-0.62, 0.42, -0.30], [-0.56, 0.10, -0.62], 0.17, matSkin)); // fore L
    }

    /* Legs, seated: thigh forward, shin down. */
    for (const x of [-0.26, 0.26]) {
      g.add(limb([x, 0.00, -0.10], [x, -0.06, -0.78], 0.26, matJeans));     // thigh
      g.add(limb([x, -0.06, -0.78], [x, -0.72, -0.86], 0.22, matJeans));    // shin
      g.add(part(new THREE.BoxGeometry(0.26, 0.14, 0.44), paper(0x3a332c),
                 { pos: [x, -0.78, -0.98] }));                              // boot
    }

    // A life vest, because he is a man in a boat.
    g.add(part(new THREE.BoxGeometry(0.94, 0.62, 0.62), paper(0xe8a33d),
               { pos: [0, 0.52, 0] }));

    ink(g);
    setShadow(g, true, false);
    return g;
  }

  /**
   * Dock and shack. Scenery with one interactive thing tied up at it — the
   * boat — so the whole structure is static and merges with everything else.
   */
  function dock(colors) {
    const c = colors || {};
    const g = new THREE.Group();
    const plank = paper(c.dock || 0x7a5a3a);
    const post  = paper(c.dark || 0x5c3a18);

    for (let i = 0; i < 9; i++) {
      g.add(part(new THREE.BoxGeometry(5.4, 0.22, 0.78), plank,
                 { pos: [0, 0, -i * 0.92], receive: true }));
    }
    for (const x of [-2.3, 2.3]) {
      for (const z of [0.2, -3.5, -7.3]) {
        g.add(part(new THREE.BoxGeometry(0.38, 2.4, 0.38), post, { pos: [x, -1.2, z] }));
      }
    }

    // Shack — a box, a pitched roof, a door. Pure scenery.
    const shack = new THREE.Group();
    shack.add(part(new THREE.BoxGeometry(4.6, 3.2, 4.0), paper(c.shack || 0x9c6b45), { pos: [0, 1.6, 0] }));
    shack.add(part(new THREE.ConeGeometry(3.9, 1.7, 4), paper(c.dark || 0x5c3a18),
                   { pos: [0, 4.0, 0], rot: [0, Math.PI / 4, 0] }));
    shack.add(part(new THREE.BoxGeometry(1.1, 2.0, 0.14), paper(c.dark || 0x5c3a18), { pos: [0, 1.0, 2.03] }));
    shack.position.set(0, 0.1, -9.6);
    g.add(shack);

    ink(g);
    setShadow(g, true, true);
    return g;
  }

  /**
   * A fish hook: eye, straight shank, the bend, a point rising back up beside
   * the shank, and a barb on it.
   *
   * It used to be a single arc of torus, which is a hook the way a semicircle
   * is a question mark — the shape that actually reads is the point coming
   * back UP past the shank.
   */
  /**
   * The bait, sitting on the hook.
   *
   * Only the secret bait has artwork, so each one is described in data.js as a
   * shape and two colours and built here out of primitives - which is all a
   * lure is: a body and a highlight. Everything is drawn around the origin so
   * it can be dropped straight onto the hook's bend.
   */
  function baitModel(look, k) {
    const o = look || {};
    k = k || 1;
    const g = new THREE.Group();
    const body = paper(new THREE.Color(o.color || '#c4677a').getHex(), { noMap: true });
    const trim = paper(new THREE.Color(o.color2 || '#8a3a4a').getHex(), { noMap: true });
    const P = (geo, mat, opts) => g.add(part(geo, mat, Object.assign({ cast: false }, opts)));

    switch (o.kind) {
      case 'grub':      // a short fat maggot, curled on the bend
        P(new THREE.CapsuleGeometry(0.055 * k, 0.10 * k, 3, 7), body, { rot: [0, 0, 1.1] });
        P(new THREE.SphereGeometry(0.048 * k, 7, 5), trim, { pos: [0.075 * k, 0.03 * k, 0] });
        break;
      case 'beadrig':   // a bead above a scrap of worm
        P(new THREE.SphereGeometry(0.055 * k, 8, 6), body, { pos: [0, 0.07 * k, 0] });
        P(new THREE.SphereGeometry(0.040 * k, 8, 6), trim, { pos: [0, 0.005 * k, 0] });
        P(new THREE.CapsuleGeometry(0.030 * k, 0.11 * k, 3, 6), trim,
          { pos: [0.02 * k, -0.09 * k, 0], rot: [0, 0, 0.4] });
        break;
      case 'minnow':    // a little baitfish, nose down the shank
        P(new THREE.CapsuleGeometry(0.050 * k, 0.20 * k, 4, 8), body, { rot: [0, 0, Math.PI / 2] });
        P(new THREE.ConeGeometry(0.055 * k, 0.09 * k, 5), trim,
          { pos: [-0.16 * k, 0, 0], rot: [0, 0, Math.PI / 2] });   // tail fin
        P(new THREE.SphereGeometry(0.020 * k, 6, 5), trim, { pos: [0.09 * k, 0.02 * k, 0.035 * k] });
        break;
      case 'plug':      // a fat surface plug with a diving lip
        P(new THREE.CapsuleGeometry(0.070 * k, 0.16 * k, 4, 8), body, { rot: [0, 0, Math.PI / 2] });
        P(new THREE.CylinderGeometry(0.062 * k, 0.062 * k, 0.016 * k, 8), trim,
          { pos: [0.13 * k, -0.03 * k, 0], rot: [0, 0, 0.9] });    // the lip
        P(new THREE.SphereGeometry(0.022 * k, 6, 5), trim, { pos: [0.075 * k, 0.04 * k, 0.05 * k] });
        break;
      case 'spinner':   // a blade that flashes, over a skirt
        P(new THREE.SphereGeometry(0.075 * k, 8, 6), body,
          { pos: [0, 0.10 * k, 0], scale: [1, 1.5, 0.18] });       // the blade
        P(new THREE.ConeGeometry(0.070 * k, 0.17 * k, 7), trim,
          { pos: [0, -0.07 * k, 0], rot: [Math.PI, 0, 0] });       // the skirt
        break;
      case 'leech':     // flat, dark and ribbon-like
        P(new THREE.CapsuleGeometry(0.040 * k, 0.24 * k, 3, 7), body,
          { rot: [0, 0, 1.3], scale: [1, 1, 0.45] });
        P(new THREE.SphereGeometry(0.038 * k, 7, 5), trim, { pos: [0.10 * k, 0.05 * k, 0] });
        break;
      case 'dough':     // a lumpy ball of something unspeakable
        P(new THREE.SphereGeometry(0.090 * k, 7, 5), body);
        P(new THREE.SphereGeometry(0.045 * k, 6, 5), trim, { pos: [0.055 * k, 0.045 * k, 0.02 * k] });
        P(new THREE.SphereGeometry(0.038 * k, 6, 5), trim, { pos: [-0.05 * k, -0.03 * k, 0.03 * k] });
        break;
      case 'jig':       // a lead head with a skirt behind it
        P(new THREE.SphereGeometry(0.070 * k, 8, 6), body, { pos: [0.03 * k, 0.03 * k, 0] });
        P(new THREE.ConeGeometry(0.065 * k, 0.20 * k, 7), trim,
          { pos: [-0.06 * k, -0.05 * k, 0], rot: [0, 0, -0.7] });
        break;
      case 'pill':      // ... a pill
        P(new THREE.CapsuleGeometry(0.055 * k, 0.09 * k, 4, 8), body, { rot: [0, 0, 0.5] });
        P(new THREE.CapsuleGeometry(0.056 * k, 0.03 * k, 4, 8), trim,
          { pos: [0.045 * k, 0.045 * k, 0], rot: [0, 0, 0.5] });
        break;
      default: {
        /* A worm, threaded on and hanging off the bend.
           Two capsules read as a pink blob. A worm is a SEGMENTED thing that
           tapers at both ends and never hangs straight, so this is a run of
           beads down a lazy S: fattest in the middle, pinched to nothing at
           head and tail, with every third one a shade darker to give it the
           banding that says "worm" at a glance. */
        const N = 10;
        for (let i = 0; i < N; i++) {
          const t = i / (N - 1);
          // Threaded ON the hook: about as long as the bend is deep, curled
          // round it, with just the tail end hanging free. A worm draped well
          // past the point looks like it is falling off.
          const r = 0.026 * k * (0.32 + Math.sin(Math.PI * t) * 0.90);
          const x = (0.010 - t * 0.045) * k + Math.sin(t * Math.PI * 1.6) * 0.055 * k;
          const y = (0.075 - t * 0.245) * k;
          P(new THREE.SphereGeometry(r, 6, 5), (i % 3 === 2) ? trim : body,
            { pos: [x, y, Math.sin(t * Math.PI * 1.2) * 0.018 * k] });
        }
        break;
      }
    }
    ink(g);
    return g;
  }

  function fishHook(scale, colors) {
    const c = colors || {};
    const k = scale || 1;
    const g = new THREE.Group();
    const steel = paper(c.hook || 0xb8bcc2, { noMap: true, roughness: 0.45 });

    /* A J, built in the XY plane and hanging from the eye at the origin.
     *
     * The bend used to be a torus with arc = PI and no rotation. THREE starts
     * a torus arc at +X and sweeps it counter-clockwise, so 0..PI is the
     * UPPER half of the circle - the bend curled up over the shank instead of
     * under it, and the hook came out as an upside-down J. Rotating the arc by
     * PI about Z maps it to the lower half, which is where the bottom of a
     * hook actually is.
     */
    const R = 0.055 * k;          // bend radius; the gape is 2R
    const shankY = -0.22 * k;     // where the shank ends and the bend begins

    // Eye, for the line.
    g.add(part(new THREE.TorusGeometry(0.026 * k, 0.007 * k, 4, 10), steel,
               { pos: [0, 0.014 * k, 0], cast: false }));

    // Shank: straight down from under the eye to the top of the bend.
    g.add(part(new THREE.CylinderGeometry(0.0085 * k, 0.0085 * k, 0.22 * k, 5), steel,
               { pos: [0, shankY / 2, 0], cast: false }));

    /* The bend. Centred half a gape out from the shank, so the arc runs from
       the foot of the shank, round the bottom, and back up to the far side. */
    g.add(part(new THREE.TorusGeometry(R, 0.0085 * k, 4, 16, Math.PI), steel,
               { pos: [R, shankY, 0], rot: [0, 0, Math.PI], cast: false }));

    /* The point: a straight spike off the far side of the bend, rising sharply
       and leaning back in toward the shank, tapering to a tip. This is the bit
       that makes it read as a hook rather than a bent wire. */
    const PT = 0.13 * k;
    const lean = 0.22;                        // radians, tipped toward the shank
    g.add(part(new THREE.CylinderGeometry(0.0015 * k, 0.0085 * k, PT, 5), steel,
               { pos: [2 * R - Math.sin(lean) * PT / 2, shankY + Math.cos(lean) * PT / 2, 0],
                 rot: [0, 0, lean], cast: false }));

    // Barb: a small flare just below the tip, pointing back down the point.
    g.add(part(new THREE.ConeGeometry(0.011 * k, 0.028 * k, 4), steel,
               { pos: [2 * R - Math.sin(lean) * PT * 0.72,
                       shankY + Math.cos(lean) * PT * 0.72, 0],
                 rot: [Math.PI, 0, lean - 0.5], cast: false }));
    return g;
  }

  /**
   * A spinning outfit, built along +Y so the whole thing bends about X.
   *
   * Bottom to top: cork butt, reel seat with the reel hanging UNDER the blank
   * where a spinning reel goes, then a tapered blank through a run of guides
   * that get smaller toward the tip. The blank is a chain of pivots so it can
   * curve under load rather than hinge in one place.
   */
  function rodRig(colors) {
    const c = colors || {};
    const g = new THREE.Group();
    /* The rod you are actually holding. `c.rodLook` comes from the equipped
       rod in data.js, whose colours were read off that rod's own artwork - so
       upgrading from the tan cane starter to the blue CastMaster to the slate
       Longshot to the silver Titanium changes the thing in your hands, not
       just the number on the card. The theme colours are the fallback. */
    const L = c.rodLook || {};
    const hex = (v, fb) => (v ? new THREE.Color(v).getHex() : fb);
    const blankMat = paper(hex(L.blank, c.rod || 0x2f2a26), { noMap: true });
    // A cork grip keeps the paper speckle; foam and rubber grips do not.
    const corkMat  = L.grip
      ? paper(hex(L.grip), L.cork ? {} : { noMap: true })
      : paper(c.cork || 0xc9a978);
    const metalMat = paper(hex(L.reel, c.reelBody || 0x8d949c), { noMap: true, roughness: 0.5 });
    const darkMat  = paper(hex(L.wrap, c.dark || 0x33302c), { noMap: true });

    /* ── Butt ──────────────────────────────────────────────────────────── */
    g.add(part(new THREE.CylinderGeometry(0.062, 0.070, 0.46, 8), corkMat, { pos: [0, -0.62, 0] }));
    g.add(part(new THREE.CylinderGeometry(0.058, 0.062, 0.30, 8), darkMat,  { pos: [0, -0.30, 0] }));
    g.add(part(new THREE.CylinderGeometry(0.070, 0.058, 0.34, 8), corkMat,  { pos: [0, -0.02, 0] }));
    g.add(part(new THREE.CylinderGeometry(0.052, 0.052, 0.06, 8), darkMat,  { pos: [0, -0.88, 0] }));

    /* ── The reel, hung below the blank ────────────────────────────────── */
    const reel = new THREE.Group();
    // Stem down from the seat, then the body.
    reel.add(part(new THREE.BoxGeometry(0.07, 0.16, 0.06), darkMat, { pos: [0, -0.09, 0] }));
    reel.add(part(new THREE.SphereGeometry(0.115, 10, 8), metalMat, { pos: [0, -0.24, 0] }));
    // The spool, lying across the rod.
    const spool = part(new THREE.CylinderGeometry(0.125, 0.125, 0.13, 12), metalMat,
                       { pos: [0, -0.05, -0.11], rot: [Math.PI / 2, 0, 0] });
    reel.add(spool);
    reel.add(part(new THREE.CylinderGeometry(0.135, 0.135, 0.02, 12), darkMat,
                  { pos: [0, -0.05, -0.175], rot: [Math.PI / 2, 0, 0], cast: false }));
    // Line roller arm across the face of the spool.
    reel.add(part(new THREE.TorusGeometry(0.135, 0.016, 5, 14, Math.PI), darkMat,
                  { pos: [0, -0.05, -0.11], rot: [0, Math.PI / 2, 0], cast: false }));
    // Handle out to one side.
    reel.add(part(new THREE.CylinderGeometry(0.022, 0.022, 0.20, 6), darkMat,
                  { pos: [-0.14, -0.24, 0], rot: [0, 0, Math.PI / 2] }));
    reel.add(part(new THREE.SphereGeometry(0.045, 8, 6), corkMat, { pos: [-0.25, -0.24, 0] }));
    reel.position.set(0, -0.26, 0);
    g.add(reel);
    g.userData.reel = reel;
    g.userData.spool = spool;

    /* ── Blank: pivots that curve, each with a guide ────────────────────── */
    const SEGS = 7;
    const segs = [];
    let parent = g;
    for (let i = 0; i < SEGS; i++) {
      const pivot = new THREE.Group();
      pivot.position.y = (i === 0) ? 0.16 : 0.44;
      const r0 = 0.040 - i * 0.0042, r1 = 0.040 - (i + 1) * 0.0042;
      pivot.add(part(new THREE.CylinderGeometry(Math.max(0.008, r1), Math.max(0.010, r0), 0.44, 6),
                     blankMat, { pos: [0, 0.22, 0] }));
      // A guide ring, standing off the blank the way a real one does.
      const gr = Math.max(0.028, 0.062 - i * 0.006);
      /* Guides hang UNDER the blank, the same side the spinning reel is on —
         that is what makes it a spinning rod rather than one held upside
         down. Local -Z is the underside once the rod is raked out. */
      const guide = part(new THREE.TorusGeometry(gr, 0.010, 4, 10), darkMat,
                         { pos: [0, 0.34, -gr * 0.75], rot: [Math.PI / 2, 0, 0], cast: false });
      pivot.add(guide);
      pivot.add(part(new THREE.BoxGeometry(0.016, 0.06, 0.016), darkMat,
                     { pos: [0, 0.30, -gr * 0.4], cast: false }));
      parent.add(pivot);
      parent = pivot;
      segs.push(pivot);
    }
    g.userData.segs = segs;
    g.userData.tip = parent;

    /* ── Line and float ────────────────────────────────────────────────── */
    const lineGeo = new THREE.BufferGeometry();
    // Several points so the line can hang rather than being a taut stick.
    lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(10 * 3), 3));
    const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: c.line || 0xf4f4f0 }));
    line.frustumCulled = false;
    g.add(line);
    g.userData.line = line;

    const bob = new THREE.Group();
    /* A float, not a buoy. It was 0.30 across and read as a beach ball on the
       end of the line; this is about a third of that. */
    const R = 0.115;
    bob.add(part(new THREE.SphereGeometry(R, 10, 8), paper(c.bobber || 0xff3b3b)));
    bob.add(part(new THREE.SphereGeometry(R * 1.01, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2),
                 paper(0xf7f2e8)));
    bob.add(part(new THREE.CylinderGeometry(0.012, 0.012, 0.11, 5), paper(0xf7f2e8),
                 { pos: [0, 0.10, 0], cast: false }));
    // A short dropper down to the hook.
    bob.add(part(new THREE.CylinderGeometry(0.005, 0.005, 0.16, 4),
                 paper(c.line || 0xf4f4f0, { noMap: true }),
                 { pos: [0, -0.19, 0], cast: false }));
    const hook = fishHook(0.85, c);
    hook.position.set(0, -0.27, 0);
    bob.add(hook);
    /* Kept so the landing can put it away. A hooked fish hangs from its jaw
       with the hook inside its mouth, and a hook drawn in front of the fish is
       a hook floating in mid-air next to it. */
    g.userData.hook = hook;
    /* And whatever is on it. Sat on the bend of the hook rather than the
       shank, which is where bait actually goes and where it stays visible
       against the water instead of hiding behind the wire. */
    const baitHold = new THREE.Group();
    baitHold.position.set(0.05, -0.47, 0);
    bob.add(baitHold);
    g.userData.baitHold = baitHold;
    // The dropper below the float, hidden with the hook for the same reason.
    g.userData.dropper = bob.children[bob.children.length - 2];
    if (c.baitLook) baitHold.add(baitModel(c.baitLook, 0.85));
    ink(bob);
    g.userData.bobber = bob;

    ink(g);
    setShadow(g, true, false);
    return g;
  }

  const _tipV = new THREE.Vector3();
  const _bobV = new THREE.Vector3();
  const _segQ = new THREE.Quaternion();
  const _up = new THREE.Vector3(0, 1, 0);

  /**
   * Bend the rod under load and run the line from the tip to the bobber.
   *
   * The bend is positive about each segment's own X, which curves the tip
   * DOWN the rod's length — toward the water and the fish. It used to be
   * applied the other way, which arched the rod back over the angler's
   * shoulder as though the fish were behind him.
   *
   * The line is walked as several points with a little sag, and its last point
   * is the bobber's own origin — which is the middle of the float, so the line
   * meets it dead centre instead of clipping past its side.
   */
  function updateRodRig(rig, amount, bobberWorldPos) {
    const segs = rig.userData.segs;
    const per = U.clamp(amount || 0, 0, 1) * 0.34;
    if (segs) {
      // Later segments give more, so the rod curves rather than hinging.
      /* Negative, so the tip curves toward the guides — which are on the
         underside — and therefore DOWN toward the water and the fish. The
         other sign arches the rod back over the angler's shoulder. */
      for (let i = 0; i < segs.length; i++) segs[i].rotation.x = -per * (0.35 + i * 0.24);
    }

    const line = rig.userData.line;
    if (!line || !bobberWorldPos || !segs || !segs.length) return;

    // The true tip: the last segment's own end, wherever the bend has put it.
    const last = segs[segs.length - 1];
    last.updateWorldMatrix(true, false);
    last.getWorldPosition(_tipV);
    last.getWorldQuaternion(_segQ);
    _tipV.addScaledVector(_up.set(0, 1, 0).applyQuaternion(_segQ), 0.62);

    const pos = line.geometry.attributes.position;
    const N = pos.count;
    _bobV.copy(bobberWorldPos);
    const sag = Math.max(0.12, _tipV.distanceTo(_bobV) * 0.045);
    for (let i = 0; i < N; i++) {
      const t = N > 1 ? i / (N - 1) : 0;
      _v3.lerpVectors(_tipV, _bobV, t);
      _v3.y -= Math.sin(t * Math.PI) * sag;      // the belly of the line
      line.worldToLocal(_v3);
      pos.setXYZ(i, _v3.x, _v3.y, _v3.z);
    }
    pos.needsUpdate = true;
    line.geometry.computeBoundingSphere();
  }

  const _v3 = new THREE.Vector3();

  /**
   * Where the cast will land: a small arrow lying on the water with a short
   * pin standing out of it.
   *
   * This replaces a large glowing ring, which covered the very water it was
   * pointing at and read as a piece of scenery rather than a sight.
   */
  function castMarker(color) {
    const g = new THREE.Group();
    const col = color === undefined ? 0xffd400 : color;
    const mat = glow(col, 0.9);

    // A flat chevron on the surface, pointing away from the boat.
    const sh = new THREE.Shape();
    sh.moveTo(0, 1.5);
    sh.lineTo(-1.0, 0.1);
    sh.lineTo(-0.36, 0.1);
    sh.lineTo(-0.36, -1.1);
    sh.lineTo(0.36, -1.1);
    sh.lineTo(0.36, 0.1);
    sh.lineTo(1.0, 0.1);
    sh.closePath();
    const geo = new THREE.ShapeGeometry(sh, 6);
    geo.rotateX(-Math.PI / 2);
    const arrow = new THREE.Mesh(geo, mat);
    arrow.position.y = 0.1;
    g.add(arrow);
    g.userData.arrow = arrow;

    /* No pin. There used to be a post and a ball standing up out of the
       arrow to make it findable on busy water, but the dashed trajectory line
       already leads your eye straight to it - so the pin was a second answer
       to a question that was already answered, sticking up out of the lake. */

    ink(g, INK);
    return g;
  }

  /**
   * A fish zone on the water.
   *
   * Colour is never the only signal (§10.2): a target zone gets a DOUBLED ring
   * and a fish-finder arch standing up out of it; a non-target zone gets a
   * single plain ring. With Direction Help off and no colour at all the shape
   * still says which is which — and the rings are never hidden, because they
   * are the only way to know what a zone holds.
   */
  function zoneRing(isTarget, color, radius, lengthScale) {
    const g = new THREE.Group();
    const r = radius || 15;
    const col = color === undefined ? 0xffb02e : color;
    // A zone is a long stretch of water, not a dot, so the ring is stretched
    // along the route to cover it. Laid flat by rot X, a torus's local Y runs
    // down the track, so scaling Y is what lengthens the patch. The arch is
    // deliberately left unstretched — it is a sonar mark, not the water.
    const ls = lengthScale || 1;

    const ring = part(new THREE.TorusGeometry(r, 0.55, 5, 28), glow(col, 0.5),
                      { pos: [0, 0.18, 0], rot: [-Math.PI / 2, 0, 0], cast: false });
    ring.scale.y = ls;
    g.add(ring);

    if (isTarget) {
      // Doubled outline — the shape difference that survives with no colour.
      const inner = part(new THREE.TorusGeometry(r * 0.78, 0.4, 5, 26), glow(col, 0.5),
                         { pos: [0, 0.18, 0], rot: [-Math.PI / 2, 0, 0], cast: false });
      inner.scale.y = ls;
      g.add(inner);

      // Fish-finder arch: the sonar mark, standing up so it reads from the boat.
      const arch = part(new THREE.TorusGeometry(r * 0.52, 0.42, 5, 20, Math.PI), glow(col, 0.75),
                        { pos: [0, 0.2, 0], cast: false });
      g.add(arch);
      g.userData.arch = arch;
    }

    ink(g, INK);
    g.userData.ring = ring;
    return g;
  }


  /* ══════════════════════════════════════════════════════════════════════
     FISH UNDER THE WATER
     A fishing spot is marked by the fish themselves, not by a ring floating
     on the surface. The water is opaque and the art direction forbids a
     transparency stack, so these are flat silhouettes laid just above the
     surface in a darker shade of the water — which is exactly how a fish
     looks from a boat anyway. Cheap, opaque, and legible at a glance.
     ══════════════════════════════════════════════════════════════════════ */

  const FISH_SHAPE_CACHE = {};

  /** A fish outline in plan view: body, dorsal bulge, forked tail. */
  function fishShapeGeometry(key) {
    if (FISH_SHAPE_CACHE[key]) return FISH_SHAPE_CACHE[key];
    const s = new THREE.Shape();
    // Nose at +X, tail at -X. Half-length 0.5, half-width 0.17.
    s.moveTo(0.50, 0);
    s.quadraticCurveTo(0.16, 0.19, -0.14, 0.15);   // back
    s.lineTo(-0.30, 0.10);
    s.lineTo(-0.50, 0.26);                         // upper tail tip
    s.lineTo(-0.38, 0);                            // tail notch
    s.lineTo(-0.50, -0.26);                        // lower tail tip
    s.lineTo(-0.30, -0.10);
    s.quadraticCurveTo(0.16, -0.19, 0.50, 0);      // belly
    const geo = new THREE.ShapeGeometry(s, 8);
    geo.rotateX(-Math.PI / 2);                     // lay it flat on the water
    FISH_SHAPE_CACHE[key] = geo;
    return geo;
  }

  /**
   * One fish silhouette. `len` is its length in world units, so a sturgeon
   * really is bigger on the water than a sunfish — the size IS the species
   * cue, which is what lets a spot be read without any colour at all.
   */
  const shadowMats = {};

  /**
   * A fish seen through water: a soft tinted shadow, not a cut-out.
   *
   * These used to be lit, opaque paper shapes - which made a shoal look like a
   * pile of stickers floating on the lake rather than fish under it. Unlit,
   * darkened toward the water and part-transparent, they read as shadows you
   * can just make out, while the species tint still tells you what they are.
   *
   * depthWrite is off so they never occlude what is drawn after them - the
   * cast arrow has to sit on top of the shoal it is pointing into.
   */
  function fishSilhouette(len, col) {
    const key = String(col);
    if (!shadowMats[key]) {
      const c = new THREE.Color(col);
      // Pull it toward deep water so it sits in the lake rather than on it.
      c.lerp(new THREE.Color(0x0a2734), 0.42);
      shadowMats[key] = new THREE.MeshBasicMaterial({
        color: c, transparent: true, opacity: 0.62,
        depthWrite: false, side: THREE.DoubleSide
      });
    }
    const m = new THREE.Mesh(fishShapeGeometry('f'), shadowMats[key]);
    m.scale.set(len, 1, len);
    m.castShadow = false;
    m.receiveShadow = false;
    m.renderOrder = -1;             // under the surface furniture
    return m;
  }

  /**
   * The fish you actually caught, hanging on the line.
   *
   * It is the species' OWN picture — the same watercolour the catch card and
   * the shop use — printed on a card and hung from the hook. A modelled fish
   * was the obvious thing to build and the wrong thing to look at: it could
   * not be a pike rather than a bass, and this game already owns sixteen
   * paintings that are unmistakably one species each. A paper cut-out of a
   * painting is also exactly what everything else in this world is made of.
   *
   * The group's origin is the MOUTH, because that is where the hook is: the
   * caller puts this at the end of the line and rotates it, and the fish
   * swings from its jaw the way a fish on a line does.
   *
   * `lenUnits` is the fish's real length in world units — see catchLen in the
   * scene, which works it out from the inches actually rolled against the rod
   * in the angler's hands.
   */
  function fishCard(url, lenUnits, opts) {
    const byTop = !!(opts && opts.hang === 'top');
    const g = new THREE.Group();
    const inner = new THREE.Group();
    g.add(inner);

    const L = Math.max(0.2, lenUnits || 1);
    const mat = new THREE.MeshBasicMaterial({
      transparent: true, alphaTest: 0.35, side: THREE.DoubleSide,
      color: 0xffffff, depthWrite: true
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(L, L * 0.4), mat);
    inner.add(mesh);
    /* Head-right art, so the mouth is the right-hand edge. The offset goes on
       the MESH and the rotation on the group around it - put both on the same
       object and the card turns about its own middle while staying half a
       fish away from the hook, which is a fish swimming in mid-air beside the
       line rather than hanging off it.

       Junk has no jaw to be hooked by, so it hangs from its top edge instead
       and simply swings. */
    if (!byTop) mesh.position.x = -L * 0.46;

    const tex = new THREE.TextureLoader().load(url, (t) => {
      const img = t.image;
      if (!img || !img.width) return;
      const h = L * (img.height / img.width);
      mesh.geometry.dispose();
      mesh.geometry = new THREE.PlaneGeometry(L, h);
      if (byTop) mesh.position.set(0, -h * 0.46, 0);
      if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace;
      mat.needsUpdate = true;
    });
    mat.map = tex;
    g.userData.inner = inner;
    g.userData.mesh = mesh;
    return g;
  }

  /**
   * Turn a hanging fish to face whoever is looking at it, and hang it from the
   * angle given. `tilt` is radians about the hook: PI/2 is straight down from
   * the jaw, which is head-up, tail-down — the way one comes out of the water.
   */
  function faceFishCard(g, camPos, tilt) {
    if (!g) return;
    g.rotation.y = Math.atan2(camPos.x - g.position.x, camPos.z - g.position.z);
    if (g.userData.inner) g.userData.inner.rotation.z = tilt;
  }

  /**
   * The ring a fish leaves when it comes out of the water. Grows and fades on
   * its own clock; the caller just keeps handing it the seconds.
   */
  function splashRing(color) {
    const m = surfaceDisc(1, color === undefined ? 0xd9f6ff : color, 0.09,
                          { opacity: 0.5, segments: 20, renderOrder: 2 });
    m.userData.ring = true;
    return m;
  }

  /** @returns false once it has finished and should be thrown away. */
  function updateSplashRing(m, t) {
    const k = t / 0.9;
    if (k >= 1) return false;
    m.scale.setScalar(1 + k * 5.5);
    m.material.opacity = 0.5 * (1 - k);
    return true;
  }

  /**
   * A shoal marking one fishing spot: several fish of the given species size,
   * milling about inside `radius`. Each keeps its own orbit so the group
   * drifts rather than rotating as a rigid disc.
   */
  function fishShoal(opts) {
    const o = opts || {};
    const r = U.rng(o.seed >>> 0 || 1);
    const g = new THREE.Group();
    const count = o.count || 5;
    const radius = o.radius || 14;
    const col = o.color === undefined ? 0x0d2b38 : o.color;

    for (let i = 0; i < count; i++) {
      const len = (o.length || 3) * r.range(0.72, 1.25);
      const f = fishSilhouette(len, col);
      const orbit = radius * r.range(0.18, 0.92);
      const phase = r.range(0, Math.PI * 2);
      const speed = r.range(0.10, 0.26) * r.sign();
      const wob = r.range(0.4, 1.3);
      f.userData.swim = { orbit, phase, speed, wob, bobPhase: r.range(0, 6.28) };
      g.add(f);
    }
    g.userData.fish = g.children.slice();
    return g;
  }

  /* ══════════════════════════════════════════════════════════════════════
     WHAT THE WATER LOOKS LIKE OVER A SHOAL

     The card says "Weed Bed on the left". The lake used to say nothing at all:
     every shoal was the same handful of fish shapes over the same flat green
     water, so the one piece of information the game most wants acted on lived
     only in text and in speech.

     These are the surface signatures. A weed bed has pads and reeds standing
     in it, a rocky shore has rocks breaking the surface, a drop-off has a pale
     shelf with dark water past it. They are big, high contrast, and readable
     from a long way off, because their whole job is to be seen from the helm
     before anything has to be decided — and they are scenery, never obstacles:
     nothing here is in the way and nothing here can be hit.
     ═══════════════════════════════════════════════════════════════════════ */

  /* Heights are staggered, and the order matters more than the numbers:
     water < the fish < patch floor < wash < pads < the float.
     The fish are the lowest thing of the lot on purpose: they are IN the lake,
     so a lily pad passes over one and hides it, and the weed stain tints it.
     Drawn above the pads they read as fish lying on top of the weed.
     The float has to be top of that stack. It is the one thing on the lake
     the player is actually watching, and a lily pad drawn over it is a lily
     pad that has hidden the whole point of the cast. */
  const PATCH_Y = { floor: 0.09, wash: 0.13, pad: 0.18, above: 0.22 };

  /** A flat disc lying on the water: sand, deep water, foam, a lily pad. */
  function surfaceDisc(radius, color, y, opts) {
    opts = opts || {};
    const m = new THREE.Mesh(
      new THREE.CircleGeometry(radius, opts.segments || 18),
      new THREE.MeshBasicMaterial({
        color: color, transparent: true,
        opacity: opts.opacity === undefined ? 0.55 : opts.opacity,
        depthWrite: false, side: THREE.DoubleSide
      })
    );
    m.rotation.x = -Math.PI / 2;
    m.position.y = y;
    m.renderOrder = opts.renderOrder || 1;
    return m;
  }

  /**
   * The water over a shoal, dressed for its biome.
   *
   * opts: { biome, seed, radius, colors: { sand, lily, reed, rock, deep, glint } }
   */
  function biomePatch(opts) {
    const o = opts || {};
    const r = U.rng((o.seed >>> 0) || 7);
    const R = o.radius || 16;
    const C = o.colors || {};
    const g = new THREE.Group();
    const moving = [];

    const col = (v, fallback) => new THREE.Color(v || fallback).getHex();
    const sand  = col(C.sand,  '#c9b184');
    const lily  = col(C.lily,  '#39914a');
    const reed  = col(C.reed,  '#7a9c3f');
    const deep  = col(C.deep,  '#0a2c3d');
    const glint = col(C.glint, '#d9f6ff');
    const rock  = col(C.rock,  '#7d7468');
    /* The card for this shoal is painted in the biome's colour, and so is the
       water under it. That is the whole trick: the colour on the card and the
       colour on the lake are the same colour, so "weed bed on the left" can be
       answered by looking rather than by reading. */
    const biome = col(C.biome, '#2f7d5a');

    /** Somewhere inside the shoal, in the ring between `a` and `b` of R. */
    const spot = (a, b) => {
      const ang = r.range(0, Math.PI * 2), rad = R * r.range(a, b);
      return [Math.cos(ang) * rad, Math.sin(ang) * rad];
    };

    /**
     * The stain of colour that says which water this is, built from a handful
     * of overlapping discs rather than one.
     *
     * A single disc of this size reads as a tarpaulin laid on the lake - a
     * perfect circle with visible straight edges, which is the one shape
     * nothing in nature has. Four or five of them overlapping give a soft
     * uneven outline for the same two draw calls' worth of nothing.
     */
    const stain = (color, opacity, spread) => {
      const n = 5;
      for (let i = 0; i < n; i++) {
        const d = surfaceDisc(R * r.range(0.36, 0.6), color, PATCH_Y.floor,
                              { opacity: opacity, segments: 22 });
        const ang = (i / n) * Math.PI * 2 + r.range(-0.5, 0.5);
        const rad = i === 0 ? 0 : R * (spread === undefined ? 0.42 : spread) * r.range(0.5, 1);
        d.position.set(Math.cos(ang) * rad, PATCH_Y.floor, Math.sin(ang) * rad);
        g.add(d);
      }
    };

    if (o.biome === 'shallows') {
      // Bright sand you can see the bottom of, and a scatter of pebbles.
      stain(biome, 0.2);
      stain(sand, 0.16, 0.3);
      for (let i = 0; i < 7; i++) {
        const xz = spot(0.15, 0.9);
        const pebble = part(new THREE.DodecahedronGeometry(r.range(0.3, 0.6), 0),
                            paper(sand), { pos: [xz[0], PATCH_Y.wash, xz[1]], cast: false });
        pebble.scale.y = 0.5;
        g.add(pebble);
      }
    } else if (o.biome === 'weedbed') {
      /* Pads and reeds — the one biome that is unmistakable at any distance,
         and the reason a weed bed reads as somewhere a pike would live. */
      stain(biome, 0.17);
      for (let i = 0; i < 10; i++) {
        const xz = spot(0.1, 0.95);
        const pr = r.range(0.55, 1.15);
        const pad = part(new THREE.CylinderGeometry(pr, pr, 0.1, 7),
                         paper(lily), { pos: [xz[0], PATCH_Y.pad, xz[1]], cast: false, receive: true });
        outline(pad);
        pad.userData.bob = { phase: r.range(0, 6.28), amp: r.range(0.04, 0.1), y: PATCH_Y.pad };
        moving.push(pad);
        g.add(pad);
      }
      for (let i = 0; i < 5; i++) {
        const xz = spot(0.45, 1.0);
        const clump = new THREE.Group();
        for (let k = 0, n = r.int(4, 7); k < n; k++) {
          clump.add(part(new THREE.CylinderGeometry(0.05, 0.1, r.range(1.9, 3.4), 4),
                         paper(reed),
                         { pos: [r.range(-0.8, 0.8), r.range(1.0, 1.7), r.range(-0.8, 0.8)], cast: false }));
        }
        clump.position.set(xz[0], PATCH_Y.above, xz[1]);
        clump.userData.sway = { phase: r.range(0, 6.28), amp: r.range(0.03, 0.08) };
        moving.push(clump);
        g.add(clump);
      }
    } else if (o.biome === 'rockyshore') {
      // Rocks breaking the surface, each in its own collar of foam.
      stain(biome, 0.16);
      for (let i = 0; i < 6; i++) {
        const xz = spot(0.12, 0.95);
        const size = r.range(0.9, 2.2);
        const rk = part(new THREE.DodecahedronGeometry(size, 0), paper(rock),
                        { pos: [xz[0], PATCH_Y.wash + size * 0.15, xz[1]], receive: true });
        rk.rotation.set(r.range(0, 3), r.range(0, 3), r.range(0, 3));
        rk.scale.y = r.range(0.55, 0.9);
        outline(rk);
        g.add(rk);
        const foam = surfaceDisc(size * 1.7, glint, PATCH_Y.wash, { opacity: 0.3, segments: 12 });
        foam.position.set(xz[0], PATCH_Y.wash, xz[1]);
        g.add(foam);
      }
    } else if (o.biome === 'dropoff') {
      /* A shelf, and then the bottom falls away. Two discs: the pale ledge,
         and the dark water it drops into. */
      stain(biome, 0.18);
      g.add(surfaceDisc(R * 0.6, deep, PATCH_Y.wash, { opacity: 0.34, segments: 24 }));
      g.add(surfaceDisc(R * 0.33, deep, PATCH_Y.pad, { opacity: 0.34, segments: 24 }));
      for (let i = 0; i < 4; i++) {
        const ang = (i / 4) * Math.PI * 2 + r.range(-0.3, 0.3);
        g.add(part(new THREE.BoxGeometry(r.range(2.4, 4.2), 0.14, 0.5), paper(glint),
                   { pos: [Math.cos(ang) * R * 0.66, PATCH_Y.pad, Math.sin(ang) * R * 0.66],
                     rot: [0, -ang, 0], cast: false }));
      }
    } else {
      /* Deep channel: no bottom to see at all, just cold water and the lines
         the current draws on the surface. */
      stain(biome, 0.2);
      g.add(surfaceDisc(R * 0.78, deep, PATCH_Y.wash, { opacity: 0.3, segments: 24 }));
      for (let i = 0; i < 6; i++) {
        const xz = spot(0.1, 0.95);
        const streak = part(new THREE.BoxGeometry(r.range(4, 9), 0.1, r.range(0.35, 0.7)),
                            paper(glint), { pos: [xz[0], PATCH_Y.wash, xz[1]], cast: false });
        streak.rotation.y = r.range(-0.25, 0.25);
        streak.userData.drift = { from: xz[0], span: r.range(6, 14),
                                  speed: r.range(0.05, 0.12), phase: r.range(0, 6.28) };
        moving.push(streak);
        g.add(streak);
      }
    }

    g.userData.moving = moving;
    return g;
  }

  /**
   * Gentle life in a patch: pads riding the ripple, reeds swaying, current
   * lines sliding. `still` holds everything where it is for
   * prefers-reduced-motion, which the whole game honours.
   */
  function updateBiomePatch(g, t, still) {
    const moving = g && g.userData && g.userData.moving;
    if (!moving) return;
    for (let i = 0; i < moving.length; i++) {
      const m = moving[i], d = m.userData;
      if (still) { if (d.bob) m.position.y = d.bob.y; continue; }
      if (d.bob)   m.position.y = d.bob.y + Math.sin(t * 0.9 + d.bob.phase) * d.bob.amp;
      if (d.sway)  m.rotation.z = Math.sin(t * 0.7 + d.sway.phase) * d.sway.amp;
      if (d.drift) {
        const k = (t * d.drift.speed + d.drift.phase / 6.28) % 1;
        m.position.x = d.drift.from + (k - 0.5) * d.drift.span;
      }
    }
  }

  /**
   * Point a shoal at something \u2014 a float sitting on the water above it.
   *
   * `strength` runs 0..1 and is how interested they are; the caller grows it
   * with the length of the wait. Passing null lets them go back to milling
   * about. Nothing about this is a deadline or a cue to act on: it is the
   * water looking alive while there is nothing to do.
   */
  function drawShoalTo(shoal, worldPoint, strength, still) {
    if (!shoal || !shoal.userData.fish) return;
    if (!worldPoint || still) { shoal.userData.attract = null; return; }
    const local = shoal.userData._att || (shoal.userData._att = new THREE.Vector3());
    local.copy(worldPoint);
    // The shoal group carries the route's yaw and bank, so the float has to
    // come into ITS frame before it can be swum toward.
    shoal.worldToLocal(local);
    shoal.userData.attract = { p: local, k: Math.max(0, Math.min(1, strength || 0)) };
  }

  /** Drift a shoal. Called every frame with the scene clock. */
  function updateShoal(shoal, t) {
    const kids = shoal.userData.fish;
    if (!kids) return;
    const att = shoal.userData.attract;
    // Only some of them come over. A shoal that turned as one body would read
    // as a shoal being moved, rather than as fish noticing something.
    const curious = att ? Math.max(2, Math.round(kids.length * 0.45)) : 0;
    for (let i = 0; i < kids.length; i++) {
      const f = kids[i], s = f.userData.swim;
      const a = s.phase + t * s.speed;
      const rr = s.orbit + Math.sin(t * 0.5 + s.bobPhase) * s.wob;
      if (att && i < curious) {
        // Tighter and tighter circles around the bait, the longer it is down.
        const pull = att.k * (0.55 + 0.45 * ((i % 3) / 3));
        const ring = 2.0 + i * 0.55;
        const ax = att.p.x + Math.cos(a * 1.7) * ring;
        const az = att.p.z + Math.sin(a * 1.7) * ring;
        f.position.set(Math.cos(a) * rr + (ax - Math.cos(a) * rr) * pull,
                       0,
                       Math.sin(a) * rr + (az - Math.sin(a) * rr) * pull);
        f.rotation.y = -a * 1.7 + (s.speed > 0 ? -Math.PI / 2 : Math.PI / 2);
        continue;
      }
      f.position.set(Math.cos(a) * rr, 0, Math.sin(a) * rr);
      // Head the way it is swimming: the shape's nose is +X, so the heading
      // angle goes straight into rotation.y with the usual -Z-model sign flip.
      f.rotation.y = -a + (s.speed > 0 ? -Math.PI / 2 : Math.PI / 2);
    }
  }




  /* ══════════════════════════════════════════════════════════════════════
     THE DOCK
     Where every trip starts and ends: a tackle shop on the left, the boat
     tied up on the right. Both are scan targets, so both get an ink outline
     and a clear silhouette.
     ══════════════════════════════════════════════════════════════════════ */

  /** The tackle shop: a timber shack on posts with a jetty running to it. */
  function tackleShop(colors) {
    const c = colors || {};
    const g = new THREE.Group();
    const wall = paper(c.shack || 0x9c6b45);
    const trim = paper(c.dark || 0x5c3a18);
    const roofM = paper(c.roof || 0x7a4a3a);

    // Body.
    g.add(part(new THREE.BoxGeometry(6.2, 3.6, 5.0), wall, { pos: [0, 1.8, 0], receive: true }));
    // Pitched roof, overhanging front and back.
    /* A 3-sided cylinder is a triangular prism, but THREE puts its first
       vertex at +Z — so rotating about Z (the obvious guess) leaves the apex
       pointing horizontally and the roof lying on its side. Rx(-90 degrees)
       swings that vertex to +Y and the prism's axis to Z, giving a ridge
       running front-to-back with the peak up where it belongs. */
    const roof = part(new THREE.CylinderGeometry(4.0, 4.0, 5.8, 3, 1, false), roofM,
                      { pos: [0, 4.84, 0], rot: [-Math.PI / 2, 0, 0] });
    roof.scale.set(1, 1, 0.62);      // local Z is height after the rotation
    g.add(roof);
    // Door and window.
    g.add(part(new THREE.BoxGeometry(1.3, 2.3, 0.16), trim, { pos: [-1.3, 1.15, 2.55] }));
    g.add(part(new THREE.BoxGeometry(1.6, 1.2, 0.14),
               paper(0x9fc9d8, { noMap: true }), { pos: [1.4, 2.1, 2.54] }));
    // Counter awning over the window.
    g.add(part(new THREE.BoxGeometry(2.4, 0.14, 1.1), trim, { pos: [1.4, 2.95, 3.0] }));

    // Hanging sign with a painted fish, so the hut says what it is.
    const sign = new THREE.Group();
    sign.add(part(new THREE.BoxGeometry(3.0, 1.0, 0.14), paper(0xf0e2c0), { pos: [0, 0, 0] }));
    const fish = fishSilhouette(1.5, 0xd2352b);
    fish.rotation.x = Math.PI / 2;      // stand it up on the board
    fish.position.set(0, 0, 0.1);
    sign.add(fish);
    sign.position.set(0, 4.0, 3.25);
    g.add(sign);

    // Posts into the water.
    for (const x of [-2.6, 2.6]) {
      for (const z of [-2.0, 2.0]) {
        g.add(part(new THREE.BoxGeometry(0.42, 3.0, 0.42), trim, { pos: [x, -1.5, z] }));
      }
    }
    ink(g);
    setShadow(g, true, true);
    return g;
  }

  let MAT_TEX = null;

  /** A worn mat with a back-arrow woven into it. */
  function matTexture(ink, cloth) {
    if (MAT_TEX) return MAT_TEX;
    const W = 512, H = 256;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = cloth;
    g.fillRect(0, 0, W, H);

    // A woven border.
    g.strokeStyle = ink;
    g.globalAlpha = 0.55;
    g.lineWidth = 10;
    g.strokeRect(18, 18, W - 36, H - 36);
    g.globalAlpha = 0.16;
    g.lineWidth = 3;
    for (let x = 34; x < W - 34; x += 14) {
      g.beginPath(); g.moveTo(x, 34); g.lineTo(x, H - 34); g.stroke();
    }
    g.globalAlpha = 1;

    // The arrow, pointing the way out.
    g.fillStyle = ink;
    g.beginPath();
    g.moveTo(120, H / 2);
    g.lineTo(210, H / 2 - 62);
    g.lineTo(210, H / 2 - 26);
    g.lineTo(392, H / 2 - 26);
    g.lineTo(392, H / 2 + 26);
    g.lineTo(210, H / 2 + 26);
    g.lineTo(210, H / 2 + 62);
    g.closePath();
    g.fill();

    MAT_TEX = new THREE.CanvasTexture(c);
    MAT_TEX.colorSpace = THREE.SRGBColorSpace;
    MAT_TEX.anisotropy = 4;
    return MAT_TEX;
  }

  /**
   * The way out of the shop: a mat on the floor with a back-arrow on it.
   * A door on a side wall kept falling outside the frame; a mat lies in front
   * of you, is unmistakably a "step here", and cannot be clipped away.
   */
  function exitMat(colors) {
    const c = colors || {};
    const g = new THREE.Group();
    const face = new THREE.MeshStandardMaterial({
      map: matTexture(c.matInk || '#3b2a1c', c.matCloth || '#b8664a'),
      roughness: 0.95, metalness: 0, flatShading: true
    });
    const edge = paper(c.matEdge || 0x8c4a35);
    const top = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.12, 2.4),
      [edge, edge, face, edge, edge, edge]);          // +Y face carries the weave
    top.position.y = 0.06;
    top.receiveShadow = true;
    g.add(top);
    outline(top);
    g.userData.mat = top;
    return g;
  }

  /** Planked jetty. `len` runs along -Z, away from the shore. */
  function jetty(len, colors) {
    const c = colors || {};
    const g = new THREE.Group();
    const plank = paper(c.dock || 0x7a5a3a);
    const post  = paper(c.dark || 0x5c3a18);
    const n = Math.max(2, Math.round(len / 0.92));
    for (let i = 0; i < n; i++) {
      g.add(part(new THREE.BoxGeometry(4.6, 0.22, 0.78), plank,
                 { pos: [0, 0, -i * 0.92], receive: true }));
    }
    for (let i = 0; i <= n; i += 4) {
      for (const x of [-1.9, 1.9]) {
        g.add(part(new THREE.BoxGeometry(0.34, 2.6, 0.34), post, { pos: [x, -1.3, -i * 0.92] }));
      }
    }
    // Mooring cleats.
    for (const z of [-1.5, -len + 1.5]) {
      g.add(part(new THREE.BoxGeometry(0.26, 0.3, 0.26), post, { pos: [2.0, 0.25, z] }));
    }
    ink(g);
    setShadow(g, true, true);
    return g;
  }


  /* ══════════════════════════════════════════════════════════════════════
     INSIDE THE TACKLE SHOP
     A room you stand in rather than a card you read. The counter, the gear on
     the wall and the door are the three things you can pick, so choosing is
     the same act here as it is on the dock.
     ══════════════════════════════════════════════════════════════════════ */

  function shopInterior(colors) {
    const c = colors || {};
    const g = new THREE.Group();

    const W = 17, D = 13, H = 5.2;          // room, in units
    const wall  = paper(c.shopWall || 0xc9a678);
    const floor = paper(c.shopFloor || 0x8a6440);
    const beam  = paper(c.dark || 0x5c3a18);
    const metal = paper(0x6b6f76);

    /* Shell. Only three walls and a floor — the fourth is where the camera is,
       so it is left off rather than clipped through. */
    g.add(part(new THREE.BoxGeometry(W, 0.3, D), floor, { pos: [0, -0.15, 0], receive: true }));
    g.add(part(new THREE.BoxGeometry(W, H, 0.3), wall, { pos: [0, H / 2, -D / 2], receive: true }));
    g.add(part(new THREE.BoxGeometry(0.3, H, D), wall, { pos: [-W / 2, H / 2, 0], receive: true }));
    g.add(part(new THREE.BoxGeometry(0.3, H, D), wall, { pos: [W / 2, H / 2, 0], receive: true }));
    const rafter = paper(c.shopBeam || 0x8a6b48);
    g.add(part(new THREE.BoxGeometry(W, 0.3, D), rafter, { pos: [0, H, 0] }));
    // Exposed rafters, because it is a shack. Kept lighter than the trim so
    // the top of frame does not go to a dark band.
    for (let i = -2; i <= 2; i++) {
      g.add(part(new THREE.BoxGeometry(W - 0.6, 0.26, 0.3), rafter, { pos: [0, H - 0.35, i * 2.4] }));
    }
    // Skirting, to stop the walls meeting the floor in a bare seam.
    g.add(part(new THREE.BoxGeometry(W, 0.4, 0.16), beam, { pos: [0, 0.2, -D / 2 + 0.2] }));

    /* Window on the right wall, looking back out at the lake. */
    g.add(part(new THREE.BoxGeometry(0.14, 2.1, 3.2),
               paper(c.glass || 0xbfe4f2, { emissive: 0x9fd4e8, emissiveIntensity: 0.55, noMap: true }),
               { pos: [W / 2 - 0.2, 2.7, 1.4], cast: false }));
    for (const oy of [-1.05, 1.05]) {
      g.add(part(new THREE.BoxGeometry(0.2, 0.2, 3.5), beam, { pos: [W / 2 - 0.25, 2.7 + oy, 1.4] }));
    }
    g.add(part(new THREE.BoxGeometry(0.2, 2.3, 0.2), beam, { pos: [W / 2 - 0.25, 2.7, 1.4] }));

    /* ── The counter ─────────────────────────────────────────────────────── */
    const counter = new THREE.Group();
    counter.add(part(new THREE.BoxGeometry(8.2, 1.15, 1.7), floor, { pos: [0, 0.58, 0], receive: true }));
    counter.add(part(new THREE.BoxGeometry(8.6, 0.2, 2.0), beam, { pos: [0, 1.25, 0] }));
    // Panel front, so it is not one flat slab.
    for (const x of [-2.7, 0, 2.7]) {
      counter.add(part(new THREE.BoxGeometry(2.3, 0.7, 0.12), beam, { pos: [x, 0.6, 0.9] }));
    }
    // A till and a jar of something on top.
    counter.add(part(new THREE.BoxGeometry(1.1, 0.7, 0.8), metal, { pos: [-2.6, 1.7, 0] }));
    counter.add(part(new THREE.BoxGeometry(0.8, 0.12, 0.5), beam, { pos: [-2.6, 2.1, -0.2] }));
    counter.add(part(new THREE.CylinderGeometry(0.34, 0.34, 0.7, 10),
                     paper(0xd9e8c0, { transparent: true, opacity: 0.75, noMap: true }),
                     { pos: [2.7, 1.7, 0] }));
    counter.position.set(0, 0, -3.1);
    g.add(counter);
    g.userData.counter = counter;

    /* The shopkeeper, behind the counter. */
    const keeper = angler({
      angler: c.angler || 0xe0a878,
      shirt: c.keeperShirt || 0x4a6b3d,
      jeans: c.jeans || 0x3a4a63,
      cap: c.keeperCap || 0x2f4858
    }, 'counter');
    // Models face -Z, so a half turn brings him round to face the counter and
    // the customer instead of the back wall.
    keeper.rotation.y = Math.PI;
    keeper.position.set(0.6, 1.15, -4.35);
    keeper.scale.setScalar(1.05);
    g.add(keeper);
    g.userData.keeper = keeper;

    /* ── The gear on the back wall ───────────────────────────────────────── */
    const stock = new THREE.Group();
    // Pegboard.
    stock.add(part(new THREE.BoxGeometry(6.4, 3.4, 0.18), beam, { pos: [0, 0, 0] }));
    stock.add(part(new THREE.BoxGeometry(6.0, 3.0, 0.10), paper(c.pegboard || 0xd8bb8e),
                   { pos: [0, 0, 0.12], cast: false }));
    // Rods, racked at a slight angle.
    for (let i = 0; i < 4; i++) {
      const x = -2.1 + i * 1.4;
      // Pale blank with a cork grip — the dark rod colour used on the water
      // disappears against a dark pegboard and reads as hanging strap.
      const rod = part(new THREE.CylinderGeometry(0.045, 0.07, 2.5, 6),
                       paper([0xbcae9a, 0x8fa3b8, 0xc4a05f, 0x9c8fae][i % 4], { noMap: true }),
                       { pos: [x, 0.25, 0.3], rot: [0, 0, (i - 1.5) * 0.06] });
      stock.add(rod);
      stock.add(part(new THREE.CylinderGeometry(0.10, 0.10, 0.6, 8), paper(0xd8bb8e),
                     { pos: [x, -0.9, 0.3] }));
      stock.add(part(new THREE.CylinderGeometry(0.19, 0.19, 0.16, 10), metal,
                     { pos: [x + 0.12, -0.75, 0.3], rot: [0, 0, Math.PI / 2] }));
    }
    // A row of lures hanging under them.
    for (let i = 0; i < 7; i++) {
      const x = -2.4 + i * 0.8;
      stock.add(part(new THREE.BoxGeometry(0.16, 0.44, 0.12),
                     paper([0xd2352b, 0xe8a33d, 0x4a9b5c, 0x3d7ea6][i % 4]),
                     { pos: [x, -1.25, 0.3] }));
    }
    stock.position.set(-3.6, 3.0, -D / 2 + 0.35);
    g.add(stock);
    g.userData.stock = stock;

    // Shelf of tackle boxes beside it.
    const shelf = new THREE.Group();
    for (let row = 0; row < 2; row++) {
      shelf.add(part(new THREE.BoxGeometry(4.6, 0.18, 1.0), beam, { pos: [0, row * 1.3, 0] }));
      for (let i = 0; i < 3; i++) {
        shelf.add(part(new THREE.BoxGeometry(1.2, 0.7, 0.8),
                       paper([0xc4553f, 0x4a7a8c, 0xb8923f][(i + row) % 3]),
                       { pos: [-1.5 + i * 1.5, row * 1.3 + 0.44, 0] }));
      }
    }
    shelf.position.set(4.4, 2.2, -D / 2 + 0.6);
    g.add(shelf);

    /* A mounted trophy on the wall, because of course there is one. */
    const trophy = new THREE.Group();
    trophy.add(part(new THREE.BoxGeometry(3.2, 1.6, 0.2), beam, { pos: [0, 0, 0] }));
    const mounted = fishSilhouette(2.6, c.trophy || 0x3f6b52);
    mounted.rotation.x = Math.PI / 2;     // stand it up off the plaque
    mounted.position.set(0, 0.1, 0.16);
    trophy.add(mounted);
    /* On the LEFT wall, not the back one — on the back wall it sat behind the
       rod board and got lost in it. Rotating a quarter turn about Y swings the
       plaque's face (+Z) round to +X, so it looks across the room. */
    trophy.position.set(-W / 2 + 0.42, 3.1, -2.8);
    trophy.rotation.y = Math.PI / 2;
    g.add(trophy);

    /* ── The door out ────────────────────────────────────────────────────── */
    const door = new THREE.Group();
    door.add(part(new THREE.BoxGeometry(0.24, 3.3, 2.0), beam, { pos: [0, 1.65, 0] }));
    door.add(part(new THREE.BoxGeometry(0.30, 2.9, 1.6), paper(c.dock || 0x7a5a3a),
                  { pos: [0.06, 1.6, 0] }));
    door.add(part(new THREE.SphereGeometry(0.14, 8, 6), metal, { pos: [0.22, 1.6, 0.55] }));
    // Daylight in the gap, so it reads as the way out.
    door.add(part(new THREE.BoxGeometry(0.06, 2.7, 0.22),
                  paper(0xfff3c4, { emissive: 0xffe89a, emissiveIntensity: 0.7, noMap: true }),
                  { pos: [0.26, 1.6, -0.82], cast: false }));
    // On the back wall beside the tackle, not the side wall — on the side
    // wall it sat outside the frame and got clipped away.
    door.position.set(-6.6, 0, -D / 2 + 0.2);
    door.rotation.y = Math.PI / 2;
    g.add(door);
    g.userData.door = door;

    /* The mat by the way out, right at the front of the room where the
       player is standing — this is what they actually pick to leave. */
    const mat = exitMat(c);
    mat.position.set(-1.2, 0, D / 2 - 2.6);
    g.add(mat);
    g.userData.mat = mat.userData.mat;

    // A bare bulb over the counter.
    g.add(part(new THREE.CylinderGeometry(0.04, 0.04, 0.9, 5), beam, { pos: [0, H - 0.8, -2.4] }));
    g.add(part(new THREE.SphereGeometry(0.3, 10, 8),
               paper(0xfff3c4, { emissive: 0xffe89a, emissiveIntensity: 0.9, noMap: true }),
               { pos: [0, H - 1.35, -2.4], cast: false }));

    ink(g);
    setShadow(g, true, true);
    return g;
  }


  /* ══════════════════════════════════════════════════════════════════════
     SIGNAGE
     Text painted onto the board itself, so a sign reads as a sign rather than
     needing a floating caption to explain it.
     ══════════════════════════════════════════════════════════════════════ */

  const SIGN_TEX = {};

  function signTexture(text, ink, board) {
    const key = text + '|' + ink + '|' + board;
    if (SIGN_TEX[key]) return SIGN_TEX[key];
    const W = 512, H = 192;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');

    g.fillStyle = board;
    g.fillRect(0, 0, W, H);
    // Plank lines and a little grain, so it is painted wood not a decal.
    g.strokeStyle = 'rgba(0,0,0,0.13)';
    g.lineWidth = 3;
    for (const y of [H / 3, (H * 2) / 3]) {
      g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
    }
    const r = U.rng(U.hash(text));
    g.strokeStyle = 'rgba(0,0,0,0.05)';
    g.lineWidth = 2;
    for (let i = 0; i < 40; i++) {
      const y = r.range(0, H);
      g.beginPath(); g.moveTo(0, y); g.lineTo(W, y + r.range(-3, 3)); g.stroke();
    }

    g.fillStyle = ink;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    let size = 78;
    g.font = 'bold ' + size + 'px "Trebuchet MS", Verdana, sans-serif';
    while (g.measureText(text).width > W - 56 && size > 20) {
      size -= 4;
      g.font = 'bold ' + size + 'px "Trebuchet MS", Verdana, sans-serif';
    }
    g.fillText(text, W / 2, H / 2 + 2);

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    SIGN_TEX[key] = tex;
    return tex;
  }

  /** A painted board on a post. The text is on the board. */
  function signBoard(text, colors) {
    const c = colors || {};
    const g = new THREE.Group();
    const postMat = paper(c.dark || 0x5c3a18);

    g.add(part(new THREE.BoxGeometry(0.3, 3.0, 0.3), postMat, { pos: [0, 1.5, 0] }));
    g.add(part(new THREE.BoxGeometry(0.9, 0.24, 0.5), postMat, { pos: [0, 3.05, 0] }));

    // The face carries the texture; the rest of the box stays plain timber.
    const faceMat = new THREE.MeshStandardMaterial({
      map: signTexture(text, c.signInk || '#3b2a1c', c.signBoard || '#e8d5a8'),
      roughness: 0.9, metalness: 0, flatShading: true
    });
    const sides = paper(c.dock || 0x7a5a3a);
    const board = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.28, 0.16),
      [sides, sides, sides, sides, faceMat, sides]);   // +Z face is the painted one
    board.position.set(0, 3.5, 0.1);
    board.castShadow = true;
    g.add(board);
    outline(board);

    ink(g);
    setShadow(g, true, false);
    g.userData.board = board;
    return g;
  }

  /* ══════════════════════════════════════════════════════════════════════
     DOCKSIDE CLUTTER
     A working dock has things lying about. Everything here is scenery — it
     exists so the three places you can actually go feel like part of a lake
     someone uses, rather than three objects on empty water.
     ══════════════════════════════════════════════════════════════════════ */

  function crate(size, colors) {
    const c = colors || {};
    const s = size || 1;
    const g = new THREE.Group();
    const body = paper(c.dock || 0x7a5a3a);
    const slat = paper(c.dark || 0x5c3a18);
    g.add(part(new THREE.BoxGeometry(s, s * 0.85, s), body, { pos: [0, s * 0.42, 0] }));
    for (const y of [s * 0.18, s * 0.66]) {
      g.add(part(new THREE.BoxGeometry(s * 1.04, s * 0.1, s * 1.04), slat, { pos: [0, y, 0], cast: false }));
    }
    ink(g);
    return g;
  }

  function barrel(colors) {
    const c = colors || {};
    const g = new THREE.Group();
    g.add(part(new THREE.CylinderGeometry(0.46, 0.42, 1.3, 10), paper(c.barrel || 0x5b7f6a),
               { pos: [0, 0.65, 0] }));
    for (const y of [0.28, 1.02]) {
      g.add(part(new THREE.CylinderGeometry(0.49, 0.49, 0.1, 10), paper(c.dark || 0x5c3a18),
                 { pos: [0, y, 0], cast: false }));
    }
    ink(g);
    return g;
  }

  /** A frame of poles with fish hung up to dry. */
  function dryingRack(colors) {
    const c = colors || {};
    const g = new THREE.Group();
    const pole = paper(c.dark || 0x5c3a18);
    for (const x of [-1.5, 1.5]) {
      g.add(part(new THREE.BoxGeometry(0.16, 2.4, 0.16), pole, { pos: [x, 1.2, 0] }));
    }
    g.add(part(new THREE.BoxGeometry(3.3, 0.14, 0.14), pole, { pos: [0, 2.3, 0] }));
    const r = U.rng(4711);
    for (let i = 0; i < 4; i++) {
      const x = -1.1 + i * 0.73;
      const f = fishSilhouette(r.range(0.7, 1.1), c.fishDark || 0x3f6b52);
      f.rotation.x = Math.PI / 2;
      f.rotation.z = Math.PI / 2;          // hang it nose-up
      f.position.set(x, 1.75, 0);
      g.add(f);
      g.add(part(new THREE.BoxGeometry(0.03, 0.5, 0.03), pole, { pos: [x, 2.08, 0], cast: false }));
    }
    ink(g);
    return g;
  }

  /** A ring buoy on a post — the most dockside object there is. */
  function lifeRing(colors) {
    const c = colors || {};
    const g = new THREE.Group();
    g.add(part(new THREE.BoxGeometry(0.16, 1.7, 0.16), paper(c.dark || 0x5c3a18), { pos: [0, 0.85, 0] }));
    const ring = part(new THREE.TorusGeometry(0.52, 0.16, 6, 14), paper(0xf4f1e8),
                      { pos: [0, 1.55, 0.12] });
    g.add(ring);
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + Math.PI / 4;
      g.add(part(new THREE.BoxGeometry(0.18, 0.34, 0.2), paper(0xd2352b),
                 { pos: [Math.cos(a) * 0.52, 1.55 + Math.sin(a) * 0.52, 0.12], rot: [0, 0, -a] }));
    }
    ink(g);
    return g;
  }

  /** A bench to sit on while the kettle boils. */
  function benchSeat(colors) {
    const c = colors || {};
    const g = new THREE.Group();
    const wood = paper(c.dock || 0x7a5a3a);
    const leg = paper(c.dark || 0x5c3a18);
    g.add(part(new THREE.BoxGeometry(2.6, 0.16, 0.7), wood, { pos: [0, 0.62, 0] }));
    g.add(part(new THREE.BoxGeometry(2.6, 0.6, 0.14), wood, { pos: [0, 0.98, -0.28] }));
    for (const x of [-1.1, 1.1]) {
      g.add(part(new THREE.BoxGeometry(0.16, 0.62, 0.6), leg, { pos: [x, 0.31, 0] }));
    }
    ink(g);
    return g;
  }

  /** Stacked pots and a coil of rope — the corner of a working dock. */
  function tackleClutter(colors) {
    const c = colors || {};
    const g = new THREE.Group();
    const r = U.rng(90125);
    for (let i = 0; i < 3; i++) {
      const p = part(new THREE.CylinderGeometry(0.42, 0.5, 0.42, 8), paper(c.barrel || 0x5b7f6a),
                     { pos: [r.range(-0.3, 0.3), 0.22 + i * 0.44, r.range(-0.3, 0.3)],
                       rot: [0, r.range(0, 3), 0] });
      g.add(p);
    }
    g.add(part(new THREE.TorusGeometry(0.42, 0.12, 5, 12), paper(0xd8c9a8),
               { pos: [0.95, 0.12, 0.5], rot: [-Math.PI / 2, 0, 0] }));
    ink(g);
    return g;
  }

  /** A lamp on a post, unlit in daylight but it dresses the jetty head. */
  function dockLamp(colors) {
    const c = colors || {};
    const g = new THREE.Group();
    const dark = paper(c.dark || 0x5c3a18);
    g.add(part(new THREE.BoxGeometry(0.2, 3.4, 0.2), dark, { pos: [0, 1.7, 0] }));
    g.add(part(new THREE.BoxGeometry(0.6, 0.16, 0.6), dark, { pos: [0, 3.42, 0] }));
    g.add(part(new THREE.BoxGeometry(0.44, 0.6, 0.44),
               paper(0xfff3c4, { emissive: 0xffe89a, emissiveIntensity: 0.45, noMap: true }),
               { pos: [0, 3.1, 0] }));
    g.add(part(new THREE.ConeGeometry(0.5, 0.4, 4), dark, { pos: [0, 3.6, 0], rot: [0, Math.PI / 4, 0] }));
    ink(g);
    return g;
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
    balloon, flower, artifact, star, powerup, itemBeacon, updateItemBeacon,
    stuntRing, finishArch, checkerStrip,
    // vehicles + fx
    buildVehicle, limb, vehicleFx, updateVehicleFx, burst, updateBurst,
    // fishmaster
    waterTexture, boat, angler, dock, rodRig, updateRodRig, zoneRing,
    fishHook, baitModel, fishSilhouette, fishShoal, updateShoal, tackleShop, jetty,
    biomePatch, updateBiomePatch, surfaceDisc, drawShoalTo,
    fishCard, faceFishCard, splashRing, updateSplashRing,
    shopInterior, castMarker,
    signBoard, crate, barrel, dryingRack, lifeRing, benchSeat, tackleClutter, dockLamp,
    exitMat
  };
})();
