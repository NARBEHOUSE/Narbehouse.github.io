const {test}=require('node:test'),assert=require('node:assert/strict');

test('companion scan preferences whitelist centralized settings and migrate older sessions',async()=>{
  const {scanPrefs}=await import('../extension/policy.mjs');
  const defaults={
    autoScan:false,scanInterval:2000,inputSensitivity:50,
    parking:'off',loopsBeforeParking:2,spaceBrake:true,waitForSpeech:false,
    voice:'',rate:1,tts:true
  };
  assert.deepEqual(scanPrefs(),defaults);
  assert.deepEqual(scanPrefs(null),defaults);
  assert.deepEqual(scanPrefs({autoScan:true,scanInterval:3000,inputSensitivity:100}),{
    ...defaults,autoScan:true,scanInterval:3000,inputSensitivity:100
  });
  for(const parking of ['off','chosen','auto'])for(const loopsBeforeParking of [1,2,3]){
    const prefs=scanPrefs({
      ...defaults,autoScan:true,parking,loopsBeforeParking,spaceBrake:false,waitForSpeech:true,
      voice:'Test voice',rate:1.5,tts:false,unknown:'never forward',voiceAPIKey:'never forward'
    });
    assert.deepEqual(prefs,{
      ...defaults,autoScan:true,parking,loopsBeforeParking,spaceBrake:false,waitForSpeech:true,
      voice:'Test voice',rate:1.5,tts:false
    });
  }
  for(const loopsBeforeParking of [0,4,-1,1.5,'3',null,true,Infinity]){
    const prefs=scanPrefs({parking:'invalid',loopsBeforeParking,spaceBrake:'false',waitForSpeech:'true'});
    assert.equal(prefs.parking,'off');
    assert.equal(prefs.loopsBeforeParking,2);
    assert.equal(prefs.spaceBrake,true);
    assert.equal(prefs.waitForSpeech,false);
  }
  // The transport does not add a duration filter or a new sensitivity value.
  for(const inputSensitivity of [50,100,200,300])assert.equal(scanPrefs({inputSensitivity}).inputSensitivity,inputSensitivity);
});

