/** Full-distance, real-game races: no teleporting and no mocked drivers.
 * Humans drive solely from NK.guide through the debug autopilot. Simulation
 * advances in fixed 50 ms substeps, yielding between bounded chunks so the
 * live renderer still presents the actual track and kart/item meshes. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

module.exports = async function (t) {
  await t.load('apps/games/NARBEKART/index.html');
  await t.until('window.NK && NK.ui && NK.ui.ready && NK.debug', 45000);
  await t.js('NK.game.settings.set("music",false); NK.game.settings.set("sfx",false); NK.game.settings.set("cueLevel",0); true');
  const ids = await t.js('NK.tracks.CUPS.flatMap(c=>c.tracks)');
  const scenarios = ids.map(trackId => ({ trackId, mode: 'nofail', classId: 'easy', players: 1 }));
  scenarios.push(
    { trackId: 'shores', mode: 'open', classId: 'fast', players: 1 },
    { trackId: 'frost', mode: 'open', classId: 'fast', players: 2 },
    { trackId: 'lava', mode: 'open', classId: 'fast', players: 1 },
    { trackId: 'meadow', mode: 'open', classId: 'mirror', players: 1 },
    { trackId: 'starlight', mode: 'open', classId: 'mirror', players: 2 }
  );
  const summaries = [];
  for (const config of scenarios) {
    const name = config.trackId + '-' + config.mode + '-' + config.classId + (config.players === 2 ? '-2p' : '');
    await t.js(`(function () {
      NK.debug.start(${JSON.stringify(Object.assign({ type: 'single' }, config))});
      NK.debug.skipIntro(); NK.controls.stop();
      const R=NK.debug.race();
      R.humans.forEach(h=>NK.debug.autopilot(h.human,true));
      window.__trackRun={events:{},humanEvents:{},nonfinite:[],maxObjects:0,checkpoint:false};
      ['itemGet','itemUse','coin','boost','turbo','trick','jump','hit','fall','rescued','lap','finish'].forEach(name=>{
        R.on(name,(r)=>{
          __trackRun.events[name]=(__trackRun.events[name]||0)+1;
          if(r&&r.isHuman)__trackRun.humanEvents[name]=(__trackRun.humanEvents[name]||0)+1;
        });
      });
      return true;
    })()`);
    let state = null;
    for (let chunk = 0; chunk < 80; chunk++) {
      state = await t.js(`(function () {
        const R=NK.debug.race(), out=__trackRun;
        for(let i=0;i<100&&R.phase==='racing';i++) {
          R.update(0.05);
          out.maxObjects=Math.max(out.maxObjects,R.itemObjects.length);
          if(i%20===0) R.racers.forEach(r=>{
            if(![r.progress,r.s,r.x,r.y,r.v,r.mesh.position.x,r.mesh.position.y,r.mesh.position.z].every(Number.isFinite))
              out.nonfinite.push({idx:r.idx,time:R.time});
          });
          if(!out.checkpoint&&R.humans[0].progress>=300) break;
        }
        return {phase:R.phase,time:R.time,progress:R.humans[0].progress,
          finished:R.humans.every(h=>h.finished),checkpoint:out.checkpoint,nonfinite:out.nonfinite.length};
      })()`);
      if (!state.checkpoint && state.progress >= 300) {
        await t.js('__trackRun.checkpoint=true; NK.game.update(0.05); true');
        await t.wait(1850); // Let the real-time GO popup expire after fast simulation.
        await t.shot(name);
      }
      if (state.phase === 'done' || state.nonfinite || state.time > 390) break;
    }
    const result = await t.js(`(function () {
      const R=NK.debug.race();
      return {time:R.time,phase:R.phase,L:R.L,humans:R.humans.map(h=>({idx:h.idx,finished:h.finished,place:h.place,progress:h.progress,time:h.finishTime})),
        events:__trackRun.events,humanEvents:__trackRun.humanEvents,nonfinite:__trackRun.nonfinite,maxObjects:__trackRun.maxObjects,
        results:!!NK.game.results(),geometry:NK.perf().geometries};
    })()`);
    summaries.push(Object.assign({ name, config }, result));
    t.assert(result.phase === 'done' && result.humans.every(h => h.finished), name + ': all humans finish all three laps from guidance', result.humans);
    t.assert(result.nonfinite.length === 0, name + ': every racer remains finite', result.nonfinite);
    t.assert(result.results, name + ': real game publishes race results');
    t.assert((result.humanEvents.itemGet || 0) > 0 && (result.humanEvents.itemUse || 0) > 0, name + ': human collects and automatically uses items', result.humanEvents);
    t.assert((result.events.coin || 0) > 0 && (result.events.trick || 0) > 0, name + ': coins and ramp tricks occur', result.events);
    if (config.mode === 'nofail') t.assert(!(result.humanEvents.fall || 0), name + ': No-Fail humans never fall');
    t.assert(result.maxObjects <= 96, name + ': live items remain bounded', result.maxObjects);
    t.note(name + ' completed in ' + result.time.toFixed(1) + ' simulated seconds; human places ' + result.humans.map(h => h.place).join('/'));
  }
  fs.writeFileSync(path.join(t.outDir, 'track-races.json'), JSON.stringify(summaries, null, 2));
};
