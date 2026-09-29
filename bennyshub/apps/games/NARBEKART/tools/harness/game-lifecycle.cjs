/** Real renderer/session lifecycle: cleanup, ghost recording and settings. */
'use strict';
module.exports = async function (t) {
  const page = 'apps/games/NARBEKART/index.html';
  await t.load(page);
  await t.until('window.NK && NK.ui && NK.ui.ready', 45000);
  await t.js('NK.game.settings.set("music",false); NK.game.settings.set("sfx",false); true');
  const memory = [];
  for (let i = 0; i < 6; i++) {
    await t.js(`(function () {
      NK.debug.start({players:2,type:'single',mode:'open',classId:'fast',trackId:'meadow'});
      NK.debug.skipIntro(); NK.controls.stop(); const R=NK.debug.race();
      ['star','mega','jet','horn','bomb','ball','bee','peel3'].forEach((id,k)=>{NK.debug.give(k,id);NK.items.use(R,R.racers[k]);});
      NK.game.update(0.05); NK.game.pause(); return true;
    })()`);
    await t.wait(220);
    memory.push(await t.js('({geometries:NK.perf().geometries,textures:NK.perf().textures,programs:NK.main.renderer.info.programs.length})'));
  }
  const stable = memory.slice(2);
  t.assert(Math.max(...stable.map(m=>m.geometries))-Math.min(...stable.map(m=>m.geometries))<=2,
    'six race rebuilds dispose kart, item and world geometries', memory);
  t.assert(Math.max(...stable.map(m=>m.textures))-Math.min(...stable.map(m=>m.textures))<=1,
    'player-marker textures do not leak across race rebuilds', memory);
  t.assert(Math.max(...stable.map(m=>m.programs))-Math.min(...stable.map(m=>m.programs))<=1,
    'private item and player materials release their shader programs', memory);

  await t.js(`(function () {
    window.__views={};
    NK.main.onBeforeView((i,v)=>{const rect=NK.main.renderer.getViewport(new THREE.Vector4());__views[i]={rect:rect.toArray(),aspect:v.camera.aspect};});
    NK.game.settings.set('split','stack'); return true;
  })()`);
  await t.wait(200);
  let split = await t.js('({views:__views,w:innerWidth,h:innerHeight})');
  t.assert(split.views[0].rect[1]>split.views[1].rect[1] && Math.abs(split.views[0].aspect-split.w/Math.floor((split.h-6)/2))<0.01,
    'stacked split uses two full-width cameras with correct aspect', split);
  await t.js('NK.game.settings.set("split","side");true'); await t.wait(180);
  split = await t.js('({views:__views,w:innerWidth,h:innerHeight})');
  t.assert(split.views[1].rect[0]>split.views[0].rect[0] && Math.abs(split.views[0].aspect-Math.floor((split.w-6)/2)/split.h)<0.01,
    'side split uses two full-height cameras with correct aspect', split);

  await t.js(`(function () {
    NK.debug.start({players:1,type:'single',mode:'nofail',classId:'easy',trackId:'meadow'});
    NK.debug.skipIntro(); NK.ui.openPause(-1);
    window.__selectRow=(label)=>{
      const i=NK.ui.__dbg().rows.findIndex(row=>row.startsWith(label));
      if(i<0) throw new Error('Missing menu row '+label);
      document.getElementById('nkMenu').children[i].click();
    }; return true;
  })()`);
  await t.wait(450); await t.js('__selectRow("Settings");true'); await t.wait(450);
  t.assert(await t.js('NK.ui.screen==="settings" && NK.game.isPaused()'), 'pause routes into settings without advancing the race');
  await t.js(`(function () {
    NK.game.settings.set('steerMode','step');NK.game.settings.set('steerSpeed','slow');NK.game.settings.set('split','stack');
    NK.game.settings.set('shake',false);NK.game.settings.set('cueLevel',1);NarbeScanManager.setAutoScan(true);
    const control=NK.hud.control;window.__controlSchemes={};NK.hud.control=(i,c)=>{__controlSchemes[i]=c.scheme;return control(i,c);};
    __selectRow('Back');return true;
  })()`);
  await t.wait(450);
  t.assert(await t.js('NK.ui.screen==="pause" && NK.game.isPaused()'), 'settings Back restores the pause screen');
  await t.js('__selectRow("Continue");true');await t.wait(250);
  t.assert(await t.js('!NK.game.isPaused() && __controlSchemes[0]==="step-scan"'), 'Continue applies new one-switch step steering');

  // Unlike the distance harness, step the game here so ghost sampling runs
  // on its real 10 Hz schedule for a complete, naturally finished trial.
  await t.js(`NK.debug.start({players:1,type:'tt',mode:'nofail',classId:'fast',trackId:'meadow',picks:[{charId:'rusty',vehicleId:'buggy'}]});
    NK.debug.skipIntro();NK.controls.stop();NK.debug.autopilot(0,true);true`);
  let done = false;
  for (let i = 0; i < 70 && !done; i++) {
    done = await t.js('(function(){for(let n=0;n<100&&NK.debug.race().phase==="racing";n++)NK.game.update(0.05);return NK.debug.race().phase==="done";})()');
  }
  const recorded = await t.js(`(function(){const R=NK.debug.race(),s=JSON.parse(localStorage.getItem('nk-ghost-meadow-fast')||'{}');
    return {done:R.phase==='done',best:NK.game.bestTime('meadow','fast'),count:(s.samples||[]).length,
      first:s.samples&&s.samples[0],last:s.samples&&s.samples[s.samples.length-1],L:R.L,
      finite:(s.samples||[]).every(p=>p.every(Number.isFinite)),charId:s.charId,vehicleId:s.vehicleId};})()`);
  t.assert(recorded.done&&recorded.best>0, 'complete time trial saves a measured best time', recorded);
  t.assert(recorded.finite&&recorded.count>recorded.best*9.5&&recorded.count<recorded.best*10.5&&recorded.last[0]>=recorded.L*3,
    'ghost records the whole lap trajectory at approximately ten samples per second', recorded);
  const savedTime = recorded.best;
  await t.load(page); await t.until('window.NK && NK.ui && NK.ui.ready',45000);
  t.assert(await t.js(`NK.game.bestTime('meadow','fast')===${savedTime} && NK.game.settings.get('steerMode')==='step' && NK.game.settings.get('steerSpeed')==='slow' && NK.game.settings.get('split')==='stack' && NK.game.settings.get('shake')===false`),
    'best time and access-related game settings survive a page reload');
  t.assert(await t.js('NK.game.session.picks[0].charId==="rusty" && NK.game.session.picks[0].vehicleId==="buggy" && NarbeScanManager.getSettings().autoScan'),
    'racer/kart picks and shared one-switch setting survive reload');
  await t.js('NK.debug.start({type:"tt",mode:"nofail",classId:"fast",trackId:"meadow"});NK.debug.skipIntro();true');
  t.assert(await t.js('NK.debug.stats().ghost'), 'the recorded ghost loads into the next real trial');
  await t.wait(200);
  t.assert(await t.js('NK.debug.race().humans[0].mesh.children.length>0 && NK.debug.race().humans[0].mesh.visible'), 'ghost transparency leaves the live player model visible');
  t.note('Rebuild memory: '+JSON.stringify(memory));
};
