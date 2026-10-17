/** Benny's Sphere Splash - whole matches in Firefox, listening to the broadcast.
 *    node tools/check-firefox-match.cjs [matches=3] [path-to-firefox]
 *
 *  The commentary bugs Bryan heard (silent calls, cut-off scores) never showed in check-browser.cjs:
 *  Chrome with autoplay allowed, stubbed audio and coach mode. This plays real matches in Firefox -
 *  hidden, muted, from file:// as he opens the game - picking decisions with real Space/Enter presses,
 *  and changing formation at some decisions (as the Huddle does). It watches every line the broadcast
 *  voices and reports, per family: played from its recording to the end, cut off (and by what), read
 *  by the system voice, or dropped; the gap between the parts of a split line; and whether the caption
 *  stayed up while its clip played. Report only - it fails on a recorded line that falls back to the
 *  system voice, a split line played out of order, or a caption gone before its clip ended.
 *  Skips (exit 0) if Firefox is not installed. Writes the raw log to <tmp>/sphere-splash-match-log.json.
 */
'use strict';
const { spawn } = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
const wait = ms => new Promise(r => setTimeout(r, ms));
const GAME = path.resolve(__dirname, '..');
const MATCHES = Math.max(1, parseInt(process.argv[2], 10) || 3);
let fails = 0;
const check = (name, ok, detail) => { console.log((ok ? '  PASS ' : '  FAIL ') + name + (detail ? '  - ' + detail : '')); if (!ok) fails++; };

// In the page: wrap the broadcast and every <audio> play, sample the caption and the context.
const PROBE = `(() => {
  if (window.__probe) return true;
  const P = window.__probe = { says: [], clips: [], tts: [], hush: [], ctx: [], cap: [], t0: performance.now() };
  const now = () => Math.round(performance.now() - P.t0);
  const B = SS.broadcast, say = B.say, hush = B.hush, speakAs = SS.util.speakAs;
  B.say = function (family, slots, pri) { const text = say.apply(this, arguments); P.says.push({ at: now(), family, pri: pri || 1, text }); return text; };
  B.hush = function () { P.hush.push({ at: now(), ctx: SS.ui.context(), screen: SS.ui.screen }); return hush.apply(this, arguments); };
  SS.util.speakAs = function (text) { P.tts.push({ at: now(), text, ui: !!(SS.util.uiSpokeRecently && SS.util.uiSpokeRecently(50)) }); return speakAs.apply(this, arguments); };
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    const src = decodeURIComponent(this.src || '');
    if (/audio\\/vo\\//.test(src)) {
      const c = { file: src.split('audio/vo/')[1], at: now(), end: null, cut: null, dur: null, played: null };
      P.clips.push(c);
      this.addEventListener('playing', () => { c.played = now(); }, { once: true });
      this.addEventListener('ended', () => { c.end = now(); c.dur = Math.round(this.duration * 1000); }, { once: true });
      this.addEventListener('pause', () => { if (!this.ended && c.end == null) { c.cut = { at: now(), t: Math.round(this.currentTime * 1000), dur: Math.round(this.duration * 1000), ctx: SS.ui.context(), screen: SS.ui.screen }; } }, { once: true });
    }
    return play.apply(this, arguments);
  };
  let lastCtx = '', lastCap = '';
  setInterval(() => {
    const c = SS.ui.context(); if (c !== lastCtx) { P.ctx.push({ at: now(), ctx: c, screen: SS.ui.screen }); lastCtx = c; }
    const el = document.getElementById('caption'), on = el && el.classList.contains('on') ? el.textContent : '';
    if (on !== lastCap) { P.cap.push({ at: now(), text: on }); lastCap = on; }
  }, 50);
  return true;
})()`;

