'use strict';
/* ================= HD pixel engine =================
   Layout is in logical pixels (the scene is 128 x 96) and drawn at RES device pixels per logical
   pixel, so the art has twice the detail while every position in the game keeps its old numbers.
   Sprites are painted into tag buffers, then shaded (3 tones, light from the top left), given a
   colored outline between parts and a dark outer outline, so pets and items read clearly. */
const RES=2;
const INK='#1C130E';
const snap=v=>Math.round(v*RES)/RES;
function hdCanvas(w,h,el){ const c=el||document.createElement('canvas'); c.width=Math.round(w*RES); c.height=Math.round(h*RES); c.lw=w; c.lh=h;
  const g=c.getContext('2d'); g.setTransform(RES,0,0,RES,0,0); g.imageSmoothingEnabled=false; return c; }
function prepCanvas(el){ return hdCanvas(+el.dataset.lw,+el.dataset.lh,el); }
/* The part of the world on screen, in scene coordinates. Scenes are laid out for x 0-128 as before
   (the pet sits at x 64), but the view is at least 160 x 96 and grows to fill any screen shape, so
   every background is drawn across the whole view rather than boxed in. ui.js keeps this updated. */
const VIEW={x:-16,y:0,w:160,h:96};
function fillView(g,c){ if(c) g.fillStyle=c; g.fillRect(VIEW.x-1,VIEW.y-1,VIEW.w+2,VIEW.h+2); }
/* A cache canvas covering the view, drawn in scene coordinates. */
function viewCanvas(){ const c=hdCanvas(VIEW.w,VIEW.h), g=c.getContext('2d'); g.setTransform(RES,0,0,RES,-VIEW.x*RES,-VIEW.y*RES); g.imageSmoothingEnabled=false; c.vx=VIEW.x; c.vy=VIEW.y; return c; }
function blitView(g,c){ g.drawImage(c,c.vx,c.vy,c.lw,c.lh); }
const viewKey=()=>VIEW.x+','+VIEW.y+','+VIEW.w+','+VIEW.h;

/* ---- Drawing on canvases (logical coordinates) ---- */
function rect(g,x,y,w,h,c){ if(!(w>0&&h>0)) return; g.fillStyle=c; const x0=snap(x), y0=snap(y); g.fillRect(x0,y0,Math.max(1/RES,snap(x+w)-x0),Math.max(1/RES,snap(y+h)-y0)); }
function pxEll(g,cx,cy,rx,ry,c){ if(!(rx>0&&ry>0)) return; g.fillStyle=c; const y0=Math.floor((cy-ry)*RES), y1=Math.ceil((cy+ry)*RES);
  for(let Y=y0;Y<y1;Y++){ const dy=((Y+.5)/RES-cy)/ry; if(dy<=-1||dy>=1) continue; const hw=rx*Math.sqrt(1-dy*dy), X0=Math.round((cx-hw)*RES), X1=Math.round((cx+hw)*RES); if(X1>X0) g.fillRect(X0/RES,Y/RES,(X1-X0)/RES,1/RES); } }
function pxRing(g,cx,cy,rx,ry,th,c){ if(!(rx>0&&ry>0)) return; g.fillStyle=c; const irx=rx-th, iry=ry-th, y0=Math.floor((cy-ry)*RES), y1=Math.ceil((cy+ry)*RES);
  for(let Y=y0;Y<y1;Y++){ const yy=(Y+.5)/RES-cy, dy=yy/ry; if(dy<=-1||dy>=1) continue; const hw=rx*Math.sqrt(1-dy*dy), di=iry>0?yy/iry:2, iw=(irx>0&&di>-1&&di<1)?irx*Math.sqrt(1-di*di):0;
    const a0=Math.round((cx-hw)*RES), a1=Math.round((cx-iw)*RES), b0=Math.round((cx+iw)*RES), b1=Math.round((cx+hw)*RES);
    if(iw>0){ if(a1>a0) g.fillRect(a0/RES,Y/RES,(a1-a0)/RES,1/RES); if(b1>b0) g.fillRect(b0/RES,Y/RES,(b1-b0)/RES,1/RES); } else if(b1>a0) g.fillRect(a0/RES,Y/RES,(b1-a0)/RES,1/RES); } }
