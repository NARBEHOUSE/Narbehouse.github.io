(() => {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // DOM Elements
  const mainMenu = $("#mainMenu");
  const entriesScreen = $("#entriesScreen");
  const optionsScreen = $("#optionsScreen");
  const keyboardScreen = $("#keyboardScreen");
  const questionModal = $("#questionModal");
  const entryViewModal = $("#entryViewModal");
  const changeViewModal = $("#changeViewModal");
  const deleteConfirmModal = $("#deleteConfirmModal");
  const textBar = $("#textBar");
  const predictBar = $("#predictBar");
  const kb = $("#keyboard");
  const entriesList = $("#entriesList");
  const currentPeriodLabel = $("#currentPeriod");
  const datePreview = $("#datePreview");

  // Settings
  const defaultSettings = {
    theme: "default",
    highlightColor: "yellow"
  };

  let settings = loadSettings();
  function loadSettings() {
    try {
      const v = JSON.parse(localStorage.getItem("benny-web:v1:journal.settings"));
      // Filter out old settings keys if they exist
      const { scanSpeed, autoScan, ...valid } = v || {};
      return { ...defaultSettings, ...valid };
    } catch {
      return { ...defaultSettings };
    }
  }
  function saveSettings() {
    localStorage.setItem("benny-web:v1:journal.settings", JSON.stringify(settings));
  }

  // Theme management
  const themes = ["default", "light", "dark", "blue", "green", "purple", "orange", "red"];
  const highlightColors = ["yellow", "pink", "green", "orange", "black", "white", "purple", "red"];
  let currentThemeIndex = themes.indexOf(settings.theme) || 0;
  let currentHighlightIndex = highlightColors.indexOf(settings.highlightColor) || 0;

  function applyTheme(theme) {
    themes.forEach(t => document.body.classList.remove(`theme-${t}`));
    if (theme !== "default") {
      document.body.classList.add(`theme-${theme}`);
    }
    settings.theme = theme;
    saveSettings();
    updateDisplays();
  }

  function applyHighlightColor(color) {
    highlightColors.forEach(c => document.body.classList.remove(`highlight-${c}`));
    document.body.classList.add(`highlight-${color}`);
    settings.highlightColor = color;
    saveSettings();
    updateDisplays();
  }

  // Scan timing & Manager Integration
  let currentScanInterval = 1000;
  let isAutoScanning = false;

  if (window.NarbeScanManager) {
    const s = window.NarbeScanManager.getSettings();
    currentScanInterval = s.scanInterval;
    isAutoScanning = s.autoScan;

    window.NarbeScanManager.subscribe((s) => {
      currentScanInterval = s.scanInterval;
      const modeChanged=isAutoScanning!==s.autoScan;
      isAutoScanning = s.autoScan;
      if(modeChanged&&spacebarPressed&&!brakeOwned){clearTimeout(backwardTimeout);clearInterval(backwardScanInterval);backwardScanningOccurred=true;}

      if (isAutoScanning) {
        stopAutoScan();
        startAutoScan();
      } else {
        stopAutoScan();
      }
      updateDisplays();
    });
  }

  // Helper to get derived timing
  function getScanTimings() {
    return {
      forward: currentScanInterval,
      backward: currentScanInterval,
      longPress: 3000
    };
  }

  // The shared choice controller owns the automatic clock.

  // TTS
  function stripEmojis(text) {
    // Remove emojis, symbols, and special characters that TTS shouldn't read
    return text
      .replace(/[\u{1F300}-\u{1F9FF}]/gu, '') // Emojis
      .replace(/[\u{2600}-\u{26FF}]/gu, '')   // Misc symbols
      .replace(/[\u{2700}-\u{27BF}]/gu, '')   // Dingbats
      .replace(/[◀▶🔊🗑️⚙⏻✓✕⌫⌦—]/g, '')      // Specific icons used in the app
      .replace(/\s+/g, ' ')                    // Clean up extra spaces
      .trim();
  }

  function speak(text) {
    if(currentScreen==='optionsScreen'&&choiceScan?.active)return choiceScan.announce(stripEmojis(text));
    if (window.NarbeVoiceManager) {
      window.NarbeVoiceManager.cancel();
      let cleanText = stripEmojis(text);

      // Fix for short uppercase words (like "IT", "IS") being read as letters
      // If text is short (<= 4 chars) and fully uppercase, convert to lowercase
      // Exception for "I" which should be read as "I" (though lowercase "i" usually works too)
      if (cleanText && cleanText.length > 1 && cleanText.length <= 4 && cleanText === cleanText.toUpperCase()) {
        cleanText = cleanText.toLowerCase();
      }

      if (cleanText) {
        setTimeout(() => window.NarbeVoiceManager.speak(cleanText), 50);
      }
    }
  }

  // Journal Questions based on time of day
  let questions = {
    morning: [],
    afternoon: [],
    evening: []
  };

  async function loadQuestions() {
    try {
      const response = await fetch('questions.json');
      if (response.ok) {
        const data = await response.json();
        questions = data;
        console.log('Questions loaded successfully');
      } else {
        console.error('Failed to load questions');
      }
    } catch (e) {
      console.error('Error loading questions:', e);
    }
  }

  // Track used questions for today
  let usedQuestionsToday = [];
  let lastQuestionDate = null;

  function getTodayDateString() {
    const now = new Date();
    return `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
  }

  function loadUsedQuestions() {
    try {
      const stored = localStorage.getItem("benny-web:v1:journal.usedQuestions");
      if (stored) {
        const data = JSON.parse(stored);
        if (data.date === getTodayDateString()) {
          usedQuestionsToday = data.questions || [];
          lastQuestionDate = data.date;
          return;
        }
      }
    } catch (e) {}
    // Reset for new day
    usedQuestionsToday = [];
    lastQuestionDate = getTodayDateString();
    saveUsedQuestions();
  }

  function saveUsedQuestions() {
    localStorage.setItem("benny-web:v1:journal.usedQuestions", JSON.stringify({
      date: getTodayDateString(),
      questions: usedQuestionsToday
    }));
  }

  function getTimeBasedQuestions() {
    const hour = new Date().getHours();
    // Morning: 3am (3) to 11:59am (before 12)
    if (hour >= 3 && hour < 12) return questions.morning;
    // Afternoon: 12pm (12) to 4:59pm (before 17)
    if (hour >= 12 && hour < 17) return questions.afternoon;
    // Evening: 5pm (17) to 2:59am (before 3) - includes hours 17-23 and 0-2
    return questions.evening;
  }

  function getAvailableQuestions() {
    const timeQuestions = getTimeBasedQuestions();
    // Also check entries for today to see which questions were answered
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const answeredToday = entries
      .filter(e => {
        const d = new Date(e.date);
        return d >= todayStart && d <= todayEnd;
      })
      .map(e => e.question);

    // Combine used questions from this session and answered questions
    const allUsed = new Set([...usedQuestionsToday, ...answeredToday]);

    return timeQuestions.filter(q => !allUsed.has(q));
  }

  function getRandomQuestion() {
    // Check if it's a new day
    if (lastQuestionDate !== getTodayDateString()) {
      usedQuestionsToday = [];
      lastQuestionDate = getTodayDateString();
      saveUsedQuestions();
    }

    const available = getAvailableQuestions();

    if (available.length === 0) {
      // All questions used, reset and pick from all
      usedQuestionsToday = [];
      saveUsedQuestions();
      const allQuestions = getTimeBasedQuestions();
      return allQuestions[Math.floor(Math.random() * allQuestions.length)];
    }

    const question = available[Math.floor(Math.random() * available.length)];
    usedQuestionsToday.push(question);
    saveUsedQuestions();
    return question;
  }

  // Entry management
  let entries = [];
  let currentViewDate = new Date();
  let currentQuestion = "";
  let entryToDelete = null;
  let editingEntryId = null;

  let journalState=null,storageReady=false,activeDraft=null,savingEntry=false,restoringBuffer=false;
  let draftSave=Promise.resolve(),storageError='';
  let editingBase=null;
  function storageMessage(message='') {
    storageError=message;
    const host=$('#journalStorageStatus');host.textContent=message;host.hidden=!message;
  }
  function adoptJournal(state) {
    journalState=state;entries=state.entries;
    const draft=state.recoveryDraft||state.draft;
    const add=$('[data-action="add-entry"]'),question=$('[data-action="question-entry"]');
    add.textContent=draft?.answer?.trim()?'Continue Entry':'Add Entry';
    question.disabled=!!draft?.answer?.trim();
    if(currentScreen==='entriesScreen'&&choiceScan)renderEntries();
    return state;
  }
  async function loadEntries() {
    try {adoptJournal(await BennyJournalStorage.read());storageReady=true;storageMessage();}
    catch(error){storageReady=false;storageMessage(error.message);}
  }
  async function ensureStorage() {
    if(!storageReady)await loadEntries();
    if(!storageReady){speak(storageError||'Journal could not connect. Your work is kept.');return false;}
    return true;
  }
  function pendingDraft() {return journalState?.recoveryDraft||journalState?.draft;}
  function saveDraft() {
    if(restoringBuffer||!activeDraft||!storageReady)return;
    const value=keyboardBuffer.trim()?{...activeDraft,question:currentQuestion,answer:keyboardBuffer,editingEntryId,editingUpdatedAt:activeDraft.editingUpdatedAt??null}:null;
    try {
      draftSave=BennyJournalStorage.saveDraft(value).then(state=>{adoptJournal(state);storageMessage();return state;},error=>{storageMessage(error.message+' Your text is kept.');throw error;});
      // A failed draft remains in the recovery copy and the visible text field.
      draftSave.catch(()=>{});
    }catch(error){storageMessage(error.message+' Keep Journal open and try saving again.');draftSave=Promise.reject(error);draftSave.catch(()=>{});}
  }
  async function deleteEntry(entryId) {
    if(!await ensureStorage())return false;
    try {
      const entry=entries.find(e=>e.id===String(entryId));
      adoptJournal(await BennyJournalStorage.deleteEntry(String(entryId),entry?.updatedAt??null));storageMessage();return true;
    }catch(error){storageMessage(error.message);speak('Could not delete the entry. Your entries are kept.');return false;}
  }

  function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  function formatShortDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });
  }

  function formatCurrentViewDate() {
    return currentViewDate.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  }

  // Navigation state
  let currentScreen = "mainMenu";
  let scanIndex = -1;  // Start at -1 so nothing is highlighted until first scan
  let scanItems = [];
  let inButtonMode = false;
  let hasStartedScanning = false;  // Track if user has started scanning

  // Scanning controls
  let spacebarPressed = false;
  let returnPressed = false;
  let spacebarPressTime = null;
  let returnPressTime = null;
  let longPressTriggered = false;
  let backwardScanInterval = null;
  let backwardScanningOccurred = false;

  function resetMenuScan() { document.activeElement?.blur(); updateScanItems(true); }

  // Screen management
  function showScreen(screenId) {
    $$(".screen").forEach(s => s.classList.remove("active"));
    $(`#${screenId}`).classList.add("active");
    currentScreen = screenId;
    resetMenuScan();  // Start a fresh scan on each screen
    hasStartedScanning = false;
    inButtonMode = false;
    updateScanItems();
    clearAllHighlights();  // Don't highlight anything initially
  }

  function collectScanItems() {
    scanItems = [];

    // Check for open modals first (highest priority)
    if (!deleteConfirmModal.classList.contains("hidden")) {
      scanItems = Array.from($$("#deleteConfirmModal .modal-btn"));
      return;
    }
    if (!changeViewModal.classList.contains("hidden")) {
      scanItems = Array.from($$("#changeViewModal .modal-btn"));
      return;
    }
    if (!questionModal.classList.contains("hidden")) {
      scanItems = Array.from($$("#questionModal .modal-btn"));
      return;
    }
    if (!entryViewModal.classList.contains("hidden")) {
      scanItems = Array.from($$("#entryViewModal .modal-btn:not(:disabled)"));
      return;
    }

    if (currentScreen === "mainMenu") {
      scanItems = Array.from($$("#mainMenu .menu-btn"));
    } else if (currentScreen === "entriesScreen") {
      // Keep the date shortcut reachable before the entry list.
      scanItems = [
        ...Array.from($$("#entriesScreen .view-label-container .action-btn:not(:disabled)")),
        ...Array.from($$("#entriesScreen .entries-actions .action-btn:not(:disabled)")),
        ...Array.from($$("#entriesScreen .entry-item")),
        ...Array.from($$("#entriesScreen .journal-date-nav .action-btn:not(:disabled)"))
      ];
    } else if (currentScreen === "optionsScreen") {
      scanItems = [
        ...Array.from($$("#optionsScreen .option-btn")),
        ...Array.from($$("#optionsScreen .menu-btn"))
      ];
    } else if (currentScreen === "keyboardScreen") {
      updateKeyboardScanItems();
      return;
    }
  }


  let choiceScan = null, statusHost = null, brakeOwned = false, backwardTimeout = null, selectTimeout = null;
  const gateOpen = () => !!document.querySelector('#companion-required')?.open;
  const nativeInput = target => !!target?.closest('input,textarea,[contenteditable="true"]');
  const itemFor = element => ({id: element.id || element.dataset.entryId && 'entry:' + element.dataset.entryId || element.dataset.setting && 'setting:' + element.dataset.setting || element.dataset.action && 'action:' + element.dataset.action || element.dataset.date && 'date:' + element.dataset.date,
    element, labelElement: element.querySelector('.option-label,.ctrl-text,.entry-preview') || element,
    label: () => stripEmojis(element.getAttribute('aria-label') || element.textContent)});
  function keyboardRoot() {
    const keys = Array.from(kb.querySelectorAll('.key'));
    return [{id:'row:text',row:0,kind:'keyboard-row',element:textBar,label:()=> 'Text. '+(keyboardBuffer || 'Empty')},
      ...keyboardRows.map((row,index)=>({id:'row:'+index,row:index+1,kind:'keyboard-row',element:keys[index*6],labelElement:keys[index*6]?.querySelector('.ctrl-text'),label:index===0?'Controls':row.join(', ')})),
      {id:'row:predictions',row:8,kind:'keyboard-row',element:predictBar,labelElement:predictBar.querySelector('.chip'),label:()=>keyboardChildren(8).map(item=>NarbeVoiceManager.processTextForTTS(item.label.trim())).filter(Boolean).join(', ')||'No predictions'}];
  }
  function keyboardChildren(row) {
    const buttons = row===8 ? Array.from(predictBar.querySelectorAll('.chip')) : Array.from(kb.querySelectorAll('.key')).slice((row-1)*6,row*6);
    const occurrences=new Map();
    return buttons.map((element,column)=>{const word=element.textContent,occurrence=occurrences.get(word)||0;occurrences.set(word,occurrence+1);return {id:row===8?'prediction:'+word+':'+occurrence:'key:'+keyboardRows[row-1][column],kind:'keyboard-key',row,column,element,labelElement:element.querySelector('.ctrl-text')||element,label:row===8?element.textContent:keyboardRows[row-1][column]}}).filter(item=>!item.element.disabled);
  }
  function calendarRows() {
    return BennyJournalCalendar.getGroups().map((group,index)=>({id:'calendar-row:'+group.key,kind:'calendar-row',group,element:group.buttons[0],label:group.label}));
  }
  function scanContext(fresh=false) {
    const modal=[deleteConfirmModal,changeViewModal,questionModal,entryViewModal].find(el=>!el.classList.contains('hidden'));
    const host=modal?.querySelector('.modal-card') || document.getElementById(currentScreen);
    if(statusHost.parentNode!==host)host.append(statusHost);
    if(modal===changeViewModal) {
      const old=choiceScan?.context;
      if(!fresh&&old?.key.startsWith('calendar-child:'))return old;
      return {key:'calendar',items:calendarRows(),statusHost};
    }
    if(!modal&&currentScreen==='keyboardScreen') {
      const old=choiceScan?.context;
      if(!fresh&&old?.key.startsWith('keyboard-child:'))return {key:old.key,items:keyboardChildren(Number(old.key.split(':')[1])),statusHost};
      return {key:'keyboard',items:keyboardRoot(),statusHost};
    }
    return {key:modal?.id || currentScreen,items:scanItems.map(itemFor),statusHost};
  }
  function updateScanItems(fresh=false) {
    collectScanItems(); if(!choiceScan)return;
    if(gateOpen()){choiceScan.sync(null);return;}
    choiceScan.sync(scanContext(fresh),{fresh});
  }
  function paintChoice(item,state,context) {
    clearAllHighlights(); scanIndex=state.index;
    if(context.key==='calendar')$('#calendarScanHint').textContent='Space: next row. Enter: choose row.';
    if(state.suspended||!item)return;
    if(item.kind==='keyboard-row') {
      keyboardInRowMode=true;keyboardRowIndex=item.row;
      if(item.row===0)textBar.classList.add('highlighted');
      else if(item.row===8)highlightPredictiveRow();else highlightKeyboardRow(item.row-1);
    } else if(item.kind==='keyboard-key') {
      keyboardInRowMode=false;keyboardRowIndex=item.row;keyboardButtonIndex=item.column;item.element.classList.add('highlighted');
    } else if(item.kind==='calendar-row') item.group.buttons.forEach(el=>el.classList.add('highlighted'));
    else item.element.classList.add('highlighted');
    item.element?.scrollIntoView({block:'nearest',inline:'nearest'});
  }
  function selectChoice(item) {
    if(item.kind==='keyboard-row') {
      if(item.row===0){speak(keyboardBuffer);return;}
      choiceScan.enterGroup({key:'keyboard-child:'+item.row,items:keyboardChildren(item.row),statusHost},{wrap:true,backStop:true});
    } else if(item.kind==='calendar-row') {
      choiceScan.enterGroup({key:'calendar-child:'+item.group.key,items:item.group.buttons.map(itemFor),statusHost},{wrap:true,backStop:true});
      $('#calendarScanHint').textContent='Space: next choice. Enter: select. Hold Enter: return to this row.';
    } else {
      item.element.click();
      if(item.kind==='keyboard-key'&&currentScreen==='keyboardScreen')choiceScan.back({restore:true});
    }
  }
  function initChoiceScan(){
    statusHost=document.createElement('div');statusHost.id='journal-scan-status';
    choiceScan=NarbeChoiceScanAdapter.create({holdThreshold:3000,statusHost,stateHost:document.body,
      speak:text=>NarbeVoiceManager.speak(stripEmojis(text)),onHighlight:paintChoice,onSelect:selectChoice});
  }

  function clearAllHighlights() {
    $$(".highlighted").forEach(el => el.classList.remove("highlighted"));
  }

  function highlightCurrentItem() { updateScanItems(); }
  function handleScan() { choiceScan?.step(1); }
  function handleScanBack() { choiceScan?.step(-1); }
  function handleSelect() { choiceScan?.select(); }
  function resetSwitchInput() {
    clearTimeout(backwardTimeout);clearTimeout(selectTimeout);clearInterval(backwardScanInterval);
    backwardTimeout=selectTimeout=backwardScanInterval=null;
    spacebarPressed=returnPressed=brakeOwned=backwardScanningOccurred=longPressTriggered=false;
    choiceScan?.cancelInput();
  }
  for(const type of ['keydown','keyup'])document.addEventListener(type,e=>{
    if(gateOpen()||nativeInput(e.target)||!['Space','Enter','NumpadEnter'].includes(e.code))return;
    e.preventDefault();if(e.repeat)return;
    if(e.code==='Space'){if(type==='keydown')startScanning();else stopScanning();}
    else if(type==='keydown')startSelecting();else stopSelecting();
  });
  document.addEventListener('narbe-input-cancelled',resetSwitchInput);
  window.addEventListener('blur',resetSwitchInput);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)resetSwitchInput();});
  document.addEventListener('narbe-tool-gate-change',()=>{resetSwitchInput();updateScanItems();});
  function startScanning(){
    if(spacebarPressed)return;spacebarPressed=true;backwardScanningOccurred=false;
    brakeOwned=choiceScan.brakePress();if(brakeOwned)return;choiceScan.setInputHeld(true);
    backwardTimeout=setTimeout(()=>{if(!spacebarPressed)return;backwardScanningOccurred=true;handleScanBack();backwardScanInterval=setInterval(handleScanBack,currentScanInterval);},3000);
  }
  function stopScanning(){
    if(!spacebarPressed)return;spacebarPressed=false;clearTimeout(backwardTimeout);clearInterval(backwardScanInterval);
    if(brakeOwned){brakeOwned=false;choiceScan.brakeRelease();}else if(!backwardScanningOccurred)handleScan();
    choiceScan.setInputHeld(false);
  }
  function startSelecting(){
    if(returnPressed)return;returnPressed=true;longPressTriggered=false;choiceScan.setInputHeld(true);
    selectTimeout=setTimeout(()=>{if(!returnPressed)return;
      if(choiceScan.getState()?.depth){longPressTriggered=true;choiceScan.back({restore:true});choiceScan.setInputHeld(true);}
      else if(currentScreen==='keyboardScreen'){longPressTriggered=true;choiceScan.align('row:predictions');choiceScan.setInputHeld(true);}
    },3000);
  }
  function stopSelecting(){if(!returnPressed)return;returnPressed=false;clearTimeout(selectTimeout);if(!longPressTriggered)handleSelect();choiceScan.setInputHeld(false);longPressTriggered=false;}
  function startAutoScan() {}
  function stopAutoScan() {}

  // ========== KEYBOARD FUNCTIONALITY ==========
  let keyboardBuffer = "";
  let keyboardRowIndex = -1;
  let keyboardButtonIndex = 0;
  let keyboardInRowMode = true;

  const keyboardRows = [
    ["Space", "Del Letter", "Del Word", "Clear", "Send", "Exit"],
    ["A", "B", "C", "D", "E", "F"],
    ["G", "H", "I", "J", "K", "L"],
    ["M", "N", "O", "P", "Q", "R"],
    ["S", "T", "U", "V", "W", "X"],
    ["Y", "Z", "0", "1", "2", "3"],
    ["4", "5", "6", "7", "8", "9"]
  ];

  const controlSymbols = {
    "Space": "—",
    "Del Letter": "⌫",
    "Del Word": "⌦",
    "Clear": "✕",
    "Send": "✓",
    "Exit": "⏻"
  };

  function renderKeyboard() {
    kb.innerHTML = "";
    keyboardRows.forEach((row, rIdx) => {
      row.forEach((key) => {
        const btn = document.createElement("button");
        btn.className = "key" + (rIdx === 0 ? " ctrl" : "");

        if (key === "Send") {
          btn.classList.add("send");
        } else if (key === "Exit") {
          btn.classList.add("exit-kb");
        }

        if (rIdx === 0 && controlSymbols[key]) {
          btn.innerHTML = `
            <span class="ctrl-symbol">${controlSymbols[key]}</span>
            <span class="ctrl-text">${key}</span>
          `;
        } else {
          btn.textContent = key;
        }

        btn.addEventListener("click", () => {
          if (rIdx === 0) {
            handleKeyboardControl(key);
          } else {
            insertKey(key);
          }
        });
        kb.appendChild(btn);
      });
    });
  }

  async function setKeyboardBuffer(txt) {
    if(savingEntry&&!restoringBuffer)return;
    keyboardBuffer = txt;
    textBar.textContent = keyboardBuffer + "|";
    adjustTextSize(keyboardBuffer + "|");
    saveDraft();
    await renderPredictions();
  }

  function adjustTextSize(text) {
    textBar.classList.remove('text-medium', 'text-small', 'text-tiny');
    const length = text.replace('|', '').length;
    if (length > 100) textBar.classList.add('text-tiny');
    else if (length > 50) textBar.classList.add('text-small');
    else if (length > 25) textBar.classList.add('text-medium');
  }

  function handleAutoPunctuation(text) {
    // Check for double space at the end
    if (!text.endsWith("  ")) return text;

    // Trim the trailing spaces for analysis
    let content = text.trim();

    // Case 3: Exclamation
    // If the text before the double space ends with ".", replace it with "!"
    if (content.endsWith(".")) {
         return content.slice(0, -1) + "! ";
    }

    // Case 1 & 2: Adding punctuation
    // Find the start of the current sentence.
    const sentenceEndRegex = /([.!?])\s+/g;
    let match;
    let lastEndIndex = 0;

    while ((match = sentenceEndRegex.exec(content)) !== null) {
        lastEndIndex = match.index + match[0].length;
    }

    const currentSentence = content.substring(lastEndIndex);
    const words = currentSentence.trim().split(/\s+/);

    if (words.length >= 3) {
        const firstWord = words[0].toLowerCase();
        const questionStarters = ["who", "what", "where", "when", "why", "how"];

        const lastChar = content.slice(-1);
        if (!/[.!?]/.test(lastChar)) {
             if (questionStarters.includes(firstWord)) {
                 return content + "? ";
             } else {
                 return content + ". ";
             }
        }
    }

    return text;
  }

  function insertKey(k) {
    if (k === " ") {
      recordTypedWord();
      let textWithSpace = keyboardBuffer + " ";
      let processedText = handleAutoPunctuation(textWithSpace);
      setKeyboardBuffer(processedText);
    } else {
      setKeyboardBuffer(keyboardBuffer + k);
    }
  }

  function handleKeyboardControl(key) {
    if (key === "Space") {
      insertKey(" ");
    } else if (key === "Del Letter") {
      setKeyboardBuffer(keyboardBuffer.slice(0, -1));
    } else if (key === "Del Word") {
      setKeyboardBuffer(keyboardBuffer.trimEnd().replace(/\S+\s*$/, ""));
    } else if (key === "Clear") {
      setKeyboardBuffer("");
    } else if (key === "Send") {
      submitEntry();
    } else if (key === "Exit") {
      closeKeyboard();
    }
  }

  async function submitEntry() {
    if(savingEntry||!await ensureStorage())return;
    const answer=keyboardBuffer.trim();
    if(!answer){speak('Please type an answer first');return;}
    savingEntry=true;
    try {
      // Finish the draft before committing its entry and clearing it atomically.
      await draftSave;
      const old=editingEntryId?editingBase:null;
      const entry={id:old?.id||activeDraft?.id||crypto.randomUUID(),date:old?.date||activeDraft?.date||new Date().toISOString(),question:currentQuestion,answer};
      const draft=journalState?.draft;
      const clearDraft=draft&&draft.id===activeDraft?.id?{id:draft.id,expectedUpdatedAt:draft.updatedAt}:undefined;
      const state=await BennyJournalStorage.saveEntry(entry,old?.updatedAt??null,clearDraft);
      BennyJournalStorage.forgetRecovery(activeDraft?.id);adoptJournal(state);storageMessage();
      activeDraft=null;restoringBuffer=true;await setKeyboardBuffer('');restoringBuffer=false;
      editingEntryId=null;showScreen('entriesScreen');questionModal.classList.add('hidden');renderEntries();
      speak(old?'Entry updated!':'Entry saved!');
    }catch(error){
      if(error.code==='CONFLICT'){
        try{
          const recovered={id:'recovered-'+activeDraft.id,date:activeDraft.date,question:currentQuestion,answer};
          const ownDraft=journalState?.draft;
          const clearOwn=!journalState?.recoveryConflict&&ownDraft?.id===activeDraft.id?{id:ownDraft.id,expectedUpdatedAt:ownDraft.updatedAt}:undefined;
          const recoveredState=await BennyJournalStorage.saveEntry(recovered,null,clearOwn);
          BennyJournalStorage.forgetRecovery(activeDraft.id);adoptJournal(recoveredState);activeDraft=null;
          restoringBuffer=true;await setKeyboardBuffer('');restoringBuffer=false;editingEntryId=null;editingBase=null;
          showScreen('entriesScreen');renderEntries();storageMessage();speak('Saved as a separate entry to keep both versions.');
        }catch(recoveryError){storageMessage(recoveryError.message+' Your text is kept.');speak('Could not finish saving. Your text is kept.');}
      }else {storageMessage(error.message+' Your text is kept.');speak('Could not finish saving. Your text is kept. Try Send again.');}
      draftSave=Promise.resolve();
    }
    finally{savingEntry=false;}
  }
  function closeKeyboard() {
    if(savingEntry)return;
    saveDraft();activeDraft=null;editingEntryId=null;
    restoringBuffer=true;setKeyboardBuffer('');restoringBuffer=false;
    showScreen('entriesScreen');questionModal.classList.add('hidden');renderEntries();
  }
  async function openKeyboard() {
    if(!await ensureStorage())return;
    const unfinished=pendingDraft();
    if(unfinished?.answer?.trim()){
      activeDraft={...unfinished};currentQuestion=unfinished.question;editingEntryId=unfinished.editingEntryId;const existing=entries.find(e=>e.id===editingEntryId);editingBase=existing?{...existing,updatedAt:unfinished.editingUpdatedAt??null}:null;
    }else activeDraft={id:crypto.randomUUID(),date:new Date().toISOString(),question:currentQuestion,answer:'',editingEntryId,editingUpdatedAt:editingBase?.updatedAt??null};
    showScreen('keyboardScreen');restoringBuffer=true;
    await setKeyboardBuffer(unfinished?.answer||'');restoringBuffer=false;
    renderKeyboard();keyboardRowIndex=-1;keyboardButtonIndex=0;keyboardInRowMode=true;
    clearAllHighlights();updateScanItems(true);speak(unfinished?.answer?'Continue your entry':'Keyboard');
  }

  function updateKeyboardScanItems() {}

  function highlightKeyboardRow(rowIndex) {
    clearAllHighlights();
    const allKeys = kb.querySelectorAll(".key");
    const start = rowIndex * 6;
    for (let i = 0; i < 6; i++) {
      if (allKeys[start + i]) {
        allKeys[start + i].classList.add("highlighted");
      }
    }
  }

  function highlightKeyboardButton(rowIndex, buttonIndex) {
    clearAllHighlights();
    const allKeys = kb.querySelectorAll(".key");
    const idx = rowIndex * 6 + buttonIndex;
    if (allKeys[idx]) {
      allKeys[idx].classList.add("highlighted");
    }
  }

  function highlightPredictiveRow() {
    clearAllHighlights();
    predictBar.querySelectorAll(".chip").forEach(chip => chip.classList.add("highlighted"));
  }

  function highlightPredictiveButton(index) {
    clearAllHighlights();
    const chips = predictBar.querySelectorAll(".chip");
    if (chips[index]) chips[index].classList.add("highlighted");
  }

  function speakRowTitle(rowIndex) {
    const titles = ["controls", "a b c d e f", "g h i j k l", "m n o p q r", "s t u v w x", "y z 0 1 2 3", "4 5 6 7 8 9"];
    if (titles[rowIndex]) speak(titles[rowIndex]);
  }

  function speakPredictions() {
    const chips = predictBar.querySelectorAll(".chip");
    const words = Array.from(chips).map(c => {
      let text = c.textContent.trim();
      // Fix for short uppercase words (like "IT", "IS") being read as letters
      if (text && text.length > 1 && text.length <= 4 && text === text.toUpperCase()) {
        return text.toLowerCase();
      }
      return text;
    }).filter(t => t);

    if (words.length) speak(words.join(", "));
    else speak("no predictions");
  }

  function speakPredictiveButton(index) {
    const chips = predictBar.querySelectorAll(".chip");
    if (chips[index] && chips[index].textContent.trim()) {
      speak(chips[index].textContent.trim());
    }
  }

  function getCurrentWord() {
    const trimmed = keyboardBuffer.replace(/\|/g, "").trimEnd();
    const parts = trimmed.split(/\s+/);
    if (keyboardBuffer.endsWith(" ")) return "";
    return parts[parts.length - 1] || "";
  }

  // Feeds the shared prediction data (bennyshub/shared/predictive_ngrams.json)
  // so words typed in the journal improve predictions everywhere, same as the keyboard app.
  function recordTypedWord() {
    if (!window.predictionSystem) return;
    const words = keyboardBuffer.trim().split(/\s+/);
    const lastWord = words[words.length - 1];
    if (!lastWord) return;
    try {
      window.predictionSystem.recordLocalWord(lastWord);
      if (words.length > 1) {
        window.predictionSystem.recordNgram(words.slice(0, -1).join(' '), lastWord);
      }
    } catch (e) {
      console.error('Error recording word:', e);
    }
  }

  function recordSelectedWord(word, context) {
    if (!window.predictionSystem) return;
    try {
      window.predictionSystem.recordLocalWord(word);
      const trimmedContext = context.trim();
      if (trimmedContext) {
        window.predictionSystem.recordNgram(trimmedContext, word);
      }
    } catch (e) {
      console.error('Error recording prediction:', e);
    }
  }

  async function renderPredictions() {
    let predictions = ["YES", "NO", "GOOD", "BAD", "FUN", "HAPPY"];

    if (window.predictionSystem && window.predictionSystem.getHybridPredictions) {
      try {
        predictions = await window.predictionSystem.getHybridPredictions(keyboardBuffer);
      } catch (e) {
        console.error('Error getting predictions:', e);
      }
    }

    predictBar.innerHTML = "";
    predictions.slice(0, 6).forEach(w => {
      const chip = document.createElement("button");
      chip.className = "chip";
      chip.textContent = w;
      chip.addEventListener("click", () => {
        const partial = getCurrentWord();
        let newBuf = keyboardBuffer;
        let context = keyboardBuffer;
        if (partial && !keyboardBuffer.endsWith(" ")) {
          context = keyboardBuffer.slice(0, -partial.length);
          newBuf = context + w + " ";
        } else {
          if (!keyboardBuffer.endsWith(" ") && keyboardBuffer.length) newBuf += " ";
          newBuf += w + " ";
        }
        setKeyboardBuffer(newBuf);
        recordSelectedWord(w, context);
      });
      predictBar.appendChild(chip);
    });

    while (predictBar.children.length < 6) {
      const chip = document.createElement("button");
      chip.className = "chip";
      chip.textContent = "";
      chip.disabled = true;
      predictBar.appendChild(chip);
    }
    if(currentScreen==="keyboardScreen")updateScanItems();
  }

  // ========== ENTRIES DISPLAY ==========
  function renderEntries() {
    currentPeriodLabel.textContent = formatCurrentViewDate();
    $('#journalDayContext').textContent = isOnTodayOrFuture() ? 'Today' : 'Viewing a past day';
    $$('[data-action="return-today"]').forEach(button => { button.disabled = isOnTodayOrFuture(); });
    $('[data-action="next-day"]').disabled = isOnTodayOrFuture();

    // Filter entries for current day (compare dates in local timezone)
    const viewYear = currentViewDate.getFullYear();
    const viewMonth = currentViewDate.getMonth();
    const viewDay = currentViewDate.getDate();

    const dayEntries = entries.filter(e => {
      const d = new Date(e.date);
      // Compare year, month, day in local timezone
      return d.getFullYear() === viewYear &&
             d.getMonth() === viewMonth &&
             d.getDate() === viewDay;
    });

    entriesList.innerHTML = "";

    if (dayEntries.length === 0) {
      entriesList.innerHTML = '<div class="no-entries">No entries for this day</div>';
    } else {
      dayEntries.forEach(entry => {
        const item = document.createElement("button");
        item.className = "entry-item"; item.dataset.entryId = entry.id;
        const dateLabel = document.createElement('span');
        dateLabel.className = 'entry-date-label'; dateLabel.textContent = formatShortDate(entry.date);
        const preview = document.createElement('span'); preview.className = 'entry-preview';
        preview.textContent = entry.question + ': ' + entry.answer; item.append(dateLabel, preview);
        item.addEventListener("click", () => viewEntry(entry));
        entriesList.appendChild(item);
      });
    }

    updateScanItems();
    highlightCurrentItem();
  }

  function viewEntry(entry) {
    $("#entryViewDate").textContent = formatDate(entry.date);
    $("#entryViewQuestion").textContent = entry.question;
    $("#entryViewAnswer").textContent = entry.answer;
    entryViewModal.classList.remove("hidden");
    entryViewModal.dataset.entryId = entry.id;
    updateScanItems();
    resetMenuScan();  // Start a fresh scan for this dialog
    clearAllHighlights();
  }

  function returnToToday() {
    entryViewModal.classList.add("hidden");
    resetMenuScan();
    navigateEntries("today");
    clearAllHighlights();
    speak("Today. " + formatCurrentViewDate());
  }

  function navigateEntries(direction) {
    let d = new Date(currentViewDate);
    switch (direction) {
      case "prev-month":
        d = BennyJournalCalendar.shiftMonth(d, -1);
        break;
      case "next-month":
        d = BennyJournalCalendar.shiftMonth(d, 1);
        break;
      case "prev-week":
        d.setDate(d.getDate() - 7);
        break;
      case "next-week":
        d.setDate(d.getDate() + 7);
        break;
      case "prev-day":
        d.setDate(d.getDate() - 1);
        break;
      case "next-day":
        d.setDate(d.getDate() + 1);
        break;
      case "today":
        currentViewDate = new Date();
        renderEntries();
        return;
    }
    const today = new Date(); today.setHours(0, 0, 0, 0); d.setHours(0, 0, 0, 0);
    currentViewDate = d > today ? today : d;
    renderEntries();
  }

  // Helper function to update the date preview in Change Date modal
  function updateDatePreview() {
    if (datePreview) {
      datePreview.textContent = formatCurrentViewDate();
      BennyJournalCalendar.render(currentViewDate, entries, date => {
        currentViewDate = date;
        changeViewModal.classList.add("hidden");
        resetMenuScan();
        renderEntries();
        speak(formatCurrentViewDate());
      }, speak, resetMenuScan);
    }
  }

  // ========== OPTIONS ==========
  function updateDisplays() {
    $("#themeValue").textContent = themes[currentThemeIndex].charAt(0).toUpperCase() + themes[currentThemeIndex].slice(1);
    $("#highlightValue").textContent = highlightColors[currentHighlightIndex].charAt(0).toUpperCase() + highlightColors[currentHighlightIndex].slice(1);
    $("#scanSpeedValue").textContent = (currentScanInterval / 1000) + "s";
    $("#autoScanValue").textContent = isAutoScanning ? "On" : "Off";

    if (window.NarbeVoiceManager) {
      const voice = window.NarbeVoiceManager.getCurrentVoice();
      $("#voiceValue").textContent = window.NarbeVoiceManager.getVoiceDisplayName(voice);
      const ttsEnabled = window.NarbeVoiceManager.getSettings().ttsEnabled;
      $("#ttsToggleValue").textContent = ttsEnabled ? "On" : "Off";
    }
  }

  function handleOptionClick(setting) {
    switch (setting) {
      case "theme":
        currentThemeIndex = (currentThemeIndex + 1) % themes.length;
        applyTheme(themes[currentThemeIndex]);
        speak(themes[currentThemeIndex]);
        break;
      case "highlight":
        currentHighlightIndex = (currentHighlightIndex + 1) % highlightColors.length;
        applyHighlightColor(highlightColors[currentHighlightIndex]);
        speak(highlightColors[currentHighlightIndex]);
        break;
      case "scan-speed":
        if (window.NarbeScanManager) {
          window.NarbeScanManager.cycleScanSpeed();
          const newInterval = window.NarbeScanManager.getScanInterval();
          speak((newInterval / 1000) + " seconds");
        }
        break;
      case "auto-scan":
        if (window.NarbeScanManager) {
          window.NarbeScanManager.toggleAutoScan();
          const isOn = window.NarbeScanManager.getSettings().autoScan;
          speak(isOn ? "Auto scan on" : "Auto scan off");
        }
        break;
      case "voice":
        if (window.NarbeVoiceManager) {
          window.NarbeVoiceManager.cycleVoice();
          updateDisplays();
          const voice = window.NarbeVoiceManager.getCurrentVoice();
          speak(window.NarbeVoiceManager.getVoiceDisplayName(voice));
        }
        break;
      case "tts-toggle":
        if (window.NarbeVoiceManager) {
          const enabled = window.NarbeVoiceManager.toggleTTS();
          updateDisplays();
          if (enabled) speak("TTS enabled");
        }
        break;
    }
  }

  // ========== EVENT HANDLERS ==========
  // Main menu buttons
  $$("#mainMenu .menu-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const action = btn.dataset.action;
      if (action === "entries") {
        showScreen("entriesScreen");
        renderEntries();
        speak("Entries");
      } else if (action === "options") {
        showScreen("optionsScreen");
        speak("Options");
      } else if (action === "exit") {
        speak("Goodbye!");
        closeApp();
      }
    });
  });

  // Entries screen buttons
  $$("#entriesScreen .action-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const action = btn.dataset.action;
      if (action === "question-entry") {
        currentQuestion = getRandomQuestion();
        $("#questionText").textContent = currentQuestion;
        questionModal.classList.remove("hidden");
        speak(currentQuestion);
        updateScanItems();
        resetMenuScan();
        clearAllHighlights();
      } else if (action === "add-entry") {
        currentQuestion = "Journal Entry";
        editingEntryId = null;
        openKeyboard();
        speak("Type your entry");
      } else if (action === "return-today") {
        returnToToday();
      } else if (action === "previous-day" || action === "next-day") {
        if (action === "previous-day" || !isOnTodayOrFuture()) {
          navigateEntries(action === "previous-day" ? "prev-day" : "next-day");
          resetMenuScan();
          clearAllHighlights();
          speak(formatCurrentViewDate());
        }
      } else if (action === "change-view") {
        changeViewModal.classList.remove("hidden");
        updateDatePreview();
        updateScanItems();
        resetMenuScan();
        clearAllHighlights();
      } else if (action === "back-to-menu") {
        showScreen("mainMenu");
        speak("Journal");
      }
    });
  });

  // Helper function to check if current view date is today or in the future
  function isOnTodayOrFuture() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const viewDate = new Date(currentViewDate);
    viewDate.setHours(0, 0, 0, 0);
    return viewDate >= today;
  }

  // Calendar Back keeps the currently displayed entries date.
  $('[data-action="close-view-modal"]').addEventListener('click', () => {
    BennyJournalCalendar.resetScan();
    changeViewModal.classList.add('hidden');
    resetMenuScan();
    renderEntries();
  });

  // Question modal buttons
  $$("#questionModal .modal-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const action = btn.dataset.action;
      if (action === "new-question") {
        currentQuestion = getRandomQuestion();
        $("#questionText").textContent = currentQuestion;
        speak(currentQuestion);
      } else if (action === "add-answer") {
        questionModal.classList.add("hidden");
        openKeyboard();
        speak("Type your answer");
      } else if (action === "close-modal") {
        questionModal.classList.add("hidden");
        updateScanItems();
        resetMenuScan();
      }
    });
  });

  // Options buttons
  $$("#optionsScreen .option-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      choiceScan.align('setting:'+btn.dataset.setting);
      handleOptionClick(btn.dataset.setting);
      updateScanItems();
      choiceScan.announce(stripEmojis(btn.textContent));
    });
  });

  $$("#optionsScreen .menu-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      showScreen("mainMenu");
      speak("Journal");
    });
  });

  // Entry view modal buttons
  $$("#entryViewModal .modal-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const action = btn.dataset.action;
      if (action === "read-entry") {
        const question = $("#entryViewQuestion").textContent;
        const answer = $("#entryViewAnswer").textContent;
        speak(`${question} ${answer}`);
      } else if (action === "edit-entry") {
        const entryId = String(entryViewModal.dataset.entryId);
        const entry = entries.find(e => e.id === entryId);
        if (entry) {
          editingEntryId = entryId;
          editingBase = {...entry};
          currentQuestion = entry.question;
          entryViewModal.classList.add("hidden");
          const unfinished=pendingDraft();
          await openKeyboard();
          if(!unfinished?.answer?.trim())setKeyboardBuffer(entry.answer);
          speak("Edit your entry");
        }
      } else if (action === "delete-entry") {
        entryToDelete = String(entryViewModal.dataset.entryId);
        deleteConfirmModal.classList.remove("hidden");
        speak("Are you sure you want to delete this entry?");
        updateScanItems();
        resetMenuScan();  // Start a fresh scan for this dialog
        clearAllHighlights();
      } else if (action === "return-today") {
        returnToToday();
      } else if (action === "close-entry-view") {
        entryViewModal.classList.add("hidden");
        updateScanItems();
        resetMenuScan();
        clearAllHighlights();
      }
    });
  });

  // Delete confirmation modal buttons
  $$("#deleteConfirmModal .modal-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const action = btn.dataset.action;
      if (action === "cancel-delete") {
        deleteConfirmModal.classList.add("hidden");
        entryToDelete = null;
        updateScanItems();
        resetMenuScan();
      } else if (action === "confirm-delete") {
        if (entryToDelete) {
          if(!await deleteEntry(entryToDelete))return;
          speak("Entry deleted");
        }
        deleteConfirmModal.classList.add("hidden");
        entryViewModal.classList.add("hidden");
        entryToDelete = null;
        resetMenuScan();
        renderEntries();
      }
    });
  });

  // Close app (Return to Hub)
  function closeApp() {
    // Send message to parent window (Hub) to close the iframe
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ action: 'focusBackButton' }, '*');
    } else {
      // Fallback if not in iframe (e.g. testing directly)
      window.location.href = "../../../index.html";
    }
  }

  // ========== INITIALIZATION ==========
  async function init() {
    console.log("Initializing Ben's Journal App...");

    // Load Companion storage (or an older Companion browser fallback) first.
    await loadEntries();
    await loadQuestions();
    loadUsedQuestions();

    // Apply settings
    applyTheme(settings.theme);
    applyHighlightColor(settings.highlightColor);
    isAutoScanning = window.NarbeScanManager?.getSettings().autoScan || false;

    // Set view to today
    currentViewDate = new Date();

    // Wait for voice manager
    if (window.NarbeVoiceManager && window.NarbeVoiceManager.waitForVoices) {
      window.NarbeVoiceManager.waitForVoices().then(() => {
        updateDisplays();
      });
    } else {
      setTimeout(updateDisplays, 500);
    }

    // Entries and Options become available only after saved data is loaded.
    $$('#mainMenu .menu-btn').forEach(button => { button.disabled = false; });
    mainMenu.removeAttribute('aria-busy');
    initChoiceScan();
    // Show main menu
    showScreen("mainMenu");
    speak("Journal");

    // Initialize Scan Manager subscription
    if (window.NarbeScanManager) {
      // Subscribe to changes
      // Subscription is registered once near the top of this module.
      // specific initial sync
      const mgrSettings = window.NarbeScanManager.getSettings();
      isAutoScanning = mgrSettings.autoScan;
    }

    // Start auto scan if enabled
    if (isAutoScanning) {
      startAutoScan();
    }

    console.log("Journal app initialized!");
  }

  BennyJournalStorage.subscribe(state=>{if(storageReady)adoptJournal(state);});
  window.addEventListener('focus',()=>{if(currentScreen!=='keyboardScreen'&&!savingEntry)loadEntries();});
  window.addEventListener('benny-extension-change',()=>{if(!storageReady&&document.readyState!=='loading')loadEntries();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)saveDraft();});
  window.addEventListener('pagehide',saveDraft);
  init();
})();
