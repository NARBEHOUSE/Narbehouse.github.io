/* Device-local public speech. A Hub and its same-origin tools share one worker/player. */
(function(){
  'use strict';
  const owner=window,scriptURL=document.currentScript.src;
  const supported=()=>isSecureContext&&typeof HTMLMediaElement.prototype.setSinkId==='function'&&!!navigator.mediaDevices?.enumerateDevices;
  const previewText='Hello from your communication speaker.';
  const voices=[
    {id:'am_michael',name:'Michael'},{id:'af_heart',name:'Heart'},{id:'bf_emma',name:'Emma'},{id:'bm_george',name:'George'},
    {id:'af_bella',name:'Bella'},{id:'af_nicole',name:'Nicole'},{id:'af_kore',name:'Kore'},{id:'af_sarah',name:'Sarah'},
    {id:'af_nova',name:'Nova'},{id:'af_aoede',name:'Aoede'},{id:'am_fenrir',name:'Fenrir'},{id:'am_puck',name:'Puck'},
    {id:'bf_isabella',name:'Isabella'},{id:'bm_fable',name:'Fable'}
  ];
  let service;
  try{if(parent!==window&&parent.location.origin===location.origin)service=parent.NarbeCommunicationSpeech?._service;}catch(_){/* standalone */}
  if(!service){
    let channel,worker,outputs=[],phase='idle',detail='',eventOwner,revision=0,permissionPending=false,readyVoice='',setupSeq=0;
    let preparing,prefetchOwner;
    const listeners=new Set(),pending=new Map();
    const normalize=v=>({version:1,enabled:v?.enabled===true,sinkId:typeof v?.sinkId==='string'&&!['default','communications'].includes(v.sinkId)?v.sinkId:'',sinkLabel:typeof v?.sinkLabel==='string'?v.sinkLabel:'',voice:voices.some(x=>x.id===v?.voice)?v.voice:'am_michael'});
    const store=NarbePlatform.settings.open({key:'narbe-communication-speaker',normalize,onChange:()=>{
      worker?.postMessage({type:'prefetch',voice:store.readCached().voice,texts:[]});
      revision++;channel?.stop();channel?.selectSink(store.readCached().sinkId);phase='idle';detail='';notify();
      if(store.readCached().enabled)void prepareVoice();
      else{failWorker('Speaker Mode off.');preparing=null;readyVoice='';}
    }});
    function snapshot(){return {...store.readCached(),supported:supported(),outputs:[...outputs],phase,detail,owner:eventOwner,permissionPending,voices,voiceReady:readyVoice===store.readCached().voice,voicePreparing:preparing?.voice===store.readCached().voice};}
    function notify(){for(const fn of [...listeners])fn(snapshot());}
    function report(value){phase=value.phase;detail=value.detail||'';eventOwner=value.owner;notify();}
    function failWorker(message){worker?.terminate();worker=null;readyVoice='';prefetchOwner=undefined;for(const p of pending.values())p.reject(Error(message));pending.clear();}
    function request(message){
      if(!worker){
        worker=new Worker(new URL('communication-worker.js',scriptURL),{type:'module'});
        worker.onmessage=({data:m})=>{
          if(m.progress){if(channel.active&&(!m.id||m.id===channel.active.id))report({phase:'generating',detail:m.progress,owner:channel.active.owner});else if(!channel.active&&store.readCached().enabled)report({phase:'loading',detail:m.progress});return;}
          const p=pending.get(m.id);if(!p)return;pending.delete(m.id);m.error?p.reject(Error(m.error)):p.resolve(m);
        };
        worker.onerror=()=>failWorker('The local voice could not load. Check your connection and try again.');
      }
      return new Promise((resolve,reject)=>{pending.set(message.id,{resolve,reject});try{worker.postMessage(message);}catch(e){pending.delete(message.id);reject(e);}});
    }
    function synthesize(id,text,voice){return request({id,text,voice});}
    async function prepareVoice(){
      const voice=store.readCached().voice,setupRevision=revision;if(!supported())return;
      if(preparing&&preparing.voice!==voice){worker?.postMessage({type:'cancel',id:preparing.id});pending.get(preparing.id)?.reject(Error('Voice changed.'));pending.delete(preparing.id);preparing=null;}
      if(readyVoice===voice)return;
      try{
        if(preparing?.voice!==voice){
          const id='prepare-'+(++setupSeq);let timer;
          const work=Promise.race([request({type:'prepare',id,voice,text:previewText}),new Promise((_,reject)=>{timer=setTimeout(()=>{failWorker('Voice setup took too long. Toggle Speaker Mode off and on to retry.');reject(Error('Voice setup took too long.'));},600000);})]).finally(()=>{clearTimeout(timer);if(preparing?.work===work)preparing=null;});
          preparing={voice,id,work};
        }
        if(!channel.active)report({phase:'loading',detail:'Loading selected voice. First setup may download voice files.'});
        const result=await preparing.work;
        if(result.ready&&revision===setupRevision&&store.readCached().enabled&&store.readCached().voice===voice){readyVoice=voice;if(!channel.active&&phase!=='error')report({phase:'ready',detail:'Voice ready. Changing the speaker or voice plays a sample.'});else notify();}
      }catch(e){if(revision===setupRevision&&store.readCached().enabled&&!channel.active)report({phase:'error',detail:'Voice setup failed. Check your connection, then toggle Speaker Mode off and on to retry.'});}
    }
    async function enumerate(){return (await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='audiooutput'&&d.deviceId&&!['default','communications'].includes(d.deviceId));}
    channel=new NarbeCommunicationChannel.Channel({synthesize,
      cancelSynthesis(id){worker?.postMessage({type:'cancel',id});pending.get(id)?.reject(Error('Cancelled.'));pending.delete(id);},
      enumerateOutputs:enumerate,createAudio:()=>new Audio(),createUrl:buffer=>URL.createObjectURL(new Blob([buffer],{type:'audio/wav'})),revokeUrl:url=>URL.revokeObjectURL(url),onState:report
    });
    channel.selectSink(store.readCached().sinkId);
    async function refresh(){
      if(!supported())return;
      try{outputs=await enumerate();await channel.devicesChanged();notify();}catch(_){report({phase:'error',detail:'Speakers could not be listed. Choose Find speakers in Hub Settings.'});}
    }
    async function findSpeakers(){
      if(!supported()||permissionPending||!store.readCached().enabled)return;
      permissionPending=true;const version=revision;notify();
      try{
        let chosen;
        // Call directly from the activation so browsers retain user activation.
        if(navigator.mediaDevices.selectAudioOutput)chosen=await navigator.mediaDevices.selectAudioOutput({deviceId:store.readCached().sinkId});
        else{
          // Chromium exposes named outputs after microphone permission. No recording:
          // immediately stop every track, including if Speaker Mode changed meanwhile.
          const stream=await navigator.mediaDevices.getUserMedia({audio:true});stream.getTracks().forEach(track=>track.stop());
        }
        if(version!==revision||!store.readCached().enabled)return;
        outputs=await enumerate();
        if(chosen&&outputs.some(d=>d.deviceId===chosen.deviceId))store.save({...store.readCached(),sinkId:chosen.deviceId,sinkLabel:chosen.label});
        report({phase:'ready',detail:outputs.length?'Speakers found. Use Speaker to choose an output, then Test Speaker.':'No speakers found. Connect the speaker in Windows, then try Find speakers again.'});
      }catch(e){report({phase:'error',detail:e.name==='NotAllowedError'?'Speaker access was not allowed. Use Find speakers to try again.':'Speakers could not be found. Connect an audio output and try again.'});}
      finally{permissionPending=false;notify();}
    }
    function prefetch(texts,who){
      if(!worker||!store.readCached().enabled||!Array.isArray(texts))return;
      if(texts.length&&readyVoice!==store.readCached().voice)return;
      if(!texts.length&&prefetchOwner!==who)return;
      prefetchOwner=texts.length?who:undefined;
      worker.postMessage({type:'prefetch',voice:store.readCached().voice,texts});
    }
    service={snapshot,prefetch,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},refresh,findSpeakers,
      toggle(){if(!supported()&&!store.readCached().enabled){report({phase:'error',detail:'Speaker Mode needs a desktop browser with audio output selection, on HTTPS or localhost.'});return;}store.save({...store.readCached(),enabled:!store.readCached().enabled});if(store.readCached().enabled)void refresh();},
      cycle(){if(!outputs.length){report({phase:'error',detail:'Choose Find speakers first, then allow the browser prompt.'});return;}const d=outputs[(outputs.findIndex(d=>d.deviceId===store.readCached().sinkId)+1)%outputs.length];store.save({...store.readCached(),sinkId:d.deviceId,sinkLabel:d.label||'Speaker'});},
      cycleVoice(){const prefs=store.readCached();store.save({...prefs,voice:voices[(voices.findIndex(v=>v.id===prefs.voice)+1)%voices.length].id});},
      speak(text,who){if(!supported()){report({phase:'error',detail:'Speaker selection is unavailable in this browser.',owner:who});return ended('error');}return channel.speak(text,{voice:store.readCached().voice,owner:who});},
      stop:who=>channel.stop(who),releaseOwner(who){prefetch([],who);channel.stop(who);if(eventOwner===who){eventOwner=undefined;phase='idle';detail='';notify();}},dispose(){channel.stop();failWorker('Closed.');store.dispose();listeners.clear();}
    };
    navigator.mediaDevices?.addEventListener('devicechange',()=>{if(store.readCached().enabled)void refresh();});
    NarbePlatform.lifecycle.onClose(()=>service.dispose());
    if(store.readCached().enabled){void refresh();void prepareVoice();}
  }
  function ended(reason){return {started:Promise.resolve(false),finished:Promise.resolve({reason,started:false}),cancel(){}};}
  let helpStatus,helpTimer,helpRevision=0;
  const api=window.NarbeCommunicationSpeech={
    _service:service,get:service.snapshot,subscribe:service.subscribe,isEnabled:()=>service.snapshot().enabled,
    toggle:service.toggle,cycleSpeaker:service.cycle,cycleVoice:service.cycleVoice,findSpeakers:service.findSpeakers,refresh:service.refresh,
    // A tool may update before its already-open Hub tab. Keep that old service usable until refresh.
    prefetch:texts=>service.prefetch?.(texts,owner),
    speak(text,fallback){
      if(!api.isEnabled())return fallback?.();
      // Communication is intentional output, independent of general/scan TTS.
      // Cancels only this page's previous private label, not future scanning.
      window.NarbeVoiceManager?.cancel();return service.speak(String(text),owner);
    },
    help(fallback,text='I need help'){
      if(!api.isEnabled())return fallback?.();
      if(!helpStatus){
        helpStatus=document.createElement('p');helpStatus.setAttribute('role','status');
        helpStatus.style.cssText='position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:2147483647;max-width:calc(100vw - 32px);margin:0;padding:10px 16px;border:2px solid white;border-radius:10px;background:#111;color:white;font:18px/1.4 system-ui,sans-serif;text-align:center;pointer-events:none';
        document.body.append(helpStatus);
      }
      const revision=++helpRevision;clearTimeout(helpTimer);helpStatus.hidden=false;helpStatus.textContent='Calling for help on the selected speaker…';
      const ticket=api.speak(text);
      ticket.finished.then(result=>{if(revision!==helpRevision)return;helpStatus.textContent=result.reason==='ended'?'Help message spoken.':result.reason==='error'?'Help was not spoken. Check the selected speaker in Hub Settings.':'Help message stopped.';helpTimer=setTimeout(()=>{helpStatus.hidden=true;},6000);});
      return ticket;
    },
    preview:()=>api.speak(previewText,null,{force:true}),
    stop:()=>service.stop(owner),
    bindStatus(element){
      const unsubscribe=service.subscribe(s=>{
        if(!s.enabled){element.hidden=true;element.textContent='';return;}
        if(s.owner&&s.owner!==owner)return;
        element.hidden=!s.detail;element.textContent=s.detail;
      });NarbePlatform.lifecycle.onClose(unsubscribe);return unsubscribe;
    }
  };
  NarbePlatform.lifecycle.onClose(()=>{service.releaseOwner(owner);clearTimeout(helpTimer);helpRevision++;helpStatus?.remove();});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')api.stop();});
})();
