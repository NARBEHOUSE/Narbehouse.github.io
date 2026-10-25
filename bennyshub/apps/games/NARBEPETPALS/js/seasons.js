'use strict';
/* ================= Seasons, holidays, the pet's birthday, and the weather =================
   The game follows the real calendar, year after year: spring (March to May), summer (June to August),
   fall (September to November) and winter (December to February), each with its own outings, events,
   room decorations and outdoor look. Holidays come round on their dates: Valentine's Day, Easter,
   the Fourth of July, Halloween, the December holidays and New Year's, plus the pet's own birthday on
   the day it was adopted. The weather changes every few hours; rain keeps everyone indoors (with a
   puddle walk instead) and snow turns everything white. */

/* ---- The calendar ---- */
function calToday(){ return window.__TODAY?new Date(window.__TODAY):new Date(); }
function easterDate(y){ const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),mo=Math.floor((h+l-7*m+114)/31),da=((h+l-7*m+114)%31)+1; return new Date(y,mo-1,da); }
const dayKey=d=>{ d=d||calToday(); return d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate(); };
function calSeason(d){ d=d||calToday(); const m=d.getMonth(); return (m===11||m<2)?'winter':m<5?'spring':m<8?'summer':'fall'; }
function calHoliday(d){ d=d||calToday(); const m=d.getMonth()+1, day=d.getDate(), y=d.getFullYear();
  if(m===2&&day>=7&&day<=14) return 'valentine';
  const e=easterDate(y), diff=Math.round((new Date(y,m-1,day)-e)/864e5); if(diff>=-7&&diff<=0) return 'easter';
  if(m===7&&day<=5) return 'july4';
  if(m===10&&day>=17) return 'halloween';
  if(m===12&&day<=26) return 'christmas';
  if((m===12&&day===31)||(m===1&&day===1)) return 'newyear';
  return null; }
const SEASON_WORD={spring:'spring',summer:'summer',fall:'fall',winter:'winter'};
/* The pet's birthday: the day it was adopted, each year after. It's celebrated once, within 3 days. */
function birthdayDue(){ if(!state||!state.born) return false; const b=new Date(state.born), d=calToday(); if(d.getFullYear()<=b.getFullYear()) return false;
  const bd=new Date(d.getFullYear(),b.getMonth(),b.getDate()), diff=Math.round((new Date(d.getFullYear(),d.getMonth(),d.getDate())-bd)/864e5);
  return diff>=0&&diff<=3&&seasonal('year:birthday')!==d.getFullYear(); }
const petYears=()=>{ const b=new Date(state.born), d=calToday(); let y=d.getFullYear()-b.getFullYear(); if(d.getMonth()<b.getMonth()||(d.getMonth()===b.getMonth()&&d.getDate()<b.getDate())) y--; return Math.max(1,y); };
/* What happened when, so yearly things happen once a year and daily things once a day. */
function seasonal(k){ return state&&state.seasonal?state.seasonal[k]:undefined; }
function markSeasonal(k,v){ state.seasonal=Object.assign({},state.seasonal||{},{[k]:v}); save(); }
const doneToday=id=>seasonal('day:'+id)===dayKey(), doneThisYear=id=>seasonal('year:'+id)===calToday().getFullYear();

/* ---- The weather: a new sky every 3 hours, likelier by season ---- */
const WEATHER={sunny:{label:'Sunny',icon:'☀️'},cloudy:{label:'Cloudy',icon:'☁️'},rain:{label:'Rainy',icon:'🌧️'},snow:{label:'Snowy',icon:'❄️'},windy:{label:'Windy',icon:'🍂'}};
const WX_ODDS={winter:[['snow',34],['cloudy',26],['sunny',32],['rain',8]],spring:[['sunny',46],['rain',26],['cloudy',28]],summer:[['sunny',66],['cloudy',20],['rain',14]],fall:[['sunny',42],['cloudy',24],['rain',18],['windy',16]]};
function wxNow(){ if(window.__WX) return window.__WX; const d=calToday(), seed=(d.getFullYear()%100)*400+(d.getMonth()+1)*31+d.getDate(), r=hash2(seed,Math.floor(d.getHours()/3)+1,77), list=WX_ODDS[calSeason(d)], tot=list.reduce((s,x)=>s+x[1],0); let a=r*tot;
  for(const [id,w] of list){ a-=w; if(a<=0) return id; } return list[0][0]; }
/* What the sky is doing right now, so words and sounds always match the window: a clear sky (sunny or
   windy), the sun out (clear and not night), and birds about (daytime, not raining or snowing). */
const clearSky=()=>{ const w=wxNow(); return w==='sunny'||w==='windy'; };
const sunOut=()=>clearSky()&&skyMode()!=='night';
const birdsOut=()=>skyMode()!=='night'&&wxNow()!=='rain'&&wxNow()!=='snow';
const WX_MSG={sunny:n=>skyMode()==='night'?`The clouds cleared away. The stars are out for ${n}.`:`The sun came out! A bright day for ${n}.`,cloudy:()=>`Clouds are rolling in.`,rain:n=>`It started raining. A cozy day inside with ${n}.`,snow:n=>`It's snowing! Everything is turning white. ${n} watches the flakes.`,windy:()=>`It's windy! Leaves are blowing everywhere.`};
const SEASON_MSG={spring:n=>`It's spring! Flowers are blooming for ${n}.`,summer:n=>`It's summer! Sunny days and splashy fun for ${n}.`,fall:n=>`It's fall! Crunchy leaves and pumpkins for ${n}.`,winter:n=>`It's winter! Snowy days and cozy nights with ${n}.`};
const HOLIDAY_MSG={valentine:n=>`Valentine's week! ${n} wants to send love to friends.`,easter:n=>`It's almost Easter! Keep an eye out for hidden eggs, ${n}.`,july4:n=>`Happy Fourth of July! There might be fireworks tonight.`,halloween:n=>`It's Halloween season! Time to pick a costume for ${n}.`,christmas:n=>`The holidays are here! Let's decorate the tree with ${n}.`,newyear:n=>`Happy New Year, ${n}!`};

/* ---- Outdoors: snow on the ground and falling flakes in winter, leaves in fall, petals in spring ---- */
/* Snow on the ground goes behind the pet; falling flakes, leaves and petals go in front. */
function outdoorGround(){ if(calSeason()!=='winter') return; const n=Math.round(VIEW.w/5); ctx.fillStyle='rgba(255,255,255,.55)'; ctx.fillRect(VIEW.x,62,VIEW.w,VIEW.y+VIEW.h-62); for(let i=0;i<n;i++) rect(ctx,VIEW.x+hash2(i,4,9)*VIEW.w,62+hash2(i,5,9)*(VIEW.y+VIEW.h-62),1.4,.6,'#FFFFFF'); }
function outdoorFx(now){ const s=calSeason(), w=wxNow(), n=Math.round(VIEW.w/5);
  const kind=s==='winter'?'flake':s==='fall'?'leaf':s==='spring'?'petal':null; if(!kind) return; const count=kind==='flake'?(w==='snow'?n:Math.round(n/3)):w==='windy'?Math.round(n/2):Math.round(n/5), spd=kind==='flake'?.012:.02;
  for(let i=0;i<count;i++){ const x=VIEW.x+(((hash2(i,1,3)*VIEW.w+now*spd*(w==='windy'?3:1)*(.5+hash2(i,2,3)))%VIEW.w)+VIEW.w)%VIEW.w, y=VIEW.y+((hash2(i,3,3)*VIEW.h+now*(kind==='flake'?.018:.014)*(.6+hash2(i,6,3)))%VIEW.h), sw=Math.sin(now/600+i)*1.5;
    if(kind==='flake') rect(ctx,x+sw,y,1,1,'#FFFFFF'); else if(kind==='leaf') pxEll(ctx,x+sw,y,1.3,.8,['#E08A3C','#C9502E','#E8B54A'][i%3]); else pxEll(ctx,x+sw,y,1,.7,i%2?'#F7C4CF':'#FFFFFF'); } }
/* The room's window shows the weather. */
/* Weather shows only through the glass: behind the window bars and behind the curtains. */
function clipWindowGlass(){ const sp=spotOf('window')||SPOT.wallL, p=itemPos('window',sp.id); ctx.beginPath(); [[4,2],[18.2,2],[4,15.2],[18.2,15.2]].forEach(([x,y])=>ctx.rect(p.x+x,p.y+y,11.8,10.8)); ctx.clip();
  const id=room().curtains; if(!id||id==='none'||!CURTAINS[id]) return; const cx=p.x-4, cy=p.y-3.4, W=y=>y<18?lerp(9,3.4,(y-2.6)/15.4):lerp(3.4,7.4,(y-18)/11.6);
  ctx.beginPath(); ctx.rect(VIEW.x-2,VIEW.y-2,VIEW.w+4,VIEW.h+4);
  [[1,1],[41,-1]].forEach(([x0,sd])=>{ ctx.moveTo(cx+x0,cy+2.4); for(let y=2.4;y<=29.8;y+=.5) ctx.lineTo(cx+x0+sd*(W(Math.max(2.6,y))+.4),cy+y); ctx.lineTo(cx+x0,cy+29.8); ctx.closePath(); });
  ctx.clip('evenodd'); }
function drawWindowWeather(now){ if(anim&&anim.key==='event:rain') return; const w=WIN(), wx=wxNow(), s=calSeason(); ctx.save(); clipWindowGlass();
  if(wx==='cloudy'||wx==='rain'){ ctx.fillStyle=wx==='rain'?'rgba(70,80,110,.4)':'rgba(150,160,180,.35)'; ctx.fillRect(w.x,w.y,w.w,w.h); }
  if(wx==='rain') for(let i=0;i<18;i++){ const x=w.x+((i*7+now*.02)%(w.w+4))-2, y=w.y+((i*11+now*.09)%(w.h+4))-3; rect(ctx,x,y,.5,3,'#CFE2F6'); }
  if(wx==='snow'||(s==='winter'&&wx!=='rain')) for(let i=0;i<(wx==='snow'?22:7);i++){ const x=w.x+((i*9+Math.sin(now/700+i)*3+w.w*4)%w.w), y=w.y+((i*13+now*.012)%(w.h+2))-1; rect(ctx,x,y,1,1,'#FFFFFF'); }
  if(s==='fall') for(let i=0;i<(wx==='windy'?6:2);i++){ const x=w.x+((i*17+now*(wx==='windy'?.05:.012))%(w.w+6))-3, y=w.y+((i*23+now*.015)%(w.h+4))-2; pxEll(ctx,x,y,1.2,.7,['#E08A3C','#C9502E','#E8B54A'][i%3]); }
  if(s==='spring'&&wx!=='rain') for(let i=0;i<3;i++){ const x=w.x+((i*19+now*.01)%(w.w+4))-2, y=w.y+((i*29+now*.012)%(w.h+4))-2; pxEll(ctx,x,y,.9,.6,'#F7C4CF'); }
  if(calHoliday()==='july4'||calHoliday()==='newyear') fireworksIn(w.x,w.y,w.w,w.h,now,.6);
  ctx.restore(); }
