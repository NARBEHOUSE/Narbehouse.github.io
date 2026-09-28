'use strict';
// Restore the original OpenSymbols workflow while keeping custom image URLs authoritative.
let imageTarget=null,searchController=null,searchVersion=0;
const imageJobs=new Map();
const imageUrl=value=>/^(https?:\/\/|data:image\/|blob:|\.?\.?\/)/i.test(value.trim());
const symbolKey=value=>String(value||'').toLowerCase().replace(/[^\p{L}\p{N} ]/gu,'').replace(/^to /,'').replace(/ (?:\d+|verb|noun)$/,'').replace(/\s+/g,' ').trim();
// Bundled OpenSymbols matches make common words work without another external lookup.
const symbolCatalog=Promise.all([
  fetch('boards/opensymbols-attribution.json').then(r=>r.ok?r.json():{}).catch(()=>({})),
  fetch('boards/NARBE_Words.csv').then(r=>r.ok?r.text():'').catch(()=>'')
]).then(([metadata,csv])=>{
  const entries=Object.values(metadata.symbols||{});
  for(const row of PB.parse(csv)){if(row.image&&!entries.some(s=>(s.query||s.name).toLowerCase()===(row.speak||row.display).toLowerCase()))entries.push({name:row.speak||row.display,image_url:row.image});}
  return entries;
});
try{$('autoSymbols').checked=localStorage.getItem('phraseboard_auto_symbols')!=='false';}catch{}
function targetFor(kind){
  if(kind==='board'){
    const name=rows[0]?.boardName||'';
    return {kind,id:'board',query:name,field:'boardImage',matches:()=>rows[0]?.boardName===name,get:()=>rows[0]?.boardImage||'',set:url=>rows.forEach(r=>r.boardImage=url)};
  }
  if(kind==='category'){
    const name=category;
    return {kind,id:'category:'+name,query:name,field:'categoryImage',matches:()=>rows.some(r=>r.category===name),get:()=>rows.find(r=>r.category===name)?.categoryImage||'',set:url=>rows.filter(r=>r.category===name).forEach(r=>r.categoryImage=url)};
  }
  const index=selected,r=rows[index];if(!r)return null;
  const stamp=JSON.stringify([r.category,r.display,r.speak]);
  const query=/^https?:/i.test(r.speak)?r.display:(r.speak||r.display);
  return {kind,id:'tile:'+index,query,field:'image',matches:()=>JSON.stringify([rows[index]?.category,rows[index]?.display,rows[index]?.speak])===stamp,get:()=>rows[index]?.image||'',set:url=>{rows[index].image=url;},index};
}
async function findSymbols(query,signal,preferCached=false){
  const cached=(await symbolCatalog).filter(item=>(item.query||item.name||'').toLowerCase().trim()===query.toLowerCase().trim());
  if(preferCached&&cached.length)return cached;
  const endpoint=new URL('https://www.opensymbols.org/api/v1/symbols/search');endpoint.searchParams.set('q',query);endpoint.searchParams.set('format','json');endpoint.searchParams.set('limit','24');
  try{
    const response=await fetch(endpoint.href,{signal});if(!response.ok)throw Error('OpenSymbols search is unavailable. You can still paste any image URL.');
    const data=await response.json();if(!Array.isArray(data))throw Error('OpenSymbols returned an unreadable response. You can still use an image URL.');
    const found=data.filter(item=>!item.unsafe_result&&typeof item.image_url==='string'&&imageUrl(item.image_url));
    if(preferCached)return found.filter(item=>symbolKey(item.name)===symbolKey(query));
    return [...found,...cached.filter(item=>!found.some(s=>s.image_url===item.image_url))].slice(0,24);
  }catch(error){if(cached.length)return cached;throw error;}
}
function setImage(target,url){
  if(!target?.matches())return false;
  snapshot();target.set(url);render();return true;
}
function cancelJob(id){const job=imageJobs.get(id);if(!job)return;clearTimeout(job.timer);job.controller.abort();job.finish();imageJobs.delete(id);}
function cancelAllImages(){for(const id of [...imageJobs.keys()])cancelJob(id);}
function scheduleImage(kind){
  const target=targetFor(kind);if(!target)return;cancelJob(target.id);
  if(!$('autoSymbols').checked||target.get()||!target.query.trim())return;
  const controller=new AbortController();let done,started=false;
  const promise=new Promise(resolve=>done=resolve);
  const job={controller,promise,finish:done,run:async()=>{
    if(started)return promise;started=true;clearTimeout(job.timer);
    const timeout=setTimeout(()=>controller.abort(),7000);
    try{
      const symbols=await findSymbols(target.query,controller.signal,true);
      // A custom URL typed while the search runs must never be overwritten, even before blur.
      const fieldIsCurrent=target.kind!=='tile'||selected===target.index;
      const typedUrl=fieldIsCurrent?$(target.field).value.trim():'';
      if(!controller.signal.aborted&&symbols.length&&target.matches()&&!target.get()&&!typedUrl){setImage(target,symbols[0].image_url);$('imageStatus').textContent='OpenSymbols image added for “'+target.query+'”. You can choose another symbol or paste an image URL.';}
      else if(!symbols.length&&!controller.signal.aborted)$('imageStatus').textContent='No symbol found for “'+target.query+'”. Try a shorter search or paste an image URL.';
    }catch(error){if(!controller.signal.aborted)$('imageStatus').textContent=error.message;}
    finally{clearTimeout(timeout);if(imageJobs.get(target.id)===job)imageJobs.delete(target.id);done();}
  }};
  job.timer=setTimeout(job.run,450);imageJobs.set(target.id,job);
}
for(const [id,kind]of [['display','tile'],['speak','tile'],['categoryName','category'],['boardName','board']]){
  // Existing editor handlers commit text before this listener requests the corresponding image.
  $(id).addEventListener('change',()=>scheduleImage(kind));
  $(id).addEventListener('input',()=>{const t=targetFor(kind);if(t)cancelJob(t.id);});
}
for(const [id,kind]of [['image','tile'],['categoryImage','category'],['boardImage','board']])$(id).addEventListener('input',()=>{const t=targetFor(kind);if(t)cancelJob(t.id);});
$('autoSymbols').onchange=()=>{try{localStorage.setItem('phraseboard_auto_symbols',String($('autoSymbols').checked));}catch{}if(!$('autoSymbols').checked)cancelAllImages();};
async function flushImages(){const jobs=[...imageJobs.values()];jobs.forEach(job=>job.run());await Promise.all(jobs.map(job=>job.promise));}
for(const id of ['save','preview']){
  const action=$(id).onclick;$(id).onclick=null;
  $(id).addEventListener('click',async()=>{const button=$(id);button.disabled=true;try{await flushImages();await action();}finally{button.disabled=false;}});
}
for(const id of ['new','import','reload','restore','undo','deleteTile','removeCategory'])$(id).addEventListener('click',cancelAllImages,{capture:true});
document.querySelectorAll('[data-symbol-target]').forEach(button=>button.onclick=()=>{
  imageTarget=targetFor(button.dataset.symbolTarget);if(!imageTarget)return;
  $('symbolQuery').value=imageTarget.query;$('symbolUrl').value=imageTarget.get();$('symbolResults').replaceChildren();$('symbolStatus').textContent='Search for a symbol, or paste an image URL below.';
  $('symbolDialog').showModal();if(imageTarget.query.trim())searchSymbols();$('symbolQuery').focus();
});
async function searchSymbols(){
  searchController?.abort();searchController=new AbortController();const version=++searchVersion;
  const query=$('symbolQuery').value.trim();if(!query)return;
  $('symbolStatus').textContent='Searching OpenSymbols…';$('symbolResults').replaceChildren();
  const timeout=setTimeout(()=>searchController?.abort(),10000);
  try{
    const symbols=await findSymbols(query,searchController.signal);if(version!==searchVersion)return;
    $('symbolStatus').textContent=symbols.length?'Select an image to use it.':'No symbols found. Try a different word or use any image URL.';
    symbols.forEach(symbol=>{
      const card=document.createElement('div'),button=document.createElement('button'),img=document.createElement('img');
      button.type='button';img.width=88;img.height=88;img.src=symbol.image_url;img.alt=symbol.name||query;button.append(img);button.setAttribute('aria-label','Use '+(symbol.name||query));
      button.onclick=()=>{if(setImage(imageTarget,symbol.image_url)){closeSymbols();status('Symbol image selected. Save when ready.');}else $('symbolStatus').textContent='That tile changed. Close and open image search again.';};
      card.append(button);
      const caption=document.createElement('small');caption.textContent=symbol.name||query;card.append(caption);
      const source=symbol.source_url||symbol.source||'';
      const note=document.createElement('small');note.textContent=[symbol.author||'',symbol.license||symbol.license_url||''].filter(s=>typeof s==='string'&&s).join(' · ');card.append(note);
      if(typeof source==='string'&&/^https?:\/\//i.test(source)){const link=document.createElement('a');link.href=source;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Source / license';card.append(link);}
      $('symbolResults').append(card);
    });
  }catch(error){if(version===searchVersion)$('symbolStatus').textContent=error.name==='AbortError'?'Search timed out. Try again or paste an image URL.':error.message;}
  finally{clearTimeout(timeout);}
}
$('symbolSearchForm').onsubmit=event=>{event.preventDefault();searchSymbols();};
$('applyImageUrl').onclick=()=>{const url=$('symbolUrl').value.trim();if(url&&!imageUrl(url)){$('symbolStatus').textContent='Enter an http(s), image data, or relative image URL.';return;}if(setImage(imageTarget,url)){closeSymbols();status('Image URL applied. Save when ready.');}};
function closeSymbols(){searchVersion++;searchController?.abort();$('symbolDialog').close();imageTarget=null;}
$('closeSymbols').onclick=closeSymbols;$('symbolDialog').addEventListener('cancel',event=>{event.preventDefault();closeSymbols();});
const inspectorBeforeImages=renderInspector;
renderInspector=function(){inspectorBeforeImages();const image=rows[selected]?.image||'';$('tileImagePreview').hidden=!image;if(image)$('tileImagePreview').src=image;else $('tileImagePreview').removeAttribute('src');};
render();window.addEventListener('pagehide',cancelAllImages);
