const {chromium,expect}=require('@playwright/test'),path=require('node:path'),assert=require('node:assert/strict');
let context;
(async()=>{
 const root=path.resolve(__dirname,'..'),extension=path.join(root,'extension'),base='http://127.0.0.1:4173/bennyshub/';
 context=await chromium.launchPersistentContext(path.join(root,'artifacts','settings-return-'+Date.now()),{channel:'chromium',headless:true,args:['--disable-extensions-except='+extension,'--load-extension='+extension]});
 let hub=await context.newPage();await hub.goto(base+'index.html#companion=keyboard');await hub.waitForFunction(()=>BennyExtension.supports('settings-return'));
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
 console.log('Settings/setup reuse the existing Hub and preserve its open keyboard; only settings close. With no Hub open, the current tab becomes the Hub. Credit link verified.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>context?.close());
