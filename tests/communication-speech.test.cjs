'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {Channel}=require('../bennyshub/shared/communication-channel.js');
function harness(parentService,initial={enabled:false}){
 const workers=[],elements=new Map(),window={};let settings,change;
 class Worker{constructor(url,options){this.url=String(url);this.options=options;this.sent=[];workers.push(this);}postMessage(m){this.sent.push(m);}terminate(){this.terminated=true;}reply(data){this.onmessage({data});}}
 const element=id=>{if(!elements.has(id))elements.set(id,{textContent:'',setAttribute(){}});return elements.get(id);};
 const context={window,parent:parentService?{location:{origin:'http://localhost:8000'},NarbeCommunicationSpeech:{_service:parentService}}:window,location:{origin:'http://localhost:8000'},isSecureContext:true,URL,Worker,setTimeout,clearTimeout,
  document:{currentScript:{src:'http://localhost:8000/shared/communication-speech.js'},addEventListener(){},getElementById:element},
  navigator:{mediaDevices:{enumerateDevices:async()=>[],addEventListener(){}}},HTMLMediaElement:{prototype:{setSinkId(){}}},NarbeCommunicationChannel:{Channel},
  NarbePlatform:{lifecycle:{onClose(){}},settings:{open({normalize,onChange}){settings=normalize(initial);change=onChange;return {readCached:()=>settings,save(value){settings=normalize(value);change();},dispose(){}};}}}};
 vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(__dirname,'../bennyshub/shared/communication-speech.js'),'utf8'),context);
 context.NarbeCommunicationSpeech=window.NarbeCommunicationSpeech;
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../bennyshub/shared/communication-settings.js'),'utf8'),context);
 window.NarbeCommunicationSettings.mount({refreshScan(){},announce(){}});
 return {api:window.NarbeCommunicationSpeech,workers,element,flush:()=>new Promise(resolve=>setImmediate(resolve))};
}
test('failed voice preparation stops the preparing label and a fresh setup can become ready',async t=>{
 const h=harness();t.after(()=>h.api._service.dispose());h.api.toggle();
 assert.equal(h.api.get().voicePreparing,true);assert.equal(h.element('speaker-voice-status').textContent,'Michael (preparing)');
 let worker=h.workers.at(-1);worker.reply({id:worker.sent[0].id,error:'Failed to fetch'});await h.flush();
 assert.equal(h.api.get().phase,'error');assert.equal(h.api.get().voicePreparing,false);assert.equal(h.element('speaker-voice-status').textContent,'Michael (not ready)');
 h.api.toggle();h.api.toggle();worker=h.workers.at(-1);worker.reply({id:worker.sent[0].id,ready:true});await h.flush();
 assert.equal(h.api.get().voiceReady,true);assert.equal(h.api.get().voicePreparing,false);assert.equal(h.element('speaker-voice-status').textContent,'Michael');
});
test('turning speaker mode off during preparation clears the preparing label',async t=>{
 const h=harness();t.after(()=>h.api._service.dispose());h.api.toggle();h.api.toggle();await h.flush();
 assert.equal(h.api.get().enabled,false);assert.equal(h.api.get().voicePreparing,false);assert.equal(h.element('speaker-voice-status').textContent,'Michael');
});

test('background preparation needs a ready enabled voice and never starts playback',async t=>{
 const h=harness();t.after(()=>h.api._service.dispose());h.api.prefetch(['Hello']);assert.equal(h.workers.length,0);
 h.api.toggle();const worker=h.workers.at(-1);h.api.prefetch(['Hello']);assert.equal(worker.sent.filter(m=>m.type==='prefetch').length,0);
 worker.reply({id:worker.sent[0].id,ready:true});await h.flush();
 h.api.prefetch(['Hello']);assert.equal(worker.sent.at(-1).type,'prefetch');assert.deepEqual(Array.from(worker.sent.at(-1).texts),['Hello']);assert.equal(h.api.get().phase,'ready');
 worker.reply({prefetched:true,text:'Hello',voice:'am_michael'});assert.equal(h.api.get().phase,'ready');
 h.api._service.releaseOwner(h.api.get().owner); // An unrelated owner must not clear another page's work.
 assert.deepEqual(Array.from(worker.sent.at(-1).texts),['Hello']);
 h.api.cycleVoice();assert(worker.sent.some(m=>m.type==='prefetch'&&m.texts.length===0));
});

test('a newly loaded tool can share an older open Hub service without a prefetch method',t=>{
 const hub=harness();t.after(()=>hub.api._service.dispose());const spoken=[],ticket={finished:Promise.resolve({reason:'ended'})};
 const oldService={...hub.api._service,prefetch:undefined,snapshot:()=>({...hub.api.get(),enabled:true}),speak:(text,owner)=>{spoken.push({text,owner});return ticket;}};
 const tool=harness(oldService);assert.equal(tool.api._service,oldService);assert.equal(tool.workers.length,0);
 assert.doesNotThrow(()=>tool.api.prefetch(['Hello']));assert.equal(tool.api.speak('Hello'),ticket);assert.equal(spoken[0].text,'Hello');
});

