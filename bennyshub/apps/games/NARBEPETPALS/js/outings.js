'use strict';
/* ================= Going out =================
   The door is "Go Out". It offers three places (a different three each time, from the places the
   pet's age has unlocked) and "Surprise me". A trip is a short story: a car ride or a walk there, a
   few scenes that change from visit to visit, now and then one big, simple choice, and a photo for
   the album. Some places (a rainy day, the photo booth) happen by themselves now and then instead.
   Every place has its own song (music.js). */

/* ---- New toys and treats (the pet store and the backyard hand these out) ---- */
SPR.burger=sprite(12,10,b=>{ part(b,T=>{ E(T,6,3.4,5.4,3,'#E3A858',SH,0,3.6); E(T,6,7.6,5.4,2.2,'#E3A858',SH); }); part(b,T=>R(T,.8,4.6,10.4,2,'#8A4A2A',SH,.8)); R(b,.6,4,10.8,.9,'*#7FB08C'); [[3.4,1.8],[6,1.4],[8.6,1.8]].forEach(([x,y])=>D(b,x,y,'*#FFF3D6')); });
SPR.football=sprite(12,8,b=>{ part(b,T=>E(T,6,4,5.6,3.4,'#A0643A',SH)); Ln(b,3.6,4,8.4,4,'*#FFFFFF',1); [4.6,6,7.4].forEach(x=>Ln(b,x,3.2,x,4.8,'*#FFFFFF',1)); });
SPR.catnip=sprite(11,10,b=>{ part(b,T=>R(T,.6,2,9.8,7.4,'#8CC98A',SH,1.4)); part(b,T=>{ E(T,5.5,5.6,2.4,1.4,'#4F7A5D',SH); }); Ln(b,5.5,4.4,5.5,7,'*#B4DDBC',1); });
SPR.bee=sprite(12,10,b=>{ part(b,T=>{ E(T,4,2.6,2.4,2,'#EAF6FF',SHL); E(T,8,2.6,2.4,2,'#EAF6FF',SHL); }); part(b,T=>E(T,6,6,5,3.4,(x,y)=>(Math.floor(x*1.1)%2)?'#F4C542':'#3A2E28',SH)); E(b,9.6,5.4,.6,.6,'#1C130E'); });
SPR.cookie=sprite(9,9,b=>{ part(b,T=>E(T,4.5,4.5,3.9,3.9,'#D8A060',SH)); [[3,3.2],[5.8,3.6],[4.2,5.8],[6.2,6]].forEach(([x,y])=>E(b,x,y,.55,.55,'#8A5A2A')); });
SPR.shrimp=sprite(11,9,b=>{ part(b,T=>{ for(let i=0;i<6;i++){ const a=Math.PI*(.15+i*.14); E(T,5.5+Math.cos(a)*3.4,5+Math.sin(a)*3,1.5,1.5,'#F29A80',SH); } }); E(b,8.4,6.6,.5,.5,'#1C130E'); });
const STORE_TREATS={dog:[['cookie','peanut butter cookies']],cat:[['shrimp','shrimp treats']]};
const ownedTreats=()=>state?(state.treats||[]).filter(t=>V['feed:'+t]):[];
V['feed:cookie']=catchDef('cookie'); V['feed:shrimp']=catchDef('shrimp');

/* ---- Backgrounds by name, so scenes and photos can share them ---- */
const BG={ yard:()=>drawYard(), garden:()=>drawGarden(), store:()=>drawPetStore(), groom:()=>drawGroomer(), groomdesk:()=>drawGroomDesk(), friend:()=>drawFriendHouse(),
  bank:()=>drawCounterShop('bank'), hardware:()=>drawCounterShop('hardware'), street:e=>drawStreet(e||0), catio:()=>drawCatio(), booth:()=>drawPhotoBooth(), vet:()=>drawVet(), cafe:()=>drawCafe(),
  park:e=>drawPark(e||0), beach:e=>drawBeach(e||0), woods:e=>drawWoods(e||0), dogpark:e=>drawDogPark(e||0), rainyard:e=>drawYardAfterRain(e||0,false) };

/* ---- The places. stage: the life stage that unlocks it (0 baby, 1 teen, 2 grown-up, 3 senior). ----
   travel: 'car' drives there first; 'door' is just out the back door; 'walk' is a walk from home. */
const PLACES={
  backyard:{label:'Backyard',sub:'Sun, birds, and hidden treasure',stage:0,travel:'door',music:'yard',bg:'yard',story:()=>pickSome(['yard:sun','yard:dig','yard:birds'].filter(skyFits),2)},
  garden:{label:'Garden',sub:'Butterflies and flowers',stage:0,travel:'door',music:'yard',bg:'garden',story:()=>pickSome(['explore:garden','garden:sniff'],Math.random()<.5?1:2)},
  petstore:{label:'Pet Store',sub:'Pick a new toy or treat',stage:0,travel:'car',music:'store',bg:'store',story:storeStory},
  park:{label:'Park Walk',sub:'A walk in the park',kinds:['dog'],stage:0,travel:'walk',music:'walk',bg:'park',story:()=>['walk:park']},
  catio:{label:'Catio',sub:'Birds, sunshine, and plants',kinds:['cat'],stage:0,travel:'door',music:'yard',bg:'catio',story:()=>pickSome(['catio:birds','catio:sun','catio:sniff'].filter(skyFits),2)},
  groomer:{label:'Groomer',sub:'A bath, a trim, and a new look',stage:1,travel:'car',music:'groomer',bg:'groom',story:groomStory},
  friend:{label:"Friend's House",sub:'A playdate with a friend',stage:1,travel:'car',music:'friend',bg:'friend',story:friendStory},
  beach:{label:'Beach',sub:'Waves, sand, and shells',kinds:['dog'],stage:1,travel:'car',music:'walk',bg:'beach',story:()=>['walk:beach']},
  woods:{label:'Woods Walk',sub:'Trees, trails, and squirrels',kinds:['dog'],stage:1,travel:'car',music:'walk',bg:'woods',story:()=>['walk:woods']},
  catwalk:{label:'Harness Walk',sub:'A little walk on a leash',kinds:['cat'],stage:1,travel:'door',music:'explore',bg:'street',story:catWalkStory},
  bank:{label:'Bank',sub:'A free biscuit at the counter',stage:2,travel:'car',music:'bank',bg:'bank',story:()=>shopStory('bank')},
  hardware:{label:'Hardware Store',sub:'A free biscuit at the counter',stage:2,travel:'car',music:'bank',bg:'hardware',story:()=>shopStory('hardware')},
  dogpark:{label:'Dog Park',sub:'Zoomies and fetch with friends',kinds:['dog'],stage:2,travel:'car',music:'walk',bg:'dogpark',story:()=>['walk:dogpark']},
  cafe:{label:'Cat Café',sub:'Play with the café cats',kinds:['cat'],stage:2,travel:'car',music:'friend',bg:'cafe',story:()=>['event:cafe']},
  /* Not on the door: the vet (a chore) and places that happen by themselves. */
  vet:{label:'Vet',hidden:true,travel:'car',music:'vet',bg:'vet',story:()=>['task:vet'].concat(Math.random()<.5?['vet:scale']:[],['vet:sticker'])},
  rainy:{label:'Rainy Day',hidden:true,travel:'none',music:'rain',bg:'rainyard',story:()=>[{v:'event:rain',extra:{mode:'watch'}},'rain:puddles']},
  booth:{label:'Photo Booth',hidden:true,travel:'none',music:'store',bg:'booth',story:()=>['booth:snap']}
};
/* Sunbathing needs the sun out, and birds need daylight without rain or snow. */
const skyFits=k=>/:sun$/.test(k)?sunOut():/:birds?$/.test(k)?birdsOut():true;
const pickSome=(list,n)=>{ const a=list.slice(); for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a.slice(0,n); };
const placeOpen=id=>{ const P=PLACES[id]; return !P.hidden&&(!P.kinds||P.kinds.includes(kind()))&&stageIdx()>=P.stage&&placeInSeason(P)&&placeWeatherOK(id,P); };
const openPlaces=()=>Object.keys(PLACES).filter(placeOpen);
/* Places a stage opens, for the growing-up announcement. */
const placesAtStage=s=>Object.keys(PLACES).filter(id=>{ const P=PLACES[id]; return !P.hidden&&P.stage===s&&!isSeasonalPlace(P)&&(!P.kinds||P.kinds.includes(kind())); }).map(id=>PLACES[id].label);

/* ---- Seeing a choice before choosing it ----
   While a choice is highlighted, a picture of it floats above the pet in the middle of the scene (a toy,
   a scent, a package, a friend), and changes as the highlight moves. Clothes are tried on instead. */
