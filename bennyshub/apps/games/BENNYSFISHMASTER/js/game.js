'use strict';
/* ==========================================================================
   BENNY'S FISHMASTER
   A fishing-trip sim for one or two switches (Spacebar + Return).

   Casting is a direction and a power. Direction stays a scan list of lake
   sectors, because five named pie-slices is exactly what a scan list is good
   at. Power is a charge meter you hold Space to fill and Return to cast —
   BENNYSBALLISTA's arrangement, copied deliberately rather than invented
   again (AGENTS.md, "Hold-to-charge and hold-to-sweep"): the meter clamps at
   full instead of wrapping, letting go only stops it, and a dotted line
   previews exactly where the lure lands and what lives there the whole time.
   There is no sweet spot and nothing to miss.

   Landing a bite is a self-paced colour sequence with no clock and no
   timeout, cued by a whole side of the screen fading up like a lamp — blue
   left for Return, red right for Space. A wrong press never fails you, it
   only lowers the catch's quality, and a very low quality run just means junk
   comes up on the line instead of the fish. Nothing here can be failed by
   being slow.

   See ../../../AGENTS.md for the rules this game is built to.
   ========================================================================== */

const D  = window.FishMasterData;
const LG = window.FishMasterLakeGen;
// art.js paints the pond. Every call site below is guarded — if the file fails
// to load, the game falls back to the flat wedge rendering it shipped with
// rather than showing a blank canvas to someone who can't debug it.
const A  = window.FishMasterArt || null;

/* ── Tunables ───────────────────────────────────────────────────────────── */
const CFG = {
  SPACE_HOLD_MS   : 3000,  // hold Space this long to start scanning by itself
  RETURN_HOLD_MS  : 1500,  // hold Return this long to back out / open Pause (per AGENTS.md)
  SCAN_DIR_ON_HOLD: -1,    // matches every other hub game

  W: 1280, H: 720,         // fixed design resolution; canvas letterboxes to fit
  BOAT_X: 640, BOAT_Y: 660,
  LAKE_MAX_R: 560,
  // Band edges live in lakegen.js (LG.BAND_FRAC) because rod reach is measured
  // against the same radius and the two tables only make sense side by side.

  /* Hold-to-charge casting. Deliberately slow — AGENTS.md asks for "a speed Ben
     can actually stop on, not a demo-friendly one" — so a full charge takes
     twenty seconds, the same pace BENNYSBALLISTA sweeps and charges at. The
     meter stops dead at 100% and stays there; over-holding is never worse than
     stopping at the perfect moment, because there is no perfect moment. */
  CHARGE_PCT_PER_S: 5,
  CHARGE_TICK_PCT : 10,    // click every this much charge, so the ear tracks it too
  MIN_CAST_FRAC   : 0.06,  // even a 0% cast plops in the water beside the boat

  /* The catch light: one slow breath between GLOW_MIN and GLOW_MAX opacity.
     2.4 seconds a cycle is a lamp on a dimmer, nowhere near flashing, and it
     is a cue only — the sequence waits however long it waits. */
  GLOW_PERIOD_S: 2.4,
  GLOW_MIN: 0.12,
  GLOW_MAX: 0.55,

  BITING_DURATION: 0.9,    // seconds; skippable cosmetic delay, never a reaction window

  MIN_QUALITY_FOR_FISH: 25, // below this, a rolled fish is demoted to junk instead

  // Bite-category odds, cumulative. Whatever's left over after these three is
  // a fish. Kept high on purpose — an empty cast should be the rare outcome.
  BITE: { NOTHING: 0.08, VALUABLE: 0.05, JUNK: 0.12 },

  STARTING_MONEY: 20
};

const QUALITY_BUCKETS = [
  { min: 75, max: 100, pMin: 0.85, pMax: 1.00, label: 'Excellent' },
  { min: 50, max: 74,  pMin: 0.40, pMax: 0.85, label: 'Good' },
  { min: 25, max: 49,  pMin: 0.10, pMax: 0.40, label: 'Fair' },
  { min: 0,  max: 24,  pMin: 0.00, pMax: 0.10, label: 'Poor' }
];

/* ── Persistence ────────────────────────────────────────────────────────── */
const SAVE_KEY = 'bennysfishmaster_save';
const SET_KEY  = 'bennysfishmaster_settings';
/* v2: objectives are chosen per lake from a pool and validated against what
   the lake can actually deliver, so a v1 save's fixed objective list and its
   counters no longer describe anything real. See migrateSave(). */
const SAVE_VERSION = 2;

const settings = { theme: 'ben', fontScale: 100, sound: true };

function defaultSave() {
  return {
    money: CFG.STARTING_MONEY,
    ownedRods: ['starter'],
    equippedRodId: 'starter',
    ownedBait: {}, // free bait (plainworm) is never metered — see equippedBait()/consumeEquippedBait()
    equippedBaitId: 'plainworm',
    unlockedLakes: ['lake1'],
    // largemouth_dingus is quietly unlocked from the start — it just never
    // shows up in ordinary narration and is near-unreachable without the
    // secret bait equipped (see biteWeightedFishPool).
    unlockedSpecies: ['sunfish', 'bass', 'pike', 'perch', 'largemouth_dingus'],
    unlockedBait: ['plainworm', 'nightcrawler', 'minnowlure'],
    unlockedRods: ['starter', 'castmaster'],
    lakeProgress: {},
    currentLakeId: 'lake1',
    creel: [],
    sawDingusReveal: false,
    version: SAVE_VERSION
  };
}
let save = defaultSave();

/* A v1 save carries a per-lake objective list that was fixed in data.js and a
   set of counters against it. Objectives are picked from a pool now and
   validated against the lake, so those counters point at nothing. Money, gear,
   the creel and which lakes are cleared all carry over untouched; only
   in-progress objective counters restart, and they restart against objectives
   that are actually completable. Dropping objectiveIds is the whole migration:
   ensureLakeProgress re-picks whatever it finds missing. */
function migrateSave() {
  if ((save.version || 1) >= SAVE_VERSION) { save.version = SAVE_VERSION; return; }
  const lakes = save.lakeProgress || {};
  Object.keys(lakes).forEach(id => {
    const p = lakes[id];
    if (!p) return;
    delete p.objectiveIds;
    delete p.objectives;
  });
  save.version = SAVE_VERSION;
}

function loadAll() {
  try {
    const s = JSON.parse(localStorage.getItem(SET_KEY) || 'null');
    if (s) Object.assign(settings, s);
  } catch (e) { /* corrupt settings shouldn't stop the game loading */ }
  try {
    const g = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (g) Object.assign(save, g);
  } catch (e) { /* same for progress */ }
  migrateSave();
}
function saveSettings() { try { localStorage.setItem(SET_KEY, JSON.stringify(settings)); } catch (e) {} }
function saveProgress() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} }

/* ── Shared-module shims ────────────────────────────────────────────────── */
const vm = () => window.NarbeVoiceManager || null;
const sm = () => window.NarbeScanManager || null;

function speak(text) {
  if (!text) return;
  const v = vm();
  document.getElementById('sr').textContent = text; // never blocks input
  if (v) { try { v.speak(String(text)); } catch (e) {} }
}
function sfx(name, vol) {
  if (!settings.sound || !window.SafeAudio) return;
  try { SafeAudio.play(name, vol); } catch (e) {}
}
function autoScanOn() { const m = sm(); return m ? m.getSettings().autoScan : false; }
function scanInterval() { const m = sm(); return m ? m.getScanInterval() : 2000; }
function ttsOn() {
  const v = vm();
  try { return v ? v.getSettings().ttsEnabled !== false : false; } catch (e) { return false; }
}
function voiceName() {
  const v = vm();
  try { return v ? v.getVoiceDisplayName(v.getCurrentVoice()) : 'n/a'; } catch (e) { return 'n/a'; }
}

/* ── Data lookups ───────────────────────────────────────────────────────── */
function fishById(id) { return D.FISH.find(f => f.id === id); }
function lakeTemplateById(id) { return D.LAKE_TEMPLATES.find(t => t.id === id); }
function rod() { return D.RODS.find(r => r.id === save.equippedRodId) || D.RODS[0]; }
function equippedBait() { return D.BAIT.find(b => b.id === save.equippedBaitId) || D.BAIT[0]; }
function round1(n) { return Math.round(n * 10) / 10; }

/* ══════════════════════════════════════════════════════════════════════════
   GAME STATE
   ══════════════════════════════════════════════════════════════════════════ */
const G = {
  screen: 'menu',       // menu | cast | biting | catch | overlay
  stage: 'direction',   // within 'cast': direction | power
  overlay: null,
  lakeId: null,
  LAKE: null,
  pick: { direction: 2 },   // direction is still a scan list; power is a meter
  locked: {},
  scan: -1,
  menuIx: 0,
  menuStack: [],
  preview: null,
  lastLanding: null,

  /* The cast charge. `charging` is "the meter is moving right now", `charged`
     is "it has moved at all this cast" — the second one is what stops a stray
     Return from flinging the line nowhere. `lastPowerPct` is what the previous
     cast used, so the direction step can preview at a distance the player has
     actually thrown before instead of guessing. */
  powerPct: 0,
  charging: false,
  charged: false,
  powTick: 0,
  lastPowerPct: 100,

  bitingTimer: 0,
  animTime: 0,          // wall clock for the surface drift, art only
  rodTip: null,         // where paintBoat put the rod tip, so the line starts there
  bitingResolved: false,
  pendingBite: null,
  catch: null,          // { category, speciesId, sequence, stepIndex, correctCount, results }
  glowT: 0,             // catch-light phase, advanced in the loop so a pause freezes it
  postCatchQueue: [],
  resumeScreen: null
};

const timers = { space: null, spaceRepeat: null, ret: null, auto: null };
const input  = { spaceDown: false, retDown: false, retLong: false };

/* ── Elements ───────────────────────────────────────────────────────────── */
const $ = id => document.getElementById(id);
const cv = $('cv'), ctx = cv.getContext('2d');
const chipHolders = { direction: $('chipsDirection') };
const lanes       = { direction: $('laneDirection'), power: $('lanePower') };
const powerMeter  = { box: $('meterPower'), fill: $('fillPower'), val: $('valPower'), marks: $('bandMarks') };
const glow        = { root: $('catchGlow'), left: $('glowLeft'), right: $('glowRight'),
                      washLeft: $('washLeft'), washRight: $('washRight') };


/* Palette cache — read once per theme change, not per frame. */
const PALETTE_VARS = [
  '--bg', '--panel', '--panel2', '--line', '--text', '--dim',
  '--accent', '--accent2', '--violet', '--focus', '--good', '--bad',
  '--seqred', '--seqblue', '--water-near', '--water-far', '--boat',
  '--biome-shallows', '--biome-weedbed', '--biome-dropoff', '--biome-rockyshore', '--biome-deepchannel',
  // pond art palette (js/art.js)
  '--bank-grass', '--bank-soil', '--foliage-dark', '--foliage-light',
  '--rock-light', '--rock-mid', '--rock-dark', '--sand',
  '--water-shallow', '--water-mid', '--water-deep', '--glint',
  '--lily', '--reed', '--log', '--boat-dark', '--angler'
];
let PAL = {};
function refreshPalette() {
  const cs = getComputedStyle(document.body);
  PAL = {};
  for (const v of PALETTE_VARS) PAL[v] = cs.getPropertyValue(v).trim() || '#888';
}
function css(name) { return PAL[name] || '#888'; }

/* ── Pond art ───────────────────────────────────────────────────────────────
   The painted pond is expensive to build and never changes within a session,
   so it lives in an offscreen bitmap keyed by lake + seed + colour profile.
   The key is checked at draw time rather than invalidated by hand, so no
   future caller can forget to refresh it.

   GEOM is the whole contract between gameplay and paint: art.js gets the frame,
   the boat, the reference radius and the band edges, and everything it draws
   follows from those. bandFrac is read from lakegen rather than CFG so the band
   table keeps exactly one home.
   ────────────────────────────────────────────────────────────────────────── */