function pxLine(g,x0,y0,x1,y1,c,th){ g.fillStyle=c; const s=Math.max(1,Math.round((th||1)*RES)); let X=Math.round(x0*RES), Y=Math.round(y0*RES); const X1=Math.round(x1*RES), Y1=Math.round(y1*RES);
  const dx=Math.abs(X1-X), dy=-Math.abs(Y1-Y), sx=X<X1?1:-1, sy=Y<Y1?1:-1; let err=dx+dy;
  for(let n=0;n<3000;n++){ g.fillRect(X/RES,Y/RES,s/RES,s/RES); if(X===X1&&Y===Y1) break; const e2=2*err; if(e2>=dy){ err+=dy; X+=sx; } if(e2<=dx){ err+=dx; Y+=sy; } } }
/* Sprites carry a clear margin (px, py) around their drawing so outlines and edges are never cut off;
   lw/lh stay the drawing's own size, so every position in the game is unchanged. */
function blit(g,s,x,y){ const px=s.px||0, py=s.py||0; g.drawImage(s,snap(x-px),snap(y-py),(s.lw||s.width)+px*2,(s.lh||s.height)+py*2); }
/* Draw a sprite scaled to w x h (its own size, margin not counted). */
function blitSized(g,s,x,y,w,h){ const kx=w/(s.lw||s.width), ky=h/(s.lh||s.height), px=(s.px||0)*kx, py=(s.py||0)*ky; g.drawImage(s,x-px,y-py,w+px*2,h+py*2); }
function blitC(g,s,cx,y){ blit(g,s,cx-(s.lw||s.width)/2,y); }
/* Modern touches on top of the pixels: smooth sky gradients and soft light. */
function vgrad(g,x,y,w,h,stops){ const gr=g.createLinearGradient(0,y,0,y+h); stops.forEach(([o,c])=>gr.addColorStop(o,c)); g.fillStyle=gr; g.fillRect(x,y,w,h); }
function glow(g,cx,cy,r,c,a){ const gr=g.createRadialGradient(cx,cy,0,cx,cy,r); gr.addColorStop(0,rgbaStr(c,a)); gr.addColorStop(1,rgbaStr(c,0)); g.fillStyle=gr; g.fillRect(cx-r,cy-r,r*2,r*2); }
function softShadow(g,cx,cy,rx,ry,a){ g.save(); g.translate(cx,cy); g.scale(1,ry/rx); const gr=g.createRadialGradient(0,0,0,0,0,rx); gr.addColorStop(0,`rgba(60,34,18,${a})`); gr.addColorStop(.7,`rgba(60,34,18,${a*.6})`); gr.addColorStop(1,'rgba(60,34,18,0)'); g.fillStyle=gr; g.fillRect(-rx,-rx,rx*2,rx*2); g.restore(); }

/* ---- Color ---- */
const rgbCache={};
function hexRGB(hex){ let v=rgbCache[hex]; if(v) return v; const h=hex.replace('#','');
  v=[parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16),h.length>=8?parseInt(h.slice(6,8),16):255]; rgbCache[hex]=v; return v; }
