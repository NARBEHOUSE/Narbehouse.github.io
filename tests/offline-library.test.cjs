'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const source=fs.readFileSync(path.join(__dirname,'../bennyshub/service-worker.js'),'utf8');
const SCOPE='https://example.test/bennyshub/',LIBRARY='benny-offline-library-v1';
const url=relative=>new URL(relative,SCOPE).href;
function manifestFor(files){
  const assets=Object.entries(files).map(([relative,body])=>({url:relative,revision:crypto.createHash('sha256').update(body).digest('hex'),bytes:Buffer.byteLength(body)}));
  return {schema:1,version:crypto.createHash('sha256').update(JSON.stringify(assets)).digest('hex'),totalBytes:assets.reduce((sum,item)=>sum+item.bytes,0),assets};
}
function harness(files,stores=new Map()){
  const events={},routes=new Map(),requests=[],messages=[];
  const h={offline:false,stall:false,stallUrls:new Set(),failUrls:new Set(),quotaUrls:new Set(),events,stores,requests,messages,background:[],backgroundErrors:[]};
  const keyOf=value=>url(typeof value==='string'?value:value.url);
  const fetcher=async(input,options={})=>{
    const key=keyOf(input);requests.push(key);
    if(h.stall||h.stallUrls.has(key))return new Promise((resolve,reject)=>{
      const signal=options.signal||input.signal;
      const abort=()=>reject(new DOMException('Request timed out','AbortError'));
      if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
    });
    if(h.offline||h.failUrls.has(key))throw new TypeError('Network interrupted');
    const route=routes.get(key);return route?route.clone():new Response('Public shell',{headers:{'Content-Type':'text/html'}});
  };
  const caches={
    async open(name){
      if(!stores.has(name))stores.set(name,new Map());const store=stores.get(name);
      return {
        async match(key){const response=store.get(keyOf(key))?.clone();if(name==='benny-offline-meta-v1'&&h.waitForMetaRead)await h.waitForMetaRead();return response;},
        async put(key,response){if(name===LIBRARY&&h.quotaUrls.has(keyOf(key)))throw new DOMException('Quota exceeded','QuotaExceededError');store.set(keyOf(key),response.clone());},
        async delete(key){return store.delete(keyOf(key));},
        async keys(){return [...store.keys()].map(key=>new Request(key));},
        async addAll(keys){for(const key of keys){const response=await fetcher(key);if(!response.ok)throw Error('Unavailable');store.set(keyOf(key),response.clone());}}
      };
    },
    async keys(){return [...stores.keys()];},async delete(name){return stores.delete(name);}
  };
  const client={url:SCOPE,postMessage:message=>messages.push(JSON.parse(JSON.stringify(message)))};
  // Keep network timeout behavior real without making tests wait production seconds.
  const workerTimer=(callback,delay)=>setTimeout(callback,Math.min(delay,40)).unref();
  const context={URL,Request,Response,Headers,AbortController,Uint8Array,crypto:crypto.webcrypto,caches,fetch:fetcher,setTimeout:workerTimer,clearTimeout,
    self:{registration:{scope:SCOPE},addEventListener:(name,fn)=>{events[name]=fn;},clients:{matchAll:async()=>[client],claim:async()=>{}},skipWaiting:async()=>{}}};
  vm.runInNewContext(source,context);
  h.update=next=>{const manifest=manifestFor(next);routes.set(url('offline-manifest.json'),new Response(JSON.stringify(manifest),{headers:{'Content-Type':'application/json'}}));for(const [relative,body]of Object.entries(next))routes.set(url(relative),new Response(body,{headers:{'Content-Type':relative.endsWith('.html')?'text/html':'application/octet-stream'}}));return manifest;};
  h.update(files);
  h.respond=(relative,body,status=200)=>routes.set(url(relative),new Response(body,{status}));
  h.message=async(type,from=client)=>{let completion;events.message({data:{type},source:from,waitUntil:promise=>{completion=promise;}});await completion;};
  h.download=()=>h.message('HUB_DOWNLOAD_OFFLINE');
  h.get=async(relative,options={})=>{let response;events.fetch({request:new Request(url(relative),options),respondWith:promise=>{response=promise;},waitUntil:promise=>{h.background.push(Promise.resolve(promise).catch(error=>{h.backgroundErrors.push(error);}));}});return response===undefined?undefined:await response;};
  h.cached=async relative=>(await caches.open(LIBRARY)).match(url(relative));
  h.phase=()=>messages.at(-1)?.phase;
  h.count=relative=>requests.filter(request=>request===url(relative)).length;
  h.status=async()=>{await h.message('HUB_GET_OFFLINE_STATUS');return messages.at(-1);};
  return h;
}
test('install saves only the shell, then a full download makes unopened games work offline',async()=>{
  const files={'./index.html':'Hub','./apps/games/UNOPENED/index.html':'Game ready','./apps/games/UNOPENED/levels/one.json':'{"level":1}'};
  const h=harness(files);let installing;h.events.install({waitUntil:promise=>{installing=promise;}});await installing;
  assert.equal(h.count('./apps/games/UNOPENED/index.html'),0);
  assert.equal(await h.cached('./apps/games/UNOPENED/index.html'),undefined);
  await h.download();assert.equal(h.phase(),'ready');
  assert.equal(h.messages.at(-1).completed,3);assert.equal(h.messages.at(-1).completedBytes,manifestFor(files).totalBytes);
  h.offline=true;
  assert.equal(await (await h.get('./apps/games/UNOPENED/index.html')).text(),'Game ready');
  assert.equal(await (await h.get('./apps/games/UNOPENED/levels/one.json')).text(),'{"level":1}');
  assert.equal((await h.status()).phase,'ready');
});
test('an interrupted download resumes missing files without redownloading saved files',async()=>{
  const files=Object.fromEntries(Array.from({length:9},(_,i)=>['./apps/games/TEST/asset-'+i+'.json','Asset '+i]));
  const h=harness(files);h.failUrls.add(url('./apps/games/TEST/asset-1.json'));await h.download();
  assert.equal(h.phase(),'paused');assert.ok(h.messages.at(-1).completed>0);assert.ok(h.messages.at(-1).completed<9);
  const saved=[...h.stores.get(LIBRARY).keys()],counts=new Map(saved.map(key=>[key,h.count(key)]));
  h.failUrls.clear();await h.download();assert.equal(h.phase(),'ready');assert.equal(h.messages.at(-1).completed,9);
  for(const key of saved)assert.equal(h.count(key),counts.get(key),key+' was unnecessarily fetched again');
});
test('new revisions replace changed assets, reuse unchanged assets and prune only after success',async()=>{
  const first={'./apps/games/TEST/index.html':'Old','./shared/stable.js':'Same','./apps/games/TEST/retired.png':'Retired'};
  const h=harness(first);await h.download();
  h.update({'./apps/games/TEST/index.html':'New','./shared/stable.js':'Same','./apps/games/TEST/new.json':'New level'});
  h.failUrls.add(url('./apps/games/TEST/index.html'));await h.download();assert.equal(h.phase(),'paused');
  assert.equal(await (await h.cached('./apps/games/TEST/index.html')).text(),'Old');assert.ok(await h.cached('./apps/games/TEST/retired.png'));
  h.failUrls.clear();await h.download();assert.equal(h.phase(),'ready');
  assert.equal(await (await h.cached('./apps/games/TEST/index.html')).text(),'New');assert.equal(await h.cached('./apps/games/TEST/retired.png'),undefined);
  assert.equal(h.count('./shared/stable.js'),1);
});
test('directory aliases and cache-busting queries resolve to downloaded pages and assets',async()=>{
  const h=harness({'./apps/games/TEST/index.html':'Unvisited game','./apps/games/TEST/art.png':'Picture'});await h.download();h.offline=true;
  for(const route of ['./apps/games/TEST/','./apps/games/TEST','./apps/games/TEST/index.html?v=2'])assert.equal(await (await h.get(route)).text(),'Unvisited game',route);
  assert.equal(await (await h.get('./apps/games/TEST/art.png?v=abc')).text(),'Picture');
});
test('cached audio supports closed, open and suffix byte ranges and rejects invalid ranges',async()=>{
  const h=harness({'./apps/games/TEST/audio.ogg':'0123456789'});await h.download();h.offline=true;
  for(const [range,expected,contentRange]of [['bytes=2-5','2345','bytes 2-5/10'],['bytes=7-','789','bytes 7-9/10'],['bytes=-3','789','bytes 7-9/10'],['bytes=7-99','789','bytes 7-9/10']]){
    const response=await h.get('./apps/games/TEST/audio.ogg',{headers:{Range:range}});assert.equal(response.status,206);assert.equal(response.headers.get('Content-Range'),contentRange);assert.equal(response.headers.get('Content-Length'),String(expected.length));assert.equal(await response.text(),expected);
  }
  for(const range of ['bytes=99-','bytes=5-2','bytes=-0','bytes=-','bytes=1-2,4-5'])assert.equal((await h.get('./apps/games/TEST/audio.ogg',{headers:{Range:range}})).status,416,range);
});
test('unlisted API/media responses, other origins and POST requests are never cached',async()=>{
  const h=harness({'./index.html':'Hub'});await h.download();
  h.respond('./api/private-feed','Personal data');h.respond('./uploads/private.mp3','Personal audio');
  assert.equal(await (await h.get('./api/private-feed')).text(),'Personal data');assert.equal(await (await h.get('./uploads/private.mp3')).text(),'Personal audio');
  assert.equal(await h.get('https://external.test/private.json'),undefined);assert.equal(await h.get('./index.html',{method:'POST'}),undefined);
  for(const store of h.stores.values())for(const key of store.keys())assert.ok(!key.includes('/api/')&&!key.includes('/uploads/'));
  h.offline=true;await assert.rejects(h.get('./api/private-feed'),/Network interrupted/);
});
test('quota failures preserve completed files and allow a successful retry',async()=>{
  const h=harness({'./apps/games/TEST/a.json':'A','./apps/games/TEST/b.json':'B'});h.quotaUrls.add(url('./apps/games/TEST/b.json'));await h.download();
  assert.equal(h.phase(),'paused');assert.match(h.messages.at(-1).error,/not enough browser storage/);assert.match((await h.status()).error,/not enough browser storage/);assert.ok(await h.cached('./apps/games/TEST/a.json'));assert.equal(await h.cached('./apps/games/TEST/b.json'),undefined);
  h.quotaUrls.clear();await h.download();assert.equal(h.phase(),'ready');assert.equal(h.count('./apps/games/TEST/a.json'),1);
});
test('a mismatched download is not saved or reported ready and can be retried',async()=>{
  const h=harness({'./apps/games/TEST/index.html':'Expected'});h.respond('./apps/games/TEST/index.html','Changed during deployment');await h.download();
  assert.equal(h.phase(),'paused');assert.match(h.messages.at(-1).error,/being updated/);assert.equal(await h.cached('./apps/games/TEST/index.html'),undefined);
  h.respond('./apps/games/TEST/index.html','Expected');await h.download();assert.equal(h.phase(),'ready');
});
test('duplicate download requests share one run and unrelated clients cannot trigger a download',async()=>{
  const h=harness({'./apps/games/TEST/index.html':'Game'});
  await h.message('HUB_DOWNLOAD_OFFLINE',{url:'https://external.test/',postMessage:()=>{}});assert.equal(h.requests.length,0);
  await Promise.all([h.download(),h.download()]);assert.equal(h.phase(),'ready');assert.equal(h.count('./offline-manifest.json'),1);assert.equal(h.count('./apps/games/TEST/index.html'),1);
});
test('a malformed manifest cannot download outside the Hub scope',async()=>{
  const h=harness({'./index.html':'Hub'}),bad=manifestFor({'https://external.test/private.json':'Bad'});
  h.respond('./offline-manifest.json',JSON.stringify(bad));await h.download();assert.equal(h.phase(),'paused');assert.match(h.messages.at(-1).error,/Invalid offline/);assert.equal(h.count('https://external.test/private.json'),0);
});

