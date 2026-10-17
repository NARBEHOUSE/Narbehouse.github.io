'use strict';
/* ================= Game state =================
   The pace is gentle on purpose: needs drift down slowly, surprises come every few minutes, and
   there is always time to explore. */
const KEYS=['food','fun','clean','energy','love'];
/* How fast each need goes down, per second, slow on purpose so a switch player has time for each one and
   few things ask for attention at once. From full, a need starts asking (below 55) and gets low (below 33)
   after about: food 24 and 35 minutes, play 19 and 28, bath or brushing 31 and 47, nap 40 and 60,
   cuddles 29 and 43. */
const RATES={food:.0315,fun:.0394,clean:.0238,energy:.0185,love:.0261};
const AWAY=.25, FLOOR=25, WANT=55, LOW=33;
/* The pet's little moments (a yawn, a sneeze) come every 1.5 to 3 minutes and are read aloud, but never
   within a minute of other reading (IDLE_QUIET). A need is said once when it starts and once more when it gets
   low; only a low need is said again, every 15 minutes (ASK_AGAIN), so a switch player is never nagged. A chore
   that is waiting is mentioned again every 6 minutes (NAG_AGAIN). On Slow pace both are twice as far apart. */
const EVENT_GAP=[180000,600000], TASK_GAP=[360000,720000], IDLE_GAP=[90000,180000], IDLE_QUIET=60000, ASK_AGAIN=15*60000, NAG_AGAIN=6*60000, CELEBRATE_GAP=120000;
/* Event Pace (Settings): Slow spaces surprises and chores 2.5 times as far apart (about 3 or 4 an hour),
   the pet's little idle moments 4 times as far apart with less chatter, repeats need reminders half as
   often, and changes the sky quietly, for players who find the busier pace too much. Surprise timers only count calm time in the
   room: they wait while a scene, a trip, a menu or reading is going on. */
const PACE_K={medium:1,slow:2.5}, paceK=()=>PACE_K[gs.events]||1, gap=g=>rand(g[0]*paceK(),g[1]*paceK()), remindK=()=>gs.events==='slow'?2:1, idleK=()=>gs.events==='slow'?4:1;
function holdTimers(ms){ if(!(ms>0)||ms>60000) return; nextEvent+=ms; nextIdle+=ms; nextPotty+=ms; if(state&&!state.task) nextTask+=ms; if(state&&state.pottyAt) state.pottyAt+=ms; }
/* The potty: about once an hour of play the pet leaves one nugget on the potty pad or in the litter
   box. If nobody cleans it up, a second one comes about 20 minutes of play later. It gets stinky after
   a while, and only with two nuggets does the game ask for a clean-up. Only calm time in the room
   counts, like the other timers. */
const POTTY_GAP=[50*60000,70*60000], POTTY_SECOND=20*60000, POTTY_STINK=10*60000;
let nextPotty=Date.now()+rand(POTTY_GAP[0]*.5,POTTY_GAP[1]*.7);
const pottyTask=()=>kind()==='cat'?'litter':'potty', isPotty=()=>state&&(state.task==='potty'||state.task==='litter');
const pottyCount=()=>isPotty()?clamp(state.pottyN||1,1,2):0, pottyStinky=()=>isPotty()&&(pottyCount()>=2||Date.now()-(state.pottyAt||Date.now())>POTTY_STINK);
function pottyTick(now){
  if(isPotty()&&pottyCount()<2&&state.pottyAt&&now-state.pottyAt>POTTY_SECOND*paceK()){ state.pottyN=2; save(); play('pop',.3);
    announce(kind()==='cat'?`Another one! ${state.name}'s litter box is getting stinky. Please scoop it.`:`Another one! ${state.name}'s potty pad is getting stinky. Please clean it up.`); lastTaskNag=now; quietUntil=now+6000; return true; }
  if(now<nextPotty) return false; nextPotty=now+rand(POTTY_GAP[0],POTTY_GAP[1])*(gs.events==='slow'?1.3:1);
  if(state.task){ if(!isPotty()) nextPotty=now+5*60000; return false; }
  state.task=pottyTask(); state.pottyN=1; state.pottyAt=now; save(); refreshGameTargets(); play('pop',.3);
  announce(kind()==='cat'?`${state.name} used the litter box. You can scoop it when you're ready.`:`${state.name} used the potty pad. You can clean it up when you're ready.`); lastTaskNag=now; quietUntil=now+6000; return true; }
function setEventPace(p){ const k0=paceK(); gs.events=p; saveGS(); const r=paceK()/k0, now=Date.now(), stretch=t=>t>now?now+(t-now)*r:t;
  nextEvent=stretch(nextEvent); nextTask=stretch(nextTask); nextIdle=stretch(nextIdle); }
const floorOf=k=>(k==='clean'&&state&&state.muddy)?0:FLOOR;
const paceMul=()=>1;
/* Paw prints needed for each next stage: puppy/kitten -> teen -> grown-up -> senior.
   Growing Up Speed (Settings) picks Slow, Medium (the default) or Quick. */
const GROW_SPEEDS={slow:[100,250,400],medium:[50,100,150],quick:[30,70,130]};
const growGoals=()=>GROW_SPEEDS[gs.grow]||GROW_SPEEDS.medium;
let state=null;
const kind=()=>state?(STYLES[state.style]||STYLES.cream).kind:'dog';
const stageIdx=()=>Math.min(state?state.stage||0:0,3);
const stageName=()=>STAGES[stageIdx()];
const stageWord=()=>STAGE_WORD[kind()][stageIdx()];
function nextGrowAt(){ if(!state) return null; const s=state.stage||0; return s<3?growGoals()[s]:null; }
const growDue=()=>state&&nextGrowAt()!=null&&state.hearts>=nextGrowAt();
/* Changing Growing Up Speed mid-game: the pet keeps its paw prints and its stage and never gets
   younger. Only the goal for the next stage moves. If the pet already has enough paw prints for the new
   goal, it grows up when the player goes back to the room, one stage at a time with a celebration each. */
function growNote(){ const n=state.name, at=nextGrowAt(), h=state.hearts, L=STAGE_LABEL[kind()], s=state.stage||0;
  if(at==null) return `${n} is a senior and stays one.`;
  return h>=at?`${n} has ${h} 🐾, enough to grow up back in the room!`:`${n} stays a ${L[s].toLowerCase()}, never younger. ${L[s+1]} at ${at} 🐾, ${at-h} to go.`; }
/* A short note in the Settings title for a few seconds, e.g. after changing Growing Up Speed. */
function settingsNote(t){ const h=$('#screen-settings .title'); clearTimeout(settingsNote.tm); h.textContent=t; h.classList.add('note');
  settingsNote.tm=setTimeout(()=>{ h.textContent='Settings'; h.classList.remove('note'); },9000); }
function growChangeSay(){ const n=state.name, at=nextGrowAt(), h=state.hearts, next=at==null?null:STAGE_WORD[kind()][(state.stage||0)+1];
  if(at==null) return `${n} is already a ${stageWord()}, so nothing changes for ${n}.`;
  if(h>=at) return `${n} has ${h} paw prints, which is enough, so ${n} grows into a ${next} when you go back to the room. ${n} never gets younger.`;
  return `${n} stays a ${stageWord()} with ${h} paw prints, and grows into a ${next} at ${at}. That's ${at-h} to go. ${n} never gets younger.`; }
function growLine(){ const n=state.name, at=nextGrowAt(); if(at==null) return `${n} is all grown up, a ${stageWord()}.`;
  return `${n} grows into a ${STAGE_WORD[kind()][(state.stage||0)+1]} at ${at} paw prints. ${at-state.hearts} to go.`; }
/* Something the game says by itself: shown, read aloud, and choices wait a moment so a press meant
   for something else does nothing. */
function announce(text){ setCaption(text); lockInput(2000); }

/* ---- Toys ---- */
const TOYS={
  dog:[['ball','tennis ball',0],['duck','rubber duck',1],['bone','chew bone',0],['frisbee','flying disc',0],['bunny','plush bunny',1],['ring','rope ring',0],['kong','bouncy chew toy',0],['hedgehog','squeaky hedgehog',1],['burger','squeaky burger',1],['football','little football',0]],
  cat:[['yarn','ball of yarn',0],['mouse','toy mouse',1],['feather','feather toy',0],['crinkle','crinkle ball',0],['spring','bouncy spring',0],['fishy','plush fish',0],['bellball','jingle ball',0],['catnip','catnip pillow',0],['bee','buzzy bee',1]]
};
const STARTER_TOYS={dog:['ball','duck','bone'],cat:['yarn','mouse','feather']};
const toyInfo=id=>TOYS.dog.concat(TOYS.cat).find(t=>t[0]===id);
const toyName=id=>(toyInfo(id)||[0,'toy'])[1];
const toySqueaks=id=>!!(toyInfo(id)||[])[2];
function ownedToys(){ if(!state) return STARTER_TOYS.dog; const k=kind(), all=TOYS[k].map(t=>t[0]); if(!Array.isArray(state.toys)) state.toys=STARTER_TOYS[k].slice(); const own=state.toys.filter(t=>all.includes(t)); return own.length?own:STARTER_TOYS[k].slice(); }
const unownedToys=()=>TOYS[kind()].map(t=>t[0]).filter(t=>!ownedToys().includes(t));
function toySound(id){ return toySqueaks(id)?'squeak':id==='bellball'?'sparkle':id==='crinkle'?'rustle':'bounce'; }

/* ---- Care star milestones ---- */
const MILESTONES=[
  {at:3,type:'toy',id:'toy1'},{at:5,type:'trick',id:'sit'},{at:8,type:'decor',id:'bowl'},{at:10,type:'decor',id:'bed'},{at:12,type:'treat',id:'cake'},
  {at:15,type:'trick',id:'spin'},{at:18,type:'toy',id:'toy2'},{at:20,type:'decor',id:'lights'},{at:23,type:'decor',id:'couch'},{at:25,type:'trick',id:'paw'},
  {at:28,type:'outing',id:'outing1'},{at:32,type:'toy',id:'toy3'},{at:35,type:'decor',id:'photo'},{at:40,type:'decor',id:'shelf'},{at:45,type:'trick',id:'dance'},
  {at:50,type:'treat',id:'feast'},{at:55,type:'decor',id:'rug'},{at:60,type:'decor',id:'wallpaper'},{at:65,type:'toy',id:'toy4'},{at:70,type:'trick',id:'speak'},
  {at:75,type:'outing',id:'outing2'},{at:80,type:'decor',id:'bed2'},{at:90,type:'decor',id:'award'}];
const OLD_MS=['sit','bed','spin','lights','paw','photo','dance','rug','speak','award'];
const TRICK_NAME={sit:'Sit',spin:'Spin',paw:'High five',dance:'Dance',speak:()=>kind()==='cat'?'Meow on cue':'Speak'};
const DECOR_NAME={bowl:'a fancy food and water bowl',bed:'a cozy pet bed',lights:'twinkly string lights',couch:'a comfy couch',photo:()=>`a framed photo of you and ${state.name}`,
  shelf:'a toy shelf',rug:'a rainbow rug',wallpaper:'starry new wallpaper',bed2:'a royal pet bed',award:'a Best Friends trophy'};
/* Where each home reward goes when it arrives. The player can change or move it afterwards. */
const DECOR_MS={bed:['bed','floorL'],lights:['lights','ceil'],couch:['couch','backC'],shelf:['toyShelf','backL'],rug:['rugRainbow','rug'],bed2:['royalBed','floorL'],award:['trophyShelf','wallR']};
const TREAT_NAME={cake:()=>kind()==='cat'?'a kitty cupcake':'a pup cake',feast:()=>kind()==='cat'?'a fancy fish dinner':'a fancy steak dinner'};
const OUTING_EVENT={dog:{outing1:'parade',outing2:'agility'},cat:{outing1:'cafe',outing2:'catshow'}};
const OUTING_NAME={parade:'the Pet Parade',agility:'the agility show',cafe:'the cat café',catshow:'the cat show'};
const msGot=()=>state?(state.msGot||[]):[];
function msName(m){
  if(m.type==='trick'||m.type==='decor'){ const t=(m.type==='trick'?TRICK_NAME:DECOR_NAME)[m.id]; return typeof t==='function'?t():t; }
  if(m.type==='treat') return TREAT_NAME[m.id]();
  if(m.type==='outing') return OUTING_NAME[OUTING_EVENT[kind()][m.id]];
  const toy=(state&&state.msToys||{})[m.id]; return toy?`a new ${toyName(toy)}`:'a surprise toy'; }
const MS_TYPE={trick:'Trick',decor:'Home',toy:'Toy',treat:'Treat',outing:'Outing'};
const decorOn=id=>msGot().includes(id);
const learnedTricks=()=>MILESTONES.filter(m=>m.type==='trick'&&msGot().includes(m.id)).map(m=>m.id).concat((state&&state.tricks)||[],schoolTricks()).filter((t,i,a)=>a.indexOf(t)===i&&V['trick:'+t]);
const learnedTreats=()=>MILESTONES.filter(m=>m.type==='treat'&&msGot().includes(m.id)).map(m=>m.id);
const unlockedOutings=()=>state?MILESTONES.filter(m=>m.type==='outing'&&msGot().includes(m.id)).map(m=>OUTING_EVENT[kind()][m.id]):[];
const nextMilestone=()=>state?MILESTONES.find(m=>!msGot().includes(m.id))||null:null;
function pendingMilestone(){ const m=nextMilestone(); return m&&(state.stars||0)>=m.at?m:null; }
function addStars(k){ state.stars=(state.stars||0)+k; for(let i=0;i<k;i++) spawn('star',64+rand(-16,16),52,rand(-6,6),-16,1.6); play('sparkle',.45); updateHeader(); save(); }
function applyDecorMs(id){ const r=room(); if(id==='wallpaper') r.wall='stars';
  else if(id==='photo'){ let s=spotOf('frameWood'); if(!s){ const free=['wallC','wallR','wallL'].find(k=>!r.spots[k]); if(free){ r.spots[free]='frameWood'; s=SPOT[free]; } } r.pics.frameWood={t:'art',id:'portrait'}; }
  else if(DECOR_MS[id]){ const [item,spot]=DECOR_MS[id]; placeInRoom(r,item,spot); }
  bumpRoom(); }
function placeInRoom(r,item,spotId){ SPOTS.forEach(s=>{ if(r.spots[s.id]===item) r.spots[s.id]=null; }); if(r.spots[spotId]==='window') return; r.spots[spotId]=item; if(!r.spots.floorL) r.spots.floorL='petBed'; }
let lastCelebrate=0;
function celebrate(m){
  lastCelebrate=Date.now(); nextEvent=Math.max(nextEvent,Date.now()+EVENT_GAP[0]*paceK()); lockInput(2000);
  state.msGot=msGot().concat([m.id]); state.msDone=state.msGot.length; save(); const n=state.name, name=msName(m);
  if(m.type==='trick'){ announce(`You taught ${n} a new trick: ${name}!`); startAnim('trick:'+m.id,V['trick:'+m.id].dur,()=>{ setCaption(`${n} learned ${name}. Great teaching!`); addPhoto('trick',`${n} learned a new trick: ${name}.`); quietUntil=Date.now()+6000; }); }
  else if(m.type==='toy'){ const un=unownedToys(), toy=un.length?un[0]:pick(ownedToys()); state.msToys=Object.assign({},state.msToys||{},{[m.id]:toy}); save();
    runEvent('gift',{toy,box:'blue',reward:true}); anim.idle=false; announce(`You earned a surprise present for ${n}!`); play('dingdong',.5); }
  else if(m.type==='treat'){ announce(`You unlocked a special treat: ${name}!`); startAnim('feed:'+m.id,V['feed:'+m.id].dur,()=>{ setCaption(`${n} loved it! Look for ${name} at mealtime.`); addPhoto('treat',`${n} tried ${name}.`); quietUntil=Date.now()+6000; }); }
  else if(m.type==='outing'){ const ev=OUTING_EVENT[kind()][m.id]; runEvent(ev,{}); anim.idle=false; }
  else { applyDecorMs(m.id); markSeen(); announce(`Your home got cozier! You added ${name}.`); startAnim('decor:0',V['decor:0'].dur,()=>{ addPhoto('decor',`The home got cozier: ${name}.`); setCaption('You can change or move it in Decorate Home, in More to Do.'); quietUntil=Date.now()+6000; }); }
}

/* ---- Unlock announcements (outfits and home items unlock with care stars) ---- */
const outfitUnlocked=c=>OUTFITS[c].filter(([id,,at])=>(state.stars||0)>=at||(id==='bow'&&state.bowUnlocked)||(state.gifted||[]).includes(id));
function unlockedKeys(){ const keys=[]; OUT_CATS.forEach(c=>outfitUnlocked(c).forEach(i=>keys.push('o:'+i[0])));
  Object.values(DECOR).forEach(d=>{ if(typeof d.unlock==='number'&&isUnlocked(d.unlock)) keys.push('d:'+d.id); });
  [['w',WALLPAPERS],['f',FLOORS],['c',CURTAINS],['p',PICTURES]].forEach(([p,T])=>Object.keys(T).forEach(k=>{ if(typeof T[k].unlock==='number'&&isUnlocked(T[k].unlock)) keys.push(p+':'+k); })); return keys; }
function keyLabel(k){ const [p,id]=k.split(':'); if(p==='o'){ const c=OUT_CATS.find(c=>OUTFITS[c].some(i=>i[0]===id)); return OUTFITS[c].find(i=>i[0]===id)[1]; }
  return ({d:DECOR,w:WALLPAPERS,f:FLOORS,c:CURTAINS,p:PICTURES})[p][id].label; }
