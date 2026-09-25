/** Shared file/link importer; saved copies remain available without the original host. */
RT.castleFiles=(function(){
  'use strict';
  let dialog,callbacks={},scan=-1,timer=null,request=null,generation=0;
  const $=id=>document.getElementById(id);
  function announce(text){$('castleFileStatus').textContent=text;RT.util.speak(text);}
  function controls(){return [...dialog.querySelectorAll('[data-file-choice]')].filter(b=>!b.disabled);}
  function highlight(){controls().forEach((b,i)=>{b.classList.toggle('fileScan',i===scan);b.setAttribute('aria-current',String(i===scan));});}
  function step(){const buttons=controls();scan=(scan+1)%buttons.length;highlight();const b=buttons[scan];RT.util.speak(b.getAttribute('aria-label')||b.textContent);}
  function busy(value){$('castleFilePick').disabled=value;$('castleFileURL').disabled=value;$('castleFileLoad').disabled=value;scan=-1;highlight();}
  async function run(read){
    if(request)return;const token=++generation;request=new AbortController();busy(true);announce('Opening adventure…');
    try{const raw=await read(request.signal);if(token!==generation||!dialog.open)return;if(raw.type==='ballista-campaign'){const saved=RT.customCampaigns.importData(raw);callbacks.onCampaign?.(saved);dialog.close();RT.util.speak(saved.name+' saved in My Campaigns.');return;}const saved=RT.courses.importData(raw);callbacks.onImport?.(saved);dialog.close();RT.util.speak(saved.length+' castle'+(saved.length===1?'':'s')+' saved in My Castles.');}
    catch(error){if(token===generation&&dialog.open)announce(error.message);}
    finally{if(token===generation){request=null;busy(false);}}
  }
  function init(){
    if(dialog)return;
    dialog=document.createElement('dialog');dialog.id='castleFiles';dialog.tabIndex=-1;dialog.setAttribute('aria-labelledby','castleFileTitle');
    dialog.innerHTML='<h2 id="castleFileTitle">Bring your adventure</h2><p>Open a castle or full campaign JSON file, or paste a direct JSON link from your own storage.</p><button id="castleFilePick" data-file-choice>Choose JSON file</button><input id="castleFileInput" type="file" accept=".json,application/json" hidden><label for="castleFileURL">JSON link</label><input id="castleFileURL" data-file-choice type="url" inputmode="url" placeholder="https://your-site/castle.json" aria-label="JSON link. Select to type or paste a link."><button id="castleFileLoad" data-file-choice>Import from link</button><p id="castleFileStatus" role="status" aria-live="polite">Imported adventures stay in this browser’s library.</p><button id="castleFileClose" data-file-choice>Back</button>';
    document.body.append(dialog);
    dialog.addEventListener('pointerdown',()=>{scan=-1;highlight();});
    $('castleFilePick').onclick=()=>$('castleFileInput').click();
    $('castleFileInput').onchange=e=>{const file=e.target.files[0];e.target.value='';if(file)run(()=>RT.courses.readFile(file));};
    $('castleFileLoad').onclick=()=>run(signal=>RT.courses.readURL($('castleFileURL').value.trim(),{signal}));
    $('castleFileClose').onclick=()=>dialog.close();
    dialog.addEventListener('close',()=>{++generation;request?.abort();request=null;clearInterval(timer);busy(false);callbacks.onClose?.();});
    // Keep game switches and editor shortcuts out of this form. Typing a URL remains native.
    for(const type of ['keydown','keyup'])document.addEventListener(type,e=>{
      if(!dialog.open)return;
      e.stopImmediatePropagation();
      if(e.code==='Tab'){scan=-1;highlight();return;}
      if(e.target===$('castleFileURL')){if(e.code==='Enter'&&type==='keydown'){e.preventDefault();if(!e.repeat){dialog.focus();$('castleFileLoad').click();}}return;}
      if(!['Space','Enter','NumpadEnter'].includes(e.code))return;
      e.preventDefault();if(type!=='keyup'||e.repeat)return;
      if(e.code==='Space')step();else {const b=controls()[scan]||(controls().includes(document.activeElement)?document.activeElement:null);if(b?.tagName==='INPUT')b.focus();else b?.click();}
    },true);
  }
  function open(options={}){
    init();callbacks=options;scan=-1;busy(false);$('castleFileURL').value='';$('castleFileStatus').textContent='Imported adventures stay in this browser’s library.';
    dialog.showModal();dialog.focus();highlight();clearInterval(timer);
    if(RT.util.sm()?.getSettings().autoScan)timer=setInterval(()=>{if(document.activeElement!==$('castleFileURL'))step();},RT.util.sm().getScanInterval()||2000);
  }
  return{open,isOpen:()=>!!dialog?.open};
})();