const hx2=n=>clamp(Math.round(n),0,255).toString(16).padStart(2,'0');
function rgbHex(r,g,b,a){ return '#'+hx2(r)+hx2(g)+hx2(b)+(a!=null&&a<255?hx2(a):''); }
function rgbaStr(hex,a){ const v=hexRGB(hex); return `rgba(${v[0]},${v[1]},${v[2]},${a})`; }
function mix(a,b,t){ const A=hexRGB(a), B2=hexRGB(b); return rgbHex(A[0]+(B2[0]-A[0])*t,A[1]+(B2[1]-A[1])*t,A[2]+(B2[2]-A[2])*t,A[3]<255?A[3]:null); }
function rgb2hsl(r,g,b){ r/=255; g/=255; b/=255; const mx=Math.max(r,g,b), mn=Math.min(r,g,b), l=(mx+mn)/2; let h=0, s=0;
  if(mx!==mn){ const d=mx-mn; s=l>.5?d/(2-mx-mn):d/(mx+mn); h=mx===r?(g-b)/d+(g<b?6:0):mx===g?(b-r)/d+2:(r-g)/d+4; h*=60; } return [h,s,l]; }
function hsl2rgb(h,s,l){ h=((h%360)+360)%360/360; if(!s) return [l*255,l*255,l*255]; const q=l<.5?l*(1+s):l+s-l*s, p=2*l-q;
  const f=t=>{ t=(t+1)%1; return t<1/6?p+(q-p)*6*t:t<1/2?q:t<2/3?p+(q-p)*(2/3-t)*6:p; }; return [f(h+1/3)*255,f(h)*255,f(h-1/3)*255]; }
function hueToward(h,t,deg){ let d=((t-h+540)%360)-180; return h+clamp(d,-deg,deg); }
const shadeCache={};
/* Lighter tones drift warm (toward yellow), darker tones drift cool (toward blue), the way painted light does. */
function shade(hex,dl){ const key=hex+dl; let v=shadeCache[key]; if(v) return v; const A=hexRGB(hex); let [h,s,l]=rgb2hsl(A[0],A[1],A[2]);
  if(dl>0){ h=hueToward(h,55,Math.min(1,dl/.12)*9); s=Math.min(1,s+dl*.2); l=Math.min(.97,l+dl*(1-l)*1.5+dl*.18); }
  else { const m=-dl; h=hueToward(h,250,Math.min(1,m/.12)*10); s=Math.min(1,s+m*.3); l=Math.max(.03,l-m*(l*1.05+.06)); }
  const c=hsl2rgb(h,s,l); v=rgbHex(c[0],c[1],c[2],A[3]<255?A[3]:null); shadeCache[key]=v; return v; }

/* ---- Tag buffers for sprites ----
   A buffer is w x h logical pixels stored at RES x detail. ox/oy shift the drawing origin, so a pet
   can be drawn in its own 44 x 44 coordinates on a canvas with room above for hats.
   A tag is a palette name ('fur') or a color ('#RRGGBB'). Suffix ^ lighter, _ darker, ~ darkest,
   ! outline. A leading * keeps the pixel out of outlines (whiskers, sparkles). */
function B(w,h,ox,oy){ const W=Math.round(w*RES), Hh=Math.round(h*RES); return {w:W,h:Hh,lw:w,lh:h,ox:ox||0,oy:oy||0,px:new Array(W*Hh).fill(null),bb:null}; }
function sp(b,X,Y,t){ if(t==null||X<0||Y<0||X>=b.w||Y>=b.h) return; b.px[Y*b.w+X]=t; const q=b.bb; if(q){ if(X<q[0]) q[0]=X; if(Y<q[1]) q[1]=Y; if(X>q[2]) q[2]=X; if(Y>q[3]) q[3]=Y; } }
const LX=-.55, LY=-.83, SH={}, SHL={hi:.5,lo:-.5}, SHS={hi:.3,lo:-.2};
/* Clean cel shading: a lit crescent toward the top left and a shaded one toward the bottom right. */
function tone(nx,ny,d,sh){ const s=-(nx*LX+ny*LY), hi=sh.hi!=null?sh.hi:.46, lo=sh.lo!=null?sh.lo:-.3;
  if(sh.hi!==false&&d<.84&&s>hi) return '^';
  if(sh.lo!==false&&d>.2&&s<lo) return '_';
  return ''; }