function markSeen(){ state.seen=unlockedKeys(); save(); }
function checkUnlocks(){ if(!Array.isArray(state.seen)){ markSeen(); return false; } const fresh=unlockedKeys().filter(k=>!state.seen.includes(k)); if(!fresh.length) return false;
  state.seen=state.seen.concat(fresh); save(); const outfits=fresh.filter(k=>k[0]==='o').map(keyLabel), home=fresh.filter(k=>k[0]!=='o').map(keyLabel);
  const few=l=>l.slice(0,2).join(' and ')+(l.length>2?` and ${l.length-2} more`:'');
  const bits=[]; if(outfits.length) bits.push(`New outfit${outfits.length>1?'s':''}: ${few(outfits)}! Try ${outfits.length>1?'them':'it'} in Dress Up.`); if(home.length) bits.push(`New for your home: ${few(home)}! Try ${home.length>1?'them':'it'} in Decorate Home.`);
  state.moreNew=true; updateMoreBadge(); announce(bits.join(' ')+' Find it in More to Do.'); play('ding',.6); burst(5); return true; }

/* ---- Chores: something in the room needs care until the player takes care of it ---- */
const TASKS={
  potty:{kind:'dog',label:'Clean up',w:0,stars:2,appear:n=>`${n} used the potty pad. Time to clean it up.`,nag:n=>`${n}'s potty pad has two nuggets and it's stinky! Please clean it up.`,done:n=>`All clean! Thanks for taking care of ${n}.`},
  litter:{kind:'cat',label:'Scoop litter',w:0,stars:2,appear:n=>`${n}'s litter box needs scooping.`,nag:n=>`${n}'s litter box has two nuggets and it's stinky! Please scoop it.`,done:n=>`Fresh and clean! ${n} is happy.`},
  water:{kind:'both',label:'Fresh water',w:3,stars:1,appear:n=>`${n}'s water bowl is empty.`,nag:n=>`${n} is still waiting for fresh water.`,done:n=>`Slurp! ${n} loves the fresh water.`,stat:{food:10}},
  toys:{kind:'dog',label:'Pick up toys',w:2,stars:1,appear:n=>`${n} left toys all over the floor.`,nag:()=>`The toys are still on the floor.`,done:()=>`All the toys are back in the basket.`},
  plant:{kind:'cat',label:'Tidy up',w:1,stars:2,appear:n=>`Oops! ${n} knocked over the plant.`,nag:()=>`The plant is still tipped over.`,done:()=>`The plant is back where it belongs.`},
  vet:{kind:'both',label:'Vet visit',w:1,stars:3,appear:n=>`It's time for ${n}'s checkup at the vet.`,nag:n=>`${n}'s checkup is waiting.`,done:n=>`${n} is healthy and happy! Great job keeping up with checkups.`,stat:{food:10,fun:10,clean:10,energy:10}}
};
let lastEvent=null, nextEvent=0, nextTask=0, lastTaskNag=0, lastTask=null;
function spawnTask(){
  const k=kind(), list=Object.keys(TASKS).filter(id=>TASKS[id].w>0&&(TASKS[id].kind===k||TASKS[id].kind==='both')&&id!==lastTask&&(id!=='plant'||plantAnchor())).map(id=>[id,TASKS[id].w]), id=weightedPick(list);
  lastTask=id; state.task=id; save(); refreshGameTargets(); announce(TASKS[id].appear(state.name)); play('ding',.5);
  const now=Date.now(); lastTaskNag=now; quietUntil=now+6000; nextEvent=Math.max(nextEvent,now+EVENT_GAP[0]*paceK());
}
function doTask(){
  if(anim||!state.task){ nope(); return; }
  const id=state.task, t=TASKS[id], key='task:'+id; play('choose');
  const finish=()=>{
    if(id==='potty'||id==='litter'){ state.pottyN=0; state.pottyAt=0; }
    state.task=null; if(t.stat) Object.keys(t.stat).forEach(s=>state.stats[s]=clamp(state.stats[s]+t.stat[s],FLOOR,100));
    refreshGameTargets(); addStars(t.stars); state.hearts++; updateMeters(); updateHeader(); save(); burst(6);
    setCaption(`${t.done(state.name)} You earned ${t.stars} care ${t.stars===1?'star':'stars'}.`);
    if(id==='vet'&&firstTime('vet')) addPhoto('vet',`${state.name}'s first checkup. Healthy and happy!`);
    nextTask=Date.now()+gap(TASK_GAP); lastWant=null; quietUntil=Date.now()+6000;
  };
  if(id==='vet'){ startTrip('vet',finish); return; }
  startAnim(key,V[key].dur,finish); if(V[key].start) V[key].start(anim);
}

/* ---- Save and load ---- */
function cleanOutfit(o,bow){ const out={}; if(o&&typeof o==='object') OUT_CATS.forEach(c=>{ if(OUTFITS[c].some(i=>i[0]===o[c])) out[c]=o[c]; }); if(bow&&!out.hat) out.hat='bow'; return out; }
function migrateRoom(got){ const r=defaultRoom(), saved=state; state={room:r,msGot:got,stars:0}; try{ got.forEach(id=>{ if(DECOR_MS[id]||id==='wallpaper'||id==='photo') applyDecorMs(id); }); } finally { state=saved; } return r; }
/* Save upgrades: a save from any older version of the game loads through cleanSave. It keeps only the
   parts it knows, checks each one, and fills in anything new with a fresh start (a new feature simply
   begins as "not started yet"), so an old save never breaks and the pet keeps its name, look, paw
   prints, stage, stars, tricks, photos and home. Each save records SAVE_VER, the version that wrote it. */
const SAVE_VER=4;
function cleanSchool(o){ if(!o||typeof o!=='object'||Array.isArray(o)) return undefined; const cur=CLASSES[o.cur]?o.cur:null;
  return {cur,lesson:cur?clamp(Math.floor(Number(o.lesson)||0),0,2):0,done:Array.isArray(o.done)?o.done.filter((x,i,a)=>CLASSES[x]&&a.indexOf(x)===i):[]}; }
function load(){ return cleanSave(readJSON(SAVE_KEY)||readJSON(OLD_SAVE_KEY)); }
function cleanSave(s){
  if(!s||typeof s!=='object'||typeof s.name!=='string') return null;
  let style=s.style;
  if(!STYLES[style]){ style={white:'cream',black:'black',brown:'chocolate'}[s.color]; if(!style) return null; }
  const st={}; KEYS.forEach(k=>{ const v=Number(s.stats&&s.stats[k]); st[k]=clamp(isFinite(v)?v:70,FLOOR,100); });
  const hearts=Math.max(0,Math.floor(Number(s.hearts)||0)), msDone=Math.max(0,Math.floor(Number(s.msDone)||0));
  const got=Array.isArray(s.msGot)?s.msGot.filter(x=>typeof x==='string'):OLD_MS.slice(0,msDone);
  const stage=Number.isInteger(s.stage)?clamp(s.stage,0,3):((typeof s.grown==='boolean'?s.grown:hearts>=30)?2:0);
  const album=Array.isArray(s.album)?s.album.filter(x=>x&&typeof x.t==='string'&&STYLES[x.st]).slice(-40):[];
  album.forEach((p,i)=>{ if(typeof p.d!=='number') p.d=Date.now()-(album.length-i)*1000; });
  return {id:(typeof s.id==='string'&&/^[\w-]{1,32}$/.test(s.id))?s.id:newPetId(),style,name:(s.name.trim().slice(0,12)||'Pal'),stats:st,hearts,stage,bowUnlocked:!!(s.bowUnlocked||s.bow),outfit:cleanOutfit(s.outfit,s.bow),album,
    friends:Array.isArray(s.friends)?s.friends.filter(f=>f&&typeof f.name==='string'&&STYLES[f.style]).slice(-6):[],firsts:(s.firsts&&typeof s.firsts==='object')?s.firsts:{},
    seen:Array.isArray(s.seen)?s.seen:null,stars:Math.max(0,Math.floor(Number(s.stars)||0)),msDone:got.length,msGot:got,msToys:(s.msToys&&typeof s.msToys==='object')?s.msToys:{},
    school:cleanSchool(s.school),companions:cleanComps(s.companions,hearts),compAskAt:Number(s.compAskAt)||0,rushAt:Number(s.rushAt)||0,rushVisits:Math.max(0,Math.floor(Number(s.rushVisits)||0)),noCompOffer:!!s.noCompOffer,task:TASKS[s.task]?s.task:null,pottyN:clamp(Math.floor(Number(s.pottyN)||0),0,2),toyPlays:(s.toyPlays&&typeof s.toyPlays==='object'&&!Array.isArray(s.toyPlays))?Object.fromEntries(Object.entries(s.toyPlays).filter(([k,v])=>toyInfo(k)&&isFinite(v)).map(([k,v])=>[k,Math.max(0,Math.floor(v))])):{},pottyAt:Number(s.pottyAt)||0,muddy:!!s.muddy,seasonal:(s.seasonal&&typeof s.seasonal==='object')?s.seasonal:{},tricks:Array.isArray(s.tricks)?s.tricks.filter(t=>typeof t==='string'):[],treats:Array.isArray(s.treats)?s.treats.filter(t=>typeof t==='string'):[],gifted:Array.isArray(s.gifted)?s.gifted.filter(t=>typeof t==='string'):[],
    lastPlace:typeof s.lastPlace==='string'?s.lastPlace:null,lastGroom:typeof s.lastGroom==='string'?s.lastGroom:null,visits:(s.visits&&typeof s.visits==='object')?s.visits:{},moreNew:s.moreNew===false?false:undefined,toys:Array.isArray(s.toys)?s.toys.filter(t=>typeof t==='string'&&toyInfo(t)):null,
    room:cleanRoom(s.room)||migrateRoom(got),born:Number(s.born)||Date.now(),lastSeen:Number(s.lastSeen)||Date.now()};
}
let lastSave=0;
function save(){ if(!state) return; state.lastSeen=Date.now(); state.ver=SAVE_VER; writeJSON(SAVE_KEY,state); lastSave=Date.now(); }
function applyAway(ms){ const sec=Math.max(0,ms/1000); KEYS.forEach(k=>{ state.stats[k]=Math.max(floorOf(k),state.stats[k]-RATES[k]*sec*AWAY); }); }

/* ---- Actions per pet kind ---- */
const SLOTS={
  dog:{feed:['feed','Feed','feed'],play:['play','Play','ball'],special:['out','Go Out','walk'],cuddle:['cuddle','Cuddle','cuddle'],clean:['bath','Bath','bath'],nap:['nap','Nap','nap']},
  cat:{feed:['feed','Feed','feed'],play:['play','Play','yarn'],special:['out','Go Out','walk'],cuddle:['cuddle','Cuddle','cuddle'],clean:['brush','Brush','brush'],nap:['nap','Nap','nap']}
};
const WANT_SLOT={food:'feed',fun:'play',clean:'clean',energy:'nap',love:'cuddle'};
const SLOT_WANT={feed:'food',play:'fun',clean:'clean',nap:'energy',cuddle:'love'};
const ACT_WANT={cuddle:'love',feed:'food',play:'fun',out:'fun',walk:'fun',explore:'fun',bath:'clean',brush:'clean',nap:'energy'};
const slotIcon=slot=>SLOTS[kind()][slot][2];
/* Said once when a need gets low: how the pet feels, and which thing in the room helps. */
const LOW_MSG={ food:n=>`${n} is very hungry. Try the food bowl.`, fun:n=>`${n} really wants to play. Try the toy basket.`,
  clean:n=>kind()==='dog'?`${n} really needs a bath. Try the bath caddy.`:`${n} really needs a brushing. Try the brush.`,
  energy:n=>`${n} is very sleepy. Try the bed.`, love:n=>`${n} really wants a cuddle. Choose ${n} to cuddle.` };
let lowSaid=null, lastReadAt=0;
const WANT_MSG={ love:n=>kind()==='cat'?`${n} wants some love and cuddles.`:`${n} is giving you big puppy eyes. Cuddle time?`, food:n=>`${n} is hungry.`, fun:n=>`${n} wants to play.`, clean:n=>kind()==='dog'?`${n} could use a bath.`:`${n} could use a brushing.`, energy:n=>`${n} is getting sleepy.` };
/* What the pet sounds like when it asks: gentle sounds, never a long whine. */
function wantVoice(w){ const low=state.stats[w]<LOW;
  if(kind()==='dog') return low?'pet:whimper':{food:'pet:bark',fun:'pet:barkHappy',clean:'pet:sigh',energy:'pet:yawn',love:'pet:whimper'}[w];
  return low?'pet:meowSad':{food:'pet:meow',fun:'pet:trill',clean:'pet:meow',energy:'pet:yawn',love:'pet:meowSad'}[w]; }
const MSG={
  'feed:bowl':n=>`${n} enjoyed dinner.`, 'feed:treat':n=>`Catch! ${n} caught a treat.`, 'feed:bone':n=>`${n} chews a tasty bone.`,
  'feed:fish':n=>`Catch! ${n} snapped up a fish treat.`, 'feed:milk':n=>`${n} laps up some cat milk.`,
  'play:ball':n=>`Fetch! ${n} chases the ball.`, 'play:tug':n=>`Tug of war! ${n} is pulling hard.`, 'play:squeak':n=>`Squeak! ${n} loves the duck toy.`,
  'play:yarn':n=>`${n} pounces on the yarn!`, 'play:wand':n=>`${n} leaps for the feather wand!`, 'play:laser':n=>`${n} chases the laser dot!`,
  'walk:park':n=>`Walk time! ${n} heads to the park.`, 'walk:beach':n=>`Walk time! ${n} heads to the beach.`, 'walk:woods':n=>`Walk time! ${n} explores the autumn woods.`, 'walk:dogpark':n=>`Walk time! Off to the dog park.`,
  'play:toybox':n=>`Toy time! ${n} picks a toy from the toy basket.`, 'play:fetch':n=>kind()==='cat'?`Toss a toy for ${n}!`:`Let's play fetch with ${n}!`, 'play:frisbee':n=>`Frisbee time with ${n}!`, 'feed:cake':n=>kind()==='cat'?`A special kitty cupcake for ${n}!`:`A special pup cake for ${n}!`, 'feed:feast':n=>`A fancy dinner is served! ${n} feels so special.`, 'explore:bag':n=>`${n} found a paper bag!`, 'explore:garden':n=>`${n} heads out to explore the garden.`,
  'explore:box':n=>`${n} found a box!`, 'explore:tree':n=>`${n} climbs the cat tree.`, 'explore:tunnel':n=>`${n} dives into the tunnel!`,
  'cuddle:hearts':n=>kind()==='cat'?`${n} purrs.`:`${n} leans in for a cuddle.`, 'cuddle:pats':n=>`Pat pat. ${n} loves head pats.`, 'cuddle:blanket':n=>`${n} snuggles in a cozy blanket.`,
  'bath:bubbles':n=>`Bubble bath! ${n} is clean and fluffy.`, 'bath:tub':n=>`Splish splash! ${n} and the rubber duck.`, 'bath:shake':n=>`Rinse time for ${n}.`,
  'brush:brush':n=>`Brush, brush. ${n} is purring.`, 'brush:groom':n=>`${n} cleans behind the ears.`, 'brush:bow':n=>`Spa day for ${n}!`,
  'nap:dim':n=>`${n} is taking a nap.`, 'nap:bed':n=>`${n} curls up in bed.`, 'nap:sun':n=>skyMode()==='night'?`${n} naps in the moonlight.`:`${n} naps in a warm sunbeam.`
};
/* Cats explore the house in play now; and treats from the pet store. */
['box','tree','tunnel','bag'].forEach(v=>{ MSG['play:'+v]=MSG['explore:'+v]; });
MSG['feed:cookie']=n=>`Catch! ${n} snaps up a peanut butter cookie.`; MSG['feed:shrimp']=n=>`Catch! ${n} gobbles a shrimp treat.`;
const FULL_MSG={ cuddle:n=>`${n} already feels loved, but one more cuddle is always nice.`, feed:n=>`${n} was full, so that was a small treat.`, play:n=>`${n} is always up for a game.`, walk:n=>`${n} is always happy to go out.`, explore:n=>`${n} always loves to explore.`,
  bath:n=>`${n} was already clean. Extra bubbles anyway.`, brush:n=>`${n} was already soft. More brushing is nice.`, nap:n=>`${n} wasn't tired, but rested anyway.` };
const happyLine=()=>{ const n=state.name; return pick(kind()==='dog'?[`${n} is happy.`,`${n} is wagging.`,`${n} is glad you're here.`]:[`${n} is happy.`,`${n} is purring.`,`${n} is glad you're here.`]); };

/* ================= HUD ================= */
function updateHeader(){
  if(!state) return;
  $('#brand').textContent=state.name; $('#stage-chip').textContent=STAGE_LABEL[kind()][stageIdx()];
  const at=nextGrowAt(), h=$('#hearts'); h.textContent='🐾 '+state.hearts+(at!=null?' / '+at:''); h.setAttribute('aria-label',state.hearts+' paw prints'+(at!=null?'. Grows at '+at:''));
  const st=$('#stars'); st.textContent='★ '+(state.stars||0); st.setAttribute('aria-label',(state.stars||0)+' care stars');
  const wx=$('#wx'); if(wx){ const w=WEATHER[wxNow()]; const moon=wxNow()==='sunny'&&skyMode()==='night', lab=moon?'clear night':w.label.toLowerCase(); wx.textContent=w.icon; wx.hidden=moon; wx.setAttribute('aria-label',`${SEASON_WORD[calSeason()]}, ${lab}`); wx.title=`${SEASON_WORD[calSeason()][0].toUpperCase()+SEASON_WORD[calSeason()].slice(1)}, ${lab}`; }
  updateMoreBadge();
}

