'use strict';
// The original builder's category cards and editable rows, using the shared board model.
let advancedEditorView='canvas',legacyStructure='',legacyBulkWasOpen=false;
function setEditorView(view){
  if(!['legacy','canvas','map'].includes(view))return;
  const more=document.querySelector('.bulk-more');
  if(view==='legacy'&&editorView!=='legacy'){legacyBulkWasOpen=more.open;more.open=true;}
  else if(editorView==='legacy'&&view!=='legacy')more.open=legacyBulkWasOpen;
  editorView=view;if(view!=='legacy')advancedEditorView=view;
  selectedCategories.clear();selectedTiles=new Set([...selectedTiles].filter(i=>rows[i]&&(view==='map'||rows[i].category===category)));
  $('viewDescription').textContent=view==='map'?'See and organize the whole board.':'Arrange the current category.';
  closeMapMenu();render();
  try{localStorage.setItem('phraseboard_editor_view',view);}catch{}
}
function activateLegacyTile(index){
  selected=index;category=rows[index].category;
  if(!selectedTiles.has(index))selectedTiles=new Set([index]);
  selectedCategories.clear();renderInspector();renderBulk();
}
function legacyButton(text,action,label=text){const button=document.createElement('button');button.type='button';button.textContent=text;button.setAttribute('aria-label',label);button.onclick=action;return button;}
function legacyInput(field,value,change,label,type='text'){
  const input=document.createElement('input');input.type=type;input.value=value;input.dataset.field=field;input.setAttribute('aria-label',label);input.onchange=()=>change(input.value);return input;
}
function commitLegacyField(index,field,value){
  activateLegacyTile(index);$(field).value=value;$(field).dispatchEvent(new Event('change',{bubbles:true}));
}
function moveLegacyTile(index,direction){
  const items=rows.map((r,i)=>({r,i})).filter(x=>x.r.category===rows[index].category).sort((a,b)=>a.r.tileOrder-b.r.tileOrder);
  const from=items.findIndex(x=>x.i===index),to=from+direction;if(to<0||to>=items.length)return;
  snapshot();[items[from],items[to]]=[items[to],items[from]];items.forEach((x,i)=>x.r.tileOrder=i+1);render();
  $('canvas').querySelector('[data-index="'+index+'"]')?.focus({preventScroll:true});
}
function renderLegacyCanvas(){
  const canvas=$('canvas'),names=orderedCategories();
  const structure=JSON.stringify([category,rows.map((r,i)=>[i,r.category,r.categoryOrder,r.tileOrder])]);
  const rebuild=!canvas.classList.contains('legacy-canvas')||legacyStructure!==structure;
  canvas.className='legacy-canvas';Object.assign(canvas.style,{width:'100%',height:'auto',left:'',top:'',transform:''});
  $('canvasHint').textContent='Edit a row directly. Select checkboxes to change colors or move several tiles together.';
  if(rebuild){
    legacyStructure=structure;canvas.replaceChildren();
    names.forEach((name,categoryIndex)=>{
      const members=rows.map((r,index)=>({r,index})).filter(x=>x.r.category===name).sort((a,b)=>a.r.tileOrder-b.r.tileOrder);
      const card=document.createElement('details');card.className='legacy-category';card.dataset.category=name;card.open=name===category;
      const summary=document.createElement('summary');summary.textContent=name+' · '+members.length+' tiles';card.append(summary);
      card.addEventListener('toggle',()=>{if(card.isConnected&&editorView==='legacy'&&card.open&&category!==name)selectCategory(name);});
      if(name===category){
        const controls=document.createElement('div');controls.className='legacy-category-tools';
        const label=document.createElement('label');label.textContent='Category';label.append(legacyInput('categoryName',name,value=>{$('categoryName').value=value;$('categoryName').dispatchEvent(new Event('change',{bubbles:true}));},'Category name'));controls.append(label);
        const color=document.createElement('label');color.textContent='Category color';color.append(legacyInput('categoryColor',members[0].r.categoryColor,value=>{$('categoryColor').value=value;$('categoryColor').dispatchEvent(new Event('change',{bubbles:true}));},'Category color','color'));controls.append(color);
        controls.append(legacyButton('Category image',()=>document.querySelector('[data-symbol-target="category"]').click()),legacyButton('+ Tile',()=>$('addTile').click()));
        for(const direction of [-1,1]){const button=legacyButton(direction<0?'↑':'↓',()=>reorderCategories(new Set([name]),names[categoryIndex+direction],direction>0),direction<0?'Move category up':'Move category down');button.disabled=categoryIndex+direction<0||categoryIndex+direction>=names.length;controls.append(button);}
        controls.append(legacyButton('Delete category',()=>$('removeCategory').click()));card.append(controls);
        const scroll=document.createElement('div');scroll.className='legacy-table-scroll';
        const table=document.createElement('table'),head=document.createElement('thead'),heading=document.createElement('tr'),body=document.createElement('tbody');
        for(const text of ['Select','Label','Spoken text or media URL','Image','Color','Order / delete']){const th=document.createElement('th');th.scope='col';th.textContent=text;heading.append(th);}head.append(heading);table.append(head,body);
        members.forEach(({index},position)=>{
          const tr=document.createElement('tr');tr.className='legacy-row';tr.dataset.index=index;tr.tabIndex=-1;
          const cell=node=>{const td=document.createElement('td');td.append(node);tr.append(td);};
          const select=document.createElement('input');select.type='checkbox';select.className='legacy-select';select.setAttribute('aria-label','Select '+rows[index].display);select.onchange=()=>{if(select.checked)selectedTiles.add(index);else selectedTiles.delete(index);selected=[...selectedTiles][0]??-1;bulkSelectionChanged();};cell(select);
          for(const field of ['display','speak']){
            const input=legacyInput(field,rows[index][field],value=>commitLegacyField(index,field,value),(field==='display'?'Label':'Spoken text')+' for '+rows[index].display);
            input.addEventListener('input',()=>cancelJob('tile:'+index));cell(input);
          }
          const imageButton=legacyButton('Choose image',()=>{activateLegacyTile(index);document.querySelector('[data-symbol-target="tile"]').click();},'Image for '+rows[index].display);imageButton.className='legacy-image';cell(imageButton);
          cell(legacyInput('tileColor',rows[index].tileColor||rows[index].categoryColor,value=>commitLegacyField(index,'tileColor',value),'Color for '+rows[index].display,'color'));
          const actions=document.createElement('div');actions.className='legacy-row-actions';
          for(const direction of [-1,1]){const button=legacyButton(direction<0?'↑':'↓',()=>moveLegacyTile(index,direction),direction<0?'Move tile up':'Move tile down');button.disabled=position+direction<0||position+direction>=members.length;actions.append(button);}
          actions.append(legacyButton('Delete',()=>{activateLegacyTile(index);$('deleteTile').click();},'Delete '+rows[index].display));cell(actions);body.append(tr);
        });
        scroll.append(table);card.append(scroll);
      }
      canvas.append(card);
    });
  }
  // Keep inputs in place while typing or an automatic symbol lookup finishes.
  canvas.querySelectorAll('.legacy-row').forEach(tr=>{
    const r=rows[Number(tr.dataset.index)],checked=selectedTiles.has(Number(tr.dataset.index));
    tr.classList.toggle('selected',checked);tr.querySelector('.legacy-select').checked=checked;tr.querySelector('.legacy-select').setAttribute('aria-label','Select '+r.display);
    tr.style.setProperty('--tile-color',r.tileColor||r.categoryColor);
    tr.querySelectorAll('[data-field]').forEach(input=>{if(input!==document.activeElement)input.value=r[input.dataset.field]||(input.dataset.field==='tileColor'?r.categoryColor:'');});
    const button=tr.querySelector('.legacy-image');button.setAttribute('aria-label','Image for '+r.display);
    if(button.dataset.image!==r.image){button.dataset.image=r.image;button.replaceChildren();if(r.image){const img=document.createElement('img');img.src=r.image;img.alt='';button.append(img);}button.append(document.createTextNode(r.image?'Change image':'Choose image'));}
  });
  const color=canvas.querySelector('[data-field=categoryColor]');if(color&&color!==document.activeElement)color.value=catRows()[0].categoryColor;
}
window.addEventListener('DOMContentLoaded',()=>{
  const button=$('viewMenuButton'),menu=$('viewMenu');
  function close(focus=false){menu.hidden=true;button.setAttribute('aria-expanded','false');if(focus)button.focus();}
  function open(last=false){closeBoardMenu();closeMapMenu();menu.hidden=false;button.setAttribute('aria-expanded','true');menu.querySelectorAll('button')[last?1:0].focus();}
  button.onclick=()=>menu.hidden?open():close(true);
  button.onkeydown=e=>{if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();open(e.key==='ArrowUp');}};
  menu.onkeydown=e=>{const items=[...menu.querySelectorAll('button')],index=items.indexOf(document.activeElement);if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close(true);}else if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();items[e.key==='Home'?0:e.key==='End'?1:(index+1)%2].focus();}else if(e.key==='Tab')close(true);};
  document.addEventListener('pointerdown',e=>{if(!e.target.closest('#viewMenu,#viewMenuButton'))close();});
  document.addEventListener('focusin',e=>{if(!e.target.closest('#viewMenu,#viewMenuButton'))close();});
  $('simpleEditor').onclick=()=>{close(true);setEditorView('legacy');status('Basic editor: edit words, images, and colors in category rows.');};
  $('advancedEditor').onclick=()=>{close(true);setEditorView(advancedEditorView);status('Advanced editor: arrange tiles with Layout view or Graphic view.');};
  $('legacyAddCategory').onclick=()=>$('addCategory').click();
  try{const savedView=localStorage.getItem('phraseboard_editor_view');if(savedView)setEditorView(savedView);}catch{}
});
