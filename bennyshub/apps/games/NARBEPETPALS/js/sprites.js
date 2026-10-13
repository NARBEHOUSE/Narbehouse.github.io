'use strict';
/* ================= Props, toys, icons and particles (HD sprites) ================= */
const heartShape=(b,x,y,s,c,sh)=>{ E(b,x-s*.95,y,s*1.05,s,c,sh); E(b,x+s*.95,y,s*1.05,s,c,sh); Tr(b,x-s*1.95,y+s*.3,x+s*1.95,y+s*.3,x,y+s*2.35,c,sh); };
const seam=(b,cx,cy,rx,ry,dir,c)=>{ for(let a=-1.25;a<=1.25;a+=.04) D(b,cx+dir*(rx-rx*.85*Math.cos(a)),cy+ry*Math.sin(a),c); };
const pawPrint=(b,cx,cy,s,c)=>part(b,T=>{ E(T,cx,cy+s*.9,s*1.25,s*1,c,SH); [[-1.35,-.35],[-.5,-1.25],[.5,-1.25],[1.35,-.35]].forEach(([dx,dy])=>E(T,cx+dx*s,cy+dy*s,s*.48,s*.55,c,SH)); });
const ICONS={
  feed:sprite(12,12,b=>{ part(b,T=>{ E(T,6,6.8,5.4,3.9,'#E06A5A',SH,6.8); R(T,.6,5.8,10.8,1.6,'#F2907E',true,.7); }); part(b,T=>[[3.4,5.2],[5.2,4.6],[7.1,5],[8.6,5.6],[4.4,5.9],[6.4,5.8]].forEach(([x,y])=>E(T,x,y,1.1,.95,'#B87840',SH))); }),
  ball:sprite(12,12,b=>{ part(b,T=>E(T,6,6,5.1,5.1,'#D8E24A',SH)); seam(b,6,6,5,4.8,-1,'#F8FBDC'); seam(b,6,6,5,4.8,1,'#F8FBDC'); D(b,3.6,3,'*#FFFFFF'); }),
  yarn:sprite(12,12,b=>{ part(b,T=>E(T,6,6,5.1,5.1,'#C77DBA',SH)); for(let i=-3;i<=3;i+=1.5) Ln(b,6+i-2.4,2+Math.abs(i)*.3,6+i+2.2,10-Math.abs(i)*.3,'#9A5A90',1); Ln(b,9.8,8.6,11.6,11,'#C77DBA',2); }),
  cuddle:sprite(12,12,b=>{ part(b,T=>heartShape(T,6,4.4,2.6,'#F07A8E',SH)); E(b,3.6,3.6,.9,.7,'*#FFD6DE'); }),
  bath:sprite(12,12,b=>{ [[4.4,7.2,3.3],[8.9,3.6,2.4],[9.4,9.2,1.6]].forEach(([x,y,r])=>{ part(b,T=>E(T,x,y,r,r,'#A8DDF2',SHL)); E(b,x-r*.35,y-r*.35,r*.28,r*.25,'*#FFFFFF'); }); }),
  brush:sprite(12,12,b=>{ part(b,T=>R(T,.4,4.4,5.4,2.4,'#C08A5A',SH,1.1)); part(b,T=>R(T,5.2,2.6,6.4,4.4,'#8A5A34',SH,.9)); for(let x=5.8;x<=11;x+=1.05) Ln(b,x,7,x,9.8,'#F4E4C8',2); }),
  walk:sprite(12,12,b=>pawPrint(b,6,6.3,2.2,'#A06E46')),
  box:sprite(12,12,b=>{ part(b,T=>{ Tr(T,1.2,4.6,4,4.6,-.2,1.4,'#E3BC84',SH); Tr(T,10.8,4.6,8,4.6,12.2,1.4,'#E3BC84',SH); }); part(b,T=>R(T,1.2,4.4,9.6,6.8,'#C99A62',SH,.4)); R(b,5.2,4.6,1.6,3,'#EEDDB8'); }),
  nap:sprite(12,12,b=>{ part(b,T=>E(T,6,6.2,4.9,4.9,(x,y)=>inC(x,y,8.4,4.3,3.9)?null:'#F6D66B',SH)); D(b,9.6,8.4,'*#FFF3C0'); D(b,10.2,2,'*#FFF3C0'); }),
  water:sprite(12,12,b=>{ part(b,T=>{ E(T,6,7.6,3.7,3.7,'#6FB8E0',SH); Tr(T,2.5,6.6,9.5,6.6,6,1,'#6FB8E0',SH); }); E(b,4.8,7,.7,1.3,'*#FFFFFF'); }),
  broom:sprite(12,12,b=>{ part(b,T=>Ln(T,10.8,.8,5.4,6.4,'#B07A4A',3)); part(b,T=>{ Tr(T,2.2,5.2,7.8,6.8,1.6,11.4,'#E8C86A',SH); Tr(T,7.8,6.8,6.8,11.2,1.6,11.4,'#E8C86A',SH); }); Ln(b,3.4,9,6.2,7.6,'#C9A24A',1); }),
  scoop:sprite(12,12,b=>{ part(b,T=>Ln(T,10.8,1,7,4.8,'#B07A4A',3)); part(b,T=>R(T,.8,5,7.6,5.6,'#9FC4E8',SH,1)); [2.6,4.6,6.6].forEach(x=>Ln(b,x,6.2,x,9.6,'#4A6F9A',1)); }),
  basket:sprite(12,12,b=>{ part(b,T=>{ for(let a=0;a<=30;a++){ const t=Math.PI*a/30; E(T,6-Math.cos(t)*4,5.4-Math.sin(t)*3.6,.6,.6,'#8A6234'); } }); part(b,T=>R(T,.8,5,10.4,6.2,(x,y)=>alt2(x+y,'#C99A62','#E3BC84'),SH,.8)); }),
  vet:sprite(12,12,b=>{ part(b,T=>E(T,6,6,5.2,5.2,'#FFFFFF',SH)); part(b,T=>{ R(T,4.8,2.4,2.4,7.2,'#E0567D',SH,.3); R(T,2.4,4.8,7.2,2.4,'#E0567D',SH,.3); }); }),
  home:sprite(12,12,b=>{ part(b,T=>Tr(T,.4,6,11.6,6,6,.6,'#E0567D',SH)); part(b,T=>R(T,2,5.6,8,5.8,'#F6E3C8',SH)); part(b,T=>R(T,4.8,7.6,2.4,3.8,'#8A5A34',SH,.4)); })
};
const iconInkCache={};
function inkedIcon(k){ return ICONS[k]; }
function drawIcon(canvas,icon){ const g=canvas.getContext('2d'); g.clearRect(0,0,canvas.lw,canvas.lh); if(ICONS[icon]) blit(g,ICONS[icon],0,0); }

