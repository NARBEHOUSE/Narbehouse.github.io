'use strict';
/* ================= Detailed props: houses, sofas, armchairs =================
   Built with the sprite engine so they are shaded and outlined like everything else: shingled roofs
   with trim boards, lap siding, framed windows with sills and shutters, paneled doors with a porch
   light, stone foundations; sofas with rolled arms, a tufted back, seat cushions, throw pillows and
   wooden legs. Cached once per look. */
const PROPS={};
const propSpr=(key,w,h,fn,opt)=>PROPS[key]||(PROPS[key]=sprite(w,h,fn,opt));

/* ---- Houses ---- */
const HOUSE_SCHEMES=[
  {wall:'#F2D9A0',roof:'#B8553E',trim:'#FFFDF6',door:'#3E6A8A',shut:'#5A86B0',box:'#F07A8E'},
  {wall:'#A9C9E6',roof:'#46536E',trim:'#FFFFFF',door:'#C2593E',shut:'#36506E',box:'#F4C542'},
  {wall:'#F0BCC4',roof:'#6E4A58',trim:'#FFF8F2',door:'#7A4A5A',shut:'#B86A7E',box:'#FFFFFF'},
  {wall:'#C6DDB4',roof:'#5E6B4A',trim:'#FFFDF6',door:'#8A4A2A',shut:'#5A7A48',box:'#F08A4A'}];
