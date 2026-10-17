/** Benny's Sphere Splash - checks the sound files (no browser needed).
 *    node tools/check-audio.cjs
 *  - every sound js/audio.js asks for exists, as 16-bit PCM WAV at 22,050 Hz
 *  - nothing clips, and nothing is silent
 *  - the music loop: its tail is a copy of its opening (the gapless player depends on it),
 *    js/audio-files.generated.js has its true length, and the seam has no click
 *  - the package stays a sensible size
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const GAME = path.resolve(__dirname, '..');
let fails = 0;
const check = (name, ok, detail) => { console.log((ok ? '  PASS ' : '  FAIL ') + name + (detail ? '  - ' + detail : '')); if (!ok) fails++; };

function readWav(file) {
  const b = fs.readFileSync(file);
  const ok = b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WAVE' && b.readUInt16LE(20) === 1;
  const ch = b.readUInt16LE(22), rate = b.readUInt32LE(24), bits = b.readUInt16LE(34), n = (b.length - 44) / (2 * ch);
  const data = Array.from({ length: ch }, () => new Float32Array(n));
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) data[c][i] = b.readInt16LE(44 + (i * ch + c) * 2) / 32768;
  return { ok, ch, rate, bits, n, data, bytes: b.length };
}

// What audio.js asks for.
const src = fs.readFileSync(path.join(GAME, 'js', 'audio.js'), 'utf8');
const list = (re) => { const m = src.match(re); return m ? m[1].match(/'([^']+)'/g).map(s => s.slice(1, -1)) : []; };
const sfx = list(/const SFX = \[([^\]]+)\]/), cues = list(/const CROWD_CUES = \[([^\]]+)\]/);
const stings = Object.keys(eval('(' + src.match(/const STINGS = (\{[^}]+\})/)[1] + ')'));
const want = [...sfx.map(n => 'sfx/' + n), ...cues.map(n => 'crowd/' + n), 'crowd/bed', ...stings.map(n => 'music/' + n), 'music/theme'];
check('audio.js names its sounds', sfx.length >= 12 && cues.length === 3 && stings.length === 3, want.length + ' files');

let total = 0;
const bad = [], loud = [], quiet = [];
for (const w of want) {
  const f = path.join(GAME, 'audio', w + '.wav');
  if (!fs.existsSync(f)) { bad.push(w + ' missing'); continue; }
  const a = readWav(f);
  total += a.bytes;
  if (!a.ok || a.bits !== 16 || a.rate !== 22050) { bad.push(w + ' format'); continue; }
  let pk = 0, sq = 0; for (const c of a.data) for (const v of c) { pk = Math.max(pk, Math.abs(v)); sq += v * v; }
  if (pk > 0.95) loud.push(w + ' ' + pk.toFixed(2));
  if (Math.sqrt(sq / (a.n * a.ch)) < 0.005) quiet.push(w);
}
check('every sound exists as 16-bit, 22,050 Hz PCM WAV', bad.length === 0, bad.join(', '));
check('nothing clips', loud.length === 0, loud.join(', '));
check('nothing is silent', quiet.length === 0, quiet.join(', '));

// The loop.
const ctx = { SS: {} }; vm.runInNewContext(fs.readFileSync(path.join(GAME, 'js', 'audio-files.generated.js'), 'utf8'), ctx);
const meta = ctx.SS.AUDIO_FILES.theme, th = readWav(path.join(GAME, 'audio', 'music', 'theme.wav'));
const loopN = Math.round(meta.sec * th.rate), tailN = Math.round(meta.tail * th.rate);
check('the theme file is its loop plus its tail', Math.abs(th.n - (loopN + tailN)) <= 1, th.n + ' frames vs ' + (loopN + tailN));
let same = true; for (const c of th.data) for (let i = 0; i < tailN && same; i++) if (c[loopN + i] !== c[i]) same = false;
check('the tail is a copy of the opening (gapless loop)', same);
let typ = 0; for (let i = 1; i < loopN; i++) typ += Math.abs(th.data[0][i] - th.data[0][i - 1]);
typ /= loopN;
const seam = Math.abs(th.data[0][loopN - 1] - th.data[0][0]);
check('the loop seam has no click', seam < typ * 4, 'step ' + seam.toFixed(4) + ' vs typical ' + typ.toFixed(4));

check('the sound package stays under 8 MB', total < 8 * 1048576, (total / 1048576).toFixed(2) + ' MB');
console.log(fails ? '\n' + fails + ' check(s) failed' : '\nAll checks passed');
process.exit(fails ? 1 : 0);