let choicePreview=null;
const PREVIEW_ART={
  lavender:(x,y)=>{ rect(ctx,x-.5,y-8,1,16,'#4F7A5D'); rect(ctx,x+.5,y+2,4,1,'#6E9B7B'); for(let i=0;i<7;i++){ const yy=y-8+i*1.8; pxEll(ctx,x-1.4,yy,1.5,1.1,INK); pxEll(ctx,x+1.4,yy+.8,1.5,1.1,INK); pxEll(ctx,x-1.4,yy,1,.7,'#A884D8'); pxEll(ctx,x+1.4,yy+.8,1,.7,'#C9B0E8'); } },
  apple:(x,y)=>{ pxEll(ctx,x,y+1,7.4,6.8,INK); pxEll(ctx,x,y+1,6.6,6,'#D9403E'); pxEll(ctx,x-2.4,y-1.4,1.6,1.8,'#F28A8A'); rect(ctx,x-.5,y-8,1.2,4,'#6A4A2A'); pxEll(ctx,x+3,y-6.4,2.8,1.4,'#5FA873'); },
  coconut:(x,y)=>{ pxEll(ctx,x,y,7.4,6.8,INK); pxEll(ctx,x,y,6.6,6,'#8A5A34'); pxEll(ctx,x+1.6,y+1.2,4.4,3.8,'#FFFDF6'); pxRing(ctx,x+1.6,y+1.2,4.4,3.8,.8,'#5A3A20'); [[-3.4,-3],[-1.4,-4.4],[-4.2,-.6]].forEach(([dx,dy])=>pxEll(ctx,x+dx,y+dy,.8,.8,'#3A2414')); },
  giftRed:(x,y)=>drawGift(x-10,y-4,0,'red'), giftBlue:(x,y)=>drawGift(x-10,y-4,0,'blue'),
  blanket:(x,y)=>{ for(let yy=-6;yy<6;yy++) for(let xx=-9;xx<9;xx+=3) rect(ctx,x+xx,y+yy,3,1,((Math.floor((yy+6)/3)+Math.floor((xx+9)/3))%2)?'#F2A7B5':'#FFF1C9'); rect(ctx,x-9,y-6,18,.6,'#C9738A'); rect(ctx,x-9,y+5.4,18,.6,'#C9738A'); },
  fort:(x,y)=>{ ctx.fillStyle='#F2A7B5'; ctx.beginPath(); ctx.moveTo(x-10,y); ctx.lineTo(x,y-9); ctx.lineTo(x+10,y); ctx.fill(); [[-9,'#9FC4E8'],[-3,'#F4D27A'],[3,'#9CC7A7']].forEach(([dx,c])=>{ rect(ctx,x+dx-.5,y-.5,7,7,INK); rect(ctx,x+dx,y,6,6,c); }); },
  window:(x,y)=>{ rect(ctx,x-9,y-8,18,15,INK); rect(ctx,x-8,y-7,16,13,'#34406E'); rect(ctx,x-.5,y-7,1,13,INK); rect(ctx,x-8,y-1,16,1,INK); for(let i=0;i<6;i++) rect(ctx,x-7+i*2.6,y-6+((i*5)%9),.5,2.4,'#BFD6F0'); }
};
/* Draw the preview: a round card above the pet with the thing inside it, bobbing gently. */
function drawChoicePreview(p,now){ const pv=choicePreview; if(!pv) return;
  if(pv.custom){ pv.custom(64+p.dx,Math.max(VIEW.y+17,headTopOf(p)-17)); return; }
  if(pv.outfit){ if(Math.floor(now/250)%2) [[-16,-4],[16,-8],[0,-20]].forEach(([dx,dy])=>blit(ctx,SPR.sparkleSmall,64+p.dx+dx,headTopOf(p)+14+dy)); return; }
  const cx=64+p.dx, cy=Math.max(VIEW.y+17,headTopOf(p)-17)+(reduceMotion?0:Math.sin(now/400)*1.2);
  pxEll(ctx,cx,cy,15.4,14.4,INK); pxEll(ctx,cx,cy,14.4,13.4,'#FFFDF6'); pxEll(ctx,cx-4,cy-5,4,2,'#FFFFFF');
  if(pv.sprite&&SPR[pv.sprite]){ const s=SPR[pv.sprite], k=Math.min(2,20/Math.max(s.lw,s.lh)); blitSized(ctx,s,snap(cx-s.lw*k/2),snap(cy-s.lh*k/2),s.lw*k,s.lh*k); }
  else if(pv.art&&PREVIEW_ART[pv.art]) PREVIEW_ART[pv.art](cx,cy);
  else if(pv.petStyle){ ctx.save(); ctx.beginPath(); ctx.ellipse(cx,cy,13.6,12.6,0,0,TAU); ctx.clip(); ctx.translate(cx,cy+11); ctx.scale(.5,.5); drawPet(ctx,pv.petStyle,pv.petStage||stageName(),{eyes:'happy',mouth:'tongue'},pv.petFit||null,-22,-44); ctx.restore(); } }

/* ---- The trip in progress ---- */
let trip=null;
function tripSong(){ return trip&&trip.music||null; }
/* "Where should you go?": three places with a little picture of the pet there, and Surprise me. */
function openOuting(){
  const all=openPlaces(), last=state.lastPlace, pool=all.length>3?all.filter(id=>id!==last):all, three=pickSome(pool,3), seas=all.filter(id=>isSeasonalPlace(PLACES[id]));
  if(seas.length&&!three.some(id=>isSeasonalPlace(PLACES[id]))) three[Math.min(2,three.length)]=pick(seas);
  $('#outing-title').textContent=wxNow()==='rain'?`It's raining. Where should ${state.name} go?`:`Where should ${state.name} go?`;
  const items=three.map(id=>({label:PLACES[id].label,sub:typeof PLACES[id].sub==='function'?PLACES[id].sub():PLACES[id].sub,cls:'place',icon:{lw:64,lh:48,paint:c=>paintPlaceThumb(c,id)},fn:()=>startTrip(id)}));
  items.push({label:'Surprise me',sub:'Go somewhere fun',say:'Surprise me. Go somewhere fun',fn:()=>startTrip(pick(all))});
  items.push({label:'Not now',fn:()=>{ play('blip'); show('game','Back to '+state.name); }});
  renderList('outing-list',items,{cols:innerWidth>=700?2:1,maxw:900,maxRow:Math.round(clamp(innerHeight*(innerWidth>=700?.2:.13),64,150))});
  play('choose'); show('outing',`Where should ${state.name} go? `+three.map(id=>PLACES[id].label).join(', ')+', or surprise me.');
  const ids=three.map(id=>PLACES[id].music).concat(['car']); queueMusic(ids.filter((v,i,a)=>SONGS[v]&&a.indexOf(v)===i)); }
/* A thumbnail: the place's background with the pet sitting in it. */
function paintPlaceThumb(c,id){ const g=c.getContext('2d'), keep=ctx, V0=Object.assign({},VIEW);
  try{ Object.assign(VIEW,{x:0,y:0,w:128,h:96}); ctx=g; g.setTransform(RES*c.lw/128,0,0,RES*c.lh/96,0,0); g.imageSmoothingEnabled=false; BG[PLACES[id].bg](800);
    softShadow(g,64,86,14,2.4,.3); drawPet(g,state.style,stageName(),{eyes:'happy',mouth:'tongue'},state.outfit,PETX,PETY); }
  catch(e){ console.warn('[PetPals] thumb',id,e); } finally { ctx=keep; Object.assign(VIEW,V0); } }

function startTrip(id,done,extra){
  const P=PLACES[id]; if(!P) return; play('choose'); show('game');
  trip=Object.assign({place:id,picks:{},music:P.music,earns:currentWant()==='fun',done:done||null,lastBg:'home'},extra||{});
  queueMusic([P.music,'car'].filter(s=>SONGS[s]));
  const beats=[]; if(P.travel==='car') beats.push({v:'trip:car',music:'car'});
  P.story(trip).forEach(b=>beats.push(typeof b==='string'?{v:b}:b));
  runBeats(beats,()=>finishTrip(id)); }
