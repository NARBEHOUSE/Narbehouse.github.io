'use strict';
/* ================= Animation: every action, moment and event =================
   Each variant can draw a scene, draw behind or in front of the pet, clip the pet (boxes, tubs),
   change its pose and fire timed events. Times are in ms from the start of the variant. */
const PETX=42, PETY=43;
let paused=false, pausedAt=0, pauseOffset=0;
const clock=()=>(paused?pausedAt:performance.now())-pauseOffset;
let anim=null, parts=[], lastWant=null, lastAsk=0, quietUntil=0;
const lastVariant={};
const skey=()=>kind()+':'+stageName();
const G=()=>GEO[skey()];
const big=()=>stageName()!=='baby';
/* Side poses (walking, running, standing, lying) put the mouth and neck in different places. */
const sideAt=(p,fx,fy)=>{ const P=SIDE[kind()][stageName()], Gs=sideGeo(P,p,STYLES[state.style]), f=p.face||1, gx=PETX+22+p.dx, gy=PETY+42.5+p.dy, pt=fx(Gs,P), qy=fy(Gs,P); return {x:gx+(pt-SIDE_GX)*f,y:gy+qy-SIDE_GY}; };
const isSide=p=>!!(p.body&&p.body!=='sit');
const mouthAt=p=>isSide(p)?sideAt(p,Gs=>Gs.head.x+Gs.sn.dx+Gs.sn.rx-1,Gs=>Gs.head.y+Gs.sn.dy+1):{x:PETX+22+(G().faceDx||0)+p.dx,y:PETY+G().mouth+p.dy+p.headDy};
const neckAt=p=>isSide(p)?sideAt(p,Gs=>Gs.head.x-Gs.head.rx*.45,Gs=>Gs.head.y+Gs.head.ry*.6):{x:PETX+22+p.dx,y:PETY+p.dy+G().collar};
const headTopOf=p=>PETY+G().top+p.dy;
const collarAt=p=>PETY+p.dy+G().collar;
const chestAt=p=>PETY+p.dy+G().chest;
const arc=(t,h)=>-Math.sin(clamp(t,0,1)*Math.PI)*h;
const ph=(e,a,b)=>clamp((e-a)/(b-a),0,1);
const slide=(e,dur,inMs,outMs,off)=>e<inMs?lerp(off,0,e/inMs):e>dur-outMs?lerp(0,off,ph(e,dur-outMs,dur)):0;
const petNoise=()=>kind()==='dog'?'pet:bark':'pet:meow';
const happyNoise=()=>kind()==='dog'?'pet:barkHappy':'pet:trill';
/* Saying hello (to you, to friends, to visitors): a dog's friendly bark, a cat's meow. */
const friendlyNoise=()=>kind()==='dog'?'pet:barkFriendly':'pet:meow';
const sadNoise=()=>kind()==='dog'?'pet:whimper':'pet:meowSad';
function startAnim(key,dur,onEnd,extra){ const now=clock(); anim=Object.assign({key,type:key.split(':')[0],start:now,dur,onEnd,next:now,next2:now,k:-1,flags:{}},extra||{}); const d=V[key]; if(d&&d.init) d.init(anim); }
function spawn(kd,x,y,vx,vy,life,color){ parts.push({kind:kd,x,y,vx,vy,life,age:0,color}); }
function burst(n){ for(let i=0;i<(n||7);i++) spawn(Math.random()<.5?'sparkle':'sparkleSmall',64+rand(-24,24),rand(44,80),rand(-5,5),rand(-12,-4),rand(.7,1.2)); play('sparkle',.5); }
function crumbs(x,y,c){ for(let i=0;i<2;i++) spawn('crumb',x+rand(-5,5),y,rand(-24,24),rand(-40,-18),.6,c||'#8A5528'); }
function once(a,key,fn){ if(!a.flags[key]){ a.flags[key]=true; fn(); } }
function fadeOverlay(e,dur,c){ const f=Math.max(0,1-Math.min(e,dur-e)/350); if(f>0){ ctx.fillStyle=`rgba(${c||'255,247,230'},${f.toFixed(3)})`; fillView(ctx); } }

/* ---- Props drawn during scenes ---- */
function drawRope(x0,y0,x1,y1){ const n=Math.max(1,Math.round(Math.abs(x1-x0)*2));
  for(let i=0;i<=n;i++){ const x=lerp(x0,x1,i/n), y=lerp(y0,y1,i/n)+Math.sin(i/12)*.6; rect(ctx,x,y-1.8,.5,.5,'#5A3A20'); rect(ctx,x,y+1.8,.5,.5,'#5A3A20');
    for(let r=-1.5;r<=1.5;r+=.5) rect(ctx,x,y+r,.5,.5,((i+r*2+80)%8<4)?'#F0DFB8':'#C49A5E'); }
  const kx=lerp(x0,x1,.7), ky=lerp(y0,y1,.7); pxEll(ctx,kx,ky,3.5,3.2,'#5A3A20'); pxEll(ctx,kx,ky,2.8,2.5,'#E3C58E'); pxEll(ctx,kx-.8,ky-.8,.8,.6,'#FFF3D6'); }
function drawLeash(x0,y0,x1,y1,c,d,sag){ sag=sag==null?12:sag; const sw=sag>3&&!reduceMotion?Math.sin(performance.now()/520)*1.4:0, mx=(x0+x1)/2+sw, my=(y0+y1)/2+sag;
  const pts=[]; for(let i=0;i<=18;i++){ const t=i/18, u=1-t; pts.push([u*u*x0+2*u*t*mx+t*t*x1,u*u*y0+2*u*t*my+t*t*y1]); }
  for(let i=1;i<pts.length;i++) pxLine(ctx,pts[i-1][0],pts[i-1][1]+.5,pts[i][0],pts[i][1]+.5,d,1.4);
  for(let i=1;i<pts.length;i++) pxLine(ctx,pts[i-1][0],pts[i-1][1],pts[i][0],pts[i][1],c,.9); }
function drawStick(x,y,sc){ const c=sc==='beach'?'#C9B08A':'#8A5A34', d=sc==='beach'?'#9A8260':'#5A3A20'; rect(ctx,x,y,16,2,c); rect(ctx,x+11,y-2,1,2,c); rect(ctx,x+4,y-1,1,1,c); rect(ctx,x,y+2,16,.5,d); rect(ctx,x,y,16,.5,shade(c,.12)); }
function drawBlanket(top){ const x0=40,x1=88; for(let y=top;y<96;y++) for(let x=x0;x<x1;x+=4){ rect(ctx,x,y,4,1,((Math.floor((y-top)/4)+Math.floor((x-x0)/4))%2)?'#F2A7B5':'#FFF1C9'); }
  rect(ctx,x0,top,x1-x0,1,'#C9738A'); rect(ctx,x0,top,1,96-top,'#C9738A'); rect(ctx,x1-1,top,1,96-top,'#C9738A'); for(let x=x0+2;x<x1;x+=4) rect(ctx,x,top+1,1,1,'#FFFFFF'); }
function drawTub(y,e){
  rect(ctx,40,y,48,3,'#9FD8F0'); rect(ctx,38,y+2,52,3,'#FFFFFF'); rect(ctx,38,y+2,52,.5,'#6A7A8A');
  vgrad(ctx,40,y+5,48,14,[[0,'#FFFFFF'],[1,'#DDE6EE']]); rect(ctx,39,y+5,1,14,'#6A7A8A'); rect(ctx,88,y+5,1,14,'#6A7A8A'); rect(ctx,40,y+19,48,1,'#6A7A8A'); rect(ctx,43,y+7,2,8,'rgba(255,255,255,.8)');
  rect(ctx,42,y+20,3,2,'#E0B84A'); rect(ctx,83,y+20,3,2,'#E0B84A');
  [[44,y],[51,y-1],[80,y-1],[85,y]].forEach(b=>blit(ctx,SPR.bubble3,b[0]-4,b[1]-4));
  blit(ctx,SPR.duck,Math.round(72+Math.sin(e/400)*6),y-7+(Math.floor(e/300)%2)); }
function drawCatTree(o,e,bat){
  rect(ctx,44,84+o,40,4,'#9A7AB0'); rect(ctx,44,88+o,40,1,'#6A4A80');
  rect(ctx,60,60+o,8,24,'#D8C090'); for(let y=61;y<84;y+=2) rect(ctx,60,y+o,8,.5,'#B89A60'); rect(ctx,59,60+o,1,24,'#8A6A40'); rect(ctx,68,60+o,1,24,'#8A6A40');
  rect(ctx,46,56+o,36,5,'#9A7AB0'); rect(ctx,46,56+o,36,.5,'#B89AD0'); rect(ctx,46,61+o,36,1,'#6A4A80');
  const sw=Math.sin(e/220)*(bat?4:1.5); pxLine(ctx,80,62+o,80+sw,71+o,'#F4E4C8',.5); pxEll(ctx,80+sw,73+o,2.2,2.2,'#F2A7B5'); }
function drawBoxBack(x,y){ rect(ctx,x+2,y+3,40,3,'#6A4A2A'); rect(ctx,x+2,y+2,40,1,'#5A3C22'); }
function drawBoxFront(x,y){
  for(let r=0;r<6;r++){ rect(ctx,x-5+r,y+r,9,1,'#DDB27A'); rect(ctx,x+40-r,y+r,9,1,'#DDB27A'); }
  rect(ctx,x,y+6,44,16,'#C99A62'); rect(ctx,x+1,y+18,42,3,'#B8884F'); rect(ctx,x+19,y+7,6,6,'#E9D6B0'); rect(ctx,x+1,y+7,42,.5,'#DDB27A');
  rect(ctx,x,y+6,44,1,'#6A4A2A'); rect(ctx,x,y+21,44,1,'#6A4A2A'); rect(ctx,x,y+6,1,16,'#6A4A2A'); rect(ctx,x+43,y+6,1,16,'#6A4A2A'); }
function drawBag(x,y){ rect(ctx,x-1,y+3,44,22,INK); rect(ctx,x,y+4,42,20,'#C9A06A'); for(let i=0;i<42;i+=3) rect(ctx,x+i,y+3-(i%2),3,2,'#E0C08A'); rect(ctx,x+12,y+6,1,17,'#A8804E'); rect(ctx,x+29,y+6,1,17,'#A8804E'); rect(ctx,x,y+20,42,4,'#B88E58'); }
function drawWindowRain(e){ const w=WIN(); ctx.save(); ctx.beginPath(); ctx.rect(w.x,w.y,w.w,w.h); ctx.clip(); ctx.fillStyle='rgba(40,50,80,0.5)'; ctx.fillRect(w.x,w.y,w.w,w.h);
  for(let i=0;i<16;i++){ const x=w.x+((i*7+Math.floor(e*.02))%(w.w+4))-2, y=w.y+((i*11+Math.floor(e*.09))%(w.h+4))-3; rect(ctx,x,y,.5,3,'#BFD6F0'); } ctx.restore(); }
function drawGift(x,y,lid,box){ const C=box==='blue'?['#5A8FC4','#3E6FA4','#7FA8D8']:['#D9577A','#B8405E','#E8708E']; rect(ctx,x-1,y-1,22,15,INK); rect(ctx,x,y,20,13,C[0]); rect(ctx,x,y,20,1,C[2]); rect(ctx,x,y+10,20,3,C[1]); rect(ctx,x+8,y,4,13,'#F4C96A');
  if(lid!=null){ const ly=y-5-lid; rect(ctx,x-2,ly-1,24,6,INK); rect(ctx,x-1,ly,22,4,C[2]); rect(ctx,x+8,ly,4,4,'#F4C96A'); pxEll(ctx,x+7,ly-2,2.6,1.8,'#F4C96A'); pxEll(ctx,x+13,ly-2,2.6,1.8,'#F4C96A'); } }
function drawPainting(x,y){ rect(ctx,x-1,y-1,20,16,INK); rect(ctx,x,y,18,14,'#FFFDF6'); [[3,3,'#F07A8E'],[10,5,'#5A8FC4'],[5,9,'#F4C542'],[13,10,'#7FB08C']].forEach(([px,py,c])=>{ pxEll(ctx,x+px+1,y+py+1,1.4,1.1,c); pxEll(ctx,x+px-.5,y+py-.5,.8,.8,c); pxEll(ctx,x+px+2.5,y+py-.5,.8,.8,c); }); }
function drawPostcard(x,y,style){ rect(ctx,x-1,y-1,24,17,INK); rect(ctx,x,y,22,15,'#FFF7E6'); rect(ctx,x+15,y+2,5,6,'#D9577A'); rect(ctx,x+16,y+3,3,4,'#FFE9F0'); rect(ctx,x+11,y+1,.5,13,'#D2C4A2');
  for(let i=0;i<3;i++) rect(ctx,x+13,y+9+i*2,7,.5,'#B8A88A'); pxEll(ctx,x+5.5,y+7,3.6,3.2,(STYLES[style]||STYLES.cream).pal.fur); rect(ctx,x+4,y+6,.5,.5,INK); rect(ctx,x+6.5,y+6,.5,.5,INK); rect(ctx,x+5,y+8,1,.5,'#F07A8E'); }
function drawFlower(x,y){ rect(ctx,x,y,.8,8,'#4F7A5D'); rect(ctx,x+1,y+4,2,.8,'#6E9B7B'); pxEll(ctx,x+.5,y,3,3,INK); pxEll(ctx,x+.5,y,2.4,2.4,'#F07A8E'); pxEll(ctx,x+.5,y,1,1,'#F4C542'); }
function drawRibbon(x,y){ pxEll(ctx,x,y,5,5,INK); pxEll(ctx,x,y,4,4,'#5A8FC4'); pxEll(ctx,x,y,2,2,'#F4C542'); rect(ctx,x-3,y+4,2,6,'#5A8FC4'); rect(ctx,x+1,y+4,2,6,'#5A8FC4'); rect(ctx,x-3,y+10,2,1,INK); rect(ctx,x+1,y+10,2,1,INK); }
function drawMud(p){ const g=G(); [[-g.bodyRx*.45,g.chest+1.5,2.2,1.6],[g.bodyRx*.5,g.chest-1,2,1.5],[0,g.chest+g.bodyRy*.6,2.6,1.2],[-g.pawDx,g.pawY,1.6,1],[g.pawDx,g.pawY,1.6,1],[g.headRx*.45,g.headCy-g.headRy*.45+p.headDy,1.6,1.2],[-g.headRx*.8,g.headCy+1+p.headDy,1.4,1.8]]
  .forEach(([dx,y,rx,ry])=>{ pxEll(ctx,PETX+22+dx+p.dx,PETY+y+p.dy,rx,ry,'#6B4A2B'); pxEll(ctx,PETX+22+dx+p.dx-.5,PETY+y+p.dy-.4,rx*.5,ry*.5,'#8A6440'); }); }
const LUMPS=[[8,81],[14,82],[21,81]];
/* How far the pet walks so its mouth reaches the water bowl, wherever the room put it. */
const toWater=()=>{ const m=mouthAt({body:'stand',face:1,frame:0,dx:0,dy:0,headDy:3}); return Math.round(STATION.water[0]+7-m.x); };
function drawLumps(n){ LUMPS.slice(0,n).forEach(([x,y])=>{ pxEll(ctx,x,y,2,1.3,'#8A7A5A'); pxEll(ctx,x-.6,y-.5,.8,.5,'#A89A78'); }); }
const TOY_SPOTS=[['sock',30,84],['duck',108,74],['bone',46,86],['ball',76,86]];
function drawToys(skip){ TOY_SPOTS.forEach(([t,x,y],i)=>{ if(i>=skip) blit(ctx,SPR[t],x,y); }); }
const PLANT_TIPPED=sprite(30,14,b=>{ part(b,T=>{ R(T,17,3,11,9,'#D8765A',SH,.8); R(T,27,2,2.4,11,'#B85E45',SH,.4); });
  part(b,T=>{ plantLeaf(T,18,7.5,4,1.4,1.6,'#4F7A5D'); plantLeaf(T,18,7.5,3,12.4,1.6,'#4F7A5D'); });
  part(b,T=>{ plantLeaf(T,18,7.5,.8,7,2,'#6E9B7B'); plantLeaf(T,18,7.5,8,2.4,1.5,'#86B592'); plantLeaf(T,18,7.5,7.4,12,1.5,'#86B592'); }); });
function drawPlantTipped(pa,dirt){ const x=pa.x-12, y=pa.y+17; if(dirt!==0){ const k=dirt==null?1:dirt; pxEll(ctx,x+6,y+13,8*k+1,2.5*k+.5,'#6B4A2B'); pxEll(ctx,x+4,y+12,4*k+.5,1.2*k+.3,'#8A6440'); } blit(ctx,PLANT_TIPPED,x,y); }
const waterBowl=empty=>(decorOn('bowl')?WBOWL_FANCY:WBOWL)[empty?1:0];

