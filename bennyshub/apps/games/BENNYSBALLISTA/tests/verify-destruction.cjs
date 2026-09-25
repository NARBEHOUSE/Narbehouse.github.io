const {app,BrowserWindow}=require('electron'),fs=require('fs'),path=require('path'),os=require('os');
app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'ballista-fracture-')));
const out={checks:[],errors:[]},wait=ms=>new Promise(r=>setTimeout(r,ms));
app.whenReady().then(async()=>{
 const w=new BrowserWindow({show:false,width:1280,height:900,webPreferences:{offscreen:true,backgroundThrottling:false}});
 const js=s=>w.webContents.executeJavaScript(s),run=fn=>js('('+fn.toString()+')()'),check=(ok,name,detail)=>{out.checks.push({ok,name,detail});if(!ok)throw Error(name);};
 w.webContents.on('console-message',(_e,l,m)=>{if(l>=3)out.errors.push(m);});
 try{
  await w.loadFile(path.join(__dirname,'../index.html'));
  for(let i=0;i<400;i++){if(out.errors.length)throw Error(out.errors.join(' | '));if(await js('window.RT?.ui&&RT.game.CAM.phase==="MENU"'))break;await wait(100);}
  await js('window.requestAnimationFrame=()=>0;true');await wait(100);
  const roof=await run(()=>{const G=RT.game,D=RT.data;G.setEndlessBolts(true);G.setSteadyCamera(false);G.playCustom({name:"Roof impact",dist:24,layers:[["OOOOO....","W...W....","W...W...K"]]});
   const before=G.__test.blockState(),ammo=D.AMMO.find(a=>a.id==="stone"),target=G.targetableBlocks().find(b=>b.matId==="O");
   let shot;const yaw=D.solveTarget(G.currentLevel(),target.x,target.z).yawRad;
   for(let range=0;range<=100;range+=.1){const t=G.traceShot(ammo,yaw,range);if(t.hit.block?.mat.id==="O"){shot={yaw,range};break;}}
   if(!shot)throw Error("No roof shot");
   G.fire(ammo,shot.yaw,shot.range);
   const frames=[];let firstDamage,broken;
   for(let i=0;i<1000;i++){G.update(1/120);const state=G.__test.blockState(),r=state.find(b=>b.mat==="O");if(r.hp<65&&!firstDamage)firstDamage={frame:i,...r};if(!r.alive&&!broken){broken={frame:i,...r};document.getElementById("overlay").hidden=true;RT.debug.renderer.render(RT.debug.scene,RT.debug.camera);window.fractureImage=RT.debug.renderer.domElement.toDataURL("image/png");}if(i%120===0)frames.push({i,roof:r,debris:G.__test.debrisCount()});}
   return{before,firstDamage,broken,frames,after:G.__test.blockState(),debris:G.__test.debrisCount()};
  });
  check(!!roof.broken&&roof.debris>2,'A real Stone Bolt breaks a tough roof into physical fragments',roof);
  fs.writeFileSync(path.join(__dirname,'artifacts/destruction-roof.png'),Buffer.from((await js('window.fractureImage')).split(',')[1],'base64'));
  check(roof.firstDamage.alive&&roof.broken.frame>roof.firstDamage.frame&&roof.after.filter(b=>!b.alive).length>=3,'The bolt loosens the roof, then the landing fractures it and its supports');
  const rubble=await run(()=>{const G=RT.game;G.playCustom({name:"Falling fragments",dist:24,layers:[["SSSSS....",".........","IIIII...K"]]});const index=G.__test.blockState().findIndex(b=>b.mat==="S");G.__test.breakBlock(index,()=>.5);for(let i=0;i<500;i++)G.update(1/120);return G.__test.blockState();});
  check(rubble.some(b=>b.mat==="I"&&!b.alive),'Roof fragments damage and break nearby structural glass',rubble);
  const rotation=await run(()=>{const G=RT.game;G.playCustom({name:"Rotating roof",dist:24,layers:[["OOOOO....",".........","........K"]]});const ix=G.__test.blockState().findIndex(b=>b.mat==="O"),speed=G.__test.blockSpeed(ix);G.__test.spin(ix,0,0,4);for(let i=0;i<500;i++)G.update(1/120);return{speed,roof:G.__test.blockState()[ix],debris:G.__test.debrisCount()};});
  check(rotation.speed<.1&&!rotation.roof.alive&&rotation.debris>0,'A roof with no initial linear velocity fractures after rotating and landing',rotation);
  const resting=await run(()=>{const G=RT.game;G.playCustom({name:"Quiet castle",dist:24,layers:[["OOOOO....","W...W....","SSSSS...K"]]});const before=G.__test.blockState();for(let i=0;i<1200;i++)G.update(1/120);return{before,after:G.__test.blockState(),debris:G.__test.debrisCount()};});
  check(resting.after.every((b,i)=>b.alive&&b.hp===resting.before[i].hp)&&!resting.debris,'An untouched supported building takes no collision damage',resting);
  const cap=await run(()=>{const G=RT.game;G.playCustom({name:"Rubble cap",dist:24,layers:[Array.from({length:20},(_,i)=>i===19?"S".repeat(19)+"K":"S".repeat(20))]});G.__test.blockState().forEach((b,i)=>{if(b.mat==="S")G.__test.breakBlock(i);});return{debris:G.__test.debrisCount(),cap:RT.data.CFG.DEBRIS_MAX};});
  check(cap.debris===cap.cap,'Physical fragment count stays bounded',cap);
  await w.loadFile(path.join(__dirname,'../editor.html'));
  for(let i=0;i<400;i++){if(await js('window.RT?.editor&&RT.editor.__test.blockCount()>0'))break;await wait(100);}
  const stability=await run(()=>RT.levels.LEVELS.map((level,i)=>{RT.editor.__test.loadLevel(i);return {name:level.name,result:RT.editor.__test.runStability()};}));
  check(stability.length===72&&stability.every(l=>/^Stands on its own/.test(l.result)),'All 72 campaign builds pass the Workshop stability test',stability);
  check(out.errors.length===0,'No runtime errors',out.errors);
 }catch(e){out.error=e.stack;}
 finally{fs.writeFileSync(path.join(__dirname,'artifacts/destruction-results.json'),JSON.stringify(out,null,2));app.exit(out.error||out.errors.length?1:0);}
});