function fireworksIn(x,y,wd,ht,now,k){ for(let j=0;j<3;j++){ const t=((now/1400)+j*.37)%1, cx=x+wd*(.2+.3*j), cy=y+ht*(.3+.15*(j%2)), r=(3+t*9)*k, c=['#F07A8E','#F4C542','#7FA8D8','#8CC98A'][(Math.floor(now/1400+j*.37)+j)%4]; if(t<.1) continue;
  for(let a=0;a<10;a++){ const an=a/10*TAU; rect(ctx,cx+Math.cos(an)*r,cy+Math.sin(an)*r+t*2,.8,.8,c); } } }

/* ---- The room dresses up for the season ---- */
const TREE_SPOTS=['backL','backC','backR'];
function treeSpot(){ if(calHoliday()!=='christmas') return null; const r=room(), id=TREE_SPOTS.find(k=>!r.spots[k]); if(!id) return null; const b=SPOT[id].box; return {x:b[0]+b[2]/2,y:61.5,spot:id}; }
const treeDeco=()=>seasonal('tree:'+calToday().getFullYear())||0;
const ORN=[[-5,-6],[4,-9],[-2,-14],[6,-3],[-7,-1],[1,-19],[-4,-22],[5,-15],[0,-4],[-8,-8]];
function drawXmasTree(g,x,y,deco,lit){ softShadow(g,x,y,12,2,.3); rect(g,x-5,y-5,10,5,INK); rect(g,x-4.4,y-4.4,8.8,4.4,'#D9403E'); rect(g,x-1.2,y-8,2.4,3,'#6A4428');
  [[-11,-8,20],[-9,-16,15],[-7,-23,11]].forEach(([hw,base,h])=>{ g.fillStyle=INK; g.beginPath(); g.moveTo(x+hw-.6,y+base+.5); g.lineTo(x-hw+.6,y+base+.5); g.lineTo(x,y+base-h-.6); g.fill(); g.fillStyle='#3E8A5A'; g.beginPath(); g.moveTo(x+hw,y+base); g.lineTo(x-hw,y+base); g.lineTo(x,y+base-h); g.fill(); g.fillStyle='#5FA873'; g.beginPath(); g.moveTo(x-hw*.2,y+base-2); g.lineTo(x-hw,y+base); g.lineTo(x,y+base-h); g.fill(); });
  for(let i=0;i<Math.min(deco,ORN.length);i++){ const [dx,dy]=ORN[i]; pxEll(g,x+dx,y-8+dy,1.4,1.4,INK); pxEll(g,x+dx,y-8+dy,1,1,['#D9403E','#F4C542','#5A8FC4','#F07A8E'][i%4]); }
  if(deco>=6){ const sy=y-40; pxEll(g,x,sy,2.6,2.6,INK); blit(g,SPR.star,x-2.5,sy-2.6); } }
function drawSeasonRoom(g){ const r=room(), B=viewBounds(), h=calHoliday(), s=calSeason(), bday=state&&state.seasonal&&seasonal('bdayShow')===dayKey();
  /* a garland along the top of the wall, unless string lights hang there */
  const style=bday?'party':h||({spring:'spring',fall:'fall',winter:'winter'})[s];
  if(style&&!r.spots.ceil){ const cols={party:['#F07A8E','#F4C542','#7FB08C','#7FA8D8'],valentine:['#F07A8E','#D9403E','#FFFFFF'],easter:['#F7C4CF','#B8E0A0','#FFF3B0','#C9B0E8'],july4:['#D9403E','#FFFFFF','#3E6FA4'],halloween:['#F08A2A','#2F2B35'],christmas:['#3E8A5A'],newyear:['#F4C542','#FFFFFF'],spring:['#F7C4CF','#FFF3B0','#B8E0A0'],fall:['#E08A3C','#C9502E','#E8B54A'],winter:['#FFFFFF','#CFE2F6']}[style];
    for(let t=al(B.x0,128);t<B.x1;t+=128){ for(let x=0;x<128;x+=.5) rect(g,t+x,2.2+Math.sin(x/128*Math.PI)*4,.5,.5,style==='christmas'?'#2E6A44':'#8A6A4A');
      for(let i=0;i<16;i++){ const x=t+4+i*8, y=2.6+Math.sin((x-t)/128*Math.PI)*4, c=cols[i%cols.length];
        if(style==='christmas'){ pxEll(g,x,y+.6,2.4,1.6,'#3E8A5A'); pxEll(g,x,y+2.2,.9,.9,['#D9403E','#F4C542','#5A8FC4'][i%3]); }
        else if(style==='valentine'||style==='party'&&i%2) heartFill(g,x,y+.6,1.8,c);
        else if(style==='easter'){ pxEll(g,x,y+2.2,1.5,2,INK); pxEll(g,x,y+2.2,1.1,1.6,c); }
        else if(style==='fall'){ pxEll(g,x,y+1.4,1.8,1.1,c); }
        else if(style==='winter'||style==='newyear'){ rect(g,x-1.5,y+1.8,3,.6,c); rect(g,x-.3,y+.6,.6,3,c); }
        else if(style==='spring'){ pxEll(g,x,y+1.6,1.5,1.5,c); pxEll(g,x,y+1.6,.6,.6,'#F4C542'); }
        else { g.fillStyle=c; g.beginPath(); g.moveTo(x-2.4,y); g.lineTo(x+2.4,y); g.lineTo(x,y+4); g.fill(); } } } }
  /* the window sill: a pumpkin in fall (carved for Halloween), snow in winter, a little flower pot in spring */
  const w=WIN(), sy=w.y+w.h;
  if(s==='winter'){ pxEll(g,w.cx,sy+.4,w.w*.45,1,'#FFFFFF'); }
  if(s==='spring'){ const px=w.cx-w.w*.3; rect(g,px-2,sy-3,4,3,'#D8765A'); pxEll(g,px-1,sy-4.4,1.2,1.2,'#F07A8E'); pxEll(g,px+1.2,sy-4.8,1.2,1.2,'#F4C542'); }
  /* a holiday tree in December, with the ornaments hung so far */
  const tr=treeSpot(); if(tr) drawXmasTree(g,tr.x,tr.y,treeDeco());
  if(tr&&calToday().getDate()>=20&&!doneThisYear('presents')){ [[-12,'#D9577A'],[10,'#5A8FC4']].forEach(([dx,c])=>{ rect(g,tr.x+dx-4,tr.y-6,8,6,INK); rect(g,tr.x+dx-3.4,tr.y-5.4,6.8,4.8,c); rect(g,tr.x+dx-.5,tr.y-5.4,1,4.8,'#F4C542'); }); }
  /* birthday balloons */
  if(bday){ [[-10,'#F07A8E'],[-4,'#F4C542'],[2,'#7FA8D8']].forEach(([dx,c],i)=>{ const bx=STATION.door[0]+dx-4, by=16+i*3; pxLine(g,bx,by+4,STATION.door[0]-6,54,'#9A8A7A',.4); pxEll(g,bx,by,3,3.6,INK); pxEll(g,bx,by,2.4,3,c); pxEll(g,bx-.8,by-1.2,.7,1,'#FFFFFF'); }); } }
/* Twinkles in the room: tree lights and a flickering jack-o-lantern. */
/* The fall pumpkin on the window sill, drawn after the weather in the glass so it stays bright: the one
   the pet picked at the pumpkin patch this year (round, tall or bumpy), or a little one otherwise. It is
   carved for Halloween. */
function drawSillPumpkin(g){ if(calSeason()!=='fall') return; const w=WIN(), ledge=w.y+w.h+1.8, h=calHoliday(), picked=seasonal('pumpkin')===calToday().getFullYear()&&seasonal('pumpkinKind');
  const kind=picked||'small', px=w.cx+w.w*.26, ph=kind==='tall'?3.3:kind==='small'?2.2:2.6, py=ledge-ph;
  if(kind==='small'){ pxEll(g,px,py,3.4,2.6,INK); pxEll(g,px,py,2.8,2,'#F08A2A'); rect(g,px-.4,py-3.4,.9,1.6,'#5A7A3A'); } else pumpkinAt(g,px,py,.75,kind);
  if(h==='halloween'){ Tr(g,px-1.8,py-.6,px-.6,py-.6,px-1.2,py-1.6,'#FFE27A'); Tr(g,px+.6,py-.6,px+1.8,py-.6,px+1.2,py-1.6,'#FFE27A'); rect(g,px-1.4,py+.5,2.8,.7,'#FFE27A'); } }
function drawSeasonLive(now){ drawSillPumpkin(ctx); const tr=treeSpot(); if(tr) for(let i=0;i<8;i++){ if(Math.floor(now/350+i*1.3)%3) continue; const a=i/8, x=tr.x+(a-.5)*16*(1-a*.4), y=tr.y-10-a*24; rect(ctx,x-.4,y-.4,.8,.8,'#FFFFFF'); glow(ctx,x,y,3,'#FFF3C0',.4); }
  if(calHoliday()==='halloween'&&calSeason()==='fall'){ const w=WIN(); glow(ctx,w.cx+w.w*.28,w.y+w.h-2,6,'#FFB347',.3+.12*Math.sin(now/90)); } }
const seasonKey=()=>[calSeason(),calHoliday(),treeDeco(),doneThisYear('presents'),seasonal('bdayShow')===dayKey(),seasonal('pumpkin')===calToday().getFullYear()?seasonal('pumpkinKind'):''].join(',');

