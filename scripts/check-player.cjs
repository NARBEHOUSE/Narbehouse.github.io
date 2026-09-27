const {chromium,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),base=process.env.HUB_TEST_ORIGIN||'http://127.0.0.1:3000';let context;
(async()=>{
  const dir=path.join(root,'artifacts','player-extension-'+Date.now());await fs.cp(path.join(root,'extension'),dir,{recursive:true});
  const manifest=JSON.parse(await fs.readFile(path.join(dir,'manifest.json')));
  // No localhost host permission: reproduce the real Hub tab URL visibility problem.
  manifest.host_permissions=['https://app.plex.tv/*'];await fs.writeFile(path.join(dir,'manifest.json'),JSON.stringify(manifest));
  context=await chromium.launchPersistentContext(path.join(root,'artifacts','player-profile-'+Date.now()),{channel:'chromium',headless:true,args:['--disable-extensions-except='+dir,'--load-extension='+dir]});
  await context.route('**/___vscode_livepreview_injected_script',r=>r.fulfill({contentType:'application/javascript',body:''}));
  await context.route('https://app.plex.tv/**',r=>r.fulfill({contentType:'text/html',body:`<!doctype html><html><head><script>
    window.pageKeys=0;window.startClicks=0;window.resumeClicks=0;window.keyLog=[];
    addEventListener('keydown',e=>{if(e.isTrusted&&['Space','Enter'].includes(e.code))pageKeys++;keyLog.push(e.key);},true);
    </script></head><body><h1>Plex adapter fixture</h1><input id="typing" autofocus><button aria-label="Play" id="start">Play</button><canvas width="640" height="360"></canvas><video muted style="width:640px;height:360px"></video><iframe srcdoc='<input autofocus>'></iframe><script>
    const canvas=document.querySelector('canvas'),ctx=canvas.getContext('2d');setInterval(()=>{ctx.fillStyle='navy';ctx.fillRect(0,0,640,360);},60);
    const video=document.querySelector('video'); // Plex-like unsourced player behind Play and Resume.
    document.querySelector('#start').onclick=()=>{
      window.startClicks++;const dialog=document.createElement('div');dialog.setAttribute('role','dialog');
      const restart=document.createElement('button');restart.textContent='Play from beginning';restart.onclick=()=>{throw Error('Must not restart');};
      const resume=document.createElement('a');resume.href='#resume';resume.textContent='Resume from 12:34';resume.onclick=e=>{e.preventDefault();window.resumeClicks++;dialog.remove();document.querySelector('#start').remove();video.srcObject=canvas.captureStream(15);video.play().catch(()=>{});};
      dialog.append(restart,resume);document.body.append(dialog);
    };
    setTimeout(()=>document.querySelector('#typing').focus(),1800);
    </script></body></html>`}));
  const errors=[];context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
  context.setDefaultTimeout(20000);const hub=await context.newPage();await hub.goto(base+'/bennyshub/index.html');await hub.locator('#modal-cancel').click();await hub.waitForFunction(()=>BennyExtension.supports('streaming'));console.log('Hub connected');
  await hub.evaluate(()=>{NarbeVoiceManager.updateSettings({ttsEnabled:false});NarbeScanManager.updateSettings({scanSpeedIndex:0,inputSensitivityIndex:2,autoScan:false});});
  await hub.locator('[data-target="tools"]').first().click();await hub.locator('#tools-grid [data-title="Streaming"]').click();
  await expect(hub.frameLocator('#app-iframe').locator('#btn-exit')).toBeVisible();
  const frame=hub.frames().find(f=>f.url().includes('/apps/tools/streaming/index.html'));await frame.waitForFunction(()=>BennyExtension.supports('streaming'));
  const next=context.waitForEvent('page');await frame.evaluate(()=>WebStreaming.launch({url:'https://app.plex.tv/desktop/',show:'Synthetic fixture',type:'movies'}));
  const player=await next;await player.waitForURL('https://app.plex.tv/**');await player.waitForSelector('#benny-player-controls');
  const worker=context.serviceWorkers().find(w=>w.url().startsWith('chrome-extension:'));
  assert.equal(await worker.evaluate(async()=>chrome.permissions.contains({origins:['http://127.0.0.1/*']})),false);
  const windows=await worker.evaluate(()=>chrome.windows.getAll());console.log('Playback window states:',windows.map(w=>({type:w.type,state:w.state})));assert.ok(windows.some(w=>w.type==='popup'&&w.state==='fullscreen'));
  await expect.poll(()=>player.evaluate(()=>document.querySelector('video').paused)).toBe(false);assert.equal(await player.evaluate(()=>resumeClicks),1);assert.equal(await player.evaluate(()=>startClicks),1);
  await expect.poll(()=>player.locator('[data-benny-player-view]').count()).toBe(1);
  const fill=await player.locator('video').evaluate(v=>({width:v.getBoundingClientRect().width,height:v.getBoundingClientRect().height,vw:innerWidth,vh:innerHeight}));
  assert.ok(Math.abs(fill.width-fill.vw)<2&&Math.abs(fill.height-fill.vh)<2,'Plex video must fill the window without any switch press');
  await player.mouse.click(80,80);await player.mouse.dblclick(100,100);
  await player.waitForTimeout(1900);await expect.poll(()=>player.evaluate(()=>document.activeElement?.id)).toBe('benny-player-controls');
  assert.equal(await player.locator('iframe').evaluate(f=>f.inert),true);
  const bar=player.locator('#benny-player-controls');await expect(bar).toHaveAttribute('data-selected','play');
  console.log('Scan settings',await worker.evaluate(async origin=>(await chrome.storage.session.get('scan:'+origin))['scan:'+origin],base));
  await player.keyboard.down('Space');await expect(bar).toHaveAttribute('data-selected','return',{timeout:4000});
  await expect(bar).toHaveAttribute('data-selected','fullscreen',{timeout:2600});await expect(bar).toHaveAttribute('data-selected','next',{timeout:2600});await player.keyboard.up('Space');
  await player.waitForTimeout(1200);await expect(bar).toHaveAttribute('data-selected','next');assert.equal(await player.evaluate(()=>pageKeys),0);assert.equal(await player.locator('#typing').inputValue(),'');
  // Mouse focus attempts, page autofocus and an iframe cannot divert switch keys.
  await player.mouse.click(80,80);await player.keyboard.press('Space');await expect(bar).toHaveAttribute('data-selected','fullscreen');assert.equal(await player.locator('#typing').inputValue(),'');
  // The keyboard-only shortcut allows ordinary typing, then resumes control-bar ownership.
  await player.keyboard.press('Alt+Shift+B');await player.locator('#typing').fill('Text');await player.locator('#typing').press('Space');assert.equal(await player.locator('#typing').inputValue(),'Text ');
  await player.keyboard.press('Alt+Shift+B');await expect(bar).toHaveAttribute('data-selected','play');
  // Anti-tremor matches Scan Manager, including releases of filtered presses.
  await hub.evaluate(()=>NarbeScanManager.updateSettings({inputSensitivityIndex:3,autoScan:false}));
  await expect.poll(()=>worker.evaluate(async origin=>(await chrome.storage.session.get('scan:'+origin))['scan:'+origin],base)).toMatchObject({inputSensitivity:300});
  await player.waitForTimeout(1200);await player.keyboard.press('Space');await expect(bar).toHaveAttribute('data-selected','back');
  await player.waitForTimeout(180);await player.keyboard.press('Space');await expect(bar).toHaveAttribute('data-selected','back');
  await player.waitForTimeout(160);await player.keyboard.press('Space');await expect(bar).toHaveAttribute('data-selected','back');
  await player.waitForTimeout(330);await player.keyboard.press('Space');await expect(bar).toHaveAttribute('data-selected','forward');
  await player.keyboard.press('Alt+Shift+B');await player.keyboard.press('Alt+Shift+B');await expect(bar).toHaveAttribute('data-selected','play');
  // One-switch mode parks until Enter, scans one loop, then parks again.
  await hub.evaluate(()=>NarbeScanManager.updateSettings({scanSpeedIndex:0,inputSensitivityIndex:3,autoScan:true}));
  await expect.poll(()=>worker.evaluate(async origin=>(await chrome.storage.session.get('scan:'+origin))['scan:'+origin],base)).toMatchObject({scanInterval:1000,inputSensitivity:300,autoScan:true});
  await expect(bar).toHaveAttribute('data-selected','parked');await player.waitForTimeout(1300);await expect(bar).toHaveAttribute('data-selected','parked');
  await player.keyboard.press('Enter');await expect(bar).toHaveAttribute('data-selected','play');await expect(bar).toHaveAttribute('data-selected','back',{timeout:2000});await expect(bar).toHaveAttribute('data-selected','parked',{timeout:12500});
  await player.keyboard.press('Enter');await expect(bar).toHaveAttribute('data-selected','play');await player.waitForTimeout(320);await player.keyboard.press('Enter');await expect(bar).toHaveAttribute('data-selected','parked');
  assert.equal(await player.locator('video').evaluate(v=>v.paused),true);
  await player.screenshot({path:path.join(root,'artifacts','player-centered-parked.png')});
  // Change back to two switches with a slower repeat interval, while already open.
  await hub.evaluate(()=>NarbeScanManager.updateSettings({scanSpeedIndex:2,autoScan:false}));await expect(bar).toHaveAttribute('data-selected','play');await player.waitForTimeout(400);
  await player.keyboard.down('Space');await expect(bar).toHaveAttribute('data-selected','return',{timeout:4000});await player.waitForTimeout(1200);await expect(bar).toHaveAttribute('data-selected','return');await player.keyboard.up('Space');
  await player.waitForTimeout(320);await player.keyboard.press('Space');await expect(bar).toHaveAttribute('data-selected','play');
  // Return must work even though tabs.get cannot expose the Hub URL.
  for(let i=0;i<9;i++){await player.waitForTimeout(320);await player.keyboard.press('Space');}
  await expect(bar).toHaveAttribute('data-selected','return');await player.waitForTimeout(320);await player.keyboard.press('Enter');await expect.poll(()=>player.isClosed()).toBe(true);
  assert.equal(hub.isClosed(),false);await expect(hub.locator('#iframe-container')).toHaveClass(/active/);
  assert.deepEqual(errors,[]);
  console.log('Player checks passed: popup launch, no Hub host permission, immediate Play/Resume startup, exclusive keys/focus, repeated reverse scan/release, live settings sync, single-switch loop/parking, and Return.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>context?.close());
