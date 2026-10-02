// Quasar Core: twenty authored boards, from the outer debris belt to the reactor.
// Motion paths occupy separate lanes; none crosses the launcher or catch plate.
const K = require('../levelkit.cjs');
const peg = (x, y, c = 'purple', r = 16) => K.peg(x, y, c, r);
const item = (t, x, y, more = {}) => ({ t, x, y, ...more });
const points = (ps, c = 'purple') => ps.map((p, i) => peg(p.x, p.y, typeof c === 'function' ? c(i) : c));
const spin = (xs, speed, cx = 500, cy = 560) => xs.map(p => ({ ...p, m: { type: 'rotate', cx, cy, speed } }));
const slide = (xs, dx, dy, period, phase = 0) => xs.map(p => ({ ...p, m: { type: 'slide', dx, dy, period, phase } }));
const ring = (r, n, speed, c = 'purple') => spin(points(K.ring(500, 560, r, n), c), speed);
const row = (y, n = 10, c = 'teal') => points(K.line(165, y, 835, y, n), c);
const orange = i => i % 4 === 0 ? 'orange' : 'purple';
const replace = (xs, every, t) => xs.map((p, i) => i % every === 0 ? { ...p, t, c: undefined } : p);
const power = (t, x = 500, y = 165) => item(t === 'fireball' ? 'fire' : t, x, y, { r: 19 });
const hole = (x = 500, y = 560) => item('hole', x, y, { r: 28 });
const bump = (x = 500, y = 560) => item('bumper', x, y, { r: 27 });
const portal = (x, y, p = 0) => item('portal', x, y, { r: 22, p });
const brickRing = (r, n, speed, hp = 1, type = 'brick') => spin(K.ring(500, 560, r, n).map((p, i) => ({ t: type, ...p, w: 48, h: 18, hp, a: i * 360 / n + 90 })), speed);
const gemRing = (r, n, speed) => ring(r, n, speed).map(p => ({ ...p, t: 'gem', c: undefined }));
const lanternRing = (r, n, speed) => ring(r, n, speed).map(p => ({ ...p, t: 'lantern', c: undefined }));
const levels = [];
function add(name, intro, goal, pieces, opts = {}) {
  const i = levels.length;
  levels.push({ name, intro, goal, balls: Math.max(9, 14 - Math.floor(i / 4)),
    plate: { w: Math.max(160, 260 - i * 5), speed: 210 + i * 6, mode: i % 3 === 2 ? 'timed' : 'bounce', period: 3.4 - i * .04 },
    bg: i, items: pieces.flat(4), ...opts });
}

add('Outer Debris', 'Welcome to the core. Break twenty pegs in the turning debris belts.',
  { type: 'count', count: 20 }, [ring(135, 14, 18, 'teal'), ring(250, 26, -14), ring(345, 36, 11, 'pink'), bump(), power('multiball')]);

add('Signal Array', 'Three antenna rows slide past. Break every orange signal peg.',
  { type: 'color', color: 'orange' }, [slide(row(290, 11, orange), 60, 0, 5), slide(row(480, 11, orange), -60, 0, 4.6, .2),
    slide(row(690, 11, orange), 60, 0, 4.1, .5), row(890, 10, 'blue'), power('spray'), power('zap', 300)]);

add('Crystal Satellites', 'Catch the six gem satellites as they orbit the core.',
  { type: 'gems' }, [gemRing(150, 6, 26), ring(250, 24, -19, 'teal'), ring(345, 30, 15, 'pink'), bump(), power('guide'), power('multiball', 700)]);

add('Fragmented Shield', 'Break the fragile shield bricks. Glass lets your ball pass through.',
  { type: 'bricks' }, [brickRing(145, 10, 23, 1, 'glass'), brickRing(285, 16, -17), ring(215, 20, 12, 'teal'), bump(), power('blast'), power('zap', 300)]);

add('Accretion Belt', 'The dark centre pulls the ball. Work around it and break the orange pegs.',
  { type: 'color', color: 'orange' }, [hole(), ring(140, 12, 28, orange), ring(245, 20, -21, orange), ring(345, 28, 16, 'blue'), power('net'), power('multiball', 300)]);

add('Plasma Cascades', 'The streams shift sideways. Make one chain of ten hits.',
  { type: 'chain', chain: 10 }, [240, 390, 540, 690, 840].map((y, i) => slide(row(y, 12, i % 2 ? 'pink' : 'teal'), i % 2 ? -48 : 48, 0, 4 + i * .3, i * .13)).concat([power('zap'), power('multiball', 300), power('multiball', 700)]));

add('Binary Beacons', 'Two small reactors rotate in opposite directions. Light all eight lanterns.',
  { type: 'lanterns' }, [250, 750].map((cx, j) => [spin(replace(points(K.ring(cx, 520, 150, 16), 'blue'), 4, 'lantern'), j ? -28 : 28, cx, 520), bump(cx, 520)])
    .concat([slide(row(800, 12, 'pink'), 35, 0, 3.9), power('zap'), power('multiball', 300)]));

add('Ion Lattice', 'A shifting lattice fills the chamber. Break thirty pegs.',
  { type: 'count', count: 30 }, [240, 390, 540, 690, 840].map((y, i) => slide(row(y, 10, i % 2 ? 'purple' : 'teal'), 32, 22, 3.8, i / 5))
    .concat([power('multiball'), power('fireball', 300), power('net', 700)]));

