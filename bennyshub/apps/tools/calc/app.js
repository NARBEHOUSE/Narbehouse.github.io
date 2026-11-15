/* Calculator: a standard calculator for Benny's Hub, scanned with two switches
 * (or one, with Auto Scan) and usable with a mouse, touch or a keyboard.
 *
 * Top to bottom: the screen, five rows of four keys (C ⌫ % ÷ / 7 8 9 × /
 * 4 5 6 − / 1 2 3 + / ± 0 . =) and a row with Settings and Exit.
 * Scanning is the same row-then-key choice scan as Ben's Keyboard and Smart
 * Keyboard: Space moves, Enter picks a row and then a key, every row loops
 * through a spoken "Back" stop, and a picked key returns to its own row.
 * Picking the screen reads the sum and the answer aloud. After each key the
 * calculator says what happened ("75", "plus", "2 plus 3 equals 5").
 *
 * This file is the same on the PC hub and the website.
 */
(() => {
  const $ = (sel) => document.querySelector(sel);
  const display = $('#display');
  const expressionEl = $('#expression');
  const mainValueEl = $('#mainValue');
  const previewEl = $('#preview');
  const sparklesEl = $('#sparkles');
  const keypad = $('#keypad');
  const tapeList = $('#tapeList');
  const tapeEmpty = $('#tapeEmpty');
  const settingsMenu = $('#settingsMenu');

  const calc = NarbeCalcEngine.create();

  // ------------------------------------------------------------------ keys --

  const key = (id, label, speech, className) => ({ id, label, speech, className });
  const digitKey = d => key(d, d, d, 'digit');
  const ROWS = [
    [key('clear', 'C', 'clear', 'fn clear'), key('del', '⌫', 'delete', 'fn del'), key('%', '%', 'percent', 'fn pct'), key('/', '÷', 'divided by', 'op div')],
    [digitKey('7'), digitKey('8'), digitKey('9'), key('*', '×', 'times', 'op mul')],
    [digitKey('4'), digitKey('5'), digitKey('6'), key('-', '−', 'minus', 'op sub')],
    [digitKey('1'), digitKey('2'), digitKey('3'), key('+', '+', 'plus', 'op add')],
    [key('negate', '±', 'plus or minus', 'fn neg'), digitKey('0'), key('.', '.', 'point', 'fn dot'), key('=', '=', 'equals', 'eq')],
    [key('settings', 'Settings', 'settings', 'sys settings'), key('exit', 'Exit', 'exit', 'sys exit')]
  ];
  const SYSTEM_ICONS = { settings: '⚙', exit: '⏻' };

  // Look settings are the Calculator's own.
  const SETTINGS_KEY = 'calc_settings';
  const defaultSettings = { theme: 'fun', highlightColor: 'yellow' };
  let settings = loadSettings();
  function loadSettings() {
    try {
      const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
      const result = { ...defaultSettings };
      for (const name of ['theme', 'highlightColor']) if (typeof stored[name] === 'string') result[name] = stored[name];
      return result;
    } catch { return { ...defaultSettings }; }
  }
  function saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* storage can be unavailable */ }
  }

  function speak(text) {
    if (choiceScan && inSettingsMode) return choiceScan.announceCurrent(text);
    return window.NarbeVoiceManager.speakProcessed(text);
  }

  // Hold timings kept from Ben's Keyboard.
  const scanSpeeds = {
    slow: { forward: 1500, backward: 3000, longPress: 2000 },
    medium: { forward: 1000, backward: 2000, longPress: 2000 },
    fast: { forward: 500, backward: 1000, longPress: 2000 }
  };
  const currentScanSpeed = 'medium';

  let choiceScan = null, statusHost = null;
  const rowOutline = NarbeChoiceScanAdapter.createRowOutline(); // dashed outline around a row while its Back stop is current
  let spaceBraking = false, cancelledSpace = false, backwardTimeout = null, enterTimeout = null;
  let isAutoScanning = false;

  // Themes and highlight colours, as in the hub's keyboards. "Fun" is the
  // Calculator's own colourful default.
  const themes = ['fun', 'light', 'dark', 'blue', 'green', 'purple', 'orange', 'red'];
  const THEME_NAMES = { fun: 'Fun' };
  let currentThemeIndex = Math.max(0, themes.indexOf(settings.theme));
  const highlightColors = ['yellow', 'pink', 'green', 'orange', 'black', 'white', 'purple', 'red'];
  let currentHighlightIndex = Math.max(0, highlightColors.indexOf(settings.highlightColor));
  const capitalise = text => text.charAt(0).toUpperCase() + text.slice(1);
  const themeName = theme => THEME_NAMES[theme] || capitalise(theme);

  function applyTheme(theme) {
    themes.forEach(t => document.body.classList.remove(`theme-${t}`));
    document.body.classList.add(`theme-${theme}`);
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
  let currentRowIndex = -1;
  let spacebarPressed = false;
  let returnPressed = false;
  let longPressTriggered = false;
  let backwardScanInterval = null;
  let backwardScanStarted = false;

  // --------------------------------------------------------------- drawing --

  const rowElements = [];
  const keyElements = new Map();

  function buildKeypad() {
    keypad.innerHTML = '';
    ROWS.forEach((row, r) => {
      const rowEl = document.createElement('div');
      rowEl.className = 'key-row' + (r === ROWS.length - 1 ? ' system-row' : '');
      rowEl.dataset.row = String(r);
      row.forEach(k => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'key ' + k.className;
        button.dataset.key = k.id;
        button.setAttribute('aria-label', k.speech);
        if (SYSTEM_ICONS[k.id]) {
          button.innerHTML = '<span class="key-icon" aria-hidden="true"></span><span class="key-text"></span>';
          button.querySelector('.key-icon').textContent = SYSTEM_ICONS[k.id];
          button.querySelector('.key-text').textContent = k.label;
        } else {
          button.innerHTML = '<span class="key-face"></span>';
          button.querySelector('.key-face').textContent = k.label;
        }
        button.addEventListener('click', () => { button.blur(); runKey(k, { fromScan: false }); });
        rowEl.appendChild(button);
        keyElements.set(k.id, button);
      });
      keypad.appendChild(rowEl);
      rowElements.push(rowEl);
    });
  }

  function drawDisplay() {
    const view = calc.view();
    expressionEl.textContent = view.expression || ' ';
    mainValueEl.textContent = view.main;
    previewEl.textContent = view.preview || ' ';
    display.dataset.state = view.state;
    const length = view.main.length;
    mainValueEl.classList.toggle('len-m', length > 9 && length <= 13);
    mainValueEl.classList.toggle('len-l', length > 13 && length <= 18);
    mainValueEl.classList.toggle('len-xl', length > 18);
    expressionEl.classList.toggle('long', view.expression.length > 34);
  }

  function drawTape() {
    const history = calc.history().slice(0, 8);
    tapeList.innerHTML = '';
    history.forEach((entry, i) => {
      const li = document.createElement('li');
      li.className = 'tape-item' + (i === 0 ? ' newest' : '');
      const sum = document.createElement('span'); sum.className = 'tape-sum'; sum.textContent = entry.expression + ' =';
      const answer = document.createElement('span'); answer.className = 'tape-answer'; answer.textContent = entry.result;
      li.append(sum, answer);
      tapeList.appendChild(li);
    });
    tapeEmpty.hidden = history.length > 0;
  }

  const reducedMotion = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

  function restartAnimation(element, className) {
    element.classList.remove(className);
    void element.offsetWidth; // restart the CSS animation
    element.classList.add(className);
  }

  /** A short press dip on a key, for scan and mouse presses alike. */
  function pressFeedback(element) {
    if (!element) return;
    element.classList.add('pressed');
    setTimeout(() => element.classList.remove('pressed'), 180);
  }

  /** The answer pops in with a little burst of sparkles. */
  function celebrate() {
    restartAnimation(mainValueEl, 'pop');
    if (reducedMotion()) return;
    sparklesEl.innerHTML = '';
    const colors = ['#ff7a1a', '#ffd23f', '#5bb0ff', '#ec4899', '#22c55e', '#a78bfa'];
    for (let i = 0; i < 12; i++) {
      const s = document.createElement('i');
      const angle = (i / 12) * Math.PI * 2 + Math.random() * 0.4;
      const distance = 60 + Math.random() * 70;
      s.style.setProperty('--dx', Math.round(Math.cos(angle) * distance * 1.6) + 'px');
      s.style.setProperty('--dy', Math.round(Math.sin(angle) * distance * 0.7) + 'px');
      s.style.setProperty('--c', colors[i % colors.length]);
      s.style.animationDelay = Math.round(Math.random() * 80) + 'ms';
      sparklesEl.appendChild(s);
    }
    setTimeout(() => { sparklesEl.innerHTML = ''; }, 1100);
  }

  // ---------------------------------------------------------------- typing --

  /** Presses a key. Returns what to say, or null for Settings/Exit. */
  function runKey(k, { fromScan }) {
    if (k.id === 'settings') { openSettings(); return null; }
    if (k.id === 'exit') { closeApp(); return null; }
    pressFeedback(keyElements.get(k.id));
    const result = calc.press(k.id);
    drawDisplay();
    if (k.id === '=' && result.ok) { drawTape(); celebrate(); }
    else if (!result.ok && calc.view().state === 'error') restartAnimation(display, 'oops');
    else if (!result.ok) restartAnimation(keyElements.get(k.id), 'nope');
    const say = result.say || k.speech;
    if (!fromScan) speak(say);
    return say;
  }

  // A keyboard works too (for helpers and typists). Space and Enter stay the
  // switch keys, so they never type.
  const TYPED_KEYS = { '*': '*', x: '*', X: '*', '/': '/', '+': '+', '-': '-', '%': '%', '.': '.', ',': '.', '=': '=',
    Backspace: 'del', Delete: 'clear', Escape: 'clear' };
  function typedKey(e) {
    if (inSettingsMode || e.ctrlKey || e.altKey || e.metaKey) return null;
    if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') return null;
    if (/^[0-9]$/.test(e.key)) return e.key;
    return TYPED_KEYS[e.key] || null;
  }

  // ------------------------------------------------------------- scanning --

  document.addEventListener('keydown', (e) => {
    const typed = typedKey(e);
    if (typed) {
      e.preventDefault();
      if (e.repeat && typed !== 'del') return;
      const k = ROWS.flat().find(entry => entry.id === typed);
      if (k) runKey(k, { fromScan: false });
      return;
    }
    const space = e.code === 'Space', enter = e.code === 'Enter' || e.code === 'NumpadEnter';
    if (!space && !enter) return;
    // Cancel the browser's own action for every press, held repeats included:
    // a held Return must never press a focused button over and over.
    e.preventDefault();
    if (e.repeat) return;
    if (space) startScanning(); else startSelecting();
  });
  document.addEventListener('keyup', (e) => {
    if (e.code === 'Space') { e.preventDefault(); stopScanning(); }
    else if (e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); stopSelecting(); }
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
    // Like the row blank, Space on the Back stop is consumed without pausing.
    const scan = NarbeScanManager.getSettings();
    spaceBraking = choiceScan.getState().id === 'key:row-back' ? scan.autoScan && scan.spaceBrake : choiceScan.brakePress();
    if (spaceBraking) return;
    choiceScan.setInputHeld(true);
    backwardTimeout = setTimeout(() => {
      if (!spacebarPressed || cancelledSpace) return;
      backwardScanStarted = true;
      backwardScanInterval = setInterval(() => { if (spacebarPressed) choiceScan.step(-1); }, NarbeScanManager.getScanInterval());
    }, scanSpeeds[currentScanSpeed].longPress);
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
    enterTimeout = setTimeout(() => { if (returnPressed) handleLongPress(); }, 3000);
  }
  function stopSelecting() {
    if (!returnPressed) return;
    returnPressed = false; clearTimeout(enterTimeout);
    if (!longPressTriggered) choiceScan.select();
    longPressTriggered = false; choiceScan.setInputHeld(false);
  }
  /** Hold Enter inside a row: back to the rows, on the same row. */
  function handleLongPress() {
    longPressTriggered = true;
    if (inSettingsMode) return;
    if (choiceScan.getState().depth) choiceScan.back({ restore: true });
    choiceScan.setInputHeld(true);
  }

  const rowSpeech = r => ROWS[r].map(k => k.speech).join(' , ');
  function displayLabel() { return 'Screen. ' + calc.speech(); }

  function rowChoices() {
    const items = [{ id: 'row:display', kind: 'row', row: 'display', element: display, label: displayLabel }];
    ROWS.forEach((row, r) => items.push({ id: 'row:' + r, kind: 'row', row: r, element: rowElements[r], label: rowSpeech(r) }));
    return items;
  }
  function rowKeys(r) {
    return ROWS[r].map(k => ({ id: 'key:' + k.id, kind: 'key', row: r, element: keyElements.get(k.id), label: k.speech, key: k }));
  }
  // Every key row loops through its keys plus a stop that highlights nothing and
  // says "Back"; choosing it returns to the same row.
  function childChoices(r) {
    return [...rowKeys(r), { id: 'key:row-back', kind: 'back', row: r, element: null, label: 'Back' }];
  }
  function visibleSettingsItems() {
    return Array.from(settingsMenu.querySelectorAll('.settings-item')).filter(element => !element.hidden);
  }
  function settingsChoices() {
    return settingsItems.map((element, column) => ({ id: 'setting:' + element.dataset.setting,
      kind: 'setting', column, element,
      label: [element.querySelector('.setting-label')?.textContent, element.querySelector('.setting-value')?.textContent].filter(Boolean).join('. ') }));
  }
  function refreshChoices() {
    if (!choiceScan) return;
    choiceScan.setItems(inSettingsMode ? settingsChoices() : choiceScan.getState().depth ? childChoices(currentRowIndex) : rowChoices());
  }

  function clearAllHighlights() {
    display.classList.remove('highlighted');
    keypad.querySelectorAll('.key').forEach(k => k.classList.remove('highlighted'));
    rowElements.forEach(row => row.classList.remove('row-highlighted'));
  }
  function drawChoice(item, state) {
    clearAllHighlights(); settingsItems.forEach(element => element.classList.remove('highlighted')); rowOutline.hide();
    document.body.dataset.scanIndex = state.index; document.body.dataset.scanDepth = state.depth;
    document.body.dataset.scanSelected = state.id || ''; document.body.dataset.scanState = state.parked ? 'parked' : state.braked ? 'paused' : 'running';
    if (!item) { currentRowIndex = settingsRowIndex = -1; document.activeElement?.blur(); return; }
    if (item.kind === 'back') {
      currentRowIndex = item.row; document.activeElement?.blur();
      if (!state.suspended) rowOutline.show(rowKeys(item.row).map(k => k.element));
      return;
    }
    if (item.kind === 'setting') { settingsRowIndex = item.column; highlightSettingsItem(item.column); }
    else {
      currentRowIndex = item.row;
      if (item.kind === 'key') item.element.classList.add('highlighted');
      else if (item.row === 'display') display.classList.add('highlighted');
      else { rowElements[item.row].classList.add('row-highlighted'); rowKeys(item.row).forEach(k => k.element.classList.add('highlighted')); }
    }
    if (!state.suspended) item.element?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }

  function chooseItem(item) {
    if (item.kind === 'back') { choiceScan.back({ restore: true }); return; }
    if (item.kind === 'setting') { settingsRowIndex = item.column; selectSettingsItem(); if (inSettingsMode) refreshChoices(); return; }
    if (item.kind === 'row') {
      // The screen is read aloud; a key row is entered.
      if (item.row === 'display') choiceScan.announceCurrent(calc.speech());
      else choiceScan.enterGroup(childChoices(item.row), { wrap: true });
      return;
    }
    const say = runKey(item.key, { fromScan: true });
    if (say === null || inSettingsMode) return;
    // A key returns to its own row, then says what happened.
    choiceScan.open(rowChoices(), { restoreId: 'row:' + item.row });
    choiceScan.announceCurrent(say);
  }

  // ------------------------------------------------------------- settings --

  function openSettings() {
    inSettingsMode = true;
    settingsMenu.classList.remove('hidden');
    settingsItems = visibleSettingsItems();
    settingsRowIndex = -1; // Nothing highlighted until the first Space
    highlightSettingsItem(-1);
    clearAllHighlights();
    updateThemeDisplay();
    updateScanSpeedDisplay();
    updateVoiceDisplay();
    updateHighlightDisplay();
    updateTTSToggleDisplay();
    updateAutoScanDisplay();
    settingsMenu.append(statusHost);
    choiceScan.open(settingsChoices());
    choiceScan.announceCurrent('Settings');
  }

  function initSettingsClickHandlers() {
    $('#settingsGrid').addEventListener('click', (e) => {
      const item = e.target.closest('.settings-item');
      if (!item || item.hidden) return;
      const index = settingsItems.indexOf(item);
      if (index !== -1) {
        settingsRowIndex = index;
        choiceScan.open(settingsChoices(), { restoreId: 'setting:' + item.dataset.setting });
        choiceScan.select();
      }
    });
  }

  function closeSettings() {
    inSettingsMode = false;
    settingsMenu.classList.add('hidden');
    currentRowIndex = -1; // Back on the calculator with nothing highlighted
    clearAllHighlights();
    document.activeElement?.blur();
    $('#main').append(statusHost);
    choiceScan.open(rowChoices());
  }

  function highlightSettingsItem(index) {
    settingsItems.forEach(item => item.classList.remove('highlighted'));
    if (settingsItems[index]) settingsItems[index].classList.add('highlighted');
  }

  const HELP_TEXT = 'Press Space to move to the next row. Press Enter to pick a row, then Space to move along its keys and Enter to press one. ' +
    'Pick the screen at the top to hear the sum and the answer. Hold Space to go backward. Hold Enter in a row to go back to the rows.';

  function selectSettingsItem() {
    const item = settingsItems[settingsRowIndex];
    if (!item) return; // Nothing highlighted yet
    switch (item.dataset.setting) {
      case 'theme': cycleTheme(); break;
      case 'scan-speed': cycleScanSpeed(); break;
      case 'voice': cycleVoice(); break;
      case 'highlight': cycleHighlightColor(); break;
      case 'tts-toggle': toggleTTS(); break;
      case 'auto-scan': toggleAutoScan(); break;
      case 'volume-up': adjustVolume('up'); break;
      case 'volume-down': adjustVolume('down'); break;
      case 'read-instructions': speak(HELP_TEXT); break;
      case 'close': closeSettings(); speak('settings closed'); break;
    }
  }

  const volumeAvailable = () => !!(window.electronAPI && window.electronAPI.system);
  async function adjustVolume(direction) {
    try {
      if (volumeAvailable()) {
        const result = direction === 'up' ? await window.electronAPI.system.volumeUp() : await window.electronAPI.system.volumeDown();
        if (result && result.success) speak(direction === 'up' ? 'volume up' : 'volume down');
        else speak('volume control failed');
      } else {
        speak('volume control not available');
      }
    } catch (error) {
      console.error('Error controlling volume:', error);
      speak('volume control error');
    }
  }

  function cycleTheme() {
    currentThemeIndex = (currentThemeIndex + 1) % themes.length;
    applyTheme(themes[currentThemeIndex]);
    speak(themeName(themes[currentThemeIndex]));
  }
  function updateThemeDisplay() {
    const themeValue = $('#themeValue');
    if (themeValue) themeValue.textContent = themeName(themes[currentThemeIndex]);
  }

  function cycleScanSpeed() {
    NarbeScanManager.cycleScanSpeed();
    updateScanSpeedDisplay();
    speak(`scan speed ${NarbeScanManager.getScanInterval() / 1000} seconds`);
  }
  function updateScanSpeedDisplay() {
    const speedValue = $('#scanSpeedValue');
    if (speedValue) speedValue.textContent = `${NarbeScanManager.getScanInterval() / 1000} seconds`;
  }

  function cycleVoice() {
    if (window.NarbeVoiceManager.areVoicesLoaded && !window.NarbeVoiceManager.areVoicesLoaded()) {
      window.NarbeVoiceManager.waitForVoices?.().then(updateVoiceDisplay);
      speak('initializing voices');
      return;
    }
    if (window.NarbeVoiceManager.cycleVoice()) {
      updateVoiceDisplay();
      const displayName = window.NarbeVoiceManager.getVoiceDisplayName(window.NarbeVoiceManager.getCurrentVoice());
      speak(`voice changed to ${displayName}`);
    } else {
      speak('refreshing voice list');
    }
  }
  function updateVoiceDisplay() {
    const voiceValue = $('#voiceValue');
    if (voiceValue && window.NarbeVoiceManager) {
      voiceValue.textContent = window.NarbeVoiceManager.getVoiceDisplayName(window.NarbeVoiceManager.getCurrentVoice());
    }
  }

  function cycleHighlightColor() {
    currentHighlightIndex = (currentHighlightIndex + 1) % highlightColors.length;
    applyHighlightColor(highlightColors[currentHighlightIndex]);
    speak(highlightColors[currentHighlightIndex]);
  }
  function updateHighlightDisplay() {
    const highlightValue = $('#highlightValue');
    if (highlightValue) highlightValue.textContent = capitalise(highlightColors[currentHighlightIndex]);
  }

  function toggleTTS() {
    const ttsEnabled = window.NarbeVoiceManager.toggleTTS();
    updateTTSToggleDisplay();
    speak(ttsEnabled ? 'TTS enabled' : 'TTS disabled');
  }
  function updateTTSToggleDisplay() {
    const ttsValue = $('#ttsToggleValue');
    if (ttsValue) ttsValue.textContent = window.NarbeVoiceManager.getSettings().ttsEnabled ? 'On' : 'Off';
  }

  // Auto Scan is the hub-wide setting; the shared controller owns the clock.
  function toggleAutoScan() {
    NarbeScanManager.toggleAutoScan();
    isAutoScanning = NarbeScanManager.getSettings().autoScan;
    updateAutoScanDisplay();
    speak(isAutoScanning ? 'Auto Scan enabled' : 'Auto Scan disabled');
  }
  function updateAutoScanDisplay() {
    const autoScanValue = $('#autoScanValue');
    if (autoScanValue) autoScanValue.textContent = isAutoScanning ? 'On' : 'Off';
  }

  function closeApp() {
    speak('exiting');
    try {
      // Both the PC hub and the website hub close the app on this message.
      if (window.parent && window.parent !== window) window.parent.postMessage({ action: 'focusBackButton' }, '*');
      else window.location.href = '../../../index.html';
    } catch (e) {
      console.error('Failed to post message to parent:', e);
      speak('error exiting');
    }
  }

  // ------------------------------------------------------------------ init --

  function init() {
    if (window.NarbeVoiceManager.waitForVoices) {
      window.NarbeVoiceManager.waitForVoices().then(() => { updateVoiceDisplay(); updateTTSToggleDisplay(); })
        .catch(() => { updateVoiceDisplay(); updateTTSToggleDisplay(); });
    }
    window.NarbeVoiceManager.onSettingsChange?.(() => { updateVoiceDisplay(); updateTTSToggleDisplay(); });

    applyTheme(themes[currentThemeIndex]);
    applyHighlightColor(highlightColors[currentHighlightIndex]);

    // Volume keys only where the PC hub can change the volume.
    settingsMenu.querySelectorAll('[data-needs="volume"]').forEach(element => { element.hidden = !volumeAvailable(); });

    buildKeypad();
    drawDisplay();
    drawTape();

    statusHost = document.createElement('div'); statusHost.id = 'calc-scan-status';
    statusHost.setAttribute('aria-label', 'Scan status'); $('#main').append(statusHost);
    choiceScan = NarbeScanManager.createChoiceScan({
      choice: true, holdThreshold: scanSpeeds[currentScanSpeed].longPress, items: rowChoices(), statusHost,
      getId: item => item.id, getLabel: item => typeof item.label === 'function' ? item.label() : item.label, getElement: item => item.element,
      getLabelElement: item => item.kind === 'back' ? null : item.kind === 'setting' ? item.element.querySelector('.setting-label') : item.element,
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

    initSettingsClickHandlers();
    isAutoScanning = NarbeScanManager.getSettings().autoScan;
    updateAutoScanDisplay();
  }

  // Read-only view for tests and troubleshooting.
  window.__calc = {
    state: () => ({ view: calc.view(), speech: calc.speech(), history: calc.history(), inSettings: inSettingsMode,
      theme: settings.theme, highlight: settings.highlightColor, settingsShown: settingsItems.map(el => el.dataset.setting) })
  };

  init();
})();
