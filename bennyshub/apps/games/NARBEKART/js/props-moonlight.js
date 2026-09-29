/**
 * NARBE Racer — Moonlight Cup scenery and hazards.
 * Grounded, metre-scaled, vertex-painted models. Scenery shares the one
 * Lambert material; gameplay silhouettes share the toon material and ink.
 * Animated children are welded first and marked keep for world chunking.
 */
NK.propsMoonlight = (function () {
  'use strict';
  const A = NK.art, U = NK.util, TAU = Math.PI * 2, HALF = Math.PI / 2;
  const WHITE = 0xf2f7ff, ICE = 0x73cfef, INK = 0x252039;
  const THEMES = {
    frost: { near: ['pine_snowy', 'snowman', 'ice_crystal', 'snow_rock', 'snow_drift', 'lamp_snowy'],
      far: ['snowy_mountain', 'cabin', 'ski_tower', 'pine_cluster_snowy'], landmarks: ['igloo', 'ice_arch'],
      hazards: { block: 'snowman_big', roller: 'snowball', geyser: null, puddle: 'ice_patch' } },
    spooky: { near: ['dead_tree', 'pumpkin', 'gravestone', 'lantern_post', 'glow_mushroom', 'iron_fence'],
      far: ['haunted_house', 'spooky_hill', 'dead_tree_big'], landmarks: ['haunted_house', 'bell_tower'],
      hazards: { block: 'pumpkin_big', roller: 'ghost', geyser: null, puddle: 'goo_puddle' } },
    lava: { near: ['lava_rock', 'torch_pillar', 'spike_rock', 'chain_post', 'skull_rock'],
      far: ['volcano', 'castle_tower', 'castle_wall_piece', 'rock_spire'], landmarks: ['castle_gate', 'volcano'],
      hazards: { block: 'stone_block', roller: 'rolling_boulder', geyser: 'lava_geyser', puddle: 'ash_puddle' } },
    starlight: { near: ['star_buoy', 'asteroid_small', 'crystal_spire', 'ring_gate', 'light_pylon'],
      far: ['planet_ringed', 'planet', 'space_station', 'comet'], landmarks: ['space_station', 'moon_big'],
      hazards: { block: 'space_rock', roller: 'meteor', geyser: 'plasma_vent', puddle: 'gravity_well' } }
  };

  const colour = new THREE.Color();
  function paint(geometry, hex, rng) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    if (g !== geometry) geometry.dispose();
    const p = g.attributes.position, c = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i += 3) {
      const x = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3;
      const y = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
      const z = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
      colour.setHex(typeof hex === 'function' ? hex(x, y, z) : hex);
      const f = rng.range(0.92, 1.06);
      for (let j = 0; j < 3; j++) c.set([colour.r * f, colour.g * f, colour.b * f], (i + j) * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    g.deleteAttribute('uv');
    return g;
  }
  function Kit(rng, hazard) {
    this.rng = rng; this.root = new THREE.Group();
    this.mat = hazard ? A.mat.toonV() : A.mat.lambertV();
  }
  Kit.prototype.add = function (g, c, p, s, r, parent) {
    if (s) g.scale(s[0], s[1], s[2]);
    if (r) { g.rotateX(r[0]); g.rotateY(r[1]); g.rotateZ(r[2]); }
    if (p) g.translate(p[0], p[1], p[2]);
    const m = new THREE.Mesh(paint(g, c, this.rng), this.mat);
    (parent || this.root).add(m); return m;
  };
  const box = (k, w, h, d, c, x, y, z, r) => k.add(new THREE.BoxGeometry(w, h, d), c, [x, y, z], null, r);
  const ball = (k, r, c, x, y, z, s) => k.add(new THREE.IcosahedronGeometry(r, 1), c, [x, y, z], s);
  const cone = (k, r, h, c, x, y, z, rot, n) => k.add(new THREE.ConeGeometry(r, h, n || 7), c, [x, y, z], null, rot);
  const cylinder = (k, rt, rb, h, c, x, y, z, n) => k.add(new THREE.CylinderGeometry(rt, rb, h, n || 8), c, [x, y, z]);
  const ring = (k, rad, tube, c, x, y, z, rot, sc) => k.add(new THREE.TorusGeometry(rad, tube, 5, 24), c, [x, y, z], sc, rot);
  function rod(k, a, b, rad, c) {
    const dir = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const g = new THREE.CylinderGeometry(rad * 0.72, rad, dir.length(), 5);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
    return k.add(g, c, a.map((v, i) => (v + b[i]) / 2));
  }
  function finish(k, ink, dims, ground) {
    // Measure before outlining: silhouettes must obey the collision size.
    k.root.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(k.root), s = new THREE.Vector3();
    b.getSize(s);
    const sx = dims ? dims[0] / s.x : 1, sy = dims ? dims[1] / s.y : 1, sz = dims ? dims[2] / s.z : 1;
    k.root.children.forEach((m) => {
      m.position.x *= sx; m.position.y = m.position.y * sy - b.min.y * sy + (ground || 0); m.position.z *= sz;
      m.scale.multiply(new THREE.Vector3(sx, sy, sz));
    });
    if (ink) {
      // Bake dimensions before making hulls so outlines stay a consistent width.
      k.root = A.mergeByMaterial(k.root);
      A.ink(k.root, 0.055);
    }
    return A.mergeByMaterial(k.root);
  }
  function prop(name, build) {
    A.props[name] = function (rng) {
      const o = build(rng || U.rng(U.hash(name))); o.name = name; return o;
    };
  }
  function hazard(name, kind, theme, build) {
    const fn = function (rng) {
      const o = build(rng || U.rng(U.hash(name))); o.name = name; o.userData.kind = kind; return o;
    };
    A.hazard[name] = A.hazard[kind + ':' + theme] = fn;
  }
  function face(k, y, z, scale, eyes) {
    [-1, 1].forEach((s) => ball(k, 0.12 * scale, eyes || INK, s * 0.26 * scale, y, z, [0.72, 1.2, 0.45]));
  }
  function starGeometry(radius, depth) {
    const shape = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const a = HALF + i * Math.PI / 5, r = radius * (i % 2 ? 0.45 : 1);
      if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    shape.closePath();
    return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 1 }).translate(0, 0, -depth / 2);
  }

  // FROST: snowy evergreens, knitted scarves, amber windows and blue ice.
  function pine(k, x, z, scale) {
    const h = k.rng.range(6.5, 8.5) * scale;
    cylinder(k, 0.22 * scale, 0.36 * scale, h * 0.55, 0x67505b, x, h * 0.275, z);
    for (let i = 0; i < 4; i++) {
      const rad = (2.4 - i * 0.48) * scale, hh = (3.1 - i * 0.25) * scale, y = h * (0.29 + i * 0.18);
      cone(k, rad, hh, i % 2 ? 0x2c6679 : 0x367c85, x, y, z);
      cone(k, rad * 0.92, hh * 0.78, WHITE, x, y + hh * 0.13, z);
    }
  }
  function snowman(k, scale) {
    ball(k, 0.95 * scale, WHITE, 0, 0.85 * scale, 0, [1, 0.9, 1]);
    ball(k, 0.67 * scale, 0xe5f1ff, 0, 1.92 * scale, 0);
    cylinder(k, 0.7 * scale, 0.7 * scale, 0.12 * scale, 0x39465d, 0, 2.4 * scale, 0);
    cylinder(k, 0.43 * scale, 0.48 * scale, 0.52 * scale, 0x39465d, 0, 2.69 * scale, 0);
    cylinder(k, 0.485 * scale, 0.485 * scale, 0.14 * scale, 0xe45466, 0, 2.52 * scale, 0);
    ring(k, 0.53 * scale, 0.13 * scale, 0xe45466, 0, 1.55 * scale, 0, [HALF, 0, 0]);
    box(k, 0.2 * scale, 0.6 * scale, 0.15 * scale, 0xf87687, 0.35 * scale, 1.27 * scale, -0.68 * scale, [0, 0, -0.12]);
    face(k, 2.0 * scale, -0.59 * scale, scale);
    cone(k, 0.11 * scale, 0.55 * scale, 0xf39539, 0, 1.85 * scale, -0.83 * scale, [-HALF, 0, 0]);
    [-1, 1].forEach((s) => {
      rod(k, [s * 0.75 * scale, 1.15 * scale, 0], [s * 1.45 * scale, 1.65 * scale, 0], 0.08 * scale, 0x66505b);
      rod(k, [s * 1.2 * scale, 1.48 * scale, 0], [s * 1.2 * scale, 1.85 * scale, 0], 0.055 * scale, 0x66505b);
    });
    [0.75, 1.13].forEach((y) => ball(k, 0.09 * scale, INK, 0, y * scale, -0.84 * scale));
  }
  prop('pine_snowy', (r) => { const k = new Kit(r); pine(k, 0, 0, r.range(0.85, 1.2)); return finish(k); });
  prop('pine_cluster_snowy', (r) => {
    const k = new Kit(r); for (let i = 0; i < 7; i++) pine(k, Math.cos(i * 2.4) * i * 2.3, Math.sin(i * 2.4) * i * 2.3, r.range(1.1, 2)); return finish(k);
  });
  prop('snowman', (r) => { const k = new Kit(r); snowman(k, r.range(0.9, 1.3)); k.root.userData.faceRoad = true; return finish(k); });
  function crystals(k, col, scale) {
    for (let i = 0; i < 5; i++) {
      const a = i * 2.4, rr = i ? 0.75 * scale : 0, h = (i ? k.rng.range(1.6, 3.6) : 4.4) * scale;
      k.add(new THREE.CylinderGeometry(0.45 * scale, 0.5 * scale, h * 0.7, 5), col,
        [Math.cos(a) * rr, h * 0.35, Math.sin(a) * rr]);
      cone(k, 0.45 * scale, h * 0.45, i % 2 ? 0xceefff : col, Math.cos(a) * rr, h * 0.78, Math.sin(a) * rr, null, 5);
    }
  }
  prop('ice_crystal', (r) => { const k = new Kit(r); crystals(k, ICE, r.range(0.6, 1.2)); return finish(k); });
  prop('snow_rock', (r) => {
    const k = new Kit(r), s = r.range(0.9, 1.5); ball(k, s, 0x859cb5, 0, s * 0.5, 0, [1.4, 0.9, 1]);
    ball(k, s * 0.95, WHITE, 0, s * 0.95, 0, [1.25, 0.45, 0.95]); return finish(k);
  });
  prop('snow_drift', (r) => {
    const k = new Kit(r); for (let i = 0; i < 3; i++) ball(k, r.range(1.5, 2.5), i % 2 ? 0xdeebff : WHITE, i * 1.5 - 1.5, 0.3, 0, [1.3, 0.3, 0.8]);
    k.root.userData.embed = true; return finish(k);
  });
  function lamp(k, snowy) {
    cylinder(k, 0.18, 0.29, 5.6, snowy ? 0x52708e : 0x4b3a65, 0, 2.8, 0);
    cylinder(k, 0.5, 0.7, 0.4, INK, 0, 0.2, 0);
    box(k, 0.85, 1.05, 0.85, snowy ? 0xffd57d : 0xa9ef87, 0, 5.4, 0);
    for (const x of [-0.47, 0.47]) for (const z of [-0.47, 0.47]) box(k, 0.1, 1.15, 0.1, INK, x, 5.4, z);
    cone(k, 0.85, 0.65, snowy ? WHITE : 0x725196, 0, 6.2, 0, null, 4);
    box(k, 1, 0.14, 1, INK, 0, 4.85, 0);
  }
  prop('lamp_snowy', (r) => { const k = new Kit(r); lamp(k, true); return finish(k); });
  prop('snowy_mountain', (r) => {
    const k = new Kit(r), h = r.range(30, 52), rad = h * 0.65;
    k.add(new THREE.ConeGeometry(rad, h, 7, 9), (x, y) => y > h * 0.65 ? WHITE : y > h * 0.39 ? 0xa8bfdc : 0x6c89b1, [0, h / 2, 0]);
    k.add(new THREE.ConeGeometry(rad * 0.6, h * 0.63, 6, 7), (x, y) => y > h * 0.42 ? 0xe4f2ff : 0x96adca, [-rad * 0.65, h * 0.315, rad * 0.2]);
    k.root.userData.embed = true; return finish(k);
  });
  function house(k, haunted) {
    const body = haunted ? 0x685087 : 0xb77757, trim = haunted ? 0xd59151 : 0x553f48;
    box(k, 10, haunted ? 10 : 6, 8, body, 0, haunted ? 5 : 3, 0);
    k.add(new THREE.CylinderGeometry(6.7, 6.7, 10, 3), haunted ? 0x392953 : WHITE, [0, haunted ? 11 : 7, 0], null, [0, 0, HALF]);
    const yh = haunted ? 6 : 3.2;
    [-3.1, 3.1].forEach((x) => {
      box(k, 2, 2.5, 0.15, trim, x, yh, -4.1);
      box(k, 1.6, 2.05, 0.2, 0xffd47c, x, yh, -4.2);
      box(k, 0.15, 2.1, 0.23, trim, x, yh, -4.3);
      box(k, 1.7, 0.14, 0.23, trim, x, yh, -4.3);
    });
    box(k, 2, 3.5, 0.3, 0x423343, 0, 1.75, -4.18);
    ball(k, 0.12, 0xfac45b, 0.62, 1.65, -4.4);
    box(k, 2.3, 3.5, 2, haunted ? 0x796589 : 0x9c786c, 2.6, haunted ? 12 : 8.7, 1);
    for (let i = 0; i < 4; i++) box(k, 11.2 - i * 0.55, 0.4, 1.2, 0xa2a7be, 0, 0.2 + i * 0.4, -6 + i * 0.65);
    if (haunted) {
      cylinder(k, 2.4, 2.8, 16, 0x776191, 4.5, 8, 1, 6);
      cone(k, 3.4, 7, 0x423053, 4.5, 18, 1, null, 6);
      k.add(starGeometry(1.2, 0.2), 0xffd685, [4.5, 12, -1.65]);
      box(k, 2.8, 0.3, 0.2, trim, -3.1, 6, -4.45, [0, 0, 0.35]);
    }
    k.root.userData.faceRoad = true;
  }
  prop('cabin', (r) => { const k = new Kit(r); house(k, false); return finish(k); });
  prop('ski_tower', (r) => {
    const k = new Kit(r); [-3, 3].forEach((x) => rod(k, [x, 0, 0], [x * 0.45, 15, 0], 0.35, 0x567893));
    box(k, 13, 0.7, 0.8, 0x466079, 0, 15, 0);
    for (const s of [-1, 1]) {
      rod(k, [s * 4.2, 15, 0], [s * 4.2, 10, 0], 0.08, 0x576179);
      box(k, 3, 0.3, 1.5, 0xe95c63, s * 4.2, 10, 0);
      box(k, 3, 1.2, 0.2, 0xe95c63, s * 4.2, 10.5, 0.7);
    }
    rod(k, [-3, 3, 0], [1.7, 11, 0], 0.12, 0x819ab0); return finish(k);
  });
  prop('igloo', (r) => {
    const k = new Kit(r);
    k.add(new THREE.SphereGeometry(6, 16, 8, 0, TAU, 0, HALF), (x, y, z) =>
      ((Math.floor(y * 1.2) + Math.floor(Math.atan2(z, x) * 3)) & 1) ? 0xd6eaff : WHITE);
    // A short barrel entrance remains visibly open from the road.
    k.add(new THREE.CylinderGeometry(2, 2, 4, 12, 1, true, 0, Math.PI), 0xc5e2f7, [0, 0, -6], null, [HALF, 0, 0]);
    box(k, 2.4, 2.5, 0.1, 0x3c7193, 0, 1.25, -8.05);
    k.add(new THREE.TorusGeometry(1.9, 0.45, 6, 12, Math.PI), WHITE, [0, 0, -8], [1, 1, 0.75]);
    k.root.userData.faceRoad = true; return finish(k);
  });
  prop('ice_arch', (r) => {
    const k = new Kit(r);
    [-1, 1].forEach((s) => { cylinder(k, 1.7, 2.4, 10, ICE, s * 7, 5, 0, 6); cone(k, 2.1, 4, WHITE, s * 7, 12, 0, null, 6); });
    k.add(new THREE.TorusGeometry(7, 1.6, 5, 12, Math.PI), 0xacecff, [0, 9, 0]);
    for (let i = 0; i < 5; i++) cone(k, 0.55, 2 + (i % 2), 0xc5f2ff, (i - 2) * 2.2, 12.2, 0, [Math.PI, 0, 0], 5);
    return finish(k);
  });
  hazard('snowman_big', 'block', 'frost', (r) => {
    const k = new Kit(r, true); snowman(k, 1); const out = finish(k, true, [2.8, 2.45, 2.35]);
    out.rotation.y = Math.PI; return out; // Look at the approaching racers.
  });

  // SPOOKY: friendly jack-o'-lanterns and storybook houses, never gore.
  function tree(k, scale) {
    const bark = k.rng.pick([0x756080, 0x806078, 0x61566d]);
    rod(k, [0, 0, 0], [0.2 * scale, 4.5 * scale, 0], 0.65 * scale, bark);
    rod(k, [0.2 * scale, 3.6 * scale, 0], [-0.35 * scale, 7.7 * scale, 0.2 * scale], 0.38 * scale, bark);
    [-1, 1].forEach((s) => {
      rod(k, [0, 2.7 * scale, 0], [s * 2.2 * scale, 4.7 * scale, 0], 0.32 * scale, bark);
      rod(k, [s * 2.2 * scale, 4.7 * scale, 0], [s * 2.8 * scale, 6.7 * scale, -0.3 * scale], 0.2 * scale, bark);
      rod(k, [s * 1.8 * scale, 4.3 * scale, 0], [s * 3.3 * scale, 4.6 * scale, 0.6 * scale], 0.16 * scale, bark);
      rod(k, [0, 0.35 * scale, 0], [s * 1.4 * scale, 0, 0.7 * scale], 0.3 * scale, bark);
    });
    face(k, 3.6 * scale, -0.48 * scale, scale * 1.5, 0xc2ee89);
  }
  prop('dead_tree', (r) => { const k = new Kit(r); tree(k, r.range(0.7, 1.2)); return finish(k); });
  prop('dead_tree_big', (r) => { const k = new Kit(r); tree(k, r.range(2.5, 3.5)); return finish(k); });
  function pumpkin(k, scale) {
    for (let i = 0; i < 8; i++) {
      const a = i * TAU / 8;
      ball(k, 0.72 * scale, i % 2 ? 0xec812e : 0xffa03e, Math.cos(a) * 0.55 * scale, 0.9 * scale, Math.sin(a) * 0.55 * scale, [0.95, 1.2, 0.95]);
    }
    rod(k, [0, 1.6 * scale, 0], [0.2 * scale, 2.15 * scale, 0], 0.17 * scale, 0x5a784a);
    [-1, 1].forEach((s) => cone(k, 0.23 * scale, 0.06 * scale, 0xffe48a, s * 0.39 * scale, 1.07 * scale, -1.13 * scale, [-HALF, 0, 0], 3));
    box(k, 0.75 * scale, 0.21 * scale, 0.13 * scale, 0xffe48a, 0, 0.61 * scale, -1.15 * scale);
    box(k, 0.15 * scale, 0.13 * scale, 0.14 * scale, 0xe87925, 0.17 * scale, 0.73 * scale, -1.16 * scale);
  }
  prop('pumpkin', (r) => { const k = new Kit(r); pumpkin(k, r.range(0.65, 1.2)); k.root.userData.faceRoad = true; return finish(k); });
  prop('gravestone', (r) => {
    const k = new Kit(r), h = r.range(1.6, 2.4);
    box(k, 1.55, h, 0.45, 0xa2a3b7, 0, h / 2, 0);
    ball(k, 0.78, 0xa2a3b7, 0, h, 0, [1, 0.6, 0.3]);
    box(k, 2, 0.28, 0.85, 0x77778c, 0, 0.14, 0);
    box(k, 0.17, 0.9, 0.1, 0x666177, 0, h * 0.62, -0.27);
    box(k, 0.65, 0.15, 0.1, 0x666177, 0, h * 0.7, -0.28);
    k.root.userData.faceRoad = true; return finish(k);
  });
  prop('lantern_post', (r) => { const k = new Kit(r); lamp(k, false); return finish(k); });
  prop('glow_mushroom', (r) => {
    const k = new Kit(r);
    for (let i = 0; i < 3; i++) {
      const x = (i - 1) * 1.3, h = r.range(1, 2.8), rad = h * 0.7;
      cylinder(k, 0.18, 0.28, h, 0xc2e4bf, x, h / 2, 0);
      k.add(new THREE.SphereGeometry(rad, 10, 4, 0, TAU, 0, HALF), i % 2 ? 0x70ead2 : 0xc295f1, [x, h, 0], [1, 0.65, 1]);
      for (let j = 0; j < 4; j++) ball(k, rad * 0.14, 0xf0ffcb, x + Math.cos(j * HALF) * rad * 0.6, h + rad * 0.46, Math.sin(j * HALF) * rad * 0.6, [1, 0.3, 1]);
    }
    return finish(k);
  });
  prop('iron_fence', (r) => {
    const k = new Kit(r);
    for (let i = 0; i < 8; i++) { const x = i * 0.9 - 3.15; cylinder(k, 0.06, 0.08, 2.6, 0x51415f, x, 1.3, 0, 5); cone(k, 0.2, 0.45, 0xa390b3, x, 2.75, 0, null, 4); }
    [0.7, 1.8].forEach((y) => box(k, 6.8, 0.12, 0.15, 0x665277, 0, y, 0)); return finish(k);
  });
  prop('haunted_house', (r) => { const k = new Kit(r); house(k, true); return finish(k); });
  prop('spooky_hill', (r) => {
    const k = new Kit(r); k.add(new THREE.SphereGeometry(r.range(14, 22), 12, 5, 0, TAU, 0, HALF), 0x536d58, null, [1.5, 0.45, 1]);
    for (let i = 0; i < 4; i++) cone(k, 2.1, r.range(8, 13), 0x4b3f63, i * 5 - 7.5, 5, 2, null, 5);
    k.root.userData.embed = true; return finish(k);
  });
  prop('bell_tower', (r) => {
    const k = new Kit(r); box(k, 7, 12, 7, 0x766088, 0, 6, 0);
    for (const x of [-2.8, 2.8]) for (const z of [-2.8, 2.8]) box(k, 0.65, 6, 0.65, 0xa894b2, x, 15, z);
    cylinder(k, 0.8, 1.8, 2.8, 0xe5bd58, 0, 15, 0, 10);
    ball(k, 0.4, 0x7f614b, 0, 13.5, 0); cone(k, 5.7, 6, 0x453053, 0, 21, 0, null, 4);
    box(k, 8.2, 0.5, 8.2, 0xc0a4c6, 0, 12, 0); return finish(k);
  });
  hazard('pumpkin_big', 'block', 'spooky', (r) => {
    const k = new Kit(r, true); pumpkin(k, 1); const out = finish(k, true, [2.8, 2.3, 2.6]);
    out.rotation.y = Math.PI; return out;
  });
  hazard('ghost', 'roller', 'spooky', (r) => {
    const k = new Kit(r, true);
    ball(k, 1, WHITE, 0, 1.2, 0, [1, 1.1, 0.75]);
    cylinder(k, 0.9, 1, 0.8, WHITE, 0, 0.8, 0, 10);
    for (let i = 0; i < 5; i++) ball(k, 0.25, 0xe1d7ff, Math.cos(i * TAU / 5) * 0.7, 0.32, Math.sin(i * TAU / 5) * 0.55);
    face(k, 1.45, 0.72, 1.4); ball(k, 0.16, 0x9c79b5, 0, 1.04, 0.8, [1, 1.2, 0.45]);
    return finish(k, true, [2.05, 2.25, 1.65]);
  });

  // LAVA: purple basalt, brass trim and exaggerated castle silhouettes.
  function basalt(k, scale, sharp) {
    const n = sharp ? 3 : 4;
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * scale * 0.8, h = k.rng.range(1.5, 3.2) * scale;
      if (sharp) cone(k, 0.75 * scale, h, i % 2 ? 0x75667f : 0x554957, x, h / 2, 0, [0, 0, (i - 1) * 0.18], 5);
      else ball(k, scale, i % 2 ? 0x766172 : 0x554453, x, scale * 0.5, 0, [1.1, 0.8, 0.8]);
      if (!sharp) rod(k, [x - scale * 0.5, scale * 0.9, -scale * 0.6], [x + scale * 0.35, scale * 0.3, -scale * 0.7], scale * 0.055, 0xf99835);
    }
  }
  prop('lava_rock', (r) => { const k = new Kit(r); basalt(k, r.range(0.7, 1.2), false); return finish(k); });
  prop('spike_rock', (r) => { const k = new Kit(r); basalt(k, r.range(0.9, 1.6), true); return finish(k); });
  prop('rock_spire', (r) => { const k = new Kit(r); basalt(k, r.range(5, 8), true); k.root.userData.embed = true; return finish(k); });
  function flame(k, x, y, z, sc) {
    ball(k, sc * 0.5, 0xff8b32, x, y, z, [1, 1.5, 1]);
    cone(k, sc * 0.42, sc * 1.8, 0xffa73c, x + sc * 0.14, y + sc * 0.8, z, [0, 0, -0.2], 6);
    cone(k, sc * 0.26, sc * 1.3, 0xffe39a, x, y + sc * 0.3, z - sc * 0.2, [0, 0, 0.15], 5);
  }
  prop('torch_pillar', (r) => {
    const k = new Kit(r); cylinder(k, 0.7, 1.1, 4.7, 0x756578, 0, 2.35, 0, 6);
    cylinder(k, 1.1, 0.8, 0.8, 0xc79958, 0, 4.7, 0, 8); flame(k, 0, 5.3, 0, 1); return finish(k);
  });
  prop('chain_post', (r) => {
    const k = new Kit(r);
    [-3, 3].forEach((x) => { box(k, 0.9, 2.7, 0.9, 0x82748a, x, 1.35, 0); cone(k, 0.8, 0.8, 0xbb9f74, x, 3.1, 0, null, 4); });
    for (let i = 0; i < 11; i++) ring(k, 0.34, 0.095, 0xafa2ad, i * 0.55 - 2.75, 1.6 + Math.pow((i - 5) / 5, 2) * 0.85, 0, [0, i % 2 ? HALF : 0, 0], [1.2, 0.9, 1]);
    return finish(k);
  });
  prop('skull_rock', (r) => {
    const k = new Kit(r); ball(k, 1.6, 0xc3b4a2, 0, 1.5, 0, [1.1, 1, 0.8]);
    [-0.62, 0.62].forEach((x) => ball(k, 0.43, 0x493e4e, x, 1.65, -1.14, [1, 1.12, 0.28]));
    cone(k, 0.27, 0.1, 0x69535b, 0, 1.08, -1.25, [-HALF, 0, 0], 3);
    for (let i = 0; i < 4; i++) box(k, 0.32, 0.55, 0.5, 0xe6d4b5, i * 0.4 - 0.6, 0.52, -0.8);
    k.root.userData.faceRoad = true; return finish(k);
  });
  function tower(k, x, z, scale) {
    cylinder(k, 3 * scale, 3.6 * scale, 14 * scale, 0x85758d, x, 7 * scale, z, 8);
    cylinder(k, 3.55 * scale, 3.55 * scale, 1.2 * scale, 0xb7a4b5, x, 14 * scale, z, 8);
    for (let i = 0; i < 8; i++) { const a = i * TAU / 8; box(k, 1.4 * scale, 2 * scale, 1.2 * scale, 0x8f7b91, x + Math.cos(a) * 3 * scale, 15.4 * scale, z + Math.sin(a) * 3 * scale, [0, -a, 0]); }
    box(k, 0.65 * scale, 2.7 * scale, 0.12 * scale, 0xffcd7f, x, 9 * scale, z - 3.04 * scale);
  }
  prop('castle_tower', (r) => { const k = new Kit(r); tower(k, 0, 0, r.range(0.9, 1.25)); return finish(k); });
  prop('castle_wall_piece', (r) => {
    const k = new Kit(r); box(k, 18, 8, 3, 0x786b81, 0, 4, 0);
    box(k, 18.8, 0.5, 3.5, 0xab97ad, 0, 8, 0);
    for (let i = 0; i < 7; i++) box(k, 1.5, 1.8, 3.1, 0x8c7890, i * 2.7 - 8.1, 9, 0);
    for (let i = 1; i < 4; i++) box(k, 18, 0.1, 0.08, 0x5d506c, 0, i * 2, -1.55);
    return finish(k);
  });
  prop('castle_gate', (r) => {
    const k = new Kit(r); tower(k, -8, 0, 1.2); tower(k, 8, 0, 1.2);
    box(k, 10, 4, 3, 0x827089, 0, 12, 0);
    k.add(new THREE.TorusGeometry(4.5, 0.7, 5, 12, Math.PI), 0xc5a77a, [0, 8, -1.6]);
    for (let i = 0; i < 7; i++) box(k, 0.28, 9, 0.35, 0x3d3549, i * 1.2 - 3.6, 4.5, -0.8);
    [3, 6].forEach((y) => box(k, 9, 0.28, 0.35, 0x3d3549, 0, y, -1));
    k.add(starGeometry(1.1, 0.3), 0xffcd5b, [0, 12, -1.7]); k.root.userData.faceRoad = true; return finish(k);
  });
  prop('volcano', (r) => {
    const k = new Kit(r), h = r.range(28, 40), rad = h * 0.85;
    cylinder(k, 5, rad, h, (x, y) => y > h * 0.84 ? 0x975943 : 0x65505d, 0, h / 2, 0, 12);
    cylinder(k, 4.8, 4.8, 0.3, 0xffab37, 0, h + 0.1, 0, 12);
    ring(k, 5.2, 0.8, 0xa46149, 0, h, 0, [HALF, 0, 0]);
    for (let i = 0; i < 3; i++) {
      const a = i * 2.2, top = [Math.cos(a) * 4.7, h, Math.sin(a) * 4.7], end = [Math.cos(a) * rad * 0.85, 2, Math.sin(a) * rad * 0.85];
      rod(k, end, top, 0.75, 0xf7822a);
    }
    k.root.userData.embed = true; return finish(k);
  });
  hazard('stone_block', 'block', 'lava', (r) => {
    const k = new Kit(r, true); box(k, 2.8, 2.2, 2.6, 0x9c8aa4, 0, 1.1, 0);
    for (const y of [0.5, 1.5]) { box(k, 2.86, 0.12, 2.65, 0x5b4964, 0, y, 0); }
    k.add(starGeometry(0.55, 0.08), 0xffc65c, [0, 1.08, 1.36]);
    return finish(k, true, [2.8, 2.25, 2.7]);
  });

  // STARLIGHT: enamel-coloured planets and playful space hardware.
  prop('star_buoy', (r) => {
    const k = new Kit(r); cylinder(k, 0.65, 1.1, 0.4, 0x757ed5, 0, 0.2, 0);
    rod(k, [0, 0.4, 0], [0, 3.5, 0], 0.1, 0xaac9ec);
    k.add(starGeometry(1.25, 0.4), 0xffd876, [0, 3.3, 0]);
    face(k, 3.4, -0.23, 0.8); return finish(k);
  });
  function asteroid(k, size, colourHex) {
    ball(k, size, colourHex, 0, size, 0, [1.15, 1, 0.92]);
    for (let i = 0; i < 4; i++) {
      const a = i * 2.3; ball(k, size * 0.23, 0x605a8e, Math.cos(a) * size * 0.65, size * (1.15 + (i % 2) * 0.42), -size * 0.72, [1, 0.72, 0.25]);
    }
  }
  prop('asteroid_small', (r) => { const k = new Kit(r); asteroid(k, r.range(1.1, 2.2), 0xada1d1); return finish(k); });
  prop('crystal_spire', (r) => { const k = new Kit(r); crystals(k, r.pick([0xb991f2, 0x8bacef, 0x84e3df]), r.range(1.1, 1.8)); return finish(k); });
  prop('ring_gate', (r) => {
    const k = new Kit(r); ring(k, 4, 0.6, 0x8f87e4, 0, 4.6, 0);
    ring(k, 4, 0.17, 0xffd786, 0, 4.6, -0.62);
    [-1, 1].forEach((s) => box(k, 1.4, 1.2, 1.7, 0x5762a3, s * 2.8, 0.6, 0)); return finish(k);
  });
  prop('light_pylon', (r) => {
    const k = new Kit(r); cylinder(k, 0.7, 1.3, 1, 0x6d70ad, 0, 0.5, 0, 6);
    cylinder(k, 0.35, 0.55, 6.5, 0x8799db, 0, 3.7, 0, 6);
    for (let i = 0; i < 3; i++) ring(k, 0.8 - i * 0.12, 0.17, i % 2 ? 0xa9f4f2 : 0xffd87c, 0, 4.3 + i, 0, [HALF, 0, 0]);
    ball(k, 0.65, 0xc1fbff, 0, 7, 0); return finish(k);
  });
  function planet(k, withRing, moon) {
    const radius = moon ? 20 : k.rng.range(12, 18), col = moon ? 0xd8dafa : k.rng.pick([0xdb90c2, 0x85b9ec, 0xf0c183]);
    ball(k, radius, col, 0, radius, 0);
    if (withRing) {
      for (let i = 0; i < 3; i++) ring(k, radius * (1.48 + i * 0.16), radius * 0.085, [0xa397e7, 0xf7d69c, 0xbcccf2][i], 0, radius, 0, [HALF - 0.28, 0.2, 0]);
    } else {
      for (let i = 0; i < 7; i++) {
        const a = i * 2.4, yy = k.rng.range(-0.55, 0.6), x = Math.cos(a) * radius * 0.65;
        ball(k, radius * k.rng.range(0.12, 0.2), moon ? 0xb0b3da : 0xb589c0, x, radius * (1 + yy), -Math.sqrt(Math.max(0, radius * radius - x * x - yy * yy * radius * radius)) * 0.98, [1, 0.8, 0.15]);
      }
    }
  }
  prop('planet_ringed', (r) => { const k = new Kit(r); planet(k, true, false); return finish(k); });
  prop('planet', (r) => { const k = new Kit(r); planet(k, false, false); return finish(k); });
  prop('moon_big', (r) => { const k = new Kit(r); planet(k, false, true); return finish(k); });
  prop('space_station', (r) => {
    const k = new Kit(r);
    ball(k, 5, 0xd5e2fb, 0, 6, 0, [1.15, 0.65, 1]);
    ring(k, 8.5, 0.65, 0x948ce4, 0, 6, 0, [HALF, 0, 0]);
    cylinder(k, 1.6, 2.2, 6, 0xc9d5f4, 0, 10, 0);
    ball(k, 0.6, 0xffd58b, 0, 14, 0);
    for (const s of [-1, 1]) {
      box(k, 17, 0.4, 0.5, 0xc1c7e9, s * 11, 6, 0);
      box(k, 10, 0.25, 9, 0x545b9d, s * 15, 6, 0);
      for (let i = 0; i < 5; i++) box(k, 0.15, 0.28, 9, 0x99cef3, s * 15 + i * 2 - 4, 6.2, 0);
      [-2, 2].forEach((z) => box(k, 10, 0.28, 0.14, 0x99cef3, s * 15, 6.2, z));
    }
    for (let i = 0; i < 7; i++) { const a = i * TAU / 7; ball(k, 0.45, 0x7ddbe5, Math.cos(a) * 4.6, 6.8, Math.sin(a) * 4.2, [1, 1, 0.5]); }
    return finish(k);
  });
  prop('comet', (r) => {
    const k = new Kit(r); ball(k, 3.5, 0xc8edff, -6, 4, 0);
    for (let i = 0; i < 3; i++) {
      const tail = new THREE.ConeGeometry(2.2 - i * 0.45, 17 - i * 2, 6).rotateZ(-HALF);
      k.add(tail, [0x8991ee, 0xaebcff, 0xddefff][i], [3, 4 + i * 0.25, (i - 1) * 1.7]);
    }
    return finish(k);
  });
  hazard('space_rock', 'block', 'starlight', (r) => { const k = new Kit(r, true); asteroid(k, 1.2, 0xc5a6ea); return finish(k, true, [2.8, 2.4, 2.6]); });

  // Round rollers stay centred so world.js can spin them around their bounds.
  function roller(r, type) {
    const k = new Kit(r, true), col = type === 'snow' ? WHITE : type === 'meteor' ? 0xca94c6 : 0x97839f;
    ball(k, 1, col, 0, 1, 0);
    for (let i = 0; i < 6; i++) {
      const a = i * TAU / 6, x = Math.cos(a) * 0.58, y = 1 + Math.sin(a) * 0.58;
      ball(k, 0.18, type === 'snow' ? 0xaccfe8 : type === 'meteor' ? 0xffc26b : 0x59445f, x, y, -0.77, [1, 1, 0.3]);
    }
    return finish(k, true, [2, 2, 2]);
  }
  hazard('snowball', 'roller', 'frost', (r) => roller(r, 'snow'));
  hazard('rolling_boulder', 'roller', 'lava', (r) => roller(r, 'rock'));
  hazard('meteor', 'roller', 'starlight', (r) => roller(r, 'meteor'));

  // Flat, ring-painted patches keep their visible outline inside a single lane.
  function puddle(r, colours, type) {
    const k = new Kit(r, true), segs = 40, rings = 8, positions = [], indices = [];
    for (let j = 0; j <= rings; j++) for (let i = 0; i < segs; i++) {
      const a = i / segs * TAU, rad = j / rings * (1 + 0.035 * Math.sin(5 * a));
      positions.push(Math.cos(a) * rad * 1.48, 0, Math.sin(a) * rad * 3);
    }
    for (let j = 0; j < rings; j++) for (let i = 0; i < segs; i++) {
      const a = j * segs + i, b = j * segs + (i + 1) % segs, c = a + segs, d = b + segs;
      indices.push(a, b, c, b, d, c);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); g.setIndex(indices); g.computeVertexNormals();
    k.add(g, (x, y, z) => {
      const rho = Math.hypot(x / 1.48, z / 3);
      if (rho > 0.91) return colours[0];
      if (type === 'swirl') return colours[1 + ((Math.floor(rho * 8 + Math.atan2(z / 3, x / 1.48) / TAU * 3) % 2 + 2) % 2)];
      return rho > 0.72 ? colours[2] : colours[1];
    });
    if (type === 'ice') {
      [-1, 1].forEach((s) => { box(k, 0.08, 0.005, 1.9, 0xdcf7ff, s * 0.48, 0.006, 0, [0, s * 0.55, 0]); });
    }
    return finish(k, false, null, 0.02);
  }
  hazard('ice_patch', 'puddle', 'frost', (r) => puddle(r, [0x29578c, 0x8ad8ed, 0xd5f4ff], 'ice'));
  hazard('goo_puddle', 'puddle', 'spooky', (r) => puddle(r, [0x293a29, 0x89c956, 0xbbdf69], 'swirl'));
  hazard('ash_puddle', 'puddle', 'lava', (r) => puddle(r, [0x2c2033, 0x827383, 0xb59891], 'plain'));
  hazard('gravity_well', 'puddle', 'starlight', (r) => puddle(r, [0x272347, 0x8270d1, 0xcab0f4], 'swirl'));

  function geyser(r, plasma) {
    const k = new Kit(r, true), c = plasma ? 0xa291fa : 0xffa23b;
    cylinder(k, 0.85, 1.25, 0.4, plasma ? 0x6c66a6 : 0x756073, 0, 0.2, 0, 10);
    ring(k, 0.76, 0.18, c, 0, 0.45, 0, [HALF, 0, 0]);
    const out = finish(k, true);
    const columnKit = new Kit(r, true);
    cylinder(columnKit, 0.5, 0.8, 5.4, c, 0, 2.7, 0, 9);
    cone(columnKit, 0.8, 0.6, plasma ? 0xd5c8ff : 0xffda85, 0, 5.7, 0, null, 9);
    const column = finish(columnKit, false); column.userData.keep = true;
    out.add(column); column.visible = false;
    out.userData.setState = function (active, warn, u) {
      column.visible = !!(active || warn);
      // A steady low warning column, never a flashing effect.
      column.scale.set(1, active ? 0.93 + 0.07 * Math.sin((u || 0) * TAU * 3) : 0.08, 1);
    };
    return out;
  }
  hazard('lava_geyser', 'geyser', 'lava', (r) => geyser(r, false));
  hazard('plasma_vent', 'geyser', 'starlight', (r) => geyser(r, true));
  return { THEMES };
})();
