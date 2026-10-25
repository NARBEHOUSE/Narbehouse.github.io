'use strict';
/* ================= Pets =================
   Four life stages per kind, eight breeds per kind. A pet is drawn in its own 44 x 44 logical
   space (paws on row ~42, centered on x=22) inside a 48 x 60 sprite, leaving room for hats. */
const STAGES=['baby','teen','adult','senior'];
const STAGE_WORD={dog:['puppy','teen pup','dog','senior dog'],cat:['kitten','teen cat','cat','senior cat']};
const STAGE_LABEL={dog:['Puppy','Teen pup','Grown-up','Senior'],cat:['Kitten','Teen cat','Grown-up','Senior']};
const PET_OX=2, PET_OY=16, PET_W=48, PET_H=64;

const PARAMS={
  dog:{
    baby:{head:{cy:22,rx:10.6,ry:9.2},body:{cy:33.6,rx:7.6,ry:5.8},haunch:{dx:5.6,cy:37.2,rx:3.4,ry:3.2},paw:{dx:3.9,cy:39.6,rx:2.6,ry:1.9},muz:{dy:4,rx:4.3,ry:3},nose:{dy:2.3,w:3.8},eye:{dx:5.6,dy:-1.6,w:3.8,h:4.4},ear:{w:3.2,len:5.8,dy:1.8,perkH:6},tail:{r:2.1,len:3}},
    teen:{head:{cy:18.8,rx:9.9,ry:8.4},body:{cy:31.8,rx:8.4,ry:8.2},haunch:{dx:6,cy:36.4,rx:3.6,ry:4.1},paw:{dx:4.3,cy:40,rx:2.9,ry:2},muz:{dy:4.2,rx:5.3,ry:3.7},nose:{dy:2.5,w:4},eye:{dx:5,dy:-1.4,w:3.5,h:4},ear:{w:3.2,len:6.2,dy:1.6,perkH:7.4},tail:{r:2.4,len:3.6}},
    adult:{head:{cy:15.5,rx:9.6,ry:8.1},body:{cy:30.2,rx:9,ry:10},haunch:{dx:6.5,cy:36.4,rx:3.9,ry:4.5},paw:{dx:4.5,cy:40.2,rx:3.2,ry:2.1},muz:{dy:4.4,rx:6,ry:4.1},nose:{dy:2.7,w:4.3},eye:{dx:4.7,dy:-1.2,w:3.3,h:3.6},ear:{w:3.4,len:6.8,dy:2,perkH:7.8},tail:{r:2.8,len:4.2}},
    senior:{head:{cy:16.6,rx:9.6,ry:8.1},body:{cy:30.8,rx:9.4,ry:9.7},haunch:{dx:6.8,cy:36.4,rx:4.1,ry:4.4},paw:{dx:4.6,cy:40.2,rx:3.3,ry:2.1},muz:{dy:4.4,rx:6.2,ry:4.2},nose:{dy:2.7,w:4.3},eye:{dx:4.7,dy:-1,w:3.3,h:3.3,lid:.3},ear:{w:3.5,len:7.4,dy:2.6,perkH:7.2},tail:{r:2.7,len:4},senior:true}
  },
  cat:{
    baby:{head:{cy:23,rx:10.3,ry:8.3},ear:{h:6.6},body:{cy:34,rx:7,ry:5.6},haunch:{dx:5.2,cy:37.2,rx:3.1,ry:3},paw:{dx:3.4,cy:39.6,rx:2.3,ry:1.8},muz:{dy:3,rx:2,ry:1.5},nose:{dy:1.6},eye:{dx:5.5,dy:-1.4,w:3.9,h:4.4},tail:{len:9,r:1.7},whisk:4},
    teen:{head:{cy:19,rx:9.9,ry:7.9},ear:{h:7.2},body:{cy:32,rx:7.6,ry:8},haunch:{dx:5.4,cy:36.6,rx:3.3,ry:3.9},paw:{dx:3.7,cy:40,rx:2.5,ry:1.9},muz:{dy:3,rx:2.1,ry:1.5},nose:{dy:1.6},eye:{dx:5,dy:-1.2,w:3.4,h:3.8},tail:{len:11,r:1.8},whisk:5},
    adult:{head:{cy:15,rx:9.8,ry:7.8},ear:{h:7.4},body:{cy:30.8,rx:8,ry:9.8},haunch:{dx:5.8,cy:36.6,rx:3.5,ry:4.2},paw:{dx:3.9,cy:40.2,rx:2.7,ry:1.9},muz:{dy:3,rx:2.2,ry:1.6},nose:{dy:1.6},eye:{dx:4.8,dy:-1,w:3.3,h:3.3,almond:true},tail:{len:13,r:1.9},whisk:6},
    senior:{head:{cy:16,rx:9.8,ry:7.8},ear:{h:7},body:{cy:31.2,rx:8.4,ry:9.5},haunch:{dx:6.1,cy:36.6,rx:3.7,ry:4.1},paw:{dx:4,cy:40.2,rx:2.8,ry:1.9},muz:{dy:3,rx:2.3,ry:1.6},nose:{dy:1.6},eye:{dx:4.8,dy:-.9,w:3.3,h:3.2,almond:true,lid:.24},tail:{len:12,r:1.9},whisk:6,senior:true}
  }
};
/* Pets sit facing you. (TURN_K and FAR_EYE can turn the face a little to one side; both are off.) */
const TURN_K=0, FAR_EYE=1;
/* Anchor points (pet coordinates) that animations and props use. */
const GEO={};
Object.keys(PARAMS).forEach(kd=>STAGES.forEach(sg=>{ const P=PARAMS[kd][sg];
  GEO[kd+':'+sg]={top:P.head.cy-P.head.ry,mouth:P.head.cy+P.muz.dy,collar:P.head.cy+P.head.ry-.6,chest:P.body.cy,bodyRx:P.body.rx,bodyRy:P.body.ry,headCy:P.head.cy,headRx:P.head.rx,headRy:P.head.ry,eyeY:P.head.cy+P.eye.dy,eyeDx:P.eye.dx,pawY:P.paw.cy,pawDx:P.paw.dx,faceDx:-P.head.rx*TURN_K}; }));

/* ---- Breeds ---- */
const spotAt=(x,y,seed,cell,rmin,rvar)=>{ const cx=Math.floor(x/cell), cy=Math.floor(y/cell); if(hash2(cx,cy,seed)<.45) return false;
  const ox=(cx+.25+hash2(cx,cy,seed+1)*.5)*cell, oy=(cy+.25+hash2(cx,cy,seed+2)*.5)*cell, r=rmin+hash2(cx,cy,seed+3)*rvar; return inC(x,y,ox,oy,r); };
const inHead=(x,y,G,pad)=>((x-22)/(G.headRx+(pad||0)))**2+((y-G.hy)/(G.headRy+(pad||0)))**2<1;
function tabbyPat(S1){ return (x,y,t,G)=>{
  if(t==='tail') return Math.floor(y*.85)%2===0?S1:null; if(t!=='fur') return null;
  if(inHead(x,y,G)){ const dx=Math.abs(x-22);
    if(y<G.hy-G.headRy*.3&&y>G.hy-G.headRy){ if(dx<.55) return S1; if(Math.abs(dx-2.7)<.5&&y>G.hy-G.headRy*.8) return S1; }
    if(y>G.hy-2&&dx>G.headRx*.72&&Math.floor(y*1.1)%2===0) return S1; return null; }
  if(y>G.neckY+1&&Math.abs(x-22)>G.bodyRx*.3&&Math.floor((y+(x<22?0:.7))*.75)%2===0) return S1; return null; }; }
/* Each breed has colors (pal), optional markings (pattern) and a shape: ear type, head, eye, muzzle
   and body size, and features such as a beard, a topknot, a mane or a bobbed tail. The shape is used
   at every life stage, so a Chihuahua puppy grows into a Chihuahua. */