add('Locked Orbit', 'Collect the blue key to open the inner gates and reach the gems.',
  { type: 'gems' }, [gemRing(90, 5, 20), brickRing(170, 8, -18, 1, 'gate').map(p => ({ ...p, k: 'blue' })),
    ring(265, 24, 24, 'pink'), ring(350, 28, -17, 'teal'), power('key', 500), power('zap', 300), power('multiball', 700)]);
// A key's colour is separate from a peg's decorative colour.
levels.at(-1).items.find(p => p.t === 'key').k = 'blue';

add('Gravitational Lens', 'Aim around the gravity well. Hit every orange peg in the two lenses.',
  { type: 'color', color: 'orange' }, [hole(), ring(170, 16, 30, orange), ring(290, 24, -23, orange),
    slide(points(K.line(130, 240, 130, 880, 11), 'teal'), 32, 0, 4), slide(points(K.line(870, 240, 870, 880, 11), 'pink'), -32, 0, 4, .5), power('spray')]);

add('Radiant Score', 'Build fever and score eighteen thousand points among the radiant rings.',
  { type: 'score', score: 18000 }, [ring(110, 12, 36, 'yellow'), ring(215, 24, -26, 'pink'), ring(335, 36, 20, 'purple'),
    bump(), power('multiplier'), power('multiball', 300), power('zap', 700)]);

add('Armour Vault', 'Blast powers and lightning crack armour. Break the vault and its outer bricks.',
  { type: 'bricks' }, [brickRing(115, 6, 18, 1, 'armor'), brickRing(270, 12, -24, 2), replace(ring(190, 16, 28, 'teal'), 4, 'zap'),
    ring(355, 30, 15, 'pink'), power('fireball'), power('blast', 300), power('zap', 700)]);

add('Wormhole Relay', 'The paired portals cross the chamber. Find all eight gems in the shifting lanes.',
  { type: 'gems' }, [slide(replace(row(290, 12), 3, 'gem'), 40, 0, 3.3), slide(row(465, 11, 'purple'), -45, 0, 3.7, .2),
    slide(replace(row(655, 12, 'pink'), 3, 'gem'), 40, 0, 3.1, .5), row(860, 11, 'blue'), portal(75, 350), portal(925, 770),
    portal(925, 350, 1), portal(75, 770, 1), power('multiball')]);

add('Pulsar Clock', 'The pulsar hands circle the lanterns. Light all six without touching the spikes.',
  { type: 'lanterns' }, [lanternRing(145, 6, 34), ring(240, 24, -27, 'teal'), ring(345, 30, 22, 'pink'),
    spin([item('spike', 575, 560, { r: 17 }), item('spike', 425, 560, { r: 17 })], 45), power('zap'), power('net', 300)]);

add('Shear Field', 'The debris streams shear in opposite directions. Break thirty four pegs.',
  { type: 'count', count: 34 }, [230, 395, 560, 725, 890].map((y, i) => slide(row(y, 12, i % 2 ? 'blue' : 'pink'), i % 2 ? -65 : 65, 0, 2.9 + i * .1, i * .17))
    .concat([power('multiball', 300), power('fireball', 700), power('spray')]));

add('Echo Chamber', 'Keep the ball bouncing through the hexagons. Make a chain of twelve.',
  { type: 'chain', chain: 12 }, [spin(points(K.polygon(500, 560, 135, 6, 18, -90), 'yellow'), 35),
    spin(replace(points(K.polygon(500, 560, 240, 6, 30, -60), 'purple'), 10, 'zap'), -29), ring(350, 36, 23, 'teal'),
    bump(), power('multiball'), power('net', 300)]);

add('Event Horizon', 'A fast ring of orange pegs skirts the black hole. Clear all twelve targets.',
  { type: 'color', color: 'orange' }, [hole(), ring(130, 12, 40, i => i % 3 === 0 ? 'orange' : 'blue'),
    ring(230, 24, -31, i => i % 3 === 0 ? 'orange' : 'purple'), replace(ring(345, 32, 24, 'teal'), 16, 'spike'),
    power('zap'), power('multiball', 300), power('net', 700)], { balls: 10 });

add('Containment Failure', 'Break the turning containment bricks. The centre is no longer safe.',
  { type: 'bricks' }, [hole(), brickRing(150, 8, 32, 2), brickRing(300, 14, -25, 2), replace(ring(225, 20, 36, 'pink'), 5, 'zap'),
    power('fireball'), power('blast', 300), power('multiball', 700)], { balls: 11 });

add('Last Light', 'Save the eight lanterns circling the fading star. Watch the outer spike patrol.',
  { type: 'lanterns' }, [hole(), lanternRing(145, 8, 38), replace(ring(245, 24, -32, 'blue'), 8, 'zap'),
    replace(ring(350, 32, 26, 'purple'), 16, 'spike'), power('multiball'), power('spray', 300), power('net', 700)], { balls: 10 });

add('Heart of the Quasar', 'One final reactor. Open the shield and clear the orange core to finish the journey.',
  { type: 'color', color: 'orange' }, [ring(90, 6, 27, 'orange'), brickRing(165, 8, -35, 2), ring(245, 24, 38, i => i % 6 === 0 ? 'orange' : 'pink'),
    replace(ring(345, 32, -28, 'teal'), 16, 'spike'), power('fireball'), power('zap', 300), power('multiball', 700),
    portal(85, 300), portal(915, 850)], { balls: 11, plate: { w: 165, speed: 335, mode: 'timed', period: 2.5 } });

module.exports = levels;