const tagAt=(t,x,y,nx,ny)=>typeof t==='function'?t(x,y,nx,ny):t;
function addTone(t,tn){ if(!tn||!t) return t; const l=t[t.length-1]; return (l==='^'||l==='_'||l==='!'||l==='~')?t:t+tn; }
/* Ellipse. sh adds shading. y0/y1 clip it to a band (for clothes). */
function E(b,cx,cy,rx,ry,t,sh,y0,y1){ if(!(rx>0&&ry>0)) return; cx+=b.ox; cy+=b.oy;
  const X0=Math.floor((cx-rx)*RES), X1=Math.ceil((cx+rx)*RES), Ya=Math.floor((cy-ry)*RES), Yb=Math.ceil((cy+ry)*RES);
  for(let Y=Ya;Y<Yb;Y++){ const y=(Y+.5)/RES, ny=(y-cy)/ry; if(ny<=-1||ny>=1) continue; const py=y-b.oy; if(y0!=null&&py<y0) continue; if(y1!=null&&py>y1) continue;
    for(let X=X0;X<X1;X++){ const x=(X+.5)/RES, nx=(x-cx)/rx, d=nx*nx+ny*ny; if(d>1) continue; let tt=tagAt(t,x-b.ox,py,nx,ny); if(sh&&tt) tt=addTone(tt,tone(nx,ny,d,sh===true?SH:sh,X,Y)); sp(b,X,Y,tt); } } }
/* Rectangle with optional rounded corners (r) and shading (top lighter, bottom darker). */
function R(b,x,y,w,h,t,sh,r){ x+=b.ox; y+=b.oy; r=r||0; const X0=Math.round(x*RES), X1=Math.round((x+w)*RES), Y0=Math.round(y*RES), Y1=Math.round((y+h)*RES), rr=r*RES;
  for(let Y=Y0;Y<Y1;Y++) for(let X=X0;X<X1;X++){
    if(rr){ const cx=X<X0+rr?X0+rr:X>=X1-rr?X1-rr-1:null, cy=Y<Y0+rr?Y0+rr:Y>=Y1-rr?Y1-rr-1:null; if(cx!=null&&cy!=null&&(X-cx)**2+(Y-cy)**2>rr*rr) continue; }
    const px=(X+.5)/RES, py=(Y+.5)/RES; let tt=tagAt(t,px-b.ox,py-b.oy,(px-x)/w*2-1,(py-y)/h*2-1);
    if(sh&&tt){ const f=(Y-Y0)/Math.max(1,Y1-Y0-1), s2=sh===true?SH:sh; tt=addTone(tt,(s2.hi!==false&&f<.2)?'^':(s2.lo!==false&&f>.74)?'_':''); }
    sp(b,X,Y,tt); } }
/* Triangle. */
function Tr(b,ax,ay,bx,by,cx,cy,t,sh){ ax+=b.ox; bx+=b.ox; cx+=b.ox; ay+=b.oy; by+=b.oy; cy+=b.oy;
  const e=(px,py,x1,y1,x2,y2)=>(px-x2)*(y1-y2)-(x1-x2)*(py-y2), mnx=Math.min(ax,bx,cx), mxx=Math.max(ax,bx,cx), mny=Math.min(ay,by,cy), mxy=Math.max(ay,by,cy), mx=(mnx+mxx)/2, my=(mny+mxy)/2;
  for(let Y=Math.floor(mny*RES);Y<Math.ceil(mxy*RES);Y++) for(let X=Math.floor(mnx*RES);X<Math.ceil(mxx*RES);X++){ const x=(X+.5)/RES, y=(Y+.5)/RES;
    const d1=e(x,y,ax,ay,bx,by), d2=e(x,y,bx,by,cx,cy), d3=e(x,y,cx,cy,ax,ay); if((d1<0||d2<0||d3<0)&&(d1>0||d2>0||d3>0)) continue;
    const nx=(x-mx)/((mxx-mnx)/2||1), ny=(y-my)/((mxy-mny)/2||1); let tt=tagAt(t,x-b.ox,y-b.oy,nx,ny); if(sh&&tt) tt=addTone(tt,tone(nx,ny,.5,sh===true?SH:sh,X,Y)); sp(b,X,Y,tt); } }