const curlAt=(x,y)=>hash2(Math.floor(x*1.5),Math.floor(y*1.5),5)<.3;
const brindleAt=(x,y)=>Math.sin(x*1.7+Math.sin(y*.8)*2.2)>.5;
const STYLES={
  cream:{kind:'dog',label:'Labrador',ears:'flop',shape:{tail:'otter',earLen:.85},sw:'#EDD29C',pal:{fur:'#EDD29C',light:'#FAEBC8',ear:'#D9B67A',line:'#6A4E33',iris:'#8A5A30'}},
  chocolate:{kind:'dog',label:'Dachshund',ears:'long',shape:{muz:[1.05,1.25],long:true},sw:'#7A4A2E',pal:{fur:'#7A4A2E',light:'#B07A52',ear:'#5A331C',line:'#2A170C',iris:'#5A3016',blush:'#C77A6A'}},
  black:{kind:'dog',label:'Schnauzer',ears:'fold',shape:{beard:true,muz:[1.05,1.1]},sw:'linear-gradient(180deg,#3E3A44 60%,#A8A4AE 60%)',pal:{fur:'#3E3A44',light:'#6A6472',ear:'#2B2630',line:'#151118',iris:'#6A4A2A',blush:'#C27088',lid:'#151118',beard:'#B4B0BA'}},
  silver:{kind:'dog',label:'Poodle',ears:'puff',shape:{topknot:true,cuffs:true,curls:true,tail:'pom'},sw:'radial-gradient(circle at 35% 35%,#D6DAE0 25%,#B9BEC6 26%)',pal:{fur:'#BEC3CB',light:'#E4E7EC',ear:'#AAB0B9',line:'#3A3E46',iris:'#3A2A1E',blush:'#E8A0AA'},
    pattern:(x,y,t)=>((t==='fur'||t==='ear'||t==='tail')&&curlAt(x,y))?'#D8DCE2':null},
  chihuahua:{kind:'dog',label:'Chihuahua',ears:'bat',shape:{head:1.13,eye:1.22,body:.86,muz:[.85,.9]},sw:'linear-gradient(135deg,#2E2A30 55%,#D08A4E 55%)',pal:{fur:'#2E2A30',light:'#D08A4E',ear:'#2E2A30',line:'#120F14',iris:'#4A2E1A',lid:'#120F14',blush:'#C27088'},
    pattern:(x,y,t,G)=>(t==='fur'&&(inC(x,y,G.eyeLX,G.eyeY-2.4,1.1)||inC(x,y,G.eyeRX,G.eyeY-2.4,1.1)))?'#D08A4E':null},
  brindle:{kind:'dog',label:'Mixed Breed',ears:'perk',sw:'repeating-linear-gradient(100deg,#8A6440 0 5px,#4A3424 5px 8px)',pal:{fur:'#8A6440',light:'#F4E8D8',ear:'#6A4A2E',line:'#3A2414',iris:'#5A3016'},
    pattern:(x,y,t)=>((t==='fur'||t==='tail')&&brindleAt(x,y))?'#4A3424':null},
  golden:{kind:'dog',label:'Golden Retriever',ears:'flop',shape:{chest:true,tail:'otter'},sw:'#E2A64E',pal:{fur:'#E2A64E',light:'#F8DDA6',ear:'#C98A34',line:'#6A3E12',iris:'#7A4A1A'}},
  dalmatian:{kind:'dog',label:'Dalmatian',ears:'flop',sw:'radial-gradient(circle at 30% 35%,#2F2B30 18%,transparent 20%),radial-gradient(circle at 70% 65%,#2F2B30 16%,transparent 18%),#FAFAF6',
    pal:{fur:'#FAFAF6',light:'#FFFFFF',ear:'#2F2B30',line:'#3A3438',iris:'#5A3A22'},
    pattern:(x,y,t)=>((t==='fur'||t==='tail')&&spotAt(x,y,7,4.4,.8,.9))?'#2F2B30':null},
  husky:{kind:'dog',label:'Husky',ears:'perk',sw:'linear-gradient(180deg,#7D8794 50%,#F4F6F8 50%)',pal:{fur:'#7D8794',light:'#F4F6F8',ear:'#6A7480',line:'#2E343C',iris:'#5FB2F0'},
    pattern:(x,y,t,G)=>{ if(t!=='fur') return null; if(inHead(x,y,G,.4)){ const dx=Math.abs(x-G.fx);
      if(y>G.eyeY+.3&&dx<G.headRx*.82) return '#F4F6F8'; if(inC(x,y,G.eyeLX,G.eyeY-2.4,1.1)||inC(x,y,G.eyeRX,G.eyeY-2.4,1.1)) return '#F4F6F8'; if(dx<.9&&y<G.eyeY-.5) return '#F4F6F8'; return null; }
      if(y>G.neckY&&Math.abs(x-22)<G.bodyRx*.62) return '#F4F6F8'; return null; }},
  beagle:{kind:'dog',label:'Beagle',ears:'long',sw:'conic-gradient(#C8894A 0 45%,#3A3236 0 70%,#FFF8EE 0)',pal:{fur:'#C8894A',light:'#FFF8EE',ear:'#8E5226',line:'#4A2A12',iris:'#5A3016'},
    pattern:(x,y,t,G)=>{ if(t!=='fur') return null; if(inHead(x,y,G,.4)) return (Math.abs(x-G.fx)<1.2&&y<G.eyeY+.6)?'#FFF8EE':null;
      if(y<G.bodyCy+G.bodyRy*.05&&y>G.neckY+.4) return '#3A3236'; return null; }},
  tabby:{kind:'cat',label:'Maine Coon',ears:'tuft',shape:{ruff:true,tail:'bushy',body:1.08,head:1.04},sw:'repeating-linear-gradient(135deg,#E8964A 0 5px,#B45E27 5px 8px)',pal:{fur:'#E8964A',light:'#FBE3C4',line:'#5A2E12',iris:'#9BC04A',whisker:'#5A2E12'},pattern:tabbyPat('#B45E27')},
  siamese:{kind:'cat',label:'Siamese',sw:'radial-gradient(circle,#6A4E3E 30%,#F3E6D2 34%)',pal:{fur:'#F3E6D2',light:'#FFF8EE',line:'#5A4032',iris:'#6FB8F0',whisker:'#6A4E3E'},
    pattern:(x,y,t,G)=>{ const pt='#6A4E3E'; if(t==='ear'||t==='tail'||t==='paw') return pt; if(t!=='fur'||!inHead(x,y,G)) return null;
      const d=((x-G.fx)/5.6)**2+((y-(G.hy+2.3))/4.6)**2; return d<.42?pt:d<1?'#A88A70':null; }},
  gray:{kind:'cat',label:'Russian Blue',sw:'#8C98A8',pal:{fur:'#8C98A8',light:'#B8C2CE',line:'#2E3440',iris:'#6FCB5A',whisker:'#E6EAF0'}},
  blackcat:{kind:'cat',label:'Bombay',sw:'#3A3540',pal:{fur:'#3A3540',light:'#524A5A',line:'#120F16',iris:'#E0922A',whisker:'#D8D4E0',blush:'#B06A7A',lid:'#120F16'}},
  tuxedo:{kind:'cat',label:'Mixed Breed',sw:'linear-gradient(90deg,#2F2B35 50%,#FAFAFA 50%)',pal:{fur:'#2F2B35',light:'#FAFAFA',line:'#0E0C11',iris:'#E0C94A',whisker:'#FFFFFF',blush:'#B06A7A',lid:'#0E0C11'},
    pattern:(x,y,t,G)=>(t==='fur'&&inHead(x,y,G)&&Math.abs(x-G.fx)<1.1&&y>G.hy-G.headRy*.55&&y<G.hy+2)?'#FAFAFA':null},
  white:{kind:'cat',label:'Turkish Angora',shape:{tail:'plume',cheeks:true},sw:'#FAFAF8',pal:{fur:'#FAFAF8',light:'#FFFFFF',line:'#6A625A',iris:'#6FB8F0',iris2:'#F2B84C',whisker:'#B8B0A8'}},
  silvertabby:{kind:'cat',label:'American Shorthair',sw:'repeating-linear-gradient(135deg,#B9BFC6 0 5px,#6E747C 5px 8px)',pal:{fur:'#B9BFC6',light:'#EEF0F2',line:'#3A3E44',iris:'#8CC04E',whisker:'#EEF0F2'},pattern:tabbyPat('#6E747C')},
  calico:{kind:'cat',label:'Japanese Bobtail',shape:{tail:'bob'},sw:'conic-gradient(#FBF6EE 0 40%,#E8964A 0 70%,#3B3440 0)',pal:{fur:'#FBF6EE',light:'#FFFFFF',line:'#4A3A30',iris:'#8CC04E',whisker:'#6A5A50'},
    pattern:(x,y,t,G)=>{ if(t==='tail') return '#E8964A'; if(t==='ear') return x<22?'#E8964A':'#3B3440'; if(t!=='fur') return null;
      if(inC(x,y,15,G.hy-4.2,5.2)||inC(x,y,28.5,G.bodyCy+1.5,G.bodyRx*.55)) return '#E8964A';
      if(inC(x,y,29,G.hy-4.2,4.4)||inC(x,y,15,G.bodyCy+2.5,G.bodyRx*.45)) return '#3B3440'; return null; }},
  persian:{kind:'cat',label:'Persian',ears:'small',shape:{flat:true,ruff:true,tail:'bushy',head:1.07,eye:1.1,cheeks:true},sw:'radial-gradient(circle at 40% 40%,#FFF6E8 30%,#F2E2C4 32%)',pal:{fur:'#F2E2C4',light:'#FFF6E8',line:'#7A5A3A',iris:'#E0922A',whisker:'#B8A890'}},
  fold:{kind:'cat',label:'Scottish Fold',ears:'fold',shape:{head:1.05,eye:1.14},sw:'repeating-linear-gradient(135deg,#B89878 0 5px,#7A5A40 5px 8px)',pal:{fur:'#B89878',light:'#EFE2D0',line:'#4A3424',iris:'#E0B03A',whisker:'#EFE2D0'},pattern:tabbyPat('#7A5A40')}
};
const KIND_STYLES={dog:['cream','chocolate','black','silver','chihuahua','brindle','golden','dalmatian','husky','beagle'],cat:['tabby','siamese','gray','blackcat','tuxedo','white','silvertabby','calico','persian','fold']};
const shapeOf=S=>S.shape||{};
const breedCache={};
function breedP(P,S,key){ const sh=shapeOf(S); if(!sh.head&&!sh.eye&&!sh.muz&&!sh.body&&!sh.earLen) return P; if(breedCache[key]) return breedCache[key];
  const Q=JSON.parse(JSON.stringify(P)), h=sh.head||1, e=sh.eye||1, bd=sh.body||1;
  Q.head.rx*=h; Q.head.ry*=h; Q.eye.w*=e; Q.eye.h*=e; Q.eye.dx*=Math.sqrt(h);
  if(sh.muz){ Q.muz.rx*=sh.muz[0]; Q.muz.ry*=sh.muz[1]; }
  if(bd!==1){ ['body','haunch'].forEach(k=>{ Q[k].rx*=bd; Q[k].ry*=bd; }); Q.haunch.dx*=bd; Q.paw.dx*=bd; }
  if(sh.earLen&&Q.ear.len) Q.ear.len*=sh.earLen;
  return breedCache[key]=Q; }

