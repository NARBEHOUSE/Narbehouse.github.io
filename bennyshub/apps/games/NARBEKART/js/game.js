/** NARBE Racer — sessions, progression, presentation and persistence. */
NK.game = (function () {
  'use strict';
  const U = NK.util, C = NK.C, AU = NK.audio;
  const defaults = { cueLevel: 1, music: true, sfx: true, steerMode: 'hold', steerSpeed: 'normal', split: 'side', shake: true };
  const object = v => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  const data = Object.assign({}, defaults, object(U.load('settings', {})));
  const valid = { cueLevel: [0,1,2], music: [true,false], sfx: [true,false], steerMode: ['hold','step'],
    steerSpeed: C.STEER_ORDER, split: ['side','stack'], shake: [true,false] };
  Object.keys(defaults).forEach(k => { if (!valid[k].includes(data[k])) data[k] = defaults[k]; });
  let progress = object(U.load('progress', {}));
  progress.cups = Object.assign({ nofail: 1, open: 1 }, object(progress.cups));
  progress.cups.nofail = U.clamp(+progress.cups.nofail || 1, 1, 2); progress.cups.open = U.clamp(+progress.cups.open || 1, 1, 2);
  progress.mirror = progress.mirror === true;
  let trophies = object(U.load('trophies', {})), best = object(U.load('best', {}));
  let picks = object(U.load('picks', {}));
  const pick = (p, fallback) => ({ charId: NK.roster.character(object(p).char || fallback).id, vehicleId: NK.roster.vehicle(object(p).kart || 'kart').id });
  const session = { players: 1, mode: C.MODES[picks.mode] ? picks.mode : 'nofail', type: ['gp','single','tt'].includes(picks.type) ? picks.type : 'gp',
    classId: C.CLASSES[picks.classId] ? picks.classId : 'easy', picks: [pick(picks.p1,'pip'), pick(picks.p2,'rusty')],
    cupId: NK.tracks.CUPS.some(c => c.id === picks.cupId) ? picks.cupId : 'sunshine',
    trackId: NK.tracks.TRACKS[picks.trackId] ? picks.trackId : 'meadow', gp: null };
  let scene, renderer, W, R, views = [], demo = true, paused = false, phase = 'menu', clock = 0, hudT = 0;
  let lastResults = null, preview = null, podium = null, gpRoster = null, ghost = null, recording = [], recordAt = 0;
  const listeners = {};
  const emit = (name, ...args) => (listeners[name] || []).slice().forEach(fn => fn(...args));
  const snapshot = v => JSON.parse(JSON.stringify(v));
  function setPhase(p) { if (phase !== p) { phase = p; emit('phase', p); } }
  function savePicks() {
    picks = { p1: { char: session.picks[0].charId, kart: session.picks[0].vehicleId }, p2: { char: session.picks[1].charId, kart: session.picks[1].vehicleId },
      mode: session.mode, type: session.type, classId: session.classId, cupId: session.cupId, trackId: session.trackId };
    U.save('picks', picks);
  }
  function layout() { return session.players === 2 && !demo ? data.split : 'single'; }
  function applyViews() { NK.main.setViews(preview ? [preview.view] : podium ? [podium.view] : views, preview || podium ? 'single' : layout()); }
  function setupViews() {
    views = (demo ? [R.racers[0]] : R.humans).map((r,i) => ({ camera: new THREE.PerspectiveCamera(55, 1, 0.35, 1600), playerIdx: i, world: W, racer: r }));
    views.forEach(v => NK.camera.chase(v, v.racer, 1, true)); applyViews();
    if (!demo) NK.hud.setup(layout());
  }
  const settings = {
    get: k => data[k],
    set(k,v) {
      if (!valid[k] || !valid[k].includes(v)) return;
      data[k] = v; U.save('settings', data);
      if (k === 'music') AU.setMusic(v); if (k === 'sfx') AU.setSfx(v);
      if (k === 'split' && R && !demo) { NK.hud.setup(layout()); applyViews(); pushHud(); }
    }
  };
  function disposeModel(model) {
    if (!model) return;
    if (model.parent) model.parent.remove(model);
    NK.art.disposeTree(model);
  }
  function clearPreview() { if (!preview) return; disposeModel(preview.group); preview = null; }
  function clearPodium() { if (!podium) return; disposeModel(podium.group); podium = null; }
  function stopEngines() { [0,1].forEach(i => { AU.engine(i).stop(); AU.starStop(i); AU.dangerStop(i); }); }
  function cleanRace() {
    stopEngines(); clearPreview(); clearPodium();
    if (ghost) { disposeModel(ghost.mesh); ghost.materials.forEach(m=>m.dispose()); ghost = null; }
    if (R) R.dispose(); if (W) W.dispose(); R = W = null;
    NK.input.reset(); recording = []; recordAt = 0;
  }
  function roster() {
    const humans = session.picks.slice(0, session.players).map(p=>Object.assign({ oneSwitch: session.players === 2 || !!(U.sm() && U.sm().getSettings().autoScan) },p));
    const used = humans.map(p=>p.charId), cpus = [];
    if (session.type !== 'tt') {
      NK.roster.CHARACTERS.filter(c=>!used.includes(c.id)).forEach((c,i)=>cpus.push({ charId:c.id, vehicleId:NK.roster.VEHICLES[i%4].id }));
      while (cpus.length + humans.length < C.RACERS) cpus.push({ charId:NK.roster.CHARACTERS[cpus.length%12].id, vehicleId:'kart' });
    }
    return { humans, cpus: cpus.slice(0,C.RACERS-humans.length) };
  }
  function trackId() {
    if (session.type !== 'gp') return session.trackId;
    const cup = NK.tracks.CUPS.find(c=>c.id === session.cupId) || NK.tracks.CUPS[0];
    return cup.tracks[(session.gp ? session.gp.race : 1)-1];
  }
  function loadRace() {
    cleanRace(); demo = false; paused = false; lastResults = null; hudT = 0;
    const id = trackId();
    W = NK.world.build(scene, id, { mode: session.mode, mirror: session.classId === 'mirror', quality: { shadows:false } });
    const entries = session.type === 'gp' ? gpRoster : roster();
    let grid;
    if (session.gp && session.gp.standings.length) grid = session.gp.standings.slice().reverse().map(row=>row.idx);
    R = NK.race.create({ world:W, scene, mode:session.mode, classId:session.classId, laps:W.track.laps, timeTrial:session.type==='tt', humans:entries.humans, cpus:entries.cpus, grid });
    bindRace(); setupViews(); setPhase(R.phase); pushHud();
    AU.musicTempo(1); AU.music(W.theme.music || W.track.theme);
    R.humans.forEach(h=>AU.engine(h.human).start(h.vehicleId,session.players===2?(h.human===0?-1:1):0));
    if (R.timeTrial) loadGhost();
    NK.hud.pop(-1, W.track.name, 'lap');
  }
  function loadAttract() {
    cleanRace(); demo = true; paused = false; clock = 0;
    W = NK.world.build(scene,'meadow',{mode:'nofail',quality:{shadows:false}});
    R = NK.race.create({ world:W,scene,mode:'nofail',classId:'easy',laps:100000,humans:[],cpus:NK.roster.CHARACTERS.slice(0,6).map(c=>({charId:c.id,vehicleId:'kart'})) });
    R.skipIntro(); setupViews(); setPhase('menu'); NK.hud.clear(); AU.musicTempo(1); AU.music('menu');
  }
  function soundFor(h) { return { pan:session.players===2?(h.human===0?-1:1):0 }; }
  function humanEvent(name,fn) { R.on(name,(h,...args)=>{ if(h && h.isHuman) fn(h,...args); }); }
  function bindRace() {
    R.on('countdown',n=>{ NK.hud.pop(-1,String(n),'count'); AU.countdown(n); emit('countdown',n); });
    R.on('go',()=>{ NK.hud.pop(-1,'GO!','go'); AU.countdown(0); U.speak('Go!'); emit('countdown',0); setPhase('racing'); });
    humanEvent('lap',(h,n)=>{ if(n!==R.laps) { NK.hud.pop(h.human,'LAP '+n,'lap'); AU.lap(soundFor(h)); } });
    humanEvent('finalLap',h=>{ NK.hud.pop(h.human,'FINAL LAP!','final'); AU.finalLap(soundFor(h)); AU.musicTempo(1.12); U.speak((session.players===2?'Player '+(h.human+1)+'. ':'')+'Final lap!'); });
    humanEvent('finish',h=>{
      NK.hud.pop(h.human,'FINISH! '+U.ordinal(h.place),'finish'); AU.finish(h.place,soundFor(h));
      U.speak((session.players===2?'Player '+(h.human+1)+'. ':'')+'Finish! '+U.ordinalWord(h.place));
      if(R.timeTrial) saveBest(h);
    });
    humanEvent('itemGet',(h,id)=>{ const d=NK.items.DEFS[id]; AU.itemGet(id,soundFor(h)); U.speakIfIdle(d?d.speech||d.name:id); });
    humanEvent('itemUse',(h,id)=>{ const d=NK.items.DEFS[id]; AU.itemUse(id,soundFor(h)); NK.hud.pop(h.human,(d?d.name:id)+'!','item'); });
    humanEvent('hit',h=>AU.hit(R.mode.hitKind,soundFor(h)));
    humanEvent('coin',h=>AU.coin(h.coins,soundFor(h)));
    humanEvent('boost',(h,src)=>{ if(src==='pad') AU.boostPad(soundFor(h)); });
    humanEvent('turbo',(h,level)=>{ AU.turbo(level,soundFor(h)); NK.hud.pop(h.human,'TURBO!','good'); });
    humanEvent('driftLevel',(h,level)=>AU.driftLevel(level,soundFor(h)));
    humanEvent('trick',h=>{ AU.trick(soundFor(h)); NK.hud.pop(h.human,'TRICK!','good'); });
    humanEvent('box',h=>AU.boxSmash(soundFor(h)));
    humanEvent('roulette',h=>AU.rouletteTick(0,soundFor(h)));
    humanEvent('jump',h=>AU.jump(soundFor(h))); humanEvent('land',h=>AU.land(soundFor(h)));
    humanEvent('fall',h=>{ AU.fall(soundFor(h)); NK.hud.pop(h.human,'RESCUE ON THE WAY','lap'); });
    humanEvent('rescued',h=>AU.drone(soundFor(h)));
    humanEvent('place',(h,old,now)=>{ if(R.time>5) (now<old?AU.placeUp:AU.placeDown)(soundFor(h)); });
    R.on('bump',(a,b)=>{ if((a&&a.isHuman)||(b&&b.isHuman)) AU.bump(soundFor(a&&a.isHuman?a:b)); });
    R.on('done',()=>{ lastResults=scoreRace(); stopEngines(); AU.musicTempo(1); AU.music('results'); setPhase('done'); emit('raceEnd',lastResults); });
  }
  function bestTime(id,cl) { const n=object(best[id])[cl]; return Number.isFinite(n)&&n>0?n:null; }
  function ghostKey() { return 'ghost-'+W.track.id+'-'+session.classId; }
  function loadGhost() {
    const saved=object(U.load(ghostKey(),{}));
    if (!Array.isArray(saved.samples) || saved.samples.length<2 || saved.samples.length>20000 || !saved.samples.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite))) return;
    const mesh=NK.roster.build(saved.charId||session.picks[0].charId,saved.vehicleId||session.picks[0].vehicleId), materials=[], cloned=new Map();
    mesh.traverse(o=>{ if(!o.isMesh) return; const clone=m=>{ if(!cloned.has(m)) { const c=m.clone(); c.transparent=true; c.opacity=0.28; c.depthWrite=false; materials.push(c); cloned.set(m,c); } return cloned.get(m); }; o.material=Array.isArray(o.material)?o.material.map(clone):clone(o.material); });
    scene.add(mesh); ghost={mesh,materials,samples:saved.samples};
  }
  function sampleGhost() {
    const h=R.humans[0];
    if(!h.finished) while(recordAt<=R.time && recording.length<20000) { recording.push([+h.progress.toFixed(3),+h.x.toFixed(3)]); recordAt+=0.1; }
    if(ghost) {
      const ix=R.time*10, a=ghost.samples[Math.floor(ix)], b=ghost.samples[Math.floor(ix)+1];
      ghost.mesh.visible=!!a;
      if(a) { const p=b?U.lerp(a[0],b[0],ix%1):a[0], x=b?U.lerp(a[1],b[1],ix%1):a[1]; W.pointAt(p,x,ghost.mesh.position); ghost.mesh.rotation.y=W.frameAt(p).yaw; }
    }
  }
  function saveBest(h) {
    const current=bestTime(W.track.id,session.classId); h.newBest=!current||h.finishTime<current;
    if(!h.newBest) return;
    best[W.track.id]=object(best[W.track.id]); best[W.track.id][session.classId]=h.finishTime;
    U.save('best',best);
    recording.push([+h.progress.toFixed(3),+h.x.toFixed(3)]);
    U.save(ghostKey(),{charId:h.charId,vehicleId:h.vehicleId,samples:recording});
  }
  function trophy(mode,cl,cup) { return object(object(trophies[mode])[cl])[cup]||null; }
  function awardCup() {
    const gp=session.gp, awards=[];
    const rank={done:0,bronze:1,silver:2,gold:3};
    gp.standings.forEach((row,i)=>{
      if(row.human<0) return;
      const kind=['gold','silver','bronze'][i]||(session.mode==='nofail'?'done':null);
      awards.push({human:row.human,place:i+1,trophy:kind});
      if(kind) {
        trophies[session.mode]=object(trophies[session.mode]); trophies[session.mode][session.classId]=object(trophies[session.mode][session.classId]);
        const old=trophy(session.mode,session.classId,session.cupId);
        if(!old||rank[kind]>rank[old]) trophies[session.mode][session.classId][session.cupId]=kind;
      }
      if(session.mode==='nofail'||i<3) { if(session.cupId==='sunshine') progress.cups[session.mode]=2; }
    });
    progress.mirror=progress.mirror||NK.tracks.CUPS.every(c=>['gold','silver','bronze'].includes(trophy('open','fast',c.id)));
    U.save('trophies',trophies); U.save('progress',progress); return awards;
  }
  function scoreRace() {
    const order=R.standings(), gp=session.gp;
    if(gp&&!R.scored) {
      R.scored=true;
      order.forEach((r,i)=>{
        let row=gp.standings.find(s=>s.idx===r.idx);
        if(!row) { row={idx:r.idx,name:r.name,charId:r.charId,vehicleId:r.vehicleId,human:r.human,total:0,lastPlace:i+1}; gp.standings.push(row); }
        row.total+=C.POINTS[i]||0; row.lastPlace=i+1;
      });
      gp.standings.sort((a,b)=>b.total-a.total||a.lastPlace-b.lastPlace); gp.done=gp.race===gp.of;
      if(gp.done) gp.trophies=awardCup();
    }
    return {track:W.track.id,cupId:session.cupId,mode:session.mode,classId:session.classId,type:session.type,
      order:order.map((r,i)=>({place:i+1,name:r.name,charId:r.charId,human:r.human,
        time:r.finishTime==null?R.time+Math.max(0,R.laps*R.L-r.progress)/Math.max(1,r.v):r.finishTime,
        points:gp?C.POINTS[i]:undefined,total:gp?gp.standings.find(s=>s.idx===r.idx).total:undefined})),
      humans:R.humans.map(h=>({human:h.human,place:h.place,time:h.finishTime,newBest:!!h.newBest})),gp:gp?snapshot(gp):null};
  }
  function startSession() {
    if(session.players===2&&session.type==='tt') session.type='single';
    if(session.type==='gp') { session.gp={race:1,of:4,standings:[],done:false,trophies:[]}; gpRoster=roster(); }
    else session.gp=null;
    savePicks(); loadRace();
  }
  function nextRace() {
    if(!session.gp) return;
    if(session.gp.done) { showPodium(); emit('gpEnd',{cupId:session.cupId,standings:snapshot(session.gp.standings),trophies:session.gp.trophies}); return; }
    if(!lastResults) return;
    session.gp.race++; loadRace();
  }
  function studio() {
    const s=new THREE.Scene(); s.background=new THREE.Color('#292540');
    s.add(new THREE.HemisphereLight(0xd6efff,0x604463,2.5));
    const sun=new THREE.DirectionalLight(0xfff4dc,3); sun.position.set(-4,7,-6); s.add(sun); s.add(new THREE.AmbientLight(0xffffff,0.7));
    return s;
  }
  function setPreview(pk) {
    if(!pk) { if(preview) { clearPreview(); applyViews(); } return; }
    if(preview&&preview.key===pk.charId+':'+pk.vehicleId) return;
    clearPreview(); const s=studio(), group=new THREE.Group(), model=NK.roster.build(pk.charId,pk.vehicleId);
    const plinth=NK.art.part(new THREE.CylinderGeometry(3.5,3.8,0.35,48),NK.art.mat.toon(0x6c4aa4),{pos:[0,-0.2,0]});
    group.add(plinth,model); s.add(group);
    const camera=new THREE.PerspectiveCamera(43,1,0.1,100); camera.position.set(0,4.8,-11);
    preview={key:pk.charId+':'+pk.vehicleId,group,model,view:{camera,scene:s}};
    applyViews();
  }
  function showPodium() {
    clearPreview(); clearPodium(); stopEngines();
    const s=studio(), group=new THREE.Group(), stage=NK.art.podium(); group.add(stage);
    const positions=stage.userData.spots;
    session.gp.standings.slice(0,3).forEach((row,i)=>{ const mesh=NK.roster.build(row.charId,row.vehicleId); mesh.position.copy(positions[i]); group.add(mesh); });
    const cup=NK.art.trophy(session.gp.trophies[0]&&session.gp.trophies[0].trophy||'gold'); cup.position.set(0,0.2,-4.5); cup.scale.setScalar(2.2); group.add(cup); s.add(group);
    podium={group,view:{camera:new THREE.PerspectiveCamera(48,1,0.1,100),scene:s},time:0};
    AU.music('podium'); setPhase('podium'); applyViews();
  }
  function pause() {
    if(demo||paused||!R||lastResults) return;
    paused=true; stopEngines(); setPhase('paused');
  }
  function resume() {
    if(!paused||!R) return;
    paused=false; setPhase(R.phase);
    R.humans.forEach(h=>AU.engine(h.human).start(h.vehicleId,session.players===2?(h.human===0?-1:1):0));
    applyViews(); pushHud();
  }
  function cue(i) {
    const c=R&&!demo?R.cueOf(i):null;
    return Object.assign({dir:0,active:false,targetLane:2,danger:false},c||{},{level:data.cueLevel});
  }
  function pushHud() {
    if(!R||demo) return;
    R.humans.forEach(h=>{
      const c=cue(h.human);
      NK.hud.update(h.human,{place:h.place,of:R.racers.length,lap:h.lap,laps:R.laps,item:h.item,itemUseT:h.itemUseT,itemUseDelay:h.itemUseDelay,roulette:h.roulette>0,coins:h.coins,
        time:h.finished?h.finishTime:R.time,best:R.timeTrial?bestTime(W.track.id,session.classId):null,lane:h.lane,drift:h.drift,
        cue:c,danger:data.cueLevel>0&&c.danger,oneSwitch:h.oneSwitch,finished:h.finished,label:(session.players===2?'P'+(h.human+1):'YOU')+' · '+h.name});
      NK.hud.minimap(h.human,W,R.racers,h.idx);
    });
  }
  function update(dt) {
    AU.tick(); clock+=dt;
    if(preview) {
      preview.model.rotation.y=0.35+Math.sin(clock*0.7)*0.42;
      const cam=preview.view.camera;
      // Offset the target to frame the model beside the pick card.
      cam.lookAt(4.2,1.3,0);
    }
    if(podium) {
      podium.time+=dt; NK.camera.podium(podium.view,new THREE.Vector3(5,0,0),podium.time); return;
    }
    if(!R||paused) return;
    R.update(dt);
    if(!demo&&phase!==R.phase) setPhase(R.phase);
    views.forEach(view=>{
      const h=view.racer;
      if(demo) NK.camera.attract(view,W,clock);
      else if(R.phase==='intro') NK.camera.intro(view,W,R.introTime||0);
      else if(h.finished) NK.camera.finish(view,h,dt);
      else NK.camera.chase(view,h,dt,false);
    });
    W.update(dt,demo?clock:R.time,views[0].camera.position);
    if(demo) return;
    if(R.timeTrial&&R.phase==='racing') sampleGhost();
    if(!lastResults) R.humans.forEach(h=>{
      AU.engine(h.human).update(h.v/R.classDef.speed,h.boostT>0||h.jetT>0,h.drift.dir?h.drift.level||true:false);
      if(h.starT>0) AU.starStart(h.human); else AU.starStop(h.human);
      const c=cue(h.human);
      // Speak once per approaching danger. Ordinary racing lines and coins
      // never compete with the menu voice or demand an unnecessary move.
      const cueId=c.id||c.reason+':'+Math.floor(h.progress/80);
      if(data.cueLevel===2 && c.danger && c.active && R.phase==='racing' && !h.finished && R.time>(h.nextCueAt||0) && h.lastSpokenCue!==cueId) {
        AU.cue(c.dir,h.human,session.players===1?{pan:c.dir}:undefined);
        if(session.players===1) U.speakIfIdle(c.dir<0?'Obstacle ahead. Left is clear.':'Obstacle ahead. Right is clear.');
        h.lastSpokenCue=cueId; h.nextCueAt=R.time+8;
      }
      if(data.cueLevel===2&&c.danger) AU.dangerStart(h.human); else AU.dangerStop(h.human);
    });
    hudT-=dt; if(hudT<=0) { hudT=0.1; pushHud(); }
  }
  function beforeView(i) {
    if(!W||preview||podium) return;
    R.humans.forEach(h=>{
      if(h.playerRing) h.playerRing.visible = h.human === i && h.fallT <= 0 && h.rescueT <= 0;
    });
    const view=views[i]; if(view&&W.followCamera) W.followCamera(view.camera.position);
    W.setPadGlow(!demo);
  }
  function resetProgress() {
    progress={cups:{nofail:1,open:1},mirror:false}; trophies={}; best={};
    U.save('progress',progress); U.save('trophies',trophies); U.save('best',best);
    Object.keys(NK.tracks.TRACKS).forEach(id=>C.CLASS_ORDER.forEach(cl=>U.remove('ghost-'+id+'-'+cl)));
  }
  const api={ settings,
    init(o) { renderer=o.renderer; scene=o.scene; AU.init(); AU.setSfx(data.sfx); AU.setMusic(data.music); loadAttract(); },
    update,beforeView, get session(){return snapshot(session);},
    setPlayers(n){session.players=n===2?2:1;}, setMode(id){if(C.MODES[id]) session.mode=id;savePicks();},
    setType(id){if(['gp','single','tt'].includes(id)) session.type=id;savePicks();},
    setClass(id){if(C.CLASSES[id]) session.classId=id;savePicks();},
    setPick(i,pk){const p=session.picks[i===1?1:0];if(pk.charId)p.charId=NK.roster.character(pk.charId).id;if(pk.vehicleId)p.vehicleId=NK.roster.vehicle(pk.vehicleId).id;savePicks();},
    setCup(id){if(NK.tracks.CUPS.some(c=>c.id===id))session.cupId=id;savePicks();},
    setTrack(id){if(NK.tracks.TRACKS[id])session.trackId=id;savePicks();},
    lastPicks:()=>snapshot(picks),unlocked:{cups:mode=>progress.cups[mode]||1,get mirror(){return progress.mirror;}},
    trophy,bestTime,setPreview,startSession,nextRace,restartRace:loadRace,
    quitToMenu(){session.gp=null;lastResults=null;gpRoster=null;NK.controls.stop();loadAttract();},
    pause,resume,isRacing:()=>!demo&&!!R&&!lastResults,isPaused:()=>paused,phase:()=>phase,
    steer(i,d){if(R&&!demo&&!paused)R.setSteer(i,d);},targetLane(i,n){if(R&&!demo&&!paused)R.setTargetLane(i,n);},
    pressed(i){if(R&&!demo&&!paused)R.pressed(i);},lane:i=>R&&R.humans[i]?R.humans[i].lane:2,cue,
    results:()=>lastResults,resetProgress,on(name,fn){(listeners[name]||(listeners[name]=[])).push(fn);return()=>{listeners[name]=listeners[name].filter(f=>f!==fn);};}
  };
  NK.debug={
    start(o){o=o||{};api.setPlayers(o.players||1);api.setMode(o.mode||'nofail');api.setType(o.type||'single');api.setClass(o.classId||'easy');api.setTrack(o.trackId||'meadow');if(o.cupId)api.setCup(o.cupId);(o.picks||[]).forEach((p,i)=>api.setPick(i,p));startSession();if(NK.ui&&NK.ui.debugRace)NK.ui.debugRace();return true;},
    race:()=>R,skipIntro(){if(R)R.skipIntro();},
    teleport(i,p,x){const r=R&&R.racers[i];if(!r)return;r.progress=p;r.s=U.mod(p,R.L);if(Number.isFinite(x)){r.x=x;r.lane=r.targetLane=C.laneOf(x);r.stepTarget=null;}},
    give(i,id){if(R&&R.racers[i])NK.items.give(R,R.racers[i],id);},
    autopilot(i,on){if(R)R.setAutopilot(i,on);},stats:()=>({phase,session:snapshot(session),world:W&&W.stats,perf:NK.perf(),ghost:!!ghost,ghostSamples:recording.length}),
    get scene(){return scene;},get renderer(){return renderer;}
  };
  return api;
})();
