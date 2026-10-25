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
// Shared trim and small props keep the school rooms in the same illustrated style.
function schoolPanel(g,x,y,w,h,r,fill,stroke){ g.beginPath(); g.roundRect(x,y,w,h,r); g.fillStyle=fill; g.fill(); if(stroke){ g.strokeStyle=stroke; g.lineWidth=.7; g.stroke(); } }
function schoolPaw(g,x,y,s,c){ pxEll(g,x,y+s*.6,s*1.15,s*.9,c); [[-1.2,-.8],[-.4,-1.4],[.5,-1.4],[1.3,-.6]].forEach(([dx,dy])=>pxEll(g,x+dx*s,y+dy*s,s*.43,s*.55,c)); }
function schoolRoom(g,B,wall,trim,floor){
  vgrad(g,B.x0,B.y0,Bw(B),60-B.y0,[[0,wall],[1,shade(wall,-.04)]]);
  rect(g,B.x0,44,Bw(B),16,trim); for(let x=al(B.x0,14);x<B.x1;x+=14){ rect(g,x,45,.6,14,shade(trim,-.13)); rect(g,x+.6,45,.6,14,shade(trim,.16)); }
  rect(g,B.x0,43,Bw(B),1.5,'#FFF8E8'); rect(g,B.x0,44.5,Bw(B),.6,shade(trim,-.2));
  planks(g,floor,shade(floor,-.07),{x0:B.x0,x1:B.x1,y0:60,y1:B.y1});
  rect(g,B.x0,58,Bw(B),2,'#FFF9E8'); rect(g,B.x0,60,Bw(B),.7,'#907B62'); }
function schoolRug(g,x,y,rx,ry,c){ softShadow(g,x,y+1,rx+1,ry,.12); pxEll(g,x,y,rx,ry,shade(c,-.25)); pxEll(g,x,y-.4,rx-.8,ry-.7,c); pxRing(g,x,y-.4,rx-3,ry-1.8,.5,shade(c,.22)); }
function schoolBench(g,x,y){ softShadow(g,x+11,y+1,14,2,.18); rect(g,x+1,y-9,1.4,10,'#3E6260'); rect(g,x+20,y-9,1.4,10,'#3E6260');
  schoolPanel(g,x-1,y-12,25,4,1,'#C79460','#78573F'); rect(g,x,y-10.3,23,.6,'#E5B881');
  schoolPanel(g,x-2,y-5,27,2.6,.7,'#DBAB75','#78573F'); rect(g,x,y-2.5,1.4,3,'#3E6260'); rect(g,x+21,y-2.5,1.4,3,'#3E6260'); }
function schoolCone(g,x,y,s=1){ g.save(); g.translate(x,y); g.scale(s,s); softShadow(g,0,.6,4,1,.16); schoolPanel(g,-4,-1,8,1.5,.6,'#E18A49','#8F573A');
  g.beginPath(); g.moveTo(-2.7,-1); g.lineTo(-.8,-8); g.quadraticCurveTo(0,-8.7,.8,-8); g.lineTo(2.7,-1); g.closePath(); g.fillStyle='#F5A15B'; g.fill(); g.strokeStyle='#A45D3D'; g.lineWidth=.6; g.stroke(); pxLine(g,-1.5,-4.5,1.5,-4.5,'#FFF8DF',1.4); g.restore(); }