/* ---- Faces ---- */
function drawEyes(b,cx,ey,EP,o,S,cat,xs){
  (xs||[cx-EP.dx,cx+EP.dx]).forEach((x,i)=>{ const fk=xs&&i===0?FAR_EYE:1; EP=Object.assign({},EP,{w:EP.w*fk});
    const iris=(i===1&&S.pal.iris2)||S.pal.iris||(cat?'#7FBF5A':'#6A4424'), st=o.eyes;
    if(st==='closed'){ Arc(b,x,ey-.2,EP.w*.52,EP.h*.3,'line',false,2); return; }
    if(st==='happy'){ Arc(b,x,ey+EP.h*.3,EP.w*.5,EP.h*.42,'line',true,2); return; }
    const k=st==='puppy'?1.16:1, w=EP.w*k, h=EP.h*k, slit=cat&&EP.almond&&st!=='puppy';
    E(b,x,ey,w/2,h/2,(px,py,nx,ny)=>{ const d=nx*nx+ny*ny;
      if(slit) return (Math.abs(nx)<.36&&Math.abs(ny)<.8)?'#140E0C':(ny<-.35?iris+'_':iris);
      if(d<.4) return '#140E0C'; return ny<-.15?iris+'_':iris; });
    E(b,x-w*.2,ey-h*.2,Math.max(.55,w*.17),Math.max(.55,h*.15),'*#FFFFFF'); D(b,x+w*.22,ey+h*.24,'*#FFFFFF');
    if(st==='puppy'){ D(b,x-w*.28,ey+h*.18,'*#FFFFFF'); E(b,x,ey+h*.42,w*.32,.35,'*#CFE8FF'); }
    const lid=st==='sleepy'?.52:(EP.lid||0);
    if(lid){ const top=ey-h/2, cut=top+h*lid; E(b,x,ey,w/2+.15,h/2+.15,(px,py)=>py<cut?'fur_':null); Ln(b,x-w*.5,cut,x+w*.5,cut,'line',2); }
  });
}
function drawMouth(b,cx,ny,o,cat){
  const my=ny+(cat?1.2:1.5);
  if(o.mouth==='flat'){ Ln(b,cx-1.5,my+.4,cx+1.5,my+.4,'line',2); return; }
  if(o.mouth==='open'){ E(b,cx,my+1.5,1.8,1.5,'mouthIn'); E(b,cx,my+2.3,1.1,.7,'tongue'); }
  if(o.mouth==='tongue'){ E(b,cx+.2,my+1.8,1.05,1.45,'tongue',SHS); Ln(b,cx+.2,my+1,cx+.2,my+2.3,'tongue!',1); }
  if(!cat) Ln(b,cx,ny+.3,cx,my,'line',2);
  Arc(b,cx-1.05,my,1.05,.8,'line',false,2); Arc(b,cx+1.05,my,1.05,.8,'line',false,2);
}
function drawBlush(b,cx,ey,EP,xs){ const X=xs||[cx-EP.dx,cx+EP.dx]; E(b,X[0]-1.7,ey+EP.h*.72+.5,1.45,.7,'blush'); E(b,X[1]+1.7,ey+EP.h*.72+.5,1.45,.7,'blush'); }

/* ---- Dogs ---- */
function dogEar(b,type,s,cx,hy,H,P,ed){
  if(type==='perk'){ part(b,T=>Tr(T,cx+s*H.rx*.95,hy-H.ry*.2,cx+s*H.rx*.18,hy-H.ry*.82,cx+s*(H.rx*.72+ed*.6),hy-H.ry-P.ear.perkH+ed,'ear',SH));
    Tr(b,cx+s*H.rx*.78,hy-H.ry*.35,cx+s*H.rx*.3,hy-H.ry*.8,cx+s*(H.rx*.7+ed*.6),hy-H.ry-P.ear.perkH*.62+ed,'earIn'); return true; }
  if(type==='bat'){ const tipX=cx+s*(H.rx*1.28+ed*.5), tipY=hy-H.ry-P.ear.perkH*1.15+ed;
    part(b,T=>Tr(T,cx+s*H.rx*1.0,hy-H.ry*.02,cx+s*H.rx*.22,hy-H.ry*.8,tipX,tipY,'ear',SH));
    Tr(b,cx+s*H.rx*.9,hy-H.ry*.22,cx+s*H.rx*.38,hy-H.ry*.78,tipX-s*.9,tipY+1.6,'earIn'); return true; }
  if(type==='fold') return false;
  return false; }
function dogFlopEar(b,type,s,cx,hy,H,P,ed){
  if(type==='fold'){ part(b,T=>Tr(T,cx+s*H.rx*.3,hy-H.ry*.98,cx+s*(H.rx+.6),hy-H.ry*.55,cx+s*H.rx*.78,hy-H.ry*.02+ed*.6,'ear',SH)); return; }
  if(type==='puff'){ part(b,T=>{ for(let k=0;k<4;k++) E(T,cx+s*(H.rx+.2)+(k%2?s*.6:0),hy+P.ear.dy-2+k*2.1+ed,P.ear.w*1.05,1.9,'ear',SH); }); return; }
  const long=type==='long', len=P.ear.len*(long?1.3:1);
  part(b,T=>E(T,cx+s*(H.rx-.1),hy+P.ear.dy+ed+(long?1.2:0),P.ear.w,len,'ear',SH));
}
/* Sitting, facing you, like a real puppy or kitten: the body and the front legs are one shape, and
   the front legs are drawn with leg lines that start at the chest (where the shoulders are) and run down
   to the front paws. The light chest comes down to where the legs begin. The back legs sit behind the
   body, so only a slim curve of each shows at the sides, with the back paws peeking out on the outside. */
function sitBody(b,P,cx,BD,sh,cat,clothes,o={}){ const H=P.haunch, W=P.paw;
  const grounded=[-1,1].filter(s=>!o.paws||!o.paws[s]);
  // Walking toward the camera uses the same short leg on both sides. Lift a foot by
  // bending that leg; never replace it with the shoulder-to-paw reaching gesture.
  const lift=s=>o.upright?frontStepLift(o.frame||0,s):0;
  const legDx=W.dx*(cat?.6:.64), legTop=BD.cy-BD.ry*.1, legBot=W.cy, legRx=W.rx*(cat?.56:.6), legH=(legBot-legTop)/2, legCy=(legTop+legBot)/2, chestEnd=legTop+(legBot-legTop)*.38;
  const thX=BD.rx*(cat?.66:.7), thY=H.cy+.3, thRx=H.rx*(cat?.8:.86), thRy=H.ry*1.02;
  const toes=(x,y,ry,tag)=>{ Ln(b,x-.6,y+.1,x-.6,y+ry-.35,tag,1); Ln(b,x+.6,y+.1,x+.6,y+ry-.35,tag,1); };
  /* back legs, behind the body: a slim curve at each side and the back paw on the outside */
  if(!o.upright) part(b,T=>[-1,1].forEach(s=>E(T,cx+s*thX,thY,thRx,thRy,'fur',SH)));
  [-1,1].forEach(s=>{ const px=cx+s*(o.upright?thX*.85:thX+thRx*.3), py=W.cy-(o.upright?2:.2); part(b,T=>E(T,px,py,W.rx*.88,W.ry*.8,'paw',SHL)); toes(px+s*.25,py,W.ry*.8,'paw!'); });
  /* the body and the front legs as one shape (lower legs in the paw color, like socks) */
  const sock=(x,y)=>y>legTop+(legBot-legTop)*.64?'paw':'fur';
  part(b,T=>{ E(T,cx,BD.cy,BD.rx*.8,BD.ry,'fur',SH); E(T,cx,BD.cy+BD.ry*.42,BD.rx*.86,BD.ry*.56,'fur',SH); grounded.forEach(s=>E(T,cx+s*legDx,legCy-lift(s)/2,legRx,legH-lift(s)/2,sock,SH)); });
  /* the light chest, down to the top of the front legs */
  E(b,cx,BD.cy+BD.ry*.02,BD.rx*.42,BD.ry*.8,'light',null,null,chestEnd);
  /* leg lines: from the chest down to the paws, on both sides of each front leg */
  grounded.forEach(s=>{ const xi=cx+s*(legDx-legRx)+s*.2, xo=cx+s*(legDx+legRx)-s*.2;
    Ln(b,xi,chestEnd-.4,xi,legBot-.5-lift(s),'fur!',1); Ln(b,xo,chestEnd+(legBot-chestEnd)*.3,xo,legBot-.5-lift(s),'fur!',1); });
  clothes();
  if(sh.cuffs) part(b,T=>grounded.forEach(s=>E(T,cx+s*legDx,W.cy-.8-lift(s),W.rx*1.2,W.ry*1.4,'fur',SH)));
  part(b,T=>grounded.forEach(s=>E(T,cx+s*legDx,W.cy+.45-lift(s),W.rx*(sh.cuffs?.78:.92),W.ry*(sh.cuffs?.75:.98),'paw',SHL)));
  grounded.forEach(s=>toes(cx+s*legDx,W.cy+.45-lift(s),W.ry*.98,'paw!')); }
