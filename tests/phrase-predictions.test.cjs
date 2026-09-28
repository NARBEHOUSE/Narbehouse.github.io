const test=require('node:test'),assert=require('node:assert/strict');
const P=require('../bennyshub/apps/tools/phraseboard/prediction-engine.js');
const data=require('../bennyshub/apps/tools/phraseboard/prediction-data.js');
const PB=require('../bennyshub/apps/tools/phraseboard/board-core.js');
function storage(){const map=new Map();return {getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};}
const rows=[{category:'Food',display:'pizza'},{category:'Drinks',display:'water'},{category:'Feelings',display:'happy'},{category:'Places',display:'park'},{category:'Media',speak:'https://youtube.com/watch?v=test',display:'Movie'}];
test('automatic suggestions use board vocabulary from every category on day one',()=>{
  const vocabulary=[...rows,...['I','want','need','feel','can','you','to','go','eat','drink','help','outside'].map(display=>({category:'Core',display}))];
  const p=new P.Predictor(data).setBoard(vocabulary);
  assert.ok(Object.keys(data.vocabulary).length>40000);
  assert.deepEqual(p.suggest('').map(x=>x.text),['I want','I need','I feel','can you']);
  assert.ok(p.suggest('I want to').some(x=>x.text==='go'));
  assert.ok(p.suggest('I feel').some(x=>x.text==='happy'));
  for(const category of ['Core','Food','Places'])assert.deepEqual(p.suggest('I want to',{category}),p.suggest('I want to'));
  for(const message of ['','I','I want','I want to','I feel','can you'])for(const item of p.suggest(message))assert.ok(P.words(item.text).every(w=>p.tokens.has(w)),item.text);
});
test('two-word context wins over popular one-word matches; fallback needs no usable trigram',()=>{
  const dictionary={contexts:{'please bring':[['tea',1],['coffee',20]],bring:[['blanket',100]]}};
  const board=['please','bring','tea','blanket'].map(display=>({display}));
  const p=new P.Predictor(dictionary).setBoard(board);
  assert.deepEqual(p.suggest('please bring').map(x=>x.text),['tea']);
  assert.equal(p.suggest('please bring')[0].contextLength,2);
  p.setBoard(board.filter(r=>r.display!=='tea'));
  assert.deepEqual(p.suggest('please bring').map(x=>x.text),['blanket']);
  assert.equal(p.suggest('please bring')[0].contextLength,1);
  assert.deepEqual(p.suggest('unrecorded quux'),[]);
});
test('dictionary compiler keeps candidates beyond twelve and sentence continuation pairs',()=>{
  const fs=require('node:fs');
  const source=JSON.parse(fs.readFileSync(require.resolve('../bennyshub/apps/tools/keyboard/web_keyboard_predictions.json'),'utf8'));
  const options=data.contexts['want to'];assert.ok(options.length>12);
  for(const [text,record] of Object.entries(source.trigrams)){
    const tokens=text.toLowerCase().split(' ');
    if(tokens.length!==3||!tokens.every(w=>/^[a-z]+(?:['-][a-z]+)*$/.test(w))||!(record.count>0))continue;
    assert.ok(data.contexts[tokens.slice(0,2).join(' ')]?.some(([next])=>next===tokens[2]),text);
    assert.ok(data.contexts[tokens[0]]?.some(([next])=>next===tokens.slice(1).join(' ')),text);
  }
  // The only on-board continuation lies beyond the old top-12 cutoff.
  const [next]=options.slice(12).find(([text])=>P.words(text).length===1&&!['want','to'].includes(text));
  const p=new P.Predictor(data).setBoard(['want','to',next].map(display=>({display})));
  assert.ok(p.suggest('want to',{limit:50}).some(x=>P.key(x.text)===next),next);
});
test('category names do not manufacture sentences or fill unmatched contexts',()=>{
  const p=new P.Predictor({}).setBoard([{category:'Feelings',display:'sandwich'},{category:'Food',display:'yesterday'}]);
  assert.deepEqual(p.suggest('I feel'),[]);
  assert.deepEqual(p.suggest('I want'),[]);
  assert.ok(p.suggest('').every(x=>['sandwich','yesterday'].includes(x.text)));
});
test('past spoken sentences add personal continuations while keeping board starters',()=>{
  const s=storage();P.remember(s,'I want to visit the aquarium');P.remember(s,'I want to visit the aquarium');
  const p=new P.Predictor(data).setBoard(rows).setHistory(P.readHistory(s));
  assert.ok(p.suggest('I want to visit').some(x=>x.text==='the aquarium'&&x.source==='history'));
  assert.ok(p.suggest('').some(x=>x.source==='history'));assert.ok(p.suggest('').some(x=>x.source==='board'));
  s.removeItem(P.HISTORY_KEY);p.setHistory(P.readHistory(s));assert.ok(p.suggest('').every(x=>x.source!=='history'));
});
test('history is bounded, case-insensitive, separate from board exports, and handles corrupt storage',()=>{
  const s=storage();P.remember(s,'I want water',0);P.remember(s,'i want water',0);assert.equal(P.readHistory(s)[0].count,2);
  for(let i=0;i<220;i++)P.remember(s,'I want option '+i,i+1);
  assert.equal(P.readHistory(s).length,200);assert.equal(P.readHistory(s)[0].text,'I want option 219');
  s.setItem(P.HISTORY_KEY,'{invalid');assert.deepEqual(P.readHistory(s),[]);
  assert.ok(!PB.csv(rows).includes('aquarium'));
});
test('board analysis learns internal contexts but never treats neighboring tiles as a sentence',()=>{
  const p=new P.Predictor(data).setBoard([{category:'Words',speak:'I would like orange juice'},{category:'Words',speak:'zorbella'},{category:'Words',speak:'quuxington'}]);
  assert.ok(p.suggest('like orange').some(x=>x.text==='juice'&&x.source==='board'));
  assert.ok(!p.suggest('zorbella').some(x=>x.text==='quuxington'));
  assert.ok(!p.suggest('Please wait. ').some(x=>x.text==='wait'));
});
test('prepared model output is vocabulary-validated and survives CSV/save round trips only once',()=>{
  const input=['I want pizza','I feel happy','I want a spaceship','https://bad.example','<script>bad</script>',null,'I want pizza'];
  assert.deepEqual(P.validatePhrases(input,rows),['I want pizza','I feel happy']);
  const ready=PB.normalize(rows.map(r=>({...r,predictionPhrases:JSON.stringify(['I want pizza','I feel happy'])})));
  const csv=PB.csv(ready);assert.equal(csv.match(/I want pizza/g).length,1);
  const decoded=PB.parse(csv);assert.equal(decoded[1].predictionPhrases,ready[0].predictionPhrases);
  assert.equal(new P.Predictor(data).setBoard(decoded).aiPhrases.length,2);
  assert.deepEqual(P.validatePhrases(['I want pizza'],rows.filter(r=>r.display!=='pizza')),[]);
});

test('expanded NARBE Words keeps core vocabulary and produces broad grammatical continuations across categories',()=>{
 const fs=require('node:fs');const board=PB.parse(fs.readFileSync(require.resolve('../bennyshub/apps/tools/phraseboard/boards/NARBE_Words.csv'),'utf8'));
 assert.ok(board.length>=2800);const vocabulary=new Set(board.map(r=>r.speak.toLowerCase()));for(const word of ['would','could','should','must','may','might','shall','ought',"wouldn't","couldn't","shouldn't","I'm",'usually','almost','went','brought','heard','belong','privacy','consent','rights','reposition','reschedule'])assert.ok(vocabulary.has(word.toLowerCase()),word+' must be available');for(const category of ['Contractions','Adverbs','Verb forms'])assert.ok(board.some(r=>r.category===category));assert.equal(board.find(r=>r.speak==='go').category,'Core');assert.ok(board.some(r=>r.speak==='not'));assert.ok(board.some(r=>r.speak==='talk'));assert.ok(board.some(r=>r.speak==='pain'));
 const predictor=new P.Predictor(data).setBoard(board);assert.ok(predictor.automaticPhrases.length>=1000);
 for(const category of ['Core','Verbs','Food','School']){const suggestions=predictor.suggest('I want to',{category}).map(x=>x.text);assert.ok(suggestions.includes('go'));assert.ok(!suggestions.some(x=>['am','are','is','been'].includes(x)));}
 assert.ok(predictor.suggest('I need').some(x=>x.text==='help'));assert.equal(predictor.suggest('I feel')[0].text,'happy');
 predictor.setHistory([{text:'I want to swim',count:10,time:1}]);assert.equal(predictor.suggest('I want to')[0].text,'swim');
 const batches=P.analysisBatches(board),terms=new Set(batches.flatMap(b=>b.focus.map(x=>P.key(x.text))));
 assert.ok(terms.has('go')&&terms.has('water')&&terms.has('spelling'));assert.ok(batches.every(b=>b.focus.length<=24));assert.ok(batches[0].shared.actions.includes('go'));assert.ok(new Set(batches[0].focus.map(x=>x.category)).size>10);
 assert.deepEqual(P.validatePhrases(['I want to am','I want to go'],board),['I want to go']);
 const prepared=P.validatePhrases(predictor.automaticPhrases,board);assert.ok(prepared.length>120);
 const decoded=PB.parse(PB.csv(board.map(r=>({...r,predictionPhrases:JSON.stringify(prepared)}))));assert.equal(JSON.parse(decoded[0].predictionPhrases).length,prepared.length);
});
