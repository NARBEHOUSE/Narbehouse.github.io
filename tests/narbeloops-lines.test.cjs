'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const game = path.join(__dirname, '../bennyshub/apps/games/NARBELOOPS/js');
const plain = v => JSON.parse(JSON.stringify(v));
function harness(saved) {
  const memory = new Map(saved || []), blobs = new Map(); let fail = false, playing = false, render;
  const c = vm.createContext({ console, Blob, URL: { createObjectURL: blob => { const id='blob:'+blobs.size;blobs.set(id,blob);return id; } },
    localStorage: { getItem:k=>memory.get(k)||null,setItem:(k,v)=>{if(fail)throw Error('quota');memory.set(k,v);} } });
  c.window=c;c.NL={Sound:{isPlaying:()=>playing,setLoop:r=>render=r,play:()=>playing=true,stop:()=>playing=false,shot(){}}};
  for(const name of ['music','synth','beat','loops'])vm.runInContext(fs.readFileSync(path.join(game,name+'.js'),'utf8'),c);
  return {N:c.NL,memory,blobs,fail:()=>fail=true,render:()=>render};
}

test('adding empty lines, changing a whole line, removing and reloading preserve all other lines',()=>{
  const h=harness(), B=h.N.Beat, original=plain(B.snapshot()), clap=B.addLine('clap');
  assert.equal(B.lines().length,6);assert.equal(clap.instrument,'snare');assert.equal(B.soundIndex(clap),1);
  assert.deepEqual(plain(B.displayPattern(clap)),Array(16).fill(-1));
  B.toggleStep(clap,3);B.setSound(clap,2);
  assert.equal(B.partsOf().find(p=>p.layer.id===clap.id).sound,2);
  assert.deepEqual(plain(B.snapshot().layers.kick),original.layers.kick);
  assert.equal(Object.hasOwn(B.snapshot().layers[clap.id],'sounds'),false);
  assert.deepEqual(plain(harness(h.memory).N.Beat.snapshot()),plain(B.snapshot()));
  B.removeLine(clap);assert.equal(B.lines().length,5);assert.equal(B.line(clap.id),null);
  assert.deepEqual(plain(B.snapshot().layers),original.layers);
});
test('all added melodic sounds use the same pentatonic contour; cap and empty loop are durable',()=>{
  const h=harness(),B=h.N.Beat;
  for(const kind of ['bell','pluck','bass']) {
    const L=B.addLine(kind);assert.equal(L.type,'tone');
    for(let i=0;i<16;i++){B.toggleStep(L,i);assert.equal(B.displayPattern(L)[i],L.contour[i]);}
    assert.ok(h.render().samples.every(Number.isFinite));
  }
  assert.equal(B.lines().length,8);assert.equal(B.addLine('shaker'),null);
  for(const L of B.lines()) B.removeLine(L);
  assert.equal(harness(h.memory).N.Beat.lines().length,0);
  assert.equal(B.addLine('kick').name,'Kick');
  B.clearAll();assert.equal(B.lines().length,5);
});
test('legacy per-pip sounds migrate to the row majority without touching old libraries',()=>{
  const seed=harness().N.Beat.snapshot();delete seed.version;delete seed.order;
  for(const L of Object.values(seed.layers)){delete L.sound;L.sounds=[1,1,1,1,1,1,1,1,1,0,2,2,2,3,3,3];}
  seed.layers.kick.sounds=[2,3,2,3,2,3,2,3,2,3,2,3,2,3,2,3]; // tie -> lower picker index
  const library='{ "version": 1, "beats": [{"keep":true}], "songs": [1,2] }';
  const h=harness([['ngb-beat-v1',JSON.stringify(seed)],['nl-studio-v1',library]]);
  assert.equal(h.N.Beat.soundIndex(h.N.Beat.line('kick')),2);
  assert.equal(h.N.Beat.soundIndex(h.N.Beat.line('snare')),1);
  assert.equal(h.memory.get('nl-studio-v1'),library);assert.equal(h.memory.get('ngb-beat-v1'),JSON.stringify(seed));
  const saved=plain(h.N.Beat.snapshot());assert.equal(saved.version,2);assert.equal(Object.hasOwn(saved.layers.kick,'sounds'),false);
  h.N.Beat.setSound(h.N.Beat.line('kick'),3);
  assert.equal(harness(h.memory).N.Beat.soundIndex(harness(h.memory).N.Beat.line('kick')),3);
});
test('whole-line sound selection does not change notes, mute state, neighbors or playback preference',()=>{
  const h=harness(),B=h.N.Beat,L=B.line('kick'),before=plain(B.snapshot());
  for(let sound=0;sound<4;sound++) {B.setSound(L,sound);assert.equal(B.soundIndex(L),sound);assert.deepEqual(plain(B.displayPattern(L)),plain(L.presets[0]));}
  assert.deepEqual(plain(B.snapshot().layers.snare),before.layers.snare);
  assert.equal(B.setSound(L,4),false);assert.equal(B.setSound(L,-1),false);
  B.enter();B.togglePlay();assert.equal(B.isPlaying(),false);
  const next=harness(h.memory);next.N.Beat.enter();assert.equal(next.N.Beat.isPlaying(),false);
});
test('each sound choice renders distinct PCM and repeated WAV blocks are contiguous with no padding',async()=>{
  const h=harness(),N=h.N;
  for(const layer of N.Music.LAYERS){const variants=[];for(let sound=0;sound<4;sound++)variants.push(Buffer.from(await h.blobs.get(N.Synth.shotUrl(layer,0,sound)).arrayBuffer()));for(let i=1;i<4;i++)assert.notDeepEqual(variants[i],variants[i-1]);}
  const samples=new Float32Array([.1,-.2,.3,-.4]),wav=Buffer.from(await h.blobs.get(N.Synth.toWavUrl(samples,4)).arrayBuffer());
  assert.equal(wav.length,44+samples.length*2*4);assert.equal(wav.readUInt32LE(40),samples.length*2*4);
  for(let i=1;i<4;i++)assert.deepEqual(wav.subarray(44,52),wav.subarray(44+i*8,52+i*8));
});