const V={};
V['hello:0']={dur:1800,pose(p,e){ p.eyes='happy'; p.mouth=e<600?'open':'tongue'; p.dy=e<1400?-Math.round(Math.abs(Math.sin(e/160))*3):0; },
  tick(a,e,now){ if(e<1500&&now>=a.next){ spawn('heart',64+rand(-12,12),54,rand(-6,6),-18,1.5); a.next=now+320; } }};
V['grow:0']={dur:2800,pose(p,e){ p.eyes=e<1150?'closed':'happy'; p.mouth=e<1150?'smile':'open'; p.dy=(e>1300&&e<2200)?-Math.round(Math.abs(Math.sin((e-1300)/150))*3):0; },
  overlay(e){ const f=e<850?0:e<1150?(e-850)/300:e<1750?1-(e-1150)/600:0; if(f>0){ ctx.fillStyle=`rgba(255,250,235,${f.toFixed(3)})`; fillView(ctx); } },
  tick(a,e,now){ if(e<1100&&now>=a.next){ const ang=e/120; spawn('sparkleSmall',64+Math.cos(ang)*20,66+Math.sin(ang)*14,0,-4,.6); a.next=now+70; }
    if(e>1150) once(a,'switch',()=>{ state.stage=Math.min(3,(state.stage||0)+1); save(); refreshMenu(); warmVoices(kind(),stageName()); }); if(e>1200) once(a,'fan',()=>{ play('fanfare',.7); burst(12); }); if(e>1900) once(a,'noise',()=>play(happyNoise())); }};

/* ---- Feed ---- */
V['feed:bowl']={dur:2900,
  pose(p,e){ if(e>400&&e<2400){ const bob=Math.floor(e/220)%2; p.headDy=bob?2:1; p.eyes='closed'; p.mouth=bob?'open':'smile'; p.dy=0; } else if(e>=2400){ p.eyes='happy'; p.mouth='tongue'; } },
  front(e){ const [sx,sy]=STATION.feed, k=e<400?e/400:e>2500?1-ph(e,2500,2900):1; blit(ctx,(decorOn('bowl')?BOWLS_FANCY:BOWLS)[e<1100?0:e<1900?1:2],lerp(sx,57,k),lerp(sy,80,k)); },
  tick(a,e,now){ if(e>400&&e<2400&&now>=a.next){ crumbs(64,80); play('crunch',.6); a.next=now+440; } }};
function catchDef(sprite){ return {dur:3000,
  pose(p,e){ const flying=e<900||(e>1400&&e<2300); if(flying){ p.eyes='open'; p.mouth='open'; p.headDy=-1; }
    if(Math.abs(e-900)<180||Math.abs(e-2300)<180) p.dy=-3;
    if((e>900&&e<1400)||(e>2300&&e<2800)){ const bob=Math.floor(e/170)%2; p.headDy=bob; p.eyes='closed'; p.mouth=bob?'open':'smile'; }
    if(e>=2800){ p.eyes='happy'; p.mouth='tongue'; } },
  front(e,a,p){ [[0,900],[1400,2300]].forEach(([s,t])=>{ if(e>=s&&e<t){ const k=(e-s)/(t-s), m=mouthAt(p), sp=SPR[sprite];
    blit(ctx,sp,lerp(132,m.x,k)-sp.lw/2,lerp(26,m.y,k)+arc(k,24)-sp.lh/2); } }); },
  tick(a,e){ if(e>900) once(a,'c1',()=>{ play('crunch',.7); crumbs(64,70); }); if(e>2300) once(a,'c2',()=>{ play('crunch',.7); crumbs(64,70); }); if(e>2800) once(a,'n',()=>play(happyNoise(),.5)); }}; }
V['feed:treat']=catchDef('bone'); V['feed:fish']=catchDef('fish');
V['feed:bone']={dur:3000,
  pose(p,e){ if(e>300&&e<2600){ const bob=Math.floor(e/260)%2; p.headDy=1+bob; p.eyes=bob?'closed':'happy'; p.mouth=bob?'open':'smile'; p.dy=0; } else if(e>=2600){ p.eyes='happy'; p.mouth='tongue'; } },
  front(e){ const s=SPR.boneBig; blit(ctx,s,64-s.lw/2,e<300?lerp(96,79,e/300):79); },
  tick(a,e,now){ if(e>300&&e<2600&&now>=a.next){ crumbs(64,80,'#E8D8BC'); if(Math.random()<.6) play('crunch',.5); a.next=now+520; } }};
V['feed:milk']={dur:3000,
  pose(p,e){ if(e>350&&e<2500){ p.headDy=2; p.dy=0; p.eyes='closed'; p.mouth=Math.floor(e/180)%2?'tongue':'smile'; } else if(e>=2500){ p.eyes='happy'; p.mouth='tongue'; } },
  front(e){ blit(ctx,SPR.saucer,55,e<350?lerp(96,82,e/350):82); },
  tick(a,e,now){ if(e>350&&e<2500&&now>=a.next){ spawn('crumb',64+rand(-3,3),82,rand(-10,10),rand(-20,-8),.4,'#FFFFFF'); play('lap',.35); a.next=now+360; } if(e>2600) once(a,'p',()=>play('pet:purrShort',.45)); }};

/* ---- Play ---- */
V['play:ball']={dur:3000,
  pose(p,e){ p.eyes='happy'; p.mouth='tongue'; p.ear=Math.floor(e/180)%2; p.dy=-Math.round(Math.abs(Math.sin(e/180))*4); },
  front(e){ blit(ctx,kind()==='dog'?SPR.ball:SPR.yarn,Math.round(64+Math.sin(e/600)*26)-4,Math.round(76-Math.abs(Math.sin(e/180))*18)); },
  tick(a,e){ const k=Math.floor(e/(180*Math.PI)); if(k!==a.k){ a.k=k; play('bounce',.5); if(k===2) play(happyNoise()); } }};
V['play:yarn']=V['play:ball'];
V['play:tug']={dur:3200,
  pose(p,e){ p.eyes='happy'; p.mouth='open'; p.dx=Math.round(Math.sin(e/200)*2.5); p.dy=0; p.ear=p.dx>0?1:0; },
  front(e,a,p){ const m=mouthAt(p); drawRope(m.x+3,m.y+2,130,m.y+6+Math.round(Math.sin(e/200))); pxEll(ctx,m.x,m.y+2,4.2,3.4,'#5A3A20'); pxEll(ctx,m.x,m.y+2,3.4,2.6,'#E3C58E'); pxEll(ctx,m.x-.8,m.y+1.2,.8,.6,'#FFF3D6'); },
  tick(a,e){ if(e>300) once(a,'g1',()=>play('pet:growl',.5)); if(e>1900) once(a,'g2',()=>play('pet:growl',.45)); if(e>2900) once(a,'w',()=>play(happyNoise(),.5)); }};
V['play:squeak']={dur:3200,
  duck(e){ if(e<900){ const k=e/900; return {x:lerp(130,76,k),y:lerp(30,82,k)+arc(k,20)}; } if(e<1900) return {x:76,y:82+(Math.floor(e/120)%2)}; const k=ph(e,1900,2600); return {x:lerp(76,90,k),y:82+arc(k,14)}; },
  pose(p,e){ p.eyes='open';
    if(e>900&&e<1300){ const k=ph(e,900,1300); p.dy=Math.round(arc(k,6)); p.dx=Math.round(lerp(0,4,k)); p.eyes='happy'; }
    else if(e>=1300&&e<1900){ p.dx=4; p.headDy=Math.floor(e/150)%2+1; p.eyes='happy'; p.mouth='open'; }
    else if(e>=1900){ p.dx=Math.round(lerp(4,0,ph(e,1900,2400))); p.eyes='happy'; p.mouth='tongue'; } },
  front(e){ const d=this.duck(e); blit(ctx,SPR.duck,d.x-5,d.y-8); },
  tick(a,e){ [1350,1650,2000,2650].forEach((t,i)=>{ if(e>t) once(a,'s'+i,()=>{ play('squeak',.6); spawn('sparkleSmall',80,70,0,-10,.5); }); }); if(e>2700) once(a,'b',()=>play(petNoise(),.45)); }};
V['play:wand']={dur:3400,
  pos(e){ const hx=76+Math.sin(e/420)*18, hy=28+Math.sin(e/310)*6; return {hx,hy,fx:hx+Math.sin(e/230)*3,fy:hy+20+Math.max(0,Math.sin(e/350))*14}; },
  pose(p,e){ const w=this.pos(e); p.eyes='open'; p.dx=Math.round(clamp((w.fx-64)/6,-4,4)); const reach=w.fy>52; p.dy=reach?-Math.round((w.fy-52)/3):0; p.ear=reach?1:0; if(reach){ p.mouth='open'; p.eyes='happy'; } },
  front(e){ const w=this.pos(e); pxLine(ctx,127,0,w.hx,w.hy,'#8A5A34',1); pxLine(ctx,w.hx,w.hy,w.fx,w.fy,'#F4E4C8',.5); blit(ctx,SPR.feather,w.fx-4,w.fy); },
  tick(a,e,now){ if(now>=a.next&&this.pos(e).fy>58){ play('bounce',.35); a.next=now+600; } if(e>1700) once(a,'m',()=>play('pet:trill',.5)); }};
V['play:laser']={dur:3400,
  dot(e){ return {x:64+Math.sin(e/380)*34+Math.sin(e/97)*5,y:85+Math.sin(e/210)*4}; },
  pose(p,e){ const d=this.dot(e); p.eyes='open'; p.dx=Math.round(clamp((d.x-64)/5,-6,6)); const t=e%700, pounce=Math.floor(e/700)%2===1&&t<300;
    if(pounce){ p.dy=Math.round(arc(t/300,5)); p.eyes='happy'; p.mouth='open'; } p.ear=pounce?1:0; },
  front(e){ const d=this.dot(e); glow(ctx,d.x,d.y,4,'#FF3050',.45); rect(ctx,d.x-1,d.y-.5,2,1,'#FF3050'); rect(ctx,d.x-.5,d.y-.5,.5,.5,'#FFD0D8'); },
  tick(a,e){ const k=Math.floor((e+700)/1400); if(k!==a.k){ a.k=k; if(k>0) play('bounce',.4); } if(e>2800) once(a,'c',()=>play('pet:chatter',.45)); }};

/* ---- Walk (dogs): 4 places, and a random thing happens on each walk ---- */
const WALK_EVENTS={
  park:[['flyer',2],['critter',3],['chase',3],['friend',3],['stick',2],['ball',2],['birds',2],['neighbor',2],['puddle',2]],
  woods:[['flyer',2],['critter',3],['chase',3],['friend',2],['stick',3],['birds',2],['puddle',2]],
  beach:[['flyer',2],['critter',3],['friend',2],['stick',2],['ball',2],['wave',3],['neighbor',2]]
};
let lastWalkEvent=null;
const WALK_EVENT_MSG={
  flyer:(n,s)=>s==='beach'?'A seagull flies by.':'Look, a butterfly!',
  critter:(n,s)=>s==='beach'?'A little crab says hi!':s==='park'?'A bunny hops across the path!':`A squirrel scurries past ${n}.`,
  chase:n=>`A squirrel! ${n} wants to chase it!`,
  friend:n=>`${n} made a new friend!`, stick:(n,s)=>s==='beach'?`${n} found some driftwood!`:`${n} found a stick!`,
  ball:n=>`${n} found a lost tennis ball!`, birds:n=>`A flock of birds flutters up. ${n} is so excited!`,
  neighbor:n=>`A friendly neighbor says hi and gives ${n} a treat.`, puddle:n=>`${n} hops right over a puddle!`, wave:n=>`Splash! A wave tickles ${n}'s paws.`
};
function walkDef(scene){ return {dur:6800,
  init(a){ const list=WALK_EVENTS[scene].filter(([id])=>id!==lastWalkEvent); a.event=weightedPick(list); lastWalkEvent=a.event; a.nb=maybeNeighbor('dog',.5); a.friend=a.nb?a.nb.style:pick(KIND_STYLES.dog.filter(s=>s!==state.style)); },
  scene(e){ drawWalkScene(scene,e); },
  pose(p,e,a){ p.eyes='happy'; p.mouth='tongue'; p.ear=Math.floor(e/150)%2; p.dy=0; p.wag=100; p.body='walk'; p.face=1; p.frame=Math.floor(e/140)%4; const ev=a.event;
    if(e>2000&&e<4400&&(ev==='flyer'||ev==='critter')) p.eyes='open';
    if(ev==='chase'&&e>2000&&e<3900){ p.eyes='open'; const t=(e-2000)%500; p.mouth=t<200?'open':'smile'; p.dx=Math.round(lerp(0,6,ph(e,2000,2400))); p.dy=-(Math.floor(e/110)%2)*2; }
    if(ev==='chase'&&e>=3900) p.dx=Math.round(lerp(6,0,ph(e,3900,4400)));
    if((ev==='stick'||ev==='ball')&&e>3200) p.mouth='smile';
    if(ev==='birds'&&e>3000&&e<3600){ p.dy=Math.round(arc(ph(e,3000,3600),5)); p.eyes='open'; p.mouth='open'; }
    if(ev==='puddle'&&e>2850&&e<3350) p.dy=Math.round(arc(ph(e,2850,3350),9));
    if(ev==='wave'&&e>2500&&e<3000){ p.dy=Math.round(arc(ph(e,2500,3000),7)); p.dx=-4; p.eyes='closed'; p.mouth='open'; }
    if(ev==='neighbor'&&e>2600&&e<3000){ p.headDy=-1; p.mouth='open'; p.eyes='open'; }
    if(ev==='neighbor'&&e>3000&&e<3700){ const b=Math.floor(e/170)%2; p.headDy=b; p.mouth=b?'open':'smile'; p.eyes='closed'; }
    if(ev==='chase'&&e>2000&&e<3900){ p.body='run'; p.face=1; p.frame=Math.floor(e/90)%4; p.dy=0; } if(ev==='neighbor'&&e>2600&&e<3700) p.body='stand'; if(ev==='wave'&&e>2500&&e<3000) p.body='stand'; },
  behind(e,a,p){ const nk=neckAt(p), taut=a.event==='chase'&&e>2000&&e<3900; drawLeash(nk.x,nk.y,VIEW.x+VIEW.w+3,nk.y-(taut?18:28),'#D9577A','#8E2A48',taut?2:13);
    if(a.event==='friend'&&e>2000&&e<4700){ const k=ph(e,2000,4700), fx=Math.round(lerp(VIEW.x+VIEW.w+4,VIEW.x-48,k)), fy=PETY-9; const fp={body:'walk',face:-1,frame:Math.floor(e/140+1)%4,eyes:'happy',mouth:'tongue',tail:Math.floor(e/120)%3}; drawLeash(fx+13,fy+27,fx+30,-2,'#5A8FC4','#2F5A78',8); drawPetPose(ctx,a.friend,a.nb?a.nb.sg:'baby',fp,a.nb?a.nb.fit:null,fx,fy); }
    if(a.event==='puddle'&&e>1800&&e<4600){ const x=lerp(150,-40,ph(e,1800,4600)); pxEll(ctx,x,87,13,2.8,'#5A8FC4'); pxEll(ctx,x-2,86.5,8,1.4,'#9FD8F0'); }
    if(a.event==='wave'&&e>2000&&e<3600){ const k=e<2800?ph(e,2000,2800):1-ph(e,2800,3600), y=60+k*26; ctx.fillStyle='rgba(159,216,240,0.6)'; ctx.fillRect(VIEW.x,60,VIEW.w,y-60); for(let x=Math.floor(VIEW.x);x<VIEW.x+VIEW.w;x+=1) rect(ctx,x,y+Math.sin(x/4+e/200),1,1,'#FFFFFF'); } },
  front(e,a,p){ const ev=a.event;
    if(ev==='critter'&&e>2000&&e<4400){ const k=ph(e,2000,4400);
      if(scene==='beach') blit(ctx,SPR.crab,lerp(-14,140,k),86-(Math.floor(e/160)%2));
      else if(scene==='park') blit(ctx,SPR.rabbit,lerp(-14,140,k),79+arc((e/300)%1,5));
      else blit(ctx,SPR.squirrel,lerp(-14,140,k),78-(Math.floor(e/90)%2)*2); }
    if(ev==='chase'&&e>2000&&e<4700){ const x=e<2900?lerp(-14,98,ph(e,2000,2900)):e<3800?98:lerp(98,140,ph(e,3800,4600)); blit(ctx,SPR.squirrel,x,e>2900&&e<3800?76-(Math.floor(e/250)%2):78-(Math.floor(e/90)%2)*2); }
    if(ev==='flyer'&&e>2000&&e<4600){ const k=ph(e,2000,4600); if(scene==='beach') blit(ctx,Math.floor(e/220)%2?SPR.gull:SPR.gull2,lerp(130,-10,k),22+Math.sin(e/300)*4);
      else blit(ctx,Math.floor(e/120)%2?SPR.fly1:SPR.fly2,lerp(112,34,k),44+Math.sin(e/200)*6); }
    if(ev==='stick'||ev==='ball'){ const draw=(x,y)=>ev==='stick'?drawStick(x,y,scene):blit(ctx,SPR.ball,x,y-6); if(e>1800&&e<3200) draw(Math.round(lerp(140,58,ph(e,1800,3200))),88); else if(e>=3200){ const m=mouthAt(p); ev==='stick'?drawStick(m.x-8,m.y,scene):blit(ctx,SPR.ball,m.x-5,m.y-2); } }
    if(ev==='birds'&&e>1800&&e<4600){ for(let i=0;i<4;i++){ let x=lerp(150,72,ph(e,1800,3000))+i*9, y=82+(i%2)*3; if(e>3000){ const t=(e-3000)/1000; x+=t*(i-1.5)*20; y-=t*50; } blit(ctx,e>3000?(Math.floor(e/100+i)%2?SPR.gull:SPR.gull2):SPR.bird,x,y); } }
    if(ev==='neighbor'&&e>2000&&e<3900){ const m=mouthAt(p), hy=e<2700?lerp(-24,m.y-22,ph(e,2000,2700)):e<3300?m.y-22:lerp(m.y-22,-24,ph(e,3300,3900)); blit(ctx,SPR.hand,m.x+7,hy); if(e<2900) blit(ctx,SPR.bone,m.x+3,hy+18); } },
  overlay(e,a){ const f=Math.max(0,1-Math.min(e,a.dur-e)/350); if(f>0){ ctx.fillStyle=`rgba(255,247,230,${f.toFixed(3)})`; fillView(ctx); } },
  tick(a,e,now){ const ev=a.event, at=(ev==='stick'||ev==='ball')?3200:ev==='puddle'?2800:2000;
    if(e>at) once(a,'ev',()=>{ setCaption(ev==='friend'&&a.nb?`${state.name} says hi to ${a.nb.name} from down the street!`:WALK_EVENT_MSG[ev](state.name,scene));
      if(ev==='flyer') play('chirp',.5); else if(ev==='critter'){ play(petNoise()); later(()=>play('chirp',.4),300); }
      else if(ev==='chase') play('pet:bark',.6); else if(ev==='friend'){ play(friendHello(a.nb||{kind:'dog',sg:'baby'}),.5); later(()=>play(friendlyNoise()),450); for(let i=0;i<4;i++) spawn('heart',rand(50,90),52,rand(-6,6),-16,1.4); }
      else if(ev==='birds') play('chirp',.5); else if(ev==='wave') play('splat',.5); else if(ev==='neighbor') play('happy',.5);
      else { play('happy',.5); spawn('sparkle',64,70,0,-8,.8); } });
    if(ev==='chase'){ [2500,3000,3400].forEach((t,i)=>{ if(e>t) once(a,'b'+i,()=>{ play('pet:bark',.5); spawn('exclaim',74,headTopOf({dy:0}),2,-10,.6); }); }); if(e>3900) once(a,'g',()=>setCaption(`The squirrel scampered up a tree. Maybe next time, ${state.name}!`)); }
    if(ev==='birds'&&e>3000) once(a,'fl',()=>{ play('chirp',.5); play('rustle',.3); });
    if(ev==='puddle'&&e>3300) once(a,'sp',()=>{ for(let i=0;i<5;i++) spawn('drop',64+rand(-10,10),86,rand(-30,30),rand(-40,-20),.6); });
    if(ev==='wave'&&e>2700) once(a,'sp',()=>{ for(let i=0;i<6;i++) spawn('drop',64+rand(-14,14),84,rand(-30,30),rand(-40,-20),.6); });
    if(ev==='neighbor'&&e>2950) once(a,'c',()=>{ play('crunch',.6); crumbs(64,72); });
    if(!a.stepT||now-a.stepT>300){ a.stepT=now; play('step',.2); }
    if(scene==='beach'&&now>=a.next2){ if(Math.random()<.5) play('rustle',.12); a.next2=now+1400; }
    if(scene==='woods'&&now>=a.next){ spawn('leaf',rand(0,130),-2,rand(-10,2),rand(10,18),5,pick(['#E08A3C','#C9502E','#E8B54A'])); a.next=now+200; } }}; }
