// Focused Ballista scan acceptance. Isolated browser data; no gameplay retuning.
const {chromium,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),base=process.env.HUB_TEST_ORIGIN||'http://127.0.0.1:4173';
const artifacts=path.resolve(root,process.env.HUB_TEST_ARTIFACTS||'artifacts/ballista-scan');
const executablePath=process.argv.find(arg=>arg.startsWith('--browser-path='))?.slice('--browser-path='.length)||process.env.HUB_BROWSER_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const sources=['bennyshub/apps/games/BENNYSBALLISTA/js/ui.js','bennyshub/apps/games/BENNYSBALLISTA/js/castle-files.js','bennyshub/shared/choice-scan.js','bennyshub/shared/scan-status-badge.js','bennyshub/shared/scan-status-badge.css','bennyshub/apps/games/BENNYSBALLISTA/style.css'];
const hashes=async()=>Object.fromEntries(await Promise.all(sources.map(async file=>[file,crypto.createHash('sha256').update(await fs.readFile(path.join(root,file))).digest('hex')])));
const report={checks:[],menus:[],errors:[],fixtureLimits:'Rare outcome screens use existing CAM phase staging. This tests menu/input integration, not whole-game completion or physics accuracy.'};
let browser,page;
function pass(label){report.checks.push(label);console.log('PASS '+label)}
(async()=>{
  await fs.mkdir(artifacts,{recursive:true});report.sourceHashes=await hashes();
  browser=await chromium.launch({executablePath,headless:true,args:['--enable-unsafe-swiftshader']});report.browser=browser.version();
  const context=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:'block'});
  await context.addInitScript(()=>{
    window.__scanSpeech=[];window.__scanSounds=[];let active;
    const engine={speaking:false,pending:false,getVoices:()=>[{name:'Fixture English',lang:'en-US'}],addEventListener(){},removeEventListener(){},cancel(){active=null;this.speaking=false;this.pending=false},speak(u){active=u;this.speaking=true;window.__scanSpeech.push({text:u.text,at:Date.now()});u.onstart?.();setTimeout(()=>{if(active===u){this.speaking=false;u.onend?.()}},250)}};
    Object.defineProperty(window,'speechSynthesis',{value:engine});window.SpeechSynthesisUtterance=class{constructor(text){this.text=text}};
  });
  page=await context.newPage();page.on('pageerror',error=>report.errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error'&&/Ballista (frame error|startup failed)/.test(message.text()))report.errors.push(message.text())});
  await page.clock.install({time:new Date('2026-10-03T12:00:00Z')});await page.clock.pauseAt(new Date('2026-10-03T12:00:01Z'));
  await page.goto(base+'/bennyshub/apps/games/BENNYSBALLISTA/index.html');
  const tick=ms=>page.clock.runFor(ms),jump=ms=>page.clock.fastForward(ms);
  const state=()=>page.evaluate(()=>({...RT.ui.__test.state(),shared:RT.ui.__test.choiceState(),phase:RT.game.CAM.phase,bolts:RT.game.boltsUsed}));
  const poll=fn=>expect.poll(fn,{timeout:20000,intervals:[30,60,100]});
  await poll(async()=>{await tick(50);return page.evaluate(()=>!!window.RT?.ui&&RT.game.CAM.phase==='MENU'&&RT.ui.__test.state().choices.length>0)}).toBe(true);
  await page.evaluate(()=>{const original=window.SafeAudio?.play;if(original)window.SafeAudio.play=function(...args){window.__scanSounds.push(args[0]);return original.apply(this,args)};RT.audio?.setMusicEnabled(false)});
  const setPrefs=async patch=>{await page.evaluate(patch=>NarbeScanManager.updateSettings(patch),patch);await tick(0)};
  const voice=enabled=>page.evaluate(enabled=>NarbeVoiceManager.updateSettings({ttsEnabled:enabled}),enabled);
  async function tap(key,after=60){await page.keyboard.down(key);await tick(1);await page.keyboard.up(key);await tick(after)}
  async function expectIndex(index){await poll(async()=>(await state()).scan).toBe(index)}
  async function clickMenu(label){
    const s=await state(),index=s.choices.indexOf(label);assert.ok(index>=0,'Menu contains '+label+'; actual '+s.choices.join(', '));
    await page.locator('#panelList .choice').nth(index).click();await tick(70);
  }
  async function resetLog(){await page.evaluate(()=>{NarbeVoiceManager.cancel();window.__scanSpeech.length=0;window.__scanSounds.length=0})}
  async function expectSilent(){assert.deepEqual(await page.evaluate(()=>window.__scanSpeech.filter(entry=>entry.text.trim())),[],'The blank step must not speak');assert.deepEqual(await page.evaluate(()=>window.__scanSounds.filter(name=>name==='hover'||name==='select')),[],'The blank step must not play a scan/select sound')}
  async function noActionAtBlank(){
    const before=await state();await resetLog();await tap('Enter');const after=await state();
    for(const key of ['screen','stage','scan','phase','bolts','choices'])assert.deepEqual(after[key],before[key],'Enter at blank preserves '+key);
    await expectSilent();
  }
  async function checkMenu(name){
    const s=await state();assert.equal(s.choiceActive,true,name+' owns stationary choice scanning');assert.equal(s.scan,-1,name+' opens blank');
    assert.ok(s.choices.length,name+' has choices');await noActionAtBlank();
    for(let i=0;i<s.choices.length;i++){await tap('Space');await expectIndex(i)}
    await resetLog();await tap('Space');await expectIndex(-1);await expectSilent();await noActionAtBlank();
    await tap('Space');await expectIndex(0);await resetLog();
    await page.keyboard.down('Space');await jump(2999);await expectIndex(0);await jump(1);await expectIndex(-1);
    await page.keyboard.up('Space');await tick(60);await expectSilent();await noActionAtBlank();
    await page.keyboard.down('Space');await jump(3000);await expectIndex(s.choices.length-1);await page.keyboard.up('Space');await tick(60);
    report.menus.push({name,screen:s.screen,stage:s.stage,choices:s.choices});pass(name+': fresh and recurring silent blank, both directions, inert Enter');
  }
  await setPrefs({autoScan:false,inputSensitivityIndex:0,parking:'off',spaceBrake:true,waitForSpeech:false});await voice(true);
  await checkMenu('Welcome');
  await clickMenu('Settings');await checkMenu('Settings');
  await clickMenu('Reset all campaigns');await checkMenu('Reset all campaigns confirmation');await clickMenu('Cancel');
  await clickMenu('Castle Workshop');await checkMenu('Workshop warning');await clickMenu('Cancel');await clickMenu('Back');
  await clickMenu('How to play');await checkMenu('Help');await clickMenu('Back');
  await clickMenu('Play Game');await checkMenu('Kingdom library');
  await clickMenu('My Campaigns');await checkMenu('Custom campaign library');await clickMenu('Back');
  await clickMenu('My Castles');await checkMenu('Custom castle library');
  await clickMenu('Import castles');
  const dialog=page.locator('#castleFiles');await expect(dialog).toBeVisible();
  const importIndex=()=>dialog.getAttribute('data-scan-index');
  await expect.poll(importIndex).toBe('-1');await resetLog();await tap('Enter');await expect(dialog).toBeVisible();await expectSilent();
  const importChoices=await dialog.locator('[data-file-choice]:not(:disabled)').count();
  for(let i=0;i<importChoices;i++){await tap('Space');await expect.poll(importIndex).toBe(String(i))}
  await resetLog();await tap('Space');await expect.poll(importIndex).toBe('-1');await expectSilent();
  await tap('Space');await resetLog();await page.keyboard.down('Space');await jump(3000);await page.keyboard.up('Space');await tick(60);await expect.poll(importIndex).toBe('-1');await expectSilent();
  await tap('Tab');await expect(page.locator('#castleFilePick')).toBeFocused();await tap('Tab');await expect(page.locator('#castleFileURL')).toBeFocused();await tap('Tab');await expect(page.locator('#castleFileLoad')).toBeFocused();
  await page.keyboard.down('Shift');await tap('Tab');await page.keyboard.up('Shift');await expect(page.locator('#castleFileURL')).toBeFocused();
  await page.locator('#castleFileURL').fill('https://example.test/my-castle');await page.keyboard.type('.json');
  await expect(page.locator('#castleFileURL')).toHaveValue('https://example.test/my-castle.json');
  await tap('Tab');await expect(page.locator('#castleFileLoad')).toBeFocused();await tap('Tab');await expect(page.locator('#castleFileClose')).toBeFocused();await tap('Enter');await expect(dialog).toBeHidden();assert.equal((await state()).screen,'custom');
  pass('Import dialog has recurring silent blank; Tab/Shift+Tab, URL typing and Enter on Back retain form ownership');
  // Existing validated fixture API; this writes only isolated browser storage.
  await page.evaluate(()=>RT.courses.save({name:'Scan fixture castle',dist:24,layers:[['K','W']],cutscene:false}));
  await clickMenu('Back');await clickMenu('My Castles');await clickMenu('Scan fixture castle');await checkMenu('Custom castle actions');
  await clickMenu('Edit in Workshop');await checkMenu('Custom castle workshop warning');await clickMenu('Cancel');await clickMenu('Back');
  assert.equal((await state()).choices[(await state()).scan],'Scan fixture castle','Back restores the selected custom castle');await clickMenu('Back');
  await page.evaluate(()=>{const k=RT.campaigns.kingdoms[0],id=RT.levels.LEVELS[k.levels[0]].id;RT.game.save.kingdoms[k.id]={next:2,cleared:2,ammo:['boulder','fire'],results:{[id]:{earned:700,shots:1,stars:3}}}});
  await clickMenu((await state()).choices[0]);await checkMenu('Campaign actions');await clickMenu('Restart progress');await checkMenu('Restart campaign confirmation');await clickMenu('Cancel');
  // Reset only this isolated fixture through its existing API to reach the intro.
  await page.evaluate(()=>RT.game.resetKingdomProgress(RT.campaigns.kingdoms[0].id));await clickMenu('Back');await clickMenu((await state()).choices[0]);
  await clickMenu('Explore');assert.equal((await state()).choiceActive,false,'Live Explore preview keeps its native controls');await page.locator('#exploreBack').click();await tick(70);
  await clickMenu('Start campaign');
  assert.equal((await state()).screen,'story');assert.equal((await state()).choiceActive,false,'Timed narration is not a stationary scan');
  await page.locator('#skipStory').click();await tick(70);await checkMenu('Post-narration Play or Back');
  await clickMenu('Play level');assert.equal((await state()).stage,'ammo');assert.equal((await state()).choiceActive,false);
  await page.locator('#btnPause').click();await tick(70);await checkMenu('Pause');
  await clickMenu('Settings');await checkMenu('In-game Settings');await clickMenu('Back');await clickMenu('How to play');await checkMenu('In-game Help');await clickMenu('Back');
  await clickMenu('Zoom view');await tick(70);await checkMenu('Paused camera controls');
  await setPrefs({autoScan:true,scanSpeedIndex:0,waitForSpeech:true,spaceBrake:true});
  for(const [id,index] of [['zoomIn',0],['zoomOut',1],['zoomBallista',2],['zoomAim',3]]){
    await page.locator('#'+id).click();await tick(70);await expectIndex(index);
    await tick(1000);await expectIndex(index);await tick(400);await expectIndex(index+1);
  }
  pass('Camera value/view changes retain identity and wait for their owned announcement plus a full interval');
  await setPrefs({autoScan:false,waitForSpeech:false});
  await page.locator('#zoomBack').click();await tick(70);assert.equal((await state()).stage,'ammo');
  // Native five-second Enter pause from a non-manual field list stays intact.
  await page.keyboard.down('Enter');await jump(4999);assert.equal((await state()).screen,'');await jump(1);assert.equal((await state()).screen,'pause');await page.keyboard.up('Enter');await tick(60);
  pass('The native five-second Enter pause remains available outside manual aiming');
  await clickMenu('Continue');
  await page.evaluate(()=>RT.game.setEasyAim(false));await setPrefs({autoScan:true,spaceBrake:true});await page.locator('#ammoSelect').click();await tick(70);
  assert.equal((await state()).stage,'target');assert.equal((await state()).choiceActive,false);await tap('Space');await expectIndex(0);await tap('Space');await expectIndex(1);
  pass('Active easy-aim targets retain native Space movement with central brake enabled');
  await setPrefs({autoScan:false});assert.equal((await state()).stage,'manual');assert.equal((await state()).choiceActive,false);
  const manualBefore=await state();await page.keyboard.down('Space');await tick(500);assert.equal((await state()).aimHeld,true);assert.notEqual((await state()).yaw,manualBefore.yaw);await page.keyboard.up('Space');await tick(60);assert.equal((await state()).aimHeld,false);
  const beforePause=await state();await page.keyboard.down('Enter');await jump(6999);assert.equal((await state()).stage,'manual');assert.equal((await state()).charging,true);await jump(1);assert.equal((await state()).screen,'pause');await page.keyboard.up('Enter');await tick(60);assert.equal((await state()).bolts,beforePause.bolts);
  await clickMenu('Continue');await page.keyboard.down('Enter');await tick(600);assert.equal((await state()).charging,true);assert.ok((await state()).range>0);await page.keyboard.up('Enter');await tick(60);assert.equal((await state()).stage,'flight');assert.equal((await state()).choiceActive,false);assert.equal((await state()).bolts,beforePause.bolts+1);
  pass('Manual held aim, held charge/release fire and seven-second pause keep their native gameplay behavior');
  // Outcome fixture setup only: exercise the actual menu render/input paths.
  // Clear the previous real shot before staging results; its later collision
  // must not overwrite the fixture phase while a menu is being inspected.
  await page.evaluate(()=>RT.game.retryLevel());
  for(const [phase,label] of [['RESULTS_MENU','Results'],['OUTOFBOLTS','Out of shots'],['RESCUE_FAILED','Protected-character failure']]){
    if(phase==='RESULTS_MENU'){await setPrefs({autoScan:true,scanSpeedIndex:0,parking:'off',waitForSpeech:false});await page.keyboard.down('Enter');await tick(1)}
    await page.evaluate(phase=>{RT.game.CAM.phase=phase;RT.ui.tick(0)},phase);await tick(70);
    if(phase==='RESULTS_MENU'){
      await tick(1000);await expectIndex(-1);assert.equal((await state()).shared.inputHeld,true);
      await page.keyboard.up('Enter');await tick(999);await expectIndex(-1);await tick(1);await expectIndex(0);assert.equal((await state()).screen,'results');
      await setPrefs({autoScan:false});await page.keyboard.down('Space');await jump(3000);await page.keyboard.up('Space');await tick(60);await expectIndex(-1);
      pass('A native held Enter crossing into an outcome menu freezes its new Auto clock; release is inert and restores a full interval');
    }
    await checkMenu(label);
  }
  await page.locator('#btnPause').evaluate(button=>button.click());await tick(70);
  // The failure screen does not offer Main Menu; use the existing Enter pause.
  if((await state()).screen!=='pause'){await page.keyboard.down('Enter');await jump(5000);await page.keyboard.up('Enter');await tick(60)}
  await clickMenu('Main Menu');await clickMenu('Settings');
  // Same-option preservation includes existing per-app Auto/Speed controls.
  await clickMenu('Auto scan');let settingIndex=(await state()).choices.indexOf('Auto scan');await expectIndex(settingIndex);assert.equal(await page.evaluate(()=>NarbeScanManager.getSettings().autoScan),true);
  await tap('Enter');await expectIndex(settingIndex);assert.equal(await page.evaluate(()=>NarbeScanManager.getSettings().autoScan),false);
  await clickMenu('Scan speed');settingIndex=(await state()).choices.indexOf('Scan speed');await expectIndex(settingIndex);await tap('Enter');await expectIndex(settingIndex);
  pass('Ballista setting changes retain the changed option identity');
  await voice(false);await setPrefs({autoScan:true,scanSpeedIndex:0,parking:'off',spaceBrake:true,waitForSpeech:false});await clickMenu('Back');
  await expectIndex(-1);await tick(1000);await expectIndex(0);const brakeIndex=(await state()).scan;
  await tap('Space');assert.equal((await state()).shared.braked,true);await tick(4000);await expectIndex(brakeIndex);
  await tap('Space',0);await tick(999);await expectIndex(brakeIndex);await tick(1);await expectIndex(brakeIndex+1);
  await page.keyboard.down('Space');await jump(3000);await page.keyboard.up('Space');await tick(999);await expectIndex(brakeIndex+1);await tick(1);await expectIndex(brakeIndex+2);
  pass('Stationary Auto menus use Space brake and resume after a full interval');
  await setPrefs({parking:'chosen'});await clickMenu('Settings');await expectIndex(-1);await resetLog();await tap('Enter');assert.equal((await state()).shared.parked,true);
  await tap('Space');assert.equal((await state()).shared.parked,true);await tap('Enter');await expectIndex(0);assert.equal((await state()).shared.parked,false);
  await setPrefs({parking:'auto',loopsBeforeParking:1,spaceBrake:true});await clickMenu('Back');const count=(await state()).choices.length;
  for(let i=0;i<count+1;i++)await tick(1000);assert.equal((await state()).shared.parked,true);
  pass('Chosen and automatic parking apply to stationary menus and resume without selection');
  await setPrefs({parking:'chosen',spaceBrake:false,waitForSpeech:true});await voice(true);await clickMenu('Settings');
  await tick(1000);await expectIndex(-1);await tick(400);await expectIndex(0);
  assert.ok(await page.evaluate(()=>window.__scanSpeech.some(entry=>/Settings.*Park/i.test(entry.text))),'Fresh Auto menu announces its Park state');
  await tick(1000);await expectIndex(0);await tick(400);await expectIndex(1);
  pass('Fresh Auto park and highlighted choices wait for owned speech plus a full interval');
  await setPrefs({parking:'off'});
  for(const menu of ['Back','Settings']){await resetLog();await clickMenu(menu);await tick(400);assert.ok(!(await page.evaluate(()=>window.__scanSpeech)).some(entry=>/\bpark(?:ed)?\b/i.test(entry.text)),menu+' announcement must not append Park with Parking Off');}
  pass('Ballista fresh menu and Settings announcements stay free of Park with Parking Off');
  await page.screenshot({animations:'disabled',path:path.join(artifacts,'settings-scan.png')});
  assert.deepEqual(report.errors,[]);assert.deepEqual(await hashes(),report.sourceHashes,'Sources stayed unchanged during acceptance');report.result='passed';console.log('Ballista scan acceptance passed.');
})().catch(async error=>{report.result='failed';report.failure=error.stack;console.error(error);process.exitCode=1;if(page&&!page.isClosed()){report.state=await page.evaluate(()=>({ui:window.RT?.ui?.__test?.state?.(),choice:window.RT?.ui?.__test?.choiceState?.(),body:document.body.dataset})).catch(()=>null);await page.screenshot({animations:'disabled',path:path.join(artifacts,'failure.png')}).catch(()=>{})}}).finally(async()=>{await browser?.close();await fs.mkdir(artifacts,{recursive:true});await fs.writeFile(path.join(artifacts,'browser-report.json'),JSON.stringify(report,null,2))});