/* ---- Halloween costumes ---- */
OUTFITS.hat.push(['mane','Lion mane',999]); OUTFITS.body.push(['pumpkin','Pumpkin costume',999],['ghost','Ghost costume',999]);
HATS.mane=(b,G)=>{ const {cx,hy,H}=G; for(let i=0;i<16;i++){ const a=i/16*TAU; part(b,T=>E(T,cx+Math.cos(a)*(H.rx+.8),hy+Math.sin(a)*(H.ry+.8),2.3,2.3,i%2?'#D9903A':'#B8702A',SH)); } };
CLOTHES.pumpkin={fill:x=>alt2(x*.55,'#F08A2A','#E07428'),extra(b,G){ R(b,G.cx-.5,G.neckY-.6,1.2,1.6,'#5A7A3A'); E(b,G.cx+1.6,G.neckY+.2,1.4,.7,'#6E9B5D'); }};
CLOTHES.ghost={fill:()=>'#F6F4FA',extra(b,G){ E(b,G.cx-1.8,G.bodyCy-1.2,.8,1,'#3A3440'); E(b,G.cx+1.8,G.bodyCy-1.2,.8,1,'#3A3440'); E(b,G.cx,G.bodyCy+1.4,.9,.7,'#3A3440'); }};
const COSTUMES=[{id:'witch',label:'A witch',fit:{hat:'witch',body:'cape'}},{id:'pumpkin',label:'A pumpkin',fit:{body:'pumpkin'}},{id:'ghost',label:'A friendly ghost',fit:{body:'ghost'}},
  {id:'pirate',label:'A pirate',fit:{hat:'pirate',neck:'bandana'}},{id:'bee',label:'A bumblebee',fit:{body:'bee'}},{id:'dino',label:'A dinosaur',fit:{body:'dino'}},
  {id:'hero',label:'A superhero',fit:{body:'cape',face:'star'}},{id:'wizard',label:'A wizard',fit:{hat:'wizard',body:'pajamas'}},{id:'lion',label:'A lion',fit:{hat:'mane'}}];
function wearCostume(c){ Object.entries(c.fit).forEach(([slot,id])=>{ state.gifted=(state.gifted||[]).concat((state.gifted||[]).includes(id)?[]:[id]); }); state.outfit=Object.assign({},c.fit); save(); }

/* ---- Seasonal places to go (on the door while they're in season) ---- */
Object.assign(PLACES,{
  pumpkinpatch:{label:'Pumpkin Patch',sub:'Pick a pumpkin for home',season:'fall',stage:0,travel:'car',music:'yard',bg:'pumpkin',outdoor:true,
    story:t=>['pumpkin:walk',{bg:'pumpkin',choice:{q:`Which pumpkin should ${state.name} pick?`,opts:[['round','A little round one'],['tall','A tall one'],['bumpy','A bumpy one']].map(([id,label])=>({label,preview:{art:'pumpkin_'+id},fn:tt=>{ tt.picks.pumpkin=id; }}))}},'pumpkin:carry']},
  orchard:{label:'Apple Orchard',sub:'Apples falling from the trees',season:'fall',stage:0,travel:'car',music:'yard',bg:'orchard',outdoor:true,story:()=>['orchard:apples','orchard:basket']},
  flowerfest:{label:'Flower Festival',sub:'Flowers, butterflies, and a crown',season:'spring',stage:0,travel:'car',music:'fest',bg:'fest',outdoor:true,story:()=>['fest:flowers','fest:crown']},
  splashpad:{label:'Splash Pad',sub:'Jump through the water jets',season:'summer',stage:0,travel:'car',music:'friend',bg:'splash',outdoor:true,story:()=>['splash:jets','splash:shake']},
  beachday:{label:'Beach Day',sub:'Sand, shells, and sunshine',season:'summer',stage:0,travel:'car',music:'walk',bg:'beach',outdoor:true,story:()=>['beach:dig','beach:rest']},
  sledding:{label:'Sledding Hill',sub:'Whee! Down the snowy hill',season:'winter',stage:0,travel:'car',music:'snow',bg:'sled',outdoor:true,story:()=>['sled:ride','snow:angel']},
  lightswalk:{label:'Holiday Lights',sub:'A walk past twinkly lights',when:()=>calHoliday()==='christmas',stage:0,travel:'door',music:'holiday',bg:'lights',outdoor:true,story:()=>['lights:walk']},
  puddlewalk:{label:'Puddle Walk',sub:'Rain boots and splashes',wx:'rain',stage:0,travel:'door',music:'rain',bg:'rainwalk',outdoor:true,rainOK:true,story:()=>['rainwalk:puddles']},
  /* happening by themselves */
  egghunt:{label:'Egg Hunt',hidden:true,travel:'none',music:'fest',bg:'eggyard',story:()=>['egg:hunt'],doneMsg:n=>`${n} found all the eggs! Happy Easter.`},
  sprinkler:{label:'Sprinkler',hidden:true,travel:'none',music:'friend',bg:'yard',story:()=>['sprinkler:jump'],doneMsg:n=>`What a splashy summer day for ${n}!`},
  leafpile:{label:'Leaf Pile',hidden:true,travel:'none',music:'yard',bg:'leafyard',story:()=>['leaves:jump'],doneMsg:n=>`${n} loves crunchy fall leaves!`},
  snowday:{label:'Snow Day',hidden:true,travel:'none',music:'snow',bg:'snowyard',story:()=>['snow:play','snow:angel'],doneMsg:n=>`What a snowy day for ${n}!`},
  cocoa:{label:'Cozy Fire',hidden:true,travel:'none',music:'snow',bg:'den',story:()=>['cocoa:fire'],doneMsg:n=>`Warm and cozy with ${n}.`},
  fireworks:{label:'Fireworks',hidden:true,travel:'none',music:'rain',bg:'home',story:()=>['fireworks:cozy'],doneMsg:n=>`${n} felt safe and snug during the fireworks.`},
  trickortreat:{label:'Trick or Treat',hidden:true,travel:'door',music:'spooky',bg:'tot',story:()=>['tot:walk','tot:door','tot:door2'],doneMsg:n=>`What a fun Halloween night for ${n}!`},
  treetrim:{label:'Decorate the Tree',hidden:true,travel:'none',music:'holiday',bg:'home',story:()=>[kind()==='cat'&&Math.random()<.35?'tree:climb':'tree:hang'],doneMsg:n=>`The tree looks so festive! Thanks, ${n}.`},
  presents:{label:'Presents',hidden:true,travel:'none',music:'holiday',bg:'home',story:t=>[{v:'event:gift',extra:{toy:t.toy,box:'red'}},'present:sweater'],doneMsg:n=>`Happy holidays, ${n}!`},
  valentines:{label:'Valentines',hidden:true,travel:'none',music:'fest',bg:'home',story:()=>['val:card','val:reply'],doneMsg:n=>`${n} spread a little love today.`},
  birthday:{label:'Birthday',hidden:true,travel:'none',music:'friend',bg:'home',story:()=>['bday:party'],doneMsg:n=>`Happy birthday, ${n}! What a party.`}
});
Object.assign(BG,{home:()=>{ drawBackground(); blitView(ctx,bg); drawStations(clock(),null); },
  pumpkin:()=>drawPumpkinPatch(), orchard:()=>drawOrchard(), fest:()=>drawFestival(), splash:e=>drawSplashPad(e), sled:()=>drawSledHill(), lights:e=>drawLightsStreet(e||0), rainwalk:e=>drawRainWalk(e||0),
  eggyard:()=>{ drawGarden(); }, leafyard:()=>{ drawYard(); drawLeafPiles(); }, snowyard:()=>{ drawYard(); }, den:()=>drawDen(), tot:e=>drawHalloweenStreet(e||0)});
['walk:park','walk:beach','walk:woods','walk:dogpark','explore:garden','garden:sniff','yard:sun','yard:dig','yard:birds','catwalk:harness','catwalk:flop','catwalk:refuse','catwalk:proud','catwalk:bird'].forEach(k=>{ if(V[k]) V[k].outdoor=true; });
/* Which places are open right now: in season, on the right day, and indoors when it rains. */
function placeInSeason(P){ if(P.season&&P.season!==calSeason()) return false; if(P.notSeason&&P.notSeason===calSeason()) return false; if(P.when&&!P.when()) return false; if(P.wx&&P.wx!==wxNow()) return false; return true; }
const OUTDOOR_PLACES=['backyard','garden','park','beach','woods','dogpark','catwalk'];
function placeWeatherOK(id,P){ const w=wxNow(); if(w==='rain'&&(P.outdoor||OUTDOOR_PLACES.includes(id))&&!P.rainOK) return false; if(calSeason()==='winter'&&id==='beach') return false; return true; }
const isSeasonalPlace=P=>!!(P.season||P.when||P.wx);

/* ---- Seasonal events (they happen by themselves, when it's their time) ---- */
const SEASON_EVENTS={
  egghunt:{w:4,ok:()=>calHoliday()==='easter'&&wxNow()!=='rain'&&!doneToday('egghunt'),go:()=>{ markSeasonal('day:egghunt',dayKey()); startTrip('egghunt'); }},
  sprinkler:{w:3,ok:()=>calSeason()==='summer'&&wxNow()!=='rain',go:()=>startTrip('sprinkler')},
  fireworks:{w:4,ok:()=>['july4','newyear'].includes(calHoliday())&&!doneToday('fireworks'),go:()=>{ markSeasonal('day:fireworks',dayKey()); startTrip('fireworks'); }},
  leafpile:{w:3,ok:()=>calSeason()==='fall'&&wxNow()!=='rain',go:()=>startTrip('leafpile')},
  halloween:{w:5,ok:()=>calHoliday()==='halloween'&&!doneToday('halloween'),go:()=>{ markSeasonal('day:halloween',dayKey()); askCostume(); }},
  snowday:{w:4,ok:()=>wxNow()==='snow',go:()=>startTrip('snowday')},
  cocoa:{w:2,ok:()=>calSeason()==='winter',go:()=>startTrip('cocoa')},
  treetrim:{w:4,ok:()=>!!treeSpot()&&treeDeco()<10&&calToday().getDate()<=24&&!doneToday('treetrim'),go:()=>{ markSeasonal('day:treetrim',dayKey()); startTrip('treetrim'); }},
  valentines:{w:4,ok:()=>calHoliday()==='valentine'&&!doneToday('valentines'),go:()=>{ markSeasonal('day:valentines',dayKey()); askValentine(); }}
};
function seasonalEvents(){ return Object.keys(SEASON_EVENTS).filter(id=>{ try{ return SEASON_EVENTS[id].ok(); }catch(e){ return false; } }).map(id=>[id,SEASON_EVENTS[id].w]); }
/* Big days don't wait for a random turn: the birthday party and opening presents happen as soon as
   things are calm; a greeting marks each new season and holiday. */
