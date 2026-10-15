'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const C = require('../js/cards.js'), E = require('../js/engine.js'), A = require('../js/ai.js');
const M = require('../js/menus.js'), W = require('../js/words.js'), D = require('../js/display.js');
let id = 10000;
const cards = a => a.map(t => ({id: 't' + id++, t}));
const modes = ['classic', 'classicLite', 'raceFull', 'race'];
const names = ['You', 'Misty', 'Breezy', 'Sunny', 'Drizzle', 'Thunder'];
function game(mode, n=2) { return E.createGame({mode, players: names.slice(0,n).map(name=>({name,kind:'cpu'}))}, 42).state; }
function table(mode, hand, laid={}) { const s=game(mode); s.phase='play'; s.players[0].hand=cards(hand); for(const k of Object.keys(laid)) s.players[0].laid[k]=cards(['wild']); return s; }
const keys = s => E.legalMoves(s).map(m=>m.key);

test('The four decks have exactly the requested card classes at every player count',()=>{
 for(const n of [2,3,4,5,6]) for(const mode of modes) {
  const s=game(mode,n), all=[...s.draw,...s.discard,...s.players.flatMap(p=>p.hand)];
  const legends=mode==='classic', core=mode!=='race', weather=mode==='classic'||mode==='classicLite';
  assert.equal(all.some(C.isLegend),legends); assert.equal(all.some(C.isWeather),weather);
  assert.equal(all.some(c=>c.t==='sun'),core); assert.equal(all.some(c=>c.t==='rain'),core);
  assert.equal(all.length,({classic:48,classicLite:46,raceFull:31,race:25})[mode]*E.setsFor(n));
  assert.equal(s.rules.emptyHand,false);
 }
});

test('Every preset wins immediately after its required combos with spare cards still in hand',()=>{
 for(const mode of modes) {
  const s=table(mode,[...C.COLORS,'red'],mode==='race'?{}:{core:true});
  const ev=E.applyMove(s,'combo:rainbow');
  assert.equal(s.phase,'over',mode); assert.equal(s.players[0].hand.length,1);
  assert.equal(ev.at(-1).t,'win'); assert.equal(s.turn,0,'no final discard or pass required');
 }
 const s=table('raceFull',['sun','rain','blue'],{rainbow:true});
 E.applyMove(s,'combo:core'); assert.equal(s.phase,'over'); assert.equal(s.players[0].hand.length,1);
});

test('Race Full requires Sun and Rain; Lite has no core requirement',()=>{
 const s=table('raceFull',[...C.COLORS,'red']); E.applyMove(s,'combo:rainbow');
 assert.equal(s.winner,null); assert.ok(keys(s).includes('pass:red')); assert.ok(!keys(s).includes('end'));
});

test('Day or Night in hand blocks a win; playing both releases the win with spare cards',()=>{
 for(const legend of ['day','night']) {
  const s=table('classic',[...C.COLORS,legend,'red'],{core:true}); E.applyMove(s,'combo:rainbow');
  assert.equal(s.winner,null,legend); assert.ok(!keys(s).includes('discard:'+legend));
 }
 const s=table('classic',['day','night','red'],{core:true,rainbow:true});
 E.applyMove(s,'combo:legend'); assert.equal(s.phase,'over'); assert.equal(s.winner.legend,true);
});

test('Storm removing the last Legend wins even with ordinary cards left',()=>{
 const s=table('classic',['storm','day','red'],{core:true,rainbow:true});
 s.players[1].hand=cards(['blue']); E.applyMove(s,'weather:storm:day');
 assert.equal(s.winner.p,0); assert.deepEqual(s.players[0].hand.map(c=>c.t),['red']);
 const t=table('classic',['storm','red']); t.players[1].hand=cards(['day','blue']);
 t.players[1].laid={rainbow:cards(['wild']),core:cards(['sun','rain']),legend:null};
 E.applyMove(t,'weather:storm:day'); assert.equal(t.winner.p,1);
});

test('Wind can release a win for its actor or target by removing their last Legend',()=>{
 const s=table('classic',['wind','day','red'],{core:true,rainbow:true});
 s.players[1].hand=cards(['blue']); E.applyMove(s,'weather:wind:1:day'); assert.equal(s.winner.p,0);
 const t=table('classic',['wind','red']); t.players[1].hand=cards(['night']);
 t.players[1].laid={rainbow:cards(['wild']),core:cards(['sun','rain']),legend:null};
 E.applyMove(t,'weather:wind:1:red'); assert.equal(t.winner.p,1);
});

test('Finishing combos above seven waits for discard/pass down to the limit',()=>{
 for(const mode of modes) {
  const s=table(mode,[...C.COLORS,...Array(8).fill('red')],mode==='race'?{}:{core:true});
  E.applyMove(s,'combo:rainbow'); assert.equal(s.winner,null);
  E.applyMove(s,(s.rules.draw==='pass'?'pass:':'discard:')+'red');
  assert.equal(s.phase,'over'); assert.equal(s.players[0].hand.length,7);
 }
});