const GEOM = {
  W: CFG.W, H: CFG.H,
  boatX: CFG.BOAT_X, boatY: CFG.BOAT_Y,
  maxR: CFG.LAKE_MAX_R, bandFrac: LG.BAND_FRAC
};
const lakeArt = { bitmap: null, key: '' };
const motionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
/* One query, two users: the pond's surface drift and the catch light's breath
   both stand still for someone who has asked for less motion. Read live rather
   than cached at boot, so changing the setting takes effect without a reload. */
function reducedMotion() { return !!(motionQuery && motionQuery.matches); }
// High Contrast is a real accessibility profile, not a skin: the pond keeps
// its shape there but drops gradients and texture for flat fills and outlines.
function artFlat() { return settings.theme === 'contrast'; }

function lakeBitmap() {
  if (!A || !G.LAKE) return null;
  const key = G.LAKE.lakeId + ':' + G.LAKE.seed + ':' + settings.theme;
  if (lakeArt.key !== key || !lakeArt.bitmap) {
    lakeArt.bitmap = A.buildLakeBitmap(G.LAKE, css, GEOM, { flat: artFlat() });
    lakeArt.key = key;
  }
  return lakeArt.bitmap;
}

/* ══════════════════════════════════════════════════════════════════════════
   LAKE / SESSION SETUP
   ══════════════════════════════════════════════════════════════════════════ */
/* ── Reach: what water a rod can actually put a lure into ────────────────── */
function rodById(id) { return D.RODS.find(r => r.id === id) || D.RODS[0]; }

/* The best rod the player is ABLE to have here, not the one they happen to be
   holding — every rod in unlockedRods is buyable with money that fishing always
   earns, so an objective behind a rod upgrade is a thing to work towards, not a
   wall. What is NOT allowed is an objective behind a rod this lake never
   unlocks; that is the case objectiveFeasible() exists to throw out. */
function bestUnlockedRod() {
  return (save.unlockedRods || ['starter'])
    .map(rodById)
    .reduce((best, r) => (!best || r.reachFrac > best.reachFrac ? r : best), null) || D.RODS[0];
}

/* How much fishable water this direction has, as a fraction of CFG.LAKE_MAX_R.
   This is the shape term every reach and band calculation multiplies by, and
   with art.js loaded it is the PAINTED shoreline (inset to keep casts off the
   rocks) rather than the bare radiusMul circle — so what the game says about a
   cast and where the bobber lands are the same fact. radiusMul is the fallback
   when art.js is missing, which is also what the flat wedge lake draws.

   Note the painted bank carries its own seeded noise on top of radiusMul, so
   this spreads WIDER than radiusMul does (~0.67-1.12 against 0.85-1.15). The
   rod reach table in data.js is derived from that spread; the two move
   together or the progression breaks. */
function waterFracFor(sector) {
  if (A && G.LAKE) return A.waterRadius(G.LAKE, sector.bearing, GEOM) / CFG.LAKE_MAX_R;
  return sector.radiusMul;
}

/* How far this rod can throw in this direction — its own reach, or the far
   bank, whichever comes first. Nothing is gained by casting onto dry land. */
function maxReachFrac(sector, rodItem) {
  return Math.min((rodItem || rod()).reachFrac, waterFracFor(sector));
}

function reachableBiomeIds(lake, rodItem) {
  const out = [];
  lake.sectors.forEach(s => {
    LG.reachableBands(maxReachFrac(s, rodItem), waterFracFor(s)).forEach(band => {
      const id = s.biomesByBand[band];
      if (out.indexOf(id) === -1) out.push(id);
    });
  });
  return out;
}

/* Every species this lake will actually hand over: it has to live in water the
   rod can reach, and it has to be unlocked. Secret fish are excluded — the
   Dingus is a joke, not a target, and objectives never count it. */
function catchableSpeciesIds(lake, rodItem) {
  const biomes = reachableBiomeIds(lake, rodItem);
  return D.FISH.filter(f =>
    !f.secret &&
    save.unlockedSpecies.indexOf(f.id) !== -1 &&
    f.biomeIds.some(b => biomes.indexOf(b) !== -1)
  ).map(f => f.id);
}

/* ── Objective feasibility ───────────────────────────────────────────────────
   The one rule: an objective may only be handed out if this lake, as generated,
   can actually deliver it. That means the species is unlocked, it lives in a
   biome this lake owns, that biome is inside the reach of a rod available here,
   and the number being asked for is inside the species' own range. A lake is
   still free to CONTAIN fish that are out of reach — that is what a better rod
   is for — it just can't set one as homework.
   ────────────────────────────────────────────────────────────────────────── */
const MAX_CATCHES_FOR_WEIGHT = 8;   // a weight target shouldn't need a grind

function objectiveFeasible(obj, catchableIds) {
  if (!catchableIds.length) return false;

  if (obj.speciesId) {
    if (catchableIds.indexOf(obj.speciesId) === -1) return false;
    const f = fishById(obj.speciesId);
    if (!f) return false;
    // "24 inches or longer" is only fair if the fish grows that long at all.
    if (obj.type === 'catchLength') return f.lengthRange[1] >= obj.amount;
    if (obj.type === 'catchWeight') return f.weightRange[1] * MAX_CATCHES_FOR_WEIGHT >= obj.amount;
    return true;
  }

  // No species named: any fish counts, so it only has to be reachable at all.
  if (obj.type === 'catchLength') return false;   // meaningless without a species
  if (obj.type === 'catchWeight') {
    const heaviest = catchableIds.reduce((m, id) => Math.max(m, fishById(id).weightRange[1]), 0);
    return heaviest * MAX_CATCHES_FOR_WEIGHT >= obj.amount;
  }
  return true;
}

function objectivePool(template) { return template.objectivePool || []; }
function objectiveById(template, id) { return objectivePool(template).find(o => o.id === id); }

/**
 * Picks a lake's seed and its objectives together, because neither one is
 * decidable alone: which fish are reachable depends on the shape the seed
 * rolled, and whether the objectives are fair depends on which fish are
 * reachable.
 *
 * Re-rolls the seed up to SEED_TRIES times looking for a lake that can deliver
 * the template's PREFERRED objectives — the first `objectiveCount` entries in
 * the pool, the hand-authored ones. Failing that it keeps the roll that could
 * satisfy the most pool entries and takes those in preference order, which is
 * why every pool ends with a species-agnostic objective: there is always
 * something left that any lake with fish in it can satisfy.
 */
const SEED_TRIES = 32;

function pickLakeSetup(template) {
  const rodItem = bestUnlockedRod();
  const count = template.objectiveCount || 2;
  const pool = objectivePool(template);
  let best = null;

  for (let attempt = 0; attempt < SEED_TRIES; attempt++) {
    const seed = Math.floor(Math.random() * 1e9);
    const catchable = catchableSpeciesIds(LG.generateLake(template, seed), rodItem);
    const feasible = pool.filter(o => objectiveFeasible(o, catchable));
    if (pool.slice(0, count).every(o => objectiveFeasible(o, catchable))) {
      return { seed, objectiveIds: pool.slice(0, count).map(o => o.id) };
    }
    if (!best || feasible.length > best.feasible.length) best = { seed, feasible };
  }

  return { seed: best.seed, objectiveIds: best.feasible.slice(0, count).map(o => o.id) };
}

function ensureLakeProgress(lakeId) {
  const template = lakeTemplateById(lakeId);
  let p = save.lakeProgress[lakeId];

  // Missing entirely (first visit), or carrying objectives that no longer
  // resolve — a v1 save, or a data.js edit that renamed a pool entry. Either
  // way the fix is the same: pick the lake and its objectives over again.
  const stale = !p || !Array.isArray(p.objectiveIds) || !p.objectiveIds.length ||
                p.objectiveIds.some(id => !objectiveById(template, id));
  if (stale) {
    const setup = pickLakeSetup(template);
    p = save.lakeProgress[lakeId] = {
      seed: setup.seed,
      objectiveIds: setup.objectiveIds,
      objectives: setup.objectiveIds.map(() => ({ current: 0 })),
      completed: p ? !!p.completed : false
    };
  }
  // Counters and objectives can only ever be the same length.
  if (!Array.isArray(p.objectives) || p.objectives.length !== p.objectiveIds.length) {
    p.objectives = p.objectiveIds.map((id, i) => (p.objectives && p.objectives[i]) || { current: 0 });
  }
  return p;
}

/* The live objectives for a lake, resolved from the ids in the save. Every
   read of "what am I doing here" goes through this rather than reaching into
   data.js, so the pool stays a menu of candidates and this stays the answer. */
function lakeObjectives(lakeId) {
  const template = lakeTemplateById(lakeId);
  const p = save.lakeProgress[lakeId];
  if (!p || !p.objectiveIds) return [];
  return p.objectiveIds.map(id => objectiveById(template, id)).filter(Boolean);
}

/* If an objective's fish is out of the CURRENT rod's reach, say which rod
   fixes that. The objective is still completable — that is guaranteed before
   it is ever handed out — this is just the part the player can't see. */
function objectiveGearHint(obj) {
  if (!obj.speciesId || !G.LAKE) return '';
  const have = catchableSpeciesIds(G.LAKE, rod());
  if (have.indexOf(obj.speciesId) !== -1) return '';
  const better = D.RODS
    .filter(r => r.reachFrac > rod().reachFrac && save.unlockedRods.indexOf(r.id) !== -1)
    .filter(r => catchableSpeciesIds(G.LAKE, r).indexOf(obj.speciesId) !== -1)
    .sort((a, b) => a.cost - b.cost)[0];
  const fish = fishById(obj.speciesId).name;
  return better
    ? ` The ${fish} is out past what the ${rod().name} can throw — the ${better.name} in the shop reaches it.`
    : ` The ${fish} is out past what the ${rod().name} can throw here.`;
}

function objectivesSpokenPhrase(lakeId) {
  const progress = save.lakeProgress[lakeId];
  if (progress.completed) return 'All objectives complete for this lake.';
  return lakeObjectives(lakeId)
    .map((obj, i) => `${obj.description}: ${progress.objectives[i].current} of ${obj.amount}.${objectiveGearHint(obj)}`)
    .join(' ');
}

function shortObjLabel(obj) {
  if (obj.type === 'catchCount')  return obj.speciesId ? fishById(obj.speciesId).name : 'Any fish';
  if (obj.type === 'catchWeight') return (obj.speciesId ? fishById(obj.speciesId).name + ' lbs' : 'Total lbs');
  if (obj.type === 'catchLength') return fishById(obj.speciesId).name + ' in';
  return 'Objective';
}
function objectivesShortText(lakeId) {
  const progress = save.lakeProgress[lakeId];
  if (progress.completed) return 'Objectives complete!';
  return lakeObjectives(lakeId)
    .map((obj, i) => `${shortObjLabel(obj)} ${progress.objectives[i].current}/${obj.amount}`)
    .join(' · ');
}

function enterLake(lakeId, quiet) {
  const template = lakeTemplateById(lakeId);
  const progress = ensureLakeProgress(lakeId);
  save.currentLakeId = lakeId;
  G.lakeId = lakeId;
  G.LAKE = LG.generateLake(template, progress.seed);
  G.pick = { direction: Math.floor(G.LAKE.sectors.length / 2) };
  G.lastPowerPct = 100;
  G.postCatchQueue = [];
  saveProgress();
  enterCast(!quiet);
  if (!quiet) speak(`${template.name}. ${objectivesSpokenPhrase(lakeId)} Press space to start scanning.`);
}

/* ══════════════════════════════════════════════════════════════════════════
   NARRATION HELPERS
   ══════════════════════════════════════════════════════════════════════════ */
