#!/usr/bin/env node
"use strict";
/* ROBOTFOOTBALL — headless check of the broadcast (js/broadcast.js + js/commentary.js) over autoplayed games.
 * Plays N whole games through the real simulation with random but sensible choices, feeds every event to the real
 * commentary director, and reports per game: which lines are asked for (after play rates), which game events have
 * their spoken line REPLACED by a commentary call, and which keep the system voice. Use it after changing the
 * script, the play rates or the director: only the planned live calls should be replaced.
 *   node tools/check-commentary.cjs [games=200]
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const dir = require("path").join(__dirname, ".."), GAMES = +(process.argv[2] || 200);
let clock = 0; let timers = [], tid = 0;
function tick(dt) { clock += dt; for (let guard = 0; guard < 50; guard++) { const due = timers.filter(x => x.due <= clock); if (!due.length) break; timers = timers.filter(x => x.due > clock); due.forEach(x => x.fn()); } }
const store = {};
const ctx = vm.createContext({
  Math, JSON, console, Number, String, Object, Array, Set, Map, RegExp, Promise,
  performance: { now: () => clock * 1000 },
  setTimeout: (fn, ms) => { const id = ++tid; timers.push({ id, due: clock + (ms || 0) / 1000, fn }); return id; }, clearTimeout: id => { timers = timers.filter(x => x.id !== id); },
  localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; } },
  Audio: class { constructor() { this.paused = true; this.ended = true; } play() { return Promise.resolve(); } pause() {} },
});
ctx.window = ctx; ctx.globalThis = ctx;
for (const f of ['js/simulation.js', 'js/season.js', 'js/voice-lines.generated.js', 'js/voice-index.generated.js', 'js/broadcast.js', 'js/commentary.js'])
  vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f });
const { FootballSim: Sim, FootballSeason, FootballBroadcast: bc, FootballCommentary } = ctx;
bc.init({ floor: () => false, ttsBusy: () => false, mode: () => 'full', voiceOn: () => true, caption: () => null });
const pick = a => a[Math.floor(Math.random() * a.length)];
const add = (m, k, n = 1) => { m[k] = (m[k] || 0) + n; };
const said = {}, replaced = {}, kept = {};
const home = FootballSeason.TEAMS[1], away = FootballSeason.TEAMS[0];
let sim;
const comm = FootballCommentary.create({ bc, voiced: () => true, state: () => ({ sim, home, away, gameMode: 'exhibition', season: null }) });
const origSay = bc.say;
bc.say = (fam, slots, pri, o) => { const t = origSay(fam, slots, pri, o); if (t) add(said, fam); return t; };

for (let g = 0; g < GAMES; g++) {
  sim = new Sim({ format: 'regulation', pace: 0.45, kickoffs: true, difficulty: 'rookie' }, e => {
    tick(0.001);
    const r = comm.event(e);
    const key = e.type + (e.type === 'catch' || e.type === 'broken' || e.type === 'touchdown' ? (e.state.possession === 'home' ? ':home' : ':away') : '');
    if (e.text) add(r ? replaced : kept, key);
  });
  comm.startGame(); comm.intro();
  let steer = 0, guard = 0;
  while (sim.s.phase !== 'final' && guard++ < 400000) {
    const s = sim.s;
    if (s.phase === 'playcall') {
      const book = sim.playbook(); let choice;
      if (s.toss) choice = pick(book).id;
      else if (s.conversion === 'choose') choice = Math.random() < .85 ? 'extrapoint' : 'gofortwo';
      else if (s.possession === 'home' && !s.kickoff && !s.conversion) {
        const toGoal = 100 - s.fieldPosition;
        if (s.down === 4) choice = toGoal < 35 ? 'fieldgoal' : 'punt';
        else choice = pick(['slants', 'slants', 'flood', 'verticals', 'sweep', 'inside', 'inside']);
      } else choice = pick(book).id;
      if (!sim.callPlay(choice)) sim.callPlay(book[0].id);
      tick(3); continue;
    }
    if (s.phase === 'aim') { sim.selectTarget(Math.floor(Math.random() * s.targets.length)); sim.throwPass(Math.random() < .8 ? undefined : Math.random()); continue; }
    if (s.phase === 'kickaim') { sim.setKickAim((Math.random() - .5) * .5); sim.kick(Math.random() < .85 ? undefined : Math.random()); continue; }
    if (s.phase === 'returnchoice') { sim.chooseReturn(Math.random() < .5); continue; }
    if (s.phase === 'result' && s.resultRevealRemaining <= 0) { tick(2); sim.continuePlay(); continue; }
    if (Math.random() < .05) steer = pick([-1, 0, 0, 1]);
    sim.step(0.05, steer); tick(0.05); comm.live(sim.s);
  }
}
const per = m => Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, v]) => (v / GAMES).toFixed(2).padStart(7) + '  ' + k).join('\n');
console.log(`${GAMES} games. Lines asked for per game (after play rates):\n` + per(said));
console.log('\nGame events whose spoken line is REPLACED per game:\n' + per(replaced));
console.log('\nGame events that KEEP the system voice per game:\n' + per(kept));
const fams = Object.keys(ctx.RF_VOICE_LINES.families).filter(f => !said[f]);
console.log('\nFamilies never used in these games:', fams.join(', '));