function frontStepLift(frame,side){ return frame===1&&side<0||frame===3&&side>0?1.2:0; }
/* The raised leg uses exactly the same shoulder and total length as the resting front leg.
   Its upper leg stays close to the chest; a foreshortened forearm folds toward the viewer. */
function frontLegRig(P,S,side){ const W=P.paw, BD=P.body, sx=22+side*W.dx*(S.kind==='cat'?.6:.64), sy=BD.cy-BD.ry*.1, length=W.cy+.45-sy;
  return {sx,sy,upper:length*.48,lower:length*.52}; }
function forelegJoints(P,S,side,q){ const r=frontLegRig(P,S,side);
  const limit=(x,y,ax,ay,len)=>{ const d=Math.hypot(x-ax,y-ay), k=d>len?len/d:1; return {x:ax+(x-ax)*k,y:ay+(y-ay)*k}; };
  const elbow=limit(q.ex??r.sx,q.ey??r.sy+r.upper,r.sx,r.sy,r.upper), paw=limit(q.x,q.y,elbow.x,elbow.y,r.lower);
  return {sx:r.sx,sy:r.sy,ex:elbow.x,ey:elbow.y,x:paw.x,y:paw.y}; }
/* Moving forelegs replace the resting leg, including its foot. Never lengthen a segment to reach
   a prop. The hand or bell comes to the paw instead. */
function drawForelegs(b,o,P,S,layer){ if(!o.paws) return; const W=P.paw;
  [-1,1].forEach(s=>{ const q=o.paws[s]; if(!q) return;
    const {sx,sy,ex,ey,x,y}=forelegJoints(P,S,s,q), lift=q.lift||0, rx=W.rx*lerp(.92,.8,lift), ry=W.ry*(q.pad?1.1:1);
    // The shoulder stays inside the shirt. Only the folded forearm and paw pass
    // in front of it, emerging at the sleeve/hem instead of cutting through the chest.
    if(layer==='upper'){ part(b,T=>capsule(T,sx,sy,ex,ey,W.rx*(S.kind==='cat'?.56:.6),'*fur',SH)); return; }
    part(b,T=>{ capsule(T,ex,ey,x,y,W.rx*.48,'fur',SH);
      if(shapeOf(S).cuffs) E(T,x,y+.7,W.rx*.95,W.ry*1.1,'fur',SH);
      E(T,x,y,rx,ry,'paw',SHL);
      if(q.pad) for(let i=-1;i<=1;i++) E(T,x+i*rx*.58,y-ry*.62,rx*.36,ry*.48,'paw',SHL); });
    if(q.pad){ E(b,x,y+.35,rx*.43,ry*.42,'#D58D9B',SHS);
      for(let i=-1;i<=1;i++) E(b,x+i*rx*.58,y-ry*.65,rx*.16,ry*.19,'#EBA6B2'); }
    else [-.5,.5].forEach(dx=>Ln(b,x+dx,y+.1,x+dx,y+ry*.65,'paw!',1));
  }); }
