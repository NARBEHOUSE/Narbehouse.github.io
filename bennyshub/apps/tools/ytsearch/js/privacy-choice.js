// Load external services and the search UI only after an explicit privacy choice.
(() => {
  const key='benny-web:v1:youtube.privacy-2026-09',dialog=document.getElementById('privacy-choice');
  const accept=document.getElementById('privacy-accept'),back=document.getElementById('privacy-back');
  const choices=[accept,back,...dialog.querySelectorAll('a')];
  let timer,held=null,holdTimer,repeatTimer,last=0,lastMove=Date.now(),starting=false,selected=accept;
  const prefs=()=>window.NarbeScanManager?.getSettings()||{};
  function speak(text){window.NarbeVoiceManager?.cancel();window.NarbeVoiceManager?.speak(text);}
  const available=()=>choices.filter(item=>!item.disabled);
  function current(){return available().includes(document.activeElement)?document.activeElement:available().includes(selected)?selected:available()[0];}
  function move(delta){const items=available(),i=items.indexOf(current());selected=items[(i+delta+items.length)%items.length];selected.focus();lastMove=Date.now();speak(selected.textContent);}
  dialog.addEventListener('focusin',e=>{if(choices.includes(e.target))selected=e.target;});
  function scan(){clearInterval(timer);lastMove=Date.now();timer=setInterval(()=>{if(dialog.open&&prefs().autoScan&&!held&&!document.hidden&&document.hasFocus()&&Date.now()-lastMove>=(prefs().scanInterval||2000))move(1);},100);}
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
    if(e.code==='Space'){if(!press.back)move(1);}else current()?.click();
  }
  function load(src){return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=()=>reject(Error('Could not load YouTube Search. Reconnect and reload to try again.'));document.body.append(s);});}
  async function start(){
    if(starting)return;starting=true;clearInterval(timer);clearPress();
    dialog.close();
    try{
      for(const name of ['speech','predictions','search','history','scanning','app'])await load('js/'+name+'.js');
      await Promise.all([load('https://www.youtube.com/iframe_api'),load('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=bennyTurnstileReady')]);
      window.removeEventListener('keydown',down,true);window.removeEventListener('keyup',up,true);window.removeEventListener('blur',clearPress);
    }catch(error){document.getElementById('privacy-error').textContent=error.message;accept.disabled=true;dialog.showModal();back.focus();scan();}
  }
  accept.onclick=()=>{try{localStorage.setItem(key,'accepted');}catch{}start();};
  back.onclick=()=>{if(parent!==window)parent.postMessage({action:'focusBackButton'},location.origin);else location.href='../../../index.html';};
  dialog.addEventListener('cancel',e=>{e.preventDefault();back.click();});
  let accepted=false;try{accepted=localStorage.getItem(key)==='accepted';}catch{}
  window.addEventListener('keydown',down,true);window.addEventListener('keyup',up,true);window.addEventListener('blur',clearPress);
  if(accepted){start();return;}
  dialog.showModal();accept.focus();
  speak(document.getElementById('privacy-description').textContent+' Choose Agree and continue, or Back to Hub.');
  scan();
})();
