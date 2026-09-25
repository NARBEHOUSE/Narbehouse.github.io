/** Shared, bounded JSON format for creator castles. No executable imports. */
RT.courses=(function(){'use strict';const KEY='ballista-castles',MAX_BYTES=1000000,MAX_CASTLES=40;
function validate(raw){if(!raw||typeof raw!=='object')throw Error('Choose a castle JSON object.');const layers=raw.layers;if(!Array.isArray(layers)||!layers.length||layers.length>24)throw Error('Use 1–24 depth layers.');let cells=0,crowns=0,princesses=0;for(const layer of layers){if(!Array.isArray(layer)||!layer.length||layer.length>24)throw Error('Each layer needs 1–24 rows.');for(const row of layer){if(typeof row!=='string'||!row.length||row.length>32)throw Error('Rows must contain 1–32 cells.');for(const ch of row){if(ch!=='.'&&ch!==' '&&!RT.data.MAT[ch])throw Error('Unknown block: '+ch);if(ch==='K')crowns++;if(RT.data.MAT[ch]?.protected)princesses++;if(ch!=='.'&&ch!==' ')cells++;}}}if(raw.objective && !['clear','rescue'].includes(raw.objective))throw Error('Choose a valid objective.');if(raw.objective==='rescue'&&!princesses)throw Error('Rescue levels need at least one character to protect (princess, villager, fisher, healer or merchant).');if(cells>1000)throw Error('Keep the castle below 1,000 filled cells.');const n=(key,min,max,def)=>{const v=raw[key]===undefined?def:Number(raw[key]);if(!Number.isFinite(v)||v<min||v>max)throw Error(key+' must be between '+min+' and '+max+'.');return v;};const l={name:String(raw.name||'My Castle').slice(0,70),dist:n('dist',18,32,24),par:Math.round(n('par',1,99,3)),bolts:Math.round(n('bolts',1,99,9)),layers:layers.map(a=>a.slice())};l.goals=RT.levelBrief.validateGoals(raw);l.moat=raw.moat===true;l.environment=RT.scenery.validate(raw.environment);l.patrols=RT.characterPaths.validate(raw.patrols,layers);l.cutscene=raw.cutscene===true;l.narrator=narrator(raw.narrator);l.story=String(raw.story||'').slice(0,600);l.ending=String(raw.ending||'').slice(0,600);l.objective=raw.objective==='rescue'?'rescue':'clear';if(raw.ammo){if(!Array.isArray(raw.ammo)||!raw.ammo.length||raw.ammo.some(id=>!RT.data.AMMO.some(a=>a.id===id)))throw Error('Choose valid ammunition.');l.ammo=[...new Set(raw.ammo)];if(!l.ammo.some(id=>RT.data.AMMO.find(a=>a.id===id).limit==null))throw Error('Include ammunition without a use limit.');}return l;}
function narrator(raw){if(raw!=null&&(typeof raw!=='object'||Array.isArray(raw)))throw Error('Choose a valid narrator.');const style=raw?.style||'rowan';if(!['rowan','elder','woman'].includes(style))throw Error('Choose Rowan, older man or woman for the narrator.');return{name:String(raw?.name||'Rowan').trim().slice(0,40)||'Rowan',style};}
function list(){const raw=RT.util.load(KEY,[]);if(!Array.isArray(raw))return[];return raw.slice(0,40).flatMap(it=>{try{return[{id:String(it.id),level:validate(it.level)}];}catch{return[];}});}
function save(raw,id){const level=validate(raw),all=list();let item=all.find(i=>i.id===id);if(item)item.level=level;else{if(all.length>=40)throw Error('The library holds 40 castles. Export a course before replacing a saved castle.');item={id:'castle-'+Date.now().toString(36)+'-'+(crypto.randomUUID?.()||Math.random().toString(36).slice(2)),level};all.push(item);}write(all);return item;}
function prepare(raw){const l=validate(raw),p=RT.levels.parseLevel(l);l._cols=p.cols;l._rows=p.rows;l._depth=p.numLayers;let top=0,minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;for(const b of p.blocks){top=Math.max(top,b.y+b.h/2);minX=Math.min(minX,b.x-b.w/2);maxX=Math.max(maxX,b.x+b.w/2);minZ=Math.min(minZ,b.z-b.d/2);maxZ=Math.max(maxZ,b.z+b.d/2);}l._extent=Math.max(maxX-minX,maxZ-minZ,top);l._centre={x:(minX+maxX)/2,y:top/2,z:(minZ+maxZ)/2};return l;}

function write(items){
  try{localStorage.setItem('rt-'+KEY,JSON.stringify(items));}
  catch{throw Error('Your browser could not save this library. Free some browser storage or allow site storage, then try again.');}
  window.dispatchEvent(new Event('ballista-library-change'));
}
function decode(raw){
  if(raw?.type==='ballista-campaign')throw Error('This is a campaign. Use Import JSON or link to keep its level order.');
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Choose a castle or castle collection JSON file.');
  if(raw.version!==undefined&&raw.version!==1)throw Error('This file uses an unsupported castle format version.');
  const levels=raw.levels!==undefined?raw.levels:[raw.level||raw];
  if(!Array.isArray(levels)||!levels.length||levels.length>MAX_CASTLES)throw Error('A collection needs 1–40 castles.');
  return levels.map(validate);
}
function importData(raw){
  const valid=decode(raw),all=list(),saved=[],known=new Map(all.map(it=>[JSON.stringify(it.level),it]));
  for(const level of valid){
    const key=JSON.stringify(level);let item=known.get(key);
    if(!item){item={id:'castle-'+Date.now().toString(36)+'-'+(crypto.randomUUID?.()||Math.random().toString(36).slice(2)),level};all.push(item);known.set(key,item);}
    saved.push(item);
  }
  if(all.length>MAX_CASTLES)throw Error('The library holds 40 castles. Export and remove a saved castle before importing more.');
  write(all);return saved;
}
function parse(text){
  if(new TextEncoder().encode(text).length>MAX_BYTES)throw Error('Choose a JSON file smaller than 1 MB.');
  let raw;try{raw=JSON.parse(text);}catch{throw Error('This is not valid JSON. Use a downloaded castle file or a direct JSON link.');}
  return raw?.type==='ballista-campaign'?RT.customCampaigns.validate(raw):{version:1,levels:decode(raw)};
}
async function readFile(file){
  if(!file||file.size>MAX_BYTES)throw Error('Choose a JSON file smaller than 1 MB.');
  return parse(await file.text());
}
async function readURL(value,{signal}={}){
  let url;try{url=new URL(value);}catch{throw Error('Enter a full HTTPS link to the JSON file.');}
  if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw Error('Use an HTTP or HTTPS link without a username or password.');
  if(location.protocol==='https:'&&url.protocol!=='https:')throw Error('Use an HTTPS link on this site.');
  const controller=new AbortController(),cancel=()=>controller.abort();signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)controller.abort();
  const timer=setTimeout(cancel,20000);
  try{
    const response=await fetch(url.href,{signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer'});
    if(!response.ok)throw Error('The link returned HTTP '+response.status+'. Check that the JSON file is shared publicly.');
    if(Number(response.headers.get('content-length'))>MAX_BYTES)throw Error('Choose a JSON file smaller than 1 MB.');
    const reader=response.body?.getReader();let text='';
    if(reader){const decoder=new TextDecoder();let bytes=0;while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>MAX_BYTES){await reader.cancel();throw Error('Choose a JSON file smaller than 1 MB.');}text+=decoder.decode(part.value,{stream:true});}text+=decoder.decode();}
    else text=await response.text();
    return parse(text);
  }catch(error){
    if(controller.signal.aborted)throw Error(signal?.aborted?'Import cancelled.':'The link took too long. Try again or import the downloaded JSON file.');
    if(error instanceof TypeError)throw Error('Cannot read this link. Use a direct public JSON link that allows browser access, or download the file and import it.');
    throw error;
  }finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
}
function remove(id){write(list().filter(it=>it.id!==id));}
function download(levels,name='ballista-castles.json'){
  const valid=levels.map(validate);if(!valid.length)throw Error('Save a castle before exporting your library.');
  const data=valid.length===1?{version:1,level:valid[0]}:{version:1,levels:valid};
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
return{validate,narrator,list,save,prepare,decode,importData,readFile,readURL,remove,download};})();
