// With Auto Scan and Parking on, menus open parked and Enter starts the scan (2026-11-27).
// Runs the real platform.js, scan-manager.js (opensParked), choice-scan.js and choice-scan-adapter.js.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const shared=name=>fs.readFileSync(path.join(__dirname,'../bennyshub/shared/'+name+'.js'),'utf8');
function hub(settings){
 let now=100000,id=0;const timers=new Map(),spoken=[],storage=new Map();
 const window={addEventListener(){},removeEventListener(){},location:{origin:'http://127.0.0.1:8765'}};window.parent=window;
 const document={visibilityState:'visible',addEventListener(){},removeEventListener(){},querySelector:()=>null,querySelectorAll:()=>[]};
 window.localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)};
 const context=vm.createContext({window,document,localStorage:window.localStorage,console:{log(){},warn(){},error(){}},Promise,CustomEvent:class{},
  Date:class extends Date{static now(){return now}},setTimeout(f,ms){timers.set(++id,{f,at:now+(ms||0)});return id},clearTimeout:i=>timers.delete(i),setInterval(){return 0},clearInterval(){}});
 Object.assign(window,{Date:context.Date,setTimeout:context.setTimeout,clearTimeout:context.clearTimeout});
 window.NarbeScanStatusBadge={create:()=>({update(){},destroy(){}})};
 window.NarbeVoiceManager={speak(text){spoken.push(text);return {finished:Promise.resolve({started:true,reason:'end'}),cancel(){}};}};
 for(const name of ['platform','scan-manager','choice-scan','choice-scan-adapter'])vm.runInContext(shared(name),context);
 const manager=window.NarbeScanManager;manager.updateSettings({scanSpeedIndex:0,...settings});
 async function tick(ms){const end=now+ms;for(let i=0;i<8;i++)await Promise.resolve();while(true){const next=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;timers.delete(next[0]);now=next[1].at;next[1].f();for(let i=0;i<8;i++)await Promise.resolve();}now=end;}
 const items=(...ids)=>ids.map(i=>({id:i,label:i.toUpperCase()}));
 const direct=(extra={})=>manager.createChoiceScan({choice:true,holdThreshold:3000,items:[],statusHost:{},getId:i=>i.id,getLabel:i=>i.label,...extra});
 return {window,manager,spoken,tick,items,direct};
}
const AUTO_PARK={autoScan:true,parking:'auto',loopsBeforeParking:1};

test('a screen that uses the scan manager directly (Hub, keyboards) opens parked, silently, and Enter starts it',async()=>{
 const h=hub(AUTO_PARK),scan=h.direct();
 scan.open(h.items('a','b'));assert.equal(scan.getState().parked,true,'first menu opens parked');assert.equal(h.spoken.includes('parked'),false,'"parked" is not spoken');
 await h.tick(5000);assert.equal(scan.getState().parked,true,'nothing moves');
 scan.select();assert.equal(scan.getState().parked,false);assert.equal(scan.getState().id,'a','Enter starts at the first item');
 scan.open(h.items('a','b'));assert.equal(scan.getState().parked,false,'a redraw of the same choices keeps scanning (a keyboard row after a letter)');
 scan.open(h.items('x','y','z'));assert.equal(scan.getState().parked,true,'different choices are a new menu');
 scan.open(h.items('x','y','z'));assert.equal(scan.getState().parked,true,'a parked redraw stays parked');
 scan.open(h.items('a','b'),{restoreId:'b'});assert.equal(scan.getState().id,'b','Back to a parent restores its item and keeps scanning');
 scan.setSuspended(true);scan.setSuspended(false);scan.open(h.items('a','b'));assert.equal(scan.getState().parked,true,'coming back after a suspension opens parked');
 scan.select();scan.open(h.items('q'),{startParked:false});assert.equal(scan.getState().parked,false,'explicit startParked:false');
 scan.open(h.items('q'),{startParked:true});assert.equal(scan.getState().parked,true,'explicit startParked:true');
 assert.equal(h.spoken.includes('parked'),false);
});
test('Auto park still scans its loops after Enter, then parks again; items given at creation open parked',async()=>{
 const h=hub(AUTO_PARK),scan=h.direct({items:h.items('a','b')});
 assert.equal(scan.getState().parked,true,'items given at creation are the first menu');
 scan.select();assert.equal(scan.getState().id,'a');
 await h.tick(1000);assert.equal(scan.getState().id,'b');await h.tick(1000);assert.equal(scan.getState().parked,true,'one loop, then Auto park parks');
});
test('Parking Off and Step mode open menus scanning as before',async()=>{
 for(const settings of [{autoScan:true,parking:'off'},{autoScan:false,parking:'auto'}]){
  const h=hub(settings),scan=h.direct();scan.open(h.items('a','b'));
  assert.equal(scan.getState().parked,false,JSON.stringify(settings));assert.equal(scan.getState().index,-1);
 }
 const h=hub({autoScan:true,parking:'off'}),scan=h.direct();scan.open(h.items('a','b'));await h.tick(1000);assert.equal(scan.getState().id,'a','Parking Off scans by itself');
});
test('the shared adapter (games) opens each new menu parked, keeps redraws and Back scanning, and parks a menu that comes back',async()=>{
 const h=hub({autoScan:true,parking:'chosen'}),host={};
 const adapter=h.window.NarbeChoiceScanAdapter.create({holdThreshold:3000,statusHost:host});
 const menu={key:'menu',statusHost:host,items:h.items('a','b')};
 adapter.sync(menu);assert.equal(adapter.getState().parked,true,'a new menu opens parked');
 adapter.select();assert.equal(adapter.getState().id,'a');
 adapter.sync({...menu},{fresh:true});assert.equal(adapter.getState().parked,false,'a fresh redraw of the same menu keeps scanning');
 adapter.sync({key:'settings',statusHost:host,items:h.items('s1','s2')});assert.equal(adapter.getState().parked,true,'another menu opens parked');
 adapter.select();adapter.sync(menu,{restoreId:'b'});assert.equal(adapter.getState().id,'b','Back restores its item and keeps scanning');
 adapter.sync(null);adapter.sync(menu);assert.equal(adapter.getState().parked,true,'a menu coming back after a suspension opens parked');
 adapter.sync({...menu},{fresh:true});assert.equal(adapter.getState().parked,true,'a fresh redraw of a parked menu stays parked (an app that redraws at start-up)');
 assert.equal(h.spoken.includes('parked'),false,'"parked" is not spoken');
});
