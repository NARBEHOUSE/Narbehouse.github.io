/**
 * Phone menus keep readable controls and scroll vertically. Exercise real
 * menu/HUD/input code with real roster/track content and the mock race engine.
 */
'use strict';
const lib = require('./ui-lib.cjs');
const SIZES = [[320,568],[390,844],[360,640],[768,1024],[844,390],[667,375],[1024,768],[1600,900]];
const SCREENS = [
  ['title','NK.game.setPlayers(1);','title'],
  ['rules-1p','NK.game.setPlayers(1);','rules'],
  ['rules-2p','NK.game.setPlayers(2);','rules'],
  ['type-1p','NK.game.setPlayers(1);','type'],
  ['type-2p','NK.game.setPlayers(2);','type'],
  ['speed','NK.game.setPlayers(1);','speed'],
  ['racer','NK.game.setPlayers(1);','racer',{player:0}],
  ['kart','NK.game.setPlayers(1); NK.game.setPick(0,{charId:"bruno"});','kart',{player:0}],
  ['racer-p2','NK.game.setPlayers(2);','racer',{player:1}],
  ['kart-p2','NK.game.setPlayers(2);','kart',{player:1}],
  ['cup','NK.game.setPlayers(1); NK.game.setMode("nofail"); NK.game.setType("gp");','cup'],
  ['track','NK.game.setType("single");','track'],
  ['howto-1','NK.game.setPlayers(1);','howto',{page:0}],
  ['howto-2','','howto',{page:1}],
  ['howto-3','','howto',{page:2}],
  ['settings','NK.game.setPlayers(1);','settings'],
  ['confirm-exit','','confirmExit',{from:'title'}]
];
module.exports = async function (t) {
  const L = lib(t);
  await L.boot({real:true});
  await t.js('NarbeScanManager.setAutoScan(false); true');
  async function metrics() {
    return t.js(`(() => {
      const card=document.getElementById('nkCard'), overlay=document.getElementById('nkOverlay');
      const rect=e=>{const r=e.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
      const targets=[...document.querySelectorAll('#nkMenu .nkItem:not(.header)')].map(e=>({label:e.textContent.trim(),...rect(e)}));
      const focused=document.querySelector('#nkMenu .nkItem.focused');
      return {viewport:[innerWidth,innerHeight],card:rect(card),scroll:[card.clientWidth,card.scrollWidth,card.clientHeight,card.scrollHeight],
        overlay:[overlay.clientHeight,overlay.scrollHeight],transform:card.style.transform,targets,focused:focused?rect(focused):null,
        clippedLabels:[...document.querySelectorAll('#nkMenu .nkItem:not(.header) .nm,#nkMenu .nkItem:not(.header) .val,#nkMenu .nkItem:not(.header) .lb small')].filter(e=>e.clientWidth>0 && (e.scrollWidth>e.clientWidth+2 || e.scrollHeight>e.clientHeight+2)).map(e=>({text:e.textContent,client:[e.clientWidth,e.clientHeight],scroll:[e.scrollWidth,e.scrollHeight]}))};
    })()`);
  }
  async function checkCard(label, shot) {
    const m = await metrics(), c = m.card;
    t.assert(c.left>=-.5 && c.top>=-.5 && c.right<=m.viewport[0]+.5 && c.bottom<=m.viewport[1]+.5 &&
      m.scroll[1]<=m.scroll[0]+2 && m.targets.every(r=>r.left>=c.left-.5 && r.right<=c.right+.5),
      label + ': card and content fit horizontally inside the viewport', m);
    t.assert(m.targets.length>0 && m.targets.every(r=>r.width>=63.9 && r.height>=63.9) && !m.transform,
      label + ': options remain at least 64px without shrinking the card', m.targets);
    if(m.viewport[0]<=900 || m.viewport[1]<=500) t.assert(m.clippedLabels.length===0,label + ': option labels wrap without clipping',m.clippedLabels);
    if (shot) await t.shot(shot);
    const footer = await t.js(`(() => {
      const c=document.getElementById('nkCard'); c.scrollTop=c.scrollHeight;
      const r=document.getElementById('nkHint').getBoundingClientRect(), b=c.getBoundingClientRect();
      return {visible:r.top>=b.top-.5 && r.bottom<=b.bottom+.5,scrollTop:c.scrollTop};
    })()`);
    t.assert(footer.visible, label + ': footer can be reached by scrolling', footer);
  }
  async function checkFocus(label) {
    const m=await metrics(), f=m.focused, c=m.card;
    t.assert(!!f && f.top>=c.top-.5 && f.bottom<=c.bottom+.5 && f.top>=-.5 && f.bottom<=m.viewport[1]+.5,
      label + ': selected option is automatically revealed', {card:c,focused:f});
  }

  for (const [w,h] of SIZES) {
    await t.setSize(w,h);
    for (const [label,setup,name,opts] of SCREENS) {
      await t.js(setup+'true'); await L.screen(name,opts);
      await checkCard(label+' @'+w+'x'+h, w<1000 && ['racer','kart','settings'].includes(label) ? 'mobile-'+w+'x'+h+'-'+label : null);
      const d=await L.dbg();
      await L.screen(name,Object.assign({},opts,{index:d.rows.length-1}));
      await checkFocus(label+' @'+w+'x'+h);
    }
    await L.startRace('NK.game.setPlayers(1); NK.game.setMode("nofail"); NK.game.setType("single"); NK.game.setTrack("meadow");');
    await t.js('NK.ui.openPause(-1); true'); await L.until('pause');
    await checkCard('pause @'+w+'x'+h);
    await t.js('NK.game.resume(); NK.game.__finishAs(3); true'); await L.until('results');
    await checkCard('results @'+w+'x'+h,w<1000?'mobile-'+w+'x'+h+'-results':null);
    await L.tap('Space'); await checkFocus('results first switch @'+w+'x'+h);

    await L.startRace('NK.game.setPlayers(1); NK.game.setType("gp"); NK.game.setCup("sunshine");');
    for(let race=1;race<=4;race++) {
      await t.js('NK.game.__finishAs(1); true'); await L.until('results');
      await L.screen('standings');
      if(race===4) await checkCard('final standings @'+w+'x'+h);
      await L.tap('Space'); await L.tap('Enter');
      if(race<4) await t.until('NK.ui.__dbg().inRace && !NK.ui.__dbg().overlayOn');
    }
    await L.until('trophy'); await checkCard('trophy @'+w+'x'+h);
  }


  await t.js('Object.entries({"--safe-top":"24px","--safe-left":"32px","--safe-right":"32px","--safe-bottom":"20px"}).forEach(([k,v])=>document.documentElement.style.setProperty(k,v)); true');
  for(const [w,h] of [[390,844],[844,390]]) {
    await t.setSize(w,h);
    for(const screen of ['settings','racer']) {
      await L.screen(screen,{player:0});
      const d=await L.dbg();await L.screen(screen,{player:0,index:d.rows.length-1});
      const m=await metrics(),c=m.card,f=m.focused;
      t.assert(c.left>=31.5 && c.right<=w-31.5 && c.top>=23.5 && c.bottom<=h-19.5 &&
        !!f && f.left>=31.5 && f.right<=w-31.5 && f.top>=23.5 && f.bottom<=h-19.5,
        screen+' @'+w+'x'+h+': safe-area insets protect the card and focused option',{card:c,focused:f});
    }
  }
  await t.js('["--safe-top","--safe-left","--safe-right","--safe-bottom"].forEach(k=>document.documentElement.style.removeProperty(k)); true');

  await t.setSize(360,640);
  await t.js('NK.game.setPlayers(1); NarbeScanManager.setAutoScan(false); true');
  await L.screen('settings');
  const settingsRows=(await L.dbg()).rows.length;
  for(let i=1;i<settingsRows;i++) {
    await L.tap('Space'); await checkFocus('phone settings switch step '+i);
  }
  await L.tap('Enter'); await L.until('title');
  t.assert(true,'phone settings Back remains switch reachable and returns to title');

  // Native Chromium touch events exercise scrolling as well as the tap handler.
  const debug=t.win.webContents.debugger;
  debug.attach('1.3');
  try {
    await debug.sendCommand('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});

    await t.js('NarbeScanManager.setAutoScan(true); NarbeScanManager.setScanSpeedIndex(0); true');
    await L.screen('settings'); await t.wait(200);
    const holdPoint=await t.js('(()=>{const r=document.querySelector("#nkMenu .nkItem").getBoundingClientRect(); return {x:r.left+r.width*.5,y:r.top+r.height*.5};})()');
    await debug.sendCommand('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:holdPoint.x,y:holdPoint.y,id:3}]});
    const holdAt=(await L.dbg()).index;await t.wait(1300);
    const held=await L.dbg();
    t.assert(held.index===holdAt && !held.autoScanRunning,'Auto Scan waits while a finger holds the menu',{before:holdAt,after:held.index,running:held.autoScanRunning});
    await debug.sendCommand('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
    await t.until('NK.ui.__dbg().index !== '+holdAt,2500);
    t.assert(true,'Auto Scan resumes after a cancelled touch gesture');
    await t.js('NarbeScanManager.setAutoScan(false); true');

    await L.screen('settings'); await t.wait(200);
    const before=await t.js('JSON.stringify(Object.fromEntries(Object.keys(localStorage).sort().map(k=>[k,localStorage.getItem(k)])))');
    const point=await t.js('(()=>{const r=document.querySelector("#nkMenu .nkItem").getBoundingClientRect(); return {x:r.left+r.width*.5,y:r.top+r.height*.5};})()');
    await debug.sendCommand('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:point.x,y:point.y,id:1}]});
    for(let i=1;i<=5;i++) {
      await debug.sendCommand('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:point.x,y:point.y-i*22,id:1}]});
      await t.wait(25);
    }
    await debug.sendCommand('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await t.wait(200);
    const after=await t.js('({settings:JSON.stringify(Object.fromEntries(Object.keys(localStorage).sort().map(k=>[k,localStorage.getItem(k)]))),scroll:document.getElementById("nkCard").scrollTop,screen:NK.ui.__dbg().screen})');
    t.assert(after.screen==='settings' && before===after.settings && after.scroll>0,
      'a phone swipe scrolls the card without choosing the touched setting',after);

    await L.screen('settings'); await t.wait(200);
    await L.clearCalls();
    const music=await t.js(`(() => {
      const e=[...document.querySelectorAll('#nkMenu .nkItem')].find(e=>e.querySelector('.nm').textContent==='Music');
      e.scrollIntoView({block:'center'}); const r=e.getBoundingClientRect();
      return {x:r.left+r.width*.5,y:r.top+r.height*.5};
    })()`);
    await debug.sendCommand('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:music.x,y:music.y,id:2}]});
    await t.wait(70);
    await debug.sendCommand('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await t.wait(220);
    const calls=(await L.calls('settings.set')).filter(c=>c.args[0]==='music');
    t.assert(calls.length===1,'a phone tap changes a setting exactly once, including its synthetic click',calls);
  } finally { debug.detach(); }
  t.assert(t.errors.length===0,'mobile menus produce no browser errors',t.errors);
};
