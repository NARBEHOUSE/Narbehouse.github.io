#!/usr/bin/env node
/* ROBOTFOOTBALL — print the broadcast script for the voice pipeline (Projects/Assets/tools/voice, produce.py):
 *   {"lines": [{id, speaker, text, family, note}], "collections": {"teams": [{id, name, slug}]}}
 * Replies are flattened into lines of their own (each is its own recording). A team's name is written the way
 * js/commentary.js captions it ("Blueborgs"); its id is the clip key suffix ("pa_td_1@blue").
 *   node tools/dump-voice-cast.cjs
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(root, 'content', 'voice-lines.json'), 'utf8'));
const lines = [];
for (const [family, list] of Object.entries(data.families)) {
  for (const l of list) for (const x of [l, l.reply].filter(Boolean)) lines.push({ id: x.id, speaker: x.speaker, text: x.text, family, note: x.note || '' });
}
const ctx = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(root, 'js', 'season.js'), 'utf8') + ';this.T = FootballSeason.TEAMS;', ctx);
const teams = Array.from(ctx.T, t => ({ id: t.id, name: t.name.charAt(0) + t.name.slice(1).toLowerCase(), slug: t.id }));
process.stdout.write(JSON.stringify({ lines, collections: { teams } }));
