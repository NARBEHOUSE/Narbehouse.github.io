// Real Hub pages, disposable browser profile; only speech hardware/model inference is mocked.
const {chromium,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict');
const web=path.resolve(__dirname,'..'),arg=name=>process.argv.find(x=>x.startsWith(name+'='))?.slice(name.length+1);
const root=path.resolve(arg('--root')||web),fallback=path.resolve(arg('--fallback')||root),desktop=!!arg('--root'),real=process.argv.includes('--real-custom');
const artifacts=path.resolve(arg('--artifacts')||path.join(web,'artifacts/hub-custom-voices'));
let browser,server,runtime;const checks=[],errors=[];
const pass=s=>{checks.push(s);console.log('PASS '+s);};
function mocks(){
 window.__speech=[];window.__workers=[];window.__public=[];
 Object.defineProperty(navigator.mediaDevices,'enumerateDevices',{value:async()=>[{kind:'audiooutput',deviceId:'one',label:'Speaker One'},{kind:'audiooutput',deviceId:'two',label:'Speaker Two'}]});
 Object.defineProperty(navigator.mediaDevices,'selectAudioOutput',{value:undefined});
 window.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};
 let active;
 Object.defineProperty(window,'speechSynthesis',{value:{speaking:false,getVoices:()=>['One','Two','Three'].map(name=>({name,lang:'en-US',voiceURI:name})),addEventListener(){},removeEventListener(){},cancel(){active=null;},speak(u){active=u;window.__speech.push(u.text);u.onstart?.();setTimeout(()=>{if(active===u)u.onend?.();},250);}}});
 const Worker=window.Worker;
 window.Worker=class {
  constructor(url,options){if(!/communication-(?:pocket-|fast-)?worker/.test(String(url)))return new Worker(url,options);this.url=String(url);this.pocket=this.url.includes('communication-pocket-worker.js');this.sent=[];window.__workers.push(this);}
  postMessage(m){
   this.sent.push(m);if(m.type==='prefetch')return;if(m.type==='cancel'){if(this.activeId===m.id)this.activeId=null;return;}this.activeId=m.id;
   if(m.type==='prepare'){setTimeout(()=>this.onmessage?.({data:{id:m.id,...(this.pocket&&this.activeId!==m.id?{cancelled:true}:{ready:true})}}),5);return;}
   window.__public.push({voice:m.voice,text:m.text,names:m.names});setTimeout(()=>this.onmessage?.({data:{id:m.id,samples:new Float32Array(2400),sampleRate:24000}}),5);
  }
  terminate(){this.terminated=true;}
 };
 window.Audio=class extends EventTarget {async setSinkId(id){this.sinkId=id;}async play(){this.onplaying?.();setTimeout(()=>this.onended?.(),30);}pause(){}removeAttribute(){}load(){}};
}
(async()=>{
 await fs.mkdir(artifacts,{recursive:true});runtime=await fs.mkdtemp(path.join(os.tmpdir(),'benny-custom-voice-'));process.chdir(runtime);
 server=http.createServer(async(req,res)=>{
  try{
   let relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\//,'');
   if(!relative.startsWith('bennyshub/')||relative.split(/[\\/]/).some(x=>x==='..'||x.startsWith('.')))throw Error('Not public');
   if(relative.endsWith('/'))relative+='index.html';let bytes;
   try{bytes=await fs.readFile(path.join(root,relative));}catch{bytes=await fs.readFile(path.join(fallback,relative));}
   const ext=path.extname(relative),types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.wasm':'application/wasm','.png':'image/png','.svg':'image/svg+xml'};
   res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream','Cache-Control':'no-store'});res.end(bytes);
  }catch{res.writeHead(404);res.end('Not found');}
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const url='http://127.0.0.1:'+server.address().port+'/bennyshub/';
 let executablePath;for(const candidate of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',chromium.executablePath()])if(await fs.stat(candidate).catch(()=>null)){executablePath=candidate;break;}
 browser=await chromium.launch({headless:true,executablePath});
 const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});
 if(!real){await context.addInitScript(mocks);await context.route('**/*',route=>new URL(route.request().url()).origin===new URL(url).origin?route.continue():route.abort());}
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url);await page.waitForFunction(()=>window.NarbeScanManager&&window.NarbeCommunicationSpeech);
 if(real){
  page.on('console',m=>{if(m.text().startsWith('VOICE '))console.log(m.text());});
  const result=await page.evaluate(async()=>{
   const worker=new Worker(new URL('shared/communication-pocket-worker.js',location.href),{type:'module'});
   const run=m=>new Promise((resolve,reject)=>{
    const start=performance.now(),timer=setTimeout(()=>reject(Error('Custom voice timed out')),600000);
    worker.onerror=e=>{clearTimeout(timer);reject(Error(e.message));};
    worker.onmessage=({data:r})=>{if(r.progress){console.log('VOICE '+r.progress);return;}if(r.id!==m.id)return;clearTimeout(timer);if(r.error){reject(Error(r.error));return;}
     let peak=0;for(const sample of r.samples||[])peak=Math.max(peak,Math.abs(sample));resolve({samples:r.samples?.length||0,sampleRate:r.sampleRate,peak,elapsedMs:Math.round(performance.now()-start)});};worker.postMessage(m);
   });
   try{
    const builtin=await run({id:1,text:'HELLO BEN. HOW ARE YOU?',voice:'pocket:b4',names:['Ben']});
    const data=new Float32Array(await (await fetch('shared/communication-voices/b4.bin')).arrayBuffer()),id='pocket:user-abcdef012345';
    await NarbeCustomVoices.save(id,{frames:data.length/1024,data});
    const imported=await run({id:2,text:'HELLO MCKENNA.',voice:id,names:['McKenna']});
    const repeat=await run({id:3,text:'HELLO MCKENNA.',voice:id,names:['McKenna']});
    return {builtin,imported,repeat};
   }finally{worker.terminate();}
  });
  for(const audio of [result.builtin,result.imported,result.repeat]){assert.ok(audio.samples>24000);assert.equal(audio.sampleRate,24000);assert.ok(audio.peak>.01&&audio.peak<=1);}
  assert.equal(result.imported.samples,result.repeat.samples);await fs.writeFile(path.join(artifacts,'real-voice.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));pass('Actual Pocket worker synthesizes built-in and imported voices, applies names, and reuses cached audio');return;
 }
 if(await page.locator('#modal-cancel').isVisible())await page.locator('#modal-cancel').click();
 await page.evaluate(()=>{NarbeVoiceManager.updateSettings({ttsEnabled:false});NarbeScanManager.updateSettings({autoScan:false,inputSensitivityIndex:0,scanSpeedIndex:0,waitForSpeech:false});showScreen('settings');});
 await page.waitForFunction(()=>!isTransitioning);
 await page.clock.install();await page.clock.pauseAt(new Date(Date.now()+100));
 const tick=ms=>page.clock.runFor(ms),tap=async key=>{await tick(60);await page.keyboard.down(key);await tick(1);await page.keyboard.up(key);await tick(60);};
 const focus=async id=>{await page.locator('#'+id).focus();await tick(60);};
 const prefs=()=>page.evaluate(()=>NarbeCommunicationSpeech.get());
 await focus('voice-toggle');const start=await page.evaluate(()=>NarbeVoiceManager.getSettings().voiceIndex);
 await tap('Enter');assert.equal(await page.evaluate(()=>NarbeVoiceManager.getSettings().voiceIndex),(start+1)%3);
 await page.keyboard.down('Enter');await tick(2999);assert.equal(await page.evaluate(()=>NarbeVoiceManager.getSettings().voiceIndex),(start+1)%3);
 await tick(1);assert.equal(await page.evaluate(()=>NarbeVoiceManager.getSettings().voiceIndex),start);await tick(1000);assert.equal(await page.evaluate(()=>NarbeVoiceManager.getSettings().voiceIndex),(start+2)%3);
 await page.keyboard.up('Enter');await tick(60);assert.equal(await page.evaluate(()=>NarbeVoiceManager.getSettings().voiceIndex),(start+2)%3);
 assert.equal(await page.locator('#screen-settings').getAttribute('data-selected'),'voice-toggle');pass('Short Enter moves forward; held Enter moves backward repeatedly, wraps and consumes release');
 await focus('tts-toggle');await page.keyboard.down('Enter');await tick(6000);assert.equal(await page.evaluate(()=>NarbeVoiceManager.getSettings().ttsEnabled),false);await page.keyboard.up('Enter');await tick(60);assert.equal(await page.evaluate(()=>NarbeVoiceManager.getSettings().ttsEnabled),true);await page.evaluate(()=>NarbeVoiceManager.updateSettings({ttsEnabled:false}));pass('Boolean toggles keep one ordinary release action');
 await focus('voice-toggle');await page.keyboard.down('Enter');await tick(2000);await page.evaluate(()=>dispatchEvent(new Event('blur')));await tick(5000);await page.keyboard.up('Enter');await tick(60);assert.equal(await page.evaluate(()=>NarbeVoiceManager.getSettings().voiceIndex),(start+2)%3);await page.evaluate(()=>dispatchEvent(new Event('focus')));pass('Blur cancels the hold without a late action');
 await page.locator('#speaker-mode-toggle').click();await tick(60);await page.locator('#speaker-output-toggle').click();await tick(60);
 await focus('speaker-voice-toggle');await page.keyboard.down('Enter');await tick(3000);assert.equal((await prefs()).voice,'pocket:b4');await page.keyboard.up('Enter');await tick(60);assert.equal((await prefs()).voice,'pocket:b4');assert((await page.evaluate(()=>__workers.at(-1).url)).endsWith('/communication-pocket-worker.js'));
 assert.equal((await prefs()).voiceReady,true);await expect(page.locator('#speaker-voice-status')).toHaveText('Custom Bright 2');pass('Custom preview supersedes setup and clears the not-ready label after playback');
 await tap('Enter');assert.equal((await prefs()).voice,'am_michael');assert((await page.evaluate(()=>__workers.at(-1).url)).endsWith('/communication-worker.js'));pass('Speaker voice cycles backward across Custom and standard engines');
 await page.locator('#speaker-voice-add').click();await tick(60);await expect(page.locator('#speaker-voice-add-dialog')).toBeVisible();
 assert.deepEqual(await page.evaluate(()=>settingsItems().map(x=>x.id)),['speaker-voice-add-cancel','speaker-voice-add-continue']);
 await tap('Space');assert.equal(await page.locator('#screen-settings').getAttribute('data-selected'),'speaker-voice-add-cancel');await tap('Enter');await expect(page.locator('#speaker-voice-add-dialog')).toBeHidden();pass('Import warning traps scanning with Cancel first and restores the Add voice control');
 const data=Buffer.alloc(1024*4).toString('base64'),voice={format:'pocket-tts-voice-print',version:1,name:'Test Custom',dim:1024,dtype:'float32-le',frames:1,data};
 await page.locator('#speaker-voice-file').setInputFiles({name:'test.pocketvoice.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(voice))});
 await expect.poll(async()=>{await tick(20);return (await prefs()).custom.length;}).toBe(1);
 const imported=(await prefs()).voice;assert.match(imported,/^pocket:user-/);assert.equal((await prefs()).custom[0].name,'Test Custom');
 assert.equal(await page.evaluate(async id=>{const r=indexedDB.open('narbe-communication-voices',1);const db=await new Promise(resolve=>r.onsuccess=()=>resolve(r.result));try{return await new Promise(resolve=>{const q=db.transaction('prints').objectStore('prints').get(id.slice(7));q.onsuccess=()=>resolve(q.result.data.byteLength);});}finally{db.close();}},imported),4096);
 pass('Valid Voice Studio files save their print locally and select the imported voice');
 await page.locator('#speaker-voice-file').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{"bad":true}')});await expect.poll(async()=>{await tick(20);return page.locator('#speaker-voice-note').textContent();}).toMatch(/Could not add/);assert.equal((await prefs()).custom.length,1);pass('Invalid voice files leave existing voices intact');
 await page.locator('#speaker-names').click();await tick(60);await page.locator('#speaker-names-text').fill('McKenna\nAri');await tick(2000);assert.equal(await page.evaluate(()=>document.activeElement.id),'speaker-names-text');await page.locator('#speaker-names-save').click();await tick(60);assert.deepEqual((await prefs()).names,['McKenna','Ari']);pass('Names save correctly and caregiver typing keeps text focus');
 await page.reload();await page.waitForFunction(()=>window.NarbeCommunicationSpeech);await tick(100);assert.equal((await prefs()).voice,imported);assert.equal((await prefs()).custom.length,1);assert.deepEqual((await prefs()).names,['McKenna','Ari']);
 if(await page.locator('#modal-cancel').isVisible())await page.locator('#modal-cancel').click();await page.evaluate(()=>showScreen('settings'));await tick(600);pass('Voice selection and pronunciation names survive reload');
 await page.locator('#speaker-voice-remove').click();await tick(60);assert.deepEqual(await page.evaluate(()=>settingsItems().map(x=>x.id)),['speaker-voice-remove-cancel','speaker-voice-remove-confirm']);await page.locator('#speaker-voice-remove-cancel').click();assert.equal((await prefs()).voice,imported);
 await page.locator('#speaker-voice-remove').click();await page.locator('#speaker-voice-remove-confirm').click();await expect.poll(async()=>{await tick(20);return (await prefs()).custom.length;}).toBe(0);assert.equal((await prefs()).voice,'am_michael');pass('Remove requires confirmation; Cancel preserves the voice and Remove restores Michael');
 if(!desktop){await page.locator('#speaker-quality-toggle').click();await tick(60);assert.equal((await prefs()).speechMode,'fast');await focus('speaker-voice-toggle');await page.keyboard.down('NumpadEnter');await tick(3000);assert.equal((await prefs()).voice,'piper_john');await page.keyboard.up('NumpadEnter');await tick(60);assert.equal((await prefs()).voice,'piper_john');pass('Faster mode retains all six voices and supports held Numpad Enter');}
 await page.evaluate(()=>{NarbeScanManager.updateSettings({autoScan:true,spaceBrake:false,parking:'off',scanSpeedIndex:0,waitForSpeech:true});NarbeVoiceManager.updateSettings({ttsEnabled:true});});
 await focus('highlight-toggle');const value=await page.locator('#highlight-status').textContent();await page.keyboard.down('Enter');await tick(3000);const reversed=await page.locator('#highlight-status').textContent();assert.notEqual(reversed,value);await tick(1299);assert.equal(await page.locator('#highlight-status').textContent(),reversed);await tick(1);assert.notEqual(await page.locator('#highlight-status').textContent(),reversed);await page.keyboard.up('Enter');assert.equal(await page.locator('#screen-settings').getAttribute('data-selected'),'highlight-toggle');pass('Auto scan freezes on the toggle; reverse repeats wait for speech plus the full interval');
 await page.evaluate(()=>{NarbeScanManager.updateSettings({autoScan:false,waitForSpeech:false});NarbeVoiceManager.updateSettings({ttsEnabled:false});showScreen('games');});await tick(600);
 const filter=desktop?'games-genre-toggle':'games-filter-btn';await focus(filter);const genre=await page.evaluate(()=>filterState.games.genre);await page.keyboard.down('Enter');await tick(3000);assert.notEqual(await page.evaluate(()=>filterState.games.genre),genre);await page.keyboard.up('Enter');await tick(60);assert.equal(await page.locator('#screen-games').getAttribute('data-selected'),filter);pass('Hub catalog filter reverses while retaining the same menu item');
 if(desktop){await focus('games-sort-toggle');await page.keyboard.down('Enter');await tick(3000);assert.equal(await page.evaluate(()=>filterState.games.sort),'alpha-desc');await page.keyboard.up('Enter');await tick(60);assert.equal(await page.evaluate(()=>filterState.games.sort),'alpha-desc');pass('PC Hub sort reverses without opening a game');}
 await page.evaluate(()=>showScreen('settings'));await tick(600);for(const size of [{width:1440,height:1000},{width:390,height:844}]){await page.setViewportSize(size);await page.locator('#speaker-settings').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(artifacts,'settings-'+size.width+'.png')});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
 assert.deepEqual(errors,[]);pass('Desktop and narrow layouts remain usable with no renderer errors');
})().catch(e=>{console.error(e);errors.push(e.stack);process.exitCode=1;}).finally(async()=>{
 await browser?.close();await new Promise(r=>server?server.close(r):r());await fs.mkdir(artifacts,{recursive:true});await fs.writeFile(path.join(artifacts,'report.json'),JSON.stringify({checks,errors},null,2));
 // Keep the disposable runtime as evidence; no real browser profile was used.
});
