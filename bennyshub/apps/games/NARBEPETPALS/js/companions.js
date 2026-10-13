'use strict';
/* ================= Companions and Rush's visits =================
   Companions are little friends who live in the pet's home. The first one is picked when the pet
   becomes a teen and a second when it becomes a grown-up. Each starts as a baby and grows up on its
   own as the pet earns paw prints (faster or slower with Growing Up Speed): a tadpole becomes a frog,
   an egg becomes a butterfly or a bird, a baby bunny a rabbit, a puppy a dog, a kitten a cat.
   Companions are not choices in the room: they just live there, sleep at night, cheer when the pet
   plays, and have little moments of their own now and then.
   Rush, an Australian cattle dog helper (an alert dog), visits now and then to check on the player:
   "How are you feeling?" Happy, tired, or "I need help", which calls for a helper out loud. */

/* ---- The kinds of companion ---- */
const COMP={
  frog:{label:'Tadpole to Frog',icon:'🐸',stages:['tadpole','tadpole with legs','froglet','frog'],names:['Hopper','Lily','Puddle','Dot'],looks:1,
    say:'Starts as a tiny tadpole swimming in a water bowl. It grows little legs, turns into a froglet, and grows up into a frog.',
    journey:'grow little legs, turn into a froglet, and grow up into a frog',
    grow:[null,n=>`Look! ${n} grew little back legs!`,n=>`${n} lost most of its tail. ${n} is a froglet now!`,n=>`${n} grew up into a frog! Ribbit!`],
    moment:[[n=>`${n} the tadpole wiggles around the water bowl.`],[n=>`${n} kicks its new little legs. Swish, swish!`],[n=>`${n} the froglet hops onto the lily pad!`],[n=>`${n} says ribbit!`,(n,p)=>`${n} and ${p} look at each other. Ribbit!`]]},
  butterfly:{label:'Caterpillar to Butterfly',icon:'🦋',stages:['butterfly egg','caterpillar','chrysalis','butterfly'],names:['Flutter','Sunny','Petal','Skye'],looks:3,
    say:'Starts as a tiny egg on a milkweed leaf. It hatches into a stripy caterpillar, makes a green and gold chrysalis, and comes out as a big, beautiful orange and black monarch butterfly.',
    journey:'hatch into a stripy caterpillar, make a green and gold chrysalis, and come out as a big, beautiful orange and black monarch butterfly',
    grow:[null,n=>`The egg hatched! ${n} is a tiny caterpillar now.`,n=>`${n} made a chrysalis. Something special is happening inside!`,n=>`${n} came out of the chrysalis. ${n} is a butterfly!`],
    moment:[[n=>`The tiny egg rests on its milkweed leaf. ${n} will hatch soon.`],[n=>`Munch, munch! ${n} inches along, eating its leaf.`],[n=>`The chrysalis wiggled! ${n} is changing inside.`],[n=>`${n} flutters around the room!`,(n,p)=>`${n} flutters over to say hi to ${p}.`]]},
  bunny:{label:'Baby Bunny to Rabbit',icon:'🐰',stages:['baby bunny','little bunny','young rabbit','rabbit'],names:['Clover','Hazel','Cotton','Nibbles'],looks:3,
    say:'Starts as a tiny baby bunny on a soft cushion. It grows into a little bunny, then a young rabbit, then a big rabbit with long ears.',
    journey:'grow into a little bunny, then a young rabbit, then a big rabbit',
    grow:[null,n=>`${n} opened its eyes and hopped! ${n} is a little bunny now.`,n=>`${n}'s ears grew long. ${n} is a young rabbit!`,n=>`${n} grew up into a big rabbit!`],
    moment:[[n=>`${n} the baby bunny is having a cozy nap.`],[n=>`${n} does a tiny hop!`],[n=>`${n} twitches its nose. Sniff, sniff.`],[n=>`${n} does a happy bunny hop!`,(n,p)=>`${n} wiggles its nose at ${p}.`]]},
  bird:{label:'Egg to Bird',icon:'🐦',stages:['egg','hatchling','baby bird','fledgling','bird'],names:['Chirp','Sky','Peep','Birdie'],looks:3,
    say:'Starts as an egg in a cozy nest. It hatches into a hatchling, grows into a fluffy baby bird, then a fledgling learning to flap, and grows up into a bird.',
    journey:'hatch, grow fluffy feathers, learn to flap, and grow up into a bird',
    grow:[null,n=>`Crack! The egg hatched. Say hello to ${n}, the hatchling!`,n=>`${n} grew soft, fluffy feathers. ${n} is a baby bird now.`,n=>`${n} is a fledgling now, flapping its little wings!`,n=>`${n} grew up into a beautiful bird!`],
    moment:[[n=>`The egg wobbled! ${n} is getting ready to hatch.`],[n=>`Peep, peep! ${n} is a hungry little hatchling.`],[n=>`${n} fluffs up its soft feathers.`],[n=>`${n} flaps its wings, practicing to fly.`],[n=>`${n} sings a happy song!`,(n,p)=>`${n} sings a song for ${p}.`]]},
  dog:{label:'Puppy to Dog',icon:'🐶',pet:'dog',stages:['puppy','teen pup','grown-up dog','senior dog'],names:['Biscuit','Scout','Pepper','Buddy'],
    say:'Starts as a little puppy on a small bed. It grows into a teen pup, then a grown-up dog, and one day a wise senior dog.',
    journey:'grow into a teen pup, then a grown-up dog, and one day a senior dog',
    grow:[null,n=>`${n} grew into a teen pup!`,n=>`${n} is a grown-up dog now!`,n=>`${n} is a senior dog now. Wise, gentle, and still so loved.`],
    moment:[[n=>`${n} the puppy chases its tail.`],[(n,p)=>`${n} wants to play with ${p}!`],[(n,p)=>`${n} and ${p} are best buddies.`],[n=>`${n} stretches out for a cozy rest.`]]},
  cat:{label:'Kitten to Cat',icon:'🐱',pet:'cat',stages:['kitten','teen cat','grown-up cat','senior cat'],names:['Mittens','Pumpkin','Socks','Luna'],
    say:'Starts as a little kitten on a small bed. It grows into a teen cat, then a grown-up cat, and one day a wise senior cat.',
    journey:'grow into a teen cat, then a grown-up cat, and one day a senior cat',
    grow:[null,n=>`${n} grew into a teen cat!`,n=>`${n} is a grown-up cat now!`,n=>`${n} is a senior cat now. Calm, cozy, and still so loved.`],
    moment:[[n=>`${n} the kitten pounces on a dust bunny.`],[n=>`${n} is washing its paws.`],[(n,p)=>`${n} purrs next to ${p}.`],[n=>`${n} curls up for a cozy nap.`]]}
};
const COMP_ORDER=['frog','butterfly','bunny','bird','dog','cat'];
const COMP_STEP={slow:30,medium:15,quick:10};
const compStep=()=>COMP_STEP[gs.grow]||COMP_STEP.medium;
const comps=()=>state&&Array.isArray(state.companions)?state.companions:[];
const compMax=c=>COMP[c.type].stages.length-1;
const compStageWord=(c,s)=>COMP[c.type].stages[s==null?c.stage:s];
const compDue=c=>Math.min(compMax(c),Math.max(0,Math.floor((state.hearts-c.at)/compStep())));
function compNext(c){ if(c.stage>=compMax(c)) return null; return {word:compStageWord(c,c.stage+1),left:Math.max(1,c.at+(c.stage+1)*compStep()-state.hearts)}; }
const aOrAn=w=>(/^[aeiou]/i.test(w)?'an ':'a ')+w;
SOUND_DEFS.ribbit=[{f:260,f2:190,dur:.09,gain:.2,type:'triangle'},{f:300,f2:210,dur:.11,gain:.22,type:'triangle',when:.12}];
SOUND_DEFS.peep=[{f:3200,f2:3800,dur:.06,gain:.12},{f:3300,f2:3900,dur:.06,gain:.12,when:.12}];

