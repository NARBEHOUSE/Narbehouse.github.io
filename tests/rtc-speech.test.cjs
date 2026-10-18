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
 return {speech,texts,statuses,context,cleanup:()=>{for(const id of timers)clearTimeout(id);}};
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

function captureHarness({silent=true,browser=false}={}){
 const h=harness(),streams=[],requests=[],contexts=[],recognizers=[];
 const makeStream=()=>{const track={readyState:'live',muted:false,getSettings:()=>({deviceId:'usb-camera'}),stop(){this.readyState='ended';}};const stream={getTracks:()=>[track],getAudioTracks:()=>[track]};streams.push(stream);return stream;};
 h.context.navigator={mediaDevices:{getUserMedia:async options=>{requests.push(options);return makeStream();}}};
 const node=()=>({connect(){},disconnect(){}});
 class AudioContext{constructor(options){this.options=options;this.state='suspended';this.sampleRate=16000;this.destination={};contexts.push(this);}async resume(){this.state='running';}async close(){this.state='closed';}createMediaStreamSource(){return node();}createScriptProcessor(){return node();}createGain(){return {...node(),gain:{value:1}};}}
 if(silent)AudioContext.prototype.setSinkId=async()=>{};h.context.AudioContext=AudioContext;
 h.speech.active=false;h.speech.captureReady=false;h.speech.ready=browser?'browser':'whisper';
 if(browser){h.speech.prefs=()=>({stt:'browser',listening:true});h.context.window.SpeechRecognition=class{constructor(){recognizers.push(this);}start(){this.started=true;this.onstart?.();}abort(){this.aborted=true;this.onend?.();}};}
 let terminated=0;h.speech.worker={terminate(){terminated++;}};
 return {...h,streams,requests,contexts,recognizers,makeStream,terminated:()=>terminated};
}
const settleCapture=()=>new Promise(resolve=>setTimeout(resolve,550));
test('public playback closes capture, keeps recognition loaded, and restores the same mic after the final ticket',async t=>{
 const h=captureHarness();t.after(h.cleanup);await h.speech.start();const epoch=h.speech.epoch,worker=h.speech.worker;
 h.speech.queue.push(audioJob(h.speech));const releaseA=h.speech.holdCaptureForPlayback(),releaseB=h.speech.holdCaptureForPlayback();
 assert.equal(h.streams[0].getTracks()[0].readyState,'ended');assert.equal(h.contexts[0].state,'closed');assert.equal(h.speech.captureReady,false);assert.equal(h.speech.worker,worker);assert.equal(h.speech.ready,'whisper');assert.equal(h.speech.queue.length,1);assert.equal(h.speech.epoch,epoch);
 releaseA();releaseA();await settleCapture();assert.equal(h.requests.length,1);
 releaseB();await settleCapture();assert.equal(h.requests.length,2);assert.equal(h.requests[1].audio.deviceId.exact,'usb-camera');assert.equal(h.speech.captureReady,true);assert.equal(h.speech.worker,worker);assert.equal(h.terminated(),0);await h.speech.stop();
});
test('stopping RTC during playback cannot reopen its microphone afterward',async t=>{
 const h=captureHarness();t.after(h.cleanup);await h.speech.start();const release=h.speech.holdCaptureForPlayback();await h.speech.stop();release();await settleCapture();assert.equal(h.requests.length,1);assert.equal(h.speech.active,false);assert.equal(h.terminated(),1);
});
test('a microphone permission result arriving during playback is closed and never attached',async t=>{
 const h=captureHarness();t.after(h.cleanup);let resolveMic;h.context.navigator.mediaDevices.getUserMedia=()=>new Promise(resolve=>resolveMic=resolve);
 const start=h.speech.start();await Promise.resolve();await Promise.resolve();const release=h.speech.holdCaptureForPlayback();const stream=h.makeStream();resolveMic(stream);await start;
 assert.equal(stream.getTracks()[0].readyState,'ended');assert.equal(h.contexts.length,0);assert.equal(h.speech.captureReady,false);await h.speech.stop();release();
});
test('capture uses no physical output where supported and retains the older-browser fallback',async t=>{
 for(const silent of [true,false]){const h=captureHarness({silent});t.after(h.cleanup);await h.speech.start();assert.equal(h.contexts[0].options.sampleRate,16000);assert.equal(h.contexts[0].options.sinkId?.type,silent?'none':undefined);await h.speech.stop();}
});
test('browser recognition is aborted during playback and resumed without stale results',async t=>{
 const h=captureHarness({browser:true});t.after(h.cleanup);await h.speech.start();const first=h.recognizers[0],release=h.speech.holdCaptureForPlayback();assert.equal(first.aborted,true);assert.equal(first.onend,null);
 first.onresult({resultIndex:0,results:[Object.assign([{transcript:'App speaker audio'}],{isFinal:true})]});assert.equal(h.texts.length,0);
 release();await settleCapture();assert.equal(h.recognizers.length,2);assert.equal(h.recognizers[1].started,true);assert.equal(h.speech.captureReady,true);await h.speech.stop();
});
test('a failed microphone reconnect stops listening without discarding the public message or retrying another input',async t=>{
 const h=captureHarness();t.after(h.cleanup);await h.speech.start();const release=h.speech.holdCaptureForPlayback();let requests=0;
 h.context.navigator.mediaDevices.getUserMedia=async options=>{requests++;assert.equal(options.audio.deviceId.exact,'usb-camera');throw Error('USB camera disconnected');};release();await settleCapture();
 assert.equal(requests,1);assert.equal(h.speech.active,false);assert.match(h.statuses.at(-1)[0],/USB camera disconnected/);
});

test('default microphone aliases resolve to a physical input before reopening',async t=>{
 const h=captureHarness();t.after(h.cleanup);h.context.navigator.mediaDevices.getUserMedia=async options=>{h.requests.push(options);const stream=h.makeStream();stream.getAudioTracks()[0].getSettings=()=>({deviceId:'default',groupId:'camera-group'});return stream;};
 h.context.navigator.mediaDevices.enumerateDevices=async()=>[{kind:'audioinput',deviceId:'default',groupId:'camera-group'},{kind:'audioinput',deviceId:'usb-camera',groupId:'camera-group'},{kind:'audioinput',deviceId:'bluetooth',groupId:'speaker-group'}];
 await h.speech.start();assert.equal(h.speech.captureDeviceId,'usb-camera');const release=h.speech.holdCaptureForPlayback();release();await settleCapture();assert.equal(h.requests[1].audio.deviceId.exact,'usb-camera');await h.speech.stop();
});
test('leaving during the reconnect delay cancels the pending microphone reopen',async t=>{
 const h=captureHarness();t.after(h.cleanup);await h.speech.start();const release=h.speech.holdCaptureForPlayback();release();await h.speech.stop();await settleCapture();assert.equal(h.requests.length,1);assert.equal(h.speech.captureReady,false);
});
