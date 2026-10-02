#!/usr/bin/env node
/* NARBE Mini Golf — writes the built-in courses to courses/*.json.
 *
 *   node tools/build-courses.cjs
 *
 * Holes are written as code so they're easy to tune; the output is plain
 * course JSON, the same format the Course Creator saves, so any of these can
 * be opened there and edited further. Run tools/check-courses.cjs afterwards:
 * it plays every hole with the solver bot and reports how many strokes each
 * one actually takes.
 */
'use strict';
const fs = require('node:fs'), path = require('node:path');

const OUT = path.resolve(__dirname, '../courses');

/* ── Helpers ─────────────────────────────────────────────────────────────── */

const BALL = 12, CUP = 24;

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A lane from nodes [[x, y, w], ...]. */
const lane = (...nodes) => ({ lane: nodes.map(([x, y, w]) => ({ x, y, w: w || 230 })), caps: 'round' });

/** Organic blob (pond, bunker, ice patch) — stored as smooth control points. */
function blob(cx, cy, rx, ry, seed, wobble, n) {
  const r = rng(seed || 1);
  n = n || 12; wobble = wobble === undefined ? 0.14 : wobble;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + (r() - 0.5) * 2 * wobble;
    pts.push({ x: +(cx + Math.cos(a) * rx * k).toFixed(1), y: +(cy + Math.sin(a) * ry * k).toFixed(1) });
  }
  return { points: pts, smooth: true };
}