const noInk={ink:false};
/* A hand reaching into the scene: skin, fingernails, sleeve. */
function makeHand(S,N,sleeve){ return sprite(20,21,b=>{
    part(b,T=>R(T,4.6,0,10.8,3.4,sleeve,SH,.6)); part(b,T=>R(T,4.6,3,10.8,1.2,'#F4E4C8',true));
    part(b,T=>{ R(T,5.6,4,8.8,3,S,SH); E(T,10,9.6,5.7,4.4,S,SH); E(T,4.4,9.6,1.8,2.3,S,SH); [[6.4,14.2,4],[9.2,15.4,4.5],[12,15.2,4.3],[14.6,13.6,3.3]].forEach(([x,y,h])=>E(T,x,y,1.75,h,S,SH)); });
    [[7.8,12.6,17.6],[10.6,12.6,19.2],[13.4,12.6,17]].forEach(([x,y0,y1])=>Ln(b,x,y0,x,y1,S+'!',1)); [[6.4,17.8],[9.2,19.6],[12,19.2],[14.6,16.6]].forEach(([x,y])=>E(b,x,y,.9,.5,N)); }); }
const SPR={
  heart:sprite(7,6,b=>{ part(b,T=>heartShape(T,3.5,1.9,1.5,'#F07A8E',SH)); D(b,2,1.4,'*#FFD6DE'); }),
  heartO:sprite(7,6,b=>{ heartShape(b,3.5,1.9,1.5,(x,y)=>null); const s=1.5; for(let a=0;a<TAU;a+=.06){ D(b,3.5-s*.95+Math.cos(a)*s*1.05,1.9+Math.sin(a)*s,a>.3&&a<2.8?null:'#F07A8E'); D(b,3.5+s*.95+Math.cos(a)*s*1.05,1.9+Math.sin(a)*s,a>.3&&a<2.8?null:'#F07A8E'); } Ln(b,.6,2.6,3.5,5.6,'#F07A8E',2); Ln(b,6.4,2.6,3.5,5.6,'#F07A8E',2); },noInk),
  z:sprite(5,5,b=>{ Ln(b,.5,.6,4.4,.6,'#FFFFFF',2); Ln(b,4.2,.8,.7,4,'#FFFFFF',2); Ln(b,.5,4.2,4.4,4.2,'#FFFFFF',2); },{inkColor:'#34406E'}),
  sparkle:sprite(5,5,b=>{ Ln(b,2.5,0,2.5,4.9,'#FFD95A',2); Ln(b,0,2.5,4.9,2.5,'#FFD95A',2); E(b,2.5,2.5,.9,.9,'#FFFFFF'); },noInk),
  sparkleSmall:sprite(3,3,b=>{ Ln(b,1.5,0,1.5,2.9,'#FFD95A',1); Ln(b,0,1.5,2.9,1.5,'#FFD95A',1); D(b,1.5,1.5,'#FFFFFF'); D(b,1,1.5,'#FFFFFF'); },noInk),
  bubble2:sprite(6,6,b=>{ E(b,3,3,2.3,2.3,'#5AA9CC'); E(b,3,3,1.8,1.8,'#D8F2FFAA'); D(b,2.2,2.2,'#FFFFFF'); },noInk),
  bubble3:sprite(8,8,b=>{ E(b,4,4,3.3,3.3,'#5AA9CC'); E(b,4,4,2.8,2.8,'#D8F2FFAA'); E(b,2.9,2.9,.7,.7,'#FFFFFF'); },noInk),
  ball:sprite(9,9,b=>{ part(b,T=>E(T,4.5,4.5,3.7,3.7,'#D8E24A',SH)); seam(b,4.5,4.5,3.6,3.4,-1,'#F8FBDC'); seam(b,4.5,4.5,3.6,3.4,1,'#F8FBDC'); D(b,3,2.6,'*#FFFFFF'); }),
  yarn:sprite(9,9,b=>{ part(b,T=>E(T,4.5,4.5,3.7,3.7,'#C77DBA',SH)); for(let i=-2;i<=2;i+=1.3) Ln(b,4.5+i-1.8,1.6,4.5+i+1.6,7.4,'#9A5A90',1); }),
  bubbleThought:sprite(24,26,b=>{ part(b,T=>{ E(T,12.5,10.4,10.4,8.4,'#FFFFFF'); E(T,6.4,7.6,5,4.6,'#FFFFFF'); E(T,18.4,7,5.2,5,'#FFFFFF'); E(T,12,4.6,5.6,4.2,'#FFFFFF'); }); part(b,T=>E(T,4.6,21,2.2,2,'#FFFFFF')); part(b,T=>E(T,1.9,24.2,1.2,1.2,'#FFFFFF')); E(b,8,5,1.6,1,'*#F4F8FF'); }),
  fly1:sprite(5,4,b=>{ E(b,1.2,1.4,1.2,1.3,'#F2A7B5'); E(b,3.8,1.4,1.2,1.3,'#F2A7B5'); D(b,1.2,1.2,'#FFFFFF'); Ln(b,2.5,.8,2.5,3.6,'#3B2A22',1); }),
  fly2:sprite(5,3,b=>{ E(b,1.7,1.2,.8,.9,'#F2A7B5'); E(b,3.3,1.2,.8,.9,'#F2A7B5'); Ln(b,2.5,.3,2.5,2.8,'#3B2A22',1); }),
  bone:sprite(13,9,b=>part(b,T=>{ [[3,3.2],[3,5.8],[10,3.2],[10,5.8]].forEach(p=>E(T,p[0],p[1],1.9,1.9,'#F4E4C8',SH)); R(T,3,3.2,7,2.6,'#F4E4C8',SH); })),
  boneBig:sprite(19,11,b=>part(b,T=>{ [[4,4],[4,7],[15,4],[15,7]].forEach(p=>E(T,p[0],p[1],2.6,2.6,'#F4E4C8',SH)); R(T,4,4,11,3,'#F4E4C8',SH); })),
  fish:sprite(13,9,b=>{ part(b,T=>{ E(T,5.4,4.5,3.9,2.4,'#7FB3D5',SH); Tr(T,8,4.5,11.8,1.3,11.8,7.7,'#5E95BA',SH); }); E(b,3,3.8,.55,.55,'#1E2E3A'); Arc(b,6,4.5,1,1.6,'#5E95BA',true,1); }),
  saucer:sprite(19,7,b=>part(b,T=>{ E(T,9.5,3.5,8,2.5,'#FFFFFF',SH); E(T,9.5,3.1,5.2,1.3,'#F2F6FC'); })),
  duck:sprite(12,10,b=>{ part(b,T=>{ E(T,5,6.2,4.1,2.9,'#FFD84A',SH); E(T,7,3.3,2.5,2.5,'#FFD84A',SH); }); part(b,T=>E(T,9.6,3.8,1.4,.8,'#F08A2A',SHS)); E(b,7.6,2.6,.55,.55,'#2A1E18'); E(b,3.4,5.6,1.4,.8,'#FFE98A'); }),
  feather:sprite(8,11,b=>{ part(b,T=>{ E(T,4,4.4,2.3,3.5,'#C77DBA',SH); E(T,4,7.2,1.8,2.4,'#F2A7B5',SH); }); Ln(b,4,1,4,10.6,'#8E4B84',1); }),
  hand:makeHand('#F2C9A5','#FBE6D6','#6E9B7B'),
  sock:sprite(10,12,b=>part(b,T=>{ R(T,3,.6,4.2,7.4,(x,y)=>(y>2&&y<3.2)||(y>4.4&&y<5.6)?'#D9577A':'#FFFFFF',SH,.6); E(T,5.6,9,4.1,2.1,'#FFFFFF',SH); E(T,8.6,9.2,1,1.2,'#D9577A'); })),
  mouse:sprite(13,8,b=>{ part(b,T=>{ E(T,6.4,4.6,3.9,2.4,'#B8B8C8',SH); E(T,4.4,2.4,1.5,1.5,'#B8B8C8',SH); }); E(b,4.4,2.4,.8,.8,'#F2A7B5'); E(b,10.2,4.6,.7,.6,'#F2A7B5'); E(b,8,3.8,.5,.5,'#1E1614'); Ln(b,2.4,5,0,6.4,'#8A8A9A',1); }),
  bug:sprite(3,2.5,b=>{ E(b,.8,.6,.7,.5,'#DDEEFF'); E(b,2.2,.6,.7,.5,'#DDEEFF'); E(b,1.5,1.7,1.2,.7,'#2A2A30'); },noInk),
  squirrel:sprite(13,11,b=>{ part(b,T=>E(T,3.6,4.6,3.1,4.2,'#B8784A',SH)); part(b,T=>{ E(T,7.6,7,2.9,2.4,'#A0643A',SH); E(T,9.6,4.4,2.1,2,'#A0643A',SH); E(T,9.2,2.2,.8,1,'#A0643A'); }); E(b,10.2,4,.5,.5,'#1E120A'); E(b,2.8,3.6,1.2,1.8,'#D8A070'); }),
  crab:sprite(14,8,b=>{ part(b,T=>{ E(T,7,4.6,3.8,2.2,'#E0604A',SH); E(T,2.4,2.8,1.5,1.5,'#E0604A',SH); E(T,11.6,2.8,1.5,1.5,'#E0604A',SH); }); [[4.4,6.6],[9.6,6.6],[5.4,7],[8.6,7]].forEach(([x,y])=>D(b,x,y,'#B8402E')); E(b,5.6,2.4,.55,.55,'#1E120A'); E(b,8.4,2.4,.55,.55,'#1E120A'); }),
  gull:sprite(7,4,b=>{ Ln(b,.2,.4,3.5,2.6,'#FFFFFF',2); Ln(b,6.8,.4,3.5,2.6,'#FFFFFF',2); D(b,3.5,3.2,'#F4A340'); },{inkColor:'#3B3440'}),
  gull2:sprite(7,3,b=>{ Ln(b,.2,2.4,3.5,.6,'#FFFFFF',2); Ln(b,6.8,2.4,3.5,.6,'#FFFFFF',2); },{inkColor:'#3B3440'}),
  bird:sprite(6,4.5,b=>{ part(b,T=>{ E(T,2.6,2.4,2.3,1.8,'#7FA8D8',SH); E(T,4.2,1.6,1.3,1.2,'#7FA8D8',SH); }); D(b,4.4,1.3,'#1E1614'); D(b,5.6,1.8,'#F4A340'); D(b,5.9,1.8,'#F4A340'); E(b,2.2,2.8,1,.6,'#FFFFFF'); }),
  poop:sprite(8,7,b=>part(b,T=>{ E(T,4,5.6,3.6,1.5,'#8A5A34',SH); E(T,4,3.8,2.6,1.3,'#8A5A34',SH); E(T,4,2.2,1.6,1.1,'#8A5A34',SH); })),
  star:sprite(5,5,b=>part(b,T=>{ for(let i=0;i<5;i++){ const a=-Math.PI/2+i*TAU/5; Tr(T,2.5,2.7,2.5+Math.cos(a-.6)*1,2.7+Math.sin(a-.6)*1,2.5+Math.cos(a)*2.5,2.7+Math.sin(a)*2.5,'#F4C542',SH); Tr(T,2.5,2.7,2.5+Math.cos(a+.6)*1,2.7+Math.sin(a+.6)*1,2.5+Math.cos(a)*2.5,2.7+Math.sin(a)*2.5,'#F4C542',SH); } })),
  note:sprite(4,5,b=>{ part(b,T=>{ E(T,1.4,4,1.3,.95,'#5A3C8A',SH); R(T,2.2,.4,.8,3.8,'#5A3C8A'); R(T,2.2,.4,1.8,1.2,'#8A6ABA'); }); }),
  exclaim:sprite(2,5,b=>{ R(b,.4,0,1.2,3.2,'#F4C542',true); E(b,1,4.3,.6,.6,'#F4C542'); }),
  frisbee:sprite(13,6,b=>{ part(b,T=>E(T,6.5,3,5.8,2.2,'#E0604A',SH)); E(b,6.5,2.7,3.4,1,'#F29A80'); }),
  bunny:sprite(11,14,b=>{ part(b,T=>{ E(T,3.5,4,1.3,3,'#F4ECF0',SH); E(T,7.5,4,1.3,3,'#F4ECF0',SH); E(T,5.5,8.4,3.3,2.9,'#F4ECF0',SH); E(T,5.5,11.2,3.9,2.2,'#F4ECF0',SH); }); E(b,3.5,4.2,.5,1.8,'#F2A9B4'); E(b,7.5,4.2,.5,1.8,'#F2A9B4'); E(b,4.2,8,.5,.5,'#1C130E'); E(b,6.8,8,.5,.5,'#1C130E'); D(b,5.5,9.2,'#F07A8E'); }),
  ring:sprite(13,9,b=>part(b,T=>E(T,6.5,4.5,5.4,3.4,(x,y,nx,ny)=>(nx*nx+ny*ny)<.3?null:alt2(Math.atan2(ny,nx)*2.2,'#5A8FC4','#F4E4C8'),SH))),
  kong:sprite(11,13,b=>part(b,T=>{ E(T,5.5,9.6,4.1,2.7,'#D9403E',SH); E(T,5.5,6.1,3.3,2.3,'#D9403E',SH); E(T,5.5,3,2.3,1.7,'#D9403E',SH); })),
  hedgehog:sprite(14,10,b=>{ part(b,T=>{ for(let i=0;i<7;i++) Tr(T,1.6+i*1.5,4.5,3.4+i*1.5,4.5,2.3+i*1.5,.5,'#8A6440'); E(T,6,6,5.1,3.4,'#8A6440',SH); }); part(b,T=>E(T,10.6,6.6,2.1,1.9,'#F2DBBA',SH)); E(b,11,5.8,.5,.5,'#1C130E'); E(b,12.6,6.6,.5,.5,'#1C130E'); }),
  crinkle:sprite(10,10,b=>{ part(b,T=>E(T,5,5,3.8,3.8,'#B89AD8',SH)); [[3,3],[6,6],[4,7],[7,3.4]].forEach(([x,y])=>Ln(b,x-.6,y,x+.6,y+.4,'#E6DAF6',1)); }),
  spring:sprite(9,13,b=>{ for(let i=0;i<5;i++){ const y=1.2+i*2.2; part(b,T=>E(T,4.5,y,3.6,1,i%2?'#6FA87C':'#9CD2A8',SHS)); } }),
  fishy:sprite(14,9,b=>{ part(b,T=>{ E(T,5.6,4.5,4,2.5,'#B89AD8',SH); Tr(T,8.4,4.5,12.6,1.4,12.6,7.6,'#8A6AB0',SH); }); E(b,3.2,3.8,.55,.55,'#1C130E'); Ln(b,6.2,2.6,6.2,6.4,'#E6DAF6',1); }),
  bellball:sprite(10,10,b=>{ part(b,T=>E(T,5,5,3.8,3.8,'#F07A8E',SH)); [[3,3],[6.4,2.4],[7,6.4],[3,7]].forEach(([x,y])=>E(b,x,y,.5,.5,'#FFFFFF')); E(b,5,5,.9,.9,'#F4C542'); }),
  rabbit:sprite(13,12,b=>{ part(b,T=>{ E(T,5,8.2,3.8,2.9,'#B8AFA8',SH); E(T,8.6,6,2.4,2.1,'#B8AFA8',SH); E(T,8,2.8,.95,2.1,'#B8AFA8',SH); E(T,9.9,3,.95,2.1,'#B8AFA8',SH); }); part(b,T=>E(T,1.6,7.6,1.4,1.4,'#FFFFFF',SH)); E(b,9.4,5.8,.5,.5,'#1C130E'); }),
  stink:sprite(3,5,b=>{ for(let y=0;y<5;y+=.25) D(b,1.5+Math.sin(y*2.2)*.9,y,'#8CB85A'); },noInk),
  squiggle:sprite(9,3,b=>{ for(let x=0;x<9;x+=.25) D(b,x,1.5+Math.sin(x*1.6)*1,'#B8784A'); },noInk),
  poopbag:sprite(12,12,b=>{ part(b,T=>{ E(T,3.8,1.6,.8,1.4,'#3E4A40'); E(T,8.2,1.6,.8,1.4,'#3E4A40'); E(T,6,7.6,4.8,4.2,'#3E4A40',SH); R(T,4,2.4,4,2.6,'#3E4A40',SH); }); E(b,4.4,6.6,.7,2,'#6A7A6C'); }),
  scooper:sprite(20,14,b=>{ part(b,T=>Ln(T,18.6,1.2,10,6.8,'#5A8FC4',3)); part(b,T=>E(T,6,10,5.4,3.3,'#9FC4E8',SH)); [3,5,7,9].forEach(x=>Ln(b,x,8.8,x,11.4,'#4A6F9A',1)); })
};
/* The people the pet meets (the pet store clerk, the groomer, the vet, a teacher, a neighbor) have
   different skin tones and sleeves, as if different people are there. One person stays the same for
   a whole trip (the groomer is the same groomer in every scene of the visit), and a scene with two
   people shows two different people. At home, your own hand is the one it always was. */
