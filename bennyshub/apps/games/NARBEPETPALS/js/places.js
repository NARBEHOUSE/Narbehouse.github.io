'use strict';
/* ================= New places to go =================
   Backgrounds for the outings: the car ride between places, the pet store, the groomer, a friend's
   house, the bank and the hardware store, a neighborhood sidewalk, the catio, the photo booth and the
   yard after rain. Like the other places, each fills the whole view at any screen shape; still parts
   are cached (cachedLayer) and only moving parts are drawn every frame. */

/* ---- Small shared pieces ---- */
function checkerFloor(g,y,a,b,B,s){ s=s||8; for(let yy=y;yy<B.y1;yy+=s/2) for(let x=al(B.x0,s);x<B.x1;x+=s) rect(g,x+((Math.round((yy-y)/(s/2))%2)?s/2:0),yy,s/2,s/2,b); }
function tileWall(g,y0,y1,c,line,B,s){ rect(g,B.x0,y0,Bw(B),y1-y0,c); for(let x=al(B.x0,s);x<B.x1;x+=s) rect(g,x,y0,.5,y1-y0,line); for(let y=y0;y<y1;y+=s) rect(g,B.x0,y,Bw(B),.5,line); }
function counter(g,x,w,y,top,front,B){ shopCounter(g,x,w,y,top,front,B); }
function jar(g,x,y,fill){ rect(g,x-1,y-1,10,12,INK); rect(g,x,y,8,10,'#DDEFF6'); rect(g,x,y+3,8,7,fill); rect(g,x+1,y+1,1.2,8,'rgba(255,255,255,.7)'); rect(g,x-.5,y-2,9,2,'#C0392B'); }
function pawSign(g,x,y,w,h,bg,ink){ rect(g,x-1,y-1,w+2,h+2,INK); rect(g,x,y,w,h,bg); const cx=x+w/2, cy=y+h/2+1; pxEll(g,cx,cy+1,2.6,2,ink); [[-2.6,-1.6],[-.9,-3],[.9,-3],[2.6,-1.6]].forEach(([dx,dy])=>pxEll(g,cx+dx,cy+dy,.9,1,ink)); }

/* ---- The car ride: the view out the side, the car, and the pet at the window ---- */
function drawCarScene(e){
  const night=skyMode()==='night', s=e*.07;
  blitView(ctx,cachedLayer('carbg',(g,ph,B)=>{ const n=ph==='night'; skyFill(g,62,ph,B); if(!n) for(let t=al(B.x0,128);t<B.x1;t+=128){ cloud(g,t+24,14,1); cloud(g,t+84,20,.7); }
    hillBand(g,56,9,n?'#3E5A4A':'#B4D8A0',2,B); vgrad(g,B.x0,62,Bw(B),B.y1-62,[[0,n?'#4E7A52':'#8BC176'],[1,n?'#3E6A44':'#76B062']]);
    rect(g,B.x0,76,Bw(B),B.y1-76,n?'#4A4A52':'#7A7A84'); rect(g,B.x0,76,Bw(B),1,n?'#3A3A42':'#62626C'); }));
  scrollEach(52,s*.35,50,(x,i)=>{ if(i%3===1){ const c=['#F2D9A0','#9FC4E8','#F2A7B5'][i%3]; rect(ctx,x,48,20,14,c); ctx.fillStyle=shade(c,-.3); ctx.beginPath(); ctx.moveTo(x-2,48); ctx.lineTo(x+10,40); ctx.lineTo(x+22,48); ctx.fill(); rect(ctx,x+4,52,4,4,night?'#FFE9A8':'#FFFFFF'); rect(ctx,x+12,54,4,8,'#8A5A34'); }
    else roundTree(ctx,x,50,night,night?'#2F5A3A':'#5E9E5A',night?'#3E6E48':'#86C47A',10); });
  scrollEach(40,s,20,x=>{ rect(ctx,x,58,1.5,18,'#8A6A4A'); rect(ctx,x-3,58,7.5,1,'#8A6A4A'); });
  scrollEach(16,s*1.6,10,x=>rect(ctx,x,87,7,1,'#FFFFFF'));
  if(night) nightTint(.18); }
