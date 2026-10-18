'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {Channel}=require('../bennyshub/shared/communication-channel.js');
function harness(parentService){
 const workers=[],elements=new Map(),window={};let settings,change;
 class Worker{constructor(){this.sent=[];workers.push(this);}postMessage(m){this.sent.push(m);}terminate(){}reply(data){this.onmessage({data});}}
 const element=id=>{if(!elements.has(id))elements.set(id,{textContent:'',setAttribute(){}});return elements.get(id);};
 const context={window,parent:parentService?{location:{origin:'http://localhost:8000'},NarbeCommunicationSpeech:{_service:parentService}}:window,location:{origin:'http://localhost:8000'},isSecureContext:true,URL,Worker,setTimeout,clearTimeout,
  document:{currentScript:{src:'http://localhost:8000/shared/communication-speech.js'},addEventListener(){},getElementById:element},
  navigator:{mediaDevices:{enumerateDevices:async()=>[],addEventListener(){}}},HTMLMediaElement:{prototype:{setSinkId(){}}},NarbeCommunicationChannel:{Channel},
  NarbePlatform:{lifecycle:{onClose(){}},settings:{open({normalize,onChange}){settings=normalize({enabled:false});change=onChange;return {readCached:()=>settings,save(value){settings=normalize(value);change();},dispose(){}};}}}};
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