V['walk:park']=walkDef('park'); V['walk:beach']=walkDef('beach'); V['walk:woods']=walkDef('woods');
V['walk:dogpark']={dur:6800,
  init(a){ const others=KIND_STYLES.dog.filter(s=>s!==state.style); a.nb=maybeNeighbor('dog',.5); a.f1=a.nb?a.nb.style:pick(others); a.f2=pick(others.filter(s=>s!==a.f1)); },
  scene(e){ drawDogPark(e); },
  pose(p,e){ p.eyes='happy'; p.mouth='tongue'; p.wag=80;
    if(e>400&&e<2400){ p.dx=Math.round(Math.sin((e-400)/2000*Math.PI*2)*30); p.dy=0; p.ear=Math.floor(e/120)%2; p.body='run'; p.face=Math.cos((e-400)/2000*Math.PI*2)>=0?1:-1; p.frame=Math.floor(e/90)%4; }
    else if(e>=2400&&e<3200){ p.eyes='open'; p.dx=Math.round(lerp(0,32,ph(e,2800,3150))); if(e>2800){ p.body='run'; p.face=1; p.frame=Math.floor(e/90)%4; } if(e>3000) p.dy=Math.round(arc(ph(e,3000,3250),8)); }
    else if(e>=3200&&e<4000){ p.dx=Math.round(lerp(32,0,ph(e,3200,4000))); p.mouth='smile'; p.dy=0; p.body='run'; p.face=-1; p.frame=Math.floor(e/90)%4; }
    else if(e>=4000&&e<4400) p.mouth='smile'; },
  behind(e,a){ const f=(st,ph0,sp,y,sg,fit)=>{ const x=Math.round(64+Math.sin(e/sp+ph0)*44)-22; softShadow(ctx,x+22,y+41,8,1.6,.25); drawPetPose(ctx,st,sg||'baby',{body:'run',face:Math.cos(e/sp+ph0)>=0?1:-1,frame:Math.floor(e/90+ph0*3)%4,eyes:'happy',mouth:'tongue',tail:Math.floor(e/110)%3,ear:Math.floor(e/160)%2},fit||null,x,y); };
    f(a.f1,1,520,PETY-9,a.nb&&a.nb.sg,a.nb&&a.nb.fit); f(a.f2,3.5,440,PETY-12); },
  front(e,a,p){ if(e>2400&&e<3200){ const k=ph(e,2400,3200); blit(ctx,SPR.ball,lerp(130,96,k),lerp(30,60,k)+arc(k,12)); } else if(e>=3200&&e<4000){ const m=mouthAt(p); blit(ctx,SPR.ball,m.x-5,m.y-2); } },
  overlay(e,a){ fadeOverlay(e,a.dur); },
  tick(a,e,now){ if(e>400) once(a,'z',()=>{ setCaption(a.nb?`Zoomies at the dog park! ${a.nb.name} from down the street is here too!`:`Zoomies with new friends at the dog park!`); play('dog:barkHappy:'+(a.nb?a.nb.sg:'baby'),.5); }); if(e>2400) once(a,'f',()=>setCaption('Fetch time!'));
    if(e>3150) once(a,'c',()=>{ play('bounce',.6); spawn('sparkle',96,58,0,-8,.8); setCaption(`${state.name} caught the ball!`); });
    if(e>4400) once(a,'h',()=>{ setCaption(`${state.name} had the best time at the dog park.`); play('pet:pant',.4); });
    if(e>4400&&now>=a.next){ spawn('heart',64+rand(-30,30),50,rand(-5,5),-14,1.3); a.next=now+500; } }};

/* ---- Explore (cats) ---- */
const sinkIn=()=>23.5-G().top;
V['explore:box']={dur:4300,noShadow:true,clipY:87,
  bx(e){ return e<450?Math.round(lerp(-50,42,e/450)):e<3800?42:Math.round(lerp(42,132,(e-3800)/500)); },
  pose(p,e){ const inside=sinkIn(), up=7;
    if(e<450) p.dy=0;
    else if(e<950){ const t=(e-450)/500; p.dy=Math.round(inside*t-Math.sin(t*Math.PI)*10); p.eyes='happy'; }
    else if(e<3300){ const peek=(e>1400&&e<2000)||(e>2400&&e<3000); p.dy=inside-(peek?up:0); p.eyes=peek?'open':'closed'; p.ear=Math.floor(e/300)%2; }
    else if(e<3800){ const t=(e-3300)/500; p.dy=Math.round(inside*(1-t)-Math.sin(t*Math.PI)*10); p.eyes='happy'; p.mouth='open'; }
    else { p.eyes='happy'; p.mouth='tongue'; } },
  behind(e){ drawBoxBack(this.bx(e),66); },
  front(e,a,p){ const wig=(e>950&&e<3300&&p.eyes!=='open')?(Math.floor(e/120)%2):0; drawBoxFront(this.bx(e)+wig,66); },
  tick(a,e){ if(e>450) once(a,'in',()=>play('rustle',.6)); if(e>1450) once(a,'m1',()=>play('pet:trill')); if(e>2450) once(a,'m2',()=>setCaption('Peekaboo!')); if(e>3300) once(a,'out',()=>play('rustle',.6)); if(e>3750) once(a,'sp',()=>burst(5)); }};
V['explore:tree']={dur:4800,
  pose(p,e){ const top=-24, bat=e>1900&&e<2700;
    if(e<500){ p.eyes='open'; p.headDy=-1; }
    else if(e<1000){ const k=ph(e,500,1000); p.dy=Math.round(lerp(0,top,k)+arc(k,8)); p.eyes='happy'; }
    else if(e<3900){ p.dy=top; p.eyes=bat?'open':'happy'; p.dx=bat?2:0; p.ear=Math.floor(e/400)%2; if(bat) p.mouth='open'; }
    else if(e<4400){ const k=ph(e,3900,4400); p.dy=Math.round(lerp(top,0,k)+arc(k,6)); }
    else { p.eyes='happy'; p.mouth='tongue'; } },
  behind(e){ drawCatTree(Math.round(slide(e,4800,300,300,40)),e,e>1900&&e<2700); },
  tick(a,e){ if(e>500) once(a,'j1',()=>play('bounce',.5)); if(e>1000) once(a,'top',()=>setCaption(`${state.name} made it to the top!`)); if(e>1900) once(a,'bat',()=>play('pet:trill')); if(e>3900) once(a,'j2',()=>play('bounce',.5)); if(e>4400) once(a,'sp',()=>burst(5)); }};
V['explore:tunnel']={dur:4600,
  st(e){
    if(e<400) return {dx:0,dy:0,inside:false};
    if(e<900){ const k=ph(e,400,900); return {dx:Math.round(lerp(0,-40,k)),dy:Math.round(arc(k,3)),inside:false}; }
    if(e<1200) return {dx:-40,dy:Math.round(lerp(0,18,ph(e,900,1200))),inside:true};
    if(e<2800) return {dx:Math.round(lerp(-40,40,ph(e,1200,2800))),dy:18,inside:true};
    if(e<3200){ const k=ph(e,2800,3200); return {dx:40,dy:Math.round(lerp(18,0,k)+arc(k,8)),inside:k<.5}; }
    if(e<3900){ const k=ph(e,3200,3900); return {dx:Math.round(lerp(40,0,k)),dy:0,inside:false}; }
    return {dx:0,dy:0,inside:false}; },
  pose(p,e){ const s=this.st(e); p.dx=s.dx; p.dy=s.dy; p.eyes=s.inside?'closed':'happy'; p.mouth=(e>2800&&e<3400)?'open':'smile'; p.ear=Math.floor(e/200)%2;
    if(e>=400&&e<900){ p.body='walk'; p.face=-1; p.frame=Math.floor(e/140)%4; } else if(e>=2800&&e<3200){ p.body='run'; p.face=1; p.frame=Math.floor(e/90)%4; } else if(e>=3200&&e<3900){ p.body='walk'; p.face=-1; p.frame=Math.floor(e/140)%4; } },
  clipY:86,
  tunnel(e){ const o=Math.round(slide(e,4600,300,300,30)), s=this.st(e), bx=s.inside?64+s.dx:-99;
    for(let x=14;x<114;x++){ const bump=Math.abs(x-bx)<7?2:0, top=70-bump+o; rect(ctx,x,top,1,16+bump,(Math.floor(x/4)%2)?'#6FA8DC':'#5A8FC4'); rect(ctx,x,top,1,1,'#2F5A78'); rect(ctx,x,top+1,1,.5,'#9FC8EC'); rect(ctx,x,86+o,1,1,'#2F5A78'); }
    pxEll(ctx,14,78+o,3,8,'#24405E'); pxEll(ctx,114,78+o,3,8,'#24405E'); },
  behind(e){ if(!this.st(e).inside) this.tunnel(e); },
  front(e){ if(this.st(e).inside) this.tunnel(e); },
  tick(a,e,now){ const s=this.st(e); if(s.inside&&now>=a.next){ play('rustle',.35); a.next=now+420; } if(e>2900) once(a,'m',()=>{ play('pet:trill'); setCaption('Zoom! Out the other side!'); }); if(e>3900) once(a,'sp',()=>burst(5)); }};
V['explore:bag']={dur:4600,noShadow:true,clipY:88,
  bx(e){ if(e<400) return Math.round(lerp(-50,43,e/400)); if(e<900) return 43; if(e<3400) return Math.round(43+Math.sin((e-900)/300)*10); if(e<3900) return 43; return Math.round(lerp(43,132,ph(e,3900,4600))); },
  pose(p,e){ const inside=sinkIn()+1;
    if(e<400) p.dy=0;
    else if(e<900){ const t=ph(e,400,900); p.dy=Math.round(inside*t-Math.sin(t*Math.PI)*10); p.eyes='happy'; }
    else if(e<3400){ const peek=e>2000&&e<2600; p.dy=inside-(peek?7:0); p.dx=this.bx(e)-43; p.eyes=peek?'open':'closed'; p.ear=Math.floor(e/250)%2; }
    else if(e<3900){ const t=ph(e,3400,3900); p.dy=Math.round(inside*(1-t)-Math.sin(t*Math.PI)*10); p.eyes='happy'; p.mouth='open'; }
    else { p.eyes='happy'; p.mouth='tongue'; } },
  front(e){ drawBag(this.bx(e),64); },
  tick(a,e,now){ if(e>900&&e<3400&&now>=a.next){ play('rustle',.35); a.next=now+380; } if(e>2000) once(a,'pk',()=>{ play('pet:meow',.5); setCaption('Peekaboo! The bag is scooting across the floor.'); }); if(e>3850) once(a,'sp',()=>burst(5)); }};
V['explore:garden']={dur:6000,
  fly(e){ if(e<2000) return {x:78+Math.sin(e/300)*16,y:48+Math.sin(e/190)*6}; if(e<3000){ const k=ph(e,2000,3000); return {x:lerp(78,110,k),y:lerp(48,14,k)+Math.sin(e/120)*3}; } return null; },
  scene(){ drawGarden(); },
  pose(p,e){ if(e<1900){ const f=this.fly(e); p.dy=2; p.eyes='open'; p.dx=Math.round(clamp((f.x-64)/5,-5,5)); p.ear=1; }
    else if(e<2400){ const k=ph(e,1900,2400); p.dy=Math.round(arc(k,9)); p.dx=Math.round(lerp(3,10,k)); p.eyes='happy'; p.mouth='open'; }
    else if(e<4200){ p.dx=Math.round(lerp(10,14,ph(e,2400,2800))); p.headDy=e>2800?1:0; p.eyes=e>2800?'closed':'open'; if(e>3700&&e<3900){ p.headDy=2; p.mouth='open'; } }
    else { p.dx=Math.round(lerp(14,0,ph(e,4200,4700))); p.eyes='happy'; p.mouth='smile'; } },
  front(e){ const f=this.fly(e); if(f) blit(ctx,Math.floor(e/110)%2?SPR.fly1:SPR.fly2,f.x-3,f.y-3); if(e>2400){ rect(ctx,92,74,.8,12,'#4F7A5D'); rect(ctx,93,79,3,.8,'#6E9B7B'); pxEll(ctx,92.5,72,4.6,4.2,INK); pxEll(ctx,92.5,72,3.8,3.4,'#F07A8E'); pxEll(ctx,92.5,72,1.4,1.4,'#F4C542'); } },
  overlay(e,a){ fadeOverlay(e,a.dur); },
  tick(a,e,now){ if(e>400) once(a,'s',()=>{ setCaption(`${state.name} is stalking a butterfly...`); play('pet:chatter',.4); }); if(e>1950) once(a,'p',()=>{ play('bounce',.5); setCaption('Pounce! The butterfly floats away.'); });
    if(e>2900) once(a,'f',()=>setCaption(`${state.name} stops to smell a flower.`)); if(e>3750) once(a,'a',()=>{ play('pet:sneeze',.6); for(let i=0;i<6;i++) spawn('sparkleSmall',84+rand(-6,6),62,rand(-20,20),rand(-16,0),.6); setCaption('Achoo! A flower sneeze.'); });
    if(e>4300) once(a,'h',()=>setCaption(`${state.name} loves the garden.`)); if(e>4300&&now>=a.next){ spawn('heart',64+rand(-14,14),52,rand(-5,5),-14,1.2); a.next=now+550; } }};