/* Play the beats in order. A choice holds the place on screen until it's made. */
function runBeats(list,done){ let i=0;
  const next=()=>{ if(!trip) return; if(i>=list.length){ done(); return; } const b=list[i++];
    trip.music=b.music||PLACES[trip.place].music;
    if(b.fn){ b.fn(trip); next(); return; }
    if(b.dyn){ const more=(b.dyn(trip)||[]).map(x=>typeof x==='string'?{v:x}:x); list.splice(i,0,...more); next(); return; }
    if(b.choice){ const c=typeof b.choice==='function'?b.choice(trip):b.choice; if(!c){ next(); return; }
      startAnim('trip:hold',6e5,null,{trip,bg:b.bg||PLACES[trip.place].bg,holdPose:b.holdPose}); anim.idle=false;
      showChoice(c.q,c.opts.map(o=>({label:o.label,say:o.say,preview:o.preview,fn:()=>{ if(anim&&anim.key==='trip:hold') anim=null; if(o.fn) o.fn(trip); next(); }}))); return; }
    const d=V[b.v]; if(!d){ console.warn('[PetPals] missing scene',b.v); next(); return; }
    if(d.snack) trip.fed=(trip.fed||0)+d.snack; if(d.mud) trip.mud=true;
    const bg=d.bgName||b.v; startAnim(b.v,b.dur||d.dur,next,Object.assign({trip,fadeIn:trip.lastBg!==null&&trip.lastBg!==bg},b.extra||{})); trip.lastBg=bg; anim.idle=false;
    if(d.start) d.start(anim); };
  next(); }
function finishTrip(id){ const t=trip, P=PLACES[id], n=state.name, s=state.stats; trip=null; sayQ.length=0;
  if(t&&t.done){ t.done(); return; }
  const out=P.travel!=='none';
  s.fun+=out?40:15; s.love+=8; if(out) s.energy-=6; if(id==='groomer') s.clean=100; else if(out) s.clean-=4;
  const fed=t&&t.fed||0, mud=!!(t&&t.mud&&id!=='groomer'); if(fed) s.food+=fed; if(mud){ s.clean-=35; if(kind()==='dog') state.muddy=true; } if(id==='groomer') state.muddy=false;
  const also=(mud?(kind()==='dog'?` ${n} got muddy! Time for a bath.`:` ${n} got a little dirty. Time for a brushing.`):'')+(fed?` The treats filled ${n}'s tummy a little.`:'');
  KEYS.forEach(k=>s[k]=clamp(s[k],floorOf(k),100));
  if(out){ state.hearts++; state.lastPlace=id; } state.visits=Object.assign({},state.visits||{}); state.visits[id]=(state.visits[id]||0)+1; updateMeters(); updateHeader(); save();
  if(firstTime('place:'+id)){ if(P.travel==='walk'||['beach','woods','dogpark'].includes(id)) addPhoto('walk',`${n}'s first trip to the ${P.label.toLowerCase()}.`,{scene:id==='park'?'park':id}); else addPhoto('place',`${n}'s first visit to the ${P.label.toLowerCase()}.`,{place:id}); }
  if(growDue()){ startGrow(); return; }
  burst(); play('happy',.5); later(()=>play(happyNoise(),.45),600);
  if(out&&t&&t.earns) addStars(1);
  if(P.doneMsg) setCaption(P.doneMsg(n)+also);
  else if(!out) setCaption((id==='rainy'?`What a cozy rainy day with ${n}.`:`What a fun surprise for ${n}!`)+also);
  else setCaption((t&&t.earns?`Home again! ${n} had so much fun. You earned a care star!`:`Home again! ${n} loved the ${P.label.toLowerCase()}.`)+also);
  lastWant=null; quietUntil=Date.now()+6000; }

/* ---- Helpers for scenes ---- */
const nm=()=>state.name, furC=()=>(STYLES[state.style]||STYLES.cream).pal.fur;
/* Every trip scene draws its place, and fades in when the place changes. */
function tripScene(bg,d){ return Object.assign({bgName:bg,
  scene(e,a){ BG[bg](d.scroll?e*d.scroll:0,a); },
  overlay(e,a){ if(a.fadeIn&&e<350){ ctx.fillStyle=`rgba(255,247,230,${(1-e/350).toFixed(3)})`; fillView(ctx); } if(d.fadeOut) fadeOverlay(Math.max(e,a.dur/2),a.dur); if(d.overlay2) d.overlay2(e,a); }},d); }
const blink=(p,e)=>{ if(e%3300<140) p.eyes='closed'; };
V['trip:hold']={dur:6e5,scene(e,a){ BG[a.bg](0,a); }, pose(p,e,a){ p.eyes='happy'; p.mouth='smile'; blink(p,e); if(a.holdPose) a.holdPose(p,e,a); }};

/* ---- The car ride ---- */
V['trip:car']={dur:4200,noShadow:true,bgName:'car',
  start(a){ const P=PLACES[a.trip.place]; setCaption(kind()==='dog'?`Road trip! ${nm()} rides to the ${P.label.toLowerCase()} with the window down.`:`${nm()} rides to the ${P.label.toLowerCase()}, safe in the car.`); play('honk',.4); },
  scene(e){ drawCarScene(e); drawCarBack(e); },
  pose(p,e){ const b=carBob(e); p.dy=(kind()==='dog'?-12:-8)+b; if(kind()==='dog'){ p.eyes=Math.floor(e/1400)%2?'happy':'closed'; p.mouth='tongue'; p.ear=Math.floor(e/90)%2; p.wag=90; } else { p.eyes='open'; p.mouth='smile'; blink(p,e); p.ear=Math.floor(e/1600)%2; } },
  front(e,a,p){ drawCarFront(e,kind()==='cat'); if(kind()==='dog'&&Math.floor(e/120)%2){ const m=mouthAt(p); for(let i=0;i<3;i++) rect(ctx,m.x-26-i*6-((e/30)%8),m.y-8+i*4,5,.6,'rgba(255,255,255,.85)'); } },
  overlay(e,a){ if(a.fadeIn&&e<350){ ctx.fillStyle=`rgba(255,247,230,${(1-e/350).toFixed(3)})`; fillView(ctx); } fadeOverlay(Math.max(e,a.dur/2),a.dur); },
  tick(a,e,now){ if(now>=a.next){ play('rumble',.12); a.next=now+900; } if(e>1500&&kind()==='dog') once(a,'b',()=>play('pet:barkHappy',.4)); if(e>1800&&kind()==='cat') once(a,'m',()=>play('pet:trill',.4)); }};

/* ---- Backyard ---- */
V['yard:sun']=tripScene('yard',{dur:4600,
  start(){ setCaption(`${nm()} naps in a warm patch of sunshine.`); },
  pose(p,e){ p.body='lie'; p.face=1; p.eyes=e>900?'closed':'happy'; p.frame=0; },
  behind(e){ ctx.save(); ctx.globalAlpha=.35+.08*Math.sin(e/500); ctx.fillStyle='#FFF3B0'; ctx.beginPath(); ctx.moveTo(40,VIEW.y); ctx.lineTo(80,VIEW.y); ctx.lineTo(96,92); ctx.lineTo(34,92); ctx.fill(); ctx.restore(); },
  tick(a,e,now){ if(e>1200&&now>=a.next){ spawn('z',74,60,5,-7,2.2); a.next=now+1100; } if(e>1500) once(a,'s',()=>play(kind()==='dog'?'pet:sigh':'pet:purr',.45)); }});
V['yard:dig']=tripScene('yard',{dur:5200,
  init(a){ const un=unownedToys(); a.toy=un.length?pick(un):pick(ownedToys()); a.isNew=un.includes(a.toy); },
  start(){ setCaption(kind()==='dog'?`${nm()} starts digging. Is something buried here?`:`${nm()} peeks under the bushes. Something is hiding there!`); },
  pose(p,e){ if(e<2600){ const b=Math.floor(e/140)%2; p.headDy=2+b; p.eyes='happy'; p.mouth='open'; p.dy=0; if(kind()==='cat'&&e>2100){ p.dy=Math.round(arc(ph(e,2100,2600),6)); } } else { p.eyes='happy'; p.mouth='tongue'; if(e<3400) p.dy=-Math.round(Math.abs(Math.sin(e/140))*3); } },
  front(e,a){ if(e>2500){ const k=ph(e,2500,3000), s=SPR[a.toy]; blit(ctx,s,80-s.lw/2,lerp(90,74,k)+arc(k,10)); } },
  tick(a,e,now){ if(e<2500&&now>=a.next){ if(kind()==='dog') for(let i=0;i<2;i++) spawn('crumb',64+rand(-6,6),86,rand(-30,30),rand(-40,-20),.6,'#7E5A36'); play(kind()==='dog'?'rustle':'sniff',.3); a.next=now+260; }
    if(e>2600) once(a,'f',()=>{ play('sparkle',.6); burst(6); if(a.isNew){ state.toys=ownedToys().concat([a.toy]); save(); setCaption(`${nm()} found a brand new ${toyName(a.toy)}! It goes in the toy box.`); } else setCaption(`${nm()} found the ${toyName(a.toy)} it lost! Hooray!`); });
    if(e>3000) once(a,'n',()=>play(toySound(a.toy),.5)); }});
