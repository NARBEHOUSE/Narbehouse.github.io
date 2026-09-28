/* Enhancements use the original player and grid scanner; free layouts share GroupScan. */
'use strict';
const PB = window.PhraseBoard;
const predictionEngine = new PhrasePredictions.Predictor(window.PhrasePredictionData);
try { predictionEngine.setHistory(PhrasePredictions.readHistory(localStorage)); } catch {}
let groupScanner = null, groupElements = [], currentRevision = null, tour = null;
const original = {clearGrid, renderCategory, updateScannable, scanForward, scanBackward, selectCurrent, highlightCurrentRow, renderSettingsMenu, stopScanning, buildIndex};
buildIndex = function(rows) { predictionEngine.setBoard(rows); original.buildIndex(rows); };
function rememberMessage(text) {
  if (!state.rememberMessages || tour || new URLSearchParams(location.search).has('preview')) return;
  try { predictionEngine.setHistory(PhrasePredictions.remember(localStorage, text)); } catch { notifyBoard('Message spoken. Personal suggestions could not be saved in this browser.'); }
}
function speakMessage(blockInput = false) { const text = messageText(); if (!text) return; rememberMessage(text); speak(text, false, null, null, blockInput); }
function button(text, action, extra = '') { return createButton(text, '', action, extra); }
function notifyBoard(text) { el.statusFooter.textContent = text; }
function messageActive() { return state.sentenceMode && (!!tour || state.currentMenu === 'category' || state.currentMenu === 'categories'); }
function syncSentence() {
  el.sentenceRow.classList.toggle('active', messageActive());
  el.mainGrid.classList.toggle('sentence-active', messageActive());
}
function renderMessage() {
  el.sentenceDisplay.replaceChildren();
  if (state.messageDisplay === 'tiles') state.sentence.forEach(value => {
    const item = typeof value === 'string' ? {text: value} : value;
    const chip = document.createElement('span'); chip.className = 'message-tile';
    if (item.image) { const img = document.createElement('img'); img.src = item.image; img.alt = ''; chip.append(img); }
    chip.append(document.createTextNode(item.display || item.text)); el.sentenceDisplay.append(chip);
  });
  else el.sentenceDisplay.textContent = messageText();
  el.sentenceDisplay.setAttribute('aria-label', messageText() ? 'Speak message: ' + messageText() : 'Speak message. Message is empty');
  syncSentence();
  if (state.predictionsEnabled && !tour) { renderPredictions(); updateScannable(); }
}
clearGrid = function () {
  el.mainGrid.querySelectorAll('.group-active,.group-dim').forEach(n => n.classList.remove('group-active','group-dim'));
  original.clearGrid();
  el.mainGrid.querySelectorAll('.free-nav,.free-stage,.group-legend,.prediction-panel,.tour-panel').forEach(node => node.remove());
  el.mainGrid.classList.remove('free-active'); groupScanner = null; groupElements = [];
  syncSentence();
};
function tileButton(item) {
  const btn = button(item.display || item.speak || 'Speak', () => onTileClick(item));
  btn.dataset.speakText = item.speak || item.display || '';
  if (item.image) { const img = document.createElement('img'); img.src = item.image; img.alt = ''; btn.prepend(img); }
  return btn;
}
renderCategory = function () {
  const rows = state.byCat.get(state.currentCategory)?.items || [];
  if (PB.layout(rows) !== 'free') { original.renderCategory(); return; }
  clearGrid(); state.currentMenu = 'category'; el.mainGrid.classList.add('free-active');
  const nav = document.createElement('div'); nav.className = 'free-nav';
  const backGroup = button('Back to groups', () => { groupScanner?.back(); paintGroups(); }); backGroup.id = 'backToGroups'; backGroup.hidden = true;
  nav.append(backGroup);
  nav.append(button('Back to categories', () => { state.navigationHistory = []; openMenu('categories'); }), button('Settings', () => navigateTo('settings')));
  el.mainGrid.append(nav);
  const legend = document.createElement('div'); legend.className = 'group-legend'; legend.setAttribute('aria-label','Scan groups');
  const stage = document.createElement('div'); stage.className = 'free-stage';
  const byRow = new Map();
  // Screen position and scan position are separate. Compact screens reflow in reading order.
  [...rows].sort((a,b) => a.y - b.y || a.x - b.x).forEach(item => {
    const btn = tileButton(item); btn.dataset.group = item.group;
    btn.style.setProperty('--x', item.x / 10 + '%'); btn.style.setProperty('--y', item.y + 'px');
    btn.style.setProperty('--w', item.width / 10 + '%'); btn.style.setProperty('--h', item.height + 'px');
    btn.style.setProperty('--group-color', item.groupColor);
    btn.style.background = rgbaFromHex(item.tileColor || item.categoryColor,0.2);
    const label = document.createElement('span'); label.className = 'tile-group'; label.textContent = item.group; btn.append(label);
    stage.append(btn); byRow.set(item, btn);
  });
  stage.style.height = Math.max(140,...rows.map(r => r.y + r.height + 24)) + 'px';
  const groups = PB.groups(rows).map(g => {
    const label = document.createElement('span'); label.className = 'group-label'; label.textContent = g.name; label.dataset.group = g.name;
    label.style.setProperty('--group-color',g.color); legend.append(label);
    return {name:g.name, items:g.items.map(item => byRow.get(item.row)), label};
  });
  el.mainGrid.append(legend, stage); groupElements = groups;
  updateScannable();
  // Text may wrap beyond its saved height. Grow the scrollable canvas to keep every tile reachable.
  requestAnimationFrame(() => { if (stage.isConnected && innerWidth >= 760) stage.style.height = Math.max(stage.offsetHeight,...[...stage.children].map(n => n.offsetTop + n.offsetHeight + 24)) + 'px'; });
};
function renderPredictions() {
  el.mainGrid.querySelector('.prediction-panel')?.remove();
  if (!state.predictionsEnabled || !state.sentenceMode || state.currentMenu !== 'category') return;
  const panel = document.createElement('section'); panel.className = 'prediction-panel'; panel.setAttribute('aria-label','Suggestions');
  const title = document.createElement('strong'); title.textContent = 'Suggestions · select to add'; panel.append(title);
  const content = document.createElement('div'); content.className = 'prediction-buttons';
  const choices = predictionEngine.suggest(messageText(),{category:state.currentCategory});
  choices.forEach(({text,source}) => {
    const btn = button(text, () => { state.sentence.push({text,display:text}); renderMessage(); });
    btn.dataset.prediction = 'true'; btn.dataset.source = source; btn.dataset.speakText = text; content.append(btn);
  });
  if (!choices.length) content.textContent = 'Suggestions are ready as you build a message.';
  panel.append(content); el.mainGrid.append(panel);
}
updateScannable = function (preserve) {
  syncSentence();
  if (state.videoModalActive) { original.updateScannable(preserve); return; }
  if (tour) return setupTourScan();
  renderPredictions();
  if (el.mainGrid.classList.contains('free-active')) {
    const groups = [];
    if (messageActive()) groups.push({name:'Message',items:[el.sentenceDisplay,el.deleteWordBtn,el.clearSentenceBtn]});
    groups.push({name:'Navigation',items:[...el.mainGrid.querySelectorAll('.free-nav button:not(#backToGroups)')]},...groupElements);
    groups.push({name:'Suggestions',items:[...el.mainGrid.querySelectorAll('[data-prediction]')]});
    const back = document.getElementById('backToGroups');
    if (back) groups.forEach(g => { if (g.items.length) g.items = [...g.items,back]; });
    groupScanner = new PB.GroupScan(groups); state.currentRow = -1; state.scanIndex = -1; state.scanMode = 'row'; clearScanHighlight(); return;
  }
  original.updateScannable(preserve);
  // Match actual responsive grid columns. Suggestions always form their own row/group.
  const vocabulary = [...el.mainGrid.querySelectorAll(':scope > .grid-button')];
  const rows = messageActive() ? [[el.sentenceDisplay,el.deleteWordBtn,el.clearSentenceBtn]] : [];
  const cols = innerWidth < 760 ? 2 : state.gridSize.cols;
  for (let i=0; i<vocabulary.length; i+=cols) rows.push(vocabulary.slice(i,i+cols));
  const predictions = [...el.mainGrid.querySelectorAll('[data-prediction]')];
  if (predictions.length) rows.push(predictions);
  state.scannableRows = rows;
};
function useGroups() { return !state.videoModalActive && (tour || el.mainGrid.classList.contains('free-active')) && groupScanner; }
function paintGroups() {
  clearScanHighlight();
  const back = document.getElementById('backToGroups');
  if (back) back.hidden = !groupScanner || groupScanner.tile < 0;
  el.mainGrid.querySelectorAll('.group-active,.group-dim').forEach(n => n.classList.remove('group-active','group-dim'));
  if (!groupScanner || groupScanner.group < 0) return;
  const active = groupScanner.groups[groupScanner.group];
  state.currentRow = groupScanner.group; state.scanIndex = groupScanner.tile; state.scanMode = groupScanner.tile < 0 ? 'row' : 'column';
  const selected = groupScanner.tile < 0 ? active.items.filter(n => !n.hidden) : [active.items[groupScanner.tile]];
  selected.forEach(n => n.classList.add(groupScanner.tile < 0 ? 'row-highlight' : 'scan-highlight'));
  if (active.label) active.label.classList.add('group-active');
  if (groupScanner.tile >= 0 && state.dimGroups) groupScanner.groups.filter(g=>g!==active).forEach(g=>g.items.filter(n=>n!==back).forEach(n=>n.classList.add('group-dim')));
  selected[0]?.scrollIntoView({block:'nearest',inline:'nearest'});
  if (groupScanner.tile < 0 && state.speakGroups) speak(active.name);
  else if (groupScanner.tile >= 0 && state.ttsOnScan) speak(selected[0] === el.sentenceDisplay ? 'Speak message' : selected[0].textContent);
}
scanForward = function () { if (useGroups()) { groupScanner.move(); paintGroups(); } else original.scanForward(); };
scanBackward = function () { if (useGroups()) { groupScanner.move(-1); paintGroups(); } else original.scanBackward(); };
selectCurrent = function () {
  if (!useGroups()) return original.selectCurrent();
  const target = groupScanner.select();
  if (target) target.click();
  if (useGroups()) paintGroups();
};
highlightCurrentRow = function () { if (useGroups()) { groupScanner.back(); paintGroups(); } else original.highlightCurrentRow(); };
renderSettingsMenu = function (preserve) {
  original.renderSettingsMenu(preserve);
  const extras = [
    ['Message display: ' + state.messageDisplay, () => { state.messageDisplay = state.messageDisplay === 'text' ? 'tiles' : 'text'; renderMessage(); }],
    ['Predictions: ' + (state.predictionsEnabled ? 'on' : 'off'), () => { state.predictionsEnabled = !state.predictionsEnabled; }],
    ['Learn from spoken messages: ' + (state.rememberMessages ? 'on' : 'off'), () => { state.rememberMessages = !state.rememberMessages; }],
    ['Clear learned sentences', () => { try { localStorage.removeItem(PhrasePredictions.HISTORY_KEY); predictionEngine.setHistory([]); notifyBoard('Learned sentences cleared. Built-in and board suggestions are still available.'); } catch { notifyBoard('Could not clear history in this browser.'); } }],
    ['Spoken group names: ' + (state.speakGroups ? 'on' : 'off'), () => { state.speakGroups = !state.speakGroups; }],
    ['Dim other groups: ' + (state.dimGroups ? 'on' : 'off'), () => { state.dimGroups = !state.dimGroups; }],
    ['Help / Replay tour', () => startTour()]
  ];
  extras.forEach(([text,action]) => el.mainGrid.append(button(text,()=>{ action(); saveSettings(); if (!tour) renderSettingsMenu(); })));
  updateScannable(preserve);
};
function applySaved(data, category) {
  state.currentBoardTitle = data.boardName; buildIndex(PB.parse(data.csv)); currentRevision = data.revision || null;
  if (category && state.byCat.has(category)) openCategory(category);
  notifyBoard('Saved changes loaded: ' + data.boardName);
}
window.openRequestedBoard = function () {
  const params = new URLSearchParams(location.search);
  try {
    if (params.has('return')) {
      const data = JSON.parse(sessionStorage.getItem('phraseboard_return') || 'null');
      if (data) { applySaved(data, params.get('category')); if (!data.confirmedSave) notifyBoard('Returned to board: ' + data.boardName); return true; }
    }
    if (params.has('preview')) {
      const draft = JSON.parse(sessionStorage.getItem('phraseboard_preview') || 'null');
      if (draft) { applySaved(draft,params.get('category')); return true; }
    }
    if (params.has('saved')) { const data = PB.read(localStorage); if (data) { applySaved(data,params.get('category')); return true; } }
  } catch (error) { notifyBoard(error.message); }
  return false;
};
function editBoard() {
  if (new URLSearchParams(location.search).has('preview')) return;
  try {
    if (state.raw.length) sessionStorage.setItem('phraseboard_edit',JSON.stringify({csv:PB.csv(state.raw),boardName:state.currentBoardTitle,category:state.currentMenu === 'category' ? state.currentCategory : '',revision:PB.read(localStorage)?.revision || null}));
    else sessionStorage.removeItem('phraseboard_edit');
    location.href = 'phrase-editor.html' + (state.raw.length ? '?current=1' : '');
  } catch (error) { notifyBoard('Unable to open editor: ' + error.message); }
}
const header = document.querySelector('.header-right');
const edit = document.createElement('button'); edit.textContent = 'Edit this board'; edit.id = 'editBoard'; edit.onclick = editBoard; edit.hidden = new URLSearchParams(location.search).has('preview'); header.append(edit);
const help = document.createElement('button'); help.textContent = 'Help'; help.onclick = () => startTour(); header.append(help);
window.addEventListener('storage', event => {
  if (event.key === PhrasePredictions.HISTORY_KEY) { predictionEngine.setHistory(PhrasePredictions.readHistory(localStorage)); return; }
  if (event.key !== PB.KEY || tour || state.videoModalActive || new URLSearchParams(location.search).has('preview')) return;
  try { const data = PB.read(localStorage); if (data && data.revision !== currentRevision) applySaved(data,state.currentCategory); }
  catch (error) { notifyBoard(error.message); }
});
window.addEventListener('resize',()=>{ if (!state.videoModalActive) updateScannable(); });
// Tour actions use the same scanner and sentence functions without replacing personal data.
const tourSteps = [
  ['Welcome to your board', 'Practice with a sample board. This tour starts automatic scanning: press either switch to select. Choose Two switches for Space to move and Enter to select. Touch works too.'],
  ['Select a tile', 'Select “I” to start your message.'],
  ['Build a message', 'Select “want music”. Your words stay in the message until you speak or clear them.'],
  ['Speak your message', 'Select “Speak message”. The Text and Tiles displays speak the same message.'],
  ['Try a quick phrase', 'Select “Hello!” to speak immediately. Media tiles open a player with switch-accessible Close controls.'],
  ['Find Settings', 'Select Settings to practice changing scanning. Help always offers Replay tour.'],
  ['Adjust scanning', 'Choose one switch (automatic) or two switches (Space moves, Enter selects). These practice choices do not change your saved settings.']
];
function startTour() {
  if (tour) return;
  document.activeElement?.blur();
  if (state.videoModalActive) closeIframe();
  tour = {step:0, sentence:state.sentence, sentenceMode:state.sentenceMode, autoScan:state.autoScan, menu:state.currentMenu, category:state.currentCategory, page:state.page};
  state.sentence = []; state.sentenceMode = true; state.autoScan = true; drawTour(); startAutoScan();
}
function finishTour() {
  if (!tour) return;
  const saved = tour; tour = null; stopScanning();
  state.sentence = saved.sentence; state.sentenceMode = saved.sentenceMode; state.autoScan = saved.autoScan; state.currentMenu = saved.menu; state.currentCategory = saved.category; state.page = saved.page;
  try { localStorage.setItem('phraseboard_tour_seen','1'); } catch {}
  renderMessage(); renderCurrentMenu(); if (state.autoScan) startAutoScan(); updateHeaderForCurrentView();
}
function nextTour() { tour.step++; if (tour.step >= tourSteps.length) finishTour(); else drawTour(); }
function drawTour() {
  clearGrid(); el.mainGrid.classList.add('free-active');
  const panel = document.createElement('section'); panel.className = 'tour-panel';
  const heading = document.createElement('h2'); heading.textContent = (tour.step + 1) + ' / ' + tourSteps.length + ' · ' + tourSteps[tour.step][0];
  const description = document.createElement('p'); description.textContent = tourSteps[tour.step][1];
  panel.append(heading,description); const actions = document.createElement('div'); actions.className = 'tour-actions';
  const tasks = [ ['Start practice',nextTour], ['I',()=>{state.sentence.push({text:'I'});renderMessage();nextTour();}], ['want music',()=>{state.sentence.push({text:'want music'});renderMessage();nextTour();}], ['Speak message',()=>{speak(messageText());nextTour();}], ['Hello!',()=>{speak('Hello!');nextTour();}], ['Settings',nextTour], ['Finish tour',finishTour] ];
  actions.append(button(...tasks[tour.step]));
  if (tour.step === 0 || tour.step === 6) {
    actions.append(button('One switch: automatic',()=>{state.autoScan=true;startAutoScan();notifyBoard('Automatic scanning for practice. Press either switch to select.');}));
    actions.append(button('Two switches',()=>{state.autoScan=false;stopScanning();notifyBoard('Space moves. Enter selects.');}));
  }
  actions.append(button('Skip tour / Return to board',finishTour)); panel.append(actions); el.mainGrid.append(panel); renderMessage(); setupTourScan();
  notifyBoard(tourSteps[tour.step][1]);
}
function setupTourScan() {
  groupScanner = new PB.GroupScan([{name:'Practice',items:[...el.mainGrid.querySelectorAll('.tour-actions button')]}]);
  state.currentRow = -1; state.scanIndex = -1; state.scanMode = 'row'; clearScanHighlight();
}
renderMessage();
// Wait for the existing async board discovery to finish before offering first-use guidance.
const initialRender = renderMainMenu;
renderMainMenu = function () {
  initialRender();
  if (new URLSearchParams(location.search).has('preview')) {
    [...el.mainGrid.querySelectorAll('button')].filter(btn => ['Create Board','Load Board','Exit'].includes(cleanTextForTTS(btn.textContent))).forEach(btn => btn.remove());
    updateScannable(); return;
  }
  try { if (!localStorage.getItem('phraseboard_tour_seen') && state.firstUse && !new URLSearchParams(location.search).has('preview')) startTour(); }
  catch { /* Storage unavailable: the board remains usable. */ }
};

// Persist defaults once so new users retain sentence mode after their first board save.
if (!new URLSearchParams(location.search).has('preview')) saveSettings();

stopScanning = function () { original.stopScanning(); el.mainGrid.querySelectorAll('.group-active,.group-dim').forEach(n => n.classList.remove('group-active','group-dim')); };

window.addEventListener('blur', () => { setTimeout(() => { if (state.videoModalActive && document.activeElement?.tagName === 'IFRAME') el.closeIframeBtn.focus({preventScroll:true}); }, 0); });
window.addEventListener('keydown', event => { if (event.key === 'Escape' && state.videoModalActive) { event.preventDefault(); closeIframe(); } }, true);
