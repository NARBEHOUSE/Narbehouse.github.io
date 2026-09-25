const {app,BrowserWindow}=require('electron'),fs=require('fs'),path=require('path'),os=require('os');
app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'ballista-expansion-')));
const out={checks:[],errors:[]},wait=ms=>new Promise(r=>setTimeout(r,ms));
app.whenReady().then(async()=>{
 const w=new BrowserWindow({show:false,width:1280,height:900,webPreferences:{offscreen:true,backgroundThrottling:false}}),js=s=>w.webContents.executeJavaScript(s),run=fn=>js('('+fn.toString()+')()');
 const check=(ok,name,detail)=>{out.checks.push({ok,name,detail});if(!ok)throw Error(name);};
 const ready=async()=>{for(let i=0;i<900;i++){if(out.errors.length)throw Error(out.errors.join(' | '));if(await js('window.RT?.ui&&RT.game.CAM.phase==="MENU"'))return;await wait(100);}throw Error('Game did not finish loading');};
 w.webContents.on('console-message',(_e,l,m)=>{if(l>=3)out.errors.push(m);});
 try{
 await w.loadFile(path.join(__dirname,'../index.html'));await ready();
 const campaigns=await run(()=>RT.campaigns.kingdoms.map(k=>{const levels=k.levels.map(ix=>RT.levels.LEVELS[ix]);return{id:k.id,count:levels.length,seasons:[...new Set(levels.map(l=>l.environment.season))],times:[...new Set(levels.map(l=>l.environment.timeOfDay))],environments:[...new Set(levels.map(l=>l.environment.preset))],uniqueShapes:new Set(levels.map(l=>JSON.stringify(l.layers.map(a=>a.map(s=>s.replace(/[^.]/g,'#')))))).size,protection:levels.filter(l=>l.objective==='rescue').length,depots:levels.filter(l=>l.goals.destroy.includes('T')).length,allGoals:levels.every(l=>l.goals.enemies==='guards'&&!l.goals.collect.length),allPatrols:levels.every(l=>l.patrols.length&&RT.characterPaths.check(l)),valid:levels.every(l=>!!RT.courses.validate(l)),storiesMatch:levels.every(l=>l.story.includes(RT.levelBrief.instructions(l))),noInventedItems:levels.every(l=>!/recover|stolen|harbor keys|clue|hidden map/i.test(l.story+' '+l.ending))&&!/recover|stolen/i.test(k.story+' '+k.ending),ids:levels.map(l=>l.id)};}));
 check(campaigns.every(k=>k.count===24&&k.uniqueShapes===24&&k.valid),'Three campaigns contain 24 distinct valid builds each',campaigns);
 check(campaigns.every(k=>k.seasons.length===4&&k.times.length===5&&k.environments.length>=5),'Each campaign spans all four seasons and five times of day');
 check(campaigns.every(k=>k.protection===7&&k.depots===2&&k.allGoals&&k.allPatrols&&k.storiesMatch&&k.noInventedItems),'Stories match guard, protection and powder-depot objectives; every level has valid patrols');
 check(new Set(campaigns.flatMap(k=>k.ids)).size===72,'Every campaign stage has a unique persistent ID');
 await js('window.requestAnimationFrame=()=>0;true');await wait(100);
 for(const [ix,label] of [[5,'bramblewick-spring'],[14,'bramblewick-autumn'],[40,'coppercoast-winter'],[68,'mossmere-lakeside']]){
   await js('RT.game.goToLevel('+ix+');RT.game.openMenu();RT.game.exploreView(0);document.getElementById("overlay").hidden=true;RT.debug.renderer.render(RT.debug.scene,RT.debug.camera);true');await wait(80);
   fs.writeFileSync(path.join(__dirname,'artifacts/expansion-'+label+'.png'),(await w.webContents.capturePage()).toPNG());
 }
 await run(()=>{RT.courses.save({name:'Keep my custom castle',dist:24,layers:[['K','W']]});localStorage.setItem('rt-ballista',JSON.stringify({version:2,level:9,theme:'contrast',easyAim:true,aimSounds:true,endlessBolts:false,stars:{'bramblewick-7':3,'coppercoast-2':2},kingdoms:{bramblewick:{next:7,cleared:7,ammo:['boulder','fire'],results:{'bramblewick-7':{earned:1700,shots:4,stars:3}}},coppercoast:{next:2,cleared:2,ammo:['boulder','stone'],results:{'coppercoast-2':{earned:900,shots:3,stars:2}}}}}));});
 await w.reload();await ready();
 const migrated=await run(()=>({version:RT.game.save.version,bramblewick:RT.game.kingdomProgress('bramblewick'),coppercoast:RT.game.kingdomProgress('coppercoast'),score:RT.game.kingdomScore('bramblewick'),settings:RT.game.save.theme==='contrast'&&RT.game.save.easyAim&&RT.game.save.aimSounds&&!RT.game.save.endlessBolts,custom:RT.courses.list().some(c=>c.level.name==='Keep my custom castle'),id:RT.game.currentLevel().id,stars:RT.game.save.stars}));
 check(migrated.version===3&&migrated.bramblewick.next===1&&migrated.coppercoast.next===4&&migrated.id==='coppercoast-expanded-5','Short-campaign saves resume at expanded checkpoints',migrated);
 check(migrated.score.points===1700&&migrated.score.shots===4&&migrated.stars['bramblewick-7']===3&&migrated.bramblewick.ammo.includes('fire')&&migrated.settings&&migrated.custom,'Old scores, stars, ammo, settings and custom castles survive migration');
 await run(()=>RT.game.setAimSounds(false));await w.reload();await ready();
 check(await run(()=>RT.game.save.version===3&&RT.game.kingdomProgress('coppercoast').next===4),'Saving and reloading does not migrate progress a second time');
 check(out.errors.length===0,'No runtime errors',out.errors);
 }catch(e){out.error=e.stack;}
 finally{fs.writeFileSync(path.join(__dirname,'artifacts/expansion-results.json'),JSON.stringify(out,null,2));app.exit(out.error||out.errors.length?1:0);}
});