function buildDog(b,o,P,S,fit){
  const cx=22, H=P.head, BD=P.body, hy=H.cy+(o.headDy||0), ed=o.ear?1:0, G=geoFor(P,o), sh=shapeOf(S), ears=S.ears||'flop';
  const ta=[-.55,-1.15,-.1][o.tail||0], tx=cx+BD.rx*.78, ty=BD.cy+BD.ry*.05, tr=P.tail.r*(sh.tail==='otter'?1.3:1);
  part(b,T=>{ const n=sh.tail==='pom'?2:3; for(let i=0;i<n;i++){ const r=tr*(1-i*.14), d=i*P.tail.len*.42; E(T,tx+Math.cos(ta)*d+1,ty+Math.sin(ta)*d,r*1.25,r,'tail',SH); }
    if(sh.tail==='pom'){ const d=2*P.tail.len*.42; E(T,tx+Math.cos(ta)*d+1.4,ty+Math.sin(ta)*d-.6,tr*1.6,tr*1.5,'tail',SH); } });
  wearBehind(b,G,fit);
  sitBody(b,P,cx,BD,sh,false,()=>{ drawForelegs(b,o,P,S,'upper'); wearBody(b,G,fit); },o);
  drawForelegs(b,o,P,S);
  const colY=H.cy+H.ry-.8;
  if(sh.chest) part(b,T=>{ for(let i=-2;i<=2;i++) Tr(T,cx+i*1.9-1.3,colY+.4,cx+i*1.9+1.3,colY+.4,cx+i*1.9,colY+3.6-Math.abs(i)*.4,'light',SHS); });
  if(!o.bare&&(!fit||!fit.neck)){ part(b,T=>E(T,cx,colY,BD.rx*.64,1.15,'collar',SHS)); part(b,T=>E(T,cx,colY+1.7,1.05,1.05,'tag',SH)); }
  wearNeck(b,G,fit);
  const earL=ears, earR=ears, F=G.fx, EX=[G.eyeLX,G.eyeRX], ecx=cx;
  const upL=dogEar(b,earL,-1,ecx,hy,H,P,ed), upR=dogEar(b,earR,1,ecx,hy,H,P,ed);
  part(b,T=>E(T,cx,hy,H.rx,H.ry,'fur',SH));
  if(sh.topknot) part(b,T=>[[0,-.25],[-.45,.02],[.45,.02],[-.24,-.4],[.24,-.4]].forEach(([dx,dy])=>E(T,cx+dx*H.rx,hy-H.ry*.72+dy*H.ry,H.rx*.36,H.ry*.3,'fur',SH)));
  const mx=F; E(b,mx,hy+P.muz.dy,P.muz.rx,P.muz.ry,P.senior?'grey':'muzzle',SHL);
  if(sh.beard){ part(b,T=>{ E(T,mx,hy+P.muz.dy+P.muz.ry*.9,P.muz.rx*1.2,P.muz.ry*1.3,'beard',SHL); [-1,1].forEach(s=>E(T,mx+s*P.muz.rx*.55,hy+P.muz.dy+P.muz.ry*1.6,P.muz.rx*.55,P.muz.ry*.7,'beard',SHL)); }); E(b,mx,hy+P.muz.dy-.4,P.muz.rx*.9,P.muz.ry*.7,'beard',SHL); }
  if(!upL) dogFlopEar(b,earL,-1,ecx,hy,H,P,ed); if(!upR) dogFlopEar(b,earR,1,ecx,hy,H,P,ed);
  const ey=hy+P.eye.dy;
  if(P.senior) EX.forEach(x=>E(b,x,ey-P.eye.h*.78,1.6,.7,'grey'));
  drawEyes(b,cx,ey,P.eye,o,S,false,EX); drawBlush(b,cx,ey,P.eye,EX);
  if(sh.beard) [-1,1].forEach((s,i)=>part(b,T=>{ const x=EX[i]; E(T,x,ey-P.eye.h*.72,2.3,1.1,'beard',SHS); Tr(T,x-s*2.2,ey-P.eye.h*.7,x+s*2.2,ey-P.eye.h*.7,x+s*2.6,ey-P.eye.h*1.25,'beard'); }))
  const nx=F, ny=hy+P.nose.dy; E(b,nx,ny,P.nose.w/2,P.nose.w*.3,'nose'); D(b,nx-.8,ny-.5,'*#8A7A72'); D(b,nx-.3,ny-.5,'*#8A7A72');
  drawMouth(b,nx,ny,o,false);
  wearFace(b,G,fit); wearHat(b,G,fit);
}
/* ---- Cats ---- */
function buildCat(b,o,P,S,fit){
  const cx=22, H=P.head, BD=P.body, hy=H.cy+(o.headDy||0), ed=o.ear?1:0, sw=[0,1,-1][o.tail||0], G=geoFor(P,o), sh=shapeOf(S), ears=S.ears||'normal';
  const tr=P.tail.r*(sh.tail==='bushy'?1.55:sh.tail==='plume'?1.35:sh.tail==='bob'?1.7:1), steps=sh.tail==='bob'?3:14;
  part(b,T=>{ const L=P.tail.len, x0=cx+BD.rx*.5, y0=BD.cy+BD.ry*.78;
    for(let i=0;i<=steps;i++){ const s=sh.tail==='bob'?i/14:i/14, x=x0+Math.sin(s*Math.PI*.9)*L*.44+s*s*sw*2.4, y=y0-s*L*.95+Math.sin(s*Math.PI)*.8, r=tr*(1-(sh.tail==='bob'?0:.22)*s)*(sh.tail==='plume'?1+.35*s:1); E(T,x,y,r,r,'tail',SH); } });
  wearBehind(b,G,fit);
  sitBody(b,P,cx,BD,sh,true,()=>{ drawForelegs(b,o,P,S,'upper'); wearBody(b,G,fit); },o);
  drawForelegs(b,o,P,S);
  if(sh.ruff) part(b,T=>{ const y=H.cy+H.ry-.4; for(let i=-3;i<=3;i++) E(T,cx+i*H.rx*.3,y+Math.abs(i)*-.35+1,2.2,2.6,Math.abs(i)<2?'light':'fur',SH); });
  wearNeck(b,G,fit);
  const eh=P.ear.h*(ears==='small'?.6:1), F=G.fx, EX=[G.eyeLX,G.eyeRX], ecx=cx;
  if(ears==='fold') part(b,T=>[-1,1].forEach(s=>{ E(T,ecx+s*H.rx*.58,hy-H.ry*.86,2.6,1.9,'ear',SH); }));
  else { const out=ears==='small'?1.1:1;
    part(b,T=>[-1,1].forEach(s=>Tr(T,ecx+s*H.rx*.98*out,hy-H.ry*.22,ecx+s*H.rx*.18*out,hy-H.ry*.86,ecx+s*(H.rx*.8*out+ed*.8),hy-H.ry-eh+ed*.8,'ear',SH)));
    [-1,1].forEach(s=>Tr(b,ecx+s*H.rx*.8*out,hy-H.ry*.4,ecx+s*H.rx*.36*out,hy-H.ry*.84,ecx+s*(H.rx*.76*out+ed*.8),hy-H.ry-eh*.62+ed*.8,'earIn'));
    if(ears==='tuft') [-1,1].forEach(s=>{ const tx=ecx+s*(H.rx*.8+ed*.8), ty=hy-H.ry-eh+ed*.8; Ln(b,tx,ty+.4,tx+s*.7,ty-2.4,'ear!',2); Ln(b,tx-s*.4,ty+.4,tx-s*.1,ty-1.8,'ear!',1); }); }
  const ck=sh.cheeks?1.8:1.3;
  part(b,T=>{ E(T,cx,hy,H.rx,H.ry,'fur',SH); [-1,1].forEach(s=>Tr(T,cx+s*(H.rx-1.4),hy+H.ry*.1,cx+s*(H.rx-1.2),hy+H.ry*.75,cx+s*(H.rx+ck),hy+H.ry*.5,'fur')); });
  if(ears==='fold') [-1,1].forEach(s=>Ln(b,ecx+s*H.rx*.4,hy-H.ry*.82,ecx+s*H.rx*.78,hy-H.ry*.7,'ear!',1));
  const ny=hy+P.nose.dy-(sh.flat?.9:0), nx=F;
  [-1,1].forEach(s=>E(b,nx+s*1.9*(sh.flat?.85:1),ny+1.5,P.muz.rx*(sh.flat?.85:1),P.muz.ry*(sh.flat?.85:1),P.senior?'grey':'muzzle',SHL));
  const ey=hy+P.eye.dy;
  if(P.senior) EX.forEach(x=>E(b,x,ey-P.eye.h*.8,1.4,.6,'grey'));
  drawEyes(b,cx,ey,P.eye,o,S,true,EX); drawBlush(b,cx,ey,P.eye,EX);
  Tr(b,nx-1.25,ny-.55,nx+1.25,ny-.55,nx,ny+.85,'noseCat'); D(b,nx-.5,ny-.3,'*#FFD6DE');
  drawMouth(b,nx,ny,o,true);
  const wl=P.whisk; [-1,1].forEach(s=>[0,1,2].forEach(k=>{ const x0=nx+s*(P.muz.rx+2.6), y0=ny+1+k*.8; Ln(b,x0,y0,x0+s*wl,y0+(k-1)*.9-.4,'*whisker',1); }));
  wearFace(b,G,fit); wearHat(b,G,fit);
}
function geoFor(P,o){ const hy=P.head.cy+(o.headDy||0), fx=22-P.head.rx*TURN_K; return {cx:22,hy,fx,eyeLX:fx-P.eye.dx,eyeRX:fx+P.eye.dx,H:P.head,BD:P.body,P,top:hy-P.head.ry,k:P.head.rx/10,neckY:P.head.cy+P.head.ry-.6,eyeY:hy+P.eye.dy,eyeDx:P.eye.dx,EP:P.eye,
  headRx:P.head.rx,headRy:P.head.ry,bodyCy:P.body.cy,bodyRx:P.body.rx,bodyRy:P.body.ry}; }

/* ================= Outfits =================
   Drawn into the pet sprite, so they are shaded and outlined like the pet and fit every stage. */
