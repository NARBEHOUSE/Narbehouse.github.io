'use strict';
/* ================= Dog School and Camping =================
   Dog School (on the door, for dogs): pick a class, then each visit is the next lesson. Every class has
   three lessons that are different scenes, and after the third comes graduation day with a cap, a
   certificate and applause. Some classes teach a trick the dog can do any time from Tricks.
   Camping (on the door, for dogs and cats, from the teen years on, when it isn't winter or raining):
   pitch the tent, one campfire moment, one night moment, and a sleepy night in the tent. */

/* ---- Classes ---- */
const CLASSES={
  basics:{label:'Puppy Basics',sub:'Sit, stay, and come',stage:0,lessons:['basics:sit','basics:stay','basics:come'],trick:'stay'},
  agility:{label:'Agility',sub:'Jumps, tunnels, and weave poles',stage:1,lessons:['agility:jumps','agility:tunnel','agility:weave'],trick:'jump'},
  frisbee:{label:'Frisbee',sub:'Catch the flying disc',stage:1,lessons:['frisbee:roll','frisbee:low','frisbee:leap'],trick:'catch'},
  dance:{label:'Dance',sub:'Learn a little routine',stage:1,lessons:['dance:step','dance:spin','dance:routine'],trick:'steps'},
  swim:{label:'Swimming',sub:'Paddle in the pool',stage:1,lessons:['swim:vest','swim:paddle','swim:fetch'],trick:'paddle'},
  nose:{label:'Nose Work',sub:'Sniff out the hidden treat',stage:2,lessons:[{v:'nose:find',extra:{hide:'boxes'}},{v:'nose:find',extra:{hide:'cups'}},{v:'nose:find',extra:{hide:'pillows'}}],trick:'find'},
  therapy:{label:'Therapy Dog',sub:'Visit the library and a care home',stage:2,needs:'basics',lessons:['therapy:calm','therapy:library','therapy:carehome'],trick:'gentle'}};
/* Every class teaches its own new trick, one the dog can't learn anywhere else, and a lesson that
   teaches a command (sit, stay, come, the jumps, the weave poles...) adds it to Tricks (More to Do) the
   day it is learned, to ask for any time; it can turn up in the Trick Show too. */
NEW_TRICKS.push({id:'come',name:'Come',kinds:['dog'],school:'basics'},{id:'weave',name:'Weave the poles',kinds:['dog'],school:'agility'},{id:'stay',name:'Stay',kinds:['dog'],school:'basics'},{id:'catch',name:'Catch the disc',kinds:['dog'],school:'frisbee'},{id:'find',name:'Find the treat',kinds:['dog'],school:'nose'},
  {id:'jump',name:'Jump the hurdle',kinds:['dog'],school:'agility'},{id:'steps',name:'Dance steps',kinds:['dog'],school:'dance'},{id:'paddle',name:'Doggy paddle',kinds:['dog'],school:'swim'},{id:'gentle',name:'Gentle paw',kinds:['dog'],school:'therapy'});
/* The trick each lesson teaches. A lesson's trick counts as learned once the lesson is done, and a class's
   trick once its diploma is earned (also for dogs that took the lessons before they became tricks). */
const LESSON_TRICK={'basics:sit':'sit','basics:stay':'stay','basics:come':'come','agility:jumps':'jump','agility:weave':'weave','frisbee:low':'catch','frisbee:leap':'catch',
  'dance:step':'steps','dance:spin':'spin','swim:paddle':'paddle','nose:find':'find'};
const lessonTrick=L=>LESSON_TRICK[typeof L==='string'?L:L&&L.v]||null;
function schoolTricks(){ const out=[]; schoolDone().forEach(id=>{ CLASSES[id].lessons.forEach(L=>out.push(lessonTrick(L))); out.push(CLASSES[id].trick); });
  const s=state&&state.school; if(s&&CLASSES[s.cur]) CLASSES[s.cur].lessons.slice(0,clamp(s.lesson|0,0,3)).forEach(L=>out.push(lessonTrick(L)));
  return out.filter(Boolean); }
/* Tricks learned since 'before', with the More to Do badge turned on when there are any. */
function newTricksSince(before){ const got=learnedTricks().filter(t=>!before.includes(t)); if(got.length){ state.moreNew=true; if(typeof updateMoreBadge==='function') updateMoreBadge(); } return got; }
const learnedSay=got=>got.length?` ${nmS()} learned ${got.length>1?'new tricks':'a new trick'}: ${got.map(trickName).join(' and ')}! Ask for ${got.length>1?'them':'it'} any time in Tricks, in More to Do.`:'';
const schoolDone=()=>state&&state.school&&Array.isArray(state.school.done)?state.school.done.filter(id=>CLASSES[id]):[];
function schoolState(){ state.school=state.school&&typeof state.school==='object'?state.school:{cur:null,lesson:0,done:[]}; if(!Array.isArray(state.school.done)) state.school.done=[]; return state.school; }
const classOpen=id=>{ const C=CLASSES[id], s=schoolState(); return !s.done.includes(id)&&stageIdx()>=C.stage&&(!C.needs||s.done.includes(C.needs)); };
function schoolSub(){ const s=schoolState(); if(s.cur) return `${CLASSES[s.cur].label}: lesson ${s.lesson+1} of 3`; return Object.keys(CLASSES).some(classOpen)?'Pick a class to take':'Practice day'; }
function schoolStory(t){ const s=schoolState(), n=state.name, open=Object.keys(CLASSES).filter(classOpen), beats=['school:arrive'];
  if(!s.cur&&open.length) beats.push({bg:'class',choice:{q:`Which class should ${n} take?`,opts:pickSome(open,4).map(id=>({label:CLASSES[id].label,say:`${CLASSES[id].label}. ${CLASSES[id].sub}`,preview:{art:'class_'+id},fn:()=>{ s.cur=id; s.lesson=0; save(); }}))}});
  beats.push({dyn:()=>{ if(!s.cur){ t.practice=true; const id=pick(s.done.length?s.done:['basics']), L=CLASSES[id].lessons; return [L[Math.floor(Math.random()*3)],'school:practice']; }
    const L=CLASSES[s.cur].lessons[s.lesson]; return [L,s.lesson>=2?'school:grad':'school:lesson']; }});
  return beats; }
let schoolDoneMsg=null;
PLACES.school={label:'Dog School',sub:schoolSub,kinds:['dog'],stage:0,travel:'car',music:'school',bg:'class',story:t=>{ schoolDoneMsg=null; return schoolStory(t); },
  doneMsg:n=>schoolDoneMsg||`Home from Dog School. ${n} can't wait for the next lesson!`};
HATS.gradcap=(b,G)=>{ const {cx,top,k}=G; part(b,T=>{ E(T,cx,top+1.2,6.4*k,2.6*k,'#2F2B35',SH,null,top+1.6); Tr(T,cx-8.4*k,top-1.4,cx+8.4*k,top-1.4,cx,top-4.6*k,'#2F2B35'); Tr(T,cx-8.4*k,top-1.4,cx+8.4*k,top-1.4,cx,top+1.8*k,'#3A3440'); });
  Ln(b,cx,top-1.4,cx+6*k,top+1,'#F4C542',1); E(b,cx+6*k,top+2.2,.9,1.4,'#F4C542'); };
OUTFITS.hat.push(['gradcap','Graduation cap',999]);

