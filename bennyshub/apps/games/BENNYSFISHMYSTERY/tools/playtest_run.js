/**
 * The playthrough itself. Driven by tools/playtest.js, which builds the
 * headless browser and loads the real game.
 *
 * This drives the REAL state machine through the REAL sequence - troll, pull
 * over, sweep the aim, hold the power, throw, wait for the bite, hook it, reel
 * it, land it. A shortcut would only test the shortcut.
 *
 * It also has to play WELL, which matters more than it sounds. The first
 * version locked the aim after a fixed twenty frames and charged for a fixed
 * forty, and the game duly reported "dropped in beside the boat, into open
 * water" eight hundred times over: it caught whatever happened to swim past
 * and never once landed on the shoal it had just pulled over for. That tells
 * you nothing about whether the game is finishable. So the aim and the power
 * are driven off the same feedback a player reads - onAim and onCharge both
 * say whether the line is predicted to land on a shoal, and on the TARGET
 * shoal - and the cast goes when they say yes.
 */
const H = require('./playtest.js');
const { G, RT, ok, say, VERBOSE } = H;

/* A thirtieth, not a sixtieth. Everything in the game is worked out from dt,
   so the play is identical and the run takes half as long - and a playthrough
   nobody waits for is a playthrough nobody runs. */
const DT = 1 / 30;

/* ── Listening ────────────────────────────────────────────────────────────
   The game talks to its interface through callbacks, so listening to them is
   how a headless run sees anything at all - and how it plays well, since the
   aim and power feedback is exactly what the player is given. */
const seen = {
  catches: {}, cards: {}, spoken: [], cues: 0, lost: 0,
  aim: null, charge: null, cardWaiting: null,
};

G.callbacks.onAim = function (d) { seen.aim = d; };
G.callbacks.onCharge = function (d) { seen.charge = d; };
/* onCue is the game SAYING there is a shoal, and on which side. That is the
   signal to pull over.
   `getArmed()` is not: it is the one-switch steering direction, initialised to
   'right' before any spot exists, so waiting on it meant pulling over on the
   first frame of every trip onto nothing at all - eighteen hundred stops on
   open water, and not one shoal cast at. */
G.callbacks.onCue = function (d) {
  seen.cues++;
  seen.cue = d;
};
G.callbacks.onSpeak = function (d) {
  const t = typeof d === 'string' ? d : (d && d.text);
  if (t && seen.spoken.length < 600) seen.spoken.push(t);
};
/* The reel is the one place the game can be lost, and it tells you how:
   holding while the fish RUNS builds strain, and strain reaching one parts the
   line. So the right play is hold while reeling, let go the moment it runs. */
G.callbacks.onReel = function (d) { seen.reel = d; };
G.callbacks.onCard = function (d) {
  seen.cards[d.which] = (seen.cards[d.which] || 0) + 1;
  if (d.which === 'beat') seen.beats = (seen.beats || 0) + 1;
  if (d.which === 'lost') seen.lost++;
  if (d.outcome && d.outcome.id) {
    const k = d.outcome.type + ':' + d.outcome.id;
    seen.catches[k] = (seen.catches[k] || 0) + 1;
  }
  seen.cardWaiting = d.which;
};

/** Spin the frame loop until `pred`, or `limit` frames. Frames used, or -1. */
function until(pred, limit, onFrame) {
  for (let i = 0; i < limit; i++) {
    if (pred()) return i;
    if (onFrame) onFrame(i);
    G.update(DT);
  }
  return -1;
}

/* ── One fish, played properly ────────────────────────────────────────── */

/**
 * Cast at the shoal and bring something back, or say why not.
 *
 * The aimer sweeps on its own, so this watches the prediction and commits when
 * it points somewhere worth throwing at: the target shoal for choice, any
 * shoal otherwise, and never the beach. The power then builds on its own, and
 * the same test decides when to let go.
 */
