const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const C=require('../bennyshub/apps/tools/rtc-lite/core.js');
const app=path.join(__dirname,'../bennyshub/apps/tools/rtc-lite');
const greeting=()=>({
 general:['Hi there!','Good to hear from you.','Can you give me a moment?','Please say that again.'],
 specific:['How is your day going?','What would you like to talk about?','Can we talk later?','Tell me what you have been doing.'],
 summary:'The other person said hello.'
});
const placeholders=['No replies needed yet.','Nothing specific to add','No response is necessary.','There are no suggestions available yet.','Nothing relevant to say','Waiting for conversation context','You could say hello','The user should ask a question'];
function hello(){const memory=new C.Memory();memory.add('room','speech','hello');return memory.snapshot();}
function fixture(responses,provider='chrome'){
 const prefs={ai:provider,serverModel:'test-model',defaults:C.DEFAULTS},requests=[],destroyed=[];
 const respond=async(prompt,options)=>{requests.push({prompt,options});assert.ok(responses.length,'Unexpected extra model request');return JSON.stringify(responses.shift());};
 const LanguageModel={availability:async()=> 'available',create:async()=>({prompt:respond,destroy(){destroyed.push(true);}})};
 const window={RtcCore:C,LanguageModel,RtcByok:{connection:()=>({provider:'google'}),generate:respond},RtcServer:{generate:async(p,prompt,schema,prediction,signal)=>respond(prompt,{schema,prediction,signal})}};
 vm.runInNewContext(fs.readFileSync(path.join(app,'providers.js'),'utf8'),{window,LanguageModel,AbortController,AbortSignal,DOMException,setTimeout,clearTimeout});
 return {ai:new window.RtcAI(()=>prefs,()=>{}),prefs,requests,destroyed};
}

test('generated placeholders are rejected even when the board has valid JSON and eight phrases',()=>{
 for(const text of placeholders){const board=greeting();board.specific[0]=text;assert.throws(()=>C.validateSuggestions(board),/task commentary/,text);}
 assert.deepEqual(C.validateSuggestions(greeting()),greeting());
});

test('personal boundaries, uncertainty and disagreement remain valid generated options',()=>{
 const board={general:["I don't want to talk.",'I have nothing to add.',"I'd rather not discuss that.",'Please give me a moment.'],specific:["I don't agree.",'Can we do something else?','I need more information.','I am not sure yet.'],summary:''};
 assert.deepEqual(C.validateSuggestions(board),board);
});

test('user-authored saved phrases keep their existing validation rules',()=>{
 for(const text of placeholders){const saved=greeting();saved.general[0]=text;assert.deepEqual(C.validateBoard(saved),saved);}
});

test('partial recovery removes generated commentary without filtering saved personal phrases',()=>{
 const board=greeting();board.general[0]=placeholders[0];board.specific[0]=placeholders[1];
 const usable=C.usableBoard(board),saved={...C.DEFAULTS,general:[placeholders[0],...C.DEFAULTS.general.slice(1)]};
 assert.equal(usable.general.length,3);assert.equal(usable.specific.length,3);
 const result=C.completeBoard(usable,saved);
 assert.equal(result.savedCount,2);assert.equal(result.summaryValid,false);assert.equal(result.summary,'');
 assert.ok(result.general.includes(placeholders[0]),'Explicitly saved text remains available');
 assert.ok(!result.specific.includes(placeholders[1]));
 assert.equal(C.completeBoard({general:placeholders.slice(0,4),specific:placeholders.slice(4)}),null);
});

test('Nano retries a greeting with task commentary and returns only the corrected spoken choices',async()=>{
 const bad=greeting();bad.general[0]=placeholders[0];bad.specific[0]=placeholders[1];
 const {ai,requests,destroyed}=fixture([bad,greeting()]);await ai.setup(false);
 assert.deepEqual(await ai.getSuggestions(hello(),{},[],new AbortController().signal),greeting());
 assert.equal(requests.length,2);assert.equal(destroyed.length,2);
 assert.match(requests[0].prompt,/latest statement from the other person: "hello"/);
 assert.match(requests[1].prompt,/Problem: AI returned task commentary/);
 assert.equal(requests[0].options.responseConstraint,C.BOARD_SCHEMA);
});

test('two partially unusable Nano replies recover useful choices with saved phrases, never a fake summary',async()=>{
 const partial=()=>({general:[placeholders[0],'Hi there!','Hi there!','Hi there!'],specific:[placeholders[1],'How is your day going?','How is your day going?','How is your day going?'],summary:'The user said all the generated replies.'});
 const {ai,requests}=fixture([partial(),partial()]);await ai.setup(false);
 const result=await ai.getSuggestions(hello(),{},[],new AbortController().signal);
 assert.equal(requests.length,2);assert.equal(result.savedCount,6);assert.equal(result.summaryValid,false);assert.equal(result.summary,'');
 assert.ok(result.general.includes('Hi there!'));assert.ok(result.specific.includes('How is your day going?'));
 assert.ok(![...result.general,...result.specific].some(s=>placeholders.includes(s)));
});

test('completely unusable replies stop after one repair so the app can restore saved phrases',async()=>{
 const bad=()=>({general:placeholders.slice(0,4),specific:placeholders.slice(4),summary:''});
 const {ai,requests}=fixture([bad(),bad()]);await ai.setup(false);
 await assert.rejects(ai.getSuggestions(hello(),{},[],new AbortController().signal),/task commentary/);
 assert.equal(requests.length,2);
});

test('valid local-server choices retain agreement, refusal and alternatives without a retry',async()=>{
 const offer={general:['That sounds good.',"I'd rather stay home.",'Let me think about it.','What did you say?'],specific:['Could we go after lunch?','How about the library instead?','Who else is going?','How long would we stay?'],summary:'The other person offered to go to the park.'};
 const {ai,requests}=fixture([offer],'server');const memory=new C.Memory();memory.add('room','speech','Would you like to go to the park?');
 assert.deepEqual(await ai.getSuggestions(memory.snapshot(),{},[],new AbortController().signal),offer);assert.equal(requests.length,1);
});

test('own-key replies use the same client check without issuing extra paid calls',async()=>{
 const bad=greeting();bad.specific[0]=placeholders[1];
 const {ai,requests}=fixture([bad,greeting()],'cloud');
 await assert.rejects(ai.getSuggestions(hello(),{},[],new AbortController().signal),/task commentary/);
 assert.equal(requests.length,1);
 assert.deepEqual(await ai.getSuggestions(hello(),{},[],new AbortController().signal),greeting());
 assert.equal(requests.length,2);
});

test('duplicate/avoid and speaker-label checks still apply to generated choices',()=>{
 assert.throws(()=>C.validateSuggestions(greeting(),['Hi there']),/repeated/);
 const board=greeting();board.general[0]='USER: Hi there';assert.throws(()=>C.validateSuggestions(board),/task commentary/);
 assert.ok(!C.usableBoard(board).general.includes(board.general[0]));
});
