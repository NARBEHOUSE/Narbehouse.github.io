'use strict';
/* ================= The home: spots, items, drawing =================
   The room has fixed spots. Each spot takes one kind of item, so a window only ever goes on a
   wall, furniture only stands on the floor, and nothing is placed where the pet sits.
   Wall: y 0-55, baseboard 55-61, floor 61-96. The pet sits in the middle (x 42-86, y 43-87). */
const SPOTS=[
  {id:'wallL',zone:'wall',label:'Left wall',box:[4,7,40,31]},
  {id:'wallC',zone:'wall',label:'Middle wall',box:[46,7,36,29]},
  {id:'wallR',zone:'wall',label:'Right wall',box:[86,7,38,31]},
  {id:'ceil',zone:'ceil',label:'Ceiling',box:[0,0,128,10]},
  {id:'backL',zone:'back',label:'Back left',box:[2,38,43,23]},
  {id:'backC',zone:'back',label:'Back middle',box:[43,38,42,23]},
  {id:'backR',zone:'back',label:'Back right',box:[85,38,42,23]},
  {id:'floorL',zone:'bed',label:'Bed',box:[2,60,38,20]},
  {id:'floorR',zone:'floor',label:'Front right',box:[117,57,26,35]},
  {id:'rug',zone:'rug',label:'Rug',box:[32,73,64,16]}
];
const SPOT=Object.fromEntries(SPOTS.map(s=>[s.id,s]));
const ZONE_WORD={wall:'wall decorations',ceil:'ceiling decorations',back:'pieces of furniture',floor:'floor items',rug:'rugs',bed:'beds'};
/* Care stations: things in the room that are also the choices (Feed, Play, Walk, Bath, Nap). */
/* In the compact room the bath caddy stands at the back and the toy basket in front of it, with a gap
   between them, and the basket just clear of the litter box or potty pad. */
const STATION={feed:[88,84.5],water:[103,86],basket:[-16.5,80.5],bath:[-15.5,59.5],door:[128,22]};

/* ---- Item art ---- */
const wood=(c)=>(x,y)=>alt2(y*.5+Math.sin(x*.7)*.3,c,shade(c,-.05));
const DECOR={};
function item(id,zone,label,unlock,w,h,draw,extra){ DECOR[id]=Object.assign({id,zone,label,unlock,w,h,draw},extra||{}); }
/* unlock: a number of care stars, or {ms:'id'} for a milestone gift. */
const spriteCache={};
function itemSprite(id){ if(spriteCache[id]) return spriteCache[id]; const d=DECOR[id]; if(!d.draw) return null; return spriteCache[id]=sprite(d.w,d.h,b=>d.draw(b),Object.assign(d.noInk?{ink:false}:{},{padX:d.zone==='ceil'?0:4,padY:4})); }

// Wall
item('window','wall','Window',0,34,31,b=>{ part(b,T=>{ R(T,2,0,30,28,(x,y)=>(x>4&&x<30&&y>2&&y<26&&!(x>15.8&&x<18.2)&&!(y>12.8&&y<15.2))?null:'#FFF7E6',SH,1.2); }); part(b,T=>R(T,0,26.6,34,3.6,'#FFF7E6',SH,.8)); },{fixed:true,glass:[6,3,22,21]});
item('frameWood','wall','Wood picture frame',0,24,20,b=>part(b,T=>R(T,0,0,24,20,(x,y)=>(x>3&&x<21&&y>3&&y<17)?null:wood('#A0703F')(x,y),SH,.6)),{pic:[3,3,18,14]});
item('frameRound','wall','Round picture frame',19,22,22,b=>part(b,T=>E(T,11,11,11,11,(x,y,nx,ny)=>(nx*nx+ny*ny)<.54?null:'#E0B84A',SH)),{pic:[3,3,16,16],round:true});
item('frameGold','wall','Golden picture frame',53,26,22,b=>{ part(b,T=>R(T,0,0,26,22,(x,y)=>(x>4&&x<22&&y>4&&y<18)?null:'#E0B84A',SH,1)); [[1.6,1.6],[24.4,1.6],[1.6,20.4],[24.4,20.4],[13,1.2],[13,20.8]].forEach(([x,y])=>part(b,T=>E(T,x,y,1.4,1.4,'#F4D27A',SH))); },{pic:[4,4,18,14]});
item('heartArt','wall','Heart painting',0,21,19,b=>{ part(b,T=>R(T,0,0,21,19,(x,y)=>(x>2.5&&x<18.5&&y>2.5&&y<16.5)?'#FFF7E6':wood('#C08A5A')(x,y),SH,.5)); part(b,T=>heartShape(T,10.5,7.6,2.4,'#D9577A',SH)); [[5,5],[16,5],[5,14],[16,14]].forEach(([x,y])=>D(b,x,y,'#F4B6C6')); });
item('pawPoster','wall','Paw print poster',7,18,22,b=>{ part(b,T=>R(T,0,0,18,22,'#FFF3D6',SHS)); pawPrint(b,9,11,2.6,'#E0864A'); [[1.4,1.4],[16.6,1.4]].forEach(([x,y])=>R(b,x-1.2,y-.8,2.4,1.6,'#9FC4E8AA')); });
item('clock','wall','Cuckoo clock',13,18,24,b=>{ part(b,T=>{ Tr(T,-1,7,19,7,9,0,'#8A5A34',SH); R(T,1.5,6,15,14,wood('#B07A4A'),SH,.6); }); part(b,T=>E(T,9,12.6,5.4,5.4,'#FFF7E6',SH)); for(let i=0;i<12;i++){ const a=i/12*TAU, big=i%3===0, r0=big?3.4:4, r1=4.7; Ln(b,9+Math.cos(a)*r0,12.6+Math.sin(a)*r0,9+Math.cos(a)*r1,12.6+Math.sin(a)*r1,'*#5A3A22',big?2:1); } part(b,T=>R(T,7.6,20,2.8,3.6,'#E0B84A',SH,1)); },{live:'clock'});
item('mirror','wall','Oval mirror',33,17,24,b=>{ part(b,T=>E(T,8.5,12,8.5,12,'#E0B84A',SH)); E(b,8.5,12,6.6,10,(x,y)=>((x+y*.6)%9<2)?'#EAF6FC':'#BFE0EE'); });
item('wallShelf','wall','Wall shelf',25,32,17,b=>{ part(b,T=>R(T,0,13.4,32,2.6,wood('#A0703F'),SH,.4)); part(b,T=>{ R(T,3,6,5,7.6,'#D8765A',SH,.6); }); part(b,T=>{ E(T,5.5,3.6,3.2,3.4,'#6E9B7B',SH); }); [['#5A8FC4',12,7],['#E0567D',15,6],['#F4C542',18,7.5],['#7FB08C',21,6.5]].forEach(([c,x,h])=>part(b,T=>R(T,x,13.4-h,2.8,h,c,SH,.3))); part(b,T=>E(T,27.5,10.6,2.8,2.8,'#D8E24A',SH)); });
item('corkboard','wall','Corkboard',41,28,20,b=>{ part(b,T=>R(T,0,0,28,20,(x,y)=>(x>1.8&&x<26.2&&y>1.8&&y<18.2)?((hash2(Math.floor(x*2),Math.floor(y*2),3)<.2)?'#B8844E':'#CF9A62'):'#8A5A34',SH,.5));
  [[3,3,8,7,'#FFF3D6'],[13,2.6,7,8,'#DDF0FF'],[20,5,5.5,6,'#FFE0EA'],[5,11,9,6,'#E6F6DC'],[16,11.6,8,5.6,'#FFF3B0']].forEach(([x,y,w,h,c])=>part(b,T=>R(T,x,y,w,h,c,SHS))); [[7,3.6],[16.5,3.2],[22.7,5.6],[9.5,11.6],[20,12.2]].forEach(([x,y])=>E(b,x,y,.7,.7,'#E0567D')); });
