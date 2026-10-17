const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const app=path.join(__dirname,'../bennyshub/apps/tools/rtc-lite');

function fixture(){
 const prefs={ai:'webllm'},events=[];
 const context={window:{RtcCore:{}},AbortController,DOMException,setTimeout,clearTimeout,
  navigator:{gpu:{requestAdapter(){events.push('gpu');throw Error('Unexpected GPU use');}}},
  Worker:class{constructor(){events.push('worker');throw Error('Unexpected worker');}}};
 vm.runInNewContext(fs.readFileSync(path.join(app,'providers.js'),'utf8'),context);
 const ai=new context.window.RtcAI(()=>prefs,()=>{});
 return {ai,prefs,events,context};
}

test('retired browser provider refuses loading and stale generation without GPU or worker use',async()=>{
 const {ai,events}=fixture();
 await assert.rejects(ai.setup(true),/no longer offered/);assert.equal(ai.loading,false);
 ai.ready='webllm';assert.equal(ai.isAvailable(),false);
 await assert.rejects(ai.request('hello',{},false,new AbortController().signal),/Set up/);
 assert.deepEqual(events,[]);
});

test('supported Chrome AI still loads, generates, and disposes its session',async()=>{
 const {ai,prefs,context,events}=fixture();prefs.ai='chrome';let destroyed=0;
 context.LanguageModel=context.window.LanguageModel={availability:async()=> 'available',create:async()=>({prompt:async()=>'{"reply":"Hello"}',destroy(){destroyed++;}})};
 await ai.setup(false);assert.equal(ai.isAvailable(),true);
 assert.equal(await ai.request('hello',{},false,new AbortController().signal),'{"reply":"Hello"}');
 assert.equal(destroyed,1);ai.stop();assert.equal(ai.isAvailable(),false);assert.deepEqual(events,[]);
});
