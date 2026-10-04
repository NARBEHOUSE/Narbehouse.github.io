// Canvas choice adapter; sequence playback and tone timing remain native.
(function(){
 const status=document.createElement('div');status.id='classic-scan-status';status.hidden=true;status.style.cssText='display:none;height:40px;box-sizing:border-box';document.getElementById('wrap').insertBefore(status,canvas);
 let heldSpace=false,heldEnter=false,braking=false,cancelled=false,lastAuto=NarbeScanManager.getSettings().autoScan;
 const nativeSpeak=speak;let adapter;
 function labels(){return phase===Phase.MAIN?MAIN_MENU_ITEMS:phase===Phase.DIFFICULTY?DIFFICULTY_ITEMS:phase===Phase.SETTINGS?settingsItems:phase===Phase.PLAYER?NAMES.slice(0,colorCount):null}
 function action(item){
  if(phase===Phase.MAIN){if(item.index===0){beep(0,60);phase=Phase.DIFFICULTY;diffHighlight=-1;speak('Select Difficulty');startAutoScan()}else if(item.index===1){phase=Phase.SETTINGS;settingsHighlight=-1;updateSettingsItems();speak('Settings');startAutoScan()}else exitApp()}
  else if(phase===Phase.DIFFICULTY){if(item.index===3){phase=Phase.MAIN;mainHighlight=-1;speak('Main Menu');startAutoScan()}else{speak('Round 1');colorCount=[2,3,4][item.index];startNewGame()}}
  else if(phase===Phase.SETTINGS)handleSettingsAction();else if(phase===Phase.PLAYER)handlePlayerPick(item.index);sync();
 }
 adapter=NarbeChoiceScanAdapter.create({holdThreshold:BACK_HOLD_THRESHOLD,stateHost:document.body,speak:text=>NarbeVoiceManager.speak(text),onSelect:action,onHighlight(item,s){
  const i=item?.index??-1;if(phase===Phase.MAIN)mainHighlight=i;else if(phase===Phase.DIFFICULTY)diffHighlight=i;else if(phase===Phase.SETTINGS)settingsHighlight=i;else if(phase===Phase.PLAYER)highlightIndex=i;
  const hidden=!(s.parked);if(status.hidden!==hidden){status.hidden=hidden;status.style.display=hidden?'none':'flex';canvas.style.height=hidden?'100%':'calc(100% - 40px)';resize()}
 }});
 function sync(){const list=labels();if(!list){adapter.sync(null);status.hidden=true;status.style.display='none';canvas.style.height='100%';resize();return false}adapter.setInputHeld(heldEnter||heldSpace&&!braking);adapter.sync({key:phase+(phase===Phase.PLAYER?':'+round:''),statusHost:status,items:list.map((label,index)=>({id:phase+':'+index,label,index}))});return true}
 function wrap(name){const original=window[name];window[name]=function(...args){const result=original.apply(this,args);sync();return result}}
 for(const name of ['handlePlayerPick','startNewGame','updateSettingsItems'])wrap(name);
 const settingsAction=handleSettingsAction;handleSettingsAction=function(){const index=settingsHighlight;sync();adapter.align(Phase.SETTINGS+':'+index);const result=settingsAction();sync();return result};
 startAutoScan=function(){clearInterval(autoScanTimer);autoScanTimer=null;sync()};stopAutoScan=startAutoScan;
 stepForward=()=>{sync();adapter.step(1)};stepBackward=()=>{sync();adapter.step(-1)};
 speak=function(text){sync();return adapter.active?adapter.announce(text):nativeSpeak(text)};
 window.classicChoiceDown=function(e){if(!['Space','Enter','NumpadEnter'].includes(e.code))return false;e.preventDefault();if(e.repeat)return true;void unlockAudio();sync();if(e.code==='Space'){heldSpace=true;braking=!!adapter.brakePress();if(!braking&&adapter.active){spaceIsDown=true;spaceDownAt=performance.now();cancelBackScanIfAny();backScanTimer=setTimeout(()=>{if(!heldSpace)return;isBackScanActive=true;backScanInterval=setInterval(()=>adapter.step(-1),NarbeScanManager.getScanInterval())},BACK_HOLD_THRESHOLD)}}else heldEnter=true;adapter.setInputHeld(heldEnter||heldSpace&&!braking);return true};
 window.classicChoiceUp=function(e){if(!['Space','Enter','NumpadEnter'].includes(e.code))return false;e.preventDefault();if(e.code==='Space'){if(!heldSpace)return true;heldSpace=false;if(braking)adapter.brakeRelease();else if(!isBackScanActive&&!cancelled&&adapter.active)adapter.step(1);braking=cancelled=false;spaceIsDown=false;cancelBackScanIfAny()}else{if(!heldEnter)return true;heldEnter=false;adapter.select()}adapter.setInputHeld(heldEnter||heldSpace&&!braking);sync();return true};
 function cancel(){heldSpace=heldEnter=braking=cancelled=spaceIsDown=false;cancelBackScanIfAny();adapter.cancelInput()}
 NarbeScanManager.subscribe(next=>{if(next.autoScan!==lastAuto&&heldSpace&&!braking){cancelled=true;cancelBackScanIfAny()}lastAuto=next.autoScan;sync()});window.addEventListener('blur',cancel);document.addEventListener('narbe-input-cancelled',cancel);
 window.classicChoice={getState:()=>adapter.getState(),getItems:()=>adapter.context?.items||[],sync,paused:index=>adapter.active&&adapter.getState()?.braked&&adapter.getState().index===index};sync();
})();
