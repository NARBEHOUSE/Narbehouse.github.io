/* Speakers section uses the Hub's existing choice scanner. */
window.NarbeCommunicationSettings={mount({refreshScan,announce}){
  const manager=NarbeCommunicationSpeech,byId=id=>document.getElementById(id);
  function draw(){
    const s=manager.get();byId('speaker-mode-status').textContent=s.enabled?'On':'Off';byId('speaker-mode-toggle').setAttribute('aria-pressed',String(s.enabled));
    for(const id of ['speaker-output-toggle','speaker-voice-toggle','speaker-quality-toggle','speaker-find','speaker-test'])byId(id).disabled=!s.enabled||!s.supported;
    byId('speaker-quality-status').textContent=s.speechMode==='fast'?'Faster':'Natural';
    byId('speaker-voice-toggle').disabled=!s.enabled||!s.supported||s.speechMode==='fast';
    byId('speaker-voice-help').textContent=s.speechMode==='fast'?'Faster mode uses LJ, an English voice. Choose Natural for the original 14 voices.':'Cycle through 14 voices and hear a sample. The Voice setting above controls scanning.';
    const connected=s.outputs.some(d=>d.deviceId===s.sinkId);
    byId('speaker-output-status').textContent=s.sinkId?(s.sinkLabel||'Selected speaker')+(s.enabled&&!connected?' (unavailable)':''):'Not selected';
    byId('speaker-voice-status').textContent=s.voices.find(v=>v.id===s.voice).name+(s.enabled&&!s.voiceReady?(s.voicePreparing?' (preparing)':' (not ready)'):'');
    byId('speaker-test-title').textContent=['generating','playing'].includes(s.phase)?'Stop speaker':'Test speaker';
    byId('speaker-details').textContent=s.detail||(!s.supported?'Speaker selection is unavailable in this browser.':s.enabled?'Scanning uses the default output. Choose your communication speaker below.':'');
    byId('speaker-details').hidden=!byId('speaker-details').textContent;
    refreshScan();
  }
  function changed(){draw();const s=manager.get();announce(s.detail||('Speaker Mode '+(s.enabled?'on':'off')));}
  byId('speaker-mode-toggle').onclick=()=>{manager.toggle();changed();};
  byId('speaker-output-toggle').onclick=()=>{manager.cycleSpeaker();draw();if(manager.get().outputs.length){manager.preview();announce('Speaker: '+byId('speaker-output-status').textContent);}else announce(manager.get().detail);};
  byId('speaker-voice-toggle').onclick=()=>{manager.cycleVoice();draw();if(manager.get().sinkId)manager.preview();announce('Speaker voice: '+byId('speaker-voice-status').textContent);};
  byId('speaker-quality-toggle').onclick=()=>{manager.cycleMode();draw();if(manager.get().sinkId)manager.preview();announce('Speaker voice mode: '+byId('speaker-quality-status').textContent);};
  function closePermission(){byId('speaker-permission-dialog').hidden=true;refreshScan({restoreId:'speaker-find'});}
  byId('speaker-permission-cancel').onclick=()=>{closePermission();announce('Speaker setup cancelled.');};
  byId('speaker-permission-allow').onclick=()=>{closePermission();void manager.findSpeakers().then(changed);};
  byId('speaker-find').onclick=()=>{
    manager.stop();
    if(manager.get().outputs.length&&!navigator.mediaDevices.selectAudioOutput){void manager.refresh().then(()=>announce('Speaker list refreshed. Use Speaker to choose an output.'));return;}
    byId('speaker-permission-dialog').hidden=false;refreshScan({fresh:true});
    announce('The browser may ask for permission. Your switches may not work in that prompt; a caregiver may need to help. Cancel returns to Speakers.');
  };
  byId('speaker-test').onclick=()=>{
    if(['generating','playing'].includes(manager.get().phase)){manager.stop();return;}
    manager.preview();
  };
  manager.subscribe(draw);draw();
}};
