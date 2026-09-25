const {app,BrowserWindow}=require('electron'),fs=require('fs'),path=require('path'),os=require('os');
app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'ballista-creator-')));
const wait=ms=>new Promise(r=>setTimeout(r,ms)),out={checks:[],errors:[]};
app.whenReady().then(async()=>{const w=new BrowserWindow({show:false,width:1280,height:900,webPreferences:{offscreen:true,backgroundThrottling:false}}),js=s=>w.webContents.executeJavaScript(s);
w.webContents.on('console-message',(_e,l,m)=>{if(l>=3)out.errors.push(m);});
const check=(value,name)=>{out.checks.push({name,pass:!!value});if(!value)throw Error(name);};
const ready=async expr=>{for(let i=0;i<400;i++){if(await js(expr))return;await wait(100);}throw Error('Timed out '+expr);};
const click=async text=>{await js('(()=>{const b=[...document.querySelectorAll("button")].find(b=>!b.hidden&&b.offsetParent&&b.textContent.trim()==='+JSON.stringify(text)+');if(!b)throw Error("Missing button");b.click();})()');await wait(80);};
try{
await w.loadFile(path.join(__dirname,'../editor.html'));await ready('!!window.RT?.editor');
const editor=await js("(()=>{const E=RT.editor.__test;RT.levels.LEVELS[0]=RT.courses.prepare({name:'Custom walking test',dist:24,layers:[['..K..','BBBBB'],['..Q..','SSSSS']],goals:{enemies:'guards'}});E.loadLevel(0);const cells=E.liveBlocks().filter(b=>RT.data.MAT[b.matId].guard||RT.data.MAT[b.matId].crown);for(const b of cells){E.editPatrol([b.layer,b.row,b.col]);const buttons=[...document.querySelectorAll('#patrolGrid button')];buttons.find(b=>b.getAttribute('aria-label')==='1 across, 0 depth').click();document.querySelector('#btnPatrolSave').click();}RT.editor.setNarrator({name:'Mira',style:'woman'});document.getElementById('btnSaveCastle').click();return{level:E.publicLevel(),saved:RT.courses.list().at(-1)};})()");
check(editor.level.patrols.length===2&&editor.level.patrols.every(p=>p.points.length===2),'Draw and save two routes through the Workshop UI');
check(JSON.stringify(editor.level)===JSON.stringify(editor.saved.level),'Saved JSON preserves patrol coordinates, goals and narrator');
out.level=editor.level;
check(await js("(()=>{const E=RT.editor.__test,level=E.publicLevel(),decoded=RT.courses.decode(JSON.parse(JSON.stringify({version:1,level})))[0];return JSON.stringify(level)===JSON.stringify(decoded);})()"),'JSON export/import preserves mission, narrator and routes');
check(await js("(()=>{const E=RT.editor.__test,p=E.gridSnapshot().patrols[0];E.setCell(p.cell[0],p.cell[1],p.cell[2]+1,'W');let blocked=false;try{E.publicLevel();}catch(e){blocked=e.message.includes('Patrol');}E.undo();return blocked&&E.publicLevel().patrols.length===2;})()"),'Later walls produce an actionable patrol warning; undo restores the valid route');
for(const theme of ['storybook','dark','light','contrast']){
 await js('RT.editor.__test.applyTheme('+JSON.stringify(theme)+');document.getElementById("btnRules").click()');
 const colors=await js("(()=>{const s=getComputedStyle(document.getElementById('theme')),o=getComputedStyle(document.querySelector('#theme option'));return{fg:s.color,bg:s.backgroundColor,optionFG:o.color,optionBG:o.backgroundColor};})()");
  const luminance=c=>{const v=c.match(/[\d.]+/g).slice(0,3).map(n=>Number(n)/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4);return v[0]*.2126+v[1]*.7152+v[2]*.0722;};const ratio=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
 check(ratio(colors.fg,colors.bg)>=4.5&&ratio(colors.optionFG,colors.optionBG)>=4.5,'Readable select and option contrast: '+theme);
 await fs.promises.writeFile(path.join(__dirname,'artifacts/creator-'+theme+'.png'),(await w.webContents.capturePage()).toPNG());
 await js('document.getElementById("rulesDialog").close()');
}
await js('document.getElementById("btnRules").click();document.querySelector("[data-rule=story]").click()');
for(const size of [[640,480],[390,844],[1280,900]]){
 w.setSize(...size);await wait(100);
 check(await js("(()=>{const d=document.getElementById('rulesDialog'),r=d.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&d.scrollHeight<=d.clientHeight+1;})()"),'Story rules fit without scrolling '+size);
 await js('document.getElementById("btnGoals").click()');
 check(await js("(()=>{const d=document.getElementById('goalsDialog'),r=d.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&d.scrollHeight<=d.clientHeight+1;})()"),'Goals fit without scrolling '+size);
 await js('document.getElementById("goalsCancel").click();document.getElementById("btnNarrator").click()');
 check(await js("(()=>{const d=document.getElementById('narratorDialog'),r=d.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&d.scrollHeight<=d.clientHeight+1&&document.querySelectorAll('#narratorLooks img').length===3;})()"),'Three narrator portraits fit '+size);
 await wait(150);await fs.promises.writeFile(path.join(__dirname,'artifacts/narrator-'+size.join('x')+'.png'),(await w.webContents.capturePage()).toPNG());
 await js('document.getElementById("narratorCancel").click()');
}
await js('document.getElementById("rulesDialog").close();document.getElementById("btnPlayCastle").click()');await wait(300);await ready('!!window.RT?.ui&&RT.game.currentLevel().name==="Custom walking test"');
check(await js('RT.game.currentLevel().patrols.length===2&&RT.game.currentLevel().narrator.name==="Mira"'),'Actual Playtest navigation loads the saved custom castle');
await click('Explore');
const explore=await js("(()=>{const G=RT.game,a=G.__test.life().characters;const moved=new Set();let feet=false,turned=false;for(let t=0;t<1200;t++){G.update(1/120);G.__test.life().characters.forEach((c,i)=>{if(Math.hypot(c.position[0]-a[i].position[0],c.position[2]-a[i].position[2])>.2)moved.add(i);feet=feet||c.feet.some(v=>Math.abs(v)>.2);turned=turned||Math.abs(c.facing)>.5;});}return{a,moved:moved.size,feet,turned,score:G.levelScore,shots:G.boltsUsed};})()");
check(explore.moved===2&&explore.feet&&explore.turned,'Explore animates both authored paths, feet and facing');
await click('Back');
check(await js('JSON.stringify(RT.game.__test.life().characters.map(c=>c.position))')===JSON.stringify(explore.a.map(c=>c.position)),'Leaving Explore restores the live character positions');
check(explore.score===0&&explore.shots===0,'Explore cannot spend shots or earn points');
await js('window.requestAnimationFrame=()=>0;true');await wait(50);
const motion=await js("(()=>{const G=RT.game;G.setEasyAim(false);G.closeMenu();G.CAM.phase='AIM';const a=G.__test.life().characters,moved=new Set();let paused=false,feet=false;for(let t=0;t<1440;t++){G.update(1/120);G.__test.life().characters.forEach((c,i)=>{if(Math.hypot(c.position[0]-a[i].position[0],c.position[2]-a[i].position[2])>.2)moved.add(i);paused=paused||c.pause>.5;feet=feet||c.feet.some(v=>Math.abs(v)>.2);});}return{moved:moved.size,paused,feet,disabled:G.__test.life().characters.some(c=>c.disabled)};})()");check(motion.moved===2&&motion.paused&&motion.feet&&!motion.disabled,'Custom guards walk and pause in actual gameplay');
check(await js("(()=>{const G=RT.game;G.openMenu();G.update(1/60);const a=JSON.stringify(G.__test.life());for(let i=0;i<120;i++)G.update(1/60);return a===JSON.stringify(G.__test.life());})()"),'Ordinary pause still freezes patrols');
const goals=await js("(()=>{const G=RT.game,breakType=id=>{const n=G.__test.blockState().findIndex(b=>b.alive&&b.mat===id);G.__test.breakBlock(n);},tick=()=>G.update(1/120);G.playCustom({name:'Mixed goals',layers:[['K...Q...W...L']],goals:{enemies:'guards',destroy:['W'],collect:['stone']}});const counts=[G.remainingGoals()];breakType('K');tick();counts.push(G.remainingGoals());breakType('Q');tick();counts.push(G.remainingGoals());breakType('W');tick();counts.push(G.remainingGoals());const before=G.__test.levelWon();breakType('L');tick();counts.push(G.remainingGoals());const won=G.__test.levelWon();G.retryLevel();const retry=G.remainingGoals();G.playCustom({name:'Object only',layers:[['W']],goals:{enemies:'none',destroy:['W']}});breakType('W');tick();const objectWon=G.__test.levelWon();G.playCustom({name:'Collect only',layers:[['L']],ammo:['boulder','stone'],goals:{enemies:'none',collect:['stone']}});G.save.endlessBolts=true;let pickup=false;document.addEventListener('ballista-ammo-unlocked',e=>pickup=e.detail.goalCollected,{once:true});const beforeCollect=G.__test.levelWon();breakType('L');tick();return{counts,before,won,retry,objectWon,beforeCollect,pickup,collectWon:G.__test.levelWon()};})()");
out.goals=goals;check(JSON.stringify(goals.counts)==='[4,3,2,1,0]'&&!goals.before&&goals.won&&goals.retry===4,'Mixed goals require all enemies, objects and collection; retry resets them');
check(goals.objectWon&&!goals.beforeCollect&&goals.collectWon&&goals.pickup,'Object-only and already-unlocked collection goals can win without crowns');
check(await js("(()=>{const G=RT.game;G.setEasyAim(false);G.playCustom({name:'Protected object mission',objective:'rescue',layers:[['Q...W...v']],patrols:[{cell:[0,0,0],points:[[0,0],[1,0]]}],goals:{enemies:'none',destroy:['W']}});G.__test.breakBlock(G.__test.blockState().findIndex(b=>b.mat==='W'));for(let i=0;i<600;i++)G.update(1/120);return G.__test.levelWon()&&G.__test.blockState().some(b=>b.mat==='Q'&&b.alive);})()"),'Optional patrolling guards do not prevent a protected-object mission from completing');
check(await js("RT.levels.LEVELS.every(l=>RT.levelBrief.goals(l).enemies==='guards')"),'All default campaign levels require every guard');
for(const style of ['rowan','elder','woman']){check(await js("(()=>{RT.game.playCustom({layers:[['K']],narrator:{name:'Guide',style:"+JSON.stringify(style)+"}});RT.game.showNarrator(true);return RT.game.__test.narratorState().style==="+JSON.stringify(style)+"&&RT.game.__test.narratorState().name==='Guide';})()"),'In-field narrator appearance '+style);}
}catch(e){out.error=e.stack;}finally{fs.writeFileSync(path.join(__dirname,'artifacts/creator-results.json'),JSON.stringify(out,null,2));app.exit(out.error||out.errors.length?1:0);}});