function seasonalPriority(){ const n=state.name, y=calToday().getFullYear();
  if(birthdayDue()){ markSeasonal('year:birthday',y); markSeasonal('bdayShow',dayKey()); bgKey=null; lockInput(2000); startTrip('birthday'); return true; }
  if(treeSpot()&&calToday().getDate()>=25&&!doneThisYear('presents')){ markSeasonal('year:presents',y); bgKey=null; const un=unownedToys(); lockInput(2000); startTrip('presents',null,{toy:un.length?pick(un):pick(ownedToys())}); return true; }
  const s=calSeason(), sk='greet:'+s; if(seasonal(sk)!==y){ markSeasonal(sk,y); announce(SEASON_MSG[s](n)); play('twinkle',.5); bgKey=null; return true; }
  const h=calHoliday(); if(h&&seasonal('greet:'+h)!==y){ markSeasonal('greet:'+h,y); announce(HOLIDAY_MSG[h](n)); play('fanfare',.4); bgKey=null; return true; }
  return false; }
function askCostume(){ const opts=pickSome(COSTUMES,4);
  showChoice(`It's Halloween! What should ${state.name} dress up as?`,opts.map(c=>({label:c.label,preview:{outfit:c.fit},fn:()=>{ wearCostume(c); startTrip('trickortreat'); }}))); }
function askValentine(){ const k=kind(), known=(state.friends||[]).filter(f=>STYLES[f.style]&&STYLES[f.style].kind===k), pool=known.length>=2?pickSome(known,3):known.concat([newFriend(known.map(f=>f.name))]).slice(0,3);
  showChoice(`Who should ${state.name} send a valentine to?`,pool.map(f=>({label:f.name,preview:{petStyle:f.style},fn:()=>{ startTrip('valentines',null,{friend:f}); }}))); }

/* ---- Backgrounds ---- */
/* A pumpkin with ribbed lobes, shading, a shine and a curved stem (tall, round or bumpy). */
function pumpkinAt(g,x,y,s,type){ const w=(type==='tall'?3.4:4.6)*s, h=(type==='tall'?4.4:3.4)*s;
  softShadow(g,x,y+h*.8,w*1.1,1.2,.35); pxEll(g,x,y,w+.7,h+.7,INK);
  [[-.62,.4,'#D86A18'],[.62,.4,'#D86A18'],[-.3,.46,'#E87C22'],[.3,.46,'#EE8428'],[0,.4,'#F4943A']].forEach(([dx,rw,c])=>pxEll(g,x+dx*w,y,w*rw,h*.98,c));
  [-.46,-.15,.15,.46].forEach(dx=>{ for(let k=-.8;k<=.8;k+=.2) rect(g,x+dx*w*(1-Math.abs(k)*.25),y+k*h,.5,h*.2+.2,'#B85814'); });
  pxEll(g,x-w*.32,y-h*.42,w*.2,h*.2,'#FFC47A'); pxEll(g,x,y+h*.72,w*.62,h*.16,'#C05A16');
  if(type==='bumpy') [[-1.4,-.6],[1.6,.8],[-.2,1.4],[1,-1.2]].forEach(([dx,dy])=>{ pxEll(g,x+dx*s,y+dy*s,.7*s,.55*s,'#C86A1E'); pxEll(g,x+dx*s-.2,y+dy*s-.2,.35*s,.28*s,'#F8B060'); });
  const tx=x+.6*s, ty=y-h-1.8*s; pxLine(g,x-.2,y-h+.6,x+.2*s,y-h-.8*s,'#5A4A24',Math.max(1,.9*s)); pxLine(g,x+.2*s,y-h-.8*s,tx,ty,'#6A5A2A',Math.max(1,.8*s)); rect(g,tx-.4,ty-.3,.9*s,.7,'#8A7A3A');
  pxRing(g,x-1.8*s,y-h-.6*s,1*s,1*s,.4,'#4E8A3E'); }
/* A pumpkin vine curling along a row, with big lobed leaves and tendrils. */
function pumpkinVine(g,x0,x1,y,seed){ for(let x=x0;x<x1;x+=.5){ const yy=y+Math.sin(x/5.3+seed)*1.4+Math.sin(x/2.1+seed*2)*.4; rect(g,x,yy,.8,.8,'#3E7A34'); }
  for(let x=x0+2,i=0;x<x1;x+=6.5,i++){ const yy=y+Math.sin(x/5.3+seed)*1.4, up=i%2?-1:1, lx=x+1.4, ly=yy-2.2*up-(up<0?.6:0);
    pxLine(g,x,yy,lx,ly,'#3E7A34',.6); const c=hash2(i,Math.round(seed*9),4)<.5?'#3F8A3A':'#4C9A44';
    pxEll(g,lx,ly,3.1,2.2,INK); [[-1.3,.3],[1.3,.3],[0,-.7]].forEach(([dx,dy])=>pxEll(g,lx+dx,ly+dy,1.9,1.6,c)); pxEll(g,lx-.6,ly-.5,.9,.6,'#6FB85E'); pxLine(g,lx,ly+1.2,lx,ly-1.2,'#2E6A2E',.4);
    if(i%3===1) pxRing(g,x+3.6,yy+1.6*up,.9,.9,.4,'#5FA84E'); } }
function drawPumpkinPatch(){ blitView(ctx,cachedLayer('pumpkin',(g,ph,B)=>{ const n=ph==='night'; skyFill(g,48,ph,B); hillBand(g,46,6,n?'#5A4A34':'#D8B478',2,B);
  for(let x=al(B.x0,40)+6;x<B.x1;x+=40) roundTree(g,x,30,n,['#E08A3C','#C9502E','#E8B54A'][Math.abs(Math.round(x/40))%3],'#F2A94A',14);
  vgrad(g,B.x0,56,Bw(B),B.y1-56,[[0,n?'#5A4A34':'#A8804E'],[1,n?'#4A3C2A':'#8A6440']]); for(let x=al(B.x0,6);x<B.x1;x+=6) rect(g,x,54,4,5,n?'#6A5A40':'#C9A06A'); rect(g,B.x0,55.5,Bw(B),1,n?'#5A4630':'#A8804E');
  for(let row=0;row<3;row++){ const y=66+row*10; for(let yy=y+2.4;yy<y+5;yy+=1) rect(g,B.x0,yy,Bw(B),.6,n?'#4A3C2A':'#977046');
    if(row===0) pumpkinVine(g,B.x0,B.x1,y+1.6,row*2.3); else { pumpkinVine(g,B.x0,46,y+1.6,row*2.3); pumpkinVine(g,82,B.x1,y+1.6,row*2.3); } }
  for(let row=0;row<3;row++) for(let x=al(B.x0,22)+row*7;x<B.x1;x+=22){ const y=66+row*10; if(Math.abs(x-64)<18&&row>0) continue; pumpkinAt(g,x,y+Math.sin(x/5.3+row*2.3)*1.2,.9+row*.15,['round','tall','bumpy'][Math.abs(Math.round(x/22)+row)%3]); }
  rect(g,4,58,20,9,'#E8C86A'); rect(g,4,58,20,1,'#F4DE8A'); for(let x=5;x<24;x+=2) rect(g,x,59,.5,8,'#C9A04A'); rect(g,104,60,20,8,'#E8C86A'); for(let x=105;x<124;x+=2) rect(g,x,61,.5,7,'#C9A04A'); })); }
function drawOrchard(){ blitView(ctx,cachedLayer('orchard',(g,ph,B)=>{ const n=ph==='night'; skyFill(g,50,ph,B); vgrad(g,B.x0,50,Bw(B),B.y1-50,[[0,n?'#4E7A52':'#9CCB7E'],[1,n?'#3E6A44':'#7AB062']]);
  for(let x=al(B.x0,34)-4;x<B.x1+20;x+=34){ rect(g,x+7,34,4,22,'#7A5030'); pxEll(g,x+9,28,15,12,n?'#2F5A3A':'#4F8A4A'); pxEll(g,x+8,26,13,10,n?'#3E6E48':'#6FAA5E'); for(let i=0;i<6;i++) pxEll(g,x+2+hash2(i,Math.round(x),2)*14,20+hash2(i,Math.round(x),5)*14,1.4,1.4,'#D9403E'); }
  rect(g,98,64,14,10,'#C99A62'); for(let x=99;x<112;x+=2) rect(g,x,65,.6,9,'#A8804E'); [[101,63],[104,62],[107,63],[110,62.5]].forEach(([x,y])=>pxEll(g,x,y,1.6,1.6,'#D9403E'));
  rect(g,18,40,1.2,30,'#A8804E'); rect(g,24,40,1.2,30,'#A8804E'); for(let y=44;y<70;y+=5) rect(g,18,y,7,1,'#A8804E'); })); }
