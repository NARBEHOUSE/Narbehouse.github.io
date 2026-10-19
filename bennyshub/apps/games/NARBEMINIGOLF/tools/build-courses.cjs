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


/* Back nines: length and bends supply the challenge; leave generous landing areas. */
sunnyMeadows.holes.push(
  hole('Orchard Bend', 3, [190,760], [1430,240], lane([100,760,270],[850,760,280],[850,240,280],[1520,240,270]), {sands:[blob(1180,325,90,24,41)]}),
  hole('Rolling Ribbon', 3, [190,300], [1620,780], lane([100,300,280],[650,300,280],[1150,780,280],[1710,780,280]), {hills:[{x:500,y:300,radius:200,height:32},{x:1370,y:780,radius:170,height:26}]}),
  hole('Butterfly Turn', 3, [210,900], [370,280], lane([120,900,270],[1450,900,280],[1450,280,280],[280,280,270]), {bumpers:[{x:850,y:840,radius:20},{x:1000,y:340,radius:20}]}),
  hole('Creekside Cruise', 4, [190,900], [1570,260], lane([100,900,280],[780,900,300],[780,260,300],[1660,260,280]), {waters:[blob(780,585,115,120,44,0.04)],bridges:[bridge(780,585,380,185,90)]}),
  hole('Garden Switchback', 4, [190,1180], [1660,240], lane([100,1180,270],[1500,1180,280],[1500,710,280],[450,710,280],[450,240,280],[1750,240,270]), {sands:[blob(950,1255,90,24,45)],hills:[{x:950,y:710,radius:180,height:30}]}),
  hole('Windmill Way', 4, [190,900], [1690,300], lane([100,900,300],[950,900,320],[950,300,340],[1780,300,300]), {windmills:[windmill(1370,300,150,240,0,100,0.85)]}),
  hole('Meadow Express', 4, [190,280], [380,920], lane([100,280,290],[1620,280,300],[1620,920,300],[290,920,290]), {boosts:[boost(620,280,150,105,0)],ice:[blob(1100,920,180,70,47,0.04)]}),
  hole('Clover Circuit', 4, [190,1250], [1650,250], lane([100,1250,280],[900,1250,290],[900,750,290],[1650,750,290],[1650,160,280]), {tunnels:[{x1:630,y1:1320,x2:1230,y2:750,radius:28,exitAngle:0}],sands:[blob(1730,460,25,75,48)],hills:[{x:1650,y:250,radius:100,height:-10}]}),
  hole('Meadow Grand Tour', 5, [190,1400], [1510,360], lane([100,1400,280],[1900,1400,290],[1900,250,290],[550,250,290],[550,850,290],[1420,850,290]), {end:{x:1330,y:850,radius:CUP},waters:[blob(1160,1400,140,110,49,0.04)],bridges:[bridge(1160,1400,440,190,0)],hills:[{x:1150,y:250,radius:210,height:34}],bumpers:[{x:900,y:790,radius:20}]})
);
sunsetLagoon.holes.push(
  hole('Pelican Point', 3, [190,850], [1510,260], lane([100,850,300],[840,850,320],[840,260,320],[1600,260,300]), {waters:[blob(1190,355,115,28,51,0.04)]}),
  hole('Tidal Turn', 3, [190,260], [340,900], lane([100,260,300],[1500,260,310],[1500,900,310],[250,900,300]), {sands:[blob(900,180,120,30,52)],waters:[blob(950,995,150,26,53,0.04)]}),
  hole('Coral Crossing', 4, [190,950], [1630,280], lane([100,950,300],[900,950,320],[900,280,320],[1720,280,300]), {waters:[blob(900,620,125,140,54,0.04)],bridges:[bridge(900,620,440,190,90)],hills:[{x:1460,y:280,radius:160,height:24}]}),
  hole('Smugglers Bend', 4, [190,1150], [1660,280], lane([100,1150,300],[1520,1150,300],[1520,700,300],[600,700,300],[600,280,300],[1750,280,300]), {tunnels:[{x1:700,y1:1230,x2:820,y2:280,radius:28,exitAngle:0}],sands:[blob(1110,770,115,27,55)]}),
  hole('Palm Promenade', 4, [190,300], [1770,950], lane([100,300,300],[650,300,320],[1200,950,320],[1860,950,300]), {trees:[{x:540,y:220,radius:30},{x:1460,y:1030,radius:32}],hills:[{x:1470,y:950,radius:170,height:32}]}),
  hole('Lagoon Lookout', 4, [190,1250], [500,680], lane([100,1250,300],[1760,1250,310],[1760,230,310],[500,230,310],[500,770,300]), {waters:[blob(1180,1250,170,120,56,0.04)],bridges:[bridge(1180,1250,510,190,0)],sands:[blob(1680,650,28,110,57)]}),
  hole('Twin Coves', 4, [190,1300], [1790,260], lane([100,1300,300],[900,1300,340],[900,260,340],[1880,260,300]), {waters:[blob(800,950,28,130,58,0.04),blob(1000,630,28,130,59,0.04)],bumpers:[{x:1470,y:200,radius:20}]}),
  hole('Harbour Homeward', 5, [190,1450], [1660,300], lane([100,1450,300],[1800,1450,310],[1800,880,310],[550,880,310],[550,300,310],[1750,300,300]), {waters:[blob(1150,880,150,120,60,0.04)],bridges:[bridge(1150,880,470,185,0)],tunnels:[{x1:1000,y1:1530,x2:550,y2:620,radius:28,exitAngle:270}]}),
  hole('Sunset Treasure Trail', 5, [190,1550], [1370,750], lane([100,1550,300],[2050,1550,320],[2050,250,320],[500,250,320],[500,850,320],[1460,850,300]), {end:{x:1370,y:850,radius:CUP},waters:[blob(2050,900,125,180,61,0.04)],bridges:[bridge(2050,900,530,190,90)],sands:[blob(1100,340,130,28,62)],hills:[{x:1370,y:850,radius:120,height:-12}]})
);
glowGolf.holes.push(
  hole('Neon Dogleg', 3, [190,850], [1460,260], lane([100,850,280],[830,850,300],[830,260,300],[1550,260,280]), {bumpers:[{x:1130,y:195,radius:20}]}),
  hole('Comet Curve', 3, [190,260], [1600,860], lane([100,260,290],[650,260,300],[1100,860,300],[1690,860,290]), {boosts:[boost(430,260,150,105,0)],hills:[{x:1370,y:860,radius:180,height:28}]}),
  hole('Aurora Iceway', 4, [190,280], [340,940], lane([100,280,300],[1590,280,310],[1590,940,310],[250,940,300]), {ice:[blob(880,280,230,95,71,0.03)],bumpers:[{x:950,y:1010,radius:20}]}),
  hole('Orbit Switchback', 4, [190,1220], [1750,250], lane([100,1220,280],[1530,1220,300],[1530,750,300],[520,750,300],[520,250,300],[1840,250,280]), {hills:[{x:1010,y:750,radius:200,height:36}],boosts:[boost(1090,250,140,100,0)]}),
  hole('Starlight Bridge', 4, [190,1030], [1790,280], lane([100,1030,300],[950,1030,320],[950,280,320],[1880,280,300]), {waters:[blob(950,650,125,160,72,0.04)],bridges:[bridge(950,650,490,190,90)],bumpers:[{x:1520,y:210,radius:20}]}),
  hole('Warp Drive', 4, [190,1380], [520,680], lane([100,1380,280],[1850,1380,300],[1850,230,300],[520,230,300],[520,770,280]), {tunnels:[{x1:980,y1:1450,x2:1580,y2:230,radius:28,exitAngle:180}],ice:[blob(520,550,65,110,73,0.04)]}),
  hole('Lunar Slalom', 4, [190,300], [1810,1180], lane([100,300,290],[800,300,300],[800,780,300],[1720,780,300],[1720,1270,290]), {end:{x:1720,y:1180,radius:CUP},bumpers:[{x:530,y:235,radius:20},{x:1100,y:845,radius:20},{x:1450,y:715,radius:20}],hills:[{x:800,y:550,radius:160,height:28}]}),
  hole('Galaxy Grand Prix', 5, [190,1450], [1820,280], lane([100,1450,290],[1900,1450,310],[1900,850,310],[580,850,310],[580,280,320],[1910,280,300]), {boosts:[boost(650,1450,160,110,0)],windmills:[windmill(1240,280,150,240,0,100,0.95)],ice:[blob(1150,850,170,80,74,0.03)]}),
  hole('Cosmic Victory Lap', 5, [190,1550], [1400,850], lane([100,1550,300],[2140,1550,320],[2140,250,320],[500,250,320],[500,850,320],[1490,850,300]), {boosts:[boost(820,1550,170,110,0)],tunnels:[{x1:2140,y1:1100,x2:1240,y2:250,radius:28,exitAngle:180}],hills:[{x:1400,y:850,radius:140,height:-16}],bumpers:[{x:980,y:780,radius:20}]})
);
sunnyMeadows.description = '18 meadow holes: friendly greens, rolling bends and a winding back nine.';
sunsetLagoon.description = '18 sunset holes: coastal turns, roomy bridges and a treasure trail.';
glowGolf.description = '18 neon holes: flowing turns, ice, boosts and optional warp shortcuts.';

