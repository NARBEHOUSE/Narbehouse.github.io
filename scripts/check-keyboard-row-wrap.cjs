'use strict';
// Actual renderer files and real Space/Enter events; native services are isolated.
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
  {name:'keyboard',url:'tools/keyboard',prefix:'scan',target:'row:1',firstDelay:3000,back:2000},
  {name:'journal',url:'tools/journal',target:'row:1',firstDelay:3000,back:3000},
  {name:'streaming',url:'tools/streaming',target:'row:1',firstDelay:3000,back:3000},
  {name:'ytsearch',url:'tools/ytsearch',target:'row:row1',firstDelay:2500,repeat:2000,back:3000,webOnly:true},
  {name:'animal',url:'games/NARBEANIMALFRIENDS',target:'name:row:2',firstDelay:3000},
  {name:'messenger',url:'tools/messenger',target:'row:4',firstDelay:3000,back:5000,host:'#kb-overlay',desktopOnly:true},
  {name:'search',url:'tools/search',target:'row:2',firstDelay:3000,back:1000,desktopOnly:true},
  {name:'rt-convo',url:'tools/rt-convo',target:'row:2',firstDelay:3000,back:5000,backTarget:'row:0',desktopOnly:true},
  {name:'pet',url:'games/NARBEPETPALS',firstDelay:3000,desktopOnly:true}
 ];
 for(const source of ['web',...(desktop?['desktop']:[])])for(const spec of specs){
  if(source==='web'&&spec.desktopOnly||source==='desktop'&&spec.webOnly||only&&only!==source+':'+spec.name)continue;
  const ctx=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:'block'});
  await ctx.route('**/*',async route=>{const url=new URL(route.request().url());
   if(url.origin!==origin)return route.fulfill({body:'',contentType:'text/plain'});
   if(url.pathname.endsWith('/choice-scan.js')){const response=await route.fetch();return route.fulfill({response,body:await response.text()+'\nwindow.__rowCheckScanners=[];const nativeCreate=NarbeChoiceScan.create;NarbeChoiceScan.create=(...args)=>{const scanner=nativeCreate(...args);__rowCheckScanners.push(scanner);return scanner;};'});}
   if(url.pathname.endsWith('/tool-gate.js'))return route.fulfill({body:'',contentType:'application/javascript'});
   if(url.pathname.endsWith('/extension-client.js'))return route.fulfill({body:'window.BennyExtension={supports:name=>name!=="journal-storage-v1",check:async()=>({connected:false,capabilities:[]}),onStatus:()=>()=>{},request:async()=>({})};',contentType:'application/javascript'});
   return route.continue();
  });
  await ctx.addInitScript(({isDesktop})=>{
   localStorage.setItem('narbe-scan-settings',JSON.stringify({autoScan:false,scanSpeedIndex:0,inputSensitivityIndex:0,parking:'off',spaceBrake:true,waitForSpeech:false,loopsBeforeParking:1}));
   localStorage.setItem('narbe-voice-settings',JSON.stringify({ttsEnabled:false}));
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
  if(spec.name==='animal'){
   await page.evaluate(()=>NAF.UI.show('settings'));await tick(100);
   for(let i=0;i<12&&(await page.evaluate(()=>NAF.Input.scanState().id))!=='set:3';i++)await tap('Space');
   await tap('Enter');
  }
  if(spec.name==='rt-convo'){
   if(await page.locator('#consentBtn').isVisible())await page.locator('#consentBtn').click();await tick(1500);if(await page.locator('[data-action="closeSettings"]').isVisible())await page.locator('[data-action="closeSettings"]').click();await tick(100);
   await page.getByRole('button',{name:'Type',exact:false}).first().click();await tick(100);
  }
  if(spec.name==='pet'){await page.evaluate(()=>{renderSpell();show('spell','Spell a name');});await tick(100);}
  // Animal uses its own state host.
  if(spec.name==='animal')spec.host='#naf';
  const target=spec.target||(await page.evaluate(()=>petChoice.getItems()[0].id));
  for(let i=0;i<30&&(await state()).id!==target;i++)await tap('Space');
  if((await state()).id!==target)console.log(await page.evaluate(()=>({state:document.body.dataset,active:document.activeElement?.outerHTML,body:document.body.innerText.slice(0,1300)})));assert.equal((await state()).id,target,source+':'+spec.name+' row reachable');await tap('Enter');
  const start=await state();assert.equal(start.depth,1,source+':'+spec.name+' entered keyboard row');assert.equal(start.index,0);
  const count=spec.name==='animal'?await page.evaluate(()=>NAF.UI.scannables().length):spec.name==='pet'?await page.evaluate(()=>petChoice.getItems().length):6;
  const stops=count+1; // the row's keys plus its spoken Back stop (highlights nothing)
  const firstDelay=spec.firstDelay,repeat=spec.repeat||1000;
  await page.keyboard.down('Space');await tick(firstDelay-1);assert.equal((await state()).id,start.id,'hold threshold preserved');
  await tick(1);assert.equal((await state()).index,stops-1,'first reverse wraps to the Back stop');
  for(let n=2;n<=stops*3;n++){
   await tick(repeat);const s=await state();assert.equal(s.depth,1,'hold stays inside row');assert.equal(s.index,(stops-(n%stops))%stops,'reverse order');assert.equal(s.context,start.context);
  }
  const beforeRelease=await state();await page.keyboard.up('Space');await tick(100);assert.deepEqual(await state(),beforeRelease,'release must not add a forward step');
  for(let n=0;n<stops;n++){await tap('Space');assert.equal((await state()).depth,1,'forward never leaves the row');}assert.equal((await state()).id,beforeRelease.id,'forward loops within same row through the Back stop');
  // Settings must retain the row and key. Auto loops locally, brake pauses and resumes.
  await prefs({autoScan:true,parking:'auto',loopsBeforeParking:1});const autoStart=await state();await tick(stops*2000);assert.equal((await state()).id,autoStart.id);assert.equal((await state()).depth,1);assert.notEqual((await state()).mode,'parked');
  await tap('Space');const paused=await state();assert.equal(paused.mode,'paused');await tick(5000);assert.equal((await state()).id,paused.id);
  await tap('Space');await tick(899);assert.equal((await state()).id,paused.id);await tick(1);assert.notEqual((await state()).id,paused.id);
  if(spec.name==='keyboard'||spec.name==='messenger'){
   await prefs({autoScan:true,spaceBrake:false,scanSpeedIndex:4});
   const heldStart=await state(),delay=spec.name==='keyboard'?7000:3000;
   await page.keyboard.down('Space');await tick(delay);
   assert.equal((await state()).index,(heldStart.index-1+stops)%stops);
   for(let i=2;i<=stops*2;i++){await tick(5000);assert.equal((await state()).index,(heldStart.index-i+stops*2)%stops);assert.equal((await state()).depth,1);}
   await page.keyboard.up('Space');await tick(4999);assert.equal((await state()).id,heldStart.id);
   await tick(1);assert.equal((await state()).index,(heldStart.index+1)%stops);
   await prefs({scanSpeedIndex:0,spaceBrake:true});
  }
  await prefs({autoScan:false,parking:'off'});
  // Choosing the Back stop after the last key returns to the same row in row mode, never the top.
  for(let i=0;i<stops&&(await state()).index!==count;i++)await tap('Space');
  assert.equal((await state()).index,count,'reached the Back stop');assert.equal((await state()).depth,1);
  await tap('Enter');assert.equal((await state()).depth,0,'Back stop returns to row mode');assert.equal((await state()).id,target,'Back stop restores the same row');
  // The native hold-Enter Back still works where the surface has one.
  if(spec.back){await tap('Enter');assert.equal((await state()).depth,1);await page.keyboard.down('Enter');await tick(spec.back);await page.keyboard.up('Enter');await tick(100);assert.equal((await state()).id,spec.backTarget||target,'native Back destination preserved');assert.equal((await state()).depth,0);}
  for(let i=0;i<30&&(await state()).id!==target;i++)await tap('Space');await tap('Enter');await tap('Enter');assert.equal((await state()).depth,0,'selecting first key returns to row');if(spec.name!=='rt-convo')assert.equal((await state()).id,target);else assert.match(await page.locator('#textBar').innerText(),/A/);
  report.checks.push(source+':'+spec.name+': three reverse cycles, forward loop through Back stop, release, Auto, brake, settings, Back stop, hold Back and key selection');console.log('PASS '+report.checks.at(-1));
  await ctx.close();
 }
 assert.deepEqual(report.errors,[]);report.result='passed';
}
main().catch(e=>{report.result='failed';report.failure=e.stack;console.error(e);process.exitCode=1}).finally(async()=>{await browser?.close();await new Promise(resolve=>server?server.close(resolve):resolve());await fs.mkdir(path.join(root,'artifacts/keyboard-row-wrap'),{recursive:true});await fs.writeFile(path.join(root,'artifacts/keyboard-row-wrap/report.json'),JSON.stringify(report,null,2));});