/* ---- Pictures ---- */
const CSPR={};
const cspr=(key,w,h,fn)=>CSPR[key]||(CSPR[key]=sprite(w,h,fn));
function compEyes(b,pts,r,closed){ pts.forEach(([x,y])=>{ if(closed){ Ln(b,x-r,y+.2,x+r,y+.2,'#1E1614',1); return; } E(b,x,y,r,r*1.12,'#1E1614'); D(b,x-r*.35,y-r*.45,'*#FFFFFF'); }); }
const FROG_BOWL=()=>cspr('bowl',22,15,b=>{ part(b,T=>E(T,11,8.6,10.4,6.4,(x,y)=>y<5.6?'#E6F6FC':'#7CC6EA',SHS)); part(b,T=>R(T,2.2,1.4,17.6,2.2,'#F4FBFF',SHS,1));
  [[6,12.6,'#C9A06A'],[9.4,13.4,'#8AA0B0'],[13.6,13,'#D8B88A'],[16.4,12.2,'#9AB090']].forEach(([x,y,c])=>E(b,x,y,1.3,.9,c)); Ln(b,3.6,6.4,4.4,10.4,'*#FFFFFF',1); });
function frogSpr(big,f){ const k=big?1:.66; return cspr('frog'+big+f,Math.ceil(15*k),Math.ceil(11*k),b=>{ const X=v=>v*k;
  part(b,T=>{ E(T,X(2),X(8.6),X(2.4),X(1.5),'#5FAE4E',SH); E(T,X(12.4),X(8.6),X(2.4),X(1.5),'#5FAE4E',SH); });
  part(b,T=>{ E(T,X(7.2),X(6.6),X(5.4),X(3.4),'#6FBF5A',SH); E(T,X(4.6),X(3.2),X(2),X(2),'#6FBF5A',SH); E(T,X(9.8),X(3.2),X(2),X(2),'#6FBF5A',SH); });
  E(b,X(7.2),X(7.9),X(3.4),X(1.7),'#D8F0A8'); if(f==='p') part(b,T=>E(T,X(7.2),X(8.8),X(2.8),X(1.8),'#EEF8D0',SHS));
  part(b,T=>{ E(T,X(4.2),X(9.6),X(1.4),X(.7),'#6FBF5A'); E(T,X(10.2),X(9.6),X(1.4),X(.7),'#6FBF5A'); });
  compEyes(b,[[X(4.6),X(3)],[X(9.8),X(3)]],big?1:.75,f==='s'); if(f!=='p') [[6.2,5.6],[7.2,5.9],[8.2,5.6]].forEach(([x,y])=>D(b,X(x),X(y),'#2E5A24'));
  if(!big) part(b,T=>E(T,X(1.4),X(6),X(1.6),X(.8),'#6FBF5A')); }); }
function drawTadpole(x,y,now,legs,dir){ const w=Math.sin(now/110)*1.3; pxLine(ctx,x-dir*1.4,y,x-dir*4.6,y+w,'#3E5A32',.8); pxEll(ctx,x,y,legs?2.1:1.7,legs?1.5:1.25,'#2E3A24');
  rect(ctx,x+dir*.7-.25,y-.7,.5,.5,'#FFFFFF'); if(legs){ pxLine(ctx,x-dir*1.2,y+1,x-dir*2.6,y+2.1,'#2E3A24',.6); pxLine(ctx,x-dir*.2,y+1.2,x-dir*1.2,y+2.3,'#2E3A24',.6); } }
/* The butterfly lives on a little potted milkweed plant: a pearly egg on a leaf, a cute striped
   monarch caterpillar inching along a leaf, a slim jade chrysalis with a gold crown hanging under a leaf, then a
   big butterfly perched on the flowers at the top. */
/* Always a monarch: orange wings with black veins and black borders dotted with white. The three looks
   are just slightly different oranges, so older saves (look 0-2) still work. */
const BFLY=[{main:'#F07A12',inner:'#F9A640',edge:'#1E1614'},{main:'#E8650E',inner:'#F49A3A',edge:'#1E1614'},{main:'#F58A1C',inner:'#FBB858',edge:'#1E1614'}];
const leafShape=(T,x,y,rx,ry,sd,c)=>{ E(T,x,y,rx,ry,c,SH); Tr(T,x+sd*rx*.55,y-ry*.85,x+sd*rx*.55,y+ry*.85,x+sd*(rx+2.4),y+ry*.15,c,SH); };
const BF_PLANT=()=>cspr('bfplant2',26,24,b=>{
  Ln(b,13,21,13,5,'#4E8A3E',2); Ln(b,13,15,8,12.4,'#4E8A3E',2); Ln(b,13,12,18,10,'#4E8A3E',2);
  part(b,T=>leafShape(T,7,12.2,5.2,2.3,-1,'#5FA84E')); Ln(b,2,12.4,11.6,12,'#3E7A34',1);
  part(b,T=>leafShape(T,19,10,5,2.2,1,'#6FB85A')); Ln(b,14.6,10.1,24,10,'#3E7A34',1);
  part(b,T=>leafShape(T,13,16.6,3.4,1.5,1,'#5FA84E'));
  part(b,T=>[[11.4,4.6],[13,3.6],[14.6,4.6],[12,6],[14,6],[13,5]].forEach(([x,y])=>E(T,x,y,1.3,1.3,'#F49AC0',SHS))); [[11.4,4.4],[13,3.4],[14.6,4.4],[13,5]].forEach(([x,y])=>D(b,x,y,'#FFE27A'));
  part(b,T=>R(T,8.2,18.6,9.6,5.4,'#C9744A',SH,1.2)); part(b,T=>R(T,7.4,18,11.2,1.9,'#D8885A',SH,.6)); E(b,13,18.4,4.4,.6,'#5A3A20'); });
const BF_EGG=()=>cspr('bfegg2',5,6,b=>{ part(b,T=>E(T,2.5,3.4,1.8,2.4,'#FFF6DE',SH)); [1.7,2.5,3.3].forEach(x=>Ln(b,x,1.8,x,5,'#E4D6AE',1)); D(b,2.5,.9,'#E4D6AE'); D(b,1.8,2.4,'*#FFFFFF'); });
function bfCatSpr(f){ return cspr('bfcat2'+f,17,8,b=>{ const up=f==='b', hump=[0,0,.8,1.6,.8,0,0];
  /* a monarch caterpillar: bands of yellow, black and white, black feet, and black feelers at both ends */
  const band=['#F4D020','#1E1614','#FFFFFF','#1E1614'];
  Ln(b,2.2,4.4-(up?hump[0]:0),.6,2,'#1E1614',1); Ln(b,2.8,4.2-(up?hump[0]:0),2,1.8,'#1E1614',1);
  part(b,T=>{ for(let i=0;i<7;i++){ E(T,2+i*1.6,5.4-(up?hump[i]:0),1.45,1.45,band[i%4],SH); } E(T,14,4.6,2,1.9,'#FFF6E0',SH); });
  for(let i=0;i<7;i++) D(b,2+i*1.6,6.9,'#1E1614');
  R(b,12.4,2.9,3.2,.7,'#1E1614'); E(b,14.8,4.3,.55,.6,'#1E1614'); D(b,14.6,4,'*#FFFFFF'); D(b,15.4,5.4,'#1E1614'); D(b,14.9,5.7,'#1E1614'); E(b,13.6,5.4,.5,.3,'#F4A0B0');
  Ln(b,14,2.8,13.2,.6,'#1E1614',1); Ln(b,14.8,2.8,15.8,.6,'#1E1614',1); }); }
function bfChrysSpr(f){ return cspr('bfchr2'+f,7,11,b=>{ const dx=f==='b'?.4:0; Ln(b,3.5,0,3.5+dx*.5,1.4,'#1E1614',1);
  part(b,T=>{ E(T,3.5+dx,5,2.4,3.3,'#7FCFA0',SH); Tr(T,1.4+dx,6.4,5.6+dx,6.4,3.5+dx,10.4,'#7FCFA0',SH); E(T,3.5+dx,2,1.3,1,'#7FCFA0'); });
  R(b,1.3+dx,3,4.4,.5,'#2A1E1A'); [1.8,2.8,3.8,4.8].forEach(x=>D(b,x+dx,3.1,'#F4C542')); [[2.2,6.6],[4.8,6.6],[3.5,8.4]].forEach(([x,y])=>D(b,x+dx,y,'#F4C542')); Ln(b,2.4+dx,4,2.4+dx,6.4,'*#D8F6E4',1); }); }
/* A big butterfly with pointed forewings, round hindwings, dark veined borders with white dots, and a
   slim spotted body with curled antennae. f: o open, h half, c closed (the wings flap by narrowing). */
