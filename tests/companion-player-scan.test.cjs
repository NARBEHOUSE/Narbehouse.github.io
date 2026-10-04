const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const plain=value=>JSON.parse(JSON.stringify(value));
function fixture({speechMode='normal',duration=500}={}){
  let now=100000,id=0,active;
  const jobs=new Map(),events=new Map(),documentEvents=new Map(),spoken=[];
  const add=(map,type,fn)=>map.set(type,[...(map.get(type)||[]),fn]);
  const remove=(map,type,fn)=>map.set(type,(map.get(type)||[]).filter(f=>f!==fn));
  const dispatch=(map,type)=>{for(const fn of [...(map.get(type)||[])])fn()};
  class Clock extends Date{static now(){return now}}
  const engine={
    speaking:false,getVoices:()=>[{name:'Test English',lang:'en-US'},{name:'Other English',lang:'en-GB'}],
    addEventListener(){},removeEventListener(){},
    cancel(){active=null;this.speaking=false},
    speak(utterance){
      if(speechMode==='throw')throw Error('Synthetic speech failure');
      spoken.push(utterance);active=utterance;
      if(speechMode==='nostart')return;
      this.speaking=true;
      if(speechMode!=='noevents')utterance.onstart?.();
      if(speechMode==='normal')context.setTimeout(()=>{
        if(active===utterance){this.speaking=false;utterance.onend?.()}
      },duration);
    }
  };
  const context=vm.createContext({
    console,Promise,Date:Clock,queueMicrotask,
    setTimeout(fn,ms=0){const key=++id;jobs.set(key,{at:now+ms,fn});return key},
    clearTimeout(key){jobs.delete(key)},
    addEventListener:(type,fn)=>add(events,type,fn),
    removeEventListener:(type,fn)=>remove(events,type,fn),
    document:{
      hidden:false,hasFocus:()=>true,
      addEventListener:(type,fn)=>add(documentEvents,type,fn),
      removeEventListener:(type,fn)=>remove(documentEvents,type,fn)
    },
    speechSynthesis:engine,SpeechSynthesisUtterance:class{constructor(text){this.text=text}}
  });
  context.window=context;
  Object.defineProperty(context,'localStorage',{get(){throw Error('Streaming origin storage must not be used')}});
  for(const file of ['player-platform.js','shared/voice-manager.js','shared/choice-scan.js'])
    vm.runInContext(fs.readFileSync(path.join(root,'extension',file),'utf8'),context,{filename:file});
  const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve()};
  async function tick(ms){
    const end=now+ms;await flush();let attempts=0;
    for(;;){
      const next=[...jobs].filter(([,j])=>j.at<=end).sort((a,b)=>a[1].at-b[1].at||a[0]-b[0])[0];if(!next)break;
      if(++attempts>10000)throw Error('Timer loop');
      jobs.delete(next[0]);now=next[1].at;next[1].fn();await flush();
    }
    now=end;await flush();
  }
  const platform=context.NarbePlatform,voice=context.NarbeVoiceManager;
  function create(settings={},items=[{id:'play',label:'Play / Pause'},{id:'return',label:'Return to Hub'}]){
    platform.applyPreferences({autoScan:true,scanInterval:1000,tts:false,...settings});
    const selected=[],statuses=[];
    const scan=context.NarbeChoiceScan.create(platform.scanSettings,{
      choice:true,holdThreshold:3000,items,
      badge:{update:value=>statuses.push(value),destroy(){}},
      onSelect:item=>selected.push(item.id)
    });
    return {scan,selected,statuses};
  }
  return {platform,voice,create,tick,spoken,engine,context,dispatch:type=>dispatch(events,type),visibility:()=>dispatch(documentEvents,'visibilitychange')};
}

test('companion runs the canonical shared policy, speech and badge rather than divergent copies',()=>{
  for(const name of ['voice-manager.js','choice-scan.js','scan-status-badge.js'])
    assert.equal(fs.readFileSync(path.join(root,'extension/shared',name),'utf8'),fs.readFileSync(path.join(root,'bennyshub/shared',name),'utf8'),name);
});