function drawClassroom(){ blitView(ctx,cachedLayer('class',(g,ph,B)=>{
  schoolRoom(g,B,'#F6EEDB','#A6C8BE','#DAC7A2'); framedWindow(g,5,13,23,23,ph==='night');
  schoolPanel(g,37,8,54,33,1.5,'#B57B4E','#78563F'); schoolPanel(g,39,10,50,29,.7,'#365950','#27453F');
  rect(g,41,12,46,.6,'#527367'); schoolPaw(g,49,23,2.1,'#F6EDC9');
  // Three chalk lesson cards: a paw, a path, and a reward.
  pxLine(g,57,23,68,23,'#EAE8CF',.8); pxLine(g,65,20,68,23,'#EAE8CF',.8); pxLine(g,65,26,68,23,'#EAE8CF',.8);
  heartFill(g,79,22,3.1,'#E7B5A2'); for(let i=0;i<3;i++){ pxLine(g,45+i*14,32,47+i*14,34,'#D5DCC3',.7); pxLine(g,47+i*14,34,50+i*14,30,'#D5DCC3',.7); }
  schoolPanel(g,36,40,56,2.4,.5,'#D3A16C','#78563F'); rect(g,72,39,6,1,'#F9F0DB'); rect(g,82,38,5,2,'#CCB698');
  schoolPanel(g,100,12,18,25,1,'#D6A16B','#8F6C50'); rect(g,102,14,14,21,'#F9EFCE');
  [[106,20,'#D89767'],[113,20,'#7DADBD'],[109.5,29,'#D4A94A']].forEach(([x,y,c])=>{ pxLine(g,x-1,y+1,x-2,y+4,c,1.5); pxLine(g,x+1,y+1,x+2,y+4,c,1.5); pxEll(g,x,y,2.1,2.1,c); pxEll(g,x,y,1.1,1.1,'#F8DE8F'); });
  schoolBench(g,1,64); schoolRug(g,64,83,35,10,'#77AAA8');
  // Leave a clear gap between the mat shelf and the plant's outer leaves.
  schoolPanel(g,94,50,17,11,1,'#BD8D60','#8D684C'); [[97,'#E5AA95'],[102,'#8EAFC3'],[107,'#DDC37D']].forEach(([x,c])=>{ schoolPanel(g,x,49,3.8,9,1,c,shade(c,-.25)); pxEll(g,x+1.9,49.5,1.7,1,c); });
  pottedPlant(g,120,65,.7);
})); }
function drawTrainingField(){ blitView(ctx,cachedLayer('schoolfield',(g,ph,B)=>{
  const night=ph==='night'; skyFill(g,50,ph,B); hillBand(g,43,12,night?'#3B6158':'#A5C99A',27,B); hillBand(g,48,10,night?'#31534C':'#86B482',41,B);
  for(let x=al(B.x0,42)-16;x<B.x1+20;x+=42) roundTree(g,x,34,night,night?'#345B4B':'#649C70',night?'#446D57':'#8FBD7C',12);
  vgrad(g,B.x0,54,Bw(B),B.y1-54,[[0,night?'#497858':'#9BC77C'],[1,night?'#315940':'#6CA565']]);
  for(let y=58;y<B.y1;y+=14) rect(g,B.x0,y,Bw(B),7,'rgba(230,245,183,.09)');
  // Fence, flowering border, and a bench sit behind the clear training lane.
  [46,52].forEach(y=>{ rect(g,B.x0,y,Bw(B),1.5,night?'#819189':'#E5DFBE'); rect(g,B.x0,y+1.5,Bw(B),.6,'#709373'); });
  for(let x=al(B.x0,14);x<B.x1;x+=14){ schoolPanel(g,x,43,2.4,14,.6,night?'#9CA99B':'#FFF0CF','#799171'); }
  for(let x=al(B.x0,23)+3;x<B.x1;x+=23){ pxLine(g,x,57,x+1,54,'#568C56',.6); pxEll(g,x+1,53.8,1,.8,'#ECD9A3'); }
  schoolBench(g,B.x0+8,62);
  schoolPanel(g,47,36,34,13,1.6,'#487C73','#315C56'); schoolPanel(g,48,37,32,11,1,'#568B7D'); schoolPaw(g,55,42.5,1.7,'#F8EDC8');
  pxLine(g,63,41,75,41,'#E2DFC2',1); pxLine(g,63,44,72,44,'#BFD3B2',.7);
  schoolCone(g,16,67,.7); schoolCone(g,114,67,.7);
  pxLine(g,B.x0,91,B.x1,91,'rgba(246,243,209,.6)',.7);
})); }
function drawStudio(){ blitView(ctx,cachedLayer('studio',(g,ph,B)=>{
  schoolRoom(g,B,'#EBE4EC','#B8ACC8','#D7AF86');
  [21,51,81].forEach(x=>{ schoolPanel(g,x-1,9,28,42,1.2,'#9C829E','#6A6075');
    vgrad(g,x+1,11,24,38,[[0,'#E7F3F2'],[.65,'#CADDE3'],[1,'#B4C4D5']]);
    pxLine(g,x+3,34,x+20,13,'rgba(255,255,255,.65)',2); pxLine(g,x+9,36,x+22,20,'rgba(255,255,255,.4)',.8); rect(g,x+1,48,24,1,'#F5F0E8'); });
  [27,69,101].forEach(x=>{ pxLine(g,x,40,x,46,'#7D707C',1.2); pxLine(g,x,46,x+3,46,'#7D707C',1.2); });
  schoolPanel(g,17,39,95,2.1,1,'#C8976C','#7D6355'); rect(g,19,39.2,91,.6,'#F1CEA0');
  // Compact speakers, a music plaque, and floor markings frame the dance space.
  [5,116].forEach(x=>{ schoolPanel(g,x,43,8,18,1,'#596073','#3E4756'); [49,57].forEach(y=>{ pxEll(g,x+4,y,2.5,2.5,'#303A49'); pxRing(g,x+4,y,2,2,.5,'#8D95A9'); pxEll(g,x+4,y,.8,.8,'#BEC5CF'); }); });
  schoolPanel(g,58,2,12,7,1,'#E3BB7F','#AC8C65'); pxLine(g,63,4,63,7,'#6D6480',.8); pxEll(g,61.5,7,1.5,.9,'#6D6480'); pxLine(g,63,4,66,3.5,'#6D6480',.8);
  for(let x=36;x<=92;x+=28) pxLine(g,x-2,87,x+2,87,'#EFE0BC',.8);
})); }
function drawPool(){ blitView(ctx,cachedLayer('pool',(g,ph,B)=>{
  tileWall(g,B.y0,53,'#E6F0EB','#CDDDD9',B,9); rect(g,B.x0,39,Bw(B),3,'#7BB1AF'); rect(g,B.x0,43,Bw(B),1,'#A4CBC3');
  [15,54,93].forEach(x=>framedWindow(g,x,9,23,22,ph==='night'));
  // A tiled deck with a rounded coping edge, ladder, and mounted rescue ring.
  rect(g,B.x0,53,Bw(B),12,'#D6D4BE'); for(let x=al(B.x0,13);x<B.x1;x+=13) pxLine(g,x,53,x-3,64,'#BDBDA9',.5);
  rect(g,B.x0,60,Bw(B),.8,'#A6B8AC'); schoolPanel(g,B.x0-2,62,Bw(B)+4,4,1,'#FFF7DE','#A4C1BC');
  vgrad(g,B.x0,66,Bw(B),B.y1-66,[[0,'#79C9CC'],[1,'#399BAE']]);
  for(let y=74;y<B.y1;y+=10) for(let x=al(B.x0,19);x<B.x1;x+=19){ pxLine(g,x,y,x+6,y+1,'rgba(206,251,230,.3)',.7); pxLine(g,x+6,y+1,x+12,y-1,'rgba(206,251,230,.3)',.7); }
  pxLine(g,6,38,6,42,'#788C84',.8); pxEll(g,6,47,5.6,5.6,'#6A918E'); pxEll(g,6,47,4.9,4.9,'#F5AA77'); pxEll(g,6,47,2.5,2.5,'#DEECE6');
  [[2,44],[9,44],[2,50],[9,50]].forEach(([x,y])=>pxLine(g,x,y,x+1,y+1,'#FFF3D8',1.6));
  [105,113].forEach(x=>{ g.beginPath(); g.moveTo(x,73); g.lineTo(x,56); g.quadraticCurveTo(x,51,x-3,53); g.lineTo(x-3,60); g.strokeStyle='#4F8587'; g.lineWidth=2; g.stroke(); g.strokeStyle='#E7F2E7'; g.lineWidth=.9; g.stroke(); });
  for(let y=62;y<=71;y+=4) pxLine(g,105,y,113,y,'#D8ECE0',1.4);
  schoolPanel(g,25,51,14,3,1,'#90B4CA','#608F9D'); schoolPanel(g,26,49,12,2,1,'#EAC69E','#BAA181');
})); }
function schoolBookcase(g,x,y,w){
  schoolPanel(g,x,y,w,44,1,'#AA8058','#72543C'); rect(g,x+2,y+2,w-4,39,'#765E49'); const colors=['#A7B77D','#C98D76','#7E9FB6','#D9BF7E','#B79EB9'];
  for(let row=0;row<3;row++){ const by=y+13+row*13; for(let i=0;i<6;i++){ const bx=x+3+i*(w-6)/6, h=6+hash2(i,row,x)*4, c=colors[(i+row)%5];
      schoolPanel(g,bx,by-h,(w-7)/6-.5,h,.3,c,shade(c,-.25)); pxLine(g,bx+.4,by-h+1.4,bx+(w-7)/6-1.4,by-h+1.4,'#F3DEB4',.45); }
    rect(g,x+1,by,w-2,1.8,'#C49B6F'); rect(g,x+1,by+1.8,w-2,.6,'#674E3B'); }
  rect(g,x+2,y+44,2,3,'#72543C'); rect(g,x+w-4,y+44,2,3,'#72543C'); }
