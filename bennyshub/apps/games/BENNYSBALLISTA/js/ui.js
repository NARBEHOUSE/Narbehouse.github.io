/** Switch-first menus. Every gameplay choice has a release-to-select route. */
RT.ui = (function () {
  'use strict';
  const U=RT.util, G=RT.game, D=RT.data, LV=RT.levels;
  const $=U.$;
  let stage='welcome', screen='welcome', scan=-1, choices=[], ammo=null, targets=[], page=0, selected=null;
  let phase='', started=false, previousBolts=0, preview=null, autoTimer=null, reverseTimer=null, holdTimer=null, spaceHoldTimer=null;
  let spaceDown=false, enterDown=false, longSpace=false, longEnter=false, heldAt=0, beepAt=0,pauseHoldMs=5000;
  let range=50, yaw=0, moving=false, direction=1, settingReturn='welcome', lastHud='', meterSpeak=0;
  let aimHeld=false,charging=false,aimDir=-1;
  let storyPage=0,campaignEntry=true,pickupNoticeTimer=null,storyBeat=null,storyChoices=[],storyText="",storyChunks=[],storyElapsed=0,storyReadMs=6000,storySawSpeech=false;
  let kingdom=null,kingdomSource='levels',exploreIndex=0,exploreReturn=null,editorCastleId=null,editorCampaignId=null;
  let cameraDrag=null,zoomReturn='manual';
  let pointerAim=null,pointerCharge=null,mouseLast=null,pointerSolution=null,pointerLocation=null;
  function cancelPointer(){if(cameraDrag)G.showView('aim');cameraDrag=null;pointerAim=null;pointerCharge=null;mouseLast=null;}
  function clearPointerTarget(){pointerSolution=null;pointerLocation=null;G.CAM.pointerAiming=false;}
  const ammoCopy={stone:['THE STRAIGHT SHOOTER','A fast, direct shot. Great for timber, glass and exposed mischief-makers.'],boulder:['THE WALL BREAKER','A hefty high arc. Smashes stone, damages nearby blocks on landing, then rolls through anything in its path.'],fire:['THE TIMBER TAMER','Ignites a small area. Flames spread through nearby timber and weaken it over time.'],splitter:['THE TRIPLE TROUBLE','A high shot that splits into three. Covers a wider area.'],bomb:['THE BIG SURPRISE','Explodes on impact, sending nearby blocks tumbling. Crates supply two shots in limited mode.']};
  function speak(text){$('caption').textContent=text;U.speak(text);}
  function sound(name){try{window.SafeAudio?.play(name,.45);}catch{}}
  function auto(){return !!U.sm()?.getSettings().autoScan;}
  function easyAim(){return auto()||G.save.easyAim;}
  function aimLabel(){return (auto()?'One switch':'Two switches')+' · '+(easyAim()?'Easy aim':'Hold to aim');}
  function interval(){return U.sm()?.getScanInterval()||2000;}
  function canAct(){return G.CAM.phase==='AIM';}
  function isOverlay(){return !!screen;}
  function restartScan(){clearInterval(autoTimer);autoTimer=null;if(!RT.castleFiles.isOpen()&&auto()&&choices.length)autoTimer=setInterval(()=>{if(!spaceDown&&!enterDown)step(1);},interval());}
  function focus(){
    if(screen==='story'&&storyBeat){$('skipStory').classList.toggle('scanFocus',scan>=0);return;}
    document.querySelectorAll('.scanFocus').forEach(b=>{b.classList.remove('scanFocus');b.setAttribute('aria-current','false');});
    if(!screen && ['ammo','target','flight','explore','zoom'].includes(stage)) { const c=choices[scan];if(c?.element){c.element.classList.add('scanFocus');c.element.setAttribute('aria-current','true');}document.querySelectorAll('#targetPins button').forEach((b,i)=>{b.classList.toggle('selected',i===scan);b.setAttribute('aria-current',i===scan?'true':'false');});return; }
    $(screen?'panelList':'shotChoices').querySelectorAll('.choice').forEach((b,i)=>{b.classList.toggle('focus',i===scan);b.setAttribute('aria-current',i===scan?'true':'false');});
  }
  const choiceSpeech=c=>c.spokenLabel||c.label;
  function targetSpeech(purpose,x){return purpose.replace(/\s*·\s*/g,' ')+(x<-.7?' on the left':x>.7?' on the right':' in the center');}
  function step(dir){if(!choices.length)return;scan=scan<0?(dir>0?0:choices.length-1):(scan+dir+choices.length)%choices.length;focus();sound('hover');if(screen==='story'&&storyBeat)return;const c=choices[scan];if(c.preview)c.preview();speak(choiceSpeech(c)+(c.sub?'. '+c.sub:''));}
  function choose(i){const c=choices[i];if(!c)return;sound('select');speak(choiceSpeech(c));c.action();}
  function button(c,i){const b=document.createElement('button');b.type='button';b.className='choice '+(c.className||'');b.setAttribute('aria-label',choiceSpeech(c)+(c.sub?'. '+c.sub:''));if(c.art)b.innerHTML=c.art;const strong=document.createElement('strong');strong.textContent=c.label;b.append(strong);if(c.sub){const sub=document.createElement('small');sub.textContent=c.sub;b.append(sub);}b.addEventListener('click',()=>choose(i));return b;}
  const menuPages={};let lastPresentation=null;
  function show(title,hint,items,overlay=false,note=''){
    $('btnZoom').hidden=true;$('zoomControls').hidden=true;lastPresentation={title,hint,items,overlay,note};
    const key=screen||stage;
    document.body.dataset.screen=key;
    if(overlay){
      const count=items.length;const rows=Math.max(2,Math.floor((innerHeight-235)/72));
      const columns=Math.min(innerWidth<500?4:6,Math.max(innerWidth<700?2:3,Math.ceil(count/rows)));$('panel').classList.toggle('fullLibrary',count>24);
      $('panelList').style.setProperty('--menu-columns',columns);
      $('panel').classList.toggle('manyChoices',count>12);
    }
    $('exploreControls').hidden=true;$('btnPause').hidden=overlay;
    $('manualControls').hidden=true;$('ammoPicker').hidden=true;$('targetLayer').hidden=true;$('targetStatus').hidden=true;$('btnChangeAmmo').hidden=true;
    if(stage!=='ammo'||overlay)$('shotIllustration').hidden=true;
    $('hud').hidden=overlay;
    if(overlay)$('minimap').hidden=true;

    choices=items;scan=-1;const holder=$(overlay?'panelList':'shotChoices');holder.replaceChildren(...items.map(button));if(overlay)centerMenuRows();$('overlay').hidden=!overlay;$('shotbar').hidden=overlay;
    $(overlay?'panelTitle':'shotTitle').textContent=title;$(overlay?'panelSub':'shotHint').textContent=hint;
    $('panelNote').textContent=note;$('panelList').className=screen==='ammo'?'ammoGrid':'';$('panelList').style.setProperty('--ammo-columns',Math.max(2,items.filter(it=>it.art).length));
    $('meterArea').hidden=overlay||!(stage==='range'||stage==='aim');
    $('modeLabel').textContent=aimLabel()+' · '+(G.save.endlessBolts?'Unlimited shots':'Limited shots');
    $('controlHint').textContent=auto()?'Auto scan · Enter = choose · hold Enter = pause':'Tap Space = next · hold Space = back · Enter = choose';
    focus();restartScan();
  }
  function centerMenuRows(){
    const holder=$('panelList'),count=holder.children.length;let columns=Number(holder.style.getPropertyValue('--menu-columns'))||3;
    if(['welcome','pause','help','editorWarning'].includes(screen))columns=1;
    if(['kingdom','story','resetCampaign','resetCampaigns'].includes(screen))columns=1;
    if(screen==='settings')columns=innerWidth<500?2:4;
    if(screen==='levels')columns=innerWidth<700?(innerHeight<650?2:1):3;
    holder.style.gridTemplateColumns='repeat('+columns*2+',minmax(0,1fr))';
    const remaining=count%columns,start=count-remaining;
    [...holder.children].forEach((el,i)=>{el.style.gridColumn='span 2';if(remaining&&i===start)el.style.gridColumn=(columns-remaining+1)+' / span 2';});
  }
  const zoomChoice=()=>({label:'Zoom view',element:$('btnZoom'),action:openZoom});
  const pauseChoice=()=>({label:'Pause',sub:'Settings, help and exit',action:()=>openMenu('pause')});
  function ammoArt(id){
    const shapes={stone:'<path d="M39 87L133 44" stroke="#795735" stroke-width="12"/><path d="M117 33L153 32 136 62Z" fill="#8d9ca3" stroke="#405663" stroke-width="3"/><path d="M33 73L60 77 51 96 26 98Z" fill="#5b8f82"/>',boulder:'<path d="M51 40L83 24 123 36 143 67 119 101 72 105 43 77Z" fill="#929da5" stroke="#4a6069" stroke-width="4"/><path d="M83 24L93 65 51 40M93 65L143 67M93 65L72 105" fill="none" stroke="#bbc5c5" stroke-width="4"/>',fire:'<path d="M56 94Q23 55 75 25Q61 57 95 40Q132 61 107 95Z" fill="#ec9250"/><path d="M62 92Q51 71 80 54Q72 75 91 71L96 95" fill="#ffdf70"/><path d="M63 102L122 55" stroke="#795735" stroke-width="10"/><path d="M112 50L145 37 132 69Z" fill="#c6d0c3"/>',splitter:'<path d="M39 91L85 65M85 65L132 25M85 65L149 62M85 65L129 99" fill="none" stroke="#81729b" stroke-width="8"/><g fill="#afa1cf" stroke="#5b517a" stroke-width="3"><path d="M119 23L148 13 137 41Z"/><path d="M140 48L163 62 140 75Z"/><path d="M131 85L146 115 117 103Z"/></g>',bomb:'<path d="M103 47Q112 19 127 29" fill="none" stroke="#957443" stroke-width="6"/><path d="M127 18L127 36M117 26L138 26" stroke="#edab35" stroke-width="4"/><circle cx="87" cy="78" r="37" fill="#485b69" stroke="#2c404c" stroke-width="4"/><path d="M63 65Q65 51 83 51" stroke="#a8bec4" stroke-width="6" fill="none"/><path d="M67 85L102 85M85 67L85 102" stroke="#f4c461" stroke-width="8"/>'};
    return '<svg class="ammoArt" viewBox="0 0 190 130" aria-hidden="true"><ellipse cx="96" cy="113" rx="62" ry="7" fill="#263e3518"/>'+shapes[id]+'</svg><span class="tag">'+ammoCopy[id][0]+'</span>';
  }
  let ammoCursor=0,targetCursor=0;
  function fieldView(nextStage){$('zoomControls').hidden=true;$('btnZoom').hidden=!['ammo','manual','target'].includes(nextStage);G.CAM.chargeAiming=false;storyBeat=null;$('skipStory').hidden=true;G.CAM.targetScene=null;cancelPointer();clearPointerTarget();G.showNarrator(false);document.body.dataset.storyScene='false';
    $('exploreControls').hidden=true;stage=nextStage;screen='';lastPresentation=null;document.body.dataset.screen=stage;
    $('overlay').hidden=true;$('shotbar').hidden=true;$('hud').hidden=false;$('btnPause').hidden=false;
    $('minimap').hidden=true;$('ammoPicker').hidden=stage!=='ammo';$('targetLayer').hidden=stage!=='target';$('targetStatus').hidden=stage!=='target';$('btnChangeAmmo').hidden=stage!=='target';$('manualControls').hidden=stage!=='manual';
    $('modeLabel').textContent=aimLabel()+' · '+(G.save.endlessBolts?'Unlimited shots':'Limited shots');
    $('controlHint').textContent=auto()?'Auto scan · Enter = choose · hold Enter = pause':'Space = next · Enter = choose · hold Space = back';
  }
  function paintAmmo(a,i,list){G.setLoadedAmmo(a);ammoCursor=i;$('ammoIcon').innerHTML=ammoArt(a.id);$('ammoName').textContent=a.name;$('ammoDescription').textContent=ammoCopy[a.id][1];$('ammoCount').textContent=(G.save.endlessBolts?'Unlimited shots':G.ammoRemaining(a)+' shots left')+' · '+(i+1)+' / '+list.length;$('ammoSelect').setAttribute('aria-label','Choose '+a.name+'. '+ammoCopy[a.id][1]);}
  function ammoMenu(){
    if(!G.save.endlessBolts&&G.shotsRemaining()<=0){G.CAM.phase='OUTOFBOLTS';screen='out';stage='out';menu();return;}fieldView('ammo');G.prepareShotView();moving=false;selected=null;preview=null;G.updateAimPreview(null);
    const list=G.availableAmmo().filter(a=>G.ammoRemaining(a)>0);ammoCursor=Math.max(0,Math.min(ammoCursor,list.length-1));
    choices=list.map((a,i)=>({label:a.name,sub:ammoCopy[a.id][1]+(G.save.endlessBolts?' Unlimited shots.':' '+G.ammoRemaining(a)+' shots left.'),element:$('ammoSelect'),preview:()=>paintAmmo(a,i,list),action:()=>{ammo=a;targets=[];targetCursor=0;G.setAimMode(easyAim()?'easy':'sweep');range=50;yaw=0;if(easyAim())targetMenu();else manualMenu();}}));
    choices.push(zoomChoice(),{...pauseChoice(),element:$('btnPause')});scan=-1;paintAmmo(list[ammoCursor],ammoCursor,list);focus();restartScan();
    speak((G.boltsUsed===0?RT.levelBrief.instructions(G.currentLevel())+' ':'')+(G.boltsUsed===0&&RT.levelBrief.facts(G.currentLevel()).crates?'Shoot an ammo crate to unlock its projectile. ':'')+'Choose ammunition. '+list[ammoCursor].name+'. Space changes ammo. Enter chooses it.');
  }
  function hitPhrase(trace){const h=trace?.hit;return h?.type==='block'?'Hits the '+h.block.mat.name:h?.type==='ground'?'Lands on the ground':'Flies past the castle';}
  let aimCueAt=-Infinity,aimCueState={kind:'silent',distance:Infinity};
  function assessAim(trace){
    if(!trace)return{kind:'silent',distance:Infinity};
    const mat=trace.hit?.block?.mat,rescue=G.currentLevel().objective==='rescue';
    if(mat?.protected&&rescue)return{kind:'danger',distance:0};
    const unlocked=new Set(G.availableAmmo().map(a=>a.id));
    const objective=m=>RT.levelBrief.isTarget(G.currentLevel(),m)||RT.levelBrief.isCollectTarget(G.currentLevel(),m)||(rescue&&m.prison)||(m.pickup&&!unlocked.has(m.pickup));
    if(mat&&objective(mat))return{kind:'hit',distance:0};
    const goals=G.targetableBlocks().filter(b=>objective(D.MAT[b.matId]));let distance=Infinity;
    for(const point of trace.points||[])for(const b of goals){const dx=Math.max(0,Math.abs(point.x-b.x)-b.w/2),dy=Math.max(0,Math.abs(point.y-b.y)-b.h/2),dz=Math.max(0,Math.abs(point.z-b.z)-b.d/2);distance=Math.min(distance,Math.hypot(dx,dy,dz));}
    return{kind:distance<=2.5?'near':'silent',distance};
  }
  function updateAimGuide(){
    if(stage!=='manual'||screen||!G.save.aimSounds||!canAct()){aimCueState={kind:'silent',distance:Infinity};return;}
    aimCueState=assessAim(preview);const words={silent:'Away from objective',near:'Near objective',hit:'Objective in shot',danger:'Protected character in shot'};
    $('chargeTrack').setAttribute('aria-valuetext',Math.round(range)+' percent. '+words[aimCueState.kind]);
    const now=performance.now(),gap=aimCueState.kind==='near'?280+aimCueState.distance*250:aimCueState.kind==='hit'?800:650;
    if(aimCueState.kind!=='silent'&&now-aimCueAt>=gap){RT.audio?.aimGuide(aimCueState.kind);aimCueAt=now;}
  }
  function setPreview(p){preview=G.traceShot(ammo,p.yawRad,p.rangePct,undefined,p.elevation);G.updateAimPreview(preview);drawMap();updateAimGuide();return preview;}

  function buildTargets(){
    const blocks=G.targetableBlocks(),level=G.currentLevel();
    const kind=b=>D.MAT[b.matId]?.pickup?'pickup':b.crown?'crown':b.matId==='T'?'powder':D.MAT[b.matId]?.guard?'guard':'support';
    const allGuards=RT.levelBrief.allGuards(level),priority={pickup:0,crown:1,powder:2,guard:allGuards?1:3,support:4};
    const required=b=>RT.levelBrief.isTarget(level,D.MAT[b.matId])||RT.levelBrief.isCollectTarget(level,D.MAT[b.matId]);
    const key=blocks.filter(b=>kind(b)!=='support'||required(b)).sort((a,b)=>(required(a)?Math.min(1,priority[kind(a)]):priority[kind(a)])-(required(b)?Math.min(1,priority[kind(b)]):priority[kind(b)]));
    // Pick real load-bearing areas in each side of this level, not arbitrary roof pieces.
    const supports=blocks.filter(b=>kind(b)==='support'&&!D.MAT[b.matId]?.prison).map(b=>({...b,load:blocks.filter(o=>o.y>b.y+b.h*.4&&Math.abs(o.x-b.x)<(o.w+b.w)*.45&&Math.abs(o.z-b.z)<(o.d+b.d)*.45).length})).filter(b=>b.load>0).sort((a,b)=>b.load-a.load||a.y-b.y);
    const sides=new Set(),bases=supports.filter(b=>{const side=b.x<-.7?'left':b.x>.7?'right':'center';if(sides.has(side))return false;sides.add(side);return true;});
    const candidates=[...key.slice(0,allGuards?32:11),...bases],used=new Set(),result=[];
    for(const goal of candidates){
      const solved=D.solveTarget(level,goal.x,goal.z);let best=null;
      // Use the selected projectile's actual trajectory. A blocked crown offers its cover instead.
      for(let rangePct=0;rangePct<=100;rangePct+=2){
        const p={yawRad:solved.yawRad,rangePct},trace=G.traceShot(ammo,p.yawRad,p.rangePct),hit=trace.hit.block;
        if(trace.hit.type!=='block'||!hit||hit.mat.static||hit.mat.protected)continue;
        const distance=hit.mesh.position.distanceToSquared(new THREE.Vector3(goal.x,goal.y,goal.z));
        if(!best||distance<best.distance)best={p,trace,hit,distance};
        if(distance<.01)break;
      }
      if(!best||used.has(best.hit))continue;
      used.add(best.hit);const {hit,p,trace}=best,actual={matId:hit.mat.id,crown:hit.mat.crown},type=kind(actual),direct=best.distance<.01;
      const purpose=type==='pickup'?hit.mat.name:type==='crown'?'Crowned guard':type==='powder'?'Powder keg':type==='guard'?(allGuards?'Guard · ':'')+hit.mat.name:direct?(required(actual)?'Target · ':'Supporting ')+hit.mat.name:required(goal)?'Cover in front of '+goal.matName:kind(goal)==='pickup'?'Cover in front of an ammo crate':'Castle supports';
      const side=hit.mesh.position.x<-.7?'Left':hit.mesh.position.x>.7?'Right':'Center',point=trace.points[trace.points.length-1].clone();
      result.push({label:side+' · '+purpose,spokenLabel:targetSpeech(type==='guard'?hit.mat.name:purpose,hit.mesh.position.x),sub:hitPhrase(trace),p,point,x:point.x,z:point.z,type,priority:Math.min(priority[type],required(goal)?priority.crown+.5:kind(goal)==='pickup'?priority.pickup+.5:priority[type])});
    }
    // If only loose pieces remain, still offer real hits rather than a shot into empty ground.
    if(!result.length){for(const block of blocks.slice(0,12)){const solved=D.solveTarget(level,block.x,block.z);for(let rangePct=0;rangePct<=100;rangePct+=2){const p={yawRad:solved.yawRad,rangePct},trace=G.traceShot(ammo,p.yawRad,p.rangePct),hit=trace.hit.block;if(trace.hit.type!=='block'||!hit||hit.mat.static||hit.mat.protected)continue;const point=trace.points[trace.points.length-1].clone();result.push({label:hit.mat.name,spokenLabel:targetSpeech(hit.mat.name,hit.mesh.position.x),sub:hitPhrase(trace),p,point,x:point.x,z:point.z,type:'support',priority:4});break;}if(result.length)break;}}
    result.sort((a,b)=>a.priority-b.priority);
    const picked=result.splice(0,1);
    while(picked.length<5&&result.length){let best=0,score=-Infinity;result.forEach((t,i)=>{const variety=picked.some(p=>p.type===t.type)?0:35,distance=Math.min(100,Math.min(...picked.map(p=>p.point.distanceToSquared(t.point))));const value=variety-t.priority*10+distance*.15;if(value>score){score=value;best=i;}});picked.push(result.splice(best,1)[0]);}
    return picked;
  }
  function targetMenu(){
    fieldView('target');if(!targets.length)targets=buildTargets();targetCursor=Math.min(targetCursor,targets.length-1);
    if(!targets.length){ammoMenu();speak('Try a different projectile to reach the remaining targets.');return;}
    const pins=$('targetPins');pins.replaceChildren();$('targetLines').replaceChildren();
    choices=targets.map((t,i)=>{const pin=document.createElement('button');pin.type='button';pin.className='targetSceneChoice';pin.textContent='Fire · Target '+(i+1);pin.setAttribute('aria-label','Fire '+ammo.name+' at target '+(i+1)+'. '+t.spokenLabel);pin.onclick=()=>choose(i);pins.append(pin);return{label:'Target '+(i+1)+'. '+t.label,spokenLabel:'Target '+(i+1)+'. '+t.spokenLabel,sub:'Enter to fire.',element:pin,preview:()=>{targetCursor=i;selected=t;setPreview(t.p);G.focusTargetScene(t.point);$('targetName').textContent='Target '+(i+1)+' / '+targets.length+' · '+t.label;positionTargets();},action:()=>{selected=t;targetCursor=i;fire();}};});
    choices.push(zoomChoice(),{...pauseChoice(),element:$('btnPause')},{label:'Change ammunition',element:$('btnChangeAmmo'),action:ammoMenu});scan=-1;choices[targetCursor].preview();focus();positionTargets();restartScan();
    speak('Easy aim. '+choiceSpeech(choices[targetCursor])+'. '+(auto()?'The camera changes targets automatically. Enter fires.':'Space changes the camera view. Enter fires. No hold needed.'));
  }
  function positionTargets(){if(screen||stage!=='target')return;[...$('targetPins').children].forEach((b,i)=>b.hidden=i!==targetCursor);}
  function manualMenu(){
    fieldView('manual');aimHeld=charging=false;selected=null;choices=[];scan=-1;restartScan();G.setAimMode('sweep');setPreview({yawRad:yaw*Math.PI/180,rangePct:range});paintCharge();
    $('controlHint').textContent='Space: aim · Enter: charge / release · Hold Enter: Pause, ammo & zoom';
    speak('Hold Space to aim. Each press reverses direction. Hold Enter to charge, then release to fire. You can hold Space and Enter together to aim while charging. Keep holding Enter for pause, ammunition and zoom controls.'+(G.save.aimSounds?' Aim sounds: ticks get faster near an objective. A double chime means the shot hits it.':''));
  }
  function paintCharge(){G.CAM.chargeAiming=charging&&enterDown&&pointerCharge===null&&stage==='manual'&&!screen;const shown=range;$('chargeFill').style.strokeDasharray=shown+' 100';$('chargeTrack').setAttribute('aria-valuenow',Math.round(shown));$('chargeLabel').textContent=charging?Math.round(range)+'%':pointerLocation?(pointerSolution?.reachable?(pointerSolution.blocked?'Obstructed':charging?'Charging':'Ready'):'Out of reach'):Math.round(range)+'%';$('manualControls').classList.toggle('charging',charging);}
  function positionCharge(){if(screen||stage!=='manual'||!preview)return;const p=G.projectTarget(preview.points[preview.points.length-1]),r=$('cvWrap').getBoundingClientRect();$('manualControls').style.left=(pointerLocation?pointerLocation.x-r.left:U.clamp((p.x+1)*r.width/2,50,r.width-50))+'px';$('manualControls').style.top=(pointerLocation?pointerLocation.y-r.top:U.clamp((1-p.y)*r.height/2,50,r.height-50))+'px';}
  function startAim(){if(stage!=='manual'||screen||!canAct()||aimHeld)return;G.beginAimView();clearPointerTarget();aimDir*=-1;aimHeld=true;sound('hover');paintCharge();}
  function startCharge(pointer=false){if(stage!=='manual'||screen||!canAct()||charging)return;G.beginAimView();charging=true;if(pointer)pointerSolution=null;else clearPointerTarget();range=0;paintCharge();setPreview({yawRad:yaw*Math.PI/180,rangePct:range});}
  function finishCharge(){if(!charging)return;charging=false;paintCharge();if(stage==='manual'&&!screen&&canAct())fire();}
  function fire(){if(!canAct())return;const p=selected?.p||{yawRad:yaw*Math.PI/180,rangePct:range};const aimed=pointerSolution?.reachable?pointerSolution:p;G.fire(ammo,aimed.yawRad,aimed.rangePct,aimed.elevation);previousBolts=G.boltsUsed;stage='flight';screen='';moving=false;flightMenu();speak('Shot fired.');}
  function flightMenu(){fieldView('flight');choices=[{...pauseChoice(),element:$('btnPause')}];scan=-1;focus();restartScan();}
  function zoomReadout(){const percent=Math.round(G.viewState().zoom*100);$('zoomReadout').textContent='View '+percent+'%';return percent;}
  function changeZoom(amount){G.zoomView(amount);const percent=zoomReadout();speak('View '+percent+' percent.');if(stage==='manual'&&pointerLocation){pointerSolution=null;positionCharge();}}
  function openZoom(){if(!['ammo','manual','target'].includes(stage))return;zoomReturn=stage;clearHeld();G.openMenu();screen='';stage='zoom';lastPresentation=null;document.body.dataset.screen='zoom';$('overlay').hidden=true;for(const id of ['ammoPicker','targetLayer','targetStatus','manualControls','btnPause','btnZoom','btnChangeAmmo'])$(id).hidden=true;$('zoomControls').hidden=false;
    choices=[{label:'Zoom in',element:$('zoomIn'),action:()=>changeZoom(.14)},{label:'Zoom out',element:$('zoomOut'),action:()=>changeZoom(-.14)},{label:'Ballista view',element:$('zoomBallista'),action:()=>{G.showView('ballista');speak('Ballista view.');}},{label:'Aim view',element:$('zoomAim'),action:()=>{G.showView('aim');speak('Aim view.');}},{label:'Back',element:$('zoomBack'),action:()=>{G.closeMenu();if(zoomReturn==='ammo')ammoMenu();else if(zoomReturn==='target')targetMenu();else manualMenu();}}];
    choices.forEach((c,i)=>c.element.onclick=()=>choose(i));scan=-1;focus();restartScan();zoomReadout();$('controlHint').textContent='Space: next camera option · Enter: choose';speak('Camera controls. Space changes option. Enter selects.');
  }
  function openMenu(name){if(stage==='explore'){clearHeld();leaveExplore(false);return;}if(G.CAM.phase==='ATTRACT')return;moving=false;aimHeld=charging=false;clearHeld();settingReturn=started?'pause':'welcome';if(G.CAM.phase!=='MENU')G.openMenu();screen=name;menu();}
  function resume(){G.closeMenu();screen='';if(!started){started=true;ammoMenu();}else if(stage==='flight')flightMenu();else if(stage==='ammo')ammoMenu();else {G.setAimMode(easyAim()?'easy':'sweep');if(easyAim())targetMenu();else manualMenu();}}
  function exit(){speak('Returning to the hub.');if(window.parent!==window)window.parent.postMessage({action:'focusBackButton'},'*');else window.location.href='../../../index.html';}
  function setting(label,sub,fn){return {label,sub,action:()=>{const ix=scan;fn();menu();scan=ix;focus();restartScan();const c=choices[ix];if(c)speak(c.label+'. '+c.sub);}};}
  function mainMenu(){clearHeld();G.openMenu();started=false;stage='welcome';screen='welcome';settingReturn='welcome';menu();}
  function selectKingdom(item,source){storyPage=0;campaignEntry=true;kingdom=item.level?{...item,...item.level}:RT.campaigns.find(item.id);kingdomSource=source;loadKingdom();G.openMenu();G.exploreView(0);stage='kingdom';screen='kingdom';menu();}
  function loadKingdom(){if(kingdom.level)G.playCustom(kingdom.level);else G.previewKingdom(kingdom.id);previousBolts=0;targets=[];lastHud='';G.updateAimPreview(null);}
  function beginStory(){storyPage=0;if(G.currentLevel().cutscene){G.openMenu();screen='story';menu();}else playKingdom();}
  function playKingdom(){if(!kingdom)return;if(kingdom.level)G.playCustom(kingdom.level);else G.startKingdom(kingdom.id);previousBolts=0;started=true;ammoMenu();}
  function leaveExplore(play){G.setExploring(false);const from=exploreReturn;exploreReturn=null;if(from?.screen==='pause'){stage=from.stage;screen='pause';if(play)resume();else menu();}else{stage='kingdom';screen='kingdom';if(play)beginStory();else menu();}}
  function exploreKingdom(){exploreReturn={stage,screen};fieldView('explore');$('btnPause').hidden=true;$('exploreControls').hidden=false;G.openMenu();G.setExploring(true);exploreIndex=0;
    const view=()=>{$('exploreView').textContent=G.exploreView(exploreIndex);};view();
    const playLabel=exploreReturn.screen==='pause'?'Continue':'Play';$('explorePlay').textContent=playLabel;
    choices=[{label:'Next view',element:$('exploreNext'),action:()=>{exploreIndex=(exploreIndex+1)%5;view();speak($('exploreView').textContent);}},{label:playLabel,element:$('explorePlay'),action:()=>leaveExplore(true)},{label:'Back',element:$('exploreBack'),action:()=>leaveExplore(false)}];scan=-1;focus();restartScan();speak('Explore '+G.currentLevel().name+'. Watch the guards follow their patrol routes. Choose Next view, '+playLabel+', or Back.');
  }
  function menu(){
    storyBeat=null;$('skipStory').hidden=true;$('panelList').hidden=false;
    const on=v=>v?'On':'Off';let title='',hint='',spoken=null,storyScene=false,items=[],note='Tap Space = next · hold Space = back · Enter = choose';
    if(screen==='settings'){
      title='Settings';hint='Controls, sound and display.';
      const v=U.vm(),s=U.sm();
      items=[setting('Text to speech',on(v?.getSettings().ttsEnabled),()=>v?.toggleTTS()),setting('Voice',v?.getVoiceDisplayName(v?.getCurrentVoice())||'System voice',()=>v?.cycleVoice()),setting('Shot limit',G.save.endlessBolts?'Unlimited shots':'Limited shots',()=>G.setEndlessBolts(!G.save.endlessBolts)),setting('Easy aim',G.save.easyAim?'On — choose key targets':auto()?'Auto scan uses key targets':'Off — hold to aim and charge',()=>{G.setEasyAim(!G.save.easyAim);targets=[];}),setting('Aim sounds',G.save.aimSounds?'On — near: ticks; on target: chime':'Off — sound guide for manual aim',()=>{G.setAimSounds(!G.save.aimSounds);aimCueAt=-Infinity;}),setting('Auto scan',auto()?'On — highlights advance automatically':'Off — Space moves the highlight',()=>s?.toggleAutoScan()),setting('Scan speed',(interval()/1000)+' seconds',()=>s?.cycleScanSpeed()),setting('Camera movement',G.steadyCameraOn()?'Reduced — fixed view, no shake':'Follow shots and collapses',()=>G.setSteadyCamera(!G.steadyCameraOn())),setting('Color theme',G.getTheme(),()=>{const ts=['storybook','dark','light','contrast'];G.setTheme(ts[(ts.indexOf(G.getTheme())+1)%ts.length]);}),setting('Visual effects',({full:'Full — sparks, dust and debris',gentle:'Gentle — fewer particles',minimal:'Minimal — no particles'})[RT.effects.getIntensity()],()=>{const modes=['full','gentle','minimal'];RT.effects.setIntensity(modes[(modes.indexOf(RT.effects.getIntensity())+1)%3]);}),setting('Sound effects',on(RT.audio?.isEnabled()),()=>RT.audio?.setEnabled(!RT.audio.isEnabled())),setting('Music',on(RT.audio?.isMusicEnabled()),()=>RT.audio?.setMusicEnabled(!RT.audio.isMusicEnabled())),{label:'Castle Workshop',sub:'Build and edit castles',action:()=>{editorCastleId=null;editorCampaignId=null;screen='editorWarning';menu();}},{label:'Reset all campaigns',sub:'Clear campaign progress and scores',action:()=>{screen='resetCampaigns';menu();}},{label:'Back',action:()=>{screen=settingReturn;menu();}}];
    }else if(screen==='help'){
      title='How to play';hint='Space cycles ammo; Enter chooses it. Then Space cycles the numbered areas; Enter fires. You can also tap an area on the castle. Pause and Change ammo follow the targets in the scan. Defeat every guard to clear a campaign castle.';
      hint='Choose ammo with Space and Enter. Easy aim: Space selects a key area and Enter fires, with no hold needed. Auto Scan moves the highlight for you. With both off, hold Space to aim and Enter to charge, then release to fire. Mouse: move to aim, keep aiming while holding click to charge, and release to fire.';note=started?RT.levelBrief.summary(G.currentLevel()):'Easy aim and Auto Scan are in Settings. Auto Scan always provides targets for one-switch play.';if(started)spoken='How to play. '+hint+' '+RT.levelBrief.instructions(G.currentLevel());
      items=[{label:'Back',action:()=>{screen=settingReturn;menu();}}];
    }else if(screen==='editorWarning'){
      title='Castle Workshop · mouse and keyboard needed';hint='Mouse and keyboard required. Switch scanning will not work inside the editor. Cancel stays in the game.';items=[{label:'Cancel',action:()=>{screen=editorCastleId||editorCampaignId?'kingdom':'settings';menu();}},{label:'Open Castle Workshop',sub:'Mouse and keyboard needed',action:()=>{window.location.href='editor.html'+(editorCampaignId?'?campaign='+encodeURIComponent(editorCampaignId):editorCastleId?'?castle='+encodeURIComponent(editorCastleId):'');}}];
    }else if(screen==='resetCampaign'){
      title='Restart '+kingdom.name+'?';hint='Clear this campaign’s levels, scores, stars and collected ammo. Start again at level 1 with Boulder only. Other campaigns keep their progress. This cannot be undone.';
      items=[{label:'Cancel',action:()=>{screen='kingdom';menu();}},{label:'Restart progress',action:()=>{clearHeld();if(!G.resetKingdomProgress(kingdom.id))return;campaignEntry=true;storyPage=0;loadKingdom();G.openMenu();G.exploreView(0);stage='kingdom';screen='kingdom';menu();speak(kingdom.name+' progress reset. Choose Start campaign to begin.');}}];
    }else if(screen==='resetCampaigns'){
      title='Reset all campaigns?';hint=(started?'This ends the current game. ':'')+'Clear every campaign’s levels, scores, stars and collected ammo. Settings and Workshop castles are kept. This cannot be undone.';
      items=[{label:'Cancel',action:()=>{screen='settings';menu();}},{label:'Reset all campaigns',action:()=>{clearHeld();G.resetAllCampaigns();kingdom=null;targets=[];previousBolts=0;lastHud='';campaignEntry=true;mainMenu();speak('All campaign progress reset. Choose Play Game to start a campaign.');}}];
    }else if(screen==='custom'){
      title='My Castles';hint='Saved in this browser. Choose a castle to play, explore or export.';items=RT.courses.list().map(it=>({label:it.level.name,sub:'Custom castle',action:()=>selectKingdom(it,'custom')}));if(!items.length)hint='Create castles in the Workshop, or import a JSON file or link.';items.push({label:'Import castles',sub:'JSON file or link',action:()=>{clearHeld();RT.castleFiles.open({onCampaign:()=>{screen='customCampaigns';},onClose:()=>{if(screen!=='customCampaigns')screen='custom';menu();}});restartScan();}},{label:'Back',action:()=>{screen='levels';menu();}});
    }else if(screen==='customCampaigns'){
      title='My Campaigns';hint='Workshop adventures. Play their levels in order; progress and ammunition are saved per campaign.';
      items=RT.campaigns.kingdoms.filter(k=>k.custom).map(k=>{const p=G.kingdomProgress(k.id);return{label:k.name,sub:k.levels.length+' levels'+(p.next?' · Progress '+Math.min(p.next+1,k.levels.length)+' of '+k.levels.length:''),action:()=>selectKingdom(k,'customCampaigns')};});
      items.push({label:'Import campaign',sub:'JSON file or link',action:()=>{clearHeld();RT.castleFiles.open({onClose:()=>{screen='customCampaigns';menu();}});}},{label:'Back',action:()=>{screen='levels';menu();}});
    }else if(screen==='levels'){

      title='Choose your kingdom';hint='Each kingdom is a full adventure. Clear its levels in order. Your progress is saved.';
      items=RT.campaigns.kingdoms.filter(k=>!k.custom).map(k=>{const p=G.kingdomProgress(k.id);return{label:k.name,sub:(p.next===k.levels.length?'Conquered · play again':p.next?'Continue · level '+(p.next+1)+' of '+k.levels.length:k.levels.length+' levels · start with the huts')+' · '+k.sub,action:()=>selectKingdom(k,'levels')};});items.push({label:'My Campaigns',sub:'Full Workshop adventures',action:()=>{screen='customCampaigns';menu();}},{label:'My Castles',sub:'Individual Workshop levels',action:()=>{screen='custom';menu();}},{label:'Back',action:mainMenu});
    }else if(screen==='kingdom'){
      const level=G.currentLevel(),p=kingdom.level?null:G.kingdomProgress(kingdom.id),finished=p&&p.next===kingdom.levels.length;
      title=kingdom.name;hint='';
      items=[{label:campaignEntry&&!kingdom.level?(p.next>0&&!finished?'Continue campaign':'Start campaign'):'Start level',className:'primary',action:()=>{if(campaignEntry&&!kingdom.level&&!(p.next>0&&!finished)){G.startKingdom(kingdom.id,true);G.openMenu();G.exploreView(0);}beginStory();}},{label:'Explore',action:exploreKingdom},{label:'Back',action:()=>{screen=kingdomSource;menu();}}];
      if(kingdom.level)items.splice(items.length-1,0,{label:'Export JSON',action:()=>{try{RT.courses.download([kingdom.level]);speak('Castle JSON downloaded. Keep it locally or upload it to your own storage.');}catch(error){speak(error.message);}}},{label:'Edit in Workshop',action:()=>{editorCastleId=kingdom.id;editorCampaignId=null;screen='editorWarning';menu();}});
      if(kingdom.custom)items.splice(items.length-1,0,{label:'Export campaign JSON',action:()=>{try{RT.customCampaigns.download(RT.customCampaigns.list().find(c=>c.id===kingdom.id));speak('Campaign JSON downloaded.');}catch(e){speak(e.message);}}},{label:'Edit campaign',action:()=>{editorCastleId=null;editorCampaignId=kingdom.id;screen='editorWarning';menu();}});
      if(campaignEntry&&!kingdom.level&&(p.next>0||p.cleared>0||p.ammo.length>1||Object.keys(p.results).length))items.splice(items.length-1,0,{label:'Restart progress',action:()=>{screen='resetCampaign';menu();}});
    }else if(screen==='story'){
      const level=G.currentLevel();title=level.name;storyScene=true;
      let dialogue=kingdom.level?(level.story||'The castle is ahead. Here is your mission.'):(level.order===0?'I’m '+RT.courses.narrator(level.narrator).name+', your guide. '+kingdom.story:level.story);
      dialogue+=' '+RT.levelBrief.instructions(level);
      const chunks=[];let remaining=dialogue.trim();while(remaining){let end=remaining.length;if(end>240){const sample=remaining.slice(0,241),sentences=[...sample.matchAll(/[.!?](?=\s)/g)];end=sentences.length?sentences[sentences.length-1].index+1:sample.lastIndexOf(' ');if(end<=0)end=240;}chunks.push(remaining.slice(0,end));remaining=remaining.slice(end).trim();}storyChunks=chunks;storyPage=0;hint=chunks[0];spoken=RT.courses.narrator(level.narrator).name+'. '+hint;
      items=[{label:'Play level',className:'primary',action:playKingdom},{label:'Back',action:()=>{screen='kingdom';menu();}}];note='Space = next · Enter = choose · Play whenever you’re ready';
    }else if(screen==='rescueFailed'){
      title='Protected character hit';hint='Try again. Keep shield-marked friends clear of shots, fire and falling blocks.';items=[{label:'Restart castle',className:'primary',action:()=>{G.retryLevel();ammoMenu();}},{label:'Exit',action:exit}];
    }else if(screen==='results'){
      const r=G.lastResult||{stars:1,earned:0},level=G.currentLevel(),k=G.isCustom()?null:RT.campaigns.forLevel(level),finished=k&&level.order===k.levels.length-1;
      title=finished?k.name+' conquered':level.objective==='rescue'?'Everyone rescued':'Level complete';
      hint='★'.repeat(r.stars)+' · '+r.earned+' points · '+G.boltsUsed+(G.boltsUsed===1?' shot. ':' shots. ')+(level.ending||'Mission complete.');
      if(r.pickups?.length)hint+=' Ammo collected: '+r.pickups.join(', ')+'.';
      spoken=(finished?k.name+' conquered. ':'')+'You earned '+r.earned+' points and cleared it in '+G.boltsUsed+' '+(G.boltsUsed===1?'shot':'shots')+'.';
      if(k){const total=G.kingdomScore(k.id);hint+=' Kingdom score: '+total.points+' points · '+total.shots+(total.shots===1?' shot across ':' shots across ')+total.levels+(total.levels===1?' level.':' levels.');spoken+=' Your kingdom score is '+total.points+' points, with '+total.shots+' '+(total.shots===1?'shot':'shots')+' across '+total.levels+' '+(total.levels===1?'level':'levels')+'.';}
      if(r.pickups?.length)spoken+=' Ammo collected: '+r.pickups.join(', ')+'.';if(finished||G.isCustom())spoken+=' '+(level.ending||'');
      const onward=finished?{label:'Choose kingdom',className:'primary',action:()=>{G.openMenu();screen='levels';menu();}}:G.isCustom()?{label:'My Castles',className:'primary',action:()=>{G.openMenu();screen='custom';menu();}}:{label:'Next level',sub:LV.LEVELS[k.levels[level.order+1]].name,className:'primary',action:()=>{if(G.confirmResults()){storyPage=0;campaignEntry=false;kingdom=k;kingdomSource='levels';previousBolts=0;stage='kingdom';beginStory();}}};
      items=[onward,{label:'Play this castle again',action:()=>{G.retryLevel();previousBolts=0;ammoMenu();}},{label:'Exit',action:exit}];
    }else if(screen==='out'){
      title='Out of shots';hint='That was your last shot. Try again, or carry on with unlimited shots.';items=[{label:'Try this castle again',action:()=>{G.retryLevel();previousBolts=0;ammoMenu();}},{label:'Keep playing — unlimited shots',action:()=>{G.enableEndlessAndContinue();ammoMenu();}},{label:'Exit',action:exit}];
    }else if(screen==='welcome'){
      title='Benny’s Ballista';hint='';G.showcase();
      items=[{label:'Play Game',className:'primary',action:()=>{screen='levels';menu();}},{label:'Settings',action:()=>{settingReturn='welcome';screen='settings';menu();}},{label:'How to play',action:()=>{settingReturn='welcome';screen='help';menu();}},{label:'Exit',action:exit}];
    }else{
      title='Paused';hint='';items=[{label:'Continue',className:'primary',action:resume},...(stage==='manual'?[{label:'Change ammunition',action:()=>{G.closeMenu();ammoMenu();}}]:[]),...(['ammo','manual','target'].includes(stage)?[{label:'Zoom view',action:openZoom}]:[]),{label:'Explore level',action:exploreKingdom},{label:'Settings',action:()=>{settingReturn='pause';screen='settings';menu();}},{label:'How to play',action:()=>{settingReturn='pause';screen='help';menu();}},{label:'Restart castle',action:()=>{G.retryLevel();previousBolts=0;ammoMenu();}},{label:'Main Menu',action:mainMenu}];
    }
    $('panelSub').style.left='';$('panelSub').style.top='';document.body.dataset.storyScene=String(storyScene);show(title,hint,items,true,note);G.showNarrator(storyScene);$('panelSub').dataset.speaker=RT.courses.narrator(G.currentLevel().narrator).name;$('panelEyebrow').textContent=storyScene?RT.courses.narrator(G.currentLevel().narrator).name+' · YOUR GUIDE':'BENNY’S BALLISTA';$('panelSub').hidden=!hint;if(storyScene){storyChoices=items;storyText=spoken;storyBeat='enter';choices=[{label:'Skip intro',element:$('skipStory'),action:revealStoryOptions}];scan=-1;$('panelSub').hidden=true;$('panelList').hidden=true;$('skipStory').hidden=false;focus();restartScan();}else speak(spoken||title+(hint?'. '+hint:'.')); 
  }
  function drawMap(){const cv=$('minimap'),ctx=cv.getContext('2d');if(!ctx)return;const colors=getComputedStyle(document.body);const color=n=>colors.getPropertyValue('--'+n).trim();ctx.fillStyle=color('panel');ctx.fillRect(0,0,300,300);const bounds=D.castleBounds(G.currentLevel());const span=Math.max(bounds.halfWidth*2+6,12);const px=x=>150+x/span*260,py=z=>150+(z+G.currentLevel().dist)/span*260;
    for(const b of G.targetableBlocks()){ctx.fillStyle=color(b.crown?'crown':'stone');ctx.strokeStyle=color('ink');ctx.lineWidth=2;ctx.fillRect(px(b.x)-5,py(b.z)-5,10,10);ctx.strokeRect(px(b.x)-5,py(b.z)-5,10,10);}
    if(preview){const p=preview.points[preview.points.length-1];const x=px(p.x),y=py(p.z);ctx.strokeStyle=color('accent');ctx.lineWidth=4;ctx.beginPath();ctx.arc(x,y,12,0,Math.PI*2);ctx.moveTo(x-19,y);ctx.lineTo(x+19,y);ctx.moveTo(x,y-19);ctx.lineTo(x,y+19);ctx.stroke();}ctx.fillStyle=color('text');ctx.font='bold 15px Segoe UI';ctx.fillText('CASTLE MAP',14,24);
  }
  function clearHeld(){cancelPointer();clearTimeout(holdTimer);clearTimeout(spaceHoldTimer);clearInterval(reverseTimer);spaceDown=enterDown=longSpace=longEnter=false;aimHeld=charging=false;paintCharge();$('holdProgress').hidden=true;restartScan();}
  function keyDown(e){if(RT.castleFiles.isOpen())return;if(!['Space','Enter','NumpadEnter'].includes(e.code))return;e.preventDefault();if(e.repeat)return;try{RT.audio?.resume();RT.audio?.musicResume();}catch{}if(G.CAM.phase==='ATTRACT')return;
    if(e.code==='Space'){if(spaceDown)return;spaceDown=true;clearInterval(autoTimer);if(stage==='manual'&&!screen){startAim();return;}spaceHoldTimer=setTimeout(()=>{longSpace=true;step(-1);reverseTimer=setInterval(()=>step(-1),interval());},D.CFG.SPACE_HOLD_MS);}
    else{if(enterDown)return;enterDown=true;heldAt=performance.now();beepAt=0;pauseHoldMs=stage==='manual'&&!screen?7000:5000;clearInterval(autoTimer);if(stage==='manual'&&!screen)startCharge();holdTimer=setTimeout(()=>{longEnter=true;$('holdProgress').hidden=true;openMenu(started?'pause':'welcome');},pauseHoldMs);}}
  function keyUp(e){if(RT.castleFiles.isOpen())return;if(!['Space','Enter','NumpadEnter'].includes(e.code))return;e.preventDefault();if(e.code==='Space'){clearTimeout(spaceHoldTimer);clearInterval(reverseTimer);if(!spaceDown)return;spaceDown=false;if(stage==='manual'&&!screen){aimHeld=false;paintCharge();}else if(!longSpace)step(1);longSpace=false;}else{clearTimeout(holdTimer);if(!enterDown)return;enterDown=false;$('holdProgress').hidden=true;if(!longEnter){if(stage==='manual'&&!screen)finishCharge();else choose(scan);}longEnter=false;}restartScan();}
  function revealStoryOptions(){if(screen!=='story')return;storyBeat=null;U.vm()?.cancel?.();choices=storyChoices;scan=-1;$('panelSub').hidden=false;$('panelList').hidden=false;$('skipStory').hidden=true;$('skipStory').classList.remove('scanFocus');focus();restartScan();U.speak('Play level or Back.');}
  function speakStoryChunk(){
    const text=storyChunks[storyPage],bubble=$('panelSub');bubble.textContent=text;bubble.hidden=false;
    if(lastPresentation)lastPresentation.hint=text;
    storyText=RT.courses.narrator(G.currentLevel().narrator).name+'. '+text;
    storyBeat='talk';storyElapsed=0;storySawSpeech=false;
    // When speech is muted or unavailable, allow a comfortable reading interval.
    storyReadMs=Math.max(6000,text.split(/\s+/).length/2.2*1000+1800);
    if(storyPage>0&&!G.steadyCameraOn()&&!G.__test.isReducedMotion())bubble.animate([{opacity:.35},{opacity:1}],{duration:180});
    speak(storyText);positionStory();
  }
  function storyTick(dt){
    if(screen!=='story'||!storyBeat||document.hidden)return;
    const age=G.__test.narratorState().age,reduced=G.steadyCameraOn()||G.__test.isReducedMotion();
    if(storyBeat==='enter'){if(age>=2.4||reduced)speakStoryChunk();return;}
    storyElapsed+=Math.max(0,dt)*1000;
    if(storyBeat==='gap'){if(storyElapsed>=550){if(storyPage+1<storyChunks.length){storyPage++;speakStoryChunk();}else revealStoryOptions();}return;}
    const speech=window.speechSynthesis;if(speech?.speaking)storySawSpeech=true;
    const complete=storySawSpeech&&!speech?.speaking&&!speech?.pending;
    const silent=!storySawSpeech&&!speech?.pending&&storyElapsed>=storyReadMs;
    const rate=U.vm()?.getSettings?.().rate||1;
    if(complete||silent||storyElapsed>Math.max(90000,storyReadMs*3/Math.max(.3,rate))){storyBeat='gap';storyElapsed=0;}
  }
  function positionStory(){if(screen!=='story')return;const p=G.narratorHead();if(!p)return;const bubble=$('panelSub'),r=document.querySelector('#cvWrap>canvas:not(#minimap)').getBoundingClientRect(),x=r.left+(p.x+1)*r.width/2,y=r.top+(1-p.y)*r.height/2,left=U.clamp(x-bubble.offsetWidth/2,12,innerWidth-bubble.offsetWidth-12);bubble.style.left=left+'px';bubble.style.top=Math.max(54,y-bubble.offsetHeight-22)+'px';bubble.style.setProperty('--bubble-tail',U.clamp(x-left,25,bubble.offsetWidth-25)+'px');}
  function tick(dt){storyTick(dt);positionStory();positionTargets();positionCharge();const next=G.CAM.phase;
    if(next!==phase){const old=phase;phase=next;if(next==='RESCUE_FAILED'){screen='rescueFailed';stage='rescueFailed';menu();}else if(next==='AIM'&&old==='ATTRACT'){G.openMenu();screen='welcome';menu();const requestedCampaign=RT.campaigns.find(new URLSearchParams(location.search).get('campaign'));if(requestedCampaign?.custom)selectKingdom(requestedCampaign,'customCampaigns');const testId=new URLSearchParams(location.search).get('castle');const custom=RT.courses.list().find(c=>c.id===testId);if(custom){selectKingdom(custom,'custom');}}else if(next==='AIM'&&stage==='flight'){ammoMenu();}else if(next==='RESULTS_MENU'){screen='results';stage='results';menu();sound('win');}else if(next==='OUTOFBOLTS'){screen='out';stage='out';menu();}}
    if(enterDown&&!longEnter){const elapsed=performance.now()-heldAt;if(elapsed>(stage==='manual'?pauseHoldMs-1000:1000)){$('holdProgress').hidden=false;$('holdProgress').querySelector('progress').value=elapsed/pauseHoldMs;if(Math.floor(elapsed/1000)>beepAt){beepAt=Math.floor(elapsed/1000);sound('hover');}}}
    if(stage==='manual'&&!screen&&canAct()){
      if(aimHeld){const half=D.yawLimit(G.currentLevel())*180/Math.PI;yaw+=aimDir*D.CFG.YAW_DEG_PER_S*dt;if(Math.abs(yaw)>=half){yaw=U.clamp(yaw,-half,half);aimDir*=-1;}}
      if(charging)range=Math.min(100,range+(pointerCharge!==null?25:17.5)*dt);
      if(aimHeld||charging){meterSpeak+=dt;paintCharge();if(meterSpeak>.06){meterSpeak=0;setPreview(pointerSolution?.reachable?pointerSolution:{yawRad:yaw*Math.PI/180,rangePct:range});}}
    }
    if(G.currentLevel()){const sig=[G.levelIx,G.boltsUsed,G.levelScore,G.remainingGoals(),G.save.endlessBolts,G.shotsRemaining()].join('|');if(sig!==lastHud){lastHud=sig;$('chapter').textContent=G.isCustom()?'WORKSHOP LEVEL':RT.campaigns.forLevel(G.currentLevel()).name+' · LEVEL '+(G.currentLevel().order+1)+' / '+RT.campaigns.forLevel(G.currentLevel()).levels.length;$('castleName').textContent=G.currentLevel().name;$('pCrowns').innerHTML=RT.levelBrief.label(G.currentLevel())+' <b>'+G.remainingGoals()+'</b>';$('pBolts').innerHTML=(G.save.endlessBolts?'Shots used <b>'+G.boltsUsed:'Shots left <b>'+G.shotsRemaining())+'</b>';$('pScore').innerHTML='Score <b>'+G.levelScore+'</b>';}}
  }
  function init(){window.addEventListener('storage',e=>{if(e.key==='rt-ballista-castles'&&screen==='custom'&&!RT.castleFiles.isOpen())menu();});$('skipStory').onclick=revealStoryOptions;for(const [id,dir]of [['targetPrevious',-1],['targetNext',1]])$(id).onclick=()=>{if(screen||stage!=='target')return;scan=(targetCursor+dir+targets.length)%targets.length;choices[scan].preview();focus();speak(choiceSpeech(choices[scan]));restartScan();};['hover','select','win'].forEach(n=>window.SafeAudio?.preload(n));$('btnZoom').onclick=openZoom;$('btnPause').onclick=()=>openMenu(started?'pause':'welcome');$('exploreNext').onclick=()=>choose(0);$('explorePlay').onclick=()=>choose(1);$('exploreBack').onclick=()=>choose(2);$('btnChangeAmmo').onclick=ammoMenu;$('ammoSelect').onclick=()=>{if(stage==='ammo'&&!screen)choose(ammoCursor);};for(const [id,dir] of [['ammoPrev',-1],['ammoNext',1]])$(id).onclick=()=>{if(stage!=='ammo'||screen)return;const count=G.availableAmmo().filter(a=>G.ammoRemaining(a)>0).length;scan=(ammoCursor+dir+count)%count;choices[scan].preview();focus();speak(choices[scan].label+'. '+choices[scan].sub);restartScan();};window.addEventListener('resize',()=>{if(screen==='story'){positionStory();centerMenuRows();return;}if(lastPresentation){const p=lastPresentation;show(p.title,p.hint,p.items,p.overlay,p.note);}});document.addEventListener('keydown',keyDown);document.addEventListener('keyup',keyUp);window.addEventListener('blur',clearHeld);document.addEventListener('narbe-input-cancelled',clearHeld);document.addEventListener('visibilitychange',()=>{if(document.hidden){moving=false;clearHeld();if(started&&G.CAM.phase!=='MENU')openMenu('pause');clearInterval(autoTimer);}});U.sm()?.subscribe(()=>{if(!screen&&['manual','target'].includes(stage)){clearHeld();targets=[];G.setAimMode(easyAim()?'easy':'sweep');if(easyAim())targetMenu();else manualMenu();}restartScan();$('controlHint').textContent=!screen&&stage==='manual'?'Space: aim · Enter: charge and release · Mouse: aim, hold click to charge':auto()?'Auto scan · Enter = choose · hold Enter = pause':'Tap Space = next · hold Space = back · Enter = choose';});document.addEventListener('pointerdown',()=>{try{RT.audio?.resume();RT.audio?.musicResume();}catch{}},{passive:true});const cv=document.querySelector('#cvWrap>canvas:not(#minimap)');
    const cameraReady=()=>!screen&&['ammo','manual','target','zoom'].includes(stage)&&!charging&&!enterDown&&!spaceDown;
    document.addEventListener('wheel',e=>{if(!cameraReady()||e.ctrlKey)return;e.preventDefault();const units=e.deltaMode===1?16:e.deltaMode===2?innerHeight:1;G.zoomView(-U.clamp(e.deltaY*units,-120,120)*.0018);zoomReadout();if(pointerLocation)pointerSolution=null;},{passive:false});
    cv.addEventListener('contextmenu',e=>e.preventDefault());
    cv.addEventListener('pointerdown',e=>{if(e.button!==2||!cameraReady())return;e.preventDefault();cameraDrag={id:e.pointerId,x:e.clientX,y:e.clientY};cv.setPointerCapture(e.pointerId);});
    cv.addEventListener('pointermove',e=>{if(cameraDrag?.id!==e.pointerId)return;e.preventDefault();G.orbitView(e.clientX-cameraDrag.x,e.clientY-cameraDrag.y);cameraDrag.x=e.clientX;cameraDrag.y=e.clientY;});
    window.addEventListener('pointerup',e=>{if(cameraDrag?.id!==e.pointerId||e.button!==2)return;e.preventDefault();cameraDrag=null;G.showView('aim');pointerSolution=null;if(cv.hasPointerCapture(e.pointerId))cv.releasePointerCapture(e.pointerId);});
    const pointerReady=()=>stage==='manual'&&!screen&&canAct()&&!enterDown&&!spaceDown;
    const pointAt=e=>{G.beginAimView();const solution=G.aimAtPointer(e.clientX,e.clientY,ammo);pointerLocation={x:e.clientX,y:e.clientY};pointerSolution=charging?null:solution;G.CAM.pointerAiming=true;aimHeld=false;if(solution?.reachable){yaw=solution.yawRad*180/Math.PI;if(charging){setPreview({yawRad:solution.yawRad,rangePct:range});}else{range=solution.rangePct;setPreview(solution);}}paintCharge();positionCharge();};
    const beginPointer=e=>{if(e.button!==0||!pointerReady()||charging)return;e.preventDefault();if(e.currentTarget===cv)pointAt(e);cv.setPointerCapture(e.pointerId);if(e.pointerType==='mouse'){if(!pointerSolution?.reachable)return;pointerCharge=e.pointerId;startCharge(true);G.CAM.pointerAiming=true;}else{pointerAim={id:e.pointerId};}};
    cv.addEventListener('pointerdown',beginPointer);$('btnPointerFire').addEventListener('pointerdown',e=>{if(e.pointerType==='mouse')beginPointer(e);});
    const movePointer=e=>{if(cameraDrag)return;if(!pointerReady())return;if(pointerCharge!==null&&pointerCharge!==e.pointerId)return;if(e.pointerType!=='mouse'&&pointerAim?.id!==e.pointerId)return;e.preventDefault();pointAt(e);};cv.addEventListener('pointermove',movePointer);$('btnPointerFire').addEventListener('pointermove',movePointer);
    window.addEventListener('pointerup',e=>{if(pointerCharge!==e.pointerId&&pointerAim?.id!==e.pointerId)return;const fired=pointerCharge===e.pointerId&&pointerReady()&&charging;cancelPointer();if(fired){charging=false;fire();}if(cv.hasPointerCapture(e.pointerId))cv.releasePointerCapture(e.pointerId);});
    const cancelCharge=()=>{if(pointerCharge!==null)charging=false;cancelPointer();paintCharge();};
    cv.addEventListener('pointercancel',cancelCharge);cv.addEventListener('lostpointercapture',cancelCharge);cv.addEventListener('pointerleave',()=>{mouseLast=null;});window.addEventListener('blur',cancelCharge);
    $('btnPointerFire').onclick=e=>{if(e.pointerType==='mouse')return;if(stage==='manual'&&!screen&&!charging&&(!pointerLocation||pointerSolution?.reachable)){aimHeld=false;fire();}};
    document.addEventListener('ballista-ammo-unlocked',e=>{clearTimeout(pickupNoticeTimer);$('pickupNoticeIcon').innerHTML=ammoArt(e.detail.id);$('pickupNoticeName').textContent=e.detail.name+(e.detail.count?' +'+e.detail.count:'');$('pickupNotice').querySelector('span').textContent=e.detail.count?e.detail.count+' shots added · ready for your next shot':e.detail.goalCollected?'Mission item collected · unlimited shots available':'Unlimited ammo unlocked for this kingdom';$('pickupNotice').hidden=false;pickupNoticeTimer=setTimeout(()=>{$('pickupNotice').hidden=true;},4500);speak(e.detail.count?e.detail.count+' '+e.detail.name+' shots collected.':e.detail.goalCollected?e.detail.name+' collected for your mission.':e.detail.name+' unlocked. Unlimited shots for this kingdom.');});
    phase='ATTRACT';}
  return {init,tick,__test:{targetPlans:()=>targets.map(t=>({label:t.label,p:{...t.p}})),previewAt(y,r){yaw=y;range=r;setPreview({yawRad:y*Math.PI/180,rangePct:r});},assessAim,aimCue:()=>({...aimCueState}),state:()=>({stage,screen,scan,choices:choices.map(c=>c.label),ammo:ammo?.id,ammoCursor,targets:targets.length,selected:selected?.label,moving,aimHeld,charging,yaw,range}),pressSpace:()=>keyDown({code:'Space',preventDefault(){}}),releaseSpace:()=>keyUp({code:'Space',preventDefault(){}}),pressReturn:()=>keyDown({code:'Enter',preventDefault(){}}),releaseReturn:()=>keyUp({code:'Enter',preventDefault(){}})}};
})();
