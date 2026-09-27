const {test}=require('node:test'),assert=require('node:assert/strict');

test('player returns reuse Hub tabs and coalesce restoration without reopening on close',async()=>{
  const hubURL='http://127.0.0.1:4173/bennyshub/index.html';
  const tabs=new Map(),session={},local={},unresponsive=new Set(),removed=[],created=[],positions=[];
  let listener,onRemoved,nextId=100,normalWindows=[{id:1,type:'normal'}];
  const storage=data=>({async setAccessLevel(){},async get(key){return key===null?{...data}:{[key]:data[key]};},async set(values){Object.assign(data,values);},async remove(keys){for(const key of [].concat(keys))delete data[key];}});
  const addTab=(id,url,windowId=1)=>{const tab={id,url,windowId};tabs.set(id,tab);return tab;};
  const publicTab=tab=>({...tab,url:tab.exposeURL?tab.url:undefined}); // No broad tabs permission.
  global.chrome={
    storage:{local:storage(local),session:storage(session)},permissions:{async contains(){return true;}},
    runtime:{id:'test-extension',onInstalled:{addListener(){}},onStartup:{addListener(){}},onMessage:{addListener(fn){listener=fn;}}},
    action:{onClicked:{addListener(){}}},
    tabs:{
      async get(id){if(!tabs.has(id))throw Error('Tab closed');return publicTab(tabs.get(id));},
      async query(){return [...tabs.values()].map(publicTab);},
      async sendMessage(id,message){if(message?.action==='STREAM_POSITION')positions.push(message.progress);if(!tabs.has(id)||unresponsive.has(id))throw Error('No receiver');return {url:tabs.get(id).url};},
      async create(options){assert.equal(options.windowId,1);created.push(options);return addTab(nextId++,options.url,options.windowId);},
      async update(id,options){assert.ok(tabs.has(id));Object.assign(tabs.get(id),options);return tabs.get(id);},
      async remove(id){assert.ok(tabs.has(id));tabs.delete(id);removed.push(id);onRemoved(id);},
      onRemoved:{addListener(fn){onRemoved=fn;}}
    },
    windows:{
      async getAll(options){assert.deepEqual(options,{windowTypes:['normal']});return normalWindows;},
      async update(id,options){assert.equal(options.focused,true);},
      async create(options){assert.equal(options.type,'normal');created.push(options);return {id:3,tabs:[addTab(nextId++,options.url,3)]};}
    }
  };
  await import('../extension/background.mjs');
  const player=(id,hubTab=7,tracking=false)=>{
    const tab=addTab(id,'https://app.plex.tv/desktop/',2);
    session['player:'+id]={hubTab,hubURL,hubOrigin:new URL(hubURL).origin,...(tracking?{playbackId:'show',startURL:tab.url}:{})};
    return {id:'test-extension',url:tab.url,tab,frameId:0};
  };
  const call=(sender,destination)=>new Promise(resolve=>listener({action:'RETURN_TO_HUB',payload:{destination},protocol:1},sender,resolve));
  const reset=()=>{tabs.clear();unresponsive.clear();created.length=0;removed.length=0;for(const key of Object.keys(session))delete session[key];normalWindows=[{id:1,type:'normal'}];};
  try{
    // A bridge disconnected by refresh/update is not evidence of a closed tab.
    addTab(7,hubURL);unresponsive.add(7);
    assert.equal((await call(player(20))).ok,true);
    assert.equal(created.length,0);assert.deepEqual([...tabs.keys()],[7]);

    // Prefer another existing Hub when the original really closed.
    reset();addTab(8,hubURL+'#tools');addTab(9,'https://unrelated.example/');
    assert.equal((await call(player(20,7,true))).ok,true);
    assert.equal(created.length,0);assert.equal(tabs.get(8).active,true);
    assert.equal(session['resume:8'].playbackId,'show');

    // Two players and repeated switch presses restore just one Hub, even while
    // the replacement content script is not ready to reply.
    reset();const first=player(20),second=player(21);
    unresponsive.add(nextId);
    const results=await Promise.all([call(first),call(first),call(second),call(second)]);
    assert.ok(results.every(r=>r.ok));assert.equal(created.length,1);
    assert.deepEqual(removed,[20,21]);assert.equal(tabs.size,1);
    assert.equal([...tabs.values()][0].windowId,1);

    // If only the playback popup remains, create a normal Hub window.
    reset();normalWindows=[];
    assert.equal((await call(player(20))).ok,true);
    assert.equal(created.length,1);assert.equal(created[0].type,'normal');

    // A known navigation away does not redirect or overwrite that other page.
    reset();addTab(7,'https://unrelated.example/').exposeURL=true;addTab(8,hubURL);
    assert.equal((await call(player(20))).ok,true);
    assert.equal(tabs.get(7).url,'https://unrelated.example/');assert.equal(tabs.get(8).active,true);
    assert.equal(created.length,0);

    // Only fixed shortcuts are accepted, and reuse the existing Hub tab.
    for(const destination of ['keyboard','phraseboard','home']){
      reset();addTab(7,hubURL);const sender=player(20);
      assert.equal((await call(sender,'https://evil.example/')).ok,false);
      assert.equal(tabs.has(20),true);
      assert.equal((await call(sender,destination)).ok,true);
      assert.equal(tabs.get(7).url,hubURL+'#companion='+destination);
      assert.equal(created.length,0);assert.deepEqual(removed,[20]);
    }

    // Capture the final SPA URL even if sender.url still identifies episode one.
    for(const [start,final] of [
      ['https://www.youtube.com/watch?v=first&list=series','https://www.youtube.com/watch?v=seventh'],
      ['https://www.netflix.com/watch/1001','https://www.netflix.com/watch/1007'],
      ['https://www.disneyplus.com/play/first','https://www.disneyplus.com/play/seventh'],
      ['https://www.hulu.com/watch/first','https://www.hulu.com/watch/seventh'],
      ['https://www.primevideo.com/detail/first?autoplay=1','https://www.primevideo.com/detail/seventh?autoplay=1']
    ]){
      reset();addTab(7,hubURL);const sender=player(20);sender.url=start;sender.tab.url=start;
      session['player:20'].startURL=start;session['player:20'].playbackId='series';
      const request=(action,url)=>new Promise(resolve=>listener({protocol:1,action,payload:{url,destination:'keyboard'}},sender,resolve));
      for(const invalid of ['https://www.disneyplus.com/browse/home','https://www.hulu.com/hub/home','https://www.primevideo.com/','https://www.netflix.com/profiles','https://www.primevideo.com/ap/signin','https://www.youtube.com/watch?v=7&token=private','https://unrelated.example/']){
        assert.equal((await request('PLAYER_HELLO',invalid)).ok,true);assert.equal(session['resume:7'],undefined);
      }
      assert.equal((await request('RETURN_TO_HUB',final)).ok,true);
      const expected=final+(start.includes('youtube')?'&list=series':'');
      assert.equal(session['resume:7'].url,expected);assert.equal(positions.at(-1).url,expected);
      assert.equal(tabs.get(7).url,hubURL+'#companion=keyboard');
    }

    // Ordinary window close only cleans session state.
    reset();addTab(7,hubURL);player(20);
    await chrome.tabs.remove(20);
    assert.equal(session['player:20'],undefined);assert.equal(created.length,0);
    assert.equal((await call({id:'test-extension',url:'https://app.plex.tv/desktop/',tab:{id:20},frameId:0})).ok,false);
    assert.equal(created.length,0);
  }finally{delete global.chrome;}
});