item('wreath','wall','Flower wreath',67,20,20,b=>{ part(b,T=>E(T,10,10,9.4,9.4,(x,y,nx,ny)=>(nx*nx+ny*ny)<.36?null:alt2(Math.atan2(ny,nx)*3,'#5FA873','#4A8A5E'),SH)); for(let i=0;i<8;i++){ const a=i/8*TAU; part(b,T=>E(T,10+Math.cos(a)*7.3,10+Math.sin(a)*7.3,1.3,1.3,['#F07A8E','#F4C542','#FFFFFF','#B89AD8'][i%4],SH)); } part(b,T=>{ Tr(T,6.4,15.8,10,17.6,6.4,19.6,'#D9403E',SH); Tr(T,13.6,15.8,10,17.6,13.6,19.6,'#D9403E',SH); }); });
item('trophyShelf','wall','Best Friends trophy',{ms:'award'},24,21,b=>{ part(b,T=>R(T,0,17.6,24,2.6,wood('#8A6234'),SH,.3)); part(b,T=>{ R(T,9,14,6,3.8,'#C98A12',SH); R(T,11,9.6,2,4.6,'#E0B84A',SH); E(T,12,5.6,5,4.4,'#F4C542',SH,null,6.4); E(T,12,5.6,5,1.4,'#F4C542',SH); }); [[6,6],[18,6]].forEach(([x,y])=>part(b,T=>E(T,x,y,1.6,2.2,'#F4C542',SH))); D(b,10.6,4.6,'*#FFF3B0'); });
// Ceiling
item('lights','ceil','Twinkly string lights',{ms:'lights'},128,10,b=>{ for(let x=0;x<128;x+=.5) D(b,x,2.4+Math.sin(x/128*Math.PI)*4,'#5A4A3A'); for(let i=0;i<17;i++){ const x=4+i*7.4, y=2.6+Math.sin(x/128*Math.PI)*4; part(b,T=>E(T,x,y+2,1.4,1.8,['#F07A8E','#F4C96A','#7FB08C','#7FA8D8'][i%4],SH)); } },{live:'lights',noInk:true});
/* Party bunting: a string that swags between little pins, with pennant flags hanging from it. */
item('bunting','ceil','Party bunting',15,128,11,b=>{ const sy=x=>1.2+Math.sin(((x%32)+32)%32/32*Math.PI)*2.4, C=['#E0567D','#F4C542','#5FA873','#5A8FC4','#B89AD8','#F08A4A'];
  for(let i=0;i<16;i++){ const x=1+i*8, y1=sy(x)+.3, y2=sy(x+6)+.3, ym=sy(x+3)+.3, c=C[i%6];
    part(b,T=>{ Tr(T,x,y1,x+6,y2,x+3,ym+7,c,SH); Tr(T,x,y1,x+6,y2,x+3,Math.min(y1,y2)-.2,c); });
    if(i%2) E(b,x+3,ym+2.6,.75,.75,'*#FFFFFF'); else [[x+2,ym+1.8],[x+4,ym+1.8],[x+3,ym+3.6]].forEach(([dx,dy])=>D(b,dx,dy,'*#FFFFFF')); }
  for(let x=0;x<128;x+=.5) D(b,x,sy(x),'#7A5A3A'); for(let x=0;x<=128;x+=32) part(b,T=>E(T,Math.min(127.4,Math.max(.6,x)),1,.9,.9,'#C9A04A',SH)); });
item('lanterns','ceil','Paper lanterns',38,128,10,b=>{ [12,36,64,92,116].forEach((x,i)=>{ const l=i%2?2:4; Ln(b,x,0,x,l,'#8A6A4A',1); part(b,T=>E(T,x,l+3,3.2,2.8,['#F07A8E','#F4C542','#E0864A','#B89AD8','#7FB08C'][i],SH)); R(b,x-1.6,l,3.2,.8,'#8A6A4A'); for(let k=-1;k<=1;k++) Ln(b,x+k*1.4,l+.8,x+k*1.4,l+5.4,'*#FFFFFF55',1); }); });
item('garland','ceil','Flower garland',56,128,10,b=>{ part(b,T=>{ for(let x=0;x<128;x+=1.5) E(T,x,2.4+Math.sin(x/21*Math.PI)*1.8,1.6,1.3,alt2(x*.4,'#5FA873','#4A8A5E')); }); for(let x=6;x<128;x+=12) part(b,T=>E(T,x,2.4+Math.sin(x/21*Math.PI)*1.8,1.5,1.5,['#F07A8E','#FFFFFF','#F4C542'][Math.floor(x/12)%3],SH)); });
item('starMobile','ceil','Star mobile',78,128,10,b=>{ [[18,4],[34,7],[52,3],[76,6],[96,4],[112,7]].forEach(([x,l],i)=>{ Ln(b,x,0,x,l,'#C8C0B0',1); part(b,T=>{ for(let k=0;k<5;k++){ const a=-Math.PI/2+k*TAU/5; Tr(T,x,l+1.6,x+Math.cos(a-.6)*.9,l+1.6+Math.sin(a-.6)*.9,x+Math.cos(a)*2.3,l+1.6+Math.sin(a)*2.3,i%2?'#F4C542':'#FFE9A8',SHS); Tr(T,x,l+1.6,x+Math.cos(a+.6)*.9,l+1.6+Math.sin(a+.6)*.9,x+Math.cos(a)*2.3,l+1.6+Math.sin(a)*2.3,i%2?'#F4C542':'#FFE9A8',SHS); } }); }); });
// Back furniture (stands against the wall)
item('couch','back','Comfy couch',{ms:'couch'},40,21,b=>{ part(b,T=>R(T,3,0,34,11,'#7FA8D8',SH,2)); part(b,T=>{ R(T,0,6,5,12,'#6A92C4',SH,1.6); R(T,35,6,5,12,'#6A92C4',SH,1.6); }); part(b,T=>{ R(T,4,10,16,7,'#9FC4E8',SH,1); R(T,20,10,16,7,'#9FC4E8',SH,1); }); part(b,T=>R(T,1,16.4,38,2.2,'#5A7FB0',SH)); [[4,18.4],[35,18.4]].forEach(([x,y])=>R(b,x,y,1.4,2.6,'#5A3C22')); part(b,T=>E(T,9,7.4,3.8,2.8,'#F2A7B5',SH)); part(b,T=>E(T,31,7.4,3.8,2.8,'#F4D27A',SH)); });
item('toyShelf','back','Toy shelf',{ms:'shelf'},34,17,b=>{ part(b,T=>R(T,0,0,34,17,(x,y)=>((x>1.4&&x<11.2)||(x>12.4&&x<21.6)||(x>22.8&&x<32.6))&&((y>1.4&&y<7.8)||(y>9&&y<15.6))?'#8A6234':wood('#C08A5A')(x,y),SH,.5));
  part(b,T=>E(T,6.3,5.6,2.4,2.2,'#D8E24A',SH)); part(b,T=>R(T,14.6,3.6,5,4.2,'#F07A8E',SH,.4)); part(b,T=>E(T,27.6,5.6,2.3,2.2,'#C77DBA',SH)); part(b,T=>R(T,3.4,11.4,6,4.2,'#5A8FC4',SH,.4)); part(b,T=>E(T,17,13.4,3.2,2,'#F4C542',SH)); part(b,T=>E(T,27.6,13.2,2.4,2.3,'#7FB08C',SH)); });
item('bookcase','back','Bookcase',17,26,23,b=>{ part(b,T=>R(T,0,0,26,23,(x,y)=>(x>1.5&&x<24.5&&((y>1.5&&y<10.4)||(y>11.8&&y<21.4)))?'#6A4428':wood('#A0703F')(x,y),SH,.5));
  const cs=['#D9403E','#5A8FC4','#F4C542','#5FA873','#B89AD8','#E0864A','#7FA8D8']; [[2,10.4],[2,21.4]].forEach(([x0,y0],r)=>{ let x=x0; for(let i=0;x<23.6;i++){ const w=1.6+hash2(i,r,5)*1.4, h=6.4+hash2(i,r,9)*2.4; part(b,T=>R(T,x,y0-h,w,h,cs[(i+r*3)%cs.length],SHS)); x+=w+.3; } }); });
