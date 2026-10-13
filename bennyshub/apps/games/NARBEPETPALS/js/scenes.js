'use strict';
/* ================= Places away from home =================
   Every place is drawn across the whole view (see VIEW in pixel.js), so it fills the screen at
   any shape. Still layers are cached per time of day and view size; moving layers draw each frame. */
let ctx=null;
const layerCache={};
function cachedLayer(key,draw){ const k=skyPhase()+'|'+viewKey(); let c=layerCache[key]; if(!c||c.k!==k){ c=viewCanvas(); c.k=k; draw(c.getContext('2d'),skyPhase(),viewBounds()); layerCache[key]=c; } return c; }
/* Things that scroll past: spaced out across the view plus a margin, wrapping around. */
function scrollEach(spacing,shift,margin,fn){ const x0=VIEW.x-margin, span=Math.ceil((VIEW.w+2*margin)/spacing)*spacing, n=span/spacing;
  for(let i=0;i<n;i++) fn(x0+((((i*spacing-shift)%span)+span)%span),i); }
function skyFill(g,h,ph,B){ const S=SKY[ph], W=B.x1-B.x0; vgrad(g,B.x0,B.y0,W,h-B.y0,[[0,S[0]],[1,S[1]]]);
  if(ph==='night'){ for(let i=0;i<Math.round(W/9);i++) rect(g,B.x0+hash2(i,3,2)*W,B.y0+hash2(i,4,2)*(h-B.y0)*.7,.5,.5,'#FFF6C8'); pxEll(g,104,h*.28,4,4,'#FFF1B8'); glow(g,104,h*.28,14,'#FFF1B8',.25); }
  else if(ph==='morning'||ph==='afternoon'){ const sx=ph==='morning'?22:106; glow(g,sx,h*.3,22,'#FFF3B0',.5); pxEll(g,sx,h*.3,5,5,'#FFE27A'); }
  else { const sx=ph==='sunrise'?26:102; glow(g,sx,h*.92,34,'#FFB070',.45); pxEll(g,sx,h*.92,6,6,ph==='sunrise'?'#FFB347':'#FF8A4A'); } }
function cloud(g,x,y,s,c){ c=c||'#FFFFFF'; pxEll(g,x,y+.6,6*s,2*s,shade(c,-.05)); pxEll(g,x,y,6*s,2*s,c); pxEll(g,x+3*s,y-1.4*s,3.6*s,2.2*s,c); pxEll(g,x-2.4*s,y-.8*s,2.6*s,1.8*s,c); }
function hillBand(g,y,amp,col,seed,B){ g.fillStyle=col; g.beginPath(); g.moveTo(B.x0,B.y1); for(let x=B.x0;x<=B.x1+2;x+=2) g.lineTo(x,y-Math.abs(Math.sin(x/(22+seed*3)+seed))*amp-Math.sin(x/9+seed)*1.2); g.lineTo(B.x1+2,B.y1); g.fill(); }
function roundTree(g,x,y,night,c1,c2,h){ h=h||14; rect(g,x+6.5,y+4,3,h,night?'#4A3426':'#7A5030'); rect(g,x+6.5,y+4,1,h,night?'#5A4030':'#8A5E38'); pxEll(g,x+8.5,y,8.6,7.6,shade(c1,-.12)); pxEll(g,x+8,y-.6,8,7,c1); pxEll(g,x+5.8,y-3,4.2,3.2,c2); rect(g,x+4.6,y-3.6,1,1,shade(c2,.1)); }
function tuft(g,x,y,c){ rect(g,x,y,.5,1.5,c); rect(g,x+.8,y-.5,.5,2,c); rect(g,x+1.6,y,.5,1.5,c); }
const nightTint=(a)=>{ if(skyMode()==='night'){ ctx.fillStyle=`rgba(20,26,70,${a||.28})`; fillView(ctx); } };
const Bw=B=>B.x1-B.x0;

