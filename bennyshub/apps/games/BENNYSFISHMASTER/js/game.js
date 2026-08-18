'use strict';
/* ==========================================================================
   BENNY'S FISHMASTER
   A fishing-trip sim for one or two switches (Spacebar + Return).

   Casting has no hold-to-aim power bar: you scan a Direction list, then a
   Power list, and a dotted line previews exactly where the lure lands and
   what lives there before you commit — the same trick BENNYSBALLISTA uses
   for aiming without reflexes. Landing a bite is a self-paced colour
   sequence with no clock and no timeout; a wrong press never fails you,
   it only lowers the catch's quality, and a very low quality run just means
   junk comes up on the line instead of the fish. Nothing here can be failed
   by being slow.

   See ../../../AGENTS.md for the rules this game is built to.
   ========================================================================== */

const D  = window.FishMasterData;
const LG = window.FishMasterLakeGen;

/* ── Tunables ───────────────────────────────────────────────────────────── */
const CFG = {
  SPACE_HOLD_MS   : 3000,  // hold Space this long to start scanning by itself
  RETURN_HOLD_MS  : 1500,  // hold Return this long to back out / open Pause (per AGENTS.md)
  SCAN_DIR_ON_HOLD: -1,    // matches every other hub game

  W: 1280, H: 720,         // fixed design resolution; canvas letterboxes to fit
  BOAT_X: 640, BOAT_Y: 660,
  LAKE_MAX_R: 560,
  BAND_FRAC: { near: 0.35, mid: 0.65, far: 1.0 },

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
    version: 1
  };
}
let save = defaultSave();

function loadAll() {
  try {
    const s = JSON.parse(localStorage.getItem(SET_KEY) || 'null');
    if (s) Object.assign(settings, s);
  } catch (e) { /* corrupt settings shouldn't stop the game loading */ }
  try {
    const g = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (g) Object.assign(save, g);
  } catch (e) { /* same for progress */ }
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
  pick: { direction: 2, power: 0 },
  locked: {},
  scan: -1,
  menuIx: 0,
  menuStack: [],
  preview: null,
  lastLanding: null,
  bitingTimer: 0,
  bitingResolved: false,
  pendingBite: null,
  catch: null,          // { category, speciesId, sequence, stepIndex, correctCount, results }
  postCatchQueue: [],
  resumeScreen: null
};

const timers = { space: null, spaceRepeat: null, ret: null, auto: null };
const input  = { spaceDown: false, retDown: false, retLong: false };

/* ── Elements ───────────────────────────────────────────────────────────── */
const $ = id => document.getElementById(id);
const cv = $('cv'), ctx = cv.getContext('2d');
const chipHolders = { direction: $('chipsDirection'), power: $('chipsPower') };
const lanes       = { direction: $('laneDirection'), power: $('lanePower') };

/* Palette cache — read once per theme change, not per frame. */
const PALETTE_VARS = [
  '--bg', '--panel', '--panel2', '--line', '--text', '--dim',
  '--accent', '--accent2', '--violet', '--focus', '--good', '--bad',
  '--seqred', '--seqblue', '--water-near', '--water-far', '--boat',
  '--biome-shallows', '--biome-weedbed', '--biome-dropoff', '--biome-rockyshore', '--biome-deepchannel'
];
let PAL = {};
function refreshPalette() {
  const cs = getComputedStyle(document.body);
  PAL = {};
  for (const v of PALETTE_VARS) PAL[v] = cs.getPropertyValue(v).trim() || '#888';
}
function css(name) { return PAL[name] || '#888'; }

/* ══════════════════════════════════════════════════════════════════════════
   LAKE / SESSION SETUP
   ══════════════════════════════════════════════════════════════════════════ */
function ensureLakeProgress(lakeId) {
  if (!save.lakeProgress[lakeId]) {
    const template = lakeTemplateById(lakeId);
    save.lakeProgress[lakeId] = {
      seed: Math.floor(Math.random() * 1e9),
      objectives: template.objectives.map(() => ({ current: 0 })),
      completed: false
    };
  }
  return save.lakeProgress[lakeId];
}

function objectivesSpokenPhrase(lakeId) {
  const template = lakeTemplateById(lakeId);
  const progress = save.lakeProgress[lakeId];
  if (progress.completed) return 'All objectives complete for this lake.';
  return template.objectives.map((obj, i) => `${obj.description}: ${progress.objectives[i].current} of ${obj.amount}.`).join(' ');
}

