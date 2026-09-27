const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
async function system(model){
 const env={fetch:async()=>({ok:true,json:async()=>({frequent_words:{},bigrams:{},trigrams:{}})}),localStorage:{getItem:()=>null,setItem(){}},Event:class{},dispatchEvent(){},kenLMPredictor:{predict:model}};env.window=env;
 vm.runInNewContext(fs.readFileSync('bennyshub/apps/tools/keyboard/predictions.js','utf8'),env);await env.predictionSystem.ready;return env.predictionSystem;
}
test('hybrid preserves original completions while adding contextual model candidates',async()=>{
 const p=await system(async()=>['THE','THAT','THEIR','THIS','THINGS','TO']);
 p.getLocalPredictions=async()=>['THE','TO','THIS','TODAY','THAT','THEY'];
 const result=await p.getHybridPredictions('how are you doing t');
 assert.equal(result.length,6);assert.equal(new Set(result).size,6);assert.ok(result.includes('TODAY'));assert.ok(result.includes('THEIR'));assert.ok(result.every(w=>w.startsWith('T')));
});
test('learned words retain priority and failed enhancement returns the exact local predictions',async()=>{
 const p=await system(async()=>['THE','THAT','THEIR']);p.getLocalPredictions=async()=>['TODAY','TO','THE','THIS','THAT','THEY'];
 p.userData.trigrams['YOU DOING TOMORROW']={count:3};assert.equal((await p.getHybridPredictions('how are you doing t'))[0],'TOMORROW');
 const fallback=await system(async()=>{throw Error('Worker unavailable');});fallback.getLocalPredictions=p.getLocalPredictions;
 assert.deepEqual(await fallback.getHybridPredictions('how are you doing t'),await p.getLocalPredictions());
});
test('local predictions reset at sentence boundaries and accept mixed whitespace',async()=>{
 const p=await system(async()=>[]);p.mergedData={frequent_words:{TODAY:{count:3}},bigrams:{'DOING TODAY':{count:3}},trigrams:{}};
 assert.ok((await p.getLocalPredictions('Earlier sentence. how  are you doing\tt')).includes('TODAY'));
 assert.deepEqual(Array.from(await p.getLocalPredictions('Earlier sentence. ')),['YES','NO','HELP','THE','I','YOU']);
});