item('armchair','back','Armchair',29,26,21,b=>{ part(b,T=>R(T,3,0,20,12,'#E88AAA',SH,3)); part(b,T=>{ R(T,0,6,5.4,12,'#D9708F',SH,2); R(T,20.6,6,5.4,12,'#D9708F',SH,2); }); part(b,T=>R(T,4.6,10,16.8,7,'#F2A7C0',SH,1.2)); [[3,18],[21.6,18]].forEach(([x,y])=>R(b,x,y,1.4,2.8,'#5A3C22')); });
item('catTree','back','Cat tree',36,22,23,b=>{ part(b,T=>R(T,1,20,20,3,'#9A7AB0',SH,.6)); part(b,T=>R(T,8.6,3,4.8,17.4,(x,y)=>alt2(y*1.1,'#D8C090','#C4A870'),SH)); part(b,T=>R(T,2,8,18,3,'#9A7AB0',SH,.6)); part(b,T=>R(T,4,0,14,3.2,'#9A7AB0',SH,.8)); Ln(b,18,11,18,15.6,'#F4E4C8',1); part(b,T=>E(T,18,16.6,1.5,1.5,'#F2A7B5',SH)); });
item('sideboard','back','Lamp and dresser',47,30,23,b=>{ part(b,T=>R(T,0,9,30,12.6,wood('#B07A4A'),SH,.6)); [[1.6,11],[15.6,11]].forEach(([x,y])=>part(b,T=>R(T,x,y,12.8,4.4,'#C99A62',SH,.4))); [[1.6,16.2],[15.6,16.2]].forEach(([x,y])=>part(b,T=>R(T,x,y,12.8,4,'#C99A62',SH,.4))); [7.6,21.6].forEach(x=>{ E(b,x,13.2,.6,.6,'#F4C542'); E(b,x,18.2,.6,.6,'#F4C542'); });
  part(b,T=>R(T,21,6.4,4,2.8,'#8A6234',SH,.4)); Ln(b,23,1.8,23,6.6,'#8A6234',2); part(b,T=>Tr(T,17.6,4.6,28.4,4.6,23,-.4,'#FFE9A8',SHS)); part(b,T=>E(T,6,7.6,2.4,1.6,'#5FA873',SH)); },{live:'lamp',lamp:[23,3]});
item('fireplace','back','Cozy fireplace',61,32,23,b=>{ part(b,T=>R(T,0,0,32,23,(x,y)=>(x>6&&x<26&&y>7&&y<23)?null:((alt(y*.8)?alt(x*.35):alt(x*.35+.5))?'#C9704E':'#B8603E'),SH,.4)); part(b,T=>R(T,-1,5,34,2.6,wood('#8A5A34'),SH,.4)); },{live:'fire',hole:[6,7,20,16]});
item('fishTank','back','Fish tank',71,30,22,b=>{ part(b,T=>R(T,1,14,28,8,wood('#8A6234'),SH,.4)); part(b,T=>R(T,0,0,30,14.4,(x,y)=>(x>1.2&&x<28.8&&y>1.4&&y<13)?null:'#6A7A8A',SH,.6)); },{live:'fish',tank:[1.2,1.4,27.6,11.6]});
item('piano','back','Piano',90,34,22,b=>{ part(b,T=>R(T,0,0,34,19,'#3A2E36',SH,1)); part(b,T=>R(T,1,10.4,32,3.6,(x)=>((x+.3)%2.6<.35)?'#8A8090':'#FFFFFF')); for(let x=2.6;x<32;x+=2.6) if([0,1,3,4,5].includes(Math.floor(x/2.6)%7)) R(b,x-.5,10.4,1.1,2.2,'#1C1418'); [[2,19],[30.6,19]].forEach(([x,y])=>R(b,x,y,1.4,3,'#2A2228')); part(b,T=>R(T,11,2.4,12,5,'#FFF7E6',SHS)); });
// Floor items (front corners, beside the pet)
/* A pointed leaf from its base (bx,by) to its tip (tx,ty), w wide at the middle. */
function plantLeaf(T,bx,by,tx,ty,w,c){ const mx=(bx+tx)/2, my=(by+ty)/2, L=Math.hypot(tx-bx,ty-by)||1, px=(ty-by)/L*w, py=(bx-tx)/L*w;
  Tr(T,bx,by,tx,ty,mx+px,my+py,c,SH); Tr(T,bx,by,tx,ty,mx-px,my-py,c,SH); }
/* A leafy plant: a fan of pointed leaves (darker ones behind), each with a light vein, in a terracotta
   pot with a rim, a band, and soil showing at the top. */
const PLANT_FRONT=[[.8,16.2,1.5,'#6E9B7B'],[15.2,16.2,1.5,'#6E9B7B'],[8,.6,2.1,'#6E9B7B'],[4.4,7.4,1.7,'#86B592'],[11.6,7.4,1.7,'#86B592']];
item('plant','floor','Potted plant',0,16,31,b=>{
  part(b,T=>{ [[1.4,9.8,1.9],[14.6,9.8,1.9],[3.8,3.2,1.8],[12.2,3.2,1.8]].forEach(([x,y,w])=>plantLeaf(T,8,19.5,x,y,w,'#4F7A5D')); });
  part(b,T=>PLANT_FRONT.forEach(([x,y,w,c])=>plantLeaf(T,8,19.5,x,y,w,c)));
  PLANT_FRONT.forEach(([x,y])=>Ln(b,8+(x-8)*.3,19.5+(y-19.5)*.3,8+(x-8)*.78,19.5+(y-19.5)*.78,'*#B4DDBC',1));
  part(b,T=>{ R(T,2.2,21.6,11.6,9.2,'#D8765A',SH,.6); R(T,1,19.4,14,2.8,'#B85E45',SH,.4); });
  R(b,2,19.7,12,.9,'*#6B4A2B'); R(b,2.6,25.4,10.8,.7,'*#C0654B'); R(b,3.4,22.6,1,6.8,'*#E89A7E'); });
