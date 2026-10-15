'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const C = require('../js/cards.js'), E = require('../js/engine.js'), M = require('../js/menus.js'), W = require('../js/words.js');
let id = 0;
const cards = ts => ts.map(t => ({ t, id: 'action' + id++ }));
function table(mode, n = 3) {
  const s = E.createGame({ mode, players: Array.from({length:n}, (_,p) => ({name:'P'+p, kind:p ? 'cpu' : 'human'})) }, 42).state;
  s.players.forEach(P => { P.hand = cards(['red']); P.known=[]; });
  s.draw = cards(Array(20).fill('blue')); s.discard=cards(['orange']); s.phase='play';
  return s;
}
const keys = s => E.legalMoves(s).map(m => m.key);
function menuKeys(s) {
  const d=E.getDecision(s), tree=M.build(d,E.viewFor(s,d.p),{names:s.players.map(p=>p.name)},{helper:'off'});
  const walk=items=>items.flatMap(i=>i.children?walk(i.children):i.move?[i.move]:[]);
  return walk(tree);
}
for (const mode of ['classic','classicLite']) {
  test(mode+': Fog remains playable after drawing and combos, even above seven cards', () => {
    for(let n=2;n<=6;n++) {
      const s=table(mode,n);s.players[0].hand=cards(['fog','sun','rain',...Array(6).fill('red')]);s.phase='draw';
      E.applyMove(s,'draw');
      assert.ok(keys(s).includes('weather:fog:1'));assert.ok(menuKeys(s).includes('weather:fog:1'));
      E.applyMove(s,'combo:core');assert.equal(s.players[0].hand.length,8);
      assert.ok(keys(s).includes('weather:fog:1'));assert.ok(menuKeys(s).includes('weather:fog:1'));
      E.applyMove(s,'weather:fog:1');assert.equal(s.players[1].skips,1);
      assert.ok(!keys(s).some(k=>k.startsWith('weather:')),'one Action per turn');
    }
  });
  test(mode+': reacting with Cloud does not consume the next turn’s Action', () => {
    const s=table(mode);s.turn=2;s.players[2].hand=cards(['double','red']);s.players[0].hand=cards(['cloud','fog','red']);
    E.applyMove(s,'weather:double');assert.equal(E.getDecision(s).p,0);E.applyMove(s,'block');E.applyMove(s,'end');
    assert.equal(s.turn,0);E.applyMove(s,'draw');assert.ok(keys(s).includes('weather:fog:1'));
  });
  test(mode+': starting discard phase ends the chance to play an Action', () => {
    const s=table(mode);s.players[0].hand=cards(['fog',...Array(9).fill('red')]);
    E.applyMove(s,'discard:red');assert.equal(s.phase,'discard');assert.equal(s.weatherPlayed,false);
    assert.ok(keys(s).includes('discard:fog'));assert.ok(!keys(s).some(k=>k.startsWith('weather:')));
  });
  test(mode+': any other Cloud holder can block Actions involving computer opponents', () => {
    for(let n=3;n<=6;n++) for(const action of ['weather:fog:2','weather:wind:2:red','weather:storm:red','weather:double']) {
      const s=table(mode,n);s.turn=1;s.players[1].hand=cards(['fog','wind','storm','double','red']);
      s.players.forEach((P,p)=>{if(p!==1)P.hand=cards(['cloud','red']);});
      E.applyMove(s,action);assert.ok(s.pending.queue.includes(0));
      while(E.getDecision(s).p!==0)E.applyMove(s,'allow');
      assert.ok(menuKeys(s).includes('block'));const ev=E.applyMove(s,'block');
      assert.ok(ev.some(e=>e.t==='blocked'));assert.ok(!ev.some(e=>['fog','wind','storm','double'].includes(e.t)));
      assert.equal(s.players[2].skips,0);assert.deepEqual(s.players[2].hand.map(c=>c.t),['cloud','red']);
    }
  });
}
test('Day and Night card descriptions and first-draw tips name Storm Shuffle', () => {
  for(const legend of ['day','night']) {
    const s=table('classic');s.players[0].hand=cards([legend,'red']);
    assert.match(C.ruleFor(legend),/Storm Shuffle/);
    const tip=W.hints(E.viewFor(s,0)).find(h=>h.id===(legend==='day'?'day-trap':'night'));
    assert.match(tip.say,/Storm Shuffle/);assert.match(tip.say,/Wind Trade/);
  }
});