(async () => {
  const exe = [process.argv[3], 'C:/Program Files/Mozilla Firefox/firefox.exe', 'C:/Program Files (x86)/Mozilla Firefox/firefox.exe',
    '/usr/bin/firefox', '/Applications/Firefox.app/Contents/MacOS/firefox'].find(p => p && fs.existsSync(p));
  if (!exe) { console.log('Firefox not found - skipped.'); process.exit(0); }
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-firefox-'));
  // Silent: no sound out, no system voice. Autoplay stays at Firefox's default (hold audible sound).
  fs.writeFileSync(path.join(profile, 'user.js'), 'user_pref("media.volume_scale", "0.0");\nuser_pref("media.webspeech.synth.enabled", false);\n');
  const port = 9300 + Math.floor(Math.random() * 500);
  const ff = spawn(exe, ['-headless', '-no-remote', '-profile', profile, '--remote-debugging-port=' + port, 'about:blank']);
  let ws = null, log = null;
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
      if (!r.result || !r.result.result) throw Error(x.slice(0, 80) + ': ' + JSON.stringify(r).slice(0, 300));
      return JSON.parse(r.result.result.value);
    };
    const key = k => call('input.performActions', { context: ctx, actions: [{ type: 'key', id: 'kb', actions: [{ type: 'keyDown', value: k }, { type: 'pause', duration: 90 }, { type: 'keyUp', value: k }] }] });
    const SPACE = ' ', ENTER = '\uE007';

    await call('browsingContext.navigate', { context: ctx, url: 'file:///' + path.join(GAME, 'index.html').split(path.sep).join('/'), wait: 'complete' });
    for (let i = 0; i < 300 && !(await ev('!!(window.SS && SS.ui && SS.ui.screen === "title")')); i++) await wait(100);
    await wait(1500);
    await key(SPACE); await wait(800);                              // a first key press, as a player gives (unlocks sound)
    await ev(PROBE);
    const forms = await ev('Object.keys(SS.DATA.FORMATIONS)');
    const teams = await ev('SS.DATA.TEAMS.map(t => t.id)');
    let decisions = 0, shapes = 0;
    for (let n = 0; n < MATCHES; n++) {
      const them = teams.filter(t => t !== 'beamers')[n % (teams.length - 1)];
      await ev(`(SS.save.settings.set('stops', 'both'), SS.save.clearMatch(), SS.game.startQuick(['beamers', '${them}']), SS.game.kickoff(), 1)`);
      const t0 = Date.now();
      while (Date.now() - t0 < 15 * 60 * 1000) {
        await wait(250);
        const u = await ev('({ ctx: SS.ui.context(), screen: SS.ui.screen, pending: !!(SS.game.match && SS.game.match.pending), dbg: SS.ui.__dbg && SS.ui.__dbg().index })');
        if (u.screen === 'results') break;
        if (u.screen === 'halftime') { await ev('(SS.game.startSecondHalf(), 1)'); continue; }
        if (u.screen === 'pause') { await ev('(SS.ui.resumeFromCard(), 1)'); continue; }
        if (u.ctx === 'world' && u.pending) {
          // the Huddle's change of shape: every third decision, a different formation, then the pick
          if (decisions % 3 === 2) { const f = forms[Math.floor(Math.random() * forms.length)]; await ev(`(SS.game.setFormation('${f}'), 1)`); shapes++; }
          await wait(700);
          const moves = Math.floor(Math.random() * 3);
          for (let i = 0; i < moves; i++) { await key(SPACE); await wait(450); }
          await key(ENTER); await wait(450);
          // a pick that landed on a menu item (Pause / Huddle) rather than an option: back to play
          const after = await ev('({ screen: SS.ui.screen, ctx: SS.ui.context() })');
          if (after.screen === 'pause') await ev('(SS.ui.resumeFromCard(), 1)');
          else if (after.ctx === 'card' && after.screen !== 'halftime' && after.screen !== 'results') await ev('(SS.game.resume(), 1)');
          decisions++;
        }
      }
      const score = await ev('SS.game.matchInfo().score');
      console.log(`match ${n + 1}: Beamers v ${them} ${score.join('-')} in ${Math.round((Date.now() - t0) / 1000)} s`);
    }
    await wait(1500);
    log = await ev('window.__probe');
    log.lines = await ev('SS.VOICE_LINES.families');
    fs.writeFileSync(path.join(os.tmpdir(), 'sphere-splash-match-log.json'), JSON.stringify(log, null, 1));
    report(log, decisions, shapes);
  } catch (err) {
    console.error(err); fails++;
  } finally {
    try { if (ws) ws.close(); } catch (e) { /* ignore */ }
    ff.kill();
    console.log(fails ? '\n' + fails + ' check(s) failed' : '\nAll checks passed');
    setTimeout(() => { try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* Firefox may still hold it */ } process.exit(fails ? 1 : 0); }, 800);
  }
})();

