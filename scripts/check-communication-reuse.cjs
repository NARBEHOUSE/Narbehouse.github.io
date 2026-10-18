'use strict';
// Real browser worker and muted output. Run scripts/serve.cjs first.
const {chromium,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),base=process.env.BENNY_HUB_BASE||'http://127.0.0.1:4173/bennyshub/';
function instrument(){
  const WorkerClass=window.Worker,AudioClass=window.Audio;
  window.__workerCount=0;window.__engines=[];window.__warmed=[];window.__generated=[];window.__tickets=[];
  window.Audio=class extends AudioClass{constructor(...args){super(...args);this.muted=true;}};
  window.Worker=class extends WorkerClass{
    constructor(url,options){super(url,options);this.sent=new Map();if(String(url).includes('communication-worker')){__workerCount++;this.addEventListener('message',({data:m})=>{
      if(m.ready)__engines.push({backend:m.backend,fallbackReason:m.fallbackReason});
      if(m.prefetched)__warmed.push({text:m.text,voice:m.voice});
      if(m.samples)__generated.push({text:this.sent.get(m.id)?.text,cached:!!m.cached,ms:Math.round(performance.now()-this.sent.get(m.id)?.at),samples:m.samples.length});
    });}}
    postMessage(m,...args){if(m.id)this.sent.set(m.id,{text:m.text,at:performance.now()});return super.postMessage(m,...args);}
  };
  if(location.pathname.includes('/rtc-lite/'))localStorage.setItem('rtcLite_settings',JSON.stringify({listening:false,stt:'off',ai:'off'}));
}
function tickets(){
  const api=NarbeCommunicationSpeech,speak=api.speak;
  api.speak=function(text,...args){const row={text},start=performance.now(),ticket=speak.call(this,text,...args);__tickets.push(row);
    ticket.started.then(started=>Object.assign(row,{started,startMs:Math.round(performance.now()-start)}));
    ticket.finished.then(result=>Object.assign(row,result));return ticket;};
}
(async()=>{
  const tempBase=await fs.realpath(os.tmpdir()),runtime=await fs.mkdtemp(path.join(tempBase,'benny-speech-reuse-'));
  const report={passed:false,errors:[]},downloads=[];let browser;
  try{
    process.chdir(runtime);
    const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
    const executablePath=await fs.stat(chrome).then(()=>chrome).catch(()=>chromium.executablePath());
    browser=await chromium.launch({headless:true,executablePath,args:['--mute-audio']});
    const context=await browser.newContext({viewport:{width:1440,height:1000}});
    await context.grantPermissions(['microphone'],{origin:new URL(base).origin});await context.addInitScript(instrument);
    context.on('request',r=>{const host=new URL(r.url()).hostname;if(host==='huggingface.co'||host.endsWith('.hf.co')||host.endsWith('.huggingface.co'))downloads.push(r.url());});
    const hub=await context.newPage();hub.on('pageerror',e=>report.errors.push(e.message));
    await hub.goto(base);if(await hub.locator('#modal-cancel').isVisible())await hub.locator('#modal-cancel').click();
    await hub.evaluate(()=>{NarbeVoiceManager.updateSettings({ttsEnabled:false});NarbeScanManager.updateSettings({autoScan:false});NarbeCommunicationSpeech.toggle();});
    await hub.waitForFunction(()=>NarbeCommunicationSpeech.get().voiceReady,null,{timeout:240000});
    await hub.evaluate(async()=>{await NarbeCommunicationSpeech.refresh();NarbeCommunicationSpeech.cycleSpeaker();window.__states=[];NarbeCommunicationSpeech.subscribe(s=>__states.push({phase:s.phase,detail:s.detail}));});
    assert.ok(await hub.evaluate(()=>NarbeCommunicationSpeech.get().sinkId),'A real output must be selected.');
    await hub.evaluate(tickets);const afterSetup=downloads.length;
    await hub.evaluate(()=>NarbeCommunicationSpeech.speak('Could I have a glass of water please?').finished);
    report.newSentence=await hub.evaluate(()=>({ticket:__tickets.at(-1),generation:__generated.at(-1)}));
    await hub.evaluate(()=>NarbeCommunicationSpeech.speak('Could I have a glass of water please?').finished);
    report.repeat=await hub.evaluate(()=>({ticket:__tickets.at(-1),generation:__generated.at(-1)}));
    assert.equal(report.repeat.generation.cached,true);assert.equal(report.repeat.ticket.reason,'ended');
    async function openTool(name,selector){
      await hub.evaluate(name=>{document.getElementById('iframe-container').classList.add('active');document.getElementById('app-iframe').src='apps/tools/'+name+'/index.html';},name);
      await expect.poll(()=>hub.frames().some(f=>f.url().includes('/'+name+'/index.html'))).toBe(true);
      const frame=hub.frames().find(f=>f.url().includes('/'+name+'/index.html'));await frame.locator(selector).first().waitFor();
      assert.equal(await frame.evaluate(()=>NarbeCommunicationSpeech._service===parent.NarbeCommunicationSpeech._service),true);
      await frame.evaluate(tickets);return frame;
    }
    const board=await openTool('phraseboard','#mainGrid > button');
    await board.evaluate(()=>{buildIndex(PhraseBoard.normalize([{category:'Test',display:'Outside',speak:'I would like to go outside.'},{category:'Test',display:'Thanks',speak:'Thank you for your help.'}]));state.currentCategory='Test';state.currentMenu='category';state.sentenceMode=false;state.page=0;renderCategory();});
    await hub.waitForFunction(()=>__warmed.some(r=>r.text==='I would like to go outside.'),null,{timeout:60000});
    await board.locator('[data-speak-text="I would like to go outside."]').click();await board.waitForFunction(()=>__tickets.at(-1)?.reason==='ended');
    report.phraseBoard={ticket:await board.evaluate(()=>__tickets.at(-1)),generation:await hub.evaluate(()=>__generated.at(-1))};assert.equal(report.phraseBoard.generation.cached,true);
    const keyboard=await openTool('keyboard','#keyboard button');
    for(const letter of 'HELLO')await keyboard.locator('#keyboard').getByRole('button',{name:letter,exact:true}).click();
    await hub.waitForFunction(()=>__warmed.some(r=>r.text==='HELLO'),null,{timeout:60000});
    await keyboard.locator('#textBar').click();await keyboard.waitForFunction(()=>__tickets.at(-1)?.reason==='ended');
    report.keyboard={ticket:await keyboard.evaluate(()=>__tickets.at(-1)),generation:await hub.evaluate(()=>__generated.at(-1))};assert.equal(report.keyboard.generation.cached,true);
    const rtc=await openTool('rtc-lite','#continueButton');await rtc.locator('#continueButton').click();
    const tile=rtc.locator('[data-say]').first(),text=await tile.getAttribute('data-say');
    await hub.waitForFunction(text=>__warmed.some(r=>r.text===text),text,{timeout:60000});await tile.click();await rtc.waitForFunction(()=>__tickets.at(-1)?.reason==='ended');
    report.rtcLite={ticket:await rtc.evaluate(()=>__tickets.at(-1)),generation:await hub.evaluate(()=>__generated.at(-1))};assert.equal(report.rtcLite.generation.cached,true);
    report.engines=await hub.evaluate(()=>__engines);report.workerCount=await hub.evaluate(()=>__workerCount);
    report.extraModelRequests=downloads.length-afterSetup;
    report.falseDownloadMessages=await hub.evaluate(()=>__states.filter(s=>/download|loading local voice/i.test(s.detail)));
    assert.equal(report.workerCount,1);assert.equal(report.engines.length,1);assert.equal(report.extraModelRequests,0);assert.deepEqual(report.falseDownloadMessages,[]);assert.deepEqual(report.errors,[]);
    // The PWA update replaces only the Hub shell cache; downloaded model caches survive.
    report.pwaCache=await hub.evaluate(async()=>{await navigator.serviceWorker.ready;return(await caches.keys()).filter(k=>k.startsWith('benny-web-experiment-'));});
    assert.ok(report.pwaCache.includes('benny-web-experiment-v51'));report.passed=true;
  }catch(e){report.failure=e.stack;process.exitCode=1;}
  finally{
    await browser?.close();process.chdir(tempBase);
    const actual=await fs.realpath(runtime);assert.equal(path.dirname(actual),tempBase);assert.ok(path.basename(actual).startsWith('benny-speech-reuse-'));await fs.rm(actual,{recursive:true,force:true,maxRetries:5,retryDelay:200});
    await fs.mkdir(path.join(root,'artifacts'),{recursive:true});await fs.writeFile(path.join(root,'artifacts/communication-reuse.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
  }
})();