/* ================= Main menu, how to, exit ================= */
function refreshMenu(){
  const others=otherPets().filter(p=>!state||p.id!==state.id).length, items=[];
  if(state) items.push({label:`Continue with ${state.name}`,fn:startPlay});
  if(state||others) items.push({label:state?'Choose A Different Pet':'Choose Your Pet',fn:()=>{ play('choose'); openPets('choose',state?'Choose A Different Pet':'Choose your pet'); }});
  else items.push({label:'Play',fn:startPlay});
  renderList('menu-list',items.concat([
    {label:'Load a Saved Game',sub:'Warning: might not be accessible with switches',say:'Load a saved game. Warning: picking the file might not be accessible with switches',fn:openLoad},
    {label:'How to Play',fn:()=>{ play('choose'); howPage=0; buildHowto(); show('howto',HOWTO[0].join(' ')); }},
    {label:'Settings',fn:()=>openSettings('menu')},
    {label:'Exit Game',fn:exitGame}]),{cols:1,maxw:520});
}
function openMenu(intro){ refreshMenu(); shelterSet(state?[]:[{style:'golden',x:34},{style:'tabby',x:94,fit:{hat:'bow'}}]); show('menu',intro); }
function startPlay(){ play('choose'); if(state&&Date.now()-state.lastSeen>=WELCOME_AWAY) welcomeDue=true; if(state) enterGame(Date.now()-state.lastSeen>5*60*1000,false); else openKind(); }
const HOWTO=[
  ['Adopt a puppy or a kitten from the NARBE Pet Pals Rescue, then take care of it.','Everything you can do is in the room: the food bowl feeds, the toy basket plays, the door goes out to fun places, the bath caddy cleans, the bed is for naps, and choosing your pet gives it a cuddle.'],
  ['When your pet needs something, a heart floats over the thing that helps.','Every choice earns a paw print. With enough paw prints your pet grows up: from a baby, to a teen, to a grown-up, and one day a wise senior.'],
  ['Care stars come from giving your pet what it asks for and from chores.','Stars unlock outfits, tricks, toys, and new things for your home. Try them in More to Do, the button next to Pause: Dress Up, Decorate Home, the Photo Album, and Progress.'],
  ['Now and then something special happens by itself. While it starts, the game waits a moment before your next choice counts.','Hold Enter to pause. Your pet never gets sick, and there are no wrong choices. Take all the time you like.']];
let howPage=0;
function buildHowto(){ const b=$('#howto-body'); b.innerHTML=`<div class="howto-text"><h3>${['Welcome','Growing up','Care stars','Good to know'][howPage]}</h3>`+HOWTO[howPage].map(t=>`<p>${t}</p>`).join('')+'</div>'+
    `<div class="howto-demo fit" data-aspect="${DEMO_W/DEMO_H}"><canvas id="howto-demo" data-lw="${DEMO_W}" data-lh="${DEMO_H}" role="img"></canvas></div>`;
  startHowtoDemo(howPage);
  renderList('howto-list',[{label:`Next page (${howPage+1} of ${HOWTO.length})`,say:'Next page',fn:()=>{ play('blip'); howPage=(howPage+1)%HOWTO.length; buildHowto(); layoutAll(); voice.speak(HOWTO[howPage].join(' ')); }},
    {label:'Back',fn:()=>{ play('blip'); openMenu('Main menu'); }}],{cols:2,maxw:620}); }
function exitGame(){ save(); play('choose');
  if(window.parent&&window.parent!==window){ window.parent.postMessage({action:'focusBackButton'},'*'); openMenu(); }
  else window.location.href='../../../index.html'; }

/* ================= The rescue: choosing a pet in the scene ================= */
let draftKind='dog', draftStyle='golden', rescuePage=0, adoptIdx=-1, adoptLock=false;
let shelterPets=[];
function shelterSet(list){ shelterPets=list.map(o=>Object.assign({act:'sit',until:0,t0:0,dir:1,lastPose:null},o)); }
function shelterPose(sp,now,hl){
  const p={eyes:'open',mouth:'smile',tail:Math.floor((now+sp.x*37)/450)%3,ear:0,headDy:0,dx:0,dy:0};
  if(now>sp.until){ sp.act=pick(sp.stay?['sit','sit','wag','look','hop','yawn','play']:['sit','sit','wag','look','hop','yawn','walk','walk','play']); sp.t0=now; sp.until=now+rand(1800,3800); sp.dir=Math.random()<.5?-1:1; }
  const e=now-sp.t0, D=sp.until-sp.t0;
  if(sp.act==='wag'){ p.tail=Math.floor(now/120)%3; p.eyes='happy'; }
  else if(sp.act==='look'){ p.dx=Math.round(Math.sin(e/600)*2); p.ear=Math.floor(e/400)%2; }
  else if(sp.act==='hop'){ p.dy=-Math.round(Math.abs(Math.sin(e/170))*3); p.eyes='happy'; p.mouth='tongue'; }
  else if(sp.act==='yawn'){ if(e<1200){ p.eyes='closed'; p.mouth='open'; } }
  else if(sp.act==='walk'){ const k=e/D; p.dx=Math.round(Math.sin(k*Math.PI)*6*sp.dir); if(k>.06&&k<.94){ p.body='walk'; p.face=Math.cos(k*Math.PI)*sp.dir>=0?1:-1; p.frame=Math.floor(e/150)%4; } }
  else if(sp.act==='play'){ p.eyes='happy'; p.mouth='open'; p.ear=Math.floor(e/200)%2; p.dx=Math.round(Math.sin(e/200)*2); }
  if(!p.body&&(now+sp.x*97)%4300<140) p.eyes='closed';
  if(hl){ p.body=null; p.dx=0; p.eyes='happy'; p.mouth='tongue'; p.dy=-Math.round(Math.abs(Math.sin(now/170))*3); p.tail=Math.floor(now/110)%3; }
  if(sp.adopted){ p.body=null; p.dx=0; p.eyes='happy'; p.mouth='tongue'; p.dy=-Math.round(Math.abs(Math.sin(now/150))*5); }
  return p; }
const shelterRect=sp=>{ const p=sp.lastPose||{dx:0,dy:0}, w=Math.min(34,(sp.cw||19)*1.8); return [sp.x-w/2+(p.dx||0),52+(p.dy||0),w,34]; };
function renderShelter(now){
  drawShelter();
  shelterPets.forEach(sp=>{
    const hl=!!(focusT&&focusT.sp===sp&&layer!=='name'), p=shelterPose(sp,now,hl); sp.lastPose=p;
    const cw=sp.cw||19; softShadow(ctx,sp.x,87,cw+1,3,.3); pxEll(ctx,sp.x,85,cw,5.5,'#6A4A3A'); pxEll(ctx,sp.x,84.5,cw-1,4.6,sp.cushion||'#F2A7B5'); pxEll(ctx,sp.x,83.5,cw*.68,2.6,'#FFFFFF55');
    /* scale<1 draws the pet a little smaller, standing on its cushion, where pets are side by side */
    const k=sp.scale||1; if(k<1){ ctx.save(); ctx.translate(sp.x,85); ctx.scale(k,k); ctx.translate(-sp.x,-85); }
    drawPetPose(ctx,sp.style,sp.sg||'baby',p,sp.fit||null,sp.x-22+p.dx,42+p.dy,hl);
    if(k<1) ctx.restore();
    if(hl||sp.adopted){ blit(ctx,SPR.heart,sp.x-3.5,20+Math.sin(now/250)*2); }
  });
}
TARGET_BUILD.kind=()=>shelterPets.filter(sp=>sp.fn).map(sp=>({id:sp.label,label:sp.label,tag:sp.label,say:sp.say||sp.label,sp,rect:()=>shelterRect(sp),fn:()=>sp.fn()}));
TARGET_BUILD.color=TARGET_BUILD.kind; TARGET_BUILD.pets=TARGET_BUILD.kind;
function openKind(){ adoptLock=false;
  shelterSet([{style:'golden',x:34,label:'Puppy',say:'Adopt a puppy',cushion:'#9FC4E8',fn:()=>chooseKind('dog')},{style:'tabby',x:94,label:'Kitten',say:'Adopt a kitten',cushion:'#F2A7B5',fn:()=>chooseKind('cat')}]);
  show('kind','Every pet deserves a loving home. Would you like to adopt a puppy or a kitten?'); }
$('#kind-back').addEventListener('click',()=>{ play('blip'); cancelAdoption(); refreshMenu(); openMenu('Main menu'); });
function chooseKind(k){ draftKind=k; rescuePage=0; play('choose'); later(()=>play(k==='dog'?'dog:bark:baby':'cat:meow:baby'),150); openColors(rescueLine()); }
const rescueLine=()=>`Welcome to the NARBE Pet Pals Rescue. These ${draftKind==='dog'?'puppies':'kittens'} are hoping for a loving home. Who will you adopt?`;
const CUSHIONS=['#9CC7A7','#F2A7B5','#9FC4E8','#F4D27A','#C9B0E8'];
function openColors(intro){ adoptIdx=-1; adoptLock=false; const word=draftKind==='dog'?'puppy':'kitten', list=KIND_STYLES[draftKind], pages=Math.ceil(list.length/5), sp=clamp((VIEW.w-26)/5,31,42);
  shelterSet(list.slice(rescuePage*5,rescuePage*5+5).map((st,i)=>({style:st,x:64+(i-2)*sp,cw:Math.min(19,sp*.5),label:STYLES[st].label,say:`${STYLES[st].label} ${word}`,cushion:CUSHIONS[i],fn:()=>adopt(st,i)})));
  $('#rescue-title').textContent=`Meet the ${word==='puppy'?'puppies':'kittens'} (${rescuePage+1} of ${pages})`;
  $('#color-more').textContent=`Meet more ${word==='puppy'?'puppies':'kittens'}`; $('#color-more').dataset.say=`Meet more ${word==='puppy'?'puppies':'kittens'}`;
  /* "Meet more" turns the page in place, so it still starts on the first new pet. */
  show('color',intro,layer==='color'?{focus:0}:undefined); }
$('#color-more').addEventListener('click',()=>{ if(adoptLock) return; rescuePage=(rescuePage+1)%Math.ceil(KIND_STYLES[draftKind].length/5); play('blip'); openColors('More pets waiting for a home'); });
$('#color-back').addEventListener('click',()=>{ if(adoptLock) return; play('blip'); openKind(); });
function adopt(st,i){ if(adoptLock) return; adoptLock=true; adoptIdx=i; draftStyle=st; const word=draftKind==='dog'?'puppy':'kitten'; play('choose'); later(()=>play(draftKind==='dog'?'dog:barkHappy:baby':'cat:trill:baby'),150); later(()=>play('happy',.6),500);
  shelterPets[i].adopted=true; for(let k=0;k<8;k++) spawn('heart',shelterPets[i].x+rand(-10,10),60,rand(-6,6),-16,1.6);
  voice.speak(`You adopted the ${STYLES[st].label.toLowerCase()} ${word}! Welcome to the family.`);
  later(()=>{ $('#name-title').textContent=`Name your new ${word}`; buildNames(); adoptLock=false; adoptIdx=-1; shelterSet([{style:st,x:64,adopted:true,cushion:'#F4D27A'}]); show('name',`What will you name your new ${word}?`); },2200); }
const PRESET_NAMES={
  dog:['Biscuit','Buddy','Rosie','Max','Pepper','Luna','Cooper','Bella','Charlie','Sadie','Teddy','Coco','Bear','Honey','Scout',
    'Penny','Waffles','Rocky','Daisy','Ziggy','Maple','Duke','Ginger','Peanut','Bruno','Lucky'],
  cat:['Mochi','Oliver','Cleo','Milo','Pepper','Luna','Whiskers','Nala','Tiger','Pumpkin','Simba','Willow','Jasper','Hazel','Smokey',
    'Pixie','Pebbles','Oreo','Mittens','Shadow','Kiki','Salem','Poppy','Felix','Sushi','Button']};
/* Only a handful of names is offered at a time, drawn fresh for each adoption, so the list stays short to scan. */
const NAMES_SHOWN=6;
function shuffled(a){ const b=a.slice(); for(let i=b.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [b[i],b[j]]=[b[j],b[i]]; } return b; }
function buildNames(){ renderList('names',shuffled(PRESET_NAMES[draftKind]).slice(0,NAMES_SHOWN).map(n=>({label:n,fn:()=>finishSetup(n)})),{tail:[
  {label:'Spell a name',fn:()=>{ play('choose'); spelled=''; renderSpell(); show('spell','Spell a name. Pick a row, then a letter'); }},
  {label:'Back',fn:()=>{ play('blip'); openColors(rescueLine()); }}]}); }
let spelled='';
const ROWS=[['A','B','C','D','E','F'],['G','H','I','J','K','L'],['M','N','O','P','Q','R'],['S','T','U','V','W','X'],['Y','Z'],['Delete','Done','Cancel']];
(function buildSpell(){
  const grid=$('#spell-grid');
  ROWS.forEach(row=>{
    const r=document.createElement('div'); r.className='spell-row'; r.dataset.say=row.length>3&&row[0].length===1?`${row[0]} to ${row[row.length-1]}`:row.join(', ');
    row.forEach(k=>{ const b=document.createElement('button'); b.className='btn key'+(k.length>1?' small':''); b.tabIndex=-1; b.textContent=k; b.addEventListener('click',()=>pressKey(k)); r.appendChild(b); });
    grid.appendChild(r);
  });
})();
function renderSpell(){ $('#spell-name').textContent=spelled?spelled.charAt(0)+spelled.slice(1).toLowerCase():' '; }
function addLetter(L){ if(spelled.length>=12){ voice.speak('That name is long enough'); return; } spelled+=L; renderSpell(); play('choose'); voice.speak(L); }
function deleteLetter(){ if(!spelled){ voice.speak('Nothing to delete'); return; } spelled=spelled.slice(0,-1); renderSpell(); play('blip'); voice.speak(spelled?'Deleted':'Empty'); }
function pressKey(k){
  if(k.length===1){ addLetter(k); spellMode='row'; setHighlight(spellRow,false); resetAuto(); return; }
  if(k==='Delete'){ deleteLetter(); return; }
  if(k==='Done'){ if(!spelled){ voice.speak('Add a letter first'); return; } if(nameFor){ finishCompName(spelled.charAt(0)+spelled.slice(1).toLowerCase()); return; } finishSetup(spelled.charAt(0)+spelled.slice(1).toLowerCase()); return; }
  if(k==='Cancel'){ play('blip'); show('name',nameFor?'Pick a name':'Name your new pet'); }
}
function finishSetup(name){
  play('choose');
  returnPet=null;
  state={id:newPetId(),style:draftStyle,name,stats:{food:80,fun:80,clean:85,energy:80,love:80},hearts:0,stage:0,stars:0,msDone:0,msGot:[],msToys:{},task:null,muddy:false,outfit:{},album:[],friends:[],firsts:{},seen:null,bowUnlocked:false,
    toys:STARTER_TOYS[STYLES[draftStyle].kind].slice(),room:defaultRoom(),born:Date.now(),lastSeen:Date.now()};
  markSeen(); save(); addPhoto('adopt',`Adoption day! Welcome to the family, ${name}.`); refreshMenu(); enterGame(false,true);
}

/* ================= Choices, welcome back ================= */
function showChoice(q,opts){ $('#choice-q').textContent=q; choicePreview=null;
  renderList('choice-list',opts.map(o=>({label:o.label,sub:o.sub,urgent:o.urgent,say:o.say,preview:o.preview,fn:()=>{ choicePreview=null; play('choose'); show('game'); o.fn(); }})),{cols:1,maxw:520});
  play('ding',.5); show('choice',q,{grace:2000}); }
function newFriend(exclude){ const k=kind(), used=(state.friends||[]).map(f=>f.name).concat(exclude||[],[state.name]);
  const names=PRESET_NAMES[k].filter(n=>!used.includes(n)&&n!==state.name);
  return {name:pick(names.length?names:['Sunny']),style:pick(KIND_STYLES[k].filter(s=>s!==state.style)),isNew:true}; }
function askPlaydate(){
  const known=(state.friends||[]).filter(f=>STYLES[f.style]&&STYLES[f.style].kind===kind()), opts=[], nb=maybeNeighbor(null,.6);
  if(nb) opts.push(nb); if(known.length) opts.push(pick(known)); const f2=newFriend(opts.map(f=>f.name)); opts.push(f2); if(opts.length<2) opts.push(newFriend([f2.name]));
  showChoice(`${state.name} wants a play date! Who should come over?`,opts.map(f=>({label:`${f.name}, the ${STYLES[f.style].label.toLowerCase()} ${friendWord(f)}`+(f.neighbor?' from down the street':f.isNew?' (new friend)':''),
    preview:{petStyle:f.style,petStage:f.sg,petFit:f.fit},fn:()=>runEvent('playdate',{friend:f.style,fname:f.name,isNew:!!f.isNew,fsg:f.sg,ffit:f.fit,fkind:f.kind,neighbor:!!f.neighbor})})));
}
function askGift(){ const un=unownedToys(), pool=un.length>=2?un:un.concat(ownedToys()), a=pick(pool), b=pick(pool.filter(t=>t!==a));
  showChoice(`Two packages arrived! Which one should ${state.name} open?`,[{label:'The red package',preview:{art:'giftRed'},fn:()=>runEvent('gift',{toy:a,box:'red'})},{label:'The blue package',preview:{art:'giftBlue'},fn:()=>runEvent('gift',{toy:b,box:'blue'})}]); }
function askRain(){ showChoice(`It's raining outside. What should you and ${state.name} do?`,[
  {label:'Snuggle under a blanket',preview:{art:'blanket'},fn:()=>runEvent('rain',{mode:'blanket'})},{label:'Build a pillow fort',preview:{art:'fort'},fn:()=>runEvent('rain',{mode:'fort'})},{label:'Watch the rain',preview:{art:'window'},fn:()=>runEvent('rain',{mode:'watch'})}]); }
function runEvent(id,extra){ const key='event:'+id, d=V[key], ref={}; lockInput(2000);
  startAnim(key,d.dur,()=>{ if(d.end) d.end(ref.a); quietUntil=Date.now()+6000; lastWant=null; updateMeters(); },extra); const a=anim; ref.a=a; a.idle=true; if(d.start) d.start(a); }