/* Where things are on a house drawn at (x0, y0): its roof edge and its two windows (9 x 8). */
const HOUSE={w:56,h:46,roof:[[-1.5,19.5],[28,2.5],[57.5,19.5]],wins:[[9,26],[38,26]],door:[24.2,29,7.6,15]};
function houseSprite(i,night){ const S=HOUSE_SCHEMES[((i%4)+4)%4]; return propSpr('house'+(i%4)+(night?'n':''),HOUSE.w,HOUSE.h,b=>{ const W=S.wall;
  const glass=(px,py,nx,ny)=>night?(ny<-.3?'#FFE8AE':'#FFD27A'):(nx+ny<-.45?'#EAF6FC':nx+ny<.25?'#BFDDF0':'#9CC4E2');
  /* chimney, behind the roof */
  part(b,T=>R(T,39,3.5,5,12,(x,y)=>((Math.floor(y*.9)+(Math.floor(x*.7+(Math.floor(y*.9)%2)*.5)))%2)?'#B0583E':'#C46A4E',SH)); part(b,T=>R(T,38.3,2.4,6.4,1.6,'#8A8A92',SH));
  /* walls with lap siding, a little lighter at the left corner */
  part(b,T=>R(T,3,18,50,26,(x,y)=>((y-19)%2.2<.5)?shade(W,-.1):(x<6?shade(W,.05):W),SH));
  R(b,4,18,48,1.4,shade(W,-.22));
  /* roof with rows of shingles, and trim boards along its edges */
  part(b,T=>Tr(T,-1.5,19.5,57.5,19.5,28,2.5,(x,y)=>{ const row=Math.floor((y-2.5)/2.1), off=row%2?1.7:0; return ((y-2.5)%2.1<.5||((x+off)%3.4<.4))?shade(S.roof,-.18):S.roof; },SH));
  Ln(b,-1.5,19.7,28,2.7,S.trim,2); Ln(b,28,2.7,57.5,19.7,S.trim,2);
  /* a round vent in the gable */
  part(b,T=>E(T,28,12.4,2.7,2.7,S.trim,SH)); E(b,28,12.4,1.8,1.8,shade(W,-.25)); [-1,0,1].forEach(k=>Ln(b,26.6,12.4+k*.8,29.4,12.4+k*.8,S.trim,1));
  /* corner boards and a stone foundation */
  part(b,T=>{ R(T,3,18.5,1.6,25.5,S.trim,SH); R(T,51.4,18.5,1.6,25.5,S.trim,SH); });
  part(b,T=>R(T,2,43,52,3,(x,y)=>((Math.floor(x/3.4)+(y>44.4?1:0))%2)?'#9C9AA4':'#B6B4BC',SH));
  /* two windows with shutters, sills, and a flower box under one */
  HOUSE.wins.forEach(([x,y],k)=>{
    part(b,T=>{ R(T,x-3.8,y-.6,2.6,10.2,S.shut,SH,.3); R(T,x+10.2,y-.6,2.6,10.2,S.shut,SH,.3); });
    for(let i=0;i<4;i++){ Ln(b,x-3.5,y+1.2+i*2.2,x-1.5,y+1.2+i*2.2,shade(S.shut,-.25),1); Ln(b,x+10.5,y+1.2+i*2.2,x+12.5,y+1.2+i*2.2,shade(S.shut,-.25),1); }
    part(b,T=>R(T,x-1,y-1,11,10,S.trim,SH,.4)); R(b,x,y,9,8,glass);
    if(night){ R(b,x,y,1.6,8,'#E8B060'); R(b,x+7.4,y,1.6,8,'#E8B060'); }
    Ln(b,x+4.5,y,x+4.5,y+8,S.trim,1); Ln(b,x,y+4,x+9,y+4,S.trim,1);
    part(b,T=>R(T,x-1.8,y+8.6,12.6,1.5,S.trim,SH));
    if(k===0){ part(b,T=>R(T,x-.4,y+10.1,9.8,2.2,'#8A5A34',SH)); [[x+.6,'#7FB08C'],[x+2.2,S.box],[x+3.8,'#7FB08C'],[x+5.4,S.box],[x+7,'#7FB08C'],[x+8.4,S.box]].forEach(([fx,c],i)=>E(b,fx,y+9.8-(i%2)*.3,.8,.8,c)); } });
  /* a paneled front door with a little window, a porch light and a step */
  part(b,T=>R(T,23,27.6,10,16.4,S.trim,SH,.4)); part(b,T=>R(T,24.2,29,7.6,15,S.door,SH,.3));
  R(b,24.8,29.6,6.4,2,glass); [[25,32.6],[28.4,32.6],[25,37.6],[28.4,37.6]].forEach(([px,py])=>{ R(b,px,py,2.6,4.2,shade(S.door,-.14)); R(b,px+.4,py+.4,1.8,3.4,shade(S.door,.05)); });
  E(b,30.8,37,.55,.55,'#F4C542'); part(b,T=>R(T,21.8,44,12.4,2,'#CFCDD4',SH));
  part(b,T=>{ R(T,34.6,29.6,1.8,2.6,'#3A3A42',SH); }); E(b,35.5,31.4,.6,.6,night?'#FFF4C0':'#F4E8C0');
  /* gutter downspout */
  Ln(b,52.8,19.6,52.8,43,'#A6A6AE',1); }); }
/* Warm light spilling from the windows at night. */
function houseGlow(g,x0,y0){ HOUSE.wins.forEach(([x,y])=>glow(g,x0+x+4.5,y0+y+4,12,'#FFD27A',.32)); glow(g,x0+35.5,y0+31.4,6,'#FFF4C0',.4); }