/* ---- Cuddle ---- */
V['cuddle:hearts']={dur:2800,
  pose(p,e){ p.eyes='happy'; p.mouth=kind()==='cat'?'smile':'tongue'; p.ear=Math.floor(e/400)%2; },
  tick(a,e,now){ if(now>=a.next){ spawn('heart',64+rand(-12,12),54,rand(-6,6),-18,1.6); a.next=now+260; } }};
V['cuddle:pats']={dur:2800,
  hy(e,p){ const top=headTopOf(p)-17; if(e<400) return lerp(-24,top,e/400); if(e<2300) return top+((Math.floor((e-400)/260)%2)?2:0); return lerp(top,-24,ph(e,2300,2700)); },
  pose(p,e){ p.eyes='happy'; p.mouth=kind()==='cat'?'smile':'tongue'; if(e>400&&e<2300&&Math.floor((e-400)/260)%2){ p.headDy=1; p.ear=1; } },
  front(e,a,p){ blit(ctx,SPR.hand,64-SPR.hand.lw/2+p.dx,this.hy(e,p)); },
  tick(a,e,now){ if(e>400&&e<2300&&now>=a.next){ spawn('heart',64+rand(-16,16),headTopOf(p0()),rand(-5,5),-16,1.2); a.next=now+520; } }};
const p0=()=>({dx:0,dy:0,headDy:0});
V['cuddle:blanket']={dur:3000,
  pose(p,e){ p.eyes=(e>500&&e<2600)?'closed':'happy'; p.mouth='smile'; p.dy=0; },
  front(e){ drawBlanket(Math.round(PETY+G().collar+(big()?1:0)+slide(e,3000,500,400,60))); },
  tick(a,e,now){ if(e>500&&e<2600&&now>=a.next){ spawn('heart',64+rand(-12,12),PETY+10,rand(-5,5),-14,1.4); a.next=now+420; } }};

/* ---- Bath (dogs) and Brush (cats) ---- */
V['bath:bubbles']={dur:2900,
  pose(p,e){ p.eyes=e<2200?'closed':'happy'; p.mouth=e<2200?'smile':'tongue'; },
  tick(a,e,now){ if(e<2200&&now>=a.next){ spawn(Math.random()<.5?'bubble2':'bubble3',rand(46,82),rand(58,84),rand(-4,4),rand(-14,-7),rand(1,1.8)); if(Math.random()<.35) play('pop',.4); a.next=now+110; } }};
V['bath:tub']={dur:3200,noShadow:true,
  ty(e){ return Math.round(70+slide(e,3200,350,350,30)); },
  pose(p,e){ const inTub=e>350&&e<2850; p.dy=inTub?(big()?3:1):0; p.eyes='happy'; p.mouth=Math.floor(e/500)%2?'tongue':'open'; },
  clipY(e){ return this.ty(e)+2; },
  front(e){ drawTub(this.ty(e),e); },
  tick(a,e,now){ if(e>400&&e<2800&&now>=a.next){ spawn('drop',rand(46,82),this.ty(e),rand(-20,20),rand(-40,-20),.7); if(Math.random()<.4) play('pop',.35); a.next=now+180; } if(e>1200) once(a,'sq',()=>play('squeak',.5)); if(e>2000) once(a,'sq2',()=>play('squeak',.5)); }};
V['bath:shake']={dur:3000,
  pose(p,e){ if(e<1400){ p.eyes='closed'; p.headDy=1; } else if(e<2400){ p.dx=(Math.floor(e/60)%2)?2:-2; p.ear=Math.floor(e/60)%2; p.eyes='closed'; p.mouth='open'; } else { p.eyes='happy'; p.mouth='tongue'; } },
  front(e){ if(e<1400){ rect(ctx,58,0,12,3,'#9AA4AE'); rect(ctx,62,0,4,1,'#6A7A8A'); rect(ctx,58,2.5,12,.5,'#C8D0D8'); } },
  tick(a,e,now){
    if(e<1400&&now>=a.next){ for(let i=0;i<3;i++) spawn('drop',rand(50,78),rand(2,8),0,rand(60,90),1.1); a.next=now+60; }
    if(e>=1400&&e<2400&&now>=a.next){ for(let i=0;i<4;i++){ const g=rand(0,Math.PI*2); spawn('drop',64+Math.cos(g)*10,68+Math.sin(g)*10,Math.cos(g)*60,Math.sin(g)*40-20,.6); } a.next=now+70; }
    if(e>1400) once(a,'sh',()=>{ play('rustle',.7); setCaption('Shake shake shake!'); }); if(e>2400) once(a,'sp',()=>{ burst(6); play('pet:sneeze',.4); }); }};
V['brush:brush']={dur:2900,
  pose(p,e){ p.eyes=e>2300?'happy':'closed'; p.ear=Math.floor(e/500)%2; },
  front(e){ if(e<2300) blit(ctx,ICONS.brush,58+Math.sin(e/170)*10,PETY+G().chest-4+Math.cos(e/340)*3); },
  tick(a,e,now){ if(now>=a.next){ if(e<2300){ spawn('tuft',rand(54,74),rand(66,80),rand(-14,14),rand(-18,-8),.8,STYLES[state.style].pal.fur); a.next=now+140; } else { spawn('sparkleSmall',rand(50,78),rand(58,80),0,-6,.8); a.next=now+160; } } }};
V['brush:groom']={dur:3000,
  pose(p,e){ if(e<2400){ const b=Math.floor(e/300)%2; p.headDy=1+b; p.eyes='closed'; p.mouth='tongue'; p.ear=b; } else p.eyes='happy'; },
  tick(a,e,now){ if(e<2400&&now>=a.next){ spawn('sparkleSmall',64+rand(-14,14),rand(56,80),0,-6,.7); a.next=now+220; } }};
V['brush:bow']={dur:3200,
  pose(p,e){ p.eyes=e<1900?'closed':'happy'; p.mouth=e>1900?'open':'smile'; },
  front(e){ if(e<1800) blit(ctx,ICONS.brush,58+Math.sin(e/170)*10,PETY+G().chest-10+Math.cos(e/340)*3); },
  tick(a,e,now){ if(e<1800&&now>=a.next){ spawn('tuft',rand(54,74),rand(62,78),rand(-14,14),rand(-18,-8),.8,STYLES[state.style].pal.fur); a.next=now+140; }
    if(e>1900) once(a,'bow',()=>{ state.bowUnlocked=true; state.outfit=state.outfit||{}; state.outfit.hat='bow'; save(); burst(6); }); }};

/* ---- Nap ---- */
/* Every nap happens on the pet's own bed (the Nap choice in the room): the pet walks over, the bed grows
   big enough to curl up in, and the pet sleeps on it, snuggled behind the bed's front edge. At the end it
   wakes, walks back to the rug, and the bed goes back to its usual size. */
const NAP_K=1.5, NAP_IN=750, NAP_OUT=850;
function napBed(){ const id=room().spots.floorL||'petBed', d=DECOR[id], p=itemPos(id,'floorL'); return {id,d,cx:p.x+d.w/2,base:p.y+d.h}; }
/* How big the bed is now (1 = its usual size). */
function napGrow(e,a){ if(reduceMotion) return NAP_K; return 1+(NAP_K-1)*clamp(Math.min(ph(e,NAP_IN-450,NAP_IN-50),1-ph(e,a.dur-NAP_OUT+250,a.dur-NAP_OUT+600)),0,1); }
/* Where the pet lies: centered on the bed, sunk a little into the cushion. */
function napSpot(){ const b=napBed(), side=b.cx<64?-1:1; return {b,side,dx:b.cx-64-side*5,dy:b.base-b.d.h*NAP_K*.24-85.5}; }
const napPose=(p,e,a)=>{ const {side,dx,dy}=napSpot(); p.wag=0;
  const walk=(t,face)=>{ p.body='walk'; p.face=face; p.frame=Math.floor(e/140)%4; p.dx=Math.round(dx*t); p.dy=Math.round(dy*t); p.eyes='open'; };
  if(!reduceMotion&&e<NAP_IN){ walk(ph(e,0,NAP_IN),side); return; }
  if(!reduceMotion&&e>a.dur-NAP_OUT){ walk(1-ph(e,a.dur-NAP_OUT,a.dur),-side); p.eyes='happy'; return; }
  p.body='lie'; p.face=-side; p.eyes=e>a.dur-NAP_OUT-700?'open':'closed'; p.headDy=1; p.dx=Math.round(dx); p.dy=Math.round(dy)+(reduceMotion?0:Math.floor(e/1300)%2); };
/* The bed's front edge, drawn again over the sleeping pet. */
function napBedFront(e,a){ const {b}=napSpot(), k=napGrow(e,a), w=b.d.w*k, h=b.d.h*k, top=b.base-h; if(k<1.02) return;
  ctx.save(); ctx.beginPath(); ctx.rect(b.cx-w/2-6,b.base-h*.42,w+12,h); ctx.clip(); blitSized(ctx,itemSprite(b.id),b.cx-w/2,top,w,h); ctx.restore(); }
const napHead=()=>{ const {b,side}=napSpot(); return {x:b.cx-side*13,y:b.base-b.d.h*NAP_K-10}; };
const zzz=(a,now,x)=>{ if(now>=a.next){ const hd=napHead(); spawn('z',x||hd.x,hd.y,6,-7,2.6); a.next=now+900; a.zc=(a.zc||0)+1; if(a.zc%2===1) play('pet:snore',.35); } };
V['nap:dim']={dur:6200,pose:napPose,noShadow:true,front:napBedFront,
  overlay(e,a){ const f=Math.max(0,Math.min(1,e/500,(a.dur-e)/500)); ctx.fillStyle=`rgba(28,30,70,${(.38*f).toFixed(3)})`; fillView(ctx); },
  tick(a,e,now){ if(e>NAP_IN&&e<a.dur-NAP_OUT) zzz(a,now); }};
const DREAM_WORD={ball:'playing ball',yarn:'yarn',feed:'dinner',walk:'going for walks',box:'boxes',cuddle:'you'};
/* A dream nap: a thought bubble over the bed shows what the pet dreams about. */
V['nap:bed']={dur:6400,pose:napPose,noShadow:true,front:napBedFront,
  init(a){ a.dream=pick(kind()==='dog'?['ball','feed','walk','cuddle']:['yarn','feed','box','cuddle']); },
  overlay(e,a){ const f=Math.max(0,Math.min(1,e/500,(a.dur-e)/500)); ctx.fillStyle=`rgba(28,30,70,${(.25*f).toFixed(3)})`; fillView(ctx);
    if(e>1500&&e<a.dur-NAP_OUT-400){ const hd=napHead(), bx=clamp(hd.x-4,VIEW.x+2,VIEW.x+VIEW.w-26), by=Math.max(VIEW.y+2,hd.y-20)+(Math.floor(e/700)%2); blit(ctx,SPR.bubbleThought,bx,by); blit(ctx,ICONS[a.dream],bx+6,by+4); } },
  tick(a,e,now){ if(e>NAP_IN&&e<a.dur-NAP_OUT) zzz(a,now); if(e>1600) once(a,'d',()=>setCaption(`${state.name} dreams about ${DREAM_WORD[a.dream]}.`)); }};
/* A sunbeam (or moonlight) nap: the light slants from the window right onto the bed, wherever the bed
   has been moved to, with a warm pool of light over the sleeping pet. */
V['nap:sun']={dur:6200,pose:napPose,noShadow:true,
  front:napBedFront,
  overlay(e,a){ const w=WIN(), {b}=napSpot(), night=skyMode()==='night', f=Math.max(0,Math.min(1,e/600,(a.dur-e)/600)), col=night?'#AABEFF':'#FFE282',
      y0=w.y+w.h, y1=b.base+1, h0=(w.w-4)/2, h1=Math.max(12,b.d.w*NAP_K/2+2);
    ctx.fillStyle=rgbaStr(col,(night?.22:.32)*f);
    for(let y=y0;y<y1;y++){ const t=(y-y0)/Math.max(1,y1-y0), cx=lerp(w.cx,b.cx,t), hw=lerp(h0,h1,t); ctx.fillRect(cx-hw,y,hw*2,1); }
    glow(ctx,b.cx,b.base-b.d.h*NAP_K*.5,h1+6,col,(night?.22:.3)*f); },
  tick(a,e,now){ if(e>NAP_IN&&e<a.dur-NAP_OUT) zzz(a,now); if(now>=a.next2){ const {b}=napSpot(); spawn('sparkleSmall',b.cx+rand(-16,16),b.base-rand(4,26),rand(-2,2),-3,1.4); a.next2=now+500; } }};

/* ---- Little things that happen on their own ---- */
const IDLE_W={
  dog:[['tail',3],['sneeze',2],['yawn',2],['zoom',3],['fly',2],['toy',3],['scratch',2],['butterfly',1],['hiccup',2],['leash',2],['window',2],['sniff',2],['stretch',2],['chew',3]],
  cat:[['stretch',2],['sneeze',2],['yawn',2],['zoom',2],['fly',2],['mouse',2],['window',3],['butterfly',1],['lick',2],['tail',2],['hiccup',2],['loaf',2],['knead',3],['chew',3],['bat',3]]
};
const IDLE_MSG={
  tail:n=>`${n} is chasing its tail!`, sneeze:n=>`Achoo! Bless you, ${n}.`, yawn:n=>`${n} lets out a big yawn.`,
  zoom:n=>`Zoomies! ${n} is racing around the room.`, fly:n=>`${n} spotted a fly buzzing around.`, toy:(n,a)=>`${n} found the ${toyName(a.toy)} under the rug!`,
  scratch:n=>`${n} scratches an itchy ear.`, butterfly:()=>`A butterfly flew in the window!`, stretch:n=>`${n} does a big, long stretch.`,
  mouse:n=>`A toy mouse zooms by. ${n} pounces!`, window:n=>`${n} is watching a bird outside the window.`, lick:n=>`${n} licks a paw to stay tidy.`,
  hiccup:n=>`Hic! ${n} has the hiccups.`, leash:n=>`${n} brought you the leash. Walk time?`, sniff:n=>`${n} is sniffing out something interesting.`,
  chew:(n,a)=>`${n} plays with the ${toyName(a.toy)}.`, loaf:n=>`${n} tucks in its paws like a little loaf of bread.`, knead:n=>`${n} is kneading the rug. Making biscuits!`,
  bat:n=>`${n} bats at a bouncy spring toy.`
};
const zoomDx=e=>Math.round(Math.sin(e/2600*Math.PI*3)*32);
const toWin=()=>clamp(WIN().cx-64,-16,16);
V['idle:tail']={dur:2200,pose(p,e){ p.dx=Math.round(Math.sin(e/90)*4); p.ear=Math.floor(e/90)%2; p.eyes='happy'; p.mouth='open'; p.wag=60; p.dy=0; },
  tick(a,e){ if(e>300) once(a,'b',()=>play(happyNoise(),.5)); if(e>2000) once(a,'s',()=>burst(4)); }};
V['idle:sneeze']={dur:1700,pose(p,e){ if(e<700){ p.headDy=-1; p.eyes=e>350?'closed':'open'; p.mouth='open'; } else if(e<1000){ p.headDy=2; p.dy=1; p.eyes='closed'; } else { p.eyes='happy'; p.mouth='tongue'; } },
  tick(a,e){ if(e>420) once(a,'a',()=>{ play('pet:sneeze',.7); later(()=>{ for(let i=0;i<7;i++) spawn('sparkleSmall',64+rand(-8,8),PETY+G().mouth,rand(-34,34),rand(-24,10),.5); },280); }); }};
V['idle:yawn']={dur:2000,pose(p,e){ if(e<1500){ p.eyes='closed'; p.mouth='open'; p.headDy=-1; } else p.eyes='happy'; }, tick(a,e){ if(e>150) once(a,'y',()=>play('pet:yawn',.55)); }};
V['idle:zoom']={dur:2600,pose(p,e){ p.dx=zoomDx(e); p.dy=0; p.body='run'; p.face=Math.cos(e/2600*Math.PI*3)>=0?1:-1; p.frame=Math.floor(e/90)%4; p.eyes='happy'; p.mouth='tongue'; p.ear=Math.floor(e/100)%2; p.wag=60; },
  tick(a,e,now){ if(now>=a.next){ spawn('puff',64+zoomDx(e)+rand(-8,8),86,rand(-10,10),rand(-8,-2),.5); a.next=now+60; } if(e>400) once(a,'n',()=>play(kind()==='dog'?'pet:barkHappy':'pet:trill',.5)); }};