function joinNames(list) {
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  return `${list.slice(0, -1).join(', ')}, and ${list[list.length - 1]}`;
}
function speciesNamesPhrase(biomeId) {
  const list = D.FISH.filter(f => !f.secret && f.biomeIds.includes(biomeId) && save.unlockedSpecies.includes(f.id)).map(f => f.name);
  return list.length ? `${joinNames(list)} here.` : 'Nothing biting in this area yet.';
}
function baitBiasPhrase(biomeId) {
  const bait = equippedBait();
  if (!bait.biasTable) return '';
  let best = null;
  for (const f of D.FISH) {
    if (f.secret || !f.biomeIds.includes(biomeId)) continue;
    const m = bait.biasTable[f.id];
    if (m && m > 1 && (!best || m > best.m)) best = { f, m };
  }
  return best ? ` Your ${bait.name} bait favors ${best.f.name}.` : '';
}
function biomeNarrationPhrase(biomeId) {
  const biome = D.BIOMES[biomeId];
  return `${biome.name}. ${speciesNamesPhrase(biomeId)}${baitBiasPhrase(biomeId)}`;
}

/* ══════════════════════════════════════════════════════════════════════════
   CASTING — A SCAN LIST, THEN A METER
   Direction stays a scan list: five named pie-slices is exactly the shape a
   scan list handles well. Power is a charge meter instead of a list of named
   tiers, because "how hard do I throw" is a continuous thing and the old four
   tiers had two rods reaching identical water. See AIMING THE POWER below.
   ══════════════════════════════════════════════════════════════════════════ */
function stageOrder() { return ['direction', 'power']; }

function laneItems() { return G.LAKE.sectors.map((s, i) => ({ label: s.bearingLabel, ix: i })); }
function laneLen() { return laneItems().length; }

/* What the direction chips say underneath: where a cast at the power the
   player last used would land if they went this way. It matches the dotted
   line on the canvas exactly, on purpose — two previews that disagree would be
   worse than one. */
function dirSubLabel(ix) {
  return D.BIOMES[computeLanding({ dirIx: ix }).biomeId].name;
}

function renderChips() {
  const holder = chipHolders.direction;
  holder.innerHTML = '';
  laneItems().forEach(it => {
    const b = document.createElement('button');
    b.className = 'chip';
    b.type = 'button';
    b.innerHTML = `${it.label}<span class="sub">${dirSubLabel(it.ix)}</span>`;
    if (G.locked.direction && G.pick.direction === it.ix) b.classList.add('picked');
    if (G.screen === 'cast' && G.stage === 'direction' && G.scan === it.ix) b.classList.add('focus');
    b.addEventListener('click', () => {             // mouse is optional, never required
      if (G.screen !== 'cast' || G.stage !== 'direction') return;
      G.scan = it.ix; renderChips(); updatePreview(); commit();
    });
    holder.appendChild(b);
  });
  lanes.direction.classList.toggle('locked', !!G.locked.direction);
  lanes.direction.classList.toggle('active', G.screen === 'cast' && G.stage === 'direction');
}

/* The sublabels answer "where would THIS power land if I went that way", so
   they have to move with the meter. Rewriting the text in place rather than
   calling renderChips() every frame: rebuilding five buttons sixty times a
   second would also rebuild five click handlers sixty times a second, and a
   sublabel left frozen at the power it was first drawn at is exactly the kind
   of quiet lie the single computeLanding() is meant to prevent. */
function updateChipSubs() {
  const subs = chipHolders.direction.querySelectorAll('.chip .sub');
  for (let i = 0; i < subs.length; i++) subs[i].textContent = dirSubLabel(i);
}

function scanStep(dir) {
  const n = laneLen();
  let v = (G.scan === -1) ? n : G.scan;
  v = (v + dir + (n + 1)) % (n + 1);
  G.scan = (v === n) ? -1 : v;

  renderChips(); updatePreview(); updateFooter();

  if (G.scan === -1) { sfx('hover', .25); }
  else { sfx('hover', .5); announceFocus(); }
}

function announceFocus() {
  const it = laneItems()[G.scan];
  if (!it) return;
  const landing = computeLanding();
  speak(`${it.label}. ${reachPhrase(G.scan)} Landing in ${biomeNarrationPhrase(landing.biomeId)}`);
}

/* ══════════════════════════════════════════════════════════════════════════
   LANDING PREVIEW
   One function for "where does a cast go", so the dotted line, the chip
   sublabels, the meter readout and the spoken narration can never drift into
   telling the player four different things.
   ══════════════════════════════════════════════════════════════════════════ */
/* One number for "how hard is this cast", read by the preview, the chips, the
   meter and the narration alike. During the direction step it holds the power
   the LAST cast used — the meter shows that, dimmed, so a direction preview is
   drawn at a distance the player has actually thrown rather than at a guess.
   Reaching the power step is what resets it to nothing (beginStage). */
function currentPowerPct() { return G.powerPct; }

function computeLanding(opts) {
  opts = opts || {};
  let dirIx = (opts.dirIx != null) ? opts.dirIx : G.pick.direction;
  if (opts.dirIx == null && G.screen === 'cast' && G.stage === 'direction' && G.scan !== -1) dirIx = G.scan;

  const sector = G.LAKE.sectors[dirIx] || G.LAKE.sectors[0];
  const pct = (opts.pct != null) ? opts.pct : currentPowerPct();

  // Reach is clamped to the water's edge: over-charging lands at the back of
  // the pond, never on the rocks, and never costs anything.
  const water = waterFracFor(sector);
  const thrown = rod().reachFrac * (pct / 100);
  const frac = Math.max(CFG.MIN_CAST_FRAC, Math.min(thrown, water));
  const band = LG.bandForFrac(frac, water);
  const biomeId = LG.biomeAt(G.LAKE, sector.index, band);
  const radius = CFG.LAKE_MAX_R * frac;
  // art.js's project() is the one place a (bearing, radius) becomes a pixel —
  // it carries the perspective squash, so calling it is what keeps the bobber
  // on the patch of water the game just narrated.
  const point = A ? A.project(sector.bearing, radius, GEOM) : (() => {
    const angleRad = (sector.bearing - 90) * Math.PI / 180;
    return { x: CFG.BOAT_X + radius * Math.cos(angleRad), y: CFG.BOAT_Y + radius * Math.sin(angleRad) };
  })();
  const capped = thrown > water + 1e-9;
  return { sector, pct, band, biomeId, radius, frac, point, capped, water };
}
function updatePreview() { G.preview = (G.screen === 'cast') ? computeLanding() : null; }

/* Which biomes this direction opens up with the rod in hand — the thing that
   actually decides whether a direction is worth casting in. */
function reachPhrase(dirIx) {
  const sector = G.LAKE.sectors[dirIx] || G.LAKE.sectors[0];
  const bands = LG.reachableBands(maxReachFrac(sector, rod()), waterFracFor(sector));
  const names = [];
  bands.forEach(b => {
    const n = D.BIOMES[sector.biomesByBand[b]].name;
    if (names.indexOf(n) === -1) names.push(n);
  });
  return `You can reach ${joinNames(names)} this way.`;
}

/* ══════════════════════════════════════════════════════════════════════════
   AIMING THE POWER — hold Space to charge, Return to cast
   BENNYSBALLISTA's arrangement, matched rather than re-invented: Space holds
   the meter and Return commits it, which leaves Return-hold free to be the
   ordinary 1.5-second back/pause with no threshold to push out (AGENTS.md,
   "The pause-menu conflict").

   Nothing about it can be missed. The meter clamps at 100% and stays there, so
   holding too long is never worse than letting go at the right moment. Letting
   go only STOPS the meter — a separate Return press casts — so a switch
   slipping out of a hand costs nothing, and the player can stop, listen to
   where the line would land, and hold again to add more.

   Nothing is spoken while the meter moves: speech would run behind it and pile
   up on itself. The player is told where the lure lands the moment they stop,
   in stopCharge(), and nowhere else.
   ══════════════════════════════════════════════════════════════════════════ */
function meterStage() { return G.screen === 'cast' && G.stage === 'power'; }

function startMeter() {
  if (!meterStage()) return;
  stopAutoScan();
  if (G.charging) return;      // already filling under auto-scan; leave it be
  G.charging = true;           // picks up from where the last hold left off
  sfx('hover', .35);
  renderMeters(); updateFooter();
}

function releaseMeter() {
  if (G.charging) stopCharge();
}

function stopCharge() {
  G.charging = false;
  updatePreview(); updateChipSubs();
  renderMeters(); updateFooter();
  sfx('hover', .5);
  const l = computeLanding();
  const full = G.powerPct >= 100;
  const where = l.capped
    ? `${Math.round(G.powerPct)} percent — that is as far as the lake goes this way. `
    : `${Math.round(G.powerPct)} percent. `;
  speak(`${full ? 'Full power. ' : ''}${where}${LG.BAND_LABEL[l.band]}: ${biomeNarrationPhrase(l.biomeId)} `
      + (full ? 'Press return to cast, or hold return to go back and set it again.'
              : 'Press return to cast, or hold space to charge further.'));
}

/* The meter advances in the frame loop rather than on a timer, so opening the
   pause menu freezes it and closing it picks up exactly where it was. */
function stepMeter(dt) {
  if (!meterStage() || !G.charging) return;
  G.powerPct = Math.min(100, G.powerPct + CFG.CHARGE_PCT_PER_S * dt);
  G.charged = true;
  const step = Math.floor(G.powerPct / CFG.CHARGE_TICK_PCT);
  if (step !== G.powTick) { G.powTick = step; sfx('hover', .3); }
  if (G.powerPct >= 100) { stopCharge(); return; }   // clamped, and it says so
  updatePreview(); updateChipSubs(); renderMeters(); updateFooter();
}

function renderMeters() {
  const playing = G.screen === 'cast';
  const pct = Math.round(G.powerPct);
  const l = G.LAKE ? computeLanding() : null;

  powerMeter.fill.style.width = G.powerPct.toFixed(1) + '%';
  powerMeter.val.innerHTML = l
    ? `${pct}% <span class="msub">${LG.BAND_LABEL[l.band]} · ${D.BIOMES[l.biomeId].name}</span>`
    : `${pct}%`;
  powerMeter.box.setAttribute('aria-valuenow', pct);

  lanes.power.classList.toggle('active', playing && G.stage === 'power');
  lanes.power.classList.toggle('moving', G.charging);
  // Dimmed while picking a direction: it's showing last cast's power, not this
  // cast's, exactly as Ballista dims its power bar during the aim step.
  powerMeter.box.classList.toggle('dim', playing && G.stage !== 'power');
  $('btnCast').disabled = !(playing && G.stage === 'power');

  renderBandMarks();
}

/* Where the depth bands fall ON THE METER for the chosen direction, so "how
   hard do I have to throw to reach the weeds" is visible rather than
   memorised. The meter runs 0-100% of THIS ROD's reach, so a band edge past
   the end of the bar is water this rod simply cannot get to — it's left off
   instead of drawn somewhere misleading. */
function renderBandMarks() {
  if (!G.LAKE) { powerMeter.marks.innerHTML = ''; return; }
  const sector = G.LAKE.sectors[(G.screen === 'cast' && G.stage === 'direction' && G.scan !== -1) ? G.scan : G.pick.direction]
              || G.LAKE.sectors[0];
  const reach = rod().reachFrac;
  const water = waterFracFor(sector);
  let html = '';
  LG.BANDS.forEach((band, i) => {
    if (i === LG.BANDS.length - 1) return;          // no mark at the water's edge
    const at = LG.BAND_FRAC[band] * water / reach * 100;
    if (at > 0 && at < 100) html += `<div class="bandmark" style="left:${at.toFixed(2)}%"></div>`;
  });
  // Everything past the water's edge is the same spot on the pond; show it
  // capped rather than pretending the last stretch of the meter does something.
  const cap = water / reach * 100;
  if (cap < 100) html += `<div class="reachcap" style="left:${cap.toFixed(2)}%"></div>`;
  powerMeter.marks.innerHTML = html;
}

/* ══════════════════════════════════════════════════════════════════════════
   COMMITTING A CAST
   ══════════════════════════════════════════════════════════════════════════ */
/* One door into each step, so auto-scan and the reset of the power meter can't
   drift apart between the several places that change step. `keep` means "don't
   wipe the charge" — used when resuming from a pause, where throwing away the
   charge the player already built would be its own small betrayal. */
