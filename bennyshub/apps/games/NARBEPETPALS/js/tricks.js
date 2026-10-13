'use strict';
/* ================= Tricks, the Trick Show, and growing up =================
   The first tricks (sit, spin, high five, dance, speak) come with care stars as before. More tricks
   open as the pet grows: each needs a life stage and some care stars, and is taught the moment both
   are reached. Tricks (in More to Do) lists every trick the pet knows so the player can ask for any of
   them, any time, and the Trick Show performs them all on a little stage. Each time the pet grows up,
   a celebration card shows the new look and what's new. */
const NEW_TRICKS=[
  {id:'rollover',name:'Roll over',kinds:['dog','cat'],stage:1,stars:20},
  {id:'bell',name:'Ring the dinner bell',kinds:['cat'],stage:1,stars:28},
  {id:'bow',name:'Take a bow',kinds:['dog'],stage:1,stars:30},
  {id:'wave',name:'Wave hello',kinds:['dog','cat'],stage:1,stars:35},
  {id:'beg',name:'Sit pretty',kinds:['dog'],stage:2,stars:40},
  {id:'hoop',name:'Jump through a hoop',kinds:['dog','cat'],stage:2,stars:48},
  {id:'playdead',name:'Play dead',kinds:['dog'],stage:2,stars:55},
  {id:'fistbump',name:'Fist bump',kinds:['cat'],stage:2,stars:55},
  {id:'nose',name:'Treat on the nose',kinds:['dog','cat'],stage:2,stars:70},
  {id:'combo',name:'The big routine',kinds:['dog','cat'],stage:3,stars:90,needs:5}];
const trickName=id=>{ const t=TRICK_NAME[id]; if(t) return typeof t==='function'?t():t; const n=NEW_TRICKS.find(x=>x.id===id); return n?n.name:id; };
const tricksFor=()=>NEW_TRICKS.filter(t=>t.kinds.includes(kind()));
/* The next trick the pet is ready to learn, if any. */
function newTrickDue(){ if(!state) return null; const known=learnedTricks();
  return tricksFor().find(t=>!t.school&&!known.includes(t.id)&&stageIdx()>=t.stage&&(state.stars||0)>=t.stars&&(!t.needs||known.length>=t.needs))||null; }
function teachTrick(t){ const n=state.name; lastCelebrate=Date.now(); nextEvent=Math.max(nextEvent,Date.now()+EVENT_GAP[0]*paceK());
  state.tricks=(state.tricks||[]).concat([t.id]); save();
  announce(`You taught ${n} a new trick: ${t.name}!`);
  startAnim('trick:'+t.id,V['trick:'+t.id].dur,()=>{ setCaption(`${n} learned ${t.name}. Ask for it any time in Tricks, in More to Do.`); addPhoto('trick',`${n} learned a new trick: ${t.name}.`); state.moreNew=true; updateMoreBadge(); quietUntil=Date.now()+6000; }); }

/* ---- The new tricks ---- */
const pawAt=(p,side,up)=>{ const x=PETX+22+side*(G().pawDx+5)+p.dx, y=chestAt(p)-up*(big()?11:8); pxEll(ctx,x,y,3.6,3.2,INK); pxEll(ctx,x,y,2.9,2.5,STYLES[state.style].pal.light); pxEll(ctx,x-1,y+.9,.6,.6,'#F2A9B4'); pxEll(ctx,x+1,y+.9,.6,.6,'#F2A9B4'); pxEll(ctx,x,y-.6,.9,.7,'#F2A9B4'); };
const cheer=(a,e,at)=>{ if(e>at) once(a,'c',()=>{ play('happy',.6); burst(6); later(()=>play(happyNoise(),.45),300); }); };
V['trick:rollover']={dur:3200,
  pose(p,e){ if(e<500){ p.eyes='open'; } else if(e<2300){ const k=Math.floor((e-500)/300); p.body='lie'; p.frame=0; p.face=k%2?-1:1; p.eyes=k%2?'closed':'happy'; p.mouth='open'; p.dy=(k%2)?-2:0; p.dx=Math.round(Math.sin((e-500)/600)*4); } else { p.eyes='happy'; p.mouth='tongue'; } },
  tick(a,e,now){ if(e>500) once(a,'s',()=>setCaption('Roll over!')); if(e>500&&e<2300&&now>=a.next){ play('rustle',.25); spawn('sparkleSmall',64+rand(-16,16),80,0,-6,.5); a.next=now+300; } cheer(a,e,2300); }};
