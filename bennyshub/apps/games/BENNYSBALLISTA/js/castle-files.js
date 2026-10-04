/** Shared file/link importer; saved copies remain available without the original host. */
RT.castleFiles=(function(){
  'use strict';
  let dialog,callbacks={},scan=-1,timer=null,request=null,generation=0;
  const $=id=>document.getElementById(id);
  let choiceScanner=null,statusHost=null,spaceDown=false,enterCode=null,spaceBraking=false,spaceLong=false,spaceCancelled=false;
  let holdTimer=null,reverseTimer=null,previousAuto=false;
  function clearInput(){
    clearTimeout(holdTimer);clearInterval(reverseTimer);
    spaceDown=spaceBraking=spaceLong=spaceCancelled=false;enterCode=null;
    if(choiceScanner){choiceScanner.setSuspended(true);syncTyping();}
  }
  function syncTyping(){
    if(!choiceScanner)return;
    const suspended=!dialog.open||document.activeElement===$('castleFileURL');
    if(choiceScanner.getState().suspended!==suspended)choiceScanner.setSuspended(suspended);
  }
  function startChoiceScan(){
    // The Workshop has no shared manager and retains its native form behavior.
    const manager=RT.util.sm();if(!manager?.createChoiceScan)return false;
    previousAuto=manager.getSettings().autoScan;
    choiceScanner=manager.createChoiceScan({
      choice:true,holdThreshold:RT.data.CFG.SPACE_HOLD_MS,items:controls(),statusHost,
      getId:el=>el.id,getLabel:el=>el.getAttribute('aria-label')||el.textContent,
      getElement:el=>el,getLabelElement:el=>el.tagName==='INPUT'?dialog.querySelector('label[for="castleFileURL"]'):el,
      speak:text=>RT.util.vm()?.speak(text),
      onHighlight(item,state){
        scan=state.index;highlight();dialog.dataset.scanIndex=String(scan);
        dialog.dataset.scanState=state.parked?'parked':state.braked?'paused':manager.getSettings().autoScan?'running':'step';
        if(state.suspended)return;
        if(item){if(dialog.contains(document.activeElement)&&document.activeElement!==dialog&&document.activeElement!==item)dialog.focus();item.scrollIntoView({block:'nearest'});}
        else if(dialog.contains(document.activeElement)&&document.activeElement!==dialog)dialog.focus();
      },
      onSelect:el=>{if(el.tagName==='INPUT')el.focus();else el.click();}
    });
    manager.subscribe(onSettings);return true;
  }
  function onSettings(settings){
    if(spaceDown&&!spaceBraking&&settings.autoScan!==previousAuto){spaceCancelled=true;clearTimeout(holdTimer);clearInterval(reverseTimer);}
    previousAuto=settings.autoScan;
  }
  function choiceInput(e,type){
    if(type==='keydown'){
      if(e.repeat)return;
      if(e.code==='Space'&&!spaceDown){
        spaceDown=true;spaceLong=spaceCancelled=false;spaceBraking=choiceScanner.brakePress();
        if(!spaceBraking){choiceScanner.setInputHeld(true);holdTimer=setTimeout(()=>{if(!spaceDown||!dialog.open)return;spaceLong=true;choiceScanner.step(-1);reverseTimer=setInterval(()=>choiceScanner.step(-1),RT.util.sm().getScanInterval());},RT.data.CFG.SPACE_HOLD_MS);}
      }else if(e.code!=='Space'&&!enterCode){enterCode=e.code;choiceScanner.setInputHeld(true);}
      return;
    }
    if(e.code==='Space'&&spaceDown){
      spaceDown=false;clearTimeout(holdTimer);clearInterval(reverseTimer);
      if(spaceBraking)choiceScanner.brakeRelease();else if(!spaceLong&&!spaceCancelled)choiceScanner.step(1);
      spaceBraking=spaceLong=spaceCancelled=false;choiceScanner.setInputHeld(!!enterCode);
    }else if(e.code===enterCode){
      enterCode=null;choiceScanner.select();choiceScanner?.setInputHeld(spaceDown&&!spaceBraking);
    }
  }
  function announce(text){$('castleFileStatus').textContent=text;RT.util.speak(text);}
  function controls(){return [...dialog.querySelectorAll('[data-file-choice]')].filter(b=>!b.disabled);}
  function highlight(){const selected=controls()[scan];dialog.querySelectorAll('[data-file-choice]').forEach(b=>{b.classList.toggle('fileScan',b===selected);b.setAttribute('aria-current',String(b===selected));});}
  function step(){const buttons=controls();scan=(scan+1)%buttons.length;highlight();const b=buttons[scan];RT.util.speak(b.getAttribute('aria-label')||b.textContent);}
  function busy(value){$('castleFilePick').disabled=value;$('castleFileURL').disabled=value;$('castleFileLoad').disabled=value;if(choiceScanner)choiceScanner.setItems(controls());else{scan=-1;highlight();}}
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
    statusHost=document.createElement('div');statusHost.id='castleFileScanStatus';dialog.querySelector('h2').after(statusHost);
    dialog.addEventListener('pointerdown',e=>{if(choiceScanner){const el=e.target.closest('[data-file-choice]');if(el&&!el.disabled)choiceScanner.open(controls(),{restoreId:el.id});}else{scan=-1;highlight();}});
    dialog.addEventListener('focusin',e=>{const el=e.target;if(choiceScanner&&el.matches('[data-file-choice]')&&!el.disabled&&choiceScanner.getState().id!==el.id)choiceScanner.open(controls(),{restoreId:el.id});syncTyping();});dialog.addEventListener('focusout',()=>queueMicrotask(syncTyping));
    window.addEventListener('blur',clearInput);document.addEventListener('narbe-input-cancelled',clearInput);
    $('castleFilePick').onclick=()=>$('castleFileInput').click();
    $('castleFileInput').onchange=e=>{const file=e.target.files[0];e.target.value='';if(file)run(()=>RT.courses.readFile(file));};
    $('castleFileLoad').onclick=()=>run(signal=>RT.courses.readURL($('castleFileURL').value.trim(),{signal}));
    $('castleFileClose').onclick=()=>dialog.close();
    dialog.addEventListener('close',()=>{++generation;request?.abort();request=null;clearInterval(timer);clearInput();choiceScanner?.dispose();choiceScanner=null;RT.util.sm()?.unsubscribe(onSettings);busy(false);callbacks.onClose?.();});
    // Keep game switches and editor shortcuts out of this form. Typing a URL remains native.
    for(const type of ['keydown','keyup'])document.addEventListener(type,e=>{
      if(!dialog.open)return;
      e.stopImmediatePropagation();
      if(e.code==='Tab'){if(!choiceScanner){scan=-1;highlight();}return;}
      if(e.target===$('castleFileURL')){if(e.code==='Enter'&&type==='keydown'){e.preventDefault();if(!e.repeat){dialog.focus();$('castleFileLoad').click();}}return;}
      if(!['Space','Enter','NumpadEnter'].includes(e.code))return;
      e.preventDefault();if(choiceScanner){choiceInput(e,type);return;}if(type!=='keyup'||e.repeat)return;
      if(e.code==='Space')step();else {const b=controls()[scan]||(controls().includes(document.activeElement)?document.activeElement:null);if(b?.tagName==='INPUT')b.focus();else b?.click();}
    },true);
  }
  function open(options={}){
    init();callbacks=options;scan=-1;busy(false);$('castleFileURL').value='';$('castleFileStatus').textContent='Imported adventures stay in this browser’s library.';
    dialog.showModal();dialog.focus();highlight();clearInterval(timer);
    if(startChoiceScan())return;
    if(RT.util.sm()?.getSettings().autoScan)timer=setInterval(()=>{if(document.activeElement!==$('castleFileURL'))step();},RT.util.sm().getScanInterval()||2000);
  }
  return{open,isOpen:()=>!!dialog?.open};
})();
