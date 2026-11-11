// Hub first visit: "1 switch (auto scan)" or "2 switches", only when no scan setting was ever saved.
// Run with the preview server on 4173: node scripts/check-hub-switch-choice.cjs
const {chromium,expect}=require('@playwright/test');
const assert=require('node:assert/strict');
const hubUrl='http://127.0.0.1:4173/bennyshub/index.html';
const tick=ms=>new Promise(r=>setTimeout(r,ms));
let browser;
(async()=>{
  browser=await chromium.launch({headless:true});
  const errors=[];
  async function open(seed){
    const context=await browser.newContext(),page=await context.newPage();
    page.on('pageerror',e=>errors.push(e.message));
    // Record what the voice manager is asked to say, from the very first announcement.
    await page.addInitScript(()=>{window.__spoken=[];let manager;Object.defineProperty(window,'NarbeVoiceManager',{configurable:true,get:()=>manager,set(v){manager=v;if(v&&v.speak){const original=v.speak.bind(v);v.speak=(t,o)=>{window.__spoken.push(String(t));return original(t,o);};}}});});
    if(seed)await context.addInitScript(seed=>{if(!sessionStorage.getItem('seeded')){sessionStorage.setItem('seeded','1');for(const [k,v] of Object.entries(seed))localStorage.setItem(k,v);}},seed);
    await page.goto(hubUrl);
    return {context,page};
  }
  const selected=page=>page.locator('#fullscreen-modal .modal-content').getAttribute('data-selected');
  const press=async(page,key)=>{await page.keyboard.down(key);await tick(60);await page.keyboard.up(key);await tick(200);};
  const scan=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('narbe-scan-settings')||'null'));

  // 1. Fresh browser, one switch: the choice is scanned by switch and turns Auto Scan on.
  {
    const {context,page}=await open();
    await expect(page.locator('#fullscreen-modal .modal-title')).toHaveText('How many switches do you use?');
    await expect(page.locator('#modal-fullscreen')).toBeHidden();
    await expect(page.locator('#modal-cancel')).toHaveText('2 switches');
    await press(page,'Space');assert.equal(await selected(page),'modal-one-switch','1 switch scans first');
    await press(page,'Space');assert.equal(await selected(page),'modal-cancel');
    await press(page,'Space');await press(page,'Space');assert.equal(await selected(page),'modal-one-switch','scan stays in the prompt');
    await press(page,'Enter');
    await expect(page.locator('#fullscreen-modal')).toBeHidden();
    assert.equal((await scan(page))?.autoScan,true);
    assert.equal(await page.evaluate(()=>NarbeScanManager.getSettings().autoScan),true);
    assert.equal(await page.evaluate(()=>localStorage.getItem('narbe-hub-switch-choice')),'1');
    // Next visit: the ordinary fullscreen prompt, never the choice again.
    await page.reload();
    await expect(page.locator('#fullscreen-modal .modal-title')).toHaveText('Use Fullscreen for the Best Experience');
    await expect(page.locator('#modal-one-switch')).toBeHidden();await expect(page.locator('#modal-cancel')).toHaveText('Cancel');
    await context.close();
  }
  // 2. Fresh browser, two switches: nothing changes, and the choice is remembered.
  {
    const {context,page}=await open();
    await tick(300);
    assert.ok((await page.evaluate(()=>window.__spoken)).some(t=>t.startsWith('How many switches')),'the choice is spoken on open');
    await page.locator('#modal-cancel').click();
    await expect(page.locator('#fullscreen-modal')).toBeHidden();
    assert.equal(await scan(page),null,'2 switches saves no scan setting');
    assert.equal(await page.evaluate(()=>NarbeScanManager.getSettings().autoScan),false);
    await page.reload();
    await expect(page.locator('#fullscreen-modal .modal-title')).toHaveText('Use Fullscreen for the Best Experience');
    await context.close();
  }
  // 3. A saved scan setting (e.g. Ben's) never sees the choice and is never changed.
  {
    const saved=JSON.stringify({autoScan:false,scanSpeedIndex:3,inputSensitivityIndex:2,parking:'off',loopsBeforeParking:2,spaceBrake:true,waitForSpeech:false});
    const {context,page}=await open({'narbe-scan-settings':saved});
    await expect(page.locator('#fullscreen-modal .modal-title')).toHaveText('Use Fullscreen for the Best Experience');
    await expect(page.locator('#modal-one-switch')).toBeHidden();
    await page.locator('#modal-cancel').click();
    assert.equal(await page.evaluate(()=>localStorage.getItem('narbe-scan-settings')),saved);
    assert.equal(await page.evaluate(()=>localStorage.getItem('narbe-hub-switch-choice')),null);
    await context.close();
  }
  assert.deepEqual(errors,[]);
  console.log('Hub switch choice passed: first visit only, scanned and spoken, 1 switch turns Auto Scan on, 2 switches keeps defaults, remembered, saved settings untouched.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>browser?.close());
