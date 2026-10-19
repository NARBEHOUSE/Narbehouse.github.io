const test=require('node:test'),assert=require('node:assert/strict');
const Toggles=require('../bennyshub/shared/hub-toggle-cycle.js');
function harness(t){
 t.mock.timers.enable({apis:['setTimeout','Date'],now:0});
 const button=new EventTarget();Object.assign(button,{dataset:{},isConnected:true,disabled:false});
 let current=button,owns=true,ticket;const changes=[],settings={scanInterval:1000,waitForSpeech:false};
 Toggles.bind(button,direction=>{changes.push(direction);return ticket;});
 const cycle=Toggles.create({current:()=>current,owns:()=>owns,settings:()=>settings,holdThreshold:3000});
 return {button,cycle,changes,settings,tick:ms=>t.mock.timers.tick(ms),focus:value=>current=value,ownership:value=>owns=value,speech:value=>ticket=value};
}
test('tap remains forward; held Enter wraps backward repeatedly without a release selection',t=>{
 const h=harness(t);h.cycle.begin();h.tick(2999);assert.deepEqual(h.changes,[]);assert.equal(h.cycle.release(),false);
 h.button.dispatchEvent(new Event('click'));assert.deepEqual(h.changes,[1]);
 h.cycle.begin();h.tick(3000);assert.deepEqual(h.changes,[1,-1]);h.tick(999);assert.equal(h.changes.length,2);h.tick(1);assert.deepEqual(h.changes,[1,-1,-1]);
 assert.equal(h.cycle.release(),true);h.tick(10000);assert.equal(h.changes.length,3);
});
test('only registered toggles reverse; changing focus or disabling a toggle consumes its release',t=>{
 const h=harness(t);h.focus({});h.cycle.begin();h.tick(10000);assert.equal(h.cycle.release(),false);assert.deepEqual(h.changes,[]);
 h.focus(h.button);h.cycle.begin();h.focus({});h.tick(3000);assert.equal(h.cycle.release(),true);assert.deepEqual(h.changes,[]);
 h.focus(h.button);h.cycle.begin();h.button.disabled=true;assert.equal(h.cycle.release(),true);
});
test('focus loss cancels timers and late speech completion cannot restart a hold',async t=>{
 const h=harness(t);let done;h.settings.waitForSpeech=true;h.speech({finished:new Promise(r=>done=r)});
 h.cycle.begin();h.tick(3000);h.cycle.cancel();done({started:true});await Promise.resolve();h.tick(10000);assert.deepEqual(h.changes,[-1]);assert.equal(h.cycle.release(),false);
});
test('Wait for Speech waits for completion then a full current scan interval',async t=>{
 const h=harness(t);let done;h.settings.waitForSpeech=true;h.speech({finished:new Promise(r=>done=r)});
 h.cycle.begin();h.tick(3000);h.tick(6000);assert.deepEqual(h.changes,[-1]);h.settings.scanInterval=2000;
 done({started:true});await Promise.resolve();h.tick(1999);assert.equal(h.changes.length,1);h.tick(1);assert.equal(h.changes.length,2);h.cycle.cancel();
});
test('ownership loss or a disconnected target stops reverse cycling',t=>{
 const h=harness(t);h.cycle.begin();h.tick(3000);h.ownership(false);h.tick(1000);assert.equal(h.changes.length,1);assert.equal(h.cycle.release(),true);
 h.ownership(true);h.cycle.begin();h.button.isConnected=false;h.tick(3000);assert.equal(h.changes.length,1);assert.equal(h.cycle.release(),true);
});
