const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const app=path.join(__dirname,'../bennyshub/apps/tools/rtc-lite');
function harness(){
 const texts=[],statuses=[],timers=new Set();
 const context={window:{},performance,Date,Float32Array,Uint8Array,DataView,AbortController,
  setTimeout:(fn,ms)=>{const id=setTimeout(fn,ms);timers.add(id);return id;},clearTimeout:id=>{clearTimeout(id);timers.delete(id);}};
 vm.runInNewContext(fs.readFileSync(path.join(app,'speech.js'),'utf8'),context);
 const speech=new context.window.RtcSpeech({getPrefs:()=>({stt:'whisper',listening:true}),onText:(...args)=>texts.push(args),onStatus:(...args)=>statuses.push(args),onProgress:()=>{}});
 speech.active=true;speech.captureReady=true;speech.ready='whisper';speech.epoch=1;
 return {speech,texts,statuses,cleanup:()=>{for(const id of timers)clearTimeout(id);}};
}
function audioJob(speech,text='Hello'){return {audio:new Float32Array(4000),at:Date.now(),epoch:speech.epoch,voiceEpoch:speech.voiceEpoch,provider:'whisper',text};}
test('completed speech is delivered even when narration starts during recognition',async t=>{
 const h=harness();t.after(h.cleanup);let finish;
 h.speech.workerCall=()=>new Promise(resolve=>{finish=resolve;});
 h.speech.queue.push(audioJob(h.speech));const pending=h.speech.drain();
 assert.match(h.statuses.at(-1)[0],/recognizing recent speech/);
 h.speech.voiceStarted();finish({text:'Would you like lunch?'});await pending;
 assert.equal(h.texts.length,1);assert.equal(h.texts[0][0],'Would you like lunch?');
});
test('narration preserves already captured speech while excluding new speaker audio',async t=>{
 const h=harness();t.after(h.cleanup);const job=audioJob(h.speech);h.speech.queue.push(job);h.speech.voiceStarted();
 assert.equal(h.speech.queue.length,1);assert.equal(h.speech.queue[0],job);assert.equal(h.speech.muted(),true);assert.equal(h.speech.length,0);
});
test('stopping listening still discards a late recognition result',async t=>{
 const h=harness();t.after(h.cleanup);let finish;h.speech.workerCall=()=>new Promise(resolve=>{finish=resolve;});
 h.speech.queue.push(audioJob(h.speech));const pending=h.speech.drain();await h.speech.stop();finish({text:'Old conversation'});await pending;assert.equal(h.texts.length,0);
});
async function workerFailure(message,download=false){
 const messages=[];const source=fs.readFileSync(path.join(app,'whisper-worker.js'),'utf8').replace(/import \{pipeline,env\} from .*?;/,'').replaceAll('import.meta.url',JSON.stringify('https://example.test/rtc-lite/whisper-worker.js'));
 const context={self:{},URL,Float32Array,env:{backends:{onnx:{wasm:{}}}},pipeline:async()=>{throw Error(message);},postMessage:m=>messages.push(m)};
 vm.runInNewContext(source,context);await context.self.onmessage({data:{id:1,type:'load',download}});return messages.find(m=>m.id===1).error;
}
test('missing model points to the actual Load speech model control',async()=>{
 const message=await workerFailure('`local_files_only=true` and file was not found locally at /models/whisper/config.json');
 assert.match(message,/Settings > Listening & speech recognition/);assert.match(message,/choose Load speech model/);assert.doesNotMatch(message,/Saved Whisper model is missing/);
});
test('runtime and download failures are not mislabeled as missing saved models',async()=>{
 assert.equal(await workerFailure('WebAssembly memory allocation failed'),'WebAssembly memory allocation failed');
 assert.equal(await workerFailure('Network request failed',true),'Network request failed');
});
