// Separate custom-voice backend: standard and Faster workers keep their caches.
import {createPocket} from './communication-pocket.js';
let active=null,queue=Promise.resolve();
const cache=new Map();let cacheBytes=0;
const engine=createPocket(progress=>{if(active)postMessage({id:active.id,progress});});
function remember(key,samples){
  if(samples.byteLength>8*1024*1024)return;
  if(cache.has(key)){cacheBytes-=cache.get(key).byteLength;cache.delete(key);}
  while(cache.size&&(cache.size>=32||cacheBytes+samples.byteLength>16*1024*1024)){
    const oldest=cache.keys().next().value;cacheBytes-=cache.get(oldest).byteLength;cache.delete(oldest);
  }
  cache.set(key,samples.slice());cacheBytes+=samples.byteLength;
}
self.onmessage=({data:m})=>{
  if(m.type==='prefetch')return; // Custom generation is deliberate, never speculative.
  if(m.type==='cancel'){if(active?.id===m.id)active=null;return;}
  if(!['prepare',undefined].includes(m.type))return;
  const request=active=m,current=()=>active===request;
  queue=queue.catch(()=>{}).then(async()=>{
    if(!current()){postMessage({id:m.id,cancelled:true});return;}
    try{
      const text=String(m.text||'').trim(),names=Array.isArray(m.names)?m.names:[];
      if(!text)throw Error('Enter a message before speaking.');
      const key=JSON.stringify([m.voice,names,text]);let samples=cache.get(key);
      if(!samples){
        const audio=await engine.generate(text,{voice:m.voice,names,isCurrent:current});
        if(!current()||!audio.audio){postMessage({id:m.id,cancelled:true});return;}
        samples=audio.audio;remember(key,samples);
      }
      if(m.type==='prepare')postMessage({id:m.id,ready:true});
      else {samples=samples.slice();postMessage({id:m.id,samples,sampleRate:24000},[samples.buffer]);}
    }catch(e){if(current())postMessage({id:m.id,error:e.message||'The custom voice could not speak.'});}
  });
};
