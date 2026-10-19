import C from '../../../bennyshub/apps/tools/rtc-lite/core.js';
import { fail, record, text, readJson, type Provider } from './util';
type Segment={speaker:'room'|'user';source:string;text:string};
type Snapshot={summary:string;recent:Segment[];justSaid:Segment[];unsummarized:Segment[]};
export type Input={id:string;op:'board'|'predictions';steer?:string;snapshot:Snapshot;profile:{bio:string;personality:object;interests:object;profanity:boolean};typed:string;avoid:string[];target:'both'|'words'|'phrases';purpose:'conversation'|'bio'|'announcement'|'default'};
function segments(value:unknown):Segment[]{if(!Array.isArray(value)||value.length>40)fail(400,'Too much conversation context.');return value.map(raw=>{const s=record(raw);if(s.speaker!=='room'&&s.speaker!=='user')fail(400,'Invalid speaker.');return {speaker:s.speaker,source:text(s.source??'speech',30),text:text(s.text,600)};});}
export function input(value:unknown):Input{
 const d=record(value),s=record(d.snapshot),p=record(d.profile),id=text(d.id,36,true);
 if(!/^[a-f0-9-]{36}$/i.test(id))fail(400,'A request ID is required.');
 if(d.op!=='board'&&d.op!=='predictions')fail(400,'Unsupported RTC Lite operation.');
 const smallObject=(v:unknown,max:number)=>{if(v===undefined)return {};const o=record(v);if(JSON.stringify(o).length>max)fail(400,'Profile is too large.');return o;};
 const avoid=d.avoid??[];if(!Array.isArray(avoid)||avoid.length>80)fail(400,'Too many previous choices.');
 const target=d.target??'both',purpose=d.purpose??'conversation';
 if(target!=='both'&&target!=='words'&&target!=='phrases')fail(400,'Invalid prediction row.');
 if(!['conversation','bio','announcement','default'].includes(String(purpose)))fail(400,'Invalid editing mode.');
 return {id,op:d.op,...(d.op==='board'&&d.steer!==undefined?{steer:text(d.steer,C.STEER_MAX_LENGTH).trim()}:{}),snapshot:{summary:text(s.summary??'',800),recent:segments(s.recent??[]),justSaid:segments(s.justSaid??[]),unsummarized:segments(s.unsummarized??[])},
 profile:{bio:text(p.bio??'',1500),personality:smallObject(p.personality,500),interests:smallObject(p.interests,400),profanity:p.profanity===true},
 typed:text(d.typed??'',1500),avoid:avoid.map(v=>text(v,100)),target,purpose:purpose as Input['purpose']};
}
export async function generate(d:Input,p:Provider,key:string,model:string,beforeCall:()=>Promise<void>){
 let prompt=d.op==='board'?C.boardPrompt(d.snapshot,d.profile,d.avoid,d.steer):C.predictionPrompt(d.snapshot,d.profile,d.typed,d.avoid,d.purpose);
 if(prompt.length>20000)fail(413,'Conversation context is too large. Clear older conversation and try again.');
 const schema=d.op==='board'?C.BOARD_SCHEMA:C.PREDICT_SCHEMA, maxTokens=d.op==='board'?900:400;
 for(let attempt=0;attempt<2;attempt++){
  await beforeCall();
  let url:string,headers:Record<string,string>={'Content-Type':'application/json'},body:unknown;
  if(p==='openai'){url='https://api.openai.com/v1/chat/completions';headers.Authorization='Bearer '+key;body={model,max_tokens:maxTokens,messages:[{role:'user',content:prompt}],response_format:{type:'json_schema',json_schema:{name:'rtc_lite',strict:true,schema}}};}
  else if(p==='anthropic'){url='https://api.anthropic.com/v1/messages';headers['x-api-key']=key;headers['anthropic-version']='2023-06-01';body={model,max_tokens:maxTokens,messages:[{role:'user',content:prompt+'\nJSON schema: '+JSON.stringify(schema)}]};}
  else{url='https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(model)+':generateContent';headers['x-goog-api-key']=key;body={contents:[{parts:[{text:prompt}]}],generationConfig:{maxOutputTokens:maxTokens,responseMimeType:'application/json',responseJsonSchema:schema,thinkingConfig:{thinkingBudget:0}}};}
  let response:Response;
  try{response=await fetch(url,{method:'POST',headers,body:JSON.stringify(body),redirect:'manual',signal:AbortSignal.timeout(25000)});}
  catch{fail(502,'AI connection failed or timed out. It was not retried; the provider may have charged for the request.');}
  if(!response.ok){await response.body?.cancel();fail(response.status===429?429:response.status===401||response.status===403?424:502,response.status===429?'Your AI provider quota or rate limit was reached.':response.status===401||response.status===403?'Your provider rejected the key. Reconnect in AI settings.':'The AI provider could not complete the request.');}
  const result=record(await readJson(response,65536));
  // Only extract model text. Never return upstream error bodies, headers or credentials.
  const raw=p==='openai'?((result.choices as {message?:{content?:string}}[]|undefined)?.[0]?.message?.content||''):p==='anthropic'?((result.content as {type?:string;text?:string}[]|undefined)?.filter(x=>x.type==='text').map(x=>x.text||'').join('')||''):((result.candidates as {content?:{parts?:{text?:string}[]}}[]|undefined)?.[0]?.content?.parts?.map(x=>x.text||'').join('')||'');
  try{
   if(d.op==='board')return C.validateBoard(raw,d.avoid);
   const out=C.predictions(raw,d.typed,d.avoid);
   if(d.target==='words'?!out.words.length:d.target==='phrases'?!out.phrases.length:!out.words.length||!out.phrases.length)throw Error('Missing predictions');
   return out;
  }catch{if(attempt)fail(502,'AI returned unusable suggestions. Saved phrases and dictionary predictions still work.');
   prompt+='\nCorrect the following unusable response. Fill all required choices with different short continuations that fit the draft/context. JSON only: '+JSON.stringify(raw.slice(0,6000));}
 }
 fail(502,'No suggestions returned.');
}
