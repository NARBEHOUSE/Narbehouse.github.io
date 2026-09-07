/**
 * Which pictures does this game actually use?
 *
 *     node tools/assetcheck.js            list what is used and what is not
 *     node tools/assetcheck.js --prune    move the unused ones to _unused/
 *
 * The art folders carry the whole history of the game: fish that were cut,
 * icons for settings that no longer exist, portraits of six characters when
 * there is one man in it, and a pill from a puzzle that was taken out. None of
 * it is loaded, all of it is in the way, and it makes the folder a poor guide
 * to what the game IS.
 *
 * Working out what is used cannot be done by grepping alone, because almost
 * every path in this game is BUILT: 'images/fish/' + f.id + '.png'. So this
 * does both halves - it reads the content (every fish, item, rod, bait and
 * vessel id, and the shapes the code builds paths in), and it greps the source
 * for literal names - and calls a file used if either says so.
 *
 * Nothing is deleted. --prune moves files to images/_unused/, which keeps them
 * in the repo history and out of the way, and can be undone with a mv.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PRUNE = process.argv.includes('--prune');

/* ── What the content names ─────────────────────────────────────────────── */
const roster = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/roster.json'), 'utf8'));
const lake = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/lake.json'), 'utf8'));

const used = new Set();
const why = {};
const use = (rel, reason) => { used.add(rel.replace(/\\/g, '/')); (why[rel] = why[rel] || []).push(reason); };

(roster.fish || []).forEach(f => use('images/fish/' + f.id + '.png', 'fish ' + f.id));
(roster.items || []).forEach(i => use('images/items/' + i.id + '.png', 'item ' + i.id));
(roster.rods || []).forEach(r => {
  /* THE NET IS PAINTED NOW. It was excluded here and in rodHasArt because
     nobody had drawn it, so every menu showed it as the generic 'creel' icon
     - a woven wicker basket - for the one piece of tackle the whole first
     hour is played with. Reported as "the mesh hand net is a bamboo basket".
     It only has the icon: the larger card painting is for rods, and the net
     is built in three dimensions and held in front of you. */
  use('images/rods/' + r.id + '-icon.png', 'rod icon ' + r.id);
  if (r.isNet) return;
  use('images/rods/' + r.id + '.png', 'rod ' + r.id);
});
/* AND THE MAGNETS. They were drawn as an ANCHOR - the nearest thing in the
   icon set to a lump of iron on a rope - which is not what a magnet looks
   like. Reported: "the magnet lure #1 looks like an anchor, it should look
   like an arch magnet." Each magnet has its own horseshoe now; anything else
   on the shelf keeps an icon, so only magnets are asked for. */
(roster.tools || []).forEach(t => {
  if (t.kind !== 'magnet') return;
  use('images/tools/' + t.id + '-icon.png', 'magnet icon ' + t.id);
});
/* THE PAINTED LURES. Most lures show an icon and that is the intended state,
   not a fault - but the deep rig was showing an ANCHOR, which is not what a
   rig looks like, so it has a painting of its own. Anything listed in
   BAIT_ART (js/game.js) is asked for here; the rest are not. */
(roster.baits || []).forEach(b => {
  if (b.id !== 'deep_rig') return;
  use('images/bait/' + b.id + '-icon.png', 'lure icon ' + b.id);
});

/* ── And what the source names, literally ──────────────────────────────── */
const srcFiles = [];
['js', 'tools', '.'].forEach((dir) => {
  const at = path.join(ROOT, dir);
  fs.readdirSync(at).forEach((f) => {
    if (/\.(js|html|css)$/.test(f)) srcFiles.push(path.join(at, f));
  });
});
const src = srcFiles.map(f => fs.readFileSync(f, 'utf8')).join('\n');

/* Every file on disk, and whether its name appears anywhere in the source. */
/* 'tools' is where the magnets are painted - a folder that did not exist
   while they were being drawn as an anchor icon. */
const DIRS = ['bait', 'cardbg', 'fish', 'icons', 'items', 'npc', 'rods', 'tools'];
const all = [];
DIRS.forEach((d) => {
  const at = path.join(ROOT, 'images', d);
  if (!fs.existsSync(at)) return;
  fs.readdirSync(at).forEach((f) => {
    if (!/\.(png|jpg|jpeg|webp|svg)$/i.test(f)) return;
    all.push('images/' + d + '/' + f);
  });
});

all.forEach((rel) => {
  const base = path.basename(rel);
  const stem = base.replace(/\.[^.]+$/, '');
  /* A literal mention of the file, or of its stem in a path-building line -
     ic('warn') builds images/icons/warn.png, so the stem in quotes counts. */
  const lit = new RegExp('[\'"`/]' + stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\.[a-z]+)?[\'"`)]', 'i');
  if (lit.test(src)) use(rel, 'named in the source');
});

/* KEPT ON PURPOSE, though nothing loads it yet. One entry, with its reason,
   so the decision lives here rather than in somebody's memory. */
const KEEP = {
  'images/npc/walt_full.png':
    'the only character in the game, painted head to foot - the natural art ' +
    'for his dialogue cards, and one file',
};
Object.keys(KEEP).forEach(k => use(k, 'kept: ' + KEEP[k]));

const unused = all.filter(f => !used.has(f));
const missing = Array.from(used).filter(f => !fs.existsSync(path.join(ROOT, f)));