V['idle:fly']={dur:2900,
  pos(e){ return e<2300?{x:64+Math.sin(e/260)*22,y:48+Math.sin(e/170)*8}:{x:64+(e-2300)/4,y:48-(e-2300)/8}; },
  pose(p,e){ const f=this.pos(e); p.eyes='open'; p.dx=Math.round(clamp((f.x-64)/7,-3,3)); if(e>2100&&e<2450){ p.dy=-3; p.mouth='open'; p.eyes='happy'; } },
  front(e){ const f=this.pos(e); blit(ctx,SPR.bug,f.x,f.y); },
  tick(a,e){ if(e>50) once(a,'bz',()=>play('buzz',.5)); if(e>1300) once(a,'bz2',()=>play('buzz',.5)); if(e>2150) once(a,'snap',()=>{ play(petNoise(),.5); setCaption('Missed! The fly buzzes away.'); }); }};
V['idle:toy']={dur:2600,init(a){ a.toy=pick(ownedToys()); },
  pose(p,e){ if(e<1000){ p.headDy=2; p.dx=(Math.floor(e/110)%2)?1:-1; p.eyes='closed'; } else { p.eyes='happy'; p.mouth='smile'; p.wag=70; if(e<1300) p.dy=-3; } },
  front(e,a,p){ if(e<1000){ if(Math.floor(e/110)%3===0) spawn('puff',64+rand(-10,10),85,rand(-12,12),-6,.4); return; } const m=mouthAt(p), s=SPR[a.toy]; blit(ctx,s,m.x-s.lw/2,m.y-2); },
  tick(a,e){ if(e>1000) once(a,'f',()=>{ play(toySqueaks(a.toy)?'squeak':'happy',.6); spawn('sparkle',64,60,0,-10,.8); }); }};
V['idle:scratch']={dur:1700,pose(p,e){ p.ear=Math.floor(e/70)%2; p.headDy=1; p.dx=(Math.floor(e/70)%2); p.eyes='happy'; p.mouth='tongue'; }, tick(a,e){ if(e>100) once(a,'r',()=>play('rustle',.4)); }};
V['idle:butterfly']={dur:3600,
  pos(e,p){ const hx=64+(p?p.dx:0), hy=PETY+G().top-2;
    if(e<1400){ const k=e/1400; return {x:lerp(28,hx,k)+Math.sin(e/150)*4,y:lerp(24,hy,k)+arc(k,6)}; }
    if(e<2700) return {x:hx,y:hy}; const k=ph(e,2700,3600); return {x:lerp(hx,140,k),y:lerp(hy,10,k)+Math.sin(e/150)*4}; },
  pose(p,e){ p.eyes=(e>1400&&e<2700)?'happy':'open'; p.mouth=(e>1400&&e<2700)?'tongue':'smile'; },
  front(e,a,p){ const b=this.pos(e,p), s=(e>1400&&e<2700&&Math.floor(e/500)%2)?SPR.fly2:(Math.floor(e/110)%2?SPR.fly1:SPR.fly2); blit(ctx,s,b.x-3,b.y-3); },
  tick(a,e){ if(e>1400) once(a,'l',()=>{ setCaption(`It landed on ${state.name}!`); spawn('sparkle',64,PETY+G().top-4,0,-6,.8); play('sparkle',.4); }); }};
V['idle:stretch']={dur:2200,pose(p,e){ if(e<800){ p.body='stand'; p.face=1; p.headDy=2; p.eyes='closed'; } else if(e<1600){ p.body='stand'; p.face=1; p.headDy=-1; p.eyes='closed'; p.mouth='open'; } else p.eyes='happy'; }, tick(a,e){ if(e>800) once(a,'y',()=>play('pet:yawn',.45)); }};
V['idle:mouse']={dur:2600,
  mx(e){ return e<1500?lerp(-12,70,e/1500):70; },
  pose(p,e){ const x=this.mx(e); p.eyes='open'; p.dx=Math.round(clamp((x-64)/6,-5,2)); if(e>1300&&e<1700){ p.dy=Math.round(arc(ph(e,1300,1700),6)); p.dx=3; p.eyes='happy'; } else if(e>=1700){ p.dx=3; p.eyes='happy'; p.mouth='open'; } },
  front(e){ blit(ctx,SPR.mouse,this.mx(e),84); },
  tick(a,e){ if(e>100) once(a,'z',()=>play('squeak',.4)); if(e>1700) once(a,'g',()=>{ play('squeak',.6); spawn('sparkle',74,78,0,-8,.8); }); }};
V['idle:window']={dur:3200,
  pose(p,e){ p.eyes='open'; p.dx=Math.round(toWin()/8); p.mouth=(e>600&&e<2600&&Math.floor(e/160)%2)?'open':'smile'; p.ear=Math.floor(e/300)%2; p.headDy=-1; },
  behind(e){ const w=WIN(); ctx.save(); ctx.beginPath(); ctx.rect(w.x,w.y,w.w,w.h); ctx.clip(); [[0,w.y+5],[500,w.y+15]].forEach(([d,y])=>{ const t=e-d; if(t>0&&t<2600) blit(ctx,Math.floor(t/150)%2?SPR.gull:SPR.gull2,lerp(w.x-4,w.x+w.w,t/2600),y+Math.sin(t/200)*2); }); ctx.restore(); },
  tick(a,e,now){ if(e>500) if(kind()==='cat') once(a,'c',()=>play('pet:chatter',.4)); if(e>600&&e<2600&&now>=a.next){ play('chirp',.3); a.next=now+900; } }};
V['idle:lick']={dur:2000,pose(p,e){ if(e<1600){ const b=Math.floor(e/260)%2; p.headDy=1+b; p.eyes='closed'; p.mouth='tongue'; } else p.eyes='happy'; },
  tick(a,e,now){ if(e<1600&&now>=a.next){ spawn('sparkleSmall',64+rand(-12,12),rand(60,80),0,-6,.6); a.next=now+300; } }};
V['idle:hiccup']={dur:2400,pose(p,e){ const hic=[300,1000,1700].some(t=>e>t&&e<t+180); if(hic){ p.dy=-3; p.eyes='closed'; p.mouth='open'; } if(e>2000){ p.eyes='happy'; p.mouth='tongue'; } },
  tick(a,e){ [300,1000,1700].forEach((t,i)=>{ if(e>t) once(a,'h'+i,()=>{ play('hic',.6); spawn('sparkleSmall',64,PETY+G().mouth,rand(-10,10),-12,.4); }); }); if(e>2000) once(a,'d',()=>setCaption('The hiccups are gone!')); }};
V['idle:leash']={dur:2800,pose(p,e){ p.eyes='open'; p.wag=60; p.dy=(e>800&&e<2200)?-(Math.floor(e/180)%2)*2:0; },
  front(e,a,p){ const m=mouthAt(p); pxLine(ctx,m.x-2,m.y+1,m.x-9,m.y+12,'#D9577A',1); pxLine(ctx,m.x-1,m.y+1,m.x-8,m.y+12,'#8E2A48',.5);
    rect(ctx,m.x-13,m.y+12,7,1,'#D9577A'); rect(ctx,m.x-13,m.y+17,7,1,'#D9577A'); rect(ctx,m.x-13,m.y+12,1,6,'#D9577A'); rect(ctx,m.x-7,m.y+12,1,6,'#D9577A'); rect(ctx,m.x-2,m.y,3,2,'#C9C9D0'); },
  tick(a,e){ if(e>900) once(a,'w',()=>play('pet:barkHappy',.35)); }};
V['idle:sniff']={dur:2400,pose(p,e){ if(e<2000){ p.body='walk'; p.face=Math.cos(e/250)>=0?1:-1; p.frame=Math.floor(e/220)%4; p.headDy=2; p.dx=Math.round(Math.sin(e/250)*6); p.eyes='closed'; p.dy=0; } else p.eyes='happy'; },
  tick(a,e,now){ if(e<2000&&now>=a.next){ play('sniff',.35); a.next=now+300; } }};
V['idle:chew']={dur:2800,init(a){ a.toy=pick(ownedToys()); },
  pose(p,e){ if(e<2300){ const b=Math.floor(e/260)%2; p.headDy=1+b; p.eyes=b?'closed':'happy'; p.mouth=b?'open':'smile'; p.dy=0; } else { p.eyes='happy'; p.mouth='tongue'; } },
  front(e,a){ const s=SPR[a.toy]; blit(ctx,s,64-s.lw/2+(Math.floor(e/260)%2),87-s.lh); },
  tick(a,e,now){ if(e<2300&&now>=a.next){ play(toySound(a.toy),.35); a.next=now+520; } }};
V['idle:loaf']={dur:3000,pose(p,e){ p.dy=3; p.headDy=1; p.eyes=e<2400?'closed':'happy'; p.wag=0; }, tick(a,e){ if(e>200) once(a,'p',()=>play('pet:purr',.5)); }};
V['idle:knead']={dur:3000,pose(p,e){ p.dx=(Math.floor(e/180)%2)?1:-1; p.dy=1; p.eyes='closed'; p.ear=Math.floor(e/360)%2; },
  tick(a,e,now){ if(e>100) once(a,'p',()=>play('pet:purr',.55)); if(now>=a.next){ spawn('puff',64+rand(-8,8),85,rand(-6,6),-3,.4,'#F4C96A'); a.next=now+180; } }};
V['idle:bat']={dur:3000,sy(e){ return 50+Math.sin(e/160)*5; },
  pose(p,e){ p.eyes='open'; if(e>900&&e<1300){ p.dy=Math.round(arc(ph(e,900,1300),6)); p.mouth='open'; p.eyes='happy'; } if(e>2000&&e<2400){ p.dy=Math.round(arc(ph(e,2000,2400),6)); p.mouth='open'; p.eyes='happy'; } },
  front(e){ const y=this.sy(e); pxLine(ctx,70,0,70,y,'#F4E4C8',.5); blit(ctx,SPR.spring,66,y); },
  tick(a,e){ if(e>950) once(a,'b1',()=>play('bounce',.4)); if(e>2050) once(a,'b2',()=>play('bounce',.4)); if(e>2500) once(a,'t',()=>play('pet:trill',.4)); }};

/* ---- Tricks (learned from care stars) ---- */
V['trick:sit']={dur:2800,pose(p,e){ if(e<500) p.eyes='open'; else if(e<2200){ p.dy=2; p.headDy=-1; p.eyes='happy'; p.wag=200; } else { p.eyes='happy'; p.mouth='tongue'; } },
  tick(a,e){ if(e>500) once(a,'s',()=>{ play('choose'); spawn('sparkle',64,PETY+10,0,-8,.8); setCaption('Sit!'); }); if(e>2200) once(a,'c',()=>{ play('happy',.6); burst(6); }); }};
V['trick:spin']={dur:2800,pose(p,e){ if(e<2200){ const t=e/2200*Math.PI*4; p.dx=Math.round(Math.sin(t)*5); p.ear=Math.cos(t)>0?1:0; p.eyes=Math.cos(t)>0?'happy':'closed'; p.wag=60; p.dy=-(Math.floor(e/120)%2); } else { p.eyes='happy'; p.mouth='tongue'; } },
  tick(a,e,now){ if(e<2200&&now>=a.next){ const g=e/150; spawn('sparkleSmall',64+Math.cos(g)*20,64+Math.sin(g)*10,0,-4,.5); a.next=now+80; } if(e>200) once(a,'s',()=>setCaption('Spin!')); if(e>2200) once(a,'c',()=>{ play('happy',.6); burst(6); }); }};
V['trick:paw']={dur:2800,pose(p,e){ p.eyes=e>900?'happy':'open'; p.mouth=e>900?'tongue':'smile'; if(e>600&&e<2200) p.dx=-1; },
  front(e,a,p){ if(e>600&&e<2200){ const up=e<900?ph(e,600,900):1, x=PETX+22+G().pawDx+6+p.dx, y=chestAt(p)-up*(big()?12:9);
    pxEll(ctx,x,y,3.8,3.4,INK); pxEll(ctx,x,y,3.1,2.7,STYLES[state.style].pal.light); pxEll(ctx,x-1,y+1,.6,.6,'#F2A9B4'); pxEll(ctx,x+1,y+1,.6,.6,'#F2A9B4'); pxEll(ctx,x,y-.6,.9,.7,'#F2A9B4'); } },
  tick(a,e){ if(e>1000) once(a,'h',()=>{ play('choose'); burst(5); setCaption('High five!'); }); if(e>2200) once(a,'c',()=>play('happy',.6)); }};
V['trick:dance']={dur:3200,pose(p,e){ if(e<2700){ const s=Math.floor(e/300)%2; p.dx=s?4:-4; p.dy=-(Math.floor(e/150)%2)*3; p.ear=s; p.eyes='happy'; p.mouth='open'; p.wag=80; } else { p.eyes='happy'; p.mouth='tongue'; } },
  tick(a,e,now){ if(e<2700&&now>=a.next){ spawn('note',64+rand(-18,18),56,rand(-6,6),-14,1.4); play('beep'+(1+Math.floor(rand(0,4))),.35); a.next=now+300; } if(e>200) once(a,'s',()=>setCaption('Dance party!')); if(e>2700) once(a,'c',()=>{ play('happy',.6); burst(6); }); }};
V['trick:speak']={dur:2800,pose(p,e){ const t=e%700, on=e<2100&&t<220; p.mouth=on?'open':'smile'; p.headDy=on?-1:0; p.eyes='happy'; },
  tick(a,e){ [0,700,1400].forEach((t,i)=>{ if(e>t+50) once(a,'v'+i,()=>{ play(petNoise(),.6); spawn('exclaim',80,PETY+8,4,-10,.7); }); }); if(e>2200) once(a,'c',()=>{ play('happy',.6); burst(6); }); }};
V['decor:0']={dur:2400,pose(p,e){ p.eyes='happy'; p.mouth='tongue'; p.dy=e<1400?-Math.round(Math.abs(Math.sin(e/160))*3):0; },
  tick(a,e,now){ if(e>100) once(a,'f',()=>{ play('fanfare',.6); burst(12); }); if(e>900) once(a,'n',()=>play(happyNoise(),.5)); if(now>=a.next&&e<1800){ spawn('star',rand(10,118),rand(10,60),0,-6,1); a.next=now+150; } }};

/* ---- Events that happen on their own ---- */
V['event:showoff']={dur:3200,init(a){ a.trick=pick(learnedTricks()); a.inner=V['trick:'+a.trick]; },
  start(a){ setCaption(`${state.name} wants to show off a trick: ${trickName(a.trick)}!`); },
  pose(p,e,a){ a.inner.pose.call(a.inner,p,e,a); }, front(e,a,p){ if(a.inner.front) a.inner.front.call(a.inner,e,a,p); }, tick(a,e,now){ a.inner.tick.call(a.inner,a,e,now); }};