/* ---- Backgrounds ---- */
function drawClassroom(){ blitView(ctx,cachedLayer('class',(g,ph,B)=>{ rect(g,B.x0,B.y0,Bw(B),60-B.y0,'#E6F2EA'); for(let i=0,m=Math.round(Bw(B)/12);i<m;i++){ const x=B.x0+hash2(i,1,2)*Bw(B), y=6+hash2(i,2,2)*44; pxEll(g,x,y+1,1.6,1.2,'#CFE6D6'); [[-1.6,-1],[-.5,-1.8],[.6,-1.8],[1.7,-1]].forEach(([dx,dy])=>pxEll(g,x+dx,y+dy,.5,.6,'#CFE6D6')); }
  rect(g,B.x0,60,Bw(B),B.y1-60,'#9FC4E8'); for(let x=al(B.x0,16);x<B.x1;x+=16) for(let y=60;y<B.y1;y+=16) rect(g,x+((y/16)%2)*8,y,8,8,'#8AB4DC');
  rect(g,B.x0,58,Bw(B),3,'#FFFFFF'); rect(g,38,10,52,30,'#6A4428'); rect(g,40,12,48,26,'#2F4A3A'); pxEll(g,52,24,3,2.4,'#F4F2E8'); [[-3,-2.6],[-1,-4],[1,-4],[3,-2.6]].forEach(([dx,dy])=>pxEll(g,52+dx,24+dy,1,1.1,'#F4F2E8'));
  rect(g,62,22,16,2,'#F4F2E8'); pxEll(g,62,23,2,2,'#F4F2E8'); pxEll(g,78,23,2,2,'#F4F2E8'); rect(g,44,32,40,1,'#F4F2E8'); [[8,'#F07A8E'],[104,'#F4C542']].forEach(([x,c])=>{ rect(g,x,16,14,18,INK); rect(g,x+1,17,12,16,c); heartFill(g,x+7,23,3,'#FFFFFF'); }); glow(g,64,10,80,'#FFFFFF',.25); })); }
function drawStudio(){ blitView(ctx,cachedLayer('studio',(g,ph,B)=>{ rect(g,B.x0,B.y0,Bw(B),60-B.y0,'#E8DDF4'); for(let x=al(B.x0,24);x<B.x1;x+=24){ vgrad(g,x+2,8,20,44,[[0,'#DDEEF8'],[1,'#BFDCEE']]); rect(g,x+2,8,1,44,'#FFFFFF'); }
  rect(g,B.x0,40,Bw(B),1.4,'#A0643A'); for(let x=al(B.x0,24);x<B.x1;x+=24) rect(g,x+11,41,1,6,'#A0643A');
  planks(g,'#D8A870','#C8985E',{x0:B.x0,x1:B.x1,y0:60,y1:B.y1}); rect(g,B.x0,58,Bw(B),3,'#FFFFFF'); rect(g,63.5,B.y0,1,6-B.y0,'#9AA4AE'); pxEll(g,64,9,4.4,4.4,INK); pxEll(g,64,9,3.8,3.8,'#C8D0DC'); for(let i=0;i<5;i++) rect(g,61+i*1.4,6+(i%2)*2,1,1,'#FFFFFF'); })); }
function drawPool(){ blitView(ctx,cachedLayer('pool',(g,ph,B)=>{ tileWall(g,B.y0,58,'#E6F4F8','#CFE6EE',B,6); rect(g,B.x0,58,Bw(B),6,'#FFFFFF'); rect(g,B.x0,63.5,Bw(B),.6,'#9FC4E8');
  vgrad(g,B.x0,64,Bw(B),B.y1-64,[[0,'#6FC0E8'],[1,'#3E8AC0']]); for(let x=al(B.x0,20);x<B.x1;x+=20) rect(g,x,80,10,.6,'rgba(255,255,255,.5)'); rect(g,100,50,1.2,18,'#C8D0DC'); rect(g,106,50,1.2,18,'#C8D0DC'); for(let y=54;y<68;y+=4) rect(g,100,y,7,.8,'#C8D0DC');
  [[10,'#F07A8E'],[22,'#F4C542']].forEach(([x,c])=>{ pxEll(g,x,54,4,4,INK); pxEll(g,x,54,3.3,3.3,c); pxEll(g,x,54,1.6,1.6,'#FFFFFF'); }); })); }
function drawLibrary(){ blitView(ctx,cachedLayer('library',(g,ph,B)=>{ rect(g,B.x0,B.y0,Bw(B),60-B.y0,'#8A6040'); const sp=['#D9403E','#5A8FC4','#F4C542','#7FB08C','#B89AD8','#E8905A','#FFF7E6'];
  for(let y=4;y<56;y+=13){ rect(g,B.x0,y+11,Bw(B),2,'#6A4428'); for(let x=al(B.x0,3),i=0;x<B.x1;x+=3,i++){ const h=8+hash2(i,y,3)*3; rect(g,x,y+11-h,2.6,h,sp[(i+y)%7]); rect(g,x,y+11-h+1,2.6,.5,'rgba(255,255,255,.4)'); } }
  planks(g,'#B8804E','#A06C40',{x0:B.x0,x1:B.x1,y0:60,y1:B.y1}); pxEll(g,64,82,30,7,'#7FA8D8'); pxEll(g,64,82,26,5,'#9FC4E8'); pxEll(g,100,80,12,6,'#F07A8E'); pxEll(g,100,78,10,4,'#F4A0B6'); glow(g,64,20,70,'#FFE9B0',.2); })); }
function drawCareHome(){ blitView(ctx,cachedLayer('carehome',(g,ph,B)=>{ rect(g,B.x0,B.y0,Bw(B),60-B.y0,'#F6E6D0'); for(let x=al(B.x0,8);x<B.x1;x+=8) rect(g,x,B.y0,.6,60-B.y0,'#EFDABE');
  framedWindow(g,16,12,26,19,false,'#E88AAA');
  planks(g,'#C8985E','#B8884E',{x0:B.x0,x1:B.x1,y0:60,y1:B.y1}); rect(g,B.x0,58,Bw(B),3,'#FFFFFF');
  blit(g,armchairSprite('#8A5AB0'),88,37); rect(g,95.4,49.4,15.2,10.4,INK); rect(g,96,50,14,9.2,'#F4D27A'); for(let x=96;x<110;x+=3) rect(g,x,50,1.5,9.2,'#F2A7B5'); rect(g,96,50,14,.6,'#FFF0B0'); for(let x=96.4;x<110;x+=1.4) rect(g,x,59.2,.6,1.2,'#F4D27A');
  floorLamp(g,122,60,'#FFE9A8',true); pxEll(g,64,82,30.8,7.8,INK); pxEll(g,64,82,30,7,'#C9573E'); pxEll(g,64,82,26,5,'#E8905A'); })); }
