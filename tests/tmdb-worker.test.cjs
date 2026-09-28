const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
test('TMDB Worker restricts routes, keeps the token private, caches metadata and rate-limits',async()=>{
  const {default:worker,metadataURL}=await import('../workers/tmdb/worker.mjs');
  for(const route of ['/3/account','/3/movie/1?url=https://evil.example','/3/search/movie?query=x&api_key=leak','/3/search/movie?query=x&query=y','/3/movie/1?append_to_response=account_states','/3/search/movie?query=x&page=500'])assert.throws(()=>metadataURL('https://metadata.test'+route));
  const memory=new Map(),savedFetch=global.fetch,savedCaches=global.caches,queued=[];let calls=0,allow=true,upstreamOK=true;
  global.caches={default:{async match(key){return memory.get(key.url)?.clone();},async put(key,value){assert.ok(!key.url.includes('secret'));memory.set(key.url,value.clone());}}};
  global.fetch=async(url,options)=>{calls++;assert.equal(url.origin,'https://api.themoviedb.org');assert.equal(options.redirect,'manual');assert.equal(options.headers.Authorization,'Bearer synthetic-secret');assert.equal(url.searchParams.has('api_key'),false);return new Response(JSON.stringify(upstreamOK?{results:[{id:1,title:'Synthetic title'}]}:{error:'synthetic-secret'}),{status:upstreamOK?200:401});};
  const env={ALLOWED_ORIGINS:'https://hub.test,https://second.test',TMDB_READ_TOKEN:'synthetic-secret',CLIENT_LIMIT:{limit:async()=>({success:allow})},UPSTREAM_LIMIT:{limit:async()=>({success:true})}};
  const request=(route='/3/search/movie?query=example',origin='https://hub.test',method='GET')=>new Request('https://metadata.test'+route,{method,headers:{Origin:origin,'CF-Connecting-IP':'192.0.2.1'}});
  const ctx={waitUntil(p){queued.push(p);}};
  try{
    assert.equal((await worker.fetch(request(undefined,'https://evil.test'),env,ctx)).status,403);
    assert.equal((await worker.fetch(request(undefined,undefined,'POST'),env,ctx)).status,405);
    assert.equal((await worker.fetch(request(undefined,undefined,'OPTIONS'),env,ctx)).status,204);
    assert.equal((await worker.fetch(request('/3/account'),env,ctx)).status,400);assert.equal(calls,0);
    const first=await worker.fetch(request(),env,ctx);assert.equal(first.status,200);assert.doesNotMatch(await first.text(),/synthetic-secret/);await Promise.all(queued);
    const cached=await worker.fetch(request(undefined,'https://second.test'),env,ctx);assert.equal(cached.headers.get('Access-Control-Allow-Origin'),'https://second.test');assert.equal(calls,1);
    allow=false;assert.equal((await worker.fetch(request(),env,ctx)).status,429);allow=true;upstreamOK=false;
    const failed=await worker.fetch(request('/3/movie/2'),env,ctx);assert.equal(failed.status,502);assert.doesNotMatch(await failed.text(),/synthetic-secret/);
    assert.equal((await worker.fetch(request(),{...env,TMDB_READ_TOKEN:''},ctx)).status,503);
    upstreamOK=true;
    assert.equal((await worker.fetch(request('/3/movie/3'),{...env,TMDB_READ_TOKEN:' synthetic-secret\r\n'},ctx)).status,200);
    const invalid=await worker.fetch(request('/3/movie/4'),{...env,TMDB_READ_TOKEN:'synthetic\nsecret'},ctx);assert.equal(invalid.status,503);assert.equal((await invalid.json()).code,'credential_format');
    const apiKey='0123456789abcdef'.repeat(2) /* synthetic API-key shape, never a credential */;
    global.fetch=async(url,options)=>{assert.equal(url.origin,'https://api.themoviedb.org');assert.equal(url.searchParams.get('api_key'),apiKey);assert.equal(options.headers.Authorization,undefined);assert.equal(options.redirect,'manual');return new Response('{"id":5}');};
    const legacy=await worker.fetch(request('/3/movie/5'),{...env,TMDB_READ_TOKEN:apiKey+'\r\n'},ctx);assert.equal(legacy.status,200);assert.doesNotMatch(await legacy.text(),new RegExp(apiKey));
    await Promise.all(queued);assert.ok([...memory.keys()].every(key=>!key.includes('api_key')&&!key.includes(apiKey)));
    global.fetch=async()=>{throw new TypeError('Private synthetic-secret');};
    const exception=await worker.fetch(request('/3/movie/6'),env,ctx);const safe=await exception.json();assert.equal(safe.code,'tmdb_request_TypeError');assert.doesNotMatch(JSON.stringify(safe),/synthetic-secret/);
  }finally{global.fetch=savedFetch;global.caches=savedCaches;}
});
test('editor Worker mode strips client credentials and keeps personal-key mode available',()=>{
  const env={StreamingServices:require('../bennyshub/apps/tools/streaming/services.js'),URL,WebStreaming:{escapeHTML:x=>x},document:{addEventListener(){},getElementById(){return {value:'personal-test-key'};}},window:{BennyMetadataConfig:{workerURL:'https://metadata.test'}}};
  vm.runInNewContext(fs.readFileSync('bennyshub/apps/tools/streaming/editor.js','utf8'),env);
  assert.equal(env.metadataCredential(),'worker');
  assert.equal(env.getApiUrl('tmdb','3/search/movie?api_key=personal-test-key&query=Example'),'https://metadata.test/3/search/movie?query=Example');
  env.window.BennyMetadataConfig.workerURL='';assert.equal(env.metadataCredential(),'personal-test-key');assert.ok(env.getApiUrl('tmdb','3/movie/1?api_key=personal-test-key').startsWith('https://api.themoviedb.org/'));
  env.window.BennyMetadataConfig.workerURL='https://user:password@metadata.test';assert.throws(()=>env.metadataWorkerURL());
});
