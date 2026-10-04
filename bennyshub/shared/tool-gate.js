(() => {
  const capability=document.documentElement.dataset.extensionTool;if(!capability)return;
  const setup=new URL('../../../extension-setup.html',location.href).href;
  let dialog,scanner,pressed=null,holdTimer=null,repeatTimer=null,drawing=false;
  const owns=()=>!!dialog?.open&&!dialog.querySelector('details').open;
  const signal=()=>document.dispatchEvent(new CustomEvent('narbe-tool-gate-change',{detail:{open:!!dialog?.open}}));
  function resetInput(){clearTimeout(holdTimer);clearInterval(repeatTimer);pressed=null;scanner?.setInputHeld(false);}
  function sync(){if(scanner){resetInput();scanner.setSuspended(!owns());}}
  function createScanner(){
    if(!window.NarbeScanManager?.createChoiceScan)return; // Caregiver-only editors use native controls.
    const back=dialog.querySelector('#gate-back');
    scanner=NarbeScanManager.createChoiceScan({choice:true,holdThreshold:3000,items:[back],
      getId:el=>el.id,getLabel:()=> 'Back to Hub',getElement:el=>el,
      statusHost:dialog.querySelector('#gate-scan-status'),
      speak:text=>NarbeVoiceManager.speak(text),
      onHighlight(item,state){
        dialog.dataset.scanIndex=String(state.index);dialog.dataset.scanSuspended=String(state.suspended);dialog.dataset.scanState=state.parked?'parked':state.braked?'paused':NarbeScanManager.getSettings().autoScan?'running':'step';
        if(!owns()||state.suspended)return;
        drawing=true;try{(item||dialog).focus({preventScroll:true});}finally{drawing=false;}
      },onSelect:item=>item.click()});
    back.addEventListener('focus',()=>{if(!drawing&&owns()&&scanner.getState().id!==back.id)scanner.open([back],{restoreId:back.id});});
  }
  function update(){
    const available=BennyExtension.supports(capability);
    if(available){if(dialog?.open){dialog.close();sync();signal();}return;}
    if(!dialog){
      dialog=document.createElement('dialog');dialog.id='companion-required';dialog.tabIndex=-1;
      dialog.style.cssText='max-width:560px;background:#101c2c;color:white;border:2px solid #83caff;border-radius:16px;padding:28px;font:20px system-ui';
      dialog.innerHTML='<h2>This tool is unavailable</h2><p>Your work is kept while this tool reconnects.</p><div id="gate-scan-status"></div><button type="button" id="gate-back">Back to Hub</button><details data-scan-exclude style="margin-top:24px;font-size:14px"><summary>Settings</summary><p>Enable Benny’s Hub Companion, then reload this page if needed.</p><p role="status" id="gate-status"></p><button type="button" id="gate-retry">Check again</button> <a href="'+setup+'" target="_blank" rel="noopener">Setup instructions</a></details>';
      const retry=dialog.querySelector('#gate-retry'),back=dialog.querySelector('#gate-back');
      for(const b of [retry,back])b.style.cssText='font:inherit;padding:12px;margin:8px;cursor:pointer';
      retry.onclick=async()=>{dialog.querySelector('#gate-status').textContent='Checking…';await BennyExtension.check();if(!BennyExtension.supports(capability))dialog.querySelector('#gate-status').textContent='Not connected. Enable the extension and reload this page.';};
      back.onclick=()=>{if(parent!==window)parent.postMessage({action:'focusBackButton'},location.origin);else location.href='../../../index.html';};
      dialog.addEventListener('cancel',e=>e.preventDefault());
      dialog.querySelector('details').addEventListener('toggle',sync);
      document.body.append(dialog);
      createScanner();
    }
    if(!dialog.open){
      dialog.showModal();dialog.focus();resetInput();scanner?.setSuspended(false);scanner?.open([dialog.querySelector('#gate-back')]);if(!scanner)dialog.querySelector('#gate-back').focus();signal();
      const parkingLabel=window.NarbeScanManager?.isParkingEnabled()||false;
      scanner?.announceCurrent('This tool is unavailable. Your work is kept while this tool reconnects.'+(parkingLabel?' Park.':''),{parkingLabel});
    }
  }
  function input(e){
    if(!dialog?.open||!scanner)return;
    if(!['Space','Enter','NumpadEnter'].includes(e.code))return;
    // Details belongs to native pointer/typing controls; block only the app behind it.
    e.stopImmediatePropagation();if(e.target?.closest('details')||!owns())return;
    e.preventDefault();
    if(e.type==='keydown'){
      if(e.repeat||pressed)return;
      pressed={code:e.code,back:false,braking:e.code==='Space'&&scanner.brakePress()};
      if(!pressed.braking)scanner.setInputHeld(true);
      if(e.code==='Space'&&!pressed.braking)holdTimer=setTimeout(()=>{if(!pressed)return;pressed.back=true;scanner.step(-1);repeatTimer=setInterval(()=>scanner.step(-1),NarbeScanManager.getScanInterval());},3000);
    }else if(pressed?.code===e.code){
      const press=pressed;clearTimeout(holdTimer);clearInterval(repeatTimer);pressed=null;
      if(e.code==='Space'){if(press.braking)scanner.brakeRelease();else if(!press.back)scanner.step(1);}
      else scanner.select();
      scanner.setInputHeld(false);
    }
  }
  window.addEventListener('benny-extension-change',()=>{if(document.readyState!=='loading')update();});
  window.addEventListener('blur',resetInput);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)resetInput();});
  document.addEventListener('narbe-input-cancelled',()=>{resetInput();if(scanner){scanner.setSuspended(true);scanner.setSuspended(!owns());}});
  document.addEventListener('DOMContentLoaded',()=>{
    // Registered after the single global cooldown guard and before app bubble handlers.
    window.addEventListener('keydown',input,true);window.addEventListener('keyup',input,true);
    let auto=window.NarbeScanManager?.getSettings().autoScan;
    window.NarbeScanManager?.subscribe(next=>{if(auto!==next.autoScan&&pressed&&!pressed.braking){clearTimeout(holdTimer);clearInterval(repeatTimer);pressed.back=true;}auto=next.autoScan;});
    update();
  });
})();
