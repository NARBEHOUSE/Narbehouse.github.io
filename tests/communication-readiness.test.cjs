'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {Channel}=require('../bennyshub/shared/communication-channel.js');
const source=file=>fs.readFileSync(path.join(__dirname,'../bennyshub/shared',file),'utf8');

// Run the real Pocket worker queue, service, channel and Settings renderer.
// Only model inference, device enumeration and audio hardware are substituted.
function harness(){
 const window={},elements=new Map(),workers=[],generations=[],players=[];
 const flush=()=>new Promise(resolve=>setImmediate(resolve));
 const element=id=>{if(!elements.has(id))elements.set(id,{textContent:'',setAttribute(){}});return elements.get(id);};
 class Worker{
  constructor(){
   this.sent=[];this.replies=[];workers.push(this);
   const scope={self:{},postMessage:data=>{this.replies.push(data);this.onmessage?.({data});},createPocket:()=>({generate:(text,{voice})=>new Promise((resolve,reject)=>generations.push({text,voice,resolve:()=>resolve({audio:new Float32Array(2400)}),reject}))})};
   vm.runInNewContext(source('communication-pocket-worker.js').replace(/^import .*;$/m,''),scope);
   this.dispatch=scope.self.onmessage;
  }
  postMessage(data){this.sent.push(data);this.dispatch({data});}
  terminate(){this.terminated=true;}
 }
 class Audio{
  constructor(){players.push(this);}
  async setSinkId(id){this.sinkId=id;}
  async play(){this.onplaying?.();queueMicrotask(()=>this.onended?.());}
  pause(){}removeAttribute(){}load(){}
 }
 const context={window,parent:window,location:{origin:'http://localhost'},isSecureContext:true,URL,Blob,Worker,Audio,setTimeout,clearTimeout,
  document:{currentScript:{src:'http://localhost/shared/communication-speech.js'},addEventListener(){},getElementById:element},
  navigator:{mediaDevices:{enumerateDevices:async()=>[{kind:'audiooutput',deviceId:'speaker',label:'Speaker'}],addEventListener(){}}},
  HTMLMediaElement:{prototype:{setSinkId(){}}},NarbeCommunicationChannel:{Channel},
  NarbePlatform:{lifecycle:{onClose(){}},settings:{open({normalize,onChange}){
   let settings=normalize({enabled:true,voice:'pocket:a5',sinkId:'speaker',sinkLabel:'Speaker'});
   return {readCached:()=>settings,save(value){settings=normalize(value);onChange();},dispose(){}};
  }}}};
 vm.createContext(context);vm.runInContext(source('communication-speech.js'),context);
 context.NarbeCommunicationSpeech=window.NarbeCommunicationSpeech;
 vm.runInContext(source('communication-settings.js'),context);
 window.NarbeCommunicationSettings.mount({refreshScan(){},announce(){}});
 return {api:window.NarbeCommunicationSpeech,element,workers,generations,players,flush};
}
async function previewDuringSetup(h){
 await h.flush();assert.equal(h.generations.length,1);
 const ticket=h.api.preview();await h.flush();
 h.generations[0].resolve();await h.flush();
 assert(h.workers[0].replies.some(m=>m.id==='prepare-1'&&m.cancelled));
 assert.equal(h.generations.length,2);
 return ticket;
}
test('Custom Upbeat 2 loses the not-ready label after a preview supersedes setup',async t=>{
 const h=harness();t.after(()=>h.api._service.dispose());
 const ticket=await previewDuringSetup(h);
 h.generations[1].resolve();assert.equal((await ticket.finished).reason,'ended');await h.flush();
 assert.equal(h.players[0].sinkId,'speaker');
 assert.equal(h.api.get().voicePreparing,false);
 assert.equal(h.api.get().voiceReady,true);
 assert.equal(h.element('speaker-voice-status').textContent,'Custom Upbeat 2');
});
test('failed custom preview does not mark the selected voice ready',async t=>{
 const h=harness();t.after(()=>h.api._service.dispose());
 const ticket=await previewDuringSetup(h);
 h.generations[1].reject(Error('Model failure'));assert.equal((await ticket.finished).reason,'error');await h.flush();
 assert.equal(h.api.get().voiceReady,false);
 assert.equal(h.element('speaker-voice-status').textContent,'Custom Upbeat 2 (not ready)');
});
test('obsolete custom audio cannot mark a newly selected voice ready',async t=>{
 const h=harness();t.after(()=>h.api._service.dispose());
 const ticket=await previewDuringSetup(h);h.api.cycleVoice();
 assert.equal((await ticket.finished).reason,'cancelled');
 h.generations[1].resolve();await h.flush();
 assert.equal(h.api.get().voice,'pocket:b2');assert.equal(h.api.get().voiceReady,false);
 assert.equal(h.generations[2].voice,'pocket:b2');h.generations[2].resolve();await h.flush();
 assert.equal(h.api.get().voiceReady,true);assert.equal(h.element('speaker-voice-status').textContent,'Custom Bright 1');
});
