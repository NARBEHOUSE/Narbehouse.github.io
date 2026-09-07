/**
 * Whispering Lake, authored.
 *
 *   node tools/gen_lake.js          # report
 *   node tools/gen_lake.js --write  # write content/lake.json
 *
 * ONE LAKE, five stages of reach. The old design was six zones joined by
 * channels, which meant six of everything - maps, keepers, landmarks - and a
 * travel system to move between them. This is the same amount of GAME on one
 * body of water: what changes as you progress is not where you go but how far
 * out and how deep you can get.
 *
 *     on foot       the shoreline: hand net, then bamboo rod    0-10 ft
 *     canoe         the shallow bay and the weedbeds            10-35 ft
 *     kayak         the deep drop-off and the deep hole         35-75 ft
 *     motorboat     the abyssal trench, in the centre fog       75-120+ ft
 *
 * Depths run to a hundred and twenty feet because the story needs a trench
 * nobody has been to the bottom of. The shoreline stays a hand net's depth.
 *
 * THE SHAPE IS THE DESIGN. The first attempt was a rounded blob with the
 * soundings smoothed across it, and it read as a puddle: the bay did not
 * register, the drop-off came out as a gradient, and there was no reason for
 * any part of the lake to feel different from any other. So the lake is now
 * TWO BASINS joined by a narrows:
 *
 *              Foggy Island        deep, and a long way out
 *          \   .-''-.   /
 *           \ (      ) /            NORTH BASIN   25-45 ft
 *            \ '-..-' /
 *   west  ----'      '----  east    THE NARROWS   a headland from each side,
 *        /                \                       and the ledge runs across it
 *       |   Lily Bay       |        SOUTH BASIN   8-16 ft
 *        \       .        /
 *         '---[DOCK]----'           the town shore
 *
 * The narrows matter more than anything else here. They make the drop-off a
 * gateway rather than a gradient - you can see the far basin from the near
 * one and not be able to get to it - and they give the kayak something
 * specific to be for.
 *
 * HOW THE LAKE IS DESCRIBED. Four lists, all meant to be dragged about in the
 * editor rather than edited here:
 *
 *   shore     control points of the shoreline, splined into a closed curve
 *   island    the same, for the land in the north basin
 *   soundings depth readings in feet; the open bed is a blend of them
 *   ledges    where the bottom STEPS rather than slopes
 *
 * That is a chart, which is the honest way to describe a lake: you do not
 * author a bed mesh, you take soundings and mark the ledges, and the bed
 * follows. It also means the 3D world, the chart and the editor all read one
 * description and cannot disagree - which is how the last version ended up
 * with a map that did not match its own water.
 *
 * UNITS. The same as the old game, so the boat, the dock and the shop keep
 * their proportions: the hull is 9.4 units long, so a unit is about half a
 * metre. The lake is roughly 2700 by 2700 units - a bit under a mile and a
 * half across, which is a real lake you could spend an afternoon on.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'content', 'lake.json');
const WRITE = process.argv.includes('--write');

/* ── The shoreline ────────────────────────────────────────────────────────
   From the dock, east along the town shore, up the east side, through the
   narrows, round the north basin, back down the west side and into Lily Bay.
   -Z is north, matching the engine. */
const SHORE = [
  [60, 70],          // the dock, and the boards running east
  [430, 40],
  [790, -70],
  [1020, -310],
  [1130, -570],      // the east shore of the south basin
  [1040, -830],

  [330, -1010],      // EAST HEADLAND, reaching west into the narrows
  [470, -1190],      // and back out, north of it

  [1090, -1290],
  [1260, -1610],
  [1220, -1990],
  [980, -2330],
  [560, -2530],
  [60, -2590],       // the north shore, behind the island
  [-430, -2490],
  [-810, -2270],
  [-1010, -1950],
  [-990, -1610],
  [-770, -1310],

  [-250, -1130],     // WEST HEADLAND, reaching east into the narrows
  [-430, -970],      // and back out, south of it, into the bay

  [-1090, -890],
  [-1490, -710],
  [-1530, -390],
  [-1260, -150],
  [-790, -30],
  [-300, 50],        // ...and round to the dock
];

/* Foggy Island. Land, in the middle of the north basin: a hole in the water
   rather than a bite out of it, so it is its own closed curve. */
const ISLAND = [
  [140, -1930],
  [360, -2000],
  [430, -2160],
  [300, -2300],
  [60, -2310],
  [-110, -2180],
  [-80, -1990],
];

