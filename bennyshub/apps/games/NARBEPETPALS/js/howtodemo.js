'use strict';
/* ================= How to Play: a little animated example under each page =================
   Each page of How to Play has a looping scene that acts out what the text says, drawn with the
   game's own sprites: a pup scanning the room, a kitten eating and growing up, a different pup
   earning stars and outfits, and a kitten opening a surprise and napping while the pause ring fills.
   Every demo is a pure function of time, so it loops cleanly (reduced motion shows one still frame). */
const DEMO_W=132, DEMO_H=62, DEMO_FLOOR=56;
const demoPose=o=>Object.assign({eyes:'open',mouth:'smile',tail:0,ear:0,headDy:0,dy:0,dx:0,wag:300},o||{});
const lerpC=(a,b,k)=>a+(b-a)*clamp(k,0,1);
const phase=(t,a,b)=>clamp((t-a)/(b-a),0,1);
function demoRoom(g,wall,floor){
  rect(g,0,0,DEMO_W,DEMO_FLOOR-14,wall); for(let x=6;x<DEMO_W;x+=12) for(let y=6;y<DEMO_FLOOR-16;y+=10) rect(g,x+((y/10)%2?6:0),y,1,1,'#00000012');
  rect(g,0,DEMO_FLOOR-14,DEMO_W,2,'#FFF7EA'); rect(g,0,DEMO_FLOOR-12,DEMO_W,DEMO_H,floor);
  for(let y=DEMO_FLOOR-8;y<DEMO_H;y+=5){ rect(g,0,y,DEMO_W,.5,'#00000018'); for(let x=((y/5)%2)*14;x<DEMO_W;x+=28) rect(g,x,y-5,.5,5,'#00000014'); } }
/* Stand a sprite on the floor at x. */
const onFloor=(s,dy)=>DEMO_FLOOR-(s.lh||s.height)+(dy||0);
function demoPet(g,style,sg,p,fit,cx,hl){ softShadow(g,cx+(p.dx||0),DEMO_FLOOR,15,3,.28); drawPetPose(g,style,sg,p,fit,cx-22+(p.dx||0),DEMO_FLOOR-40+(p.dy||0),hl); }
/* Sparkles that burst out from (x,y) at time t0 and fade over 800 ms. */
function demoSparkles(g,t,t0,x,y,n){ const k=(t-t0)/800; if(k<0||k>1) return; g.save(); g.globalAlpha=1-k;
  for(let i=0;i<(n||6);i++){ const a=i/(n||6)*TAU+.4, r=4+k*14; blit(g,i%2?SPR.sparkleSmall:SPR.sparkle,x+Math.cos(a)*r-2,y+Math.sin(a)*r*.7-2); } g.restore(); }
function floatHeart(g,t,t0,x,y){ const k=(t-t0)/1400; if(k<0||k>1) return; g.save(); g.globalAlpha=k<.7?1:(1-k)/.3; blit(g,SPR.heart,x+Math.sin(k*9)*2-3.5,y-k*18); g.restore(); }
function pulseHeart(g,t,x,y){ const s=1+.22*Math.sin(t/200); blitSized(g,SPR.heart,snap(x-3.5*s),snap(y-3*s),7*s,6*s); }
/* Helpers in anims.js draw to the scene's ctx; point it at the demo canvas for a moment. */
function withCtx(g,fn){ const keep=ctx; ctx=g; try{ fn(); } finally{ ctx=keep; } }

