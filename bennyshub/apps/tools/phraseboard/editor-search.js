'use strict';
const searchInput=$('boardSearch'),searchResults=$('boardSearchResults'),searchList=$('boardSearchList');
const searchKey=text=>String(text||'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().trim();
function closeBoardSearch(){searchResults.hidden=true;searchInput.setAttribute('aria-expanded','false');}
function refreshBoardSearch(){
  const query=searchKey(searchInput.value);searchList.replaceChildren();
  const missingOnly=$('searchMissingImages').checked;
  if(!query&&!missingOnly){closeBoardSearch();return;}
  const matches=rows.map((r,index)=>{
    const texts=[r.display,r.speak].map(searchKey),exact=texts.includes(query),word=texts.some(text=>text.split(/[^\p{L}\p{N}'-]+/u).includes(query));
    return {r,index,score:exact?0:word?1:2,found:texts.some(text=>text.includes(query))};
  }).filter(x=>x.found&&(!missingOnly||!x.r.image)).sort((a,b)=>a.score-b.score||a.r.categoryOrder-b.r.categoryOrder||a.r.tileOrder-b.r.tileOrder);
  const exact=matches.filter(x=>x.score===0).length;
  $('boardSearchStatus').textContent=!query&&missingOnly?matches.length+' tiles need an image. Select a tile to review.':matches.length?(exact?exact+' exact match'+(exact===1?'':'es')+'. ':'No exact tile label or spoken text. ')+matches.length+' matching tile'+(matches.length===1?'':'s')+' across the board.':'No matching words or phrases in this board.';
  for(const {r,index,score} of matches){const button=document.createElement('button');button.type='button';button.className='word-search-result';const title=document.createElement('strong'),detail=document.createElement('small');title.textContent=r.display||r.speak;detail.textContent=r.category+(score===0?' · exact match':'')+(r.speak&&r.speak!==r.display?' · '+r.speak:'');button.append(title,detail);button.onclick=()=>{
      category=rows[index].category;selected=index;selectedTiles=new Set([index]);selectedCategories.clear();render();closeBoardSearch();
      const node=$('canvas').querySelector('[data-index="'+index+'"]');
      if(editorView==='map'){
        setMapZoom(Math.max(.85,mapZoom));const viewport=document.querySelector('.canvas-scroll'),rect=viewport.getBoundingClientRect(),box=node.getBoundingClientRect(),panel=mapDetailsVisible?290:0;
        viewport.scrollLeft+=box.left+box.width/2-rect.left-(viewport.clientWidth-panel)/2;
        viewport.scrollTop+=box.top+box.height/2-rect.top-viewport.clientHeight/2;
      }else node.scrollIntoView({block:'nearest',inline:'nearest'});
      node.focus({preventScroll:true});status('Found “'+(rows[index].display||rows[index].speak)+'” in '+category+'.');
    };searchList.append(button);}
  searchResults.hidden=false;searchInput.setAttribute('aria-expanded','true');
}
searchInput.addEventListener('input',refreshBoardSearch);
searchInput.addEventListener('focus',()=>{if(searchInput.value||$('searchMissingImages').checked)refreshBoardSearch();});
searchInput.addEventListener('keydown',e=>{if(e.key==='Enter'&&searchList.firstElementChild){e.preventDefault();searchList.firstElementChild.click();}else if(e.key==='ArrowDown'&&searchList.firstElementChild){e.preventDefault();searchList.firstElementChild.focus();}else if(e.key==='Escape'){e.preventDefault();closeBoardSearch();}});
searchResults.addEventListener('keydown',e=>{
  const buttons=[...searchList.querySelectorAll('button')],index=buttons.indexOf(document.activeElement);
  if(e.key==='Escape'){e.preventDefault();searchInput.focus();closeBoardSearch();}
  else if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();const next=index+(e.key==='ArrowDown'?1:-1);if(next<0)searchInput.focus();else buttons[Math.min(next,buttons.length-1)]?.focus();}
});
document.addEventListener('pointerdown',e=>{if(!e.target.closest('.board-search'))closeBoardSearch();});
document.addEventListener('focusin',e=>{if(!e.target.closest('.board-search'))closeBoardSearch();});

$('searchMissingImages').onchange=refreshBoardSearch;
$('reviewMissingImages').onclick=()=>{$('boardOptions').close();requestAnimationFrame(()=>{searchInput.value='';$('searchMissingImages').checked=true;searchInput.focus();refreshBoardSearch();});};