const SKIN_TONES=[['#5C3A24','#9A6E56'],['#8A5636','#BD8C72'],['#B97E50','#E0B08E'],['#DFA982','#F4D2BE'],['#F2C9A5','#FBE6D6']];
const SLEEVES=['#6E9B7B','#5A8FC4','#D9577A','#E0A030','#8A6AB0','#4A5A70'];
const PEOPLE_HANDS=[];
const personHand=(skin,sleeve)=>{ const k=skin*10+sleeve; return PEOPLE_HANDS[k]||(PEOPLE_HANDS[k]=makeHand(SKIN_TONES[skin][0],SKIN_TONES[skin][1],SLEEVES[sleeve])); };
const newPerson=avoid=>{ let s; do s=Math.floor(Math.random()*SKIN_TONES.length); while(avoid&&s===avoid[0]); return [s,Math.floor(Math.random()*SLEEVES.length)]; };
const HOME_HAND=SPR.hand;
function peopleNow(){ const t=typeof trip!=='undefined'?trip:null, a=typeof anim!=='undefined'?anim:null, away=t||(a&&/^(event|welcome|season):/.test(a.key));
  if(!away) return null; const o=t||a; if(!o.people){ const p1=newPerson(); o.people=[p1,newPerson(p1)]; } return o.people; }