const DEMOS=[
  /* 1. Welcome: the highlight moves across the room's choices, then lands on the pup for a cuddle. */
  {style:'golden',loop:7600,still:4800,draw(g,t){ const st=this.style;
    demoRoom(g,'#E4F1E8','#DDA86E');
    const bath=stationSprite('bath','dog'), basket=stationSprite('basket','dog'), door=stationSprite('door','dog'), bowl=BOWLS[0];
    const items=[[bath,6,onFloor(bath,-1)],[basket,27,onFloor(basket,-1)],[bowl,90,onFloor(bowl,-3)],[door,112,DEMO_FLOOR-13-door.lh]];
    const step=Math.floor(t/850), hi=t<4250?step:-1, onPet=t>=3400&&t<4250;
    items.forEach(([s,x,y],i)=>{ if(i===hi&&!onPet) blitHL(g,s,x,y); blit(g,s,x,y); });
    const cuddle=t>=4250, p=demoPose(cuddle?{eyes:'happy',mouth:'tongue',tail:Math.floor(t/110)%3,dy:-Math.round(Math.abs(Math.sin(t/150))*3)}:{tail:Math.floor(t/300)%2});
    if(!cuddle&&(t%3100)<140) p.eyes='closed';
    demoPet(g,st,'baby',p,null,64,onPet);
    if(cuddle){ demoSparkles(g,t,4250,64,30); [4300,4800,5300,5800].forEach((t0,i)=>floatHeart(g,t,t0,58+i*4,28)); } }},
  /* 2. Growing up: a heart over the bowl, the kitten eats, earns a paw print, and grows up. */
  {style:'tabby',loop:10400,still:3200,draw(g,t){ const st=this.style;
    demoRoom(g,'#F6E6DA','#D9A56B');
    const stage=t<4600?0:Math.min(3,1+Math.floor((t-4600)/1500)), sg=STAGES[stage], bx=92;
    const bowl=BOWLS[t<3000?0:t<3700?1:2]; blit(g,bowl,bx,onFloor(bowl,-3));
    if(t<1500) pulseHeart(g,t,bx+7,onFloor(bowl,-9));
    const D=bx-66, p=demoPose();
    if(t>=1500&&t<2400){ const k=phase(t,1500,2400); p.body='walk'; p.face=1; p.frame=Math.floor(t/140)%4; p.dx=Math.round(D*k); }
    else if(t>=2400&&t<3900){ p.body='stand'; p.face=1; p.dx=D; p.headDy=Math.floor(t/260)%2?3:2; p.frame=0; }
    else if(t>=3900&&t<4600){ const k=phase(t,3900,4600); p.body='walk'; p.face=-1; p.frame=Math.floor(t/140)%4; p.dx=Math.round(D*(1-k)); }
    else if(t>=4600){ p.eyes='happy'; p.mouth=stage>=3?'smile':'tongue'; p.tail=Math.floor(t/200)%3; }
    demoPet(g,st,sg,p,null,50,false);
    /* The paw print earned for eating floats up. */
    const k=phase(t,3900,4800); if(k>0&&k<1){ g.save(); g.globalAlpha=k<.75?1:(1-k)*4; blit(g,ICONS.walk,58+p.dx,22-k*12); g.restore(); }
    for(let i=0;i<4;i++){ const on=i<=stage&&t>=4600||i===0; g.save(); g.globalAlpha=on?1:.28; blit(g,ICONS.walk,4+i*13,3); g.restore(); }
    for(let s=1;s<4;s++) demoSparkles(g,t,4600+(s-1)*1500,50,26,7); }},
  /* 3. Care stars: stars fly up to the row of stars, then outfits and the picture on the wall change. */
  {style:'dalmatian',loop:9000,still:5200,draw(g,t){ const st=this.style;
    demoRoom(g,'#E6ECF6','#C9955E');
    const arts=Object.values(DECOR).filter(d=>d.zone==='wall'&&!d.pic&&d.id!=='window'&&d.draw).map(d=>d.id).slice(0,4);
    const fits=[{hat:'party'},{hat:'flowers',neck:'bowtie'},{hat:'cap',neck:'bandana'},{hat:'sunhat',neck:'scarf'}];
    const n=t<2600?-1:Math.min(fits.length-1,Math.floor((t-2600)/1600)), art=arts.length?itemSprite(arts[Math.max(0,n)%arts.length]):null;
    if(art){ const s=Math.min(1,26/art.lh), w=art.lw*s, h=art.lh*s; blitSized(g,art,snap(20-w/2+4),snap(DEMO_FLOOR-15-h),w,h); }
    const p=demoPose(n>=0?{eyes:'happy',mouth:'tongue',tail:Math.floor(t/120)%3}:{tail:Math.floor(t/300)%2});
    if(t<2600&&t%700<300) p.dy=-Math.round(Math.abs(Math.sin(t/110))*2);
    demoPet(g,st,'baby',p,n>=0?fits[n]:null,70,false);
    const slots=[[104,5],[113,5],[122,5]];
    slots.forEach(([x,y],i)=>{ const t0=300+i*700, k=phase(t,t0,t0+600);
      g.save(); g.globalAlpha=.3; blit(g,SPR.star,x,y); g.restore();
      if(k>0){ const sx=lerpC(70,x,k), sy=lerpC(28,y,k)-Math.sin(k*Math.PI)*10; g.save(); blitSized(g,SPR.star,snap(sx),snap(sy),5*(k<1?1.4:1),5*(k<1?1.4:1)); g.restore(); if(k>=1) demoSparkles(g,t,t0+600,x+2.5,y+2.5,4); } });
    for(let i=0;i<fits.length;i++) demoSparkles(g,t,2600+i*1600,70,24,6); }},
  /* 4. Good to know: a surprise present opens, then the kitten naps while the pause ring fills. */
  {style:'calico',loop:9600,still:6400,draw(g,t){ const st=this.style;
    demoRoom(g,'#F4E8F0','#DDAE78');
    const gx=Math.round(t<500?lerpC(140,90,t/500):90), gy=DEMO_FLOOR-15, open=t>=1500;
    if(t<3600){ withCtx(g,()=>drawGift(gx,gy,t<1500?0:t<2100?Math.round((t-1500)/40):null,'red'));
      if(t>=500&&t<1500) blit(g,SPR.exclaim,gx+9,gy-12-Math.round(Math.abs(Math.sin(t/120))*3)); }
    const ky=phase(t,1500,2300), yarn=SPR.yarn;
    if(open){ const x=lerpC(gx+6,70,ky), y=lerpC(gy-4,DEMO_FLOOR-yarn.lh,ky)-Math.sin(ky*Math.PI)*16; blit(g,yarn,x,y); }
    demoSparkles(g,t,1500,gx+10,gy-4,8);
    const nap=t>=3600, p=demoPose();
    if(!nap){ p.eyes=open?'happy':'open'; p.mouth=open?'tongue':'smile'; if(t>1600&&t<2600) p.dy=-Math.round(Math.abs(Math.sin(t/150))*3); }
    else { p.body='lie'; p.face=1; p.eyes='closed'; p.frame=0; }
    demoPet(g,st,'baby',p,null,44,false);
    if(nap){ [0,700,1400].forEach(o=>{ const k=((t-3600+o)%2100)/2100; g.save(); g.globalAlpha=k<.8?1:(1-k)*5; blitSized(g,SPR.z,snap(58+k*8),snap(30-k*14),5,5); g.restore(); }); }
    /* The pause ring: holding Enter fills it, then the game pauses. */
    const rk=phase(t,4400,8000), cx=116, cy=14;
    if(t>=4000){ g.save(); g.lineWidth=2.4; g.strokeStyle='#FFFFFFCC'; g.beginPath(); g.arc(cx,cy,9,0,TAU); g.stroke();
      g.strokeStyle=(HL_COLORS[gs.hlColor]||HL_COLORS[0])[1]; g.beginPath(); g.arc(cx,cy,9,-Math.PI/2,-Math.PI/2+TAU*rk); g.stroke(); g.restore();
      const done=rk>=1; rect(g,cx-3.5,cy-4,2.5,8,done?'#5FA873':INK); rect(g,cx+1,cy-4,2.5,8,done?'#5FA873':INK);
      if(done) demoSparkles(g,t,8000,cx,cy,6); } }}
];
let demoRaf=0, demoT0=0, demoPage=-1;
function startHowtoDemo(page){ const c=$('#howto-demo'); if(!c) return; prepCanvas(c); demoPage=page; demoT0=performance.now(); cancelAnimationFrame(demoRaf);
  const d=DEMOS[page%DEMOS.length]; c.setAttribute('aria-label',['A puppy in its room. The highlight moves from thing to thing, then the puppy gets a cuddle.','A kitten eats from its bowl, earns a paw print, and grows up.','A puppy earns care stars and tries on new outfits.','A kitten opens a surprise present, then naps while the pause ring fills.'][page%4]);
  const frame=now=>{ if(!c.isConnected||layer!=='howto'){ demoRaf=0; return; }
    const g=c.getContext('2d'); g.setTransform(RES,0,0,RES,0,0); g.imageSmoothingEnabled=false; g.clearRect(0,0,DEMO_W,DEMO_H);
    try{ d.draw(g,reduceMotion?d.still:(now-demoT0)%d.loop); }catch(e){ console.error(e); demoRaf=0; return; }
    if(!reduceMotion) demoRaf=requestAnimationFrame(frame); };
  demoRaf=requestAnimationFrame(frame); }
