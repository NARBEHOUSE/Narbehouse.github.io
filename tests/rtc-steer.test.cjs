const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=process.env.RTC_STEER_ROOT||path.resolve(__dirname,'..'),app=path.join(root,'bennyshub/apps/tools/rtc-lite'),C=require(path.join(app,'core.js'));
const board=()=>({general:['A different plan','Give me a moment','Could you explain','Let us think'],specific:['We could go tomorrow','Who will be there','Tell me about it','Could we try later'],summary:'The partner asked about plans.',steers:['Stay home','Watch something','Tired']});
const snapshot=()=>{const m=new C.Memory();m.add('room','speech','What do you want to do today?');return m.snapshot();};
test('steer schema, prompt direction, context, and bounded history',()=>{
 assert.deepEqual(C.BOARD_SCHEMA.properties.steers,{type:'array',items:{type:'string'},minItems:3,maxItems:3});
 const prompt=C.boardPrompt(snapshot(),{},Array.from({length:100},(_,i)=>'Previous '+i),'Stay home');
 assert.match(prompt,/USER wants replies about: "Stay home"/);assert.match(prompt,/What do you want to do today/);
 assert.match(prompt,/CURRENT eight suggestions do not cover/);assert(!prompt.includes('"Previous 0"'));assert(prompt.includes('"Previous 99"'));
 assert(!C.boardPrompt(snapshot(),{},[]).includes('USER wants replies about:'));
});
test('steering instructions ask for broad purposes without priming the old example set',()=>{
 for(const room of ['What do you want to do today?','I had a frustrating day.','That movie was hilarious.']){
  const memory=new C.Memory();memory.add('room','speech',room);
  const prompt=C.boardPrompt(memory.snapshot(),{},[],'',['My opinion','Ask why','Tell you']);
  assert(prompt.includes(JSON.stringify(room)));assert.match(prompt,/broad conversational directions/);
  assert.match(prompt,/Replace ALL THREE/);assert.match(prompt,/"My opinion","Ask why","Tell you"/);
  for(const label of ['Stay home','Watch something','Tired'])assert(!prompt.includes(label));
 }
 const prompt=C.boardPrompt(snapshot(),{},[],'',Array.from({length:20},(_,i)=>'Old '+i));
 assert(!prompt.includes('"Old 7"'));assert(prompt.includes('"Old 8"'));
});
test('Different replaces all three recent labels even with repeated, invalid, or unavailable AI',()=>{
 let history=[...C.DEFAULTS.steers];
 for(let i=0;i<30;i++){
  const before=history.slice(-C.STEER_HISTORY_LIMIT);
  const next=C.boardSteers(i%2?before.slice(-3):undefined,C.DEFAULTS.steers,before);
  assert.equal(next.length,3);assert.deepEqual(C.validateSteers(next,before),next);
  history.push(...next);
 }
 assert.deepEqual(C.boardSteers(undefined,['Music','Food','Rest']),['Music','Food','Rest']);
 const repeated=C.validateBoard(board(),[],board().steers);
 assert.equal(repeated.steers,undefined);assert.equal(repeated.general.length+repeated.specific.length,8);
});
test('invalid steers preserve eight valid suggestions and fall back to personal defaults',()=>{
 const fallback=['Music','Family','Rest'];
 for(const steers of [undefined,null,[],['Short'],['Same','same!','Rest'],['Different','Food','Rest'],['one two three four','Food','Rest'],['x'.repeat(33),'Food','Rest'],['line\nbreak','Food','Rest'],['A different plan','Food','Rest'],[{},'Food','Rest']]){
  const result=C.validateBoard({...board(),steers});assert.equal(result.general.length+result.specific.length,8);assert.equal(result.steers,undefined);
  assert.deepEqual(C.boardSteers(result.steers,fallback),fallback);
 }
 assert.deepEqual(C.validateBoard(board()).steers,board().steers);
 assert.deepEqual(C.boardSteers(undefined),C.DEFAULTS.steers);
});
test('editable steer defaults normalize spacing and reject blank, long, duplicate and reserved labels',()=>{
 assert.deepEqual(C.validateSteers(['  Stay   home ','Music','Ask you']),['Stay home','Music','Ask you']);
 for(const value of ['', '   ', 'one two three four','x'.repeat(33),'Different!','ask YOU','Music\tplease','---'])assert.throws(()=>C.validateSteers([value,'Music','Ask you']));
 assert.deepEqual(C.boardSteers(['bad'],['also bad']),['How I feel','I want','Ask you']);
});
for(const provider of ['cloud','chrome','server'])test(provider+' preserves steers in the same request, tolerates invalid steers, and passes the direction',async()=>{
 const prefs={ai:provider,serverModel:'fixture',defaults:{...C.DEFAULTS,steers:['Music','Food','Rest']}},calls=[],responses=[board(),{...board(),steers:['invalid']},board()];
 const respond=async(prompt,options)=>{calls.push({prompt,options});return JSON.stringify(responses.shift());};
 const LanguageModel={availability:async()=> 'available',create:async()=>({prompt:respond,destroy(){}})};
 const window={RtcCore:C,LanguageModel,RtcByok:{connection:()=>({provider:'openai'}),generate:respond},RtcServer:{generate:async(p,prompt,schema,prediction,signal)=>respond(prompt,{schema,prediction,signal})}};
 const localStorage={getItem:()=> 'sk-fixture'};
 vm.runInNewContext(fs.readFileSync(path.join(app,'providers.js'),'utf8'),{window,LanguageModel,localStorage,AbortController,AbortSignal,DOMException,setTimeout,clearTimeout});
 const ai=new window.RtcAI(()=>prefs,()=>{});if(provider==='chrome')await ai.setup(false);
 const desktop=typeof ai.cloud==='function';if(desktop&&provider==='cloud')ai.cloud=respond;
 const avoid=Array.from({length:90},(_,i)=>'Old choice '+i);
 const valid=await ai.getSuggestions(snapshot(),{},avoid,new AbortController().signal,'Stay home');
 assert.deepEqual(valid.steers,board().steers);assert.equal(calls.length,1);
 if(provider==='cloud'&&!desktop){assert.equal(calls[0].prompt.steer,'Stay home');assert.equal(calls[0].prompt.avoid.length,80);}
 else assert.match(calls[0].prompt,/USER wants replies about: "Stay home"/);
 const fallback=await ai.getSuggestions(snapshot(),{},[],new AbortController().signal);
 assert.equal(calls.length,2,'Bad steers must not trigger a repair request');assert.equal(fallback.general.length,4);assert.equal(fallback.steers,undefined);
 const repeated=await ai.getSuggestions(snapshot(),{},[],new AbortController().signal,'',board().steers);
 assert.equal(calls.length,3,'Repeated steers must not trigger a repair request');assert.equal(repeated.steers,undefined);assert.equal(repeated.specific.length,4);
 if(provider==='cloud'&&!desktop)assert.deepEqual(Array.from(calls[2].prompt.avoidSteers),board().steers);
 else {assert.match(calls[2].prompt,/Replace ALL THREE/);assert(calls[2].prompt.includes(JSON.stringify(board().steers)));}
});