V['trick:bow']={dur:3000,
  pose(p,e){ if(e<500) p.eyes='open'; else if(e<2200){ p.body='stand'; p.face=1; p.frame=0; p.headDy=4; p.eyes='happy'; p.mouth='tongue'; p.wag=70; } else { p.eyes='happy'; p.mouth='tongue'; } },
  tick(a,e){ if(e>500) once(a,'s',()=>{ setCaption('Take a bow!'); play('twinkle',.5); }); cheer(a,e,2200); }};
V['trick:wave']={dur:3000,
  pose(p,e){ p.eyes=e>600?'happy':'open'; p.mouth=e>600?'tongue':'smile'; if(e>500&&e<2300) p.dx=-1; },
  front(e,a,p){ if(e>500&&e<2300) pawAt(p,1,.85+Math.sin(e/110)*.35); },
  tick(a,e){ if(e>500) once(a,'s',()=>{ setCaption('Wave hello!'); play('choose'); }); cheer(a,e,2300); }};
V['trick:beg']={dur:3000,
  pose(p,e){ if(e<500) p.eyes='open'; else if(e<2300){ p.dy=-4; p.headDy=-1; p.eyes=Math.floor(e/800)%2?'puppy':'happy'; p.wag=90; } else { p.eyes='happy'; p.mouth='tongue'; } },
  front(e,a,p){ if(e>500&&e<2300){ pawAt(p,-1,.55); pawAt(p,1,.55); } },
  tick(a,e){ if(e>500) once(a,'s',()=>{ setCaption('Sit pretty!'); play('twinkle',.5); }); cheer(a,e,2300); }};
V['trick:playdead']={dur:3600,
  pose(p,e){ if(e<500){ p.eyes='open'; } else if(e<2600){ p.body='lie'; p.face=1; p.frame=0; p.eyes='closed'; p.mouth='tongue'; p.dy=1; } else if(e<3000){ p.dy=-Math.round(arc(ph(e,2600,3000),6)); p.eyes='happy'; p.mouth='open'; } else { p.eyes='happy'; p.mouth='tongue'; } },
  tick(a,e){ if(e>450) once(a,'b',()=>{ setCaption('Bang! Play dead...'); play('pop',.5); }); if(e>600) once(a,'t',()=>play('thump',.35)); if(e>2600) once(a,'u',()=>{ setCaption('Surprise! Just kidding!'); play('bounce',.5); }); cheer(a,e,3000); }};
V['trick:hoop']={dur:3600,noShadow:true,
  pose(p,e){ if(e<600){ p.eyes='open'; p.dx=Math.round(lerp(0,-34,e/600)); p.body='walk'; p.face=-1; p.frame=Math.floor(e/140)%4; }
    else if(e<2200){ const k=ph(e,600,2200); p.body='run'; p.face=1; p.frame=Math.floor(e/90)%4; p.dx=Math.round(lerp(-34,40,k)); const near=Math.abs(p.dx-14); p.dy=near<16?-Math.round(Math.cos(near/16*Math.PI/2)*12):0; p.eyes='happy'; p.mouth='open'; }
    else if(e<3000){ p.body='walk'; p.face=-1; p.frame=Math.floor(e/140)%4; p.dx=Math.round(lerp(40,0,ph(e,2200,3000))); p.eyes='happy'; } else { p.eyes='happy'; p.mouth='tongue'; } },
  behind(e){ pxRing(ctx,78,64,10,13,2.2,INK); pxRing(ctx,78,64,9.2,12.2,1.4,(Math.floor(e/100)%2)?'#F07A8E':'#F4C542'); rect(ctx,77,77,2,10,'#9AA4AE'); },
  tick(a,e){ if(e>600) once(a,'s',()=>setCaption('Jump through the hoop!')); if(e>1300) once(a,'w',()=>{ play('whoosh',.5); spawn('sparkle',78,50,0,-8,.8); }); cheer(a,e,2300); }};
