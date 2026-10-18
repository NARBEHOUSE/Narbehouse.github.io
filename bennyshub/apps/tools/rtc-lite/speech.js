
(function(){
'use strict';
class Speech{
 constructor({getPrefs,onStatus,onText,onProgress,onStateChange=()=>{}}){this.onStateChange=onStateChange;this.loading=false;Object.assign(this,{prefs:getPrefs,onStatus,onText,progress:onProgress});this.epoch=0;this.voiceEpoch=0;this.mutedUntil=0;this.pending=new Map();this.seq=0;this.queue=[];this.active=false;this.captureReady=false;this.state="off";this.ready=false;this.voiceCount=0;this.captureRevision=0;this.playbackHolds=new Set();this.unsubscribe=window.electronAPI?.rtcLite?.onProgress(p=>this.progress(p.file+': '+Math.round(p.received/p.total*100)+'%'));}
 status(message,state='off'){this.state=state;this.onStatus(message,state);}
 reportListening(){
  if(!this.active||!this.captureReady)return;
  const paused=this.muted()||this.audio&&this.audio.state!=='running'||this.stream?.getAudioTracks().some(track=>track.muted);
  this.status(paused?(this.muted()?'Listening paused · app is speaking':'Listening paused · microphone audio is unavailable'):this.processing?'Listening · recognizing recent speech…':'Listening · '+this.name(this.prefs().stt),paused?'paused':'listening');
 }
 voiceStarted(){this.voiceCount++;this.voiceEpoch++;this.resetSegment();this.mutedUntil=Infinity;clearTimeout(this.resumeTimer);if(this.active)this.status('Listening paused · app is speaking','paused');}
 voiceEnded(){this.voiceCount=Math.max(0,this.voiceCount-1);if(!this.voiceCount){this.mutedUntil=Date.now()+500;clearTimeout(this.resumeTimer);this.resumeTimer=setTimeout(()=>{this.reportListening();},500);}}
 holdCaptureForPlayback(){
  if(!this.playbackHolds.size)this.playbackNotBefore=this.active?Date.now()+2200:0;
  const hold={};this.playbackHolds.add(hold);this.voiceStarted();clearTimeout(this.captureResumeTimer);
  // Release the actual recording endpoint, not only its samples. Keep the model
  // and already captured recognition jobs alive while Bluetooth returns to playback.
  void this.closeCapture();
  let released=false;
  const release=()=>{if(released)return;released=true;this.playbackHolds.delete(hold);this.voiceEnded();
   if(this.playbackHolds.size||!this.active)return;
   const run=this.epoch;clearTimeout(this.captureResumeTimer);
   this.captureResumeTimer=setTimeout(()=>{if(run!==this.epoch||!this.active||this.playbackHolds.size)return;
    void this.startCapture(run).catch(e=>{if(run===this.epoch)void this.stop(this.errorMessage(e));});
   },500);
  };
  release.notBefore=this.playbackNotBefore;return release;
 }
 async closeCapture(){
  ++this.captureRevision;this.captureReady=false;clearTimeout(this.restartTimer);
  if(this.recognition){this.recognition.onend=null;this.recognition.abort();this.recognition=null;}
  if(this.processor){this.processor.onaudioprocess=null;this.processor.disconnect();this.processor=null;}
  this.source?.disconnect();this.source=null;this.gain?.disconnect();this.gain=null;
  this.stream?.getTracks().forEach(t=>{t.onended=t.onmute=t.onunmute=null;t.stop();});this.stream=null;
  const ac=this.audio;this.audio=null;
  this.captureClosing=Promise.all([this.captureClosing,ac&&ac.state!=='closed'?ac.close().catch(()=>{}):null]).then(()=>{});
  await this.captureClosing;
 }
 muted(){return Date.now()<this.mutedUntil;}
 resetSegment(){this.frames=[];this.length=0;this.voiced=0;this.silence=0;this.preroll=[];}
 async setup(download=true){
  const provider=this.prefs().stt,stopping=this.stop(),generation=this.epoch;const check=()=>{if(generation!==this.epoch||provider!==this.prefs().stt)throw Error('Speech setup cancelled.');};
  await stopping;check();this.loading=true;this.onStateChange();
  try{this.status('Preparing '+this.name(provider)+'…','starting');
  if(provider==='parakeet'){
   if(!window.electronAPI?.rtcLite)throw Error('Parakeet requires the Windows Hub.');
   const state=await electronAPI.rtcLite.status();check();if(!state.ok)throw Error(state.error);
   if(!state.installed){if(!download)throw Error('Download Parakeet in Settings first.');const result=await electronAPI.rtcLite.install();if(!result.ok)throw Error(result.error);}
   check();const loaded=await electronAPI.rtcLite.load();check();if(!loaded.ok)throw Error(loaded.error);
  }else if(provider==='whisper'){
   this.worker=new Worker('./whisper-worker.js',{type:'module'});
   this.worker.onmessage=({data:m})=>{if(m.progress){this.progress(m.progress);return;}const p=this.pending.get(m.id);if(!p)return;clearTimeout(p.timer);this.pending.delete(m.id);m.error?p.reject(Error(m.error)):p.resolve(m.result);};
   this.worker.onerror=()=>{this.failWorker('Local Whisper stopped. Set it up again.');};
   await this.workerCall({type:'load',download},600000);
  }else if(provider==='browser'){if(!(window.SpeechRecognition||window.webkitSpeechRecognition))throw Error('Browser speech is unavailable. Choose Local Whisper.');}
  else if(provider!=='google')throw Error('Listening is off.');
  check();this.ready=provider;this.status('Speech ready · microphone off');
  }finally{if(generation===this.epoch){this.loading=false;this.onStateChange();}}
 }
 workerCall(message,timeout=60000){return new Promise((resolve,reject)=>{const id=++this.seq,timer=setTimeout(()=>this.failWorker('Local Whisper took too long. Try Parakeet or restart listening.'),timeout);this.pending.set(id,{resolve,reject,timer});try{this.worker.postMessage({...message,id});}catch(e){clearTimeout(timer);this.pending.delete(id);reject(e);}});}
 failWorker(message){this.worker?.terminate();this.worker=null;for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error(message));}this.pending.clear();this.ready=false;this.onStateChange();}
 start(){
  if(this.startPromise)return this.startPromise;
  const promise=this.startRun();this.startPromise=promise;
  return promise.finally(()=>{if(this.startPromise===promise)this.startPromise=null;});
 }
 async startRun(){
  if(this.active)return;const provider=this.prefs().stt;if(provider==='off'||!this.prefs().listening){this.status(provider==='off'?'Microphone off · choose a speech source in Settings':'Microphone off · Listening is off in Settings');return;}
  const epoch=++this.epoch;
  if(this.ready!==provider){this.status('Preparing '+provider+'…','starting');await this.setup(false);if(epoch!==this.epoch-1)return;}
  const run=++this.epoch;this.active=true;this.captureDeviceId='';this.captureReady=false;this.resetSegment();this.status('Starting microphone · '+this.name(provider)+'…','starting');
  try{await this.startCapture(run);}catch(e){if(run===this.epoch)await this.stop(this.errorMessage(e));throw e;}
 }
 async startCapture(run){
  const capture=++this.captureRevision,provider=this.prefs().stt;
  const current=()=>run===this.epoch&&capture===this.captureRevision&&this.active&&!this.playbackHolds.size;
  await this.captureClosing;
  if(!current()){if(run===this.epoch&&this.active&&this.playbackHolds.size)this.status('Listening paused · app is speaking','paused');return;}
  if(provider==='browser'){this.startBrowser(run,capture);return;}
  const audio={channelCount:1,echoCancellation:true,noiseSuppression:true,autoGainControl:true};
  // Reopen the same input after speaking, even if the browser default changes.
  if(this.captureDeviceId)audio.deviceId={exact:this.captureDeviceId};
  const stream=await navigator.mediaDevices.getUserMedia({audio});
  if(!current()){stream.getTracks().forEach(t=>t.stop());return;}
  this.stream=stream;
  const input=stream.getAudioTracks()[0]?.getSettings?.()||{};let inputId=input.deviceId;
  if(['default','communications'].includes(inputId)&&input.groupId&&navigator.mediaDevices.enumerateDevices){
   const devices=await navigator.mediaDevices.enumerateDevices().catch(()=>[]);
   inputId=devices.find(d=>d.kind==='audioinput'&&!['default','communications'].includes(d.deviceId)&&d.groupId===input.groupId)?.deviceId;
   if(!current()){stream.getTracks().forEach(t=>t.stop());return;}
  }
  this.captureDeviceId=inputId&&!['default','communications'].includes(inputId)?inputId:'';
  stream.getAudioTracks().forEach(t=>{t.onended=()=>{if(current())void this.stop('Microphone disconnected. Use Restart microphone in Settings.');};t.onmute=t.onunmute=()=>{if(current())this.reportListening();};});
  // Recognition has no sound to play. Keep its graph off physical output devices.
  const audioOptions={sampleRate:16000};
  if(typeof AudioContext.prototype.setSinkId==='function')audioOptions.sinkId={type:'none'};
  const ac=this.audio=new AudioContext(audioOptions);await ac.resume();
  if(!current()){if(ac.state!=='closed')await ac.close().catch(()=>{});return;}
  if(ac.state!=='running')throw Error('Microphone audio is suspended. Restart listening in Settings.');
  this.source=ac.createMediaStreamSource(stream);this.processor=ac.createScriptProcessor(4096,1,1);this.gain=ac.createGain();this.gain.gain.value=0;
  this.source.connect(this.processor);this.processor.connect(this.gain);this.gain.connect(ac.destination);
  this.processor.onaudioprocess=e=>{if(!current())return;if(this.muted()){this.resetSegment();return;}const input=e.inputBuffer.getChannelData(0),rate=ac.sampleRate;
   const out=new Float32Array(Math.floor(input.length*16000/rate));
   for(let i=0;i<out.length;i++){const lo=Math.floor(i*rate/16000),hi=Math.min(input.length,Math.ceil((i+1)*rate/16000));let s=0;for(let j=lo;j<hi;j++)s+=input[j];out[i]=Math.max(-1,Math.min(1,s/(hi-lo)));}
   this.capture(out,run,provider);
  };
  this.captureReady=true;ac.onstatechange=()=>{if(current())this.reportListening();};this.reportListening();
 }

 name(provider){return ({parakeet:'Local Parakeet · on device',whisper:'Local Whisper · on device',google:'Google Cloud · RT Convo account',browser:'Browser speech · online service',off:'Off'})[provider]||provider;}
 errorMessage(e){return e.name==='NotAllowedError'?'Microphone permission needed. Allow it, then choose Restart microphone.':e.message||'Listening failed. Choose Restart microphone in Settings.';}
 capture(samples,epoch,provider){
  let sum=0;for(const v of samples)sum+=v*v;const voiced=Math.sqrt(sum/samples.length)>.008;
  if(!this.length&&!voiced){this.preroll.push(samples);if(this.preroll.length>2)this.preroll.shift();return;}
  if(!this.length){this.frames=this.preroll;this.length=this.frames.reduce((n,a)=>n+a.length,0);this.preroll=[];}
  this.frames.push(samples);this.length+=samples.length;
  if(voiced){this.voiced+=samples.length;this.silence=0;}else this.silence+=samples.length;
  if(this.silence>=14400||this.length>=192000){
   if(this.voiced>=4000){const audio=new Float32Array(this.length);let pos=0;for(const f of this.frames){audio.set(f,pos);pos+=f.length;}
    if(this.queue.length>=1){void this.stop('Recognition could not keep up. Listening stopped. Try a different speech option in Settings.');return;}
    this.queue.push({audio,at:Date.now(),epoch,provider});void this.drain();
   }this.resetSegment();
  }
 }
 async drain(){
  if(this.processing)return;this.processing=true;this.reportListening();
  try{while(this.queue.length){
   const job=this.queue.shift();if(job.epoch!==this.epoch)continue;
   const start=performance.now();let result;
   try{
    if(job.provider==='parakeet'){result=await electronAPI.rtcLite.transcribe(Array.from(job.audio));if(!result.ok)throw Error(result.error);}
    else if(job.provider==='whisper')result=await this.workerCall({type:'transcribe',audio:job.audio});
    else{
     const pcm=new Uint8Array(job.audio.length*2),view=new DataView(pcm.buffer);for(let i=0;i<job.audio.length;i++)view.setInt16(i*2,Math.max(-32768,Math.min(32767,Math.round(job.audio[i]*32767))),true);
     let binary='';for(let p=0;p<pcm.length;p+=8192)binary+=String.fromCharCode(...pcm.subarray(p,p+8192));
     this.requestAbort=new AbortController();const requestTimer=setTimeout(()=>this.requestAbort?.abort(),30000);const response=await fetch('/api/rt-convo/stt',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({audio:btoa(binary),sampleRate:16000}),signal:this.requestAbort.signal}).finally(()=>clearTimeout(requestTimer));
     if(!response.ok)throw Error(response.status===429?'Google speech quota reached. Choose a local speech option.':'Google speech unavailable. Check the Hub connection or choose a local option.');result=await response.json();if(result.error)throw Error('Google speech is not configured or available. Choose a local option.');
    }
    // Captured segments already exclude app speech. Later narration must not erase
    // an earlier valid utterance just because local recognition finishes slowly.
    if(job.epoch===this.epoch&&result.text?.trim())this.onText(result.text.trim(),job.at,Math.round(performance.now()-start));
   }catch(e){if(job.epoch===this.epoch){await this.stop(e.message);}break;}
  }}finally{this.processing=false;this.reportListening();}
 }
 startBrowser(epoch,capture=this.captureRevision){
  const current=()=>epoch===this.epoch&&capture===this.captureRevision&&this.active&&!this.playbackHolds.size;
  const R=window.SpeechRecognition||window.webkitSpeechRecognition,recognition=this.recognition=new R();recognition.continuous=true;recognition.interimResults=false;recognition.lang='en-US';let beganVoiceEpoch=this.voiceEpoch;
  recognition.onspeechstart=()=>{beganVoiceEpoch=this.voiceEpoch;};
  recognition.onstart=()=>{if(current()){this.captureReady=true;this.reportListening();}};
  recognition.onresult=e=>{if(!current()||this.muted()||beganVoiceEpoch!==this.voiceEpoch)return;for(let i=e.resultIndex;i<e.results.length;i++)if(e.results[i].isFinal)this.onText(e.results[i][0].transcript,Date.now(),null);};
  recognition.onerror=e=>{if(['no-speech','aborted'].includes(e.error))return;if(current())void this.stop('Browser online speech failed ('+e.error+'). Choose Local Whisper or restart the microphone.');};
  recognition.onend=()=>{if(current()){this.captureReady=false;this.status('Reconnecting · Browser online speech','starting');this.restartTimer=setTimeout(()=>{if(current())try{recognition.start();}catch(e){void this.stop(this.errorMessage(e));}},600);}};
  recognition.start();
 }
 async stop(message='Microphone off'){
  ++this.epoch;this.startPromise=null;this.active=false;this.captureReady=false;this.ready=false;this.loading=false;this.onStateChange();this.status(message,'off');this.requestAbort?.abort();this.queue=[];clearTimeout(this.restartTimer);clearTimeout(this.resumeTimer);
  clearTimeout(this.captureResumeTimer);await this.closeCapture();
  this.resetSegment();this.failWorker('Listening stopped.');await window.electronAPI?.rtcLite?.stop();
 }
 async cancelSetup(){await window.electronAPI?.rtcLite?.cancelInstall();await this.stop();}
 dispose(){this.unsubscribe?.();void this.cancelSetup().catch(()=>{});}
}
window.RtcSpeech=Speech;
})();
