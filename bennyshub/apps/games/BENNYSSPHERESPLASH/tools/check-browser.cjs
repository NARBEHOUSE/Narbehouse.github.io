#!/usr/bin/env node
/* Benny's Sphere Splash - the real game in headless Chrome, driven by real key events.
 * No npm dependencies (Baseball's art/check_browser.js pattern: spawn Chrome, talk CDP).
 *
 *   node tools/check-browser.cjs [path-to-chrome]
 *
 * What it proves (plan §9):
 *  - the page boots with no exceptions, and every card fits with no scrolling at
 *    1920x1008, 1368x840 and 1024x768;
 *  - at every decision the clock and every swimmer stay frozen, and every plate of the
 *    choice cluster is wholly on screen and overlaps no other plate;
 *  - Space/Enter menus fire on release; hold Space scans backwards; a tap in live play
 *    opens the Huddle; holding Enter shows the ring and then opens Pause, and its
 *    release is swallowed; Pause from a decision comes back to the same choice;
 *  - with Auto Scan on, Enter alone gets from the main menu through a match's decisions;
 *  - commentary is never spoken while a choice is on screen, and every line is captioned;
 *  - a match saved mid-play resumes at exactly the same moment after a reload;
 *  - a whole Quick Game plays to the results card, and every goal in it gets its
 *    moment (the banner, the scorer celebrating, the replay) and play goes on after it;
 *  - a real press during a goal replay skips it and opens no Huddle; so does one
 *    during the kickoff sweep.
 * Screenshots go to the system temp folder, never into this served folder.
 */
'use strict';
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), os = require('node:os');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '../../../..');          // bennyshub/
const out = path.join(os.tmpdir(), 'sphere-splash-review');
const GAME = '/apps/games/BENNYSSPHERESPLASH/index.html';
const wait = ms => new Promise(r => setTimeout(r, ms));
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end(); return; }
  res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-store');
  fs.createReadStream(file).pipe(res);
});

let fails = 0;
const check = (name, ok, detail) => { console.log((ok ? '  PASS ' : '  FAIL ') + name + (detail ? '  - ' + detail : '')); if (!ok) fails++; };

