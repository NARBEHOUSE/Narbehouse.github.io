const {chromium,expect}=require('@playwright/test'),path=require('node:path'),assert=require('node:assert/strict');
let browser;
(async()=>{
  browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[],external=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().startsWith('https:'))external.push(r.url());});
  await page.context().route('https://www.youtube.com/iframe_api',r=>r.fulfill({contentType:'application/javascript',body:'window.onYouTubeIframeAPIReady?.();'}));
  await page.context().route('https://challenges.cloudflare.com/turnstile/**',r=>r.fulfill({contentType:'application/javascript',body:`window.turnstile={render(node,opts){if(opts.size!=='normal'||opts.execution!=='execute')throw Error('Invalid Turnstile options');window.testTokenCallback=opts.callback;return 'test-widget';},execute(){window.testTokenCallback('fixture-token');}};window.bennyTurnstileReady();`}));
  await page.goto('http://127.0.0.1:4173/bennyshub/apps/tools/ytsearch/index.html');
  await expect(page.locator('#privacy-choice')).toBeVisible();assert.equal(external.length,0);
  async function centered(frame){
    const box=await frame.locator('#privacy-choice').evaluate(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,vw:innerWidth,vh:innerHeight};});
    assert.ok(Math.abs(box.x+box.w/2-box.vw/2)<2);assert.ok(Math.abs(box.y+box.h/2-box.vh/2)<2);assert.ok(box.x>=0&&box.y>=0&&box.w<=box.vw&&box.h<=box.vh);
  }
  await centered(page);await page.setViewportSize({width:390,height:844});await centered(page);await page.setViewportSize({width:1280,height:800});
  await page.keyboard.press('Space');await expect(page.locator('#privacy-back')).toBeFocused();
  await page.screenshot({path:path.resolve(__dirname,'../artifacts/youtube-privacy-choice.png')});
  await page.locator('#privacy-accept').focus();await page.waitForTimeout(100);await page.keyboard.press('Enter');
  await page.waitForFunction(()=>window.narbe&&window.__ts?.ready&&window.youTubeAPIReady);await expect(page.locator('#privacy-choice')).not.toBeVisible();assert.equal(external.length,2);
  await page.reload();await page.waitForFunction(()=>window.narbe&&window.__ts?.ready);await expect(page.locator('#privacy-choice')).not.toBeVisible();
  await page.evaluate(()=>localStorage.removeItem('benny-web:v1:youtube.privacy-2026-09'));
  await page.goto('http://127.0.0.1:4173/bennyshub/index.html#companion=home');
  await page.evaluate(()=>{NarbeScanManager.updateSettings({autoScan:false,inputSensitivityIndex:3});NarbeVoiceManager.updateSettings({ttsEnabled:false});});
  await page.locator('[data-target="tools"]').first().click();
  async function open(){
    await page.locator('#tools-grid [data-title="YouTube Search"]').click();
    await expect.poll(()=>page.frames().some(f=>f.url().includes('/ytsearch/'))).toBe(true);
    const frame=page.frames().find(f=>f.url().includes('/ytsearch/'));await frame.locator('#privacy-choice').waitFor();await page.waitForTimeout(600);await centered(frame);return frame;
  }
  let frame=await open();let before=external.length;
  await page.keyboard.press('Space');await expect(frame.locator('#privacy-back')).toBeFocused();
  await page.keyboard.press('Space');await expect(frame.locator('#privacy-back')).toBeFocused();
  await page.waitForTimeout(350);await page.keyboard.press('Enter');await expect(page.locator('#iframe-container')).not.toHaveClass(/active/);assert.equal(external.length,before);
  frame=await open();await page.keyboard.press('Enter');
  await frame.waitForFunction(()=>window.narbe&&window.__ts?.ready);await expect(frame.locator('#privacy-choice')).not.toBeVisible();
  await page.locator('#iframe-back').click();await page.evaluate(()=>{localStorage.removeItem('benny-web:v1:youtube.privacy-2026-09');NarbeScanManager.updateSettings({autoScan:true,scanSpeedIndex:0});});
  frame=await open();await expect(frame.locator('#privacy-back')).toBeFocused({timeout:1800});await page.keyboard.press('Enter');await expect(page.locator('#iframe-container')).not.toHaveClass(/active/);
  // A failed external SDK must leave Back to Hub switch-accessible.
  await page.evaluate(()=>NarbeScanManager.updateSettings({autoScan:false}));
  await page.context().route('https://www.youtube.com/iframe_api',r=>r.abort());
  frame=await open();await page.keyboard.press('Enter');await expect(frame.locator('#privacy-error')).not.toBeEmpty();await expect(frame.locator('#privacy-back')).toBeFocused();await page.waitForTimeout(350);await page.keyboard.press('Enter');await expect(page.locator('#iframe-container')).not.toHaveClass(/active/);
  assert.deepEqual(errors,[]);console.log('YouTube first-use choice blocks external requests until agreement, is centered on desktop/mobile/in the Hub, supports short Space/Enter taps, anti-tremor, auto-scan, back/accept and error recovery, remembers the choice and initializes the app. External SDK responses were mocked.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>browser?.close());