function bflySpr(look,f){ const L=BFLY[look]||BFLY[0], k={o:1,h:.58,c:.2}[f]||1; return cspr('bf2'+look+f,36,24,b=>{ const cx=18, X=d=>cx+d*k;
  const fore=(sd,ins,c)=>{ const P=[[1,6.4],[16,1],[14.6,10.8],[1.2,11.8]], mx=8, my=7.4; const Q=P.map(([x,y])=>[X(sd*(mx+(x-mx)*(1-ins))),my+(y-my)*(1-ins)]);
    part(b,T=>{ Tr(T,Q[0][0],Q[0][1],Q[1][0],Q[1][1],Q[2][0],Q[2][1],c,ins?SH:null); Tr(T,Q[0][0],Q[0][1],Q[2][0],Q[2][1],Q[3][0],Q[3][1],c,ins?SH:null); }); };
  const hind=(sd,ins,c)=>part(b,T=>E(T,X(sd*6.8),15.4,Math.max(.4,(6.2-ins)*k),5.6-ins,c,ins?SH:null));
  [-1,1].forEach(sd=>{ hind(sd,0,L.edge); hind(sd,1.3,L.main); part(b,T=>E(T,X(sd*4.6),14.2,Math.max(.3,2.6*k),2.8,L.inner)); });
  [-1,1].forEach(sd=>{ fore(sd,0,L.edge); fore(sd,.2,L.main); part(b,T=>E(T,X(sd*5),7.6,Math.max(.3,3*k),2.4,L.inner)); });
  if(k>.5) [-1,1].forEach(sd=>{ [[12.6,3],[13.4,6.6],[11.8,9.6]].forEach(([x,y])=>Ln(b,X(sd*1.6),7.6,X(sd*x),y,L.edge,1)); [[9.6,14],[10,17.6],[6.6,20]].forEach(([x,y])=>Ln(b,X(sd*1.6),12.4,X(sd*x),y,L.edge,1));
    [[14.4,2.4],[15,4.6],[14.8,7],[14.4,9.4],[11.6,20.2],[8.4,21],[12.8,17.6]].forEach(([x,y])=>D(b,X(sd*x),y,'*#FFFFFF')); });
  part(b,T=>{ E(T,cx,8.4,1.5,2.4,'#2A1E1A'); E(T,cx,14.4,1.05,4.8,'#2A1E1A'); E(T,cx,5.3,1.35,1.25,'#2A1E1A'); }); [11.6,13.6,15.6,17.4].forEach(y=>D(b,cx,y,'*#FFFFFF'));
  Ln(b,cx-.6,4.4,cx-3,1.4,'*#2A1E1A',1); Ln(b,cx-3,1.4,cx-4.6,.8,'*#2A1E1A',1); Ln(b,cx+.6,4.4,cx+3,1.4,'*#2A1E1A',1); Ln(b,cx+3,1.4,cx+4.6,.8,'*#2A1E1A',1); E(b,cx-4.8,.9,.55,.55,'*#2A1E1A'); E(b,cx+4.8,.9,.55,.55,'*#2A1E1A'); }); }
const NEST_BACK=()=>cspr('nestB',20,8,b=>{ part(b,T=>E(T,10,4.4,9.4,3.4,(x,y)=>alt(x*1.2+y*.8)?'#A0703F':'#8A5A34',SH)); E(b,10,2.8,6.8,1.3,'#6A4428'); });
const NEST_FRONT=()=>cspr('nestF',20,8,b=>{ part(b,T=>E(T,10,4.4,9.4,3.4,(x,y)=>alt(x*1.2+y*.8)?'#A0703F':'#8A5A34',SH,3.6)); [[1.6,3.6,0,2.4],[17.8,3.4,19.8,2.2],[6,7.2,4.6,7.9]].forEach(([x0,y0,x1,y1])=>Ln(b,x0,y0,x1,y1,'#7A4A24',1)); });
const BIRD=[['#5A8FD8','#F4A06A'],['#D9403E','#F2A08A'],['#F4D24A','#FFF3B0']];
function birdSpr(stage,look,f){ const [c1,c2]=BIRD[look]||BIRD[0], s=f==='s'; return cspr('bird'+stage+look+f,15,14,b=>{
  if(stage===0){ part(b,T=>E(T,7.5,9.4,2.6,3.2,'#CDE8F4',SH)); [[6.8,8.2],[8.2,9.6],[7,10.8],[8.4,7.6]].forEach(([x,y])=>D(b,x,y,'#8AA8C0')); return; }
  if(stage===1){ part(b,T=>{ E(T,7.5,10.4,3.8,2.8,'#F2B8A8',SH); E(T,7.5,7.8,2.9,2.5,'#F2B8A8',SH); }); [[6.4,5.4],[7.6,5],[8.6,5.5]].forEach(([x,y])=>D(b,x,y,'*#C8C0C0'));
    Ln(b,5.6,7.4,6.6,7.6,'#6A4A40',1); Ln(b,8.4,7.6,9.4,7.4,'#6A4A40',1);
    if(f==='b'){ part(b,T=>{ Tr(T,6.2,8.8,8.8,8.8,7.5,7.6,'#F4C542'); Tr(T,6.2,9,8.8,9,7.5,11,'#F4C542'); }); E(b,7.5,9.1,.7,.45,'#D9403E'); } else part(b,T=>Tr(T,6.4,8.7,8.6,8.7,7.5,10.2,'#F4C542')); return; }
  if(stage===2){ part(b,T=>{ E(T,7.5,10,4.6,3.4,'#B8B8C8',SH); E(T,7.5,6.8,3,2.7,'#B8B8C8',SH); }); part(b,T=>E(T,4.8,10.2,1.6,2,'#A0A0B4',SHS)); [[6.6,4],[7.6,3.7],[8.4,4.1]].forEach(([x,y])=>D(b,x,y,'*#E6E6EE'));
    compEyes(b,[[6.3,6.6],[8.7,6.6]],.6,s); part(b,T=>Tr(T,6.8,7.8,8.2,7.8,7.5,8.9,'#F4C542')); return; }
  const big=stage===4, body=big?c1:mix(c1,'#B8B8C8',.5), up=f==='b';
  part(b,T=>Tr(T,big?1:2,big?10.4:10.2,big?4.6:5,big?8.4:8.6,big?4.4:4.8,big?11.2:10.8,body,SHS));
  part(b,T=>{ E(T,7.2,9,big?4.2:3.6,big?3.4:3.2,body,SH); E(T,8.4,5.2,big?2.9:2.6,big?2.7:2.5,body,SH); });
  part(b,T=>E(T,8,10,big?2.6:2.2,big?2.2:2,big?c2:mix(c2,'#E6E6EE',.5),SHS));
  part(b,T=>E(T,up?5.4:5.8,up?6.8:9,big?2.6:2.2,up?1.4:1.8,shade(body,-.12),SHS));
  compEyes(b,[[9.2,4.8]],.62,s); part(b,T=>f==='m'?(Tr(T,10.8,4.6,13,4.2,11,5.2,'#F08A2A'),Tr(T,10.8,5.6,12.8,6.4,11,5.2,'#F08A2A')):Tr(T,10.8,4.8,13,5.4,10.8,6,'#F08A2A'));
  if(!big) D(b,8.2,2.6,'*#E6E6EE'); Ln(b,6.6,12,6.2,13.8,'#C98A3A',1); Ln(b,8.4,12,8.6,13.8,'#C98A3A',1); }); }
