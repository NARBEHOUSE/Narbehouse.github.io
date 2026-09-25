const {app,BrowserWindow}=require('electron'),fs=require('fs'),path=require('path'),os=require('os');
app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'ballista-fire-surfaces-')));
const out={checks:[],errors:[]},wait=ms=>new Promise(r=>setTimeout(r,ms));
app.whenReady().then(async()=>{const w=new BrowserWindow({show:false,width:1280,height:900,webPreferences:{offscreen:true,backgroundThrottling:false}}),js=s=>w.webContents.executeJavaScript(s),run=fn=>js('('+fn.toString()+')()'),check=(ok,name,detail)=>{out.checks.push({ok,name,detail});if(!ok)throw Error(name);};
w.webContents.on('console-message',(_e,l,m)=>{if(l>=3)out.errors.push(m);});
try{
 await w.loadFile(path.join(__dirname,'../index.html'));for(let i=0;i<400;i++){if(await js('window.RT?.ui&&RT.game.CAM.phase==="MENU"'))break;await wait(100);}
 await js('window.requestAnimationFrame=()=>0;true');await wait(100);
 const surfaces=await run(()=>{
  const results=[];
  for(const id of ['R','E','W','S','T']){
   const mat=RT.data.MAT[id],mesh=RT.art.buildBlock(5,2,3,'#ba9871',{matId:id,shape:mat.shape}),geo=mesh.geometry,index=geo.index,p=geo.attributes.position,triangles=[];
   for(let i=0;i<(index?index.count:p.count);i+=3)triangles.push(new THREE.Triangle(...[0,1,2].map(j=>new THREE.Vector3().fromBufferAttribute(p,index?index.getX(i+j):i+j))));
   for(const amount of [.2,.5,.9]){
    RT.castleArt.damage(mesh,amount,mat,{w:5,h:2,d:3});const cracks=mesh.getObjectByName('damage-cracks'),points=cracks.geometry.attributes.position;let maxGap=0;
    for(let i=0;i<points.count;i+=2){const a=new THREE.Vector3().fromBufferAttribute(points,i),b=new THREE.Vector3().fromBufferAttribute(points,i+1);for(const t of [0,.5,1]){const point=a.clone().lerp(b,t),near=new THREE.Vector3();maxGap=Math.max(maxGap,Math.min(...triangles.map(tri=>point.distanceTo(tri.closestPointToPoint(point,near)))));}}
    const geometry=cracks.geometry;RT.castleArt.damage(mesh,amount,mat,{w:5,h:2,d:3});results.push({id,amount,points:points.count,maxGap,same:mesh.getObjectByName('damage-cracks').geometry===geometry});
   }
  }return results;
 });
 check(surfaces.every(r=>r.points>0&&r.maxGap<.012&&r.same),'Damage marks stay on actual roof, column, keg and wall surfaces; repeated ticks reuse the same stage',surfaces);
 const fire=await run(()=>{
  const G=RT.game,E=RT.effects;E.setIntensity('full');G.setSteadyCamera(false);G.playCustom({name:'Burning roof',dist:24,layers:[['RRRRR....','WWWWW....','SSSSS...K']]});
  const roof=RT.debug.scene.children.find(m=>m.geometry?.type==='ExtrudeGeometry'),before=G.__test.blockState();if(!roof)throw Error('Roof missing');G.__test.igniteAt(roof.position.x,roof.position.y,roof.position.z);
  for(let i=0;i<180;i++)G.update(1/120);
  const after=G.__test.blockState(),flames=RT.debug.scene.children.filter(o=>o.name==='burning-flames');
  document.getElementById('overlay').hidden=true;document.getElementById('ammoPicker').hidden=true;RT.debug.camera.position.set(6,6,-15);RT.debug.camera.lookAt(roof.position);RT.debug.renderer.render(RT.debug.scene,RT.debug.camera);
  return{damaged:after.some((b,i)=>b.hp<before[i].hp),roofAlive:after.find(b=>b.mat==='R').alive,flames:flames.map(g=>g.children.length),effects:E.__test.state()};
 });
 check(fire.damaged&&fire.roofAlive&&fire.flames.some(n=>n>=4)&&fire.effects.kinds.plume>0&&fire.effects.kinds.ember>0&&!fire.effects.kinds.ring,'Real burning roof has distributed flames, smoke and embers without damage rings',fire);
 fs.writeFileSync(path.join(__dirname,'artifacts/fire-surfaces.png'),(await w.webContents.capturePage()).toPNG());
 const modes=await run(()=>{
  const results=[],E=RT.effects,L=RT.castleLife;L.clear();E.clear();
  for(const mode of ['full','gentle','minimal']){
   const scene=new THREE.Scene(),blocks=[];E.init(scene);E.setIntensity(mode);
   for(let i=0;i<32;i++){const mesh=RT.art.buildBlock(4,1,2,'#987451',{matId:'R',shape:'roof'});mesh.position.set(i*8,1,0);scene.add(mesh);blocks.push({alive:true,hp:1000,mat:{...RT.data.MAT.W,hp:1000},spec:{w:4,h:1,d:2,x:i*8},half:new THREE.Vector3(2,.5,1),mesh});}
   L.init(scene,blocks,{},(b,damage)=>b.hp-=damage);for(const b of blocks)L.ignite(b.mesh.position,.1);
   for(let i=0;i<240;i++){L.update(1/120);E.update(1/120);}
   const effects=E.__test.state(),smokeXs=scene.children.filter(m=>m.name==='siege-plume').map(m=>m.position.x),hp=blocks.map(b=>b.hp);L.clear();E.clear();results.push({mode,hp,smokeSpan:smokeXs.length?Math.max(...smokeXs)-Math.min(...smokeXs):0,effects,remaining:E.count(),flamesLeft:scene.children.filter(m=>m.name==='burning-flames').length});
  }
  E.init(RT.debug.scene);E.setIntensity('full');return results;
 });
 check(modes.every(r=>r.hp.every(h=>Math.abs(h-982)<.001)),'Full, gentle and minimal effects all retain exactly 9 wood damage per second',modes);
 check(modes.every(r=>r.effects.count<=(r.mode==='full'?220:75)&&(r.effects.kinds.plume||0)<=(r.mode==='full'?36:12)&&!r.remaining&&!r.flamesLeft)&&modes[0].smokeSpan>100&&modes[2].effects.count===0,'Large fires share smoke across buildings, obey particle limits and clean up; minimal mode stays quiet');
 check(!out.errors.length,'No runtime errors',out.errors);
}catch(e){out.error=e.stack;}finally{fs.writeFileSync(path.join(__dirname,'artifacts/fire-surfaces-results.json'),JSON.stringify(out,null,2));app.exit(out.error||out.errors.length?1:0);}
});
