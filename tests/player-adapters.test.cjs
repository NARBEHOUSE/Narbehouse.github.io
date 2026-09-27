const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function element(text,options={}){
  return {hasAttribute:()=>false,textContent:text,disabled:false,tagName:'BUTTON',getClientRects:()=>[1],getAttribute(k){return k==='aria-label'?this.textContent:null;},closest(selector){return selector.includes('dialog')&&options.dialog?{}:null;},matches:()=>false,click(){},...options};
}
function setup(service,{video,buttons=[],login=false,view}={}){
  let clock=0;
  const env={BennyPlayerView:{create:()=>view},Date:{now:()=>clock},Promise,getComputedStyle:()=>({visibility:'visible'}),location:{pathname:login?'/login':'/desktop/'},document:{querySelectorAll(s){if(s==='video,audio')return video?[video]:[];if(s==='input[type="password"]')return [];if(s.startsWith('button,'))return buttons;return [];}}};
  env.globalThis=env;vm.runInNewContext(fs.readFileSync('extension/player-adapters.js','utf8'),env);
  return {adapter:env.BennyPlayerAdapters.create(service),advance:ms=>clock+=ms};
}
test('autoplay denial leaves a Play retry; startup never toggles playing media off',async()=>{
  let blocked=true,plays=0;const video=element('',{tagName:'VIDEO',currentSrc:'test.mp4',paused:true,async play(){plays++;if(blocked)throw Object.assign(Error('Blocked'),{name:'NotAllowedError'});this.paused=false;},pause(){this.paused=true;}});
  const {adapter}=setup('plex',{video});assert.equal(await adapter.startup(),'Press Enter to play.');assert.equal(await adapter.startup(),'done');assert.equal(plays,1);
  blocked=false;assert.equal(await adapter.toggle(),'Playing');assert.equal(video.paused,false);
  const second=setup('netflix',{video});assert.equal(await second.adapter.startup(),'playing');assert.equal(video.paused,false);
});
test('Plex activates Resume immediately before an empty video; no native keyboard delay',async()=>{
  let clicks=0,plays=0;const video=element('',{tagName:'VIDEO',paused:true,play(){plays++;return new Promise(()=>{});}});
  const resume=element('Resume from 12:34',{tagName:'A',click(){clicks++;}});
  const run=setup('plex',{video,buttons:[resume]});assert.equal(await run.adapter.startup(),'starting');assert.equal(clicks,1);assert.equal(plays,0);
  await run.adapter.startup();assert.equal(clicks,1);assert.equal(plays,0);
  run.advance(750);await run.adapter.startup();assert.equal(clicks,2);
  run.advance(750);await run.adapter.startup();run.advance(750);await run.adapter.startup();assert.equal(clicks,3);
});
test('Plex follows Play into a Resume dialog and prioritizes Resume over restarting',async()=>{
  const clicks=[],buttons=[];
  const play=element('Play',{click(){clicks.push('play');buttons.push(element('Play from beginning',{dialog:true,click(){throw Error('Must not restart');}}),element('Resume',{dialog:true,click(){clicks.push('resume');}}));}});
  buttons.push(play);const run=setup('plex',{buttons});await run.adapter.startup();await run.adapter.startup();assert.deepEqual(clicks,['play','resume']);
});
test('Plex handles a reused Play node becoming Resume immediately, and excludes login/purchase',async()=>{
  let clicks=0;const button=element('Play',{click(){clicks++;this.textContent='Resume';}}),run=setup('plex',{buttons:[button]});
  await run.adapter.startup();await run.adapter.startup();assert.equal(clicks,2);
  const signedOut=setup('plex',{buttons:[button],login:true});assert.match(await signedOut.adapter.startup(),/sign in/i);assert.equal(clicks,2);
  for(const label of ['Buy','Rent','Play trailer','Play from beginning']){const unsafe=element(label,{matches:()=>true,click(){throw Error('Unsafe action');}});assert.equal(await setup('plex',{buttons:[unsafe]}).adapter.startup(),'waiting');}
});
test('a pending media play request does not block a Resume dialog arriving later',async()=>{
  let plays=0,clicks=0;const buttons=[],video=element('',{tagName:'VIDEO',paused:true,currentSrc:'test.mp4',play(){plays++;return new Promise(()=>{});}}),run=setup('plex',{video,buttons});
  assert.equal(await run.adapter.startup(),'starting');buttons.push(element('Resume',{dialog:true,click(){clicks++;}}));assert.equal(await run.adapter.startup(),'starting');assert.equal(clicks,1);assert.equal(plays,1);
});

test('Disney and Netflix retain native video layout; Plex still automatically fits its player',()=>{
  for(const service of ['disney','netflix','plex']){
    let syncs=0,clears=0;const view={sync(){syncs++;},clear(){clears++;}};
    const video=element('',{tagName:'VIDEO',paused:false,currentSrc:'fixture.mp4'});
    setup(service,{video,view}).adapter.syncView();
    assert.equal(syncs,service==='plex'?1:0);assert.equal(clears,service==='plex'?0:1);
  }
});