function fishOnce(budget) {
  seen.aim = null;
  seen.charge = null;

  /* The net is not a cast. One press dips it and the haul card follows; there
     is no aim, no meter and no bite to wait for. */
  if (G.missionBrief && (G.missionBrief().rod || {}).isNet) {
    seen.cardWaiting = null;
    G.startAim();
    const up = until(() => seen.cardWaiting, 60 * 20);
    if (up < 0) return { landed: false, aimedWell: false, why: 'the net never came up' };
    const which = seen.cardWaiting;
    if (G.afterCatchCard) G.afterCatchCard();
    return { landed: which === 'catchreveal', aimedWell: true };
  }

  G.startAim();
  G.setAimSweep(true);

  /* Two sweeps' patience. `isTarget` is the fish the job wants; `onShoal` is
     any fish at all, which is worth taking if the target never comes round. */
  let committed = false;
  /* Pulled over onto a shoal, the boat has squared up to it and the rod is
     already pointing at it - so there is nothing to sweep for, and sweeping
     only walks the aim off the fish. The aimer predicts at FULL range, so it
     will not say "on the shoal" about water twenty-five units away however
     long you wait; the power is what puts the bait there, and that is the
     next thing this does. Open water is the only place a sweep helps. */
  const onAShoal = !!(G.run && G.run.current && !G.run.current.open && G.run.current.shoals.length);
  if (onAShoal) {
    committed = true;
  } else {
    for (let pass = 0; pass < 2 && !committed; pass++) {
      const want = pass === 0
        ? (a) => a && a.isTarget && !a.onShore
        : (a) => a && a.onShoal && !a.onShore;
      if (until(() => want(seen.aim), 60 * 6) >= 0) committed = true;
    }
  }
  G.setAimSweep(false);
  // A handful of samples, to see what the aimer was actually offering.
  if (seen.aimSamples === undefined) seen.aimSamples = [];
  if (seen.aimSamples.length < 6)
    seen.aimSamples.push({ committed, aim: seen.aim && {
      onShoal: seen.aim.onShoal, onShore: seen.aim.onShore,
      band: seen.aim.band, isTarget: seen.aim.isTarget,
      shoal: seen.aim.shoalName } });

  // Committing to the aim and starting the meter are one act.
  G.beginCharge();
  G.setCharging(true);

  /* Hold until the throw is predicted to land on the shoal. The aim is taken
     at full power, so the power is what actually decides where it lands. */
  const mag = !!(G.magnetOn && G.magnetOn());
  const powered = until(() => seen.charge &&
                              !seen.charge.onShore && !seen.charge.tooDeep &&
                              /* A MAGNET WANTS THE WHOLE METER. There is no
                                 shoal for it to land on - it finds things per
                                 unit dragged - so a throw held back to land
                                 on a shoal is a short drag and an empty
                                 retrieve, which is what stalled every salvage
                                 job on the ladder. */
                              (mag ? seen.charge.power >= 88
                                   : (seen.charge.isTarget || seen.charge.onShoal)),
                        60 * 5);
  G.setCharging(false);
  G.releaseCast();
  const aimedWell = powered >= 0;
  if (seen.chargeSamples === undefined) seen.chargeSamples = [];
  if (seen.chargeSamples.length < 6)
    seen.chargeSamples.push({ ok: aimedWell, charge: seen.charge && {
      onShoal: seen.charge.onShoal, onShore: seen.charge.onShore,
      band: seen.charge.band, isTarget: seen.charge.isTarget,
      power: Math.round(seen.charge.power), dist: seen.charge.distance } });

  // In the air, into the water, then waiting. The wait is unbounded by design.
  seen.cardWaiting = null;

  /* A MAGNET IS NOT WAITED ON. Nothing bites it: you throw it out, drag it
     back along the bottom, and something comes up or nothing does. Waiting
     over one is a wait that can never end, so the bot holds the reel the
     whole way in - exactly what the player's switch does - and casts again
     if it comes back empty. */
  if (G.magnetOn && G.magnetOn()) {
    const back = until(() => seen.cardWaiting || G.isFighting(), budget,
                       () => G.setReelHold(true));
    G.setReelHold(false);
    if (back < 0) return { landed: false, aimedWell, why: 'the magnet never came back' };
    if (!G.isFighting()) {
      const which = seen.cardWaiting;
      if (which === 'catchreveal' || which === 'dingusreveal') {
        if (G.afterCatchCard) G.afterCatchCard();
        return { landed: true, aimedWell, card: which };
      }
      /* Came back with nothing on it, which is most drags. */
      return { landed: false, aimedWell, why: 'nothing on the magnet', retry: true };
    }
  }

  const bit = until(() => G.isFighting() || seen.cardWaiting, budget);
  if (bit < 0) return { landed: false, aimedWell, why: 'no bite inside the budget' };

  if (G.isFighting()) {
    G.hookFish();
    seen.reel = null;

    /* Reel it properly.
     *
     * Holding straight through is how you lose a fish: while it runs, hauling
     * builds strain, and strain reaching one parts the line. Doing that lost
     * seventy-one percent of everything hooked - which says nothing about the
     * game and everything about the technique. So: hold while reeling, let go
     * the moment it warns or runs, and take it back up when it tires.
     *
     * Strain is watched as well as the phase, because letting go a frame late
     * still costs a little, and backing off early is free.
     */
    const done = until(() => seen.cardWaiting, budget, () => {
      const r = seen.reel;
      const hauling = !r || (!r.running && !r.warning && r.strain < 0.35);
      G.setReelHold(hauling);
    });
    G.setReelHold(false);
    if (done < 0) return { landed: false, aimedWell, why: 'never finished reeling' };
  }

  const which = seen.cardWaiting;
  if (which === 'catchreveal' || which === 'dingusreveal') {
    /* Take the card. afterCatchCard reopens the spot card when there is still
       a shoal under the boat, which is the offer to cast again - the caller
       decides whether to take it or troll on. */
    if (G.afterCatchCard) G.afterCatchCard();
    return { landed: true, aimedWell };
  }
  if (G.chooseTroll) G.chooseTroll();
  return { landed: false, aimedWell, why: which || 'nothing' };
}