const SHELL=()=>cspr('shell',6,4,b=>part(b,T=>{ E(T,3,2.6,2.6,1.6,'#F4F8FA',SH,1.6); Tr(T,.6,1.8,2,1.8,1.3,.6,'#F4F8FA'); Tr(T,2.4,1.8,3.8,1.8,3.1,.4,'#F4F8FA'); Tr(T,4,1.8,5.4,1.8,4.7,.7,'#F4F8FA'); }));
const BUNNY=[['#B08560','#F4E8D8'],['#F6F4F0','#FFFFFF'],['#A8A4AC','#E8E6EC']];
function bunnySpr(stage,look,f){ const [fur,lt]=BUNNY[look]||BUNNY[0], s=f==='s'; return cspr('bun'+stage+look+f,15,19,b=>{
  if(stage===0){ part(b,T=>E(T,8.4,15.6,4.4,2.6,fur,SH)); part(b,T=>E(T,12.6,15.4,1.1,1.1,lt,SHS));
    part(b,T=>{ E(T,7.6,12.7,2.7,.95,fur,SH); E(T,8,13.7,2.4,.85,fur,SH); }); E(b,7.8,12.7,1.8,.4,'#F2A9B4');
    part(b,T=>E(T,4.8,14.6,2.9,2.5,fur,SH)); E(b,4.6,15.6,1.7,1.1,lt); Ln(b,3.4,14.2,4.6,14.4,'#4A3A30',1); D(b,2.2,15.2,'#F07A8E'); E(b,4.4,15.6,.7,.45,'#F4B6C6'); return; }
  const k=[0,.62,.8,1][stage], cx=7.5, base=18.6;
  part(b,T=>{ E(T,cx-2.1*k,base-9.8*k-4.6*k,1.25*k+.3,(stage===1?2.4:4.3)*k,fur,SH); E(T,cx+2.1*k,base-9.8*k-4.6*k,1.25*k+.3,(stage===1?2.4:4.3)*k,fur,SH); });
  E(b,cx-2.1*k,base-14.4*k,.5*k+.1,(stage===1?1.6:3)*k,'#F2A9B4'); E(b,cx+2.1*k,base-14.4*k,.5*k+.1,(stage===1?1.6:3)*k,'#F2A9B4');
  part(b,T=>{ E(T,cx,base-4.4*k,5.6*k,4.4*k,fur,SH); E(T,cx,base-9.8*k,4*k,3.5*k,fur,SH); });
  E(b,cx,base-3.8*k,3.4*k,3*k,lt); E(b,cx-3.4*k,base-.6*k,2*k,1*k,lt); E(b,cx+3.4*k,base-.6*k,2*k,1*k,lt);
  compEyes(b,[[cx-1.6*k,base-10.4*k],[cx+1.6*k,base-10.4*k]],.62*k+.15,s); D(b,cx+(f==='b'?.3:0),base-8.8*k,'#F07A8E'); E(b,cx-2.6*k,base-8.8*k,.9*k,.6*k,'#F4B6C6'); E(b,cx+2.6*k,base-8.8*k,.9*k,.6*k,'#F4B6C6'); }); }
const CUSHION=()=>cspr('cush',24,7,b=>{ part(b,T=>E(T,12,4,11.4,2.9,'#B89AD8',SH)); E(b,12,3.2,8.8,1.5,'#CDB6EA'); [[6,3.6],[12,3],[18,3.6]].forEach(([x,y])=>D(b,x,y,'#9A7AC0')); });
const COMP_FOOT={frog:[23,24],butterfly:[26,32],bunny:[24,21],bird:[20,23],dog:[24,27],cat:[24,27]};

/* Draw a companion standing at (fx, fy): its home, then itself. now drives its little movements;
   m holds what it is doing: {sleep, cheer, act, e, still}. */
function drawComp(c,stage,fx,fy,now,m){ m=m||{}; const T=COMP[c.type]; if(!T) return; const sl=!!m.sleep, act=m.act, e=m.e||0;
  const fr=m.still?'a':sl?'s':(Math.floor(now/650)%2?'a':'b'), hop=m.cheer?-Math.abs(Math.sin(now/170))*2:0;
  if(!m.still) softShadow(ctx,fx,fy-.6,COMP_FOOT[c.type][0]*.48,1.8,.26);
  if(c.type==='frog'){ blit(ctx,FROG_BOWL(),fx-11,fy-15);
    if(stage<=1){ const t=(m.still?1.2:now/1000)*(act?2.6:1), tx=fx+Math.sin(t*.9)*5.4, ty=fy-6+Math.sin(t*1.7)*1.3; drawTadpole(tx,ty,now,stage===1,Math.cos(t*.9)>=0?1:-1); }
    else if(stage===2){ const jy=act?Math.round(arc(ph(e%1400,200,900),6)):hop; pxEll(ctx,fx+2,fy-9.8,4.6,1.3,INK); pxEll(ctx,fx+2,fy-9.8,4,1,'#5FA873'); blit(ctx,frogSpr(0,sl?'s':'a'),fx+2-5,fy-9.8-6.6+jy); }
    else { const jy=act&&e>2200&&e<3000?Math.round(arc(ph(e,2200,3000),7)):hop, f=sl?'s':(act&&e<2200&&Math.floor(e/260)%2)?'p':'a'; blit(ctx,frogSpr(1,f),fx-7.5,fy-12.4-11+jy); }
    return; }
  if(c.type==='butterfly'){ const ox=fx-13, oy=fy-24; blit(ctx,BF_PLANT(),ox,oy);
    if(stage===0) blit(ctx,BF_EGG(),ox+17.5,oy+2);
    else if(stage===1){ const t=Math.floor(now/(act?250:700)), inch=m.still?0:(t%4)*.5; blit(ctx,bfCatSpr(m.still?'a':(t%2?'b':'a')),ox-1+inch,oy+3); }
    else if(stage===2) blit(ctx,bfChrysSpr(!m.still&&(act?Math.floor(e/160)%2:now%4200<500&&Math.floor(now/160)%2)?'b':'a'),ox+18.5,oy+11.6);
    else if(!m.away){ let bx=ox+13, by=oy+4.4, f=sl?'c':m.still?'o':(now%3200<300?'h':now%3200<600?'c':now%3200<900?'h':'o');
      if(act){ const k=ph(e,300,3900); if(k>0&&k<1){ bx+=Math.sin(k*TAU*2)*22; by+=-Math.abs(Math.sin(k*Math.PI))*18-Math.sin(k*TAU*4)*2; f=['o','h','c','h'][Math.floor(e/90)%4]; } }
      else if(m.cheer){ by-=2+Math.abs(Math.sin(now/200))*3; f=['o','h','c','h'][Math.floor(now/90)%4]; }
      blit(ctx,bflySpr(c.look,f),bx-18,by-17); }
    return; }
  if(c.type==='bird'){ blit(ctx,NEST_BACK(),fx-10,fy-8); let f=sl?'s':'a', dx=0, dy=hop;
    if(stage===0){ if(act||now%5200<500) dx=Math.sin(now/45)*.6; }
    if(stage===1){ f=sl?'a':(act?(Math.floor(e/220)%2?'b':'a'):(now%3000<700?'b':'a')); }
    if(stage===3){ f=sl?'s':(act?(Math.floor(e/140)%2?'b':'a'):(now%2600<500?'b':'a')); }
    if(stage===4){ f=sl?'s':(act&&Math.floor(e/300)%2?'m':'a'); if(act&&e>900&&e<1700) dy=Math.round(arc(ph(e,900,1700),4)); }
    const y0=stage>=3?fy-8-12.2:fy-8-9.6; if(!m.away) blit(ctx,birdSpr(stage,c.look,f),fx-7.5+dx,y0+dy); if(stage===1) blit(ctx,SHELL(),fx+4.6,fy-9.4);
    blit(ctx,NEST_FRONT(),fx-10,fy-8); return; }
  blit(ctx,CUSHION(),fx-12,fy-7);
  if(c.type==='bunny'){ const jy=act&&stage>0?Math.round(arc(ph(e%1500,300,900),stage===3?6:3)):hop; blit(ctx,bunnySpr(stage,c.look,sl||stage===0?'s':(now%1800<260||act?'b':'a')),fx-7.5,fy-2.6-18.6+jy); return; }
  const sg=STAGES[stage], k=.56, o={eyes:sl?'closed':(now%4300<150?'closed':m.cheer||act?'happy':'open'),mouth:m.cheer||act?'tongue':'smile',tail:m.still?0:[0,1,0,2][Math.floor(now/(act||m.cheer?120:400))%4],ear:0,headDy:0};
  if(!STYLES[c.look]) return; ctx.save(); ctx.translate(fx,fy-2.4+hop+(act&&stage<2?Math.round(arc(ph(e%1200,200,700),3)):0)); ctx.scale(k,k); drawPet(ctx,c.look,sg,o,null,-22,-43.5); ctx.restore(); }
/* A companion for a photo or a picture strip: still, awake. */
const drawCompStill=(c,stage,x,y)=>drawComp(c,stage,x,y,0,{still:true});

/* ---- Where companions live in the room ----
   Each companion gets a spot on the floor near the pet that is clear of the pet, the care stations,
   the bed, the floor decorations, every chore spot, the caption and the buttons. When the floor is
   full (a crowded screen shape), a companion sits on a little wall shelf instead, in a stretch of wall
   where nothing can be hung. Bunnies, puppies and kittens get the floor first; a frog bowl, bug jar or
   nest moves up to the shelf before they do.
   The spot is worked out again when the screen changes shape or the room is rearranged. */
