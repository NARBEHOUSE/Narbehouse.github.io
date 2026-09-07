const fs=require('fs'), path=require('path'), puppeteer=require('puppeteer-core');
const URL='http://127.0.0.1:8765/apps/games/BENNYSFISHMYSTERY/index.html';
const CHROME=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const CARDS=['creel','missions','settings','kit','kittray','keeper','brief','tackle'];
(async()=>{
  const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});
  const page=await b.newPage(); await page.setCacheEnabled(false);
  await page.setViewport({width:1280,height:720});
  await page.goto(URL,{waitUntil:'networkidle0'}); await sleep(2200);
  await page.evaluate(()=>{ const G=RT.game; G.resetProgress(); const sv=G.getSave();
    sv.briefed=99; sv.currentMission=20; sv.money+=600; sv.hasMap=true;
    ['hand_net','bamboo_rod','fiber_rod','carbon_rod'].forEach(r=>{ if(!sv.rods.includes(r)) sv.rods.push(r); });
    ['earthworm','spoon','deep_rig'].forEach(x=>{ if(!sv.baits.includes(x)) sv.baits.push(x); });
    ['magnet_1','heavy_magnet','tagging_tool'].forEach(t=>{ if(!sv.tools.includes(t)) sv.tools.push(t); });
    ['canoe','kayak'].forEach(v=>{ if(!sv.vessels.includes(v)) sv.vessels.push(v); });
    // Some history, so the log has rows with fish in them.
    ['sunfish','perch','bass','crappie','catfish','pike'].forEach((id,i)=>{
      sv.creel.push({id:id,length:8+i,weight:1+i,m:2}); sv.best[id]={length:8+i,weight:1+i};
    });
    G.goToDock();
  });
  await sleep(800);
  for (const name of CARDS) {
    await page.evaluate(n=>RT.ui.setScreen(n), name);
    await sleep(500);
    const m = await page.evaluate(()=>{
      const menu=document.getElementById('panelMenu');
      const panel=document.querySelector('#overlay .panel') || document.getElementById('panel');
      const ov=document.getElementById('overlay');
      return { rows: menu ? menu.children.length : 0,
               cols: menu ? menu.classList.contains('cols') : false,
               menuScroll: menu ? menu.scrollHeight : 0, menuClient: menu ? menu.clientHeight : 0,
               panelH: panel ? Math.round(panel.getBoundingClientRect().height) : 0,
               ovScroll: ov ? ov.scrollHeight : 0, ovClient: ov ? ov.clientHeight : 0 };
    });
    const scrolls = m.ovScroll > m.ovClient + 2 || m.menuScroll > m.menuClient + 2;
    console.log(name.padEnd(9), 'rows', String(m.rows).padStart(2), '| cols', m.cols ? 'yes' : ' no',
                '| panel', String(m.panelH).padStart(4) + 'px of 720',
                '| overlay', m.ovScroll + '/' + m.ovClient,
                (scrolls ? '  <-- SCROLLS' : ''));
    await page.screenshot({path: path.join(process.argv[2], 'card_' + name + '.png')});
  }
  await b.close();
})();
