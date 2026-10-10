/** NARBE Racer — timed automatic items and their track-space projectiles. */
NK.items = (function () {
  'use strict';
  const C = NK.C, U = NK.util;
  const DEFS = {};
  [
    ['rocket', 'Rocket', '🚀', 'boost'], ['rocket3', 'Triple Rocket', '🚀', 'boost'],
    ['goldrocket', 'Golden Rocket', '🌟🚀', 'boost'], ['peel', 'Banana Peel', '🍌', 'trap'],
    ['peel3', 'Triple Peel', '🍌', 'trap'], ['ball', 'Bumper Ball', '🟢', 'projectile'],
    ['bee', 'Homing Bee', '🐝', 'projectile'], ['zapper', 'Leader Zapper', '⚡', 'projectile'],
    ['star', 'Super Star', '⭐', 'effect'], ['shrink', 'Shrink Ray', '🔻', 'effect'],
    ['jet', 'Jet Mode', '✈️', 'effect'], ['horn', 'Honk Horn', '📯', 'defence'],
    ['mega', 'Mega Grow', '💪', 'effect'], ['coins', 'Coin Bag', '🪙', 'coins'],
    ['bomb', 'Boom Box', '💣', 'projectile']
  ].forEach(([id, name, emoji, type]) => { DEFS[id] = { id, name, emoji, speech: name, type }; });

  // Positions are scaled to a twelve-kart grid, including smaller test grids.
  const ODDS = [
    { through: 3, weights: { rocket: 12, peel: 22, peel3: 12, ball: 15, bee: 4, horn: 15, coins: 17, bomb: 3 } },
    { through: 8, weights: { rocket: 18, rocket3: 9, peel: 5, peel3: 5, ball: 14, bee: 16, zapper: 3, star: 7, shrink: 3, horn: 6, mega: 5, coins: 4, bomb: 5 } },
    { through: 12, weights: { rocket: 5, rocket3: 22, goldrocket: 14, ball: 3, bee: 10, zapper: 7, star: 13, shrink: 6, jet: 10, horn: 2, mega: 7, bomb: 1 } }
  ];

  /** Past the back band: the best a player at the back with a full purse can reach. */
  const JACKPOT = { rocket3: 20, goldrocket: 30, star: 24, jet: 18, mega: 8 };

  /**
   * The odds a racer rolls from. Place picks the band. A player's coins then
   * pull the odds part of the way toward the next band up: a little per coin,
   * more per coin the further back the player is (C.COIN_PULL), and from the
   * back band on into JACKPOT. CPUs roll by place alone. The coins are spent
   * by the roll (race.js). → { band, pull 0..1, weights }
   */
  function odds(R, r) {
    const count = Math.max(1, R.racers.length);
    const place = R.placeOf ? R.placeOf(r) : r.place;
    const back = count === 1 ? 0 : U.clamp((place - 1) / (count - 1), 0, 1);
    const band = ODDS.findIndex((b) => 1 + back * 11 <= b.through);
    const per = C.COIN_PULL[0] + (C.COIN_PULL[1] - C.COIN_PULL[0]) * back;
    const pull = r.isHuman ? Math.min(1, (r.coins || 0) * per) : 0;
    const from = ODDS[band].weights;
    if (!pull) return { band, pull, weights: from };
    const to = band + 1 < ODDS.length ? ODDS[band + 1].weights : JACKPOT, weights = {};
    Object.keys(from).concat(Object.keys(to)).forEach((id) => { weights[id] = (from[id] || 0) * (1 - pull) + (to[id] || 0) * pull; });
    return { band, pull, weights };
  }

  function roll(R, r) {
    if (R.timeTrial) return 'rocket';
    const weights = odds(R, r).weights;
    const entries = Object.keys(weights).filter((id) => weights[id] > 0 && (id !== 'zapper' || R.mode.zapper));
    const weight = (id) => weights[id] * (R.modeId === 'nofail' && r.isHuman && DEFS[id].type === 'boost' ? 1.5 : 1);
    let pick = R.rng.next() * entries.reduce((sum, id) => sum + weight(id), 0);
    for (let i = 0; i < entries.length; i++) { pick -= weight(entries[i]); if (pick < 0) return entries[i]; }
    return entries[entries.length - 1];
  }

  function invincible(r) { return r.starT > 0 || r.megaT > 0 || r.jetT > 0; }
  function list(R) { return R.itemObjects || (R.itemObjects = []); }
  function separation(R, a, b) { return Math.hypot(U.loopDelta(a.s, b.s, R.L), a.x - b.x); }
  function burst(R, s, x, color, count) {
    if (!R.fx || !R.fx.burst) return;
    const p = R.world.pointAt(s, x, new THREE.Vector3()); p.y += 1;
    R.fx.burst(p, color, count || 24);
  }
  function destroy(o) {
    if (!o.mesh) return;
    if (o.mesh.parent) o.mesh.parent.remove(o.mesh);
    // Horn rings use cached geometry but private, animated materials.
    if (o.mesh.userData.dispose) o.mesh.userData.dispose();
    else if (NK.art && NK.art.disposeTree) NK.art.disposeTree(o.mesh);
    o.mesh = null;
  }
  function make(R, owner, type, offset, options) {
    const o = Object.assign({ type, ownerIdx: owner.idx, progress: owner.progress + offset,
      s: U.mod(owner.progress + offset, R.L), x: owner.x, v: 0, age: 0, life: 5,
      radius: 0.9, targetIdx: -1, dead: false, mesh: null }, options || {});
    const A = NK.art && NK.art.items;
    const factory = A && A[type === 'horn' ? 'hornWave' : type];
    if (factory) { o.mesh = factory(); R.scene.add(o.mesh); pose(R, o, 0); }
    list(R).push(o);
    return o;
  }

  function blast(R, o, radius, kind) {
    const owner = R.racers.find((r) => r.idx === o.ownerIdx) || null;
    R.racers.forEach((r) => {
      if (r.idx !== o.ownerIdx && !r.finished && !r.fallT && !r.rescueT && separation(R, o, r) <= radius)
        R.hitRacer(r, { kind, by: owner, itemId: o.type });
    });
    burst(R, o.s, o.x, kind === 'zapper' ? 0x9a77ff : 0xff861b, 42);
    o.dead = true;
  }

  function give(R, r, id) {
    if (!r || !DEFS[id]) return false;
    r.item = id; r.roulette = 0; r.rouletteKind = null;
    r.itemUseDelay = 3 + R.rng.next() * 3;
    r.itemUseT = r.itemUseDelay;
    r._timedItem = id;
    return true;
  }

  function tickHeld(R, r, dt) {
    if (!r.item) { r.itemUseT = r.itemUseDelay = 0; r._timedItem = null; return; }
    if (r.finished || r.roulette > 0 || r.fallT > 0 || r.rescueT > 0) return;
    // Also schedule items granted by developer tools or a saved setup.
    if (r._timedItem !== r.item) { give(R, r, r.item); return; }
    r.itemUseT = Math.max(0, r.itemUseT - dt);
    if (r.itemUseT <= 1e-8) use(R, r);
  }

  function use(R, r) {
    const id = r.item;
    if (!id || !DEFS[id] || r.roulette > 0 || r.finished) return false;
    r.item = null; r.itemUseT = r.itemUseDelay = 0; r._timedItem = null;
    R.emit('itemUse', r, id);
    switch (id) {
      case 'rocket': R.boost(r, 1.3, 'rocket'); break;
      case 'rocket3': R.boost(r, 3.6, 'rocket'); break;
      case 'goldrocket': R.boost(r, 5.5, 'rocket'); break;
      case 'peel': make(R, r, 'peel', -4, { life: 30, radius: 0.95 }); break;
      case 'peel3':
        for (let i = 0; i < 3; i++) make(R, r, 'peel', -4 - i * 5, { life: 30, radius: 0.95 });
        break;
      case 'ball': make(R, r, 'ball', 4, { v: r.v + 28, radius: 0.85 }); break;
      case 'bee': {
        const target = R.ahead(r);
        make(R, r, 'bee', 4, { v: r.v + 28, life: 8,
          targetIdx: target && R.gap(target, r) <= 250 ? target.idx : -1 });
        break;
      }
      case 'zapper': {
        if (!R.mode.zapper) { R.boost(r, 1.3, 'rocket'); break; }
        const leader = R.byPlace().find((candidate) => !candidate.finished && candidate.idx !== r.idx);
        if (leader) make(R, r, 'zapper', 4, { v: Math.max(65, r.v + 38), life: 18, targetIdx: leader.idx });
        break;
      }
      case 'star': r.starT = Math.max(r.starT || 0, 6); break;
      case 'mega': r.megaT = Math.max(r.megaT || 0, 7); break;
      case 'jet': r.jetT = Math.max(r.jetT || 0, 5); break;
      case 'shrink':
        R.racers.forEach((other) => {
          if (other.idx === r.idx || other.finished || invincible(other) || other.invulnT > 0) return;
          other.shrinkT = Math.max(other.shrinkT || 0, R.modeId === 'nofail' && other.isHuman ? 2.5 : 5);
          other.item = null; other.roulette = 0; other.rouletteKind = null;
          other.itemUseT = other.itemUseDelay = 0; other._timedItem = null;
          burst(R, other.s, other.x, 0xbe77ff, 15);
        });
        break;
      case 'coins': R.giveCoins(r, 3); break;
      case 'horn': {
        const o = make(R, r, 'horn', 0, { life: 0.65 });
        list(R).forEach((other) => {
          if (['peel', 'ball', 'bee', 'bomb', 'zapper'].includes(other.type) && separation(R, r, other) <= 8) {
            other.dead = true; burst(R, other.s, other.x, 0xffd338, 12);
          }
        });
        R.racers.forEach((other) => {
          if (other.idx !== r.idx && !other.finished && separation(R, r, other) <= 8)
            R.hitRacer(other, { kind: 'horn', by: r, itemId: id });
        });
        o.x = r.x;
        break;
      }
      case 'bomb': make(R, r, 'bomb', 0, { life: 1.2, launchProgress: r.progress, v: 35 / 0.55, radius: 1.2 }); break;
    }
    return true;
  }

  function pose(R, o, dt) {
    if (!o.mesh) return;
    const mesh = o.mesh, A = NK.art.items;
    let height = 0.08;
    if (o.type === 'bee') height += 0.65 + Math.sin(o.age * 12) * 0.12;
    if (o.type === 'zapper') height += 5 + Math.sin(o.age * 6) * 0.3;
    if (o.type === 'bomb' && o.age < 0.55) height += 4.5 * Math.sin(Math.PI * o.age / 0.55);
    // Round a loop, items ride the loop's surface like the karts do.
    const lp = R.world.loopPose ? R.world.loopPose(o.progress, o.x) : null;
    if (lp) {
      mesh.position.copy(lp.pos).addScaledVector(lp.up, height);
      mesh.quaternion.copy(lp.quat);
    } else {
      R.world.pointAt(o.s, o.x, mesh.position);
      const frame = R.world.frameAt(o.s);
      mesh.rotation.set(0, frame.yaw === undefined ? -frame.heading : frame.yaw, -(frame.bank || 0));
      mesh.position.y += height;
    }
    const d = mesh.userData;
    if (o.type === 'ball' && d.roll) d.roll.rotation.x -= o.v * dt / (d.radius || 0.8);
    if (o.type === 'bee' && d.wings) d.wings.forEach((wing, i) => { wing.rotation.z = (i ? 1 : -1) * Math.sin(o.age * 55) * 0.55; });
    if (o.type === 'zapper' && d.spin) d.spin.rotation.y = o.age * 5;
    if (o.type === 'bomb' && d.fuse) d.fuse.scale.setScalar(0.8 + Math.sin(o.age * 40) * 0.2);
    if (o.type === 'horn' && A.updateHornWave) A.updateHornWave(mesh, o.age / o.life);
  }

  // Relative swept tests prevent a fast projectile from skipping a kart at
  // low frame rates. Wrapped distance also handles the start/finish seam.
  function overlaps(R, o, r, oldS, oldX, moved, dt) {
    const rMoved = Math.max(0, r.v || 0) * dt;
    const start = U.loopDelta(oldS, U.mod(r.s - rMoved, R.L), R.L);
    const finish = start + rMoved - moved;
    const length = C.KART_LEN * 0.5 + o.radius;
    if (Math.min(start, finish) > length || Math.max(start, finish) < -length) return false;
    const t = Math.abs(finish - start) > 0.0001 ? U.clamp(-start / (finish - start), 0, 1) : 1;
    return Math.abs(r.x - U.lerp(oldX, o.x, t)) <= C.KART_HALF + o.radius;
  }

  function update(R, dt) {
    const objects = list(R);
    for (let i = objects.length - 1; i >= 0; i--) {
      const o = objects[i];
      if (o.dead) { destroy(o); objects.splice(i, 1); continue; }
      const oldS = o.s, oldX = o.x, oldProgress = o.progress;
      o.age += dt;
      const target = o.targetIdx >= 0 ? R.racers.find((r) => r.idx === o.targetIdx) : null;
      if (target && !target.finished && !target.fallT && !target.rescueT) {
        const distance = U.mod(target.s - o.s, R.L);
        const nearby = Math.abs(U.loopDelta(o.s, target.s, R.L));
        if (o.type === 'zapper') o.v = Math.max(70, target.v + 35, distance / 2);
        else if (o.type === 'bee') o.v = Math.max(o.v, target.v + 15);
        const rate = o.type === 'zapper' ? 15 : 6;
        o.x += U.clamp(target.x - o.x, -rate * dt, rate * dt);
        if (o.type === 'zapper' && nearby < Math.max(4, o.v * dt) && Math.abs(o.x - target.x) < 3) {
          o.s = target.s; o.x = target.x; blast(R, o, 6, 'zapper');
        }
      }
      if (!o.dead) {
        if (o.type === 'bomb') o.progress = o.launchProgress + 35 * Math.min(1, o.age / 0.55);
        else o.progress = R.world.shiftS ? R.world.shiftS(o.progress, o.v * dt) : o.progress + o.v * dt;
        o.s = U.mod(o.progress, R.L);
        // Over a jump's gap there is no road: peels and balls tumble away.
        if ((o.type === 'peel' || o.type === 'ball') && R.world.inGap && R.world.inGap(o.progress)) {
          burst(R, o.s, o.x, 0xffda46, 10); o.dead = true;
        }
      }
      if (!o.dead) {
        if (o.type !== 'horn' && o.type !== 'zapper' && (o.type !== 'bomb' || o.age >= 0.45)) {
          for (let k = 0; k < R.racers.length; k++) {
            const r = R.racers[k];
            if (r.idx === o.ownerIdx || r.finished || r.fallT || r.rescueT || r.y > 2.3) continue;
            if (!overlaps(R, o, r, oldS, oldX, o.progress - oldProgress, dt)) continue;
            if (o.type === 'bomb') blast(R, o, 7, 'bomb');
            else {
              R.hitRacer(r, { kind: 'item', by: R.racers.find((owner) => owner.idx === o.ownerIdx) || null, itemId: o.type });
              burst(R, r.s, r.x, 0xffda46, 15); o.dead = true;
            }
            break;
          }
        }
        if (!o.dead && o.age >= o.life) { if (o.type === 'bomb') blast(R, o, 7, 'bomb'); else o.dead = true; }
      }
      if (o.dead) { destroy(o); objects.splice(i, 1); }
      else pose(R, o, dt);
    }
    // A long race still has a bounded rendering and guidance cost.
    while (objects.length > 96) destroy(objects.shift());
  }
  function objects(R) { return list(R).filter((o) => !o.dead && o.type !== 'horn'); }
  function clear(R) { list(R).forEach(destroy); list(R).length = 0; }
  return { DEFS, ODDS, JACKPOT, odds, roll, give, tickHeld, use, update, objects, clear };
})();
