/**
 * Walt's map of the lake, the Options button, and the tackle box - opened the
 * way a player opens them, and photographed.
 *
 *     python -m http.server 8765 --bind 127.0.0.1      (from bennyshub/)
 *     node tools/mapshot.js [outDir]
 *
 * Same headless Chrome + puppeteer-core setup as tools/dockshot.js.
 *
 * tools/mapcheck.js already asks the game whether the chart is true - whether
 * "The Shallows" is written over four feet of water and not over forty. This
 * asks two things the node harness cannot: whether a player with two switches
 * can GET to it, and whether what it draws is legible. So it plays in, on real
 * keys - SPACE steps the scan, ENTER picks - to the tackle counter, hears Walt
 * out until the map changes hands, walks back down to the dock, steps the dock
 * scan round to Options, opens it, opens the map, and takes its picture.
 *
 * What it is here to prove:
 *
 *   1. The pause menu is Options - the button says so, the button wears a
 *      GEAR rather than a hamburger, and the card's own art is a gear too.
 *   2. Options is the last stop in the scan of every scene, not just out on
 *      the water. Checked scene by scene. Trolling is the exception and is
 *      REPORTED rather than asserted: under way the switches are the tiller,
 *      so there is no scan to step and the button is the only way in. The
 *      button is asserted.
 *   3. The Map of the Lake row appears only once Walt has handed the map
 *      over, so the card is read both before the conversation and after -
 *      and a save that was already twelve jobs deep when the map was added
 *      to the game gets one on load, without having to hear Walt again.
 *   4. The map closes on ENTER, on a real mouse click of Close Map, and on
 *      ESCAPE. The click is page.mouse.click and not a synthesised event,
 *      because that button once looked live and did nothing.
 *   5. NO TWO LABELS TOUCH. drawMap hands back every label's box, so the
 *      boxes are compared pair by pair - the failure this is guarding is
 *      "You are here" written straight across "The Shoreline".
 *   6. The tackle box is trays, not one long list: three rows plus Back on
 *      the front of it, and each tray its own card holding only that kind of
 *      gear, a tick against the one in the boat, and a way back to the box.
 *
 * Screenshots are the point as much as the checks are: a map can pass every
 * assertion in mapcheck.js and still have its lettering piled up in one
 * corner, and only a picture will say so.
 */
const path = require('path');
const fs = require('fs');

