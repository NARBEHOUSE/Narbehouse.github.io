(() => {
  const capability=document.documentElement.dataset.extensionTool;if(!capability)return;
  const setup=new URL('../../../extension-setup.html',location.href).href;
  let dialog, scanTimer=null, selected=false, pressed=null, holdTimer=null, repeatTimer=null;
  function focusBack(){
    if(!dialog?.open)return;selected=true;dialog.querySelector('#gate-back').focus();
    window.NarbeVoiceManager?.speak('Back to Hub');
  }
  function resetInput(){clearTimeout(holdTimer);clearInterval(repeatTimer);pressed=null;}
  function restartScan(){
    clearInterval(scanTimer);scanTimer=null;
    if(dialog?.open&&window.NarbeScanManager?.getSettings().autoScan){
      scanTimer=setInterval(()=>{if(!pressed&&!document.activeElement?.closest('#companion-required details'))focusBack();},NarbeScanManager.getScanInterval());
    }
  }
  function update(){
    const available=BennyExtension.supports(capability);
    if(available){if(dialog?.open){dialog.close();selected=false;resetInput();restartScan();}return;}
    if(!dialog){
      dialog=document.createElement('dialog');dialog.id='companion-required';dialog.style.cssText='max-width:560px;background:#101c2c;color:white;border:2px solid #83caff;border-radius:16px;padding:28px;font:20px system-ui';
      dialog.innerHTML='<h2>This tool is unavailable</h2><p>Your work is kept while this tool reconnects.</p><button type="button" id="gate-back">Back to Hub</button><details style="margin-top:24px;font-size:14px"><summary>Settings</summary><p>Enable Benny’s Hub Companion, then reload this page if needed.</p><p role="status" id="gate-status"></p><button type="button" id="gate-retry">Check again</button> <a href="'+setup+'" target="_blank" rel="noopener">Setup instructions</a></details>';
      const retry=dialog.querySelector('#gate-retry'),back=dialog.querySelector('#gate-back');for(const b of [retry,back])b.style.cssText='font:inherit;padding:12px;margin:8px;cursor:pointer';
      retry.onclick=async()=>{dialog.querySelector('[role=status]').textContent='Checking…';await BennyExtension.check();if(!BennyExtension.supports(capability))dialog.querySelector('[role=status]').textContent='Not connected. Enable the extension and reload this page.';};
      back.onclick=()=>{if(parent!==window)parent.postMessage({action: 'focusBackButton'},location.origin);else location.href='../../../index.html';};
      dialog.addEventListener('cancel',e=>e.preventDefault());
      back.addEventListener('focus',()=>{selected=true;});
      document.body.append(dialog);
    }
    if(!dialog.open){
      dialog.showModal();dialog.tabIndex=-1;dialog.focus();selected=false;resetInput();restartScan();
      window.NarbeVoiceManager?.speak('This tool is unavailable. Your work is kept while this tool reconnects.');
    }
  }
  // Existing app scan listeners must not activate controls behind the reconnect dialog.
  for(const type of ['keydown','keyup'])window.addEventListener(type,e=>{
    if(!dialog?.open)return;e.stopImmediatePropagation();
    if(e.target?.closest('details'))return;
    if(!['Space','Enter','NumpadEnter'].includes(e.code))return;
    e.preventDefault();
    if(type==='keydown'){
      if(e.repeat||pressed)return;pressed={code:e.code,back:false};
      if(e.code==='Space')holdTimer=setTimeout(()=>{if(!pressed)return;pressed.back=true;focusBack();repeatTimer=setInterval(focusBack,window.NarbeScanManager?.getScanInterval()||2000);},3000);
    }else if(pressed?.code===e.code){
      const press=pressed;resetInput();
      if(e.code==='Space'){if(!press.back)focusBack();}
      else if(selected&&document.activeElement===dialog.querySelector('#gate-back'))dialog.querySelector('#gate-back').click();
    }
  },true);
  window.addEventListener('benny-extension-change',update);
  window.addEventListener('blur',resetInput);
  document.addEventListener('DOMContentLoaded',()=>{window.NarbeScanManager?.subscribe(restartScan);update();});
})();