Object.assign(BG,{class:()=>drawClassroom(),studio:()=>drawStudio(),pool:()=>drawPool(),library:()=>drawLibrary(),carehome:()=>drawCareHome()});
/* Classes cover class pictures in the choice preview. */
Object.assign(PREVIEW_ART,{
  class_basics:(x,y)=>{ blit(ctx,SPR.bone,x-6.5,y-4.5); pxEll(ctx,x,y+6,6,1,'#9FC4E8'); },
  class_agility:(x,y)=>{ rect(ctx,x-8,y-4,1.4,10,INK); rect(ctx,x+7,y-4,1.4,10,INK); for(let i=0;i<5;i++) rect(ctx,x-6.6+i*3,y-1,3,2,i%2?'#FFFFFF':'#D9403E'); },
  class_frisbee:(x,y)=>blit(ctx,SPR.frisbee,x-6.5,y-3),
  class_dance:(x,y)=>{ blit(ctx,SPR.note,x-5,y-4); blit(ctx,SPR.note,x+1,y-1); },
  class_swim:(x,y)=>{ pxEll(ctx,x,y,6,6,INK); pxEll(ctx,x,y,5.2,5.2,'#F4743A'); pxEll(ctx,x,y,2.4,2.4,'#FFFFFF'); for(let i=0;i<4;i++){ const a=i/4*TAU+.4; rect(ctx,x+Math.cos(a)*4-1,y+Math.sin(a)*4-1,2,2,'#FFFFFF'); } },
  class_nose:(x,y)=>{ rect(ctx,x-9,y-2,7,7,INK); rect(ctx,x-8.4,y-1.4,5.8,5.8,'#C99A62'); rect(ctx,x+2,y-2,7,7,INK); rect(ctx,x+2.6,y-1.4,5.8,5.8,'#C99A62'); blit(ctx,SPR.cookie,x-4.5,y-8); },
  class_therapy:(x,y)=>{ heartFill(ctx,x,y-2,4,'#F07A8E'); rect(ctx,x-1.8,y+3,3.6,3.6,'#FFFFFF'); rect(ctx,x-.6,y+3.4,1.2,2.8,'#E0567D'); rect(ctx,x-1.4,y+4.2,2.8,1.2,'#E0567D'); }});

/* ---- School scenes ---- */
const nmS=()=>state.name;
const trainerHand=(e,t0,t1,x,y,treat)=>{ if(e<t0||e>t1) return; const k=ph(e,t0,t0+400), out=ph(e,t1-400,t1), hy=lerp(-24,y,k)-(e>t1-400?out*50:0); blit(ctx,SPR.hand,x,hy); if(treat) blit(ctx,SPR.cookie,x-2,hy+16); };
V['school:arrive']=tripScene('class',{dur:3000,start(){ const s=schoolState(); setCaption(s.cur?`Welcome back to Dog School! Today is lesson ${s.lesson+1} of ${CLASSES[s.cur].label}.`:`Welcome to Dog School, ${nmS()}!`); play('dingdong',.4); },
  pose(p,e){ if(e<1400){ p.body='walk'; p.face=1; p.frame=Math.floor(e/140)%4; p.dx=Math.round(lerp(-40,0,e/1400)); } else { p.eyes='happy'; p.mouth='tongue'; p.wag=90; } },
  tick(a,e,now){ if(e<1400&&now>=a.next){ play('step',.2); a.next=now+280; } if(e>1600) once(a,'h',()=>play('pet:barkHappy',.4)); }});
V['school:lesson']=tripScene('class',{dur:3000,start(){ const s=schoolState(), before=learnedTricks(); s.lesson++; save(); const got=newTricksSince(before); schoolDoneMsg=`Home from Dog School. ${nmS()} can't wait for lesson ${s.lesson+1}!`; setCaption(`Lesson ${s.lesson} of 3 done! Great learning, ${nmS()}.`+learnedSay(got)); play('sparkle',.5); },
  pose(p,e){ p.eyes='happy'; p.mouth='tongue'; if(e>300&&e<1300) p.dy=-Math.round(Math.abs(Math.sin(e/150))*3); },
  front(e,a,p){ const k=ph(e,200,700), x=lerp(110,64+G().bodyRx*.4,k), y=lerp(20,chestAt(p)+1,k); pxEll(ctx,x,y,4,4,INK); pxEll(ctx,x,y,3.4,3.4,'#F4C542'); blit(ctx,SPR.star,x-2.5,y-2.6); },
  tick(a,e){ if(e>700) once(a,'b',()=>{ burst(6); play('happy',.5); }); }});
V['school:practice']=tripScene('class',{dur:2800,start(){ schoolDoneMsg=`Home from Dog School. What a star student!`; setCaption(`Practice makes perfect! ${nmS()} is a star student.`); play('sparkle',.5); },
  pose(p){ p.eyes='happy'; p.mouth='tongue'; }, tick(a,e){ if(e>400) once(a,'b',()=>burst(6)); }});
V['school:grad']=tripScene('class',{dur:6400,fit:{hat:'gradcap'},
  start(a){ const s=schoolState(), id=s.cur, C=CLASSES[id]; if(!C){ a.cls='Dog School'; setCaption(`Graduation day! ${nmS()} is a star student.`); play('fanfare',.6); return; } a.cls=C.label; const before=learnedTricks(); s.done=s.done.concat([id]); s.cur=null; s.lesson=0; wearGift('gradcap','hat');
    a.got=newTricksSince(before); save();
    schoolDoneMsg=`Home again with a diploma! See it in Progress, in More to Do.`; setCaption(`Graduation day! ${nmS()} graduated from ${C.label}!`); play('fanfare',.6); later(()=>play('cheer',.5),500); },
  pose(p,e){ p.eyes='happy'; p.mouth='tongue'; if(e>1200&&e<2400) p.dy=-Math.round(Math.abs(Math.sin(e/150))*3); },
  front(e,a,p){ const k=ph(e,1600,2200); if(k>0){ const w=lerp(2,30,k); rect(ctx,94-w/2,60,w,20,INK); rect(ctx,94-w/2+1,61,w-2,18,'#FFF7E6'); if(k>=1){ rect(ctx,84,64,20,1,'#C9A04A'); rect(ctx,86,68,16,.6,'#B8A88A'); rect(ctx,86,71,16,.6,'#B8A88A'); pxEll(ctx,100,76,2.4,2.4,'#D9403E'); } pxEll(ctx,94-w/2,70,1.8,10,'#E8D8B8'); pxEll(ctx,94+w/2,70,1.8,10,'#E8D8B8'); } },
  tick(a,e,now){ if(now>=a.next&&e<5000){ spawn('confetti',rand(VIEW.x,VIEW.x+VIEW.w),VIEW.y-2,rand(-6,6),rand(14,24),4,pick(['#F07A8E','#F4C542','#7FB08C','#7FA8D8','#B89AD8'])); a.next=now+80; }
    if(e>2400) once(a,'c',()=>{ setCaption(`A certificate for ${nmS()}, with honors!`+learnedSay(a.got||[])); burst(8); });
    if(e>3000) once(a,'p',()=>addPhoto('place',`${nmS()} graduated from ${a.cls}!`,{place:'school'})); }});
/* Puppy Basics: sit, stay, come. Each one becomes a trick. */
const sitPose=(p,e,t)=>{ if(e>t){ p.dy=2; p.headDy=-1; p.eyes='happy'; } else p.eyes='open'; };
V['basics:sit']=tripScene('class',{dur:3600,start(){ setCaption(`The teacher says: Sit!`); },
  pose(p,e){ sitPose(p,e,900); if(e>2400){ const b=Math.floor(e/170)%2; p.headDy=b; p.mouth=b?'open':'smile'; } },
  front(e,a,p){ trainerHand(e,300,2400,86,34,true); if(e>2100&&e<2500){ const k=ph(e,2100,2500), m=mouthAt(p); blit(ctx,SPR.cookie,lerp(84,m.x-4,k),lerp(50,m.y-3,k)); } },
  tick(a,e){ if(e>900) once(a,'s',()=>{ play('choose'); spawn('sparkle',64,PETY+10,0,-8,.8); setCaption(`${nmS()} sits! Good job.`); }); if(e>2500) once(a,'c',()=>{ play('crunch',.6); crumbs(64,72); }); }});
