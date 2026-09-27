// Test the separately installed journal's real HTML/JS with a synthetic IPC
// boundary. Does not launch Electron or read/write its real journal entries.
const {chromium,expect}=require('@playwright/test'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
let browser;
(async()=>{
  const journal=process.env.BENNY_ELECTRON_JOURNAL;if(!journal)throw Error('Set BENNY_ELECTRON_JOURNAL to the journal folder.');
  const appRoot=path.resolve(journal,'../../..'),hash=async()=>crypto.createHash('sha256').update(await fs.readFile(path.join(journal,'entries.json'))).digest('hex'),before=await hash();
  browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('http://electron-journal.test/**',async route=>{
    const url=new URL(route.request().url());
    if(url.pathname.endsWith('/electron-bridge.js'))return route.fulfill({contentType:'text/javascript',body:`window.electronAPI={journal:{getEntries:async()=>({entries:[{id:1,date:new Date().toISOString(),question:'Test entry',answer:'Synthetic Electron journal data.'}]}),saveEntries:async()=>{throw Error('This check must not save entries');}}};`});
    if(url.pathname.endsWith('/entries.json'))return route.fulfill({json:{entries:[]}});
    const file=path.resolve(appRoot,'.'+url.pathname.replace(/^\/bennyshub/,''));if(!file.startsWith(appRoot+path.sep))return route.abort();
    try{await route.fulfill({body:await fs.readFile(file),contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'})[path.extname(file)]||'application/octet-stream'});}catch{await route.fulfill({status:404,body:'Not found'});}
  });
  await page.goto('http://electron-journal.test/bennyshub/apps/tools/journal/index.html');await page.locator('[data-action="entries"]').click();await expect(page.locator('#entriesList')).toContainText('Synthetic Electron journal data');
  await expect(page.locator('[data-action="next-day"]')).toBeDisabled();await page.locator('[data-action="previous-day"]').click();await expect(page.locator('#entriesList')).toContainText('No entries');await page.locator('[data-action="next-day"]').click();
  await page.locator('[data-action="previous-day"]').click();await page.locator('#entriesScreen [data-action="return-today"]').click();await expect(page.locator('#journalDayContext')).toHaveText('Today');
  await page.locator('.entry-item').click();await expect(page.locator('.entry-paper')).toContainText('Synthetic Electron journal data');await expect(page.locator('#entryViewModal [data-action="return-today"]')).toBeDisabled();await page.locator('[data-action="close-entry-view"]').click();
  await page.evaluate(()=>{window.journalSpeech=[];NarbeVoiceManager.speak=text=>window.journalSpeech.push(text);});
  await page.locator('[data-action="change-view"]').click();await expect(page.locator('.calendar-day[aria-current="date"] .calendar-entry-count')).toHaveText('1');
  await expect.poll(()=>page.evaluate(()=>journalSpeech.at(-1))).toMatch(/^Calendar view\..*1 entry on 1 day\./);
  const press=async key=>{await page.waitForTimeout(350);await page.keyboard.press(key,{delay:160});};
  await press('Space');await press('Space');assert.ok(await page.locator('.calendar-week .highlighted').count()>0);await press('Enter');await expect(page.locator('.calendar-week .highlighted')).toHaveCount(1);
  await page.screenshot({path:path.join(__dirname,'../artifacts/electron-calendar-scan.png')});await press('Enter');await expect(page.locator('#changeViewModal')).toHaveClass(/hidden/);
  assert.deepEqual(errors,[]);assert.equal(await hash(),before);console.log('Electron journal HTML/JS: synthetic IPC load, date navigation, badges and row/day scanning passed. Real entries unchanged; native Electron runtime was not launched.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>browser?.close());
