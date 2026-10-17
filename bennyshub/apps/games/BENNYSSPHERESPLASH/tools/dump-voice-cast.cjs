#!/usr/bin/env node
/* Benny's Sphere Splash - the voice pipeline's export: the broadcast script and everything its lines
 * loop over, straight from the game's own files, as JSON on stdout.
 *
 *   node tools/dump-voice-cast.cjs
 *
 * The voice tools (Projects\Assets\tools\voice\produce.py, project file projects/sphere-splash.json)
 * run this themselves, so recorded lines always match the real script and rosters.
 *   lines        every line of content/voice-lines.json: { id, speaker, text, family }
 *   collections  players  { name, first, slug, pos, team: {id, name, short}, techs: [{ name, slug }] }
 *                teams    { id, name, short, slug }
 *                techs    { name, slug }  (every technique)
 *                formations { id, name, blurb, slug }
 * {player} is the first name in every call but the goal call, as game.js who() does.
 */
'use strict';
const vm = require('vm'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const ctx = vm.createContext({ console });
vm.runInContext(fs.readFileSync(path.join(root, 'js', 'data.js'), 'utf8'), ctx, { filename: 'data.js' });
const D = ctx.SS.DATA;
const script = JSON.parse(fs.readFileSync(path.join(root, 'content', 'voice-lines.json'), 'utf8'));
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const tech = k => ({ name: D.TECHS[k].name, slug: slug(D.TECHS[k].name) });

const teams = D.TEAMS.map(t => ({ id: t.id, name: t.name, short: t.short, slug: slug(t.short) }));
const out = {
  lines: Object.entries(script.families).flatMap(([family, ls]) => ls.map(l => ({ id: l.id, speaker: l.speaker, text: l.text, family }))),
  collections: {
    players: D.TEAMS.flatMap((t, i) => t.players.map(p => ({
      name: p.name, first: p.name.split(' ')[0], slug: slug(p.name), pos: p.pos,
      team: teams[i], techs: p.techs.map(tech),
    }))),
    teams,
    techs: Object.keys(D.TECHS).map(tech),
    formations: Object.entries(D.FORMATIONS).map(([id, f]) => ({ id, name: f.name, blurb: f.blurb, slug: slug(f.name) })),
  },
};
process.stdout.write(JSON.stringify(out, null, 1) + '\n');
