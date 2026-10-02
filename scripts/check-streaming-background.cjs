// Uses the current Companion with a synthetic provider page and an isolated profile.
// --baseline <revision> serves app.js from that commit for before/after comparison.
const {chromium,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),base=process.env.HUB_TEST_ORIGIN||'http://127.0.0.1:4173';
let context;
(async()=>{
  const dir=path.join(root,'artifacts','background-extension-'+Date.now());
  await fs.cp(path.join(root,'extension'),dir,{recursive:true});
  const manifest=JSON.parse(await fs.readFile(path.join(dir,'manifest.json'),'utf8'));
  manifest.host_permissions=['https://www.youtube.com/*'];
  await fs.writeFile(path.join(dir,'manifest.json'),JSON.stringify(manifest));
  const playerScript=path.join(dir,'player-content.js');
  await fs.writeFile(playerScript,(await fs.readFile(playerScript,'utf8')).replace("mode:'closed'","mode:'open'"));
  context=await chromium.launchPersistentContext(path.join(root,'artifacts','background-profile-'+Date.now()),{
    channel:'chromium',headless:true,viewport:{width:1400,height:950},
    args:['--disable-extensions-except='+dir,'--load-extension='+dir]
  });
  await context.route(/^https:\/\//,route=>route.request().url().startsWith('https://www.youtube.com/')
    ?route.fulfill({contentType:'text/html',body:'<!doctype html><title>Episode fixture</title><body><video></video></body>'})
    :route.abort());
  if(process.argv.includes('--baseline')){
    const revision=process.argv[process.argv.indexOf('--baseline')+1]||'HEAD';
    const body=execFileSync('git',['show',revision+':bennyshub/apps/tools/streaming/app.js'],{cwd:root,encoding:'utf8'});
    await context.route('**/apps/tools/streaming/app.js',r=>r.fulfill({contentType:'application/javascript',body}));
  }
  const errors=[],hub=await context.newPage();
  hub.on('pageerror',e=>errors.push(e.message));
  await hub.goto(base+'/bennyshub/index.html#companion=home');
  await hub.waitForFunction(()=>BennyExtension.supports('streaming'));
  await hub.evaluate(()=>{NarbeVoiceManager.updateSettings({ttsEnabled:false});NarbeScanManager.updateSettings({autoScan:false,inputSensitivityIndex:0});});
  await hub.locator('[data-target="tools"]').first().click();
  await hub.locator('#tools-grid [data-title="Streaming"]').click();
  await expect.poll(()=>hub.frames().some(f=>f.url().includes('/tools/streaming/'))).toBe(true);
  const frame=hub.frames().find(f=>f.url().includes('/tools/streaming/'));
  await frame.waitForFunction(()=>window.WebStreaming&&BennyExtension.supports('streaming'));
  await hub.waitForTimeout(150); // Let the initial main-menu announcement settle.
  await frame.evaluate(async()=>{
    const items=Array.from({length:10},(_,i)=>({id:'series-'+i,title:'Example series '+i,type:'shows',genre:'Test',url:'https://www.youtube.com/watch?v=episode'+i}));
    WebStreaming.saveData(items);
    for(const item of items)WebStreaming.saveProgress({show:item.title,url:item.url});
    await loadData();
    window.__speech=[];window.__navigations=0;window.__renders=0;
    // Headless Chromium reports both tabs focused; model real background visibility.
    const nativeFocus=document.hasFocus.bind(document);
    window.__fixtureBackground=false;
    Object.defineProperty(document,'hidden',{get:()=>window.__fixtureBackground});
    document.hasFocus=()=>!window.__fixtureBackground&&nativeFocus();
    window.__setBackground=value=>{
      window.__fixtureBackground=value;
      window.dispatchEvent(new Event(value?'blur':'focus'));
      document.dispatchEvent(new Event('visibilitychange'));
    };
    NarbeVoiceManager.speak=text=>window.__speech.push(text);
    const navigate=openItemsView;openItemsView=function(...args){window.__navigations++;return navigate(...args);};
    const render=renderItemsGrid;renderItemsGrid=function(...args){window.__renders++;return render(...args);};
  });
  const state=()=>frame.evaluate(()=>({speech:window.__speech,navigations:window.__navigations,renders:window.__renders,page:currentPage,index:itemIndex,view:currentState,auto:!!autoScanIntervalId,hidden:document.hidden,focused:document.hasFocus()}));
  await frame.locator('#btn-recent').click();
  await expect(frame.locator('#view-title')).toHaveText('Recently Watched');
  await expect(frame.locator('#items-view')).toBeVisible();
  await hub.waitForTimeout(120);
  assert.equal((await state()).speech.filter(s=>s==='Recently Watched').length,1,'intentional Recent navigation announces once');
  await frame.locator('#item-8').click();
  assert.equal((await state()).page,2);
  await frame.locator('#items-grid .card:not(.empty-card):not(.nav-card)').first().click();
  await expect(frame.getByRole('button',{name:'Continue',exact:true})).toBeVisible();
  await hub.waitForTimeout(100);
  await frame.evaluate(()=>{window.__speech=[];window.__navigations=0;window.__renders=0;});
  const opened=context.waitForEvent('page');
  await frame.getByRole('button',{name:'Continue',exact:true}).click();
  const player=await opened;player.on('pageerror',e=>errors.push(e.message));
  await player.locator('#benny-player-controls').waitFor();
  await player.bringToFront();
  await frame.evaluate(()=>{window.__setBackground(true);NarbeScanManager.updateSettings({autoScan:true});});
  await frame.waitForFunction(()=>!isLaunching);
  // Real Companion heartbeats save in the parent, which emits storage events in the iframe.
  await hub.waitForTimeout(3200);
  const background=await state();
  console.log('Background snapshot:',JSON.stringify(background));
  assert.equal(background.navigations,0,'progress must not reopen Recently Watched');
  assert.equal(background.speech.filter(s=>s==='Recently Watched').length,0,'progress must not repeat the menu title');
  assert.equal(background.page,2,'background updates preserve the browsing page');
  assert.equal(background.auto,false,'background progress must not restart scanning');
  // Provider navigation and its next heartbeat must still save the new episode.
  const latest='https://www.youtube.com/watch?v=next-episode';
  await player.evaluate(url=>history.replaceState({},'',url),latest);
  await expect.poll(()=>hub.evaluate(()=>{
    const active=JSON.parse(localStorage.getItem('benny-web:v1:streaming.activePlayback'));
    return JSON.parse(localStorage.getItem('benny-web:v1:streaming.lastWatched'))[active.show.toLowerCase().trim()].url;
  })).toBe(latest);
  const bar=player.locator('#benny-player-controls');
  await bar.getByRole('button',{name:'Help & shortcuts',exact:true}).click();
  await expect(bar.getByRole('button',{name:'Back to video',exact:true})).toBeVisible();
  await bar.getByRole('button',{name:'Back to video',exact:true}).click();
  await bar.getByRole('button',{name:'Return to Hub',exact:true}).click();
  await expect.poll(()=>player.isClosed()).toBe(true);
  await hub.bringToFront();
  await frame.evaluate(()=>window.__setBackground(false));
  await frame.locator('#view-title').click();
  await hub.waitForTimeout(250);
  const returned=await state();
  assert.equal(returned.view,'items');assert.equal(returned.page,2);
  assert.equal(returned.navigations,0,'return refresh is not a second menu navigation');
  assert.equal(returned.speech.filter(s=>s==='Recently Watched').length,0,'return refresh remains silent');
  assert.equal(returned.auto,true,'Auto Scan resumes when returning to the foreground');
  // Even foreground no-op progress events must not rebuild/reset the selected card.
  await frame.evaluate(()=>{NarbeScanManager.updateSettings({autoScan:false});itemIndex=1;highlightItem(1);});
  await hub.waitForTimeout(100);
  const before=await state();
  await hub.evaluate(()=>{
    const key='benny-web:v1:streaming.lastWatched',data=JSON.parse(localStorage.getItem(key));
    const active=JSON.parse(localStorage.getItem('benny-web:v1:streaming.activePlayback'));
    data[active.show.toLowerCase().trim()].timestamp=Date.now();localStorage.setItem(key,JSON.stringify(data));
  });
  await hub.waitForTimeout(250);
  const after=await state();
  assert.equal(after.renders,before.renders,'same list/order does not rebuild foreground cards');
  assert.equal(after.index,before.index,'foreground progress preserves selection');
  assert.deepEqual(after.speech,before.speech,'foreground progress is silent');
  // Losing focus also cancels a menu announcement already queued for delivery.
  await frame.evaluate(()=>{speak('Background speech fixture');window.__setBackground(true);});
  await hub.waitForTimeout(100);
  assert(!(await state()).speech.includes('Background speech fixture'));
  await frame.evaluate(()=>window.__setBackground(false));
  const failedLaunch=await frame.evaluate(async()=>{
    NarbeScanManager.updateSettings({autoScan:true});
    const launch=WebStreaming.launch;
    WebStreaming.launch=async()=>{throw Error('Synthetic provider failure');};
    try { await launchContent('https://www.youtube.com/watch?v=failed','Failed fixture','shows'); }
    finally { WebStreaming.launch=launch; }
    return {launching:isLaunching,auto:!!autoScanIntervalId};
  });
  assert.deepEqual(failedLaunch,{launching:false,auto:true},'failed launch restores menu scanning');
  assert.deepEqual(errors,[]);
  console.log('Background playback stays quiet; page/selection, episode progress, controls, and return all pass. Companion version '+manifest.version+'.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>context?.close());
