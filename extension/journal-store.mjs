// Companion owns the Journal library. One atomic storage item and one queue
// keep worker restarts, failed writes, and simultaneous Hub tabs from losing data.
export const JOURNAL_KEY='journalStorageV1';
export const JOURNAL_ACTIONS=Object.freeze(['JOURNAL_STATUS','JOURNAL_READ','JOURNAL_MIGRATE','JOURNAL_PUT','JOURNAL_DELETE','JOURNAL_DRAFT','JOURNAL_RESTORE','JOURNAL_BACKUP_MARK','JOURNAL_CLEAR']);
const MAX_ENTRIES=10000,MAX_BYTES=8*1024*1024;
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const own=(object,key)=>Object.prototype.hasOwnProperty.call(object,key);
function fail(message,code='INVALID'){throw Object.assign(Error(message),{code});}
function text(value,max,label){if(typeof value!=='string'||value.length>max)fail('Invalid journal '+label+'.');return value;}
function id(value){
  if(typeof value==='number'&&Number.isSafeInteger(value))value=String(value);
  if(typeof value!=='string'||!value||value.length>128||/[\u0000-\u001f\u007f]/.test(value))fail('Invalid journal entry ID.');
  return value;
}
function date(value){text(value,64,'date');if(!Number.isFinite(Date.parse(value)))fail('Invalid journal date.');return value;}
function version(value){if(!Number.isSafeInteger(value)||value<0)fail('Invalid journal revision.');return value;}
function expected(value){if(value===null)return null;return version(value);}
function entry(value){
  if(!plain(value))fail('Invalid journal entry.');
  return {id:id(value.id),date:date(value.date),question:text(value.question,2000,'question'),answer:text(value.answer,50000,'answer')};
}
function draft(value){
  if(value===null)return null;
  const result=entry(value);
  result.editingEntryId=value.editingEntryId==null?null:id(value.editingEntryId);
  result.editingUpdatedAt=value.editingUpdatedAt==null?null:version(value.editingUpdatedAt);
  return result;
}
const content=value=>JSON.stringify([value.date,value.question,value.answer]);
const sameEntry=(a,b)=>a&&b&&a.id===b.id&&content(a)===content(b);
const sameDraft=(a,b)=>a===null&&b===null||sameEntry(a,b)&&a.editingEntryId===b.editingEntryId&&(a.editingUpdatedAt??null)===(b.editingUpdatedAt??null);
const clone=value=>structuredClone(value);
function empty(){return {schemaVersion:1,revision:0,clock:0,entries:[],draft:null,migrations:[],lastExportAt:null,exportRevision:null};}
function entries(value){
  if(!Array.isArray(value)||value.length>MAX_ENTRIES)fail('A journal can contain at most '+MAX_ENTRIES+' entries.');
  return value.map(entry);
}
function validateStored(value){
  try{
    if(!plain(value)||value.schemaVersion!==1)fail('Unknown journal format.');
    version(value.revision);version(value.clock);
    const normalized=entries(value.entries),seen=new Set();
    for(let i=0;i<normalized.length;i++){
      if(typeof value.entries[i].id!=='string'||seen.has(normalized[i].id))fail('Duplicate journal IDs.');
      seen.add(normalized[i].id);version(value.entries[i].updatedAt);
      if(value.entries[i].updatedAt>value.clock)fail('Invalid journal clock.');
    }
    draft(value.draft);
    if(value.draft!==null){version(value.draft.updatedAt);if(value.draft.updatedAt>value.clock)fail('Invalid journal clock.');}
    if(!Array.isArray(value.migrations)||value.migrations.length>100||value.migrations.some(origin=>typeof origin!=='string'||origin.length>200)||new Set(value.migrations).size!==value.migrations.length)fail('Invalid migration receipts.');
    if(value.lastExportAt!==null)date(value.lastExportAt);
    if(value.exportRevision!==null){version(value.exportRevision);if(value.exportRevision>value.revision)fail('Invalid export revision.');}
    return value;
  }catch{fail('Companion journal data could not be read safely. Keep the extension installed and restore a separate backup or ask for help. Existing data has not been changed.','CORRUPT');}
}
function snapshot(state){return clone({entries:state.entries,draft:state.draft,revision:state.revision,lastExportAt:state.lastExportAt,exportRevision:state.exportRevision});}
function status(state,origin){return {entryCount:state.entries.length,draftPresent:state.draft!==null,revision:state.revision,lastExportAt:state.lastExportAt,exportRevision:state.exportRevision,migrationComplete:state.migrations.includes(origin)};}
function backup(value){
  if(!plain(value))fail('Choose a valid journal backup.');
  if(value.app!==undefined&&value.app!=='journal')fail('This is not a journal backup.');
  if(value.version!==undefined&&![1,2].includes(value.version))fail('Unsupported journal backup version.');
  let raw=value.entries;
  if(value.version===1&&value.app==='journal'&&plain(value.data))raw=value.data['benny-web:v1:journal.entries'];
  if(raw===undefined)fail('This backup does not contain journal entries.');
  return {entries:entries(raw),draft:own(value,'draft')?draft(value.draft):null};
}