V['yard:birds']=tripScene('yard',{dur:4800,
  start(){ setCaption(`Birds land on the fence. ${nm()} watches them.`); play('birdsong',.4); },
  pose(p,e){ p.eyes='open'; p.headDy=-1; p.ear=Math.floor(e/500)%2; if(e>3300){ p.dy=Math.round(arc(ph(e,3300,3700),5)); p.mouth='open'; p.eyes='happy'; } },
  front(e){ [[40,34],[70,33],[98,35]].forEach(([x,y],i)=>{ if(e<3400) blit(ctx,SPR.bird,x,y-(Math.floor(e/300+i)%2)); else { const t=(e-3400)/1000; blit(ctx,Math.floor(e/100+i)%2?SPR.gull:SPR.gull2,x+t*(i-1)*30,y-t*50); } }); },
  tick(a,e){ if(e>1500&&kind()==='cat') once(a,'c',()=>play('pet:chatter',.4)); if(e>3350) once(a,'f',()=>{ play('chirp',.5); play('rustle',.3); setCaption('Flutter! Off they go.'); }); }});
/* ---- Garden ---- */
V['garden:sniff']=tripScene('garden',{dur:4600,
  init(a){ a.sneeze=Math.random()<.5; },
  start(){ setCaption(`${nm()} stops to sniff the flowers.`); },
  pose(p,e,a){ p.dx=Math.round(lerp(0,12,ph(e,0,700))); if(e<700){ p.body='walk'; p.face=1; p.frame=Math.floor(e/140)%4; }
    else if(e<2600){ p.headDy=1+(Math.floor(e/300)%2); p.eyes='closed'; } else if(a.sneeze&&e<3200){ p.eyes='closed'; p.mouth='open'; p.headDy=e<2900?-1:2; } else { p.eyes='happy'; p.mouth='tongue'; } },
  front(e){ drawFlower(90,72); drawFlower(96,74); const t=e/260; blit(ctx,SPR.bee,92+Math.cos(t)*10-6,60+Math.sin(t*1.6)*5); },
  tick(a,e){ if(e>900) once(a,'s',()=>play('sniff',.4)); if(e>1600) once(a,'b',()=>{ play('buzz',.3); setCaption('Bzzz! A friendly bee flies by.'); });
    if(e>2900) once(a,'n',()=>{ if(a.sneeze){ play('pet:sneeze',.6); setCaption('Achoo! A flower sneeze.'); for(let i=0;i<6;i++) spawn('sparkleSmall',84,64,rand(-20,20),rand(-16,0),.6); } else { play(happyNoise(),.45); setCaption(`${nm()} loves the way the roses smell.`); } }); }});

/* ---- Pet store ---- */
function storeStory(t){ const k=kind(), un=unownedToys(), treats=STORE_TREATS[k].filter(([id])=>!(state.treats||[]).includes(id));
  const offer=pickSome(un,2).map(id=>({type:'toy',id,label:`The ${toyName(id)}`})); if(treats.length&&offer.length<2) offer.push({type:'treat',id:treats[0][0],label:`A bag of ${treats[0][1]}`});
  if(!offer.length) offer.push({type:'treat',id:k==='dog'?'cookie':'shrimp',label:k==='dog'?'A bag of peanut butter cookies':'A bag of shrimp treats'});
  t.offer=offer;
  const beats=['store:browse',{bg:'store',choice:()=>({q:`Which one should ${nm()} take home?`,opts:t.offer.map(o=>({label:o.label,preview:{sprite:o.id},fn:tt=>{ tt.picks.item=o; }}))})}];
  if(Math.random()<.5) beats.push('store:sample'); beats.push('store:checkout'); return beats; }
V['store:browse']=tripScene('store',{dur:4200,
  init(a){ a.nb=maybeNeighbor(null,.4); },
  behind(e,a){ if(a.nb) drawPetPose(ctx,a.nb.style,a.nb.sg,{eyes:e>2800?'happy':'open',mouth:e>2800?'tongue':'smile',tail:Math.floor(e/140)%3},a.nb.fit,PETX+40,PETY); },
  start(){ play('dingdong',.4); setCaption(`Welcome to the pet store! So many toys and treats.`); },
  pose(p,e){ if(e<1500){ p.body='walk'; p.face=1; p.frame=Math.floor(e/140)%4; p.dx=Math.round(lerp(-40,0,ph(e,0,1500))); } else { p.eyes='open'; p.headDy=-2; p.ear=Math.floor(e/400)%2; if(e>2800){ p.eyes='happy'; p.mouth='tongue'; } } },
  tick(a,e,now){ if(e<1500&&now>=a.next){ play('step',.2); a.next=now+280; } if(e>2800) once(a,'w',()=>{ play(happyNoise(),.45); setCaption(`${nm()} looks at the toy wall with big eyes.`+(a.nb?` And look, ${a.nb.name} from down the street is shopping here too!`:'')); if(a.nb) later(()=>play(friendHello(a.nb),.4),450); }); }});
V['store:sample']=tripScene('store',{dur:3400,
  start(){ setCaption(`The shopkeeper has a free treat sample for ${nm()}!`); },
  pose(p,e){ if(e<1400){ p.eyes='open'; p.headDy=-1; } else if(e<2600){ const b=Math.floor(e/170)%2; p.headDy=b; p.mouth=b?'open':'smile'; p.eyes='closed'; } else { p.eyes='happy'; p.mouth='tongue'; } },
  front(e,a,p){ if(e<1500){ const hy=e<700?lerp(-24,26,e/700):26; blit(ctx,SPR.hand,92,hy); blit(ctx,SPR.cookie,90,hy+16); } else if(e<1700){ const k=ph(e,1500,1700), m=mouthAt(p); blit(ctx,SPR.cookie,lerp(90,m.x-4,k),lerp(42,m.y-3,k)); } },
  tick(a,e){ if(e>1600) once(a,'c',()=>{ play('crunch',.6); crumbs(64,72); }); if(e>2700) once(a,'y',()=>play(happyNoise(),.45)); }});
V['store:checkout']=tripScene('store',{dur:3800,
  start(a){ const o=a.trip.picks.item||a.trip.offer[0]; a.item=o;
    if(o.type==='toy'){ state.toys=ownedToys().concat(ownedToys().includes(o.id)?[]:[o.id]); } else { state.treats=(state.treats||[]).concat((state.treats||[]).includes(o.id)?[]:[o.id]); } save();
    setCaption(`Beep! ${o.type==='toy'?'The '+toyName(o.id):'The '+o.label.replace(/^A bag of /,'')} ${o.type==='toy'?'is':'are'} going home with ${nm()}.`); play('register',.5); },
  pose(p,e){ p.eyes='happy'; p.mouth=e<2200?'smile':'tongue'; if(e>1200&&e<2200) p.dy=-Math.round(Math.abs(Math.sin(e/150))*3); },
  front(e,a,p){ const o=a.item, m=mouthAt(p); if(o.type==='toy'){ const s=SPR[o.id]; blit(ctx,s,m.x-s.lw/2,m.y-2); } else { rect(ctx,m.x-5,m.y-1,10,11,INK); rect(ctx,m.x-4,m.y,8,9,'#E8C090'); blit(ctx,SPR[o.id]||SPR.cookie,m.x-4,m.y+1); } },
  tick(a,e){ if(e>1200) once(a,'s',()=>{ burst(6); play('sparkle',.5); }); if(e>1600&&a.item.type==='toy') once(a,'q',()=>play(toySound(a.item.id),.5)); if(e>2600) once(a,'t',()=>setCaption(a.item.type==='toy'?`${nm()} will find it in the toy basket at home.`:`${nm()} can have them at mealtime.`)); }});

/* ---- Groomer: each visit is a little different ---- */
const GROOM_VISITS={
  bath:['groom:desk','scent','groom:bath','groom:shake','groom:dry','groom:brush','accessory','groom:mirror'],
  haircut:['groom:desk','groom:cut','groom:brush','groom:mirror','groom:photo'],
  nails:['groom:desk','groom:nails','groom:brush','accessory','groom:mirror'],
  puff:['groom:desk','scent','groom:bath','groom:dry','groom:mirror','groom:photo']};
const GROOM_SAY={bath:'a bubble bath',haircut:'a haircut',nails:'a nail trim',puff:'a bath and blow dry'};
function groomStory(t){ const kinds=Object.keys(GROOM_VISITS), last=state.lastGroom, v=pick(kinds.filter(k=>k!==last)); state.lastGroom=v; t.visit=v;
  return GROOM_VISITS[v].map(s=>s==='scent'?{bg:'groomdesk',choice:{q:`Pick a bubble scent for ${nm()}.`,opts:Object.keys(SCENTS).map(id=>({label:SCENTS[id].label,preview:{art:id},fn:tt=>{ tt.picks.scent=id; }}))}}
    :s==='accessory'?{bg:'groom',choice:{q:`Pick something for ${nm()} to wear home.`,opts:[['bandana','A bandana','neck'],['bow','A bow','hat'],['bowtie','A bow tie','neck']].map(([id,label,slot])=>({label,preview:{outfit:{[slot]:id}},fn:tt=>{ tt.picks.acc=[id,label,slot]; wearGift(id,slot); }}))}}:s); }
