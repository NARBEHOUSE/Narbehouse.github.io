'use strict';
/* ================= Screens, scanning, in-scene choices, the stage ================= */
const screens={}; ['menu','howto','kind','color','pets','name','spell','game','pause','settings','progress','choice','dress','decor','album','load','help','more','outing','tricks','celebrate'].forEach(k=>screens[k]=$('#screen-'+k));
/* Screens whose choices include things in the picture (objects, pets). */
const TARGET_LAYERS={game:1,kind:1,color:1,pets:1};
let layer=null, scanIndex=0;
const captionEl=$('#caption'), tagEl=$('#focus-tag'), targetsEl=$('#targets'), sceneEl=$('#scene'), hudEl=$('#hud');
/* One thing at a time. Every line in the caption waits its turn: a new line waits until the one before
   it has been read aloud (or, with reading off, has been up long enough to read), so nothing is cut off
   and things never talk over each other. During a scene the scene holds still while a line waits (see
   holdScene in game.js), and nothing new starts by itself while lines are waiting (see tick). Lines
   only play in the room, and a line left waiting a long time (behind a menu) is dropped. */
const sayQ=[]; let sayUntil=0;
const lineReadMs=t=>clamp(String(t).length*45,1500,4000);
function showLine(text,speak){ captionEl.textContent=text; fitCaption(); const tts=voice.enabled(); if(speak) voice.speak(text);
  sayUntil=performance.now()+(speak&&tts?500:tts?1200:lineReadMs(text)); }
const lineBusy=()=>narrating()||performance.now()<sayUntil;
const linesWaiting=()=>sayQ.length>0||lineBusy();
function pumpSay(){ if(!sayQ.length||layer!=='game'||lineBusy()) return; const now=Date.now();
  while(sayQ.length>1&&now-sayQ[0].t>15000) sayQ.shift();
  const L=sayQ.shift(); showLine(L.text,L.speak); }
setInterval(pumpSay,120);
function setCaption(text,say){ const speak=say!==false;
  if(sayQ.length||lineBusy()){ if(sayQ.length&&sayQ[sayQ.length-1].text===text) return; sayQ.push({text,speak,t:Date.now()}); if(sayQ.length>6) sayQ.shift(); return; }
  showLine(text,speak); }
function fitCaption(){ const el=captionEl; el.style.fontSize=''; if(!el.offsetParent) return; let fs=parseFloat(getComputedStyle(el).fontSize), n=0;
  while(el.scrollHeight>el.clientHeight+1&&fs>10&&n++<30){ fs-=1; el.style.fontSize=fs+'px'; } }
/* A highlighted choice is read simply: just what the button says (its name, and a setting's current value),
   never the longer explanation. Pets and things in the room read their name. */
const plainText=s=>String(s||'').replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u2665]/gu,'').replace(/\s+/g,' ').trim();
function sayOf(el){ if(!el) return '';
  if(el._t){ const t=el._t; return plainText(typeof t.tag==='function'?t.tag():(t.tag||t.label)); }
  if(el.classList.contains('spell-row')) return el.dataset.say||'';
  const k=el.querySelector('.k'), v=el.querySelector('.v'), l=el.querySelector('.lbl');
  if(k) return plainText(k.textContent+(v&&v.textContent.trim()?', '+v.textContent:''));
  if(l) return plainText(l.textContent);
  return plainText(el.textContent||el.dataset.say); }
const visible=el=>!el.hidden&&el.offsetParent!==null;
let spellMode='row', spellRow=0;
const FOCUS={};   /* per-screen hooks run when the highlight moves (live previews) */
let focusT=null;  /* the in-scene thing that is highlighted, if any */
function getScannables(){
  if(!layer) return [];
  if(layer==='spell'){ const rows=$$('.spell-row',screens.spell); return spellMode==='row'?rows:$$('.key',rows[spellRow]); }
  const inScene=TARGET_LAYERS[layer]?TARGETS.filter(t=>t.el&&!t.el.hidden).map(t=>t.el):[];
  return inScene.concat($$('.scan-item',screens[layer]).filter(visible));
}
function setHighlight(i,announce){
  const items=getScannables(); $$('.is-scan').forEach(x=>x.classList.remove('is-scan')); focusT=null;
  /* -1: nothing highlighted, as when a menu has just opened. */
  if(i<0) scanIndex=-1; if(!items.length||i<0){ placeTag(); return; }
  scanIndex=((i%items.length)+items.length)%items.length;
  const el=items[scanIndex]; el.classList.add('is-scan'); focusT=el._t||null; placeTag();
  if(FOCUS[layer]) FOCUS[layer](el);
  if(announce!==false) voice.speak(sayOf(el),{label:true});
}
/* With Wait for Reading on, scanning waits until the reading is finished (see readingHold). */
/* From nothing highlighted, forward goes to the first choice and back to the last. (+n keeps a step back
   from the first choice wrapping to the last, never to -1.) */
