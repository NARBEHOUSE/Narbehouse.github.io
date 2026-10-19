/* Hub entry points only. Apps keep their own Enter hold behavior. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;else root.NarbeHubToggles=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  const actions=new WeakMap();
  function bind(button,change){
    const click=()=>{if(!button.disabled)return change(1);};
    actions.set(button,change);button.dataset.hubCycle='true';
    button.addEventListener('click',click);
    return ()=>{button.removeEventListener('click',click);actions.delete(button);delete button.dataset.hubCycle;};
  }
  function create({current,owns,settings,holdThreshold}){
    let held=null,timer=null,revision=0;
    function cancel(){revision++;clearTimeout(timer);timer=null;held=null;}
    const valid=press=>held===press&&owns()&&current()===press.button&&!press.button.disabled&&press.button.isConnected!==false;
    function repeat(press){
      if(!valid(press)){if(held===press)press.consumed=true;return;}
      press.consumed=true;
      const token=revision,began=Date.now(),ticket=actions.get(press.button)(-1);
      const schedule=result=>{
        if(token!==revision||!valid(press))return;
        const interval=settings().scanInterval;
        const delay=result?.started?interval:Math.max(0,interval-(Date.now()-began));
        timer=setTimeout(()=>repeat(press),delay);
      };
      // The voice manager owns the bounded speech ticket. Slow/failing speech
      // must not block release, focus loss or a new gesture.
      if(settings().waitForSpeech&&ticket?.finished)Promise.resolve(ticket.finished).then(schedule,()=>schedule());
      else schedule();
    }
    return {
      begin(){
        cancel();const button=current();
        if(!button||!actions.has(button)||button.disabled)return;
        const press=held={button,consumed:false};timer=setTimeout(()=>repeat(press),holdThreshold);
      },
      release(){const consume=!!held&&(held.consumed||!valid(held));cancel();return consume;},
      cancel
    };
  }
  return {bind,create};
});
