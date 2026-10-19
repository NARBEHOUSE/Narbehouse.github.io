/* Presentation-only remaster for the original Ben's Bug Blaster.
 * No economy, wave, input, collision, damage, spawning or timing rules live here.
 * Sprites are drawn from articulated poses into animation atlases. No generated
 * still images are used for characters. Rendering uses its own deterministic noise.
 */
(function(){
'use strict';
const TAU=Math.PI*2,PI=Math.PI;
const motionQuery=matchMedia('(prefers-reduced-motion: reduce)');
const noise=n=>{const x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x);};
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const stats={atlasFrames:0,draws:0,framesByState:{},lastPose:null};
function oval(c,x,y,rx,ry,fill,stroke=null,lw=1){c.beginPath();c.ellipse(x,y,Math.max(.01,rx),Math.max(.01,ry),0,0,TAU);c.fillStyle=fill;c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=lw;c.stroke();}}
function line(c,points,color,width){c.beginPath();c.moveTo(...points[0]);for(const p of points.slice(1))c.lineTo(...p);c.strokeStyle=color;c.lineWidth=width;c.lineCap='round';c.lineJoin='round';c.stroke();}
function shine(c,x,y,rx,ry,light,mid,dark){const g=c.createRadialGradient(x-rx*.34,y-ry*.35,0,x,y,Math.max(rx,ry)*1.25);g.addColorStop(0,light);g.addColorStop(.34,mid);g.addColorStop(1,dark);oval(c,x,y,rx,ry,g,dark,.9);oval(c,x-rx*.3,y-ry*.35,rx*.17,ry*.15,'#fff8d337');}
function rr(c,x,y,w,h,r,fill,stroke=null){c.beginPath();c.roundRect(x,y,w,h,r);c.fillStyle=fill;c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=1;c.stroke();}}
const palettes={small:['#ef9a63','#b94727','#4c2018'],medium:['#ffd98d','#d58925','#663d17'],large:['#fa8b69','#aa3328','#42211b'],extra_large:['#bf91d8','#754c9d','#30213e'],boss:['#a77c65','#503e36','#211f22'],defender:['#9cd4ed','#317ea3','#16374b']};
const dimensions={small:48,medium:65,large:80,extra_large:112.5,boss:190,defender:40};
// Each gait has alternating stance and swing phases. Two-bone legs solve an
// actual knee position; the foot lifts during swing and stays down in stance.
function leg(c,side,row,count,phase,state,death,type){
  const spider=type==='boss',scorpion=type==='extra_large';
  const hip={x:side*(spider?7:5),y:(row-(count-1)/2)*(spider?6:5)};
  const cycle=phase+(row%2)*PI+(side<0?PI:0),s=Math.sin(cycle),lift=Math.max(0,Math.cos(cycle));
  let foot={x:side*((spider?24:scorpion?20:18)-lift*3),y:hip.y+(row-(count-1)/2)*5+s*5};
  if(state==='idle'){foot.x=side*(spider?24:19);foot.y=hip.y+(row-(count-1)/2)*5;}
  if(state==='attack'&&row===count-1){foot.y+=Math.sin(phase)*7;foot.x*=.85;}
  if(state==='death'){foot.x=side*(20-14*death);foot.y=hip.y-8*death;}
  const dx=foot.x-hip.x,dy=foot.y-hip.y,d=Math.max(1,Math.hypot(dx,dy)),upper=14,lower=15;
  const a=(upper*upper-lower*lower+d*d)/(2*d),h=Math.sqrt(Math.max(0,upper*upper-a*a));
  const knee={x:hip.x+dx*a/d-dy*h/d*side,y:hip.y+dy*a/d+dx*h/d*side};
  const p=palettes[type];line(c,[[hip.x,hip.y],[knee.x,knee.y],[foot.x,foot.y]],p[2],spider?2.3:1.8);
  line(c,[[hip.x-.4,hip.y-.7],[knee.x-.4,knee.y-.7]],p[1],spider?1.25:.8);
  oval(c,knee.x,knee.y,spider?1.5:1.1,spider?1.5:1.1,p[1]);
  if(spider){for(let k=0;k<3;k++){const t=(k+1)/4,x=knee.x+(foot.x-knee.x)*t,y=knee.y+(foot.y-knee.y)*t;line(c,[[x,y],[x+side*1.6,y-1.4]],'#b49a8060',.5);}}
}
function eyes(c,type,phase,dead){
  const big=type==='boss',y=type==='small'||type==='defender'?9:11;
  for(const side of [-1,1]){const x=side*(big?4.2:3.5);shine(c,x,y,2.2,dead?.45:2.7,'#ffe7a6','#f4d49c','#473724');if(!dead){oval(c,x+side*.2,y+.8,1.15,1.7,'#161b1b');oval(c,x-.45,y-.45,.65,.7,'#fff');}}
  if(big){for(const x of [-7,0,7])oval(c,x,7,1.2,1.4,'#d6aa61','#332922',.4);}
}
function antenna(c,type,phase,state){const p=palettes[type];for(const side of [-1,1]){const twitch=Math.sin(phase*.5+side)*1.2;const x=side*4,y=12;line(c,[[x,y],[side*(8+twitch),18],[side*(10+twitch),22]],p[2],1.1);oval(c,side*(10+twitch),22,1,1.3,p[1]);}}
function mandibles(c,type,phase,state){const bite=state==='attack'?(Math.sin(phase)+1)*.45:.18+Math.sin(phase*.3)*.04;for(const side of [-1,1]){c.save();c.translate(side*4,14);c.rotate(side*bite);c.beginPath();c.moveTo(0,0);c.quadraticCurveTo(side*9,7,side*2,13);c.lineTo(side*2,8);c.quadraticCurveTo(side*4,4,0,2);c.closePath();c.fillStyle=palettes[type][2];c.fill();line(c,[[0,1],[side*4,5]],palettes[type][1],.8);c.restore();}}