function stepScan(d){ if(window.petChoice?.step(d))return; if(readingHold()) return; const n=getScannables().length; if(!n) return; setHighlight(scanIndex<0?(d>0?0:n-1):scanIndex+d+n); play('blip',.35); }

/* ---- The selection pause ----
   Only while something happens by itself in the scene (a surprise, a new toy, the game reading
   something aloud) do choices wait a moment, so a press meant for something else does nothing.
   Menus and ordinary choices never wait. */
let lockUntil=0;
const locked=()=>performance.now()<lockUntil;
function lockInput(ms){ lockUntil=Math.max(lockUntil,performance.now()+ms); }
function nope(el){ play('nope',.3); if(!el) return; el.classList.remove('nope'); void el.offsetWidth; el.classList.add('nope'); }
function activate(){
  if(window.petChoice?.activate())return;
  if(typeof adoptLock!=='undefined'&&adoptLock) return;
  const items=getScannables(), el=items[scanIndex]; if(!el) return;
  if((locked()||readingHold())&&!el.dataset.urgent){ nope(el._t?null:el); return; }
  if(layer==='spell'&&spellMode==='row'){ spellRow=scanIndex; spellMode='col'; play('choose'); setHighlight(0); resetAuto(); return; }
  el.click();
}
const HUD_LAYERS={game:1}, CAPTION_LAYERS={game:1};
/* Shared choice contexts, including the room, open blank. The fallback keeps its native start. */
const PLAY_LAYERS={game:1,outing:1};
function show(name,intro,opt){
  const prev=layer;
  Object.keys(screens).forEach(k=>{ screens[k].hidden=k!==name; });
  layer=name; if(name==='spell') spellMode='row';
  hudEl.hidden=!(HUD_LAYERS[name]&&state); captionEl.hidden=!(CAPTION_LAYERS[name]&&state);
  if(!TARGET_LAYERS[name]) setTargets([]); else if(TARGET_BUILD[name]) setTargets(TARGET_BUILD[name]());
  if(typeof updateHeader==='function') updateHeader(); updateHint();
  if(opt&&opt.grace) lockInput(opt.grace);
  /* Menus that dim the scene keep it where it is, so nothing jumps behind them. */
  const keepStage=screens[name].classList.contains('dim');
  requestAnimationFrame(()=>{ measureBtns(); if(!keepStage||!prev) layoutStage(); layoutAll(); placeTargets(); const start=opt&&opt.focus!=null?opt.focus:PLAY_LAYERS[name]?0:-1; if(!window.petChoice?.open())setHighlight(start,false);
    /* Back in the room while a line is still being read or waiting: the greeting takes its turn too. */
    const first=getScannables()[scanIndex]; if(name==='game'&&intro&&state&&(sayQ.length||lineBusy())) setCaption(intro); else if(!window.petChoice?.announce(intro))voice.speak([intro,sayOf(first)].filter(Boolean).join('. '),{label:!intro}); resetAuto(); });
}
const TARGET_BUILD={};
function updateHint(){ const s=scan.settings(); const h=$('#hint'); if(!h) return; h.textContent=s.autoScan?'Enter = choose':'Tap Space = next · hold Space = back · Enter = choose · hold Enter in the game = pause'; }
let autoTimer=null, autoHeld=false;
function resetAuto(){ if(window.petChoice?.owns()){clearInterval(autoTimer);autoTimer=null;window.petChoice.sync();return;} clearInterval(autoTimer); autoTimer=null; const s=scan.settings(); if(!s.autoScan||!layer) return;
  autoTimer=setInterval(()=>{ if(spaceDown||enterDown) return; if(readingHold()){ autoHeld=true; return; } if(getScannables().length>1||scanIndex<0) stepScan(1); },s.interval); }
