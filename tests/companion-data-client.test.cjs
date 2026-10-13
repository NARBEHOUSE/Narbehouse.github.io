const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),origin='https://narbehouse.github.io';
const clone=value=>JSON.parse(JSON.stringify(value));
const sampleEntry=(id='entry',answer='Today was good')=>({id,date:'2026-10-04T15:00:00.000Z',question:'How was today?',answer});
const sampleDraft=(answer='Draft text')=>({...sampleEntry('draft',answer),editingEntryId:null});
const keys={entries:'benny-web:v1:journal.entries',draft:'benny-web:v1:journal.draft',pending:'benny-web:v1:journal.pendingDraft'};
const flush=()=>new Promise(resolve=>setImmediate(resolve));

async function backend(){
  const [{createJournalStore},{createAppDataStore}]=await Promise.all([import('../extension/journal-store.mjs'),import('../extension/app-data-store.mjs')]);
  const data={},storage={async get(key){return Object.hasOwn(data,key)?{[key]:clone(data[key])}:{};},async set(values){Object.assign(data,clone(values));}};
  const journal=createJournalStore(storage),apps=createAppDataStore(storage);
  return {data,journal,apps,request:(action,payload={})=>(action.startsWith('JOURNAL_')?journal:apps).request(action,clone(payload),origin)};
}
function client(remote,{local=new Map(),capabilities=['journal','journal-storage-v1','app-storage-v1'],intercept}={}){
  const calls=[],events=[];let currentCapabilities=capabilities;
  const context=vm.createContext({console,TextEncoder,URL,crypto,Date,Promise,structuredClone,
    localStorage:{getItem:key=>local.has(key)?local.get(key):null,setItem:(key,value)=>local.set(key,String(value)),removeItem:key=>local.delete(key)},
    document:{dispatchEvent:event=>events.push(event)},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail;}},
    BennyExtension:{async check(){return {connected:currentCapabilities!==null,version:'1.0.8',capabilities:currentCapabilities||[]};},supports:cap=>currentCapabilities?.includes(cap),
      async request(action,payload={}){calls.push({action,payload:clone(payload)});const go=()=>remote.request(action,payload);return intercept?intercept(action,payload,go):go();}}
  });
  context.window=context;
  for(const file of ['data-backup.js','journal-storage.js','app-storage.js'])vm.runInContext(fs.readFileSync(path.join(root,'bennyshub/shared',file),'utf8'),context,{filename:file});
  return {local,calls,events,journal:context.BennyJournalStorage,apps:context.BennyAppStorage,parseBackup:value=>vm.runInContext('JSON.parse('+JSON.stringify(JSON.stringify(value))+')',context),capabilities(value){currentCapabilities=value;}};
}

test('Journal client migrates once and retrieves Companion entries after website data is cleared',async()=>{
  const remote=await backend(),local=new Map([[keys.entries,JSON.stringify([sampleEntry(123)])]]),first=client(remote,{local});
  const migrated=await first.journal.read();assert.equal(migrated.mode,'companion');assert.equal(migrated.entries[0].id,'123');
  local.clear();const second=client(remote,{local}),recovered=await second.journal.read();assert.equal(recovered.entries[0].answer,'Today was good');
  assert.equal(second.calls.some(call=>call.action==='JOURNAL_MIGRATE'),false);
  const saved=recovered.entries[0];await second.journal.deleteEntry(saved.id,saved.updatedAt);
  local.set(keys.entries,JSON.stringify([sampleEntry(123)]));const third=client(remote,{local});assert.equal((await third.journal.read()).entries.length,0);
});