/* ── The counter ──────────────────────────────────────────────────────────
   What a player does with money: buy what the job asks for, then the next rod,
   the next vessel, the next tool, in that order, as long as it is affordable.
   Rods first, because a canoe with nothing but a net in it catches nothing
   that pays. */
function shop() {
  let guard = 0, bought = true;
  const money = () => G.getSave().money;
  /* PACK THE BOX. The game no longer picks your gear: you take one rod, one
     lure and one tool, and the wrong kit costs a trip. A player reads the
     brief and takes what it asks for; so does this. */
  const packKit = () => {
    const want = G.jobWants && G.jobWants();
    const rods = G.shopRods ? G.shopRods() : [];
    const tools = G.shopTools ? G.shopTools() : [];
    const net = rods.find(r => r.isNet);
    const hooks = rods.filter(r => !r.isNet).sort((a, b) => b.reachFt - a.reachFt);
    const magnet = tools.filter(t => t.kind === 'magnet').sort((a, b) => b.name.localeCompare(a.name))[0];
    if (!want) { if (hooks[0]) G.equipKit(hooks[0].id, undefined, ''); return; }
    if (want.kind === 'net') { if (net) G.equipKit(net.id, undefined, ''); return; }
    if (want.kind === 'magnet') { if (hooks[0] && magnet) G.equipKit(hooks[0].id, undefined, magnet.id); return; }
    if (hooks[0]) G.equipKit(hooks[0].id, undefined, '');
  };
  packKit();
  /* And put the job's own lure on the line. Owning it is not fishing with
     it - the same trap the tackle box exists to make visible. */
  const wantLure = G.jobLure && G.jobLure();
  if (wantLure && G.ownsBait && G.ownsBait(wantLure.id)) {
    G.equipKit(undefined, wantLure.id, undefined);
  }

  /* A rig lost to whatever lives out there: Walt hands over another, free,
     and it is the first thing that happens at the counter. */
  for (let g = 0; g < 3 && G.tackleBroken && G.tackleBroken(); g++) {
    G.takeCounterBeat();
    seen.rigsLost = (seen.rigsLost || 0) + 1;
  }
  while (bought && guard++ < 10) {
    bought = false;
    const m = G.currentMission();
    const t = (m && m.target) || {};
    if (t.type === 'ownVessel' && G.buyVessel(t.vesselId)) { bought = true; continue; }
    if (t.type === 'ownTool' && G.buyTool(t.toolId)) { bought = true; continue; }
    if (t.type === 'repairVessel' && RT.economy) {
      const e = RT.economy.status();
      if (e.repairPrice > 0 && money() > 0 &&
          G.buyRepair(Math.min(e.repairPrice, money()))) { bought = true; continue; }
    }
    /* THE LURE FIRST. The fish a job names will not take anything else, so a
       rod bought ahead of the lure is a rod with nothing on the end of it -
       and the lure is three dollars against the rod's forty-five. */
    const bt = G.nextBait ? G.nextBait() : null;
    if (bt && bt.forJob && money() >= bt.cost && G.buyBait(bt.id)) { bought = true; continue; }
    const r = G.nextRod(); if (r && money() >= r.cost && G.buyRod(r.id)) { bought = true; continue; }
    const v = G.nextVessel(); if (v && money() >= v.cost && G.buyVessel(v.id)) { bought = true; continue; }
    const tl = G.nextTool(); if (tl && money() >= tl.cost && G.buyTool(tl.id)) { bought = true; continue; }
  }
}