/* Auto scan waits out narration, then gives a full step before moving on. */
setInterval(()=>{ if(window.petChoice?.owns()){window.petChoice.updateClock();return;} if(autoHeld&&!readingHold()){ autoHeld=false; resetAuto(); } },150);

/* ================= Switch input contract ================= */
/* Each valid Space release advances once. Shared input sensitivity handles switch bounce.
   Hold Space to scan backwards; Scan Speed controls the repeat rate and Auto Scan only. */
const BACK_HOLD=3000, PAUSE_HOLD=5000, RING_SHOW=1000, FALLBACK_BUFFER=50;
const scanMs=()=>scan.settings().interval||2000;
let spaceDown=0, enterDown=0, backTimer=null, backRepeat=null, backActive=false, enterConsumed=false, lastRelease=0, holdTimer=null;
const isSpace=e=>e.code==='Space'||e.key===' '||e.key==='Spacebar';
const isEnter=e=>e.code==='Enter'||e.code==='NumpadEnter'||e.key==='Enter';
const fallbackBlocked=()=>!SM()&&performance.now()-lastRelease<FALLBACK_BUFFER;
function clearHolds(){ window.petChoice?.cancel(); clearTimeout(backTimer); clearInterval(backRepeat); stopPauseHold(); spaceDown=0; enterDown=0; backActive=false; enterConsumed=false; }
/* The hub's scan manager filters presses that are too quick (a tremor, or a burst of fast taps): it
   swallows the key release and sends narbe-input-cancelled instead. That press counts as if it never
   happened, so a swallowed release can never leave Enter "held" (which would start the pause
   countdown) or Space "held" (which would start going back). */
function cancelPress(code){
  window.petChoice?.cancel();
  if(code==='Enter'||code==='NumpadEnter'){ stopPauseHold(); enterDown=0; enterConsumed=false; }
  else if(code==='Space'){ clearTimeout(backTimer); clearInterval(backRepeat); spaceDown=0; backActive=false; } }
document.addEventListener('narbe-input-cancelled',e=>cancelPress(e.detail&&e.detail.code));
document.addEventListener('keydown',e=>{
  /* A fresh press while the game still thinks the key is held means its release was lost: start over. */
  if(!e.repeat&&isSpace(e)&&spaceDown) cancelPress('Space');
  if(!e.repeat&&isEnter(e)&&enterDown) cancelPress('Enter');
  if(isSpace(e)){ e.preventDefault(); if(e.repeat||spaceDown||fallbackBlocked()) return; spaceDown=performance.now(); backActive=false;
    if(window.petChoice?.down(e))return;
    backTimer=setTimeout(()=>{ backActive=true; stepScan(-1); backRepeat=setInterval(()=>stepScan(-1),scanMs()); },BACK_HOLD); return; }
  if(isEnter(e)){ e.preventDefault(); if(e.repeat||enterDown||fallbackBlocked()) return; enterDown=performance.now(); enterConsumed=false; window.petChoice?.down(e); if(layer==='game') startPauseHold(); return; }
  if(layer==='spell'){ if(/^[a-z]$/i.test(e.key)&&!e.ctrlKey&&!e.metaKey&&!e.altKey){ e.preventDefault(); addLetter(e.key.toUpperCase()); } else if(e.key==='Backspace'){ e.preventDefault(); deleteLetter(); } }
});
document.addEventListener('keyup',e=>{
  if(isSpace(e)){ e.preventDefault(); if(!spaceDown) return; if(window.petChoice?.up(e)){lastRelease=performance.now();return;} clearTimeout(backTimer); clearInterval(backRepeat);
    const wasBack=backActive; spaceDown=0; backActive=false; lastRelease=performance.now();
    if(!wasBack) stepScan(1); resetAuto(); return; }
  if(isEnter(e)){ e.preventDefault(); if(!enterDown) return; window.petChoice?.up(e); stopPauseHold(); enterDown=0; lastRelease=performance.now();
    if(enterConsumed){ enterConsumed=false; return; } activate(); resetAuto(); }
});
window.addEventListener('blur',clearHolds);
/* Mouse and touch go through the same rules as switches. */
document.addEventListener('click',e=>{
  const el=e.target.closest&&e.target.closest('.scan-item,.key,.target'); if(!el) return;
  if(locked()){ e.stopPropagation(); e.preventDefault(); nope(el._t?null:el); return; }
  if(el.classList.contains('key')){ spellRow=$$('.spell-row').indexOf(el.closest('.spell-row')); spellMode='col'; }
  const i=getScannables().indexOf(el); if(i>=0&&i!==scanIndex) setHighlight(i,false); window.petChoice?.pointer(el); el.blur(); resetAuto();
},true);
const ringEl=$('#hold-ring'), dialEl=$('#dial');
function startPauseHold(){ const t0=performance.now(); let beeps=0;
  holdTimer=setInterval(()=>{ const e=performance.now()-t0;
    if(e>=RING_SHOW){ ringEl.hidden=false; dialEl.style.setProperty('--p',clamp((e-RING_SHOW)/(PAUSE_HOLD-RING_SHOW),0,1).toFixed(3));
      const s=Math.floor((e-RING_SHOW)/1000)+1; if(s>beeps&&s<=4){ beeps=s; play('beep'+s,.6); } }
    if(e>=PAUSE_HOLD){ enterConsumed=true; stopPauseHold(); openPause(); } },40); }