// Called only after the background's extension-ID, approved-origin, and
// same-origin top-frame checks. A random Hub tool cannot read private entries.
export function authorizeJournal(action,url,frameId){
  let pathname;try{pathname=new URL(url).pathname;}catch{fail('Journal access is unavailable.','FORBIDDEN');}
  const journal=/^\/bennyshub\/apps\/tools\/journal\/(?:index\.html)?$/.test(pathname);
  const settings=pathname==='/bennyshub/data-settings.html'&&frameId===0;
  const hub=/^\/bennyshub\/(?:index\.html)?$/.test(pathname)&&frameId===0;
  const allowed=action==='JOURNAL_STATUS'?(journal||settings||hub):
    ['JOURNAL_RESTORE','JOURNAL_BACKUP_MARK','JOURNAL_CLEAR'].includes(action)?settings:
    ['JOURNAL_READ','JOURNAL_MIGRATE'].includes(action)?journal||settings:
    ['JOURNAL_PUT','JOURNAL_DELETE','JOURNAL_DRAFT'].includes(action)?journal:false;
  if(!allowed)fail('This page cannot access Companion journal data.','FORBIDDEN');
}

export function createJournalStore(storage,{now=()=>Date.now(),uuid=()=>crypto.randomUUID(),maxBytes=MAX_BYTES}={}){
  let queue=Promise.resolve();
  async function load(){const result=await storage.get(JOURNAL_KEY);return own(result,JOURNAL_KEY)?validateStored(clone(result[JOURNAL_KEY])):empty();}
  async function persist(state){
    if(state.entries.length>MAX_ENTRIES)fail('Journal storage is full. Back up entries in Companion & data before removing any.','QUOTA');
    if(new TextEncoder().encode(JSON.stringify(state)).length>maxBytes)fail('Journal storage is full. Back up entries in Companion & data before removing any.','QUOTA');
    try{await storage.set({[JOURNAL_KEY]:state});}catch{fail('Companion could not save the journal. Keep this page open and retry. If storage is full, back up entries in Companion & data first.','STORAGE');}
  }
  function tick(state){state.clock=Math.max(Math.floor(now()),state.clock+1);return state.clock;}
  function conflict(){fail('The journal changed in another window. Your text has not been overwritten. Reload the latest entries before trying again.','CONFLICT');}
  function merge(state,incoming,incomingDraft){
    let added=0,conflicts=0;
    const known=new Set(state.entries.map(content)),ids=new Set(state.entries.map(item=>item.id));
    for(const item of incoming){
      if(known.has(content(item)))continue;
      let nextId=item.id;
      if(ids.has(nextId)){do{nextId='restored-'+uuid();}while(ids.has(nextId));conflicts++;}
      state.entries.push({...item,id:nextId,updatedAt:tick(state)});known.add(content(item));ids.add(nextId);added++;
    }
    if(incomingDraft!==null&&!sameDraft(state.draft,incomingDraft)){
      if(state.draft===null)state.draft={...incomingDraft,updatedAt:tick(state)};
      else if(!known.has(content(incomingDraft))){
        let nextId;do{nextId='restored-draft-'+uuid();}while(ids.has(nextId));
        state.entries.push({...entry(incomingDraft),id:nextId,updatedAt:tick(state)});added++;conflicts++;
      }
    }
    state.entries.sort((a,b)=>Date.parse(b.date)-Date.parse(a.date));
    return {added,conflicts};
  }
  async function perform(action,payload,origin){
    if(!JOURNAL_ACTIONS.includes(action))fail('Unsupported journal action.');
    if(!plain(payload))fail('Invalid journal request.');
    if(typeof origin!=='string'||origin.length>200)fail('Invalid journal origin.');
    const state=await load();
    if(action==='JOURNAL_STATUS')return status(state,origin);
    if(action==='JOURNAL_READ')return snapshot(state);
    let changed=false,details={};
    if(action==='JOURNAL_MIGRATE'){
      if(state.migrations.includes(origin))return {...snapshot(state),migrated:false,added:0,conflicts:0};
      const incoming=entries(payload.entries),incomingDraft=own(payload,'draft')?draft(payload.draft):null;
      details={...merge(state,incoming,incomingDraft),migrated:true};state.migrations.push(origin);changed=true;
    }else if(action==='JOURNAL_PUT'){
      const incoming=entry(payload.entry),expectedAt=expected(payload.expectedUpdatedAt);
      const current=state.entries.find(item=>item.id===incoming.id);
      const unchanged=sameEntry(current,incoming);
      // A retry of a committed PUT is safe, including its already-cleared draft.
      let clear=false;
      if(payload.clearDraft!==undefined){
        if(!plain(payload.clearDraft))fail('Invalid journal draft request.');
        const clearId=id(payload.clearDraft.id),clearAt=version(payload.clearDraft.expectedUpdatedAt);
        if(state.draft?.id===clearId&&state.draft.updatedAt===clearAt)clear=true;
        else if(!(unchanged&&state.draft===null))conflict();
      }
      if(!unchanged){
        if((current?.updatedAt??null)!==expectedAt)conflict();
        const saved={...incoming,updatedAt:tick(state)};
        if(current)state.entries[state.entries.indexOf(current)]=saved;else state.entries.unshift(saved);
        changed=true;
      }
      if(clear){state.draft=null;changed=true;}
    }else if(action==='JOURNAL_DELETE'){
      const deleteId=id(payload.id),expectedAt=version(payload.expectedUpdatedAt),index=state.entries.findIndex(item=>item.id===deleteId);
      if(index!==-1){if(state.entries[index].updatedAt!==expectedAt)conflict();state.entries.splice(index,1);changed=true;}
    }else if(action==='JOURNAL_DRAFT'){
      const incoming=draft(payload.draft),expectedAt=expected(payload.expectedUpdatedAt);
      if(!sameDraft(state.draft,incoming)){
        if((state.draft?.updatedAt??null)!==expectedAt)conflict();
        state.draft=incoming===null?null:{...incoming,updatedAt:tick(state)};changed=true;
      }
    }else if(action==='JOURNAL_RESTORE'){
      const incoming=backup(payload.backup),before=JSON.stringify([state.entries,state.draft]);
      details=merge(state,incoming.entries,incoming.draft);changed=before!==JSON.stringify([state.entries,state.draft]);
    }else if(action==='JOURNAL_BACKUP_MARK'){
      const exported=version(payload.revision);if(exported>state.revision)fail('Invalid backup revision.');
      if(state.exportRevision===null||exported>=state.exportRevision){
        state.exportRevision=exported;state.lastExportAt=new Date(now()).toISOString();await persist(state);
      }
      return snapshot(state);
    }else if(action==='JOURNAL_CLEAR'){
      if(payload.confirm!==true)fail('Confirm before clearing the Companion journal.');
      if(version(payload.revision)!==state.revision)conflict();
      if(state.entries.length||state.draft!==null){state.entries=[];state.draft=null;changed=true;}
    }
    if(changed){state.revision++;await persist(state);}
    return {...snapshot(state),...details};
  }
  return Object.freeze({request(action,payload={},origin){const task=queue.catch(()=>{}).then(()=>perform(action,payload,origin));queue=task;return task;}});
}