// Preserve the original nine, with safe footprints and fewer crowded obstacles.
sunnyMeadows.holes[3].bumpers = sunnyMeadows.holes[3].bumpers.slice(0,3);
sunnyMeadows.holes[6].windmills[0].height = 240;
sunnyMeadows.holes[6].windmills[0].y = 330;
sunnyMeadows.holes[6].trees.forEach(t => { t.y = t.y < 450 ? 370 : 530; t.radius = 28; });
sunnyMeadows.holes[8].trees = sunnyMeadows.holes[8].trees.slice(1);
sunsetLagoon.holes[2].trees = sunsetLagoon.holes[2].trees.slice(0,3);
glowGolf.holes[0].bumpers = [{x:650,y:395,radius:18},{x:920,y:505,radius:18}];
glowGolf.holes[1].walls = [wall(520,410,150,22,90),wall(880,590,150,22,90)];
glowGolf.holes[1].par = 3;
glowGolf.holes[4].windmills[0].height = 240;
glowGolf.holes[4].windmills[0].y = 330;
glowGolf.holes[5].bumpers = glowGolf.holes[5].bumpers.filter((b,i)=>[0,3,6,8].includes(i));
glowGolf.holes[6].bumpers = [];
glowGolf.holes[7].tunnels[0].x1 = 1250;
glowGolf.holes[8].windmills[0].height = 230;
glowGolf.holes[8].windmills[0].y = 185;

