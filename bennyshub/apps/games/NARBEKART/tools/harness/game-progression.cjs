/** Full cups, saved progress, per-racer scoring, tablet layout and settings. */
module.exports=async function(t){
 await t.load('apps/games/NARBEKART/index.html');await t.until('NK.ui&&NK.ui.ready',45000);
 await t.js('NK.debug.start({players:2,type:"gp",mode:"nofail",cupId:"sunshine",picks:[{charId:"pip",vehicleId:"kart"},{charId:"pip",vehicleId:"bike"}]});true');
 for(let race=1;race<=4;race++){
  const result=await t.js('(()=>{NK.debug.skipIntro();const R=NK.debug.race();R.humans.forEach((h,i)=>{NK.debug.teleport(h.idx,R.L*R.laps-0.3-i*0.3,0);h.v=30;});for(let k=0;k<85;k++)NK.game.update(0.05);return NK.game.results();})()');
  t.assert(result&&result.gp&&result.gp.race===race,'GP race '+race+' reaches results',result&&result.gp);
  t.assert(result&&result.gp.standings.length===12,'GP keeps twelve distinct competitors in race '+race);
  const humans=result.gp.standings.filter(r=>r.human>=0);
  t.assert(humans.length===2&&humans[0].idx!==humans[1].idx,'duplicate character picks score separately in race '+race);
  if(race<4){
    const expected=result.gp.standings.map(r=>r.idx).reverse();
    await t.js('NK.game.nextRace();NK.ui.debugRace();true');
    const grid=await t.js('NK.debug.race().racers.slice().sort((a,b)=>b.progress-a.progress).map(r=>r.idx)');
    t.assert(JSON.stringify(expected)===JSON.stringify(grid),'next grid reverses championship standings',grid);
  }
 }
 t.assert(await t.js('NK.game.unlocked.cups("nofail")===2 && !!NK.game.trophy("nofail","easy","sunshine")'),'cup completion persists trophy and Moonlight unlock');
 await t.js('NK.game.nextRace();NK.ui.setScreen("trophy");true');await t.wait(300);await t.shot('01-podium');
 await t.js('NK.game.quitToMenu();NK.ui.setScreen("title");NK.game.settings.set("steerMode","step");NK.game.settings.set("steerSpeed","slow");true');
 await t.js('localStorage.setItem("nk-trophies",JSON.stringify({open:{fast:{sunshine:"gold"}}}));true');
 await t.js('location.reload();true');await t.until('NK.ui&&NK.ui.ready',45000);
 t.assert(await t.js('NK.game.settings.get("steerMode")==="step" && NK.game.unlocked.cups("nofail")===2'),'settings and cup unlock survive reload');
 await t.js('NK.debug.start({players:1,type:"gp",mode:"open",classId:"fast",cupId:"moonlight"});true');
 for(let i=0;i<4;i++){
  await t.js('(()=>{NK.debug.skipIntro();const R=NK.debug.race();NK.debug.teleport(0,R.L*R.laps-0.2,0);R.humans[0].v=35;for(let k=0;k<85;k++)NK.game.update(0.05);})()');
  if(i<3)await t.js('NK.game.nextRace();NK.ui.debugRace();true');
 }
 t.assert(await t.js('NK.game.unlocked.mirror'),'trophies in both Fast Open cups unlock Mirror');
 await t.js('NK.game.quitToMenu();NK.ui.setScreen("title");true');await t.setSize(1024,768);await t.wait(200);await t.shot('02-tablet-title');
 const bounds=await t.js('Array.from(document.querySelectorAll(".nkItem")).map(e=>{const r=e.getBoundingClientRect();return {h:r.height,inside:r.top>=0&&r.bottom<=innerHeight};})');t.note('Tablet targets: '+JSON.stringify(bounds));
 await t.js('NK.game.resetProgress();true');t.assert(await t.js('!NK.game.unlocked.mirror&&NK.game.unlocked.cups("nofail")===1&&!NK.game.trophy("open","fast","moonlight")'),'reset clears saved progression');
};
