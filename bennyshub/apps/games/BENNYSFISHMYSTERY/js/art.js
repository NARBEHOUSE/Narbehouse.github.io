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
  /**
   * Art direction, in one place.
   *
   * `outlineScenery` is the interesting one. Outlines are an ACCESSIBILITY
   * feature on anything the player must react to — art.js's own note calls
   * them the cheapest way to buy the contrast Ben's low vision needs — so
   * they stay on the boat, the rod, the bobber, the cast marker and the fish
   * however the environment is styled. On crates, banks and lamp posts they
   * were only ever selling the paper look, so they come off there.
   */
  const STYLE = {
    outlineScenery: false,
    detailRepeat: 5.5,        // how tight the surface grain is
    roughDefault: 0.9
  };

  function paperTexture() {
    if (PAPER) return PAPER;
    const size = 256;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const r = U.rng(90210);

    /* The ORIGINAL sheet: warm cream, near white, with a light fibre grain.
       A mid-grey version of this was tried to keep hues honest, and it took
       every surface in the game down to sixty per cent - the shop, the boards
       and the boats all read as charcoal. Brightness lives here; hue is the
       material's colour. */
    g.fillStyle = '#f7f2e8';
    g.fillRect(0, 0, size, size);
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
      roughness: opts.roughness === undefined ? STYLE.roughDefault : opts.roughness,
      /* A trace of metalness on everything. Zero is correct for card and wrong
         for almost anything outdoors — it is what makes wet stone, painted
         steel and varnished wood pick up the sky instead of sitting dead. */
      metalness: opts.metalness === undefined ? 0 : opts.metalness,
      /* Smooth by default now. Faceting was the loudest paper-craft signal;
         callers that actually want a hard-edged object still pass flat:true. */
      flatShading: opts.flat === undefined ? false : opts.flat,
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
  /**
   * Outline everything in a group — for SCENERY.
   *
   * Governed by STYLE.outlineScenery, which is off: on a bank or a crate the
   * outline was selling the paper look and nothing else. Gameplay objects do
   * not come through here; they call inkKey().
   *
   * `noInk` opts a mesh out. A lofted hull has an edge at every station, and
   * outlining them all turns the boat into a wire cage when seen end-on.
   */
  function ink(group, color) {
    if (!STYLE.outlineScenery) return group;
    group.traverse((o) => { if (o.isMesh && !o.userData.noInk) outline(o, color); });
    return group;
  }

  /**
   * Outline everything in a group — for anything the PLAYER MUST REACT TO.
   *
   * Always on, whatever the environment style is doing. This is the contrast
   * Ben's low vision needs on the boat, the rod, the tackle and the fish, and
   * it is not an aesthetic choice to be restyled away.
   */
  function inkKey(group, color) {
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
  function boulder(r) {
    const g = new THREE.Group();
    const rad = 1.6;
    g.add(part(new THREE.IcosahedronGeometry(rad, 0), paper(0x9c6247), {
      pos: [0, rad * 0.85, 0], scale: [1.1, 0.95, 1],
      rot: [0.3, r ? r.range(0, 6) : 1.1, 0.2], outline: true
    }));
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

    /* ── Vehicle power-up effects ─────────────────────────────────────────── */

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

    /* No angler. The boat is just a boat in the water: the trip is played in
       first person, so a figure was only ever visible on the attract screen
       and at the dock, and a procedural one sat badly beside the painted
       keepers. Nothing reads `userData.angler` any more. */

    inkKey(g);
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
    inkKey(g);
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
  /* ── The small boats ──────────────────────────────────────────────────
     Same station-table hulls as the motorboat, so they sit in the water the
     same way and take the same ink. A canoe is pointed at both ends and open;
     a kayak is lower, decked, with a cockpit. Both face -Z like the boat. */
  /* Sixteen feet of canoe: most of the length of the motorboat, and deep
     enough in the middle to sit in. The first one was two-thirds this size
     and read as a dinghy. */
  const CANOE_STATIONS = [
    { z:  3.90, hw: 0.10, y0: 0.72, y1: 1.30 },
    { z:  2.95, hw: 0.52, y0: 0.34, y1: 1.14 },
    { z:  1.45, hw: 0.92, y0: 0.12, y1: 1.04 },
    { z:  0.00, hw: 1.04, y0: 0.06, y1: 1.00 },
    { z: -1.45, hw: 0.92, y0: 0.12, y1: 1.04 },
    { z: -2.95, hw: 0.52, y0: 0.34, y1: 1.14 },
    { z: -3.90, hw: 0.10, y0: 0.72, y1: 1.30 }
  ];
  const KAYAK_STATIONS = [
    { z:  2.45, hw: 0.06, y0: 0.30, y1: 0.50 },
    { z:  1.80, hw: 0.30, y0: 0.12, y1: 0.48 },
    { z:  0.80, hw: 0.50, y0: 0.04, y1: 0.46 },
    { z:  0.00, hw: 0.54, y0: 0.02, y1: 0.46 },
    { z: -0.80, hw: 0.50, y0: 0.04, y1: 0.46 },
    { z: -1.80, hw: 0.30, y0: 0.12, y1: 0.48 },
    { z: -2.45, hw: 0.06, y0: 0.30, y1: 0.50 }
  ];

  function canoe(colors) {
    const c = colors || {};
    const g = new THREE.Group();
    const red  = paper(c.canoe || 0xe0553f, { side: THREE.DoubleSide });
    const wood = paper(0xe9cf9e);
    const S = CANOE_STATIONS;
    const hull = [part(hullBand(S, 0, 1), red, { receive: true }), part(hullBottom(S, 0), red, { cast: false }),
                  part(hullEndCap(S[0], 1), red), part(hullEndCap(S[S.length - 1], -1), red)];
    for (const m of hull) { m.userData.noInk = true; g.add(m); }
    /* A FLOOR, WELL above the waterline. The hull is an open shell and its
       inside sits below the surface, so without a floor the lake's own water
       plane passes straight through the boat. At 0.46 the floor cleared the
       still surface by two tenths of a unit - and the ripple is nearly two
       tenths on its own, before the boat bobs a tenth either way, so it was
       awash for part of every second. See tools/floatcheck.js. */
    g.add(part(hullBottom(S, 0.60), paper(0xc9a978), { cast: false, receive: true }));
    g.add(part(hullSheer(S, 0.10), wood, { cast: false }));
    // Thwarts and a seat, which is what makes it a canoe and not a shell.
    for (const z of [-1.3, 1.3]) g.add(part(new THREE.BoxGeometry(1.7, 0.07, 0.2), wood, { pos: [0, 0.86, z] }));
    g.add(part(new THREE.BoxGeometry(0.86, 0.06, 0.5), wood, { pos: [0, 0.84, 2.5] }));
    /* No paddle lying in the boat. It used to sit across the gunwales, which
       is where a paddle goes when nobody is paddling - and the one moment you
       ever see this canoe is under way, when the paddle is obviously in the
       hands of whoever is moving it. */
    return g;
  }

  function kayak(colors) {
    const c = colors || {};
    const g = new THREE.Group();
    const yellow = paper(c.kayak || 0xf2c230, { side: THREE.DoubleSide });
    const dark = paper(c.dark || 0x33302c, { noMap: true });
    const S = KAYAK_STATIONS;
    const hull = [part(hullBand(S, 0, 1), yellow, { receive: true }), part(hullBottom(S, 0), yellow, { cast: false }),
                  part(hullBottom(S, 0.99), yellow, { receive: true }),                 // the deck
                  part(hullEndCap(S[0], 1), yellow), part(hullEndCap(S[S.length - 1], -1), yellow)];
    for (const m of hull) { m.userData.noInk = true; g.add(m); }
    g.add(part(hullSheer(S, 0.08), dark, { cast: false }));
    // The cockpit: a coaming ring and the dark hole inside it.
    const coaming = part(new THREE.TorusGeometry(0.36, 0.035, 6, 20), dark, { pos: [0, 0.47, 0.15] });
    coaming.rotation.x = Math.PI / 2; coaming.scale.z = 1.5; g.add(coaming);
    g.add(part(new THREE.CircleGeometry(0.34, 20), dark, { pos: [0, 0.475, 0.15], rot: [-Math.PI / 2, 0, 0], cast: false }));
    /* NO PADDLE ACROSS THE DECK. It lay half a unit in front of the cockpit,
       which is directly across the view of somebody sitting in it - a pole
       over the lap, in front of the water. A paddle is what got you here; it
       is not what is in your hands once the rod is out. */
    return g;
  }

  /**
   * The vessel you own, as a model - or nothing at all on foot. The game
   * swaps this in for the boat wherever the boat used to be, so the thing
   * tied at the dock is the thing you can actually take out.
   */
  function vesselModel(id, colors) {
    if (id === 'canoe') return canoe(colors);
    if (id === 'kayak') return kayak(colors);
    if (id === 'motorboat') return boat(colors);
    const none = new THREE.Group();
    none.visible = false;
    return none;
  }

  /**
   * A HANDHELD net: a short wooden handle, a steel hoop and a mesh bag, held
   * in the hand the way the rod is. Nothing hangs from it - there is no line
   * and no float - so it is its own rig rather than a rod with a hoop on the
   * end. `userData.dip` (0..1, set by the scene during a scoop) tips it down
   * into the water and back.
   */
  function netRig(colors) {
    const c = colors || {};
    const g = new THREE.Group();
    const wood  = paper(0xb08d5c);
    const grip  = paper(0x4a3a2a, { noMap: true });
    const steel = paper(c.hook || 0xb8bcc2, { noMap: true, roughness: 0.45 });
    /* Mesh you can see through, because that is what a net is - and because
       the whole point of a scoop is watching what came up in the bag. */
    const mesh  = paper(0xe6ead8, { side: THREE.DoubleSide, transparent: true,
                                    opacity: 0.55, depthWrite: false });
    const pivot = new THREE.Group();
    pivot.position.y = 0.1;
    pivot.add(part(new THREE.CylinderGeometry(0.022, 0.027, 1.5, 8), wood, { pos: [0, 0.75, 0] }));
    pivot.add(part(new THREE.CylinderGeometry(0.033, 0.035, 0.4, 8), grip, { pos: [0, 0.2, 0] }));
    /* The hoop stands off the end of the handle like a racket head, and the
       bag hangs from it toward the water (-Z once the rig is raked out). Both
       live in one group so the scene can ask where the hoop IS - which is how
       the scoop knows how far to reach down to put it in the water. */
    const head = new THREE.Group();
    head.position.y = 1.92;
    head.add(part(new THREE.TorusGeometry(0.42, 0.022, 6, 28), steel));
    head.add(part(new THREE.ConeGeometry(0.42, 0.75, 28, 1, true), mesh,
                  { pos: [0, 0, -0.37], rot: [-Math.PI / 2, 0, 0], cast: false }));
    pivot.add(head);

    /* What comes up in it. Eight little fish down in the bag, hidden until
       there are that many in the net - the scene turns on as many as the
       scoop actually caught, and they wriggle while they are up. Silver for a
       minnow and brassy gold for a shiner, which is what the card says came
       up in it. */
    const netFish = [];
    const silver = paper(0xd8dee6), gold = paper(0xd9b451), dark = paper(0x4a5560, { noMap: true });
    for (let i = 0; i < 8; i++) {
      const shiner = i % 3 === 2;
      const skin = shiner ? gold : silver;
      const f = new THREE.Group();
      /* A little fish, not a squid. What makes the silhouette read at this
         size is not detail, it is the shape: a body that is deepest a third
         of the way back and tapers to a thin wrist, then a FLAT forked tail
         standing vertically behind it, and a small dorsal on top. The first
         version was a stretched sphere with a cone stuck on the end, which is
         exactly what a squid looks like. */
      const body = part(new THREE.SphereGeometry(0.062, 9, 7), skin, { cast: false });
      body.scale.set(0.42, 0.72, 1.55);        // narrow, deep-bodied, longer than tall
      body.position.z = -0.02;
      f.add(body);
      // The wrist: a short taper from the body to the tail.
      const wrist = part(new THREE.ConeGeometry(0.032, 0.07, 7), skin,
                         { pos: [0, 0, 0.10], rot: [-Math.PI / 2, 0, 0], cast: false });
      wrist.scale.set(0.5, 1, 1);
      f.add(wrist);
      /* The tail, flat and forked: two thin triangles leaning apart, standing
         in the vertical plane so it reads as a tail from any side. */
      for (const s2 of [1, -1]) {
        const fin = part(new THREE.ConeGeometry(0.042, 0.075, 3), skin,
                         { pos: [0, s2 * 0.022, 0.155], rot: [-Math.PI / 2 + s2 * 0.42, 0, 0], cast: false });
        fin.scale.set(0.22, 1, 1);             // paper-thin across
        f.add(fin);
      }
      // A dorsal, and an eye - the two things that say "fish" at a glance.
      const dorsal = part(new THREE.ConeGeometry(0.03, 0.055, 3), skin,
                          { pos: [0, 0.05, -0.02], rot: [0.5, 0, 0], cast: false });
      dorsal.scale.set(0.2, 1, 1);
      f.add(dorsal);
      f.add(part(new THREE.SphereGeometry(0.011, 5, 4), dark, { pos: [0.019, 0.017, -0.085], cast: false }));
      f.add(part(new THREE.SphereGeometry(0.011, 5, 4), dark, { pos: [-0.019, 0.017, -0.085], cast: false }));

      /* Up near the mouth of the bag, spread across it, so they are in plain
         sight through the hoop rather than bunched away down in the tip. */
      const a = (i / 8) * Math.PI * 2;
      f.position.set(Math.cos(a) * 0.2, Math.sin(a) * 0.13 - 0.05, -0.22 - (i % 3) * 0.07);
      f.rotation.y = a;
      f.userData = { y: f.position.y, yaw: a, phase: i * 1.7 };
      f.visible = false;
      head.add(f);
      netFish.push(f);
    }

    /* AND WHAT ELSE COMES UP IN IT. The clean-up job is five pieces of
       rubbish out of the shallows and the bag was empty when they came up, so
       the whole job happened on a card. Six pieces, two each of three kinds,
       up in the mouth of the bag where the fish sit. Small: the hoop is under
       half a unit across and a bottle is a hand long. */
    const netLitter = [];
    const clearPlastic = paper(0xdfe9e2, { transparent: true, opacity: 0.72, noMap: true });
    const bagPlastic = paper(0xf2f4ef, { transparent: true, opacity: 0.5,
                                         side: THREE.DoubleSide, noMap: true, depthWrite: false });
    const capRed = paper(0xc0392b, { noMap: true });
    const tin = paper(0xc3c8cf, { noMap: true, roughness: 0.35 });
    const tinDark = paper(0x7d848c, { noMap: true });
    for (let i = 0; i < 6; i++) {
      const kind = i % 3;
      const o = new THREE.Group();
      if (kind === 0) {
        /* A PLASTIC BOTTLE, lying on its side: body, shoulder, neck, cap. */
        o.add(part(new THREE.CylinderGeometry(0.05, 0.05, 0.20, 9), clearPlastic,
                   { rot: [Math.PI / 2, 0, 0], cast: false }));
        o.add(part(new THREE.CylinderGeometry(0.022, 0.05, 0.05, 9), clearPlastic,
                   { pos: [0, 0, 0.125], rot: [Math.PI / 2, 0, 0], cast: false }));
        o.add(part(new THREE.CylinderGeometry(0.022, 0.022, 0.04, 9), clearPlastic,
                   { pos: [0, 0, 0.168], rot: [Math.PI / 2, 0, 0], cast: false }));
        o.add(part(new THREE.CylinderGeometry(0.026, 0.026, 0.03, 9), capRed,
                   { pos: [0, 0, 0.20], rot: [Math.PI / 2, 0, 0], cast: false }));
      } else if (kind === 1) {
        /* A CARRIER BAG, crumpled - four flattened lumps at odd angles, which
           is all a screwed-up bag is, and no two the same. */
        for (let k = 0; k < 4; k++) {
          const lump = part(new THREE.SphereGeometry(0.062, 7, 5), bagPlastic, { cast: false });
          lump.scale.set(1, 0.55 + k * 0.12, 0.8);
          lump.position.set((k % 2 ? 1 : -1) * 0.03, (k > 1 ? 1 : -1) * 0.02, k * 0.035 - 0.05);
          lump.rotation.set(k * 0.7, k * 1.1, k * 0.4);
          o.add(lump);
        }
      } else {
        /* A DRINKS CAN, dented: a short cylinder with a dark rim each end. */
        const can = part(new THREE.CylinderGeometry(0.045, 0.045, 0.13, 10), tin,
                         { rot: [Math.PI / 2, 0, 0], cast: false });
        can.scale.x = 0.86;                       // squashed in on one side
        o.add(can);
        for (const e of [-0.066, 0.066]) {
          o.add(part(new THREE.CylinderGeometry(0.047, 0.047, 0.012, 10), tinDark,
                     { pos: [0, 0, e], rot: [Math.PI / 2, 0, 0], cast: false }));
        }
      }
      /* Spread across the mouth of the bag, same as the fish, but sat a
         little lower - rubbish sinks into a net, it does not swim in it. */
      /* DOWN IN THE BAG, not balanced on the rim. Rubbish sinks into a net and
         sits in the cone of it; on the hoop line it reads as something
         perched on the edge about to fall off. */
      const a = (i / 6) * Math.PI * 2 + 0.4;
      o.position.set(Math.cos(a) * 0.12, Math.sin(a) * 0.07 - 0.14, -0.31 - (i % 2) * 0.05);
      o.rotation.set(i * 0.5, a, i * 0.9);
      /* Half again as big. At the modelled size a bottle in a hoop nearly
         half a unit across read as a speck of grit, and the whole point of
         the clean-up job is seeing what you pulled out of the water. */
      o.scale.setScalar(1.7);
      o.userData = { y: o.position.y, rx: o.rotation.x, phase: i * 2.1 };
      o.visible = false;
      head.add(o);
      netLitter.push(o);
    }

    g.add(pivot);
    g.userData.segs = [pivot];
    g.userData.tip = pivot;
    g.userData.net = true;
    g.userData.head = head;
    g.userData.netFish = netFish;
    g.userData.netLitter = netLitter;
    // The scene expects these on every rig. Empty and hidden: nothing on a line.
    const none = () => { const o = new THREE.Group(); o.visible = false; return o; };
    g.userData.bobber = none(); g.userData.hook = none(); g.userData.baitHold = none();
    return g;
  }

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

    /* THE FLOAT, IF THIS BAIT USES ONE. A worm hangs under a bobber and its
       dip is the bite; a spoon, a stink bait or a deep rig does not float and
       never did - the line runs straight to the lure. */
    const useFloat = c.float !== false;
    const bob = new THREE.Group();
    /* A float, not a buoy. It was 0.30 across and read as a beach ball on the
       end of the line; this is about a third of that. */
    const R = 0.115;
    /* IN ITS OWN GROUP, so it can be taken off. The whole rig end hangs from
       `bob` - float, dropper, hook, bait and magnet alike - so hiding `bob` to
       take the float off would take the magnet with it. */
    const floatBody = new THREE.Group();
    bob.add(floatBody);
    g.userData.floatBody = floatBody;
    if (useFloat) {
      floatBody.add(part(new THREE.SphereGeometry(R, 10, 8), paper(c.bobber || 0xff3b3b)));
      floatBody.add(part(new THREE.SphereGeometry(R * 1.01, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2),
                         paper(0xf7f2e8)));
      floatBody.add(part(new THREE.CylinderGeometry(0.012, 0.012, 0.11, 5), paper(0xf7f2e8),
                         { pos: [0, 0.10, 0], cast: false }));
    } else {
      /* No float: a small swivel where the line meets the trace, so there is
         still something to see at the end of the cast. */
      floatBody.add(part(new THREE.CylinderGeometry(0.02, 0.02, 0.07, 6),
                         paper(c.hook || 0xb8bcc2, { noMap: true })));
    }
    /* A short dropper down to the hook. Held by NAME, not by its place in the
       list: it used to be fished back out as "the second from last child of
       the float", and the day a magnet was added to that group the magnet
       became the dropper - so the line that hides the dropper when a magnet
       is on was hiding the magnet, every frame, immediately after the line
       that showed it. */
    const dropper = part(new THREE.CylinderGeometry(0.005, 0.005, 0.16, 4),
                         paper(c.line || 0xf4f4f0, { noMap: true }),
                         { pos: [0, -0.19, 0], cast: false });
    bob.add(dropper);
    const hook = fishHook(0.85, c);
    hook.position.set(0, -0.27, 0);
    bob.add(hook);

    /* THE MAGNET. A horseshoe: two legs down from a yoke, with the poles
       painted red the way every magnet in every picture book is. Hidden
       unless there is one on the line, and when there is, the float, the hook
       and the bait are hidden instead - see updateRod in js/game.js. */
    const magnet = new THREE.Group();
    /* Held out here so the heavy/light swap below can repaint them. */
    let steel, poles;
    (function buildMagnet() {
      /* Its own light grey rather than the hook's, and a little self-lit. A
         hook is meant to disappear against the water; this is meant to be
         seen from the rod, and the float group it hangs under is scaled down
         with distance so the magnet straddles the surface and the water tint
         takes the submerged half of it down to near-black. */
      steel = paper(0xdfe4ea, { noMap: true, emissive: 0xa9b4c0, emissiveIntensity: 0.8 });
      poles = paper(0xe8392b, { noMap: true, emissive: 0xc22a18, emissiveIntensity: 0.85 });
      /* THE SIZE OF A MAGNET. This was built two and a half feet across, on
         the same reasoning as the float above it: a few inches at thirty feet
         is two pixels. That reasoning died when the submerged rig stopped
         being drawn - a magnet under the water is not shown at all now, so
         the only times it is on screen are at the rod tip, in flight and over
         the rail, and all three are close. Reported as "three times the size"
         at the tip, which is exactly what an oversized object near the eye
         looks like. Built at the same shape, worn at four inches. */
      /* A HORSESHOE, not a doorframe. Built as a yoke with a straight leg off
         each end it was an open square, and an open square is not what anybody
         pictures when they hear "magnet". */
      const R = 0.62, TH = 0.26, LEG = 0.5;
      // The arch: the top half of a ring, so the opening faces down.
      magnet.add(part(new THREE.TorusGeometry(R, TH / 2, 8, 20, Math.PI), steel,
                      { pos: [0, 0, 0] }));
      [-1, 1].forEach(function (s2) {
        // A short straight run down out of each end of the arch...
        magnet.add(part(new THREE.CylinderGeometry(TH / 2, TH / 2, LEG, 8), steel,
                        { pos: [s2 * R, -LEG / 2, 0] }));
        // ...and the pole face on the bottom of it, painted red.
        magnet.add(part(new THREE.CylinderGeometry(TH * 0.62, TH * 0.62, TH * 0.75, 8), poles,
                        { pos: [s2 * R, -LEG - TH * 0.34, 0] }));
      });
      // The eye it hangs by, at the crown of the arch.
      magnet.add(part(new THREE.TorusGeometry(0.13, 0.04, 6, 10), steel,
                      { pos: [0, R + TH * 0.4, 0], rot: [Math.PI / 2, 0, 0] }));
    })();
    /* AT THE SURFACE, where the float would be. Hung under it, the water
       tint took the steel down to near-black and put the red poles out of
       sight altogether, so the one piece of tackle the player asked to be
       able to see was a dark smudge. It rides where the float rides. */
    /* BELOW the point the line comes down to. Set above it, the magnet
       perched on the rod tip rather than hanging off the end of the line. */
    /* Four inches, from a shape drawn at two and a half feet. Worn as a
       scale rather than baked into the geometry so the one number is
       findable, and so anything hanging off the magnet - the haul that comes
       up stuck to it - can ask how big it is. */
    const MAG_K = 0.13;
    magnet.scale.setScalar(MAG_K);
    magnet.userData.k = MAG_K;
    /* THE HEAVY ONE IS A DIFFERENT LUMP OF IRON.
       Both magnets hung the same bright little horseshoe off the line, so
       there was no way to see which was on - and the last job in the game
       turns on having the heavy one. Reported: "the heavy magnet should have
       a different looking lure on the line vs the original magnet."
       Half again as big, and cast iron with brass poles rather than painted
       steel and red - the difference reads at a glance and at a distance,
       which is where it is seen from. */
    magnet.userData.setHeavy = function (on) {
      if (magnet.userData.heavy === !!on) return;
      magnet.userData.heavy = !!on;
      const k = MAG_K * (on ? 1.5 : 1);
      magnet.scale.setScalar(k);
      magnet.userData.k = k;
      magnet.position.set(0, -0.34 * k, 0);
      steel.color.setHex(on ? 0x8a8f96 : 0xdfe4ea);
      if (steel.emissive) steel.emissive.setHex(on ? 0x555b62 : 0xa9b4c0);
      poles.color.setHex(on ? 0xd8a11f : 0xe8392b);
      if (poles.emissive) poles.emissive.setHex(on ? 0xa8790c : 0xc22a18);
    };
    magnet.position.set(0, -0.34 * MAG_K, 0);
    magnet.visible = false;
    bob.add(magnet);
    magnet.name = 'magnet';
    g.userData.magnet = magnet;
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
    g.userData.dropper = dropper;
    if (c.baitLook) baitHold.add(baitModel(c.baitLook, 0.85));
    inkKey(bob);
    g.userData.bobber = bob;

    inkKey(g);
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
  /**
   * @param bobberWorldPos where the float is - the main line ends here
   * @param tailWorldPos   and, if something is hanging off it, the jaw: a
   *                       short leader carries on from the float to there.
   *                       The line used to take one point, so whichever of
   *                       the two it was given, the other one hung in the air
   *                       off the end of nothing.
   */
  function updateRodRig(rig, amount, bobberWorldPos, tailWorldPos) {
    const segs = rig.userData.segs;
    if (rig.userData.net) {
      /* A net does not bend, and it is not swung. It TIPS as it goes down -
         gently, because the reach itself is the scene moving the whole rig to
         the water - and whatever came up wriggles in the bag. */
      const dip = rig.userData.dip || 0;
      segs[0].rotation.x = -dip * 0.42;
      const fish = rig.userData.netFish || [];
      const n = rig.userData.fish || 0;
      const t = rig.userData.t || 0;
      for (let i = 0; i < fish.length; i++) {
        const on = i < n;
        fish[i].visible = on;
        if (!on) continue;
        const u = fish[i].userData;
        fish[i].rotation.y = u.yaw + Math.sin(t * 8 + u.phase) * 0.45;
        fish[i].position.y = u.y + Math.sin(t * 11 + u.phase) * 0.022;
      }
      /* And the rubbish, which does not kick. A fish in a net fights it; a
         bottle in a net rolls with the water and drains. */
      const bits = rig.userData.netLitter || [];
      const ln = rig.userData.litter || 0;
      for (let i = 0; i < bits.length; i++) {
        const on = i < ln;
        bits[i].visible = on;
        if (!on) continue;
        const u = bits[i].userData;
        bits[i].rotation.x = u.rx + Math.sin(t * 2.4 + u.phase) * 0.13;
        bits[i].position.y = u.y + Math.sin(t * 3.1 + u.phase) * 0.010;
      }
      return;
    }
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
    /* Most of the string is the line from the tip to the float; the last few
       points are the leader from the float on down to whatever is on the
       hook. With nothing on it, the whole lot goes to the float. */
    const nMain = tailWorldPos ? Math.max(2, Math.round(N * 0.8)) : N;
    for (let i = 0; i < nMain; i++) {
      const t = nMain > 1 ? i / (nMain - 1) : 0;
      _v3.lerpVectors(_tipV, _bobV, t);
      _v3.y -= Math.sin(t * Math.PI) * sag;      // the belly of the line
      line.worldToLocal(_v3);
      pos.setXYZ(i, _v3.x, _v3.y, _v3.z);
    }
    if (tailWorldPos) {
      for (let i = nMain; i < N; i++) {
        const t = (i - nMain + 1) / (N - nMain);
        _v3.lerpVectors(_bobV, tailWorldPos, t);
        line.worldToLocal(_v3);
        pos.setXYZ(i, _v3.x, _v3.y, _v3.z);
      }
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

    inkKey(g, INK);
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

    inkKey(g, INK);
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
    /* Which end of the picture the mouth is. Most of these fish are painted
       facing right; the minnow and the lake trout face left. */
    const headLeft = !!(opts && opts.head === 'left');
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
    if (!byTop) mesh.position.x = (headLeft ? 1 : -1) * L * 0.46;

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
    g.userData.headLeft = headLeft;
    return g;
  }

  /**
   * A character as a flat PNG standing in the scene.
   *
   * The keepers used to be built out of primitives like everything else, but
   * procedural faces cannot carry six people who have to be tellable apart at
   * a glance, and the game already commits to ink-and-watercolour art
   * everywhere else. So they are painted PNGs on a plane - the same trick
   * fishCard already uses for a caught fish.
   *
   * The plane's BOTTOM edge sits on the group origin, so a keeper is placed by
   * standing the group on the floor rather than by guessing a hip height.
   * Width follows the image's own aspect once the texture loads.
   *
   * Unlit on purpose: MeshBasicMaterial keeps the watercolour reading as paper
   * art instead of picking up the room's key light and going shiny.
   */
  function characterBillboard(url, heightUnits) {
    const H = Math.max(0.2, heightUnits || 2.3);
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({
      transparent: true, alphaTest: 0.28, side: THREE.DoubleSide,
      color: 0xffffff, depthWrite: true
    });
    // Provisional half-width plane, resized the moment the real aspect lands.
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(H * 0.5, H), mat);
    mesh.position.y = H * 0.5;
    g.add(mesh);

    const tex = new THREE.TextureLoader().load(url, (t) => {
      const img = t.image;
      if (!img || !img.width) return;
      mesh.geometry.dispose();
      mesh.geometry = new THREE.PlaneGeometry(H * (img.width / img.height), H);
      mesh.position.y = H * 0.5;
      if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace;
      mat.needsUpdate = true;
    });
    mat.map = tex;
    g.userData.mesh = mesh;
    g.userData.height = H;
    return g;
  }

  /**
   * A painted image hung flat on a wall.
   *
   * Like characterBillboard, but centred on its own origin rather than stood
   * on it, because merchandise hangs at eye level rather than standing on the
   * floor. Width follows the art's own aspect once it loads.
   *
   * `dim` fades it, which is how the rod ladder shows what you have not earned
   * yet: present on the wall, visibly not yours.
   */
  function wallArt(url, heightUnits, dim) {
    const H = Math.max(0.1, heightUnits || 1);
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({
      transparent: true, alphaTest: 0.22, side: THREE.DoubleSide,
      color: dim ? 0x6f6a63 : 0xffffff,
      opacity: dim ? 0.55 : 1, depthWrite: true
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(H, H), mat);
    g.add(mesh);
    new THREE.TextureLoader().load(url, (t) => {
      const img = t.image;
      if (!img || !img.width) return;
      mesh.geometry.dispose();
      mesh.geometry = new THREE.PlaneGeometry(H * (img.width / img.height), H);
      if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace;
      mat.map = t;
      mat.needsUpdate = true;
    });
    g.userData.mesh = mesh;
    return g;
  }

  /**
   * Turn a billboard to face the camera. Yaw only - tilting a standing figure
   * on any other axis reads as it falling over rather than turning.
   */
  function faceBillboard(g, camPos) {
    if (!g || !camPos) return;
    g.rotation.y = Math.atan2(camPos.x - g.position.x, camPos.z - g.position.z);
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
      /* THE RIM OF THE SHELF. This used to be four solid pale boxes standing
         proud of the water in a ring - meant as the light catching along the
         edge, read by everybody as white planks floating on a lake, because
         that is what a solid pale box floating on a lake is. A ledge seen
         from above is a rim: the pale shelf ending and the dark beginning.
         Flat, translucent, and nothing standing above the surface. */
      const rim = new THREE.Mesh(
        new THREE.RingGeometry(R * 0.60, R * 0.68, 40),
        new THREE.MeshBasicMaterial({ color: glint, transparent: true, opacity: 0.22,
                                      depthWrite: false, side: THREE.DoubleSide }));
      rim.rotation.x = -Math.PI / 2;
      rim.position.y = PATCH_Y.wash;
      rim.renderOrder = 1;
      rim.userData.noInk = true;
      g.add(rim);
    } else {
      /* Deep channel: no bottom to see at all, just cold water and the lines
         the current draws on the surface. */
      stain(biome, 0.2);
      g.add(surfaceDisc(R * 0.78, deep, PATCH_Y.wash, { opacity: 0.3, segments: 24 }));
      /* WHAT DRIFTS ON DEEP WATER. This was six pale boxes, written as the
         lines a current draws on the surface - and a solid near-white slab
         four to nine units long does not read as a line on the water, it
         reads as a floating plank, which is what it was reported as. Twice.
         Branches: thin, dark, low in the water, some with a stub still on
         them, drifting the way the streaks did. */
      const limb = paper(C.dock ? col(C.dock, '#7a5a3a') : 0x6b5330);
      for (let i = 0; i < 6; i++) {
        const xz = spot(0.1, 0.95);
        const len = r.range(2.6, 7);
        const rad = r.range(0.11, 0.24);
        const branch = new THREE.Group();
        const bole = part(new THREE.CylinderGeometry(rad * 0.7, rad, len, 6), limb,
                          { pos: [0, 0, 0], cast: false });
        bole.rotation.z = Math.PI / 2;
        branch.add(bole);
        if (r.chance(0.5)) {
          const stub = part(new THREE.CylinderGeometry(rad * 0.4, rad * 0.5, len * 0.3, 5),
                            limb, { pos: [r.range(-len * 0.3, len * 0.3), 0, 0], cast: false });
          stub.rotation.z = Math.PI / 2 - r.range(0.6, 1.1);
          branch.add(stub);
        }
        branch.rotation.y = r.range(0, Math.PI);
        branch.position.set(xz[0], PATCH_Y.wash, xz[1]);
        branch.userData.drift = { from: xz[0], span: r.range(6, 14),
                                  speed: r.range(0.05, 0.12), phase: r.range(0, 6.28) };
        moving.push(branch);
        g.add(branch);
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
   * A submerged log jam - a raft of drowned timber piled on itself.
   *
   * Named on the chart, fished by two jobs, and until now drawn as ordinary
   * deep water: "I don't know what a submerged log jam is" is the correct
   * response to a lake that shows you nothing.
   *
   * It sits in sixty-seven feet, so most of it is drawn the way sunken wood
   * actually reads from a boat - dark translucent shapes seen THROUGH the
   * water, unlit and un-inked, the deeper ones fainter. A jam builds up on
   * itself, though, so the top of the pile is awash: a few spars break the
   * surface, and those are painted solid like everything else that is really
   * there. That is what makes it findable from across the water.
   *
   * opts: { seed, radius, colors: { wood, dark, deep } }
   */
  function logJam(opts) {
    const o = opts || {};
    const r = U.rng((o.seed >>> 0) || 0x10ce);
    const R = o.radius || 30;
    /* A JAM IS A LINE, NOT A HEAP. It runs bank to bank across the narrows,
       so the pile is laid along `run` units of it (centred on the group) and
       the logs are spread down its length. One raft in the middle of a lake
       was scenery; this is the thing you cannot get past. */
    const RUN = Math.max(0, o.run || 0);
    const along = function () { return RUN ? r.range(-RUN / 2, RUN / 2) : 0; };
    const C = o.colors || {};
    const col = (v, fb) => new THREE.Color(v || fb).getHex();
    const wood = col(C.wood, '#7a5a3a');
    const dark = col(C.dark, '#3a352f');
    const deep = col(C.deep, '#0a2c3d');
    const g = new THREE.Group();

    /* The water over it goes dark, and unevenly: there is a great deal of
       wood down there and the shade of it is the first thing you see.
       DARKER THAN THE WATER, which is the whole point - the deep-water
       colour laid over deep water at sixty-seven feet came out LIGHTER
       than its surroundings and read as a pale blob on the lake. */
    /* Laid thickly enough to overlap into one smudge. Spaced out they read
       as a row of grey circles on the lake, which is a row of grey circles
       on the lake and not the shadow of anything. */
    const shades = Math.max(3, Math.round(RUN / (R * 0.5)) + 2);
    for (let i = 0; i < shades; i++) {
      const d = surfaceDisc(R * r.range(0.42, 0.66), 0x04121a, 0.05,
                            { opacity: 0.16, segments: 18 });
      d.position.set(RUN ? -RUN / 2 + (i / (shades - 1)) * RUN + r.range(-8, 8) : 0,
                     0.05, r.range(-R * 0.22, R * 0.22));
      d.userData.noInk = true;
      g.add(d);
    }

    /** One trunk, laid across the pile at some heading, at some depth. */
    const trunk = function (len, rad, mat, y, tilt, ink0) {
      const hold = new THREE.Group();
      const t = new THREE.Mesh(
        new THREE.CylinderGeometry(rad * 0.72, rad, len, 7), mat);
      /* Along +Y as built; laid over to run along +X, less the tilt, which
         lifts the far end. */
      t.rotation.z = Math.PI / 2 - tilt;
      t.castShadow = false;
      t.receiveShadow = false;
      if (!ink0) t.userData.noInk = true;
      hold.add(t);
      if (ink0) outline(t);
      /* A drowned trunk keeps a stub or two of its branches. */
      if (r.chance(0.45)) {
        const b = new THREE.Mesh(
          new THREE.CylinderGeometry(rad * 0.24, rad * 0.34, len * r.range(0.18, 0.32), 5), mat);
        b.rotation.z = Math.PI / 2 - tilt + r.range(0.5, 1.1);
        b.position.set(r.range(-len * 0.3, len * 0.3), rad * 0.5, 0);
        b.castShadow = false;
        if (!ink0) b.userData.noInk = true;
        hold.add(b);
      }
      hold.rotation.y = r.range(0, Math.PI * 2);
      hold.position.y = y;
      return hold;
    };

    /* THE PILE, seen through the water. Deeper wood is fainter - which is
       the only cue that says "this is under you" rather than "this is on
       the water", and it is the cue a lake actually gives. */
    const piled = RUN ? Math.max(20, Math.round(RUN / 9)) : 20;
    for (let i = 0; i < piled; i++) {
      const down = r.range(0.06, 1);                 // 0 at the surface, 1 deep
      /* THE TOP OF THE PILE IS REAL WOOD. A jam is timber stacked until some
         of it is awash, and the ones at the top are not "seen through" water
         at all - they are lying in it. Painted like everything else, and
         inked. Below that it fades into the dark, which is what depth looks
         like from a boat. */
      const awash = down < 0.3;
      const mat = awash
        ? paper(i % 3 === 0 ? dark : wood)
        : new THREE.MeshBasicMaterial({
            color: down > 0.66 ? deep : (i % 3 === 0 ? dark : wood),
            transparent: true, opacity: 0.6 - (down - 0.3) * 0.5,
            depthWrite: false, fog: true
          });
      const len = R * r.range(0.45, 1.05);
      const t = trunk(len, r.range(0.5, 1.0), mat, 0.04 - down * 0.02,
                      r.range(-0.05, 0.05), awash);
      const a = r.range(0, Math.PI * 2), rad = R * r.range(0, 0.55);
      t.position.x = along() + Math.cos(a) * rad;
      t.position.z = Math.sin(a) * rad * 0.7;
      t.renderOrder = 1;
      g.add(t);
    }

    /* AND THE TOP OF THE PILE, which is out of the water. Three spars, one
       end awash and the other lifted - the thing you steer towards. */
    const spars = RUN ? Math.max(3, Math.round(RUN / 55)) : 3;
    for (let i = 0; i < spars; i++) {
      const len = R * r.range(0.55, 0.9);
      const tilt = r.range(0.18, 0.34);
      const mat = paper(i % 3 === 1 ? dark : wood);
      const t = trunk(len, r.range(0.7, 1.05), mat, 0.1, tilt, true);
      /* Spread along the pile rather than round a point, and never all at
         the same spacing - a line of evenly placed spars reads as a fence. */
      t.position.x = RUN ? (-RUN / 2 + (i + 0.5) / spars * RUN + r.range(-16, 16)) : 0;
      t.position.z = r.range(-R * 0.3, R * 0.3);
      g.add(t);
    }

    return g;
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
    /* Mooring cleats, low and on the edge. They used to be square posts a
       third of a unit tall standing proud in the middle of the walkway, which
       read as a support beam coming up through the decking rather than as
       something to tie a boat to. Now they sit at the very edge of the boards
       and barely clear them. */
    for (const z of [-1.5, -len + 1.5]) {
      g.add(part(new THREE.BoxGeometry(0.3, 0.12, 0.16), post, { pos: [2.12, 0.16, z] }));
      g.add(part(new THREE.CylinderGeometry(0.05, 0.05, 0.2, 6), post,
                 { pos: [2.12, 0.2, z], rot: [Math.PI / 2, 0, 0] }));
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
    /* The shop's joinery: counter, shelves, the plaque on the wall. It used
       to take `c.dark`, which is the BOAT's charcoal trim - so a tackle shop
       full of pine furniture came out black. */
    const beam  = paper(c.shopWood || 0x6f5334);
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

    /* There WAS a window here - a flat pale-blue panel looking at nothing -
       and the one built further down this wall has the lake painted on it, so
       the room had two windows three feet apart. This is the wall it leaves
       behind. */

    /* ── The counter ─────────────────────────────────────────────────────── */
    /* Counter height is set against the man behind it: a shop counter comes up
       to about the waist of whoever is working it, and Walt is a shade over
       three units tall. At the old 1.25 he stood behind it like a child at a
       kitchen table. */
    const counter = new THREE.Group();
    counter.add(part(new THREE.BoxGeometry(8.2, 1.62, 1.7), floor, { pos: [0, 0.81, 0], receive: true }));
    counter.add(part(new THREE.BoxGeometry(8.6, 0.2, 2.0), beam, { pos: [0, 1.72, 0] }));
    // Panel front, so it is not one flat slab.
    for (const x of [-2.7, 0, 2.7]) {
      counter.add(part(new THREE.BoxGeometry(2.3, 1.0, 0.12), beam, { pos: [x, 0.82, 0.9] }));
    }
    // A till and a jar of something on top.
    counter.add(part(new THREE.BoxGeometry(1.1, 0.7, 0.8), metal, { pos: [-2.6, 2.17, 0] }));
    counter.add(part(new THREE.BoxGeometry(0.8, 0.12, 0.5), beam, { pos: [-2.6, 2.57, -0.2] }));
    counter.add(part(new THREE.CylinderGeometry(0.34, 0.34, 0.7, 10),
                     paper(0xd9e8c0, { transparent: true, opacity: 0.75, noMap: true }),
                     { pos: [2.7, 2.17, 0] }));
    counter.position.set(0, 0, -3.1);
    g.add(counter);
    g.userData.counter = counter;

    /* The keeper, behind the counter - a painted PNG, not primitives.
       Height is pinned to the door, which is 3.3 units for a real 2m doorway,
       so a person is about 2.9. An earlier 2.3 read as a child: the counter
       occludes everything below y=1.25, so a short figure had barely a unit
       of itself showing above it. `keeperId` picks whose art to load; it
       defaults to Walt because Cattail Creek is the only zone built so far. */
    const keeper = characterBillboard(
      'images/npc/' + (c.keeperId || 'walt') + '_full.png', 5.0);
    /* Stood down behind the counter, so the counter crosses him at the waist
       the way a shop counter does, rather than at the chest. */
    keeper.position.set(0.6, -0.95, -4.35);
    g.add(keeper);
    g.userData.keeper = keeper;

    /* ── The gear on the back wall ───────────────────────────────────────── */
    const stock = new THREE.Group();
    // Pegboard.
    stock.add(part(new THREE.BoxGeometry(6.4, 3.4, 0.18), beam, { pos: [0, 0, 0] }));
    stock.add(part(new THREE.BoxGeometry(6.0, 3.0, 0.10), paper(c.pegboard || 0xd8bb8e),
                   { pos: [0, 0, 0.12], cast: false }));
    /* THE ROD LADDER, as a progress board.
       The rods you can own in this game, in ladder order: the ones you have
       at full colour, the rest greyed out. Built from primitives rather than
       painted panels - there is no artwork for a bamboo rod, and a wall of
       missing images was what made this board read as a jumble of angled
       sticks. Straight, small, and evenly spaced, because it is a rack.
       `rodLadder` comes from game.js; with nothing passed the board is empty
       rather than showing another game's rods. */
    const LADDER = (c.rodLadder || []).slice(0, 4);
    const owned = c.ownedRods || null;
    const SPAN = 4.2;
    const gap = LADDER.length > 1 ? SPAN / (LADDER.length - 1) : 0;
    for (let i = 0; i < LADDER.length; i++) {
      const rec = LADDER[i];
      const x = -gap * (LADDER.length - 1) / 2 + i * gap;
      const has = !owned || owned.indexOf(rec.id) >= 0;
      const look = rec.look || {};
      const tint = (v, fb) => {
        const col = new THREE.Color(has ? (v || fb) : 0x6f6a63);
        return paper(col.getHex(), { noMap: true });
      };
      const rod = new THREE.Group();
      const blank = tint(look.blank, 0x2f2a26), grip = tint(look.grip, 0xc9a978);
      rod.add(part(new THREE.CylinderGeometry(0.020, 0.042, 1.85, 6), blank, { pos: [0, 0.25, 0] }));
      rod.add(part(new THREE.CylinderGeometry(0.062, 0.062, 0.42, 8), grip, { pos: [0, -0.85, 0] }));
      // The reel, on the underside where a spinning reel hangs.
      rod.add(part(new THREE.CylinderGeometry(0.11, 0.11, 0.07, 10), tint(look.reel, 0xb4b8c2),
                   { pos: [0, -0.6, 0.16], rot: [0, 0, Math.PI / 2] }));
      // Straight up on its pegs. Nothing here is fanned or tilted.
      rod.position.set(x, 0.1, 0.34);
      stock.add(rod);
      for (const py of [-1.05, 0.75]) {
        stock.add(part(new THREE.CylinderGeometry(0.05, 0.05, 0.24, 7), metal,
                       { pos: [x, py, 0.26], rot: [Math.PI / 2, 0, 0] }));
      }
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
    /* Proud of the board. At 0.16 from the plaque's CENTRE it stood six
       hundredths of a unit off a face that is a tenth thick - and in a scene
       whose depth buffer stretches from 0.1 to 4000 units, six hundredths is
       inside the rounding. The fish lost the z-fight with the board it was
       mounted on. */
    mounted.position.set(0, 0.1, 0.3);
    /* A MOUNT, NOT A FISH UNDER WATER.
       fishSilhouette is the shape used for shoals seen through the surface,
       so its material is 62 per cent transparent with depth-writing off -
       right for something swimming below you, and invisible varnished onto a
       board. The plaque read as an empty brown rectangle, which is what a
       player reported. Its own material now: opaque, double-sided so it faces
       the room, and lifted in lightness so it tells against the wood. */
    mounted.traverse((o) => {
      if (!o.material) return;
      /* AND IT IS NOT CULLED. The silhouette's geometry is built and then
         moved about, so its bounding sphere does not describe where it
         actually is - which never mattered for a shoal of fish a few units
         from the boat, and matters a great deal for one nailed to a wall
         eleven units from a camera that is looking past it. Recomputed, and
         culling switched off for good measure: it is one small mesh. */
      if (o.geometry) o.geometry.computeBoundingSphere();
      o.frustumCulled = false;
      o.material = o.material.clone();          // leave the shoals alone
      o.material.transparent = false;
      o.material.opacity = 1;
      o.material.depthWrite = true;
      o.material.side = THREE.DoubleSide;
      o.material.color.set(c.trophy || 0x3f6b52);
      const hsl = { h: 0, s: 0, l: 0 };
      o.material.color.getHSL(hsl);
      o.material.color.setHSL(hsl.h, hsl.s, Math.max(0.38, hsl.l));
    });
    trophy.add(mounted);
    /* ON THE LEFT WALL, where it belongs. A quarter turn about Y swings the
       plaque's face round to +X so it looks across the room.

       It was invisible here for three reasons, none of them about the wall:
       the board was painted with the boat's charcoal trim, the fish used the
       see-through material meant for shoals under water, and the silhouette's
       bounding sphere describes somewhere it is not, so it was culled. */
    trophy.position.set(-W / 2 + 0.42, 3.1, -2.8);
    trophy.rotation.y = Math.PI / 2;
    g.add(trophy);

    /* ── A WINDOW, on the right wall ──────────────────────────────────────
       A tackle shop with no windows is a shed. This one looks out on what is
       actually out there: sky, a treeline, and the sand of the beach. It is
       PAINTED on the glass rather than modelled - there is no outside to this
       room, and the view through a window in a room like this only has to be
       true to what the player just walked in from. */
    (function outsideWindow() {
      const win = new THREE.Group();
      const WW = 4.0, WH = 2.4;

      /* The view. Sky at the top, a band of trees, then the beach - drawn on
         a canvas so it is one texture and one draw. */
      const view = (function () {
        const cv = document.createElement('canvas');
        cv.width = 256; cv.height = 160;
        const x = cv.getContext('2d');
        const sky = x.createLinearGradient(0, 0, 0, 118);
        sky.addColorStop(0, c.skyHigh || '#7fb8d8');
        sky.addColorStop(1, c.skyLow || '#cfe9f2');
        x.fillStyle = sky;
        x.fillRect(0, 0, 256, 118);
        // The far shore's timber, in two depths so it has some thickness.
        [[c.foliageDark || '#3f7a3a', 116, 30, 13], [c.foliageLight || '#5f9a45', 124, 22, 17]]
          .forEach(function (band) {
            x.fillStyle = band[0];
            for (let i = -1; i < 18; i++) {
              const bx = i * band[3] + ((i % 2) ? 5 : 0);
              x.beginPath();
              x.moveTo(bx, band[1]);
              x.lineTo(bx + band[3] * 0.5, band[1] - band[2]);
              x.lineTo(bx + band[3], band[1]);
              x.closePath();
              x.fill();
            }
          });
        x.fillStyle = c.sand || '#c9b184';
        x.fillRect(0, 124, 256, 36);
        const t = new THREE.CanvasTexture(cv);
        if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace;
        return t;
      })();

      const pane = new THREE.Mesh(
        new THREE.PlaneGeometry(WW, WH),
        new THREE.MeshBasicMaterial({ map: view }));      // daylight, not lit
      pane.frustumCulled = false;
      win.add(pane);

      // Frame and a pair of bars, so it reads as a window and not a picture.
      const fr = 0.16;
      [[0, WH / 2 + fr / 2, WW + fr * 2, fr], [0, -WH / 2 - fr / 2, WW + fr * 2, fr],
       [-WW / 2 - fr / 2, 0, fr, WH + fr * 2], [WW / 2 + fr / 2, 0, fr, WH + fr * 2]]
        .forEach(function (b) {
          win.add(part(new THREE.BoxGeometry(b[2], b[3], 0.18), beam,
                       { pos: [b[0], b[1], -0.02] }));
        });
      win.add(part(new THREE.BoxGeometry(0.08, WH, 0.1), beam, { pos: [0, 0, 0.04] }));
      win.add(part(new THREE.BoxGeometry(WW, 0.08, 0.1), beam, { pos: [0, 0, 0.04] }));
      // A sill to stand a reel on.
      win.add(part(new THREE.BoxGeometry(WW + 0.5, 0.14, 0.42), beam,
                   { pos: [0, -WH / 2 - fr, 0.16] }));

      /* On the right wall, looking out over the beach. A quarter turn the
         other way from the trophy, so its face (+Z) points -X into the room. */
      /* The middle of the right wall, which runs from -6.5 to 6.5. */
      win.position.set(W / 2 - 0.38, 2.9, -0.5);
      win.rotation.y = -Math.PI / 2;
      g.add(win);
    })();

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

    /* No hanging bulb. It was strung over the counter on a flex and, from the
       one angle the shop is ever seen from, it hung squarely in front of the
       shopkeeper's face. The room is lit by the lamps in game.js instead. */

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

  /* The group labels used to say "desert", "space" and "vehicles + fx",
     because this file grew in Benny's Race Tracks and carried three other
     games' props along with it. Those are gone; these are the parts a lake
     is made of. */
  return {
    // materials and the shared building blocks
    paperTexture, skyTexture, waterTexture,
    paper, glow, outline, ink, part, setShadow, INK,

    // the shore, and what grows on it
    cloud, hillBackdrop, hill, pineTree, roundTree, bush, flowerPatch, fence,
    rock, boulder, flower, limb,

    // the town dock
    dock, jetty, dockLamp, signBoard, crate, barrel, dryingRack, lifeRing,
    benchSeat, exitMat,

    // the tackle shop, inside and out
    tackleShop, shopInterior, tackleClutter,
    characterBillboard, faceBillboard,

    // the vessel, the tackle, and what happens on the end of the line
    boat, canoe, kayak, vesselModel, rodRig, netRig, updateRodRig, fishHook, baitModel, castMarker,
    splashRing, updateSplashRing, surfaceDisc,

    // what is down there, and how it is shown
    fishSilhouette, fishShoal, updateShoal, drawShoalTo,
    biomePatch, updateBiomePatch, zoneRing, logJam,
    artifact, itemBeacon, updateItemBeacon,

    // the cards
    fishCard, faceFishCard
  };
})();