function drawFestival(){ blitView(ctx,cachedLayer('fest',(g,ph,B)=>{ const n=ph==='night'; skyFill(g,50,ph,B); vgrad(g,B.x0,50,Bw(B),B.y1-50,[[0,n?'#4E7A52':'#9CCB7E'],[1,n?'#3E6A44':'#7AB062']]);
  const aw=['#F07A8E','#7FA8D8','#F4C542','#8CC98A'];
  for(let x=al(B.x0,36)+2,i=0;x<B.x1;x+=36,i++){ if(Math.abs(x+14-64)<22) continue; rect(g,x,30,28,24,'#FFF7E6'); for(let k=0;k<7;k++) rect(g,x+k*4,26,4,5,k%2?'#FFFFFF':aw[i%4]); rect(g,x+2,44,24,2,'#C9A06A'); for(let k=0;k<5;k++) pxEll(g,x+5+k*4.5,42,1.8,1.8,aw[(k+i)%4]); }
  for(let x=B.x0;x<B.x1;x+=.5) rect(g,x,8+Math.sin(x/12)*2,.5,.5,'#8A6A4A'); for(let x=al(B.x0,8);x<B.x1;x+=8){ g.fillStyle=aw[Math.abs(Math.round(x/8))%4]; g.beginPath(); g.moveTo(x,8+Math.sin(x/12)*2); g.lineTo(x+6,8+Math.sin((x+6)/12)*2); g.lineTo(x+3,13+Math.sin((x+3)/12)*2); g.fill(); }
  const fl=['#F07A8E','#F4C542','#C9A0E0','#FFFFFF','#F29A80']; for(let row=0;row<3;row++) for(let x=al(B.x0,5)+row*2;x<B.x1;x+=5){ const y=62+row*12+hash2(Math.round(x),row,4)*3; if(Math.abs(x-64)<20&&row===1) continue; rect(g,x,y,.6,3,'#4F7A5D'); pxEll(g,x+.3,y,1.6,1.4,fl[Math.abs(Math.round(x)+row)%5]); rect(g,x,y,.5,.5,'#F4C542'); } })); }
function drawSplashPad(e){ blitView(ctx,cachedLayer('splash',(g,ph,B)=>{ skyFill(g,44,ph,B); roundTree(g,8,30,ph==='night','#5E9E5A','#86C47A',12); roundTree(g,104,32,ph==='night','#5E9E5A','#86C47A',12); vgrad(g,B.x0,56,Bw(B),B.y1-56,[[0,'#D8D4CC'],[1,'#C8C2B8']]);
  [[34,78],[64,70],[94,78],[50,90],[80,90]].forEach(([x,y])=>{ pxEll(g,x,y,5,1.6,'#7FB8E0'); pxEll(g,x,y,2.4,.8,'#3E6FA4'); }); for(let x=al(B.x0,12);x<B.x1;x+=12) rect(g,x,56,.5,B.y1-56,'#BEB8AE'); })); }
function drawSledHill(){ blitView(ctx,cachedLayer('sled',(g,ph,B)=>{ const n=ph==='night'; skyFill(g,60,ph,B); g.fillStyle=n?'#C8D4E8':'#FFFFFF'; g.beginPath(); g.moveTo(B.x0,34); g.lineTo(B.x1,74); g.lineTo(B.x1,B.y1); g.lineTo(B.x0,B.y1); g.fill(); rect(g,B.x0,74,Bw(B),B.y1-74,n?'#D8E0F0':'#F4F8FF');
  for(let x=al(B.x0,30)+10;x<B.x1;x+=30){ const y=30+(x-B.x0)/Bw(B)*40-6; g.fillStyle='#3E6A4A'; g.beginPath(); g.moveTo(x,y-14); g.lineTo(x-6,y); g.lineTo(x+6,y); g.fill(); pxEll(g,x,y-9,3,1.2,'#FFFFFF'); rect(g,x-.6,y,1.2,3,'#6A4428'); }
  for(let i=0;i<30;i++) rect(g,B.x0+hash2(i,1,6)*Bw(B),B.y0+hash2(i,2,6)*60,.6,.6,'#FFFFFF'); })); }
function drawLeafPiles(){ [[30,86,14],[98,88,12]].forEach(([x,y,r],j)=>{ for(let i=0;i<40;i++){ const a=hash2(i,j,8)*Math.PI, d=hash2(i,j,9)*r; pxEll(ctx,x+Math.cos(a)*d,y-Math.sin(a)*d*.55,1.5,1,['#E08A3C','#C9502E','#E8B54A'][i%3]); } }); }
function drawDen(){ blitView(ctx,cachedLayer('den',(g,ph,B)=>{ rect(g,B.x0,B.y0,Bw(B),60-B.y0,'#8A5A48'); for(let x=al(B.x0,10);x<B.x1;x+=10) rect(g,x,B.y0,5,60-B.y0,'#7E5040'); planks(g,'#6A4430','#5A3826',{x0:B.x0,x1:B.x1,y0:60,y1:B.y1});
  rect(g,20,24,40,36,'#B8603E'); for(let y=26;y<58;y+=4) for(let x=((y/4)%2)*4+20;x<60;x+=8) rect(g,x,y,7,3,'#C9704E'); rect(g,18,22,44,4,'#6A4428'); rect(g,28,36,24,24,'#2A1A14'); pxEll(g,40,58,9,2,'#6A4428');
  blit(g,armchairSprite('#A84A4A','#F4D27A'),88,36); floorLamp(g,122,60,'#F4E4C8',true); pxEll(g,64,80,30.8,7.8,INK); pxEll(g,64,80,30,7,'#C9573E'); pxEll(g,64,80,26,5,'#E8905A'); })); }
function drawDenFire(now){ for(let i=0;i<3;i++){ const f=Math.sin(now/120+i*2)*1.4; pxEll(ctx,34+i*6,54-Math.abs(f),3,5+f*.6,i===1?'#FFB347':'#F4743A'); pxEll(ctx,34+i*6,55,1.4,2.2,'#FFE27A'); } glow(ctx,40,52,34,'#FF9A4A',.25+Math.sin(now/180)*.05); }
let lightsLayer=null;
/* The street's houses (houseSprite at y 14): lit window panes, keeping the window bars between them. */
function litPanes(x0,c){ HOUSE.wins.forEach(([wx,wy])=>[[0,0],[4.9,0],[0,4.4],[4.9,4.4]].forEach(([dx,dy])=>rect(ctx,x0+wx+dx,14+wy+dy,4.1,3.6,c))); }
function drawLightsStreet(e){ drawStreet(e); ctx.fillStyle='rgba(20,24,70,.55)'; fillView(ctx); const off=(e*.02)%256, now=performance.now();
  for(let t=al(VIEW.x+off,256)-off;t<VIEW.x+VIEW.w;t+=256) for(let h=0;h<4;h++){ const x=t+h*64+4; for(let k=0;k<=14;k++){ const u=k/14, px=u<.5?lerp(x-1.5,x+28,u*2):lerp(x+28,x+57.5,(u-.5)*2), py=(u<.5?lerp(33.5,16.5,u*2):lerp(16.5,33.5,(u-.5)*2))+.4; const c=['#F07A8E','#F4C542','#7FA8D8','#8CC98A'][(k+h)%4]; if(Math.floor(now/400+k+h)%4) { rect(ctx,px-.5,py-.5,1.1,1.1,c); glow(ctx,px,py,2.4,c,.35); } }
    litPanes(x,'#FFE9A8'); } }
function drawRainWalk(e){ drawStreet(e); ctx.fillStyle='rgba(60,70,100,.25)'; fillView(ctx); [[20,80],[70,84],[110,81]].forEach(([x,y])=>{ const xx=x-((e*.02)%160); pxEll(ctx,((xx%160)+160)%160-16,y,10,2,'#6A8AB0'); });
  for(let i=0;i<40;i++){ const x=VIEW.x+((i*23+e*.05)%(VIEW.w+10)), y=VIEW.y+((i*37+e*.12)%(VIEW.h+10)); rect(ctx,x,y,.5,3,'#CFE2F6'); } }
function drawHalloweenStreet(e){ drawStreet(e); ctx.fillStyle='rgba(30,20,60,.5)'; fillView(ctx); const off=(e*.02)%256, now=performance.now();
  for(let t=al(VIEW.x+off,256)-off;t<VIEW.x+VIEW.w;t+=256) for(let h=0;h<4;h++){ const x=t+h*64+4; litPanes(x,'#FFB347'); [x+20.6,x+35.4].forEach((px,j)=>{ pxEll(ctx,px,59.4,3,2.2,INK); pxEll(ctx,px,59.4,2.5,1.7,'#F08A2A'); rect(ctx,px-.4,56.6,.8,1.2,'#5A7A3A'); Tr(ctx,px-1.4,59,px-.4,59,px-.9,58.2,'#FFE27A'); Tr(ctx,px+.4,59,px+1.4,59,px+.9,58.2,'#FFE27A'); rect(ctx,px-1,59.8,2,.5,'#FFE27A'); glow(ctx,px,59,5,'#FFB347',.25+.1*Math.sin(now/100+h+j)); }); }
  pxEll(ctx,VIEW.x+VIEW.w-24,14,5,5,'#FFF1B8'); }

/* ---- Scenes ---- */
const sayN=()=>state.name;
V['pumpkin:walk']=tripScene('pumpkin',{dur:3800,outdoor:true,start(){ setCaption(`Welcome to the pumpkin patch! So many pumpkins, ${sayN()}.`); },
  pose(p,e){ if(e<1500){ p.body='walk'; p.face=1; p.frame=Math.floor(e/140)%4; p.dx=Math.round(lerp(-40,0,e/1500)); } else if(e<2800){ p.headDy=1+(Math.floor(e/300)%2); p.eyes='closed'; } else { p.eyes='happy'; p.mouth='tongue'; } },
  tick(a,e){ if(e>1600) once(a,'s',()=>play('sniff',.4)); if(e>2800) once(a,'h',()=>play(happyNoise(),.45)); }});
V['pumpkin:carry']=tripScene('pumpkin',{dur:3800,outdoor:true,
  start(a){ const t=a.trip.picks.pumpkin||'round'; markSeasonal('pumpkinKind',t); markSeasonal('pumpkin',calToday().getFullYear()); setCaption(`${sayN()} picked ${({round:'a little round',tall:'a tall',bumpy:'a bumpy'})[t]} pumpkin! It will sit in the window at home.`); play('sparkle',.5); },
  pose(p,e){ p.dx=-6; p.eyes='happy'; p.mouth='tongue'; if(e>600&&e<1800) p.dy=-Math.round(Math.abs(Math.sin(e/150))*3); },
  front(e,a){ const k=Math.min(1,e/500); pumpkinAt(ctx,82,86-(1-k)*8,1.4,a.trip.picks.pumpkin||'round'); },
  tick(a,e){ if(e>700) once(a,'b',()=>{ burst(6); play(happyNoise(),.45); }); if(e>1600) once(a,'p',()=>addPhoto('place',`${sayN()} at the pumpkin patch.`,{place:'pumpkinpatch'})); }});