/* ---- Park ---- */
function drawPark(e){
  const night=skyMode()==='night';
  blitView(ctx,cachedLayer('park',(g,ph,B)=>{ const n=ph==='night'; skyFill(g,64,ph,B); if(!n) for(let t=al(B.x0,128);t<B.x1;t+=128){ cloud(g,t+30,14,1); cloud(g,t+76,22,.8); }
    hillBand(g,58,8,n?'#3E5A4A':'#A8D094',1,B); hillBand(g,64,6,n?'#355042':'#8DC07C',3,B);
    vgrad(g,B.x0,64,Bw(B),B.y1-64,[[0,n?'#4E7A52':'#8BC176'],[1,n?'#3E6A44':'#76B062']]);
    vgrad(g,B.x0,76,Bw(B),15,[[0,n?'#A58E66':'#E8C890'],[1,n?'#968058':'#DDB880']]); rect(g,B.x0,76,Bw(B),.5,n?'#86724F':'#C9A36D'); rect(g,B.x0,90.5,Bw(B),.5,n?'#86724F':'#C9A36D'); }));
  const s=e*.025;
  scrollEach(44,s*.6,40,x=>roundTree(ctx,x,46,night,night?'#2F5A3A':'#5E9E5A',night?'#3E6E48':'#86C47A'));
  scrollEach(10,s,10,x=>{ rect(ctx,x,66,2,9,'#FFF7E6'); rect(ctx,x+1.5,66,.5,9,'#D8CCB4'); rect(ctx,x-.5,65,3,1,'#FFFFFF'); });
  rect(ctx,VIEW.x,68,VIEW.w,1,'#FFF7E6'); rect(ctx,VIEW.x,72,VIEW.w,1,'#FFF7E6');
  scrollEach(17,s,10,(x,i)=>pxEll(ctx,x,82+(i%3)*3,1,.5,night?'#86724F':'#C9A36D'));
  const fl=['#F2A7B5','#FFE27A','#FFFFFF','#C9A0E0'];
  scrollEach(21,s*1.4,10,(x,i)=>{ const y=92+(i%2)*2; rect(ctx,x,y,.5,2.5,'#4F7A5D'); pxEll(ctx,x+.25,y-.5,1.3,1.1,fl[i%4]); rect(ctx,x,y-.8,.5,.5,'#F4B942'); });
  scrollEach(19,s*1.2,6,x=>tuft(ctx,x,93,night?'#3E6A44':'#5E9A50'));
}
/* ---- Beach ---- */
function drawBeach(e){
  const night=skyMode()==='night';
  blitView(ctx,cachedLayer('beach',(g,ph,B)=>{ const n=ph==='night'; skyFill(g,40,ph,B); if(ph==='morning'||ph==='afternoon') cloud(g,86,16,.9);
    vgrad(g,B.x0,40,Bw(B),20,[[0,n?'#244470':'#3E90C0'],[1,n?'#33598A':'#6CC0E4']]);
    vgrad(g,B.x0,60,Bw(B),B.y1-60,[[0,n?'#B8A57A':'#F6E0A8'],[1,n?'#A8956A':'#EACB8E']]); rect(g,B.x0,60,Bw(B),3,n?'#9C8A62':'#E0C489');
    for(let i=0,m=Math.round(Bw(B)*(B.y1-64)/60);i<m;i++) rect(g,B.x0+hash2(i,1,9)*Bw(B),64+hash2(i,2,9)*(B.y1-64),.5,.5,n?'#9C8A62':'#D8B878'); }));
  const s=e*.025;
  scrollEach(14,s*.3,20,(x,i)=>{ rect(ctx,x,44+(i%2)*6,5,.5,'#FFFFFF'); rect(ctx,x+1,44.5+(i%2)*6,3,.5,'rgba(255,255,255,.5)'); });
  for(let x=Math.floor(VIEW.x);x<VIEW.x+VIEW.w+1;x+=1) rect(ctx,x,58.6+Math.sin((x+s*.8)/5+e/400)*.9,1,1,'#FFFFFF');
  scrollEach(90,s*.8,30,x=>{ rect(ctx,x+10,50,1,22,'#FFF7E6');
    for(let r=0;r<5;r++){ const w=4+r*2; for(let c=-w;c<w;c++) rect(ctx,x+10+c,46+r,1,1,(Math.floor((c+21)/3)%2)?'#E0604A':'#FFFFFF'); } softShadow(ctx,x+10,73,10,1.6,.25); });
  scrollEach(19,s*1.4,10,(x,i)=>pxEll(ctx,x,89+(i%3)*2,1.2,.7,i%2?'#FFE9E0':'#F2A7B5'));
  if(night) nightTint(.12);
}
/* ---- Autumn woods ---- */
function drawWoods(e){
  const night=skyMode()==='night';
  blitView(ctx,cachedLayer('woods',(g,ph,B)=>{ const n=ph==='night'; skyFill(g,62,ph,B);
    for(let t=al(B.x0,128);t<B.x1;t+=128) [[10,52,16,12],[40,50,18,13],[74,52,16,12],[108,50,20,13]].forEach(q=>pxEll(g,t+q[0],q[1],q[2],q[3],n?'#3A3A4A':'#D8B478'));
    vgrad(g,B.x0,62,Bw(B),B.y1-62,[[0,n?'#5A4A34':'#B89060'],[1,n?'#4A3C2A':'#A07A4E']]);
    vgrad(g,B.x0,76,Bw(B),15,[[0,n?'#8A7656':'#E0C088'],[1,n?'#7A6848':'#D0AE76']]); rect(g,B.x0,76,Bw(B),.5,n?'#6A5A40':'#B89A60'); rect(g,B.x0,90.5,Bw(B),.5,n?'#6A5A40':'#B89A60');
    for(let i=0,m=Math.round(Bw(B)/2.6);i<m;i++){ const x=B.x0+hash2(i,5,3)*Bw(B), y=63+hash2(i,6,3)*12+(i%2?0:15); if(y<76||y>90) pxEll(g,x,y,.8,.5,['#E08A3C','#C9502E','#E8B54A'][i%3]); } }));
  const s=e*.025;
  scrollEach(44,s*.6,40,(x,i)=>{ const c=[['#E08A3C','#F2A94A'],['#C9502E','#E07A4A'],['#E8B54A','#F6D06A']][i%3]; roundTree(ctx,x,38,night,c[0],c[1],24); });
  scrollEach(31,s*1.4,12,x=>{ pxEll(ctx,x,93,5,2,'#E08A3C'); pxEll(ctx,x+2,92,2.5,1.2,'#C9502E'); });
  scrollEach(17,s,10,(x,i)=>pxEll(ctx,x,82+(i%3)*3,1,.5,'#B89A60'));
  nightTint(.3);
}
/* ---- Dog park ---- */
function drawDogPark(){
  blitView(ctx,cachedLayer('dogpark',(g,ph,B)=>{ const n=ph==='night'; skyFill(g,44,ph,B);
    for(let x=al(B.x0,30)+10;x<B.x1+12;x+=28) roundTree(g,x-8.5,32+(Math.round(x/28)%2)*3,n,n?'#2F5A3A':'#5E9E5A',n?'#3E6E48':'#86C47A',10);
    vgrad(g,B.x0,60,Bw(B),B.y1-60,[[0,n?'#4E7A52':'#8BC176'],[1,n?'#3E6A44':'#76B062']]); for(let y=64;y<B.y1;y+=8) rect(g,B.x0,y,Bw(B),4,n?'rgba(255,255,255,.04)':'rgba(255,255,255,.1)');
    for(let y=42;y<60;y+=.5) for(let x=al(B.x0,3);x<B.x1;x+=.5) if(Math.abs(((x+y)%3+3)%3)<.3||Math.abs(((x-y+300)%3+3)%3)<.3) rect(g,x,y,.5,.5,n?'#7A8490':'#B6C0CA');
    rect(g,B.x0,41,Bw(B),1,'#6A7A8A'); for(let x=al(B.x0,30)+4;x<B.x1;x+=30){ rect(g,x,40,2,21,'#6A7A8A'); rect(g,x,40,.5,21,'#8A9AAA'); }
    rect(g,100,66,2,18,'#FFFFFF'); rect(g,116,66,2,18,'#FFFFFF'); for(let x=102;x<116;x+=4) rect(g,x,72,2,2,'#D9403E'); for(let x=104;x<116;x+=4) rect(g,x,72,2,2,'#FFFFFF');
    rect(g,4,72,22,3,'#A0703F'); rect(g,4,70,22,1,'#7A5230'); rect(g,6,75,2,7,'#7A5230'); rect(g,22,75,2,7,'#7A5230'); }));
}
/* ---- Backyard and garden ---- */
function fenceRow(g,n,B){ for(let x=al(B.x0,6);x<B.x1;x+=6){ rect(g,x,36,5,24,n?'#8A7050':'#DDB880'); rect(g,x+1,35,3,1,n?'#8A7050':'#DDB880'); rect(g,x+4.5,36,.5,24,n?'#6A5438':'#C49A60'); rect(g,x+5,36,1,24,n?'#5A4630':'#A8804E'); } rect(g,B.x0,44,Bw(B),2,n?'#5A4630':'#A8804E'); rect(g,B.x0,54,Bw(B),2,n?'#5A4630':'#A8804E'); }
function drawYard(){
  blitView(ctx,cachedLayer('yard',(g,ph,B)=>{ const n=ph==='night'; skyFill(g,44,ph,B); fenceRow(g,n,B);
    vgrad(g,B.x0,60,Bw(B),B.y1-60,[[0,n?'#4E7A52':'#8BC176'],[1,n?'#3E6A44':'#76B062']]); for(let i=0,m=Math.round(Bw(B)/4);i<m;i++) tuft(g,B.x0+hash2(i,9,2)*Bw(B),62+hash2(i,8,2)*(B.y1-64),n?'#3E6A42':'#6FA85E');
    [[8,60],[20,61],[102,60],[118,61],[-8,61],[136,60]].forEach(([x,y],i)=>{ rect(g,x,y,.5,3,'#4F7A5D'); pxEll(g,x+.25,y-.4,1.3,1.1,['#F2A7B5','#FFE27A','#C9A0E0','#FFFFFF'][i%4]); });
    pxEll(g,64,86,30,7,'#5A3D22'); pxEll(g,64,85.5,27,5.6,'#7E5A36'); pxEll(g,55,84,5,1.2,'#9A7450'); pxEll(g,74,87,4,1,'#9A7450'); }));
}
function drawGarden(){
  blitView(ctx,cachedLayer('garden',(g,ph,B)=>{ const n=ph==='night'; skyFill(g,44,ph,B); fenceRow(g,n,B);
    vgrad(g,B.x0,60,Bw(B),B.y1-60,[[0,n?'#4E7A52':'#8BC176'],[1,n?'#3E6A44':'#76B062']]);
    const fl=['#F2A7B5','#FFE27A','#C9A0E0','#FFFFFF','#F07A8E']; for(let x=al(B.x0,6)+2,i=0;x<B.x1;x+=6,i++){ const y=58+(i%3); rect(g,x,y,.5,5,'#4F7A5D'); pxEll(g,x+.25,y,1.8,1.6,fl[i%5]); rect(g,x,y,.5,.5,'#F4C542'); }
    rect(g,14,70,3,14,'#9AA4AE'); pxEll(g,15.5,69,9,2.6,'#BFC8D0'); pxEll(g,15.5,68.6,7,1.6,'#9FD8F0'); }));
}
/* ---- Vet ---- */
function drawVet(){
  blitView(ctx,cachedLayer('vet',(g,ph,B)=>{ vgrad(g,B.x0,B.y0,Bw(B),50-B.y0,[[0,'#E8F6F2'],[1,'#D6EEE8']]); rect(g,B.x0,50,Bw(B),12,'#BFE3DC'); rect(g,B.x0,50,Bw(B),.5,'#8ABFB4'); rect(g,B.x0,61.5,Bw(B),.5,'#8ABFB4');
    rect(g,B.x0,62,Bw(B),B.y1-62,'#EDE8DC'); for(let x=al(B.x0,8);x<B.x1;x+=8) rect(g,x,62,.5,B.y1-62,'#D6CFBF'); for(let y=62;y<B.y1;y+=8) rect(g,B.x0,y,Bw(B),.5,'#D6CFBF');
    pxEll(g,20,19,10,10,'#2F7A7A'); pxEll(g,20,19,9,9,'#FFFFFF'); rect(g,18,12,4,14,'#E0567D'); rect(g,13,17,14,4,'#E0567D');
    rect(g,95,9,22,24,'#7A5A40'); rect(g,96,10,20,22,'#FFF7E6'); pxEll(g,103,19,2.6,2.4,'#F07A8E'); pxEll(g,108,19,2.6,2.4,'#F07A8E'); for(let r=0;r<5;r++) rect(g,101+r,21+r,Math.max(1,9-r*2),1,'#F07A8E');
    shopCounter(g,98,28,42,'#E4ECF0','#FFFFFF',{y1:61}); jar(g,102,31,'#9FD8F0'); rect(g,116,34,5,7,INK); rect(g,116.5,34.5,4,6.5,'#8CC98A'); rect(g,117.4,32.6,2.2,2,INK); rect(g,117,36,1,4,'#C8EEC0');
    softShadow(g,64,93,30,3,.25);
    rect(g,58.6,82,10.8,9,INK); rect(g,59.4,82,9.2,9,'#B8C2CA'); rect(g,59.4,82,2,9,'#D8E0E6'); rect(g,66.6,82,2,9,'#9AA4AE');
    rect(g,48,90.4,32,3.4,INK); rect(g,48.6,91,30.8,2.2,'#9AA4AE'); rect(g,48.6,91,30.8,.6,'#C8D0D8');
    rect(g,31,76.4,66,6.4,INK); rect(g,32,77,64,5,'#D8E0E6'); rect(g,32,77,64,1,'#FFFFFF'); rect(g,32,81,64,1,'#9AA4AE');
    rect(g,36,74.8,56,2.6,INK); rect(g,36.6,75.2,54.8,1.8,'#9FD8C8'); rect(g,36.6,75.2,54.8,.5,'#C8EEE4'); glow(g,64,20,60,'#FFFFFF',.25); }));
}
/* ---- Town (Pet Parade) ---- */
let townLayer=null;
function drawTown(e){ const night=skyMode()==='night', k=skyPhase()+'|'+VIEW.y+'|'+VIEW.h;
  if(!townLayer||townLayer.k!==k){ const c=hdCanvas(256,VIEW.h), g=c.getContext('2d'); g.setTransform(RES,0,0,RES,0,-VIEW.y*RES); c.k=k; const ph=skyPhase(), n=ph==='night', B={x0:0,x1:256,y0:VIEW.y,y1:VIEW.y+VIEW.h};
    skyFill(g,62,ph,B);
    for(let i=0;i<8;i++){ const s=shopSprite(i,n); blit(g,s,i*32+1,62-s.lh); }
    rect(g,0,62,256,8,'#D0CCC4'); for(let x=0;x<256;x+=10) rect(g,x,62,.5,8,'#BAB5AC'); rect(g,0,62,256,.6,'#E4E0D8'); rect(g,0,69,256,1,'#9A968E');
    /* street lamps between the shops */
    for(let x=32;x<256;x+=64){ rect(g,x-1.1,29,2.2,37,INK); rect(g,x-.5,29,1,37,'#3E4A56'); pxEll(g,x,66,2.8,1.1,INK); rect(g,x-3.2,25.4,6.4,4,INK); rect(g,x-2.6,26,5.2,2.8,n?'#FFE9A8':'#E8F0F4'); rect(g,x-3.8,24.2,7.6,1.6,INK); if(n) glow(g,x,28,16,'#FFE9A8',.3); } rect(g,0,70,256,B.y1-70,'#A8A8B0'); for(let x=0;x<256;x+=16) rect(g,x,82,8,1,'#FFFFFF'); townLayer=c; }
  const off=(e*.012)%256; for(let t=al(VIEW.x+off,256)-off;t<VIEW.x+VIEW.w;t+=256) ctx.drawImage(townLayer,snap(t),VIEW.y,256,VIEW.h);
  scrollEach(8,-e*.02,8,(x,i)=>{ const y=6+Math.round(Math.sin((x+e*.02)/10)*2); rect(ctx,x,y,1,1,'#8A6A4A'); ctx.fillStyle=['#F07A8E','#F4C96A','#7FB08C','#7FA8D8'][i%4]; ctx.beginPath(); ctx.moveTo(x+1.5,y+1); ctx.lineTo(x+6.5,y+1); ctx.lineTo(x+4,y+5); ctx.fill(); });
  scrollEach(10,0,10,(x,i)=>{ const bob=Math.floor(e/180+i)%2; pxEll(ctx,x+4,92-bob,4.2,4.2,INK); pxEll(ctx,x+4,92-bob,3.4,3.4,['#F2C9A5','#C68A5E','#8A5A3A','#F2D2B8'][i%4]); rect(ctx,x+1,88-bob,6,2,['#3B2A22','#F4C542','#8A4A2A','#1C130E'][i%4]); });
  if(night){ ctx.fillStyle='rgba(20,24,60,0.22)'; fillView(ctx); } }
