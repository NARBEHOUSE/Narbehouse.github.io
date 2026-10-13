const {test}=require('node:test'),assert=require('node:assert/strict');
const modulePromise=import('../extension/journal-store.mjs');
const origin='https://narbehouse.github.io';
const entry=(id='first',answer='Today was good.')=>({id,date:'2026-10-04T15:00:00.000Z',question:'How was your day?',answer});
const draft=(id='draft',answer='Still writing')=>({...entry(id,answer),editingEntryId:null});
async function fixture(options={}){
  const {createJournalStore,JOURNAL_KEY}=await modulePromise;
  const local={};let writes=0,fail=false,clock=1000,uuid=0,delay;
  const storage={
    async get(key){return Object.hasOwn(local,key)?{[key]:structuredClone(local[key])}:{};},
    async set(values){if(delay)await delay;if(fail)throw Error('QUOTA_BYTES');Object.assign(local,structuredClone(values));writes++;}
  };
  const create=()=>createJournalStore(storage,{now:()=>clock,uuid:()=>String(++uuid),...options});
  let store=create();
  return {local,key:JOURNAL_KEY,storage,get writes(){return writes;},set fail(value){fail=value;},set delay(value){delay=value;},
    restart(){store=create();},advance(){clock+=1000;},call:(action,payload={},source=origin)=>store.request(action,payload,source)};
}
const code=value=>error=>error.code===value;

test('Journal migrates legacy numeric IDs once per origin and survives worker restart',async()=>{
  const h=await fixture();
  const migrated=await h.call('JOURNAL_MIGRATE',{entries:[entry(123)]});
  assert.equal(migrated.entries[0].id,'123');assert.equal(migrated.revision,1);assert.equal(migrated.migrated,true);
  h.restart();assert.deepEqual(await h.call('JOURNAL_READ'),{entries:migrated.entries,draft:null,revision:1,lastExportAt:null,exportRevision:null});
  const saved=migrated.entries[0];await h.call('JOURNAL_DELETE',{id:saved.id,expectedUpdatedAt:saved.updatedAt});
  const retried=await h.call('JOURNAL_MIGRATE',{entries:[entry(123)]});
  assert.equal(retried.migrated,false);assert.equal(retried.entries.length,0);
  const status=await h.call('JOURNAL_STATUS');assert.equal(status.migrationComplete,true);assert.equal(status.entryCount,0);assert.equal('entries'in status,false);
});

test('Journal migrates approved website origins into one library without overwriting conflicts',async()=>{
  const h=await fixture();await h.call('JOURNAL_MIGRATE',{entries:[entry()]});
  const result=await h.call('JOURNAL_MIGRATE',{entries:[entry('first','Different text'),entry('duplicate')]},'https://bennyshub.com');
  assert.equal(result.entries.length,2);assert.equal(result.conflicts,1);assert.equal(result.added,1);
  assert.deepEqual(new Set(result.entries.map(item=>item.answer)),new Set(['Today was good.','Different text']));
});

test('Journal migration receipt and data commit together, so a failed write can retry',async()=>{
  const h=await fixture();h.fail=true;await assert.rejects(h.call('JOURNAL_MIGRATE',{entries:[entry()]}),code('STORAGE'));
  assert.deepEqual(h.local,{});h.fail=false;assert.equal((await h.call('JOURNAL_MIGRATE',{entries:[entry()]})).migrated,true);
});

test('Journal concurrent edits serialize with per-entry compare-and-swap',async()=>{
  const h=await fixture();const initial=await h.call('JOURNAL_PUT',{entry:entry(),expectedUpdatedAt:null});
  const version=initial.entries[0].updatedAt;
  const results=await Promise.allSettled([
    h.call('JOURNAL_PUT',{entry:entry('first','One'),expectedUpdatedAt:version}),
    h.call('JOURNAL_PUT',{entry:entry('first','Two'),expectedUpdatedAt:version}),
    h.call('JOURNAL_PUT',{entry:entry('other'),expectedUpdatedAt:null})
  ]);
  assert.deepEqual(results.map(r=>r.status),['fulfilled','rejected','fulfilled']);assert.equal(results[1].reason.code,'CONFLICT');
  const state=await h.call('JOURNAL_READ');assert.equal(state.entries.length,2);assert.equal(state.entries.find(e=>e.id==='first').answer,'One');
});

test('Journal writes acknowledge only after persistence and retry identical requests without duplication',async()=>{
  const h=await fixture();let release,acknowledged=false;h.delay=new Promise(resolve=>{release=resolve;});
  const pending=h.call('JOURNAL_PUT',{entry:entry(),expectedUpdatedAt:null}).then(result=>{acknowledged=true;return result;});
  await new Promise(resolve=>setImmediate(resolve));assert.equal(acknowledged,false);assert.equal(h.writes,0);
  release();await pending;h.delay=null;
  const retry=await h.call('JOURNAL_PUT',{entry:entry(),expectedUpdatedAt:null});assert.equal(retry.entries.length,1);assert.equal(retry.revision,1);assert.equal(h.writes,1);
});

