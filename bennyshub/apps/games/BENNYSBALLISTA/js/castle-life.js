/** Live castle detail. Physics owns characters; flames never change collision bounds. */
RT.castleLife=(function(){
'use strict';const T=THREE,P=RT.physics;let scene,blocks=[],burns=new Map(),walkers=[],ambient=[],age=0,fireEnd=0,hurt;
const burnable=b=>b.alive&&!b.mat.static&&!b.mat.glass&&!b.mat.pickup;
function surfaceDistance(pos,b){const p=pos.clone().sub(b.mesh.position).applyQuaternion(b.mesh.quaternion.clone().invert());return Math.hypot(Math.max(0,Math.abs(p.x)-b.half.x),Math.max(0,Math.abs(p.y)-b.half.y),Math.max(0,Math.abs(p.z)-b.half.z));}
// Curved, broad-based tongues read as flames instead of straight orange spikes.
function flameTongue(radius,height){
 const profile=[[0,0],[.65,.025],[1,.17],[.85,.37],[.48,.61],[.23,.82],[0,1]];
 const geo=new T.LatheGeometry(profile.map(([r,y])=>new T.Vector2(r*radius,y*height)),7),p=geo.attributes.position;
 for(let i=0;i<p.count;i++){const t=p.getY(i)/height;p.setX(i,p.getX(i)+radius*.7*t*t);}
 geo.computeVertexNormals();return geo;
}
function flame(b){
 const g=new T.Group();g.name='burning-flames';
 const count=b.mat.guard||b.mat.crown||b.mat.protected?2:Math.min(5,Math.max(2,Math.ceil(b.spec.w/1.25)));
 const probe=new T.Mesh(b.mesh.geometry,b.mesh.material),ray=new T.Raycaster();
 b.mesh.geometry.computeBoundingBox();const bounds=b.mesh.geometry.boundingBox,size=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3());
 for(let i=0;i<count;i++){
  const cluster=new T.Group(),x=center.x+(count===1?0:i/(count-1)-.5)*size.x*.76,z=center.z+Math.sin(i*2.4)*size.z*.28;
  ray.set(new T.Vector3(x,bounds.max.y+1,z),new T.Vector3(0,-1,0));const hit=ray.intersectObject(probe,false)[0];
  cluster.userData.anchor=hit?hit.point.clone():new T.Vector3(x,bounds.max.y,z);
  cluster.userData.phase=i*2.1+b.spec.x;
  const height=.9+(i%3)*.17;
  for(let layer=0;layer<2;layer++){
   const h=height*(layer?.65:1),m=new T.Mesh(flameTongue(layer?.15:.28,h),new T.MeshBasicMaterial({color:layer?0xffe68a:0xf47523}));
   m.position.set(layer?.025:-.03,0,layer?.15:0);cluster.add(m);
  }
  g.add(cluster);
 }
 return g;
}
function removeEffect(g){scene.remove(g);g.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});}
function igniteBlock(b,depth=0){if(!burnable(b)||burns.has(b)||burns.size>=32)return;const g=flame(b);scene.add(g);burns.set(b,{g,left:8,spread:1.4,depth,heat:0,emit:0});}
function ignite(pos,radius=1.8){fireEnd=age+14;for(const b of blocks)if(surfaceDistance(pos,b)<=radius)igniteBlock(b);}
function bucket(b){const g=new T.Group();const body=new T.Mesh(new T.CylinderGeometry(.15,.11,.23,10),new T.MeshLambertMaterial({color:0x917455}));g.add(body);const water=new T.Mesh(new T.CircleGeometry(.13,12),new T.MeshBasicMaterial({color:0x79d9ec}));water.rotation.x=-Math.PI/2;water.position.y=.12;g.add(water);const handle=new T.Mesh(new T.TorusGeometry(.12,.015,5,12,Math.PI),new T.MeshBasicMaterial({color:0x364f57}));handle.position.y=.12;g.add(handle);g.name='fire-bucket';g.position.set(.25,-.15,.4);g.visible=false;(b.mesh.getObjectByName('rascal-body')||b.mesh).add(g);return g;}
function init(s,bs,level,onDamage){clear();scene=s;blocks=bs;hurt=onDamage;age=fireEnd=0;const specs=bs.map(b=>b.spec);ambient=bs.filter(b=>b.mat.guard||b.mat.crown||b.mat.protected).map(b=>{const visual=b.mesh.getObjectByName('rascal-body');return{b,visual,scale:visual?.scale.clone(),phase:b.spec.col*1.7+b.spec.layer*.9};});for(const b of bs){if(!(b.mat.guard||b.mat.crown))continue;const route=level.patrols?.find(r=>r.cell[0]===b.spec.layer&&r.cell[1]===b.spec.row&&r.cell[2]===b.spec.col);const valid=route&&RT.characterPaths.supported(specs,b.spec,route.points);const w={b,points:valid?route.points.map(p=>new T.Vector3(b.spec.x+p[0],b.spec.y,b.spec.z+p[1])):[],next:1,dir:1,walking:false,disabled:false,bucket:bucket(b),splash:0,pause:.25+((b.spec.col*7+b.spec.layer*11)%17)/10,steps:0,visual:b.mesh.getObjectByName('rascal-body'),feet:[b.mesh.getObjectByName('foot-left'),b.mesh.getObjectByName('foot-right')].filter(Boolean)};if(valid)P.removeWeldsFor(b.body);walkers.push(w);}}
let previewWalkers=null;
function endPreview(){if(!previewWalkers)return;for(const p of previewWalkers){p.w.b.mesh.position.copy(p.position);if(p.w.visual)p.w.visual.rotation.y=p.facing;p.w.feet.forEach((f,i)=>f.rotation.x=p.feet[i]);}previewWalkers=null;}
// Explore rehearses the routes without stepping physics or changing the live attempt.
function preview(dt,reduced=false){
 if(!previewWalkers)previewWalkers=walkers.filter(w=>w.b.alive&&!w.disabled&&w.points.length>1).map(w=>({w,position:w.b.mesh.position.clone(),facing:w.visual?.rotation.y||0,feet:w.feet.map(f=>f.rotation.x),next:w.next,dir:w.dir,pause:Math.max(.2,w.pause),steps:w.steps,age:0}));
 for(const p of previewWalkers){const w=p.w;p.age+=dt;let walking=false;if(p.pause>0){p.pause-=dt;if(w.visual)w.visual.rotation.y*=Math.max(0,1-dt*4);}else{const delta=w.points[p.next].clone().sub(w.b.mesh.position);delta.y=0;const distance=delta.length();if(distance<.03){if(p.next===w.points.length-1)p.dir=-1;if(p.next===0)p.dir=1;p.next+=p.dir;p.pause=.7+((++p.steps*13+w.b.spec.col*7)%19)/10;}else{walking=true;delta.normalize();w.b.mesh.position.addScaledVector(delta,Math.min(.6*dt,distance));if(w.visual){const angle=Math.atan2(delta.x,delta.z)-w.visual.rotation.y;w.visual.rotation.y+=Math.atan2(Math.sin(angle),Math.cos(angle))*Math.min(1,dt*8);}}}w.feet.forEach((f,i)=>f.rotation.x=walking&&!reduced?Math.sin(p.age*10+i*Math.PI)*.65:0);}
}
function clear(){endPreview();if(scene)for(const f of burns.values())removeEffect(f.g);burns.clear();walkers=[];ambient=[];blocks=[];}
function stop(){for(const w of walkers)if(w.walking&&w.b.alive){P.walk(w.b.body,0,0);w.walking=false;}}
function updateFirePose(w,dt,reduced){
 const fire=w.fireTarget;if(!fire||!w.b.alive||!w.visual)return;
 // Carry while walking; stop, turn toward the fire, then pour from the bucket rim.
 if(w.walking){w.splash=.9;return;}
 w.b.mesh.updateWorldMatrix(true,false);
 const direction=fire.mesh.position.clone().sub(w.b.mesh.position);direction.y=0;
 direction.applyQuaternion(w.b.mesh.getWorldQuaternion(new T.Quaternion()).invert());
 const target=Math.atan2(direction.x,direction.z),angle=Math.atan2(Math.sin(target-w.visual.rotation.y),Math.cos(target-w.visual.rotation.y));
 w.visual.rotation.y+=angle*Math.min(1,dt*8);
 if(Math.abs(angle)>.15){w.splash=.9;return;}
 w.splash-=dt;const pour=w.splash<=0;if(pour)w.splash=.9;
 w.bucket.rotation.x=reduced?0:.85*Math.max(0,1-(.9-w.splash)/.45);
 if(pour&&!reduced&&RT.effects){w.bucket.updateWorldMatrix(true,false);RT.effects.water(w.bucket.localToWorld(new T.Vector3(0,.12,.1)),fire.mesh.position);}
}
function update(dt,{patrol=false,reduced=false}={}){
 age+=dt;
 // Visual-only breathing and weight shifts keep sentries alive without moving hitboxes.
 for(const a of ambient){if(!a.b.alive||!a.visual)continue;const upright=Math.abs(a.b.mesh.quaternion.x)+Math.abs(a.b.mesh.quaternion.z)<.2;const amount=!reduced&&upright?1:0;a.startle=Math.max(0,(a.startle||0)-dt);const recoil=Math.sin(a.startle/.6*Math.PI)*amount;a.visual.scale.y=a.scale.y*(1+Math.sin(age*1.8+a.phase)*.018*amount-recoil*.08);a.visual.rotation.z=Math.sin(age*.85+a.phase)*.025*amount+Math.sin(age*15+a.phase)*recoil*.08;}
 for(const [b,f] of burns){if(!b.alive||f.left<=0||age>=fireEnd){removeEffect(f.g);burns.delete(b);continue;}f.left-=dt;f.heat+=dt;f.spread-=dt;
 // Anchors follow the real roof as it tilts; flames always rise vertically.
 b.mesh.updateWorldMatrix(true,false);f.g.position.copy(b.mesh.position);f.g.rotation.y=0;
 f.g.children.forEach(cluster=>{
  cluster.position.copy(b.mesh.localToWorld(cluster.userData.anchor.clone())).sub(f.g.position);
  const phase=cluster.userData.phase;
  cluster.scale.y=reduced?1:1+Math.sin(age*5.3+phase)*.13+Math.sin(age*8.7+phase)*.07;
 });
 const surface=b.mesh.getObjectByName('rascal-body')||b.mesh;if(surface.material!==surface.userData.charMaterial){surface.userData.charMaterial?.dispose();surface.userData.charMaterial=surface.material.clone();surface.userData.charBase=surface.material.color.clone();surface.material=surface.userData.charMaterial;}
 surface.material.color.copy(surface.userData.charBase).lerp(new T.Color(0x382b26),Math.min(.82,f.heat/9));
 if(f.heat>1.4&&RT.castleArt)RT.castleArt.damage(b.mesh,1-b.hp/b.mat.hp,b.mat,b.spec);
 hurt(b,dt*(b.mat.guard||b.mat.crown||b.mat.protected?25:b.mat.family==='wood'||b.mat.explodes?9:b.mat.family==='stone'?2.5:2));
 if(b.alive&&!(b.mat.guard||b.mat.crown||b.mat.protected))for(const other of blocks)if(other.alive&&(other.mat.guard||other.mat.crown||other.mat.protected)&&surfaceDistance(other.mesh.position,b)<.85)igniteBlock(other,2);
 if(f.spread<=0&&f.depth<2){f.spread=1.4;for(const other of blocks)if(other!==b&&other.mat.family==='wood'&&surfaceDistance(b.mesh.position,other)<Math.max(b.half.x,b.half.y,b.half.z)+.45)igniteBlock(other,f.depth+1);}
 f.emit-=dt;
 if(f.emit<=0){
  f.emit=RT.effects?.getIntensity()==='gentle'?.65:.32;
  if(!reduced&&RT.effects){
   const cluster=f.g.children[Math.floor(f.heat*3)%f.g.children.length];
   RT.effects.fire(f.g.position.clone().add(cluster.position),b.half,dt);
  }
 }
 }
 for(const w of walkers){const b=w.b;if(!b.alive){w.bucket.visible=false;w.fireTarget=null;continue;}
 // A toppled or struck character belongs to the collapse, never to its old route.
 if(Math.abs(b.mesh.position.y-b.spec.y)>.38||P.speed(b.body)>2.2||Math.abs(b.mesh.quaternion.x)+Math.abs(b.mesh.quaternion.z)>.2)w.disabled=true;
 const burning=!w.disabled?[...burns.keys()].filter(o=>o.alive&&o!==b&&o.mesh.position.distanceTo(b.mesh.position)<4).sort((a,c)=>a.mesh.position.distanceToSquared(b.mesh.position)-c.mesh.position.distanceToSquared(b.mesh.position)):[];
 const fire=w.fireTarget=burning[0]||null;w.bucket.visible=!!fire;w.bucket.rotation.set(0,0,0);
 for(let i=0;i<w.feet.length;i++)w.feet[i].rotation.x=w.walking&&!reduced?Math.sin(age*10+i*Math.PI)*.65:0;
 if(!patrol||w.disabled||w.points.length<2){if(w.walking){P.walk(b.body,0,0);w.walking=false;}continue;}
 if(w.pause>0&&!fire){w.pause-=dt;if(w.walking)P.walk(b.body,0,0);w.walking=false;if(w.visual)w.visual.rotation.y+=(0-w.visual.rotation.y)*Math.min(1,dt*4);continue;}
 let dest=w.points[w.next];if(fire)dest=w.points.reduce((best,p)=>p.distanceToSquared(fire.mesh.position)<best.distanceToSquared(fire.mesh.position)?p:best,w.points[0]);const delta=dest.clone().sub(b.mesh.position);delta.y=0;const distance=delta.length();if(distance<.08){if(w.walking)P.walk(b.body,0,0);w.walking=false;if(!fire){if(w.next===w.points.length-1)w.dir=-1;if(w.next===0)w.dir=1;w.next+=w.dir;w.steps++;w.pause=.7+((w.steps*13+b.spec.col*7)%19)/10;}continue;}
 const step=delta.normalize().multiplyScalar(Math.min(.6,distance/Math.max(dt,.001)));const ahead=b.mesh.position.clone().addScaledVector(step,Math.max(dt,.18));const specs=blocks.filter(o=>o.alive).map(o=>({...o.spec,x:o.mesh.position.x,y:o.mesh.position.y,z:o.mesh.position.z}));const who=specs.find(s=>s.layer===b.spec.layer&&s.row===b.spec.row&&s.col===b.spec.col);if(!who||!RT.characterPaths.supported(specs,who,[[0,0],[ahead.x-who.x,ahead.z-who.z]])){P.walk(b.body,0,0);w.walking=false;w.dir*=-1;w.next=Math.max(0,Math.min(w.points.length-1,w.next+w.dir));continue;}P.walk(b.body,step.x,step.z);w.walking=true;if(w.visual){const target=Math.atan2(step.x,step.z),angle=Math.atan2(Math.sin(target-w.visual.rotation.y),Math.cos(target-w.visual.rotation.y));w.visual.rotation.y+=angle*Math.min(1,dt*8);}
 }
 // Apply this after every movement branch, including static guards and arrival at a stop.
 for(const w of walkers)updateFirePose(w,dt,reduced);
}
return{init,clear,ignite,update,stop,preview,endPreview,react:pos=>{for(const a of ambient)if(a.b.alive&&a.b.mesh.position.distanceToSquared(pos)<20)a.startle=.6;},react:pos=>{for(const a of ambient)if(a.b.alive&&a.b.mesh.position.distanceToSquared(pos)<20)a.startle=.6;},patrolling:b=>walkers.some(w=>w.b===b&&!w.disabled&&w.points.length>1),active:()=>burns.size>0,debug:()=>({fires:[...burns].map(([b,f])=>({mat:b.mat.id,hp:b.hp,left:f.left,depth:f.depth})),characters:walkers.map(w=>({cell:[w.b.spec.layer,w.b.spec.row,w.b.spec.col],position:w.b.mesh.position.toArray(),moving:w.walking,disabled:w.disabled,bucket:w.bucket.visible,stops:w.points.length,pause:w.pause,idle:w.visual?[w.visual.scale.y,w.visual.rotation.z]:null,facing:w.visual?.rotation.y,feet:w.feet.map(f=>f.rotation.x)}))})};
})();