item('petBed','bed','Snuggly pet bed',0,28,11,b=>{ part(b,T=>E(T,14,6.4,13.8,4.6,'#6E9FD0',SH)); part(b,T=>E(T,14,5.6,10.4,2.6,'#DDEBF8',SHL)); });
item('bed','bed','Cozy pet bed',{ms:'bed'},28,12,b=>{ part(b,T=>E(T,14,7,13.8,5,'#8A5A8A',SH)); part(b,T=>E(T,14,6.2,10.4,3,'#F2A7B5',SHL)); E(b,11,5.4,3.6,.9,'*#F7C4CF'); });
item('royalBed','bed','Royal pet bed',{ms:'bed2'},30,15,b=>{ part(b,T=>E(T,15,10,14.8,5,'#C98A12',SH)); part(b,T=>E(T,15,9.4,12.4,3.6,'#8A4AA0',SHL)); part(b,T=>{ R(T,11,1,8,4.4,'#F4C542',SH,.4); [11.6,15,18.4].forEach(x=>Tr(T,x-1.1,1.4,x+1.1,1.4,x,-1.2,'#F4C542')); }); E(b,15,3.2,.8,.8,'#D9577A'); });
item('cushion','floor','Floor cushion',14,24,9,b=>{ part(b,T=>E(T,12,5,11.6,4,'#9CC7A7',SH)); E(b,12,4.4,7,2,(x,y,nx,ny)=>Math.abs(nx*nx+ny*ny-.5)<.08?'#FFFFFF':null); E(b,12,4.4,1,.7,'#5FA873'); });
item('beanbag','floor','Beanbag',23,24,15,b=>{ part(b,T=>{ E(T,12,9.6,11.8,5.4,'#E0864A',SH); E(T,10,5.4,7.4,4.8,'#E8965A',SH); }); });
item('bigPlant','floor','Big leafy plant',31,20,32,b=>{ [[4,8,-1],[16,7,1],[10,3,0],[3,15,-1],[17,15,1]].forEach(([x,y,s])=>part(b,T=>E(T,x,y,4.4,3.4,(px,py,nx)=>((nx*s>.1)&&Math.abs(nx)<.14)?'#86B592':'#5FA873',SH))); Ln(b,10,6,10,21,'#4A7A50',2); part(b,T=>{ R(T,3,20.4,14,2.4,'#E6E1DA',SH,.4); R(T,4,22.4,12,9.4,'#F4F0EA',SH,.8); }); });
item('sunflower','floor','Sunflower pot',43,14,29,b=>{ Ln(b,7,8,7,20,'#4F7A5D',2); part(b,T=>{ E(T,4,14,2.6,1.3,'#5FA873',SH); E(T,10,12,2.6,1.3,'#5FA873',SH); }); part(b,T=>{ for(let i=0;i<10;i++){ const a=i/10*TAU; E(T,7+Math.cos(a)*3.4,6+Math.sin(a)*3.4,1.6,1.6,'#F4C542',SHS); } }); part(b,T=>E(T,7,6,2.4,2.4,'#8A5A34',SH)); part(b,T=>{ R(T,1.6,19.4,10.8,2.4,'#5A8FC4',SH,.4); R(T,2.6,21.4,8.8,7.4,'#6E9FD0',SH,.6); }); });
item('floorLamp','floor','Floor lamp',51,14,34,b=>{ part(b,T=>Tr(T,1,8.6,13,8.6,7,0,'#FFE9A8',SHS)); Ln(b,7,8.6,7,31,'#8A6234',2); part(b,T=>E(T,7,32.4,4.4,1.4,'#8A6234',SH)); },{live:'lamp',lamp:[7,5]});
item('toyChest','floor','Toy chest',63,24,15,b=>{ part(b,T=>R(T,0,4,24,11,wood('#B07A4A'),SH,.6)); part(b,T=>R(T,-.4,1,24.8,4.4,wood('#C08A5A'),SH,1.6)); part(b,T=>{ for(let k=0;k<5;k++){ const a=-Math.PI/2+k*TAU/5; Tr(T,12,9.6,12+Math.cos(a-.6)*1.2,9.6+Math.sin(a-.6)*1.2,12+Math.cos(a)*3,9.6+Math.sin(a)*3,'#F4C542',SHS); Tr(T,12,9.6,12+Math.cos(a+.6)*1.2,9.6+Math.sin(a+.6)*1.2,12+Math.cos(a)*3,9.6+Math.sin(a)*3,'#F4C542',SHS); } }); });
// Rugs, drawn flat under the pet
item('rugRound','rug','Sunny round rug',0,62,16,null,{rug:g=>{ pxEll(g,64,84,31,7.5,'#D98E3A'); pxEll(g,64,84,29.5,6.2,'#F4C96A'); pxEll(g,64,84,23,4,'#FFE9A8'); pxEll(g,64,84,21,3,'#F4C96A'); }});
item('rugStripe','rug','Striped rug',9,62,16,null,{rug:g=>{ pxEll(g,64,84,31,7.5,'#3E6FA4'); g.save(); g.beginPath(); g.ellipse(64,84,29.6,6.4,0,0,TAU); g.clip(); for(let x=30;x<100;x+=6) rect(g,x,76,3,16,'#9FC4E8'); g.restore(); }});
item('rugBlue','rug','Cozy blue rug',20,62,16,null,{rug:g=>{ pxEll(g,64,84,31,7.5,'#2F5A88'); pxEll(g,64,84,29.4,6.4,'#5A8FC4'); pxRing(g,64,84,25,4.8,.7,'#DDF0FF'); }});
item('rugPaw','rug','Paw print rug',32,62,16,null,{rug:g=>{ pxEll(g,64,84,31,7.5,'#8A6A4A'); pxEll(g,64,84,29.6,6.4,'#F2D9B0'); [[46,84],[82,84],[64,81.5]].forEach(([x,y])=>{ pxEll(g,x,y+1,2.6,1.3,'#C98A5A'); [-2.2,-.8,.8,2.2].forEach(d=>pxEll(g,x+d,y-.9+Math.abs(d)*.25,.8,.6,'#C98A5A')); }); }});
item('rugHeart','rug','Heart rug',45,62,16,null,{rug:g=>{ pxEll(g,55,82.4,11,5,'#C9477A'); pxEll(g,73,82.4,11,5,'#C9477A'); g.fillStyle='#C9477A'; g.beginPath(); g.moveTo(44,83.4); g.lineTo(84,83.4); g.lineTo(64,92); g.fill(); pxEll(g,55,82.6,9.6,3.9,'#F07A9E'); pxEll(g,73,82.6,9.6,3.9,'#F07A9E'); g.fillStyle='#F07A9E'; g.beginPath(); g.moveTo(46.4,83.6); g.lineTo(81.6,83.6); g.lineTo(64,90.4); g.fill(); }});
item('rugRainbow','rug','Rainbow rug',{ms:'rug'},62,16,null,{rug:g=>{ ['#C9573E','#E8757A','#F4B942','#F4E27A','#8CC98A','#7FA8D8','#B89AD8'].forEach((c,i)=>pxEll(g,64,84,31-i*3.6,7.5-i*.9,c)); }});
item('rugStar','rug','Starry rug',69,62,16,null,{rug:g=>{ pxEll(g,64,84,31,7.5,'#1E2A55'); pxEll(g,64,84,29.6,6.4,'#34406E'); [[44,83],[54,80.6],[64,86],[74,80.8],[84,83.4],[58,87.6],[70,88]].forEach(([x,y])=>{ rect(g,x-1,y,2,.5,'#FFE27A'); rect(g,x-.25,y-.75,.5,2,'#FFE27A'); }); }});

/* ---- Walls, floors, curtains, pictures ----
   Wallpapers and floors take bounds B {x0,x1,y0,y1} so the room reaches every edge of the screen:
   the wall fills from the top of the view down to the baseboard, the floor from there to the bottom. */
const al=(v,p)=>Math.floor(v/p)*p;
const WALLPAPERS={
  mint:{label:'Mint dots',unlock:0,draw:(g,B)=>{ rect(g,B.x0,B.y0,B.x1-B.x0,56-B.y0,'#CFE6D8'); for(let y=al(B.y0,14)+3,r=0;y<54;y+=7,r++) for(let x=al(B.x0,8)+(r%2?3:7);x<B.x1;x+=8) pxEll(g,x,y,.6,.6,'#B4D4C0'); }},
  hearts:{label:'Pink hearts',unlock:8,draw:(g,B)=>{ rect(g,B.x0,B.y0,B.x1-B.x0,56-B.y0,'#F8E0E8'); for(let y=al(B.y0,20)+5,r=0;y<54;y+=10,r++) for(let x=al(B.x0,10)+(r%2?5:10);x<B.x1;x+=10){ pxEll(g,x-.8,y,1,1,'#F2B6C8'); pxEll(g,x+.8,y,1,1,'#F2B6C8'); g.fillStyle='#F2B6C8'; g.beginPath(); g.moveTo(x-1.8,y+.3); g.lineTo(x+1.8,y+.3); g.lineTo(x,y+2.3); g.fill(); } }},
  blueStripe:{label:'Blue stripes',unlock:16,draw:(g,B)=>{ rect(g,B.x0,B.y0,B.x1-B.x0,56-B.y0,'#DCEBF8'); for(let x=al(B.x0,8);x<B.x1;x+=8) rect(g,x,B.y0,3.5,56-B.y0,'#C4DBF0'); }},
  stars:{label:'Starry wallpaper',unlock:{ms:'wallpaper'},draw:(g,B)=>{ rect(g,B.x0,B.y0,B.x1-B.x0,56-B.y0,'#F4E2EC'); for(let x=al(B.x0,10);x<B.x1;x+=10) rect(g,x,B.y0,4,56-B.y0,'#EFD6E4'); for(let y=al(B.y0,18)+5,r=0;y<54;y+=9,r++) for(let x=al(B.x0,10)+(r%2?4:9);x<B.x1;x+=10){ rect(g,x-.25,y-.25,.5,2.5,'#F4C542'); rect(g,x-1.25,y+.75,2.5,.5,'#F4C542'); } }},
  flowers:{label:'Sunny flowers',unlock:30,draw:(g,B)=>{ rect(g,B.x0,B.y0,B.x1-B.x0,56-B.y0,'#FBF1CC'); for(let y=al(B.y0,22)+6,r=0;y<54;y+=11,r++) for(let x=al(B.x0,12)+(r%2?6:12);x<B.x1;x+=12){ [0,1,2,3,4].forEach(i=>{ const a=i/5*TAU; pxEll(g,x+Math.cos(a)*1.3,y+Math.sin(a)*1.3,.9,.9,'#F7C8D4'); }); pxEll(g,x,y,.7,.7,'#F4B942'); } }},
  lavender:{label:'Lavender diamonds',unlock:44,draw:(g,B)=>{ rect(g,B.x0,B.y0,B.x1-B.x0,56-B.y0,'#E6DDF4'); g.fillStyle='#D6C8EC'; for(let y=al(B.y0,16),r=0;y<58;y+=8,r++) for(let x=al(B.x0,8)+(r%2?4:0);x<B.x1+4;x+=8){ g.beginPath(); g.moveTo(x,y-3); g.lineTo(x+3,y); g.lineTo(x,y+3); g.lineTo(x-3,y); g.fill(); } }},
  clouds:{label:'Sky and clouds',unlock:58,draw:(g,B)=>{ vgrad(g,B.x0,B.y0,B.x1-B.x0,56-B.y0,[[0,'#B6DDF6'],[1,'#DDF0FC']]); for(let t=al(B.x0,128);t<B.x1;t+=128) [[14,10],[48,22],[88,8],[112,30],[30,40],[74,42]].forEach(([x,y])=>{ pxEll(g,t+x,y,6,2.2,'#FFFFFF'); pxEll(g,t+x+3,y-1.4,3.6,2.2,'#FFFFFF'); }); }},
  plaid:{label:'Cozy plaid',unlock:76,draw:(g,B)=>{ rect(g,B.x0,B.y0,B.x1-B.x0,56-B.y0,'#F2DCD0'); g.fillStyle='rgba(201,87,62,.18)'; for(let x=al(B.x0,12);x<B.x1;x+=12) g.fillRect(x,B.y0,4,56-B.y0); for(let y=al(B.y0,12);y<56;y+=12) g.fillRect(B.x0,y,B.x1-B.x0,Math.min(4,56-y)); g.fillStyle='rgba(255,255,255,.4)'; for(let x=al(B.x0,12)+6;x<B.x1;x+=12) g.fillRect(x,B.y0,.5,56-B.y0); }}
};
const FLOORS={
  oak:{label:'Honey wood floor',unlock:0,draw:(g,B)=>planks(g,'#D9A066','#C58A52',B)},
  maple:{label:'Light maple floor',unlock:12,draw:(g,B)=>planks(g,'#EAC48E','#D8AE76',B)},
  cherry:{label:'Cherry wood floor',unlock:26,draw:(g,B)=>planks(g,'#B06A48','#985838',B)},
  checker:{label:'Checker tiles',unlock:40,draw:(g,B)=>{ for(let y=61,r=0;y<B.y1;y+=6,r++) for(let x=al(B.x0,16),c=0;x<B.x1;x+=8,c++) rect(g,x,y,8,6,(r+c)%2?'#F4EEE2':'#6A8FB8'); }},
  carpet:{label:'Soft blue carpet',unlock:54,draw:(g,B)=>{ rect(g,B.x0,61,B.x1-B.x0,B.y1-61,'#7C9CC8'); const n=Math.round((B.x1-B.x0)*(B.y1-61)/9); for(let i=0;i<n;i++) rect(g,B.x0+hash2(i,1,4)*(B.x1-B.x0),61+hash2(i,2,4)*(B.y1-61),.5,.5,i%2?'#8AAAD4':'#6E8EBA'); }},
  stone:{label:'Stone tiles',unlock:72,draw:(g,B)=>{ rect(g,B.x0,61,B.x1-B.x0,B.y1-61,'#C8C4BC'); for(let y=61,r=0;y<B.y1;y+=7,r++){ rect(g,B.x0,y,B.x1-B.x0,.5,'#A8A49C'); for(let x=al(B.x0,12)+(r%2?6:0);x<B.x1;x+=12) rect(g,x,y,.5,7,'#A8A49C'); } }},
  pinkTile:{label:'Pink tiles',unlock:86,draw:(g,B)=>{ for(let y=61,r=0;y<B.y1;y+=6,r++) for(let x=al(B.x0,12),c=0;x<B.x1;x+=6,c++) rect(g,x,y,6,6,(r+c)%2?'#F8D8E2':'#FBE8EE'); for(let y=61;y<B.y1;y+=6) rect(g,B.x0,y,B.x1-B.x0,.5,'#EEC6D4'); }}
};
const viewBounds=()=>({x0:VIEW.x-1,x1:VIEW.x+VIEW.w+1,y0:VIEW.y-1,y1:VIEW.y+VIEW.h+1});
function planks(g,a,l,B){ if(typeof B==='number') B={x0:0,x1:B,y1:96}; B=B||viewBounds(); const w=B.x1-B.x0; rect(g,B.x0,61,w,B.y1-61,a);
  for(let i=0,y0=61;y0<B.y1;i++,y0+=6){ if(i>0) rect(g,B.x0,y0,w,.5,l); rect(g,B.x0,y0+.5,w,.5,shade(a,.06)); for(let x=al(B.x0,40)+(i*23)%40;x<B.x1;x+=40) rect(g,x,y0,.5,6,l); } }