/* The accessory from the groomer is the pet's to keep, even before care stars unlock it. */
function wearGift(id,slot){ state.gifted=(state.gifted||[]).concat((state.gifted||[]).includes(id)?[]:[id]); if(id==='bow') state.bowUnlocked=true; state.outfit=Object.assign({},state.outfit||{},{[slot]:id}); save(); }
V['groom:desk']=tripScene('groomdesk',{dur:3400,
  start(a){ setCaption(`Check in at the groomer's front desk. ${nm()} is here for ${GROOM_SAY[a.trip.visit]}!`); later(()=>play('ding',.5),300); },
  pose(p,e){ p.eyes='open'; blink(p,e); if(e>1600){ p.eyes='happy'; p.mouth='tongue'; } },
  front(e){ if(e>900&&e<2800){ const hy=e<1300?lerp(-24,30,ph(e,900,1300)):e<2400?30:lerp(30,-24,ph(e,2400,2800)); blit(ctx,SPR.hand,40,hy+Math.sin(e/120)*1.5); } },
  tick(a,e){ if(e>1700) once(a,'h',()=>play(happyNoise(),.45)); }});
V['groom:bath']=tripScene('groom',{dur:4800,clipY:78,noShadow:true,
  start(a){ const sc=SCENTS[a.trip.picks.scent||'lavender']; setCaption(`Bubble bath time! It smells ${sc.smell}.`); play('pour',.35); },
  pose(p,e){ p.dy=2; p.eyes=Math.floor(e/1500)%2?'happy':'closed'; p.mouth='tongue'; p.ear=Math.floor(e/400)%2; },
  front(e,a){ drawGroomTub(76,e,a.trip.picks.scent||'lavender'); },
  tick(a,e,now){ if(now>=a.next){ play(Math.random()<.5?'pop':'splat',.25); spawn('bubble3',64+rand(-18,18),70,rand(-4,4),-10,1.4); a.next=now+420; } if(e>2600) once(a,'d',()=>{ play('squeak',.45); setCaption('Squeak! The rubber duck joins in.'); }); }});
V['groom:shake']=tripScene('groom',{dur:3800,
  start(){ setCaption(`Towel dry... and then the big shake-off!`); },
  pose(p,e){ if(e<1800){ p.eyes='closed'; p.mouth='smile'; } else if(e<3000){ p.dx=Math.round(Math.sin(e/35)*3); p.eyes='closed'; p.mouth='open'; p.ear=Math.floor(e/60)%2; } else { p.eyes='happy'; p.mouth='tongue'; } },
  front(e,a,p){ if(e<1800){ const x=48+Math.sin(e/140)*6; drawTowel(x,headTopOf(p)-2,'#F2A7B5'); } },
  tick(a,e,now){ if(e<1800&&now>=a.next){ play('rustle',.3); a.next=now+380; } if(e>1800) once(a,'s',()=>{ play('whoosh',.5); play('splat',.4); }); if(e>1800&&e<3000&&now>=a.next2){ for(let i=0;i<3;i++) spawn('drop',64+rand(-14,14),64+rand(-8,8),rand(-40,40),rand(-40,-10),.6); a.next2=now+90; } if(e>3100) once(a,'h',()=>play(happyNoise(),.45)); }});
/* The blow dry puffs the pet up: fluffy fur-colored clouds all around it. */
V['groom:dry']=tripScene('groom',{dur:4200,
  start(){ setCaption(`Blow dry time... ${nm()} turns into a fluffy puffball!`); play('dryer',.35); },
  pose(p,e){ p.eyes='closed'; p.mouth=e>2600?'tongue':'smile'; p.ear=Math.floor(e/90)%2; if(e>3000) p.eyes='happy'; },
  behind(e){ const k=ph(e,500,2800), g=G(), c=furC(); if(k<=0) return; for(let i=0;i<12;i++){ const a=i/12*TAU, r=(g.bodyRx+3)*(.9+k*.35); pxEll(ctx,64+Math.cos(a)*r,PETY+g.chest+Math.sin(a)*r*.8,3.6*k+1,3.2*k+1,shade(c,.08)); } },
  front(e){ drawDryer(104,40,e<3000,e); },
  tick(a,e){ if(e>1400) once(a,'d2',()=>play('dryer',.3)); if(e>3000) once(a,'g',()=>{ play('pop',.5); play(happyNoise(),.45); setCaption(`So fluffy! ${nm()} looks like a cloud.`); }); }});
V['groom:brush']=tripScene('groom',{dur:3600,
  start(){ setCaption(`Brush, brush... so soft and shiny.`); },
  pose(p,e){ p.eyes='closed'; p.mouth='smile'; if(e>2600){ p.eyes='happy'; p.mouth='tongue'; } },
  front(e,a,p){ if(e<2600){ const x=54+Math.sin(e/200)*12, y=chestAt(p)-4+Math.cos(e/200)*3; blit(ctx,ICONS.brush,x,y); } },
  tick(a,e,now){ if(e<2600&&now>=a.next){ play('rustle',.25); a.next=now+400; } if(e>2600) once(a,'s',()=>{ burst(10); play('twinkle',.6); }); if(e>1200&&kind()==='cat') once(a,'p',()=>play('pet:purr',.45)); }});
V['groom:cut']=tripScene('groom',{dur:4000,
  start(){ setCaption(`Snip, snip! Time for a fresh new haircut.`); },
  pose(p,e){ p.eyes=e<3000?'open':'happy'; blink(p,e); if(e>3000) p.mouth='tongue'; },
  front(e,a,p){ if(e<3000){ const t=e/420, x=64+Math.cos(t)*16, y=headTopOf(p)+8+Math.sin(t*1.3)*6; drawScissors(x,y,Math.floor(e/160)%2); } },
  tick(a,e,now){ if(e<3000&&now>=a.next){ play('snip',.4); spawn('crumb',64+rand(-12,12),headTopOf({dy:0})+6,rand(-10,10),rand(-4,4),.9,furC()); a.next=now+320; } if(e>3000) once(a,'s',()=>{ burst(6); setCaption(`All done! ${nm()} looks so neat.`); play(happyNoise(),.45); }); }});
V['groom:nails']=tripScene('groom',{dur:4000,
  start(){ setCaption(`Nail trim time. ${nm()} holds very still.`); },
  pose(p,e){ p.eyes=e<2400?'open':'happy'; blink(p,e); if(e>2600&&e<3200){ p.mouth='open'; p.headDy=-1; } else if(e>3200){ const b=Math.floor(e/170)%2; p.headDy=b; p.mouth=b?'open':'smile'; } },
  front(e,a,p){ if(e<2400){ const x=Math.floor(e/800)%2?70:56; rect(ctx,x-1,PETY+G().pawY+1,6,2,INK); rect(ctx,x,PETY+G().pawY+1.4,4,1.2,'#9AA4AE'); rect(ctx,x+4,PETY+G().pawY+.6,3,3,'#E0567D'); }
    if(e>2400&&e<2800){ const k=ph(e,2400,2800), m=mouthAt(p); blit(ctx,SPR.cookie,lerp(110,m.x-4,k),lerp(30,m.y-3,k)+arc(k,14)); } },
  tick(a,e){ [300,700,1100,1500,1900].forEach((t,i)=>{ if(e>t) once(a,'c'+i,()=>play('snip',.35)); }); if(e>2450) once(a,'t',()=>setCaption(`A treat for being so brave!`)); if(e>2800) once(a,'cr',()=>{ play('crunch',.6); crumbs(64,72); }); }});
V['groom:mirror']=tripScene('groom',{dur:3800,
  start(a){ const acc=a.trip.picks.acc; setCaption(acc?`${nm()} admires the new ${acc[1].replace(/^A /,'').toLowerCase()} in the mirror. So stylish!`:`${nm()} looks in the mirror. Looking good!`); },
  pose(p,e){ p.dx=10; p.eyes='happy'; p.mouth=e>1500?'tongue':'smile'; if(e>1500&&e<2500) p.dy=-Math.round(Math.abs(Math.sin(e/150))*3); },
  behind(e){ drawMirror(26,58,e); ctx.save(); ctx.beginPath(); ctx.ellipse(26,58,12,16,0,0,TAU); ctx.clip(); ctx.translate(26,0); ctx.scale(-.62,.62); drawPet(ctx,state.style,stageName(),{eyes:'happy',mouth:e>1500?'tongue':'smile'},state.outfit,-22,62); ctx.restore(); ctx.fillStyle='rgba(255,255,255,.25)'; ctx.fillRect(18,44,2,24); },
  tick(a,e,now){ if(e>1500&&now>=a.next){ spawn('heart',74+rand(-8,8),54,rand(-4,4),-12,1.2); a.next=now+420; } if(e>1500) once(a,'w',()=>{ play('twinkle',.6); play(happyNoise(),.45); }); }});
