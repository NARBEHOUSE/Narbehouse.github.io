(async () => {
  if(window.BennyAppStorage)await BennyAppStorage.ready('keyboard');
  const $ = (sel) => document.querySelector(sel);
  const textBar = $("#textBar");
  const predictBar = $("#predictBar");
  const kb = $("#keyboard");
  const settingsMenu = $("#settingsMenu");

  const defaultSettings = {
    autocapI: true,
    theme: "default",
    scanSpeed: "medium",
    highlightColor: "yellow",
    autoScan: true
  };

  let settings = loadSettings();
  function loadSettings() {
    try {
      const v = JSON.parse(localStorage.getItem("kb_settings"));
      // Remove voiceIndex from keyboard settings as it's now handled by voice manager
      if (v && 'voiceIndex' in v) delete v.voiceIndex;
      return { ...defaultSettings, ...v };
    }
    catch {
      return { ...defaultSettings };
    }
  }
  function saveSettings() {
    if(window.BennyAppStorage)BennyAppStorage.setItem('keyboard','kb_settings',JSON.stringify(settings));else localStorage.setItem('kb_settings',JSON.stringify(settings));
  }

  // TTS functionality using unified voice manager
  function speak(text) {
    // Use the unified voice manager's speakProcessed function for better pronunciation
    if (choiceScan && inSettingsMode) return choiceScan.announceCurrent(text);
    return window.NarbeVoiceManager.speakProcessed(text);
  }

  // Track TTS usage for learning and text clearing
  let ttsHistory = [];
  const MAX_TTS_HISTORY = 10;

  function trackTTSAndLearn(text) {
    if (!text || !text.trim()) return;

    const cleanText = text.trim();
    const timestamp = Date.now();

    // Add to history
    ttsHistory.push({ text: cleanText, timestamp });

    // Keep only recent history
    if (ttsHistory.length > MAX_TTS_HISTORY) {
      ttsHistory = ttsHistory.slice(-MAX_TTS_HISTORY);
    }

    // Check for 3 occurrences of the same text
    const occurrences = ttsHistory.filter(entry => entry.text === cleanText);

    if (occurrences.length >= 3) {

      // Learn from the text FIRST
      learnFromText(cleanText);

      // Clear the text box completely - use setBuffer to ensure proper clearing
      setBuffer(""); // This will trigger renderPredictions and reset everything properly

      // Clear this text from history to avoid repeated learning
      ttsHistory = ttsHistory.filter(entry => entry.text !== cleanText);
    }
  }

  function learnFromText(text) {
    if (!window.predictionSystem) return;

    const words = text.toUpperCase().split(/\s+/).filter(w => w.length > 0);

    // Record each word
    words.forEach(word => {
      window.predictionSystem.recordLocalWord(word);
    });

    // Record n-grams
    for (let i = 0; i < words.length - 1; i++) {
      const context = words.slice(0, i + 1).join(' ');
      const nextWord = words[i + 1];
      window.predictionSystem.recordNgram(context, nextWord);
    }

  }

  // Scan timing configuration
  const scanSpeeds = {
    slow: { forward: 1500, backward: 3000, longPress: 2000 },
    medium: { forward: 1000, backward: 2000, longPress: 2000 },
    fast: { forward: 500, backward: 1000, longPress: 2000 }
  };

  // Auto Scan timing configuration (different from manual scan timing)
  const autoScanSpeeds = {
    slow: 3000,     // 3 seconds
    medium: 2000,   // 2 seconds
    fast: 1000      // 1 second
  };

  let currentScanSpeed = settings.scanSpeed || "medium";
  let choiceScan = null, statusHost = null;
  let spaceBraking = false, cancelledSpace = false, backwardTimeout = null, enterTimeout = null;
  let isAutoScanning = false;

  // Theme management
  const themes = ["default", "light", "dark", "blue", "green", "purple", "orange", "red"];
  let currentThemeIndex = themes.indexOf(settings.theme) || 0;

  // Highlight color management
  const highlightColors = ["yellow", "pink", "green", "orange", "black", "white", "purple", "red"];
  let currentHighlightIndex = highlightColors.indexOf(settings.highlightColor) || 0;

  function applyTheme(theme) {
    themes.forEach(t => document.body.classList.remove(`theme-${t}`));
    if (theme !== "default") {
      document.body.classList.add(`theme-${theme}`);
    }
    settings.theme = theme;
    saveSettings();
    updateThemeDisplay();
  }

  function applyHighlightColor(color) {
    highlightColors.forEach(c => document.body.classList.remove(`highlight-${c}`));
    document.body.classList.add(`highlight-${color}`);
    settings.highlightColor = color;
    saveSettings();
    updateHighlightDisplay();
  }

  // Settings menu state
  let inSettingsMode = false;
  let settingsRowIndex = -1;
  let settingsItems = [];

  // Scanning state
  let inRowSelectionMode = true;
  let currentRowIndex = -1;
  let currentButtonIndex = 0;
  let spacebarPressed = false;
  let returnPressed = false;
  let spacebarPressTime = null;
  let returnPressTime = null;
  let longPressTriggered = false;
  let backwardScanInterval = null;
  let backwardScanStarted = false; // Track if backward scanning actually started

  // Text state
  let buffer = "";
  let ttsUseCount = 0;

  function setBuffer(txt) {
    buffer = txt;
    const displayText = buffer + "|";
    textBar.textContent = displayText;

    // Dynamically adjust text size based on length
    adjustTextSize(displayText);

    ttsUseCount = 0;
    renderPredictions();
  }

  function adjustTextSize(text) {
    // Remove all size classes first
    textBar.classList.remove('text-medium', 'text-small', 'text-tiny');

    // Get the text length without the cursor
    const textLength = text.replace('|', '').length;

    // Apply appropriate class based on text length
    if (textLength > 100) {
      textBar.classList.add('text-tiny');
    } else if (textLength > 50) {
      textBar.classList.add('text-small');
    } else if (textLength > 25) {
      textBar.classList.add('text-medium');
    }
    // Otherwise use default size (no class needed)
  }

  // Keyboard layout with symbols for control buttons
  const rows = [
    ["Space", "Del Letter", "Del Word", "Clear", "Settings", "Exit"],
    ["A","B","C","D","E","F"],
    ["G","H","I","J","K","L"],
    ["M","N","O","P","Q","R"],
    ["S","T","U","V","W","X"],
    ["Y","Z","0","1","2","3"],
    ["4","5","6","7","8","9"]
  ];

  // Control button symbols
  const controlSymbols = {
    "Space": "—",        // Em dash symbol (changed from underscore)
    "Del Letter": "⌫",   // Backspace symbol
    "Del Word": "⌦",     // Delete forward symbol
    "Clear": "✕",        // Clear/X symbol
    "Settings": "⚙",     // Gear symbol
    "Exit": "⏻"          // Power/Exit symbol
  };

  function renderKeyboard() {
    kb.innerHTML = "";
    rows.forEach((row, rIdx) => {
      row.forEach((key) => {
        const btn = document.createElement("button");
        btn.className = "key" + (rIdx === 0 ? " ctrl" : "");

        if (key === "Settings") {
          btn.classList.add("settings");
        } else if (key === "Exit") {
          btn.classList.add("exit");
        }

        // For control buttons, add symbol and text
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
            handleControl(key);
          } else {
            insertKey(key);
          }
        });
        kb.appendChild(btn);
      });
    });
    clearAllHighlights();
  }

  document.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    if (e.code === "Space") {
      e.preventDefault();
      startScanning();
    } else if ((e.code === "Enter" || e.code === "NumpadEnter")) {
      e.preventDefault();
      startSelecting();
    }
  });

  document.addEventListener("keyup", (e) => {
    if (e.code === "Space") {
      e.preventDefault();
      stopScanning();
    } else if ((e.code === "Enter" || e.code === "NumpadEnter")) {
      e.preventDefault();
      stopSelecting();
    }
  });

  function resetSwitchInput() {
    clearTimeout(backwardTimeout); clearTimeout(enterTimeout); clearInterval(backwardScanInterval);
    backwardTimeout = enterTimeout = backwardScanInterval = null;
    spacebarPressed = returnPressed = spaceBraking = cancelledSpace = backwardScanStarted = longPressTriggered = false;
    choiceScan?.setInputHeld(false);
  }
  window.addEventListener('blur', resetSwitchInput);
  document.addEventListener('narbe-input-cancelled', resetSwitchInput);
  function startScanning() {
    if (spacebarPressed) return;
    spacebarPressed = true; backwardScanStarted = cancelledSpace = false;
    spaceBraking = choiceScan.brakePress();
    if (spaceBraking) return;
    choiceScan.setInputHeld(true);
    const speed = scanSpeeds[currentScanSpeed];
    backwardTimeout = setTimeout(() => {
      if (!spacebarPressed || cancelledSpace) return;
      backwardScanStarted = true;
      // Retain this keyboard's existing first-repeat timing after its 2 s hold.
      backwardScanInterval = setInterval(() => { if (spacebarPressed) choiceScan.step(-1); }, NarbeScanManager.getScanInterval());
    }, speed.longPress);
  }
  function stopScanning() {
    if (!spacebarPressed) return;
    spacebarPressed = false; clearTimeout(backwardTimeout); clearInterval(backwardScanInterval);
    backwardTimeout = backwardScanInterval = null;
    if (spaceBraking) { spaceBraking = false; choiceScan.brakeRelease(); }
    else { if (!backwardScanStarted && !cancelledSpace) choiceScan.step(1); choiceScan.setInputHeld(false); }
    backwardScanStarted = cancelledSpace = false;
  }
  function startSelecting() {
    if (returnPressed) return;
    returnPressed = true; longPressTriggered = false; choiceScan.setInputHeld(true);
    enterTimeout = setTimeout(() => { if (returnPressed) handleLongPress(); }, scanSpeeds[currentScanSpeed].longPress);
  }
  function stopSelecting() {
    if (!returnPressed) return;
    returnPressed = false; clearTimeout(enterTimeout);
    if (!longPressTriggered) choiceScan.select();
    longPressTriggered = false; choiceScan.setInputHeld(false);
  }
  function handleLongPress() {
    longPressTriggered = true;
    if (inSettingsMode) return;
    if (choiceScan.getState().depth) choiceScan.back({restore: true});
    else {
      choiceScan.open(rowChoices(), {restoreId: 'row:predictions'});
      const words = [...predictBar.querySelectorAll('.chip')].map(chip => chip.textContent).filter(Boolean);
      if (words.length) choiceScan.announceCurrent(words.join(', '));
    }
    choiceScan.setInputHeld(true);
  }
  function scanForward() { choiceScan?.step(1); }
  function scanBackward() { choiceScan?.step(-1); }

  async function updatePredictiveButtons() {
    await renderPredictions();
  }

  function selectButton() { choiceScan?.select(); }

  function rowChoices() {
    return [
      {id: 'row:text', kind: 'row', row: 0, element: textBar, label: 'Text. ' + (buffer || 'Empty')},
      {id: 'row:predictions', kind: 'row', row: 1, element: predictBar, label: 'predictive text'},
      ...rows.map((keys, row) => ({id: 'row:' + row, kind: 'row', row: row + 2,
        element: kb.querySelectorAll('.key')[row * 6], label: row === 0 ? 'controls' : keys.join(' ')}))
    ];
  }
  function childChoices(row) {
    if (row === 1) {
      const occurrences = new Map();
      return [...predictBar.querySelectorAll('.chip')].map((element, column) => {
        const word = element.textContent.trim(), occurrence = occurrences.get(word) || 0;
        occurrences.set(word, occurrence + 1);
        return {id: 'prediction:' + word + ':' + occurrence, kind: 'key', row, column, element, label: word};
      }).filter(item => item.label && !item.element.disabled);
    }
    return rows[row - 2].map((key, column) => ({id: 'key:' + key, kind: 'key', row, column,
      element: kb.querySelectorAll('.key')[(row - 2) * 6 + column],
      label: key === 'Del Letter' ? 'delete letter' : key === 'Del Word' ? 'delete word' : key}));
  }
  function settingsChoices() {
    return settingsItems.map((element, column) => ({id: 'setting:' + element.dataset.setting,
      kind: 'setting', column, element,
      label: [element.querySelector('.setting-label')?.textContent, element.querySelector('.setting-value')?.textContent].filter(Boolean).join('. ')}));
  }
  function refreshChoices() {
    if (!choiceScan) return;
    choiceScan.setItems(inSettingsMode ? settingsChoices() : choiceScan.getState().depth ? childChoices(currentRowIndex) : rowChoices());
  }
  function drawChoice(item, state) {
    clearAllHighlights(); settingsItems.forEach(element => element.classList.remove('highlighted'));
    document.body.dataset.scanIndex = state.index; document.body.dataset.scanDepth = state.depth;
    document.body.dataset.scanSelected = state.id || ''; document.body.dataset.scanState = state.parked ? 'parked' : state.braked ? 'paused' : 'running';
    if (!item) { currentRowIndex = settingsRowIndex = -1; inRowSelectionMode = true; document.activeElement?.blur(); return; }
    if (item.kind === 'setting') { settingsRowIndex = item.column; highlightSettingsItem(item.column); }
    else {
      currentRowIndex = item.row; inRowSelectionMode = item.kind === 'row'; currentButtonIndex = item.column || 0;
      if (item.kind === 'key') item.element.classList.add('highlighted');
      else if (item.row === 0) highlightTextBox();
      else if (item.row === 1) highlightPredictiveRow();
      else highlightRow(item.row - 2);
    }
    if (!state.suspended) item.element?.scrollIntoView({block: 'nearest', inline: 'nearest'});
  }
  function chooseItem(item) {
    if (item.kind === 'setting') { settingsRowIndex = item.column; selectSettingsItem(); if (inSettingsMode) refreshChoices(); return; }
    if (item.kind === 'row') {
      if (item.row === 0) textBar.click();
      else choiceScan.enterGroup(childChoices(item.row));
      return;
    }
    item.element.click();
    if (!inSettingsMode) choiceScan.back({restore: true});
  }

  let predictionRenderVersion = 0;
  window.addEventListener('benny-predictions-ready', () => {
    if (currentRowIndex !== 1) renderPredictions();
  });
  async function renderPredictions() {
    const requestVersion = ++predictionRenderVersion;
    const requestedBuffer = buffer;
    const predictions = await window.predictionSystem.getLocalPredictions(buffer);

    if (requestVersion !== predictionRenderVersion || requestedBuffer !== buffer) return;
    const wasPredictiveRowHighlighted = (currentRowIndex === 1 && inRowSelectionMode);
    const wasInButtonMode = (currentRowIndex === 1 && !inRowSelectionMode);
    const savedButtonIndex = currentButtonIndex;



    predictBar.innerHTML = "";
    predictions.slice(0, 6).forEach(w => {
      const chip = document.createElement("button");
      chip.className = "chip";
      chip.textContent = w;
      chip.disabled = !w;
      chip.addEventListener("click", () => {
        const partial = currentWord();
        let newBuf = buffer;
        if (partial && !buffer.endsWith(" ")) {
          newBuf = buffer.slice(0, -partial.length) + w + " ";
        } else {
          if (!buffer.endsWith(" ") && buffer.length) newBuf += " ";
          newBuf += w + " ";
        }
        setBuffer(newBuf);

        // REMOVED: Don't record clicked predictions either
        // window.predictionSystem.recordLocalWord(w);
        // const context = buffer.replace("|", "").trim();
        // if (context) {
        //   window.predictionSystem.recordNgram(context, w);
        // }
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

    refreshChoices();
  }

  function currentWord() {
    const trimmed = buffer.replace(/\|/g, "").trimEnd();
    const parts = trimmed.split(/\s+/);
    if (buffer.endsWith(" ")) return "";
    return parts[parts.length - 1] || "";
  }

  function clearAllHighlights() {
    textBar.classList.remove("highlighted");
    const allKeys = kb.querySelectorAll(".key");
    allKeys.forEach(key => key.classList.remove("highlighted"));
    const allChips = predictBar.querySelectorAll(".chip");
    allChips.forEach(chip => chip.classList.remove("highlighted"));
  }

  function highlightTextBox() {
    clearAllHighlights();
    textBar.classList.add("highlighted");
  }

  function highlightRow(rowIndex) {
    clearAllHighlights();
    const rowStart = rowIndex * 6;
    const allKeys = kb.querySelectorAll(".key");

    for (let i = 0; i < 6; i++) {
      if (allKeys[rowStart + i]) {
        allKeys[rowStart + i].classList.add("highlighted");
      }
    }
  }

  function highlightButton(buttonIndex, prevButtonIndex = null) {
    const rowStart = (currentRowIndex - 2) * 6;
    const allKeys = kb.querySelectorAll(".key");

    if (prevButtonIndex !== null && allKeys[rowStart + prevButtonIndex]) {
      allKeys[rowStart + prevButtonIndex].classList.remove("highlighted");
    }

    if (allKeys[rowStart + buttonIndex]) {
      allKeys[rowStart + buttonIndex].classList.add("highlighted");
    }
  }

  function highlightPredictiveRow() {
    clearAllHighlights();
    const allChips = predictBar.querySelectorAll(".chip");
    allChips.forEach(chip => chip.classList.add("highlighted"));
  }

  function highlightPredictiveButton(buttonIndex, prevButtonIndex = null) {
    const chips = predictBar.querySelectorAll(".chip");

    if (prevButtonIndex !== null && chips[prevButtonIndex]) {
      chips[prevButtonIndex].classList.remove("highlighted");
    }

    if (chips[buttonIndex]) {
      chips[buttonIndex].classList.add("highlighted");
    }
  }

  function speakRowTitle(rowIndex) {
    const rowTitles = [
      "controls",
      "a b c d e f",
      "g h i j k l",
      "m n o p q r",
      "s t u v w x",
      "y z 0 1 2 3",
      "4 5 6 7 8 9",
      "predictive text"
    ];

    if (rowIndex < rowTitles.length) {
      speak(rowTitles[rowIndex]);
    }
  }

  function speakButtonLabel(buttonIndex) {
    const label = rows[currentRowIndex - 2][buttonIndex];
    let spokenLabel = label.toLowerCase();

    if (spokenLabel === "del letter") spokenLabel = "delete letter";
    if (spokenLabel === "del word") spokenLabel = "delete word";

    if (label.length === 1 && /^[A-Z0-9]$/.test(label)) {
      spokenLabel = label;
    }

    speak(spokenLabel);
  }

  function speakPredictiveButtonLabel(buttonIndex) {
    const chips = predictBar.querySelectorAll(".chip");
    if (chips[buttonIndex] && chips[buttonIndex].textContent.trim()) {
      speak(chips[buttonIndex].textContent.trim());
    }
  }

  function openSettings() {
    inSettingsMode = true;
    settingsMenu.classList.remove("hidden");
    kb.style.display = "none";
    predictBar.style.display = "none";
    textBar.style.display = "none"; // Hide text bar too

    settingsItems = Array.from(settingsMenu.querySelectorAll(".settings-item"));
    settingsRowIndex = -1;
    clearAllHighlights();
    highlightSettingsItem(-1);
    document.activeElement?.blur();

    updateThemeDisplay();
    updateScanSpeedDisplay();
    updateVoiceDisplay();
    updateHighlightDisplay();
    updateTTSToggleDisplay(); // Add TTS toggle display update
    updateAutoScanDisplay(); // Add Auto Scan display update
    settingsMenu.append(statusHost);
    choiceScan.open(settingsChoices());

    settingsItems.forEach((item, index) => {
      item.addEventListener('click', () => {
        choiceScan.open(settingsChoices(), {restoreId: 'setting:' + item.dataset.setting});
        choiceScan.select();
      });

    });
  }

  function closeSettings() {
    inSettingsMode = false;
    settingsMenu.classList.add("hidden");
    kb.style.display = "grid";
    predictBar.style.display = "grid";
    textBar.style.display = "flex"; // Show text bar again

    settingsItems.forEach(item => {
      const newItem = item.cloneNode(true);
      item.parentNode.replaceChild(newItem, item);
    });

    inRowSelectionMode = true;
    currentRowIndex = -1;
    settingsRowIndex = -1;
    clearAllHighlights();
    document.activeElement?.blur();
    document.querySelector('main').append(statusHost);
    choiceScan.open(rowChoices());
  }

  function highlightSettingsItem(index) {
    settingsItems.forEach(item => item.classList.remove("highlighted"));
    if (settingsItems[index]) {
      settingsItems[index].classList.add("highlighted");
    }
  }

  function scanSettingsForward() { choiceScan?.step(1); }
  function scanSettingsBackward() { choiceScan?.step(-1); }

  function selectSettingsItem() {
    const item = settingsItems[settingsRowIndex];
    if (!item) return;
    const setting = item.dataset.setting;

    switch (setting) {
      case "theme":
        cycleTheme();
        break;

      case "scan-speed":
        cycleScanSpeed();
        break;

      case "voice":
        cycleVoice();
        break;

      case "highlight":
        cycleHighlightColor();
        break;

      case "tts-toggle":
        toggleTTS();
        break;

      case "auto-scan":
        toggleAutoScan();
        break;

      case "read-instructions":
        readInstructions();
        break;

      case "clear-cache":
        clearPredictionCache();
        break;

      case "close":
        closeSettings();
        speak("settings closed");
        break;
    }
  }

  function cycleTheme() {
    currentThemeIndex = (currentThemeIndex + 1) % themes.length;
    const newTheme = themes[currentThemeIndex];
    applyTheme(newTheme);
    speak(newTheme);
  }

  function updateThemeDisplay() {
    const themeValue = $("#themeValue");
    if (themeValue) {
      themeValue.textContent = themes[currentThemeIndex];
    }
  }

  function cycleScanSpeed() {
    if (typeof NarbeScanManager !== 'undefined') {
        NarbeScanManager.cycleScanSpeed();
    } else {
        const speeds = ["slow", "medium", "fast"];
        const currentIndex = speeds.indexOf(currentScanSpeed);
        const nextIndex = (currentIndex + 1) % speeds.length;
        currentScanSpeed = speeds[nextIndex];

        settings.scanSpeed = currentScanSpeed;
        saveSettings();
    }

    updateScanSpeedDisplay();

    let label = currentScanSpeed;
    if (typeof NarbeScanManager !== 'undefined') {
        label = (NarbeScanManager.getScanInterval() / 1000) + 's';
    }
    speak("Scan Speed " + label);

    // Restart Auto Scan with new timing if it's currently enabled
    if (isAutoScanning) {
      stopAutoScan();
      startAutoScan();
    }
  }

  function updateScanSpeedDisplay() {
    const speedValue = $("#scanSpeedValue");
    if (speedValue) {
      if (typeof NarbeScanManager !== 'undefined') {
          const interval = NarbeScanManager.getScanInterval();
          speedValue.textContent = (interval / 1000) + 's';
      } else {
          speedValue.textContent = currentScanSpeed.charAt(0).toUpperCase() + currentScanSpeed.slice(1);
      }
    }
  }

  function cycleVoice() {
    const voiceChanged = window.NarbeVoiceManager.cycleVoice();
    if (voiceChanged) {
      updateVoiceDisplay();
      const currentVoice = window.NarbeVoiceManager.getCurrentVoice();
      const displayName = window.NarbeVoiceManager.getVoiceDisplayName(currentVoice);
      speak(`voice changed to ${displayName}`);
    } else {
      speak("no english voices available");
    }
  }

  function updateVoiceDisplay() {
    const voiceValue = $("#voiceValue");
    if (voiceValue) {
      const currentVoice = window.NarbeVoiceManager.getCurrentVoice();
      const displayName = window.NarbeVoiceManager.getVoiceDisplayName(currentVoice);
      voiceValue.textContent = displayName;
    }
  }

  function cycleHighlightColor() {
    currentHighlightIndex = (currentHighlightIndex + 1) % highlightColors.length;
    const newColor = highlightColors[currentHighlightIndex];
    applyHighlightColor(newColor);
    speak(newColor);
  }

  function updateHighlightDisplay() {
    const highlightValue = $("#highlightValue");
    if (highlightValue) {
      const colorName = highlightColors[currentHighlightIndex];
      highlightValue.textContent = colorName.charAt(0).toUpperCase() + colorName.slice(1);
    }
  }

  function toggleTTS() {
    const ttsEnabled = window.NarbeVoiceManager.toggleTTS();
    updateTTSToggleDisplay();
    speak(ttsEnabled ? "TTS enabled" : "TTS disabled");
  }

  function updateTTSToggleDisplay() {
    const ttsValue = $("#ttsToggleValue");
    if (ttsValue) {
      const voiceSettings = window.NarbeVoiceManager.getSettings();
      ttsValue.textContent = voiceSettings.ttsEnabled ? "On" : "Off";
    }
  }

  function toggleAutoScan() {
    if (typeof NarbeScanManager !== 'undefined') {
        const current = NarbeScanManager.getSettings().autoScan;
        NarbeScanManager.updateSettings({ autoScan: !current });
        isAutoScanning = !current;
    } else {
        isAutoScanning = !isAutoScanning;
        settings.autoScan = isAutoScanning;
        saveSettings();
    }

    updateAutoScanDisplay();
    speak(isAutoScanning ? "Auto Scan enabled" : "Auto Scan disabled");

    if (isAutoScanning) {
      startAutoScan();
    } else {
      stopAutoScan();
    }
  }

  function updateAutoScanDisplay() {
    const autoScanValue = $("#autoScanValue");
    if (autoScanValue) {
      if (typeof NarbeScanManager !== 'undefined') {
          const val = NarbeScanManager.getSettings().autoScan;
          autoScanValue.textContent = val ? "On" : "Off";
          isAutoScanning = val;
      } else {
          autoScanValue.textContent = isAutoScanning ? "On" : "Off";
      }
    }
  }

  // The shared controller owns the only forward clock, including settings.
  function startAutoScan() {}
  function stopAutoScan() {}

  function readInstructions() {
    const instructions = `
      Welcome to Ben's Keyboard. Here are the instructions for using this keyboard.

      Navigation controls:
      Spacebar short press will advance forward through rows and buttons.
      Spacebar long hold will move backward through rows and buttons until released.

      Selection controls:
      Return key short press will select the highlighted item.
      Return key long press in button mode will return you to row selection mode.
      Return key long hold in row selection mode will jump directly to predictive text.

      The keyboard has several rows:
      First is the text bar where your typed text appears. Click or select it to hear your text read aloud.
      Second is the predictive text row with word suggestions.
      Third is the controls row with space, delete, clear, settings, and exit.
      Then letter rows A through Z and number rows 0 through 9.

      Tips:
      Saying the same text three times will save those words to your predictions for faster typing later.
      You can change themes, scan speed, voice, and highlight colors in settings.
      The TTS toggle controls whether items are read aloud as you navigate.
      The Auto Scan toggle enables automatic scanning through rows and buttons.

      Press return to continue using the keyboard.
    `;

    if (window.NarbeVoiceManager) {
      window.NarbeVoiceManager.cancel();
      window.NarbeVoiceManager.speak(instructions, { rate: 0.9 });
    }
  }

  function clearPredictionCache() {
    if (window.predictionSystem && typeof window.predictionSystem.clearCache === 'function') {
      window.predictionSystem.clearCache();
      speak("prediction cache cleared");

      // Update predictions display to reflect the cleared cache
      renderPredictions();
    } else {
      speak("unable to clear cache");
    }
  }

  function handleControl(key) {
    if (key === "Space") return insertKey(" ");
    if (key === "Del Letter") { setBuffer(buffer.slice(0, -1)); return; }
    if (key === "Del Word")   { setBuffer(buffer.trimEnd().replace(/\S+\s*$/, "")); return; }
    if (key === "Clear")      { setBuffer(""); return; }
    if (key === "Settings")   {
      openSettings();
      return;
    }
    if (key === "Exit")       {
      try {
        if (window.parent && window.parent !== window) {
          window.parent.postMessage({ action: 'focusBackButton' }, '*');
        }
      } catch (err) {
        console.error('Failed to message parent:', err);
      }
      return;
    }
  }

  function insertKey(k) {
    if (settings.autocapI && k.length === 1) {
      const prev = buffer.slice(-1);
      if ((k === "i" || k === "I") && (!prev || /\s/.test(prev))) k = "I";
    }

    if (k === " ") {
      const currentText = buffer.replace('|', '').trim();
      const words = currentText.split(' ');
      if (words.length > 0) {
        const lastWord = words[words.length - 1];
        if (lastWord && lastWord.length > 0) {
          window.predictionSystem.recordLocalWord(lastWord);

          if (words.length > 1) {
            const context = words.slice(0, -1).join(' ');
            window.predictionSystem.recordNgram(context, lastWord);
          }
        }
      }
    }

    setBuffer(buffer + k);
  }

  function saveTextToPredictive(text) {
    const words = text.split(/\s+/);
    words.forEach(word => {
      if (word && word.trim().length > 0) {
        window.predictionSystem.recordLocalWord(word);

        const textWords = text.split(/\s+/);
        const wordIndex = textWords.indexOf(word);
        if (wordIndex > 0) {
          const context = textWords.slice(0, wordIndex).join(' ');
          window.predictionSystem.recordNgram(context, word);
        }
      }
    });
  }

  function recordLocalWord(word) {
    if (!word || word.trim().length === 0) return;
    window.predictionSystem.recordLocalWord(word);
  }

  textBar.addEventListener("click", () => {
    const text = buffer.replace(/\|/g, "").trim();
    if (text) {
      speak(text);
      trackTTSAndLearn(text); // Use the unified tracking function
    }
  });

  const originalSetBuffer = setBuffer;
  setBuffer = function(newBuffer) { originalSetBuffer(newBuffer); };

  function init() {
    // Wait for voice manager to load voices, then update display
    window.NarbeVoiceManager.waitForVoices().then(() => {
      updateVoiceDisplay();
      updateTTSToggleDisplay();
    });

    // Listen for voice settings changes from other apps
    window.NarbeVoiceManager.onSettingsChange(() => {
      updateVoiceDisplay();
      updateTTSToggleDisplay();
    });

    applyTheme(settings.theme);
    applyHighlightColor(settings.highlightColor || "yellow");
    currentScanSpeed = settings.scanSpeed || "medium";

    if (typeof NarbeScanManager !== 'undefined') {
        const mgrSettings = NarbeScanManager.getSettings();
        isAutoScanning = mgrSettings.autoScan;
    } else {
        isAutoScanning = settings.autoScan;
    }

    renderKeyboard();
    statusHost = document.createElement('div'); statusHost.id = 'keyboard-scan-status';
    statusHost.setAttribute('aria-label', 'Scan status'); document.querySelector('main').append(statusHost);
    choiceScan = NarbeScanManager.createChoiceScan({
      choice: true, holdThreshold: scanSpeeds[currentScanSpeed].longPress, items: rowChoices(), statusHost,
      getId: item => item.id, getLabel: item => item.label, getElement: item => item.element,
      getLabelElement: item => item.kind === 'setting' ? item.element.querySelector('.setting-label') :
        item.row === 1 && item.kind === 'row' ? item.element.querySelector('.chip') : item.element.querySelector('.ctrl-text') || item.element,
      speak: text => NarbeVoiceManager.speakProcessed(text), onHighlight: drawChoice, onSelect: chooseItem
    });
    let previousAuto = NarbeScanManager.getSettings().autoScan;
    NarbeScanManager.subscribe(next => {
      if (next.autoScan !== previousAuto && spacebarPressed && !spaceBraking) {
        cancelledSpace = true; clearTimeout(backwardTimeout); clearInterval(backwardScanInterval);
      }
      previousAuto = next.autoScan; isAutoScanning = next.autoScan;
      updateAutoScanDisplay(); updateScanSpeedDisplay(); refreshChoices();
    });
    setBuffer("");
    setTimeout(() => renderPredictions(), 100);

    if (isAutoScanning) {
      startAutoScan();
    }
  }

  init();
})();