const CURTAINS={
  none:{label:'No curtains',unlock:0},
  pink:{label:'Pink curtains',unlock:0,c:'#F2A7B5',p:'#E08CA0'},
  blue:{label:'Blue curtains',unlock:9,c:'#8FB5E8',p:'#6E9AD4'},
  yellow:{label:'Yellow striped curtains',unlock:19,c:'#F6D46A',p:'#FFFFFF',stripe:true},
  green:{label:'Green curtains',unlock:29,c:'#9CCB9A',p:'#7FB08C'},
  lace:{label:'White lace curtains',unlock:39,c:'#FFFFFF',p:'#E8E2DA',lace:true},
  stars:{label:'Starry curtains',unlock:49,c:'#46558A',p:'#34406E',stars:true},
  plaid:{label:'Red plaid curtains',unlock:59,c:'#D9635E',p:'#B8484A',plaid:true},
  rainbow:{label:'Rainbow curtains',unlock:79,rainbow:true}
};
const curtainCache={};
function curtainSprite(id){ if(curtainCache[id]) return curtainCache[id]; const C=CURTAINS[id]; if(!C||id==='none') return null;
  return curtainCache[id]=sprite(42,30,b=>{ part(b,T=>{ R(T,1,1,40,1.6,'#8A6234',SH); }); [1,41].forEach(x=>part(b,T=>E(T,x,1.8,1.4,1.4,'#8A6234',SH)));
    const fill=(x,y)=>{ if(C.rainbow) return ['#E8757A','#F4B942','#F4E27A','#8CC98A','#7FA8D8','#B89AD8'][Math.floor(y/4.4)%6]; if(C.stripe) return alt(x*.7)?C.p:C.c; if(C.plaid) return (alt(x*.5)&&alt(y*.5))?C.p:(alt(x*.5)||alt(y*.5))?mix(C.c,C.p,.5):C.c;
      if(C.stars&&hash2(Math.floor(x*2),Math.floor(y*2),11)<.04) return '#FFE27A'; if(C.lace&&(Math.floor(x*2)+Math.floor(y*2))%5===0) return C.p; return (Math.floor(x*1.1)%3===0)?C.p:C.c; };
    [[1,1],[41,-1]].forEach(([x0,s])=>part(b,T=>{ for(let y=2.6;y<29.6;y+=.5){ const w=y<18?lerp(9,3.4,(y-2.6)/15.4):lerp(3.4,7.4,(y-18)/11.6); R(T,s>0?x0:x0-w,y,w,.5,fill,null); } R(T,s>0?x0:x0-4.2,17.2,4.2,1.6,'#D9577A',SHS); })); }); }
