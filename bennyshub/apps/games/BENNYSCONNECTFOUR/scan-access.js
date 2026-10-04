// Stationary menus and legal board choices use the shared scan policy.
// Game rules, move timing, CPU work and native long-Enter handling stay local.
(function(){
 const isTic="connect"==='tic',isChess="connect"==='chess';
 let suppressScanSound=false,lastDrawId=null;
 let boardVersion=0,parentPiece=null,brakeHeld=false,cancelSpace=false,oldAuto=NarbeScanManager.getSettings().autoScan;
 const held={Space:false,Enter:false},ids=new WeakMap();let nextId=0;
 const status=document.createElement('div');status.id='classic-scan-status';status.className='classic-scan-status';status.hidden=true;
 const style=document.createElement('style');style.textContent='.classic-scan-status{grid-column:1/-1;width:100%;max-width:100%;box-sizing:border-box;flex-shrink:0}.classic-scan-status[hidden]{display:none!important}[data-narbe-scan-paused]{outline-style:dotted!important}';document.head.append(style);
 const rawSpeak=speak,rawSelect=isTic?selectItem:selectCurrentItem;
 function itemId(item){if(!ids.has(item))ids.set(item,'option-'+(++nextId));return ids.get(item)}
 function htmlText(value){const tmp=document.createElement('div');tmp.innerHTML=String(value??'');return tmp.textContent.trim()}
 function descriptor(){
  let key,items,parent;
  if(state.mode==='menu'||state.mode==='pause'||(isTic&&state.mode==='gameover')){
   const sub=state.mode==='menu'?state.menuState:state.mode==='pause'?state.pauseMenuState:'gameover';
   const native=state.mode==='menu'?menus[state.menuState]:state.mode==='pause'?(state.pauseMenuState==='settings'?menus.pauseSettings:menus.pause):menus.gameover;
   if(!native)return null;key=state.mode+':'+sub;parent=document.getElementById(state.mode==='menu'?'menu-container':'pause-overlay');
   items=native.map((item,index)=>({id:key+':'+itemId(item),label:()=>htmlText(typeof item.text==='function'?item.text():item.text),element:document.getElementById('btn-'+parent.id+'-'+index),nativeIndex:index}));
  }else if(state.mode==='game'){
   const cpu=state.gameMode==='single'&&(isTic?state.turn!=='X':isChess?state.turn===state.computerSide:state.turn===-1);
   if(cpu||state.computerThinking)return null;
   key='game:'+boardVersion+':'+state.turn+(isChess&&state.selectedPiece?':moves:'+state.selectedPiece.r+','+state.selectedPiece.c:':choices');
   parent=document.getElementById(isTic?'game-container-inner':'game-board-container');
   if(isTic)items=state.board.flatMap((value,index)=>value===''?[{id:'cell:'+index,label:()=>settings.locationTTS?'Cell '+(index+1)+' Empty':'Empty',element:document.getElementById('cell-'+index),nativeIndex:index}]:[]);
   else items=state.scanItems.map((item,index)=>({id:item.type+':'+(item.col??item.r??'')+':'+(item.c??''),label:item.text,element:document.getElementById(isChess?'cell-'+(item.type==='cancel'?state.selectedPiece.r:item.r)+'-'+(item.type==='cancel'?state.selectedPiece.c:item.c):'arrow-'+item.col),nativeIndex:index,native:item}));
  }else return null;
  if(!parent)return null;
  if(state.mode==='game'&&isChess){parent=document.getElementById('main-content');const board=document.getElementById('game-board-container');if(status.parentElement!==parent||status.nextElementSibling!==board)parent.insertBefore(status,board)}else if(status.parentElement!==parent){const first=parent.querySelector('.menu-button,.menu-grid');if(first)parent.insertBefore(status,first);else parent.prepend(status)}
  return{key,items,statusHost:status};
 }
 const adapter=NarbeChoiceScanAdapter.create({holdThreshold:config.longPress,stateHost:document.body,speak:rawSpeak,
  onHighlight(item,s){
   if(!isTic&&item&&s.id!==lastDrawId&&!suppressScanSound)playSound('scan');lastDrawId=s.id;
   status.hidden=!(s.parked);const index=item?.nativeIndex??-1;
   if(state.mode==='menu')state.menuIndex=index;else if(state.mode==='pause')state.pauseIndex=index;else if(state.mode==='gameover')state.gameoverIndex=index;else if(isChess)state.scanIndexV=index;else state.scanIndex=index;
   if(isTic||state.mode!=='game')updateHighlights();else updateGameHighlights();
   if(s.index<0&&document.activeElement?.matches('button,.cell,.column-arrow'))document.activeElement.blur();
  },onSelect(){rawSelect();sync();}
 });
 function sync(options){
  const next=descriptor();if(!next){status.hidden=true;adapter.sync(null);return false}
  const restored=parentPiece&&next.key===parentPiece.key&&adapter.context?.key!==next.key?parentPiece.id:null;
  adapter.setInputHeld(held.Space&&!brakeHeld||held.Enter);suppressScanSound=true;try{adapter.sync(next,options||{restoreId:restored})}finally{suppressScanSound=false}return true;
 }
 function wrap(name,after,before){const native=window[name];if(typeof native!=='function')return;window[name]=function(...args){before?.(...args);const result=native.apply(this,args);after?.(...args);return result}}
 function decorateMenu(){
  sync();for(const button of document.querySelectorAll('.menu-button')){const native=button.onclick;if(!native||button.dataset.choiceBound)return;button.dataset.choiceBound='true';button.onclick=function(event){sync();const item=adapter.context?.items.find(item=>item.element===button);if(item){suppressScanSound=true;try{adapter.align(item.id)}finally{suppressScanSound=false}}const result=native.call(this,event);sync();return result}}
 }
 wrap('renderMenu',decorateMenu);wrap('renderBoard',sync);wrap('updateBoardUI',sync);wrap('updateGameScanItems',sync);
 for(const name of ['startGame','resumeGame','showMainMenu','showMenu','showSettingsMenu','openPauseMenu','showPauseMenu','showPauseSettings','showGameOver','gameOver','endTurn','playerMove','handleCellClick'])wrap(name,sync);
 wrap(isTic?'makeMove':isChess?'executeMove':'dropPiece',sync,()=>{boardVersion++});wrap('startGame',sync,()=>{boardVersion++;parentPiece=null});
 if(isChess)wrap('selectPiece',sync,(r,c)=>{parentPiece={key:'game:'+boardVersion+':'+state.turn+':choices',id:'piece:'+r+':'+c}});
 if(isTic){scanForward=()=>{sync();adapter.step(1)};scanBackward=()=>{sync();adapter.step(-1)};selectItem=()=>{sync();adapter.select()}}
 else{scanNext=()=>{sync();adapter.step(1)};scanPrev=()=>{sync();adapter.step(-1)};selectCurrentItem=()=>{sync();adapter.select()}}
 const clearAuto=()=>{clearInterval(state.timers.autoScan);state.timers.autoScan=null;sync()};startAutoScan=clearAuto;resetAutoScan=clearAuto;if(isTic)stopAutoScan=clearAuto;
 speak=function(text){sync();return adapter.active?adapter.announce(text):rawSpeak(text)};
 function normalize(e){if(e.code==='NumpadEnter')return{code:'Enter',repeat:e.repeat,preventDefault:()=>e.preventDefault()};return e}
 window.classicChoiceInputDown=function(event){const e=normalize(event);if(!['Space','Enter'].includes(e.code)||e.repeat)return false;e.preventDefault();held[e.code]=true;sync();if(e.code==='Space'&&adapter.brakePress()){brakeHeld=true;adapter.setInputHeld(held.Enter);return true}adapter.setInputHeld(held.Space||held.Enter);return false};
 window.classicChoiceInputUp=function(event){const e=normalize(event);if(!['Space','Enter'].includes(e.code))return false;e.preventDefault();held[e.code]=false;if(e.code==='Space'&&(brakeHeld||cancelSpace)){if(brakeHeld)adapter.brakeRelease();brakeHeld=cancelSpace=false;state.input.spaceHeld=false;clearTimeout(state.timers.space);clearInterval(state.timers.spaceRepeat);state.timers.space=state.timers.spaceRepeat=null;adapter.setInputHeld(held.Enter);return true}adapter.setInputHeld(held.Space||held.Enter);return false};
 if(!isTic){const down=handleKeyDown,up=handleKeyUp;handleKeyDown=e=>{if(!classicChoiceInputDown(e))down(normalize(e))};handleKeyUp=e=>{if(!classicChoiceInputUp(e))up(normalize(e));sync()}}
 NarbeScanManager.subscribe(next=>{if(next.autoScan!==oldAuto&&held.Space&&!brakeHeld){cancelSpace=true;clearTimeout(state.timers.space);clearInterval(state.timers.spaceRepeat);state.timers.space=state.timers.spaceRepeat=null}oldAuto=next.autoScan;sync()});
 function cancel(){held.Space=held.Enter=false;brakeHeld=cancelSpace=false;for(const key of ['space','spaceRepeat','enter','enterRepeat']){clearTimeout(state.timers[key]);clearInterval(state.timers[key]);state.timers[key]=null}state.input.spaceHeld=state.input.enterHeld=false;adapter.cancelInput()}
 window.addEventListener('blur',cancel);document.addEventListener('narbe-input-cancelled',cancel);
 window.classicChoice={getState:()=>adapter.getState(),getItems:()=>adapter.context?.items.map(item=>({id:item.id,label:typeof item.label==='function'?item.label():item.label}))||[],sync};
})();
