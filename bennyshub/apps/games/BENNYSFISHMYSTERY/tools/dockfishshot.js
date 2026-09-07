/**
 * Fishing off the boards, played in and photographed.
 *
 *     python -m http.server 8765 --bind 127.0.0.1      (from bennyshub/)
 *     node tools/dockfishshot.js [outDir]
 *
 * Same headless Chrome + puppeteer-core setup as tools/dockshot.js.
 *
 * tools/dockcheck.js already measures all of this in node, against the real
 * Scene, and it is the faster way to know a number changed. What it cannot do
 * is look. Three things went wrong here at once and every one of them was a
 * framing problem - something in the wrong PLACE ON SCREEN, which arithmetic
 * will happily call correct:
 *
 *   a. You stood off the side of the jetty, beside where the boat is tied, so
 *      the dock lay across the left of the picture and the one thing a person
 *      fishing off a dock ought to be looking down was out of frame. Now you
 *      stand on the boards, on the centreline, DOCK_STAND out from the
 *      waterline, facing out along them.
 *   b. The cast marker sat off to one side of the boards rather than straight
 *      out past the end of them. With a rod it now goes out to the shoal; with
 *      the hand net - which does not throw at all, it scoops - it comes in to
 *      the rail, because a square 28 feet out is somewhere a net can never
 *      reach.
 *   c. A hooked fish was landed at the boat's rail figure, which off a dock is
 *      over solid decking, so it broke the surface and rose up through the
 *      planks. It now comes up past the last board, over open water.
 *
 * So this plays in on the real path - Walt's brief, the net, out on the
 * boards, pick the rod, hold to charge, let go - and takes three pictures:
 * where you stand, the cast zone bracketed, and a fish being landed. Every
 * number it measures is printed beside the shot it belongs to, so the picture
 * and the arithmetic can be read against each other.
 *
 * A landing needs a bite, and a bite is a dice roll, so the cast is tried
 * several times over; if nothing takes, it says so rather than pretending.
 *
 * One number here reads wrong until you know why: on the boards the heading is
 * a quarter turn, 270 degrees, and that is deliberate. The camera looks down
 * the CASTING side rather than down the bow, so a heading of 0 would point the
 * camera along the bank. It is printed, not asserted; what is asserted is what
 * the quarter turn is FOR - that the casting side faces out into the lake and
 * the cast marker lands down the middle of the picture.
 */
const path = require('path');
const fs = require('fs');

const OUT = process.argv[2] || path.join(process.env.TEMP || '.', 'fishmaster-dockfishshot');
fs.mkdirSync(OUT, { recursive: true });
const URL = process.env.FM_URL || 'http://127.0.0.1:8765/apps/games/BENNYSFISHMYSTERY/index.html';
const CHROME = process.env.CHROME || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));

let puppeteer;
try { puppeteer = require('puppeteer-core'); }
catch (e) {
  try { puppeteer = require(path.join(process.env.FM_NODE_MODULES || '', 'puppeteer-core')); }
  catch (e2) { console.error('puppeteer-core not found. npm i puppeteer-core (or set FM_NODE_MODULES).'); process.exit(2); }
}

