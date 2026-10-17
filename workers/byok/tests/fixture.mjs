import fs from 'node:fs/promises';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, createHash } from 'node:crypto';
export const workerRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const key='sk-proj-'+randomBytes(32).toString('hex');
export const random=()=>randomBytes(32).toString('hex');
export const hash=v=>createHash('sha256').update(v).digest('hex');
export const sample=()=>({id:crypto.randomUUID(),op:'board',snapshot:{summary:'',recent:[{speaker:'room',source:'speech',text:'Would you like lunch in the park?'}],justSaid:[],unsummarized:[]},profile:{bio:'I like music and parks.',profanity:false},avoid:[]});
export const board={general:['That sounds good','Maybe a bit later','Tell me more','I would like that'],specific:['Let us go outside','I would prefer soup','Which park do you mean','Can we eat together'],summary:'The other person offered lunch in the park.'};
export async function fixture(options={}){
 let calls=[],responseMode='ok',hold=null;
 const mf=new Miniflare(convertV4MiniflareOptions({modules:[{type:'ESModule',path:path.join(workerRoot,'dist/worker.js')},...(await fs.readdir(path.join(workerRoot,'dist'))).filter(n=>/\.(txt|html)$/.test(n)).map(n=>({type:'Text',path:path.join(workerRoot,'dist',n)}))],modulesRoot:path.join(workerRoot,'dist'),compatibilityDate:'2026-10-17',compatibilityFlags:['nodejs_compat'],
 bindings:{VAULT_KEY:random(),APP_ORIGINS:options.origin||'https://hub.example',DAILY_CALL_LIMIT:options.daily||'2000'},
 durableObjects:{VAULTS:{className:'UserVault',useSQLite:true}},...(options.persist?{durableObjectsPersist:options.persist}:{}),
 ratelimits:{REQUEST_LIMITER:{namespace_id:'1',simple:{limit:10000,period:60}},SETUP_LIMITER:{namespace_id:'2',simple:{limit:10000,period:60}}},
 outboundService:async req=>{
  const data=await req.json();calls.push({url:req.url,headers:Object.fromEntries(req.headers),data});if(hold)await hold;
  if(responseMode==='redirect')return new Response(null,{status:302,headers:{Location:'https://evil.example/key-theft'}});
  if(responseMode==='network')throw Error('Synthetic network failure');
  if(responseMode==='reject')return new Response(JSON.stringify({error:'provider detail '+key}),{status:401});
  if(responseMode==='limit')return new Response('quota',{status:429});
  const prompt=data.messages?.[0]?.content||data.contents?.[0]?.parts?.[0]?.text||'';
  const draft=JSON.parse(prompt.match(/ACTUAL TEXT BEFORE THE CURSOR: (.+)\n/)?.[1]||'""');
  const predictions=draft==='that sounds good '?{words:['thanks','to'],phrases:['to me','thanks for asking']}:{words:['sounds','sound'],phrases:['sounds good','sounds interesting']};
  const result=responseMode==='invalid'?'not valid JSON':JSON.stringify(prompt.includes('ACTUAL TEXT BEFORE THE CURSOR')?predictions:board);
  if(req.url.includes('anthropic'))return Response.json({content:[{type:'text',text:result}]});
  if(req.url.includes('googleapis'))return Response.json({candidates:[{content:{parts:[{text:result}]}}]});
  return Response.json({choices:[{message:{content:result}}]});
 }}));
 await mf.ready;
 const origin=options.origin||'https://hub.example',host='https://keys.example',base='/api/byok/v1';
 async function call(route,{body,method,token,cookie,headers={},requestOrigin=origin}={}){
  const h={Origin:requestOrigin,...headers};if(body!==undefined)h['Content-Type']='application/json';if(token)h.Authorization='Bearer '+token;if(cookie)h.Cookie=cookie;
  return mf.dispatchFetch(host+base+route,{method:method||(body===undefined?'GET':'POST'),headers:h,...(body===undefined?{}:{body:JSON.stringify(body)})});
 }
 const manage=(route,body,cookie,extra={})=>call('/manage/'+route,{body,cookie,requestOrigin:host,headers:{'X-Benny-Setup':'1','Sec-Fetch-Site':'same-origin'},...extra});
 async function enroll(p='openai',k=key){
  const r=await manage('save',{provider:p,key:k});if(r.status!==200)throw Error('Enroll: '+r.status+' '+await r.text());return r.headers.get('set-cookie').split(';')[0];
 }
 async function connect(cookie,p='openai',model='gpt-4o-mini'){
  const verifier=random(),r=await manage('connect',{app:'rtc-lite',origin,provider:p,model,challenge:hash(verifier)},cookie),d=await r.json();
  if(!r.ok)throw Error(JSON.stringify(d));
  const code=d.session+'.'+d.code;const response=await call('/exchange',{body:{code,verifier}}),connection=await response.json();
  if(!response.ok)throw Error(JSON.stringify(connection));return {...connection,code,verifier};
 }
 return {mf,call,manage,enroll,connect,calls:()=>calls,setMode:m=>responseMode=m,setHold:h=>hold=h};
}
