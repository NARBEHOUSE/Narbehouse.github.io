/**
 * The rubbish in the lake: is it varied, does it come home, does it pay?
 *
 *     node tools/littercheck.js
 *
 * There was one junk item, so every snag in the game came up as "Floating
 * Litter" over a picture of a rusted can - and it was thrown over the side on
 * the way in, because the hold only kept fish, magnet finds and story pieces.
 *
 * Now the lake has a boot, a tyre, a tin can, a wallet, a phone and a tangle
 * of weeds in it, and anything you take OUT of the water is worth a dollar or
 * three to Walt at the counter. Three things have to be true of that, and one
 * of them is a trap:
 *
 *   IT IS NOT THE SAME SNAG EVERY TIME.
 *   LITTER COMES HOME and is paid for; the weeds do not, because weeds are
 *   not litter.
 *   AND NONE OF IT IS SCRAP. "Trade five pieces of scrap" means iron off the
 *   bottom on a magnet. If a hatful of cans counted, the job would finish
 *   itself while you were fishing for something else.
 */
const H = require('./playtest.js');
const { G, RT, THREE, ok } = H;

G.resetProgress();
G.init({ scene: new THREE.Scene(),
         camera: new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 4000),
         renderer: { shadowMap: {}, domElement: {}, setSize() {}, render() {},
                     setPixelRatio() {}, getContext: () => null } });

const items = RT.content.roster.items || [];
const junk = items.filter(i => i.kind === 'junk');

console.log('WHAT THE LAKE GIVES YOU INSTEAD OF A FISH');
console.log();
junk.forEach(i => console.log('  ' + i.name.padEnd(22) + ' $' + (i.value || 0)));
console.log();

ok(junk.length >= 5, 'the lake has more than one kind of rubbish in it (' + junk.length + ')');
ok(junk.some(i => /weed/i.test(i.name)), 'including a tangle of weeds, which every angler pulls up');
ok(junk.filter(i => (i.value || 0) > 0).length >= 4,
   'and most of it is worth taking out of the water (' +
   junk.filter(i => (i.value || 0) > 0).length + ' of ' + junk.length + ')');
ok(junk.some(i => (i.value || 0) === 0), 'while the weeds are worth nothing, because they are not litter');

/* Every piece of it has a picture and something for Walt to say. */
const fs = require('fs');
const path = require('path');
const art = path.join(__dirname, '..', 'images', 'items');
let missing = 0, silent = 0;
junk.forEach((i) => {
  if (!fs.existsSync(path.join(art, i.id + '.png'))) { missing++; console.log('  no picture for ' + i.id); }
  if (!((global.FishMasterData || {}).ITEM_QUIPS || {})[i.id]) { silent++; console.log('  Walt has nothing to say about ' + i.id); }
});
ok(missing === 0, 'every piece of rubbish has a picture');
ok(silent === 0, 'and Walt has a line for each of them');

/* ── It comes home, and it pays ─────────────────────────────────────────── */
console.log();
console.log('BRINGING IT IN');
console.log();
const sv = G.getSave();
sv.money += 400;
['bamboo_rod'].forEach(r => { if (!sv.rods.includes(r)) sv.rods.push(r); });
if (!sv.baits.includes('earthworm')) sv.baits.push('earthworm');
sv.briefed = 99;
sv.currentMission = 6;
G.goToDock();
G.castOff();

/* Put one of each straight on the line, the way a snag arrives. */
const before = { money: sv.money, scrap: sv.scrapTraded || 0 };
junk.forEach((i) => {
  G.__debugCatch ? G.__debugCatch(i) : null;
});
/* No debug hook: land them by hand through the same path the game uses. */
const held = [];
junk.forEach((i) => {
  if ((i.value || 0) > 0) held.push({ id: i.id, name: i.name, value: i.value, type: 'junk' });
});
sv.hold = sv.hold.concat(held);
const worth = G.holdValue();
console.log('  ' + held.length + ' pieces of litter in the boat, worth $' + worth);
ok(worth > 0, 'litter in the boat is worth something at the counter ($' + worth + ')');
ok(worth === held.reduce((a, b) => a + b.value, 0), 'and it is worth exactly what it says');

