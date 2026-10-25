'use strict';
/* ================= Side-view pets: walking, running, standing, lying down =================
   Drawn facing right in their own space (feet on row 46, centered near x 28), inside a 68 x 66
   sprite with room for hats and long tails. Flipped when the pet walks left. Side-view pets are
   drawn 20% larger than their measurements below, so a walking pet looks as big as a sitting one.
   Front-facing sitting stays in pets.js. */
const SIDE_OX=14, SIDE_OY=16, SIDE_W=84, SIDE_H=72, SIDE_GX=28, SIDE_GY=46, SIDE_F=1.2, SWIM_FRAMES=8;
const SIDE={
  dog:{
    baby:{body:{cx:25,cy:36.5,rx:8.2,ry:5.6},head:{dx:9,dy:-9,rx:7.4,ry:6.8},snout:{dx:5.6,dy:2.3,rx:3.2,ry:2.5},leg:{w:1.55,fx:5,bx:-5.2},ear:{x:-2.6,y:.8,rx:2.6,ry:4.2,perk:5.4},eye:{dx:2.4,dy:-1.2,r:1.7},tail:{r:1.5,len:3.4}},
    teen:{body:{cx:24,cy:34.5,rx:10.6,ry:6.4},head:{dx:11.6,dy:-10.4,rx:7,ry:6.3},snout:{dx:5.8,dy:2.2,rx:3.9,ry:2.6},leg:{w:1.75,fx:7,bx:-7.2},ear:{x:-2.4,y:1,rx:2.5,ry:4.8,perk:6.2},eye:{dx:2.4,dy:-1.2,r:1.55},tail:{r:1.8,len:4.2}},
    adult:{body:{cx:23,cy:33,rx:12.6,ry:7.4},head:{dx:13.4,dy:-11.2,rx:7,ry:6.2},snout:{dx:6,dy:2.3,rx:4.6,ry:2.8},leg:{w:2,fx:8.4,bx:-8.6},ear:{x:-2.2,y:1.2,rx:2.6,ry:5.2,perk:6.6},eye:{dx:2.5,dy:-1.2,r:1.45},tail:{r:2.1,len:5}},
    senior:{body:{cx:23,cy:33.5,rx:12.8,ry:7.9},head:{dx:13.2,dy:-10.2,rx:7,ry:6.2},snout:{dx:6,dy:2.4,rx:4.6,ry:2.9},leg:{w:2,fx:8.4,bx:-8.6},ear:{x:-2.2,y:1.6,rx:2.7,ry:5.6,perk:6.2},eye:{dx:2.5,dy:-1,r:1.45,lid:.32},tail:{r:2,len:4.6},senior:true}
  },
  cat:{
    baby:{body:{cx:25,cy:37,rx:7.6,ry:5},head:{dx:8.6,dy:-8.4,rx:7,ry:6},snout:{dx:5.2,dy:1.8,rx:2.1,ry:1.7},leg:{w:1.35,fx:4.6,bx:-4.8},ear:{h:5.6},eye:{dx:2.2,dy:-.9,r:1.75},tail:{r:1.3,len:10}},
    teen:{body:{cx:24,cy:35.5,rx:9.6,ry:5.6},head:{dx:10.4,dy:-9.4,rx:6.6,ry:5.6},snout:{dx:5,dy:1.8,rx:2.2,ry:1.7},leg:{w:1.5,fx:6.2,bx:-6.4},ear:{h:6.2},eye:{dx:2.2,dy:-.9,r:1.55},tail:{r:1.45,len:12}},
    adult:{body:{cx:23,cy:34.5,rx:11.4,ry:6.4},head:{dx:12.2,dy:-10,rx:6.5,ry:5.5},snout:{dx:5,dy:1.8,rx:2.3,ry:1.8},leg:{w:1.7,fx:7.6,bx:-7.8},ear:{h:6.4},eye:{dx:2.3,dy:-.8,r:1.5},tail:{r:1.6,len:14}},
    senior:{body:{cx:23,cy:35,rx:11.8,ry:6.8},head:{dx:12,dy:-9.4,rx:6.5,ry:5.5},snout:{dx:5,dy:1.9,rx:2.4,ry:1.8},leg:{w:1.7,fx:7.6,bx:-7.8},ear:{h:6},eye:{dx:2.3,dy:-.7,r:1.5,lid:.24},tail:{r:1.6,len:13},senior:true}
  }
};
(function scaleSide(){ const F=SIDE_F; Object.values(SIDE).forEach(k=>Object.values(k).forEach(P=>{
  P.body.cx=SIDE_GX+(P.body.cx-SIDE_GX)*F; P.body.cy=SIDE_GY-(SIDE_GY-P.body.cy)*F; P.body.rx*=F*1.04; P.body.ry*=F*.8;
  ['dx','dy','rx','ry'].forEach(q=>{ P.head[q]*=F; P.snout[q]*=F; }); ['w','fx','bx'].forEach(q=>P.leg[q]*=F);
  Object.keys(P.ear).forEach(q=>P.ear[q]*=F); ['dx','dy','r'].forEach(q=>P.eye[q]*=F); P.tail.r*=F; P.tail.len*=F; })); })();
