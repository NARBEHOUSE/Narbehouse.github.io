const {test}=require('node:test'),assert=require('node:assert/strict');
const modulePromise=import('../extension/app-data-store.mjs');
const origin='https://narbehouse.github.io';
const location=label=>({lat:42,lon:-71,label});
const words=count=>({frequent_words:{hello:{count,last_used:'2026-10-04'}},bigrams:{},trigrams:{}});
async function fixture(){
  const {createAppDataStore}=await modulePromise;const local={};let fail=false,writes=0,delay;
  const storage={async get(key){return Object.hasOwn(local,key)?{[key]:structuredClone(local[key])}:{};},async set(values){if(delay)await delay;if(fail)throw Error('QUOTA_BYTES');Object.assign(local,structuredClone(values));writes++;}};
  let store=createAppDataStore(storage);
  return {local,get writes(){return writes;},set fail(value){fail=value;},set delay(value){delay=value;},restart(){store=createAppDataStore(storage);},call:(action,payload,source=origin)=>store.request(action,payload,source),playback:(id,url)=>store.rememberPlayback(id,url)};
}
const code=expected=>error=>error.code===expected;

test('App storage persists allowlisted Keyboard, Day Hub and Streaming data through worker restarts',async()=>{
  const h=await fixture();
  for(const [app,data]of [
    ['keyboard',{userKeyboardData:words(3),kb_settings:{theme:'dark',autocapI:true}}],
    ['dayhub',{dayhub_weather_web_v2:location('Home')}],
    ['streaming',{'benny-web:v1:streaming.catalog':[{title:'A show',url:'https://www.youtube.com/watch?v=123'}]}]
  ]){
    const state=await h.call('APP_DATA_MIGRATE',{app,data});assert.deepEqual(state.data,data);assert.equal(state.revision,1);
    h.restart();assert.deepEqual((await h.call('APP_DATA_READ',{app})).data,data);
  }
  assert.equal(Object.keys(h.local).length,3);
});

test('App migration is once per origin and preserves conflicting legacy values in exportable archives',async()=>{
  const h=await fixture();await h.call('APP_DATA_MIGRATE',{app:'keyboard',data:{userKeyboardData:words(3)}});
  const next=await h.call('APP_DATA_MIGRATE',{app:'keyboard',data:{userKeyboardData:words(7),kb_settings:{theme:'dark'}}},'https://bennyshub.com');
  assert.equal(next.data.userKeyboardData.frequent_words.hello.count,3);assert.equal(next.data.kb_settings.theme,'dark');
  assert.equal(next.migrationConflicts,1);assert.equal(next.migrationArchives[0].data.userKeyboardData.frequent_words.hello.count,7);
  const again=await h.call('APP_DATA_MIGRATE',{app:'keyboard',data:{userKeyboardData:words(8)}},'https://bennyshub.com');assert.equal(again.migrated,false);assert.equal(again.revision,next.revision);
  const backup={version:2,app:'keyboard',data:next.data,migrationArchives:next.migrationArchives},other=await fixture();
  const restored=await other.call('APP_DATA_RESTORE',{backup,expectedRevision:0});assert.deepEqual(restored.migrationArchives,next.migrationArchives);
  const status=await h.call('APP_DATA_STATUS',{app:'keyboard'});assert.equal(status.migrationConflictCount,1);assert.equal('data'in status,false);
});

test('App storage ignores JSON object key ordering after Chrome storage serialization',async()=>{
  const h=await fixture();await h.call('APP_DATA_MIGRATE',{app:'keyboard',data:{kb_settings:{theme:'dark',autoScan:true}}});
  const identical=await h.call('APP_DATA_MIGRATE',{app:'keyboard',data:{kb_settings:{autoScan:true,theme:'dark'}}},'https://bennyshub.com');
  assert.equal(identical.migrationConflicts,0);assert.equal(identical.migrationArchives.length,0);
  const state=await h.call('APP_DATA_WRITE',{app:'keyboard',patch:{kb_settings:{autoScan:true,theme:'dark'}},expectedRevision:0});assert.equal(state.revision,identical.revision);
});

