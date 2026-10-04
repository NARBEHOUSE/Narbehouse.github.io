const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function element(text,options={}){
  return {hasAttribute:()=>false,textContent:text,disabled:false,tagName:'BUTTON',getClientRects:()=>[1],getAttribute(k){return k==='aria-label'?this.textContent:null;},closest(selector){return selector.includes('dialog')&&options.dialog?{}:null;},matches:()=>false,click(){},...options};
}
function setup(service,{video,buttons=[],login=false,view}={}){
  let clock=0;
  const env={BennyPlayerView:{create:()=>view},Date:{now:()=>clock},Promise,setTimeout,clearTimeout,getComputedStyle:()=>({visibility:'visible'}),location:{pathname:login?'/login':'/desktop/'},document:{querySelectorAll(s){if(s==='video,audio')return video?[video]:[];if(s==='input[type="password"]')return [];if(s.startsWith('button,'))return buttons;return [];}}};
  env.globalThis=env;vm.runInNewContext(fs.readFileSync('extension/player-adapters.js','utf8'),env);
  return {adapter:env.BennyPlayerAdapters.create(service),advance:ms=>clock+=ms,document:env.document};
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

test('every locked playback view receives its reserved frame; Disney and Netflix use constrained native mode',()=>{
  const frame={left:12,top:18,width:1120,height:640};
  for(const service of ['disney','netflix','plex','youtube','']){
    const calls=[];let clears=0;const view={sync(...args){calls.push(args);},clear(){clears++;}};
    const video=element('',{tagName:'VIDEO',paused:false,currentSrc:'fixture.mp4'});
    const {adapter}=setup(service,{video,view});
    adapter.setFrame(frame);adapter.syncView();
    assert.equal(calls.length,1);assert.equal(clears,0);
    assert.equal(calls[0][0],video);assert.equal(calls[0][3],frame);
    assert.equal(calls[0][4],['disney','netflix',''].includes(service));
  }
});

test('Fullscreen exits automatic expansion while retaining the frame, then enters and leaves native fullscreen without changing media',async()=>{
  const frame={left:12,top:18,width:1120,height:640},calls=[];
  let clears=0,entered=0,exited=0,document;
  const wrapper={contains:element=>element===video,async requestFullscreen(){entered++;document.fullscreenElement=this;}};
  const video=element('',{
    tagName:'VIDEO',paused:false,currentSrc:'fixture.mp4',parentElement:wrapper,
    load(){throw Error('Layout must not reload video');},
    play(){throw Error('Layout must not restart video');},
    pause(){throw Error('Layout must not pause video');}
  });
  Object.defineProperty(video,'src',{get:()=> 'fixture.mp4',set(){throw Error('Layout must not replace the source');}});
  const view={
    active:false,
    sync(...args){this.active=true;calls.push(args);},
    clear(){this.active=false;clears++;}
  };
  const run=setup('plex',{video,view});document=run.document;
  document.exitFullscreen=async()=>{exited++;document.fullscreenElement=null;};
  run.adapter.setFrame(frame);run.adapter.syncView();
  assert.equal(calls.at(-1)[4],false);
  assert.equal(await run.adapter.fullscreen(),'Player fullscreen off');
  assert.equal(entered,0);assert.equal(clears,0);assert.equal(view.active,true);
  assert.equal(calls.at(-1)[3],frame);assert.equal(calls.at(-1)[4],true);
  assert.equal(await run.adapter.fullscreen(),'Player fullscreen on');
  assert.equal(entered,1);assert.equal(document.fullscreenElement,wrapper);
  assert.equal(calls.at(-1)[3],frame);assert.equal(calls.at(-1)[4],true);
  assert.equal(await run.adapter.fullscreen(),'Player fullscreen off');
  assert.equal(exited,1);assert.equal(clears,1);assert.equal(view.active,true);
  assert.equal(calls.at(-1)[3],frame);assert.equal(calls.at(-1)[4],true);
  assert.equal(video.parentElement,wrapper);assert.equal(video.src,'fixture.mp4');assert.equal(video.paused,false);
});

test('native services enter fullscreen directly while sign-in pages release layout constraints',async()=>{
  for(const service of ['disney','netflix']){
    let entered=0,clears=0,document;
    const wrapper={async requestFullscreen(){entered++;document.fullscreenElement=this;}};
    const video=element('',{tagName:'VIDEO',paused:false,currentSrc:'fixture.mp4',parentElement:wrapper});
    const view={active:true,sync(){},clear(){clears++;}};
    const run=setup(service,{video,view});document=run.document;
    assert.equal(await run.adapter.fullscreen(),'Player fullscreen on');
    assert.equal(entered,1);assert.equal(clears,0);
    setup(service,{video,view,login:true}).adapter.syncView();
    assert.equal(clears,1);
  }
});

test('Unlock invalidates pending direct-VIDEO fullscreen recovery and relock restores ordinary synchronization',async()=>{
  const frame={left:12,top:18,width:1120,height:640},provider={id:'provider',originalStyle:'native'};
  let syncs=0,clears=0,exits=0,completeExit;
  const video=element('',{
    tagName:'VIDEO',paused:false,currentSrc:'fixture.mp4',parentElement:provider,
    contains(node){return node===this;},
    load(){throw Error('Recovery must not reload the video');},
    play(){throw Error('Recovery must not restart the video');},
    pause(){throw Error('Recovery must not pause the video');}
  });
  Object.defineProperty(video,'src',{get:()=> 'fixture.mp4',set(){throw Error('Recovery must not replace the source');}});
  const view={
    sync(){syncs++;provider.frameApplied=true;},
    clear(){clears++;delete provider.frameApplied;}
  };
  const {adapter,document}=setup('plex',{video,view});
  adapter.setFrame(frame);adapter.syncView();assert.equal(syncs,1);
  document.fullscreenElement=video;
  document.exitFullscreen=()=>{
    exits++;
    return new Promise(resolve=>{completeExit=()=>{document.fullscreenElement=null;resolve();};});
  };
  const recovery=adapter.recoverVideoFullscreen();
  assert.equal(adapter.recoverVideoFullscreen(),recovery,'Repeated mount events must share the pending exit');
  assert.equal(exits,1);
  adapter.clearView();
  assert.equal(provider.frameApplied,undefined);
  completeExit();
  assert.equal(await recovery,true);
  assert.equal(syncs,1,'A late fullscreen exit must not restore a dock after Unlock or cleanup');
  assert.equal(clears,2);
  assert.deepEqual(provider,{id:'provider',originalStyle:'native'});
  assert.equal(video.parentElement,provider);assert.equal(video.src,'fixture.mp4');assert.equal(video.paused,false);
  adapter.syncView();
  assert.equal(syncs,2,'Explicit relock can enable view synchronization again');
  assert.equal(provider.frameApplied,true);assert.equal(provider.originalStyle,'native');
});

test('Unlock invalidates an awaiting provider fullscreen button before fallback entry or fitting',async()=>{
  let syncs=0,clears=0,clicks=0,entries=0,completeProviderAction;
  const wrapper={
    contains(node){return node===video||node===button;},
    async requestFullscreen(){entries++;}
  };
  const video=element('',{tagName:'VIDEO',paused:false,currentSrc:'fixture.mp4',parentElement:wrapper});
  const button=element('Fullscreen',{parentElement:wrapper,click(){clicks++;}});
  const view={active:false,sync(){syncs++;},clear(){clears++;}};
  const {adapter,document}=setup('youtube',{video,view});
  const query=document.querySelectorAll;
  document.querySelectorAll=selector=>selector==='.ytp-fullscreen-button'?[button]:query(selector);
  document.addEventListener=(type,listener)=>{assert.equal(type,'fullscreenchange');completeProviderAction=listener;};
  document.removeEventListener=()=>{};
  const entering=adapter.fullscreen();
  assert.equal(clicks,1);assert.equal(typeof completeProviderAction,'function');
  adapter.clearView();
  completeProviderAction();
  assert.equal(await entering,'Player view changed');
  assert.equal(entries,0,'A stale provider callback must not enter fallback fullscreen after Unlock');
  assert.equal(syncs,0);assert.equal(clears,1);
  assert.equal(video.parentElement,wrapper);assert.equal(video.currentSrc,'fixture.mp4');assert.equal(video.paused,false);
  adapter.syncView();assert.equal(syncs,1);
});
