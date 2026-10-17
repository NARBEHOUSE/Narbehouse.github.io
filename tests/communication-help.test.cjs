const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const bridge=fs.readFileSync(path.join(__dirname,'../bennyshub/shared/communication-companion.js'),'utf8');
test('Hub Help is fixed text, independent of general TTS, and never falls back after a speaker failure',async()=>{
  let listener,enabled=true,cancelled=0,finish;const replies=[],spoken=[];
  const window={addEventListener:(type,fn)=>listener=fn,removeEventListener(){},postMessage:m=>replies.push(m)};window.top=window;
  window.NarbePlatform={lifecycle:{onClose(){}}};
  window.NarbeCommunicationSpeech={isEnabled:()=>enabled,_service:{speak(text,owner){spoken.push({text,owner});return {cancel(){cancelled++;finish({reason:'cancelled'});},finished:new Promise(resolve=>finish=resolve)};},releaseOwner(){}}};
  vm.runInNewContext(bridge,{window,location:{origin:'https://example.test'},Date,setTimeout,clearTimeout,Map,Set,Number});
  const event=(id,action='help')=>({source:window,origin:'https://example.test',data:{channel:'benny-companion-help-request',id,action,deadline:Date.now()+45000,text:'Untrusted replacement'}});
  await listener({...event('bad'),origin:'https://other.test'});await listener(event(undefined));assert.equal(spoken.length,0);
  const pending=listener(event('first'));assert.equal(spoken[0].text,'I need help');finish({reason:'error'});await pending;
  assert.equal(replies.at(-1).data.enabled,true);assert.equal(replies.at(-1).data.reason,'error');
  const next=listener(event('next'));await listener(event('next','cancel'));await next;assert.equal(cancelled,1);
  await listener(event('early','cancel'));await listener(event('early'));assert.equal(spoken.length,2);
  enabled=false;await listener(event('off'));assert.equal(replies.at(-1).data.enabled,false);assert.equal(spoken.length,2);
});
test('managed player Help stays with its original Hub and cancellation cannot stop another player',async()=>{
  const {createPlayerHelp}=await import('../extension/player-help.mjs');
  const sent=[],pending=new Map();let unavailable=false,wrongHub=false,holdCancelReply=false;
  global.chrome={tabs:{async sendMessage(tabId,m,options){sent.push({tabId,m,options});if(m.action==='COMMUNICATION_HELP')return new Promise(resolve=>pending.set(m.payload.id,resolve));if(holdCancelReply)return new Promise(()=>{});return {};}}};
  const sender={tab:{id:1},frameId:0,url:'https://video.test/'};
  const helper=createPlayerHelp({managed:async s=>{if(s.url!==sender.url)throw Error('Not managed');return {hubTab:7,hubURL:'https://hub.test/bennyshub/'};},hubLocation:async()=>{if(unavailable)throw Error('Hub unavailable');return wrongHub?'https://other.test/':'https://hub.test/bennyshub/';},sameHub:(url,session)=>url===session.hubURL});
  const tick=()=>new Promise(resolve=>setImmediate(resolve));
  try{
    const first=helper.speak(sender,{id:'first'});await tick();assert.equal(sent[0].tabId,7);assert.deepEqual(sent[0].options,{frameId:0});
    assert.equal('text' in sent[0].m.payload,false);assert.equal('sinkId' in sent[0].m.payload,false);
    await helper.cancel(2,'first');assert.equal(sent.length,1);
    const second=helper.speak(sender,{id:'second'});await tick();assert.equal(sent[1].m.action,'COMMUNICATION_HELP_CANCEL');assert.equal(sent[1].m.payload.id,'first');
    pending.get('first')({enabled:false});assert.equal((await first).reason,'cancelled');
    pending.get('second')({enabled:true,reason:'ended'});assert.equal((await second).reason,'ended');
    const closing=helper.speak(sender,{id:'closing'});await tick();holdCancelReply=true;await helper.cancel(1);holdCancelReply=false;pending.get('closing')({enabled:false});assert.equal((await closing).reason,'cancelled');
    for(const bad of [{...sender,frameId:1},{...sender,url:'https://evil.test/'}])await assert.rejects(helper.speak(bad,{id:'bad'}));
    const before=sent.filter(x=>x.m.action==='COMMUNICATION_HELP').length;wrongHub=true;await assert.rejects(helper.speak(sender,{id:'wrong'}),/Hub page changed/);
    wrongHub=false;unavailable=true;await assert.rejects(helper.speak(sender,{id:'gone'}),/Hub unavailable/);
    assert.equal(sent.filter(x=>x.m.action==='COMMUNICATION_HELP').length,before);
  }finally{delete global.chrome;}
});