test('Journal client supports older same-version Companion without claiming extension storage',async()=>{
  const remote=await backend(),local=new Map([[keys.entries,JSON.stringify([sampleEntry()])]]),h=client(remote,{local,capabilities:['journal']});
  assert.equal((await h.journal.read()).mode,'browser');assert.equal(h.calls.length,0);
  const saved=await h.journal.saveEntry(sampleEntry('second','Another entry'),null);assert.equal(saved.entries.length,2);assert.equal(saved.mode,'browser');assert.equal(h.calls.length,0);
  h.capabilities(['journal','journal-storage-v1']);assert.equal((await h.journal.read()).mode,'companion');assert.equal((await remote.request('JOURNAL_READ')).entries.length,2);
  h.capabilities(['journal']);await assert.rejects(h.journal.status(),/reconnecting/);
});

test('Journal client refuses malformed browser data instead of migrating an empty replacement',async()=>{
  const remote=await backend(),local=new Map([[keys.entries,'{broken json']]),h=client(remote,{local});
  await assert.rejects(h.journal.read(),/could not be read/);assert.equal(h.calls.some(call=>call.action==='JOURNAL_MIGRATE'),false);assert.equal(local.get(keys.entries),'{broken json');
});

test('Journal client keeps a synchronous draft recovery copy until Companion acknowledges it',async()=>{
  const remote=await backend();let release,entered;const enteredPromise=new Promise(resolve=>{entered=resolve;});
  const h=client(remote,{intercept:async(action,payload,go)=>{if(action==='JOURNAL_DRAFT'){entered();await new Promise(resolve=>{release=resolve;});}return go();}});
  await h.journal.read();const pending=h.journal.saveDraft(sampleDraft());assert.equal(JSON.parse(h.local.get(keys.pending)).draft.answer,'Draft text');
  await enteredPromise;assert.equal((await remote.request('JOURNAL_READ')).draft,null);release();const result=await pending;
  assert.equal(result.draft.answer,'Draft text');assert.equal(h.local.has(keys.pending),false);
  const restarted=client(remote,{local:h.local}),resumed=await restarted.journal.read();assert.equal(resumed.draft.answer,'Draft text');
  await restarted.journal.saveEntry(sampleEntry('saved','Draft text'),null,{id:resumed.draft.id,expectedUpdatedAt:resumed.draft.updatedAt});
  const final=await remote.request('JOURNAL_READ');assert.equal(final.draft,null);assert.equal(final.entries.length,1);
});

test('Journal client failed draft writes retain text for recovery and cannot claim a completed backup',async()=>{
  const remote=await backend(),h=client(remote,{intercept:async(action,payload,go)=>{if(action==='JOURNAL_DRAFT')throw Error('Extension restarting');return go();}});
  await h.journal.read();await assert.rejects(h.journal.saveDraft(sampleDraft()),/restarting/);assert.ok(h.local.has(keys.pending));
  const state=await h.journal.read();assert.equal(state.recoveryDraft.answer,'Draft text');assert.equal(state.draft,null);
  await assert.rejects(h.journal.exportBackup(),/unsaved text/);
});

test('Journal draft clearing replaces an older in-flight recovery marker and waits for durable acknowledgement',async()=>{
  const remote=await backend();let entered,release,first=true;
  const enteredPromise=new Promise(resolve=>{entered=resolve;});
  const h=client(remote,{intercept:async(action,payload,go)=>{if(action==='JOURNAL_DRAFT'&&first){first=false;entered();await new Promise(resolve=>{release=resolve;});}return go();}});
  await h.journal.read();const saving=h.journal.saveDraft(sampleDraft());await enteredPromise;
  const clearing=h.journal.saveDraft(null);assert.equal(JSON.parse(h.local.get(keys.pending)).draft,null);
  release();await saving;await clearing;assert.equal(h.local.has(keys.pending),false);assert.equal((await remote.request('JOURNAL_READ')).draft,null);
});

test('Journal successful draft clear removes stale recovery text left by an earlier failed write',async()=>{
  const remote=await backend();let fail=true;
  const h=client(remote,{intercept:async(action,payload,go)=>{if(action==='JOURNAL_DRAFT'&&fail)throw Error('Extension restarting');return go();}});
  await h.journal.read();await assert.rejects(h.journal.saveDraft(sampleDraft()),/restarting/);assert.ok(h.local.has(keys.pending));
  fail=false;await h.journal.saveDraft(null);assert.equal(h.local.has(keys.pending),false);
  const restarted=client(remote,{local:h.local}),state=await restarted.journal.read();assert.equal(state.draft,null);assert.equal(state.recoveryDraft,undefined);
});

