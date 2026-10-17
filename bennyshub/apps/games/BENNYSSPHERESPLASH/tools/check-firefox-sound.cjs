/** Benny's Sphere Splash - the sound in Firefox, under its normal autoplay rule.
 *    node tools/check-firefox-sound.cjs [path-to-firefox]
 *
 *  Firefox holds sound differently from Chrome: it lets a silent element start, then holds it
 *  once it turns audible, often with no error. The theme fades in from silence, so on first
 *  load it was held and never restarted (Bryan found it). check-browser.cjs runs Chrome with
 *  autoplay allowed and cannot see this, so this runs Firefox, hidden and muted, from file://
 *  (how Bryan opens the game) and presses real keys through WebDriver BiDi.
 *  Skips (exit 0) if Firefox is not installed.
 */
'use strict';
const { spawn } = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
const wait = ms => new Promise(r => setTimeout(r, ms));
const GAME = path.resolve(__dirname, '..');
let fails = 0;
const check = (name, ok, detail) => { console.log((ok ? '  PASS ' : '  FAIL ') + name + (detail ? '  - ' + detail : '')); if (!ok) fails++; };

(async () => {
  const exe = [process.argv[2], 'C:/Program Files/Mozilla Firefox/firefox.exe', 'C:/Program Files (x86)/Mozilla Firefox/firefox.exe',
    '/usr/bin/firefox', '/Applications/Firefox.app/Contents/MacOS/firefox'].find(p => p && fs.existsSync(p));
  if (!exe) { console.log('Firefox not found - skipped. Pass the path: node tools/check-firefox-sound.cjs <firefox>'); process.exit(0); }
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-firefox-'));
  // Silent: no sound out, no system voice. Autoplay stays at Firefox's default (hold audible sound).
  fs.writeFileSync(path.join(profile, 'user.js'), 'user_pref("media.volume_scale", "0.0");\nuser_pref("media.webspeech.synth.enabled", false);\n');
  const port = 9300 + Math.floor(Math.random() * 500);
  const ff = spawn(exe, ['-headless', '-no-remote', '-profile', profile, '--remote-debugging-port=' + port, 'about:blank']);
  let ws = null;
  try {
    for (let i = 0; i < 100 && !ws; i++) {
      await wait(200);
      try { const w = new WebSocket('ws://127.0.0.1:' + port + '/session'); await new Promise((r, j) => { w.onopen = r; w.onerror = j; }); ws = w; } catch (e) { /* not up yet */ }
    }
    if (!ws) throw Error('Firefox did not open its remote port');
    let id = 0; const pend = new Map();
    ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
    const call = (method, params = {}) => new Promise(r => { pend.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
    await call('session.new', { capabilities: {} });
    const ctx = (await call('browsingContext.getTree', {})).result.contexts[0].context;
    const ev = async x => {
      const r = await call('script.evaluate', { expression: 'JSON.stringify((' + x + ') ?? null)', target: { context: ctx }, awaitPromise: false });
      if (!r.result || !r.result.result) throw Error(x + ': ' + JSON.stringify(r));
      return JSON.parse(r.result.result.value);
    };
    const space = () => call('input.performActions', { context: ctx, actions: [{ type: 'key', id: 'kb', actions: [{ type: 'keyDown', value: ' ' }, { type: 'pause', duration: 90 }, { type: 'keyUp', value: ' ' }] }] });

    await call('browsingContext.navigate', { context: ctx, url: 'file:///' + path.join(GAME, 'index.html').split(path.sep).join('/'), wait: 'complete' });
    for (let i = 0; i < 300 && !(await ev('!!(window.SS && SS.ui && SS.ui.screen === "title")')); i++) await wait(100);
    await wait(2000);
    await space(); await wait(1500);
    let m = await ev('SS.audio.__dbg().music');
    check('the theme starts on the first key press', !!m && m.playing && m.t > 0.5, JSON.stringify(m));
    await ev('SS.audio.__nearLoop(1)'); await wait(4000);
    m = await ev('SS.audio.__dbg().music');
    check('the theme loops (the second player takes over)', !!m && m.playing && m.swaps >= 1 && m.t < 4, JSON.stringify(m));
    await ev('(SS.game.startQuick(["reef", "beamers"]), SS.game.kickoff(), 1)'); await wait(3000);
    // the crowd ducks under the commentators (the recorded intro plays at kick-off): measure it once they stop
    for (let i = 0; i < 60 && (await ev('SS.broadcast.talking()')); i++) await wait(250);
    await wait(1200);
    const a = await ev('SS.audio.__dbg()');
    check('in a match: the crowd plays, the theme stops', !!a.bed && a.bed.playing && a.bed.vol > 0.1 && a.music.state === 'idle', JSON.stringify(a));
  } catch (err) {
    console.error(err); fails++;
  } finally {
    try { if (ws) ws.close(); } catch (e) { /* ignore */ }
    ff.kill();
    console.log(fails ? '\n' + fails + ' check(s) failed' : '\nAll checks passed');
    setTimeout(() => { try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* Firefox may still hold it */ } process.exit(fails ? 1 : 0); }, 800);
  }
})();
