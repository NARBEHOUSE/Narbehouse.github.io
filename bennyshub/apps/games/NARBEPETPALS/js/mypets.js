'use strict';
/* ================= My pets: keep up to 5 pets =================
   The pet being played is saved as always (SAVE_KEY). Every other pet is kept safe in PETS_KEY, so the
   player can switch between pets, adopt a new one, or let one go to a happy new home. Choose A Different
   Pet shows them all in the rescue room, each on its own cushion, at its own age and in its own outfit.
   With 5 pets, adopting (or loading) a new one first asks which pet goes to a happy new home. */
const PETS_KEY='narbepetpals:pets:v1', MAX_PETS=5;
const newPetId=()=>'p'+Date.now().toString(36)+Math.floor(Math.random()*46656).toString(36);
/* The pets kept safe (not the one being played). Each is checked like any save. */
function otherPets(){ const raw=readJSON(PETS_KEY); if(!Array.isArray(raw)) return [];
  const list=raw.map(p=>{ try{ return cleanSave(p); }catch(e){ return null; } }).filter(Boolean);
  persistSaveUpgrade(PETS_KEY,raw,list); return list; }
const allPets=()=>(state?[state]:[]).concat(otherPets().filter(p=>!state||p.id!==state.id));
const petCount=()=>allPets().length;
function keepSafe(pet){ const list=otherPets().filter(p=>p.id!==pet.id); list.unshift(JSON.parse(JSON.stringify(pet))); writeJSON(PETS_KEY,list.slice(0,MAX_PETS)); }
function takeOut(id){ const list=otherPets(), p=list.find(x=>x.id===id); writeJSON(PETS_KEY,list.filter(x=>x.id!==id)); return p||null; }
/* Put the pet being played away safely. */
function parkCurrent(){ if(!state) return null; save(); const id=state.id; keepSafe(state); removeKey(SAVE_KEY); removeKey(OLD_SAVE_KEY);
  state=null; anim=null; trip=null; parts=[]; paused=false; pauseOffset=0; sayQ.length=0; return id; }
/* Bring a kept pet out to play. Time away counts gently, as always. Returns how long it was away. */
function bringOut(id){ const p=takeOut(id); if(!p) return -1; const away=Math.max(0,Date.now()-(p.lastSeen||Date.now()));
  state=p; applyAway(away); if(!Array.isArray(state.seen)) markSeen(); configureActions(); bgKey=null; if(typeof roomRev!=='undefined') roomRev++;
  if(typeof compSpotCache!=='undefined') compSpotCache.key=null; save(); refreshMenu(); return away; }
/* ---- Neighbors ----
   The other pets kept safe live just down the street, so now and then one turns up: on a play date, at a
   friend's house, on a walk, at the dog park, the cat café, the pet store or a birthday party. Each looks
   the way it does at home, at its own age and in its own outfit. Other dogs and cats still turn up too. */
const neighborPets=k=>state?otherPets().filter(p=>p.id!==state.id&&STYLES[p.style]&&(!k||STYLES[p.style].kind===k)):[];
const asNeighbor=p=>({name:p.name,style:p.style,sg:STAGES[clamp(p.stage|0,0,3)],fit:p.outfit||null,kind:STYLES[p.style].kind,neighbor:true});
/* A neighbor pet some of the time (chance 0-1), or null. k limits it to dogs or cats. */
function maybeNeighbor(k,chance){ const list=neighborPets(k); return list.length&&Math.random()<(chance==null?.5:chance)?asNeighbor(pick(list)):null; }
const friendWord=f=>STAGE_WORD[f.kind||kind()][Math.max(0,STAGES.indexOf(f.sg||stageName()))];
/* A friend's hello: its own kind of sound, at its own age. */
const friendHello=f=>(f.kind||kind())==='dog'?'dog:barkFriendly:'+(f.sg||'baby'):'cat:trill:'+(f.sg||'baby');
let returnPet=null;   /* the pet put away to adopt a new one, brought back if adopting is cancelled */
let petsMode='choose', petsAfter=null, petsTrim=false;
const petNames=list=>{ const n=list.map(p=>p.name); return n.length<2?(n[0]||''):n.slice(0,-1).join(', ')+' and '+n[n.length-1]; };
function petsButtons(list){ const row=$('#pets-btns'); row.innerHTML='';
  list.forEach(([label,fn])=>{ const b=document.createElement('button'); b.className='hudbtn scan-item'; b.tabIndex=-1; b.textContent=label; b.addEventListener('click',fn); row.appendChild(b); }); }
/* The pets stay on their cushions here (no walking around), and grown pets are drawn a little smaller when
   the screen is narrow, so up to five never overlap. */
function petsScene(pets){ const n=pets.length, sp=clamp((VIEW.w-12)/Math.max(n,3),26,44);
  shelterSet(pets.map((p,i)=>{ const sg=STAGES[p.stage]||'baby', need=(sg==='baby'?30:sg==='teen'?34:38)*(shapeOf(STYLES[p.style]).long?1.15:1);
    return {style:p.style,sg,fit:p.outfit||null,x:64+(i-(n-1)/2)*sp,cw:Math.min(19,sp*.5),cushion:CUSHIONS[i%CUSHIONS.length],stay:true,scale:Math.min(1,(sp-2)/need),
    label:p.name,say:p.name,fn:()=>petsMode==='bye'?askBye(p):choosePet(p)}; })); }