const OUTFITS={
  hat:[['party','Party hat',0],['beanie','Cozy beanie',0],['flowers','Flower crown',6],['bunny','Bunny ears',10],['cap','Red cap',12],['sunhat','Sun hat',20],['cowboy','Cowboy hat',26],
    ['crown','Royal crown',30],['headphones','Headphones',34],['bow','Pink bow',40],['chef','Chef hat',46],['witch','Witch hat',52],['santa','Santa hat',58],['pirate','Pirate hat',64],
    ['wizard','Wizard hat',72],['tiara','Sparkly tiara',80],['halo','Golden halo',95]],
  neck:[['bandana','Red bandana',0],['bowtie','Bow tie',3],['scarf','Striped scarf',9],['bell','Bell collar',16],['necktie','Necktie',21],['blueband','Blue bandana',24],
    ['pearls','Pearl necklace',31],['lei','Flower lei',36],['medal','Gold medal',44],['polka','Polka dot bandana',50],['petals','Petal collar',62]],
  face:[['round','Round glasses',0],['sun','Sunglasses',14],['heart','Heart glasses',28],['star','Star glasses',38],['goggles','Swim goggles',48],['cateye','Fancy glasses',60],['monocle','Monocle',76]],
  body:[['sweater','Striped sweater',4],['raincoat','Raincoat',11],['hoodie','Pink hoodie',18],['tutu','Tutu',27],['cape','Hero cape',35],['overalls','Overalls',42],
    ['pajamas','Star pajamas',49],['bee','Bee costume',57],['holiday','Holiday sweater',66],['tuxedo','Tuxedo',74],['dino','Dino suit',88]]
};
const OUT_CATS=['hat','neck','face','body'];
const alt2=(n,a,b)=>alt(n)?a:b;
const HATS={
  party(b,G){ const {cx,top,k}=G; part(b,T=>{ Tr(T,cx-4.6*k,top+2,cx+4.6*k,top+2,cx+.8,top-9.5*k,(x,y)=>alt2((y-top)*.9+x*.35,'#D9577A','#F4C542'),SH); R(T,cx-4.9*k,top+1,9.8*k,1.6,'#7FB08C',true,.6); }); part(b,T=>E(T,cx+.8,top-9.8*k,1.5*k,1.5*k,'#FFFFFF',SH)); },
  beanie(b,G){ const {cx,top,k}=G; part(b,T=>{ E(T,cx,top+2.6,7.4*k,5.6*k,(x,y)=>alt2(x*.8,'#5A8FC4','#6E9FD0'),SH,null,top+2.6); R(T,cx-7.8*k,top+1.4,15.6*k,2.6,(x)=>alt2(x*1.3,'#3E6FA4','#9FC4E8'),true,.8); }); part(b,T=>E(T,cx,top-3*k,2*k,2*k,'#FFFFFF',SH)); },
  flowers(b,G){ const {cx,top,k}=G, cols=['#F07A8E','#F4C542','#B89AD8','#FFFFFF','#F07A8E','#F4C542','#B89AD8']; part(b,T=>{ for(let i=-3;i<=3;i++){ const x=cx+i*2.35*k, y=top+1.6+i*i*.22; E(T,x,y+1,1.3,.6,'#6E9B7B'); } });
    for(let i=-3;i<=3;i++){ const x=cx+i*2.35*k, y=top+1+i*i*.22; part(b,T=>E(T,x,y,1.35*k,1.35*k,cols[i+3],SH)); D(b,x,y,'#F4B942'); } },
  bunny(b,G){ const {cx,top,k}=G; part(b,T=>[-1,1].forEach(s=>E(T,cx+s*3.2*k,top-5.6*k,1.9*k,5.6*k,'#FAF6F8',SH))); [-1,1].forEach(s=>E(b,cx+s*3.2*k,top-5*k,.9*k,4*k,'#F4B6C6')); part(b,T=>E(T,cx,top+1.2,6.5*k,1,'#D9577A',SHS,null,null)); },
  cap(b,G){ const {cx,top,k}=G; part(b,T=>{ E(T,cx+5*k,top+2.3,4.4*k,1.3,'#9A3050',SHS); }); part(b,T=>E(T,cx-.4,top+2.4,6.8*k,5*k,'#D9577A',SH,null,top+2.4)); part(b,T=>E(T,cx-.4,top-2.2*k,1,1,'#FFFFFF',SH)); E(b,cx-.6,top-.2,1.2,1.2,'#FFFFFF'); },
  sunhat(b,G){ const {cx,top,k}=G; part(b,T=>E(T,cx,top+2.6,12.5*k,2.8*k,(x,y)=>alt2(x*.7+y*.7,'#E8C86A','#D9B458'),SH)); part(b,T=>E(T,cx,top+2,6.2*k,4.6*k,'#E8C86A',SH,null,top+2)); R(b,cx-6.1*k,top+.2,12.2*k,1.4,'#D9577A',SHS); part(b,T=>E(T,cx+4.8*k,top+.9,1.5,1.5,'#F4C542',SH)); },
  cowboy(b,G){ const {cx,top,k}=G; part(b,T=>{ E(T,cx,top+2.4,12*k,2.4*k,'#A0643A',SH); }); part(b,T=>{ R(T,cx-5*k,top-4.8*k,10*k,7*k,'#B8784A',SH,2.2); }); R(b,cx-5*k,top+.2,10*k,1.3,'#5A3420',SHS); Tr(b,cx-1.4,top-4.9*k,cx+1.4,top-4.9*k,cx,top-3.3*k,'#8A5A34'); },
  crown(b,G){ const {cx,top,k}=G; part(b,T=>{ R(T,cx-5.4*k,top-1.2,10.8*k,3.4,'#F4C542',SH,.5); [-4.2,-2.1,0,2.1,4.2].forEach((dx,i)=>Tr(T,cx+dx*k-1.3,top-1,cx+dx*k+1.3,top-1,cx+dx*k,top-(i%2?3.6:5.2)*k,'#F4C542',SH)); });
    E(b,cx,top+.5,1,1,'#D9577A'); E(b,cx-3.2*k,top+.5,.8,.8,'#5A8FC4'); E(b,cx+3.2*k,top+.5,.8,.8,'#5A8FC4'); D(b,cx-.3,top+.1,'*#FFFFFF'); },
  headphones(b,G){ const {cx,top,k,hy,H}=G; part(b,T=>{ for(let a=0;a<=40;a++){ const t=Math.PI*(a/40); const x=cx-Math.cos(t)*(H.rx+.3), y=hy-Math.sin(t)*(H.ry+1.8); E(T,x,y,.95,.95,'#3B3440'); } });
    part(b,T=>[-1,1].forEach(s=>{ E(T,cx+s*(H.rx+.4),hy+.5,2.4,3.2,'#E0567D',SH); })); [-1,1].forEach(s=>E(b,cx+s*(H.rx+.4),hy+.5,1.1,1.6,'#F4A0B6')); },
  bow(b,G){ const {cx,top,k,H}=G, x=cx+H.rx*.55, y=top+2.2; part(b,T=>{ Tr(T,x-4*k,y-2.4*k,x-4*k,y+2.4*k,x,y,'#F07A8E',SH); Tr(T,x+4*k,y-2.4*k,x+4*k,y+2.4*k,x,y,'#F07A8E',SH); }); part(b,T=>E(T,x,y,1.4*k,1.4*k,'#D9577A',SH)); },
  chef(b,G){ const {cx,top,k}=G; part(b,T=>{ R(T,cx-5*k,top-1.6,10*k,3.6,'#FFFFFF',SH,.6); [-3.4,0,3.4].forEach(dx=>E(T,cx+dx*k,top-4.6*k,3.6*k,3.6*k,'#FFFFFF',SH)); }); Ln(b,cx-4.8*k,top+.6,cx+4.8*k,top+.6,'#E6E1DA',2); },
  witch(b,G){ const {cx,top,k}=G; part(b,T=>E(T,cx,top+2.2,11*k,2.3*k,'#4A3A6A',SH)); part(b,T=>{ Tr(T,cx-5*k,top+1.8,cx+5*k,top+1.8,cx+2.6*k,top-8*k,'#5A4A80',SH); Tr(T,cx+.8*k,top-6*k,cx+3.6*k,top-7.4*k,cx+7*k,top-11*k,'#5A4A80',SH); });
    R(b,cx-4.9*k,top-.2,9.8*k,1.6,'#F4C542',SHS); R(b,cx-1,top-.3,2,1.8,'#FFE27A'); },
  santa(b,G){ const {cx,top,k}=G; part(b,T=>{ Tr(T,cx-6*k,top+2,cx+6*k,top+2,cx+2*k,top-6.5*k,'#D9403E',SH); Tr(T,cx-.5*k,top-4*k,cx+4*k,top-6.8*k,cx+8.2*k,top-2.6*k,'#D9403E',SH); });
    part(b,T=>E(T,cx,top+2,7*k,1.9,'#FFFFFF',SH)); part(b,T=>E(T,cx+8.2*k,top-2.4*k,1.8*k,1.8*k,'#FFFFFF',SH)); },
  pirate(b,G){ const {cx,top,k}=G; part(b,T=>{ E(T,cx,top+.8,9.5*k,4.6*k,'#2F2B35',SH,null,top+2.4); Tr(T,cx-9.5*k,top+1,cx-4*k,top+2.4,cx-10.5*k,top-2.6*k,'#2F2B35'); Tr(T,cx+9.5*k,top+1,cx+4*k,top+2.4,cx+10.5*k,top-2.6*k,'#2F2B35'); });
    Ln(b,cx-8.6*k,top+1.6,cx+8.6*k,top+1.6,'#F4C542',2); part(b,T=>{ E(T,cx,top-1.6*k,1.6,1.6,'#FFFFFF',SH); }); D(b,cx-.6,top-1.8*k,'#2F2B35'); D(b,cx+.6,top-1.8*k,'#2F2B35'); },
  wizard(b,G){ const {cx,top,k}=G; part(b,T=>E(T,cx,top+2.2,10*k,2.2*k,'#3E6FA4',SH)); part(b,T=>Tr(T,cx-5.2*k,top+1.8,cx+5.2*k,top+1.8,cx-.6*k,top-12*k,'#4A7FC0',SH));
    [[-1.6,-2],[1.6,-5],[-.6,-8.2]].forEach(([dx,dy])=>{ const x=cx+dx*k, y=top+dy*k; D(b,x,y,'*#FFE27A'); D(b,x-.5,y,'*#FFE27A'); D(b,x+.5,y,'*#FFE27A'); D(b,x,y-.5,'*#FFE27A'); D(b,x,y+.5,'*#FFE27A'); }); },
  tiara(b,G){ const {cx,top,k}=G; part(b,T=>{ for(let i=-4;i<=4;i++){ const x=cx+i*1.1*k, h=(5-Math.abs(i))*.55*k; E(T,x,top+1.6-h*.5,.55,h*.5+.5,'#DDE3EE',SH); } R(T,cx-5*k,top+1,10*k,1.2,'#C8D0DC',true); });
    part(b,T=>E(T,cx,top-1.6*k,1.1,1.3,'#F07A8E',SH)); D(b,cx-.3,top-1.9*k,'*#FFFFFF'); },
  halo(b,G){ const {cx,top,k}=G; part(b,T=>E(T,cx,top-3.4*k,6.2*k,1.8,(x,y,nx,ny)=>(nx*nx+ny*ny)<.36?null:'#F4C542',SH)); }
};
function wearHat(b,G,fit){ if(fit&&fit.hat&&HATS[fit.hat]) HATS[fit.hat](b,G); }
const NECKS={
  bandana(b,G){ bandanaDraw(b,G,'#D9577A',(x,y)=>((Math.round(x*1.3)+Math.round(y*1.3))%5===0)?'#FFFFFF':null); },
  blueband(b,G){ bandanaDraw(b,G,'#4A86C8',(x,y)=>((Math.round(x*1.3)+Math.round(y*1.3))%5===0)?'#FFFFFF':null); },
  polka(b,G){ bandanaDraw(b,G,'#F4C542',(x,y)=>inC((x*1.2)%3,(y*1.2)%3,1.5,1.5,.7)?'#E0567D':null); },
  bowtie(b,G){ const {cx,neckY,k}=G, y=neckY+1.4; part(b,T=>{ Tr(T,cx-4.2*k,y-2.2*k,cx-4.2*k,y+2.2*k,cx,y,'#8A5AB0',SH); Tr(T,cx+4.2*k,y-2.2*k,cx+4.2*k,y+2.2*k,cx,y,'#8A5AB0',SH); }); part(b,T=>E(T,cx,y,1.2,1.3,'#5A3A80',SH)); },
  scarf(b,G){ const {cx,neckY,BD}=G, w=BD.rx*.95; part(b,T=>{ E(T,cx,neckY+.6,w,1.9,(x)=>alt2(x*.7,'#E8757A','#FFFFFF'),SH); R(T,cx+w*.35,neckY+1,2.6,6,(x,y)=>alt2(y*.7,'#E8757A','#FFFFFF'),SH,.6); }); for(let x=0;x<3;x++) Ln(b,cx+w*.35+.4+x*.9,neckY+7,cx+w*.35+.4+x*.9,neckY+8,'#F4C542',1); },
  bell(b,G){ const {cx,neckY,BD}=G; part(b,T=>E(T,cx,neckY+.3,BD.rx*.66,1.2,'#4A86C8',SHS)); part(b,T=>E(T,cx,neckY+2.4,1.7,1.7,'#F4C542',SH)); Ln(b,cx-1,neckY+3,cx+1,neckY+3,'#8A6A1E',1); D(b,cx-.6,neckY+1.8,'*#FFF3B0'); },
  necktie(b,G){ const {cx,neckY,BD}=G; part(b,T=>{ Tr(T,cx-1.4,neckY+.2,cx+1.4,neckY+.2,cx,neckY+2,'#3E6FA4',SH); Tr(T,cx-1.1,neckY+1.6,cx+1.1,neckY+1.6,cx,neckY+BD.ry*.95,'#4A86C8',SH); Tr(T,cx-1.1,neckY+1.6,cx+1.1,neckY+1.6,cx,neckY+BD.ry*1.15,'#4A86C8'); });
    for(let i=1;i<4;i++) Ln(b,cx-.8,neckY+1.6+i*1.8,cx+.8,neckY+.9+i*1.8,'#F4C542',1); },
  pearls(b,G){ const {cx,neckY,BD}=G, w=BD.rx*.7; for(let i=0;i<=10;i++){ const t=i/10, x=cx-w+t*2*w, y=neckY+.5+Math.sin(t*Math.PI)*1.8; part(b,T=>E(T,x,y,.85,.85,'#F6F2EA',SH)); } },
  lei(b,G){ const {cx,neckY,BD}=G, w=BD.rx*.82, cols=['#F07A8E','#F4C542','#FFFFFF','#B89AD8']; for(let i=0;i<=8;i++){ const t=i/8, x=cx-w+t*2*w, y=neckY+.4+Math.sin(t*Math.PI)*2.2; part(b,T=>E(T,x,y,1.35,1.2,cols[i%4],SH)); D(b,x,y,'#F4B942'); } },
  medal(b,G){ const {cx,neckY}=G; part(b,T=>{ Tr(T,cx-2.6,neckY,cx-.4,neckY,cx-.6,neckY+3.6,'#4A86C8'); Tr(T,cx+2.6,neckY,cx+.4,neckY,cx+.6,neckY+3.6,'#D9403E'); }); part(b,T=>E(T,cx,neckY+4.6,2,2,'#F4C542',SH)); D(b,cx,neckY+4.6,'#FFF3B0'); D(b,cx-.5,neckY+4.6,'#C98A12'); D(b,cx+.5,neckY+4.6,'#C98A12'); },
  petals(b,G){ const {cx,neckY,BD}=G, w=BD.rx*.9; for(let i=0;i<=9;i++){ const t=i/9, x=cx-w+t*2*w, y=neckY+.8+Math.sin(t*Math.PI)*1.4; part(b,T=>E(T,x,y+1,1.25,2,i%2?'#F4B6C6':'#FFFFFF',SH)); } }
};
function bandanaDraw(b,G,base,dots){ const {cx,neckY,k,BD}=G, w=Math.max(BD.rx*.8,5.4*k); part(b,T=>{ Tr(T,cx-w,neckY-.6,cx+w,neckY-.6,cx,neckY+w*.95,(x,y)=>dots(x,y)||base,SH); R(T,cx-w,neckY-1.2,w*2,1.8,base,true,.8); }); }
function wearNeck(b,G,fit){ if(fit&&fit.neck&&NECKS[fit.neck]) NECKS[fit.neck](b,G); }
const FACES={
  round(b,G){ glassesFrame(b,G,'#E0B84A',null,false); },
  sun(b,G){ glassesFrame(b,G,'#1C1C28','#1C1C28',false,'#6A6A88'); },
  heart(b,G){ const {eyeY,EP,eyeLX,eyeRX}=G, r=Math.max(EP.w,EP.h)*.62+.5; Ln(b,eyeLX+r*.7,eyeY-.2,eyeRX-r*.7,eyeY-.2,'#D9577A',2);
    [-1,1].forEach(s=>{ const x=s<0?eyeLX:eyeRX; part(b,T=>{ E(T,x-r*.45,eyeY-r*.3,r*.55,r*.5,'#F07A8E',SH); E(T,x+r*.45,eyeY-r*.3,r*.55,r*.5,'#F07A8E',SH); Tr(T,x-r,eyeY-r*.1,x+r,eyeY-r*.1,x,eyeY+r*.95,'#F07A8E',SH); }); D(b,x-r*.5,eyeY-r*.45,'*#FFFFFF'); }); },
  star(b,G){ const {eyeY,EP,eyeLX,eyeRX}=G, r=Math.max(EP.w,EP.h)*.66+.6; Ln(b,eyeLX+r*.6,eyeY-.2,eyeRX-r*.6,eyeY-.2,'#C98A12',2);
    [-1,1].forEach(s=>{ const x=s<0?eyeLX:eyeRX; part(b,T=>{ for(let i=0;i<5;i++){ const a=-Math.PI/2+i*TAU/5; Tr(T,x,eyeY,x+Math.cos(a-.5)*r*.45,eyeY+Math.sin(a-.5)*r*.45,x+Math.cos(a)*r,eyeY+Math.sin(a)*r,'#F4C542',SHS); Tr(T,x,eyeY,x+Math.cos(a+.5)*r*.45,eyeY+Math.sin(a+.5)*r*.45,x+Math.cos(a)*r,eyeY+Math.sin(a)*r,'#F4C542',SHS); } }); D(b,x-.4,eyeY-.6,'*#FFFFFF'); }); },
  goggles(b,G){ const {cx,eyeY,H}=G; Ln(b,cx-H.rx,eyeY-.4,cx+H.rx,eyeY-.4,'#3E6FA4',3); glassesFrame(b,G,'#3E6FA4','#9FD8F0',false,'#FFFFFF'); },
  cateye(b,G){ glassesFrame(b,G,'#8A5AB0',null,true); },
  monocle(b,G){ const {eyeY,EP,eyeRX}=G, r=Math.max(EP.w,EP.h)*.62+.5, x=eyeRX; part(b,T=>E(T,x,eyeY,r,r,(px,py,nx,ny)=>(nx*nx+ny*ny)<.62?null:'#E0B84A',SHS)); for(let i=0;i<7;i++) D(b,x+r*.6+i*.3,eyeY+r*.8+i*.9,'#C98A12'); }
};
function glassesFrame(b,G,frame,lens,pointy,shineC){ const {eyeY,EP,eyeLX,eyeRX}=G, r=Math.max(EP.w,EP.h)*.62+.5;
  Ln(b,eyeLX+r*.8,eyeY-.3,eyeRX-r*.8,eyeY-.3,frame,2);
  [-1,1].forEach(s=>{ const x=s<0?eyeLX:eyeRX; part(b,T=>{ E(T,x,eyeY,r,r*.9,(px,py,nx,ny)=>(!lens&&(nx*nx+ny*ny)<.55)?null:((nx*nx+ny*ny)<.62?lens:frame),SHS); if(pointy) Tr(T,x+s*r*.3,eyeY-r*.9,x+s*r*1.1,eyeY-r*.2,x+s*r*1.5,eyeY-r*1.35,frame); });
    Ln(b,x+s*r,eyeY-.3,x+s*(r+1.4),eyeY-.8,frame,2); if(lens) D(b,x-r*.35,eyeY-r*.35,'*'+(shineC||'#FFFFFF')); }); }
