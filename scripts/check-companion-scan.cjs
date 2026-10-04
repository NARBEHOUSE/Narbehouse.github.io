// Real unpacked-extension integration test. No existing browser profile is used.
// Run: node scripts/check-companion-scan.cjs [--browser-path=C:/.../msedge.exe]
const {chromium, expect}=require('@playwright/test');
const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),artifacts=path.resolve(root,process.env.HUB_TEST_ARTIFACTS||'artifacts/companion-scan');
let context,server,diagnosticPlayer;
const report={checks:[],errors:[]};
const pass=name=>{report.checks.push(name);console.log('PASS '+name);};
const fixture='<!doctype html><html><body><input id="typing"><canvas width="640" height="360"></canvas><video muted></video><button data-testid="fullscreenButton" id="native-fullscreen">Fullscreen</button><iframe srcdoc="<input autofocus>"></iframe><script>\
window.pageKeys=0;window.fullscreenClicks=0;window.pauseCount=0;\
addEventListener("keydown",e=>{if(e.isTrusted&&["Space","Enter"].includes(e.code))pageKeys++},true);\
const canvas=document.querySelector("canvas"),ctx=canvas.getContext("2d"),video=document.querySelector("video");\
ctx.fillStyle="navy";ctx.fillRect(0,0,640,360);setInterval(()=>{ctx.fillRect(0,0,640,360)},60);\
video.srcObject=canvas.captureStream(15);video.play().catch(()=>{});video.addEventListener("pause",()=>pauseCount++);\
document.querySelector("#native-fullscreen").onclick=()=>{fullscreenClicks++;document.documentElement.requestFullscreen().catch(()=>{})};\
</script></body></html>';
async function serve(){
  server=http.createServer(async(req,res)=>{
    try{
      const relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/+/,'');
      if(!['bennyshub','logos','assets','site-assets'].includes(relative.split('/')[0])||relative.split(/[\\/]/).some(s=>s==='..'||s.startsWith('.')))throw Error('Not public');
      let file=path.resolve(root,relative);if((await fs.stat(file)).isDirectory())file=path.join(file,'index.html');
      if(!(await fs.realpath(file)).startsWith(root+path.sep))throw Error('Not public');
      const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.wasm':'application/wasm','.webmanifest':'application/manifest+json'};
      res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(await fs.readFile(file));
    }catch{res.writeHead(404);res.end('Not found')}
  });
  await new Promise(r=>server.listen(3000,'127.0.0.1',r));return 'http://127.0.0.1:'+server.address().port;
}
(async()=>{
  await fs.mkdir(artifacts,{recursive:true});
  const base=process.argv.find(arg=>arg.startsWith('--origin='))?.slice('--origin='.length)||await serve(),stamp=Date.now(),dir=path.join(artifacts,'extension-'+stamp);
  await fs.cp(path.join(root,'extension'),dir,{recursive:true});
  const manifest=JSON.parse(await fs.readFile(path.join(dir,'manifest.json'),'utf8'));
  // Grant only the routed test provider. Hub content scripts retain their
  // normal manifest access; the extension cannot read the Hub tab URL.
  manifest.host_permissions=['https://app.plex.tv/*'];
  await fs.writeFile(path.join(dir,'manifest.json'),JSON.stringify(manifest,null,2));
  const explicit=process.argv.find(a=>a.startsWith('--browser-path='))?.slice(15);
  const candidates=explicit?[explicit]:[chromium.executablePath(),'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'];
  let launchError;
  for(const executablePath of candidates){
    try{
      await fs.access(executablePath);
      context=await chromium.launchPersistentContext(path.join(artifacts,'profile-'+stamp+'-'+candidates.indexOf(executablePath)),{
        executablePath,headless:true,viewport:{width:1280,height:900},
        args:['--disable-extensions-except='+dir,'--load-extension='+dir]
      });
      if(!context.serviceWorkers().some(w=>w.url().startsWith('chrome-extension:')))
        await context.waitForEvent('serviceworker',{predicate:w=>w.url().startsWith('chrome-extension:'),timeout:7000});
      report.browser=context.browser().version();report.executablePath=executablePath;break;
    }catch(error){launchError=error;await context?.close();context=null;}
  }
  if(!context)throw launchError||Error('No browser with unpacked extension support');
  context.setDefaultTimeout(12000);
  context.on('page',p=>p.on('pageerror',e=>report.errors.push({url:p.url(),message:e.message})));
  await context.route('https://app.plex.tv/**',r=>r.fulfill({contentType:'text/html',body:fixture}));
  await context.route('**/___vscode_livepreview_injected_script',r=>r.fulfill({contentType:'text/javascript',body:''}));
  const hub=await context.newPage();await hub.goto(base+'/bennyshub/index.html');
  const cancel=hub.locator('#modal-cancel');if(await cancel.isVisible())await cancel.click();
  await hub.waitForFunction(()=>window.BennyExtension?.supports('streaming'));
  const worker=context.serviceWorkers().find(w=>w.url().startsWith('chrome-extension:'));
  // Public manager uses indices, while worker transports the normalized values.
  const set=async settings=>{
    await hub.evaluate(settings=>{NarbeVoiceManager.updateSettings({ttsEnabled:false});NarbeScanManager.updateSettings(settings)},settings);
    const expected={...settings};if('scanSpeedIndex'in expected){expected.scanInterval=[1000,2000,3000,4000][expected.scanSpeedIndex];delete expected.scanSpeedIndex;}
    if('inputSensitivityIndex'in expected){expected.inputSensitivity=[50,100,200,300][expected.inputSensitivityIndex];delete expected.inputSensitivityIndex;}
    await expect.poll(()=>worker.evaluate(async origin=>(await chrome.storage.session.get('scan:'+origin))['scan:'+origin],base)).toMatchObject(expected);
  };
  await set({autoScan:false,scanSpeedIndex:0,inputSensitivityIndex:0,parking:'off',loopsBeforeParking:2,spaceBrake:true,waitForSpeech:false});
  const next=context.waitForEvent('page');
  await hub.evaluate(()=>BennyExtension.request('OPEN_STREAM',{url:'https://app.plex.tv/desktop/fixture',show:'Companion scan fixture',type:'movies',settings:{...NarbeScanManager.getSettings(),tts:false}}));
  let player=await next;diagnosticPlayer=player;await player.waitForURL('https://app.plex.tv/**');await player.bringToFront();
  let bar=player.locator('#benny-player-controls');await bar.waitFor();
  await expect.poll(()=>player.locator('video').evaluate(v=>v.paused)).toBe(false);
  // Inspect the closed shadow tree through the browser's read-only debugger;
  // the extension remains unmodified and its page-visible root stays closed.
  const devtools=await context.newCDPSession(player);
  const shadowState=async()=>{
    const {root:tree}=await devtools.send('DOM.getDocument',{depth:-1,pierce:true});
    const find=node=>{
      if(node.attributes?.some((value,index)=>index%2===0&&value==='id'&&node.attributes[index+1]==='benny-player-controls'))return node;
      for(const child of [...(node.children||[]),...(node.shadowRoots||[])]){const found=find(child);if(found)return found;}
    };
    const host=find(tree);assert.ok(host?.shadowRoots?.length,'closed player shadow root exists');
    const {object}=await devtools.send('DOM.resolveNode',{backendNodeId:host.shadowRoots[0].backendNodeId});
    const {result}=await devtools.send('Runtime.callFunctionOn',{objectId:object.objectId,returnByValue:true,functionDeclaration:
      'function(){const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}};const badge=this.querySelector(".narbe-scan-status-badge");return {buttons:[...this.querySelectorAll("nav button")].filter(b=>!b.closest("[hidden]")).map(b=>({command:b.dataset.command,selected:b.classList.contains("selected"),outline:getComputedStyle(b).outlineStyle,prefix:getComputedStyle(b,"::before").content,focused:b.matches(":focus-visible"),rect:rect(b)})),badge:badge?{text:badge.textContent,rect:rect(badge)}:null}}'});
    await devtools.send('Runtime.releaseObject',{objectId:object.objectId});return result.value;
  };
  const checkBadge=async text=>{
    const state=await shadowState();assert.equal(state.badge?.text,text);
    const a=state.badge.rect;
    for(const {rect:b}of state.buttons)assert.ok(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y,'scan badge must not cover a choice');
    return state;
  };
  const selected=()=>bar.getAttribute('data-selected');
  const mode=()=>bar.getAttribute('data-scan-state');
  const expectSelected=(value,options={})=>expect.poll(selected,{timeout:options.timeout||5000,intervals:[75]}).toBe(value);
  const tap=async(key,settle=65)=>{await player.keyboard.down(key);await player.waitForTimeout(1);await player.keyboard.up(key);if(settle)await player.waitForTimeout(settle)};
  const stepTo=async command=>{
    for(let tries=0;tries<20&&await selected()!==command;tries++)await tap('Space');
    await expectSelected(command);
  };
  const fresh=async settings=>{
    await set({autoScan:false});await player.bringToFront();await expect(bar).toHaveAttribute('data-scan-state','step');
    // A mode toggle retains focus. Explicitly unlock/relock for a fresh menu.
    await player.keyboard.press('Alt+Shift+B');await expect(bar).toHaveAttribute('data-access','browser');
    await player.keyboard.press('Alt+Shift+B');await expect(bar).toHaveAttribute('data-access','controls');await expectSelected('park');
    await set(settings);await player.bringToFront();
  };
  // Exercise the production Hub cards, not just direct manager test calls.
  await expectSelected('park');await tap('Space');await expectSelected('play');
  await hub.bringToFront();await hub.locator('[data-target="settings"]').first().click();
  await expect(hub.locator('#scan-settings')).toBeVisible();
  await expect(hub.locator('#auto-scan-options')).toBeVisible();
  await expect(hub.locator('#parking-toggle')).toBeDisabled();
  await expect(hub.locator('#spacebrake-toggle')).toBeDisabled();
  await expect(hub.locator('#waitspeech-toggle')).toBeDisabled();
  await hub.locator('#autoscan-toggle').click();
  await expect(hub.locator('#parking-toggle')).toBeEnabled();
  await expect(hub.locator('#spacebrake-toggle')).toBeEnabled();
  await expect(hub.locator('#waitspeech-toggle')).toBeEnabled();
  await hub.locator('#parking-toggle').click();await hub.locator('#parking-toggle').click();
  await expect(hub.locator('#parking-loops-toggle')).toBeVisible();
  await hub.locator('#parking-loops-toggle').click();
  await hub.locator('#spacebrake-toggle').click();await hub.locator('#waitspeech-toggle').click();
  await hub.locator('#scanspeed-toggle').click();await hub.locator('#sensitivity-toggle').click();
  const fromCards={autoScan:true,parking:'auto',loopsBeforeParking:3,spaceBrake:false,waitForSpeech:true,scanInterval:2000,inputSensitivity:100};
  await expect.poll(()=>worker.evaluate(async origin=>(await chrome.storage.session.get('scan:'+origin))['scan:'+origin],base)).toMatchObject(fromCards);
  await expectSelected('play');
  await hub.locator('#autoscan-toggle').click();
  await expect(hub.locator('#auto-scan-options')).toBeVisible();
  await expect(hub.locator('#parking-toggle')).toBeDisabled();
  await expect(hub.locator('#spacebrake-toggle')).toBeDisabled();
  await expect(hub.locator('#waitspeech-toggle')).toBeDisabled();
  await expect.poll(()=>worker.evaluate(async origin=>(await chrome.storage.session.get('scan:'+origin))['scan:'+origin],base)).toMatchObject({...fromCards,autoScan:false});
  await player.bringToFront();await expect(bar).toHaveAttribute('data-scan-state','step');
  await expectSelected('play');await player.waitForTimeout(2100);await expectSelected('play');
  pass('Actual Hub Scan cards sync every preference to Companion; Auto Off leaves options visible-disabled without erasing values or moving player focus');
  await fresh({autoScan:false,scanSpeedIndex:0,inputSensitivityIndex:0,parking:'off',loopsBeforeParking:2,spaceBrake:true,waitForSpeech:false});

  await expectSelected('park');await expect(bar).toHaveAttribute('data-scan-index','-1');
  const initialPauses=await player.evaluate(()=>pauseCount);await tap('Enter');
  assert.equal(await player.evaluate(()=>pauseCount),initialPauses);await expectSelected('park');
  await tap('Space',0);await expectSelected('play');
  await tap('Space',0);await expectSelected('play');await player.waitForTimeout(65);
  await tap('Space');await expectSelected('back');
  for(const command of ['forward','down','up','mute','previous','next','fullscreen','help','suspend','return','park']){await tap('Space');await expectSelected(command);}
  await tap('Space');await expectSelected('play');
  await player.keyboard.down('Space');await expectSelected('park',{timeout:3600});
  await expectSelected('return',{timeout:1500});await player.keyboard.up('Space');await player.waitForTimeout(65);
  assert.equal(await player.evaluate(()=>pageKeys),0);
  pass('Step starts at -1; Enter is inert; 1 ms tap accepted; bounce consumed; recurring park in both directions');

  await fresh({autoScan:true,parking:'off',spaceBrake:true,waitForSpeech:false});
  await expectSelected('park');await expect(bar).toHaveAttribute('data-scan-state','running');
  await tap('Space');await expectSelected('park');await expect(bar).toHaveAttribute('data-scan-state','running');
  await expectSelected('play',{timeout:1500});
  await tap('Space');await expect(bar).toHaveAttribute('data-scan-state','paused');
  const heldChoice=await selected();await player.waitForTimeout(1300);assert.equal(await selected(),heldChoice);
  assert.equal(await player.locator('video').evaluate(v=>v.paused),false,'pausing scan leaves the video playing');
  const pausedControls=await checkBadge('');assert.equal(pausedControls.buttons.filter(b=>b.selected).length,1);const pausedButton=pausedControls.buttons.find(b=>b.selected);assert.equal(pausedButton.outline,'dotted');assert.ok(!pausedButton.prefix.includes('Paused'));assert.equal(pausedControls.badge.rect.height,0);
  await player.screenshot({path:path.join(artifacts,'paused.png')});
  await tap('Space');await expect(bar).toHaveAttribute('data-scan-state','running');
  await player.waitForTimeout(800);assert.equal(await selected(),heldChoice);
  await expectSelected('back',{timeout:600});
  await player.keyboard.down('Space');await player.waitForTimeout(3150);
  await expectSelected('back');await player.keyboard.up('Space');
  await expect(bar).toHaveAttribute('data-scan-state','running');await player.waitForTimeout(800);
  await expectSelected('back');await expectSelected('forward',{timeout:600});
  pass('Auto brake freezes on press, persists after tap, resumes on second tap or held release with a full interval');

  await fresh({autoScan:true,parking:'chosen',spaceBrake:true});
  await expectSelected('park');const beforePark=await player.evaluate(()=>pauseCount);
  await tap('Enter');await expectSelected('parked');await expect(bar).toHaveAttribute('data-scan-state','parked');
  await player.waitForTimeout(1200);await expectSelected('parked');
  await tap('Space');await expectSelected('parked');
  assert.equal(await player.locator('video').evaluate(v=>v.paused),false,'parking scan leaves the video playing');
  const parkedControls=await checkBadge('Parked');assert.equal(parkedControls.buttons.filter(b=>b.selected||b.focused).length,0,'parked scan has no selection or stale native focus highlight');
  await player.screenshot({path:path.join(artifacts,'parked.png')});
  await tap('Enter');await expectSelected('play');
  assert.equal(await player.evaluate(()=>pauseCount),beforePark);
  await tap('Enter');await expect.poll(()=>player.locator('video').evaluate(v=>v.paused)).toBe(true);
  assert.notEqual(await mode(),'parked','ordinary selections do not force parking');
  pass('Park when chosen consumes Enter at -1; parked Enter resumes first choice without activating it');

  for(const loopsBeforeParking of [1,2,3]){
    await fresh({autoScan:true,parking:'auto',loopsBeforeParking,spaceBrake:true});
    for(let loop=1;loop<=loopsBeforeParking;loop++){
      await expectSelected('return',{timeout:14000});
      await expectSelected(loop===loopsBeforeParking?'parked':'park',{timeout:1600});
      await expect(bar).toHaveAttribute('data-scan-state',loop===loopsBeforeParking?'parked':'running');
    }
    await tap('Enter');await expectSelected('play');
  }
  pass('Auto park counts exactly 1, 2, and 3 complete loops, each including the recurring -1 step');

  await fresh({autoScan:true,parking:'off',spaceBrake:false,scanSpeedIndex:2});
  await expectSelected('park');await tap('Space');await expectSelected('play');
  await tap('Space');await expectSelected('back');assert.equal(await mode(),'running');
  await set({autoScan:false,scanSpeedIndex:0,spaceBrake:true});
  await expectSelected('back');await stepTo('help');await tap('Enter');
  await expect(bar).toHaveAttribute('data-menu','help');await expectSelected('park');
  assert.equal(await player.locator('video').evaluate(v=>v.paused),true);
  await tap('Enter');await expectSelected('park');
  await stepTo('back-player');await tap('Enter');await expect(bar).toHaveAttribute('data-menu','player');await expectSelected('park');
  pass('Brake Off keeps Space stepping; Help and Back open at -1 and keep the movie paused');

  await stepTo('fullscreen');await tap('Enter');await stepTo('fullscreen');await tap('Enter');
  await expect.poll(()=>player.evaluate(()=>fullscreenClicks)).toBeGreaterThan(0);
  await expect.poll(()=>player.evaluate(()=>!!document.fullscreenElement)).toBe(true);
  await expectSelected('fullscreen');await tap('Space');await expectSelected('help');
  pass('Native fullscreen keeps the control bar reachable and scan identity intact');

  await player.keyboard.down('Space');await player.evaluate(()=>dispatchEvent(new Event('blur')));await player.keyboard.up('Space');
  await player.evaluate(()=>dispatchEvent(new Event('focus')));await player.waitForTimeout(70);await tap('Space');
  await expectSelected('suspend');
  await tap('Enter');await expect(bar).toHaveAttribute('data-access','browser');
  await player.locator('#typing').fill('Text');await player.locator('#typing').press('Space');assert.equal(await player.locator('#typing').inputValue(),'Text ');
  await player.reload();bar=player.locator('#benny-player-controls');await expect(bar).toHaveAttribute('data-access','browser');
  await player.locator('#typing').fill('Reload');await player.locator('#typing').press('Space');assert.equal(await player.locator('#typing').inputValue(),'Reload ');
  await player.keyboard.press('Alt+Shift+B');await expect(bar).toHaveAttribute('data-access','controls');await expectSelected('park');
  await player.waitForTimeout(70);await tap('Space');await expectSelected('play');
  pass('Lost release after blur cannot strand input; unlock survives reload; relocking starts at -1');
  await stepTo('return');await tap('Enter',0);await expect.poll(()=>player.isClosed()).toBe(true);
  assert.equal(context.pages().filter(p=>p.url().startsWith(base+'/bennyshub/')).length,1);
  pass('Return to Hub reuses the owning Hub and closes playback');

  assert.deepEqual(report.errors,[]);
  report.result='passed';console.log('Companion scan checks passed in real unpacked '+report.browser+'.');
})().catch(async error=>{if(diagnosticPlayer&&!diagnosticPlayer.isClosed()){report.player=await diagnosticPlayer.locator('#benny-player-controls').evaluate(el=>Object.fromEntries([...el.attributes].map(a=>[a.name,a.value]))).catch(()=>null);await diagnosticPlayer.screenshot({path:path.join(artifacts,'failure.png')}).catch(()=>{});}report.result='failed';report.failure=error.stack;console.error(error);process.exitCode=1;}).finally(async()=>{
  await context?.close();await new Promise(resolve=>server?server.close(resolve):resolve());
  await fs.mkdir(artifacts,{recursive:true});await fs.writeFile(path.join(artifacts,'browser-report.json'),JSON.stringify(report,null,2));
});
