// Actual unpacked-extension layout checks; provider pages are local fixtures.
// Run after starting scripts/serve.cjs, or set HUB_TEST_ORIGIN to its allowed origin.
const {chromium,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {measurePlayerLayout,expectPlayerLayout}=require('./player-layout-checks.cjs');
const root=path.resolve(__dirname,'..'),base=process.env.HUB_TEST_ORIGIN||'http://127.0.0.1:4173';
const artifactArg=process.argv.find(arg=>arg.startsWith('--artifacts='))?.slice('--artifacts='.length);
const artifacts=artifactArg?path.resolve(root,artifactArg):path.join(root,'artifacts','player-layout-inline');
const executablePath=process.argv.find(arg=>arg.startsWith('--browser-path='))?.slice('--browser-path='.length)||process.env.HUB_BROWSER_PATH;
const cases=[['youtube','www.youtube.com'],['plex','app.plex.tv'],['netflix','www.netflix.com'],['disney','www.disneyplus.com'],['native-video','www.youtube.com']];
const onlyCase=process.argv.find(arg=>arg.startsWith('--case='))?.slice('--case='.length);
const report={checks:[],layouts:[],errors:[],baseline:{report:'artifacts/player-layout/browser-report.json',desktopDockHeight:86}};let context,activePage;
function providerFixture(service){
  const nativeVideo=service==='native-video',youtube=service==='youtube';
  const attrs={youtube:'class="ytp-fullscreen-button"',plex:'data-testid="fullscreenButton"',netflix:'data-uia="control-fullscreen-enter"',disney:'data-testid="fullscreen-button"'}[service];
  // Netflix-style centering must be removed when Companion owns the fitted coordinates.
  const video=(service==='netflix'?'<style>#fixture-video{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%)}</style>':'')+'<video id="fixture-video" muted style="width:640px;height:360px"></video>';
  const movie=nativeVideo?video+'<button id="provider-fullscreen" class="ytp-fullscreen-button" style="position:absolute;top:0;right:0;opacity:0">Fullscreen</button>':'<section id="player" '+(youtube?'class="html5-video-player"':'')+' style="position:relative;width:640px;height:360px"><div id="surface" class="html5-video-container" style="position:relative;width:640px;height:360px">'+video+'<div data-fixture-caption="inside" style="position:absolute;bottom:12px;left:10px;color:white;background:#000c">Caption inside video surface</div></div><div data-fixture-caption="outer" style="position:absolute;bottom:36px;left:10px;color:white;background:#000c">Caption beside native video surface</div><button id="provider-fullscreen" '+attrs+' style="position:absolute;top:0;right:0;opacity:0">Fullscreen</button></section>';
  return '<!doctype html><html><head><style>body{margin:0;background:#161616;color:white}button,input{font:18px system-ui}#typing{position:absolute;top:380px;left:10px}</style></head><body>'+movie+'<input id="typing" aria-label="Provider text input"><script>('+function(){
    window.fixtureClicks=0;window.profileClicks=0;window.switchLeaks=0;window.nativeVideoEntries=0;
    document.addEventListener('fullscreenchange',()=>{if(document.fullscreenElement===document.querySelector('video'))nativeVideoEntries++});
    addEventListener('keydown',event=>{if(['Space','Enter'].includes(event.code))switchLeaks++});
    const video=window.originalVideo=document.querySelector('video');window.originalParent=video.parentElement;
    const canvas=document.createElement('canvas');canvas.width=640;canvas.height=360;
    const ctx=canvas.getContext('2d');
    function draw(){
      ctx.fillStyle='#091964';ctx.fillRect(0,0,640,360);
      ctx.fillStyle='#ff654e';ctx.fillRect(0,0,640,24);
      ctx.fillStyle='#95ff42';ctx.fillRect(0,336,640,24);
      ctx.fillStyle='black';ctx.font='bold 16px sans-serif';ctx.fillText('TOP EDGE',16,18);ctx.fillText('BOTTOM EDGE MUST STAY VISIBLE',16,354);
      ctx.strokeStyle='white';ctx.lineWidth=4;ctx.strokeRect(2,2,636,356);
      ctx.fillStyle='white';ctx.font='24px sans-serif';ctx.fillText('Video and controls share the screen',95,180);
    }
    draw();setInterval(draw,60);
    video.srcObject=window.originalStream=canvas.captureStream(15);video.play().catch(()=>{});
    document.querySelector('#provider-fullscreen')?.addEventListener('click',()=>{
      fixtureClicks++;(document.querySelector('#player')||video).requestFullscreen().catch(()=>{});
    });
  }.toString()+')();</script></body></html>';
}
async function focusChoice(page,command){
  const bar=page.locator('#benny-player-controls');
  for(let i=0;i<18&&await bar.getAttribute('data-selected')!==command;i++){await page.waitForTimeout(65);await page.keyboard.press('Space');}
  await expect(bar).toHaveAttribute('data-selected',command);
}
async function select(page,command){
  await focusChoice(page,command);
  await page.waitForTimeout(65);await page.keyboard.press('Enter');
}
async function record(page,label,options={}){
  const layout=await expectPlayerLayout(page,options);report.layouts.push({label,...layout});
  await page.screenshot({path:path.join(artifacts,label.replace(/[^a-z0-9-]/gi,'-')+'.png')});return layout;
}
function visibleButton(layout,command){
  const button=layout.buttons.find(b=>b.command===command),panel=layout.nav.rect;
  return !!button&&button.rect.y>=panel.y-2&&button.rect.bottom<=panel.bottom+2&&button.rect.x>=panel.x-2&&button.rect.right<=panel.right+2;
}
(async()=>{
  await fs.mkdir(artifacts,{recursive:true});
  const stamp=Date.now(),dir=path.join(artifacts,'extension-'+stamp);await fs.cp(path.join(root,'extension'),dir,{recursive:true});
  const manifest=JSON.parse(await fs.readFile(path.join(dir,'manifest.json'),'utf8'));
  manifest.host_permissions=[...new Set(cases.map(([,host])=>'https://'+host+'/*'))];await fs.writeFile(path.join(dir,'manifest.json'),JSON.stringify(manifest));
  context=await chromium.launchPersistentContext(path.join(artifacts,'profile-'+stamp),{
    ...(executablePath?{executablePath}:{channel:'chromium'}),headless:true,viewport:{width:1280,height:900},
    args:['--disable-extensions-except='+dir,'--load-extension='+dir]
  });
  report.browser=context.browser().version();report.testedExtension=dir;context.setDefaultTimeout(15000);
  context.on('page',page=>page.on('pageerror',error=>report.errors.push({url:page.url(),message:error.message})));
  for(const host of new Set(cases.map(([,host])=>host)))await context.route('https://'+host+'/**',route=>{
    const service=new URL(route.request().url()).searchParams.get('fixture');
    return route.fulfill({contentType:'text/html',body:providerFixture(service)});
  });
  const hub=await context.newPage();await hub.goto(base+'/bennyshub/index.html');
  if(await hub.locator('#modal-cancel').isVisible())await hub.locator('#modal-cancel').click();
  await hub.waitForFunction(()=>window.BennyExtension?.supports('streaming'));
  for(const [service,host] of cases.filter(([service])=>!onlyCase||service===onlyCase)){
    const next=context.waitForEvent('page');
    await hub.evaluate(url=>BennyExtension.request('OPEN_STREAM',{url,settings:{tts:false,autoScan:false,inputSensitivity:50}}),'https://'+host+'/watch?fixture='+service);
    const player=activePage=await next;await player.waitForSelector('#benny-player-controls');await player.bringToFront();
    const bar=player.locator('#benny-player-controls');
    await expect.poll(()=>player.locator('video').evaluate(v=>!v.paused&&v.videoWidth>0)).toBe(true);
    const viewports=service==='youtube'?[{width:1280,height:900},{width:2000,height:900},{width:800,height:600},{width:640,height:480}]:[{width:800,height:600}];
    for(const size of viewports){
      await player.setViewportSize(size);
      const layout=await record(player,service+'-'+size.width+'x'+size.height);
      if(service==='youtube'&&size.width===1280){
        assert.ok(layout.panel.height<=64,'inline desktop dock stays at or below 64 px');
        assert.ok(layout.panel.height<=report.baseline.desktopDockHeight-16,'inline status removes at least16 px of the former footer height');
        report.desktopDockHeight=layout.panel.height;report.desktopHeightReduction=report.baseline.desktopDockHeight-layout.panel.height;
        assert.ok(layout.nav.scrollWidth<=layout.nav.clientWidth+1,'all 12 main controls fit in one desktop row');
        assert.equal(layout.buttons.find(button=>button.command==='forward').label,'Fast forward 10 seconds','compact labels keep their full spoken meaning');
      }
      if(service==='youtube'&&size.width===2000){assert.ok(layout.nav.scrollWidth<=layout.nav.clientWidth+1,'wide desktop fits all controls');assert.ok(layout.nav.rect.width>1600,'buttons use the available wide toolbar lane');}
      assert.equal(layout.buttons.length,12);assert.ok(layout.mediaContent.height>=size.height*.4,'meaningful space remains for video');
      assert.equal(await player.locator('video').evaluate(v=>v.paused),false,'resize must not pause playback');
      // Resize/reflow keeps the same scan identity; it is not a selection.
      await player.waitForTimeout(65);await player.keyboard.press('Space');
      const identity=await bar.getAttribute('data-selected');await player.setViewportSize({width:size.width+20,height:size.height});
      await expectPlayerLayout(player);await expect(bar).toHaveAttribute('data-selected',identity);
      await player.setViewportSize(size);
    }
    if(service==='youtube'){
      await player.setViewportSize({width:420,height:360});
      await record(player,'youtube-small-scrollable',{allButtons:false,minVideoHeight:70});
      const commands=['play','back','forward','down','up','mute','previous','next','fullscreen','help','suspend','return'];
      for(let i=0;i<commands.length+1;i++){
        await player.waitForTimeout(65);await player.keyboard.press('Space');
        const command=await bar.getAttribute('data-selected');if(command==='park')continue;
        await expect.poll(async()=>visibleButton(await measurePlayerLayout(player),command),{intervals:[75]}).toBe(true);
      }
      await player.setViewportSize({width:800,height:600});
    }
    if(service==='youtube'){
      // Central preferences arrive through the actual Hub/extension bridge.
      await focusChoice(player,'park');
      await hub.evaluate(()=>NarbeScanManager.updateSettings({autoScan:true,scanSpeedIndex:3,parking:'chosen',spaceBrake:true,waitForSpeech:false}));
      await expect(bar).toHaveAttribute('data-scan-state','running');await player.bringToFront();
      await player.waitForTimeout(65);await player.keyboard.press('Enter');await expect(bar).toHaveAttribute('data-scan-state','parked');
      for(const size of [{width:1280,height:900},{width:420,height:360}]){
        await player.setViewportSize(size);const parked=await record(player,'youtube-parked-inline-'+size.width,{allButtons:false,minVideoHeight:70});
        assert.equal(parked.badge.text,'Parked');assert.equal(parked.buttons.filter(button=>button.selected).length,0);
        assert.equal(await player.locator('video').evaluate(v=>v.paused),false,'parking never pauses media');
      }
      await player.waitForTimeout(65);await player.keyboard.press('Enter');await expect(bar).toHaveAttribute('data-selected','play');
      await player.waitForTimeout(65);await player.keyboard.press('Space');await expect(bar).toHaveAttribute('data-scan-state','paused');
      for(const size of [{width:1280,height:900},{width:420,height:360}]){
        await player.setViewportSize(size);const braked=await record(player,'youtube-paused-inline-'+size.width,{allButtons:false,minVideoHeight:70});
        assert.equal(braked.badge.height,0,'Paused badge is intentionally hidden');assert.equal(braked.buttons.filter(button=>button.selected).length,1);assert.equal(braked.buttons.find(button=>button.selected).outlineStyle,'dotted');
        assert.ok(visibleButton(braked,'play'),'paused control stays visible when inline status or viewport width changes');
        assert.equal(await player.locator('video').evaluate(v=>v.paused),false,'scan braking never pauses media');
      }
      await hub.evaluate(()=>NarbeScanManager.updateSettings({autoScan:false,parking:'off',scanSpeedIndex:1}));
      await expect(bar).toHaveAttribute('data-scan-state','step');await player.setViewportSize({width:800,height:600});
      report.checks.push('Inline Parked status and dotted pause outline stay clear in desktop and narrow windows while preserving media and scan identity');
    }
    const beforeHelp=await expectPlayerLayout(player);
    await select(player,'help');await expect(bar).toHaveAttribute('data-menu','help');
    const help=await record(player,service+'-help');
    assert.equal(help.buttons.length,6);assert.ok(help.panel.height<=beforeHelp.panel.height+48,'Help keeps one compact control row plus its short speech explanation');
    assert.ok(Math.abs((beforeHelp.mediaContent.height-help.mediaContent.height)-(help.panel.height-beforeHelp.panel.height))<=2,'Help explanation reserves its exact height above the dock without covering the image');
    assert.equal(await player.locator('video').evaluate(v=>v.paused),true);
    await select(player,'back-player');await expect(bar).toHaveAttribute('data-menu','player');
    await expectPlayerLayout(player);await select(player,'play');
    await expect.poll(()=>player.locator('video').evaluate(v=>v.paused)).toBe(false);

    // Keep the existing automatic-view toggle and then enter provider/native fullscreen.
    await select(player,'fullscreen');
    if(!await player.evaluate(()=>!!document.fullscreenElement))await select(player,'fullscreen');
    if(service==='native-video'){
      await expect.poll(()=>player.evaluate(()=>nativeVideoEntries)).toBeGreaterThan(0);
      await expect.poll(()=>player.evaluate(()=>document.fullscreenElement===document.querySelector('video'))).toBe(false);
    }else await expect.poll(()=>player.evaluate(()=>!!document.fullscreenElement)).toBe(true);
    await focusChoice(player,'play');
    const nativeLayout=await record(player,service+'-native-fullscreen');
    const nativePlay=nativeLayout.buttons.find(button=>button.command==='play').rect;
    await player.mouse.click(nativePlay.x+nativePlay.width/2,nativePlay.y+nativePlay.height/2);
    await expect.poll(()=>player.locator('video').evaluate(v=>v.paused)).toBe(true);
    await player.mouse.click(nativePlay.x+nativePlay.width/2,nativePlay.y+nativePlay.height/2);
    await expect.poll(()=>player.locator('video').evaluate(v=>v.paused)).toBe(false);
    if(service!=='native-video')await expect.poll(()=>player.evaluate(()=>!!document.fullscreenElement)).toBe(true);
    if(await player.evaluate(()=>!!document.fullscreenElement))await select(player,'fullscreen');
    await expect.poll(()=>player.evaluate(()=>!!document.fullscreenElement)).toBe(false);
    await record(player,service+'-after-fullscreen');
    if(service==='native-video'){
      const attempts=await player.evaluate(()=>nativeVideoEntries);
      await select(player,'fullscreen');
      await expect.poll(()=>player.evaluate(()=>!!document.fullscreenElement&&document.fullscreenElement!==document.querySelector('video'))).toBe(true);
      await record(player,'native-video-existing-wrapper');
      assert.equal(await player.evaluate(()=>nativeVideoEntries),attempts,'next fullscreen uses existing wrapper instead of repeating inaccessible video mode');
      await select(player,'fullscreen');await expect.poll(()=>player.evaluate(()=>!!document.fullscreenElement)).toBe(false);
      await expectPlayerLayout(player);
    }

    if(service==='netflix'){
      // Provider-owned profile focus and click behavior survives the layout fit.
      await player.evaluate(()=>{
        const gate=document.createElement('div');gate.className='profiles-gate-container';
        gate.style.cssText='position:fixed;inset:0;background:#222;z-index:999999';
        const profile=document.createElement('button');profile.className='profile-link';profile.textContent='Ben';
        profile.style.cssText='position:absolute;left:40px;top:40px;width:160px;height:80px';
        profile.onclick=()=>{profileClicks++;gate.remove()};gate.append(profile);document.body.append(gate);profile.focus();
      });
      await expect.poll(()=>player.locator('.profile-link').evaluate(el=>document.activeElement===el)).toBe(true);
      await player.locator('.profile-link').click();assert.equal(await player.evaluate(()=>profileClicks),1);
      await expectPlayerLayout(player);
    }

    // Unlock restores the provider's original DOM/style and keyboard access.
    await player.keyboard.press('Alt+Shift+B');await expect(bar).toHaveAttribute('data-access','browser');
    await expect.poll(()=>player.locator('video').evaluate(v=>({width:v.getBoundingClientRect().width,height:v.getBoundingClientRect().height}))).toEqual({width:640,height:360});
    assert.equal(await player.locator('video').getAttribute('style'),'width:640px;height:360px');
    assert.equal(await player.evaluate(()=>originalVideo===document.querySelector('video')&&originalStream===originalVideo.srcObject),true);
    await player.locator('#typing').fill('Native');await player.locator('#typing').press('Space');assert.equal(await player.locator('#typing').inputValue(),'Native ');
    await player.keyboard.press('Alt+Shift+B');await expect(bar).toHaveAttribute('data-access','controls');
    await expectPlayerLayout(player);await expect(bar).toHaveAttribute('data-selected','park');
    report.checks.push(service+': reserved image, compact single row and scrolling, Help resize, native fullscreen, provider restoration and scan identity');
    console.log('PASS '+report.checks.at(-1));await player.close();activePage=null;
  }
  assert.ok(report.checks.length,'At least one requested fixture must run');assert.deepEqual(report.errors,[]);report.result='passed';
})().catch(async error=>{
  report.result='failed';report.failure=error.stack;
  if(activePage&&!activePage.isClosed()){
    report.lastLayout=await measurePlayerLayout(activePage).catch(()=>null);
    await activePage.screenshot({path:path.join(artifacts,'failure.png')}).catch(()=>{});
  }
  console.error(error);process.exitCode=1;
}).finally(async()=>{
  await context?.close();await fs.mkdir(artifacts,{recursive:true});
  await fs.writeFile(path.join(artifacts,onlyCase?'browser-report-'+onlyCase+'.json':'browser-report.json'),JSON.stringify(report,null,2));
});
