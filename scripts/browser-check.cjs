const {chromium}=require('@playwright/test');const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),base='http://127.0.0.1:4173',artifacts=path.join(root,'artifacts');
const errors=[];let context,browser;
async function watch(page){page.on('pageerror',e=>errors.push({page:page.url(),error:e.message}));}
async function ready(page){await page.waitForFunction(()=>window.BennyExtension?.state.connected,{timeout:15000});}
(async()=>{
  await fs.mkdir(artifacts,{recursive:true});
  browser=await chromium.launch({headless:true});const plain=await browser.newPage({viewport:{width:1365,height:900}});await watch(plain);
  await plain.goto(base+'/bennyshub/index.html');await plain.waitForTimeout(2200);
  console.log('Without extension:',await plain.locator('#extension-status').textContent());
  await plain.locator('#modal-cancel').click();await plain.locator('[data-target="tools"]').first().click();assert.equal(await plain.locator('#tools-grid .app-btn').count(),3);
  await plain.screenshot({path:path.join(artifacts,'tools-without-extension.png')});
  await plain.goto(base+'/bennyshub/apps/tools/streaming/index.html');await plain.locator('#companion-required').waitFor({state:'visible'});assert.equal(await plain.locator('#companion-required').isVisible(),true);await browser.close();browser=null;
  // The isolated test package grants ONLY the local fixture up front. Production
  // keeps streaming hosts optional and requests them through options clicks.
  const testExtension=path.join(artifacts,'test-extension-'+Date.now());await fs.cp(path.join(root,'extension'),testExtension,{recursive:true});
  const manifest=JSON.parse(await fs.readFile(path.join(testExtension,'manifest.json'),'utf8'));manifest.host_permissions=['http://127.0.0.1/*'];await fs.writeFile(path.join(testExtension,'manifest.json'),JSON.stringify(manifest));
  context=await chromium.launchPersistentContext(path.join(artifacts,'test-profile-'+Date.now()),{channel:'chromium',headless:true,viewport:{width:1365,height:900},args:['--disable-extensions-except='+testExtension,'--load-extension='+testExtension]});
  let worker=context.serviceWorkers()[0];if(!worker)worker=await context.waitForEvent('serviceworker');
  console.log('Extension worker loaded:',worker.url());
  await new Promise(resolve=>setTimeout(resolve,1500));

  await worker.evaluate(async()=>{await chrome.scripting.registerContentScripts([{id:'fixture',matches:['http://127.0.0.1/bennyshub/test-player.html'],js:['player-view.js','player-adapters.js','player-content.js'],runAt:'document_idle'}]);});
  const options=await context.newPage();await watch(options);await options.goto(new URL('options.html',worker.url()).href);await options.waitForSelector('[data-service="youtube"]');assert.equal(await options.locator('[data-service]').count(),10);await options.screenshot({path:path.join(artifacts,'companion-settings.png')});await options.close();
  const hub=await context.newPage();await watch(hub);await hub.goto(base+'/bennyshub/index.html');await ready(hub);await hub.locator('#modal-cancel').click();await hub.locator('[data-target="tools"]').first().click();await hub.waitForFunction(()=>document.querySelectorAll('#tools-grid .app-btn').length>3);
  console.log('With extension:',await hub.locator('#extension-status').textContent());
  assert.equal(await hub.locator('#hub-settings').getAttribute('open'),null);
  await hub.keyboard.press('Space');assert.equal(await hub.evaluate(()=>!!document.activeElement.closest('#hub-settings')),false);
  await hub.locator('#hub-settings summary').focus();await hub.keyboard.press('Space');assert.equal(await hub.locator('#hub-settings').evaluate(el=>el.open),true);
  await hub.waitForTimeout(500); // Respect the default input debounce between switch presses.
  await hub.keyboard.press('Space');assert.equal(await hub.locator('#hub-settings').evaluate(el=>el.open),false);await hub.locator('#hub-settings summary').blur();
  await hub.screenshot({path:path.join(artifacts,'tools-with-extension.png')});
  const toolsPage=await context.newPage();await watch(toolsPage);
  for(const app of ['streaming','dayhub','journal']){
    await toolsPage.goto(base+'/bennyshub/apps/tools/'+app+'/index.html');await ready(toolsPage);await toolsPage.waitForTimeout(500);assert.equal(await toolsPage.locator('#companion-required[open]').count(),0);console.log('Opened tool:',app);
    if(app==='streaming'){
      await toolsPage.waitForFunction(()=>allData.length===0);await toolsPage.locator('#btn-browse').click();assert.ok(await toolsPage.locator('#items-grid .card').count());await toolsPage.screenshot({path:path.join(artifacts,'streaming.png')});
      const denied=await toolsPage.evaluate(()=>BennyExtension.request('OPEN_STREAM',{url:'https://www.youtube.com/watch?v=test'}).then(()=>false,e=>e.message));assert.match(denied,/Enable this streaming service/);
    }
    if(app==='dayhub'){assert.match(await toolsPage.locator('#weatherLocationLine').textContent(),/choose a location/);await toolsPage.locator('#btnSettings').click();assert.equal(await toolsPage.locator('#settingsLat').inputValue(),'');await toolsPage.screenshot({path:path.join(artifacts,'dayhub-settings.png')});}
    if(app==='journal'){
      await toolsPage.evaluate(()=>BennyData.set('journal.entries',[{id:1,date:new Date().toISOString(),question:'Test question',answer:'<img src=x onerror=alert(1)> plain text'}]));await toolsPage.reload();await ready(toolsPage);await toolsPage.locator('[data-action="entries"]').first().click();assert.equal(await toolsPage.locator('.entry-item img').count(),0);assert.match(await toolsPage.locator('.entry-preview').textContent(),/plain text/);assert.equal(await toolsPage.evaluate(()=>BennyData.get('journal.entries',[]).length),1);await toolsPage.screenshot({path:path.join(artifacts,'journal.png')});
    }
  }
  await toolsPage.close();
  await hub.evaluate(()=>NarbeScanManager.updateSettings({autoScan:false,inputSensitivityIndex:0}));
  const playerPromise=context.waitForEvent('page');await hub.evaluate(()=>BennyExtension.request('OPEN_STREAM',{url:location.origin+'/bennyshub/test-player.html',settings:{tts:false}}));const player=await playerPromise;await watch(player);await player.waitForLoadState();await player.waitForSelector('#benny-player-controls');await player.locator('video').evaluate(v=>v.pause());await player.bringToFront();await player.keyboard.press('Enter');await player.waitForTimeout(400);

  assert.equal(await player.locator('video').evaluate(v=>v.paused),false);await player.screenshot({path:path.join(artifacts,'player-controls.png')});
  await player.evaluate(()=>{const button=document.createElement('button');button.id='native-fullscreen-test';button.textContent='Native fullscreen';button.onclick=()=>document.querySelector('video').requestFullscreen();document.body.prepend(button);});
  await player.keyboard.press('Alt+Shift+B');await player.locator('#native-fullscreen-test').click();await player.keyboard.press('Alt+Shift+B');await player.waitForTimeout(300);assert.equal(await player.evaluate(()=>document.fullscreenElement?.tagName),'VIDEO');assert.equal(await player.locator('#benny-player-controls').evaluate(el=>el.matches(':popover-open')),true);await player.screenshot({path:path.join(artifacts,'native-fullscreen-controls.png')});await player.evaluate(()=>document.exitFullscreen());
  await player.keyboard.press('Alt+Shift+B');
  await player.locator('#typing').fill('Text');await player.locator('#typing').press('Space');assert.equal(await player.locator('#typing').inputValue(),'Text ');
  await player.keyboard.press('Alt+Shift+B');for(let i=0;i<9;i++){await player.keyboard.press('Space');await player.waitForTimeout(80);}await player.keyboard.press('Enter');await player.waitForEvent('close',{timeout:5000}).catch(()=>{if(!player.isClosed())throw Error('Return to Hub did not close the managed player');});
  console.log('Player: actual injected toolbar play and return passed.');
  const pwa=await hub.evaluate(async()=>{const registration=await navigator.serviceWorker.ready;return {scope:registration.scope,cache:await caches.keys()};});console.log('PWA:',pwa);
  assert.ok(pwa.cache.includes('benny-web-experiment-v3'));
  await context.setOffline(true);const offline=await context.newPage();await watch(offline);await offline.goto(base+'/bennyshub/apps/tools/journal/index.html');await ready(offline);await offline.locator('[data-action="entries"]').first().click();assert.match(await offline.locator('.entry-preview').textContent(),/plain text/);await offline.close();await context.setOffline(false);console.log('Journal reload and saved entries work offline.');
  // Invalidating the real extension context must immediately remove dependent cards.
  await worker.evaluate(()=>chrome.runtime.reload()).catch(()=>{});
  await hub.evaluate(()=>BennyExtension.check());assert.equal(await hub.evaluate(()=>BennyExtension.state.connected),false);assert.equal(await hub.locator('#tools-grid .app-btn').count(),3);
  console.log('Invalidated companion context hides the three dependent cards.');

  await fs.writeFile(path.join(artifacts,'browser-errors.json'),JSON.stringify(errors,null,2));assert.deepEqual(errors,[]);
  console.log('Browser checks passed. Screenshots saved in artifacts/.');
})().catch(async e=>{console.error(e);console.error('Page errors:',errors);process.exitCode=1;}).finally(async()=>{await context?.close();await browser?.close();});
