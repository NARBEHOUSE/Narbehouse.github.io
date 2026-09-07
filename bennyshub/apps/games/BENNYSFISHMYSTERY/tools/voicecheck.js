/**
 * Is every line that was recorded actually played?
 *
 *     node tools/voicecheck.js
 *
 * A hundred and thirteen lines were recorded into audio/vo. A recording is
 * only ever heard if the game speaks that line WITH its cue id - `U.speak`
 * plays the clip when it recognises the cue and reads the words with the
 * system voice when it does not - so a line can be recorded, correct, and
 * silent forever because one call site forgot to pass a string.
 *
 * Fifty-three of the hundred and thirteen were in exactly that state: all
 * thirty-five nudges, which no line of code had ever read, and eighteen
 * hand-in reactions, which the mission-complete card read out of `say.done`
 * with no cue attached.
 *
 * This is not something a screenshot or a playthrough can show - a silent
 * clip sounds exactly like a clip that was never recorded - so it is counted:
 * every cue in the manifest, matched against every place the game can speak
 * one.
 */
const fs = require('fs');
const path = require('path');
const H = require('./playtest.js');
const { G, RT, ok } = H;

const ROOT = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'audio/vo/index.json'), 'utf8'));
const recorded = Object.keys(manifest.lines || manifest);

/* ── EVERY CLIP THE MANIFEST NAMES IS ON THE DISK ─────────────────────── */
const missing = recorded.filter(c => {
  const f = (manifest.lines || manifest)[c];
  return !fs.existsSync(path.join(ROOT, 'audio/vo', f));
});
console.log('recorded lines: ' + recorded.length);
ok(missing.length === 0, 'every line the manifest names has a file (' +
   (missing.length ? missing.join(', ') : 'all present') + ')');

/* ── WHERE THE GAME CAN SPEAK A CUE ───────────────────────────────────── */
const quests = (RT.content.quests.quests || []);
const spoken = new Set();
const why = {};
const mark = (cue, place) => { if (cue) { spoken.add(cue); why[cue] = why[cue] || place; } };

/* Walt's briefing: briefSteps hands each line its own cue, and the interface
   passes it through as speechCue. */
quests.forEach(q => {
  ((q.lines && q.lines.brief) || []).forEach(c => mark(c, 'the briefing'));
  /* The hand-in reaction, spoken by the mission-complete card. */
  ((q.lines && q.lines.done) || []).forEach(c => mark(c, 'handing the job in'));
  /* And the nudge, when you come back to the counter without it done. */
  if (q.say && q.say.nudge) mark(q.id + '_nudge', 'coming back without it done');
});
mark('tackle_lost_1', 'a bare line at the counter');
mark('tackle_lost_again', 'a bare line at the counter, again');
/* And what he says at the counter, which belongs to no job: pooled so that
   the line a player hears at the end of every single trip is not the same
   line at the end of every single trip. */
const POOL_WHERE = { log: 'logging the catch', logBig: 'logging a good one',
                     logMany: 'logging an armful', logOne: 'logging a single tag',
                     hold: 'arriving with a boat full' };
Object.keys(RT.content.quests.waltPools || {}).forEach(function (name) {
  (RT.content.quests.waltPools[name] || []).forEach(function (c) {
    mark(c, POOL_WHERE[name] || ('the counter (' + name + ')'));
  });
});

/* A SCENE ON THE WATER can play one of his lines too - the sonar beat puts
   him on the shop radio - and those cues live in game.js's beatScript rather
   than in a job's cue list. Read from the source, so a line moved into a
   scene does not read as a line with nowhere to go. */
const gameSrc = fs.readFileSync(path.join(ROOT, 'js/game.js'), 'utf8');
const scenePart = gameSrc.slice(gameSrc.indexOf('function beatScript'),
                                gameSrc.indexOf('function takeBeat'));