const OUT = process.argv[2] || path.join(process.env.TEMP || '.', 'fishmaster-mapshot');
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
  /* A tap, not a jab: the shared scan manager throws away a press too short
     to have been meant, so anything under its floor never reaches the game. */
  const tap = async (key) => hold(key, 90);

  /** Click a thing in the scene by its target key - hover to focus, click to pick. */
  const clickTarget = async (key) => {
    const px = await page.evaluate((key) => {
      const G = RT.game; const pos = G.dockLabelPositions() || [];
      const i = pos.findIndex(p => p.key === key);
      if (i < 0) return null;
      const lx = pos[i].x, ly = pos[i].y;
      for (let dy = -20; dy < 260; dy += 8) { if (G.pickTarget(lx, ly + dy) === i) return { x: lx, y: ly + dy }; }
      for (let dx = -60; dx <= 60; dx += 20) for (let dy = 0; dy < 260; dy += 12) { if (G.pickTarget(lx + dx, ly + dy) === i) return { x: lx + dx, y: ly + dy }; }
      return null;
    }, key);
    if (!px) return false;
    await page.mouse.move(px.x, px.y); await sleep(250);
    await page.mouse.click(px.x, px.y); await sleep(1400);
    return true;
  };

  /** The art in the corner of whatever card is up. */
  const panelArt = () => page.evaluate(() => {
    const el = document.getElementById('panelArt');
    return { html: (el.innerHTML || '').trim(), text: (el.innerText || '').trim() };
  });

  /** What the Options button says, and whether it is wearing the scan frame. */
  const optionsBtn = () => page.evaluate(() => {
    const el = document.getElementById('pauseBtn');
    const cs = getComputedStyle(el);
    return { text: (el.innerText || '').replace(/\s+/g, ' ').trim(), html: el.innerHTML,
             shown: cs.display !== 'none', focused: el.classList.contains('focused') };
  });

  /** The rows of whatever card is up, and which one has focus. */
  const card = () => page.evaluate(() => ({
    on: document.getElementById('overlay').classList.contains('on'),
    title: (document.getElementById('panelTitle').innerText || '').trim(),
    rows: Array.from(document.querySelectorAll('#panelMenu .menuItem'))
      .map(e => (e.innerText || '').replace(/\s+/g, ' ').trim()),
    focusedRow: (function () {
      const els = Array.from(document.querySelectorAll('#panelMenu .menuItem'));
      const i = els.findIndex(e => e.classList.contains('focused'));
      return i < 0 ? null : { i: i, text: (els[i].innerText || '').replace(/\s+/g, ' ').trim() };
    })(),
  }));

  const mapDom = () => page.evaluate(() => {
    const v = document.getElementById('mapView'), c = document.getElementById('mapCanvas'),
          n = document.getElementById('mapName'), x = document.getElementById('mapClose');
    const box = x.getBoundingClientRect();
    return {
      on: v.classList.contains('on'), hidden: v.getAttribute('aria-hidden'),
      shown: getComputedStyle(v).display !== 'none',
      canvas: { w: c.width, h: c.height, cw: c.clientWidth, ch: c.clientHeight },
      name: (n.innerText || '').trim(),
      close: { text: (x.innerText || '').trim(), focused: x.classList.contains('focused'),
               x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) },
      /* Whether anything was actually painted. A canvas that is all one colour
         is a map that did not draw, and it screenshots as a clean blue box. */
      inked: (function () {
        try {
          const g = c.getContext('2d');
          const d = g.getImageData(0, 0, c.width, c.height).data;
          const seen = {};
          for (let i = 0; i < d.length; i += 4 * 97) seen[d[i] + ',' + d[i + 1] + ',' + d[i + 2]] = 1;
          return Object.keys(seen).length;
        } catch (e) { return -1; }
      })(),
    };
  });

  /** Step the scan with SPACE until the Options button lights up. */
  const scanToOptions = async (limit) => {
    for (let i = 0; i < (limit || 12); i++) {
      if ((await optionsBtn()).focused) return i;
      await tap('Space'); await sleep(320);
    }
    return (await optionsBtn()).focused ? limit : -1;
  };

  /** Step the card's scan with SPACE until a row matching re has focus. */
  const scanToRow = async (re, limit) => {
    for (let i = 0; i < (limit || 12); i++) {
      const c = await card();
      if (c.focusedRow && re.test(c.focusedRow.text)) return c.focusedRow;
      await tap('Space'); await sleep(300);
    }
    return null;
  };

  /* Out of whatever card is up and back into the scene behind it. Every card
     in this game has a way back on it; find it, press it, and keep going
     until the world is on screen again. Reaching in and calling goToDock()
     instead leaves the card up over the dock, and then SPACE and ENTER are
     stepping the CARD's scan - which is how a test aiming for Options once
     opened the fishing log. */
  const BACK = /^(?:←|▶)?\s*(Back|Done|Continue|Close|Thanks|Not now)\b/i;
  const backOut = async (tries) => {
    for (let i = 0; i < (tries || 4); i++) {
      if (!(await card()).on) return true;
      const r = await scanToRow(BACK, 14);
      if (!r) return false;
      await tap('Enter'); await sleep(1200);
    }
    return !(await card()).on;
  };

  console.log('THE MAP OF THE LAKE, IN A BROWSER  ' + URL);
  console.log('==================================');
  await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });   // a new game, every time
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => document.getElementById('loading').style.display === 'none', { timeout: 30000 });
  await sleep(1200);
  ok(/Play Game/i.test((await card()).rows.join(' ')), 'the main menu is up');
  await tap('Enter'); await sleep(2500);                                       // Play Game

  /* ── 1. The button is called Options ─────────────────────────────────── */
  console.log();
  console.log('THE BUTTON');
  console.log();
  let btn = await optionsBtn();
  ok(/Options/.test(btn.text), 'the button says Options (' + JSON.stringify(btn.text) + ')');
  ok(/⚙/.test(btn.html), 'and carries a GEAR (' + JSON.stringify(btn.html) + ')');
  ok(!/☰/.test(btn.html), 'the hamburger is gone from it');
  ok(btn.shown, 'it is on screen at the dock, with no trip running');

  /* ── 2. It is the last stop in every scene's scan ────────────────────── */
  console.log();
  console.log('OPTIONS, SCENE BY SCENE');
  console.log();
  const scans = await page.evaluate(() => {
    const G = RT.game;
    const list = (f) => { try { return (f() || []).map(t => ({ key: t.key, domId: t.domId })); } catch (e) { return null; } };
    return { dock: list(() => G.dockTargets()), shop: list(() => G.shopTargets()) };
  });
  for (const where of ['dock', 'shop']) {
    const l = scans[where];
    say('  ' + where.padEnd(6) + ' ' + (l ? l.map(t => t.key).join(' | ') : '(no scan)'));
    const last = l && l[l.length - 1];
    ok(!!last && last.key === 'options', where + ': Options is the last stop in the scan');
    ok(!!last && last.domId === 'pauseBtn', where + ': and it lives on the Options button');
  }

  /* ── 3. No map before Walt ───────────────────────────────────────────── */
  console.log();
  console.log('BEFORE WALT');
  console.log();
  ok((await scanToOptions()) >= 0, 'the dock scan reaches the Options button on SPACE');
  await tap('Enter'); await sleep(900);
  let c = await card();
  ok(c.on && /^Options$/i.test(c.title), 'ENTER on it opens a card titled Options (' + c.title + ')');
  const art0 = await panelArt();
  ok(/⚙/.test(art0.html), "and the card's own art is a gear too (" + JSON.stringify(art0.text || art0.html) + ')');
  ok(!/☰/.test(art0.html), 'not a hamburger');
  say('  rows: ' + c.rows.join(' / '));
  ok(!c.rows.some(r => /Map of the Lake/i.test(r)), 'there is no Map of the Lake yet - Walt still has it');
  ok(await page.evaluate(() => !RT.game.hasMap()), 'and the game agrees you have no map');
  say('  ' + await shot('01_options_no_map'));
  /* Back out the way it came, so the dock scan is live again for the walk in. */
  ok(await backOut(), 'the card has a way back onto the dock');

  /* ── The walk in: the shop, the counter, and Walt's conversation ─────── */
  console.log();
  console.log('HEARING WALT OUT');
  console.log();
  ok(await clickTarget('shop'), 'walked into the tackle shop');
  ok(await clickTarget('keeper'), 'up to Walt at the counter');
  await tap('Enter'); await sleep(1400);                                       // Talk to Walt
  const turns = [];
  for (let i = 0; i < 10; i++) {
    const st = await page.evaluate(() => ({ briefed: RT.game.isBriefed(), map: RT.game.hasMap(),
      text: (document.getElementById('overlay').innerText || '').replace(/\s+/g, ' ').slice(0, 64) }));
    turns.push(st.text);
    if (st.briefed) break;
    await tap('Enter'); await sleep(1100);
  }
  say('  the brief came in ' + turns.length + ' cards; the last: "' + turns[turns.length - 1] + '"');
  ok(await page.evaluate(() => RT.game.isBriefed()), 'Walt has said his piece');
  ok(await page.evaluate(() => RT.game.hasMap()), 'and the map of the lake changed hands');
  say('  ' + await shot('02_walt_hands_the_map_over'));
  ok(await backOut(), 'off Walt\'s card and back into the shop');             // Thanks, then Back

  /* Options inside the shop, while we are standing in it. */
  const inShop = await page.evaluate(() => RT.game.shopTargets().map(t => t.key));
  ok(inShop[inShop.length - 1] === 'options', 'inside the shop the scan still ends on Options (' + inShop.join(' | ') + ')');
  ok((await scanToOptions()) >= 0, 'and the shop scan reaches the Options button on SPACE');
  say('  ' + await shot('02a_options_focused_in_the_shop'));

  /* ── Back down to the dock, out through the door ─────────────────────── */
  if (!(await clickTarget('door'))) { await page.evaluate(() => RT.game.goToDock()); await sleep(1200); }
  await sleep(800);
  ok(await page.evaluate(() => !RT.game.run && getComputedStyle(document.getElementById('dockHud')).display !== 'none'),
     'back out on the dock, with the map in the pocket');
  say('  ' + await shot('03_dock_with_the_map'));

  /* ── 4. Options at the dock, now with a map in it ────────────────────── */
  console.log();
  console.log('OPENING THE MAP');
  console.log();
  ok((await scanToOptions()) >= 0, 'the dock scan reaches Options again');
  btn = await optionsBtn();
  ok(btn.focused, 'the Options button is wearing the scan frame');
  say('  ' + await shot('04_options_focused_at_the_dock'));
  await tap('Enter'); await sleep(900);
  c = await card();
  ok(c.on && /^Options$/i.test(c.title), 'the Options card is up');
  say('  rows: ' + c.rows.join(' / '));
  const mapRow = c.rows.findIndex(r => /Map of the Lake/i.test(r));
  ok(mapRow >= 0, 'the Map of the Lake is a row on it now');
  ok(mapRow === 1, 'and it sits directly under Continue/Back (row ' + mapRow + ')');
  say('  ' + await shot('05_options_card_with_map'));

  const onMapRow = await scanToRow(/Map of the Lake/i, 10);
  ok(!!onMapRow, 'SPACE steps the scan onto it');
  await tap('Enter'); await sleep(1400);

  let m = await mapDom();
  ok(m.on && m.shown, '#mapView is open (aria-hidden=' + m.hidden + ')');
  ok(m.canvas.cw > 900 && m.canvas.ch > 500,
     'and it covers the screen: ' + m.canvas.cw + ' x ' + m.canvas.ch + ' css px, drawn at ' + m.canvas.w + ' x ' + m.canvas.h);
  ok(m.inked > 20, 'the chart was actually painted (' + m.inked + ' distinct colours sampled)');
  ok(!!m.name, 'the name plate reads "' + m.name + '"');
  ok(m.close.focused, 'Close Map wears the focus ring from the moment it opens');
  say('  Close Map: "' + m.close.text + '" at ' + m.close.x + ',' + m.close.y);
  say('  ' + await shot('06_map_open'));

  /* What the map says it drew, so a picture that looks fine can be checked
     against the lake it claims to be of. */
  const drew = await page.evaluate(() => {
    const st = RT.game.mapState();
    const r = RT.minimap.drawMap(document.getElementById('mapCanvas'), st.chart, st);
    return { labels: (r.labels || []).map(l => ({ text: l.text, kind: l.kind,
               x: Math.round(l.x), y: Math.round(l.y),
               w: Math.round(l.w), h: Math.round(l.h),
               ft: +st.chart.depthAt(l.wx, l.wz).toFixed(1) })),
             scaleFt: r.scaleFt, bands: r.bands,
             size: { w: document.getElementById('mapCanvas').width, h: document.getElementById('mapCanvas').height } };
  });
  console.log();
  console.log('  ' + 'label'.padEnd(24) + 'kind'.padEnd(8) + 'x'.padStart(6) + 'y'.padStart(6) +
              'w'.padStart(6) + 'h'.padStart(5) + 'depth ft'.padStart(10));
  drew.labels.forEach(l => console.log('  ' + l.text.padEnd(24) + String(l.kind).padEnd(8) +
    String(l.x).padStart(6) + String(l.y).padStart(6) + String(l.w).padStart(6) +
    String(l.h).padStart(5) + String(l.ft).padStart(10)));
  console.log();
  const water = drew.labels.filter(l => l.kind === 'water');
  ok(water.length === 4, 'four waters are named on it (' + water.map(l => l.text).join(', ') + ')');
  ok(drew.labels.some(l => l.kind === 'dock'), "Walt's dock is marked");
  ok(drew.labels.some(l => l.kind === 'you'), 'and so are you');
  drew.labels.forEach(l => ok(l.x > 0 && l.x < drew.size.w && l.y > 0 && l.y < drew.size.h,
    '"' + l.text + '" is inside the paper, not off the edge'));

  /* NO TWO LABELS TOUCH. drawMap hands back the box each label claimed, so
     the boxes can be laid against one another - which is the only way to
     catch "You are here" written straight across "The Shoreline" short of
     reading the picture. Two boxes overlap when they overlap on BOTH axes. */
  const over = [];
  for (let i = 0; i < drew.labels.length; i++)
    for (let j = i + 1; j < drew.labels.length; j++) {
      const a = drew.labels[i], b = drew.labels[j];
      const dx = (a.w + b.w) / 2 - Math.abs(a.x - b.x);
      const dy = (a.h + b.h) / 2 - Math.abs(a.y - b.y);
      if (dx > 0 && dy > 0)
        over.push('"' + a.text + '" x "' + b.text + '" (' + Math.round(dx) + ' x ' + Math.round(dy) + ' px)');
    }
  ok(over.length === 0, 'no two labels overlap' + (over.length ? ':\n    ' + over.join('\n    ') :
     ' - ' + drew.labels.length + ' boxes, all clear'));

  /* And each water's name fits the water it names: the size is chosen from the
     room the distance transform found, so a name wider than its own band is
     the bug this is watching for. */
  drew.labels.filter(l => l.kind === 'water').forEach(l =>
    ok(l.w < drew.size.w * 0.42, '"' + l.text + '" is not sprawling across the lake (' +
       Math.round(l.w) + ' px of ' + drew.size.w + ')'));

  /* ── 5. Three ways to close it ───────────────────────────────────────── */
  console.log();
  console.log('CLOSING IT');
  console.log();
  await tap('Enter'); await sleep(1000);
  m = await mapDom(); c = await card();
  ok(!m.on && !m.shown, 'ENTER closes the map');
  ok(c.on && /^Options$/i.test(c.title), 'and puts you back on the Options card');
  say('  ' + await shot('07_options_after_closing'));

  const reopen = async (how) => {
    const r = await scanToRow(/Map of the Lake/i, 10);
    if (!r) return false;
    await tap('Enter'); await sleep(1200);
    return (await mapDom()).on;
  };
  ok(await reopen(), 'the map opens a second time');
  const at = (await mapDom()).close;
  /* A real mouse click, not a synthesised pointerdown/up pair: U.addTap wires
     'click', so anything short of one proves nothing about a finger. */
  const under = await page.evaluate((p) => { const e = document.elementFromPoint(p.x, p.y); return e ? (e.id || e.className || e.tagName) : null; }, at);
  await page.mouse.click(at.x, at.y); await sleep(1000);
  m = await mapDom();
  ok(!m.on, 'clicking Close Map closes it (clicked ' + at.x + ',' + at.y + ', topmost there is "' + under + '")');
  if (m.on) { await page.keyboard.press('Escape'); await sleep(900); }

  ok(await reopen(), 'the map opens a third time');
  await page.keyboard.press('Escape'); await sleep(1000);
  m = await mapDom();
  ok(!m.on, 'ESCAPE closes it too');
  c = await card();
  ok(c.on && /^Options$/i.test(c.title), 'and again lands on Options');
  say('  ' + await shot('08_options_final'));

  /* ── 6. Out on the water: at a spot, and while trolling ──────────────── */
  console.log();
  console.log('OUT ON THE WATER');
  console.log();
  ok(await backOut(), 'out of Options and back onto the dock');
  await page.evaluate(() => { RT.game.castOff(); }); await sleep(1600);
  const spot = await page.evaluate(() => RT.game.spotTargets().map(t => ({ key: t.key, domId: t.domId })));
  say('  spot   ' + spot.map(t => t.key).join(' | '));
  ok(spot.length && spot[spot.length - 1].key === 'options', 'at a fishing spot Options is the last stop in the scan');
  ok(spot.length && spot[spot.length - 1].domId === 'pauseBtn', 'and it is on the Options button');
  say('  ' + await shot('09_spot_options'));

  /* Trolling. A canoe, under way, steering - which is the one scene where the
     switches are the tiller, so what "in the scan" means here is the question
     and not an assumption. */
  await page.evaluate(() => {
    const sv = RT.game.getSave();
    if (RT.game.run) RT.game.returnToDock();
    sv.currentMission = 6; sv.highestMission = 6; sv.briefed = 6; sv.money = 400;
    RT.game.buyVessel('canoe'); RT.game.goToDock(); RT.game.castOff();
  });
  await sleep(1200);
  await hold('Enter', 2200); await sleep(2500);
  const troll = await page.evaluate(() => ({
    state: RT.game.state, vessel: RT.game.vessel().id,
    btn: { shown: getComputedStyle(document.getElementById('pauseBtn')).display !== 'none',
           text: (document.getElementById('pauseBtn').innerText || '').replace(/\s+/g, ' ').trim() },
  }));
  say('  trolling in the ' + troll.vessel + ', state=' + troll.state);
  ok(troll.state === 'steer', 'the canoe is under way');
  ok(troll.btn.shown && /Options/.test(troll.btn.text), 'the Options button is on screen while trolling');
  say('  ' + await shot('10_trolling'));
  /* Twelve taps of SPACE, which is more than any scene's scan is long. If
     Options is a stop in the trolling scan the frame lands on it inside that;
     if the switches are the tiller and nothing else, it never will.

     It never will: js/ui.js handles S.STEER by flipping the armed side and
     returning, so under way the switch IS the tiller and there is no scan to
     step. That is a deliberate design and not a regression, so this is
     reported rather than failed - but it is reported every run, because it
     means a two-switch player mid-troll can only reach Options by first
     pulling over. The thing that MUST hold is the one checked below: a finger
     on the button opens it from anywhere. */
  const trollScan = await scanToOptions(12);
  say('  NOTE  ' + (trollScan < 0
      ? 'SPACE never reaches Options while trolling - 12 taps only steered. Under'
        + '\n        way the switches are the tiller (js/ui.js, case S.STEER), so the'
        + '\n        only way in is the button. By design; worth knowing.'
      : 'SPACE brings the scan round to Options while trolling in ' + trollScan + ' steps.'));
  /* Whatever the switches do, a finger on the button has to work. */
  const afloatBefore = await page.evaluate(() => RT.game.state);
  const bpos = await page.evaluate(() => {
    const b = document.getElementById('pauseBtn').getBoundingClientRect();
    return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) };
  });
  await page.mouse.click(bpos.x, bpos.y);
  await sleep(1200);
  c = await card();
  ok(c.on && /^Options$/i.test(c.title), 'tapping the button mid-troll opens Options (' + c.title + ', was ' + afloatBefore + ')');
  ok(c.rows.some(r => /Map of the Lake/i.test(r)), 'with the map on it');
  say('  rows: ' + c.rows.join(' / '));
  say('  ' + await shot('11_options_mid_troll'));
  const r2 = await scanToRow(/Map of the Lake/i, 10);
  if (r2) { await tap('Enter'); await sleep(1400); }
  m = await mapDom();
  ok(m.on, 'and the map opens over the trip');
  if (m.on) {
    const you = await page.evaluate(() => { const s = RT.game.mapState(); return { label: s.label, x: Math.round(s.x), z: Math.round(s.z) }; });
    say('  the marker says: "' + you.label + '" at ' + you.x + ', ' + you.z);
    say('  ' + await shot('12_map_from_a_trip'));
  }

  /* ── 7. A save that was already in progress ─────────────────────
     Walt hands the map over at the end of the first conversation - which
     somebody twelve jobs deep has already had, and will never have again.
     Doctor the stored save to look like theirs: briefed, but from before the
     map existed. On the next load they should have one anyway. */
  console.log();
  console.log('A SAVE ALREADY IN PROGRESS');
  console.log();
  const doctored = await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('rt-fishmaster') || '{}');
    raw.hasMap = false;                       // as if the map had never been added
    raw.briefed = 4; raw.currentMission = 4; raw.highestMission = 4;
    raw.money = 300;
    raw.rods = ['hand_net', 'bamboo_rod'];
    /* Lures, because the box only grows a Lures tray when there is something
       to put in it - and "three trays" is the thing being checked. */
    raw.baits = ['earthworm', 'shiner_bait'];
    raw.vessel = 'foot'; raw.vessels = ['foot'];
    localStorage.setItem('rt-fishmaster', JSON.stringify(raw));
    return { hasMap: raw.hasMap, briefed: raw.briefed, version: raw.version };
  });
  say('  stored: ' + JSON.stringify(doctored));
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => document.getElementById('loading').style.display === 'none', { timeout: 30000 });
  await sleep(1200);
  const reloaded = await page.evaluate(() => ({
    hasMap: RT.game.hasMap(), briefed: RT.game.getSave().briefed,
    stored: JSON.parse(localStorage.getItem('rt-fishmaster') || '{}').hasMap,
  }));
  ok(reloaded.briefed >= 1, 'the doctored save came back briefed (' + reloaded.briefed + ')');
  ok(reloaded.hasMap, 'and it has a map, without hearing Walt out again (hasMap=' + reloaded.hasMap + ')');
  await tap('Enter'); await sleep(2500);                                       // Play Game
  ok((await scanToOptions()) >= 0, 'the dock scan reaches Options');
  await tap('Enter'); await sleep(900);
  c = await card();
  ok(c.rows.some(r => /Map of the Lake/i.test(r)),
     'and the Map of the Lake is on the card for the old save too');
  say('  rows: ' + c.rows.join(' / '));
  say('  ' + await shot('13_options_old_save'));
  ok(await backOut(), 'out of Options and back onto the dock');

  /* ── 8. The tackle box, in trays ──────────────────────────────
     It used to be one list of everything with headings between - fifteen rows
     on a card built for eight, all of them taking their turn in the scan. Now
     it is a box with three trays, and the thing to check is that the front of
     it is short and each tray holds only its own kind. */
  console.log();
  console.log('THE TACKLE BOX');
  console.log();
  ok(await clickTarget('shop'), 'walked into the tackle shop');
  /* THE WALL, NOT THE COUNTER. The counter is where a job is handed in and
     the next one's gear is bought; the box is what goes in the boat, and it
     opens from the wall it hangs on. */
  ok(await clickTarget('tackle'), 'over to the tackle wall');
  const boxRow = await scanToRow(/Tackle Box/i, 14);
  ok(!!boxRow, 'the tackle wall offers the tackle box (' + (boxRow ? boxRow.text : 'never found') + ')');
  await tap('Enter'); await sleep(1200);
  c = await card();
  ok(c.on && /Tackle Box/i.test(c.title), 'the box is open (' + c.title + ')');
  say('  rows: ' + c.rows.join(' / '));
  /* TWO TRAYS AND BACK. It was three - rods, lures, and what is on the line -
     until a player pointed out that lures and what is on the line are the
     same list, because you can only have one thing on it. */
  ok(c.rows.length === 3, 'the front of the box is three rows - two trays and Back (' + c.rows.length + ')');
  ['Rod', 'Line'].forEach(t =>
    ok(c.rows.some(r => new RegExp(t, 'i').test(r)), 'there is a ' + t + ' tray'));
  ok(/Back/i.test(c.rows[c.rows.length - 1]), 'and Back is the last row');
  say('  ' + await shot('14_tackle_box'));

  const rodsRow = await scanToRow(/Rods/i, 10);
  ok(!!rodsRow, 'SPACE steps the scan onto Rods');
  await tap('Enter'); await sleep(1200);
  c = await card();
  ok(c.on && /^Rods$/i.test(c.title), 'the Rods tray is its own card (' + c.title + ')');
  say('  rows: ' + c.rows.join(' / '));
  const ticked = c.rows.filter(r => /\u2713/.test(r));
  ok(ticked.length === 1, 'exactly one rod is ticked as the one in the boat (' +
     (ticked.join(', ') || 'none ticked') + ')');
  ok(c.rows.some(r => /Back to the Box/i.test(r)), 'and there is a way back to the box');
  ok(!c.rows.some(r => /Lure|Worm|Magnet/i.test(r)), 'no lures or tools have wandered into the rod tray');
  say('  ' + await shot('15_tackle_tray_rods'));

  /* The way back, and then one more tray, so "each opens its own card" is
     shown rather than assumed from one. */
  const backRow = await scanToRow(/Back to the Box/i, 12);
  ok(!!backRow, 'the scan reaches Back to the Box');
  await tap('Enter'); await sleep(1100);
  c = await card();
  ok(/Tackle Box/i.test(c.title), 'it lands back on the box (' + c.title + ')');
  const lineRow = await scanToRow(/On the Line/i, 12);
  if (lineRow) {
    await tap('Enter'); await sleep(1100);
    c = await card();
    ok(/On the Line/i.test(c.title), 'the On the Line tray opens too (' + c.title + ')');
    say('  rows: ' + c.rows.join(' / '));
    say('  ' + await shot('16_tackle_tray_online'));
  }

  console.log();
  ok(errors.length === 0, 'no console errors or uncaught exceptions' +
     (errors.length ? ':\n    ' + errors.slice(0, 10).join('\n    ') : ''));
  console.log();
  console.log('screenshots in ' + OUT);
  console.log(fail === 0 ? checks + ' checks passed. Options and the map work in a browser.'
                         : fail + ' of ' + checks + ' checks failed.');
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('mapshot crashed:', e); process.exit(1); });