function report(P, decisions, shapes) {
  const famOf = {};
  for (const [fam, lines] of Object.entries(P.lines)) for (const l of lines) famOf[l.id] = fam;
  const famOfFile = f => famOf[f.split('/')[1].replace(/\.mp3$/, '').split('__')[0]] || (/col_form_what|pa_score_|pbp_int_3_/.test(f) ? 'part' : '?');
  console.log(`\n${P.says.length} lines asked for, ${P.clips.length} clips started, ${P.tts.filter(t => !t.ui).length} commentary lines read by the system voice, ${decisions} decisions, ${shapes} changes of shape`);
  // clips per family: to the end / cut, and who cut them
  const fam = {};
  for (const c of P.clips) {
    const f = famOfFile(c.file), r = fam[f] = fam[f] || { n: 0, ended: 0, cut: 0, cutBy: {}, open: 0 };
    r.n++;
    if (c.end != null) r.ended++;
    else if (c.cut) { r.cut++; const by = c.cut.ctx + (c.cut.screen ? '/' + c.cut.screen : ''); r.cutBy[by] = (r.cutBy[by] || 0) + 1; }
    else r.open++;
  }
  console.log('\nclips by family (to the end / cut off / still playing at the end):');
  for (const [f, r] of Object.entries(fam).sort((a, b) => b[1].n - a[1].n)) {
    console.log(`  ${f.padEnd(20)} ${String(r.n).padStart(4)}  ended ${r.ended}  cut ${r.cut}${r.cut ? ' (' + Object.entries(r.cutBy).map(([k, v]) => k + ' x' + v).join(', ') + ')' : ''}${r.open ? '  open ' + r.open : ''}`);
  }
  const cuts = P.clips.filter(c => c.cut);
  const cutShare = cuts.map(c => c.cut.t / Math.max(1, c.cut.dur));
  if (cuts.length) console.log(`  cut-off clips were on average ${Math.round(100 * cutShare.reduce((a, b) => a + b, 0) / cuts.length)}% through`);

  // split lines: the parts play in order, with a short gap
  const gaps = [], disorder = [];
  for (let i = 0; i + 1 < P.clips.length; i++) {
    const a = P.clips[i], b = P.clips[i + 1];
    if (/^formations\/col_form_(us|them)_/.test(a.file)) {
      if (/^formation_blurbs\//.test(b.file)) {
        const form = a.file.replace(/.*-(?=[a-z-]+\.mp3$)/, '');
        if (a.end != null) gaps.push(b.at - a.end);
        if (!a.file.endsWith(b.file.split('__')[1])) disorder.push(a.file + ' -> ' + b.file);
        void form;
      }
    }
  }
  const formStarts = P.clips.filter(c => /^formations\/col_form_(us|them)_/.test(c.file));
  const formDone = formStarts.filter(c => { const i = P.clips.indexOf(c), b = P.clips[i + 1]; return c.end != null && b && /^formation_blurbs\//.test(b.file) && b.end != null; });
  const formCut = formStarts.filter(c => !formDone.includes(c));
  console.log(`\nchanges of shape voiced: ${formStarts.length}; heard in full (line + description) ${formDone.length}; cut ${formCut.length}` +
    (formCut.length ? ' (' + formCut.map(c => { const i = P.clips.indexOf(c), b = P.clips[i + 1]; const w = c.cut ? 'line' : (b && b.cut ? 'description' : 'before the description'); const by = (c.cut || (b && b.cut) || {}); return w + ' by ' + (by.ctx || '?') + '/' + (by.screen || ''); }).join('; ') + ')' : ''));
  if (gaps.length) console.log(`  gap between her line and the description: ${Math.min(...gaps)}-${Math.max(...gaps)} ms (median ${gaps.sort((a, b) => a - b)[gaps.length >> 1]})`);
  check('a change of shape plays the description of the same shape, after her line', disorder.length === 0, disorder.slice(0, 3).join('; '));

  // the system voice reading a commentary line = a recording missing (or a split line short a part)
  const ttsLines = P.tts.filter(t => !t.ui);
  check('no commentary line falls back to the system voice', ttsLines.length === 0, ttsLines.slice(0, 4).map(t => t.text).join(' | '));

  // captions: up while the clip plays (a clip ending well after its caption went away)
  const late = [];
  for (const c of P.clips) {
    if (c.end == null) continue;
    const cap = P.cap.filter(x => x.at <= c.at + 200).pop();
    const off = P.cap.find(x => x.at > c.at && (!x.text || (cap && x.text !== cap.text)));
    if (cap && cap.text && off && off.at < c.end - 400 && !off.text) late.push(c.file + ' caption off ' + (c.end - off.at) + ' ms early');
  }
  check('every caption stays up until its clip has ended', late.length === 0, late.length + ' early: ' + late.slice(0, 4).join('; '));

  // lost: asked for and never captioned (it went stale in the queue). Chatter may lapse; a goal and its score may not.
  const lost = {}, asked = {};
  for (const s of P.says) {
    if (!s.text) continue;
    asked[s.family] = (asked[s.family] || 0) + 1;
    if (!P.cap.some(c => c.text && c.text.includes(s.text) && c.at >= s.at && c.at <= s.at + 15000)) (lost[s.family] = lost[s.family] || []).push(s.pri);
  }
  console.log('\nlines asked for / never heard, by family: ' + Object.entries(asked).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ' ' + v + (lost[k] ? ' (' + lost[k].length + ' lost)' : '')).join(', '));
  const mustLost = ['goal', 'goalScore', 'goalColor', 'halftime', 'fulltime', 'fulltimeWin', 'fulltimeDraw', 'secondHalf'].filter(f => lost[f]);
  check('every goal is called with its score and Coral\'s word, and every period with its score', mustLost.length === 0, mustLost.map(f => f + ' ' + lost[f].length + '/' + asked[f]).join(', '));
}
