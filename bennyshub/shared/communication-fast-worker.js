/* Optional CPU voice. Natural/Kokoro continues to use communication-worker.js. */
'use strict';
importScripts('./communication-fast-vendor/piper.js','./communication-fast-vendor/ort.wasm.min.js');
const modelBase='https://huggingface.co/rhasspy/piper-voices/resolve/c10ece1aade47bb51c153c893d14e5bf8e5b7117/en/en_US/ljspeech/medium/en_US-ljspeech-medium.onnx';
const modelCache='benny-communication-fast-model-v1';
let engine,loading,phonemeIds,latest=0,latestPreparation,queue=Promise.resolve();
const cache=new Map();let cacheBytes=0;
function remember(key,samples){
  if(samples.byteLength>8*1024*1024)return;
  if(cache.has(key)){cacheBytes-=cache.get(key).byteLength;cache.delete(key);}
  while(cache.size&&(cache.size>=32||cacheBytes+samples.byteLength>16*1024*1024)){const first=cache.keys().next().value;cacheBytes-=cache.get(first).byteLength;cache.delete(first);}
  cache.set(key,samples.slice());cacheBytes+=samples.byteLength;
}
function cached(text){const samples=cache.get(text);if(samples){cache.delete(text);cache.set(text,samples);}return samples;}
async function modelFile(url){
  let storage;
  try{storage=await caches.open(modelCache);const saved=await storage.match(url);if(saved)return saved;}catch(_){/* Storage can be disabled; speech still works online. */}
  postMessage({progress:'Loading Faster voice. First setup downloads voice files.'});
  const response=await fetch(url);if(!response.ok)throw Error('Faster voice download failed. Check your connection and try again.');
  try{await storage?.put(url,response.clone());}catch(_){/* A full cache must not prevent speaking. */}
  return response;
}
async function load(){
  if(engine)return engine;
  if(!loading)loading=(async()=>{
    const config=await(await modelFile(modelBase+'.json')).json();
    // GitHub Pages is not cross-origin isolated. Use the single-thread SIMD runtime.
    ort.env.wasm.numThreads=1;ort.env.wasm.wasmPaths=new URL('./communication-fast-vendor/',location.href).href;
    const phonemizer=await createPiperPhonemize({
      print:line=>{phonemeIds=JSON.parse(line).phoneme_ids;},printErr:message=>console.warn(message),
      locateFile:name=>new URL('./communication-fast-vendor/'+name,location.href).href
    });
    const session=await ort.InferenceSession.create(await(await modelFile(modelBase)).arrayBuffer(),{executionProviders:['wasm']});
    return {sampleRate:config.audio.sample_rate,async generate(text){
      phonemeIds=null;
      phonemizer.callMain(['-l',config.espeak.voice,'--input',JSON.stringify([{text}]),'--espeak_data','/espeak-ng-data']);
      if(!phonemeIds?.length)throw Error('The Faster voice could not read this message.');
      const result=await session.run({
        input:new ort.Tensor('int64',BigInt64Array.from(phonemeIds,BigInt),[1,phonemeIds.length]),
        input_lengths:new ort.Tensor('int64',BigInt64Array.from([phonemeIds.length],BigInt),[1]),
        scales:new ort.Tensor('float32',[config.inference.noise_scale,config.inference.length_scale,config.inference.noise_w])
      });
      return new Float32Array(result.output.data);
    }};
  })().then(value=>engine=value).catch(error=>{loading=null;throw error;});
  return loading;
}
function chunks(text){
  const parts=[];let part='';
  for(const word of text.trim().split(/\s+/)){
    if(word.length>180)throw Error('Please separate very long words before speaking.');
    if(part.length+word.length+1>180){parts.push(part);part='';}
    part+=(part?' ':'')+word;
    if(/[.!?]$/.test(word)){parts.push(part);part='';}
  }
  if(part)parts.push(part);return parts;
}
async function generate(text,current){
  const saved=cached(text);if(saved)return {samples:saved.slice(),sampleRate:engine.sampleRate,cached:true};
  const parts=chunks(text),tts=await load();if(!current())return;
  const buffers=[];let length=0;
  for(const part of parts){const samples=await tts.generate(part);if(!current())return;buffers.push(samples);length+=samples.length;}
  const samples=new Float32Array(length);let offset=0;
  for(const buffer of buffers){samples.set(buffer,offset);offset+=buffer.length;}
  remember(text,samples);return {samples,sampleRate:tts.sampleRate};
}
self.onmessage=({data:m})=>{
  // Do not make a slow CPU synthesize speculative boards or changing drafts.
  // Already spoken messages remain cached; actual selections own this queue.
  if(m.type==='prefetch')return;
  if(m.type==='cancel'){if(latest===m.id)latest=0;if(latestPreparation===m.id)latestPreparation=null;return;}
  if(m.type==='prepare')latestPreparation=m.id;else latest=m.id;
  const current=()=>m.type==='prepare'?latestPreparation===m.id:latest===m.id;
  const text=typeof m.text==='string'?m.text.trim():m.type==='prepare'?'Hello from your communication speaker.':'';
  if(m.type!=='prepare'&&cache.has(text)){const samples=cached(text).slice();postMessage({id:m.id,samples,sampleRate:engine.sampleRate,cached:true},[samples.buffer]);return;}
  queue=queue.catch(()=>{}).then(async()=>{
    if(!current())return;
    try{
      if(!text||text.length>5000)throw Error('Use a message of 1 to 5000 characters.');
      const result=await generate(text,current);if(!result||!current())return;
      if(m.type==='prepare')postMessage({id:m.id,ready:true,backend:'wasm',voiceEngine:'piper'});
      else postMessage({id:m.id,...result},[result.samples.buffer]);
    }catch(error){if(current())postMessage({id:m.id,error:error.message||'The Faster voice could not load. Try Natural mode or check your connection.'});}
    finally{if(m.type==='prepare'&&current())latestPreparation=null;}
  });
};