// Shared pose geometry: the last point is both the drawn barb and the muzzle.
// The tail rises from the abdomen, arches over it, then curves forward.
function scorpionTail(state, frame, count) {
  const shot = state === 'attack' ? Math.max(0, 1 - frame / Math.max(1, count - 1)) : 0;
  const sway = state === 'death' ? 0 : Math.sin(frame/count*TAU) * 0.7;
  const collapse = state === 'death' ? frame/(count-1) : 0;
  const nodes = [
    {x:0,y:-11}, {x:-4,y:-20}, {x:-3+sway,y:-29},
    {x:5+sway,y:-34+shot*2}, {x:15+sway,y:-29+shot*6},
    {x:20+sway+shot*2,y:-20+shot*12},
    {x:20+sway+shot*3,y:-11+shot*15}
  ];
  if (collapse) for (let i=1;i<nodes.length;i++) nodes[i].x += collapse*i*1.5;
  const bulb=nodes[nodes.length-1];
  return {nodes,bulb,tip:{x:bulb.x-4+shot*3,y:bulb.y+15}};
}
function drawScorpionTail(c,state,frame,count,p) {
  const tail=scorpionTail(state,frame,count);
  // Cast shadow beneath the raised arc helps it read as a tail over the back.
  c.save();c.translate(2,3);line(c,tail.nodes.map(n=>[n.x,n.y]),'#15111e42',7);c.restore();
  for(let i=1;i<tail.nodes.length;i++){
    const a=tail.nodes[i-1],b=tail.nodes[i],w=6.2-i*.42;
    line(c,[[a.x,a.y],[b.x,b.y]],p[2],w+1.5);
    line(c,[[a.x-.5,a.y-.7],[b.x-.5,b.y-.7]],p[1],w);
    shine(c,b.x,b.y,w*.65,w*.67,p[0],p[1],p[2]);
  }
  const b=tail.bulb,t=tail.tip;
  // Pear-shaped venom bulb and a single tapering recurved, sharp barb.
  c.save();c.translate(b.x,b.y);c.rotate(-.16);
  shine(c,0,1,4.8,6.2,'#d1afdf','#9565b5','#382344');
  c.restore();
  const g=c.createLinearGradient(b.x,b.y+3,t.x,t.y);
  g.addColorStop(0,'#f1ca83');g.addColorStop(.45,'#ab6948');g.addColorStop(1,'#2d2030');
  c.beginPath();c.moveTo(b.x-3,b.y+3);
  c.bezierCurveTo(b.x-4,b.y+9,b.x+1,b.y+11,t.x,t.y);
  c.bezierCurveTo(b.x+7,b.y+10,b.x+5,b.y+5,b.x+3,b.y+3);
  c.closePath();c.fillStyle=g;c.fill();c.strokeStyle='#3d2438';c.lineWidth=.7;c.stroke();
  line(c,[[b.x+1,b.y+5],[b.x+2,b.y+9]],'#ffe0a6',.8);
}