test('companion settings remain Hub-owned and voice discovery never accesses streaming-origin storage',async()=>{
  const h=fixture(),notifications=[];h.platform.scanSettings.subscribe(value=>notifications.push(plain(value)));
  assert.throws(()=>h.platform.settings.open({key:'narbe-scan-settings'}),/belong to the Hub/);
  h.platform.applyPreferences({autoScan:true,parking:'chosen',loopsBeforeParking:3,spaceBrake:false,waitForSpeech:true,tts:false,voice:'Other English',rate:1.5});
  assert.equal(h.platform.scanSettings.getSettings().scanInterval,2000);
  assert.equal(h.platform.scanSettings.isParkingEnabled(),true);
  assert.equal(h.platform.scanSettings.shouldParkAfterLoop(99),false);
  assert.deepEqual(plain(h.voice.getSettings()),{ttsEnabled:false,voiceName:'Other English',voiceIndex:1,rate:1.5,pitch:1,volume:1});
  const detached=h.platform.scanSettings.getSettings();detached.autoScan=false;
  assert.equal(h.platform.scanSettings.getSettings().autoScan,true);
  h.voice.updateSettings({ttsEnabled:true,voiceIndex:0});
  assert.equal(h.platform.scanSettings.getSettings().tts,false,'local voice cache cannot write Hub preferences');
  h.platform.applyPreferences({autoScan:true,parking:'auto',loopsBeforeParking:2,tts:false});
  assert.equal(h.platform.scanSettings.shouldParkAfterLoop(1),false);
  assert.equal(h.platform.scanSettings.shouldParkAfterLoop(2),true);
  assert.equal(h.voice.getSettings().ttsEnabled,false);
  assert.equal(notifications.length,2);
});

test('companion speech settles unavailable startup, engine errors, cancelled gaps and late events',async()=>{
  for(const mode of ['nostart','throw']){
    const h=fixture({speechMode:mode}),ticket=h.voice.speak('Play');
    await h.tick(1000);
    const result=await ticket.finished;
    assert.equal(result.started,false);assert.equal(result.reason,mode==='nostart'?'failed-to-start':'error');
  }
  const h=fixture({speechMode:'hang'}),first=h.voice.speak('first');
  first.cancel();await h.tick(100);assert.equal(h.spoken.length,0);assert.equal((await first.finished).reason,'cancelled');
  const second=h.voice.speak('second');await h.tick(50);const late=h.spoken.at(-1);
  const third=h.voice.speak('third');await h.tick(50);late.onend();
  assert.equal((await second.finished).reason,'cancelled');
  let finished=false;third.finished.then(()=>{finished=true});await h.tick(1);assert.equal(finished,false);
  h.spoken.at(-1).onend();await h.tick(0);assert.equal((await third.finished).reason,'end');
});

test('companion waits for park/item speech, and missing completion is bounded by the shared cap',async()=>{
  const normal=fixture(),{scan}=normal.create({tts:true,waitForSpeech:true,parking:'chosen'});await normal.tick(0);
  await normal.tick(50);assert.equal(normal.spoken.at(-1).text,'park');
  await normal.tick(1499);assert.equal(scan.getState().index,-1);
  await normal.tick(1);assert.equal(scan.getState().id,'play');
  await normal.tick(1550);assert.equal(scan.getState().id,'return');
  const failed=fixture({speechMode:'nostart'}),missing=failed.create({tts:true,waitForSpeech:true,parking:'chosen'}).scan;
  await failed.tick(1000);assert.equal(missing.getState().id,'play');
  const hanging=fixture({speechMode:'noevents'}),cap=hanging.voice.speak('long label '.repeat(500));
  let complete=false;cap.finished.then(()=>{complete=true});
  await hanging.tick(9999);assert.equal(complete,false);await hanging.tick(1);
  assert.equal((await cap.finished).reason,'timeout');assert.equal((await cap.finished).started,true);
});

test('companion brake wins pending speech and live setting changes consume the owned release',async()=>{
  const h=fixture({speechMode:'hang'}),{scan}=h.create({tts:true,waitForSpeech:true});
  await h.tick(0);scan.step();await h.tick(50);const late=h.spoken.at(-1);
  scan.brakePress();await h.tick(1);scan.brakeRelease();assert.equal(scan.getState().braked,true);
  late.onend();await h.tick(5000);assert.equal(scan.getState().id,'play');
  scan.brakePress();scan.brakeRelease();await h.tick(999);assert.equal(scan.getState().id,'play');
  await h.tick(1);assert.equal(scan.getState().id,'return');
  scan.brakePress();h.platform.applyPreferences({autoScan:false,tts:false,spaceBrake:true});
  assert.equal(scan.brakeRelease(),true);assert.equal(scan.getState().id,'return');
  await h.tick(10000);assert.equal(scan.getState().id,'return');
});

