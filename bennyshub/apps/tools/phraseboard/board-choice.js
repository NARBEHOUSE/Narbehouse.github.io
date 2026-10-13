/* Explicit Phraseboard rows, cells, named groups, warnings and media controls. */
(() => {
  const host=document.createElement('div');host.id='phrase-scan-status';el.statusFooter.before(host);
  const pointerBound=new WeakSet();
  let pressed=null,holdTimer=null,repeatTimer=null,updating=false,auto=NarbeScanManager.getSettings().autoScan;
  const scopeKey=()=>state.modalActive?'warning':state.videoModalActive?'media':state.currentMenu+'|'+state.currentCategory+'|'+state.page;
  const settingMenu=()=>['settings','scan','tts','theme','highlight','gridsize'].includes(state.currentMenu);
  const rootsKey=()=>state.modalActive?'warning':state.videoModalActive?'media':state.currentMenu+'|'+state.currentCategory+'|'+state.page+'|'+state.userScanPreference;
  const cleanLabel=element=>element===el.sentenceDisplay?'Speak message':element===el.deleteWordBtn?'Delete word':element===el.clearSentenceBtn?'Clear message':buttonTextForTTS(element);
  function identities(elements){const counts=new Map();return elements.map(element=>{
    const base=element.id || element.dataset.scanIdentity || (element.classList.contains('voice-toggle')?'setting:voice':element.dataset.voiceIndex?'voice:'+element.dataset.voiceIndex:element.dataset.speakText||cleanLabel(element).split(':')[0]);
    const count=counts.get(base)||0;counts.set(base,count+1);
    return {id:base+':'+count,element,labelElement:element.querySelector('.button-text,.label')||element,label:()=>cleanLabel(element)};
  });}
  function rows(){
    if(state.modalActive)return [];
    if(useGroups())return groupScanner.groups.filter(group=>group.items.length).map(group=>({id:'group:'+group.name,label:group.name,items:identities(group.items.filter(element=>element.id!=='backToGroups')),element:group.items[0],labelElement:group.label||group.items[0],group}));
    const allRows=(state.scannableRows||[]).filter(row=>row.length),allItems=identities(allRows.flat());let offset=0;
    return allRows.map(row=>{const items=allItems.slice(offset,offset+row.length);offset+=row.length;return {id:'row:'+items[0].id,label:()=>items.map(item=>item.label()).join(', '),items,element:row[0],labelElement:row[0]};});
  }
  function rootContext(){
    if(state.modalActive){const modal=el.createBoardWarning.classList.contains('active')?el.createBoardWarning:el.loadBoardWarning;modal.querySelector('.warning-content').append(host);return {key:rootsKey(),scope:scopeKey(),items:identities(state.modalButtons),statusHost:host};}
    if(state.videoModalActive)document.getElementById('iframeControls').after(host);else if(host.nextSibling!==el.statusFooter)el.statusFooter.before(host);
    const groups=rows();
    return {key:rootsKey(),scope:scopeKey(),items:state.userScanPreference==='cell'&&!useGroups()?groups.flatMap(group=>group.items):groups.map(group=>({...group,kind:'row'})),statusHost:host};
  }
  const scanner=NarbeChoiceScanAdapter.create({holdThreshold:3000,statusHost:host,stateHost:document.body,
    speak:text=>{const item=scanner.context?.items[scanner.getState()?.index];const enabled=item?.group&&item.kind==='row'?state.speakGroups:state.ttsOnScan;return NarbeVoiceManager.speak(enabled?text:'');},
    onHighlight(item,scan,context){
      clearScanHighlight();state.modalButtons.forEach(btn=>btn.classList.remove('modal-highlight'));
      el.mainGrid.querySelectorAll('.group-active,.group-dim').forEach(n=>n.classList.remove('group-active','group-dim'));
      state.currentRow=state.scanIndex=state.modalScanIndex=-1;state.scanMode='row';
      const back=document.getElementById('backToGroups');if(back)back.hidden=true; // The row's spoken Back stop replaces this button.
      if(!item||scan.suspended)return;
      if(state.modalActive){state.modalScanIndex=scan.index;item.element.classList.add('modal-highlight');}
      else if(item.kind==='row'){
        item.items.filter(child=>!child.element.hidden).forEach(child=>child.element.classList.add('row-highlight'));
        item.group?.label?.classList.add('group-active');state.currentRow=scan.index;
      }else {item.element.classList.add('scan-highlight');state.scanMode=scan.depth?'column':'row';state.scanIndex=scan.index;
        if(useGroups()&&state.dimGroups){const active=scanner.context.parentId;rows().filter(group=>group.id!==active).forEach(group=>group.items.filter(child=>child.element!==back).forEach(child=>child.element.classList.add('group-dim')));}
      }
      item.element.scrollIntoView({block:'nearest',inline:'nearest'});
    },onSelect(item){
      if(item.kind==='row'){scanner.enterGroup({key:rootsKey()+'|child:'+item.id,scope:scopeKey(),parentId:item.id,items:item.items,statusHost:host},{wrap:true,backStop:true});return;}
      const previous=rootsKey(),depth=scanner.getState().depth;
      if(state.modalActive){state.modalScanIndex=state.modalButtons.indexOf(item.element);selectModalButton();sync(true);return;}
      if(item.element.id==='backToGroups'){scanner.back({restore:true});return;}
      item.element.click();
      if(previous===rootsKey()&&depth&&!['settings','scan','tts','theme','highlight','gridsize'].includes(state.currentMenu))scanner.back({restore:true});
      sync();
      if(settingMenu()&&scanner.getState()?.id){const current=scanner.context.items.find(value=>value.id===scanner.getState().id);if(current)scanner.announce(current.label());}
    }});
  function sync(fresh=false){
    if(updating)return;
    if(state.ttsBlockInput){scanner.sync(null);return;}
    let context=rootContext();const old=scanner.context,current=scanner.getState(),groups=rows();
    // Structural Row/Cell or grid-size edits retain the changed option by identity.
    if(!fresh&&old?.scope===context.scope&&current?.id&&(old.key!==context.key&&!old.key.startsWith(context.key+'|child:')||old.parentId&&!groups.some(row=>row.id===old.parentId))){
      const parent=groups.find(row=>row.items.some(item=>item.id===current.id));
      if(parent){
        if(context.items.some(item=>item.id===current.id))scanner.sync(context,{fresh:true,restoreId:current.id});
        else {scanner.sync(context,{fresh:true,restoreId:parent.id});scanner.enterGroup({key:rootsKey()+'|child:'+parent.id,scope:scopeKey(),parentId:parent.id,items:parent.items,statusHost:host},{restoreId:current.id,wrap:true,backStop:true});}
        bindSettingPointers();return;
      }
    }
    if(!fresh&&old?.parentId&&old.key.startsWith(rootsKey()+'|child:')){const parent=groups.find(row=>row.id===old.parentId);if(parent)context={key:old.key,scope:scopeKey(),parentId:parent.id,items:parent.items,statusHost:host};}
    scanner.sync(context,{fresh});bindSettingPointers();
  }
  function bindSettingPointers(){
    if(!settingMenu())return;
    el.mainGrid.querySelectorAll('.grid-button').forEach(button=>{if(pointerBound.has(button))return;pointerBound.add(button);button.addEventListener('click',()=>{
      const before=scopeKey(),root=rootContext(),parent=rows().find(row=>row.items.some(item=>item.element===button)),item=parent?.items.find(item=>item.element===button);if(!item)return;
      if(scanner.context.items.some(value=>value.id===item.id))scanner.align(item.id);
      else if(root.items.some(value=>value.id===item.id))scanner.sync(root,{fresh:true,restoreId:item.id});
      else {scanner.sync(root,{fresh:true,restoreId:parent.id});scanner.enterGroup({key:rootsKey()+'|child:'+parent.id,scope:scopeKey(),parentId:parent.id,items:parent.items,statusHost:host},{restoreId:item.id,wrap:true,backStop:true});}
      queueMicrotask(()=>{if(scopeKey()===before){sync();const current=scanner.context.items.find(value=>value.id===scanner.getState().id);if(current)scanner.announce(current.label());}});
    },true);});
  }
  const update=updateScannable;
  updateScannable=function(preserve){if(updating)return;updating=true;try{update(preserve);}finally{updating=false;}sync();};
  // Shared controller is the only forward clock. Existing rendering still calls these hooks.
  if(state.scanTimer)clearInterval(state.scanTimer);state.scanTimer=null;
  startAutoScan=()=>{state.scanning=true;};stopScanning=()=>{state.scanning=false;};
  scanForward=scanModalForward=()=>scanner.step(1);scanBackward=scanModalBackward=()=>scanner.step(-1);selectCurrent=()=>scanner.select();
  highlightCurrentRow=highlightScanIndex=highlightModalButton=()=>{};
  for(const name of ['openMenu','openCategory','showWarningModal','hideWarningModal','closeIframe']){
    const original=window[name];if(typeof original==='function')window[name]=function(...args){const value=original(...args);sync(true);return value;};
  }
  function resetInput(){clearTimeout(holdTimer);clearInterval(repeatTimer);pressed=null;scanner.cancelInput();}
  function input(event){
    if(!['Space','Enter','NumpadEnter'].includes(event.code)||event.target.closest?.('.header-right,input,textarea,[contenteditable="true"]'))return;
    event.preventDefault();if(event.repeat)return;
    if(state.ttsBlockInput){resetInput();scanner.sync(null);return;}
    if(event.type==='keydown'){
      if(pressed)return;pressed={code:event.code,back:false,braking:event.code==='Space'&&scanner.brakePress(),autoSelect:auto&&!state.modalActive};
      if(pressed.braking)return;scanner.setInputHeld(true);
      if(event.code==='Space'&&!pressed.autoSelect)holdTimer=setTimeout(()=>{if(!pressed)return;pressed.back=true;scanner.step(-1);repeatTimer=setInterval(()=>scanner.step(-1),NarbeScanManager.getScanInterval());},3000);
      else if(event.code!=='Space'&&!auto&&!state.modalActive)holdTimer=setTimeout(()=>{if(!pressed)return;pressed.back=true;
        if(scanner.getState().depth)scanner.back({restore:true});
        else if(!state.videoModalActive){if(messageActive())scanner.align(rows()[0]?.id);else if(state.currentMenu==='category'||state.csvLoaded)navigateBack();}
        scanner.setInputHeld(true);
      },3000);
    }else if(pressed?.code===event.code){const press=pressed;pressed=null;clearTimeout(holdTimer);clearInterval(repeatTimer);
      if(press.braking)scanner.brakeRelease();else if(!press.back){if(event.code==='Space'&&!press.autoSelect)scanner.step(1);else scanner.select();}
      scanner.setInputHeld(false);
    }
  }
  window.addEventListener('keydown',input);window.addEventListener('keyup',input);
  window.addEventListener('blur',resetInput);document.addEventListener('visibilitychange',()=>{if(document.hidden)resetInput();});document.addEventListener('narbe-input-cancelled',resetInput);
  NarbeScanManager.subscribe(next=>{if(auto!==next.autoScan&&pressed&&!pressed.braking){clearTimeout(holdTimer);clearInterval(repeatTimer);pressed.back=true;}auto=next.autoScan;sync();});
  window.PhraseChoice={sync,back:()=>scanner.back({restore:true})};updateScannable();
})();
