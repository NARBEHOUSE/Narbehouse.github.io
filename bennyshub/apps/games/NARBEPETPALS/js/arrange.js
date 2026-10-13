'use strict';
/* ================= Arranging the room on a grid =================
   The floor is a grid of spots on both sides of the pet (and in front of it on tall screens), worked
   out for the screen's shape and clear of the pet, the caption and the buttons. The things on the floor
   each sit in their own spot: the food and water bowls, the toy basket, the bath caddy or brushes, the
   potty pad or litter box, the pet bed, the floor plant, and every companion. In Decorate Home, Move
   things around, the player picks one and then scans the spots (each glows, with a live preview) to
   move it; a spot that is taken swaps the two. The rug stays under the pet and the door on the wall.
   The room remembers each thing's spot by name (left side, spot 1, back row), so it stays put. */

/* The things that can move. Sizes are their footprint on the floor. */
function gridUnits(){ const k=kind(), r=room(), list=[
  {key:'bed',label:'Pet bed'},
  {key:'potty',label:k==='cat'?'Litter box':'Potty pad'},
  {key:'bowls',label:'Food and water bowls'},
  {key:'basket',label:'Toy basket'},
  {key:'bath',label:k==='cat'?'Brushes':'Bath caddy'}];
  if(r.spots.floorR&&DECOR[r.spots.floorR]) list.push({key:'plant',label:DECOR[r.spots.floorR].label});
  comps().forEach(c=>list.push({key:'c:'+c.type,label:`${c.name} the ${compStageWord(c)}`}));
  return list; }

let GRID={cells:[],pos:{},sizeKey:null}, GRID_DEF=null;
/* Where the room's own layout would put each thing (the starting point for anyone who never moved it).
   Tall things (the plant) start in the back row and companions in the front row next to the pet, so\n   nothing tall hides a companion. */
function snapLayout(){ GRID_DEF={bowls:{x:STATION.feed[0]+15.5,y:STATION.feed[1]+8},basket:{x:STATION.basket[0]+8.5,y:STATION.basket[1]+16},bath:{x:STATION.bath[0]+8.5,y:STATION.bath[1]+15},
  potty:{x:16+FIX.dx,y:94},bed:{x:SPOT.floorL.box[0]+SPOT.floorL.box[2]/2,y:75},plant:{x:SPOT.floorR.box[0]+SPOT.floorR.box[2]/2,y:ROW0}}; }
/* The part of the room that shows when the camera is home, in scene coordinates. */
function homeView(){ const s=STAGE.s, fr=freeRect(true), fits=96*s<=fr.h+2, cx=64-(fr.x+fr.w/2-STAGE.left)/s, cy=(fits?48:60)-(fr.y+fr.h/2)/s;
  return {x0:cx+(fr.x-STAGE.left)/s, x1:cx+(fr.x+fr.w-STAGE.left)/s, y0:cy+fr.y/s, y1:Math.min(cy+(fr.y+fr.h)/s,VIEW.y+VIEW.h)}; }
/* PET_BOX keeps the floor spots off the pet and its rug (the rug spans x 31 to 97). */
const CELL_H=16.5, ROW0=77.5, ROW_STEP=18.5, PET_BOX=[31,40,66,53];
function makeCells(W){ const v=homeView(), out=[], X0=v.x0+2, X1=v.x1-2, Y1=v.y1-1, door=[STATION.door[0]-1,STATION.door[1]-1,18,40];
  const hit=(r,o)=>r[0]<o[0]+o[2]&&r[0]+r[2]>o[0]&&r[1]<o[1]+o[3]&&r[1]+r[3]>o[1];
  for(let row=0, feet=ROW0; feet<=Y1; row++, feet+=ROW_STEP){
    const add=(key,x0)=>{ const rc=[x0,feet-CELL_H,W,CELL_H]; if(hit(rc,PET_BOX)||hit(rc,door)) return; out.push({key,row,cx:x0+W/2,feet,rect:rc}); };
    for(let i=0;PET_BOX[0]-(i+1)*W>=X0;i++) add(`L${i}r${row}`,PET_BOX[0]-(i+1)*W);
    for(let i=0;PET_BOX[0]+PET_BOX[2]+(i+1)*W<=X1;i++) add(`R${i}r${row}`,PET_BOX[0]+PET_BOX[2]+i*W);
    if(feet-CELL_H>=PET_BOX[1]+PET_BOX[3]) [0,1].forEach(i=>add(`C${i}r${row}`,64-W+i*W)); }
  return out; }
function gridCells(n){ const key=[STAGE.s,VIEW.w,VIEW.h,n].join('|');
  if(GRID.sizeKey===key||(layer&&layer!=='game'&&GRID.cells.length)) return GRID.cells;
  let cells=[]; for(const W of [31,28,25]){ cells=makeCells(W); if(cells.length>=n) break; }
  if(!layer||layer==='game') GRID.sizeKey=key; return cells; }