function wearFace(b,G,fit){ if(fit&&fit.face&&FACES[fit.face]) FACES[fit.face](b,G); }
/* Clothes cover the torso, between the neck and the top of the back legs. */
const CLOTHES={
  sweater:{fill:(x,y,G)=>alt2((y-G.neckY)*.7,'#D9403E','#FFFFFF')},
  raincoat:{fill:(x,y)=>Math.abs(x-22)<.35?'#C99A12':'#F4C542',extra(b,G){ [1.8,4,6.2].forEach(dy=>E(b,G.cx+1,G.neckY+dy,.5,.5,'#8A6A1E')); }},
  hoodie:{fill:()=>'#F2A7C0',extra(b,G){ R(b,G.cx-G.BD.rx*.45,G.bodyCy+G.BD.ry*.05,G.BD.rx*.9,2.6,'#E88AAA',SHS,.6); Ln(b,G.cx-1.4,G.neckY+.6,G.cx-1.4,G.neckY+3.6,'#FFFFFF',1); Ln(b,G.cx+1.4,G.neckY+.6,G.cx+1.4,G.neckY+3.6,'#FFFFFF',1); }},
  overalls:{fill:(x,y,G)=>y<G.bodyCy-G.BD.ry*.1&&Math.abs(x-22)>G.BD.rx*.4?null:'#5A86C0',extra(b,G){ [-1,1].forEach(s=>{ Ln(b,22+s*G.BD.rx*.4,G.neckY,22+s*G.BD.rx*.4,G.bodyCy-G.BD.ry*.1,'#4A70A8',3); E(b,22+s*G.BD.rx*.36,G.bodyCy-G.BD.ry*.1,.6,.6,'#F4C542'); }); }},
  pajamas:{fill:(x,y)=>(inC((x*1.1)%4,(y*1.1)%4,2,2,.55))?'#FFF3B0':'#8FB5E8'},
  bee:{fill:(x,y,G)=>alt2((y-G.neckY)*.55,'#2F2B35','#F4C542')},
  holiday:{fill:(x,y,G)=>{ const r=(y-G.neckY); if(Math.abs(r-3.2)<.6) return '#FFFFFF'; if(r>3.9&&r<6&&alt((x+r)*.9)) return '#D9403E'; return '#3E8A5A'; }},
  tuxedo:{fill:(x,y)=>Math.abs(x-22)<2.2?'#FFFFFF':'#2F2B35',extra(b,G){ E(b,22,G.neckY+2.4,.45,.45,'#2F2B35'); E(b,22,G.neckY+4.2,.45,.45,'#2F2B35'); Tr(b,20,G.neckY+.4,22,G.neckY+1.4,20,G.neckY+2.4,'#D9403E'); Tr(b,24,G.neckY+.4,22,G.neckY+1.4,24,G.neckY+2.4,'#D9403E'); }},
  dino:{fill:(x,y)=>Math.abs(x-22)<2.4?'#B8E0A0':'#5FA873'},
  cape:{fill:null},
  tutu:{fill:null}
};
function wearBehind(b,G,fit){ if(!fit) return; const {cx,BD,neckY}=G;
  if(fit.body==='cape') part(b,T=>{ Tr(T,cx-BD.rx*.5,neckY,cx+BD.rx*.5,neckY,cx-BD.rx-3,BD.cy+BD.ry+.6,'#D9403E',SH); Tr(T,cx-BD.rx*.5,neckY,cx+BD.rx*.5,neckY,cx+BD.rx+3,BD.cy+BD.ry+.6,'#D9403E',SH); E(T,cx,BD.cy+BD.ry*.4,BD.rx+2.4,BD.ry*.8,'#C0343A',SH); });
  if(fit.body==='bee') part(b,T=>[-1,1].forEach(s=>E(T,cx+s*(BD.rx+1.6),BD.cy-BD.ry*.35,3.2,2.2,'#E4F2FA',SHL)));
  if(fit.body==='dino') part(b,T=>{ for(let i=0;i<4;i++){ const y=BD.cy-BD.ry*.7+i*BD.ry*.45; [-1,1].forEach(s=>Tr(T,cx+s*BD.rx*.8,y-1.3,cx+s*BD.rx*.8,y+1.3,cx+s*(BD.rx+1.8),y,'#3E8A5A')); } });
}
function wearBody(b,G,fit){ if(!fit||!fit.body) return; const C=CLOTHES[fit.body]; if(!C) return; const {cx,BD,neckY}=G;
  if(C.fill) part(b,T=>{ E(T,cx,BD.cy,BD.rx+.3,BD.ry+.3,(x,y)=>C.fill(x,y,G),SH,neckY-.8,BD.cy+BD.ry*.5); if(C.extra) C.extra(T,G); });
  if(fit.body==='cape') part(b,T=>E(T,cx,neckY+.4,1.4,1.2,'#F4C542',SH));
  if(fit.body==='tutu') part(b,T=>E(T,cx,BD.cy+BD.ry*.42,BD.rx+2.6,2.3,(x,y,nx,ny)=>alt2(x*.9,'#F7B8CC','#F2A0BA'),SH));
  if(fit.body==='bee') part(b,T=>[-1,1].forEach(s=>{ Ln(T,cx+s*2,G.top+.8,cx+s*3.2,G.top-3,'#2F2B35',2); E(T,cx+s*3.3,G.top-3.3,.9,.9,'#2F2B35'); }));
  if(fit.body==='dino'&&!fit.hat) part(b,T=>{ for(let i=-2;i<=2;i++) Tr(T,22+i*2.3-1.1,G.top+1.4+Math.abs(i)*.4,22+i*2.3+1.1,G.top+1.4+Math.abs(i)*.4,22+i*2.3,G.top-1.6+Math.abs(i)*.5,'#3E8A5A',SH); });
}

