const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const PB = require('../bennyshub/apps/tools/phraseboard/board-core.js');
const base = path.resolve(__dirname,'../bennyshub/apps/tools/phraseboard');
function storage() { const data = new Map(); return {getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value)}; }
test('all shipped boards remain grid boards and round trip without losing vocabulary',()=>{
  const files = JSON.parse(fs.readFileSync(path.join(base,'boards/index.json'))).files;
  for (const file of files) {
    const rows = PB.parse(fs.readFileSync(path.join(base,'boards',file),'utf8'));
    assert.ok(rows.length>0,file);assert.equal(PB.layout(rows),'grid');
    assert.deepEqual(PB.parse(PB.csv(rows)),rows);
  }
});
test('CSV handles BOM, quotes, commas, Unicode, multiline phrases and mixed layouts',()=>{
  const rows = PB.normalize([{category:'Words',display:'I, “me”',speak:'First line\nSecond "line"',boardLayout:'free',categoryLayout:'grid',group:'Needs',groupOrder:3,scanOrder:8,x:900,width:220,immediate:true},{category:'Music',speak:'https://www.youtube.com/watch?v=abc&list=def',categoryLayout:'free'}]);
  assert.deepEqual(PB.parse('\uFEFF'+PB.csv(rows)),rows);
  assert.equal(rows[0].x,780);assert.equal(PB.layout(rows),'grid');assert.equal(PB.layout(rows.slice(1)),'free');
  assert.throws(()=>PB.parse('Category,Display\nWords,"unfinished'),/unfinished/);
});
test('saves preserve a previous version, reject stale writes, and keep current data after quota failure',()=>{
  const store=storage(),first=PB.normalize([{category:'Words',display:'Old layout'}]);
  const a=PB.save(store,first,null),second=PB.normalize([{...first[0],display:'New layout'}]);
  const b=PB.save(store,second,a.revision);
  assert.equal(PB.parse(PB.read(store,PB.PREVIOUS).csv)[0].display,'Old layout');
  assert.throws(()=>PB.save(store,first,a.revision),/another tab/);
  assert.equal(PB.read(store).revision,b.revision);
  const originalSet=store.setItem;store.setItem=(key,value)=>{if(key===PB.KEY)throw Error('quota');originalSet(key,value);};
  assert.throws(()=>PB.save(store,first,b.revision),/quota/);assert.equal(PB.read(store).revision,b.revision);
  store.setItem=originalSet;PB.restore(store);assert.equal(PB.parse(PB.read(store).csv)[0].display,'Old layout');
});
test('legacy save envelopes migrate, corrupt current saves keep the valid recovery copy',()=>{
  const store=storage();store.setItem(PB.KEY,JSON.stringify({boardName:'Legacy',csv:'Category,Display\nWords,Hello'}));
  const rows=PB.parse(PB.read(store).csv);PB.save(store,rows,null);assert.equal(PB.read(store).version,2);
  const recovery=store.getItem(PB.PREVIOUS);store.setItem(PB.KEY,'{broken');PB.save(store,rows);assert.equal(store.getItem(PB.PREVIOUS),recovery);
});
test('groups and tiles scan by explicit order independently of position, wrap and allow escape',()=>{
  const rows=PB.normalize([{display:'Last',group:'A',groupOrder:2,scanOrder:3,x:0},{display:'First',group:'B',groupOrder:1,scanOrder:1,x:600},{display:'Middle',group:'A',groupOrder:2,scanOrder:1,x:400}]);
  const groups=PB.groups(rows);assert.deepEqual(groups.map(g=>g.name),['B','A']);assert.deepEqual(groups[1].items.map(i=>i.row.display),['Middle','Last']);
  const scan=new PB.GroupScan(groups);scan.move(-1);assert.equal(scan.group,1);scan.move();assert.equal(scan.group,0);
  assert.equal(scan.select(),null);assert.equal(scan.tile,0);assert.equal(scan.select().row.display,'First');assert.equal(scan.tile,-1);
  scan.move();scan.select();scan.move();assert.equal(scan.select().row.display,'Last');scan.select();scan.back();assert.equal(scan.tile,-1);
});
test('predictions produce opt-in continuations from local vocabulary and exclude media',()=>{
  const rows=PB.normalize([{speak:'I want music'},{speak:'I want water'},{speak:'https://example.com/video'}]);
  assert.deepEqual(PB.predictions('',rows),[]);
  assert.deepEqual(PB.predictions('I',rows),['want','want music','want water']);
  assert.deepEqual(PB.predictions('I want',rows),['music','water']);
  assert.deepEqual(PB.predictions('https://example.com',rows),[]);
});
