import * as backupModule from './shared/data-backup.js';

const backup=globalThis.BennyBackup||backupModule.default;
export const APP_DATA_ACTIONS=Object.freeze(['APP_DATA_STATUS','APP_DATA_READ','APP_DATA_MIGRATE','APP_DATA_WRITE','APP_DATA_RESTORE','APP_DATA_CLEAR']);
export const APP_DATA_APPS=Object.freeze(['keyboard','streaming','dayhub']);
const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const clone=value=>structuredClone(value);
// Chrome storage may return object keys in a different order. Compare JSON
// values structurally so an unchanged library is not treated as a conflict.
function equal(a,b){
  if(a===b)return true;
  if(a===null||b===null||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
  const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(key=>own(b,key)&&equal(a[key],b[key]));
}
const storageKey=app=>'appStorageV1:'+app;
function fail(message,code='INVALID'){throw Object.assign(Error(message),{code});}
function appName(app){if(!APP_DATA_APPS.includes(app))fail('Unsupported Companion app storage.');return app;}
function revision(value){if(!Number.isSafeInteger(value)||value<0)fail('Invalid saved-data revision.');return value;}
function validated(app,data,migrationArchives=[]){
  try{return backup.validate({version:2,app,data,migrationArchives},app);}catch(error){fail(error.message||'Invalid saved app data.');}
}
function envelope(state){return clone({app:state.app,data:state.data,revision:state.revision,migrationArchives:state.migrationArchives});}
function metadata(state,origin){return {app:state.app,revision:state.revision,keyCount:Object.keys(state.data).length,migrationComplete:state.migrations.includes(origin),migrationConflictCount:state.migrationArchives.reduce((count,row)=>count+Object.keys(row.data).length,0)};}
function empty(app){return {schemaVersion:1,app,revision:0,data:{},migrations:[],migrationArchives:[]};}

// The caller first authenticates the extension sender and approved same-origin
// Hub top frame. Each app can then access only its own allowlisted data keys.
export function authorizeAppData(action,url,frameId,app){
  appName(app);
  let pathname;try{pathname=new URL(url).pathname;}catch{fail('Saved app data is unavailable.','FORBIDDEN');}
  const settings=pathname==='/bennyshub/data-settings.html'&&frameId===0;
  const hub=/^\/bennyshub\/(?:index\.html)?$/.test(pathname)&&frameId===0;
  const allowedApp=new RegExp('^/bennyshub/apps/tools/'+app+'/(?:index\\.html'+(app==='streaming'?'|editor\\.html':'')+')?$').test(pathname);
  const allowed=['APP_DATA_RESTORE','APP_DATA_CLEAR'].includes(action)?settings:
    action==='APP_DATA_STATUS'?(settings||hub||allowedApp):
    ['APP_DATA_READ','APP_DATA_MIGRATE'].includes(action)?settings||allowedApp:
    action==='APP_DATA_WRITE'?settings||allowedApp:false;
  if(!allowed)fail('This page cannot access that app\u2019s Companion data.','FORBIDDEN');
}

export function createAppDataStore(storage){
  let queue=Promise.resolve();
  function enqueue(fn){const task=queue.catch(()=>{}).then(fn);queue=task;return task;}
  async function load(app){
    const key=storageKey(app),stored=await storage.get(key);
    if(!own(stored,key))return empty(app);
    try{
      const state=clone(stored[key]);
      if(!plain(state)||state.schemaVersion!==1||state.app!==app)throw Error('Invalid saved format');
      revision(state.revision);
      if(!Array.isArray(state.migrations)||state.migrations.length>100||new Set(state.migrations).size!==state.migrations.length||state.migrations.some(origin=>typeof origin!=='string'||origin.length>200))throw Error('Invalid migration receipts');
      validated(app,state.data,state.migrationArchives);
      return state;
    }catch{fail('Companion saved app data could not be read safely. Existing data has not been changed. Keep the extension installed and ask for help.','CORRUPT');}
  }
  async function persist(state){
    validated(state.app,state.data,state.migrationArchives);
    if(new TextEncoder().encode(JSON.stringify(state)).length>8*1024*1024)fail('Companion storage is full. Back up saved data in Companion & data before removing any.','QUOTA');
    try{await storage.set({[storageKey(state.app)]:state});}
    catch{fail('Companion could not save app data. Keep this page open and retry. If storage is full, back up your data first.','STORAGE');}
  }
  function conflict(){fail('This app\u2019s saved data changed in another window. Reload the latest data before trying again.','CONFLICT');}
  function addArchive(state,archive){
    if(!Object.keys(archive.data).length)return;
    if(!state.migrationArchives.some(row=>row.origin===archive.origin&&equal(row.data,archive.data)))state.migrationArchives.push(clone(archive));
  }
  async function perform(action,payload,origin){
    if(!APP_DATA_ACTIONS.includes(action)||!plain(payload))fail('Invalid saved app data request.');
    const app=appName(action==='APP_DATA_RESTORE'?payload.backup?.app:payload.app);
    if(typeof origin!=='string'||origin.length>200)fail('Invalid app data origin.');
    const state=await load(app);
    if(action==='APP_DATA_STATUS')return metadata(state,origin);
    if(action==='APP_DATA_READ')return envelope(state);
    let changed=false,details={};
    if(action==='APP_DATA_MIGRATE'){
      if(state.migrations.includes(origin))return {...envelope(state),migrated:false,migrationConflicts:0};
      const incoming=validated(app,payload.data).values,conflicts={};
      for(const [key,value]of Object.entries(incoming)){
        if(!own(state.data,key))state.data[key]=value;
        else if(!equal(state.data[key],value))Object.defineProperty(conflicts,key,{value,enumerable:true,writable:true,configurable:true});
      }
      addArchive(state,{origin,data:conflicts});state.migrations.push(origin);changed=true;
      details={migrated:true,migrationConflicts:Object.keys(conflicts).length};
    }else if(action==='APP_DATA_WRITE'){
      const expected=revision(payload.expectedRevision);
      if(!plain(payload.patch))fail('Invalid app data patch.');
      const next={...state.data},incoming={},removed=[];
      for(const [key,value]of Object.entries(payload.patch)){
        if(value===null)removed.push(key);
        else Object.defineProperty(incoming,key,{value,enumerable:true,writable:true,configurable:true});
      }
      // Deletion keys are validated too; a null must never broaden the key scope.
      const allowed=app==='keyboard'?['userKeyboardData','kb_settings']:app==='dayhub'?['dayhub_weather_web_v2']:
        ['catalog','episodes','genres','lastWatched','activePlayback','searchHistory','settings'].map(key=>'benny-web:v1:streaming.'+key);
      if(removed.some(key=>!allowed.includes(key)))fail('Unsupported app data key.');
      const clean=validated(app,incoming).values;
      for(const key of removed)delete next[key];
      for(const [key,value]of Object.entries(clean))Object.defineProperty(next,key,{value,enumerable:true,writable:true,configurable:true});
      if(!equal(next,state.data)){if(expected!==state.revision)conflict();state.data=next;changed=true;}
    }else if(action==='APP_DATA_RESTORE'){
      let incoming;try{incoming=backup.validate(payload.backup,app);}catch(error){fail(error.message||'Invalid app backup.');}
      if(revision(payload.expectedRevision)!==state.revision)conflict();
      const before=JSON.stringify([state.data,state.migrationArchives]);
      // Caregiver confirms replacement of only the keys contained in the backup.
      for(const [key,value]of Object.entries(incoming.values))Object.defineProperty(state.data,key,{value,enumerable:true,writable:true,configurable:true});
      for(const archive of incoming.migrationArchives||[])addArchive(state,archive);
      changed=before!==JSON.stringify([state.data,state.migrationArchives]);
    }else if(action==='APP_DATA_CLEAR'){
      if(payload.confirm!==true)fail('Confirm before clearing saved app data.');
      if(revision(payload.revision)!==state.revision)conflict();
      if(Object.keys(state.data).length||state.migrationArchives.length){state.data={};state.migrationArchives=[];changed=true;}
    }
    if(changed){state.revision++;await persist(state);}
    return {...envelope(state),...details};
  }
  return Object.freeze({
    request:(action,payload,origin)=>enqueue(()=>perform(action,payload,origin)),
    // Privileged background-only player feedback. No website message exposes
    // this path; managed-player and provider URL checks happen before the call.
    rememberPlayback:(playbackId,url)=>enqueue(async()=>{
      const state=await load('streaming'),active=state.data['benny-web:v1:streaming.activePlayback'];
      if(!state.migrations.length||!active||active.playbackId!==playbackId)return null;
      const key=active.show.toLowerCase().trim(),records=state.data['benny-web:v1:streaming.lastWatched']||{};
      const current=records[key],season=active.season??-1,episode=active.episode??-1;
      if(current?.url===url&&current.season===season&&current.episode===episode)return clone(current);
      const progress={url,season,episode,timestamp:Date.now()};
      Object.defineProperty(records,key,{value:progress,enumerable:true,writable:true,configurable:true});
      state.data['benny-web:v1:streaming.lastWatched']=records;state.revision++;await persist(state);return clone(progress);
    })
  });
}
