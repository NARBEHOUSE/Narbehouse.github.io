// A managed top-frame player can request only the fixed Help message, on its
// original Hub. Await real completion; cancellation never means default playback.
export function createPlayerHelp({managed,hubLocation,sameHub}){
  const active=new Map();
  async function cancel(tabId,id){
    const entry=active.get(tabId);if(!entry||(id&&entry.id!==id))return;
    active.delete(tabId);
    if(entry.hubTab!==undefined)void chrome.tabs.sendMessage(entry.hubTab,{protocol:1,action:'COMMUNICATION_HELP_CANCEL',payload:{id:entry.id}},{frameId:0}).catch(()=>{});
  }
  async function speak(sender,p={}){
    if(!sender.tab||sender.frameId!==0||typeof p.id!=='string'||!/^[-\w]{1,80}$/.test(p.id))throw Error('Invalid Help request.');
    const tabId=sender.tab.id,previous=active.get(tabId);
    // Mark immediately so an earlier slow authorization cannot speak afterward.
    const entry={id:p.id};active.set(tabId,entry);
    try{
      const session=await managed(sender);
      if(active.get(tabId)!==entry)return {enabled:true,reason:'cancelled'};
      entry.hubTab=session.hubTab;
      if(previous?.hubTab!==undefined)void chrome.tabs.sendMessage(previous.hubTab,{protocol:1,action:'COMMUNICATION_HELP_CANCEL',payload:{id:previous.id}},{frameId:0}).catch(()=>{});
      const url=await hubLocation(session.hubTab);
      if(!sameHub(url,session))throw Error('The original Hub page changed. Return to the Hub to use Help.');
      if(active.get(tabId)!==entry)return {enabled:true,reason:'cancelled'};
      const result=await chrome.tabs.sendMessage(session.hubTab,{protocol:1,action:'COMMUNICATION_HELP',payload:{id:entry.id,deadline:Date.now()+45000}},{frameId:0});
      if(active.get(tabId)!==entry)return {enabled:true,reason:'cancelled'};
      if(typeof result?.enabled!=='boolean')throw Error('Reload the Hub and Companion to use speaker Help.');
      return result;
    }catch(e){if(active.get(tabId)!==entry)return {enabled:true,reason:'cancelled'};await cancel(tabId,entry.id);throw Error(e.message||'Return to the Hub to check speaker Help.');}
    finally{if(active.get(tabId)===entry)active.delete(tabId);}
  }
  return {speak,cancel};
}