/* ── One trip ─────────────────────────────────────────────────────────── */

function oneTrip() {
  G.castOff();
  let landed = 0, stops = 0, casts = 0, wellAimed = 0, guard = 0;
  let fromThisShoal = 0;

  while (guard++ < 300) {
    if (!G.isPlaying()) break;
    if (G.turnInState().canTurnIn) break;      // job done; take it home

    /* Nothing on the line: no more casting until the counter sorts it. */
    if (G.tackleBroken && G.tackleBroken()) break;
    if (!G.isFishing() && !G.isFighting()) {
      /* Troll until the game CALLS a shoal, then pull over onto its side,
         preferring the one holding the job's fish. A pull-over is a sustained
         lean rather than a tap, so the helm is held over while the boat comes
         round. */
      seen.cue = null;
      /* Where a player would point the boat: the job's place if it has one,
         otherwise the nearest gold mark on the chart - a shoal of the fish the
         job is about. Trolling at random found the shallow species by luck and
         never found the deep ones at all.

         Worked out three times a second, not sixty: the search sweeps a wide
         circle of the lake and doing it every frame turned a two-minute
         playthrough into a ten-minute one. */
      let goal = null, gf = 0;
      const refreshGoal = () => {
        if (gf-- > 0) return goal;
        gf = 20;
        goal = (G.jobPlace && G.jobPlace()) || (G.jobFish && G.jobFish()) || null;
        return goal;
      };
      const steerToPlace = () => {
        const pl = refreshGoal();
        const r = G.run;
        if (!pl || !r) { G.setSteer(0); return; }
        /* ROUND THE BAR. Steered on the straight bearing the boat drives onto
           the shallows between here and the deep water and sits there - which
           is what the quest helper did to players too, and only showed up
           once a shoal had to be closed to rather than hailed from a quarter
           of a mile. The engine works out the clear heading; the bot steers
           the same one, or it is testing a different game. */
        const want = G.clearHeading ? G.clearHeading(pl.x, pl.z)
                                    : Math.atan2(pl.x - r.x, -(pl.z - r.z));
        let d = want - r.head;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        G.setSteer(Math.abs(d) < 0.05 ? 0 : (d > 0 ? 1 : -1));
      };
      /* Near what we are steering for, pull over onto it whether or not a cue
         has come - a player reading the chart does exactly that. */
      const nearPlace = () => {
        const pl = goal;
        const r = G.run;
        if (!pl || !r) return null;
        const d = Math.hypot(pl.x - r.x, pl.z - r.z);
        /* THE ENGINE'S OWN NUMBER. This was a flat 230 units, from when the
           game offered a spot from a quarter of a mile away; the offer is a
           proximity now and a bot that pulls over outside it stops in open
           water and fishes nothing. */
        const reach = (G.spotOffer ? G.spotOffer() : 230) * 0.95;
        if (d > reach) return null;
        const rx = Math.cos(r.head), rz = Math.sin(r.head);
        return ((pl.x - r.x) * rx + (pl.z - r.z) * rz) >= 0 ? 'right' : 'left';
      };
      /* With somewhere to be, ordinary fish are not worth stopping for - only
         the job's own. Stopping for every perch on the way out is how a
         ninety-second run to the fog edge never ended. */
      /* AND CLOSE ENOUGH TO BE GIVEN IT. Hearing the call is the cue to keep
         steering; the shoal is only handed over inside the offer range, and
         pulling over outside it stops the boat in open water with the fish
         still fifty yards away. `__spotToEnter` is the game's own answer to
         "what would I get if I pulled over now". */
      const wouldGet = () => {
        const c = seen.cue;
        if (!c) return null;
        const side = c.leftTarget ? 'left' : c.rightTarget ? 'right'
                   : c.left ? 'left' : 'right';
        const t = G.__spotToEnter && G.__spotToEnter(side);
        return (t && !t.open) ? side : null;
      };
      const worthIt = () => {
        if (seen.cue && goal && !(seen.cue.leftTarget || seen.cue.rightTarget)) seen.cue = null;
        return !!wouldGet() || !!nearPlace();
      };
      refreshGoal();
      const called = until(worthIt, 60 * 120, steerToPlace);
      G.setSteer(0);
      if (called >= 0 && !seen.cue) { const sd = nearPlace() || 'right'; seen.cue = {}; seen.cue[sd] = true; seen.cue[sd + 'Target'] = true; }
      if (called < 0) break;
      const c = seen.cue;
      const side = c.leftTarget ? 'left' : c.rightTarget ? 'right'
                 : c.left ? 'left' : 'right';
      /* What the game thinks is on that side. `open: true` means it treated
         the stop as open water, which is the difference between casting at a
         shoal and casting at nothing. */
      const target = G.__spotToEnter && G.__spotToEnter(side);
      if (seen.enters === undefined) seen.enters = [];
      if (seen.enters.length < 8) seen.enters.push({
        side,
        open: !!(target && target.open),
        shoals: target && target.shoals ? target.shoals.length : 0,
        detail: target && target.shoals && target.shoals[0] ? {
          side: target.shoals[0].side, lateral: Math.round(target.shoals[0].lateral),
          radius: target.shoals[0].radius, fish: target.shoals[0].fishName,
          isTarget: target.shoals[0].isTarget } : null,
      });
      G.pullOverTo(side);
      const arrived = until(() => G.isFishing(), 60 * 15,
                            () => G.setSteer(side === 'left' ? -1 : 1));
      G.setSteer(0);
      if (arrived < 0) continue;
      stops++;
    }

    /* A rescue or a secret puts up a beat card instead of a fishing card:
       there is nothing to cast at, only the one thing the job is about. */
    if (seen.cardWaiting === 'beat') {
      G.takeBeat();
      seen.cardWaiting = null;
      until(() => G.isSteering(), 60 * 6);
      continue;
    }

    const r = fishOnce(60 * 40);
    casts++;
    if (!r.landed) { seen.whys = seen.whys || {}; seen.whys[r.why || '?'] = (seen.whys[r.why || '?'] || 0) + 1; }
    if (r.landed) landed++;
    if (r.aimedWell) wellAimed++;

    /* Take a couple from a shoal and then move on.
     *
     * A shoal holds nine to fourteen fish, so casting at it again is
     * legitimate - but the card offers that by default, and taking the offer
     * every time means never trolling anywhere. The first run that reeled
     * properly fished ONE muskie shoal eighteen hundred times and finished no
     * jobs at all, because the sunfish job 1 asks for were three spots up the
     * lake and it never went to look. */
    /* Stay while the fish are the ones you came for. Moving on after two of
       anything meant crossing the lake again for every trout, which is not
       how anybody fishes and burnt the whole trip budget on travel. */
    const onMyFish = !!(G.run && G.run.current && G.run.current.shoals &&
                        G.run.current.shoals.some(x => x.isTarget));
    const stay = onMyFish ? 6 : 2;
    fromThisShoal = r.landed ? fromThisShoal + 1 : 99;
    /* At the job's PLACE you stay until the thing comes up - that is what you
       came for - within reason. */
    const atPlace = G.run && G.run.current && G.run.current.isPlace;
    if (atPlace && fromThisShoal < 14 && !G.turnInState().canTurnIn) continue;
    if (fromThisShoal >= stay) {
      fromThisShoal = 0;
      if (G.chooseTroll) G.chooseTroll();
      // Let the boat get under way again before looking for the next cue.
      until(() => G.isSteering(), 60 * 6);
    }
  }

  G.returnToDock();
  return { landed, stops, casts, wellAimed };
}

