const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{webcrypto}=require('node:crypto');
function adapter() {
  const stored=new Map();let request;
  const env={URL,crypto:webcrypto,document:{currentScript:{src:'http://localhost:3000/bennyshub/apps/tools/streaming/web-streaming.js'},getElementById:()=>null},BennyData:{get:(k,f)=>stored.has(k)?JSON.parse(stored.get(k)):f,set:(k,v)=>stored.set(k,JSON.stringify(v)),remove:k=>stored.delete(k)},BennyExtension:{supports:()=>true,request:async(a,p)=>request?.(a,p)},fetch:async url=>({ok:true,json:async()=>String(url).endsWith('data.json')?[{id:'original',title:'Title',url:'unfinished link',description:'<literal>'}]:{}})};
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
