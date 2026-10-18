const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../bennyshub/shared/communication-worker.js'),'utf8')
  .replace(/^import .*;\r?\n/m,'').replaceAll('import.meta.url',JSON.stringify('https://example.test/communication-worker.js'));
const sample='Hello from your communication speaker.';
function harness(generate=async()=>({audio:new Float32Array([.2,.4])})){
  const messages=[],calls=[],self={},timers=new Set();
  const context=vm.createContext({self,env:{},URL,navigator:{},Float32Array,
    setTimeout:fn=>{timers.add(fn);return fn;},clearTimeout:fn=>timers.delete(fn),
    postMessage:m=>messages.push(m),KokoroTTS:{from_pretrained:async()=>({generate:async(text,{voice})=>{calls.push({text,voice});return generate(text,voice);}})}});
  vm.runInContext(source,context);
  return {messages,calls,send:m=>self.onmessage({data:m}),drain:()=>vm.runInContext('queue',context),warm:async()=>{const timer=timers.values().next().value;if(timer){timers.delete(timer);timer();}await vm.runInContext('queue',context);}};
}
test('rapid voice choices skip obsolete queued preparations',async()=>{
  const h=harness();
  for(let i=0;i<14;i++)h.send({type:'prepare',id:'prepare-'+i,voice:'voice-'+i,text:sample});
  await h.drain();
  assert.deepEqual(h.calls,[{text:sample,voice:'voice-13'}]);
  assert.equal(h.messages.filter(m=>m.cancelled).length,13);
  assert.deepEqual(h.messages.filter(m=>m.ready).map(m=>m.id),['prepare-13']);
});
test('changing voice during inference suppresses stale readiness and warms only the chosen sample',async()=>{
  let finishOld,started;
  const active=new Promise(resolve=>started=resolve);
  const h=harness(async(text,voice)=>{if(voice==='old'){started();return new Promise(resolve=>finishOld=resolve);}return {audio:new Float32Array([.3,.5])};});
  h.send({type:'prepare',id:'old-prepare',voice:'old',text:sample});await active;
  h.send({type:'cancel',id:'old-prepare'});h.send({type:'prepare',id:'new-prepare',voice:'new',text:sample});
  finishOld({audio:new Float32Array([.1])});await h.drain();
  assert.deepEqual(h.messages.filter(m=>m.ready).map(m=>m.id),['new-prepare']);
  h.send({id:1,voice:'new',text:sample});await h.drain();
  assert.equal(h.calls.length,2);assert.equal(h.messages.find(m=>m.id===1).samples.length,2);
});
test('cancelling a sample while preparing prevents delayed playback data',async()=>{
  let finish,started;const active=new Promise(resolve=>started=resolve);
  const h=harness(async()=>{started();return new Promise(resolve=>finish=resolve);});
  h.send({id:1,voice:'one',text:sample});await active;h.send({type:'cancel',id:1});
  finish({audio:new Float32Array([.1])});await h.drain();
  assert.equal(h.messages.filter(m=>m.id===1&&m.samples).length,0);
});

test('visible phrases prepare silently, cache by voice, and reuse generated audio',async()=>{
 const h=harness();h.send({type:'prepare',id:'setup',voice:'one',text:sample});await h.drain();
 h.send({type:'prefetch',voice:'one',texts:['Yes please','Yes please','x'.repeat(121)]});await h.warm();
 assert.equal(h.messages.filter(m=>m.prefetched).length,1);assert.equal(h.messages.filter(m=>m.samples||m.progress).length,0);
 h.send({id:1,voice:'one',text:'Yes please'});await h.drain();assert.equal(h.messages.find(m=>m.id===1).cached,true);assert.equal(h.calls.length,2);
 h.send({id:2,voice:'two',text:'Yes please'});await h.drain();assert.equal(h.calls.length,3);
});
test('a cached selection bypasses background inference and an uncached selection runs before the remaining batch',async()=>{
 let finish,started;const active=new Promise(resolve=>started=resolve);
 const h=harness(async text=>{if(text==='Background'){started();return new Promise(resolve=>finish=resolve);}return {audio:new Float32Array([.3])};});
 h.send({type:'prepare',id:'setup',voice:'one',text:sample});await h.drain();
 h.send({type:'prefetch',voice:'one',texts:['Background','Later']});const warming=h.warm();await active;
 h.send({id:1,voice:'one',text:sample});assert.equal(h.messages.find(m=>m.id===1).cached,true);
 h.send({id:2,voice:'one',text:'Selected'});finish({audio:new Float32Array([.2])});await warming;await h.drain();
 assert.deepEqual(h.calls.map(c=>c.text),[sample,'Background','Selected']);
 await h.warm();assert.equal(h.calls.at(-1).text,'Later');
});
test('selecting the phrase currently being prepared does not generate it twice',async()=>{
 let finish,started;const active=new Promise(resolve=>started=resolve);
 const h=harness(async text=>{if(text==='Selected'){started();return new Promise(resolve=>finish=resolve);}return {audio:new Float32Array([.3])};});
 h.send({type:'prepare',id:'setup',voice:'one',text:sample});await h.drain();
 h.send({type:'prefetch',voice:'one',texts:['Selected']});const warming=h.warm();await active;
 h.send({id:1,voice:'one',text:'Selected'});finish({audio:new Float32Array([.2])});await warming;await h.drain();
 assert.equal(h.calls.filter(c=>c.text==='Selected').length,1);assert.equal(h.messages.find(m=>m.id===1).cached,true);
});
test('changing pages discards queued old phrases and closing the page stops further preparation',async()=>{
 const h=harness();h.send({type:'prepare',id:'setup',voice:'one',text:sample});await h.drain();
 h.send({type:'prefetch',voice:'one',texts:['Old']});h.send({type:'prefetch',voice:'one',texts:['New','Unused']});await h.warm();
 h.send({type:'prefetch',voice:'one',texts:[]});await h.warm();
 assert.deepEqual(h.calls.map(c=>c.text),[sample,'New']);
});