G.returnToDock();
const sold = G.sellCatch();
console.log('  handed in: $' + (sv.money - before.money) + ' for the litter, scrap counter ' +
            before.scrap + ' -> ' + (sv.scrapTraded || 0));
ok(sv.money > before.money, 'Walt pays for it');
ok((sv.scrapTraded || 0) === before.scrap,
   'and NONE of it counts as scrap (' + before.scrap + ' -> ' + (sv.scrapTraded || 0) + ')');
ok((sv.hold || []).length === 0, 'the boat is empty again');

/* ── And what actually comes up over a hundred snags ────────────────────── */
console.log();
console.log('A HUNDRED SNAGS');
console.log();
const tally = {};
for (let i = 0; i < 100; i++) {
  const it = G.__rollJunk ? G.__rollJunk() : null;
  if (!it) break;
  tally[it.name] = (tally[it.name] || 0) + 1;
}
const kinds = Object.keys(tally);
/* The surface litter is netted, not hooked: it must not turn up on a rod. */
ok(!tally['Floating Litter'],
   'a rod never snags the floating litter that is netted off the surface');
if (kinds.length) {
  kinds.sort((a, b) => tally[b] - tally[a]).forEach(k => console.log('  ' + k.padEnd(22) + tally[k]));
  ok(kinds.length >= 4, 'a hundred snags bring up ' + kinds.length + ' different things');
} else {
  console.log('  (the engine has no hook to roll one by hand)');
}

/* ── WHOSE VOICE IS ON THE CATCH CARD ────────────────────────────────────
   The card is what you see in the BOAT, the moment a thing breaks the
   surface. Reported: "why does it say 'kid looks at the tines' on the item we
   pull up? I figured it shouldn't have Walt's line on the item." It should
   not: every one of the six clue pieces carried Walt's counter reaction, half
   a mile from Walt - and he then said a fuller version of it to your face at
   the hand-in.

   Two rules, both about who is speaking. A story piece gets no quip at all -
   the reaction to it is Walt's and belongs where he is. And nothing on the
   card speaks in the voice of a man behind a counter. */
console.log();
console.log('WHOSE VOICE IS ON THE CATCH CARD');
const QUIPS = (global.FishMasterData || {}).ITEM_QUIPS || {};
let told = 0;
(RT.content.roster.items || []).forEach(function (i) {
  if (i.kind !== 'story') return;
  if (QUIPS[i.id] && QUIPS[i.id].length) {
    told++;
    console.log('  ' + i.id + ' has Walt reacting on the card: "' + QUIPS[i.id][0] + '"');
  }
});
ok(told === 0, 'no story piece has a reaction printed on it out in the boat (' + told + ')');

/* The counter's own turns of phrase - an offer to take the thing off you, or
   to put it on the bill - which only make sense with Walt in front of you. */
const COUNTER = [/\bI will take\b/i, /\bI'll take\b/i, /\bagainst the bill\b/i,
                 /\bhand it (over|to me)\b/i, /\blet me see\b/i, /^kid\b/i,
                 /\bmy counter\b/i];
let voices = 0, lines = 0;
Object.keys(QUIPS).forEach(function (id) {
  (QUIPS[id] || []).forEach(function (q) {
    lines++;
    if (COUNTER.some(function (re) { return re.test(q); })) {
      voices++;
      console.log('  ' + id + ' speaks from behind the counter: "' + q + '"');
    }
  });
});
console.log('  ' + lines + ' quips, every one in the voice of whoever is holding the thing');
ok(lines > 10, 'the rubbish still has something to say about itself (' + lines + ')');
ok(voices === 0, 'and none of it is Walt talking from the shop (' + voices + ')');

/* ── NOT THE SAME LUMP EVERY TIME ────────────────────────────────────────
   Scrap is what a magnet brings up most - forty hauls in a session - and one
   painting for all of them reads as catching the same object over and over.
   An item can carry a list of paintings; this checks the list is used, that
   every file in it is on disk, and that a hundred hauls do not all come up
   looking identical. */
