const CACHE='benny-web-experiment-v63';
const SHELL=['./','./index.html','./apps/tools/tools.json','./apps/games/games.json','./shared/usage-analytics.js','./shared/extension-client.js','./shared/tool-gate.js','./shared/web-data.js','./shared/web-tool.css','./shared/web-tool-ui.js','./shared/scan-manager.js','./shared/voice-manager.js','./shared/ios-audio-fix.js','./extension-setup.html','./setup.js','./data-settings.html','./data-settings.js','./pwa.js','./manifest.webmanifest','./images/BeaminBenny.png','./images/narbefoundation.png','./images/pwa-192.png','./images/pwa-512.png','./images/favicon-16.png','./images/favicon-32.png','./images/apple-touch-icon.png',...['dayhub','journal','streaming'].map(x=>'./images/tools/'+x+'.png'),...['dayhub/index.html','dayhub/app.js','dayhub/style.css','dayhub/day-services.js','journal/index.html','journal/app.js','journal/style.css','journal/predictions.js','journal/questions.json','streaming/index.html','streaming/app.js','streaming/style.css','streaming/web-streaming.js','streaming/keyboard_integration.js','streaming/predictions.js','streaming/editor.html','streaming/editor.js','streaming/editor-files.js','streaming/metadata-config.js','streaming/tmdb-logo.svg','streaming/data.json','streaming/episodes.json'].map(x=>'./apps/tools/'+x)];
SHELL.push('./companion-setup.css','./companion-privacy.html','./apps/tools/journal/journal-look.css','./apps/tools/journal/calendar-view.js',...['index.html','style.css','app.js','predictions.js','web_keyboard_predictions.json'].map(x=>'./apps/tools/keyboard/'+x));
SHELL.push(...['playback-links.js','library-merge.js','quick-add.js','quick-add.css','collections/index.json',...['netflix','disney','hulu','prime','tubi','youtube'].map(s=>'collections/'+s+'-starter.json')].map(x=>'./apps/tools/streaming/'+x));
SHELL.push(...['services.js', 'episode-editor.js', 'episode-editor.css', 'logos/netflix-com.ico', 'logos/disneyplus-com.ico', 'logos/hulu-com.png', 'logos/primevideo-com.ico', 'logos/hbomax-com.ico', 'logos/paramountplus-com.ico', 'logos/pluto-tv.ico', 'logos/plex-tv.png', 'logos/youtube-com.ico', 'logos/tv-apple-com.png', 'logos/peacocktv-com.ico', 'logos/tubitv-com.png', 'logos/crunchyroll-com.png', 'logos/therokuchannel-roku-com.ico'].map(x=>'./apps/tools/streaming/'+x));
SHELL.push(...['platform.js','graphics-quality.js','scan-settings.js','choice-scan.js','choice-scan-adapter.js','scan-status-badge.js','scan-status-badge.css'].map(x=>'./shared/'+x));
SHELL.push('./shared/journal-storage.js','./shared/app-storage.js','./shared/data-backup.js');
SHELL.push('./shared/byok-client.js','./images/tools/rtc-lite.png',...['index.html','app.js','core.js','providers.js','web-config.js','dictionary.js','api-server.js','speech.js','whisper-worker.js'].map(x=>'./apps/tools/rtc-lite/'+x));
// Cache local inference runtimes only when requested, not during Hub installation.
const RTC_RUNTIME=['transformers.js','ort-wasm.wasm','ort-wasm-simd.wasm','ort-wasm-threaded.wasm','ort-wasm-simd-threaded.wasm'].map(x=>'./apps/tools/rtc-lite/vendor/'+x);
SHELL.push(...['communication-channel.js','communication-speech.js','communication-settings.js','communication-voices.js','communication-pocket-worker.js','hub-toggle-cycle.js','communication-worker.js','communication-fast-worker.js','communication-companion.js'].map(x=>'./shared/'+x));
const SPEAKER_RUNTIME=['kokoro.web.js','ort-wasm-simd-threaded.jsep.mjs','ort-wasm-simd-threaded.jsep.wasm'].map(x=>'./shared/communication-vendor/'+x);
const FAST_SPEAKER_RUNTIME=['piper.js','piper_phonemize.wasm','piper_phonemize.data','ort.wasm.min.js','ort-wasm-simd.wasm'].map(x=>'./shared/communication-fast-vendor/'+x);
SPEAKER_RUNTIME.push('./shared/communication-pocket.js','./shared/communication-vendor/sentencepiece.js',...['a2','a5','b2','b4'].map(x=>'./shared/communication-voices/'+x+'.bin'));
SHELL.push('./shared/hub-library.js');
// The small shell installs quickly. The complete library is requested on PWA
// installation/launch or explicitly from the Hub's offline controls.
const LIBRARY='benny-offline-library-v1', META='benny-offline-meta-v1';
const MANIFEST_URL=new URL('./offline-manifest.json',self.registration.scope).href;
const REVISION_HEADER='X-Benny-Revision';
const allowed=new Set([...SHELL,...RTC_RUNTIME,...SPEAKER_RUNTIME,...FAST_SPEAKER_RUNTIME].map(p=>new URL(p,self.registration.scope).href));
let manifestPromise=null, downloading=null, progress=null, urlSet=null;

