// Stage 3 acceptance: the actual Hub Settings screen, isolated browser storage.
const {chromium,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),base=process.env.HUB_TEST_ORIGIN||'http://127.0.0.1:4173';
const artifacts=path.resolve(root,process.env.HUB_TEST_ARTIFACTS||'artifacts/hub-scan-settings-page-flow');
const requestedBrowser=process.argv.find(arg=>arg.startsWith('--browser-path='))?.slice('--browser-path='.length)||process.env.HUB_BROWSER_PATH;
const newControls=['parking-toggle','parking-loops-toggle','spacebrake-toggle','waitspeech-toggle'];
const scanOrder=['autoscan-toggle','sensitivity-toggle','scanspeed-toggle',...newControls];
let browser,context,page;
const report={checks:[],errors:[]};
const acceptanceSources=['bennyshub/index.html','bennyshub/shared/choice-scan.js','bennyshub/shared/scan-settings.js'];
const sourceHashes=async()=>Object.fromEntries(await Promise.all(acceptanceSources.map(async file=>[file,require('node:crypto').createHash('sha256').update(await fs.readFile(path.join(root,file))).digest('hex')])));
const pass=label=>{report.checks.push(label);console.log('PASS '+label)};
(async()=>{
  await fs.mkdir(artifacts,{recursive:true});
  report.sourceHashes=await sourceHashes();
  let executablePath=requestedBrowser;
  if(!executablePath){
    for(const candidate of [chromium.executablePath(),'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe']){
      try{await fs.access(candidate);executablePath=candidate;break}catch{}
    }
  }
  browser=await chromium.launch({...(executablePath?{executablePath}:{}),headless:true});
  report.browser=browser.version();report.executablePath=executablePath;
  context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});
  await context.addInitScript(()=>{
    let active;
    window.__hubSpeech=[];
    const engine={
      speaking:false,getVoices:()=>[{name:'Fixture English One',lang:'en-US'},{name:'Fixture English Two',lang:'en-GB'}],
      addEventListener(){},removeEventListener(){},
      cancel(){active=null;this.speaking=false},
      speak(utterance){
        active=utterance;this.speaking=true;window.__hubSpeech.push({text:utterance.text,at:Date.now()});utterance.onstart?.();
        setTimeout(()=>{if(active===utterance){this.speaking=false;utterance.onend?.()}},250);
      }
    };
    Object.defineProperty(window,'speechSynthesis',{value:engine});
    window.SpeechSynthesisUtterance=class{constructor(text){this.text=text}};
  });
  context.on('page',p=>p.on('pageerror',error=>report.errors.push({url:p.url(),message:error.message})));
  page=await context.newPage();
  await page.clock.install({time:new Date('2026-10-03T12:00:00Z')});
  await page.clock.pauseAt(new Date('2026-10-03T12:00:01Z'));
  await page.goto(base+'/bennyshub/index.html');
  const tick=ms=>page.clock.runFor(ms);
  const prefs=()=>page.evaluate(()=>NarbeScanManager.getSettings());
  const settings=page.locator('#screen-settings');
  const selected=()=>settings.getAttribute('data-selected');
  const scanState=()=>settings.getAttribute('data-scan-state');
  const expectSelected=id=>expect.poll(selected,{intervals:[20]}).toBe(id);
  const button=id=>page.locator('#'+id);
  async function tap(key,after=60){
    await page.keyboard.down(key);await tick(1);await page.keyboard.up(key);await tick(after);
  }
  async function dismissWelcome(){
    if(await page.locator('#modal-cancel').isVisible())await page.locator('#modal-cancel').click();
    await tick(150);
  }
  async function enterSettings(){
    await page.locator('#screen-home [data-target="settings"]').click();await tick(150);
    await expect(settings).toHaveClass(/active/);await expectSelected('park');
    await expect(settings).toHaveAttribute('data-scan-index','-1');
    assert.equal(await settings.locator('button:focus').count(),0,'Fresh Settings has no lingering visual button focus');
  }
  async function freshSettings(){
    await settings.locator('.backbtn').click();await tick(150);
    await expect(page.locator('#screen-home')).toHaveClass(/active/);
    await enterSettings();
  }
  const scanIds=()=>settings.locator('button:visible:not(:disabled)').evaluateAll(items=>items.map(el=>el.id||'back:'+el.dataset.target));
  async function stepTo(id){
    for(let i=0;i<30&&await selected()!==id;i++)await tap('Space');
    await expectSelected(id);
  }
  async function setPrefs(patch){await page.evaluate(patch=>NarbeScanManager.updateSettings(patch),patch);await tick(0)}
  async function focusByPointer(id){
    await button(id).click();await tick(0);await expectSelected(id);
    assert.equal(await page.evaluate(()=>document.activeElement?.id),id);
  }
  await dismissWelcome();
  await page.evaluate(()=>NarbeVoiceManager.updateSettings({ttsEnabled:false}));
  await enterSettings();
  await expect(page.getByRole('heading',{name:'Scan',exact:true})).toBeVisible();
  await expect(button('scan-settings')).toBeVisible();
  await expect(button('auto-scan-options')).toBeVisible();
  await expect(button('autoscan-toggle')).toBeVisible();
  await expect(button('sensitivity-toggle')).toBeVisible();
  for(const id of newControls){await expect(button(id)).toBeVisible();await expect(button(id)).toBeDisabled()}
  await expect(button('autoscan-toggle')).toBeEnabled();await expect(button('sensitivity-toggle')).toBeEnabled();await expect(button('scanspeed-toggle')).toBeEnabled();
  assert.deepEqual(await page.getByRole('group',{name:'Scan mode and timing',exact:true}).locator('button').evaluateAll(items=>items.map(el=>el.id)),scanOrder.slice(0,3));
  const modeTops=await Promise.all(scanOrder.slice(0,3).map(id=>button(id).evaluate(el=>el.getBoundingClientRect().top)));
  assert.ok(Math.max(...modeTops)-Math.min(...modeTops)<1,'Auto Scan, Input Sensitivity and Scan Speed share the desktop row');
  for(const id of scanOrder){
    assert.equal(await button('scan-settings').locator('#'+id).count(),1,id+' belongs only to the central Scan section');
    assert.ok((await button(id).locator('.desc').textContent()).trim(),id+' has a plain-language description');
  }
  const initial=await prefs();await tap('Enter');assert.deepEqual(await prefs(),initial);await expectSelected('park');
  // Disabled cards stay visible, are inert to native clicks, and do not enter
  // the switch scan. Step still includes a recurring -1.
  for(const id of newControls){await button(id).click({force:true});assert.deepEqual(await prefs(),initial);await expectSelected('park')}
  const stepIds=await scanIds();
  assert.deepEqual(stepIds.filter(id=>scanOrder.includes(id)),scanOrder.slice(0,3));
  for(const id of stepIds){await tap('Space');await expectSelected(id)}
  assert.notEqual(await selected(),'park');await tap('Space');await expectSelected('park');
  await tap('Space');
  await page.keyboard.down('Space');await tick(3000);await expectSelected('park');
  await tick(initial.scanInterval);assert.notEqual(await selected(),'park');
  await page.keyboard.up('Space');await tick(60);
  assert.equal(await scanState(),'step');
  pass('Central Scan controls stay visible and described; disabled Auto choices are inert and excluded from Step, with recurring -1 both ways');

  await freshSettings();await stepTo('scanspeed-toggle');
  const beforeSpeed=await prefs();await tap('Enter');await expectSelected('scanspeed-toggle');
  const stepSpeed=await prefs();assert.equal(stepSpeed.autoScan,false);assert.notEqual(stepSpeed.scanSpeedIndex,beforeSpeed.scanSpeedIndex);
  await page.keyboard.down('Space');await tick(3000);await expectSelected('sensitivity-toggle');
  await tick(stepSpeed.scanInterval-1);await expectSelected('sensitivity-toggle');
  await tick(1);await expectSelected('autoscan-toggle');
  await page.keyboard.up('Space');await tick(60);
  await setPrefs({scanSpeedIndex:initial.scanSpeedIndex});
  pass('Scan Speed stays selectable in Step and the chosen interval controls held reverse scanning');

  await freshSettings();await stepTo('autoscan-toggle');
  await tap('Enter');assert.equal((await prefs()).autoScan,true);await expectSelected('autoscan-toggle');
  await expect(button('auto-scan-options')).toBeVisible();
  await expect(button('parking-loops-toggle')).toBeVisible();await expect(button('parking-loops-toggle')).toBeDisabled();
  // Both taps are valid (>50ms), well inside the removed 500ms local gate.
  await tap('Enter');assert.equal((await prefs()).autoScan,false);await expectSelected('autoscan-toggle');
  await tap('Enter');assert.equal((await prefs()).autoScan,true);await expectSelected('autoscan-toggle');
  // A 1ms press is valid; a second release inside the configured 50ms
  // sensitivity window is still rejected by the shared input guard.
  await tap('Enter',0);assert.equal((await prefs()).autoScan,false);
  await tap('Enter',0);assert.equal((await prefs()).autoScan,false);
  await tick(60);await tap('Enter');assert.equal((await prefs()).autoScan,true);
  await expectSelected('autoscan-toggle');
  await tick(1000);await expectSelected('autoscan-toggle');
  await tick(1100);assert.notEqual(await selected(),'autoscan-toggle');
  // Pointer also makes the changed option the current stable scan item.
  await focusByPointer('autoscan-toggle');assert.equal((await prefs()).autoScan,false);
  await focusByPointer('autoscan-toggle');assert.equal((await prefs()).autoScan,true);
  await expectSelected('autoscan-toggle');
  pass('Auto/Step switch and pointer changes retain Scan mode; valid rapid releases are not blocked by the old 500ms gate');

  await setPrefs({autoScan:true,scanSpeedIndex:0,spaceBrake:false,waitForSpeech:false,parking:'off'});await freshSettings();
  const enabledAutoIds=await scanIds();assert.ok(!enabledAutoIds.includes('parking-loops-toggle'));
  for(const id of enabledAutoIds){await tick(1000);await expectSelected(id)}
  await tick(1000);await expectSelected('park');
  pass('Automatic scans visit every enabled option in order and skip the visible disabled Loops card');

  await setPrefs({scanSpeedIndex:3,spaceBrake:false,waitForSpeech:false,parking:'auto'});
  await expect(button('parking-loops-toggle')).toBeVisible();
  assert.deepEqual(await button('scan-settings').locator('button:visible').evaluateAll(items=>items.map(el=>el.id)),scanOrder);
  for(const [id,key] of [['scanspeed-toggle','scanSpeedIndex'],['parking-loops-toggle','loopsBeforeParking'],['waitspeech-toggle','waitForSpeech']]){
    const before=(await prefs())[key];await focusByPointer(id);const clicked=(await prefs())[key];assert.notEqual(clicked,before,id+' pointer changes its value');
    await tap('Enter');await expectSelected(id);assert.notEqual((await prefs())[key],clicked,id+' switch changes its value');
  }
  // Parking can redraw the Loops control without disturbing Parking itself.
  const parkingCycle=[];await focusByPointer('parking-toggle');parkingCycle.push((await prefs()).parking);
  await tap('Enter');await expectSelected('parking-toggle');parkingCycle.push((await prefs()).parking);
  await tap('Enter');await expectSelected('parking-toggle');parkingCycle.push((await prefs()).parking);
  assert.equal(new Set(parkingCycle).size,3,'Parking cycles through all three options');
  const oldBrake=(await prefs()).spaceBrake;await focusByPointer('spacebrake-toggle');assert.equal((await prefs()).spaceBrake,!oldBrake);
  await tap('Enter');await expectSelected('spacebrake-toggle');assert.equal((await prefs()).spaceBrake,oldBrake);
  pass('Scan speed, Parking, Loops, Space brake and Wait for speech keep the changed option through pointer and switch activation');

  await setPrefs({autoScan:false});
  for(const id of ['highlight-toggle','highlight-style-toggle','textcolor-toggle','bgtheme-toggle','tts-toggle','voice-toggle','sensitivity-toggle','uisize-toggle']){
    await focusByPointer(id);await tap('Enter',350);await expectSelected(id);
  }
  await page.evaluate(()=>NarbeVoiceManager.updateSettings({ttsEnabled:false}));
  await setPrefs({inputSensitivityIndex:0});
  pass('Existing appearance, voice, sensitivity and size settings retain their own focus too');

  await setPrefs({autoScan:true,parking:'auto',loopsBeforeParking:3,spaceBrake:false,waitForSpeech:true,scanSpeedIndex:3});
  await focusByPointer('parking-loops-toggle');
  await setPrefs({loopsBeforeParking:3});
  await setPrefs({parking:'chosen'});
  await expect(button('parking-loops-toggle')).toBeVisible();await expect(button('parking-loops-toggle')).toBeDisabled();await expectSelected('park');
  await expect(settings).toHaveAttribute('data-scan-index','-1');
  assert.equal((await prefs()).loopsBeforeParking,3);
  assert.equal(await settings.locator('button:focus').count(),0,'A disabled selected control loses native focus');
  await focusByPointer('waitspeech-toggle');await setPrefs({waitForSpeech:true});
  await setPrefs({autoScan:false});
  await expect(button('auto-scan-options')).toBeVisible();
  for(const id of newControls)await expect(button(id)).toBeDisabled();
  await expect(button('scanspeed-toggle')).toBeEnabled();
  await expectSelected('park');
  assert.deepEqual(Object.fromEntries(Object.entries(await prefs()).filter(([key])=>['parking','loopsBeforeParking','spaceBrake','waitForSpeech'].includes(key))),
    {parking:'chosen',loopsBeforeParking:3,spaceBrake:false,waitForSpeech:true});
  await focusByPointer('autoscan-toggle');await expect(button('auto-scan-options')).toBeVisible();
  await expectSelected('autoscan-toggle');
  pass('Disabled controls retain saved values; disabling the current option falls back safely to -1');

  // Wrapper switch input must use the same matched-release guard.
  async function virtualTap(action,after=60){
    await page.evaluate(action=>GameHub.press(action),action);await tick(1);
    await page.evaluate(action=>GameHub.release(action),action);await tick(after);
  }
  await setPrefs({autoScan:false,inputSensitivityIndex:0,spaceBrake:false,waitForSpeech:false});
  await freshSettings();await page.evaluate(()=>GameHub.release('scan'));await expectSelected('park');await tick(60);
  await virtualTap('scan');await expectSelected('settings-back');
  await stepTo('autoscan-toggle');await virtualTap('select');assert.equal((await prefs()).autoScan,true);await expectSelected('autoscan-toggle');
  await virtualTap('select',0);assert.equal((await prefs()).autoScan,false);
  await virtualTap('select',0);assert.equal((await prefs()).autoScan,false);
  await tick(60);await virtualTap('select');assert.equal((await prefs()).autoScan,true);
  await page.evaluate(()=>GameHub.press('select'));await tick(3000);await expectSelected('autoscan-toggle');
  await page.evaluate(()=>GameHub.release('select'));await tick(60);assert.equal((await prefs()).autoScan,false);await expectSelected('autoscan-toggle');
  pass('GameHub press/release follows the same short-press, sensitivity and matched-release rules');

  for(const heldMs of [100,3000]){
    await setPrefs({autoScan:false,scanSpeedIndex:0,parking:'off',spaceBrake:true,waitForSpeech:false,inputSensitivityIndex:0});
    await freshSettings();await stepTo('autoscan-toggle');
    await page.keyboard.down('Space');await tick(heldMs);
    await focusByPointer('autoscan-toggle');assert.equal((await prefs()).autoScan,true);
    await tick(4000);await expectSelected('autoscan-toggle');
    await page.keyboard.up('Space');await tick(999);await expectSelected('autoscan-toggle');
    await tick(1);assert.notEqual(await selected(),'autoscan-toggle');
  }
  pass('Turning Auto on during a short or long native Step Space hold cancels reverse motion and consumes the release safely');

  await setPrefs({autoScan:true,scanSpeedIndex:0,parking:'off',spaceBrake:true,waitForSpeech:false});
  await freshSettings();await tick(1000);
  const brakeTarget=await selected();assert.notEqual(brakeTarget,'park');
  await tap('Space');assert.equal(await scanState(),'paused');
  await tick(5000);await expectSelected(brakeTarget);
  await expect(page.locator('#settings-scan-status .narbe-scan-status-badge')).toBeHidden();
  await expect(page.locator('#settings-scan-status .narbe-scan-status-badge')).toHaveText('');
  await tap('Space');assert.equal(await scanState(),'running');
  await tick(800);await expectSelected(brakeTarget);await tick(200);assert.notEqual(await selected(),brakeTarget);
  const longTarget=await selected();await page.keyboard.down('Space');await tick(3000);await expectSelected(longTarget);
  await page.keyboard.up('Space');await tick(999);await expectSelected(longTarget);await tick(1);assert.notEqual(await selected(),longTarget);
  pass('Settings Auto uses the shared brake, preserving the choice and resuming after a full interval');

  await freshSettings();await tick(1000);
  const disclosureTarget=await selected(),disclosurePrefs=await prefs();
  await page.locator('#hub-settings summary').click();await tick(0);
  await expect(page.locator('#hub-settings')).toHaveAttribute('open','');
  await page.locator('#extension-recheck').focus();await tick(5000);
  await expectSelected(disclosureTarget);await tap('Space');await tap('Enter');
  await expectSelected(disclosureTarget);assert.deepEqual(await prefs(),disclosurePrefs);
  await page.evaluate(()=>{window.__disclosureVirtualEvents=0;document.addEventListener('keydown',()=>window.__disclosureVirtualEvents++)});
  await virtualTap('scan');await virtualTap('select');await expectSelected(disclosureTarget);
  assert.equal(await page.evaluate(()=>window.__disclosureVirtualEvents),0,'Wrapper actions stay outside a disclosure owned by native controls');
  await page.evaluate(()=>{
    window.__hubDisclosureResumedAt=null;
    document.querySelector('#hub-settings').addEventListener('toggle',()=>{window.__hubDisclosureResumedAt=Date.now()},{once:true});
  });
  await page.locator('#hub-settings summary').click();await tick(1);
  // Native details toggle dispatch is a browser task; measure from its actual
  // dispatch time, allowing the clock to progress while the task settles.
  await expect.poll(async()=>{await tick(1);return page.evaluate(()=>document.activeElement?.id)}).toBe(disclosureTarget);
  const elapsedSinceResume=await page.evaluate(()=>Date.now()-window.__hubDisclosureResumedAt);
  assert.ok(elapsedSinceResume>=0&&elapsedSinceResume<1000);
  await tick(999-elapsedSinceResume);await expectSelected(disclosureTarget);await tick(1);assert.notEqual(await selected(),disclosureTarget);
  pass('Companion and data disclosure owns input while open; Settings resumes its retained choice afterward');

  // A native key can begin outside the disclosure's excluded subtree while
  // the disclosure still owns the page. Its release must not strand a legacy
  // reverse-scan timer when Settings takes ownership again.
  await setPrefs({autoScan:false,waitForSpeech:false});await freshSettings();await tap('Space');await expectSelected('settings-back');
  await page.locator('#hub-settings summary').click();await tick(1);await settings.focus();
  await page.keyboard.down('Space');await tick(100);
  await page.locator('#hub-settings summary').click();await tick(1);
  await page.keyboard.up('Space');await tick(60);await expectSelected('settings-back');
  await tick(7000);await expectSelected('settings-back');
  pass('A native press begun while disclosure owns input cannot leak a legacy reverse timer after it closes');
  await setPrefs({autoScan:true});

  await setPrefs({parking:'chosen'});await freshSettings();await tap('Enter');
  await expectSelected('parked');assert.equal(await scanState(),'parked');
  const parkedPrefs=await prefs();await tap('Space');await expectSelected('parked');
  await tap('Enter');assert.notEqual(await selected(),'park');assert.notEqual(await selected(),'parked');
  assert.deepEqual(await prefs(),parkedPrefs);
  await setPrefs({parking:'auto',loopsBeforeParking:1});await freshSettings();
  const autoChoices=await scanIds();await tick((autoChoices.length+1)*1000);
  await expectSelected('parked');
  pass('Chosen parking resumes without activating; automatic parking counts the full Settings loop');

  // Description speech is captured from the same native speech boundary used
  // by the shared voice manager, with deterministic start/end callbacks.
  await setPrefs({autoScan:false});await freshSettings();
  await page.evaluate(()=>{NarbeVoiceManager.updateSettings({ttsEnabled:true});window.__hubSpeech.length=0});
  await stepTo('autoscan-toggle');await tick(60);
  const modeDescription=(await button('autoscan-toggle').locator('.desc').textContent()).trim();
  assert.ok((await page.evaluate(()=>window.__hubSpeech.map(entry=>entry.text))).some(text=>text.includes(modeDescription)));
  await tap('Enter');await expectSelected('autoscan-toggle');
  await setPrefs({spaceBrake:false,waitForSpeech:true,scanSpeedIndex:0});
  await stepTo('waitspeech-toggle');await tick(60);
  const description=(await button('waitspeech-toggle').locator('.desc').textContent()).trim();
  assert.ok((await page.evaluate(()=>window.__hubSpeech.map(entry=>entry.text))).some(text=>text.includes(description)));
  const waitingItem=await selected();await tick(1000);await expectSelected(waitingItem);
  await tick(400);assert.notEqual(await selected(),waitingItem);
  await page.evaluate(()=>NarbeVoiceManager.updateSettings({ttsEnabled:false}));
  pass('Highlighted controls speak their descriptions; Wait for speech gives completion plus a full scan interval');

  await page.evaluate(()=>NarbeVoiceManager.updateSettings({ttsEnabled:true}));
  await setPrefs({autoScan:true,scanSpeedIndex:0,parking:'off',spaceBrake:true,waitForSpeech:true});
  await freshSettings();
  await page.evaluate(()=>{window.__hubSpeech.length=0;settingsScanner.open(settingsItems());});
  await tick(999);await expectSelected('park');
  assert.ok(!(await page.evaluate(()=>window.__hubSpeech)).some(entry=>/\bpark(?:ed)?\b/i.test(entry.text)));
  await tick(1);await expectSelected('settings-back');
  pass('Parking Off keeps the blank silent and advances after one full interval even with Wait for speech On');

  await setPrefs({parking:'chosen'});
  await freshSettings();await tick(1000);await expectSelected('park');
  await tick(400);await expectSelected('settings-back');
  await page.evaluate(()=>NarbeVoiceManager.updateSettings({ttsEnabled:false}));
  pass('Fresh Settings with chosen parking waits for its park label before the full Auto interval');

  // Settings uses ordinary document scrolling. No section/grid descendant
  // becomes a second scroll viewport, even on mobile or very short windows.
  report.layout=[];
  for(const viewport of [{width:1440,height:1000},{width:390,height:844},{width:480,height:360}]){
    await page.setViewportSize(viewport);
    await setPrefs({autoScan:false,scanSpeedIndex:0,parking:'off',spaceBrake:true,waitForSpeech:false,inputSensitivityIndex:0});
    await freshSettings();await tap('Space');await expectSelected('settings-back');
    const beforeY=await page.evaluate(()=>scrollY);await stepTo('uisize-toggle');
    const geometry=await page.evaluate(()=>{
      const rect=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}};
      const section=document.querySelector('#screen-settings');
      const nested=[section,...section.querySelectorAll('*')].filter(el=>{
        const css=getComputedStyle(el);return ['auto','scroll'].includes(css.overflowY)&&el.scrollHeight>el.clientHeight+1;
      }).map(el=>({tag:el.tagName,id:el.id,className:el.className}));
      return {viewport:{width:innerWidth,height:innerHeight},scrollY,documentHeight:document.scrollingElement.scrollHeight,nested,internalScroll:section.querySelector(':scope > .grid').scrollTop,title:rect(document.querySelector('#uisize-toggle .btn-title')),value:rect(document.querySelector('#uisize-toggle .pill')),active:document.activeElement?.id};
    });
    assert.deepEqual(geometry.nested,[],'Settings must not introduce a nested scrollbar');
    assert.equal(geometry.internalScroll,0,'The Settings grid does not scroll independently');
    assert.ok(geometry.documentHeight>viewport.height,'The ordinary page remains scrollable');
    assert.ok(geometry.scrollY>beforeY,'Scanning to Size scrolls the document');
    assert.equal(geometry.active,'uisize-toggle');
    for(const [label,rect] of [['title',geometry.title],['value',geometry.value]]){
      assert.ok(rect.y>=-1&&rect.bottom<=viewport.height+1,'The selected '+label+' is visible after page scrolling');
      assert.ok(rect.x>=-1&&rect.right<=viewport.width+1,'The selected '+label+' fits the page width');
    }
    for(const id of scanOrder)await expect(button(id)).toBeVisible();
    await page.screenshot({animations:'disabled',path:path.join(artifacts,'page-flow-'+viewport.width+'x'+viewport.height+'.png')});
    await button('autoscan-toggle').focus();await expectSelected('autoscan-toggle');
    await page.screenshot({animations:'disabled',path:path.join(artifacts,'disabled-options-'+viewport.width+'x'+viewport.height+'.png'),fullPage:true});
    report.layout.push(geometry);
  }
  await page.setViewportSize({width:1440,height:1000});
  pass('Settings keeps ordinary page scrolling with no nested scrollbar at desktop, mobile and short-window sizes');

  await setPrefs({autoScan:false,parking:'auto',loopsBeforeParking:3,spaceBrake:false,waitForSpeech:true,scanSpeedIndex:2,inputSensitivityIndex:2});
  await page.screenshot({animations:'disabled',path:path.join(artifacts,'step-settings.png'),fullPage:true});
  await setPrefs({autoScan:true});await button('scan-settings').scrollIntoViewIfNeeded();
  await page.screenshot({animations:'disabled',path:path.join(artifacts,'auto-settings.png'),fullPage:true});
  await setPrefs({autoScan:false});

  const peer=await context.newPage();await peer.goto(base+'/bennyshub/index.html');
  await peer.waitForFunction(()=>window.NarbeScanManager);
  await peer.evaluate(()=>NarbeScanManager.updateSettings({loopsBeforeParking:1,spaceBrake:true,waitForSpeech:false}));
  await expect.poll(async()=>{await tick(0);return (await prefs()).loopsBeforeParking}).toBe(1);
  assert.equal((await prefs()).spaceBrake,true);assert.equal((await prefs()).waitForSpeech,false);
  // A real tool iframe consumes the same central preferences without new controls.
  await page.bringToFront();
  await page.evaluate(()=>{
    const frame=document.createElement('iframe');frame.id='scan-settings-reader';frame.src='/bennyshub/apps/tools/keyboard/index.html';frame.style.cssText='position:absolute;width:20px;height:20px;left:-100px';document.body.append(frame);
  });
  let frame;
  await expect.poll(()=>{frame=page.frames().find(item=>item.url().includes('/apps/tools/keyboard/'));return !!frame}).toBe(true);
  await frame.waitForFunction(()=>window.NarbeScanManager);
  assert.equal(await frame.evaluate(()=>NarbeScanManager.getSettings().loopsBeforeParking),1);
  await setPrefs({parking:'chosen',loopsBeforeParking:2,spaceBrake:false,waitForSpeech:true});
  await expect.poll(()=>frame.evaluate(()=>NarbeScanManager.getSettings().parking)).toBe('chosen');
  for(const id of newControls)assert.equal(await frame.locator('#'+id).count(),0);
  await peer.close();await page.evaluate(()=>document.querySelector('#scan-settings-reader').remove());
  const persisted=await prefs();await page.reload();await dismissWelcome();await enterSettings();
  assert.deepEqual(await prefs(),persisted);await expectSelected('park');
  pass('Settings synchronize across real Hub tabs and a real tool iframe, stay central-only, and survive reload; fresh entry remains blank');

  assert.deepEqual(report.errors,[]);assert.deepEqual(await sourceHashes(),report.sourceHashes,'Runtime sources stayed unchanged during acceptance');report.result='passed';report.savedPreferences=await prefs();
  console.log('Hub Settings acceptance passed.');
})().catch(async error=>{
  report.result='failed';report.failure=error.stack;console.error(error);process.exitCode=1;
  if(page&&!page.isClosed()){
    report.state=await page.evaluate(()=>({activeElement:document.activeElement?.id,settings:window.NarbeScanManager?.getSettings(),screen:document.querySelector('#screen-settings')?.dataset})).catch(()=>null);
    await page.screenshot({animations:'disabled',path:path.join(artifacts,'failure.png'),fullPage:true}).catch(()=>{});
  }
}).finally(async()=>{
  await browser?.close();await fs.mkdir(artifacts,{recursive:true});await fs.writeFile(path.join(artifacts,'browser-report.json'),JSON.stringify(report,null,2));
});