/* ── Soundings ────────────────────────────────────────────────────────────
   Depth in FEET at a point - the unit the tiers and the dialogue use. The
   open bed is a distance-weighted blend of these, pulled to nothing at any
   shoreline so it always shelves off a beach. Steps are not done here; see
   the ledges below. */
const SOUNDINGS = [
  // The dock and the town shore: a hand net's depth, then a rod's.
  { x: 0, z: -25, ft: 2 },
  { x: 0, z: -80, ft: 5 },
  { x: 0, z: -150, ft: 8 },
  { x: 300, z: -110, ft: 7 },
  { x: -260, z: -95, ft: 5 },
  { x: 640, z: -230, ft: 15 },

  // Lily Bay: broad, shallow, weedy. The canoe's whole world.
  { x: -680, z: -280, ft: 15 },
  { x: -1060, z: -480, ft: 22 },
  { x: -1230, z: -700, ft: 18 },
  { x: -820, z: -640, ft: 25 },
  { x: -430, z: -480, ft: 18 },
  { x: -700, z: -860, ft: 28 },

  // The south basin proper, shelving gently toward the narrows.
  { x: 130, z: -400, ft: 18 },
  { x: 520, z: -520, ft: 25 },
  { x: 860, z: -640, ft: 28 },
  { x: -120, z: -700, ft: 28 },
  { x: 450, z: -840, ft: 32 },
  { x: 755, z: -775, ft: 35 },

  // Through the narrows, and it drops away. The ledge does the step; these
  // just say how deep it is once you are over it.
  { x: 40, z: -1230, ft: 72 },
  { x: -180, z: -1350, ft: 68 },

  // The Deep Hole, north-east of the narrows.
  { x: 620, z: -1330, ft: 80 },
  { x: 470, z: -1520, ft: 75 },
  { x: 830, z: -1375, ft: 70 },
  { x: 790, z: -1620, ft: 72 },

  // The north basin, and the water round the island.
  { x: 120, z: -1560, ft: 80 },
  { x: -330, z: -1620, ft: 70 },
  { x: -600, z: -1860, ft: 118 },
  { x: 0, z: -1800, ft: 78 },
  { x: 640, z: -1960, ft: 124 },
  { x: 830, z: -2250, ft: 105 },
  { x: 320, z: -2430, ft: 52 },
  { x: -320, z: -2260, ft: 95 },

  // Right off the island: a shelf, then away again.
  { x: 220, z: -1880, ft: 25 },
  { x: 490, z: -2100, ft: 22 },
  { x: 80, z: -2370, ft: 32 },
];

/* ── Ledges ───────────────────────────────────────────────────────────────
   Where the bottom STEPS. Soundings alone cannot describe one: a blend of
   sixteen feet and thirty-two produces a slope, and a slope is not a
   drop-off. So a ledge is stated - a line, a depth each side, and how wide
   the step is - and it overrides the blend near it.

   Which side is which: `nearFt` is the side the dock is on. */
const LEDGES = [
  {
    id: 'dropoff',
    name: 'The Drop-Off',
    note: 'Across the narrows. Thirty-five feet on the town side, seventy-five '
        + 'on the far one, over about seventy units. The bottom drops like a '
        + 'cliff past the buoys - the reason a kayak is worth buying, and where '
        + 'the pike patrol.',
    line: [[-250, -1080], [-40, -1055], [180, -1040], [330, -1030]],
    nearFt: 35, farFt: 75, width: 70, reach: 320,
  },
  {
    id: 'islandshelf',
    name: 'The Island Shelf',
    note: 'The bottom comes up hard on the south side of Foggy Island - '
        + 'twelve feet of gravel with the best part of fifty either side of '
        + 'it. The shallowest water in the lake sits in the middle of the '
        + 'deepest, which is the sort of thing people build stories about.',
    line: [[-60, -1900], [190, -1855], [430, -1900], [520, -2050]],
    nearFt: 118, farFt: 22, width: 60, reach: 220,
  },
];

/* ── Reach ────────────────────────────────────────────────────────────────
   What each stage can get to, as a distance from the dock. Gating on RANGE
   rather than on depth is what makes progress feel like going further out:
   the deep water is not fenced off, it is simply too far to paddle. */
const STAGES = [
  { id: 'foot',      name: 'The Shoreline',      vessel: null,
    reach: 95,   speed: 0,    depthFt: [0, 10],   water: 'the dock and the shoreline' },
  { id: 'canoe',     name: 'The Shallow Bay',    vessel: 'canoe',
    reach: 780,  speed: 8.5,  depthFt: [10, 35],  water: 'the shallow bay and the weedbeds' },
  { id: 'kayak',     name: 'The Deep Drop-Off',  vessel: 'kayak',
    reach: 1650, speed: 12.5, depthFt: [35, 75],  water: 'the drop-off and the deep hole' },
  { id: 'motorboat', name: 'The Abyssal Trench', vessel: 'motorboat',
    reach: 3200, speed: 22,   depthFt: [75, 999], water: 'the centre fog and the trench' },
];

