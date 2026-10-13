'use strict';
// Run: node scripts/check-battleboats.cjs
// Optional: Playwright module, website root, staged game directory, report directory.
const {chromium}=require(process.argv[2]||'@playwright/test');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=process.argv[3]?path.resolve(process.argv[3]):path.resolve(__dirname,'..');
const stagedGame=process.argv[4]?path.resolve(process.argv[4]):null;
const out=process.argv[5]?path.resolve(process.argv[5]):path.join(root,'artifacts/battleboats');
fs.mkdirSync(out,{recursive:true});
let browser,server,page;
const report={passed:false,checks:[],errors:[]};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const check=(ok,label)=>{assert.ok(ok,label);report.checks.push(label);};
(async()=>{
try {
 const gamePrefix='/bennyshub/apps/games/BENNYSBATTLEBOATS/';
 server=http.createServer((req,res)=>{
  try {
   const pathname=decodeURIComponent(new URL(req.url,'http://local').pathname);
   const base=stagedGame&&pathname.startsWith(gamePrefix)?stagedGame:root;
   const relative=base===stagedGame?pathname.slice(gamePrefix.length):'.'+pathname;
   const file=path.resolve(base,relative);
   if(!file.startsWith(base+path.sep))throw Error('Path');
   res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.wav':'audio/wav','.png':'image/png'})[path.extname(file)]||'application/octet-stream');
   res.end(fs.readFileSync(file));
  }catch{res.statusCode=404;res.end();}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 page=await browser.newPage({viewport:{width:1440,height:900}});
 await page.route('**/*',route=>route.request().url().startsWith(base+'/')?route.continue():route.abort());
 page.on('pageerror',e=>report.errors.push(e.message));
 const run=code=>page.evaluate(code);
 const tap=async key=>{await wait(120);await page.keyboard.down(key);await wait(20);await page.keyboard.up(key);await wait(60);};
 const tick=()=>run('clearTimeout(battleTimer);runBattleStep();true');
 const start=()=>run("showGame('1p');startGame();true");
 const shot=async(row,col)=>{await run('fireAtEnemy('+row+','+col+');true');await tick();};
 const capture=async name=>{await wait(100);await page.screenshot({path:path.join(out,name)});};
 await page.goto(base+gamePrefix+'index.html');
 await run("NarbeVoiceManager.updateSettings({ttsEnabled:false});NarbeScanManager.updateSettings({autoScan:false,inputSensitivityIndex:0});settings.sound=false;BattlePresentation.configure(settings);true");
 check(await run("classicChoice.getState().index===-1"),'Main menu starts blank');
 await tap('Enter');
 check(await run("scanState.mode==='main-menu'"),'Enter on blank is inert');
 await tap('Space');await tap('Enter');
 check(await run("scanState.mode==='buttons' && document.querySelectorAll('#placementBoard .fleet-vessel').length===5"),'Physical Space/Enter opens placement with five visible ships');
 check(await run("ships.flatMap(s=>s.coords).length===17 && new Set(ships.flatMap(s=>s.coords.map(c=>c.row+','+c.col))).size===17"),'Randomized fleet has seventeen nonoverlapping squares');
 check(await run("classicChoice.getItems().some(i=>i.id==='pauseButton')"),'Placement includes a scanned Pause choice');
 await capture('placement.png');
 await run("startGame();true");
 check(await run("gameStarted && !document.querySelector('#attackGrid .fleet-vessel')"),'Enemy hulls are absent before any sinking');
 await tap('Space');await tap('Enter');
 check(await run("classicChoice.getState().depth===1 && scanState.mode==='game-cell'"),'Physical switches enter a row as a nested choice group');
 await run("for(let i=0;i<10;i++)scanForward();true");
 check(await run("classicChoice.getState().backStop"),'Each row includes the shared Back stop');
 await tap('Enter');
 check(await run("scanState.mode==='game-row' && classicChoice.getState().id==='row:0'"),'Back returns to the same row');
 await run("for(let i=0;i<10;i++)scanForward();selectCurrentItem();true");
 check(await run("battlePaused && scanState.mode==='pause'"),'Pause is selectable with short switches from the row scan');
 await run("showSettingsFromPause();true");
 check(await run("['pauseMotionBtn','pauseVolumeBtn','pauseAutoScanBtn'].every(id=>classicChoice.getItems().some(i=>i.id===id))"),'Effects and Auto Scan controls are in the pause scan');
 await run("for(let i=0;i<3;i++)scanForward();selectCurrentItem();true");
 check(await run("classicChoice.getState().id==='pauseMotionBtn' && settings.motion==='full'"),'Changing motion preserves the selected settings item');
 await run("goBackToPauseMenu();hidePauseModal();true");
 check(await run("!battlePaused && scanState.mode==='game-row'"),'Continue restores the board');
 const hit=await run("enemyShips[0].coords[0]");
 await run("fireAtEnemy("+hit.row+","+hit.col+");fireAtEnemy("+hit.row+","+hit.col+");showPauseModal();true");
 await wait(500);
 check(await run("player1.attacks.flat().every(c=>!c.fired) && battlePaused"),'Pausing in flight freezes shot resolution and duplicate input is ignored');
 await run("hidePauseModal();true");
 await wait(440);
 await run("clearTimeout(battleTimer);true");
 check(await run("player1.attacks.flat().filter(c=>c.fired).length===1 && document.querySelectorAll('#attackGrid .attack-hit').length===1 && !document.querySelector('#attackGrid .fleet-vessel')"),'Resuming resolves exactly one hit without revealing unhit sections');
 check(await run("document.getElementById('attackReport').dataset.result==='hit' && document.getElementById('attackStats').textContent.includes('100%')"),'Hit report and accuracy match the shot');
 await capture('hit.png');
 await tick(); // Defense
 check(await run("gamePhase==='defense' && document.querySelectorAll('#defenseGrid .fleet-vessel').length===5"),'Defense shows the complete own fleet');
 const aiHit=await run("player1.ships[0].coords[0]");
 await run("aiTargetQueue=[{row:"+aiHit.row+",col:"+aiHit.col+"}];true");
 await tick();await tick();
 check(await run("player1.ships[0].coords[0].hit && document.querySelector('#defenseGrid .defense-hit')!==null"),'AI damage updates the same fleet rendered on defense');
 await tick();
 const sink=await run("enemyShips[0].coords[1]");
 await shot(sink.row,sink.col);
 check(await run("enemyShips[0].sunk && document.querySelectorAll('#attackGrid .fleet-vessel').length===1 && document.querySelector('#attackGrid .ship-reveal')!==null"),'Sinking reveals only that ship and starts its reveal animation');
 check(await run("document.getElementById('enemy-ship-destroyer').textContent.includes('SUNK')"),'Fleet strip states sunk without relying on color');
 await capture('sunk.png');
 await run("returnToMainMenu();true");await wait(2400);
 check(await run("scanState.mode==='main-menu' && !gameStarted && !battlePending"),'Leaving during a sinking cancels every pending turn');
 await start();
 const miss=await run("enemyCells.flatMap((row,r)=>row.map((c,col)=>({r,col,occupied:c.occupied}))).find(c=>!c.occupied)");
 await shot(miss.r,miss.col);
 check(await run("document.querySelectorAll('#attackGrid .attack-miss').length===1 && document.getElementById('attackReport').dataset.result==='miss'"),'Misses leave a distinct ring and open-water report');
 await run("settings.motion='reduced';BattlePresentation.configure(settings);BattlePresentation.clearEffects();cancelBattleSequence();awaitingEnemy=false;true");
 const next=await run("enemyShips[1].coords[0]");
 await shot(next.row,next.col);
 check(await run("document.body.classList.contains('reduced-motion') && !document.querySelector('.shot-effect,.shot-tracer') && player1.attacks["+next.row+"]["+next.col+"].hit"),'Reduced motion preserves outcomes without transient effects');
 check(await run("(()=>{let calls=0;const old=SafeAudio.play;SafeAudio.play=()=>calls++;settings.sound=false;playSound('scan');playSound('hit');SafeAudio.play=old;return calls===0;})()"),'Mute also silences scan and combat effects');
 await start();
 // Finish a real fleet through the normal shot resolver, bypassing only the waiting times.
 const coords=await run("enemyShips.flatMap(s=>s.coords.map(c=>({row:c.row,col:c.col})))");
 for(const c of coords){await run("cancelBattleSequence();awaitingEnemy=false;true");await shot(c.row,c.col);}
 await tick();
 check(await run("battleFinished && !gameStarted && scanState.mode==='game-over' && classicChoice.getState().index===-1"),'Victory opens an initially blank result scan');
 check(await run("document.querySelectorAll('#attackGrid .fleet-vessel').length===5 && document.querySelectorAll('#attackGrid .attack-hit').length===17"),'Winning reveals the entire enemy fleet with all seventeen hits');
 check(await run("classicChoice.getItems().map(i=>i.id).join(',')==='playAgainBtn,gameOverOkBtn'"),'Replay and Main Menu are both switch accessible');
 await capture('victory.png');
 await wait(5100);
 check(await run("scanState.mode==='game-over' && document.getElementById('gameOverModal').style.display==='flex'"),'Results wait for the player rather than auto-dismissing');
 await tap('Space');await tap('Enter');
 check(await run("scanState.mode==='buttons' && !battleFinished && player1.attacks.flat().every(c=>!c.fired)"),'Switch replay creates a clean match');
 await run("startGame();showGameOverModal('Defeat!','The enemy sank your fleet.');true");
 check(await run("document.querySelectorAll('#attackGrid .fleet-vessel').length===5 && document.getElementById('gameOverModal').dataset.victory==='false'"),'Defeat also reveals the remaining opponent ships');
 await run("showGame('2p');true");
 check(await run("scanState.mode==='cover' && !document.getElementById('coverScreen').classList.contains('hidden')"),'Two-player placement starts behind the privacy screen');
 await run("onCoverReady();startGame();true");
 check(await run("currentPlayer===2 && scanState.mode==='cover'"),'Player two placement is protected by the handoff screen');
 await run("onCoverReady();startGame();true");
 check(await run("gameStarted && currentPlayer===1 && !document.querySelector('#attackGrid .fleet-vessel')"),'Two-player battle starts with opponent positions hidden');
 const p2coords=await run("player2.ships[0].coords.map(c=>({row:c.row,col:c.col}))");
 await shot(p2coords[0].row,p2coords[0].col);await tick();
 check(await run("currentPlayer===2 && player1.attacks.flat().filter(c=>c.fired).length===1 && !document.querySelector('#attackGrid .fleet-vessel')"),'Handoff changes the attack history and does not show the other player’s ships');
 // Return through a real miss and sink player two’s destroyer.
 const p1water=await run("player1.cells.flatMap((row,r)=>row.map((c,col)=>({r,col,occupied:c.occupied}))).find(c=>!c.occupied)");
 await shot(p1water.r,p1water.col);await tick();
 await shot(p2coords[1].row,p2coords[1].col);
 check(await run("player2.ships[0].sunk && document.querySelectorAll('#attackGrid .fleet-vessel').length===1"),'Two-player sinking reveals the correct opponent hull');
 await tick();
 check(await run("currentPlayer===2 && document.querySelectorAll('#attackGrid .fleet-vessel').length===0"),'Revealed hulls do not leak into the next player’s board');
 await run("cancelBattleSequence();currentPlayer=1;player2.ships[1].sunk=true;renderAttackGrid();window.twoRevealed=document.querySelectorAll('#attackGrid .fleet-vessel').length;currentPlayer=2;switchToAttackPhase();true");
 check(await run("window.twoRevealed===2 && document.querySelectorAll('#attackGrid .fleet-vessel').length===0"),'Handoffs clear multiple revealed ships without retaining a previous overlay');
 await run("returnToMainMenu();NarbeScanManager.updateSettings({autoScan:true,scanSpeedIndex:0});true");
 await wait(1150);
 check(await run("classicChoice.getState().id==='onePlayerBtn'"),'One-switch auto scan reaches Play');
 await tap('Enter');
 check(await run("scanState.mode==='buttons'"),'One-switch Enter starts placement');
 await run("NarbeScanManager.updateSettings({autoScan:false});startGame();true");
 await page.setViewportSize({width:390,height:844});await wait(200);
 check(await run("(()=>{const b=attackGrid.getBoundingClientRect();return b.left>=0&&b.right<=innerWidth&&b.bottom<innerHeight&&b.height>300;})()"),'Phone layout keeps the full board inside the viewport');
 await capture('mobile.png');
 await run("showPauseModal();showSettingsFromPause();true");
 check(await run("(()=>{const b=document.getElementById('pauseSettingsBackBtn').getBoundingClientRect();return b.bottom<innerHeight&&b.left>=0&&b.right<=innerWidth;})()"),'Phone pause settings keep Back visible');
 await page.setViewportSize({width:1024,height:600});await wait(200);
 check(await run("(()=>{const b=document.getElementById('pauseSettingsBackBtn').getBoundingClientRect();return b.bottom<innerHeight;})()"),'Short desktop settings keep Back reachable');

 // Delayed speech tickets simulate a slow voice without depending on an installed voice.
 await start();
 await run("window.testSpeak=speak;window.finishNarration=null;speak=()=>({finished:new Promise(resolve=>{window.finishNarration=resolve;})});true");
 const spokenHit=await run("enemyShips[0].coords[0]");
 await shot(spokenHit.row,spokenHit.col);
 await tick();
 await wait(150);
 check(await run("gamePhase==='attack' && battlePending.speechPending"),'A shot scene waits when its narration outlasts the animation');
 await run("finishNarration({started:true,reason:'end'});true");
 await wait(300);
 check(await run("gamePhase==='attack'"),'The post-speech breathing space is not skipped');
 await wait(440);
 check(await run("gamePhase==='defense' && battlePending.speechPending"),'After speech and buffer the enemy-turn announcement owns the next wait');
 await run("speak=window.testSpeak;returnToMainMenu();window.speechTransition=false;window.finishPausedSpeech=null;scheduleBattle(()=>{window.speechTransition=true;},20,{finished:new Promise(r=>window.finishPausedSpeech=r)});pauseBattleSequence();finishPausedSpeech({started:true});true");
 await wait(750);
 check(await run("!window.speechTransition"),'Speech finishing while paused cannot advance the scene');
 await run("resumeBattleSequence();true");await wait(700);
 check(await run("window.speechTransition"),'Resuming preserves the post-speech buffer and continues once');
 await run("window.staleTransition=false;window.finishStaleSpeech=null;scheduleBattle(()=>window.staleTransition=true,20,{finished:new Promise(r=>window.finishStaleSpeech=r)});cancelBattleSequence();finishStaleSpeech({started:true});true");
 await wait(700);
 check(await run("!window.staleTransition && !battlePending"),'A stale speech completion cannot restart an abandoned scene');

 await page.setViewportSize({width:390,height:844});await start();await run("showGameOverModal('Defeat!','The enemy sank your fleet.');true");await wait(450);
 check(await run("attackGrid.getBoundingClientRect().bottom<=document.getElementById('gameOverModal').getBoundingClientRect().top && document.getElementById('gameOverOkBtn').getBoundingClientRect().bottom<innerHeight"),'Phone results display the whole revealed fleet above the reachable result buttons');
 await capture('mobile-results.png');
 const audio=await run("Promise.all(['launch','hit','miss','sunk','sonar'].map(name=>new Promise(resolve=>{const a=new Audio('audio/'+name+'.wav');const timer=setTimeout(()=>resolve(false),3000);a.onloadedmetadata=()=>{clearTimeout(timer);resolve(a.duration>0&&a.duration<2);};a.onerror=()=>{clearTimeout(timer);resolve(false);};})))");
 check(audio.every(Boolean),'All five original sound effects decode in the web browser');
 check(report.errors.length===0,'No renderer JavaScript errors');
 report.passed=true;

} catch(e) {report.errors.push(e.stack);}
finally {
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify(report,null,2));
 if(browser)await browser.close();
 if(server)server.close();
 process.exitCode=report.passed?0:1;
}
})();
