const {chromium,expect}=require('@playwright/test');
const path=require('node:path'),fs=require('node:fs/promises');
const root=path.resolve(__dirname,'..'),base=process.env.HUB_TEST_ORIGIN||'http://127.0.0.1:4173';
let context;
(async()=>{
  const artifacts=path.join(root,'artifacts');await fs.mkdir(artifacts,{recursive:true});
  const extension=path.join(root,'extension');
  context=await chromium.launchPersistentContext(path.join(artifacts,'exit-profile-'+Date.now()),{channel:'chromium',headless:true,args:['--disable-extensions-except='+extension,'--load-extension='+extension]});
  await context.route('**/___vscode_livepreview_injected_script',r=>r.fulfill({contentType:'application/javascript',body:''}));
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/bennyshub/index.html');await page.locator('#modal-cancel').click();
  await page.waitForFunction(()=>BennyExtension.supports('streaming'));
  await page.locator('[data-target="tools"]').first().click();
  for(const [name,selector] of [['Day Hub','#btnExit'],['Journal','[data-action="exit"]'],['Streaming','#btn-exit']]){
    await page.locator('#tools-grid [data-title="'+name+'"]').click();
    const frame=page.frameLocator('#app-iframe');
    await expect(page.locator('#iframe-container')).toHaveClass(/active/);
    await expect(frame.locator(selector)).toBeVisible({timeout:10000});
    await expect(frame.locator('#companion-required[open]')).toHaveCount(0);
    await frame.locator(selector).click();
    await expect(page.locator('#iframe-container')).not.toHaveClass(/active/);
    await expect(page.locator('#tools-grid')).toBeVisible();
    await expect.poll(()=>page.evaluate(()=>currentScreen)).toBe('tools');
    await page.keyboard.press('Space');
    await expect.poll(()=>page.evaluate(()=>document.activeElement?.closest('.screen')?.id)).toBe('screen-tools');
    console.log(name+': Exit closes iframe, returns to Tools, and Hub scanning resumes.');
  }
  // The connection gate must use the same path when a companion is unavailable.
  await page.locator('#tools-grid [data-title="Streaming"]').click();
  await expect(page.frameLocator('#app-iframe').locator('#btn-exit')).toBeVisible();
  const appFrame=page.frames().find(f=>f.url().includes('/apps/tools/streaming/index.html'));
  const worker=context.serviceWorkers().find(w=>w.url().startsWith('chrome-extension:'));
  await worker.evaluate(()=>chrome.runtime.reload()).catch(()=>{});
  await appFrame.evaluate(()=>BennyExtension.check());
  await page.frameLocator('#app-iframe').locator('#gate-back').click();
  await expect(page.locator('#iframe-container')).not.toHaveClass(/active/);
  await expect(page.locator('#tools-grid')).toBeVisible();
  expect(errors).toEqual([]);console.log('Disconnected tool Back to Hub also returns to Tools.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>context?.close());
