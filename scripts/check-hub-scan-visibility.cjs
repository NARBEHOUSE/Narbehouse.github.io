const {chromium}=require('@playwright/test');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),out=path.join(root,'artifacts/hub-scan-visibility');
const base=process.env.HUB_TEST_ORIGIN||'http://127.0.0.1:4173';
const sources=['bennyshub/index.html','bennyshub/shared/scan-settings.js','bennyshub/shared/choice-scan.js','bennyshub/shared/scan-status-badge.js','bennyshub/shared/scan-status-badge.css','bennyshub/service-worker.js'];
const report={checks:[],geometry:[],errors:[]};let browser,page;
const hashes=async()=>Object.fromEntries(await Promise.all(sources.map(async file=>[file,crypto.createHash('sha256').update(await fs.readFile(path.join(root,file))).digest('hex')])));
(async()=>{
 await fs.mkdir(out,{recursive:true});report.sourceHashes=await hashes();
 browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});report.browser=browser.version();
 const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});
 await context.addInitScript(()=>{Object.defineProperty(window,'speechSynthesis',{value:{getVoices:()=>[{name:'Test English',lang:'en-US'}],addEventListener(){},removeEventListener(){},cancel(){},speak(u){u.onstart?.();setTimeout(()=>u.onend?.(),100)}}});window.SpeechSynthesisUtterance=class{constructor(text){this.text=text}}});
 page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));
 await page.clock.install({time:new Date('2026-10-04T12:00:00Z')});await page.clock.pauseAt(new Date('2026-10-04T12:00:01Z'));
 await page.goto(base+'/bennyshub/index.html');await page.evaluate(()=>{window.__pointerEvents=[];for(const type of ['pointerdown','mousedown','focusin','pointerup','mouseup','click'])document.addEventListener(type,event=>{const e=event.target.closest?.('button');if(!e)return;const r=e.getBoundingClientRect();__pointerEvents.push({type,id:e.id||e.dataset.target,active:e.matches(':active'),top:r.top,bottom:r.bottom,scrollY,x:event.clientX,y:event.clientY});if(__pointerEvents.length>100)__pointerEvents.shift()},true)});
 const tick=ms=>page.clock.runFor(ms);
 async function settle(){await page.waitForTimeout(25);await tick(80)}
 const tap=async key=>{await page.keyboard.down(key);await tick(1);await page.keyboard.up(key);await settle()};
 const current=()=>page.locator('.screen.active');
 const selected=()=>current().getAttribute('data-selected');
 const prefs=async settings=>{await page.evaluate(settings=>NarbeScanManager.updateSettings(settings),settings);await tick(0)};
 async function enterSettings(){await page.locator('#screen-home [data-target="settings"]').click();await tick(150);assert.equal(await selected(),'park')}
 async function home(){const s=await current().getAttribute('id');if(s!=='screen-home'){await current().locator('.backbtn').click();await tick(150)}}
 async function freshSettings(){await home();await enterSettings()}
 async function stepTo(id){for(let budget=40;await selected()!==id&&budget--;){await tap('Space')}assert.equal(await selected(),id)}
 async function setSize(size){for(let i=0;i<5;i++){if((await page.locator('#uisize-status').innerText()).toLowerCase()===size)return;await page.locator('#uisize-toggle').click();await settle();assert.equal(await selected(),'uisize-toggle')}throw new Error('Unable to set size '+size)}
 async function geometry(label){
  await settle();
  const value=await page.evaluate(()=>{
   const footer=document.getElementById('mini-footer'),screen=document.querySelector('.screen.active'),id=screen.dataset.selected;const active=[...screen.querySelectorAll('button')].find(el=>(el.id||(el.dataset.path?'app:'+el.dataset.path:el.dataset.genre?'genre:'+el.dataset.genre:el.dataset.target?(el.classList.contains('backbtn')?'back:':'nav:')+el.dataset.target:el.textContent.trim()))===id)||document.activeElement;const r=active.getBoundingClientRect(),f=footer.getBoundingClientRect(),title=(active.querySelector('.btn-title')||active).getBoundingClientRect();
   const scroller=document.scrollingElement;
   return{screen:screen.id,selected:screen.dataset.selected,activeId:active.id||active.dataset.path||active.dataset.target||active.textContent.trim(),nativeFocus:document.activeElement?.id,card:active.classList.contains('card-btn'),title:{top:title.top,bottom:title.bottom,height:title.height},rect:{top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width,height:r.height},footer:{top:f.top,height:f.height,open:footer.classList.contains('open')},viewport:{width:innerWidth,height:innerHeight},scrollY,scrollMax:scroller.scrollHeight-scroller.clientHeight,size:document.getElementById('uisize-status').textContent};
  });
  assert.notEqual(value.selected,'park',label+' selected choice');
  const r=value.rect,available=value.footer.top,canFit=r.height<=available-40;
  assert.ok(r.width>0&&r.height>0,label+' real choice rect');
  assert.ok(r.left>=-2&&r.right<=value.viewport.width+2,label+' horizontal bounds');
  if(canFit){assert.ok(r.top>=-1,label+' top visible '+JSON.stringify(value));assert.ok(r.bottom<=available-12,label+' above footer with space '+JSON.stringify(value))}
  else{assert.ok(value.title.top>=-1&&value.title.top<available-12,label+' oversized choice title starts in usable viewport '+JSON.stringify(value))}if(canFit&&value.scrollY>1&&value.scrollY<value.scrollMax-1)assert.ok(Math.abs((r.top+r.bottom)/2-available/2)<=22,label+' comfortable vertical placement '+JSON.stringify(value));
  report.geometry.push({label,...value,canFit});return value;
 }
 async function noNested(){const nested=await current().locator('.grid,[role="group"],#scan-settings').evaluateAll(els=>els.filter(e=>{const s=getComputedStyle(e);return /auto|scroll/.test(s.overflowY)&&e.scrollHeight>e.clientHeight+1}).map(e=>e.id||e.className));assert.deepEqual(nested,[],'no nested Settings/menu scroll panels')}
 async function scanWhole(label){const ids=await current().locator('button:visible:not(:disabled)').evaluateAll(items=>items.map(el=>el.id||(el.dataset.path?'app:'+el.dataset.path:el.dataset.genre?'genre:'+el.dataset.genre:el.dataset.target?(el.classList.contains('backbtn')?'back:':'nav:')+el.dataset.target:el.textContent.trim())));assert.equal(await selected(),'park');for(const id of ids){await tap('Space');assert.equal(await selected(),id,label+' scan order');await geometry(label+' '+id)}await tap('Space');assert.equal(await selected(),'park');await noNested();return ids}
 if(await page.locator('#modal-cancel').isVisible()){await page.locator('#modal-cancel').click();await tick(150)}
 await page.evaluate(()=>NarbeVoiceManager.updateSettings({ttsEnabled:false}));await prefs({autoScan:false,inputSensitivityIndex:0,waitForSpeech:false,spaceBrake:false,parking:'off'});
 await enterSettings();
 const expectedScan=['autoscan-toggle','sensitivity-toggle','scanspeed-toggle','parking-toggle','parking-loops-toggle','spacebrake-toggle','waitspeech-toggle'];
 assert.deepEqual(await page.locator('#scan-settings button').evaluateAll(els=>els.map(e=>e.id)),expectedScan);
 const appearance=await page.locator('#screen-settings > .grid > button').evaluateAll(els=>els.map(e=>e.id));assert.equal(appearance[appearance.indexOf('bgtheme-toggle')+1],'uisize-toggle');
 const arrangement=await page.locator('#autoscan-toggle').evaluate(e=>{const a=e.getBoundingClientRect(),b=document.getElementById('sensitivity-toggle').getBoundingClientRect();return{a:{top:a.top,left:a.left,right:a.right},b:{top:b.top,left:b.left}}});assert.ok(Math.abs(arrangement.a.top-arrangement.b.top)<2&&arrangement.b.left>arrangement.a.left,'Sensitivity next to Auto on desktop');
 assert.equal(await page.locator('#sensitivity-toggle').isEnabled(),true);assert.equal(await page.locator('#scanspeed-toggle').isDisabled(),true);
 const offIds=await scanWhole('desktop default Auto Off');assert.deepEqual(offIds.filter(x=>expectedScan.includes(x)),['autoscan-toggle','sensitivity-toggle']);
 report.checks.push('DOM and switch order put Sensitivity after Auto and Size after Background; Auto Off keeps Sensitivity usable');
 await stepTo('autoscan-toggle');await tap('Space');assert.equal(await selected(),'sensitivity-toggle');const sensitivity=await page.evaluate(()=>NarbeScanManager.getSettings().inputSensitivityIndex);await tap('Enter');assert.equal(await selected(),'sensitivity-toggle');assert.notEqual(await page.evaluate(()=>NarbeScanManager.getSettings().inputSensitivityIndex),sensitivity);await prefs({inputSensitivityIndex:0});
 await page.locator('#autoscan-toggle').click();await settle();assert.equal(await selected(),'autoscan-toggle');await tap('Enter');assert.equal(await selected(),'autoscan-toggle');assert.equal(await page.evaluate(()=>NarbeScanManager.getSettings().autoScan),false);
 await page.locator('#bgtheme-toggle').click();await settle();assert.equal(await selected(),'bgtheme-toggle');await tap('Space');assert.equal(await selected(),'uisize-toggle');await tap('Enter');assert.equal(await selected(),'uisize-toggle');await geometry('size changed by switch');
 report.checks.push('Sensitivity, Auto, Background and Size changes retain their selected identities');
 for(const viewport of [{width:1440,height:1000},{width:390,height:844},{width:480,height:360}]){
  for(const size of ['default','largest']){
   await page.setViewportSize(viewport);await settle();await setSize(size);await prefs({autoScan:true,parking:'auto',loopsBeforeParking:3,spaceBrake:false,waitForSpeech:false,scanSpeedIndex:3,inputSensitivityIndex:0});await freshSettings();
   await scanWhole(viewport.width+'x'+viewport.height+' '+size+' Auto On');console.log('PASS Settings '+viewport.width+'x'+viewport.height+' '+size);
   await stepTo('waitspeech-toggle');await geometry('last Scan option '+viewport.width+' '+size);
   await page.screenshot({animations:'disabled',path:path.join(out,'settings-'+viewport.width+'-'+size+'.png')});
  }
 }
 report.checks.push('Every enabled Settings choice stays above the fixed footer at desktop/mobile/short sizes; oversized choices keep their start visible; no nested scroll');
 await page.setViewportSize({width:1440,height:1000});await settle();await setSize('default');await prefs({autoScan:false,parking:'off'});await freshSettings();
 await stepTo('sensitivity-toggle');const retained=await selected();await page.locator('.mini-footer-bar').click();await page.waitForTimeout(350);await tick(400);await settle();assert.equal(await selected(),retained);await geometry('expanded footer retains sensitivity');await page.screenshot({animations:'disabled',path:path.join(out,'settings-expanded-footer.png')});await page.locator('.mini-footer-bar').click();await page.waitForTimeout(350);await tick(400);await settle();assert.equal(await selected(),retained);await geometry('collapsed footer retains sensitivity');
 report.checks.push('Expanding and collapsing the existing footer retains selection and updates usable scroll space');
 await prefs({autoScan:true,spaceBrake:true,parking:'off',scanSpeedIndex:3});await tap('Space');assert.equal(await current().getAttribute('data-scan-state'),'paused');assert.equal(await selected(),retained);assert.equal(await page.locator('[data-narbe-scan-paused]').evaluate(e=>getComputedStyle(e).outlineStyle),'dotted');assert.equal(await page.locator('[data-narbe-scan-pause-label]').count(),0);assert.equal(await page.locator('.narbe-scan-status-badge:not([hidden])').count(),0);await geometry('dotted brake retains choice');await prefs({autoScan:false,spaceBrake:false});
 report.checks.push('Scroll updates preserve the dotted-only brake state without added Paused text');
 for(const menu of ['games','tools']){
  await home();await page.setViewportSize({width:390,height:844});await settle();await page.locator('#screen-home [data-target="'+menu+'"]').click();await tick(150);const ids=await scanWhole(menu+' mobile');await stepTo(ids.at(-1));await page.screenshot({animations:'disabled',path:path.join(out,menu+'-mobile.png')});
 }
 report.checks.push('Games and Tools use the same footer-aware document scrolling with recurring blank and stable scan order');
 assert.deepEqual(report.errors,[]);report.finalSourceHashes=await hashes();assert.deepEqual(report.finalSourceHashes,report.sourceHashes,'runtime did not change during acceptance');report.result='passed';
})().catch(async error=>{report.result='failed';report.failure=error.stack;console.error(error);process.exitCode=1;if(page&&!page.isClosed()){report.state=await page.evaluate(()=>({selected:document.querySelector('.screen.active')?.dataset.selected,body:document.body.innerText,scrollY,pointerEvents:window.__pointerEvents})).catch(()=>null);await page.screenshot({animations:'disabled',path:path.join(out,'failure.png')}).catch(()=>{})}}).finally(async()=>{await browser?.close();await fs.writeFile(path.join(out,'browser-report.json'),JSON.stringify(report,null,2));console.log(report.result,report.checks)});
