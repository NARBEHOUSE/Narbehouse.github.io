const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
async function system(model){
 const env={fetch:async()=>({ok:true,json:async()=>({frequent_words:{},bigrams:{},trigrams:{}})}),localStorage:{getItem:()=>null,setItem(){}},Event:class{},dispatchEvent(){},kenLMPredictor:{predict:model}};env.window=env;
 vm.runInNewContext(fs.readFileSync('bennyshub/apps/tools/keyboard/predictions.js','utf8'),env);await env.predictionSystem.ready;return env.predictionSystem;
}
test('completed words never suggest themselves but partial completions still work',async()=>{
 const p=await system(()=>{throw Error('KenLM must not run');});
 p.mergedData={frequent_words:{HELLO:{count:100},HELP:{count:10},YOU:{count:5}},bigrams:{'SAY HELLO':{count:10},'HELLO HELLO':{count:10},'HELLO YOU':{count:5}},trigrams:{}};
 for(const text of ['hello','say hello','hello ','say hello '])assert.ok(!(await p.getLocalPredictions(text)).includes('HELLO'));
 assert.ok((await p.getLocalPredictions('hel')).includes('HELLO'));
 assert.ok((await p.getLocalPredictions('hello ')).includes('YOU'));
 assert.deepEqual(await p.getHybridPredictions('hel'),await p.getLocalPredictions('hel'));
});

test('original predictor preserves learned words and contextual priority',async()=>{
 const p=await system(()=>{throw Error('KenLM must not run');});
 p.baseData={frequent_words:{THE:{count:1000}},bigrams:{},trigrams:{}};
 p.recordLocalWord('ZORBELL');p.recordNgram('I WANT','ZORBELL');
 assert.equal((await p.getLocalPredictions('I WANT '))[0],'ZORBELL');
 assert.ok((await p.getLocalPredictions('ZOR')).includes('ZORBELL'));
});

test('local predictions reset at sentence boundaries and accept mixed whitespace',async()=>{
 const p=await system(async()=>[]);p.mergedData={frequent_words:{TODAY:{count:3}},bigrams:{'DOING TODAY':{count:3}},trigrams:{}};
 assert.ok((await p.getLocalPredictions('Earlier sentence. how  are you doing\tt')).includes('TODAY'));
 assert.deepEqual(Array.from(await p.getLocalPredictions('Earlier sentence. ')),['YES','NO','HELP','THE','I','YOU']);
});