function beginStage(stage, opts) {
  opts = opts || {};
  G.stage = stage;
  G.charging = false;
  stopAutoScan();

  if (stage === 'direction') {
    if (!opts.keep) G.scan = -1;      // nothing highlighted until the first Space
    G.powerPct = G.lastPowerPct;      // preview at a distance already thrown
    G.charged = false;
    G.powTick = 0;
    resetAutoScan();
  } else {
    if (!opts.keep) { G.powerPct = 0; G.charged = false; G.powTick = 0; }
    if (autoScanOn()) G.charging = true;   // one switch: the meter fills itself
  }

  renderChips(); renderMeters(); updatePreview(); updateFooter();
}

function stageHint() {
  if (G.stage === 'direction') return 'Press space to scan directions.';
  return autoScanOn()
    ? 'The power meter is filling — press return to stop it.'
    : 'Hold space to charge the cast, let go to stop.';
}

/* Return, short press. In the direction list it picks; on the power meter it
   stops a moving meter first and only casts on a second press, which is what
   keeps an accidental release from throwing the line nowhere. */
function commit() {
  if (G.stage === 'power') { confirmCast(); return; }

  if (G.scan === -1) { speak('Nothing highlighted. Press space to keep scanning.'); return; }
  G.pick.direction = G.scan;
  G.locked.direction = true;
  sfx('select', .6);
  const it = laneItems()[G.scan];
  beginStage('power');
  speak(`${it.label} locked. ${reachPhrase(G.pick.direction)} ${stageHint()}`);
}

function confirmCast() {
  if (G.charging) { stopCharge(); return; }        // first press stops the meter
  if (!G.charged) {
    // Nothing charged yet, so this press is far likelier to be a mis-press
    // than a deliberate cast off the end of the rod tip.
    speak('No power yet. ' + (autoScanOn()
      ? 'The meter fills by itself — press return to stop it where you want it.'
      : 'Hold space to charge the cast, then press return to throw it.'));
    return;
  }
  G.locked.power = true;
  G.lastPowerPct = G.powerPct;
  sfx('select', .6);
  renderMeters();
  castLine();
}

/* Return-hold: back out one stage, or open the pause menu. Reachable from
   every screen, per AGENTS.md. */
function backOut() {
  if (G.screen === 'overlay') { closeOverlay(); return; }
  if (G.screen === 'cast' && G.stage === 'power') {
    G.locked.direction = false;
    G.locked.power = false;
    beginStage('direction', { keep: true });
    G.scan = G.pick.direction;
    renderChips(); updatePreview(); updateFooter();
    sfx('hover', .5);
    speak('Back to direction. Press space to scan.');
    return;
  }
  openOverlay('pause'); // direction stage, biting, catch, or menu
}

function enterCast(fresh) {
  G.screen = 'cast';
  G.locked = {};
  updateBottomBar();
  beginStage('direction');
  updateHud();
  if (fresh) speak('Press space to start scanning directions.');
}

/* ══════════════════════════════════════════════════════════════════════════
   CASTING THE LINE + BITE ROLL
   ══════════════════════════════════════════════════════════════════════════ */
function consumeEquippedBait() {
  const bait = equippedBait();
  if (bait.free) return;
  const count = save.ownedBait[bait.id] || 0;
  save.ownedBait[bait.id] = Math.max(0, count - 1);
  if (save.ownedBait[bait.id] === 0) {
    save.equippedBaitId = 'plainworm';
    speak(`Out of ${bait.name}. Switched back to Plain Worm.`);
  }
  saveProgress();
}

function biteWeightedFishPool(biomeId) {
  const bait = equippedBait();
  return D.FISH.filter(f => {
    if (!f.biomeIds.includes(biomeId)) return false;
    if (!save.unlockedSpecies.includes(f.id)) return false;
    // Secret fish only enter the pool once its own secret bait is equipped —
    // that's what makes it "near-unreachable" otherwise, per design.
    if (f.secret) return !!(bait.biasTable && bait.biasTable[f.id]);
    return true;
  }).map(f => ({ f, w: (bait.biasTable && bait.biasTable[f.id]) || 1 }));
}

function rollBite(biomeId) {
  const r = Math.random();
  if (r < CFG.BITE.NOTHING) return { category: 'nothing' };
  if (r < CFG.BITE.NOTHING + CFG.BITE.VALUABLE) return { category: 'valuable' };
  if (r < CFG.BITE.NOTHING + CFG.BITE.VALUABLE + CFG.BITE.JUNK) return { category: 'junk' };

  const pool = biteWeightedFishPool(biomeId);
  if (!pool.length) return { category: 'nothing' };
  const total = pool.reduce((s, x) => s + x.w, 0);
  let pick = Math.random() * total;
  for (const x of pool) { pick -= x.w; if (pick <= 0) return { category: 'fish', speciesId: x.f.id }; }
  return { category: 'fish', speciesId: pool[pool.length - 1].f.id };
}

function castLine() {
  const landing = computeLanding();
  G.lastLanding = landing;
  consumeEquippedBait();
  G.screen = 'biting';
  G.bitingTimer = 0;
  G.bitingResolved = false;
  G.pendingBite = rollBite(landing.biomeId);
  updateBottomBar();
  renderBitingBar();
  updateFooter();
  sfx('select', .6);
  speak(`Casting ${Math.round(landing.pct)} percent toward ${D.BIOMES[landing.biomeId].name}...`);
}

function resolveBiting() {
  if (G.screen !== 'biting' || G.bitingResolved) return;
  G.bitingResolved = true;
  const bite = G.pendingBite;
  if (bite.category === 'nothing') {
    speak("No bite this time. Cast again whenever you're ready.");
    enterCast(false);
    return;
  }
  startCatchSequence(bite);
}

/* ══════════════════════════════════════════════════════════════════════════
   CATCH MINIGAME — self-paced colour sequence, no clock, no hard fail
   ══════════════════════════════════════════════════════════════════════════ */
function sequenceLengthFor(bite) {
  if (bite.category === 'fish') return Math.max(2, Math.min(5, fishById(bite.speciesId).difficultyTier));
  return bite.category === 'valuable' ? 3 : 2;
}
function randomSequence(n) {
  const seq = [];
  for (let i = 0; i < n; i++) seq.push(Math.random() < 0.5 ? 'red' : 'blue');
  return seq;
}
function stepPrompt(i) {
  const c = G.catch.sequence[i];
  return c === 'red'
    ? `Step ${i + 1} of ${G.catch.sequence.length}: red light on the right. Press Space.`
    : `Step ${i + 1} of ${G.catch.sequence.length}: blue light on the left. Press Return.`;
}

function startCatchSequence(bite) {
  const n = sequenceLengthFor(bite);
  G.catch = { category: bite.category, speciesId: bite.speciesId || null, sequence: randomSequence(n), stepIndex: 0, correctCount: 0, results: [] };
  G.screen = 'catch';
  G.glowT = 0;                // the lamp starts dark and comes up, every time
  updateBottomBar();
  renderCatchBar();
  updateCatchGlow();
  updateFooter();
  const intro = bite.category === 'fish' ? "Something's on the line!" : "Something's tugging on your line.";
  speak(`${intro} Follow the light at your own pace, no rush. ${stepPrompt(0)}`);
}

function catchPress(color) {
  if (G.screen !== 'catch' || !G.catch) return;
  const i = G.catch.stepIndex;
  const expected = G.catch.sequence[i];
  const correct = (color === expected);
  if (correct) G.catch.correctCount++;
  G.catch.results.push(correct);
  G.catch.stepIndex++;
  sfx(correct ? 'select' : 'hover', .5);
  renderCatchBar();
  if (G.catch.stepIndex >= G.catch.sequence.length) {
    resolveCatch();
  } else {
    speak(`${correct ? 'Good.' : 'Missed one — keep going.'} ${stepPrompt(G.catch.stepIndex)}`);
  }
}

function bucketFor(quality) {
  return QUALITY_BUCKETS.find(b => quality >= b.min && quality <= b.max) || QUALITY_BUCKETS[QUALITY_BUCKETS.length - 1];
}
function rollFishCatch(speciesId, quality) {
  const f = fishById(speciesId);
  const b = bucketFor(quality);
  const p = b.pMin + Math.random() * (b.pMax - b.pMin);
  const length = round1(f.lengthRange[0] + p * (f.lengthRange[1] - f.lengthRange[0]));
  const weight = round1(f.weightRange[0] + p * (f.weightRange[1] - f.weightRange[0]));
  const value = Math.max(0, Math.round(weight * f.baseValuePerWeight));
  return { type: 'fish', id: f.id, name: f.name, length, weight, value, qualityLabel: b.label, secret: !!f.secret };
}
function rollJunkItem() {
  const item = D.ITEM_TABLE.junk[Math.floor(Math.random() * D.ITEM_TABLE.junk.length)];
  return { type: 'junk', id: item.id, name: item.name, value: 0 };
}
function rollValuableItem() {
  const item = D.ITEM_TABLE.valuable[Math.floor(Math.random() * D.ITEM_TABLE.valuable.length)];
  return { type: 'valuable', id: item.id, name: item.name, value: item.value };
}

function resolveCatch() {
  const c = G.catch;
  const quality = Math.round(100 * c.correctCount / c.sequence.length);
  let outcome;
  if (c.category === 'fish') {
    if (quality < CFG.MIN_QUALITY_FOR_FISH) {
      outcome = rollJunkItem();
      outcome.demoted = true;
      outcome.demotedFrom = fishById(c.speciesId).name;
    } else {
      outcome = rollFishCatch(c.speciesId, quality);
    }
  } else if (c.category === 'valuable') {
    outcome = rollValuableItem();
  } else {
    outcome = rollJunkItem();
  }
  G.catch = null;
  applyOutcome(outcome, quality);
}