test('Journal failed and oversized writes preserve the entire previous store',async()=>{
  const h=await fixture({maxBytes:1000});await h.call('JOURNAL_PUT',{entry:entry(),expectedUpdatedAt:null});const before=structuredClone(h.local);
  h.fail=true;await assert.rejects(h.call('JOURNAL_PUT',{entry:entry('other'),expectedUpdatedAt:null}),code('STORAGE'));
  assert.deepEqual(h.local,before);h.fail=false;
  await assert.rejects(h.call('JOURNAL_PUT',{entry:entry('other','\u{1F600}'.repeat(300)),expectedUpdatedAt:null}),code('QUOTA'));
  assert.deepEqual(h.local,before);
});

test('Journal drafts persist across restarts, use CAS, and submit with the entry atomically',async()=>{
  const h=await fixture();let result=await h.call('JOURNAL_DRAFT',{draft:draft(),expectedUpdatedAt:null});const oldVersion=result.draft.updatedAt;
  h.restart();assert.equal((await h.call('JOURNAL_READ')).draft.answer,'Still writing');
  result=await h.call('JOURNAL_DRAFT',{draft:draft('draft','More text'),expectedUpdatedAt:oldVersion});
  await assert.rejects(h.call('JOURNAL_DRAFT',{draft:null,expectedUpdatedAt:oldVersion}),code('CONFLICT'));
  await assert.rejects(h.call('JOURNAL_PUT',{entry:entry(),expectedUpdatedAt:null,clearDraft:{id:'draft',expectedUpdatedAt:oldVersion}}),code('CONFLICT'));
  assert.equal((await h.call('JOURNAL_READ')).entries.length,0);
  const payload={entry:entry('first','More text'),expectedUpdatedAt:null,clearDraft:{id:'draft',expectedUpdatedAt:result.draft.updatedAt}};
  result=await h.call('JOURNAL_PUT',payload);assert.equal(result.draft,null);assert.equal(result.entries.length,1);
  assert.equal((await h.call('JOURNAL_PUT',payload)).revision,result.revision);
});

test('Journal delete never drops an unfinished edit and rejects stale deletion',async()=>{
  const h=await fixture();let result=await h.call('JOURNAL_PUT',{entry:entry(),expectedUpdatedAt:null});const old=result.entries[0].updatedAt;
  result=await h.call('JOURNAL_PUT',{entry:entry('first','Updated'),expectedUpdatedAt:old});
  await h.call('JOURNAL_DRAFT',{draft:{...draft(),editingEntryId:'first'},expectedUpdatedAt:null});
  await assert.rejects(h.call('JOURNAL_DELETE',{id:'first',expectedUpdatedAt:old}),code('CONFLICT'));
  const payload={id:'first',expectedUpdatedAt:result.entries[0].updatedAt};result=await h.call('JOURNAL_DELETE',payload);
  assert.equal(result.entries.length,0);assert.equal(result.draft.editingEntryId,'first');assert.equal((await h.call('JOURNAL_DELETE',payload)).revision,result.revision);
});

test('Journal edit drafts retain the original entry version across worker restart and backup restoration',async()=>{
  const h=await fixture();let state=await h.call('JOURNAL_PUT',{entry:entry(),expectedUpdatedAt:null});const originalVersion=state.entries[0].updatedAt;
  await h.call('JOURNAL_DRAFT',{draft:{...draft(),editingEntryId:'first',editingUpdatedAt:originalVersion},expectedUpdatedAt:null});
  await h.call('JOURNAL_PUT',{entry:entry('first','A concurrent edit'),expectedUpdatedAt:originalVersion});h.restart();
  state=await h.call('JOURNAL_READ');assert.equal(state.draft.editingUpdatedAt,originalVersion);
  await assert.rejects(h.call('JOURNAL_PUT',{entry:entry('first',state.draft.answer),expectedUpdatedAt:state.draft.editingUpdatedAt}),code('CONFLICT'));
  const other=await fixture();const restored=await other.call('JOURNAL_RESTORE',{backup:{version:2,app:'journal',entries:state.entries,draft:state.draft}});assert.equal(restored.draft.editingUpdatedAt,originalVersion);
});

test('Journal restores old and new backups, preserves conflicting entries and drafts, and deduplicates retries',async()=>{
  const h=await fixture();await h.call('JOURNAL_PUT',{entry:entry(),expectedUpdatedAt:null});await h.call('JOURNAL_DRAFT',{draft:draft(),expectedUpdatedAt:null});
  const backup={version:2,app:'journal',format:'bennys-hub-journal',entries:[entry('first','Backup text')],draft:draft('backup','Backup draft')};
  const restored=await h.call('JOURNAL_RESTORE',{backup});assert.equal(restored.entries.length,3);assert.equal(restored.conflicts,2);assert.equal(restored.draft.answer,'Still writing');
  const retry=await h.call('JOURNAL_RESTORE',{backup});assert.equal(retry.entries.length,3);assert.equal(retry.revision,restored.revision);
  const old={version:1,app:'journal',data:{'benny-web:v1:journal.entries':[entry(987,'Old exported entry')]}};
  assert.equal((await h.call('JOURNAL_RESTORE',{backup:old})).entries.length,4);
  assert.equal((await h.call('JOURNAL_RESTORE',{backup:{entries:old.data['benny-web:v1:journal.entries']}})).entries.length,4);
});