test('Journal recovered pending text cannot silently overwrite a draft changed in another window',async()=>{
  const remote=await backend();await remote.request('JOURNAL_MIGRATE',{entries:[],draft:sampleDraft('Original')});
  const h=client(remote,{intercept:async(action,payload,go)=>{if(action==='JOURNAL_DRAFT')throw Error('Extension restarting');return go();}});
  const original=await h.journal.read();await assert.rejects(h.journal.saveDraft({...original.draft,answer:'Unsaved on this device'}));
  await remote.request('JOURNAL_DRAFT',{draft:{...original.draft,answer:'New text from another window'},expectedUpdatedAt:original.draft.updatedAt});
  const restarted=client(remote,{local:h.local}),recovered=await restarted.journal.read();
  // Conflict recovery may reject a save or preserve a separate copy, but the
  // other window's text must remain recoverable rather than being overwritten.
  try{await restarted.journal.saveDraft({...recovered.recoveryDraft,answer:'Unsaved on this device plus more'});}catch{}
  const result=await remote.request('JOURNAL_READ');assert.ok(result.draft?.answer==='New text from another window'||result.entries.some(entry=>entry.answer==='New text from another window'));
});

test('App client restores Companion data after website clearing and uses browser mode for old capabilities',async()=>{
  const remote=await backend(),local=new Map([['kb_settings',JSON.stringify({theme:'dark'})]]),h=client(remote,{local,capabilities:['journal']});
  assert.equal((await h.apps.ready('keyboard')).mode,'browser');assert.equal(h.calls.length,0);
  h.capabilities(['app-storage-v1']);assert.equal((await h.apps.read('keyboard')).mode,'companion');
  // read after a browser-mode start must migrate the existing browser library.
  assert.equal((await remote.request('APP_DATA_READ',{app:'keyboard'})).data.kb_settings.theme,'dark');
  local.clear();const restarted=client(remote,{local});assert.equal((await restarted.apps.ready('keyboard')).values.kb_settings.theme,'dark');
  assert.equal(JSON.parse(local.get('kb_settings')).theme,'dark');
});

test('App client preserves malformed local values and does not create a default Companion replacement',async()=>{
  const remote=await backend(),local=new Map([['kb_settings','not json']]),h=client(remote,{local});
  await assert.rejects(h.apps.ready('keyboard'),/could not be read/);
  assert.equal(h.calls.some(call=>['APP_DATA_WRITE','APP_DATA_MIGRATE','APP_DATA_RESTORE','APP_DATA_CLEAR'].includes(call.action)),false);
  assert.equal(local.get('kb_settings'),'not json');assert.deepEqual(remote.data,{});
});

test('App client restores a healthy migrated Companion library over a corrupted browser working copy',async()=>{
  const remote=await backend();await remote.request('APP_DATA_MIGRATE',{app:'keyboard',data:{kb_settings:{theme:'dark'}}});
  const local=new Map([['kb_settings','not json']]),h=client(remote,{local});
  const state=await h.apps.ready('keyboard');assert.equal(state.mode,'companion');assert.equal(state.values.kb_settings.theme,'dark');
  assert.equal(JSON.parse(local.get('kb_settings')).theme,'dark');assert.equal(h.calls.some(call=>call.action==='APP_DATA_MIGRATE'),false);
});

