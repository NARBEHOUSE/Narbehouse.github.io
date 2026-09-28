'use strict';
// Defaults are fetched as templates. Only an explicit Save changes local storage.
(() => {
  const dialog=$('defaultBoardsDialog'),choice=$('defaultBoardChoice'),name=$('defaultBoardName'),create=$('createDefaultCopy'),message=$('defaultBoardStatus'),retry=$('retryDefaultBoards');
  let templates=[],prepared=null,controller=null,requestVersion=0;
  const label=file=>file.replace(/\.csv$/i,'').replace(/_/g,' ');
  function beginRequest(){
    controller?.abort();controller=new AbortController();
    const active=controller,version=++requestVersion;
    const timer=setTimeout(()=>active.abort(),15000);
    return {signal:active.signal,current:()=>dialog.open&&version===requestVersion,finish:()=>clearTimeout(timer)};
  }
  function resetPreparation(){prepared=null;name.value='';name.disabled=true;create.disabled=true;retry.hidden=true;}
  async function prepareBoard(){
    resetPreparation();
    const file=choice.value;if(!templates.includes(file))return;
    const request=beginRequest();message.textContent='Loading '+label(file)+'…';
    try {
      const response=await fetch('boards/'+encodeURIComponent(file),{signal:request.signal,cache:'no-cache'});
      if(!response.ok)throw Error('Board download failed');
      const loaded=PB.parse(await response.text());
      if(!loaded.length)throw Error('No tiles in this board');
      if(!request.current())return;
      prepared=loaded;name.value='My '+(loaded[0].boardName||label(file));name.disabled=false;create.disabled=false;
      message.textContent=loaded.length.toLocaleString()+' tiles · '+new Set(loaded.map(r=>r.category)).size+' categories. Words, images, and media links will be copied.';
    }catch(error){
      if(!request.current())return;
      message.textContent='Could not load this board. Check your connection and try again. Your current board is unchanged.';retry.hidden=false;
    }finally{request.finish();}
  }
  async function loadCatalogue(){
    resetPreparation();templates=[];choice.replaceChildren();choice.disabled=true;
    const request=beginRequest();message.textContent='Loading default boards…';
    try {
      const response=await fetch('boards/index.json',{signal:request.signal,cache:'no-cache'});
      if(!response.ok)throw Error('Board list download failed');
      const catalogue=await response.json();
      if(!request.current())return;
      templates=[...new Set((Array.isArray(catalogue.files)?catalogue.files:[]).filter(file=>typeof file==='string'&&/^[a-z0-9][a-z0-9 _-]*\.csv$/i.test(file)))];
      if(!templates.length)throw Error('No default boards available');
      for(const file of templates){const option=document.createElement('option');option.value=file;option.textContent=label(file);choice.append(option);}
      choice.disabled=false;choice.focus();await prepareBoard();
    }catch(error){
      if(!request.current())return;
      message.textContent='Could not load the default board list. Check your connection and try again. Your current board is unchanged.';retry.hidden=false;
    }finally{request.finish();}
  }
  $('openDefaultBoards').onclick=()=>{closeBoardMenu();dialog.showModal();loadCatalogue();};
  choice.onchange=prepareBoard;
  name.oninput=()=>{create.disabled=!prepared||!name.value.trim();};
  retry.onclick=()=>templates.length?prepareBoard():loadCatalogue();
  $('cancelDefaultBoards').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>{requestVersion++;controller?.abort();prepared=null;boardMenuButton.focus();});
  $('defaultBoardsForm').onsubmit=event=>{
    event.preventDefault();if(!prepared||!name.value.trim()||!mayDiscard())return;
    const personalName=name.value.trim(),source=label(choice.value);
    snapshot();rows=PB.normalize(prepared.map(row=>({...row,boardName:personalName})));selectedCategories.clear();
    if(editorView==='map')mapNeedsFit=true;
    selectCategory(rows[0].category);dialog.close();
    status('Created “'+personalName+'” from '+source+'. Edit your copy, then Save or Download CSV. Undo returns to your previous board.');
  };
})();