function validateManifest(value){
  if(value?.schema!==1||!Array.isArray(value.assets)||!value.assets.length||!value.version)throw Error('The offline library list is unavailable.');
  const seen=new Set();
  for(const item of value.assets){
    const url=new URL(item.url,self.registration.scope);
    if(!url.href.startsWith(self.registration.scope)||url.search||url.hash||url.href===MANIFEST_URL||url.pathname.endsWith('/service-worker.js')||seen.has(url.href)||!/^[a-f0-9]{64}$/.test(item.revision)||!Number.isSafeInteger(item.bytes)||item.bytes<0)throw Error('Invalid offline library list.');
    seen.add(url.href);
  }
  if(!Number.isSafeInteger(value.totalBytes)||value.totalBytes!==value.assets.reduce((sum,item)=>sum+item.bytes,0))throw Error('Invalid offline library size.');
  return value;
}
async function storedManifest(){
  if(!manifestPromise)manifestPromise=(async()=>{
    const response=await (await caches.open(META)).match(MANIFEST_URL);
    return response?validateManifest(await response.json()):null;
  })().catch(()=>null);
  return manifestPromise;
}
async function latestManifest(){
  const response=await fetch(MANIFEST_URL,{cache:'no-store'});
  if(!response.ok)throw Error('The offline library list could not be downloaded.');
  const value=validateManifest(await response.json());
  await (await caches.open(META)).put(MANIFEST_URL,new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}}));
  manifestPromise=Promise.resolve(value);
  urlSet=null;
  return value;
}
async function notify(status){
  progress=status;
  for(const client of await self.clients.matchAll({type:'window',includeUncontrolled:true})){
    if(client.url.startsWith(self.registration.scope))client.postMessage({type:'HUB_OFFLINE_STATUS',...status});
  }
}
async function inventory(manifest){
  const cache=await caches.open(LIBRARY),pending=[];
  let completed=0,completedBytes=0;
  for(const entry of manifest.assets){
    const response=await cache.match(new URL(entry.url,self.registration.scope).href);
    if(response?.headers.get(REVISION_HEADER)===entry.revision){completed++;completedBytes+=entry.bytes;}
    else pending.push(entry);
  }
  return {cache,pending,completed,completedBytes};
}
async function reportStatus(client){
  let state=progress;
  if(!downloading){
    const manifest=await storedManifest();
    if(manifest){
      const saved=await inventory(manifest);
      state={phase:saved.pending.length?'paused':'ready',completed:saved.completed,total:manifest.assets.length,completedBytes:saved.completedBytes,totalBytes:manifest.totalBytes};
      if(saved.pending.length&&progress?.error)state.error=progress.error;
    }else state={phase:'idle',completed:0,total:0};
  }
  client?.postMessage({type:'HUB_OFFLINE_STATUS',...state});
}
async function saveAsset(cache,entry){
  const url=new URL(entry.url,self.registration.scope).href;
  const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),45000);
  try{
    const response=await fetch(url,{cache:'no-store',signal:abort.signal});
    if(!response.ok||response.status!==200)throw Error('A library file could not be downloaded.');
    const body=await response.arrayBuffer();
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',body)),x=>x.toString(16).padStart(2,'0')).join('');
    if(digest!==entry.revision)throw Error('The library is being updated. Please retry shortly.');
    const headers=new Headers(response.headers);
    headers.set(REVISION_HEADER,entry.revision);
    // The body is decoded by fetch; remove transport-only length/encoding.
    headers.delete('Content-Encoding');headers.delete('Content-Length');
    await cache.put(url,new Response(body,{status:200,headers}));
  }finally{clearTimeout(timer);}
}
function downloadLibrary(){
  if(downloading)return downloading;
  downloading=(async()=>{
    let state={phase:'checking',completed:0,total:0,completedBytes:0,totalBytes:0};
    await notify(state);
    try{
      let manifest;
      try{manifest=await latestManifest();}catch(error){
        // A fully downloaded installation stays Ready when launched offline.
        const previous=await storedManifest();
        if(previous){
          const saved=await inventory(previous);
          state={...state,completed:saved.completed,total:previous.assets.length,completedBytes:saved.completedBytes,totalBytes:previous.totalBytes};
          if(!saved.pending.length){await notify({...state,phase:'ready'});return;}
        }
        throw error;
      }
      const saved=await inventory(manifest);
      state={phase:'downloading',completed:saved.completed,total:manifest.assets.length,completedBytes:saved.completedBytes,totalBytes:manifest.totalBytes};
      await notify({...state});
      let cursor=0,failure=null,lastNotice=0;
      await Promise.all(Array.from({length:4},async()=>{
        while(!failure&&cursor<saved.pending.length){
          const entry=saved.pending[cursor++];
          try{await saveAsset(saved.cache,entry);}catch(error){failure=error;break;}
          state.completed++;state.completedBytes+=entry.bytes;
          if(Date.now()-lastNotice>350){lastNotice=Date.now();await notify({...state});}
        }
      }));
      if(failure)throw failure;
      // Prune removed public assets only after the replacement library is complete.
      const current=new Set(manifest.assets.map(item=>new URL(item.url,self.registration.scope).href));
      for(const key of await saved.cache.keys())if(!current.has(key.url))await saved.cache.delete(key);
      await notify({...state,phase:'ready'});
    }catch(error){
      await notify({...state,phase:'paused',error:error.name==='QuotaExceededError'?'There is not enough browser storage. Free some space, then retry.':['TypeError','AbortError'].includes(error.name)?'Download interrupted. Connect to the internet and retry.':error.message||'Download interrupted. Connect to the internet and retry.'});
    }
  })().finally(()=>{downloading=null;});
  return downloading;
}