/* ---- Cat café ---- */
function drawCafe(){
  blitView(ctx,cachedLayer('cafe',(g,ph,B)=>{ rect(g,B.x0,B.y0,Bw(B),62-B.y0,'#F6E3C8'); for(let x=al(B.x0,12)+6;x<B.x1;x+=12) rect(g,x,B.y0,1,62-B.y0,'#EFD2B4'); planks(g,'#C08A5A','#A8744A',B); rect(g,B.x0,55,Bw(B),6,'#FFF7E6');
    [20,38].forEach(y=>{ rect(g,77.4,y-.6,47.2,4.2,INK); rect(g,78,y,46,3,'#A8743E'); rect(g,78,y,46,.8,'#C8925A'); rect(g,81.4,y+3.6,1.4,3,'#5A4A3A'); rect(g,119.2,y+3.6,1.4,3,'#5A4A3A'); }); [[82,12,'#F2A7B5'],[94,13,'#9FC4E8'],[106,12,'#F4D27A'],[84,30,'#B89AD8'],[98,31,'#F2A7B5']].forEach(([x,y,c])=>{ rect(g,x-1,y-1,9,9,INK); rect(g,x,y,7,7,c); rect(g,x,y,7,2,shade(c,.1)); });
    rect(g,5.4,9.4,31.2,19.2,INK); rect(g,6,10,30,18,'#8A6234'); rect(g,6,10,30,.6,'#A87A4A'); rect(g,7,11,28,16,'#2F4A40'); rect(g,10,23.4,9,.5,'#F4E4C8'); rect(g,21,23.4,6,.5,'#F4E4C8'); rect(g,6,28,30,1.6,INK); rect(g,6.4,28.2,29.2,1,'#A87A4A'); rect(g,12,27.4,2.4,.8,'#FFFFFF'); pxEll(g,15,19,3,2.4,'#F4E4C8'); pxEll(g,26,19,3,2.4,'#F4E4C8'); rect(g,14,15,2,2,'#F4E4C8'); rect(g,25,15,2,2,'#F4E4C8');
    cafeTable(g,14,64); cafeTable(g,114,64);
    [[18,'#F2A7B5'],[110,'#9FC4E8']].forEach(([x,c])=>{ pxEll(g,x,86,14.8,4.8,INK); pxEll(g,x,86,14,4,shade(c,-.2)); pxEll(g,x,85,12,3,c); pxRing(g,x,85,9,2,.4,shade(c,.2)); pxEll(g,x-4,84,3,.6,shade(c,.25)); }); glow(g,64,10,70,'#FFE9B0',.2); })); }
