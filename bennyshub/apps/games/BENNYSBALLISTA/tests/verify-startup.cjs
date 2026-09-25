const {app,BrowserWindow}=require('electron'),fs=require('fs'),path=require('path'),os=require('os');
app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'ballista-startup-')));
app.on('window-all-closed',()=>{});
const audit=process.env.BALLISTA_AUDIT==='1',out={runs:[],errors:[]},wait=ms=>new Promise(r=>setTimeout(r,ms));
app.whenReady().then(async()=>{
 try{for(let n=0;n<(audit?1:3);n++){
 const w=new BrowserWindow({show:false,width:1280,height:900,webPreferences:{offscreen:true,backgroundThrottling:false}});
 w.webContents.on('console-message',(_e,l,m)=>{if(l>=3)out.errors.push(m);});
 const started=Date.now();await w.loadFile(path.join(__dirname,'../index.html'),audit?{query:{audit:'levels'}}:{});
 let ready=false;for(let i=0;i<1200;i++){ready=await w.webContents.executeJavaScript('!!window.RT?.ui&&RT.game.CAM.phase==="MENU"');if(ready)break;await wait(50);}
 if(!ready)throw Error('Startup timed out');
 out.runs.push(await w.webContents.executeJavaScript('({menuMs:performance.now(),geometries:RT.perf().geometries,level:RT.game.currentLevel().id,phase:RT.game.CAM.phase,auditRuns:performance.getEntriesByName("ballista-campaign-audit").length})'));
 out.runs[n].wallMs=Date.now()-started;
 if(out.runs[n].auditRuns!==(audit?1:0))throw Error('Full campaign audit ran on the wrong startup path');
 if(n===0){out.shot=await w.webContents.executeJavaScript(`(()=>{const G=RT.game,D=RT.data;G.startKingdom('bramblewick');const target=G.targetableBlocks().find(b=>b.matId==='K'),ammo=G.availableAmmo().find(a=>a.id==='boulder'),yaw=D.solveTarget(G.currentLevel(),target.x,target.z).yawRad;const before=G.__test.blockState();let range;for(let r=0;r<=100;r+=.25){if(G.traceShot(ammo,yaw,r).hit.block){range=r;break;}}if(range===undefined)throw Error('No opening shot');G.fire(ammo,yaw,range);for(let i=0;i<1500;i++)G.update(1/120);return{spent:G.boltsUsed,damaged:G.__test.blockState().some((b,i)=>!b.alive||b.hp<before[i].hp)};})()`);if(out.shot.spent!==1||!out.shot.damaged)throw Error('Opening shot failed');}
 w.destroy();
 }}catch(e){out.error=e.stack;}
 finally{fs.writeFileSync(path.join(__dirname,'artifacts/startup-'+(process.env.BALLISTA_BENCH_LABEL||'current')+'.json'),JSON.stringify(out,null,2));app.exit(out.error||out.errors.length?1:0);}
});