test('a completed library survives worker restart and remains ready during an offline update attempt',async()=>{
  const files={'./index.html':'Hub','./apps/games/UNVISITED/index.html':'Game'};
  const first=harness(files);await first.download();
  const restarted=harness(files,first.stores);restarted.offline=true;
  assert.equal((await restarted.status()).phase,'ready');
  await restarted.download();assert.equal(restarted.phase(),'ready');assert.equal(restarted.messages.at(-1).completed,2);assert.equal(restarted.messages.at(-1).error,undefined);
  assert.equal(await (await restarted.get('./apps/games/UNVISITED/index.html')).text(),'Game');
  assert.equal(restarted.count('./apps/games/UNVISITED/index.html'),0,'downloaded games must not wait for any network request');
});

async function withoutNetworkWait(promise,label){
  let timer;
  try{return await Promise.race([promise,new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(Error(label+' waited for an unresponsive network instead of the saved cache')),250);})]);}
  finally{clearTimeout(timer);}
}

test('saved game documents and subresources load even when the network never responds',async()=>{
  const page='./apps/games/UNVISITED/index.html',script='./apps/games/UNVISITED/game.js';
  const h=harness({[page]:'Saved game',[script]:'Saved script'});await h.download();
  const downloads=[h.count(page),h.count(script)];h.stall=true;
  assert.equal(await (await withoutNetworkWait(h.get(page),'Game navigation')).text(),'Saved game');
  assert.equal(await (await withoutNetworkWait(h.get(script+'?build=1'),'Game script')).text(),'Saved script');
  assert.deepEqual([h.count(page),h.count(script)],downloads,'the manifest updater owns game downloads; launches use their saved copies');
});