const WELCOME_AWAY=20*60*1000;
function askWelcome(){ showChoice(`Welcome back! ${state.name} has a surprise for you. Pick a paw!`,[{label:'Left paw',fn:startWelcome},{label:'Right paw',fn:startWelcome}]); }
function startWelcome(){ setCaption(`${state.name} has something for you...`); const t=weightedPick([['drawing',3],['postcard',3],['toy',2],['flower',2]]);
  const f=(state.friends||[])[Math.floor(Math.random()*((state.friends||[]).length||1))]||newFriend();
  startAnim('welcome:'+t,V['welcome:'+t].dur,()=>{ addStars(1); setCaption(`${WELCOME_DONE[t](state.name,f.name)} You earned a care star.`); quietUntil=Date.now()+6000; lastWant=null; },{fname:f.name,fstyle:f.style}); }
const WELCOME_DONE={drawing:n=>`${n} painted you a picture while you were away.`,postcard:(n,f)=>`A postcard from ${f}: I hope ${n} can play again soon!`,toy:n=>`${n} found a toy and saved it for you.`,flower:n=>`${n} picked a flower just for you.`};

/* ================= Photo album ================= */
let flashAt=0;
function addPhoto(k,text,x){ if(!state) return; state.album=state.album||[];
  state.album.push({k,t:text,d:Date.now(),st:state.style,sg:stageName(),o:Object.assign({},state.outfit||{}),x:x||{}});
  if(state.album.length>40) state.album.splice(1,1); save(); flashAt=performance.now(); play('shutter',.6); }
function firstTime(key){ state.firsts=state.firsts||{}; if(state.firsts[key]) return false; state.firsts[key]=1; return true; }
function drawFixtures(g,kd){ g.save(); g.translate(FIX.dx,FIX.dy||0); drawFixtures0(g,kd); g.restore(); }
function drawFixtures0(g,kd){
  if(kd==='dog'){ softShadow(g,16,94,14,1.6,.2); rect(g,3,84,26,10,'#7A8A9A'); rect(g,4,85,24,8,'#EEF4F8'); rect(g,5,86,22,6,'#DCE8F2'); pxEll(g,16,89.5,2.4,1.6,'#9FC4E8'); [[12,86],[15,85],[18,85],[21,86]].forEach(q=>pxEll(g,q[0],q[1],.6,.6,'#9FC4E8')); }
  else { softShadow(g,15.5,94,15,1.6,.25); rect(g,2,78,27,2,'#4A6F9A'); rect(g,3,80,25,3,'#E8DCC0'); for(let x=4;x<27;x+=3) rect(g,x,81,1,1,'#D2C4A2'); rect(g,2,83,27,11,'#4A6F9A'); rect(g,3,83,25,10,'#7FA8D8'); rect(g,3,83,25,1,'#A8C8EA'); } }
/* Draw a saved moment again from its record. */
function renderPhoto(ph,g,noPhotos){
  const saved=ctx; ctx=g;
  try{ ctx.clearRect(0,0,128,96); const pose={eyes:'happy',mouth:'tongue',tail:1,ear:0,headDy:0}, sg=ph.sg, pk=(STYLES[ph.st]||STYLES.cream).kind, geo=GEO[pk+':'+(STAGES.includes(sg)?sg:'baby')];
    const pet=(dx,dy)=>{ softShadow(ctx,64+dx,86+dy,geo.bodyRx+2,2.2,.3); drawPet(ctx,ph.st,sg,pose,ph.o,PETX+dx,PETY+dy); };
    const home=()=>{ drawRoom(ctx,{noPhotos:true}); drawFixtures(ctx,pk); blit(ctx,WBOWL[0],STATION.water[0],STATION.water[1]); };
    switch(ph.k){
      case 'adopt': drawShelter(); pxEll(ctx,64,85,19,5.5,'#6A4A3A'); pxEll(ctx,64,84.5,18,4.6,'#F2A7B5'); drawPet(ctx,ph.st,sg,pose,ph.o,PETX,PETY-1); blit(ctx,SPR.heart,60.5,20); break;
      case 'walk': drawWalkScene(ph.x.scene||'park',1600); drawPetPose(ctx,ph.st,sg,Object.assign({body:'walk',face:1,frame:1},pose),ph.o,PETX,PETY); break;
      case 'explore': if(ph.x.scene==='garden'){ drawGarden(); pet(0,0); blit(ctx,SPR.fly1,90,40); break; } home(); pet(0,0); [[20,30],[100,40],[30,60],[96,64],[64,18]].forEach(([x,y])=>blit(ctx,SPR.star,x,y)); break;
      case 'friend': home(); drawPet(ctx,ph.x.fstyle,sg,pose,null,PETX-20,PETY); pet(20,0); blit(ctx,SPR.heart,60.5,22); break;
      case 'vet': drawVet(); drawPet(ctx,ph.st,sg,pose,ph.o,PETX,PETY-6); break;
      case 'outing': { const sc=ph.x.scene; if(sc==='parade') drawTown(1200); else if(sc==='agility') drawDogPark(0); else if(sc==='cafe') drawCafe(); else drawStage(0); pet(0,sc==='catshow'?-6:0); drawRibbon(64,PETY+geo.collar+2+(sc==='catshow'?-6:0)); break; }
      case 'mud': drawYard(); pet(0,0); break;
      case 'place': { const P=PLACES[ph.x.place]; if(P&&BG[P.bg]) BG[P.bg](1600); else home(); pet(0,P&&P.bg==='vet'?-6:0); if(ph.x.place==='booth'||ph.x.place==='groomer') [[22,24],[104,30],[30,62]].forEach(([x,y])=>blit(ctx,SPR.sparkle,x,y)); break; }
      case 'drawing': home(); pet(-14,0); drawPainting(70,52); break;
      case 'comp': home(); pet(-18,0); if(ph.x.c&&COMP[ph.x.c.type]) drawCompStill(ph.x.c,ph.x.c.stage,98,90); break;
      case 'postcard': home(); pet(-14,0); drawPostcard(68,52,ph.x.fstyle); break;
      default: home(); pet(0,0); [[20,30],[100,40],[30,60],[96,64],[64,18]].forEach(([x,y])=>blit(ctx,SPR.star,x,y));
    }
  } finally { ctx=saved; }
}
const albumCv=prepCanvas($('#album-photo')), albumCtx=albumCv.getContext('2d');
let albumIdx=0, albumPick=null;
function showAlbumPhoto(i){ const al=state.album||[]; if(!al.length) return '';
  albumIdx=((i%al.length)+al.length)%al.length; const ph=al[albumIdx]; renderPhoto(ph,albumCtx,false);
  const date=new Date(ph.d).toLocaleDateString(undefined,{month:'long',day:'numeric',year:'numeric'});
  $('#album-cap').textContent=ph.t; $('#album-count').textContent=`Photo ${albumIdx+1} of ${al.length}. ${date}`;
  return `Photo ${albumIdx+1} of ${al.length}. ${ph.t}`; }
function openAlbum(pickFor){ const al=state.album||[]; albumPick=pickFor||null; play('choose');
  $('#album-title').textContent=albumPick?'Pick a photo to hang':'Photo Album';
  const items=[{label:'Next photo',fn:()=>{ if(!al.length) return; play('blip'); voice.speak(showAlbumPhoto(albumIdx-1)); }},{label:'Previous photo',fn:()=>{ if(!al.length) return; play('blip'); voice.speak(showAlbumPhoto(albumIdx+1)); }}];
  if(albumPick) items.push({label:'Hang this photo',fn:hangPhoto});
  items.push({label:'Back',fn:()=>{ play('blip'); if(albumPick){ albumPick=null; decorGo('pictures','Pick a picture'); } else backToMore(); }});
  renderList('album-list',items,{cols:1});
  if(!al.length){ $('#album-cap').textContent='No photos yet. Big moments will show up here.'; $('#album-count').textContent=''; albumCtx.clearRect(0,0,128,96); show('album','The photo album is empty for now. Big moments will show up here.'); return; }
  show('album',(albumPick?'Pick a photo to hang in the frame. ':'Photo album. ')+showAlbumPhoto(al.length-1)); }
function hangPhoto(){ const ph=(state.album||[])[albumIdx]; if(!ph||!albumPick) return; room().pics[albumPick]={t:'photo',d:ph.d}; bumpRoom(); save(); play('place');
  const item=albumPick; albumPick=null; const s=spotOf(item); decorGo('spots',`The photo is hanging in the ${DECOR[item].label.toLowerCase()}.`,s?SPOTS.indexOf(s):0); }

/* ================= Dress up: the pet tries things on right in the room ================= */
const OUT_CAT={hat:['Hats','hat','No hat'],neck:['Neckwear','neckwear','Nothing on the neck'],face:['Glasses','glasses','No glasses'],body:['Clothes','clothes','No clothes']};
let dressCat=null, dressTry=undefined;
function dressOutfit(){ const o=Object.assign({},state.outfit||{}); if(dressCat&&dressTry!==undefined){ if(dressTry) o[dressCat]=dressTry; else delete o[dressCat]; } return o; }
function buildDress(){
  const n=state.name, note=$('#dress-note');
  if(!dressCat){
    $('#dress-title').textContent='Dress Up';
    const items=OUT_CATS.map(c=>({label:OUT_CAT[c][0],sub:`${outfitUnlocked(c).length} to try`,say:`${OUT_CAT[c][0]}. ${outfitUnlocked(c).length} to choose from`,fn:()=>{ play('choose'); dressCat=c; dressTry=(state.outfit||{})[c]||null; buildDress(); show('dress',`Pick ${OUT_CAT[c][1]} for ${n}`); }}));
    items.push({label:'Surprise me',fn:()=>{ const o={}; OUT_CATS.forEach(c=>{ const u=outfitUnlocked(c); o[c]=Math.random()<(c==='face'?.35:c==='body'?.5:.75)&&u.length?pick(u)[0]:null; });
      state.outfit=cleanOutfit(o); save(); play('sparkle',.6); const names=OUT_CATS.filter(c=>o[c]).map(c=>OUTFITS[c].find(i=>i[0]===o[c])[1].toLowerCase());
      voice.speak(names.length?`Surprise! ${n} is wearing the ${names.join(' and the ')}.`:`Surprise! ${n} is keeping it simple today.`); if(names.length&&firstTime('dress')) addPhoto('outfit',`${n}'s first outfit.`); }});
    items.push({label:'Take it all off',fn:()=>{ state.outfit={}; save(); play('blip'); voice.speak(`${n} is back to natural.`); }});
    renderList('dress-list',items,{tail:[{label:'Done',fn:()=>{ play('choose'); dressCat=null; backToMore(); }}]});
    const locked=OUT_CATS.reduce((s,c)=>s+OUTFITS[c].filter(i=>i[2]<999).length-outfitUnlocked(c).filter(i=>i[2]<999).length,0);
    note.textContent=locked?`${locked} more outfits unlock as you earn care stars.`:'Every outfit is unlocked!';
  } else {
    const c=dressCat; $('#dress-title').textContent=OUT_CAT[c][0];
    const items=[{label:OUT_CAT[c][2],data:null,fn:()=>wear(c,null)}].concat(outfitUnlocked(c).map(([id,label])=>({label,data:id,fn:()=>wear(c,id)})));
    renderList('dress-list',items,{tail:[{label:'Back',fn:()=>{ play('blip'); dressCat=null; dressTry=undefined; buildDress(); show('dress','Dress up'); }}]});
    note.textContent='Move the highlight to try things on. Choose one to wear it.';
  }
}
function wear(c,id){ state.outfit=state.outfit||{}; if(id) state.outfit[c]=id; else delete state.outfit[c]; save(); dressCat=null; dressTry=undefined; play('sparkle',.6);
  const label=id?OUTFITS[c].find(i=>i[0]===id)[1].toLowerCase():null, n=state.name;
  if(id&&firstTime('dress')) addPhoto('outfit',`${n}'s first outfit.`);
  buildDress(); show('dress',id?`${n} looks great in the ${label}!`:`${OUT_CAT[c][2]}.`); }
FOCUS.choice=el=>{ choicePreview=(el&&el._it&&el._it.preview)||null; };
FOCUS.dress=el=>{ if(!dressCat) return; const it=el._it; if(it&&it.data!==undefined) dressTry=it.data; };
function openDress(){ dressCat=null; dressTry=undefined; play('choose'); buildDress(); show('dress',`Dress up ${state.name}`); }

/* ================= Decorate home =================
   The real room shows each option as the highlight moves, and the chosen spot glows. */
let decorUnit=null, decorMode='top', decorSpot=null, decorItem=null, decorFrom=null, decorPreview=null, decorHi=null, roomRev=0;
const bumpRoom=()=>{ roomRev++; if(typeof applyGrid==='function') applyGrid(); };
const cloneRoom=r=>JSON.parse(JSON.stringify(r));
const itemName=id=>id?DECOR[id].label:'empty';
const zoneItems=zone=>Object.values(DECOR).filter(d=>d.zone===zone&&!d.fixed&&isUnlocked(d.unlock));
function withPlaced(id,spotId){ const r=cloneRoom(room()); if(id) placeInRoom(r,id,spotId); else if(r.spots[spotId]!=='window') r.spots[spotId]=null; return r; }
FOCUS.decor=el=>{ const it=el._it||{}; decorHi=it.hi||null; decorPreview=it.preview?it.preview():null; if(typeof applyGrid==='function') applyGrid(decorPreview||room()); roomRev++; aimCamera(); };
/* The glowing box for a spot in Decorate Home. The bed and the floor plant can be moved around the floor
   grid, so their box is drawn around where the item actually stands, not the spot's starting place. */
function hiBox(h){ if(Array.isArray(h)) return h; const s=SPOT[h]; if(s.id!=='floorL'&&s.id!=='floorR') return s.box;
  const r=decorPreview||room(), id=r.spots[s.id]||(s.id==='floorL'?'petBed':null);
  if(id&&DECOR[id]){ const p=itemPos(id,s.id), d=DECOR[id]; return [p.x-2,p.y-2,d.w+4,d.h+4]; }
  return [s.box[0],(s.base!=null?s.base:91.5)-s.box[3],s.box[2],s.box[3]]; }
