
import {pipeline,env} from './vendor/transformers.js';
env.allowLocalModels=false;env.useBrowserCache=true;
env.backends.onnx.wasm.wasmPaths=new URL('./vendor/',import.meta.url).href;
env.backends.onnx.wasm.numThreads=1;env.backends.onnx.wasm.proxy=false;
let asr,busy=false;
self.onmessage=async({data:m})=>{
 if(busy){postMessage({id:m.id,error:'Local Whisper is busy.'});return;}busy=true;
 try{
  if(m.type==='load'){
   env.allowLocalModels=!m.download;env.allowRemoteModels=!!m.download;
   asr=await pipeline('automatic-speech-recognition','Xenova/whisper-base.en',{quantized:true,local_files_only:!m.download,progress_callback:p=>{if(p.progress!=null)postMessage({progress:'Whisper: '+Math.round(p.progress)+'% '+(p.file||'')});}});
   postMessage({id:m.id,result:true});
  }else{
   if(!asr)throw Error('Set up Local Whisper first.');
   const result=await asr(new Float32Array(m.audio),{sampling_rate:16000,chunk_length_s:25,stride_length_s:0});
   postMessage({id:m.id,result:{text:result.text||''}});
  }
 }catch(e){postMessage({id:m.id,error:m.type==='load'&&!m.download?'Saved Whisper model is missing. Choose Set up in Settings to download it.':e.message||'Whisper failed.'});}finally{busy=false;}
};