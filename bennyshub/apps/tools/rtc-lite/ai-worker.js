import {CreateMLCEngine,hasModelInCache} from './vendor/webllm.js';
import './ai-generation.js';
const model='SmolLM2-1.7B-Instruct-q4f32_1-MLC';
let engine,generate,busy=false,interrupted=false;
self.onmessage=async({data:m})=>{
 if(m.type==='interrupt'){if(busy){interrupted=true;engine?.interruptGenerate();}return;}
 if(busy){postMessage({id:m.id,error:'Local AI is busy.'});return;}busy=true;interrupted=false;
 try{
  if(m.type==='load'){
   if(!m.download&&!await hasModelInCache(model))throw Error('Download Local AI in Settings first.');
   engine=await CreateMLCEngine(model,{initProgressCallback:p=>postMessage({progress:p.text}),logLevel:'ERROR'},{context_window_size:4096});
   generate=RtcLocalGeneration(engine,progress=>postMessage({progress}));
   postMessage({id:m.id,result:true});
  }else{
   if(!engine)throw Error('Set up Local AI in Settings first.');
   const result=await generate(m,()=>interrupted);
   postMessage({id:m.id,result});
  }
 }catch(e){postMessage({id:m.id,error:e.message||'Local AI failed.'});}finally{busy=false;}
};