/* Each Decorate Home screen opens with nothing highlighted, so focus no longer picks a starting choice. */
function decorGo(mode,intro,focus){ decorMode=mode; buildDecor(); show('decor',intro); }
function buildDecor(){
  const note=$('#decor-note'), title=$('#decor-title'), r=room(), back=(mode,intro,focus)=>({label:'Back',fn:()=>{ play('blip'); decorGo(mode,intro,focus); }});
  decorPreview=null; decorHi=null; roomRev++; if(typeof applyGrid==='function') applyGrid();
  if(decorMode==='top'){ title.textContent='Decorate Home'; note.textContent=`Make ${state.name}'s home your own.`;
    renderList('decor-list',[
      {label:'Change something',say:'Change something. Pick a spot, then pick what goes there',fn:()=>{ play('choose'); decorGo('spots','Pick a spot to change'); }},
      {label:'Move things around',fn:()=>{ play('choose'); decorGo('move1','Pick something to move'); }},
      {label:'Walls and floor',fn:()=>{ play('choose'); decorGo('walls','Walls and floor'); }}],{cols:1,tail:[{label:'Done',fn:()=>{ play('choose'); backToMore(); }}]});
  }
  else if(decorMode==='spots'){ title.textContent='Pick a spot'; note.textContent='The glowing box shows which spot you are on.';
    renderList('decor-list',SPOTS.map(s=>{ const id=r.spots[s.id]; return {label:s.label,sub:id?itemName(id):'Empty',say:`${s.label}. ${id?itemName(id):'Empty'}`,hi:s.id,
      fn:()=>{ play('choose'); decorSpot=s.id; if(id==='window') decorGo('window','The window. Change the curtains or move the window'); else decorGo('items',`What goes on the ${s.label.toLowerCase()}?`,(id&&DECOR[id].pic)?0:Math.max(0,spotChoices(s).findIndex(c=>c.cur))); }}; }),{tail:[back('top','Decorate Home',0)]});
  }
  else if(decorMode==='items'){ const s=SPOT[decorSpot]; title.textContent=s.label; const lockedN=Object.values(DECOR).filter(d=>d.zone===s.zone&&!d.fixed&&!isUnlocked(d.unlock)).length;
    note.textContent=lockedN?`${lockedN} more ${ZONE_WORD[s.zone]} unlock as you earn care stars.`:'You have every one!';
    renderList('decor-list',spotChoices(s),{tail:[back('spots','Pick a spot to change',SPOTS.indexOf(s))]});
  }
  else if(decorMode==='window'){ const s=SPOT[decorSpot]; title.textContent='Window'; note.textContent='';
    renderList('decor-list',[{label:'Change the curtains',hi:s.id,fn:()=>{ play('choose'); decorGo('curtains','Pick curtains',Math.max(0,curtainList().indexOf(r.curtains))); }},
      {label:'Move the window',hi:s.id,fn:()=>{ play('choose'); decorFrom=s.id; decorGo('move2','Where should the window go?'); }}],{cols:1,tail:[back('spots','Pick a spot to change',SPOTS.indexOf(s))]});
  }
  else if(decorMode==='curtains'){ title.textContent='Curtains'; const lockedN=Object.values(CURTAINS).filter(c=>!isUnlocked(c.unlock)).length; note.textContent=lockedN?`${lockedN} more curtains unlock as you earn care stars.`:'';
    renderList('decor-list',curtainList().map(id=>({label:CURTAINS[id].label+(r.curtains===id?' (now)':''),hi:(spotOf('window')||SPOT.wallL).id,preview:()=>{ const q=cloneRoom(r); q.curtains=id; return q; },
      fn:()=>{ r.curtains=id; bumpRoom(); save(); play('place'); decorGo('window',`${CURTAINS[id].label}. Lovely!`); }})),{tail:[back('window','The window')]});
  }
  else if(decorMode==='pictures'){ const it=decorItem, s=spotOf(it); title.textContent='Pick a picture'; note.textContent='';
    const list=Object.keys(PICTURES).filter(k=>isUnlocked(PICTURES[k].unlock)).map(k=>({label:PICTURES[k].label,hi:s&&s.id,preview:()=>{ const q=cloneRoom(r); q.pics[it]={t:'art',id:k}; return q; },
      fn:()=>{ r.pics[it]={t:'art',id:k}; bumpRoom(); save(); play('place'); decorGo('spots',`${PICTURES[k].label} is in the frame now.`,s?SPOTS.indexOf(s):0); }}));
    if((state.album||[]).length) list.unshift({label:'A photo from the album',hi:s&&s.id,fn:()=>openAlbum(it)});
    renderList('decor-list',list,{tail:[back('items','Pick what goes here')]});
  }
  else if(decorMode==='move1'){ title.textContent='Move things around'; note.textContent='Floor things move to any spot on the floor grid. Wall things move wall to wall.';
    const floor=(GRID.units||gridUnits()).filter(u=>GRID.pos[u.key]).map(u=>{ const c=GRID.pos[u.key], L=cellLabel(c);
      return {label:u.label,sub:L.label,say:`${u.label}. Now at ${L.say}`,hi:c.rect,fn:()=>{ play('choose'); decorUnit=u.key; decorGo('grid',`Where should the ${u.label.toLowerCase()} go? Pick a spot on the floor.`,Math.max(0,GRID.cells.indexOf(c))); }}; });
    const list=floor.concat(SPOTS.filter(s=>['wall','back'].includes(s.zone)&&r.spots[s.id]).map(s=>({label:itemName(r.spots[s.id]),sub:s.label,say:`${itemName(r.spots[s.id])}, on the ${s.label.toLowerCase()}`,hi:s.id,
      fn:()=>{ play('choose'); decorFrom=s.id; decorGo('move2',`Where should the ${itemName(r.spots[s.id]).toLowerCase()} go?`); }})));
    if(!list.length) note.textContent='There is nothing to move yet. Add things with Change something.';
    renderList('decor-list',list,{tail:[back('top','Decorate Home',1)]});
  }
  else if(decorMode==='grid'){ const u=(GRID.units||gridUnits()).find(x=>x.key===decorUnit); title.textContent='Pick a floor spot'; note.textContent=u?`Moving the ${u.label.toLowerCase()}. The glowing box shows the spot.`:'';
    const pick=(GRID.units||[]).findIndex(x=>x.key===decorUnit);
    renderList('decor-list',gridChoices(decorUnit,msg=>decorGo('move1',msg,Math.max(0,pick))),{tail:[back('move1','Pick something to move',Math.max(0,pick))]});
  }
  else if(decorMode==='move2'){ const from=SPOT[decorFrom], id=r.spots[decorFrom]; title.textContent='Move to...'; note.textContent=`Moving the ${itemName(id).toLowerCase()}.`;
    const list=SPOTS.filter(s=>s.zone===from.zone&&s.id!==from.id).map(s=>{ const other=r.spots[s.id];
      return {label:s.label,sub:other?`Swap with ${itemName(other).toLowerCase()}`:'Empty',say:`${s.label}. ${other?'Swap with the '+itemName(other).toLowerCase():'Empty'}`,hi:s.id,
        preview:()=>{ const q=cloneRoom(r); q.spots[s.id]=id; q.spots[from.id]=other||null; return q; },
        fn:()=>{ r.spots[s.id]=id; r.spots[from.id]=other||null; bumpRoom(); save(); play('place'); decorGo('move1',`The ${itemName(id).toLowerCase()} is on the ${s.label.toLowerCase()} now.`); }}; });
    renderList('decor-list',list,{tail:[back('move1','Pick something to move')]});
  }
  else if(decorMode==='walls'){ title.textContent='Walls and floor'; note.textContent='';
    renderList('decor-list',[{label:'Wallpaper',sub:WALLPAPERS[r.wall].label,fn:()=>{ play('choose'); decorGo('wallpaper','Pick wallpaper',Math.max(0,styleList(WALLPAPERS).indexOf(r.wall))); }},
      {label:'Floor',sub:FLOORS[r.floor].label,fn:()=>{ play('choose'); decorGo('floors','Pick a floor',Math.max(0,styleList(FLOORS).indexOf(r.floor))); }}],{cols:1,tail:[back('top','Decorate Home',2)]});
  }
  else if(decorMode==='wallpaper'||decorMode==='floors'){ const T=decorMode==='wallpaper'?WALLPAPERS:FLOORS, key=decorMode==='wallpaper'?'wall':'floor', lockedN=Object.values(T).filter(w=>!isUnlocked(w.unlock)).length;
    title.textContent=decorMode==='wallpaper'?'Wallpaper':'Floor'; note.textContent=lockedN?`${lockedN} more unlock as you earn care stars.`:'';
    renderList('decor-list',styleList(T).map(id=>({label:T[id].label+(r[key]===id?' (now)':''),preview:()=>{ const q=cloneRoom(r); q[key]=id; return q; },
      fn:()=>{ r[key]=id; bumpRoom(); save(); play('place'); decorGo('walls',`${T[id].label}. It looks great!`,key==='wall'?0:1); }})),{tail:[back('walls','Walls and floor')]});
  }
}
const curtainList=()=>Object.keys(CURTAINS).filter(k=>isUnlocked(CURTAINS[k].unlock));
const styleList=T=>Object.keys(T).filter(k=>isUnlocked(T[k].unlock));
function spotChoices(s){ const r=room(), cur=r.spots[s.id], list=[];
  if(cur&&DECOR[cur].pic) list.push({label:'Change the picture',hi:s.id,fn:()=>{ play('choose'); decorItem=cur; decorGo('pictures','Pick a picture'); }});
  if(s.zone!=='bed') list.push({label:'Empty',say:`Leave the ${s.label.toLowerCase()} empty`,hi:s.id,cur:!cur,preview:()=>withPlaced(null,s.id),fn:()=>placeDecor(null,s)});
  zoneItems(s.zone).forEach(d=>{ const at=spotOf(d.id); list.push({label:d.label,sub:cur===d.id?'Here now':at?`On the ${at.label.toLowerCase()}`:'',hi:s.id,cur:cur===d.id,preview:()=>withPlaced(d.id,s.id),fn:()=>placeDecor(d.id,s)}); });
  return list; }
function placeDecor(id,s){ state.room=withPlaced(id,s.id); bumpRoom(); save(); play('place');
  decorGo('spots',id?`The ${DECOR[id].label.toLowerCase()} is on the ${s.label.toLowerCase()} now.`:`The ${s.label.toLowerCase()} is empty now.`,SPOTS.indexOf(s)); }
function openDecor(){ play('choose'); decorGo('top',`Decorate ${state.name}'s home`); }

/* ================= Progress ================= */
function renderProgress(){
  const body=$('#progress-body'), n=state.name, stars=state.stars||0, k=kind(), cur=stageIdx();
  const cards=STAGES.map((sg,i)=>`<div class="st ${i===cur?'now':''}"><canvas data-lw="48" data-lh="60" data-sg="${sg}" data-future="${i>cur?1:0}"></canvas><div>${STAGE_LABEL[k][i]}</div><div>🐾 ${i===0?0:growGoals()[i-1]}</div></div>`).join('');
  const up=[];
  MILESTONES.filter(m=>!msGot().includes(m.id)).forEach(m=>up.push([m.at,`${MS_TYPE[m.type]}: ${msName(m)}`]));
  OUT_CATS.forEach(c=>OUTFITS[c].forEach(([id,label,at])=>{ if(stars<at) up.push([at,`Outfit: ${label}`]); }));
  Object.values(DECOR).forEach(d=>{ if(typeof d.unlock==='number'&&stars<d.unlock) up.push([d.unlock,`Home: ${d.label}`]); });
  [[WALLPAPERS,'Wallpaper'],[FLOORS,'Floor'],[CURTAINS,'Curtains'],[PICTURES,'Picture']].forEach(([T,w])=>Object.values(T).forEach(x=>{ if(typeof x.unlock==='number'&&stars<x.unlock) up.push([x.unlock,`${w}: ${x.label}`]); }));
  up.sort((a,b)=>a[0]-b[0]); const soon=up.slice(0,6);
  body.innerHTML=`<div class="stages">${cards}</div><p class="big">🐾 ${state.hearts} paw prints · ★ ${stars} care stars</p><p>${growLine()}</p>`+(schoolDone().length?`<p>🎓 Diplomas: ${schoolDone().map(id=>CLASSES[id].label).join(', ')}</p>`:'')+compProgress().map(c=>`<p>${c.html}</p>`).join('')+
    (soon.length?`<p><b>Coming up with care stars:</b></p><div class="goals">${soon.map(([at,l])=>`<div>★ ${at} · ${l}</div>`).join('')}</div>`:'<p>Every reward is unlocked. Amazing care!</p>');
  $$('canvas',body).forEach(c=>{ prepCanvas(c); paintPet(c,state.style,c.dataset.sg,{eyes:'happy',mouth:'smile'},null); if(c.dataset.future==='1'){ const g=c.getContext('2d'); g.save(); g.globalCompositeOperation='source-atop'; g.fillStyle='rgba(70,56,50,.9)'; g.fillRect(0,0,48,60); g.restore(); } });
  const tricks=learnedTricks().map(trickName), dip=schoolDone().map(id=>CLASSES[id].label);
  return `${growLine()} ${n} has ${stars} care stars. `+(dip.length?`Diplomas: ${dip.join(', ')}. `:'')+compProgress().map(c=>c.say+' ').join('')+(tricks.length?`Tricks learned: ${tricks.join(', ')}. `:'')+(soon.length?`Next reward: ${soon[0][1]} at ${soon[0][0]} stars.`:'Every reward is unlocked.');
}
/* Progress has two pages: first how the pet is right now with ideas of what to do, in big words, so a
   player who can't see the bars in the room can check in; then growing up and rewards. */
let progPage=0;
function openProgress(page){ play('choose'); progPage=page===1?1:0; const n=state.name, body=$('#progress-body'); let say;
  body.classList.toggle('now-page',progPage===0); body.style.fontSize='';
  if(progPage===1) say=renderProgress();
  else { const tips=helpTips();
    body.innerHTML=`<h3 class="now-title">How ${esc(n)} is right now</h3><div class="help-stats">${statRows()}</div>`+
      `<div class="help-tips"><h3>Ideas for ${esc(n)}</h3>${tips.map(([ic,t])=>`<p><span class="tip-ic">${ic}</span>${esc(t)}</p>`).join('')}</div>`;
    $$('canvas[data-icon]',body).forEach(c=>{ prepCanvas(c); drawIcon(c,slotIcon(c.dataset.icon)); });
    say=`How ${n} is right now. ${statSay()} `+tips.map(t=>t[1]).join(' '); }
  const next={label:`Next page (${progPage+1} of 2)`,say:progPage===0?'Next page. Growing up and rewards':`Next page. How ${n} is right now`,fn:()=>openProgress(1-progPage)};
  const items=progPage===1?[next,{label:'Back',fn:()=>{ play('blip'); backToMore(); }}]:[next,{label:'Read it to me',fn:()=>voice.speak(say)},{label:'Back',fn:()=>{ play('blip'); backToMore(); }}];
  renderList('progress-list',items,{cols:items.length>2&&innerWidth<600?1:items.length,maxw:progPage?560:760});
  show('progress',say,layer==='progress'?{focus:0}:undefined); if(progPage===0){ fitTips(body); requestAnimationFrame(()=>fitTips(body)); } }

/* ================= Settings ================= */
let settingsReturn='menu';
const SETTINGS=[
  {id:'s-tts',k:'Text to Speech',d:'Reads the game out loud.',v:()=>voice.enabled()?'On':'Off',act:()=>{ voice.toggle(); if(voice.enabled()) voice.speak('Text to speech on'); }},
  {id:'s-wait',k:'Wait for Reading',d:'Scanning and selections wait until the reading is finished.',v:()=>gs.waitRead?'On':'Off',act:()=>{ gs.waitRead=!gs.waitRead; saveGS(); refreshSettings(); voice.speak(gs.waitRead?'Wait for reading on. Scanning and selections wait until the reading is finished.':'Wait for reading off. You can scan while it reads.'); }},
  {id:'s-pace',k:'Event Pace',d:'How often surprises, chores, and little moments happen.',v:()=>gs.events==='slow'?'Slow':'Medium',act:()=>{ setEventPace(gs.events==='slow'?'medium':'slow'); refreshSettings(); voice.speak(gs.events==='slow'?'Event pace slow. Surprises, chores, and little moments happen less than half as often, and reminders repeat less.':'Event pace medium. Surprises happen at the usual pace.'); }},
  {id:'s-grow',k:'Growing Up Speed',d:()=>{ const g=growGoals(); return `Baby 0 · Teen ${g[0]} · Grown-up ${g[1]} · Senior ${g[2]} paw prints`; },v:()=>({slow:'Slow',medium:'Medium',quick:'Quick'})[gs.grow]||'Medium',act:()=>{ const order=['slow','medium','quick'], i=order.indexOf(gs.grow); gs.grow=order[(i+1)%3]; saveGS(); refreshSettings(); if(state) updateHeader(); const g=growGoals(); voice.speak(`Growing up speed ${({slow:'slow',medium:'medium',quick:'quick'})[gs.grow]}. Teen at ${g[0]}, grown-up at ${g[1]}, and senior at ${g[2]} paw prints. `+(state?growChangeSay():'')); if(state) settingsNote(growNote()); }},
  {id:'s-voice',k:'Voice',d:'The voice that reads the game.',v:()=>voice.name(),act:()=>{ voice.cycle(); refreshSettings(); voice.speak('Voice, '+voice.name()); }},
  {id:'s-hlstyle',k:'Highlight style',d:'How the choice is marked: a glow or a bold outline.',v:()=>gs.hlStyle==='glow'?'Glow':'Bold outline',act:()=>{ gs.hlStyle=gs.hlStyle==='glow'?'outline':'glow'; saveGS(); applyHL(); voice.speak('Highlight style, '+(gs.hlStyle==='glow'?'glow':'bold outline')); }},
  {id:'s-hlcolor',k:'Highlight color',d:'The color of the highlight.',v:()=>HL_COLORS[gs.hlColor][0],act:()=>{ gs.hlColor=(gs.hlColor+1)%HL_COLORS.length; saveGS(); applyHL(); voice.speak('Highlight color, '+HL_COLORS[gs.hlColor][0]); }},
  {id:'s-auto',k:'Auto Scan',d:'Moves the highlight by itself, for one switch.',v:()=>scan.settings().autoScan?'On, One Switch':'Off, Two Switches',act:()=>{ scan.toggleAuto(); const on=scan.settings().autoScan; voice.speak(on?'Auto scan on. One switch. Enter chooses.':'Auto scan off. Two switches. Space moves, Enter chooses.'); updateHint(); resetAuto(); }},
  {id:'s-speed',k:'Scan Speed',d:'Sets the pace of Auto Scan and repeated backward scanning.',v:()=>{ const s=scan.settings().interval/1000; return s+(s===1?' second':' seconds'); },act:()=>{ scan.cycleSpeed(); const s=scan.settings().interval/1000; voice.speak('Scan speed '+s+(s===1?' second':' seconds')); resetAuto(); }},
  {id:'s-music',k:'Music',d:'How loud the background music plays.',v:()=>['Off','Soft','Medium'][gs.music],act:()=>{ gs.music=(gs.music+1)%3; saveGS(); musicTick(); voice.speak('Music '+['off','soft','medium'][gs.music]); }},
  {id:'s-sound',k:'Sound Effects',d:'Pet sounds and game sounds.',v:()=>gs.sound?'On':'Off',act:()=>{ gs.sound=!gs.sound; saveGS(); const sa=SA(); if(sa&&sa.setEnabled){ try{ sa.setEnabled(gs.sound); }catch(e){} } voice.speak(gs.sound?'Sound effects on':'Sound effects off'); }},
  {id:'s-back',k:'Back',v:()=>'',act:()=>{ play('blip'); if(settingsReturn==='pause') show('pause','Paused'); else openMenu('Main menu'); }}
];
function buildSettings(){ renderList('settings-list',SETTINGS.map(s=>({id:s.id,label:s.k,desc:typeof s.d==='function'?s.d():s.d,value:s.v()||null,fn:()=>{ if(s.id!=='s-back') play('choose'); s.act(); refreshSettings(); }})),{maxw:900,rows:true}); refreshSettings(); }
function refreshSettings(){
  SETTINGS.forEach(s=>{ const b=document.getElementById(s.id); if(!b) return; const v=s.v(), k=$('.k',b)||$('.lbl',b), vv=$('.v',b);
    const d=typeof s.d==='function'?s.d():s.d, dd=$('.d',b); if(dd&&d) dd.textContent=d;
    if(k) k.textContent=s.k; if(vv) vv.textContent=v; b.dataset.say=(v?`${s.k}, ${v}`:s.k)+(d?`. ${d}`:''); });
}
function openSettings(from){ settingsReturn=from; play('choose'); clearTimeout(settingsNote.tm); const st=$('#screen-settings .title'); st.textContent='Settings'; st.classList.remove('note'); buildSettings(); show('settings','Settings'); }
if(SM()&&SM().subscribe){ try{ SM().subscribe(()=>{ refreshSettings(); updateHint(); resetAuto(); }); }catch(e){} }
try{ if('speechSynthesis' in window) speechSynthesis.addEventListener('voiceschanged',()=>refreshSettings()); }catch(e){}