function stopPauseHold(){ clearInterval(holdTimer); holdTimer=null; ringEl.hidden=true; dialEl.style.setProperty('--p',0); }

/* ================= The stage =================
   The scene canvas covers the whole window. The part that matters (160 x 96 around the pet) is
   fitted into the space the menus and HUD leave free; the rest of the view extends the scene. */
const STAGE={s:4,left:0,top:0};
const snapR=v=>Math.round(v*RES)/RES;
/* stageRect: the space the scene is sized for (all but the HUD, caption and corner buttons).
   freeRect: the part of that a side menu leaves open; the camera centers what matters there. */
function stageRect(){ return freeRect(true); }
/* How much of the top bar the buttons take, so the bar ends where they begin. */
function measureBtns(){ const g=$('.game-btns'); if(!g||!visible(g)||matchMedia('(max-aspect-ratio:1/1)').matches) return; document.documentElement.style.setProperty('--btns-w',Math.ceil(g.getBoundingClientRect().width)+'px'); }
/* The bottom of whatever sits across the top: the HUD, and the game buttons beside it. */
function topBarBottom(){ let b=0; if(!hudEl.hidden) b=hudEl.getBoundingClientRect().bottom; const gb=$('.game-btns'); if(gb&&visible(gb)){ const r=gb.getBoundingClientRect(); if(r.top<innerHeight*.5) b=Math.max(b,r.bottom); } return b; }
function freeRect(ignoreSide){ const W=innerWidth, H=innerHeight; let y=0, bottom=H, right=W;
  { const tb=topBarBottom(); if(tb) y=tb+4; }
  if(!captionEl.hidden){ const r=captionEl.getBoundingClientRect(); bottom=Math.min(bottom,r.top-4); }
  const scr=screens[layer];
  if(scr){ const tp=$('.title-pill',scr); if(tp&&visible(tp)) y=Math.max(y,tp.getBoundingClientRect().bottom+4);
    const cr=$('.corner-row',scr); if(cr&&visible(cr)) bottom=Math.min(bottom,cr.getBoundingClientRect().top-4);
    $$('.pause-btn,.more-btn',scr).forEach(pb=>{ if(!visible(pb)) return; const r=pb.getBoundingClientRect(); if(r.top>H*.5) bottom=Math.min(bottom,r.top-4); });
    const side=$('.card.side',scr); if(!ignoreSide&&side&&visible(side)){ const r=side.getBoundingClientRect(); if(r.left>W*.25) right=r.left-8; else bottom=Math.min(bottom,r.top-8); } }
  return {x:0,y,w:Math.max(80,right),h:Math.max(60,bottom-y)}; }