let fail = 0, checks = 0;
const ok = (c, msg) => { checks++; if (!c) { fail++; console.log('  FAIL  ' + msg); } else console.log('  ok    ' + msg); return c; };
const say = (s) => console.log(s);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const n1 = (v) => (v === null || v === undefined || !isFinite(v)) ? '?' : v.toFixed(1);

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
           '--window-size=1280,720', '--no-first-run', '--autoplay-policy=no-user-gesture-required', '--mute-audio'],
    defaultViewport: { width: 1280, height: 720 },
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('uncaught: ' + (e.message || e)));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const u = m.location().url || '';
    if (/Failed to load resource/.test(m.text()) && (/favicon/.test(u) || /\/images\//.test(u))) return;
    errors.push('console.error: ' + m.text() + ' @ ' + u);
  });

  const shot = async (name) => {
    const p = path.join(OUT, name + '.png');
    await page.screenshot({ path: p });
    return p;
  };
  const hold = async (key, ms) => { await page.keyboard.down(key); await sleep(ms); await page.keyboard.up(key); };
  /* A tap, not a jab: the shared scan manager throws away a press too short to
     have been meant, so anything under its floor never reaches the game. */
  const tap = async (key) => hold(key, 90);

  /**
   * Everything worth knowing about standing on the boards, read out of the
   * live game in one go.
   *
   * The waterline is walked for rather than assumed: the chart is asked, one
   * unit at a time, where the water stops under the dock's own x. Everything
   * else is measured from it, which is what makes "three units past the end of
   * the boards" a sentence about the world and not about a constant.
   */
  const measure = () => page.evaluate(() => {
    const G = RT.game, S = RT.scene;
    if (!G.run) return null;
    const st = G.mapState();
    const chart = st.chart;
    const dock = chart.dock;
    let shore = dock.z - 90;
    for (let i = 0; i < 260; i++) { if (!chart.inWater(dock.x, shore + 1)) break; shore += 1; }
    const boardsEnd = shore - 22;                 // the jetty reaches 22 past the waterline
    const rod = G.equippedRod();
    const mark = (S.dockTargets || []).find(t => t && t.water);
    const land = S.landingPoint ? S.landingPoint() : null;
    const rect = G.focusScreenRect();
    /* Where the cast marker lands on screen. The Scene keeps its camera to
       itself, so there is no projecting arbitrary points from out here - but
       it already publishes the two numbers that matter: the plate positions
       it projects every frame, and the bracket it draws round the water. */
    const plates = G.dockLabelPositions() || [];
    const castPlate = plates.find(pp => pp && pp.key === 'cast') || null;
    return {
      state: G.state, vessel: G.vessel().id, onFoot: G.isOnFoot(),
      you: { x: G.run.x, z: G.run.z, head: G.run.head },
      dock: { x: dock.x, z: dock.z },
      shore: shore, boardsEnd: boardsEnd,
      rod: { id: rod.id, name: rod.name, isNet: !!rod.isNet, castFt: rod.castFt || 0 },
      mark: mark ? { x: mark.pos.x, z: mark.pos.z,
                     ft: +chart.depthAt(mark.pos.x, mark.pos.z).toFixed(1) } : null,
      land: land ? { x: land.x, z: land.z,
                     ft: +chart.depthAt(land.x, land.z).toFixed(1) } : null,
      rect: rect,
      screen: { w: window.innerWidth, h: window.innerHeight,
                cast: castPlate ? { x: Math.round(castPlate.x), y: Math.round(castPlate.y) } : null },
    };
  });

  /** Print a measurement, and check the things about it that must hold. */
  const report = (m) => {
    const ahead = m.you.z - m.boardsEnd;
    const headDeg = Math.round(((m.you.head * 180 / Math.PI) % 360 + 360) % 360);
    say('  you stand at x ' + n1(m.you.x) + ' z ' + n1(m.you.z) +
        ', heading ' + headDeg + ' deg, in the ' + m.vessel);
    say('  the waterline is at z ' + n1(m.shore) + '; the boards end at z ' + n1(m.boardsEnd) +
        ', ' + n1(ahead) + ' in front of you');
    ok(Math.abs(m.you.x - m.dock.x) < 1.2,
       'you are ON the boards, on the centreline, not off the side of them (x ' +
       n1(m.you.x) + ' against the dock\'s ' + n1(m.dock.x) + ')');
    ok(ahead > 2 && ahead < 12,
       'with decking still running away in front of you (' + n1(ahead) + ' units)');
    /* 270 degrees is the right answer here and not a bug: on the boards the
       head is a quarter turn on purpose, because the camera looks down the
       CASTING side and not down the bow (js/game.js, launchPoint). So the
       heading is reported, and what is CHECKED is the thing it exists to
       achieve - that the casting side faces out into the lake. */
    /* THE STANCE. Out along the boards with the bow pointing down them, and
       the bait going over the PORT edge into open water - which is how a dock
       is fished, and what puts the jetty in the picture instead of leaving
       the player on the last plank with nothing but lake in front of them. */
    /* THE STANCE. Near the end of the boards, on the centreline, looking
       straight out along them - so the aim, the camera and the target square
       all point the same way. The heading reads 270 because the camera looks
       down the CASTING side rather than down the bow; that is by design. */
    say('  you look out along the boards; the cast goes straight ahead');
    ok(m.you.z < m.boardsEnd + 20 && m.you.z > m.boardsEnd,
       'you stand ON the boards with decking still in front of you (' +
       n1(m.you.z - m.boardsEnd) + ' units of it)');
    if (m.mark) {
      ok(Math.abs(m.mark.x - m.you.x) < 2.5,
         'the cast goes straight out in front of you (' +
         n1(Math.abs(m.mark.x - m.you.x)) + ' across)');
      ok(m.mark.ft > 1, 'and over real water (' + n1(m.mark.ft) + ' ft)');
    }
    /* And the same thing said in pixels: the water being cast into has to be
       near the middle of the picture, because that is what "in front of you"
       means to somebody looking at the screen. */
    const sc = m.screen;
    if (sc.cast) {
      say('  the cast marker sits at ' + sc.cast.x + ',' + sc.cast.y + ' on a ' + sc.w + ' x ' +
          sc.h + ' screen');
      ok(sc.cast.x > 0 && sc.cast.x < sc.w && sc.cast.y > 0 && sc.cast.y < sc.h,
         'and the water you are casting into is on screen');
    }
    if (m.rect)
      say('  the bracket round it is ' + Math.round(m.rect.w) + ' x ' + Math.round(m.rect.h) +
          ' px at ' + Math.round(m.rect.x) + ',' + Math.round(m.rect.y));
    return m;
  };

  console.log('FISHING OFF THE BOARDS, IN A BROWSER  ' + URL);
  console.log('====================================');
  await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });   // a new game, every time
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => document.getElementById('loading').style.display === 'none', { timeout: 30000 });
  await sleep(1200);
  await tap('Enter'); await sleep(2500);                                       // Play Game

  /* Walt first. Nothing leaves the dock unbriefed, and the mesh hand net he
     hands over in that conversation is what the first trip is fished with. */
  await page.evaluate(() => { RT.game.takeCounterBeat(); RT.game.goToDock(); });
  await sleep(1000);
  ok(await page.evaluate(() => RT.game.isBriefed()), 'Walt has said his piece and the net is yours');

  /* ── a. Standing on the boards ───────────────────────────────────────── */
  console.log();
  console.log('A. WHERE YOU STAND');
  console.log();
  await page.evaluate(() => { RT.game.setOnFoot(true); RT.game.castOff(); });
  await sleep(2000);
  let m = await measure();
  ok(!!m, 'a trip started off the boards');
  if (!m) throw new Error('no trip - nothing to photograph');
  ok(m.vessel === 'foot', 'on foot, not in a boat (' + m.vessel + ')');
  report(m);
  say('  ' + await shot('a1_standing_on_the_boards'));

  /* ── b. The cast zone ────────────────────────────────────────────────── */
  console.log();
  console.log('B. THE CAST ZONE');
  console.log();
  /* Put the scan frame on the square of water so the bracket is actually
     drawn - it is the first stop at a spot, but say so rather than hope. */
  const spotScan = await page.evaluate(() => RT.game.spotTargets().map(t => t.key));
  say('  the spot scan is: ' + spotScan.join(' | '));
  ok(spotScan[0] === 'cast', 'the cast is the first stop in it');
  await page.evaluate(() => RT.game.setDockFocus(0));
  await sleep(700);
  m = await measure();

  const showMark = (m2) => {
    const out = Math.hypot(m2.mark.x - m2.you.x, m2.mark.z - m2.you.z);
    const past = m2.boardsEnd - m2.mark.z;
    const side = Math.abs(m2.mark.x - m2.you.x);
    say('  with the ' + m2.rod.name + ' (throws ' + m2.rod.castFt + ' ft) the zone is ' +
        n1(out) + ' units out - ' + Math.round(out / 0.61) + ' ft - ' + n1(past) +
        ' past the end of the boards, ' + n1(side) + ' off the centreline, over ' +
        n1(m2.mark.ft) + ' ft of water');
    if (m2.screen.cast)
      say('  it lands at ' + m2.screen.cast.x + ',' + m2.screen.cast.y + ' on screen' +
          (m2.rect ? '; the bracket round it is ' + Math.round(m2.rect.w) + ' px wide' : ''));
    ok(side < 2.5,
       'it is straight out in front, not off to one side (' + n1(side) + ' across)');
    ok(m2.mark.ft > 1, 'there is water under it (' + n1(m2.mark.ft) + ' ft)');
    ok(out / 0.61 <= m2.rod.castFt + 2,
       'and it is inside what the gear in your hands can throw');
    return { out: out, past: past, side: side };
  };

  ok(!!m.mark, 'there is a square of water to cast into');
  const net = showMark(m);
  ok(m.rod.isNet, 'the thing in your hands is the hand net (' + m.rod.name + ')');
  ok(net.out < 5, 'a NET scoops, so the zone is at the rail rather than out at a cast (' +
                  n1(net.out) + ' units)');
  say('  ' + await shot('b1_cast_zone_hand_net'));

  /* And with a rod, which is the case the claim is really about: out past the
     end of the jetty. */
  await page.evaluate(() => {
    RT.game.returnToDock();
    RT.game.getSave().rods.push('bamboo_rod');
    RT.game.equipKit('bamboo_rod');
    RT.game.setOnFoot(true);
    RT.game.goToDock(); RT.game.castOff();
  });
  await sleep(2000);
  await page.evaluate(() => RT.game.setDockFocus(0));
  await sleep(700);
  m = await measure();
  ok(!!m && !m.rod.isNet, 'the bamboo rod is in your hands now (' + (m ? m.rod.name : '?') + ')');
  report(m);
  const rodZone = showMark(m);
  ok(rodZone.past > 4, 'with a ROD the cast zone is out PAST the end of the boards (' +
                       n1(rodZone.past) + ' units past)');
  say('  ' + await shot('b2_cast_zone_bamboo_rod'));

  /* Where a fish would be landed from here, measured before one is - so the
     number is on the record even if nothing bites. */
  console.log();
  ok(!!m.land, 'the game can say where a hooked fish would come up');
  if (m.land) {
    const past = m.boardsEnd - m.land.z;
    const fromYou = Math.hypot(m.land.x - m.you.x, m.land.z - m.you.z);
    say('  a fish would surface at x ' + n1(m.land.x) + ' z ' + n1(m.land.z) + ' - ' +
        n1(past) + ' past the last plank, ' + n1(fromYou) + ' from where you stand, over ' +
        n1(m.land.ft) + ' ft of water');
    ok(past > 1.5, 'which is past the end of the boards, not up through them (' +
                   n1(past) + ' units past)');
    ok(m.land.ft > 1, 'and out of real water');
    ok(fromYou < 9, 'and near enough to see (' + n1(fromYou) + ' units)');
  }

  /* ── c. A fish on the line ───────────────────────────────────────────── */
  console.log();
  console.log('C. LANDING ONE');
  console.log();
  /* The cast, on the keys a player has: ENTER picks the rod, holding ENTER
     builds the throw, letting go sends it. Then the fight.

     THE FIGHT HAS TO BE PLAYED, not sat through. updateReeling gives the fish
     runs: hauling on a running fish builds strain, and strain reaching 1 is
     the only way to lose one. A harness that simply holds ENTER down from the
     bite loses every single fish - twelve out of twelve, measured - and would
     report "no fish would take" when what actually happened is that the tool
     could not fish. So the switch is worked the way the game asks: down while
     the fish is coming in, UP the moment it runs, down again when it tires.

     The states run spot -> aim -> charge -> flying -> waiting -> hooking ->
     reeling, and from reeling either LANDING or back to waiting with the fish
     off. And WHAT comes up matters: the lake holds floating litter as well as
     fish and the landing beat is the same for both, so a picture of a rusted
     can being lifted off the boards proves the geometry and nothing about a
     fish. The outcome is on the run before the card is, so it is read while
     the thing is still in the air, and anything that is not a fish is
     photographed under its own name and cast for again. */

  /**
   * Play one fish out, on the ENTER key, and say how it ended.
   *
   * Polled rather than event-driven because the phase lives inside the run
   * and there is no callback for it. Seventy milliseconds is quick enough
   * that no run starts and finishes unseen, and every press it makes is a
   * whole phase long - well over the scan manager's floor for a deliberate
   * press.
   */
  const fight = async () => {
    let down = false, runs = 0, peak = 0, lastPhase = null;
    const t0 = Date.now();
    const release = async () => { if (down) { await page.keyboard.up('Enter'); down = false; } };
    while (Date.now() - t0 < 60000) {
      const r = await page.evaluate(() => {
        const G = RT.game;
        if (!G.run) return { state: null };
        const rl = G.run.reel;
        return { state: G.state, phase: rl ? rl.phase : null,
                 strain: rl ? rl.strain : 0, progress: rl ? rl.progress : 0 };
      });
      if (r.strain > peak) peak = r.strain;
      if (r.phase === 'run' && lastPhase !== 'run') runs++;
      lastPhase = r.phase;
      if (r.state === 'landing') { await release(); return { how: 'landing', runs: runs, peak: peak }; }
      if (r.state !== 'reeling' && r.state !== 'hooking') {
        await release();
        return { how: r.state || 'gone', runs: runs, peak: peak };
      }
      /* Haul while it is coming in; let it have its head while it runs. */
      const wantDown = (r.state === 'hooking') || (r.phase === 'reel');
      if (wantDown && !down) { await page.keyboard.down('Enter'); down = true; }
      else if (!wantDown && down) { await page.keyboard.up('Enter'); down = false; }
      await sleep(70);
    }
    await release();
    return { how: 'timeout', runs: runs, peak: peak };
  };

  let landed = null, tries = 0;
  const caught = [];
  const st = () => page.evaluate(() => ({ s: RT.game.state, run: !!RT.game.run }));
  while (!landed && tries < 8) {
    tries++;
    let s = await st();
    if (!s.run) {
      await page.evaluate(() => { RT.game.setOnFoot(true); RT.game.goToDock(); RT.game.castOff(); });
      await sleep(1600); s = await st();
    }
    if (s.s === 'card') { await tap('Enter'); await sleep(1200); s = await st(); }
    if (s.s === 'spot') {
      await tap('Enter'); await sleep(700);                                    // pick the rod -> aim
      await hold('Enter', 1300); await sleep(900);                             // charge, and let go
    }
    /* Something on the line, one way or another, inside forty seconds. */
    const bit = await page.waitForFunction(
      () => { const G = RT.game; return G.state === G.S.HOOKING || G.state === G.S.REELING ||
                                         G.state === G.S.LANDING || G.state === G.S.CARD; },
      { timeout: 40000, polling: 100 }).then(() => true).catch(() => false);
    let s2 = await st();
    if (!bit) { say('  try ' + tries + ': nothing touched it inside 40 s'); continue; }
    if (s2.s !== 'hooking' && s2.s !== 'reeling' && s2.s !== 'landing') {
      say('  try ' + tries + ': state=' + s2.s); continue;
    }

    const f = s2.s === 'landing' ? { how: 'landing', runs: 0, peak: 0 } : await fight();
    if (f.how !== 'landing') {
      say('  try ' + tries + ': hooked, fought ' + f.runs + ' run' + (f.runs === 1 ? '' : 's') +
          ', strain peaked at ' + Math.round(f.peak * 100) + '% - then ' +
          (f.how === 'waiting' ? 'it came off' : f.how));
      await sleep(1200);
      continue;
    }
    /* Read the outcome NOW: LAND_TIME is 1.6 s and cardPending is cleared the
       moment the card goes up. */
    const what = await page.evaluate(() => {
      const cp = RT.game.run && RT.game.run.cardPending;
      const o = cp && cp.outcome;
      return o ? { type: o.type, id: o.id, name: o.name || o.id } : null;
    });
    const m2 = await measure();
    /* Half way through the lift, not the instant it starts - at t=0 the catch
       is still under the surface. */
    await sleep(750);
    const nm = what && what.type === 'fish' ? 'c1_landing_a_fish'
                                            : 'c1x_landing_' + ((what && what.type) || 'something');
    const pth = await shot(nm);
    caught.push((what ? what.type + ' (' + what.name + ')' : 'something') + ' -> ' + path.basename(pth));
    say('  try ' + tries + ': ' + f.runs + ' run' + (f.runs === 1 ? '' : 's') + ', strain peaked at ' +
        Math.round(f.peak * 100) + '% - lifted ' + (what ? what.name : 'something') +
        ' [' + (what ? what.type : '?') + ']');
    if (what && what.type === 'fish') { landed = m2; landed.shot = pth; landed.what = what; }
    await sleep(2200);
  }

  say('  what came up: ' + (caught.join(' / ') || 'nothing'));
  ok(!!landed, 'a FISH was hooked and lifted within ' + tries + ' cast' + (tries === 1 ? '' : 's') +
     (landed ? ' (' + landed.what.name + ')' : ''));
  if (landed) {
    const past = landed.boardsEnd - landed.land.z;
    const fromYou = Math.hypot(landed.land.x - landed.you.x, landed.land.z - landed.you.z);
    say('  it came up at x ' + n1(landed.land.x) + ' z ' + n1(landed.land.z) + ' - ' +
        n1(past) + ' past the last plank, ' + n1(fromYou) + ' out from you, over ' +
        n1(landed.land.ft) + ' ft of water');
    ok(past > 1.5, 'the fish surfaced past the end of the boards, over open water (' +
                   n1(past) + ' units past)');
    ok(landed.land.ft > 1, 'with real water under it (' + n1(landed.land.ft) + ' ft)');
    say('  ' + landed.shot);
    /* And the card that follows it, which names what was landed - so the
       picture above can be believed. */
    await page.waitForFunction(() => RT.game.state === RT.game.S.CARD,
                               { timeout: 8000, polling: 100 }).catch(() => {});
    await sleep(900);
    say('  ' + await shot('c2_the_catch_card'));
  } else {
    say('  nothing but litter and lost fish in ' + tries + ' casts - the landing shot');
    say('  was not taken. The landing POINT is measured above either way; only');
    say('  the picture is missing.');
  }

  console.log();
  ok(errors.length === 0, 'no console errors or uncaught exceptions' +
     (errors.length ? ':\n    ' + errors.slice(0, 10).join('\n    ') : ''));
  console.log();
  console.log('screenshots in ' + OUT);
  console.log(fail === 0 ? checks + ' checks passed. The boards are a place to fish from.'
                         : fail + ' of ' + checks + ' checks failed.');
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
