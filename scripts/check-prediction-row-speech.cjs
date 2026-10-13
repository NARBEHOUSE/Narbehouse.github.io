'use strict';
// Run: node scripts/check-prediction-row-speech.cjs [--desktop-root=PATH] [--desktop-overlay=PATH]
// Actual renderer files and real Space/Enter events. Capture speech at the platform
// boundary; native services, personal storage and outbound requests are isolated.
const {chromium,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const arg=name=>process.argv.find(v=>v.startsWith('--'+name+'='))?.slice(name.length+3);
const desktop=arg('desktop-root'),staged=arg('desktop-overlay'),only=arg('only');
const report={checks:[],errors:[]};let browser,server;
async function main(){
 server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://localhost'),parts=decodeURIComponent(url.pathname).split('/').filter(Boolean),source=parts.shift();
  const rel=parts.join('/'),base=source==='desktop'?desktop:source==='web'?root:null;
  if(!base||parts.includes('..')){res.writeHead(404);return res.end();}
  // Test storage is synthetic. Never serve desktop user data, keys or message files.
  if(source==='desktop'&&/\.json$/i.test(rel)&&!/(games|tools)\.json$/.test(rel)){
   res.setHeader('Content-Type','application/json');return res.end('{}');
  }
  let body;if(source==='desktop'&&staged)body=await fs.readFile(path.join(staged,rel)).catch(()=>null);
  body??=await fs.readFile(path.join(base,rel));
  const mime={'.html':'text/html','.js':'application/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.wasm':'application/wasm'}[path.extname(rel)]||'application/octet-stream';
  res.setHeader('Content-Type',mime);res.end(body);
 }catch{res.writeHead(404);res.end();}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({executablePath:process.env.HUB_BROWSER_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});

 const specs=[
  {name:'keyboard',url:'tools/keyboard',prefix:'scan',rows:[{id:'row:predictions',selector:'#predictBar .chip'}]},
  {name:'journal',url:'tools/journal',rows:[{id:'row:predictions',selector:'#predictBar .chip'}]},
  {name:'streaming',url:'tools/streaming',rows:[{id:'row:predictions',selector:'#prediction-bar button'}]},
  {name:'ytsearch',url:'tools/ytsearch',webOnly:true,rows:[{id:'row:predRow',selector:'[data-row-id="predRow"] .scan-btn'}]},
  {name:'messenger',url:'tools/messenger',desktopOnly:true,host:'#kb-overlay',rows:[{id:'row:1',selector:'#kb-pred-green-panel .kb-pred-btn'},{id:'row:2',selector:'#kb-pred-purple-panel .kb-pred-btn',phrases:true},{id:'row:10',selector:'#kb-kenlm-row .kb-kenlm-btn'}]},
  {name:'search',url:'tools/search',desktopOnly:true,rows:[{id:'row:9',selector:'#row-pred .pred-btn'}]},
  {name:'rt-convo',url:'tools/rt-convo',desktopOnly:true,rows:[{selector:'.pred-word',phrases:false},{selector:'.pred-phrase',phrases:true}]}
 ];
 for(const source of ['web',...(desktop?['desktop']:[])])for(const spec of specs){
  if(source==='web'&&spec.desktopOnly||source==='desktop'&&spec.webOnly||only&&only!==source+':'+spec.name)continue;
  try {
  const ctx=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:'block'});
  await ctx.route('**/*',async route=>{const url=new URL(route.request().url());
   if(url.origin!==origin)return route.fulfill({body:'',contentType:'text/plain'});
   if(url.pathname.endsWith('/platform.js')){const response=await route.fetch();return route.fulfill({response,body:await response.text()+
    '\nwindow.__spoken=[];window.__speechPending=null;NarbePlatform.speech.speak=text=>{let resolve,done=false;const record={text:String(text),reason:null};__spoken.push(record);const finished=new Promise(r=>resolve=r);const finish=reason=>{if(done)return;done=true;record.reason=reason;resolve({started:true,reason});};window.__speechPending=()=>finish("end");return {started:Promise.resolve(true),finished,cancel:()=>finish("cancelled")};};NarbePlatform.speech.cancel=()=>{};'});}
   if(url.pathname.endsWith('/choice-scan.js')){const response=await route.fetch();return route.fulfill({response,body:await response.text()+'\nwindow.__rowCheckScanners=[];const nativeCreate=NarbeChoiceScan.create;NarbeChoiceScan.create=(...args)=>{const scanner=nativeCreate(...args);__rowCheckScanners.push(scanner);return scanner;};'});}
   if(url.pathname.endsWith('/tool-gate.js'))return route.fulfill({body:'',contentType:'application/javascript'});
   if(url.pathname.endsWith('/extension-client.js'))return route.fulfill({body:'window.BennyExtension={supports:name=>name!=="journal-storage-v1",check:async()=>({connected:false,capabilities:[]}),onStatus:()=>()=>{},request:async()=>({})};',contentType:'application/javascript'});
   return route.continue();
  });
  await ctx.addInitScript(({isDesktop})=>{
   localStorage.setItem('narbe-scan-settings',JSON.stringify({autoScan:false,scanSpeedIndex:0,inputSensitivityIndex:0,parking:'off',spaceBrake:true,waitForSpeech:false,loopsBeforeParking:1}));
   localStorage.setItem('narbe-voice-settings',JSON.stringify({ttsEnabled:true}));
   localStorage.setItem('tts_enabled','false');
   window.WebSocket=class{static OPEN=1;readyState=0;addEventListener(){}close(){}send(){throw Error('Network sends forbidden in keyboard check')}};
   if(isDesktop){
    window.benAPI={getConfig:async()=>({appDir:'',wsPort:1}),readFile:async()=>null,writeFile:async()=>false,updateNgrams:async()=>false};
    window.electronAPI={keyboard:{getPredictions:async()=>({frequent_words:{HELLO:5,WORLD:3},bigrams:{},trigrams:{}}),savePrediction:async()=>{},saveNgram:async()=>{}},journal:{getEntries:async()=>({entries:[]}),saveEntries:async()=>{}},streaming:{getData:async()=>[],getLastWatched:async()=>({}),getSearchHistory:async()=>[]}};
   }
  },{isDesktop:source==='desktop'});
  const page=await ctx.newPage();page.on('pageerror',e=>report.errors.push({surface:source+':'+spec.name,message:e.message}));
  await page.clock.install({time:new Date('2026-10-04T16:00:00Z')});await page.clock.pauseAt(new Date('2026-10-04T16:00:01Z'));
  const tick=ms=>page.clock.runFor(ms),tap=async key=>{await page.keyboard.down(key);await tick(1);await page.keyboard.up(key);await tick(100)};
  const state=()=>page.locator(spec.host||'body').evaluate((el,p)=>({id:el.dataset[p+'Selected'],index:Number(el.dataset[p+'Index']),depth:window.__rowCheckScanners?.map(s=>s.getState()).find(s=>!s.suspended&&s.id===(el.dataset[p+'Selected']==='park'?null:el.dataset[p+'Selected']))?.depth,mode:el.dataset[p+'State'],context:el.dataset[p+'Context']}),spec.prefix||'choice');
  const prefs=async data=>{await page.evaluate(data=>NarbeScanManager.updateSettings(data),data);await tick(0)};
  await page.goto(origin+'/'+source+'/bennyshub/apps/'+spec.url+'/index.html',{waitUntil:'load'});await tick(1000);
  if(spec.name==='keyboard')await page.waitForFunction(()=>window.predictionSystem?.dataLoaded);
  if(spec.name==='journal'){await page.locator('[data-action="entries"]').click();await tick(300);await page.locator('[data-action="add-entry"]').click();await expect(page.locator('body')).toHaveAttribute('data-choice-context','keyboard');await expect(page.locator('#keyboard .key')).toHaveCount(42);}
  if(spec.name==='streaming')await page.locator('#btn-search').click();
  if(spec.name==='messenger')await page.evaluate(()=>BenKeyboard.open({onSend(){throw Error('Must not send during keyboard tests')}}));
  if(spec.name==='rt-convo'){
   if(await page.locator('#consentBtn').isVisible())await page.locator('#consentBtn').click();await tick(1500);if(await page.locator('[data-action="closeSettings"]').isVisible())await page.locator('[data-action="closeSettings"]').click();await tick(100);
   await page.getByRole('button',{name:'Type',exact:false}).first().click();await tick(100);
  }

  await page.evaluate(()=>NarbeVoiceManager.updateSettings({ttsEnabled:true}));
  const targets=[...spec.rows];
  if(source==='desktop'&&spec.name==='keyboard')targets.push({id:'row:letters',selector:'#letterPredictBar .letter-chip',letters:true});

  for(const target of targets){
   await prefs({autoScan:false,waitForSpeech:false});
   const cells=page.locator(target.selector);assert.ok(await cells.count()>0,target.selector+' exists');
   const fixture=target.letters?['A','B','C','D','E','F']:target.phrases?['I want','help please','thank you','all done','more please','not now']:['IT','IS','YES','HELP','TODAY','THANKS'];
   const setWords=async words=>cells.evaluateAll((elements,words)=>elements.forEach((el,i)=>{el.textContent=words[i]||'';if('tts' in el.dataset)el.dataset.tts=words[i]||'';el.disabled=false;}),words);
   await setWords(fixture);
   await prefs({inputSensitivityIndex:1});await prefs({inputSensitivityIndex:0});
   if(spec.name==='rt-convo')target.id=await cells.first().evaluate(el=>'row:'+(Array.from(el.parentElement.parentElement.querySelectorAll('.board-row')).indexOf(el.parentElement)+2));
   const visit=async()=>{for(let i=0;i<35;i++){await tap('Space');if((await state()).id===target.id)return;}throw Error('Prediction row unreachable: '+target.id+' '+JSON.stringify(await state()));};
   const normalize=text=>String(text).toLowerCase().replace(/[,.]/g,' ').replace(/\s+/g,' ').trim();
   const assertSpeech=async words=>{
    const spoken=await page.evaluate(()=>window.__spoken);
    assert.equal(normalize(spoken.at(-1)?.text),normalize(words.filter(Boolean).join(' ')),source+':'+spec.name+':'+target.id+' speaks each displayed suggestion in order');
    return spoken.at(-1).text;
   };
   await visit();const first=await assertSpeech(fixture.slice(0,await cells.count()));
   // A label must read live suggestions, including after a refresh and nested Back.
   const refreshed=fixture.slice(0,await cells.count()).reverse();refreshed[1]='';
   await setWords(refreshed);await visit();await assertSpeech(refreshed);
   await tap('Enter');assert.equal((await state()).depth,1,'prediction row enters its keys');
   // Refresh buttons remain selectable but are excluded from the row announcement.
   if((spec.name==='messenger'&&target.id!=='row:10')||spec.name==='rt-convo')await tap('Space');
   await assertSpeech([refreshed[0]]);
   // Use the app's actual parent return to verify its stored label is still current.
   await page.evaluate(()=>window.__rowCheckScanners.find(s=>!s.getState().suspended&&s.getState().depth)?.back({restore:true}));await tick(0);
   await assertSpeech(refreshed);assert.equal((await state()).depth,0);

   // Reach this prediction row by native held reverse scanning.
   await tap('Space');await page.keyboard.down('Space');await tick(spec.name==='ytsearch'?2500:3000);
   assert.equal((await state()).id,target.id,'held reverse reaches prediction row');await assertSpeech(refreshed);
   await page.keyboard.up('Space');await tick(100);
   // Auto must announce the same live words and own their completion ticket.
   await prefs({autoScan:true,waitForSpeech:false});
   for(let i=0;i<35;i++){await tick(1000);if((await state()).id===target.id)break;}
   assert.equal((await state()).id,target.id,'Auto reaches prediction row');
   await prefs({waitForSpeech:true});
   await assertSpeech(refreshed);const waiting=await state();
   await tick(1200);assert.equal((await state()).id,waiting.id,'Auto waits for all prediction speech');
   await page.evaluate(()=>window.__speechPending());await tick(999);assert.equal((await state()).id,waiting.id,'full interval after speech');
   await tick(1);assert.notEqual((await state()).id,waiting.id,'Auto resumes after speech plus interval');
   await prefs({autoScan:false,waitForSpeech:false});
   // Speech off still permits ordinary scan navigation.
   await page.evaluate(()=>NarbeVoiceManager.updateSettings({ttsEnabled:false}));
   const before=await page.evaluate(()=>__spoken.length);await visit();assert.equal(await page.evaluate(()=>__spoken.length),before,'TTS off is silent');
   await page.evaluate(()=>NarbeVoiceManager.updateSettings({ttsEnabled:true}));

   if(['keyboard','journal','streaming','ytsearch'].includes(spec.name)){
    await setWords([]);await visit();await assertSpeech([target.letters?'No letter predictions':'No predictions']);
   }
   report.checks.push({surface:source+':'+spec.name,row:target.id,speech:first});
   console.log('PASS '+source+':'+spec.name+':'+target.id+' live words, reverse, nested return, Auto speech wait, TTS off and empty rows');
  }
  await ctx.close();
  } catch(error){report.errors.push({surface:source+':'+spec.name,message:error.stack});console.error('FAIL '+source+':'+spec.name+' '+error.message);}
 }
 assert.deepEqual(report.errors,[]);report.result='passed';
}
main().catch(e=>{report.result='failed';report.failure=e.stack;console.error(e.message);process.exitCode=1}).finally(async()=>{await browser?.close();await new Promise(resolve=>server?server.close(resolve):resolve());await fs.mkdir(path.join(root,'artifacts/prediction-row-speech'),{recursive:true});await fs.writeFile(path.join(root,'artifacts/prediction-row-speech/report.json'),JSON.stringify(report,null,2));});
