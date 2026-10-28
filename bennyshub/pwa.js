/* Install-time offline library. No game needs to be opened to prepare it. */
(()=>{
  'use strict';
  const button=document.getElementById('offline-download');
  const installButton=document.getElementById('pwa-install');
  const status=document.getElementById('offline-status');
  const bar=document.getElementById('offline-progress');
  const summary=document.getElementById('offline-summary');
  const help=document.getElementById('pwa-install-help');
  if(!button||!status)return;
  let registration=null,promptEvent=null,started=false,lastPhase='',lastBucket=-1;
  const preference='bennyHubOfflineRequested';
  const standalone=()=>window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
  function requested(){try{return localStorage.getItem(preference)==='true';}catch{return false;}}
  function remember(){try{localStorage.setItem(preference,'true');}catch{}}
  function worker(){return navigator.serviceWorker.controller||registration?.active;}
  function requestStatus(){worker()?.postMessage({type:'HUB_GET_OFFLINE_STATUS'});}
  function render(state){
    const busy=state.phase==='checking'||state.phase==='downloading';
    button.disabled=busy||!worker();
    button.textContent=state.phase==='ready'?'Check for offline updates':state.phase==='paused'?'Resume offline download':'Download all games & tools';
    bar.hidden=!busy;
    if(state.total){bar.max=state.totalBytes||state.total;bar.value=state.completedBytes||state.completed||0;}
    else bar.removeAttribute('value');
    const percent=state.total?Math.floor(100*(state.completedBytes||state.completed||0)/(state.totalBytes||state.total)):0;
    const bucket=Math.floor(percent/5);
    let message='Download the library now to use built-in games and tools offline.';
    if(state.phase==='checking')message='Checking the offline library…';
    if(state.phase==='downloading')message='Downloading for offline play: '+percent+'% ('+state.completed+' of '+state.total+' files). Keep the Hub open and connected.';
    if(state.phase==='ready')message='Ready offline — all built-in game and tool files are saved on this device.';
    if(state.phase==='paused')message=(state.error||'The offline download is incomplete. Connect to the internet and choose Resume offline download.')+' Saved files will be reused.';
    // Announce meaningful progress without interrupting users for every file.
    if(state.phase!==lastPhase||bucket!==lastBucket||!busy){
      status.textContent=message;
      summary.textContent=message;
      lastPhase=state.phase;lastBucket=bucket;
    }
    summary.hidden=state.phase==='idle';
    if(!busy)started=false;
  }
  async function begin(){
    if(started||!worker())return;
    remember();started=true;
    render({phase:'checking'});
    // Best effort: browsers decide whether installed apps qualify for persistence.
    navigator.storage?.persist?.().catch(()=>{});
    worker().postMessage({type:'HUB_DOWNLOAD_OFFLINE'});
  }
  button.addEventListener('click',begin);
  window.addEventListener('beforeinstallprompt',event=>{
    event.preventDefault();promptEvent=event;installButton.hidden=false;
  });
  installButton.addEventListener('click',async()=>{
    if(!promptEvent)return;
    const event=promptEvent;promptEvent=null;installButton.hidden=true;
    try{
      await event.prompt();
      if((await event.userChoice).outcome==='accepted')begin();
    }catch{help.textContent="Use your browser's Install app option to install Benny's Hub.";}
  });
  window.addEventListener('appinstalled',()=>{
    installButton.hidden=true;promptEvent=null;remember();begin();
  });
  if(!('serviceWorker' in navigator)||!window.isSecureContext){
    status.textContent='Offline downloads require a supported browser and a secure (HTTPS) connection.';
    return;
  }
  navigator.serviceWorker.addEventListener('message',event=>{
    if(event.data?.type==='HUB_OFFLINE_STATUS')render(event.data);
  });
  function ready(){
    button.disabled=false;
    if(standalone()||requested())begin();else requestStatus();
  }
  navigator.serviceWorker.addEventListener('controllerchange',()=>{started=false;ready();});
  window.addEventListener('online',()=>{if(standalone()||requested())begin();});
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible'){
      // A suspended download may have lost its worker; the worker coalesces retries.
      if((standalone()||requested())&&navigator.onLine){started=false;begin();}
      else requestStatus();
    }
  });
  navigator.serviceWorker.register('./service-worker.js').then(async value=>{
    registration=value;
    await navigator.serviceWorker.ready;
    if(standalone()){installButton.hidden=true;help.textContent='Benny’s Hub is installed. Its offline library downloads automatically while this window is open.';}
    if(!started)ready();
  }).catch(()=>{
    status.textContent='Offline setup could not start. Reopen the Hub while connected and try again.';
  });
})();
