/**
 * Does the lake actually hold the game?
 *
 *   node tools/check_content.js
 *
 * The roster says a Lake Trout lives in twenty-eight feet and up; the chart
 * says where twenty-eight feet is; the stages say what can get there. Those
 * three are written in different files by different hands, and nothing stops
 * them disagreeing - which is how the last version ended up with a job asking
 * for a Channel Catfish in a zone that had no deep water in it.
 *
 * So this asks the questions that make a progression work:
 *
 *   Does every fish have water of its depth?           - or it cannot exist
 *   When does that water first come within reach?      - or it is unfindable
 *   Does anything become reachable too early?          - or the tiers collapse
 *   Is there a rod for every fish?                     - or it cannot be held
 *   Does each vessel open new water AND new fish?       - or why buy it
 *
 * It measures the real lake with the game's own chart maths, so a shoreline
 * dragged in the editor changes these answers.
 */
const fs = require('fs');
const path = require('path');

const ROOT = process.argv[2] || path.join(__dirname, '..');
const RT = require(path.join(ROOT, 'js', 'lake.js'));

const lakeDoc = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'lake.json'), 'utf8'));
const roster = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'roster.json'), 'utf8'));
const L = RT.chart(lakeDoc);

let fail = 0, checks = 0;
const ok = (c, msg) => {
  checks++;
  if (!c) { fail++; console.log('  FAIL  ' + msg); }
  return c;
};

/* ── Sample the lake once ─────────────────────────────────────────────────
   Every question below is "how much water is like this", so one pass over a
   grid answers all of them. 20 units is about two boat lengths - fine enough
   that the narrows and the shelves are not missed. */
const GRID = 20;
const e = L.extent;
const water = [];
for (let x = e.minX; x <= e.maxX; x += GRID) {
  for (let z = e.minZ; z <= e.maxZ; z += GRID) {
    const ft = L.depthAt(x, z);
    if (ft <= 0) continue;
    water.push({ x: x, z: z, ft: ft, r: L.fromDock(x, z) });
  }
}
const cell = GRID * GRID / 1e6;   // km2 per sample
console.log('WHISPERING LAKE  ' + water.length + ' samples, ' +
            (water.length * cell).toFixed(2) + ' km2 of water');
console.log('  ' + Math.round(e.maxX - e.minX) + ' x ' + Math.round(e.maxZ - e.minZ) +
            ' units, deepest ' + Math.max(...water.map(w => w.ft)).toFixed(0) + ' ft');

/** The first stage whose reach covers any water in this depth band. */
function firstStageFor(lo, hi) {
  for (const s of L.stages) {
    const n = water.filter(w => w.ft >= lo && w.ft < hi && w.r <= s.reach).length;
    if (n > 0) return { stage: s, cells: n };
  }
  return null;
}

/* ── The fish ─────────────────────────────────────────────────────────── */
console.log();
console.log('FISH                 depth      water    first reachable    rod needed');
const rodsByTier = roster.rods.slice().sort((a, b) => a.tier - b.tier);
roster.fish.forEach(f => {
  const [lo, hi] = f.depthFt;
  const band = water.filter(w => w.ft >= lo && w.ft < hi);
  const first = firstStageFor(lo, hi);
  /* A net nets and a rod hooks. The first version accepted any rod of a high
     enough tier, so a five-dollar hand net came back as the right tool for a
     sunfish - the tiers matched and nothing said the net cannot hook. */
  const rod = rodsByTier.find(r =>
    r.tier >= f.tier && (f.netOnly ? r.isNet : r.canHook !== false && !r.isNet));

  ok(band.length > 0, f.id + ' has water of its depth (' + lo + '-' + hi + ' ft)');
  ok(!!first, f.id + ' has water of its depth WITHIN REACH of some stage');
  ok(!!rod, f.id + ' has a rod that can hold it (tier ' + f.tier + ')');

  console.log('  ' + f.name.padEnd(20) +
              ((lo + '-' + (hi > 90 ? '' : hi) + ' ft').padEnd(10)) +
              ((band.length * cell).toFixed(2) + ' km2').padStart(10) + '   ' +
              (first ? first.stage.id : 'NOWHERE').padEnd(18) +
              (rod ? rod.name : 'NONE'));
});

/* ── The vessels ──────────────────────────────────────────────────────────
   A vessel has to be worth buying, and "worth buying" means it opens water
   AND puts a fish in reach that was not before. One without the other is a
   purchase with nothing behind it. */
