const test=require('node:test');
const assert=require('node:assert/strict');
const voices=require('../bennyshub/shared/communication-voices.js');
function file(overrides={},frames=2){
  const data=new Float32Array(frames*1024).map((_,i)=>Math.sin(i)/10);
  return JSON.stringify({format:'pocket-tts-voice-print',version:1,name:'Warm Low',made_from:'a written description (Voice Studio)',
    frames,dim:1024,dtype:'float32-le',data:Buffer.from(data.buffer).toString('base64'),...overrides});
}
test('a Voice Studio export becomes a voice print',()=>{
  const v=voices.parse(file());
  assert.equal(v.name,'Warm Low');assert.equal(v.recorded,false);assert.equal(v.frames,2);
  assert.equal(v.data.length,2048);assert.ok(Math.abs(v.data[1]-Math.sin(1)/10)<1e-7);
});
test('recorded voices are marked, not refused',()=>{
  const v=voices.parse(file({made_from:'a recording',permission:'Only with permission.'}));
  assert.equal(v.recorded,true);
});
test('names are cleaned and shortened',()=>{
  assert.equal(voices.parse(file({name:'  A\u0007 very\n long name that goes on and on and on forever  '})).name,'A very long name that goes on and on and');
  assert.equal(voices.parse(file({name:''})).name,'Custom voice');
});
test('wrong, damaged or incomplete files are refused with a plain message',()=>{
  assert.throws(()=>voices.parse('not json'),/not a Voice Studio voice file/);
  assert.throws(()=>voices.parse(JSON.stringify({format:'something-else'})),/not a Voice Studio voice file/);
  assert.throws(()=>voices.parse(file({version:2})),/newer Voice Studio/);
  assert.throws(()=>voices.parse(file({dim:512})),/not for this voice model/);
  assert.throws(()=>voices.parse(file({frames:3})),/incomplete/);
  assert.throws(()=>voices.parse(file({frames:0})),/not for this voice model/);
  const nan=new Float32Array(1024).fill(NaN);
  assert.throws(()=>voices.parse(file({frames:1,data:Buffer.from(nan.buffer).toString('base64')},1)),/damaged/);
  assert.throws(()=>voices.parse('x'.repeat(4_000_001)),/too large/);
});
test('added voice ids are recognised and new ids are unique',()=>{
  const a=voices.newId(),b=voices.newId();
  assert.ok(voices.isCustomId(a));assert.notEqual(a,b);
  for(const id of ['pocket:b4','am_michael','pocket:user-XYZ','pocket:user-../../x'])assert.equal(voices.isCustomId(id),false);
});