/* The nearest spot to a remembered one, when this screen has no spot by that name (a narrower screen). */
function nearestCell(cells,key,taken){ const m=/^([LRC])(\d+)r(\d+)$/.exec(key||''); if(!m) return null; const side=m[1], i=+m[2], row=+m[3];
  let best=null, bd=1e9; cells.forEach(c=>{ if(taken[c.key]) return; const n=/^([LRC])(\d+)r(\d+)$/.exec(c.key); const d=(n[1]===side?0:20)+Math.abs(+n[2]-i)*2+Math.abs(+n[3]-row)*3; if(d<bd){ bd=d; best=c; } }); return best; }

/* Put every thing in its spot (for the room r, or a preview of a change). */
function applyGrid(r){ if(!state||!GRID_DEF) return; r=r||room(); const units=gridUnits(), cells=gridCells(units.length), saved=(r.grid&&typeof r.grid==='object')?r.grid:{}, taken={}, pos={};
  const put=(u,c)=>{ if(!c) return; taken[c.key]=u.key; pos[u.key]=c; };
  units.forEach(u=>{ const k=saved[u.key]; if(!k) return; put(u,cells.find(c=>c.key===k&&!taken[c.key])||nearestCell(cells,k,taken)); });
  units.filter(u=>!pos[u.key]).forEach(u=>{ const d=GRID_DEF[u.key]||{x:64,y:96}; let best=null, bd=1e9;
    cells.forEach(c=>{ if(taken[c.key]) return; const dd=Math.abs(c.cx-d.x)+Math.abs(c.feet-d.y)*1.5; if(dd<bd){ bd=dd; best=c; } }); put(u,best); });
  GRID.cells=cells; GRID.pos=pos; GRID.units=units;
  const P=k=>pos[k];
  if(P('bowls')){ const c=P('bowls'), span=Math.min(31,c.rect[2]-1.5); STATION.feed[0]=c.cx-span/2; STATION.feed[1]=c.feet-8; STATION.water[0]=c.cx+span/2-14; STATION.water[1]=c.feet-6.5; }
  if(P('basket')){ const c=P('basket'); STATION.basket[0]=c.cx-8.5; STATION.basket[1]=c.feet-16; }
  if(P('bath')){ const c=P('bath'); STATION.bath[0]=c.cx-8.5; STATION.bath[1]=c.feet-15; }
  if(P('potty')){ const c=P('potty'); FIX.dx=c.cx-16; FIX.dy=c.feet-94; if(typeof LUMPS!=='undefined') BASE_LUMPS.forEach(([x,y],i)=>{ LUMPS[i]=[x+FIX.dx,y+FIX.dy]; }); }
  if(P('bed')){ const c=P('bed'), s=SPOT.floorL; s.box[0]=c.cx-s.box[2]/2; s.base=c.feet-2; }
  if(P('plant')){ const c=P('plant'), s=SPOT.floorR; s.box[0]=c.cx-s.box[2]/2; s.base=c.feet; }
  /* Toys picked up as a chore lie in the empty spots (or in front of the pet). */
  if(typeof TOY_SPOTS!=='undefined'){ const free=cells.filter(c=>!taken[c.key]), extra=[[44,89],[75,89],[40,94],[80,94]];
    TOY_SPOTS.forEach((t,i)=>{ const c=free[i]; TOY_SPOTS[i]=[t[0],c?c.cx-5:extra[i%4][0],c?c.feet-10:extra[i%4][1]]; }); }
  bgKey=null; if(typeof compSpotCache!=='undefined') compSpotCache.key=null; }
