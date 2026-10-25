'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const game = path.join(__dirname, '../bennyshub/apps/games/NARBELOOPS/js');
const plain = value => JSON.parse(JSON.stringify(value));
function harness(saved) {
  const memory = new Map(saved ? [['nl-beat-v1', JSON.stringify(saved)]] : []);
  let playing = false, rendered = null;
  const shots = [];
  const c = vm.createContext({ console, localStorage: { getItem: k => memory.get(k) || null, setItem: (k,v) => memory.set(k,v) } });
  c.window = c; c.NL = {
    Sound: { isPlaying: () => playing, play: () => { playing = true; }, stop: () => { playing = false; },
      phase: () => { throw Error('Editing must never depend on audio timing'); },
      setLoop: r => { rendered = r; }, shot: (layer,value) => shots.push([layer.id,value]) },
    Synth: { renderLoop: (parts,bpm) => plain({parts,bpm}) }
  };
  for (const name of ['music','beat']) vm.runInContext(fs.readFileSync(path.join(game,name+'.js'),'utf8'),c);
  return { beat:c.NL.Beat, music:c.NL.Music, shots, saved:()=>JSON.parse(memory.get('nl-beat-v1')), rendered:()=>rendered };
}
test('all sixteen boxes toggle independently of playback time and save after every choice', () => {
  const h=harness(), layer=h.music.layer('kick'), initial=plain(h.beat.displayPattern(layer));
  for(let i=0;i<16;i++) {
    const prior=plain(h.beat.ownPattern(layer));
    assert.equal(h.beat.toggleStep(layer,i), initial[i]<0);
    const stored=h.saved().layers.kick;
    assert.equal(stored.sel,'mine'); assert.equal(stored.muted,false);
    assert.equal(stored.mine[i]>=0,initial[i]<0);
    for(let j=0;j<16;j++) if(j!==i)assert.equal(stored.mine[j],prior[j]);
  }
  assert.deepEqual(plain(layer.presets[0]),initial);
});
test('bass and melody use their musical contour, while turning off every step remains a valid saved pattern', () => {
  for(const id of ['bass','melody']) {
    const h=harness(),layer=h.music.layer(id);
    for(let i=0;i<16;i++)if(h.beat.ownPattern(layer)[i]>=0)h.beat.toggleStep(layer,i);
    assert.deepEqual(h.saved().layers[id].mine,Array(16).fill(-1));
    for(let i=0;i<16;i++){h.beat.toggleStep(layer,i);assert.equal(h.beat.ownPattern(layer)[i],layer.contour[i]);}
    assert.equal(h.shots.length,16);
  }
});
test('preview changes replace the loop without starting unwanted playback or changing other layers', () => {
  const h=harness(),layer=h.music.layer('snare');
  h.beat.toggleStep(layer,0); assert.equal(h.beat.isPlaying(),false);
  const other=plain(h.saved().layers.kick);
  assert.equal(h.beat.togglePlay(),true);
  h.beat.toggleStep(layer,3);
  assert.deepEqual(h.rendered().parts.find(p=>p.layer.id==='snare').pattern,h.saved().layers.snare.mine);
  assert.deepEqual(h.saved().layers.kick,other);
  assert.equal(h.beat.togglePlay(),false);
});
test('preset cycling preserves custom patterns, and editing always changes the visible pattern', () => {
  const h=harness(),layer=h.music.layer('kick');h.beat.toggleStep(layer,1);
  const custom=plain(h.beat.ownPattern(layer));h.beat.nextPattern(layer);
  const reopened=harness(h.saved()),kick=reopened.music.layer('kick');
  assert.deepEqual(plain(reopened.beat.snapshot().layers.kick.mine),custom);
  const visible=plain(reopened.beat.displayPattern(kick));
  assert.deepEqual(visible,plain(kick.presets[0]));
  reopened.beat.toggleStep(kick,2);
  assert.deepEqual(plain(reopened.beat.ownPattern(kick)).filter((_,i)=>i!==2),visible.filter((_,i)=>i!==2));
});
test('invalid box indexes never write a save or alter a preset', () => {
  const h=harness(),layer=h.music.layer('kick'),before=plain(h.beat.displayPattern(layer));
  for(const i of [-1,16,1.5,NaN,'1'])assert.equal(h.beat.toggleStep(layer,i),undefined);
  assert.deepEqual(plain(h.beat.displayPattern(layer)),before);
});