V['trick:fistbump']={dur:2800,
  pose(p,e){ p.eyes=e>1100?'happy':'open'; p.mouth=e>1100?'tongue':'smile'; },
  front(e,a,p){ if(e>300&&e<2200){ const up=Math.min(1,ph(e,300,700)); pawAt(p,1,up*.7); const hx=e<900?lerp(140,PETX+22+G().pawDx+9,ph(e,300,900)):PETX+22+G().pawDx+9; blit(ctx,SPR.hand,hx,chestAt(p)-up*(big()?11:8)-12); } },
  tick(a,e){ if(e>900) once(a,'f',()=>{ play('pop',.6); burst(5); setCaption('Fist bump!'); }); cheer(a,e,2200); }};
V['trick:bell']={dur:3800,
  pose(p,e){ if(e<600) p.eyes='open'; else if(e<1400){ p.dx=6; p.eyes='happy'; p.headDy=Math.floor(e/200)%2; } else if(e<3000){ p.dx=6; const b=Math.floor(e/200)%2; p.headDy=1+b; p.eyes='closed'; p.mouth=b?'open':'smile'; } else { p.eyes='happy'; p.mouth='tongue'; } },
  front(e,a,p){ pxEll(ctx,92,86,6,1.6,INK); pxEll(ctx,92,85.4,5.2,1.1,'#C9A04A'); pxEll(ctx,92,82,4.2,3.6,INK); pxEll(ctx,92,82,3.5,3,'#F4C542'); rect(ctx,91.4,77.4,1.2,1.6,'#C9A04A'); if(e>700&&e<1400) pawAt(p,1,.2+Math.abs(Math.sin(e/100))*.3);
    if(e>1300) blit(ctx,BOWLS[e<2200?0:1],50,83); },
  tick(a,e){ if(e>600) once(a,'s',()=>setCaption('Ring the dinner bell!')); [800,1100].forEach((t,i)=>{ if(e>t) once(a,'d'+i,()=>{ play('ding',.55); spawn('note',92,74,2,-10,1); }); }); if(e>1400) once(a,'f',()=>setCaption('Ding ding! Dinner is served.')); cheer(a,e,3000); }};
V['trick:nose']={dur:3800,
  pose(p,e){ if(e<2200){ p.eyes='open'; p.headDy=-1; } else if(e<2700){ p.headDy=-2; p.mouth='open'; p.eyes='happy'; if(e>2450) p.dy=-3; } else if(e<3200){ const b=Math.floor(e/170)%2; p.headDy=b; p.mouth=b?'open':'smile'; p.eyes='closed'; } else { p.eyes='happy'; p.mouth='tongue'; } },
  front(e,a,p){ const m=mouthAt(p), s=SPR.cookie; if(e<2200) blit(ctx,s,m.x-4.5,m.y-9+Math.sin(e/300)*.4); else if(e<2600){ const k=ph(e,2200,2600); blit(ctx,s,m.x-4.5,m.y-9+arc(k,14)+k*6); } },
  tick(a,e){ if(e>300) once(a,'s',()=>setCaption('Steady... steady...')); if(e>2200) once(a,'t',()=>{ play('whoosh',.4); setCaption('Toss and catch!'); }); if(e>2600) once(a,'c2',()=>{ play('crunch',.6); crumbs(64,70); }); cheer(a,e,3200); }};
/* The big routine: sit, spin, a bow (or a wave), and a happy jump, all in a row. */
V['trick:combo']={dur:6400,
  parts(){ return kind()==='dog'?['sit','spin','bow']:['sit','spin','wave']; },
  pose(p,e,a){ const P=this.parts(), seg=Math.floor(e/1800); if(seg<3){ const d=V['trick:'+P[seg]]; d.pose.call(d,p,e%1800+500,a); } else { p.eyes='happy'; p.mouth='tongue'; p.dy=-Math.round(arc(ph(e,5400,6000),10)); } },
  front(e,a,p){ const P=this.parts(), seg=Math.floor(e/1800); if(seg<3){ const d=V['trick:'+P[seg]]; if(d.front) d.front.call(d,e%1800+500,a,p); } },
  tick(a,e){ const P=this.parts(); P.forEach((id,i)=>{ if(e>i*1800+50) once(a,'n'+i,()=>{ setCaption(trickName(id)+'!'); play('choose'); spawn('sparkle',64,54,0,-8,.8); }); }); if(e>5400) once(a,'j',()=>{ setCaption('Ta-da! The big routine!'); play('fanfare',.6); burst(12); }); }};