/* ── The playthrough ──────────────────────────────────────────────────── */

console.log('PLAYTHROUGH');
console.log('===========');
G.resetProgress();
/* A real scene and camera, and a renderer that only has to be stored: game.js
   keeps the reference and hands it to RT.scene. init() also runs the boot
   audit, so getting past this means every job in the ladder passed it. */
G.init({
  scene: new H.THREE.Scene(),
  camera: new H.THREE.PerspectiveCamera(55, 16 / 9, 0.1, 4000),
  renderer: { shadowMap: {}, domElement: {}, setSize() {}, render() {},
              setPixelRatio() {}, getContext: () => null },
});
G.goToDock();

const first = G.currentMission();
ok(!!first, 'there is a job waiting at the dock');
/* THE STORY, not the whole board. The two collection jobs after the bell are
   the post-game - ten fish and ten finds at one chance in two hundred - and
   playing them here would be sixteen fruitless trips reported as a stuck
   game. They are checked in tools/postcheck.js, where the odds can be
   measured instead of waited out. */
const all = G.visibleMissions() || [];
const storyEnd = (function () {
  for (let i = 0; i < all.length; i++) if (all[i].finale) return all[i].n;
  return all.length;
})();
const ladder = storyEnd;
console.log('the ladder is ' + ladder + ' jobs long, and ' +
            (all.length - ladder) + ' more after the bell (see postcheck.js)');