function stayDef(){ return {dur:4800,
  pose(p,e){ if(e<3000){ sitPose(p,e,300); p.eyes=Math.floor(e/900)%2?'open':'happy'; } else if(e<3800){ p.body='run'; p.face=1; p.frame=Math.floor(e/90)%4; p.dx=Math.round(lerp(0,24,ph(e,3000,3800))); } else { p.dx=24; p.eyes='happy'; p.mouth='tongue'; } },
  front(e){ const hx=e<800?lerp(140,84,e/800):e<2800?lerp(84,112,ph(e,1200,2800)):112; blit(ctx,SPR.hand,hx,30); },
  tick(a,e){ if(e>300) once(a,'s',()=>setCaption('Stay...')); if(e>1600) once(a,'s2',()=>setCaption('Stay... good...')); if(e>3000) once(a,'c',()=>{ setCaption('Come!'); play('choose'); }); if(e>3800) once(a,'y',()=>{ play('happy',.6); burst(6); }); }}; }
V['basics:stay']=tripScene('class',stayDef()); V['trick:stay']=stayDef();
V['basics:come']=tripScene('class',{dur:4400,start(){ setCaption(`${nmS()} is busy sniffing a toy across the room...`); },
  pose(p,e){ if(e<1800){ p.dx=-36; p.headDy=2; p.eyes='closed'; } else if(e<2800){ p.body='run'; p.face=1; p.frame=Math.floor(e/90)%4; p.dx=Math.round(lerp(-36,20,ph(e,1800,2800))); p.eyes='happy'; } else { p.dx=20; p.eyes='happy'; p.mouth='tongue'; } },
  front(e){ blit(ctx,SPR.ball,20,82); trainerHand(e,1400,4200,96,34,e>2800); },
  tick(a,e){ if(e>1600) once(a,'c',()=>{ setCaption(`"${nmS()}, come!"`); play('choose'); }); if(e>2800) once(a,'y',()=>{ setCaption(`${nmS()} came right away! What a good dog.`); play('happy',.6); burst(6); }); }});
/* Agility (the jumps and the weave poles become tricks) */
V['agility:jumps']=tripScene('dogpark',{dur:4400,noShadow:true,start(){ setCaption(`Agility class: over the jumps!`); },
  pose(p,e){ const k=ph(e,400,3600); p.dx=Math.round(lerp(-50,50,k)); const x=64+p.dx, near=[40,88].map(h=>Math.abs(x-h)).reduce((a,b)=>Math.min(a,b)); p.dy=near<12?-Math.round(Math.cos(near/12*Math.PI/2)*12):0; p.body='run'; p.face=1; p.frame=Math.floor(e/90)%4; p.eyes='happy'; p.mouth='tongue'; if(e>3600){ p.body=null; p.dx=50; p.dy=0; } },
  behind(){ [40,88].forEach(x=>{ rect(ctx,x-8,70,2,16,'#FFFFFF'); rect(ctx,x+6,70,2,16,'#FFFFFF'); for(let i=0;i<14;i+=4) rect(ctx,x-6+i,75,2,2,i%8?'#FFFFFF':'#D9403E'); }); },
  tick(a,e){ [1300,2700].forEach((t,i)=>{ if(e>t) once(a,'j'+i,()=>play('whoosh',.4)); }); if(e>3600) once(a,'d',()=>{ play('happy',.5); setCaption('Two perfect jumps!'); }); }});
V['agility:tunnel']=tripScene('dogpark',{dur:4600,noShadow:true,start(){ setCaption(`Agility class: zoom through the tunnel!`); },
  pose(p,e){ const k=ph(e,300,3400), inside=e>1100&&e<2600; p.dx=Math.round(lerp(-50,50,k)); p.body='run'; p.face=1; p.frame=Math.floor(e/90)%4; p.eyes=inside?'closed':'happy'; p.mouth='open'; if(e>3400){ p.body=null; p.dx=50; } },
  clipY:(e)=>e>1100&&e<2600?60:null,
  front(e,a,p){ for(let x=30;x<98;x++){ const bump=Math.abs(x-(64+p.dx))<7&&e>1100&&e<2600?2:0; rect(ctx,x,70-bump,1,16+bump,(Math.floor(x/4)%2)?'#F4C542':'#E0A030'); rect(ctx,x,70-bump,1,.8,'#8A6A1E'); } pxEll(ctx,30,78,3,8,'#6A4A10'); pxEll(ctx,98,78,3,8,'#6A4A10'); },
  tick(a,e,now){ if(e>1100&&e<2600&&now>=a.next){ play('rustle',.35); a.next=now+380; } if(e>2600) once(a,'o',()=>{ play('pop',.5); setCaption('Out the other side!'); }); }});
V['agility:weave']=tripScene('dogpark',{dur:4600,noShadow:true,start(){ setCaption(`Agility class: weave through the poles!`); },
  pose(p,e){ const k=ph(e,300,3800); p.dx=Math.round(lerp(-48,48,k)); p.dy=Math.round(Math.sin(k*Math.PI*6)*3); p.body='run'; p.face=1; p.frame=Math.floor(e/90)%4; p.eyes='happy'; p.mouth='tongue'; if(e>3800){ p.body=null; p.dy=0; } },
  front(e){ for(let i=0;i<6;i++){ const x=30+i*14; rect(ctx,x,62,1.6,24,i%2?'#5A8FC4':'#D9403E'); rect(ctx,x,62,1.6,.8,INK); } },
  tick(a,e,now){ if(e<3800&&now>=a.next){ play('step',.3); a.next=now+180; } if(e>3800) once(a,'d',()=>{ play('happy',.5); burst(6); setCaption('Weave poles done! So quick!'); }); }});
/* Frisbee; the catch also becomes a trick */
function discDef(kind){ return {dur:kind==='roll'?4000:3800,
  disc(e){ if(kind==='roll'){ const k=ph(e,300,2200); return e<2400?{x:lerp(140,70,k),y:86}:null; } const k=ph(e,400,1700); return e<1700?{x:lerp(140,74,k),y:lerp(40,kind==='leap'?40:58,k)+arc(k,kind==='leap'?4:8)}:null; },
  pose(p,e){ if(kind==='roll'){ if(e>900&&e<2300){ p.body='run'; p.face=1; p.frame=Math.floor(e/90)%4; p.dx=Math.round(lerp(0,6,ph(e,900,2300))); } else { p.dx=e>2300?6:0; p.eyes='happy'; } return; }
    if(e<1300){ p.eyes='open'; p.headDy=-1; } else if(e<1900){ const k=ph(e,1300,1900); p.dy=Math.round(arc(k,kind==='leap'?24:10)); p.dx=Math.round(lerp(0,8,k)); p.mouth='open'; p.eyes='happy'; } else { p.dx=Math.round(lerp(8,0,ph(e,1900,2600))); p.eyes='happy'; } },
  front(e,a,p){ const d=this.disc(e); if(d) blit(ctx,SPR.frisbee,d.x-6.5,d.y-3); else { const m=mouthAt(p); blit(ctx,SPR.frisbee,m.x-6.5,m.y-2); } },
  tick(a,e){ if(e>300) once(a,'t',()=>{ play('whoosh',.4); setCaption(kind==='roll'?`Frisbee class: chase the rolling disc!`:kind==='low'?`Frisbee class: catch it!`:`Frisbee class: the big leap!`); }); const t=kind==='roll'?2300:1700; if(e>t) once(a,'c',()=>{ play('pop',.6); burst(6); setCaption(kind==='leap'?'Wow! A mid-air catch!':'Got it! Great catch!'); later(()=>play('pet:barkHappy',.45),300); }); }}; }
