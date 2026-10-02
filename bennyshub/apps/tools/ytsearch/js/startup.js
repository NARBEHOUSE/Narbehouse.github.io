// Open Search directly; policies are available in the Hub footer.
(() => {
  const dialog=document.getElementById('startup-error'),back=document.getElementById('startup-back');
  let held=null,selected=false,scanTimer=null;
  function focusBack(){selected=true;back.focus();}
  function restartScan(){
    clearInterval(scanTimer);scanTimer=null;
    if(dialog.open&&window.NarbeScanManager?.getSettings().autoScan)scanTimer=setInterval(focusBack,window.NarbeScanManager.getScanInterval());
  }
  window.NarbeScanManager?.subscribe(restartScan);
  back.onclick=()=>{if(parent!==window)parent.postMessage({action:'focusBackButton'},location.origin);else location.href='../../../index.html';};
  dialog.addEventListener('cancel',e=>{e.preventDefault();back.click();});
  function down(e){
    if(!dialog.open||!['Space','Enter','NumpadEnter'].includes(e.code))return;
    e.preventDefault();e.stopImmediatePropagation();
    if(!e.repeat&&!held)held=e.code;
  }
  function up(e){
    if(!dialog.open||!['Space','Enter','NumpadEnter'].includes(e.code))return;
    e.preventDefault();e.stopImmediatePropagation();
    if(held!==e.code)return;held=null;
    if(e.code==='Space'){focusBack();restartScan();}else if(selected)back.click();
  }
  function load(src){return new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=src;script.onload=resolve;script.onerror=()=>reject(Error('Reconnect and reopen YouTube Search to try again.'));document.body.append(script);});}
  window.addEventListener('keydown',down,true);window.addEventListener('keyup',up,true);
  window.addEventListener('blur',()=>{held=null;});
  (async()=>{
    try{
      for(const name of ['speech','predictions','search','history','scanning','app'])await load('js/'+name+'.js');
      await Promise.all([load('https://www.youtube.com/iframe_api'),load('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=bennyTurnstileReady')]);
      window.removeEventListener('keydown',down,true);window.removeEventListener('keyup',up,true);
    }catch(error){document.getElementById('startup-error-message').textContent=error.message;window.scanningManager?.stopAutoScan();window.settingsManager?.stopAutoScan();
      window.scanningManager?.clearKeyHighlights();window.scanningManager?.clearRowHighlights();
      selected=false;dialog.showModal();document.activeElement?.blur();restartScan();
      window.NarbeVoiceManager?.speak('YouTube Search could not open. Select Back to Hub to return.');}
  })();
})();
