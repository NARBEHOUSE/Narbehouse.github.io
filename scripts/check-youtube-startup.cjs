const {chromium,expect}=require('@playwright/test'),path=require('node:path'),assert=require('node:assert/strict');
let browser;
(async()=>{
  browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[],external=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().startsWith('https:'))external.push(r.url());});
  await page.context().route('https://www.youtube.com/iframe_api',r=>r.fulfill({contentType:'application/javascript',body:'window.onYouTubeIframeAPIReady?.();'}));
  await page.context().route('https://challenges.cloudflare.com/turnstile/**',r=>r.fulfill({contentType:'application/javascript',body:`window.turnstile={render(node,opts){if(opts.size!=='normal'||opts.execution!=='execute')throw Error('Invalid Turnstile options');window.testTokenCallback=opts.callback;return 'test-widget';},execute(){window.testTokenCallback('fixture-token');}};window.bennyTurnstileReady();`}));
  await page.goto('http://127.0.0.1:4173/bennyshub/apps/tools/ytsearch/index.html');
  await page.waitForFunction(()=>window.narbe&&window.__ts?.ready&&window.youTubeAPIReady);
  await expect(page.locator('dialog[open]')).toHaveCount(0);await expect(page.locator('#privacy-choice,.privacy-link')).toHaveCount(0);assert.equal(external.length,2);
  assert.equal(await page.evaluate(()=>localStorage.getItem('benny-web:v1:youtube.privacy-2026-09')),null);
  await page.reload();await page.waitForFunction(()=>window.narbe&&window.__ts?.ready);await expect(page.locator('dialog[open]')).toHaveCount(0);
  await page.goto('http://127.0.0.1:4173/bennyshub/index.html#companion=home');
  await page.evaluate(()=>{NarbeScanManager.updateSettings({autoScan:false,inputSensitivityIndex:3});NarbeVoiceManager.updateSettings({ttsEnabled:false});});
  await page.locator('#mini-footer .mini-footer-bar').click();
  await expect(page.locator('#mini-footer a[href="https://www.youtube.com/t/terms"]')).toBeVisible();
  await expect(page.locator('#mini-footer a[href="https://policies.google.com/privacy"]').first()).toBeVisible();
  await page.locator('#mini-footer .mini-footer-bar').click();await page.locator('[data-target="tools"]').first().click();
  async function open(){
    await page.locator('#tools-grid [data-title="YouTube Search"]').click();
    await expect.poll(()=>page.frames().some(f=>f.url().includes('/ytsearch/'))).toBe(true);
    const frame=page.frames().find(f=>f.url().includes('/ytsearch/'));await frame.waitForFunction(()=>window.narbe);await page.waitForTimeout(600);return frame;
  }
  let frame=await open();await expect(frame.locator('dialog[open]')).toHaveCount(0);
  const initial=await frame.evaluate(()=>scanningManager.currentRowIndex);
  assert.equal(initial,-1);
  await page.keyboard.press('Enter');assert.equal(await frame.evaluate(()=>scanningManager.currentRowIndex),-1);
  await page.waitForTimeout(350);await page.keyboard.press('Space');assert.equal(await frame.evaluate(()=>scanningManager.currentRowIndex),0);
  await page.waitForTimeout(350);await page.keyboard.press('Space');assert.equal(await frame.evaluate(()=>scanningManager.currentRowIndex),1);
  await page.waitForTimeout(350);await page.keyboard.press('Enter');assert.equal(await frame.evaluate(()=>scanningManager.mode),'KEYS');
  await page.locator('#iframe-back').click();
  await page.context().route('https://www.youtube.com/iframe_api',r=>r.abort());
  frame=await open();await expect(frame.locator('#startup-error')).toBeVisible();await expect(frame.locator('#startup-back')).not.toBeFocused();
  await expect(frame.locator('#startup-error button')).toHaveCount(1);await expect(frame.locator('#startup-error a')).toHaveCount(0);
  await page.keyboard.press('Enter');await expect(frame.locator('#startup-error')).toBeVisible();await expect(page.locator('#iframe-container')).toHaveClass(/active/);
  await page.waitForTimeout(350);await page.keyboard.press('Space');await expect(frame.locator('#startup-back')).toBeFocused();await page.waitForTimeout(350);await page.keyboard.press('Enter');await expect(page.locator('#iframe-container')).not.toHaveClass(/active/);
  assert.deepEqual(errors,[]);console.log('YouTube opens immediately on first visit/reload and in Hub; Space/Enter scan the app, footer policy links remain, and loading errors have a single switch-accessible exit. External SDKs mocked.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>browser?.close());