/* One cue or a list of them - the sonar beat plays two, one after the other. */
(scenePart.match(/radio:\s*(?:'[a-z0-9_]+'|\[[^\]]*\])/g) || []).forEach(function (hit) {
  (hit.match(/'([a-z0-9_]+)'/g) || []).forEach(function (q) {
    mark(q.replace(/'/g, ''), 'over the radio, mid-scene');
  });
});

/* AND THE COUNTER'S OWN ONE-LINERS - hello, much obliged, that is on your
   boat now - which the interface asks for by id through waltSays('...'). They
   are the lines a player hears most, and the first time they were recorded
   this check called all eight of them silent. */
const uiSrc = fs.readFileSync(path.join(ROOT, 'js/ui.js'), 'utf8');
(uiSrc.match(/waltSays\('([a-z0-9_]+)'/g) || []).forEach(function (m) {
  mark(m.replace(/.*'([a-z0-9_]+)'.*/, '$1'), 'the counter, by the interface');
});

const silent = recorded.filter(c => !spoken.has(c));
console.log('lines the game can play: ' + recorded.filter(c => spoken.has(c)).length);
if (silent.length) {
  console.log('lines with nowhere to play:');
  silent.forEach(c => console.log('   ' + c + '  "' +
    String((RT.content.quests.walt || {})[c] || '').slice(0, 56) + '"'));
}
ok(silent.length === 0, 'every recorded line has a place in the game (' +
   silent.length + ' silent)');

/* ── AND THE CALL SITES REALLY PASS THE CUE ───────────────────────────── */
const ui = fs.readFileSync(path.join(ROOT, 'js/ui.js'), 'utf8');
ok(/U\.speak\([\s\S]{0,200}?meta\.speechCue/.test(ui),
   'a card speaks its line with the cue attached');
ok(/speechCue:\s*step\.cue/.test(ui),
   'and each step of a briefing speaks with its own cue');
ok(/speechSeq:\s*doneSeq/.test(ui),
   'and the job-done card plays the whole reaction, in order');
ok(/U\.speakSeq\(/.test(ui),
   'and a card can play more than one clip without them cancelling each other');
ok(/nudge\.cue/.test(ui),
   'and the counter speaks the nudge in his voice');
ok(/scene\.radio/.test(ui) && /playScene\(/.test(ui),
   'and a scene on the water plays his radio line by cue');

/* ── THE NUDGE IS REACHABLE ───────────────────────────────────────────── */
const sv = G.getSave();
sv.briefed = 99; sv.currentMission = 3; sv.highestMission = 3; sv.progressValue = 0;
const n = G.nudgeLine && G.nudgeLine();
console.log();
console.log('with job 3 open, the counter says: ' + (n ? '"' + n.text.slice(0, 60) + '" [' + n.cue + ']' : '(nothing)'));
ok(!!n, 'coming back with the job open gets a nudge');
if (n) {
  ok(recorded.indexOf(n.cue) >= 0, 'and it is a line that was recorded (' + n.cue + ')');
  /* And it stops the moment the job IS done, because then he has better to
     say and a nudge would be him ignoring what you just brought in. */
  sv.progressValue = 999;
  ok(!(G.nudgeLine && G.nudgeLine()), 'and he stops nudging once it is done');
}

/* ── THE TWO COPIES OF THE SCRIPT AGREE ───────────────────────────────────
   `walt[cue]` is what the game speaks and what was recorded. `say.brief` is a
   joined copy used only when a job has no cue list. Corrections have gone
   into the copy twice now and never reached the player. */
const norm = (t) => String(t || '').replace(/\s+/g, ' ').trim();
const drift = [];
quests.forEach(q => {
  const cues = (q.lines && q.lines.brief) || [];
  if (!cues.length) return;
  const heard = cues.map(c => norm((RT.content.quests.walt || {})[c])).join(' ');
  const filed = norm(q.say && q.say.brief);
  if (heard && filed && heard.slice(0, 60) !== filed.slice(0, 60)) {
    drift.push({ id: q.id, card: q.card || '', heard: heard.slice(0, 64), filed: filed.slice(0, 64) });
  }
});
console.log();
if (drift.length) {
  console.log('JOBS WHERE THE SPOKEN SCRIPT AND THE FILED TEXT DISAGREE');
  drift.forEach(d => {
    console.log('  ' + d.id + '  ' + d.card.slice(0, 52));
    console.log('     he says : ' + d.heard);
    console.log('     filed   : ' + d.filed);
  });
  console.log();
  console.log('  Fixing these means rewriting the `walt` lines - and re-recording them,');
  console.log('  because the clips were made from the words as they stand.');
}
ok(drift.length === 0,
   'the words Walt speaks are the words the content says he speaks (' +
   drift.length + ' jobs adrift)');

/* ── WHAT IS LEFT TO RECORD ───────────────────────────────────────────────
   Every line Walt can say, against the manifest. The ones with no clip are
   read by the system voice, which works - it is just not him. */
const every = [];
quests.forEach(q => {
  ((q.lines && q.lines.brief) || []).forEach(c => every.push([c, 'briefing job ' + q.n]));
  ((q.lines && q.lines.done) || []).forEach(c => every.push([c, 'handing job ' + q.n + ' in']));
  if (q.say && q.say.nudge) every.push([q.id + '_nudge', 'nudge on job ' + q.n]);
});
every.push(['tackle_lost_1', 'a bare line'], ['tackle_lost_again', 'a bare line again']);
Object.keys(RT.content.quests.waltPools || {}).forEach(function (name) {
  (RT.content.quests.waltPools[name] || []).forEach(function (c) {
    every.push([c, POOL_WHERE[name] || ('the counter (' + name + ')')]);
  });
});
const seen2 = {};
const todo = every.filter(([c]) => {
  if (seen2[c]) return false;
  seen2[c] = 1;
  return recorded.indexOf(c) < 0;
});
console.log();
console.log("WALT'S SCRIPT: " + Object.keys(seen2).length + ' lines, ' +
            (Object.keys(seen2).length - todo.length) + ' of them in his own voice');
if (todo.length) {
  console.log('still read by the system voice:');
  todo.forEach(([c, where]) => {
    const t = String((RT.content.quests.walt || {})[c] || '');
    console.log('   ' + c.padEnd(12) + where.padEnd(22) + '"' + t.slice(0, 44) + '..."');
  });
  console.log();
  console.log('   Record them in tools/record.html - it lists exactly these as outstanding.');
}

/* ── IS EACH CLIP THE LENGTH ITS LINE SHOULD BE? ──────────────────────────
   The one mistake a hand-off can make and nothing else would catch: the right
   words saved under the wrong filename, or a line read short. The manifest
   would be complete, the fetch would return 200, and Walt would confidently
   say the wrong thing. Speech runs about two and a half words a second. */
function mp3Seconds(file) {
  const d = fs.readFileSync(path.join(ROOT, 'audio/vo', file));
  let i = 0;
  if (d[0] === 0x49 && d[1] === 0x44 && d[2] === 0x33) {
    i = 10 + ((d[6] << 21) | (d[7] << 14) | (d[8] << 7) | d[9]);
  }
  while (i < d.length - 4 && !(d[i] === 0xFF && (d[i + 1] & 0xE0) === 0xE0)) i++;
  const table = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
  const kbps = table[(d[i + 2] >> 4) & 0xF];
  if (!kbps) return null;
  return (d.length - i) * 8 / (kbps * 1000);
}

const waltText = RT.content.quests.walt || {};
const oddLength = [];
Object.keys(manifest.lines || manifest).forEach(function (cue) {
  const text = waltText[cue];
  if (!text) return;                       // a nudge or a player line: skip
  let secs = null;
  try { secs = mp3Seconds((manifest.lines || manifest)[cue]); } catch (e) { return; }
  if (!secs) return;
  const words = text.split(/\s+/).filter(Boolean).length;
  const rate = words / secs;
  if (rate < 1.4 || rate > 4.6) oddLength.push(cue + ' (' + words + ' words in ' +
                                               secs.toFixed(1) + 's)');
});
console.log();
console.log('clip lengths checked against their lines: ' +
            (oddLength.length ? oddLength.join(', ') : 'all of them sound about right'));
ok(oddLength.length === 0,
   'every clip is about as long as the line it is meant to be');

/* ── A BEAT BETWEEN ONE LINE AND THE NEXT ────────────────────────────────
   Reported: "the TTS sometimes doesn't complete... I like the interrupt but I
   think between events it should have a little padding to let the TTS
   finish." So the two kinds of talking were split, and the split is the thing
   worth holding: what the INTERFACE says still cuts in the instant a switch
   is pressed - a scan that queued would be a scan you cannot steer - and what
   the WORLD says waits for the voice to go quiet.

   Driven against a pretend speech engine, because the real one only exists in
   a browser. */
(function () {
  const U = RT.util;
  if (!U || !U.speakEvent) { ok(false, 'the speech layer knows the difference'); return; }
  /* AND THE WORLD ACTUALLY USES IT. The mechanism can be perfect and unused:
     say() is the one door everything on the lake speaks through, so that is
     the line to hold. */
  const gameSrc = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'js', 'game.js'), 'utf8');
  ok(/function say\(text\)[\s\S]{0,600}?U\.speakEvent\(text\)/.test(gameSrc),
     'everything the lake says goes through the queue, not straight to the voice');
  /* EXCEPT THE FIGHT, which is the one thing on the lake that cannot wait
     its turn. Held here so nobody quietly routes it back through say(). */
  ok(/function sayFight\(text[\s\S]{0,400}?U\.speakUrgent\(text\)/.test(gameSrc),
     'the fight cuts in rather than queueing behind the lake');
  ok(/sayFight\(run\.bite\.category === 'fish'[^\n]*, true\)/.test(gameSrc),
     'and the start of a run is never the line that gets swallowed');

  const heard = [];
  let busy = false;
  global.window.speechSynthesis = { get speaking() { return busy; }, pending: false,
                                    cancel: function () { busy = false; } };
  global.window.NarbeVoiceManager = { speak: function (t) { heard.push(String(t)); } };

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  return (async function () {
    /* QUIET: a world line goes straight out. */
    heard.length = 0; busy = false;
    U.speakEvent('Sunfish on the left.');
    ok(heard.length === 1, 'with the voice quiet, the world speaks at once');

    /* BUSY: it waits rather than talking over what is being said. */
    heard.length = 0; busy = true;
    U.speakEvent('Pulling over for Sunfish.');
    await wait(400);
    ok(heard.length === 0, 'while something is being said, the world waits (' + heard.length + ')');
    busy = false;
    await wait(500);
    ok(heard.length === 1, 'and it says it once the voice is free');

    /* DEEP: a backlog is dropped from the front, so the voice never runs
       behind the boat. */
    heard.length = 0; busy = true;
    U.speakEvent('one'); U.speakEvent('two'); U.speakEvent('three'); U.speakEvent('four');
    busy = false;
    /* Long enough for the whole backlog to drain: a line, then a beat, then
       the next. */
    await wait(1600);
    ok(heard.length <= 2, 'a backlog is capped rather than queued up (' + heard.length + ' said)');
    ok(heard.indexOf('four') >= 0 && heard.indexOf('one') < 0,
       'and it is the STALE line that is dropped, not the newest (' + heard.join(' / ') + ')');

    /* PRESSING SOMETHING: the interface cuts in and throws the rest away. */
    heard.length = 0; busy = true;
    U.speakEvent('a shoal you have left behind');
    U.speak('Tackle shop');
    busy = false;
    await wait(900);
    ok(heard.indexOf('a shoal you have left behind') < 0,
       'pressing a switch drops what the world was waiting to say');

    /* A RUN CANNOT WAIT. Seven tenths of a second of warning, so the line
       goes out over whatever is being said rather than after it. */
    heard.length = 0; busy = true;
    U.speakEvent('a shoal you have left behind');
    U.speakUrgent("She's running!");
    ok(heard.length === 1 && heard[0] === "She's running!",
       'a run is said the instant it starts, over whatever was talking (' +
       heard.join(' / ') + ')');
    busy = false;
    await wait(900);
    ok(heard.indexOf('a shoal you have left behind') < 0,
       'and the stale line behind it is dropped rather than said late');

    const res2 = H.results();
    console.log();
    console.log(res2.fail === 0
      ? res2.checks + ' checks passed. Every recorded line has a moment to be said in.'
      : res2.fail + ' of ' + res2.checks + ' checks failed.');
    process.exit(res2.fail ? 1 : 0);
  })();
})();