V['frisbee:roll']=tripScene('park',discDef('roll')); V['frisbee:low']=tripScene('park',discDef('low')); V['frisbee:leap']=tripScene('park',discDef('leap')); V['trick:catch']=discDef('leap');
/* Dance */
const stepDef={dur:4000,pose(p,e){ const s=Math.floor(e/500)%2; p.dx=s?5:-5; p.eyes='happy'; p.mouth='open'; p.ear=s; },
  tick(a,e,now){ if(now>=(a.next||0)){ spawn('note',64+rand(-18,18),56,rand(-6,6),-14,1.4); play('beep'+(1+Math.floor(rand(0,4))),.3); a.next=now+500; } }};
V['dance:step']=tripScene('studio',Object.assign({},stepDef,{start(){ setCaption(`Dance class: step to the side, and step back!`); }}));
V['trick:steps']=Object.assign({},stepDef);
/* The school tricks at home */
/* Come: the dog wanders off to sniff something, hears its name, and runs right back. */
V['trick:come']={dur:3600,cue:n=>`${n} wanders off to sniff something... ${n}, come!`,
  pose(p,e){ if(e<900){ p.body='walk'; p.face=-1; p.frame=Math.floor(e/140)%4; p.dx=Math.round(lerp(0,-30,e/900)); }
    else if(e<1600){ p.dx=-30; p.headDy=2; p.eyes='closed'; }
    else if(e<2500){ p.body='run'; p.face=1; p.frame=Math.floor(e/90)%4; p.dx=Math.round(lerp(-30,0,ph(e,1600,2500))); p.eyes='happy'; p.mouth='open'; }
    else { p.eyes='happy'; p.mouth='tongue'; p.wag=90; } },
  tick(a,e,now){ if(e<900&&now>=(a.next||0)){ play('step',.2); a.next=now+280; } if(e>1000) once(a,'s',()=>play('sniff',.35)); if(e>1600) once(a,'c',()=>{ play('choose'); spawn('sparkle',34,PETY+6,0,-8,.8); }); cheer(a,e,2500); }};
/* Weave the poles: a little row of poles, and the dog weaves through them. */
V['trick:weave']={dur:4000,
  pose(p,e){ if(e<3400){ const k=ph(e,200,3200); p.body='run'; p.face=1; p.frame=Math.floor(e/90)%4; p.dx=Math.round(lerp(-36,36,k)); p.dy=Math.round(Math.sin(k*Math.PI*5)*2); p.eyes='happy'; p.mouth='tongue'; }
    else { p.dx=Math.round(lerp(36,0,ph(e,3400,3900))); p.eyes='happy'; p.mouth='tongue'; } },
  front(e){ if(e<3500) for(let i=0;i<5;i++){ const x=36+i*14; rect(ctx,x,66,1.6,20,i%2?'#5A8FC4':'#D9403E'); rect(ctx,x,66,1.6,.8,INK); } },
  tick(a,e,now){ if(e<3200&&now>=(a.next||0)){ play('step',.25); a.next=now+200; } cheer(a,e,3300); }};
V['trick:jump']={dur:3200,
  pose(p,e){ if(e<2500){ const k=ph(e,200,2400); p.body='run'; p.face=1; p.frame=Math.floor(e/90)%4; p.dx=Math.round(lerp(-28,28,k)); const d=Math.abs(p.dx); p.dy=d<12?-Math.round(Math.cos(d/12*Math.PI/2)*11):0; p.eyes='happy'; p.mouth='tongue'; } else { p.dx=Math.round(lerp(28,0,ph(e,2500,3100))); p.eyes='happy'; p.mouth='tongue'; } },
  behind(){ rect(ctx,55.5,72,2,15,'#FFFFFF'); rect(ctx,70.5,72,2,15,'#FFFFFF'); for(let i=0;i<14;i+=3.5) rect(ctx,57.5+i,76,3.5,2,(i/3.5)%2?'#FFFFFF':'#D9403E'); },
  tick(a,e){ if(e>1200) once(a,'j',()=>play('whoosh',.45)); if(e>2500) once(a,'h',()=>{ play('happy',.5); burst(6); }); }};
V['trick:paddle']={dur:3400,
  pose(p,e){ p.eyes='happy'; p.mouth='open'; p.dy=-Math.round(Math.abs(Math.sin(e/300))*2); },
  front(e,a,p){ const s=Math.floor(e/300)%2; pawAt(p,s?1:-1,.9); pawAt(p,s?-1:1,.35); },
  tick(a,e,now){ if(now>=(a.next||0)){ play('whoosh',.2); spawn('drop',64+rand(-10,10),chestAt(lastPetPose)-4,rand(-20,20),rand(-30,-14),.5); a.next=now+300; } }};
V['trick:gentle']={dur:3800,
  pose(p,e){ p.headDy=e>600?1:0; p.eyes=e>900?'closed':'happy'; p.mouth='smile'; p.wag=500; },
  front(e,a,p){ if(e>400&&e<3300) pawAt(p,1,Math.min(1,ph(e,400,1200))*.8); },
  tick(a,e,now){ if(e>900&&now>=(a.next||0)){ spawn('heart',64+rand(-10,14),48,rand(-3,3),-10,1.3); a.next=now+500; } if(e>1300) once(a,'s',()=>play('pet:sigh',.35)); }};
V['dance:spin']=tripScene('studio',Object.assign({},V['trick:spin'],{start(){ setCaption(`Dance class: a twirl!`); }}));
V['dance:routine']=tripScene('studio',Object.assign({},V['trick:combo'],{start(){ setCaption(`Dance class: the whole routine, with music!`); play('twinkle',.5); }}));
/* Swimming, with a little life vest */
const vest=(p)=>{ if(isSide(p)){ const nk=neckAt(p), f=p.face||1; rect(ctx,nk.x-10*f-(f<0?-2:0),nk.y+1,10,6,INK); rect(ctx,nk.x-9.5*f-(f<0?-2:0),nk.y+1.5,9,5,'#F4743A'); return; } const g=G(), y=PETY+p.dy+g.collar+1; rect(ctx,64+p.dx-g.bodyRx*.8,y,g.bodyRx*1.6,7,INK); rect(ctx,64+p.dx-g.bodyRx*.8+.6,y+.6,g.bodyRx*1.6-1.2,5.8,'#F4743A'); rect(ctx,64+p.dx-.5,y+.6,1,5.8,'#FFFFFF'); };
const waterLine=(e)=>{ ctx.fillStyle='rgba(111,192,232,.75)'; ctx.fillRect(VIEW.x,70,VIEW.w,VIEW.y+VIEW.h-70); for(let x=Math.floor(VIEW.x);x<VIEW.x+VIEW.w;x+=1) rect(ctx,x,70+Math.sin(x/5+e/300)*.7,1,.8,'#DDF4FF'); };
V['swim:vest']=tripScene('pool',{dur:4200,noShadow:true,start(){ setCaption(`Swimming class! First, a little life vest for ${nmS()}.`); play('pop',.4); },
  pose(p,e){ if(e<1800){ p.dy=-8; p.eyes='open'; } else { p.dy=Math.round(lerp(-8,6,ph(e,1800,2800))); p.eyes='happy'; p.mouth='tongue'; } },
  front(e,a,p){ vest(p); if(e>1800) waterLine(e); },
  tick(a,e){ if(e>2600) once(a,'s',()=>{ play('splat',.5); setCaption(`Paws in the water. Nice and gentle!`); for(let i=0;i<5;i++) spawn('drop',64+rand(-10,10),70,rand(-30,30),rand(-40,-20),.6); }); }});
