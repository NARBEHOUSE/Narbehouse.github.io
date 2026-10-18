const {chromium,expect}=require('@playwright/test');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const root=path.resolve(__dirname,'..'),base='http://127.0.0.1:4173/bennyshub/';
let browser,runtime;
function mocks(){
 window.__speech=[],window.__public=[],window.__stoppedTracks=0;window.__outputs=[{kind:'audiooutput',deviceId:'headphones',label:'Headphones'},{kind:'audiooutput',deviceId:'speaker',label:'Bluetooth speaker'}];
 Object.defineProperty(navigator.mediaDevices,'enumerateDevices',{value:async()=>window.__outputs});
 Object.defineProperty(navigator.mediaDevices,'selectAudioOutput',{value:undefined});
 Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async()=>({getTracks:()=>[{stop:()=>window.__stoppedTracks++}]})});
 window.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};
 Object.defineProperty(window,'speechSynthesis',{value:{speaking:false,cancel(){},getVoices:()=>[{name:'Test voice',lang:'en-US',default:true,voiceURI:'test'}],addEventListener(){},removeEventListener(){},speak(u){window.__speech.push(u.text);queueMicrotask(()=>{u.onstart?.();u.onend?.();});}}});
 const OriginalWorker=window.Worker;
 window.Worker=class {constructor(url,options){if(!/communication-(?:fast-)?worker/.test(String(url)))return new OriginalWorker(url,options);}postMessage(m){if(m.type==='cancel'||m.type==='prefetch')return;if(m.type==='prepare'){setTimeout(()=>this.onmessage?.({data:{id:m.id,ready:true}}),5);return;}window.__public.push({text:m.text,voice:m.voice});setTimeout(()=>this.onmessage?.({data:{id:m.id,samples:new Float32Array(2400),sampleRate:24000}}),window.__workerDelay||5);}terminate(){}};
 window.__players=[];
 window.Audio=class extends EventTarget{constructor(src=''){super();this.src=src;this.sinkId='';window.__players.push(this);}getAttribute(name){return this[name]??null;}setAttribute(name,value){this[name]=value;}async setSinkId(id){this.sinkId=id;}async play(){this.onplaying?.();setTimeout(()=>this.onended?.(),window.__holdPlayback?250:20);}pause(){}removeAttribute(){}load(){}};
}
(async()=>{
 runtime=await fs.mkdtemp(path.join(os.tmpdir(),'benny-speaker-browser-'));process.chdir(runtime);
 const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
 const executablePath=await fs.stat(chrome).then(()=>chrome).catch(()=>chromium.executablePath());browser=await chromium.launch({headless:true,executablePath});
 if(process.argv.includes('--real-routing')){
  const context=await browser.newContext();await context.grantPermissions(['microphone'],{origin:new URL(base).origin});const p=await context.newPage();await p.goto(base);
  const result=await p.evaluate(async()=>{
   const outputs=(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='audiooutput'&&d.deviceId&&!['default','communications'].includes(d.deviceId));
   if(outputs.length<2)throw Error('Connect two audio outputs to verify separate routing.');
   const chosen=[outputs.find(d=>/anker|soundcore|bluetooth/i.test(d.label))||outputs[0]];chosen.push(outputs.find(d=>d.deviceId!==chosen[0].deviceId));const verified=[];
   for(const device of chosen){const audio=new Audio();audio.muted=true;await audio.setSinkId(device.deviceId);if(audio.sinkId!==device.deviceId)throw Error('Output selection was not retained');
    const url=URL.createObjectURL(new Blob([NarbeCommunicationChannel.wave(new Float32Array(2400),24000)],{type:'audio/wav'}));audio.src=url;
    try{await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Muted playback timed out')),10000);audio.onended=()=>{clearTimeout(timer);resolve();};audio.onerror=()=>{clearTimeout(timer);reject(Error('Muted playback failed'));};audio.play().catch(reject);});verified.push(device.label);}
    finally{audio.pause();audio.removeAttribute('src');audio.load();URL.revokeObjectURL(url);}
   }return {outputCount:outputs.length,verified};
  });console.log('Real output selection and muted playback passed:',JSON.stringify(result));return;
 }
 if(process.argv.includes('--gpu-info')){const p=await browser.newPage();await p.goto(base);console.log(await p.evaluate(async()=>{const a=await navigator.gpu?.requestAdapter();return {gpu:!!navigator.gpu,adapter:!!a,info:a?.info?.toJSON?.()||{vendor:a?.info?.vendor,architecture:a?.info?.architecture,description:a?.info?.description,isFallbackAdapter:a?.info?.isFallbackAdapter}};}));return;}
 if(process.argv.includes('--real-voice')){
  const page=await browser.newPage();await page.goto(base);const failures=[];page.on('requestfailed',r=>failures.push(r.url()+': '+r.failure()?.errorText));
  const result=await page.evaluate(async allVoices=>{
   const worker=new Worker(new URL('shared/communication-worker.js',location.href),{type:'module'});
   const run=message=>new Promise((resolve,reject)=>{const start=performance.now(),timer=setTimeout(()=>reject(Error('Voice test timed out')),600000);
    worker.onerror=e=>{clearTimeout(timer);reject(Error(e.message));};
    worker.onmessage=({data:m})=>{if(m.progress)return;clearTimeout(timer);if(m.error){reject(Error(m.error));return;}let peak=0;for(const n of m.samples||[])peak=Math.max(peak,Math.abs(n));resolve({samples:m.samples?.length||0,sampleRate:m.sampleRate,peak,elapsedMs:Math.round(performance.now()-start)});};worker.postMessage(message);
   });
   try{const setup=await run({id:'prepare-1',type:'prepare',voice:'am_michael'}),message={text:'Hello. This is your communication speaker.',voice:'am_michael'};
    const result={setup,first:await run({...message,id:1}),repeat:await run({...message,id:2})};
    if(allVoices){result.voices=[];let id=3;for(const voice of NarbeCommunicationSpeech.get().voices){const audio=await run({id:id++,text:'Hello from your communication speaker.',voice:voice.id});result.voices.push({voice:voice.id,...audio});}}return result;
   }finally{worker.terminate();}
  },process.argv.includes('--all-voices'));
  if(result.voices){assert.equal(result.voices.length,14);for(const voice of result.voices){assert.ok(voice.samples>24000,voice.voice);assert.ok(voice.peak>.01,voice.voice);}}
  assert.ok(result.first.samples>24000);assert.equal(result.first.sampleRate,24000);assert.ok(result.first.peak>.01);assert.equal(result.repeat.samples,result.first.samples);console.log('Real browser-local voice passed:',JSON.stringify(result),'Network failures:',JSON.stringify(failures));return;
 }
 const context=await browser.newContext({viewport:{width:1440,height:1000}});await context.addInitScript(mocks);const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);await page.locator('#modal-cancel').click();await page.evaluate(()=>{NarbeVoiceManager.updateSettings({ttsEnabled:true});NarbeScanManager.updateSettings({autoScan:false});showScreen('settings');});await page.waitForFunction(()=>!isTransitioning);
 await expect(page.locator('#speaker-settings')).toBeVisible();await expect(page.locator('#speaker-output-toggle')).toBeDisabled();await expect(page.locator('#speaker-output-toggle')).toBeVisible();
 assert.equal(await page.locator('#speaker-output-toggle .btn-title').evaluate(el=>getComputedStyle(el).color),await page.locator('#parking-toggle .btn-title').evaluate(el=>getComputedStyle(el).color));
 assert.equal(await page.locator('#speaker-settings #graphics-toggle').count(),0);
 const positions=await page.evaluate(()=>['voice-toggle','graphics-toggle','speaker-settings','scan-settings'].map(id=>{const e=document.getElementById(id);return {id,top:e.offsetTop};}));
 assert.ok(positions[2].top>positions[1].top);assert.ok(positions[3].top>positions[2].top);
 assert.equal(await page.evaluate(()=>__public.length),0);
 const press=async key=>{await page.waitForTimeout(150);await page.keyboard.press(key);};
 await page.locator('#speaker-mode-toggle').click();await expect(page.locator('#speaker-output-toggle')).toBeEnabled();
 await press('Space');assert.equal(await page.locator('#screen-settings').getAttribute('data-selected'),'speaker-output-toggle');
 await press('Enter');await expect.poll(()=>page.evaluate(()=>__players.at(-1)?.sinkId)).toBe('headphones');await press('Enter');await expect(page.locator('#speaker-output-status')).toHaveText('Bluetooth speaker');await expect.poll(()=>page.evaluate(()=>__players.at(-1)?.sinkId)).toBe('speaker');
 await press('Space');assert.equal(await page.locator('#screen-settings').getAttribute('data-selected'),'speaker-voice-toggle');
 await press('Enter');await expect(page.locator('#speaker-voice-status')).toHaveText('Heart');
 assert.equal(await page.locator('#screen-settings').getAttribute('data-selected'),'speaker-voice-toggle');
 await expect.poll(()=>page.evaluate(()=>__public.at(-1)?.voice)).toBe('af_heart');
 assert.equal(await page.evaluate(()=>__public.at(-1).text),'Hello from your communication speaker.');
 const visited=[];
 for(let i=0;i<14;i++){visited.push(await page.evaluate(()=>NarbeCommunicationSpeech.get().voice));await press('Enter');await expect.poll(()=>page.evaluate(()=>NarbeCommunicationSpeech.get().voiceReady)).toBe(true);}
 assert.equal(new Set(visited).size,14);assert.equal(await page.evaluate(()=>NarbeCommunicationSpeech.get().voice),'af_heart');
 assert.equal(await page.locator('#screen-settings').getAttribute('data-selected'),'speaker-voice-toggle');
 // A pending sample cannot play after a later choice, settings exit, or mode-off.
 await expect.poll(()=>page.evaluate(()=>NarbeCommunicationSpeech.get().phase)).toBe('ended');
 let playersBefore=await page.evaluate(()=>{window.__workerDelay=500;return __players.length;});
 const requestsBefore=await page.evaluate(()=>__public.length);
 await page.locator('#speaker-voice-toggle').click();await expect.poll(()=>page.evaluate(()=>__public.length)).toBe(requestsBefore+1);
 await page.evaluate(()=>{document.getElementById('speaker-voice-toggle').click();document.getElementById('speaker-voice-toggle').click();});
 await expect.poll(()=>page.evaluate(()=>NarbeCommunicationSpeech.get().phase)).toBe('ended');
 assert.equal(await page.evaluate(()=>__players.length),playersBefore+1);assert.equal(await page.evaluate(()=>__public.at(-1).voice),'af_bella');
 playersBefore=await page.evaluate(()=>__players.length);
 await page.locator('#speaker-voice-toggle').click();await page.evaluate(()=>showScreen('home'));await page.waitForTimeout(650);
 assert.equal(await page.evaluate(()=>__players.length),playersBefore);
 await page.evaluate(()=>showScreen('settings'));await page.waitForFunction(()=>!isTransitioning);
 await page.locator('#speaker-voice-toggle').click();await page.locator('#speaker-mode-toggle').click();await page.waitForTimeout(650);
 assert.equal(await page.evaluate(()=>__players.length),playersBefore);
 await page.locator('#speaker-mode-toggle').click();await page.evaluate(()=>{window.__workerDelay=5;});
 await page.locator('#speaker-voice-toggle').click();
 await press('Space');assert.equal(await page.locator('#screen-settings').getAttribute('data-selected'),'speaker-quality-toggle');
  await press('Enter');await expect(page.locator('#speaker-quality-status')).toHaveText('Faster');await expect(page.locator('#speaker-voice-toggle')).toBeDisabled();
  await press('Enter');await expect(page.locator('#speaker-quality-status')).toHaveText('Natural');await expect(page.locator('#speaker-voice-toggle')).toBeEnabled();
  await press('Space');assert.equal(await page.locator('#screen-settings').getAttribute('data-selected'),'speaker-find');await press('Enter');assert.equal(await page.evaluate(()=>__stoppedTracks),0);
 await press('Space');assert.equal(await page.locator('#screen-settings').getAttribute('data-selected'),'speaker-test');const samplesBeforeTest=await page.evaluate(()=>__public.length);await press('Enter');await expect.poll(()=>page.evaluate(()=>__public.length)).toBe(samplesBeforeTest+1);
 await expect.poll(()=>page.evaluate(()=>NarbeCommunicationSpeech.get().phase)).toBe('ended');
 assert.equal(await page.evaluate(()=>__players.at(-1).sinkId),'speaker');
 await page.locator('#speaker-mode-toggle').click();await expect(page.locator('#speaker-output-toggle')).toBeDisabled();
 await press('Space');assert.equal(await page.locator('#screen-settings').getAttribute('data-selected'),'autoscan-toggle');
 await page.locator('#speaker-mode-toggle').click();
 await page.evaluate(()=>NarbeScanManager.updateSettings({autoScan:true,scanSpeedIndex:0,parking:'off',waitForSpeech:false}));
 for(const id of ['speaker-output-toggle','speaker-voice-toggle','speaker-quality-toggle','speaker-find','speaker-test']){
  await expect.poll(()=>page.locator('#screen-settings').getAttribute('data-selected'),{timeout:15000}).toBe(id);
 }
 await page.evaluate(()=>NarbeScanManager.updateSettings({autoScan:false}));
 // One-time browser permission is guarded by a spoken, switch-operable Cancel-first dialog.
 await page.evaluate(()=>{__outputs=[];return NarbeCommunicationSpeech.refresh();});await page.locator('#speaker-find').click();
 await expect(page.locator('#speaker-permission-dialog')).toBeVisible();await press('Space');assert.equal(await page.locator('#screen-settings').getAttribute('data-selected'),'speaker-permission-cancel');await press('Enter');
 await expect(page.locator('#speaker-permission-dialog')).toBeHidden();assert.equal(await page.locator('#screen-settings').getAttribute('data-selected'),'speaker-find');
 await press('Enter');await press('Space');await press('Space');await press('Enter');assert.equal(await page.evaluate(()=>__stoppedTracks),1);
 await expect(page.locator('#speaker-permission-dialog')).toBeHidden();
 await page.evaluate(()=>{__outputs=[{kind:'audiooutput',deviceId:'headphones',label:'Headphones'},{kind:'audiooutput',deviceId:'speaker',label:'Bluetooth speaker'}];return NarbeCommunicationSpeech.refresh();});
 await page.locator('#speaker-mode-toggle').click();
 await page.reload();await page.locator('#modal-cancel').click();assert.equal(await page.evaluate(()=>NarbeCommunicationSpeech.isEnabled()),false);
 await page.evaluate(()=>{NarbeCommunicationSpeech.toggle();NarbeVoiceManager.updateSettings({ttsEnabled:true});});
 // General TTS can turn off during a public message without cancelling it.
 const independent=await page.evaluate(async()=>{window.__holdPlayback=true;NarbeVoiceManager.updateSettings({ttsEnabled:true});const ticket=NarbeCommunicationSpeech.speak('Keep speaking');await ticket.started;NarbeVoiceManager.updateSettings({ttsEnabled:false});const result=await ticket.finished;window.__holdPlayback=false;return result;});
 assert.equal(independent.reason,'ended');
 const quietCount=await page.evaluate(()=>__speech.length);await page.evaluate(()=>NarbeVoiceManager.speak('Quiet scan label'));await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>__speech.length),quietCount);
 // Actual app in the Hub iframe shares the parent's player and chosen output; all deliberate actions below run with general TTS off.
 await page.evaluate(()=>{document.getElementById('iframe-container').classList.add('active');document.getElementById('app-iframe').src='apps/tools/keyboard/index.html';});
 const frame=page.frameLocator('#app-iframe');await expect(frame.locator('#keyboard button').first()).toBeVisible();
 for(const letter of 'HELLO')await frame.locator('#keyboard').getByRole('button',{name:letter,exact:true}).click();
 assert.equal(await page.evaluate(()=>NarbeVoiceManager.getSettings().ttsEnabled),false);const before=await page.evaluate(()=>__public.length);await frame.locator('#textBar').click();await expect.poll(()=>page.evaluate(()=>__public.length)).toBe(before+1);
 assert.equal(await page.evaluate(()=>__public.at(-1).text),'HELLO');assert.equal(await frame.locator('#textBar').textContent(),'HELLO|');
 const appFrame=page.frames().find(f=>f.url().includes('/keyboard/'));assert.equal(await appFrame.evaluate(()=>NarbeCommunicationSpeech._service===parent.NarbeCommunicationSpeech._service),true);
 // Native scan feedback still uses only the default speech API.
 await appFrame.evaluate(()=>{NarbeVoiceManager.updateSettings({ttsEnabled:true});NarbeVoiceManager.speak('Private scan label');});await expect.poll(()=>appFrame.evaluate(()=>__speech.includes('Private scan label'))).toBe(true);assert.equal(await page.evaluate(()=>__public.length),before+1);
 await page.evaluate(()=>NarbeCommunicationSpeech.toggle());await frame.locator('#textBar').click();await expect.poll(()=>appFrame.evaluate(()=>__speech.some(t=>t.toLowerCase()==='hello'))).toBe(true);assert.equal(await page.evaluate(()=>__public.length),before+1);
 await page.evaluate(()=>NarbeVoiceManager.updateSettings({ttsEnabled:false}));
 // Phrase board selections compose privately with a text box, including immediate tiles.
 await page.goto(base+'apps/tools/phraseboard/index.html');await expect(page.locator('#mainGrid > button').filter({hasText:'Settings'})).toBeVisible();await page.evaluate(()=>{if(!NarbeCommunicationSpeech.isEnabled())NarbeCommunicationSpeech.toggle();buildIndex(PhraseBoard.normalize([{category:'Test',display:'Hello',speak:'Hello',immediate:true},{category:'Test',display:'Goodbye',speak:'Goodbye'}]));state.currentCategory='Test';state.currentMenu='category';state.sentenceMode=true;state.sentence=[];renderCategory();});await page.locator('[data-speak-text="Hello"]').click();
 assert.equal(await page.evaluate(()=>messageText()),'Hello');assert.equal(await page.evaluate(()=>__public.length),0);
 assert.equal(await page.evaluate(()=>NarbeVoiceManager.getSettings().ttsEnabled),false);await page.locator('#sentenceDisplay').click();await expect.poll(()=>page.evaluate(()=>__public.length)).toBe(1);assert.equal(await page.evaluate(()=>messageText()),'Hello');
 await page.evaluate(()=>{state.sentenceMode=false;renderCategory();});await page.locator('[data-speak-text="Goodbye"]').click();await expect.poll(()=>page.evaluate(()=>__public.at(-1)?.text)).toBe('Goodbye');assert.equal(await page.evaluate(()=>state.ttsBlockInput),false);
 // Device disappearance is visible and never sends text to the default output.
 await page.evaluate(()=>{window.__outputs=[];return NarbeCommunicationSpeech.refresh();});await page.evaluate(()=>speakMessage());await expect.poll(()=>page.locator('#communication-status').textContent()).toContain('unavailable');assert.equal(await page.evaluate(()=>__public.length),2);
 // RTC board and typed messages both use the public route; scanner labels remain private.
 await page.goto(base+'apps/tools/rtc-lite/index.html');await page.evaluate(()=>{localStorage.setItem('rtcLite_settings',JSON.stringify({listening:false,stt:'off',ai:'off'}));});await page.reload();
 await page.locator('#continueButton').click();await expect(page.locator('#boardScreen')).toBeVisible();
 assert.equal(await page.evaluate(()=>NarbeVoiceManager.getSettings().ttsEnabled),false);await page.locator('[data-say]').first().click();await expect.poll(()=>page.evaluate(()=>__public.length)).toBe(1);
 const keyboardButton=page.getByRole('button',{name:/keyboard/i}).filter({visible:true});await keyboardButton.first().click();await expect(page.locator('#keyboardScreen')).toBeVisible({timeout:10000});
 // Keyboard buttons are the actual input path (no text-field fixture mutation).
 for(const letter of 'HI')await page.locator('#keyboardScreen button').filter({hasText:new RegExp('^'+letter+'$')}).click();
 await page.locator('#typedText').click();await expect.poll(()=>page.evaluate(()=>__public.at(-1)?.text)).toBe('Hi');
 // Real pause Help selection, with quiet scanning, uses the same public channel.
 await page.goto(base+'apps/games/BENNYSMATCHYMATCH/index.html');await page.waitForFunction(()=>typeof showPauseMenu==='function');
 await page.evaluate(()=>{NarbeVoiceManager.updateSettings({ttsEnabled:false});NarbeScanManager.updateSettings({autoScan:false});__speech=[];showPauseMenu();});
 await expect(page.locator('#pause-overlay').getByRole('button',{name:'Help',exact:true})).toBeVisible();
 for(let i=0;i<4;i++)await press('Space');await expect(page.locator('#pause-overlay button.active')).toHaveText('Help');
 await press('Enter');await expect.poll(()=>page.evaluate(()=>__public.at(-1)?.text)).toBe('I need help');await expect(page.getByRole('status').filter({hasText:'Help message spoken.'})).toBeVisible();assert.deepEqual(await page.evaluate(()=>__speech.filter(text=>text.trim())),[]);assert.equal(await page.evaluate(()=>__players.at(-1).sinkId),'speaker');
 await page.evaluate(()=>NarbeCommunicationSpeech.toggle());const helpCount=await page.evaluate(()=>__public.length);await press('Enter');assert.equal(await page.evaluate(()=>__public.length),helpCount);assert.deepEqual(await page.evaluate(()=>__speech.filter(text=>text.trim())),[]);
 await page.evaluate(()=>NarbeVoiceManager.updateSettings({ttsEnabled:true}));await press('Enter');await expect.poll(()=>page.evaluate(()=>__speech.includes('I need help'))).toBe(true);
 await page.goto(base+'apps/games/NARBEPETPALS/index.html');await page.waitForFunction(()=>typeof buildPause==='function');await page.evaluate(()=>{NarbeVoiceManager.updateSettings({ttsEnabled:false});NarbeCommunicationSpeech.toggle();buildPause();show('pause','Paused');});
 await page.locator('#pause-list').getByRole('button',{name:/I Need Help/}).click();await expect.poll(()=>page.evaluate(()=>__public.at(-1)?.text)).toBe('I need help, please! I need help, please!');
 assert.deepEqual(errors,[]);console.log('Speaker UI, 14 voice previews, rapid changes, exit cancellation, switch selection, persistence, Hub iframe, private scan speech, all five message actions and real game Help with general TTS off, default-off and disconnect checks passed.');
 await fs.mkdir(path.join(root,'artifacts'),{recursive:true});
 await page.goto(base);if(await page.locator('#modal-cancel').isVisible())await page.locator('#modal-cancel').click();await page.evaluate(()=>showScreen('settings'));await page.waitForFunction(()=>!isTransitioning);await page.locator('#speaker-settings').scrollIntoViewIfNeeded();await page.locator('#speaker-settings').screenshot({path:path.join(root,'artifacts/communication-speakers.png')});
 await page.setViewportSize({width:768,height:1024});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.locator('#speaker-settings').screenshot({path:path.join(root,'artifacts/communication-speakers-tablet.png')});
 await page.locator('#speaker-mode-toggle').click();await page.locator('#speaker-settings').screenshot({path:path.join(root,'artifacts/communication-speakers-off.png')});
 const unsupported=await browser.newContext();await unsupported.addInitScript(mocks);await unsupported.addInitScript(()=>{Object.defineProperty(HTMLMediaElement.prototype,'setSinkId',{value:undefined,configurable:true});try{localStorage.setItem('narbe-communication-speaker',JSON.stringify({enabled:true,sinkId:'speaker',voice:'am_michael'}));}catch(_){}});
 const fallback=await unsupported.newPage();await fallback.goto(base);assert.equal(await fallback.evaluate(()=>NarbeCommunicationSpeech.get().supported),false);await fallback.evaluate(()=>NarbeCommunicationSpeech.toggle());assert.equal(await fallback.evaluate(()=>NarbeCommunicationSpeech.isEnabled()),false);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();if(runtime){process.chdir(os.tmpdir());await fs.rm(runtime,{recursive:true,force:true});}});
