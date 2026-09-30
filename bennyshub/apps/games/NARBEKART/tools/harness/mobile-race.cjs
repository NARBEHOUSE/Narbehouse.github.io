/** Real 3D phone presentation, safe areas, rotation, and independent touches. */
module.exports = async function (t) {
  await t.setSize(390,844);
  await t.load('apps/games/NARBEKART/index.html');
  await t.until('window.NK && NK.ui && NK.ui.ready',45000);
  await t.js(`window.__mobileViews=[]; NK.main.onBeforeView((i,v)=>{ window.__mobileViews[i]={aspect:v.camera.aspect,fov:v.camera.fov,showcase:!!v.showcase}; }); true`);
  for (const [w,h] of [[390,844],[844,390]]) {
    await t.setSize(w,h);
    await t.js('NK.ui.setScreen("racer",{player:0}); true');
    await t.wait(400);
    const preview=await t.js('({rect:NK.main.showcaseRect(),camera:window.__mobileViews[0]})');
    t.assert(preview.rect && preview.camera.showcase && Math.abs(preview.camera.aspect-preview.rect.width/preview.rect.height)<.01,'real preview uses its mobile slot '+w+'x'+h,preview);
    await t.shot('preview-'+w+'x'+h);
  }
  async function metrics() {
    return t.js(`(() => {
      const box=el=>{const r=el.getBoundingClientRect();return {x:r.left,y:r.top,w:r.width,h:r.height,r:r.right,b:r.bottom};};
      const pause=box(document.getElementById('nkPauseBtn'));
      return {size:[innerWidth,innerHeight],layout:NK.game.effectiveLayout(),hud:NK.hud.layout,stored:NK.game.settings.get('split'),camera:window.__mobileViews,
        renderer:NK.perf().size,pause,views:[...document.querySelectorAll('.nkView')].map(view=>{
          const b=box(view),parts=[...view.querySelectorAll('.nkTL,.nkTR,.nkBottom,.nkMapWrap,.nkCue.on,.nkSide.on')].map(el=>({name:el.className,...box(el)})).filter(p=>p.w&&p.h);
          const overlaps=[]; for(let a=0;a<parts.length;a++) for(let z=a+1;z<parts.length;z++){const p=parts[a],q=parts[z];if(p.x<q.r-1&&p.r>q.x+1&&p.y<q.b-1&&p.b>q.y+1)overlaps.push(p.name+' / '+q.name);}
          const pauseHits=parts.filter(p=>pause.x<p.r-1&&pause.r>p.x+1&&pause.y<p.b-1&&pause.b>p.y+1).map(p=>p.name);
          return {box:b,parts,overlaps,pauseHits,outside:parts.filter(p=>p.x<b.x-.5||p.y<b.y-.5||p.r>b.r+.5||p.b>b.b+.5).map(p=>p.name)};
        })};
    })()`);
  }
  for (const [w,h,players,safe] of [[320,568,1,false],[390,844,1,false],[568,320,1,false],[844,390,1,false],[320,568,2,false],[390,844,2,false],[568,320,2,false],[844,390,2,false],[320,568,2,true],[844,390,2,true]]) {
    const name=w+'x'+h+'-'+players+'p'+(safe?'-safe':'');
    const insets=safe?(w<h?{top:'44px',right:'0px',bottom:'24px',left:'0px'}:{top:'0px',right:'32px',bottom:'18px',left:'32px'}):{};
    await t.setSize(w,h);
    await t.js(`['top','right','bottom','left'].forEach(k=>document.documentElement.style.setProperty('--safe-'+k,${JSON.stringify(insets)}[k]||'0px'));
      NK.game.settings.set('split','side'); NK.debug.start({players:${players},type:'single',mode:'nofail',trackId:'meadow'}); NK.debug.skipIntro(); true`);
    await t.wait(500);
    await t.js(`NK.game.pause(); NK.ui.debugRace(); NK.debug.race().humans.forEach((r,i)=>{
      NK.hud.update(i,{place:1,lap:2,laps:3,time:92.3,item:'goldrocket',itemUseT:4.2,itemUseDelay:5,roulette:false,finished:false,label:(${players}>1?'P'+(i+1):'YOU')+' · '+r.name,drift:{charge:1.2,level:1},cue:{active:true,dir:-1,targetLane:0,reason:'obstacle',level:1}});
      NK.hud.control(i,{scheme:'one',armed:-1,match:true,scanLane:-1,targetLane:2,pauseHold:0});
    }); document.querySelectorAll('.nkPop').forEach(el=>el.classList.remove('on')); true`);
    await t.wait(100);
    const m=await metrics(), expected=players===1?'single':w<h?'stack':'side';
    t.assert(m.layout===expected && m.hud===expected && m.stored==='side',name+': effective split and HUD agree without changing preference',m);
    t.assert(m.views.every(v=>!v.outside.length&&!v.overlaps.length&&!v.pauseHits.length),name+': essential HUD and Pause do not clip or overlap',m);
    t.assert(m.pause.w>=64 && m.pause.h>=64 && m.pause.x>=0 && m.pause.r<=w && m.pause.y>=0 && m.pause.b<=h && m.renderer[0]===w && m.renderer[1]===h,name+': visible 64px Pause and matching renderer size',m);
    if(players===1 && w<h) t.assert(m.camera[0].fov>70,name+': portrait camera widens the road view',m.camera[0]);
    await t.shot('race-'+name);
    await t.js(`NK.debug.race().humans.forEach((r,i)=>NK.hud.control(i,{scheme:'step-scan',armed:-1,match:true,scanLane:1,targetLane:1,pauseHold:0})); true`);
    const scan=await metrics();
    t.assert(scan.views.every(v=>!v.outside.length&&!v.overlaps.length&&!v.pauseHits.length),name+': switch lane scanner also fits',scan);
  }
  await t.js(`['top','right','bottom','left'].forEach(k=>document.documentElement.style.setProperty('--safe-'+k,'0px')); NK.game.resume(); NK.ui.debugRace(); true`);
  for(const [w,h,expected] of [[390,844,'stack'],[844,390,'side'],[1024,768,'side']]) {
    await t.setSize(w,h); await t.wait(150);
    t.assert(await t.js(`NK.game.effectiveLayout()==='${expected}' && NK.hud.layout==='${expected}' && NK.game.settings.get('split')==='side'`),'rotation restores desktop split preference '+w+'x'+h);
  }
  await t.setSize(844,390); await t.wait(100);
  const pointers=await t.js(`(() => {
    const surface=document.getElementById('canvasWrap'),old=NK.game.targetLane,calls=[]; NK.game.targetLane=(p,l)=>calls.push([p,l]);
    const rects=[...document.querySelectorAll('.nkView')].map(el=>el.getBoundingClientRect());
    function point(p,fx){const r=rects[p];return [r.left+r.width*fx,r.top+r.height*.5];}
    function fire(type,id,p,fx){const [x,y]=point(p,fx);(type==='pointerup'||type==='pointercancel'?window:surface).dispatchEvent(new PointerEvent(type,{pointerId:id,pointerType:'touch',clientX:x,clientY:y,bubbles:true,cancelable:true}));}
    fire('pointerdown',1,0,.2);fire('pointerdown',2,1,.2);fire('pointerup',1,0,.2);fire('pointermove',2,1,.8);
    const independent=calls.slice();calls.length=0;
    fire('pointerdown',3,0,.2);fire('pointermove',3,1,.8);fire('pointerup',3,1,.8);
    const locked=calls.slice();calls.length=0;
    fire('pointercancel',2,1,.8);fire('pointermove',2,1,.2);const cancel=calls.length;
    fire('pointerdown',4,0,.2);NK.controls.suspend();NK.controls.resume();calls.length=0;fire('pointermove',4,0,.8);const suspended=calls.length;
    NK.game.targetLane=old;return {independent,locked,cancel,suspended};
  })()`);
  t.assert(JSON.stringify(pointers.independent)==='[[0,1],[1,1],[1,4]]','lifting one finger keeps the other player steering',pointers);
  t.assert(pointers.locked.length===2 && pointers.locked.every(c=>c[0]===0),'crossing the divider retains original player ownership',pointers);
  t.assert(pointers.cancel===0 && pointers.suspended===0,'cancel and pause discard only expired pointer gestures',pointers);
  await t.key('keydown','Space'); await t.key('keydown','Enter'); await t.key('keyup','Space');
  t.assert(await t.js('!NK.controls.state(0).holding && NK.controls.state(1).holding'),'P1 switch release still preserves held P2 switch');
  await t.key('keyup','Enter');
  t.assert(t.errors.length===0,'mobile races produce no browser errors',t.errors);
};
