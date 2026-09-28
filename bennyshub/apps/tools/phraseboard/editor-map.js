'use strict';
// The map and canvas edit the same rows; switching views never converts a layout.
let mapMenu=null;
function orderedCategories(){return [...new Set([...rows].sort((a,b)=>a.categoryOrder-b.categoryOrder).map(r=>r.category))];}
function renderMap(){
  const canvas=$('canvas');canvas.replaceChildren();canvas.className='board-map';canvas.style.width=Math.max(320,orderedCategories().length*270+48)+'px';canvas.style.height='auto';
  $('canvasHint').textContent='Drag tiles between categories. Drag category headings to reorder. Drag empty space to box-select; right-click a selection for actions.';
  const root=document.createElement('button');root.className='map-root';root.textContent=rows[0]?.boardName||'Board';root.onclick=()=>{openBoardSettings();};root.oncontextmenu=e=>showMapMenu(e,'board');canvas.append(root);
  const branches=document.createElement('div');branches.className='map-branches';branches.style.gridTemplateColumns='repeat('+orderedCategories().length+',minmax(0,1fr))';canvas.append(branches);
  const items=rows.map((r,index)=>({r,index})).sort((a,b)=>a.r.categoryOrder-b.r.categoryOrder||a.r.tileOrder-b.r.tileOrder);
  orderedCategories().forEach(name=>{
    const members=items.filter(x=>x.r.category===name),card=document.createElement('section');card.className='map-category';card.dataset.category=name;
    card.style.setProperty('--category-color',PB.color(members[0].r.categoryColor,'#5bb0ff'));
    const heading=document.createElement('button');heading.className='map-category-heading';heading.dataset.category=name;heading.textContent=name;heading.setAttribute('aria-pressed',String(selectedCategories.has(name)));card.append(heading);
    heading.onclick=e=>{if(suppressTileClick)return;if(e.ctrlKey||e.metaKey||e.shiftKey){if(selectedCategories.has(name))selectedCategories.delete(name);else selectedCategories.add(name);}else selectedCategories=new Set([name]);category=name;selected=-1;selectedTiles.clear();render();};
    heading.oncontextmenu=e=>{if(!selectedCategories.has(name))selectedCategories=new Set([name]);selectedTiles.clear();selected=-1;category=name;render();showMapMenu(e,'categories');};
    heading.onpointerdown=e=>startCategoryDrag(e,heading,name);
    const note=document.createElement('small');note.textContent=members.length+' tiles · '+(PB.layout(members.map(x=>x.r))==='free'?'Free placement':'Grid');card.append(note);
    for(const {r,index} of members)card.append(createEditorTile(r,index,false,false,items));
    const add=document.createElement('button');add.className='map-add';add.textContent='+ Tile';add.onclick=()=>{category=name;$('addTile').click();};card.append(add);branches.append(card);
  });
  updateMapViewport();
}
function reorderCategories(moving,target,after){
  const order=orderedCategories(),chosen=order.filter(name=>moving.has(name)),rest=order.filter(name=>!moving.has(name));
  if(!rest.includes(target)||!chosen.length)return;
  snapshot();rest.splice(rest.indexOf(target)+(after?1:0),0,...chosen);rows.forEach(r=>r.categoryOrder=rest.indexOf(r.category)+1);render();status('Category order updated. Undo can restore it.');
}
function startCategoryDrag(event,node,name){
  if(event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey)return;
  let moved=false,target='',after=false,ghost;
  const moving=selectedCategories.has(name)?new Set(selectedCategories):new Set([name]);
  node.setPointerCapture(event.pointerId);
  node.onpointermove=e=>{
    if(!moved&&Math.abs(e.clientX-event.clientX)+Math.abs(e.clientY-event.clientY)<5)return;
    if(!moved){moved=true;ghost=document.createElement('div');ghost.className='drag-preview';ghost.textContent=moving.size===1?name:moving.size+' categories';document.body.append(ghost);}
    ghost.style.left=e.clientX+16+'px';ghost.style.top=e.clientY+16+'px';target='';
    document.querySelectorAll('.category-drop-target').forEach(n=>n.classList.remove('category-drop-target'));
    const hit=document.elementFromPoint(e.clientX,e.clientY)?.closest('.map-category-heading');
    if(hit&&!moving.has(hit.dataset.category)){target=hit.dataset.category;after=e.clientX>hit.getBoundingClientRect().left+hit.offsetWidth/2;hit.classList.add('category-drop-target');ghost.textContent=(after?'After ':'Before ')+target;}
  };
  const finish=e=>{node.onpointermove=node.onpointerup=node.onpointercancel=null;ghost?.remove();document.removeEventListener('keydown',cancel);document.querySelectorAll('.category-drop-target').forEach(n=>n.classList.remove('category-drop-target'));if(moved){suppressTileClick=true;setTimeout(()=>suppressTileClick=false,0);if(target&&e.type!=='pointercancel'){selectedCategories=moving;selectedTiles.clear();selected=-1;reorderCategories(moving,target,after);}}};
  const cancel=e=>{if(e.key==='Escape'){finish({type:'pointercancel'});if(node.hasPointerCapture(event.pointerId))node.releasePointerCapture(event.pointerId);}};
  document.addEventListener('keydown',cancel);node.onpointerup=finish;node.onpointercancel=finish;
}
function startBoxSelection(event){
  if(editorView!=='map'||mapPanMode||mapSpaceHeld||event.button!==0||event.target.closest('button,input,.canvas-tile'))return;
  event.preventDefault();closeMapMenu();document.querySelector('.canvas-scroll').focus({preventScroll:true});
  const canvas=$('canvas'),oldTiles=new Set(selectedTiles),oldCategories=new Set(selectedCategories),add=event.ctrlKey||event.metaKey||event.shiftKey;
  const box=document.createElement('div');box.className='selection-box';document.body.append(box);canvas.setPointerCapture(event.pointerId);
  const move=e=>{
    const rect={left:Math.min(event.clientX,e.clientX),right:Math.max(event.clientX,e.clientX),top:Math.min(event.clientY,e.clientY),bottom:Math.max(event.clientY,e.clientY)};
    Object.assign(box.style,{left:rect.left+'px',top:rect.top+'px',width:rect.right-rect.left+'px',height:rect.bottom-rect.top+'px'});
    selectedTiles=add?new Set(oldTiles):new Set();selectedCategories=add?new Set(oldCategories):new Set();
    for(const node of canvas.querySelectorAll('.canvas-tile,.map-category-heading')){const r=node.getBoundingClientRect();if(r.right>=rect.left&&r.left<=rect.right&&r.bottom>=rect.top&&r.top<=rect.bottom){if(node.dataset.index!==undefined)selectedTiles.add(Number(node.dataset.index));else selectedCategories.add(node.dataset.category);}node.classList.toggle('box-selected',node.dataset.index!==undefined?selectedTiles.has(Number(node.dataset.index)):selectedCategories.has(node.dataset.category));}
    if(selectedTiles.size){selectedCategories.clear();canvas.querySelectorAll('.map-category-heading').forEach(n=>n.classList.remove('box-selected'));}
    renderBulk();
  };
  const finish=e=>{canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',finish);canvas.removeEventListener('pointercancel',finish);document.removeEventListener('keydown',cancel);box.remove();if(e.type==='pointercancel'){selectedTiles=oldTiles;selectedCategories=oldCategories;}selected=[...selectedTiles][0]??-1;if(selected>=0)category=rows[selected].category;render();};
  const cancel=e=>{if(e.key==='Escape'){finish({type:'pointercancel'});if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);}};
  canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',finish);canvas.addEventListener('pointercancel',finish);document.addEventListener('keydown',cancel);
}
function closeMapMenu(){mapMenu?.remove();mapMenu=null;}
function openTileMenu(event,index){
  if(!selectedTiles.has(index)){selectedTiles=new Set([index]);selectedCategories.clear();}selected=index;category=rows[index].category;render();showMapMenu(event,'tiles');
}
function showMapMenu(event,scope){
  event.preventDefault();closeMapMenu();
  const menu=document.createElement('div');menu.className='map-context-menu';menu.setAttribute('role','dialog');menu.setAttribute('aria-label','Selection actions');mapMenu=menu;
  const title=document.createElement('strong');title.textContent=scope==='board'?'Board':scope==='categories'?selectedCategories.size+' categories':selectedTiles.size+' tiles';menu.append(title);
  const colorLabel=document.createElement('label');colorLabel.textContent='Color';const color=document.createElement('input');color.type='color';color.value=PB.color(scope==='board'?rows[0].boardColor:scope==='categories'?rows.find(r=>selectedCategories.has(r.category))?.categoryColor:rows[selected]?.tileColor||rows[selected]?.categoryColor,'#5bb0ff');colorLabel.append(color);menu.append(colorLabel);
  color.onchange=()=>{snapshot();rows.forEach((r,i)=>{if(scope==='board')r.boardColor=color.value;else if(scope==='categories'&&selectedCategories.has(r.category))r.categoryColor=color.value;else if(scope==='tiles'&&(selectedTiles.has(i)||selectedCategories.has(r.category)))r.tileColor=color.value;});render();status('Colors updated. Save when ready.');};
  function action(label,handler){const button=document.createElement('button');button.textContent=label;button.onclick=()=>{closeMapMenu();handler();};menu.append(button);}
  if(scope==='tiles'){
    action('Use category color',()=>{snapshot();selectedTiles.forEach(i=>rows[i].tileColor='');render();});
    action('Move to…',openMoveTiles);
    for(const [label,delta] of [['Move earlier',-1],['Move later',1]])action(label,()=>{snapshot();for(const name of new Set([...selectedTiles].map(i=>rows[i].category))){const items=rows.map((r,i)=>({r,i})).filter(x=>x.r.category===name).sort((a,b)=>a.r.tileOrder-b.r.tileOrder);if(delta<0){for(let n=1;n<items.length;n++)if(selectedTiles.has(items[n].i)&&!selectedTiles.has(items[n-1].i))[items[n-1],items[n]]=[items[n],items[n-1]];}else{for(let n=items.length-2;n>=0;n--)if(selectedTiles.has(items[n].i)&&!selectedTiles.has(items[n+1].i))[items[n+1],items[n]]=[items[n],items[n+1]];}items.forEach((x,i)=>x.r.tileOrder=i+1);}render();status('Tile order updated. Free-placement positions and scan order stay independent.');});
    action('Delete selected tiles',()=>$('deleteSelected').click());
  }else if(scope==='categories'){
    for(const [label,delta] of [['Move earlier',-1],['Move later',1]])action(label,()=>{const order=orderedCategories(),positions=order.map((name,i)=>selectedCategories.has(name)?i:-1).filter(i=>i>=0),target=order[delta<0?Math.min(...positions)-1:Math.max(...positions)+1];if(target)reorderCategories(selectedCategories,target,delta>0);});
    action('Delete selected categories',()=>{if(orderedCategories().every(name=>selectedCategories.has(name)))return status('Keep at least one category.',true);snapshot();rows=rows.filter(r=>!selectedCategories.has(r.category));selectedCategories.clear();selectedTiles.clear();selectCategory(rows[0].category);status('Categories deleted. Undo can restore them.');});
    action('Edit category appearance',()=>{$('categoryOptions').open=true;$('categoryName').focus();});
  }else action('Board options',()=>{openBoardSettings();});
  action('Close',()=>{});document.body.append(menu);
  const anchor=$('selectionMenu').getBoundingClientRect();menu.style.left=Math.max(8,Math.min(event.clientX||anchor.left,innerWidth-menu.offsetWidth-8))+'px';menu.style.top=Math.max(8,Math.min(event.clientY||anchor.bottom,innerHeight-menu.offsetHeight-8))+'px';color.focus();
}
window.addEventListener('DOMContentLoaded',()=>{
  $('addMapCategory').onclick=()=>$('addCategory').click();
  $('basicView').onclick=()=>setEditorView('canvas');
  $('mapView').onclick=()=>setEditorView('map');
  $('selectionMenu').onclick=e=>showMapMenu(e,selectedTiles.size?'tiles':selectedCategories.size?'categories':'board');
  document.querySelector('.canvas-scroll').addEventListener('pointerdown',startBoxSelection);
  document.addEventListener('pointerdown',e=>{if(mapMenu&&!mapMenu.contains(e.target)&&e.target!==$('selectionMenu'))closeMapMenu();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&mapMenu){closeMapMenu();$('selectionMenu').focus();}if(e.shiftKey&&e.key==='F10'&&e.target.closest('#canvas')){showMapMenu(e,selectedTiles.size?'tiles':selectedCategories.size?'categories':'board');}});
});
