(function(){
'use strict';
function config(prefs){
 let url;try{url=new URL(prefs.serverUrl||'http://127.0.0.1:11434');}catch{throw Error('Enter a valid local AI server address.');}
 if(!['http:','https:'].includes(url.protocol)||!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||url.username||url.password||url.search||url.hash)throw Error('Use a local server address such as http://127.0.0.1:11434. No API key is sent to this server.');
 const type=prefs.serverType==='openai'?'openai':'ollama',base=url.href.replace(/\/+$/,'').replace(/\/(?:api|v1)$/,'');
 const model=String(prefs.serverModel||'').trim().slice(0,160);
 return {base,type,model};
}
async function send(url,options){
 let response;
 try{response=await fetch(url,options);}catch(e){if(options.signal?.aborted)throw e;throw Error('Cannot reach the local AI server. Start it and allow this app’s origin in its CORS settings.');}
 if(!response.ok)throw Error(response.status===404?'Local AI model or endpoint not found. Check the server type and installed model.':response.status===403?'Local AI server refused this app. Check its allowed origins.':'Local AI server error ('+response.status+'). Check the server.');
 const data=await response.json();if(data.error)throw Error('Local AI server could not run the selected model. Check the model in your server.');
 return data;
}
async function models(prefs,signal){
 const c=config(prefs),data=await send(c.base+(c.type==='ollama'?'/api/tags':'/v1/models'),{signal});
 return (c.type==='ollama'?data.models?.map(m=>m.name):data.data?.map(m=>m.id))?.filter(m=>typeof m==='string'&&m.trim()).slice(0,100)||[];
}
async function generate(prefs,prompt,schema,prediction,signal){
 const c=config(prefs);if(!c.model)throw Error('Choose an installed model in Local AI server settings.');
 const messages=[{role:'user',content:prompt+'\nReturn only JSON matching: '+JSON.stringify(schema)}];
 const body=c.type==='ollama'?{model:c.model,messages,stream:false,format:schema,think:false,options:{temperature:0.4,num_predict:prediction?400:900,num_ctx:8192}}:
 {model:c.model,messages,stream:false,temperature:0.4,max_tokens:prediction?400:900,response_format:{type:'json_schema',json_schema:{name:'communication',strict:true,schema}}};
 const data=await send(c.base+(c.type==='ollama'?'/api/chat':'/v1/chat/completions'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal});
 return c.type==='ollama'?data.message?.content||'':data.choices?.[0]?.message?.content||'';
}
window.RtcServer={config,models,generate};
})();