/* The car sits over the pet: seat behind it, then the door, roof and wheels in front. */
const CAR={x0:22,x1:106,win:[42,39,88,60]};
function carBob(e){ return Math.round(Math.sin(e/95))*.5; }
function drawCarBack(e){ const b=carBob(e); rect(ctx,CAR.win[0]-2,CAR.win[1]+b,CAR.win[2]-CAR.win[0]+4,CAR.win[3]-CAR.win[1]+4,'#5A3A48'); rect(ctx,CAR.win[0]+4,CAR.win[1]+6+b,CAR.win[2]-CAR.win[0]-8,14,'#7A4A5A'); }
function drawCarFront(e,glass){ const b=carBob(e), [wx0,wy0,wx1,wy1]=CAR.win, body='#E0604A', dark='#B8402E', lite='#F28A6A';
  if(glass){ ctx.fillStyle='rgba(200,230,255,.32)'; ctx.fillRect(wx0,wy0+b,wx1-wx0,wy1-wy0); ctx.fillStyle='rgba(255,255,255,.45)'; ctx.beginPath(); ctx.moveTo(wx0+6,wy1+b); ctx.lineTo(wx0+14,wy0+b); ctx.lineTo(wx0+18,wy0+b); ctx.lineTo(wx0+10,wy1+b); ctx.fill(); }
  /* roof and pillars */
  rect(ctx,wx0-5,wy0-5+b,wx1-wx0+10,5.5,INK); rect(ctx,wx0-4,wy0-4+b,wx1-wx0+8,4,body); rect(ctx,wx0-4,wy0-4+b,wx1-wx0+8,1,lite);
  rect(ctx,wx0-5,wy0-1+b,5,wy1-wy0+2,INK); rect(ctx,wx0-4,wy0+b,3,wy1-wy0,body); rect(ctx,wx1,wy0-1+b,6,wy1-wy0+2,INK); rect(ctx,wx1+1,wy0+b,4,wy1-wy0,body);
  /* body and door */
  rect(ctx,CAR.x0-1,wy1-1+b,CAR.x1-CAR.x0+2,26,INK); rect(ctx,CAR.x0,wy1+b,CAR.x1-CAR.x0,24,body); rect(ctx,CAR.x0,wy1+b,CAR.x1-CAR.x0,2,lite); rect(ctx,CAR.x0,wy1+18+b,CAR.x1-CAR.x0,6,dark);
  rect(ctx,64,wy1+2+b,.8,16,dark); rect(ctx,70,wy1+6+b,6,1.4,INK); rect(ctx,CAR.x1-4,wy1+6+b,4,4,'#FFE27A'); rect(ctx,CAR.x0,wy1+7+b,3,3,'#F4A340');
  /* wheels */
  [CAR.x0+16,CAR.x1-16].forEach(x=>{ pxEll(ctx,x,wy1+25,7.2,7.2,INK); pxEll(ctx,x,wy1+25,6,6,'#3A3A42'); pxEll(ctx,x,wy1+25,3,3,'#C8CED6'); const a=e/60; for(let k=0;k<3;k++){ const t=a+k*2.1; pxLine(ctx,x,wy1+25,x+Math.cos(t)*2.6,wy1+25+Math.sin(t)*2.6,'#8A9098',.6); } }); }

