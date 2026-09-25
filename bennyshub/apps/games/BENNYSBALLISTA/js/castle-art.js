/** Procedural castle craftsmanship: no remote assets, all detail follows its body. */
RT.castleArt = (function(){
'use strict';
const A=RT.art, T=THREE, base=A.buildBlock;
let masonry=null, timber=null;const mats=new Map();
let friendlyMarker;
function protectionTexture(){if(friendlyMarker)return friendlyMarker;const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const c=canvas.getContext('2d');c.fillStyle='#173b50';c.beginPath();c.moveTo(30,24);c.lineTo(226,24);c.lineTo(214,144);c.quadraticCurveTo(205,191,128,226);c.quadraticCurveTo(51,191,42,144);c.closePath();c.fill();c.strokeStyle='#fff8d8';c.lineWidth=12;c.stroke();c.fillStyle='#fff8d8';c.beginPath();c.moveTo(128,148);c.bezierCurveTo(52,98,84,52,128,89);c.bezierCurveTo(172,52,204,98,128,148);c.fill();c.font='bold 27px sans-serif';c.textAlign='center';c.fillText('PROTECT',128,189);friendlyMarker=new T.CanvasTexture(canvas);return friendlyMarker;}
function texture(wood){let cached=wood?timber:masonry;if(cached)return cached;const c=document.createElement('canvas');c.width=c.height=256;const x=c.getContext('2d');x.fillStyle=wood?'#b8a58a':'#b6b0a1';x.fillRect(0,0,256,256);const r=RT.util.rng(wood?951:932);
if(wood){for(let i=0;i<64;i++){x.strokeStyle='rgba(61,39,15,'+r.range(.08,.24)+')';x.lineWidth=r.range(1,3);x.beginPath();const y=r.range(0,256);x.moveTo(0,y);x.bezierCurveTo(80,y-8,180,y+9,256,y);x.stroke();}for(let j=0;j<4;j++){x.strokeStyle='#6d5639';x.lineWidth=3;x.strokeRect(2,j*64+2,252,60);}}else{for(let row=0;row<4;row++)for(let col=-1;col<3;col++){let xx=col*128+(row%2)*64;x.fillStyle='hsl(40,12%,'+r.int(69,88)+'%)';x.fillRect(xx+3,row*64+3,122,58);x.strokeStyle='#eee6d1';x.lineWidth=2;x.strokeRect(xx+5,row*64+5,118,54);for(let k=0;k<20;k++){x.fillStyle='rgba(40,30,12,.08)';x.fillRect(xx+r.range(5,119),row*64+r.range(5,58),2,2);}}}
const tex=new T.CanvasTexture(c);tex.wrapS=tex.wrapT=T.RepeatWrapping;tex.colorSpace=T.SRGBColorSpace;tex.anisotropy=4;if(wood)timber=tex;else masonry=tex;return tex;}
function material(color,wood){if(A.isFlatProfile())return A.paper(color);const key=color+'|'+wood; if(mats.has(key))return mats.get(key);const m=A.paper(color).clone();m.map=texture(wood);m.bumpMap=m.map;m.bumpScale=wood?.025:.045;m.roughness=.95;m.flatShading=false;mats.set(key,m);return m;}
function uvWorld(g){const p=g.attributes.position,n=g.attributes.normal,uv=g.attributes.uv;for(let i=0;i<p.count;i++){let u,v;if(Math.abs(n.getY(i))>.5){u=p.getX(i);v=p.getZ(i);}else if(Math.abs(n.getX(i))>.5){u=p.getZ(i);v=p.getY(i);}else{u=p.getX(i);v=p.getY(i);}uv.setXY(i,u*.65,v*.65);}uv.needsUpdate=true;return g;}
function add(parent,geo,color,pos,scale){const m=new T.Mesh(geo,A.paper(color,{noMap:true}));if(pos)m.position.set(...pos);if(scale)m.scale.set(...scale);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
function batch(parent,parts,color){if(!parts.length)return;const positions=[],normals=[],uv=[];for(const {g,p=[0,0,0],r=[0,0,0],s=[1,1,1]} of parts){const geo=g.index?g.toNonIndexed():g;const matrix=new T.Matrix4().compose(new T.Vector3(...p),new T.Quaternion().setFromEuler(new T.Euler(...r)),new T.Vector3(...s));geo.applyMatrix4(matrix);positions.push(...geo.attributes.position.array);normals.push(...geo.attributes.normal.array);if(geo.attributes.uv)uv.push(...geo.attributes.uv.array);geo.dispose();if(geo!==g)g.dispose();}const out=new T.BufferGeometry();out.setAttribute('position',new T.Float32BufferAttribute(positions,3));out.setAttribute('normal',new T.Float32BufferAttribute(normals,3));if(uv.length)out.setAttribute('uv',new T.Float32BufferAttribute(uv,2));return add(parent,out,color);}
const glassMaterials=new Map();
function glassMaterial(color,crystal=false){const key=color+'|'+crystal;if(!glassMaterials.has(key))glassMaterials.set(key,new T.MeshPhongMaterial({color,transparent:true,opacity:crystal?.24:.10,depthWrite:false,shininess:95,specular:0xffffff,side:T.FrontSide}));return glassMaterials.get(key);}
function glassBlock(w,h,d,color,crystal=false){const m=new T.Mesh(crystal?new T.OctahedronGeometry(Math.min(w,h,d)*.5):box(w,h,d),glassMaterial(color,crystal));m.userData.clearGlass=true;const edges=new T.LineSegments(new T.EdgesGeometry(m.geometry),new T.LineBasicMaterial({color:0x355c67,transparent:true,opacity:.8}));edges.name='glass-frame';m.add(edges);if(!crystal){const shine=new T.LineSegments(new T.BufferGeometry().setFromPoints([new T.Vector3(-w*.30,-h*.27,d/2+.003),new T.Vector3(-w*.08,h*.27,d/2+.003),new T.Vector3(w*.02,-h*.27,d/2+.003),new T.Vector3(w*.24,h*.27,d/2+.003)]),new T.LineBasicMaterial({color:0xffffff,transparent:true,opacity:.65}));m.add(shine);}return m;}
const box=(x,y,z)=>new T.BoxGeometry(x,y,z),sphere=(r)=>new T.SphereGeometry(r,12,8);
function rascal(w,h,d,color,shape){const king=shape==='crown',pumpkin=shape==='guard-halberd',jester=shape==='jester',frost=shape==='frost';const mesh=new T.Mesh(sphere(.34),A.paper(king?'#9b84bb':jester?'#cc798c':frost?'#84c9da':pumpkin?'#d89a58':'#8eb572',{noMap:true}));mesh.scale.set(w,h,d);mesh.userData.rascal=true;mesh.castShadow=true;
// Body silhouette stays inside the collision cell, including hat and ears.
const details=[];for(const side of [-1,1]){const foot=new T.Group();foot.name=side<0?'foot-left':'foot-right';foot.position.set(side*.23,-.22,0);add(foot,sphere(.12),king?'#6d548a':pumpkin?'#99704a':'#54794d',[0,-.12,.08],[1,.65,1.45]);mesh.add(foot);details.push({g:new T.ConeGeometry(.12,.25,4),p:[side*.34,.1,0],r:[0,0,side*-1.1]});}batch(mesh,details,king?'#6d548a':pumpkin?'#99704a':'#54794d');
batch(mesh,[{g:sphere(.12),p:[-.13,.09,.285],s:[.8,1,.4]},{g:sphere(.12),p:[.13,.09,.285],s:[.8,1,.4]}],'#fff8dc');batch(mesh,[{g:sphere(.055),p:[-.12,.075,.332],s:[.7,1,.4]},{g:sphere(.055),p:[.14,.075,.332],s:[.7,1,.4]},{g:box(.19,.026,.025),p:[0,-.14,.327],r:[0,0,.1]}],'#243c3c');add(mesh,sphere(.07),king?'#c5a4ca':'#b8c680',[0,-.025,.34],[1.3,.9,.8]);
if(jester){for(const side of [-1,1]){const hat=add(mesh,new T.ConeGeometry(.13,.27,7),side<0?'#765c9a':'#dcbb59',[side*.14,.32,0]);hat.rotation.z=side*-.4;add(mesh,sphere(.045),'#f9df7c',[side*.2,.46,0]);}}else if(frost){add(mesh,new T.ConeGeometry(.23,.33,6),'#b5e9eb',[0,.31,0]);}else if(king){const crown=[{g:new T.CylinderGeometry(.25,.25,.1,8),p:[0,.31,0]}];for(let i=0;i<5;i++){const a=i*Math.PI*2/5;crown.push({g:new T.ConeGeometry(.08,.18,4),p:[Math.cos(a)*.2,.42,Math.sin(a)*.2]});}batch(mesh,crown,'#efbd44');add(mesh,sphere(.04),'#db6e66',[0,.33,.25]);}else{add(mesh,new T.SphereGeometry(.27,12,6,0,Math.PI*2,0,Math.PI/2),'#8b9aa2',[0,.19,0],[1,.7,1]);add(mesh,box(.08,.2,.09),pumpkin?'#eab462':'#be7365',[0,.35,0]);}
mesh.name='rascal-body';const root=new T.Mesh(box(w,h,d),new T.MeshBasicMaterial({visible:false}));root.userData.rascal=true;root.add(mesh);return root;}
const pickupTextures=new Map();
function pickupTexture(id){if(pickupTextures.has(id))return pickupTextures.get(id);const c=document.createElement('canvas');c.width=c.height=256;const x=c.getContext('2d');x.fillStyle='#fff1c2';x.fillRect(0,0,256,256);x.strokeStyle='#66492f';x.lineWidth=14;x.strokeRect(7,7,242,242);x.fillStyle='#304638';x.font='bold 32px sans-serif';x.textAlign='center';x.fillText({stone:'BOLT',fire:'FIRE',splitter:'SPLIT',bomb:'BOMB'}[id],128,220);x.strokeStyle=id==='fire'?'#d77528':id==='splitter'?'#8971ad':'#506778';x.fillStyle=x.strokeStyle;x.lineWidth=16;x.lineCap='round';
if(id==='bomb'){x.beginPath();x.arc(125,113,50,0,Math.PI*2);x.fill();x.beginPath();x.moveTo(148,66);x.quadraticCurveTo(158,32,182,48);x.stroke();}else{for(const yy of id==='splitter'?[65,115,165]:[110]){x.beginPath();x.moveTo(58,yy+22);x.lineTo(181,yy-18);x.stroke();x.beginPath();x.moveTo(185,yy-20);x.lineTo(148,yy-33);x.lineTo(168,yy+6);x.closePath();x.fill();}}
const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;pickupTextures.set(id,tex);return tex;}
const coinTextures=new Map();
function ammoCoinTexture(id){
 if(coinTextures.has(id))return coinTextures.get(id);
 const c=document.createElement('canvas');c.width=c.height=512;const x=c.getContext('2d');
 x.beginPath();x.arc(256,256,240,0,Math.PI*2);x.fillStyle='#172c30';x.fill();
 x.beginPath();x.arc(256,256,220,0,Math.PI*2);x.fillStyle='#ffd75e';x.fill();
 x.beginPath();x.arc(256,256,188,0,Math.PI*2);x.fillStyle='#fff9de';x.fill();x.lineWidth=12;x.strokeStyle='#172c30';x.stroke();
 x.strokeStyle='#172c30';x.fillStyle='#172c30';x.lineWidth=23;x.lineCap='round';x.lineJoin='round';
 const arrow=(x0,y0,x1,y1)=>{x.beginPath();x.moveTo(x0,y0);x.lineTo(x1,y1);x.stroke();const a=Math.atan2(y1-y0,x1-x0);x.beginPath();x.moveTo(x1,y1);x.lineTo(x1-54*Math.cos(a-.6),y1-54*Math.sin(a-.6));x.lineTo(x1-54*Math.cos(a+.6),y1-54*Math.sin(a+.6));x.closePath();x.fill();};
 if(id==='stone')arrow(150,310,355,145);
 if(id==='splitter'){arrow(160,290,338,135);arrow(160,290,368,235);arrow(160,290,337,328);}
 if(id==='fire'){x.beginPath();x.moveTo(210,323);x.bezierCurveTo(103,262,190,177,236,114);x.bezierCurveTo(210,229,298,150,284,102);x.bezierCurveTo(405,231,367,332,281,333);x.closePath();x.fillStyle='#bf3a14';x.fill();x.stroke();x.fillStyle='#172c30';}
 if(id==='bomb'){x.beginPath();x.arc(243,265,79,0,Math.PI*2);x.fill();x.beginPath();x.moveTo(272,187);x.quadraticCurveTo(294,104,342,141);x.stroke();for(let i=0;i<5;i++){const a=i*Math.PI*2/5;x.beginPath();x.moveTo(354+Math.cos(a)*24,125+Math.sin(a)*24);x.lineTo(354+Math.cos(a)*43,125+Math.sin(a)*43);x.stroke();}}
 x.font='900 48px sans-serif';x.textAlign='center';x.fillText({stone:'BOLT',fire:'FIRE',splitter:'SPLIT',bomb:'BOMB'}[id],256,395);
 const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;coinTextures.set(id,tex);return tex;
}
A.buildBlock=function(w,h,d,color,opts={}){
if(opts.shape==='ammo-crate'){const id=RT.data.MAT[opts.matId].pickup,m=base(w,h,d,color,{shape:'crate'});m.userData.pickup=true;for(const y of [-.39,.39])add(m,box(w+.035,.1,d+.035),'#e9bd52',[0,y*h,0]);const face=new T.Mesh(new T.PlaneGeometry(w*.86,h*.86),new T.MeshBasicMaterial({map:pickupTexture(id)}));face.position.z=d/2+.018;m.add(face);const coin=new T.Sprite(new T.SpriteMaterial({map:ammoCoinTexture(id),depthTest:false,depthWrite:false,fog:false}));coin.name='ammo-emblem-coin';coin.userData.ammo=id;coin.position.set(0,h/2+1.05,0);coin.scale.set(1.8,1.8,1);coin.renderOrder=12;m.add(coin);return m;}

if(['I','i','V'].includes(opts.matId))return glassBlock(w,h,d,color,opts.matId==='V');
if(opts.shape==='princess'||opts.shape==='friendly'){
 const id=opts.matId||'A',princess=id==='A',skin='#e9bd9e',coat={A:'#8ecdc5',v:'#e5d1a3',f:'#5ea9b9',h:'#e2eadc',m:'#c78f73'}[id]||'#8ecdc5';
 const m=new T.Mesh(box(w,h,d),new T.MeshBasicMaterial({visible:false}));m.userData.rascal=true;m.userData.protected=true;
 const body=add(m,princess?new T.ConeGeometry(.29,.48,12):new T.SphereGeometry(.27,12,9),coat,[0,-.13,0]);body.name='rascal-body';if(!princess)body.scale.set(1,.9,.8);
 add(m,sphere(.21),skin,[0,.2,0]);add(m,new T.SphereGeometry(.217,12,8,0,Math.PI*2,0,Math.PI/2),id==='h'?'#dfd9c9':'#775b45',[0,.23,0]);
 for(const x of [-.075,.075]){add(m,sphere(.035),'#fff9e9',[x,.23,.19]);add(m,sphere(.018),'#263c41',[x,.23,.22]);}
 for(const x of [-.13,.13]){const foot=add(m,box(.16,.13,.24),'#66544b',[x,-.42,.04]);foot.name=x<0?'foot-left':'foot-right';}
 add(m,new T.TorusGeometry(.07,.012,5,12,Math.PI),'#976e60',[0,.12,.208]).rotation.z=Math.PI;
 if(princess)add(m,new T.ConeGeometry(.11,.16,5),'#efbd44',[0,.45,0]);
 if(id==='f'){add(m,new T.CylinderGeometry(.25,.25,.055,12),'#e3c47c',[0,.41,0]);add(m,new T.CylinderGeometry(.15,.2,.14,12),'#e3c47c',[0,.46,0]);add(m,new T.CylinderGeometry(.07,.1,.18,8),'#8eb9c0',[.31,-.25,0]);}
 if(id==='h'){add(m,box(.19,.12,.08),'#ffffff',[0,.36,.19]);add(m,box(.055,.085,.01),'#4a8b6e',[0,.36,.236]);add(m,box(.10,.03,.01),'#4a8b6e',[0,.36,.242]);add(m,box(.14,.19,.10),'#4a8b6e',[.29,-.22,0]);}
 if(id==='m')add(m,box(.18,.23,.12),'#795f49',[.27,-.22,.05]);
 const marker=new T.Sprite(new T.SpriteMaterial({map:protectionTexture(),depthTest:false,depthWrite:false}));marker.name='protection-shield';marker.position.set(0,.93,0);marker.scale.set(1.25,1.25,1);marker.renderOrder=13;m.add(marker);m.scale.set(w,h,d);return m;
}
if(opts.shape==='prison'){const m=new T.Mesh(box(w,h,d),new T.MeshBasicMaterial({visible:false}));m.userData.prison=true;for(const x of [-.35,0,.35])add(m,new T.CylinderGeometry(.045,.045,h,6),'#606f72',[x*w,0,d*.35]);for(const y of [-.4,.4])add(m,box(w,.09,.12),'#946b45',[0,y*h,d*.35]);return m;}
if(['crown','guard-spear','guard-halberd','jester','frost'].includes(opts.shape))return rascal(w,h,d,color,opts.shape);
let mesh;const id=opts.matId;
if(opts.shape==='roof'){const shape=new T.Shape();shape.moveTo(-w/2,-h/2);shape.lineTo(0,h/2);shape.lineTo(w/2,-h/2);shape.closePath();const roof=new T.ExtrudeGeometry(shape,{depth:d,bevelEnabled:false,steps:1});roof.translate(0,0,-d/2);mesh=new T.Mesh(roof,A.paper(color));mesh.castShadow=true;}
else if(opts.shape==='column'){mesh=new T.Mesh(new T.CylinderGeometry(w*.46,w*.46,h,12),material(color,false));mesh.castShadow=true;}
else if(opts.shape==='crystal'){mesh=new T.Mesh(new T.OctahedronGeometry(Math.min(w,h,d)*.5),A.glow(color,.3));mesh.castShadow=true;}
else mesh=base(w,h,d,color,opts);
if(['S','M','C','P','W','O','B','U'].includes(id)){mesh.material=material(color,['W','O','B','U'].includes(id));uvWorld(mesh.geometry);mesh.userData.crafted=id;
if(['S','M','C','P'].includes(id)&&w>=.9&&h>=.7){// Mortar bands must sit outside the wall faces. Coplanar boxes flickered
// whenever a patrolling character nudged the supporting body's transform.
const trims=[{g:box(w+.024,.055,d+.024),p:[0,-h/2+.035,0]},{g:box(w+.024,.045,d+.024),p:[0,h/2-.025,0]}];
const trim=batch(mesh,trims,'#b5a180');trim.name='masonry-trim';trim.castShadow=false;}
if(['W','O','B','U'].includes(id)&&w>=.8){const pieces=[];for(let x=-w/2+.12;x<w/2;x+=Math.max(.8,w/3)){pieces.push({g:box(.055,Math.min(h,.8),.03),p:[x,0,d/2]});}batch(mesh,pieces,'#6d5540');}}
if(id==='T'){const rings=[];for(const y of [-.31,.3])rings.push({g:new T.TorusGeometry(Math.min(w,d)*.49,.04,5,12),p:[0,y,0],r:[Math.PI/2,0,0]});batch(mesh,rings,'#58676c');add(mesh,box(.12,.22,.12),'#735438',[0,h/2+.04,0]);}
return mesh;};
function dress(blocks,ix){const theme=['#547d8b','#b86650','#758757','#8273a3','#487e78'][ix%5];
for(const b of blocks){if(!b.alive||b.mat.crown||b.mat.guard||b.mat.small)continue;const {w,h,d}=b.spec;const top=b.mesh.position.y+h/2;
const above=blocks.some(o=>o!==b&&o.mesh.position.y-o.half.y>=top-.1&&o.mesh.position.y-o.half.y<top+.2&&Math.abs(o.mesh.position.x-b.mesh.position.x)<(o.half.x+b.half.x)*.85&&Math.abs(o.mesh.position.z-b.mesh.position.z)<(o.half.z+b.half.z)*.85);
if(['S','M','C','P'].includes(b.mat.id)){
// Window recesses are shallow surface details: never independent floating props.
if(h>.7&&w>.7){const parts=[];for(let x=-w/2+.5;x<w/2;x+=1.5)parts.push({g:box(.2,.42,.016),p:[x,0,d/2+.012]});batch(b.mesh,parts,'#47595b');const frames=[];for(let x=-w/2+.5;x<w/2;x+=1.5){frames.push({g:box(.26,.07,.04),p:[x,-.23,d/2+.024]});frames.push({g:box(.26,.07,.04),p:[x,.23,d/2+.024]});}batch(b.mesh,frames,'#e0cda9');}
if(!above&&w>=.9){const merlons=[];for(let x=-w/2+.18;x<w/2;x+=.65){merlons.push({g:box(.3,.24,Math.min(d,.26)),p:[x,h/2+.12,d/2-.13]});if(d>1)merlons.push({g:box(.3,.24,.26),p:[x,h/2+.12,-d/2+.13]});}batch(b.mesh,merlons,'#d6bf99');}}
if(!above&&(b.mat.id==='S'||b.mat.id==='W')&&w>=.8&&w<=3.1&&h>.5&&d>=.9&&top>2){
// Roof, finial and banner are children of this rigid body and tumble with it.
const roof=new T.ConeGeometry(1,.95,4);roof.rotateY(Math.PI/4);add(b.mesh,roof,theme,[0,h/2+.45,0],[w*.72,1,d*.72]);add(b.mesh,new T.CylinderGeometry(.035,.035,.8,6),'#74634b',[0,h/2+1.23,0]);const shape=new T.Shape();shape.moveTo(0,0);shape.lineTo(.65,-.06);shape.lineTo(.48,-.22);shape.lineTo(.65,-.39);shape.lineTo(0,-.32);shape.closePath();const flag=add(b.mesh,new T.ShapeGeometry(shape),'#e8b94e',[.025,h/2+1.55,0]);flag.material=A.paper('#e8b94e',{side:T.DoubleSide,noMap:true});}
if(b.mat.id==='W'&&h>.8&&w>.8){const brace=add(b.mesh,box(Math.min(w*.9,1.1),.075,.06),'#dfb982',[0,0,d/2+.025]);brace.rotation.z=.65;}
}}
function damage(mesh,amount=.35,material={},spec){
 if(mesh.userData.rascal||mesh.userData.pickup)return;const stage=Math.max(1,Math.min(3,Math.ceil(amount*3)));if((mesh.userData.damageStage||0)>=stage)return;
 mesh.userData.cracked=true;mesh.userData.damageStage=stage;
 const old=mesh.getObjectByName('damage-cracks');if(old){mesh.remove(old);old.geometry.dispose();old.material.dispose();}
 if(!mesh.geometry)return;
 mesh.geometry.computeBoundingBox();const bounds=mesh.geometry.boundingBox,size=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3()),pts=[];
 const wood=material.family==='wood',probe=new T.Mesh(mesh.geometry,mesh.material),ray=new T.Raycaster();
 // Project onto the rendered shape, not its box-shaped physics collider.
 // Short segments are clipped at silhouettes and creases so roof cracks
 // cannot hang in space beside a slope or bridge across a curved surface.
 for(let face=0;face<4;face++)for(let branch=0;branch<stage;branch++){
  const front=face<2,horizontal=front?size.x:size.z,half=front?size.z/2:size.x/2,sign=face%2?-1:1;
  const direction=front?new T.Vector3(0,0,-sign):new T.Vector3(-sign,0,0);let previous;
  const knot=j=>new T.Vector2(wood?(-.4+j*.2)*horizontal:((branch-1)*.19+Math.sin(j*2.3+branch)*.095)*horizontal,wood?((branch-1)*.18+Math.sin(j+branch)*.025)*size.y:(.42-j*.21)*size.y);
  for(let step=0;step<=32;step++){
   const j=Math.min(3,Math.floor(step/8)),uv=knot(j).lerp(knot(j+1),(step-j*8)/8);
   const origin=(front?new T.Vector3(uv.x,uv.y,sign*(half+1)):new T.Vector3(sign*(half+1),uv.y,uv.x)).add(center);
   ray.set(origin,direction);const hit=ray.intersectObject(probe,false)[0];
   if(!hit){previous=null;continue;}
   const normal=hit.face.normal,point=hit.point.clone().addScaledVector(normal,.006);
   if(previous&&normal.dot(previous.normal)>.995)pts.push(previous.point,point);
   previous={point,normal};
  }
 }
 const lines=new T.LineSegments(new T.BufferGeometry().setFromPoints(pts),new T.LineBasicMaterial({color:wood?0x513727:0x51473b,transparent:true,opacity:.65+stage*.1}));lines.name='damage-cracks';mesh.add(lines);
}
function attendant(side=1){
 const root=new T.Group();root.name=side>0?'ballista-attendant-right':'ballista-attendant-left';root.userData.attendant=true;
 const figure=rascal(1,1,1,'#8eb572','guard-spear');figure.position.y=.59;figure.scale.setScalar(1.45);root.add(figure);const body=figure.getObjectByName('rascal-body');
 // Same face, feet and round silhouette as the castle cast, in the player's colors.
 body.material=A.paper(side>0?'#a6bf82':'#c5b88e',{noMap:true});
 const plume=body.children.find(o=>o.position.y===.35);if(plume)plume.material=A.paper('#fff0b5',{noMap:true});
 add(body,sphere(.28),'#397f82',[0,-.20,-.035],[1,.46,.95]);add(body,box(.15,.16,.025),'#e8c666',[0,-.20,.245]);
 const spear=new T.Group();spear.name='attendant-spear';spear.position.set(side*.46,-.06,.10);body.add(spear);
 add(spear,new T.CylinderGeometry(.024,.032,1.35,8),'#86623e',[0,.27,0]);add(spear,new T.ConeGeometry(.10,.28,4),'#cedddd',[0,1.06,0],[1,1,.45]);add(spear,new T.CylinderGeometry(.04,.04,.07,8),'#d9b762',[0,.89,0]);
 add(body,sphere(.085),'#b4c88c',[side*.46,-.05,.10],[1,1,.9]);
 const pennant=new T.Shape();pennant.moveTo(0,0);pennant.lineTo(side*.23,-.04);pennant.lineTo(side*.16,-.19);pennant.lineTo(0,-.15);pennant.closePath();const flag=add(spear,new T.ShapeGeometry(pennant),'#eac763',[0,.84,0]);flag.material=A.paper('#eac763',{noMap:true,side:T.DoubleSide});
 root.rotation.y=-side*.55;return root;
}

function repaint(mesh,color,id){if(mesh.userData.clearGlass){mesh.material=glassMaterial(color,id==='V');return;}if(mesh.userData.rascal||mesh.userData.pickup)return;if(mesh.userData.crafted)mesh.material=material(color,['W','O','B','U'].includes(id));mesh.traverse(o=>{if(o.isMesh&&o!==mesh&&A.isFlatProfile())o.material=A.paper(o.material.color.getHex());});}
function projectile(a){if(a.id==='stone'||a.id==='fire'){const g=new T.Group();const shaft=add(g,new T.CylinderGeometry(.07,.07,1.5,8),'#936944');shaft.rotation.x=Math.PI/2;const tip=add(g,new T.ConeGeometry(.22,.55,6),a.id==='fire'?'#eea647':'#9baeb8',[0,0,.9]);tip.rotation.x=Math.PI/2;for(let i=0;i<3;i++){const f=add(g,box(.38,.025,.35),a.id==='fire'?'#d87743':'#4c958c',[0,0,-.5]);f.rotation.z=i*Math.PI/3;}return g;}
if(a.id==='boulder')return add(new T.Group(),new T.DodecahedronGeometry(a.r*1.2,0),'#a3a99f');const g=new T.Group();if(a.id==='splitter'&&a.fragment){add(g,new T.IcosahedronGeometry(a.r,0),'#a595c2');}else if(a.id==='splitter'){for(let i=0;i<3;i++){const t=i*2*Math.PI/3;add(g,new T.IcosahedronGeometry(a.r*.75,0),'#a595c2',[Math.cos(t)*.15,Math.sin(t)*.15,0]);}}else{add(g,sphere(a.r),'#425b68');add(g,new T.CylinderGeometry(.055,.055,.2,6),'#deb667',[0,a.r+.07,0]);add(g,sphere(.07),'#ffd877',[0,a.r+.2,0]);}return g;}
function narrator(style='rowan'){
 const g=new T.Group();g.name='Story guide';g.userData.narratorStyle=style;
 // The same round body, little feet, eyes and ears as the castle rascals.
 const figure=rascal(1,1,1,'#8eb572','guide'),friend=figure.getObjectByName('rascal-body');figure.position.y=.78;figure.scale.setScalar(1.85);g.add(figure);
 // Replace the guard helmet with a soft green cap and friendly feather.
 const helmet=friend.children.find(o=>o.geometry?.type==='SphereGeometry'&&o.position.y===.19);if(helmet){friend.remove(helmet);helmet.geometry.dispose();}
 const plume=friend.children.find(o=>o.position.y===.35);if(plume){friend.remove(plume);plume.geometry.dispose();}
 if(style==='rowan'){
  add(friend,new T.ConeGeometry(.28,.4,8),'#347d70',[0,.37,0]);const feather=add(friend,new T.ConeGeometry(.05,.4,5),'#ffe094',[.21,.53,0]);feather.rotation.z=-.35;
 }else{
  const skin=style==='elder'?'#d8ad8d':'#cfa080';friend.material=A.paper(skin,{noMap:true});
  const ears=friend.children.find(o=>o.geometry?.type==='BufferGeometry');if(ears){friend.remove(ears);ears.geometry.dispose();}
  for(const side of [-1,1])add(friend,sphere(.065),skin,[side*.31,.02,0],[.7,1,1]);
  const nose=friend.children.find(o=>o.geometry?.type==='SphereGeometry'&&o.position.y===-.025);if(nose)nose.material=A.paper(skin,{noMap:true});
  for(const side of ['foot-left','foot-right'])friend.getObjectByName(side).traverse(o=>{if(o.isMesh)o.material=A.paper('#624d40',{noMap:true});});
  add(friend,sphere(.24),style==='elder'?'#557886':'#79558c',[0,-.28,-.03],[1,.42,.8]);
  if(style==='elder'){
   for(const side of [-1,1]){add(friend,sphere(.12),'#e3e0d4',[side*.25,.2,-.05],[.7,1,.8]);add(friend,new T.TorusGeometry(.10,.012,5,16),'#5b4e42',[side*.13,.08,.34]);add(friend,sphere(.095),'#e3e0d4',[side*.07,-.13,.31],[1,.45,.55]);}
   add(friend,box(.07,.014,.012),'#5b4e42',[0,.08,.35]);add(friend,sphere(.18),'#e3e0d4',[0,-.23,.20],[.85,1.05,.65]);
   add(friend,new T.CylinderGeometry(.025,.03,.76,7),'#826243',[.38,-.12,.02]);
  }else{
   add(friend,new T.SphereGeometry(.285,12,7,0,Math.PI*2,0,Math.PI/2),'#664133',[0,.15,-.035],[1,.72,1]);
   add(friend,sphere(.15),'#664133',[0,.27,-.23]);
   for(let i=0;i<4;i++)add(friend,sphere(.07-i*.006),'#664133',[.265,-.015-i*.085,.01],[.8,1.1,.8]);
   add(friend,sphere(.046),'#ead38b',[.265,-.3,.045],[1,.6,.6]);
  }
 }
 add(friend,new T.CylinderGeometry(.07,.07,.36,8),'#fff0bf',[-.34,-.05,.27]);
 g.userData.legs=[friend.getObjectByName('foot-left'),friend.getObjectByName('foot-right')];g.userData.walkBody=friend;g.traverse(o=>{o.castShadow=false;o.receiveShadow=false;});return g;
}
return {dress,damage,repaint,projectile,narrator,attendant};
})();
