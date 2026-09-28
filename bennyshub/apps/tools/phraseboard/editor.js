'use strict';
const PB = PhraseBoard, $ = id => document.getElementById(id);
let rows = [], category = '', selected = -1, revision = null, dirty = false, undo = [], groupDrafts = new Map(), returnData = null, returnSaved = false, selectedTiles = new Set(), suppressTileClick = false, editorView = 'canvas', selectedCategories = new Set();
function status(text, error=false) { $('status').textContent = text; $('status').classList.toggle('error',error); }
function fail(error) { status(error.message + ' Your current edits are still here; download a CSV to keep them.',true); }
function snapshot() { undo.push(JSON.stringify({rows,category,selected,selectedTiles:[...selectedTiles],selectedCategories:[...selectedCategories]})); if (undo.length > 40) undo.shift(); dirty = true; $('save').textContent = 'Save changes'; }
function catRows() { return rows.filter(r=>r.category===category); }
function newRow(name=category) {
  const first = rows[0] || {boardName:'My Personal Board',boardLayout:'grid',boardColor:'#5bb0ff'};
  const same = rows.filter(r=>r.category===name), last = same.at(-1);
  return PB.normalize([{...first,...last,category:name,categoryOrder:last?.categoryOrder || new Set(rows.map(r=>r.category)).size+1,categoryLayout:last?.categoryLayout || '', display:'New tile',speak:'',image:'',immediate:false,tileOrder:same.length+1,scanOrder:same.length+1,x:(same.length%4)*240,y:Math.floor(same.length/4)*140,width:220,height:120}])[0];
}
function selectCategory(name) { selectedCategories.clear(); category=name; selected=rows.findIndex(r=>r.category===name); selectedTiles=new Set(selected>=0?[selected]:[]); render(); }
function render() {
  selectedCategories=new Set([...selectedCategories].filter(name=>rows.some(r=>r.category===name)));
  selectedTiles=new Set([...selectedTiles].filter(i=>rows[i]&&(editorView==='map'||rows[i].category===category)));
  document.querySelector('.workspace').classList.toggle('map-workspace',editorView==='map');
  syncMapWorkspace();
  document.querySelector('.workspace').classList.toggle('editing-category',selectedCategories.size>0);$('addMapCategory').hidden=editorView!=='map';
  $('basicView').setAttribute('aria-pressed',String(editorView==='canvas'));$('mapView').setAttribute('aria-pressed',String(editorView==='map'));
  if(!selectedTiles.size&&selected>=0&&rows[selected]?.category===category) selectedTiles.add(selected);
  const first=rows[0] || {};
  for (const key of ['boardName','boardLayout','boardColor','boardImage']) $(key).value=first[key] || (key==='boardColor'?'#5bb0ff':'');
  $('categories').replaceChildren();
  [...new Set([...rows].sort((a,b)=>a.categoryOrder-b.categoryOrder).map(r=>r.category))].forEach(name=>{const btn=document.createElement('button');btn.textContent=name;btn.setAttribute('aria-current',String(category===name));btn.dataset.category=name;btn.onclick=()=>selectCategory(name);$('categories').append(btn);});
  const c=catRows()[0] || {};
  for (const key of ['categoryName','categoryLayout','categoryColor','categoryImage']) $(key).value=(key==='categoryName'?category:c[key]) || (key==='categoryColor'?'#5bb0ff':'');
  renderGroups(); renderCanvas(); renderInspector(); renderBulk(); $('undo').disabled=!undo.length;
}
function renderCanvas() {
  if(editorView==='map'){renderMap();return;}
  const canvas=$('canvas'), width=Number($('device').value), free=PB.layout(catRows())==='free', compact=width<760;
  canvas.replaceChildren();canvas.style.width=(width===1000?Math.min(width,Math.max(300,canvas.parentElement.clientWidth-24)):width)+'px';canvas.className=(free?'free ':'')+(compact?'compact':'');
  canvas.style.height=free&&!compact?Math.max(400,...catRows().map(r=>r.y+r.height+32))+'px':'auto';
  $('canvasHint').textContent=free?(compact?'Phone layouts reflow into readable, scrollable tiles in reading order. Positions are edited on the desktop canvas.':'Drag to place tiles, or drag selected tiles onto a category. Drag a corner to resize. Scan order stays independent.'):'Drag to reorder. Drag tiles onto a category to move them. Use checkboxes or Ctrl/Shift-click to select several tiles.';
  let items=rows.map((r,index)=>({r,index})).filter(({r})=>r.category===category).sort((a,b)=>free?a.r.y-b.r.y||a.r.x-b.r.x:a.r.tileOrder-b.r.tileOrder);
  items.forEach(({r,index})=>{
    canvas.append(createEditorTile(r,index,free,compact,items));
  });
}
function createEditorTile(r,index,free,compact,items) {
    const btn=document.createElement('div');btn.className='canvas-tile'+(index===selected?' selected':'');btn.tabIndex=0;btn.role='button';btn.setAttribute('aria-label','Edit '+r.display);btn.dataset.index=index;
    btn.style.setProperty('--group-color',r.groupColor);
    btn.style.background=PB.color(r.tileColor||r.categoryColor,'#5bb0ff')+'33';
    btn.classList.toggle('multi-selected',selectedTiles.has(index));
    const check=document.createElement('input');check.type='checkbox';check.className='tile-select';check.checked=selectedTiles.has(index);check.setAttribute('aria-label','Select '+(r.display||r.speak||'tile'));
    check.onpointerdown=e=>e.stopPropagation();check.onclick=e=>e.stopPropagation();check.onchange=()=>{if(check.checked)selectedTiles.add(index);else selectedTiles.delete(index);selected=selectedTiles.has(index)?index:([...selectedTiles].at(-1)??-1);if(selected>=0)category=rows[selected].category;selectedCategories.clear();render();};btn.append(check);
    if(free&&!compact){btn.style.left=r.x/10+'%';btn.style.top=r.y+'px';btn.style.width=r.width/10+'%';btn.style.minHeight=r.height+'px';}
    if(r.image){const img=document.createElement('img');img.src=r.image;img.alt='';btn.append(img);}
    const text=document.createElement('span');text.textContent=r.display||r.speak||'Untitled';btn.append(text);
    if(free&&editorView!=='map'){const info=document.createElement('small');info.textContent=r.group+' · scan '+r.scanOrder;btn.append(info);}
    btn.oncontextmenu=e=>openTileMenu(e,index);
    btn.onclick=e=>{if(suppressTileClick){suppressTileClick=false;return;}if(e.ctrlKey||e.metaKey){if(selectedTiles.has(index))selectedTiles.delete(index);else selectedTiles.add(index);}else if(e.shiftKey&&selected>=0){const order=items.map(x=>x.index),a=order.indexOf(selected),b=order.indexOf(index);for(const i of order.slice(Math.min(a,b),Math.max(a,b)+1))selectedTiles.add(i);}else selectedTiles=new Set([index]);selected=selectedTiles.has(index)?index:([...selectedTiles].at(-1)??-1);if(selected>=0)category=rows[selected].category;selectedCategories.clear();render();};
    btn.onkeydown=e=>{if(e.target!==btn)return;if(e.key==='Enter'||e.key===' '){e.preventDefault();btn.click();}};
    if(free&&!compact){const handle=document.createElement('span');handle.className='resize-handle';handle.textContent='↘';handle.setAttribute('aria-hidden','true');btn.append(handle);}
    btn.onpointerdown=e=>startDrag(e,btn,index,e.target.classList.contains('resize-handle'));
    return btn;
}
function startDrag(event,node,index,resizing) {
  if(event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey)return;
  if(!selectedTiles.has(index))selectedTiles=new Set([index]);
  selected=index;category=rows[index].category;selectedCategories.clear();renderInspector();renderBulk();
  const ids=resizing?[index]:[...selectedTiles];
  const initial=new Map(ids.map(i=>[i,{...rows[i]}]));
  const scroll=$('canvas').parentElement,scale=$('canvas').getBoundingClientRect().width/1000;
  const start={x:event.clientX,y:event.clientY,left:scroll.scrollLeft,top:scroll.scrollTop};
  const free=editorView==='canvas'&&PB.layout(catRows())==='free',compact=Number($('device').value)<760;
  let moved=false,destination='',dropIndex=-1,dropAfter=false,ghost=null;
  const clearTargets=()=>document.querySelectorAll('.category-drop-target,.tile-drop-before,.tile-drop-after').forEach(n=>n.classList.remove('category-drop-target','tile-drop-before','tile-drop-after'));
  node.setPointerCapture(event.pointerId);
  node.onpointermove=e=>{
    const distance=Math.abs(e.clientX-start.x)+Math.abs(e.clientY-start.y);if(!moved&&distance<5)return;
    if(!moved){snapshot();moved=true;$('canvas').classList.add('dragging');ghost=document.createElement('div');ghost.className='drag-preview';document.body.append(ghost);}
    ghost.textContent=ids.length>1?ids.length+' tiles':rows[index].display;ghost.style.left=(e.clientX+16)+'px';ghost.style.top=(e.clientY+16)+'px';
    clearTargets();destination='';dropIndex=-1;
    const hit=document.elementFromPoint(e.clientX,e.clientY),categoryButton=hit?.closest('[data-category]');
    if(!resizing&&categoryButton&&ids.some(i=>rows[i].category!==categoryButton.dataset.category)){destination=categoryButton.dataset.category;categoryButton.classList.add('category-drop-target');ghost.textContent='Move to '+destination;return;}
    const rect=scroll.getBoundingClientRect();
    if(e.clientX>rect.left&&e.clientX<rect.right&&e.clientY>rect.top&&e.clientY<rect.bottom){
      if(e.clientX>rect.right-32)scroll.scrollLeft+=15;else if(e.clientX<rect.left+32)scroll.scrollLeft-=15;
      if(e.clientY>rect.bottom-32)scroll.scrollTop+=15;else if(e.clientY<rect.top+32)scroll.scrollTop-=15;
    }
    let dx=(e.clientX-start.x+scroll.scrollLeft-start.left)/scale,dy=e.clientY-start.y+scroll.scrollTop-start.top;
    if(free&&!compact){
      if(resizing){const r=rows[index],old=initial.get(index);r.width=Math.round(Math.max(120,Math.min(1000-r.x,old.width+dx)));r.height=Math.round(Math.max(88,Math.min(2000,old.height+dy)));}
      else{
        const original=[...initial.values()];dx=Math.max(-Math.min(...original.map(r=>r.x)),Math.min(1000-Math.max(...original.map(r=>r.x+r.width)),dx));dy=Math.max(-Math.min(...original.map(r=>r.y)),Math.min(10000-Math.max(...original.map(r=>r.y)),dy));
        for(const i of ids){rows[i].x=Math.round(initial.get(i).x+dx);rows[i].y=Math.round(initial.get(i).y+dy);}
      }
      for(const i of ids){const r=rows[i],tile=$('canvas').querySelector('[data-index="'+i+'"]');if(tile){tile.style.left=r.x/10+'%';tile.style.top=r.y+'px';tile.style.width=r.width/10+'%';tile.style.minHeight=r.height+'px';}}
      $('canvas').style.height=Math.max(400,...catRows().map(r=>r.y+r.height+32))+'px';
    }else if(!free){
      const target=hit?.closest('.canvas-tile');if(target&&rows[Number(target.dataset.index)]?.category===category&&!selectedTiles.has(Number(target.dataset.index))){dropIndex=Number(target.dataset.index);const box=target.getBoundingClientRect();dropAfter=e.clientX>box.left+box.width/2;target.classList.add(dropAfter?'tile-drop-after':'tile-drop-before');}
    }
  };
  const finish=e=>{
    node.onpointermove=null;node.onpointerup=null;node.onpointercancel=null;document.removeEventListener('keydown',cancel);ghost?.remove();clearTargets();$('canvas').classList.remove('dragging');
    if(moved){
      suppressTileClick=true;setTimeout(()=>{suppressTileClick=false;},0);
      if(e.type==='pointercancel'){for(const [i,r] of initial)rows[i]=r;}
      else if(destination)moveSelectedTo(destination,false);
      else if(!free&&dropIndex>=0){
        const current=rows.map((r,i)=>({r,i})).filter(x=>x.r.category===category).sort((a,b)=>a.r.tileOrder-b.r.tileOrder),moving=current.filter(x=>selectedTiles.has(x.i)),rest=current.filter(x=>!selectedTiles.has(x.i));
        if(editorView==='map'&&PB.layout(catRows())==='free'){status('Tile order updated. Use Basic view to change free-placement positions.');}
        const target=rest.findIndex(x=>x.i===dropIndex)+(dropAfter?1:0);rest.splice(Math.max(0,target),0,...moving);rest.forEach((x,i)=>x.r.tileOrder=i+1);status('Tiles reordered. Save when ready.');
      }
    }
    if(moved)render();
  };
  const cancel=e=>{if(e.key==='Escape'){e.preventDefault();finish({type:'pointercancel'});if(node.hasPointerCapture(event.pointerId))node.releasePointerCapture(event.pointerId);}};
  document.addEventListener('keydown',cancel);
  node.onpointerup=finish;node.onpointercancel=finish;
}

