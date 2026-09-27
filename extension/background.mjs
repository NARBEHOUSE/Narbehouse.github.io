import {updatePlayerScripts} from './player-registration.mjs';
import {PROTOCOL,isHub,playerURL,scanPrefs,SERVICES} from './policy.mjs';
import {calendarWeek} from './calendar.mjs';
const trustedStorage=Promise.all([chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'}),chrome.storage.session.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'})]).then(()=>chrome.storage.session.remove('ai'));
const launchBusy=new Set();
const returning=new Map();let returnQueue=Promise.resolve();
async function hubLocation(tabId) {
  const reply=await chrome.tabs.sendMessage(tabId,{protocol:PROTOCOL,action:'HUB_PING'},{frameId:0});
  if(!isHub(reply?.url))throw Error('Open the Hub again to continue.');
  return reply.url;
}
async function hasOrigin(url){return chrome.permissions.contains({origins:[new URL(url).origin+'/*']});}
async function fetchText(url,options={}){
  const response=await fetch(url,{...options,credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(25000)});
  if(!response.ok)throw Error('Service request failed ('+response.status+'). Check access and settings.');
  const reader=response.body.getReader();let bytes=0,result='';const decoder=new TextDecoder();
  while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>2_000_000){await reader.cancel();throw Error('Response too large.');}result+=decoder.decode(value,{stream:true});}return result+decoder.decode();
}
async function managed(sender){
  if(!sender.tab||sender.frameId!==0)throw Error('Player unavailable.');
  const url=playerURL(sender.url);if(!await hasOrigin(url.href))throw Error('Service access was removed.');
  const key='player:'+sender.tab.id;const session=(await chrome.storage.session.get(key))[key];
  if(!session)throw Error('This tab was not opened by Benny’s Hub.');
  // Redirects within an enabled service are allowed; arbitrary sites still fail playerURL.
  return session;
}
async function rememberPosition(sender,session,currentURL=sender.url) {
  if (!session.playbackId) return;
  let url,original;
  try{url=playerURL(currentURL);original=playerURL(session.startURL);}catch{return;}
  const service=Object.values(SERVICES).find(s=>s.hosts.includes(original.hostname));
  if(!service?.hosts.includes(url.hostname)||/login|signin|sign-in|oauth|authorize/i.test(url.pathname))return;
  if([...url.searchParams.keys()].some(k=>/token|password|secret|code/i.test(k)))return;
  if(service===SERVICES.youtube){
    if(url.pathname!=='/watch'||!url.searchParams.get('v'))return;
    if(!url.searchParams.has('list')&&original.searchParams.has('list'))url.searchParams.set('list',original.searchParams.get('list'));
  }
  if(service===SERVICES.netflix&&!/^\/watch\/\d+/.test(url.pathname))return;
  if(service===SERVICES.disney&&!/\/play\/[^/]+/.test(url.pathname))return;
  if(service===SERVICES.hulu&&!/^\/watch\/[^/]+/.test(url.pathname))return;
  if(service===SERVICES.prime&&!/\/(detail|player|video)\/[^/]+/.test(url.pathname))return;
  if(service===SERVICES.tubi&&!/^\/(tv-shows|movies)\/\d+/.test(url.pathname))return;
  const progress={playbackId:session.playbackId,url:url.href};
  await chrome.storage.session.set({['resume:'+session.hubTab]:progress});
  // Persist to the owning website before navigation destroys its Streaming iframe.
  // Session storage remains a fallback while a Hub tab is reloading/unavailable.
  await chrome.tabs.sendMessage(session.hubTab,{protocol:PROTOCOL,action:'STREAM_POSITION',progress},{frameId:0}).catch(()=>{});
}
function sameHub(url,session){
  if(!isHub(url)||!isHub(session.hubURL))return false;
  const current=new URL(url),original=new URL(session.hubURL);
  return current.origin===original.origin&&current.pathname.replace(/index\.html$/,'')===original.pathname.replace(/index\.html$/,'');
}
async function findReturnHub(session){
  const original=await chrome.tabs.get(session.hubTab).catch(()=>null);
  if(original){
    const url=original.pendingUrl||original.url||await hubLocation(original.id).catch(()=>null);
    // A missing bridge reply does not mean the tab closed (reloads, discarded
    // tabs and extension updates can interrupt it). Keep its known tab ID.
    if(!url||sameHub(url,session))return original;
  }
  // No broad tabs permission: use the Hub's own content-script reply when
  // Chromium does not expose a candidate's URL.
  const candidates=await chrome.tabs.query({});
  for(const tab of candidates){
    if(tab.id===session.hubTab)continue;
    const url=tab.pendingUrl||tab.url||await hubLocation(tab.id).catch(()=>null);
    if(sameHub(url,session))return tab;
  }
  if(!isHub(session.hubURL))throw Error('Open Benny\u2019s Hub again, then launch a new stream.');
  // Restore into a normal browser window, never a new tab in the player popup.
  const windows=await chrome.windows.getAll({windowTypes:['normal']});
  const target=windows.find(w=>w.focused)||windows[0];
  if(target)return chrome.tabs.create({windowId:target.id,url:session.hubURL,active:true});
  const window=await chrome.windows.create({url:session.hubURL,type:'normal',focused:true});
  if(!window.tabs?.[0])throw Error('Could not reopen the Hub.');
  return window.tabs[0];
}
function returnToHub(sender,destination,currentURL){
  if(destination!==undefined&&!['keyboard','phraseboard','home'].includes(destination))throw Error('Unknown Hub destination.');
  if(!sender.tab||sender.frameId!==0)throw Error('Player unavailable.');
  const id=sender.tab?.id;
  if(returning.has(id))return returning.get(id);
  // Serialize returns across player windows, and coalesce repeated activation
  // in one window, so only one replacement Hub can be created.
  const task=returnQueue.catch(()=>{}).then(async()=>{
    const session=await managed(sender),hub=await findReturnHub(session);
    if(hub.id!==session.hubTab){
      const stored=await chrome.storage.session.get(null),updates={};
      for(const [key,value]of Object.entries(stored)){
        if(key.startsWith('player:')&&value.hubTab===session.hubTab&&value.hubURL===session.hubURL)updates[key]={...value,hubTab:hub.id};
      }
      await chrome.storage.session.set(updates);session.hubTab=hub.id;
    }
    await rememberPosition(sender,session,currentURL);
    const update={active:true};
    if(destination){
      const url=new URL('/bennyshub/index.html',session.hubURL);
      url.hash='companion='+destination;update.url=url.href;
    }
    await chrome.tabs.update(hub.id,update);await chrome.windows.update(hub.windowId,{focused:true});
    await chrome.tabs.remove(id);return {};
  });
  returning.set(id,task);returnQueue=task;
  task.finally(()=>returning.delete(id)).catch(()=>{});
  return task;
}
async function handle(m,sender){
  await trustedStorage;
  if(sender.id!==chrome.runtime.id||m?.protocol!==PROTOCOL)throw Error('Unsupported request.');
  if(m.action==='PLAYER_HELLO'){
    const session=await managed(sender);await rememberPosition(sender,session,m.payload?.url);
    const synced=(await chrome.storage.session.get('scan:'+session.hubOrigin))['scan:'+session.hubOrigin];
    return {session:{settings:synced||session.settings,service:session.service||'',startup:session.startup!==false,browserUnlocked:session.browserUnlocked===true}};
  }
  if(m.action==='PLAYER_ACCESS'){
    const session=await managed(sender);
    if(typeof m.payload?.unlocked!=='boolean')throw Error('Invalid browser access state.');
    session.browserUnlocked=m.payload.unlocked;
    await chrome.storage.session.set({['player:'+sender.tab.id]:session});return {};
  }
  if(m.action==='ENSURE_PLAYER_FULLSCREEN'){
    await managed(sender);const playerWindow=await chrome.windows.get(sender.tab.windowId);
    if(playerWindow.state!=='fullscreen')await chrome.windows.update(playerWindow.id,{state:'fullscreen'});
    return {};
  }
  if(m.action==='RETURN_TO_HUB'){
    return returnToHub(sender,m.payload?.destination,m.payload?.url);
  }
  if(!sender.tab||!isHub(sender.url))throw Error('Only Benny’s Hub can use this action.');
  const topURL=isHub(sender.tab.url)?sender.tab.url:await hubLocation(sender.tab.id);
  if(new URL(topURL).origin!==new URL(sender.url).origin)throw Error('Only Benny’s Hub can use this action.');
  const p=m.payload||{};
  switch(m.action){
    case 'HELLO':return {protocol:PROTOCOL,version:chrome.runtime.getManifest().version,capabilities:['streaming','journal','dayhub']};
    case 'OPEN_OPTIONS':await chrome.runtime.openOptionsPage();return {};
    case 'SYNC_SCAN':{
      const settings=scanPrefs(p);await chrome.storage.session.set({['scan:'+new URL(sender.url).origin]:settings});return {settings};
    }
    case 'STREAM_PROGRESS':{
      if(!new URL(sender.url).pathname.startsWith('/bennyshub/apps/tools/streaming/'))throw Error('Progress is available only in Streaming.');
      return (await chrome.storage.session.get('resume:'+sender.tab.id))['resume:'+sender.tab.id]||null;
    }
    case 'OPEN_STREAM':{
      const url=playerURL(p.url);if(!await hasOrigin(url.href))throw Error('Enable this streaming service in Companion settings first.');
      if(launchBusy.has(sender.tab.id))throw Error('Already opening a stream.');launchBusy.add(sender.tab.id);
      let tab;
      try{
        // A dedicated playback window avoids the new-tab address bar retaining switch focus.
        const playerWindow=await chrome.windows.create({url:chrome.runtime.getURL('player-loading.html'),type:'popup',focused:true,state:'fullscreen'});
        tab=playerWindow.tabs?.[0];if(!tab)throw Error('Could not create the player window.');
        const tracking=p.trackProgress===true&&typeof p.playbackId==='string'&&/^[\w-]{1,80}$/.test(p.playbackId)&&new URL(sender.url).pathname.startsWith('/bennyshub/apps/tools/streaming/');
        const service=Object.entries(SERVICES).find(([,s])=>s.hosts.includes(url.hostname))?.[0]||'';
        const hubOrigin=new URL(topURL).origin,settings=scanPrefs(p.settings);
        await chrome.storage.session.set({['scan:'+hubOrigin]:settings,['player:'+tab.id]:{hubTab:sender.tab.id,hubURL:topURL,hubOrigin,service,startup:!!service,settings,...(tracking?{playbackId:p.playbackId,startURL:url.href}:{})}});
        await chrome.tabs.update(tab.id,{url:url.href,active:true});
        // Chromium can ignore fullscreen in windows.create for popup windows.
        // Apply it to the existing window after creation/navigation as well.
        await chrome.windows.update(playerWindow.id,{state:'fullscreen',focused:true});return {opened:true};
      }catch(e){if(tab){await chrome.tabs.remove(tab.id).catch(()=>{});await chrome.storage.session.remove('player:'+tab.id);}throw e;}
      finally{launchBusy.delete(sender.tab.id);}
    }
    case 'CALENDAR_WEEK':{
      const {calendarUrl}=await chrome.storage.local.get('calendarUrl');if(!calendarUrl)throw Error('Add a calendar in Companion settings first.');
      if(!await hasOrigin(calendarUrl))throw Error('Enable Calendar access in Companion settings.');
      return calendarWeek(await fetchText(calendarUrl));
    }
    case 'NEWS':{
      const {newsEnabled}=await chrome.storage.local.get('newsEnabled');if(!newsEnabled)throw Error('Enable news in Companion settings first.');
      const feeds={national:'https://feeds.npr.org/1001/rss.xml',world:'https://feeds.bbci.co.uk/news/world/rss.xml'};
      if(typeof p.localLabel==='string'&&p.localLabel.trim())feeds.local='https://news.google.com/rss/search?q='+encodeURIComponent(p.localLabel.slice(0,100))+'&hl=en-US&gl=US&ceid=US:en';
      const result={};for(const [key,url]of Object.entries(feeds)){if(!await hasOrigin(url))throw Error('News permission is missing. Enable news in Companion settings.');result[key]=await fetchText(url);}return result;
    }
    default:throw Error('Unsupported action.');
  }
}
chrome.runtime.onMessage.addListener((message,sender,reply)=>{
  handle(message,sender).then(data=>reply({ok:true,data}),e=>reply({ok:false,error:e.message||'Request failed.'}));return true;
});
chrome.tabs.onRemoved.addListener(id=>{chrome.storage.session.remove(['player:'+id,'resume:'+id]);});
chrome.action.onClicked.addListener(()=>chrome.runtime.openOptionsPage());

chrome.runtime.onInstalled.addListener(()=>{updatePlayerScripts().catch(()=>{});});
chrome.runtime.onStartup.addListener(()=>{updatePlayerScripts().catch(()=>{});});
