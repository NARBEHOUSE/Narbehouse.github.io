(() => {
  'use strict';
  if(window.BennyExtension)return;
  const pending=new Map();let state={connected:false,capabilities:[],version:''},checking;
  function publish(next){const changed=JSON.stringify(state)!==JSON.stringify(next);state=next;if(changed)window.dispatchEvent(new CustomEvent('benny-extension-change',{detail:state}));return state;}
  function request(action,payload={},timeout=30000){
    return new Promise((resolve,reject)=>{
      if(!['http:','https:'].includes(location.protocol)){reject(Error('Open the Hub through its website or local preview, not a file URL.'));return;}
      const id=crypto.randomUUID();const timer=setTimeout(()=>{pending.delete(id);reject(Error('Companion did not respond. Enable it, then reload this page.'));},timeout);
      pending.set(id,{resolve,reject,timer});window.postMessage({channel:'benny-hub-request',protocol:1,id,action,payload},location.origin);
    });
  }
  window.addEventListener('message',event=>{
    const m=event.data;if(event.source!==window||event.origin!==location.origin||m?.channel!=='benny-hub-response'||m.protocol!==1)return;
    const entry=pending.get(m.id);if(!entry)return;clearTimeout(entry.timer);pending.delete(m.id);
    if(m.response?.ok)entry.resolve(m.response.data);else {const error=Error(m.response?.error||'Companion request failed.');if(m.response?.code)error.code=m.response.code;entry.reject(error);}
  });
  async function check(){
    if(checking)return checking;
    checking=(async()=>{try{const hello=await request('HELLO',{},1600);if(hello.protocol!==1||!Array.isArray(hello.capabilities))throw Error('Incompatible companion.');return publish({connected:true,version:hello.version,capabilities:hello.capabilities});}catch{return publish({connected:false,version:'',capabilities:[]});}finally{checking=null;}})();return checking;
  }
  window.BennyExtension={request,check,get state(){return state;},supports:cap=>state.connected&&state.capabilities.includes(cap)};
  let subscribedScan=false,subscribedVoice=false,lastScanSettings='';
  async function syncScanSettings(){
    const scan=window.NarbeScanManager,voice=window.NarbeVoiceManager;
    if(scan&&!subscribedScan){subscribedScan=true;scan.subscribe(()=>syncScanSettings());}
    if(voice&&!subscribedVoice&&voice.onSettingsChange){subscribedVoice=true;voice.onSettingsChange(()=>syncScanSettings());}
    if(!state.connected||!scan)return;
    const v=voice?.getSettings()||{},settings={...scan.getSettings(),voice:v.voiceName||'',rate:v.rate||1,tts:v.ttsEnabled!==false};
    const signature=JSON.stringify(settings);if(signature===lastScanSettings)return;
    try{await request('SYNC_SCAN',settings,2000);lastScanSettings=signature;}catch{}
  }
  addEventListener('benny-extension-change',()=>{lastScanSettings='';syncScanSettings();});
  document.addEventListener('DOMContentLoaded',syncScanSettings,{once:true});
  addEventListener('focus',syncScanSettings);
  addEventListener('focus',check);document.addEventListener('visibilitychange',()=>{if(!document.hidden)check();});setInterval(()=>{if(!document.hidden)check();},5000);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',check,{once:true});else check();
})();