/* ---- Cat show stage ---- */
function drawStage(){
  blitView(ctx,cachedLayer('stage',(g,ph,B)=>{ rect(g,B.x0,B.y0,Bw(B),B.y1-B.y0,'#2A1E30'); for(let x=al(B.x0,6);x<B.x1;x+=6){ vgrad(g,x,B.y0,5,70-B.y0,[[0,'#A83A4A'],[1,'#7A2232']]); rect(g,x+5,B.y0,1,70-B.y0,'#5A1A26'); } rect(g,B.x0,B.y0,Bw(B),6-B.y0,'#C9A04A'); rect(g,B.x0,5.5,Bw(B),.5,'#8A6A2A');
    rect(g,B.x0,70,Bw(B),B.y1-70,'#6A4A3A'); for(let x=al(B.x0,10);x<B.x1;x+=10) rect(g,x,70,.5,B.y1-70,'#5A3A2A');
    g.fillStyle='rgba(255,240,190,0.2)'; g.beginPath(); g.moveTo(58,6); g.lineTo(70,6); g.lineTo(100,88); g.lineTo(28,88); g.fill(); glow(g,64,84,30,'#FFF0C0',.3);
    rect(g,44,78,40,8,INK); rect(g,45,79,38,6,'#F4E4C8'); rect(g,45,79,38,1,'#FFFFFF'); })); }
