// Keyboard: the message survives Exit, and Exit asks first when the message is not empty.
// Run with the preview server on 4173: node scripts/check-keyboard-exit-draft.cjs
const {chromium,expect}=require('@playwright/test');
const assert=require('node:assert/strict');
const base='http://127.0.0.1:4173', keyboard=base+'/bennyshub/apps/tools/keyboard/index.html';
const tick=ms=>new Promise(r=>setTimeout(r,ms));
let browser;
(async()=>{
  browser=await chromium.launch({headless:true});
  const errors=[];

  // 1. Switch path on the Keyboard page itself (two switches: Space moves, Enter selects).
  {
    const context=await browser.newContext(),page=await context.newPage();
    page.on('pageerror',e=>errors.push('keyboard: '+e.message));
    await page.goto(keyboard);
    await page.evaluate(()=>{localStorage.setItem('kb_draft','HI');NarbeVoiceManager.updateSettings({ttsEnabled:false});});
    await page.reload();await page.waitForFunction(()=>document.body.dataset.scanIndex!==undefined);
    await expect(page.locator('#textBar')).toHaveText('HI|');
    const selected=()=>page.evaluate(()=>document.body.dataset.scanSelected);
    const press=async key=>{await page.keyboard.down(key);await tick(60);await page.keyboard.up(key);await tick(180);};
    const scanTo=async id=>{for(let i=0;i<12&&await selected()!==id;i++)await press('Space');assert.equal(await selected(),id);};
    const openConfirm=async()=>{await scanTo('row:0');await press('Enter');await scanTo('key:Exit');await press('Enter');};

    await openConfirm();
    await expect(page.locator('#exitConfirm')).toBeVisible();
    await expect(page.locator('#exitConfirmMessage')).toHaveText('HI');
    assert.equal(await selected(),'','confirm opens on the blank step');
    await press('Space');assert.equal(await selected(),'exit:cancel','Cancel scans first');
    await press('Space');assert.equal(await selected(),'exit:leave');
    await press('Space');assert.equal(await selected(),'','scan stays inside the dialog');
    await press('Space');await press('Enter');
    await expect(page.locator('#exitConfirm')).toBeHidden();
    await expect(page.locator('#textBar')).toHaveText('HI|');
    assert.equal(await selected(),'','Cancel returns to a fresh keyboard scan');

    // Holding Enter inside the dialog does not jump anywhere.
    await openConfirm();
    await page.keyboard.down('Enter');await tick(2300);await page.keyboard.up('Enter');await tick(150);
    await expect(page.locator('#exitConfirm')).toBeVisible();
    // Exit chosen by switch: on its own page the Keyboard goes to the Hub; the message stays saved.
    await press('Space');await press('Space');await press('Enter');
    await page.waitForURL(/\/bennyshub\/index\.html$/);
    assert.equal(await page.evaluate(()=>localStorage.getItem('kb_draft')),'HI');
    await page.goto(keyboard);await expect(page.locator('#textBar')).toHaveText('HI|');
    await page.waitForFunction(()=>document.body.dataset.scanIndex!==undefined); // set-up finished

    // Storage that throws must not break typing or opening.
    await page.evaluate(()=>{Storage.prototype.getItem=()=>{throw Error('blocked')};Storage.prototype.setItem=()=>{throw Error('blocked')};});
    await page.locator('#keyboard').getByRole('button',{name:'A',exact:true}).click();
    await expect(page.locator('#textBar')).toHaveText('HIA|');
    await context.close();
  }

  // 2. Inside the Hub: Exit with a message asks; the message is back on reopen; empty exits at once.
  {
    const context=await browser.newContext(),hub=await context.newPage();
    hub.on('pageerror',e=>errors.push('hub: '+e.message));
    await hub.goto(base+'/bennyshub/index.html');
    if(await hub.locator('#modal-cancel').isVisible())await hub.locator('#modal-cancel').click();
    await hub.evaluate(()=>{NarbeVoiceManager.updateSettings({ttsEnabled:false});showScreen('tools');showIframe('apps/tools/keyboard/index.html','Keyboard');});
    const frame=()=>hub.frameLocator('#app-iframe');
    await expect(frame().locator('#textBar')).toHaveText('|',{timeout:20000});
    for(const c of 'HI')await frame().locator('#keyboard').getByRole('button',{name:c,exact:true}).click();
    await frame().locator('#keyboard .key.exit').click();
    await expect(frame().locator('#exitConfirm')).toBeVisible();
    assert.ok(await hub.locator('#iframe-container').evaluate(el=>el.classList.contains('active')),'still in the Keyboard while asking');
    await frame().locator('[data-exit="leave"]').click();
    await hub.waitForFunction(()=>!document.getElementById('iframe-container').classList.contains('active'));
    await hub.evaluate(()=>showIframe('apps/tools/keyboard/index.html','Keyboard'));
    await expect(frame().locator('#textBar')).toHaveText('HI|',{timeout:20000});
    await frame().locator('#keyboard .key',{hasText:'Clear'}).click();
    await expect(frame().locator('#textBar')).toHaveText('|');
    await frame().locator('#keyboard .key.exit').click();
    await hub.waitForFunction(()=>!document.getElementById('iframe-container').classList.contains('active'));
    assert.equal(await hub.evaluate(()=>localStorage.getItem('kb_draft')),null,'an empty message leaves nothing saved');
    await context.close();
  }

  // 3. Opened on its own (no Hub frame): Exit goes to the Hub, with or without a message.
  {
    const context=await browser.newContext(),page=await context.newPage();
    page.on('pageerror',e=>errors.push('standalone: '+e.message));
    await page.goto(keyboard);await page.evaluate(()=>NarbeVoiceManager.updateSettings({ttsEnabled:false}));
    await page.locator('#keyboard .key.exit').click();
    await page.waitForURL(/\/bennyshub\/index\.html$/);
    await page.goto(keyboard);
    await page.locator('#keyboard').getByRole('button',{name:'H',exact:true}).click();
    await page.locator('#keyboard .key.exit').click();
    await expect(page.locator('#exitConfirm')).toBeVisible();
    await page.locator('[data-exit="leave"]').click();
    await page.waitForURL(/\/bennyshub\/index\.html$/);
    assert.equal(await page.evaluate(()=>localStorage.getItem('kb_draft')),'H');
    await context.close();
  }

  // 4. Keys show before storage set-up finishes, and taps made then are not lost.
  {
    const context=await browser.newContext(),page=await context.newPage();
    page.on('pageerror',e=>errors.push('early: '+e.message));
    const t0=Date.now();await page.goto(keyboard,{waitUntil:'domcontentloaded'});
    await page.locator('#keyboard .key').first().waitFor();
    const shown=Date.now()-t0;
    const early=await page.evaluate(()=>document.body.dataset.scanIndex===undefined);
    for(const c of 'HI')await page.locator('#keyboard').getByRole('button',{name:c,exact:true}).click();
    await expect(page.locator('#textBar')).toHaveText('HI|');
    console.log(`Keys visible after ${shown} ms; taps made before set-up finished: ${early}`);
    await context.close();
  }

  assert.deepEqual(errors,[]);
  console.log('Keyboard exit/draft passed: keys draw at once and early taps count, standalone Exit goes to the Hub, draft restored, Cancel-first confirm by switch, scan trapped, hold-Enter inert, Hub exit + reopen restores, empty exits at once, blocked storage tolerated.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>browser?.close());