/* Breed markings seen from the side. */
const SIDE_PAT={
  dalmatian:(x,y,t)=>((t==='fur'||t==='tail')&&spotAt(x,y,11,4.2,.8,.9))?'#2F2B30':null,
  husky:(x,y,t,G)=>{ if(t!=='fur') return null; if(inE(x,y,G.head)&&y>G.head.y+.6) return '#F4F6F8'; if(inE(x,y,G.body)&&y>G.body.cy+G.body.ry*.18) return '#F4F6F8'; return null; },
  beagle:(x,y,t,G)=>(t==='fur'&&inE(x,y,G.body)&&y<G.body.cy-.3&&x<G.body.cx+G.body.rx*.6)?'#3A3236':null,
  silver:(x,y,t)=>((t==='fur'||t==='ear'||t==='tail')&&curlAt(x,y))?'#D8DCE2':null,
  chihuahua:(x,y,t,G)=>{ if(t!=='fur') return null; const b=G.body; if(inE(x,y,b)&&x>b.cx+b.rx*.4&&y>b.cy) return '#D08A4E'; if(inC(x,y,G.head.x+G.head.rx*.3,G.head.y-G.head.ry*.5,1.1)) return '#D08A4E'; return null; },
  brindle:(x,y,t)=>((t==='fur'||t==='tail')&&brindleAt(x,y))?'#4A3424':null,
  calico:(x,y,t,G)=>{ if(t==='tail') return '#E8964A'; if(t==='ear') return '#3B3440'; if(t!=='fur') return null; const b=G.body;
    if(inC(x,y,b.cx-b.rx*.4,b.cy-2,4.6)) return '#E8964A'; if(inC(x,y,b.cx+b.rx*.35,b.cy-1.5,3.4)||inC(x,y,G.head.x-1,G.head.y-3,3.2)) return '#3B3440'; return null; },
  tabby:sideTabby('#B45E27'), silvertabby:sideTabby('#6E747C'), fold:sideTabby('#7A5A40'),
  tuxedo:(x,y,t,G)=>{ const b=G.body; if(t==='paw') return '#FAFAFA'; if(t==='fur'&&inE(x,y,b)&&x>b.cx+b.rx*.35&&y>b.cy-1) return '#FAFAFA'; return null; },
  siamese:(x,y,t,G)=>{ const pt='#6A4E3E'; if(t==='ear'||t==='tail'||t==='paw') return pt; if(t==='muzzle') return pt; if(t==='fur'&&inE(x,y,G.head)&&x>G.head.x+1) return '#A88A70'; return null; }
};
function sideTabby(S1){ return (x,y,t,G)=>{ if(t==='tail') return Math.floor(x*.85)%2===0?S1:null; if(t!=='fur') return null;
  if(inE(x,y,G.body)&&y<G.body.cy+G.body.ry*.35&&Math.floor(x*.62)%2===0) return S1;
  if(inE(x,y,G.head)&&y<G.head.y-G.head.ry*.35&&Math.floor(x*1.1)%2===0) return S1; return null; }; }
const inE=(x,y,e)=>{ const rx=e.rx, ry=e.ry, cx=e.cx!=null?e.cx:e.x, cy=e.cy!=null?e.cy:e.y; return ((x-cx)/rx)**2+((y-cy)/ry)**2<1; };

/* Straight legs: each leg is a column a little wider at the top where it meets the body and slightly
   narrower toward a small flat-bottomed paw on the ground. Back legs bend back a little at the hock
   (gently for cats). The legs are painted only into the space below the body, never over it, so they
   join the body with no outline across the top. The far legs are a shade darker and sit just behind.
   SIDE_LEGS chooses these ('straight') or the earlier rounded legs ('round'). */
let SIDE_LEGS='straight';
const inPoly=(pts,x,y)=>{ let ins=false; for(let i=0,j=pts.length-1;i<pts.length;j=i++){ const [xi,yi]=pts[i],[xj,yj]=pts[j]; if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi) ins=!ins; } return ins; };
const solidTag=t=>!!t&&t[t.length-1]!=='!';
/* Paint a leg shape into the buffer: inside(x,y) says what is leg, isPaw(x,y) what is paw. Only pixels
   that are empty (or only outline) before any leg was drawn are used, and a far leg never covers a near one. */
function paintLeg(b,pre,taken,box,inside,isPaw,far){ const [x0,y0,x1,y1]=box;
  for(let Y=Math.floor((y0+b.oy)*RES);Y<Math.ceil((y1+b.oy)*RES);Y++) for(let X=Math.floor((x0+b.ox)*RES);X<Math.ceil((x1+b.ox)*RES);X++){
    if(X<0||Y<0||X>=b.w||Y>=b.h) continue; const i=Y*b.w+X; if(solidTag(pre[i])||taken[i]) continue;
    const x=(X+.5)/RES-b.ox, y=(Y+.5)/RES-b.oy; if(!inside(x,y)) continue;
    const paw=isPaw(x,y), back=!far&&!paw&&!inside(x-1/RES,y);
    b.px[i]=paw?(far?'paw_':'paw'):far?'fur~':back?'fur_':'fur'; if(!far) taken[i]=1; } }
