/** Cosmetic, bounded siege effects. Never changes physics, damage or targeting. */
RT.effects = (function () {
  'use strict';
  const T=THREE,U=RT.util,modes=['full','gentle','minimal'],random=U.rng(732451).next;
  let intensity=U.load('ballista-effects','full'),scene,items=[],clock=0,reducedMode=false,observed=new WeakMap();
  if(!modes.includes(intensity))intensity='full';
  const geometry={chip:new T.BoxGeometry(1,1,1),rock:new T.IcosahedronGeometry(1,0),shard:new T.ConeGeometry(1,2,3),ring:new T.RingGeometry(.88,1,40)};
  const materials=new Map(),timers=new Map();
  function texture(star){const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d');if(star){x.fillStyle='#fff';x.beginPath();for(let i=0;i<8;i++){const a=i*Math.PI/4,r=i%2?8:30;x.lineTo(32+Math.cos(a)*r,32+Math.sin(a)*r);}x.closePath();x.fill();}else{const g=x.createRadialGradient(32,32,2,32,32,31);g.addColorStop(0,'#ffffffaa');g.addColorStop(.45,'#ffffff66');g.addColorStop(1,'#ffffff00');x.fillStyle=g;x.fillRect(0,0,64,64);}return new T.CanvasTexture(c);}
  const smoke=texture(false),star=texture(true);
  function mat(color,kind,fade=7){const key=color+kind+fade;if(!materials.has(key)){const opts={color,transparent:true,opacity:fade/7,depthWrite:false};materials.set(key,kind==='dust'||kind==='star'||kind==='ember'||kind==='plume'?new T.SpriteMaterial({...opts,map:kind==='star'?star:smoke}):new T.MeshBasicMaterial({...opts,side:T.DoubleSide}));}return materials.get(key);}
  function mode(reduced=false){return reduced||reducedMode?'minimal':intensity;}
  function quota(reduced){return mode(reduced)==='minimal'?0:mode(reduced)==='gentle'?.35:1;}
  function ready(key,interval){if(clock-(timers.get(key)??-Infinity)<interval)return false;timers.set(key,clock);return true;}
  function particle(pos,color,size,velocity,life,kind='rock',gravity=7){
    if(!scene||items.length>=(intensity==='full'?220:75))return;
    if(kind==='dust'&&items.filter(p=>p.kind==='dust').length>=20)return;
    if(kind==='plume'&&items.filter(p=>p.kind==='plume').length>=(intensity==='full'?36:12))return;
    if(kind==='ember'&&items.filter(p=>p.kind==='ember').length>=48)return;
    const m=kind==='dust'||kind==='star'||kind==='ember'||kind==='plume'?new T.Sprite((kind==='ember'||kind==='plume')?mat(color,kind).clone():mat(color,kind)):new T.Mesh(geometry[kind],mat(color,kind));
    m.name='siege-'+kind;m.position.copy(pos);m.scale.setScalar(size);if(kind==='chip')m.scale.y*=.22;if(kind==='shard')m.scale.z*=.12;
    if(kind==='ring')m.rotation.x=-Math.PI/2;else if(!m.isSprite)m.rotation.set(random()*3,random()*3,random()*3);
    scene.add(m);items.push({m,color,kind,size,v:velocity.clone(),life,max:life,gravity,spin:(random()-.5)*9});
  }
  function dust(pos,color,count=3,scale=1){for(let i=0;i<count;i++)particle(pos,color,scale*(.6+random()*.4),new T.Vector3((random()-.5)*1.8,.6+random(),(random()-.5)*1.8),1+random()*.5,'dust',-.15);}
  function ring(pos,color,size,reduced){if(!quota(reduced)||!ready('ring',.09))return;particle(pos.clone().add(new T.Vector3(0,.06,0)),color,size,new T.Vector3(),.65,'ring',0);}
  function burst(pos,material={},broken=false,reduced=false){
    const q=quota(reduced);if(!q||!ready('burst',broken?.025:.045))return;
    const key=material.crown||material.guard,wood=material.family==='wood',glass=material.glass,metal=material.family==='steel'||material.family==='metal';
    const color=key?'#ffe69a':wood?'#c38d52':glass?'#b7f3f5':metal?'#bacdd9':'#c9bca4';
    const kind=key?'star':wood?'chip':glass?'shard':'rock',n=Math.ceil((broken?key?18:22:8)*q);
    for(let i=0;i<n;i++){const a=random()*Math.PI*2,s=(broken?3:1.5)+random()*3;particle(pos,i%3===0?(key?'#a2d5b5':wood?'#785238':'#f4e9cd'):color,(key?.15:glass?.12:.08)+random()*.17,new T.Vector3(Math.cos(a)*s,1.5+random()*4,Math.sin(a)*s),.7+random()*.7,kind,key?2:8);}
    if(!glass)dust(pos,key?'#b8ddc3':wood?'#d2b284':'#cfc6b5',Math.ceil((broken?4:2)*q),broken?1.1:.65);
    if(key&&broken)ring(pos,'#ffe4a0',.6,reduced);
  }
  // Spread the break over the whole piece, so a wide roof bursts across its
  // span instead of leaving one tiny puff at its center. Cosmetic only.
  function fracture(b,reduced=false){
    const q=quota(reduced);if(!q)return;
    const wood=b.mat.family==='wood',n=Math.ceil(Math.min(16,4+b.half.length()*3)*q);
    for(let i=0;i<n;i++){
      const off=new T.Vector3((random()*2-1)*b.half.x,(random()*2-1)*b.half.y,(random()*2-1)*b.half.z).applyQuaternion(b.mesh.quaternion),p=b.mesh.position.clone().add(off);
      const v=off.clone().normalize().multiplyScalar(2+random()*3);v.y+=1+random()*3;
      particle(p,wood?'#d5a365':'#d4c8b1',.13+random()*.18,v,.8+random()*.6,wood?'chip':'rock',8);
      if(i%4===0)dust(p,wood?'#ceb18a':'#d1c8b9',1,.8);
    }
  }
  function explosion(pos,reduced=false){const q=quota(reduced);if(!q||!ready('explosion',.07))return;ring(pos,'#ffd18b',2.5,reduced);for(let i=0;i<Math.ceil(30*q);i++){const a=random()*Math.PI*2;particle(pos,i%3?'#ffb951':'#ffe7a3',.08+random()*.14,new T.Vector3(Math.cos(a)*7,2+random()*6,Math.sin(a)*7),.6+random()*.5,'star',5);}dust(pos,'#baaa95',Math.ceil(5*q),1.8);}
  function strike(pos,id,reduced=false){if(id==='bomb'){explosion(pos,reduced);return;}if(id==='fire'){if(quota(reduced))dust(pos,'#e8ac65',2,.7);}else if(id==='boulder'){ring(pos,'#dfc79e',1.25,reduced);if(quota(reduced))dust(pos,'#cbb899',Math.ceil(4*quota(reduced)),1.1);}}
  function split(pos,reduced=false){if(!quota(reduced))return;for(let i=0;i<12*quota(reduced);i++){const a=i*Math.PI/6;particle(pos,'#dbc7ff',.17,new T.Vector3(Math.cos(a)*3,Math.sin(a)*3,0),.6,'star',0);}}
  function trail(pos,id,dt,reduced=false){if(!quota(reduced)||!ready('trail-'+id,intensity==='gentle'?.09:.035))return;const fire=id==='fire',bomb=id==='bomb',magic=id==='splitter';particle(pos,fire?'#ffcb65':magic?'#dbc7ff':bomb?'#d9b78c':'#e6d5af',fire?.16:magic?.10:.06,new T.Vector3(0,fire?.8:.1,0),fire?.45:.3,fire?'ember':magic?'star':'dust',0);if((fire||bomb)&&ready('smoke',.1))dust(pos,'#998d86',1,.38);}
  // Each burning block schedules its own plume; one global timer used to
  // give smoke only to the first block. Caps keep large fires bounded.
  function fire(pos,half,dt){
    const q=quota();if(!q)return;const p=pos.clone();p.y+=.6;
    particle(p,'#746c66',Math.min(1.15,.7+half.x*.08),new T.Vector3(.18,1.05,0),2.1,'plume',-.12);
    for(let i=0;i<Math.ceil(2*q);i++)particle(p,'#ffd080',.10+random()*.04,new T.Vector3((random()-.5)*.45,1.5+random()*.5,(random()-.5)*.45),1.1,'ember',-.15);
  }
  function water(from,to){if(!quota())return;for(let i=0;i<Math.ceil(7*quota());i++){const v=to.clone().sub(from).multiplyScalar(2);v.y+=2+random();particle(from,'#91e2ef',.055,v,.5,'rock',7);}}
  function roll(pos,speed,reduced=false){if(speed<1||!quota(reduced)||!ready('roll',.14))return;dust(pos,'#cbb899',1,.55);particle(pos,'#c6b28c',.08,new T.Vector3((random()-.5)*2,1,0),.5);}
  function observe(blocks,dt,reduced=false){
    if(!ready('observe',.12))return;
    for(const b of blocks){if(!b.alive||b.mat.static||b.mat.guard||b.mat.crown||b.mat.protected)continue;let state=observed.get(b);if(!state){state={hp:b.mat.hp,y:b.mesh.position.y,fall:false};observed.set(b,state);}
      if(b.hp<state.hp-.1){RT.castleArt.damage(b.mesh,1-b.hp/b.mat.hp,b.mat,b.spec);state.hp=b.hp;}
      const drop=state.y-b.mesh.position.y;state.y=b.mesh.position.y;
      if(drop>.12&&!state.fall){state.fall=true;RT.audio?.collapse(b.mat);if(quota(reduced))dust(b.mesh.position,'#d1c0a4',1,.65);}
    }
  }
  function update(dt,reduced=false){clock+=dt;reducedMode=reduced;if(mode(reduced)==='minimal'){clearParticles();return;}for(let i=items.length-1;i>=0;i--){const p=items[i];p.life-=dt;if(p.life<=0){scene.remove(p.m);if(p.kind==='ember'||p.kind==='plume')p.m.material.dispose();items.splice(i,1);continue;}const t=1-p.life/p.max;p.v.y-=p.gravity*dt;p.m.position.addScaledVector(p.v,dt);if(p.gravity>0&&p.m.position.y<.06){p.m.position.y=.06;p.v.y=Math.abs(p.v.y)*.25;p.v.x*=.65;p.v.z*=.65;}if(!p.m.isSprite&&p.kind!=='ring'){p.m.rotation.x+=p.spin*dt;p.m.rotation.z+=dt*2;}const fade=Math.max(0,Math.ceil(Math.min(1,p.life/.45)*7));if(p.kind==='plume')p.m.material.opacity=.65*Math.min(1,t/.18,p.life/.8);else if(p.kind==='ember')p.m.material.opacity=Math.min(1,p.life/.4);else p.m.material=mat(p.color,p.kind,fade);const s=p.size*(p.kind==='plume'?1+t*1.5:p.kind==='dust'?1+t*1.8:p.kind==='ring'?.3+t*2.2:Math.min(1,p.life/.2));p.m.scale.set(s,p.kind==='chip'?s*.22:s,p.kind==='shard'?s*.12:s);}}
  function clearParticles(){if(scene)for(const p of items){scene.remove(p.m);if(p.kind==='ember'||p.kind==='plume')p.m.material.dispose();}items=[];}
  function clear(){clearParticles();observed=new WeakMap();timers.clear();}
  return {init:s=>{clear();scene=s;},burst,fracture,explosion,strike,split,trail,fire,water,roll,observe,update,clear,count:()=>items.length,getIntensity:()=>intensity,setIntensity:value=>{if(!modes.includes(value))return;intensity=value;U.save('ballista-effects',value);clearParticles();},__test:{state:()=>({intensity,count:items.length,kinds:items.reduce((o,p)=>(o[p.kind]=(o[p.kind]||0)+1,o),{}),materials:materials.size})}};
})();