/* ---- Building and caching pet sprites ---- */
const petCache=new Map();
const POSE0={eyes:'open',mouth:'smile',tail:1,ear:0,headDy:0};
const fitKey=f=>f?OUT_CATS.map(c=>f[c]||'').join('.'):'';
const pawsKey=p=>p?[-1,1].map(s=>p[s]?[p[s].x,p[s].y,p[s].ex,p[s].ey,p[s].lift||0,p[s].pad||0].join(','):'').join(';'):'';
function buildRear(b,o,P,S,fit){ const G=geoFor(P,o), cat=S.kind==='cat', H=P.head, hy=G.hy, sh=shapeOf(S);
  wearBehind(b,G,fit);
  part(b,T=>{ [-1,1].forEach(s=>{ const footY=P.paw.cy-frontStepLift(o.frame||0,s); capsule(T,22+s*P.paw.dx,P.body.cy,22+s*P.paw.dx,footY,P.paw.rx*.65,'fur',SH); E(T,22+s*P.paw.dx,footY,P.paw.rx,P.paw.ry,'paw',SHL); });
    E(T,22,P.body.cy,P.body.rx*.86,P.body.ry,'fur',SH); });
  wearBody(b,G,fit); wearNeck(b,G,fit);
  if(cat) part(b,T=>[-1,1].forEach(s=>Tr(T,22+s*H.rx*.9,hy-H.ry*.25,22+s*H.rx*.25,hy-H.ry*.8,22+s*H.rx*.65,hy-H.ry-P.ear.h*.8,'fur',SH)));
  else [-1,1].forEach(s=>dogEar(b,S.ears,s,22,hy,H,P,0));
  part(b,T=>E(T,22,hy,H.rx,H.ry,'fur',SH));
  if(!cat) [-1,1].forEach(s=>{ if(!['perk','bat'].includes(S.ears)) dogFlopEar(b,S.ears,s,22,hy,H,P,0); });
  if(sh.topknot) part(b,T=>E(T,22,hy-H.ry*.8,H.rx*.7,H.ry*.4,'fur',SH));
  part(b,T=>{ const sway=[0,1,-1][o.tail||0]; capsule(T,22,P.body.cy+P.body.ry*.55,22+sway*3,P.body.cy+(cat?-P.tail.len*.4:2),P.tail.r,'tail',SH); });
  wearHat(b,G,fit);
}
function getPet(style,sg,o,fit){
  o=Object.assign({},POSE0,o||{}); if(!STAGES.includes(sg)) sg=sg==='adult'?'adult':'baby';
  const S=STYLES[style]||STYLES.cream, key=[style,sg,o.eyes,o.mouth,o.tail,o.ear,o.headDy,o.rear?1:0,o.upright?1:0,o.upright?o.frame||0:0,pawsKey(o.paws),o.dull?1:0,o.bare?1:0,fitKey(fit)].join('|'); let c=petCache.get(key); if(c) return c;
  let P=breedP(PARAMS[S.kind][sg],S,style+':'+sg); const b=B(PET_W,PET_H,PET_OX,PET_OY);
  if(o.upright) P={...P,body:{...P.body,ry:P.body.ry*.78}};
  (o.rear?buildRear:S.kind==='dog'?buildDog:buildCat)(b,o,P,S,fit);
  const G=geoFor(P,o);
  c=finish(b,S.pal,{pattern:S.pattern,geo:G,dull:o.dull});
  if(petCache.size>900) petCache.clear(); petCache.set(key,c); return c;
}
/* Draw a pet with its 44 x 44 origin at (x, y). */
function drawPet(g,style,sg,o,fit,x,y){ blit(g,getPet(style,sg,o,fit),x-PET_OX,y-PET_OY); }
function paintPet(canvas,style,sg,o,fit){ const g=canvas.getContext('2d'); g.clearRect(0,0,canvas.lw,canvas.lh); drawPet(g,style,sg,o,fit,Math.round((canvas.lw-44)/2),canvas.lh-44); }
