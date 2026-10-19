
(function(){
'use strict';
const C=window.RtcCore;
class AI{
 constructor(getPrefs,onProgress,onStateChange=()=>{}){this.onStateChange=onStateChange;this.loading=false;this.prefs=getPrefs;this.progress=onProgress;this.ready='';this.queue=Promise.resolve();this.chrome=null;this.generation=0;}
 isAvailable(){const p=this.prefs();return p.ai==='cloud'?!!window.RtcByok.connection():p.ai==='server'?!!String(p.serverModel||'').trim():p.ai==='chrome'&&this.ready==='chrome';}
 cloudName(){return ({openai:'OpenAI',anthropic:'Anthropic',google:'Google Gemini'})[window.RtcByok.connection()?.provider]||'Connect AI';}
 model(){return window.RtcByok.connection()?.model||'';}
 async setup(download=true){
  const provider=this.prefs().ai;this.stop();const generation=this.generation;this.loading=true;this.onStateChange();
  try{
  if(provider==='webllm')throw Error('The experimental browser model is no longer offered. Choose another AI option in Settings.');
  if(provider==='chrome'){
   if(!window.LanguageModel)throw Error('Gemini Nano needs supported desktop Chrome; websites cannot use it in Chrome on Android or iPhone/iPad. Choose another AI option in Settings.');
   const options={expectedInputs:[{type:'text',languages:['en']}],expectedOutputs:[{type:'text',languages:['en']}]};
   const state=await LanguageModel.availability(options);
   if(state==='unavailable'||!download&&state!=='available')throw Error('Chrome AI needs a supported device and setup in Settings.');
   if(generation!==this.generation)throw Error('Setup cancelled.');const session=await LanguageModel.create({...options,monitor:m=>m.addEventListener('downloadprogress',e=>this.progress('Chrome AI download: '+Math.round(e.loaded*100)+'%'))});if(generation!==this.generation){session.destroy();throw Error('Setup cancelled.');}this.chrome=session;
  }else if(provider==='server'){
   const models=await window.RtcServer.models(this.prefs(),AbortSignal.timeout(10000));
   if(!models.includes(this.prefs().serverModel))throw Error('Choose an installed model in Local AI server settings.');
  }else if(provider==='cloud'){if(!window.RtcByok.connection())throw Error('Connect your AI in Settings first.');await window.RtcByok.status();}
  else throw Error('AI suggestions are off.');
  if(generation!==this.generation||this.prefs().ai!==provider)throw Error('AI provider changed.');
  this.ready=provider;return true;
  }finally{if(generation===this.generation){this.loading=false;this.onStateChange();}}
 }
 stop(){++this.generation;this.ready='';this.loading=false;this.chrome?.destroy();this.chrome=null;this.onStateChange();}
 request(prompt,schema,prediction,signal){
  const provider=this.prefs().ai;
  const run=async()=>{
   if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
   if(provider!==this.prefs().ai||!this.isAvailable())throw Error('Set up your selected AI option in Settings. The saved phrases still work.');
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),60000),abort=()=>controller.abort();
   signal?.addEventListener('abort',abort,{once:true});
   try{
    let raw;if(provider==='cloud')throw Error('Use the RTC Lite Worker operation.');
    else if(provider==='server')raw=await window.RtcServer.generate(this.prefs(),prompt,schema,prediction,controller.signal);
    else if(provider==='chrome'){
     const session=this.chrome||await LanguageModel.create({expectedInputs:[{type:'text',languages:['en']}],expectedOutputs:[{type:'text',languages:['en']}]});this.chrome=null;
     try{raw=await session.prompt(prompt,{responseConstraint:schema,signal:controller.signal});}finally{session.destroy();}
    }else throw Error('Choose an available AI option in Settings.');
    if(controller.signal.aborted)throw new DOMException(signal?.aborted?'Cancelled':'AI request timed out. Try again or check your AI server.','AbortError');
    if(signal?.aborted||provider!==this.prefs().ai)throw new DOMException('Cancelled','AbortError');return raw;
   }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
  };
  const result=this.queue.then(run);this.queue=result.catch(()=>{});return result;
 }
 async getSuggestions(snapshot,profile,avoid,signal,steer='',avoidSteers=[]){
  if(this.prefs().ai==='cloud')return C.validateSuggestions(await window.RtcByok.generate({op:'board',snapshot,profile,avoid:avoid.slice(-80),...(steer?{steer}:{}),...(avoidSteers.length?{avoidSteers:avoidSteers.slice(-C.STEER_HISTORY_LIMIT)}:{})},signal),avoid,avoidSteers);
  let prompt=C.boardPrompt(snapshot,profile,avoid,steer,avoidSteers);const candidates={general:[],specific:[]};
  for(let attempt=0;attempt<2;attempt++){
   const raw=await this.request(prompt,C.BOARD_SCHEMA,false,signal);
   try{return C.validateSuggestions(raw,avoid,avoidSteers);}catch(e){
    const usable=C.usableBoard(raw,avoid);for(const key of ['general','specific'])candidates[key].push(...usable[key]);
    if(attempt){const recovered=C.completeBoard(candidates,this.prefs().defaults);if(recovered)return recovered;throw e;}
    prompt+='\nThe response below needs correction: '+JSON.stringify(raw)+'\nProblem: '+e.message+' Replace unusable choices with different short things the person could actually say aloud in this exchange. Reply naturally even to a simple greeting. Remove task commentary, missing-context notices, purpose/speaker labels and repeated or standalone quick answers. Return the full corrected JSON object.';
   }
  }
 }
 async predictWords(snapshot,profile,typed,avoid,signal,target='both',purpose='conversation'){
  if(this.prefs().ai==='cloud')return C.predictions(await window.RtcByok.generate({op:'predictions',snapshot,profile,typed,avoid,target,purpose},signal),typed,avoid);
  let prompt=C.predictionPrompt(snapshot,profile,typed,avoid,purpose);const usable={words:[],phrases:[]};
  for(let attempt=0;attempt<2;attempt++){
   const raw=await this.request(prompt,C.PREDICT_SCHEMA,true,signal);
   try{
    const result=C.predictions(raw,typed,avoid);
    usable.words.push(...result.words);usable.phrases.push(...result.phrases);
    if(target==='words'?!result.words.length:target==='phrases'?!result.phrases.length:!result.words.length||!result.phrases.length)throw Error('No different predictions found. Try another letter.');
    return result;
   }catch(e){if(attempt){const recovered=C.predictions(usable,typed,avoid);if(target==='both'&&(recovered.words.length||recovered.phrases.length))return recovered;throw e;}prompt+='\nCorrect this unusable response: '+JSON.stringify(raw)+'\nReturn only new words or continuations that fit immediately after the text already entered, completing its unfinished word. Do not repeat the whole sentence or the unfinished fragment by itself.';}
  }
 }
}
window.RtcAI=AI;
})();
