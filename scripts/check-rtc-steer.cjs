'use strict';
// Optional --root <PC Hub> --overlay <staged files> --electron exercises desktop sources.
const fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium,_electron}=require('playwright');
const args=process.argv.slice(2),option=name=>args.includes(name)?args[args.indexOf(name)+1]:null;
const root=path.resolve(option('--root')||path.join(__dirname,'..')),overlay=option('--overlay'),native=args.includes('--electron');
const runtime=fs.mkdtempSync(path.join(os.tmpdir(),'benny-rtc-steer-')),out=path.resolve(option('--out')||path.join(__dirname,'../artifacts/rtc-steer'));
fs.mkdirSync(out,{recursive:true});
const hook=`
window.__rtc={ai,memory,speech,choice,prefs,applyTheme,open:openScreen,type:text=>{typed=text;changedTyping();},state:()=>choice.getState()};
window.__scanSpeech=[];window.__publicSpeech=[];window.__tickets=[];window.__holdSpeech=false;window.__requests=[];
voice.speak=text=>{__scanSpeech.push(String(text));let finish;const finished=new Promise(resolve=>finish=reason=>resolve({started:true,reason}));if(__holdSpeech)__tickets.push(finish);else finish('end');return {started:Promise.resolve(true),finished,cancel:()=>finish('cancelled')};};
NarbeCommunicationSpeech.isEnabled=()=>true;NarbeCommunicationSpeech.prefetch=()=>{};
NarbeCommunicationSpeech.speak=text=>{__publicSpeech.push(text);return {finished:Promise.resolve({reason:'end'})};};
const originalGet=ai.getSuggestions.bind(ai);ai.getSuggestions=(snapshot,profile,avoid,signal,steer,avoidSteers)=>{__requests.push({snapshot,avoid,steer,avoidSteers});return originalGet(snapshot,profile,avoid,signal,steer,avoidSteers);};
ai.request=(prompt,schema)=>new Promise((resolve,reject)=>{__rtc.response={resolve:data=>resolve(JSON.stringify(data)),reject:message=>reject(Error(message)),prompt,schema};});
ai.isAvailable=()=>false;prefs.listening=false;prefs.ai='server';
`;
const server=http.createServer(async(req,res)=>{
 try{
  const name=decodeURIComponent(new URL(req.url,'http://fixture').pathname),file=path.resolve(root,'.'+name);
  if(!file.startsWith(path.join(root,'bennyshub')+path.sep))throw Error('Not public');
  const staged=overlay&&path.resolve(overlay,'.'+name);let content=await fsp.readFile(staged&&fs.existsSync(staged)?staged:file);
  if(name.endsWith('/rtc-lite/app.js'))content=Buffer.from(content.toString().replace('    loadStarters(); initDefaults(); applyTheme(); updateSettings();',hook+'\n    loadStarters(); initDefaults(); applyTheme(); updateSettings();'));
  res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'})[path.extname(file)]||'application/octet-stream'});res.end(content);
 }catch{res.writeHead(404);res.end();}
});
let browser,electron,context,page,nativeRuntime;const errors=[],checks=[];
const board=(n,steers=['Stay home','Watch something','Tired'])=>({general:[`A new plan ${n}`,`Let us pause ${n}`,`Please explain ${n}`,`Try another time ${n}`],specific:[`We could relax ${n}`,`Tell me when ${n}`,`Who is coming ${n}`,`I have an idea ${n}`],summary:'The partner asked about plans.',steers});
(async()=>{try{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
 if(native){
  nativeRuntime=await require(path.join(root,'tools/electron-test-runtime.cjs')).createElectronTestRuntime();
  const entry=path.join(runtime,'entry.cjs');
  fs.writeFileSync(entry,`const {app,BrowserWindow,ipcMain}=require('electron');const path=require('node:path');app.setPath('userData',${JSON.stringify(path.join(runtime,'profile'))});app.disableHardwareAcceleration();app.commandLine.appendSwitch('in-process-gpu');app.whenReady().then(()=>{const {createSettingsStore}=require(${JSON.stringify(path.join(root,'bennyshub/shared/native-settings.cjs'))});const store=createSettingsStore({scanPath:${JSON.stringify(path.join(runtime,'scan.json'))},voicePath:${JSON.stringify(path.join(runtime,'voice.json'))}});for(const kind of ['scan','voice']){ipcMain.handle(kind+':getSettings',(_e,seed)=>store.get(kind,seed));ipcMain.handle(kind+':saveSettings',(_e,patch)=>store.save(kind,patch));}ipcMain.handle('communication:getSettings',()=>({enabled:false}));ipcMain.handle('keyboard:getPredictions',()=>({frequent_words:{MUSIC:{count:20},MUSICAL:{count:15},MUSEUM:{count:10}},bigrams:{},trigrams:{}}));for(const channel of ['stop','cancel-install'])ipcMain.handle('rtc-lite:'+channel,()=>({ok:true}));const win=new BrowserWindow({show:false,width:1366,height:900,webPreferences:{preload:${JSON.stringify(path.join(root,'preload.js'))},contextIsolation:true,nodeIntegration:false,sandbox:false,offscreen:true,backgroundThrottling:false}});win.webContents.session.setPermissionRequestHandler((_w,_p,cb)=>cb(false));win.loadURL('about:blank');});`);
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  electron=await _electron.launch({executablePath:path.join(root,'node_modules/electron/dist/electron.exe'),args:[entry],cwd:nativeRuntime.dir,env});page=await electron.firstWindow();context=page.context();
 }else{browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,cwd:runtime});context=await browser.newContext({viewport:{width:1366,height:900}});page=await context.newPage();}
 await context.route('**/*',route=>/^https?:/.test(route.request().url())&&!route.request().url().startsWith(base)?route.abort():route.continue());
 page.setDefaultTimeout(20000);
 page.on('pageerror',e=>errors.push(e.message));
 await context.addInitScript(()=>{if(!localStorage.getItem('rtcLite_settings'))localStorage.setItem('rtcLite_settings',JSON.stringify({listening:false,ai:'off'}));localStorage.setItem('narbe-voice-settings',JSON.stringify({ttsEnabled:true}));});
 const url=base+'/bennyshub/apps/tools/rtc-lite/index.html',run=fn=>page.evaluate(fn),state=()=>run(()=>__rtc.state());
 const key=async k=>{await page.waitForTimeout(100);await page.keyboard.press(k);};
 const start=async(id='getButton')=>{await run(()=>{__rtc.response=null;__scanSpeech.length=0;__publicSpeech.length=0;});await page.locator('#'+id).click();await page.waitForFunction(()=>!!__rtc.response);};
 const reply=async data=>{await page.evaluate(data=>__rtc.response.resolve(data),data);await page.waitForFunction(()=>document.getElementById('getButton').getAttribute('aria-busy')==='false');};
 const open=async screen=>page.evaluate(screen=>__rtc.open(screen),screen);
 await page.goto(url);await page.waitForFunction(()=>window.__rtc);await page.locator('#continueButton').click();
 assert.equal((await state()).index,-1);assert.equal(await page.locator('#board .board-row').count(),5);
 assert.deepEqual(await page.locator('#steerRow button').allTextContents(),['How I feel','I want','Ask you','Different']);
 await run(()=>__rtc.speech.onText('What do you want to do today?',Date.now(),10));
 await start();await reply(board(1));assert.equal((await state()).id,'generalRow');
 assert.equal((await state()).depth,0);assert((await run(()=>__scanSpeech.at(-1))).includes('A new plan 1. Let us pause 1. Please explain 1. Try another time 1'));
 assert.deepEqual(await run(()=>__publicSpeech),[]);checks.push('GET jumps to generalRow with live row narration, without public speech');
 for(let i=0;i<4;i++){
  const label=await page.locator('#steer'+i).textContent(),before=await run(()=>__rtc.memory.segments.length);
  await start('steer'+i);assert.equal(await page.locator('#steer3').textContent(),'Different');assert.equal(await page.locator('#steer'+i).getAttribute('aria-busy'),'true');
  assert.equal((await run(()=>__requests.at(-1))).steer,i===3?'':label);
  assert.equal(await run(()=>__rtc.memory.segments.length),before);assert.deepEqual(await run(()=>__publicSpeech),[]);
  if(i<3)assert((await run(()=>__scanSpeech)).includes('Steering: '+label));
  const count=await run(()=>__requests.length);await page.locator('#steer3').click();assert.equal(await run(()=>__requests.length),count);
  await reply(board(i+2));assert.equal((await state()).id,'generalRow');
 }
 assert((await run(()=>__requests.at(-1).avoid)).includes('A new plan 1'));checks.push('Three dynamic steers and Different request once, avoid prior boards, never speak or log a steer');
 for(let i=0;i<6;i++){
  const before=(await page.locator('#steerRow button').allTextContents()).slice(0,3),count=await run(()=>__requests.length);
  await start('steer3');const request=await run(()=>__requests.at(-1));assert.equal(request.steer,'');assert(request.avoidSteers.length<=12);assert(before.every(label=>request.avoidSteers.includes(label)));
  await reply(board(100+i,before));const after=(await page.locator('#steerRow button').allTextContents()).slice(0,3);
  assert.equal(after.length,3);assert(after.every(label=>!request.avoidSteers.includes(label)));assert.equal(await run(()=>__requests.length),count+1);assert.equal(await page.locator('#general0').textContent(),'A new plan '+(100+i));
 }
 const beforeFailure=(await page.locator('#steerRow button').allTextContents()).slice(0,3);
 await start('steer3');await run(()=>__rtc.response.reject('Fixture AI unavailable'));await page.waitForFunction(()=>document.getElementById('getButton').getAttribute('aria-busy')==='false');
 assert((await page.locator('#steerRow button').allTextContents()).slice(0,3).every(label=>!beforeFailure.includes(label)));
 assert.deepEqual(await run(()=>__publicSpeech),[]);checks.push('Different replaces all three steers across repeated model output and provider failure without extra calls');
 await start();await run(()=>{__rtc.choice.align('quickRow');__rtc.choice.select();});assert.equal((await state()).id,'quickYes');
 await reply(board(6));assert.equal((await state()).id,'quickYes');assert.equal(await page.locator('#general0').textContent(),'Thinking…');
 for(let i=0;i<4;i++)await key('Space');assert((await state()).backStop);await key('Enter');
 assert.equal((await state()).id,'quickRow');assert.equal(await page.locator('#general0').textContent(),'A new plan 6');checks.push('Entered quick-answer row defers board and returns to the same row without a jump');
 await start();await page.locator('#keyboardButton').click();await page.waitForSelector('#keyboardScreen:not([hidden])');await reply(board(7));assert.equal((await state()).context,'keyboard');
 await page.locator('#keyboardBack').click();assert.equal((await state()).index,-1);assert.equal(await page.locator('#general0').textContent(),'A new plan 7');checks.push('Keyboard remains usable during loading and is never interrupted by the board');
 await start();await run(()=>{NarbeScanManager.updateSettings({autoScan:true,parking:'chosen',scanInterval:5000});__rtc.open('board');});await key('Enter');assert((await state()).parked);
 await reply(board(8));assert((await state()).parked);assert.equal(await page.locator('.row-highlight').count(),0);
 await key('Enter');assert.equal((await state()).id,'generalRow');assert.equal((await state()).depth,0);assert.deepEqual(await run(()=>__publicSpeech),[]);
 await run(()=>NarbeScanManager.updateSettings({autoScan:false,parking:'off'}));checks.push('Parked completion stays parked; Enter resumes at generalRow without selecting');
 await start();await run(()=>__rtc.response.reject('Fixture AI unavailable'));await page.waitForFunction(()=>__rtc.state().id==='generalRow');assert.equal(await page.locator('#general0').textContent(),'Hi');
 checks.push('Failure restores saved phrases and jumps to suggestions');
 await open('phrases');const ids=await page.locator('#phrasesScreen button').evaluateAll(els=>els.map(el=>el.id));assert.deepEqual(ids.slice(ids.indexOf('default7')+1,ids.indexOf('restoreDefaults')),['steerDefault0','steerDefault1','steerDefault2']);
 for(const [i,text] of [[0,'Music'],[1,'Food'],[2,'Rest']]){await page.locator('#steerDefault'+i).click();await page.evaluate(text=>__rtc.type(text),text);await page.locator('#typedText').click();await page.waitForSelector('#phrasesScreen:not([hidden])');}
 assert.deepEqual(await run(()=>JSON.parse(localStorage.getItem('rtcLite_settings')).defaults.steers),['Music','Food','Rest']);
 await page.locator('#steerDefault0').click();
 for(const text of ['Different','food','one two three four','x'.repeat(33),'']){await page.evaluate(text=>__rtc.type(text),text);await page.locator('#typedText').click();assert.equal((await state()).context,'keyboard');assert.equal(await run(()=>__rtc.prefs.defaults.steers[0]),'Music');assert.match(await page.locator('#keyboardStatus').textContent(),/Use/);}
 // Real switch key plus prediction activation, followed by the existing Save row.
 await run(()=>__rtc.type('Mus'));await page.waitForFunction(()=>document.getElementById('keyboardPrediction0').dataset.prediction);
 await page.locator('#keyboardPrediction0').click();assert((await page.locator('#typedText').textContent()).length>3);
 await run(()=>__rtc.type('Music'));await run(()=>__rtc.choice.align('keyboardMessageRow'));await key('Enter');await page.waitForSelector('#phrasesScreen:not([hidden])');
 checks.push('Steer defaults use switch keyboard/predictions; invalid values keep prior defaults and explain why');
 await open('memory');await page.locator('#clearMemory').click();await open('board');assert.deepEqual(await page.locator('#steerRow button').allTextContents(),['Music','Food','Rest','Different']);
 await start();await reply(board(9,['Not a valid four words','Food','Rest']));assert.deepEqual(await page.locator('#steerRow button').allTextContents(),['Music','Food','Rest','Different']);assert.equal(await page.locator('#general0').textContent(),'A new plan 9');
 await page.reload();await page.waitForFunction(()=>window.__rtc);await page.locator('#continueButton').click();assert.equal(await page.locator('#steer0').textContent(),'Music');
 await open('phrases');await page.locator('#restoreDefaults').click();assert.deepEqual(await run(()=>__rtc.prefs.defaults.steers),['How I feel','I want','Ask you']);
 await run(()=>{const p=JSON.parse(localStorage.getItem('rtcLite_settings'));delete p.defaults.steers;p.defaults.general[0]='Hello friend';localStorage.setItem('rtcLite_settings',JSON.stringify(p));});
 await page.reload();await page.waitForFunction(()=>window.__rtc);await page.locator('#continueButton').click();assert.equal(await page.locator('#general0').textContent(),'Hello friend');assert.equal(await page.locator('#steer0').textContent(),'How I feel');
 checks.push('Personal fallback, clear conversation, persistence, restore, and older saved settings');
 await run(()=>{__rtc.choice.align('steerRow');__scanSpeech.length=0;__rtc.choice.announce();});assert.match(await run(()=>__scanSpeech.at(-1)),/^Steer\. How I feel\. I want\. Ask you\. Different/);
 await key('Enter');assert.equal((await state()).id,'steer0');for(let i=0;i<4;i++)await key('Space');assert((await state()).backStop);await key('Space');assert.equal((await state()).id,'steer0');await run(()=>__rtc.choice.step(-1));assert((await state()).backStop);await key('Enter');assert.equal((await state()).id,'steerRow');await key('Space');assert.equal((await state()).index,-1);await run(()=>__rtc.choice.step(-1));assert.equal((await state()).id,'steerRow');
 checks.push('Steer row live narration, forward/reverse Back stop, and recurring root blank');
 await key('Enter');await run(()=>{__rtc.response=null;});await key('Enter');await page.waitForFunction(()=>!!__rtc.response);
 assert.equal(await run(()=>__requests.at(-1).steer),'How I feel');await reply(board(10));assert.equal((await state()).id,'generalRow');
 const beforeDeferred=(await page.locator('#steerRow button').allTextContents()).slice(0,3);
 await start('steer3');await run(()=>{__rtc.choice.align('steerRow');__rtc.choice.select();});await reply(board(11,beforeDeferred));assert.equal((await state()).id,'steer0');assert.equal(await page.locator('#general0').textContent(),'Thinking…');
 assert.deepEqual((await page.locator('#steerRow button').allTextContents()).slice(0,3),beforeDeferred);
 for(let i=0;i<4;i++)await key('Space');await key('Enter');assert.equal((await state()).id,'steerRow');assert.equal(await page.locator('#general0').textContent(),'A new plan 11');
 assert((await page.locator('#steerRow button').allTextContents()).slice(0,3).every(label=>!beforeDeferred.includes(label)));
 checks.push('Switch-selected steer and deferred completion inside the Steer row');
 await start();await run(()=>{NarbeScanManager.updateSettings({autoScan:true,waitForSpeech:true,scanInterval:1000});__holdSpeech=true;});await reply(board(12));
 assert.equal((await state()).id,'generalRow');await page.waitForTimeout(1100);assert.equal((await state()).id,'generalRow');
 await run(()=>{__holdSpeech=false;__tickets.splice(0).forEach(finish=>finish('end'));});await page.waitForTimeout(350);assert.equal((await state()).id,'generalRow');
 await page.waitForFunction(()=>__rtc.state().id==='startersRow',null,{polling:30});
 await run(()=>NarbeScanManager.updateSettings({autoScan:false,waitForSpeech:false}));checks.push('Auto jump owns full row narration and waits for completion plus a full interval');
 await start();await open('memory');await page.locator('#clearMemory').click();await page.evaluate(data=>__rtc.response.resolve(data),board(13));await open('board');
 assert.equal(await page.locator('#general0').textContent(),'Hello friend');assert.equal((await state()).index,-1);checks.push('Clear cancels stale boards without a later jump');
 await run(()=>__rtc.speech.onText('I had a frustrating day.',Date.now(),10));await start('steer3');
 assert.deepEqual(await run(()=>__requests.at(-1).avoidSteers),['How I feel','I want','Ask you']);await reply(board(200,['My opinion','Ask why','Tell you']));
 checks.push('New room speech resets old steering history while excluding the currently displayed three');
 const layouts=[];
 for(const [width,height] of [[800,600],[1024,768],[1280,800],[1366,900]]){
  if(native)await electron.evaluate(({BrowserWindow},{width,height})=>BrowserWindow.getAllWindows()[0].setContentSize(width,height),{width,height});else await page.setViewportSize({width,height});
  for(const size of ['normal','larger']){await page.evaluate(size=>{__rtc.prefs.size=size;localStorage.setItem('rtcLite_settings',JSON.stringify(__rtc.prefs));__rtc.applyTheme();},size);await open('board');await page.waitForTimeout(100);
   const layout=await run(()=>({width:innerWidth,height:innerHeight,fits:document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight,tiles:[...document.querySelectorAll('#board .tile')].map(el=>({id:el.id,visible:el.getBoundingClientRect().bottom<=innerHeight,fit:el.scrollWidth<=el.clientWidth&&el.scrollHeight<=el.clientHeight}))}));assert(layout.fits&&layout.tiles.every(t=>t.visible&&t.fit),JSON.stringify(layout));layouts.push(layout);
  }
  if(native){const png=await electron.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));fs.writeFileSync(path.join(out,`board-${width}x${height}.png`),Buffer.from(png,'base64'));}else await page.screenshot({path:path.join(out,`board-${width}x${height}.png`),timeout:5000});
 }
 checks.push('Five rows fit at 800x600, 1024x768, 1280x800 and 1366x900');
 assert.deepEqual(errors,[]);const report={passed:true,native,checks,layouts,errors};fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:true,native,checks}));
}catch(e){console.error(e);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({passed:false,native,checks,errors,error:e.stack},null,2));await page?.screenshot({path:path.join(out,'failure.png'),timeout:5000}).catch(()=>{});process.exitCode=1;}
finally{await electron?.close();await nativeRuntime?.dispose();await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));const resolved=fs.realpathSync(runtime),temp=fs.realpathSync(os.tmpdir());if(!resolved.startsWith(temp+path.sep)||!path.basename(resolved).startsWith('benny-rtc-steer-'))throw Error('Unsafe cleanup');fs.rmSync(resolved,{recursive:true,force:true});}})();
