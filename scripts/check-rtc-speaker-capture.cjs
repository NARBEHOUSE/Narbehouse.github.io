'use strict';
// Real Chromium capture graph and muted selected-output playback; fake microphone,
// isolated profile and synthetic speech avoid recording or speaking private audio.
const {chromium,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),base=process.env.BENNY_HUB_BASE||'http://127.0.0.1:4173/bennyshub/';
function instrument(){
 localStorage.setItem('rtcLite_settings',JSON.stringify({listening:true,stt:'whisper',ai:'off'}));
 window.__streams=[];window.__plays=[];window.__loads=0;window.__captures=0;window.__wavePadding=[];
 const createURL=URL.createObjectURL.bind(URL);URL.createObjectURL=blob=>{if(blob.type==='audio/wav')void blob.arrayBuffer().then(buffer=>{const v=new DataView(buffer);__wavePadding.push((v.getUint32(40,true)/2-22050)/v.getUint32(24,true));});return createURL(blob);};
 const gum=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
 navigator.mediaDevices.getUserMedia=async options=>{const stream=await gum(options);__streams.push(stream);return stream;};
 const OriginalWorker=window.Worker;
 window.Worker=class{constructor(url,options){this.url=String(url);if(!/communication-(?:fast-)?worker|whisper-worker/.test(this.url))return new OriginalWorker(url,options);}
 postMessage(m){if(m.type==='cancel'||m.type==='prefetch')return;const whisper=this.url.includes('whisper');if(whisper&&m.type==='load')__loads++;
 setTimeout(()=>this.onmessage?.({data:whisper?{id:m.id,result:m.type==='load'?{ready:true}:{text:''}}:m.type==='prepare'?{id:m.id,ready:true}:{id:m.id,samples:Float32Array.from({length:22050},(_,i)=>Math.sin(i*.1)*.1),sampleRate:22050}}),10);}
 terminate(){} };
 const OriginalAudio=window.Audio;
 window.Audio=class extends OriginalAudio{constructor(...args){super(...args);this.muted=true;}play(){__plays.push({captureOpen:__streams.some(s=>s.getTracks().some(t=>t.readyState==='live')),modelReady:__rtcSpeech.ready,sink:this.sinkId});return super.play();}};
}
(async()=>{const tempBase=await fs.realpath(os.tmpdir()),runtime=await fs.mkdtemp(path.join(tempBase,'rtc-capture-'));let browser;const report={passed:false,errors:[]};
try{
 process.chdir(runtime);browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--mute-audio','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
 const context=await browser.newContext();await context.grantPermissions(['microphone'],{origin:new URL(base).origin});await context.addInitScript(instrument);
 const speech=await fs.readFile(path.join(root,'bennyshub/apps/tools/rtc-lite/speech.js'),'utf8');
 await context.route('**/rtc-lite/speech.js',route=>route.fulfill({contentType:'text/javascript',body:speech+';const OriginalSpeech=RtcSpeech;window.RtcSpeech=class extends OriginalSpeech{constructor(args){super(args);window.__rtcSpeech=this;}capture(...args){__captures++;return super.capture(...args);}};'}));
 const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));await page.goto(base+'apps/tools/rtc-lite/index.html');
 await page.evaluate(async()=>{NarbeVoiceManager.updateSettings({ttsEnabled:false});NarbeScanManager.updateSettings({autoScan:false});NarbeCommunicationSpeech.cycleMode();await NarbeCommunicationSpeech.refresh();NarbeCommunicationSpeech.cycleSpeaker();NarbeCommunicationSpeech.toggle();});
 await page.waitForFunction(()=>NarbeCommunicationSpeech.get().voiceReady);await page.locator('#continueButton').click();await page.waitForFunction(()=>__rtcSpeech.captureReady&&__captures>0);
 report.initial=await page.evaluate(()=>({sink:typeof __rtcSpeech.audio.sinkId==='object'?{type:__rtcSpeech.audio.sinkId.type}:__rtcSpeech.audio.sinkId,rate:__rtcSpeech.audio.sampleRate,loads:__loads,device:__rtcSpeech.captureDeviceId,captures:__captures}));assert.equal(report.initial.sink.type,'none');assert.equal(report.initial.rate,16000);assert.equal(report.initial.loads,1);
 const tile=page.locator('[data-say]').first();await tile.click();await page.waitForFunction(()=>__plays.length===1);
 assert.equal(await page.evaluate(()=>__rtcSpeech.stream),null);assert.equal(await page.evaluate(()=>__plays[0].captureOpen),false);
 await page.waitForFunction(()=>NarbeCommunicationSpeech.get().phase==='ended'&&__rtcSpeech.captureReady);assert.equal(await page.evaluate(()=>__loads),1);assert.equal(await page.evaluate(()=>__rtcSpeech.captureDeviceId),report.initial.device);
 const before=await page.evaluate(()=>__captures);await page.waitForFunction(before=>__captures>before,before);
 // Replacement tickets share a capture hold; only their final completion can resume.
 await tile.click();await tile.click();await page.waitForFunction(()=>NarbeCommunicationSpeech.get().phase==='ended'&&__rtcSpeech.captureReady);assert.equal(await page.evaluate(()=>__loads),1);
 await tile.click();await page.evaluate(()=>NarbeCommunicationSpeech.stop());await page.waitForFunction(()=>__rtcSpeech.captureReady);assert.equal(await page.evaluate(()=>__loads),1);
 await tile.click();await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));await page.waitForTimeout(650);
 report.final=await page.evaluate(()=>({active:__rtcSpeech.active,captureReady:__rtcSpeech.captureReady,liveTracks:__streams.flatMap(s=>s.getTracks()).filter(t=>t.readyState==='live').length,loads:__loads,plays:__plays,padding:__wavePadding}));assert.equal(report.final.active,false);assert.equal(report.final.liveTracks,0);assert.ok(report.final.plays.length>=2);assert.ok(report.final.padding.every(seconds=>seconds>=1.8&&seconds<=2.2));assert.ok(report.final.plays.every(p=>!p.captureOpen&&p.modelReady==='whisper'&&p.sink));assert.deepEqual(report.errors,[]);report.passed=true;
}catch(error){report.failure=error.stack;process.exitCode=1;}
finally{await browser?.close();process.chdir(tempBase);const actual=await fs.realpath(runtime);assert.equal(path.dirname(actual),tempBase);assert.ok(path.basename(actual).startsWith('rtc-capture-'));await fs.rm(actual,{recursive:true,force:true,maxRetries:5,retryDelay:200});await fs.writeFile(path.join(root,'artifacts/rtc-speaker-capture.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
})();
