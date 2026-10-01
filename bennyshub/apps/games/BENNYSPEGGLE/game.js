/* Benny's Peggle: offline, switch-first story adventures. */
(() => {
  'use strict';
  const K = window.PeggleKit;
  const $ = id => document.getElementById(id);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clone = value => JSON.parse(JSON.stringify(value));
  const STORE = 'bennys-peggle-progress-v2';
  const CUSTOM = 'bennys-peggle-custom-v2';
  const LIBRARY = 'bennys-peggle-library-v2';
  const PLAYTEST = 'bennys-peggle-playtest-v2';
  const storyCampaigns = [
    {id:'lantern-run',title:'The Lantern Run',description:'Carry a light across the world for the homecoming festival.'},
    {id:'tide-post',title:'The Tide Post',description:'Deliver invitations along a magical waterway.'},
    {id:'star-workshop',title:'The Star Workshop',description:'Bring an old sky machine and its constellations back to life.'},
    {id:'power-playground',title:'The Power Playground',description:'Charge extraordinary balls, then aim your next big shot.',total:12,cover:'meadow'}
  ];
  const storyCache=new Map();
  const bundledHistory=new Map([[K.builtInPack.meta.title,K.legacyTrailPack]]);
  const historyLoads=new Map();
  function loadBundledHistory(title,file) {
    if(!historyLoads.has(title))historyLoads.set(title,fetch('levels/legacy/'+file+'-pre-powers.json').then(response=>{
      if(!response.ok)throw Error('Previous campaign content could not be loaded.');
      return response.json();
    }).then(raw=>{const previous=K.validatePack(raw);bundledHistory.set(title,previous);return previous;}).catch(error=>{historyLoads.delete(title);throw error;}));
    return historyLoads.get(title);
  }
  let campaignLoadVersion=0;
  function loadStoryCampaign(entry) {
    if(!storyCache.has(entry.id))storyCache.set(entry.id,fetch(`levels/story-${entry.id}.json`).then(response=>{
      if(!response.ok)throw Error('This campaign could not be loaded.');
      return response.json();
    }).then(async raw=>{
      if(entry.id!=='power-playground')await loadBundledHistory(entry.title,'story-'+entry.id);
      return K.validatePack(raw);
    }).catch(error=>{storyCache.delete(entry.id);throw error;}));
    return storyCache.get(entry.id);
  }
  const DEFAULTS = { sound:true, aimSpeed:0, reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches };
  const read = key => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
  let profile = read(STORE) || { campaigns:{}, settings:{} };
  profile.campaigns ||= {};
  const prefs = Object.fromEntries(Object.entries(DEFAULTS).map(([key,value])=>[key,profile.settings?.[key] ?? value]));
  let pack = K.validatePack(K.builtInPack), packId, run = null, board = null;
  let state = 'home', modal = null, focusIndex = 0, epoch = 0, scanClock = 0, saveClock = 0;
  let settingsReturn = 'home', aimDirection = 1, pointerAim = false, shotPhase = 'choice';
  let animationTime = 0, lastFrame = 0, toast = '', toastUntil = 0, particles = [], impacts = [], pegDepartures = [], pendingWin = false, recapVisualTime = 0;
  let pointerGesture = null, pendingPointerClick = null, shotFeedback = ''; 
  let settings = window.NarbeScanManager.getSettings();
  const held = { space:null, enter:null };
  const playtest = new URLSearchParams(location.search).has('playtest');
  const sceneNames = { garden:'The hidden garden', coast:'Beyond the garden gate', night:'A sky full of wishes' };
  const objectiveNames = { targets:'Light every sun peg', gems:'Collect the crystal pieces', score:'Build a big bounce score', clear:'Clear the whole board' };
  const pegGuide = [
    {type:'NORMAL',name:'Blue bounce peg',look:'Blue · usually round',description:'Earns points when hit. Clear these for a clear-the-board goal. Campaigns can give blue pegs different shapes.'},
    {type:'TARGET',name:'Sun target',look:'Gold square · sun symbol',description:'Hit every sun target to finish a sun-target stage. Also earns points toward a score goal.'},
    {type:'GEM',name:'Crystal gem',look:'Purple diamond · crystal symbol',description:'Collect these to reach the gem goal. Each gem also earns points.'},
    {type:'EXTRA',name:K.POWER_NAMES.EXTRA,look:'Green circle · plus symbol',description:'Adds one shot as soon as you hit it. This power works automatically.'},
    {type:'EXPLODE',name:K.POWER_NAMES.EXPLODE,look:'Pink starburst · sparkle symbol',description:'Collects nearby breakable pegs in a burst. Stone blocks stay in place. This power works automatically.'},
    {type:'MULTIBALL',name:K.POWER_NAMES.MULTIBALL,look:'White circle · two ball symbols',description:'Adds two more balls to the current shot. All three can collect pegs and use the base plate. This power works automatically.'},
    {type:'BLOCK',name:'Stone block',look:'Slate square · brick symbol',description:'A solid obstacle that bounces the ball. It cannot be cleared, gives no points, and never counts toward a clear-the-board goal.'}
  ];
  const chargeLooks = {
    ghost:'Pale blue hexagon · ghost symbol',blast:'Pink hexagon · burst symbol',multiball:'Ice blue hexagon · three ball symbols',
    fireball:'Orange hexagon · flame symbol',echo:'Violet hexagon · return arrow',magnet:'Mint hexagon · horseshoe magnet',guide:'Yellow hexagon · bounce arrow'
  };
  const chargeBriefs = {
    ghost:'Pass through breakable pegs.',blast:'Burst on the first hit.',multiball:'Launch three balls.',fireball:'Pierce pegs with fiery splashes.',
    echo:'Return each ball once.',magnet:'Pull balls toward the plate.',guide:'Preview more bounces.'
  };
  const chargeGuide=Object.entries(K.BALL_POWERS||{}).map(([power,entry])=>({type:'POWER',power,name:entry.name,look:chargeLooks[power],description:entry.description}));
  const ballPowerName=id=>K.ballPowerName?K.ballPowerName(pack.meta,id):K.BALL_POWERS?.[id]?.name||'Power ball';
  function powerSummary(powers) {
    const counts=new Map();for(const id of powers||[])counts.set(id,(counts.get(id)||0)+1);
    return [...counts].map(([id,count])=>ballPowerName(id)+(count>1?' ×'+count:''));
  }
  const guideControls = 'First choose Take shot or Options. Tap Space to move the highlight and release Enter to choose. Take shot opens aiming without firing and hides the buttons. Hold Space to move the aimer and release to stop; each new press reverses direction. A short press nudges the aim. Release Enter to shoot. Move the mouse or drag on the board to aim, then click or tap to shoot. Releasing a drag does not shoot. Hold Enter while aiming to return to Take shot and Options; during a shot, press and release Enter to pause. Auto Scan moves the highlight between shots and oscillates the aimer while aiming. Press Enter to stop the aimer, then release to shoot.';
  const pegName = peg => peg.type==='POWER'?ballPowerName(peg.power):Object.hasOwn(K.POWER_NAMES,peg.type) ? K.powerName(pack.meta,peg.type) : peg.name;
  function speak(text, effect) {
    $('announcement').textContent = text;
    window.NarbeVoiceManager?.speak(text);
    if (effect && prefs.sound) window.SafeAudio?.play(effect, .45);
  }
  function sound(name, volume=.45) { if (prefs.sound) window.SafeAudio?.play(name,volume); }
  ['select','hover','score','bank','bounce','catch','win','lose'].forEach(name => window.SafeAudio?.preload(name));
  function persist() {
    if(playtest)return;
    profile.settings = prefs;
    try { localStorage.setItem(STORE, JSON.stringify(profile)); } catch { $('announcement').textContent = 'Progress could not be saved. Your current game is still available while this page is open.'; }
  }
  function identity(p) {
    let hash = 2166136261;
    for (const char of JSON.stringify(p)) { hash ^= char.charCodeAt(0); hash = Math.imul(hash,16777619); }
    return 'pack-' + (hash >>> 0).toString(36);
  }
  function selectPack(p) {
    pack = K.validatePack(p); packId = identity(pack);
    profile.selectedPack = pack;
    if (!profile.campaigns[packId]) profile.campaigns[packId] = { completed:[], run:null };
    run = profile.campaigns[packId].run;
  }
  function priorBundledPacks(updated,original=false) {
    const historical=bundledHistory.get(updated.meta.title),base=historical||updated;
    const prior=historical&&identity(historical)!==identity(updated)?[clone(historical)]:[];
    if(updated.meta.title===K.builtInPack.meta.title)return prior;
    if(original) {
      const wide=clone(base),legacy=clone(base);
      wide.levels.forEach(level=>{if(level.catcher)level.catcher.width*=2;});
      legacy.levels.forEach(level=>delete level.catcher);
      return [...prior,wide,legacy];
    }
    const journey=['The Lantern Run','The Tide Post','The Star Workshop'].indexOf(updated.meta.title);
    if(journey<0||updated.levels.length!==20)return [];
    // Exact prior release configurations; the full resulting content identity
    // still has to match, so same-title custom campaigns cannot be upgraded.
    const previous=clone(base);
    previous.levels.forEach((level,index)=>{
      level.catcher=journey===0?{width:250+index%4*10,behavior:'catch',interval:3}:journey===1?{width:250+index%3*10,behavior:index%4>=2||index===9?'alternate':'catch',interval:3+index%3}:{width:280,behavior:'bounce',interval:3};
    });
    const wide=clone(previous);wide.levels.forEach(level=>level.catcher.width*=2);
    return [...prior,previous,wide];
  }
  function selectBundledCampaign(bundled,original=false) {
    const updated=K.validatePack(bundled),newId=identity(updated);
    // Compare complete normalized bundled content: edited or imported variants
    // retain their own identities and authored plate settings.
    if(!profile.campaigns[newId])for(const previous of priorBundledPacks(updated,original)) {
      const oldId=identity(previous);
      if(oldId===newId||!profile.campaigns[oldId])continue;
      const migrated=clone(profile.campaigns[oldId]);
      const saved=migrated.run?.snapshot,level=updated.levels[migrated.run?.stage];
      if(saved?.level&&level) {
        if(level.catcher)saved.level.catcher=clone(level.catcher);
        // Preserve the live ball and collection state, and make uncollected
        // charge pegs available on an unfinished stage. Completed recaps stay exact.
        if(['aim','flight'].includes(saved.status)) {
          const authored=new Map(level.pegs.map(peg=>[peg.id,peg]));
          saved.level=clone(level);
          saved.pegs=saved.pegs.map(peg=>({...clone(authored.get(peg.id)||peg),hit:!!peg.hit,...(peg.breakAge===undefined?{}:{breakAge:peg.breakAge})}));
        }
      }
      profile.campaigns[newId]=migrated;
      break;
    }
    selectPack(updated);
  }
  function selectOriginalCampaign(bundled) {selectBundledCampaign(bundled,true);}
  async function upgradeBundledSelection(selected) {
    const normalized=K.validatePack(selected),selectedId=identity(normalized);
    const story=storyCampaigns.find(entry=>entry.title===normalized.meta.title);
    let bundled,original=false;
    if(story)bundled=await loadStoryCampaign(story);
    else if(normalized.meta.title===K.builtInPack.meta.title)bundled=K.builtInPack;
    else if(normalized.meta.title==="Benny's Campaign") {
      const response=await fetch('levels/Bennys_Campaign.json');
      if(!response.ok)return false;
      bundled=K.validatePack(await response.json());original=true;
      await loadBundledHistory(bundled.meta.title,'Bennys_Campaign');
    }
    if(!bundled||![bundled,...priorBundledPacks(bundled,original)].some(candidate=>identity(candidate)===selectedId))return false;
    selectBundledCampaign(bundled,original);persist();return true;
  }
  function progress() { return profile.campaigns[packId]; }
  function completed() { return progress().completed || []; }
  function records() { return progress().achievements ||= {bestScore:0,catches:0,pegs:0,bigBounce:false}; }
  function button(label, action, sub='', primary=false, extra='') {
    return `<button class="button${primary?' primary':''}" data-action="${escape(action)}" ${extra}><span class="button-line"><span>${escape(label)}${sub?`<small>${escape(sub)}</small>`:''}</span>${primary?'<span class="arrow" aria-hidden="true">↗</span>':''}</span></button>`;
  }
  function header(eyebrow,title,description='') { return `<div class="section-intro"><div class="eyebrow">${escape(eyebrow)}</div><h1>${escape(title)}</h1>${description?`<p>${escape(description)}</p>`:''}</div>`; }
  function scene(scene='garden',uploadedImage='') {
    const background=K.backgroundInfo(scene),source=uploadedImage||background.src;
    scene=background.theme;
    const leaves = `<g fill="#759b69"><path d="M25 500Q90 310 175 520Q90 480 25 500Z"/><path d="M740 515Q650 300 565 515Q680 465 740 515Z"/></g><g fill="#b7cf82"><ellipse cx="95" cy="420" rx="16" ry="45" transform="rotate(-38 95 420)"/><ellipse cx="137" cy="466" rx="16" ry="45" transform="rotate(32 137 466)"/><ellipse cx="681" cy="435" rx="17" ry="49" transform="rotate(30 681 435)"/></g>`;
    const flowers = [[65,482],[158,501],[675,496],[745,475]].map(([x,y],i)=>`<g transform="translate(${x} ${y})"><path d="M0 0V65" stroke="#376a50" stroke-width="5"/><g fill="${i%2?'#f8c291':'#e2b5ba'}"><ellipse cy="-12" rx="10" ry="16"/><ellipse cy="12" rx="10" ry="16"/><ellipse cx="12" rx="16" ry="10"/><ellipse cx="-12" rx="16" ry="10"/></g><circle r="8" fill="#f9df98"/></g>`).join('');
    let shapes;
    if(scene==='coast') shapes = `<rect width="820" height="540" fill="#285c69"/><circle cx="615" cy="117" r="49" fill="#f9dda0"/><path d="M0 260Q150 215 330 265T820 245V540H0Z" fill="#448f94"/><path d="M0 330Q170 285 340 340T820 308V540H0Z" fill="#79b9b2"/><path d="M0 465Q200 365 410 458T820 415V540H0Z" fill="#d7c893"/><path d="M180 390L320 195L459 390Z" fill="#efdbac"/><path d="M320 195V417M229 420H450" stroke="#26454c" stroke-width="9"/><path d="M225 417Q340 466 455 417Z" fill="#315b61"/><path d="M575 359V230L600 210L625 230V359" fill="#ead8ad"/><path d="M561 359H638M570 230H630" stroke="#c4aa80" stroke-width="8"/><path d="M587 262H611V285H587Z" fill="#35676d"/><g stroke="#d1eee5" stroke-width="4" fill="none"><path d="M55 110q20 -16 40 0q20 -16 40 0"/><path d="M385 125q15 -13 30 0q15 -13 30 0"/><path d="M520 397q50 -12 95 0"/><path d="M55 362q50 -12 95 0"/></g>`;
    else if(scene==='night') shapes = `<rect width="820" height="540" fill="#263f58"/><circle cx="627" cy="105" r="49" fill="#fff0c4"/><circle cx="650" cy="90" r="43" fill="#263f58"/>${[[80,86],[167,126],[269,60],[390,143],[466,81],[732,180],[55,217],[563,185]].map(([x,y])=>`<path d="M${x-6} ${y}h12m-6 -6v12" stroke="#eadcab" stroke-width="3"/>`).join('')}<path d="M0 361Q170 217 330 357T820 337V540H0Z" fill="#375769"/><path d="M0 423Q180 325 400 412T820 390V540H0Z" fill="#557971"/><path d="M0 489Q150 412 400 492T820 440V540H0Z" fill="#284d4b"/><path d="M188 422Q400 249 627 430" stroke="#f9d595" stroke-width="3" fill="none"/>${[235,330,428,523,609].map((x,i)=>`<g transform="translate(${x} ${385-Math.sin(i/4*Math.PI)*62})"><path d="M0 -21V0" stroke="#b5bfa0" stroke-width="3"/><rect x="-14" y="0" width="28" height="35" rx="8" fill="#f8d293"/><path d="M-5 7v20m10 -20v20" stroke="#bf9367" stroke-width="2"/></g>`).join('')}<path d="M348 508V431Q402 388 457 431V508" fill="#e3c99a"/><path d="M330 431L401 375L477 431Z" fill="#b59379"/><path d="M389 465H419V510H389Z" fill="#3c6161"/>`;
    else shapes = `<rect width="820" height="540" fill="#376c64"/><circle cx="626" cy="116" r="52" fill="#f1d799"/><path d="M0 338Q160 210 345 322T820 300V540H0Z" fill="#739775"/><path d="M0 427Q185 319 399 422T820 369V540H0Z" fill="#97b084"/><path d="M0 501Q180 412 399 510T820 465V540H0Z" fill="#426e55"/><path d="M339 540L402 352L453 352L523 540Z" fill="#d3c294"/><path d="M302 412V226Q410 124 519 226V412" fill="none" stroke="#cfba91" stroke-width="15"/><path d="M321 410V232Q410 149 500 232V410" fill="none" stroke="#345e50" stroke-width="7"/><g fill="#547c59">${[[303,266],[302,347],[350,196],[452,191],[511,268],[514,340]].map(([x,y],i)=>`<ellipse cx="${x}" cy="${y}" rx="20" ry="34" transform="rotate(${i%2?35:-35} ${x} ${y})"/>`).join('')}</g><path d="M362 410V275Q409 238 459 275V410" fill="#a8b48a"/><path d="M366 323H455M409 258V410" stroke="#668c67" stroke-width="5"/><circle cx="444" cy="354" r="5" fill="#f5dc93"/>${leaves}${flowers}<g fill="#f1d799"><path d="M214 203q-20 -22 -25 -5q-4 18 25 5q21 -23 24 -6q4 17 -24 6Z"/><path d="M563 302q-17 -20 -22 -4q-3 17 22 4q18 -20 21 -5q3 15 -21 5Z"/></g>`;
    return `<svg class="scene-svg" viewBox="0 0 820 540" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${shapes}</svg><img class="scene-art" src="${escape(source)}" alt="" onload="this.previousElementSibling.setAttribute('hidden','')" onerror="this.hidden=true">`;
  }
  function chapterInfo(index) { return pack.meta.chapters[index] || pack.meta.chapters[0]; }
  function chapterProgress(index) {
    const indices = pack.levels.map((l,i)=>l.chapter===index?i:-1).filter(i=>i>=0);
    return { total:indices.length, current:indices.filter(i=>completed().includes(i)).length };
  }
  function puzzle(info, current, total, extra='') {
    const count = Math.max(1,total), cols = count<=3?count:Math.ceil(Math.sqrt(count)), rows = Math.ceil(count/cols);
    const tiles = Array.from({length:count},(_,i)=>`<i class="${i<current?'open':''}" style="${i===count-1?'grid-column:span '+(cols-(i%cols)):''}" aria-hidden="true">${i>=current?'✦':''}</i>`).join('');
    return `<div class="art-card ${extra}" role="img" aria-label="${escape(info.imageAlt||info.title)}. ${current} of ${total} pieces revealed.">${info.image?`<img src="${escape(info.image)}" alt="">`:scene(info.scene)}<div class="tile-mask" style="grid-template-columns:repeat(${cols},1fr);grid-template-rows:repeat(${rows},1fr)">${tiles}</div><div class="art-caption"><h3>${escape(info.title)}</h3><p>${total?`${current} of ${total} ${total===1?'piece':'pieces'} discovered`:'The final discovery'}</p></div></div>`;
  }
  function setScreen(name, markup, announcement) {
    cancelHolds();
    state = name; epoch++; focusIndex = 0; scanClock = 0;
    $('screen').dataset.screen = name; $('screen').innerHTML = markup;
    document.body.classList.toggle('is-playing',name==='play');
    document.body.classList.remove('is-recap','is-story');
    if(name==='play')window.scrollTo({top:0,behavior:'instant'});
    $('control-hint').textContent = 'Tap Space = next · hold Space = back · Enter = choose';
    $('header-note').textContent = pack.meta.title;
    document.body.classList.toggle('reduced-motion',prefs.reducedMotion);
    bindActions($('screen'));
    if (announcement && !(name==='play'&&['intro','reward'].includes(run?.phase))) speak(announcement);
    const renderedEpoch=epoch;
    requestAnimationFrame(()=>{if(epoch===renderedEpoch)setFocus(focusIndex,false);});
  }
  function home() {
    board=null;particles=[];impacts=[];pegDepartures=[];modal=null;$('modal-layer').hidden=true;
    run=progress().run;
    const active=run&&!run.finished;
    setScreen('home',`<section class="main-menu" aria-labelledby="menu-title"><div class="menu-copy"><h1 id="menu-title"><span>BENNY'S</span> P3GL</h1><p class="menu-subtitle">Aim. Bounce. Clear the board.</p><nav class="menu-buttons" aria-label="Main menu">${button(active?'Continue':'Play','adventure','',true)}${button('Campaigns','campaigns')}${button('Records','gallery')}${button('Settings','settings')}${button('How to play','help')}${button('Editor','editor-warning')}${button(playtest?'Return to editor':'Exit',playtest?'editor-return':'exit')}</nav></div><div class="menu-visual"><p class="menu-campaign">${escape(pack.meta.title)}<span>${active?`Stage ${run.stage+1} of ${pack.levels.length} · saved`:`${pack.levels.length} stages · ready to play`}</span></p><div class="menu-preview" role="img" aria-label="Game preview: colorful glowing pegs, a ball launcher, and a wide catching plate."><div class="menu-preview-scene" aria-hidden="true">${scene('night')}</div><canvas id="menu-preview-canvas" width="1640" height="1080" aria-hidden="true"></canvas><div class="menu-preview-glow" aria-hidden="true"></div></div><p class="menu-preview-caption">Hit the targets. Catch the ball. Keep the chain going.</p></div></section>`,'Benny’s P3GL. '+(active?'Continue.':'Play.')+' Space moves through menus. Enter chooses.');
    drawMenuPreview();
  }
  function drawMenuPreview() {
    const canvas=$('menu-preview-canvas');
    if(!canvas)return;
    const demoStages=[2,3,1,4,0,5],shotAngles=[.32,-.36,.12,-.62,.68,-.08,.46,-.5];
    let demo=new K.Board(K.builtInPack.levels[demoStages[0]],{unlimited:true,wideCatch:true});
    let demoImpacts=[],demoDepartures=[],sequenceTime=0,stageTime=0,aimTime=0,previous=0,stageIndex=0,shotIndex=0,stageShots=0;
    demo.angle=shotAngles[0];
    const nextBoard=()=>{
      demo=new K.Board(K.builtInPack.levels[demoStages[stageIndex%demoStages.length]],{unlimited:true,wideCatch:true});
      demo.angle=shotAngles[shotIndex%shotAngles.length];demoImpacts=[];demoDepartures=[];stageTime=0;aimTime=0;stageShots=0;
    };
    const render=()=>window.PeggleRenderer.draw(canvas,demo,{reducedMotion:prefs.reducedMotion,impacts:demoImpacts,pegDepartures:demoDepartures,phaseTime:sequenceTime});
    render();
    if(prefs.reducedMotion)return;
    const animate=now=>{
      if(!canvas.isConnected||state!=='home')return;
      if(document.hidden){previous=now;requestAnimationFrame(animate);return;}
      if(previous&&now-previous<32){requestAnimationFrame(animate);return;}
      const dt=Math.min(.05,previous?(now-previous)/1000:0);previous=now;sequenceTime+=dt;stageTime+=dt;
      // Play a full 45 seconds before repeating; let an active shot finish.
      // Wins move to another layout without restarting the sequence clock.
      if(sequenceTime>=45&&demo.status!=='flight'){
        sequenceTime=0;stageIndex=0;shotIndex=0;nextBoard();
      } else if(demo.status==='won'||demo.status==='lost'||(stageTime>=14&&stageShots>=3&&demo.status==='aim')){
        stageIndex++;nextBoard();
      }
      if(demo.status==='aim'){
        aimTime+=dt;
        const target=shotAngles[shotIndex%shotAngles.length];
        demo.angle=target-.18+Math.min(1,aimTime/1.1)*.18;
        if(aimTime>=1.1){demo.fire(target);aimTime=0;shotIndex++;stageShots++;}
      }
      // Recovery opens trapped paths; the model retains a final shot timeout.
      demo.update(dt);
      for(const event of demo.events.splice(0)) {
        if(event.type==='hit')demoImpacts.push({x:event.x,y:event.y,radius:13,points:event.points,color:window.PeggleRenderer.pegPalette(event.pegType).light,life:.85,maxLife:.85});
        if(event.type==='pegEject')addPegDeparture(demoDepartures,event,prefs.reducedMotion);
      }
      demoImpacts.forEach(impact=>impact.life-=dt);demoImpacts=demoImpacts.filter(impact=>impact.life>0).slice(-12);
      demoDepartures=advancePegDepartures(demoDepartures,dt,prefs.reducedMotion);
      render();requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }
  function gallery() {
    const data=records(),won=completed().length===pack.levels.length;
    const badges=[['First clear',completed().length>0,'Complete a stage'],['Bounce chain',data.bigBounce,'Collect five pegs in one shot'],['Great catcher',data.catches>=10,'Catch ten balls'],['Campaign complete',won,'Finish every stage']];
    setScreen('gallery',`<section class="simple-screen records-screen">${header('Records',pack.meta.title)}<dl class="record-stats"><div><dt>Best stage score</dt><dd>${Math.round(data.bestScore).toLocaleString()}</dd></div><div><dt>Stages cleared</dt><dd>${completed().length} / ${pack.levels.length}</dd></div><div><dt>Pegs hit</dt><dd>${data.pegs.toLocaleString()}</dd></div><div><dt>Balls caught</dt><dd>${data.catches.toLocaleString()}</dd></div></dl><div class="achievement-grid">${badges.map(([title,earned,goal])=>`<div class="achievement ${earned?'earned':''}"><span aria-hidden="true">${earned?'★':'☆'}</span><b>${escape(title)}</b><small>${earned?'Earned':escape(goal)}</small></div>`).join('')}</div><div class="back-row">${button('Main menu','home','',true)}${button(run&&!run.finished?'Continue':'Play','adventure')}</div></section>`,'Records. '+completed().length+' stages cleared. '+data.catches+' catches. Best stage score '+data.bestScore+'. '+(won?'Campaign complete.':data.bigBounce?'Bounce chain achieved.':''));
  }
  async function campaigns() {
    let entries=[{pack:K.builtInPack,label:K.builtInPack.meta.title,sub:K.builtInPack.levels.length+' stages · Limited shots'}];
    const custom=read(CUSTOM);
    if(custom) { try { const p=K.validatePack(custom); entries.push({pack:p,label:p.meta.title,sub:'Your saved campaign · '+p.levels.length+' stages'}); } catch {} }
    const library=read(LIBRARY);
    if(Array.isArray(library))for(const raw of library){try{const p=K.validatePack(raw);if(!entries.some(e=>identity(e.pack)===identity(p)))entries.push({pack:p,label:p.meta.title,sub:'Saved campaign · '+p.levels.length+' stages'});}catch{}}
    const covers=['forest','harbor','galaxy'];
    const cardBody = ({title,description,source,total,mode,kind,original=false}, campaign) => {
      const summary=description.length>150?description.slice(0,147).replace(/\s+\S*$/,'')+'…':description;
      const normalized=campaign?K.validatePack(campaign):null;
      const saved=normalized?(profile.campaigns[identity(normalized)]||(kind!=='Your campaign'?priorBundledPacks(normalized,original).map(previous=>profile.campaigns[identity(previous)]).find(Boolean):null)):null;
      const cleared=new Set((saved?.completed||[]).filter(index=>Number.isInteger(index)&&index>=0&&index<total)).size;
      const active=saved?.run&&!saved.run.finished;
      const status=active?`Continue · Stage ${Math.min(total,saved.run.stage+1)}`:cleared===total?'Continue or restart':'Choose this campaign';
      return `<span class="campaign-cover" aria-hidden="true"><img src="${escape(source)}" alt=""><span class="campaign-kind">${escape(kind)}</span></span><span class="campaign-copy"><strong class="campaign-title">${escape(title)}</strong>${cleared===total?'<span class="campaign-complete-check"><span aria-hidden="true">✓</span> Completed</span>':''}<span class="campaign-description">${escape(summary)}</span><span class="campaign-meta">${total} stages · ${mode==='free'?'Unlimited shots':'Limited shots'}</span><span class="campaign-progress"><span>${escape(status)}</span><span aria-hidden="true">↗</span></span>${cleared?`<span class="campaign-clear-count">${cleared} of ${total} stages cleared</span><span class="campaign-progress-track" aria-hidden="true"><span style="width:${cleared/total*100}%"></span></span>`:''}</span>`;
    };
    const card = (details,action,campaign) => `<button class="button campaign-card" data-action="${escape(action)}">${cardBody(details,campaign)}</button>`;
    const storyDetails=storyCampaigns.map((entry,i)=>({title:entry.title,description:entry.description,source:K.backgroundInfo(entry.cover||covers[i]).src,total:entry.total||20,mode:i===2?'free':'adventure',kind:'Story campaign'}));
    const savedCards=entries.map((entry,i)=>{
      const first=entry.pack.levels[0],chapter=entry.pack.meta.chapters[first.chapter||0]||entry.pack.meta;
      const source=first.image||(!first.scene&&chapter.image)||K.backgroundInfo(first.scene||chapter.scene||entry.pack.meta.scene).src;
      return card({title:entry.label,description:i===0?'A short journey through the secret garden.':entry.pack.meta.story||'A campaign made in the visual editor.',source,total:entry.pack.levels.length,mode:entry.pack.meta.mode,kind:i===0?'Classic campaign':'Your campaign'},'pack-'+i,entry.pack);
    });
    const originalDetails={title:'Original Benny’s Campaign',description:'The original peg layouts, with a bouncing base plate.',source:K.backgroundInfo('coast').src,total:20,mode:'adventure',kind:'Classic campaign',original:true};
    setScreen('campaigns',`<section class="campaign-screen" aria-labelledby="campaign-heading"><div class="campaign-heading"><div class="eyebrow">Pick your next adventure</div><h1 id="campaign-heading">Campaigns</h1><p>Choose a world. Your progress saves as you play.</p></div><div class="campaign-grid" role="group" aria-label="Campaigns">${storyCampaigns.map((entry,i)=>card(storyDetails[i],'story-'+entry.id)).join('')}${savedCards.join('')}${card(originalDetails,'legacy-pack')}</div><div class="back-row campaign-footer">${button('Main menu','home')}${button('Import campaign','import-warning','Open a JSON file')}</div></section>`,'Choose a campaign. Space moves through the campaign cards. Enter opens the selected campaign.');
    window.PeggleApp.packEntries=entries;
    const galleryEpoch=epoch;
    const previews=await Promise.allSettled([...storyCampaigns.map(loadStoryCampaign),fetch('levels/Bennys_Campaign.json').then(response=>{if(!response.ok)throw Error('Campaign preview unavailable');return response.json();}).then(raw=>K.validatePack(raw))]);
    if(state!=='campaigns'||epoch!==galleryEpoch)return;
    previews.forEach((result,i)=>{
      if(result.status!=='fulfilled')return;
      const action=i<storyCampaigns.length?'story-'+storyCampaigns[i].id:'legacy-pack';
      const target=$('screen').querySelector(`[data-action="${action}"]`);
      // Keep the actual button in place so loading progress never moves switch focus.
      if(target)target.innerHTML=cardBody(i<storyDetails.length?storyDetails[i]:originalDetails,result.value);
    });
  }
  function help() {
    const back=board?'pause':'home';
    const controls=`<div class="help-lines"><p><b>Choose, then aim:</b> first choose Take shot or Options. Tap Space to move between actions; release Enter to choose. Take shot opens aiming without firing and hides the buttons. Hold Space to move the aimer and release to stop. Each new press reverses direction; a short press nudges the aim. Release Enter to shoot.</p><p><b>Mouse or touch:</b> choose Take shot first. Move the mouse or drag on the board to aim, then click or tap to shoot. Releasing a drag keeps the aim ready. The bright line shows your first hit; dots preview the bounce.</p><p><b>Options:</b> choose Options between shots. Hold Enter while aiming to return to Take shot and Options without firing. During a shot, press and release Enter to pause. Holding Enter from the shot choices also pauses.</p><p><b>One switch:</b> turn Auto Scan on in Settings. It cycles Take shot and Options before each shot. Once you choose Take shot, the buttons disappear and the aimer oscillates. Press Enter to stop, then release to shoot directly. Hold Enter to return to the choices. With Auto Scan off, the aimer moves only when you move it. Voice and scanning settings are shared with Benny’s Hub.</p></div>`;
    const cards=pegGuide.map(peg=>`<button class="button peg-guide-card" data-peg="${peg.type}" data-action="guide-${peg.type}"><canvas class="guide-peg-icon" data-peg-icon="${peg.type}" width="140" height="140" aria-hidden="true"></canvas><span><strong>${escape(pegName(peg))}</strong> <span class="peg-guide-look">${escape(peg.look)}</span> <span class="peg-guide-description">${escape(peg.description)}</span></span></button>`).join('');
    const powerCards=chargeGuide.map(peg=>`<button class="button peg-guide-card" data-peg="POWER" data-power="${peg.power}" data-action="guide-power-${peg.power}"><canvas class="guide-peg-icon" data-peg-icon="POWER" data-power-icon="${peg.power}" width="140" height="140" aria-hidden="true"></canvas><span><strong>${escape(pegName(peg))}</strong> <span class="peg-guide-look">${escape(peg.look)}</span> <span class="peg-guide-description">${escape(peg.description)}</span></span></button>`).join('');
    const notes=button('The moving base plate','guide-plate','Catch returns a shot. Bounce sends the ball back up. A timed plate switches between the two; its symbol and countdown show what comes next.')+button('After a hit','guide-hits','Hit pegs crumble into smaller fragments and disappear. As they crumble, their bounce surface gets smaller too. A campaign can make selected pegs break immediately instead. Stone blocks stay solid. Each peg scores once.')+button('Your campaign goal','guide-goals','Read or hear the story before each stage. Each campaign chooses its objectives, shot limits, and automatic powers. Bright gold outlines mark sun targets; purple outlines mark gems. Clear and score goals outline all remaining pegs that count, while stone blocks stay unmarked. Highlights disappear as pegs are collected. Clear stages, build peg chains, and catch balls to earn achievements.');
    setScreen('help',`<section class="guide-screen">${header('How to play','Choose. Aim. Shoot.','The same controls in every campaign. Choose any guide entry to hear it.')}${controls}<div class="back-row">${button('Read the controls','guide-controls')}</div><h2 class="guide-heading">Meet the pegs</h2><div class="peg-guide-grid">${cards}</div>${powerCards?`<h2 class="guide-heading">Charge your next shot</h2><p class="guide-power-intro">Hit a hexagon power peg to save a charge for the next shot. Different powers fire together automatically. One charge of each power is used per shot; spare charges stay ready for later shots. Names, symbols, and the NEXT SHOT display show what you have collected.</p><div class="peg-guide-grid power-guide-grid">${powerCards}</div>`:''}<div class="guide-notes">${notes}</div><div class="back-row">${button('Back',back)}</div></section>`,'How to play. Tap Space to move through the guide. Enter reads an entry. Choose Take shot before aiming and firing.');
    document.querySelectorAll('[data-peg-icon]').forEach(canvas=>window.PeggleRenderer.drawPegIcon(canvas,canvas.dataset.pegIcon,canvas.dataset.powerIcon));
  }
  function settingsScreen(origin) {
    if(origin)settingsReturn=origin;
    const voice=window.NarbeVoiceManager;
    settings=window.NarbeScanManager.getSettings();
    setScreen('settings',header('Access settings','Play at your pace.','Voice and scanning settings are shared with Benny’s Hub.')+`<div class="settings-list">${settingButton('Text to speech',voice?.getSettings().ttsEnabled?'On':'Off','tts')}${settingButton('Voice',voice?.getVoiceDisplayName(voice.getCurrentVoice())||'Default','voice')}${settingButton('Aim speed',['Super slow','Slow','Steady','Quick'][prefs.aimSpeed],'aim-speed')}${settingButton('Auto Scan',settings.autoScan?'On · One switch':'Off · Two switches','auto-scan')}${settingButton('Scan speed',scanSpeedLabel(),'scan-speed')}${settingButton('Sound effects',prefs.sound?'On':'Off','sound')}${settingButton('Reduced motion',prefs.reducedMotion?'On':'Off','motion')}${settingButton('Reset all campaigns','Confirm first','reset-warning')}${button('Back','settings-back')}</div>`,'Settings. Voice and scanning are shared with Benny’s Hub. Changes are saved.');
  }
  function scanSpeedLabel() {const seconds=settings.scanInterval/1000;return seconds+(seconds===1?' second':' seconds');}
  function refreshSharedSettings() {
    if(state!=='settings')return;
    const voice=window.NarbeVoiceManager;
    const values={'auto-scan':settings.autoScan?'On · One switch':'Off · Two switches','scan-speed':scanSpeedLabel(),tts:voice?.getSettings().ttsEnabled?'On':'Off',voice:voice?.getVoiceDisplayName(voice.getCurrentVoice())||'Default'};
    for(const[action,value]of Object.entries(values)){const label=$('screen').querySelector(`[data-action="${action}"] .setting-value`);if(label)label.textContent=value;}
  }
  function settingButton(label,value,action) { return `<button class="button" data-action="${action}"><span>${escape(label)}</span><span class="setting-value">${escape(value)}</span></button>`; }
  function startAdventure() {
    run=progress().run;
    if(!run){run={stage:0,score:0,finished:false,phase:'intro',shotPhase:'choice',snapshot:null};progress().run=run;persist();}
    if(run.finished||run.phase==='finished')return finish();
    if(run.phase==='reward')return reward();
    if(run.phase==='intro')return intro();
    loadStage(true);
  }
  function campaignChoice() {
    closeModal();board=null;particles=[];impacts=[];pegDepartures=[];run=progress().run;
    const saved=run&&!run.finished,complete=completed().length===pack.levels.length;
    const detail=saved?`Resume stage ${Math.min(pack.levels.length,run.stage+1)} exactly where you left off.`:complete?'Open your completed campaign.':'Start at stage 1.';
    setScreen('campaign-choice',`<section class="simple-screen campaign-choice-screen">${header('Campaign',pack.meta.title)}${complete?'<p class="campaign-complete-check"><span aria-hidden="true">✓</span> Completed</p>':''}<div class="campaign-choice-actions">${button('Continue','campaign-continue',detail,true)}${button('Restart','campaign-restart','Erase only this campaign’s progress and records, then start at stage 1.')}${button('Back to campaigns','campaigns')}</div></section>`,pack.meta.title+'. Continue. '+detail+' Restart erases only this campaign’s progress and records and starts at stage 1.');
  }
  function restartCampaign() {
    closeModal();profile.campaigns[packId]={completed:[],run:null};run=null;board=null;particles=[];impacts=[];pegDepartures=[];persist();startAdventure();
  }
  function intro() {
    const level=pack.levels[run.stage];
    closeModal();
    board=K.createBoard(clone(level),stageOptions());shotPhase='choice';pointerAim=false;pendingWin=false;recapVisualTime=0;toast='';
    particles=[];impacts=[];pegDepartures=[];shotFeedback='';delete run.lastShotReport;run.phase='intro';run.shotPhase='choice';run.snapshot=null;progress().run=run;persist();
    const builtIn=identity(pack)===identity(K.validatePack(K.builtInPack));
    const mission=builtIn?'Clear six stages. Hit the targets, collect gems, and build your score.':pack.meta.story||'Clear each stage’s goal and build your score.';
    const item=pack.meta.startItem?K.powerName(pack.meta,pack.meta.startItem):'';
    const goal=level.objective==='score'?`Score ${level.goal.toLocaleString()} points`:level.objective==='gems'?`Collect ${level.goal} gems`:level.objective==='targets'?'Hit every sun target':'Clear every breakable peg';
    const shots=stageOptions().unlimited?'Unlimited shots':level.shots+(stageOptions().bonusShots||0)+' shots';
    const plate=plateDescription(level);
    const chargePowers=[...new Set(level.pegs.filter(peg=>peg.type==='POWER').map(peg=>peg.power))];
    const charges=chargePowers.length?'Charge pegs: '+powerSummary(chargePowers).join(', ')+'. Hit one to power your next shot.':'';
    // Preview the actual upcoming board without playing or saving a shot.
    renderPlay();state='intro';$('screen').dataset.screen='intro';document.body.classList.add('is-story');
    const items=[{label:'Start stage',action:'begin-stage',primary:true},{label:'Main menu',action:'home'}];
    cancelHolds();modal={kind:'story',items};epoch++;focusIndex=0;scanClock=0;
    $('modal-layer').hidden=false;
    $('modal-layer').innerHTML=`<div class="modal-backdrop story-backdrop"><section class="modal-panel story-panel" role="dialog" aria-modal="true" aria-labelledby="dialog-title" aria-describedby="dialog-text story-goal"><div class="eyebrow">${escape(pack.meta.title)} · Stage ${run.stage+1}</div><h2 id="dialog-title">${escape(level.title)}</h2><div id="dialog-text">${run.stage===0&&level.story?`<p class="story-mission">${escape(mission)}</p>`:''}<p class="stage-story">${escape(level.story||mission)}</p></div><div class="story-objective"><p id="story-goal" class="stage-goal">${escape(goal)}</p><p class="story-shots">${escape(shots)}${item?` · ${escape(item)}`:''}</p>${plate?`<p class="stage-plate-note">${escape(plate)}</p>`:''}${charges?`<p class="stage-charge-note">${escape(charges)}</p>`:''}</div><div class="modal-actions">${items.map(item=>button(item.label,item.action,'',item.primary)).join('')}</div></section></div>`;
    bindActions($('modal-layer'));setFocus(0,false);$('screen').inert=true;$('screen').setAttribute('aria-hidden','true');
    speak('Stage '+(run.stage+1)+'. '+level.title+'. '+(run.stage===0?mission+' ':'')+(level.story?level.story+' ':'')+goal+'. '+shots+'. '+(item?item+' is active. ':'')+(plate?plate+' ':'')+(charges?charges+' ':'')+'Choose Start stage to play.');
  }
  function plateDescription(level) {
    if(level.catcher?.behavior==='bounce')return 'The base plate bounces balls back into play.';
    if(level.catcher?.behavior==='alternate') {
      const interval=level.catcher.interval||3;
      return `The base plate alternates catch and bounce every ${interval} ${interval===1?'second':'seconds'}.`;
    }
    return '';
  }
  function stageOptions() {
    return {unlimited:pack.meta.mode==='free'||!!run?.unlimitedHelp,wideCatch:pack.meta.startItem==='wideCatch',magnet:pack.meta.startItem==='magnet',blast:pack.meta.startItem==='blast',bonusShots:pack.meta.startItem==='bonusShots'?3:0};
  }
  function loadStage(resume=false) {
    const level=clone(pack.levels[run.stage]);
    board=K.createBoard(level,stageOptions());
    if(resume&&run.snapshot){try{board.restore(run.snapshot);}catch{run.snapshot=null;}}
    board.options=stageOptions();
    board.configureCatcher();
    shotPhase=board.status==='flight'?'flight':resume&&run.shotPhase==='aiming'?'aiming':'choice';run.shotPhase=shotPhase;
    pointerAim=false;pendingWin=false;recapVisualTime=0;particles=[];impacts=[];pegDepartures=[];toast='';shotFeedback='';if(!resume)delete run.lastShotReport;run.phase='play';
    renderPlay();saveRun();
  }
  function renderPlay() {
    const stage=run.stage,level=pack.levels[stage],title=level.title,chapter=chapterInfo(level.chapter),background=K.backgroundInfo(level.scene||chapter.scene);
    const backgroundMarkup=scene(background.id,level.image||(!level.scene?chapter.image:''));
    const sceneVariant=pack.levels.slice(0,stage).filter(previous=>previous.chapter===level.chapter).length%3;
    const plate=plateDescription(level),plateSpeech=plate?plate+(level.catcher.behavior==='alternate'?` ${board.catcher.mode==='bounce'?'Bounce':'Catch'} mode is active.`:'')+' ':'';
    setScreen('play',`<section class="fullscreen-play" data-theme="${escape(background.theme)}" data-background="${escape(background.id)}" data-variant="${sceneVariant}" data-shot-phase="${shotPhase}" aria-label="${escape(title)}">
      <div class="arcade-backdrop">${backgroundMarkup}</div>
      <div class="fullscreen-board-area"><div class="board-frame">${backgroundMarkup}${ambientScene()}
        <canvas id="board" width="820" height="540" role="img" aria-label="Peg board. Choose Take shot before aiming or firing."></canvas>
        <canvas id="objective-highlights" class="objective-highlights" width="820" height="540" aria-hidden="true"></canvas>
        <div class="arcade-hud"><div class="hud-goal"><div class="eyebrow">Stage ${stage+1} · ${escape(title)}</div><div id="objective-title"></div><div class="progress-track"><span id="objective-bar"></span></div><div id="objective-count"></div></div><div class="hud-shots"><span class="hud-shots-label">SHOTS</span><strong id="shots-count"></strong><p id="shots-note"></p><div class="hud-score"><span>SCORE</span> <strong id="score-count"></strong></div></div></div>
        <div class="arcade-shot-status" aria-label="Shot powers and result"><div id="power-hud" class="power-hud" hidden><div class="power-status-row"><strong id="power-hud-label">NEXT SHOT</strong><div id="power-hud-charges" class="power-charges"></div></div><p id="power-hud-description"></p></div><div id="shot-summary" class="shot-summary" hidden></div></div>
      </div></div>
      <div class="arcade-controls" role="group" aria-label="Shot actions" aria-describedby="arcade-hint">
        <button id="fire-button" class="button primary take-shot" data-action="take-shot">Take shot</button>
        <button id="pause-button" class="button options-control" data-action="pause">Options</button>
      </div>
      <div class="sr-only"><span id="arcade-hint"></span></div>
    </section>`,objectiveNames[level.objective]+'. '+plateSpeech+shotInstructions());
    updateHUD();resizeCanvas();
    bindBoardPointer($('board'));drawBoard();
  }
  function ambientScene() {
    const motes=[[8,35],[22,64],[38,29],[53,82],[67,48],[80,72],[92,31],[12,86]];
    return `<div class="ambient-world" aria-hidden="true"><i class="ambient-light"></i><i class="ambient-cloud ambient-cloud-back"></i><i class="ambient-cloud ambient-cloud-front"></i><i class="ambient-water ambient-water-back"></i><i class="ambient-water ambient-water-front"></i>${motes.map(([x,y],index)=>`<i class="ambient-mote" style="--mote-x:${x}%;--mote-y:${y}%;--mote-duration:${14+index*2}s;--mote-delay:-${index*3}s;--mote-size:${index%3+3}px"></i>`).join('')}</div>`;
  }
  function bindBoardPointer(canvas) {
    const canAim=()=>state==='play'&&board?.status==='aim'&&shotPhase==='aiming'&&!modal;
    const aimAt=e=>{
      if(!canAim())return;
      const rect=canvas.getBoundingClientRect(),x=(e.clientX-rect.left)*K.W/rect.width,y=(e.clientY-rect.top)*K.H/rect.height;
      board.angle=Math.max(-1.4,Math.min(1.4,Math.atan2(x-410,Math.max(10,y-52))));
      pointerAim=true;
    };
    canvas.addEventListener('pointerdown',e=>{
      pendingPointerClick=null;
      if(e.isPrimary===false){if(pointerGesture)pointerGesture.moved=true;return;}
      if(e.button!==0||!canAim())return;
      pointerGesture={id:e.pointerId,x:e.clientX,y:e.clientY,moved:false,epoch,board};
      aimAt(e);
      try {canvas.setPointerCapture?.(e.pointerId);} catch { /* Synthetic assistive input has no native pointer to capture. */ }
    });
    canvas.addEventListener('pointermove',e=>{
      if(e.isPrimary===false)return;
      if(pointerGesture&&pointerGesture.id===e.pointerId&&Math.hypot(e.clientX-pointerGesture.x,e.clientY-pointerGesture.y)>8)pointerGesture.moved=true;
      if(e.pointerType!=='touch'||pointerGesture?.id===e.pointerId)aimAt(e);
    });
    canvas.addEventListener('pointerup',e=>{
      const gesture=pointerGesture;if(!gesture||gesture.id!==e.pointerId)return;
      const rect=canvas.getBoundingClientRect();
      const inside=e.clientX>=rect.left&&e.clientX<=rect.right&&e.clientY>=rect.top&&e.clientY<=rect.bottom;
      const moved=gesture.moved||Math.hypot(e.clientX-gesture.x,e.clientY-gesture.y)>8;
      pendingPointerClick={...gesture,moved:moved||!inside};pointerGesture=null;
      if(inside)aimAt(e);
      if(moved&&canAim()){saveRun();toastMessage('Aim set. Click or tap to shoot.');}
      else if(inside&&e.pointerType==='touch'&&gesture.epoch===epoch&&gesture.board===board&&canAim()) {
        // Browsers can suppress the compatibility click after a touch drag.
        // A fresh, stationary touch tap fires once; a drag only sets the aim.
        shoot();pendingPointerClick={...gesture,moved:true};
      }
    });
    canvas.addEventListener('pointercancel',()=>{pointerGesture=null;pendingPointerClick={moved:true};});
    canvas.addEventListener('click',e=>{
      const gesture=pendingPointerClick;pendingPointerClick=null;
      if(e.button!==0||!canAim())return;
      if(gesture&&(gesture.moved||gesture.epoch!==epoch||gesture.board!==board))return;
      // Native clicks follow a completed pointer gesture. Programmatic clicks also
      // support assistive technologies that activate without pointer events.
      if(!gesture&&e.detail>0)return;
      if(e.detail>0)aimAt(e);
      shoot();
    });
  }
  function updateHUD() {
    if(!board||!$('shots-count'))return;
    const p=board.objectiveProgress();
    $('objective-title').textContent=objectiveNames[board.level.objective];
    $('objective-count').textContent=`${Math.min(p.current,p.total)} of ${p.total} ${p.label}`;
    $('objective-bar').style.width=Math.min(100,p.current/Math.max(1,p.total)*100)+'%';
    $('shots-count').textContent=board.options.unlimited?'∞':board.shots;
    const plateMode=board.catcher.mode==='bounce'?'Bounce':'Catch';
    $('shots-note').textContent=board.catcher.behavior==='alternate'?`${plateMode} plate · ${plateMode==='Catch'?'bounce':'catch'} in ${Math.max(0,Math.ceil(Number(board.catcher.switchIn)||0))}s`:`${plateMode} plate · ${plateMode==='Catch'?'returns balls':'keeps the ball in play'}`;
    $('score-count').textContent=Math.round(board.score).toLocaleString();
    updatePowerHUD();
    const choicesAvailable=shotPhase==='choice'&&board.status==='aim'&&run.phase==='play';
    $('fire-button').disabled=!choicesAvailable;
    $('fire-button').hidden=!choicesAvailable;
    $('pause-button').disabled=!choicesAvailable;
    $('pause-button').hidden=!choicesAvailable;
    $('screen').querySelector('.arcade-controls').hidden=!choicesAvailable;
    $('screen').querySelector('.fullscreen-play').dataset.shotPhase=run.phase==='intro'?'story':shotPhase;
    $('board').setAttribute('aria-label',shotPhase==='choice'?'Peg board. Choose Take shot to begin aiming. Board clicks do not fire yet.':shotPhase==='aiming'?`Aim your shot. ${settings.autoScan?'The aimer oscillates automatically.':'Hold Space or move the pointer to aim.'} Release Enter, click or tap to shoot. Hold Enter to return to Take shot and Options.`:'Ball in flight. Press and release Enter to pause.');
    $('arcade-hint').textContent=shotPhase==='aiming'?(settings.autoScan?'Auto Scan aims · release Enter = shoot · hold Enter = back':'Hold Space = aim · release Enter = shoot · hold Enter = back'):shotPhase==='flight'?'Ball in play · Enter = pause':settings.autoScan?'Auto Scan on · Enter = choose':'Tap Space = next · Enter = choose';
    $('hold-indicator').querySelector('b').textContent=shotPhase==='aiming'?'Keep holding to return':'Keep holding to pause';
  }
  function shotInstructions() {
    if(shotPhase==='flight')return 'Your saved shot is in flight. Press and release Enter to pause.';
    if(shotPhase==='aiming')return settings.autoScan?'Aiming. Auto Scan oscillates the aimer. Press Enter to stop, then release to shoot. Hold Enter to return to Take shot and Options.':'Aiming. Hold Space or move the pointer to aim. Release Enter, click or tap to shoot. Hold Enter to return to Take shot and Options.';
    return 'Choose Take shot to begin aiming, or Options. Tap Space to move and release Enter to choose.'+(settings.autoScan?' Auto Scan is on.':'');
  }
  function updatePowerHUD() {
    const flight=board.status==='flight',active=flight&&!!board.activePowers?.length,powers=active?board.activePowers||[]:board.pendingPowers||[];
    const counts=new Map();for(const id of powers)counts.set(id,(counts.get(id)||0)+1);
    const hud=$('power-hud'),chips=$('power-hud-charges');
    if(!hud||!chips)return;
    const topHUD=$('screen').querySelector('.arcade-hud'),status=hud.parentElement;
    const statusTop=(topHUD.offsetTop+topHUD.offsetHeight+6)+'px';
    if(status.style.getPropertyValue('--shot-status-top')!==statusTop)status.style.setProperty('--shot-status-top',statusTop);
    const hasChargePegs=board.pegs.some(peg=>peg.type==='POWER'&&!peg.hit);
    hud.hidden=!counts.size&&!hasChargePegs;
    $('power-hud-label').textContent=active?'ACTIVE':'NEXT SHOT';
    const signature=JSON.stringify([active,[...counts],pack.meta.powerNames]);
    if(chips.dataset.signature!==signature) {
      chips.dataset.signature=signature;
      chips.innerHTML=[...counts].map(([id,count])=>{
        const entry=K.BALL_POWERS?.[id]||{},name=ballPowerName(id),description=entry.description||chargeBriefs[id];
        return '<span class="power-charge" data-ball-power="'+escape(id)+'" title="'+escape(description)+'" aria-label="'+escape(name+(count>1?', '+count+' charges':'')+'. '+description)+'"><canvas class="power-charge-symbol" data-charge-icon="'+escape(id)+'" width="140" height="140" aria-hidden="true"></canvas> <span class="power-charge-name">'+escape(name)+'</span>'+(count>1?' <b class="power-charge-count">×'+count+'</b>':'')+'</span>';
      }).join('');
      chips.querySelectorAll('[data-charge-icon]').forEach(canvas=>window.PeggleRenderer.drawPegIcon(canvas,'POWER',canvas.dataset.chargeIcon));
    }
    $('power-hud-description').textContent=counts.size
      ? (counts.size<=2?[...counts].map(([id])=>chargeBriefs[id]).join(' '):'These powers fire together.')+(active&&board.pendingPowers?.length?' Next shot: '+powerSummary(board.pendingPowers).join(', ')+'.':!active&&powers.length>counts.size?' Spare charges stay ready.':'')
      : active&&board.pendingPowers?.length?'Next shot: '+powerSummary(board.pendingPowers).join(', '):active?'Hit a power peg to charge your next shot.':'Hit a hexagon peg to charge your next shot.';
    const report=$('shot-summary');
    const text=flight&&board.shotHits>0
      ? board.shotHits+' '+(board.shotHits===1?'peg':'pegs')+' · '+Math.round(board.shotScore||0).toLocaleString()+' shot points'+(shotFeedback?' · '+shotFeedback:'')
      : !active&&run.lastShotReport ? run.lastShotReport : shotFeedback;
    report.textContent=text||'';report.hidden=!text;
  }
  function changeShotPhase(next,announce=true,preservePauseHold=false) {
    const pauseHold=preservePauseHold&&held.enter?.action==='pause'&&held.enter.epoch===epoch?held.enter:null;
    // A pause press begun during flight retains its original action and timer
    // when the ball settles. It must never turn into a Take shot activation.
    if(pauseHold)held.enter=null;
    cancelHolds();epoch++;shotPhase=next;if(run)run.shotPhase=next;pointerAim=false;scanClock=0;
    if(pauseHold){pauseHold.epoch=epoch;held.enter=pauseHold;}
    updateHUD();setFocus(pauseHold?1:0,false);drawBoard();saveRun();if(announce)speak(shotInstructions());
  }
  function beginAiming() {
    if(state!=='play'||!board||board.status!=='aim'||shotPhase!=='choice'||modal)return;
    changeShotPhase('aiming');
  }
  function cancelAiming() {
    if(state!=='play'||shotPhase!=='aiming'||board?.status!=='aim'||modal)return;
    changeShotPhase('choice');
  }
  function shoot() {
    if(state!=='play'||!board||board.status!=='aim'||shotPhase!=='aiming'||modal)return;
    shotFeedback='';board.fire(board.angle);changeShotPhase('flight',false);sound('select');
  }
  function toastMessage(text) {
    toast=text;toastUntil=performance.now()+4200;
    if($('board-toast')){$('board-toast').textContent=text;$('board-toast').hidden=false;}
  }
  function saveRun() {
    if(playtest||!run||!board)return;
    if(run.phase==='play'&&(state==='play'||modal||state==='settings'||state==='help')) {run.snapshot=board.serialize();run.shotPhase=board.status==='flight'?'flight':shotPhase;}
    progress().run=run;persist();
  }
  function reward() {
    const level=pack.levels[run.stage],last=run.stage===pack.levels.length-1;
    // New saves keep the exact final board. Older results had no board snapshot;
    // show their cleared layout without replaying a shot or awarding points.
    if(!board||board.status!=='won') {
      board=K.createBoard(level,stageOptions());
      let restored=false;
      if(run.snapshot?.status==='won')try{board.restore(run.snapshot);restored=true;}catch{}
      if(!restored) {
        board.pegs=board.pegs.filter(peg=>peg.type==='BLOCK');board.balls=[];board.status='won';
        board.score=run.lastScore||0;board.hits=run.lastPegs||0;board.shotHits=run.lastChain||0;
        if(level.objective==='gems')board.gems=level.goal;
        if(level.objective==='targets')board.targets=0;
        if(level.objective==='clear')board.hits=level.goal;
      }
      particles=[];impacts=[];pegDepartures=[];
    }
    pendingWin=true;shotPhase='complete';recapVisualTime=Math.min(3,Math.max(0,Number(run.recapVisualTime)||0));
    run.lastPegs=board.hits;run.lastChain=board.shotHits;run.snapshot=board.serialize();persist();
    if(!$('board'))renderPlay();
    updateHUD();drawBoard();
    state='reward';$('screen').dataset.screen='reward';document.body.classList.add('is-playing','is-recap');
    const points=Math.round(run.lastScore||0),chain=run.lastChain||0;
    const items=[{label:last?'Finish campaign':'Next stage',action:last?'finale':'next-stage',primary:true},{label:'Main menu',action:'home'},...(playtest?[{label:'Return to builder',action:'editor-return'}]:[])];
    cancelHolds();modal={kind:'recap',items};epoch++;focusIndex=0;scanClock=0;
    $('modal-layer').hidden=false;
    $('modal-layer').innerHTML=`<div class="modal-backdrop recap-backdrop"><section class="modal-panel recap-panel" role="dialog" aria-modal="true" aria-labelledby="dialog-title" aria-describedby="dialog-text"><div class="recap-medal" aria-hidden="true">★</div><div class="eyebrow">Stage ${run.stage+1} complete</div><h2 id="dialog-title">Stage cleared!</h2><p id="dialog-text">${escape(level.title)}</p><div class="recap-score"><strong id="recap-score">${points.toLocaleString()}</strong><span>stage points</span></div><div class="recap-stats"><span><b>${run.lastPegs}</b> pegs hit</span><span><b>${chain}</b> in the final shot</span></div>${chain>=5?'<p class="recap-achievement">★ Bounce chain achieved</p>':''}<p class="recap-total">Campaign score <strong id="recap-campaign-score">${Math.round(run.score||0).toLocaleString()}</strong></p><div class="modal-actions">${items.map(item=>button(item.label,item.action,'',item.primary)).join('')}</div></section></div>`;
    bindActions($('modal-layer'));setFocus(0,false);
    $('screen').inert=true;$('screen').setAttribute('aria-hidden','true');
    speak('Stage cleared. '+points+' points. '+run.lastPegs+' pegs hit. '+(chain>=5?'Bounce chain achieved. ':'')+(last?'Choose Finish campaign.':'Choose Next stage.'));
  }
  function nextStage() {
    closeModal();
    run.stage++;run.snapshot=null;run.phase='intro';run.shotPhase='choice';progress().run=run;persist();intro();
  }
  function finish() {
    closeModal();
    run.finished=true;run.phase='finished';run.snapshot=null;progress().run=run;persist();
    const points=Math.round(run.score||0),ending=pack.levels.some(level=>level.story&&(level.scene||level.image))?pack.meta.finale?.story||'':'';
    setScreen('finale',`<section class="simple-screen result-screen">${header('All '+pack.levels.length+' stages cleared','Campaign complete!',pack.meta.title)}<div class="result-score"><span>Final score</span><strong>${points.toLocaleString()}</strong><span>points</span></div><p class="result-achievement">★ Campaign complete achievement earned</p>${ending?`<div class="story-beat"><h2>${escape(pack.meta.finale.title||'Journey complete')}</h2><p>${escape(ending)}</p></div>`:''}<div class="back-row">${button('Play again','new-adventure','',true)}${button('Main menu','home')}${button('Records','gallery')}</div></section>`,'Campaign complete. '+ending+' '+points+' points. Choose Play again or Main menu.');sound('win');
  }
  function onWin() {
    if(pendingWin)return;pendingWin=true;
    const list=completed();if(!list.includes(run.stage))list.push(run.stage);
    progress().completed=list;
    records().bestScore=Math.max(records().bestScore,Math.round(board.score));
    if(board.shotHits>=5)records().bigBounce=true;
    run.lastScore=board.score;run.score=(run.score||0)+board.score;run.snapshot=board.serialize();run.recapVisualTime=0;run.phase='reward';
    progress().run=run;persist();reward();sound('win');
  }
  function lost() {
    openModal('Out of shots', 'Restart this stage, or continue with unlimited shots.', [
      {label:'Continue with unlimited shots',action:'continue-unlimited',primary:true},
      {label:'Try the stage again',action:'retry'}, {label:'Main menu',action:'home'}
    ],'outcome'); sound('lose');
  }
  function openModal(title,text,items,kind='menu') {
    cancelHolds();
    modal={kind,items};epoch++;focusIndex=0;scanClock=0;
    $('modal-layer').hidden=false;
    $('modal-layer').innerHTML=`<div class="modal-backdrop"><section class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="dialog-title" aria-describedby="dialog-text"><div class="eyebrow">${kind==='warning'?'Before you continue':'Take your time'}</div><h2 id="dialog-title">${escape(title)}</h2><p id="dialog-text">${escape(text)}</p><div class="modal-actions">${items.map(item=>button(item.label,item.action,item.sub||'',item.primary)).join('')}</div></section></div>`;
    bindActions($('modal-layer'));speak(title+'. '+text);setFocus(0,false);
  }
  function closeModal() {
    cancelHolds();modal=null;$('modal-layer').hidden=true;
    $('screen').inert=false;$('screen').removeAttribute('aria-hidden');document.body.classList.remove('is-recap','is-story');
    epoch++;focusIndex=0;scanClock=0;setFocus(0,false);
  }
  function pause() {
    if(!board) return home();
    saveRun();
    openModal('Options','Game paused. Your progress is saved.',[
      {label:'Continue playing',action:'resume',primary:true},...(shotPhase==='aiming'?[{label:'Back to shot choices',action:'cancel-aim'}]:[]),{label:'Restart this stage',action:'restart-warning'},
      {label:'Settings',action:'pause-settings'},{label:'How to play',action:'pause-help'},
      {label:'Read the board',action:'pause-read-board'},
      {label:'Main menu',action:'home'},{label:playtest?'Return to builder':'Exit game',action:playtest?'editor-return':'exit'}
    ],'pause');
  }

  function readBoard() {
    const p=board.objectiveProgress();
    const left=board.pegs.filter(p=>!p.hit&&p.x<300).length,right=board.pegs.filter(p=>!p.hit&&p.x>520).length,center=board.pegs.filter(p=>!p.hit&&p.x>=300&&p.x<=520).length;
    const bounce=board.catcher.mode==='bounce';
    const plate=`The base plate ${bounce?'bounces balls back into play':'catches and returns balls'}.`+(board.catcher.behavior==='alternate'?` It switches to ${bounce?'catch':'bounce'} in ${Math.max(0,Math.ceil(Number(board.catcher.switchIn)||0))} seconds.`:'');
    speak(`${p.current} of ${p.total} ${p.label}. ${left} pegs left, ${center} in the middle, ${right} right. ${board.score} points. ${board.options.unlimited?'Unlimited shots.':board.shots+' shots left.'} ${plate} ${board.activePowers?.length?'Active powers: '+powerSummary(board.activePowers).join(', ')+'. ':''}${board.pendingPowers?.length?'Next shot: '+powerSummary(board.pendingPowers).join(', ')+'. ':''}`);
  }
  function bindActions(root) {
    root.querySelectorAll('[data-action]').forEach(b=>{
      b.addEventListener('click',()=>act(b.dataset.action));
      b.addEventListener('focus',()=>{
        const index=scannables().indexOf(b);
        if(index>=0&&(index!==focusIndex||!b.classList.contains('scan-focus')))setFocus(index);
      });
    });
  }
  async function act(action) {
    if(action.startsWith('story-')) {
      const entry=storyCampaigns.find(c=>action==='story-'+c.id);
      if(!entry)return;
      const request=++campaignLoadVersion,screenEpoch=epoch;
      speak('Opening '+entry.title+'.');
      try {
        const story=await loadStoryCampaign(entry);
        if(request!==campaignLoadVersion||epoch!==screenEpoch)return;
        selectBundledCampaign(story);persist();campaignChoice();
      } catch(error) {
        if(request===campaignLoadVersion&&epoch===screenEpoch)openModal('Campaign could not open',error.message,[{label:'Back to campaigns',action:'campaigns'}]);
      }
      return;
    }
    if(action.startsWith('guide-')) {
      const peg=pegGuide.find(entry=>action==='guide-'+entry.type)||chargeGuide.find(entry=>action==='guide-power-'+entry.power);
      const text=action==='guide-controls'?guideControls:peg?`${pegName(peg)}. ${peg.look}. ${peg.description}`:$('screen').querySelector(`[data-action="${action}"]`)?.textContent;
      if(text)speak(text.trim());
      return;
    }
    sound('select');
    const settingActions=['tts','voice','aim-speed','auto-scan','scan-speed','sound','motion'];
    if(settingActions.includes(action)) {
      const index=focusIndex;
      if(action==='tts')await window.NarbeVoiceManager.toggleTTS();
      if(action==='voice')await window.NarbeVoiceManager.cycleVoice();
      if(action==='aim-speed')prefs.aimSpeed=(prefs.aimSpeed+1)%4;
      if(action==='auto-scan')window.NarbeScanManager.toggleAutoScan();
      if(action==='scan-speed')window.NarbeScanManager.cycleScanSpeed();
      if(action==='sound') {prefs.sound=!prefs.sound;window.SafeAudio?.setEnabled(prefs.sound);}
      if(action==='motion')prefs.reducedMotion=!prefs.reducedMotion;
      persist();settingsScreen();setFocus(index,true);return;
    }
    if(action.startsWith('pack-')) { const selected=window.PeggleApp.packEntries[Number(action.slice(5))].pack;if(selected===K.builtInPack)selectBundledCampaign(selected);else selectPack(selected);persist();return campaignChoice(); }

    switch(action) {
      case 'home':closeModal();saveRun();home();break;
      case 'adventure':closeModal();startAdventure();break;
      case 'new-adventure':restartCampaign();break;
      case 'campaign-continue':startAdventure();break;
      case 'campaign-restart':restartCampaign();break;
      case 'begin-stage':if(state!=='intro'||run?.phase!=='intro')break;closeModal();run.phase='play';run.snapshot=null;loadStage();break;
      case 'gallery':closeModal();gallery();break;
      case 'campaigns':closeModal();campaigns();break;
      case 'settings':settingsScreen('home');break;
      case 'pause-settings':closeModal();settingsScreen('pause');break;
      case 'settings-back':if(settingsReturn==='pause'){renderPlay();pause();}else home();break;
      case 'help':help();break;
      case 'pause-help':closeModal();help();break;
      case 'pause':if(run?.phase==='reward'){reward();break;}if(state!=='play'&&board)renderPlay();pause();break;
      case 'resume':if(run?.phase==='reward'){reward();break;}closeModal();if(state!=='play')renderPlay();break;
      case 'take-shot':beginAiming();break;
      case 'cancel-aim':closeModal();cancelAiming();break;
      case 'fire':shoot();break;
      case 'read-board':readBoard();break;
      case 'pause-read-board':readBoard();break;
      case 'next-stage':nextStage();break;
      case 'finale':finish();break;
      case 'retry':closeModal();run.snapshot=null;loadStage();break;
      case 'continue-unlimited':closeModal();run.unlimitedHelp=true;board.options.unlimited=true;board.status='aim';board.shots=Math.max(board.shots,1);changeShotPhase('choice',false);speak('Unlimited shots. Choose Take shot to begin aiming.');break;
      case 'restart-warning':openModal('Restart this stage?','The pegs and score for this stage will start again. Your records stay saved.',[{label:'Cancel',action:'pause'},{label:'Restart stage',action:'retry'}],'warning');break;
      case 'editor-warning':openModal('Campaign builder needs a mouse','The builder is a caregiver tool. You will not be able to scan and select with your switch in the builder. Continue only if you have a mouse or keyboard.',[{label:'Cancel',action:'cancel-warning'},{label:'Open campaign builder',action:'editor-open'}],'warning');break;
      case 'import-warning':openModal('Import uses a file picker','Choosing a file needs a mouse or keyboard. Switch scanning will not work inside the file picker.',[{label:'Cancel',action:'cancel-warning'},{label:'Choose a campaign file',action:'import-open'}],'warning');break;
      case 'cancel-warning':closeModal();break;
      case 'editor-open':saveRun();if(window.electronAPI?.editor) {try {const result=await window.electronAPI.editor.open('peggle');if(!result?.success)location.href='editor.html';else closeModal();}catch{location.href='editor.html';}}else location.href='editor.html';break;
      case 'editor-return':location.href='editor.html';break;
      case 'import-open':closeModal();$('import-file').click();break;
      case 'legacy-pack':{
        const request=++campaignLoadVersion,screenEpoch=epoch;
        try {
          const res=await fetch('levels/Bennys_Campaign.json');if(!res.ok)throw Error('Campaign could not be loaded.');
          const original=await res.json();await loadBundledHistory(K.validatePack(original).meta.title,'Bennys_Campaign');if(request!==campaignLoadVersion||epoch!==screenEpoch)return;
          selectOriginalCampaign(original);persist();campaignChoice();
        }catch(e){if(request===campaignLoadVersion&&epoch===screenEpoch)openModal('Could not load the campaign',e.message,[{label:'Back to campaigns',action:'campaigns'}]);}
        break;
      }
      case 'reset-warning':openModal('Reset all campaigns?','This erases saved progress and records for every campaign. Imported campaigns and your settings stay available.',[{label:'Cancel',action:'reset-cancel'},{label:'Reset all campaigns',action:'reset-confirm'}],'warning');break;
      case 'reset-cancel':closeModal();break;
      case 'reset-confirm':profile.campaigns={};selectPack(pack);run=null;board=null;persist();closeModal();home();speak('All campaign progress and records reset.');break;
      case 'exit':saveRun();closeModal();window.NarbeScanManager.resetInputState?.();window.parent.postMessage({action:'focusBackButton'},'*');if(window.parent===window)location.href='../../../index.html';break;
    }
  }
  function scannables() {
    if(modal)return [...$('modal-layer').querySelectorAll('[data-action]:not(:disabled)')];
    if(shotActive())return [];
    if(state==='play') {
      return [$('fire-button'),$('pause-button')].filter(b=>b&&!b.disabled&&!b.hidden);
    }
    return [...$('screen').querySelectorAll('[data-action]:not(:disabled)')];
  }
  function setFocus(index,announce=true) {
    const items=scannables();
    document.querySelectorAll('.scan-focus').forEach(el=>el.classList.remove('scan-focus'));
    if(!items.length){focusIndex=0;if(state==='play'&&!modal)$('screen').focus({preventScroll:true});return;}
    focusIndex=(index+items.length)%items.length;
    const selected=items[focusIndex];selected.classList.add('scan-focus');
    selected.focus({preventScroll:true});
    if(state!=='play'||modal)selected.scrollIntoView({block:'nearest',behavior:'instant'});
    if(announce)speak(selected.textContent.trim().replace(/↗/g,''),'hover');
  }
  function nextFocus(delta=1) {scanClock=0;setFocus(focusIndex+delta);}
  function shotActive() {return state==='play'&&!modal&&['aiming','flight'].includes(shotPhase);}
  function aiming() {return state==='play'&&!modal&&shotPhase==='aiming'&&board?.status==='aim';}
  function isEnter(e) {return e.key==='Enter'||e.code==='Enter'||e.code==='NumpadEnter';}
  function isSpace(e) {return e.key===' '||e.code==='Space';}
  function cancelHolds() {
    if(held.space)clearTimeout(held.space.timer);
    if(held.enter)clearTimeout(held.enter.timer);
    held.space=null;held.enter=null;pointerGesture=null;pendingPointerClick=null;$('hold-indicator').hidden=true;
  }
  document.addEventListener('keydown',e=>{
    if(e.key==='Tab'&&modal) {
      e.preventDefault();nextFocus(e.shiftKey?-1:1);return;
    }
    if(!isSpace(e)&&!isEnter(e))return;
    e.preventDefault();if(e.repeat)return;
    if(isSpace(e)&&!held.space) {
      const h=held.space={start:performance.now(),epoch,long:false};
      if(aiming()) {
        h.aim={board,angle:board.angle,direction:aimDirection,pointer:pointerAim,focus:focusIndex};
        h.aiming=true;
        if(!held.enter){aimDirection*=-1;pointerAim=false;}
      }
      else if(!shotActive()) {
        const reverse=()=>{if(held.space!==h||h.epoch!==epoch)return;h.long=true;nextFocus(-1);h.timer=setTimeout(reverse,settings.scanInterval);};
        h.timer=setTimeout(reverse,3000);
      }
    }
    if(isEnter(e)&&!held.enter) {
      const h=held.enter={start:performance.now(),epoch,long:false,beep:0,action:aiming()?'fire':shotActive()&&shotPhase==='flight'?'pause':scannables()[focusIndex]?.dataset.action};
      if(state==='play'&&!modal)h.timer=setTimeout(()=>{if(held.enter!==h||state!=='play'||modal||h.epoch!==epoch)return;h.long=true;if(shotPhase==='aiming')cancelAiming();else pause();$('hold-indicator').hidden=true;},settings.autoScan?2000:5000);
    }
  });
  document.addEventListener('keyup',e=>{
    if(!isSpace(e)&&!isEnter(e))return;e.preventDefault();
    if(isSpace(e)) {
      const h=held.space;held.space=null;if(!h)return;clearTimeout(h.timer);
      if(h.epoch!==epoch)return;
      if(h.aiming){
        if(!settings.autoScan&&!held.enter&&performance.now()-h.start<180)board.angle=Math.max(-1.4,Math.min(1.4,board.angle+aimDirection*.035));
        saveRun();return;
      }
      if(!h.long&&!held.enter)nextFocus();
    } else {
      const h=held.enter;held.enter=null;$('hold-indicator').hidden=true;if(!h)return;clearTimeout(h.timer);
      if(h.long||h.epoch!==epoch)return;
      if(h.action==='fire'&&aiming()){shoot();return;}
      if(h.action==='pause'&&state==='play'&&!modal){pause();return;}
      const items=scannables(),item=items.find(candidate=>candidate.dataset.action===h.action);
      if(item) {speak(item.textContent.trim().replace(/↗/g,''));act(item.dataset.action);}
    }
  });
  document.addEventListener('narbe-input-cancelled',e=>{
    const key=e.detail||{};
    if(isSpace(key)) {
      const h=held.space;
      if(h?.aim&&h.epoch===epoch&&h.aim.board===board&&state==='play'&&!modal){
        board.angle=h.aim.angle;aimDirection=h.aim.direction;pointerAim=h.aim.pointer;setFocus(h.aim.focus,false);
      }
      if(h)clearTimeout(h.timer);
      held.space=null;
    } else if(isEnter(key)) {
      if(held.enter)clearTimeout(held.enter.timer);
      held.enter=null;$('hold-indicator').hidden=true;
    } else cancelHolds();
  });
  window.addEventListener('blur',()=>{cancelHolds();if(state==='play'&&!modal){saveRun();pause();}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){saveRun();cancelHolds();if(state==='play'&&!modal)pause();}});
  window.addEventListener('beforeunload',saveRun);
  window.NarbeScanManager.subscribe(next=>{
    const autoChanged=settings.autoScan!==next.autoScan;settings=next;scanClock=0;
    refreshSharedSettings();
    if(state==='play'&&board){if(autoChanged){cancelHolds();pointerAim=false;epoch++;}updateHUD();if(autoChanged)setFocus(0,false);}
  });
  window.NarbeVoiceManager?.onSettingsChange(refreshSharedSettings);
  $('home-link').addEventListener('click',e=>{e.preventDefault();if(board&&state==='play')pause();else home();});
  $('import-file').addEventListener('change',async e=>{
    const file=e.target.files[0];if(!file)return;
    try {if(file.size>24*1024*1024)throw Error('Use a campaign file smaller than 24 MB.');const p=K.validatePack(JSON.parse(await file.text()));const library=read(LIBRARY)||[];const updated=library.filter(entry=>entry?.meta?.title!==p.meta.title).concat(p).slice(-12);localStorage.setItem(LIBRARY,JSON.stringify(updated));localStorage.setItem(CUSTOM,JSON.stringify(p));selectPack(p);persist();home();speak('Campaign imported. '+p.meta.title);}
    catch(error){openModal('Could not import that campaign',error.message,[{label:'Back to campaigns',action:'campaigns'}]);}
    e.target.value='';
  });
  function resizeCanvas() {
    const canvas=$('board');if(!canvas)return;
    const dpr=Math.min(devicePixelRatio||1,2),rect=canvas.getBoundingClientRect();
    canvas.width=Math.max(1,Math.round(rect.width*dpr));canvas.height=Math.max(1,Math.round(rect.width*K.H/K.W*dpr));
    const highlights=$('objective-highlights');if(highlights){highlights.width=canvas.width;highlights.height=canvas.height;}
  }
  window.addEventListener('resize',()=>{resizeCanvas();drawBoard();});
  function drawBoard() {
    const canvas=$('board');
    if(canvas&&board)window.PeggleRenderer.draw(canvas,board,{reducedMotion:prefs.reducedMotion,particles,impacts,pegDepartures,showPrediction:shotPhase==='aiming',decayAfterWin:recapVisualTime,phaseTime:animationTime});
    if(board)window.PeggleRenderer.drawObjectiveHighlights($('objective-highlights'),board,{reducedMotion:prefs.reducedMotion,phaseTime:animationTime});
  }
  function pegImpact(event) {
    const palette=window.PeggleRenderer.pegPalette(event.pegType,event.ballPower||event.power||board.pegs.find(peg=>peg.x===event.x&&peg.y===event.y)?.power);
    const radius=event.radius||board.pegs.find(peg=>peg.x===event.x&&peg.y===event.y)?.radius||12;
    const life=prefs.reducedMotion ? .5 : .9;
    impacts.push({x:event.x,y:event.y,radius,points:event.points,color:palette.light,life,maxLife:life,quiet:prefs.reducedMotion});
    impacts=impacts.slice(-32);
    if(prefs.reducedMotion)return;
    for(let i=0;i<12;i++) {
      const angle=i*Math.PI/6+(Math.random()-.5)*.35,speed=55+Math.random()*90,life=.5+Math.random()*.3;
      particles.push({x:event.x+Math.cos(angle)*radius*.45,y:event.y+Math.sin(angle)*radius*.45,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed-30,life,maxLife:life,size:2+Math.random()*3,rotation:angle,spin:(Math.random()-.5)*8,color:i%3?palette.middle:palette.light});
    }
  }
  function addPegDeparture(list,event,quiet) {
    const peg=event.peg;if(!peg)return;
    const life=quiet ? .28 : 1.05;
    list.push({peg:{...peg},originX:peg.x,originY:peg.y,x:peg.x,y:peg.y,direction:event.direction<0?-1:1,rotation:0,age:0,life,maxLife:life,quiet:Boolean(quiet)});
    if(list.length>48)list.splice(0,list.length-48);
  }
  function advancePegDepartures(list,dt,reducedMotion) {
    for(const departure of list) {
      if(reducedMotion&&!departure.quiet){departure.quiet=true;departure.age=0;departure.life=departure.maxLife=.28;}
      departure.age+=dt;departure.life=Math.max(0,departure.life-dt);
      if(departure.quiet){departure.x=departure.originX;departure.y=departure.originY;departure.rotation=0;}
      else {
        const t=departure.age;
        departure.x=departure.originX+departure.direction*(100*t+650*t*t);
        departure.y=departure.originY-260*t+680*t*t;
        departure.rotation=departure.direction*(1.3*t+3*t*t);
      }
    }
    return list.filter(departure=>departure.life>0).slice(-48);
  }
  function advanceEffects(dt) {
    particles.forEach(p=>{p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=95*dt;p.rotation+=p.spin*dt;p.life-=dt;});particles=particles.filter(p=>p.life>0).slice(-240);
    impacts.forEach(impact=>{impact.life-=dt;});impacts=impacts.filter(impact=>impact.life>0);
    pegDepartures=advancePegDepartures(pegDepartures,dt,prefs.reducedMotion);
  }
  function frame(now) {
    const dt=Math.min(.05,(now-(lastFrame||now))/1000);lastFrame=now;animationTime+=dt;
    if(held.enter&&state==='play'&&!modal) {
      const duration=now-held.enter.start,limit=settings.autoScan?2000:5000;
      if(duration>450){$('hold-indicator').hidden=false;$('hold-progress').style.width=Math.min(100,duration/limit*100)+'%';const beep=Math.floor(duration/600);if(beep>held.enter.beep){held.enter.beep=beep;sound('hover',.2+Math.min(.35,duration/limit*.35));}}
    }
    if(state==='play'&&board&&!modal&&!document.hidden) {
      if(board.status==='aim'&&shotPhase==='aiming') {
        const speed=[.12,.2,.33,.5][prefs.aimSpeed]||.12;
        const autoAim=settings.autoScan&&!pointerAim&&!held.space;
        if(!held.enter&&(held.space?.aiming||autoAim)){board.angle+=aimDirection*speed*dt;if(Math.abs(board.angle)>1.4){board.angle=Math.sign(board.angle)*1.4;if(settings.autoScan)aimDirection*=-1;}}
      }
      board.update(dt);
      for(const event of board.events.splice(0)) {
        if(event.type==='hit') {records().pegs++;sound('score',.2);pegImpact(event);}
        if(event.type==='pegEject')addPegDeparture(pegDepartures,event,prefs.reducedMotion);
        if(event.type==='recovery')speak(event.text||'Ball freed.');
        if(event.type==='catch')records().catches++;
        if(event.type==='bounce')sound('bounce',.35);
        if(event.type==='power'||event.type==='catch') {
          const text=event.ballPower?ballPowerName(event.ballPower)+(event.charged?' charged for your next shot.':event.activated?' active.':event.ballPower==='echo'?'. One more pass!':event.ballPower==='blast'?' burst!':'. '+(event.text||'Power activated.')):event.powerId?K.powerName(pack.meta,event.powerId):event.text||'Power activated.';
          shotFeedback=text;speak(text,event.type==='catch'?'catch':'bank');
        }
        if(event.type==='style') {shotFeedback=(event.text||'Great shot')+(event.points?' +'+event.points.toLocaleString():'');sound('bank',.25);}
        if(event.type==='shotEnd'){if(event.hits>=5)records().bigBounce=true;records().bestScore=Math.max(records().bestScore,Math.round(board.score));const text=event.text||`${board.score} points. ${board.shots} shots left.`;run.lastShotReport=`Last shot: ${event.hits||0} ${(event.hits||0)===1?'peg':'pegs'} · ${Math.round(event.points||0).toLocaleString()} points`;shotFeedback='';changeShotPhase('choice',false,true);speak(text+' Choose Take shot to aim again, or Options.');}
        if(event.type==='win'){onWin();break;}
        if(event.type==='lose'){lost();break;}
      }
      advanceEffects(dt);
      if(board.status==='won'&&!pendingWin)onWin();else if(board.status==='lost'&&!modal)lost();
      if(state==='play'){updateHUD();drawBoard();}
      saveClock+=dt;if(saveClock>2){saveClock=0;saveRun();}
      if($('board-toast')&&now>toastUntil)$('board-toast').hidden=true;
    } else if(state==='reward'&&modal?.kind==='recap'&&board&&!document.hidden) {
      // Let the winning fragments and peg decay finish behind the recap while
      // balls, plate position, score and all physics stay at the winning frame.
      recapVisualTime=Math.min(3,recapVisualTime+dt);run.recapVisualTime=recapVisualTime;advanceEffects(dt);drawBoard();
    }
    const narrationSpeaking=(state==='intro'||(state==='reward'&&modal?.kind==='recap'))&&window.NarbeVoiceManager?.getSettings()?.ttsEnabled&&(window.speechSynthesis?.speaking||window.speechSynthesis?.pending);
    if(narrationSpeaking)scanClock=0;
    if(settings.autoScan&&!narrationSpeaking&&!held.space&&!held.enter&&!document.hidden&&scannables().length>1) {
      scanClock+=dt*1000;if(scanClock>=settings.scanInterval){scanClock=0;nextFocus();}
    }
    requestAnimationFrame(frame);
  }
  window.PeggleApp={act,get state(){return state;},get shotPhase(){return shotPhase;},get modal(){return modal;},get board(){return board;},get run(){return run;},get pack(){return pack;},get preferences(){return prefs;},get focusIndex(){return focusIndex;},packEntries:[],scene,puzzle};
  if(playtest) {
    try {selectPack(read(PLAYTEST)||K.builtInPack);profile.campaigns[packId]={completed:[],run:null};run={stage:0,score:0,phase:'intro'};progress().run=run;intro();}
    catch(error){selectPack(K.builtInPack);home();openModal('Playtest could not open',error.message,[{label:'Return to builder',action:'editor-return'}]);}
  } else {
    (async()=>{
      let selected=profile.selectedPack;
      if(!selected)try{selected=await loadStoryCampaign(storyCampaigns[0]);}catch{selected=K.builtInPack;}
      try{if(!await upgradeBundledSelection(selected))selectPack(selected);}catch{try{selectPack(selected);}catch{selectPack(K.builtInPack);}}
      home();
    })();
  }
  window.SafeAudio?.setEnabled(prefs.sound);
  requestAnimationFrame(frame);
})();