function rectPoly(cx, cy, w, h, angle) {
  const a = (angle || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return { points: [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => ({ x: +(cx + sx * w / 2 * c - sy * h / 2 * s).toFixed(1), y: +(cy + sx * w / 2 * s + sy * h / 2 * c).toFixed(1) })), smooth: false };
}

/** Boost pad: a rectangle with its arrow along `angle`. */
const boost = (cx, cy, w, h, angle) => Object.assign(rectPoly(cx, cy, w, h, angle), { boostAngle: angle });

/** Rects in the original format: x,y = unrotated top-left, rotated about the centre. */
const rect = (cx, cy, w, h, angle) => ({ x: cx - w / 2, y: cy - h / 2, width: w, height: h, angle: angle || 0 });
const wall = (cx, cy, len, thick, angle) => rect(cx, cy, len, thick || 22, angle);
const bridge = (cx, cy, len, width, angle) => rect(cx, cy, len, width, angle);
const windmill = (cx, cy, depth, span, angle, gap, speed) => Object.assign(rect(cx, cy, depth, span, angle), { gap: gap || 80, speed: speed || 1 });
const angleOf = (x1, y1, x2, y2) => Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;

function hole(name, par, start, cup, fairway, parts) {
  return Object.assign({
    name, par,
    start: { x: start[0], y: start[1], radius: BALL },
    end: { x: cup[0], y: cup[1], radius: CUP },
    fairway,
    walls: [], waters: [], sands: [], ice: [], boosts: [], bridges: [], trees: [],
    hills: [], bumpers: [], windmills: [], tunnels: [], decor: []
  }, parts || {});
}

/* ── Sunny Meadows — learn one thing per hole ────────────────────────────── */

const sunnyMeadows = {
  name: 'Sunny Meadows',
  theme: 'sunny',
  description: 'Nine friendly holes. Each one adds something new.',
  holes: [
    hole('Welcome Green', 2, [190, 400], [1010, 400], lane([100, 400, 230], [1100, 400, 230])),

    hole('Dogleg Left', 2, [210, 800], [760, 270], lane([120, 800, 240], [760, 800, 240], [760, 180, 240])),

    hole('Sandy Shores', 2, [190, 500], [1265, 330],
      lane([100, 500, 240], [520, 500, 240], [860, 330, 250], [1350, 330, 240]), {
        // Bunkers sit on the inside of the bend and the far edge, never across the line.
        sands: [blob(885, 428, 92, 30, 4), blob(1150, 248, 50, 24, 8)]
      }),

    hole('Pinball Alley', 2, [190, 450], [1190, 450],
      lane([100, 450, 220], [420, 450, 230], [720, 450, 430], [1060, 450, 300], [1290, 450, 240]), {
        bumpers: [
          { x: 640, y: 375, radius: 20 }, { x: 640, y: 525, radius: 20 },
          { x: 770, y: 450, radius: 24 },
          { x: 900, y: 360, radius: 18 }, { x: 900, y: 540, radius: 18 }
        ]
      }),

    hole('Over the Hill', 2, [190, 420], [1130, 420], lane([100, 420, 260], [1250, 420, 260]), {
      hills: [{ x: 620, y: 420, radius: 230, height: 55 }, { x: 1130, y: 420, radius: 110, height: -9 }]
    }),

    hole('Lily Pad Bridge', 3, [190, 700], [1330, 350],
      lane([100, 700, 260], [600, 700, 260], [1000, 350, 260], [1420, 350, 260]), {
        waters: [blob(800, 525, 190, 135, 12, 0.08)],
        bridges: [bridge(800, 525, 480, 185, angleOf(600, 700, 1000, 350))]
      }),

    hole('The Old Windmill', 2, [190, 450], [1330, 450], lane([100, 450, 300], [1440, 450, 300]), {
      windmills: [windmill(780, 450, 150, 330, 0, 84, 1)],
      hills: [{ x: 1330, y: 450, radius: 160, height: -16 }],
      trees: [{ x: 1080, y: 345, radius: 34 }, { x: 1080, y: 555, radius: 34 }]
    }),

    hole('Zoom Zone', 2, [180, 300], [1215, 655],
      lane([100, 300, 240], [700, 300, 240], [1300, 720, 240]), {
        boosts: [boost(470, 300, 180, 120, 0)],
        ice: [blob(960, 480, 120, 70, 21, 0.1)]
      }),

    hole('Meadow Finale', 3, [200, 920], [1100, 760],
      lane([110, 920, 250], [520, 920, 330], [520, 300, 250], [1100, 300, 250], [1100, 860, 260]), {
        tunnels: [{ x1: 494, y1: 274, x2: 1100, y2: 540, radius: 28, exitAngle: 90 }],
        trees: [{ x: 600, y: 610, radius: 36 }, { x: 790, y: 300, radius: 30 }],
        bumpers: [{ x: 1040, y: 690, radius: 16 }, { x: 1160, y: 690, radius: 16 }],
        sands: [blob(800, 360, 90, 40, 31)]
      })
  ]
};

/* ── Sunset Lagoon — water, bridges and a shipwreck tunnel ───────────────── */

const sunsetLagoon = {
  name: 'Sunset Lagoon',
  theme: 'sunset',
  description: 'Palm trees, bridges and a lot of water. Mind the alligator!',
  holes: [
    hole('Beach Walk', 2, [190, 520], [1090, 505],
      lane([100, 520, 240], [620, 420, 250], [1180, 520, 240]), {
        waters: [blob(640, 505, 120, 38, 3, 0.1)]
      }),

    hole('Pier Pressure', 2, [190, 400], [1330, 400], lane([100, 400, 270], [1420, 400, 270]), {
      waters: [blob(760, 400, 230, 178, 5, 0.06)],
      bridges: [bridge(760, 400, 640, 175, 0)]
    }),

    hole('Coconut Grove', 3, [190, 500], [1000, 500], lane([100, 500, 400], [1100, 500, 400]), {
      trees: [
        { x: 430, y: 420, radius: 38 }, { x: 430, y: 580, radius: 38 }, { x: 600, y: 500, radius: 44 },
        { x: 780, y: 395, radius: 36 }, { x: 780, y: 605, radius: 36 }, { x: 890, y: 500, radius: 28 }
      ],
      sands: [blob(700, 330, 80, 30, 6)]
    }),

    hole('Sandbar', 2, [190, 450], [1250, 450], lane([100, 450, 340], [1350, 450, 340]), {
      // Ponds hug the rails and the sandbar sits off to one side: a clear lane
      // runs straight down the middle, and the hazards punish a wild putt.
      waters: [blob(560, 318, 150, 40, 7, 0.08), blob(960, 586, 160, 38, 9, 0.08)],
      sands: [blob(1140, 342, 64, 28, 3)]
    }),

    hole('Shipwreck Tunnel', 3, [210, 820], [340, 330],
      lane([120, 820, 250], [950, 820, 250], [950, 330, 250], [250, 330, 250]), {
        walls: [wall(950, 575, 100, 22, 0)],
        // An optional shortcut: a mouth tucked against the near rail, off the natural line.
        tunnels: [{ x1: 700, y1: 905, x2: 560, y2: 330, radius: 28, exitAngle: 180 }],
        hills: [{ x: 340, y: 330, radius: 110, height: -8 }]
      }),

    hole('Lighthouse Spiral', 3, [240, 800], [450, 470],
      lane([150, 800, 220], [1100, 800, 220], [1100, 250, 220], [450, 250, 220], [450, 520, 200]), {
        sands: [blob(1168, 520, 34, 68, 11)],
        bumpers: [{ x: 760, y: 250, radius: 18 }],
        hills: [{ x: 450, y: 470, radius: 100, height: -8 }]
      }),

    hole('Boost Bay', 2, [190, 600], [1360, 300],
      lane([100, 600, 250], [700, 600, 250], [1100, 300, 250], [1450, 300, 250]), {
        waters: [blob(900, 450, 150, 112, 13, 0.08)],
        bridges: [bridge(900, 450, 440, 175, angleOf(700, 600, 1100, 300))],
        boosts: [boost(520, 600, 170, 110, 0)]
      }),

    hole('Mangrove Maze', 3, [190, 450], [1200, 450], lane([100, 450, 420], [1300, 450, 420]), {
      walls: [wall(450, 330, 270, 24, 90), wall(750, 570, 270, 24, 90), wall(1000, 330, 270, 24, 90)],
      trees: [{ x: 600, y: 300, radius: 30 }, { x: 870, y: 610, radius: 30 }]
    }),

    hole('Treasure Island', 3, [190, 850], [1220, 350],
      lane([100, 850, 260], [700, 850, 300], [700, 350, 300], [1300, 350, 280]), {
        waters: [blob(700, 600, 200, 88, 17, 0.08)],
        bridges: [bridge(700, 600, 300, 180, 90)],
        sands: [blob(950, 300, 80, 36, 4)],
        bumpers: [{ x: 1080, y: 290, radius: 16 }, { x: 1080, y: 410, radius: 16 }],
        hills: [{ x: 1220, y: 350, radius: 120, height: -10 }]
      })
  ]
};

/* ── Glow Golf Night — the neon arcade ───────────────────────────────────── */

const glowGolf = {
  name: 'Glow Golf Night',
  theme: 'night',
  description: 'Blacklight mini golf: bumpers, boosts, ice and warp tunnels.',
  holes: [
    hole('Neon Alley', 2, [190, 450], [1160, 450], lane([100, 450, 240], [1250, 450, 240]), {
      bumpers: [
        { x: 520, y: 400, radius: 18 }, { x: 520, y: 500, radius: 18 }, { x: 760, y: 450, radius: 22 },
        { x: 980, y: 385, radius: 16 }, { x: 980, y: 515, radius: 16 }
      ]
    }),

    hole('Laser Gates', 4, [190, 500], [1250, 500], lane([100, 500, 360], [1350, 500, 360]), {
      walls: [
        wall(450, 440, 240, 22, 90), wall(450, 655, 50, 22, 90),
        wall(750, 345, 50, 22, 90), wall(750, 560, 240, 22, 90),
        wall(1050, 410, 180, 22, 90), wall(1050, 625, 110, 22, 90)
      ]
    }),

    hole('Ice Rink', 2, [190, 450], [1110, 450], lane([100, 450, 320], [1200, 450, 360]), {
      ice: [blob(700, 450, 330, 140, 23, 0.05)]
    }),

    hole('Boost Loop', 2, [240, 300], [330, 750],
      lane([150, 300, 240], [1050, 300, 240], [1050, 750, 240], [200, 750, 240]), {
        boosts: [boost(700, 300, 200, 110, 0), boost(1050, 525, 110, 170, 90), boost(650, 750, 200, 110, 180)]
      }),

    hole('Moon Mill', 2, [190, 450], [1300, 450], lane([100, 450, 300], [1400, 450, 300]), {
      windmills: [windmill(700, 450, 150, 330, 0, 84, 1.3)],
      bumpers: [{ x: 1000, y: 380, radius: 18 }, { x: 1000, y: 520, radius: 18 }]
    }),

    hole('Pinball Wizard', 3, [190, 500], [1270, 500],
      lane([100, 500, 300], [600, 500, 560], [1100, 500, 560], [1350, 500, 300]), {
        bumpers: [
          { x: 520, y: 380, radius: 22 }, { x: 520, y: 620, radius: 22 },
          { x: 680, y: 300, radius: 22 }, { x: 680, y: 500, radius: 22 }, { x: 680, y: 700, radius: 22 },
          { x: 840, y: 380, radius: 22 }, { x: 840, y: 620, radius: 22 },
          { x: 1000, y: 300, radius: 22 }, { x: 1000, y: 500, radius: 22 }, { x: 1000, y: 700, radius: 22 }
        ]
      }),

    hole('Black Hole', 2, [190, 500], [820, 500],
      lane([100, 500, 300], [600, 500, 620], [1100, 500, 300]), {
        hills: [{ x: 820, y: 500, radius: 300, height: -40 }],
        bumpers: [0, 1, 2, 3, 4, 5].map(i => ({ x: Math.round(820 + Math.cos(i * Math.PI / 3 + Math.PI / 6) * 190), y: Math.round(500 + Math.sin(i * Math.PI / 3 + Math.PI / 6) * 190), radius: 16 }))
      }),

    hole('Warp Zone', 3, [190, 800], [260, 300],
      lane([100, 800, 240], [1200, 800, 240], [1200, 300, 240], [150, 300, 240]), {
        tunnels: [
          { x1: 1290, y1: 560, x2: 420, y2: 300, radius: 28, exitAngle: 180 },
          { x1: 700, y1: 860, x2: 1200, y2: 600, radius: 26, exitAngle: 270 }
        ],
        // Short enough to leave a way round on both sides: the tunnels are shortcuts, not the only way.
        walls: [wall(700, 300, 100, 22, 90)]
      }),

    hole('Grand Arcade', 4, [190, 850], [1270, 300],
      lane([100, 850, 260], [800, 850, 300], [800, 300, 300], [1350, 300, 260]), {
        boosts: [boost(450, 850, 170, 110, 0)],
        ice: [blob(800, 580, 110, 90, 29, 0.08)],
        windmills: [windmill(1060, 300, 150, 300, 0, 84, 1)],
        bumpers: [{ x: 1200, y: 240, radius: 14 }, { x: 1200, y: 360, radius: 14 }]
      })
  ]
};

/* ── Validation ──────────────────────────────────────────────────────────── */

const MG = require('./load.cjs')();

/** Refuse to write a course with a hole that can't work (rules live in course.js). */
function validate(course) {
  const errs = [];
  course.holes.forEach((raw, i) => {
    for (const e of MG.course.validateHole(raw)) errs.push(course.name + ' #' + (i + 1) + ' ' + raw.name + ': ' + e);
  });
  return errs;
}

/* ── Write ───────────────────────────────────────────────────────────────── */

const COURSES = [
  ['sunny_meadows.json', sunnyMeadows],
  ['sunset_lagoon.json', sunsetLagoon],
  ['glow_golf_night.json', glowGolf]
];

const problems = COURSES.flatMap(([, c]) => validate(c));
if (problems.length) {
  console.error('Not writing — fix these first:\n  ' + problems.join('\n  '));
  process.exit(1);
}

fs.mkdirSync(OUT, { recursive: true });
for (const [file, course] of COURSES) {
  course.version = 2;
  fs.writeFileSync(path.join(OUT, file), JSON.stringify(course, null, 2));
  console.log('wrote', file, course.holes.length, 'holes');
}
fs.writeFileSync(path.join(OUT, 'course_list.json'), JSON.stringify(COURSES.map(c => c[0]), null, 2));
console.log('wrote course_list.json');
