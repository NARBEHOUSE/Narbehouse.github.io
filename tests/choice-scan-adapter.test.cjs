const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function harness(){
 let now=100000,id=0;const timers=new Map(),subscribers=[],spoken=[],painted=[],badges=[];
 const prefs={autoScan:false,scanInterval:1000,parking:'off',loopsBeforeParking:1,spaceBrake:true,waitForSpeech:false};
 const manager={getSettings:()=>({...prefs}),subscribe:f=>subscribers.push(f),unsubscribe:f=>{const i=subscribers.indexOf(f);if(i>=0)subscribers.splice(i,1)},isParkingEnabled:()=>prefs.autoScan&&prefs.parking!=='off',shouldParkAfterLoop:n=>prefs.autoScan&&prefs.parking==='auto'&&n>=prefs.loopsBeforeParking};
 const context=vm.createContext({Date:class extends Date{static now(){return now}},Promise,console,setTimeout(f,ms){timers.set(++id,{f,at:now+ms});return id},clearTimeout:i=>timers.delete(i)});context.window=context;
 context.NarbePlatform={lifecycle:{onActivity:()=>()=>{}}};context.NarbeScanManager=manager;
 context.NarbeScanStatusBadge={create:({host})=>({update(value,details){badges.push({host,value,item:details.item})},destroy(){}})};
 context.NarbeVoiceManager={speak(text){let resolve;const ticket={finished:new Promise(r=>resolve=r),cancel(){resolve({started:true,reason:'cancelled'})}};spoken.push({text,ticket,end:()=>resolve({started:true,reason:'end'})});return ticket}};
 for(const name of ['choice-scan','choice-scan-adapter'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../bennyshub/shared/'+name+'.js'),'utf8'),context);
 manager.createChoiceScan=o=>context.NarbeChoiceScan.create(manager,o);
 const adapter=context.NarbeChoiceScanAdapter.create({holdThreshold:3000,onHighlight:(item,state,ctx)=>painted.push({item,state:{...state},context:ctx.key})});
 const host={};const root={key:'menu',statusHost:host,items:[{id:'a',label:'Alpha',element:{name:'a'}},{id:'b',label:'Bravo',element:{name:'b'}}]};
 async function flush(){for(let i=0;i<8;i++)await Promise.resolve()}
 async function tick(ms){const end=now+ms;await flush();while(true){const next=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;timers.delete(next[0]);now=next[1].at;next[1].f();await flush()}now=end;await flush()}
 function update(patch){Object.assign(prefs,patch);subscribers.forEach(f=>f({...prefs}))}
 return{adapter,root,spoken,painted,badges,tick,update};
}
test('same-context redraw retains stable choice and brake on the replacement DOM element',()=>{
 const h=harness();h.update({autoScan:true});h.adapter.sync(h.root);h.adapter.step(1);h.adapter.brakePress();h.adapter.brakeRelease();
 const replacement={name:'new-a'},next={...h.root,items:[h.root.items[1],{...h.root.items[0],element:replacement}]};h.adapter.sync(next);
 assert.equal(h.adapter.getState().id,'a');assert.equal(h.adapter.getState().index,1);assert.equal(h.adapter.getState().braked,true);assert.equal(h.badges.at(-1).item,replacement);assert.equal(h.badges.at(-1).value,'Paused');
 h.adapter.sync({...next,items:[next.items[0]]});assert.equal(h.adapter.getState().index,-1);
});
test('nested row Back restores identity, while completing its loop returns to root blank',()=>{
 const h=harness();h.adapter.sync(h.root);h.adapter.step(1);const child={key:'row-a',statusHost:{},items:[{id:'a1',label:'One'},{id:'a2',label:'Two'}]};
 h.adapter.enterGroup(child);assert.equal(h.adapter.getState().depth,1);h.adapter.back({restore:true});assert.equal(h.adapter.getState().id,'a');assert.equal(h.adapter.context.key,'menu');
 h.adapter.enterGroup(child);h.adapter.step(1);h.adapter.step(1);assert.equal(h.adapter.getState().index,-1);assert.equal(h.adapter.context.key,'menu');assert.equal(h.painted.at(-1).context,'menu');
});
test('fresh menu is blank, pointer alignment is explicit, and parked redraw stays parked',()=>{
 const h=harness();h.update({autoScan:true,parking:'chosen'});h.adapter.sync(h.root);h.adapter.select();assert.equal(h.adapter.getState().parked,true);h.adapter.sync({...h.root});assert.equal(h.adapter.getState().parked,true);
 h.adapter.align('b');assert.equal(h.adapter.getState().id,'b');assert.equal(h.adapter.getState().parked,false);h.adapter.sync({...h.root,key:'other'});assert.equal(h.adapter.getState().index,-1);
});
test('suspension releases transient holds but preserves a completed brake',()=>{
 const h=harness();h.update({autoScan:true});h.adapter.sync(h.root);h.adapter.step(1);h.adapter.brakePress();h.adapter.cancelInput();assert.equal(h.adapter.getState().braked,false);
 h.adapter.brakePress();h.adapter.brakeRelease();h.adapter.sync(null);assert.equal(h.adapter.active,false);assert.equal(h.badges.at(-1).value,'');h.adapter.sync(h.root);assert.equal(h.adapter.getState().braked,true);
});
test('native held input crossing a fresh context keeps its Auto clock frozen until release',async()=>{
 const h=harness();h.update({autoScan:true});h.adapter.setInputHeld(true);h.adapter.sync(h.root);await h.tick(3000);assert.equal(h.adapter.getState().index,-1);h.adapter.setInputHeld(false);await h.tick(999);assert.equal(h.adapter.getState().index,-1);await h.tick(1);assert.equal(h.adapter.getState().index,0);
});
test('owned changed-value speech waits for completion before the full interval',async()=>{
 const h=harness();h.update({autoScan:true,waitForSpeech:true});h.adapter.sync(h.root);h.adapter.align('a');h.adapter.announce('Alpha changed');await h.tick(2000);assert.equal(h.adapter.getState().id,'a');h.spoken.at(-1).end();await h.tick(999);assert.equal(h.adapter.getState().id,'a');await h.tick(1);assert.equal(h.adapter.getState().id,'b');
});

test('explicit child identity survives a scan-style rebuild and Back still restores the parent',()=>{
 const h=harness();h.adapter.sync(h.root);h.adapter.align('b');const child={key:'settings-row',statusHost:{},items:[{id:'voice',label:'Voice'},{id:'scan-style',label:'Scan style'}]};
 assert.equal(h.adapter.enterGroup(child,{restoreId:'missing'}),false);assert.equal(h.adapter.getState().id,'b');assert.equal(h.adapter.getState().depth,0);
 assert.equal(h.adapter.enterGroup(child,{restoreId:'scan-style'}),true);assert.equal(h.adapter.getState().id,'scan-style');assert.equal(h.adapter.getState().depth,1);h.adapter.back({restore:true});assert.equal(h.adapter.getState().id,'b');
 h.adapter.enterGroup(child);assert.equal(h.adapter.getState().id,'voice');
});


test('adapter forwards parking ownership for composed labels without cancelling ordinary explicit narration',async()=>{
 for(const parkingLabel of [false,true]){
  const h=harness();h.update({autoScan:true,parking:'chosen',waitForSpeech:true});h.adapter.sync(h.root);
  const ticket=h.adapter.announce(parkingLabel?'The dock. Park.':'The dock.',{parkingLabel});
  const spoken=h.spoken.at(-1);let result;ticket.finished.then(value=>{result=value});
  h.update({parking:'off'});await h.tick(0);assert.equal(h.adapter.getState().index,-1);
  if(parkingLabel){
   assert.equal(result?.reason,'cancelled');assert.equal(h.adapter.getState().waitingForSpeech,false);
   spoken.end(); // Late provider completion cannot shorten the fresh interval.
  }else{
   assert.equal(result,undefined);assert.equal(h.adapter.getState().waitingForSpeech,true);
   await h.tick(2000);assert.equal(h.adapter.getState().index,-1);spoken.end();await h.tick(0);
   assert.equal(result.reason,'end');
  }
  await h.tick(999);assert.equal(h.adapter.getState().index,-1);
  await h.tick(1);assert.equal(h.adapter.getState().id,'a');
 }
});

// Keyboard rows are a continuous task: wrapping must never switch to row selection.
test('keyboard rows wrap repeatedly in both directions and Back restores the same row',()=>{
 const h=harness();h.adapter.sync(h.root);h.adapter.align('b');
 const child={key:'keyboard:b',statusHost:{},items:['A','B','C','D','E','F'].map(id=>({id,label:id}))};
 h.adapter.enterGroup(child,{wrap:true});
 for(const direction of [-1,1])for(let i=0;i<25;i++){
  const before=h.adapter.getState().index;h.adapter.step(direction);
  assert.equal(h.adapter.getState().index,(before+direction+6)%6);
  assert.equal(h.adapter.getState().depth,1);assert.equal(h.adapter.context.key,child.key);
 }
 const remembered=h.adapter.getState().id;h.adapter.sync({...child,items:[...child.items]});
 assert.equal(h.adapter.getState().id,remembered);h.adapter.step(-1);assert.equal(h.adapter.getState().depth,1);
 h.adapter.back({restore:true});assert.equal(h.adapter.getState().id,'b');assert.equal(h.adapter.getState().depth,0);
 // The keyboard opt-in cannot leak to other nested choices.
 h.adapter.enterGroup(child);h.adapter.step(-1);assert.equal(h.adapter.getState().index,-1);assert.equal(h.adapter.getState().depth,0);
});

test('keyboard wrapping survives settings changes, Auto brake, speech wait and root parking',async()=>{
 for(const interval of [1000,2000,3000,4000,5000]){
  const h=harness();h.adapter.sync(h.root);h.adapter.align('a');
  const child={key:'keys',statusHost:{},items:[{id:'A',label:'A'},{id:'B',label:'B'}]};
  h.adapter.enterGroup(child,{wrap:true});h.update({autoScan:true,scanInterval:interval,parking:'auto',loopsBeforeParking:1});
  await h.tick(interval*6);assert.equal(h.adapter.getState().id,'A');assert.equal(h.adapter.getState().depth,1);assert.equal(h.adapter.getState().parked,false);
  h.adapter.brakePress();h.adapter.brakeRelease();await h.tick(interval*3);assert.equal(h.adapter.getState().id,'A');assert.equal(h.adapter.getState().braked,true);
  h.adapter.brakePress();h.adapter.brakeRelease();await h.tick(interval-1);assert.equal(h.adapter.getState().id,'A');await h.tick(1);assert.equal(h.adapter.getState().id,'B');
  h.update({waitForSpeech:true});await h.tick(interval*3);assert.equal(h.adapter.getState().id,'B');h.spoken.at(-1).end();await h.tick(interval-1);assert.equal(h.adapter.getState().id,'B');await h.tick(1);assert.equal(h.adapter.getState().id,'A');
  h.update({autoScan:false,waitForSpeech:false});h.adapter.step(-1);assert.equal(h.adapter.getState().id,'B');assert.equal(h.adapter.getState().depth,1);
  h.adapter.back({restore:true});h.update({autoScan:true});await h.tick(interval*5);assert.equal(h.adapter.getState().parked,true);assert.equal(h.adapter.getState().depth,0);
 }
});

test('single-key keyboard rows wrap and removing the selected prediction clears safely',()=>{
 const h=harness();h.adapter.sync(h.root);h.adapter.align('a');h.adapter.enterGroup({key:'predictions',statusHost:{},items:[{id:'word',label:'Word'}]},{wrap:true});
 for(const d of [-1,1,-1]){h.adapter.step(d);assert.equal(h.adapter.getState().id,'word');assert.equal(h.adapter.getState().depth,1);}
 h.adapter.sync({key:'predictions',statusHost:{},items:[]});assert.equal(h.adapter.getState().index,-1);assert.equal(h.adapter.getState().depth,0);
});
