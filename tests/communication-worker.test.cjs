const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../bennyshub/shared/communication-worker.js'),'utf8')
  .replace(/^import .*;\r?\n/m,'').replaceAll('import.meta.url',JSON.stringify('https://example.test/communication-worker.js'));
const sample='Hello from your communication speaker.';
function harness(generate=async()=>({audio:new Float32Array([.2,.4])})){
  const messages=[],calls=[],self={};
  const context=vm.createContext({self,env:{},URL,navigator:{},Float32Array,
    postMessage:m=>messages.push(m),KokoroTTS:{from_pretrained:async()=>({generate:async(text,{voice})=>{calls.push({text,voice});return generate(text,voice);}})}});
  vm.runInContext(source,context);
  return {messages,calls,send:m=>self.onmessage({data:m}),drain:()=>vm.runInContext('queue',context)};
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
