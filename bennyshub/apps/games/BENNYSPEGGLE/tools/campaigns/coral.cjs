/** Coral Groove: twenty reef tableaux, with a gradual rise in difficulty. */
const K = require('../levelkit.cjs');
const peg = (p, c = 'teal', r = 17) => K.pegs(p, c, r);
const item = K.item;
const ring = (x, y, r, n, c) => peg(K.ring(x, y, r, n), c);
const wave = (y, c, amp = 35, n = 13) => peg(K.wave(100, 900, y, amp, 2, n), c);
const fish = (x, y, scale = 1, c = 'teal') => peg(K.ellipse(x, y, 130 * scale, 65 * scale, 14), c).concat(peg(K.line(x - 130 * scale, y, x - 205 * scale, y - 65 * scale, 3), 'yellow'), peg(K.line(x - 205 * scale, y + 65 * scale, x - 130 * scale, y, 3), 'yellow'));
const fans = (x, y, c) => [-60, -30, 0, 30, 60].flatMap(a => peg(K.line(x, y, x + Math.sin(a * Math.PI / 180) * 150, y - Math.cos(a * Math.PI / 180) * 190, 5), c));
const goals = { color: { type: 'color', color: 'orange' }, gems: { type: 'gems' }, lanterns: { type: 'lanterns' }, clear: { type: 'clear' }, bricks: { type: 'bricks' } };

function level(name, intro, items, goal = 'color', o = {}) {
  const li = levels.length;
  const seen = new Set();
  items = items.filter(p => { const key = [p.t, Math.round(p.x), Math.round(p.y), JSON.stringify(p.m || null)].join(':'); if (seen.has(key)) return false; seen.add(key); return true; });
  const moving = items.filter(p => p.m), still = items.filter(p => !p.m);
  items = K.clearAround(K.clean(still.filter(p => !p.w), { pad: 6 }).concat(still.filter(p => p.w))).concat(moving);
  // Rotating silhouettes need a clear annulus, including their full peg radius.
  items = items.filter(p => p.m || !moving.some(q => q.m.type === 'rotate' && Math.abs(Math.hypot(p.x - q.m.cx, p.y - q.m.cy) - Math.hypot(q.x - q.m.cx, q.y - q.m.cy)) < (p.r || 18) + (q.r || 18) + 6));
  if (goal === 'color') items = K.convert(items, o.targets || (8 + Math.floor(li / 3)), 400 + li, 'orange', p => p.t === 'peg');
  if (goal === 'gems' || goal === 'lanterns') items = K.convert(items, o.targets || 7, 440 + li, goal === 'gems' ? 'gem' : 'lantern', p => p.t === 'peg');
  levels.push(K.level({ name, intro, goal: typeof goal === 'string' ? goals[goal] : goal, items, balls: o.balls || (li < 7 ? 12 : li < 14 ? 11 : 10), plate: { w: 270 - li * 4, speed: 115 + li * 5, mode: li < 6 ? 'catch' : li % 3 === 0 ? 'timed' : 'catch', period: 3 }, ...o }));
}
const levels = [];

