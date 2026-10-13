/** Layout regression checks for meaningful automatic jumps, landscape gaps, loops and safe landings. */
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
let count = 0, gaps = 0;
for (const id of Object.keys(NK.tracks.TRACKS)) for (const mirror of [false, true]) {
  const track = NK.tracks.get(id, { mirror }), result = analysis.analyse(env, track);
  assert.deepEqual(result.issues, [], id + (mirror ? ' mirrored' : '') + ': ' + result.issues.join('; '));
  for (const ramp of track.features.ramps) {
    const obstacles = track.features.hazards.filter(h=>h.jumpObstacle&&h.rampAt===ramp.at);
    if (ramp.gap) {
      // A landscape gap is cleared by the jump itself: every lane, no block on the road.
      assert.equal(obstacles.length, 0, id + ' gap ramp has no road obstacle');
      assert.deepEqual(Array.from(ramp.lanes), [0, 1, 2, 3, 4], id + ' gap ramp spans every lane');
      gaps++;
    } else {
      assert.equal(obstacles.length, 1);
      assert.deepEqual(Array.from(obstacles[0].lanes), Array.from(ramp.lanes));
      const arc = NK.C.JUMPS[ramp.kind];
      assert.equal(obstacles[0].rampOffset, arc.rampLength + arc.flightLength / 2);
      if (ramp.kind === 'jump') {
        const bypass = [0, 1, 2, 3, 4].filter(l=>!ramp.lanes.includes(l));
        assert(bypass.some(l=>bypass.includes(l+1)), 'optional jump leaves an adjacent ground bypass');
      }
    }
    count++;
  }
}
// Every circuit has a landscape gap (DESIGN §4.4).
for (const id of Object.keys(NK.tracks.TRACKS)) assert(NK.tracks.TRACKS[id].features.ramps.some(r=>r.gap), id + ' has a landscape jump');

function clone(id) { return JSON.parse(JSON.stringify(NK.tracks.get(id))); }
const has = (track, text) => analysis.analyse(env, track).issues.some(message=>message.includes(text));
const rejected = [];
function reject(name, track, text) { assert(has(track, text), name); rejected.push(name); }

const underFlight = clone('candy'), glide = underFlight.features.ramps[0];
underFlight.features.coins[0] = { from: glide.at+0.015, to: glide.at+0.05, lane: 2 };
reject('validator rejects coins below a glide', underFlight, 'flight / landing corridor');
const badLanding = clone('meadow'), jump = badLanding.features.ramps[0];
badLanding.features.boostPads[0] = { at: jump.at+0.025, lanes: [2] };
reject('validator rejects a boost panel in a jump landing zone', badLanding, 'flies over or lands on');
const missingLink = clone('frost');
missingLink.features.hazards.find(h => h.jumpObstacle).jumpObstacle = false;
reject('a decorative empty-road ramp fails validation', missingLink, 'exactly one linked obstacle');
const misplaced = clone('frost');
misplaced.features.hazards.find(h=>h.jumpObstacle).rampOffset += 20;
reject('a block moved toward the landing fails validation', misplaced, 'flight apex');
const openGap = clone('dunes');
openGap.edges = openGap.edges.filter(e => !(e.left === 'wall' && e.right === 'wall'));
reject('a gap without guard walls fails validation', openGap, 'gap needs walls');
const narrowGap = clone('candy');
narrowGap.features.ramps[0].lanes = [1, 2, 3];
reject('a gap jump that misses lanes fails validation', narrowGap, 'span the whole road');
const bentLoop = clone('jungle');
bentLoop.pieces.find(p => p.kind === 'loop').at = 0.32;
reject('a loop off its straight fails validation', bentLoop, 'loop is not on a straight');
const crowdedLoop = clone('isles');
crowdedLoop.features.boostPads[0] = { at: crowdedLoop.pieces.find(p => p.kind === 'loop').at + 0.02, lanes: [2] };
reject('a pad inside a loop fails validation', crowdedLoop, '(loop)');
const dryFalls = clone('isles');
dryFalls.pieces.find(p => p.kind === 'falls').at = 0.5;
reject('an air waterfall outside a jump fails validation', dryFalls, 'inside a gap jump');
const looseArch = clone('jungle');
looseArch.edges = looseArch.edges.filter(e => e.from !== 0.085);
reject('a waterfall arch without walls fails validation', looseArch, 'waterfall arch stands on walls');
const offIsland = clone('isles');
offIsland.islands = [[0.285, 0.80]];
reject('a sky grid off its island fails validation', offIsland, 'start line and grid must sit on an island');
const steepBerm = clone('jungle');
steepBerm.opts.banks[0][2] = 1.1;
reject('a berm past the bank limit fails validation', steepBerm, 'bank must be in');
console.log(count + ' real/mirrored ramps checked (' + gaps + ' landscape gaps clear the gap itself, the rest a linked obstacle); ' + rejected.length + ' malformed layouts rejected.');