V['groom:photo']=tripScene('groom',{dur:4200,
  start(){ setCaption(`Say cheese! A before and after photo for the album.`); },
  pose(p){ p.eyes='happy'; p.mouth='tongue'; },
  front(e){ if(e<600) return; const k=ph(e,600,1000); ctx.save(); ctx.globalAlpha=k; ctx.fillStyle='rgba(40,30,40,.55)'; fillView(ctx); ctx.restore();
    [[18,'Before',false],[70,'After',true]].forEach(([x,label,after])=>{ const y=16+Math.round((1-k)*30); rect(ctx,x-1,y-1,42,52,INK); rect(ctx,x,y,40,50,'#FFFDF6'); rect(ctx,x+3,y+3,34,34,after?'#E6F4F8':'#EFE6D8');
      ctx.save(); ctx.beginPath(); ctx.rect(x+3,y+3,34,34); ctx.clip(); ctx.translate(x+20,y+37); ctx.scale(.62,.62); drawPet(ctx,state.style,stageName(),{eyes:after?'happy':'open',mouth:after?'tongue':'flat'},after?state.outfit:null,-22,-44);
      if(!after){ const c=furC(); [[-10,-36],[-4,-40],[6,-39],[12,-34]].forEach(([dx,dy])=>{ ctx.fillStyle=c; ctx.beginPath(); ctx.moveTo(dx-2,dy+4); ctx.lineTo(dx,dy-3); ctx.lineTo(dx+2,dy+4); ctx.fill(); }); } ctx.restore();
      if(after) [[x+6,y+8],[x+32,y+12],[x+30,y+30]].forEach(([sx,sy])=>blit(ctx,SPR.sparkle,sx,sy));
      ctx.fillStyle=INK; ctx.font='7px "Jersey 10", sans-serif'; ctx.textAlign='center'; ctx.fillText(label,x+20,y+46); }); },
  tick(a,e){ if(e>700) once(a,'f',()=>{ play('shutter',.6); addPhoto('place',`${nm()} before and after the groomer. So fresh!`,{place:'groomer'}); }); if(e>1600) once(a,'h',()=>play(happyNoise(),.45)); }});

/* ---- Friend's house ---- */
function friendStory(t){ const known=(state.friends||[]).filter(f=>STYLES[f.style]&&STYLES[f.style].kind===kind()), f=maybeNeighbor(null,.4)||(known.length&&Math.random()<.6?pick(known):newFriend());
  t.friend=f; if(f.isNew){ state.friends=(state.friends||[]).concat([{name:f.name,style:f.style}]).slice(-6); save(); }
  return ['friend:hello',pick(['friend:chase','friend:tug','friend:snack','friend:nap'])]; }
function drawFriendPet(a,e,pose,dx){ const f=a.trip.friend; drawPetPose(ctx,f.style,f.sg||stageName(),Object.assign({eyes:'happy',mouth:'tongue',tail:Math.floor(e/120)%3},pose||{}),f.fit||null,PETX+36+(dx||0),PETY); }
V['friend:hello']=tripScene('friend',{dur:3600,
  start(a){ const f=a.trip.friend; setCaption(f.neighbor?`${nm()} visits ${f.name}, just down the street! Hello, ${f.name}!`:f.isNew?`${nm()} meets a new friend, ${f.name}! Hello!`:`${f.name} is so happy to see ${nm()} again!`); play('knock',.5); },
  pose(p,e){ p.dx=-8; p.eyes='happy'; p.mouth='tongue'; if(e>1200&&e<2600) p.dy=-Math.round(Math.abs(Math.sin(e/150))*3); },
  behind(e,a){ const k=ph(e,0,1200); drawFriendPet(a,e,e<1200?{body:'walk',face:-1,frame:Math.floor(e/140)%4}:{dy:e<2600?-Math.round(Math.abs(Math.sin(e/150+1))*3):0},lerp(60,0,k)); },
  tick(a,e,now){ if(e>1200) once(a,'b',()=>{ play(friendlyNoise(),.5); later(()=>play(friendHello(a.trip.friend),.4),350); }); if(e>1200&&now>=a.next){ spawn('heart',rand(40,90),50,rand(-4,4),-12,1.3); a.next=now+400; } }});
V['friend:chase']=tripScene('friend',{dur:4600,
  start(a){ setCaption(`Chase time! ${nm()} and ${a.trip.friend.name} zoom around the room.`); },
  pose(p,e){ const s=Math.sin(e/500); p.dx=Math.round(s*26)-8; p.body='run'; p.face=Math.cos(e/500)>=0?1:-1; p.frame=Math.floor(e/90)%4; p.eyes='happy'; p.mouth='tongue'; },
  behind(e,a){ const s=Math.sin(e/500-1.1); drawFriendPet(a,e,{body:'run',face:Math.cos(e/500-1.1)>=0?1:-1,frame:Math.floor(e/90+2)%4},Math.round(s*26)-10); },
  tick(a,e,now){ if(now>=a.next){ play('step',.25); a.next=now+200; } if(e>2000) once(a,'b',()=>play(happyNoise(),.5)); if(e>3800) once(a,'w',()=>setCaption(`Whew! Best friends forever.`)); }});
V['friend:tug']=tripScene('friend',{dur:4200,
  start(a){ setCaption(`${nm()} and ${a.trip.friend.name} share a rope toy. Tug of war!`); play('pet:growl',.4); },
  pose(p,e){ p.dx=-10+Math.round(Math.sin(e/220)*2); p.eyes='happy'; p.mouth='open'; },
  behind(e,a){ drawFriendPet(a,e,{mouth:'open'},Math.round(Math.sin(e/220)*2)); },
  front(e,a,p){ const m=mouthAt(p); drawRope(m.x+3,m.y+2,PETX+36+22+Math.round(Math.sin(e/220)*2)-8,m.y+2); },
  tick(a,e){ if(e>3000) once(a,'t',()=>{ setCaption(`It's a tie! Everybody wins.`); play('happy',.5); burst(6); }); }});
V['friend:snack']=tripScene('friend',{dur:4200,
  start(a){ setCaption(`Snack time! ${nm()} and ${a.trip.friend.name} munch side by side.`); },
  pose(p,e){ p.dx=-10; const b=Math.floor(e/220)%2; if(e<3200){ p.headDy=1+b; p.eyes='closed'; p.mouth=b?'open':'smile'; } else { p.eyes='happy'; p.mouth='tongue'; } },
  behind(e,a){ const b=Math.floor(e/240+1)%2; drawFriendPet(a,e,e<3200?{headDy:1+b,eyes:'closed',mouth:b?'open':'smile'}:{}); },
  front(){ blit(ctx,BOWLS[0],46,82); blit(ctx,BOWLS[0],94,82); },
  tick(a,e,now){ if(e<3200&&now>=a.next){ play('crunch',.4); crumbs(54,80); crumbs(102,80); a.next=now+480; } }});
V['friend:nap']=tripScene('friend',{dur:4600,
  start(a){ setCaption(`All played out. ${nm()} and ${a.trip.friend.name} share a cozy nap pile.`); play('lullaby',.4); },
  pose(p,e){ p.dx=-6; p.body='lie'; p.face=1; p.eyes='closed'; p.frame=0; },
  behind(e,a){ drawFriendPet(a,e,{body:'lie',face:-1,eyes:'closed',frame:0},-4); },
  tick(a,e,now){ if(now>=a.next){ spawn('z',70,62,5,-7,2.2); a.next=now+1100; } }});

/* ---- The bank and the hardware store: a free biscuit at the counter ---- */
function shopStory(k){ return [{v:'shop:walkin',bgName:k,extra:{shop:k}},{v:'shop:biscuit',extra:{shop:k}}]; }
function shopScene(d){ return Object.assign({scene(e,a){ BG[a.shop](0); },overlay(e,a){ if(a.fadeIn&&e<350){ ctx.fillStyle=`rgba(255,247,230,${(1-e/350).toFixed(3)})`; fillView(ctx); } }},d); }
V['shop:walkin']=shopScene({dur:3200,
  start(a){ setCaption(a.shop==='bank'?`${nm()} comes along to the bank.`:`${nm()} comes along to the hardware store.`); play('dingdong',.35); },
  pose(p,e){ if(e<1800){ p.body='walk'; p.face=1; p.frame=Math.floor(e/140)%4; p.dx=Math.round(lerp(-40,6,ph(e,0,1800))); } else { p.dx=6; p.eyes='open'; p.headDy=-1; } },
  tick(a,e,now){ if(e<1800&&now>=a.next){ play('step',.2); a.next=now+280; } if(e>2000) once(a,'l',()=>setCaption(`What's in that jar on the counter?`)); }});