const gridPosOf=key=>GRID.pos[key]||null;
/* Draw everything on the floor from the back row to the front, so whatever is nearer is in front. */
function drawFloorUnits(now,ak){ const kd=kind(), t=state.task, r=(layer==='decor'&&decorPreview)||room(), list=[];
  list.push({y:STATION.bath[1]+15,f:()=>drawObj(stationSprite('bath',kd),STATION.bath[0],STATION.bath[1],hlOn('clean'))});
  list.push({y:STATION.basket[1]+16,f:()=>drawObj(stationSprite('basket',kd),STATION.basket[0],STATION.basket[1],hlOn('play'))});
  list.push({y:STATION.feed[1]+8,f:()=>{ if(ak!=='feed:bowl') drawObj(foodBowl(),STATION.feed[0],STATION.feed[1],hlOn('feed')); if(ak!=='task:water') drawObj(waterBowl(t==='water'),STATION.water[0],STATION.water[1],hlOn('task')&&t==='water'); }});
  list.push({y:94+(FIX.dy||0),f:()=>drawFixtures(ctx,kd)});
  /* The bed grows while the pet naps on it (anims.js napGrow). */
  { const id=r.spots.floorL||'petBed', p=itemPos(id,'floorL'), d=DECOR[id], k=anim&&anim.type==='nap'?napGrow(clock()-anim.start,anim):1;
    list.push({y:p.y+d.h,f:()=>{ if(k>1.02){ const cx=p.x+d.w/2, base=p.y+d.h, w=d.w*k, h=d.h*k; softShadow(ctx,cx,base-.5,w*.55,2.4*k,.3); blitSized(ctx,itemSprite(id),cx-w/2,base-h,w,h); return; }
      const saved=state.room; state.room=r; try{ drawItem(ctx,id,'floorL',{}); } finally { state.room=saved; } if(hlOn('nap')) drawObj(itemSprite(id),p.x,p.y,true); }}); }
  if(r.spots.floorR&&DECOR[r.spots.floorR]&&!(t==='plant'&&r.spots.floorR==='plant')){ const id=r.spots.floorR, p=itemPos(id,'floorR'); list.push({y:p.y+DECOR[id].h,f:()=>{ const saved=state.room; state.room=r; try{ drawItem(ctx,id,'floorR',{}); } finally { state.room=saved; } }}); }
  const sp=comps().length?compSpots():[]; comps().forEach((c,i)=>{ if(sp[i]) list.push({y:sp[i].y,f:()=>drawCompanion(i,now)}); });
  list.sort((a,b)=>a.y-b.y).forEach(o=>o.f()); }
function cellLabel(c){ const m=/^([LRC])(\d+)r(\d+)$/.exec(c.key), side={L:'Left',R:'Right',C:'Front'}[m[1]], rows=Math.max(...GRID.cells.map(x=>x.row))+1;
  const row=rows<=2?(+m[3]===0?'back':'front'):`row ${+m[3]+1}`; return {label:`${side} ${+m[2]+1}, ${row}`,say:`${side} side, spot ${+m[2]+1}, ${row} row`}; }

/* Decorate Home: pick a spot for one thing. */
function gridChoices(unitKey,back){ const r=room(), units=GRID.units||gridUnits(), u=units.find(x=>x.key===unitKey); if(!u) return [];
  const cur={}; units.forEach(x=>{ const c=GRID.pos[x.key]; if(c) cur[x.key]=c.key; });
  return GRID.cells.map(c=>{ const other=units.find(x=>cur[x.key]===c.key&&x.key!==unitKey), L=cellLabel(c), here=cur[unitKey]===c.key;
    const next=()=>{ const g=Object.assign({},cur); if(other) g[other.key]=cur[unitKey]; g[unitKey]=c.key; return g; };
    return {label:L.label,sub:here?'Here now':other?`Swap with ${other.label.toLowerCase()}`:'Empty',say:`${L.say}. ${here?'Here now':other?'Swap with the '+other.label.toLowerCase():'Empty'}`,hi:c.rect,
      preview:()=>{ const q=cloneRoom(r); q.grid=next(); return q; },
      fn:()=>{ r.grid=next(); bumpRoom(); save(); play('place'); back(`The ${u.label.toLowerCase()} ${other?`swapped with the ${other.label.toLowerCase()}`:'moved'}.`); }}; }); }

/* More to Do > Companions > Say goodbye: to one companion, or to all of them. */
function openCompGoodbye(){ const cs=comps(), back=()=>openCompanions();
  if(!cs.length){ back(); return; }
  if(cs.length===1){ confirmGoodbye([0]); return; }
  const opts=cs.map((c,i)=>({label:`${c.name} the ${compStageWord(c)}`,say:`Say goodbye to ${c.name} the ${compStageWord(c)}`,preview:{custom:(x,y)=>drawLifeStrip(c,x,y)},fn:()=>confirmGoodbye([i])}));
  if(cs.length>1) opts.push({label:'All companions',say:'Say goodbye to all companions',fn:()=>confirmGoodbye(cs.map((c,i)=>i))});
  opts.push({label:'Back',fn:back});
  showChoice(`Which companion should go to a happy new home?`,opts); }
function confirmGoodbye(idx){ const cs=comps(), names=idx.map(i=>cs[i].name), who=names.length>1?'all the companions':names[0];
  showChoice(`Say goodbye to ${who}? ${names.length>1?'They go':'It goes'} to a happy new home. You can pick a new companion any time in Companions, in More to Do.`,[
    {label:`Yes, say goodbye`,fn:()=>{ state.companions=cs.filter((c,i)=>!idx.includes(i)); state.noCompOffer=true; compSpotCache.key=null; applyGrid(); save(); play('place'); setCaption(`Goodbye, ${names.join(' and ')}! Have a happy new home.`); quietUntil=Date.now()+6000; }},
    {label:names.length>1?'No, keep them':`No, keep ${names[0]}`,fn:()=>openCompanions()}]); }
