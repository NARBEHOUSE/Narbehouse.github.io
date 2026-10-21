/* Deterministic tuning aid, not a substitute for human or hardware playtesting.
 * Uses the native combat loop at 60 FPS and 1280x720. A modeled action can choose
 * among the current target and two subsequent scan targets, then stomp.
 * Usage: node scripts/check-bug-blaster-balance.cjs balanced 8 8 [--glue]
 * Routes buy legal upgrades in priority order, save for the next desired item,
 * and repair between levels. --glue adds a one-level trap on 9, 18, 19 and 20.
 */
'use strict';
const {setup,vm}=require('../tests/helpers/bug-blaster-runtime.cjs');
const [strategy='balanced',seconds='6',seedText='8']=process.argv.slice(2);
if(!['attack','balanced','defense'].includes(strategy)||!Number.isFinite(+seconds)||+seconds<0||!Number.isInteger(+seedText))throw Error('Expected strategy, seconds between actions, integer seed');
const box=setup(+seedText);Object.assign(box,{STRATEGY:strategy,SPACING:+seconds,USE_GLUE:process.argv.includes('--glue'),progress:()=>{}});
const waves=vm.runInContext(String.raw`function campaign(strategy,spacing){
 const routes={attack:[12,0,1,5,3,4,9,8,6,7,10,11],balanced:[12,0,9,8,1,5,3,4,6,7,10,11],defense:[12,10,9,0,1,11,5,8,3,4,6,7]};
 const result=[];
 for(let level=1;level<=20;level++){
  let purchases=[],income=points;
  const buy=i=>{let before=points;tryBuyItem(i);if(points<before)purchases.push({i,cost:before-points});};
  while(getBuyItemState(2).enabled)buy(2);
  for(let step=0;step<30;step++){
   const wanted=routes[strategy].find(i=>{const o=getBuyItemState(i);return !o.maxed&&!o.locked&&(o.enabled||o.note.startsWith('Need '));});
   if(wanted===undefined||!getBuyItemState(wanted).enabled)break;
   buy(wanted);
  }
  if(USE_GLUE&&[9,18,19,20].includes(level)&&getBuyItemState(13).enabled)buy(13);
  const build=buy_menu_options.map(o=>o.purchased),hpStart=tower_hp,remaining=points;
  start_level();finish_level_intro();let nextPress=Date.now()/1000+spacing;
  for(let f=0;f<9060&&gameState==='PLAYING';f++){
   tick(1000/60);
   if(spacing>0&&Date.now()/1000>=nextPress){if(stomp_target){
 const original=stomp_target,candidates=[original];
 for(let k=0;k<2;k++){cycle_stomp_target();if(stomp_target&&!candidates.includes(stomp_target))candidates.push(stomp_target);}
 const radius=40*Math.pow(2,buy_menu_options[12].purchased),damage=1+buy_menu_options[12].purchased;
 const score=t=>enemies.filter(e=>!e.isDead&&Math.hypot(e.x-t.x,e.y-t.y)<radius).reduce((sum,e)=>sum+Math.min(e.hp,damage)*(0.35+3*Math.pow(Math.max(0,(e.y-80)/(TOWER_Y-80)),3)),0);
 stomp_target=candidates.reduce((a,b)=>score(b)>score(a)?b:a,original);
 }
 trigger_player_stomp();nextPress=Date.now()/1000+spacing;}
   loop();
  }
  result.push({level,income,remaining,purchases,build,hpStart,hpEnd:tower_hp,maxHp:max_tower_hp,state:gameState});
  progress(result);
  if(gameState==='GAME_OVER')break;
 }
 return result;
}campaign(STRATEGY,SPACING)`,box,{timeout:600000});
console.log(JSON.stringify({strategy,secondsBetweenActions:+seconds,seed:+seedText,glue:box.USE_GLUE,won:waves.at(-1)?.state==='GAME_WON',waves},null,2));