V['shop:biscuit']=shopScene({dur:4400,
  init(a){ a.trick=learnedTricks().length&&Math.random()<.5; },
  start(a){ setCaption(a.shop==='bank'?`The teller has a free biscuit for ${nm()}!`:`The clerk has a free biscuit for ${nm()}!`); },
  pose(p,e,a){ p.dx=6; if(e<1600){ p.eyes='open'; p.headDy=-1; if(a.trick&&e>800&&e<1500){ p.dy=-3; p.eyes='happy'; } } else if(e<3000){ const b=Math.floor(e/170)%2; p.headDy=b; p.mouth=b?'open':'smile'; p.eyes='closed'; } else { p.eyes='happy'; p.mouth='tongue'; } },
  front(e,a,p){ if(e<1700){ const hy=e<600?lerp(-24,34,e/600):34; blit(ctx,SPR.hand,92,hy); blit(ctx,SPR.cookie,90,hy+16); } else if(e<1900){ const k=ph(e,1700,1900), m=mouthAt(p); blit(ctx,SPR.cookie,lerp(90,m.x-4,k),lerp(50,m.y-3,k)); } },
  tick(a,e){ if(a.trick&&e>800) once(a,'t',()=>{ play('sparkle',.5); setCaption(`${nm()} sits so nicely.`); spawn('sparkle',70,60,0,-8,.8); }); if(e>1800) once(a,'c',()=>{ play('crunch',.6); crumbs(70,72); });
    if(e>3000) once(a,'y',()=>{ play(happyNoise(),.5); setCaption(kind()==='dog'?`"Good dog!" ${nm()} says thank you with a wag.`:`"Good kitty!" ${nm()} says thank you with a slow blink.`); }); }});

/* ---- A cat's harness walk: flops over, won't budge, then trots along proudly ---- */
function catWalkStory(){ return ['catwalk:harness',pick(['catwalk:flop','catwalk:refuse']),'catwalk:proud'].concat(Math.random()<.5&&birdsOut()?['catwalk:bird']:[]); }
/* A padded walking harness. From the side: a loop around the neck just behind the head, a girth strap
   around the chest behind the front legs (following the body's outline), a strap along the back and one
   under the chest joining them, a buckle, and a metal ring on the back where the leash clips on. From the
   front: the neck loop, a strap down the chest to a ring, and the girth strap curving round each side. */
const HARNESS_ELLS=b=>[[b.cx+b.rx*.36,b.cy+b.ry*.05,b.rx*.64,b.ry*1.05],[b.cx-b.rx*.4,b.cy-b.ry*.08,b.rx*.6,b.ry*.9],[b.cx,b.cy-b.ry*.12,b.rx*.85,b.ry*.78]];
function bodyEdge(b,x,s){ let v=s<0?1e9:-1e9; HARNESS_ELLS(b).forEach(([ex,ey,erx,ery])=>{ const u=(x-ex)/erx; if(Math.abs(u)<1){ const y=ey+s*ery*Math.sqrt(1-u*u); v=s<0?Math.min(v,y):Math.max(v,y); } }); return Math.abs(v)<1e8?v:b.cy+s*b.ry; }
function drawHarness(p){ const C='#3E7FC4', L='#8CC0EE', D='#2F5A78';
  const ln=(x0,y0,x1,y1,c,t)=>pxLine(ctx,x0-t/2,y0-t/2,x1-t/2,y1-t/2,c,t);
  const band=(x0,y0,x1,y1,w)=>{ ln(x0,y0,x1,y1,INK,w+1); ln(x0,y0,x1,y1,C,w); const dx=x1-x0, dy=y1-y0, l=Math.hypot(dx,dy)||1, o=w*.22; ln(x0+dy/l*o,y0-dx/l*o,x1+dy/l*o,y1-dx/l*o,L,.45); };
  const ring=(x,y)=>{ pxRing(ctx,x,y,1.5,1.5,.6,INK); pxRing(ctx,x,y,1.1,1.1,.45,'#D0D6DE'); };
  const buckle=(x,y)=>{ rect(ctx,x-1.2,y-1,2.4,2,INK); rect(ctx,x-.8,y-.6,1.6,1.2,'#D8DEE6'); rect(ctx,x-.2,y-.6,.4,1.2,'#8A9098'); };
  let ax, ay;
  if(isSide(p)){ const at=(fx,fy)=>sideAt(p,fx,fy), gx=(G,P)=>G.body.cx+P.leg.fx-(G.lie?7:4.6);
    const n0=at(G=>G.head.x-G.head.rx*.78,G=>G.head.y+G.head.ry*.45), n1=at(G=>G.head.x-G.head.rx*.2,G=>G.head.y+G.head.ry*1.05);
    const c0=at(gx,(G,P)=>bodyEdge(G.body,gx(G,P),-1)+.4), c1=at((G,P)=>gx(G,P)+.8,(G,P)=>bodyEdge(G.body,gx(G,P)+.8,1)-.5);
    band(n1.x,n1.y,c1.x,c1.y,1.1); band(n0.x,n0.y,c0.x,c0.y,1.3); band(c0.x,c0.y,c1.x,c1.y,1.8); band(n0.x,n0.y,n1.x,n1.y,1.4);
    buckle(c0.x+(c1.x-c0.x)*.6,c0.y+(c1.y-c0.y)*.6);
    ax=c0.x+(n0.x-c0.x)*.3; ay=c0.y+(n0.y-c0.y)*.3-1.3; ring(ax,ay); }
  else { const nk=neckAt(p), cy=chestAt(p)+1.2, rx=G().bodyRx;
    pxEll(ctx,nk.x,nk.y+1,rx*.5+.9,2.3,INK); pxEll(ctx,nk.x,nk.y+1,rx*.5,1.5,C); pxEll(ctx,nk.x,nk.y+.4,rx*.38,.45,L);
    band(nk.x,nk.y+2.4,nk.x,cy,1.5);
    [-1,1].forEach(s=>{ band(nk.x+s*1.4,cy+.2,nk.x+s*rx*.5,cy+1.1,1.6); band(nk.x+s*rx*.5,cy+1.1,nk.x+s*rx*.84,cy+.3,1.6); buckle(nk.x+s*rx*.6,cy+1); });
    ring(nk.x,cy); ax=nk.x+rx*.42; ay=nk.y-.2; ring(ax,ay); }
  drawLeash(ax,ay,VIEW.x+VIEW.w+3,ay-28,C,D,13); }
V['catwalk:harness']=tripScene('street',{dur:3400,
  start(){ setCaption(`Harness on! Time for a little walk, ${nm()}.`); play('sparkle',.4); },
  pose(p,e){ p.eyes='open'; p.ear=1; blink(p,e); if(e>2400){ p.headDy=-1; } },
  front(e,a,p){ if(e>600) drawHarness(p); },
  tick(a,e){ if(e>600) once(a,'s',()=>{ spawn('sparkle',64,60,0,-8,.7); play('pop',.4); }); if(e>2000) once(a,'q',()=>{ setCaption(`${nm()} is not so sure about this...`); play('pet:meow',.4); }); }});
V['catwalk:flop']=tripScene('street',{dur:3600,
  start(){ setCaption(`${nm()} flops over on the sidewalk. Not yet!`); },
  pose(p,e){ if(e>500){ p.body='lie'; p.face=1; p.eyes='closed'; p.frame=0; } },
  front(e,a,p){ drawHarness(p); },
  tick(a,e){ if(e>500) once(a,'f',()=>play('thump',.3)); if(e>2200) once(a,'l',()=>setCaption(`A little rest... and a little more.`)); }});
V['catwalk:refuse']=tripScene('street',{dur:3400,
  start(){ setCaption(`${nm()} sits down and won't budge.`); },
  pose(p,e){ p.eyes='closed'; p.mouth='flat'; p.headDy=1; if(e>2400){ p.eyes='open'; p.mouth='smile'; } },
  front(e,a,p){ drawHarness(p); },
  tick(a,e){ if(e>2400) once(a,'m',()=>{ play('pet:trill',.4); setCaption(`Okay, okay. Let's go!`); }); }});
V['catwalk:proud']=tripScene('street',{dur:5000,scroll:1,
  start(){ setCaption(`Now ${nm()} trots along proudly, tail held high!`); },
  pose(p,e){ p.body='walk'; p.face=1; p.frame=Math.floor(e/150)%4; p.eyes='happy'; p.mouth='smile'; p.tail=2; },
  front(e,a,p){ drawHarness(p); },
  tick(a,e,now){ if(now>=a.next){ play('step',.18); a.next=now+300; } if(e>1500&&now>=a.next2){ spawn('sparkleSmall',50,64,-10,-6,.6); a.next2=now+500; } if(e>3000) once(a,'n',()=>{ setCaption(`A neighbor waves. What a brave kitty!`); play('pet:trill',.4); }); }});
