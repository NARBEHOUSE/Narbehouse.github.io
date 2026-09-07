/**
 * Does every boat stay dry?
 *
 *     node tools/floatcheck.js
 *
 * The lake's surface is not flat: js/world.js lays a standing ripple over it
 * of up to about 0.18 world units, and every hull bobs on top of that. So a
 * floor that clears the STILL waterline by a tenth of a unit is under water
 * for part of every second, and the player sees the lake inside the boat.
 *
 * This builds each vessel for real, finds the lowest point of the surface the
 * player is meant to be standing on - the canoe's floorboards, the kayak's
 * deck, the motorboat's cockpit sole - and checks it against the highest the
 * water can reach underneath it, bob included. It is arithmetic rather than
 * eyesight, which is the only way to be sure of a thing that only goes wrong
 * on some frames.
 */
const H = require('./playtest.js');
const { RT, THREE, ok } = H;

/* The ripple, straight out of js/world.js. Amplitudes only - the phase does
   not matter when what is wanted is the worst case. */
const RIPPLE = 0.11 + 0.07;

/* How each hull sits and rides, from js/game.js (boatDraught/boatBob), and
   which part of it must stay dry. */
const HULLS = [
  { id: 'canoe',     draught: 0.16, bob: 0.045, floor: 'the floorboards' },
  { id: 'kayak',     draught: 0.08, bob: 0.045, floor: 'the deck' },
  { id: 'motorboat', draught: 0.55, bob: 0.10,  floor: 'the bilge floor' },
];

console.log('WATER IN THE BOAT');
console.log();
console.log('hull'.padEnd(11), 'floor y'.padStart(8), 'draught'.padStart(8), 'bob'.padStart(6),
            'clearance'.padStart(10), 'ripple'.padStart(7));

const colors = { hull: '#f4f1e8', deck: '#e4d9c2', dark: '#33302c', canoe: '#e0553f', kayak: '#f2c230' };

HULLS.forEach((h) => {
  const g = RT.art.vesselModel(h.id, colors);
  /* The floor is the widest horizontal surface inside the hull. Rather than
     hunt for it by name, take every mesh, find the flat ones, and use the
     lowest of the broad ones - which is the floor by construction: the bilge
     and the outer bottom are narrower at every station. */
  const box = new THREE.Box3();
  let floorY = null, widest = 0;
  g.traverse((o) => {
    if (!o.isMesh) return;
    box.setFromObject(o);
    const size = new THREE.Vector3();
    box.getSize(size);
    const flat = size.y < 0.45 && size.x > 0.6 && size.z > 1.2;
    if (!flat) return;
    const area = size.x * size.z;
    if (area > widest * 0.7) {
      // Broad and flat: a floor. Take the LOWEST such surface.
      if (floorY === null || box.min.y < floorY) floorY = box.min.y;
      widest = Math.max(widest, area);
    }
  });
  if (floorY === null) { ok(false, h.id + ': could not find a floor to measure'); return; }

  const lowestFloor = floorY - h.draught - h.bob;      // the worst frame
  const clearance = lowestFloor - RIPPLE;
  console.log(h.id.padEnd(11), floorY.toFixed(2).padStart(8), h.draught.toFixed(2).padStart(8),
              h.bob.toFixed(3).padStart(6), clearance.toFixed(2).padStart(10),
              RIPPLE.toFixed(2).padStart(7));
  ok(clearance > 0.05,
     h.id + ': ' + h.floor + ' clears the water by ' + clearance.toFixed(2) +
     ' units at the worst of the bob and the ripple');
});

const res = H.results();
console.log();
console.log(res.fail === 0
  ? res.checks + ' checks passed. Every boat stays dry.'
  : res.fail + ' of ' + res.checks + ' checks failed.');
process.exit(res.fail ? 1 : 0);
