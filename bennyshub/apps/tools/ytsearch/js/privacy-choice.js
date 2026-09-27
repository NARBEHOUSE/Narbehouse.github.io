// Load external services and the search UI only after an explicit privacy choice.
(() => {
  const key='benny-web:v1:youtube.privacy-2026-09',dialog=document.getElementById('privacy-choice');
  const accept=document.getElementById('privacy-accept'),back=document.getElementById('privacy-back');
  const choices=[accept,back,...dialog.querySelectorAll('a')];
  let timer,held=null,holdTimer,repeatTimer,last=0,starting=false;
  const prefs=()=>window.NarbeScanManager?.getSettings()||{};
  function speak(text){window.NarbeVoiceManager?.cancel();window.NarbeVoiceManager?.speak(text);}
  function move(delta){const i=choices.indexOf(document.activeElement);const item=choices[(Math.max(i,0)+delta+choices.length)%choices.length];item.focus();speak(item.textContent);}
  function clearPress(){clearTimeout(holdTimer);clearInterval(repeatTimer);held=null;}
  function down(e){
    if(!dialog.open||!['Space','Enter','NumpadEnter'].includes(e.code))return;
    e.preventDefault();e.stopImmediatePropagation();
    if(e.repeat||held||Date.now()-last<(prefs().inputSensitivity??50))return;
    held={code:e.code,time:Date.now(),back:false};
    if(e.code==='Space')holdTimer=setTimeout(()=>{if(!held)return;held.back=true;move(-1);repeatTimer=setInterval(()=>move(-1),Math.max(250,prefs().scanInterval||2000));},3000);
  }
  function up(e){
    if(!dialog.open||!['Space','Enter','NumpadEnter'].includes(e.code))return;
    e.preventDefault();e.stopImmediatePropagation();
    if(!held||held.code!==e.code)return;
    const press=held;clearPress();last=Date.now();
    if(last-press.time<(prefs().inputSensitivity??50))return;
    if(e.code==='Space'){if(!press.back)move(1);}else if(choices.includes(document.activeElement))document.activeElement.click();
  }
  function load(src){return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=()=>reject(Error('Could not load YouTube Search. Reconnect and reload to try again.'));document.body.append(s);});}
  async function start(){
    if(starting)return;starting=true;clearInterval(timer);clearPress();
    window.removeEventListener('keydown',down,true);window.removeEventListener('keyup',up,true);
    dialog.close();
    try{
      for(const name of ['speech','predictions','search','history','scanning','app'])await load('js/'+name+'.js');
      await Promise.all([load('https://www.youtube.com/iframe_api'),load('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=bennyTurnstileReady')]);
    }catch(error){document.getElementById('privacy-error').textContent=error.message;accept.disabled=true;back.focus();dialog.showModal();}
  }
  accept.onclick=()=>{try{localStorage.setItem(key,'accepted');}catch{}start();};
  back.onclick=()=>{if(parent!==window)parent.postMessage({action:'focusBackButton'},location.origin);else location.href='../../../index.html';};
  dialog.addEventListener('cancel',e=>{e.preventDefault();back.click();});
  let accepted=false;try{accepted=localStorage.getItem(key)==='accepted';}catch{}
  if(accepted){start();return;}
  window.addEventListener('keydown',down,true);window.addEventListener('keyup',up,true);window.addEventListener('blur',clearPress);
  dialog.showModal();accept.focus();
  speak(document.getElementById('privacy-description').textContent+' Choose Agree and continue, or Back to Hub.');
  timer=setInterval(()=>{if(dialog.open&&prefs().autoScan&&!held&&!document.hidden&&Date.now()-last>=(prefs().scanInterval||2000)){last=Date.now();move(1);}},100);
})();