Object.defineProperty(SPR,'hand',{get(){ const p=peopleNow(); return p?personHand(p[0][0],p[0][1]):HOME_HAND; },configurable:true});
Object.defineProperty(SPR,'hand2',{get(){ const p=peopleNow(); return p?personHand(p[1][0],p[1][1]):HOME_HAND; },configurable:true});
/* Food and water bowls: three fill levels, plain and fancy. */
function bowlSprite(fill,rim,food,fancy){ return sprite(14,8,b=>{ part(b,T=>{ E(T,7,4.6,6.4,3.3,rim,SH,4.6); R(T,.6,3.8,12.8,1.5,shade(rim,.08),true,.7); });
  if(fancy) for(let x=2;x<13;x+=2.5) D(b,x,6,'#F4C542');
  if(fill>0) part(b,T=>{ const n=fill===2?7:3; for(let i=0;i<n;i++){ const x=3.2+i*(fill===2?1.25:2.6), y=3.4-(i%2)*.7; E(T,x,y,1.15,.95,food,SH); } }); }); }
const BOWLS=[2,1,0].map(f=>bowlSprite(f,'#E06A5A','#B87840',false));
const BOWLS_FANCY=[2,1,0].map(f=>bowlSprite(f,'#FFFFFF','#B87840',true));
function waterSprite(full,rim){ return sprite(14,5,b=>{ part(b,T=>{ E(T,7,2.4,6.4,2.5,rim,SH,2.4); E(T,7,2.3,6.4,1.1,full?'#7CC4EC':'#3E6A8E'); }); if(full) E(b,5,2.1,1.6,.4,'*#DDF4FF'); }); }
const WBOWL=[waterSprite(true,'#5A9FD4'),waterSprite(false,'#5A9FD4')];
const WBOWL_FANCY=[waterSprite(true,'#FFFFFF'),waterSprite(false,'#FFFFFF')];