V['catwalk:bird']=tripScene('street',{dur:3600,
  start(){ setCaption(`A little bird hops on the hedge. ${nm()} chatters at it.`); play('birdsong',.4); },
  pose(p,e){ p.eyes='open'; p.headDy=-1; p.ear=1; if(e>2600){ p.eyes='happy'; } },
  front(e,a,p){ drawHarness(p); if(e<2700) blit(ctx,SPR.bird,92,54-(Math.floor(e/260)%2)); else { const t=(e-2700)/900; blit(ctx,SPR.gull,92+t*20,54-t*40); } },
  tick(a,e){ if(e>900) once(a,'c',()=>play('pet:chatter',.45)); if(e>2700) once(a,'f',()=>play('chirp',.5)); }});

/* ---- Catio ---- */
V['catio:birds']=tripScene('catio',{dur:4400,
  start(){ setCaption(`Birds visit the feeder outside. ${nm()} watches through the screen.`); play('birdsong',.4); },
  pose(p,e){ p.eyes='open'; p.headDy=-2; p.ear=Math.floor(e/450)%2; p.dx=-8; if(e>3200){ p.eyes='happy'; } },
  front(e){ [[31,17],[38,15]].forEach(([x,y],i)=>blit(ctx,SPR.bird,x,y-(Math.floor(e/280+i)%2))); },
  tick(a,e){ if(e>1200) once(a,'c',()=>play('pet:chatter',.45)); if(e>2600) once(a,'t',()=>{ setCaption(`Chirp chirp! ${nm()} chirps right back.`); play('chirp',.5); }); }});
V['catio:sun']=tripScene('catio',{dur:4400,
  start(){ setCaption(`${nm()} sunbathes on the catio.`); },
  pose(p,e){ p.body='lie'; p.face=-1; p.frame=0; p.eyes=e>800?'closed':'happy'; },
  behind(e){ glow(ctx,64,70,40,'#FFF3B0',.35+.05*Math.sin(e/400)); },
  tick(a,e,now){ if(e>1200&&now>=a.next){ spawn('z',58,62,-5,-7,2.2); a.next=now+1200; } if(e>1000) once(a,'p',()=>play('pet:purr',.45)); }});
V['catio:sniff']=tripScene('catio',{dur:3800,
  init(a){ a.sneeze=Math.random()<.5; },
  start(){ setCaption(`${nm()} sniffs the plants on the catio.`); },
  pose(p,e,a){ p.dx=Math.round(lerp(0,-36,ph(e,0,900))); if(e<900){ p.body='walk'; p.face=-1; p.frame=Math.floor(e/140)%4; } else if(e<2400){ p.headDy=1+(Math.floor(e/280)%2); p.eyes='closed'; } else if(a.sneeze&&e<3000){ p.eyes='closed'; p.mouth='open'; } else { p.eyes='happy'; p.mouth='smile'; } },
  tick(a,e){ if(e>1000) once(a,'s',()=>play('sniff',.4)); if(e>2500) once(a,'n',()=>{ if(a.sneeze){ play('pet:sneeze',.6); setCaption('Achoo! Too tickly.'); } else { play('pet:purr',.45); setCaption(`Mmm, catnip. ${nm()} rolls happily.`); } }); }});

/* ---- Vet: a sticker (or a treat) at the end, and sometimes a trip on the scale ---- */
V['vet:scale']=tripScene('vet',{dur:3400,noShadow:true,
  start(){ setCaption(`Hop on the scale! ${nm()} is growing just right.`); },
  pose(p,e){ p.dy=-3; p.eyes=e<1500?'open':'happy'; blink(p,e); if(e>1500) p.mouth='tongue'; },
  front(e,a,p){ rect(ctx,44,84,40,5,INK); rect(ctx,45,85,38,3,'#DDE6EE'); rect(ctx,58,88,12,6,'#9AA4AE'); rect(ctx,90,62,14,10,INK); rect(ctx,91,63,12,8,'#9FD8C8'); const n=Math.min(8,Math.floor(e/180)); for(let i=0;i<n;i++) rect(ctx,92+i*1.3,68-(i%3),1,1+(i%3),'#2F7A7A'); },
  tick(a,e){ if(e>1500) once(a,'d',()=>{ play('ding',.5); spawn('sparkle',97,60,0,-6,.7); }); }});
V['vet:sticker']=tripScene('vet',{dur:3600,noShadow:true,
  init(a){ a.sticker=Math.random()<.6; },
  start(a){ setCaption(a.sticker?`A shiny "I was brave" sticker for ${nm()}!`:`A special treat for being so brave!`); },
  pose(p,e){ p.dy=-6; p.eyes='happy'; p.mouth='tongue'; if(e>1000&&e<2200) p.dy=-6-Math.round(Math.abs(Math.sin(e/150))*3); },
  front(e,a,p){ if(a.sticker){ const k=ph(e,400,900), x=lerp(110,64+G().bodyRx*.4,k), y=lerp(20,chestAt(p)+1,k); pxEll(ctx,x,y,4,4,INK); pxEll(ctx,x,y,3.4,3.4,'#F4C542'); blit(ctx,SPR.star,x-2.5,y-2.6); }
    else if(e>400&&e<900){ const k=ph(e,400,900), m=mouthAt(p); blit(ctx,SPR.bone,lerp(118,m.x,k)-6,lerp(30,m.y,k)+arc(k,16)-4); } },
  tick(a,e){ if(e>900) once(a,'s',()=>{ play(a.sticker?'sparkle':'crunch',.6); burst(8); play('happy',.5); }); if(e>1600) once(a,'h',()=>play(happyNoise(),.45)); }});

/* ---- Rainy day: watch the rain, then splash in puddles when it stops ---- */
V['rain:puddles']=tripScene('rainyard',{dur:5000,
  start(){ setCaption(`The rain stopped! ${nm()} splashes in the puddles.`); },
  pose(p,e){ const t=e%1000; p.eyes='happy'; p.mouth='tongue'; if(e<4000){ p.dx=Math.round(Math.sin(e/700)*20); p.dy=t<350?Math.round(arc(t/350,7)):0; } },
  tick(a,e,now){ const t=e%1000; if(e<4000&&t>350&&now>=a.next){ play('splat',.4); for(let i=0;i<5;i++) spawn('drop',64+rand(-10,10)+Math.sin(e/700)*20,88,rand(-30,30),rand(-40,-20),.6); a.next=now+900; }
    if(e>3900) once(a,'r',()=>{ setCaption(`Look, a rainbow!`); play('twinkle',.6); }); }});
/* ---- Photo booth: four flashes, four silly poses, a photo strip for the album ---- */
V['booth:snap']=tripScene('booth',{dur:6200,noShadow:true,
  start(){ setCaption(`A photo booth! Strike a pose, ${nm()}.`); },
  pose(p,e){ const k=Math.floor(e/1100); p.eyes=['happy','closed','open','happy'][k%4]; p.mouth=['tongue','smile','open','tongue'][k%4]; p.headDy=k===2?-2:0; p.dx=k===3?-4:k===1?4:0; if(e>4600){ p.eyes='happy'; p.mouth='tongue'; p.dx=0; } },
  front(e){ const f=e%1100; if(e<4400&&f<120){ ctx.fillStyle=`rgba(255,255,255,${(.9*(1-f/120)).toFixed(2)})`; fillView(ctx); }
    if(e>4600){ const k=ph(e,4600,5100), x=96, y=Math.round(lerp(100,14,k)); rect(ctx,x-1,y-1,24,76,INK); rect(ctx,x,y,22,74,'#FFFDF6');
      for(let i=0;i<4;i++){ rect(ctx,x+2,y+2+i*18,18,16,'#F4E2EC'); ctx.save(); ctx.beginPath(); ctx.rect(x+2,y+2+i*18,18,16); ctx.clip(); ctx.translate(x+11,y+18+i*18); ctx.scale(.36,.36); drawPet(ctx,state.style,stageName(),{eyes:['happy','closed','open','happy'][i],mouth:['tongue','smile','open','tongue'][i]},state.outfit,-22,-44); ctx.restore(); } } },
  tick(a,e){ [0,1,2,3].forEach(i=>{ if(e>i*1100+20) once(a,'f'+i,()=>play('shutter',.55)); }); if(e>4600) once(a,'p',()=>{ addPhoto('place',`${nm()} in the photo booth. Too cute!`,{place:'booth'}); setCaption(`A photo strip for the album!`); play('twinkle',.6); }); }});

/* ---- Home exploring for cats now lives in play: the box, the cat tree, the tunnel, the bag ---- */
['box','tree','tunnel','bag'].forEach(v=>{ V['play:'+v]=V['explore:'+v]; });