console.log();
console.log('VESSELS              opens        new fish within reach');
let prevReach = 0;
const seen = new Set();
roster.vessels.forEach(v => {
  const st = L.stages.find(s => s.vessel === v.id) ||
             L.stages.find(s => s.id === v.id);
  const reach = st ? st.reach : v.reach;
  const opened = water.filter(w => w.r > prevReach && w.r <= reach);

  const nowFish = roster.fish.filter(f =>
    water.some(w => w.r <= reach && w.ft >= f.depthFt[0] && w.ft < f.depthFt[1]));
  const fresh = nowFish.filter(f => !seen.has(f.id));
  fresh.forEach(f => seen.add(f.id));

  // `foot` is the starting point, so it opens nothing by definition.
  if (v.id !== 'foot') {
    ok(opened.length > 0, v.id + ' opens water nothing before it could reach');
    ok(fresh.length > 0, v.id + ' puts at least one new fish in reach');
  }

  console.log('  ' + v.name.padEnd(20) +
              ((opened.length * cell).toFixed(2) + ' km2').padStart(9) + '    ' +
              (fresh.length ? fresh.map(f => f.name).join(', ') : '-'));
  prevReach = Math.max(prevReach, reach);
});
ok(seen.size === roster.fish.length,
   'every fish is reachable by the end (' + seen.size + ' of ' + roster.fish.length + ')');

/* ── The ladder ───────────────────────────────────────────────────────────
   Prices have to climb, or the order you buy things in is arbitrary. */
console.log();
console.log('THE LADDER');
const ladder = []
  .concat(roster.rods.map(r => ({ n: r.name, p: r.price, k: 'rod' })))
  .concat(roster.vessels.filter(v => v.price > 0).map(v => ({ n: v.name, p: v.price, k: 'vessel' })))
  .concat(roster.tools.map(t => ({ n: t.name, p: t.price, k: 'tool' })))
  .sort((a, b) => a.p - b.p);
ladder.forEach(x => console.log('  $' + String(x.p).padStart(5) + '  ' +
                                x.k.padEnd(7) + x.n));
const total = ladder.reduce((s, x) => s + x.p, 0);
console.log('  ' + '-'.repeat(34));
console.log('  $' + String(total).padStart(5) + '  everything, bought once');

/* Is that a sane amount of fishing? Priced against the best fish a stage can
   reach, which is the honest way to ask "how long is this going to take". */
console.log();
console.log('WHAT IT PAYS');
roster.vessels.forEach(v => {
  const st = L.stages.find(s => s.vessel === v.id) || L.stages.find(s => s.id === v.id);
  const reach = st ? st.reach : v.reach;
  const best = roster.fish
    .filter(f => !f.secret && f.perLb > 0)
    .filter(f => water.some(w => w.r <= reach && w.ft >= f.depthFt[0] && w.ft < f.depthFt[1]))
    .map(f => ({ f: f, top: f.perLb * f.weightLb[1] }))
    .sort((a, b) => b.top - a.top)[0];
  if (!best) return;
  console.log('  ' + v.name.padEnd(20) + 'best fish in reach: ' +
              best.f.name + ' at up to $' + Math.round(best.top));
});

/* ── Story pieces ─────────────────────────────────────────────────────── */
console.log();
const story = roster.items.filter(i => i.kind === 'story');
const scrap = roster.items.filter(i => i.kind === 'scrap');
console.log('SALVAGE      ' + story.length + ' story pieces, ' + scrap.length +
            ' kinds of scrap, ' + roster.items.filter(i => i.kind === 'junk').length +
            ' kinds of junk');
ok(story.length >= 4, 'there are story pieces to find (' + story.length + ')');
ok(scrap.length >= 2, 'there is scrap worth selling (' + scrap.length + ')');
ok(roster.tools.some(t => t.kind === 'magnet'),
   'there is a magnet to find them with');


/* ══════════════════════════════════════════════════════════════════════
   THE LADDER, JOB BY JOB

   Every job is asked the same question: with the gear a player can have by
   the time they reach it, and the water that gear can get to, is the thing
   this job asks for actually catchable? It is the check that would have
   caught "catch three sunfish off the dock" being answered with yellow
   perch all morning, and it is here so that never has to be found by fishing
   for twenty minutes and giving up.

   What a player HAS at job n: every rod, vessel and tool that a job at or
   before n either sells (and they could afford) or hands over. This audit is
   generous about money - it assumes they saved up - because the question is
   whether the job is POSSIBLE, not whether it is affordable on the first try.
   ══════════════════════════════════════════════════════════════════════ */
