/** Layout regression checks for meaningful automatic jumps and safe landings. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const NKSpline = require('../js/spline.js');
const analysis = require('./tracks_analysis.js');
const ctx = { console, NKSpline, NK: {} }; ctx.window = ctx; vm.createContext(ctx);
['constants', 'themes', 'tracks'].forEach(name => vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/' + name + '.js'), 'utf8'), ctx));
const NK = ctx.NK, env = { NKSpline, C: NK.C, themes: NK.themes };
let count = 0;
for (const id of Object.keys(NK.tracks.TRACKS)) for (const mirror of [false, true]) {
  const track = NK.tracks.get(id, { mirror }), result = analysis.analyse(env, track);
  assert.deepEqual(result.issues, [], id + (mirror ? ' mirrored' : '') + ': ' + result.issues.join('; '));
  for (const ramp of track.features.ramps) {
    const obstacles = track.features.hazards.filter(h=>h.jumpObstacle&&h.rampAt===ramp.at);
    assert.equal(obstacles.length, 1);
    assert.deepEqual(Array.from(obstacles[0].lanes), Array.from(ramp.lanes));
    const arc = NK.C.JUMPS[ramp.kind];
    assert.equal(obstacles[0].rampOffset, arc.rampLength + arc.flightLength / 2);
    if (ramp.kind === 'jump') {
      const bypass = [0, 1, 2, 3, 4].filter(l=>!ramp.lanes.includes(l));
      assert(bypass.some(l=>bypass.includes(l+1)), 'optional jump leaves an adjacent ground bypass');
    }
    count++;
  }
}
function clone(id) { return JSON.parse(JSON.stringify(NK.tracks.get(id))); }
const underFlight = clone('candy'), glide = underFlight.features.ramps[0];
underFlight.features.coins[0] = { from: glide.at+0.015, to: glide.at+0.05, lane: 2 };
assert(analysis.analyse(env, underFlight).issues.some(message=>message.includes('flight / landing corridor')), 'validator rejects coins below a glide');
const badLanding = clone('meadow'), jump = badLanding.features.ramps[0];
badLanding.features.boostPads[0] = { at: jump.at+0.025, lanes: [2] };
assert(analysis.analyse(env, badLanding).issues.some(message=>message.includes('flies over or lands on')), 'validator rejects a boost panel in a jump landing zone');
const missingLink = clone('dunes');
missingLink.features.hazards.find(h=>h.jumpObstacle).jumpObstacle = false;
assert(analysis.analyse(env, missingLink).issues.some(message=>message.includes('exactly one linked obstacle')), 'a decorative empty-road ramp fails validation');
const misplaced = clone('frost');
misplaced.features.hazards.find(h=>h.jumpObstacle).rampOffset += 20;
assert(analysis.analyse(env, misplaced).issues.some(message=>message.includes('flight apex')), 'a block moved toward the landing fails validation');
console.log(count + ' real/mirrored ramps have useful obstacles and safe landing corridors; four malformed layouts rejected.');