test('App client replays pending edits after restart without overwriting unrelated remote values',async()=>{
  const remote=await backend(),local=new Map([['kb_settings',JSON.stringify({theme:'dark'})]]);
  let offline=false;const h=client(remote,{local,intercept:async(action,payload,go)=>{if(offline&&action==='APP_DATA_WRITE')throw Error('Extension restarting');return go();}});
  await h.apps.ready('keyboard');offline=true;h.apps.setItem('keyboard','kb_settings',JSON.stringify({theme:'light'}));await assert.rejects(h.apps.flush('keyboard'),/restarting/);
  assert.ok(local.has('benny-web:v1:companion.pending.keyboard'));
  const remoteState=await remote.request('APP_DATA_READ',{app:'keyboard'});
  await remote.request('APP_DATA_WRITE',{app:'keyboard',patch:{userKeyboardData:{frequent_words:{},bigrams:{},trigrams:{}}},expectedRevision:remoteState.revision});
  const restarted=client(remote,{local});const state=await restarted.apps.ready('keyboard');assert.equal(state.mode,'companion');assert.equal(state.values.kb_settings.theme,'light');assert.ok(state.values.userKeyboardData);assert.equal(local.has('benny-web:v1:companion.pending.keyboard'),false);
});

test('App client handles a second rapid edit while its first write is in flight',async()=>{
  const remote=await backend(),local=new Map([['kb_settings',JSON.stringify({theme:'dark'})]]);let entered,release,first=true;
  const enteredPromise=new Promise(resolve=>{entered=resolve;});
  const h=client(remote,{local,intercept:async(action,payload,go)=>{if(action==='APP_DATA_WRITE'&&first){first=false;entered();await new Promise(resolve=>{release=resolve;});}return go();}});
  await h.apps.ready('keyboard');h.apps.setItem('keyboard','kb_settings',JSON.stringify({theme:'light'}));await enteredPromise;
  h.apps.setItem('keyboard','kb_settings',JSON.stringify({theme:'green'}));release();await h.apps.flush('keyboard');await flush();
  const final=await remote.request('APP_DATA_READ',{app:'keyboard'});assert.equal(final.data.kb_settings.theme,'green');assert.equal(local.has('benny-web:v1:companion.pending.keyboard'),false);
});

test('App refresh cannot replace a newer local edit with its earlier pending-write acknowledgement',async()=>{
  const remote=await backend(),local=new Map([['kb_settings',JSON.stringify({theme:'dark'})]]);let entered,release;
  const enteredPromise=new Promise(resolve=>{entered=resolve;});let first=true;
  const h=client(remote,{local,intercept:async(action,payload,go)=>{if(action==='APP_DATA_WRITE'&&first){first=false;entered();await new Promise(resolve=>{release=resolve;});}return go();}});
  await h.apps.ready('keyboard');local.set('kb_settings',JSON.stringify({theme:'light'}));
  local.set('benny-web:v1:companion.pending.keyboard',JSON.stringify({base:{kb_settings:{theme:'dark'}},patch:{kb_settings:{theme:'light'}}}));
  const reading=h.apps.read('keyboard');await enteredPromise;h.apps.setItem('keyboard','kb_settings',JSON.stringify({theme:'green'}));release();await reading;await h.apps.flush('keyboard');
  assert.equal(JSON.parse(local.get('kb_settings')).theme,'green');assert.equal((await remote.request('APP_DATA_READ',{app:'keyboard'})).data.kb_settings.theme,'green');
});

test('App migration archives remain available in a backup when Companion temporarily disconnects',async()=>{
  const remote=await backend();await remote.apps.request('APP_DATA_MIGRATE',{app:'keyboard',data:{kb_settings:{theme:'dark'}}},origin);
  await remote.apps.request('APP_DATA_MIGRATE',{app:'keyboard',data:{kb_settings:{theme:'light'}}},'https://bennyshub.com');
  const h=client(remote);assert.equal((await h.apps.ready('keyboard')).migrationArchives.length,1);h.capabilities(null);
  const exported=await h.apps.exportBackup('keyboard');assert.equal(exported.backup.version,2);assert.equal(exported.backup.migrationArchives.length,1);assert.equal(exported.backup.migrationArchives[0].data.kb_settings.theme,'light');
});

