const {chromium,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {feedbackGeometry}=require('./check-scan-tools-feedback.cjs');
const root=path.resolve(__dirname,'..'),base='http://127.0.0.1:4173',artifacts=path.join(root,'artifacts/scan-outline-only/tools');
const executablePath=process.env.HUB_BROWSER_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
let context;const report={checks:[],errors:[],tools:{},fixture:'Isolated unpacked Edge extension, virtual scan clock, YouTube external SDK disabled; native tool renderers and inputs unchanged.'};
async function advance(page,ms){while(ms>0){const step=Math.min(ms,400);await page.clock.runFor(step);ms-=step;await new Promise(r=>setTimeout(r,20));}}
function pass(tool,text){report.checks.push(tool+': '+text);console.log('PASS '+tool+': '+text)}
(async()=>{
 await fs.mkdir(artifacts,{recursive:true});
 context=await chromium.launchPersistentContext(path.join(artifacts,'profile-'+Date.now()),{executablePath,headless:true,viewport:{width:1280,height:900},args:['--disable-extensions-except='+path.join(root,'extension'),'--load-extension='+path.join(root,'extension')]});
 await context.route('**/fonts.googleapis.com/**',route=>route.abort());await context.route('**/fonts.gstatic.com/**',route=>route.abort());
 await context.addInitScript(()=>{localStorage.setItem('narbe-scan-settings',JSON.stringify({autoScan:false,scanSpeedIndex:0,inputSensitivityIndex:0,parking:'chosen',spaceBrake:true,waitForSpeech:false,loopsBeforeParking:2}));localStorage.setItem('narbe-voice-settings',JSON.stringify({ttsEnabled:false}));localStorage.setItem('tts_enabled','false');window.testClicks=[];document.addEventListener('click',e=>testClicks.push(e.target.closest('button')?.id||e.target.textContent));});
 const hub=await context.newPage();await hub.goto(base+'/bennyshub/index.html',{waitUntil:'domcontentloaded'});await hub.waitForFunction(()=>window.BennyExtension?.supports('streaming'));await hub.close();for(const empty of context.pages())await empty.close();
 for(const tool of ['dayhub','keyboard','journal','streaming','phraseboard','ytsearch'].filter(tool=>!process.argv.includes('--tool')||tool===process.argv[process.argv.indexOf('--tool')+1])){
  const page=await context.newPage();page.on('pageerror',e=>report.errors.push({tool,message:e.message}));
  await page.clock.install({time:new Date('2026-10-03T12:00:00Z')});await page.clock.pauseAt(new Date('2026-10-03T12:10:00Z'));
  if(tool==='ytsearch'){await page.route('https://www.youtube.com/iframe_api',route=>route.fulfill({contentType:'application/javascript',body:''}));await page.route('https://challenges.cloudflare.com/**',route=>route.fulfill({contentType:'application/javascript',body:''}));}
  await page.goto(base+'/bennyshub/apps/tools/'+tool+'/index.html',{waitUntil:'domcontentloaded'});
  if(['dayhub','journal','streaming'].includes(tool))await page.waitForFunction(()=>BennyExtension.supports(document.documentElement.dataset.extensionTool)&&!document.querySelector('#companion-required')?.open);
  if(tool==='keyboard')await page.waitForFunction(()=>window.predictionSystem?.dataLoaded);
  if(tool==='ytsearch')await page.waitForFunction(()=>window.narbe&&window.settingsManager);
  await advance(page,800);
  const direct=['dayhub','keyboard'].includes(tool),prefix=direct?'data-scan-':'data-choice-',surface=page.locator(tool==='dayhub'?'#app':'body');
  const index=()=>surface.getAttribute(prefix+'index'),identity=()=>surface.getAttribute(prefix+'selected');
  const set=async settings=>page.evaluate(settings=>NarbeScanManager.updateSettings(settings),settings);
  const tap=async(key,after=65)=>{await page.keyboard.down(key);await advance(page,1);await page.keyboard.up(key);if(after)await advance(page,after)};
  const capture=async(state,width)=>{await page.setViewportSize({width,height:900});await advance(page,100);if(state==='parked'){await set({autoScan:false});await set({autoScan:true});await tap('Enter');}await page.screenshot({path:path.join(artifacts,tool+'-'+state+'-'+width+'.png')});return await feedbackGeometry(page,state==='parked');};
  await expect(surface).toHaveAttribute(prefix+'index','-1');await tap('Enter');assert.equal(await index(),'-1');await set({autoScan:true});
  const clicks=await page.evaluate(()=>testClicks.length);await tap('Enter');await expect(surface).toHaveAttribute(prefix+'state','parked');
  report.tools[tool]={parkedDesktop:await capture('parked',1280),parkedNarrow:await capture('parked',420)};
  await tap('Enter');assert.equal(await index(),'0');assert.equal(await page.evaluate(()=>testClicks.length),clicks);
  const rawBefore=await page.locator('body').innerText();await tap('Space');await expect(surface).toHaveAttribute(prefix+'state','paused');
  const selected=await identity();await advance(page,2000);assert.equal(await identity(),selected);
  const rawAfter=await page.locator('body').innerText();assert.equal(rawAfter.split('Paused').length,rawBefore.split('Paused').length,'No added Paused word');
  report.tools[tool].pausedDesktop=await capture('paused',1280);report.tools[tool].pausedNarrow=await capture('paused',420);
  pass(tool,'Parked stays blank and visible; pause keeps selected identity with an inset dotted outline and no added Paused text at desktop/narrow widths');
  await page.setViewportSize({width:1280,height:900});await tap('Space',0);await expect(surface).not.toHaveAttribute(prefix+'state','paused');await advance(page,999);assert.equal(await identity(),selected);await advance(page,2);assert.notEqual(await identity(),selected);
  await set({autoScan:false});await advance(page,65);
  if(tool==='dayhub'){await page.locator('#btnSettings').click();await page.locator('#settingsLabel').fill('Native typing');await page.locator('#settingsLabel').press('Space');assert.equal(await page.locator('#settingsLabel').inputValue(),'Native typing ');await page.locator('#settingsCloseBtn').click();await advance(page,65);await tap('Space');assert.equal(await identity(),'btnTime');}
  if(tool==='keyboard'){for(let i=0;i<12&&await identity()!=='row:1';i++)await tap('Space');assert.equal(await identity(),'row:1');await tap('Enter');await tap('Enter');await expect(page.locator('#textBar')).toHaveText('A|');assert.equal(await identity(),'row:1');}
  if(tool==='journal'){await page.locator('[data-action="options"]').click();await tap('Space');const option=await identity();await tap('Enter');assert.equal(await identity(),option);}
  if(tool==='streaming'){await page.locator('#btn-search').click();await tap('Space');assert.equal(await identity(),'row:text');await set({autoScan:true});await tap('Space');await expect(surface).toHaveAttribute(prefix+'state','paused');report.tools[tool].searchText=await feedbackGeometry(page);await page.screenshot({path:path.join(artifacts,'streaming-search-paused.png')});await set({autoScan:false});for(let i=0;i<3;i++)await tap('Space');assert.equal(await identity(),'row:1');await tap('Enter');await tap('Enter');await expect(page.locator('#search-input')).toHaveValue('A');assert.equal(await identity(),'row:1');}
  if(tool==='phraseboard'){await page.getByRole('button',{name:'Create Board',exact:true}).click();await tap('Space');assert.equal(await identity(),'createBoardBack:0');await tap('Enter');assert.equal(await index(),'-1');}
  if(tool==='ytsearch'){for(let i=0;i<20&&await identity()!=='row:row1';i++)await tap('Space');assert.equal(await identity(),'row:row1');await tap('Enter');await tap('Enter');await expect(page.locator('#text-input')).toHaveValue('A');assert.equal(await identity(),'row:row1');}
  pass(tool,'Resume retains the full interval; native selection or typing still works');report.tools[tool].result='passed';await page.close();
 }
 assert.deepEqual(report.errors,[]);report.result='passed';
 const ledger=JSON.parse(await fs.readFile(path.join(root,'artifacts/scan-completion-tools/completion.json'),'utf8'));report.priorDeepAcceptance='artifacts/scan-completion-tools/completion.json';
 report.sourceHashes={};for(const rel of [...new Set([...Object.values(ledger.tools).flatMap(t=>t.sourceChanged.map(x=>x.path)),...['choice-scan.js','choice-scan-adapter.js','scan-status-badge.js','scan-status-badge.css','scan-manager.js'].map(x=>'bennyshub/shared/'+x)])])report.sourceHashes[rel]=crypto.createHash('sha256').update(await fs.readFile(path.join(root,rel))).digest('hex');
})().catch(error=>{report.result='failed';report.failure=error.stack;console.error(error);process.exitCode=1}).finally(async()=>{await context?.close();await fs.writeFile(path.join(artifacts,'browser-report.json'),JSON.stringify(report,null,2))});