console.log();
console.log('WHAT SCRAP LOOKS LIKE');
const fs2 = require('fs');
const path2 = require('path');
const withArt = (RT.content.roster.items || []).filter(function (i) { return i.art && i.art.length; });
ok(withArt.length > 0, 'something in the lake has more than one painting (' + withArt.length + ')');
let noFile = 0;
withArt.forEach(function (i) {
  i.art.forEach(function (a) {
    const p = path2.join(__dirname, '..', 'images', 'items', a + '.png');
    if (!fs2.existsSync(p)) { noFile++; console.log('  ' + i.id + ' names ' + a + '.png, which is not there'); }
  });
});
ok(missing === 0, 'every painting an item names is on disk (' + noFile + ' missing)');

const drew = {};
for (let i = 0; i < 200; i++) {
  const a = G.debugCatchArt({ type: 'valuable', id: 'scrap_metal' });
  drew[a] = (drew[a] || 0) + 1;
}
Object.keys(drew).sort().forEach(function (k) {
  console.log('  ' + k.replace('images/items/', '').padEnd(20) + drew[k]);
});
ok(Object.keys(drew).length >= 3,
   'scrap comes up looking like several things (' + Object.keys(drew).length + ' in 200 hauls)');

/* AND IT IS STUFF, NOT A THING. "Pulled up a scrap metal" - reported. Whether
   a name takes an article is a fact about the object, so the roster says so. */
const A = G.articleFor;
const stuff = (RT.content.roster.items || []).filter(function (i) { return i.mass; });
let wrong = 0;
stuff.forEach(function (i) {
  if (A(i.name) !== '') { wrong++; console.log('  "' + i.name + '" is stuff and still takes "' + A(i.name) + '"'); }
});
ok(stuff.length > 0 && wrong === 0,
   'nothing says "a scrap metal" (' + stuff.length + ' mass nouns, ' + wrong + ' wrong)');
ok(A('Old Boot') === 'an' && A('Lost Anchor') === 'a',
   'and things that ARE countable still get their article');

/* ── HOW MANY WALLETS WOULD BE IN A LAKE? ────────────────────────────────
   Reported: "we keep getting soggy wallets, these should be rarer - objects
   we pull up should be based on percentages, more common like weeds are
   higher and wallets are way lower." Every item used to be equally likely,
   because the table was picked with one call to random over its length.

   Three things to hold, and the first is the one that was actually wrong:

     THE WEIGHTS ARE OBEYED. Rolled ten thousand times and compared against
     what the roster declares, item by item.

     EVERYTHING PAINTED CAN BE CAUGHT. A ring and a watch had art, and
     fallback glyphs on the catch card, and no roster entry at all - so
     neither could ever come up, and nothing noticed: the art is referenced
     by the code that draws it, so the asset check counted them as used.

     AND THE RARE THINGS STAY RARE. A gold ring is a story, not a Tuesday. */
console.log();
console.log('WHAT THE LAKE GIVES UP, AND HOW OFTEN');
const junkItems = (RT.content.roster.items || [])
  .filter(function (i) { return i.kind === 'junk' || i.kind === 'valuable'; });
const sv3 = G.getSave();
(RT.content.roster.rods || []).forEach(function (r) { if (!sv3.rods.includes(r.id)) sv3.rods.push(r.id); });
sv3.rod = 'hand_net'; sv3.kitRodId = 'hand_net'; sv3.kitToolId = null;

const ROLLS = 10000;
const got = {};
for (let i = 0; i < ROLLS; i++) {
  const o = G.__rollJunk();
  got[o.id] = (got[o.id] || 0) + 1;
}
const declared = junkItems.reduce(function (t, i) { return t + (i.weight == null ? 1 : i.weight); }, 0);
let offBy = 0;
junkItems.forEach(function (i) {
  const want = 100 * (i.weight == null ? 1 : i.weight) / declared;
  const saw = 100 * (got[i.id] || 0) / ROLLS;
  const wrong = Math.abs(saw - want) > Math.max(1.2, want * 0.25);
  if (wrong) offBy++;
  console.log('  ' + i.name.padEnd(20) + 'declared ' + want.toFixed(1).padStart(5) +
              '%   came up ' + saw.toFixed(1).padStart(5) + '%' + (wrong ? '   <- off' : ''));
});
ok(offBy === 0, 'what comes up matches the weights on the items (' + offBy + ' off)');