self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil((async()=>{
  for(const key of await caches.keys())if(key.startsWith('benny-web-experiment-')&&key!==CACHE)await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener('message',e=>{
  if(!e.source?.url?.startsWith(self.registration.scope))return;
  if(e.data?.type==='HUB_DOWNLOAD_OFFLINE')e.waitUntil(downloadLibrary());
  if(e.data?.type==='HUB_GET_OFFLINE_STATUS')e.waitUntil(reportStatus(e.source));
});

async function partialResponse(request,response){
  const range=request.headers.get('range');
  if(!range)return response;
  const match=/^bytes=(\d*)-(\d*)$/.exec(range);
  if(!match)return new Response(null,{status:416});
  const body=await response.arrayBuffer(),size=body.byteLength;
  let start=match[1]?Number(match[1]):Math.max(0,size-Number(match[2]));
  let end=match[1]?(match[2]?Math.min(Number(match[2]),size-1):size-1):size-1;
  if((!match[1]&&!match[2])||start>=size||end<start)return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+size}});
  const headers=new Headers(response.headers);
  headers.set('Content-Range','bytes '+start+'-'+end+'/'+size);
  headers.set('Content-Length',String(end-start+1));headers.set('Accept-Ranges','bytes');
  return new Response(body.slice(start,end+1),{status:206,headers});
}
async function staticURL(request){
  const url=new URL(request.url);
  if(!url.href.startsWith(self.registration.scope))return null;
  url.search='';url.hash='';
  const manifest=await storedManifest();
  const urls=urlSet||(urlSet=new Set(manifest?.assets.map(item=>new URL(item.url,self.registration.scope).href)||[]));
  let key=url.href;
  if(!allowed.has(key)&&!urls.has(key)){
    key=new URL(url.pathname.endsWith('/')?'index.html':url.pathname.split('/').pop()+'/index.html',url).href;
  }
  return allowed.has(key)||urls.has(key)?{key,library:urls.has(key)}:null;
}
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET'||!e.request.url.startsWith(self.registration.scope))return;
  e.respondWith((async()=>{
    const asset=await staticURL(e.request);
    // Never store API/feed/user media responses or unlisted URLs.
    if(!asset)return fetch(e.request);
    try{
      const response=await fetch(e.request);
      if(response.ok&&response.status===200&&allowed.has(asset.key)){
        await (await caches.open(CACHE)).put(asset.key,response.clone()).catch(()=>{});
      }
      if(response.ok)return response;
      const saved=await (await caches.open(LIBRARY)).match(asset.key)||await (await caches.open(CACHE)).match(asset.key);
      return saved?partialResponse(e.request,saved):response;
    }catch{
      const saved=await (await caches.open(LIBRARY)).match(asset.key)||await (await caches.open(CACHE)).match(asset.key);
      return saved?partialResponse(e.request,saved):new Response('This file is not saved offline yet. Return to the Hub while connected and finish the offline download.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});
    }
  })());
});