test('companion launch, live sync and polling keep scan settings within the owning Hub origin',async()=>{
  const origin='http://127.0.0.1:4173',otherOrigin='https://narbehouse.github.io';
  const session={},local={},tabs=new Map(),messages=[],unavailable=new Set();
  let listener,nextTab=20,delayNextLocalWrite=false;
  const clone=value=>structuredClone(value);
  const storage=data=>({
    async setAccessLevel(){},
    async get(key){return clone(key===null?data:{[key]:data[key]});},
    async set(value){if(data===local&&delayNextLocalWrite){delayNextLocalWrite=false;await new Promise(resolve=>setTimeout(resolve,20));}Object.assign(data,clone(value));},
    async remove(keys){for(const key of [].concat(keys))delete data[key];}
  });
  const addTab=(id,url)=>{const tab={id,url,windowId:1};tabs.set(id,tab);return tab;};
  const hub=(id,url)=>({id:'test-extension',url,tab:addTab(id,url),frameId:0});
  const first=hub(7,origin+'/bennyshub/index.html');
  const sameOrigin=hub(8,origin+'/bennyshub/');
  const other=hub(9,otherOrigin+'/bennyshub/index.html');
  global.chrome={
    storage:{local:storage(local),session:storage(session)},
    permissions:{async contains(){return true;}},
    runtime:{
      id:'test-extension',getURL:path=>'chrome-extension://test-extension/'+path,
      onInstalled:{addListener(){}},onStartup:{addListener(){}},
      onMessage:{addListener(fn){listener=fn;}}
    },
    tabs:{
      async update(id,options){Object.assign(tabs.get(id),options);return clone(tabs.get(id));},
      async get(id){if(!tabs.has(id))throw Error('Missing tab');return clone(tabs.get(id));},
      async sendMessage(id,message,options){
        messages.push({id,message:clone(message),options:clone(options)});
        if(unavailable.has(id))throw Error('No receiving content script');
        return {url:tabs.get(id)?.url};
      },
      async remove(id){tabs.delete(id);},
      onRemoved:{addListener(){}}
    },
    windows:{
      async create(options){
        const tab=addTab(nextTab++,options.url);tab.windowId=2;
        return {id:2,tabs:[clone(tab)]};
      },
      async update(){}
    },
    action:{onClicked:{addListener(){}}}
  };
  try{
    await import('../extension/background.mjs');
    const call=(action,payload={},sender=first)=>new Promise(resolve=>listener({protocol:1,action,payload},sender,resolve));
    const launch=async(sender,settings)=>{
      const tabId=nextTab;
      assert.equal((await call('OPEN_STREAM',{url:'https://www.youtube.com/watch?v=example',settings},sender)).ok,true);
      return {id:'test-extension',url:tabs.get(tabId).url,tab:tabs.get(tabId),frameId:0};
    };
    const chosen={autoScan:true,scanInterval:3000,inputSensitivity:200,parking:'chosen',loopsBeforeParking:3,spaceBrake:false,waitForSpeech:true};
    const playerA=await launch(first,chosen);
    const initial=(await call('PLAYER_HELLO',{},playerA)).data.session.settings;
    assert.equal(initial.parking,'chosen');assert.equal(initial.waitForSpeech,true);assert.equal(initial.spaceBrake,false);
    assert.equal(session['player:20'].settings.loopsBeforeParking,3);
    const playerB=await launch(sameOrigin,chosen);
    const playerOther=await launch(other,{parking:'off'});
    const sleeping=await launch(first,chosen);unavailable.add(sleeping.tab.id);
    session['player:not-a-tab']={hubOrigin:origin};
    session['resume:7']={hubOrigin:origin,playbackId:'private'};
    session['player:24']=null;
    // Toolbar narration is extension-local, independent of Hub origins/voice,
    // and only a validated, managed top-frame player may change it.
    assert.equal((await call('PLAYER_HELLO',{},playerA)).data.session.toolbarSpeechEnabled,true);
    const originalScans=clone(Object.fromEntries(Object.entries(session).filter(([key])=>key.startsWith('scan:'))));
    messages.length=0;
    assert.deepEqual((await call('PLAYER_TOOLBAR_SPEECH',{enabled:false},playerA)).data,{enabled:false});
    assert.equal(local.playerToolbarSpeechEnabled,false);
    const speechPush=messages.filter(entry=>entry.message.action==='PLAYER_TOOLBAR_SPEECH');
    assert.deepEqual(speechPush.map(entry=>entry.id).sort((a,b)=>a-b),[20,21,22,23]);
    for(const entry of speechPush){assert.deepEqual(entry.options,{frameId:0});assert.deepEqual(entry.message.payload,{enabled:false});}
    for(const player of [playerA,playerB,playerOther,sleeping])assert.equal((await call('PLAYER_HELLO',{},player)).data.session.toolbarSpeechEnabled,false);
    assert.deepEqual(Object.fromEntries(Object.entries(session).filter(([key])=>key.startsWith('scan:'))),originalScans);
    messages.length=0;
    for(const enabled of [undefined,null,'false',0,{}])assert.equal((await call('PLAYER_TOOLBAR_SPEECH',{enabled},playerA)).ok,false);
    for(const sender of [first,{...playerA,id:'other-extension'},{...playerA,frameId:1},{...playerA,tab:{id:99}},{...playerA,url:'https://evil.example/'}])assert.equal((await call('PLAYER_TOOLBAR_SPEECH',{enabled:true},sender)).ok,false);
    assert.equal(local.playerToolbarSpeechEnabled,false);assert.equal(messages.filter(entry=>entry.message.action==='PLAYER_TOOLBAR_SPEECH').length,0);
    assert.equal((await call('PLAYER_TOOLBAR_SPEECH',{enabled:true},playerOther)).ok,true);
    assert.equal((await call('PLAYER_HELLO',{},playerA)).data.session.toolbarSpeechEnabled,true);

    // A slower first write cannot broadcast stale state after a newer toggle.
    messages.length=0;delayNextLocalWrite=true;
    const rapid=await Promise.all([call('PLAYER_TOOLBAR_SPEECH',{enabled:false},playerA),call('PLAYER_TOOLBAR_SPEECH',{enabled:true},playerOther)]);
    assert.ok(rapid.every(reply=>reply.ok));assert.equal(local.playerToolbarSpeechEnabled,true);
    assert.deepEqual(messages.filter(entry=>entry.message.action==='PLAYER_TOOLBAR_SPEECH'&&entry.id===playerA.tab.id).map(entry=>entry.message.payload.enabled),[false,true]);

    const next={...chosen,parking:'auto',loopsBeforeParking:1,spaceBrake:true,waitForSpeech:false,extra:'not settings'};
    messages.length=0;
    const reply=await call('SYNC_SCAN',next);
    assert.equal(reply.ok,true);
    const pushed=messages.filter(entry=>entry.message.action==='PLAYER_SCAN_SETTINGS');
    assert.deepEqual(pushed.map(entry=>entry.id).sort((a,b)=>a-b),[20,21,23]);
    for(const entry of pushed){
      assert.deepEqual(entry.options,{frameId:0});
      assert.deepEqual(entry.message,{protocol:1,action:'PLAYER_SCAN_SETTINGS',payload:{settings:reply.data.settings}});
      assert.equal('extra' in entry.message.payload.settings,false);
    }
    assert.deepEqual(session['scan:'+origin],reply.data.settings);
    assert.equal(session['scan:'+otherOrigin].parking,'off');
    for(const player of [playerA,playerB,sleeping]){
      assert.deepEqual((await call('PLAYER_HELLO',{},player)).data.session.settings,reply.data.settings);
    }
    assert.equal((await call('PLAYER_HELLO',{},playerOther)).data.session.settings.parking,'off');

    // Older pages send partial settings. They must not erase the centralized
    // parking/brake/speech policy, whether they sync or launch another player.
    await call('SYNC_SCAN',{parking:'auto',loopsBeforeParking:3,spaceBrake:false,waitForSpeech:true});
    const partial=(await call('SYNC_SCAN',{scanInterval:4000,voice:'Another voice'})).data.settings;
    assert.equal(partial.parking,'auto');assert.equal(partial.loopsBeforeParking,3);
    assert.equal(partial.spaceBrake,false);assert.equal(partial.waitForSpeech,true);
    assert.equal(partial.autoScan,true);assert.equal(partial.scanInterval,4000);
    const omittedLaunch=await launch(first);
    assert.deepEqual((await call('PLAYER_HELLO',{},omittedLaunch)).data.session.settings,partial);
    const partialLaunch=await launch(first,{scanInterval:2000});
    assert.deepEqual((await call('PLAYER_HELLO',{},partialLaunch)).data.session.settings,{...partial,scanInterval:2000});
    const explicitLaunch=await launch(first,{parking:'chosen',loopsBeforeParking:1,spaceBrake:true,waitForSpeech:false});
    const explicit=(await call('PLAYER_HELLO',{},explicitLaunch)).data.session.settings;
    assert.equal(explicit.parking,'chosen');assert.equal(explicit.loopsBeforeParking,1);
    assert.equal(explicit.spaceBrake,true);assert.equal(explicit.waitForSpeech,false);
    const unrelatedLaunch=await launch(other);
    const unrelated=(await call('PLAYER_HELLO',{},unrelatedLaunch)).data.session.settings;
    assert.equal(unrelated.parking,'off');assert.equal(unrelated.voice,'');assert.equal(unrelated.scanInterval,2000);

    // Stored settings from the prior release gain defaults, and private or
    // malformed fields never leak through a PLAYER_HELLO response.
    delete session['scan:'+origin];
    session['player:20'].settings={autoScan:true,inputSensitivity:300,privateValue:'secret',parking:'wrong',loopsBeforeParking:12};
    const migrated=(await call('PLAYER_HELLO',{},playerA)).data.session.settings;
    assert.equal(migrated.autoScan,true);assert.equal(migrated.inputSensitivity,300);
    assert.equal(migrated.parking,'off');assert.equal(migrated.loopsBeforeParking,2);
    assert.equal(migrated.spaceBrake,true);assert.equal(migrated.waitForSpeech,false);
    assert.equal('privateValue' in migrated,false);

    messages.length=0;
    for(const sender of [
      {...first,id:'another-extension'},
      {...first,url:'https://evil.example/bennyshub/'},
      {...first,url:otherOrigin+'/bennyshub/apps/tools/streaming/index.html'},
      {...first,tab:undefined}
    ])assert.equal((await call('SYNC_SCAN',next,sender)).ok,false);
    assert.equal(messages.filter(entry=>entry.message.action==='PLAYER_SCAN_SETTINGS').length,0);
    assert.equal(session['scan:'+origin],undefined);
    assert.equal((await call('PLAYER_HELLO',{}, {...playerA,frameId:1})).ok,false);
    assert.equal((await call('PLAYER_HELLO',{}, {...playerA,tab:{id:99}})).ok,false);
  }finally{delete global.chrome;}
});