test('offline restore refuses recovery archives without changing existing values, pending edits or cached archives',async()=>{
  const remote=await backend();await remote.apps.request('APP_DATA_MIGRATE',{app:'keyboard',data:{kb_settings:{theme:'dark'}}},origin);
  await remote.apps.request('APP_DATA_MIGRATE',{app:'keyboard',data:{kb_settings:{theme:'green'}}},'https://bennyshub.com');
  const h=client(remote);await h.apps.ready('keyboard');h.capabilities(null);await h.apps.read('keyboard');
  h.apps.setItem('keyboard','kb_settings',JSON.stringify({theme:'blue'}));await h.apps.flush('keyboard');
  const state=await h.apps.read('keyboard'),before=[...h.local],remoteBefore=clone(remote.data);
  const backup=h.parseBackup({version:2,app:'keyboard',data:{kb_settings:{theme:'purple'}},migrationArchives:[{origin:'https://backup.example',data:{kb_settings:{theme:'light'}}}]});
  await assert.rejects(h.apps.restore(backup,state.revision),/Reconnect the latest Companion.*Nothing has been changed/);
  assert.deepEqual([...h.local],before);assert.deepEqual(remote.data,remoteBefore);
  h.capabilities(['app-storage-v1']);const connected=await h.apps.read('keyboard');
  const result=await h.apps.restore(backup,connected.revision);assert.equal(result.mode,'companion');assert.equal(result.values.kb_settings.theme,'purple');
  const exported=await h.apps.exportBackup('keyboard');assert.equal(exported.backup.migrationArchives.length,2);assert.ok(exported.backup.migrationArchives.some(row=>row.origin==='https://backup.example'&&row.data.kb_settings.theme==='light'));
});

test('ordinary version 1 and version 2 app backups without recovery archives still restore offline',async()=>{
  for(const version of [1,2]){
    const h=client(await backend(),{capabilities:null,local:new Map([['kb_settings',JSON.stringify({theme:'dark'})]])});
    const before=await h.apps.ready('keyboard');
    const backup=h.parseBackup({version,app:'keyboard',data:{kb_settings:{theme:'light'}},...(version===2?{migrationArchives:[]}:{} )});
    const restored=await h.apps.restore(backup,before.revision);assert.equal(restored.mode,'browser');assert.equal(restored.values.kb_settings.theme,'light');assert.equal(JSON.parse(h.local.get('kb_settings')).theme,'light');assert.equal(h.calls.length,0);
  }
});

test('Journal browser fallback rejects a stale clear after another tab saves a new entry',async()=>{
  const remote=await backend(),local=new Map(),first=client(remote,{local,capabilities:['journal']}),second=client(remote,{local,capabilities:['journal']});
  await first.journal.read();await second.journal.read();
  const original=await first.journal.saveEntry(sampleEntry('original','Keep the original entry'),null);
  const clearRevision=original.revision;
  const changed=await second.journal.saveEntry(sampleEntry('new','Written while clear confirmation was open'),null);
  assert.ok(changed.revision>clearRevision);
  await assert.rejects(first.journal.clear(clearRevision),/changed in another window/);
  const kept=await first.journal.read();assert.equal(kept.entries.length,2);assert.ok(kept.entries.some(row=>row.id==='new'));assert.equal(first.calls.length+second.calls.length,0);
});

test('Journal browser fallback refuses a merged restore beyond its readable entry limit without changing saved data',async()=>{
  const entries=Array.from({length:10000},(_,index)=>sampleEntry('entry-'+index,'Original entry '+index));
  const local=new Map([[keys.entries,JSON.stringify(entries)]]),h=client(await backend(),{local,capabilities:['journal']});
  await h.journal.read();const before=[...local];
  await assert.rejects(h.journal.restore({version:2,app:'journal',entries:[sampleEntry('extra','One more entry')],draft:null}),/Invalid journal entries/);
  assert.deepEqual([...local],before);assert.equal((await h.journal.read()).entries.length,10000);
});
