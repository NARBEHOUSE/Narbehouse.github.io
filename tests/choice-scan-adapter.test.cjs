const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function harness(extra={},globals={}){
 let now=100000,id=0;const timers=new Map(),subscribers=[],spoken=[],painted=[],badges=[];
 const prefs={autoScan:false,scanInterval:1000,parking:'off',loopsBeforeParking:1,spaceBrake:true,waitForSpeech:false};
 const manager={getSettings:()=>({...prefs}),subscribe:f=>subscribers.push(f),unsubscribe:f=>{const i=subscribers.indexOf(f);if(i>=0)subscribers.splice(i,1)},isParkingEnabled:()=>prefs.autoScan&&prefs.parking!=='off',shouldParkAfterLoop:n=>prefs.autoScan&&prefs.parking==='auto'&&n>=prefs.loopsBeforeParking};
 const context=vm.createContext({Date:class extends Date{static now(){return now}},Promise,console,setTimeout(f,ms){timers.set(++id,{f,at:now+ms});return id},clearTimeout:i=>timers.delete(i)});context.window=context;Object.assign(context,globals);
 context.NarbePlatform={lifecycle:{onActivity:()=>()=>{}}};context.NarbeScanManager=manager;
 context.NarbeScanStatusBadge={create:({host})=>({update(value,details){badges.push({host,value,item:details.item})},destroy(){}})};
 context.NarbeVoiceManager={speak(text){let resolve;const ticket={finished:new Promise(r=>resolve=r),cancel(){resolve({started:true,reason:'cancelled'})}};spoken.push({text,ticket,end:()=>resolve({started:true,reason:'end'})});return ticket}};
 for(const name of ['choice-scan','choice-scan-adapter'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../bennyshub/shared/'+name+'.js'),'utf8'),context);
 manager.createChoiceScan=o=>context.NarbeChoiceScan.create(manager,o);
 const adapter=context.NarbeChoiceScanAdapter.create({holdThreshold:3000,onHighlight:(item,state,ctx)=>painted.push({item,state:{...state},context:ctx.key}),...extra});
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

// Rows entered with {backStop:true} loop through their items plus one stop that
// highlights nothing and says "Back". Only choosing that stop (or the app's own
// hold-Enter Back) leaves the row, and it returns to the same row, never the top.
function rowMode(h){
 const root={key:'rows',statusHost:{},items:[{id:'text',label:'Text'},{id:'r1',label:'A to F'},{id:'r2',label:'G to L'}]};
 h.adapter.sync(root);return root;
}
const letterRow={key:'keys:r2',statusHost:{},items:['G','H','I','J','K','L'].map(id=>({id,label:id}))};
const stopName=state=>state.backStop?'Back':state.id;
test('back-stop rows loop both ways through a spoken Back stop and never leave on their own',()=>{
 const h=harness();rowMode(h);h.adapter.align('r2');h.adapter.enterGroup(letterRow,{wrap:true,backStop:true});
 assert.equal(h.adapter.getState().id,'G');
 const forward=[];for(let i=0;i<14;i++){h.adapter.step(1);assert.equal(h.adapter.getState().depth,1);forward.push(stopName(h.adapter.getState()));}
 assert.deepEqual(forward,['H','I','J','K','L','Back','G','H','I','J','K','L','Back','G']);
 const reverse=[];for(let i=0;i<14;i++){h.adapter.step(-1);assert.equal(h.adapter.getState().depth,1);reverse.push(stopName(h.adapter.getState()));}
 assert.deepEqual(reverse,['Back','L','K','J','I','H','G','Back','L','K','J','I','H','G']);
 h.adapter.step(-1);assert.equal(h.adapter.getState().backStop,true);assert.notEqual(h.adapter.getState().index,-1);
 assert.equal(h.painted.at(-1).item,null,'nothing is highlighted on the Back stop');assert.equal(h.painted.at(-1).context,'keys:r2');
 assert.equal(h.spoken.at(-1).text,'Back');
});
test('choosing the Back stop returns to the same row, not the top; hold-Enter Back still works',()=>{
 const h=harness();rowMode(h);h.adapter.align('r2');h.adapter.enterGroup(letterRow,{wrap:true,backStop:true});
 h.adapter.step(-1);assert.equal(h.adapter.getState().backStop,true);
 h.adapter.select();
 assert.equal(h.adapter.getState().depth,0);assert.equal(h.adapter.getState().id,'r2');assert.equal(h.adapter.context.key,'rows');
 assert.equal(h.painted.at(-1).item.id,'r2');assert.equal(h.spoken.at(-1).text,'G to L');
 h.adapter.enterGroup(letterRow,{wrap:true,backStop:true});h.adapter.step(1);h.adapter.back({restore:true});
 assert.equal(h.adapter.getState().id,'r2');assert.equal(h.adapter.getState().depth,0);
});
test('row mode keeps its blank between the last row and the text row; letter rows have none',()=>{
 const h=harness();rowMode(h);
 const seen=[];for(let i=0;i<8;i++){h.adapter.step(1);seen.push(h.adapter.getState().index<0?'blank':h.adapter.getState().id);}
 assert.deepEqual(seen,['text','r1','r2','blank','text','r1','r2','blank']);
 h.adapter.align('r1');h.adapter.enterGroup({key:'keys:r1',statusHost:{},items:['A','B'].map(id=>({id,label:id}))},{wrap:true,backStop:true});
 for(let i=0;i<12;i++){h.adapter.step(i%4===3?-1:1);assert.notEqual(h.adapter.getState().index,-1);assert.equal(h.adapter.getState().depth,1);}
});
test('Auto Scan loops a back-stop row without parking, Space there does not pause, and redraws keep the stop',async()=>{
 const h=harness();rowMode(h);h.adapter.align('r1');
 const child={key:'keys:r1',statusHost:{},items:[{id:'A',label:'A'},{id:'B',label:'B'}]};
 h.adapter.enterGroup(child,{wrap:true,backStop:true});
 h.update({autoScan:true,scanInterval:1000,parking:'auto',loopsBeforeParking:1});
 const seen=[];for(let i=0;i<9;i++){await h.tick(1000);const s=h.adapter.getState();assert.equal(s.depth,1);assert.equal(s.parked,false);seen.push(stopName(s));}
 assert.deepEqual(seen,['B','Back','A','B','Back','A','B','Back','A']);
 await h.tick(1000);await h.tick(1000);assert.equal(h.adapter.getState().backStop,true);
 assert.equal(h.adapter.brakePress(),true,'Space is consumed on the Back stop');h.adapter.brakeRelease();
 assert.equal(h.adapter.getState().braked,false);assert.notEqual(h.badges.at(-1).value,'Paused');
 h.adapter.sync({...child,items:[...child.items]});assert.equal(h.adapter.getState().backStop,true);assert.equal(h.adapter.getState().depth,1);
 await h.tick(1000);assert.equal(h.adapter.getState().id,'A');
});
test('empty rows are not entered and a row that empties out leaves safely',()=>{
 const h=harness();rowMode(h);h.adapter.align('r1');
 assert.equal(h.adapter.enterGroup({key:'keys:none',statusHost:{},items:[]},{wrap:true,backStop:true}),false);
 assert.equal(h.adapter.getState().id,'r1');assert.equal(h.adapter.getState().depth,0);
 h.adapter.step(1);h.adapter.step(1);assert.equal(h.adapter.getState().index,-1,'row mode gained no Back stop');
 h.adapter.align('r2');h.adapter.enterGroup(letterRow,{wrap:true,backStop:true});h.adapter.step(-1);
 h.adapter.sync({...letterRow,items:[]});assert.equal(h.adapter.getState().depth,0);assert.equal(h.adapter.getState().index,-1);
});
test('the Back stop is handled by the scan and never reaches the app as a selection',()=>{
 const chosen=[],h=harness({onSelect:item=>chosen.push(item.id)});rowMode(h);
 h.adapter.align('r2');h.adapter.select();assert.deepEqual(chosen,['r2']);
 h.adapter.enterGroup(letterRow,{wrap:true,backStop:true});h.adapter.step(1);h.adapter.select();assert.deepEqual(chosen,['r2','H']);
 h.adapter.step(-1);h.adapter.step(-1);assert.equal(h.adapter.getState().backStop,true);h.adapter.select();
 assert.deepEqual(chosen,['r2','H'],'Back is not passed to the app');assert.equal(h.adapter.getState().id,'r2');assert.equal(h.adapter.getState().depth,0);
});

// The Back stop draws a dashed outline around its row's visible items (not the
// filled row highlight); any other stop, row mode or a suspended scan removes it.
function fakeDom(){
 const boxes=[],listeners=new Set();
 const box=()=>({style:{},hidden:false,attrs:{},setAttribute(k,v){this.attrs[k]=v},remove(){boxes.splice(boxes.indexOf(this),1)}});
 const globals={document:{createElement:box,body:{append:b=>boxes.push(b)},documentElement:{}},getComputedStyle:()=>({overflowX:'visible',overflowY:'visible'}),
  innerWidth:1000,innerHeight:800,requestAnimationFrame:f=>{f();return 1},cancelAnimationFrame(){},addEventListener:type=>listeners.add(type),removeEventListener:type=>listeners.delete(type)};
 return {boxes,listeners,globals};
}
const keyAt=(id,left,top,parentElement=null)=>({id,label:id,element:{nodeType:1,isConnected:true,parentElement,getBoundingClientRect:()=>({left,top,right:left+50,bottom:top+40})}});
test('the Back stop outlines its whole row and choosing it returns to the normal row highlight',()=>{
 const dom=fakeDom(),h=harness({},dom.globals);rowMode(h);h.adapter.align('r2');
 h.adapter.enterGroup({key:'keys:r2',statusHost:{},items:['G','H','I','J','K','L'].map((id,i)=>keyAt(id,10+i*60,100))},{wrap:true,backStop:true});
 assert.equal(dom.boxes.length,0,'no outline while a key is highlighted');
 h.adapter.step(-1);assert.equal(h.adapter.getState().backStop,true);assert.equal(dom.boxes.length,1);
 const [box]=dom.boxes;assert.equal(box.hidden,false);assert.match(box.style.cssText,/dashed/);assert.equal(box.attrs['aria-hidden'],'true');
 assert.deepEqual([box.style.left,box.style.top,box.style.width,box.style.height],['6px','96px','358px','48px'],'outline hugs keys G..L');
 assert.ok(dom.listeners.has('scroll')&&dom.listeners.has('resize'));
 h.adapter.step(1);assert.equal(h.adapter.getState().id,'G');assert.equal(dom.boxes.length,0,'leaving the stop removes the outline');assert.equal(dom.listeners.size,0);
 h.adapter.step(-1);assert.equal(dom.boxes.length,1);h.adapter.select();
 assert.equal(h.adapter.getState().id,'r2');assert.equal(h.adapter.getState().depth,0);assert.equal(h.painted.at(-1).item.id,'r2');
 assert.equal(dom.boxes.length,0,'row mode shows its normal highlight, not the outline');
});
test('the Back-stop outline covers only the visible part of a scrolled row',()=>{
 const dom=fakeDom();dom.globals.getComputedStyle=element=>element.scroller?{overflowX:'hidden',overflowY:'auto'}:{overflowX:'visible',overflowY:'visible'};
 const h=harness({},dom.globals);rowMode(h);h.adapter.align('r1');
 const scroller={scroller:true,parentElement:null,getBoundingClientRect:()=>({left:0,top:50,right:500,bottom:250})};
 const message=(id,top)=>({id,label:id,element:{nodeType:1,isConnected:true,parentElement:scroller,getBoundingClientRect:()=>({left:20,top,right:420,bottom:top+60})}});
 h.adapter.enterGroup({key:'messages',statusHost:{},items:[message('m1',0),message('m2',100),message('m3',200),message('m4',400)]},{wrap:true,backStop:true});
 h.adapter.step(-1);const [box]=dom.boxes;
 // m1 shows 50..60, m2 100..160, m3 200..250; m4 is scrolled out of view.
 assert.deepEqual([box.style.left,box.style.top,box.style.width,box.style.height],['16px','46px','408px','208px']);
 h.adapter.sync(null);assert.equal(dom.boxes.length,0,'a suspended scan removes the outline');
});
