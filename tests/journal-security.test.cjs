const {test}=require('node:test'),assert=require('node:assert/strict');

test('Journal background authenticates sender, Hub top origin, page and caregiver-only mutations',async()=>{
  const origin='https://narbehouse.github.io',hub=origin+'/bennyshub/',journal=hub+'apps/tools/journal/index.html',settings=hub+'data-settings.html';
  const local={},session={},listeners={};
  const storage=data=>({async setAccessLevel(){},async get(key){return Object.hasOwn(data,key)?{[key]:structuredClone(data[key])}:{};},async set(values){Object.assign(data,structuredClone(values));},async remove(key){delete data[key];}});
  global.chrome={storage:{local:storage(local),session:storage(session)},
    runtime:{id:'test-extension',getManifest:()=>({version:'1.0.8'}),onMessage:{addListener(fn){listeners.message=fn;}},onInstalled:{addListener(){}},onStartup:{addListener(){}}},
    tabs:{async sendMessage(){return {url:'https://untrusted.example/'};},onRemoved:{addListener(){}}},action:{onClicked:{addListener(){}}}
  };
  try{
    await import('../extension/background.mjs');
    const sender={id:'test-extension',url:journal,frameId:1,tab:{id:1,url:hub}};
    const call=(action,payload={},overrides={},protocol=1)=>new Promise(resolve=>listeners.message({protocol,action,payload},{...sender,...overrides},resolve));
    const hello=await call('HELLO');assert.ok(hello.data.capabilities.includes('journal-storage-v1'));assert.ok(hello.data.capabilities.includes('journal'));
    assert.ok(hello.data.capabilities.includes('app-storage-v1'));
    assert.equal((await call('JOURNAL_READ')).ok,true);
    const denied=[{id:'other-extension'},{tab:undefined},{url:'https://untrusted.example/bennyshub/apps/tools/journal/index.html'},
      {url:'https://bennyshub.com/bennyshub/apps/tools/journal/index.html'},
      {tab:{id:1,url:'https://untrusted.example/'}},{url:hub},{url:hub+'apps/tools/streaming/index.html'}];
    for(const overrides of denied)assert.equal((await call('JOURNAL_READ',{},overrides)).ok,false,JSON.stringify(overrides));
    assert.equal((await call('JOURNAL_READ',{}, {},99)).ok,false);
    assert.equal((await call('JOURNAL_STATUS',{}, {url:hub,frameId:0})).ok,true);
    for(const action of ['JOURNAL_CLEAR','JOURNAL_RESTORE','JOURNAL_BACKUP_MARK']){
      assert.equal((await call(action,{})).code,'FORBIDDEN');
      assert.equal((await call(action,{}, {url:settings,frameId:1})).code,'FORBIDDEN');
    }
    const caregiver={url:settings,frameId:0};
    assert.equal((await call('JOURNAL_MIGRATE',{entries:[{id:1,date:'2026-10-04',question:'Question',answer:'Private journal text'}]},caregiver)).ok,true);
    const status=await call('JOURNAL_STATUS',{}, {url:hub,frameId:0});assert.equal(status.data.entryCount,1);assert.equal(JSON.stringify(status).includes('Private journal text'),false);
    assert.equal((await call('JOURNAL_CLEAR',{revision:1,confirm:true},caregiver)).ok,true);
    for(const app of ['keyboard','streaming','dayhub']){
      const appSender={url:hub+'apps/tools/'+app+'/index.html'};
      assert.equal((await call('APP_DATA_READ',{app},appSender)).ok,true);
      assert.equal((await call('APP_DATA_READ',{app})).code,'FORBIDDEN');
      assert.equal((await call('APP_DATA_READ',{app},{...appSender,id:'other-extension'})).ok,false);
      assert.equal((await call('APP_DATA_READ',{app},{...appSender,tab:{id:1,url:'https://untrusted.example/'}})).ok,false);
      assert.equal((await call('APP_DATA_CLEAR',{app,revision:0,confirm:true},appSender)).code,'FORBIDDEN');
      assert.equal((await call('APP_DATA_STATUS',{app},{url:hub,frameId:0})).ok,true);
      assert.equal((await call('APP_DATA_RESTORE',{backup:{version:1,app,data:{}},expectedRevision:0},caregiver)).ok,true);
    }
  }finally{delete global.chrome;}
});