/* mode 'choose': pick a pet to play with. mode 'bye': pick a pet to say goodbye to (after: what to do next). */
function openPets(mode,intro,after){ petsMode=mode||'choose'; if(after!==undefined) petsAfter=after; const pets=allPets();
  if(!pets.length){ petsAfter=null; openMenu(intro||'Main menu'); return; }
  petsScene(pets);
  if(petsMode==='bye'){ $('#pets-title').textContent='Which pet goes to a happy new home?';
    /* while too many pets came from a save file, one has to go before going on, so there is no Back */
    petsButtons(petsTrim?[]:[['Back',()=>{ play('blip'); petsAfter=null; pendingLoad=null; openPets('choose','Choose A Different Pet'); }]]); }
  else { $('#pets-title').textContent=state?'Choose A Different Pet':'Choose Your Pet';
    petsButtons([['Adopt a New Pet',adoptNewPet],['Say Goodbye to a Pet',()=>{ play('choose'); openPets('bye','Which pet goes to a happy new home?',null); }],['Back',()=>{ play('blip'); openMenu('Main menu'); }]]); }
  show('pets',intro||$('#pets-title').textContent,layer==='pets'?{focus:0}:undefined); }
function choosePet(p){ play('choose');
  if(state&&p.id===state.id){ startPlay(); return; }
  parkCurrent(); const away=bringOut(p.id); if(away<0){ openPets('choose'); return; }
  if(away>=WELCOME_AWAY) welcomeDue=true; enterGame(away>5*60*1000,false); }
function askBye(p){ play('choose'); petsScene([p]); $('#pets-title').textContent=`Say goodbye to ${p.name}?`;
  petsButtons([['Yes, say goodbye',()=>sayBye(p)],[`No, keep ${p.name}`,()=>{ play('blip'); openPets('bye','Which pet goes to a happy new home?'); }]]);
  show('pets',`Say goodbye to ${p.name}? ${p.name} goes to a happy new home.`,{focus:0}); }
function sayBye(p){
  if(state&&state.id===p.id){ removeKey(SAVE_KEY); removeKey(OLD_SAVE_KEY); state=null; anim=null; trip=null; parts=[]; sayQ.length=0; }
  else takeOut(p.id);
  play('place'); refreshMenu(); const msg=`Goodbye, ${p.name}! Have a happy new home.`;
  if(petsAfter){ const f=petsAfter; petsAfter=null; voice.speak(msg); f(); return; }
  if(petCount()) openPets('choose',msg); else openMenu(msg); }
/* Load a save file that has several pets. They join the pets already here; when a pet is in both, the one
   played most recently is kept. The pet that was out when the file was saved comes back out. With more than
   5 in all, the player chooses which pets go to a happy new home, one at a time, until 5 are left. */
function loadAllPets(list,playing){ const merged=allPets().map(p=>JSON.parse(JSON.stringify(p)));
  list.forEach(p=>{ const i=merged.findIndex(x=>x.id===p.id); if(i<0) merged.push(p); else if((p.lastSeen||0)>(merged[i].lastSeen||0)) merged[i]=p; });
  const out=merged.find(p=>p.id===playing)||merged.find(p=>list.some(x=>x.id===p.id))||merged[0];
  if(state) save(); state=null; anim=null; trip=null; parts=[]; paused=false; pauseOffset=0; sayQ.length=0;
  writeJSON(PETS_KEY,merged.filter(p=>p.id!==out.id));
  state=Object.assign({},out,{lastSeen:Date.now()}); if(!Array.isArray(state.seen)) markSeen(); configureActions(); bgKey=null; save(); refreshMenu();
  const names=petNames(list), done=()=>{ petsTrim=false;
    if(!state){ openPets('choose',`${names} ${list.length>1?'are':'is'} loaded. Choose a pet to play with.`); return; }
    play('fanfare',.5); refreshMenu(); enterGame(false,false); setCaption(`Welcome back! ${names} ${list.length>1?'are':'is'} loaded.`); };
  const trim=()=>{ if(petCount()>MAX_PETS){ petsTrim=true; openPets('bye',`You have ${petCount()} pets now, and up to ${MAX_PETS} can stay. Choose a pet to go to a happy new home.`,trim); return; } done(); };
  trim(); }
/* Adopt a new pet: the pet being played is kept safe first. With 5 pets, one says goodbye first. */
function adoptNewPet(){ play('choose');
  if(petCount()>=MAX_PETS){ openPets('bye',`You have ${MAX_PETS} pets. To adopt a new one, choose which pet goes to a happy new home.`,startAdoption); return; }
  startAdoption(); }
function startAdoption(){ returnPet=parkCurrent(); refreshMenu(); openKind(); }
/* Backing out of adopting brings the pet that was put away back out. */
function cancelAdoption(){ if(!state&&returnPet){ const id=returnPet; returnPet=null; if(otherPets().some(p=>p.id===id)) bringOut(id); } }