function drawLibrary(){ blitView(ctx,cachedLayer('library',(g,ph,B)=>{
  schoolRoom(g,B,'#F2E7D4','#B9C4AA','#CDAF88'); schoolBookcase(g,0,14,32); schoolBookcase(g,97,14,32);
  framedWindow(g,45,12,34,25,ph==='night','#BAAA89');
  schoolPanel(g,42,44,40,13,1.5,'#AE8E6A','#7B654D'); schoolPanel(g,40,43,44,5,2,'#AFBEC0','#768D8F');
  schoolPanel(g,45,41,11,5,2,'#E3B49D','#AE8C79'); schoolPanel(g,69,41,9,5,2,'#CCBA83','#9C9269');
  schoolRug(g,64,82,38,11,'#7DA5B1'); pxEll(g,105,80,11,5,'#AC7B69'); pxEll(g,105,78.8,10.5,4.2,'#D8A48C'); pxRing(g,105,78.8,8.8,3,.5,'#EBC3A6');
})); }
function drawCareHome(){ blitView(ctx,cachedLayer('carehome',(g,ph,B)=>{
  schoolRoom(g,B,'#F6E9D7','#D9C7B8','#D6B88C'); framedWindow(g,13,13,28,23,ph==='night','#B5BBB0'); framedPicture(g,65,14,16,13,'#B49164');
  schoolRug(g,67,82,37,10,'#C58B76');
  blit(g,armchairSprite('#8E99AB'),88,37); schoolPanel(g,96,50,14,10,1,'#E8CCA2','#B19B83');
  for(let x=97;x<110;x+=3) rect(g,x,50,1,10,'#C99D86'); for(let y=52;y<59;y+=3) rect(g,96,y,14,.6,'#FAE7C4'); for(let x=96.4;x<110;x+=1.4) rect(g,x,60,.6,1.2,'#E8CCA2');
  floorLamp(g,122,60,'#F5DFAC',true); cafeTable(g,24,59); pottedPlant(g,5,67,.85);
})); }
Object.assign(BG,{class:()=>drawClassroom(),schoolfield:()=>drawTrainingField(),studio:()=>drawStudio(),pool:()=>drawPool(),library:()=>drawLibrary(),carehome:()=>drawCareHome()});
/* Classes cover class pictures in the choice preview. */
Object.assign(PREVIEW_ART,{
  class_basics:(x,y)=>{ blit(ctx,SPR.bone,x-6.5,y-4.5); pxEll(ctx,x,y+6,6,1,'#9FC4E8'); },
  class_agility:(x,y)=>{ ctx.save(); ctx.translate(x,y+6); ctx.scale(.65,.65); drawSchoolHurdle(ctx,0,0); ctx.restore(); },
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
const sitPose=(p,e,t)=>sitTrickPose(p,e,t);
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
function drawSchoolHurdle(g,x,base=86){
  softShadow(g,x,base+.5,14,1.8,.19);
  [-1,1].forEach(s=>{ const px=x+s*10;
    schoolPanel(g,px-3,base-1.3,6,1.8,.6,'#577F85','#3C646A');
    schoolPanel(g,px-1.3,base-20,2.6,19,.6,'#F7F1D9','#72928B'); rect(g,px-.9,base-19,1,16,'#FFFFFF');
    schoolPanel(g,px-1.6,base-20.5,3.2,2,.5,'#D57558','#A65A48');
    [6,10,14].forEach(h=>pxEll(g,px,base-h,.4,.4,'#869F96'));
    pxLine(g,px,base-15,px+s*3,base-2,'#779D9F',1); });
  // One continuous crossbar with solid supports and alternating bands.
  schoolPanel(g,x-10.5,base-10.7,21,2.3,.9,'#FFF7DE','#9F7861');
  for(let i=0;i<4;i++) rect(g,x-9+i*6,base-10.4,3,1.7,'#D97F60');
  pxLine(g,x-9,base-10.2,x+9,base-10.2,'rgba(255,255,255,.45)',.45);
}
function drawSchoolTunnel(front){ const g=ctx, x0=34,x1=94,cy=68,ry=18;
  if(!front){ softShadow(g,64,87,38,2.6,.24); [x0,x1].forEach(x=>{ pxEll(g,x,cy,7.2,ry+1,'#244F65'); pxEll(g,x,cy,6.3,ry,'#244659'); pxEll(g,x+1,cy+1,4.8,ry-2,'#193C4E'); }); return; }
  g.save(); g.beginPath(); g.moveTo(x0,cy-ry); g.bezierCurveTo(48,cy-ry-2,80,cy-ry-2,x1,cy-ry); g.lineTo(x1,cy+ry); g.quadraticCurveTo(64,cy+ry+1,x0,cy+ry); g.closePath();
  const gr=g.createLinearGradient(0,cy-ry,0,cy+ry); gr.addColorStop(0,'#83BCD0'); gr.addColorStop(.28,'#57A0BF'); gr.addColorStop(.7,'#3F82A7'); gr.addColorStop(1,'#316988'); g.fillStyle=gr; g.fill(); g.strokeStyle='#2C617B'; g.lineWidth=.8; g.stroke(); g.clip();
  for(let x=x0;x<=x1;x+=6){ g.beginPath(); g.ellipse(x,cy,6.5,ry,0,-Math.PI/2,Math.PI/2); g.strokeStyle='#2C6689'; g.lineWidth=1.4; g.stroke(); g.beginPath(); g.ellipse(x-.8,cy-.4,6.5,ry,0,-Math.PI/2,Math.PI/2); g.strokeStyle='#95C7CD'; g.lineWidth=.6; g.stroke(); }
  g.restore();
  // Open end rims leave the arriving head and departing body visible in the mouths.
  [x0,x1].forEach(x=>{ pxRing(g,x,cy,7.3,ry+1,1.4,'#D5AE68'); pxRing(g,x,cy,6.3,ry,.6,'#F7DE9B'); });
  [[42,85],[86,85]].forEach(([x,y])=>{ schoolPanel(g,x-4,y,8,2.4,.7,'#D7B984','#7F795A'); pxLine(g,x,y-3,x,y+1,'#656B59',.7); });
}
V['agility:jumps']=tripScene('schoolfield',{dur:4400,start(){ setCaption(`Agility class: over the jumps!`); },
  pose(p,e){ p.dx=lerp(-56,56,ph(e,400,3600)); p.dy=0; p.body=e>400&&e<3600?'run':'stand'; p.face=1; p.frame=Math.floor(e/100)%4; p.eyes='happy'; p.mouth='tongue';
    if(e<1950) leapPose(p,e,650,1750,20); else leapPose(p,e,2190,3290,20); },
  behind(){ [36,90].forEach(x=>drawSchoolHurdle(ctx,x)); },
  tick(a,e){ [650,2190].forEach((t,i)=>{ if(e>t) once(a,'j'+i,()=>play('whoosh',.4)); }); if(e>3600) once(a,'d',()=>{ play('happy',.5); setCaption('Two perfect jumps!'); }); }});
V['agility:tunnel']=tripScene('schoolfield',{dur:4600,start(){ setCaption(`Agility class: zoom through the tunnel!`); },
  pose(p,e){ p.dx=lerp(-62,62,ph(e,300,3600)); p.dy=0; p.body=e>300&&e<3600?'run':'stand'; p.face=1; p.frame=Math.floor(e/100)%4; p.eyes='happy'; p.mouth='open'; },
  behind(){ drawSchoolTunnel(false); },
  front(){ drawSchoolTunnel(true); },
  tick(a,e,now){ if(e>1100&&e<2600&&now>=a.next){ play('rustle',.35); a.next=now+380; } if(e>2800) once(a,'o',()=>{ play('pop',.5); setCaption('Out the other side!'); }); }});
V['agility:weave']=tripScene('schoolfield',{dur:4600,start(){ setCaption(`Agility class: weave through the poles!`); },
  pose(p,e){ const k=ph(e,300,3800); p.dx=lerp(-48,48,k); p.dy=Math.sin(k*Math.PI*6)*3; p.body=e>300&&e<3800?'walk':'stand'; p.face=1; p.frame=Math.floor(e/120)%4; p.eyes='happy'; p.mouth='tongue'; },
  behind(e,a,p){ if(p.dy>=0) drawWeavePoles(6,30,14); },
  front(e,a,p){ if(p.dy<0) drawWeavePoles(6,30,14); },
  tick(a,e,now){ if(e<3800&&now>=a.next){ play('step',.3); a.next=now+180; } if(e>3800) once(a,'d',()=>{ play('happy',.5); burst(6); setCaption('Weave poles done! So quick!'); }); }});
/* Frisbee; the catch also becomes a trick */
function discDef(kind){ return {dur:kind==='roll'?4000:3800,
  disc(e){ if(kind==='roll'){ const k=ph(e,300,2200); return e<2400?{x:lerp(140,70,k),y:86}:null; }
    const p={dx:0,dy:0,headDy:0}; this.pose(p,1700); const m=mouthAt(p), k=ph(e,400,1700);
    return e<1700?{x:lerp(140,m.x,k),y:lerp(40,m.y,k)+arc(k,8)}:null; },
  pose(p,e){ if(kind==='roll'){ if(e>900&&e<2300){ p.body='run'; p.face=1; p.frame=Math.floor(e/90)%4; p.dx=Math.round(lerp(0,6,ph(e,900,2300))); } else { p.dx=e>2300?6:0; p.eyes='happy'; } return; }
    p.face=1; p.dy=0; p.eyes='happy'; p.mouth=e<1650?'open':'smile';
    if(e<2400){ p.dx=lerp(0,8,ph(e,1250,2150)); leapPose(p,e,1250,2150,kind==='leap'?19:8); }
    else if(e<3300) walkBetween(p,e,2400,3300,8,0); },
  front(e,a,p){ const d=this.disc(e); if(d) blit(ctx,SPR.frisbee,d.x-6.5,d.y-3); else { const m=mouthAt(p); blit(ctx,SPR.frisbee,m.x-6.5,m.y-2); } },
  tick(a,e){ if(e>300) once(a,'t',()=>{ play('whoosh',.4); setCaption(kind==='roll'?`Frisbee class: chase the rolling disc!`:kind==='low'?`Frisbee class: catch it!`:`Frisbee class: the big leap!`); }); const t=kind==='roll'?2300:1700; if(e>t) once(a,'c',()=>{ play('pop',.6); burst(6); setCaption(kind==='leap'?'Wow! A mid-air catch!':'Got it! Great catch!'); later(()=>play('pet:barkHappy',.45),300); }); }}; }
V['frisbee:roll']=tripScene('schoolfield',discDef('roll')); V['frisbee:low']=tripScene('schoolfield',discDef('low')); V['frisbee:leap']=tripScene('schoolfield',discDef('leap')); V['trick:catch']=discDef('leap');
/* Dance */
const stepDef={dur:4000,pose(p,e){ const t=e/340, k=motionHold(e,0,300,3300,3900); p.dx=Math.sin(t)*7*k; p.dy=0; p.eyes='happy'; p.mouth='open'; if(k>0){ p.body='walk'; p.face=Math.cos(t)>0?1:-1; p.frame=Math.floor(e/140)%4; } },
  tick(a,e,now){ if(now>=(a.next||0)){ spawn('note',64+rand(-18,18),56,rand(-6,6),-14,1.4); play('beep'+(1+Math.floor(rand(0,4))),.3); a.next=now+500; } }};
V['dance:step']=tripScene('studio',Object.assign({},stepDef,{start(){ setCaption(`Dance class: step to the side, and step back!`); }}));
V['trick:steps']=Object.assign({},stepDef);
/* The school tricks at home */
/* Come: the dog wanders off to sniff something, hears its name, and runs right back. */
V['trick:come']={dur:3600,cue:n=>`${n} wanders off to sniff something... ${n}, come!`,
  pose(p,e){ if(e<900){ p.body='walk'; p.face=-1; p.frame=Math.floor(e/140)%4; p.dx=Math.round(lerp(0,-30,e/900)); }
    else if(e<1600){ p.dx=-30; p.body='stand'; p.face=-1; p.headDy=3; p.eyes='closed'; }
    else if(e<2500){ p.body='run'; p.face=1; p.frame=Math.floor(e/90)%4; p.dx=Math.round(lerp(-30,0,ph(e,1600,2500))); p.eyes='happy'; p.mouth='open'; }
    else { p.eyes='happy'; p.mouth='tongue'; p.wag=90; } },
  tick(a,e,now){ if(e<900&&now>=(a.next||0)){ play('step',.2); a.next=now+280; } if(e>1000) once(a,'s',()=>play('sniff',.35)); if(e>1600) once(a,'c',()=>{ play('choose'); spawn('sparkle',34,PETY+6,0,-8,.8); }); cheer(a,e,2500); }};
/* Weave the poles: a little row of poles, and the dog weaves through them. */
function drawWeavePoles(count,x0,gap){
  schoolPanel(ctx,x0-3,85,(count-1)*gap+6,1.5,.5,'#839B8B','#5B796D');
  for(let i=0;i<count;i++){ const x=x0+i*gap, c=i%2?'#508BA8':'#CD765B'; softShadow(ctx,x+2,87,4,1,.15);
    schoolPanel(ctx,x-2,84.5,4,2,.6,'#698C82','#4F7169'); schoolPanel(ctx,x-.9,63,1.8,22,.8,'#FFF4D9','#718F85');
    [65,72,79].forEach(y=>rect(ctx,x-.65,y,1.3,3.6,c)); pxEll(ctx,x,63.5,.9,.7,c); }
}
V['trick:weave']={dur:5000,
  pose(p,e){ p.eyes='happy'; p.mouth='tongue'; if(e<600) walkBetween(p,e,0,600,0,-36);
    else if(e<3800){ const k=ph(e,600,3800); p.body='walk'; p.face=1; p.frame=Math.floor(e/130)%4; p.dx=lerp(-36,36,k); p.dy=Math.sin(k*Math.PI*5)*3; }
    else if(e<4800) walkBetween(p,e,3800,4800,36,0); else p.dy=0; },
  behind(e,a,p){ if(e<4000&&p.dy>=0) drawWeavePoles(5,36,14); },
  front(e,a,p){ if(e<4000&&p.dy<0) drawWeavePoles(5,36,14); },
  tick(a,e,now){ if(e<3200&&now>=(a.next||0)){ play('step',.25); a.next=now+200; } cheer(a,e,3300); }};
V['trick:jump']={dur:4200,
  pose(p,e){ p.dy=0; p.eyes='happy'; p.mouth='tongue'; if(e<600) walkBetween(p,e,0,600,0,-40);
    else if(e<2700){ p.dx=lerp(-40,40,ph(e,600,2700)); p.body='run'; p.face=1; p.frame=Math.floor(e/100)%4; if(e>900&&e<2500) leapPose(p,e,1150,2200,16); }
    else if(e<3900) walkBetween(p,e,2700,3900,40,0); },
  behind(){ drawSchoolHurdle(ctx,64); },
  tick(a,e){ if(e>1200) once(a,'j',()=>play('whoosh',.45)); if(e>2500) once(a,'h',()=>{ play('happy',.5); burst(6); }); }};
V['trick:paddle']={dur:3400,noShadow:true,undressed:true,
  pose(p,e){ swimmingPose(p,e,Math.sin(e/600)*3,1,71); },
  behind(){ pxEll(ctx,64,83,43,12,INK); pxEll(ctx,64,82,42,11,'#79B5D8'); pxEll(ctx,64,80,40,10,'#B6E4ED'); },
  front(e,a,p){ ctx.save(); ctx.beginPath(); ctx.ellipse(64,80,40,10,0,0,TAU); ctx.clip(); rect(ctx,24,71,80,19,'rgba(92,173,210,.6)'); ctx.restore();
    for(let i=0;i<3;i++) pxLine(ctx,39+i*17,82+Math.sin(e/240+i),48+i*17,82+Math.sin(e/240+i),'#DDF4FF',.7); },
  tick(a,e,now){ if(now>=(a.next||0)){ play('whoosh',.2); spawn('drop',64+rand(-10,10),chestAt(lastPetPose)-4,rand(-20,20),rand(-30,-14),.5); a.next=now+300; } }};
V['trick:gentle']={dur:3800,
  pose(p,e){ p.dy=0; p.headDy=e>600?1:0; p.eyes=e>900?'closed':'happy'; p.mouth='smile'; p.wag=500; reachPaw(p,1,motionHold(e,400,1200,2800,3450),'offer'); },
  front(e,a,p){ trickHand(p,e,'gentle',700,3150); },
  tick(a,e,now){ if(e>900&&now>=(a.next||0)){ spawn('heart',64+rand(-10,14),48,rand(-3,3),-10,1.3); a.next=now+500; } if(e>1300) once(a,'s',()=>play('pet:sigh',.35)); }};
V['dance:spin']=tripScene('studio',Object.assign({},V['trick:spin'],{start(){ setCaption(`Dance class: a twirl!`); }}));
V['dance:routine']=tripScene('studio',Object.assign({},V['trick:combo'],{start(){ setCaption(`Dance class: the whole routine, with music!`); play('twinkle',.5); }}));
/* Horizontal swimming with a gentle bob and alternating submerged strokes.
   Float depth follows the breed's torso; head clearance is set by sideGeo. */
const POOL_WATER_Y=70;
function swimmingPose(p,e,dx,face=1,surface=POOL_WATER_Y){
  p.body='swim'; p.face=face; p.frame=Math.floor(e/100)%SWIM_FRAMES;
  p.dx=dx; p.headDy=0; p.eyes='happy'; p.mouth='smile'; p.wag=420;
  const g=sideGeo(SIDE[kind()][stageName()],p,STYLES[state.style]);
  p.dy=surface+g.body.ry*.3+Math.sin(e/400)*.3-(PETY+42.5-SIDE_GY+g.body.cy);
}
/* Swimming, with a little life vest */
const vest=(p)=>{ let x=64+p.dx,y=PETY+p.dy+G().collar+4,w=G().bodyRx*1.7,h=7;
  if(isSide(p)){ const b=sideAt(p,g=>g.body.cx,g=>g.body.cy), P=sideGeo(SIDE[kind()][stageName()],p,STYLES[state.style]); x=b.x; y=b.y; w=P.body.rx*1.6; h=P.body.ry*1.7; }
  schoolPanel(ctx,x-w/2,y-h/2,w,h,2.2,'#EB9A50','#985B35'); schoolPanel(ctx,x-w*.4,y-h/2+.6,w*.8,2,1,'#F9BC69');
  [-.22,.22].forEach(s=>{ rect(ctx,x+w*s-.6,y-h/2+1,1.2,h-1.3,'#596E69'); schoolPanel(ctx,x+w*s-1,y,2,1.7,.3,'#F1EBD3','#6B7567'); });
  pxLine(ctx,x-2,y-h/2,x-2,y-h/2-1.5,'#6E7157',.9); pxLine(ctx,x-2,y-h/2-1.5,x+2,y-h/2-1.5,'#6E7157',.9); pxLine(ctx,x+2,y-h/2-1.5,x+2,y-h/2,'#6E7157',.9); };
const waterLine=(e,p)=>{ const y=POOL_WATER_Y;
  ctx.fillStyle='rgba(76,170,188,.5)'; ctx.fillRect(VIEW.x,y,VIEW.w,VIEW.y+VIEW.h-y);
  for(let x=Math.floor(VIEW.x);x<VIEW.x+VIEW.w;x+=1) rect(ctx,x,y+Math.sin(x/5+e/300)*.5,1,.6,'#D5F2DF');
  const b=sideAt(p,g=>g.body.cx,g=>g.body.cy), f=p.face||1, g=sideGeo(SIDE[kind()][stageName()],p,STYLES[state.style]);
  // A spreading wake trails the torso; small ripples sit beside the paddling forelegs.
  for(let i=0;i<3;i++){ const drift=(e/180+i*3)%9, x=b.x-f*(g.body.rx+drift), yy=y+2+i*2+Math.sin(e/250+i)*.5;
    pxLine(ctx,x-f*3,yy,x+f*(2+i),yy,'rgba(221,249,229,.65)',.7); }
  const front=sideAt(p,g=>g.body.cx+g.body.rx*.7,g=>g.body.cy);
  pxLine(ctx,front.x-3,y+2+Math.sin(e/160)*.5,front.x+3,y+2,'#D5F2DF',.7);
};
V['swim:vest']=tripScene('pool',{dur:4200,noShadow:true,undressed:true,start(){ setCaption(`Swimming class! Life vest on, and a gentle paddle for ${nmS()}.`); play('pop',.4); },
  pose(p,e){ swimmingPose(p,e,lerp(-16,8,ease(ph(e,800,3800)))); },
  front(e,a,p){ vest(p); waterLine(e,p); },
  tick(a,e){ if(e>2600) once(a,'s',()=>{ play('splat',.35); setCaption(`Head up, paws paddling. Nice and gentle!`); }); }});
V['swim:paddle']=tripScene('pool',{dur:4600,noShadow:true,undressed:true,start(){ setCaption(`Doggy paddle! ${nmS()} is swimming!`); },
  pose(p,e){ swimmingPose(p,e,p_dx(e)); },
  front(e,a,p){ vest(p); waterLine(e,p); },
  tick(a,e,now){ if(now>=a.next){ play('splat',.25); spawn('drop',64+p_dx(e),72,rand(-20,20),rand(-30,-10),.5); a.next=now+300; } }});
const p_dx=e=>lerp(-35,30,ph(e,0,4200));
V['swim:fetch']=tripScene('pool',{dur:5000,noShadow:true,undressed:true,start(){ setCaption(`Fetch the floating toy!`); },
  pose(p,e){ swimmingPose(p,e,0,e<2600?1:-1); const m=mouthAt({...p,face:1}), reach=94-m.x;
    p.dx=e<2600?lerp(-35,reach,ease(ph(e,0,2400))):lerp(reach,-25,ease(ph(e,2600,4700))); },
  front(e,a,p){ vest(p); if(e<2400) blit(ctx,SPR.duck,90,POOL_WATER_Y-7+Math.sin(e/300)*.3); waterLine(e,p); if(e>=2400){ const m=mouthAt(p); blit(ctx,SPR.duck,m.x-4,m.y-3); } },
  tick(a,e){ if(e>2400) once(a,'g',()=>{ play('squeak',.6); setCaption(`Got it! ${nmS()} swims back with the duck.`); }); if(e>4600) once(a,'h',()=>{ play('happy',.5); burst(5); }); }});
/* Nose work: sniff each hiding spot and find the treat; it also becomes a trick */
function noseDef(){ return {dur:6000,
  init(a){ a.hide=a.hide||'cups'; a.win=Math.floor(Math.random()*3); },
  spots:[36,64,92],
  pose(p,e,a){ const seg=Math.min(a.win,Math.floor(e/1400)), local=e-seg*1400;
    const nose=mouthAt({body:'stand',bow:1,face:1,dx:0,dy:0,headDy:0}), tx=this.spots[seg]-nose.x, from=seg?this.spots[seg-1]-nose.x:0;
    p.dy=0; p.face=1; p.body='stand'; p.frame=0;
    if(e>a.win*1400+1400){ p.dx=this.spots[a.win]-nose.x; p.eyes='happy'; p.mouth='tongue'; p.bow=poseStep(1-ease(ph(e,a.win*1400+2300,a.win*1400+2800))); if(e<a.win*1400+2200){ p.mouth=Math.floor(e/170)%2?'open':'smile'; } return; }
    if(local<600) walkBetween(p,local,0,600,from,tx); else { p.dx=tx; p.bow=poseStep(ease(ph(local,600,950))); p.eyes='closed'; } },
  front(e,a){ const found=e>a.win*1400+1200; this.spots.forEach((x,i)=>{ const lift=found&&i===a.win?-6:0;
      softShadow(ctx,x,86.5,6,1.2,.18);
      if(a.hide==='boxes'){ schoolPanel(ctx,x-5.5,78+lift,11,8,.6,'#C59A68','#8B6747'); rect(ctx,x+.5,78.5+lift,4.5,6.8,'#B58959');
        ctx.beginPath(); ctx.moveTo(x-5.5,78+lift); ctx.lineTo(x-3,75.8+lift); ctx.lineTo(x+7,75.8+lift); ctx.lineTo(x+5.5,78+lift); ctx.closePath(); ctx.fillStyle='#E4C18D'; ctx.fill(); ctx.strokeStyle='#8B6747'; ctx.lineWidth=.5; ctx.stroke();
        pxLine(ctx,x,76.4+lift,x-.6,77.8+lift,'#AE875D',.6); rect(ctx,x-1.6,78+lift,1.8,3,'#E6CA9B'); schoolPaw(ctx,x-2.5,83+lift,.65,'#947048'); }
      else if(a.hide==='cups'){ const c=['#D6917C','#7DA8B9','#CFB36D'][i]; ctx.beginPath(); ctx.moveTo(x-5.2,85+lift); ctx.lineTo(x-3,77+lift); ctx.lineTo(x+3,77+lift); ctx.lineTo(x+5.2,85+lift); ctx.closePath(); ctx.fillStyle=c; ctx.fill(); ctx.strokeStyle=shade(c,-.3); ctx.lineWidth=.7; ctx.stroke();
        pxEll(ctx,x,77+lift,3,.8,shade(c,.22)); pxRing(ctx,x,77+lift,2.7,.6,.4,shade(c,-.15)); pxEll(ctx,x,85+lift,5.2,1,shade(c,-.15)); pxLine(ctx,x-2.6,79+lift,x-3.8,83.5+lift,shade(c,.25),.7); }
      else { const c=['#DCA68F','#96B4C2','#BAC68E'][i]; schoolPanel(ctx,x-6,79+lift,12,7,2.4,c,shade(c,-.27)); schoolPanel(ctx,x-4.8,80+lift,9.6,4.6,1.5,c,shade(c,.22));
        [[-4,-1],[4,-1],[-4,3],[4,3]].forEach(([dx,dy])=>pxLine(ctx,x+dx,81+dy+lift,x+dx*.7,82+dy*.5+lift,shade(c,-.18),.5)); }
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
