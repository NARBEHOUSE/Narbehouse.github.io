export class Failure extends Error { constructor(public status: number, message: string) { super(message); } }
export function fail(status: number, message: string): never { throw new Failure(status, message); }
export const random = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), x=>x.toString(16).padStart(2,'0')).join('');
export const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), x=>x.toString(16).padStart(2,'0')).join('');
export const hash = async (value: string) => hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));
export function equal(a: string,b: string) { const x=new TextEncoder().encode(a),y=new TextEncoder().encode(b);return x.length===y.length&&crypto.subtle.timingSafeEqual(x,y); }
export function record(value: unknown): Record<string,unknown> { if(!value||typeof value!=='object'||Array.isArray(value))fail(400,'Invalid request.');return value as Record<string,unknown>; }
export function text(value: unknown,max: number,required=false): string { if(typeof value!=='string'||value.length>max||(required&&!value.trim()))fail(400,'Invalid or oversized text.');return value; }
export async function readJson(source: Request|Response,max=24576): Promise<unknown> {
 if(Number(source.headers.get('content-length'))>max)fail(413,'Request is too large.');
 if(!source.body)fail(400,'JSON body required.');
 const reader=source.body.getReader(),parts:Uint8Array[]=[];let length=0;
 try { for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>max){await reader.cancel();fail(413,'Request is too large.');}parts.push(value);} }
 finally { reader.releaseLock(); }
 const bytes=new Uint8Array(length);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
 try{return JSON.parse(new TextDecoder().decode(bytes));}catch{fail(400,'Invalid JSON.');}
}
export const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
export type Provider='openai'|'anthropic'|'google';
export const MODELS: Record<Provider,string[]> = {openai:['gpt-4o-mini','gpt-4.1-mini'],anthropic:['claude-haiku-4-5-20251001'],google:['gemini-2.5-flash-lite','gemini-2.5-flash']};
export function provider(value:unknown):Provider {if(value!=='openai'&&value!=='anthropic'&&value!=='google')fail(400,'Choose a supported provider.');return value;}
export function model(p:Provider,value:unknown):string {const m=text(value,100,true);if(!MODELS[p].includes(m))fail(400,'Choose a supported model.');return m;}
export type Bindings=Env & {VAULT_KEY:string};
export function configured(env:Bindings){if(!/^[a-f0-9]{64}$/i.test(env.VAULT_KEY||''))fail(503,'The key service is not configured yet.');}
export type Encrypted={iv:string;data:string};
export async function crypt(env:Bindings,id:string,p:Provider,value:string|Encrypted):Promise<Encrypted|string>{
 configured(env);
 const keyBytes=Uint8Array.from(env.VAULT_KEY.match(/../g)!,x=>parseInt(x,16));
 const key=await crypto.subtle.importKey('raw',keyBytes,'AES-GCM',false,['encrypt','decrypt']);
 const aad=new TextEncoder().encode('bennys-byok:v1:'+id+':'+p);
 if(typeof value==='string'){
  const iv=crypto.getRandomValues(new Uint8Array(12)),data=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad},key,new TextEncoder().encode(value));
  return {iv:hex(iv.buffer),data:hex(data)};
 }
 const bytes=(s:string)=>Uint8Array.from(s.match(/../g)!,x=>parseInt(x,16));
 return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(value.iv),additionalData:aad},key,bytes(value.data)));
}
