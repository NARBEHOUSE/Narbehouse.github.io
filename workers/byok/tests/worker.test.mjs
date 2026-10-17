import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fixture,key,random,hash,sample } from './fixture.mjs';
test('real Worker: isolated encrypted keys, one-time proof-bound app grants and fixed RTC operations',async()=>{
 const store=await fs.mkdtemp(path.join(os.tmpdir(),'benny-byok-store-')),f=await fixture({persist:store});
 try{
  const cookie=await f.enroll(),other=await f.enroll();
  assert.match(cookie,/__Host-benny-byok=/);assert.notEqual(cookie,other);
  const a=await f.connect(cookie),b=await f.connect(other);
  assert.notEqual(a.token,b.token);assert.equal(f.calls().length,0);
  assert.equal((await f.call('/exchange',{body:{code:a.code,verifier:a.verifier}})).status,401);
  assert.equal((await f.call('/connection',{token:a.token,requestOrigin:'https://evil.example'})).status,403);
  assert.equal((await f.call('/connection')).status,401);
  const r=await f.call('/apps/rtc-lite/generate',{token:a.token,body:sample()});assert.equal(r.status,200,await r.clone().text());
  assert.equal(r.headers.get('access-control-allow-origin'),'https://hub.example');assert.equal(r.headers.get('access-control-allow-credentials'),null);
  assert.equal((await r.json()).specific.length,4);assert.equal(f.calls().length,1);assert.equal(f.calls()[0].url,'https://api.openai.com/v1/chat/completions');
  assert.equal((await f.call('/proxy',{token:a.token,body:{url:'https://evil.example'}})).status,404);
  assert.equal((await f.call('/apps/other/generate',{token:a.token,body:sample()})).status,404);
  const wrongOwner='__Host-benny-byok='+a.token;
  assert.equal((await f.manage('status',undefined,wrongOwner)).status,401);
  await f.manage('remove',{provider:'openai'},cookie);
  assert.equal((await f.call('/connection',{token:a.token})).status,401);
  assert.equal((await f.call('/connection',{token:b.token})).status,200);
  assert.equal((await f.call('/connection',{token:b.token,method:'DELETE'})).status,200);
  assert.equal((await f.call('/connection',{token:b.token})).status,401);
 }finally{await f.mf.dispose();}
 const paths=await fs.readdir(store,{recursive:true});
 for(const p of paths){const file=path.join(store,p);if((await fs.stat(file)).isFile()){const bytes=await fs.readFile(file);assert.equal(bytes.includes(Buffer.from(key)),false,'Plaintext key in storage');assert.equal(bytes.includes(Buffer.from('I like music and parks.')),false,'Bio persisted');}}
 const resolved=await fs.realpath(store);assert(resolved.startsWith(await fs.realpath(os.tmpdir())));assert(path.basename(resolved).startsWith('benny-byok-store-'));await fs.rm(resolved,{recursive:true});
});
test('CSRF, unauthorized origins, wrong proof, malformed input, and unsafe model selection fail closed',async()=>{
 const f=await fixture();try{
  assert.equal((await f.call('/manage/save',{body:{provider:'openai',key}})).status,403);
  assert.equal((await f.manage('save',{provider:'openai',key},undefined,{headers:{'X-Benny-Setup':'1','Sec-Fetch-Site':'cross-site'}})).status,403);
  const cookie=await f.enroll(),verifier=random(),challenge=hash(verifier);
  assert.equal((await f.manage('connect',{app:'rtc-lite',origin:'https://evil.example',provider:'openai',model:'gpt-4o-mini',challenge},cookie)).status,400);
  assert.equal((await f.manage('connect',{app:'rtc-lite',origin:'https://hub.example',provider:'openai',model:'arbitrary-expensive-model',challenge},cookie)).status,400);
  const d=await (await f.manage('connect',{app:'rtc-lite',origin:'https://hub.example',provider:'openai',model:'gpt-4o-mini',challenge},cookie)).json();
  assert.equal((await f.call('/exchange',{body:{code:d.session+'.'+d.code,verifier:random()}})).status,401);
  const a=await f.connect(cookie);
  const invalid=sample();invalid.profile.bio='x'.repeat(1501);assert.equal((await f.call('/apps/rtc-lite/generate',{token:a.token,body:invalid})).status,400);
  assert.equal((await f.call('/apps/rtc-lite/generate',{token:a.token,body:{...sample(),extra:'x'.repeat(25000)}})).status,413);
  const pre=await f.call('/apps/rtc-lite/generate',{method:'OPTIONS',headers:{'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,content-type'}});assert.equal(pre.status,204);
  assert.equal(f.calls().length,0);
 }finally{await f.mf.dispose();}
});
test('duplicates, provider failures, repair and daily limits cannot silently repeat paid calls',async()=>{
 const f=await fixture({daily:'4'});try{
  const a=await f.connect(await f.enroll()),s=sample();
  assert.equal((await f.call('/apps/rtc-lite/generate',{token:a.token,body:s})).status,200);
  assert.equal((await f.call('/apps/rtc-lite/generate',{token:a.token,body:s})).status,409);
  f.setMode('reject');const r=await f.call('/apps/rtc-lite/generate',{token:a.token,body:sample()});assert.equal(r.status,424);assert.equal((await r.text()).includes(key),false);assert.equal(f.calls().length,2);
  f.setMode('invalid');assert.equal((await f.call('/apps/rtc-lite/generate',{token:a.token,body:sample()})).status,502);assert.equal(f.calls().length,4);
  f.setMode('ok');assert.equal((await f.call('/apps/rtc-lite/generate',{token:a.token,body:sample()})).status,429);assert.equal(f.calls().length,4);
 }finally{await f.mf.dispose();}
});
test('all three providers use fixed endpoints and key removal revokes access',async()=>{
 const f=await fixture();try{
  for(const [p,k,m,host] of [['anthropic','sk-ant-'+random(),'claude-haiku-4-5-20251001','api.anthropic.com'],['google','AIza'+random(),'gemini-2.5-flash-lite','generativelanguage.googleapis.com']]){
   const cookie=await f.enroll(p,k),a=await f.connect(cookie,p,m);
   const r=await f.call('/apps/rtc-lite/generate',{token:a.token,body:{...sample(),op:'predictions',typed:'that sou',purpose:'bio'}});assert.equal(r.status,200,await r.clone().text());assert.equal(new URL(f.calls().at(-1).url).host,host);
   assert.equal((await f.manage('delete-all',{},cookie)).status,200);assert.equal((await f.call('/connection',{token:a.token})).status,401);
  }
 }finally{await f.mf.dispose();}
});

