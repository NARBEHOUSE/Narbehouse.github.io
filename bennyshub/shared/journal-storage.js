(() => {
  'use strict';
  if (window.BennyJournalStorage) return;
  const keys={entries:'benny-web:v1:journal.entries',draft:'benny-web:v1:journal.draft',pending:'benny-web:v1:journal.pendingDraft',migrated:'benny-web:v1:journal.companionStorage',meta:'benny-web:v1:journal.backupState'};
  const listeners=new Set();
  let current=null,initialized=false,queue=Promise.resolve();
  const clone=value=>JSON.parse(JSON.stringify(value));
  function same(a,b){if(a===b)return true;if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(key=>Object.hasOwn(b,key)&&same(a[key],b[key]));}
  const run=fn=>{const result=queue.catch(()=>{}).then(fn);queue=result;return result;};
  function stored(key,fallback){const raw=localStorage.getItem(key);if(raw===null)return fallback;try{return JSON.parse(raw);}catch{throw Error('Saved Journal data could not be read. Export your data before resetting it.');}}
  function remember(key,value){localStorage.setItem(key,JSON.stringify(value));}
  function notify(value){current=value;for(const callback of listeners){try{callback(clone(value));}catch{}}return clone(value);}
  function validateEntry(value,index=0){
    if(!value||typeof value!=='object'||typeof value.question!=='string'||value.question.length>2000||typeof value.answer!=='string'||value.answer.length>50000||typeof value.date!=='string'||!Number.isFinite(Date.parse(value.date)))throw Error('Invalid journal entry in saved data.');
    const id=String(value.id??('import-'+index+'-'+Date.parse(value.date)));
    if(!id||id.length>200)throw Error('Invalid journal entry ID.');
    return {id,date:new Date(value.date).toISOString(),question:value.question,answer:value.answer,updatedAt:Number.isSafeInteger(value.updatedAt)?value.updatedAt:0};
  }
  function validateEntries(value){if(!Array.isArray(value)||value.length>10000)throw Error('Invalid journal entries.');return value.map(validateEntry);}
  function validateDraft(value){if(value===null||value===undefined)return null;const entry=validateEntry(value);return {...entry,editingEntryId:value.editingEntryId==null?null:String(value.editingEntryId),editingUpdatedAt:Number.isSafeInteger(value.editingUpdatedAt)?value.editingUpdatedAt:null};}
  function browserSnapshot(){
    const meta=stored(keys.meta,{});
    return {mode:'browser',entries:validateEntries(stored(keys.entries,[])),draft:validateDraft(stored(keys.draft,null)),revision:Number.isSafeInteger(meta.revision)?meta.revision:0,lastExportAt:meta.lastExportAt||null,exportRevision:Number.isSafeInteger(meta.exportRevision)?meta.exportRevision:null};
  }
  async function connection(){
    const state=await BennyExtension.check();
    if(state.connected&&state.capabilities.includes('journal-storage-v1'))return 'companion';
    if(stored(keys.migrated,false)||current?.mode==='companion')throw Error('Journal is reconnecting to Companion. Your saved entries are kept.');
    return 'browser';
  }
  async function initialize(){
    if(initialized)return current;
    const mode=await connection();
    if(mode==='companion'){
      const status=await BennyExtension.request('JOURNAL_STATUS');
      let result;
      if(!status.migrationComplete){
        const legacy=browserSnapshot();
        result=await BennyExtension.request('JOURNAL_MIGRATE',{entries:legacy.entries,draft:legacy.draft});
      }else result=await BennyExtension.request('JOURNAL_READ');
      // The original website entries are retained until a deliberate Clear Journal.
      remember(keys.migrated,true);
      current={...result,mode};
    }else current=browserSnapshot();
    initialized=true;
    return current;
  }
  async function readInternal(){
    await initialize();
    if(current.mode==='browser'&&BennyExtension.supports('journal-storage-v1')){initialized=false;await initialize();}
    const value=current.mode==='companion'?{...await BennyExtension.request('JOURNAL_READ'),mode:'companion'}:browserSnapshot();
    const pending=stored(keys.pending,null);
    if(pending)value.pendingWrite=true;
    if(pending?.draft){
      value.recoveryDraft=validateDraft(pending.draft);
      const unchanged=same(value.draft,pending.baseDraft??null);
      value.recoveryConflict=!unchanged&&!draftMatches(value.draft,pending.draft);
    }
    return notify(value);
  }
  function browserWrite(next){
    // A merged restore must remain readable, and another tab may have advanced
    // the freshly read snapshot since this page last published its own state.
    validateEntries(next.entries);
    const oldEntries=localStorage.getItem(keys.entries),oldDraft=localStorage.getItem(keys.draft),oldMeta=localStorage.getItem(keys.meta);
    const value={...next,mode:'browser',revision:Math.max(current?.revision||0,next.revision||0)+1};
    const serialized=JSON.stringify(value);
    if(new TextEncoder().encode(serialized).length>8*1024*1024)throw Error('Journal storage is full. Export a backup in My data before removing entries.');
    try{remember(keys.entries,value.entries);remember(keys.draft,value.draft);remember(keys.meta,{revision:value.revision,lastExportAt:value.lastExportAt,exportRevision:value.exportRevision});}
    catch(error){for(const [key,raw]of [[keys.entries,oldEntries],[keys.draft,oldDraft],[keys.meta,oldMeta]]){try{raw===null?localStorage.removeItem(key):localStorage.setItem(key,raw);}catch{}}throw Error('Journal could not save on this device. Your text is still available; try again.');}
    return notify(value);
  }
  function conflict(){const error=Error('This entry changed in another window. Your text has been kept.');error.code='CONFLICT';return error;}
  async function saveEntryInternal(entry,expectedUpdatedAt,clearDraft){
    await initialize();
    if(current.mode==='companion')return notify({...await BennyExtension.request('JOURNAL_PUT',{entry,expectedUpdatedAt,...(clearDraft?{clearDraft}:{})}),mode:'companion'});
    const state=browserSnapshot(),value=validateEntry(entry),old=state.entries.find(e=>e.id===value.id);
    if(old?old.updatedAt!==expectedUpdatedAt:expectedUpdatedAt!==null)throw conflict();
    if(clearDraft&&state.draft&&(state.draft.id!==clearDraft.id||state.draft.updatedAt!==clearDraft.expectedUpdatedAt))throw conflict();
    value.updatedAt=Math.max(Date.now(),(old?.updatedAt||0)+1);
    return browserWrite({...state,entries:[value,...state.entries.filter(e=>e.id!==value.id)],draft:clearDraft?null:state.draft});
  }
  function draftMatches(a,b){return !!a&&!!b&&a.id===b.id&&a.question===b.question&&a.answer===b.answer&&a.editingEntryId===b.editingEntryId&&a.editingUpdatedAt===b.editingUpdatedAt;}
  const api={
    read:()=>run(readInternal),
    async status(){
      const mode=await connection();
      if(mode==='companion')return {...await BennyExtension.request('JOURNAL_STATUS'),mode};
      const s=browserSnapshot();return {...s,entryCount:s.entries.length,draftPresent:!!s.draft?.answer.trim()};
    },
    saveEntry:(entry,expectedUpdatedAt,clearDraft)=>run(()=>saveEntryInternal(entry,expectedUpdatedAt,clearDraft)),
    deleteEntry:(id,expectedUpdatedAt)=>run(async()=>{
      await initialize();
      if(current.mode==='companion')return notify({...await BennyExtension.request('JOURNAL_DELETE',{id:String(id),expectedUpdatedAt}),mode:'companion'});
      const state=browserSnapshot(),old=state.entries.find(e=>e.id===String(id));
      if(old&&old.updatedAt!==expectedUpdatedAt)throw conflict();
      return browserWrite({...state,entries:state.entries.filter(e=>e.id!==String(id))});
    }),
    saveDraft(draft){
      const value=validateDraft(draft),operationId=crypto.randomUUID();
      // Synchronous recovery copy covers navigation or an extension restart before acknowledgement.
      {const previous=stored(keys.pending,null);remember(keys.pending,{operationId,draft:value,baseDraft:previous?previous.baseDraft:(current?.draft??null)});}
      return run(async()=>{
        await initialize();
        let result;
        if(current.recoveryConflict)throw conflict();
        const baseDraft=current.draft;
        const expectedUpdatedAt=current.draft?.updatedAt??null;
        if(current.draft&&value&&current.draft.id!==value.id)throw conflict();
        if(current.mode==='companion')result=notify({...await BennyExtension.request('JOURNAL_DRAFT',{draft:value,expectedUpdatedAt}),mode:'companion'});
        else {const state=browserSnapshot();if(state.draft?.updatedAt!==current.draft?.updatedAt)throw conflict();result=browserWrite({...state,draft:value?{...value,updatedAt:Math.max(Date.now(),(state.draft?.updatedAt||0)+1)}:null});}
        const latest=stored(keys.pending,null);
        if(latest?.operationId===operationId)localStorage.removeItem(keys.pending);
        else if(latest&&same(latest.baseDraft??null,baseDraft??null))remember(keys.pending,{...latest,baseDraft:result.draft});
        return result;
      });
    },
    forgetRecovery(id){const pending=stored(keys.pending,null);if(!id||pending?.draft?.id===id)localStorage.removeItem(keys.pending);},
    exportBackup:()=>run(async()=>{const snapshot=await readInternal();if(snapshot.pendingWrite&&!((snapshot.draft===null&&snapshot.recoveryDraft==null)||draftMatches(snapshot.draft,snapshot.recoveryDraft)))throw Error('Journal has unsaved text. Reopen Journal to finish saving before exporting.');return {snapshot,backup:{format:'bennys-hub-journal',version:2,app:'journal',exportedAt:new Date().toISOString(),entries:snapshot.entries,draft:snapshot.draft}};}),
    markExport:revision=>run(async()=>{
      await initialize();
      if(current.mode==='companion')return notify({...await BennyExtension.request('JOURNAL_BACKUP_MARK',{revision}),mode:'companion'});
      const s=browserSnapshot();if(!Number.isSafeInteger(revision)||revision>s.revision)throw Error('Invalid backup revision.');
      const next={...s,lastExportAt:new Date().toISOString(),exportRevision:Math.max(s.exportRevision??-1,revision)};
      remember(keys.meta,{revision:next.revision,lastExportAt:next.lastExportAt,exportRevision:next.exportRevision});return notify(next);
    }),
    restore:backup=>run(async()=>{
      await initialize();
      if(current.mode==='companion')return notify({...await BennyExtension.request('JOURNAL_RESTORE',{backup}),mode:'companion'});
      if(!backup||typeof backup!=='object'||(backup.app&&backup.app!=='journal')||(backup.version!==undefined&&![1,2].includes(backup.version)))throw Error('Choose a Journal export.');
      if(new TextEncoder().encode(JSON.stringify(backup)).length>8*1024*1024)throw Error('Choose a Journal export smaller than 8 MB.');
      const restored=validateEntries(backup.data?.[keys.entries]??backup.entries),state=browserSnapshot();
      const signature=e=>JSON.stringify([e.date,e.question,e.answer]),seen=new Set(state.entries.map(signature)),ids=new Set(state.entries.map(e=>e.id));
      for(const entry of restored){if(seen.has(signature(entry)))continue;if(ids.has(entry.id))entry.id=crypto.randomUUID();entry.updatedAt=Date.now();state.entries.push(entry);seen.add(signature(entry));ids.add(entry.id);}
      const draft=validateDraft(backup.draft??null);
      if(draft&&!state.draft)state.draft=draft;
      else if(draft&&draft.answer.trim()&&!draftMatches(state.draft,draft)&&!seen.has(signature(draft)))state.entries.push({...draft,id:crypto.randomUUID(),updatedAt:Date.now()});
      return browserWrite(state);
    }),
    clear:revision=>run(async()=>{
      await initialize();let result;
      if(current.mode==='companion')result={...await BennyExtension.request('JOURNAL_CLEAR',{revision,confirm:true}),mode:'companion'};
      else {const state=browserSnapshot();if(state.revision!==revision)throw conflict();result=browserWrite({...state,entries:[],draft:null});}
      for(const key of [keys.entries,keys.draft,keys.pending])localStorage.removeItem(key);
      return notify(result);
    }),
    subscribe(callback){listeners.add(callback);return()=>listeners.delete(callback);}
  };
  window.BennyJournalStorage=api;
})();
