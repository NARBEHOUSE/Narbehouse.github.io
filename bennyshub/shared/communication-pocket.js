/* Pocket TTS custom voices for the communication worker. Makes the whole message, then returns it (no streaming).
   Pocket TTS by Kyutai (CC BY 4.0); ONNX export and the web pipeline this follows by KevinAHM (CC BY 4.0 / Apache 2.0).
   Differences from that pipeline, all measured in the voice speed test:
   - the attention cache starts small and grows (the export reserves 1000 steps and copies them in and out on every
     frame): same audio, about twice as fast;
   - the standard int8 models: full precision scored higher on a clarity metric but sounded no different in a blind test;
   - every voice is levelled to the same loudness, with a soft limiter so nothing clips;
   - voices are precomputed voice prints (communication-voices/*.bin, raw float32, or ones added in Settings from a
     Voice Studio export), so the voice encoder is never downloaded. */
const ORT_DIST='https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.0/dist/';
const MODELS='https://huggingface.co/spaces/KevinAHM/pocket-tts-web/resolve/d0c0c79b7712256a32d691c67f20b8ae2e020d00/onnx/english_2026-04/';
const FILES={text:'text_conditioner_int8.onnx',main:'flow_lm_main_int8.onnx',flow:'flow_lm_flow_int8.onnx',decoder:'mimi_decoder_int8.onnx'};
const CACHE='narbe-pocket-v1',START_SLOTS=64,GROW_SLOTS=32,TARGET_DBFS=-18,LATENT=32,TEXT_DIM=1024;
// Words Pocket smears, spelled the way it says them clearly. Add to it as they come up.
// "Ari" (as in "sorry") came out like "Harry" as a sentence's first word; "Ahree" was right everywhere (2026-10-18).
const SAY_AS=[[/\bari\b/gi,'Ahree']];
// Pocket reads spelling, capitals included: an ALL CAPS word comes out as an acronym or oddly stressed ("HAVE" as
// "hay-ve"), a lowercase name is misread ("ari"), and capitalising every word stresses each first sound. Ben's keyboard
// types in capitals, so an all-capitals message is spoken in sentence case, keeping these acronyms and names, plus
// the names a caregiver lists in Settings > Names to say (spelled as typed there, e.g. "McKenna").
// Listening tests 2026-10-18. Add acronyms here as they come up; people's names belong in Settings.
const KEEP_CAPS=new Set(['OK','TV','DVD','PC','USB','ASAP','ESPN','NFL','NBA','MLB','NHL']);
const NAMES=['Ari','Ben','Benny'];
// What Pocket is given for a message: casing first (so names are found), then respellings.
export const pocketText=(text,names=[])=>SAY_AS.reduce((t,[from,to])=>t.replace(from,to),pocketCase(text,names));
export function pocketCase(text,names=[]){
  if(/[a-z]/.test(text)||!/[A-Z]/.test(text))return text;
  const spelled=new Map();
  for(const name of [...NAMES,...names])for(const word of String(name).split(/[\s-]+/))if(word)spelled.set(word.toUpperCase(),word[0].toUpperCase()+word.slice(1));
  return text.replace(/\p{Lu}[\p{Lu}\p{M}']*/gu,word=>{
    if(KEEP_CAPS.has(word))return word;
    if(spelled.has(word))return spelled.get(word);
    const lower=word.toLowerCase();
    return /^i('|$)/.test(lower)?'I'+lower.slice(1):lower;
  }).replace(/(^|[.!?]\s+)(\p{Ll})/gu,(_,before,letter)=>before+letter.toUpperCase());
}

async function download(url,report){
  let cache;
  try{cache=await caches.open(CACHE);const saved=await cache.match(url);if(saved)return new Uint8Array(await saved.arrayBuffer());}catch(_){/* no Cache API: download each time */}
  const response=await fetch(url);if(!response.ok)throw Error('The custom voice could not download ('+response.status+').');
  const total=Number(response.headers.get('content-length'))||0,reader=response.body.getReader(),parts=[];let got=0;
  for(;;){const {done,value}=await reader.read();if(done)break;parts.push(value);got+=value.length;report(got,total);}
  const bytes=new Uint8Array(got);let at=0;for(const p of parts){bytes.set(p,at);at+=p.length;}
  try{await cache?.put(url,new Response(bytes));}catch(_){/* full disk: still works while online */}
  return bytes;
}
// The export declares the cache length as a fixed 1000. Relabel it as free so a smaller cache can be passed:
// each "dim_value 1000" (0A 03 08 E8 07) becomes "dim_param c" (0A 03 12 01 63). Same length, weights untouched.
function freeCacheLength(bytes){
  let n=0;
  for(let i=0;i+5<=bytes.length;i++)if(bytes[i]===0x0A&&bytes[i+1]===0x03&&bytes[i+2]===0x08&&bytes[i+3]===0xE8&&bytes[i+4]===0x07){bytes[i+2]=0x12;bytes[i+3]=0x01;bytes[i+4]=0x63;n++;i+=4;}
  if(n!==42)throw Error('Unexpected custom voice model.');
  return bytes;
}
function npyFloats(buffer){
  const view=new DataView(buffer),major=view.getUint8(6),len=major===1?view.getUint16(8,true):view.getUint32(8,true),at=major===1?10:12;
  return new Float32Array(buffer.slice(at+len));
}
function speechLevelDb(a){
  let sum=0,n=0;
  for(let i=0;i+480<=a.length;i+=480){let w=0;for(let j=i;j<i+480;j++)w+=a[j]*a[j];if(w/480>3e-5){sum+=w;n+=480;}}
  return n?10*Math.log10(sum/n):TARGET_DBFS;
}
function level(a){
  const gain=Math.min(2.5,Math.max(.25,10**((TARGET_DBFS-speechLevelDb(a))/20))),knee=.9;
  for(let i=0;i<a.length;i++){const x=a[i]*gain,m=Math.abs(x);a[i]=m<=knee?x:Math.sign(x)*(knee+(1-knee)*Math.tanh((m-knee)/(1-knee)));}
  return a;
}
function gaussian(n){
  const out=new Float32Array(n),std=Math.sqrt(.7);
  for(let i=0;i<n;i++){let u=0,v=0;while(!u)u=Math.random();while(!v)v=Math.random();out[i]=Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v)*std;}
  return out;
}
const yieldToMessages=()=>new Promise(resolve=>setTimeout(resolve));
async function builtInPrint(key){
  const response=await fetch(new URL('communication-voices/'+key+'.bin',import.meta.url));if(!response.ok)throw Error('Custom voice file missing.');
  return new Float32Array(await response.arrayBuffer());
}
// Voices added in Settings (communication-voices.js saves them in this device's IndexedDB).
async function addedPrint(key){
  const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('narbe-communication-voices',1);r.onupgradeneeded=()=>r.result.createObjectStore('prints');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  try{
    const saved=await new Promise((resolve,reject)=>{const r=db.transaction('prints').objectStore('prints').get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    if(!saved)throw Error('This custom voice is not on this device. Add it again in Hub Settings.');
    return new Float32Array(saved.data);
  }finally{db.close();}
}

export function createPocket(progress=()=>{}){
  let loading,ort,s,meta,sp,bos;const voiceStates=new Map();
  const tensor=(type,data,dims)=>new ort.Tensor(type,data,dims);
  function load(){
    if(!loading)loading=(async()=>{
      ort=await import(ORT_DIST+'ort.wasm.min.mjs');ort=ort.default||ort;
      ort.env.wasm.wasmPaths=ORT_DIST;
      ort.env.wasm.numThreads=self.crossOriginIsolated?Math.min(4,navigator.hardwareConcurrency||4):1; // more threads cost far more power than they save
      meta=await (await fetch(MODELS+'bundle.json')).json();
      const names=Object.keys(FILES),sizes={},got={};
      const report=name=>(n,total)=>{got[name]=n;sizes[name]=total;if(names.every(k=>sizes[k]))progress('Loading custom voice: '+Math.round(100*names.reduce((a,k)=>a+got[k],0)/names.reduce((a,k)=>a+sizes[k],0))+'%');};
      const bytes=await Promise.all(names.map(k=>download(MODELS+FILES[k],report(k))));
      const options={executionProviders:['wasm'],graphOptimizationLevel:'all'};
      s={};for(let i=0;i<names.length;i++)s[names[i]]=await ort.InferenceSession.create(names[i]==='main'?freeCacheLength(bytes[i]):bytes[i],options);
      const {SentencePieceProcessor}=await import('./communication-vendor/sentencepiece.js');
      sp=new SentencePieceProcessor();const model=await download(MODELS+meta.tokenizer_file,()=>{});
      let b64='';for(let i=0;i<model.length;i+=0x8000)b64+=String.fromCharCode(...model.subarray(i,i+0x8000));
      await sp.loadFromB64StringModel(btoa(b64));
      bos=meta.insert_bos_before_voice?npyFloats((await download(MODELS+meta.bos_before_voice_file,()=>{})).buffer):null;
    })().catch(e=>{loading=null;throw e;});
    return loading;
  }
  function freshState(manifest){
    const state={};
    for(const e of manifest){
      const dims=e.shape.length===5&&e.shape[2]===1000?[e.shape[0],e.shape[1],START_SLOTS,e.shape[3],e.shape[4]]:e.shape,size=dims.reduce((a,b)=>a*b,1);
      // bool "ones" fill kept as zeros, as in the pipeline this follows (measured: makes no difference to the audio)
      const data=e.dtype==='int64'?new BigInt64Array(size):e.dtype==='bool'?new Uint8Array(size):new Float32Array(size).fill(e.fill==='nan'?NaN:e.fill==='ones'?1:0);
      state[e.input_name]=tensor(e.dtype,data,dims);
    }
    return state;
  }
  function update(state,result,manifest=meta.flow_lm_state_manifest){for(const e of manifest)state[e.input_name]=result[e.output_name];}
  // Before a run would write past the end of the cache, copy it into a slightly longer one (NaN = empty, as at start).
  function grow(state,adding){
    const step=meta.flow_lm_state_manifest.find(e=>e.key==='step'),needed=Number(state[step.input_name].data[0])+adding+1;
    for(const e of meta.flow_lm_state_manifest){
      const t=state[e.input_name];if(t.dims.length!==5||needed<=t.dims[2])continue;
      const [a,b,len,h,d]=t.dims,block=len*h*d,bigger=Math.ceil((needed+GROW_SLOTS/2)/GROW_SLOTS)*GROW_SLOTS,data=new Float32Array(a*b*bigger*h*d).fill(NaN);
      for(let i=0;i<a*b;i++)data.set(t.data.subarray(i*block,(i+1)*block),i*bigger*h*d);
      state[e.input_name]=tensor('float32',data,[a,b,bigger,h,d]);
    }
  }
  async function voiceState(voice){
    if(voiceStates.has(voice))return voiceStates.get(voice);
    const key=voice.slice('pocket:'.length);if(!/^[a-z0-9-]+$/.test(key))throw Error('Unknown custom voice.');
    const print=key.startsWith('user-')?await addedPrint(key):await builtInPrint(key),data=bos?new Float32Array(bos.length+print.length):print;
    if(bos){data.set(bos);data.set(print,bos.length);}
    const frames=data.length/TEXT_DIM,state=freshState(meta.flow_lm_state_manifest);grow(state,frames);
    update(state,await s.main.run({sequence:tensor('float32',new Float32Array(0),[1,0,LATENT]),text_embeddings:tensor('float32',data,[1,frames,TEXT_DIM]),...state}));
    voiceStates.set(voice,state);return state;
  }
  function chunks(text,names){
    let prompt=pocketText(text,names).replace(/\s+/g,' ').trim();
    const words=prompt.split(' ').length;
    if(!/[A-ZÀ-Þ]/.test(prompt[0]))prompt=prompt[0].toUpperCase()+prompt.slice(1);
    if(/[0-9A-Za-zÀ-ÿ]$/.test(prompt))prompt+='.';
    const out=[];let part='';
    for(const sentence of prompt.match(/[^.!?]+[.!?]+|[^.!?]+$/g).map(x=>x.trim()).filter(Boolean)){
      const ids=sp.encodeIds(sentence);
      if(ids.length>meta.max_token_per_chunk){if(part)out.push(part);part='';for(let i=0;i<ids.length;i+=meta.max_token_per_chunk)out.push(sp.decodeIds(ids.slice(i,i+meta.max_token_per_chunk)).trim());continue;}
      const joined=part?part+' '+sentence:sentence;
      if(part&&sp.encodeIds(joined).length>meta.max_token_per_chunk){out.push(part);part=sentence;}else part=joined;
    }
    if(part)out.push(part);
    return {parts:out.filter(Boolean),after:words<=4?3:1};
  }
  async function speakPart(text,voice,after,isCurrent){
    const state={...await voiceState(voice)},ids=sp.encodeIds(text);
    let emb=(await s.text.run({token_ids:tensor('int64',BigInt64Array.from(ids,BigInt),[1,ids.length])}))[s.text.outputNames[0]];
    if(emb.dims.length===2)emb=tensor('float32',emb.data,[1,...emb.dims]);
    grow(state,emb.dims[1]);
    update(state,await s.main.run({sequence:tensor('float32',new Float32Array(0),[1,0,LATENT]),text_embeddings:emb,...state}));
    const noText=tensor('float32',new Float32Array(0),[1,0,TEXT_DIM]),from=tensor('float32',new Float32Array([0]),[1,1]),to=tensor('float32',new Float32Array([1]),[1,1]);
    const latents=[];let latent=tensor('float32',new Float32Array(LATENT).fill(NaN),[1,1,LATENT]),eos=null;
    for(let step=0;step<500;step++){
      if(step%4===3)await yieldToMessages(); // lets a cancel arrive mid-message
      if(!isCurrent())return null;
      grow(state,1);
      const r=await s.main.run({sequence:latent,text_embeddings:noText,...state});
      if(eos===null&&r.eos_logit.data[0]>-4)eos=step;
      const x=gaussian(LATENT),dir=(await s.flow.run({c:r.conditioning,s:from,t:to,x:tensor('float32',x,[1,LATENT])})).flow_dir.data;
      for(let i=0;i<LATENT;i++)x[i]+=dir[i];
      latents.push(x);latent=tensor('float32',x,[1,1,LATENT]);update(state,r);
      if(eos!==null&&step>=eos+after)break;
    }
    // Decode 12 frames per call, as in the tested pipeline: the int8 decoder sets its scale per call.
    const mimi=freshState(meta.mimi_state_manifest),pieces=[];
    for(let at=0;at<latents.length;at+=12){
      const n=Math.min(12,latents.length-at),block=new Float32Array(n*LATENT);for(let i=0;i<n;i++)block.set(latents[at+i],i*LATENT);
      const decoded=await s.decoder.run({latent:tensor('float32',block,[1,n,LATENT]),...mimi});
      update(mimi,decoded,meta.mimi_state_manifest);pieces.push(decoded[s.decoder.outputNames[0]].data);
    }
    const audio=new Float32Array(pieces.reduce((a,p)=>a+p.length,0));let at=0;for(const p of pieces){audio.set(p,at);at+=p.length;}
    return audio;
  }
  return {
    // Same shape as KokoroTTS.generate: resolves {audio: Float32Array at 24 kHz}, or {audio: null} once no longer current.
    async generate(text,{voice,names=[],isCurrent=()=>true}={}){
      await load();await voiceState(voice);
      const {parts,after}=chunks(text,names),pieces=[],gap=new Float32Array(Math.round(.25*meta.sample_rate));
      for(let i=0;i<parts.length;i++){
        const piece=await speakPart(parts[i],voice,after,isCurrent);if(!piece)return {audio:null};
        if(i)pieces.push(gap);pieces.push(piece);
      }
      const audio=new Float32Array(pieces.reduce((a,p)=>a+p.length,0));let at=0;for(const p of pieces){audio.set(p,at);at+=p.length;}
      return {audio:level(audio)};
    }
  };
}
