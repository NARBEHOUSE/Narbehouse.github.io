// Settings Back visibility and return-route regression. Isolated storage; no editor/system launches.
const {chromium,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const project=path.resolve(__dirname,'..');
const arg=name=>process.argv.find(a=>a.startsWith('--'+name+'='))?.slice(name.length+3);
const source=path.resolve(arg('source-root')||process.env.HUB_TEST_SOURCE_ROOT||project);
const artifacts=path.resolve(project,arg('artifacts')||process.env.HUB_TEST_ARTIFACTS||'artifacts/ballista-settings-back/web');
const executablePath=arg('browser-path')||process.env.HUB_BROWSER_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const externalOrigin=arg('origin')||process.env.HUB_TEST_ORIGIN;
const sourceFiles=['bennyshub/apps/games/BENNYSBALLISTA/js/ui.js','bennyshub/apps/games/BENNYSBALLISTA/style.css','bennyshub/shared/choice-scan.js','bennyshub/shared/scan-manager.js'];
const hashes=async()=>Object.fromEntries(await Promise.all(sourceFiles.map(async f=>[f,crypto.createHash('sha256').update(await fs.readFile(path.join(source,f))).digest('hex')])));
const report={sourceRoot:source,checks:[],geometry:[],errors:[],limits:'Actual browser input and normal UI routes with a controlled clock and muted voice; this is not a physics or physical-switch test.'};
let server,browser,page;
async function serve(){
 const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.mp3':'audio/mpeg','.wav':'audio/wav'};
 server=http.createServer(async(req,res)=>{try{const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(!name.startsWith('/bennyshub/')||name.split('/').some(p=>p==='..'||p.startsWith('.')))throw Error('Not public');let file=path.resolve(source,'.'+name);if(!file.startsWith(source+path.sep))throw Error('Not public');if((await fs.stat(file)).isDirectory())file=path.join(file,'index.html');res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(await fs.readFile(file));}catch{res.writeHead(404);res.end('Not found')}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));return 'http://127.0.0.1:'+server.address().port;
}
function pass(v,text){report.checks.push(v+': '+text);console.log('PASS '+v+': '+text)}
(async()=>{
 await fs.mkdir(artifacts,{recursive:true});report.beforeHashes=await hashes();const base=externalOrigin||await serve();report.origin=base;
 browser=await chromium.launch({executablePath,headless:true,args:['--enable-unsafe-swiftshader','--mute-audio']});report.browser=browser.version();
 for(const viewport of [{width:1280,height:720},{width:390,height:844},{width:480,height:360}]){
  const name=viewport.width+'x'+viewport.height;
  const context=await browser.newContext({viewport,serviceWorkers:'block'});
  await context.addInitScript(()=>{Object.defineProperty(window,'speechSynthesis',{value:{speaking:false,pending:false,getVoices:()=>[],addEventListener(){},removeEventListener(){},cancel(){},speak(u){u.onend?.()}}});window.SpeechSynthesisUtterance=class{constructor(text){this.text=text}};});
  page=await context.newPage();page.on('pageerror',e=>report.errors.push(name+': '+e.message));
  await page.clock.install({time:new Date('2026-10-04T12:00:00Z')});await page.clock.pauseAt(new Date('2026-10-04T12:00:01Z'));
  await page.goto(base+'/bennyshub/apps/games/BENNYSBALLISTA/index.html');
  const tick=ms=>page.clock.runFor(ms);
  const state=()=>page.evaluate(()=>({...RT.ui.__test.state(),shared:RT.ui.__test.choiceState(),phase:RT.game.CAM.phase,bolts:RT.game.boltsUsed}));
  await expect.poll(async()=>{await tick(50);return page.evaluate(()=>!!window.RT?.ui?.__test&&RT.game.CAM.phase==='MENU')},{timeout:20000}).toBe(true);
  const prefs=patch=>page.evaluate(p=>NarbeScanManager.updateSettings(p),patch);
  await prefs({autoScan:false,scanSpeedIndex:0,inputSensitivityIndex:0,parking:'off',spaceBrake:true,waitForSpeech:false});
  await page.evaluate(()=>{NarbeVoiceManager.updateSettings({ttsEnabled:false});RT.audio.setMusicEnabled(false);RT.audio.setEnabled(false)});
  const tap=async(key,after=60)=>{await page.keyboard.down(key);await tick(1);await page.keyboard.up(key);await tick(after)};
  const click=async label=>{const s=await state(),i=s.choices.indexOf(label);assert.ok(i>=0,'Choice exists: '+label);await page.locator('#panelList .choice').nth(i).click();await tick(60)};
  const bounds=()=>page.evaluate(()=>{const list=document.getElementById('panelList'),panel=document.getElementById('panel');const rect=e=>{const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,height:r.height,width:r.width}};const choices=[...list.children].map(e=>({label:e.querySelector('strong')?.textContent,...rect(e)}));return {viewport:[innerWidth,innerHeight],list:rect(list),panel:rect(panel),choices,scrollTop:list.scrollTop,clientHeight:list.clientHeight,scrollHeight:list.scrollHeight,scrollContainers:[...document.querySelectorAll('#overlay,#panel,#panelList')].filter(e=>/(auto|scroll)/.test(getComputedStyle(e).overflowY)).map(e=>e.id),status:rect(document.getElementById('ballistaScanStatus'))}});
  const visible=(g,label)=>{const r=g.choices.find(c=>c.label===label);assert.ok(r,label+' is rendered');assert.ok(r.top>=Math.max(0,g.list.top)-1&&r.bottom<=Math.min(g.viewport[1],g.list.bottom)+1,label+' is fully visible: '+JSON.stringify({r,list:g.list,viewport:g.viewport}));};
  async function fresh(label){const s=await state(),g=await bounds();assert.equal(s.screen,'settings');assert.equal(s.scan,-1);assert.equal(s.choices.length,15);assert.equal(s.choices[0],'Back');assert.equal(g.scrollTop,0);assert.deepEqual(g.scrollContainers,['panelList']);visible(g,'Back');report.geometry.push({viewport:name,case:label,...g});}
  await click('Settings');await fresh('main entry before any scroll');await page.screenshot({path:path.join(artifacts,name+'-settings-entry.png')});
  await click('Back');assert.equal((await state()).screen,'welcome');
  pass(name,'Back is visibly first before pointer scrolling; pointer return reaches welcome');
  await click('Settings');await fresh('Step entry');await tap('Enter');assert.equal((await state()).screen,'settings');assert.equal((await state()).scan,-1);
  for(let i=0;i<15;i++){await tap('Space');const s=await state();assert.equal(s.scan,i);visible(await bounds(),s.choices[i]);}
  await tap('Space');assert.equal((await state()).scan,-1);await tap('Enter');assert.equal((await state()).screen,'settings');
  pass(name,'All fifteen choices are reachable and visible by Step; recurring blank remains inert');
  // A real nested confirmation leaves the previous list at its bottom; cancelling opens Settings fresh.
  await click('Reset all campaigns');assert.equal((await state()).screen,'resetCampaigns');await click('Cancel');await fresh('return from confirmation');
  await tap('Space');assert.equal((await state()).choices[(await state()).scan],'Back');await tap('Enter');assert.equal((await state()).screen,'welcome');
  pass(name,'Fresh Settings clears old list scroll; first switch choice returns to welcome');
  await click('Settings');await click('Color theme');let selected=(await state()).shared.id;assert.equal((await state()).choices[(await state()).scan],'Color theme');visible(await bounds(),'Color theme');
  const other=viewport.width<500?{width:1280,height:720}:{width:480,height:360};await page.setViewportSize(other);await tick(180);assert.equal((await state()).shared.id,selected);visible(await bounds(),'Color theme');await page.setViewportSize(viewport);await tick(180);assert.equal((await state()).shared.id,selected);visible(await bounds(),'Color theme');
  await prefs({autoScan:true,parking:'off'});assert.equal((await state()).shared.id,selected);await tap('Space');assert.equal((await state()).shared.braked,true);assert.equal((await state()).shared.id,selected);assert.equal(await page.locator('[data-narbe-scan-paused]').evaluate(e=>getComputedStyle(e).outlineStyle),'dotted');await tick(2000);assert.equal((await state()).shared.id,selected);
  await page.screenshot({path:path.join(artifacts,name+'-setting-braked.png')});
  pass(name,'Setting redraw and resize retain identity and visibility; brake remains dotted-only');
  await prefs({autoScan:false});await click('Back');await prefs({autoScan:true,scanSpeedIndex:0,parking:'off',waitForSpeech:false});await click('Settings');await fresh('Auto entry');await tick(940);assert.equal((await state()).scan,0);await tap('Enter');assert.equal((await state()).screen,'welcome');
  pass(name,'Auto selects visible Back after the full interval and returns to welcome');
  await prefs({parking:'chosen'});await click('Settings');await fresh('parking entry');await tap('Enter');assert.equal((await state()).shared.parked,true);assert.equal((await state()).scan,-1);visible(await bounds(),'Back');await page.screenshot({path:path.join(artifacts,name+'-settings-parked.png')});await tap('Enter');assert.equal((await state()).screen,'settings');assert.equal((await state()).scan,0);await tap('Enter');assert.equal((await state()).screen,'welcome');
  pass(name,'Parked Settings keeps Back visible; resume is inert and following select exits');
  await prefs({autoScan:false,parking:'off'});await click('Play Game');await click((await state()).choices[0]);await click('Start campaign');assert.equal((await state()).screen,'story');await page.locator('#skipStory').click();await tick(60);await click('Play level');assert.equal((await state()).stage,'ammo');await page.locator('#btnPause').click();await tick(60);assert.equal((await state()).screen,'pause');
  await click('Settings');await fresh('pause entry');await click('Back');assert.equal((await state()).screen,'pause');await click('Settings');await tap('Space');await tap('Enter');assert.equal((await state()).screen,'pause');await click('Continue');assert.equal((await state()).screen,'');assert.equal((await state()).stage,'ammo');
  pass(name,'In-game Settings returns to pause by pointer and switch; Continue resumes ammunition');
  await context.close();page=null;
 }
 assert.deepEqual(report.errors,[]);report.afterHashes=await hashes();assert.deepEqual(report.afterHashes,report.beforeHashes,'Source bytes stay unchanged during acceptance');report.result='passed';
})().catch(async e=>{report.result='failed';report.failure=e.stack;if(page)await page.screenshot({path:path.join(artifacts,'failure.png')}).catch(()=>{});console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));await fs.mkdir(artifacts,{recursive:true});await fs.writeFile(path.join(artifacts,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({result:report.result,checks:report.checks.length,errors:report.errors}));});
