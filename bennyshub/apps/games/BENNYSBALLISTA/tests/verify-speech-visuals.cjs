const {app,BrowserWindow}=require('electron'),fs=require('fs'),path=require('path'),os=require('os');
app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'ballista-speech-visuals-')));
const out={checks:[],errors:[]},wait=ms=>new Promise(r=>setTimeout(r,ms));
app.whenReady().then(async()=>{const w=new BrowserWindow({show:false,width:1280,height:900,webPreferences:{offscreen:true,backgroundThrottling:false}}),js=s=>w.webContents.executeJavaScript(s),run=fn=>js('('+fn.toString()+')()'),check=(ok,name,detail)=>{out.checks.push({ok,name,detail});if(!ok)throw Error(name);};
w.webContents.on('console-message',(_e,l,m)=>{if(l>=3)out.errors.push(m);});
try{
 await w.loadFile(path.join(__dirname,'../index.html'));
 for(let i=0;i<400;i++){if(out.errors.length)throw Error(out.errors.join(' | '));if(await js('window.RT?.ui&&RT.game.CAM.phase==="MENU"'))break;await wait(100);}
 await js('window.requestAnimationFrame=()=>0;true');await wait(100);
 const speech=await run(()=>{const G=RT.game,U=RT.ui,spoken=[],labels=[];window.NarbeVoiceManager.speak=text=>spoken.push(text);G.setEndlessBolts(true);G.setEasyAim(true);
 for(let i=0;i<RT.levels.LEVELS.length;i++){G.goToLevel(i);document.getElementById('btnChangeAmmo').click();spoken.length=0;document.getElementById('ammoSelect').click();
 const count=U.__test.state().targets;for(let j=0;j<count;j++){U.__test.pressSpace();U.__test.releaseSpace();}document.getElementById('targetNext').click();document.getElementById('targetPrevious').click();
 labels.push({level:i,spoken:spoken.slice(),aria:[...document.querySelectorAll('#targetPins button')].map(b=>b.getAttribute('aria-label'))});}
 return labels;});
 check(speech.length===72&&speech.every(l=>l.spoken.length>1&&l.spoken.every(s=>!/[·×]/.test(s))&&l.aria.every(s=>!/[·×]/.test(s))),'All 72 Easy Aim levels use plain speech for entry, switch scans, arrows and screen reader labels',speech);
 check(speech.flatMap(l=>l.spoken).some(s=>/goblin on the (left|right)|goblin in the center/i.test(s)),'Goblin targets say their name and location plainly');
 const fire=await run(()=>{const G=RT.game,E=RT.effects;G.setEasyAim(false);G.setSteadyCamera(false);E.setIntensity('full');G.playCustom({name:'Fire appearance',dist:24,layers:[['WWWWW....K']]});
 E.strike(new THREE.Vector3(0,.5,-24),'fire',false);const initial=E.__test.state();G.__test.igniteAt(-2,.5,-24);
 const before=G.__test.blockState();for(let i=0;i<240;i++)G.update(1/120);
 const flames=RT.debug.scene.children.filter(o=>o.name==='burning-flames'),after=G.__test.blockState();
 document.getElementById('overlay').hidden=true;G.exploreView(0);RT.debug.renderer.render(RT.debug.scene,RT.debug.camera);window.fireImage=RT.debug.renderer.domElement.toDataURL();
 return {initial,effects:E.__test.state(),burning:flames.length,anchored:flames.every(f=>f.rotation.y===0),damaged:after.some((b,i)=>b.hp<before[i].hp)};
 });
 check(fire.burning>0&&fire.anchored&&fire.damaged&&fire.effects.kinds.ember>0&&!fire.initial.kinds.ring&&!fire.effects.kinds.ring&&!fire.effects.kinds.star,'Fire keeps damaging while anchored flames and rising embers replace rings and stars',fire);
 fs.writeFileSync(path.join(__dirname,'artifacts/fire-refined.png'),Buffer.from((await js('window.fireImage')).split(',')[1],'base64'));
 const tower=await run(()=>{const G=RT.game;G.playCustom({name:'Patrol tower',dist:24,layers:[['Q........','SSSSS....','SSSSS...K']],patrols:[{cell:[0,0,0],points:[[0,0],[3,0]]}]});
 const before=G.__test.life().characters[0].position;for(let i=0;i<360;i++)G.update(1/120);const after=G.__test.life().characters[0].position,trim=[];
 RT.debug.scene.traverse(o=>{if(o.name!=='masonry-trim')return;o.geometry.computeBoundingBox();o.parent.geometry.computeBoundingBox();const a=o.geometry.boundingBox,b=o.parent.geometry.boundingBox;trim.push({gap:a.max.x-b.max.x,zGap:a.max.z-b.max.z,casts:o.castShadow});});
 G.exploreView(0);RT.debug.renderer.render(RT.debug.scene,RT.debug.camera);window.towerImage=RT.debug.renderer.domElement.toDataURL();
 return{distance:Math.hypot(after[0]-before[0],after[2]-before[2]),trim};
 });
 check(tower.distance>.1&&tower.trim.length>0&&tower.trim.every(t=>t.gap>.01&&t.zGap>.01&&!t.casts),'Patrolling tower has separated mortar faces without tiny self-shadow casters',tower);
 fs.writeFileSync(path.join(__dirname,'artifacts/tower-refined.png'),Buffer.from((await js('window.towerImage')).split(',')[1],'base64'));
 check(out.errors.length===0,'No runtime errors',out.errors);
}catch(e){out.error=e.stack;}finally{fs.writeFileSync(path.join(__dirname,'artifacts/speech-visuals-results.json'),JSON.stringify(out,null,2));app.exit(out.error||out.errors.length?1:0);}
});