/* ── Maths ────────────────────────────────────────────────────────────────
   Everything below only measures the lake described above. No design here. */

/** A closed uniform cubic B-spline through control points, sampled. */
function spline(pts, per) {
  const n = pts.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i];
    const p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    for (let j = 0; j < per; j++) {
      const t = j / per, t2 = t * t, t3 = t2 * t;
      const b0 = (-t3 + 3 * t2 - 3 * t + 1) / 6;
      const b1 = (3 * t3 - 6 * t2 + 4) / 6;
      const b2 = (-3 * t3 + 3 * t2 + 3 * t + 1) / 6;
      const b3 = t3 / 6;
      out.push([
        b0 * p0[0] + b1 * p1[0] + b2 * p2[0] + b3 * p3[0],
        b0 * p0[1] + b1 * p1[1] + b2 * p2[1] + b3 * p3[1],
      ]);
    }
  }
  return out;
}

function inside(ring, x, z) {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > z) !== (b[1] > z) &&
        x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) hit = !hit;
  }
  return hit;
}

/** Distance from a point to a closed ring. */
function distToRing(ring, x, z) {
  let best = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const L2 = dx * dx + dz * dz || 1;
    let t = ((x - a[0]) * dx + (z - a[1]) * dz) / L2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    best = Math.min(best, Math.hypot(x - (a[0] + dx * t), z - (a[1] + dz * t)));
  }
  return best;
}

/**
 * Distance to an open polyline, and which side of it the point is on.
 * Side is the sign of the cross product against the nearest segment, so it is
 * consistent along the whole line as long as the line does not double back.
 */
function toLine(line, x, z) {
  let best = Infinity, side = 1;
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i], b = line[i + 1];
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const L2 = dx * dx + dz * dz || 1;
    let t = ((x - a[0]) * dx + (z - a[1]) * dz) / L2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const d = Math.hypot(x - (a[0] + dx * t), z - (a[1] + dz * t));
    if (d < best) {
      best = d;
      side = Math.sign((b[0] - a[0]) * (z - a[1]) - (b[1] - a[1]) * (x - a[0])) || 1;
    }
  }
  return { d: best, side };
}

const shoreCurve = spline(SHORE, 10);
const islandCurve = spline(ISLAND, 10);
const smooth = (t) => t * t * (3 - 2 * t);

/**
 * Depth in feet, anywhere on the lake.
 *
 * Three things in order: the open bed as a blend of the soundings, then any
 * ledge stated near this point, then the shelf that pulls it all to nothing
 * at the shore. The shelf goes last because a beach beats everything - a
 * forty-five foot sounding must not make the bank a cliff.
 */
function depthAt(x, z) {
  if (!inside(shoreCurve, x, z)) return 0;
  if (inside(islandCurve, x, z)) return 0;

  // The open bed.
  let num = 0, den = 0;
  for (const s of SOUNDINGS) {
    const d2 = (x - s.x) * (x - s.x) + (z - s.z) * (z - s.z);
    if (d2 < 1) { num = s.ft; den = 1; break; }
    const w = 1 / (d2 * d2);        // inverse fourth power: local, not muddy
    num += s.ft * w;
    den += w;
  }
  let ft = den > 0 ? num / den : 0;

  /* Ledges. Near the line the depth is the step, not the blend; `reach` is how
     far out its influence fades, so a ledge shapes the water around it rather
     than only existing on the line itself. */
  for (const L of LEDGES) {
    const { d, side } = toLine(L.line, x, z);
    if (d > L.reach) continue;
    const across = smooth(Math.min(1, Math.max(0, (d / L.width + 1) / 2)));
    const stepped = side < 0
      ? L.nearFt + (L.farFt - L.nearFt) * (1 - across)
      : L.nearFt + (L.farFt - L.nearFt) * across;
    const hold = 1 - smooth(Math.min(1, d / L.reach));
    ft = ft + (stepped - ft) * hold;
  }

  // The shelf. A beach is a beach, whichever side of it you are on.
  const SHELF = 110;
  const toShore = Math.min(distToRing(shoreCurve, x, z), distToRing(islandCurve, x, z));
  if (toShore < SHELF) ft *= smooth(toShore / SHELF);
  return ft;
}

