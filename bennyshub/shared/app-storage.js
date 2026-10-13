(() => {
  'use strict';
  if(window.BennyAppStorage)return;
  const groups={keyboard:['userKeyboardData','kb_settings'],dayhub:['dayhub_weather_web_v2'],streaming:['catalog','episodes','genres','lastWatched','activePlayback','searchHistory','settings'].map(k=>'benny-web:v1:streaming.'+k)};
  const states=new Map(),queues=new Map(),starting=new Map();
  const copy=v=>JSON.parse(JSON.stringify(v));
  function same(a,b){if(a===b)return true;if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(key=>Object.hasOwn(b,key)&&same(a[key],b[key]));}
  const pendingKey=app=>'benny-web:v1:companion.pending.'+app;
  const revisionKey=app=>'benny-web:v1:companion.revision.'+app;
  const archiveKey=app=>'benny-web:v1:companion.archives.'+app;
  function object(key,fallback){const value=localStorage.getItem(key);if(value===null)return fallback;try{return JSON.parse(value);}catch{throw Error('Saved app data could not be read. Export it before resetting.');}}
  function checkApp(app){if(!Object.hasOwn(groups,app))throw Error('Unsupported app.');}
  function localValues(app){checkApp(app);const data={};for(const key of groups[app]){const raw=localStorage.getItem(key);if(raw!==null)data[key]=object(key,null);}return BennyBackup.validate({version:1,app,data},app).values;}
  function enqueue(app,fn){const job=(queues.get(app)||Promise.resolve()).catch(()=>{}).then(fn);queues.set(app,job);return job;}
  function normalize(value,mode='companion'){return {...value,mode,values:value.data??value.values??{},migrationArchives:value.migrationArchives||[]};}
  function publish(app,state){if(state.migrationArchives)localStorage.setItem(archiveKey(app),JSON.stringify(state.migrationArchives));const pending=object(pendingKey(app),null);if(state.mode==='companion'&&pending)state={...state,mode:'pending',values:applyPatch(state.values,pending.patch)};states.set(app,state);document.dispatchEvent(new CustomEvent('benny-app-storage-change',{detail:{app,mode:state.mode,error:state.error||''}}));return copy(state);}
  function writeLocal(app,values){
    const before=new Map(groups[app].map(key=>[key,localStorage.getItem(key)]));
    try{for(const key of groups[app]){if(Object.hasOwn(values,key))localStorage.setItem(key,JSON.stringify(values[key]));else localStorage.removeItem(key);}}
    catch(error){for(const [key,raw]of before){try{raw===null?localStorage.removeItem(key):localStorage.setItem(key,raw);}catch{}}throw Error('This browser could not restore the app data. Your Companion copy is kept.');}
  }
  function applyPatch(values,patch){const result=copy(values);for(const [key,value]of Object.entries(patch)){if(value===null)delete result[key];else Object.defineProperty(result,key,{value,enumerable:true,writable:true,configurable:true});}return result;}
  async function connected(){const state=await BennyExtension.check();return state.connected&&state.capabilities.includes('app-storage-v1');}
  async function syncPending(app,remote){
    const pending=object(pendingKey(app),null);if(!pending)return remote;
    // Rebase only if none of the changed fields differs from its captured original.
    for(const key of Object.keys(pending.patch)){
      const actual=remote.values[key]??null,original=pending.base[key]??null,desired=pending.patch[key];
      if(!same(actual,original)&&!same(actual,desired))throw Error('This app changed in another window. Your device copy is kept; export it in My data before restoring another copy.');
    }
    const sent=JSON.stringify(pending);
    const result=normalize(await BennyExtension.request('APP_DATA_WRITE',{app,patch:pending.patch,expectedRevision:remote.revision}));
    if(localStorage.getItem(pendingKey(app))===sent)localStorage.removeItem(pendingKey(app));
    else {
      const latest=object(pendingKey(app),null);
      if(latest){
        for(const key of Object.keys(pending.patch)){
          if(!Object.hasOwn(latest.patch,key))continue;
          if(same(latest.base[key]??null,pending.base[key]??null))latest.base[key]=result.values[key]??null;
          if(same(latest.patch[key],result.values[key]??null)){delete latest.patch[key];delete latest.base[key];}
        }
        if(Object.keys(latest.patch).length)localStorage.setItem(pendingKey(app),JSON.stringify(latest));else localStorage.removeItem(pendingKey(app));
      }
    }
    localStorage.setItem(revisionKey(app),String(result.revision));return result;
  }
  async function remoteSnapshot(app){
    const status=await BennyExtension.request('APP_DATA_STATUS',{app});
    return normalize(status.migrationComplete?await BennyExtension.request('APP_DATA_READ',{app}):await BennyExtension.request('APP_DATA_MIGRATE',{app,data:localValues(app)}));
  }
  async function initialize(app){
    checkApp(app);
    if(!await connected())return publish(app,{app,mode:'browser',values:localValues(app),revision:Number(localStorage.getItem(revisionKey(app)))||0,migrationArchives:object(archiveKey(app),[])});
    let remote=await remoteSnapshot(app);
    try{remote=await syncPending(app,remote);}catch(error){return publish(app,{...remote,mode:'pending',values:applyPatch(remote.values,object(pendingKey(app),{patch:{}}).patch),error:error.message});}
    writeLocal(app,applyPatch(remote.values,object(pendingKey(app),{patch:{}}).patch));localStorage.setItem(revisionKey(app),String(remote.revision));return publish(app,remote);
  }
  async function ready(app){if(states.has(app))return copy(states.get(app));if(starting.has(app))return starting.get(app);const promise=enqueue(app,()=>initialize(app)).catch(error=>publish(app,{app,mode:'pending',values:localValues(app),revision:Number(localStorage.getItem(revisionKey(app)))||0,migrationArchives:object(archiveKey(app),[]),error:error.message})).finally(()=>starting.delete(app));starting.set(app,promise);return promise;}
  async function read(app){await ready(app);return enqueue(app,async()=>{
    if(!await connected())return publish(app,{app,mode:'browser',values:localValues(app),revision:Number(localStorage.getItem(revisionKey(app)))||0,migrationArchives:object(archiveKey(app),[])});
    let remote=await remoteSnapshot(app);
    try{remote=await syncPending(app,remote);writeLocal(app,applyPatch(remote.values,object(pendingKey(app),{patch:{}}).patch));return publish(app,remote);}
    catch(error){return publish(app,{...remote,mode:'pending',values:applyPatch(remote.values,object(pendingKey(app),{patch:{}}).patch),error:error.message});}
  });}
  function change(app,key,value){
    checkApp(app);if(!groups[app].includes(key))throw Error('Unexpected app data key.');
    if(value!==null)BennyBackup.validate({version:1,app,data:{[key]:value}},app);
    const previous=states.has(app)?(states.get(app).values[key]??null):object(key,null),existing=object(pendingKey(app),null),pending=existing||{base:{},patch:{}};
    if(!Object.hasOwn(pending.base,key))pending.base[key]=previous;
    pending.patch[key]=value;
    const previousPending=localStorage.getItem(pendingKey(app));
    try{localStorage.setItem(pendingKey(app),JSON.stringify(pending));value===null?localStorage.removeItem(key):localStorage.setItem(key,JSON.stringify(value));}
    catch(error){try{previousPending===null?localStorage.removeItem(pendingKey(app)):localStorage.setItem(pendingKey(app),previousPending);}catch{}throw Error('Could not save this app on this device. Export your data in My data before removing anything.');}
    const localRevision=(Number(localStorage.getItem(revisionKey(app)))||0)+1;
    if(states.get(app)?.mode==='browser')localStorage.setItem(revisionKey(app),String(localRevision));
    const state=states.get(app);if(state)publish(app,{...state,revision:state.mode==='browser'?localRevision:state.revision,values:applyPatch(state.values,{[key]:value}),mode:state.mode==='companion'?'pending':state.mode});
    enqueue(app,async()=>{
      if(!await connected())return;
      let remote=await remoteSnapshot(app);remote=await syncPending(app,remote);publish(app,remote);
    }).catch(error=>{const current=states.get(app);if(current)publish(app,{...current,mode:'pending',error:error.message});});
  }
  window.BennyAppStorage={
    ready,read,
    flush:async app=>{await (queues.get(app)||Promise.resolve());return copy(states.get(app)||await ready(app));},
    setItem(app,key,json){change(app,key,JSON.parse(json));},
    removeItem(app,key){change(app,key,null);},
    exportBackup:async app=>{const snapshot=await read(app);return {snapshot,backup:{version:snapshot.migrationArchives.length?2:1,app,data:snapshot.values,...(snapshot.migrationArchives.length?{migrationArchives:snapshot.migrationArchives}:{})}};},
    restore:async(backup,expectedRevision)=>{
      const checked=BennyBackup.validate(backup,backup.app),app=checked.app;await ready(app);
      return enqueue(app,async()=>{
        let result;
        if(await connected())result=normalize(await BennyExtension.request('APP_DATA_RESTORE',{backup,expectedRevision}));
        else {
          if(checked.migrationArchives.length)throw Error('Reconnect the latest Companion to restore this backup’s recovered data. Nothing has been changed.');
          const current=states.get(app);if((Number(localStorage.getItem(revisionKey(app)))||0)!==expectedRevision)throw Error('This app changed. Review the restore again.');result={...current,values:{...localValues(app),...checked.values},migrationArchives:object(archiveKey(app),[]),revision:expectedRevision+1};
        }
        const beforeValues=localValues(app);writeLocal(app,result.values);localStorage.setItem(archiveKey(app),JSON.stringify(result.migrationArchives||[]));
        if(result.mode==='companion')localStorage.removeItem(pendingKey(app));else localStorage.setItem(pendingKey(app),JSON.stringify({base:beforeValues,patch:checked.values}));localStorage.setItem(revisionKey(app),String(result.revision));return publish(app,result);
      });
    },
    clear:async(app,revision)=>{await ready(app);return enqueue(app,async()=>{
      let result;
      if(await connected())result=normalize(await BennyExtension.request('APP_DATA_CLEAR',{app,revision,confirm:true}));
      else {const current=states.get(app);if((Number(localStorage.getItem(revisionKey(app)))||0)!==revision)throw Error('This app changed. Review the clear again.');result={...current,values:{},migrationArchives:[],revision:revision+1};}
      const beforeValues=localValues(app);writeLocal(app,{});localStorage.removeItem(archiveKey(app));
      if(result.mode==='companion')localStorage.removeItem(pendingKey(app));else localStorage.setItem(pendingKey(app),JSON.stringify({base:beforeValues,patch:Object.fromEntries(groups[app].map(key=>[key,null]))}));localStorage.setItem(revisionKey(app),String(result.revision));return publish(app,result);
    });},
    keys:app=>{checkApp(app);return [...groups[app]];}
  };
})();