V['event:playdate']={dur:7200,
  init(a){ const k=kind(); a.friend=a.friend||pick(KIND_STYLES[k].filter(s=>s!==state.style)); a.fname=a.fname||pick(PRESET_NAMES[k].filter(x=>x!==state.name)); a.fkind=a.fkind||STYLES[a.friend].kind; a.fsg=a.fsg||stageName(); },
  start(a){ setCaption(a.neighbor?`Play date! ${a.fname} the ${friendWord({kind:a.fkind,sg:a.fsg})} came over from down the street.`:`Play date! ${a.fname} the ${stageWord()} came over to play.`); play(a.fkind==='dog'?'dog:barkFriendly:'+a.fsg:'cat:meow:'+a.fsg); },
  fx(e){ return e<900?lerp(-46,20,e/900):e<6000?20:lerp(20,-50,ph(e,6000,7000)); },
  chase(e){ return (e>3200&&e<4600)?Math.round(Math.sin((e-3200)/220)*8):0; },
  pose(p,e){ p.dx=Math.round(e<900?lerp(0,20,e/900):e<6000?20:lerp(20,0,ph(e,6000,7000)))+this.chase(e); p.eyes='happy'; p.mouth='tongue'; p.wag=90; if(e>900&&e<6000) p.dy=-(Math.floor(e/260)%2)*2;
    if(e<900){ p.body='walk'; p.face=1; p.frame=Math.floor(e/140)%4; } else if(e>3200&&e<4600){ p.body='run'; p.face=Math.cos((e-3200)/220)>=0?1:-1; p.frame=Math.floor(e/90)%4; p.dy=0; } else if(e>6000&&e<7000){ p.body='walk'; p.face=-1; p.frame=Math.floor(e/140)%4; } },
  behind(e,a){ const x=Math.round(this.fx(e))+this.chase(e), dy=(e>900&&e<6000)?-((Math.floor(e/260)+1)%2)*2:0;
    softShadow(ctx,x+22,85,G().bodyRx+1.5,2,.3); const fp={eyes:'happy',mouth:'tongue',tail:Math.floor(e/110)%3,ear:Math.floor(e/260)%2}; if(e<900){ fp.body='walk'; fp.face=1; fp.frame=Math.floor(e/140)%4; } else if(e>3200&&e<4600){ fp.body='run'; fp.face=Math.cos((e-3200)/220)>=0?1:-1; fp.frame=Math.floor(e/90+2)%4; } else if(e>6000){ fp.body='walk'; fp.face=-1; fp.frame=Math.floor(e/140)%4; }
    drawPetPose(ctx,a.friend,a.fsg||stageName(),fp,a.ffit||null,x,PETY+dy); },
  front(e){ if(e>900&&e<3200||e>4600&&e<6000){ blit(ctx,kind()==='dog'?SPR.ball:SPR.yarn,Math.round(64+Math.sin(e/500)*16)-5,Math.round(78-Math.abs(Math.sin(e/250))*16)); } },
  tick(a,e,now){ if(now>=a.next&&e>900&&e<6000){ spawn('heart',64+rand(-24,24),52,rand(-5,5),-14,1.3); if(Math.random()<.4) play('bounce',.4); a.next=now+500; }
    if(e>3200) once(a,'c',()=>{ setCaption(`${state.name} and ${a.fname} are best buddies.`); play(happyNoise(),.5); });
    if(e>6000) once(a,'b',()=>setCaption(`Bye, ${a.fname}! See you next time.`)); },
  end(a){ state.stats.fun=clamp(state.stats.fun+25,FLOOR,100); addStars(1); setCaption(`What a fun play date! You earned a care star.`);
    if(a&&a.isNew){ state.friends=(state.friends||[]).concat([{name:a.fname,style:a.friend}]).slice(-6); addPhoto('friend',`Play date with ${a.fname}.`,{fstyle:a.friend}); }
    else if(a&&a.neighbor&&firstTime('neighbor:'+a.fname)) addPhoto('friend',`Play date with ${a.fname} from down the street.`,{fstyle:a.friend}); }};
V['event:bark']={dur:5000,
  start(){ setCaption(`${state.name} hears something outside!`); play('knock',.6); },
  pose(p,e){ const d=toWin()/4; if(e<700){ p.ear=1; p.headDy=-1; p.eyes='open'; p.dx=Math.round(d*.75); } else if(e<3000){ const t=(e-700)%450, on=t<180; p.mouth=on?'open':'smile'; p.dy=on?-1:0; p.eyes='open'; p.dx=Math.round(d); p.ear=1; } else { p.eyes='happy'; p.mouth='tongue'; p.wag=80; } },
  behind(e){ if(e>900&&e<3300){ const w=WIN(), k=ph(e,900,3300), x=lerp(w.x-6,w.x+w.w+6,k), bob=Math.floor(e/200)%2; ctx.save(); ctx.beginPath(); ctx.rect(w.x,w.y,w.w,w.h); ctx.clip();
    const y=w.y+10; pxEll(ctx,x,y+bob,3.2,3.2,'#4A5566'); rect(ctx,x-4,y+4+bob,8,16,'#4A5566'); rect(ctx,x+3,y+7+bob,5,6,'#6A5A40'); ctx.restore(); } },
  tick(a,e){ [800,1250,1700,2150,2600].forEach((t,i)=>{ if(e>t) once(a,'b'+i,()=>{ play('pet:bark',.6); spawn('exclaim',70,headTopOf(p0()),rand(-4,4),-12,.6); }); });
    if(e>3000) once(a,'d',()=>setCaption(`It was only the mail carrier. Good job keeping watch, ${state.name}!`)); }};
V['event:hide']={dur:6000,
  start(){ setCaption(`Boom! Thunder! ${state.name} runs and hides.`); play('thunder',.8); },
  st(e){ if(e<500) return {dx:0,dy:-3}; if(e<1000) return {dx:Math.round(lerp(0,92,ph(e,500,1000))),dy:0}; if(e<2400) return {dx:92,dy:0}; if(e<3600) return {dx:Math.round(lerp(92,60,ph(e,2400,2700))),dy:0}; if(e<4300) return {dx:Math.round(lerp(60,0,ph(e,3600,4300))),dy:0}; return {dx:0,dy:0}; },
  pose(p,e){ const s=this.st(e); p.dx=s.dx; p.dy=s.dy; if(e>=500&&e<1000){ p.body='run'; p.face=1; p.frame=Math.floor(e/90)%4; p.dy=0; } else if(e>=1000&&e<2400){ p.body='stand'; p.face=1; } else if(e>=2400&&e<2700){ p.body='walk'; p.face=-1; p.frame=Math.floor(e/140)%4; } else if(e>=2700&&e<3600){ p.body='stand'; p.face=-1; } else if(e>=3600&&e<4300){ p.body='walk'; p.face=-1; p.frame=Math.floor(e/140)%4; } p.eyes=e<3600?'open':'happy'; p.mouth=e<500?'open':'smile'; p.ear=e<3600?1:Math.floor(e/400)%2; p.wag=e<3600?0:300; },
  behind(e){ drawWindowRain(e); },
  overlay(e){ const f=(e<150||(e>250&&e<350))?.6:(e>1800&&e<1900)?.35:0; if(f){ ctx.fillStyle=`rgba(255,255,255,${f})`; fillView(ctx); } },
  tick(a,e,now){ if(e>500&&e<1000&&now>=a.next){ spawn('puff',64+this.st(e).dx,86,rand(-10,0),-4,.5); a.next=now+50; } if(e>1800) once(a,'t2',()=>play('thunder',.5)); if(e>2000) once(a,'w',()=>play('pet:meowSad',.35));
    if(e>2400) once(a,'p',()=>setCaption(`${state.name} peeks out to see if it's safe.`)); if(e>3600) once(a,'o',()=>{ setCaption(`The storm passed. ${state.name} comes back out.`); play('pet:trill',.5); });
    if(e>4300&&now>=a.next){ spawn('heart',64+rand(-12,12),54,rand(-5,5),-14,1.2); a.next=now+400; } }};
V['event:mud']={dur:6400,noShadow:true,
  start(){ setCaption(`${state.name} spotted a mud puddle in the backyard!`); },
  scene(){ drawYard(); },
  pose(p,e){ p.eyes='happy'; p.mouth='tongue'; p.wag=70;
    if(e<1100){ p.body='run'; p.face=1; p.frame=Math.floor(e/90)%4; } if(e<600) p.dx=Math.round(lerp(-60,-30,e/600)); else if(e<1100){ const k=ph(e,600,1100); p.dx=Math.round(lerp(-30,0,k)); p.dy=Math.round(arc(k,10)); }
    else if(e<3800){ p.dx=(Math.floor(e/90)%2)?2:-2; p.dy=1; p.ear=Math.floor(e/90)%2; p.mouth='open'; } },
  overlay(e,a){ fadeOverlay(e,a.dur); },
  tick(a,e,now){ if(e>1100) once(a,'s',()=>{ setCaption(`Splash! ${state.name} is rolling in the mud.`); play('splat',.7); later(()=>play('pet:barkHappy',.5),300); });
    if(e>1100&&e<3800&&now>=a.next){ for(let i=0;i<3;i++) spawn('crumb',64+rand(-18,18),84,rand(-40,40),rand(-50,-20),.7,pick(['#5A3D22','#7E5A36'])); if(Math.random()<.4) play('splat',.4); a.next=now+120; }
    if(e>1500) once(a,'m',()=>{ state.muddy=true; state.stats.clean=0; save(); updateMeters(); }); },
  end(){ setCaption(`Uh oh! ${state.name} is covered in mud. Time for a bath!`); play(petNoise(),.5); if(firstTime('mud')) addPhoto('mud',`Mud day! ${state.name} got so messy.`); }};
V['event:gift']={dur:4600,init(a){ a.toy=a.toy||pick(unownedToys().length?unownedToys():ownedToys()); },
  start(){ setCaption('A package arrived at the door!'); play('dingdong',.5); },
  gx(e){ return e<500?lerp(130,84,e/500):84; },
  pose(p,e){ p.dx=4; p.eyes=e<1400?'open':'happy'; p.mouth=e<1400?'smile':'tongue'; if(e>1400&&e<2400) p.dy=-Math.round(Math.abs(Math.sin(e/150))*3); },
  front(e,a){ const x=Math.round(this.gx(e)); drawGift(x,74,e<1400?0:(e<2000?Math.round((e-1400)/40):null),a.box);
    if(e>1400){ const k=ph(e,1400,2200), s=SPR[a.toy]; blit(ctx,s,lerp(x+6,70,k),lerp(70,86-s.lh,k)+arc(k,22)); } },
  tick(a,e){ if(e>1400) once(a,'o',()=>{ burst(8); play('happy',.6); const isNew=!ownedToys().includes(a.toy); if(isNew){ state.toys=ownedToys().concat([a.toy]); save(); }
    setCaption(isNew?`It's a brand new ${toyName(a.toy)} for ${state.name}! It goes in the toy box.`:`It's another ${toyName(a.toy)}. ${state.name} loves it!`); }); if(e>2300) once(a,'n',()=>play(toySqueaks(a.toy)?'squeak':happyNoise(),.5)); },
  end(){ state.stats.fun=clamp(state.stats.fun+15,FLOOR,100); }};
V['event:rain']={dur:5600,
  start(a){ const n=state.name; setCaption(a.mode==='fort'?`Pillow fort time! ${n} peeks out from inside.`:a.mode==='watch'?`${n} watches the raindrops on the window.`:`A cozy blanket snuggle with ${n}.`); play('rustle',.3); if(a.mode!=='watch'&&kind()==='cat') later(()=>play('pet:purr',.45),900); },
  pose(p,e,a){ if(a.mode==='watch'){ const tw=toWin(); p.dx=e<700?Math.round(tw*e/700):tw; if(e<700&&tw){ p.body='walk'; p.face=tw>0?1:-1; p.frame=Math.floor(e/140)%4; } p.eyes='open'; p.headDy=-1; p.ear=Math.floor(e/700)%2; if(e>3800){ p.eyes='happy'; p.mouth='tongue'; } } else { p.eyes=(e>800&&e<5000)?(a.mode==='fort'?'happy':'closed'):'happy'; p.dy=0; } },
  behind(e,a){ const w=WIN(); if(a.mode==='watch'&&e>3800){ ctx.save(); ctx.beginPath(); ctx.rect(w.x,w.y,w.w,w.h); ctx.clip(); ['#E8757A','#F4B942','#F4E27A','#8CC98A','#7FA8D8','#B89AD8'].forEach((c,i)=>pxRing(ctx,w.x+w.w/2,w.y+w.h+2,w.w*.5-i,w.h*.72-i,1,c)); ctx.restore(); } else drawWindowRain(e); },
  front(e,a){ if(a.mode==='blanket') drawBlanket(Math.round(PETY+G().collar+(big()?1:0)+slide(e,5600,700,500,60)));
    if(a.mode==='fort'){ const o=Math.round(slide(e,5600,600,500,50)); rect(ctx,33,51+o,62,6,INK); for(let x=34;x<94;x+=4) rect(ctx,x,52+o,4,4,(((x-34)/4)%2)?'#F2A7B5':'#FFF1C9'); rect(ctx,34,56+o,3,12,'#F2A7B5'); rect(ctx,91,56+o,3,12,'#F2A7B5');
      [[34,68,'#9FC4E8'],[80,68,'#F4D27A'],[34,78,'#9CC7A7'],[80,78,'#F2A7B5']].forEach(([x,y,c])=>{ rect(ctx,x-1,y-1+o,17,11,INK); rect(ctx,x,y+o,15,9,c); rect(ctx,x+1,y+1+o,13,1,'#FFFFFF'); }); } },
  tick(a,e,now){ if(e>800&&e<5000&&now>=a.next){ spawn('heart',64+rand(-12,12),PETY+10,rand(-5,5),-14,1.4); a.next=now+600; }
    if(a.mode==='watch'&&e>3800) once(a,'rb',()=>{ setCaption('The rain stopped. Look, a rainbow!'); play('sparkle',.6); }); },
  end(){ state.stats.energy=clamp(state.stats.energy+15,FLOOR,100); }};

/* ---- Chores: a button appears until the player takes care of it ---- */
V['task:potty']={dur:2800,
  start(){ setCaption('Bag it up and toss it out.'); },
  hand(e){ const x=10+FIX.dx, y0=76+FIX.dy; if(e<900) return {x,y:lerp(-16,y0,e/900)}; if(e<1200) return {x,y:y0}; return {x,y:lerp(y0,-18,ph(e,1200,2000))}; },
  pose(p,e){ p.dx=-3; p.eyes=e<2000?'open':'happy'; p.mouth=e<2000?'smile':'tongue'; },
  front(e){ const h=this.hand(e), n=pottyCount()||1; if(e<1050) for(let i=0;i<n;i++) blit(ctx,SPR.poop,11+FIX.dx+(n>1?i*7-4:0),82+FIX.dy+i*.5); if(e<2000) blit(ctx,SPR.poopbag,h.x,h.y); },
  tick(a,e,now){ if(e>1100) once(a,'g',()=>play('rustle',.5)); if(e>2000&&now>=a.next){ spawn('sparkleSmall',rand(6,26)+FIX.dx,rand(82,92)+FIX.dy,0,-6,.7); a.next=now+120; } if(e>2100) once(a,'h',()=>play(happyNoise(),.45)); }};
V['task:litter']={dur:3000,
  start(){ setCaption('Scoop, scoop, scoop.'); },
  pose(p,e){ p.dx=-3; p.eyes='open'; if(e>2400){ p.eyes='happy'; p.mouth='tongue'; } },
  front(e){ const n=pottyCount()||1, left=Math.max(0,n-(e<900?0:e<1500?1:2)); drawLumps(left); if(e<2600){ const tgt=LUMPS[Math.min(2,Math.floor(e/650))], dip=(e%650)<300; const x=e<2200?tgt[0]-6:lerp(tgt[0]-6,tgt[0]+60,ph(e,2200,2600)), y=e<2200?(dip?tgt[1]-10:tgt[1]-16):lerp(tgt[1]-16,-20,ph(e,2200,2600)); blit(ctx,SPR.scooper,x,y); } },
  tick(a,e){ [900,1500,2100].forEach((t,i)=>{ if(e>t) once(a,'l'+i,()=>{ play('rustle',.4); spawn('sparkleSmall',LUMPS[2-i][0],LUMPS[2-i][1],0,-8,.6); }); }); if(e>2500) once(a,'h',()=>play('pet:trill',.45)); }};
V['task:water']={dur:3400,
  start(){ setCaption('Pouring fresh, cool water.'); play('pour',.5); },
  pose(p,e){ if(e<1200){ p.eyes='open'; p.dx=6; } else if(e<1700){ p.body='walk'; p.face=1; p.frame=Math.floor(e/140)%4; p.dx=Math.round(lerp(6,toWater(),ph(e,1200,1700))); } else if(e<2900){ p.body='stand'; p.face=1; p.dx=toWater(); p.headDy=3; p.eyes='closed'; p.mouth=Math.floor(e/180)%2?'tongue':'smile'; } else { p.body='walk'; p.face=-1; p.frame=Math.floor(e/140)%4; p.dx=Math.round(lerp(toWater(),0,ph(e,2900,3400))); p.eyes='happy'; } },
  /* A jug tips over the bowl and pours a stream right into it. */
  behind(e){ const wx=STATION.water[0], wy=STATION.water[1]; blit(ctx,waterBowl(e<1200),wx,wy);
    if(e<1400){ const tip=e<250?ph(e,0,250):e>1150?1-ph(e,1150,1400):1, jx=wx+9, jy=lerp(40,wy-22,Math.min(1,e/250)), sx=jx-2-tip*3, sy=jy+5-tip*2;
      if(tip>.8&&e>250&&e<1150) for(let y=sy;y<wy+1;y+=1) rect(ctx,sx+Math.sin((y+e/30)/2)*.3-.6,y,1.4,1,y%2<1?'#9FD4F0':'#CFEAF8');
      ctx.save(); ctx.translate(jx,jy); ctx.rotate(-tip*.7); rect(ctx,-3.2,-5.2,7.4,10.4,INK); rect(ctx,-2.6,-4.6,6.2,9.2,'#7FA8D8'); rect(ctx,-2.6,-4.6,6.2,1.6,'#A8C8EC'); rect(ctx,-5,-4.4,2.4,1,INK); rect(ctx,-4.6,-4,1.8,.5,'#7FA8D8'); pxRing(ctx,4.4,0,2.2,3,.8,INK); ctx.restore(); } },
  tick(a,e,now){ if(e>300&&e<1150&&now>=a.next){ spawn('drop',STATION.water[0]+rand(4,10),STATION.water[1]+1,rand(-14,14),rand(-26,-10),.32,null); a.next=now+110; } if(e>1700&&e<2900&&now>=a.next2){ play('lap',.35); a.next2=now+360; } }};
