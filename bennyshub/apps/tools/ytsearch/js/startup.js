// Show the one-time under-13/caregiver notice, then open Search. Full policies are in the Hub footer.
// YouTube and Cloudflare scripts load only after Continue; the choice is remembered per browser.
(() => {
  const NOTICE_KEY='benny-web:v1:youtube.notice-2026-11';
  const dialog=document.getElementById('startup-error'),back=document.getElementById('startup-back');
  const notice=document.getElementById('yt-notice'),accept=document.getElementById('yt-notice-continue'),decline=document.getElementById('yt-notice-back');
  const buttons=[back,accept,decline],openDialog=()=>dialog.open?dialog:notice.open?notice:null;
  let held=null,timer=null,repeat=null,starting=false;
  const status=document.createElement('div');status.id='startup-scan-status';dialog.append(status);
  const scan=NarbeScanManager.createChoiceScan({choice:true,holdThreshold:2500,statusHost:status,items:[back],getId:el=>el.id,getLabel:el=>el.textContent,
    onHighlight(item,state){buttons.forEach(el=>el.classList.toggle('focused',el===item&&!state.suspended));const host=openDialog();if(host){host.dataset.scanIndex=state.index;host.dataset.scanState=state.parked?'parked':state.braked?'paused':'running';}},onSelect:item=>item.click()});scan.setSuspended(true);
  function exit(){if(parent!==window)parent.postMessage({action:'focusBackButton'},location.origin);else location.href='../../../index.html';}
  back.onclick=exit;decline.onclick=exit;
  dialog.addEventListener('cancel',e=>{e.preventDefault();exit();});notice.addEventListener('cancel',e=>{e.preventDefault();exit();});
  accept.onclick=()=>{try{localStorage.setItem(NOTICE_KEY,'continued');}catch{}scan.setSuspended(true);window.NarbeVoiceManager?.cancel?.();notice.close();start();};
  function reset(){clearTimeout(timer);clearInterval(repeat);held=null;scan.setSuspended(true);if(openDialog())scan.setSuspended(false);}
  function down(e){
    if(!openDialog()||!['Space','Enter','NumpadEnter'].includes(e.code))return;e.preventDefault();e.stopImmediatePropagation();if(e.repeat||held)return;
    held={code:e.code,back:false,braking:e.code==='Space'&&scan.brakePress()};if(!held.braking)scan.setInputHeld(true);
    if(e.code==='Space'&&!held.braking)timer=setTimeout(()=>{if(!held)return;held.back=true;scan.step(-1);repeat=setInterval(()=>scan.step(-1),2000);},2500);
  }
  function up(e){
    if(!openDialog()||!['Space','Enter','NumpadEnter'].includes(e.code))return;e.preventDefault();e.stopImmediatePropagation();if(held?.code!==e.code)return;
    const press=held;held=null;clearTimeout(timer);clearInterval(repeat);if(press.braking)scan.brakeRelease();else if(!press.back){if(e.code==='Space')scan.step(1);else scan.select();}scan.setInputHeld(false);
  }
  let auto=NarbeScanManager.getSettings().autoScan;NarbeScanManager.subscribe(next=>{if(auto!==next.autoScan&&held&&!held.braking){clearTimeout(timer);clearInterval(repeat);held.back=true;}auto=next.autoScan;});
  function load(src){return new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=src;script.onload=resolve;script.onerror=()=>reject(Error('Reconnect and reopen YouTube Search to try again.'));document.body.append(script);});}
  window.addEventListener('keydown',down,true);window.addEventListener('keyup',up,true);
  window.addEventListener('blur',reset);document.addEventListener('narbe-input-cancelled',reset);
  async function start(){
    if(starting)return;starting=true;
    try{
      for(const name of ['speech','predictions','search','history','scanning','app'])await load('js/'+name+'.js');
      await Promise.all([load('https://www.youtube.com/iframe_api'),load('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=bennyTurnstileReady')]);
      window.removeEventListener('keydown',down,true);window.removeEventListener('keyup',up,true);
    }catch(error){document.getElementById('startup-error-message').textContent=error.message;window.scanningManager?.stopAutoScan();window.settingsManager?.stopAutoScan();
      window.scanningManager?.clearKeyHighlights();window.scanningManager?.clearRowHighlights();
      dialog.append(status);dialog.showModal();document.activeElement?.blur();window.scanningManager?.scanner.sync(null);scan.setSuspended(false);scan.open([back]);
      window.NarbeVoiceManager?.speak('YouTube Search could not open. Select Back to Hub to return.');}
  }
  let continued=false;try{continued=localStorage.getItem(NOTICE_KEY)==='continued';}catch{}
  if(continued){start();return;}
  notice.append(status);notice.showModal();document.activeElement?.blur();scan.setSuspended(false);scan.open([accept,decline]);
  window.NarbeVoiceManager?.speak('Before using YouTube Search. YouTube Search is not made for children under 13. A parent or caregiver should decide whether to use it. Choose Continue, or Back to Hub.');
})();
