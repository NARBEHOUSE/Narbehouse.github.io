// Menus and room choices use the hub policy; care, scene clocks and narration stay native.
(function(){
 'use strict';
 const host=document.createElement('div');host.id='pet-scan-status';host.hidden=true;host.style.cssText='position:fixed;z-index:1000;pointer-events:none';document.body.append(host);
 const css=document.createElement('style');css.textContent='#pet-scan-status[hidden]{display:none!important}[data-narbe-scan-paused],.target.is-scan[data-narbe-scan-paused]{outline:4px dotted var(--hl,#ffd54f)!important;outline-offset:3px}';document.head.append(css);
 let painting=false,selecting=false,braking=false,cancelSpace=false,lastAuto=SM().getSettings().autoScan;
 const nativeHighlight=setHighlight;
 function owns(){return !!layer}
  // Wait for Reading holds the automatic clock and manual steps until narration ends; pause stays available.
  function updateClock(keyHeld=!!enterDown||!!spaceDown&&!braking){
   adapter.setInputHeld(keyHeld||readingHold());
  }
 let introNext=false;
 function describe(){
  if(!owns())return null;
  const phase=layer==='spell'?spellMode:null,row=spellRow;
  return{key:layer+(phase?':'+phase+(phase==='col'?':'+row:''):''),layer,phase,row,statusHost:host,
   items:getScannables().map((element,index)=>({id:(element._t?.id?'target:'+element._t.id:null)||element.id||element.dataset.item||element.dataset.choiceId||(element.dataset.choiceId=layer+':'+(phase||'item')+':'+index+':'+(element.querySelector('.label')?.textContent||element.textContent).trim().split('\n')[0]),element,index,label:()=>sayOf(element)})).filter(item=>!item.element.disabled)};
 }
 function place(){if(host.hidden)return;const boxes=[...getScannables(),...(layer==='game'?[hudEl,captionEl]:[])].filter(visible).map(e=>e.getBoundingClientRect()),w=host.offsetWidth,h=host.offsetHeight;const positions=[...(layer==='game'?[[((innerWidth-w)/2),topBarBottom()+8],[8,topBarBottom()+8],[innerWidth-w-8,topBarBottom()+8]]:[]),[innerWidth-w-8,8],[8,8],[(innerWidth-w)/2,8],[innerWidth-w-8,innerHeight-h-8],[8,innerHeight-h-8],[(innerWidth-w)/2,innerHeight-h-8]];const p=positions.find(([x,y])=>x>=0&&y>=0&&x+w<=innerWidth&&y+h<=innerHeight&&!boxes.some(r=>x<r.right&&x+w>r.left&&y<r.bottom&&y+h>r.top))||positions[0];host.style.left=Math.max(0,p[0])+'px';host.style.top=Math.max(0,p[1])+'px'}
 const adapter=NarbeChoiceScanAdapter.create({holdThreshold:BACK_HOLD,stateHost:document.body,speak:text=>{if(introNext)markNarr(text);else narr.on=false;introNext=false;updateClock();return NarbeVoiceManager.speak(text)},
  onContext(c){if(c.phase){spellMode=c.phase;spellRow=c.row}},
  onHighlight(item,s){painting=true;try{nativeHighlight(item?.index??-1,false)}finally{painting=false}host.hidden=!s.parked;if(s.index<0&&document.activeElement?.matches('button,.target'))document.activeElement.blur();place()},
  onSelect(){selecting=true;try{activate()}finally{selecting=false}sync();if(layer!=='game'&&adapter.active&&adapter.getState().index>=0)adapter.announce()}
 });
 function sync(options){const next=describe(),old=adapter.context;updateClock();if(!next){adapter.sync(null);host.hidden=true;return false}
  if(!options?.fresh&&old?.layer==='spell'&&next.layer==='spell'&&old.phase==='row'&&next.phase==='col'&&old.key!==next.key)adapter.enterGroup(next,{wrap:true,backStop:true});
  else if(!options?.fresh&&old?.layer==='spell'&&next.layer==='spell'&&old.phase==='col'&&next.phase==='row'&&adapter.getState()?.depth){adapter.back({restore:true});adapter.sync(next)}
  else adapter.sync(next,options);return true;
 }
 window.petChoice={owns,updateClock,get painting(){return painting},getState:()=>adapter.getState(),getItems:()=>adapter.context?.items.map(i=>({id:i.id,label:i.label()}))||[],sync,
  open(){return sync({fresh:true})},
  announce(intro){if(!adapter.active||layer==='game')return false;const s=SM().getSettings(),park=adapter.getState().index<0&&s.autoScan&&s.parking!=='off';if(intro){introNext=true;adapter.announce(intro+(park?'. Park':''),{parkingLabel:park});introNext=false}return true},
  step(d){if(!sync())return false;if(readingHold())return true;adapter.step(d);return true},
  activate(){if(selecting||!sync())return false;adapter.select();return true},
  pointer(el){sync();const item=adapter.context?.items.find(i=>i.element===el);if(item)adapter.align(item.id)},
  down(e){if(!owns())return false;if(isSpace(e)){braking=!!adapter.brakePress();if(braking){updateClock(!!enterDown);return true}}updateClock(true);return false},
  up(e){if(isSpace(e)&&(braking||cancelSpace)){if(braking)adapter.brakeRelease();braking=cancelSpace=false;clearTimeout(backTimer);clearInterval(backRepeat);backTimer=backRepeat=null;backActive=false;spaceDown=0;updateClock(!!enterDown);return true}updateClock(isSpace(e)?!!enterDown:!!spaceDown&&!braking);return false},
  cancel(){braking=cancelSpace=false;adapter.cancelInput();updateClock(false)}
 };
 SM().subscribe(s=>{if(s.autoScan!==lastAuto&&spaceDown&&!braking){cancelSpace=true;clearTimeout(backTimer);clearInterval(backRepeat);backTimer=backRepeat=null;backActive=false}lastAuto=s.autoScan;if(owns()){clearInterval(autoTimer);autoTimer=null;sync()}else resetAuto();updateHint()});
 document.addEventListener('click',()=>{if(owns())queueMicrotask(()=>{sync();if(layer!=='game'&&adapter.getState()?.index>=0)adapter.announce()})});window.addEventListener('resize',()=>requestAnimationFrame(()=>{sync();place()}));
 sync();
})();
