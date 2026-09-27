const {chromium,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),base='http://127.0.0.1:4173';let context;
(async()=>{
 const cases=[
  {start:'https://www.youtube.com/watch?v=first&list=series',last:'https://www.youtube.com/watch?v=seventh',saved:'https://www.youtube.com/watch?v=seventh&list=series',type:'videos'},
  {start:'https://www.netflix.com/watch/1001',last:'https://www.netflix.com/watch/1007'},
  {start:'https://www.disneyplus.com/play/first',last:'https://www.disneyplus.com/play/seventh'},
  {start:'https://www.primevideo.com/detail/first?autoplay=1',last:'https://www.primevideo.com/detail/seventh?autoplay=1'},
  {start:'https://www.hulu.com/watch/first',last:'https://www.hulu.com/watch/seventh'}
 ];
 const dir=path.join(root,'artifacts','progress-extension-'+Date.now());await fs.cp(path.join(root,'extension'),dir,{recursive:true});
 const manifest=JSON.parse(await fs.readFile(path.join(dir,'manifest.json')));manifest.host_permissions=cases.map(c=>new URL(c.start).origin+'/*');await fs.writeFile(path.join(dir,'manifest.json'),JSON.stringify(manifest));
 const script=path.join(dir,'player-content.js');await fs.writeFile(script,(await fs.readFile(script,'utf8')).replace("mode:'closed'","mode:'open'"));
 context=await chromium.launchPersistentContext(path.join(root,'artifacts','progress-profile-'+Date.now()),{channel:'chromium',headless:true,args:['--disable-extensions-except='+dir,'--load-extension='+dir]});
 for(const c of cases)await context.route(new URL(c.start).origin+'/**',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Episode fixture</title><body><video></video></body>'}));
 const hub=await context.newPage();await hub.goto(base+'/bennyshub/index.html#companion=home');await hub.waitForFunction(()=>BennyExtension.supports('streaming'));
 await hub.evaluate(()=>{NarbeVoiceManager.updateSettings({ttsEnabled:false});NarbeScanManager.updateSettings({autoScan:false,inputSensitivityIndex:0});});
 async function streaming(){
  await hub.locator('[data-target="tools"]').first().click();await hub.locator('#tools-grid [data-title="Streaming"]').click();
  await expect.poll(()=>hub.frames().some(f=>f.url().includes('/tools/streaming/'))).toBe(true);const frame=hub.frames().find(f=>f.url().includes('/tools/streaming/'));await frame.waitForFunction(()=>window.WebStreaming&&BennyExtension.supports('streaming'));return frame;
 }
 for(const c of cases){
  let frame=await streaming();const item={id:'fixture',title:'Example series',url:c.start,type:c.type||'shows'};
  await frame.evaluate(item=>WebStreaming.saveData([item]),item);
  let event=context.waitForEvent('page');await frame.evaluate(item=>WebStreaming.launch({url:item.url,show:item.title,type:item.type}),item);let player=await event;
  await player.locator('#benny-player-controls').waitFor();await player.bringToFront();
  // Change the address immediately before exit, without waiting for a heartbeat.
  await player.evaluate(url=>history.replaceState({},'',url),c.last);
  let bar=player.locator('#benny-player-controls');await bar.getByRole('button',{name:'Help & shortcuts',exact:true}).click();await bar.getByRole('button',{name:'Open keyboard',exact:true}).click();
  await expect.poll(()=>player.isClosed()).toBe(true);await expect(hub.locator('#app-iframe')).toHaveAttribute('src','apps/tools/keyboard/index.html');
  const saved=c.saved||c.last;
  assert.equal(await hub.evaluate(()=>JSON.parse(localStorage.getItem('benny-web:v1:streaming.lastWatched'))['example series'].url),saved);
  // Reopen the Hub: persisted progress drives the real Continue button.
  await hub.goto(base+'/bennyshub/index.html#companion=home');await hub.waitForFunction(()=>BennyExtension.supports('streaming'));frame=await streaming();
  await frame.evaluate(async()=>showModal((await WebStreaming.getData())[0]));
  event=context.waitForEvent('page');await frame.getByRole('button',{name:'Continue',exact:true}).click();player=await event;await player.waitForURL(saved);await player.locator('#benny-player-controls').waitFor();
  assert.equal(await frame.evaluate(async()=>(await WebStreaming.getData())[0].url),c.start);
  await frame.waitForFunction(()=>!isLaunching);
  // A reset while the player remains open must not be undone by its final capture.
  await frame.evaluate(()=>WebStreaming.resetProgress('Example series'));await player.bringToFront();bar=player.locator('#benny-player-controls');await bar.getByRole('button',{name:'Return to Hub',exact:true}).click();await expect.poll(()=>player.isClosed()).toBe(true);
  assert.equal(await hub.evaluate(()=>JSON.parse(localStorage.getItem('benny-web:v1:streaming.lastWatched'))['example series'].url),undefined);
  await hub.goto(base+'/bennyshub/index.html#companion=home');await hub.waitForFunction(()=>BennyExtension.supports('streaming'));
  console.log(new URL(c.start).hostname+': latest episode persisted through keyboard shortcut/reload, Continue used it, catalog unchanged, reset respected.');
 }
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>context?.close());