/* ---- Pet store ---- */
function drawPetStore(){
  blitView(ctx,cachedLayer('store',(g,ph,B)=>{ rect(g,B.x0,B.y0,Bw(B),62-B.y0,'#FFF1D6'); for(let x=al(B.x0,16);x<B.x1;x+=16) rect(g,x,B.y0,8,62-B.y0,'#FCE8C6');
    rect(g,B.x0,B.y0,Bw(B),7-B.y0,'#5FA873'); for(let x=al(B.x0,8);x<B.x1;x+=8){ g.fillStyle=((x/8)%2)?'#5FA873':'#FFFFFF'; g.beginPath(); g.moveTo(x,7); g.lineTo(x+8,7); g.lineTo(x+4,11); g.fill(); }
    /* shelves full of things */
    const items=['#F07A8E','#5A8FC4','#F4C542','#7FB08C','#B89AD8','#E8905A'];
    for(let x=al(B.x0-40,44);x<B.x1;x+=44){ if(x>18&&x<100) continue; rect(g,x,16,40,44,'#C08A5A'); rect(g,x+1,17,38,42,'#8A5A34');
      [20,34,48].forEach((y,r)=>{ rect(g,x+1,y+10,38,2,'#E3BC84'); for(let i=0;i<5;i++){ const c=items[(i+r+Math.round(x/44))%6], ix=x+3+i*7.4; if((i+r)%3===0){ pxEll(g,ix+3,y+7,3,3,INK); pxEll(g,ix+3,y+7,2.4,2.4,c); } else { rect(g,ix,y+2,6,8,INK); rect(g,ix+.5,y+2.5,5,7,c); rect(g,ix+1,y+4,4,1.5,'#FFFFFF'); } } }); }
    /* toy wall behind the middle */
    rect(g,30,16,68,30,'#EFD9B4'); for(let x=32;x<98;x+=4) for(let y=18;y<46;y+=4) rect(g,x,y,.8,.8,'#D2B88E');
    [[36,20,'ball'],[50,22,'duck'],[64,20,'bone'],[80,21,'mouse'],[40,33,'yarn'],[56,33,'feather'],[72,34,'crinkle'],[86,32,'fishy']].forEach(([x,y,t])=>{ if(SPR[t]) blit(g,SPR[t],x,y); });
    pawSign(g,55,5,18,10,'#FFFFFF','#E0567D');
    /* floor */
    rect(g,B.x0,62,Bw(B),B.y1-62,'#F4E7D2'); checkerFloor(g,62,'#F4E7D2','#E8D6BA',B,10); rect(g,B.x0,61,Bw(B),1.5,'#C08A5A');
    /* treat jars on a little table and the counter with a register */
    rect(g,4,58,24,3,'#8A5A34'); rect(g,6,61,2,16,'#8A5A34'); rect(g,24,61,2,16,'#8A5A34'); jar(g,6,47,'#C98A5A'); jar(g,17,47,'#F2A7B5');
    counter(g,102,40,58,'#E3BC84','#C08A5A',B); rect(g,108,50,12,8,INK); rect(g,109,51,10,7,'#5A6A7A'); rect(g,110,52,8,3,'#9FD8C8'); rect(g,112,48,4,2,'#5A6A7A');
    glow(g,64,12,70,'#FFF3D0',.25); })); }
/* ---- Groomer: the spa room, and the front desk where you check in ---- */
function drawGroomer(){
  blitView(ctx,cachedLayer('groom',(g,ph,B)=>{ tileWall(g,B.y0,62,'#E6F4F8','#CFE6EE',B,8);
    for(let i=0,m=Math.round(Bw(B)/10);i<m;i++){ const x=B.x0+hash2(i,2,7)*Bw(B), y=6+hash2(i,3,7)*40; pxRing(g,x,y,1.6+hash2(i,4,7)*1.6,1.6+hash2(i,4,7)*1.6,.5,'#FFFFFF'); }
    rect(g,B.x0,52,Bw(B),10,'#BFE3EE'); rect(g,B.x0,52,Bw(B),.6,'#8ABFCF');
    /* the big mirror on the left and a shelf of shampoo */
    pxEll(g,14,30,13,17,INK); pxEll(g,14,30,12,16,'#E8C07A'); pxEll(g,14,30,10,14,'#CFE8F2'); rect(g,8,20,2,18,'rgba(255,255,255,.55)');
    rect(g,94,18,34,2.5,'#8A6234'); [[96,'#B89AD8'],[103,'#8CC98A'],[110,'#F4ECD8'],[117,'#F2A7B5'],[123,'#9FC4E8']].forEach(([x,c])=>{ rect(g,x-.5,8.5,5,10,INK); rect(g,x,9,4,9,c); rect(g,x+1,6.5,2,2.5,INK); rect(g,x+.8,10,1,6,'rgba(255,255,255,.6)'); });
    /* towels on a rack */ rect(g,96,30,28,1.5,'#9AA4AE'); [[97,'#F2A7B5'],[106,'#9FC4E8'],[115,'#F4D27A']].forEach(([x,c])=>{ rect(g,x,31,8,11,c); rect(g,x,39,8,1,'#FFFFFF'); });
    rect(g,B.x0,62,Bw(B),B.y1-62,'#DDEBEF'); checkerFloor(g,62,'#DDEBEF','#C8DCE2',B,8); rect(g,B.x0,61.5,Bw(B),1,'#8ABFCF');
    glow(g,64,10,80,'#FFFFFF',.3); })); }
