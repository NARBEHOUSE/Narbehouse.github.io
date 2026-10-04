const {chromium,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),base='http://127.0.0.1:4173',artifacts=path.join(root,'artifacts/scan-completion-tools');
const executablePath=process.env.HUB_BROWSER_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const requested=process.argv.find(arg=>arg.startsWith('--tool='))?.slice(7);
let context;const report={checks:[],errors:[],tools:{}};
async function advance(page,ms){while(ms>0){const step=Math.min(ms,400);await page.clock.runFor(step);ms-=step;await new Promise(r=>setTimeout(r,20));}}
const {feedbackGeometry}=require('./check-scan-tools-feedback.cjs');
function pass(tool,text){report.checks.push(tool+': '+text);console.log('PASS '+tool+': '+text)}
(async()=>{
 await fs.mkdir(artifacts,{recursive:true});
 context=await chromium.launchPersistentContext(path.join(artifacts,'profile-'+Date.now()),{executablePath,headless:true,viewport:{width:1280,height:900},args:['--disable-extensions-except='+path.join(root,'extension'),'--load-extension='+path.join(root,'extension')]});
 await context.addInitScript(()=>{
   localStorage.setItem('narbe-scan-settings',JSON.stringify({autoScan:false,scanSpeedIndex:0,inputSensitivityIndex:0,parking:'off',spaceBrake:true,waitForSpeech:false,loopsBeforeParking:2}));
   localStorage.setItem('narbe-voice-settings',JSON.stringify({ttsEnabled:false}));
   localStorage.setItem('benny-web:v1:streaming.catalog',JSON.stringify(Array.from({length:12},(_,i)=>({id:'test'+i,title:'Show '+String(i).padStart(2,'0'),type:'shows',genre:'Genre '+String(i).padStart(2,'0'),url:'https://www.youtube.com/watch?v=test'+i}))));
   localStorage.setItem('benny-web:v1:streaming.episodes',JSON.stringify({'show 00':Object.fromEntries(Array.from({length:9},(_,s)=>[s+1,Array.from({length:10},(_,e)=>({episode:e+1,title:'Episode '+(e+1),url:'https://www.youtube.com/watch?v=episode'+e}))]))}));
   window.testSpeech=[];window.testClicks=[];document.addEventListener('click',e=>window.testClicks.push(e.target.closest('button')?.id||e.target.textContent));
   let active;const engine={speaking:false,getVoices:()=>[{name:'Test English',lang:'en-US'}],addEventListener(){},removeEventListener(){},cancel(){active=null;this.speaking=false},speak(utterance){active=utterance;this.speaking=true;testSpeech.push({text:utterance.text,at:Date.now()});utterance.onstart?.();setTimeout(()=>{if(active===utterance){this.speaking=false;utterance.onend?.()}},500)}};
   window.SpeechSynthesisUtterance=class{constructor(text){this.text=text}}; Object.defineProperty(window,'speechSynthesis',{value:engine,configurable:true});
 });
 const hub=await context.newPage();await hub.goto(base+'/bennyshub/index.html');
 await hub.waitForFunction(()=>window.BennyExtension?.supports('streaming'));await hub.close();for(const empty of context.pages())await empty.close();
 for(const tool of ['streaming'].filter(name=>!requested||name===requested)){
   const page=await context.newPage(); page.on('pageerror',e=>report.errors.push({tool,message:e.message}));await page.clock.install({time:new Date('2026-10-03T12:00:00Z')});await page.clock.pauseAt(new Date('2026-10-03T12:10:00Z'));
   await page.goto(base+'/bennyshub/apps/tools/'+tool+'/index.html');
   if(tool==='streaming')await page.waitForFunction(()=>BennyExtension.supports(document.documentElement.dataset.extensionTool)&&!document.querySelector('#companion-required')?.open);
   if(tool==='keyboard')await page.waitForFunction(()=>window.predictionSystem?.dataLoaded);
   await advance(page,500);
   const surface=page.locator('body');await expect(surface).toHaveAttribute('data-choice-index','-1');await advance(page,500);
   const state=()=>surface.getAttribute('data-choice-index'),identity=()=>surface.getAttribute('data-choice-selected');
   const tap=async(key,after=65)=>{await page.keyboard.down(key);await advance(page,1);await page.keyboard.up(key);if(after)await advance(page,after)};
   const set=async settings=>{await page.evaluate(settings=>NarbeScanManager.updateSettings(settings),settings);await advance(page,0)};
   const count=7,hold=tool==='streaming'?3000:2000;
   await tap('Enter');assert.equal(await state(),'-1');await tap('Space');assert.equal(await state(),'0');
   await page.keyboard.down('Space');await advance(page,tool==='streaming'?3001:3001);await page.keyboard.up('Space');await advance(page,65);assert.equal(await state(),'-1');
   for(let index=0;index<count;index++){await tap('Space');assert.equal(await state(),String(index));}
   await tap('Space');assert.equal(await state(),'-1');
   pass(tool,'1 ms release accepted; blank Enter inert; complete forward loop and native backward hold cross -1');
   await set({autoScan:true,parking:'chosen'});const before=await page.evaluate(()=>testClicks.length);await tap('Enter');
   await expect(surface).toHaveAttribute('data-choice-state','parked');await expect(page.locator('.narbe-scan-status-badge:visible')).toHaveText('Parked');assert.equal(await page.locator('.highlighted').count(),0);
   await feedbackGeometry(page,true);await page.screenshot({path:path.join(artifacts,tool+'-parked.png')});await tap('Space');await expect(surface).toHaveAttribute('data-choice-state','parked');await tap('Enter',0);assert.equal(await state(),'0');assert.equal(await page.evaluate(()=>testClicks.length),before);
   await advance(page,70);await page.keyboard.down('Space');await expect(surface).toHaveAttribute('data-choice-state','paused');await advance(page,1);await page.keyboard.up('Space');
   const paused=await identity();await advance(page,3000);assert.equal(await identity(),paused);
   const marker=page.locator('[data-narbe-scan-paused]');await expect(marker).toHaveCount(1);assert.equal(await marker.evaluate(el=>getComputedStyle(el).outlineStyle),'dotted');
   await expect(page.locator('[data-narbe-scan-pause-label]')).toHaveCount(0);report.tools[tool]={geometry:await feedbackGeometry(page)};await page.screenshot({path:path.join(artifacts,tool+'-paused.png')});
   await tap('Space',0);await expect(surface).not.toHaveAttribute('data-choice-state','paused');await advance(page,999);assert.equal(await identity(),paused);await advance(page,25);assert.notEqual(await identity(),paused);
   await advance(page,65);await page.keyboard.down('Space');await advance(page,hold);await page.keyboard.up('Space');await expect(surface).not.toHaveAttribute('data-choice-state','paused');
   pass(tool,'chosen parking is blank and resume does not select; brake tap/hold and full-interval resume retain focus with visible dotted feedback without added text');
   await set({autoScan:false,parking:'off'});
   for(let i=0;i<count+1&&await state()!=='-1';i++)await tap('Space');assert.equal(await state(),'-1');
   await page.evaluate(()=>{NarbeVoiceManager.updateSettings({ttsEnabled:true});testSpeech.length=0});
   await tap('Space');await tap('Space');
   for(let i=0;i<count-1;i++)await tap('Space');assert.equal(await state(),'-1');assert.equal(await page.evaluate(()=>testSpeech.some(x=>/^park/i.test(x.text))),false);
   await set({autoScan:true,waitForSpeech:true});await advance(page,1000);assert.equal(await state(),'0');await advance(page,1549);assert.equal(await state(),'0');await advance(page,1);assert.equal(await state(),'1');
   pass(tool,'Step blank is silent; Wait for speech delays the next item until speech completion plus one interval');
   await page.evaluate(()=>NarbeVoiceManager.updateSettings({ttsEnabled:false}));await set({autoScan:false,waitForSpeech:false,parking:'auto'});
   for(let i=0;i<count+1&&await state()!=='-1';i++)await tap('Space');
   for(const loopsBeforeParking of [1,2,3]){
     await set({loopsBeforeParking,autoScan:true});await advance(page,(count+1)*1000*loopsBeforeParking);await expect(surface).toHaveAttribute('data-choice-state','parked');
     await set({autoScan:false});assert.equal(await state(),'-1');
   }
   pass(tool,'automatic parking counts exactly 1, 2 and 3 complete loops');
   await page.locator('#btn-settings').click();assert.equal(await state(),'-1');await page.locator('#toggle-autoscan').click();assert.equal(await identity(),'setting:Auto Scan');await set({autoScan:false});assert.equal(await identity(),'setting:Auto Scan');
   await page.locator('button[onclick="openEditorConfirm()"]').click();assert.equal(await state(),'-1');await tap('Enter');assert.equal(await state(),'-1');await page.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(await state(),'-1');
   await page.locator('#settings-menu .back-btn-large').click();await page.locator('#btn-shows').click();assert.equal(await state(),'-1');await tap('Space');assert.equal(await identity(),'header:back');
   await page.locator('#genre-8').click();assert.equal(await state(),'-1');await page.locator('#genre-0').click();await page.locator('#genre-1').click();assert.equal(await state(),'-1');await tap('Space');assert.equal(await identity(),'header:back');
   await page.locator('#item-0').click();await expect(surface).toHaveAttribute('data-choice-context','modal');assert.equal(await state(),'-1');await page.getByRole('button',{name:'Pick Episode',exact:true}).click();await expect(surface).toHaveAttribute('data-choice-context','seasons');assert.equal(await state(),'-1');
   await tap('Space');assert.equal(await identity(),'header:back');await page.locator('#max-season-1').click();await expect(surface).toHaveAttribute('data-choice-context','episodes');assert.equal(await state(),'-1');await tap('Space');assert.equal(await identity(),'header:back');
   await page.locator('#max-ep-8').click();assert.equal(await state(),'-1');
   await page.keyboard.down('Enter');await advance(page,5000);await page.keyboard.up('Enter');await advance(page,65);await expect(surface).toHaveAttribute('data-choice-context','pause');assert.equal(await state(),'-1');
   await page.locator('#btn-pause-settings').click();await expect(page.locator('#pause-menu')).toBeHidden();await expect(surface).toHaveAttribute('data-choice-context','settings');await page.locator('#settings-menu .back-btn-large').click();await expect(surface).toHaveAttribute('data-choice-context','pause');assert.equal(await state(),'-1');
   await page.locator('#btn-main-menu').click();await page.locator('#btn-search').click();assert.equal(await state(),'-1');for(let i=0;i<4;i++)await tap('Space');assert.equal(await identity(),'row:1');await tap('Enter');assert.equal(await identity(),'key:A');
   await page.keyboard.down('Enter');await advance(page,3000);await page.keyboard.up('Enter');await advance(page,65);assert.equal(await identity(),'row:1');await tap('Enter');await tap('Enter');await expect(page.locator('#search-input')).toHaveValue('A');assert.equal(await identity(),'row:1');
   await tap('Enter');for(let i=0;i<6;i++)await tap('Space');assert.equal(await state(),'-1');await expect(surface).toHaveAttribute('data-choice-context','keyboard');await page.locator('.action-exit').click();await expect(surface).toHaveAttribute('data-choice-context','main');
   pass(tool,'settings preserve identity; editor warning, header Back, genre paging, title actions, seasons/episodes/paging, pause/settings return, and search keyboard share fresh blank/row restore policy');
   report.tools[tool]={...report.tools[tool],result:'passed',checks:report.checks.filter(x=>x.startsWith(tool+':'))};await page.close();
 }
 assert.deepEqual(report.errors,[]);report.result='passed';
})().catch(error=>{report.result='failed';report.failure=error.stack;console.error(error);process.exitCode=1}).finally(async()=>{await context?.close();await fs.writeFile(path.join(artifacts,'streaming.json'),JSON.stringify(report,null,2))});
