(() => {
  const capability=document.documentElement.dataset.extensionTool;if(!capability)return;
  const setup=new URL('../../../extension-setup.html',location.href).href;
  let dialog;
  function update(){
    const available=BennyExtension.supports(capability);
    if(available){if(dialog?.open)dialog.close();return;}
    if(!dialog){
      dialog=document.createElement('dialog');dialog.id='companion-required';dialog.style.cssText='max-width:560px;background:#101c2c;color:white;border:2px solid #83caff;border-radius:16px;padding:28px;font:20px system-ui';
      dialog.innerHTML='<h2>This tool is unavailable</h2><p>Your work is kept while this tool reconnects.</p><button type="button" id="gate-back">Back to Hub</button><details style="margin-top:24px;font-size:14px"><summary>Settings</summary><p>Enable Benny’s Hub Companion, then reload this page if needed.</p><p role="status" id="gate-status"></p><button type="button" id="gate-retry">Check again</button> <a href="'+setup+'" target="_blank" rel="noopener">Setup instructions</a></details>';
      const retry=dialog.querySelector('#gate-retry'),back=dialog.querySelector('#gate-back');for(const b of [retry,back])b.style.cssText='font:inherit;padding:12px;margin:8px;cursor:pointer';
      retry.onclick=async()=>{dialog.querySelector('[role=status]').textContent='Checking…';await BennyExtension.check();if(!BennyExtension.supports(capability))dialog.querySelector('[role=status]').textContent='Not connected. Enable the extension and reload this page.';};
      back.onclick=()=>{if(parent!==window)parent.postMessage({action: 'focusBackButton'},location.origin);else location.href='../../../index.html';};
      dialog.addEventListener('cancel',e=>e.preventDefault());document.body.append(dialog);
    }
    if(!dialog.open)dialog.showModal();
  }
  // Existing app scan listeners must not activate controls behind the reconnect dialog.
  for(const type of ['keydown','keyup'])window.addEventListener(type,e=>{
    if(!dialog?.open)return;e.stopImmediatePropagation();
    if(e.target?.closest('details'))return;
    if(e.code==='Space'){e.preventDefault();if(type==='keyup'){const controls=[dialog.querySelector('#gate-back')];controls[(controls.indexOf(document.activeElement)+1)%controls.length].focus();}}
  },true);
  window.addEventListener('benny-extension-change',update);document.addEventListener('DOMContentLoaded',update);
})();