const SHELF_OK={frog:1,butterfly:1,bird:1};
let compSpotCache={key:null,spots:[]};
function compOccupied(){ const occ=[], add=(r,pad)=>{ if(r) occ.push([r[0]-pad,r[1]-pad,r[2]+pad*2,r[3]+pad*2]); };
  add([42,32,44,59],0);
  [['feed',14,8],['water',14,8],['basket',17,16],['bath',17,15]].forEach(([id,w,h])=>add([STATION[id][0],STATION[id][1]-7,w,h+7],1.5));
  try{ add(bedRect(),1.5); }catch(e){}
  try{ const id=room().spots.floorR; if(id&&DECOR[id]){ const p=itemPos(id,'floorR'); add([p.x,p.y,DECOR[id].w,DECOR[id].h],1.5); } }catch(e){}
  add([2+FIX.dx,77+(FIX.dy||0),27,17],1.5);
  (typeof TOY_SPOTS!=='undefined'?TOY_SPOTS:[]).forEach(([s,x,y])=>{ const sp=SPR[s]; if(sp) add([x,y-4,sp.lw,sp.lh+4],1); });
  try{ const pa=plantAnchor(); if(pa) add([pa.x-13,pa.y+15,32,17],1); }catch(e){}
  TARGETS.forEach(t=>{ if(t.id==='task') return; const r=t.rect&&t.rect(); if(r&&r[1]+r[3]>62&&r[2]<60) add([r[0],r[1]-6,r[2],r[3]+6],1); });
  return occ; }
function compSpots(){ const cs=comps(); if(!cs.length) return [];
  /* On the floor grid (arrange.js), each companion has its own spot. */
  if(typeof gridPosOf==='function'&&cs.every(c=>gridPosOf('c:'+c.type))) return cs.map(c=>{ const p=gridPosOf('c:'+c.type); return {x:p.cx,y:p.feet,shelf:false,k:1}; });
  const key=[STAGE.s,VIEW.w,VIEW.h,roomRev,cs.map(c=>c.type).join()].join('|');
  if(compSpotCache.key===key||(layer!=='game'&&compSpotCache.spots.length===cs.length)) return compSpotCache.spots;
  const s=STAGE.s, fr=freeRect(true), cx=64-(fr.x+fr.w/2-STAGE.left)/s, cy=(96*s<=fr.h+2?48:48)-(fr.y+fr.h/2)/s;
  const X0=cx+(fr.x-STAGE.left)/s+2, X1=cx+(fr.x+fr.w-STAGE.left)/s-2, Y0=cy+fr.y/s+1, Y1=Math.min(cy+(fr.y+fr.h)/s-1,VIEW.y+VIEW.h-1);
  const occ=compOccupied(), hit=(r,list)=>list.some(o=>r[0]<o[0]+o[2]&&r[0]+r[2]>o[0]&&r[1]<o[1]+o[3]&&r[1]+r[3]>o[1]), spots=[];
  /* On the wall, only what is really hanging there (and the furniture against it) is in the way. */
  const wall=[[STATION.door[0]-1,STATION.door[1]-1,18,42]], rs=room().spots;
  SPOTS.forEach(sp=>{ const id=rs[sp.id]; if(!id||!DECOR[id]||!['wall','back','ceil'].includes(sp.zone)) return; const p=itemPos(id,sp.id), d=DECOR[id]; wall.push([p.x-1,p.y-1,(sp.zone==='ceil'?128:d.w)+2,(sp.zone==='ceil'?10:d.h)+2]); });
  const order=cs.map((c,i)=>i).sort((a,b)=>(SHELF_OK[cs[a].type]?1:0)-(SHELF_OK[cs[b].type]?1:0)), placed=[];
  order.forEach(i=>{ const c=cs[i], other=placed[0]; let best=null, w, h;
    const floor=(list,k)=>{ for(let fy=62.5;fy<=Y1;fy+=1.5) for(let x=X0+w/2;x<=X1-w/2;x+=1){ const r=[x-w/2,fy-h,w,h]; if(r[1]<Y0||hit(r,list)) continue;
      let sc=Math.abs(x-64)+Math.abs(fy-88)*2; if(other&&!other.shelf&&Math.sign(x-64)===Math.sign(other.x-64)) sc+=40; if(!best||sc<best.sc) best={x,y:fy,sc,k}; } };
    const shelf=k=>{ for(let fy=28;fy<=58;fy+=1.5) for(let x=X0+w/2+2;x<=X1-w/2-2;x+=1){ const r=[x-w/2-2,fy-h,w+4,h+4]; if(r[1]<Y0||hit(r,occ)||hit(r,wall)) continue;
      const sc=Math.abs(x-64)+Math.abs(fy-50); if(!best||sc<best.sc) best={x,y:fy,sc,shelf:true,k}; } };
    /* Full size on the floor, then on a shelf; if there is really no room, a little smaller. */
    for(const k of [1,.8]){ if(best) break; w=COMP_FOOT[c.type][0]*k; h=COMP_FOOT[c.type][1]*k; floor(occ,k); if(!best) shelf(k); }
    if(!best){ floor(occ.slice(0,1),.8); } if(!best) best={x:i?108:20,y:95,k:.8};
    const s={x:Math.round(best.x*2)/2,y:Math.round(best.y*2)/2,shelf:!!best.shelf,k:best.k||1}; spots[i]=s; placed.push(s); occ.push([best.x-w/2-2,best.y-h-1,w+4,h+(s.shelf?5:2)]); });
  if(layer==='game') compSpotCache={key,spots}; return spots; }
function drawCompanions(now){ comps().forEach((c,i)=>drawCompanion(i,now)); }
function drawCompanion(i,now){ const cs=comps(), c=cs[i]; if(!c) return; const sp=compSpots(), a=anim, night=skyPhase()==='night';
  const cheer=!!(a&&/^(play:|trick:|event:showoff|event:playdate|celebrate)/.test(a.key));
  (()=>{ const s=sp[i]; if(!s) return; let m={sleep:night&&!(a&&a.ci===i),cheer};
    if(a&&a.ci===i&&/^comp:/.test(a.key)){ const e=now-a.start; if(a.key==='comp:arrive'&&e<700) return; if(a.key==='comp:moment') m={act:!a.visit||!a.fly,e,away:!!(a.fly&&e>700&&e<3900)}; if(a.key==='comp:grow'&&e<1400&&Math.floor(e/90)%2) return; }
    ctx.save(); if(s.k!==1){ ctx.translate(s.x,s.y); ctx.scale(s.k,s.k); ctx.translate(-s.x,-s.y); }
    if(s.shelf){ const w=COMP_FOOT[c.type][0]+4; rect(ctx,s.x-w/2-.5,s.y-.5,w+1,3,INK); rect(ctx,s.x-w/2,s.y,w,2,'#B8844E'); rect(ctx,s.x-w/2,s.y,w,.6,'#D8A46E');
      [s.x-w/2+3,s.x+w/2-4].forEach(x=>{ rect(ctx,x-.5,s.y+2,2,3.4,INK); rect(ctx,x,s.y+2,1,3,'#8A5A34'); }); }
    drawComp(c,c.stage,s.x,s.y,now,m); ctx.restore();
    if(m.sleep&&everyMs('cz'+i,3600,now)) spawn('z',s.x+4,s.y-18,4,-6,2); })(); }
const compSpotOf=i=>compSpots()[i]||{x:100,y:92};

/* ---- The picture strip: every stage of a companion's life, with arrows between ---- */
function drawLifeStrip(c,cx,cy){ const n=COMP[c.type].stages.length, cw=22, aw=6, W=n*cw+(n-1)*aw+8, H=30;
  const fw=freeRect().w/STAGE.s, k=Math.min(1,(fw-6)/W); cy=Math.max(VIEW.y+H*k/2+2,cy-2);
  ctx.save(); ctx.translate(cx,cy); ctx.scale(k,k);
  rect(ctx,-W/2-1,-H/2-1,W+2,H+2,INK); rect(ctx,-W/2,-H/2,W,H,'#FFFDF6'); rect(ctx,-W/2+2,-H/2+1.5,W-4,1.2,'#FFFFFF');
  for(let i=0;i<n;i++){ const x=-W/2+4+i*(cw+aw)+cw/2; const sc=c.type==='butterfly'&&i===n-1?.56:.7; ctx.save(); ctx.translate(x,H/2-3); ctx.scale(sc,sc); drawCompStill(c,i,0,0); ctx.restore();
    if(i<n-1){ const ax=x+cw/2+aw/2; rect(ctx,ax-2.4,-.5,3.6,1.2,'#C9A04A'); pxLine(ctx,ax+1.2,-2,ax+2.6,.1,'#C9A04A',.8); pxLine(ctx,ax+1.2,2.2,ax+2.6,.1,'#C9A04A',.8); } }
  ctx.restore(); }

/* ---- Getting a companion ---- */
function compOfferDue(now){ if(!state) return false; const n=comps().length, st=stageIdx();
  return !state.noCompOffer&&((st>=1&&n<1)||(st>=2&&n<2))&&now>=(state.compAskAt||0); }
