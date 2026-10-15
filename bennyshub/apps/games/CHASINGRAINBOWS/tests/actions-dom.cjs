'use strict';
// Actual game page, shared scanner and input guard, without a browser/GPU.
const assert=require('node:assert/strict');
const {check,saved,sleep}=require('./october14-dom.cjs');
const selected=(label,save,auto,body,settings)=>!process.env.CR_CASE||label.includes(process.env.CR_CASE)?check(label,save,auto,body,settings):Promise.resolve();
let id=0;
const cards=ts=>ts.map(t=>({t,id:'action-dom'+id++}));
function fixture(mode,action,n=3) {
  const save=saved(mode,['cloud','fog','blue'],{},n);
  save.cfg.players.forEach((p,i)=>{p.kind=i?'cpu':'human';save.state.players[i].kind=p.kind;save.meta.kinds[i]=p.kind;save.state.players[i].hand=cards(i===0?['cloud','fog','blue']:i===1?[action,'red']:['red','green']);});
  save.state.draw=cards(Array(20).fill('blue'));save.state.discard=cards(['orange']);save.state.turn=1;
  return save;
}
function observe(w,action) {
  const events=[],apply=w.CREngine.applyMove,choose=w.CRAI.choose;
  w.CREngine.applyMove=function(...args){const result=apply(...args);events.push(...result);return result;};
  w.CRAI.choose=function(view,d,...rest){return d.moves.find(m=>m.key===action)||d.moves.find(m=>m.key==='end')||choose(view,d,...rest);};
  return events;
}
(async()=>{
  for(const mode of ['classic','classicLite']) for(const [card,key]of [['fog','weather:fog:2'],['wind','weather:wind:2:red'],['storm','weather:storm:red'],['double','weather:double']]) {
    await selected(mode+': default Cloud prompt on CPU '+card,fixture(mode,card),false,async({w,doc,dbg,wait,choose})=>{
      const events=observe(w,key);await choose('continue');await wait(()=>dbg().ids.includes('block'),'Cloud choice');
      assert.equal(dbg().choice.index,-1);assert.ok(events.some(e=>e.t==='weather'&&e.p===1&&e.card===card));
      if(card==='fog'||card==='wind')assert.match(doc.getElementById('caption').textContent,/Player 3/);
      await sleep(250);assert.ok(dbg().ids.includes('block'),'reaction waits for the human');
      await choose('block');await wait(()=>events.some(e=>e.t==='blocked'),'blocked Action');
      assert.ok(events.some(e=>e.t==='block'&&e.p===0));assert.ok(!events.some(e=>e.t===card));
    });
  }
  await selected('legacy affects setting migrates to all opponents',fixture('classic','fog'),false,async({w,dbg,wait,choose})=>{
    observe(w,'weather:fog:2');await choose('continue');await wait(()=>dbg().ids.includes('block'),'migrated Cloud choice');
    await choose('pause');await choose('settings');
    assert.match(w.document.getElementById('menu').textContent,/Always ask/);
    await choose('blocks');const pref=JSON.parse(w.localStorage.getItem('chasingrainbows_settings'));
    assert.equal(pref.blockPrompts,'affects');assert.equal(pref.blockPromptVersion,1);
  },{blockPrompts:'affects'});
  for(const prefs of [{blockPrompts:'never'},{blockPrompts:'affects',blockPromptVersion:1}])await selected('explicit quiet preference '+prefs.blockPrompts,fixture('classic','fog'),false,async({w,dbg,wait,choose})=>{
    const events=observe(w,'weather:fog:2');await choose('continue');await wait(()=>events.some(e=>e.t==='fog'),'unblocked CPU Action');
    assert.ok(!events.some(e=>e.t==='block'));assert.ok(!dbg().ids.includes('block'));
  },prefs);
  const shared=fixture('classicLite','wind');shared.cfg.players[2].kind=shared.state.players[2].kind=shared.meta.kinds[2]='human';shared.meta.viewer=2;
  await selected('shared switch: spectator gets private handoff and Auto Cloud choice',shared,true,async({w,doc,dbg,wait,choose})=>{
    const events=observe(w,'weather:wind:2:red');await choose('continue');await wait(()=>dbg().screen==='cover','Cloud handoff');
    assert.match(doc.getElementById('cardTitle').textContent,/Player 1/);await choose('ready');await wait(()=>dbg().ids.includes('block'),'Cloud choice after ready');
    await choose('block');await wait(()=>events.some(e=>e.t==='blocked'),'blocked trade');assert.ok(!events.some(e=>e.t==='wind'));
  });
  for(const mode of ['classic','classicLite']) {
    const save=saved(mode,['fog','sun','rain',...Array(6).fill('red')],{},3);save.state.phase='draw';save.state.draw=cards(['blue']);save.state.players[1].hand=cards(['red']);save.state.players[2].hand=cards(['green']);
    await selected(mode+': Fog before discard, row Back and canceled confirmation',save,false,async({w,doc,dbg,wait,choose})=>{
      await choose('continue');await wait(()=>dbg().ids.includes('draw'),'draw');await choose('draw');await wait(()=>dbg().ids.includes('weather:fog'),'Fog available');
      await choose('combo:core');await wait(()=>dbg().ids.includes('weather:fog'),'Fog after combo');
      assert.match(doc.getElementById('bar').textContent,/Action.*before discarding|Action.*then discard/i);
      await choose('discard');await choose('discard:red');await choose('narbe:row-back');await choose('narbe:row-back');
      assert.equal(dbg().phase,'play');assert.ok(dbg().ids.includes('weather:fog'));
      await choose('weather:fog');await choose('weather:fog:1');await wait(()=>!dbg().busy&&dbg().phase==='play','Fog played');
      const state=JSON.parse(w.localStorage.getItem('chasingrainbows_save')).state;assert.equal(state.players[1].skips,1);assert.equal(state.weatherPlayed,true);
    });
  }
  for(const legend of ['day','night']) {
    const save=saved('classic',['red']);save.state.phase='draw';save.state.draw=cards([legend]);
    await selected('draw '+legend+': narrated tip includes Storm Shuffle',save,false,async({dbg,wait,choose,spoken})=>{
      await choose('continue');await wait(()=>dbg().ids.includes('draw'),'draw');await choose('draw');
      await wait(()=>spoken.some(s=>s.includes('Tip:')&&s.includes('Storm Shuffle')&&s.includes(legend==='day'?'Day':'Night')),'complete legend tip');
    },{helper:'tips'});
  }
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