function drawGroomDesk(){
  blitView(ctx,cachedLayer('groomdesk',(g,ph,B)=>{ rect(g,B.x0,B.y0,Bw(B),62-B.y0,'#FBE6EC'); for(let x=al(B.x0,10);x<B.x1;x+=10) rect(g,x,B.y0,5,62-B.y0,'#F7DCE4');
    rect(g,40,8,48,16,INK); rect(g,41,9,46,14,'#FFFFFF'); /* sign: scissors, comb and a bubble */
    pxRing(g,52,17,2.4,2.4,.8,'#5A8FC4'); pxRing(g,52,13,2.4,2.4,.8,'#5A8FC4'); pxLine(g,54,15,62,11,'#5A8FC4',.8); pxLine(g,54,15,62,19,'#5A8FC4',.8);
    rect(g,66,11,12,2.4,'#E0567D'); for(let x=66.5;x<78;x+=1.6) rect(g,x,13,.8,4,'#E0567D'); pxRing(g,82,15,2.6,2.6,.6,'#9FC4E8');
    pottedPlant(g,112,62,1.3);
    rect(g,B.x0,62,Bw(B),B.y1-62,'#E9D8C4'); planks(g,'#E9D8C4','#D8C2A8',{x0:B.x0,x1:B.x1,y0:62,y1:B.y1});
    counter(g,18,54,56,'#F2A7B5','#E88AA2',B); pxEll(g,32,53,4,3,INK); pxEll(g,32,53,3.2,2.4,'#F4C542'); rect(g,31.4,49.4,1.2,1.4,'#F4C542'); rect(g,50,50,12,6,INK); rect(g,51,51,10,5,'#FFFFFF'); for(let y=52;y<55;y+=1.2) rect(g,52,y,8,.4,'#9AA4AE');
    glow(g,64,10,80,'#FFFFFF',.25); })); }
/* The grooming tub: water and bubbles in the chosen scent's color, and the rubber duck. */
const SCENTS={lavender:{label:'Lavender',c:'#C9B0E8',smell:'like lavender'},apple:{label:'Apple',c:'#B8E0A0',smell:'like fresh apples'},coconut:{label:'Coconut',c:'#FFF4DC',smell:'like coconut'}};
function drawGroomTub(y,e,scent){ const c=(SCENTS[scent]||SCENTS.lavender).c;
  rect(ctx,32,y+2,64,3,INK); rect(ctx,33,y+3,62,2,'#FFFFFF'); vgrad(ctx,34,y+5,60,14,[[0,'#FFFFFF'],[1,'#D6E4EC']]); rect(ctx,33,y+5,1,14,INK); rect(ctx,94,y+5,1,14,INK); rect(ctx,33,y+19,62,1,INK);
  rect(ctx,36,y+20,3,6,'#9AA4AE'); rect(ctx,89,y+20,3,6,'#9AA4AE');
  for(let i=0;i<9;i++){ const bx=36+i*7+Math.sin(e/300+i)*1.2, by=y-1-Math.abs(Math.sin(e/420+i*1.7))*2; pxEll(ctx,bx,by+1,3.2,2.6,INK); pxEll(ctx,bx,by+1,2.6,2,c); pxEll(ctx,bx-.8,by,.8,.6,'#FFFFFF'); }
  blit(ctx,SPR.duck,Math.round(78+Math.sin(e/500)*5),y-8+(Math.floor(e/320)%2)); }