/* ================= Life at home ================= */
const EVENTS={dog:[['playdate',3],['bark',3],['mud',2],['gift',2],['rain',2],['showoff',3],['rainy',2],['booth',1]],cat:[['playdate',3],['hide',3],['gift',2],['rain',2],['showoff',3],['rainy',2],['booth',1]]};
const EVENT_STAGE={booth:1};
function startEvent(){
  const list=EVENTS[kind()].concat(unlockedOutings().map(id=>[id,2])).filter(([id])=>id!==lastEvent&&(id!=='showoff'||learnedTricks().length)&&(id!=='mud'||!state.muddy)&&((id!=='rain'&&id!=='rainy')||['rain','cloudy'].includes(wxNow()))&&stageIdx()>=(EVENT_STAGE[id]||0)).concat(seasonalEvents().filter(([id])=>id!==lastEvent)).concat(rushReady()&&lastEvent!=='rush'?[['rush',3]]:[]), id=weightedPick(list), key='event:'+id, d=V[key]; lastEvent=id;
  if(id==='rush'){ startRush(); return; }
  if(id==='playdate'){ askPlaydate(); return; } if(id==='gift'){ askGift(); return; } if(id==='rain'){ askRain(); return; }
  if(id==='rainy'||id==='booth'){ lockInput(2000); startTrip(id); return; }
  if(SEASON_EVENTS[id]){ lockInput(2000); SEASON_EVENTS[id].go(); return; }
  lockInput(2000);
  startAnim(key,d.dur,()=>{ if(d.end) d.end(); quietUntil=Date.now()+6000; lastWant=null; updateMeters(); }); anim.idle=true;
  if(d.start) d.start(anim);
}
const idleHist=[];
/* Birds at the window only in daylight without rain or snow, a butterfly only then and not in winter,
   and no buzzing fly in winter. */
const idleFits=id=>id==='window'?birdsOut():id==='butterfly'?birdsOut()&&calSeason()!=='winter':id==='fly'?calSeason()!=='winter':true;
let lastSay=null, nextIdle=Date.now()+30000;
function startIdle(){
  const list=IDLE_W[kind()].filter(([id])=>!idleHist.includes(id)&&idleFits(id)), v=weightedPick(list), key='idle:'+v; idleHist.push(v); if(idleHist.length>4) idleHist.shift();
  startAnim(key,V[key].dur,()=>{ quietUntil=Date.now()+4000; }); anim.idle=true;
  setCaption(IDLE_MSG[v](state.name,anim));
}
const SAY={
  all:[n=>`${n} thinks you're the best.`, n=>`${n} is so happy to be home with you.`, n=>`${n} gives you a big happy look.`, ()=>`Every rescue pet deserves a friend like you.`,
    n=>`${n} wonders what you'll do together next.`, n=>`${n} feels safe and loved.`, n=>`${n} is glad you came to visit.`, n=>`${n} is so lucky to have you.`],
  dog:[n=>`${n} wags at you.`, n=>`${n} would love a walk soon.`, n=>`${n} is sniffing around for snacks.`, n=>`${n} tilts its head, listening to you.`, n=>`${n} rolls over for a belly rub.`],
  cat:[n=>`${n} slow blinks at you. That's a cat's way of saying I love you.`, n=>`${n} is purring softly.`, n=>`${n} watches you with big, curious eyes.`, n=>`${n} kneads the rug with tiny paws.`, n=>`${n} flicks its tail, ready for fun.`],
  baby:[n=>`${n} is still little, but growing every day.`, n=>`${n} is learning so much with you.`],
  senior:[n=>`${n} is a wise old friend.`, n=>`${n} loves a slow, cozy day with you.`]
};
function sayRandom(){
  const tips=[]; if(!Object.keys(state.outfit||{}).some(k=>state.outfit[k])) tips.push(n=>`${n} would love to try on an outfit. Dress Up is in More to Do.`); if((state.album||[]).length>2) tips.push(()=>`There are ${state.album.length} photos in your album. You can hang one on the wall in Decorate Home.`);
  tips.push(()=>'You can move furniture and change the curtains in Decorate Home, in More to Do.');
  const extra=stageName()==='baby'?SAY.baby:stageName()==='senior'?SAY.senior:[];
  const pool=(Math.random()<.2?tips:SAY.all.concat(SAY[kind()],extra)).filter(f=>f!==lastSay), f=pick(pool.length?pool:SAY.all); lastSay=f;
  setCaption(f(state.name)); spawn('heart',64,50,0,-14,1.4);
}
const moodT={};
function everyMs(key,ms,now){ if(!moodT[key]||now-moodT[key]>=ms){ moodT[key]=now; return true; } return false; }
function applyMood(p,now){
  const s=state.stats, sleepy=s.energy<WANT, lonely=s.love<WANT, bored=s.fun<WANT, hungry=s.food<WANT, great=KEYS.every(k=>s[k]>=80);
  if(sleepy){ if(p.eyes!=='closed') p.eyes=(now%3200<350)?'closed':'sleepy'; p.ear=1; p.wag=kind()==='cat'?1400:900; if(!reduceMotion) p.dy=Math.floor(now/1400)%2; }
  else if(lonely){ if(p.eyes!=='closed') p.eyes='puppy'; p.headDy=-1; p.wag=kind()==='cat'?1200:600; }
  if(bored){ p.mouth='flat'; if(!lonely) p.wag=0; } else if(hungry) p.mouth=(now%2600<500)?'tongue':'smile';
  if(great&&!sleepy&&!lonely){ p.wag=kind()==='cat'?500:200; if(now%5000<700) p.eyes='happy'; }
}
/* How the pet looks when it needs something. Sounds stay rare and soft. */
function drawMoodFx(p,now){
  const s=state.stats, m=mouthAt(p), bodyY=chestAt(p);
  if(s.clean<WANT){ if(everyMs('stink',900,now)) spawn('stink',64+p.dx+rand(-12,12),bodyY-4,rand(-3,3),-9,1.6);
    if(s.clean<35){ const t=now/260; blit(ctx,SPR.bug,64+p.dx+Math.cos(t)*16,headTopOf(p)+4+Math.sin(t*1.7)*6); } }
  if(s.energy<WANT&&everyMs('mz',3200,now)) spawn('z',72+p.dx,headTopOf(p),5,-7,2.2);
  if(s.love<WANT&&everyMs('love',3600,now)) spawn('heartO',64+p.dx+rand(-10,10),headTopOf(p),rand(-3,3),-10,1.4);
  if(s.love<LOW&&everyMs('whimper',60000,now)) play(kind()==='cat'?'pet:meowSad':'pet:whimper',.22);
  if(s.fun<WANT&&everyMs('sigh',5200,now)) spawn('puff',m.x+4,m.y+2,6,-5,.8,'#FFFFFF');
  if(s.food<WANT){ if(everyMs('drool',3000,now)) spawn('drool',m.x+2,m.y+4,0,6,.8); if(everyMs('rumble',30000,now)){ spawn('squiggle',64+p.dx,bodyY,0,-3,1); play('rumble',.3); } }
  if(KEYS.every(k=>s[k]>=80)){ if(everyMs('shine',1800,now)) spawn('sparkleSmall',64+p.dx+rand(-12,12),PETY+p.dy+rand(12,36),0,-3,.8);
    if(everyMs('content',45000,now)) play(kind()==='cat'?'pet:purrShort':'pet:sigh',.3); }
}

/* ================= Time of day ================= */
/* Each time of day is described with the weather in the window, so it never says sunny while it rains. */
const PHASE_MSG={
  sunrise:n=>({rain:`Good morning, ${n}! It's a rainy morning.`,snow:`Good morning, ${n}! Snow is falling this morning.`,cloudy:`Good morning, ${n}! It's a cloudy morning.`})[wxNow()]||`The sun is rising. Good morning, ${n}!`,
  morning:()=>({rain:`It's a rainy morning. A cozy time to stay inside.`,snow:`It's a snowy morning.`,cloudy:`It's a cloudy morning.`,windy:`It's a bright, windy morning.`})[wxNow()]||`It's a bright, sunny morning.`,
  afternoon:()=>({rain:`It's a rainy afternoon.`,snow:`It's a snowy afternoon.`,cloudy:`It's a cloudy afternoon.`,windy:`It's a windy afternoon.`})[wxNow()]||`It's a sunny afternoon.`,
  sunset:()=>clearSky()?`The sun is setting. What a pretty sky.`:`It's getting dark outside.`,
  night:n=>({rain:`It's nighttime. Rain is pattering on the window. Sweet dreams soon, ${n}.`,snow:`It's nighttime. Snow is falling softly. Sweet dreams soon, ${n}.`,cloudy:`It's nighttime. Sweet dreams soon, ${n}.`})[wxNow()]||`It's nighttime. The stars are out. Sweet dreams soon, ${n}.`};
const crickets=()=>wxNow()!=='rain'&&wxNow()!=='snow';
let lastPhaseSaid=null, nextAmbience=Date.now()+60000;
function phaseAnnounce(){ const ph=skyPhase(); if(lastPhaseSaid===null){ lastPhaseSaid=ph; return false; } if(ph===lastPhaseSaid) return false; lastPhaseSaid=ph;
  updateHeader(); announce(PHASE_MSG[ph](state.name)); const snd=ph==='night'?(crickets()?'crickets':null):ph==='sunset'?'twinkle':birdsOut()?'birdsong':null; if(snd) play(snd,.4); return true; }
function ambience(now){ if(now<nextAmbience) return; nextAmbience=now+rand(90000,150000); const ph=skyPhase(); if(ph==='night'){ if(crickets()) play('crickets',.2); } else if((ph==='sunrise'||ph==='morning')&&birdsOut()) play('birdsong',.2); }

/* ================= Care stations: the choices in the room ================= */
/* The pet carrier that waits for a vet visit: a solid handle, a rounded shell on a darker tray,
   a barred door, side vents and a little vet badge. It waits at the back of the floor by the door. */
const CARRIER=sprite(22,16,b=>{
  part(b,T=>Arc(T,11,5.4,4.6,4,'#3E4A60',true,1.8));
  part(b,T=>R(T,.5,5,21,10.5,'#7FA8D8',SH,2.6));
  part(b,T=>R(T,.5,12.4,21,3.1,'#4E77AE',SH,1.4));
  part(b,T=>R(T,13.4,6.3,6.4,6.4,'#DDE6EE',SH,1));
  [0,1,2].forEach(i=>Ln(b,14.9+i*1.7,6.8,14.9+i*1.7,12.3,'#3E4A60',1));
  [0,1,2].forEach(i=>R(b,2.3,7+i*1.6,4.2,.7,'*#4E77AE'));
  part(b,T=>E(T,9.6,9.3,2,2,'#FFFFFF',SH)); R(b,9.2,8,.8,2.6,'#E0567D'); R(b,8.3,8.9,2.6,.8,'#E0567D');
  R(b,1.8,5.8,10,.6,'*#A8C8EC'); });
/* Where the carrier waits: beside the door, just clear of whatever stands in the floor's right spot. */
function carrierX(){ const id=room().spots.floorR, left=id?itemPos(id,'floorR').x:999; return Math.min(STATION.door[0]-24,left-23); }
const CARRIER_Y=48;
const foodBowl=()=>(decorOn('bowl')?BOWLS_FANCY:BOWLS)[state.stats.food>=70?0:state.stats.food>=40?1:2];
let lastPetPose={dx:0,dy:0};
const roomShown=()=>!(anim&&V[anim.key]&&V[anim.key].scene)&&layer==='game';
function bedRect(){ const id=room().spots.floorL||'petBed', p=itemPos(id,'floorL'), d=DECOR[id]; return [p.x-1,p.y-3,d.w+2,d.h+5]; }
function petRect(){ const p=lastPetPose; if(isSide(p)) return [PETX+22+p.dx-17,PETY+p.dy+12,34,32]; return [PETX+p.dx+5,PETY+p.dy+G().top-1,34,44-G().top]; }
function taskRect(){ const pa=plantAnchor(); switch(state.task){ case 'potty': return [3+FIX.dx,79+FIX.dy,26,15]; case 'litter': return [2+FIX.dx,77+FIX.dy,27,17]; case 'water': return [STATION.water[0]-1,STATION.water[1]-3,16,9];
  case 'toys': return [TOY_SPOTS[0][1]-2,TOY_SPOTS[0][2]-4,14,18]; case 'plant': return pa?[pa.x-13,pa.y+15,32,17]:null; case 'vet': return [carrierX()-1,CARRIER_Y-1,24,18]; } return null; }
const wantsSlot=slot=>{ if(!state) return false; if(slot==='clean'&&state.muddy) return true; const w=SLOT_WANT[slot]; return !!w&&state.stats[w]<WANT; };
function refreshGameTargets(){ if(layer!=='game') return; const keep=scanIndex; setTargets(TARGET_BUILD.game()); if(!window.petChoice?.owns()) setHighlight(keep,false); }
TARGET_BUILD.game=()=>{ const k=kind(), L=s=>SLOTS[k][s][1];
  const mk=(slot,rect,tag)=>({id:slot,label:L(slot),rect:()=>roomShown()?rect():null,fn:()=>doAction(slot),
    tag:()=>(tag?tag():L(slot))+(wantsSlot(slot)?' ♥':''),say:()=>(tag?tag():L(slot))+(wantsSlot(slot)?`. ${state.name} would love this`:'')});
  return [mk('feed',()=>[STATION.feed[0]-2,STATION.feed[1]-3,18,12]),mk('play',()=>[STATION.basket[0]-.5,STATION.basket[1]-1,18,17]),mk('special',()=>[STATION.door[0]-.5,STATION.door[1]-.5,17,40]),
    mk('cuddle',petRect,()=>`Cuddle ${state.name}`),mk('clean',()=>[STATION.bath[0]-.5,STATION.bath[1]-1,18,16]),mk('nap',bedRect),
    {id:'task',label:'Chore',rect:()=>roomShown()&&state.task?taskRect():null,fn:()=>doTask(),tag:()=>state.task?TASKS[state.task].label:'',say:()=>state.task?TASKS[state.task].label+'. '+TASKS[state.task].nag(state.name):''}]; };
const hlOn=id=>!!(focusT&&focusT.id===id&&layer==='game'&&!focusT.el?.hasAttribute('data-narbe-scan-paused')); // Braked choices use the dotted target outline.
function drawObj(s,x,y,hl){ if(hl) blitHL(ctx,s,x,y); blit(ctx,s,x,y); }
function drawGlowBox(r){ const col=(HL_COLORS[gs.hlColor]||HL_COLORS[0])[1]; ctx.save(); if(gs.hlStyle==='glow'){ ctx.shadowColor=col; ctx.shadowBlur=14; } ctx.strokeStyle=col; ctx.lineWidth=gs.hlStyle==='outline'?1.6:1; ctx.beginPath(); ctx.roundRect(r[0],r[1],r[2],r[3],3); ctx.stroke(); ctx.restore(); }
function wantHeart(x,y,now){ const k=1+.2*Math.sin(now/220); blitSized(ctx,SPR.heart,snap(x-3.5*k),snap(y-3*k),7*k,6*k); }
function drawStations(now,ak){ const kd=kind(), t=state.task, pa=plantAnchor();
  drawObj(stationSprite('door',kd),STATION.door[0],STATION.door[1],hlOn('special'));
  drawFloorUnits(now,ak);
  if(pa&&t==='plant'&&ak!=='task:plant'){ if(hlOn('task')) drawGlowBox(taskRect()); drawPlantTipped(pa); }
  if(t==='potty'&&ak!=='task:potty') for(let i=0;i<pottyCount();i++) drawObj(SPR.poop,11+FIX.dx+(pottyCount()>1?i*7-4:0),82+FIX.dy+i*.5,hlOn('task'));
  if(pottyStinky()&&!(ak==='task:potty'||ak==='task:litter')&&everyMs('pottyStink',1300,now)) spawn('stink',16+FIX.dx+rand(-5,5),80+FIX.dy,rand(-2,2),-8,1.6);
  if(t==='litter'&&ak!=='task:litter'){ if(hlOn('task')) drawGlowBox(taskRect()); drawLumps(pottyCount()); }
  if(t==='toys'&&ak!=='task:toys'){ TOY_SPOTS.forEach(([s,x,y])=>drawObj(SPR[s],x,y,hlOn('task'))); }
  if(t==='vet'&&ak!=='task:vet') drawObj(CARRIER,carrierX(),CARRIER_Y,hlOn('task'));
  drawRoomLive(ctx,now);
  if(layer==='game'&&!anim){ const hearts={feed:[STATION.feed[0]+7,STATION.feed[1]-5],play:[STATION.basket[0]+8.5,STATION.basket[1]-5],clean:[STATION.bath[0]+8.5,STATION.bath[1]-5]};
    const br=bedRect(); hearts.nap=[br[0]+br[2]/2,br[1]-4];
    Object.keys(hearts).forEach(s=>{ if(wantsSlot(s)) wantHeart(hearts[s][0],hearts[s][1],now); }); }
}

/* ================= Rendering ================= */
let bg=null, bgKey=null;
function onStageChange(){ bgKey=null; }
function drawBackground(r){ const key=[skyPhase(),kind(),roomRev,state.task==='plant',state.style,msGot().length,(state.album||[]).length,viewKey(),seasonKey()].join('|'); if(key===bgKey&&bg) return; bgKey=key;
  bg=viewCanvas(); const g=bg.getContext('2d'); drawRoom(g,{hidePlant:state.task==='plant',room:r,liveFloor:true}); drawSeasonRoom(g); }
/* A scene waits for its reading. While a line is queued behind one still being read, or when the scene
   reaches its end mid-sentence, its clock stands still (the pet holds the moment), then carries on.
   Scenes that fade out hold just before the fade. At most 20 seconds of waiting per scene. */
