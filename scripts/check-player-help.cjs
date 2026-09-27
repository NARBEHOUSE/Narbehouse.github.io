const {chromium,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),base='http://127.0.0.1:4173';let context;
(async()=>{
 const dir=path.join(root,'artifacts','help-extension-'+Date.now());await fs.cp(path.join(root,'extension'),dir,{recursive:true});
 const manifest=JSON.parse(await fs.readFile(path.join(dir,'manifest.json')));manifest.host_permissions=['https://www.netflix.com/*'];await fs.writeFile(path.join(dir,'manifest.json'),JSON.stringify(manifest));
 const script=path.join(dir,'player-content.js');await fs.writeFile(script,(await fs.readFile(script,'utf8')).replace("mode:'closed'","mode:'open'").replace('speechSynthesis.speak(u);','host.dataset.spoken=u.text;'));
 context=await chromium.launchPersistentContext(path.join(root,'artifacts','help-profile-'+Date.now()),{channel:'chromium',headless:true,args:['--disable-extensions-except='+dir,'--load-extension='+dir]});
 const errors=[];context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
 await context.route('https://www.netflix.com/**',r=>r.fulfill({contentType:'text/html',body:`<!doctype html><body><canvas width="320" height="180"></canvas><video muted></video><script>const c=document.querySelector('canvas');c.getContext('2d').fillRect(0,0,320,180);const v=document.querySelector('video');v.srcObject=c.captureStream(10);v.play();</script></body>`}));
 const hub=await context.newPage();await hub.goto(base+'/bennyshub/index.html');await hub.locator('#modal-cancel').click();await hub.waitForFunction(()=>BennyExtension.supports('streaming'));
 await hub.evaluate(()=>{NarbeVoiceManager.updateSettings({ttsEnabled:false});NarbeScanManager.updateSettings({autoScan:false,inputSensitivityIndex:0});});
 async function open(autoScan=false){
  await hub.bringToFront();await hub.evaluate(autoScan=>NarbeScanManager.updateSettings({autoScan,scanSpeedIndex:0,inputSensitivityIndex:0}),autoScan);
  const worker=context.serviceWorkers().find(w=>w.url().startsWith('chrome-extension:'));await expect.poll(()=>worker.evaluate(async origin=>(await chrome.storage.session.get('scan:'+origin))['scan:'+origin]?.autoScan,base)).toBe(autoScan);
  await hub.locator('[data-target="tools"]').first().click();await hub.locator('#tools-grid [data-title="Streaming"]').click();
  const event=context.waitForEvent('page');await hub.evaluate(autoScan=>BennyExtension.request('OPEN_STREAM',{url:'https://www.netflix.com/watch/fixture',settings:{tts:false,autoScan,inputSensitivity:0,scanInterval:1000}}),autoScan);
  const player=await event;await player.locator('#benny-player-controls').waitFor();await player.bringToFront();await expect.poll(()=>player.locator('video').evaluate(v=>v.paused)).toBe(false);return player;
 }
 let player=await open(),bar=player.locator('#benny-player-controls');
 await expect(bar.locator('button:visible').last()).toHaveText('Return to Hub');
 await bar.getByRole('button',{name:'Help & shortcuts',exact:true}).click();
 await expect(bar).toHaveAttribute('data-menu','help');await expect(bar.locator('button:visible')).toHaveCount(5);await expect.poll(()=>player.locator('video').evaluate(v=>v.paused)).toBe(true);
 // An explicit communication request speaks despite muted scanning labels.
 await player.waitForTimeout(100);await player.keyboard.press('Enter');await expect(bar).toHaveAttribute('data-spoken','I need help');
 await player.waitForTimeout(1200);assert.equal(await player.locator('video').evaluate(v=>v.paused),true);
 await bar.getByRole('button',{name:'Back to video',exact:true}).click();await expect(bar).toHaveAttribute('data-menu','player');assert.equal(await player.locator('video').evaluate(v=>v.paused),true);
 await bar.getByRole('button',{name:'Help & shortcuts',exact:true}).click();assert.equal(await player.locator('video').evaluate(v=>v.paused),true);
 await player.keyboard.press('Space');await expect(bar).toHaveAttribute('data-selected','keyboard');await player.waitForTimeout(50);await player.waitForTimeout(100);await player.keyboard.press('Enter');await expect.poll(()=>player.isClosed()).toBe(true);
 await expect(hub.locator('#app-iframe')).toHaveAttribute('src','apps/tools/keyboard/index.html');await expect(hub.locator('#iframe-container')).toHaveClass(/active/);
 await expect.poll(()=>context.pages().filter(p=>p.url().startsWith(base+'/bennyshub/')).length).toBe(1);
 // Exit keyboard using its normal Hub container and launch another stream.
 await hub.locator('#iframe-back').click();await hub.locator('#screen-tools .backbtn').click();
 player=await open();bar=player.locator('#benny-player-controls');await bar.getByRole('button',{name:'Help & shortcuts',exact:true}).click();await bar.getByRole('button',{name:'Open phrase board',exact:true}).click();await expect.poll(()=>player.isClosed()).toBe(true);await expect(hub.locator('#app-iframe')).toHaveAttribute('src','apps/tools/phraseboard/index.html');
 await hub.locator('#iframe-back').click();await hub.locator('#screen-tools .backbtn').click();
 player=await open(true);bar=player.locator('#benny-player-controls');await bar.getByRole('button',{name:'Help & shortcuts',exact:true}).click();
 await expect(bar).toHaveAttribute('data-selected','parked');await player.waitForTimeout(100);await player.keyboard.press('Enter');await expect(bar).toHaveAttribute('data-selected','say-help');await player.waitForTimeout(50);await player.waitForTimeout(100);await player.keyboard.press('Enter');
 await expect(bar).toHaveAttribute('data-spoken','I need help');await expect(bar).toHaveAttribute('data-selected','parked');
 await player.waitForTimeout(100);await player.keyboard.press('Enter');await expect(bar).toHaveAttribute('data-selected','say-help');await expect(bar).toHaveAttribute('data-selected','parked',{timeout:7000});
 await bar.getByRole('button',{name:'Hub main menu',exact:true}).click();await expect.poll(()=>player.isClosed()).toBe(true);
 await expect(hub.locator('#screen-home')).toHaveClass(/active/);await expect(hub.locator('#iframe-container')).not.toHaveClass(/active/);await expect(hub.locator('#app-iframe')).toHaveAttribute('src','about:blank');
 assert.equal(context.pages().filter(p=>p.url().startsWith(base+'/bennyshub/')).length,1);
 // Initial page load also honors a fixed shortcut, e.g. when the old Hub closed.
 await hub.goto(base+'/bennyshub/index.html#companion=keyboard');await expect(hub.locator('#app-iframe')).toHaveAttribute('src','apps/tools/keyboard/index.html');await expect(hub.locator('#fullscreen-modal')).toHaveClass(/hidden/);
 assert.deepEqual(errors,[]);
 console.log('Help: idempotent pause, explicit speech with scan TTS off, one/two switches, loop parking, direct keyboard/phrase board, direct home, reused Hub and fresh-load shortcut passed.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>context?.close());