function speakCatchResult(outcome, quality) {
  if (outcome.demoted) {
    speak(`The ${outcome.demotedFrom} got away — a ${outcome.name} came up instead. Quality was too low that time.`);
  } else if (outcome.type === 'fish') {
    speak(`Caught a ${outcome.name}! ${outcome.length} inches, ${outcome.weight} pounds. ${outcome.qualityLabel} catch, worth ${outcome.value} dollars.`);
  } else if (outcome.type === 'valuable') {
    speak(`Reeled in a ${outcome.name}, worth ${outcome.value} dollars.`);
  } else {
    speak(`Just a ${outcome.name}. Not worth anything, but fun to keep.`);
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   OBJECTIVES + LAKE PROGRESSION
   ══════════════════════════════════════════════════════════════════════════ */
function applyLakeUnlocks(template) {
  const u = template.unlocks;
  u.speciesIds.forEach(id => { if (!save.unlockedSpecies.includes(id)) save.unlockedSpecies.push(id); });
  u.baitIds.forEach(id => { if (!save.unlockedBait.includes(id)) save.unlockedBait.push(id); });
  u.rodIds.forEach(id => { if (!save.unlockedRods.includes(id)) save.unlockedRods.push(id); });
  if (u.nextLakeId && !save.unlockedLakes.includes(u.nextLakeId)) save.unlockedLakes.push(u.nextLakeId);
}

function updateObjectives(outcome) {
  const lakeId = save.currentLakeId;
  const progress = save.lakeProgress[lakeId];
  if (!progress || progress.completed) return { completed: false };
  const template = lakeTemplateById(lakeId);
  const objectives = lakeObjectives(lakeId);

  objectives.forEach((obj, i) => {
    const p = progress.objectives[i];
    if (obj.type === 'catchCount') {
      if (!obj.speciesId || outcome.id === obj.speciesId) p.current = Math.min(obj.amount, p.current + 1);
    } else if (obj.type === 'catchWeight') {
      if (!obj.speciesId || outcome.id === obj.speciesId) p.current = Math.min(obj.amount, round1(p.current + outcome.weight));
    } else if (obj.type === 'catchLength') {
      if (outcome.id === obj.speciesId && outcome.length >= obj.amount) p.current = obj.amount;
    }
  });

  const allDone = objectives.length > 0 &&
                  objectives.every((obj, i) => progress.objectives[i].current >= obj.amount);
  if (allDone) {
    progress.completed = true;
    applyLakeUnlocks(template);
    return { completed: true, lakeId, template };
  }
  return { completed: false };
}

function applyOutcome(outcome, quality) {
  save.creel.push(Object.assign({}, outcome));
  const dingusFirstCatch = (outcome.type === 'fish' && outcome.id === 'largemouth_dingus' && !save.sawDingusReveal);
  if (dingusFirstCatch) save.sawDingusReveal = true;

  let lakeInfo = { completed: false };
  if (outcome.type === 'fish' && !outcome.secret) lakeInfo = updateObjectives(outcome);

  saveProgress();
  speakCatchResult(outcome, quality);
  updateHud();

  const queue = [];
  if (dingusFirstCatch) queue.push({ which: 'dingusreveal' });
  if (lakeInfo.completed) queue.push({ which: 'lakecomplete', data: lakeInfo });
  G.postCatchQueue = queue;
  advancePostCatchQueue();
}

function advancePostCatchQueue() {
  const next = (G.postCatchQueue || []).shift();
  if (next) { openOverlay(next.which, next.data); return; }
  enterCast(false);
}

/* ══════════════════════════════════════════════════════════════════════════
   RENDERING
   ══════════════════════════════════════════════════════════════════════════ */
function fitCanvas() {
  const wrap = $('cvWrap');
  const scale = Math.min(wrap.clientWidth / CFG.W, wrap.clientHeight / CFG.H);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.style.width = Math.floor(CFG.W * scale) + 'px';
  cv.style.height = Math.floor(CFG.H * scale) + 'px';
  cv.width = Math.floor(CFG.W * scale * dpr);
  cv.height = Math.floor(CFG.H * scale * dpr);
  ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
}

function drawWedge(cx, cy, rInner, rOuter, aStart, aEnd, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  if (rInner <= 0.01) ctx.moveTo(cx, cy);
  else ctx.moveTo(cx + rInner * Math.cos(aStart), cy + rInner * Math.sin(aStart));
  ctx.arc(cx, cy, rOuter, aStart, aEnd);
  if (rInner <= 0.01) ctx.lineTo(cx, cy);
  else ctx.arc(cx, cy, rInner, aEnd, aStart, true);
  ctx.closePath();
  ctx.fill();
}

function drawLake() {
  const bmp = lakeBitmap();
  if (bmp) { ctx.drawImage(bmp, 0, 0, CFG.W, CFG.H); return; }

  // Fallback only: the flat wedge lake this game shipped with, kept so a
  // missing art.js is a downgrade rather than a blank screen.
  const grad = ctx.createRadialGradient(CFG.BOAT_X, CFG.BOAT_Y, 10, CFG.BOAT_X, CFG.BOAT_Y, CFG.LAKE_MAX_R * 1.15);
  grad.addColorStop(0, css('--water-near'));
  grad.addColorStop(1, css('--water-far'));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CFG.W, CFG.H);

  if (!G.LAKE) return;
  const sectors = G.LAKE.sectors;
  const step = LG.ARC_DEG / (sectors.length - 1);
  const half = step / 2;

  sectors.forEach(s => {
    const aStart = (s.bearing - half - 90) * Math.PI / 180;
    const aEnd = (s.bearing + half - 90) * Math.PI / 180;
    let rPrev = 0;
    LG.BANDS.forEach(band => {
      const rOuter = CFG.LAKE_MAX_R * LG.BAND_FRAC[band] * s.radiusMul;
      const biome = D.BIOMES[s.biomesByBand[band]];
      drawWedge(CFG.BOAT_X, CFG.BOAT_Y, rPrev, rOuter, aStart, aEnd, css(biome.cssVar));
      rPrev = rOuter;
    });
  });

  ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 2;
  sectors.forEach(s => {
    const a = (s.bearing - half - 90) * Math.PI / 180;
    const rOuter = CFG.LAKE_MAX_R * s.radiusMul;
    ctx.beginPath();
    ctx.moveTo(CFG.BOAT_X, CFG.BOAT_Y);
    ctx.lineTo(CFG.BOAT_X + rOuter * Math.cos(a), CFG.BOAT_Y + rOuter * Math.sin(a));
    ctx.stroke();
  });
}

function drawBoat() {
  if (A) {
    const aim = G.preview ? G.preview.point : (G.lastLanding ? G.lastLanding.point : null);
    G.rodTip = A.paintBoat(ctx, css, GEOM, { flat: artFlat(), aim });
    return;
  }
  G.rodTip = null;
  ctx.save();
  ctx.translate(CFG.BOAT_X, CFG.BOAT_Y);
  ctx.fillStyle = css('--boat');
  ctx.beginPath();
  ctx.moveTo(-34, 20); ctx.lineTo(34, 20); ctx.lineTo(24, -6); ctx.lineTo(-24, -6);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = css('--panel2');
  ctx.fillRect(-10, -16, 20, 12);
  ctx.restore();
}

/* How far the rod in hand can throw, drawn as one dashed line curving across
   the pond. Water beyond it is water this rod cannot fish — the visible half of
   what a rod upgrade buys, and the reason a direction can be worth choosing.

   Walked in small bearing steps through art.js's project() rather than drawn as
   a canvas arc: the pond is in a squashed perspective, so a true circle would
   sit off the water it is supposed to describe. Interpolating radiusMul between
   sector centres (as the painted bank does) also keeps this a smooth curve
   instead of five disconnected arcs. */
function drawReachLimit() {
  if (!G.LAKE) return;
  const half = LG.ARC_DEG / 2;
  const reach = rod().reachFrac;
  const pts = [];
  for (let b = -half; b <= half + 0.001; b += 2) {
    const water = A ? A.waterRadius(G.LAKE, b, GEOM) / CFG.LAKE_MAX_R : LG.radiusMulAt(G.LAKE, b);
    if (reach >= water - 0.005) { pts.push(null); continue; }   // rod outreaches the pond here
    const r = CFG.LAKE_MAX_R * reach;
    pts.push(A ? A.project(b, r, GEOM)
               : { x: CFG.BOAT_X + r * Math.cos((b - 90) * Math.PI / 180),
                   y: CFG.BOAT_Y + r * Math.sin((b - 90) * Math.PI / 180) });
  }
  ctx.save();
  // Kept deliberately faint. The pond art dropped the hard sector dividers on
  // purpose, and a bright fence across a painted lake would put that clutter
  // straight back; this only has to read as "past here is out of reach", and
  // the meter's own band marks carry the same fact more precisely.
  ctx.setLineDash([8, 14]);
  ctx.strokeStyle = css('--bad');
  ctx.globalAlpha = .38;
  ctx.lineWidth = 2.5;
  let drawing = false;
  pts.forEach(p => {
    if (!p) { if (drawing) { ctx.stroke(); drawing = false; } return; }
    if (!drawing) { ctx.beginPath(); ctx.moveTo(p.x, p.y); drawing = true; }
    else ctx.lineTo(p.x, p.y);
  });
  if (drawing) ctx.stroke();
  ctx.restore();
}

function rodOrigin() { return G.rodTip || { x: CFG.BOAT_X, y: CFG.BOAT_Y }; }

function drawPreview() {
  if (!G.preview) return;
  const p = G.preview.point;
  if (A) {
    A.paintCastLine(ctx, rodOrigin(), p, css);
    A.paintBobber(ctx, p.x, p.y, css, { flat: artFlat() });
    return;
  }
  ctx.save();
  ctx.setLineDash([6, 8]);
  ctx.strokeStyle = css('--focus'); ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(CFG.BOAT_X, CFG.BOAT_Y);
  ctx.lineTo(p.x, p.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
  ctx.strokeStyle = css('--focus'); ctx.lineWidth = 3; ctx.stroke();
  ctx.restore();
}

function drawRipple() {
  if (!G.lastLanding) return;
  const p = G.lastLanding.point;
  const t = G.bitingTimer || 0;
  if (A) {
    A.paintCastLine(ctx, rodOrigin(), p, css);
    A.paintBobber(ctx, p.x, p.y, css, { flat: artFlat() });
    // Reduced motion gets still rings instead of expanding ones. Nothing is
    // lost: a bite is always spoken and printed as well as drawn.
    A.paintRipples(ctx, p.x, p.y, t, css, { still: reducedMotion() });
    return;
  }
  ctx.save();
  ctx.strokeStyle = css('--accent2');
  for (let k = 0; k < 3; k++) {
    const rr = 6 + (t * 180 + k * 18) % 70;
    ctx.globalAlpha = Math.max(0, 1 - rr / 70);
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(p.x, p.y, rr, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}

function draw() {
  ctx.clearRect(0, 0, CFG.W, CFG.H);
  drawLake();
  if (A && G.LAKE && !artFlat() && !reducedMotion()) A.paintSurface(ctx, G.LAKE, G.animTime, css, GEOM);
  // The aim highlight replaces the old hard sector dividers: one patch of
  // water lit up rather than the whole pond permanently sliced. The biome is
  // still spoken by announceFocus() and printed on the cast chip, so this is
  // a visual aid, never the only channel.
  if (A && G.LAKE && G.screen === 'cast' && G.preview) {
    A.paintFocusCell(ctx, G.LAKE, G.preview.sector.index, G.preview.band, css, GEOM, { flat: artFlat() });
  }
  if (G.screen === 'cast') drawReachLimit();
  drawBoat();
  if (G.screen === 'cast') drawPreview();
  if (G.screen === 'biting' || G.screen === 'catch') drawRipple();
}

function drawError(err) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.fillStyle = '#ff5470'; ctx.font = '16px monospace';
  ctx.fillText('Something went wrong: ' + (err && err.message), 20, 40);
}

/* ══════════════════════════════════════════════════════════════════════════
   BOTTOM BAR (casting lanes / biting message / catch sequence)
   ══════════════════════════════════════════════════════════════════════════ */
function updateBottomBar() {
  $('castLanes').hidden = G.screen !== 'cast';
  $('catchBar').hidden = G.screen !== 'catch';
  $('bitingBar').hidden = G.screen !== 'biting';
}

function renderBitingBar() {
  const biome = G.lastLanding ? D.BIOMES[G.lastLanding.biomeId].name : '';
  $('bitingMsg').textContent = `Casting toward ${biome}... (press Space or Return to skip ahead)`;
}

/* ══════════════════════════════════════════════════════════════════════════
   THE CATCH LIGHT
   The row of squares in the bottom bar is a RECORD — what has been pressed and
   how it went. This is the INSTRUCTION, and it is the size of half the window
   because the squares were not: a whole side of the screen fades up and back
   down like a lamp on a dimmer. Blue on the left means Return, red on the
   right means Space, and which side it is on is the part that says which way
   to turn your head.

   It is a cue and nothing more. There is no clock behind it, the step waits
   however long it waits, and the brightness carries no meaning — a dim moment
   is not a closing window. The cycle is CFG.GLOW_PERIOD_S seconds, far slower
   than anything that could read as a flash, and prefers-reduced-motion holds
   it steady instead. Phase advances from the frame loop's dt, so opening the
   pause menu stops it dead rather than letting it run on behind the panel.
   ══════════════════════════════════════════════════════════════════════════ */
function updateCatchGlow() {
  const on = G.screen === 'catch' && !!G.catch;
  glow.root.classList.toggle('on', on);
  if (!on) {
    glow.left.classList.remove('active');
    glow.right.classList.remove('active');
    return;
  }
  const expected = G.catch.sequence[G.catch.stepIndex];
  // Cosine so it eases at both ends — a lamp coming up and going back down,
  // with no hard edge anywhere in the cycle.
  const breath = 0.5 - 0.5 * Math.cos(2 * Math.PI * (G.glowT / CFG.GLOW_PERIOD_S));
  const a = CFG.GLOW_MIN + (CFG.GLOW_MAX - CFG.GLOW_MIN) * (reducedMotion() ? 0.75 : breath);

  const isRed = expected === 'red';
  glow.washLeft.style.opacity  = isRed ? '0' : a.toFixed(3);
  glow.washRight.style.opacity = isRed ? a.toFixed(3) : '0';
  glow.left.classList.toggle('active', !isRed);
  glow.right.classList.toggle('active', isRed);
}

function renderCatchBar() {
  if (!G.catch) return;
  $('catchTitle').textContent = G.catch.category === 'fish' ? "Something's on the line!" : 'Reeling something in...';
  const holder = $('catchSteps');
  holder.innerHTML = '';
  G.catch.sequence.forEach((color, i) => {
    const div = document.createElement('div');
    const state = i < G.catch.stepIndex ? (G.catch.results[i] ? 'correct' : 'wrong')
                : i === G.catch.stepIndex ? 'current' : 'pending';
    div.className = `seqstep ${color} ${state}`;
    div.textContent = color === 'red' ? 'R' : 'B';
    holder.appendChild(div);
  });
}

/* ══════════════════════════════════════════════════════════════════════════
   HUD + FOOTER
   ══════════════════════════════════════════════════════════════════════════ */
function updateHud() {
  $('pLake').textContent = G.lakeId ? lakeTemplateById(G.lakeId).name : '';
  $('pMoney').innerHTML = `Money <b>$${save.money}</b>`;
  $('pObjective').textContent = G.lakeId ? objectivesShortText(G.lakeId) : '';
  $('pGear').textContent = `${rod().name} · ${equippedBait().name}`;
}

function updateFooter() {
  const modeEl = $('ftrMode'), tgtEl = $('ftrTarget');
  if (G.screen === 'overlay') {
    modeEl.textContent = overlayTitle(G.overlay);
    const items = menuItems();
    tgtEl.textContent = (G.menuIx === -1 || !items[G.menuIx]) ? '—' : itemText(items[G.menuIx]);
  } else if (G.screen === 'cast' && G.stage === 'power') {
    modeEl.textContent = G.charging ? 'Charging the cast' : 'Set the power';
    const l = computeLanding();
    tgtEl.textContent = `${Math.round(G.powerPct)}% · ${LG.BAND_LABEL[l.band]} · ${D.BIOMES[l.biomeId].name}`;
  } else if (G.screen === 'cast') {
    modeEl.textContent = 'Choose direction';
    const it = G.scan === -1 ? null : laneItems()[G.scan];
    tgtEl.textContent = it ? it.label : '—';
  } else if (G.screen === 'biting') {
    modeEl.textContent = 'Casting...';
    tgtEl.textContent = '';
  } else if (G.screen === 'catch') {
    modeEl.textContent = 'Reeling it in';
    tgtEl.textContent = G.catch ? `Step ${G.catch.stepIndex + 1} of ${G.catch.sequence.length}` : '';
  } else {
    modeEl.textContent = 'Menu';
    tgtEl.textContent = '';
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   OVERLAY MENUS
   ══════════════════════════════════════════════════════════════════════════ */
const THEMES = [
  { id: 'ben',      name: 'Ben Default' },
  { id: 'dark',     name: 'Dark' },
  { id: 'light',    name: 'Light' },
  { id: 'contrast', name: 'High Contrast' }
];

let overlayData = {};
let resetArmed = false;

function secretBaitRow() {
  const bait = D.BAIT.find(b => b.id === 'secret_t_pill');
  const owned = save.ownedBait[bait.id] || 0;
  return {
    text: () => bait.name,
    val: () => `Owned ${owned} · Buy $${bait.costPerUnit}`,
    say: () => `${bait.name}. Smells like fish, mostly. You have ${owned}. Buy one for ${bait.costPerUnit} dollars.`,
    act: () => {
      if (save.money < bait.costPerUnit) { speak('Not enough money for that yet.'); return; }
      save.money -= bait.costPerUnit;
      save.ownedBait[bait.id] = (save.ownedBait[bait.id] || 0) + 1;
      saveProgress();
      speak('Purchased. Better equip it and see what bites.');
    }
  };
}

const MENUS = {
  main: () => [
    { text: () => 'Go Fishing', say: () => `Go fishing at ${lakeTemplateById(save.currentLakeId).name}.`,
      act: () => { hideOverlay(); enterLake(save.currentLakeId); } },
    { text: () => 'Choose a Lake', act: () => openOverlay('lakes') },
    { text: () => 'Bait & Tackle Shop', act: () => openOverlay('shop') },
    { text: () => 'Creel (Sell Catch)', val: () => `${save.creel.length} items`, act: () => openOverlay('creel') },
    { text: () => 'Fish Finder', act: () => openOverlay('fishfinder') },
    { text: () => 'How to Play', act: () => openOverlay('help') },
    { text: () => 'Settings', act: () => openOverlay('settings') },
    { text: () => 'Exit to Hub', act: () => exitToHub() }
  ],

  lakes: () => D.LAKE_TEMPLATES.map(t => {
    const unlocked = save.unlockedLakes.includes(t.id);
    const progress = save.lakeProgress[t.id];
    const status = !unlocked ? 'Locked' : (progress && progress.completed ? 'Cleared' : 'In progress');
    return {
      text: () => t.name,
      val: () => status,
      dis: !unlocked,
      say: () => `${t.name}. ${unlocked ? status : 'Still locked.'}`,
      act: () => {
        if (!unlocked) { speak("That lake is still locked. Clear the current lake's objectives first."); return; }
        hideOverlay(); enterLake(t.id);
      }
    };
  }).concat([{ text: () => 'Back', act: () => closeOverlay() }]),

  shop: () => {
    const rows = [{ text: () => `Change Bait — currently ${equippedBait().name}`, act: () => openOverlay('equipbait') }];
    D.BAIT.forEach(bait => {
      if (bait.secret) { rows.push(secretBaitRow()); return; }
      if (bait.free || !save.unlockedBait.includes(bait.id)) return;
      const owned = save.ownedBait[bait.id] || 0;
      rows.push({
        text: () => bait.name,
        val: () => `Owned ${owned} · Buy $${bait.costPerUnit}`,
        say: () => `${bait.name}. You have ${owned}. Buy one for ${bait.costPerUnit} dollars.`,
        act: () => {
          if (save.money < bait.costPerUnit) { speak('Not enough money for that.'); return; }
          save.money -= bait.costPerUnit;
          save.ownedBait[bait.id] = (save.ownedBait[bait.id] || 0) + 1;
          saveProgress();
          speak(`Bought one ${bait.name}.`);
        }
      });
    });
    D.RODS.forEach(r => {
      const owned = save.ownedRods.includes(r.id);
      const unlocked = save.unlockedRods.includes(r.id);
      const equipped = save.equippedRodId === r.id;
      if (!unlocked) {
        rows.push({ text: () => `${r.name} (Locked)`, dis: true,
          say: () => `${r.name}. Still locked. Clear more lake objectives to unlock it.`,
          act: () => speak('That rod is still locked. Clear more lake objectives to unlock it.') });
        return;
      }
      if (owned) {
        rows.push({
          text: () => `${r.name}${equipped ? ' (Equipped)' : ''}`,
          val: () => equipped ? 'Equipped' : 'Equip', dis: equipped,
          say: () => `${r.name}. ${r.reachNote} ${equipped ? 'Already equipped.' : 'Select to equip.'}`,
          act: () => { if (equipped) return; save.equippedRodId = r.id; saveProgress(); updateHud(); speak(`${r.name} equipped. ${r.reachNote}`); }
        });
      } else {
        rows.push({
          text: () => r.name, val: () => `$${r.cost}`,
          say: () => `${r.name}. ${r.reachNote} Costs ${r.cost} dollars.`,
          act: () => {
            if (save.money < r.cost) { speak('Not enough money for that rod.'); return; }
            save.money -= r.cost;
            save.ownedRods.push(r.id);
            save.equippedRodId = r.id;
            saveProgress();
            updateHud();
            speak(`${r.name} purchased and equipped. ${r.reachNote}`);
          }
        });
      }
    });
    rows.push({ text: () => 'Creel (Sell Catch)', act: () => openOverlay('creel') });
    rows.push({ text: () => 'Back', act: () => closeOverlay() });
    return rows;
  },

  equipbait: () => {
    /* Reached from the pause menu, equipping is the whole errand, so it hands
       the player straight back to the water instead of making them walk back
       out through the menus they came in by. Reached from the shop it stays put,
       because there they are probably buying and equipping several things. */
    const equip = b => {
      save.equippedBaitId = b.id;
      saveProgress();
      updateHud();
      if (overlayData.resumeAfter) {
        G.menuStack = [];
        closeOverlay();
        // Spoken after the close, not before: closeOverlay says its own
        // "resumed" line, and the last thing said is the thing that gets heard.
        speak(`${b.name} on the line. ${stageHint()}`);
        return;
      }
      speak(`${b.name} equipped.`);
    };

    const rows = D.BAIT.filter(b => !b.secret && save.unlockedBait.includes(b.id)).map(b => {
      const owned = b.free ? Infinity : (save.ownedBait[b.id] || 0);
      const equipped = save.equippedBaitId === b.id;
      const canEquip = b.free || owned > 0;
      return {
        text: () => `${b.name}${equipped ? ' (Equipped)' : ''}`,
        val: () => canEquip ? (equipped ? 'Equipped' : 'Equip') : 'None owned',
        dis: equipped || !canEquip,
        say: () => equipped ? `${b.name}. Already equipped.` : (canEquip ? `${b.name}. Select to equip.` : `${b.name}. You have none — buy some first.`),
        act: () => { if (equipped || !canEquip) return; equip(b); }
      };
    });
    if ((save.ownedBait['secret_t_pill'] || 0) > 0) {
      const b = D.BAIT.find(x => x.id === 'secret_t_pill');
      const equipped = save.equippedBaitId === b.id;
      rows.push({
        text: () => `${b.name}${equipped ? ' (Equipped)' : ''}`,
        val: () => equipped ? 'Equipped' : 'Equip', dis: equipped,
        say: () => equipped ? `${b.name}. Already equipped.` : `${b.name}. Select to equip.`,
        act: () => { if (equipped) return; equip(b); }
      });
    }
    rows.push({ text: () => 'Back', act: () => closeOverlay() });
    return rows;
  },

  creel: () => {
    const rows = save.creel.map((item, i) => ({
      text: () => `${item.name}${item.type === 'fish' ? ` (${item.length} in, ${item.weight} lb)` : ''}`,
      val: () => item.value > 0 ? `$${item.value}` : 'Worthless',
      dis: item.value <= 0,
      say: () => item.value > 0 ? `${item.name}. Worth ${item.value} dollars.` : `${item.name}. Worthless, but fun to keep.`,
      act: () => {
        if (item.value <= 0) { speak('Nothing to sell there.'); return; }
        save.money += item.value;
        save.creel.splice(i, 1);
        saveProgress();
        speak(`Sold for ${item.value} dollars.`);
        renderOverlay();
      }
    }));
    rows.push({
      text: () => 'Sell All', dis: !save.creel.some(it => it.value > 0),
      act: () => {
        const total = save.creel.reduce((s, it) => s + it.value, 0);
        save.money += total;
        save.creel = [];
        saveProgress();
        speak(`Sold everything for ${total} dollars.`);
        renderOverlay();
      }
    });
    rows.push({ text: () => 'Back', act: () => closeOverlay() });
    return rows;
  },

  /* The fish finder is where "out of reach" is said out loud. A lake is allowed
     to hold water the rod in hand cannot get to — that is what a rod upgrade is
     for — so the honest thing is to show it and label it, rather than hide it
     and let the player wonder why a fish never bites. (Objectives are a
     different matter: those are checked against what IS reachable before they
     are ever handed out. See objectiveFeasible.) */
  fishfinder: () => {
    const template = lakeTemplateById(G.lakeId || save.currentLakeId);
    const inReach = G.LAKE ? reachableBiomeIds(G.LAKE, rod()) : [];
    const seen = [];
    const rows = template.biomeIds.filter(id => {
      if (seen.indexOf(id) !== -1) return false;
      seen.push(id);
      return true;
    }).map(biomeId => {
      const reachable = inReach.indexOf(biomeId) !== -1;
      const line = () => `${biomeNarrationPhrase(biomeId)} ${reachable
        ? 'Your rod reaches it.'
        : 'Your rod cannot reach it yet — a longer one would.'}`;
      return {
        text: () => D.BIOMES[biomeId].name,
        val: () => reachable ? 'In reach' : 'Out of reach',
        say: line,
        act: () => speak(line())
      };
    });
    rows.push({ text: () => 'Back', act: () => closeOverlay() });
    return rows;
  },

  settings: () => [
    { text: () => 'Speech', val: () => ttsOn() ? 'On' : 'Off',
      act: () => { const v = vm(); if (v) v.toggleTTS(); speak(ttsOn() ? 'Speech on' : 'Speech off'); } },
    { text: () => 'Voice', val: () => voiceName(), say: () => 'Voice. ' + voiceName(),
      act: () => { const v = vm(); if (!v || !v.cycleVoice()) { speak('No other voices are available on this device.'); return; } speak('Voice: ' + voiceName()); } },
    { text: () => 'Sound Effects', val: () => settings.sound ? 'On' : 'Off',
      act: () => { settings.sound = !settings.sound; if (window.SafeAudio) SafeAudio.setEnabled(settings.sound); saveSettings(); speak('Sound ' + (settings.sound ? 'on' : 'off')); } },
    { text: () => 'Auto Scan', val: () => autoScanOn() ? 'On' : 'Off',
      act: () => { const m = sm(); if (m) m.toggleAutoScan(); speak('Auto scan ' + (autoScanOn() ? 'on' : 'off')); resetAutoScan(); } },
    { text: () => 'Scan Speed', val: () => (scanInterval() / 1000) + ' sec',
      act: () => { const m = sm(); if (m) m.cycleScanSpeed(); speak('Scan speed ' + (scanInterval() / 1000) + ' seconds'); resetAutoScan(); } },
    { text: () => 'Colour Profile', val: () => (THEMES.find(t => t.id === settings.theme) || THEMES[0]).name,
      act: () => cycleTheme(1) },
    { text: () => 'Text Size', val: () => settings.fontScale + '%',
      act: () => cycleFont(1) },
    { text: () => resetArmed ? 'Reset Progress — select again to confirm' : 'Reset Progress',
      val: () => resetArmed ? 'Are you sure?' : '',
      say: () => resetArmed ? 'Reset progress. Select again to confirm.' : 'Reset progress.',
      act: () => {
        if (!resetArmed) { resetArmed = true; speak('This erases all money, gear, and lake progress. Select it again to confirm, or scan past it to cancel.'); return; }
        resetArmed = false;
        save = defaultSave();
        saveProgress();
        hideOverlay();
        G.lakeId = save.currentLakeId;
        G.LAKE = LG.generateLake(lakeTemplateById(G.lakeId), ensureLakeProgress(G.lakeId).seed);
        G.pick = { direction: Math.floor(G.LAKE.sectors.length / 2) };
        G.screen = 'menu';
        openOverlay('main');
        speak('Progress reset.');
      } },
    { text: () => 'Back', act: () => closeOverlay() }
  ],

  /* Swap Bait sits second on purpose. Changing bait is the thing you want most
     often mid-trip and it used to cost four presses to reach through the shop —
     Resume, scan to Shop, into Shop, scan to Change Bait, in again — before you
     had even picked a bait. From here it is one scan step and a select, and
     equipping closes the whole stack straight back to the water rather than
     leaving you to walk back out through it (see `resumeAfter`). */
  pause: () => [
    { text: () => 'Resume', act: () => closeOverlay() },
    { text: () => `Swap Bait — currently ${equippedBait().name}`,
      say: () => `Swap bait. You have ${equippedBait().name} on the line.`,
      act: () => openOverlay('equipbait', { resumeAfter: true }) },
    { text: () => 'Bait & Tackle Shop', act: () => openOverlay('shop') },
    { text: () => 'Creel (Sell Catch)', act: () => openOverlay('creel') },
    { text: () => 'Fish Finder', act: () => openOverlay('fishfinder') },
    { text: () => 'Settings', act: () => openOverlay('settings') },
    { text: () => 'How to Play', act: () => openOverlay('help') },
    { text: () => 'Main Menu', act: () => toMainMenu() }
  ],

  lakecomplete: () => {
    const template = overlayData.template;
    const rows = [];
    if (template.unlocks.nextLakeId) {
      const nextName = lakeTemplateById(template.unlocks.nextLakeId).name;
      rows.push({ text: () => `Next Lake — ${nextName}`, act: () => { hideOverlay(); enterLake(template.unlocks.nextLakeId); } });
    } else {
      rows.push({ text: () => "You've cleared every lake!", act: () => {} });
    }
    rows.push({ text: () => 'Keep Fishing Here', act: () => { hideOverlay(); enterLake(template.id); } });
    rows.push({ text: () => 'Bait & Tackle Shop', act: () => openOverlay('shop') });
    rows.push({ text: () => 'Main Menu', act: () => toMainMenu() });
    return rows;
  },

  dingusreveal: () => [
    { text: () => 'Continue', act: () => { hideOverlay(); advancePostCatchQueue(); } }
  ],

  help: () => [{ text: () => 'Got it', act: () => closeOverlay() }]
};

function overlayTitle(which) {
  switch (which) {
    case 'main': return "Benny's FishMaster";
    case 'lakes': return 'Choose a Lake';
    case 'shop': return 'Bait & Tackle Shop';
    case 'equipbait': return 'Change Bait';
    case 'creel': return 'Your Creel';
    case 'fishfinder': return 'Fish Finder';
    case 'settings': return 'Settings';
    case 'pause': return 'Paused';
    case 'lakecomplete': return 'Lake Cleared!';
    case 'dingusreveal': return 'A Legend Surfaces';
    case 'help': return 'How to Play';
    default: return 'Menu';
  }
}

function overlaySub(which) {
  switch (which) {
    case 'main':
      return `Cast a line, work the catch at your own pace, and sell what you reel in for better gear. Nothing here is timed.<br>Money: <b>$${save.money}</b> · Lakes cleared: <b>${D.LAKE_TEMPLATES.filter(t => save.lakeProgress[t.id] && save.lakeProgress[t.id].completed).length}</b> of ${D.LAKE_TEMPLATES.length}`;
    case 'lakes': return 'Clear a lake’s objectives to unlock the next one.';
    case 'shop': return `Buy bait and rods with money earned from selling your catch. Money: <b>$${save.money}</b>`;
    case 'equipbait': return 'Pick which bait is currently on your line.';
    case 'creel': return 'Sell what you’ve caught. Junk is worth nothing but you can still admire it.';
    case 'fishfinder': return 'See which fish live in each part of this lake.';
    case 'lakecomplete': {
      const t = overlayData.template;
      let s = `You’ve completed every objective at ${t.name}.`;
      const u = t.unlocks;
      if (u.speciesIds.length) s += `<br>New fish: ${u.speciesIds.map(id => fishById(id).name).join(', ')}.`;
      if (u.baitIds.length) s += `<br>New bait: ${u.baitIds.map(id => D.BAIT.find(b => b.id === id).name).join(', ')}.`;
      if (u.rodIds.length) s += `<br>New rod: ${u.rodIds.map(id => D.RODS.find(r => r.id === id).name).join(', ')}.`;
      return s;
    }
    case 'dingusreveal':
      return `<div style="text-align:center;padding:1rem 0;">
        <div style="font-size:3rem;">🐟</div>
        <b>Largemouth Dingus!</b><br>
        <span style="font-size:.85rem;color:var(--dim)">(photo of Ari coming soon)</span>
      </div>`;
    case 'help':
      return `<b>Two keys, that is all.</b><br>
        <kbd>Space</kbd> moves the highlight to the next choice.<br>
        <kbd>Space</kbd> held for 3 seconds scans by itself until you let go.<br>
        <kbd>Return</kbd> picks whatever is highlighted.<br>
        <kbd>Return</kbd> held for 1.5 seconds goes back one step, or opens this menu.<br><br>
        <b>Casting — direction, then power.</b> Scan the direction chips and press <kbd>Return</kbd> to lock one in. Then <b>hold <kbd>Space</kbd> to charge</b> the power meter and let go to stop it — letting go never throws the line, it only stops the meter, so you can stop, listen to where the cast would land, and hold again to add more. Press <kbd>Return</kbd> to cast. The meter stops dead at full: holding too long is never worse than letting go at the right moment, because there is no right moment. The dotted line and the meter both name the water you are about to land in the whole time.<br><br>
        <b>How far you can throw.</b> The dashed red arc is your rod's limit — water past it needs a longer rod. The marks on the power meter are where the water gets deeper, and the lake is shorter in some directions than others, so a direction can put deep water inside your reach that another one doesn't.<br><br>
        <b>Landing it.</b> When something bites, a side of the screen glows and fades like a lamp: <b>blue on the left means <kbd>Return</kbd></b>, <b>red on the right means <kbd>Space</kbd></b>. There is no clock — the light waits as long as you need, and how bright it happens to be means nothing. Missing a step just lowers the catch's quality; a very low score means junk comes up instead of the fish.<br><br>
        <b>Selling &amp; gear.</b> Sell your catch in the Creel, then spend the money on bait (shifts the odds toward certain fish) and rods (reach deeper water, permanently). <b>Swap Bait</b> is on the pause menu so you don't have to walk through the shop for it.`;
    default: return '';
  }
}

function overlaySpeech(which) {
  switch (which) {
    case 'main':
      return "Benny's FishMaster. Cast a line, work the catch at your own pace, and sell what you reel in for better gear. Nothing here is timed. "
           + `You have ${save.money} dollars.`;
    case 'lakes': return "Choose a lake. Clear a lake's objectives to unlock the next one.";
    case 'shop': return `Bait and tackle shop. You have ${save.money} dollars.`;
    case 'equipbait': return 'Change bait. Pick which bait is currently on your line.';
    case 'creel': return "Your creel. Sell what you've caught.";
    case 'fishfinder': return 'Fish finder. Pick a part of the lake to hear what lives there.';
    case 'settings': return 'Settings.';
    case 'pause': return 'Paused.';
    case 'lakecomplete': {
      const t = overlayData.template;
      let s = `Lake cleared! You've completed every objective at ${t.name}.`;
      const u = t.unlocks;
      if (u.speciesIds.length) s += ` New fish unlocked: ${u.speciesIds.map(id => fishById(id).name).join(', ')}.`;
      if (u.baitIds.length) s += ` New bait unlocked: ${u.baitIds.map(id => D.BAIT.find(b => b.id === id).name).join(', ')}.`;
      if (u.rodIds.length) s += ` New rod unlocked: ${u.rodIds.map(id => D.RODS.find(r => r.id === id).name).join(', ')}.`;
      return s;
    }
    case 'dingusreveal': return 'A legend surfaces. Largemouth Dingus! A photo of Ari is coming soon.';
    case 'help':
      return 'How to play. Two keys, that is all. A short press of space moves the highlight to the next choice. '
           + 'Holding space for three seconds scans by itself until you let go. A short press of return picks whatever is highlighted. '
           + 'Holding return for one and a half seconds goes back one step, or opens the menu. '
           + 'To cast, scan the directions and press return to lock one in. Then hold space to charge the power meter and let go to stop it. '
           + 'Letting go never throws the line; it only stops the meter, so you can stop, hear where the cast would land, and hold again to add more. '
           + 'Press return to cast. The meter stops at full and stays there, so holding too long is never worse than letting go at the right moment. '
           + 'A longer rod throws further and reaches deeper water, and the lake is shorter in some directions than others, so direction matters too. '
           + 'When something bites, one side of the screen glows and fades like a lamp. Blue on the left means press return. Red on the right means press space. '
           + 'There is no clock, the light waits as long as you need, and how bright it is means nothing. '
           + "Missing a step only lowers the catch's quality; a very low score means junk comes up instead of the fish. "
           + 'Sell your catch in the creel, then spend the money on bait and rods. Swap bait is on the pause menu, so you do not have to go through the shop for it.';
    default: return '';
  }
}

function menuItems() { return (MENUS[G.overlay] || MENUS.main)(); }
function itemText(it) { return typeof it.text === 'function' ? it.text() : it.text; }
function itemVal(it) { return it.val ? (typeof it.val === 'function' ? it.val() : it.val) : ''; }
function itemSpeech(it) {
  if (it.say) return typeof it.say === 'function' ? it.say() : it.say;
  const v = itemVal(it);
  return itemText(it) + (v ? '. ' + v : '');
}

function hideOverlay() {
  $('overlay').classList.remove('on');
  G.menuStack = [];
  overlayData = {};
  G.overlay = null;
  G.resumeScreen = null;
  stopAutoScan();
}

function openOverlay(which, data) {
  if (G.screen !== 'overlay') {
    G.menuStack = [];
    G.resumeScreen = ['cast', 'biting', 'catch'].indexOf(G.screen) !== -1 ? G.screen : null;
  } else {
    G.menuStack.push({ which: G.overlay, ix: G.menuIx, data: overlayData });
  }
  overlayData = data || {};
  resetArmed = false;
  G.overlay = which;
  G.screen = 'overlay';
  G.menuIx = -1;
  stopAutoScan();
  renderOverlay();
  updateFooter();
  sfx('select', .5);
  speak(`${overlaySpeech(which)} Press space to scan.`);
}

function closeOverlay() {
  const prev = G.menuStack.pop();
  if (prev) {
    overlayData = prev.data || {};
    G.overlay = prev.which;
    G.menuIx = prev.ix;
    renderOverlay(); updateFooter();
    const it = menuItems()[G.menuIx];
    speak(`${overlayTitle(prev.which)}. ${it ? itemSpeech(it) : ''}`);
    return;
  }
  $('overlay').classList.remove('on');
  overlayData = {};
  G.overlay = null;
  stopAutoScan();

  const back = G.resumeScreen;
  G.resumeScreen = null;

  if (back === 'biting') {
    resolveBiting();
  } else if (back === 'catch') {
    G.screen = 'catch';
    updateBottomBar();
    renderCatchBar(); updateFooter();
    speak(`Resumed. ${G.catch ? stepPrompt(G.catch.stepIndex) : ''}`);
  } else if (back === 'cast') {
    G.screen = 'cast';
    updateBottomBar();
    // `keep` on purpose: coming back from the pause menu must not wipe the
    // charge the player had already built, or the highlight they had scanned to.
    beginStage(G.stage, { keep: true });
    speak(`Resumed. ${stageHint()}`);
  } else {
    G.screen = 'menu';
    openOverlay('main');
  }
}

function renderOverlay() {
  $('overlay').classList.add('on');
  $('panelTitle').textContent = overlayTitle(G.overlay);
  $('panelSub').innerHTML = overlaySub(G.overlay);

  const list = $('panelList');
  list.innerHTML = '';
  menuItems().forEach((it, i) => {
    const b = document.createElement('button');
    b.className = 'mi' + (i === G.menuIx ? ' focus' : '') + (it.dis ? ' dim' : '');
    b.type = 'button';
    const v = itemVal(it);
    b.innerHTML = `<span>${itemText(it)}</span>` + (v ? `<span class="mval">${v}</span>` : '');
    b.addEventListener('click', () => { G.menuIx = i; menuSelect(); });
    list.appendChild(b);
  });

  $('panelNote').innerHTML = G.overlay === 'help' ? '' : `<b>Space</b> next · <b>Return</b> select · <b>Return hold</b> back`;
}

function menuStep(dir) {
  const items = menuItems();
  const n = items.length;
  let v = (G.menuIx === -1) ? n : G.menuIx;
  v = (v + dir + (n + 1)) % (n + 1);
  G.menuIx = (v === n) ? -1 : v;

  if (resetArmed) resetArmed = false;

  renderOverlay(); updateFooter();
  if (G.menuIx === -1) { sfx('hover', .25); return; }
  sfx('hover', .5);
  const it = menuItems()[G.menuIx];
  if (!it) return;
  speak(itemSpeech(it));
}

function menuSelect() {
  if (G.menuIx === -1) { speak('Nothing highlighted. Press space to keep scanning.'); return; }
  const it = menuItems()[G.menuIx];
  if (!it) return;
  sfx('select', .6);

  const before = G.overlay;
  it.act();

  if (G.screen === 'overlay' && G.overlay === before) {
    renderOverlay();
    updateFooter();
  }
}

function toMainMenu() {
  hideOverlay();
  G.postCatchQueue = [];
  G.screen = 'menu';
  openOverlay('main');
}

function cycleTheme(d) {
  let i = THEMES.findIndex(t => t.id === settings.theme);
  i = (i + d + THEMES.length) % THEMES.length;
  settings.theme = THEMES[i].id;
  applyTheme(); saveSettings(); renderOverlay();
  speak('Colours: ' + THEMES[i].name);
}
function cycleFont(d) {
  const steps = [100, 125, 150, 175, 200];
  let i = steps.indexOf(settings.fontScale);
  if (i === -1) i = 0;
  i = (i + d + steps.length) % steps.length;
  settings.fontScale = steps[i];
  applyTheme(); saveSettings(); renderOverlay();
  speak('Text size ' + settings.fontScale + ' percent');
}
function applyTheme() {
  document.body.dataset.theme = settings.theme;
  document.documentElement.style.setProperty('--fs', settings.fontScale + '%');
  refreshPalette();
  requestAnimationFrame(fitCanvas);
}

function exitToHub() {
  speak('Exiting to the hub');
  setTimeout(() => {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ action: 'focusBackButton' }, '*');
    } else {
      window.location.href = '../../../index.html';
    }
  }, 450);
}

/* ══════════════════════════════════════════════════════════════════════════
   INPUT
   ══════════════════════════════════════════════════════════════════════════ */
/* A scan list is anywhere Space steps and Space-held walks backwards. The power
   meter is not one of those: there Space IS the charge, so backward scanning is
   scoped out of it the way the reference games scope theirs (AGENTS.md, "The
   backward-scan conflict"). Everywhere the player is picking from a list, the
   3-second backward hold still works exactly as it does hub-wide. */
function inScanList() {
  return G.screen === 'overlay' || (G.screen === 'cast' && G.stage === 'direction');
}

function scanNext() {
  if (G.screen === 'overlay') menuStep(1);
  else if (G.screen === 'cast' && G.stage === 'direction') scanStep(1);
  else if (G.screen === 'biting') resolveBiting();
  else if (G.screen === 'catch') catchPress('red');
  resetAutoScan();
}
function scanPrev() {
  if (G.screen === 'overlay') menuStep(-1);
  else if (G.screen === 'cast' && G.stage === 'direction') scanStep(-1);
}
function selectCurrent() {
  if (G.screen === 'overlay') menuSelect();
  else if (G.screen === 'cast') commit();
  else if (G.screen === 'biting') resolveBiting();
  else if (G.screen === 'catch') catchPress('blue');
}

function startHoldScan() {
  const dir = CFG.SCAN_DIR_ON_HOLD;
  const step = () => (dir < 0 ? scanPrev() : scanNext());
  step();
  timers.spaceRepeat = setInterval(step, scanInterval());
}
function resetAutoScan() {
  stopAutoScan();
  if (!autoScanOn()) return;
  if (!inScanList()) return;              // the meter moves itself, not by ticks
  const iv = scanInterval();
  if (iv > 0) timers.auto = setInterval(() => {
    if (!inScanList()) { stopAutoScan(); return; }
    if (G.screen === 'overlay') menuStep(1);
    else scanStep(1);
  }, iv);
}
function stopAutoScan() {
  if (timers.auto) { clearInterval(timers.auto); timers.auto = null; }
}

document.addEventListener('keydown', e => {
  if (e.repeat) return;
  if (e.code === 'Space') {
    e.preventDefault();
    if (input.spaceDown) return;
    input.spaceDown = true;
    if (meterStage()) {
      startMeter();            // the charge moves from the first instant of the hold
    } else {
      timers.space = setTimeout(() => { timers.space = null; startHoldScan(); }, CFG.SPACE_HOLD_MS);
    }
  } else if (e.code === 'Enter' || e.code === 'NumpadEnter') {
    e.preventDefault();
    if (input.retDown) return;
    input.retDown = true;
    input.retLong = false;
    timers.ret = setTimeout(() => { timers.ret = null; input.retLong = true; backOut(); }, CFG.RETURN_HOLD_MS);
  }
});
document.addEventListener('keyup', e => {
  if (e.code === 'Space') {
    e.preventDefault();
    if (!input.spaceDown) return;
    input.spaceDown = false;
    if (timers.space) { clearTimeout(timers.space); timers.space = null; }
    const wasHolding = !!timers.spaceRepeat;
    if (timers.spaceRepeat) { clearInterval(timers.spaceRepeat); timers.spaceRepeat = null; }
    if (meterStage()) { releaseMeter(); return; }   // release only ever stops it
    if (!wasHolding) scanNext();
  } else if (e.code === 'Enter' || e.code === 'NumpadEnter') {
    e.preventDefault();
    if (!input.retDown) return;
    input.retDown = false;
    if (timers.ret) { clearTimeout(timers.ret); timers.ret = null; }
    if (!input.retLong) selectCurrent();
    input.retLong = false;
  }
});

/* The meter by mouse or touch: press and hold to fill it, let go to stop it,
   then press Cast. Optional, same as everywhere else in the hub, and never a
   drag — a press and a release is the whole gesture. */
const meterDown = e => {
  if (!meterStage()) return;
  e.preventDefault();
  startMeter();
};
powerMeter.box.addEventListener('mousedown', meterDown);
powerMeter.box.addEventListener('touchstart', meterDown, { passive: false });
// Released anywhere: sliding off the meter mid-hold must still stop it.
window.addEventListener('mouseup',  () => { if (meterStage()) releaseMeter(); });
window.addEventListener('touchend', () => { if (meterStage()) releaseMeter(); });
$('btnCast').addEventListener('click', () => { if (meterStage()) confirmCast(); });

$('btnHelp').addEventListener('click', () => openOverlay('help'));
$('btnSet').addEventListener('click', () => openOverlay('settings'));
$('btnExit').addEventListener('click', exitToHub);

window.addEventListener('message', e => {
  const d = e.data;
  if (d && d.type === 'narbe-voice-settings-changed' && d.settings) {
    const v = vm();
    if (v && v.updateSettings) { try { v.updateSettings(d.settings); } catch (err) {} }
  }
});
if (sm()) sm().subscribe(() => resetAutoScan());
window.addEventListener('resize', fitCanvas);

/* ══════════════════════════════════════════════════════════════════════════
   MAIN LOOP + BOOT
   ══════════════════════════════════════════════════════════════════════════ */
let lastT = 0;
function loop(now) {
  requestAnimationFrame(loop);
  if (!lastT) lastT = now;
  let dt = (now - lastT) / 1000;
  lastT = now;
  if (!isFinite(dt) || dt < 0) dt = 1 / 60;
  dt = Math.min(dt, 0.05);

  try {
    G.animTime += dt;
    if (G.screen === 'biting') {
      G.bitingTimer += dt;
      if (G.bitingTimer >= CFG.BITING_DURATION) resolveBiting();
    }
    stepMeter(dt);
    if (G.screen === 'catch') G.glowT = (G.glowT + dt) % CFG.GLOW_PERIOD_S;
    updateCatchGlow();
    draw();
  } catch (err) {
    console.error(err);
    drawError(err);
  }
}

function boot() {
  loadAll();
  applyTheme();
  fitCanvas();

  if (window.SafeAudio) {
    ['select', 'hover', 'win', 'lose'].forEach(n => SafeAudio.preload(n));
    SafeAudio.setEnabled(settings.sound);
  }

  G.lakeId = save.currentLakeId;
  const progress = ensureLakeProgress(G.lakeId);
  G.LAKE = LG.generateLake(lakeTemplateById(G.lakeId), progress.seed);
  G.pick = { direction: Math.floor(G.LAKE.sectors.length / 2) };
  saveProgress();

  enterCast(true);
  G.screen = 'menu';
  openOverlay('main');

  requestAnimationFrame(loop);
}
boot();