/* ---- Sofas and armchairs ---- */
function sofaSprite(c,pil){ pil=pil||['#F2A7B5','#F4D27A']; return propSpr('sofa'+c+pil.join(''),44,24,b=>{ const lt=shade(c,.08), dk=shade(c,-.14);
  part(b,T=>R(T,4,1,36,13,c,SH,3)); Ln(b,22,2.4,22,12,dk,1); [11,17,27,33].forEach(x=>{ E(b,x,6.4,.5,.5,shade(c,-.3)); Ln(b,x,7,x,9.4,shade(c,-.12),1); });
  [[0,3.5],[37,40.5]].forEach(([x,rx])=>part(b,T=>{ R(T,x,7,7,14,c,SH,2.6); E(T,rx,7.6,3.6,2.5,lt,SH); }));
  part(b,T=>{ R(T,6.4,11.6,15.2,6.4,lt,SH,1.6); R(T,22.4,11.6,15.2,6.4,lt,SH,1.6); }); Ln(b,7.4,13,20.6,13,shade(lt,.12),1); Ln(b,23.4,13,36.6,13,shade(lt,.12),1);
  part(b,T=>R(T,2,17.6,40,3.4,dk,SH,1));
  part(b,T=>{ Tr(T,4.4,20.8,7.4,20.8,5.4,23.8,'#7A4A2A'); Tr(T,36.6,20.8,39.6,20.8,38.6,23.8,'#7A4A2A'); });
  part(b,T=>R(T,7.6,4.4,7.4,6.4,pil[0],SH,2.2)); part(b,T=>R(T,29,4.4,7.4,6.4,pil[1],SH,2.2)); Ln(b,9,7.6,13.6,7.6,shade(pil[0],-.15),1); Ln(b,30.4,7.6,35,7.6,shade(pil[1],-.15),1); }); }
function armchairSprite(c,pil){ return propSpr('arm'+c+(pil||''),28,25,b=>{ const lt=shade(c,.08), dk=shade(c,-.14);
  part(b,T=>R(T,4,0,20,14,c,SH,3.4)); [10,18].forEach(x=>E(b,x,5.6,.5,.5,shade(c,-.3)));
  [[0,3.5],[21,24.5]].forEach(([x,rx])=>part(b,T=>{ R(T,x,8,7,13,c,SH,2.6); E(T,rx,8.6,3.6,2.5,lt,SH); }));
  part(b,T=>R(T,6.4,12.4,15.2,6.4,lt,SH,1.6)); Ln(b,7.4,13.8,20.6,13.8,shade(lt,.12),1);
  part(b,T=>R(T,2,18.6,24,3,dk,SH,1)); part(b,T=>{ Tr(T,4.2,21.4,7,21.4,5.2,24.6,'#7A4A2A'); Tr(T,21,21.4,23.8,21.4,22.8,24.6,'#7A4A2A'); });
  if(pil) { part(b,T=>R(T,10,6,8,6.4,pil,SH,2.2)); Ln(b,11.4,9.2,16.6,9.2,shade(pil,-.15),1); } }); }

/* ---- Town shops: a cornice with little blocks under it, framed upstairs windows with sills, a shop
   sign, a striped awning with a scalloped edge, a big display window and a glass-paneled door ---- */
const SHOP_SCHEMES=[
  {wall:'#C9604A',brick:1,trim:'#F4EDE0',awn:'#2F7A6A',sign:'#2F5A78',door:'#2F5A78',goods:['#F4C542','#F07A8E']},
  {wall:'#9FC4E8',trim:'#FFFFFF',awn:'#E0604A',sign:'#E8A030',door:'#C2593E',goods:['#7FB08C','#F2A7B5']},
  {wall:'#F2D9A0',trim:'#FFFDF6',awn:'#7A4A9A',sign:'#7A4A9A',door:'#5A3A6A',goods:['#E8905A','#9FC4E8']},
  {wall:'#A86A8A',brick:1,trim:'#F8EEF2',awn:'#E86A8A',sign:'#3E3A4A',door:'#3E3A4A',goods:['#F4D27A','#B89AD8']},
  {wall:'#A8D8B0',trim:'#FFFFFF',awn:'#E8B030',sign:'#2F7A6A',door:'#2F7A6A',goods:['#F07A8E','#F4C542']},
  {wall:'#E8A87C',trim:'#FFF8EE',awn:'#3E6A8A',sign:'#8A3A2A',door:'#8A3A2A',goods:['#9FC4E8','#7FB08C']}];