/* Line, th in device pixels. */
function Ln(b,x0,y0,x1,y1,t,th){ th=th||1; let X=Math.round((x0+b.ox)*RES), Y=Math.round((y0+b.oy)*RES); const X1=Math.round((x1+b.ox)*RES), Y1=Math.round((y1+b.oy)*RES);
  const dx=Math.abs(X1-X), dy=-Math.abs(Y1-Y), sx=X<X1?1:-1, sy=Y<Y1?1:-1; let err=dx+dy;
  for(let n=0;n<2000;n++){ for(let a=0;a<th;a++) for(let c=0;c<th;c++) sp(b,X+a,Y+c,t); if(X===X1&&Y===Y1) break; const e2=2*err; if(e2>=dy){ err+=dy; X+=sx; } if(e2<=dx){ err+=dx; Y+=sy; } } }
/* One device pixel at a logical point. */
function D(b,x,y,t){ sp(b,Math.floor((x+b.ox)*RES),Math.floor((y+b.oy)*RES),t); }
/* Arc: the top half (up) or bottom half of an ellipse outline, th device pixels thick. */
function Arc(b,cx,cy,rx,ry,t,up,th){ th=th||2; cx+=b.ox; cy+=b.oy; const tol=th/(RES*Math.min(rx,ry))*.55;
  for(let Y=Math.floor((cy-ry-1)*RES);Y<Math.ceil((cy+ry+1)*RES);Y++) for(let X=Math.floor((cx-rx-1)*RES);X<Math.ceil((cx+rx+1)*RES);X++){
    const nx=((X+.5)/RES-cx)/rx, ny=((Y+.5)/RES-cy)/ry; if(up?ny>.12:ny<-.12) continue; if(Math.abs(Math.sqrt(nx*nx+ny*ny)-1)<=tol) sp(b,X,Y,t); } }
/* Draw a group of shapes as one part with its own colored outline. */
const OUT_SUF={'^':1,'_':1,'~':1,'!':1};
function outTag(t){ if(t.charCodeAt(0)===42) return null; return (OUT_SUF[t[t.length-1]]?t.slice(0,-1):t)+'!'; }
function part(b,fn){
  const T={w:b.w,h:b.h,lw:b.lw,lh:b.lh,ox:b.ox,oy:b.oy,px:new Array(b.px.length).fill(null),bb:[b.w,b.h,-1,-1]}; fn(T);
  const q=T.bb; if(q[2]<0) return; const W=b.w, src=T.px, dst=b.px, x0=Math.max(0,q[0]-1), x1=Math.min(W-1,q[2]+1), y0=Math.max(0,q[1]-1), y1=Math.min(b.h-1,q[3]+1);
  for(let Y=y0;Y<=y1;Y++) for(let X=x0;X<=x1;X++){ const i=Y*W+X; if(src[i]) dst[i]=src[i]; }
  for(let Y=y0;Y<=y1;Y++) for(let X=x0;X<=x1;X++){ const i=Y*W+X; if(src[i]) continue;
    const n=(X>0&&src[i-1])||(X<W-1&&src[i+1])||(Y>0&&src[i-W])||(Y<b.h-1&&src[i+W]); if(n){ const o=outTag(n); if(o) dst[i]=o; } }
}
const DEF_PAL={shine:'#FFFFFF',blush:'#F4A0AE',tongue:'#F07A8E',mouthIn:'#6A2A36',collar:'#D9577A',tag:'#F4C542',earIn:'#F2A9B4',iris:'#6A4424',
  noseCat:'#EE8FA0',whisker:'#5A4636',nose:'#2E1C12',eye:'#1E1614',line:'#4A3228',lid:'#4A3228'};
