(() => {
  const origins=['http://localhost:4173','http://127.0.0.1:4173','http://localhost:3000','http://127.0.0.1:3000','https://narbehouse.github.io','https://bennyshub.com','https://www.bennyshub.com','https://narbehouse.com','https://www.narbehouse.com'];
  if(!origins.includes(location.origin)||!location.pathname.startsWith('/bennyshub/'))return;
  // A live content-script reply identifies the Hub without broad tab URL access.
  chrome.runtime.onMessage.addListener((message,sender,reply)=>{
    if(sender.id!==chrome.runtime.id||message?.protocol!==1||message.action!=='HUB_PING')return;
    reply({url:location.href});
  });
  const allowed=new Set(['HELLO','OPEN_STREAM','OPEN_OPTIONS','STREAM_PROGRESS','SYNC_SCAN','CALENDAR_WEEK','NEWS']);
  window.addEventListener('message',async event=>{
    const m=event.data;
    if(event.source!==window||event.origin!==location.origin||m?.channel!=='benny-hub-request'||m.protocol!==1||typeof m.id!=='string'||m.id.length>80||!allowed.has(m.action))return;
    let response;
    try{ response=await chrome.runtime.sendMessage({action:m.action,payload:m.payload,protocol:1}); }
    catch{response={ok:false,error:'Companion unavailable. Enable or reload it, then reload this page.'};}
    window.postMessage({channel:'benny-hub-response',id:m.id,protocol:1,response},location.origin);
  });
})();