console.log('job 1: ' + (first && first.text));
console.log();

let done = 0, tripsTotal = 0, caught = 0, castsTotal = 0, aimedTotal = 0;
let stuck = null, finale = false;

for (let step = 0; step < 240; step++) {
  const m = G.currentMission();
  if (!m) break;
  if (G.isFinished && G.isFinished()) break;

  const before = G.getSave().currentMission;
  if (G.turnInState().canTakeGrant) G.takeGrant();

  /* Two of the written kinds never leave the dock: being told something, and
     ringing the bell at the end. Both are rows on the keeper's menu. */
  /* Everything Walt has to say first: the brief (which is where the net
     changes hands on the first morning), then any beat at the counter. */
  for (let g = 0; g < 4; g++) {
    const cb = G.counterBeat && G.counterBeat();
    if (!cb || cb.done) break;
    G.takeCounterBeat();
    seen.counterBeats = (seen.counterBeats || 0) + 1;
  }

  shop();
  let trips = 0, jobLanded = 0;
  while (!G.turnInState().canTurnIn && trips < 16) {
    const r = oneTrip();
    trips++; tripsTotal++;
    jobLanded += r.landed; caught += r.landed;
    castsTotal += r.casts; aimedTotal += r.wellAimed;
    if (G.holdCount && G.holdCount() > 0) G.sellCatch();
    shop();          // which also repacks the box for the job in hand
    if (G.turnInState().canTakeGrant) G.takeGrant();
    say('job ' + m.n + ' trip ' + trips + ': ' + r.landed + '/' + r.casts +
        ' landed, ' + r.stops + ' stops, $' + G.getSave().money);
  }

  if (!G.turnInState().canTurnIn) {
    const st = G.turnInState();
    stuck = { n: m.n, text: m.text, trips, money: G.getSave().money,
              progress: st.progressText, landed: jobLanded };
    break;
  }

  const wasFinale = !!m.finale;
  G.turnInMission();
  done++;
  /* THE BELL IS THE END OF THE GAME AS A THING TO PLAY. Everything past it is
     the quiet lake and two collections that are deliberately a very long
     hunt. */
  if (wasFinale) {
    finale = true;
    say('the bell is rung: the story is finished');
    break;
  }
  /* The finale does not advance the counter, and should not: currentMission is
     clamped to the length of the ladder, so handing in the last job leaves it
     where it was and sets `completed` instead. Reading that as being stuck
     called a finished game a failure. */
  if (G.isFinished && G.isFinished()) { finale = true; break; }
  if (G.getSave().currentMission === before) {
    stuck = { n: m.n, text: m.text, why: 'turn-in did not advance the ladder' };
    break;
  }
  if (VERBOSE) console.log('  job ' + m.n + ' done in ' + trips + ' trip' +
                           (trips === 1 ? '' : 's') + ', $' + G.getSave().money);
}

/* ── What happened ────────────────────────────────────────────────────── */

console.log();
console.log('jobs finished     ' + done + ' of ' + ladder);
console.log('trips             ' + tripsTotal);
console.log('casts             ' + castsTotal + '   (' +
            Math.round(100 * aimedTotal / Math.max(1, castsTotal)) +
            '% thrown onto a shoal)');