const PICTURES={
  paws:{label:'Paw print art',unlock:0,draw:(g,x,y,w,h)=>{ rect(g,x,y,w,h,'#FFF3D6'); [[.3,.4],[.7,.65]].forEach(([a,c])=>{ const px=x+w*a, py=y+h*c; pxEll(g,px,py+1,2,1.5,'#E0864A'); [-1.6,-.6,.6,1.6].forEach(d=>pxEll(g,px+d,py-1.1+Math.abs(d)*.2,.6,.7,'#E0864A')); }); }},
  sunset:{label:'Sunset painting',unlock:11,draw:(g,x,y,w,h)=>{ vgrad(g,x,y,w,h*.6,[[0,'#F6A07E'],[1,'#FCD9A2']]); pxEll(g,x+w*.5,y+h*.6,w*.18,w*.18,'#FF8A4A'); vgrad(g,x,y+h*.6,w,h*.4,[[0,'#5A8FC4'],[1,'#34406E']]); rect(g,x+w*.3,y+h*.66,w*.4,.5,'#FFC89A'); }},
  flowers:{label:'Flower painting',unlock:21,draw:(g,x,y,w,h)=>{ rect(g,x,y,w,h,'#E6F2E8'); rect(g,x+w*.4,y+h*.62,w*.2,h*.34,'#5A8FC4'); [[.35,.35,'#F07A8E'],[.5,.25,'#F4C542'],[.65,.38,'#B89AD8'],[.5,.45,'#FFFFFF']].forEach(([a,c,col])=>pxEll(g,x+w*a,y+h*c,w*.1,w*.1,col)); }},
  mountains:{label:'Mountain painting',unlock:34,draw:(g,x,y,w,h)=>{ vgrad(g,x,y,w,h,[[0,'#9FD4F0'],[1,'#E0F2FA']]); g.fillStyle='#6E8EA8'; g.beginPath(); g.moveTo(x,y+h); g.lineTo(x+w*.35,y+h*.3); g.lineTo(x+w*.6,y+h*.7); g.lineTo(x+w*.78,y+h*.45); g.lineTo(x+w,y+h); g.fill(); g.fillStyle='#FFFFFF'; g.beginPath(); g.moveTo(x+w*.28,y+h*.42); g.lineTo(x+w*.35,y+h*.3); g.lineTo(x+w*.42,y+h*.42); g.fill(); rect(g,x,y+h*.86,w,h*.14,'#7FB08C'); }},
  fishbowl:{label:'Goldfish painting',unlock:48,draw:(g,x,y,w,h)=>{ rect(g,x,y,w,h,'#FFF7E6'); pxEll(g,x+w*.5,y+h*.56,w*.32,h*.36,'#BFE6F8'); pxEll(g,x+w*.46,y+h*.58,w*.1,h*.08,'#F08A2A'); g.fillStyle='#F08A2A'; g.beginPath(); g.moveTo(x+w*.55,y+h*.58); g.lineTo(x+w*.64,y+h*.5); g.lineTo(x+w*.64,y+h*.66); g.fill(); }},
  rainbow:{label:'Rainbow painting',unlock:64,draw:(g,x,y,w,h)=>{ rect(g,x,y,w,h,'#DDF0FC'); ['#E8757A','#F4B942','#F4E27A','#8CC98A','#7FA8D8','#B89AD8'].forEach((c,i)=>pxRing(g,x+w/2,y+h*.95,w*.44-i*.9,h*.7-i*.9,.9,c)); rect(g,x,y+h*.92,w,h*.08,'#7FB08C'); }},
  portrait:{label:'Photo of you and your pet',unlock:{ms:'photo'},draw:(g,x,y,w,h)=>{ rect(g,x,y,w,h,'#BFE3F2'); rect(g,x,y+h*.66,w,h*.34,'#9CC98A'); const fur=state&&STYLES[state.style]?STYLES[state.style].pal.fur:'#D9A066';
    pxEll(g,x+w*.66,y+h*.52,w*.18,h*.2,fur); rect(g,x+w*.58,y+h*.46,.5,.5,INK); rect(g,x+w*.72,y+h*.46,.5,.5,INK); pxEll(g,x+w*.28,y+h*.45,w*.11,h*.14,'#F2C9A5'); rect(g,x+w*.19,y+h*.6,w*.2,h*.36,'#D9577A'); pxEll(g,x+w*.48,y+h*.26,.8,.8,'#F07A8E'); }}
};

/* ---- Room state ---- */
function defaultRoom(){ return {spots:{wallL:'window',wallC:'frameWood',wallR:'heartArt',ceil:null,backL:null,backC:null,backR:null,floorL:'petBed',floorR:'plant',rug:'rugRound'},wall:'mint',floor:'oak',curtains:'pink',pics:{frameWood:{t:'art',id:'paws'}}}; }
function cleanRoom(r){ const d=defaultRoom(); if(!r||typeof r!=='object') return null; const out={spots:{},wall:WALLPAPERS[r.wall]?r.wall:d.wall,floor:FLOORS[r.floor]?r.floor:d.floor,curtains:CURTAINS[r.curtains]?r.curtains:d.curtains,pics:{}};
  const used=new Set(); SPOTS.forEach(s=>{ const id=r.spots&&r.spots[s.id]; out.spots[s.id]=(id&&DECOR[id]&&DECOR[id].zone===s.zone&&!used.has(id))?id:null; if(out.spots[s.id]) used.add(out.spots[s.id]); });
  if(!out.spots.floorL) out.spots.floorL='petBed';
  if(!used.has('window')){ const free=['wallL','wallC','wallR'].find(k=>!out.spots[k])||'wallL'; out.spots[free]='window'; }
  if(r.grid&&typeof r.grid==='object'&&!Array.isArray(r.grid)){ out.grid={}; Object.keys(r.grid).forEach(k=>{ const v=r.grid[k]; if(typeof v==='string'&&/^[LRC]\d+r\d+$/.test(v)&&/^(bed|potty|bowls|basket|bath|plant|c:\w+)$/.test(k)) out.grid[k]=v; }); }
  if(r.pics&&typeof r.pics==='object') Object.keys(r.pics).forEach(k=>{ const p=r.pics[k]; if(DECOR[k]&&DECOR[k].pic&&p&&(p.t==='photo'?typeof p.d==='number':PICTURES[p.id])) out.pics[k]={t:p.t==='photo'?'photo':'art',id:p.id,d:p.d}; });
  return out; }
const room=()=>state.room||(state.room=defaultRoom());
const spotOf=id=>{ const r=room(); return SPOTS.find(s=>r.spots[s.id]===id)||null; };
function isUnlocked(u){ if(u==null||u===0) return true; if(typeof u==='number') return (state&&state.stars||0)>=u; return !!(u.ms&&msGot().includes(u.ms)); }
const unlockText=u=>typeof u==='number'?`${u} care stars`:'a special reward';
/* Where an item's sprite sits inside its spot. */
function itemPos(id,spotId){ const d=DECOR[id], s=SPOT[spotId], [x,y,w,h]=s.box;
  if(d.zone==='ceil') return {x:0,y:0}; if(d.zone==='rug') return {x:32,y:73};
  if(d.zone==='wall') return {x:Math.round(x+(w-d.w)/2),y:Math.round(y+(h-d.h)/2)};
  /* The bed stands a little back (its front edge at 75), so it never touches the litter box or potty pad. */
  const base=s.base!=null?s.base:spotId==='floorL'?75:spotId==='floorR'?91.5:61.5; return {x:Math.round(x+(w-d.w)/2),y:base-d.h}; }
const WIN=()=>{ const s=spotOf('window')||SPOT.wallL, p=itemPos('window',s.id), gl=DECOR.window.glass; return {x:p.x+gl[0]-2,y:p.y+gl[1]-1,w:gl[2]+4,h:gl[3]+2,cx:p.x+17}; };
function plantAnchor(){ const s=spotOf('plant'); if(!s) return null; const p=itemPos('plant',s.id); return {x:p.x,y:p.y,spot:s.id}; }

/* ---- Drawing the room ---- */
const PHASES=['sunrise','morning','afternoon','sunset','night'];
const SKY={sunrise:['#F2B6A6','#FCD9B2'],morning:['#9FD4F0','#D6EEF8'],afternoon:['#7EC3EC','#B6E0F5'],sunset:['#C8829E','#F6B27E'],night:['#243060','#46558A']};
/* The sky moves through the day every 10 minutes: sunrise, morning, afternoon, sunset, night. */
const skyPhase=()=>PHASES[Math.floor(Date.now()/600000)%5];
function skyMode(){ const p=skyPhase(); return p==='night'?'night':(p==='sunrise'||p==='sunset')?'dusk':'day'; }
function drawSkyBox(g,x,y,w,h,ph){ const S=SKY[ph]; vgrad(g,x,y,w,h,[[0,S[0]],[1,S[1]]]);
  if(ph==='night'){ for(let i=0;i<9;i++) rect(g,x+hash2(i,7,1)*w,y+hash2(i,8,1)*h*.8,.5,.5,'#FFF6C8'); pxEll(g,x+w*.3,y+h*.3,2.6,2.6,'#FFF1B8'); pxEll(g,x+w*.3+1.2,y+h*.3-.8,2.1,2.1,S[0]); }
  else if(ph==='morning'||ph==='afternoon'){ pxEll(g,x+(ph==='morning'?w*.25:w*.75),y+h*.25,2.6,2.6,'#FFE27A'); pxEll(g,x+w*.4,y+h*.55,4,1.4,'#FFFFFF'); pxEll(g,x+w*.5,y+h*.5,2.6,1.6,'#FFFFFF'); }
  else pxEll(g,x+(ph==='sunrise'?w*.25:w*.75),y+h*.95,3.6,3.6,ph==='sunrise'?'#FFB347':'#FF8A4A'); }
const thumbCache=new Map();
function photoThumb(d){ if(thumbCache.has(d)) return thumbCache.get(d); const ph=(state.album||[]).find(p=>p.d===d); if(!ph) return null;
  const c=hdCanvas(128,96); try{ renderPhoto(ph,c.getContext('2d'),true); }catch(e){} thumbCache.set(d,c); if(thumbCache.size>20) thumbCache.delete(thumbCache.keys().next().value); return c; }