level('Reef Welcome', 'Break the orange pegs among the reef fish. Catch the ball to keep it.', [fish(510, 340, 1.2), fish(570, 670, 1, 'pink'), wave(900, 'blue'), item('extra', 300, 200)].flat());
level('Pearl Bubbles', 'Collect every pearl gem floating in the bubbles.', [ring(280, 340, 110, 12, 'blue'), ring(710, 470, 135, 15, 'teal'), ring(350, 740, 140, 15, 'pink'), item('multiball', 500, 220)].flat(), 'gems');
level('Sea Fans', 'Break the orange pegs in the colourful sea fans.', [fans(260, 510, 'pink'), fans(720, 720, 'purple'), wave(870, 'teal'), item('zap', 500, 260)].flat());
level('Starfish Sand', 'Clear the starfish and all the little pegs around them.', [peg(K.starShape(300, 400, 175, 75, 5, 26), 'yellow'), peg(K.starShape(710, 650, 170, 75, 5, 26), 'pink'), wave(930, 'teal', 12, 10), item('multiball', 600, 220)].flat(), 'clear', { balls: 13 });
level('Lantern Jellyfish', 'Light every lantern in the jellyfish and their trailing tentacles.', [peg(K.arc(500, 460, 240, 17, 180, 360), 'purple'), ...[300, 430, 570, 700].map((x, i) => peg(K.wave(x - 35, x + 35, 620 + i * 42, 125, 1, 8), i % 2 ? 'pink' : 'blue')), item('guide', 500, 230)].flat(), 'lanterns');
level('Clam Shell', 'Break the orange pegs inside the open clam.', [peg(K.arc(500, 780, 320, 20, 190, 350), 'pink'), ...[230, 275, 320].map(r => peg(K.arc(500, 780, r, 13, 205, 335), 'purple')), wave(920, 'yellow', 18, 11), item('blast', 500, 310)].flat());
level('Glass Tide', 'Break every glass brick. The ball flies through shattered glass.', [K.bricksAlong(K.wave(150, 850, 390, 70, 1, 8), { t: 'glass', w: 64, h: 20, follow: true }), K.bricksAlong(K.wave(150, 850, 690, 70, 1, 8), { t: 'glass', w: 64, h: 20, follow: true }), wave(530, 'teal'), wave(850, 'pink'), item('spray', 500, 230)].flat(), 'bricks');
level('Shoal Shuffle', 'Collect the gems as two shoals swim past each other.', [K.slide(peg(K.line(260, 340, 740, 340, 9), 'teal'), 100, 0, 5), K.slide(peg(K.line(260, 660, 740, 660, 9), 'pink'), -100, 0, 5), wave(900, 'blue'), item('multiball', 500, 210)].flat(), 'gems');
level('Anemone Arms', 'Break the orange pegs. Lightning helps reach between the anemone arms.', [peg(K.spiral(500, 520, 45, 300, 2, 46), 'purple'), wave(925, 'teal', 14), item('zap', 170, 260), item('zap', 830, 260)].flat());
level('Sunken Treasure', 'Collect every gem around the treasure chest. The blue key opens its gate.', [K.bricksAlong(K.line(300, 740, 700, 740, 5), { w: 64, h: 22, hp: 2 }), K.gate(500, 600, 180, 20, 0, 'blue'), item('key', 500, 230, { k: 'blue' }), peg(K.grid(300, 450, 5, 3, 100, 105), 'yellow'), fans(150, 920, 'teal'), fans(850, 920, 'pink'), item('blast', 730, 260)].flat(), 'gems');
level('Turtle Crossing', 'Break the orange pegs on a sea turtle and its wake.', [peg(K.ellipse(500, 520, 230, 180, 28), 'green'), ring(500, 260, 55, 7, 'teal'), ...[[200, 360], [800, 360], [220, 740], [780, 740]].map(([x, y]) => peg(K.ellipse(x, y, 70, 35, 7, x < 500 ? 40 : -40), 'teal')), wave(920, 'blue'), item('multiball', 500, 450)].flat());
level('Reef Rhythm', 'Build a chain of twelve hits in one shot. Multiball can help.', [wave(290, 'pink', 20, 18), wave(410, 'yellow', 20, 18), wave(530, 'teal', 20, 18), wave(650, 'purple', 20, 18), wave(770, 'blue', 20, 18), item('multiball', 500, 185), item('zap', 270, 875), item('zap', 730, 875)].flat(), { type: 'chain', chain: 12 });
level('Twin Currents', 'Light every lantern. The paired portals carry the ball across the reef.', [fish(480, 360, 1.15, 'pink'), fish(580, 730, 1.1, 'teal'), item('portal', 100, 780, { p: 0 }), item('portal', 900, 240, { p: 0 }), item('portal', 900, 900, { p: 1 }), item('portal', 100, 240, { p: 1 }), item('guide', 500, 190)].flat(), 'lanterns');
level('Coral Castle', 'Break all the castle bricks. Fire and blasts break the armour too.', [K.bricksAlong(K.line(270, 470, 730, 470, 6), { w: 62, h: 22, hp: 2 }), K.bricksAlong(K.line(270, 740, 730, 740, 6), { w: 62, h: 22, hp: 2 }), K.armor(270, 600, 72, 24, 90), K.armor(730, 600, 72, 24, 90), item('zap', 190, 600), item('zap', 810, 600), wave(860, 'teal'), peg(K.grid(370, 580, 3, 2, 130, 80), 'pink'), item('fire', 330, 220), item('blast', 670, 220), item('zap', 500, 320)].flat(), 'bricks', { balls: 13 });
level('Dancing Seahorses', 'Break the orange pegs as the seahorses drift up and down.', [K.slide(peg(K.spiral(270, 590, 25, 145, 1.7, 24), 'yellow'), 0, 55, 4), K.slide(peg(K.spiral(730, 590, 25, 145, 1.7, 24), 'pink'), 0, -55, 4), wave(260, 'teal', 20, 11), wave(920, 'blue', 10, 11), item('multiball', 500, 410)].flat());
level('Deep Sea Glow', 'Light the lanterns around the dark vent. Keep clear of the black hole.', [ring(500, 560, 180, 18, 'teal'), ring(500, 560, 310, 26, 'purple'), item('hole', 500, 560, { r: 26 }), item('guide', 160, 200), item('multiball', 840, 200)].flat(), 'lanterns', { targets: 9, balls: 11 });
level('Pearl Carousel', 'Collect the gems on the spinning pearl rings.', [K.spin(ring(500, 535, 145, 15, 'pink'), 500, 535, 18), K.spin(ring(500, 535, 300, 26, 'teal'), 500, 535, -12), item('zap', 500, 535), wave(920, 'blue', 12, 11)].flat(), 'gems', { targets: 9 });
level('Lionfish Lace', 'Break the orange pegs. Avoid the spikes around the lionfish.', [fish(510, 540, 1.45, 'purple'), ...[-1, 1].flatMap(s => [330, 430, 540, 650, 750].map((y, i) => peg(K.line(500 + s * 270, y, 500 + s * 400, y - 70 + i * 35, 3), 'pink'))), item('spike', 150, 930, { r: 17 }), item('spike', 850, 930, { r: 17 }), item('zap', 320, 210), item('blast', 680, 210)].flat(2));
level('Tidal Spiral', 'Break the orange pegs in the turning tide. Catch plates switch to bounce and back.', [K.spin(peg(K.spiral(500, 535, 70, 320, 2.3, 54), 'teal'), 500, 535, 15), item('multiball', 150, 200), item('zap', 850, 200), wave(950, 'pink', 10, 11)].flat(), 'color', { targets: 13, plate: { w: 190, speed: 230, mode: 'timed', period: 2.5 } });
level('Heart of the Reef', 'Break the orange pegs for the reef finale. Lightning and multiball light the way.', [peg(K.heart(500, 550, 310, 44), 'pink'), K.spin(ring(500, 550, 145, 15, 'teal'), 500, 550, -20), wave(935, 'blue', 15, 12), item('multiball', 260, 220), item('zap', 740, 220), item('blast', 500, 780), item('portal', 100, 800, { p: 0 }), item('portal', 900, 260, { p: 0 })].flat(), 'color', { targets: 14, balls: 10 });

module.exports = { id: 'vivid-coral-groove', title: 'Coral Groove', theme: 'coral-groove', blurb: 'Swim through pearl bubbles, coral castles and spinning tides in a bright living reef.', levels };