test('Natural is the default for existing preferences and Faster preserves the chosen Natural voice',async t=>{
 const h=harness(undefined,{enabled:false,voice:'bm_george'});t.after(()=>h.api._service.dispose());
 assert.equal(h.api.get().speechMode,'natural');assert.equal(h.api.get().voice,'bm_george');assert.equal(h.api.get().voices.length,14);
 h.api.toggle();const natural=h.workers.at(-1);assert(natural.url.endsWith('/communication-worker.js'));assert.equal(natural.options.type,'module');
 natural.reply({id:natural.sent[0].id,ready:true});await h.flush();h.api.cycleMode();
 assert.equal(natural.terminated,true);assert.equal(h.api.get().speechMode,'fast');assert.equal(h.api.get().voice,'piper_lj');assert.equal(h.api.get().voiceReady,false);
 const fast=h.workers.at(-1);assert(fast.url.endsWith('/communication-fast-worker.js'));assert.equal(fast.options.type,'classic');
 fast.reply({id:fast.sent[0].id,ready:true});await h.flush();assert.equal(h.api.get().voiceReady,true);
 assert.equal(h.element('speaker-quality-status').textContent,'Faster');assert.equal(h.element('speaker-voice-toggle').disabled,false);
 h.api.cycleVoice();assert.equal(h.api.get().voice,'piper_bryce');assert.equal(h.workers.length,2);h.api.cycleMode();
 assert.equal(fast.terminated,true);assert.equal(h.api.get().voice,'bm_george');assert.equal(h.api.get().voices.length,14);assert.equal(h.element('speaker-voice-toggle').disabled,false);
});
test('Faster persists locally and obsolete setup cannot make a different mode ready',async t=>{
 const h=harness(undefined,{enabled:true,speechMode:'fast',voice:'af_heart'});t.after(()=>h.api._service.dispose());
 const fast=h.workers.at(-1),oldId=fast.sent[0].id;assert.equal(h.api.get().speechMode,'fast');
 h.api.cycleMode();const natural=h.workers.at(-1);fast.reply({id:oldId,ready:true});await h.flush();
 assert.equal(h.api.get().voice,'af_heart');assert.equal(h.api.get().voiceReady,false);
 natural.reply({id:natural.sent[0].id,ready:true});await h.flush();assert.equal(h.api.get().voiceReady,true);
 h.api.cycleMode();h.api.toggle();await h.flush();assert.equal(h.api.get().enabled,false);assert.equal(h.api.get().voicePreparing,false);assert.equal(h.workers.at(-1).terminated,true);
});

test('six Faster voices cycle and persist independently of the original Natural voice',async t=>{
 const h=harness(undefined,{enabled:false,speechMode:'fast',voice:'bm_george',fastVoice:'piper_norman'});t.after(()=>h.api._service.dispose());
 assert.equal(h.api.get().voice,'piper_norman');assert.equal(h.api.get().voices.length,6);const visited=[];
 for(let i=0;i<6;i++){visited.push(h.api.get().voice);h.api.cycleVoice();}assert.equal(new Set(visited).size,6);assert.equal(h.api.get().voice,'piper_norman');
 h.api.cycleMode();assert.equal(h.api.get().voice,'bm_george');h.api.cycleMode();assert.equal(h.api.get().voice,'piper_norman');
});
test('existing Faster users keep LJ and invalid saved choices fall back to LJ',t=>{
 for(const fastVoice of [undefined,'obsolete']){const h=harness(undefined,{enabled:false,speechMode:'fast',fastVoice});t.after(()=>h.api._service.dispose());assert.equal(h.api.get().voice,'piper_lj');}
});

test('returning to the previous Faster voice during setup warms its model again',async t=>{
 const h=harness(undefined,{enabled:true,speechMode:'fast'});t.after(()=>h.api._service.dispose());const worker=h.workers[0];worker.reply({id:worker.sent[0].id,ready:true});await h.flush();assert.equal(h.api.get().voiceReady,true);
 h.api.cycleVoice();for(let i=0;i<5;i++)h.api.cycleVoice();assert.equal(h.api.get().voice,'piper_lj');assert.equal(h.api.get().voiceReady,false);assert.equal(h.api.get().voicePreparing,true);
 const prepare=worker.sent.filter(m=>m.type==='prepare').at(-1);assert.equal(prepare.voice,'piper_lj');worker.reply({id:prepare.id,ready:true});await h.flush();assert.equal(h.api.get().voiceReady,true);
});
