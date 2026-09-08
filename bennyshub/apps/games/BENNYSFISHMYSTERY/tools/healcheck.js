/**
 * A save cannot be left with the boat on Walt's trailer for good.
 *
 *     python -m http.server 8766 --bind 127.0.0.1      (from bennyshub/)
 *     NODE_PATH=<puppeteer-core> node tools/healcheck.js
 *
 * The fog job takes the motorboat off you and the counter hands it back. A
 * save that got the flag and then moved on some other way keeps it forever -
 * and a kayak cannot reach the water job 33 is about, so the helper finds no
 * shoal out there, falls back to open water, and the trout card never comes
 * up again. Reported exactly that way. It is a dead end: the ladder cannot be
 * finished from inside it.
 *
 * So loadSave() gives the boat back once the job that took it is behind you.
 * This writes the stuck save into storage, reloads the page the way a player
 * does, and checks what boat they get.
 */
const fs=require('fs'),puppeteer=require('puppeteer-core');
const path=require('path');
const GAME=encodeURIComponent(path.basename(path.join(__dirname,'..')));
const URL=process.env.FM_URL||('http://127.0.0.1:8766/apps/games/'+GAME+'/index.html');
const CHROME=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--mute-audio']});
  const p=await b.newPage(); await p.setCacheEnabled(false);
  await p.setViewport({width:1280,height:720});
  await p.goto(URL,{waitUntil:'load'});
  await p.waitForFunction(()=>document.getElementById('loading').style.display==='none',{timeout:30000});
  await sleep(1000);
  // Build the stuck save and write it to storage, exactly as the game stores it.
  const key = await p.evaluate(()=>{
    const G=RT.game; G.resetProgress(); const sv=G.getSave();
    sv.currentMission=33; sv.highestMission=33; sv.briefed=33; sv.money=900;
    sv.vessels=['foot','canoe','kayak','motorboat'];
    sv.rods=['hand_net','bamboo_rod','fiber_rod','carbon_rod','pro_rod'];
    sv.baits=['earthworm','shiner_bait','spoon','stinkbait','deep_rig'];
    sv.tools=['tagging_tool','magnet_1','heavy_magnet','acoustic_sonar'];
    sv.towedBoat='motorboat';
    G.equipKit('carbon_rod','deep_rig',undefined);   // this persists
    // and make sure the stored copy really carries the stuck flag
    for(let i=0;i<localStorage.length;i++){
      const k=localStorage.key(i);
      if(!/^rt-/.test(k)) continue;
      let d; try{ d=JSON.parse(localStorage.getItem(k)); }catch(e){ continue; }
      if(d && typeof d==='object' && 'currentMission' in d){
        d.currentMission=33; d.highestMission=33; d.briefed=33;
        d.vessels=['foot','canoe','kayak','motorboat'];
        d.towedBoat='motorboat';
        localStorage.setItem(k, JSON.stringify(d));
        return k;
      }
    }
    return null;
  });
  const before = await p.evaluate(()=>({boat:RT.game.vessel().name, towed:RT.game.getSave().towedBoat}));
  console.log('stuck save written ('+key+')');
  console.log('   before reload : boat='+before.boat+'  towedBoat="'+before.towed+'"');
  await p.reload({waitUntil:'load'});
  await p.waitForFunction(()=>document.getElementById('loading').style.display==='none',{timeout:30000});
  await sleep(1200);
  const after = await p.evaluate(()=>({boat:RT.game.vessel().name, towed:RT.game.getSave().towedBoat,
                                       job:RT.game.getSave().currentMission}));
  console.log('   after reload  : boat='+after.boat+'  towedBoat="'+after.towed+'"  job='+after.job);
  const good = after.boat==='Motorboat' && !after.towed && after.job===33;
  console.log(good ? '\n1 check passed. A towed boat does not outlive the job that took it.'
                   : '\n1 of 1 checks failed: the boat is still on the trailer.');
  await b.close();
  process.exit(good?0:1);
})();
