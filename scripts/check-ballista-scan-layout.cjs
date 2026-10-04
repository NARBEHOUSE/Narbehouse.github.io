// Focused visual/lifecycle acceptance for Ballista's shared pause and park feedback.
const {chromium,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),base=process.env.HUB_TEST_ORIGIN||'http://127.0.0.1:4173';
const artifacts=path.resolve(root,process.env.HUB_TEST_ARTIFACTS||'artifacts/ballista-scan');
const executablePath=process.env.HUB_BROWSER_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const sources=['bennyshub/apps/games/BENNYSBALLISTA/js/ui.js','bennyshub/apps/games/BENNYSBALLISTA/js/castle-files.js','bennyshub/shared/choice-scan.js','bennyshub/shared/scan-status-badge.js','bennyshub/shared/scan-status-badge.css','bennyshub/apps/games/BENNYSBALLISTA/style.css'];
const hashes=async()=>Object.fromEntries(await Promise.all(sources.map(async file=>[file,crypto.createHash('sha256').update(await fs.readFile(path.join(root,file))).digest('hex')])));
const report={checks:[],bounds:[],errors:[]};let browser,page;
function pass(label){report.checks.push(label);console.log('PASS '+label)}
(async()=>{
 await fs.mkdir(artifacts,{recursive:true});report.sourceHashes=await hashes();
 browser=await chromium.launch({executablePath,headless:true,args:['--enable-unsafe-swiftshader']});report.browser=browser.version();
 const context=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:'block'});page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 await page.clock.install({time:new Date('2026-10-03T12:00:00Z')});await page.clock.pauseAt(new Date('2026-10-03T12:00:01Z'));
 await page.goto(base+'/bennyshub/apps/games/BENNYSBALLISTA/index.html');const tick=ms=>page.clock.runFor(ms);
 const state=()=>page.evaluate(()=>({...RT.ui.__test.state(),shared:RT.ui.__test.choiceState()}));
 await expect.poll(async()=>{await tick(50);return page.evaluate(()=>!!window.RT?.ui&&RT.game.CAM.phase==='MENU'&&RT.ui.__test.state().choices.length>0)},{timeout:20000}).toBe(true);
 await page.evaluate(()=>{NarbeVoiceManager.updateSettings({ttsEnabled:false});RT.audio?.setMusicEnabled(false)});
 const prefs=async p=>{await page.evaluate(p=>NarbeScanManager.updateSettings(p),p);await tick(0)};
 const tap=async key=>{await page.keyboard.down(key);await tick(1);await page.keyboard.up(key);await tick(60)};
 const click=async label=>{const s=await state(),i=s.choices.indexOf(label);assert.ok(i>=0,label+' exists');await page.locator('#panelList .choice').nth(i).click();await tick(70)};
 async function bounds(label){
  const result=await page.evaluate(()=>{
   function rect(e){if(!e)return null;const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}}
   const badge=document.querySelector('#ballistaScanStatus .narbe-scan-status-badge'),item=document.querySelector('[data-narbe-scan-paused]'),label=document.querySelector('[data-narbe-scan-pause-label]');
   function visible(e){if(!e)return null;let r=e.getBoundingClientRect(),left=Math.max(0,r.left),right=Math.min(innerWidth,r.right),top=Math.max(0,r.top),bottom=Math.min(innerHeight,r.bottom);for(let p=e.parentElement;p;p=p.parentElement){const c=getComputedStyle(p),q=p.getBoundingClientRect();if(/hidden|auto|scroll|clip/.test(c.overflowX)){left=Math.max(left,q.left);right=Math.min(right,q.right)}if(/hidden|auto|scroll|clip/.test(c.overflowY)){top=Math.max(top,q.top);bottom=Math.min(bottom,q.bottom)}}return {width:Math.max(0,right-left),height:Math.max(0,bottom-top)}}
   return{viewport:{width:innerWidth,height:innerHeight},badge:rect(badge),badgeVisible:visible(badge),badgeText:badge?.textContent,itemOutline:item?getComputedStyle(item).outlineStyle:null,item:rect(item),itemVisible:visible(item),label:rect(label),labelVisible:visible(label),choiceRects:[...document.querySelectorAll('#panelList .choice, #zoomControls button')].map(rect).filter(r=>r.width>0&&r.height>0),markerCount:document.querySelectorAll('[data-narbe-scan-paused]').length,focusIsChoice:!!document.activeElement?.closest('#panelList .choice, #zoomControls button'),index:RT.ui.__test.state().scan};
  });report.bounds.push({name:label,...result});
  if(result.markerCount){
   assert.equal(result.markerCount,1,label+' has exactly one paused choice');assert.equal(result.itemOutline,'dotted',label+' has a visibly dotted paused outline');
   assert.equal(result.badgeText,'');assert.equal(result.badge.height,0);assert.equal(result.label,null,label+' has no pause text marker');
   assert.ok(result.itemVisible.height>=result.item.height-1&&result.itemVisible.width>=result.item.width-1,label+' selected choice remains visible');
  }else{
   assert.ok(result.badge?.height>0,label+' status has visible height');assert.ok(result.badgeVisible.height>=result.badge.height-1&&result.badgeVisible.width>=result.badge.width-1,label+' status is not clipped');
   assert.equal(result.badgeText,'Parked');assert.equal(result.index,-1);assert.equal(result.focusIsChoice,false,label+' clears native choice focus');for(const choice of result.choiceRects)assert.ok(result.badge.bottom<=choice.y+1||choice.bottom<=result.badge.y+1||result.badge.right<=choice.x+1||choice.right<=result.badge.x+1,label+' Parked status does not overlap a choice');
  }
  await page.screenshot({animations:'disabled',path:path.join(artifacts,label+'.png')});
 }
 await prefs({autoScan:true,scanSpeedIndex:0,inputSensitivityIndex:0,parking:'chosen',spaceBrake:true,waitForSpeech:false});
 for(const screen of ['welcome','settings']){
  if(screen==='settings')await click('Settings');
  if(screen==='settings')await click('Sound effects');else await tick(1000);
  await tap('Space');assert.equal((await state()).shared.braked,true);const id=(await state()).shared.id;
  for(const viewport of [{width:1280,height:900},{width:390,height:844},{width:480,height:360}]){
   await page.setViewportSize(viewport);await tick(80);assert.equal((await state()).shared.braked,true);assert.equal((await state()).shared.id,id);
   if(screen==='settings'){await tap('Enter');assert.equal((await state()).shared.braked,true);assert.equal((await state()).shared.id,id)}
   await bounds(screen+'-paused-'+viewport.width+'x'+viewport.height);
  }
  pass(screen+' paused marker survives resize'+(screen==='settings'?' and value redraw':''));
  await page.setViewportSize({width:1280,height:900});await tick(80);
  if(screen==='settings'){await click('Back');await click('Settings')}else{await click('Settings');await click('Back')}
  assert.equal((await state()).scan,-1);await tap('Enter');assert.equal((await state()).shared.parked,true);
  for(const viewport of [{width:1280,height:900},{width:390,height:844},{width:480,height:360}]){await page.setViewportSize(viewport);await tick(80);await bounds(screen+'-parked-'+viewport.width+'x'+viewport.height)}
  pass(screen+' Parked is visible and unhighlighted across desktop, narrow and short viewports');
  await page.setViewportSize({width:1280,height:900});await tick(80);
 }
 await click('Back');await click('Play Game');await click('My Castles');await click('Import castles');await tick(1000);await tap('Space');
 await expect(page.locator('#castleFilePick')).toHaveAttribute('data-narbe-scan-paused','');assert.equal(await page.locator('#castleFilePick').evaluate(el=>getComputedStyle(el).outlineStyle),'dotted');await expect(page.locator('#castleFileScanStatus .narbe-scan-status-badge')).toBeHidden();await expect(page.locator('#castleFileScanStatus .narbe-scan-status-badge')).toHaveText('');await page.screenshot({animations:'disabled',path:path.join(artifacts,'importer-paused.png')});
 pass('Importer pause feedback renders a dotted outline on its native focused choice');
 await page.locator('#castleFileClose').click();await tick(70);await click('Back');await click((await state()).choices[0]);await click('Start campaign');await page.locator('#skipStory').click();await tick(70);await tap('Enter');assert.equal((await state()).shared.parked,true);
 for(const viewport of [{width:1280,height:900},{width:390,height:844}]){await page.setViewportSize(viewport);await tick(80);await bounds('post-story-parked-'+viewport.width+'x'+viewport.height)}
 pass('Post-story Parked remains visible outside its Play/Back choices');
 await page.setViewportSize({width:1280,height:900});await tick(80);await click('Play level');
 await page.locator('#btnPause').click();await tick(70);await click('Settings');assert.equal((await state()).scan,-1);await tap('Enter');assert.equal((await state()).shared.parked,true);
 await page.keyboard.down('Enter');await page.clock.fastForward(4999);assert.equal((await state()).screen,'settings');assert.equal((await state()).shared.parked,true);await page.clock.fastForward(1);assert.equal((await state()).screen,'pause');await page.keyboard.up('Enter');await tick(60);assert.equal((await state()).screen,'pause');assert.equal((await state()).scan,-1);assert.equal((await state()).shared.parked,false);
 pass('Holding Enter while parked in a real game opens Pause at five seconds; release does not choose');
 await click('Zoom view');await tick(1000);await tap('Space');assert.equal((await state()).shared.braked,true);
 for(const viewport of [{width:1280,height:900},{width:390,height:844}]){await page.setViewportSize(viewport);await tick(80);await bounds('zoom-paused-'+viewport.width+'x'+viewport.height)}
 pass('Paused camera choice has a visible dotted outline without added pause text');
 await page.setViewportSize({width:1280,height:900});await tick(80);await page.locator('#zoomBack').click();await tick(70);await page.locator('#btnPause').click();await tick(70);await click('Zoom view');await tap('Enter');assert.equal((await state()).shared.parked,true);
 for(const viewport of [{width:1280,height:900},{width:390,height:844}]){await page.setViewportSize(viewport);await tick(80);await bounds('zoom-parked-'+viewport.width+'x'+viewport.height)}
 pass('Paused camera Parked remains visible outside its camera choices');
 assert.deepEqual(report.errors,[]);assert.deepEqual(await hashes(),report.sourceHashes);report.result='passed';
})().catch(async error=>{report.result='failed';report.failure=error.stack;console.error(error);process.exitCode=1;if(page&&!page.isClosed())await page.screenshot({animations:'disabled',path:path.join(artifacts,'layout-failure.png')}).catch(()=>{})}).finally(async()=>{await browser?.close();await fs.writeFile(path.join(artifacts,'layout-report.json'),JSON.stringify(report,null,2))});