/** Which stage's water a point is in, by depth. */
function stageAt(x, z) {
  const ft = depthAt(x, z);
  for (const s of STAGES) if (ft >= s.depthFt[0] && ft < s.depthFt[1]) return s.id;
  return ft > 0 ? 'motorboat' : null;
}

/* ── Report ───────────────────────────────────────────────────────────── */

const DOCK = { x: 0, z: 0 };

let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
shoreCurve.forEach(p => {
  minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
  minZ = Math.min(minZ, p[1]); maxZ = Math.max(maxZ, p[1]);
});

console.log('WHISPERING LAKE');
console.log('  shoreline      ' + SHORE.length + ' control points -> ' +
            shoreCurve.length + ' sampled');
console.log('  island         ' + ISLAND.length + ' control points');
console.log('  soundings      ' + SOUNDINGS.length);
console.log('  ledges         ' + LEDGES.map(l => l.name).join(', '));
console.log('  extent         ' + Math.round(maxX - minX) + ' x ' +
            Math.round(maxZ - minZ) + ' units');

/* How wide the narrows actually are - the whole point of the shape, so it is
   worth measuring rather than trusting. Walk the ledge and find the water. */
(function () {
  const L = LEDGES[0];
  let widest = 0;
  for (let i = 0; i < L.line.length - 1; i++) {
    const a = L.line[i], b = L.line[i + 1];
    widest = Math.max(widest, Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const span = Math.hypot(L.line[L.line.length - 1][0] - L.line[0][0],
                          L.line[L.line.length - 1][1] - L.line[0][1]);
  console.log('  the narrows    about ' + Math.round(span) + ' units across');
})();

/* What each stage opens up. If a stage adds nothing there is no reason to buy
   it; if one adds everything the others are decoration. This is the balance
   of the whole progression in one table. */
const GRID = 25;
const cells = { total: 0, byStage: {}, byReach: {} };
for (let x = minX; x <= maxX; x += GRID) {
  for (let z = minZ; z <= maxZ; z += GRID) {
    if (depthAt(x, z) <= 0) continue;
    cells.total++;
    const st = stageAt(x, z);
    cells.byStage[st] = (cells.byStage[st] || 0) + 1;
    const r = Math.hypot(x - DOCK.x, z - DOCK.z);
    for (const s of STAGES) {
      if (r <= s.reach) { cells.byReach[s.id] = (cells.byReach[s.id] || 0) + 1; break; }
    }
  }
}
const km2 = (n) => (n * GRID * GRID / 1e6).toFixed(2);
console.log();
console.log('  stage        water that deep      reach   opens up');
let cumulative = 0;
STAGES.forEach(s => {
  cumulative += cells.byReach[s.id] || 0;
  console.log('  ' + s.id.padEnd(11) +
              (km2(cells.byStage[s.id] || 0) + ' km2').padStart(11) +
              ('  ' + Math.round(100 * (cells.byStage[s.id] || 0) / cells.total) + '%').padEnd(7) +
              String(s.reach).padStart(6) + '   ' +
              Math.round(100 * cumulative / cells.total) + '% of the lake');
});

if (!WRITE) { console.log('\n(report only - pass --write to write content/lake.json)'); process.exit(0); }

const doc = {
  _README: {
    what: 'Whispering Lake. One body of water; progress is how far out and how deep you can get.',
    workflow: 'Drag the shoreline, the island, the soundings, the ledges and the places in '
            + 'editor.html. The bed is not authored - it is interpolated from the soundings '
            + 'and stepped at the ledges - so one chart edit moves the world, the map and '
            + 'the editor together.',
    units: 'Distances in world units (the hull is 9.4 long, so a unit is about half a metre). '
         + 'Depths in feet, because that is how the tiers and the dialogue talk about them.',
    axes: '-Z is north, matching the engine. The dock is the origin.',
    ledges: 'A ledge is where the bottom STEPS. Soundings alone cannot say that: blending '
          + '16 ft and 32 ft gives a slope, and a slope is not a drop-off. `nearFt` is the '
          + 'side the dock is on.',
  },
  name: 'Whispering Lake',
  dock: DOCK,
  shore: SHORE,
  island: ISLAND,
  soundings: SOUNDINGS,
  ledges: LEDGES,
  stages: STAGES,
  extent: { minX: Math.round(minX), maxX: Math.round(maxX),
            minZ: Math.round(minZ), maxZ: Math.round(maxZ) },
  places: [],     // the editor fills these: fishing marks, salvage, story spots
};

fs.writeFileSync(OUT, JSON.stringify(doc, null, 1));
console.log('\ncontent/lake.json written');