function groupList() {
  const actual=PB.groups(catRows()).map(g=>({name:g.name,color:g.color,order:g.order}));
  return [...actual,...(groupDrafts.get(category)||[]).filter(g=>!actual.some(a=>a.name===g.name))].sort((a,b)=>a.order-b.order);
}
function renderGroups() {
  $('groupsSection').hidden=PB.layout(catRows())!=='free';$('groups').replaceChildren();
  groupList().forEach(g=>{
    const div=document.createElement('div');div.className='group-row';
    const field=(label,type,value,change)=>{const wrap=document.createElement('label');wrap.textContent=label;const input=document.createElement('input');input.type=type;input.value=value;if(type==='number')input.min=0;input.onchange=()=>change(input.value);wrap.append(input);div.append(wrap);};
    function change(key,value){snapshot();catRows().filter(r=>r.group===g.name).forEach(r=>r[key]=value);(groupDrafts.get(category)||[]).filter(d=>d.name===g.name).forEach(d=>d[key==='group'?'name':key==='groupColor'?'color':'order']=value);render();}
    field('Group name','text',g.name,value=>{value=value.trim();if(!value||groupList().some(other=>other.name===value&&other.name!==g.name)){status('Choose a unique group name.',true);renderGroups();return;}change('group',value);});
    field('Color','color',g.color,value=>change('groupColor',value));field('Scan order','number',g.order,value=>change('groupOrder',Number(value)));
    const remove=document.createElement('button');remove.textContent='Remove';remove.onclick=()=>{const target=groupList().find(x=>x.name!==g.name);if(!target)return status('Keep at least one group.',true);snapshot();catRows().filter(r=>r.group===g.name).forEach(r=>{r.group=target.name;r.groupColor=target.color;r.groupOrder=target.order;});groupDrafts.set(category,(groupDrafts.get(category)||[]).filter(x=>x.name!==g.name));render();};div.append(remove);$('groups').append(div);
  });
}
function renderInspector() {
  const r=rows[selected];$('tileFields').hidden=!r;$('noTile').hidden=!!r;if(!r)return;
  $('tileGroupFields').hidden=PB.layout(catRows())!=='free';
  $('group').replaceChildren();groupList().forEach(g=>{const o=document.createElement('option');o.value=g.name;o.textContent=g.name;$('group').append(o);});
  for(const key of ['display','speak','image','tileColor','group','scanOrder','tileOrder','x','y','width','height']) $(key).value=r[key] || (key==='tileColor'?r.categoryColor:r[key]);
  $('immediate').checked=r.immediate;
}
for(const key of ['boardName','boardLayout','boardColor','boardImage']) $(key).onchange=()=>{snapshot();rows.forEach(r=>r[key]=$(key).value);render();};
for(const key of ['categoryName','categoryLayout','categoryColor','categoryImage']) $(key).onchange=()=>{
  const value=$(key).value.trim();if(key==='categoryName'&&(!value||rows.some(r=>r.category===value&&value!==category))){status('Choose a unique category name.',true);render();return;}
  snapshot();catRows().forEach(r=>r[key==='categoryName'?'category':key]=value);if(key==='categoryName'){groupDrafts.set(value,groupDrafts.get(category)||[]);category=value;}render();
};
for(const key of ['display','speak','image','tileColor','group','scanOrder','tileOrder','x','y','width','height','immediate']) $(key).onchange=()=>{
  if(!rows[selected])return;snapshot();let value=key==='immediate'?$(key).checked:$(key).value;
  const chosenGroup = key==='group' ? groupList().find(g=>g.name===value) : null;
  if(key==='tileColor'&&selectedTiles.size>1){for(const index of selectedTiles)if(rows[index])rows[index].tileColor=value;}
  else rows[selected][key]=value;
  if(key==='group'){const g=chosenGroup;if(g){rows[selected].groupColor=g.color;rows[selected].groupOrder=g.order;}}
  rows=PB.normalize(rows);render();
};
$('device').onchange=renderCanvas;
$('addTile').onclick=()=>{snapshot();selectedCategories.clear();rows.push(newRow());selected=rows.length-1;selectedTiles=new Set([selected]);render();};
$('deleteTile').onclick=()=>{if(catRows().length<2)return status('Keep one tile, or delete the category.',true);snapshot();rows.splice(selected,1);selected=rows.findIndex(r=>r.category===category);selectedTiles=new Set([selected]);render();};
$('addCategory').onclick=()=>{snapshot();let name='New category',i=2;while(rows.some(r=>r.category===name))name='New category '+i++;rows.push(newRow(name));selectCategory(name);};
$('removeCategory').onclick=()=>{if(new Set(rows.map(r=>r.category)).size<2)return status('Keep at least one category.',true);snapshot();rows=rows.filter(r=>r.category!==category);selectCategory(rows[0].category);};
$('addGroup').onclick=()=>{let name='New group',i=2;while(groupList().some(g=>g.name===name))name='New group '+i++;groupDrafts.set(category,[...(groupDrafts.get(category)||[]),{name,color:'#7a4ba0',order:groupList().length+1}]);renderGroups();renderInspector();status('Group added. Assign tiles using the Group field. Empty groups are not saved or scanned.');};
$('undo').onclick=()=>{if(!undo.length)return;const previous=JSON.parse(undo.pop());rows=previous.rows;category=previous.category;selected=previous.selected;selectedTiles=new Set(previous.selectedTiles||[selected]);selectedCategories=new Set(previous.selectedCategories||[]);dirty=true;render();status('Last edit undone. Save when ready.');};
function save() {try{const data=PB.save(localStorage,rows,revision);revision=data.revision;returnData=data;returnSaved=true;dirty=false;$('save').textContent='Saved';status('Saved. The live board will confirm when these changes load.');return true;}catch(error){fail(error);return false;}}
$('save').onclick=save;
$('download').onclick=()=>{const url=URL.createObjectURL(new Blob([PB.csv(rows)],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=(rows[0]?.boardName||'phrase-board').replace(/[^\w -]/g,'')+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
function mayDiscard(){return !dirty||confirm('Discard unsaved changes? Download a CSV or save first if you want to keep them.');}
$('return').onclick=()=>{if(!mayDiscard())return;try { if(returnData) sessionStorage.setItem('phraseboard_return',JSON.stringify({...returnData,confirmedSave:returnSaved})); dirty=false;location.href='index.html'+(returnData?'?return=1&category='+encodeURIComponent(category):''); } catch(error) { fail(error); }};
$('restore').onclick=()=>{if(!mayDiscard())return;try{const previous=PB.read(localStorage,PB.PREVIOUS);if(!previous)throw new Error('There is no previous save yet.');snapshot();rows=PB.parse(previous.csv);category=rows[0].category;selected=0;render();status('Previous save restored into the editor. Review it, then Save to apply. Undo returns to your edits.');}catch(error){fail(error);}};
$('reload').onclick=()=>{if(!mayDiscard())return;try{const data=PB.read(localStorage);if(!data)throw new Error('No saved board yet.');rows=PB.parse(data.csv);revision=data.revision||null;returnData=data;returnSaved=true;dirty=false;undo=[];selectCategory(rows[0].category);status('Saved board loaded.');}catch(error){fail(error);}};
$('new').onclick=()=>{if(!mayDiscard())return;snapshot();rows=[];rows.push(newRow('Words'));selectCategory('Words');status('New board started. The previous board is recoverable after saving.');};
$('import').onclick=()=>$('file').click();
$('file').onchange=async()=>{const file=$('file').files[0];if(!file)return;try{const imported=PB.parse(await file.text());if(!imported.length)throw new Error('This CSV contains no tiles.');if(!mayDiscard())return;snapshot();rows=imported;selectCategory(rows[0].category);status('CSV imported. Review and Save to apply.');}catch(error){fail(error);}finally{$('file').value='';}};
$('preview').onclick=()=>{try{sessionStorage.setItem('phraseboard_preview',JSON.stringify({boardName:rows[0].boardName,csv:PB.csv(rows)}));$('previewFrame').style.width=$('device').value+'px';$('previewFrame').src='index.html?preview=1&category='+encodeURIComponent(category);$('previewDialog').showModal();$('previewFrame').focus();}catch(error){fail(error);}};
function closePreview(){$('previewFrame').src='about:blank';$('previewDialog').close();$('preview').focus();}
$('closePreview').onclick=closePreview;$('previewDialog').addEventListener('cancel',e=>{e.preventDefault();closePreview();});
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
try {
  const saved=PB.read(localStorage);revision=saved?.revision||null;
  if (!saved && !localStorage.getItem('phraseboard_settings')) localStorage.setItem('phraseboard_settings', JSON.stringify({sentenceMode:true,predictionsEnabled:true,rememberMessages:true}));
  const handoff=new URLSearchParams(location.search).has('current')?JSON.parse(sessionStorage.getItem('phraseboard_edit')||'null'):null;
  returnData=handoff||saved;returnSaved=!handoff&&!!saved;
  rows=PB.parse((handoff||saved)?.csv||'Category,Display,Speak,BoardName\nWords,I,I,My Personal Board\nWords,want,want,My Personal Board\nWords,music,music,My Personal Board');
  if(handoff)revision=handoff.revision;
  category=handoff?.category&&rows.some(r=>r.category===handoff.category)?handoff.category:rows[0].category;selected=rows.findIndex(r=>r.category===category);render();
} catch(error){rows=[newRow('Words')];category='Words';selected=0;render();fail(error);}