const FALLBACK={paw:'light',tail:'fur',ear:'fur',muzzle:'light'};
const DULLABLE={fur:1,light:1,ear:1,tail:1,paw:1,grey:1,muzzle:1};
const SUF_DL={'^':.1,'_':-.13,'~':-.24,'!':-.36};
function resolveTag(t,pal,opt,x,y){
  if(t.charCodeAt(0)===42) t=t.slice(1);
  let suf='', l=t[t.length-1]; if(SUF_DL[l]){ suf=l; t=t.slice(0,-1); }
  let c;
  if(t.charCodeAt(0)===35) c=t;
  else { const pat=opt.pattern; c=(pat&&pat(x,y,t,opt.geo))||pal[t];
    if(!c&&FALLBACK[t]){ const f=FALLBACK[t]; c=(pat&&pat(x,y,f,opt.geo))||pal[f]; }
    if(!c&&t==='grey') c=mix(pal.light||pal.fur,'#E6E2DC',.62);
    if(!c) c=DEF_PAL[t]||pal.fur||'#FF00FF'; }
  if(opt.dull&&DULLABLE[t]) c=mix(c,'#8C8878',.42);
  return suf?shade(c,SUF_DL[suf]):c;
}
/* Turn a tag buffer into a canvas: resolve colors, then add a dark, color-tinted outer outline. */
function finish(b,pal,opt){
  opt=opt||{}; pal=pal||{}; const W=b.w, Hh=b.h, px=b.px, col=new Array(px.length);
  for(let Y=0;Y<Hh;Y++) for(let X=0;X<W;X++){ const i=Y*W+X, t=px[i]; if(t) col[i]=resolveTag(t,pal,opt,(X+.5)/RES-b.ox,(Y+.5)/RES-b.oy); }
  const c=document.createElement('canvas'); c.width=W; c.height=Hh; c.lw=b.lw; c.lh=b.lh; const g=c.getContext('2d'), img=g.createImageData(W,Hh), d=img.data;
  const put=(i,hex)=>{ const v=hexRGB(hex); d[i*4]=v[0]; d[i*4+1]=v[1]; d[i*4+2]=v[2]; d[i*4+3]=v[3]; };
  for(let i=0;i<px.length;i++) if(col[i]) put(i,col[i]);
  if(opt.ink!==false){ const ink=opt.inkColor;
    for(let Y=0;Y<Hh;Y++) for(let X=0;X<W;X++){ const i=Y*W+X; if(px[i]) continue; let n=-1;
      if(X>0&&px[i-1]&&px[i-1].charCodeAt(0)!==42) n=i-1; else if(X<W-1&&px[i+1]&&px[i+1].charCodeAt(0)!==42) n=i+1; else if(Y>0&&px[i-W]&&px[i-W].charCodeAt(0)!==42) n=i-W; else if(Y<Hh-1&&px[i+W]&&px[i+W].charCodeAt(0)!==42) n=i+W;
      if(n>=0){ const cc=col[n]; put(i,ink||mix(shade(cc.slice(0,7),-.3),INK,.6)); } } }
  g.putImageData(img,0,0); return c;
}
/* A quick sprite: draw(b) in logical units, get a shaded, outlined canvas back. It is drawn with a
   2-pixel margin all round (opt.padX / opt.padY change it; seamless ceiling strips use 0 at the sides). */
const SPR_PAD=2;
function sprite(w,h,draw,opt){ const px=opt&&opt.padX!=null?opt.padX:SPR_PAD, py=opt&&opt.padY!=null?opt.padY:SPR_PAD, b=B(w+px*2,h+py*2,px,py); draw(b);
  const c=finish(b,{},opt); c.lw=w; c.lh=h; c.px=px; c.py=py; return c; }
const inC=(x,y,cx,cy,r)=>((x-cx)**2+(y-cy)**2)<r*r;
const alt=n=>((Math.floor(n)%2)+2)%2;
function hash2(x,y,s){ let h=(x*374761393+y*668265263+s*982451653)|0; h=(h^(h>>>13))*1274126177|0; return ((h^(h>>>16))>>>0)/4294967296; }
