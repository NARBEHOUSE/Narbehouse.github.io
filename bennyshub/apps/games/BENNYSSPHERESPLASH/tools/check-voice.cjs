#!/usr/bin/env node
/* Benny's Sphere Splash - the voice slot contract. No dependencies.
 *
 *   node tools/check-voice.cjs
 *
 * Passes with no recordings at all (every line then falls back to captions and the
 * system voice). As recordings arrive it keeps them honest:
 *  - every line family the game can ask for (say('family' ...) in js/) exists and has lines;
 *  - every line has an id, a known speaker and text, and ids are unique;
 *  - js/voice-lines.generated.js matches content/voice-lines.json (when the source is here);
 *  - every clip listed in audio/vo/index.json is a real line id and a real file, with the
 *    exact filename case (GitHub Pages is case-sensitive; Windows is not). A clip key is a line
 *    id, or "<line id>@<who>" for one line recorded per player/team (pbp_goal_1@benji-tide);
 *    a piece (V.pieces: pbp_int_3_b@monarchs, pa_score_n@two) is a clip that only exists as part of a longer line;
 *  - js/voice-index.generated.js (the same index as a script, for file://) matches index.json.
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
let fails = 0;
const check = (name, ok, detail) => { console.log((ok ? '  PASS ' : '  FAIL ') + name + (detail ? '  - ' + detail : '')); if (!ok) fails++; };

const ctx = { SS: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'js', 'voice-lines.generated.js'), 'utf8'), ctx);
const V = ctx.SS.VOICE_LINES;
check('the generated script loads', !!(V && V.families && V.speakers));

const src = path.join(root, 'content', 'voice-lines.json');
if (fs.existsSync(src)) {
  const same = JSON.stringify(JSON.parse(fs.readFileSync(src, 'utf8'))) === JSON.stringify(V);
  check('the bundle matches content/voice-lines.json', same, same ? '' : 'run node tools/build-voice-lines.cjs');
}

const used = new Set();
for (const f of fs.readdirSync(path.join(root, 'js')).filter(f => f.endsWith('.js'))) {
  const text = fs.readFileSync(path.join(root, 'js', f), 'utf8');
  for (const m of text.matchAll(/\bsay\(\s*'(\w+)'/g)) used.add(m[1]);
}
const missing = [...used].filter(f => !(V.families[f] && V.families[f].length));
check('every family the game asks for has lines', missing.length === 0, missing.length ? missing.join(', ') : used.size + ' families');

const ids = new Map(), bad = [];
for (const [fam, lines] of Object.entries(V.families)) for (const l of lines) {
  if (!l.id || !l.text || !V.speakers[l.speaker]) bad.push(fam + ':' + (l.id || '?'));
  if (ids.has(l.id)) bad.push('duplicate ' + l.id);
  ids.set(l.id, l);
}
check('every line has an id, a known speaker and text; ids unique', bad.length === 0, bad.join(', ') || ids.size + ' lines');

const idx = JSON.parse(fs.readFileSync(path.join(root, 'audio', 'vo', 'index.json'), 'utf8'));
const clips = idx.lines || {};
const dir = path.join(root, 'audio', 'vo');
const listing = new Set(walk(dir).map(p => path.relative(dir, p).split(path.sep).join('/')));
const problems = [];
for (const [id, file] of Object.entries(clips)) {
  const base = id.split('@')[0];
  if (!ids.has(base) && !(V.pieces && V.pieces[base])) problems.push(id + ': not a line id or a piece');
  if (!listing.has(file)) problems.push(id + ': ' + file + (fs.existsSync(path.join(dir, file)) ? ' (filename case differs)' : ' (missing)'));
}
check('every recorded clip is a real line and a real file (exact case)', problems.length === 0,
  problems.join('; ') || (() => {
    // a line is voiced by its own clips, or (a split line) by clips for every one of its parts
    const bases = new Set(Object.keys(clips).map(k => k.split('@')[0]));
    const voiced = [...ids.values()].filter(l => l.parts ? l.parts.every(p => bases.has(p.split('@')[0])) : bases.has(l.id)).length;
    return Object.keys(clips).length + ' clips for ' + voiced + ' lines, ' + (ids.size - voiced) + ' lines on captions + system voice';
  })());

// every part of a line recorded in parts is a line id or a piece (the build script enforces it too), and when
// recordings exist for the line's pieces the clips it needs are all there
const partBad = [];
for (const lines of Object.values(V.families)) for (const l of lines) for (const part of l.parts || []) {
  const base = part.split('@')[0];
  if (!ids.has(base) && !(V.pieces && V.pieces[base])) partBad.push(l.id + ': ' + part);
}
check('every part of a split line is a line id or a piece', partBad.length === 0, partBad.join(', ') || Object.values(V.families).flat().filter(l => l.parts).length + ' split lines');

const jsIdx = path.join(root, 'js', 'voice-index.generated.js');
if (fs.existsSync(jsIdx)) {
  const c = { SS: {} };
  vm.runInNewContext(fs.readFileSync(jsIdx, 'utf8'), c);
  const same = JSON.stringify(c.SS.VOICE_INDEX) === JSON.stringify(idx);
  check('js/voice-index.generated.js matches audio/vo/index.json', same, same ? '' : 'run the voice pipeline ship step again');
}

function walk(d) { return fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]); }

console.log(fails ? '\n' + fails + ' check(s) failed' : '\nAll checks passed');
process.exit(fails ? 1 : 0);
