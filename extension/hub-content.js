(() => {
  const origins=['http://localhost:4173','http://127.0.0.1:4173','http://localhost:3000','http://127.0.0.1:3000','https://narbehouse.github.io','https://bennyshub.com','https://www.bennyshub.com','https://narbehouse.com','https://www.narbehouse.com'];
  if(!origins.includes(location.origin)||!location.pathname.startsWith('/bennyshub/'))return;
  // A live content-script reply identifies the Hub without broad tab URL access.
  chrome.runtime.onMessage.addListener((message,sender,reply)=>{
    if(sender.id!==chrome.runtime.id||message?.protocol!==1)return;
    if(message.action==='HUB_PING'){reply({url:location.href});return;}
    if(window===window.top&&['COMMUNICATION_HELP','COMMUNICATION_HELP_CANCEL'].includes(message.action)){
      const p=message.payload;
      if(typeof p?.id!=='string'||!/^[-\w]{1,80}$/.test(p.id))return;
      const post=action=>window.postMessage({channel:'benny-companion-help-request',id:p.id,action,deadline:p.deadline},location.origin);
      if(message.action==='COMMUNICATION_HELP_CANCEL'){post('cancel');reply({cancelled:true});return;}
      let timer;
      const cleanup=()=>{clearTimeout(timer);window.removeEventListener('message',receive);};
      const receive=event=>{if(event.source===window&&event.origin===location.origin&&event.data?.channel==='benny-companion-help-response'&&event.data.id===p.id){cleanup();reply(event.data.data);}};
      window.addEventListener('message',receive);
      timer=setTimeout(()=>{cleanup();post('cancel');reply({enabled:true,reason:'error',error:'The Hub did not finish the Help request. Return to the Hub and check Speakers.'});},46000);
      post('help');return true;
    }
    if(message.action==='STREAM_POSITION'&&window===window.top){
      try{
        const progress=message.progress,active=JSON.parse(localStorage.getItem('benny-web:v1:streaming.activePlayback')||'null');
        if(!active||active.playbackId!==progress?.playbackId||typeof active.show!=='string'){reply({saved:false});return;}
        const url=new URL(progress.url);if(url.protocol!=='https:'||url.username||url.password)throw Error('Invalid playback URL');
        const name=active.show.toLowerCase().trim(),storageKey='benny-web:v1:streaming.lastWatched';
        const records=JSON.parse(localStorage.getItem(storageKey)||'{}');
        Object.defineProperty(records,name,{value:progress.savedProgress||{url:url.href,season:active.season??-1,episode:active.episode??-1,timestamp:Date.now()},enumerable:true,writable:true,configurable:true});
        localStorage.setItem(storageKey,JSON.stringify(records));reply({saved:true});
      }catch{reply({saved:false});}
    }
  });
  const allowed=new Set(['HELLO','SETTINGS_RETURN','OPEN_STREAM','OPEN_OPTIONS','STREAM_PROGRESS','SYNC_SCAN','CALENDAR_WEEK','NEWS','JOURNAL_STATUS','JOURNAL_READ','JOURNAL_MIGRATE','JOURNAL_PUT','JOURNAL_DELETE','JOURNAL_DRAFT','JOURNAL_RESTORE','JOURNAL_BACKUP_MARK','JOURNAL_CLEAR','APP_DATA_STATUS','APP_DATA_READ','APP_DATA_MIGRATE','APP_DATA_WRITE','APP_DATA_RESTORE','APP_DATA_CLEAR']);
  window.addEventListener('message',async event=>{
    const m=event.data;
    if(event.source!==window||event.origin!==location.origin||m?.channel!=='benny-hub-request'||m.protocol!==1||typeof m.id!=='string'||m.id.length>80||!allowed.has(m.action))return;
    let response;
    try{ response=await chrome.runtime.sendMessage({action:m.action,payload:m.payload,protocol:1}); }
    catch{response={ok:false,error:'Companion unavailable. Enable or reload it, then reload this page.'};}
    window.postMessage({channel:'benny-hub-response',id:m.id,protocol:1,response},location.origin);
  });
})();