PREVIEW_ART.pumpkin_round=(x,y)=>pumpkinAt(ctx,x,y+1,1.6,'round'); PREVIEW_ART.pumpkin_tall=(x,y)=>pumpkinAt(ctx,x,y+1,1.6,'tall'); PREVIEW_ART.pumpkin_bumpy=(x,y)=>pumpkinAt(ctx,x,y+1,1.6,'bumpy');
V['orchard:apples']=tripScene('orchard',{dur:4400,outdoor:true,start(){ setCaption(`Apple picking! Apples drop from the trees.`); },
  pose(p,e){ p.eyes='happy'; p.headDy=-1; p.mouth=e>3300?'tongue':'smile';
    if(e<800){ p.body='stand'; p.face=-1; p.frame=0; p.dy=0; }
    else if(e<1900) walkBetween(p,e,800,1550,0,-18);
    else if(e<3000) walkBetween(p,e,1900,2650,-18,0);
    else walkBetween(p,e,3000,3850,0,16);
    if((e>1550&&e<1900)||(e>2650&&e<3000)||e>3850){ p.headDy=3; p.eyes='closed'; } },
  front(e){ for(let i=0;i<3;i++){ const t0=500+i*1100, k=ph(e,t0,t0+700); if(e>t0){ const x=46+i*18, y=k<1?lerp(24,86,k*k):86-Math.abs(Math.sin((e-t0-700)/140))*Math.max(0,3-(e-t0-700)/300); pxEll(ctx,x,y,1.8,1.8,INK); pxEll(ctx,x,y,1.4,1.4,'#D9403E'); rect(ctx,x-.2,y-2.6,.5,1,'#6A4428'); } } },
  tick(a,e){ [1200,2300,3400].forEach((t,i)=>{ if(e>t) once(a,'b'+i,()=>play('bounce',.45)); }); if(e>3500) once(a,'h',()=>play(happyNoise(),.45)); }});
V['orchard:basket']=tripScene('orchard',{dur:3600,outdoor:true,start(){ setCaption(`${sayN()} helps fill the basket with shiny red apples.`); },
  pose(p,e){ walkBetween(p,e,0,900,16,26); p.eyes='happy'; p.mouth='tongue'; if(e>900){ p.headDy=2; p.wag=180; } },
  tick(a,e){ if(e>1400) once(a,'s',()=>{ burst(6); play('sparkle',.5); addPhoto('place',`${sayN()} at the apple orchard.`,{place:'orchard'}); }); }});
V['fest:flowers']=tripScene('fest',{dur:4200,outdoor:true,start(){ setCaption(`The flower festival! Flowers everywhere, ${sayN()}.`); },
  pose(p,e){ if(e<1500){ p.body='walk'; p.face=1; p.frame=Math.floor(e/140)%4; p.dx=Math.round(lerp(-30,0,e/1500)); } else if(e<3000){ p.headDy=1; p.eyes='closed'; } else { p.eyes='happy'; p.mouth='tongue'; } },
  front(e){ const t=e/300; blit(ctx,Math.floor(e/110)%2?SPR.fly1:SPR.fly2,78+Math.cos(t)*12,50+Math.sin(t*1.4)*6); },
  tick(a,e){ if(e>1600) once(a,'s',()=>play('sniff',.4)); if(e>3000) once(a,'h',()=>play(happyNoise(),.45)); }});
V['fest:crown']=tripScene('fest',{dur:3600,outdoor:true,start(){ wearGift('flowers','hat'); setCaption(`A flower crown for ${sayN()}! So pretty.`); play('twinkle',.6); },
  pose(p,e){ p.eyes='happy'; p.mouth='tongue'; if(e>700&&e<1800) p.dy=-Math.round(Math.abs(Math.sin(e/150))*3); },
  tick(a,e){ if(e>500) once(a,'b',()=>burst(8)); if(e>1600) once(a,'p',()=>addPhoto('place',`${sayN()} at the flower festival.`,{place:'flowerfest'})); }});
V['splash:jets']=tripScene('splash',{dur:4800,outdoor:true,start(){ setCaption(`The splash pad! ${sayN()} jumps through the water.`); },
  pose(p,e){ playBounds(p,e,1200,18,800,8,4600); },
  front(e){ [[34,78],[64,70],[94,78]].forEach(([x,y],i)=>{ const h=Math.max(0,Math.sin(e/350+i*2))*22; for(let k=0;k<h;k+=1.5) rect(ctx,x-.6+Math.sin(k+e/60)*.6,y-k,1.2,1.2,'rgba(160,210,240,.85)'); if(h>2) pxEll(ctx,x,y-h,2.4,1.4,'#DDF4FF'); }); },
  tick(a,e,now){ if(now>=a.next){ play('splat',.3); for(let i=0;i<4;i++) spawn('drop',64+rand(-20,20),70,rand(-30,30),rand(-40,-20),.6); a.next=now+700; } }});
V['splash:shake']=tripScene('splash',{dur:3000,outdoor:true,start(){ setCaption(`Shake, shake! ${sayN()} is dripping wet and happy.`); },
  pose(p,e){ if(e<1500){ p.dx=Math.round(Math.sin(e/35)*3); p.eyes='closed'; p.mouth='open'; } else { p.eyes='happy'; p.mouth='tongue'; } },
  tick(a,e,now){ if(e<1500&&now>=a.next){ for(let i=0;i<3;i++) spawn('drop',64+rand(-14,14),64,rand(-40,40),rand(-40,-10),.6); a.next=now+90; } if(e>1500) once(a,'p',()=>addPhoto('place',`${sayN()} at the splash pad.`,{place:'splashpad'})); }});
function drawUmbrella(){ rect(ctx,92,40,1.2,48,'#8A6A4A'); for(let i=0;i<8;i++){ ctx.fillStyle=i%2?'#FFFFFF':'#E0604A'; ctx.beginPath(); ctx.moveTo(92.6,38); ctx.lineTo(76+i*4,46); ctx.lineTo(80+i*4,46); ctx.fill(); } rect(ctx,70,84,36,6,'#7FA8D8'); for(let x=70;x<106;x+=6) rect(ctx,x,84,3,6,'#F4D27A'); }
V['beach:dig']=tripScene('beach',{dur:4400,outdoor:true,start(){ setCaption(`Beach day! ${sayN()} digs in the warm sand.`); },
  behind(){ drawUmbrella(); },
  pose(p,e){ p.dy=0; if(e<2600){ p.body='dig'; p.face=1; p.bow=.75; p.frame=Math.floor(e/140)%4; p.eyes='happy'; p.mouth='open'; } else { p.eyes='happy'; p.mouth='tongue'; } },
  front(e){ if(e>2600){ const k=ph(e,2600,3000); pxEll(ctx,72,lerp(90,80,k),2.6,2,INK); pxEll(ctx,72,lerp(90,80,k),2,1.5,'#F7C4CF'); } },
  tick(a,e,now){ if(e<2600&&now>=a.next){ for(let i=0;i<2;i++) spawn('crumb',64+rand(-6,6),86,rand(-30,30),rand(-40,-20),.6,'#E8C88A'); play('rustle',.25); a.next=now+260; } if(e>2600) once(a,'f',()=>{ setCaption(`${sayN()} found a pretty pink shell!`); play('sparkle',.5); burst(5); }); }});
V['beach:rest']=tripScene('beach',{dur:4000,outdoor:true,start(){ setCaption(`A nap in the shade of the beach umbrella.`); },
  behind(){ drawUmbrella(); }, pose(p,e){ p.dx=26; p.body='lie'; p.face=-1; p.frame=0; p.eyes=e>800?'closed':'happy'; },
  tick(a,e,now){ if(e>1000&&now>=a.next){ spawn('z',86,62,5,-7,2.2); a.next=now+1200; } if(e>1500) once(a,'p',()=>addPhoto('place',`${sayN()}'s beach day.`,{place:'beachday'})); }});
V['sled:ride']=tripScene('sled',{dur:4200,outdoor:true,noShadow:true,start(){ setCaption(`Whee! ${sayN()} rides the sled down the snowy hill!`); play('whoosh',.5); },
  pose(p,e){ const k=ph(e,300,3200); p.dx=Math.round(lerp(-50,40,k)); p.dy=Math.round(lerp(-26,6,k)); p.eyes='happy'; p.mouth='open'; p.ear=Math.floor(e/80)%2; },
  front(e,a,p){ const x=64+p.dx, y=PETY+p.dy+42; rect(ctx,x-12,y-1,24,3,INK); rect(ctx,x-11,y-.4,22,1.8,'#D9403E'); pxLine(ctx,x-12,y+2.4,x+12,y+2.4,'#6A4428',.6); pxLine(ctx,x+12,y+2.4,x+14,y,'#6A4428',.6); },
  tick(a,e,now){ if(e<3200&&now>=a.next){ spawn('puff',64+rand(-6,6),80,rand(-20,-6),rand(-10,-4),.8,'#FFFFFF'); a.next=now+80; } if(e>3300) once(a,'h',()=>{ play(happyNoise(),.5); burst(6); }); }});
V['snow:angel']=tripScene('snowyard',{dur:4000,outdoor:true,start(){ setCaption(`${sayN()} makes a snow angel!`); },
  pose(p,e){ p.dy=0; if(e<2800){ p.body='curl'; p.face=1; p.roll=Math.PI+Math.sin(e/260)*.7; p.frame=0; p.eyes='happy'; p.mouth='open'; } else { p.eyes='happy'; p.mouth='tongue'; } },
  behind(e){ if(e>2800){ pxEll(ctx,64,88,18,4,'rgba(200,215,235,.8)'); pxEll(ctx,50,84,6,3,'rgba(200,215,235,.8)'); pxEll(ctx,78,84,6,3,'rgba(200,215,235,.8)'); } },
  tick(a,e,now){ if(e<2800&&now>=a.next){ spawn('puff',64+rand(-12,12),84,rand(-10,10),rand(-10,-4),.8,'#FFFFFF'); a.next=now+200; } if(e>2800) once(a,'p',()=>{ burst(6); addPhoto('place',`${sayN()} made a snow angel.`,{place:'snowday'}); }); }});
