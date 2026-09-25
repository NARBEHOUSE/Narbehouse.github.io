/** Portable, ordered creator campaigns. Independent of the single-castle library. */
RT.customCampaigns=(function(){
'use strict';const KEY='rt-ballista-campaigns',TYPE='ballista-campaign',MAX=12;
const uid=prefix=>prefix+'-'+(crypto.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));
const validId=(v,prefix)=>typeof v==='string'&&new RegExp('^'+prefix+'-[a-zA-Z0-9-]{1,80}$').test(v);
function validate(raw){
 if(!raw||raw.type!==TYPE||raw.version!==1)throw Error('Choose a Ballista campaign JSON file (version 1).');
 if(!Array.isArray(raw.levels)||!raw.levels.length||raw.levels.length>40)throw Error('A campaign needs 1–40 levels.');
 if(new TextEncoder().encode(JSON.stringify(raw)).length>1000000)throw Error('Keep a campaign below 1 MB.');
 const ids=new Set(),levels=raw.levels.map((entry,i)=>{if(!entry||!validId(entry.id,'stage')||ids.has(entry.id))throw Error('Each campaign level needs a unique stage ID.');ids.add(entry.id);try{return{id:entry.id,level:RT.courses.validate(entry.level)};}catch(e){throw Error('Level '+(i+1)+': '+e.message);}});
 if(!validId(raw.id,'custom'))throw Error('This campaign has an invalid ID.');
 return{type:TYPE,version:1,id:raw.id,name:String(raw.name||'My campaign').trim().slice(0,70)||'My campaign',description:String(raw.description||'').slice(0,160),story:String(raw.story||'').slice(0,600),ending:String(raw.ending||'').slice(0,600),levels};
}
function list(){let raw;try{raw=JSON.parse(localStorage.getItem(KEY)||'[]');}catch{return[];}return Array.isArray(raw)?raw.slice(0,MAX).flatMap(c=>{try{return[validate(c)];}catch{return[];}}):[];}
function revision(c){let h=2166136261;for(const ch of JSON.stringify(c.levels)){h=Math.imul(h^ch.charCodeAt(0),16777619);}return (h>>>0).toString(36);}
function register(c){
 if(RT.campaigns.find(c.id))return;
 const k={id:c.id,name:c.name,sub:c.description||'Workshop campaign',story:c.story||c.levels[0].level.story,ending:c.ending,custom:true,revision:revision(c),levels:[]};
 for(const [order,entry] of c.levels.entries()){
  const l=RT.courses.prepare(entry.level);Object.assign(l,{id:c.id+':'+entry.id,kingdomId:c.id,order,chapter:c.name+' · Level '+(order+1)+' of '+c.levels.length});
  if(order===c.levels.length-1&&c.ending)l.ending=c.ending;
  k.levels.push(RT.levels.LEVELS.length);RT.levels.LEVELS.push(l);
 }
 RT.campaigns.kingdoms.push(k);
}
function write(all){try{localStorage.setItem(KEY,JSON.stringify(all));}catch{throw Error('Campaign could not be saved. Free browser storage, or export a JSON copy.');}window.dispatchEvent(new Event('ballista-campaign-library-change'));}
function save(raw){const c=validate(raw),all=list(),i=all.findIndex(x=>x.id===c.id);if(i<0){if(all.length>=MAX)throw Error('The library holds 12 campaigns. Export and remove one first.');all.push(c);}else all[i]=c;write(all);return c;}
function create(level){return{type:TYPE,version:1,id:uid('custom'),name:'My campaign',description:'',story:'',ending:'',levels:[{id:uid('stage'),level:RT.courses.validate(level)}]};}
function importData(raw){const c=validate(raw),all=list(),same=all.find(x=>JSON.stringify(x)===JSON.stringify(c));if(same){register(same);return same;}if(all.some(x=>x.id===c.id)){c.id=uid('custom');c.name=(c.name+' (imported copy)').slice(0,70);}const saved=save(c);register(saved);return saved;}
function remove(id){write(list().filter(c=>c.id!==id));}
function download(raw){const c=validate(raw),url=URL.createObjectURL(new Blob([JSON.stringify(c,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=(c.name.replace(/[^a-z0-9]+/gi,'-')||'ballista-campaign')+'.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
for(const c of list())register(c);
return{list,save,create,validate,importData,remove,download,uid};
})();