V['swim:paddle']=tripScene('pool',{dur:4600,noShadow:true,start(){ setCaption(`Doggy paddle! ${nmS()} is swimming!`); },
  pose(p,e){ p.body='run'; p.face=1; p.frame=Math.floor(e/120)%4; p.dy=10; p.dx=Math.round(lerp(-40,40,ph(e,0,4200))); p.eyes='happy'; p.mouth='open'; },
  front(e,a,p){ vest(p); waterLine(e); },
  tick(a,e,now){ if(now>=a.next){ play('splat',.25); spawn('drop',64+p_dx(e),72,rand(-20,20),rand(-30,-10),.5); a.next=now+300; } }});
const p_dx=e=>lerp(-40,40,ph(e,0,4200));
V['swim:fetch']=tripScene('pool',{dur:5000,noShadow:true,start(){ setCaption(`Fetch the floating toy!`); },
  pose(p,e){ p.body='run'; p.frame=Math.floor(e/120)%4; p.dy=10; p.eyes='happy'; p.mouth='open'; if(e<2400){ p.face=1; p.dx=Math.round(lerp(-30,30,ph(e,0,2400))); } else { p.face=-1; p.dx=Math.round(lerp(30,-10,ph(e,2400,4600))); } },
  front(e,a,p){ vest(p); if(e<2400) blit(ctx,SPR.duck,90,66+Math.sin(e/300)); waterLine(e); if(e>=2400){ const m=mouthAt(p); blit(ctx,SPR.duck,m.x-6,m.y-3); } },
  tick(a,e){ if(e>2400) once(a,'g',()=>{ play('squeak',.6); setCaption(`Got it! ${nmS()} swims back with the duck.`); }); if(e>4600) once(a,'h',()=>{ play('happy',.5); burst(5); }); }});
/* Nose work: sniff each hiding spot and find the treat; it also becomes a trick */
function noseDef(){ return {dur:6000,
  init(a){ a.hide=a.hide||'cups'; a.win=Math.floor(Math.random()*3); },
  spots:[36,64,92],
  pose(p,e,a){ const seg=Math.min(a.win,Math.floor(e/1400)), local=e-seg*1400, tx=this.spots[seg]-64+8, from=seg?this.spots[seg-1]-64+8:0;
    if(e>a.win*1400+1400){ p.dx=this.spots[a.win]-64+8; p.eyes='happy'; p.mouth='tongue'; if(e<a.win*1400+2200){ const b=Math.floor(e/170)%2; p.headDy=b; p.mouth=b?'open':'smile'; } return; }
    if(local<600){ p.body='walk'; p.face=tx>=from?1:-1; p.frame=Math.floor(e/140)%4; p.dx=Math.round(lerp(from,tx,local/600)); } else { p.dx=tx; p.headDy=2; p.eyes='closed'; } },
  front(e,a){ const found=e>a.win*1400+1200; this.spots.forEach((x,i)=>{ const lift=found&&i===a.win?-6:0;
      if(a.hide==='boxes'){ rect(ctx,x-5,78+lift,10,8,INK); rect(ctx,x-4.4,78.6+lift,8.8,6.8,'#C99A62'); rect(ctx,x-4.4,78.6+lift,8.8,1.4,'#E3BC84'); }
      else if(a.hide==='cups'){ ctx.fillStyle=INK; ctx.beginPath(); ctx.moveTo(x-5.6,86+lift); ctx.lineTo(x+5.6,86+lift); ctx.lineTo(x+3.6,77+lift); ctx.lineTo(x-3.6,77+lift); ctx.fill(); ctx.fillStyle=['#F07A8E','#7FA8D8','#F4C542'][i]; ctx.beginPath(); ctx.moveTo(x-4.8,85.4+lift); ctx.lineTo(x+4.8,85.4+lift); ctx.lineTo(x+3,77.6+lift); ctx.lineTo(x-3,77.6+lift); ctx.fill(); }
      else { pxEll(ctx,x,83+lift,6.4,4,INK); pxEll(ctx,x,83+lift,5.6,3.3,['#F2A7B5','#9FC4E8','#B8E0A0'][i]); }
      if(found&&i===a.win&&e<a.win*1400+2000) blit(ctx,SPR.cookie,x-4.5,81); }); },
  tick(a,e){ for(let i=0;i<=a.win;i++){ if(e>i*1400+700) once(a,'s'+i,()=>play('sniff',.4)); } if(e>a.win*1400+1200) once(a,'f',()=>{ play('sparkle',.6); burst(6); setCaption(`Found it! ${nmS()}'s nose knows!`); }); if(e>a.win*1400+1500) once(a,'c',()=>play('crunch',.6)); }}; }
V['nose:find']=tripScene('class',Object.assign(noseDef(),{start(a){ setCaption(`Nose work: which one hides the treat? Sniff, sniff...`); }}));
V['trick:find']=Object.assign(noseDef(),{start(){ setCaption(`Find the treat!`); }});
/* Therapy dog: calm and gentle, at a library and a care home */
V['therapy:calm']=tripScene('class',{dur:4600,start(){ setCaption(`Therapy dog class: stay calm while new friends say hello.`); },
  pose(p,e){ p.eyes=e>1000?'closed':'happy'; p.mouth='smile'; },
  front(e){ [[40,0],[92,1400]].forEach(([x,t0],i)=>{ if(e>t0&&e<t0+2400){ const k=ph(e,t0,t0+400); blit(ctx,i?SPR.hand2:SPR.hand,x,lerp(-24,26,k)+Math.sin(e/200)*1.5); } }); },
  tick(a,e,now){ if(e>1000&&now>=a.next){ spawn('heart',64+rand(-12,12),52,rand(-4,4),-12,1.2); a.next=now+500; } if(e>3400) once(a,'g',()=>setCaption(`So gentle and calm. Perfect!`)); }});
V['therapy:library']=tripScene('library',{dur:5200,start(){ setCaption(`A visit to the library. ${nmS()} listens while a child reads a story.`); },
  pose(p,e){ p.body='lie'; p.face=1; p.frame=0; p.eyes=Math.floor(e/1500)%2?'happy':'closed'; },
  front(e){ const x=88; rect(ctx,x-9,78,18,9,INK); rect(ctx,x-8.4,78.6,8,7.8,'#FFFDF6'); rect(ctx,x+.4,78.6,8,7.8,'#FFFDF6'); rect(ctx,x-.3,78,.6,9,'#8A6234'); for(let i=0;i<3;i++){ rect(ctx,x-7,80.6+i*2,6,.5,'#B8A88A'); rect(ctx,x+1.6,80.6+i*2,6,.5,'#B8A88A'); } if(Math.floor(e/1600)%2) rect(ctx,x+.4,78.6,4,7.8,'#F4F0E6'); },
  tick(a,e,now){ if(now>=a.next){ play('rustle',.15); a.next=now+1600; } if(e>2600) once(a,'h',()=>{ spawn('heart',70,60,0,-12,1.4); setCaption(`Reading to a calm dog makes stories easier. Good helper!`); }); }});