V['snow:play']=tripScene('snowyard',{dur:4400,outdoor:true,start(){ setCaption(`Snow day! ${sayN()} pounces in the fluffy snow.`); },
  pose(p,e){ playBounds(p,e,1100,16,700,9,4200); },
  tick(a,e,now){ const t=e%1100; if(t>450&&now>=a.next){ play('rustle',.3); for(let i=0;i<5;i++) spawn('puff',64+Math.sin(e/700)*16+rand(-6,6),86,rand(-20,20),rand(-16,-6),.8,'#FFFFFF'); a.next=now+1000; } }});
V['lights:walk']=tripScene('lights',{dur:6400,outdoor:true,scroll:1,start(){ setCaption(`A walk past the holiday lights. So twinkly, ${sayN()}!`); play('twinkle',.5); },
  pose(p,e){ p.body='walk'; p.face=1; p.frame=Math.floor(e/150)%4; p.eyes='happy'; p.mouth='smile'; },
  front(e,a,p){ const nk=neckAt(p); drawLeash(nk.x,nk.y,VIEW.x+VIEW.w+3,nk.y-28,'#D9403E','#8E2A48',13); },
  tick(a,e,now){ if(now>=a.next){ play('step',.18); a.next=now+300; } if(e>3200) once(a,'w',()=>{ setCaption(`${sayN()} loves the lights. Happy holidays!`); play(happyNoise(),.45); addPhoto('place',`${sayN()} on a holiday lights walk.`,{place:'lightswalk'}); }); }});
V['rainwalk:puddles']=tripScene('rainwalk',{dur:5600,outdoor:true,scroll:1,start(){ setCaption(`Rain boots on! ${sayN()} splashes through the puddles.`); },
  pose(p,e){ const t=e%1200; p.body='walk'; p.face=1; p.frame=Math.floor(e/150)%4; p.eyes='happy'; p.mouth='open'; p.dy=0; if(t<650) leapPose(p,t,180,500,6); },
  front(e,a,p){ const nk=neckAt(p); drawLeash(nk.x,nk.y,VIEW.x+VIEW.w+3,nk.y-28,'#F4C542','#B8902A',13); },
  tick(a,e,now){ const t=e%1200; if(t>380&&now>=a.next){ play('splat',.4); for(let i=0;i<5;i++) spawn('drop',64+rand(-8,8),88,rand(-30,30),rand(-40,-20),.6); a.next=now+1100; } }});
V['leaves:jump']=tripScene('leafyard',{dur:4600,outdoor:true,start(){ setCaption(`Crunchy leaves! ${sayN()} jumps into the leaf pile.`); },
  pose(p,e){ p.face=-1; if(e<800){ walkBetween(p,e,0,800,0,-26); } else if(e<1800){ p.dx=lerp(-26,-34,ph(e,800,1500)); leapPose(p,e,800,1500,14); p.eyes='happy'; p.mouth='open'; } else { p.dx=-34; p.body='stand'; p.headDy=2; p.eyes='happy'; p.mouth='tongue'; p.dy=0; } },
  tick(a,e){ if(e>1450) once(a,'b',()=>{ play('rustle',.6); for(let i=0;i<18;i++) spawn('leaf',30+rand(-10,10),82,rand(-30,30),rand(-50,-20),2.4,['#E08A3C','#C9502E','#E8B54A'][i%3]); }); if(e>2600) once(a,'p',()=>{ play(happyNoise(),.45); addPhoto('place',`${sayN()} jumped in the leaves.`,{place:'leafpile'}); }); }});
V['sprinkler:jump']=tripScene('yard',{dur:5000,outdoor:true,start(){ setCaption(`The sprinkler is on! ${sayN()} leaps through the spray.`); },
  pose(p,e){ playBounds(p,e,1300,20,900,9,4800); },
  front(e){ const a=Math.sin(e/500)*.8; for(let i=0;i<14;i++){ const k=i/14; rect(ctx,94-Math.sin(a)*k*50-k*10,86-Math.sin(k*Math.PI)*26,1.2,1.2,'rgba(160,210,240,.9)'); } rect(ctx,92,86,5,2,'#5FA873'); },
  tick(a,e,now){ const t=e%1300; if(t>420&&now>=a.next){ play('splat',.35); a.next=now+1200; } if(e>4200) once(a,'p',()=>addPhoto('place',`${sayN()} and the summer sprinkler.`,{place:'sprinkler'})); }});
V['egg:hunt']=tripScene('eggyard',{dur:6400,outdoor:true,start(){ setCaption(`An Easter egg hunt! Can ${sayN()} find the eggs?`); },
  eggs:[[24,84,'#F7C4CF'],[100,82,'#B8E0A0'],[62,92,'#C9B0E8']],
  pose(p,e){ const seg=Math.min(2,Math.floor(e/1900)), tx=this.eggs[seg][0]-64, local=e-seg*1900, from=seg?this.eggs[seg-1][0]-64:0;
    if(local<900){ p.body='walk'; p.face=tx>from?1:-1; p.frame=Math.floor(e/140)%4; p.dx=Math.round(lerp(from,tx,local/900)); } else { p.dx=tx; p.eyes='happy'; p.mouth='open'; p.headDy=local<1300?2:0; } },
  front(e){ this.eggs.forEach(([x,y,c],i)=>{ if(e<i*1900+1300){ pxEll(ctx,x,y,2.4,3,INK); pxEll(ctx,x,y,1.9,2.5,c); rect(ctx,x-1.8,y,3.6,.6,'#FFFFFF'); } }); rect(ctx,110,80,10,7,'#C99A62'); const got=this.eggs.filter((q,i)=>e>=i*1900+1300); got.forEach((q,i)=>pxEll(ctx,112+i*3,79,1.4,1.8,q[2])); },
  tick(a,e){ [0,1,2].forEach(i=>{ if(e>i*1900+1300) once(a,'e'+i,()=>{ play('sparkle',.5); spawn('sparkle',this.eggs[i][0],this.eggs[i][1]-6,0,-8,.8); setCaption(['One egg!','Two eggs!','Three eggs! All found!'][i]); }); }); if(e>5800) once(a,'p',()=>addPhoto('place',`${sayN()}'s Easter egg hunt.`,{place:'egghunt'})); }});
V['cocoa:fire']=tripScene('den',{dur:5200,start(){ setCaption(`Hot cocoa by the fire for you, and warm milk for ${sayN()}. So cozy.`); },
  pose(p,e){ p.dx=10; p.eyes=e>2000?'closed':'happy'; p.mouth='smile'; },
  front(e){ drawDenFire(performance.now()); rect(ctx,92,80,6,6,INK); rect(ctx,92.6,80.6,4.8,4.8,'#E8E0D0'); rect(ctx,93.4,81,3.2,1.4,'#8A5A34'); for(let i=0;i<3;i++){ const t=((e/900)+i/3)%1; rect(ctx,94.5+Math.sin(t*6+i)*1.2,78-t*8,.6,.6,`rgba(255,255,255,${(1-t).toFixed(2)})`); } },
  tick(a,e){ if(e>1400) once(a,'p',()=>play(kind()==='cat'?'pet:purr':'pet:sigh',.45)); if(e>2500) once(a,'ph',()=>addPhoto('place',`A cozy night by the fire with ${sayN()}.`,{place:'cocoa'})); }});
V['fireworks:cozy']={dur:6000,start(){ setCaption(`Fireworks! ${sayN()} feels safe and snug under a cozy blanket.`); },
  pose(p,e){ p.eyes=Math.floor(e/1600)%2?'open':'happy'; p.mouth='smile'; },
  front(e,a,p){ drawBlanket(Math.round(PETY+G().collar+(big()?1:0))); },
  overlay(e){ ctx.fillStyle='rgba(20,24,70,.35)'; fillView(ctx); const w=WIN(); ctx.save(); ctx.beginPath(); ctx.rect(w.x,w.y,w.w,w.h); ctx.clip(); ctx.fillStyle='#1A2050'; ctx.fillRect(w.x,w.y,w.w,w.h); fireworksIn(w.x,w.y,w.w,w.h,performance.now(),1); ctx.restore(); },
  tick(a,e,now){ if(now>=a.next){ play('pop',.2); a.next=now+1400; } if(e>3000) once(a,'s',()=>setCaption(`Boom, crackle, sparkle! ${sayN()} peeks out to watch.`)); }};
function drawPumpkinBucket(g,x,y,k=1){ g.save(); g.translate(x,y); g.scale(k,k);
  // Raised handle, hollow opening, three pumpkin lobes, and a carved jack-o'-lantern face.
  g.strokeStyle='#493E45'; g.lineWidth=1.1; g.beginPath(); g.moveTo(-4,-7); g.bezierCurveTo(-5,-17,5,-17,4,-7); g.stroke();
  pxEll(g,0,-5,6,5.2,INK); pxEll(g,-2.6,-5,2.8,4.5,'#DD672A'); pxEll(g,2.6,-5,2.8,4.5,'#D85E24'); pxEll(g,0,-5,3.1,4.6,'#F68B32');
  g.strokeStyle='#C75320'; g.lineWidth=.5; [-1,1].forEach(s=>{ g.beginPath(); g.moveTo(s*2.4,-8); g.quadraticCurveTo(s*4,-4,s*2.3,-.8); g.stroke(); });
  pxEll(g,0,-8.7,4.9,1.6,'#9C471E'); pxEll(g,0,-9,4.1,1,'#41353A'); pxLine(g,-3,-8,3,-8,'#FFB64E',.5);
  g.fillStyle='#49312B'; [[-3.4,-5.4,-1.1,-5.4,-2.2,-7],[1.1,-5.4,3.4,-5.4,2.2,-7],[-.7,-4,.7,-4,0,-5.1]].forEach(t=>{g.beginPath();g.moveTo(t[0],t[1]);g.lineTo(t[2],t[3]);g.lineTo(t[4],t[5]);g.closePath();g.fill();});
  g.beginPath(); g.moveTo(-3.2,-3.8); g.lineTo(-1.4,-3); g.lineTo(-.7,-3.6); g.lineTo(.5,-2.9); g.lineTo(1.5,-3.5); g.lineTo(3.2,-3.8); g.quadraticCurveTo(0,.3,-3.2,-3.8); g.fill();
  pxEll(g,-4,-6.7,.55,1.1,'#FFC16B'); g.restore(); }
