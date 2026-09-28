'use strict';
// Functions are loaded before editor bootstrap; editor bindings exist when they run.
function renderBulk(){
  const count=selectedTiles.size;
  $('selectionActions').hidden=!count;
  $('selectionActions').classList.toggle('single-selection',count===1);
  $('selectionCount').textContent=count?count+' tile'+(count===1?'':'s')+' selected':selectedCategories.size?selectedCategories.size+' categor'+(selectedCategories.size===1?'y':'ies')+' selected':'Drag to select tiles';
  const categorySelect=$('moveCategory'),prior=categorySelect.value;categorySelect.replaceChildren();
  const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='Choose a destination category…';categorySelect.append(placeholder);
  [...new Set(rows.map(r=>r.category))].filter(name=>[...selectedTiles].some(i=>rows[i]?.category!==name)).forEach(name=>{const option=document.createElement('option');option.value=name;option.textContent=name;categorySelect.append(option);});
  if([...categorySelect.options].some(o=>o.value===prior))categorySelect.value=prior;
  const groupSelect=$('bulkGroup'),priorGroup=groupSelect.value;groupSelect.replaceChildren();
  groupList().forEach(group=>{const option=document.createElement('option');option.value=group.name;option.textContent=group.name;groupSelect.append(option);});
  if([...groupSelect.options].some(o=>o.value===priorGroup))groupSelect.value=priorGroup;
  for(const id of ['applyBulkColor','resetBulkColor','deleteSelected','assignGroup'])$(id).disabled=!count;
  $('moveTiles').disabled=!count||categorySelect.options.length<2;
  $('bulkScanGroup').hidden=PB.layout(catRows())!=='free'||[...selectedTiles].some(i=>rows[i].category!==category);
  $('confirmMoveTiles').disabled=!categorySelect.value;
}
function bulkSelectionChanged(){renderCanvas();renderInspector();renderBulk();}
// Handler installation waits until editor.js has initialized the board.
window.addEventListener('DOMContentLoaded',()=>{
  $('selectAllTiles').onclick=()=>{selectedTiles=new Set(rows.map((r,i)=>(editorView==='map'||r.category===category)?i:-1).filter(i=>i>=0));bulkSelectionChanged();};
  $('deselectTiles').onclick=()=>{selectedTiles.clear();selectedCategories.clear();selected=-1;render();};
  function colorSelected(color){if(!selectedTiles.size)return;snapshot();selectedTiles.forEach(i=>rows[i].tileColor=color);render();status('Updated '+selectedTiles.size+' tiles. Save when ready.');}
  $('applyBulkColor').onclick=()=>colorSelected($('bulkColor').value);
  $('resetBulkColor').onclick=()=>colorSelected('');
  $('assignGroup').onclick=()=>{const group=groupList().find(g=>g.name===$('bulkGroup').value);if(!group||!selectedTiles.size)return;snapshot();selectedTiles.forEach(i=>{rows[i].group=group.name;rows[i].groupColor=group.color;rows[i].groupOrder=group.order;});render();};
  $('moveTiles').onclick=openMoveTiles;
  $('moveCategory').onchange=()=>{$('confirmMoveTiles').disabled=!$('moveCategory').value;};
  $('cancelMoveTiles').onclick=()=>$('moveTilesDialog').close();
  $('confirmMoveTiles').onclick=()=>{const destination=$('moveCategory').value;if(!destination)return;$('moveTilesDialog').close();moveSelectedTo(destination);};
  $('deleteSelected').onclick=()=>{
    if(!selectedTiles.size)return;if(selectedTiles.size>=rows.length)return status('Keep at least one tile in the board.',true);
    snapshot();rows=rows.filter((_,i)=>!selectedTiles.has(i));if(!rows.some(r=>r.category===category))category=rows[0].category;selected=rows.findIndex(r=>r.category===category);selectedTiles=new Set([selected]);render();status('Selected tiles deleted. Undo can restore them.');
  };
});

function openMoveTiles(){
  if(!selectedTiles.size)return status('Select the tiles you want to move first.',true);
  renderBulk();$('moveCategory').value='';$('confirmMoveTiles').disabled=true;
  const names=[...selectedTiles].map(i=>rows[i].display||rows[i].speak||'Untitled');
  $('moveTilesDescription').textContent='Move '+names.length+' selected tile'+(names.length===1?'':'s')+' into another category on this board.';
  $('moveTilesNames').textContent=names.slice(0,12).join(', ')+(names.length>12?' and '+(names.length-12)+' more':'');
  $('confirmMoveTiles').textContent='Move '+names.length+' tile'+(names.length===1?'':'s');
  $('moveTilesDialog').showModal();$('moveCategory').focus();
}

function moveSelectedTo(destination,snapshotBefore=true){
    const target=rows.filter(r=>r.category===destination),moving=[...selectedTiles].filter(i=>rows[i]?.category!==destination);if(!moving.length||!target.length)return;
    if(snapshotBefore)snapshot();const first=target[0],bottom=Math.max(...target.map(r=>r.y+r.height))+20;
    let order=Math.max(...target.map(r=>r.tileOrder)),scan=Math.max(...target.map(r=>r.scanOrder)),index=0;
    for(const i of moving){const r=rows[i];r.category=destination;r.categoryOrder=first.categoryOrder;r.categoryColor=first.categoryColor;r.categoryImage=first.categoryImage;r.categoryLayout=first.categoryLayout;r.group=first.group;r.groupOrder=first.groupOrder;r.groupColor=first.groupColor;r.tileOrder=++order;r.scanOrder=++scan;r.x=(index%4)*240;r.y=bottom+Math.floor(index/4)*140;r.width=220;r.height=Math.max(120,r.height);index++;}
    const sourceRemains=rows.some(r=>r.category===category);
    if(editorView==='map'||!sourceRemains){category=destination;selectedTiles=new Set(moving);selected=moving[0];}
    else {selectedTiles.clear();selected=-1;}
    selectedCategories.clear();render();status('Moved '+moving.length+' tile'+(moving.length===1?'':'s')+' to category “'+destination+'”.'+(!sourceRemains&&editorView!=='map'?' The original category is now empty, so the destination is shown.':'')+' Undo restores the move.');
    const view=document.createElement('button');view.className='status-action';view.textContent='View '+destination;view.onclick=()=>selectCategory(destination);$('status').append(' ',view);

}