V['therapy:carehome']=tripScene('carehome',{dur:5000,start(){ setCaption(`A visit to the care home. ${nmS()} sits by a friend's armchair for gentle pats.`); },
  pose(p,e){ p.dx=16; p.eyes=e>1200?'closed':'happy'; p.mouth='smile'; p.wag=200; },
  front(e){ if(e>600&&e<4400){ const k=ph(e,600,1000); blit(ctx,SPR.hand,84,lerp(-24,30,k)+Math.sin(e/260)*2); } },
  tick(a,e,now){ if(e>1200&&now>=a.next){ spawn('heart',80+rand(-8,8),50,rand(-4,4),-12,1.3); a.next=now+450; } if(e>3000) once(a,'s',()=>{ setCaption(`${nmS()} made someone smile today.`); play(kind()==='dog'?'pet:sigh':'pet:purr',.4); }); }});

/* ---- Camping ---- */
PLACES.camping={label:'Camping Trip',sub:'A tent, a campfire, and stars',stage:1,notSeason:'winter',travel:'car',music:'camp',bg:'camp',outdoor:true,
  story:()=>['camp:tent',pick(['camp:marshmallow','camp:songs']),pick(['camp:stars','camp:canoe']),'camp:sleep']};
function drawCamp(night){ blitView(ctx,cachedLayer('camp'+(night?'N':''),(g,ph,B)=>{ const n=night||ph==='night'; if(night){ vgrad(g,B.x0,B.y0,Bw(B),58-B.y0,[[0,'#1A2050'],[1,'#34406E']]); for(let i=0;i<Math.round(Bw(B)/3);i++) rect(g,B.x0+hash2(i,1,11)*Bw(B),B.y0+hash2(i,2,11)*48,.5,.5,'#FFF6C8'); pxEll(g,100,14,4,4,'#FFF1B8'); } else skyFill(g,58,ph,B);
  g.fillStyle=n?'#3A4A6A':'#9AB0C8'; g.beginPath(); g.moveTo(B.x0,46); for(let x=B.x0;x<=B.x1+10;x+=10) g.lineTo(x,40-Math.abs(Math.sin(x/23))*14); g.lineTo(B.x1,58); g.lineTo(B.x0,58); g.fill();
  rect(g,B.x0,52,Bw(B),6,n?'#2F4A7A':'#6FB0D8'); for(let x=al(B.x0,14)+3;x<B.x1;x+=14) rect(g,x,54,6,.5,'rgba(255,255,255,.45)');
  vgrad(g,B.x0,58,Bw(B),B.y1-58,[[0,n?'#3E5A42':'#7AB062'],[1,n?'#2F4A36':'#5E9A50']]);
  for(let x=al(B.x0,26)-4;x<B.x1+12;x+=26){ g.fillStyle=n?'#1E3A2A':'#3E6A4A'; g.beginPath(); g.moveTo(x+6,30); g.lineTo(x-2,60); g.lineTo(x+14,60); g.fill(); rect(g,x+5,60,2,3,'#5A3A20'); }
  [[26,86],[40,90],[54,86]].forEach(([x,y])=>{ pxEll(g,x,y,3,1.8,'#8A8A92'); }); rect(g,14,90,40,3,'#8A5A34'); rect(g,14,90,40,.8,'#A87A4A'); })); }
function drawCampfire(now,x,y){ rect(ctx,x-7,y,14,2,'#6A4428'); rect(ctx,x-5,y-1,10,2,'#5A3820'); for(let i=0;i<3;i++){ const f=Math.sin(now/110+i*2)*1.4; pxEll(ctx,x-3+i*3,y-3-Math.abs(f),2.4,4+f*.6,i===1?'#FFB347':'#F4743A'); pxEll(ctx,x-3+i*3,y-2,1.2,2,'#FFE27A'); } glow(ctx,x,y-4,36,'#FF9A4A',.28+Math.sin(now/170)*.05); }
/* A big family tent, taller and wider than a grown-up dog, with an open door flap and guy ropes. */
function drawTent(x,y,k){ if(k<=0) return; const hw=31, h=46, tri=(c,p)=>{ ctx.fillStyle=c; ctx.beginPath(); ctx.moveTo(p[0],p[1]); for(let i=2;i<p.length;i+=2) ctx.lineTo(p[i],p[i+1]); ctx.fill(); };
  if(k<.5){ const t=k*2; pxLine(ctx,x-hw,y,x,y-h*t,'#8A6A4A',1.4); pxLine(ctx,x+hw,y,x,y-h*t,'#8A6A4A',1.4); pxLine(ctx,x,y,x,y-h*t,'#8A6A4A',1); return; }
  pxLine(ctx,x,y-h,x-hw-9,y+1,'#E8DCC0',.6); pxLine(ctx,x,y-h,x+hw+9,y+1,'#E8DCC0',.6); rect(ctx,x-hw-10,y,2,2,'#8A6A4A'); rect(ctx,x+hw+8,y,2,2,'#8A6A4A');
  tri(INK,[x-hw-1.2,y+.8,x+hw+1.2,y+.8,x,y-h-1.6]); tri('#F08A2A',[x-hw,y,x+hw,y,x,y-h]); tri('#E07428',[x,y-h,x+hw,y,x+hw*.34,y]);
  for(let i=1;i<4;i++){ const t=i/4; pxLine(ctx,x-hw*t,y-h*(1-t),x+hw*t,y-h*(1-t),'#F6A04A',.5); }
  if(k>=1){ tri(INK,[x-12.6,y+.4,x+12.6,y+.4,x,y-25]); tri('#5A3420',[x-11.6,y,x+11.6,y,x,y-23.6]); tri('#F6A04A',[x+1,y-23,x+12,y,x+6,y]); pxEll(ctx,x+9.4,y-9,1.4,1.4,'#8A5A34'); }
  rect(ctx,x-.6,y-h-4,1.2,4,'#8A6A4A'); tri('#F4C542',[x+.6,y-h-4,x+5,y-h-2.6,x+.6,y-h-1.4]); }
Object.assign(BG,{camp:()=>drawCamp(false),campN:()=>drawCamp(true),lake:()=>drawLake(),tentin:()=>drawTentInside()});
function drawLake(){ blitView(ctx,cachedLayer('lake',(g,ph,B)=>{ skyFill(g,44,ph,B); for(let x=al(B.x0,18);x<B.x1+10;x+=18){ g.fillStyle='#3E6A4A'; g.beginPath(); g.moveTo(x+6,26); g.lineTo(x,46); g.lineTo(x+12,46); g.fill(); }
  vgrad(g,B.x0,46,Bw(B),B.y1-46,[[0,'#5AA8D8'],[1,'#2F6FA8']]); for(let y=52;y<B.y1;y+=6) for(let x=al(B.x0,20)+(y%12);x<B.x1;x+=20) rect(g,x,y,7,.5,'rgba(255,255,255,.4)'); })); }
function drawTentInside(){ blitView(ctx,cachedLayer('tentin',(g,ph,B)=>{ rect(g,B.x0,B.y0,Bw(B),B.y1-B.y0,'#E07428'); g.fillStyle='#F08A2A'; g.beginPath(); g.moveTo(B.x0,B.y1); g.lineTo(64,B.y0); g.lineTo(B.x1,B.y1); g.fill();
  pxLine(g,64,B.y0,64,70,'#C9602A',.6); rect(g,B.x0,74,Bw(B),B.y1-74,'#8A5A34'); pxLine(g,64,6,64,16,'#6A4428',.5); rect(g,61,16,6,7,INK); rect(g,61.6,16.6,4.8,5.8,'#FFE27A'); ctx; g.fillStyle='rgba(20,20,50,.25)'; g.fillRect(B.x0,B.y0,Bw(B),B.y1-B.y0); glow(g,64,20,40,'#FFE9A8',.35); })); }