function newComp(type){ const T=COMP[type], used=comps().map(c=>c.name).concat([state.name]), names=T.names.filter(x=>!used.includes(x));
  const look=T.pet?pick(KIND_STYLES[T.pet].filter(s=>s!==state.style)):Math.floor(Math.random()*(T.looks||1));
  return {type,name:pick(names.length?names:T.names),look,at:state.hearts,stage:0}; }
/* Pick a companion: from the offer when the pet grows up, or any time from Companions in More to Do,
   where a companion can also be switched for a different one (the new one starts as a baby). After
   picking, the player names it just like naming a new pet: a few names to choose from, or spell one. */
const compSlots=()=>{ const st=stageIdx(); return st>=2?2:st>=1?1:0; };
function offerCompanion(replace){ const n=state.name, cs=comps(), have=cs.map(c=>c.type), second=replace==null&&cs.length>0; lastCelebrate=Date.now();
  const cands=COMP_ORDER.filter(t=>!have.includes(t)).map(newComp);
  const opts=cands.map(c=>({label:COMP[c.type].label,say:`${COMP[c.type].label}. ${COMP[c.type].say}`,preview:{custom:(x,y)=>drawLifeStrip(c,x,y)},fn:()=>confirmCompanion(c,replace)}));
  if(replace!=null) opts.push({label:`Keep ${cs[replace].name}`,fn:()=>{ setCaption(`${cs[replace].name} is happy to stay!`); quietUntil=Date.now()+6000; }});
  else opts.push({label:'Maybe later',say:'Maybe later. You can pick one any time in Companions, in More to Do.',fn:()=>{ state.compAskAt=Date.now()+20*60000*paceK(); save(); setCaption(`OK! You can pick a companion any time in Companions, in More to Do.`); quietUntil=Date.now()+6000; }});
  showChoice(replace!=null?`Pick a new companion. It starts as a baby and grows up.`:second?`${n} is a grown-up! Pick a second companion. It starts as a baby and grows up.`:`Pick a companion for ${n}! It starts as a baby and grows up.`,opts); }
function confirmCompanion(c,replace){ const T=COMP[c.type], s0=T.stages[0], last=T.stages[T.stages.length-1];
  showChoice(`${aOrAn(s0).replace(/^./,x=>x.toUpperCase())} that grows up into ${aOrAn(last)}. Is this the one?`,[
    {label:'Yes, this one!',say:`Yes, this one. ${T.say}`,preview:{custom:(x,y)=>drawLifeStrip(c,x,y)},fn:()=>nameCompanion(c,replace)},
    {label:'Look at the others',fn:()=>offerCompanion(replace)}]); }
const COMP_NAMES={frog:['Hopper','Lily','Puddle','Dot','Pickle','Sprout','Bubbles','Lilypad','Jelly Bean'],butterfly:['Flutter','Sunny','Petal','Skye','Blossom','Rainbow','Twinkle','Goldie','Daisy'],
  bunny:['Clover','Hazel','Cotton','Nibbles','Hops','Marshmallow','Dandelion','Pip','Snowball'],bird:['Chirp','Sky','Peep','Birdie','Tweet','Robin','Feather','Sunny','Kiwi']};
const compNames=type=>COMP[type].pet?PRESET_NAMES[COMP[type].pet]:COMP_NAMES[type];
let nameFor=null;
function nameCompanion(c,replace){ nameFor={c,replace}; choicePreview={custom:(x,y)=>drawLifeStrip(c,x,y)}; const s0=COMP[c.type].stages[0], used=comps().map(x=>x.name).concat([state.name]);
  $('#name-title').textContent=`Name your ${s0}`;
  renderList('names',shuffled(compNames(c.type).filter(x=>!used.includes(x))).slice(0,NAMES_SHOWN).map(x=>({label:x,fn:()=>finishCompName(x)})),{tail:[
    {label:'Spell a name',fn:()=>{ play('choose'); spelled=''; renderSpell(); show('spell','Spell a name. Pick a row, then a letter'); }},
    {label:'Back',fn:()=>{ play('blip'); nameFor=null; choicePreview=null; show('game'); offerCompanion(replace); }}]});
  play('choose'); show('name',`What will you name your ${s0}?`); }
function finishCompName(name){ const f=nameFor; if(!f) return; nameFor=null; choicePreview=null; f.c.name=name.slice(0,12); play('choose'); show('game'); welcomeCompanion(f.c,f.replace); }
function welcomeCompanion(c,replace){ c.at=state.hearts; c.stage=0; const cs=comps().slice(); let i;
  if(replace!=null&&cs[replace]){ cs[replace]=c; i=replace; } else { cs.push(c); i=cs.length-1; }
  state.companions=cs; state.noCompOffer=false; compSpotCache.key=null; if(typeof applyGrid==='function') applyGrid(); save(); lockInput(2000);
  startAnim('comp:arrive',V['comp:arrive'].dur,()=>{ quietUntil=Date.now()+6000; lastWant=null; },{ci:i}); anim.idle=true; V['comp:arrive'].start(anim); }
/* Companions, in More to Do */
function openCompanions(){ const n=state.name, cs=comps(), slots=compSlots(); unpauseClock(); lastTick=Date.now();
  if(!slots){ showChoice(`Companions come to live with ${n} when ${n} is a teen. Keep caring for ${n} to grow up!`,[{label:'OK',fn:()=>openMore()}]); return; }
  const opts=[]; if(cs.length<slots) opts.push({label:'Pick a companion',say:`Pick a companion. A little friend who lives with ${n} and grows up.`,fn:()=>{ state.compAskAt=0; state.noCompOffer=false; offerCompanion(); }});
  cs.forEach((c,i)=>opts.push({label:`Switch ${c.name}`,say:`Switch ${c.name} the ${compStageWord(c)} for a different companion. The new one starts as a baby.`,preview:{custom:(x,y)=>drawLifeStrip(c,x,y)},fn:()=>askSwitch(i)}));
  if(cs.length) opts.push({label:cs.length>1?'Say goodbye':`Say goodbye to ${cs[0].name}`,say:cs.length>1?'Say goodbye to a companion, or to all of them':`Say goodbye to ${cs[0].name}. ${cs[0].name} goes to a happy new home`,fn:()=>openCompGoodbye()});
  opts.push({label:'Back',fn:()=>openMore()});
  showChoice(cs.length?`${n}'s companions: ${cs.map(c=>`${c.name} the ${compStageWord(c)}`).join(' and ')}.`:`Pick a companion for ${n}!`,opts); }
function askSwitch(i){ const c=comps()[i]; showChoice(`Switch ${c.name}? ${c.name} goes to a happy new home, and your new companion starts as a baby.`,[
  {label:'Yes, pick a new one',fn:()=>offerCompanion(i)},{label:`Keep ${c.name}`,fn:()=>{ setCaption(`${c.name} is happy to stay!`); quietUntil=Date.now()+6000; }}]); }
function growCompanion(i){ lastCelebrate=Date.now(); startAnim('comp:grow',V['comp:grow'].dur,()=>{ quietUntil=Date.now()+6000; },{ci:i}); anim.idle=true; V['comp:grow'].start(anim); }
function startCompMoment(){ const cs=comps(), i=Math.floor(Math.random()*cs.length); startAnim('comp:moment',V['comp:moment'].dur,()=>{ quietUntil=Date.now()+4000; },{ci:i}); anim.idle=true; V['comp:moment'].start(anim); }
/* Called by the room's clock when things are calm: a companion offer, or a companion growing up. */
function compPriority(now){ if(!state) return false;
  if(compOfferDue(now)&&now-lastCelebrate>8000){ offerCompanion(); return true; }
  const i=comps().findIndex(c=>compDue(c)>c.stage); if(i>=0&&now-lastCelebrate>CELEBRATE_GAP*paceK()*.5){ growCompanion(i); return true; }
  return false; }