function drawDryer(x,y,on,e){ rect(ctx,x+9,y+8,2,30,'#9AA4AE'); pxEll(ctx,x+10,y+39,6,1.6,'#6A7A8A'); rect(ctx,x-1,y-1,14,10,INK); rect(ctx,x,y,12,8,'#9FC4E8'); rect(ctx,x-7,y+2,8,4,INK); rect(ctx,x-6,y+2.6,7,2.8,'#C8CED6');
  if(on) for(let i=0;i<4;i++){ const k=((e/300+i/4)%1); rect(ctx,x-8-k*20,y+3+Math.sin(i*2+e/120)*2,3,.6,'rgba(255,255,255,.9)'); } }
function drawScissors(x,y,open){ const a=open?.45:.12; ctx.save(); ctx.translate(x,y); pxRing(ctx,-3,-2,2,2,.7,'#E0567D'); pxRing(ctx,-3,2,2,2,.7,'#E0567D'); ctx.restore();
  pxLine(ctx,x-1,y-1,x+7,y-1-a*8,'#9AA4AE',.8); pxLine(ctx,x-1,y+1,x+7,y+1+a*8,'#9AA4AE',.8); }
function drawTowel(x,y,c){ rect(ctx,x-1,y-1,22,12,INK); rect(ctx,x,y,20,10,c||'#F2A7B5'); for(let i=x+2;i<x+20;i+=4) rect(ctx,i,y+7,2,1,'#FFFFFF'); }
function drawMirror(x,y,e){ pxEll(ctx,x,y,15,19,INK); pxEll(ctx,x,y,14,18,'#E8C07A'); pxEll(ctx,x,y,12,16,'#D8ECF4'); }
/* ---- A friend's house ---- */
function drawFriendHouse(){
  blitView(ctx,cachedLayer('friend',(g,ph,B)=>{ const n=ph==='night'; rect(g,B.x0,B.y0,Bw(B),56-B.y0,'#FCE0C8'); for(let x=al(B.x0,12);x<B.x1;x+=12){ rect(g,x,B.y0,1,56-B.y0,'#F4CBA8'); rect(g,x+6,B.y0,.5,56-B.y0,'#F8D4B6'); }
    rect(g,B.x0,54,Bw(B),3,'#FFFFFF'); rect(g,B.x0,57,Bw(B),B.y1-57,'#B8804E'); planks(g,'#B8804E','#A06C40',{x0:B.x0,x1:B.x1,y0:57,y1:B.y1});
    framedWindow(g,16,12,26,19,n,'#7FB0D8'); framedPicture(g,60,11,15,11,'#3B3B44');
    blit(g,sofaSprite('#5E86B8',['#F2A7B5','#F4D27A']),82,37);
    pxEll(g,64,82,30.8,7.8,INK); pxEll(g,64,82,30,7,'#E8B84A'); pxEll(g,64,82,26,5,'#F4D27A'); pxRing(g,64,82,20,3.6,.8,'#E8905A'); pxRing(g,64,82,14,2.4,.5,'#FFFFFF');
    glow(g,29,22,24,'#FFF3D0',n?.1:.3); })); }