function pose(c,type,state,frame,count){
  const phase=frame/count*TAU,death=state==='death'?frame/(count-1):0,p=palettes[type];
  c.save();
  if(state==='hit'){c.translate(Math.sin(phase)*1.5,Math.cos(phase)*1.1);}
  if(state==='death'){c.scale(1+death*.22,1-death*.6);}
  const legs=type==='boss'||type==='extra_large'?4:3;
  for(const side of [-1,1])for(let row=0;row<legs;row++)leg(c,side,row,legs,phase,state,death,type);
  const breath=state==='walk'?Math.cos(phase*2)*.3:Math.sin(phase)*.35;
  if(type==='small'||type==='defender'){
    shine(c,0,-10+breath,7,9,p[0],p[1],p[2]);
    for(let y=-13;y<=-7;y+=3){c.beginPath();c.ellipse(0,y,6.6,2,0,0,PI);c.strokeStyle=p[2]+'77';c.lineWidth=.6;c.stroke();}
    shine(c,0,0,4.5,5.4,p[0],p[1],p[2]);shine(c,0,8-breath,6,6,p[0],p[1],p[2]);antenna(c,type,phase,state);
    if(type==='defender'){rr(c,-7,3,14,5,2,'#b9c6c9','#516977');oval(c,0,2,6.5,4,'#6b899a','#2b5268');line(c,[[-1,-1],[-1,5]],'#c8dbe2',1.1);}
  }else if(type==='medium'||type==='large'){
    shine(c,0,-4,11,15,p[0],p[1],p[2]);
    const shellLift=state==='attack'?Math.max(0,Math.sin(phase))*.15:0;
    for(const side of [-1,1]){c.save();c.translate(side*.6,-7);c.rotate(side*shellLift);shine(c,side*4,0,5.6,10.2,p[0],p[1],p[2]);c.restore();}
    line(c,[[0,-17],[0,3]],p[2],1);shine(c,0,8,7,6.5,p[0],p[1],p[2]);
    if(type==='large')mandibles(c,type,phase,state);else antenna(c,type,phase,state);
  }else if(type==='extra_large'){
    for(let j=0;j<4;j++)shine(c,0,-10+j*5,7-j*.25,4.1,p[0],p[1],p[2]);shine(c,0,8,7,6,p[0],p[1],p[2]);
    const fire=state==='attack'?Math.max(0,1-frame/(count-1)):0;
    drawScorpionTail(c,state,frame,count,p);
    for(const side of [-1,1]){c.save();c.translate(side*11,13);c.rotate(side*(.2+Math.sin(phase)*.12+fire*.5));shine(c,0,3,4,6,p[0],p[1],p[2]);line(c,[[side*-1,7],[side*-3,11],[side*-1,12]],p[2],1.8);line(c,[[side*2,7],[side*4,10],[side*2,12]],p[2],1.8);c.restore();}
  }else{
    shine(c,0,-11+breath,12,14,p[0],p[1],p[2]);
    for(let i=0;i<26;i++){const a=i/26*TAU;line(c,[[Math.cos(a)*10,-11+Math.sin(a)*12],[Math.cos(a)*13,-11+Math.sin(a)*15]],'#9a7d6577',.55);}
    shine(c,0,8,9,9,'#947468','#483a35','#191c1e');mandibles(c,type,phase,state);
    for(const side of [-1,1]){c.beginPath();c.moveTo(side*2,-15);c.lineTo(side*7,-11);c.lineTo(side*3,-8);c.strokeStyle='#bf805e';c.lineWidth=1.6;c.stroke();}
  }
  eyes(c,type,phase,state==='death');
  if(state==='hit'){c.globalCompositeOperation='source-atop';c.fillStyle='#fff1c54a';c.fillRect(-40,-40,80,80);c.globalCompositeOperation='source-over';}
  c.restore();
}
const stateFrames={walk:16,idle:8,attack:10,hit:4,death:10};
const sprites={};
for(const type of Object.keys(palettes)){
  const size=Math.ceil(dimensions[type]*2),sheet=document.createElement('canvas'),total=Object.values(stateFrames).reduce((a,b)=>a+b,0);
  sheet.width=size*8;sheet.height=size*Math.ceil(total/8);const c=sheet.getContext('2d');let at=0;const starts={};
  for(const [state,count]of Object.entries(stateFrames)){starts[state]=at;for(let frame=0;frame<count;frame++,at++){c.save();c.translate((at%8)*size+size/2,Math.floor(at/8)*size+size/2);const scale=size/(type==='extra_large'?90:76);c.scale(scale,scale);pose(c,type,state,frame,count);c.restore();stats.atlasFrames++;}}
  sprites[type]={sheet,size,starts};
}
const animation=new WeakMap();
function getAnimation(e){let a=animation.get(e);if(!a){a={x:e.x,y:e.y,distance:0,hp:e.hp,hit:0,shot:e.last_shot_time,attack:0};animation.set(e,a);}return a;}
function animatedBug(e,type,rotation=0){
  const now=Date.now()/1000,a=getAnimation(e),distance=Math.hypot(e.x-a.x,e.y-a.y);a.distance+=Math.min(distance,5);a.x=e.x;a.y=e.y;
  if(Number.isFinite(e.hp)&&e.hp<a.hp&&!e.isDead)a.hit=now;a.hp=e.hp;
  if(e.last_shot_time>a.shot){a.attack=now;}a.shot=e.last_shot_time;
  const near=type==='defender'?e.target&&Math.hypot(e.target.x-e.x,e.target.y-e.y)<35:e.y>TOWER_Y-65;
  let state=e.isDead?'death':type==='extra_large'&&now-a.attack<.45?'attack':now-a.hit<.18?'hit':now-a.attack<.45||near?'attack':e.stuckToGlue||distance<.001?'idle':'walk';
  const frames=stateFrames[state];let phase=state==='walk'?a.distance/(type==='boss'?32:12):state==='death'?(Date.now()-e.deathTime)/500:state==='hit'?(now-a.hit)/.18:state==='attack'&&now-a.attack<.45?(now-a.attack)/.45:now*.6+(e.id||.2);
  const frame=Math.min(frames-1,Math.floor((state==='death'||state==='hit'?clamp(phase,0,.999):phase%1)*frames));
  const sprite=sprites[type],index=sprite.starts[state]+frame,size=dimensions[type];
  ctx.save();ctx.translate(e.x,e.y);ctx.rotate(rotation);
  if(e.isDead)ctx.globalAlpha=Math.max(0,1-(Date.now()-e.deathTime)/500);
  oval(ctx,3,5,size*.28,size*.16,'#17221935');
  ctx.drawImage(sprite.sheet,(index%8)*sprite.size,Math.floor(index/8)*sprite.size,sprite.size,sprite.size,-size/2,-size/2,size,size);
  ctx.restore();stats.draws++;stats.framesByState[state]=(stats.framesByState[state]||0)+1;stats.lastPose={type,state,frame};
  if(type==='boss'&&!e.isDead){const width=84,x=e.x-width/2,y=e.y+68;rr(ctx,x-2,y-2,width+4,9,4,'#221f24cc');rr(ctx,x,y,width*clamp(e.hp/100,0,1),5,3,'#b2cf7c');}
}
Enemy.prototype.draw=function(){animatedBug(this,this.etype,this.etype==='small'?this.angle:0);};
TowerUnit.prototype.draw=function(){const rotation=this.target?Math.atan2(this.target.y-this.y,this.target.x-this.x)-PI/2:PI;animatedBug(this,'defender',rotation);};

