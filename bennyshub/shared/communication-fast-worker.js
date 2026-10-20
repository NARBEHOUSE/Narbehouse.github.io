/* Optional CPU voices. Natural/Kokoro continues to use communication-worker.js. */
'use strict';
importScripts('./communication-fast-vendor/piper.js','./communication-fast-vendor/ort.wasm.min.js');
const modelRoot='https://huggingface.co/rhasspy/piper-voices/resolve/c10ece1aade47bb51c153c893d14e5bf8e5b7117/en/';
const voices={
  piper_lj:'en_US/ljspeech/medium/en_US-ljspeech-medium',piper_bryce:'en_US/bryce/medium/en_US-bryce-medium',
  piper_kristin:'en_US/kristin/medium/en_US-kristin-medium',piper_norman:'en_US/norman/medium/en_US-norman-medium',
  piper_cori:'en_GB/cori/medium/en_GB-cori-medium',piper_john:'en_US/john/medium/en_US-john-medium',
  piper_alba:'en_GB/alba/medium/en_GB-alba-medium',piper_northern:'en_GB/northern_english_male/medium/en_GB-northern_english_male-medium',
  piper_jenny:'en_GB/jenny_dioco/medium/en_GB-jenny_dioco-medium',piper_joe:'en_US/joe/medium/en_US-joe-medium',
  piper_southern:'en_GB/southern_english_female/low/en_GB-southern_english_female-low',piper_mike:'en_US/mike/medium/en_US-mike-medium'
};
const modelCache='benny-communication-fast-model-v1';
let engine,phonemizerReady,phonemeIds,loadingJob,latest=0,latestPreparation,queue=Promise.resolve();
const cache=new Map();let cacheBytes=0;
function remember(key,samples,sampleRate){
  if(samples.byteLength>8*1024*1024)return;
  if(cache.has(key)){cacheBytes-=cache.get(key).samples.byteLength;cache.delete(key);}
  while(cache.size&&(cache.size>=32||cacheBytes+samples.byteLength>16*1024*1024)){const first=cache.keys().next().value;cacheBytes-=cache.get(first).samples.byteLength;cache.delete(first);}
  cache.set(key,{samples:samples.slice(),sampleRate});cacheBytes+=samples.byteLength;
}
function cached(key){const value=cache.get(key);if(value){cache.delete(key);cache.set(key,value);}return value;}
async function modelFile(url,signal){
  let storage;
  try{storage=await caches.open(modelCache);const saved=await storage.match(url);if(saved)return saved;}catch(_){/* Speech still works online without storage. */}
  if(signal.aborted)throw Error('Voice changed.');
  postMessage({progress:'Loading Faster voice. First setup downloads voice files.'});
  const response=await fetch(url,{signal});if(!response.ok)throw Error('Faster voice download failed. Check your connection and try again.');
  try{await storage?.put(url,response.clone());}catch(_){/* A full cache must not prevent speaking. */}
  return response;
}
async function load(voice,current,id){
  if(engine?.voice===voice)return engine;
  // Queue ownership serializes inference and model replacement. Keep one model in RAM.
  if(engine){await engine.session.release();engine=null;}
  if(!current())return;
  const controller=new AbortController(),job={id,voice,controller};loadingJob=job;
  try{
    const modelBase=modelRoot+voices[voice]+'.onnx';
    const config=await(await modelFile(modelBase+'.json',controller.signal)).json();if(!current())return;
    ort.env.wasm.numThreads=1;ort.env.wasm.wasmPaths=new URL('./communication-fast-vendor/',location.href).href;
    if(!phonemizerReady)phonemizerReady=createPiperPhonemize({
      print:line=>{phonemeIds=JSON.parse(line).phoneme_ids;},printErr:message=>console.warn(message),
      locateFile:name=>new URL('./communication-fast-vendor/'+name,location.href).href
    }).catch(error=>{phonemizerReady=null;throw error;});
    const phonemizer=await phonemizerReady;if(!current())return;
    const bytes=await(await modelFile(modelBase,controller.signal)).arrayBuffer();if(!current())return;
    const session=await ort.InferenceSession.create(bytes,{executionProviders:['wasm']});
    if(!current()){await session.release();return;}
    engine={voice,session,sampleRate:config.audio.sample_rate,async generate(text){
      phonemeIds=null;
      phonemizer.callMain(['-l',config.espeak.voice,'--input',JSON.stringify([{text}]),'--espeak_data','/espeak-ng-data']);
      if(!phonemeIds?.length)throw Error('The Faster voice could not read this message.');
      const result=await session.run({
        input:new ort.Tensor('int64',BigInt64Array.from(phonemeIds,BigInt),[1,phonemeIds.length]),
        input_lengths:new ort.Tensor('int64',BigInt64Array.from([phonemeIds.length],BigInt),[1]),
        scales:new ort.Tensor('float32',[config.inference.noise_scale,config.inference.length_scale,config.inference.noise_w])
      });
      return new Float32Array(result.output.data);
    }};return engine;
  }finally{if(loadingJob===job)loadingJob=null;}
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
async function generate(text,voice,current,id,prepare){
  const key=voice+'|'+text,saved=cached(key);
  // Preparation warms the selected model even if its preview is already cached.
  if(saved&&!prepare)return {...saved,samples:saved.samples.slice(),cached:true};
  const parts=chunks(text),tts=await load(voice,current,id);if(!tts||!current())return;
  if(saved)return {...saved,samples:saved.samples.slice(),cached:true};
  const buffers=[];let length=0;
  for(const part of parts){const samples=await tts.generate(part);if(!current())return;buffers.push(samples);length+=samples.length;}
  const samples=new Float32Array(length);let offset=0;
  for(const buffer of buffers){samples.set(buffer,offset);offset+=buffer.length;}
  remember(key,samples,tts.sampleRate);return {samples,sampleRate:tts.sampleRate};
}
self.onmessage=({data:m})=>{
  // Keep slower CPUs free for actual selections, not speculative boards/drafts.
  if(m.type==='prefetch')return;
  if(m.type==='cancel'){
    if(latest===m.id)latest=0;if(latestPreparation===m.id)latestPreparation=null;
    if(loadingJob?.id===m.id)loadingJob.controller.abort();return;
  }
  const voice=m.voice||'piper_lj';
  if(!Object.hasOwn(voices,voice)){postMessage({id:m.id,error:'Choose a Faster voice in Hub Settings.'});return;}
  const prepare=m.type==='prepare';
  if(prepare)latestPreparation=m.id;else latest=m.id;
  if(loadingJob&&loadingJob.voice!==voice)loadingJob.controller.abort();
  const current=()=>prepare?latestPreparation===m.id:latest===m.id;
  const text=typeof m.text==='string'?m.text.trim():prepare?'Hello from your communication speaker.':'';
  const saved=!prepare&&cached(voice+'|'+text);
  if(saved){const samples=saved.samples.slice();postMessage({id:m.id,samples,sampleRate:saved.sampleRate,cached:true},[samples.buffer]);return;}
  queue=queue.catch(()=>{}).then(async()=>{
    if(!current())return;
    try{
      if(!text||text.length>5000)throw Error('Use a message of 1 to 5000 characters.');
      const result=await generate(text,voice,current,m.id,prepare);if(!result||!current())return;
      if(prepare)postMessage({id:m.id,ready:true,backend:'wasm',voiceEngine:'piper'});
      else postMessage({id:m.id,...result},[result.samples.buffer]);
    }catch(error){if(current())postMessage({id:m.id,error:error.message||'The Faster voice could not load. Try Natural mode or check your connection.'});}
    finally{if(prepare&&current())latestPreparation=null;}
  });
};