V['tot:walk']=tripScene('tot',{dur:4200,outdoor:true,scroll:1,start(){ setCaption(`Trick or treat! ${sayN()} heads out in costume.`); play('twinkle',.4); },
  pose(p,e){ p.body='walk'; p.face=1; p.frame=Math.floor(e/150)%4; p.eyes='happy'; p.mouth='smile'; },
  front(e,a,p){ const m=mouthAt(p); drawPumpkinBucket(ctx,m.x,m.y+13,.9); },
  tick(a,e,now){ if(now>=a.next){ play('step',.18); a.next=now+300; } }});
function totDoor(n){ return tripScene('tot',{dur:3800,start(){ setCaption(n?`Knock knock! Another treat for ${sayN()}!`:`Knock knock! "Trick or treat!"`); play('knock',.5); },
  pose(p,e){ p.eyes='happy'; p.mouth=e>1800?'tongue':'smile'; if(e>1800&&e<2800) p.dy=-Math.round(Math.abs(Math.sin(e/150))*3); },
  front(e,a,p){ rect(ctx,88,44,20,42,INK); rect(ctx,89,45,18,41,e>700?'#FFD89A':'#8A5A34'); if(e>900&&e<1900){ const hy=lerp(40,56,ph(e,900,1300)); blit(ctx,SPR.hand,86,hy); blit(ctx,SPR.cookie,86,hy+14); } drawPumpkinBucket(ctx,78,87); },
  tick(a,e){ if(e>1500) once(a,'t',()=>{ play('sparkle',.5); spawn('sparkle',78,80,0,-8,.8); setCaption(`A yummy pet treat goes in the bucket. "Great costume, ${sayN()}!"`); }); if(n&&e>2800) once(a,'p',()=>addPhoto('place',`${sayN()} went trick or treating.`,{place:'trickortreat'})); }}); }
V['tot:door']=totDoor(0); V['tot:door2']=totDoor(1);
function treeX(){ const t=treeSpot(); return t?t:{x:30,y:61.5}; }
V['tree:hang']={dur:5200,start(){ setCaption(`${sayN()} helps hang an ornament on the tree.`); },
  pose(p,e){ const tx=treeX().x+16-64; if(e<1200){ p.body='walk'; p.face=tx<0?-1:1; p.frame=Math.floor(e/140)%4; p.dx=Math.round(lerp(0,tx,e/1200)); } else if(e<3200){ p.dx=tx; p.headDy=-2; p.eyes='happy'; } else { p.dx=Math.round(lerp(tx,0,ph(e,3200,4200))); if(e<4200){ p.body='walk'; p.face=tx<0?1:-1; p.frame=Math.floor(e/140)%4; } p.eyes='happy'; p.mouth='tongue'; } },
  front(e,a,p){ if(e<2200){ const m=mouthAt(p); pxEll(ctx,m.x,m.y+2,1.8,1.8,INK); pxEll(ctx,m.x,m.y+2,1.4,1.4,'#D9403E'); } },
  tick(a,e){ if(e>2200) once(a,'h',()=>{ markSeasonal('tree:'+calToday().getFullYear(),treeDeco()+2); bgKey=null; play('twinkle',.6); burst(6); setCaption(treeDeco()>=6?`The star goes on top! The tree is beautiful.`:`Two new ornaments on the tree!`); }); if(e>3000) once(a,'p',()=>play(happyNoise(),.45)); }};
V['tree:climb']={dur:5000,start(){ setCaption(`Uh oh! ${sayN()} is climbing the holiday tree!`); },
  pose(p,e){ const t=treeX(), tx=t.x-64; p.dy=0; p.eyes='happy';
    if(e<900) walkBetween(p,e,0,900,0,tx);
    else if(e<3200){ p.dx=tx; p.body=e<1700?'walk':'stand'; p.face=tx<0?-1:1; p.frame=Math.floor(e/150)%4; p.climb=ease(ph(e,900,1300)); p.dy=-lerp(0,18,ease(ph(e,900,1700))); p.mouth='open'; }
    else if(e<3650){ p.dx=tx; p.face=tx<0?-1:1; p.body='jump'; p.tuck=.65; p.climb=1-ease(ph(e,3200,3650)); p.dy=lerp(-18,0,ease(ph(e,3200,3650))); }
    else walkBetween(p,e,3650,4650,tx,0); },
  front(e){ if(e>2400&&e<3400){ const t=treeX(), k=ph(e,2400,2900); pxEll(ctx,t.x+6,lerp(t.y-24,t.y-2,k*k),1.8,1.8,INK); pxEll(ctx,t.x+6,lerp(t.y-24,t.y-2,k*k),1.4,1.4,'#F4C542'); } },
  tick(a,e){ if(e>1600) once(a,'r',()=>play('rustle',.5)); if(e>2800) once(a,'o',()=>{ play('bounce',.5); setCaption(`Oops! An ornament fell. ${sayN()} hops down. Silly kitty!`); }); if(e>4200) once(a,'h',()=>{ markSeasonal('tree:'+calToday().getFullYear(),treeDeco()+1); bgKey=null; play('twinkle',.5); }); }};
V['present:sweater']={dur:3600,start(){ wearGift('holiday','body'); setCaption(`And a cozy holiday sweater for ${sayN()}! Happy holidays!`); play('twinkle',.6); },
  pose(p,e){ p.eyes='happy'; p.mouth='tongue'; if(e>500&&e<1600) p.dy=-Math.round(Math.abs(Math.sin(e/150))*3); },
  tick(a,e){ if(e>400) once(a,'b',()=>burst(10)); if(e>1600) once(a,'p',()=>addPhoto('place',`Holiday presents with ${sayN()}.`,{place:'presents'})); }};
V['val:card']={dur:4400,start(a){ const f=a.trip.friend; a.fname=f.name; setCaption(`${sayN()} made a valentine for ${f.name}!`); if(f.isNew){ state.friends=(state.friends||[]).concat([{name:f.name,style:f.style}]).slice(-6); save(); } },
  pose(p,e){ p.eyes='happy'; p.mouth='smile'; },
  front(e,a,p){ const m=mouthAt(p); let x=m.x-3, y=m.y; if(e>2200){ const k=ph(e,2200,3200); x=lerp(m.x-3,STATION.door[0]+6,k); y=lerp(m.y,40,k)+arc(k,14); } if(e<3200){ rect(ctx,x-1,y-1,10,8,INK); rect(ctx,x,y,8,6,'#FFF7E6'); heartFill(ctx,x+4,y+1.6,1.8,'#F07A8E'); } },
  tick(a,e,now){ if(e<2200&&now>=a.next){ spawn('heart',64+rand(-10,10),52,rand(-4,4),-12,1.2); a.next=now+450; } if(e>2300) once(a,'w',()=>{ play('whoosh',.4); setCaption(`Off it goes to ${a.fname}!`); }); }};
V['val:reply']={dur:3800,start(a){ setCaption(`Knock knock! A valentine came back for ${sayN()}!`); play('knock',.5); },
  pose(p,e){ p.eyes='happy'; p.mouth='tongue'; if(e>1500&&e<2600) p.dy=-Math.round(Math.abs(Math.sin(e/150))*3); },
  front(e,a,p){ if(e<1500){ const k=ph(e,300,1400), m=mouthAt(p), x=lerp(STATION.door[0]+6,m.x+6,k), y=lerp(50,m.y,k); rect(ctx,x-1,y-1,10,8,INK); rect(ctx,x,y,8,6,'#FDE2EC'); heartFill(ctx,x+4,y+1.6,1.8,'#D9403E'); } },
  tick(a,e){ if(e>1500) once(a,'b',()=>{ burst(8); play('happy',.5); for(let i=0;i<6;i++) spawn('heart',64+rand(-16,16),54,rand(-5,5),-14,1.4); addPhoto('place',`Valentine's Day with ${sayN()}.`,{place:'valentines'}); }); }};
V['bday:party']={dur:8200,init(a){ const fr=(state.friends||[]).filter(f=>STYLES[f.style]&&STYLES[f.style].kind===kind()), nb=maybeNeighbor(null,.6); a.guests=nb?[nb].concat(pickSome(fr.length?fr:[newFriend()],1)):pickSome(fr.length?fr:[newFriend()],2); },
  start(){ setCaption(`Happy birthday, ${sayN()}! ${sayN()} is ${petYears()} year${petYears()===1?'':'s'} old today!`); play('fanfare',.6); },
  fit:{hat:'party'},
  behind(e,a){ a.guests.forEach((f,i)=>drawPet(ctx,f.style,f.sg||stageName(),{eyes:'happy',mouth:'tongue',tail:Math.floor(e/140)%3,headDy:0,dy:-(Math.floor(e/200+i)%2)},Object.assign({},f.fit||{},{hat:'party'}),i?PETX+34:PETX-34,PETY+2)); },
  pose(p,e){ p.eyes='happy'; p.mouth=e>5200?'tongue':'smile'; if(e>4200&&e<4800){ p.mouth='open'; p.headDy=1; } },
  front(e){ drawCake(57,Math.round(e<500?lerp(96,76,e/500):76),e<5600?0:e<6400?1:e<7000?2:3,e<4600,e); },
  tick(a,e,now){ if(e>700) once(a,'s',()=>{ setCaption(`Everyone sings: Happy birthday to you!`); [523,523,587,523,698,659].forEach((f,i)=>later(()=>play('beep'+(1+i%4),.35),i*380)); });
    if(e>4500) once(a,'b',()=>{ play('whoosh',.5); setCaption(`Make a wish, ${sayN()}... and blow out the candles!`); });
    if(e>4700) once(a,'c',()=>{ play('cheer',.5); for(let i=0;i<16;i++) spawn('confetti',rand(VIEW.x,VIEW.x+VIEW.w),rand(-4,10),rand(-8,8),rand(14,26),2.6,pick(['#F07A8E','#F4C542','#7FB08C','#7FA8D8','#B89AD8'])); });
    if(e>5600&&e<7000&&now>=a.next){ crumbs(64,80,'#F2A7B5'); play('crunch',.4); a.next=now+450; }
    if(e>7200) once(a,'p',()=>{ addStars(1); addPhoto('place',`${sayN()}'s birthday party! ${petYears()} year${petYears()===1?'':'s'} old.`,{place:'birthday'}); }); }};
