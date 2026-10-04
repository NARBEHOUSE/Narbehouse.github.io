// Open Search directly; policies are available in the Hub footer.
(() => {
  const dialog=document.getElementById('startup-error'),back=document.getElementById('startup-back');
  let held=null,timer=null,repeat=null;
  const status=document.createElement('div');status.id='startup-scan-status';dialog.append(status);
  const scan=NarbeScanManager.createChoiceScan({choice:true,holdThreshold:2500,statusHost:status,items:[back],getId:el=>el.id,getLabel:el=>el.textContent,
    onHighlight(item,state){back.classList.toggle('focused',!!item&&!state.suspended);dialog.dataset.scanIndex=state.index;dialog.dataset.scanState=state.parked?'parked':state.braked?'paused':'running';},onSelect:item=>item.click()});scan.setSuspended(true);
  back.onclick=()=>{if(parent!==window)parent.postMessage({action:'focusBackButton'},location.origin);else location.href='../../../index.html';};
  dialog.addEventListener('cancel',e=>{e.preventDefault();back.click();});
  function reset(){clearTimeout(timer);clearInterval(repeat);held=null;scan.setSuspended(true);if(dialog.open)scan.setSuspended(false);}
  function down(e){
    if(!dialog.open||!['Space','Enter','NumpadEnter'].includes(e.code))return;e.preventDefault();e.stopImmediatePropagation();if(e.repeat||held)return;
    held={code:e.code,back:false,braking:e.code==='Space'&&scan.brakePress()};if(!held.braking)scan.setInputHeld(true);
    if(e.code==='Space'&&!held.braking)timer=setTimeout(()=>{if(!held)return;held.back=true;scan.step(-1);repeat=setInterval(()=>scan.step(-1),2000);},2500);
  }
  function up(e){
    if(!dialog.open||!['Space','Enter','NumpadEnter'].includes(e.code))return;e.preventDefault();e.stopImmediatePropagation();if(held?.code!==e.code)return;
    const press=held;held=null;clearTimeout(timer);clearInterval(repeat);if(press.braking)scan.brakeRelease();else if(!press.back){if(e.code==='Space')scan.step(1);else scan.select();}scan.setInputHeld(false);
  }
  let auto=NarbeScanManager.getSettings().autoScan;NarbeScanManager.subscribe(next=>{if(auto!==next.autoScan&&held&&!held.braking){clearTimeout(timer);clearInterval(repeat);held.back=true;}auto=next.autoScan;});
  function load(src){return new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=src;script.onload=resolve;script.onerror=()=>reject(Error('Reconnect and reopen YouTube Search to try again.'));document.body.append(script);});}
  window.addEventListener('keydown',down,true);window.addEventListener('keyup',up,true);
  window.addEventListener('blur',reset);document.addEventListener('narbe-input-cancelled',reset);
  (async()=>{
    try{
      for(const name of ['speech','predictions','search','history','scanning','app'])await load('js/'+name+'.js');
      await Promise.all([load('https://www.youtube.com/iframe_api'),load('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=bennyTurnstileReady')]);
      window.removeEventListener('keydown',down,true);window.removeEventListener('keyup',up,true);
    }catch(error){document.getElementById('startup-error-message').textContent=error.message;window.scanningManager?.stopAutoScan();window.settingsManager?.stopAutoScan();
      window.scanningManager?.clearKeyHighlights();window.scanningManager?.clearRowHighlights();
      dialog.showModal();document.activeElement?.blur();window.scanningManager?.scanner.sync(null);scan.setSuspended(false);scan.open([back]);
      window.NarbeVoiceManager?.speak('YouTube Search could not open. Select Back to Hub to return.');}
  })();
})();