function layoutStage(){
  const W=innerWidth, H=innerHeight, sr=stageRect(), s=Math.max(.5,Math.min(sr.w/164,sr.h/98));
  let vw=W/s, left=0; const MAXW=300; if(vw>MAXW){ vw=MAXW; left=(W-vw*s)/2; }
  VIEW.w=snapR(vw); VIEW.h=snapR(H/s);
  const rescale=Math.abs(s-STAGE.s)>.001; STAGE.s=s; STAGE.left=left;
  applyRoomLayout(VIEW.w,VIEW.h); if(typeof applyGrid==='function') applyGrid(); aimCamera(); if(rescale||CAM.snap){ VIEW.x=CAM.tx; VIEW.y=CAM.ty; CAM.snap=false; }
  sceneEl.width=Math.round(VIEW.w*RES); sceneEl.height=Math.round(VIEW.h*RES);
  Object.assign(sceneEl.style,{left:left+'px',top:'0px',width:VIEW.w*s+'px',height:VIEW.h*s+'px'});
  ctx=sceneEl.getContext('2d'); ctx.setTransform(RES,0,0,RES,-VIEW.x*RES,-VIEW.y*RES); ctx.imageSmoothingEnabled=false;
  STAGE.top=0;
  if(typeof onStageChange==='function') onStageChange();
}
/* The camera: glide so the thing that matters (the chosen spot, the pet) sits in the open part of
   the screen beside a menu, at full size. */
const CAM={tx:0,ty:0,snap:true};
function aimCamera(){ const s=STAGE.s, fr=freeRect(), P=(typeof camPoint==='function'&&camPoint())||{x:64,y:48};
  const roomFits=96*s<=fr.h+2, py=roomFits?48:P.y;
  CAM.tx=snapR(P.x-(fr.x+fr.w/2-STAGE.left)/s); CAM.ty=snapR(py-(fr.y+fr.h/2)/s); }
function stepCamera(){ const dx=CAM.tx-VIEW.x, dy=CAM.ty-VIEW.y; if(Math.abs(dx)<.02&&Math.abs(dy)<.02) return false;
  const k=reduceMotion?1:.16; VIEW.x=snapR(Math.abs(dx)<.6?CAM.tx:VIEW.x+dx*k); VIEW.y=snapR(Math.abs(dy)<.6?CAM.ty:VIEW.y+dy*k);
  ctx.setTransform(RES,0,0,RES,-VIEW.x*RES,-VIEW.y*RES); ctx.imageSmoothingEnabled=false; return true; }
const toCss=(x,y)=>({x:STAGE.left+(x-VIEW.x)*STAGE.s,y:STAGE.top+(y-VIEW.y)*STAGE.s});

/* ================= In-scene choices =================
   A target is something in the picture you can choose: {id, label, say, rect(), fn}. rect() gives
   its box in scene coordinates, or null while it is out of sight. Each target is backed by an
   invisible button, so switches, mouse and touch all work the same way. */
let TARGETS=[];
function setTargets(list){ TARGETS=list||[]; targetsEl.innerHTML=''; TARGETS.forEach(t=>{ const b=document.createElement('button'); b.className='target'; b.tabIndex=-1;
  b.setAttribute('aria-label',t.label); b._t=t; t.el=b; b.addEventListener('click',()=>t.fn(b)); targetsEl.appendChild(b); }); refreshTargetSay(); placeTargets(true); }
function refreshTargetSay(){ TARGETS.forEach(t=>{ if(t.el) t.el.dataset.say=typeof t.say==='function'?t.say():(t.say||t.label); }); }
function placeTargets(changed=false){ TARGETS.forEach(t=>{ const r=t.rect&&t.rect(); if(t.el.hidden!==!r) changed=true; if(!r){ t.el.hidden=true; return; } t.el.hidden=false; const a=toCss(r[0],r[1]);
  Object.assign(t.el.style,{left:a.x+'px',top:a.y+'px',width:r[2]*STAGE.s+'px',height:r[3]*STAGE.s+'px'}); }); if(changed) window.petChoice?.sync(); }
function placeTag(){
  if(!focusT||!focusT.el||focusT.el.hidden){ tagEl.hidden=true; return; }
  const r=focusT.rect(); if(!r){ tagEl.hidden=true; return; }
  tagEl.textContent=typeof focusT.tag==='function'?focusT.tag():(focusT.tag||focusT.label); tagEl.hidden=false;
  const top=toCss(r[0]+r[2]/2,r[1]), bot=toCss(r[0]+r[2]/2,r[1]+r[3]), tw=tagEl.offsetWidth, th=tagEl.offsetHeight;
  let minY=12; { const tb=topBarBottom(); if(tb) minY=tb+8; } const scr=screens[layer], tp=scr&&$('.title-pill',scr); if(tp&&visible(tp)) minY=Math.max(minY,tp.getBoundingClientRect().bottom+8);
  const below=top.y-14-th<minY;
  tagEl.classList.toggle('below',below);
  tagEl.style.left=clamp(top.x,tw/2+8,innerWidth-tw/2-8)+'px'; tagEl.style.top=(below?bot.y+14:top.y-14)+'px';
}