function drawPicture(g,itemId,x,y,noPhotos,override){ const d=DECOR[itemId], [px,py,pw,ph2]=d.pic, pic=override||(room().pics[itemId])||{t:'art',id:'paws'}, X=x+px, Y=y+py;
  g.save(); if(d.round){ g.beginPath(); g.ellipse(X+pw/2,Y+ph2/2,pw/2,ph2/2,0,0,TAU); g.clip(); }
  const th=(pic.t==='photo'&&!noPhotos)?photoThumb(pic.d):null;
  if(th){ g.imageSmoothingEnabled=true; const s=Math.max(pw/128,ph2/96); g.drawImage(th,X+pw/2-64*s,Y+ph2/2-48*s,128*s,96*s); g.imageSmoothingEnabled=false; }
  else (PICTURES[pic.t==='art'&&PICTURES[pic.id]?pic.id:'paws']).draw(g,X,Y,pw,ph2);
  g.restore(); }
function drawItem(g,id,spotId,o){ const d=DECOR[id]; if(!d) return; o=o||{};
  if(d.rug){ g.save(); g.translate(0,-RUG_UP); d.rug(g); g.restore(); return; }
  if(d.zone==='ceil'){ const B=o.bounds||viewBounds(), s=itemSprite(id); for(let t=al(B.x0,128);t<B.x1;t+=128) blit(g,s,t,0); return; }
  const p=itemPos(id,spotId);
  if(d.zone==='back'||d.zone==='floor'||d.zone==='bed') softShadow(g,p.x+d.w/2,p.y+d.h-.5,d.w*.55,2.4,.28);
  if(id==='window'){ const gl=d.glass; drawSkyBox(g,p.x+gl[0]-2,p.y+gl[1]-1,gl[2]+4,gl[3]+2,o.phase||skyPhase()); }
  if(d.pic) drawPicture(g,id,p.x,p.y,o.noPhotos,o.picItem===id?o.pic:null);
  if(d.hole){ const [hx,hy,hw,hh]=d.hole; rect(g,p.x+hx,p.y+hy,hw,hh,'#2A1A14'); pxEll(g,p.x+hx+hw/2,p.y+hy+hh-2,hw*.35,1.6,'#6A4428'); }
  if(d.tank){ const [tx,ty,tw,thh]=d.tank; vgrad(g,p.x+tx,p.y+ty,tw,thh,[[0,'#9FD8F0'],[1,'#3E8AB8']]); rect(g,p.x+tx,p.y+ty+thh-2,tw,2,'#E3C58E'); pxEll(g,p.x+tx+4,p.y+ty+thh-3,1,3,'#5FA873'); pxEll(g,p.x+tx+tw-5,p.y+ty+thh-3.5,1.2,3.5,'#4F7A5D'); }
  if(id==='plant'&&o.hidePlant) return;
  blit(g,itemSprite(id),p.x,p.y);
  if(id==='window'){ const c=curtainSprite(o.curtains||room().curtains); if(c) blit(g,c,p.x-4,p.y-3.4); }
}
/* The whole room, cached. o: phase, noPhotos, hidePlant, room (a preview room). */
function drawRoom(g,o){ o=o||{}; const r=o.room||room(), B=o.bounds||viewBounds(), W=B.x1-B.x0;
  (WALLPAPERS[r.wall]||WALLPAPERS.mint).draw(g,B);
  vgrad(g,B.x0,Math.min(0,B.y0),W,14-Math.min(0,B.y0),[[0,'rgba(40,30,20,.16)'],[1,'rgba(40,30,20,0)']]);
  (FLOORS[r.floor]||FLOORS.oak).draw(g,B);
  vgrad(g,B.x0,61,W,8,[[0,'rgba(40,24,10,.2)'],[1,'rgba(40,24,10,0)']]);
  rect(g,B.x0,55,W,6,'#FFF7E6'); rect(g,B.x0,55,W,.5,'#A87B55'); rect(g,B.x0,60.5,W,.5,'#A87B55'); rect(g,B.x0,56,W,.5,'#FFFFFF');
  const saved=state.room; state.room=r;
  try{
    ['wallL','wallC','wallR'].forEach(k=>{ if(r.spots[k]) drawItem(g,r.spots[k],k,o); });
    if(r.spots.ceil) drawItem(g,r.spots.ceil,'ceil',o);
    ['backL','backC','backR'].forEach(k=>{ if(r.spots[k]) drawItem(g,r.spots[k],k,o); });
    if(r.spots.rug) drawItem(g,r.spots.rug,'rug',o);
    if(!o.liveFloor) ['floorL','floorR'].forEach(k=>{ if(r.spots[k]) drawItem(g,r.spots[k],k,o); });
    const w=WIN(); glow(g,w.cx,w.y+w.h,40,skyMode()==='night'?'#8FA0FF':'#FFE9B0',skyMode()==='night'?.08:.16);
  } finally { state.room=saved; }
}
/* Things in the room that move: twinkle lights, the clock, the fire, fish, lamp light. */
function drawRoomLive(g,now,r){ r=r||room(); const night=skyMode()==='night';
  SPOTS.forEach(s=>{ const id=r.spots[s.id], d=id&&DECOR[id]; if(!d||!d.live) return; const p=itemPos(id,s.id);
    if(d.live==='lights'){ const B=viewBounds(); for(let t=al(B.x0,128);t<B.x1;t+=128) for(let i=0;i<17;i++){ const x=t+4+i*7.4, y=2.6+Math.sin((x-t)/128*Math.PI)*4+2; if(Math.floor(now/400+i*1.7)%3===0){ rect(g,x-.5,y-.5,1,1,'#FFFFFF'); glow(g,x,y,4,'#FFF3C0',.35); } } }
    if(d.live==='clock'){ const t=new Date(), cx=p.x+9, cy=p.y+12.6, m=t.getMinutes()/60*TAU-Math.PI/2, h=(t.getHours()%12+t.getMinutes()/60)/12*TAU-Math.PI/2;
      pxLine(g,cx,cy,cx+Math.cos(h)*2.3,cy+Math.sin(h)*2.3,'#2A1E18',1); pxLine(g,cx,cy,cx+Math.cos(m)*3.5,cy+Math.sin(m)*3.5,'#2A1E18',.5); pxEll(g,cx,cy,.7,.7,'#C98A12'); const sw=Math.sin(now/500)*2; pxLine(g,cx,p.y+20,cx+sw,p.y+23,'#C98A12',.5); }
    if(d.live==='fire'){ const [hx,hy,hw,hh]=d.hole, bx=p.x+hx+hw/2, by=p.y+hy+hh-2; for(let i=0;i<3;i++){ const f=Math.sin(now/120+i*2)*1.2; pxEll(g,bx-4+i*4,by-3.4-Math.abs(f),2.2,3.4+f*.6,i===1?'#FFB347':'#F4743A'); pxEll(g,bx-4+i*4,by-2.4,1.1,1.8,'#FFE27A'); } glow(g,bx,by-4,26,'#FF9A4A',.22+Math.sin(now/180)*.04); }
    if(d.live==='fish'){ const [tx,ty,tw,th]=d.tank; [[0,'#F08A2A'],[1.7,'#F4C542']].forEach(([o,c],i)=>{ const x=p.x+tx+tw/2+Math.sin(now/1400+o)*(tw/2-4), y=p.y+ty+3.4+i*3.6+Math.sin(now/700+o)*.8, dir=Math.cos(now/1400+o)>0?1:-1;
        pxEll(g,x,y,1.6,1,c); g.fillStyle=c; g.beginPath(); g.moveTo(x-dir*1.4,y); g.lineTo(x-dir*2.8,y-1); g.lineTo(x-dir*2.8,y+1); g.fill(); });
      const by=(now/30)%(th); pxRing(g,p.x+tx+tw-7,p.y+ty+th-by,.7,.7,.3,'#FFFFFF'); }
    if(d.live==='lamp'){ const [lx,ly]=d.lamp; glow(g,p.x+lx,p.y+ly+2,night?30:18,'#FFE9A8',night?.3:.14); }
  });
}
/* ---- Care stations: the door, the toy basket, the bath caddy ---- */
const STATION_SPR={};
function stationSprite(id,kd){ if(id==='basket'&&state&&kd===kind()) return basketSprite(kd); const k=id+'|'+kd; if(STATION_SPR[k]) return STATION_SPR[k]; const dog=kd==='dog'; let s;
  if(id==='door') s=sprite(16,39,b=>{ part(b,T=>R(T,0,0,16,39.5,wood('#8A5A34'),SH,1)); part(b,T=>R(T,1.5,1.5,13,38,wood('#B8845A'),SH,.6));
    part(b,T=>R(T,3.4,4,9.2,8,(x,y)=>(Math.abs(x-8)<.4||Math.abs(y-8)<.4)?'#8A5A34':'#BFE3F2',null,.4)); [15,25].forEach(y=>part(b,T=>R(T,3.4,y,9.2,7.4,'#A8744A',SHS,.4)));
    part(b,T=>E(T,12.4,21.5,1.1,1.1,'#F4C542',SH));
    if(dog){ part(b,T=>{ Ln(T,12.4,22,13.6,30,'#D9577A',2); Ln(T,12.4,22,11,30,'#D9577A',2); E(T,12.3,31.4,2,1.6,'#D9577A'); }); E(b,12.3,31.4,1,.7,'#B8405E'); }
    else { part(b,T=>R(T,4.4,30.4,7.2,6.8,'#6A4428',null,1)); part(b,T=>R(T,5,31,6,6,'#C99A62',SHS,.8)); } });
  else if(id==='basket') s=sprite(17,16,b=>{ part(b,T=>E(T,5.2,5,3,3,dog?'#D8E24A':'#C77DBA',SH)); part(b,T=>R(T,10,2,4.4,4.8,dog?'#F07A8E':'#9FC4E8',SH,.4));
    part(b,T=>{ for(let a=0;a<=30;a++){ const t=Math.PI*a/30; E(T,8.5-Math.cos(t)*6.4,6.8-Math.sin(t)*5.4,.7,.7,'#8A6234'); } }); part(b,T=>R(T,0,6,17,10,(x,y)=>alt2(x+y,'#C99A62','#E3BC84'),SH,1.4)); });
  else if(id==='bath') s=dog?sprite(17,15,b=>{ [[4,3],[8,2],[12.4,3.4]].forEach(([x,y])=>part(b,T=>E(T,x,y,2.2,2.2,'#D8F2FF',SHL))); part(b,T=>{ E(T,11.5,3.2,2,1.6,'#FFD84A',SH); E(T,13,1.6,1.2,1.2,'#FFD84A',SH); });
      part(b,T=>R(T,0,4.4,17,4,'#FFFFFF',SH,1.4)); part(b,T=>R(T,1.2,7.6,14.6,6.2,'#9FC4E8',SH,1.8)); [[3,14],[14,14]].forEach(([x,y])=>E(b,x,y,1,.8,'#8A94A0')); })
    :sprite(17,13,b=>{ part(b,T=>E(T,8.5,10.6,8.4,2.4,'#B89AD8',SH)); part(b,T=>R(T,2.6,3,5.4,2.4,'#C08A5A',SH,1)); part(b,T=>R(T,7.2,1.6,6.6,4.8,'#8A5A34',SH,.8)); for(let x=7.8;x<13.6;x+=1.1) Ln(b,x,6.2,x,8.4,'#F4E4C8',1);
      part(b,T=>R(T,1,8.2,8,1.6,'#9FC4E8',SHS,.3)); for(let x=1.6;x<8.6;x+=1) Ln(b,x,7.4,x,8.2,'#9FC4E8',1); });
  return STATION_SPR[k]=s; }