console.log();
console.log('THE LADDER, JOB BY JOB');

const questDoc = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'quests.json'), 'utf8'));
const quests = questDoc.quests || [];
const rodById = (id) => roster.rods.find((r) => r.id === id);
const vesselById = (id) => roster.vessels.find((v) => v.id === id);
const fishById = (id) => roster.fish.find((f) => f.id === id);
const STAGE = {};
(lakeDoc.stages || []).forEach((st) => { STAGE[st.id] = st; });

let haveRods = [], haveVessels = ['foot'], haveTools = [];
roster.rods.forEach((r) => { if (r.owned) haveRods.push(r.id); });
roster.tools.forEach((t) => { if (t.owned) haveTools.push(t.id); });

let ladderProblems = 0;
quests.forEach((q, i) => {
  // What this job puts out or hands over is available FROM this job on.
  (q.sells || []).forEach((id) => {
    if (rodById(id)) haveRods.push(id);
    if (vesselById(id)) haveVessels.push(id);
    if (roster.tools.find((t) => t.id === id)) haveTools.push(id);
  });
  if (q.gives && q.gives.rodId) haveRods.push(q.gives.rodId);
  if (q.gives && q.gives.toolId) haveTools.push(q.gives.toolId);

  const t = q.need || {};
  const name = 'q' + String(i + 1).padStart(2, '0') + ' ' + (q.title || q.id);

  // The deepest water this job's boats may float in, and the deepest a rod fishes.
  let boatFt = 0, boatName = 'on foot';
  haveVessels.forEach((id) => {
    const v = vesselById(id);
    if (!v) return;
    const cap = v.maxDepthFt || (v.id === 'foot' ? 10 : 999);
    if (cap > boatFt) { boatFt = cap; boatName = v.name; }
  });
  let rodFt = 0, rodName = 'nothing', castFt = 0;
  haveRods.forEach((id) => {
    const r = rodById(id);
    if (!r || r.isNet) return;
    if ((r.rangeFt || 0) > rodFt) { rodFt = r.rangeFt || 0; rodName = r.name; castFt = r.castFt || 0; }
  });

  if (t.speciesId) {
    const f = fishById(t.speciesId);
    if (!f) { console.log('  FAIL  ' + name + ': unknown fish ' + t.speciesId); ladderProblems++; return; }
    const wantFrom = Math.max(f.depthFt[0], t.minDepthFt || 0);
    const wantTo = f.depthFt[1];
    /* The band that is actually fishable: deep enough for the fish (and for
       the job), shallow enough that a hull may sit over it or a rod reach it
       from where a hull may sit. */
    const canReach = Math.max(boatFt, rodFt);
    if (wantFrom > wantTo) {
      console.log('  FAIL  ' + name + ': asks for ' + f.name + ' below ' + t.minDepthFt +
                  ' ft but it lives ' + f.depthFt.join('-') + ' ft');
      ladderProblems++;
    } else if (wantFrom > canReach) {
      console.log('  FAIL  ' + name + ': ' + f.name + ' starts at ' + wantFrom +
                  ' ft; by now the deepest is ' + boatName + ' (' + boatFt + ' ft) with the ' +
                  rodName + ' (' + rodFt + ' ft)');
      ladderProblems++;
    } else if (f.netOnly && !haveRods.some((id) => (rodById(id) || {}).isNet)) {
      console.log('  FAIL  ' + name + ': ' + f.name + ' is netted, and there is no net yet');
      ladderProblems++;
    } else if (!f.netOnly && rodFt <= 0) {
      console.log('  FAIL  ' + name + ': ' + f.name + ' takes a hook, and there is no rod yet');
      ladderProblems++;
    } else {
      /* And is it the thing you would actually catch there? Anything else
         living in the same band competes for the bite, so say how crowded it
         is - four or more rivals in the same water is a job that will feel
         like it is not working. */
      const rivals = roster.fish.filter((o) => o.id !== f.id && !o.secret && !o.netOnly &&
        o.depthFt[1] > wantFrom && o.depthFt[0] < Math.min(wantTo, canReach));
      const crowd = rivals.length;
      const note = crowd === 0 ? 'alone in that water'
                 : crowd + ' other' + (crowd === 1 ? '' : 's') + ' in it (' +
                   rivals.map((o) => o.name).join(', ') + ')';
      console.log('  ok    ' + name.padEnd(44) + f.name + ' at ' + wantFrom + '-' +
                  Math.min(wantTo, canReach) + ' ft, ' + note);
      if (crowd >= 4) {
        console.log('        NOTE  crowded water: expect a lot of other species first');
      }
    }
  } else if (t.type === 'recoverItem') {
    const rec = roster.items.find((x) => x.id === t.itemId);
    const needsMagnet = rec && !rec.netOnly;
    const hasMagnet = haveTools.some((id) => (roster.tools.find((x) => x.id === id) || {}).kind === 'magnet');
    if (needsMagnet && !hasMagnet) {
      console.log('  FAIL  ' + name + ': ' + (rec ? rec.name : t.itemId) +
                  ' comes up on a magnet, and there is no magnet yet');
      ladderProblems++;
    }
  } else if (t.type === 'ownVessel' && !haveVessels.includes(t.vesselId)) {
    console.log('  FAIL  ' + name + ': asks you to own the ' + t.vesselId + ', which is not on sale by then');
    ladderProblems++;
  } else if (t.type === 'ownTool' && !haveTools.includes(t.toolId)) {
    console.log('  FAIL  ' + name + ': asks you to own the ' + t.toolId + ', which is not on sale by then');
    ladderProblems++;
  }
});

