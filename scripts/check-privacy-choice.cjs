const {chromium,expect}=require('@playwright/test'),path=require('node:path'),assert=require('node:assert/strict');
let browser;
(async()=>{
  browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[],external=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().startsWith('https:'))external.push(r.url());});
  await page.route('https://www.youtube.com/iframe_api',r=>r.fulfill({contentType:'application/javascript',body:'window.onYouTubeIframeAPIReady?.();'}));
  await page.route('https://challenges.cloudflare.com/turnstile/**',r=>r.fulfill({contentType:'application/javascript',body:`window.turnstile={render(node,opts){if(opts.size!=='normal'||opts.execution!=='execute')throw Error('Invalid Turnstile options');window.testTokenCallback=opts.callback;return 'test-widget';},execute(){window.testTokenCallback('fixture-token');}};window.bennyTurnstileReady();`}));
  await page.goto('http://127.0.0.1:4173/bennyshub/apps/tools/ytsearch/index.html');
  await expect(page.locator('#privacy-choice')).toBeVisible();assert.equal(external.length,0);
  await page.keyboard.down('Space');await page.waitForTimeout(100);await page.keyboard.up('Space');await expect(page.locator('#privacy-back')).toBeFocused();
  await page.screenshot({path:path.resolve(__dirname,'../artifacts/youtube-privacy-choice.png')});
  await page.locator('#privacy-accept').focus();await page.waitForTimeout(100);await page.keyboard.down('Enter');await page.waitForTimeout(100);await page.keyboard.up('Enter');
  await page.waitForFunction(()=>window.narbe&&window.__ts?.ready&&window.youTubeAPIReady);await expect(page.locator('#privacy-choice')).not.toBeVisible();assert.equal(external.length,2);
  await page.reload();await page.waitForFunction(()=>window.narbe&&window.__ts?.ready);await expect(page.locator('#privacy-choice')).not.toBeVisible();
  assert.deepEqual(errors,[]);console.log('YouTube first-use choice blocks external requests until agreement, supports Space/Enter, remembers the choice and initializes the app. External SDK responses were mocked.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>browser?.close());
