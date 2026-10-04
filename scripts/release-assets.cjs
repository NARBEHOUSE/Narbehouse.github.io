// Actual UI captures in isolated profiles. No store upload or website deployment.
const {chromium,expect}=require('@playwright/test'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),version=require('../extension/manifest.json').version,out=path.join(root,'releases',version),assets=path.join(out,'assets'),site='https://narbehouse.github.io';
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.wasm':'application/wasm','.webmanifest':'application/manifest+json'};
let context;
async function routes(ctx){
  await ctx.route('https://**/*',async route=>{
    const url=new URL(route.request().url());if(url.origin!==site)return route.abort();
    let rel=decodeURIComponent(url.pathname);if(rel.endsWith('/'))rel+='index.html';
    const file=path.resolve(root,'dist','.'+rel);if(!file.startsWith(path.join(root,'dist')+path.sep))return route.abort();
    try{await route.fulfill({body:await fs.readFile(file),contentType:mime[path.extname(file)]||'application/octet-stream'});}catch{await route.fulfill({status:404,body:'Not found'});}
  });
}
async function launch(extension,label){return chromium.launchPersistentContext(path.join(root,'artifacts','release-'+label+'-'+Date.now()),{channel:'chromium',headless:true,serviceWorkers:'block',viewport:{width:1280,height:800},args:['--disable-extensions-except='+extension,'--load-extension='+extension]});}
(async()=>{
  await fs.mkdir(assets,{recursive:true});
  const production=path.join(out,'extension');
  context=await launch(production,'exact');await routes(context);
  let hub=await context.newPage();await hub.goto(site+'/bennyshub/');await hub.waitForFunction(()=>BennyExtension.state.connected);assert.equal(await hub.evaluate(()=>BennyExtension.state.version),version);
  await hub.locator('#modal-cancel').click();await hub.locator('[data-target="tools"]').first().click();await expect(hub.locator('#tools-grid .app-btn')).toHaveCount(6);
  let worker=context.serviceWorkers().find(w=>w.url().startsWith('chrome-extension:'));assert.ok(worker);
  const permission=await worker.evaluate(()=>chrome.permissions.getAll());assert.ok(!(permission.origins||[]).some(x=>x.startsWith('http:')));
  const settings=await context.newPage();await settings.goto(new URL('options.html',worker.url()).href);await expect(settings.locator('#companion-access')).toBeEnabled();await expect(settings.locator('#fixture')).toHaveCount(0);
  const empty=await context.newPage();await empty.goto(site+'/bennyshub/apps/tools/streaming/index.html');await empty.waitForFunction(()=>BennyExtension.supports('streaming'));assert.deepEqual(await empty.evaluate(()=>WebStreaming.getData()),[]);assert.deepEqual(await empty.evaluate(()=>WebStreaming.allEpisodes()),{});
  const privacy=await context.newPage();await privacy.goto(site+'/bennyshub/companion-privacy.html');await expect(privacy.locator('h1')).toContainText('privacy');
  await settings.locator('#return-hub').click();await expect.poll(()=>settings.isClosed()).toBe(true);await expect(hub.locator('#screen-tools')).toHaveClass(/active/);
  const returnSetup=await context.newPage();await returnSetup.goto(site+'/bennyshub/extension-setup.html');await returnSetup.waitForFunction(()=>BennyExtension.supports('settings-return'));await returnSetup.locator('#back').click();await expect.poll(()=>returnSetup.isClosed()).toBe(true);
  await context.close();context=null;

  // Only the isolated screenshot copy pre-grants YouTube host access. The ZIP
  // retains optional permissions and its actual controls/logic are unchanged.
  const fixture=path.join(root,'artifacts','release-capture-extension-'+Date.now());await fs.cp(production,fixture,{recursive:true});
  const manifest=JSON.parse(await fs.readFile(path.join(fixture,'manifest.json')));manifest.host_permissions=['https://www.youtube.com/*','https://youtube.com/*','https://m.youtube.com/*'];await fs.writeFile(path.join(fixture,'manifest.json'),JSON.stringify(manifest));
  context=await launch(fixture,'captures');await routes(context);
  await context.route('https://www.youtube.com/**',r=>r.fulfill({contentType:'text/html',body:`<!doctype html><html><head><title>Benny's Hub demonstration video</title><style>body{margin:0;background:#102334}#movie_player{width:640px;height:360px}.html5-video-container{position:relative;width:640px;height:360px}</style></head><body><div id="movie_player" class="html5-video-player"><div class="html5-video-container"><video muted autoplay></video></div></div><script>const c=document.createElement('canvas');c.width=1280;c.height=800;const x=c.getContext('2d');function draw(){const g=x.createLinearGradient(0,0,1280,800);g.addColorStop(0,'#143b4a');g.addColorStop(1,'#111d32');x.fillStyle=g;x.fillRect(0,0,1280,800);x.fillStyle='#70c5b2';x.beginPath();x.arc(640,255,92,0,Math.PI*2);x.fill();x.fillStyle='#123140';x.beginPath();x.moveTo(621,214);x.lineTo(621,296);x.lineTo(683,255);x.fill();x.textAlign='center';x.fillStyle='#ffffff';x.font='bold 44px sans-serif';x.fillText("Benny's Hub Companion",640,424);x.font='24px sans-serif';x.fillStyle='#c1d9e1';x.fillText('Demonstration video',640,469);x.font='20px sans-serif';x.fillText('One or two switches. Your playback controls.',640,513);}draw();setInterval(draw,150);document.querySelector('video').srcObject=c.captureStream(10);document.querySelector('video').play().catch(()=>{});</script></body></html>`}));
  hub=await context.newPage();await hub.goto(site+'/bennyshub/');await hub.waitForFunction(()=>BennyExtension.supports('streaming'));await hub.locator('#modal-cancel').click();
  await hub.evaluate(()=>{NarbeVoiceManager.updateSettings({ttsEnabled:false});NarbeScanManager.updateSettings({autoScan:false,inputSensitivityIndex:0});});
  await hub.locator('[data-target="tools"]').first().click();await expect(hub.locator('#tools-grid .app-btn')).toHaveCount(6);await hub.screenshot({path:path.join(assets,'03-hub-tools.png')});
  const opened=context.waitForEvent('page');await hub.evaluate(()=>BennyExtension.request('OPEN_STREAM',{url:'https://www.youtube.com/watch?v=benny-demo',settings:{tts:false,autoScan:false}}));const player=await opened;
  await player.waitForSelector('#benny-player-controls');await expect(player.locator('[data-benny-player-view]')).toHaveCount(1);await player.screenshot({path:path.join(assets,'01-player-controls.png')});await player.close();
  worker=context.serviceWorkers().find(w=>w.url().startsWith('chrome-extension:'));
  const options=await context.newPage();await options.goto(new URL('options.html',worker.url()).href);await expect(options.locator('#companion-access')).toHaveAttribute('aria-checked','true');await expect(options.locator('#companion-access .toggle-state')).toHaveText('Incomplete');
  const optionsCDP=await context.newCDPSession(options);await optionsCDP.send('Emulation.setDeviceMetricsOverride',{width:1600,height:1000,deviceScaleFactor:.8,mobile:false});
  await options.screenshot({path:path.join(assets,'02-companion-settings.png')});await options.close();
  const setup=await context.newPage();await setup.goto(site+'/bennyshub/extension-setup.html');await expect(setup.locator('#status')).toContainText('Connected');await setup.screenshot({path:path.join(assets,'04-companion-connection.png')});await setup.close();
  const journal=await context.newPage();await journal.goto(site+'/bennyshub/apps/tools/journal/index.html');await journal.waitForFunction(()=>BennyExtension.supports('journal'));await journal.locator('[data-action="entries"]').click();await journal.locator('[data-action="change-view"]').click();await journal.screenshot({path:path.join(assets,'05-journal.png')});await journal.close();
  const logo='data:image/png;base64,'+(await fs.readFile(path.join(root,'bennyshub/images/BeaminBenny.png'))).toString('base64');
  const promo=await context.newPage();for(const [width,height]of [[440,280],[1400,560]]){
    await promo.setViewportSize({width,height});await promo.setContent(`<html><body style="margin:0;width:100vw;height:100vh;display:flex;align-items:center;justify-content:center;gap:${width>500?80:24}px;background:radial-gradient(ellipse at 25% 45%,#214663,#0b1524 75%);color:white;font-family:Arial,sans-serif"><img src="${logo}" style="width:${height*.45}px;height:${height*.45}px;object-fit:contain"><div style="display:flex;flex-direction:column;gap:18px"><div style="background:#315c4c;border:2px solid #7ce0b8;border-radius:14px;padding:${height*.035}px ${height*.06}px;font-size:${height*.065}px;font-weight:bold;box-shadow:0 8px 22px #0005">Space</div><div style="background:#254f78;border:2px solid #9ed4ff;border-radius:14px;padding:${height*.035}px ${height*.06}px;font-size:${height*.065}px;font-weight:bold;box-shadow:0 8px 22px #0005">Enter Ã¢â€ Âµ</div></div></body></html>`);
    await promo.locator('img').evaluate(img=>img.decode());await promo.screenshot({path:path.join(assets,'promo'+width+'x'+height+'.png')});
  }
  // Keep icons reproducible alongside screenshots.
  for(const size of [128,300]){
    const data=await promo.evaluate(async({src,size})=>{const i=new Image();i.src=src;await i.decode();const c=document.createElement('canvas');c.width=c.height=size;const a=size*.875;c.getContext('2d').drawImage(i,(size-a)/2,(size-a)/2,a,a);return c.toDataURL().split(',')[1];},{src:logo,size});
    await fs.writeFile(path.join(assets,size===128?'icon128.png':'logo300.png'),Buffer.from(data,'base64'));
  }
  console.log('Exact production package: HTTPS Hub connection, Tools gating, empty library/episodes, settings and privacy passed using local routed static files. Five actual UI screenshots and store promotional assets generated. No remote deployment.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>context?.close());
