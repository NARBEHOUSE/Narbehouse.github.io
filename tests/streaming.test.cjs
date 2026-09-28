const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{webcrypto}=require('node:crypto');
function adapter() {
  const stored=new Map();let request;
  const env={StreamingPlaybackLinks:require('../bennyshub/apps/tools/streaming/playback-links.js'),URL,crypto:webcrypto,document:{currentScript:{src:'http://localhost:3000/bennyshub/apps/tools/streaming/web-streaming.js'},getElementById:()=>null},BennyData:{get:(k,f)=>stored.has(k)?JSON.parse(stored.get(k)):f,set:(k,v)=>stored.set(k,JSON.stringify(v)),remove:k=>stored.delete(k)},BennyExtension:{supports:()=>true,request:async(a,p)=>request?.(a,p)},fetch:async url=>({ok:true,json:async()=>String(url).endsWith('data.json')?[{id:'original',title:'Title',url:'unfinished link',description:'<literal>'}]:{}})};
  env.window=env;vm.runInNewContext(fs.readFileSync('bennyshub/apps/tools/streaming/web-streaming.js','utf8'),env);
  return {api:env.WebStreaming,env,stored,onRequest:fn=>request=fn};
}
test('streaming keeps source fields, saves locally, and imports original season format',async()=>{
  const {api,stored}=adapter();const data=await api.getData();assert.equal(data[0].url,'unfinished link');assert.equal(data[0].description,'<literal>');
  data[0].title='Updated';api.saveData(data);assert.equal((await api.getData())[0].title,'Updated');assert.ok(stored.has('streaming.catalog'));
  api.saveEpisodes({'A SHOW':{'1':[{episode:2,title:'Episode',url:'https://www.youtube.com/watch?v=2'}]}});assert.equal((await api.getEpisodes('a show'))['1'][0].episode,2);
  assert.throws(()=>api.saveEpisodes({'show':{'bad':'invalid'}}));assert.throws(()=>api.saveData({}));
  const malicious=api.library([{id:"bad');alert(1);//",title:'<img>',url:'https://www.youtube.com/'}]);assert.match(malicious[0].id,/^[\w-]+$/);assert.equal(api.escapeHTML('</textarea>'),'&lt;/textarea&gt;');
});
test('streaming only saves successful launches and respects reset after redirect tracking',async()=>{
  const {api,onRequest}=adapter();onRequest(async()=>{throw Error('Denied');});await assert.rejects(api.launch({url:'https://www.youtube.com/watch?v=1',show:'Show',type:'shows'}));assert.equal(Object.keys(api.getLastWatched()).length,0);
  let token;onRequest(async(action,p)=>{if(action==='OPEN_STREAM'){token=p.playbackId;assert.equal(p.url,'https://www.youtube.com/watch?v=short');return {opened:true};}return {playbackId:token,url:'https://www.youtube.com/watch?v=next'};});
  await api.launch({url:'https://youtu.be/short',show:'Show',type:'shows',season:1,episode:1});await api.syncProgress();assert.equal(api.getLastWatched('SHOW').url,'https://www.youtube.com/watch?v=next');
  api.resetProgress('show');await api.syncProgress();assert.equal(api.getLastWatched('show').url,undefined);assert.ok(api.getLastWatched('show').timestamp);
});

test('Disney movie imports and launches use playback links while preserving notes and series URLs',async()=>{
  const {api,stored,onRequest}=adapter(),url='https://www.disneyplus.com/browse/entity-c29f81d8-8c51-4fe7-bb0c-13f099ad3e90';
  const item={id:'mine',title:'Big Hero 6',type:'movies',url,description:'Personal notes'};
  stored.set('streaming.catalog',JSON.stringify([item]));
  const [movie]=await api.getData();assert.equal(movie.url,url.replace('/browse/entity-','/play/'));assert.equal(movie.description,item.description);assert.equal(movie.id,item.id);
  const seriesURL=url.replace('c29f81d8-8c51-4fe7-bb0c-13f099ad3e90','11111111-1111-1111-1111-111111111111');
  assert.equal(api.library([{...item,type:'shows',url:seriesURL}])[0].url,seriesURL);
  assert.equal(api.library([{...item,url:url.replace('disneyplus.com','disneyplus.com.example')}])[0].url,url.replace('disneyplus.com','disneyplus.com.example'));
  onRequest(async(action,payload)=>{assert.equal(action,'OPEN_STREAM');assert.equal(payload.url,movie.url);});
  await api.launch({url,type:'movies',show:item.title});
});


