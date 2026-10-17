import type { VaultResult } from './vault';
import { configured, fail, Failure, json, random, readJson, record, text, type Bindings } from './util';
import { setupHtml, setupScript } from './setup';
export { UserVault } from './vault';
const COOKIE='__Host-benny-byok';
const API='/api/byok/v1';
const split=(value:string)=>{const match=/^([a-f0-9]{64})\.([a-f0-9]{64})$/.exec(value);if(!match)fail(401,'Connect your AI in Settings.');return {id:match[1],secret:match[2]};};
function cookie(request:Request){return request.headers.get('Cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1)||'';}
function setCookie(value:string){return COOKIE+'='+value+'; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age='+(value?'2592000':'0');}
const management=(request:Request,url:URL)=>{if((request.headers.get('Origin')!==url.origin&&!(request.method==='GET'&&!request.headers.get('Origin')&&request.headers.get('Sec-Fetch-Site')==='same-origin'))||!['same-origin','none',null].includes(request.headers.get('Sec-Fetch-Site'))||request.headers.get('X-Benny-Setup')!=='1')fail(403,'Open the key setup page to manage your keys.');};
function originFor(request:Request,env:Bindings){const origin=request.headers.get('Origin')||'';if(!env.APP_ORIGINS.split(',').map(x=>x.trim()).includes(origin))fail(403,'App origin is not allowed.');return origin;}
export default {
 async fetch(request:Request,env:Bindings):Promise<Response>{
  let cors='';
  try{
   const url=new URL(request.url);
   if(url.pathname.startsWith(API+'/')&&!url.pathname.startsWith(API+'/manage/')&&env.APP_ORIGINS.split(',').map(x=>x.trim()).includes(request.headers.get('Origin')||''))cors=request.headers.get('Origin')||'';
   if(url.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(url.hostname))fail(400,'HTTPS is required.');
   if(!(await env.REQUEST_LIMITER.limit({key:request.headers.get('CF-Connecting-IP')||'local'})).success)fail(429,'Too many requests. Please wait.');
   if(request.method==='GET'&&url.pathname==='/health')return json({service:'bennys-hub-byok',version:1,apps:['rtc-lite'],ready:/^[a-f0-9]{64}$/i.test(env.VAULT_KEY||'')});
   if(request.method==='GET'&&(url.pathname==='/'||url.pathname==='/connect')){
    const response=new Response(setupHtml,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"}});
    return response;
   }
   if(request.method==='GET'&&url.pathname==='/setup.js')return new Response(setupScript,{headers:{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
   configured(env);
   if(url.pathname.startsWith(API+'/manage/')){
    const action=url.pathname.slice((API+'/manage/').length);
    if(!['status','save','remove','connect','delete-all'].includes(action))fail(404,'Not found.');
    management(request,url);
    if(request.method!==(action==='status'?'GET':'POST'))fail(405,'Method not allowed.');
    if(!(await env.SETUP_LIMITER.limit({key:request.headers.get('CF-Connecting-IP')||'local'})).success)fail(429,'Too many setup requests. Wait a minute.');
    let session=cookie(request),created=false;
    if(!session&&action==='status')return json({providers:[],expiresAt:0});
    if(!session&&action==='save'){session=random()+'.'+random();created=true;}
    const auth=split(session),stub=env.VAULTS.getByName(auth.id);
    const data=action==='status'?{}:await readJson(request,4096);
    if(created)await stub.initialize(auth.secret);
    const result:VaultResult=JSON.parse(await stub.call(action,auth.secret,data,''));
    if(!result.ok){const response=json({error:result.message},result.status);if(result.status===401)response.headers.set('Set-Cookie',setCookie(''));return response;}
    const response=json(action==='connect'?{...record(result.value),session:auth.id}:result.value);
    if(created||action==='delete-all')response.headers.set('Set-Cookie',setCookie(action==='delete-all'?'':session));
    return response;
   }
   if(![API+'/exchange',API+'/connection',API+'/apps/rtc-lite/generate'].includes(url.pathname))fail(404,'Not found.');
   cors=originFor(request,env);
   if(request.method==='OPTIONS'){
    if(!['GET','POST','DELETE'].includes(request.headers.get('Access-Control-Request-Method')||''))fail(405,'Method not allowed.');
    const requested=(request.headers.get('Access-Control-Request-Headers')||'').toLowerCase().split(',').map(x=>x.trim()).filter(Boolean);
    if(requested.some(x=>!['authorization','content-type'].includes(x)))fail(403,'Header not allowed.');
    const response=new Response(null,{status:204,headers:{'Access-Control-Allow-Methods':'GET, POST, DELETE','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Max-Age':'600'}});
    response.headers.set('Access-Control-Allow-Origin',cors);response.headers.set('Vary','Origin');return response;
   }
   let auth:{id:string;secret:string},action:string,data:unknown={};
   if(url.pathname===API+'/exchange'){
    if(request.method!=='POST')fail(405,'Method not allowed.');
    const body=record(await readJson(request,2048));auth=split(text(body.code,129,true));data={verifier:body.verifier};action='exchange';
   }else{
    auth=split((request.headers.get('Authorization')||'').replace(/^Bearer /,''));
    if(url.pathname===API+'/connection'){if(!['GET','DELETE'].includes(request.method))fail(405,'Method not allowed.');action=request.method==='DELETE'?'disconnect':'connection';}
    else{if(request.method!=='POST')fail(405,'Method not allowed.');action='generate';data=await readJson(request);}
   }
   const result:VaultResult=JSON.parse(await env.VAULTS.getByName(auth.id).call(action,auth.secret,data,cors));
   if(!result.ok)fail(result.status,result.message);
   const value=action==='exchange'?{...record(result.value),token:auth.id+'.'+record(result.value).token}:result.value;
   const response=json(value);response.headers.set('Access-Control-Allow-Origin',cors);response.headers.set('Vary','Origin');return response;
  }catch(e){
   const response=json({error:e instanceof Failure?e.message:'The key service is temporarily unavailable.'},e instanceof Failure?e.status:503);
   if(cors){response.headers.set('Access-Control-Allow-Origin',cors);response.headers.set('Vary','Origin');}
   return response;
  }
 }
} satisfies ExportedHandler<Bindings>;
