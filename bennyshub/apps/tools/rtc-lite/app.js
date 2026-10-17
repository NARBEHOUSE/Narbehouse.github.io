  (() => {
    'use strict';
    const scan = window.NarbeScanManager, voice = window.NarbeVoiceManager;
    const byId = id => document.getElementById(id);
    const rows = [...document.querySelectorAll('.board-row')];
    const HOLD_MS = 3000; // Same Space reverse / Enter row-toggle gesture as RT Convo.
    let screen = 'welcome', choice, silentRestore = false, disposed = false;
    let spaceHeld = false, enterHeld = false, reversed = false, enterLong = false, brakeOwned = false;
    let reverseTimer, reverseInterval, enterTimer;

    function readSaved(key, fallback) {
      try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
    }
    // Read once before scanning begins. Loading preferences must never move a tile mid-scan.
    function loadStarters() {
      const saved = readSaved('conv_topicBoard', {}).General;
      if (!Array.isArray(saved)) return;
      const used = new Set([...document.querySelectorAll('[data-say]')].slice(0, 8).map(el => el.dataset.say.toLowerCase()));
      const phrases = saved.filter(text => {
        if (typeof text !== 'string' || !text.trim() || text.trim().length > 64 || text.trim().split(/\s+/).length > 8) return false;
        const key = text.trim().toLowerCase();
        if (used.has(key)) return false;
        used.add(key); return true;
      });
      // Fall back as a complete row, so an incomplete saved list cannot duplicate a fallback phrase.
      if (phrases.length < 4) return;
      phrases.slice(0, 4).forEach((text, i) => { const tile = byId('starter' + i); tile.textContent = tile.dataset.say = text.trim(); });
    }
    function applyTheme() {
      const hub = readSaved('narbe-hub-settings', {});
      const prefs = {...hub};
      const local = readSaved('rtcLite_settings', {});
      for(const [key,target] of [['theme','bgTheme'],['highlight','highlightColor'],['style','highlightStyle'],['size','uiSize']])if(local[key]&&local[key]!=='hub')prefs[target]=local[key];
      const colors = { blue:'#5bb0ff', green:'#00ff88', purple:'#cf9aff', red:'#ff648c', yellow:'#ffff00', white:'#ffffff' };
      const backgrounds = { ocean:'#001a2e', forest:'#0a1f0a', sunset:'#1a0f0a', midnight:'#0a0515', rose:'#1a0a14',
        sky:'#e0f2ff', cream:'#fff8e7', mint:'#e8fff0', lavender:'#f2eaff', peach:'#fff0e5' };
      const light = ['sky','cream','mint','lavender','peach'].includes(prefs.bgTheme);
      const styles = { '--bg':backgrounds[prefs.bgTheme] || '#0b0f14', '--card':light ? '#ffffff' : '#121822',
        '--text':light ? '#152438' : '#e8f0ff', '--muted':light ? '#43536a' : '#b6c6dd', '--border':light ? '#63748b' : '#526176',
        '--focus':colors[prefs.highlightColor] || '#ffff00', '--ui-scale':({large:1.1,larger:1.2,largest:1.3})[prefs.uiSize] || 1 };
      for (const [name, value] of Object.entries(styles)) document.documentElement.style.setProperty(name, value);
      document.body.classList.toggle('light-theme', light);
      document.body.classList.toggle('full-highlight', prefs.highlightStyle === 'full');fitKeyboardPredictions();fitBoardText();
    }
    function enabledButtons(parent) { return [...parent.querySelectorAll('button')].filter(el => !el.disabled && !el.hidden); }
    function buttonLabel(el) { return el.dataset.say || [...el.children].map(child => child.textContent.trim()).filter(Boolean).join(': ') || el.textContent.trim(); }
    function buttonItem(el) { return { id: el.id, element: el, label: () => buttonLabel(el) }; }
    function rootContext() {
      if (screen === 'board'||screen === 'keyboard') return { key:screen, kind:'rows', statusHost:byId(screen+'ScanStatus'),
        items:getRows().map(row => ({ id:row.id, element:row, label:() => row.dataset.rowLabel + '. ' + enabledButtons(row).map(buttonLabel).join('. ') })) };
      const panel = byId(screen + 'Screen');
      return { key:screen, kind:'flat', statusHost:byId(screen + 'ScanStatus'), items:enabledButtons(panel).map(buttonItem) };
    }
    function enterRow(rowId) {
      const row = byId(rowId);
      if (!getRows().includes(row)||!enabledButtons(row).length) return;
      choice.enterGroup({ key:'cells:' + rowId, kind:'cells', rowId, statusHost:byId(screen+'ScanStatus'),
        items:enabledButtons(row).map(buttonItem) }, { wrap:true, backStop:true });
    }
    function restoreRow() {
      // Return before speaking the selected phrase, without narrating the whole row over it.
      silentRestore = true;
      try { if (choice.getState().depth) choice.back({ restore:true }); }
      finally { silentRestore = false; }
    }
    function clearHighlights() {
      document.querySelectorAll('.row-highlight,.scan-highlight').forEach(el => el.classList.remove('row-highlight','scan-highlight'));
    }
    function openScreen(next) {
      cancelInput();
      voice.cancel();
      if(screen==='keyboard'&&next!=='keyboard'){++predictionRevision;predictionAbort?.abort();clearTimeout(predictionTimer);pendingPredictions={};pendingPredictionContext={};contextState.keyboardRequest=null;refreshPredictionRow=null;}
      screen = next;
      document.querySelectorAll('.screen').forEach(el=>el.hidden=el.id!==screen+'Screen');
      updateSettings();
      choice.sync(rootContext(), { fresh:true });
      commitPending();
      fitKeyboardPredictions();fitBoardText();window.scrollTo(0, 0);
    }
    function updateSettings() {
      const prefs = scan.getSettings();
      const values = { speechSetting:voice.getSettings().ttsEnabled ? 'On' : 'Off',
        voiceSetting:voice.getVoiceDisplayName(voice.getCurrentVoice()),
        autoSetting:prefs.autoScan ? 'On — One Switch' : 'Off — Two Switches',
        sensitivitySetting:prefs.inputSensitivity + ' ms', speedSetting:prefs.scanInterval / 1000 + ' seconds' };
      for (const [id, value] of Object.entries(values)) byId(id).querySelector('.setting-value').textContent = value;
      byId('scanHint').textContent = prefs.autoScan ? 'Auto Scan · Enter selects' : 'Space moves · Enter selects';
      updateExtraSettings();
    }
    function speakTile(tile) {
      restoreRow();
      const text = tile.dataset.say;
      memory.add('user','board',text);
      byId('boardStatus').textContent = voice.getSettings().ttsEnabled ? 'Selected: ' + text : 'Speech is off. Turn it on in Settings.';
      // Owned speech lets Wait for Speech protect the selected phrase from the next scan label.
      choice.announce(text);
    }
    async function exitApp() {
      if (disposed) return;
      cancelInput();
      choice.sync(null);
      voice.cancel();
      try { await window.NarbePlatform.settings.flush(); }
      catch { /* A settings write failure must not strand the user in the tool. */ }
      dispose();
      if (window.parent !== window) window.parent.postMessage({ action:'focusBackButton' }, '*');
      else if (window.electronAPI?.closeToolWindow) window.electronAPI.closeToolWindow();
      else window.location.href = '../../../index.html';
    }
    function activate(button) {
      if (button.disabled || disposed) return;
      if (button.dataset.say) { speakTile(button); return; }
      switch (button.id) {
        case 'continueButton': void continueApp(); return;
        case 'welcomeBackButton': case 'exitButton': void exitApp(); return;
        case 'settingsButton': openScreen('settings'); choice.announce('Settings.'); return;
        case 'settingsBackButton': openScreen('board'); choice.announce('Communication board.'); return;
        case 'speechSetting': voice.toggleTTS(); break;
        case 'voiceSetting': voice.cycleVoice(); break;
        case 'autoSetting': scan.toggleAutoScan(); break;
        case 'sensitivitySetting': scan.cycleInputSensitivity(); break;
        case 'speedSetting': scan.cycleScanSpeed(); break;
        default: void extendedAction(button).catch(e=>report(screen,e,true));return;
      }
      updateSettings();
      choice.announce(buttonLabel(button));
    }

    const C=window.RtcCore, memory=new C.Memory();
    const stored=readSaved('rtcLite_settings',{});
    const prefs={listening:true,stt:'whisper',ai:'cloud',serverUrl:'http://127.0.0.1:11434',serverType:'ollama',serverModel:'',cloudModel:'',justSaid:8,
      announcement:"I'm going to respond, but I want to type on my keyboard first.",profanity:!!readSaved('conv_settings',{}).allowProfanity,bio:'',theme:'hub',highlight:'hub',style:'hub',size:'hub',
      ...stored};
    const keyboardRows=[...document.querySelectorAll('.keyboard-row')];
    const sttOptions=['whisper','off'];
    if(window.SpeechRecognition||window.webkitSpeechRecognition)sttOptions.splice(-1,0,'browser');
    const retiredAI=prefs.ai==='webllm',retiredReady=prefs.aiReady==='webllm';
    if(retiredAI)prefs.ai='off';
    if(retiredReady)prefs.aiReady='';
    const aiOptions=['cloud','server',...(window.LanguageModel?['chrome']:[]),'off'];
    if(!sttOptions.includes(prefs.stt))prefs.stt=sttOptions[0];
    if(!aiOptions.includes(prefs.ai))prefs.ai='cloud';
    if(![6,8,10,12].includes(prefs.justSaid))prefs.justSaid=8;
    let defaults,consented=false,boardBusy=false,boardRevision=0,boardAbort,pendingBoard,shown=[],lastRoomId=0;
    let dictionaryFailed=false,keyboardStatusText='';
    let bioDraft=null,bioReturnPage='phrases',typed='',messageDraft='',editTarget=null,predictionRevision=0,predictionTimer,predictionAbort,pendingPredictions={},predictionShown=[],refreshPredictionRow=null;
    let testingSpeech=false,testTimer,setupSpeechBusy=false,setupAIBusy=false,setupEpoch=0,aiSetupEpoch=0,listenRevision=0,serverModels=[];
    const contextState={latest:0,boardUsed:0,keyboardUsed:0,boardRequest:null,keyboardRequest:null};
    let pendingBoardContext=0,pendingPredictionContext={},microphoneState='off',recentContext=false,contextNoticeTimer;
    let rtProfile={personality:readSaved('conv_personality',{}),bio:readSaved('conv_bio',''),interests:readSaved('conv_topicBoard',{})};
    const ai=new window.RtcAI(()=>prefs,message=>operation('ai',message),updateLoadControls);
    const speech=new window.RtcSpeech({getPrefs:()=>prefs,onProgress:message=>operation('listening',message),
      onStatus:updateMicrophone,onStateChange:updateLoadControls,
      onText:(text,at,latency)=>{if(testingSpeech){byId('speechTestResult').textContent='Heard: '+text+(latency==null?'':' · Recognition: '+(latency/1000).toFixed(2)+' seconds');}
        else if(!disposed&&String(text).trim()){memory.add('room','speech',text,at);showLastHeard(text,at);if(screen==='keyboard'&&!editTarget)requestPredictions();}}
    });
    // Observe the platform's actual completion, not the voice manager's bounded scan-wait ticket.
    // This also covers scan narration, voice previews, and announcements longer than ten seconds.
    const platformSpeech=window.NarbePlatform.speech,originalSpeak=platformSpeech.speak;
    platformSpeech.speak=function(...args){speech.voiceStarted();let ticket;try{ticket=originalSpeak.apply(this,args);}catch(e){speech.voiceEnded();throw e;}
      Promise.resolve(ticket.finished).then(()=>speech.voiceEnded(),()=>speech.voiceEnded());return ticket;};
    function updateMicrophone(message,state='off'){
      microphoneState=state;
      for(const el of document.querySelectorAll('.mic-status')){el.textContent=message;el.title=message;el.setAttribute('aria-label',message);el.dataset.state=state;}
      const labels={listening:['●','LISTENING','Microphone is receiving audio'],off:['■','MIC OFF','Not listening'],paused:['Ⅱ','PAUSED','App speaking / audio paused'],starting:['…','STARTING','Waiting for microphone']};
      const [symbol,label,baseDetail]=labels[state]||labels.off;
      const detail=state==='listening'&&speech.processing?'Recognizing recent speech…':baseDetail;
      for(const el of document.querySelectorAll('.listening-indicator')){
        el.dataset.state=state;el.title=message;el.setAttribute('aria-label',message);
        el.querySelector('.listening-symbol').textContent=symbol;el.querySelector('.listening-label').textContent=label;
        el.querySelector('.listening-detail').textContent=detail;
      }
      renderContextStatus();
    }
    function renderContextStatus(){
      for(const surface of ['board','keyboard']){
        const bar=byId(surface+'Context'),latest=contextState.latest,used=contextState[surface+'Used'];
        const unused=latest>used;let label=latest?(unused?'NEW CONTEXT #':'CONTEXT #')+latest:'NO CONTEXT YET',hint='';
        if(!latest)hint=microphoneState==='listening'?'Waiting for speech':'Latest speech will appear here';
        else if(surface==='board'){
          hint=unused?(contextState.boardRequest===latest?'Updating responses…':pendingBoardContext===latest?'Ready after this row':'Choose GET / REFRESH'):'Responses updated';
          if(unused&&boardBusy&&contextState.boardRequest<latest)hint='Refresh again when ready';
        }else{
          hint=unused?(editTarget?'Available on the board':contextState.keyboardRequest===latest?'Updating predictions…':Object.values(pendingPredictionContext).includes(latest)?'Ready after this row':ai.isAvailable()?'Choose More to refresh':'AI not ready · dictionary words available'):'Predictions updated';
        }
        bar.dataset.contextState=!latest?'empty':unused?'new':'used';
        bar.dataset.recent=String(recentContext&&!!latest);
        bar.querySelector('.context-label').textContent=label;bar.querySelector('.context-hint').textContent=hint;
      }
    }
    function showLastHeard(text='',at=Date.now()){
      const words=String(text).trim().split(/\s+/),tail=(words.length>8?'… ':'')+words.slice(-8).join(' ');
      const label=text?'Last heard · '+new Date(at).toLocaleTimeString([],{hour:'numeric',minute:'2-digit',second:'2-digit'})+': '+tail:'Last heard: nothing yet';
      for(const el of document.querySelectorAll('.last-heard')){el.textContent=label;el.title=text?String(text):'';}
      clearTimeout(contextNoticeTimer);recentContext=!!text;
      if(text){contextState.latest++;contextNoticeTimer=setTimeout(()=>{recentContext=false;renderContextStatus();},5000);}
      else{Object.assign(contextState,{latest:0,boardUsed:0,keyboardUsed:0,boardRequest:null,keyboardRequest:null});pendingBoardContext=0;pendingPredictionContext={};}
      renderContextStatus();
    }
    function savePrefs(){try{localStorage.setItem('rtcLite_settings',JSON.stringify(prefs));return true;}catch{operation('settings','Settings could not be saved on this device.');return false;}}
    function operation(page,message){const el=byId(page+'Screen')?.querySelector('.operation-status');if(el)el.textContent=message;else byId('boardStatus').textContent=message;}
    function report(page,error,speak=false){const text=error?.name==='AbortError'?'Cancelled.':error?.message||String(error);operation(page,text);if(speak&&screen===page)choice.announce(text);}
    function getRows(){return screen==='keyboard'?keyboardRows:rows;}
    function effectiveBio(){return String(prefs.bioSet||prefs.bio?prefs.bio||'':rtProfile.bio||'');}
    function profile(){return {...rtProfile,bio:effectiveBio(),profanity:!!prefs.profanity};}
    function initDefaults(){
      const initial={general:[0,1,2,3].map(i=>byId('general'+i).dataset.say),specific:[0,1,2,3].map(i=>byId('starter'+i).dataset.say)};
      try{defaults=C.validateBoard({...prefs.defaults,summary:''});}catch{defaults=initial;}
      defaults={general:[...defaults.general],specific:[...defaults.specific]};renderBoard(defaults);
    }
    function renderBoard(data){for(const [key,prefix] of [['general','general'],['specific','starter']])data[key].forEach((text,i)=>{const el=byId(prefix+i);el.textContent=el.dataset.say=text;el.disabled=false;});fitBoardText();}
    function predictionFrozen(rowId){if(screen!=='keyboard')return true;const state=choice?.getState(),row=choice?.context?.rowId||state?.id;return row===rowId&&(state?.depth>0||state?.parked);}
    function boardFrozen(){if(screen!=='board')return true;const row=choice?.context?.rowId||choice?.getState()?.id;return ['generalRow','startersRow'].includes(row);}
    function commitPending(keepRefresh=false){
      if(pendingBoard&&!boardFrozen()){const data=pendingBoard;pendingBoard=null;renderBoard(data);contextState.boardUsed=Math.max(contextState.boardUsed,pendingBoardContext);pendingBoardContext=0;}
      for(const [rowId,words] of Object.entries(pendingPredictions)){
        if(predictionFrozen(rowId))continue;
        delete pendingPredictions[rowId];renderPredictionRow(rowId,words);contextState.keyboardUsed=Math.max(contextState.keyboardUsed,pendingPredictionContext[rowId]||0);delete pendingPredictionContext[rowId];
        if(refreshPredictionRow===rowId&&!keepRefresh){refreshPredictionRow=null;setKeyboardStatus(words.length?(rowId==='keyboardPredictionRow'?'Keyboard words ready.':'New predictions ready.'):'No different predictions found. Try another letter or use Keyboard words.');}
      }
      renderContextStatus();
    }
    function cancelRequests(){boardAbort?.abort();predictionAbort?.abort();clearTimeout(predictionTimer);++boardRevision;++predictionRevision;boardBusy=false;pendingBoard=null;pendingPredictions={};pendingBoardContext=0;pendingPredictionContext={};contextState.boardRequest=contextState.keyboardRequest=null;refreshPredictionRow=null;byId('getButton').textContent='GET / REFRESH';renderContextStatus();}
    async function getSuggestions(){
      restoreRow();if(boardBusy){choice.announce('Suggestions are still loading. You can use quick answers or the keyboard.');return;}
      predictionAbort?.abort();const revision=++boardRevision,snapshot=memory.snapshot(prefs.justSaid),contextVersion=contextState.latest;contextState.boardRequest=contextVersion;
      const newest=snapshot.recent.filter(s=>s.speaker==='room').at(-1)?.id||0;
      if(newest!==lastRoomId){shown=[];lastRoomId=newest;}
      const avoid=[...shown,...snapshot.recent.filter(s=>s.speaker==='user').map(s=>s.text)];
      boardBusy=true;boardAbort=new AbortController();byId('getButton').textContent='GET · THINKING…';byId('boardStatus').textContent='Thinking… Quick answers and keyboard are ready.';
      renderContextStatus();
      for(const el of [...byId('generalRow').children,...byId('startersRow').children]){el.disabled=true;el.textContent='Thinking…';}
      try{
        const result=await ai.getSuggestions(snapshot,profile(),avoid,boardAbort.signal);
        if(revision!==boardRevision||disposed)return;
        if(result.summaryValid!==false)memory.commit(result.summary,snapshot);shown.push(...result.general,...result.specific);shown=shown.slice(-160);
        pendingBoard=result;pendingBoardContext=result.savedCount===8?0:contextVersion;byId('boardStatus').textContent=result.savedCount?'Suggestions ready, including '+result.savedCount+' saved phrases. Choose what you want to say.':'Suggestions ready. Choose what you want to say.';
      }catch(e){if(revision!==boardRevision||disposed)return;pendingBoard=defaults;pendingBoardContext=0;byId('boardStatus').textContent=e.message+' Saved phrases are ready.';if(screen==='board'&&choice.getState()?.id==='controlsRow')choice.announce(byId('boardStatus').textContent);}
      finally{if(revision===boardRevision){boardBusy=false;contextState.boardRequest=null;byId('getButton').textContent='GET / REFRESH';commitPending();}}
    }
    function updateExtraSettings(){
      const values={listeningSetting:prefs.listening?'On':'Off',sttSetting:speech.name(prefs.stt),aiSetting:({chrome:'Chrome local AI · Gemini Nano',cloud:'Cloud API · '+ai.cloudName(),server:'Local server API · '+(prefs.serverType==='openai'?'OpenAI compatible':'Ollama'),off:'Off'})[prefs.ai],serverTypeSetting:prefs.serverType==='openai'?'OpenAI compatible (LM Studio, etc.)':'Ollama',serverModelSetting:prefs.serverModel||'Load models, then choose one',
        windowSetting:prefs.justSaid+' seconds',profanitySetting:prefs.profanity?'Allowed':'Off',
        bioPage:effectiveBio()?'Bio saved':'Add personal background',announcementSetting:prefs.announcement,bioSetting:effectiveBio()?effectiveBio().slice(0,100)+(effectiveBio().length>100?'…':''):'Add personal background',
        themeSetting:prefs.theme,highlightSetting:prefs.highlight,styleSetting:prefs.style,sizeSetting:prefs.size};
      if(defaults)for(let i=0;i<8;i++)values['default'+i]=defaults[i<4?'general':'specific'][i%4];
      for(const [id,value] of Object.entries(values)){const el=byId(id)?.querySelector('.setting-value');if(el)el.textContent=String(value);}
      byId('aiDetails').textContent=prefs.ai==='cloud'?'Cloud API model: '+(ai.model()||'connect your own AI to get started')+'. Conversation text and profile are sent to this provider.':prefs.ai==='server'?'Server: '+prefs.serverUrl+' · Model: '+(prefs.serverModel||'choose a model')+'. Speech recognition stays separate.':prefs.ai==='off'?'AI predictions are off. Dictionary words still work.':prefs.ai==='chrome'?'Gemini Nano runs locally in supported desktop Chrome after download. It is not available to websites in Chrome on Android or iPhone/iPad. No cloud API key or cloud quota is used.':'Choose Cloud API, a local AI server, or supported desktop Chrome AI.';
      byId('chromeAvailability').textContent=window.LanguageModel?'This browser exposes the local AI interface. Choose Load AI model to check model availability.':window.electronAPI?'Chrome’s Gemini Nano is not included in the Windows Hub (Electron). Open RTC Lite in Google Chrome to check its availability, or choose another AI option here.':'Chrome local AI requires supported desktop Chrome. Chrome on Android and iPhone/iPad cannot use Gemini Nano for this website. Choose Cloud API for mobile AI suggestions.';
      updateLoadControls();
    }

    function updateLoadControls(){
      if(disposed)return;
      const paint=(id,state,label,detail)=>{
        const button=byId(id);button.dataset.loadState=state;
        button.setAttribute('aria-busy',String(state==='loading'));
        button.querySelector('.setting-label').textContent=label;
        button.querySelector('.setting-value').textContent=detail;
      };
      const aiLocal=prefs.ai==='chrome',aiLoading=setupAIBusy||ai.loading;
      if(prefs.ai==='off')paint('setupAI','off','AI is off','Choose an AI option above');
      else if(aiLoading)paint('setupAI','loading','Loading / preparing AI…','… Please wait · Cancel is available below');
      else if(aiLocal)paint('setupAI',ai.ready===prefs.ai?'ready':'needed',ai.ready===prefs.ai?'Reload AI model':'Load AI model',ai.ready===prefs.ai?'✓ Loaded · Ready to use':'○ Not loaded · Select here to load');
      else if(prefs.ai==='cloud')paint('setupAI',window.RtcByok.connection()?'ready':'needed',window.RtcByok.connection()?'Check API setup':'Set up API key',window.RtcByok.connection()?'✓ Worker connected · No local load needed':'○ Connection needed · Select here to configure');
      else paint('setupAI',prefs.serverModel?'ready':'needed',prefs.serverModel?'Check server connection':'Set up local AI server',prefs.serverModel?'✓ Model selected · Test AI to check responses':'○ Model needed · Select here to configure');
      const speechLocal=['parakeet','whisper'].includes(prefs.stt),speechReady=speech.ready===prefs.stt,speechLoading=setupSpeechBusy||speech.loading;
      if(prefs.stt==='off')paint('setupSpeech','off','Speech recognition is off','Choose a speech source above');
      else if(speechLoading)paint('setupSpeech','loading','Loading / preparing speech…','… Please wait · Cancel is available below');
      else paint('setupSpeech',speechReady?'ready':'needed',speechLocal?(speechReady?'Reload speech model':'Load speech model'):'Prepare speech service',
        speechReady?(speechLocal?'✓ Loaded':'✓ Prepared')+(prefs.listening?' · Listening enabled':' · Listening is off'):'○ '+(speechLocal?'Not loaded · Select here to load':'Not prepared · Select here to prepare'));
      byId('cancelAI').querySelector('.setting-label').textContent=aiLoading?'Cancel AI loading':'Unload local AI';
      byId('cancelAI').querySelector('.setting-value').textContent=aiLoading?'Stop the current setup':aiLocal&&ai.ready===prefs.ai?'Loaded · Select to unload':'No local AI model loaded';
      byId('cancelSpeech').querySelector('.setting-label').textContent=speechLoading?'Cancel speech loading':'Stop / unload speech';
      byId('cancelSpeech').querySelector('.setting-value').textContent=speechLoading?'Stop the current setup':speechReady?'Select to turn listening off and unload':'Microphone off · No speech model loaded';
    }
    function cycle(key,values){prefs[key]=values[(values.indexOf(prefs[key])+1)%values.length];savePrefs();updateSettings();}
    async function startListening(){if(!consented)return;const revision=++listenRevision;try{await speech.start();}catch(e){if(revision!==listenRevision||disposed)return;speech.status(speech.errorMessage(e));report('listening',e);}}
    async function continueApp(){
      consented=true;openScreen('board');
      void startListening();
      if(prefs.aiReady===prefs.ai&&prefs.ai==='chrome')ai.setup(false).catch(e=>report('ai',e));
    }
    async function setupSpeechModel(){
      if(setupSpeechBusy||speech.loading)return;const revision=++setupEpoch;setupSpeechBusy=true;updateSettings();operation('listening','Preparing selected speech model…');
      try{await speech.setup(true);if(revision!==setupEpoch)return;operation('listening','Model ready. Choose Test recognition to check this device.');if(screen==='listening')choice.announce('Speech model ready. Choose Test recognition.');if(prefs.listening)void startListening();}
      catch(e){if(revision===setupEpoch){speech.status(speech.errorMessage(e));report('listening',e,true);}}
      finally{if(revision===setupEpoch){setupSpeechBusy=false;updateSettings();}}
    }
    async function testRecognition(){
      if(setupSpeechBusy)return;clearTimeout(testTimer);testingSpeech=true;
      byId('speechTestResult').textContent='Say: “Can we go to the park after lunch?” Then choose Finish recognition test. Listening for up to 30 seconds.';
      const wasListening=prefs.listening;prefs.listening=true;
      try{await speech.start();testTimer=setTimeout(()=>void finishRecognitionTest(),30000);}catch(e){speech.status(speech.errorMessage(e));report('listening',e,true);testingSpeech=false;}finally{prefs.listening=wasListening;}
    }
    async function finishRecognitionTest(){clearTimeout(testTimer);await speech.stop();testingSpeech=false;if(prefs.listening)void startListening();operation('listening','Test finished. Compare what you said with the words above.');}
    async function setupAIModel(){
      if(setupAIBusy||ai.loading)return;const revision=++aiSetupEpoch,provider=prefs.ai;setupAIBusy=true;updateSettings();operation('ai','Preparing selected AI…');
      try{await ai.setup(true);if(revision!==aiSetupEpoch||provider!==prefs.ai||disposed)return;prefs.aiReady=prefs.ai;savePrefs();operation('ai','AI ready. Try Test selected AI to check its speed.');if(screen==='ai')choice.announce('AI ready.');}
      catch(e){if(revision===aiSetupEpoch)report('ai',e,true);}finally{if(revision===aiSetupEpoch){setupAIBusy=false;updateSettings();}}
    }
    async function testAIModel(){
      const sample=new C.Memory();sample.add('room','speech','Would you like to go to the park after lunch?');const start=performance.now();
      operation('ai','Testing with a sample conversation…');
      try{const result=await ai.getSuggestions(sample.snapshot(),{profanity:false},[],new AbortController().signal);byId('aiTestResult').textContent=((performance.now()-start)/1000).toFixed(2)+' seconds · '+result.general.concat(result.specific).join(' · ');}
      catch(e){report('ai',e,true);}
    }
    function showBioEditor(){
      openScreen('bio');byId('bioInput').value=bioDraft??effectiveBio();
      byId('bioBack').querySelector('.setting-label').textContent=bioReturnPage==='settings'?'Back to settings':'Back to my phrases & profile';
    }
    function saveBio(value){
      const before={bio:prefs.bio,bioSet:prefs.bioSet};prefs.bio=String(value).slice(0,1500).trim();prefs.bioSet=true;
      if(!savePrefs()){Object.assign(prefs,before);operation('bio','Bio could not be saved on this device. Your draft is still here.');return false;}
      bioDraft=prefs.bio;byId('bioInput').value=bioDraft;updateSettings();operation('bio','Bio saved. AI suggestions will use this background.');return true;
    }
    async function startKeyboard(target=null){
      if(!target){restoreRow();const ticket=choice.announce(prefs.announcement);memory.add('user','keyboard',prefs.announcement);const finished=await ticket?.finished;if(disposed||screen!=='board'||finished?.reason==='cancelled')return;}
      editTarget=target;typed=target?target.value:messageDraft;predictionShown=[];
      openScreen('keyboard');byId('keyboardTitle').textContent=target?target.label:'Keyboard';byId('typedText').dataset.actionLabel=target?'SELECT TO SAVE':'SELECT TO SPEAK';byId('typedText').setAttribute('aria-label',target?'Save edited text':'Speak typed message');byId('keyboardMessageRow').dataset.rowLabel=target?'Save edited text':'Speak message';changedTyping();
    }

    function fitBoardText(){
      if(byId('boardScreen').hidden)return;
      for(const el of document.querySelectorAll('#board .tile')){
        el.style.fontSize='';
        let size=Math.floor(parseFloat(getComputedStyle(el).fontSize));
        while(size>10&&(el.scrollHeight>el.clientHeight||el.scrollWidth>el.clientWidth))el.style.fontSize=--size+'px';
      }
    }
    function fitKeyboardPredictions(){
      if(byId('keyboardScreen').hidden)return;
      for(const el of document.querySelectorAll('.prediction-row .key')){
        el.style.fontSize='';
        let size=Math.floor(parseFloat(getComputedStyle(el).fontSize));
        while(size>6&&(el.scrollHeight>el.clientHeight||el.scrollWidth>el.clientWidth))el.style.fontSize=--size+'px';
      }
    }
    function renderPredictionRow(rowId,words){
      const buttons=[...byId(rowId).querySelectorAll('button:not([id^="morePredictions"])')];
      buttons.forEach((el,i)=>{const text=words[i]||'';el.textContent=text||'—';el.dataset.prediction=text;el.disabled=!text;});fitKeyboardPredictions();
    }
    function setKeyboardStatus(message){
      keyboardStatusText=message;
      byId('keyboardStatus').textContent=(dictionaryFailed?'Keyboard dictionary could not load. Reload RTC Lite to retry. ':'')+message;
    }
    function publishPredictions(request){
      if(request.revision!==predictionRevision||screen!=='keyboard')return;
      const result=C.predictions({
        words:[...request.model.words,...request.local.words],
        phrases:[...request.model.phrases,...request.local.phrases]
      },request.text,request.avoid);
      predictionShown.push(...result.words,...result.phrases);predictionShown=predictionShown.slice(-80);
      if(!request.moreRow||request.moreRow==='predictionRow0'&&result.words.length){pendingPredictions.predictionRow0=result.words;pendingPredictionContext.predictionRow0=request.model.words.length?request.contextVersion:0;}
      if(!request.moreRow||request.moreRow==='predictionRow1'&&result.phrases.length){pendingPredictions.predictionRow1=result.phrases;pendingPredictionContext.predictionRow1=request.model.phrases.length?request.contextVersion:0;}
      commitPending(!request.complete);
    }
    async function regularPredictions(request){
      const {revision,text}=request;let words=[],phrases=[],failed=false;
      try{
        words=await window.predictionSystem.getHybridPredictions(text,{dictionaryOnly:true});
        failed=!!window.predictionSystem.loadError;
        phrases=await window.predictionSystem.getPhrasePredictions(text,words,20);
      }catch{failed=true;}
      if(revision!==predictionRevision||screen!=='keyboard')return;
      dictionaryFailed=failed;setKeyboardStatus(keyboardStatusText);
      request.local={words:words.map(w=>String(w).toLowerCase()),phrases:phrases.map(p=>String(p).toLowerCase())};
      pendingPredictions.keyboardPredictionRow=C.predictions({words:request.local.words,phrases:[]},text,[],6,true).words;
      publishPredictions(request);
    }
    function requestPredictions(moreRow=null,selectedRow=null){
      clearTimeout(predictionTimer);predictionAbort?.abort();const revision=++predictionRevision,text=typed;
      pendingPredictions={};pendingPredictionContext={};contextState.keyboardRequest=null;refreshPredictionRow=moreRow||selectedRow;
      for(const id of ['morePredictions0','morePredictions1'])byId(id).setAttribute('aria-busy','false');
      const avoid=moreRow?[...new Set([...predictionShown,...[...document.querySelectorAll('.ai-prediction-row [data-prediction]')].map(el=>el.dataset.prediction).filter(Boolean)])]:[];
      const available=ai.isAvailable();
      const request={revision,text,avoid,moreRow,contextVersion:0,complete:!available,model:{words:[],phrases:[]},local:{words:[],phrases:[]}};
      if(!moreRow){
        predictionShown=[];
        pendingPredictions.predictionRow0=[];pendingPredictions.predictionRow1=[];pendingPredictions.keyboardPredictionRow=[];commitPending(true);
      }
      void regularPredictions(request);
      if(!available){
        if(selectedRow!=='keyboardPredictionRow')refreshPredictionRow=null;
        setKeyboardStatus('Using keyboard dictionary predictions. Set up AI in Settings for conversation context.');
        return;
      }
      setKeyboardStatus(moreRow?'Finding different AI predictions…':'Updating AI predictions… Dictionary completions are available while you wait.');
      predictionTimer=setTimeout(async()=>{
        predictionAbort=new AbortController();
        for(const id of ['morePredictions0','morePredictions1'])byId(id).setAttribute('aria-busy','true');
        try{
          request.contextVersion=editTarget?0:contextState.latest;contextState.keyboardRequest=request.contextVersion;renderContextStatus();
          const raw=await ai.predictWords(memory.snapshot(prefs.justSaid),profile(),text,avoid,predictionAbort.signal,moreRow==='predictionRow0'?'words':moreRow==='predictionRow1'?'phrases':'both',editTarget?.key||'conversation');
          if(revision!==predictionRevision||screen!=='keyboard')return;
          request.model=C.predictions(raw,text,avoid);request.complete=true;
          publishPredictions(request);
          setKeyboardStatus('AI predictions ready; keyboard dictionary fills any gaps. Choose letters or a prediction.');
        }catch(e){
          if(revision!==predictionRevision||screen!=='keyboard')return;
          request.complete=true;refreshPredictionRow=null;publishPredictions(request);
          setKeyboardStatus((e.message||'AI predictions unavailable.')+' Using keyboard dictionary predictions.');
        }finally{if(revision===predictionRevision){contextState.keyboardRequest=null;for(const id of ['morePredictions0','morePredictions1'])byId(id).setAttribute('aria-busy','false');renderContextStatus();}}
      },moreRow?0:300);
    }
    function changedTyping(selectedRow=null){
      typed=typed.slice(0,editTarget?.key==='bio'?1500:600);byId('typedText').textContent=typed;byId('typedText').scrollTop=byId('typedText').scrollHeight;
      requestPredictions(null,selectedRow);
    }
    function finishTyping(){
      if(editTarget){
        const value=typed.trim(),target=editTarget;
        if(target.key==='bio'){
          if(!saveBio(value)){setKeyboardStatus('Bio could not be saved. Your draft is still here.');return;}
          editTarget=null;typed='';showBioEditor();choice.announce('Bio saved.');return;
        }
        if(target.key==='default'){
          const candidate={general:[...defaults.general],specific:[...defaults.specific],summary:''};candidate[target.index<4?'general':'specific'][target.index%4]=value;
          try{const checked=C.validateBoard(candidate);defaults={general:checked.general,specific:checked.specific};prefs.defaults=defaults;renderBoard(defaults);}
          catch{setKeyboardStatus('Use a different short phrase, up to 10 words. Keep Yes, No, Maybe and I don’t know on the quick-answer row.');choice.announce('Please use a different short phrase.');return;}
        }else{if(target.key==='announcement'&&!value){choice.announce('Please enter an announcement.');return;}prefs[target.key]=value;}
        savePrefs();editTarget=null;typed='';openScreen('phrases');choice.announce('Saved.');return;
      }
      const text=typed.trim();if(!text){choice.announce('Type a message first.');return;}
      restoreRow();memory.add('user','keyboard',text);messageDraft=typed;setKeyboardStatus('Spoken. Select the message again to repeat it.');choice.announce(text);
    }
    function leaveKeyboard(){if(editTarget?.key==='bio'){bioDraft=typed;editTarget=null;typed='';showBioEditor();operation('bio','Draft kept. Choose Save bio when ready.');choice.announce('About me. Draft kept.');return;}if(!editTarget)messageDraft=typed;const destination=editTarget?'phrases':'board';editTarget=null;openScreen(destination);choice.announce(destination==='board'?'Communication board.':'My phrases and profile.');}
    async function extendedAction(button){
      const id=button.id;
      if(button.dataset.key){restoreRow();const key=button.dataset.key;typed+=/^[A-Z]$/.test(key)?(!typed||/[.!?]\s*$/.test(typed)?key:key.toLowerCase()):key;changedTyping();return;}
      if(button.dataset.prediction){const rowId=button.parentElement.id;restoreRow();typed=C.insertPrediction(typed,button.dataset.prediction);changedTyping(rowId);return;}
      if(/^default\d$/.test(id)){const index=Number(id.slice(7));startKeyboard({key:'default',index,label:buttonLabel(button),value:defaults[index<4?'general':'specific'][index%4]});return;}
      const pages={listeningPage:'listening',aiPage:'ai',phrasesPage:'phrases',appearancePage:'appearance',memoryPage:'memory',keyPage:'key',serverPage:'server',helpButton:'help',
        listeningBack:'settings',aiBack:'settings',phrasesBack:'settings',appearanceBack:'settings',memoryBack:'settings',helpBack:'settings',keyBack:'ai',serverBack:'ai'};
      if(pages[id]){if(id==='listeningBack'&&testingSpeech)await finishRecognitionTest();openScreen(pages[id]);if(pages[id]==='key'){operation('key',window.RtcByok.connection()?'Connected: '+ai.cloudName()+' · '+ai.model():'Choose Connect AI to open secure key setup.');}if(pages[id]==='server'){byId('serverUrl').value=prefs.serverUrl;byId('serverModel').value=prefs.serverModel;}choice.announce(byId(pages[id]+'Screen').querySelector('h2').textContent);return;}
      switch(id){
        case 'getButton':void getSuggestions();return;
        case 'keyboardButton':await startKeyboard();return;
        case 'spaceKey':restoreRow();typed+=' ';changedTyping();return;
        case 'deleteKey':restoreRow();typed=typed.slice(0,-1);changedTyping();return;
        case 'clearTyping':restoreRow();typed='';changedTyping();return;
        case 'typedText':finishTyping();return;
        case 'keyboardBack':leaveKeyboard();return;
        case 'morePredictions0':case 'morePredictions1':restoreRow();requestPredictions(id==='morePredictions0'?'predictionRow0':'predictionRow1');return;
        case 'listeningSetting':++listenRevision;prefs.listening=!prefs.listening;savePrefs();await speech.stop('Microphone off · Listening is off in Settings');if(prefs.listening)void startListening();break;
        case 'restartSpeech':++listenRevision;prefs.listening=true;savePrefs();await speech.stop();updateSettings();void startListening();return;
        case 'sttSetting':++listenRevision;++setupEpoch;setupSpeechBusy=false;testingSpeech=false;clearTimeout(testTimer);await speech.cancelSetup();cycle('stt',sttOptions);operation('listening','If Load speech model is amber, select it to load the chosen model. Use Restart microphone to resume listening.');void startListening();break;
        case 'setupSpeech':if(prefs.stt==='off'){choice.announce('Choose a speech source above first.');return;}void setupSpeechModel();return;
        case 'cancelSpeech':++listenRevision;++setupEpoch;setupSpeechBusy=false;prefs.listening=false;testingSpeech=false;clearTimeout(testTimer);savePrefs();await speech.cancelSetup();operation('listening','Listening and download stopped.');break;
        case 'testSpeech':void testRecognition();return;
        case 'stopTestSpeech':void finishRecognitionTest();return;
        case 'windowSetting':cycle('justSaid',[6,8,10,12]);break;
        case 'aiSetting':++aiSetupEpoch;setupAIBusy=false;cancelRequests();renderBoard(defaults);ai.stop();cycle('ai',aiOptions);operation('ai','Use the colored Load AI model button for a local model, or configure an API option.');break;
        case 'setupAI':if(prefs.ai==='off'){choice.announce('Choose an AI option above first.');return;}if(prefs.ai==='cloud'&&!window.RtcByok.connection()){void extendedAction(byId('keyPage'));return;}if(prefs.ai==='server'&&!prefs.serverModel){void extendedAction(byId('serverPage'));return;}void setupAIModel();return;
        case 'cancelAI':++aiSetupEpoch;setupAIBusy=false;cancelRequests();renderBoard(defaults);ai.stop();prefs.aiReady='';savePrefs();updateSettings();operation('ai',['cloud','server'].includes(prefs.ai)?'No local model to unload. Choose Off under AI option to disable API suggestions.':'Local AI unloaded. Select Load AI model to use it again.');return;
        case 'testAI':void testAIModel();return;
        case 'connectCloud':
          try{operation('key','Key setup opened. Finish setup in that window.');await window.RtcByok.connect();++aiSetupEpoch;setupAIBusy=false;cancelRequests();ai.stop();prefs.ai='cloud';savePrefs();updateSettings();operation('key','Connected: '+ai.cloudName()+' · '+ai.model()+'. Use Test selected AI to check responses.');choice.announce('Cloud AI connected.');}
          catch(e){report('key',e,true);}return;
        case 'serverTypeSetting':cycle('serverType',['ollama','openai']);serverModels=[];operation('server','Choose Load installed models.');break;
        case 'loadServerModels':{
          try{
            const config={...prefs,serverUrl:byId('serverUrl').value};window.RtcServer.config(config);
            operation('server','Connecting to your AI server…');
            serverModels=await window.RtcServer.models(config,AbortSignal.timeout(10000));
            if(!serverModels.length)throw Error('No models installed. Install a model in your server, then load the list again.');
            byId('serverModel').value=serverModels.includes(byId('serverModel').value)?byId('serverModel').value:serverModels[0];
            byId('serverModelSetting').querySelector('.setting-value').textContent=byId('serverModel').value;
            operation('server','Found '+serverModels.length+' model(s). Choose a model, then Save and use server.');
          }catch(e){report('server',e,true);}return;
        }
        case 'serverModelSetting':if(serverModels.length){byId('serverModel').value=serverModels[(serverModels.indexOf(byId('serverModel').value)+1)%serverModels.length];byId('serverModelSetting').querySelector('.setting-value').textContent=byId('serverModel').value;choice.announce(byId('serverModel').value);}else operation('server','Choose Load installed models first, or enter the model name.');return;
        case 'saveServer':{
          try{
            const config={...prefs,serverUrl:byId('serverUrl').value,serverModel:byId('serverModel').value};
            const checked=window.RtcServer.config(config);if(!checked.model)throw Error('Choose or enter an installed model first.');
            ++aiSetupEpoch;setupAIBusy=false;cancelRequests();ai.stop();prefs.serverUrl=checked.base;prefs.serverModel=checked.model;prefs.ai='server';savePrefs();updateSettings();
            operation('server','Local server API selected. Use Test selected AI to check it.');choice.announce('Local server API selected.');
          }catch(e){report('server',e,true);}return;
        }
        case 'clearKey':try{await window.RtcByok.disconnect();cancelRequests();ai.stop();updateSettings();operation('key','RTC Lite disconnected. To delete the provider key, open key setup and choose Remove.');choice.announce('AI disconnected.');}catch(e){report('key',e,true);}return;
        case 'announcementSetting':startKeyboard({key:'announcement',label:'Keyboard announcement',value:prefs.announcement});return;
        case 'bioPage':case 'bioSetting':bioReturnPage=id==='bioPage'?'settings':'phrases';bioDraft=effectiveBio();showBioEditor();operation('bio','Type or paste here, or choose Use on-screen keyboard.');choice.announce('About me. Type or use the on-screen keyboard.');return;
        case 'bioKeyboard':bioDraft=byId('bioInput').value;startKeyboard({key:'bio',label:'Editing bio',value:bioDraft});return;
        case 'saveBio':if(saveBio(byId('bioInput').value))choice.announce('Bio saved.');return;
        case 'bioBack':bioDraft=null;openScreen(bioReturnPage);choice.announce(bioReturnPage==='settings'?'Settings.':'My phrases and profile.');return;
        case 'profanitySetting':prefs.profanity=!prefs.profanity;savePrefs();break;
        case 'restoreDefaults':defaults=structuredClone(C.DEFAULTS);prefs.defaults=defaults;savePrefs();cancelRequests();renderBoard(defaults);break;
        case 'themeSetting':cycle('theme',['hub','midnight','sky','forest','cream']);applyTheme();break;
        case 'highlightSetting':cycle('highlight',['hub','yellow','blue','green','purple','red','white']);applyTheme();break;
        case 'styleSetting':cycle('style',['hub','outline','full']);applyTheme();break;
        case 'sizeSetting':cycle('size',['hub','normal','large','larger']);applyTheme();break;
        case 'clearMemory':cancelRequests();memory.clear();shown=[];lastRoomId=0;messageDraft=typed='';showLastHeard();renderBoard(defaults);
          await speech.stop();if(prefs.listening)void startListening();operation('memory','Conversation cleared.');choice.announce('Conversation cleared.');return;
        case 'openHelp':if(window.electronAPI?.openExternal)window.electronAPI.openExternal('https://narbefoundation.org');else window.open('https://narbefoundation.org','_blank','noopener,noreferrer');return;
        default:return false;
      }
      updateSettings();choice.announce(buttonLabel(button));return true;
    }

    choice = window.NarbeChoiceScanAdapter.create({
      holdThreshold:HOLD_MS, stateHost:document.body,
      speak:text => silentRestore ? null : voice.speak(text),
      onSelect(item, state, context) {
        if (context.kind === 'rows' && item.id === 'keyboardMessageRow') finishTyping();
        else if (context.kind === 'rows') enterRow(item.id);
        else activate(item.element);
      },
      onHighlight(item, state, context) {
        clearHighlights();
        item?.element.classList.add(context.kind === 'rows' ? 'row-highlight' : 'scan-highlight');
        item?.element.scrollIntoView({ block:'nearest', inline:'nearest' });
        commitPending();
      }
    });
    document.querySelectorAll('button').forEach(button => button.addEventListener('click', () => {
      if (button.disabled || button.closest('[hidden]') || disposed) return;
      cancelInput();
      // A pointer is direct navigation. Align the parent silently, then perform the same action.
      silentRestore = true;
      try {
        if (screen === 'board'||screen === 'keyboard') { restoreRow(); silentRestore = true; choice.align(button.parentElement.id); }
        else choice.align(button.id);
      } finally { silentRestore = false; }
      activate(button);
    }));
    function cancelInput() {
      spaceHeld = enterHeld = reversed = enterLong = brakeOwned = false;
      clearTimeout(reverseTimer); clearInterval(reverseInterval); clearTimeout(enterTimer);
      choice?.cancelInput();
    }
    const switchCode = event => event.code === 'NumpadEnter' ? 'Enter' : event.code;
    document.addEventListener('keydown', event => {
      const code = switchCode(event);
      if (!['Space','Enter'].includes(code) || disposed || event.target.matches?.('input:not([readonly]),textarea')) return;
      event.preventDefault(); // Includes repeats, so a focused button never receives a native click.
      if (event.repeat) return;
      document.activeElement?.blur?.();
      if (code === 'Space' && !spaceHeld) {
        spaceHeld = true; reversed = false;
        brakeOwned = choice.brakePress();
        if (brakeOwned) return;
        choice.setInputHeld(true);
        reverseTimer = setTimeout(() => {
          if (!spaceHeld) return;
          reversed = true; choice.step(-1);
          reverseInterval = setInterval(() => { if (spaceHeld) choice.step(-1); }, scan.getScanInterval());
        }, HOLD_MS);
      } else if (code === 'Enter' && !enterHeld) {
        enterHeld = true; enterLong = false; choice.setInputHeld(true);
        if (!['board','keyboard'].includes(screen) || choice.getState().index < 0 || choice.getState().parked) return;
        enterTimer = setTimeout(() => {
          if (!enterHeld) return;
          enterLong = true;
          if (choice.getState().depth) choice.back({ restore:true });
          else enterRow(choice.getState().id);
        }, HOLD_MS);
      }
    });
    document.addEventListener('keyup', event => {
      const code = switchCode(event);
      if (!['Space','Enter'].includes(code) || disposed || event.target.matches?.('input:not([readonly]),textarea')) return;
      event.preventDefault();
      if (code === 'Space' && spaceHeld) {
        spaceHeld = false; clearTimeout(reverseTimer); clearInterval(reverseInterval);
        if (brakeOwned) { brakeOwned = false; choice.brakeRelease(); }
        else if (!reversed) choice.step(1);
        choice.setInputHeld(enterHeld);
      } else if (code === 'Enter' && enterHeld) {
        enterHeld = false; clearTimeout(enterTimer);
        if (!enterLong) choice.select();
        choice.setInputHeld(spaceHeld && !brakeOwned);
      }
    });
    let previousAuto = scan.getSettings().autoScan;
    function onScanSettings(settings) {
      if (previousAuto !== settings.autoScan) { previousAuto = settings.autoScan; cancelInput(); }
      if (spaceHeld && reversed) {
        clearInterval(reverseInterval);
        reverseInterval = setInterval(() => { if (spaceHeld) choice.step(-1); }, settings.scanInterval);
      }
      updateSettings();
    }
    function dispose() {
      if (disposed) return;
      cancelInput(); disposed = true;keyboardResize.disconnect(); cancelRequests();clearTimeout(testTimer);++setupEpoch;++aiSetupEpoch;speech.dispose();ai.stop();memory.clear();showLastHeard();bioDraft=null;byId('bioInput').value='';typed=messageDraft='';choice.dispose();voice.cancel();platformSpeech.speak=originalSpeak;
      scan.unsubscribe(onScanSettings); voice.offSettingsChange(updateSettings);
    }
    const keyboardResize=new ResizeObserver(()=>{fitKeyboardPredictions();fitBoardText();});keyboardResize.observe(byId('keyboardScreen'));keyboardResize.observe(byId('board'));
    scan.subscribe(onScanSettings);
    voice.onSettingsChange(updateSettings);
    window.addEventListener('storage', event => { if (event.key === 'narbe-hub-settings') applyTheme(); });
    window.addEventListener('blur', cancelInput);
    window.addEventListener('narbe-input-cancelled', cancelInput);
    document.addEventListener('visibilitychange', () => { if (document.hidden) cancelInput(); });
    window.addEventListener('pagehide', dispose, { once:true });
    loadStarters(); initDefaults(); applyTheme(); updateSettings();
    if(retiredAI||retiredReady)savePrefs();
    if(retiredAI)operation('ai','The previous browser model is no longer offered. AI is off; choose another option above. Saved phrases and keyboard words still work.');

    byId('bioInput').addEventListener('input',()=>{bioDraft=byId('bioInput').value;operation('bio','Unsaved changes. Choose Save bio when ready.');});
    byId('bioInput').addEventListener('focus',()=>{cancelInput();scan.resetInputState();choice.sync(null);voice.cancel();});
    byId('bioInput').addEventListener('blur',()=>{if(screen==='bio'&&!disposed)choice.sync(rootContext(),{fresh:true});});
    window.addEventListener('byok-change',()=>{if(!disposed)updateSettings();});
    window.addEventListener('storage',event=>{if(event.key?.startsWith('benny-byok-v1:')&&!disposed)updateSettings();});
    choice.sync(rootContext());
    choice.announce(byId('welcomeMessage').textContent + ' ' + byId('availabilityMessage').textContent);
  })();
