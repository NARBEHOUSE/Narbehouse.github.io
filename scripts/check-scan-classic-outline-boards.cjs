const {chromium}=require('@playwright/test'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const out=path.resolve('artifacts/scan-outline-only/classic'),report={checks:[],errors:[]};let browser,page;
(async()=>{await fs.mkdir(out,{recursive:true});browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
for(const app of ['BENNYSBATTLEBOATS','BENNYSMATCHYMATCH','ELOUISESWORDSEARCH']){
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
 await context.addInitScript(()=>{Object.defineProperty(window,'speechSynthesis',{value:{getVoices:()=>[],addEventListener(){},removeEventListener(){},cancel(){},speak(u){u.onstart?.();setTimeout(()=>u.onend?.(),250)}}});window.SpeechSynthesisUtterance=class{constructor(text){this.text=text}}});
 page=await context.newPage();page.on('pageerror',e=>report.errors.push({app,error:e.message}));
 await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));
 await page.clock.install({time:new Date('2026-10-03T12:00:00Z')});await page.clock.pauseAt(new Date('2026-10-03T12:00:01Z'));await page.goto('http://127.0.0.1:4173/bennyshub/apps/games/'+app+'/index.html');
 await page.waitForFunction(()=>window.classicChoice);const tick=ms=>page.clock.runFor(ms),scan=()=>page.evaluate(()=>classicChoice.getState());
 const tap=async key=>{await page.keyboard.down(key);await tick(1);await page.keyboard.up(key);await tick(60)};
 const prefs=async settings=>{await page.evaluate(settings=>NarbeScanManager.updateSettings(settings),settings);await tick(0)};
 async function choose(label,activate=true){const list=await page.evaluate(()=>classicChoice.getItems()),index=list.findIndex(x=>typeof label==='string'?x.label===label:label.test(x.label));assert.ok(index>=0,String(label)+' '+JSON.stringify(list));let budget=list.length+2;while((await scan()).index!==index&&budget--)await tap('Space');assert.ok(budget>=0);if(activate)await tap('Enter')}
 async function feedback(kind){const id=(await scan()).id;await prefs({autoScan:true});await tap('Space');assert.equal((await scan()).braked,true);assert.equal((await scan()).id,id);assert.equal(await page.locator('[data-narbe-scan-paused]').evaluate(e=>getComputedStyle(e).outlineStyle),'dotted');assert.equal(await page.locator('[data-narbe-scan-pause-label]').count(),0);assert.equal(await page.locator('.narbe-scan-status-badge:not([hidden])').count(),0);assert.equal(await page.locator('#classic-scan-status').isVisible(),false);await tick(1200);assert.equal((await scan()).id,id);await page.screenshot({animations:'disabled',path:path.join(out,app+'-'+kind+'-dotted.png')});await tap('Space');await prefs({autoScan:false});report.checks.push({app,kind,id,result:'dotted outline only; same choice; no status or duplicate label'})}
 await tick(800);await page.evaluate(()=>NarbeVoiceManager.updateSettings({ttsEnabled:false}));await prefs({autoScan:false,parking:'off',spaceBrake:true,inputSensitivityIndex:0,waitForSpeech:false,scanSpeedIndex:0});
 if(app==='BENNYSBATTLEBOATS'){await choose('1 Player');await choose(/Select Ship/);await tap('Space');await tap('Enter');await choose('Move Ship')}
 else if(app==='BENNYSMATCHYMATCH'){await choose('Single Player');await choose('Casual');await choose('Play Game');await page.waitForFunction(()=>document.getElementById('grid-container'))}
 else{await choose('Play Game');await choose(/Start/)}
 await tap('Space');await feedback('row');await tap('Enter');assert.equal((await scan()).depth,1);await feedback('cell');
 await context.close();console.log('PASS '+app+' row/cell');
}assert.deepEqual(report.errors,[]);report.result='passed'})().catch(async e=>{report.result='failed';report.failure=e.stack;console.error(e);process.exitCode=1;if(page&&!page.isClosed())await page.screenshot({path:path.join(out,'board-failure.png')}).catch(()=>{})}).finally(async()=>{await browser?.close();await fs.writeFile(path.join(out,'board-feedback-report.json'),JSON.stringify(report,null,2))});
