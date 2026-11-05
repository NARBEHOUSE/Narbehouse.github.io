'use strict';
// Loaded only by index.html?review=1. The parent deliberately omits allow-same-origin:
// neither the pet saves nor native Hub settings are available to this disposable game.
(() => {
  if (parent === window || new URLSearchParams(location.search).get('review') !== '1') return;
  const runToken = new URLSearchParams(location.search).get('run');
  const send = (type, data = {}) => parent.postMessage({ petPalsReview: true, run: runToken, type, ...data }, '*');
  if(!window.petPalsReviewIsolated){send('error',{message:'Preview storage isolation did not initialize. Open review.html again.'});return;}
  const nice = s => String(s).replace(/[:_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const entries = [], both = ['dog', 'cat'];
  const add = (id, label, group, data = {}) => entries.push({ id, label, group, kinds: both, ...data });
  const schoolPrefixes = ['school','basics','agility','frisbee','dance','swim','nose','therapy'];
  const seasons = ['pumpkin','orchard','fest','splash','beach','sled','snow','lights','rainwalk','leaves','sprinkler','egg','cocoa','fireworks','tot','tree','present','val','bday','camp'];
  function kindsFor(key) {
    const [prefix, name] = key.split(':');
    if (VARIANTS[prefix]) { const matches = both.filter(k => (VARIANTS[prefix][k] || []).includes(name)); if (matches.length) return matches; }
    if (prefix === 'idle') return both.filter(k => IDLE_W[k].some(([v]) => v === name));
    if (prefix === 'task' && TASKS[name]?.kind !== 'both') return [TASKS[name].kind];
    if (prefix === 'trick') { const t = NEW_TRICKS.find(t => t.id === name); if (t) return t.kinds; }
    if (schoolPrefixes.includes(prefix) || prefix === 'walk' || ['event:bark','event:mud','event:parade','event:agility'].includes(key)) return ['dog'];
    if (['catwalk','catio'].includes(prefix) || ['event:hide','event:cafe','event:catshow','tree:climb','feed:shrimp'].includes(key)) return ['cat'];
    return both;
  }
  function groupFor(key) {
    const prefix = key.split(':')[0];
    if (['feed','play','cuddle','bath','brush','nap'].includes(prefix)) return 'Care & play';
    if (prefix === 'idle') return 'Little idle moments';
    if (prefix === 'event' || prefix === 'welcome') return 'Surprises & welcome back';
    if (prefix === 'task' || prefix === 'need') return 'Chores & needs';
    if (prefix === 'trick') return 'Tricks';
    if (schoolPrefixes.includes(prefix)) return 'Dog school';
    if (seasons.includes(prefix)) return 'Seasons & holidays';
    if (prefix === 'comp' || prefix === 'rush') return 'Companions & Rush';
    if (['hello','grow','decor'].includes(prefix)) return 'Growth & rewards';
    return 'Outing scenes';
  }
  // Registry-driven inventory: adding an animation to the game also adds a review row.
  for (const key of Object.keys(V)) add('scene/' + key,
    V[key].reviewLabel||(key.startsWith('trick:') ? 'Trick: ' + trickName(key.slice(6)) : nice(key.replace(/:0$/, ''))),
    groupFor(key), { kind: 'scene', key, kinds: kindsFor(key), purpose: 'Watch this individual animation, including its sounds and ending.' });
  const variant = (key, suffix, label, extra = {}, data = {}) => add('variant/' + key + '/' + suffix, label, groupFor(key), { kind: 'scene', key, kinds: kindsFor(key), extra, ...data });
  for (const [place, options] of Object.entries(WALK_EVENTS)) for (const [event] of options)
    variant('walk:' + place, event, nice(place) + ' walk: ' + nice(event), { event });
  for (const mode of ['blanket','fort','watch']) variant('event:rain', mode, 'Rainy day: ' + nice(mode), { mode });
  for (const sneeze of [false,true]) variant('garden:sniff', String(sneeze), sneeze ? 'Flowers: a sneeze' : 'Flowers: no sneeze', { sneeze });
  variant('rush:give','toy','Rush brings a toy from the basket',{help:'toy',say:'Rush brings a toy from the basket for Buddy.',add:{fun:12,love:5}});
  for (const hide of ['boxes','cups','pillows']) for (let win = 0; win < 3; win++)
    variant('nose:find', hide + win, 'Find the treat: ' + hide + ', spot ' + (win + 1), { hide, win });
  for (const [petKind, toys] of Object.entries(TOYS)) for (const [toy, name] of toys)
    for (const key of ['play:toybox','play:fetch','event:gift']) variant(key, toy, nice(key.split(':')[1]) + ': ' + name, { toy }, { kinds: [petKind] });
  for (const dream of Object.keys(DREAM_WORD)) variant('nap:bed', dream, 'Nap: dreams of ' + DREAM_WORD[dream], { dream }, { kinds: dream === 'yarn' || dream === 'box' ? ['cat'] : dream === 'ball' || dream === 'walk' ? ['dog'] : both });
  for (const [type, info] of Object.entries(COMP)) {
    info.stages.forEach((stage, i) => {
      for (const visit of [false,true]) variant('comp:moment', type + i + visit,
        nice(stage) + ': ' + (visit ? 'visit the pet' : 'own little moment'), {}, { companion: { type, stage: i }, fixedRandom: visit ? .1 : .9 });
      if (i < info.stages.length - 1) variant('comp:grow', type + i, nice(stage) + ' grows into ' + info.stages[i + 1], {}, { companion: { type, stage: i } });
    });
  }
  for (const id of Object.keys(PLACES)) {
    const p = PLACES[id]; add('trip/' + id, p.label + ' — complete visit', 'Full interactions', {
      kind: 'trip', place: id, kinds: p.kinds || both,
      purpose: 'Watch the journey, make any choices, then check the return home and changes to needs. Replay to try another choice.'
    });
  }
  for (const [id, c] of Object.entries(CLASSES)) c.lessons.forEach((_, lesson) => add('lesson/' + id + '/' + lesson,
    c.label + ': lesson ' + (lesson + 1) + (lesson === 2 ? ' & graduation' : ''), 'Full interactions', {
      kind: 'lesson', classId: id, lesson, kinds: ['dog'], purpose: 'Run the real school visit, lesson reward and return home.'
    }));
  for (const visit of Object.keys(GROOM_VISITS)) add('groom/' + visit, 'Groomer: ' + GROOM_SAY[visit] + ' — full visit', 'Full interactions', { kind: 'groom', visit });
  for (const id of Object.keys(TASKS)) add('chore/' + id, TASKS[id].label + ' — complete chore', 'Chores & needs', { kind: 'chore', task: id, kinds: TASKS[id].kind === 'both' ? both : [TASKS[id].kind] });
  add('potty/due', 'Bathroom break → clean up', 'Chores & needs', { kind: 'potty', purpose: 'Watch the pet use the pad or litter box. Select the resulting cleanup task in the game.' });
  for (const key of KEYS) for (const level of [50,28]) add('need/' + key + '/' + level, STAT_INFO[key][0] + ': ' + (level < 33 ? 'low' : 'needs care'), 'Chores & needs', { kind: 'need', need: key, level, purpose: 'Check the pet’s body language and request for care, then try the matching room action.' });
  for (let from = 0; from < 3; from++) add('grow/' + from, 'Grow: ' + ['baby → teen','teen → grown-up','grown-up → senior'][from], 'Growth & rewards', { kind: 'grow', from, purpose: 'This preset starts at the named age. Check growth, the celebration card and the new appearance.' });
  for (const m of MILESTONES) add('reward/' + m.id, m.at + ' stars: ' + nice(m.type) + ' reward (' + m.id + ')', 'Growth & rewards', { kind: 'reward', milestone: m });
  for (const id of Object.keys(WELCOME_EVENTS)) add('welcome/' + id, 'Welcome back: ' + nice(id), 'Full interactions', { kind: 'welcome', welcome: id });
  for (const id of ['playdate','gift','rain','costume','valentine','companion','rush']) add('choice/' + id, nice(id) + ' — choose & play', 'Full interactions', { kind: 'choice', choice: id });
  for (const key of KEYS) add('rush/' + key, 'Rush helps with ' + STAT_INFO[key][0].toLowerCase(), 'Companions & Rush', { kind: 'rushNeed', need: key });
  for (const task of Object.keys(RUSH_CHORE)) add('rush-chore/' + task, 'Rush: ' + TASKS[task].label, 'Companions & Rush', { kind: 'rushChore', task, kinds: TASKS[task].kind === 'both' ? both : [TASKS[task].kind] });
  const ENVIRONMENTS = {
    spring: ['2026-04-15T12:00:00','sunny','afternoon'], summer: ['2026-07-15T12:00:00','sunny','afternoon'],
    fall: ['2026-10-15T12:00:00','windy','afternoon'], winter: ['2026-01-15T12:00:00','snow','afternoon'],
    rain: ['2026-04-15T12:00:00','rain','afternoon'], night: ['2026-07-15T21:00:00','sunny','night'],
    halloween: ['2026-10-31T18:00:00','sunny','sunset'], christmas: ['2026-12-25T12:00:00','snow','afternoon'],
    valentine: ['2026-02-14T12:00:00','cloudy','afternoon'], easter: ['2026-04-05T12:00:00','sunny','afternoon']
  };
  function defaultEnvironment(r) {
    const s = r.id;
    if (/tot:|trickortreat|costume/.test(s)) return 'halloween';
    if (/tree:|present|lights|treetrim/.test(s)) return 'christmas';
    if (/snow|sled|cocoa/.test(s)) return 'winter';
    if (/pumpkin|orchard|leaves|leafpile/.test(s)) return 'fall';
    if (/valentine|val:/.test(s)) return 'valentine';
    if (/egg/.test(s)) return 'easter';
    if (/rain|puddle/.test(s)) return 'rain';
    if (/fest|garden/.test(s)) return 'spring';
    if (/fireworks/.test(s)) return 'night';
    return 'summer';
  }
  let active = null, completed = false, lastStatus = '', lastAudio = '', pausedByReview = false;
  function reportAudio() {
    if(!active)return;
    const speaking=voice.enabled(),audio={sound:gs.sound?(speaking?'all':'effects'):(speaking?'voice':'off'),music:gs.music};
    const json=JSON.stringify(audio);if(json!==lastAudio){lastAudio=json;send('audio',{audio});}
  }
  // Send menu changes immediately so Next/Replay can recreate the frame without
  // losing preferences. The parent stores only review audio, never pet/Hub data.
  for(const setting of SETTINGS.filter(s=>['s-tts','s-music','s-sound'].includes(s.id))){
    const act=setting.act;setting.act=()=>{act();reportAudio();};
  }
  const realNow = Date.now.bind(Date), realRandom = Math.random;
  function prepare(r, config) {
    const style = STYLES[config.style] && r.kinds.includes(STYLES[config.style].kind) ? config.style : r.kinds[0] === 'cat' ? 'tabby' : 'cream';
    let seed = Number(config.seed) >>> 0 || 1;
    Math.random = () => { seed = (Math.imul(seed,1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    const env = ENVIRONMENTS[config.environment] || ENVIRONMENTS[defaultEnvironment(r)];
    window.__TODAY = env[0]; window.__WX = env[1];
    const phaseIndex = Math.max(0, PHASES.indexOf(env[2])), offset = phaseIndex * 600000 - realNow() % (PHASES.length * 600000);
    Date.now = () => realNow() + offset;
    state = cleanSave({ name: 'Buddy', style, id: 'review-pet', stage: clamp(Number(config.age) || 0,0,3), hearts: 0, stars: 100,
      stats: Object.fromEntries(KEYS.map(k => [k,80])), msGot: MILESTONES.map(m => m.id),
      tricks: NEW_TRICKS.filter(t => t.kinds.includes(STYLES[style].kind)).map(t => t.id),
      toys: TOYS[STYLES[style].kind].map(t => t[0]), outfit: config.outfit === 'dressed' ? {hat:'wizard',face:'round',neck:'bandana',body:'sweater'} : config.outfit === 'cape' ? {body:'cape'} : {},
      born: new Date(new Date(env[0]).getFullYear()-1,new Date(env[0]).getMonth(),new Date(env[0]).getDate()).getTime(),
      room: defaultRoom(), noCompOffer: true, pottyDue: Date.now()+1e9, school: {cur:STYLES[style].kind==='dog'?'basics':null,lesson:2,done:[]}
    });
    if (r.kind === 'grow') state.stage = r.from;
    const type = r.companion?.type || 'frog', ci = COMP[type];
    state.companions = [{type,stage:r.companion?.stage || 0,name:ci.names[0],look:ci.pet ? (ci.pet === 'dog' ? 'chocolate' : 'tabby') : 0,at:0}];
    state.friends = [{name:'Sunny',style:KIND_STYLES[kind()].find(s=>s!==style),isNew:false}];
    state.welcome = cleanWelcome();
    Object.assign(gs,{sound:config.sound!=='off'&&config.sound!=='voice',music:[0,1,2].includes(config.music)?config.music:0,waitRead:true});
    ttsLocal.enabled=config.sound==='all'||config.sound==='voice';
    VM()?.updateSettings({ttsEnabled:ttsLocal.enabled});
    SM()?.updateSettings({autoScan:false,inputSensitivityIndex:0});
    nextEvent=nextIdle=nextTask=quietUntil=Infinity; lastCelebrate=Date.now();
    anim=null; trip=null; parts=[]; sayQ.length=0; sayUntil=0; narr.on=false;
    paused=false; pauseOffset=0; bgKey=null; roomRev++; configureActions(); show('game'); updateHeader(); updateMeters();
    // tick() retains the normal needs/interaction machinery, but no unrelated random
    // scene interrupts this review, even after a callback changes quietUntil.
    nextEvent=nextIdle=nextTask=Infinity;
    state.noCompOffer=true; state.compAskAt=Date.now()+1e9;
    lastPhaseSaid=skyPhase(); lastWx=wxNow();
    for(const season of Object.keys(SEASON_MSG)) state.seasonal['greet:'+season]=calToday().getFullYear();
    for(const holiday of Object.keys(HOLIDAY_MSG)) state.seasonal['greet:'+holiday]=calToday().getFullYear();
    state.seasonal['day:halloween']=dayKey(); state.seasonal['year:birthday']=calToday().getFullYear(); state.seasonal['year:presents']=calToday().getFullYear();
  }
  function fixtureTrip(place='backyard') {
    return { place,picks:{scent:'lavender',pumpkin:'round',item:{type:'toy',id:ownedToys()[0],label:'A toy'}},
      offer:[{type:'toy',id:ownedToys()[0],label:'A toy'}],friend:{...state.friends[0]},visit:'bath',show:learnedTricks().slice(0,3),lastBg:'home' };
  }
  function finish() { completed=true; send('complete',{id:active.id}); }
  function singleScene(r) {
    const d=V[r.key], prefix=r.key.split(':')[0];
    const place=Object.keys(PLACES).find(id=>PLACES[id].bg===d.bgName)||'backyard';
    const extra={trip:fixtureTrip(place),bg:d.bgName||'yard',friend:state.friends[0].style,fname:'Sunny',fstyle:state.friends[0].style,
      ci:0,icon:'cuddle',say:'Rush gives Buddy a friendly nuzzle.',add:{love:25},hide:'boxes',shop:'bank',trick:'sit',...r.extra};
    if(prefix==='task'){state.task=r.key.slice(5);state.pottyN=1;state.pottyAt=Date.now();}
    if(r.key==='event:mud') state.muddy=false;
    const duration=Math.min(d.dur || V['trick:'+extra.trick].dur,15000);
    const rng=Math.random;
    if(r.fixedRandom!=null) Math.random=()=>r.fixedRandom;
    try {
      let playing;
      startAnim(r.key,duration,()=>{if(d.end)d.end(playing);finish();},extra);
      playing=anim;
      // Explicit branches override randomized initialization before the start caption.
      Object.assign(anim,r.extra||{});
      if(d.start) d.start(anim);
      else if(prefix==='idle') setCaption(IDLE_MSG[r.key.slice(5)](state.name,anim));
      else setCaption(r.label);
    } finally { Math.random=rng; }
  }
  function runEntry(r, config) {
    active=r; completed=false; pausedByReview=false; lastStatus=''; prepare(r,config);
    if(r.kind==='scene') singleScene(r);
    else if(r.kind==='trip') startTrip(r.place,null,fixtureTrip(r.place));
    else if(r.kind==='lesson'){state.school={cur:r.classId,lesson:r.lesson,done:[]};startTrip('school');}
    else if(r.kind==='groom'){
      // Use the game's real story builder, pinning just its visit selection.
      const original=PLACES.groomer.story;
      PLACES.groomer.story=t=>{const rng=Math.random;state.lastGroom=null;Math.random=()=>((Object.keys(GROOM_VISITS).indexOf(r.visit)+.1)/Object.keys(GROOM_VISITS).length);
        try{return original(t);}finally{Math.random=rng;}};
      startTrip('groomer');PLACES.groomer.story=original;
    }
    else if(r.kind==='chore'){state.task=r.task;state.pottyN=2;state.pottyAt=Date.now()-1e6;refreshGameTargets();doTask();}
    else if(r.kind==='potty'){state.pottyDue=Date.now()-1;pottyTick(Date.now());}
    else if(r.kind==='need'){state.stats[r.need]=r.level;lastWant=r.need;updateMeters();setCaption((r.level<33?LOW_MSG:WANT_MSG)[r.need](state.name));refreshGameTargets();}
    else if(r.kind==='grow') startGrow();
    else if(r.kind==='reward'){state.msGot=state.msGot.filter(id=>id!==r.milestone.id);celebrate(r.milestone);}
    else if(r.kind==='welcome') startWelcome(r.welcome);
    else if(r.kind==='rushNeed') {state.stats[r.need]=28;startRush(r.need);}
    else if(r.kind==='rushChore'){state.task=r.task;state.pottyN=2;rushChore();}
    else if(r.kind==='choice') ({playdate:askPlaydate,gift:askGift,rain:askRain,costume:askCostume,valentine:askValentine,companion:offerCompanion,rush:startRush})[r.choice]();
    updateHeader(); report();
  }
  function status() {
    let choices=[];
    const listId={choice:'choice-list',celebrate:'cel-list',name:'names'}[layer];
    if(listId) choices=(LISTS[listId]?.items||[]).map((it,index)=>({index,label:it.label,listId}));
    return {id:active?.id,layer,key:anim?.key||'',elapsed:anim?Math.max(0,Math.round(clock()-anim.start)):0,duration:anim?.dur||0,
      paused:pausedByReview,complete:completed,caption:captionEl.textContent,choices,pet:state?{style:state.style,stage:state.stage,stats:state.stats,task:state.task}:null};
  }
  function report() {
    if(!active)return;
    reportAudio();
    // Keep the review on the chosen scenario instead of falling into another random event.
    nextEvent=nextIdle=nextTask=Infinity;quietUntil=Infinity;
    const s=status();
    if(!completed && active.kind!=='scene' && !['need','potty'].includes(active.kind) && !anim&&!trip&&layer==='game'&&!linesWaiting()) finish();
    const json=JSON.stringify(s);if(json!==lastStatus){lastStatus=json;send('status',{status:s});}
  }
  window.addEventListener('message', e=>{
    if(e.source!==parent || !e.data?.petPalsReview) return;
    try {
      const m=e.data;
      if(m.type==='start'){
        const r=entries.find(r=>r.id===m.id);if(!r)throw Error('Unknown scene');runEntry(r,m.config||{});
      } else if(m.type==='pause'){
        if(!pausedByReview){paused=true;pausedAt=performance.now();pausedByReview=true;voice.enabled()&&interruptReading();}
        else {unpauseClock();pausedByReview=false;}report();
      } else if(m.type==='choose'){
        const id={choice:'choice-list',celebrate:'cel-list',name:'names'}[layer];
        const it=id&&LISTS[id]?.items[m.index];if(it){unpauseClock();pausedByReview=false;it.fn();report();}
      }
    }catch(error){send('error',{message:error.stack||String(error)});}
  });
  window.addEventListener('error',e=>send('error',{message:e.error?.stack||e.message}));
  window.addEventListener('unhandledrejection',e=>send('error',{message:String(e.reason)}));
  setInterval(report,200);
  // Read-only test/inventory surface; all writes still live only in this sandbox.
  window.PetPalsReview={entries,status,runEntry};
  send('ready',{build:GAME_BUILD,entries:entries.map(({id,label,group,kinds,purpose,kind,key})=>({id,label,group,kinds,purpose,kind,key})),
    pets:Object.entries(STYLES).map(([id,s])=>({id,label:s.label,kind:s.kind})),environments:Object.keys(ENVIRONMENTS)});
})();
