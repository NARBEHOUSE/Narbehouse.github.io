const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const api=require('../bennyshub/shared/data-backup.js');
const envelope=(app,data)=>({version:1,app,data}),prefix='benny-web:v1:streaming.';
const vocabulary={frequent_words:{HELLO:{count:3,last_used:'2026-10-04T12:00:00.000Z'}},bigrams:{'HELLO WORLD':{count:2}},trigrams:{}};
const keyboard=envelope('keyboard',{userKeyboardData:vocabulary,kb_settings:{autocapI:true,theme:'blue',scanSpeed:'medium',highlightColor:'pink',autoScan:false}});
const streaming=envelope('streaming',{
  [prefix+'catalog']:[{id:'mine',title:'My title',url:'unfinished link',type:'shows',year:'2020',description:'<literal text>',note:{source:'caregiver'}}],
  [prefix+'episodes']:{'my title':{'1':[{episode:1,title:'Pilot',url:'https://www.youtube.com/watch?v=one',note:'keep'}]}},
  [prefix+'genres']:{Family:'https://example.com/image.png'},
  [prefix+'lastWatched']:{'my title':{url:'https://www.youtube.com/watch?v=one',season:1,episode:1,timestamp:10}},
  [prefix+'activePlayback']:{playbackId:'playback-id',show:'My title',season:1,episode:1},
  [prefix+'searchHistory']:['My title'],
  [prefix+'settings']:{theme:'dark-blue',highlightStyle:'outline',highlightColor:'cyan'}
});
const json=value=>JSON.parse(JSON.stringify(value));
test('current Keyboard, Day Hub and Streaming exports validate without modifying inputs',()=>{
  for(const input of [keyboard,streaming,envelope('dayhub',{dayhub_weather_web_v2:{lat:40.5,lon:-74,label:'Home'}}),envelope('dayhub',{dayhub_weather_web_v2:{lat:null,lon:null,label:''}})]){
    const before=JSON.stringify(input),result=api.validate(input,input.app);
    assert.equal(JSON.stringify(input),before);assert.deepEqual(json(result.values),input.data);assert.equal(result.count,Object.keys(input.data).length);
    assert.notEqual(result.values,input.data);
  }
  assert.equal(api.validate(envelope('keyboard',{}),'keyboard').count,0);
  const clean=api.validate(streaming,'streaming');clean.values[prefix+'catalog'][0].note.source='changed';assert.equal(streaming.data[prefix+'catalog'][0].note.source,'caregiver');
});
test('restored Streaming storage is read by the actual catalog, episode, progress and search adapter',async()=>{
  const values=api.validate(streaming,'streaming').values,store=new Map(Object.entries(values).map(([k,v])=>[k,JSON.stringify(v)]));
  const env={URL,crypto:require('node:crypto').webcrypto,StreamingPlaybackLinks:require('../bennyshub/apps/tools/streaming/playback-links.js'),document:{currentScript:{src:'https://hub.test/bennyshub/apps/tools/streaming/web-streaming.js'},getElementById:()=>null},BennyData:{get:(k,f)=>store.has('benny-web:v1:'+k)?JSON.parse(store.get('benny-web:v1:'+k)):f},fetch:async()=>{throw Error('Backup should not require catalog seeds.');}};
  env.window=env;vm.runInNewContext(fs.readFileSync('bennyshub/apps/tools/streaming/web-streaming.js','utf8'),env);
  assert.equal((await env.WebStreaming.getData())[0].note.source,'caregiver');assert.equal((await env.WebStreaming.getData())[0].url,'unfinished link');
  assert.equal((await env.WebStreaming.getEpisodes('MY TITLE'))['1'][0].title,'Pilot');assert.equal(env.WebStreaming.getLastWatched('My title').episode,1);assert.equal(env.WebStreaming.getSearchHistory()[0],'My title');assert.equal(env.WebStreaming.getGenres().Family,'https://example.com/image.png');
});
test('restored Keyboard vocabulary reaches the real prediction engine',async()=>{
  const values=api.validate(keyboard,'keyboard').values,stored=new Map(Object.entries(values).map(([k,v])=>[k,JSON.stringify(v)]));
  const env={localStorage:{getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,v)},fetch:async()=>({ok:true,json:async()=>({frequent_words:{},bigrams:{},trigrams:{}})}),Event:class{},console};env.window=env;env.dispatchEvent=()=>{};
  vm.runInNewContext(fs.readFileSync('bennyshub/apps/tools/keyboard/predictions.js','utf8'),env);await env.predictionSystem.ready;
  assert.equal(env.predictionSystem.userData.frequent_words.HELLO.count,3);assert.equal(env.predictionSystem.mergedData.frequent_words.HELLO.count,9);assert.equal(JSON.parse(stored.get('kb_settings')).theme,'blue');
});
test('wrong app/version, unknown storage keys and unknown setting fields reject the whole backup',()=>{
  for(const invalid of [{...keyboard,version:3},{...keyboard,app:'streaming'},envelope('keyboard',{'benny-web:v1:journal.entries':[]}),envelope('keyboard',{kb_settings:{theme:'blue',script:'bad'}}),envelope('streaming',{[prefix+'unexpected']:[]})])assert.throws(()=>api.validate(invalid,'keyboard'));
  assert.throws(()=>api.validate(streaming,'journal'));assert.throws(()=>api.validate({...keyboard,unexpected:1},'keyboard'));
});
test('invalid app data shapes fail before any restore writes',()=>{
  const cases=[['keyboard',{userKeyboardData:{frequent_words:[],bigrams:{},trigrams:{}}}],['keyboard',{kb_settings:{autoScan:'yes'}}],['keyboard',{kb_settings:{theme:'unknown'}}],['dayhub',{dayhub_weather_web_v2:{lat:91,lon:0,label:'Bad'}}],['dayhub',{dayhub_weather_web_v2:{lat:null,lon:0,label:'Bad'}}],['streaming',{[prefix+'catalog']:[{title:'Missing url'}]}],['streaming',{[prefix+'episodes']:{show:{bad:[]}}}],['streaming',{[prefix+'lastWatched']:{show:{timestamp:'yesterday'}}}],['streaming',{[prefix+'genres']:{Drama:'javascript:alert(1)'}}],['streaming',{[prefix+'searchHistory']:[{}]}],['streaming',{[prefix+'activePlayback']:{show:'Missing token'}}]];
  for(const [app,data]of cases)assert.throws(()=>api.validate(envelope(app,data),app));
});
test('prototype-like show names remain plain data and cannot escape storage key allowlists',()=>{
  const input=JSON.parse('{"version":1,"app":"streaming","data":{"benny-web:v1:streaming.episodes":{"__proto__":{"1":[{"episode":1,"title":"Pilot","url":"unfinished"}]}}}}');
  const clean=api.validate(input,'streaming');assert.equal(Object.getPrototypeOf(clean.values[prefix+'episodes']),null);assert.equal(clean.values[prefix+'episodes'].__proto__['1'][0].title,'Pilot');assert.equal({}.polluted,undefined);
  const poison=JSON.parse('{"version":1,"app":"keyboard","data":{"__proto__":{"polluted":true}}}');assert.throws(()=>api.validate(poison,'keyboard'),/Unsupported backup key/);
  const words=JSON.parse('{"frequent_words":{"__proto__":{"count":1}},"bigrams":{},"trigrams":{}}');assert.throws(()=>api.validate(envelope('keyboard',{userKeyboardData:words}),'keyboard'),/Unsafe/);
});
test('size, depth, malformed JSON values and oversized collections are bounded',()=>{
  const large=Array.from({length:100},(_,i)=>({title:'Title '+i,url:'unfinished',description:'a'.repeat(90000)}));
  assert.throws(()=>api.validate(envelope('streaming',{[prefix+'catalog']:large}),'streaming'),/too large/);
  const circular={};circular.self=circular;assert.throws(()=>api.validate(envelope('keyboard',{kb_settings:circular}),'keyboard'),/circular/);
  const deep={};let cursor=deep;for(let i=0;i<20;i++)cursor=cursor.next={};assert.throws(()=>api.validate(envelope('keyboard',{kb_settings:deep}),'keyboard'),/deeply/);
  assert.throws(()=>api.validate(envelope('dayhub',{dayhub_weather_web_v2:{lat:NaN,lon:0,label:'Bad'}}),'dayhub'));
  const getter={};Object.defineProperty(getter,'theme',{get(){throw Error('Getter executed');},enumerable:true});assert.throws(()=>api.validate(envelope('keyboard',{kb_settings:getter}),'keyboard'),/plain data/);
  assert.equal(api.maxBytes('streaming'),8_000_000);assert.equal(api.maxBytes('keyboard'),2_000_000);
});

test('version 2 recovery archives retain conflicting app values without applying them as current data',()=>{
  const input={...json(keyboard),version:2,migrationArchives:[{origin:'https://another-hub.test',data:{kb_settings:{theme:'purple'}}}]};
  const clean=api.validate(input,'keyboard');assert.equal(clean.values.kb_settings.theme,'blue');assert.equal(clean.migrationArchives[0].data.kb_settings.theme,'purple');assert.equal(clean.migrationArchives[0].origin,'https://another-hub.test');
  for(const invalid of [{...input,version:1},{...input,migrationArchives:[{origin:'file://private',data:{}}]},{...input,migrationArchives:[{origin:'https://valid.test/path',data:{}}]},{...input,migrationArchives:[{origin:'https://valid.test',data:{otherApp:[]}}]},{...input,migrationArchives:Array.from({length:101},()=>({origin:'https://valid.test',data:{}}))}])assert.throws(()=>api.validate(invalid,'keyboard'));
});