test('App patches serialize, enforce CAS and leave unrelated keys intact',async()=>{
  const h=await fixture();await h.call('APP_DATA_MIGRATE',{app:'keyboard',data:{userKeyboardData:words(3),kb_settings:{theme:'dark'}}});
  const results=await Promise.allSettled([
    h.call('APP_DATA_WRITE',{app:'keyboard',patch:{kb_settings:{theme:'light'}},expectedRevision:1}),
    h.call('APP_DATA_WRITE',{app:'keyboard',patch:{kb_settings:{theme:'green'}},expectedRevision:1})
  ]);
  assert.equal(results[0].status,'fulfilled');assert.equal(results[1].reason.code,'CONFLICT');
  const state=await h.call('APP_DATA_READ',{app:'keyboard'});assert.equal(state.data.kb_settings.theme,'light');assert.equal(state.data.userKeyboardData.frequent_words.hello.count,3);
  const retry=await h.call('APP_DATA_WRITE',{app:'keyboard',patch:{kb_settings:{theme:'light'}},expectedRevision:1});assert.equal(retry.revision,2);
});

test('App patches explicitly delete allowed keys without reviving them on migration retries',async()=>{
  const h=await fixture();await h.call('APP_DATA_MIGRATE',{app:'keyboard',data:{userKeyboardData:words(3),kb_settings:{theme:'dark'}}});
  const state=await h.call('APP_DATA_WRITE',{app:'keyboard',patch:{userKeyboardData:null},expectedRevision:1});assert.equal('userKeyboardData'in state.data,false);
  await assert.rejects(h.call('APP_DATA_WRITE',{app:'keyboard',patch:{calendarUrl:null},expectedRevision:state.revision}),code('INVALID'));
  const retry=await h.call('APP_DATA_MIGRATE',{app:'keyboard',data:{userKeyboardData:words(3)}});assert.equal('userKeyboardData'in retry.data,false);
});

test('App writes and migration receipts acknowledge only durable persistence, including quota failures',async()=>{
  const h=await fixture();let release,ack=false;h.delay=new Promise(resolve=>{release=resolve;});
  const pending=h.call('APP_DATA_MIGRATE',{app:'dayhub',data:{dayhub_weather_web_v2:location('Home')}}).then(value=>{ack=true;return value;});
  await new Promise(resolve=>setImmediate(resolve));assert.equal(ack,false);release();await pending;h.delay=null;
  const before=structuredClone(h.local);h.fail=true;
  await assert.rejects(h.call('APP_DATA_WRITE',{app:'dayhub',patch:{dayhub_weather_web_v2:location('Other')},expectedRevision:1}),code('STORAGE'));assert.deepEqual(h.local,before);
  h.fail=false;assert.equal((await h.call('APP_DATA_WRITE',{app:'dayhub',patch:{dayhub_weather_web_v2:location('Other')},expectedRevision:1})).revision,2);
});

test('App restore validates before replacing only imported keys and rejects stale restores',async()=>{
  const h=await fixture();await h.call('APP_DATA_MIGRATE',{app:'keyboard',data:{userKeyboardData:words(3),kb_settings:{theme:'dark'}}});
  const backup={version:1,app:'keyboard',data:{kb_settings:{theme:'light'}}};
  await assert.rejects(h.call('APP_DATA_RESTORE',{backup,expectedRevision:0}),code('CONFLICT'));
  const state=await h.call('APP_DATA_RESTORE',{backup,expectedRevision:1});assert.equal(state.data.kb_settings.theme,'light');assert.equal(state.data.userKeyboardData.frequent_words.hello.count,3);
  const before=structuredClone(h.local);
  await assert.rejects(h.call('APP_DATA_RESTORE',{backup:{version:1,app:'keyboard',data:{calendarUrl:'secret'}},expectedRevision:2}),code('INVALID'));assert.deepEqual(h.local,before);
});

