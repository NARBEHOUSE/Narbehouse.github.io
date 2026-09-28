const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const P=require('../bennyshub/apps/tools/phraseboard/prediction-engine.js');
// Exercise the worker boundary with a fake GPU/engine; model quality needs a real-device check.
const worker=fs.readFileSync(require.resolve('../bennyshub/apps/tools/phraseboard/prediction-worker.js'),'utf8').replace("import './prediction-engine.js';",'').replace("await import('https://esm.run/@mlc-ai/web-llm@0.2.85')",'testWebllm');
test('model requests pass a string JSON schema to the grammar compiler and validate responses',async()=>{
 const messages=[],requests=[];let unloaded=false;
 const engine={chat:{completions:{create:async request=>{requests.push(request);assert.equal(typeof request.response_format.schema,'string');const schema=JSON.parse(request.response_format.schema);assert.deepEqual(schema.required,['phrases']);return {choices:[{message:{content:JSON.stringify({phrases:['I want water','I want a spaceship']})}}]};}}},unload:async()=>{unloaded=true;}};
 const context={self:{postMessage:m=>messages.push(m)},navigator:{gpu:{requestAdapter:async()=>({})}},PhrasePredictions:P,testWebllm:{CreateMLCEngine:async()=>engine}};
 vm.runInNewContext(worker,context);await context.self.onmessage({data:{rows:[{display:'water',speak:'water'}],model:'small'}});
 assert.equal(requests.length,1);assert.deepEqual(Array.from(messages.find(m=>m.type==='complete').phrases),['I want water']);assert.equal(unloaded,true);
});
test('missing WebGPU yields a clear error and leaves automatic suggestions available',async()=>{
 const messages=[],context={self:{postMessage:m=>messages.push(m)},navigator:{},PhrasePredictions:P};vm.runInNewContext(worker,context);await context.self.onmessage({data:{rows:[{display:'water'}]}});assert.match(messages[0].text,/Built-in and learned suggestions still work/);
});
