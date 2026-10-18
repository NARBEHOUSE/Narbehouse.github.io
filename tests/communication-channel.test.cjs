const test=require('node:test'),assert=require('node:assert/strict');
const {Channel,wave}=require('../bennyshub/shared/communication-channel.js');
const tick=()=>new Promise(r=>setImmediate(r));
function harness(){
 const events=[],audios=[],revoked=[],cancelled=[];let devices=[{deviceId:'speaker'}],generate=async()=>({samples:new Float32Array([.5,-.5]),sampleRate:24000});
 const channel=new Channel({synthesize:(...args)=>generate(...args),cancelSynthesis:id=>cancelled.push(id),enumerateOutputs:async()=>devices,
  createAudio(){const a={sinkId:'',src:'',setSinkId:async function(id){this.sinkId=id;},play:async function(){this.onplaying?.();},pause(){this.paused=true;},removeAttribute(){this.src='';},load(){}};audios.push(a);return a;},
  createUrl:()=> 'blob:test',revokeUrl:u=>revoked.push(u),onState:e=>events.push(e)});
 channel.selectSink('speaker');return {channel,events,audios,revoked,cancelled,setDevices:v=>devices=v,setGenerate:v=>generate=v};
}
test('750ms silent frames precede every original speech sample',()=>{
 const input=new Float32Array([.5,-.5,0,1,-1]),v=new DataView(wave(input,24000));
 assert.equal(v.getUint32(40,true),(18000+input.length)*2);
 for(let i=0;i<18000;i++)assert.equal(v.getInt16(44+i*2,true),0);
 assert.deepEqual(Array.from({length:input.length},(_,i)=>v.getInt16(44+(18000+i)*2,true)),[16383,-16384,0,32767,-32768]);
});
test('routes only to explicit sink and resolves actual playback end',async()=>{
 const h=harness(),t=h.channel.speak('Hello',{owner:'keyboard'});await tick();assert.equal(await t.started,true);
 assert.equal(h.audios[0].sinkId,'speaker');let done=false;t.finished.then(()=>done=true);await tick();assert.equal(done,false);
 h.audios[0].onended();assert.equal((await t.finished).reason,'ended');assert.equal(h.revoked.length,1);
});
test('no selection or a removed speaker fails without default playback',async()=>{
 for(const id of ['', 'default', 'communications', 'missing']){
  const h=harness();h.channel.selectSink(id);const t=h.channel.speak('Private text');assert.equal((await t.finished).reason,'error');assert.equal(h.audios.length,0);
 }
});
test('cancel during generation never plays a late result',async()=>{
 const h=harness();let resolve;h.setGenerate(()=>new Promise(r=>resolve=r));const t=h.channel.speak('Old');await tick();t.cancel();
 assert.equal((await t.finished).reason,'cancelled');resolve({samples:new Float32Array([1]),sampleRate:24000});await tick();assert.equal(h.audios.length,0);
});
test('new message replaces the old message without old completion taking ownership',async()=>{
 const h=harness();let resolve;h.setGenerate(()=>new Promise(r=>resolve=r));const old=h.channel.speak('Old');await tick();
 h.setGenerate(async()=>({samples:new Float32Array([1]),sampleRate:24000}));const next=h.channel.speak('New');await tick();
 resolve({samples:new Float32Array([1]),sampleRate:24000});await tick();assert.equal((await old.finished).reason,'cancelled');assert.equal(h.audios.length,1);h.audios[0].onended();assert.equal((await next.finished).reason,'ended');
});
test('owner close cannot stop another owner; output change does stop playback',async()=>{
 const h=harness(),t=h.channel.speak('Hello',{owner:'rtc'});await tick();h.channel.stop('keyboard');assert.ok(h.channel.active);
 h.channel.selectSink('other');assert.equal((await t.finished).reason,'cancelled');assert.equal(h.audios[0].paused,true);
});
test('disconnect stops current playback and never replays on reconnect',async()=>{
 const h=harness(),t=h.channel.speak('Hello');await tick();h.setDevices([]);await h.channel.devicesChanged();assert.equal((await t.finished).reason,'error');
 h.setDevices([{deviceId:'speaker'}]);await h.channel.devicesChanged();assert.equal(h.audios.length,1);assert.equal(h.channel.active,null);
});
test('play rejection releases its blob and surfaces error',async()=>{
 const h=harness();const create=h.channel.createAudio;h.channel.createAudio=()=>{const a=create();a.play=async()=>{throw Error('Permission denied');};return a;};
 const t=h.channel.speak('Hello');assert.equal((await t.finished).reason,'error');assert.equal(h.revoked.length,1);assert.match(h.events.at(-1).detail,/Permission denied/);
});
test('voice failure and oversize text do not reach the audio player',async()=>{
 const h=harness();h.setGenerate(async()=>{throw Error('Download failed');});assert.equal((await h.channel.speak('Hello').finished).reason,'error');
 assert.equal((await h.channel.speak('x'.repeat(5001)).finished).reason,'error');assert.equal(h.audios.length,0);
});

test('ordinary message generation never claims to download a voice',async()=>{
 const h=harness(),ticket=h.channel.speak('Hello');await tick();
 assert.equal(h.events.find(e=>e.phase==='generating').detail,'Preparing message…');
 assert(h.events.every(e=>!/download|first use/i.test(e.detail)));h.audios[0].onended();await ticket.finished;
});

test('RTC handoff padding overlaps synthesis and leaves other messages at 750 ms',async()=>{
 const h=harness(),buffers=[];h.channel.createUrl=buffer=>{buffers.push(new DataView(buffer));return 'blob:test';};
 let resolve;h.setGenerate(()=>new Promise(r=>resolve=r));const ticket=h.channel.speak('RTC',{notBefore:Date.now()+2200});await tick();assert.equal(h.audios.length,0);
 resolve({samples:new Float32Array([.5]),sampleRate:24000});await tick();const pad=buffers[0].getUint32(40,true)/2-1;assert.ok(pad>24000*1.9&&pad<=24000*2.2);assert.equal(buffers[0].getInt16(44+pad*2,true),16383);ticket.cancel();
 h.setGenerate(async()=>({samples:new Float32Array([.5]),sampleRate:24000}));const normal=h.channel.speak('Keyboard');await tick();assert.equal(buffers[1].getUint32(40,true)/2-1,18000);normal.cancel();
 const elapsed=h.channel.speak('Already ready',{notBefore:Date.now()-100});await tick();assert.equal(buffers[2].getUint32(40,true)/2-1,18000);elapsed.cancel();
});