test('Journal export metadata records exactly the exported revision and does not hide newer edits',async()=>{
  const h=await fixture();const saved=await h.call('JOURNAL_PUT',{entry:entry(),expectedUpdatedAt:null});
  await h.call('JOURNAL_PUT',{entry:entry('second'),expectedUpdatedAt:null});
  const marked=await h.call('JOURNAL_BACKUP_MARK',{revision:saved.revision});assert.equal(marked.exportRevision,1);assert.equal(marked.revision,2);assert.ok(marked.lastExportAt);
  await assert.rejects(h.call('JOURNAL_BACKUP_MARK',{revision:3}),code('INVALID'));
  await h.call('JOURNAL_BACKUP_MARK',{revision:2});h.advance();const older=await h.call('JOURNAL_BACKUP_MARK',{revision:1});assert.equal(older.exportRevision,2);
});

test('Journal explicit clear requires confirmation and current revision and retains migration receipts',async()=>{
  const h=await fixture();let state=await h.call('JOURNAL_MIGRATE',{entries:[entry()]});
  await assert.rejects(h.call('JOURNAL_CLEAR',{revision:state.revision}),code('INVALID'));
  await assert.rejects(h.call('JOURNAL_CLEAR',{revision:0,confirm:true}),code('CONFLICT'));
  state=await h.call('JOURNAL_CLEAR',{revision:state.revision,confirm:true});assert.equal(state.entries.length,0);
  assert.equal((await h.call('JOURNAL_MIGRATE',{entries:[entry()]})).entries.length,0);
});

test('Journal rejects malformed requests and imports without changing the existing store',async()=>{
  const h=await fixture();await h.call('JOURNAL_PUT',{entry:entry(),expectedUpdatedAt:null});const before=structuredClone(h.local);
  const bad=[
    ['JOURNAL_PUT',{entry:entry('bad','x'.repeat(50001)),expectedUpdatedAt:null}],
    ['JOURNAL_PUT',{entry:{...entry(),date:'invalid'},expectedUpdatedAt:0}],
    ['JOURNAL_PUT',{entry:entry()}],['JOURNAL_DRAFT',{draft:null}],
    ['JOURNAL_RESTORE',{backup:{version:3,entries:[]}}],['JOURNAL_RESTORE',{backup:{app:'streaming',entries:[]}}],
    ['JOURNAL_RESTORE',{backup:{entries:[entry('good'),{...entry('bad'),answer:null}]}}],
    ['JOURNAL_RESTORE',{backup:{entries:new Array(10001).fill(entry())}}],
    ['JOURNAL_RESTORE',{backup:{version:1,app:'journal',data:{}}}]
  ];
  for(const [action,payload]of bad){await assert.rejects(h.call(action,payload),code('INVALID'));assert.deepEqual(h.local,before);}
});

test('Journal corrupted persistent data fails closed rather than replacing it with an empty library',async()=>{
  const h=await fixture();h.local[h.key]={schemaVersion:1,entries:[],revision:0};const before=structuredClone(h.local);
  for(const action of ['JOURNAL_READ','JOURNAL_PUT','JOURNAL_CLEAR','JOURNAL_MIGRATE','JOURNAL_RESTORE']){
    await assert.rejects(h.call(action,{entries:[],entry:entry(),expectedUpdatedAt:null,confirm:true,revision:0,backup:{entries:[]}}),code('CORRUPT'));
  }
  assert.deepEqual(h.local,before);assert.equal(h.writes,0);
});

test('Journal route permissions expose status only at Hub and reserve backup/clear for caregiver data settings',async()=>{
  const {authorizeJournal}=await modulePromise;
  const hub=origin+'/bennyshub/',journal=origin+'/bennyshub/apps/tools/journal/index.html',settings=origin+'/bennyshub/data-settings.html';
  assert.doesNotThrow(()=>authorizeJournal('JOURNAL_STATUS',hub,0));
  assert.throws(()=>authorizeJournal('JOURNAL_READ',hub,0),code('FORBIDDEN'));
  assert.doesNotThrow(()=>authorizeJournal('JOURNAL_READ',journal,1));
  for(const action of ['JOURNAL_CLEAR','JOURNAL_BACKUP_MARK','JOURNAL_RESTORE']){
    assert.doesNotThrow(()=>authorizeJournal(action,settings,0));assert.throws(()=>authorizeJournal(action,settings,1),code('FORBIDDEN'));
    assert.throws(()=>authorizeJournal(action,journal,0),code('FORBIDDEN'));
  }
  for(const action of ['JOURNAL_READ','JOURNAL_PUT','JOURNAL_STATUS'])assert.throws(()=>authorizeJournal(action,origin+'/bennyshub/apps/tools/streaming/index.html',1),code('FORBIDDEN'));
});