/* ---- The bank and the hardware store: a counter with a jar of free biscuits ---- */
function drawCounterShop(kind){
  blitView(ctx,cachedLayer('shop-'+kind,(g,ph,B)=>{
    if(kind==='bank'){ rect(g,B.x0,B.y0,Bw(B),62-B.y0,'#EEE6D8'); for(let x=al(B.x0,24);x<B.x1;x+=24){ rect(g,x,B.y0,4,62-B.y0,'#E0D6C4'); rect(g,x+1,B.y0,1,62-B.y0,'#F6F0E4'); }
      clockFace(g,20,30,12);
      rect(g,44,10,70,40,'#8A6234'); for(let x=48;x<112;x+=14){ rect(g,x,14,11,26,'#FFF7E6'); for(let i=x+1.5;i<x+11;i+=2.5) rect(g,i,14,.6,26,'#C9A04A'); } }
    else { rect(g,B.x0,B.y0,Bw(B),62-B.y0,'#E8DCC4'); rect(g,10,8,60,36,'#C9A06A'); for(let x=12;x<70;x+=3) for(let y=10;y<44;y+=3) rect(g,x,y,.6,.6,'#A8804E');
      rect(g,16,14,2,14,'#8A5A34'); rect(g,13,12,8,4,'#6A7A8A'); rect(g,28,14,2,16,'#6A7A8A'); pxRing(g,29,13,3,3,1,'#6A7A8A'); rect(g,40,16,12,2,'#E0604A'); rect(g,40,16,2,10,'#8A5A34'); pxEll(g,60,22,4,6,'#F4C542'); rect(g,59,28,2,8,'#8A5A34');
      for(let x=al(B.x0,40)+80;x<B.x1;x+=40){ rect(g,x,20,34,38,'#8A6234'); [28,42].forEach(y=>{ rect(g,x,y+8,34,2,'#C9A06A'); [['#5A8FC4',2],['#E0604A',12],['#7FB08C',22]].forEach(([c,dx])=>{ rect(g,x+dx,y,9,8,INK); rect(g,x+dx+.5,y+.5,8,7,c); rect(g,x+dx+1,y+2,6,1.5,'#FFFFFF'); }); }); } }
    rect(g,B.x0,62,Bw(B),B.y1-62,kind==='bank'?'#D8CFC0':'#C8BCA8'); checkerFloor(g,62,kind==='bank'?'#D8CFC0':'#C8BCA8',kind==='bank'?'#C8BEAE':'#B8AC98',B,10);
    counter(g,74,50,60,kind==='bank'?'#8A6234':'#6A7A8A',kind==='bank'?'#A87A4A':'#8A9AAA',B); jar(g,96,48,'#C98A5A'); pxEll(g,100,51,2.2,1.4,'#E8C090');
    glow(g,64,10,80,'#FFF3D0',.25); }));
  if(kind==='bank') clockHands(ctx,20,30,12); }
/* A real wall clock: rim, face, 12 hour marks (bold at 12, 3, 6 and 9, with a 12 at the top). Its
   hands are drawn live with clockHands, showing the real time. */
function clockFace(g,cx,cy,r){ pxEll(g,cx,cy+.8,r+.8,r+.8,'rgba(60,40,20,.25)'); pxEll(g,cx,cy,r+.7,r+.7,INK); pxEll(g,cx,cy,r,r,'#C9A04A'); pxEll(g,cx,cy,r-1.1,r-1.1,'#FFFDF6'); pxEll(g,cx-r*.3,cy-r*.35,r*.3,r*.18,'#FFFFFF');
  for(let i=0;i<12;i++){ const a=i/12*TAU-Math.PI/2, big=i%3===0, r0=r-(big?3.2:2.4), r1=r-1.8; if(i===0) continue; pxLine(g,cx+Math.cos(a)*r0,cy+Math.sin(a)*r0,cx+Math.cos(a)*r1,cy+Math.sin(a)*r1,'#3B2A22',big?1:.5); }
  const tx=cx-1.9, ty=cy-r+2; rect(g,tx,ty,.8,3,'#3B2A22'); rect(g,tx+1.4,ty,2,.7,'#3B2A22'); rect(g,tx+2.7,ty+.6,.7,1,'#3B2A22'); rect(g,tx+1.4,ty+1.4,2,.7,'#3B2A22'); rect(g,tx+1.4,ty+2,.7,1,'#3B2A22'); rect(g,tx+1.4,ty+2.4,2,.6,'#3B2A22'); }
function clockHands(g,cx,cy,r){ const t=new Date(), m=(t.getMinutes()+t.getSeconds()/60)/60*TAU-Math.PI/2, h=(t.getHours()%12+t.getMinutes()/60)/12*TAU-Math.PI/2;
  pxLine(g,cx,cy,cx+Math.cos(h)*r*.45,cy+Math.sin(h)*r*.45,'#2A1E18',1.4); pxLine(g,cx,cy,cx+Math.cos(m)*r*.7,cy+Math.sin(m)*r*.7,'#2A1E18',.9); pxEll(g,cx,cy,1,1,'#C9A04A'); pxEll(g,cx,cy,.45,.45,'#2A1E18'); }