test('App clear requires confirmation and current version while retaining migration receipts',async()=>{
  const h=await fixture();await h.call('APP_DATA_MIGRATE',{app:'dayhub',data:{dayhub_weather_web_v2:location('Home')}});
  await assert.rejects(h.call('APP_DATA_CLEAR',{app:'dayhub',revision:1}),code('INVALID'));
  await assert.rejects(h.call('APP_DATA_CLEAR',{app:'dayhub',revision:0,confirm:true}),code('CONFLICT'));
  const cleared=await h.call('APP_DATA_CLEAR',{app:'dayhub',revision:1,confirm:true});assert.deepEqual(cleared.data,{});
  const state=await h.call('APP_DATA_MIGRATE',{app:'dayhub',data:{dayhub_weather_web_v2:location('Home')}});assert.deepEqual(state.data,{});
});

test('App corruption fails closed and cannot reset or overwrite persistent user data',async()=>{
  const h=await fixture();h.local['appStorageV1:keyboard']={schemaVersion:1,app:'keyboard',revision:0,data:{unexpected:'private'}};
  const before=structuredClone(h.local);await assert.rejects(h.call('APP_DATA_READ',{app:'keyboard'}),code('CORRUPT'));
  await assert.rejects(h.call('APP_DATA_WRITE',{app:'keyboard',patch:{kb_settings:{theme:'light'}},expectedRevision:0}),code('CORRUPT'));assert.deepEqual(h.local,before);
});

test('App route authorization permits only its app and caregiver restore/clear, with Hub status only',async()=>{
  const {authorizeAppData}=await modulePromise;const hub=origin+'/bennyshub/',settings=hub+'data-settings.html';
  for(const app of ['keyboard','streaming','dayhub']){
    const page=hub+'apps/tools/'+app+'/index.html';
    assert.doesNotThrow(()=>authorizeAppData('APP_DATA_READ',page,1,app));
    assert.doesNotThrow(()=>authorizeAppData('APP_DATA_WRITE',settings,0,app));
    assert.throws(()=>authorizeAppData('APP_DATA_WRITE',settings,1,app),code('FORBIDDEN'));
    assert.doesNotThrow(()=>authorizeAppData('APP_DATA_STATUS',hub,0,app));
    assert.throws(()=>authorizeAppData('APP_DATA_READ',hub,0,app),code('FORBIDDEN'));
    assert.throws(()=>authorizeAppData('APP_DATA_WRITE',hub+'apps/tools/journal/index.html',1,app),code('FORBIDDEN'));
    for(const action of ['APP_DATA_RESTORE','APP_DATA_CLEAR']){
      assert.doesNotThrow(()=>authorizeAppData(action,settings,0,app));assert.throws(()=>authorizeAppData(action,settings,1,app),code('FORBIDDEN'));assert.throws(()=>authorizeAppData(action,page,0,app),code('FORBIDDEN'));
    }
  }
  assert.doesNotThrow(()=>authorizeAppData('APP_DATA_WRITE',hub+'apps/tools/streaming/editor.html',0,'streaming'));
  assert.throws(()=>authorizeAppData('APP_DATA_READ',hub+'apps/tools/keyboard/index.html',0,'streaming'),code('FORBIDDEN'));
});

test('Managed playback persists only its matching initialized Streaming library and keeps unrelated data',async()=>{
  const h=await fixture(),url='https://www.netflix.com/watch/123';
  assert.equal(await h.playback('playback',url),null);assert.equal(h.writes,0);
  const catalog=[{title:'A show',url}];
  await h.call('APP_DATA_MIGRATE',{app:'streaming',data:{'benny-web:v1:streaming.catalog':catalog,'benny-web:v1:streaming.activePlayback':{playbackId:'playback',show:'A Show',season:1,episode:3},'benny-web:v1:streaming.lastWatched':{'other show':{url:'https://www.youtube.com/watch?v=1',timestamp:1}}}});
  assert.equal(await h.playback('wrong-playback',url),null);
  const progress=await h.playback('playback',url);assert.equal(progress.episode,3);
  h.restart();let state=await h.call('APP_DATA_READ',{app:'streaming'});
  assert.deepEqual(state.data['benny-web:v1:streaming.catalog'],catalog);assert.equal(state.data['benny-web:v1:streaming.lastWatched']['a show'].url,url);assert.ok(state.data['benny-web:v1:streaming.lastWatched']['other show']);
  const before=state.revision;await h.playback('playback',url);state=await h.call('APP_DATA_READ',{app:'streaming'});assert.equal(state.revision,before);
});