/* ── The wallet ────────────────────────────────────────────────────────
   Every dollar in this game is the reward for handing a job in: a fish is
   tagged and let go, scrap is traded because a job asks for it, and an
   artifact is worth nothing but the story. So the payouts ARE the economy,
   and this walks them - job by job, buying each thing the moment the shelf
   offers it - to prove the ladder can actually be climbed. It also reports
   the tightest moment, which is the one worth feeling. */
console.log();
console.log('THE WALLET');
let purse = 5, worst = { left: 1e9, at: '' }, brokeAt = null, spent = 0;
const owned = {};
quests.forEach((q, i) => {
  purse += (q.reward && q.reward.money) || 0;
  (q.sells || []).forEach((id) => {
    const thing = rodById(id) || vesselById(id) || roster.tools.find((t) => t.id === id);
    if (!thing || owned[id]) return;
    const price = thing.price || 0;
    if (purse < price) { if (!brokeAt) brokeAt = q.id + ' cannot afford ' + thing.name + ' ($' + price + ' with $' + purse + ')'; return; }
    purse -= price; spent += price; owned[id] = 1;
    if (purse < worst.left) worst = { left: purse, at: thing.name };
  });
  // The tow at the incident goes on the tab and comes out of what follows.
  if (q.reward && q.reward.debt) purse -= q.reward.debt;
  if (purse < 0 && !brokeAt) brokeAt = q.id + ' leaves you $' + purse;
});
console.log('  jobs pay $' + (purse + spent - 5) + ', the ladder costs $' + spent +
            ', and you finish with $' + purse);
console.log('  tightest moment: $' + worst.left + ' left after buying the ' + worst.at);
ok(!brokeAt, 'the ladder can be climbed on job money alone' + (brokeAt ? ' (' + brokeAt + ')' : ''));
ok(worst.left < 260, 'and it is tight enough to feel (tightest was $' + worst.left + ')');

ok(ladderProblems === 0, 'every job asks for something catchable with the gear of its day (' +
   ladderProblems + ' problem' + (ladderProblems === 1 ? '' : 's') + ')');

/* ── Does the writing agree with the fish? ───────────────────────────────
   A brief is prose and a depth range is data, and nothing joined the two up:
   the catfish job asked for three from fifty feet and would not count one
   above forty, while the fish itself tops out at forty-five. The ladder
   stopped dead on it. Every depth a job SAYS is checked against the range of
   the fish it is about - digits or words, one number or a range. */
console.log();
console.log('WHAT THE JOBS SAY ABOUT DEPTH');
const WORD = { ten: 10, fifteen: 15, twenty: 20, 'twenty-five': 25, thirty: 30,
               'thirty-five': 35, forty: 40, 'forty-five': 45, fifty: 50,
               'fifty-five': 55, sixty: 60, 'sixty-five': 65, seventy: 70,
               'seventy-five': 75, eighty: 80, ninety: 90, hundred: 100 };