function sideLegs(b,legs,o){ const pre=b.px.slice(), taken=new Uint8Array(b.px.length), lw=o.lw, cat=o.cat;
  const wT=lw*(cat?2:2.15), wH=lw*(cat?1.65:1.8), wB=lw*(cat?1.45:1.6), ph=lw*1.05, toe=.5;
  legs.forEach(([hx,off,isBack,far])=>{
    /* the same stride as before: the foot swings forward and back, and lifts as it comes forward */
    const th=Math.sin(o.ph+off)*o.swing, len=SIDE_GY-o.legTop-lw*.8, fx=hx+Math.sin(th)*len*.75, lift=o.swing?Math.max(0,Math.cos(o.ph+off))*1.1:0;
    const ground=SIDE_GY+.25-lift, pawTop=ground-ph, top=o.legTop;
    let shapes;
    if(isBack){ const t=.58, hk=[lerp(hx,fx,t)-lw*(cat?.35:.7),lerp(top,pawTop,t)], wt=wT*1.1;
      shapes=[[[hx-wt/2,top],[hx+wt/2,top],[hk[0]+wH/2,hk[1]],[hk[0]-wH/2,hk[1]]],[[hk[0]-wH/2,hk[1]],[hk[0]+wH/2,hk[1]],[fx+wB/2,pawTop+.3],[fx-wB/2,pawTop+.3]]]; }
    else shapes=[[[hx-wT/2,top],[hx+wT/2,top],[fx+wB/2,pawTop+.3],[fx-wB/2,pawTop+.3]]];
    const px0=fx-wB/2-.5, px1=fx+wB/2+.5+toe;
    const inPaw=(x,y)=>{ if(y<pawTop||y>ground||x<px0||x>px1) return false; const top2=y<pawTop+.5; return !(top2&&(x<px0+.5||x>px1-.5)); };
    const cuff=o.cuffs?(x,y)=>((x-fx-.3)/(lw*1.9))**2+((y-(SIDE_GY-lw*.8-lift-.9))/(lw*1.5))**2<1:()=>false;
    const inside=(x,y)=>inPaw(x,y)||cuff(x,y)||shapes.some(s=>inPoly(s,x,y));
    const xs=shapes.flat().map(p=>p[0]).concat([px0,px1]), box=[Math.min(...xs)-lw*2,top-1,Math.max(...xs)+lw*2,ground+.5];
    paintLeg(b,pre,taken,box,inside,inPaw,far); });
  return b; }
/* Lying down: the front legs lie forward along the ground, each a straight column with a flat paw at the
   front, in the same place as the paws were before. */
function sideLegsLying(b,BD,lw){ const pre=b.px.slice(), taken=new Uint8Array(b.px.length);
  [[1,false],[0,true]].forEach(([i,far])=>{ const x0=BD.cx+BD.rx*.4, x1=BD.cx+BD.rx+2.4+i*1.2+lw*2.1, ground=SIDE_GY+.25-i*.5, h=lw*1.5, pawL=lw*2.2;
    const inside=(x,y)=>{ if(x<x0||x>x1||y>ground) return false; const t=(x-x0)/(x1-x0), hh=x>x1-pawL?h+.5:h*(1.15-.15*t); if(y<ground-hh) return false;
      if(x>x1-.5&&y<ground-hh+.5) return false; return true; };
    paintLeg(b,pre,taken,[x0-.5,ground-h-2,x1+.5,ground+.5],inside,(x)=>x>x1-pawL,far); });
  return b; }
