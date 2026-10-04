// Controlled sign-in/profile fixtures; never signs into a real streaming account.
const {chromium,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const executablePath=process.argv.find(arg=>arg.startsWith('--browser-path='))?.slice('--browser-path='.length)||process.env.HUB_BROWSER_PATH;
const root=path.resolve(__dirname,'..'),base=process.env.HUB_TEST_ORIGIN||'http://127.0.0.1:4173';let context;
const fixture=service=>`<!doctype html><html><body>
<style>body{margin:40px;background:#eee}button,input{padding:12px;margin:8px}video{width:320px;height:180px}iframe{display:block;height:80px}</style>
${service==='netflix'?'<div class="profiles-gate-container"><div class="choose-profile"><button class="profile-link" data-profile="a"><span class="profile-name">Profile A</span></button><button class="profile-link" data-profile="b"><span class="profile-name">Profile B</span></button></div></div>':'<form id="signin"><input type="password" aria-label="Password"><button type="submit">Sign in</button></form>'}
<button id="page-button">Page button</button><input id="typing" aria-label="Site input"><iframe srcdoc='<input aria-label="Embedded input">'></iframe>
<canvas width="320" height="180"></canvas><video muted></video>
<script>
window.chosenProfile=null;window.pageClicks=0;window.pageKeys=0;
window.fixtureVideo=document.querySelector('video');window.fixtureVideoParent=fixtureVideo.parentElement;
window.barFocusEvents=0;
if(location.search.includes('focus-trap=1')){
  addEventListener('focusin',e=>{
    if(e.target.id==='benny-player-controls'){
      barFocusEvents++;
      const tile=document.querySelector('.profile-link');
      if(tile)queueMicrotask(()=>tile.focus());
    }
  },true);
  document.querySelector('.profile-link').focus();
}
document.querySelector('#page-button').onclick=()=>pageClicks++;
addEventListener('keydown',e=>{if(e.isTrusted&&['Space','Enter'].includes(e.code))pageKeys++;});
function play(){const canvas=document.querySelector('canvas');canvas.getContext('2d').fillRect(0,0,320,180);const v=document.querySelector('video');v.srcObject=canvas.captureStream(10);window.fixtureStream=v.srcObject;v.play();}
for(const tile of document.querySelectorAll('.profile-link'))tile.onclick=()=>{chosenProfile=tile.dataset.profile;document.querySelector('.profiles-gate-container').remove();play();};
const form=document.querySelector('form');if(form)form.onsubmit=e=>{e.preventDefault();form.remove();play();};
</script></body></html>`;
async function clickClosedShadowUnlock(player){
 // Read the actual button geometry through the test browser's debugger. The
 // production shadow root stays closed, and activation remains a real click.
 const session=await player.context().newCDPSession(player);
 try{
  const {root}=await session.send('DOM.getDocument',{depth:-1,pierce:true});
  const has=(node,name,value)=>{
   const attributes=node.attributes||[];
   for(let i=0;i<attributes.length;i+=2)if(attributes[i]===name&&attributes[i+1]===value)return true;
   return false;
  };
  const find=(node,predicate)=>{
   if(predicate(node))return node;
   for(const child of [...(node.children||[]),...(node.shadowRoots||[])]){
    const match=find(child,predicate);if(match)return match;
   }
  };
  const host=find(root,node=>has(node,'id','benny-player-controls'));
  assert.ok(host,'Companion host must exist');
  const unlock=find(host,node=>has(node,'data-command','suspend'));
  assert.ok(unlock,'Closed shadow Unlock button must exist');
  const {model}=await session.send('DOM.getBoxModel',{nodeId:unlock.nodeId});
  const box=model.border;
  await player.mouse.click((box[0]+box[2]+box[4]+box[6])/4,(box[1]+box[3]+box[5]+box[7])/4);
 }finally{await session.detach();}
}
async function expectNativeFrame(player){
 await expect(player.locator('[data-benny-player-view]')).toHaveCount(0);
 await expect(player.locator('[data-benny-player-frame]')).toHaveCount(1);
 await expect(player.locator('[data-benny-fit-video]')).toHaveCount(1);
 await expect(player.locator('[data-benny-player-ancestor],[data-benny-player-outside]')).toHaveCount(0);
 await expect.poll(()=>player.evaluate(()=>{
  const video=document.querySelector('video'),dock=document.querySelector('#benny-player-controls');
  const picture=video.getBoundingClientRect(),controls=dock.getBoundingClientRect();
  return video===window.fixtureVideo&&video.parentElement===window.fixtureVideoParent&&video.srcObject===window.fixtureStream&&
    picture.width>0&&picture.height>0&&picture.bottom<=controls.top+1;
 })).toBe(true);
}
(async()=>{
 const dir=path.join(root,'artifacts','access-extension-'+Date.now());await fs.cp(path.join(root,'extension'),dir,{recursive:true});
 const m=JSON.parse(await fs.readFile(path.join(dir,'manifest.json')));m.host_permissions=['https://www.netflix.com/*','https://www.primevideo.com/*','https://www.disneyplus.com/*'];await fs.writeFile(path.join(dir,'manifest.json'),JSON.stringify(m));
 // Expose only the isolated fixture build's shadow DOM for accessible button assertions.
 const content=path.join(dir,'player-content.js');await fs.writeFile(content,(await fs.readFile(content,'utf8')).replace("mode:'closed'","mode:location.search.includes('focus-trap=1')?'closed':'open'").replace("const r=await chrome.runtime.sendMessage({protocol:1,action,payload});", "if(action==='PLAYER_ACCESS'&&location.hostname==='www.disneyplus.com')return new Promise(()=>{});const r=await chrome.runtime.sendMessage({protocol:1,action,payload});"));
 // Force recurring provider mutations to catch observer microtask starvation.
 const adapters=path.join(dir,'player-adapters.js');await fs.writeFile(adapters,(await fs.readFile(adapters,'utf8')).replace('    function syncView(){',`    function syncView(){
        if(service==='netflix'&&location.search.includes('stress=1')){
          const probe=document.getElementById('page-button');window.layoutPasses=(window.layoutPasses||0)+1;
          if(probe){probe.dataset.layoutPasses=String(window.layoutPasses);probe.style.borderWidth=(window.layoutPasses%2+1)+'px';}
        }
 `));
 context=await chromium.launchPersistentContext(path.join(root,'artifacts','access-profile-'+Date.now()),{...(executablePath?{executablePath}:{channel:'chromium'}),headless:true,args:['--disable-extensions-except='+dir,'--load-extension='+dir]});
 await context.route('https://www.netflix.com/**',r=>r.fulfill({contentType:'text/html',body:fixture('netflix')}));
 await context.route('https://www.primevideo.com/**',r=>r.fulfill({contentType:'text/html',body:fixture('prime')}));
 await context.route('https://www.disneyplus.com/**',r=>r.fulfill({contentType:'text/html',body:fixture('disney')}));
 const errors=[];context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
 const hub=await context.newPage();await hub.goto(base+'/bennyshub/');await hub.locator('#modal-cancel').click();await hub.waitForFunction(()=>BennyExtension.supports('streaming'));
 await hub.evaluate(()=>{NarbeVoiceManager.updateSettings({ttsEnabled:false});NarbeScanManager.updateSettings({inputSensitivityIndex:0,scanSpeedIndex:0,autoScan:false});});
 async function launch(url,autoScan=false){await hub.bringToFront();const wait=context.waitForEvent('page');await hub.evaluate(({url,autoScan})=>BennyExtension.request('OPEN_STREAM',{url,settings:{autoScan,inputSensitivity:50,scanInterval:1000,tts:false,parking:'chosen'}}),{url,autoScan});const p=await wait;await p.waitForURL(url);await p.locator('#benny-player-controls').waitFor();await p.bringToFront();return p;}
 let player=await launch('https://www.primevideo.com/detail/fixture'),bar=player.locator('#benny-player-controls');
 await expect(bar.getByRole('button').last()).toHaveText('Return to Hub');
 await bar.getByRole('button',{name:'Unlock browser',exact:true}).click();await expect(bar).toHaveAttribute('data-access','browser');await expect(bar.locator('#browser-access-help')).toBeVisible();
 await player.reload();await expect(bar).toHaveAttribute('data-access','browser');await expect(bar.locator('#browser-access-help')).toBeVisible();
 await expect(bar.locator('button:visible')).toHaveCount(2);await expect(player.locator('iframe')).not.toHaveAttribute('inert','');
 await player.getByLabel('Password',{exact:true}).fill('synthetic test password');
 await player.locator('#typing').click();await player.keyboard.type('Sign in works');await player.keyboard.press('Space');assert.equal(await player.locator('#typing').inputValue(),'Sign in works ');
 await player.frameLocator('iframe').getByLabel('Embedded input').fill('iframe works');
 await player.locator('#page-button').click();assert.equal(await player.evaluate(()=>pageClicks),1);
 await player.getByRole('button',{name:'Sign in',exact:true}).click();await expect.poll(()=>player.evaluate(()=>document.querySelector('video').paused)).toBe(false);
 await bar.getByRole('button',{name:'Lock controls',exact:true}).click();await expect(bar).toHaveAttribute('data-access','controls');await expect(player.locator('iframe')).toHaveAttribute('inert','');
 const keys=await player.evaluate(()=>pageKeys);await player.mouse.click(70,70);await expect(bar).toHaveAttribute('data-selected','park');await player.keyboard.press('Space');await expect(bar).toHaveAttribute('data-selected','play');assert.equal(await player.evaluate(()=>pageKeys),keys);
 await expect.poll(()=>player.evaluate(()=>document.activeElement.id)).toBe('benny-player-controls');
 await bar.getByRole('button',{name:'Unlock browser',exact:true}).click();await player.keyboard.press('Alt+Shift+B');await expect(bar).toHaveAttribute('data-access','controls');
 console.log('Prime: visible unlock, typing, clicks, embedded form, reminder, relock and switch focus passed.');
 await player.close();
 player=await launch('https://www.netflix.com/watch/123');bar=player.locator('#benny-player-controls');await expect(bar.getByRole('button',{name:'Profile A',exact:true})).toBeVisible();assert.equal(await player.evaluate(()=>chosenProfile),null);
 await expect(bar).toHaveAttribute('data-selected','park');await player.keyboard.press('Space');await expect(bar).toHaveAttribute('data-selected','profile:Profile%20A:0');await player.waitForTimeout(100);await player.keyboard.press('Space');await expect(bar).toHaveAttribute('data-selected','profile:Profile%20B:0');await player.waitForTimeout(100);await player.keyboard.press('Enter');await expect.poll(()=>player.evaluate(()=>chosenProfile)).toBe('b');
 await expect(bar.getByRole('button',{name:'Play / Pause',exact:true})).toBeVisible();await expect(bar.locator('[data-profile]')).toHaveCount(0);assert.equal(await player.evaluate(()=>document.activeElement.id==='benny-player-controls'),false);console.log('Netflix: two-switch profile choice and automatic playback controls restored.');await player.close();
 player=await launch('https://www.netflix.com/watch/456');bar=player.locator('#benny-player-controls');await expect(bar.getByRole('button',{name:'Profile A',exact:true})).toBeVisible();await player.locator('.profile-link').first().click();await expect.poll(()=>player.evaluate(()=>chosenProfile)).toBe('a');await expect(bar.getByRole('button',{name:'Play / Pause',exact:true})).toBeVisible();console.log('Netflix: native profile tile remains mouse-clickable while switch controls stay locked.');
 await player.close();player=await launch('https://www.netflix.com/watch/789',true);bar=player.locator('#benny-player-controls');await expect(bar).toHaveAttribute('data-selected','park');await player.keyboard.press('Enter');await expect(bar).toHaveAttribute('data-selected','parked');await player.waitForTimeout(100);await player.keyboard.press('Enter');await expect(bar).toHaveAttribute('data-selected','profile:Profile%20A:0');await player.waitForTimeout(100);await player.keyboard.press('Enter');await expect.poll(()=>player.evaluate(()=>chosenProfile)).toBe('a');await expect(bar).toHaveAttribute('data-selected','park');console.log('Netflix: one-switch profile choice returns to the blank playback step.');
 await player.close();
 player=await launch('https://www.netflix.com/watch/999?stress=1');bar=player.locator('#benny-player-controls');
 await player.evaluate(()=>{document.addEventListener('focusin',()=>{const tile=document.querySelector('.profile-link');if(tile&&document.activeElement!==tile)tile.focus();});document.querySelector('#typing').focus();});
 await player.waitForTimeout(1200);assert.ok(await player.evaluate(()=>Number(document.querySelector('#page-button').dataset.layoutPasses)>0&&Number(document.querySelector('#page-button').dataset.layoutPasses)<40),'DOM updates must yield to user input');
 await player.keyboard.press('Alt+Shift+B');await expect(bar).toHaveAttribute('data-access','browser');await player.locator('.profile-link').first().click();await expect.poll(()=>player.evaluate(()=>chosenProfile)).toBe('a');
 await bar.getByRole('button',{name:'Lock controls',exact:true}).click();await expect(bar).toHaveAttribute('data-access','controls');await expectNativeFrame(player);
 console.log('Netflix stress: competing focus and provider mutations stay responsive; reserved native frame keeps media and surrounding layout intact.');await player.close();
 // Production closed shadow root: profiles retain native focus even when the
 // provider redirects focus in a microtask. Click Unlock by its rendered slot.
 for(const autoScan of [false,true]){
  player=await launch('https://www.netflix.com/watch/101?focus-trap=1',autoScan);bar=player.locator('#benny-player-controls');
  await expect(bar).toHaveAttribute('data-selected','park');
  await player.waitForTimeout(600);assert.equal(await player.evaluate(()=>barFocusEvents),0,'Netflix must never fight the provider for DOM focus');
  await clickClosedShadowUnlock(player);
  await expect(bar).toHaveAttribute('data-access','browser',{timeout:1000});
  await player.locator('#typing').fill('Profile setup');await player.keyboard.press('Space');assert.equal(await player.locator('#typing').inputValue(),'Profile setup ');
  await player.keyboard.press('Alt+Shift+B');await expect(bar).toHaveAttribute('data-access','controls');
  await player.locator('.profile-link').first().focus();
  const keys=await player.evaluate(()=>pageKeys);
  if(autoScan){await player.keyboard.press('Enter');await expect(bar).toHaveAttribute('data-selected','parked');await player.waitForTimeout(100);await player.keyboard.press('Enter');await expect(bar).toHaveAttribute('data-selected','profile:Profile%20A:0');await player.waitForTimeout(100);await player.keyboard.press('Enter');}
  else{await player.keyboard.press('Space');await expect(bar).toHaveAttribute('data-selected','profile:Profile%20A:0');await player.waitForTimeout(100);await player.keyboard.press('Space');await expect(bar).toHaveAttribute('data-selected','profile:Profile%20B:0');await player.waitForTimeout(100);await player.keyboard.press('Enter');}
  await expect.poll(()=>player.evaluate(()=>chosenProfile)).toBe(autoScan?'a':'b');
  assert.equal(await player.evaluate(()=>pageKeys),keys,'Switch keys must not leak to the focused provider');
  assert.equal(await player.evaluate(()=>barFocusEvents),0);
  await player.keyboard.press('Alt+Shift+B');await expect(bar).toHaveAttribute('data-access','browser');
  console.log('Netflix closed shadow focus trap: mouse Unlock, typing, relock and '+(autoScan?'one':'two')+'-switch selection passed without stealing native focus.');await player.close();
 }
 player=await launch('https://www.disneyplus.com/play/fixture');bar=player.locator('#benny-player-controls');
 await bar.getByRole('button',{name:'Unlock browser',exact:true}).click();await expect(bar).toHaveAttribute('data-access','browser',{timeout:1000});
 await player.getByLabel('Password',{exact:true}).fill('synthetic');await player.getByRole('button',{name:'Sign in',exact:true}).click();await expect.poll(()=>player.evaluate(()=>document.querySelector('video').paused)).toBe(false);
 await bar.getByRole('button',{name:'Lock controls',exact:true}).click();await expect(bar).toHaveAttribute('data-access','controls');
 await player.waitForTimeout(400);await expectNativeFrame(player);
 await bar.getByRole('button',{name:'Unlock browser',exact:true}).click();await expect(bar).toHaveAttribute('data-access','browser',{timeout:1000});await player.locator('#page-button').click();assert.equal(await player.evaluate(()=>pageClicks),1);
 await expect(player.locator('[data-benny-fit-video],[data-benny-player-frame]')).toHaveCount(0);assert.equal(await player.locator('video').evaluate(v=>getComputedStyle(v).position),'static');
 console.log('Disney: native player reserves the dock without media changes; Unlock restores native sizing despite a stalled background request.');
 assert.deepEqual(errors,[]);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>context?.close());
