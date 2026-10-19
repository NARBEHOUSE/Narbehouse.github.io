/* Speakers section uses the Hub's existing choice scanner. */
window.NarbeCommunicationSettings={mount({refreshScan,announce,bindCycle}){
  const manager=NarbeCommunicationSpeech,byId=id=>document.getElementById(id);
  const bind=(id,change)=>bindCycle?bindCycle(byId(id),change):(byId(id).onclick=()=>change(1));
  let importing=false,removing=null;
  function draw(){
    const s=manager.get();byId('speaker-mode-status').textContent=s.enabled?'On':'Off';byId('speaker-mode-toggle').setAttribute('aria-pressed',String(s.enabled));
    for(const id of ['speaker-output-toggle','speaker-voice-toggle','speaker-voice-add','speaker-names','speaker-find','speaker-test'])byId(id).disabled=!s.enabled||!s.supported;
    byId('speaker-names-status').textContent=s.names.length?s.names.length+(s.names.length===1?' name':' names'):'None';
    const added=s.custom.find(v=>v.id===s.voice);
    byId('speaker-voice-remove').disabled=!s.enabled||!s.supported||!added;byId('speaker-voice-remove-status').textContent=added?added.name:'None selected';
    if(byId('speaker-quality-toggle'))byId('speaker-quality-toggle').disabled=!s.enabled||!s.supported;
    if(byId('speaker-quality-status'))byId('speaker-quality-status').textContent=s.speechMode==='fast'?'Faster':'Natural';
    if(byId('speaker-voice-help'))byId('speaker-voice-help').textContent=s.speechMode==='fast'?'Cycle through six Faster voices. Custom voices are available in Natural mode.':'Cycle through the voices and hear a sample. Custom voices come last. The Voice setting above controls scanning.';
    byId('speaker-voice-add').disabled=byId('speaker-voice-add').disabled||importing;
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
  bind('speaker-output-toggle',direction=>{manager.cycleSpeaker(direction);draw();if(manager.get().outputs.length){manager.preview();return announce('Speaker: '+byId('speaker-output-status').textContent);}return announce(manager.get().detail);});
  bind('speaker-voice-toggle',direction=>{manager.cycleVoice(direction);draw();if(manager.get().sinkId)manager.preview();return announce('Speaker voice: '+byId('speaker-voice-status').textContent);});
  if(byId('speaker-quality-toggle'))byId('speaker-quality-toggle').onclick=()=>{manager.cycleMode();draw();if(manager.get().sinkId)manager.preview();announce('Speaker voice mode: '+byId('speaker-quality-status').textContent);};
  function closePermission(){byId('speaker-permission-dialog').hidden=true;refreshScan({restoreId:'speaker-find'});}
  byId('speaker-permission-cancel').onclick=()=>{closePermission();announce('Speaker setup cancelled.');};
  byId('speaker-permission-allow').onclick=()=>{closePermission();void manager.findSpeakers().then(changed);};
  byId('speaker-find').onclick=()=>{
    manager.stop();
    if(manager.get().outputs.length&&!navigator.mediaDevices.selectAudioOutput){void manager.refresh().then(()=>announce('Speaker list refreshed. Use Speaker to choose an output.'));return;}
    byId('speaker-permission-dialog').hidden=false;refreshScan({fresh:true});
    announce('The browser may ask for permission. Your switches may not work in that prompt; a caregiver may need to help. Cancel returns to Speakers.');
  };
  // Custom voices from Voice Studio. Recorded voices get a consent reminder but are never refused:
  // someone rebuilding their own lost voice needs exactly this.
  function note(text){byId('speaker-voice-note').textContent=text;byId('speaker-voice-note').hidden=!text;announce(text);}
  function closeImport(){byId('speaker-voice-add-dialog').hidden=true;refreshScan({restoreId:'speaker-voice-add'});}
  byId('speaker-voice-add').onclick=()=>{manager.stop();byId('speaker-voice-add-dialog').hidden=false;refreshScan({fresh:true});announce('Adding a custom voice opens a file picker. Your switches may not work there, so a caregiver may need to help. Cancel returns to Speakers.');};
  byId('speaker-voice-add-cancel').onclick=()=>{closeImport();announce('Voice import cancelled.');};
  byId('speaker-voice-add-continue').onclick=()=>{closeImport();byId('speaker-voice-file').value='';byId('speaker-voice-file').click();};
  byId('speaker-voice-file').oncancel=()=>refreshScan({restoreId:'speaker-voice-add'});
  byId('speaker-voice-file').onchange=async()=>{
    const file=byId('speaker-voice-file').files[0];if(!file||importing)return;importing=true;draw();
    try{
      if(file.size>4_000_000)throw Error('That file is too large to be a voice file.');
      const voice=NarbeCustomVoices.parse(await file.text()),taken=new Set(manager.get().voices.map(v=>v.name));
      let name=voice.name;for(let n=2;taken.has(name);n++)name=voice.name.slice(0,36)+' '+n;
      if(manager.get().custom.length>=20)throw Error('This device already has 20 added voices. Remove one first.');
      const id=NarbeCustomVoices.newId();await NarbeCustomVoices.save(id,voice);
      if(!manager.addVoice({id,name,recorded:voice.recorded})){void NarbeCustomVoices.remove(id).catch(()=>{});throw Error('The voice could not be added.');}
      draw();
      note('Custom voice added and selected: '+name+'.'+(voice.recorded?' It was made from a recording of a real voice. Use it only with that person’s permission.':''));
      if(manager.get().sinkId)manager.preview();
    }catch(e){note('Could not add that voice file. '+(e.message||''));}
    importing=false;draw();refreshScan({restoreId:'speaker-voice-add'});
  };
  function closeRemove(restoreId){byId('speaker-voice-remove-dialog').hidden=true;refreshScan({restoreId});}
  byId('speaker-voice-remove').onclick=()=>{
    const added=manager.get().custom.find(v=>v.id===manager.get().voice);if(!added)return;
    removing=added;
    byId('speaker-voice-remove-text').textContent='Remove “'+added.name+'” from this device? Speaker voice goes back to Michael. Keep the voice file to add it again later.';
    byId('speaker-voice-remove-dialog').hidden=false;refreshScan({fresh:true});announce('Remove '+added.name+'? Cancel keeps it.');
  };
  byId('speaker-voice-remove-cancel').onclick=()=>{closeRemove('speaker-voice-remove');announce('Voice kept.');};
  byId('speaker-voice-remove-confirm').onclick=async()=>{
    const added=removing;removing=null;
    if(added){manager.removeVoice(added.id);try{await NarbeCustomVoices.remove(added.id);}catch(_){/* listed voice is gone; a leftover print is harmless */}}
    closeRemove('speaker-voice-toggle');draw();if(added)note('Removed '+added.name+'. Speaker voice is now '+manager.get().voices.find(v=>v.id===manager.get().voice).name+'.');
  };
  // Names to say: typed by a caregiver; Cancel and Save stay reachable by switch.
  function closeNames(){byId('speaker-names-dialog').hidden=true;refreshScan({restoreId:'speaker-names'});}
  byId('speaker-names').onclick=()=>{
    // No automatic focus in the text box: Space and Enter would type there, leaving a switch user unable to leave.
    byId('speaker-names-text').value=manager.get().names.join('\n');byId('speaker-names-dialog').hidden=false;refreshScan({fresh:true});
    announce('Names to say. A caregiver clicks the box, types one name per line, then chooses Save names. Cancel leaves it unchanged.');
  };
  byId('speaker-names-cancel').onclick=()=>{closeNames();announce('Names not changed.');};
  byId('speaker-names-save').onclick=()=>{
    const names=manager.setNames(byId('speaker-names-text').value.split(/[\n,;]+/));
    closeNames();draw();note(names.length?'Saved '+names.length+(names.length===1?' name: ':' names: ')+names.slice(0,5).join(', ')+(names.length>5?'…':'')+'.':'No names saved.');
  };
  byId('speaker-test').onclick=()=>{
    if(['generating','playing'].includes(manager.get().phase)){manager.stop();return;}
    manager.preview();
  };
  manager.subscribe(draw);draw();
}};