function mixHex(a,b,t){
  const channel=(hex,at)=>parseInt(hex.slice(at,at+2),16);
  return '#'+[1,3,5].map(at=>Math.round(channel(a,at)+(channel(b,at)-channel(a,at))*t).toString(16).padStart(2,'0')).join('');
}
function healthColor(colors,pct){
  const progress=clamp((1-pct)*4,0,3),stage=Math.floor(progress);
  return mixHex(colors[stage],colors[Math.min(stage+1,3)],progress-stage);
}
const groundCache=new Map();
function makeGround(w,h,stage){const key=[w,h,stage].join(':');if(groundCache.has(key))return groundCache.get(key);if(groundCache.size>=2)groundCache.delete(groundCache.keys().next().value);const surface=document.createElement('canvas');surface.width=w;surface.height=h;const c=surface.getContext('2d');const colors=[['#6abe50','#51a340'],['#b3c353','#97ad41'],['#e2c966','#c8ac49'],['#a58b62','#876b46']][stage];const g=c.createLinearGradient(0,0,w,h);g.addColorStop(0,colors[0]);g.addColorStop(1,colors[1]);c.fillStyle=g;c.fillRect(0,0,w,h);
  for(let i=0;i<Math.min(16000,w*h/65);i++){const x=noise(i*4)*w,y=noise(i*4+1)*h,l=2+noise(i*4+2)*5;c.strokeStyle=i%3?['#d5f5a824','#e6e99735','#fff0ae40','#ddc39830'][stage]:['#245a241b','#59662922','#78622c25','#4d382c25'][stage];c.lineWidth=.6+noise(i+78);c.beginPath();c.moveTo(x,y);c.quadraticCurveTo(x-2,y-l*.6,x-1,y-l);c.stroke();}
  for(let i=0;i<90;i++){const x=noise(i+800)*w,y=noise(i+1800)*h;c.fillStyle=['#c1e88c1c','#dce58f20','#edd48828','#bf9d6b28'][stage];c.beginPath();c.ellipse(x,y,3+noise(i)*4,1.5,noise(i+80)*PI,0,TAU);c.fill();}
  const vignette=c.createRadialGradient(w*.46,h*.3,Math.min(w,h)*.15,w*.5,h*.5,Math.max(w,h)*.75);vignette.addColorStop(0,'#eaffce05');vignette.addColorStop(1,'#163d2518');c.fillStyle=vignette;c.fillRect(0,0,w,h);groundCache.set(key,surface);return surface;
}
// Both sides of the fence sample the same full-height lawn, so the texture,
// lighting and health-related color changes continue through the house garden.
function drawLawn(menu=false,top=0,bottom=menu?SCREEN_HEIGHT:Math.max(1,TOWER_Y-40)){
  const pct=menu?1:tower_hp/max_tower_hp,progress=clamp((1-pct)*4,0,3),stage=Math.floor(progress),blend=progress-stage;
  const y=Math.max(0,top),height=Math.max(0,Math.min(SCREEN_HEIGHT,bottom)-y);
  if(!height)return;
  ctx.save();ctx.drawImage(makeGround(SCREEN_WIDTH,SCREEN_HEIGHT,stage),0,y,SCREEN_WIDTH,height,0,y,SCREEN_WIDTH,height);
  if(blend>0){ctx.globalAlpha*=blend;ctx.drawImage(makeGround(SCREEN_WIDTH,SCREEN_HEIGHT,stage+1),0,y,SCREEN_WIDTH,height,0,y,SCREEN_WIDTH,height);}
  ctx.restore();
}
function drawGardenLawn(){drawLawn(false,Math.max(0,TOWER_Y-40),SCREEN_HEIGHT);return true;}
draw_grass=function(){drawLawn();};
// Retain the original flower art and health thresholds, adding gradual wilt
// from 75% health and fallen petals as the garden deteriorates.
const nativeFlower=draw_flower;
draw_flower=function(f,pct=1){
  const wilt=clamp((.75-pct)/.5,0,1);
  ctx.save();ctx.translate(f.x,f.y);ctx.rotate(wilt*.35);ctx.translate(-f.x,-f.y);
  nativeFlower(f,pct);ctx.restore();
  if(wilt>0){
    const petalColor={sunflower:'#e9c74f',rose:'#c86d5b',tulip:'#bc7c83',daisy:'#e9dbb8'}[f.type]||'#e9dbb8';
    for(let i=0;i<Math.floor(wilt*5);i++){
      const dx=(noise(f.x+i*7)*2-1)*15,dy=2+noise(f.x+i*11)*5;
      oval(ctx,f.x+dx*f.scale,f.y+dy*f.scale,2.6*f.scale,1.1*f.scale,mixHex(petalColor,'#785334',wilt));
    }
  }
};
const nativeZone=draw_damage_zone;
draw_damage_zone=function(){nativeZone();ctx.save();const top=TOWER_Y-40;const shade=ctx.createLinearGradient(0,top,0,top+62);shade.addColorStop(0,'#17271900');shade.addColorStop(.55,'#1727192a');shade.addColorStop(1,'#17271900');ctx.fillStyle=shade;ctx.fillRect(0,top,SCREEN_WIDTH,62);for(let x=0;x<SCREEN_WIDTH;x+=20){line(ctx,[[x+13,TOWER_Y-30],[x+13,TOWER_Y-2]],'#9ba48d70',1);for(const y of [TOWER_Y-23,TOWER_Y-8])oval(ctx,x+7,y,1,1,'#8f958b');}ctx.restore();};
// The salt cannon sits on the rear roof ridge, facing the approaching bugs.
// Rendering and projectile creation share this mount and aiming geometry.
function saltCannonPose(tower,target=focused_enemy){
  const x=75,y=8,scale=tower.size/150;
  const worldX=tower.x+x*scale,worldY=tower.y+y*scale;
  const angle=target?Math.atan2(target.y-worldY,target.x-worldX)+PI/2:0;
  const recoil=Math.max(0,1-(Date.now()/1000-tower_last_projectile_time)/.22)*4;
  return {x,y,scale,worldX,worldY,angle,recoil};
}
function getSaltShotOrigin(tower,target){
  const p=saltCannonPose(tower,target);
  // Fire from the extended barrel; the animation recoils after the shot.
  return {x:p.worldX+Math.sin(p.angle)*28*p.scale,y:p.worldY-Math.cos(p.angle)*28*p.scale};
}
function drawHouseWear(pct){
  if(pct>.75)return;
  const count=pct<=.25?12:pct<=.5?8:4;
  const cracks=[[18,67],[57,67],[89,67],[128,69],[18,112],[39,116],[104,118],[128,120],[29,131],[105,137],[50,84],[94,88]];
  for(let i=0;i<count;i++){
    const [x,y]=cracks[i],length=8+noise(i+16)*6;
    const points=[[x,y],[x-2,y+length*.3],[x+2,y+length*.55],[x-1,y+length]];
    line(ctx,points.map(([px,py])=>[px+1,py]),'#e1cf9d',1.5);
    line(ctx,points,'#554330',1.35);
    line(ctx,[[x+1,y+length*.55],[x+5,y+length*.65]],'#554330',1);
  }
  if(pct<=.5){
    const patches=pct<=.25?4:2;
    for(let i=0;i<patches;i++){
      const x=[16,118,34,96][i],y=[128,109,65,130][i];
      ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+12,y-2);ctx.lineTo(x+16,y+5);ctx.lineTo(x+10,y+12);ctx.lineTo(x-2,y+9);ctx.closePath();ctx.fillStyle='#8c6a4a';ctx.fill();
      line(ctx,[[x,y+4],[x+12,y+4]],'#5e4937',1);line(ctx,[[x+5,y-1],[x+5,y+4]],'#5e4937',1);line(ctx,[[x+9,y+5],[x+9,y+11]],'#5e4937',1);
    }
    // Missing top tiles expose opaque dark underlay, never the lawn.
    for(let i=0;i<(pct<=.25?6:3);i++){
      const x=[48,87,27,117,68,101][i],y=[35,42,49,51,27,51][i];
      ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+7,y-1);ctx.lineTo(x+12,y+3);ctx.lineTo(x+8,y+7);ctx.lineTo(x+1,y+6);ctx.closePath();ctx.fillStyle='#443a2e';ctx.fill();
      line(ctx,[[x,y],[x+7,y-1]],'#bd9470',1);
    }
    for(let i=0;i<(pct<=.25?8:4);i++){const x=15+noise(i+600)*120;rr(ctx,x,147+noise(i+12)*5,4+noise(i)*5,2+noise(i+20)*2,.5,i%2?'#9d7553':'#b49b71');}
  }
}
Tower.prototype.draw=function(){
  const size=this.size,pct=tower_hp/max_tower_hp;ctx.save();ctx.translate(this.x,this.y);const s=size/150;ctx.scale(s,s);
  oval(ctx,81,149,75,9,'#16231f40');const walls=ctx.createLinearGradient(0,40,150,150);walls.addColorStop(0,healthColor(['#f4e5c3','#dbce9c','#bbad7f','#94866a'],pct));walls.addColorStop(1,healthColor(['#c8bd99','#b2a67c','#978b68','#736650'],pct));
  rr(ctx,10,47,130,99,3,walls,'#67583e');rr(ctx,116,47,24,99,1,'#85775d45');
  for(let y=61;y<139;y+=11){line(ctx,[[12,y],[138,y]],'#927c5130',.7);}
  // Fill the whole roof silhouette, including its center above the wall.
  const roof=ctx.createLinearGradient(0,0,0,63);roof.addColorStop(0,healthColor(['#be7352','#aa7257','#8e6b53','#74634e'],pct));roof.addColorStop(1,healthColor(['#743c2c','#704b37','#614837','#4e4032'],pct));
  ctx.beginPath();ctx.moveTo(0,51);ctx.lineTo(75,3);ctx.lineTo(150,51);ctx.lineTo(143,62);ctx.lineTo(7,62);ctx.closePath();
  ctx.fillStyle=roof;ctx.fill();
  line(ctx,[[7,61],[143,61]],'#4d302a',2);
  line(ctx,[[0,52],[75,4],[150,52]],'#e8ac73',2);
  for(let row=0;row<4;row++){const y=22+row*9,left=75-(y-4)*1.52,right=75+(y-4)*1.52;line(ctx,[[left,y],[right,y]],'#4d302a50',1);for(let x=left+12;x<right;x+=18)line(ctx,[[x,y-7],[x+3,y]],'#4d302a44',1);}
  rr(ctx,103,11,17,29,2,'#a37f61','#6d5140');rr(ctx,100,9,23,6,1,'#c5ae86');
  rr(ctx,57,98,35,48,4,'#514834');rr(ctx,60,100,29,46,3,'#537d76');for(let x=65;x<90;x+=7)line(ctx,[[x,104],[x,145]],'#2a514951',1);oval(ctx,82,124,2,2,'#e4c26f');
  for(const x of [29,102]){
    rr(ctx,x,74,23,27,2,'#493e30');
    const glass=ctx.createLinearGradient(x,75,x,99);
    glass.addColorStop(0,healthColor(['#e9efc5','#bdc8b1','#758e88','#242923'],pct));
    glass.addColorStop(1,healthColor(['#b4d6cb','#9db5a6','#566f6c','#161e1b'],pct));
    rr(ctx,x+2,76,19,23,1,glass);
    const frame=healthColor(['#f8edcc','#e5d8ad','#c4b991','#9c9277'],pct);
    line(ctx,[[x+11.5,76],[x+11.5,99]],frame,2);line(ctx,[[x+2,87],[x+21,87]],frame,2);
    if(pct<=.5){
      line(ctx,[[x+5,78],[x+10,82],[x+7,88],[x+13,93],[x+10,98]],'#d3e2ca',1);
      line(ctx,[[x+10,82],[x+18,80],[x+15,87]],'#d3e2ca',.9);
    }
    if(pct<=.25){
      ctx.beginPath();ctx.moveTo(x+3,89);ctx.lineTo(x+10,91);ctx.lineTo(x+8,98);ctx.lineTo(x+3,98);ctx.closePath();ctx.fillStyle='#101714';ctx.fill();
      line(ctx,[[x+14,78],[x+20,81],[x+17,85]],'#b5c7b3',1.2);
    }
    rr(ctx,x-3,102,29,6,1,healthColor(['#a66d44','#9b704e','#82634a','#6a5341'],pct));
    const wilt=clamp((.75-pct)/.5,0,1);
    for(let i=0;i<5;i++){
      const fx=x+i*5,fy=98+wilt*4;
      line(ctx,[[fx,104],[fx+wilt*3,fy]],healthColor(['#628d45','#879748','#8c804d','#69523c'],pct),1.2);
      if(pct>.25){oval(ctx,fx+wilt*2,102,3*(1-wilt*.6),3,healthColor(['#628d45','#879748','#8c804d','#69523c'],pct));oval(ctx,fx+wilt*3,fy,2*(1-wilt*.45),2*(1-wilt*.5),mixHex(i%2?'#e9b66c':'#b96656','#8b7047',wilt));}
    }
  }
  drawHouseWear(pct);
  // Salt turrets appear only when the original purchase is owned.
  if(buy_menu_options[0].purchased>0){
    const {x,y,angle,recoil}=saltCannonPose(this);
    ctx.save();ctx.translate(x,y);ctx.rotate(angle);
    oval(ctx,2,4,14,9,'#263e3433');
    shine(ctx,0,0,12,10,'#eee6be','#a8a894','#4e5a52');
    rr(ctx,-5,-25+recoil,10,24,3,'#81938c','#354b45');
    rr(ctx,-7,-28+recoil,14,6,2,'#d6dbcd','#4d6257');
    for(let i=-1;i<2;i++)oval(ctx,i*4,-25+recoil,1.1,1.1,'#384841');
    if(recoil>1){ctx.globalAlpha=recoil/4;oval(ctx,0,-33+recoil,8,6,'#fff4b783');}
    ctx.restore();
  }
  ctx.restore();
};
TowerProjectile.prototype.draw=function(){
  // Preserve the old renderer's six gameplay-RNG calls; new art uses no extra ones.
  for(let i=0;i<6;i++)Math.random();
  ctx.save();ctx.translate(this.x,this.y);ctx.rotate(Math.atan2(this.vy,this.vx));const g=ctx.createLinearGradient(-24,0,5,0);g.addColorStop(0,'#f1f2d600');g.addColorStop(1,'#fff8d5d9');ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(-25,-3);ctx.lineTo(5,0);ctx.lineTo(-25,3);ctx.fill();shine(ctx,0,0,4,3,'#fff','#e7e6cc','#9ca792');for(let i=0;i<4;i++){const x=-8-i*4,y=Math.sin(i*7+this.x)*3;rr(ctx,x,y,2,2,.4,'#f9f2cfb0');}ctx.restore();
};
EnemyProjectile.prototype.draw=function(){ctx.save();ctx.translate(this.x,this.y);ctx.rotate(Math.atan2(this.vy,this.vx));const g=ctx.createLinearGradient(-18,0,4,0);g.addColorStop(0,'#a368d100');g.addColorStop(1,'#c79ee4b3');ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(-20,-3);ctx.lineTo(4,0);ctx.lineTo(-20,3);ctx.fill();shine(ctx,0,0,5,4,'#f6d7b5','#b381bf','#61416f');ctx.restore();};
// Original effect functions also apply damage. Run them unchanged in a clipped
// drawing region, then paint the new artwork at the exact original coordinates.
function mechanicsOnly(fn){ctx.save();ctx.beginPath();ctx.rect(-10,-10,0,0);ctx.clip();try{fn();}finally{ctx.restore();}}
// One boot design for the playable stomp and title-screen demonstration.
// x/y mark the sole contact point; callers own animation and hit timing.
function drawBoot(x,y){
  ctx.save();ctx.translate(x,y-20);
  const leather=ctx.createLinearGradient(-20,-35,40,20);leather.addColorStop(0,'#be925d');leather.addColorStop(.5,'#80613f');leather.addColorStop(1,'#46392c');rr(ctx,-14,-100,29,76,3,'#526b59','#2e483c');rr(ctx,-19,-31,39,51,7,leather,'#302d25');ctx.beginPath();ctx.moveTo(9,-5);ctx.quadraticCurveTo(50,-9,51,17);ctx.quadraticCurveTo(30,26,-18,21);ctx.lineTo(-18,0);ctx.closePath();ctx.fillStyle=leather;ctx.fill();line(ctx,[[-19,22],[48,22]],'#242c27',7);line(ctx,[[-15,15],[39,15]],'#dfc393',1);for(let y=-22;y<4;y+=7){line(ctx,[[-9,y],[10,y+3]],'#e3d3a6',1.7);oval(ctx,-10,y,1.5,1.5,'#423b2b');oval(ctx,11,y+3,1.5,1.5,'#423b2b');}for(let x=-14;x<45;x+=9)rr(ctx,x,24,5,4,1,'#151e1b');
  ctx.restore();
}
const nativeStomp=draw_stomp_effect;
draw_stomp_effect=function(){
  const active=stomp_anim_active,pos=stomp_effect_pos?{...stomp_effect_pos}:null,elapsed=Date.now()/1000-stomp_anim_start;mechanicsOnly(nativeStomp);
  // Only show an actionable target while the boot is fully charged.
  if(!stomp_anim_active&&Date.now()/1000-last_stomp_time>=stomp_cooldown_max&&stomp_target&&!stomp_target.isDead){
    ctx.save();ctx.translate(stomp_target.x,stomp_target.y);
    const pulse=motionQuery.matches?1:1+Math.sin(Date.now()/1000*10)*.2;
    ctx.scale(pulse,pulse);
    // Original blue pulse and open red crosshair, with an outline against the lawn.
    ctx.beginPath();ctx.arc(0,0,40,0,TAU);
    ctx.strokeStyle='#101c4dd9';ctx.lineWidth=7;ctx.stroke();
    ctx.strokeStyle='#477dff';ctx.lineWidth=4;ctx.stroke();
    ctx.strokeStyle='#b9d9ff';ctx.lineWidth=1;ctx.stroke();
    for(let i=0;i<4;i++){
      const a=i*PI/2;
      const points=[[Math.cos(a)*50,Math.sin(a)*50],[Math.cos(a)*17,Math.sin(a)*17]];
      line(ctx,points,'#421d2bd9',5);
      line(ctx,points,'#ff5b5e',2.5);
    }
    ctx.restore();
  }
  if(!active||!pos||elapsed>.5)return;const h=elapsed<.3?200*(1-(elapsed/.3)**2):0,impact=clamp((elapsed-.3)/.2,0,1),radius=40*2**buy_menu_options[12].purchased;
  ctx.save();ctx.translate(pos.x,pos.y);oval(ctx,0,0,15+(1-h/200)*25,6+(1-h/200)*11,'#18231945');
  if(elapsed>=.3){ctx.globalAlpha=1-impact;ctx.strokeStyle='#ead3a2';ctx.lineWidth=5;ctx.beginPath();ctx.ellipse(0,0,radius*impact,radius*impact*.55,0,0,TAU);ctx.stroke();if(!motionQuery.matches)for(let i=0;i<12;i++){const a=i/12*TAU,r=(14+impact*radius)*(.7+noise(i)*.3);oval(ctx,Math.cos(a)*r,Math.sin(a)*r*.6,3*(1-impact)+1,2,'#bca477');}ctx.globalAlpha=1;}
  drawBoot(0,-h);ctx.restore();
};
const nativeBomb=drop_bomb_effect;
drop_bomb_effect=function(){const elapsed=Date.now()/1000-bomb_start_time,r=elapsed/bomb_duration*1500;mechanicsOnly(nativeBomb);ctx.save();ctx.translate(SCREEN_WIDTH/2,SCREEN_HEIGHT/2);const glow=ctx.createRadialGradient(0,0,Math.max(0,r-55),0,0,Math.max(1,r));glow.addColorStop(0,'#e2ddbd00');glow.addColorStop(.8,'#f2d49633');glow.addColorStop(1,'#ffebbb99');ctx.fillStyle=glow;ctx.beginPath();ctx.arc(0,0,r,0,TAU);ctx.fill();ctx.strokeStyle='#fff2c7a8';ctx.lineWidth=3;ctx.stroke();if(!motionQuery.matches)for(let i=0;i<30;i++){const a=i/30*TAU;oval(ctx,Math.cos(a)*r*.98,Math.sin(a)*r*.98,8,4,'#ecdfba70');}ctx.restore();};
const nativeLaser=draw_laser_beams;
draw_laser_beams=function(){mechanicsOnly(nativeLaser);if(!towers.length)return;const main=towers.reduce((a,b)=>Math.abs(a.x+a.size/2-SCREEN_WIDTH/2)<Math.abs(b.x+b.size/2-SCREEN_WIDTH/2)?a:b),cx=main.x+main.size/2,progress=Math.min(1,(Date.now()/1000-laser_start_time)/3);ctx.save();for(const x of [cx-progress*(cx-50),cx+progress*(SCREEN_WIDTH-50-cx)]){line(ctx,[[x,70],[x,TOWER_Y]],'#b296ed30',18);line(ctx,[[x,70],[x,TOWER_Y]],'#9fd5e68a',8);const points=[[x,70]];for(let y=70;y<TOWER_Y;y+=15)points.push([x+(noise(Math.floor(Date.now()/65)+y)*2-1)*4,y]);line(ctx,points,'#f1fff4',2);}ctx.restore();};
draw_glue_trap=function(){if(!glue_trap_active)return;ctx.save();for(const t of glue_traps){const g=ctx.createLinearGradient(t.x,t.y,t.x,t.y+t.height);g.addColorStop(0,'#e4c66a');g.addColorStop(.5,'#c9a94c');g.addColorStop(1,'#a18237');rr(ctx,t.x+3,t.y+4,t.width,t.height,5,'#23342145');rr(ctx,t.x,t.y,t.width,t.height,5,g,'#69562d');for(let i=0;i<12;i++){const x=t.x+noise(i+90)*(t.width-10)+5,y=t.y+noise(i+19)*(t.height-10)+5;oval(ctx,x,y,2+noise(i)*4,1,'#fff0bd55');}line(ctx,[[t.x+6,t.y+4],[t.x+t.width-6,t.y+4]],'#fff1b88c',1.5);}ctx.restore();};
// Keep the original squish, weapon, defeat, impact and ready effects.
bgMusic.pause();bgMusic.src='sounds/remastered/garden-theme.mp3';bgMusic.loop=true;bgMusic.volume=music_volume;
if(audioStarted&&music_enabled)bgMusic.play().catch(()=>{});
function getStingerOrigin(e) {
  const a=getAnimation(e);
  a.attack=Date.now()/1000;
  a.shot=e.last_shot_time;
  const tip=scorpionTail('attack',0,stateFrames.attack).tip;
  const scale=dimensions.extra_large/90;
  return {x:e.x+tip.x*scale,y:e.y+tip.y*scale};
}
window.BugBlasterPresentation={drawBoot,drawLawn,drawGardenLawn,saltCannonPose,getSaltShotOrigin,getStingerOrigin,scorpionTail,stats,sprites,animation,version:'original-graphics-1',getSnapshot(){return {wave:wave_number,duration:ROUND_DURATION,upgrades:buy_menu_options.map(i=>({name:i.name,cost:i.cost,max:i.max})),stats:{...stats},style:'articulated-atlas'};}};
})();