console.log('fish landed       ' + caught);
console.log('fish lost         ' + seen.lost);
console.log('money             $' + G.getSave().money);
console.log('rods owned        ' + (G.getSave().rods || []).join(', '));
console.log('vessels owned     ' + (G.getSave().vessels || []).join(', '));
console.log('tools owned       ' + (G.getSave().tools || []).join(', '));
console.log('rigs lost         ' + (seen.rigsLost || 0) + ' to whatever is out there');
console.log('tags logged       ' + (G.getSave().tags || []).length + ', scrap traded ' + (G.getSave().scrapTraded || 0));
console.log('baits owned       ' + (G.getSave().baits || []).join(', '));
console.log('finished          ' + (G.isFinished && G.isFinished() ? 'yes' : 'no'));

const rows = Object.keys(seen.catches).sort((a, b) => seen.catches[b] - seen.catches[a]);
const species = rows.filter(k => k.startsWith('fish:'));
console.log('species landed    ' + species.length + ' different kinds');
console.log('beats taken       ' + (seen.beats || 0) + ' out on the water, ' +
            (seen.counterBeats || 0) + ' at the counter');
if (VERBOSE || stuck || !species.length) {
  console.log();
  console.log('WHAT CAME UP');
  rows.slice(0, 24).forEach(k =>
    console.log('  ' + k.padEnd(28) + String(seen.catches[k]).padStart(5)));
  if (!rows.length) console.log('  nothing at all');
}

/* The blow-by-blow only when it is wanted, or when something went wrong -
   these are the traces that turned "stuck on job 2" into "pulling over never
   lands on a shoal", so they earn their place, but a passing run should read
   in one screen. */
if (VERBOSE || stuck) {
  console.log();
  console.log('WHAT PULLING OVER GAVE US (first few stops)');
  (seen.enters || []).forEach(e => console.log('  ' + JSON.stringify(e)));
  console.log();
  console.log('WHAT THE AIMER OFFERED (first few casts)');
  (seen.aimSamples || []).forEach(a =>
    console.log('  committed=' + a.committed + '  ' + JSON.stringify(a.aim)));
}

console.log();
console.log('cards: ' + Object.keys(seen.cards)
  .sort((a, b) => seen.cards[b] - seen.cards[a])
  .map(k => k + ' x' + seen.cards[k]).join(', '));

if (stuck) {
  console.log();
  console.log('STUCK on job ' + stuck.n + ': ' + (stuck.text || ''));
  if (stuck.why) console.log('  ' + stuck.why);
  if (stuck.progress) console.log('  the card showed: ' + stuck.progress);
  console.log('  casts that landed nothing, by reason: ' + JSON.stringify(seen.whys || {}));
  console.log('  owned: ' + JSON.stringify({ rods: G.getSave().rods, vessels: G.getSave().vessels, tools: G.getSave().tools }));
  if (stuck.trips !== undefined)
    console.log('  after ' + stuck.trips + ' trips and ' + stuck.landed +
                ' fish, $' + stuck.money);
  console.log();
  console.log('the last few things the game said:');
  seen.spoken.slice(-8).forEach(t => console.log('  "' + t + '"'));
}

ok(done > 0, 'at least one job can be finished');
ok(finale, 'the game can be finished - the bell was rung');
ok(G.isSolved && G.isSolved(),
   'and ringing it opens the lake up: fog off, timber gone, hull safe');
ok(!stuck, stuck ? 'stuck on job ' + stuck.n + ' (' + (stuck.text || '') + ')'
                 : 'the whole ladder can be walked');
ok(castsTotal === 0 || aimedTotal / castsTotal > 0.4,
   'most casts land on a shoal (' +
   Math.round(100 * aimedTotal / Math.max(1, castsTotal)) + '%)');
/* A run that finishes the ladder in three casts has found a way to cheat it,
   and one that takes ten thousand has found a wall. Both are worth catching. */
ok(castsTotal >= done * 2, 'the jobs took real fishing (' + castsTotal +
   ' casts for ' + done + ' jobs)');
ok(castsTotal < done * 60, 'no job turned into a grind (' +
   Math.round(castsTotal / Math.max(1, done)) + ' casts per job)');
ok(species.length >= 8, 'the lake is varied (' + species.length + ' species landed)');
ok(seen.lost / Math.max(1, castsTotal) < 0.5,
   'a competent angler keeps most of what they hook (' + seen.lost + ' lost)');

const res = H.results();
console.log();
console.log(res.fail === 0
  ? res.checks + ' checks passed. The game can be played through.'
  : res.fail + ' of ' + res.checks + ' checks failed.');
process.exit(res.fail ? 1 : 0);
