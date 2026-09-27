const {chromium,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),base=process.env.HUB_TEST_ORIGIN||'http://127.0.0.1:4173';let context;
const cases=[
  ['youtube','www.youtube.com','class="ytp-fullscreen-button"'],
  ['plex','app.plex.tv','data-testid="fullscreenButton"'],
  ['netflix','www.netflix.com','data-uia="control-fullscreen-enter"'],
  ['prime','www.primevideo.com','class="atvwebplayersdk-fullscreen-button"'],
  ['paramount','www.paramountplus.com','class="vjs-fullscreen-control"'],
  ['tubi','tubitv.com','aria-label="Full screen"'],
  ...[['disney','www.disneyplus.com'],['hulu','www.hulu.com'],['max','play.max.com'],['pluto','pluto.tv']].map(([service,host])=>[service,host,'data-testid="fullscreen-button"']),
  ['fallback','www.youtube.com',null]
];
(async()=>{
  const dir=path.join(root,'artifacts','fullscreen-extension-'+Date.now());await fs.cp(path.join(root,'extension'),dir,{recursive:true});
  const manifest=JSON.parse(await fs.readFile(path.join(dir,'manifest.json')));
  manifest.host_permissions=[...new Set(cases.map(([,host])=>'https://'+host+'/*'))];await fs.writeFile(path.join(dir,'manifest.json'),JSON.stringify(manifest));
  context=await chromium.launchPersistentContext(path.join(root,'artifacts','fullscreen-profile-'+Date.now()),{channel:'chromium',headless:true,args:['--disable-extensions-except='+dir,'--load-extension='+dir]});
  context.setDefaultTimeout(15000);const errors=[];context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
  for(const [,host] of cases)await context.route('https://'+host+'/**',route=>{
    const name=new URL(route.request().url()).searchParams.get('fixture');const attrs=cases.find(c=>c[0]===name)?.[2];
    const toggle={youtube:'class="ytp-play-button"',plex:'data-testid="playPauseButton"',netflix:'data-uia="player-play-pause"',prime:'class="atvwebplayersdk-playpause-button"',paramount:'class="vjs-play-control"'}[name]||'data-testid="play-pause-button"';
    const next=name==='youtube'?'class="ytp-next-button"':name==='plex'?'data-testid="nextButton"':'aria-label="Next episode"';
    const previous=name==='youtube'?'class="ytp-prev-button"':name==='plex'?'data-testid="previousButton"':'aria-label="Previous episode"';
    const youtube=name==='youtube';
    const videoMarkup='<video muted style="width:640px;height:360px"></video>';
    return route.fulfill({contentType:'text/html',body:`<!doctype html><html><body><input id="typing"><section id="player" ${youtube?'class="html5-video-player"':''}>${youtube?'<div class="html5-video-container" style="position:relative;width:640px;height:360px">'+videoMarkup+'</div>':videoMarkup}${attrs?`<button id="provider-fullscreen" ${attrs} ${youtube?'style="visibility:hidden"':''} aria-label="Fixture control">Fullscreen</button>`:''}<button id="provider-toggle" ${toggle} style="visibility:hidden">Toggle playback</button><button id="provider-next" ${next}>Next</button><button id="provider-previous" ${previous}>Previous</button></section><script>
    window.fullscreenClicks=0;window.switchLeaks=0;window.playPauseClicks=0;window.episode=2;
    addEventListener('keydown',e=>{if(['Space','Enter'].includes(e.code))switchLeaks++;});
    const button=document.querySelector('#provider-fullscreen');if(button)button.onclick=()=>{fullscreenClicks++;document.querySelector('#player').requestFullscreen().catch(e=>{throw e;});};
    const video=document.querySelector('video');
    function startVideo(){if(!video.srcObject){const canvas=document.createElement('canvas');canvas.width=640;canvas.height=360;const ctx=canvas.getContext('2d');setInterval(()=>{ctx.fillStyle='navy';ctx.fillRect(0,0,640,360);},60);video.srcObject=canvas.captureStream(15);video.play().catch(()=>{});}}
    document.addEventListener('fullscreenchange',()=>{if(document.fullscreenElement)startVideo();});
    if(${youtube})startVideo();
    if(${youtube}){const related=document.createElement('aside');related.id='related';related.textContent='Related videos';related.style.cssText='position:fixed;right:0;top:0;width:240px;height:100vh;background:white;z-index:2147483647';document.body.append(related);}
    document.querySelector('#provider-toggle').onclick=()=>{playPauseClicks++;if(video.paused)video.play().catch(()=>{});else video.pause();};
    document.querySelector('#provider-next').onclick=()=>{episode++;};document.querySelector('#provider-previous').onclick=()=>{episode--;};
    </script></body></html>`});
  });
  const hub=await context.newPage();await hub.goto(base+'/bennyshub/index.html');await hub.locator('#modal-cancel').click();await hub.waitForFunction(()=>BennyExtension.supports('streaming'));
  const worker=context.serviceWorkers().find(w=>w.url().startsWith('chrome-extension:'));
  for(const [service,host,attrs] of cases){
    const opened=context.waitForEvent('page');
    await hub.evaluate(url=>BennyExtension.request('OPEN_STREAM',{url,settings:{tts:false,inputSensitivity:50,autoScan:false}}),'https://'+host+'/watch?fixture='+service);
    const player=await opened;await player.waitForSelector('#benny-player-controls');const bar=player.locator('#benny-player-controls');
    const playerWindow=await worker.evaluate(async()=>{const windows=await chrome.windows.getAll();return windows.find(w=>w.type==='popup');});assert.equal(playerWindow.state,'fullscreen');
    if(service==='youtube'){
      // Reproduce a window state reset during navigation, then verify load recovery.
      await worker.evaluate(id=>chrome.windows.update(id,{state:'normal'}),playerWindow.id);await player.reload();await player.waitForSelector('#benny-player-controls');
      await expect.poll(()=>worker.evaluate(async id=>(await chrome.windows.get(id)).state,playerWindow.id)).toBe('fullscreen');
    }
    await player.bringToFront();
    if(service==='youtube'){
      // Without any switch input, the nested video and outer player must fill
      // the browser window even while YouTube hides its fullscreen button.
      await expect(player.locator('#player')).toHaveAttribute('data-benny-player-view','');
      await expect.poll(()=>player.locator('video').evaluate(v=>{const r=v.getBoundingClientRect();return Math.abs(r.width-innerWidth)<2&&Math.abs(r.height-innerHeight)<2&&Math.abs(r.x)<2&&Math.abs(r.y)<2;})).toBe(true);
      assert.equal(await player.evaluate(()=>fullscreenClicks),0);
      assert.equal(await player.evaluate(()=>!!document.fullscreenElement),false);
      await expect(player.locator('#related')).toHaveCSS('opacity','0');
      // Recommendations inserted later by YouTube's SPA must also stay hidden.
      await player.evaluate(()=>{const extra=document.createElement('aside');extra.id='late-related';extra.textContent='More videos';document.body.append(extra);});
      await expect(player.locator('#late-related')).toHaveCSS('opacity','0');
      await player.screenshot({path:path.join(root,'artifacts','youtube-automatic-fullscreen.png')});
    }
    for(let i=0;i<8;i++){await player.waitForTimeout(70);await player.keyboard.press('Space');}
    await expect(bar).toHaveAttribute('data-selected','fullscreen');await player.waitForTimeout(70);await player.keyboard.press('Enter');
    if(service==='youtube'){
      // First activation leaves the automatic view; the next enters native fullscreen.
      await expect(player.locator('[data-benny-player-view]')).toHaveCount(0);
      await expect(player.locator('#related')).toHaveCSS('opacity','1');
      await expect(player.locator('#late-related')).toHaveCSS('opacity','1');
      assert.equal(await player.locator('.html5-video-container').getAttribute('style'),'position:relative;width:640px;height:360px');
      await player.locator('#provider-fullscreen').evaluate(b=>b.style.visibility='visible');
      await player.waitForTimeout(100);await player.keyboard.press('Enter');
    }
    await expect.poll(()=>player.evaluate(()=>document.fullscreenElement?.id)).toBe('player');
    assert.equal(await player.evaluate(()=>fullscreenClicks),attrs?1:0);
    await expect.poll(()=>player.evaluate(()=>document.activeElement?.id)).toBe('benny-player-controls');
    assert.equal(await bar.evaluate(el=>el.matches(':popover-open')),true);
    await player.mouse.click(100,100);await player.mouse.dblclick(110,110);
    await expect.poll(()=>player.evaluate(()=>document.activeElement?.id)).toBe('benny-player-controls');
    const scan=async count=>{for(let i=0;i<count;i++){await player.waitForTimeout(70);await player.keyboard.press('Space');}};
    const select=async()=>{await player.waitForTimeout(70);await player.keyboard.press('Enter');};
    await scan(1);await expect(bar).toHaveAttribute('data-selected','suspend');
    await scan(1);await expect(bar).toHaveAttribute('data-selected','return'); // Last control.
    await scan(1);await expect(bar).toHaveAttribute('data-selected','play');
    await expect.poll(()=>player.locator('video').evaluate(v=>v.paused)).toBe(false);
    await select();await expect.poll(()=>player.locator('video').evaluate(v=>v.paused)).toBe(true);
    await player.waitForTimeout(250);await select();await expect.poll(()=>player.locator('video').evaluate(v=>v.paused)).toBe(false);
    if(!['fallback','tubi'].includes(service))assert.equal(await player.evaluate(()=>playPauseClicks),2);
    await player.waitForTimeout(250);await scan(6);await expect(bar).toHaveAttribute('data-selected','previous');await select();assert.equal(await player.evaluate(()=>episode),1);
    await scan(1);await expect(bar).toHaveAttribute('data-selected','next');await select();assert.equal(await player.evaluate(()=>episode),2);
    await player.locator('#provider-next').evaluate(b=>b.disabled=true);await select();assert.equal(await player.evaluate(()=>episode),2);
    await scan(1);await expect(bar).toHaveAttribute('data-selected','fullscreen');
    await player.waitForTimeout(70);await player.keyboard.press('Enter');await expect.poll(()=>player.evaluate(()=>!!document.fullscreenElement)).toBe(false);
    if(!attrs)assert.equal(await player.locator('video').getAttribute('style'),'width:640px;height:360px');
    assert.equal(await player.evaluate(()=>switchLeaks),0);assert.equal(await player.locator('#typing').inputValue(),'');
    await expect.poll(()=>player.evaluate(()=>document.activeElement?.id)).toBe('benny-player-controls');
    assert.equal((await worker.evaluate(id=>chrome.windows.get(id),playerWindow.id)).state,'fullscreen');
    await player.close();console.log(service+': fullscreen, play/pause, previous/next, disabled controls, accidental clicks and bar focus passed');
  }
  assert.deepEqual(errors,[]);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>context?.close());