function holdScene(a){ const c=clock(), last=a.lastC; a.lastC=c; if(last==null) return;
  const def=V[a.key]||{}, q=sayQ.length>0, reading=narrating(), endAt=a.dur-(def.overlay?450:0), atEnd=c-a.start>=endAt;
  if((a.held||0)>20000){ if(q){ const L=sayQ[sayQ.length-1]; sayQ.length=0; showLine(L.text,L.speak); } return; }
  pumpSay();
  if((sayQ.length&&layer==='game')||(atEnd&&reading)){ const d=c-last; a.start+=d; a.held=(a.held||0)+d; } }
function renderRoom(real){
  if(anim&&!paused) holdScene(anim);
  const now=clock(), a=anim, def=a?V[a.key]:null, e=a?now-a.start:0, inGame=layer==='game'||layer==='choice';
  const p={eyes:'open',mouth:'smile',tail:0,ear:0,headDy:0,dy:0,dx:0,wag:kind()==='cat'?700:320};
  if(!reduceMotion) p.dy=Math.floor(now/800)%2;
  if(now%4300<150) p.eyes='closed';
  if(def){ p.wag=kind()==='cat'?300:120; if(def.pose) def.pose(p,e,a); } else if(inGame) applyMood(p,now);
  if(layer==='dress'){ p.eyes=Math.floor(real/2600)%4===0?'happy':'open'; p.mouth='tongue'; }
  p.dull=state.stats.clean<WANT; p.mud=state.muddy&&kind()==='dog';
  p.tail=p.wag?[0,1,0,2][Math.floor(now/p.wag)%4]:0;
  lastPetPose=p;
  if(def&&def.scene) def.scene(e,a);
  else { drawBackground(layer==='decor'&&decorPreview?decorPreview:null); blitView(ctx,bg);
    const ph=skyPhase(); if(ph==='night'){ ctx.fillStyle='rgba(30,40,100,0.16)'; fillView(ctx); } else if(ph==='sunset'||ph==='sunrise'){ ctx.fillStyle='rgba(255,150,90,0.07)'; fillView(ctx); }
    drawWindowWeather(performance.now()); drawStations(now,a?a.key:null); drawSeasonLive(performance.now()); }
  if(def&&def.behind) def.behind(e,a,p);
  if(def&&def.outdoor) outdoorGround();
  if(!(def&&def.noShadow)) softShadow(ctx,64+p.dx,85.5,isSide(p)?(G().bodyRx+6):(p.dy<0?G().bodyRx:G().bodyRx+2.5),2.4,.32);
  const cy=def&&def.clipY!=null?(typeof def.clipY==='function'?def.clipY(e,a):def.clipY):null;
  if(cy!=null){ ctx.save(); ctx.beginPath(); ctx.rect(VIEW.x,VIEW.y,VIEW.w,cy-VIEW.y); ctx.clip(); }
  const fit=layer==='dress'?dressOutfit():(layer==='choice'&&choicePreview&&choicePreview.outfit)?Object.assign({},state.outfit,choicePreview.outfit):(def&&def.fit)?Object.assign({},state.outfit,def.fit):state.outfit;
  drawPetPose(ctx,state.style,stageName(),p,fit,PETX+p.dx,PETY+p.dy,hlOn('cuddle'));
  if(p.mud&&!isSide(p)) drawMud(p);
  if(cy!=null) ctx.restore();
  if(!def&&!paused&&inGame) drawMoodFx(p,now);
  if(def&&def.front) def.front(e,a,p);
  if(def&&def.outdoor) outdoorFx(performance.now());
  if((layer==='choice'||(nameFor&&(layer==='name'||layer==='spell')))&&choicePreview) drawChoicePreview(p,real);
  if(!a&&inGame&&!(layer==='choice'&&choicePreview)){ const w=currentWant(); if(w){ const by=22+(reduceMotion?0:Math.floor(now/650)%2); blit(ctx,SPR.bubbleThought,80,by); blit(ctx,ICONS[slotIcon(WANT_SLOT[w])],86,by+4); }
    if(wantsSlot('cuddle')) wantHeart(64+p.dx,headTopOf(p)-4,now); }
  if(def&&!paused&&def.tick) def.tick(a,e,now);
  drawParts(paused?0:frameDt);
  if(def&&def.overlay) def.overlay(e,a);
  if(layer==='decor'&&decorHi&&(Array.isArray(decorHi)||SPOT[decorHi])){ const b=hiBox(decorHi), t=real; ctx.save(); ctx.fillStyle=`rgba(255,215,0,${.14+.08*Math.sin(t/220)})`; ctx.fillRect(b[0],b[1],b[2],b[3]);
    ctx.lineWidth=1; ctx.setLineDash([2.5,1.5]); ctx.lineDashOffset=-t/90; ctx.strokeStyle=(HL_COLORS[gs.hlColor]||HL_COLORS[0])[1]; ctx.strokeRect(b[0]+.5,b[1]+.5,b[2]-1,b[3]-1); ctx.setLineDash([]); ctx.lineWidth=.5; ctx.strokeStyle='#1C130E'; ctx.strokeRect(b[0],b[1],b[2],b[3]); ctx.restore(); }
  if(a&&!paused&&now>=a.start+a.dur&&anim===a){ const cb=a.onEnd; anim=null; if(cb) cb(); if(layer==='game') placeTargets(); }
}
let lastFrame=performance.now(), frameDt=0;
function render(real){
  frameDt=paused?0:Math.min(.05,(real-lastFrame)/1000); lastFrame=real;
  if(ctx){ if(stepCamera()&&TARGET_LAYERS[layer]) placeTargets(); ctx.save(); ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0,0,sceneEl.width,sceneEl.height); ctx.restore();
    const shelter=!state||['kind','color','pets'].includes(layer)||(['name','spell'].includes(layer)&&!nameFor);
    if(shelter){ renderShelter(real); drawParts(frameDt); } else renderRoom(real);
    const fl=performance.now()-flashAt; if(fl<260){ ctx.fillStyle=`rgba(255,255,255,${(.8*(1-fl/260)).toFixed(3)})`; fillView(ctx); }
    if(TARGET_LAYERS[layer]){ placeTargets(); placeTag(); } }
  requestAnimationFrame(render);
}

/* ================= Needs & actions ================= */
function currentWant(){ if(!state) return null; let low=null, lv=WANT; KEYS.forEach(k=>{ if(state.stats[k]<lv){ lv=state.stats[k]; low=k; } }); return low; }
function configureActions(){ $$('canvas[data-slot-icon]').forEach(c=>{ if(!c.lw) prepCanvas(c); drawIcon(c,slotIcon(c.dataset.slotIcon)); }); }
function updateMeters(){
  if(!state) return;
  $$('.meter').forEach(m=>{ const v=state.stats[m.dataset.stat]; $('i',m).style.width=v.toFixed(0)+'%'; m.classList.toggle('low',v<WANT); m.setAttribute('aria-label',$('.sr',m).textContent+' '+Math.round(v)+' percent'); });
  if(layer==='game') refreshTargetSay();
}
function startGrow(){
  const n=state.name, next=STAGE_WORD[kind()][Math.min(3,(state.stage||0)+1)];
  announce(`${n} is growing up!`);
  startAnim('grow:0',V['grow:0'].dur,()=>{ const np=placesAtStage(stageIdx()), pl=np.length?` New places to go: ${np.slice(0,-1).join(', ')}${np.length>1?' and ':''}${np[np.length-1]}!`:'';
    setCaption((next.startsWith('senior')?`${n} is a ${next} now. Wise, gentle, and still so loved.`:`${n} grew into a ${next}!`)+pl,false); addPhoto('grow',`${n} grew into a ${next}!`); updateHeader(); lastWant=null; quietUntil=Date.now()+6000;
    openCelebrate(stageIdx()-1,stageIdx()); });
}
/* Scenes cannot be interrupted: while one plays, a press only gets a gentle "not yet". */
function doAction(slot){
  if(!state) return;
  if(anim){ nope(); return; }
  if(SLOTS[kind()][slot][0]==='out'){ openOuting(); return; }
  const k=kind(), act=SLOTS[k][slot][0], n=state.name, want=ACT_WANT[act], full=want&&state.stats[want]>90;
  const variant=pickVariant(act), key=act+':'+variant, def=V[key], earns=!!want&&currentWant()===want, wasMuddy=!!state.muddy&&act==='bath';
  play('choose');
  setCaption(full?FULL_MSG[act](n):MSG[key](n));
  if(act==='nap') play('lullaby',.5);
  if(act==='cuddle'){ if(k==='cat') play('pet:purr',.55); else { play('pet:sigh',.45); later(()=>play('thump',.45),700); } }
  if(act==='brush'&&variant!=='groom') later(()=>play('pet:purr',.5),400);
  startAnim(key,def.dur,()=>{
    const s=state.stats;
    if(act==='feed'){ s.food+=45; s.energy+=5; }
    if(act==='play'){ s.fun+=45; s.energy-=8; s.clean-=5; }
    if(act==='walk'){ s.fun+=40; s.energy-=6; s.clean-=6; }
    if(act==='explore'){ s.fun+=40; s.energy+=4; }
    if(act==='cuddle'){ s.love+=50; KEYS.forEach(key=>{ if(key!=='love') s[key]+=4; }); }
    if(act==='bath'||act==='brush'){ s.clean+=60; }
    if(act==='nap'){ s.energy+=60; }
    if(wasMuddy) state.muddy=false;
    KEYS.forEach(key=>s[key]=clamp(s[key],floorOf(key),100));
    state.hearts++; updateMeters(); updateHeader(); save();
    if(growDue()){ startGrow(); return; }
    burst(); if(act!=='cuddle') play('happy',.5);
    if(k==='dog'&&(act==='walk'||act==='play')) later(()=>play('pet:pant',.4),700);
    else if(Math.random()<.4) later(()=>play(happyNoise(),.4),600);
    if(earns||wasMuddy) addStars(wasMuddy?2:1);
    if(state.hearts%10===0) setCaption(`${state.hearts} paw prints. You and ${n} are best friends.`);
    else if(act==='nap') setCaption(`${n} feels rested.`);
    else if(act==='walk') setCaption(`Home again. ${n} loved the walk.`);
    if(act==='walk'&&firstTime('walk:'+variant)) addPhoto('walk',`${n}'s first walk at the ${{woods:'autumn woods',dogpark:'dog park'}[variant]||variant}.`,{scene:variant});
    if(act==='explore'&&firstTime('explore:'+variant)) addPhoto('explore',`${n} explored the ${{tree:'cat tree',bag:'paper bag'}[variant]||variant} for the first time.`,{scene:variant});
    else if(key==='brush:bow') setCaption(`${n} looks lovely with a bow.`);
    if(wasMuddy) setCaption(`No more mud! ${n} is squeaky clean. You earned 2 care stars.`);
    else if(earns&&state.hearts%10!==0) setCaption(`${n} got just what it needed. You earned a care star!`);
    lastWant=null; quietUntil=Date.now()+6000;
  });
  updateMeters();
}
$('#pause-btn').addEventListener('click',()=>openPause());

let lastTick=Date.now(), welcomeDue=false, lastWx=null;
function tick(){
  if(!state||layer!=='game'){ const t=Date.now(); if(state) holdTimers(t-lastTick); lastTick=t; return; }
  const now=Date.now(), raw=now-lastTick, dt=Math.min(3,raw/1000); lastTick=now;
  if(anim||now<quietUntil||linesWaiting()) holdTimers(raw);
  if(linesWaiting()) lastReadAt=now;
  rushClock(raw);
  KEYS.forEach(k=>{ if(anim&&anim.type==='nap'&&k==='energy') return; state.stats[k]=Math.max(Math.min(floorOf(k),state.stats[k]),state.stats[k]-RATES[k]*dt); });
  updateMeters();
  /* Only one thing at a time: nothing new starts while a scene plays or a line is being read or waiting. */
  if(!anim&&now>=quietUntil&&!linesWaiting()){
    if(growDue()){ startGrow(); return; }
    if(compPriority(now)) return;
    const ms=pendingMilestone(); if(ms&&now-lastCelebrate>CELEBRATE_GAP*paceK()){ celebrate(ms); return; }
    const nt=newTrickDue(); if(nt&&now-lastCelebrate>CELEBRATE_GAP*paceK()){ teachTrick(nt); return; }
    if(seasonalPriority()){ quietUntil=now+6000; return; }
    if(gs.events==='slow') lastPhaseSaid=skyPhase(); else if(phaseAnnounce()){ quietUntil=now+6000; return; }
    { const wx=wxNow(); if(lastWx&&wx!==lastWx){ lastWx=wx; updateHeader(); announce(WX_MSG[wx](state.name)); quietUntil=now+6000; return; } lastWx=wx; }
    ambience(now);
    if(checkUnlocks()){ quietUntil=now+6000; return; }
    if(pottyTick(now)) return;
    if(!state.task&&now>=nextTask){ spawnTask(); return; }
    { const rn=rushNeedDue(); if(rn){ startRush(rn); return; } }
    const w=currentWant();
    const isLow=!!w&&state.stats[w]<LOW, wantSay=()=>(isLow?LOW_MSG:WANT_MSG)[w](state.name);
    if(lowSaid&&(lowSaid!==w||!isLow)) lowSaid=null;
    if(w!==lastWant){ lastWant=w; if(w){ announce(wantSay()); play(wantVoice(w),.35); lastAsk=now; if(isLow) lowSaid=w; } else setCaption(happyLine()); }
    else if(isLow&&lowSaid!==w){ lowSaid=w; announce(wantSay()); play(wantVoice(w),.3); lastAsk=now; }
    else if(isLow&&now-lastAsk>ASK_AGAIN*remindK()){ announce(wantSay()); play(wantVoice(w),.3); lastAsk=now; }
    else if(state.task&&(!isPotty()||pottyCount()>=2)&&now-lastTaskNag>NAG_AGAIN*remindK()){ announce(TASKS[state.task].nag(state.name)); play('ding',.35); lastTaskNag=now; }
    else if(now>=nextEvent){ nextEvent=now+gap(EVENT_GAP); startEvent(); }
    else if(now>=nextIdle&&now-lastReadAt<IDLE_QUIET) nextIdle=lastReadAt+IDLE_QUIET;
    else if(now>=nextIdle){ nextIdle=now+rand(IDLE_GAP[0],IDLE_GAP[1])*idleK(); if(!w&&Math.random()<(gs.events==='slow'?.2:.4)) sayRandom(); else if(compMomentReady()) startCompMoment(); else startIdle(); }
  }
  if(now-lastSave>5000) save();
}
setInterval(tick,1000);

function enterGame(returning,fresh){
  trip=null; sayQ.length=0;
  if(paused){ pauseOffset+=performance.now()-pausedAt; paused=false; }
  configureActions(); warmVoices(kind(),stageName()); bgKey=null; rushSessionStart(returning);
  { const t0=Date.now(), k=paceK(); nextEvent=t0+rand(EVENT_GAP[0],EVENT_GAP[0]*1.6)*k; if(!state.task) nextTask=t0+rand(TASK_GAP[0]*.6,TASK_GAP[0])*k; lastTaskNag=t0; }
  const n=state.name, msg=fresh?`Welcome home, ${n}!`:returning?`${n} missed you!`:`${n} is happy to see you.`;
  setCaption(msg,false); show('game',msg); updateMeters(); lastTick=Date.now(); nextIdle=Date.now()+rand(20000,35000)*idleK(); lastWant=currentWant(); quietUntil=Date.now()+8000;
  anim=null; startAnim('hello:0',V['hello:0'].dur,()=>{ lastWant=null; if(welcomeDue&&!fresh){ welcomeDue=false; askWelcome(); } });
  later(()=>play(friendlyNoise(),.45),120);
}

/* ================= Pause ================= */
function buildPause(){ renderList('pause-list',[
  {label:'Continue',fn:()=>{ unpauseClock(); lastTick=Date.now(); play('choose'); show('game','Back to '+state.name); }},
  {label:'I Need Help',cls:'urgent',urgent:true,say:'I need help. Choose this to call a helper',fn:b=>callForHelp(b)},
  {label:'Save Game to This Device',say:'Save game to this device. Makes a save file you can load later. Warning: finding the file might not be accessible with switches',fn:openSaveWarn},
  {label:'Settings',fn:()=>openSettings('pause')},
  {label:'Main Menu',fn:()=>{ unpauseClock(); save(); openMenu('Main menu'); }},
  {label:'Exit Game',fn:()=>{ unpauseClock(); exitGame(); }}],{maxw:720}); }
/* "I Need Help": a way for the player to call a caregiver. A chime, then the words out loud twice. It
   speaks even when text to speech is off, and it works even while the game is reading something. */
function callForHelp(btn){ play('dingdong',.9); const msg='I need help, please! I need help, please!';
  NarbeCommunicationSpeech.help(() => later(()=>{ if(voice.enabled()) voice.speak(msg); else { try{ speechSynthesis.cancel(); const u=new SpeechSynthesisUtterance(msg); u.rate=.9; speechSynthesis.speak(u); }catch(e){} } },600),msg);
  if(btn){ const s=$('.sub',btn)||btn.appendChild(Object.assign(document.createElement('span'),{className:'sub'})); s.textContent='Calling for help…'; later(()=>{ if(s.isConnected) s.textContent=''; },6000); } }
function openPause(){ if(!state) return; if(!paused){ paused=true; pausedAt=performance.now(); } stopPauseHold(); play('choose'); buildPause(); show('pause','Paused'); }

/* ================= More to Do =================
   Everything extra to do with the pet, on its own button beside Pause so players can see it's
   there: Dress Up, Decorate Home, the Photo Album and Progress. A "New" badge shows when
   something new has unlocked (and for a new pet, until the menu is first opened). */
