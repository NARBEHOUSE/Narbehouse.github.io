'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../bennyshub/shared/communication-fast-worker.js'),'utf8');
function harness(generate=async()=>new Float32Array([.1,.3]),storage=new Map()){
 const messages=[],texts=[],fetches=[],self={};let print,currentText;
 const context=vm.createContext({self,URL,location:{href:'https://example.test/shared/communication-fast-worker.js'},Float32Array,BigInt64Array,BigInt,console,
 importScripts(){},postMessage:m=>messages.push(m),
 caches:{open:async()=>({match:async url=>storage.get(url)?.clone(),put:async(url,r)=>storage.set(url,r.clone())})},
 fetch:async url=>{fetches.push(url);return new Response(url.endsWith('.json')?JSON.stringify({audio:{sample_rate:22050},espeak:{voice:'en'},inference:{noise_scale:.667,length_scale:1,noise_w:.333}}):new Uint8Array([1]));},
 createPiperPhonemize:async options=>{print=options.print;return {callMain(args){currentText=JSON.parse(args[args.indexOf('--input')+1])[0].text;texts.push(currentText);print(JSON.stringify({phoneme_ids:[1,2,3]}));}};},
 ort:{env:{wasm:{}},Tensor:class{constructor(type,data,dims){Object.assign(this,{type,data,dims});}},InferenceSession:{create:async()=>({run:async()=>({output:{data:await generate(currentText)}})})}}
 });vm.runInContext(source,context);
 return {messages,texts,fetches,send:m=>self.onmessage({data:m}),drain:()=>vm.runInContext('queue',context)};
}
test('Faster generates at its own sample rate and reuses completed audio without inference',async()=>{
 const h=harness();h.send({type:'prefetch',texts:['Speculative']});await h.drain();assert.equal(h.fetches.length,0);
 h.send({type:'prepare',id:'setup'});await h.drain();assert.equal(h.messages.find(m=>m.ready).voiceEngine,'piper');
 h.send({id:1,text:'Please help me.'});await h.drain();h.send({id:2,text:'Please help me.'});await h.drain();
 assert.deepEqual(h.texts,['Hello from your communication speaker.','Please help me.']);assert.equal(h.messages.find(m=>m.id===2).cached,true);assert.equal(h.messages.find(m=>m.id===2).sampleRate,22050);assert.equal(h.fetches.length,2);
});
test('Faster cancellation suppresses stale audio and skips superseded queued messages',async()=>{
 let finish,started;const active=new Promise(r=>started=r);
 const h=harness(async text=>{if(text==='Old'){started();return new Promise(r=>finish=r);}return new Float32Array([.2]);});
 h.send({id:1,text:'Old'});await active;h.send({type:'cancel',id:1});h.send({id:2,text:'Unused'});h.send({id:3,text:'Selected'});
 finish(new Float32Array([.1]));await h.drain();assert.deepEqual(h.texts,['Old','Selected']);assert.deepEqual(h.messages.filter(m=>m.samples).map(m=>m.id),[3]);
});
test('Faster joins all message chunks and stops cancelled preparation',async()=>{
 const h=harness();const text=('This is a message with multiple words. ').repeat(12).trim();h.send({id:1,text});await h.drain();
 assert.equal(h.texts.join(' '),text);assert.equal(h.messages.find(m=>m.id===1).samples.length,24);
 h.send({type:'prepare',id:'obsolete'});h.send({type:'cancel',id:'obsolete'});await h.drain();assert.equal(h.messages.some(m=>m.id==='obsolete'&&m.ready),false);
});
test('Faster persists only model files and reuses them after a worker restart',async()=>{
 const storage=new Map(),first=harness(undefined,storage);first.send({id:1,text:'Private message'});await first.drain();assert.equal(storage.size,2);assert.equal([...storage.keys()].some(key=>key.includes('Private')),false);
 const second=harness(undefined,storage);second.send({id:1,text:'A different message'});await second.drain();assert.equal(second.fetches.length,0);assert.equal(second.messages.find(m=>m.id===1).samples.length,2);
});