function shopSprite(i,night){ const S=SHOP_SCHEMES[((i%6)+6)%6], H=34+((i*7)%3)*5, W=S.wall;
  return propSpr('shop'+i+(night?'n':''),30,H,b=>{
  const glass=(x,y)=>night?'#FFD98A':(((x+y)%7)<1.5?'#EAF6FC':'#A8D0EA');
  const wall=S.brick?(x,y)=>{ const r=Math.floor(y/1.8), off=r%2?1.6:0; return (y%1.8<.4||((x+off)%3.2<.35))?shade(W,-.16):W; }:(x,y)=>(Math.floor(x*.5+y*.3)%5===0)?shade(W,-.04):W;
  part(b,T=>R(T,1.5,3,27,H-3,wall,SH));
  /* cornice */
  part(b,T=>R(T,0,0,30,3.4,S.trim,SH,.3)); for(let x=2;x<28;x+=2.2) R(b,x,3.4,1.1,.9,shade(S.trim,-.22)); R(b,1.5,4.3,27,.6,shade(W,-.25));
  /* upstairs windows */
  const arch=!S.brick&&i%2;
  for(let y=7.5;y+7<=H-18;y+=10) [5,18.4].forEach(wx=>{
    part(b,T=>{ R(T,wx-.8,y-.8,8.2,8.2,S.trim,SH,.3); if(arch) E(T,wx+3.3,y-.6,4.1,2.4,S.trim,SH); });
    R(b,wx,y,6.6,6.6,glass); if(arch) E(b,wx+3.3,y,3.3,1.6,glass);
    if(night){ R(b,wx,y,1.4,6.6,'#E8B060'); R(b,wx+5.2,y,1.4,6.6,'#E8B060'); }
    Ln(b,wx+3.3,y,wx+3.3,y+6.6,S.trim,.8); Ln(b,wx,y+3.3,wx+6.6,y+3.3,S.trim,.8);
    part(b,T=>R(T,wx-1.4,y+7.2,9.4,1.3,S.trim,SH)); });
  /* the shop front: sign, awning, display window and door */
  const yS=H-17, yA=yS+4.4, yW=yA+4.6;
  part(b,T=>R(T,3,yS,24,3.6,S.sign,SH,.4)); [2.2,1.4,2.6,1.8,2.2].reduce((x,w)=>{ R(b,x,yS+1.2,w,1.2,'#FFFDF6'); return x+w+.9; },6.4);
  part(b,T=>{ R(T,1,yA,28,3.2,x=>Math.floor((x-1)/2.4)%2?'#FFFFFF':S.awn,SH); for(let x=2.2;x<29;x+=2.4) E(T,x,yA+3.2,1.2,1,Math.floor((x-1)/2.4)%2?'#FFFFFF':S.awn,SH); });
  Ln(b,1,yA+.4,29,yA+.4,shade(S.awn,.2),.6);
  part(b,T=>R(T,2.4,yW-.6,16.2,H-yW-1.8,S.door,SH,.3)); R(b,3.2,yW,14.6,H-yW-3.2,glass);
  if(!night){ R(b,5,H-6.4,3.4,3,S.goods[0]); E(b,11,H-5.2,1.8,1.8,S.goods[1]); R(b,13.6,H-7.4,2.6,4,S.goods[0]); }
  Ln(b,10.5,yW,10.5,H-3.2,S.door,.7);
  part(b,T=>R(T,2,H-2.4,17,2.4,shade(W,-.3),SH));
  part(b,T=>R(T,20.2,yA+3.6,7.6,H-yA-3.6,S.trim,SH,.3)); R(b,21,yA+4.4,6,H-yA-4.4,S.door); R(b,22,yA+5.4,4,4.4,glass);
  R(b,22,yA+11,4,.6,shade(S.door,-.2)); E(b,26.2,yA+9,.45,.45,'#F4C542'); }); }

/* ---- A real-looking window: a painted frame, panes with a soft reflection, a sill, and curtains on a
   rod with folds, gathered by tie-backs ---- */