/* ---- Tricks: pick any trick the pet knows, and watch it right there ----
   With more than 6 tricks the list is split into short groups, so a switch user never scans a long list;
   the Trick Show is always first. Choosing a trick goes to the room, the pet does it, and then the same
   list comes back so another trick is one choice away. */
const TRICK_GROUPS=[
  {id:'paw',label:'Paw Tricks',tricks:['paw','wave','fistbump','gentle','beg','bell']},
  {id:'move',label:'Moving Tricks',tricks:['spin','rollover','dance','steps','hoop','jump','weave','paddle']},
  {id:'listen',label:'Listening Tricks',tricks:['sit','stay','come','speak','bow','playdead']},
  {id:'show',label:'Show-Off Tricks',tricks:['nose','catch','find','combo']}];
const TRICKS_FLAT=6;
const trickGroupOf=id=>(TRICK_GROUPS.find(g=>g.tricks.includes(id))||TRICK_GROUPS[TRICK_GROUPS.length-1]).id;
function openTricks(group,focusId,quiet){ unpauseClock(); if(!quiet) play('choose'); const n=state.name, known=learnedTricks(), left=tricksFor().filter(t=>!known.includes(t.id)).length;
  const grouped=known.length>TRICKS_FLAT, G=grouped&&group?TRICK_GROUPS.find(g=>g.id===group):null;
  $('#tricks-title').textContent=G?`${n}'s ${G.label}`:`${n}'s Tricks`;
  $('#tricks-note').textContent=G?'':known.length?`${n} knows ${known.length} trick${known.length===1?'':'s'}.`+(left?` ${left} more to learn as ${n} grows.`:' Every trick learned!'):`${n} hasn't learned a trick yet. Tricks come with care stars as ${n} grows.`;
  const items=[];
  if(G) known.filter(id=>trickGroupOf(id)===G.id).forEach(id=>items.push({label:trickName(id),data:id,fn:()=>performTrick(id,G.id)}));
  else { if(known.length>=2) items.push({label:'Trick Show',sub:`${n} shows off a few tricks`,fn:()=>{ show('game'); startTrip('trickshow'); }});
    if(grouped) TRICK_GROUPS.forEach(g=>{ const c=known.filter(id=>trickGroupOf(id)===g.id).length; if(c) items.push({label:g.label,sub:`${c} trick${c===1?'':'s'}`,fn:()=>openTricks(g.id)}); });
    else known.forEach(id=>items.push({label:trickName(id),data:id,fn:()=>performTrick(id,null)})); }
  const back=G?{label:'Back',fn:()=>{ play('blip'); openTricks(null,null,true); }}:{label:'Back',fn:()=>{ play('blip'); backToMore(); }};
  renderList('tricks-list',items,{cols:1,tail:[back]});
  const focus=focusId?Math.max(0,items.findIndex(it=>it.data===focusId)):undefined;
  show('tricks',G?G.label:`${n}'s tricks. `+$('#tricks-note').textContent,focus!=null?{focus}:undefined); }
/* Do one trick in the room. A little moment that happens to be playing (a yawn, a stretch) makes way for
   it; anything bigger (a trip, a surprise) has to finish first. */
function performTrick(id,group){ const d=V['trick:'+id]; if(!d) return;
  if(anim&&!anim.idle){ nope(); return; }
  const n=state.name; unpauseClock(); anim=null; sayQ.length=0; play('choose'); show('game');
  setCaption(d.cue?d.cue(n):`${n}, ${trickName(id).toLowerCase()}!`,false);
  startAnim('trick:'+id,d.dur,()=>{ state.stats.love=clamp(state.stats.love+4,FLOOR,100); state.stats.fun=clamp(state.stats.fun+4,FLOOR,100); updateMeters(); save(); setCaption(`Good job, ${n}!`);
    /* then the same list comes back, once the praise has been read */
    const again=()=>{ if(layer!=='game'||anim||!state) return; if(linesWaiting()){ later(again,300); return; } openTricks(group,id,true); };
    later(again,900); });
  if(d.start) d.start(anim); }

