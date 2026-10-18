// Loaded only for an explicit communication/test action with Speaker Mode on.
import {KokoroTTS,env} from './communication-vendor/kokoro.web.js';
env.wasmPaths=new URL('./communication-vendor/',import.meta.url).href;
let engine,loading,backend,fallbackReason,latest=0,latestPreparation,queue=Promise.resolve();
const cache=new Map();let cacheBytes=0;
let foreground=0,warmup=[],warmVoice='',warmRevision=0,warmTimer;
function cached(key){const value=cache.get(key);if(value){cache.delete(key);cache.set(key,value);}return value;}
function enqueue(task){
  foreground++;
  queue=queue.catch(()=>{}).then(task).finally(()=>{foreground--;scheduleWarmup();});
}
// Prepare only a bounded set of short visible phrases. Queue one at a time so
// a selection waits for at most the phrase already being generated, never a batch.
function scheduleWarmup(){
  clearTimeout(warmTimer);
  if(foreground||!engine||!warmup.length)return;
  warmTimer=setTimeout(()=>{
    if(foreground||!engine)return;
    let text;
    while(warmup.length){text=warmup.shift();if(!cache.has(warmVoice+'|'+text))break;text=null;}
    if(!text)return;
    const voice=warmVoice,revision=warmRevision,key=voice+'|'+text;
    queue=queue.catch(()=>{}).then(async()=>{
      if(revision!==warmRevision)return;
      if(foreground){warmup.unshift(text);return;}
      const audio=await engine.generate(text,{voice});
      // Completed audio is reusable even if the page changed while generating.
      // Background preparation never plays audio or changes the speech status.
      remember(key,audio.audio);
      postMessage({prefetched:true,text,voice});
    }).catch(()=>{}).finally(scheduleWarmup);
  },80);
}
function remember(key,samples){
  if(samples.byteLength>8*1024*1024)return;
  if(cache.has(key)){cacheBytes-=cache.get(key).byteLength;cache.delete(key);}
  while(cache.size&&(cache.size>=32||cacheBytes+samples.byteLength>16*1024*1024)){const first=cache.keys().next().value;cacheBytes-=cache.get(first).byteLength;cache.delete(first);}
  cache.set(key,samples.slice());cacheBytes+=samples.byteLength;
}
async function load(){
  if(engine)return engine;
  if(!loading)loading=(async()=>{
    let fast=false;
    try{const adapter=await navigator.gpu?.requestAdapter();if(adapter&&!adapter.info?.isFallbackAdapter){const device=await adapter.requestDevice();device.destroy();fast=true;}}catch(e){fallbackReason=e.message||String(e);}
    const progress_callback=p=>{
      if(p.progress!=null)postMessage({progress:'Loading local voice: '+Math.round(p.progress)+'%'});
    };
    try{backend=fast?'webgpu':'wasm';return await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX',{dtype:fast?'fp32':'q8',device:backend,progress_callback});}
    catch(e){if(!fast)throw e;fallbackReason=e.message;backend='wasm';return KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX',{dtype:'q8',device:'wasm',progress_callback});}
  })().then(model=>engine=model).catch(e=>{loading=null;throw e;});
  return loading;
}
// Small chunks prevent Kokoro's tokenizer from silently truncating long messages.
// Concatenate the complete result before playback; insert Bluetooth silence once.
function chunks(text){
  const words=text.trim().split(/\s+/),parts=[];let part='';
  for(const word of words){
    if(word.length>180)throw Error('Please separate very long words before speaking.');
    if(part.length+word.length+1>180){parts.push(part);part='';}
    part+=(part?' ':'')+word;
    if(/[.!?]$/.test(word)){parts.push(part);part='';}
  }
  if(part)parts.push(part);return parts;
}
self.onmessage=({data:m})=>{
  if(m.type==='prefetch'){
    warmRevision++;warmVoice=m.voice;
    warmup=[...new Set((Array.isArray(m.texts)?m.texts:[]).filter(t=>typeof t==='string').map(t=>t.trim()).filter(t=>t&&t.length<=120))].slice(0,24);
    scheduleWarmup();return;
  }
  if(m.type==='cancel'){if(latest===m.id)latest=0;if(latestPreparation===m.id)latestPreparation=null;return;}
  if(m.type==='prepare'){
    latestPreparation=m.id;
    enqueue(async()=>{
      const current=()=>latestPreparation===m.id;
      const cancelled=()=>postMessage({id:m.id,cancelled:true});
      if(!current()){cancelled();return;}
      try{
        const tts=await load();if(!current()){cancelled();return;}
        const text=m.text||'Hello from your communication speaker.',key=m.voice+'|'+text.trim();
        if(!cache.has(key)){const audio=await tts.generate(text,{voice:m.voice});if(!current()){cancelled();return;}remember(key,audio.audio);}
        postMessage({id:m.id,ready:true,backend,fallbackReason,gpuAvailable:!!navigator.gpu});
      }
      catch(e){postMessage({id:m.id,error:e.message||'Local voice setup failed.'});}
      finally{if(current())latestPreparation=null;}
    });return;
  }
  latest=m.id;
  const saved=cached(m.voice+'|'+m.text.trim());
  if(saved){const samples=saved.slice();postMessage({id:m.id,samples,sampleRate:24000,cached:true},[samples.buffer]);return;}
  enqueue(async()=>{
    if(latest!==m.id)return;
    try{
      const key=m.voice+'|'+m.text.trim(),saved=cached(key);
      if(saved){const samples=saved.slice();postMessage({id:m.id,samples,sampleRate:24000,cached:true},[samples.buffer]);return;}
      const parts=chunks(m.text),tts=await load();if(latest!==m.id)return;
      const buffers=[];let length=0;
      for(let i=0;i<parts.length;i++){
        const audio=await tts.generate(parts[i],{voice:m.voice});if(latest!==m.id)return;
        buffers.push(audio.audio);length+=audio.audio.length;
        if(parts.length>1)postMessage({progress:'Preparing message: '+(i+1)+' of '+parts.length,id:m.id});
      }
      const samples=new Float32Array(length);let offset=0;
      for(const buffer of buffers){samples.set(buffer,offset);offset+=buffer.length;}
      remember(key,samples);
      postMessage({id:m.id,samples,sampleRate:24000},[samples.buffer]);
    }catch(e){if(latest===m.id)postMessage({id:m.id,error:e.message||'Local voice failed. Check your connection and try again.'});}
  });
};