function framedWindow(g,x,y,w,h,night,cur){ const T='#FFFDF6', TD='#D8D0C2';
  rect(g,x-2.4,y-2.4,w+4.8,h+4.8,INK); rect(g,x-1.8,y-1.8,w+3.6,h+3.6,T); rect(g,x-1.8,y+h+.8,w+3.6,1,TD);
  vgrad(g,x,y,w,h,night?[[0,'#1E2A52'],[1,'#3E4E80']]:[[0,'#8CC8EE'],[1,'#DDF1FA']]);
  /* the view outside: a far hill and treetops */
  g.save(); g.beginPath(); g.rect(x,y,w,h); g.clip();
  pxEll(g,x+w*.3,y+h+2,w*.55,h*.32,night?'#2A4A44':'#9ACB8A'); pxEll(g,x+w*.82,y+h+1,w*.4,h*.24,night?'#24403A':'#86BC78');
  if(night){ pxEll(g,x+w*.75,y+h*.24,1.6,1.6,'#FFF4C8'); } else { pxEll(g,x+w*.24,y+h*.22,2.6,1.2,'#FFFFFF'); pxEll(g,x+w*.3,y+h*.2,1.8,1.2,'#FFFFFF'); }
  pxLine(g,x+2,y+h*.62,x+w*.32,y+1.2,'rgba(255,255,255,.45)',1.1); pxLine(g,x+w*.5+2,y+h*.7,x+w*.8,y+1.2,'rgba(255,255,255,.3)',.7); g.restore();
  rect(g,x+w/2-.7,y,1.4,h,T); rect(g,x,y+h/2-.7,w,1.4,T); rect(g,x+w/2+.7,y,.4,h,TD); rect(g,x,y+h/2+.7,w,.4,TD);
  rect(g,x-3.8,y+h+1.8,w+7.6,2.8,INK); rect(g,x-3.2,y+h+2.2,w+6.4,1.8,T); rect(g,x-3.2,y+h+3.4,w+6.4,.6,TD);
  if(!cur) return; const top=y-4.2, bot=y+h+5, tie=y+h*.6;
  rect(g,x-8,top-1,w+16,1.6,INK); rect(g,x-7.6,top-.7,w+15.2,1,'#B08A50'); pxEll(g,x-8.4,top-.2,1.4,1.4,INK); pxEll(g,x+w+8.4,top-.2,1.4,1.4,INK); pxEll(g,x-8.4,top-.2,.9,.9,'#C9A04A'); pxEll(g,x+w+8.4,top-.2,.9,.9,'#C9A04A');
  [-1,1].forEach(s=>{ const edge=s<0?x-6.4:x+w+6.4;
    for(let yy=top;yy<bot;yy+=.5){ const d=(yy-tie)/(h*.35), wd=8.6-3.6*Math.exp(-d*d*3)+(yy>tie?(yy-tie)*.12:0), x0=s<0?edge:edge-wd;
      rect(g,x0-.5,yy,wd+1,.5,INK); for(let k=0;k<wd;k+=1.6) rect(g,x0+k,yy,Math.min(1.6,wd-k),.5,(Math.floor(k/1.6)%2)?shade(cur,-.1):cur); }
    rect(g,s<0?edge-.5:edge-9.2,bot,9.7,.6,INK);
    const tx=s<0?edge+5:edge-5; pxEll(g,tx,tie,2.6,1.1,INK); pxEll(g,tx,tie,2,.6,shade(cur,-.28)); }); }

