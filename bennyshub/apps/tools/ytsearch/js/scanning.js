// Explicit choice adapter for keyboard rows, their keys, and native media controls.
class ScanningManager {
 constructor(){
  this.mode='ROWS';this.currentRowIndex=-1;this.currentKeyIndex=-1;this.overlayOpen=false;this.overlayIndex=-1;this.spaceDown=this.enterDown=false;this.pressed=null;
  this.rowLabels={row_text:'Text',row_modes:'Search controls',row_controls:'Controls',row1:'A B C D E F',row2:'G H I J K L',row3:'M N O P Q R',row4:'S T U V W X',row5:'Y Z zero one two three',row6:'four five six seven eight nine',predRow:'Predictive text'};
  this.statusHost=document.createElement('div');this.statusHost.id='search-scan-status';document.querySelector('.main-container,.container')?.append(this.statusHost);if(!this.statusHost.isConnected)document.body.append(this.statusHost);
  this.scanner=NarbeChoiceScanAdapter.create({holdThreshold:2500,statusHost:this.statusHost,stateHost:document.body,speak:text=>NarbeVoiceManager.speakProcessed(text),onHighlight:(item,state,context)=>this.paint(item,state,context),onSelect:item=>this.choose(item)});
  this.updateSettingsFromManager();this.updateRows();
  NarbeScanManager.subscribe(next=>{const changed=this.autoScanEnabled!==next.autoScan;this.updateSettingsFromManager();if(changed&&this.pressed&&!this.pressed.braking){clearTimeout(this.holdTimer);clearInterval(this.repeatTimer);this.pressed.back=true;}if(window.settingsManager){settingsManager.settings.autoScan=next.autoScan;settingsManager.settings.scanSpeed=next.scanInterval/1000+'s';settingsManager.updateSettingsDisplay();}this.updateRows();});
  window.addEventListener('keydown',e=>this.input(e));window.addEventListener('keyup',e=>this.input(e));
  window.addEventListener('blur',()=>this.cancelInput());document.addEventListener('narbe-input-cancelled',()=>this.cancelInput());document.addEventListener('visibilitychange',()=>{if(document.hidden)this.cancelInput();});
 }
 updateSettingsFromManager(){const s=NarbeScanManager.getSettings();this.autoScanEnabled=s.autoScan;this.currentScanInterval=s.scanInterval;this.scanSpeed=s.scanInterval/1000+'s';}
 visible(el){return !el.closest('.hidden')&&el.style.display!=='none'&&!el.disabled&&el.style.pointerEvents!=='none';}
 getAllRows(){this.rows=Array.from(document.querySelectorAll('.row-wrap')).filter(row=>this.visible(row));}
 label(el){return el.querySelector('.button-text')?.textContent.trim()||el.textContent.trim()||el.placeholder||'Text';}
 items(elements){const counts=new Map();return elements.filter(el=>this.visible(el)).map(element=>{
  const dynamic=element.dataset.pred==='true'||element.closest('[data-row-id^="row_history"]');const base=element.dataset.setting?'setting:'+element.dataset.setting:dynamic?'word:'+element.textContent:element.dataset.action||element.dataset.char||element.id||this.label(element);const occurrence=counts.get(base)||0;counts.set(base,occurrence+1);
  return {id:base+':'+occurrence,element,labelElement:element.querySelector('.setting-label,.button-text')||element,label:()=>this.label(element)};
 });}
 rowItems(row){return this.items(Array.from(row.querySelectorAll('.scan-btn,.text-input')));}
 context(fresh=false){
  const overlay=['settingsMenu','shorts-feed','image-slideshow','video-slideshow'].map(id=>document.getElementById(id)).find(el=>el&&!el.classList.contains('hidden'));
  if(this.overlayOpen&&overlay){(overlay.querySelector('.slideshow-container')||overlay).append(this.statusHost);return {key:overlay.id,items:this.items(Array.from(overlay.querySelectorAll('.scan-btn,.settings-item'))),statusHost:this.statusHost};}
  const container=document.querySelector('.main-container,.container')||document.body;if(this.statusHost.parentNode!==container)container.append(this.statusHost);
  const current=this.scanner.context;
  if(!fresh&&current?.key.startsWith('keys:')){const row=this.rows.find(row=>row.dataset.rowId===current.key.slice(5));if(row)return {key:current.key,items:this.rowItems(row),statusHost:this.statusHost};}
  return {key:'rows',items:this.rows.map(element=>({id:'row:'+element.dataset.rowId,kind:'row',element,labelElement:element.querySelector('.row-label')||element.querySelector('button')||element,
    label:()=>element.dataset.rowId==='predRow'?(this.rowItems(element).map(item=>item.element.textContent.trim()).filter(Boolean).join(', ')||'No predictions'):element.dataset.rowId.startsWith('row_history')?this.rowItems(element).map(item=>item.label()).join(', '):this.rowLabels[element.dataset.rowId]||element.dataset.label||'Row'})),statusHost:this.statusHost};
 }
 updateRows(fresh=false){this.getAllRows();if(document.getElementById('startup-error')?.open){this.scanner.sync(null);return;}this.scanner.sync(this.context(fresh),{fresh});}
 paint(item,state,context){this.clearKeyHighlights();this.clearRowHighlights();document.querySelectorAll('.settings-item.focused').forEach(el=>el.classList.remove('focused'));this.currentRowIndex=this.currentKeyIndex=this.overlayIndex=-1;this.mode=state.depth?'KEYS':'ROWS';if(window.settingsManager)settingsManager.currentIndex=-1;
  if(item&&!state.suspended){item.element.classList.add('focused');if(item.kind==='row')this.currentRowIndex=this.rows.indexOf(item.element);else if(context.key.startsWith('keys:')){this.currentRowIndex=this.rows.findIndex(row=>row.dataset.rowId===context.key.slice(5));this.currentKeyIndex=state.index;}else{this.overlayIndex=state.index;if(context.key==='settingsMenu')settingsManager.currentIndex=state.index;}item.element.scrollIntoView({block:'nearest',inline:'nearest'});}this.updateStatus();
 }
 choose(item){if(item.kind==='row'){if(item.element.dataset.rowId==='row_text'){NarbeVoiceManager.speakProcessed(document.getElementById('text-input').value||'Empty');return;}this.scanner.enterGroup({key:'keys:'+item.element.dataset.rowId,items:this.rowItems(item.element),statusHost:this.statusHost},{wrap:true,backStop:true});}else{const key=this.scanner.context.key;item.element.click();if(key.startsWith('keys:')&&this.scanner.context.key===key)this.scanner.back({restore:true});this.updateRows();}}
 input(e){if(e.defaultPrevented||!['Space','Enter','NumpadEnter'].includes(e.code)||e.target.closest?.('textarea,[contenteditable="true"],input:not([readonly])'))return;e.preventDefault();if(e.repeat||!this.scanner.active)return;
  if(e.type==='keydown'){if(this.pressed)return;this.pressed={code:e.code,back:false,braking:e.code==='Space'&&this.scanner.brakePress()};this.spaceDown=e.code==='Space';this.enterDown=!this.spaceDown;if(this.pressed.braking)return;this.scanner.setInputHeld(true);
   if(e.code==='Space')this.holdTimer=setTimeout(()=>{if(!this.pressed)return;this.pressed.back=true;this.scanner.step(-1);this.repeatTimer=setInterval(()=>this.scanner.step(-1),2000);},2500);
   else if(!this.overlayOpen)this.holdTimer=setTimeout(()=>{if(!this.pressed)return;this.pressed.back=true;if(this.scanner.getState().depth)this.scanner.back({restore:true});else this.scanner.align('row:predRow');this.scanner.setInputHeld(true);},3000);
  }else if(this.pressed?.code===e.code){const press=this.pressed;this.pressed=null;this.spaceDown=this.enterDown=false;clearTimeout(this.holdTimer);clearInterval(this.repeatTimer);if(press.braking)this.scanner.brakeRelease();else if(!press.back){if(e.code==='Space')this.scanner.step(1);else this.scanner.select();}this.scanner.setInputHeld(false);}
 }
 cancelInput(){clearTimeout(this.holdTimer);clearInterval(this.repeatTimer);this.pressed=null;this.spaceDown=this.enterDown=false;this.scanner.cancelInput();}
 openOverlay(){this.overlayOpen=true;document.activeElement?.blur();this.updateRows(true);}
 closeOverlay(){this.overlayOpen=false;document.activeElement?.blur();this.updateRows(true);}
 clearRowHighlights(){document.querySelectorAll('.row-wrap.focused').forEach(el=>el.classList.remove('focused'));}
 clearKeyHighlights(){document.querySelectorAll('.scan-btn.focused,.text-input.focused').forEach(el=>el.classList.remove('focused'));}
 updateStatus(){const el=document.getElementById('status');if(el)el.textContent='Mode: '+(this.mode==='ROWS'?'Rows':'Keys')+' • Space=next • Enter=select';}
 startAutoScan(){this.updateRows();}
 stopAutoScan(){} // Shared scanner owns timing; overlays transfer its context explicitly.
 setAutoScan(){this.updateSettingsFromManager();this.updateRows();}
 setScanSpeed(){this.updateSettingsFromManager();this.updateRows();}
}
window.scanningManager=new ScanningManager();