test('expired codes and sessions are refused; in-flight work is bounded and redirects are not followed',async()=>{
 const f=await fixture();try{
  const cookie=await f.enroll(),a=await f.connect(cookie),bindings=await f.mf.getBindings(),stub=bindings.VAULTS.getByName(a.token.split('.')[0]);
  let release;f.setHold(new Promise(resolve=>{release=resolve;}));
  const pending=[f.call('/apps/rtc-lite/generate',{token:a.token,body:sample()}),f.call('/apps/rtc-lite/generate',{token:a.token,body:sample()})];
  while(f.calls().length<2)await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal((await f.call('/apps/rtc-lite/generate',{token:a.token,body:sample()})).status,429);
  release();await Promise.all(pending);f.setHold(null);
  f.setMode('redirect');assert.equal((await f.call('/apps/rtc-lite/generate',{token:a.token,body:sample()})).status,502);
  assert.equal(f.calls().length,3);
  const verifier=random(),d=await (await f.manage('connect',{app:'rtc-lite',origin:'https://hub.example',provider:'openai',model:'gpt-4o-mini',challenge:hash(verifier)},cookie)).json();
  // Test-only binding access: these RPCs are never exposed by a public HTTP route.
  const state=JSON.parse(JSON.stringify(await stub.live()));state.codes[hash(d.code)].expires=0;await stub.persist(state);
  assert.equal((await f.call('/exchange',{body:{code:d.session+'.'+d.code,verifier}})).status,401);
  const expired=JSON.parse(JSON.stringify(await stub.live()));expired.expires=0;await stub.persist(expired);
  assert.equal((await f.call('/connection',{token:a.token})).status,401);
 }finally{await f.mf.dispose();}
});