/* ---- A floor lamp with a fabric shade, and a framed picture of the hills ---- */
function floorLamp(g,x,base,c,on){ const top=base-34;
  pxEll(g,x,base,4.2,1.5,INK); pxEll(g,x,base-.3,3.4,1,'#5A4A3A'); rect(g,x-.9,top+6,1.8,base-top-6,INK); rect(g,x-.4,top+6,.8,base-top-6,'#C9A04A');
  g.fillStyle=INK; g.beginPath(); g.moveTo(x-4.6,top-.6); g.lineTo(x+4.6,top-.6); g.lineTo(x+7.4,top+7.6); g.lineTo(x-7.4,top+7.6); g.fill();
  g.fillStyle=c; g.beginPath(); g.moveTo(x-4,top); g.lineTo(x+4,top); g.lineTo(x+6.6,top+7); g.lineTo(x-6.6,top+7); g.fill();
  rect(g,x-6.4,top+6,12.8,1,shade(c,-.15)); rect(g,x-3.6,top+.6,1.2,5.6,shade(c,.15));
  if(on) glow(g,x,top+5,22,'#FFE9A8',.28); }
function framedPicture(g,x,y,w,h,frame){ frame=frame||'#8A6234';
  rect(g,x-1.6,y-1.6,w+3.2,h+3.2,INK); rect(g,x-1,y-1,w+2,h+2,frame); rect(g,x-1,y-1,w+2,.6,shade(frame,.2)); rect(g,x-1,y+h+.4,w+2,.6,shade(frame,-.25));
  rect(g,x,y,w,h,'#FFFDF6'); const ix=x+1.4, iy=y+1.4, iw=w-2.8, ih=h-2.8;
  vgrad(g,ix,iy,iw,ih,[[0,'#9FD2F0'],[1,'#E4F4FA']]); pxEll(g,ix+iw*.74,iy+ih*.3,1.6,1.6,'#F4C542');
  g.save(); g.beginPath(); g.rect(ix,iy,iw,ih); g.clip(); pxEll(g,ix+iw*.3,iy+ih,iw*.55,ih*.45,'#7FB08C'); pxEll(g,ix+iw*.85,iy+ih+.6,iw*.45,ih*.36,'#5E9E5A');
  rect(g,ix+iw*.24,iy+ih*.42,.8,ih*.2,'#6A4428'); pxEll(g,ix+iw*.24+.4,iy+ih*.38,1.8,2,'#3E7A4A'); g.restore(); }

/* ---- A leafy potted plant in a clay pot with a rim, and a little round café table ---- */
function pottedPlant(g,x,base,s=1){ g.save(); g.translate(x,base); g.scale(s,s);
  softShadow(g,0,.5,6.4,1.1,.24);
  pxEll(g,0,0,5,.9,INK); pxEll(g,0,-.2,4.5,.6,'#BD654C');
  g.beginPath(); g.moveTo(-5,-8); g.lineTo(5,-8); g.lineTo(3.6,-.6); g.quadraticCurveTo(0,.5,-3.6,-.6); g.closePath();
  const clay=g.createLinearGradient(-5,0,5,0); clay.addColorStop(0,'#F0A17D'); clay.addColorStop(.45,'#D87C5B'); clay.addColorStop(1,'#B85B44');
  g.fillStyle=clay; g.fill(); g.strokeStyle=INK; g.lineWidth=.6; g.stroke();
  pxEll(g,0,-8,5.5,1.8,INK); pxEll(g,0,-8.2,5,1.4,'#EA9A74'); pxEll(g,0,-8.4,4.3,1,'#5A3D2A');
  [[-2,-8.6],[1.8,-8.4],[.6,-7.9]].forEach(([xx,yy])=>pxEll(g,xx,yy,.45,.25,'#9A7046'));
  // The stalk enters the soil. Every pointed leaf grows from that same connected stem.
  g.lineCap='round'; g.strokeStyle='#3E6C40'; g.lineWidth=1.3; g.beginPath(); g.moveTo(.4,-8.2); g.bezierCurveTo(.5,-14,-1.7,-21,-.8,-26); g.stroke();
  const leaf=(bx,by,tx,ty,w,c)=>{ const dx=tx-bx,dy=ty-by,len=Math.hypot(dx,dy), nx=-dy/len*w,ny=dx/len*w;
    g.beginPath(); g.moveTo(bx,by); g.bezierCurveTo(bx+dx*.25+nx,by+dy*.25+ny,tx-dx*.25+nx,ty-dy*.25+ny,tx,ty);
    g.bezierCurveTo(tx-dx*.3-nx,ty-dy*.3-ny,bx+dx*.15-nx,by+dy*.15-ny,bx,by); g.fillStyle=c; g.fill(); g.strokeStyle='#315B38'; g.lineWidth=.5; g.stroke();
    g.strokeStyle='#A3CD7D'; g.lineWidth=.45; g.beginPath(); g.moveTo(bx,by); g.quadraticCurveTo(bx+dx*.55+nx*.2,by+dy*.55+ny*.2,tx-dx*.13,ty-dy*.13); g.stroke(); };
  [[0,-11,-8.5,-15.5,2.1,'#548C50'],[0,-13,8.5,-19,2.3,'#76AD60'],[-.5,-17,-8,-22,2.2,'#689F55'],[-.9,-20,6.7,-25,2,'#82B76A'],[-1,-23,-5.4,-28,1.7,'#4E874A'],[-.9,-25,1.6,-30,1.6,'#8DBE70'],[.3,-9.5,6.6,-12,1.7,'#639A51']].forEach(a=>leaf(...a));
  g.strokeStyle='#F6B58C'; g.lineWidth=.8; g.beginPath(); g.moveTo(-4.8,-7.8); g.quadraticCurveTo(0,-5.5,4.8,-7.8); g.stroke(); g.restore(); }
