(() => {
  if(window.__bennyPlayer)return;window.__bennyPlayer=true;
  let session,host,root,status,notice,nav,adapter,selected,paused=false,press=null,lastRelease=0,singleRunning=false;
  let holdTimer,reverseTimer,autoTimer,aliveTimer,startupTimer,focusTimer,observer,domTimer,focusRequest;
  let focusing=false,accessSave=Promise.resolve();
  let profileState=[];
  const buttons=[],blocked=new Map(),lastKeyUp=new Map();let removed=false,autoAt=Date.now();
  const send=async (action,payload)=>{const r=await chrome.runtime.sendMessage({protocol:1,action,payload});if(!r?.ok)throw Error(r?.error||'Companion unavailable');return r.data;};
  function speak(text){if(!session?.settings.tts)return;speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.rate=session.settings.rate;const voice=speechSynthesis.getVoices().find(v=>v.name===session.settings.voice);if(voice)u.voice=voice;speechSynthesis.speak(u);}
  function announce(text){status.textContent=text+(session.settings.autoScan&&!singleRunning&&!paused?' · Press Enter to scan':'');speak(text);}
  const controls=()=>[...root.querySelectorAll('nav button')].filter(b=>!b.closest('[hidden]'));
  function focusBar(){
    if(paused||removed||document.hidden||focusing)return;
    if(selected&&!controls().includes(selected))selected=null;
    const target=selected||host;
    if((target===host?document.activeElement:root.activeElement)===target)return;
    focusing=true;
    try{target.focus({preventScroll:true});}finally{focusing=false;}
  }
  function highlight(button,voice=true){
    selected=button;root.querySelectorAll('nav button').forEach(b=>b.classList.toggle('selected',b===selected));
    // Exposes the visible selection for accessibility/debugging without exposing page data.
    host.dataset.selected=selected.dataset.command;focusBar();if(voice)speak(selected.textContent);
  }
  function scan(delta){if(paused)return;const list=controls();highlight(list[(list.indexOf(selected)+delta+list.length)%list.length]);}
  function park(){singleRunning=false;selected=null;root.querySelectorAll('nav button').forEach(b=>b.classList.remove('selected'));host.dataset.selected='parked';status.textContent='Press Enter to scan';focusBar();}
  function startLoop(){singleRunning=true;autoAt=Date.now();highlight(controls()[0]);status.textContent='Enter: select';}
  function clearPress(){clearTimeout(holdTimer);clearInterval(reverseTimer);press=null;}
  function lockFrames(){
    if(paused)return;
    // A focused cross-origin iframe cannot bubble switch keys to the top document.
    // Inert prevents keyboard focus while media continues playing inside it.
    for(const frame of document.querySelectorAll('iframe')){if(!blocked.has(frame))blocked.set(frame,frame.inert);if(!frame.inert)frame.inert=true;}
  }
  function releaseFrames(){for(const [frame,inert]of blocked)frame.inert=inert;blocked.clear();}
  function restartStartup(){
    if(!session.startup)return;
    adapter.restartStartup();startupFinished=false;clearInterval(startupTimer);
    startupTimer=setInterval(runStartup,250);runStartup();
  }
  function syncProfiles(){
    if(!nav||removed)return;
    const choices=paused?[]:adapter.profileChoices();
    const changed=choices.length!==profileState.length||choices.some((c,i)=>c.element!==profileState[i]?.element||c.label!==profileState[i]?.label);
    if(changed){
      const hadProfiles=profileState.length>0;profileState=choices;
      nav.querySelectorAll('[data-profile]').forEach(b=>b.remove());
      const access=buttons.find(b=>b.dataset.command==='suspend');
      choices.forEach((choice,i)=>{
        const b=document.createElement('button');b.textContent=choice.label;b.dataset.profile='';b.dataset.command='profile:'+i;b.dataset.group='playback';
        b.onclick=()=>{highlight(b,false);clearPress();choice.element.click();syncProfiles();restartStartup();};
        nav.insertBefore(b,access);
      });
      clearPress();singleRunning=false;selected=null;
      if(choices.length)announce('Choose a Netflix profile using the bar or click a profile on the page.');
      else if(hadProfiles&&!paused){announce('Profile selected. Playback controls ready.');restartStartup();}
    }
    for(const b of buttons)b.hidden=(paused||choices.length>0)&&!['suspend','return'].includes(b.dataset.command);
    if(!paused&&changed){if(session.settings.autoScan)park();else highlight(controls()[0],false);}
  }
  async function act(command){
    adapter.cancelStartup();
    try{
      if(command==='return'){await send('RETURN_TO_HUB');return;}
      if(command==='suspend'){
        // Release input locally first. A stalled/restarting worker must never
        // prevent the user from escaping the locked playback controls.
        paused=!paused;clearPress();
        const unlocked=paused;
        accessSave=accessSave.catch(()=>{}).then(()=>send('PLAYER_ACCESS',{unlocked}));
        accessSave.catch(()=>{if(paused)status.textContent='Browser unlocked for this page. Lock controls when finished.';});
        const access=buttons.find(b=>b.dataset.command==='suspend');
        access.textContent=paused?'Lock controls':'Unlock browser';access.setAttribute('aria-pressed',String(paused));
        host.dataset.access=paused?'browser':'controls';notice.hidden=!paused;
        if(paused){singleRunning=false;releaseFrames();adapter.clearView();if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});}
        syncProfiles();
        if(!paused){lockFrames();adapter.syncView();if(session.settings.autoScan)park();else highlight(controls()[0],false);restartStartup();}
        announce(paused?'Browser unlocked. Sign in or choose your profile, then select Lock controls.':'Switch controls locked.');return;
      }
      if(command==='fullscreen'){announce(await adapter.fullscreen());return;}
      if(command==='play'){
        const result=await adapter.toggle();announce(result);
        // A user retry may open Plex's Resume dialog too; finish that sequence.
        if(session.startup&&result!=='Paused'){startupFinished=false;clearInterval(startupTimer);startupTimer=setInterval(runStartup,250);runStartup();}
        return;
      }
      if(['next','previous'].includes(command)){adapter.action(command);announce(command==='next'?'Next item':'Previous item');return;}
      const v=adapter.media();if(!v)throw Error('Start the video with Play first.');
      if(command==='back'||command==='forward'){if(!Number.isFinite(v.duration))throw Error('Seeking is unavailable for this live stream.');v.currentTime=Math.max(0,Math.min(v.duration,v.currentTime+(command==='back'?-10:10)));announce(command==='back'?'Rewind 10 seconds':'Fast forward 10 seconds');}
      else if(command==='up'||command==='down'){v.volume=Math.max(0,Math.min(1,v.volume+(command==='up'?.1:-.1)));announce('Volume '+Math.round(v.volume*100)+' percent');}
      else if(command==='mute'){v.muted=!v.muted;announce(v.muted?'Muted':'Unmuted');}
    }catch(e){announce(e.message||'This control is unavailable.');}
    finally{focusBar();}
  }
  let startupRunning=false,startupFinished=false;
  async function runStartup(){
    if(!session?.startup||startupRunning||startupFinished||paused||removed||profileState.length)return;
    startupRunning=true;
    try{
      const result=await adapter.startup();
      if(!['waiting','starting'].includes(result)){
        startupFinished=true;clearInterval(startupTimer);
        if(result!=='done')announce(result==='playing'?'Playing':result);
        focusBar();
      }
    }catch{startupFinished=true;clearInterval(startupTimer);announce('Use Play to start the video.');}
    finally{startupRunning=false;}
  }
  function keydown(e){
    if(!session||!host)return;
    if(e.altKey&&e.shiftKey&&e.code==='KeyB'){e.preventDefault();act('suspend');return;}
    if(paused||!['Space','Enter','NumpadEnter'].includes(e.code))return;
    e.preventDefault();e.stopImmediatePropagation();focusBar();
    if(e.repeat||press)return;
    const now=Date.now(),sensitivity=session.settings.inputSensitivity;
    // Match Scan Manager: cooldown after a valid release AND after this key's
    // latest release, including filtered tremor/bounce presses. No minimum hold.
    if(now-lastRelease<sensitivity||now-(lastKeyUp.get(e.code)||0)<sensitivity)return;
    press={code:e.code,back:false};
    if(e.code==='Space')holdTimer=setTimeout(()=>{
      if(!press)return;press.back=true;scan(-1);
      reverseTimer=setInterval(()=>{if(press?.back)scan(-1);},session.settings.scanInterval);
    },3000);
  }
  function keyup(e){
    if(!session||!host)return;
    if(paused||!['Space','Enter','NumpadEnter'].includes(e.code))return;
    e.preventDefault();e.stopImmediatePropagation();lastKeyUp.set(e.code,Date.now());if(!press||press.code!==e.code)return;
    const previous=press;clearPress();lastRelease=Date.now();autoAt=Date.now();
    if(e.code==='Space'){if(!previous.back)scan(1);}
    else if(session.settings.autoScan){
      if(!singleRunning)startLoop();
      else {const target=selected;target?.click();if(!paused)park();}
    }else selected?.click();
  }
  function keepFocus(e){
    if(paused||removed||focusing||e.target===host||focusRequest)return;
    // Provider dialogs can focus their own controls from focusin. Do not enter
    // a synchronous focus loop with them; switch keys remain captured above.
    focusRequest=setTimeout(()=>{focusRequest=null;focusBar();},50);
  }
  function schedulePageSync(){
    if(removed||domTimer)return;
    // Never rewrite layout from a MutationObserver microtask: our own changes
    // or a provider's rerenders can otherwise starve clicks and keyboard input.
    domTimer=setTimeout(()=>{
      domTimer=null;if(removed)return;
      syncProfiles();lockFrames();if(!host.isConnected)mount();
      if(!paused)adapter.syncView();runStartup();
    },100);
  }
  function protectBar(e){
    if(!host||paused||removed||!e.isTrusted||e.composedPath().includes(host))return;
    // A profile tile is an explicit user choice; permit it without releasing switch keys.
    if(profileState.some(choice=>e.composedPath().includes(choice.element))){
      if(e.type==='click')queueMicrotask(()=>{syncProfiles();focusBar();});
      return;
    }
    // Clicking the movie must not activate the provider, focus its video, or
    // strand switch input behind the overlay. Adapter clicks remain allowed.
    e.preventDefault();e.stopImmediatePropagation();clearPress();focusBar();
  }
  function mount(){
    if(removed)return;
    // Fullscreen makes content outside its element unfocusable. Keep the bar
    // inside that element as well as in the popover top layer, including video.
    const parent=document.fullscreenElement||document.documentElement;
    if(host.parentElement!==parent)parent.append(host);
    if(host.matches(':popover-open'))host.hidePopover();host.showPopover();focusBar();
  }
  function visibility(){clearPress();if(!document.hidden)focusBar();}
  async function playerReady(){
    // Navigation may reset the window state after windows.create/update.
    // Reapply once when this document is ready, never on a repeating focus loop.
    if(removed)return;
    try{await send('ENSURE_PLAYER_FULLSCREEN');}catch(e){announce(e.message||'Could not make the playback window fullscreen.');}
  }
  function cleanup(){
    removed=true;clearTimeout(domTimer);clearTimeout(focusRequest);clearInterval(aliveTimer);clearInterval(autoTimer);clearInterval(startupTimer);clearInterval(focusTimer);clearPress();observer?.disconnect();adapter?.clearView();releaseFrames();host?.remove();
    window.removeEventListener('keydown',keydown,true);window.removeEventListener('keyup',keyup,true);window.removeEventListener('blur',clearPress);window.removeEventListener('focus',focusBar);
    document.removeEventListener('focusin',keepFocus,true);document.removeEventListener('visibilitychange',visibility);document.removeEventListener('fullscreenchange',mount);window.__bennyPlayer=false;
    window.removeEventListener('load',playerReady);
    for(const type of ['pointerdown','mousedown','click','dblclick'])window.removeEventListener(type,protectBar,true);
  }
  window.addEventListener('keydown',keydown,true);window.addEventListener('keyup',keyup,true);
  for(const type of ['pointerdown','mousedown','click','dblclick'])window.addEventListener(type,protectBar,true);
  (async()=>{
    try{session=(await send('PLAYER_HELLO')).session;}catch{cleanup();return;}
    if(!globalThis.BennyPlayerAdapters){cleanup();return;}
    if(!document.documentElement)await new Promise(resolve=>document.addEventListener('DOMContentLoaded',resolve,{once:true}));
    adapter=globalThis.BennyPlayerAdapters.create(session.service);
    host=document.createElement('div');host.id='benny-player-controls';host.tabIndex=-1;host.setAttribute('popover','manual');host.setAttribute('aria-label','Player controls');host.style.cssText='position:fixed;inset:auto 12px 12px;width:calc(100% - 24px);max-width:none;margin:0 auto;padding:0;border:0;overflow:visible;background:transparent;z-index:2147483647;outline:none';root=host.attachShadow({mode:'closed'});
    const style=document.createElement('style');style.textContent=`
      :host{all:initial}
      section{box-sizing:border-box;width:100%;font:18px system-ui,sans-serif;background:#07121f;color:white;border:2px solid #8bccff;border-radius:16px;padding:14px 18px;box-shadow:0 0 30px #0009}
      nav{display:flex;gap:12px;flex-wrap:wrap;align-items:center;justify-content:center}
      button{flex:1 1 125px;font:700 17px system-ui;padding:12px 15px;min-height:52px;border:2px solid var(--edge);border-radius:8px;background:var(--fill);color:white;cursor:pointer}
      button[data-group="playback"]{--fill:#145343;--edge:#69d9b1}
      button[data-group="sound"]{--fill:#174c79;--edge:#7dc7ff}
      button[data-group="display"]{--fill:#583c81;--edge:#c9a6ff}
      button[data-group="access"]{--fill:#654817;--edge:#ffda80}
      button[data-group="exit"]{--fill:#812d3a;--edge:#ffa1b0}
      button.selected,button:focus-visible{outline:4px solid #ffe474;outline-offset:2px;box-shadow:inset 0 0 0 1px white}
      p{margin:12px 0 0;font-size:14px;text-align:center}
      @media(max-height:450px){section{padding:9px 12px}button{padding:7px 10px;min-height:42px}nav{gap:9px}p{margin-top:8px}}
    `;root.append(style);
    const bar=document.createElement('section');bar.setAttribute('aria-label',"Benny's Hub player controls");nav=document.createElement('nav');nav.setAttribute('aria-label','Playback controls');
    status=document.createElement('p');status.setAttribute('role','status');status.textContent='Space: next | Hold Space: back | Enter: select';notice=document.createElement('p');notice.hidden=true;notice.id='browser-access-help';
    notice.textContent='Browser unlocked: use your mouse and keyboard to sign in, choose a profile, or complete verification. Space and Enter now go to the website. Select Lock controls (or press Alt+Shift+B) to resume switch scanning.';
    bar.append(nav,status,notice);root.append(bar);
    for(const [command,label,group]of [['play','Play / Pause','playback'],['back','Rewind 10 seconds','playback'],['forward','Fast forward 10 seconds','playback'],['down','Volume -','sound'],['up','Volume +','sound'],['mute','Mute','sound'],['previous','Previous item','playback'],['next','Next item','playback'],['fullscreen','Fullscreen','display'],['suspend','Unlock browser','access'],['return','Return to Hub','exit']]){
      const b=document.createElement('button');b.textContent=label;b.dataset.command=command;b.dataset.group=group;b.onclick=()=>{highlight(b,false);act(command);};if(command==='suspend'){b.setAttribute('aria-pressed','false');b.setAttribute('aria-describedby','browser-access-help');}buttons.push(b);nav.append(b);
    }
    paused=session.browserUnlocked===true;
    if(paused){const access=buttons.find(b=>b.dataset.command==='suspend');access.textContent='Lock controls';access.setAttribute('aria-pressed','true');notice.hidden=false;}
    selected=buttons[0];mount();if(session.settings.autoScan)park();else highlight(selected,false);host.dataset.access=paused?'browser':'controls';syncProfiles();lockFrames();if(paused)announce('Browser unlocked. Sign in, then select Lock controls.');
    if(document.readyState==='complete')playerReady();else window.addEventListener('load',playerReady,{once:true});
    document.addEventListener('fullscreenchange',mount);window.addEventListener('keydown',keydown,true);window.addEventListener('keyup',keyup,true);window.addEventListener('blur',clearPress);window.addEventListener('focus',focusBar);document.addEventListener('focusin',keepFocus,true);document.addEventListener('visibilitychange',visibility);
    observer=new MutationObserver(schedulePageSync);observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style','hidden','aria-label','aria-disabled','disabled']});
    // Reclaim programmatic page focus, never another browser window or native application.
    focusTimer=setInterval(()=>{syncProfiles();if(!paused)adapter.syncView();if(document.hasFocus()&&document.activeElement!==host)focusBar();},300);
    autoTimer=setInterval(()=>{
      if(session.settings.autoScan&&singleRunning&&!paused&&!document.hidden&&document.hasFocus()&&!press&&Date.now()-autoAt>=session.settings.scanInterval){
        autoAt=Date.now();const list=controls();if(list.indexOf(selected)>=list.length-1)park();else scan(1);
      }
    },100);
    aliveTimer=setInterval(async()=>{try{
      const wasSingle=session.settings.autoScan;session=(await send('PLAYER_HELLO')).session;
      if(wasSingle!==session.settings.autoScan){clearPress();singleRunning=false;if(session.settings.autoScan)park();else highlight(controls()[0],false);}
      if(!host.isConnected)mount();
    }catch{cleanup();}},1000);
    if(!paused)adapter.syncView();if(session.startup){startupTimer=setInterval(runStartup,250);runStartup();}

  })();
})();