function shortObjLabel(obj) {
  if (obj.type === 'catchCount')  return obj.speciesId ? fishById(obj.speciesId).name : 'Catches';
  if (obj.type === 'catchWeight') return (obj.speciesId ? fishById(obj.speciesId).name + ' lbs' : 'Total lbs');
  if (obj.type === 'catchLength') return fishById(obj.speciesId).name + ' in';
  return 'Objective';
}
function objectivesShortText(lakeId) {
  const template = lakeTemplateById(lakeId);
  const progress = save.lakeProgress[lakeId];
  if (progress.completed) return 'Objectives complete!';
  return template.objectives.map((obj, i) => `${shortObjLabel(obj)} ${progress.objectives[i].current}/${obj.amount}`).join(' · ');
}

function enterLake(lakeId, quiet) {
  const template = lakeTemplateById(lakeId);
  const progress = ensureLakeProgress(lakeId);
  save.currentLakeId = lakeId;
  G.lakeId = lakeId;
  G.LAKE = LG.generateLake(template, progress.seed);
  G.pick = { direction: Math.floor(G.LAKE.sectors.length / 2), power: 0 };
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
   CASTING — SCAN LISTS
   ══════════════════════════════════════════════════════════════════════════ */
function stageOrder() { return ['direction', 'power']; }

function laneItems(stage) {
  if (stage === 'direction') return G.LAKE.sectors.map((s, i) => ({ label: s.bearingLabel, ix: i }));
  return rod().powerTiers.map((p, i) => ({ label: p.name, ix: i }));
}
function laneLen() { return laneItems(G.stage).length; }

function subLabelFor(stage, ix) {
  const tiers = rod().powerTiers;
  if (stage === 'direction') {
    const band = tiers[Math.min(G.pick.power, tiers.length - 1)].band;
    return D.BIOMES[LG.biomeAt(G.LAKE, ix, band)].name;
  }
  const band = tiers[ix].band;
  return D.BIOMES[LG.biomeAt(G.LAKE, G.pick.direction, band)].name;
}

function renderChips() {
  ['direction', 'power'].forEach(stage => {
    const holder = chipHolders[stage];
    const items = laneItems(stage);
    holder.innerHTML = '';
    items.forEach(it => {
      const b = document.createElement('button');
      b.className = 'chip';
      b.type = 'button';
      const sub = subLabelFor(stage, it.ix);
      b.innerHTML = sub ? `${it.label}<span class="sub">${sub}</span>` : it.label;
      if (G.locked[stage] && G.pick[stage] === it.ix) b.classList.add('picked');
      if (G.screen === 'cast' && G.stage === stage && G.scan === it.ix) b.classList.add('focus');
      b.addEventListener('click', () => {           // mouse is optional, never required
        if (G.screen !== 'cast' || G.stage !== stage) return;
        G.scan = it.ix; renderChips(); updatePreview(); commit();
      });
      holder.appendChild(b);
    });
    lanes[stage].classList.toggle('locked', !!G.locked[stage]);
  });
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
  const it = laneItems(G.stage)[G.scan];
  if (!it) return;
  const landing = computeLanding();
  speak(`${it.label}. ${biomeNarrationPhrase(landing.biomeId)}`);
}

/* ══════════════════════════════════════════════════════════════════════════
   LANDING PREVIEW
   ══════════════════════════════════════════════════════════════════════════ */
function computeLanding() {
  const pk = Object.assign({}, G.pick);
  if (G.screen === 'cast' && G.scan !== -1) pk[G.stage] = G.scan;

  const sector = G.LAKE.sectors[pk.direction] || G.LAKE.sectors[0];
  const tiers = rod().powerTiers;
  const tier = tiers[Math.min(pk.power, tiers.length - 1)];
  const band = tier.band;
  const biomeId = LG.biomeAt(G.LAKE, sector.index, band);
  const radius = CFG.LAKE_MAX_R * CFG.BAND_FRAC[band] * sector.radiusMul;
  const angleRad = (sector.bearing - 90) * Math.PI / 180;
  const point = { x: CFG.BOAT_X + radius * Math.cos(angleRad), y: CFG.BOAT_Y + radius * Math.sin(angleRad) };
  return { sector, tier, band, biomeId, radius, point };
}
function updatePreview() { G.preview = (G.screen === 'cast') ? computeLanding() : null; }

/* ══════════════════════════════════════════════════════════════════════════
   COMMITTING A CAST
   ══════════════════════════════════════════════════════════════════════════ */
function commit() {
  if (G.scan === -1) { speak('Nothing highlighted. Press space to keep scanning.'); return; }
  const stage = G.stage;
  G.pick[stage] = G.scan;
  G.locked[stage] = true;
  sfx('select', .6);

  const it = laneItems(stage)[G.scan];
  const order = stageOrder();
  const next = order[order.indexOf(stage) + 1];

  if (next) {
    G.stage = next; G.scan = -1;
    renderChips(); updatePreview(); updateFooter();
    speak(`${it.label} locked. Now pick power.`);
  } else {
    speak(`${it.label}. Casting.`);
    renderChips();
    castLine();
  }
}

/* Return-hold: back out one stage, or open the pause menu. Reachable from
   every screen, per AGENTS.md. */
function backOut() {
  if (G.screen === 'overlay') { closeOverlay(); return; }
  if (G.screen === 'cast') {
    const order = stageOrder();
    const i = order.indexOf(G.stage);
    if (i <= 0) { openOverlay('pause'); return; }
    G.stage = order[i - 1];
    G.locked[G.stage] = false;
    G.scan = G.pick[G.stage];
    renderChips(); updatePreview(); updateFooter();
    sfx('hover', .5);
    speak(`Back to ${G.stage}.`);
    return;
  }
  openOverlay('pause'); // biting, catch, or menu behind an unopened overlay
}

function enterCast(fresh) {
  G.screen = 'cast';
  G.locked = {};
  G.stage = 'direction';
  G.scan = -1;
  updateBottomBar();
  stopAutoScan();
  renderChips(); updatePreview(); updateHud(); updateFooter();
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
  speak(`Casting toward ${D.BIOMES[landing.biomeId].name}...`);
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
    ? `Step ${i + 1} of ${G.catch.sequence.length}: Red. Press Space.`
    : `Step ${i + 1} of ${G.catch.sequence.length}: Blue. Press Return.`;
}

function startCatchSequence(bite) {
  const n = sequenceLengthFor(bite);
  G.catch = { category: bite.category, speciesId: bite.speciesId || null, sequence: randomSequence(n), stepIndex: 0, correctCount: 0, results: [] };
  G.screen = 'catch';
  updateBottomBar();
  renderCatchBar();
  updateFooter();
  const intro = bite.category === 'fish' ? "Something's on the line!" : "Something's tugging on your line.";
  speak(`${intro} Match each colour at your own pace, no rush. ${stepPrompt(0)}`);
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

  template.objectives.forEach((obj, i) => {
    const p = progress.objectives[i];
    if (obj.type === 'catchCount') {
      if (!obj.speciesId || outcome.id === obj.speciesId) p.current = Math.min(obj.amount, p.current + 1);
    } else if (obj.type === 'catchWeight') {
      if (!obj.speciesId || outcome.id === obj.speciesId) p.current = Math.min(obj.amount, round1(p.current + outcome.weight));
    } else if (obj.type === 'catchLength') {
      if (outcome.id === obj.speciesId && outcome.length >= obj.amount) p.current = obj.amount;
    }
  });

  const allDone = template.objectives.every((obj, i) => progress.objectives[i].current >= obj.amount);
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
      const rOuter = CFG.LAKE_MAX_R * CFG.BAND_FRAC[band] * s.radiusMul;
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

function drawPreview() {
  if (!G.preview) return;
  const p = G.preview.point;
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
  } else if (G.screen === 'cast') {
    modeEl.textContent = `Choose ${G.stage}`;
    const it = G.scan === -1 ? null : laneItems(G.stage)[G.scan];
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
          say: () => equipped ? `${r.name}. Already equipped.` : `${r.name}. Select to equip.`,
          act: () => { if (equipped) return; save.equippedRodId = r.id; saveProgress(); speak(`${r.name} equipped.`); }
        });
      } else {
        rows.push({
          text: () => r.name, val: () => `$${r.cost}`,
          say: () => `${r.name}. Costs ${r.cost} dollars.`,
          act: () => {
            if (save.money < r.cost) { speak('Not enough money for that rod.'); return; }
            save.money -= r.cost;
            save.ownedRods.push(r.id);
            save.equippedRodId = r.id;
            saveProgress();
            speak(`${r.name} purchased and equipped.`);
          }
        });
      }
    });
    rows.push({ text: () => 'Creel (Sell Catch)', act: () => openOverlay('creel') });
    rows.push({ text: () => 'Back', act: () => closeOverlay() });
    return rows;
  },

  equipbait: () => {
    const rows = D.BAIT.filter(b => !b.secret && save.unlockedBait.includes(b.id)).map(b => {
      const owned = b.free ? Infinity : (save.ownedBait[b.id] || 0);
      const equipped = save.equippedBaitId === b.id;
      const canEquip = b.free || owned > 0;
      return {
        text: () => `${b.name}${equipped ? ' (Equipped)' : ''}`,
        val: () => canEquip ? (equipped ? 'Equipped' : 'Equip') : 'None owned',
        dis: equipped || !canEquip,
        say: () => equipped ? `${b.name}. Already equipped.` : (canEquip ? `${b.name}. Select to equip.` : `${b.name}. You have none — buy some first.`),
        act: () => { if (equipped || !canEquip) return; save.equippedBaitId = b.id; saveProgress(); speak(`${b.name} equipped.`); }
      };
    });
    if ((save.ownedBait['secret_t_pill'] || 0) > 0) {
      const b = D.BAIT.find(x => x.id === 'secret_t_pill');
      const equipped = save.equippedBaitId === b.id;
      rows.push({
        text: () => `${b.name}${equipped ? ' (Equipped)' : ''}`,
        val: () => equipped ? 'Equipped' : 'Equip', dis: equipped,
        say: () => equipped ? `${b.name}. Already equipped.` : `${b.name}. Select to equip.`,
        act: () => { if (equipped) return; save.equippedBaitId = b.id; saveProgress(); speak(`${b.name} equipped.`); }
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

  fishfinder: () => {
    const template = lakeTemplateById(G.lakeId || save.currentLakeId);
    const rows = template.biomeIds.map(biomeId => ({
      text: () => D.BIOMES[biomeId].name,
      say: () => biomeNarrationPhrase(biomeId),
      act: () => speak(biomeNarrationPhrase(biomeId))
    }));
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
        G.pick = { direction: Math.floor(G.LAKE.sectors.length / 2), power: 0 };
        G.screen = 'menu';
        openOverlay('main');
        speak('Progress reset.');
      } },
    { text: () => 'Back', act: () => closeOverlay() }
  ],

  pause: () => [
    { text: () => 'Resume', act: () => closeOverlay() },
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
        <b>Casting.</b> Pick a direction, then a power. Each choice tells you what biome it reaches and what fish live there — no guessing, no timing. Better rods reach farther bands.<br><br>
        <b>Landing it.</b> When something bites, match a row of Red and Blue steps at your own pace — Space for Red, Return for Blue. There’s no clock. Missing a step just lowers the catch’s quality; a very low score means junk comes up instead of the fish.<br><br>
        <b>Selling &amp; gear.</b> Sell your catch in the Creel, then spend the money on bait (shifts the odds toward certain fish) and rods (reach farther bands permanently).`;
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
           + 'To cast, pick a direction, then a power. Each choice tells you what part of the lake it reaches and what fish live there, so you never have to guess. '
           + "When something bites, match a row of red and blue steps at your own pace. There is no clock. Missing a step only lowers the catch's quality; "
           + 'a very low score means junk comes up instead of the fish. Sell your catch in the creel, then spend the money on bait and rods.';
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
    G.scan = -1;
    updateBottomBar();
    renderChips(); updatePreview(); updateFooter();
    speak('Resumed. Press space to scan.');
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
function scanNext() {
  if (G.screen === 'overlay') menuStep(1);
  else if (G.screen === 'cast') scanStep(1);
  else if (G.screen === 'biting') resolveBiting();
  else if (G.screen === 'catch') catchPress('red');
  resetAutoScan();
}
function scanPrev() {
  if (G.screen === 'overlay') menuStep(-1);
  else if (G.screen === 'cast') scanStep(-1);
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
  if (G.screen !== 'cast' && G.screen !== 'overlay') return;
  const iv = scanInterval();
  if (iv > 0) timers.auto = setInterval(() => {
    if (G.screen === 'overlay') menuStep(1);
    else if (G.screen === 'cast') scanStep(1);
    else stopAutoScan();
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
    timers.space = setTimeout(() => { timers.space = null; startHoldScan(); }, CFG.SPACE_HOLD_MS);
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
    if (G.screen === 'biting') {
      G.bitingTimer += dt;
      if (G.bitingTimer >= CFG.BITING_DURATION) resolveBiting();
    }
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
  G.pick = { direction: Math.floor(G.LAKE.sectors.length / 2), power: 0 };
  saveProgress();

  enterCast(true);
  G.screen = 'menu';
  openOverlay('main');

  requestAnimationFrame(loop);
}
boot();