sunnyMeadows.holes[8].tunnels[0].x1 = 620;
sunnyMeadows.holes[8].tunnels[0].y1 = 300;
sunsetLagoon.holes[4].tunnels[0].y1 = 890;
sunsetLagoon.holes[7].walls = [wall(450,350,205,24,90),wall(750,550,205,24,90),wall(1000,350,205,24,90)];
sunsetLagoon.holes[7].trees[0].y = 320;
sunsetLagoon.holes[7].trees[1].y = 590;

// Allow an extra stroke on the three tighter routes found by the imperfect-shot solver.
sunsetLagoon.holes[7].par = 4;
sunsetLagoon.holes[15].par = 5;
glowGolf.holes[12].par = 5;

// Fit legacy surface patches inside their lane, leaving a visible strip of turf.
// This edits the source polygons, so physics, water banks and rendering agree.
function containRegions(h) {
  const C = MG.course, fw = C.fairwayPolygon(h.fairway);
  for (const key of ['waters','sands','ice','boosts']) for (const r of h[key]) {
    const pts = C.regionPolygon(r), bb = C.bboxOf(pts);
    const cx = (bb.x0+bb.x1)/2, cy = (bb.y0+bb.y1)/2;
    if (!C.pointInPolygon(cx,cy,fw)) throw Error(h.name+' patch center outside fairway');
    let factor=1;
    while (factor > 0.1) {
      const poly=pts.map(p=>({x:cx+(p.x-cx)*factor,y:cy+(p.y-cy)*factor}));
      if (poly.every((p,i)=> {
        const q=poly[(i+1)%poly.length], steps=Math.max(1,Math.ceil(Math.hypot(q.x-p.x,q.y-p.y)/5));
        for(let j=0;j<=steps;j++){ const x=p.x+(q.x-p.x)*j/steps,y=p.y+(q.y-p.y)*j/steps;
          if(!C.pointInPolygon(x,y,fw)||C.closestOnPolygon(x,y,fw).d<18) return false;
        } return true;
      })) { if(factor<1) { r.points=poly; r.smooth=false; } break; }
      factor *= 0.96;
    }
    if(factor<=0.1) throw Error(h.name+' patch cannot fit');
  }
}

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

for (const [, c] of COURSES) c.holes.forEach(containRegions);

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