test('Race draws only from the pile, then passes a chosen card to the right at every seat',()=>{
 for(const mode of ['raceFull','race']) for(const n of [2,3,4,5,6]) {
  const s=game(mode,n); s.players.forEach(p=>p.hand=cards(['red','blue']));
  s.draw=cards(Array(n).fill('green')); s.discard=[];
  for(let p=0;p<n;p++) {
   assert.equal(s.turn,p); assert.deepEqual(keys(s),['draw']);
   E.applyMove(s,'draw'); assert.ok(!keys(s).includes('end'));
   assert.ok(!keys(s).some(k=>/^discard|steal/.test(k)));
   const before=D.fromState(s), target=(p+1)%n, count=s.players[target].hand.length;
   const ev=E.applyMove(s,'pass:red'); ev.forEach(e=>D.apply(before,e));
   assert.ok(D.same(before,D.fromState(s))); assert.equal(ev[0].target,target);
   assert.equal(s.players[target].hand.length,count+1); assert.equal(s.turn,target);
   assert.equal(s.discard.length,0);
  }
 }
});

test('Passing continues down to seven, survives a save, and does not draw replacements',()=>{
 const s=table('raceFull',Array(10).fill('red')); const draw=s.draw.length;
 E.applyMove(s,'pass:red'); assert.equal(s.phase,'pass'); assert.equal(s.turn,0);
 assert.deepEqual(keys(s),['pass:red']);
 const copy=JSON.parse(JSON.stringify(s));
 for(let i=0;i<2;i++) assert.deepEqual(E.applyMove(copy,'pass:red'),E.applyMove(s,'pass:red'));
 assert.deepEqual(copy,s); assert.equal(s.players[0].hand.length,7); assert.equal(s.turn,1);
 assert.equal(s.draw.length,draw); assert.equal(s.players[1].hand.length,10);
});

test('An empty Race pile still offers combos and passing; an empty hand can end',()=>{
 const s=table('raceFull',['red']); s.draw=[]; s.discard=[];
 E.applyMove(s,'pass:red'); assert.equal(s.phase,'play'); assert.ok(keys(s).some(k=>k.startsWith('pass:')));
 const t=table('raceFull',[],{rainbow:true}); t.draw=[];
 assert.deepEqual(keys(t),['end']); E.applyMove(t,'end'); assert.equal(t.turn,1);
});

test('Pass rows include the recipient, highlight hand cards, and retain Look/Pause',()=>{
 const s=table('raceFull',['red','red','blue']);
 const d=E.getDecision(s), view=E.viewFor(s,0), items=M.build(d,view,{names},{helper:'shortcut',suggest:'pass:red'});
 const row=items.find(i=>i.id==='pass'); assert.match(row.say,/Misty on your right/);
 assert.deepEqual(row.children.map(i=>i.card),['red','blue']); assert.match(row.children[0].say,/you have 2/);
 assert.deepEqual(items.slice(-2).map(i=>i.id),['look','pause']);
 assert.equal(items[0].move,'pass:red'); assert.match(items[0].say,/Give Red to Misty/);
 s.phase='pass'; s.players[0].hand=cards(Array(9).fill('red'));
 assert.deepEqual(M.moveKeys(M.build(E.getDecision(s),E.viewFor(s,0),{names})),['pass:red']);
});

test('A passed card is private to its giver and recipient, with inbox news for the recipient',()=>{
 const ev={t:'pass',p:0,target:1,card:{t:'violet'}};
 for(const viewer of [-1,0,1,2]) {
  const line=W.describe(ev,{names,viewer});
  assert.equal(line.private,viewer===0||viewer===1);
  assert.equal(line.say.includes('Violet'),viewer===0||viewer===1);
 }
 assert.match(W.privateFor(ev,{names,viewer:0},1),/left gives you Violet/);
 const s=table('raceFull',['red']);
 assert.doesNotMatch(W.sayPiles(E.viewFor(s,0)),/discard/i);
});

test('New helper tips never require an empty hand; old saves keep that rule',()=>{
 const s=table('classic',['red','day'],{rainbow:true,core:true});
 assert.match(W.hints(E.viewFor(s,0)).map(h=>h.say).join(' '),/Legend is still/);
 delete s.rules.emptyHand; s.v=1; s.players[0].hand=cards(['red','blue']);
 E.applyMove(s,'discard:red'); assert.equal(s.winner,null,'legacy game needs an empty hand');
 assert.match(W.hints(E.viewFor(s,0)).map(h=>h.say).join(' '),/empty your hand/);
});

 test('Every new mode conserves cards and saves resume deterministically across many moves',()=>{
 for(const mode of modes) for(const n of [2,3,4,5,6]) {
  const s=game(mode,n); const all=st=>[...st.draw,...st.discard,...st.players.flatMap(p=>[...p.hand,...Object.values(p.laid).filter(Boolean).flat()])].map(c=>c.id).sort();
  const original=all(s); let steps=0;
  while(s.phase!=='over'&&steps++<1000) {
   const copy=JSON.parse(JSON.stringify(s)), d=E.getDecision(s), m=A.choose(E.viewFor(s,d.p),d,'normal',()=>0.42);
   const events=E.applyMove(s,m); assert.deepEqual(E.applyMove(copy,m),events); assert.deepEqual(JSON.parse(JSON.stringify(copy)),JSON.parse(JSON.stringify(s)));
   assert.deepEqual(all(s),original);
   for(const ev of events) if(ev.t==='end') assert.ok(s.players[ev.p].hand.length<=7);
  }
  assert.equal(s.phase,'over',mode+' '+n);
 }
});