test('Prime starter routes repair existing libraries and launches without overriding other regions or custom links',async()=>{
  const {api,stored,onRequest}=adapter(),id='0ILGJ4D4ZYPGJCCG2VNGX3LCR3';
  const original='https://www.primevideo.com/detail/'+id, corrected='https://www.primevideo.com/region/na/detail/'+id;
  stored.set('streaming.catalog',JSON.stringify([{id:'keep-id',title:'My title',type:'movies',url:original,description:'My notes'}]));
  const [item]=await api.getData();assert.equal(item.url,corrected+'?autoplay=1');assert.equal(item.id,'keep-id');assert.equal(item.description,'My notes');
  const untouched=[original.replace('/detail/','/region/eu/detail/'),original.replace(id,'0CUSTOMLINKUNCHANGED'),original.replace('primevideo.com','primevideo.com.example'),original.replace('https:','http:')];
  for(const url of untouched)assert.equal(api.library([{title:'Custom',url,type:'movies'}])[0].url,url);
  onRequest(async(action,p)=>{assert.equal(action,'OPEN_STREAM');assert.equal(p.url,corrected+'?autoplay=1');});
  await api.launch({url:original+'?autoplay=1',show:'My title',type:'shows'});
});

test('Netflix movies and known starter series launch playback without guessing unknown episode IDs',async()=>{
  const {api,onRequest}=adapter(),url='https://www.netflix.com/title/80214236';
  assert.equal(api.library([{title:'Over the Moon',type:'movies',url}])[0].url,url.replace('/title/','/watch/'));
  const unknown='https://www.netflix.com/title/99999999';assert.equal(api.library([{title:'Series',type:'shows',url:unknown}])[0].url,unknown);
  assert.equal(api.library([{title:'Hilda',type:'shows',url:'https://www.netflix.com/title/80115346'}])[0].url,'https://www.netflix.com/watch/80117561');
  onRequest(async(action,p)=>assert.equal(p.url,url.replace('/title/','/watch/')));
  await api.launch({url,show:'Over the Moon',type:'movies'});
});


test('all show providers track episode redirects and YouTube video playlists retain their list',async()=>{
  const {api,onRequest}=adapter();let opened;
  onRequest(async(action,p)=>{if(action==='OPEN_STREAM')opened=p;});
  for(const url of ['https://www.netflix.com/watch/1001','https://www.disneyplus.com/play/episode1','https://www.hulu.com/watch/episode1','https://www.primevideo.com/detail/episode1?autoplay=1','https://tubitv.com/tv-shows/1001/episode1']){
    await api.launch({url,show:'Series',type:'shows'});assert.equal(opened.trackProgress,true);
  }
  await api.launch({url:'https://youtu.be/first?list=playlist&index=1',show:'Playlist',type:'videos'});
  assert.equal(opened.trackProgress,true);assert.equal(opened.url,'https://www.youtube.com/watch?v=first&list=playlist&index=1');
  await api.launch({url:'https://www.youtube.com/watch?v=trailer&list=playlist',show:'Trailer',type:'trailer'});assert.equal(opened.trackProgress,false);
  await api.launch({url:'https://app.plex.tv/desktop/',show:'Plex',type:'shows'});assert.equal(opened.trackProgress,false);
});


test('reset cannot be undone by an in-flight progress request',async()=>{
  const {api,onRequest}=adapter();let token,resolveProgress;
  onRequest(async(action,p)=>{if(action==='OPEN_STREAM'){token=p.playbackId;return {};}return new Promise(resolve=>{resolveProgress=resolve;});});
  await api.launch({url:'https://www.netflix.com/watch/1001',show:'Series',type:'shows'});
  const pending=api.syncProgress();api.resetProgress('Series');
  resolveProgress({playbackId:token,url:'https://www.netflix.com/watch/1007'});await pending;
  assert.equal(api.getLastWatched('Series').url,undefined);
});