function buildMore(){ const n=state.name; $('#more-title').textContent=`More to Do with ${n}`;
  renderList('more-list',[
    {label:'Dress Up',sub:'Try on outfits',fn:openDress},
    {label:'Tricks',sub:'Ask for a trick, or a trick show',fn:()=>openTricks()},
    {label:'Companions',sub:'Pick or switch a companion',fn:openCompanions},
    {label:'Decorate Home',sub:'Change and move things',fn:openDecor},
    {label:'Photo Album',sub:'Look back at memories',fn:()=>openAlbum(null)},
    {label:'Progress',sub:'Paw prints, stars, and what\'s next',fn:openProgress},
    {label:`Back to ${n}`,fn:()=>{ unpauseClock(); lastTick=Date.now(); play('choose'); show('game','Back to '+n); }}],{maxw:720,cols:innerWidth<600?1:undefined}); }
function openMore(){ if(!state) return; if(!paused){ paused=true; pausedAt=performance.now(); } stopPauseHold(); play('choose'); state.moreNew=false; save(); updateMoreBadge(); show('more',`More to do with ${state.name}`); }
const backToMore=()=>show('more','More to Do');
function updateMoreBadge(){ const b=$('#more-new'); if(b) b.hidden=!(state&&state.moreNew!==false); }
$('#more-btn').addEventListener('click',()=>openMore());
function unpauseClock(){ if(paused){ pauseOffset+=performance.now()-pausedAt; paused=false; } }
const _show=show;
/* Returning to the pause menu from a sub-screen rebuilds it. */
show=function(name,intro,opt){ if(name==='pause') buildPause(); if(name==='more') buildMore(); return _show(name,intro,opt); };

/* ================= Coming and going ================= */
let hiddenAt=0;
document.addEventListener('visibilitychange',()=>{
  if(!state) return;
  if(document.hidden){ save(); hiddenAt=Date.now(); clearHolds(); }
  else if(hiddenAt){ const away=Date.now()-hiddenAt; hiddenAt=0; lastTick=Date.now(); applyAway(away); updateMeters();
    if(away>=WELCOME_AWAY) welcomeDue=true;
    if(away>5*60*1000&&layer==='game'&&!anim) enterGame(true,false); }
});
window.addEventListener('pagehide',save);

/* ================= Save to a file, load from a file =================
   A save file keeps the pet safe even if the browser's data is cleared. */
const esc=t=>String(t).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
/* Before saving, say plainly where the file goes and who will need to find it: loading it back means
   picking it from the device's folders, which switches may not reach. */
function openSaveWarn(){ play('choose'); $('#load-title').textContent='Before you save';
  $('#load-body').innerHTML='<p>This saves '+(petCount()>1?'all your pets (<b>'+esc(petNames(allPets()))+'</b>)':'<b>'+esc(state.name)+'</b>')+' in one file on this device, usually in the <b>Downloads</b> folder.</p><p>To load '+(petCount()>1?'them':esc(state.name))+' back later, someone has to <b>find that file</b> in the device\'s folders and pick it.</p><p>If switches can\'t be used in the computer\'s folders, <b>ask a helper</b> to note where the file is saved and keep it somewhere safe.</p>';
  renderList('load-list',[{label:'Save the file',fn:()=>saveToFile()},{label:'Cancel',fn:()=>{ play('blip'); show('pause','Paused'); }}],{cols:2,maxw:640});
  show('load','Before you save. This saves '+(petCount()>1?'all your pets, '+petNames(allPets())+',':state.name)+' in one file on this device, usually in the Downloads folder. To load it back later, someone has to find that file in the device\'s folders. If switches can\'t be used in the computer\'s folders, ask a helper to note where the file is saved.'); }
/* Download every pet in one save file; returns the file's name. "pet" is the pet being played (so older
   versions of the game can still load it), "pets" is all of them, and "playing" says who was out. */
function downloadSave(){ save(); const pets=allPets();
  const data={app:'NARBE Pet Pals',format:2,savedAt:new Date().toISOString(),pet:state,pets,playing:state.id,settings:settingsForFile()};
  const blob=new Blob([JSON.stringify(data)],{type:'application/json'}), url=URL.createObjectURL(blob), a=document.createElement('a'), d=new Date();
  const stamp=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  a.href=url; a.download='NARBE-Pet-Pals-'+(pets.length>1?pets.length+'-Pets':(kind()==='cat'?'Cat':'Dog')+'-'+(state.name.replace(/[^A-Za-z0-9]/g,'')||'Pet'))+'-'+stamp+'.json'; document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); },2000);
  play('place'); return a.download; }
function saveToFile(){ if(!state) return; const file=downloadSave(); $('#load-title').textContent='Saved!';
  const who=petCount()>1?'Your pets\' ('+esc(petNames(allPets()))+')':esc(state.name)+'\'s';
  $('#load-body').innerHTML='<p>'+who+' save file is called:</p><p class="filename">'+esc(file)+'</p><p>Look in the <b>Downloads</b> folder, or wherever this browser saves downloads. A helper can move it somewhere safe.</p><p>To load it back: Main Menu, then <b>Load a Saved Game</b>.</p>';
  renderList('load-list',[{label:'Back to the pause menu',fn:()=>{ play('blip'); show('pause','Paused'); }}],{cols:1,maxw:420});
  show('load','Saved! '+(petCount()>1?'All your pets are in one save file. It':state.name+'\'s save file')+' is in the Downloads folder, or wherever this browser saves downloads. To load it back, choose Load a Saved Game in the main menu.'); }
/* The save file also keeps the game's own settings, since they are often set up for one person (music,
   sound effects, highlight, Wait for Reading, Event Pace, Growing Up Speed). Loading the file puts them back.
   The hub's scanning and voice settings are shared by every game in the hub, so the file never changes them. */
function settingsForFile(){ const out={game:{sound:gs.sound,music:gs.music,events:gs.events,grow:gs.grow,hlStyle:gs.hlStyle,hlColor:gs.hlColor,waitRead:gs.waitRead}};
  return out; }
function applyFileSettings(S){ if(!S||typeof S!=='object') return; const g=S.game||{};
  if(typeof g.sound==='boolean') gs.sound=g.sound; if(g.music===0||g.music===1||g.music===2) gs.music=g.music; if(g.grow==='slow'||g.grow==='medium'||g.grow==='quick') gs.grow=g.grow;
  if(g.hlStyle==='glow'||g.hlStyle==='outline') gs.hlStyle=g.hlStyle; if(Number.isInteger(g.hlColor)&&g.hlColor>=0&&g.hlColor<HL_COLORS.length) gs.hlColor=g.hlColor; if(typeof g.waitRead==='boolean') gs.waitRead=g.waitRead;
  saveGS(); if(g.events==='slow'||g.events==='medium') setEventPace(g.events); applyHL(); musicTick(); const sa=SA(); if(sa&&sa.setEnabled){ try{ sa.setEnabled(gs.sound); }catch(e){} }
}
let pendingLoad=null;
/* Loading a save file adds that pet to your pets (up to 5); the pet being played is kept safe.
   If the file has a pet you already have, it asks before replacing it. With 5 pets, one says goodbye first. */
function openLoad(btn,keep){ pendingLoad=null; play('choose'); $('#load-title').textContent='Load a Saved Game';
  $('#load-body').innerHTML='<p>A save file keeps your pet safe, even if this browser\'s data gets cleared. To make one, choose <b>Save Game to This Device</b> in the pause menu.</p><p>Loading a saved game adds that pet to your pets. You can keep up to '+MAX_PETS+' pets. The game settings saved with it (highlight, music, Wait for Reading and the rest) come back too.</p><p>Choose <b>Choose a save file</b> and pick the file. A file window opens, so a helper may need to pick it.</p>';
  const items=[{label:'Choose a save file',fn:pickSaveFile},{label:'Back',fn:()=>{ play('blip'); openMenu('Main menu'); }}];
  renderList('load-list',items,{cols:2,maxw:640});
  show('load','Load a saved game. Loading a saved game adds that pet to your pets. Choose a save file, then pick the file.',keep?{focus:0}:undefined); }
function pickSaveFile(){ const inp=document.createElement('input'); inp.type='file'; inp.accept='.json,application/json';
  inp.addEventListener('change',()=>{ const f=inp.files&&inp.files[0]; if(!f) return; const r=new FileReader(); r.onload=()=>readSaveText(r.result); r.onerror=loadProblem; r.readAsText(f); });
  inp.click(); }
function readSaveText(txt){ let data=null; try{ data=JSON.parse(txt); }catch(e){}
  /* the settings saved with the file come back first, so everything after reads and looks the way that player needs */
  if(data&&data.settings&&(Array.isArray(data.pets)||data.pet)) applyFileSettings(data.settings);
  /* a file with all the pets */
  if(data&&Array.isArray(data.pets)){ const list=[]; data.pets.forEach(p=>{ let c=null; try{ c=cleanSave(p); }catch(e){} if(c&&!list.some(x=>x.id===c.id)) list.push(c); });
    if(!list.length){ loadProblem(); return; } loadAllPets(list,typeof data.playing==='string'?data.playing:null); return; }
  const raw=data&&(data.pet||data); let pet=null; try{ pet=cleanSave(raw); }catch(e){ console.warn('[PetPals] save file',e); }
  if(!pet){ loadProblem(); return; }
  pendingLoad=pet;
  if(allPets().some(p=>p.id===pet.id)){ askReplace(pet); return; }
  if(petCount()>=MAX_PETS){ openPets('bye',`You have ${MAX_PETS} pets. To load ${pet.name}, choose which pet goes to a happy new home.`,finishLoad); return; }
  finishLoad(); }
/* The file has a pet you already have (an older or newer save of the same pet). */
function askReplace(pet){ const nm=pet.name; $('#load-title').textContent='Load '+nm+'?';
  $('#load-body').innerHTML='<p>This save file has <b>'+esc(nm)+'</b>, a '+esc(STYLES[pet.style].label.toLowerCase())+'. '+esc(nm)+' is already one of your pets.</p><p class="warn">Loading the file replaces the '+esc(nm)+' you have now with the '+esc(nm)+' from the file.</p>';
  renderList('load-list',[{label:'Yes, load '+nm+' from the file',fn:finishLoad},{label:'No, keep my '+nm,fn:openLoad}],{cols:2,maxw:760});
  show('load',`Load ${nm}? ${nm} is already one of your pets. Loading the file replaces the ${nm} you have now.`); }
function finishLoad(){ const pet=pendingLoad; if(!pet) return; pendingLoad=null;
  if(state&&state.id===pet.id){ removeKey(SAVE_KEY); state=null; } else takeOut(pet.id);
  parkCurrent();
  state=Object.assign({},pet,{lastSeen:Date.now()}); anim=null; parts=[]; if(!Array.isArray(state.seen)) markSeen(); save(); bgKey=null; configureActions(); play('fanfare',.5);
  refreshMenu(); enterGame(false,false); setCaption('Welcome back, '+state.name+'! Your saved game is loaded.'); }
function loadProblem(){ $('#load-title').textContent='That file did not load';
  $('#load-body').innerHTML='<p>That file does not look like a NARBE Pet Pals save file.</p><p>Save files end in <b>.json</b> and start with <b>NARBE-Pet-Pals</b>. Try another file, or go back.</p>';
  renderList('load-list',[{label:'Choose a save file',fn:pickSaveFile},{label:'Back',fn:()=>{ play('blip'); openMenu('Main menu'); }}],{cols:2,maxw:640});
  show('load','That file could not be loaded. Try another file, or go back.'); }

/* ================= Help: how the pet is doing, and ideas for what to do ================= */
const STAT_INFO={food:['Food','feed'],fun:['Fun','play'],clean:['Clean','clean'],energy:['Rest','nap'],love:['Love','cuddle']};
function statWord(v){ return v>=80?['Great','great']:v>=WANT?['Good','good']:v>=LOW?['Needs care','care']:['Needs you now','now']; }
function helpTips(){ const n=state.name, k=kind(), s=state.stats, tips=[];
  const T={food:['🥣',`${n} is hungry. Try feeding ${n} a meal: choose the food bowl.`],
    fun:[k==='dog'?'🎾':'🧶',`${n} wants to play. Try a game with the toy basket, or going out: choose the door.`],
    clean:['🫧',k==='dog'?`${n} could use a bath. Try the bath caddy.`:`${n} could use a brushing. Try the brush.`],
    energy:['💤',`${n} is sleepy. Try a nap: choose the bed.`],love:['💗',`${n} wants some love. Try a cuddle: choose ${n}.`]};
  if(state.muddy) tips.push(['🛁',`${n} is covered in mud! Try a bath to get clean.`]);
  KEYS.filter(q=>s[q]<WANT).sort((a,b)=>s[a]-s[b]).forEach(q=>tips.push(T[q]));
  if(state.task) tips.push(['✨',TASKS[state.task].nag(n)+' Look for the glowing chore in the room.']);
  if(!tips.length){ tips.push(['🌟',`${n} is happy and doing great!`]); tips.push([k==='dog'?'🐾':'📦',`Try going out together: choose the door.`]);
    tips.push(['🎀',`Try on an outfit in Dress Up, in More to Do.`]); }
  return tips.slice(0,4); }
/* The five needs as rows: icon, name, a big bar, and a plain word for how it is. */
function statRows(){ const s=state.stats; return KEYS.map(q=>{ const v=Math.round(s[q]), [w,c]=statWord(v); return `<div class="hs hs-${c}"><canvas data-lw="12" data-lh="12" data-icon="${STAT_INFO[q][1]}"></canvas><span class="hs-name">${STAT_INFO[q][0]}</span><span class="hs-bar"><i style="width:${v}%"></i></span><span class="hs-word">${w}</span></div>`; }).join(''); }
const statSay=()=>KEYS.map(q=>STAT_INFO[q][0]+', '+statWord(state.stats[q])[0]).join('. ')+'.';
function openHelp(){ play('choose'); const n=state.name, s=state.stats, at=nextGrowAt(), tips=helpTips();
  $('#help-title').textContent=`How is ${n} doing?`;
  const rows=statRows();
  $('#help-body').innerHTML=`<div class="help-pet"><canvas data-lw="48" data-lh="60" id="help-pet"></canvas><div class="help-who"><div class="help-name">${esc(n)}</div><div class="help-sub">${STAGE_LABEL[kind()][stageIdx()]}</div>`+
    `<div class="help-sub">🐾 ${state.hearts}${at!=null?' / '+at:''} · ★ ${state.stars||0}</div></div></div><div class="help-stats">${rows}</div>`+
    `<div class="help-tips"><h3>Ideas for right now</h3>${tips.map(([ic,t])=>`<p><span class="tip-ic">${ic}</span>${esc(t)}</p>`).join('')}</div>`;
  $$('#help-body canvas[data-icon]').forEach(c=>{ prepCanvas(c); drawIcon(c,slotIcon(c.dataset.icon)); });
  const pc=prepCanvas($('#help-pet')); const w=currentWant(); paintPet(pc,state.style,stageName(),{eyes:w?'puppy':'happy',mouth:w?'smile':'tongue'},state.outfit);
  const say=`${n} is ${KEYS.map(q=>STAT_INFO[q][0]+' '+statWord(s[q])[0]).join(', ')}. `+tips.map(t=>t[1]).join(' ');
  renderList('help-list',[{label:'Read it to me',fn:()=>voice.speak(say)},{label:'Back',fn:()=>{ play('blip'); show('pause','Paused'); }}],{cols:2,maxw:640});
  show('help',say); fitHelp(); requestAnimationFrame(fitHelp); }
/* Nothing on the card may be cut off: shrink the text a little, then drop the least urgent ideas
   (they are still read aloud). */
function fitHelp(){ fitTips($('#help-body')); }
function fitTips(box){ if(!box||!box.offsetParent) return; const tips=$('.help-tips',box); if(!tips) return; const ps=$$('p',tips);
  box.style.fontSize=''; ps.forEach(p=>p.hidden=false);
  const over=()=>box.scrollHeight>box.clientHeight+2||tips.scrollHeight>tips.clientHeight+2, f0=parseFloat(getComputedStyle(box).fontSize);
  for(let f=f0;over()&&f>f0*.75;f--) box.style.fontSize=(f-1)+'px';
  for(let i=ps.length-1;i>0&&over();i--) ps[i].hidden=true; }
addEventListener('resize',()=>{ if(layer==='help') fitHelp(); if(layer==='progress'&&progPage===0) fitTips($('#progress-body')); });

/* What the camera keeps in view beside a side menu: the chosen spot while decorating, else the pet. */
function camPoint(){ if(layer==='choice'||(nameFor&&(layer==='name'||layer==='spell'))) return {x:64,y:52}; if(layer==='tricks') return {x:64,y:56}; if(layer==='decor'&&decorHi&&(Array.isArray(decorHi)||SPOT[decorHi])){ const b=hiBox(decorHi); return {x:b[0]+b[2]/2,y:b[1]+b[3]/2}; } return {x:64,y:60}; }

/* ================= Outings change how the pet feels =================
   A treat on an outing (a sample at the pet store, a biscuit at the bank, a snack at a friend's house,
   a school treat) fills the tummy a little. Splashing in mud and puddles makes the pet dirty (a dog
   needs a bath), and the groomer makes it spotless. */
[['store:sample',12],['groom:nails',10],['friend:snack',15],['shop:biscuit',10],['feed:cookie',10],['orchard:apples',10],['cocoa:fire',8],['tot:walk',8],['basics:sit',6],['basics:come',6],['nose:find',6],['camp:marshmallow',10],['bday:party',25]].forEach(([k,n])=>{ if(V[k]) V[k].snack=n; });
['rain:puddles','rainwalk:puddles','yard:dig','beach:dig'].forEach(k=>{ if(V[k]) V[k].mud=true; });

/* ================= Start ================= */
applyHL();
$$('canvas[data-lw]').forEach(c=>{ if(!c.lw) prepCanvas(c); });
state=load();
warmMusic(state?kind():'dog');
if(state){ applyAway(Date.now()-state.lastSeen); if(!Array.isArray(state.seen)) markSeen(); configureActions(); }
layoutStage();
openMenu();
requestAnimationFrame(render);
