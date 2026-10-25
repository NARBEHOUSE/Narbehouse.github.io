'use strict';
/* ================= Tricks, the Trick Show, and growing up =================
   The first tricks (sit, spin, high five, dance, speak) come with care stars as before. More tricks
   open as the pet grows: each needs a life stage and some care stars, and is taught the moment both
   are reached. Tricks (in More to Do) lists every trick the pet knows so the player can ask for any of
   them, any time, and the Trick Show performs them all on a little stage. Each time the pet grows up,
   a celebration card shows the new look and what's new. */
const NEW_TRICKS=[
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
const cheer=(a,e,at)=>{ if(e>at) once(a,'c',()=>{ play('happy',.6); burst(6); later(()=>play(happyNoise(),.45),300); }); };
function drawTrickHoop(front){ ctx.save(); ctx.beginPath(); ctx.rect(front?78:0,20,front?50:78,70); ctx.clip();
  pxRing(ctx,78,59,8,25,2,INK); pxRing(ctx,78,59,7.3,24.3,1.3,'#E9768B'); ctx.restore();
  if(!front){ rect(ctx,77,84,2,3,'#9AA4AE'); pxEll(ctx,78,87,6,1.2,'#687888'); } }
V['trick:bow']={dur:3000,
  pose(p,e){ p.dy=0; p.body='stand'; p.face=1; p.frame=0; p.bow=poseStep(motionHold(e,350,900,1900,2550)); p.eyes='happy'; p.mouth='tongue'; p.wag=160; if(e>2700) p.body=null; },
  tick(a,e){ if(e>500) once(a,'s',()=>{ setCaption('Take a bow!'); play('twinkle',.5); }); cheer(a,e,2200); }};
V['trick:wave']={dur:3000,
  pose(p,e){ p.dy=0; p.eyes=e>600?'happy':'open'; p.mouth=e>600?'tongue':'smile'; reachPaw(p,1,motionHold(e,300,800,2200,2700),'high',Math.sin((e-800)/160)*1.6); },
  tick(a,e){ if(e>500) once(a,'s',()=>{ setCaption('Wave hello!'); play('choose'); }); cheer(a,e,2300); }};
V['trick:beg']={dur:3000,
  pose(p,e){ const k=motionHold(e,300,850,2200,2700); p.dy=0; p.headDy=-Math.round(k); p.eyes=k>.5?'puppy':'happy'; p.wag=180; reachPaw(p,-1,k,'tuck'); reachPaw(p,1,k,'tuck'); },
  tick(a,e){ if(e>500) once(a,'s',()=>{ setCaption('Sit pretty!'); play('twinkle',.5); }); cheer(a,e,2300); }};
V['trick:playdead']={dur:3600,
  pose(p,e){ p.dy=0; p.face=1; p.frame=0; p.wag=0;
    if(e<700){ p.body='stand'; p.crouch=poseStep(ease(ph(e,400,700))); p.eyes='open'; }
    else if(e<2600){ p.body='curl'; p.roll=motionHold(e,700,1100,2300,2600)*2.35; p.eyes='closed'; p.mouth='tongue'; }
    else if(e<3150){ leapPose(p,e,2750,3050,5); p.eyes='happy'; p.mouth='open'; }
    else { p.eyes='happy'; p.mouth='tongue'; } },
  tick(a,e){ if(e>450) once(a,'b',()=>{ setCaption('Bang! Play dead...'); play('pop',.5); }); if(e>600) once(a,'t',()=>play('thump',.35)); if(e>2600) once(a,'u',()=>{ setCaption('Surprise! Just kidding!'); play('bounce',.5); }); cheer(a,e,3000); }};
V['trick:hoop']={dur:4200,
  pose(p,e){ p.dy=0; p.eyes='happy'; p.mouth='open';
    if(e<650){ p.dx=lerp(0,-32,ease(e/650)); p.body='walk'; p.face=-1; p.frame=Math.floor(e/140)%4; }
    else if(e<2600){ p.dx=lerp(-32,38,ph(e,650,2600)); p.face=1; p.body='run'; p.frame=Math.floor(e/100)%4; if(e>1150&&e<2450) leapPose(p,e,1400,2150,19); }
    else if(e<3750){ p.dx=lerp(38,0,ease(ph(e,2600,3750))); p.body='walk'; p.face=-1; p.frame=Math.floor(e/140)%4; } else p.mouth='tongue'; },
  behind(e,a,p){ drawTrickHoop(false); },
  front(e,a,p){ drawTrickHoop(true); },
  tick(a,e){ if(e>600) once(a,'s',()=>setCaption('Jump through the hoop!')); if(e>1300) once(a,'w',()=>{ play('whoosh',.5); spawn('sparkle',78,50,0,-8,.8); }); cheer(a,e,2300); }};
V['trick:fistbump']={dur:2800,
  pose(p,e){ p.dy=0; p.eyes=e>900?'happy':'open'; p.mouth=e>900?'tongue':'smile'; reachPaw(p,1,motionHold(e,300,850,1800,2350),'offer'); },
  front(e,a,p){ trickHand(p,e,'bump',550,2050); },
  tick(a,e){ if(e>900) once(a,'f',()=>{ play('pop',.6); burst(5); setCaption('Fist bump!'); }); cheer(a,e,2200); }};
V['trick:bell']={dur:3800,
  pose(p,e){ p.dy=0; p.eyes=e>700?'happy':'open'; const k=motionHold(e,350,700,1350,1750); reachPaw(p,1,k,'offer');
    if(p.paws){ const q=p.paws[1], down=Math.max(0,1-Math.abs(e-800)/120,1-Math.abs(e-1100)/120); q.y+=down*.8*k;
      const S=STYLES[state.style], P=breedP(PARAMS[S.kind][stageName()],S,state.style+':'+stageName()), j=forelegJoints(P,S,1,q); q.x=j.x; q.y=j.y; }
    if(e>1900&&e<3200){ p.body='lie'; p.face=-1; p.frame=0; p.headDy=2; p.mouth=Math.floor(e/180)%2?'open':'smile'; } },
  front(e,a,p){ const q={dx:0,dy:0}; reachPaw(q,1,1,'offer'); const at=pawPoint(q), x=at.x, button=at.y+1.6, dome=button+1.4, h=(85-dome)/2, down=Math.max(0,1-Math.abs(e-800)/120,1-Math.abs(e-1100)/120);
    pxEll(ctx,x,86,6,1.6,INK); pxEll(ctx,x,85.4,5.2,1.1,'#C9A04A'); pxEll(ctx,x,dome+h,4.2,h+.5,INK); pxEll(ctx,x,dome+h,3.5,h,'#F4C542'); rect(ctx,x-.6,button+down*.8,1.2,1.8-down*.8,'#C9A04A');
    if(e>1400) blit(ctx,BOWLS[e<2500?0:1],36,83); },
  tick(a,e){ if(e>600) once(a,'s',()=>setCaption('Ring the dinner bell!')); [800,1100].forEach((t,i)=>{ if(e>t) once(a,'d'+i,()=>{ play('ding',.55); spawn('note',92,74,2,-10,1); }); }); if(e>1400) once(a,'f',()=>setCaption('Ding ding! Dinner is served.')); cheer(a,e,3000); }};
V['trick:nose']={dur:3800,
  pose(p,e){ p.dy=0; p.body='stand'; p.face=1; p.frame=0; if(e<2200){ p.eyes='open'; p.headDy=-1; } else if(e<2700){ p.headDy=-2; p.mouth='open'; p.eyes='happy'; } else if(e<3200){ const b=Math.floor(e/170)%2; p.headDy=b; p.mouth=b?'open':'smile'; p.eyes='closed'; } else { p.eyes='happy'; p.mouth='tongue'; } },
  front(e,a,p){ const m=mouthAt(p), s=SPR.cookie; if(e<2200) blitSized(ctx,s,m.x-2.5,m.y-5,5,3); else if(e<2600){ const k=ph(e,2200,2600); blitSized(ctx,s,m.x-2.5,m.y-5+arc(k,12)+k*4,5,3); } },
  tick(a,e){ if(e>300) once(a,'s',()=>setCaption('Steady... steady...')); if(e>2200) once(a,'t',()=>{ play('whoosh',.4); setCaption('Toss and catch!'); }); if(e>2600) once(a,'c2',()=>{ play('crunch',.6); crumbs(64,70); }); cheer(a,e,3200); }};
/* The big routine: sit, spin, a bow (or a wave), and a happy jump, all in a row. */
V['trick:combo']={dur:6400,
  parts(){ return kind()==='dog'?['sit','spin','bow']:['sit','spin','wave']; },
  pose(p,e,a){ const P=this.parts(), seg=Math.floor(e/1800); if(seg<3){ const d=V['trick:'+P[seg]]; d.pose.call(d,p,(e%1800)/1800*d.dur,a); } else { p.eyes='happy'; p.mouth='tongue'; leapPose(p,e,5600,6050,10); if(e>6300) p.body=null; } },
  front(e,a,p){ const P=this.parts(), seg=Math.floor(e/1800); if(seg<3){ const d=V['trick:'+P[seg]]; if(d.front) d.front.call(d,(e%1800)/1800*d.dur,a,p); } },
  tick(a,e){ const P=this.parts(); P.forEach((id,i)=>{ if(e>i*1800+50) once(a,'n'+i,()=>{ setCaption(trickName(id)+'!'); play('choose'); spawn('sparkle',64,54,0,-8,.8); }); }); if(e>5400) once(a,'j',()=>{ setCaption('Ta-da! The big routine!'); play('fanfare',.6); burst(12); }); }};

/* ---- Tricks: pick any trick the pet knows, and watch it right there ----
   With more than 6 tricks the list is split into short groups, so a switch user never scans a long list;
   the Trick Show is always first. Choosing a trick goes to the room, the pet does it, and then the same
   list comes back so another trick is one choice away. */
const TRICK_GROUPS=[
  {id:'paw',label:'Paw Tricks',tricks:['paw','wave','fistbump','gentle','beg','bell']},
  {id:'move',label:'Moving Tricks',tricks:['spin','dance','steps','hoop','jump','weave','paddle']},
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
  setCaption(d.cue?d.cue(n):`${n}, ${trickName(id).toLowerCase()}!`);
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
  start(a){ setCaption(`${trickName(a.trick)}!`); },
  pose(p,e,a){ a.inner.pose.call(a.inner,p,e,a); }, behind(e,a,p){ if(a.inner.behind) a.inner.behind.call(a.inner,e,a,p); }, front(e,a,p){ if(a.inner.front) a.inner.front.call(a.inner,e,a,p); },
  tick(a,e,now){ if(a.inner.tick) a.inner.tick.call(a.inner,a,e,now); }};
V['show:finale']=tripScene('stage',{dur:4000,
  start(){ setCaption(`Take a bow, ${state.name}! The crowd loves you!`); play('cheer',.6); later(()=>play('fanfare',.5),500); },
  pose(p,e){ p.dy=0; p.eyes='happy'; p.mouth='tongue'; if(e<1800){ p.body='stand'; p.face=1; p.frame=0; p.bow=poseStep(motionHold(e,0,500,1100,1750)); } },
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