V['task:toys']={dur:3000,
  start(){ setCaption('Tidy time. Toys go in the basket.'); },
  pose(p,e){ p.eyes='open'; p.mouth='smile'; if(e>2300){ p.eyes='happy'; p.mouth='tongue'; } },
  bx(e){ return e<400?lerp(130,104,e/400):e>2500?lerp(104,130,ph(e,2500,3000)):104; },
  front(e){ const bx=STATION.basket[0]+3, by=STATION.basket[1]+1, flying=[500,1000,1500,2000];
    TOY_SPOTS.forEach(([t,x,y],i)=>{ const s0=flying[i]; if(e<s0) blit(ctx,SPR[t],x,y); else if(e<s0+450){ const k=(e-s0)/450; blit(ctx,SPR[t],lerp(x,bx,k),lerp(y,by,k)+arc(k,22)); } }); },
  tick(a,e){ [950,1450,1950,2450].forEach((t,i)=>{ if(e>t) once(a,'t'+i,()=>play('pop',.4)); }); }};
const ICON_BASKET_BIG=sprite(22,22,b=>{ part(b,T=>{ for(let a=0;a<=40;a++){ const t=Math.PI*a/40; E(T,11-Math.cos(t)*7.4,9-Math.sin(t)*6.6,.8,.8,'#8A6234'); } }); part(b,T=>R(T,1,8,20,13,(x,y)=>alt2(x*.9+y*.9,'#C99A62','#E3BC84'),SH,1.4)); });
V['task:plant']={dur:3000,
  start(){ setCaption('Sweep up the dirt and stand the plant back up.'); },
  pose(p,e){ p.eyes='open'; p.mouth='smile'; if(e>2000){ p.eyes='happy'; p.mouth='tongue'; } },
  front(e){ const pa=plantAnchor(); if(!pa) return; if(e<1600){ drawPlantTipped(pa,1-ph(e,200,1500)); blit(ctx,ICONS.broom,pa.x-10+Math.sin(e/120)*6,pa.y+19); } else blit(ctx,itemSprite('plant'),pa.x,pa.y); },
  tick(a,e,now){ const pa=plantAnchor(); if(pa&&e<1500&&now>=a.next){ spawn('puff',pa.x-6+rand(-8,8),pa.y+29,rand(-12,12),-6,.5,'#8A6440'); play('rustle',.2); a.next=now+200; } if(e>1600) once(a,'u',()=>{ play('happy',.5); burst(5); }); }};
/* A stethoscope resting on the pet's chest: the round chest piece, a curved tube out to the side, a
   Y where it splits, and two metal ear tubes ending in earpieces. */
function drawStethoscope(cx,cy){ const TUBE='#3A3E46', METAL='#AEB6C0', jx=cx-19, jy=cy-7;
  const curve=(x0,y0,qx,qy,x1,y1,c,w)=>{ let px=x0, py=y0; for(let i=1;i<=10;i++){ const t=i/10, u=1-t, x=u*u*x0+2*u*t*qx+t*t*x1, y=u*u*y0+2*u*t*qy+t*t*y1; pxLine(ctx,px,py,x,y,c,w); px=x; py=y; } };
  curve(cx-3,cy+.5,cx-12,cy+6,jx,jy,INK,1.6); curve(cx-3,cy+.5,cx-12,cy+6,jx,jy,TUBE,.9);
  [-1,1].forEach(s=>{ const tx=jx+s*3, ty=jy-5; curve(jx,jy,jx+s*.6,jy-3,tx,ty,INK,1.5); curve(jx,jy,jx+s*.6,jy-3,tx,ty,TUBE,.8);
    curve(tx,ty,tx+s*1.4,ty-3.5,tx-s*.6,ty-6.5,INK,1.1); curve(tx,ty,tx+s*1.4,ty-3.5,tx-s*.6,ty-6.5,METAL,.5);
    pxEll(ctx,tx-s*.8,ty-6.9,1.3,1.1,INK); pxEll(ctx,tx-s*.8,ty-6.9,.8,.6,'#5A5E66'); });
  pxEll(ctx,jx,jy,1.3,1.3,INK); pxEll(ctx,jx,jy,.7,.7,METAL);
  pxEll(ctx,cx,cy,3.4,3.4,INK); pxEll(ctx,cx,cy,2.7,2.7,'#C8CED6'); pxEll(ctx,cx,cy,1.6,1.6,'#9AA3AE'); pxEll(ctx,cx-.9,cy-.9,.6,.6,'#FFFFFF'); }
V['task:vet']={dur:7800,noShadow:true,
  start(){ setCaption(`Checkup time at the vet. ${state.name} hops up on the table.`); },
  scene(){ drawVet(); },
  pose(p,e){ p.dy=-6; p.eyes='open'; if(e>1800&&e<3700){ p.eyes='closed'; } if(e>3800&&e<5400){ p.ear=Math.floor(e/300)%2; } if(e>5500&&e<6300){ p.mouth='open'; p.headDy=-1; } if(e>6300){ p.eyes='happy'; p.mouth='tongue'; p.wag=90; } },
  front(e,a,p){ const cx=64+p.dx, cy=chestAt(p);
    if(e>1800&&e<3700) drawStethoscope(cx+(e>2750?3:0),cy);
    if(e>3800&&e<5400&&Math.floor(e/200)%2){ const ex=PETX+22-G().headRx+p.dx, ey=PETY+p.dy+G().top+6; rect(ctx,ex-3,ey,3,2,'#3A3E46'); rect(ctx,ex,ey,2,2,'#FFE27A'); glow(ctx,ex+2,ey+1,4,'#FFF3B0',.5); }
    if(e>5500&&e<6200){ const k=ph(e,5500,6100), m=mouthAt(p); blit(ctx,SPR.bone,lerp(118,m.x,k)-6,lerp(30,m.y,k)+arc(k,16)-4); } },
  overlay(e,a){ fadeOverlay(e,a.dur); },
  tick(a,e,now){
    if(e>1800) once(a,'h',()=>setCaption("Listening to the heartbeat. It sounds great!"));
    if(e>1800&&e<3700&&now>=a.next){ play('beat',.6); spawn('heart',70,PETY-2,4,-10,.8); a.next=now+650; }
    if(e>3800) once(a,'x',()=>setCaption('Checking ears and teeth. All good!'));
    if(e>5500) once(a,'t',()=>setCaption(`${state.name} is healthy and happy! A treat for being brave.`));
    if(e>6150) once(a,'c',()=>{ play('crunch',.6); burst(8); play('happy',.6); later(()=>play(happyNoise(),.5),500); }); }};

/* ---- Welcome back surprises ---- */
const holdPose=(p,e)=>{ p.eyes=e<700?'closed':'happy'; p.mouth=e<700?'smile':'tongue'; p.wag=80; if(e>700&&e<1300) p.dy=-Math.round(Math.abs(Math.sin(e/150))*3); };
V['welcome:drawing']={dur:3600,pose:holdPose,front(e){ if(e>700){ const k=ph(e,700,1100); drawPainting(76,Math.round(lerp(96,66,k))); } },
  tick(a,e){ if(e>700) once(a,'s',()=>{ play('sparkle',.5); burst(6); }); if(e>1500) once(a,'ph',()=>addPhoto('drawing',`${state.name} painted you a picture.`)); }};
V['welcome:postcard']={dur:3600,pose:holdPose,front(e,a){ if(e>700){ const k=ph(e,700,1100); drawPostcard(75,Math.round(lerp(96,66,k)),a.fstyle); } },
  tick(a,e){ if(e>700) once(a,'s',()=>{ play('ding',.5); burst(5); }); if(e>1500) once(a,'ph',()=>addPhoto('postcard',`A postcard from ${a.fname}.`,{fstyle:a.fstyle})); }};
V['welcome:toy']={dur:3200,init(a){ a.toy=pick(ownedToys().concat(['sock'].filter(()=>kind()==='dog'))); },pose:holdPose,
  front(e,a,p){ if(e>700){ const m=mouthAt(p), s=SPR[a.toy]; blit(ctx,s,m.x-s.lw/2,m.y-2); } }, tick(a,e){ if(e>700) once(a,'s',()=>{ play(toySqueaks(a.toy)?'squeak':'happy',.5); burst(5); }); }};
V['welcome:flower']={dur:3200,pose:holdPose,front(e,a,p){ if(e>700){ const m=mouthAt(p); drawFlower(m.x+3,m.y-5); } }, tick(a,e){ if(e>700) once(a,'s',()=>{ play('sparkle',.5); burst(5); }); }};

/* ---- Toy box ---- */
V['play:toybox']={dur:3800,
  init(a){ a.toy=pickToy(); playedToy(a.toy); a.disc=a.toy==='frisbee'; },
  toyPos(e,a){
    if(a.disc){ if(e<1400){ const k=e/1400; return {x:lerp(132,74,k),y:lerp(40,54,k)}; } if(e<3400) return {held:true}; return {x:70,y:86}; }
    if(e<900){ const k=e/900; return {x:lerp(130,98,k),y:lerp(30,86,k)+arc(k,18)}; }
    if(e<1500) return {x:98,y:86+(Math.floor(e/100)%2)}; if(e<3200) return {held:true}; return {x:72,y:86}; },
  pose(p,e,a){ p.eyes='open'; p.wag=80;
    if(a.disc){ if(e<1100) p.headDy=-1; else if(e<1500){ const k=ph(e,1100,1500); p.dy=Math.round(arc(k,10)); p.dx=Math.round(lerp(0,8,k)); p.mouth='open'; }
      else if(e<3400){ p.dx=Math.round(lerp(8,0,ph(e,1500,2200))); p.eyes='happy'; } else { p.eyes='happy'; p.mouth='tongue'; } return; }
    if(e<900) p.headDy=-1;
    else if(e<1500){ const k=ph(e,900,1300); p.dx=Math.round(lerp(0,30,k)); p.dy=e>1300?Math.round(arc(ph(e,1300,1500),5)):0; p.eyes='happy'; if(e<1300){ p.body='run'; p.face=1; p.frame=Math.floor(e/90)%4; } }
    else if(e<2200){ p.dx=Math.round(lerp(30,0,ph(e,1500,2200))); p.eyes='happy'; p.dy=0; p.body='walk'; p.face=-1; p.frame=Math.floor(e/140)%4; }
    else if(e<3200){ p.eyes='happy'; p.wag=60; p.headDy=Math.floor(e/250)%2; }
    else { p.eyes='happy'; p.mouth='tongue'; } },
  front(e,a,p){ const t=this.toyPos(e,a), s=SPR[a.toy]; if(t.held){ const m=mouthAt(p); blit(ctx,s,m.x-s.lw/2,m.y-2); } else blit(ctx,s,t.x-s.lw/2,t.y-s.lh); },
  tick(a,e){ if(e>300) once(a,'n',()=>{ setCaption(`${state.name} plays with the ${toyName(a.toy)}!`); play('whoosh',.4); });
    if(e>(a.disc?1400:1500)) once(a,'c',()=>{ play(toySound(a.toy),.6); spawn('sparkle',72,64,0,-8,.7); if(a.disc) setCaption(`Great catch, ${state.name}!`); });
    if(e>2500) once(a,'s2',()=>play(toySound(a.toy),.45)); if(e>3300) once(a,'h',()=>play(happyNoise(),.5)); }};

/* ---- Fetch and frisbee: your hand throws, the pet runs ----
   Which toy comes out: a toy that hasn't been played with yet goes first (so a new toy from the pet
   store shows up the very next play time), then the toys played with least. */
function pickToy(ok){ const own=ownedToys().filter(ok||(()=>true)), all=own.length?own:ownedToys(), pl=state.toyPlays||{}, min=Math.min(...all.map(t=>pl[t]||0)); return pick(all.filter(t=>(pl[t]||0)===min)); }
function playedToy(t){ state.toyPlays=Object.assign({},state.toyPlays||{}); state.toyPlays[t]=(state.toyPlays[t]||0)+1; }
const hasNewToy=()=>!!state&&ownedToys().some(t=>!(state.toyPlays||{})[t]);
const throwHand=(e,hx,t0,t1)=>{ if(e<0||e>t1) return null; let x=hx, y; if(e<600) y=lerp(-24,30,e/600); else if(e<t0){ const k=ph(e,600,t0); x=hx+k*6; y=30-k*4; } else if(e<t0+250){ const k=ph(e,t0,t0+250); x=hx+6-k*16; y=26+k*2; } else { x=hx-10; y=lerp(28,-26,ph(e,t1-500,t1)); } blit(ctx,SPR.hand,x,y); return {x,y}; };
V['play:fetch']={dur:5800,
  init(a){ a.toy=pickToy(t=>t!=='frisbee'); playedToy(a.toy); a.cat=kind()==='cat'; },
  land:6,
  pose(p,e,a){ p.eyes='open'; p.wag=80; const L=-50;
    if(e<1100){ p.headDy=-1; if(e>900) p.eyes='happy'; return; }
    if(e<2300){ p.body='run'; p.face=-1; p.frame=Math.floor(e/90)%4; p.dx=Math.round(lerp(0,L,ph(e,1100,2300))); p.eyes='happy'; return; }
    if(a.cat){ if(e<2900){ p.dx=L; p.dy=Math.round(arc(ph(e,2300,2700),6)); p.eyes='happy'; p.mouth='open'; return; }
      if(e<4200){ p.body='walk'; p.face=1; p.frame=Math.floor(e/140)%4; p.dx=Math.round(lerp(L,0,ph(e,2900,4200))); return; } p.eyes='happy'; p.mouth='smile'; return; }
    if(e<2600){ p.dx=L; p.headDy=2; p.body='stand'; p.face=-1; return; }
    if(e<3800){ p.body='run'; p.face=1; p.frame=Math.floor(e/90)%4; p.dx=Math.round(lerp(L,14,ph(e,2600,3800))); p.mouth='open'; return; }
    p.dx=14; p.eyes='happy'; p.mouth=e<4600?'open':'tongue'; },
  front(e,a,p){ const s=SPR[a.toy]; if(!s) return; const hand=throwHand(e,94,900,a.cat?2600:(e<3900?2000:5600));
    if(e<900&&hand){ blit(ctx,s,hand.x+4-s.lw/2+6,hand.y+14-s.lh/2); return; }
    if(e<1900){ const k=ph(e,900,1900); blit(ctx,s,lerp(96,this.land,k)-s.lw/2,lerp(44,86,k)+arc(k,28)-s.lh); return; }
    if(a.cat){ const bx=e<2700?this.land:this.land+Math.round(arc(ph(e,2700,3200),0))-Math.min(10,ph(e,2700,3200)*10); blit(ctx,s,bx-s.lw/2,86-s.lh+(e>2700&&e<3200?Math.round(arc(ph(e,2700,3200),6)):0)); return; }
    if(e<2600){ blit(ctx,s,this.land-s.lw/2,86-s.lh); return; }
    if(e<4400){ const m=mouthAt(p); blit(ctx,s,m.x-s.lw/2,m.y-2); if(e>3900){ const k=ph(e,3900,4400); blit(ctx,SPR.hand,lerp(110,m.x-4,k),lerp(-20,m.y-18,k)); } return; }
    const k=ph(e,4400,5400); blit(ctx,SPR.hand,lerp(78-4,110,k),lerp(64+14-18-18,-26,k)); blit(ctx,s,lerp(78,114,k)-s.lw/2,lerp(64+14-16,-10,k)); },
  tick(a,e){ if(e>300) once(a,'c',()=>setCaption(a.cat?`Ready? Throw! ${state.name} chases the ${toyName(a.toy)}!`:`Ready? Throw! Go get the ${toyName(a.toy)}, ${state.name}!`));
    if(e>900) once(a,'w',()=>play('whoosh',.45)); if(e>1900) once(a,'l',()=>play('bounce',.45));
    if(a.cat){ if(e>2500) once(a,'p',()=>{ play(toySound(a.toy),.55); spawn('sparkle',this.land,76,0,-8,.7); setCaption(`Pounce! ${state.name} got the ${toyName(a.toy)}!`); }); if(e>4300) once(a,'h',()=>play(happyNoise(),.45)); return; }
    if(e>2400) once(a,'g',()=>play(toySound(a.toy),.55));
    if(e>3900) once(a,'b',()=>{ setCaption(`${state.name} brought back the ${toyName(a.toy)}! Good dog!`); play(happyNoise(),.5); burst(5); }); }};