function cafeTable(g,x,y){ rect(g,x-.9,y,1.8,14,INK); rect(g,x-.4,y,.8,14,'#5A4A3A'); pxEll(g,x,y+14,5,1.4,INK); pxEll(g,x,y+13.8,4.2,.9,'#5A4A3A');
  pxEll(g,x,y,9.6,2.6,INK); pxEll(g,x,y-.2,8.8,1.9,'#F4ECD8'); pxEll(g,x-2,y-.6,4,.6,'#FFFFFF');
  rect(g,x+1.4,y-4,3.2,3.4,INK); rect(g,x+1.8,y-3.6,2.4,2.8,'#FFFFFF'); pxRing(g,x+4.8,y-2.4,1.2,1,.5,INK); rect(g,x+1.8,y-3.6,2.4,.6,'#8A5A34'); pxEll(g,x+3,y-.6,2.6,.6,INK); }

/* ---- A shop counter: a countertop with a rounded edge, raised front panels and a kick plate ---- */
function shopCounter(g,x,w,y,top,front,B){ const bot=(B?B.y1:96)+1, h=bot-y;
  rect(g,x-.5,y+1.4,w+1,h,INK); rect(g,x,y+1.4,w,h,front); rect(g,x,y+1.4,w,1,shade(front,-.25));
  const n=Math.max(2,Math.round(w/15)), gap=2.2, pw=(w-gap*(n+1))/n, ph=Math.min(15,Math.max(6,92-y-8));
  for(let i=0;i<n;i++){ const px=x+gap+i*(pw+gap), py=y+4.4; rect(g,px,py,pw,ph,shade(front,-.14)); rect(g,px+.7,py+.7,pw-1.4,ph-1.4,shade(front,.05)); rect(g,px+.7,py+.7,pw-1.4,.5,shade(front,.18)); rect(g,px+.7,py+ph-1.2,pw-1.4,.5,shade(front,-.08)); }
  rect(g,x,y+4.4+ph+1.6,w,1.6,shade(front,-.22));
  rect(g,x-2.2,y-1.6,w+4.4,3.8,INK); rect(g,x-1.6,y-1,w+3.2,2.6,top); rect(g,x-1.6,y-1,w+3.2,.7,shade(top,.2)); rect(g,x-1.6,y+1,w+3.2,.6,shade(top,-.28)); }
