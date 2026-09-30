const {chromium,expect}=require('@playwright/test'),path=require('node:path'),assert=require('node:assert/strict');
let context,browser;
(async()=>{
 const root=path.resolve(__dirname,'..'),extension=path.join(root,'extension'),base=(process.env.HUB_TEST_ORIGIN||'http://127.0.0.1:4173')+'/bennyshub/';
 const errors=[];
 browser=await chromium.launch({headless:true});
 const plain=await browser.newPage();plain.on('pageerror',e=>errors.push(e.message));
 await plain.goto(base);await plain.locator('#modal-cancel').click();await plain.locator('#hub-settings summary').click();
 await expect(plain.locator('#extension-status')).toHaveText('Not connected');
 await expect(plain.locator('.settings-actions button')).toHaveText(['Check connection','Companion settings','Companion setup','My data']);
 await plain.locator('#extension-recheck').click();await expect(plain.locator('#extension-recheck')).toBeDisabled();
 await expect(plain.locator('#extension-status')).toHaveText('Checking…');
 await expect(plain.locator('#extension-status')).toHaveText('Not connected');
 await expect(plain.locator('#extension-recheck')).toBeEnabled();
 await plain.locator('#extension-settings').focus();await plain.keyboard.press('Enter');
 await expect(plain.locator('#extension-settings')).toBeDisabled();
 await expect(plain.locator('#extension-settings-error')).toContainText('Use Companion setup');
 await expect(plain.locator('#extension-settings')).toBeEnabled();
 assert.equal(plain.context().pages().length,1,'Disconnected settings must explain setup without opening an installation tab');
 for(const [id,route] of [['extension-setup','extension-setup.html'],['personal-data','data-settings.html']]){
   const pending=plain.context().waitForEvent('page');await plain.locator('#'+id).click();const opened=await pending;
   await opened.waitForURL(base+route);assert.equal(await opened.evaluate(()=>window.opener),null);await opened.close();
 }
 for(const width of [320,390,768,1366]){
   await plain.setViewportSize({width,height:900});
   const layout=await plain.locator('.settings-actions button').evaluateAll(buttons=>({width:innerWidth,scroll:document.documentElement.scrollWidth,buttons:buttons.map(button=>{const r=button.getBoundingClientRect();return {left:r.left,right:r.right,height:r.height,excluded:!!button.closest('[data-scan-exclude]')};})}));
   assert.ok(layout.scroll<=layout.width,'Menu must fit viewport at '+width);
   assert.ok(layout.buttons.every(b=>b.left>=0&&b.right<=width&&b.height>=44&&b.excluded),'Buttons must fit, be touch-sized and stay outside switch scanning');
   if(width===390||width===1366)await plain.screenshot({path:path.join(root,'artifacts','companion-menu-'+width+'.png'),fullPage:true});
 }
 await browser.close();browser=null;
 context=await chromium.launchPersistentContext(path.join(root,'artifacts','settings-return-'+Date.now()),{channel:'chromium',headless:true,args:['--disable-extensions-except='+extension,'--load-extension='+extension]});
 let hub=await context.newPage();hub.on('pageerror',e=>errors.push(e.message));
 await hub.goto(base+'index.html');await hub.locator('#modal-cancel').click();await hub.locator('#hub-settings summary').click();
 await expect(hub.locator('#extension-status')).toHaveText('Connected',{timeout:15000});
 // Simulate the extension becoming unavailable after its last successful check.
 await hub.evaluate(()=>{window.originalCompanionRequest=BennyExtension.request;window.settingsRequests=0;BennyExtension.request=async action=>{if(action!=='OPEN_OPTIONS')return originalCompanionRequest(action);settingsRequests++;await new Promise(resolve=>setTimeout(resolve,150));throw Error('Extension unavailable');};});
 await hub.evaluate(()=>{document.getElementById('extension-settings').click();document.getElementById('extension-settings').click();});
 await expect(hub.locator('#extension-settings-error')).toContainText('Could not open Companion settings');
 await expect(hub.locator('#extension-settings')).toBeEnabled();assert.equal(await hub.evaluate(()=>settingsRequests),1);
 await hub.evaluate(()=>{BennyExtension.request=originalCompanionRequest;delete window.originalCompanionRequest;});
 const directPending=context.waitForEvent('page');await hub.locator('#extension-settings').click();const directOptions=await directPending;
 await directOptions.waitForURL('chrome-extension://*/options.html');await expect(directOptions.locator('h1')).toHaveText('Companion settings');
 await expect(hub.locator('#extension-settings-error')).toBeHidden();await expect(hub.locator('#extension-settings')).toBeEnabled();
 await expect(directOptions.locator('#return-hub')).toBeEnabled();await directOptions.locator('#return-hub').click();await expect.poll(()=>directOptions.isClosed()).toBe(true);
 assert.equal(context.pages().filter(p=>p.url().startsWith(base)).length,1,'Direct settings must return to the same Hub');
 await hub.goto(base+'index.html#companion=keyboard');await hub.waitForFunction(()=>BennyExtension.supports('settings-return'));
 await expect(hub.locator('.developer-credit a')).toHaveAttribute('href','https://narbehouse.github.io/');
 const pending=context.waitForEvent('page');await hub.evaluate(()=>BennyExtension.request('OPEN_OPTIONS'));const options=await pending;
 await expect(options.locator('#return-hub')).toBeEnabled();await options.locator('#return-hub').click();await expect.poll(()=>options.isClosed()).toBe(true);
 await expect(hub.locator('#app-iframe')).toHaveAttribute('src','apps/tools/keyboard/index.html');
 let setup=await context.newPage();await setup.goto(base+'extension-setup.html');await setup.waitForFunction(()=>BennyExtension.supports('settings-return'));await setup.locator('#back').click();await expect.poll(()=>setup.isClosed()).toBe(true);
 assert.equal(context.pages().filter(p=>p.url().startsWith(base)).length,1);await expect(hub.locator('#app-iframe')).toHaveAttribute('src','apps/tools/keyboard/index.html');
 await hub.close();setup=await context.newPage();await setup.goto(base+'extension-setup.html');await setup.waitForFunction(()=>BennyExtension.supports('settings-return'));await setup.locator('#back').click();await setup.waitForURL(base);assert.equal(setup.isClosed(),false);
 // With only a setup page open, settings must open a real Hub in its own tab.
 await setup.close();const worker=context.serviceWorkers()[0],optionsURL=new URL('options.html',worker.url()).href;
 const lone=await context.newPage();await lone.goto(optionsURL);await expect(lone.locator('#return-hub')).toBeEnabled();await lone.locator('#return-hub').click();await lone.waitForURL(base);assert.equal(lone.isClosed(),false);
 assert.deepEqual(errors,[]);
 console.log('Companion menu passed: direct extension settings and return; disconnected help; failed request/retry; duplicate-click guard; setup/data destinations; four responsive layouts; scan exclusion; zero browser errors. Existing settings/setup returns preserve the open keyboard and reuse the Hub.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await context?.close();await browser?.close();});