/* Night by the campfire: the tent stays pitched off to the side. */
const nightScene=(bg,d)=>{ const s=tripScene(bg,d), sc=s.scene; return Object.assign(s,{scene(e,a){ if(sc) sc.call(s,e,a); else drawCamp(true); drawTent(4,86,1); }}); };
V['camp:tent']=tripScene('camp',{dur:4600,start(){ setCaption(`Camping! First, let's pitch the tent.`); play('rustle',.4); },
  pose(p,e){ p.dx=-18; p.eyes=e<3000?'open':'happy'; p.headDy=-1; if(e>3000){ p.mouth='tongue'; p.headDy=0; } },
  behind(e){ drawTent(100,86,ph(e,300,2800)); },
  tick(a,e){ [900,1700,2500].forEach((t,i)=>{ if(e>t) once(a,'t'+i,()=>play(i===2?'pop':'knock',.35)); }); if(e>2900) once(a,'d',()=>{ setCaption(`The tent is up! ${nmS()} peeks inside.`); play(happyNoise(),.45); }); }});
V['camp:marshmallow']=nightScene('campN',{dur:5000,start(){ setCaption(`Roasting marshmallows by the campfire. A ${kind()==='cat'?'kitty':'pup'}-friendly treat for ${nmS()}, too!`); },
  pose(p,e){ p.dx=18; p.eyes=e<3200?'open':'happy'; if(e>3400&&e<4200){ const b=Math.floor(e/170)%2; p.headDy=b; p.mouth=b?'open':'smile'; } },
  front(e,a,p){ drawCampfire(performance.now(),40,84); const toast=ph(e,600,2800); pxLine(ctx,64,52,44,72,'#8A5A34',.8); pxEll(ctx,44,72,2,1.6,INK); pxEll(ctx,44,72,1.5,1.2,toast<.5?'#FFFFFF':toast<.9?'#F4D29A':'#D8A060');
    if(e>3000&&e<3400){ const k=ph(e,3000,3400), m=mouthAt(p); blit(ctx,SPR.cookie,lerp(40,m.x-4,k),lerp(50,m.y-3,k)); } },
  tick(a,e,now){ if(now>=a.next){ play('crickets',.15); a.next=now+2200; } if(e>2800) once(a,'g',()=>{ setCaption(`Golden brown! Yum.`); play('sparkle',.4); }); if(e>3400) once(a,'c',()=>play('crunch',.5)); }});
V['camp:songs']=nightScene('campN',{dur:5000,start(){ setCaption(kind()==='dog'?`Campfire songs! ${nmS()} howls along.`:`Campfire songs! ${nmS()} purrs along.`); },
  pose(p,e){ p.dx=18; const on=kind()==='dog'&&Math.floor(e/1400)%2===1; p.headDy=on?-2:0; p.mouth=on?'open':'smile'; p.eyes=on?'closed':'happy'; },
  front(){ drawCampfire(performance.now(),40,84); },
  tick(a,e,now){ if(now>=a.next){ spawn('note',64+rand(-16,16),56,rand(-6,6),-14,1.4); play('beep'+(1+Math.floor(rand(0,4))),.25); a.next=now+600; } [1400,4200].forEach((t,i)=>{ if(e>t) once(a,'h'+i,()=>play(kind()==='dog'?'pet:whimper':'pet:purr',.4)); }); }});
V['camp:stars']=nightScene('campN',{dur:5200,start(){ setCaption(`Look up! So many stars tonight.`); },
  pose(p,e){ p.body='lie'; p.face=1; p.frame=0; p.eyes='open'; p.headDy=-1; if(e>3200) p.eyes='happy'; },
  front(e){ drawCampfire(performance.now(),28,86); if(e>2400&&e<3200){ const k=ph(e,2400,3200); for(let i=0;i<8;i++) rect(ctx,lerp(20,110,k)-i*2,lerp(8,30,k)-i*.5,1,1,`rgba(255,246,200,${(1-i/8).toFixed(2)})`); } },
  tick(a,e){ if(e>2400) once(a,'s',()=>{ play('twinkle',.6); setCaption(`A shooting star! Make a wish, ${nmS()}.`); }); if(e>3400) once(a,'p',()=>addPhoto('place',`Stargazing on a camping trip with ${nmS()}.`,{place:'camping'})); }});
V['camp:canoe']=tripScene('lake',{dur:5600,noShadow:true,start(){ setCaption(`A canoe ride on the lake! Paddle, paddle.`); },
  pose(p,e){ p.dx=Math.round(lerp(-40,30,ph(e,0,5200))); p.dy=4+Math.round(Math.sin(e/400)); p.eyes='happy'; p.mouth=e>2600&&e<3400?'open':'smile'; },
  clipY:()=>80,
  front(e,a,p){ const x=64+p.dx, y=84+Math.round(Math.sin(e/400)); ctx.fillStyle=INK; ctx.beginPath(); ctx.moveTo(x-24,y-4); ctx.lineTo(x+24,y-4); ctx.lineTo(x+18,y+3); ctx.lineTo(x-18,y+3); ctx.fill(); ctx.fillStyle='#C9573E'; ctx.beginPath(); ctx.moveTo(x-22.5,y-3.4); ctx.lineTo(x+22.5,y-3.4); ctx.lineTo(x+17,y+2.4); ctx.lineTo(x-17,y+2.4); ctx.fill(); rect(ctx,x-22,y-4,44,1,'#E8905A');
    const pa=Math.sin(e/300); pxLine(ctx,x+10,y-14,x+16+pa*4,y+4,'#8A5A34',1); pxEll(ctx,x+16+pa*4,y+5,1.6,3,'#8A5A34');
    if(e>2600&&e<3400){ const k=ph(e,2600,3400); blit(ctx,SPR.fish,lerp(98,108,k),80+arc(k,14)); } },
  tick(a,e,now){ if(now>=a.next){ play('splat',.15); a.next=now+600; } if(e>2600) once(a,'f',()=>{ play('bounce',.5); setCaption(`A fish jumped! ${nmS()} is so surprised.`); }); if(e>4200) once(a,'p',()=>addPhoto('place',`${nmS()}'s canoe ride.`,{place:'camping'})); }});
V['camp:sleep']=tripScene('tentin',{dur:5000,start(){ setCaption(kind()==='cat'?`Bedtime in the tent. ${nmS()} curls up inside the sleeping bag.`:`Bedtime in the tent. ${nmS()} snuggles into the sleeping bag.`); play('lullaby',.4); },
  pose(p,e){ p.body='lie'; p.face=1; p.frame=0; p.eyes=e>900?'closed':'happy'; },
  front(e,a,p){ const cat=kind()==='cat', y=cat?81:82; rect(ctx,32,y,64,94-y,INK); rect(ctx,33,y+.6,62,93.4-y,'#5A8FC4'); for(let x=36;x<94;x+=6) rect(ctx,x,y+2,3,90-y,'#6A9FD0'); rect(ctx,33,y+.6,62,1.6,'#3E6FA4'); },
  tick(a,e,now){ if(e>1000&&now>=a.next){ spawn('z',72,58,5,-7,2.2); a.next=now+1200; } if(e>2000&&kind()==='cat') once(a,'p',()=>play('pet:purr',.4)); }});