const compMomentReady=()=>comps().length>0&&Math.random()<.35;
const compHere=a=>a&&comps()[a.ci];
const compSound=c=>c.type==='frog'?'ribbit':c.type==='bird'?(c.stage>=4?'birdsong':c.stage?'peep':'tick'):c.type==='dog'?`dog:barkFriendly:${STAGES[c.stage]}`:c.type==='cat'?`cat:trill:${STAGES[c.stage]}`:c.type==='bunny'?'pop':'sparkle';
V['comp:arrive']={dur:5600,start(a){ const c=compHere(a); if(!c) return; const T=COMP[c.type];
    setCaption(`Welcome home, ${c.name}! Right now ${c.name} is ${aOrAn(T.stages[0])}. As ${state.name} earns paw prints, ${c.name} will ${T.journey}.`); play('fanfare',.45); },
  pose(p){ p.eyes='happy'; p.mouth='tongue'; },
  tick(a,e){ const s=compSpotOf(a.ci); if(e>700) once(a,'pop',()=>{ play('pop',.5); for(let k=0;k<8;k++) spawn('sparkle',s.x+rand(-10,10),s.y-rand(4,20),rand(-10,10),rand(-14,-4),1); });
    if(e>1800) once(a,'ph',()=>{ const c=compHere(a); if(c) addPhoto('comp',`${c.name} the ${COMP[c.type].stages[0]} came to live with ${state.name}!`,{c:Object.assign({},c)}); }); }};
V['comp:grow']={dur:4600,start(a){ const c=compHere(a); if(!c) return; setCaption(`Something is happening to ${c.name}...`); play('twinkle',.5); },
  pose(p){ p.eyes='open'; p.headDy=-1; },
  tick(a,e,now){ const c=compHere(a), s=compSpotOf(a.ci); if(!c) return; if(e<1400&&now>=(a.next||0)){ spawn('sparkleSmall',s.x+rand(-9,9),s.y-rand(2,20),0,-6,.8); a.next=now+120; }
    if(e>1400) once(a,'g',()=>{ c.stage=Math.min(compMax(c),c.stage+1); save(); play('fanfare',.5); for(let k=0;k<10;k++) spawn('sparkle',s.x+rand(-12,12),s.y-rand(2,22),rand(-12,12),rand(-16,-4),1.1);
      const nx=compNext(c); setCaption(COMP[c.type].grow[c.stage](c.name)+(nx?'':` ${c.name} is all grown up!`)); });
    if(e>2600) once(a,'ph',()=>addPhoto('comp',COMP[c.type].grow[c.stage](c.name),{c:Object.assign({},c)})); }};
/* A companion moment: the companion does its own little thing, or (more often) the pet walks over to
   visit: they touch noses, play, or peek into the nest, and a grown butterfly or bird flies over and
   lands on the pet's head for a moment before flying home. */
const VISIT_LINE={
  frog:[(c,p)=>`${p} watches ${c} swim around the water bowl.`,(c,p)=>`${p} watches ${c} kick its little legs.`,(c,p)=>`${p} says hello to ${c} on the lily pad.`,(c,p)=>`${p} and ${c} look at each other. Ribbit!`],
  butterfly:[(c,p)=>`${p} gently sniffs ${c}'s leaf.`,(c,p)=>`${p} watches ${c} the caterpillar munch.`,(c,p)=>`${p} peeks at the chrysalis. What's inside?`,(c,p)=>`${c} landed on ${p}'s head! ${p} holds very still.`],
  bunny:[(c,p)=>`${p} peeks at ${c} napping on the cushion.`,(c,p)=>`${p} and ${c} touch noses. Boop!`,(c,p)=>`${p} and ${c} touch noses. Boop!`,(c,p)=>`${c} hops over to play with ${p}!`],
  bird:[(c,p)=>`${p} peeks into the nest at the egg.`,(c,p)=>`${c} peeps at ${p}. Peep, peep!`,(c,p)=>`${p} says hello to fluffy ${c}.`,(c,p)=>`${c} flaps its wings at ${p}.`,(c,p)=>`${c} flies over and sits on ${p}'s head!`],
  dog:[(c,p)=>`${p} and ${c} play together!`], cat:[(c,p)=>`${p} and ${c} play together!`]};
const compFlyer=c=>(c.type==='butterfly'&&c.stage===3)||(c.type==='bird'&&c.stage===4);
V['comp:moment']={dur:4400,
  start(a){ const c=compHere(a); if(!c) return; const s=compSpotOf(a.ci), n=state.name; a.visit=Math.random()<.6; a.fly=a.visit&&compFlyer(c);
    const off=s.x-64; a.tx=a.fly||Math.abs(off)<34?0:Math.round(clamp(off-Math.sign(off)*26,-40,40));
    const VL=VISIT_LINE[c.type], L=COMP[c.type].moment[c.stage]||COMP[c.type].moment[0];
    setCaption(a.visit?(VL[c.stage]||VL[VL.length-1])(c.name,n):pick(L)(c.name,n),false); play(compSound(c),.4); },
  pose(p,e,a){ if(!a.visit){ p.eyes=e%1600<800?'happy':'open'; return; } const d=a.tx||0;
    if(e<900){ if(d){ p.body='walk'; p.face=d>0?1:-1; p.frame=Math.floor(e/140)%4; } p.dx=Math.round(lerp(0,d,e/900)); return; }
    if(e<3200){ p.dx=d; if(a.fly){ p.eyes=e>1500&&e<3000?'open':'happy'; p.mouth='smile'; p.headDy=0; p.dy=0; } else { p.eyes='happy'; p.mouth=e%1400<700?'tongue':'smile'; p.headDy=Math.floor(e/350)%2; if(e>1700&&e<2300) p.dy=Math.round(arc(ph(e,1700,2300),3)); } return; }
    p.dx=Math.round(lerp(d,0,ph(e,3200,4100))); if(d&&e<4100){ p.body='walk'; p.face=d>0?-1:1; p.frame=Math.floor(e/140)%4; } else p.eyes='happy'; },
  front(e,a,p){ if(!a.fly||e<700||e>3900) return; const c=compHere(a); if(!c) return; const s=compSpotOf(a.ci), k0=s.k||1, bf=c.type==='butterfly';
    const home={x:s.x,y:bf?s.y-19.6*k0:s.y-12*k0}, head={x:64+p.dx+2,y:headTopOf(p)+1}; let x, y, f;
    if(e<1500){ const k=ph(e,700,1500); x=lerp(home.x,head.x,k); y=lerp(home.y,head.y,k)-Math.sin(k*Math.PI)*12; f='fly'; }
    else if(e<3100){ x=head.x; y=head.y; f='sit'; } else { const k=ph(e,3100,3900); x=lerp(head.x,home.x,k); y=lerp(head.y,home.y,k)-Math.sin(k*Math.PI)*12; f='fly'; }
    if(bf) blit(ctx,bflySpr(c.look,f==='fly'?['o','h','c','h'][Math.floor(e/90)%4]:(e%1600<250?'h':'o')),x-18,y-17);
    else blit(ctx,birdSpr(4,c.look,f==='fly'?(Math.floor(e/110)%2?'b':'a'):(Math.floor(e/300)%2&&e>2000?'m':'a')),x-7.5,y-13.6); },
  tick(a,e,now){ const s=compSpotOf(a.ci), c=compHere(a); if(now>=(a.next||0)&&e>600&&e<3600){ const hx=a.visit?(64+(a.tx||0)+s.x)/2:s.x; spawn('heart',hx+rand(-6,6),a.fly?40:s.y-22,rand(-3,3),-10,1.2); a.next=now+900; }
    if(c&&e>2200) once(a,'s2',()=>play(compSound(c),.3)); if(a.fly&&e>1500) once(a,'l',()=>play('sparkle',.35)); }};
/* The Progress page: each companion, and how soon it grows next. */
function compProgress(){ return comps().map(c=>{ const nx=compNext(c); return {html:`${COMP[c.type].icon} ${esc(c.name)} the ${esc(compStageWord(c))}${nx?` · ${nx.word} in ${nx.left} 🐾`:' · all grown up!'}`,
  say:`${c.name} the ${compStageWord(c)}`+(nx?` grows into ${aOrAn(nx.word)} in ${nx.left} paw prints.`:' is all grown up.')}; }); }
function cleanComps(a,hearts){ if(!Array.isArray(a)) return []; return a.filter(c=>c&&COMP[c.type]).slice(0,2).map(c=>{ const T=COMP[c.type];
  const look=T.pet?(STYLES[c.look]&&STYLES[c.look].kind===T.pet?c.look:KIND_STYLES[T.pet][0]):clamp(Math.floor(Number(c.look)||0),0,(T.looks||1)-1);
  return {type:c.type,name:(typeof c.name==='string'&&c.name.trim().slice(0,12))||T.names[0],look,at:clamp(Math.floor(Number(c.at)||0),0,hearts),stage:clamp(Math.floor(Number(c.stage)||0),0,T.stages.length-1)}; }); }