function capsule(T,x0,y0,x1,y1,w,t,sh){ const n=Math.max(2,Math.ceil(Math.hypot(x1-x0,y1-y0)*2)); for(let i=0;i<=n;i++){ const k=i/n; E(T,lerp(x0,x1,k),lerp(y0,y1,k),w,w,t,sh); } }
/* Where the body, head and legs sit for this pose, with the breed's shape applied. */
function sideGeo(P,o,S){
  const sh=S?shapeOf(S):{}, lie=o.body==='lie'||o.body==='curl', run=o.body==='run', bob=run?[0,-1,0,-.6][o.frame||0]:o.body==='walk'?[0,-.4,0,-.4][o.frame||0]:0;
  const b=Object.assign({},P.body), hs=sh.head||1, bs=sh.body||1;
  b.rx*=bs; b.ry*=bs; let hdx=P.head.dx;
  if(sh.long){ const legLen=SIDE_GY-(b.cy+b.ry*.35); b.rx*=1.32; b.cy+=legLen*.45; hdx=P.head.dx*1.25; }
  b.cy+=bob+(o.crouch||0)*3+(o.bow||0)*2; if(lie){ b.cy=SIDE_GY-b.ry-1; b.ry*=.92; }
  const head={x:b.cx+hdx,y:b.cy+P.head.dy*(sh.long?.85:1)+(o.headDy||0)*.8,rx:P.head.rx*hs,ry:P.head.ry*hs};
  if(lie){ head.x=b.cx+b.rx*.72+1.2; head.y=SIDE_GY-head.ry-1.9+(o.headDy||0)*.8; }
  if(o.bow){ head.x+=o.bow*2; head.y=lerp(head.y,SIDE_GY-head.ry-2,o.bow); }
  const sn={dx:P.snout.dx*(sh.flat?.7:1)*(sh.long?1.1:1)*hs,dy:P.snout.dy*hs,rx:P.snout.rx*(sh.flat?.55:sh.long?1.3:1)*(sh.muz?sh.muz[0]:1),ry:P.snout.ry*(sh.flat?.8:1)*(sh.muz?sh.muz[1]:1)};
  // A swimming dog carries its chin above its back instead of dipping its muzzle.
  // Use the actual breed's head and snout, including puppies and short-legged dogs.
  if(o.body==='swim') head.y=Math.min(head.y,b.cy-b.ry*.3-2.5-Math.max(head.ry,sn.dy+sn.ry));
  return {body:b,head,lie,run,sn,eyeR:P.eye.r*(sh.eye||1)};
}
function swimLegPose(BD,L,sh,frame,far,back){
  const hx=BD.cx+(back?L.bx:L.fx)*(sh.long?1.3:1)+(far?L.w*1.4:0), hy=BD.cy+BD.ry*.35;
  const length=Math.max(3,SIDE_GY-L.w*.65-hy), upper=length*.48, lower=length*.52;
  const t=frame*TAU/SWIM_FRAMES+(far?Math.PI:0)+(back?Math.PI:0);
  const a=Math.sin(t)*.65, bend=Math.sin(t-.65)*1.15;
  const ex=hx+Math.sin(a)*upper, ey=hy+Math.cos(a)*upper;
  return {hx,hy,ex,ey,fx:ex+Math.sin(bend)*lower,fy:ey+Math.cos(bend)*lower};
}
/* Bent legs for a play bow, take-off/landing, airborne tuck, swimming, and a curled roll. */
function actionLegs(b,o,P,S,Gs){ const BD=Gs.body, L=P.leg, sh=shapeOf(S), w=L.w, ground=SIDE_GY;
  [true,false].forEach(far=>[true,false].forEach(back=>{
    const hx=BD.cx+(back?L.bx:L.fx)*(sh.long?1.3:1)+(far?w*1.4:0), hy=BD.cy+BD.ry*.35+(o.bow?(back?-2:2)*o.bow:0);
    let fx=hx, fy=ground-w*.65, ex=hx+(back?-w:w), ey=(hy+fy)/2;
    if(o.bow&&!back){ fx+=8*o.bow; ex+=3*o.bow; ey+=3*o.bow; }
    if(o.crouch){ ex+=(back?-1:1)*o.crouch*3; }
    if(o.tuck){ fx+=(back?3:-3)*o.tuck; fy-=Math.max(3,ground-hy-3)*o.tuck; ex+=(back?-2:2)*o.tuck; ey=(hy+fy)/2+2*o.tuck; }
    if(o.body==='swim') ({fx,fy,ex,ey}=swimLegPose(BD,L,sh,o.frame||0,far,back));
    if(o.body==='dig'&&!back){ const t=(o.frame||0)*Math.PI/2+(far?Math.PI:0); fx+=3+Math.sin(t)*5; fy-=Math.max(0,Math.cos(t))*4; ex=hx+3; ey=(hy+fy)/2+1; }
    if(o.body==='curl'){ const angle=(o.rollPhase||0)/16*TAU, lift=(1-Math.cos(angle))/2;
      // Separate rolling frames: knees tuck against the torso, then the paws point up.
      // The far pair moves behind the near pair; no sprite is reflected or inverted.
      fx=hx+(back?3:-3)+(far?-1:1)*Math.sin(angle)*2;
      fy=lerp(hy+2,BD.cy-BD.ry-3,lift)+(far?-1:1)*Math.sin(angle)*1.5;
      ex=hx+(back?-2:2); ey=lerp(hy+3,BD.cy-BD.ry*.5,lift); }
    part(b,T=>{ capsule(T,hx,hy,ex,ey,w*.8,far?'fur_':'fur',SH); capsule(T,ex,ey,fx,fy,w*.65,far?'fur_':'fur',SH);
      if(sh.cuffs) E(T,fx,fy-.6,w*1.6,w*1.3,'fur',SH);
      E(T,fx+.5,fy,w*1.25,w*.8,far?'paw_':'paw',SHL); });
  }));
}
function buildSide(b,o,P,S,fit,cat){
  const Gs=sideGeo(P,o,S), BD=Gs.body, H=Gs.head, L=P.leg, ed=o.ear?1:0, lie=Gs.lie, sh=shapeOf(S), ears=S.ears||(cat?'normal':'flop'), lw=L.w*(sh.body&&sh.body<1?.85:1);
  const swing=o.body==='run'?.8:o.body==='walk'?.48:0, ph=(o.frame||0)*Math.PI/2, legTop=BD.cy+BD.ry*.35;
  const leg=(hx,off,far)=>{ const th=Math.sin(ph+off)*swing, len=SIDE_GY-legTop-lw*.8, fx=hx+Math.sin(th)*len*.75, lift=swing?Math.max(0,Math.cos(ph+off))*1.1:0, fy=SIDE_GY-lw*.8-lift;
    part(b,T=>{ capsule(T,hx,legTop,fx,fy,lw,far?'fur~':'fur',far?null:SH); if(sh.cuffs) E(T,fx+.3,fy-.9,lw*1.9,lw*1.5,far?'fur~':'fur',far?null:SH); E(T,fx+.5,fy+.2,lw*1.25,lw*.85,far?'paw_':'paw',SHL); }); };
  /* Tail first, behind everything. */
  const tailWag=[0,.35,-.25][o.tail||0];
  part(b,T=>{ const x0=BD.cx-BD.rx+.8, y0=BD.cy-BD.ry*.35;
    if(cat){ const bob=sh.tail==='bob', n=bob?3:16, len=P.tail.len, tr=P.tail.r*(sh.tail==='bushy'?1.5:sh.tail==='plume'?1.3:bob?1.8:1);
      for(let i=0;i<=n;i++){ const s=i/16, r=tr*(bob?1:(1-.2*s)*(sh.tail==='plume'?1+.4*s:1));
        const x=lie?x0-s*len*.55:x0-s*len*.3-Math.sin(s*Math.PI)*1.4+tailWag*s*s*3, y=lie?45.6-r-Math.sin(s*Math.PI)*1.6:y0-s*len*.82+s*s*len*.16; E(T,x,y,r,r,'tail',SH); } }
    else { const tr=P.tail.r*(sh.tail==='otter'?1.3:1), n=sh.tail==='pom'?3:4, a=(o.body==='swim'?-3:lie?-2.7:-2.35)+tailWag;
      for(let i=0;i<n;i++){ const d=i*P.tail.len*.4, r=tr*(1-i*.12); E(T,x0+Math.cos(a)*d,y0+Math.sin(a)*d,r*1.2,r,'tail',SH); }
      if(sh.tail==='pom'){ const d=n*P.tail.len*.4; E(T,x0+Math.cos(a)*d,y0+Math.sin(a)*d,tr*1.6,tr*1.5,'tail',SH); } } });
  if(fit&&fit.body==='cape') part(b,T=>{ Tr(T,H.x-3,H.y+H.ry*.6,BD.cx+BD.rx*.3,BD.cy-BD.ry,BD.cx-BD.rx-2.4,BD.cy+BD.ry*.7,'#D9403E',SH); });
  if(fit&&fit.body==='bee') part(b,T=>{ E(T,BD.cx-1,BD.cy-BD.ry-2,3.4,2.2,'#E4F2FA',SHL); E(T,BD.cx+3,BD.cy-BD.ry-1.6,2.8,1.8,'#E4F2FA',SHL); });
  /* Far legs, body, near legs. (The straight legs are all drawn after the body; see sideLegs.) */
  const newLegs=SIDE_LEGS==='straight', action=o.bow||o.crouch||o.tuck||o.body==='swim'||o.body==='curl'||o.body==='dig';
  if(!lie&&!newLegs&&!action){ leg(BD.cx+L.fx*(sh.long?1.3:1)+1.2,Math.PI,true); leg(BD.cx+L.bx*(sh.long?1.3:1)+1.2,0,true); }
  /* An average body, not a round one: a deeper chest at the front, a slimmer waist tucked up under the
     middle, and narrower hips at the back. */
  part(b,T=>{ E(T,BD.cx+BD.rx*.36,BD.cy+BD.ry*.05+(o.bow||0)*2,BD.rx*.64,BD.ry*1.05,'fur',SH); E(T,BD.cx-BD.rx*.4,BD.cy-BD.ry*.08-(o.bow||0)*2,BD.rx*.6,BD.ry*.9,'fur',SH); E(T,BD.cx,BD.cy-BD.ry*.12,BD.rx*.85,BD.ry*.78,'fur',SH);
    if(!lie) E(T,BD.cx+BD.rx*.42,BD.cy+BD.ry*.5,BD.rx*.42,BD.ry*.52,'light',SHL); else E(T,BD.cx+BD.rx*.12,BD.cy+BD.ry*.42,BD.rx*.72,BD.ry*.42,'light',SHL); });
  if(fit&&fit.body&&CLOTHES[fit.body]&&CLOTHES[fit.body].fill){ const C=CLOTHES[fit.body], chest=BD.cx+BD.rx*.55, Gc={neckY:BD.cy-BD.ry,bodyCy:BD.cy,BD:{rx:BD.ry*1.1,ry:BD.ry,cy:BD.cy},cx:22,top:H.y-H.ry};
    part(b,T=>E(T,BD.cx,BD.cy,BD.rx+.3,BD.ry+.3,(x,y)=>C.fill(22+(x-chest)*.8,y,Gc),SH,BD.cy-BD.ry-1,BD.cy+BD.ry*.55)); }
  if(fit&&fit.body==='tutu') part(b,T=>E(T,BD.cx,BD.cy+BD.ry*.5,BD.rx+1.6,2,(x)=>alt2(x*.9,'#F7B8CC','#F2A0BA'),SH));
  if(fit&&fit.body==='dino') part(b,T=>{ for(let i=0;i<5;i++){ const x=BD.cx-BD.rx*.7+i*BD.rx*.35, y=BD.cy-BD.ry*Math.sqrt(Math.max(0,1-((x-BD.cx)/BD.rx)**2)); Tr(T,x-1.2,y+.6,x+1.2,y+.6,x,y-1.8,'#3E8A5A',SH); } });
  if(o.body==='curl'&&o.rollPhase&&!fit?.body){ const lift=(1-Math.cos(o.rollPhase/16*TAU))/2;
    E(b,BD.cx,BD.cy+BD.ry*(.35-.55*lift),BD.rx*.75,BD.ry*(.22+.45*lift),'light',SHL); }
  if(action) actionLegs(b,o,P,S,Gs);
  else if(lie){ part(b,T=>{ E(T,BD.cx-BD.rx*.45,SIDE_GY-lw*1.2,BD.rx*.42,lw*1.4,'fur',SH); });
    if(newLegs) sideLegsLying(b,BD,lw); else part(b,T=>{ [0,1].forEach(i=>E(T,BD.cx+BD.rx+2.4+i*1.2,SIDE_GY-lw*.8-i*.5,lw*2.1,lw*.95,i?'paw':'paw_',SHL)); }); }
  else if(newLegs){ const fx=BD.cx+L.fx*(sh.long?1.3:1), bx=BD.cx+L.bx*(sh.long?1.3:1);
    sideLegs(b,[[fx,0,false,false],[bx,Math.PI,true,false],[fx+lw*1.4,Math.PI,false,true],[bx+lw*1.4,0,true,true]],{legTop,lw,swing,ph,cat,cuffs:sh.cuffs}); }
  else { leg(BD.cx+L.fx*(sh.long?1.3:1),0,false); leg(BD.cx+L.bx*(sh.long?1.3:1),Math.PI,false); }
  /* Chest fluff, manes and ruffs */
  if(sh.chest) part(b,T=>{ for(let i=0;i<4;i++) Tr(T,H.x-H.rx*.6+i*1.4,H.y+H.ry*.6,H.x-H.rx*.6+i*1.4+2.4,H.y+H.ry*.6,H.x-H.rx*.6+i*1.4+1.2,H.y+H.ry+3,'light',SHS); });
  if(sh.ruff) part(b,T=>{ for(let i=0;i<5;i++) E(T,H.x-H.rx*.7+i*1.5,H.y+H.ry*.75+Math.abs(i-2)*-.3,2.1,2.5,i>1?'light':'fur',SH); });
  /* Neck, head, face. */
  if(o.body==='swim') part(b,T=>capsule(T,BD.cx+BD.rx*.6,BD.cy-BD.ry*.2,H.x-H.rx*.4,H.y+H.ry*.55,H.rx*.46,'fur',SH));
  if(!cat&&!o.bare&&!(fit&&fit.neck)) part(b,T=>E(T,H.x-H.rx*.5,H.y+H.ry*.62,1.3,2.6,'collar',SHS));
  if(fit&&fit.neck&&NECKS[fit.neck]) NECKS[fit.neck](b,{cx:H.x-H.rx*.45,neckY:H.y+H.ry*.5,k:.75,BD:{rx:3.6,ry:4},top:H.y-H.ry});
  const eh=(P.ear.h||0)*(ears==='small'?.6:1);
  if(cat&&ears!=='fold') part(b,T=>{ Tr(T,H.x-H.rx*.9,H.y-H.ry*.3,H.x-H.rx*.1,H.y-H.ry*.85,H.x-H.rx*.6-ed*.6,H.y-H.ry-eh+ed*.6,'ear',SH); });
  else if(!cat&&ears==='perk') part(b,T=>Tr(T,H.x-H.rx*.8,H.y-H.ry*.35,H.x+H.rx*.05,H.y-H.ry*.85,H.x-H.rx*.45-ed*.5,H.y-H.ry-P.ear.perk+ed*.5,'ear',SH));
  else if(!cat&&ears==='bat') part(b,T=>Tr(T,H.x-H.rx*.95,H.y-H.ry*.15,H.x+H.rx*.2,H.y-H.ry*.85,H.x-H.rx*.75-ed*.5,H.y-H.ry-P.ear.perk*1.3+ed*.5,'ear',SH));
  else if(!cat&&ears==='fold') part(b,T=>{ Tr(T,H.x-H.rx*.75,H.y-H.ry*.4,H.x+H.rx*.1,H.y-H.ry*.85,H.x-H.rx*.3,H.y-H.ry-P.ear.perk*.45,'ear',SH); Tr(T,H.x-H.rx*.7,H.y-H.ry*.7,H.x+H.rx*.15,H.y-H.ry*.95,H.x+H.rx*.1,H.y-H.ry*.2+ed*.4,'ear_'); });
  part(b,T=>E(T,H.x,H.y,H.rx,H.ry,'fur',SH));
  if(sh.topknot) part(b,T=>[[-.3,-.75],[.15,-.85],[-.7,-.45],[.5,-.6]].forEach(([dx,dy])=>E(T,H.x+dx*H.rx,H.y+dy*H.ry,H.rx*.4,H.ry*.33,'fur',SH)));
  if(cat&&ears!=='fold'){ Tr(b,H.x-H.rx*.2,H.y-H.ry*.5,H.x+H.rx*.45,H.y-H.ry*.82,H.x+H.rx*.05+ed*.5,H.y-H.ry-eh*.9+ed*.5,'ear'); part(b,T=>Tr(T,H.x+H.rx*.05,H.y-H.ry*.45,H.x+H.rx*.7,H.y-H.ry*.75,H.x+H.rx*.3+ed*.5,H.y-H.ry-eh+ed*.5,'ear',SH));
    Tr(b,H.x+H.rx*.2,H.y-H.ry*.6,H.x+H.rx*.55,H.y-H.ry*.78,H.x+H.rx*.33+ed*.5,H.y-H.ry-eh*.62+ed*.5,'earIn');
    if(ears==='tuft'){ const tx=H.x+H.rx*.3+ed*.5, ty=H.y-H.ry-eh+ed*.5; Ln(b,tx,ty+.4,tx+.5,ty-2.6,'ear!',2); } }
  if(cat&&ears==='fold') part(b,T=>{ E(T,H.x-H.rx*.35,H.y-H.ry*.82,2.4,1.7,'ear',SH); E(T,H.x+H.rx*.3,H.y-H.ry*.88,2.4,1.7,'ear',SH); });
  const sn=Gs.sn, sx=H.x+sn.dx, sy=H.y+sn.dy;
  part(b,T=>E(T,sx,sy,sn.rx,sn.ry,P.senior?'grey':'muzzle',SHL));
  if(sh.beard) part(b,T=>E(T,sx-.4,sy+sn.ry*.85,sn.rx*.95,sn.ry*.95,'beard',SHL));
  if(!cat&&(ears==='flop'||ears==='long')){ const long=ears==='long'; part(b,T=>E(T,H.x+P.ear.x,H.y+P.ear.y+ed+(long?1.2:0),P.ear.rx,P.ear.ry*(long?1.3:1)*(sh.earLen||1),'ear',SH)); }
  if(!cat&&ears==='puff') part(b,T=>{ for(let k=0;k<4;k++) E(T,H.x+P.ear.x+(k%2)*.7,H.y+P.ear.y-1.6+k*2+ed,P.ear.rx*1.05,1.9,'ear',SH); });
  /* Eye */
  const ex=H.x+P.eye.dx*(sh.head||1), ey=H.y+P.eye.dy, r=Gs.eyeR, st=o.eyes;
  if(st==='closed') Arc(b,ex,ey+.1,r*1.1,r*.6,'line',false,2);
  else if(st==='happy') Arc(b,ex,ey+r*.5,r,r*.8,'line',true,2);
  else { const iris=S.pal.iris||(cat?'#7FBF5A':'#6A4424'); E(b,ex,ey,r*.95,r*1.12,(px,py,nx,ny)=>(nx*nx+ny*ny)<.4?'#140E0C':(ny<-.15?iris+'_':iris)); E(b,ex-r*.3,ey-r*.35,Math.max(.5,r*.3),Math.max(.5,r*.28),'*#FFFFFF');
    const lid=st==='sleepy'?.52:(P.eye.lid||0); if(lid){ const cut=ey-r*1.12+r*2.24*lid; E(b,ex,ey,r*1.1,r*1.25,(px,py)=>py<cut?'fur_':null); Ln(b,ex-r,cut,ex+r,cut,'line',2); } }
  if(P.senior) E(b,ex,ey-r*1.6,1.5,.6,'grey');
  if(sh.beard) E(b,ex+.3,ey-r*1.45,1.9,.8,'beard',SHS);
  E(b,ex-.6,ey+r*1.4+.4,1.3,.6,'blush');
  /* Nose and mouth */
  const tipX=sx+sn.rx-.4, nyy=sy-sn.ry*.35;
  if(cat){ Tr(b,tipX-1.3,nyy-.7,tipX+.3,nyy-.7,tipX-.2,nyy+.6,'noseCat'); [0,1,2].forEach(k=>Ln(b,tipX-1.2,sy+.2+k*.6,tipX+3.4,sy-.6+k*1.1,'*whisker',1)); }
  else { E(b,tipX-.2,nyy,1.35,1,'nose'); D(b,tipX-.6,nyy-.4,'*#8A7A72'); }
  const my=sy+sn.ry*.55;
  if(o.mouth==='open'||o.mouth==='tongue'){ E(b,tipX-1.8,my+.3,1.6,1,'mouthIn'); if(o.mouth==='tongue') E(b,tipX-1.6,my+1.5,.9,1.3,'tongue',SHS); }
  if(!sh.beard) Ln(b,tipX-2.8,my-.2,tipX-.4,my-.2,'line',2);
  if(o.mud) [[BD.cx-3,BD.cy+1,2.2,1.4],[BD.cx+4,BD.cy-1.5,1.8,1.3],[BD.cx+L.fx,43,1.4,1],[BD.cx+L.bx,43,1.4,1]].forEach(([x,y,a,c])=>E(b,x,y,a,c,'#6B4A2B'));
  /* Glasses: one lens from the side */
  if(fit&&fit.face){ const fc={round:['#E0B84A',null],sun:['#1C1C28','#1C1C28'],heart:['#F07A8E','#F07A8E'],star:['#F4C542','#F4C542'],goggles:['#3E6FA4','#9FD8F0'],cateye:['#8A5AB0',null],monocle:['#E0B84A',null]}[fit.face]||['#E0B84A',null];
    part(b,T=>E(T,ex+.2,ey,r*1.7,r*1.6,(px,py,nx,ny)=>(nx*nx+ny*ny)<.5?fc[1]:fc[0],SHS)); Ln(b,ex-r*1.6,ey-.3,H.x-H.rx*.7,ey-.6,fc[0],2); }
  if(fit&&fit.hat&&HATS[fit.hat]) HATS[fit.hat](b,{cx:H.x,hy:H.y,H:{rx:H.rx,ry:H.ry},top:H.y-H.ry-(sh.topknot?1.5:0),k:H.rx/8.6,neckY:H.y+H.ry*.6,BD:{rx:4,ry:4}});
  return Gs;
}
const sideCache=new Map();
function getPetSide(style,sg,o,fit){
  const S=STYLES[style]||STYLES.cream; if(!STAGES.includes(sg)) sg='baby';
  const key=[SIDE_LEGS,style,sg,o.body,o.frame||0,o.eyes,o.mouth,o.tail||0,o.ear||0,o.headDy||0,o.bow||0,o.crouch||0,o.tuck||0,o.rollPhase||0,o.dull?1:0,o.mud?1:0,o.bare?1:0,fitKey(fit)].join('|'); let c=sideCache.get(key); if(c) return c;
  const P=SIDE[S.kind][sg], b=B(SIDE_W,SIDE_H,SIDE_OX,SIDE_OY), Gs=buildSide(b,o,P,S,fit,S.kind==='cat');
  c=finish(b,S.pal,{pattern:SIDE_PAT[style],geo:Gs,dull:o.dull});
  if(sideCache.size>900) sideCache.clear(); sideCache.set(key,c); return c;
}
/* One call for every pose. (x, y) is the old 44 x 44 sprite origin, so scenes keep their numbers:
   the ground point is (x+22, y+42.5). face -1 flips the pet to walk left. */
