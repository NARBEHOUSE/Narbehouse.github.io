/**
 * Does the game say sentences that make sense?
 *
 *     node tools/wordcheck.js
 *
 * A player heard "Your fish are here, in the Black Crappie." The cast card
 * builds a list of what is within reach and had filed each shoal's FISH name
 * in a field called `biome`, so every sentence written round it put a fish
 * where a place belongs. It is the kind of fault no suite catches, because
 * every part of it works: the card appears, the name is right, the grammar is
 * fine, and the sentence is nonsense.
 *
 * So this collects what the game actually SAYS - by playing it and recording
 * every spoken line - and reads it. Two things it can check without being
 * able to read English:
 *
 *   A FISH IS NOT A PLACE. No line may put a species name after "in the",
 *   "over the", "at the" or "along the", which are the shapes a place goes
 *   in. Nor may a place name be used where a fish is being counted.
 *
 *   NOTHING IS BLANK OR DOUBLED. No "the the", no "undefined", no "null", no
 *   "NaN", no empty name left in a sentence, no stray "0 " counts.
 *
 * Everything else about a line is a matter of taste and belongs to a person.
 */
const H = require('./playtest.js');
const { G, RT, THREE, ok } = H;

G.resetProgress();
G.init({ scene: new THREE.Scene(),
         camera: new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 4000),
         renderer: { shadowMap: {}, domElement: {}, setSize() {}, render() {},
                     setPixelRatio() {}, getContext: () => null } });

const said = [];
G.callbacks.onSpeak = (t) => { if (t) said.push(String(t)); };

/* Every line the SCAN would read out, too - those never go through say(). */
function harvestTargets(where, list) {
  (list || []).forEach((t) => {
    if (t.speech) said.push(t.speech);
    if (t.label) said.push(String(t.label));
    if (t.sub) said.push(String(t.sub));
  });
}

/* Play a while, in a boat, so the cast card and the cues have something to
   talk about. */
const sv = G.getSave();
sv.money += 900;
['bamboo_rod', 'fiber_rod'].forEach(r => { if (!sv.rods.includes(r)) sv.rods.push(r); });
if (!sv.baits.includes('earthworm')) sv.baits.push('earthworm');
['canoe', 'kayak'].forEach(v => { if (!sv.vessels.includes(v)) sv.vessels.push(v); });
sv.briefed = 99;

const JOBS = [2, 6, 7, 10, 12, 16, 20, 23, 30];
JOBS.forEach((n) => {
  sv.currentMission = n;
  G.goToDock();
  harvestTargets('dock', G.dockTargets());
  G.enterShop();
  harvestTargets('shop', G.shopTargets());
  G.goToDock();
  G.castOff();
  let dir = 1;
  for (let f = 0; f < 30 * 60; f++) {
    /* PULL OVER when the game offers a shoal. The cast card only has anything
       to say when there are fish in reach - trolling past them for a minute
       collects "Nothing in reach" sixty times and never exercises the line a
       player actually complained about. */
    if (G.isSteering()) {
      if (!(G.pullOverTo && (G.pullOverTo('left') || G.pullOverTo('right')))) {
        if (f % 120 === 0) dir = -dir;
        G.setSteer(dir);
      } else {
        G.setSteer(0);
      }
    }
    G.update(1 / 30);
    if (f % 15 === 0) harvestTargets('spot', G.spotTargets());
    if (!G.isSteering() && !G.isFishing() && G.chooseTroll) G.chooseTroll();
  }
  G.returnToDock();
});

const lines = Array.from(new Set(said.map(s => s.replace(/<[^>]*>/g, '').trim()).filter(Boolean)));
console.log('WHAT THE GAME SAYS');
console.log();
console.log('  ' + lines.length + ' distinct lines heard or shown across ' + JOBS.length + ' jobs');