test('episode saves validate one show, preserve other shows, and keep original episode metadata', async () => {
  const {api, stored, env} = adapter();
  const episode = {episode:1, title:' Pilot ', url:'https://www.netflix.com/watch/1001', note:'Keep imported metadata'};
  api.saveEpisodes({'other show':{'1':[{...episode, title:'Other'}]}});
  const snapshot = await api.allEpisodes();
  const pending = api.saveShowEpisodes('Original title', {'1':[{...episode, episode:2}, episode], '2':[]});
  api.saveEpisodes({...snapshot, 'another show':{'1':[{...episode}]}});
  await pending;
  assert.ok((await api.allEpisodes())['other show']);
  assert.ok((await api.allEpisodes())['another show']);
  const saved = await api.getEpisodes('ORIGINAL TITLE');
  assert.equal(saved['1'][0].title, 'Pilot');
  assert.equal(saved['1'][0].note, episode.note);
  assert.equal(saved['1'][0].season, 1);
  assert.equal(saved['2'], undefined);
  const before = stored.get('streaming.episodes');
  for (const bad of [{...episode,episode:null},{...episode,episode:-1},{...episode,title:' '},{...episode,url:'javascript:alert(1)'},{...episode,url:'https://secret:password@netflix.com/watch/1'}]) {
    await assert.rejects(api.saveShowEpisodes('Original title',{'1':[bad]}));
  }
  await assert.rejects(api.saveShowEpisodes('Original title',{'1':[episode,episode]}));
  await assert.rejects(api.saveShowEpisodes('Original title',{'10000':[episode]}));
  assert.equal(stored.get('streaming.episodes'),before);
  env.BennyData.set=()=>{throw Error('Storage full');};
  await assert.rejects(api.saveShowEpisodes('Original title',{}),/Storage full/);
  assert.equal(stored.get('streaming.episodes'),before);
});

test('episode lists can be removed without deleting other shows; unusual show titles are safe',async()=>{
  const {api}=adapter(),episode={episode:1,title:'Pilot',url:'https://www.youtube.com/watch?v=pilot'};
  await api.saveShowEpisodes('__proto__',{'1':[episode]});
  await api.saveShowEpisodes('Show',{'1':[episode]});
  await api.saveShowEpisodes('Show',{});
  assert.equal(Object.keys(await api.getEpisodes('Show')).length,0);
  assert.equal((await api.getEpisodes('__proto__'))['1'][0].title,'Pilot');
  assert.equal({}.polluted,undefined);
});

test('missing and invalid playback links never reach the extension or saved progress',async()=>{
  const {api,onRequest}=adapter();let calls=0;
  onRequest(()=>{calls++;});
  for(const url of ['',undefined,'not a link','file:///private/video','javascript:alert(1)','https://user:secret@www.netflix.com/watch/1']) {
    await assert.rejects(api.launch({url,show:'Invalid',type:'shows'}));
  }
  assert.equal(calls,0);assert.equal(api.getLastWatched('Invalid'),null);
});

test('platform detection uses real hostnames and platform choices have bundled favicons',()=>{
  const services=require('../bennyshub/apps/tools/streaming/services.js');
  for(const [url,name] of [['https://www.netflix.com/watch/1','Netflix'],['https://www.disneyplus.com/play/1','Disney+'],['https://app.plex.tv/desktop/','Plex'],['https://youtu.be/video','YouTube'],['https://www.primevideo.com/detail/1','Prime Video'],['https://www.amazon.com/gp/video/detail/1','Prime Video'],['https://tubitv.com/tv-shows/1','Tubi']])assert.equal(services.detect(url),name);
  for(const url of ['https://netflix.com.example.org/','https://example.org/?netflix.com','file://netflix.com/a','not a link'])assert.equal(services.detect(url),'');
  assert.equal(services.nameFor({service:'Other',url:'https://www.hulu.com/watch/1'}),'Hulu');
  for(const name of services.names)assert.ok(fs.existsSync('bennyshub/apps/tools/streaming/'+services.icons[name]));
});