/* ---- The Trick Show: every trick on a little stage, then a bow and applause ---- */
function drawShowStage(){ blitView(ctx,cachedLayer('showstage',(g,ph,B)=>{ rect(g,B.x0,B.y0,Bw(B),B.y1-B.y0,'#2A1E30');
  for(let x=al(B.x0,6);x<B.x1;x+=6){ vgrad(g,x,B.y0,5,70-B.y0,[[0,'#A83A4A'],[1,'#7A2232']]); rect(g,x+5,B.y0,1,70-B.y0,'#5A1A26'); }
  rect(g,20,B.y0,88,70-B.y0,'#3A2A48'); for(let i=0;i<30;i++){ const x=22+hash2(i,1,3)*84, y=4+hash2(i,2,3)*60; rect(g,x,y,.5,.5,'#FFE9A8'); }
  rect(g,B.x0,B.y0,Bw(B),6-B.y0,'#C9A04A'); rect(g,B.x0,5.5,Bw(B),.5,'#8A6A2A'); rect(g,B.x0,70,Bw(B),B.y1-70,'#8A5A3A'); for(let x=al(B.x0,10);x<B.x1;x+=10) rect(g,x,70,.5,B.y1-70,'#6A4A2A');
  g.fillStyle='rgba(255,240,190,0.18)'; g.beginPath(); g.moveTo(56,6); g.lineTo(72,6); g.lineTo(100,90); g.lineTo(28,90); g.fill(); glow(g,64,84,32,'#FFF0C0',.3); })); }
BG.stage=()=>drawShowStage();
/* The show picks up to 3 tricks the pet knows, at random, so it is different every time and short
   enough to enjoy (the whole show stays within 20 seconds). */
const SHOW_MAX=20000;
function showTricks(){ const budget=SHOW_MAX-V['show:intro'].dur-V['show:finale'].dur, out=[]; let used=0;
  pickSome(learnedTricks(),99).forEach(id=>{ const d=V['trick:'+id].dur; if(out.length<3&&(used+d<=budget||!out.length)){ out.push(id); used+=d; } }); return out; }
PLACES.trickshow={label:'Trick Show',hidden:true,travel:'none',music:'friend',bg:'stage',
  story:t=>{ t.show=showTricks(); return ['show:intro'].concat(t.show.map(id=>({v:'show:trick',extra:{trick:id},dur:V['trick:'+id].dur})),['show:finale']); },
  doneMsg:n=>`What a show! ${n} did ${(lastShow||[]).length} tricks for the crowd.`};
let lastShow=null;
V['show:intro']=tripScene('stage',{dur:2600,
  start(a){ lastShow=a.trip.show; setCaption(`Welcome to the ${state.name} Show!`); play('cheer',.4); },
  pose(p,e){ p.eyes='happy'; p.mouth='tongue'; if(e>900&&e<1800) p.dy=-Math.round(Math.abs(Math.sin(e/150))*3); },
  front(e){ const k=ph(e,0,1200); if(k<1){ const w=VIEW.w/2*(1-k); for(let x=0;x<w;x+=6){ rect(ctx,VIEW.x+x,VIEW.y,5,VIEW.h,'#A83A4A'); rect(ctx,VIEW.x+VIEW.w-x-5,VIEW.y,5,VIEW.h,'#A83A4A'); } } }});
V['show:trick']={bgName:'stage',scene(){ drawShowStage(); },
  init(a){ a.inner=V['trick:'+a.trick]; if(a.inner.init) a.inner.init(a); },
  start(a){ setCaption(`${trickName(a.trick)}!`,false); },
  pose(p,e,a){ a.inner.pose.call(a.inner,p,e,a); }, behind(e,a,p){ if(a.inner.behind) a.inner.behind.call(a.inner,e,a,p); }, front(e,a,p){ if(a.inner.front) a.inner.front.call(a.inner,e,a,p); },
  tick(a,e,now){ if(a.inner.tick) a.inner.tick.call(a.inner,a,e,now); }};