const fish = (RT.content.roster.fish || []).map(f => f.name);
const waters = ((RT.content.lake.stages || []).map(s => s.name))
  .concat(['drop-off', 'shallows', 'weedbeds', 'weed beds', 'shoreline', 'trench',
           'reeds', 'reed beds', 'bay', 'shallow bay', 'deep hole']);

/* ── A fish is not a place ─────────────────────────────────────────────── */
const PLACE_WORDS = ['in the', 'into the', 'over the', 'at the', 'along the',
                     'round the', 'across the', 'out on the'];
const asPlace = [];
lines.forEach((l) => {
  fish.forEach((name) => {
    PLACE_WORDS.forEach((w) => {
      const re = new RegExp(w + '\\s+' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      if (re.test(l)) asPlace.push({ line: l, name: name, word: w });
    });
  });
});
asPlace.slice(0, 8).forEach(a =>
  console.log('  "' + a.line + '"  <- "' + a.word + ' ' + a.name + '" puts a fish where a place goes'));
ok(asPlace.length === 0,
   'no line puts a fish name where a place name belongs (' + asPlace.length + ')');

/* ── And a place is not a fish ─────────────────────────────────────────── */
const asFish = [];
lines.forEach((l) => {
  waters.forEach((w) => {
    const re = new RegExp('(tag|catch|land|hook|release)(ed|ing)?\\s+(a|an|\\d+)?\\s*' +
                          w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
    if (re.test(l)) asFish.push({ line: l, name: w });
  });
});
asFish.slice(0, 6).forEach(a => console.log('  "' + a.line + '"  <- "' + a.name + '" is a place, not a catch'));
ok(asFish.length === 0, 'no line asks you to catch a place (' + asFish.length + ')');

/* ── Nothing blank, doubled or half-built ──────────────────────────────── */
const BROKEN = [
  { re: /\bundefined\b/i,        why: 'a value that was not there' },
  { re: /\bnull\b/i,             why: 'a null' },
  { re: /\bNaN\b/,               why: 'a number that is not a number' },
  { re: /\bthe the\b/i,          why: '"the the"' },
  { re: /\ba a\b/i,              why: '"a a"' },
  { re: /\band and\b/i,          why: '"and and"' },
  { re: /\bthe\s*[.,!]/i,        why: 'a sentence ending on "the"' },
  { re: /\s{3,}/,                why: 'a gap where a word should be' },
  { re: /\bin the \./i,          why: 'a place that was left blank' },
  { re: /\[object Object\]/,     why: 'an object printed as a word' },
  /* A COUNT TAKES NO ARTICLE. The net comes up with a haul named "5 tiny
     fish" and every catch is announced as "A " plus its name, so the game
     said "A 5 tiny fish". Reported. Four digits is a year, not a count -
     the 1994 Warden's Lockbox keeps its article. */
  { re: /\ban? \d{1,2}\b/i,       why: 'an article in front of a count' },
];
let broken = 0;
lines.forEach((l) => {
  BROKEN.forEach((b) => {
    if (b.re.test(l)) { broken++; console.log('  "' + l + '"  <- ' + b.why); }
  });
});
ok(broken === 0, 'no line is blank, doubled or half-built (' + broken + ')');

/* AND "AN" WHERE A NAME OPENS ON A VOWEL. Old Boot was announced as "A Old
   Boot". Which names those are is in the roster, so it is read rather than
   guessed at - "a unique" is correct English and a word list would forbid it. */
{
  const rost = JSON.parse(require('fs').readFileSync(
    require('path').join(__dirname, '..', 'content', 'roster.json'), 'utf8'));
  const vowel = [].concat(rost.fish || [], rost.items || [])
    .map(r => r.name || '').filter(n => /^[aeiou]/i.test(n));
  let wrong = 0;
  vowel.forEach((n) => {
    lines.forEach((l) => {
      if (l.indexOf('A ' + n) >= 0) {
        wrong++;
        console.log('  "' + l + '"  <- should be "An ' + n + '"');
      }
    });
  });
  ok(wrong === 0, 'a name that opens on a vowel gets "An" (' + vowel.length +
     ' such names, ' + wrong + ' wrong)');

  /* AND THE RULE ITSELF, name by name. A trip that trolls nine jobs never
     scoops the net and never hooks Old Boot, so scanning what was said this
     run proves nothing about either - the two cases that were wrong. Every
     name in the roster goes through the rule instead. */
  const A = G.withArticle;
  const bad = [];
  [].concat(rost.fish || [], rost.items || []).forEach((r) => {
    const n = r.name || '';
    /* Three ways a name takes no article, and all three are facts about the
       thing rather than about the spelling: it is STUFF rather than an object
       (scrap metal, floating litter - the roster says which), it already
       brought its own determiner (The Warden's Bell), or it opens on a count
       (5 tiny fish). */
    const want = r.mass || /^(the|a|an)\s/i.test(n) ? n
               : /^[aeiou]/i.test(n) ? 'An ' + n
               : 'A ' + n;
    if (A(n) !== want) bad.push(A(n) + '  (wanted "' + want + '")');
  });
  [3, 5, 8].forEach((k) => {
    const n = k + ' tiny fish';
    if (A(n) !== n) bad.push(A(n) + '  (wanted "' + n + '" - a count takes no article)');
  });
  bad.forEach(b => console.log('  ' + b));
  ok(bad.length === 0, 'every name is announced with the right word in front of it');
}

/* AND THE WORDS THE VOICE GETS WRONG. "Bass" is spelled the same as the
   instrument and a speech engine cannot tell them apart, so it is respelled
   on the way into the voice and NOWHERE ELSE. Three things have to hold: the
   respelling reaches every spoken line, it never reaches the written name,
   and it does not touch a word that merely contains those letters - "brass",
   which this game says constantly, being the one that would hurt. */
const sayable = (RT.util && RT.util.sayable) || null;
ok(!!sayable, 'the voice has a pronunciation pass');
if (sayable) {
  const spoken = lines.filter(l => /\bbass\b/i.test(l));
  const missed = spoken.filter(l => /\bbass\b/i.test(sayable(l)));
  ok(spoken.length > 0, 'the game does say the word (' + spoken.length + ' lines)');
  ok(missed.length === 0,
     'no spoken line still reads "bass" to the voice (' + missed.length + ' left)');
  /* WHAT the respelling is, is a knob for the ear: "bahss" came out as
     "boss" and became "basss". So this checks the PROPERTIES rather than the
     spelling - that the fish is respelled at all, and that the respelling
     does not touch a word which merely contains those letters. */
  const spelt = sayable('Largemouth Bass').split(' ').pop();
  ok(spelt.toLowerCase() !== 'bass' && /^b/i.test(spelt),
     'the fish is respelled for the voice (as "' + spelt + '")');
  ok(sayable('a brass frame and a bass') === 'a brass frame and a ' + spelt,
     'brass is left alone, bass is not');
  ok(sayable('bass') !== 'bass' && sayable(sayable('bass')) === sayable('bass'),
     'respelling twice says the same thing');
  /* The written name must survive untouched: what is drawn never goes
     through this, so the roster is the thing to read. */
  const rost = JSON.parse(require('fs').readFileSync(
    require('path').join(__dirname, '..', 'content', 'roster.json'), 'utf8'));
  const fish = (rost.fish || []).find(s => s.id === 'bass') || {};
  ok(/Bass/.test(fish.name || ''), 'the card still spells it Bass (' + fish.name + ')');
}

/* A sample, so a person can read what the game is actually saying. */
console.log();
console.log('a sample of what was heard:');
lines.filter(l => /cast|reach|here/i.test(l)).slice(0, 10)
     .forEach(l => console.log('  ' + l));

const res = H.results();
console.log();
console.log(res.fail === 0
  ? res.checks + ' checks passed. It says what it means.'
  : res.fail + ' of ' + res.checks + ' checks failed.');
process.exit(res.fail ? 1 : 0);
