(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.RtcLocalGeneration=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  // WebLLM 0.2.85's non-streaming path can retain interruptSignal after an abort.
  // A streaming request resets that state and also releases its lock on errors.
  return function createGenerator(engine,onRecovery=()=>{}){
    let useGrammar=true;
    return async function generate({prompt,schema,prediction},cancelled=()=>false){
      const check=()=>{if(cancelled())throw new DOMException('Cancelled','AbortError');};
      async function attempt(){
        check();
        const content=prompt+'\nReturn only one valid JSON object matching this schema. No explanation or markdown:\n'+JSON.stringify(schema);
        const stream=await engine.chat.completions.create({
          messages:[{role:'system',content:'You generate short communication choices, not assistant answers. Follow the requested JSON format. ROOM and USER are transcript labels: never address someone by those labels. Suggested choices are possibilities, not things the user has already said or decided.'},{role:'user',content}],stream:true,max_tokens:prediction?240:700,temperature:0.5,repetition_penalty:1.12,
          ...(useGrammar?{response_format:{type:'json_object',schema:JSON.stringify(schema)}}:{})
        });
        let text='';
        // Drain an interrupted stream: WebLLM releases its generation lock at
        // the end, not in iterator.return(). Never exit the loop early.
        for await(const chunk of stream){if(!cancelled())text+=chunk.choices[0]?.delta?.content||'';}
        check();return text;
      }
      try{return await attempt();}
      catch(error){
        check();
        if(!useGrammar||!/grammar matcher rejected the newly sampled token/i.test(error.message||''))throw error;
        // Retry this local formatting failure once, then use ordinary decoding
        // for this loaded engine. The caller still validates every JSON result.
        useGrammar=false;onRecovery('Retrying local AI suggestions…');
        await engine.resetChat();check();
        return attempt();
      }
    };
  };
});
