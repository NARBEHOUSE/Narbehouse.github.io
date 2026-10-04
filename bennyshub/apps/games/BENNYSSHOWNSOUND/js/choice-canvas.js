/* Stationary Phaser choice lists only. Native aiming and playback scanners are excluded. */
(function(){
  'use strict';
  const lists=new Set();
  const speech=o=>{const s=o.speakText;return typeof s==='function'?s():s!=null?s:o.hint?o.label+'. '+o.hint:o.label;};
  const current=scene=>scene.__stationaryChoice?.active?scene.__stationaryChoice:[...lists].reverse().find(o=>o.scene===scene&&o.active&&o._choice?.adapter.active);
  function decorate(K){
    const p=K.prototype,raw={};for(const k of ['_startTimer','_stopTimer','_draw','_announceCurrent','next','prev','select','destroy'])raw[k]=p[k];
    function entries(o){const seen=new Map();return o.options.map((item,i)=>{const base=String(item.value?.id??item.value??item.id??item.label.split(':')[0]),n=seen.get(base)||0;seen.set(base,n+1);return{id:base+':'+n,label:()=>speech(item),source:item,index:i};});}
    function attach(o){
      if(o._draw!==p._draw){o.__nativeChoiceDraw=o._draw;o._draw=p._draw;}
      const next=entries(o),key=K.name+':'+(o.title||'')+':'+(next[0]?.id||'empty');
      let bridge=o.scene.__pendingChoice;
      if(bridge?.key!==key)bridge=null;
      if(bridge){o.scene.__pendingChoice=null;bridge.owner=o;}
      else{
        const host=document.createElement('div');host.className='sportsChoiceStatus';Object.assign(host.style,{position:'fixed',right:'8px',top:'8px',zIndex:'900',pointerEvents:'none',minBlockSize:'0',width:'max-content'});document.body.append(host);
        const badge=NarbeScanStatusBadge.create({host});
        bridge={key,host,owner:o,painting:false,state:null};
        bridge.adapter=NarbeChoiceScanAdapter.create({holdThreshold:3000,stateHost:host,speak:text=>window.NarbeVoiceManager?.speak(text),
          badge:{update(value,context){bridge.state=context.state;badge.update(value,{state:context.state});},destroy(){badge.destroy();host.remove();}},
          onHighlight(item,state){const owner=bridge.owner;if(!owner?.active)return;bridge.painting=true;owner.index=item?item.index:-1;owner._draw();if(item)owner._scanZoom?.();bridge.painting=false;position(bridge);},
          onSelect:()=>{const before=bridge.adapter.getState(),label=speech(bridge.owner.options[before.index]||{});raw.select.call(bridge.owner);const after=bridge.adapter.getState();if(bridge.adapter.active&&after.id===before.id&&speech(bridge.owner.options[after.index]||{})!==label)bridge.adapter.announce();}
        });
      }
      o._choice=bridge;let enabled=o.active;Object.defineProperty(o,'active',{configurable:true,get:()=>enabled,set:value=>{enabled=!!value;if(!enabled)bridge.adapter.sync(null);else if(bridge.adapter.getState()&&!bridge.adapter.getState().disposed)o._startTimer();}});lists.add(o);bridge.adapter.sync({key,items:next,statusHost:bridge.host});const input=o.scene.__choiceInput;if(input)bridge.adapter.setInputHeld(!!input.s.spaceDown||!!input.s.enterDown);
      if(!bridge.listeners){bridge.listeners=true;o.scene.events.on('pause',()=>bridge.adapter.sync(null));o.scene.events.on('sleep',()=>bridge.adapter.sync(null));o.scene.events.on('resume',()=>{if(bridge.owner?.active)bridge.owner._startTimer();});o.scene.events.on('wake',()=>{if(bridge.owner?.active)bridge.owner._startTimer();});o.scene.events.once('shutdown',()=>{lists.delete(bridge.owner);bridge.adapter.dispose();});}
    }
    p._startTimer=function(){if(!this._choice)attach(this);else if(this.active)this._choice.adapter.sync({key:this._choice.key,items:entries(this),statusHost:this._choice.host});};
    p._stopTimer=function(){raw._stopTimer.call(this);this._choice?.adapter.sync(null);};
    p.next=function(){if(this.active)this._choice?.adapter.step(1);};
    p.prev=function(){if(this.active)this._choice?.adapter.step(-1);};
    p.select=function(){if(!this.active)return;const b=this._choice;if(!b)return raw.select.call(this);const e=b.adapter.context.items[this.index];if(e&&b.adapter.getState().id!==e.id)b.adapter.align(e.id);b.adapter.select();};
    p._announceCurrent=function(){const b=this._choice;if(!b)return raw._announceCurrent.call(this);const e=b.adapter.context.items[this.index];if(e)b.adapter.align(e.id);return b.adapter.announce();};
    p._draw=function(){const b=this._choice;if(b&&!b.painting&&this.index!==b.adapter.getState()?.index){const e=b.adapter.context.items[this.index];if(e)b.adapter.align(e.id);}
      if(b){const labels=this.labels||this.chips||[];this.options.forEach((option,i)=>{if(option.value==='autoscan'){const caps=/ON|OFF/.test(option.label);option.label=option.label.replace(/:.*$/,': '+(NarbeScanManager.getSettings().autoScan?(caps?'ON':'On'):(caps?'OFF':'Off')));}else if(option.value==='scanspeed'||option.value==='speed'&&/^Scan Speed:/.test(option.label)){option.label=option.label.replace(/:.*$/,': '+(NarbeScanManager.getScanInterval()/1000)+'s');}else return;if(labels[i]){labels[i].__choiceText=option.label;labels[i].setText(option.label);}});}
      (this.__nativeChoiceDraw||raw._draw).call(this);if(!b)return;const paused=b.adapter.active&&b.state?.braked,labels=this.labels||this.chips||[];
      labels.forEach((label,i)=>{if(label.__choiceText===undefined)label.__choiceText=label.text;label.setText(label.__choiceText);});
      if(paused&&this.index>=0){const z=this.zones?.[this.index];if(z){const r=z.getBounds(),g=this.gfx;g.fillStyle(0xffffff,1);for(let x=r.x;x<=r.right;x+=8){g.fillCircle(x,r.y,2);g.fillCircle(x,r.bottom,2);}for(let y=r.y;y<=r.bottom;y+=8){g.fillCircle(r.x,y,2);g.fillCircle(r.right,y,2);}}}
    };
    p.destroy=function(){const b=this._choice;if(b){b.adapter.sync(null);lists.delete(this);this.scene.__pendingChoice=b;queueMicrotask(()=>{if(this.scene.__pendingChoice===b){this.scene.__pendingChoice=null;b.adapter.dispose();}});}raw.destroy.call(this);};
  }
  function position(b){const host=b.host,canvas=b.owner.scene.game.canvas,rect=canvas.getBoundingClientRect(),scaleX=rect.width/canvas.width,scaleY=rect.height/canvas.height;const bounds=(b.owner.zones||[]).map(z=>z.getBounds()).map(r=>({left:rect.left+r.x*scaleX,top:rect.top+r.y*scaleY,right:rect.left+r.right*scaleX,bottom:rect.top+r.bottom*scaleY}));const w=host.offsetWidth,h=host.offsetHeight;const spots=[[innerWidth-w-8,8],[8,8],[innerWidth-w-8,innerHeight-h-8],[8,innerHeight-h-8]];const spot=spots.find(([x,y])=>!bounds.some(r=>x<r.right&&x+w>r.left&&y<r.bottom&&y+h>r.top))||spots[0];host.style.right='auto';host.style.left=Math.max(0,spot[0])+'px';host.style.top=Math.max(0,spot[1])+'px';}
  [typeof ScanList==='undefined'?null:ScanList,typeof PitchZoneGrid==='undefined'?null:PitchZoneGrid,typeof BaseTargetSelector==='undefined'?null:BaseTargetSelector].filter(Boolean).forEach(decorate);
  const input=ScanInput.prototype,down=input._down,up=input._up,clear=input._clearSpaceState,destroy=input.destroy;
  function bindChoiceInput(target){
    if(target.__choiceBound)return;target.__choiceBound=true;
    target.__choiceMode=!!NarbeScanManager.getSettings().autoScan;
    target.__choiceCancel=()=>{const menu=current(target.scene);if(!menu||target._isAim?.()||target._isCharge?.())return;target._clearSpaceState();target.s.enterDown=false;menu._choice.adapter.cancelInput();};
    target.__choicePrefs=()=>{const mode=!!NarbeScanManager.getSettings().autoScan;if(mode===target.__choiceMode)return;target.__choiceMode=mode;const menu=current(target.scene);if(!menu||target._isAim?.()||target._isCharge?.())return;const held=target.s.spaceDown||target.s.enterDown||!!target.__brakeChoice;target.__choiceCancel();menu._choice.adapter.setInputHeld(held);};
    document.addEventListener('narbe-input-cancelled',target.__choiceCancel);NarbeScanManager.subscribe(target.__choicePrefs);
  }
  input._down=function(e){bindChoiceInput(this);this.scene.__choiceInput=this;const menu=current(this.scene);if(menu&&!this._isAim?.()&&!this._isCharge?.()&&!e.repeat){const b=menu._choice;if(e.code==='Space'&&b.adapter.brakePress()){this.__brakeChoice=b;e.preventDefault();return;}if(['Space','Enter','NumpadEnter'].includes(e.code)){this.__heldChoice=b;b.adapter.setInputHeld(true);}}return down.call(this,e.code==='NumpadEnter'?{code:'Enter',repeat:e.repeat,preventDefault:()=>e.preventDefault()}:e);};
  input._up=function(e){if(e.code==='Space'&&this.__brakeChoice){const b=this.__brakeChoice;this.__brakeChoice=null;b.adapter.brakeRelease();e.preventDefault();return;}const result=up.call(this,e.code==='NumpadEnter'?{code:'Enter',preventDefault:()=>e.preventDefault()}:e);const active=current(this.scene);active?._choice?.adapter.setInputHeld(!!this.s.spaceDown||!!this.s.enterDown);if(this.__heldChoice){this.__heldChoice.adapter.setInputHeld(!!this.s.spaceDown||!!this.s.enterDown);if(!this.s.spaceDown&&!this.s.enterDown)this.__heldChoice=null;}return result;};
  if(clear)input._clearSpaceState=function(){this.__brakeChoice?.adapter.cancelInput();this.__heldChoice?.adapter.cancelInput();this.__brakeChoice=this.__heldChoice=null;return clear.call(this);};
  input.destroy=function(){if(this.__choiceBound){document.removeEventListener('narbe-input-cancelled',this.__choiceCancel);NarbeScanManager.unsubscribe(this.__choicePrefs);this.__choiceBound=false;}this.__brakeChoice?.adapter.cancelInput();this.__heldChoice?.adapter.cancelInput();return destroy.call(this);};
  window.NarbeSportsCanvas={lists,current};
})();