test('loop templates are independent snapshots and reopen with added lines, row sounds and tempo',()=>{
  const h=harness(),N=h.N;
  const L=N.Beat.addLine('bell');N.Beat.toggleStep(L,7);N.Beat.setSound(L,3);N.Beat.cycleSpeed();
  const original=plain(N.Beat.snapshot()),one=N.Loops.save();
  N.Beat.toggleStep(L,8);const edited=plain(N.Beat.snapshot()),two=N.Loops.save();
  assert.equal(one.number,1);assert.equal(two.number,2);assert.deepEqual(plain(N.Loops.list()[0].beat),original);
  one.beat.layers.kick.sound=3;assert.equal(N.Loops.list()[0].beat.layers.kick.sound,0);
  const reopened=harness(h.memory);reopened.N.Loops.open('loop-1');
  assert.deepEqual(plain(reopened.N.Beat.snapshot()),original);
  reopened.N.Loops.open('loop-2');assert.deepEqual(plain(reopened.N.Beat.snapshot()),edited);
  assert.deepEqual(JSON.parse(reopened.memory.get('nl-beat-v1')),edited);
});
test('failed template saves and opens keep the current loop and saved copies intact',()=>{
  const h=harness(),N=h.N;N.Loops.save();N.Beat.toggleStep(N.Beat.line('kick'),2);
  const before=plain(N.Beat.snapshot()),stored=h.memory.get('nl-loops-v1');
  h.fail();assert.throws(()=>N.Loops.save(),/quota/);assert.equal(h.memory.get('nl-loops-v1'),stored);
  assert.throws(()=>N.Loops.open('loop-1'),/quota/);assert.deepEqual(plain(N.Beat.snapshot()),before);
  assert.throws(()=>N.Loops.open('missing'),/not be found/);assert.deepEqual(plain(N.Beat.snapshot()),before);
});