/* ================= The highlight =================
   Glow or bold outline, in the player's chosen color. Things in the scene get a colored outline that
   follows their shape; menu buttons fill with the color. */
const HL_COLORS=[['Gold','#FFD700','#1C130E'],['Cyan','#00E5FF','#06222A'],['Lime','#7CFF3A','#0B2A08'],['Pink','#FF5FB0','#2A0A1C'],['Orange','#FF9A1F','#2A1400'],
  ['Red','#FF3B30','#FFFFFF'],['Violet','#B45CFF','#FFFFFF'],['Blue','#2F7BFF','#FFFFFF'],['White','#FFFFFF','#1C130E']];
function applyHL(){ const c=HL_COLORS[gs.hlColor]||HL_COLORS[0]; document.body.style.setProperty('--hl',c[1]); document.body.style.setProperty('--hl-ink',c[2]);
  document.body.classList.toggle('hl-glow',gs.hlStyle==='glow'); document.body.classList.toggle('hl-outline',gs.hlStyle==='outline'); }
const silCache=new WeakMap();
function silOf(s,col){ let m=silCache.get(s); if(!m){ m={}; silCache.set(s,m); } if(m[col]) return m[col];
  const c=document.createElement('canvas'); c.width=s.width; c.height=s.height; c.lw=s.lw||s.width; c.lh=s.lh||s.height; c.px=s.px||0; c.py=s.py||0; const g=c.getContext('2d'); g.drawImage(s,0,0); g.globalCompositeOperation='source-in'; g.fillStyle=col; g.fillRect(0,0,c.width,c.height); return m[col]=c; }
function ringBlit(g,s,x,y,r){ for(let a=0;a<12;a++){ const an=a/12*TAU; blit(g,s,x+Math.cos(an)*r,y+Math.sin(an)*r); } }
/* Draw before the sprite itself: an outline around the sprite's own shape. */
function blitHL(g,s,x,y){ const col=(HL_COLORS[gs.hlColor]||HL_COLORS[0])[1], pulse=reduceMotion?1:1+.14*Math.sin(performance.now()/260);
  if(gs.hlStyle==='outline'){ ringBlit(g,silOf(s,'#1C130E'),x,y,3.4*pulse); ringBlit(g,silOf(s,col),x,y,2.4*pulse); }
  else { g.save(); g.shadowColor=col; g.shadowBlur=16*pulse; ringBlit(g,silOf(s,col),x,y,1.3); g.restore(); ringBlit(g,silOf(s,col),x,y,1); } }

/* ================= Fitted lists =================
   renderList measures the space it has and picks columns and row height. If there are more
   items than fit, it shows a page at a time with a "More" button, so nothing is ever cut off. */