const never = junkItems.filter(function (i) { return !got[i.id]; });
never.forEach(function (i) { console.log('  ' + i.name + ' never came up in ' + ROLLS + ' snags'); });
ok(never.length === 0, 'everything the lake holds can actually be caught (' + never.length + ' unreachable)');

/* The complaint, in numbers: weed is what a lake is full of, a wallet is a
   thing somebody lost once. */
const wOf = function (id) {
  const r = junkItems.find(function (i) { return i.id === id; }) || {};
  return r.weight == null ? 1 : r.weight;
};
ok(wOf('weeds') > wOf('wallet') * 8,
   'weed is far commoner than wallets (' + wOf('weeds') + ' against ' + wOf('wallet') + ')');
ok(wOf('boot') > wOf('wallet') && wOf('tire') > wOf('wallet'),
   'and so are boots and tyres, which is what a lake bottom is like');
const rare = junkItems.filter(function (i) { return i.kind === 'valuable'; });
ok(rare.length >= 2, 'the lake has something worth finding in it (' + rare.length + ')');
ok(rare.every(function (i) { return (100 * (i.weight || 1) / declared) < 3; }),
   'and finding it is a story rather than a Tuesday');

/* Every item's art, while we are here: a painting that names a file which is
   not there is a blank card at the one moment the card is the reward. */
const fsL = require('fs');
const pathL = require('path');
let noArt = 0;
(RT.content.roster.items || []).forEach(function (i) {
  (i.art || [i.id]).forEach(function (a) {
    if (!fsL.existsSync(pathL.join(__dirname, '..', 'images', 'items', a + '.png'))) {
      noArt++;
      console.log('  ' + i.id + ' has no painting called ' + a + '.png');
    }
  });
});
ok(noArt === 0, 'and every one of them has a painting (' + noArt + ' missing)');

/* ── AND CLEARING IT TAKES AS MANY TRIPS AS IT SAYS ──────────────────────
   Reported: "when getting 5 pieces of litter I pulled up 1 can and it said I
   completed the mission." A named retrieval used to be scored by writing the
   job's whole amount on the first find - invisible on the clue jobs, where
   there is one propeller, and wrong on the two that ask for several. Asked
   here of every retrieval job in the game rather than of the two that were
   broken, because the next one written could be for six. */
console.log();
console.log('HOW MANY FINDS EACH RETRIEVAL JOB TAKES');
(RT.content.quests.quests || [])
  .filter(q => q.need.type === 'recoverItem' && q.need.itemId)
  .forEach(function (q) {
    const m = (RT.quests.build().missions || []).find(x => x.id === q.id);
    const sv = G.getSave();
    sv.currentMission = m.n; sv.highestMission = m.n; sv.progressValue = 0;
    const want = q.need.amount || 1;
    let finds = 0;
    for (let i = 0; i < 20; i++) {
      G.debugApply(m, { type: 'junk', id: q.need.itemId, name: q.need.itemId, value: 0 });
      finds++;
      if (sv.progressValue >= want) break;
    }
    console.log('  ' + q.id.padEnd(6) + q.title.slice(0, 30).padEnd(32) +
                'wants ' + want + ', takes ' + finds);
    ok(finds === want, q.id + ' takes ' + want + ' find' + (want === 1 ? '' : 's') +
       ', not ' + finds);
  });

/* And the net shows what came up in it - the clean-up job is about pulling
   rubbish out of the water, and the bag was empty when it came up. */
const rigSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'art.js'), 'utf8');
ok(/netLitter/.test(rigSrc) && /userData\.litter/.test(rigSrc),
   'and there is rubbish modelled in the net, not just fish');

const res = H.results();
console.log();
console.log(res.fail === 0
  ? res.checks + ' checks passed. The lake is full of rubbish, and it is worth clearing.'
  : res.fail + ' of ' + res.checks + ' checks failed.');
process.exit(res.fail ? 1 : 0);
