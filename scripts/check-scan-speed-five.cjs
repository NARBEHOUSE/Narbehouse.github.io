const {chromium,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),base=process.env.HUB_TEST_ORIGIN||'http://127.0.0.1:4173';
const out=path.resolve(root,process.env.HUB_TEST_ARTIFACTS||'artifacts/scan-speed-five');
const report={checks:[],errors:[]};let browser;
(async()=>{
 await fs.mkdir(out,{recursive:true});
 browser=await chromium.launch({headless:true,executablePath:process.env.HUB_BROWSER_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});
 await context.route('**/*',route=>route.request().url().startsWith(base)||!/^https?:/.test(route.request().url())?route.continue():route.abort());
 const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 await page.clock.install({time:new Date('2026-10-04T12:00:00Z')});await page.clock.pauseAt(new Date('2026-10-04T12:00:01Z'));
 const tick=ms=>page.clock.runFor(ms),tap=async key=>{await page.keyboard.down(key);await tick(1);await page.keyboard.up(key);await tick(70)};
 await page.goto(base+'/bennyshub/index.html',{waitUntil:'domcontentloaded'});
 if(await page.locator('#modal-cancel').isVisible())await page.locator('#modal-cancel').click();await tick(150);
 await page.evaluate(()=>NarbeVoiceManager.updateSettings({ttsEnabled:false}));
 assert.deepEqual(await page.evaluate(()=>NarbeScanManager.getAvailableSpeeds()),[1000,2000,3000,4000,5000]);
 assert.equal(await page.evaluate(()=>NarbeScanManager.getScanInterval()),2000);
 await page.locator('#screen-home [data-target="settings"]').click();await tick(100);
 const speed=page.locator('#scanspeed-toggle');await expect(speed).toBeEnabled();
 for(const ms of [3000,4000,5000,1000,2000]){await speed.click();await tick(70);assert.equal(await page.evaluate(()=>NarbeScanManager.getScanInterval()),ms);await expect(speed).toContainText(ms/1000+' sec');await expect(page.locator('#screen-settings')).toHaveAttribute('data-selected','scanspeed-toggle');}
 report.checks.push('Hub exposes only 1–5 seconds; default2, cycle and stable selection with Auto Off');
 await page.evaluate(()=>NarbeScanManager.setScanSpeedIndex(4));await page.reload({waitUntil:'domcontentloaded'});await tick(100);
 if(await page.locator('#modal-cancel').isVisible())await page.locator('#modal-cancel').click();await tick(100);
 await page.locator('#screen-home [data-target="settings"]').click();await tick(100);
 await expect(speed).toBeEnabled();await expect(speed).toContainText('5 sec');
 assert.equal(await page.evaluate(()=>NarbeScanManager.getSettings().autoScan),false);
 report.checks.push('Stored five-second value survives reload and remains enabled in Step');
 const settings=page.locator('#screen-settings');await tap('Space');const first=await settings.getAttribute('data-selected');
 await page.keyboard.down('Space');await tick(3000);assert.equal(await settings.getAttribute('data-selected'),'park');
 await tick(4999);assert.equal(await settings.getAttribute('data-selected'),'park');await tick(1);assert.notEqual(await settings.getAttribute('data-selected'),'park');
 await page.keyboard.up('Space');await tick(70);assert.notEqual(await settings.getAttribute('data-selected'),first);
 report.checks.push('Native three-second reverse hold repeats at the chosen five-second interval');
 await page.screenshot({path:path.join(out,'hub-five-seconds.png')});
 await page.goto(base+'/bennyshub/apps/tools/phraseboard/index.html',{waitUntil:'domcontentloaded'});await tick(200);
 await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:'Scan Settings',exact:true}).click();
 for(const seconds of [1,2,3,4,5]){await page.getByRole('button',{name:/Speed: [1-5]s/}).click();await tick(70);assert.equal(await page.evaluate(()=>NarbeScanManager.getScanInterval()),seconds*1000);assert.equal(await page.evaluate(()=>state.scanSpeed),seconds*1000);await expect(page.locator('body')).toHaveAttribute('data-choice-selected','Speed:0');}
 await page.screenshot({path:path.join(out,'phraseboard-five-seconds.png')});report.checks.push('Phraseboard local speed cycles all five values, syncs its native interval and retains Speed selection');
 assert.deepEqual(report.errors,[]);report.result='passed';report.browser=browser.version();
 for(const file of ['bennyshub/shared/scan-manager.js','bennyshub/apps/tools/phraseboard/index.html']){report.hashes??={};report.hashes[file]=crypto.createHash('sha256').update(await fs.readFile(path.join(root,file))).digest('hex');}
 console.log('PASS '+report.checks.length);
})().catch(e=>{report.result='failed';report.failure=e.stack;console.error(e);process.exitCode=1}).finally(async()=>{await browser?.close();await fs.writeFile(path.join(out,'browser-report.json'),JSON.stringify(report,null,2)+'\n')});
