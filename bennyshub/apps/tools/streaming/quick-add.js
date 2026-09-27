(() => {
  const container=document.getElementById('starter-collections'),status=document.getElementById('quick-add-status');
  const dialog=document.getElementById('collection-preview'),list=document.getElementById('collection-titles');
  const add=document.getElementById('collection-add'),all=document.getElementById('collection-select-all');
  const search=document.getElementById('collection-search'),type=document.getElementById('collection-type');
  const collections=document.getElementById('quick-add-collections');
  // The surrounding original accordion uses a pixel height; track nested expansion.
  new ResizeObserver(()=>{const panel=collections.closest('.main-panel');if(panel.previousElementSibling.classList.contains('active'))panel.style.maxHeight=panel.scrollHeight+'px';}).observe(collections);
  let selectedPack,opener,busy=false;
  const colors={netflix:'#ff7184',disney:'#8da6ff',hulu:'#66e3a3',prime:'#65cdf2',tubi:'#fae173',youtube:'#ff9d99'};
  const summary=()=>{
    const boxes=[...list.querySelectorAll('input:not(:disabled)')],visible=boxes.filter(x=>!x.closest('label').hidden);
    const count=boxes.filter(x=>x.checked).length,visibleSelected=visible.filter(x=>x.checked).length,hidden=count-visibleSelected;
    document.getElementById('collection-summary').textContent=count+' new titles selected'+(hidden?' ('+hidden+' hidden by filters)':'')+'. Existing titles will stay unchanged.';
    add.disabled=busy||count===0;add.textContent='Add '+count+' selected titles';
    all.checked=visible.length>0&&visibleSelected===visible.length;all.indeterminate=visibleSelected>0&&visibleSelected<visible.length;all.disabled=visible.length===0;
  };
  const filter=()=>{
    const query=search.value.trim().toLocaleLowerCase();let shown=0;
    [...list.children].forEach((row,index)=>{const item=selectedPack.items[index];row.hidden=!item.title.toLocaleLowerCase().includes(query)||(!!type.value&&item.type!==type.value);if(!row.hidden)shown++;});
    document.getElementById('collection-filter-count').textContent=shown+' of '+selectedPack.items.length+' titles shown.'+(shown===0?' Try a different search or type.':'');summary();
  };
  async function preview(pack,button){
    if(busy)return;busy=true;button.disabled=true;status.textContent='Loading '+pack.service+' collection…';
    try{
      const response=await fetch('collections/'+pack.file);if(!response.ok)throw Error('This collection could not be loaded. Reconnect and try again.');
      const data=await response.json();
      const items=WebStreaming.library(data.library);
      for(const item of items){const u=new URL(item.url);if(u.protocol!=='https:'||u.username||u.password||u.port||!pack.hosts.includes(u.hostname))throw Error('This collection contains an unexpected link. No titles were added.');}
      selectedPack={...pack,items};opener=button;
      const existing=await WebStreaming.getData();
      document.getElementById('collection-title').textContent=pack.service+' starter collection';
      document.getElementById('collection-description').textContent=data.description+' Public title links reviewed '+data.checkedDate+'. Sign-in and availability depend on your country and plan; playback is not guaranteed. '+pack.access;
      list.replaceChildren();
      items.forEach((item,index)=>{const label=document.createElement('label'),input=document.createElement('input'),text=document.createElement('span'),detail=document.createElement('small');input.type='checkbox';input.value=index;input.disabled=!!StreamingLibraryMerge.duplicate(existing,item.url);input.checked=!input.disabled;text.textContent=item.title;detail.textContent=(item.type==='shows'?'Series':item.type==='video'?'Short film':'Movie')+(item.year?' · '+item.year:'')+(item.entryEpisodeTitle?' ? Starts with '+item.entryEpisodeTitle:'')+(input.disabled?' · Already in your library':'');text.append(detail);label.append(input,text);list.append(label);});
      status.textContent='';busy=false;search.value='';type.value='';filter();dialog.showModal();
    }catch(error){status.textContent=error.message;}finally{busy=false;button.disabled=false;}
  }
  search.oninput=filter;type.onchange=filter;
  list.onchange=summary;all.onchange=()=>{list.querySelectorAll('label:not([hidden]) input:not(:disabled)').forEach(x=>x.checked=all.checked);summary();};
  document.getElementById('collection-clear').onclick=()=>{list.querySelectorAll('input').forEach(x=>x.checked=false);summary();};
  document.getElementById('collection-close').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>opener?.focus());
  add.onclick=async()=>{
    if(busy||!selectedPack)return;busy=true;summary();
    const items=[...list.querySelectorAll('input:checked:not(:disabled)')].map(x=>selectedPack.items[Number(x.value)]);
    try{
      const result=await WebStreaming.addData(items);await fetchData();
      document.getElementById('table-search').value='';renderTable();
      const table=document.getElementById('data-table'),panel=table.closest('.main-panel');panel.style.maxHeight='none';panel.style.overflow='visible';panel.previousElementSibling.classList.add('active');
      dialog.close();status.textContent='Added '+result.added+' '+selectedPack.service+' titles. Skipped '+result.skipped+' matching links. Your library now has '+result.items.length+' titles.';
      table.scrollIntoView({behavior:'smooth',block:'start'});
      if(result.added>1)remindStreamingBackup();
    }catch(error){document.getElementById('collection-summary').textContent=error.message;}finally{busy=false;add.disabled=false;}
  };
  fetch('collections/index.json').then(r=>{if(!r.ok)throw Error('Starter collections are unavailable. You can still add titles or import your own JSON.');return r.json();}).then(data=>{
    for(const pack of data.collections){
      const card=document.createElement('article'),heading=document.createElement('h3'),count=document.createElement('p'),note=document.createElement('small'),button=document.createElement('button'),download=document.createElement('a');
      card.className='collection-card';card.style.setProperty('--service-color',colors[pack.id]);heading.textContent=pack.service;count.textContent=pack.count+' titles · '+pack.label;note.textContent=pack.access;
      button.className='btn btn-primary';button.textContent='Preview & quick add';button.setAttribute('aria-label','Preview '+pack.service+' starter collection');button.onclick=()=>preview(pack,button);
      download.href='collections/'+pack.file;download.download=pack.file;download.textContent='Download collection JSON';card.append(heading,count,note,button,download);container.append(card);
    }
  }).catch(error=>status.textContent=error.message);
})();
