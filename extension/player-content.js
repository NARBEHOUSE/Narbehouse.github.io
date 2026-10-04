(() => {
  if(window.__bennyPlayer)return;window.__bennyPlayer=true;
  let session,host,root,status,notice,nav,adapter,selected,scanner,paused=false,press=null,lastRelease=0;
  let holdTimer,reverseTimer,aliveTimer,startupTimer,focusTimer,observer,domTimer,focusRequest;
  let focusing=false,accessSave=Promise.resolve(),settingsRevision=0,polling=false,layoutObserver;
  let profileState=[],helpOpen=false,helpNav,helpNotice;
  let toolbarSpeechEnabled=true,toolbarSpeechRevision=0,toolbarSpeechPending=0,toolbarSpeechSave=Promise.resolve();
  const buttons=[],blocked=new Map(),lastKeyUp=new Map();let removed=false;
  const send=async (action,payload)=>{if(['PLAYER_HELLO','RETURN_TO_HUB'].includes(action))payload={...payload,url:location.href};const r=await chrome.runtime.sendMessage({protocol:1,action,payload});if(!r?.ok)throw Error(r?.error||'Companion unavailable');return r.data;};
  function speak(text,force=false){
    // This local narration preference never writes the originating Hub's voice
    // settings. Local On speaks independently of Hub TTS, using its voice/rate.
    // A deliberate "Say I need help" also bypasses local Off.
    if(!toolbarSpeechEnabled&&!force)return {started:Promise.resolve(false),finished:Promise.resolve({reason:'disabled',started:false}),cancel(){}};
    return window.NarbeVoiceManager.speak(text,{force:true});
  }
  function applyToolbarSpeech(enabled){
    const next=enabled!==false,changed=next!==toolbarSpeechEnabled;toolbarSpeechEnabled=next;
    if(changed&&!toolbarSpeechEnabled)window.NarbeVoiceManager.cancel();
    const button=helpNav?.querySelector('[data-command="toolbar-speech"]');
    if(button){button.textContent='Toolbar Speech: '+(toolbarSpeechEnabled?'On':'Off');button.setAttribute('aria-pressed',String(toolbarSpeechEnabled));}
    if(host)host.dataset.toolbarSpeech=toolbarSpeechEnabled?'on':'off';
    scanner?.setItems(controls());
  }
  function receiveToolbarSpeech(message,sender){
    if(removed||sender?.id!==chrome.runtime.id||message?.protocol!==1||message.action!=='PLAYER_TOOLBAR_SPEECH'||typeof message.payload?.enabled!=='boolean')return;
    toolbarSpeechRevision++;if(!toolbarSpeechPending)applyToolbarSpeech(message.payload.enabled);
  }
  function announce(text){status.textContent=text;speak(text);}
  function scanHint(){return session.settings.autoScan&&session.settings.spaceBrake?'Enter: select | Space: pause/resume scan':'Space: next | Hold Space: back | Enter: select';}
  const controls=()=>[...root.querySelectorAll('nav button')].filter(b=>!b.closest('[hidden]'));
  // Netflix's modal focus management must own DOM focus. Switch selection is
  // independent: our document-start capture listeners still consume Space/Enter.
  const virtualFocus=()=>session?.service==='netflix';
  function focusBar(){
    if(virtualFocus())return;
    if(paused||removed||document.hidden||focusing)return;
    if(selected&&!controls().includes(selected))selected=null;
    const target=selected||host;
    if(target===host?document.activeElement===host&&!root.activeElement:root.activeElement===target)return;
    focusing=true;
    try{target.focus({preventScroll:true});}finally{focusing=false;}
  }
  function scrollChoiceIntoView(button){
    if(!button||button.closest('[hidden]'))return;
    // Scroll only this dock row; never scroll or refocus the provider page.
    const list=button.closest('nav'),item=button.getBoundingClientRect(),area=list.getBoundingClientRect();
    if(item.left<area.left+6)list.scrollLeft-=area.left+6-item.left;
    else if(item.right>area.right-6)list.scrollLeft+=item.right-area.right+6;
    if(item.top<area.top+6)list.scrollTop-=area.top+6-item.top;
    else if(item.bottom>area.bottom-6)list.scrollTop+=item.bottom-area.bottom+6;
  }
  function renderChoice(button,state){
    selected=button;
    root.querySelectorAll('nav button').forEach(b=>b.classList.toggle('selected',b===button));
    host.dataset.selected=state.parked?'parked':button?.dataset.command||'park';
    host.dataset.scanIndex=String(state.index);
    host.dataset.scanState=paused||state.suspended?'suspended':state.parked?'parked':state.braked?'paused':session.settings.autoScan?'running':'step';
    host.dataset.scanLoops=String(state.loops);
    if(state.parked)status.textContent='Enter: resume scanning';
    else if(status.textContent==='Enter: resume scanning')status.textContent=scanHint();
    scrollChoiceIntoView(button);
    focusBar();
  }
  // Pointer actions can directly choose a control. Switch actions already have
  // a highlighted identity and must not reset parking/brake state on selection.
  function highlight(button){
    scanner?.open(controls(),{restoreId:button?.dataset.command||null});
  }
  function scan(delta){if(!paused)scanner?.step(delta);}
  function resetScan(){scanner?.open(controls());scanner?.setSuspended(paused);}
  function clearPress(resetHeld=true){
    clearTimeout(holdTimer);clearInterval(reverseTimer);press=null;
    if(resetHeld&&scanner){
      if(scanner.getState().held){scanner.setSuspended(true);scanner.setSuspended(paused);}
      scanner.setInputHeld(false);
    }
  }
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
      const access=buttons.find(b=>b.dataset.command==='help');
      choices.forEach((choice,i)=>{
        const b=document.createElement('button');b.textContent=choice.label;b.dataset.profile='';b.dataset.command='profile:'+encodeURIComponent(choice.label)+':'+choices.slice(0,i).filter(c=>c.label===choice.label).length;b.dataset.group='playback';
        b.onclick=e=>{if(!e?.fromScan)highlight(b);clearPress();choice.element.click();syncProfiles();restartStartup();};
        nav.insertBefore(b,access);
      });
      // Redraw below preserves the current stable identity and parked/braked state.
      if(choices.length)announce('Choose a Netflix profile using the bar or click a profile on the page.');
      else if(hadProfiles&&!paused){announce('Profile selected. Playback controls ready.');restartStartup();}
    }
    for(const b of buttons)b.hidden=paused?!['suspend','return'].includes(b.dataset.command):choices.length>0&&!['help','suspend','return'].includes(b.dataset.command);
    scanner?.setItems(controls());
  }
  function helpMenu(open){
    helpOpen=open;clearPress();
    nav.hidden=open;helpNav.hidden=!open;helpNotice.hidden=!open;host.dataset.menu=open?'help':'player';
    resetScan();
  }
  async function act(command){
    adapter.cancelStartup();
    try{
      if(command==='help'){
        const didPause=adapter.pause();helpMenu(true);
        announce(didPause?'Video paused. Help and shortcuts.':'Help and shortcuts. No active video found.');return;
      }
      if(command==='toolbar-speech'){
        const enabled=!toolbarSpeechEnabled;toolbarSpeechRevision++;applyToolbarSpeech(enabled);
        status.textContent='Toolbar Speech: '+(enabled?'On':'Off');scanner.announceCurrent();
        toolbarSpeechPending++;
        toolbarSpeechSave=toolbarSpeechSave.catch(()=>{}).then(()=>send('PLAYER_TOOLBAR_SPEECH',{enabled})).finally(()=>{toolbarSpeechPending--;});
        toolbarSpeechSave.catch(()=>{if(!removed)status.textContent='Toolbar speech changed for this window. Could not save preference.';});return;
      }
      if(command==='say-help'){adapter.pause();status.textContent='I need help';speak('I need help',true);return;}
      if(command==='back-player'){helpMenu(false);announce('Playback controls. Choose Play when ready.');return;}
      if(command==='keyboard'||command==='phraseboard'||command==='home'){
        adapter.pause();await send('RETURN_TO_HUB',{destination:command});return;
      }
      if(command==='return'){await send('RETURN_TO_HUB');return;}
      if(command==='suspend'){
        // Release input locally first. A stalled/restarting worker must never
        // prevent the user from escaping the locked playback controls.
        paused=!paused;clearPress();if(helpOpen)helpMenu(false);
        const unlocked=paused;
        accessSave=accessSave.catch(()=>{}).then(()=>send('PLAYER_ACCESS',{unlocked}));
        accessSave.catch(()=>{if(paused)status.textContent='Browser unlocked for this page. Lock controls when finished.';});
        const access=buttons.find(b=>b.dataset.command==='suspend');
        access.textContent=paused?'Lock controls':'Unlock browser';access.setAttribute('aria-pressed',String(paused));
        host.dataset.access=paused?'browser':'controls';notice.hidden=!paused;
        if(paused){scanner.setSuspended(true);releaseFrames();adapter.clearView();if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});}
        syncProfiles();
        if(!paused){lockFrames();mount();resetScan();restartStartup();}
        announce(paused?'Browser unlocked. Sign in or choose your profile, then select Lock controls.':'Switch controls locked.');return;
      }
      if(command==='fullscreen'){const result=await adapter.fullscreen();if(!removed&&!paused)announce(result);return;}
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
    if(!session?.startup||startupRunning||startupFinished||paused||removed||helpOpen||profileState.length)return;
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
    if(!session||!host||!scanner)return;
    if(e.altKey&&e.shiftKey&&e.code==='KeyB'){e.preventDefault();e.stopImmediatePropagation();if(!e.repeat)act('suspend');return;}
    if(paused||!['Space','Enter','NumpadEnter'].includes(e.code))return;
    e.preventDefault();e.stopImmediatePropagation();focusBar();
    if(e.repeat||press)return;
    const now=Date.now(),sensitivity=session.settings.inputSensitivity;
    // Existing companion guard: consume a bounced press and its matched release.
    // A valid press has no minimum duration.
    if(now-lastRelease<sensitivity||now-(lastKeyUp.get(e.code)||0)<sensitivity)return;
    press={code:e.code,back:false,brake:false};
    if(e.code==='Space'&&scanner.brakePress()){press.brake=true;return;}
    // Preserve native selection holds and Brake Off's backward/forward controls.
    scanner.setInputHeld(true);
    if(e.code==='Space')holdTimer=setTimeout(()=>{
      if(!press)return;press.back=true;scan(-1);
      reverseTimer=setInterval(()=>{if(press?.back)scan(-1);},session.settings.scanInterval);
    },3000);
  }
  function keyup(e){
    if(!session||!host||!scanner)return;
    if(paused||!['Space','Enter','NumpadEnter'].includes(e.code))return;
    e.preventDefault();e.stopImmediatePropagation();lastKeyUp.set(e.code,Date.now());
    if(!press||press.code!==e.code)return;
    const previous=press;clearPress(false);lastRelease=Date.now();
    if(previous.brake){scanner.brakeRelease();return;}
    if(e.code==='Space'){if(!previous.back)scan(1);}
    else scanner.select();
    scanner.setInputHeld(false);
  }
  function applySettings(settings){
    const previousHint=scanHint();
    const changedMode=session.settings.autoScan!==settings.autoScan;
    const changedInterval=session.settings.scanInterval!==settings.scanInterval;
    session.settings=settings;
    // Keep Hub voice/rate while this tool owns whether narration is enabled.
    window.NarbePlatform.applyPreferences({...settings,tts:true});
    if(status?.textContent===previousHint)status.textContent=scanHint();
    // Mode changes retain scan focus and invalidate any pending native action.
    if(changedMode)clearPress();
    else if(changedInterval&&press?.back){
      clearInterval(reverseTimer);reverseTimer=setInterval(()=>{if(press?.back)scan(-1);},settings.scanInterval);
    }
  }
  function receiveSettings(message,sender){
    if(sender?.id!==chrome.runtime.id||message?.protocol!==1||message.action!=='PLAYER_SCAN_SETTINGS'||!session||removed)return;
    if(message.payload?.settings){settingsRevision++;applySettings(message.payload.settings);}
  }
  function keepFocus(e){
    if(virtualFocus()||paused||removed||focusing||e.target===host||focusRequest)return;
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
    if(!host||removed||!e.isTrusted)return;
    if(e.composedPath().includes(host)){
      // Keep mouse/touch bar actions from entering Netflix's modal focus trap.
      // Cancel only native focus, not the click that activates the control.
      if(virtualFocus()&&['pointerdown','mousedown'].includes(e.type))e.preventDefault();
      return;
    }
    if(paused)return;
    // A profile tile is an explicit user choice; permit it without releasing switch keys.
    if(profileState.some(choice=>e.composedPath().includes(choice.element))){
      if(e.type==='click')queueMicrotask(()=>{syncProfiles();focusBar();});
      return;
    }
    // Clicking the movie must not activate the provider, focus its video, or
    // strand switch input behind the overlay. Adapter clicks remain allowed.
    e.preventDefault();e.stopImmediatePropagation();clearPress();focusBar();
  }
  function updateFrame(){
    if(removed||!host?.isConnected)return;
    scrollChoiceIntoView(selected);
    const top=host.getBoundingClientRect().top;
    adapter.setFrame({left:12,top:12,width:Math.max(1,innerWidth-24),height:Math.max(1,top-12)});
    if(!paused)adapter.syncView();
  }
  function mount(){
    if(removed)return;
    // A replaced fullscreen VIDEO cannot contain a usable dock: descendants
    // have no layout and an outside dock is inert. Restore the browser frame.
    const full=document.fullscreenElement;
    if(!paused&&full?.tagName==='VIDEO')adapter.recoverVideoFullscreen().catch(()=>{if(!removed&&!paused)announce('Exit video fullscreen to use the controls.');});
    const parent=full?.tagName==='VIDEO'?document.documentElement:full||document.documentElement;
    if(host.parentElement!==parent)parent.append(host);
    if(host.matches(':popover-open'))host.hidePopover();host.showPopover();updateFrame();focusBar();
  }
  function capturePosition(){send('PLAYER_HELLO').catch(()=>{});}
  function visibility(){clearPress();if(document.hidden)capturePosition();else focusBar();}
  async function playerReady(){
    // Navigation may reset the window state after windows.create/update.
    // Reapply once when this document is ready, never on a repeating focus loop.
    if(removed)return;
    try{await send('ENSURE_PLAYER_FULLSCREEN');}catch(e){announce(e.message||'Could not make the playback window fullscreen.');}
  }
  function cleanup(){
    removed=true;layoutObserver?.disconnect();window.removeEventListener('resize',updateFrame);clearTimeout(domTimer);clearTimeout(focusRequest);clearInterval(aliveTimer);if(scanner){scanner.dispose();window.NarbeVoiceManager.cancel();}clearInterval(startupTimer);clearInterval(focusTimer);clearPress();observer?.disconnect();adapter?.clearView();releaseFrames();host?.remove();
    stopKeys();chrome.runtime.onMessage.removeListener(receiveSettings);chrome.runtime.onMessage.removeListener(receiveToolbarSpeech);window.removeEventListener('blur',clearPress);window.removeEventListener('focus',focusBar);
    document.removeEventListener('focusin',keepFocus,true);document.removeEventListener('visibilitychange',visibility);document.removeEventListener('fullscreenchange',mount);window.__bennyPlayer=false;
    window.removeEventListener('load',playerReady);window.removeEventListener('pagehide',capturePosition);
    for(const type of ['pointerdown','mousedown','click','dblclick'])window.removeEventListener(type,protectBar,true);
  }
  const stopKeys=window.NarbePlatform.input.capture({keydown,keyup});
  chrome.runtime.onMessage.addListener(receiveSettings);
  chrome.runtime.onMessage.addListener(receiveToolbarSpeech);
  for(const type of ['pointerdown','mousedown','click','dblclick'])window.addEventListener(type,protectBar,true);
  (async()=>{
    const speechRevision=toolbarSpeechRevision;
    try{session=(await send('PLAYER_HELLO')).session;}catch{cleanup();return;}
    if(!globalThis.BennyPlayerAdapters||!window.NarbeChoiceScan){cleanup();return;}
    window.NarbePlatform.applyPreferences({...session.settings,tts:true});
    if(speechRevision===toolbarSpeechRevision)applyToolbarSpeech(session.toolbarSpeechEnabled);
    if(!document.documentElement)await new Promise(resolve=>document.addEventListener('DOMContentLoaded',resolve,{once:true}));
    adapter=globalThis.BennyPlayerAdapters.create(session.service);
    host=document.createElement('div');host.id='benny-player-controls';host.dataset.version=chrome.runtime.getManifest().version;host.tabIndex=-1;host.setAttribute('popover','manual');host.setAttribute('aria-label','Player controls');host.style.cssText='position:fixed;inset:auto 12px 12px;width:calc(100% - 24px);max-width:none;margin:0 auto;padding:0;border:0;overflow:visible;background:transparent;z-index:2147483647;outline:none';root=host.attachShadow({mode:'closed'});
    const style=document.createElement('style');style.textContent=`
      :host{all:initial}
      section{box-sizing:border-box;display:flex;flex-direction:column;width:100%;max-height:50vh;font:16px system-ui,sans-serif;background:#07121f;color:white;border:2px solid #8bccff;border-radius:0 0 14px 14px;padding:4px 6px}
      [hidden]{display:none!important}
      .player-toolbar{display:flex;align-items:center;gap:6px;min-width:0}
      nav{display:flex;flex:1 1 auto;flex-wrap:nowrap;align-items:stretch;gap:4px;overflow-x:auto;overflow-y:hidden;min-width:0;min-height:0;padding:6px;scrollbar-width:thin;scroll-padding-inline:6px}
      .player-footer{display:flex;align-items:center;gap:6px;flex:0 0 auto;min-width:0;max-width:40%;padding:0 4px 0 0}
      .player-footer p{flex:0 1 auto;min-width:0;max-width:16rem;margin:0;font-size:12px;line-height:1.25;white-space:nowrap;text-overflow:ellipsis;overflow:hidden;text-align:right}
      .player-footer .narbe-scan-status-host{min-block-size:22px;min-width:0;padding:0}
      .player-footer .narbe-scan-status-badge{padding:1px 6px;font-size:12px;line-height:1.25;white-space:nowrap}
      button{flex:1 0 auto;font:700 14px/1.2 system-ui;padding:4px 6px;min-height:36px;min-width:36px;border:2px solid var(--edge);border-radius:7px;background:var(--fill);color:white;cursor:pointer;white-space:nowrap}
      nav[aria-label="Help and shortcuts"] button{white-space:nowrap}
      button[data-group="playback"]{--fill:#145343;--edge:#69d9b1}
      button[data-group="sound"]{--fill:#174c79;--edge:#7dc7ff}
      button[data-group="display"]{--fill:#583c81;--edge:#c9a6ff}
      button[data-group="help"]{--fill:#704326;--edge:#ffc48f}
      button[data-group="access"]{--fill:#654817;--edge:#ffda80}
      button[data-group="exit"]{--fill:#812d3a;--edge:#ffa1b0}
      button.selected,:host([data-access="browser"]) button:focus-visible{outline:4px solid #ffe474;outline-offset:2px;box-shadow:inset 0 0 0 1px white}
      /* Companion pause feedback stays compact: the selected outline carries it. */
      .player-toolbar [data-narbe-scan-paused]{outline-style:dotted!important}
      .player-toolbar [data-narbe-scan-pause-label]::before{content:none;display:none}
      :host([data-scan-state="paused"]) .player-footer .narbe-scan-status-badge{display:none}
      p{margin:4px 6px;font-size:13px;text-align:center}
    `+globalThis.BennyScanBadgeCSS;root.append(style);
    const bar=document.createElement('section');bar.setAttribute('aria-label',"Benny's Hub player controls");nav=document.createElement('nav');nav.setAttribute('aria-label','Playback controls');
    status=document.createElement('p');status.setAttribute('role','status');status.textContent=scanHint();notice=document.createElement('p');notice.hidden=true;notice.id='browser-access-help';
    notice.textContent='Browser unlocked: use your mouse and keyboard to sign in, choose a profile, or complete verification. Space and Enter now go to the website. Select Lock controls (or press Alt+Shift+B) to resume switch scanning.';
    helpNav=document.createElement('nav');helpNav.hidden=true;helpNav.setAttribute('aria-label','Help and shortcuts');
    for(const [command,label,group]of [['say-help','Say I need help','help'],['keyboard','Open keyboard','sound'],['phraseboard','Open phrase board','display'],['toolbar-speech','Toolbar Speech: On','sound'],['back-player','Back to video','playback'],['home','Hub main menu','exit']]){
      const b=document.createElement('button');b.textContent=label;b.dataset.command=command;b.dataset.group=group;b.onclick=e=>{if(!e?.fromScan)highlight(b);act(command);};helpNav.append(b);
    }
    helpNotice=document.createElement('p');helpNotice.hidden=true;helpNotice.textContent='Turn off spoken controls while watching. “Say I need help” still speaks when selected.';
    const scanStatus=document.createElement('div');scanStatus.setAttribute('aria-label','Scan status');
    const footer=document.createElement('div');footer.className='player-footer';footer.append(status,scanStatus);
    const toolbar=document.createElement('div');toolbar.className='player-toolbar';toolbar.append(nav,helpNav,footer);
    bar.append(toolbar,helpNotice,notice);root.append(bar);
    for(const [command,label,group]of [['play','Play / Pause','playback'],['back','Rewind 10 seconds','playback'],['forward','Fast forward 10 seconds','playback'],['down','Volume -','sound'],['up','Volume +','sound'],['mute','Mute/Unmute','sound'],['previous','Previous item','playback'],['next','Next item','playback'],['fullscreen','Fullscreen','display'],['help','Help & shortcuts','help'],['suspend','Unlock browser','access'],['return','Return to Hub','exit']]){
      const b=document.createElement('button');
      const shortLabel={back:'Rewind 10s',forward:'Forward 10s',previous:'Previous',next:'Next',help:'Help',return:'Hub'}[command];
      b.textContent=shortLabel||label;if(shortLabel)b.setAttribute('aria-label',label);
      b.dataset.command=command;b.dataset.group=group;b.onclick=e=>{if(!e?.fromScan)highlight(b);act(command);};if(command==='suspend'){b.setAttribute('aria-pressed','false');b.setAttribute('aria-describedby','browser-access-help');}buttons.push(b);nav.append(b);
    }
    applyToolbarSpeech(toolbarSpeechEnabled);
    paused=session.browserUnlocked===true;
    if(paused){const access=buttons.find(b=>b.dataset.command==='suspend');access.textContent='Lock controls';access.setAttribute('aria-pressed','true');notice.hidden=false;}
    host.dataset.access=paused?'browser':'controls';
    scanner=window.NarbeChoiceScan.create(window.NarbePlatform.scanSettings,{
      choice:true,holdThreshold:3000,statusHost:scanStatus,items:controls(),
      getId:button=>button.dataset.command,getLabel:button=>button.getAttribute('aria-label')||button.textContent,
      onHighlight:renderChoice,onSelect:button=>button.onclick?.({fromScan:true}),speak
    });
    scanner.setSuspended(paused);mount();syncProfiles();lockFrames();if(paused)announce('Browser unlocked. Sign in, then select Lock controls.');
    layoutObserver=new ResizeObserver(updateFrame);for(const element of [host,nav,helpNav])layoutObserver.observe(element);window.addEventListener('resize',updateFrame);
    if(document.readyState==='complete')playerReady();else window.addEventListener('load',playerReady,{once:true});
    document.addEventListener('fullscreenchange',mount);window.addEventListener('blur',clearPress);window.addEventListener('focus',focusBar);document.addEventListener('focusin',keepFocus,true);document.addEventListener('visibilitychange',visibility);
    window.addEventListener('pagehide',capturePosition);
    observer=new MutationObserver(schedulePageSync);observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style','hidden','aria-label','aria-disabled','disabled']});
    // Reclaim programmatic page focus, never another browser window or native application.
    focusTimer=setInterval(()=>{syncProfiles();if(!paused)adapter.syncView();if(document.hasFocus()&&document.activeElement!==host)focusBar();},300);
    aliveTimer=setInterval(async()=>{
      if(polling)return;polling=true;const revision=settingsRevision,speechRevision=toolbarSpeechRevision;
      try{
        const updated=(await send('PLAYER_HELLO')).session;
        if(removed)return;
        if(revision===settingsRevision)applySettings(updated.settings);
        if(!toolbarSpeechPending&&speechRevision===toolbarSpeechRevision)applyToolbarSpeech(updated.toolbarSpeechEnabled);
        session={...updated,settings:session.settings};
        if(!host.isConnected)mount();
      }catch{cleanup();}finally{polling=false;}
    },1000);
    if(!paused)adapter.syncView();if(session.startup){startupTimer=setInterval(runStartup,250);runStartup();}

  })();
})();
