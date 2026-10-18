'use strict';
// Real optional voice, muted real output, isolated profile. Start scripts/serve.cjs.
const {chromium,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),base=process.env.BENNY_HUB_BASE||'http://127.0.0.1:4173/bennyshub/';
function instrument(){
 const AudioClass=window.Audio,WorkerClass=window.Worker;window.__generated=[];window.__engines=[];window.__workers=0;
 window.Audio=class extends AudioClass{constructor(...args){super(...args);this.muted=true;}};
 window.Worker=class extends WorkerClass{constructor(url,options){super(url,options);this.sent=new Map();if(/communication-(?:fast-)?worker/.test(String(url))){__workers++;this.addEventListener('message',({data:m})=>{
 if(m.ready)__engines.push({backend:m.backend,engine:m.voiceEngine});
 if(m.samples)__generated.push({text:this.sent.get(m.id)?.text,cached:!!m.cached,ms:Math.round(performance.now()-this.sent.get(m.id)?.at),sampleRate:m.sampleRate,samples:m.samples.length});
 });}}postMessage(m,...args){if(m.id)this.sent.set(m.id,{text:m.text,at:performance.now()});super.postMessage(m,...args);}};
 if(location.pathname.includes('/rtc-lite/'))localStorage.setItem('rtcLite_settings',JSON.stringify({listening:false,stt:'off',ai:'off'}));
}
(async()=>{
 const tempBase=await fs.realpath(os.tmpdir()),runtime=await fs.mkdtemp(path.join(tempBase,'benny-fast-voice-')),report={passed:false,errors:[]};let browser;
 try{
 process.chdir(runtime);browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--mute-audio']});
 const context=await browser.newContext({viewport:{width:1440,height:1000}});await context.grantPermissions(['microphone'],{origin:new URL(base).origin});await context.addInitScript(instrument);
 const requests=[];context.on('request',r=>requests.push(r.url()));const hub=await context.newPage();hub.on('pageerror',e=>report.errors.push(e.message));
 await hub.goto(base);if(await hub.locator('#modal-cancel').isVisible())await hub.locator('#modal-cancel').click();
 assert.equal(await hub.evaluate(()=>NarbeCommunicationSpeech.get().speechMode),'natural');
 await hub.evaluate(()=>{NarbeVoiceManager.updateSettings({ttsEnabled:false});NarbeScanManager.updateSettings({autoScan:false});NarbeCommunicationSpeech.cycleMode();NarbeCommunicationSpeech.toggle();showScreen('settings');});
 await hub.waitForFunction(()=>NarbeCommunicationSpeech.get().voiceReady,null,{timeout:180000});
 await hub.evaluate(async()=>{await NarbeCommunicationSpeech.refresh();NarbeCommunicationSpeech.cycleSpeaker();});
 await expect(hub.locator('#speaker-quality-status')).toHaveText('Faster');await expect(hub.locator('#speaker-voice-toggle')).toBeDisabled();
 await hub.locator('#speaker-settings').screenshot({path:path.join(root,'artifacts/communication-fast-settings.png')});
 async function speak(frame,text){return frame.evaluate(async text=>{const at=performance.now(),ticket=NarbeCommunicationSpeech.speak(text);const started=await ticket.started;const startMs=Math.round(performance.now()-at);const result=await ticket.finished;return {started,startMs,...result};},text);}
 report.newMessage={ticket:await speak(hub,'Could I have a glass of water please?'),generation:await hub.evaluate(()=>__generated.at(-1))};
 report.repeat={ticket:await speak(hub,'Could I have a glass of water please?'),generation:await hub.evaluate(()=>__generated.at(-1))};assert.equal(report.repeat.generation.cached,true);assert.equal(report.newMessage.generation.sampleRate,22050);
 async function openTool(name,selector){await hub.evaluate(name=>{showScreen('home');document.getElementById('iframe-container').classList.add('active');document.getElementById('app-iframe').src='apps/tools/'+name+'/index.html';},name);
 await expect.poll(()=>hub.frames().some(f=>f.url().includes('/'+name+'/index.html'))).toBe(true);const frame=hub.frames().find(f=>f.url().includes('/'+name+'/index.html'));await frame.locator(selector).first().waitFor();assert.equal(await frame.evaluate(()=>NarbeCommunicationSpeech._service===parent.NarbeCommunicationSpeech._service),true);return frame;}
 const keyboard=await openTool('keyboard','#keyboard button');for(const letter of 'HELLO')await keyboard.locator('#keyboard').getByRole('button',{name:letter,exact:true}).click();await keyboard.locator('#textBar').click();await hub.waitForFunction(()=>__generated.at(-1)?.text==='HELLO'&&NarbeCommunicationSpeech.get().phase==='ended');report.keyboard=await hub.evaluate(()=>__generated.at(-1));assert.equal(report.keyboard.text,'HELLO');
 const board=await openTool('phraseboard','#mainGrid > button');await board.evaluate(()=>{buildIndex(PhraseBoard.normalize([{category:'Test',display:'Outside',speak:'I would like to go outside.'}]));state.currentCategory='Test';state.currentMenu='category';state.sentenceMode=false;state.page=0;renderCategory();});await board.locator('[data-speak-text]').click();await hub.waitForFunction(()=>__generated.at(-1)?.text==='I would like to go outside.'&&NarbeCommunicationSpeech.get().phase==='ended');report.phraseBoard=await hub.evaluate(()=>__generated.at(-1));assert.equal(report.phraseBoard.text,'I would like to go outside.');
 const rtc=await openTool('rtc-lite','#continueButton');await rtc.locator('#continueButton').click();const tile=rtc.locator('[data-say]').first(),text=await tile.getAttribute('data-say');await tile.click();await hub.waitForFunction(text=>__generated.at(-1)?.text===text&&NarbeCommunicationSpeech.get().phase==='ended',text);report.rtcLite=await hub.evaluate(()=>__generated.at(-1));assert.equal(report.rtcLite.text,text);
 report.cancelled=await hub.evaluate(async()=>{const ticket=NarbeCommunicationSpeech.speak('This new message will be cancelled before playback.');ticket.cancel();return ticket.finished;});assert.equal(report.cancelled.reason,'cancelled');assert.equal(report.cancelled.started,false);
 report.workerCount=await hub.evaluate(()=>__workers);assert.equal(report.workerCount,1);assert.equal(requests.some(url=>url.includes('kokoro')||url.includes('Kokoro')),false);
 await hub.evaluate(()=>navigator.serviceWorker.ready);const downloadsBefore=requests.filter(u=>u.includes('huggingface.co/rhasspy')).length;
 await hub.reload();if(await hub.locator('#modal-cancel').isVisible())await hub.locator('#modal-cancel').click();await hub.waitForFunction(()=>NarbeCommunicationSpeech.get().voiceReady,null,{timeout:60000});
 assert.equal(await hub.evaluate(()=>NarbeCommunicationSpeech.get().speechMode),'fast');assert.equal(requests.filter(u=>u.includes('huggingface.co/rhasspy')).length,downloadsBefore);
 await context.setOffline(true);report.offline=await speak(hub,'This is a new offline message.');assert.equal(report.offline.reason,'ended');await context.setOffline(false);
 await hub.evaluate(()=>{NarbeCommunicationSpeech.toggle();NarbeCommunicationSpeech.cycleMode();});assert.equal(await hub.evaluate(()=>NarbeCommunicationSpeech.get().voice),'am_michael');assert.equal(await hub.evaluate(()=>NarbeCommunicationSpeech.get().voices.length),14);
 await hub.reload();assert.equal(await hub.evaluate(()=>NarbeCommunicationSpeech.get().speechMode),'natural');report.cache=await hub.evaluate(()=>caches.keys());assert.ok(report.cache.includes('benny-communication-fast-model-v1'));assert.deepEqual(report.errors,[]);report.passed=true;
 }catch(e){report.failure=e.stack;process.exitCode=1;}
 finally{await browser?.close();process.chdir(tempBase);const actual=await fs.realpath(runtime);assert.equal(path.dirname(actual),tempBase);assert.ok(path.basename(actual).startsWith('benny-fast-voice-'));await fs.rm(actual,{recursive:true,force:true,maxRetries:5,retryDelay:200});await fs.writeFile(path.join(root,'artifacts/communication-fast.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
})();