/* ---- A neighborhood sidewalk (for a cat's harness walk) ---- */
let streetLayer=null;
function drawStreet(e){ const k=skyPhase()+'|'+VIEW.y+'|'+VIEW.h;
  if(!streetLayer||streetLayer.k!==k){ const c=hdCanvas(256,VIEW.h), g=c.getContext('2d'); g.setTransform(RES,0,0,RES,0,-VIEW.y*RES); c.k=k; const ph=skyPhase(), n=ph==='night', B={x0:0,x1:256,y0:VIEW.y,y1:VIEW.y+VIEW.h};
    skyFill(g,60,ph,B);
    for(let i=0;i<4;i++){ const x0=i*64+4; blit(g,houseSprite(i,n),x0,14); if(n) houseGlow(g,x0,14); }
    rect(g,0,60,256,5,n?'#3E6A44':'#8BC176'); rect(g,0,65,256,20,n?'#8A8A92':'#D8D4CC'); for(let x=0;x<256;x+=16) rect(g,x,65,.6,20,n?'#6A6A72':'#BEB8AE'); rect(g,0,65,256,.6,n?'#9A9AA2':'#E8E4DC'); rect(g,0,85,256,2,'#9A968E'); rect(g,0,87,256,B.y1-87,n?'#4A4A52':'#7A7A84');
    /* a front path, shrubs along the house, and a mailbox at the curb */
    for(let i=0;i<4;i++){ const x0=i*64+4; rect(g,x0+23.4,60,9.2,5,n?'#76767E':'#CFCBC2'); rect(g,x0+23.4,60,9.2,.5,n?'#5A5A62':'#B4AFA6');
      [[x0+6,0],[x0+12,1],[x0+18,0],[x0+38.5,1],[x0+44.5,0],[x0+50.5,1]].forEach(([bx,k])=>{ const c=n?(k?'#2F5A3A':'#3E6A44'):(k?'#5E9E5A':'#6FA85E'); pxEll(g,bx,58.4,3.9,3.1,INK); pxEll(g,bx,58.4,3.3,2.5,c); pxEll(g,bx-1,57.4,1.4,.9,shade(c,.15)); if(!n&&k) pxEll(g,bx+1,58.2,.6,.6,['#F2A7B5','#FFFFFF','#F4C542','#F2A7B5'][i]); });
      rect(g,x0+59.4,55,1.2,10,'#6A4428'); rect(g,x0+56.6,51.6,6.4,4,INK); rect(g,x0+57.1,52.1,5.4,3,'#5A6A7A'); rect(g,x0+57.1,52.1,5.4,.6,'#7A8A9A'); rect(g,x0+62.6,50.2,.8,2.8,'#D9403E'); }
    streetLayer=c; }
  const off=(e*.02)%256; for(let t=al(VIEW.x+off,256)-off;t<VIEW.x+VIEW.w;t+=256) ctx.drawImage(streetLayer,snap(t),VIEW.y,256,VIEW.h);
  if(skyMode()==='night'){ ctx.fillStyle='rgba(20,24,60,0.2)'; fillView(ctx); } }