/* The toy basket shows the pet's own toys peeking out: the three newest, so a toy from the pet store
   (or one found outside) is right there in the basket at home, the newest in the middle. */
function basketSprite(kd){ const toys=ownedToys().slice(-3).filter(t=>SPR[t]), key='basket|'+kd+'|'+toys.join(','); if(STATION_SPR[key]) return STATION_SPR[key];
  const handle=sprite(17,16,b=>part(b,T=>{ for(let a=0;a<=30;a++){ const t=Math.PI*a/30; E(T,8.5-Math.cos(t)*6.4,6.8-Math.sin(t)*5.4,.7,.7,'#8A6234'); } })),
    front=sprite(17,16,b=>part(b,T=>R(T,0,6,17,10,(x,y)=>alt2(x+y,'#C99A62','#E3BC84'),SH,1.4))),
    c=hdCanvas(21,20), g=c.getContext('2d'); g.setTransform(RES,0,0,RES,2*RES,2*RES);
  blit(g,handle,0,0);
  const spots=toys.length===1?[[8.5,7.2]]:toys.length===2?[[5.2,7.4],[11.8,7.2]]:[[4.2,7.6],[12.8,7.6],[8.5,7]];
  g.imageSmoothingEnabled=true; toys.forEach((t,i)=>{ const s=SPR[t], k=Math.min(.9,9.4/s.lw,8.6/s.lh), w=s.lw*k, h=s.lh*k, [cx,by]=spots[i]; blitSized(g,s,cx-w/2,by-h,w,h); }); g.imageSmoothingEnabled=false;
  blit(g,front,0,0); c.lw=17; c.lh=16; c.px=2; c.py=2; return STATION_SPR[key]=c; }
/* ---- Room layout that breathes ----
   Positions above are for the narrowest view (164 wide, a phone held upright). On wider screens the
   whole room stretches out from the pet, so things spread across the space instead of crowding. */
const BASE_SPOTS=SPOTS.map(s=>s.box.slice()), BASE_STATION=JSON.parse(JSON.stringify(STATION)), STATION_W={feed:14,water:14,basket:17,bath:17,door:16};
const FIX={dx:0,dy:0}; let ROOM_K=1, ROOM_DEEP=false;
/* The rug sits a little back from the front of the floor, so it never touches the litter box, potty
   pad or toy basket; the pet still sits in its middle. RUG_EDGE is its left tip. */
const RUG_UP=3, RUG_EDGE=33;
const BASE_TOYS=[['sock',30,84],['duck',108,74],['bone',46,86],['ball',76,86]], BASE_LUMPS=[[8,81],[14,82],[21,81]];
function applyRoomLayout(viewW,viewH){
  const k=clamp(viewW-4,164,236)/164, X=x=>64+(x-64)*k, deep=k<1.15&&viewH>=140; if(Math.abs(k-ROOM_K)<.001&&deep===ROOM_DEEP&&applyRoomLayout.done) return; ROOM_K=k; ROOM_DEEP=deep; applyRoomLayout.done=true;
  SPOTS.forEach((s,i)=>{ const b=BASE_SPOTS[i]; if(s.zone==='ceil'||s.zone==='rug') return; s.box[0]=X(b[0]+b[2]/2)-b[2]/2; });
  Object.keys(BASE_STATION).forEach(id=>{ const [x,y]=BASE_STATION[id]; STATION[id][0]=X(x+STATION_W[id]/2)-STATION_W[id]/2; STATION[id][1]=y; });
  FIX.dx=X(15.5)-15.5; FIX.dy=0;
  const toys=BASE_TOYS.map(([t,x,y])=>[t,X(x),y]);
  /* Roomy screens: bath caddy, potty pad or litter box, and toy basket stand in one row with even
     gaps, and the bed sits behind the gap, so nothing is stacked on top of anything else. */
  /* The row must end before the rug (two steps clear); when the screen isn't wide enough for that
     with room between things, the compact layout is used instead. */
  const x0=67-82*k, g=Math.min(10,(RUG_EDGE-2-61-x0)/2);
  if(k>=1.15&&g>=3){ const fx=x0+17+g, bx=fx+27+g, bed=SPOTS.find(s=>s.id==='floorL');
    STATION.bath[0]=x0; STATION.bath[1]=80; FIX.dx=fx-2; STATION.basket[0]=bx; STATION.basket[1]=79;
    if(bed) bed.box[0]=(fx+27+bx)/2-bed.box[2]/2;
    toys[0]=['sock',STATION.feed[0]-13,88]; toys[2]=['bone',44,89]; toys[3]=['ball',75,89]; }
  /* Tall screens (a phone held upright) have floor to spare: the bath caddy and toy basket move to a
     row in front, and the bed sits beside the potty pad or litter box. */
  else if(deep){ const bed=SPOTS.find(s=>s.id==='floorL'); FIX.dx=-16; if(bed) bed.box[0]=29-bed.box[2]/2;
    STATION.bath[0]=-9; STATION.bath[1]=100; STATION.basket[0]=17; STATION.basket[1]=99;
    toys[0]=['sock',40,104]; toys[2]=['bone',62,101]; toys[3]=['ball',84,103]; }
  if(typeof TOY_SPOTS!=='undefined') toys.forEach((t,i)=>{ TOY_SPOTS[i]=t; });
  if(typeof LUMPS!=='undefined') BASE_LUMPS.forEach(([x,y],i)=>{ LUMPS[i]=[x+FIX.dx,y]; });
  if(typeof snapLayout==='function') snapLayout();
  if(typeof bumpRoom==='function') bumpRoom();
}