V['show:finale']=tripScene('stage',{dur:4000,
  start(){ setCaption(`Take a bow, ${state.name}! The crowd loves you!`); play('cheer',.6); later(()=>play('fanfare',.5),500); },
  pose(p,e){ p.eyes='happy'; p.mouth='tongue'; if(e<1400){ p.body='stand'; p.face=1; p.frame=0; p.headDy=4; } else p.dy=-Math.round(Math.abs(Math.sin(e/160))*3); },
  front(e,a,p){ if(e>1400) drawRibbon(neckAt(p).x,neckAt(p).y+2); },
  tick(a,e,now){ if(now>=a.next){ spawn('confetti',rand(VIEW.x,VIEW.x+VIEW.w),VIEW.y-2,rand(-6,6),rand(14,24),4,pick(['#F07A8E','#F4C542','#7FB08C','#7FA8D8','#B89AD8'])); a.next=now+70; }
    if(e>1400) once(a,'p',()=>{ addPhoto('place',`${state.name} starred in a trick show!`,{place:'trickshow'}); burst(10); }); }});

/* ---- Growing up: a celebration card with the new look and what's new ---- */
let celRaf=0;
function openCelebrate(from,to){ const n=state.name, k=kind(), label=STAGE_LABEL[k][to], word=STAGE_WORD[k][to];
  const np=placesAtStage(to), nt=tricksFor().filter(t=>t.stage===to).map(t=>t.name), at=nextGrowAt();
  $('#cel-title').textContent=`${n} is a ${label.toLowerCase()} now!`;
  const li=[]; if(np.length) li.push(`<p><b>New places to go:</b> ${np.map(esc).join(', ')}</p>`); if(nt.length) li.push(`<p><b>New tricks to learn:</b> ${nt.map(esc).join(', ')}</p>`);
  li.push(`<p>${at!=null?`Next: ${esc(STAGE_LABEL[k][to+1])} at ${at} paw prints.`:`${esc(n)} is all grown up. Wise, gentle, and still so loved.`}</p>`);
  $('#cel-body').innerHTML=li.join('');
  renderList('cel-list',[{label:'Yay!',fn:()=>{ cancelAnimationFrame(celRaf); play('choose'); show('game',`${n} the ${word}`); quietUntil=Date.now()+6000; }}],{cols:1,maxw:360});
  play('fanfare',.6); show('celebrate',`${n} is a ${label} now! `+$('#cel-body').textContent);
  const c=prepCanvas($('#cel-canvas')), g=c.getContext('2d'), t0=performance.now(), bits=Array.from({length:26},(_,i)=>({x:hash2(i,1,4)*120,s:6+hash2(i,2,4)*10,c:['#F07A8E','#F4C542','#7FB08C','#7FA8D8','#B89AD8'][i%5],o:hash2(i,3,4)*60}));
  const frame=now=>{ if(layer!=='celebrate') return; const tt=(now-t0)/1000; g.setTransform(RES,0,0,RES,0,0); g.clearRect(0,0,c.lw,c.lh);
    softShadow(g,32,58,11,2,.25); drawPet(g,state.style,STAGES[from],{eyes:'happy',mouth:'smile'},null,32-22,60-44);
    rect(g,54,34,10,3,'#E8B84A'); g.fillStyle='#E8B84A'; g.beginPath(); g.moveTo(63,30); g.lineTo(69,35.5); g.lineTo(63,41); g.fill();
    softShadow(g,90,58,13,2.2,.3); const b=reduceMotion?0:Math.abs(Math.sin(tt*5))*3; drawPet(g,state.style,STAGES[to],{eyes:'happy',mouth:'tongue'},state.outfit,90-22,60-44-b);
    if(!reduceMotion) bits.forEach(q=>{ const y=((q.o+tt*q.s*4)%70)-6; rect(g,q.x,y,1.2,2,q.c); }); celRaf=requestAnimationFrame(frame); };
  celRaf=requestAnimationFrame(frame); }
