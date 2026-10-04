const {chromium}=require('@playwright/test');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const out=path.resolve('artifacts/scan-outline-only/classic');
const dependencies=path.resolve('artifacts/scan-completion-classic/dependencies');
const apps=['BENNYSAYS','BENNYSBASKETBALLSHOOTER','BENNYSBATTLEBOATS','BENNYSBUGBLASTER','BENNYSCHESSCHECKERS','BENNYSCONNECTFOUR','BENNYSMATCHYMATCH','BENNYSTICTACTOE','BENNYSDICE','BENNYSWORDJUMBLE','ELOUISESWORDSEARCH','TRIVIAMASTER','BENNYSSLOTMACHINE'];
const assets={'https://unpkg.com/three@0.150.1/build/three.module.js':'three-0.150.1.module.js','https://unpkg.com/cannon-es@0.20.0/dist/cannon-es.js':'cannon-es-0.20.0.js','https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js':'three-r128.min.js','https://cdnjs.cloudflare.com/ajax/libs/cannon.js/0.6.2/cannon.min.js':'cannon-0.6.2.min.js','https://unpkg.com/three@0.128.0/examples/js/loaders/OBJLoader.js':'OBJLoader-0.128.0.js'};
const report={checks:[],errors:[]};let browser,page;
(async()=>{
 await fs.mkdir(out,{recursive:true});
 browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 for(const app of apps){
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
  await context.addInitScript(()=>{
   Object.defineProperty(window,'speechSynthesis',{value:{getVoices:()=>[],addEventListener(){},removeEventListener(){},cancel(){},speak(u){u.onstart?.();setTimeout(()=>u.onend?.(),250)}}});
   window.SpeechSynthesisUtterance=class{constructor(text){this.text=text}};
   window.__canvasFeedback={labels:[],strokes:[]};
   const p=CanvasRenderingContext2D.prototype,fill=p.fillText,stroke=p.stroke,rect=p.strokeRect;
   p.fillText=function(text,...args){if(window.classicChoice?.getState()?.braked&&!__canvasFeedback.labels.includes(String(text)))__canvasFeedback.labels.push(String(text));return fill.call(this,text,...args)};
   function capture(ctx){const dash=ctx.getLineDash();if(window.classicChoice?.getState()?.braked&&dash.length&&__canvasFeedback.strokes.length<100)__canvasFeedback.strokes.push({dash,cap:ctx.lineCap,width:ctx.lineWidth})}
   p.stroke=function(...args){capture(this);return stroke.apply(this,args)};
   p.strokeRect=function(...args){capture(this);return rect.apply(this,args)};
  });
  page=await context.newPage();page.on('pageerror',e=>report.errors.push({app,error:e.message}));
  for(const [url,name] of Object.entries(assets))await page.route(url,r=>r.fulfill({path:path.join(dependencies,name),contentType:'application/javascript'}));
  await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
  await page.clock.install({time:new Date('2026-10-03T12:00:00Z')});await page.clock.pauseAt(new Date('2026-10-03T12:00:01Z'));
  await page.goto('http://127.0.0.1:4173/bennyshub/apps/games/'+app+'/index.html',{waitUntil:'load'});
  await page.waitForFunction(()=>window.classicChoice);
  const tick=ms=>page.clock.runFor(ms),scan=()=>page.evaluate(()=>classicChoice.getState());
  const prefs=async p=>{await page.evaluate(p=>NarbeScanManager.updateSettings(p),p);await tick(0)};
  const tap=async key=>{await page.keyboard.down(key);await tick(1);await page.keyboard.up(key);await tick(60)};
  await tick(700);await page.evaluate(()=>NarbeVoiceManager.updateSettings({ttsEnabled:false}));
  await prefs({autoScan:true,parking:'off',spaceBrake:true,inputSensitivityIndex:0,waitForSpeech:false,scanSpeedIndex:0});
  await tick(2000);
  const selected=(await scan()).id;assert.ok(selected);
  await tap('Space');assert.equal((await scan()).braked,true);assert.equal((await scan()).id,selected);
  await tick(2000);assert.equal((await scan()).id,selected,'brake retains identity');
  const paused=await page.evaluate(()=>{
   const selected=document.querySelector('[data-narbe-scan-paused]'),r=selected?.getBoundingClientRect();
   return{selected:r&&{x:r.x,y:r.y,width:r.width,height:r.height},outline:selected&&getComputedStyle(selected).outlineStyle,visibleBadges:[...document.querySelectorAll('.narbe-scan-status-badge')].filter(x=>x.getBoundingClientRect().height>0).map(x=>x.textContent),labels:document.querySelectorAll('[data-narbe-scan-pause-label]').length,body:document.body.innerText,canvas:__canvasFeedback};
  });
  assert.deepEqual(paused.visibleBadges,[],'no scan-Paused badge');
  assert.equal(paused.labels,0,'no added Paused prefix');
  assert.doesNotMatch(paused.body,/Paused/i,'main menu contains no scan-Paused wording');
  if(['BENNYSAYS','BENNYSBUGBLASTER'].includes(app)){
   assert.ok(paused.canvas.strokes.length,'canvas painted paused outline');
   for(const stroke of paused.canvas.strokes){assert.equal(stroke.dash[0],0);assert.ok(stroke.dash[1]>0);assert.equal(stroke.cap,'round')}
   assert.ok(paused.canvas.labels.length);assert.ok(paused.canvas.labels.every(x=>!/^Paused\b/i.test(x)),'canvas labels unchanged');
  }else{
   assert.equal(paused.outline,'dotted');
   assert.ok(paused.selected,'native selected element remains marked');
   const b=paused.selected,visible=Math.min(390,b.x+b.width)-Math.max(0,b.x);assert.ok(visible>=Math.min(390,b.width)*.85,app+' selected choice visible');
  }
  await page.screenshot({animations:'disabled',path:path.join(out,app+'-mobile-paused.png')});
  await tap('Space');await tick(939);assert.equal((await scan()).id,selected,'full resume interval');await tick(1);assert.notEqual((await scan()).id,selected,'resume advances once');
  await prefs({parking:'auto',loopsBeforeParking:1});
  for(let i=0,n=await page.evaluate(()=>classicChoice.getItems().length);i<2*n+3;i++)await tick(1000);
  assert.equal((await scan()).parked,true);assert.equal(await page.locator('[data-narbe-scan-paused]').count(),0);
  const parked=await page.locator('.narbe-scan-status-badge:not([hidden])').boundingBox();assert.ok(parked&&parked.y>=0&&parked.y+parked.height<=844,app+' Parked remains visible');
  assert.equal(await page.locator('.narbe-scan-status-badge:not([hidden])').innerText(),'Parked');
  await page.screenshot({animations:'disabled',path:path.join(out,app+'-mobile-parked.png')});
  await tap('Enter');assert.equal((await scan()).parked,false);assert.equal((await scan()).index,0,'parked resume does not activate');
  report.checks.push({app,viewport:'390x844',selected,paused,parked,resume:'full interval retained; parked Enter resumes without activation'});
  console.log('PASS '+app);await context.close();
 }
 assert.deepEqual(report.errors,[]);report.result='passed';
})().catch(async e=>{report.result='failed';report.failure=e.stack;console.error(e);process.exitCode=1;if(page&&!page.isClosed())await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{})}).finally(async()=>{
 await browser?.close();report.testedAt=new Date().toISOString();report.sharedHashes={};
 for(const file of ['scan-status-badge.js','scan-status-badge.css','choice-scan.js'])report.sharedHashes[file]=crypto.createHash('sha256').update(await fs.readFile(path.join('bennyshub/shared',file))).digest('hex');
 await fs.writeFile(path.join(out,'visual-report.json'),JSON.stringify(report,null,2));
});