const LISTS={};
function mkBtn(it){
  const b=document.createElement('button'); b.className='btn scan-item'+(it.cls?' '+it.cls:''); b.tabIndex=-1;
  if(it.icon){ const c=document.createElement('canvas'); c.dataset.lw=it.icon.lw; c.dataset.lh=it.icon.lh; prepCanvas(c); it.icon.paint(c); b.appendChild(c); }
  if(it.sw){ const s=document.createElement('span'); s.className='sw'; s.style.background=it.sw; b.appendChild(s); b.classList.add('has-sw'); }
  if(it.value!=null){ b.classList.add('row'); const k=document.createElement('span'); k.className='k'; k.textContent=it.label; const v=document.createElement('span'); v.className='v'; v.textContent=it.value;
    if(it.desc){ const w=document.createElement('span'); w.className='kd'; const d=document.createElement('span'); d.className='d'; d.textContent=it.desc; w.append(k,d); b.append(w,v); } else b.append(k,v); }
  else { const t=document.createElement('span'); t.className='lbl'; t.textContent=it.label; b.appendChild(t); if(it.sub){ const s=document.createElement('span'); s.className='sub'; s.textContent=it.sub; b.appendChild(s); } }
  if(it.say) b.dataset.say=it.say; else if(it.sub) b.dataset.say=it.label+'. '+it.sub; if(it.urgent) b.dataset.urgent='1'; if(it.data!==undefined) b.dataset.item=it.data===null?'':it.data; if(it.id) b.id=it.id;
  b._it=it; b.addEventListener('click',()=>it.fn&&it.fn(b)); return b;
}
function renderList(id,items,opts){ const prev=LISTS[id]; LISTS[id]={items,opts:opts||{},page:(opts&&opts.keepPage&&prev)?prev.page:0}; layoutList(id); }
function layoutList(id){
  const L=LISTS[id], el=document.getElementById(id); if(!L||!el) return; const wrap=el.parentElement; if(!wrap||!wrap.offsetParent) return;
  const o=L.opts, vh=window.innerHeight, short=wrap.classList.contains('short')||(wrap.dataset.shortPortrait!=null&&innerHeight>innerWidth);
  const W=Math.min(wrap.clientWidth,o.maxw||760), gap=Math.round(clamp(vh*.014,6,12)), minRow=o.minRow||Math.round(clamp(vh*.06,40,60)), maxRow=o.maxRow||Math.round(clamp(vh*.11,50,92));
  const tail=o.tail||[], all=L.items, total=all.length+tail.length;
  let cols=o.cols||(o.rows?(W>=700?2:1):(W>=520&&total>4)||(W>=300&&total>5)?2:1); if(!o.cols&&!o.rows&&W>=880&&total>9) cols=3;
  const H=short?(Math.ceil(total/cols)*(maxRow*.8+gap)):wrap.clientHeight;
  const rowsFit=Math.max(1,Math.floor((H+gap)/(minRow+gap))), cap=rowsFit*cols;
  let shown=all, nav=[];
  if(total>cap){ const per=Math.max(1,cap-tail.length-1), pages=Math.ceil(all.length/per); L.page=((L.page%pages)+pages)%pages; shown=all.slice(L.page*per,L.page*per+per);
    nav=[{label:'More',sub:`Page ${L.page+1} of ${pages}`,say:`More. Page ${L.page+1} of ${pages}`,cls:'soft',fn:()=>{ L.page++; play('blip'); layoutList(id); const sc=getScannables(), first=$('.scan-item',el); setHighlight(Math.max(0,sc.indexOf(first))); }}]; }
  const list=shown.concat(nav,tail), rows=Math.ceil(list.length/cols), rowh=Math.floor(Math.min(maxRow,(H-gap*(rows-1))/rows));
  el.style.setProperty('--cols',cols); el.style.setProperty('--rowh',Math.max(28,short?maxRow*.8:rowh)+'px'); el.style.setProperty('--gap',gap+'px'); if(o.maxw) el.style.setProperty('--maxw',o.maxw+'px');
  el.style.setProperty('--fs',clamp(rowh*.3,13,22)+'px');
  el.innerHTML=''; list.forEach(it=>el.appendChild(mkBtn(it)));
}
function fitCanvases(){ $$('.fit').forEach(f=>{ if(!f.offsetParent) return; const c=$('canvas',f); if(!c) return; const a=+f.dataset.aspect||(c.lw/c.lh), W=f.clientWidth, H=f.clientHeight; if(!W||!H) return;
  let w=W, h=W/a; if(h>H){ h=H; w=H*a; } Object.assign(c.style,{position:'absolute',left:'50%',top:'50%',transform:'translate(-50%,-50%)',width:Math.floor(w)+'px',height:Math.floor(h)+'px'}); }); }
function fitText(el){ if(!el||!el.offsetParent) return; el.style.fontSize=''; let fs=parseFloat(getComputedStyle(el).fontSize); let n=0; while(el.scrollHeight>el.clientHeight+1&&fs>11&&n++<40){ fs-=1; el.style.fontSize=fs+'px'; } }
function layoutAll(){ Object.keys(LISTS).forEach(id=>{ const el=document.getElementById(id); if(el&&el.offsetParent) layoutList(id); }); fitCanvases(); fitCaption(); $$('.howto,.progress').forEach(el=>{ if(el.classList.contains('now-page')&&typeof fitTips==='function') fitTips(el); else fitText(el); }); }
let resizeT=null;
window.addEventListener('resize',()=>{ clearTimeout(resizeT); resizeT=setTimeout(()=>{ const keep=scanIndex; measureBtns(); layoutStage(); layoutAll(); placeTargets(); if(!window.petChoice?.sync()) setHighlight(keep,false); },120); });