/* ---- The NARBE Pet Pals Rescue (adoption scenes) ---- */
function drawShelter(){
  blitView(ctx,cachedLayer('shelter',(g,ph,B)=>{ const W=Bw(B);
    vgrad(g,B.x0,B.y0,W,56-B.y0,[[0,'#FBE9D4'],[1,'#F2D6B8']]); for(let x=al(B.x0,10)+4;x<B.x1;x+=10) rect(g,x,B.y0,1,46-B.y0,'rgba(214,170,130,.25)');
    rect(g,B.x0,44,W,12,'#E6C49E'); rect(g,B.x0,44,W,.5,'#B88A5E'); for(let x=al(B.x0,16)+8;x<B.x1;x+=16) rect(g,x,45,.5,10,'#D2AE86');
    planks(g,'#D9A066','#C58A52',B); rect(g,B.x0,55,W,6,'#FFF7E6'); rect(g,B.x0,55,W,.5,'#A87B55'); rect(g,B.x0,60.5,W,.5,'#A87B55');
    vgrad(g,B.x0,61,W,B.y1-61,[[0,'rgba(0,0,0,0)'],[1,'rgba(60,30,10,.14)']]);
    for(let x=B.x0;x<B.x1;x+=.5) rect(g,x,3+Math.sin((x-B.x0)/W*Math.PI)*6,.5,.5,'#8A6A4A');
    const cols=['#F07A8E','#F4C96A','#7FB08C','#7FA8D8']; for(let x=B.x0+6,i=0;x<B.x1;x+=15,i++){ const y=3.5+Math.sin((x-B.x0)/W*Math.PI)*6; g.fillStyle=cols[i%4]; g.beginPath(); g.moveTo(x-3.5,y); g.lineTo(x+3.5,y); g.lineTo(x,y+6); g.fill(); }
    rect(g,38,13,52,28,'#7A5A40'); rect(g,39,14,50,26,'#C08A5A'); rect(g,41,16,46,22,'#FFF7E6');
    heartFill(g,64,22,4.2,'#D9577A'); rect(g,51,30,26,5,'#F4C96A'); rect(g,51,34.5,26,.5,'#B88A2A'); for(let i=0;i<5;i++) pxEll(g,55+i*4.4,32.4,1.1,1.1,'#D9577A');
    [[-6,22],[134,24],[18,30],[110,30]].forEach(([x,y])=>{ pxEll(g,x,y+4,3,2.3,'#E8B8A0'); [[-4,0],[-1,-2],[2,-2],[5,0]].forEach(d=>pxEll(g,x+d[0]-.5,y+d[1],1.1,1.2,'#E8B8A0')); });
    /* A cozy corner: a food bowl, a toy bin and a pet bed along the back. */
    softShadow(g,4,60.5,12,1.6,.25); rect(g,-6,50,20,10,'#C99A62'); rect(g,-6,50,20,1.5,'#E3BC84'); pxEll(g,-1,49,3,2.6,'#D8E24A'); pxEll(g,6,49.4,2.4,2.2,'#C77DBA');
    softShadow(g,124,60.5,14,1.6,.25); pxEll(g,124,57,13,4,'#8A5A8A'); pxEll(g,124,56.4,10,2.4,'#F2A7B5');
    glow(g,64,10,90,'#FFF3D0',.25); }));
}
function heartFill(g,x,y,s,c){ pxEll(g,x-s*.55,y,s*.62,s*.58,c); pxEll(g,x+s*.55,y,s*.62,s*.58,c); g.fillStyle=c; g.beginPath(); g.moveTo(x-s*1.15,y+s*.15); g.lineTo(x+s*1.15,y+s*.15); g.lineTo(x,y+s*1.4); g.fill(); }
function drawWalkScene(sc,e){ if(sc==='dogpark') drawDogPark(e); else if(sc==='beach') drawBeach(e); else if(sc==='woods') drawWoods(e); else drawPark(e); }
