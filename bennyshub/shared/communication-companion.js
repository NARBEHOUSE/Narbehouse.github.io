/* The managed Companion forwards only the fixed Help action to its owning Hub.
   Speaker IDs and settings stay on this origin; no provider-page speech code. */
(() => {
  if(window!==window.top)return;
  const active=new Map(),cancelled=new Set();
  function cancel(id){
    cancelled.add(id);if(cancelled.size>64)cancelled.delete(cancelled.values().next().value);
    active.get(id)?.cancel();
  }
  async function receive(event){
    const m=event.data;
    if(event.source!==window||event.origin!==location.origin||m?.channel!=='benny-companion-help-request'||typeof m.id!=='string'||!/^[-\w]{1,80}$/.test(m.id)||!['help','cancel'].includes(m.action))return;
    if(m.action==='cancel'){cancel(m.id);return;}
    const reply=data=>window.postMessage({channel:'benny-companion-help-response',id:m.id,data},location.origin);
    if(cancelled.has(m.id)||active.has(m.id)||!Number.isFinite(m.deadline)||m.deadline<=Date.now()){reply({enabled:true,reason:'cancelled'});return;}
    const manager=window.NarbeCommunicationSpeech;
    if(!manager){reply({enabled:true,reason:'error',error:'Reload the Hub to use speaker Help.'});return;}
    if(!manager.isEnabled()){reply({enabled:false});return;}
    const owner={companionHelp:m.id};let expired=false;
    const ticket=manager._service.speak('I need help',owner);active.set(m.id,ticket);
    const timer=setTimeout(()=>{expired=true;ticket.cancel();},Math.min(45000,m.deadline-Date.now()));
    try{
      const result=await ticket.finished;
      reply({enabled:true,reason:expired?'error':result.reason,...(expired||result.reason==='error'?{error:expired?'Help could not start in time. Check Speaker Mode in the Hub and try again.':'Help was not spoken. Check the selected speaker in Hub Settings.'}:{})});
    }finally{clearTimeout(timer);active.delete(m.id);manager._service.releaseOwner(owner);}
  }
  window.addEventListener('message',receive);
  window.NarbePlatform.lifecycle.onClose(()=>{window.removeEventListener('message',receive);for(const ticket of active.values())ticket.cancel();active.clear();});
})();