test('current shell cache outranks older full-library copies without waiting for revalidation',async()=>{
  const h=harness({'./index.html':'Old library Hub','./shared/platform.js':'Old library platform'});await h.download();
  h.respond('./index.html','Current shell Hub');h.respond('./shared/platform.js','Current shell platform');
  let installed;h.events.install({waitUntil:promise=>{installed=promise;}});await installed;
  h.stall=true;
  assert.equal(await (await withoutNetworkWait(h.get('./index.html'),'Hub navigation')).text(),'Current shell Hub');
  assert.equal(await (await withoutNetworkWait(h.get('./shared/platform.js'),'Shell script')).text(),'Current shell platform');
  await withoutNetworkWait(Promise.all(h.background),'Background shell refresh');
});

test('a stalled update check cannot hide an already complete library behind Checking forever',async()=>{
  const h=harness({'./index.html':'Hub','./apps/games/UNVISITED/index.html':'Game'});await h.download();
  h.stallUrls.add(url('./offline-manifest.json'));
  await withoutNetworkWait(h.download(),'Manifest update check');
  assert.equal(h.phase(),'ready');assert.equal(h.messages.at(-1).completed,2);assert.equal(h.messages.at(-1).error,undefined);
});

test('a manifest whose headers arrive but whose body stalls still restores offline readiness',async()=>{
  const h=harness({'./index.html':'Hub','./apps/games/UNVISITED/index.html':'Game'});await h.download();
  let body;
  const partialJSON=new ReadableStream({start(controller){body=controller;controller.enqueue(new TextEncoder().encode('{"schema":'));}});
  h.respond('./offline-manifest.json',partialJSON);
  try{
    await withoutNetworkWait(h.download(),'Manifest response body');
    assert.equal(h.phase(),'ready');assert.equal(h.messages.at(-1).completed,2);assert.equal(h.messages.at(-1).error,undefined);
  }finally{body.error(new Error('End stalled response fixture'));}
});

test('an old empty metadata read cannot replace the URL index after a download completes',async()=>{
  const page='./apps/games/UNVISITED/index.html',h=harness({[page]:'Saved game'});
  let entered,release;
  const started=new Promise(resolve=>{entered=resolve;}),lateRead=new Promise(resolve=>{release=resolve;});
  h.waitForMetaRead=async()=>{entered();await lateRead;};
  // A page asset starts before the first manifest exists, while the user begins
  // downloading. Its slow empty metadata lookup resumes after download completion.
  const earlierRequest=h.get('./shared/platform.js');await started;
  await h.download();assert.equal(h.phase(),'ready');
  release();await earlierRequest;h.waitForMetaRead=null;h.offline=true;
  assert.equal(await (await h.get(page)).text(),'Saved game');
});
