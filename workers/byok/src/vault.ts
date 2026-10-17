import { DurableObject } from 'cloudflare:workers';
import { crypt, hash, equal, random, fail, Failure, record, text, provider, model, type Encrypted, type Provider, type Bindings } from './util';
import { input, generate } from './rtc';
type Grant={app:string;origin:string;provider:Provider;model:string;expires:number};
type Code=Grant & {challenge:string};
export type VaultResult={ok:true;value:unknown}|{ok:false;status:number;message:string};
type State={owner:string;expires:number;keys:Partial<Record<Provider,Encrypted>>;codes:Record<string,Code>;grants:Record<string,Grant>;day:string;used:number;minute:number;minuteUsed:number;requests:Record<string,number>;active:Record<string,number>};
export class UserVault extends DurableObject<Bindings>{
 private state:State|null=null;
 private queue:Promise<unknown>=Promise.resolve();
 constructor(ctx:DurableObjectState,env:Bindings){super(ctx,env);ctx.blockConcurrencyWhile(async()=>{this.state=await ctx.storage.get<State>('vault')??null;});}
 private serial<T>(fn:()=>Promise<T>):Promise<T>{const result=this.queue.then(fn);this.queue=result.catch(()=>{});return result;}
 private async persist(next:State){await this.ctx.storage.put('vault',next);this.state=next;}
 private async live(){if(!this.state||this.state.expires<=Date.now()){await this.ctx.storage.deleteAll();this.state=null;fail(401,'Connection expired. Connect your AI again.');}return this.state;}
 private async owner(secret:string){const s=await this.live();if(!equal(s.owner,await hash(secret)))fail(401,'Open key setup again.');return s;}
 private async grant(secret:string,origin:string){const s=await this.live(),g=s.grants[await hash(secret)];if(!g||g.expires<=Date.now()||g.origin!==origin||g.app!=='rtc-lite')fail(401,'Connection expired or removed. Connect your AI again.');if(!s.keys[g.provider])fail(401,'Provider key removed. Connect your AI again.');return g;}
 async initialize(secret:string){return this.serial(async()=>{if(this.state)fail(409,'Session already exists.');const expires=Date.now()+30*86400000;const next:State={owner:await hash(secret),expires,keys:{},codes:{},grants:{},day:'',used:0,minute:0,minuteUsed:0,requests:{},active:{}};await this.persist(next);await this.ctx.storage.setAlarm(expires);return true;});}
 async call(action:string,secret:string,data:unknown,origin:string):Promise<string>{return JSON.stringify(await this.handle(action,secret,data,origin));}
 private async handle(action:string,secret:string,data:unknown,origin:string):Promise<VaultResult>{
  try{
   if(action==='generate'){
    const d=input(data);
    const g=await this.serial(async()=>{
     const g=await this.grant(secret,origin),s=structuredClone(await this.live()),now=Date.now();
     s.requests=Object.fromEntries(Object.entries(s.requests).filter(([,at])=>at>now-600000));
     s.active=Object.fromEntries(Object.entries(s.active).filter(([,at])=>at>now));
     if(s.requests[d.id])fail(409,'This request has already been sent. Choose refresh for a new request.');
     if(Object.keys(s.active).length>=2)fail(429,'Please wait for the current AI request.');
     if(Object.keys(s.requests).length>=720)fail(429,'Too many recent requests. Please wait.');
     s.requests[d.id]=now;s.active[d.id]=now+70000;await this.persist(s);return g;
    });
    try{
     const encrypted=(await this.live()).keys[g.provider]!;
     const key=await crypt(this.env,this.ctx.id.toString(),g.provider,encrypted);
     if(typeof key!=='string')fail(503,'Key could not be opened.');
     const value=await generate(d,g.provider,key,g.model,()=>this.serial(async()=>{
      await this.grant(secret,origin);const s=structuredClone(await this.live()),day=new Date().toISOString().slice(0,10),minute=Math.floor(Date.now()/60000);
      if(s.day!==day){s.day=day;s.used=0;}if(s.minute!==minute){s.minute=minute;s.minuteUsed=0;}
      const limit=Math.max(1,Math.min(10000,Number(this.env.DAILY_CALL_LIMIT)||2000));
      if(s.used>=limit||s.minuteUsed>=60)fail(429,'This connection has reached its request limit. Try later or use local predictions.');
      s.used++;s.minuteUsed++;await this.persist(s);
     }));
     return {ok:true as const,value};
    }finally{await this.serial(async()=>{if(this.state){const s=structuredClone(this.state);delete s.active[d.id];await this.persist(s);}});}
   }
   const value=await this.serial(async()=>{
    if(action==='exchange'){
     const d=record(data),codeHash=await hash(secret),s=structuredClone(await this.live()),code=s.codes[codeHash];
     if(!code||code.expires<=Date.now()||code.origin!==origin)fail(401,'Connection code expired or invalid.');
     const verifier=text(d.verifier,64,true);if(!/^[a-f0-9]{64}$/.test(verifier)||!equal(await hash(verifier),code.challenge))fail(401,'Connection verification failed.');
     delete s.codes[codeHash];
     s.grants=Object.fromEntries(Object.entries(s.grants).filter(([,g])=>g.expires>Date.now()&&!(g.app===code.app&&g.origin===code.origin)));
     if(Object.keys(s.grants).length>=12)fail(429,'Too many app connections. Remove old keys first.');
     const token=random(),g:Grant={app:code.app,origin:code.origin,provider:code.provider,model:code.model,expires:s.expires};
     s.grants[await hash(token)]=g;await this.persist(s);return {token,provider:g.provider,model:g.model,expiresAt:g.expires};
    }
    if(action==='connection'||action==='disconnect'){
     const g=await this.grant(secret,origin);
     if(action==='disconnect'){const s=structuredClone(await this.live());delete s.grants[await hash(secret)];await this.persist(s);return {disconnected:true};}
     return {provider:g.provider,model:g.model,expiresAt:g.expires};
    }
    const current=await this.owner(secret);
    if(action==='status')return {providers:Object.keys(current.keys),expiresAt:current.expires};
    if(action==='delete-all'){await this.ctx.storage.deleteAll();this.state=null;return {removed:true};}
    const d=record(data),s=structuredClone(current),p=provider(d.provider);
    if(action==='save'){
     const key=text(d.key,512,true).trim();
     if(!/^[\x21-\x7e]{20,512}$/.test(key)||(p==='openai'&&!key.startsWith('sk-'))||(p==='anthropic'&&!key.startsWith('sk-ant-'))||(p==='google'&&!key.startsWith('AIza')))fail(400,'The key does not match the selected provider.');
     const encrypted=await crypt(this.env,this.ctx.id.toString(),p,key);if(typeof encrypted==='string')fail(503,'Could not save key.');
     s.keys[p]=encrypted;await this.persist(s);return {providers:Object.keys(s.keys),expiresAt:s.expires};
    }
    if(action==='remove'){
     delete s.keys[p];s.grants=Object.fromEntries(Object.entries(s.grants).filter(([,g])=>g.provider!==p));s.codes=Object.fromEntries(Object.entries(s.codes).filter(([,g])=>g.provider!==p));
     await this.persist(s);return {providers:Object.keys(s.keys),expiresAt:s.expires};
    }
    if(action==='connect'){
     if(!s.keys[p])fail(400,'Save a key for this provider first.');
     const app=text(d.app,30,true),appOrigin=text(d.origin,200,true),challenge=text(d.challenge,64,true);
     if(app!=='rtc-lite'||!this.env.APP_ORIGINS.split(',').map(x=>x.trim()).includes(appOrigin)||!/^[a-f0-9]{64}$/.test(challenge))fail(400,'Invalid connection request.');
     s.codes=Object.fromEntries(Object.entries(s.codes).filter(([,c])=>c.expires>Date.now()));
     if(Object.keys(s.codes).length>=8)fail(429,'Too many connection attempts. Wait two minutes.');
     const code=random();s.codes[await hash(code)]={app,origin:appOrigin,provider:p,model:model(p,d.model),expires:Date.now()+120000,challenge};
     await this.persist(s);return {code};
    }
    fail(404,'Unknown operation.');
   });
   return {ok:true as const,value};
  }catch(e){return {ok:false as const,status:e instanceof Failure?e.status:503,message:e instanceof Failure?e.message:'The key service could not complete the request.'};}
 }
 async alarm(){await this.serial(async()=>{if(this.state&&this.state.expires>Date.now())await this.ctx.storage.setAlarm(this.state.expires);else{await this.ctx.storage.deleteAll();this.state=null;}});}
}
