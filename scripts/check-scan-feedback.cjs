// Focused browser acceptance for visible paused/parked scan feedback.
const {chromium,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),base=process.env.HUB_TEST_ORIGIN||'http://127.0.0.1:4173';
const out=path.resolve(root,process.env.HUB_TEST_ARTIFACTS||'artifacts/scan-feedback/settings');
const report={checks:[],errors:[],layout:[]};let browser,page;
const files=['bennyshub/index.html','bennyshub/shared/choice-scan.js','bennyshub/shared/scan-status-badge.js','bennyshub/shared/scan-status-badge.css'];
const hashes=async()=>Object.fromEntries(await Promise.all(files.map(async f=>[f,crypto.createHash('sha256').update(await fs.readFile(path.join(root,f))).digest('hex')])));
const pass=s=>{report.checks.push(s);console.log('PASS '+s)};
(async()=>{
 await fs.mkdir(out,{recursive:true});report.sourceHashes=await hashes();
 browser=await chromium.launch({executablePath:process.env.HUB_BROWSER_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});
 await context.addInitScript(()=>{
  let active;window.__feedbackSpeech=[];
  Object.defineProperty(window,'speechSynthesis',{value:{speaking:false,getVoices:()=>[{name:'Fixture English',lang:'en-US'}],addEventListener(){},removeEventListener(){},cancel(){active=null;this.speaking=false},speak(u){active=u;this.speaking=true;window.__feedbackSpeech.push({text:u.text,at:Date.now()});u.onstart?.();setTimeout(()=>{if(active===u){this.speaking=false;u.onend?.()}},250)}}});
  window.SpeechSynthesisUtterance=class{constructor(text){this.text=text}};
 });
 page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 await page.clock.install({time:new Date('2026-10-03T15:00:00Z')});await page.clock.pauseAt(new Date('2026-10-03T15:00:01Z'));
 await page.goto(base+'/bennyshub/index.html');
 const tick=ms=>page.clock.runFor(ms),screen=page.locator('#screen-settings');
 const selected=()=>screen.getAttribute('data-selected');
 const expectId=id=>expect.poll(selected).toBe(id);
 const prefs=async p=>{await page.evaluate(p=>NarbeScanManager.updateSettings(p),p);await tick(0)};
 const voice=enabled=>page.evaluate(enabled=>NarbeVoiceManager.updateSettings({ttsEnabled:enabled}),enabled);
 async function tap(key){await page.keyboard.down(key);await tick(1);await page.keyboard.up(key);await tick(60)}
 async function fresh(){
  if(await screen.isVisible()){await screen.locator('.backbtn').click();await tick(150)}
  await page.locator('#screen-home [data-target="settings"]').click();await tick(150);await expectId('park');
 }
 async function stepTo(id){for(let n=0;n<40&&await selected()!==id;n++)await tap('Space');await expectId(id)}
 if(await page.locator('#modal-cancel').isVisible()){await page.locator('#modal-cancel').click();await tick(150)}
 await prefs({autoScan:false,inputSensitivityIndex:0,scanSpeedIndex:0,parking:'off',spaceBrake:true,waitForSpeech:false});await voice(true);await fresh();
 await page.evaluate(()=>window.__feedbackSpeech.length=0);
 const ids=await screen.locator('button:visible:not(:disabled)').evaluateAll(items=>items.map(el=>el.id));
 for(const id of ids){await tap('Space');await expectId(id)}
 await tap('Space');await expectId('park');
 assert.equal(await screen.locator('button:focus,[data-narbe-scan-paused]').count(),0);
 const stepSpeech=await page.evaluate(()=>window.__feedbackSpeech.map(e=>e.text));
 assert.ok(stepSpeech.length>0);assert.ok(!stepSpeech.some(s=>/^park(?:ed)?$/i.test(s)));
 await tap('Enter');await expectId('park');
 pass('Step loops through a silent, unhighlighted -1; Enter there is inert');

 await stepTo('uisize-toggle');
 await prefs({autoScan:true,spaceBrake:true,waitForSpeech:true});
 await tap('Space');await expect(screen).toHaveAttribute('data-scan-state','paused');await expectId('uisize-toggle');
 assert.ok(!(await page.evaluate(()=>window.__feedbackSpeech.map(e=>e.text))).includes('Paused'),'Pause must not interrupt the current label');
 await tick(300);
 assert.equal((await page.evaluate(()=>window.__feedbackSpeech.filter(e=>e.text==='Paused'))).length,1);
 await tick(3000);await expectId('uisize-toggle');
 await tap('Space');await expectId('uisize-toggle');
 assert.equal(await screen.locator('[data-narbe-scan-paused],[data-narbe-scan-pause-label]').count(),0);
 await tick(800);await expectId('uisize-toggle');await tick(200);assert.notEqual(await selected(),'uisize-toggle');
 pass('Paused follows the current label, holds its option, and clears on a full-interval resume');

 await voice(false);
 for(const testCase of [{width:1440,height:1000,size:'default'},{width:390,height:844,size:'default'},{width:480,height:360,size:'default'},{width:390,height:844,size:'largest'}]){
  const {size,...viewport}=testCase;
  await page.setViewportSize(viewport);await prefs({autoScan:false,waitForSpeech:false,parking:'off'});await fresh();await stepTo('uisize-toggle');
  while(await page.locator('#uisize-status').textContent()!==size[0].toUpperCase()+size.slice(1)){await tap('Enter')}
  await prefs({autoScan:true});await tap('Space');await expectId('uisize-toggle');
  const paused=await page.evaluate(()=>{
   const button=document.querySelector('#uisize-toggle'),label=button.querySelector('.btn-title'),r=label.getBoundingClientRect();
   return {scrollY,viewport:{width:innerWidth,height:innerHeight},text:getComputedStyle(label,'::before').content,outline:getComputedStyle(button).outlineStyle,label:{x:r.x,y:r.y,right:r.right,bottom:r.bottom},nested:[document.querySelector('#screen-settings'),...document.querySelectorAll('#screen-settings *')].filter(el=>['auto','scroll'].includes(getComputedStyle(el).overflowY)&&el.scrollHeight>el.clientHeight+1).map(el=>el.id||el.className)};
  });
  assert.ok(!paused.text.includes('Paused'));await expect(page.locator('#settings-scan-status .narbe-scan-status-badge')).toBeHidden();assert.equal(paused.outline,'dotted');assert.deepEqual(paused.nested,[]);assert.ok(paused.scrollY>0);
  assert.ok(paused.label.y>=-1&&paused.label.bottom<=viewport.height+1&&paused.label.x>=-1&&paused.label.right<=viewport.width+1,'The selected option remains visible with its dotted outline');
  await page.screenshot({path:path.join(out,'paused-'+viewport.width+'x'+viewport.height+'-'+size+'.png')});
  await prefs({autoScan:false});assert.equal(await screen.locator('[data-narbe-scan-paused]').count(),0);
  await prefs({autoScan:true,parking:'auto',loopsBeforeParking:1,waitForSpeech:false,scanSpeedIndex:0});await fresh();
  const count=await screen.locator('button:visible:not(:disabled)').count();
  await tick(count*1000);const beforeParkY=await page.evaluate(()=>scrollY);assert.ok(beforeParkY>0);
  await tick(1000);await expectId('parked');
  const parked=await page.evaluate(()=>{const badge=document.querySelector('#settings-scan-status .narbe-scan-status-badge'),r=badge.getBoundingClientRect();return {text:badge.textContent,y:r.y,bottom:r.bottom,scrollY,active:document.activeElement?.id,marked:document.querySelectorAll('#screen-settings [data-narbe-scan-paused]').length}});
  assert.equal(parked.text,'Parked');assert.ok(parked.y>=-1&&parked.bottom<=viewport.height+1);assert.equal(parked.marked,0);assert.equal(await screen.locator('button:focus').count(),0);
  assert.ok(parked.scrollY<beforeParkY,'Parking reveals the existing status slot after scanning lower choices');
  await page.screenshot({path:path.join(out,'parked-'+viewport.width+'x'+viewport.height+'-'+size+'.png')});
  report.layout.push({viewport,size,paused,beforeParkY,parked});
 }
 pass('Paused stays on the visible button and Parked reveals the existing status, with no nested scrolling at desktop, mobile and short-window sizes');
 assert.deepEqual(report.errors,[]);assert.deepEqual(await hashes(),report.sourceHashes);report.result='passed';
})().catch(async e=>{report.result='failed';report.failure=e.stack;console.error(e);process.exitCode=1;if(page&&!page.isClosed()){report.state=await page.evaluate(()=>({screen:document.querySelector('#screen-settings')?.dataset,prefs:NarbeScanManager.getSettings(),speech:window.__feedbackSpeech})).catch(()=>null);await page.screenshot({path:path.join(out,'failure.png'),fullPage:true}).catch(()=>{})}}).finally(async()=>{await browser?.close();await fs.mkdir(out,{recursive:true});await fs.writeFile(path.join(out,'browser-report.json'),JSON.stringify(report,null,2))});