/* ================= Rush, the helper dog ================= */
STYLES.cattle={kind:'dog',label:'Australian Cattle Dog',ears:'perk',sw:'#2E2A30',pal:{fur:'#2E2A30',light:'#46404C',ear:'#2E2A30',line:'#120F14',iris:'#6A4A2A',lid:'#120F14',blush:'#C27088'},
  pattern:(x,y,t,G)=>{ if(t==='paw') return '#A8683A'; if(t==='fur'&&inC(x,y,G.eyeLX,G.eyeY-.2,3.4)) return '#9A5A30'; return null; }};
SIDE_PAT.cattle=(x,y,t,G)=>{ if(t==='paw') return '#A8683A'; if(t==='fur'&&inE(x,y,G.head)&&x>G.head.x-.4&&y<G.head.y+.8) return '#9A5A30'; return null; };
const RUSH_GAP=40*60000, RUSH_X=64-30, compT0=Date.now();
const rushReady=()=>!!state&&Date.now()-(state.rushAt||0)>RUSH_GAP*paceK()&&Date.now()-compT0>6*60000;
function drawRush(cx,o){ const p=Object.assign({eyes:'open',mouth:'smile',tail:0,ear:0,headDy:0,dy:0,dx:0},o); softShadow(ctx,cx,85.5,p.body&&p.body!=='sit'?20:14,2.4,.3);
  drawPetPose(ctx,'cattle','adult',p,{neck:'bandana'},cx-22,PETY+(p.dy||0),false); }
function runV(key,extra,done){ startAnim(key,V[key].dur,done,extra||{}); anim.idle=true; if(V[key].start) V[key].start(anim); }
const petBeside=(p,e,t0)=>{ const k=t0==null?1:ph(e,t0,t0+800); p.dx=Math.round(lerp(0,12,k)); if(t0!=null&&k>0&&k<1){ p.body='walk'; p.face=1; p.frame=Math.floor(e/140)%4; } };
function startRush(){ const n=state.name, first=!(state.rushVisits>0); lockInput(2000);
  runV('rush:in',{first},()=>{ runV('rush:wait',{},null);
    showChoice(`Rush is checking on you. How are you feeling?`,[
      {label:'I feel happy!',preview:{art:'feelHappy'},fn:()=>{ anim=null; runV('rush:happy',{},rushOut); }},
      {label:'I feel tired',preview:{art:'feelTired'},fn:()=>{ anim=null; runV('rush:rest',{},rushOut); }},
      {label:'I need help',urgent:true,preview:{art:'needHelp'},fn:()=>{ anim=null; callForHelp(); runV('rush:alert',{},rushOut); }}]); }); }
function rushOut(){ runV('rush:out',{},()=>{ state.rushAt=Date.now(); state.rushVisits=(state.rushVisits||0)+1; save(); quietUntil=Date.now()+8000; lastWant=null; }); }
V['rush:in']={dur:4600,start(a){ play('knock',.5); later(()=>play('knock',.5),380);
    setCaption(a.first?`Knock, knock! Meet Rush, a helper dog. Rush is an alert dog who checks on people and can call a helper if they need one.`:`Knock, knock! It's Rush, the helper dog, here to check on you.`); },
  pose(p,e){ petBeside(p,e,200); if(e>1000) p.eyes='happy'; },
  front(e){ const k=ph(e,700,3200), x=lerp(VIEW.x-26,RUSH_X,k); drawRush(x,e<3200?{body:'walk',face:1,frame:Math.floor(e/140)%4}:{eyes:'happy',mouth:'tongue',tail:Math.floor(e/140)%3}); },
  tick(a,e,now){ if(e>700&&e<3200&&now>=(a.next||0)){ play('step',.2); a.next=now+280; } if(e>3400) once(a,'b',()=>play('dog:barkFriendly:adult',.4)); }};
V['rush:wait']={dur:6e5,pose(p){ petBeside(p); },front(e){ drawRush(RUSH_X,{headDy:Math.floor(e/1800)%2,eyes:e%3600<150?'closed':'open',tail:Math.floor(e/260)%3}); }};
V['rush:happy']={dur:4600,start(){ setCaption(`Rush is so glad you feel happy! Big, happy wags.`); play('dog:barkHappy:adult',.45); },
  pose(p,e){ petBeside(p); p.eyes='happy'; p.mouth='tongue'; },
  front(e){ const hop=e>600&&e<2600?Math.round(arc(ph(e%700,0,700),5)):0; drawRush(RUSH_X,{eyes:'happy',mouth:'tongue',tail:Math.floor(e/90)%3,dy:hop}); },
  tick(a,e,now){ if(now>=(a.next||0)&&e<3800){ spawn('heart',RUSH_X+rand(-8,8),50,rand(-4,4),-12,1.2); a.next=now+450; } if(e>1600) once(a,'b',()=>play('dog:barkHappy:adult',.35)); }};
V['rush:rest']={dur:9000,start(){ setCaption(`Rush lies down next to you. It's OK to rest. Let's take a slow breath together. In... and out.`); play('lullaby',.35); },
  pose(p,e){ petBeside(p); p.body='lie'; p.face=-1; p.frame=0; p.eyes=e>2500?'closed':'sleepy'; },
  front(e){ const br=Math.sin(e/1300); drawRush(RUSH_X,{body:'lie',face:1,frame:0,eyes:e>2000?'closed':'sleepy',dy:br>0?-.5:0}); },
  tick(a,e,now){ if(e>2500&&now>=(a.next||0)){ spawn('z',RUSH_X+10,58,4,-6,2.2); a.next=now+1800; } if(e>6000) once(a,'s',()=>setCaption(`Feeling a little calmer. Rush is right here with you.`)); }};
V['rush:alert']={dur:7000,
  pose(p,e){ petBeside(p); p.eyes='open'; p.headDy=-1; },
  front(e){ const bark=(e>900&&e<1300)||(e>1700&&e<2100)||(e>4600&&e<5000); drawRush(RUSH_X,{mouth:bark?'open':'smile',headDy:bark?-1:0,ear:bark?1:0,tail:Math.floor(e/200)%3}); },
  tick(a,e){ [900,1700,4600].forEach((t,i)=>{ if(e>t) once(a,'k'+i,()=>play('dog:bark:adult',.5)); }); if(e>3200) once(a,'c',()=>setCaption(`Rush barked to call a helper. A helper is on the way!`,false)); }};
V['rush:out']={dur:3600,start(){ setCaption(`Bye, Rush! Thank you for checking in.`); },
  pose(p,e){ p.dx=Math.round(lerp(12,0,ph(e,1600,2600))); if(e>1600&&e<2600){ p.body='walk'; p.face=-1; p.frame=Math.floor(e/140)%4; } },
  front(e){ const k=ph(e,300,2800), x=lerp(RUSH_X,VIEW.x-28,k); drawRush(x,{body:'walk',face:-1,frame:Math.floor(e/140)%4}); },
  tick(a,e,now){ if(e>300&&e<2800&&now>=(a.next||0)){ play('step',.2); a.next=now+280; } }};
Object.assign(PREVIEW_ART,{
  feelHappy:(x,y)=>{ pxEll(ctx,x,y,8,8,INK); pxEll(ctx,x,y,7.2,7.2,'#F4D24A'); pxEll(ctx,x-2.6,y-2,1,1.2,INK); pxEll(ctx,x+2.6,y-2,1,1.2,INK); for(let i=-3;i<=3;i++) rect(ctx,x+i-.5,y+2.6-Math.cos(i/3.4)*1.6+1,1,1,INK); },
  feelTired:(x,y)=>{ pxEll(ctx,x,y,8,8,INK); pxEll(ctx,x,y,7.2,7.2,'#BFD6F0'); rect(ctx,x-4,y-1.6,3,1,INK); rect(ctx,x+1,y-1.6,3,1,INK); pxEll(ctx,x,y+3,1.6,1.2,INK); blit(ctx,SPR.z,x+5,y-11); },
  needHelp:(x,y)=>{ pxEll(ctx,x,y-1,7,7.4,INK); pxEll(ctx,x,y-1,6.2,6.6,'#F4C542'); rect(ctx,x-8,y+4,16,2.4,INK); rect(ctx,x-7.2,y+4.4,14.4,1.6,'#E0A030'); pxEll(ctx,x,y+7.4,1.8,1.6,INK); rect(ctx,x-1,y-9.6,2,2,INK);
    [[-11,-4,-9,-2],[11,-4,9,-2],[-11,1,-9,1],[11,1,9,1]].forEach(([a,b,c,d])=>pxLine(ctx,x+a,y+b,x+c,y+d,'#D9403E',.8)); }});