console.log('THE ART FOLDER');
console.log();
DIRS.forEach((d) => {
  const mine = all.filter(f => f.startsWith('images/' + d + '/'));
  const dead = mine.filter(f => !used.has(f));
  console.log('  ' + ('images/' + d).padEnd(16) + String(mine.length).padStart(3) + ' files, ' +
              String(mine.length - dead.length).padStart(3) + ' used, ' +
              String(dead.length).padStart(3) + ' not');
});
console.log();

if (Object.keys(KEEP).length) {
  console.log('KEPT THOUGH UNUSED:');
  Object.keys(KEEP).forEach((k) => { console.log('  ' + k); console.log('      ' + KEEP[k]); });
  console.log();
}

if (missing.length) {
  console.log('WANTED BUT NOT THERE - the game asks for these and they do not exist:');
  missing.forEach(f => console.log('  ' + f + '   (' + (why[f] || []).join(', ') + ')'));
  console.log();
}

console.log('NOT USED BY ANYTHING (' + unused.length + '):');
unused.forEach(f => console.log('  ' + f));
console.log();

if (PRUNE && unused.length) {
  /* Out of images/ altogether, so the art folders are a true list of what
     the game uses - and still in the repo, one move from coming back. */
  const bin = path.join(ROOT, '_unused');
  unused.forEach((rel) => {
    const to = path.join(bin, rel.replace(/^images\//, ''));
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.renameSync(path.join(ROOT, rel), to);
  });
  console.log('moved ' + unused.length + ' files to _unused/ - nothing deleted.');
} else if (unused.length) {
  console.log('run with --prune to move them out of images/ to _unused/');
}

/* ── AND NO FISH HAS A HOLE IN IT ─────────────────────────────────────────
   The paper is cut away by brightness, and a watercolour fish with a white
   belly is as bright as the paper - so a belly can come back as a window
   through the fish. It is invisible against white and obvious against water,
   which is where the game draws them.

   A fish is ONE silhouette: any transparency sealed inside it is a fault. An
   item is not - a ring, a bracelet and a lantern handle all have real holes -
   so this looks at fish only. */
function alphaOf(file) {
  const zlib = require('zlib');
  const buf = fs.readFileSync(file);
  if (buf.readUInt32BE(0) !== 0x89504e47) return null;
  let p = 8, w = 0, h = 0, depth = 0, colour = 0, idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8);
    const body = buf.slice(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      w = body.readUInt32BE(0); h = body.readUInt32BE(4);
      depth = body[8]; colour = body[9];
    } else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  /* Eight-bit RGBA only, which is what everything in images/ is. */
  if (depth !== 8 || colour !== 6 || !idat.length) return null;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = 4, stride = w * bpp;
  const out = Buffer.alloc(h * stride);
  let q = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[q++];
    const row = raw.slice(q, q + stride); q += stride;
    const cur = out.slice(y * stride, (y + 1) * stride);
    const prev = y ? out.slice((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0, b = prev[x];
      const c = (x >= bpp && y) ? prev[x - bpp] : 0;
      let v = row[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      cur[x] = v & 255;
    }
  }
  const alpha = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) alpha[i] = out[i * 4 + 3];
  return { w, h, alpha };
}

/** Transparent pixels that cannot be reached from the edge of the picture. */
function sealedHoles(img) {
  const { w, h, alpha } = img;
  /* PROPERLY transparent, not merely soft. A watercolour edge inside the
     silhouette sits at 250-odd for thousands of pixels along a belly, and
     counting those made every fish in the game look holed. A hole is a hole:
     you can see the water through it. */
  const clear = i => alpha[i] < 100;
  const seen = new Uint8Array(w * h);
  const stack = [];
  const push = (x, y) => { const i = y * w + x; if (clear(i) && !seen[i]) { seen[i] = 1; stack.push(i); } };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  while (stack.length) {
    const i = stack.pop(), x = i % w, y = (i - x) / w;
    if (x > 0) push(x - 1, y);
    if (x < w - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < h - 1) push(x, y + 1);
  }
  let n = 0;
  for (let i = 0; i < w * h; i++) if (clear(i) && !seen[i]) n++;
  return n;
}

console.log('HOLES PUNCHED THROUGH A FISH');
let holed = [];
(roster.fish || []).forEach(function (f) {
  const file = path.join(ROOT, 'images/fish', f.id + '.png');
  if (!fs.existsSync(file)) return;
  const img = alphaOf(file);
  if (!img) { console.log('  ' + f.id.padEnd(18) + 'not 8-bit RGBA - skipped'); return; }
  const n = sealedHoles(img);
  /* A few hundred pixels is an eye, a nostril, a gap in a fin. A cut-out
     belly is fifteen thousand - that is the fault this is looking for. */
  if (n > 1500) { holed.push(f.id + ' (' + n + 'px)'); console.log('  ' + f.id.padEnd(18) + n + ' px of the fish is see-through'); }
});
if (!holed.length) console.log('  none - every fish is solid');
console.log();

/* A missing picture is a real fault: the game draws a blank where a fish
   should be. So is a fish with a window through it. An unused one is only
   untidy, so it is reported, not failed. */
if (holed.length) console.log('FISH WITH HOLES IN THEM: ' + holed.join(', '));
process.exit((missing.length || holed.length) ? 1 : 0);