V['play:frisbee']={dur:4800,
  pose(p,e){ p.eyes='open'; p.wag=80; if(e<1200){ p.headDy=-1; return; }
    if(e<2000){ const k=ph(e,1200,2000); p.dy=Math.round(arc(k,18)); p.dx=Math.round(lerp(0,-6,k)); p.mouth='open'; p.eyes='happy'; return; }
    p.dx=Math.round(lerp(-6,0,ph(e,2000,2600))); p.eyes='happy'; p.mouth='open'; if(e>2200&&e<3200){ p.body='walk'; p.face=1; p.frame=Math.floor(e/140)%4; } },
  front(e,a,p){ const hand=throwHand(e,96,900,2400), s=SPR.frisbee;
    if(e<900&&hand){ blit(ctx,s,hand.x+3,hand.y+15); return; }
    if(e<1600){ const k=ph(e,900,1600), m=mouthAt(p); blit(ctx,s,lerp(100,m.x,k)-s.lw/2,lerp(44,m.y,k)-arc(k,10)*-1-8*Math.sin(k*Math.PI)-3); return; }
    const m=mouthAt(p); blit(ctx,s,m.x-s.lw/2,m.y-2);
    if(e>3400){ const k=ph(e,3400,3900); blit(ctx,SPR.hand,lerp(110,m.x+2,k),lerp(-22,m.y-20,k)+(e>3900?Math.sin(e/120)*1.5:0)); } },
  tick(a,e){ if(e>300) once(a,'c',()=>setCaption(`Here comes the frisbee! Jump, ${state.name}!`)); if(e>900) once(a,'w',()=>play('whoosh',.5));
    if(e>1600) once(a,'k',()=>{ play('pop',.6); burst(6); setCaption(`Great catch, ${state.name}!`); later(()=>play(happyNoise(),.45),300); }); if(e>3900) once(a,'p',()=>play('pet:sigh',.35)); }};

/* ---- Special treats ---- */
function drawCake(x,y,bites,lit,e){ const cat=kind()==='cat', w=Math.max(0,14-bites*3);
  pxEll(ctx,x+7,y+10,10,2.4,INK); pxEll(ctx,x+7,y+10,9,1.8,'#FFFFFF');
  if(w>0){ rect(ctx,x-1,y+1,w+2,9,INK); rect(ctx,x,y+2,w,7,cat?'#9FC4E8':'#F2A7B5'); rect(ctx,x,y+2,w,2,'#FFFFFF'); for(let i=0;i<w;i+=3) rect(ctx,x+i,y+4,1,1,'#FFFFFF');
    [[2,5,'#F4C542'],[6,6,'#7FB08C'],[10,5,'#5A8FC4']].forEach(([sx,sy,c])=>{ if(sx<w) rect(ctx,x+sx,y+sy,1,1,c); }); }
  if(w>=8){ rect(ctx,x+6,y-3,2,5,'#F4C542'); if(lit){ const f=Math.floor(e/120)%2; rect(ctx,x+6,y-6+f,2,3,'#FF9A4A'); rect(ctx,x+6,y-5+f,1,1,'#FFE27A'); glow(ctx,x+7,y-5,6,'#FFD27A',.5); } } }
V['feed:cake']={dur:3400,
  pose(p,e){ if(e<700){ p.eyes='open'; p.headDy=-1; } else if(e<900){ p.mouth='open'; p.headDy=-1; p.eyes='closed'; } else if(e<2700){ const b=Math.floor(e/240)%2; p.headDy=1+b; p.eyes='closed'; p.mouth=b?'open':'smile'; p.dy=0; } else { p.eyes='happy'; p.mouth='tongue'; } },
  front(e){ const y=e<400?Math.round(lerp(96,76,e/400)):76; drawCake(57,y,e<1100?0:e<1700?1:e<2300?2:e<2700?3:5,e<800,e); },
  tick(a,e,now){ if(e>750) once(a,'w',()=>{ play('whoosh',.5); setCaption('Make a wish!'); for(let i=0;i<5;i++) spawn('sparkleSmall',64,72,rand(-10,10),-10,.6); });
    if(e>1000&&e<2700&&now>=a.next){ crumbs(64,80,kind()==='cat'?'#9FC4E8':'#F2A7B5'); play('crunch',.45); a.next=now+420; }
    if(e>2750) once(a,'c',()=>{ play('fanfare',.5); for(let i=0;i<14;i++) spawn('confetti',rand(20,108),rand(-4,10),rand(-8,8),rand(14,26),2.4,pick(['#F07A8E','#F4C542','#7FB08C','#7FA8D8','#B89AD8'])); }); }};
V['feed:feast']={dur:3600,
  pose(p,e){ if(e<1100){ p.eyes='open'; p.mouth=e>700?'tongue':'smile'; } else if(e<2900){ const b=Math.floor(e/240)%2; p.headDy=1+b; p.eyes='closed'; p.mouth=b?'open':'smile'; p.dy=0; } else { p.eyes='happy'; p.mouth='tongue'; } },
  front(e){ const y=e<400?Math.round(lerp(98,84,e/400)):84, left=e<1300?1:e<2000?.7:e<2600?.4:e<2900?.15:0;
    pxEll(ctx,64,y+2,16,3.4,INK); pxEll(ctx,64,y+2,15,2.7,'#FFFFFF'); pxEll(ctx,64,y+2,12,1.6,'#EEF3FA');
    if(left>0){ if(kind()==='cat'){ const s=SPR.fish; blit(ctx,s,64-s.lw/2,y-5); rect(ctx,72,y,3,2,'#F29A80'); }
      else { pxEll(ctx,62,y,6*left+1,2.6,INK); pxEll(ctx,62,y,5*left+1,1.9,'#8A4A2A'); rect(ctx,60,y-1,2,.5,'#B06A4A'); [[70,y+1],[72,y],[71,y+2]].forEach(q=>pxEll(ctx,q[0],q[1],.6,.6,'#7FB08C')); } }
    if(e<1100){ const up=e<700?0:ph(e,700,1100)*20; pxEll(ctx,64,y-up,13,7,INK); pxEll(ctx,64,y-up,12,6,'#C8CED6'); pxEll(ctx,60,y-3-up,4,2,'#FFFFFF'); rect(ctx,63,y-8-up,2,2,'#9AA4AE'); } },
  tick(a,e,now){ if(e>700) once(a,'l',()=>{ play('twinkle',.6); setCaption('Ta-da! Dinner is served.'); });
    if(e>1300&&e<2900&&now>=a.next){ crumbs(64,82,'#B06A4A'); play('crunch',.45); a.next=now+420; } if(e>2950) once(a,'c',()=>{ burst(8); play('happy',.6); later(()=>play(happyNoise(),.5),400); }); }};

/* ---- Special outings ---- */
V['event:parade']={dur:7000,
  start(){ setCaption(`It's the Pet Parade! ${state.name} marches down the street.`); play('cheer',.6); },
  scene(e){ drawTown(e); },
  pose(p,e){ p.eyes='happy'; p.mouth='tongue'; p.ear=Math.floor(e/150)%2; p.dy=0; p.wag=90; p.body='walk'; p.face=1; p.frame=Math.floor(e/140)%4; },
  front(e,a,p){ drawRibbon(neckAt(p).x,neckAt(p).y+2); },
  overlay(e,a){ fadeOverlay(e,a.dur); },
  tick(a,e,now){ if(now>=a.next){ spawn('confetti',rand(0,128),-2,rand(-6,6),rand(14,24),4,pick(['#F07A8E','#F4C542','#7FB08C','#7FA8D8','#B89AD8'])); a.next=now+90; }
    if(now>=a.next2){ play('step',.25); a.next2=now+300; }
    if(e>2600) once(a,'c',()=>{ setCaption(`The crowd cheers for ${state.name}!`); play('cheer',.6); later(()=>play(happyNoise(),.5),400); }); if(e>4800) once(a,'w',()=>{ setCaption(`${state.name} wins a ribbon for Best Smile!`); play('fanfare',.5); }); },
  end(){ addStars(1); setCaption(`What a parade! You earned a care star.`); if(firstTime('parade')) addPhoto('outing',`${state.name} marched in the Pet Parade.`,{scene:'parade'}); }};
V['event:agility']={dur:6400,noShadow:true,
  start(){ setCaption(`Agility show time! ${state.name} takes on the course.`); play('cheer',.5); },
  scene(e){ drawDogPark(e); [26,64,102].forEach(x=>{ rect(ctx,x-8,68,2,17,'#FFFFFF'); rect(ctx,x+6,68,2,17,'#FFFFFF'); for(let i=0;i<14;i+=4) rect(ctx,x-6+i,74,2,2,i%8?'#FFFFFF':'#D9403E'); }); },
  pose(p,e){ p.eyes='happy'; p.mouth='tongue'; p.wag=80;
    if(e>600&&e<4200){ const k=ph(e,600,4200); p.dx=Math.round(lerp(-54,54,k)); const x=64+p.dx, near=[26,64,102].map(h=>Math.abs(x-h)).reduce((a,b)=>Math.min(a,b)); p.dy=near<12?-Math.round(Math.cos(near/12*Math.PI/2)*12):0; p.ear=Math.floor(e/110)%2; p.body='run'; p.face=1; p.frame=Math.floor(e/90)%4; }
    else if(e>=4200&&e<4700){ p.dx=Math.round(lerp(54,0,ph(e,4200,4700))); p.body='walk'; p.face=-1; p.frame=Math.floor(e/140)%4; } },
  front(e,a,p){ if(e>4800) drawRibbon(neckAt(p).x,neckAt(p).y+2); },
  overlay(e,a){ fadeOverlay(e,a.dur); },
  tick(a,e,now){ if(e>600&&e<4200&&now>=a.next){ play('step',.3); a.next=now+160; } [1500,2700,3800].forEach((t,i)=>{ if(e>t) once(a,'j'+i,()=>play('whoosh',.4)); });
    if(e>4800) once(a,'w',()=>{ setCaption(`First place! ${state.name} wins a blue ribbon!`); play('fanfare',.6); play('cheer',.5); burst(10); later(()=>play('pet:barkHappy',.5),600); }); },
  end(){ addStars(1); if(firstTime('agility')) addPhoto('outing',`${state.name} won first place at the agility show.`,{scene:'agility'}); }};
V['event:cafe']={dur:6600,
  init(a){ const o=KIND_STYLES.cat.filter(s=>s!==state.style); a.nb=maybeNeighbor('cat',.5); a.f1=a.nb?a.nb.style:pick(o); a.f2=pick(o.filter(s=>s!==a.f1)); },
  start(){ setCaption(`${state.name} visits the cat café!`); play('dingdong',.5); },
  scene(){ drawCafe(); },
  behind(e,a){ const awake=e>3600; [[a.f1,-4,a.nb],[a.f2,88]].forEach(([st,x,nb])=>drawPet(ctx,st,nb?nb.sg:'baby',{eyes:awake?'happy':'closed',mouth:awake?'tongue':'smile',tail:Math.floor(e/400)%3,headDy:awake?0:1},nb?nb.fit:null,x,PETY+2)); },
  pose(p,e){ p.eyes=e<2400?'open':'happy'; if(e>2600&&e<3400){ const b=Math.floor(e/200)%2; p.headDy=b; p.mouth=b?'open':'smile'; p.eyes='closed'; } if(e>3600) p.mouth='tongue'; },
  front(e,a,p){ if(e>1800&&e<2600){ const k=ph(e,1800,2500), m=mouthAt(p); blit(ctx,SPR.fish,lerp(128,m.x,k)-6,lerp(20,m.y,k)+arc(k,14)-4); } },
  overlay(e,a){ fadeOverlay(e,a.dur); },
  tick(a,e,now){ if(e>1800) once(a,'t',()=>setCaption(`The barista brings ${state.name} a fish treat.`)); if(e>2550) once(a,'c',()=>play('crunch',.6));
    if(e>3600) once(a,'w',()=>{ setCaption(a.nb?`The café cats wake up to say hello, and so does ${a.nb.name} from down the street!`:`The café cats wake up to say hello!`); play('cat:meow:baby',.5); later(()=>play('cat:trill:baby',.4),350); });
    if(e>3600&&now>=a.next){ spawn('heart',rand(20,108),54,rand(-4,4),-12,1.3); a.next=now+450; } if(e>4300) once(a,'p',()=>play('pet:purr',.5)); },
  end(){ addStars(1); if(firstTime('cafe')) addPhoto('outing',`${state.name} visited the cat café.`,{scene:'cafe'}); }};
V['event:catshow']={dur:6400,noShadow:true,
  start(){ setCaption(`It's the cat show! ${state.name} steps into the spotlight.`); play('cheer',.4); },
  scene(e){ drawStage(e); },
  pose(p,e){ p.dy=-6; p.eyes=e<1500?'open':'happy'; if(e>1500&&e<2600){ p.dx=Math.round(Math.sin((e-1500)/160)*2); } if(e>3600) p.mouth='tongue'; p.wag=500; },
  front(e,a,p){ if(e>2600&&e<4600){ [[20,28],[40,20],[88,20],[108,28]].forEach(([x,y],i)=>{ if(e>2600+i*300){ rect(ctx,x-5,y-5,11,10,INK); rect(ctx,x-4,y-4,9,8,'#FFFFFF'); blit(ctx,SPR.heart,x-3.5,y-3); } }); }
    if(e>4600) drawRibbon(neckAt(p).x,neckAt(p).y+2); },
  tick(a,e){ if(e>1500) once(a,'s',()=>setCaption(`${state.name} shows off a perfect pose.`)); [2600,2900,3200,3500].forEach((t,i)=>{ if(e>t) once(a,'j'+i,()=>play('ding',.35)); });
    if(e>4600) once(a,'w',()=>{ setCaption(`Best in Show! ${state.name} wins the blue ribbon!`); play('fanfare',.6); play('cheer',.5); burst(12); later(()=>play('pet:trill',.5),600); }); },
  end(){ addStars(1); if(firstTime('catshow')) addPhoto('outing',`${state.name} won Best in Show.`,{scene:'catshow'}); }};

const VARIANTS={
  feed:{dog:['bowl','treat','bone'],cat:['bowl','fish','milk']},
  play:{dog:['ball','tug','squeak','toybox','fetch','frisbee'],cat:['yarn','wand','laser','toybox','fetch','box','tree','tunnel','bag']},
  walk:{dog:['park','beach','woods','dogpark']}, explore:{cat:['box','tree','tunnel','bag','garden']},
  cuddle:{dog:['hearts','pats','blanket'],cat:['hearts','pats','blanket']},
  bath:{dog:['bubbles','tub','shake']}, brush:{cat:['brush','groom','bow']},
  nap:{dog:['dim','bed','sun'],cat:['dim','bed','sun']}
};
/* A nap in a sunbeam (or moonlight) needs a clear sky in the window. */
const variantFits=(act,v)=>!(act==='nap'&&v==='sun'&&!clearSky());
/* Once the pet has toys of its own beyond the first ones (from the pet store, or found outside), play
   time reaches into the toy basket more often, so those toys really get played with. */
const extraToys=()=>!!state&&ownedToys().some(t=>!STARTER_TOYS[kind()].includes(t));
function pickVariant(act){ if(act==='play'&&hasNewToy()){ const v=pick(['toybox','fetch'].filter(x=>x!==lastVariant.play)); lastVariant.play=v; return v; }
  const list=VARIANTS[act][kind()].concat(act==='feed'?learnedTreats().concat(ownedTreats()):[],act==='play'&&extraToys()?['toybox','fetch','toybox']:[]).filter(v=>variantFits(act,v)), last=lastVariant[act], opts=list.length>1?list.filter(v=>v!==last):list, v=pick(opts); lastVariant[act]=v; return v; }

/* ---- Particles ---- */
function drawParts(dt){
  parts=parts.filter(p=>{ p.age+=dt; p.x+=p.vx*dt; p.y+=p.vy*dt; if(p.kind==='crumb'||p.kind==='tuft'||p.kind==='drop') p.vy+=90*dt; if(p.kind==='leaf') p.x+=Math.sin(p.age*3)*.4; return p.age<p.life&&p.y<100; });
  parts.forEach(p=>{ const x=p.x, y=p.y;
    if(p.kind==='crumb'){ rect(ctx,x,y,1,1,p.color); return; }
    if(p.kind==='puff'){ ctx.globalAlpha=Math.max(0,1-p.age/p.life); pxEll(ctx,x,y,1.2,1.2,p.color||'#EADBC0'); ctx.globalAlpha=1; return; }
    if(p.kind==='confetti'){ rect(ctx,x,y,1,2,p.color); return; }
    if(p.kind==='drool'){ rect(ctx,x,y,.5,2,'#CFEFFF'); return; }
    if(p.kind==='drop'){ rect(ctx,x,y,.8,1.8,'#6FB8E0'); rect(ctx,x,y,.5,.5,'#DDF4FF'); return; }
    if(p.kind==='tuft'){ rect(ctx,x,y,2,.8,p.color); rect(ctx,x+.8,y-.8,.8,.8,p.color); return; }
    if(p.kind==='leaf'){ pxEll(ctx,x,y,1.2,.7,p.color); return; }
    if((p.kind==='sparkle'||p.kind==='sparkleSmall')&&Math.floor(p.age*10)%3===2) return;
    const s=SPR[p.kind]; if(s) blit(ctx,s,x-s.lw/2,y-s.lh/2); });
}