test('companion blur clears partial holds and redraw preserves identity or parks a removed choice',async()=>{
  const h=fixture(),{scan,selected}=h.create({parking:'chosen'});await h.tick(1000);
  scan.brakePress();h.dispatch('blur');await h.tick(5000);
  assert.equal(scan.getState().id,'play');assert.equal(scan.getState().held,false);
  h.dispatch('focus');await h.tick(999);assert.equal(scan.getState().id,'play');
  await h.tick(1);assert.equal(scan.getState().id,'return');
  scan.brakePress();scan.brakeRelease();
  scan.setItems([{id:'return',label:'Changed return label'},{id:'play',label:'Play'}]);
  assert.equal(scan.getState().id,'return');assert.equal(scan.getState().index,0);assert.equal(scan.getState().braked,true);
  scan.setItems([{id:'play',label:'Play'}]);assert.equal(scan.getState().index,-1);assert.equal(scan.getState().braked,true);
  scan.select();assert.equal(scan.getState().parked,true);
  scan.setItems([{id:'profile:a',label:'Profile A'}]);assert.equal(scan.getState().parked,true);
  assert.deepEqual(selected,[]);scan.dispose();h.dispatch('focus');await h.tick(10000);assert.equal(scan.getState().disposed,true);
});


test('companion Step deadzone is silent while Auto retains park and parked speech',async()=>{
  const h=fixture(),{scan,selected}=h.create({autoScan:false,tts:true,parking:'chosen',waitForSpeech:true});
  await h.tick(50);assert.equal(h.spoken.length,0);assert.equal(scan.getState().index,-1);
  scan.step();await h.tick(50);assert.equal(h.spoken.at(-1).text,'Play / Pause');
  scan.step(-1);await h.tick(50);assert.equal(scan.getState().index,-1);assert.equal(h.spoken.length,1);
  scan.step(-1);await h.tick(50);assert.equal(h.spoken.at(-1).text,'Return to Hub');
  scan.step();await h.tick(50);assert.equal(scan.getState().index,-1);assert.equal(h.spoken.length,2);
  assert.equal(scan.announceCurrent(),null);scan.select();await h.tick(1000);
  assert.equal(h.spoken.length,2);assert.deepEqual(selected,[]);assert.equal(scan.getState().index,-1);
  h.platform.applyPreferences({autoScan:true,tts:true,parking:'chosen',waitForSpeech:true,scanInterval:1000});
  scan.open([{id:'play',label:'Play / Pause'}]);await h.tick(50);
  assert.equal(h.spoken.at(-1).text,'park');assert.equal(scan.getState().waitingForSpeech,true);
  scan.select();await h.tick(50);assert.equal(scan.getState().parked,true);assert.equal(h.spoken.at(-1).text,'parked');
});


test('companion says Paused after its current label and preserves the full resume interval',async()=>{
  const h=fixture(),{scan}=h.create({tts:true,waitForSpeech:true});
  scan.step();await h.tick(50);scan.brakePress();scan.brakeRelease();
  assert.equal(h.spoken.at(-1).text,'Play / Pause');
  await h.tick(499);assert.equal(h.spoken.length,1);assert.equal(h.engine.speaking,true);
  await h.tick(51);assert.deepEqual(h.spoken.map(item=>item.text),['Play / Pause','Paused']);
  assert.equal(scan.getState().braked,true);scan.brakePress();scan.brakeRelease();
  await h.tick(999);assert.equal(scan.getState().id,'play');
  await h.tick(1);assert.equal(scan.getState().id,'return');
  assert.equal(h.spoken.filter(item=>item.text==='Paused').length,1);
});


test('existing Companion player accepts five-second Hub intervals and live changes without resetting choice', async()=>{
  const h=fixture(),{scan}=h.create({scanInterval:5000,parking:'off'});
  await h.tick(4999);assert.equal(scan.getState().index,-1);
  await h.tick(1);assert.equal(scan.getState().id,'play');
  h.platform.applyPreferences({autoScan:true,scanInterval:1000,tts:false,parking:'off'});
  assert.equal(scan.getState().id,'play');
  await h.tick(1000);assert.equal(scan.getState().id,'return');
  h.platform.applyPreferences({autoScan:true,scanInterval:5000,tts:false,parking:'off'});
  await h.tick(4999);assert.equal(scan.getState().id,'return');
  await h.tick(1);assert.equal(scan.getState().index,-1);
});