/* ---- Catio: a screened porch with plants and a bird feeder outside ---- */
function drawCatio(){
  blitView(ctx,cachedLayer('catio',(g,ph,B)=>{ const n=ph==='night'; skyFill(g,50,ph,B); hillBand(g,46,5,n?'#3E5A4A':'#A8D094',4,B); vgrad(g,B.x0,46,Bw(B),14,[[0,n?'#4E7A52':'#8BC176'],[1,n?'#3E6A44':'#76B062']]);
    roundTree(g,96,26,n,n?'#2F5A3A':'#5E9E5A',n?'#3E6E48':'#86C47A',20); rect(g,36,20,1.2,24,'#8A5A34'); rect(g,31,20,11,2,'#8A5A34'); rect(g,32,22,9,6,'#E3BC84'); rect(g,32,27,9,1.4,'#8A5A34');
    for(let y=B.y0;y<60;y+=2) rect(g,B.x0,y,Bw(B),.3,'rgba(255,255,255,.25)'); for(let x=al(B.x0,2);x<B.x1;x+=2) rect(g,x,B.y0,.3,60-B.y0,'rgba(255,255,255,.25)');
    for(let x=al(B.x0,32);x<B.x1;x+=32){ rect(g,x,B.y0,4,62-B.y0,'#FFFFFF'); rect(g,x+3,B.y0,1,62-B.y0,'#DDD6CC'); } rect(g,B.x0,B.y0,Bw(B),4-B.y0,'#FFFFFF');
    rect(g,B.x0,60,Bw(B),B.y1-60,'#C08A5A'); planks(g,'#C08A5A','#A8744A',{x0:B.x0,x1:B.x1,y0:60,y1:B.y1}); rect(g,B.x0,59,Bw(B),2,'#FFFFFF');
    [[6,'#6E9B7B'],[112,'#86B592']].forEach(([x,c])=>{ rect(g,x,50,14,11,'#D8765A'); rect(g,x-1,49,16,2,'#B85E45'); pxEll(g,x+7,44,7,8,c); pxEll(g,x+4,40,3,4,shade(c,.12)); });
    rect(g,82,48,26,3,'#E3BC84'); rect(g,84,51,2,10,'#8A5A34'); rect(g,104,51,2,10,'#8A5A34'); pxEll(g,95,47,8,2,'#F2A7B5'); glow(g,64,10,80,'#FFF3D0',n?.05:.25); })); }
/* ---- Photo booth ---- */
function drawPhotoBooth(){
  blitView(ctx,cachedLayer('booth',(g,ph,B)=>{ rect(g,B.x0,B.y0,Bw(B),B.y1-B.y0,'#3A2A40');
    vgrad(g,24,B.y0,80,90-B.y0,[[0,'#FDE2EC'],[1,'#E8D4F4']]); for(let i=0;i<22;i++){ const x=28+hash2(i,1,5)*72, y=6+hash2(i,2,5)*60; rect(g,x-1,y,2,.5,'#FFFFFF'); rect(g,x-.25,y-.75,.5,2,'#FFFFFF'); }
    for(let x=al(B.x0,4);x<24;x+=4){ vgrad(g,x,B.y0,3.5,96-B.y0,[[0,'#D9403E'],[1,'#A8302E']]); } for(let x=104;x<B.x1;x+=4){ vgrad(g,x,B.y0,3.5,96-B.y0,[[0,'#D9403E'],[1,'#A8302E']]); }
    rect(g,B.x0,B.y0,Bw(B),5-B.y0,'#F4C542'); rect(g,24,86,80,B.y1-86,'#E0C8B8'); glow(g,64,40,50,'#FFFFFF',.2); })); }
/* ---- The yard after rain: puddles and a rainbow ---- */
function drawYardAfterRain(e,raining){ drawYard();
  /* a rainbow arching over the fence, in the sky only */
  if(!raining){ ctx.save(); ctx.beginPath(); ctx.rect(VIEW.x,VIEW.y,VIEW.w,36-VIEW.y); ctx.clip(); ctx.globalAlpha=.6; ['#E8757A','#F4B942','#F4E27A','#8CC98A','#7FA8D8','#B89AD8'].forEach((c,i)=>pxRing(ctx,64,40,60-i*2.4,32-i*2.4,1.3,c)); ctx.restore(); }
  [[28,88,11],[92,90,13],[60,93,8]].forEach(([x,y,r])=>{ pxEll(ctx,x,y,r,2.6,'#5A8FC4'); pxEll(ctx,x-2,y-.4,r*.6,1.2,'#9FD8F0'); });
  if(raining){ ctx.fillStyle='rgba(60,70,100,.22)'; fillView(ctx); for(let i=0;i<50;i++){ const x=VIEW.x+((i*23+e*.05)%(VIEW.w+10)), y=VIEW.y+((i*37+e*.12)%(VIEW.h+10)); rect(ctx,x,y,.5,3,'#CFE2F6'); } } }
