'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
test('the speech shell update retires the old app cache while keeping downloaded model caches',async()=>{
 const events={},removed=[],names=['benny-web-experiment-v50','benny-web-experiment-v51','transformers-cache','kokoro-voices','other-app'];
 const context={URL,Set,self:{registration:{scope:'https://example.test/bennyshub/'},addEventListener:(name,handler)=>{events[name]=handler;},clients:{claim:async()=>{}},skipWaiting:async()=>{}},caches:{keys:async()=>names,delete:async name=>{removed.push(name);}},Response};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../bennyshub/service-worker.js'),'utf8'),context);
 let completion;events.activate({waitUntil:promise=>{completion=promise;}});await completion;
 assert.deepEqual(removed,['benny-web-experiment-v50']);
});