function findChrome() {
  const arg = process.argv.slice(2).find(a => !a.startsWith('--'));
  const list = [arg, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
  return list.find(p => p && fs.existsSync(p));
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'sphere-splash-chrome-'));
  const exe = findChrome();
  if (!exe) { console.error('No Chrome or Edge found. Pass the path: node tools/check-browser.cjs <chrome.exe>'); process.exit(2); }
  const chrome = spawn(exe, ['--headless=new', '--mute-audio', '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
    '--remote-debugging-port=0', '--user-data-dir=' + profile, '--window-size=1368,840', '--autoplay-policy=no-user-gesture-required',
    '--enable-unsafe-swiftshader', 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  const portFile = path.join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 150 && !fs.existsSync(portFile); i++) await wait(100);
  const port = Number(fs.readFileSync(portFile, 'utf8').split('\n')[0]);
  const targets = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
  const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map(), exceptions = [];
  ws.onmessage = e => {
    const msg = JSON.parse(e.data);
    if (msg.method === 'Runtime.exceptionThrown') exceptions.push(msg.params.exceptionDetails.exception ? msg.params.exceptionDetails.exception.description : msg.params.exceptionDetails.text);
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') exceptions.push(msg.params.args.map(a => a.value || a.description).join(' '));
    if (msg.id) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.reject(msg.error) : p.resolve(msg.result); }
  };
  const call = (method, params = {}) => new Promise((res, rej) => { pending.set(++id, { resolve: res, reject: rej }); ws.send(JSON.stringify({ id, method, params })); });
  const evaluate = async expr => {
    const r = await call('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw Error(expr.slice(0, 80) + ': ' + JSON.stringify(r.exceptionDetails.exception || r.exceptionDetails.text));
    return r.result.value;
  };
  const until = async (expr, timeout = 30000) => {
    for (let t = 0; t < timeout; t += 100) { if (await evaluate(expr)) return true; await wait(100); }
    throw Error('Timed out waiting for: ' + expr);
  };
  const shot = async name => { const s = await call('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(out, name), Buffer.from(s.data, 'base64')); };
  const size = (w, h) => call('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  const KEYS = { Space: { key: ' ', code: 'Space', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32 },
    Enter: { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 } };
  const keyDown = k => call('Input.dispatchKeyEvent', Object.assign({ type: 'keyDown' }, KEYS[k]));
  const keyUp = k => call('Input.dispatchKeyEvent', Object.assign({ type: 'keyUp' }, KEYS[k]));
  const press = async (k, hold = 90, after = 320) => { await keyDown(k); await wait(hold); await keyUp(k); await wait(after); };
  const ui = () => evaluate('(() => { const d = SS.ui.__dbg(); return { ctx: d.ctx, screen: d.screen, index: d.index, row: d.rows[d.index] || "" }; })()');
  const load = async () => {
    await call('Page.navigate', { url: 'http://127.0.0.1:' + server.address().port + GAME });
    await until('!!(window.SS && SS.ui && SS.ui.screen === "title")', 60000);
    // Record every commentary line the system voice is asked to say, what was on screen, and which match.
    await evaluate(`window.__said = JSON.parse(sessionStorage.getItem('__said') || '[]').map(s => Object.assign(s, { m: -1 })); addEventListener('pagehide', () => sessionStorage.setItem('__said', JSON.stringify(__said))); (() => { const f = SS.util.speakAs; SS.util.speakAs = function (t, o) { __said.push({ t, ctx: SS.ui.context(), m: __match }); return f.apply(this, arguments); }; })();
      // The caption history starts again with each match, so the caption check counts this match's lines only
      // (lines from before a reload are m -1: no match here).
      window.__match = 0; (() => { const r = SS.broadcast.reset; SS.broadcast.reset = function () { __match++; return r.apply(this, arguments); }; })(); true`);
  };

  try {
    await call('Runtime.enable'); await call('Page.enable');
    // Silent while it runs: --mute-audio covers game sound, and the system voice speaks at volume 0
    // (same timing, so the speech checks still hold).
    await call('Page.addScriptToEvaluateOnNewDocument', { source: '(() => { const s = window.speechSynthesis; if (!s) return; const f = s.speak.bind(s); s.speak = u => { u.volume = 0; return f(u); }; })()' });
    await size(1368, 840);
    await load();
    await evaluate('localStorage.clear(); SS.save.resetAll(); true');
    await load();
    check('boots to the main menu', (await ui()).screen === 'title');
    check('main menu starts with nothing highlighted', (await ui()).index === -1);

    /* ── every card fits, at every size ───────────────────────────────── */
    const fitsAll = [];
    for (const [w, h] of [[1920, 1008], [1368, 840], [1024, 768]]) {
      await size(w, h); await wait(250);
      const bad = await evaluate(`(async () => {
        const bad = [], screens = ['title', 'quick', 'settings', 'howto', 'pickTeam'];
        const fit = n => { const c = document.getElementById('card'), r = c.getBoundingClientRect();
          // On screen, and nothing spilling out of the card's own box (max-height hides that from the rect).
          if (r.top < -1 || r.bottom > innerHeight + 1 || r.left < -1 || r.right > innerWidth + 1 || c.scrollHeight > c.clientHeight + 2) bad.push(n); };
        for (const s of screens) { SS.ui.setScreen(s, { page: 0, side: 0 }); await new Promise(r => setTimeout(r, 60)); fit(s); }
        for (const p of [1, 2]) { SS.ui.setScreen('howto', { page: p }); await new Promise(r => setTimeout(r, 60)); fit('howto' + p); }
        SS.game.startQuick(['beamers', 'harbor']);
        for (const s of ['kickoff', 'huddle', 'formation', 'pause', 'confirmRestart', 'confirmExit', 'halftime', 'results']) { SS.ui.setScreen(s, {}); await new Promise(r => setTimeout(r, 60)); fit(s); }
        SS.game.quitToMenu();
        return bad;
      })()`);
      fitsAll.push(w + 'x' + h + (bad.length ? ': ' + bad.join(',') : ': ok'));
    }
    check('every card fits on screen at 1920x1008, 1368x840, 1024x768', !fitsAll.some(s => !s.endsWith('ok')), fitsAll.join(' · '));
    await evaluate('SS.save.clearMatch(); SS.game.quitToMenu(); true');
    await size(1368, 840); await wait(200);

    /* ── sound: music on the menus, the crowd in play, quiet under Pause, down under speech ── */
    const snd = () => evaluate('SS.audio.__dbg()');
    await wait(1800); let a = await snd();
    await evaluate('SS.audio.__nearLoop(1); true'); await wait(4000); const lp = await snd();
    check('the theme loops: the second player takes over at the loop point, still playing', !!lp.music && lp.music.swaps >= 1 && lp.music.playing && lp.music.t < 4, JSON.stringify(lp.music));
    check('the theme plays on the menus, with no crowd', !!a.music && a.music.state === 'run' && a.music.vol > 0.1 && !(a.bed && a.bed.playing), JSON.stringify(a));
    // The commentary talks from the kickoff on (the intro is a recording now), so the check decides when
    // "speaking" is true - the system voice and the recorded clips alike.
    await evaluate('window.__speaking = SS.util.speaking; window.__btalk = SS.broadcast.talking; window.__talk = false; SS.util.speaking = () => __talk; SS.broadcast.talking = () => __talk; SS.save.settings.set("speed", "fast"); SS.game.startQuick(["reef", "beamers"]); SS.game.kickoff(); true');
    await wait(2500); a = await snd();
    check('in play: the crowd, and no music', !!a.bed && a.bed.playing && a.bed.vol > 0.2 && (!a.music || a.music.state === 'idle'), JSON.stringify(a));
    await evaluate('__talk = true; true'); await wait(1200); a = await snd();
    await evaluate('SS.util.speaking = window.__speaking; SS.broadcast.talking = window.__btalk; true');
    check('the crowd drops while anything speaks', !!a.bed && a.bed.playing && a.bed.vol < 0.1, JSON.stringify(a));
    await evaluate('SS.ui.openPause(); true'); await wait(1500); a = await snd();
    check('the crowd goes quiet under Pause', !a.bed || !a.bed.playing || a.bed.vol < 0.01, JSON.stringify(a));
    await evaluate('SS.ui.resumeFromCard(); SS.save.settings.set("crowd", false); true'); await wait(1500); a = await snd();
    check('Crowd off: no crowd', !a.bed || !a.bed.playing, JSON.stringify(a));
    await evaluate('SS.save.settings.set("crowd", true); SS.save.settings.set("music", false); SS.save.settings.set("speed", "normal"); SS.game.quitToMenu(); SS.save.clearMatch(); SS.ui.setScreen("title"); true'); await wait(1500); a = await snd();
    check('Music off: no theme on the menus', !a.music || a.music.state !== 'run' || a.music.vol < 0.01, JSON.stringify(a));
    await evaluate('SS.save.settings.set("music", true); true');

    /* ── Motion: Reduced (Bryan's picks) ──────────────────────────────── */
    await evaluate('SS.save.settings.set("motion", "reduced"); SS.ui.setScreen("settings"); true'); await wait(300);
    const mo = await evaluate('JSON.stringify({ body: document.body.dataset.motion, lockedShotCam: [...document.querySelectorAll("#menu .item.locked")].some(e => /Shot Camera/.test(e.textContent)) })');
    check('Motion Reduced: the page knows, and Shot Camera is locked to Steady', /"body":"reduced"/.test(mo) && /"lockedShotCam":true/.test(mo), mo);
    await evaluate('SS.game.startQuick(["reef", "beamers"]); SS.game.kickoff(); true'); await wait(600);
    check('Motion Reduced: no kickoff sweep, the wide view holds', await evaluate('SS.director.mode === "wide" && !!SS.game.intro'), await evaluate('SS.director.mode'));
    await evaluate('SS.save.settings.set("motion", "full"); SS.game.quitToMenu(); SS.save.clearMatch(); SS.ui.setScreen("title"); true'); await wait(300);
    check('Motion Full: back to full', await evaluate('document.body.dataset.motion === "full"'));

    /* ── Colour Profile: High Contrast (Bryan's pick D) ─────────────────── */
    await evaluate('SS.save.settings.set("theme", "contrast"); true'); await wait(200);
    const hc = await evaluate('JSON.stringify({ body: document.body.dataset.theme, haze: SS.theme.palette().haze, outline: SS.theme.palette().outline, bg: getComputedStyle(document.getElementById("card")).backgroundColor })');
    check('High Contrast: the cards and the 3D world switch (black card, opaque water, white outlines)', /"body":"contrast"/.test(hc) && /"haze":1/.test(hc) && /"outline":"#fff"/.test(hc) && /rgb\(0, 0, 0\)/.test(hc), hc);
    await evaluate('SS.save.settings.set("theme", "standard"); true'); await wait(200);
    check('Standard: back to the teal pool', await evaluate('document.body.dataset.theme === "standard" && SS.theme.palette().haze < 1'));


    /* ── two switches, real keys, from the menu into a match ───────────── */
    await press('Space'); let u = await ui();
    check('Space (released) highlights the first item', u.screen === 'title' && u.row.startsWith('Quick Game'), u.row);
    await press('Enter'); u = await ui();
    check('Enter (released) chooses it', u.screen === 'quick', u.screen);
    await keyDown('Space'); await wait(3400); await keyUp('Space'); await wait(300); u = await ui();
    check('holding Space with nothing lit starts at the last item', u.index === 2 && u.row === 'Back', u.row);
    await press('Enter'); u = await ui();
    check('Back lands on the item that opened the screen (Quick Game)', u.screen === 'title' && u.row.startsWith('Quick Game'), u.screen + '/' + u.row);
    await press('Enter');
    for (let i = 0; i < 5; i++) await press('Space');      // Start, Pick, Back, (blank), Start
    u = await ui();
    check('the list wraps through a blank step', u.row.startsWith('Start'), u.row);
    await press('Enter'); u = await ui();
    check('Start opens the kickoff card with nothing lit', u.screen === 'kickoff' && u.index === -1, u.screen + '/' + u.index);
    await press('Enter'); u = await ui();
    check('Enter with nothing lit chooses nothing', u.screen === 'kickoff' && u.index === -1, u.screen + '/' + u.index);
    await evaluate('SS.save.settings.set("speed", "fast"); true');
    await press('Space'); await press('Enter'); u = await ui();
    check('Kick Off starts live play, with the kickoff sweep', u.ctx === 'live' && await evaluate('!!SS.game.intro && SS.director.mode === "intro"'), u.ctx);

    let decisions = 0, frozeOk = 0, auditBad = [], kinds = {};
    for (let n = 0; n < 8; n++) {
      await until('SS.ui.context() === "world" || SS.ui.screen === "halftime" || SS.ui.screen === "results"', 90000);
      if ((await ui()).ctx !== 'world') { await evaluate('SS.ui.screen === "halftime" && SS.game.startSecondHalf(); true'); continue; }
      decisions++;
      await wait(600);
      const a = await evaluate(`(() => { const m = SS.game.match.s; return { clock: m.clock, pos: SS.game.swimmers.map(s => s.group.position.toArray().map(v => +v.toFixed(3)).join(',')).join('|'), kind: m.pending.kind }; })()`);
      await wait(700);
      const b = await evaluate(`(() => { const m = SS.game.match.s; return { clock: m.clock, pos: SS.game.swimmers.map(s => s.group.position.toArray().map(v => +v.toFixed(3)).join(',')).join('|') }; })()`);
      if (a.clock === b.clock && a.pos === b.pos) frozeOk++;
      kinds[a.kind] = (kinds[a.kind] || 0) + 1;
      const bad = await evaluate(`(() => {
        const W = innerWidth, H = innerHeight, bad = [];
        const els = [...document.querySelectorAll('.cluster .plate, .cluster .head')].map(e => e.getBoundingClientRect());
        if (!els.length) bad.push('no plates');
        els.forEach(r => { if (r.left < 0 || r.top < 0 || r.right > W || r.bottom > H) bad.push('off screen'); });
        for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) { const p = els[i], q = els[j];
          if (p.left < q.right - 1 && q.left < p.right - 1 && p.top < q.bottom - 1 && q.top < p.bottom - 1) bad.push('overlap'); }
        return bad;
      })()`);
      if (bad.length) auditBad.push(a.kind + ':' + bad.join(','));
      if (n === 0) await shot('decision.png');
      await press('Space'); await press('Enter');
      if ((await ui()).ctx === 'world') { if (n === 1) await shot('second-stage.png'); await press('Space'); await press('Enter'); }
    }
    const stopsNow = await evaluate('SS.game.match.s.stops + "/" + SS.save.settings.get("stops")');
    check('decisions came up in play', decisions >= 4, decisions + ' ' + JSON.stringify(kinds) + ' stops ' + stopsNow);
    check('clock and every swimmer frozen at every decision', frozeOk === decisions, frozeOk + '/' + decisions);
    check('every plate on screen, none overlapping', auditBad.length === 0, auditBad.join(' '));

    /* ── Huddle and Pause (Coach: nothing else interrupts) ──────────────── */
    await evaluate('SS.save.settings.set("stops", "coach"); SS.game.startQuick(["reef", "gliders"]); SS.game.kickoff(); true');
    await wait(800);
    await press('Space'); u = await ui();
    const swept = await evaluate('JSON.stringify({ intro: !!SS.game.intro, cam: SS.director.mode })');
    check('a press during the kickoff sweep skips it, and opens nothing', u.ctx === 'live' && !u.screen && /"intro":false/.test(swept) && /broadcast/.test(swept), u.ctx + ' ' + swept);
    await press('Space'); u = await ui();
    check('a tap in live play opens the Huddle, nothing lit', u.screen === 'huddle' && u.index === -1, u.screen + '/' + u.index);
    await press('Space'); await press('Enter'); u = await ui();
    check('Continue goes back to live play', u.ctx === 'live', u.ctx);
    await wait(500);
    await keyDown('Enter'); await wait(3300);
    const ring = await evaluate('document.querySelector(".ring").classList.contains("on")');
    check('holding Enter shows the keep-holding ring', ring);
    await wait(2200); u = await ui();
    check('holding Enter long enough opens Pause', u.screen === 'pause', u.screen);
    const c1 = await evaluate('SS.game.match.s.clock'); await wait(600);
    check('the clock stops under Pause', c1 === await evaluate('SS.game.match.s.clock'));
    await keyUp('Enter'); await wait(300); u = await ui();
    check('the release that opened Pause is swallowed', u.screen === 'pause' && u.index === -1, u.screen + '/' + u.index);
    await press('Space'); await press('Enter'); u = await ui();
    check('Pause > Continue resumes play', u.ctx === 'live', u.ctx);
    // A press during a goal's celebration or replay only skips it (by design), so wait for plain live play.
    await until("SS.ui.context() === 'live' && !SS.game.goalMoment && SS.director.mode === 'broadcast'", 60000);
    await keyDown('Enter'); await wait(4000); await keyUp('Enter'); await wait(300); u = await ui();
    check('a slow 4 s press is an ordinary press (Huddle, not Pause)', u.screen === 'huddle', JSON.stringify({ screen: u.screen, ctx: u.ctx }));
    await press('Space'); await press('Enter');

    /* ── Pause from inside a decision asks the same choice again ──────── */
    await evaluate('SS.save.settings.set("stops", "ours"); SS.game.startQuick(["beamers", "reef"]); SS.game.kickoff(); true');
    await until('SS.ui.context() === "world"', 90000);
    await press('Space'); const rowsNow = () => evaluate('SS.ui.__dbg().rows.join("|")'), before = await rowsNow();
    await keyDown('Enter'); await wait(5400); await keyUp('Enter'); await wait(300);
    check('holding Enter during a decision opens Pause', (await ui()).screen === 'pause');
    await press('Space'); await press('Enter'); u = await ui();
    check('Continue asks the same choice again, nothing lit', u.ctx === 'world' && u.index === -1 && await rowsNow() === before, u.ctx + '/' + u.index);
    // ...with its plates drawn, not just its items in the list (Bryan: they vanished).
    const platesNow = () => evaluate('(() => { const r = document.querySelector(".cluster .row"); return r ? [...r.querySelectorAll(".plate")].filter(p => p.getBoundingClientRect().width > 0).length : 0; })()');
    const wantPlates = await evaluate('SS.ui.__dbg().rows.length') - 1;          // every item but Pause
    let got = await platesNow();
    check('after Pause > Continue every plate is back on screen', got > 0 && got === wantPlates, got + ' of ' + wantPlates);
    // Pause > Settings > change one > Back > Continue: the same.
    await keyDown('Enter'); await wait(5400); await keyUp('Enter'); await wait(300);
    const toRow = async (label) => { for (let i = 0; i < 20; i++) { if ((await ui()).row.startsWith(label)) return; await press('Space'); } throw Error('never reached ' + label); };
    await toRow('Settings'); await press('Enter');
    await toRow('Difficulty'); await press('Enter');
    check('changing a setting keeps its highlight', (await ui()).row.startsWith('Difficulty'), (await ui()).row);
    await toRow('Back'); await press('Enter');
    check('Back from Settings lands on Settings in Pause', (await ui()).screen === 'pause' && (await ui()).row.startsWith('Settings'), (await ui()).row);
    await toRow('Continue'); await press('Enter');
    got = await platesNow();
    check('after Pause > Settings > Back > Continue every plate is back', (await ui()).ctx === 'world' && got === wantPlates, got + ' of ' + wantPlates);
    // A nested decision: Pass > Back lands on Pass, not on the blank.
    if ((await rowsNow()).split('|').some(r => r.startsWith('Pass'))) {
      await toRow('Pass'); await press('Enter');
      await toRow('Back'); await press('Enter'); u = await ui();
      check('Pass > Back lands on Pass', u.ctx === 'world' && u.row.startsWith('Pass'), u.ctx + '/' + u.row);
    }

    /* ── save mid-play, reload, Continue: exactly the same moment ─────── */
    await evaluate('SS.game.choose(SS.game.match.pending.options[0].id); true');
    await wait(1500);
    const snap = await evaluate('SS.game.saveNow(); JSON.stringify({ c: SS.game.match.s.clock, s: SS.game.match.s.score, o: SS.game.match.s.ball.owner, p: SS.game.match.s.players.map(p => p.hp.toFixed(3)).join(), pend: SS.game.match.pending && SS.game.match.pending.seq })');
    await load();
    u = await ui();
    check('Continue is offered after a reload', (await evaluate('SS.ui.__dbg().rows[0]')).startsWith('Continue'));
    await press('Space'); await press('Enter');
    const back = await evaluate('JSON.stringify({ c: SS.game.match.s.clock, s: SS.game.match.s.score, o: SS.game.match.s.ball.owner, p: SS.game.match.s.players.map(p => p.hp.toFixed(3)).join(), pend: SS.game.match.pending && SS.game.match.pending.seq })');
    check('the saved match resumes at exactly the same moment', snap === back);

    /* ── a goal replay: a real press skips it, and opens nothing ──────── */
    // When the results card opens: was the full-time score called from recordings? (Bryan heard the system voice.)
    await evaluate(`window.__atResults = null; (() => { const set = SS.ui.setScreen; SS.ui.setScreen = function (n) { if (n === 'results' && !__atResults) __atResults = { full: SS.broadcast.played.filter(p => p.id === 'pa_full_1').map(p => p.file) }; return set.apply(this, arguments); }; })(); true`);
    await evaluate("SS.save.clearMatch(); SS.save.settings.set('stops', 'ours'); SS.save.settings.set('difficulty', 'easy'); SS.game.startQuick(['reef', 'beamers']); SS.game.kickoff(); true");
    await until(`(() => {
      const p = SS.game.match.pending;
      if (p && SS.ui.context() === 'world') { const sh = p.options.find(o => o.kind === 'shoot' && !o.tech); SS.game.choose((sh || p.options[0]).id); }
      // No goal yet: play on past halftime, and if the match ends goalless, start another.
      if (SS.ui.screen === 'halftime') SS.game.startSecondHalf();
      if (SS.ui.screen === 'results') { SS.game.startQuick(['reef', 'beamers']); SS.game.kickoff(); }
      const g = SS.game.goalMoment;
      return !!(g && g.replay && g.replay.on && g.replay.rt - g.replay.from > 0.5);
    })()`, 500000);
    await shot('replay.png');
    await press('Space');
    await until('!SS.game.goalMoment', 3000).catch(() => {});
    const afterSkip = await evaluate('JSON.stringify({ gm: !!SS.game.goalMoment, screen: SS.ui.screen, ctx: SS.ui.context(), cam: SS.director.mode })');
    check('a press during a goal replay skips it, and opens nothing', /"gm":false/.test(afterSkip) && /"ctx":"live"/.test(afterSkip) && !/huddle/.test(afterSkip), afterSkip);
    await evaluate("SS.save.settings.set('difficulty', 'normal'); SS.save.settings.set('stops', 'both'); true");

    /* ── one switch: Auto Scan on, Enter only ───────────────────────── */
    await evaluate('(() => { const s = NarbeScanManager; if (!s.getSettings().autoScan) s.toggleAutoScan(); while (s.getScanInterval() !== 1000) s.cycleScanSpeed(); SS.save.clearMatch(); SS.game.quitToMenu(); })(); true');
    const litEnter = async (label) => { await until(`(SS.ui.__dbg().rows[SS.ui.__dbg().index] || "").startsWith(${JSON.stringify(label)})`, 20000); await press('Enter'); };
    await litEnter('Quick Game'); await litEnter('Start'); await litEnter('Kick off');
    let oneSwitch = 0;
    for (let n = 0; n < 4; n++) {
      await until('SS.ui.context() === "world" || SS.ui.screen === "halftime"', 90000);
      if ((await ui()).ctx !== 'world') { await litEnter('Start the second half'); continue; }
      await until('SS.ui.__dbg().index >= 0', 8000); await press('Enter');
      if ((await ui()).ctx === 'world') { await until('SS.ui.__dbg().index >= 0', 8000); await press('Enter'); }
      oneSwitch++;
    }
    check('with Auto Scan on, Enter alone plays through menus and decisions', oneSwitch === 4, oneSwitch + ' decisions');

    /* ── the hub's choice scanner: Space Brake and parking (Auto Scan, 1 s) ── */
    await evaluate('SS.save.clearMatch(); SS.game.quitToMenu(); true');
    const cs = () => evaluate('SS.ui.__dbg().choice');
    await until('SS.ui.__dbg().index >= 0', 8000); await wait(200);
    await keyDown('Space'); await wait(80);
    let st = await cs(); const litAt = st.index;
    const dotted = await evaluate('!!document.querySelector("#menu [data-narbe-scan-paused]")');
    await keyUp('Space'); await wait(2400);
    const held = await cs();
    check('Space Brake: a press freezes the scan on the lit item, marked with a dotted outline', st.braked && dotted && held.braked && held.index === litAt, JSON.stringify({ st, dotted, held }));
    await press('Space'); await wait(600);
    const still = await cs(); await wait(1200); const moved = await cs();
    check('a second Space resumes, after one full interval', !still.braked && still.index === litAt && moved.index !== litAt, still.index + ' -> ' + moved.index);
    await evaluate('NarbeScanManager.updateSettings({ parking: "auto", loopsBeforeParking: 1 }); SS.ui.setScreen("title"); true');
    await until('SS.ui.__dbg().choice.parked', 20000);
    const parkedNow = await evaluate('JSON.stringify({ i: SS.ui.__dbg().index, badge: (document.querySelector("#cardStatus .narbe-scan-status-badge") || {}).hidden === false })');
    check('Auto park: after one full loop the scan parks, nothing lit, Parked shown', /"i":-1/.test(parkedNow) && /"badge":true/.test(parkedNow), parkedNow);
    await press('Enter'); u = await ui();
    check('Enter while parked resumes on the first item without choosing it', u.screen === 'title' && u.index >= 0 && !(await cs()).parked, u.screen + '/' + u.row);
    await evaluate('NarbeScanManager.updateSettings({ parking: "off", loopsBeforeParking: 2 }); true');
    await evaluate('(() => { const s = NarbeScanManager; if (s.getSettings().autoScan) s.toggleAutoScan(); while (s.getScanInterval() !== 2000) s.cycleScanSpeed(); })(); true');

    /* ── a whole Quick Game to the results card, at 1024x768 ──────────── */
    await size(1024, 768);
    // Each match is a new random one; a 0-0 has no goal to check, so play another (up to three).
    let gl, gv, total = 0;
    for (let tries = 0; tries < 3 && !total; tries++) {
    await evaluate('SS.game.startQuick(["summit", "mistwood"]); SS.game.kickoff(); true');
    await evaluate('window.__goals = { seen: 0, celebrated: 0, banner: 0, replayed: 0 }; true');
    await until(`(() => {
      // Every goal gets its moment: the banner, the scorer celebrating, and then the cut.
      const g = SS.game.goalMoment;
      if (g && !g.__seen) { g.__seen = 1; __goals.seen++; }
      if (g && g.started && !g.__cel) { g.__cel = 1; __goals.celebrated++; }
      if (g && !g.__ban && document.querySelector('#hud .goalbanner.on')) { g.__ban = 1; __goals.banner++; }
      if (g && g.replay && g.replay.on && !g.__rep) { g.__rep = 1; __goals.replayed++; }
      if (SS.ui.screen === 'halftime') SS.game.startSecondHalf();
      const p = SS.game.match && SS.game.match.pending;
      if (p && SS.ui.context() === 'world') SS.game.choose(p.options.slice().sort((a, b) => b.odds.p - a.odds.p)[0].id);
      return SS.ui.screen === 'results';
    })()`, 400000);
    await shot('results.png');
    check('a whole Quick Game plays to the results card', (await ui()).screen === 'results');
    gl = await evaluate('JSON.stringify(Object.assign({ score: SS.game.matchInfo().score }, __goals))'); gv = JSON.parse(gl);
    total = gv.score[0] + gv.score[1];
    }
    await wait(2000); const endSnd = await evaluate('SS.audio.__dbg()');
    check('full time: a sting, then the theme on the results card', endSnd.stingUntil > 0 && !!endSnd.music && endSnd.music.state === 'run', JSON.stringify(endSnd));
    check('every goal gets its moment: banner, celebration, replay, then play goes on', total > 0 && gv.seen === total && gv.celebrated === total && gv.banner === total && gv.replayed === total, gl);
    // Recorded voices: Rip's goal call is a recording for every player (the voice pipeline's goal family).
    const vo = await evaluate('JSON.stringify(SS.broadcast.played.filter(p => /^pbp_goal_/.test(p.id)))');
    const goalCalls = JSON.parse(vo);
    check('every goal call voiced plays its recording, not the system voice', goalCalls.length > 0 && goalCalls.every(p => p.file && /^goal\//.test(p.file)), vo.slice(0, 200));
    const lookup = await evaluate(`JSON.stringify(['benji-tide', 'otto-shoal'].map(k => SS.broadcast.clipFile({ id: 'pbp_goal_1' }, [k])).concat(SS.broadcast.clipFile({ id: 'pbp_shot_1' }, ['benji-tide']), SS.broadcast.clipFile({ id: 'pbp_not_a_line' }, ['benji-tide'])))`);
    check('clip lookup: each player has a goal call and player call file; an unrecorded line finds none', lookup === '["goal/pbp_goal_1__benji-tide.mp3","goal/pbp_goal_1__otto-shoal.mp3","player_calls/pbp_shot_1__benji-tide.mp3",null]', lookup);
    // Coral on formations: every team x formation, with the keys game.js builds (team short name, formation name).
    // A change of shape is two clips (her line, then the shape's description); the other lines are one.
    const forms = JSON.parse(await evaluate(`JSON.stringify((() => {
      const U = SS.util, L = SS.VOICE_LINES.families, miss = [];
      let split = 0, whole = 0, sample = null;
      for (const t of SS.DATA.TEAMS) for (const f of Object.values(SS.DATA.FORMATIONS)) {
        const tk = U.slug(t.short), fk = U.slug(f.name);
        for (const fam of ['ourFormation', 'theirFormation']) for (const l of L[fam]) {
          const files = SS.broadcast.partFiles(l, { tf: tk + '-' + fk, f: fk });
          if (files && files.length === 2) { split++; sample = sample || files; } else miss.push(l.id + '@' + tk + '-' + fk);
        }
        for (const fam of ['formationWorking', 'formationStruggling', 'formationHolding']) for (const l of L[fam]) {
          if (SS.broadcast.clipFile(l, [tk, fk])) whole++; else miss.push(l.id + '@' + tk + '-' + fk);
        }
      }
      return { split, whole, miss: miss.slice(0, 5), missing: miss.length, sample };
    })())`));
    check('formation lines: every team and shape has its recording, a change of shape plays her line then the description', forms.missing === 0 && forms.split === 216 && forms.whole === 324, JSON.stringify(forms));

    // Split lines: a score is team, number, team, number; an intercept is "Intercepted!" then "<team> ball!".
    const split = JSON.parse(await evaluate(`(async () => {
      const B = SS.broadcast, V = SS.VOICE_LINES, fam = n => V.families[n];
      const teams = SS.DATA.TEAMS.map(t => SS.util.slug(t.short)), nums = Array.from({ length: 16 }, (_, i) => SS.util.slug(SS.util.numWord(i)));
      const lineOf = id => Object.values(V.families).flat().find(l => l.id === id);
      const missing = [];
      for (const tk of teams) for (const n of nums) {
        if (!B.partFiles(lineOf('pa_score_1'), { t0: tk, n0: n, t1: tk, n1: n })) missing.push(tk + '-' + n);
      }
      for (const tk of teams) if (!B.partFiles(lineOf('pbp_int_3'), { tk })) missing.push('int-' + tk);
      const noSixteen = B.partFiles(lineOf('pa_score_1'), { t0: teams[0], n0: SS.util.slug(SS.util.numWord(16)), t1: teams[1], n1: 'one' });
      // fake playback: record each clip started, and when
      const started = [], RealAudio = window.Audio, realCtx = SS.ui.context, realSpeaking = SS.util.speaking, t0 = performance.now();
      SS.util.speaking = () => false;                              // the results card's own voice would make the broadcast wait
      window.Audio = function (src) { return { src, paused: true, ended: false, preload: '', play() { started.push({ src: src.replace('audio/vo/', ''), at: Math.round(performance.now() - t0) }); this.paused = false; setTimeout(() => { this.ended = true; this.paused = true; this.onended && this.onended(); }, 40); return Promise.resolve(); }, pause() { this.paused = true; } }; };
      SS.ui.context = () => 'live';
      await new Promise(r => setTimeout(r, 1700));                 // the interface spoke a moment ago: wait it out
      B.reset(); started.length = 0;                               // the match's own full-time call may have played in the wait
      const k = { t0: teams[0], n0: 'two', t1: teams[1], n1: 'one' };
      B.say('goalScore', { score: 'x', _k: k }, 3);
      await new Promise(r => setTimeout(r, 1200));
      const score = started.splice(0).map(s => s.src);
      B.reset(); started.length = 0;
      B.say('secondHalf', { score: 'x', _k: k }, 3);
      await new Promise(r => setTimeout(r, 1500));
      const second = started.splice(0);
      window.Audio = RealAudio; SS.ui.context = realCtx; SS.util.speaking = realSpeaking; B.reset();
      return JSON.stringify({ missing, noSixteen, score, second: second.map(s => s.src), gaps: second.slice(1).map((s, i) => s.at - second[i].at), played: B.played });
    })()`));
    check('every team and number 0-15 has the clips a score needs; every team has its intercept clips', split.missing.length === 0, split.missing.slice(0, 6).join(', ') || (6 * 16) + ' scores, 6 intercepts');
    check('a score past fifteen has no recording and falls back to the system voice', split.noSixteen === null, String(split.noSixteen));
    check('a score plays team, number, team, number from recordings, in order', JSON.stringify(split.score) === JSON.stringify(['score_teams/pa_score_t__beamers.mp3', 'score_numbers/pa_score_n__two.mp3', 'score_teams/pa_score_t__stars.mp3', 'score_numbers/pa_score_n__one.mp3']), JSON.stringify(split.score));
    check('a second-half call plays its own clip, then the score, with a pause between the clips', split.second.length === 5 && /^score_carriers\/pa_second_/.test(split.second[0]) && split.gaps.every(g => g >= 150), JSON.stringify(split.second) + ' gaps ' + split.gaps);
    const atResults = JSON.parse(await evaluate('JSON.stringify(window.__atResults)'));
    check('full time: the score is called from recordings, carrier then team, number, team, number', !!atResults && atResults.full.length > 0 && atResults.full.every(f => f && f.split('+').length === 5), JSON.stringify(atResults));
    // A choice's own consequence (the technique just picked) is called when play resumes, not dropped under the card.
    const conseq = JSON.parse(await evaluate(`(async () => {
      const B = SS.broadcast, wait = ms => new Promise(r => setTimeout(r, ms)), started = [], RealAudio = window.Audio, realCtx = SS.ui.context;
      window.Audio = function (src) { return { src, paused: true, ended: false, play() { started.push(src.replace('audio/vo/', '')); this.paused = false; setTimeout(() => { this.ended = true; this.paused = true; this.onended && this.onended(); }, 40); return Promise.resolve(); }, pause() { this.paused = true; } }; };
      let c = 'world'; SS.ui.context = () => c;
      await wait(1700); B.reset();
      const p = SS.DATA.TEAMS[0].players.find(x => x.techs.length), tech = SS.DATA.TECHS[p.techs[0]].name;
      const text = B.say('tech', { player: p.name.split(' ')[0], tech, _keys: [SS.util.slug(p.name), SS.util.slug(tech)] }, 2);
      await wait(500); const underCard = started.slice();
      c = 'live'; await wait(700); const after = started.slice();
      window.Audio = RealAudio; SS.ui.context = realCtx; B.reset();
      return JSON.stringify({ text, underCard, after });
    })()`));
    check('a call made as a choice closes waits for the card, then plays from its recording', conseq.underCard.length === 0 && conseq.after.length === 1 && /^tech_(names|player)\//.test(conseq.after[0]), JSON.stringify(conseq));
    const said = await evaluate('JSON.stringify({ n: __said.length, bad: __said.filter(s => s.ctx !== "live").length, hist: SS.broadcast.history.length, now: __said.filter(s => s.m === __match).length })');
    const sv = JSON.parse(said);
    check('commentary is never spoken while a choice or menu is up', sv.bad === 0, sv.n + ' lines spoken, ' + sv.bad + ' over a choice');
    check('every commentary line reached the caption', sv.hist >= sv.now, sv.now + ' spoken this match, ' + sv.hist + ' captioned');
    /* ── a decision card waits up to 2 s for a call; a manual Pause is never held back ── */
    await evaluate('window.__cif = SS.broadcast.callInFlight; SS.broadcast.callInFlight = () => true; SS.save.settings.set("stops", "ours"); SS.save.clearMatch(); SS.game.startQuick(["beamers", "reef"]); SS.game.kickoff(); true');
    await until('SS.game.phase === "decision"', 120000);
    const holdT0 = Date.now(), duringHold = JSON.parse(await evaluate('JSON.stringify({ ctx: SS.ui.context(), phase: SS.game.phase })'));
    await until('SS.ui.context() === "world"', 8000);
    const heldMs = Date.now() - holdT0;
    check('a decision card waits for a call in flight, then opens: about 2 s, never longer', duringHold.ctx === 'live' && heldMs >= 1400 && heldMs <= 3200, JSON.stringify(duringHold) + ', waited ' + heldMs + ' ms');

    await evaluate('SS.game.startQuick(["reef", "beamers"]); SS.game.kickoff(); true');
    await until('SS.game.phase === "decision"', 120000);
    const pauseT0 = Date.now();
    await evaluate('document.getElementById("pauseBtn").click(); true');
    const pausedAt = JSON.parse(await evaluate('JSON.stringify({ screen: SS.ui.__dbg().screen, ctx: SS.ui.context() })')), pauseMs = Date.now() - pauseT0;
    await wait(2600);
    const stillPaused = JSON.parse(await evaluate('JSON.stringify({ screen: SS.ui.__dbg().screen, ctx: SS.ui.context() })'));
    check('a manual Pause during the wait opens at once and stays: the held card does not open behind it', pausedAt.screen === 'pause' && pauseMs < 500 && stillPaused.screen === 'pause', JSON.stringify({ pausedAt, pauseMs, stillPaused }));
    const resumeT0 = Date.now();
    await evaluate('SS.ui.resumeFromCard(); true');
    await until('SS.ui.context() === "world"', 3000);
    const resumeMs = Date.now() - resumeT0;
    check('Continue after that Pause asks the decision straight away, with no second wait', resumeMs < 900, resumeMs + ' ms');
    await evaluate('SS.broadcast.callInFlight = window.__cif; true');
    // The Commentary setting: Off says nothing (not even a caption), Calls voices the calls (the announcer, goals) and
    // captions the rest, Full voices everything - each from its recording.
    const modes = JSON.parse(await evaluate(`(async () => {
      const B = SS.broadcast, U = SS.util, wait = ms => new Promise(r => setTimeout(r, ms)), started = [], tts = [];
      const RealAudio = window.Audio, realCtx = SS.ui.context, realSpk = U.speaking, realSay = U.speakAs;
      window.Audio = function (src) { return { src, paused: true, ended: false, play() { started.push(src.replace('audio/vo/', '')); this.paused = false; setTimeout(() => { this.ended = true; this.paused = true; this.onended && this.onended(); }, 40); return Promise.resolve(); }, pause() { this.paused = true; } }; };
      SS.ui.context = () => 'live'; U.speaking = () => false; U.speakAs = t => tts.push(t);
      const p = SS.DATA.TEAMS[0].players[1], k = U.slug(p.name), res = {};
      for (const m of ['off', 'calls', 'full']) {
        SS.save.settings.set('commentary', m); B.reset(); started.length = 0; tts.length = 0;
        B.say('pass', { player: p.name.split(' ')[0], target: p.name.split(' ')[0], _keys: [k] }, 1); await wait(2600);
        B.say('goal', { player: p.name, team: 'Beamers', _keys: [k] }, 3); await wait(600);
        res[m] = { voiced: started.map(f => f.split('/')[0]), captioned: B.history.length, tts: tts.length };
      }
      SS.save.settings.set('commentary', 'full'); window.Audio = RealAudio; SS.ui.context = realCtx; U.speaking = realSpk; U.speakAs = realSay; B.reset();
      return JSON.stringify(res);
    })()`));
    check('Commentary Off is silent, Calls voices only the goal, Full voices the pass call and the goal (from recordings)',
      modes.off.voiced.length === 0 && modes.off.captioned === 0 && JSON.stringify(modes.calls.voiced) === '["goal"]' && modes.calls.captioned === 2 &&
      JSON.stringify(modes.full.voiced) === '["player_calls","goal"]' && !modes.off.tts && !modes.calls.tts && !modes.full.tts, JSON.stringify(modes));

    // One switch with Wait for Speech: Auto Scan steps through real decisions (it waits for its own spoken label,
    // never for the commentary, so it never stalls), and no recorded commentary plays while a choice is up.
    await evaluate(`(() => { const s = NarbeScanManager; s.updateSettings({ waitForSpeech: true }); if (!s.getSettings().autoScan) s.toggleAutoScan(); while (s.getScanInterval() !== 1000) s.cycleScanSpeed();
      window.__over = []; const p = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function () { if (/audio\\/vo\\//.test(this.src) && SS.ui.context() !== 'live') __over.push(SS.ui.context() + ' ' + this.src.split('audio/vo/')[1]); return p.call(this); };
      SS.save.settings.set('stops', 'ours'); SS.save.clearMatch(); SS.game.startQuick(['beamers', 'reef']); SS.game.kickoff(); })(); true`);
    const steps = [];
    for (let n = 0; n < 3; n++) {
      await until('SS.ui.context() === "world" && !!(SS.game.match && SS.game.match.pending)', 90000);
      const seen = []; let last = -2;
      // a long label ("Shoot. Risky. 0 blockers, keeper strong.") is read in full before the interval: ~5.5 s a step
      for (let t = 0; t < 15000; t += 100) { const i = await evaluate('SS.ui.__dbg().index'); if (i !== last) { seen.push(Date.now()); last = i; } await wait(100); }
      steps.push(seen.slice(1).map((t, i) => t - seen[i]));
      await press('Enter');
      if ((await ui()).screen === 'pause') await evaluate('(SS.ui.resumeFromCard(), 1)');   // the scan was on Pause
    }
    // >= 900: the index is sampled every 100 ms; the silent blank step (-1) waits just the 1 s interval
    const flat = steps.flat(), over = JSON.parse(await evaluate('JSON.stringify(__over)'));
    check('with Wait for Speech, Auto Scan keeps stepping through decisions (no stall), a full interval after each label', steps.every(s => s.length >= 2) && flat.every(g => g >= 900), JSON.stringify(steps));
    check('no recorded commentary starts while a choice is on screen', over.length === 0, over.slice(0, 4).join('; '));
    await evaluate('(() => { const s = NarbeScanManager; s.updateSettings({ waitForSpeech: false }); if (s.getSettings().autoScan) s.toggleAutoScan(); while (s.getScanInterval() !== 2000) s.cycleScanSpeed(); })(); true');

    // Coral on a formation change, in a match: change shape, play on, and both clips are heard, in order (the real
    // say -> queue -> voice path). Last, because it starts a fresh match.
    await evaluate(`(() => { window.__clips = []; const p = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function () { if (/audio\\/vo\\//.test(this.src)) __clips.push(decodeURIComponent(this.src.split('audio/vo/')[1])); return p.call(this); };
      // the coach takes every decision: a card opening between the two clips would cut her off (the interface always wins)
      SS.save.settings.set('stops', 'coach'); SS.save.clearMatch(); SS.game.quitToMenu(); })(); true`);
    await wait(300); await evaluate("SS.game.startQuick(['beamers', 'harbor']); SS.game.kickoff(); true");
    // after the opening calls: in play a shape is changed from the Huddle, never over the intro
    await until(`(() => {
      const p = SS.game.match && SS.game.match.pending;           // a decision on the way: take the likeliest option and play on
      if (p && SS.ui.context() === 'world') SS.game.choose(p.options.slice().sort((a, b) => b.odds.p - a.odds.p)[0].id);
      return SS.ui.context() === 'live' && SS.broadcast.history.length > 0 && !SS.broadcast.talking() && !(SS.game.match && SS.game.match.pending);
    })()`, 60000);
    // a shape the team is not already in (the coach may have changed it by now); the queue cleared first, so a run of
    // move calls queued just before cannot leave her line waiting until it lapses
    const shape = await evaluate('(() => { const id = SS.game.formationId() === "flatLine" ? "counter" : "flatLine"; SS.broadcast.reset(); SS.game.setFormation(id); SS.game.resume(); return SS.util.slug(SS.DATA.FORMATIONS[id].name); })()');
    const blurb = 'formation_blurbs/col_form_what__' + shape + '.mp3';
    await until('__clips.includes(' + JSON.stringify(blurb) + ')', 30000).catch(() => {});
    const heard = JSON.parse(await evaluate('JSON.stringify(__clips)'));
    const at = heard.findIndex(f => f.startsWith('formations/col_form_us_') && f.endsWith('__beamers-' + shape + '.mp3'));
    const why = at >= 0 && heard[at + 1] === blurb ? '' : await evaluate('JSON.stringify({ form: SS.game.formationId(), phase: SS.game.phase, ctx: SS.ui.context(), said: SS.broadcast.history.slice(-8).map(h => h.family + ":" + h.id) })');
    check('a formation change in a match plays Coral\'s line, then the shape\'s description', at >= 0 && heard[at + 1] === blurb, shape + ': ' + JSON.stringify(heard.slice(-6)) + ' ' + why);
    await evaluate("SS.save.settings.set('stops', 'both'); true");

    check('no exceptions', exceptions.length === 0, exceptions.slice(0, 3).join(' | '));
  } catch (err) {
    console.error(err); fails++;
  } finally {
    console.log('\nScreenshots: ' + out);
    console.log(fails ? fails + ' check(s) failed' : 'All checks passed');
    try { ws.close(); } catch (e) { /* ignore */ }
    chrome.kill(); server.close();
    setTimeout(() => { try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* Chrome may still hold it */ } process.exit(fails ? 1 : 0); }, 600);
  }
})();
