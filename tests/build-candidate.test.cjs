const test=require('node:test');
const assert=require('node:assert/strict');
const {companionCandidate}=require('../scripts/build.cjs');
const link=name=>'<a href="downloads/'+name+'" download>Download</a>';
test('website build uses exactly the valid Companion revision linked by setup',()=>{
  assert.deepEqual(companionCandidate(link('bennys-hub-companion-1.0.6-settings.zip'),'1.0.6'),{
    name:'bennys-hub-companion-1.0.6-settings.zip',artifactVersion:'1.0.6-settings',args:['--revision=settings']
  });
  assert.deepEqual(companionCandidate(link('bennys-hub-companion-1.0.6.zip'),'1.0.6'),{
    name:'bennys-hub-companion-1.0.6.zip',artifactVersion:'1.0.6',args:[]
  });
  for(const name of ['bennys-hub-companion-1.0.5-settings.zip','bennys-hub-companion-1.0.60.zip','bennys-hub-companion-1.0.6-../old.zip','bennys-hub-companion-1.0.6-Settings.zip']){
    assert.throws(()=>companionCandidate(link(name),'1.0.6'));
  }
  assert.throws(()=>companionCandidate('','1.0.6'));
  assert.throws(()=>companionCandidate(link('bennys-hub-companion-1.0.6.zip').repeat(2),'1.0.6'));
});