const WORDS = Object.keys(WORD).sort((a, b) => b.length - a.length).join('|');
const DEPTH_RE = new RegExp(
  '\\b(\\d{1,3})\\s*(?:ft|feet|foot|-foot)\\b' +
  '|\\b(' + WORDS + ')(?:\\s+to\\s+(' + WORDS + '))?\\s*(?:feet|foot)\\b', 'gi');

function depthsIn(text) {
  const out = [];
  let m;
  DEPTH_RE.lastIndex = 0;
  while ((m = DEPTH_RE.exec(text || '')) !== null) {
    if (m[1]) out.push(Number(m[1]));
    else {
      out.push(WORD[m[2].toLowerCase()]);
      if (m[3]) out.push(WORD[m[3].toLowerCase()]);
    }
  }
  return out;
}

let saidWrong = 0, saidChecked = 0;
quests.forEach((q) => {
  const id = q.need && q.need.speciesId;
  if (!id) return;
  const f = roster.fish.find((x) => x.id === id);
  if (!f) return;
  const lo = f.depthFt[0], hi = f.depthFt[1];
  const text = [q.card || '', (q.say && q.say.brief) || ''].join(' | ');
  depthsIn(text).forEach((d) => {
    saidChecked++;
    if (d < lo - 2 || d > hi + 2) {
      saidWrong++;
      console.log('  ' + q.id + ': says ' + d + ' ft, but a ' + f.name +
                  ' lives ' + lo + ' to ' + hi);
    }
  });
  /* And the floor it counts from has to leave water worth fishing. */
  const min = q.need.minDepthFt;
  if (min !== undefined && hi - min < 10) {
    saidWrong++;
    console.log('  ' + q.id + ': counts nothing above ' + min + ' ft, which leaves a ' +
                (hi - min) + ' ft window for a fish that stops at ' + hi);
  }
});
console.log('  ' + saidChecked + ' depths named across the ladder');
ok(saidWrong === 0,
   'every depth a job names is water its fish actually lives in (' + saidWrong + ' wrong)');
/* WHAT IS ACTUALLY AT A PLACE. A place can declare a `feature` - so far only
   the submerged log jam - and the lake builds it as scenery. Reported: "I
   don't know what a submerged log jam is", because the water there was drawn
   like any other deep water. Two things worth pinning: a feature nobody
   builds is a typo, and the jam does not quietly lose its timber again. */
const worldSrc = fs.readFileSync(path.join(ROOT, 'js', 'world.js'), 'utf8');
const lakeSrc = fs.readFileSync(path.join(ROOT, 'js', 'lake.js'), 'utf8');
/* A feature has to be known in both halves or it is only half real: the
   chart turns it into a barrier the hull is stopped by, and the world draws
   the thing the player is being stopped by. One without the other is a lake
   that lies - invisible walls, or timber you can sail through. */
const pick = (src, re) => new Set((src.match(re) || [])
  .map(x => x.replace(/[\s\S]*'([a-z]+)'[\s\S]*/, '$1')));
const charted = pick(lakeSrc, /feature === '([a-z]+)'/g);
const drawn = pick(worldSrc, /kind !== '([a-z]+)'/g);
const buildable = new Set(Array.from(charted).filter(k => drawn.has(k)));
console.log('  features the chart bars: ' + (Array.from(charted).join(', ') || 'none') +
            '   the lake draws: ' + (Array.from(drawn).join(', ') || 'none'));
let unbuilt = 0;
(lakeDoc.places || []).forEach((p) => {
  if (!p.feature) return;
  if (!buildable.has(p.feature)) {
    unbuilt++;
    console.log('  ' + p.id + ': feature "' + p.feature + '" is not one the lake builds');
  }
});
ok(buildable.size > 0 && unbuilt === 0,
   'every feature a place declares is one the lake builds (' + unbuilt + ' unknown)');
const jam = (lakeDoc.places || []).find(p => /log jam/i.test(p.label || ''));
ok(!!jam && jam.feature === 'logjam',
   'the log jam has logs in it (' + (jam ? jam.id + ' feature=' + jam.feature : 'no such place') + ')');

console.log();
console.log(fail === 0
  ? checks + ' checks passed. The lake holds the game.'
  : fail + ' of ' + checks + ' checks failed.');
process.exit(fail ? 1 : 0);