function drawPetPose(g,style,sg,p,fit,x,y,hl){
  if(p.climb){ const q={...p,climb:0}, gx=x+22, gy=y+42.5; g.save(); g.translate(gx,gy); g.rotate(-(p.face||1)*p.climb*.85); g.translate(-gx,-gy); drawPetPose(g,style,sg,q,fit,x,y,hl); g.restore(); return; }
  if(p.turn!=null){ const a=p.turn, side=Math.abs(Math.sin(a))>.62, rear=Math.cos(a)<0;
    const q=Object.assign({},p,{turn:null,body:side?'walk':null,upright:true,rear:!side&&rear,face:Math.sin(a)>0?1:-1});
    g.save(); g.translate(x+22,0); g.scale(side?.72+.28*Math.abs(Math.sin(a)):.72+.28*Math.abs(Math.cos(a)),1); g.translate(-x-22,0);
    drawPetPose(g,style,sg,q,fit,x,y,hl); g.restore(); return; }
  if(p.roll!=null){ const q=Object.assign({},p,{roll:null,body:'curl',rollPhase:Math.round(p.roll/TAU*16)%16});
    drawPetPose(g,style,sg,q,fit,x,y,hl); return; }
  const body=p.body&&p.body!=='sit'?p.body:null;
  if(!body){ const s=getPet(style,sg,p,fit), sx=x-PET_OX, sy=y-PET_OY; if(hl) blitHL(g,s,sx,sy); blit(g,s,sx,sy); return; }
  const s=getPetSide(style,sg,p,fit), gx=x+22, gy=y+42.5, sx=gx-SIDE_GX-SIDE_OX, sy=gy-SIDE_GY-SIDE_OY;
  if((p.face||1)<0){ g.save(); g.translate(gx,0); g.scale(-1,1); g.translate(-gx,0); if(hl) blitHL(g,s,sx,sy); blit(g,s,sx,sy); g.restore(); }
  else { if(hl) blitHL(g,s,sx,sy); blit(g,s,sx,sy); }
}
