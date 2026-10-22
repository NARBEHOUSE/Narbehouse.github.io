/* The project page uses the Hub's CHOICE scanner. No shared Hub code is changed. */
'use strict';
(() => {
  const $ = selector => document.querySelector(selector);
  const SM = window.NarbeScanManager;
  const VM = window.NarbeVoiceManager;
  if (!SM || !VM || !window.NarbeChoiceScanAdapter) return;
  const dock = $('#switch-dock');
  const status = $('#switch-current');
  const position = $('#switch-position');
  const readButton = $('#switch-read');
  const settingsDialog = $('#switch-settings');
  const linkDialog = $('#switch-destination');
  const lightbox = $('#lightbox');
  const HOLD = 3000;
  let enabled = false, scanner, focused = null, reading = null, readSerial = 0, feedback = null;
  let space = false, enter = false, braking = false, reversed = false;
  let reverseTimer = 0, reverseRepeat = 0, ignoreRelease = false;
  let modalReturn = false, linkDestination = null, scanAction = false;
  const sections = [...document.querySelectorAll('[data-switch-section]')];
  const groups = [...document.querySelectorAll('[data-switch-group]')];
  const clean = text => String(text || '').replace(/[↗↘↓↑✳▷◉◌]/g, '').replace(/\s+/g, ' ').trim();
  const label = element => clean(element.getAttribute('aria-label') || element.textContent);
  const heading = element => element.querySelector('h1,h2,h3,summary') || element;
  const rootItem = element => ({
    id: element.id,
    label: element.dataset.switchSection,
    element: heading(element),
    action: () => openGroup(element)
  });
  groups.forEach((element, index) => {
    if (!element.id) element.id = 'project-part-' + (index + 1);
  });
  const rootItems = sections.map(rootItem);
  rootItems.push({
    id: 'project:hub', label: 'Open Benny’s Hub. Try the real switch-accessible apps.',
    element: $('#switch-hub'), action: () => confirmLink($('#switch-hub'))
  }, {
    id: 'project:settings', label: 'Switch controls and help',
    element: $('#switch-help'), action: openSettings
  });
  function rootContext() {
    return {key: 'sections', title: 'Sections', items: rootItems, statusHost: $('#switch-badge')};
  }
  function textFor(element) {
    if (element.tagName === 'IMG') return 'Photo. ' + element.alt;
    return clean(element.innerText || element.textContent);
  }
  function narrationBlocks(scope) {
    return [...scope.querySelectorAll('h1,h2,h3,p,figcaption,summary,pre,img[alt],.flow>div')]
      .filter(element => !element.closest('[data-switch-ignore],.sr-only,[aria-hidden="true"]'))
      .filter(element => !element.matches('figcaption') || !element.querySelector('h1,h2,h3,p'))
      .filter(element => element.getClientRects().length && textFor(element))
      .map(element => ({element, text: textFor(element)}));
  }
  function chunks(text) {
    // Short chunks stay below the shared speech ticket's 10-second safety cap.
    const limit = Math.max(35, Math.min(85, Math.floor(75 * VM.getSettings().rate)));
    const words = clean(text).split(' ');
    const result = [];
    let line = '';
    for (const word of words) {
      if (line && line.length + word.length + 1 > limit) { result.push(line); line = ''; }
      line += (line ? ' ' : '') + word;
    }
    if (line) result.push(line);
    return result;
  }
  function scrollToChoice(element) {
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const bottom = dock.hidden ? innerHeight - 20 : dock.getBoundingClientRect().top - 20;
    if (rect.top < 28 || rect.bottom > bottom) {
      element.scrollIntoView({block: rect.height > bottom - 50 ? 'start' : 'center', behavior: 'instant'});
    }
  }
  function clearHighlight() {
    document.querySelectorAll('.switch-highlight').forEach(el => el.classList.remove('switch-highlight'));
  }
  function setStatus(text) {
    status.textContent = text;
    const modalStatus = document.querySelector('dialog[open] .switch-modal-status');
    if (modalStatus) modalStatus.textContent = text;
  }
  function setFeedback(text) {
    feedback = {text, context: scanner.context.key, id: scanner.getState().id};
    setStatus(text);
  }
  function refreshDock(context, state, item) {
    const isContent = !!context?.scope;
    readButton.hidden = !isContent;
    readButton.textContent = reading ? 'Stop reading' : 'Read this section aloud';
    $('#switch-back').disabled = context?.key === 'sections' && !reading;
    position.textContent = context?.title || 'Sections';
    if (reading) return;
    if (feedback && feedback.context === context.key && feedback.id === state.id) {
      setStatus(feedback.text);
      return;
    }
    feedback = null;
    setStatus(state.parked ? 'Parked — Enter resumes browsing.' :
      state.backStop || state.id === 'narbe:row-back' ? 'Back — Enter returns to the previous choices.' :
      item ? (typeof item.label === 'function' ? item.label() : item.label) :
      'No selection — Space moves to the first choice.');
    $('#switch-count').textContent = item ? (state.index + 1) + ' / ' + context.items.length : '';
  }
  function paint(item, state, context) {
    // A Back stop also dismisses the matching modal, restoring its parent choice.
    if (settingsDialog.open && context.key !== 'settings') closeNative(settingsDialog);
    if (linkDialog.open && context.key !== 'destination') closeNative(linkDialog);
    if (lightbox.open && context.key !== 'photo') closeNative(lightbox);
    [settingsDialog, linkDialog, lightbox].forEach(dialog => {
      const back = dialog.open && state.id === 'narbe:row-back';
      dialog.classList.toggle('switch-modal-back', back);
      dialog.querySelector('.switch-modal-back-label').hidden = !back;
    });
    refreshDock(context, state, item);
    if (reading) return;
    clearHighlight();
    if (item?.element) {
      item.element.classList.add('switch-highlight');
      if (focused !== item.element) {
        item.element.setAttribute('tabindex', item.element.getAttribute('tabindex') || '-1');
        item.element.focus({preventScroll: true});
        scrollToChoice(item.element);
      }
    } else if (document.activeElement !== document.body) {
      document.activeElement?.blur?.();
    }
    focused = item?.element || null;
  }
  function makeScanner() {
    if (scanner) return;
    scanner = window.NarbeChoiceScanAdapter.create({
      holdThreshold: HOLD, statusHost: $('#switch-badge'), stateHost: document.body,
      onHighlight: paint,
      onSelect: item => { feedback = null; item?.action?.(); }
    });
  }
  function start({advance = false} = {}) {
    if (enabled) return;
    makeScanner();
    enabled = true;
    document.body.removeAttribute('data-scan-exclude');
    dock.hidden = false;
    document.body.classList.add('switch-enabled');
    $('#switch-start').textContent = 'Switch browsing is on';
    scanner.sync(rootContext(), {fresh: true});
    updateDockSize();
    if (advance) scanner.step(1);
    else scanner.announce('Switch browsing on. Space moves. Enter chooses. Start with the introduction.');
  }
  function stop() {
    stopReading(false);
    cancelKeys();
    enabled = false;
    document.body.setAttribute('data-scan-exclude', '');
    scanner?.sync(null);
    VM.cancel();
    closeNative(settingsDialog);
    closeNative(linkDialog);
    closeNative(lightbox);
    clearHighlight();
    dock.hidden = true;
    document.body.classList.remove('switch-enabled');
    document.body.style.removeProperty('--switch-dock-height');
    $('#switch-start').textContent = 'Try switch browsing';
    $('#switch-start').focus({preventScroll: true});
  }
  function groupContext(scope) {
    const title = scope.dataset.switchSection || scope.dataset.switchGroup || label(heading(scope));
    const entries = [...scope.querySelectorAll('[data-switch-group],a[href],button,summary')]
      .filter(element => !element.closest('[data-switch-ignore]'))
      .filter(element => {
        const owner = element.parentElement.closest('[data-switch-group]');
        return !owner || owner === scope;
      })
      .filter(element => !element.matches('summary') && !element.disabled);
    const items = [{
      id: scope.id + ':read', label: 'Read ' + title + ' aloud',
      element: readButton, action: () => readScope(scope)
    }];
    entries.forEach((element, index) => {
      const isGroup = element.hasAttribute('data-switch-group');
      if (!isGroup && !element.getClientRects().length) return;
      items.push({
        id: element.id || scope.id + ':action:' + index,
        label: isGroup ? (element.dataset.switchGroup || label(heading(element))) : label(element),
        element: isGroup ? heading(element) : element,
        action: () => isGroup ? openGroup(element) : activate(element)
      });
    });
    if (scope.tagName === 'DETAILS') items.push({
      id: scope.id + ':collapse', label: 'Close this setup step and return',
      element: scope.querySelector('summary'),
      action: () => { scope.open = false; scanner.back({restore: true}); }
    });
    return {key: 'content:' + scope.id, scope, title, items, statusHost: $('#switch-badge')};
  }
  function openGroup(scope) {
    stopReading(false);
    if (scope.tagName === 'DETAILS') scope.open = true;
    scanner.enterGroup(groupContext(scope), {wrap: true, backStop: true});
  }
  function focusPath(target) {
    const section = target.closest('[data-switch-section]');
    if (!section) return;
    const path = [];
    for (let parent = target.parentElement; parent && parent !== section; parent = parent.parentElement) {
      if (parent.hasAttribute('data-switch-group')) path.unshift(parent);
    }
    scanner.sync(rootContext(), {fresh: true, restoreId: section.id});
    const scopes = [section, ...path];
    scopes.forEach((scope, index) => {
      if (scope.tagName === 'DETAILS') scope.open = true;
      const context = groupContext(scope);
      const wanted = index + 1 < scopes.length ? heading(scopes[index + 1]) : target;
      const restoreId = context.items.find(item => item.element === wanted)?.id || null;
      scanner.enterGroup(context, {wrap: true, backStop: true, restoreId});
    });
  }
  function returnToSections() {
    if (!enabled) start();
    stopReading(false);
    cancelKeys();
    const activeSection = scanner.context?.scope?.closest('[data-switch-section]')?.id;
    scanner.sync(rootContext(), {fresh: true, restoreId: activeSection || null});
  }
  function goBack() {
    if (reading) { stopReading(); return; }
    if (!scanner.back({restore: true})) returnToSections();
  }
  function activate(element) {
    if (element.matches('a[href]:not([data-lightbox])')) {
      const url = new URL(element.href, location.href);
      if (url.origin === location.origin && url.pathname === location.pathname && url.hash) {
        const target = document.getElementById(decodeURIComponent(url.hash.slice(1)));
        const section = target?.closest('[data-switch-section]') || sections[0];
        const group = target?.closest('[data-switch-group]');
        if (group && group !== section) {
          focusPath(heading(group));
        } else {
          scanner.sync(rootContext(), {fresh: true, restoreId: section.id});
          openGroup(section);
        }
        return;
      }
      confirmLink(element);
      return;
    }
    scanAction = true;
    try { element.click(); } finally { scanAction = false; }
  }
  function openSettings() {
    stopReading(false);
    if (!enabled) start();
    scanner.sync(rootContext(), {fresh: true, restoreId: 'project:settings'});
    settingsDialog.showModal();
    syncSettings();
    scanner.enterGroup(settingsContext(), {wrap: true, backStop: true});
  }
  function settingsContext() {
    return {
      key: 'settings', title: 'Switch controls', statusHost: $('#settings-badge'),
      items: [
        {id: 'settings:help', element: $('#switch-read-help'), label: 'Read the switch instructions aloud', action: () => readScope($('#switch-help-copy'))},
        {id: 'settings:tts', element: $('#switch-tts'), label: () => label($('#switch-tts')), action: () => {
          VM.toggleTTS(); syncSettings(); scanner.announce(VM.getSettings().ttsEnabled ? 'Spoken feedback on.' : 'Spoken feedback off.');
        }},
        {id: 'settings:voice', element: $('#switch-voice'), label: () => label($('#switch-voice')), action: () => {
          VM.cycleVoice(); syncSettings(); scanner.announce(label($('#switch-voice')));
        }},
        {id: 'settings:auto', element: $('#switch-auto'), label: () => label($('#switch-auto')), action: () => {
          SM.toggleAutoScan(); syncSettings(); scanner.announce(label($('#switch-auto')));
        }},
        {id: 'settings:speed', element: $('#switch-speed'), label: () => label($('#switch-speed')), action: () => {
          SM.cycleScanSpeed(); syncSettings(); scanner.announce(label($('#switch-speed')));
        }},
        {id: 'settings:close', element: $('#switch-settings-close'), label: 'Return to browsing', action: goBack},
        {id: 'settings:off', element: $('#switch-off'), label: 'End switch browsing. Use ordinary keyboard, mouse or touch.', action: stop}
      ]
    };
  }
  function syncSettings() {
    $('#switch-tts').textContent = 'Spoken feedback: ' + (VM.getSettings().ttsEnabled ? 'On' : 'Off');
    $('#switch-voice').textContent = 'Voice: ' + VM.getVoiceDisplayName(VM.getCurrentVoice());
    $('#switch-auto').textContent = 'Auto scan: ' + (SM.getSettings().autoScan ? 'On — one switch' : 'Off — two switches');
    $('#switch-speed').textContent = 'Scan speed: ' + SM.getScanInterval() / 1000 + ' seconds';
    if (enabled && scanner.context?.key === 'settings') scanner.sync(settingsContext());
  }
  function confirmLink(link) {
    stopReading(false);
    linkDestination = new URL(link.href, location.href);
    const isHub = linkDestination.pathname === '/bennyshub/' && linkDestination.origin === location.origin;
    $('#switch-destination-title').textContent = isHub ? 'Try Benny’s Hub' : 'Open ' + label(link);
    $('#switch-destination-copy').textContent = isHub ?
      'Benny’s Hub uses the same Space and Enter controls. This opens the real apps in this tab, with your switch and voice preferences.' :
      'This opens ' + linkDestination.hostname + ' in this tab. Other websites may need a mouse, touch or ordinary keyboard controls.';
    linkDialog.showModal();
    scanner.enterGroup({
      key: 'destination', title: 'Open a link', statusHost: $('#destination-badge'),
      items: [
        {id: 'destination:cancel', label: 'Stay on the project page', element: $('#switch-link-cancel'), action: goBack},
        {id: 'destination:open', label: isHub ? 'Open Benny’s Hub. Space moves and Enter selects there too.' : 'Continue to ' + linkDestination.hostname,
          element: $('#switch-link-open'), action: () => { VM.cancel(); location.assign(linkDestination.href); }}
      ]
    }, {wrap: true, backStop: true});
    scanner.announce($('#switch-destination-copy').textContent + ' Stay on the project page is selected.');
  }
  function closeNative(dialog) {
    if (!dialog.open) return;
    modalReturn = true;
    dialog.close();
    modalReturn = false;
  }
  function closeModal(dialog) {
    if (modalReturn || !enabled) return;
    stopReading(false);
    const expected = dialog === settingsDialog ? 'settings' : dialog === linkDialog ? 'destination' : 'photo';
    if (scanner.context?.key === expected) goBack();
  }
  [settingsDialog, linkDialog, lightbox].forEach(dialog => {
    // The close event is queued; its current scanner context distinguishes native dismissal.
    dialog.addEventListener('close', () => closeModal(dialog));
  });
  document.addEventListener('project:lightbox-open', event => {
    if (!enabled) return;
    stopReading(false);
    if (!scanAction) focusPath(event.detail.trigger);
    scanner.enterGroup({
      key: 'photo', title: 'Enlarged photo', statusHost: $('#photo-badge'),
      items: [
        {id: 'photo:describe', label: 'Read the photo description', element: $('#photo-read'),
          action: () => readScope($('#lightbox-caption'))},
        {id: 'photo:close', label: 'Close photo and return', element: lightbox.querySelector('.lightbox-close'), action: goBack}
      ]
    }, {wrap: true, backStop: true});
    scanner.announce('Photo opened. ' + lightbox.querySelector('img').alt);
  });
  document.addEventListener('project:announce', event => {
    if (enabled) scanner.announce(event.detail);
  });
  function stopReading(announce = true) {
    if (!reading) return;
    ++readSerial;
    reading.ticket?.cancel();
    VM.cancel();
    reading.element?.classList.remove('switch-reading');
    reading = null;
    document.body.dataset.reading = 'false';
    $('#switch-reading-text').textContent = '';
    $('#switch-stop-reading').hidden = true;
    $('#settings-stop-reading').hidden = true;
    $('#photo-stop-reading').hidden = true;
    scanner.setInputHeld(space || enter);
    refreshDock(scanner.context, scanner.getState(), scanner.context?.items[scanner.getState().index]);
    if (announce) scanner.announce('Reading stopped. Continue with Space, or Enter to read again.');
  }
  async function readScope(scope) {
    if (reading) { stopReading(); return; }
    feedback = null;
    if (!VM.getSettings().ttsEnabled) {
      setFeedback('Spoken feedback is off. Turn it on in Switch controls to read aloud.');
      return;
    }
    const blocks = scope.matches('p') ? [{element: scope, text: textFor(scope)}] : narrationBlocks(scope);
    if (!blocks.length) return;
    const serial = ++readSerial;
    reading = {element: null, ticket: null};
    document.body.dataset.reading = 'true';
    $('#switch-stop-reading').hidden = false;
    $('#settings-stop-reading').hidden = !settingsDialog.open;
    $('#photo-stop-reading').hidden = !lightbox.open;
    readButton.textContent = 'Stop reading';
    scanner.setInputHeld(true);
    for (const block of blocks) {
      if (!reading || serial !== readSerial) return;
      reading.element?.classList.remove('switch-reading');
      reading.element = block.element;
      block.element.classList.add('switch-reading');
      scrollToChoice(block.element);
      for (const part of chunks(block.text)) {
        if (!reading || serial !== readSerial) return;
        $('#switch-reading-text').textContent = part;
        setStatus('Reading aloud — Enter stops; Space stops and moves on.');
        reading.ticket = VM.speak(part);
        const result = await reading.ticket.finished;
        if (!reading || serial !== readSerial) return;
        if (result.reason !== 'end') {
          stopReading(false);
          setFeedback('Speech stopped or is unavailable. The text remains on the page; Space and Enter still work.');
          return;
        }
      }
    }
    stopReading(false);
    scanner.announce('Finished reading. Space explores the choices. Enter reads again.');
    setFeedback('Finished reading — Space explores; Enter reads again.');
  }
  function cancelKeys() {
    clearTimeout(reverseTimer); clearInterval(reverseRepeat);
    space = enter = braking = reversed = false;
    ignoreRelease = true;
    if (scanner?.active) scanner.cancelInput();
    if (reading) scanner?.setInputHeld(true);
  }
  const isSwitch = event => ['Space','Enter','NumpadEnter'].includes(event.code);
  function keyDown(event) {
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    if (event.key === 'Tab' && enabled) { stop(); return; }
    if (!isSwitch(event)) return;
    if (!enabled) {
      if (event.target.closest('a,button,input,select,textarea,summary,[contenteditable="true"]')) return;
      event.preventDefault();
      if (event.repeat) return;
      start();
    }
    event.preventDefault();
    event.stopPropagation();
    if (event.repeat) return;
    ignoreRelease = false;
    if (event.code === 'Space') {
      if (!reading && scanner.brakePress()) { braking = true; return; }
      space = true; reversed = false;
      scanner.setInputHeld(true);
      if (!reading && !SM.getSettings().autoScan) reverseTimer = setTimeout(() => {
        reversed = true;
        scanner.step(-1);
        reverseRepeat = setInterval(() => scanner.step(-1), SM.getScanInterval());
      }, HOLD);
    } else {
      enter = true;
      scanner.setInputHeld(true);
    }
  }
  function keyUp(event) {
    if (!enabled || !isSwitch(event)) return;
    event.preventDefault(); event.stopPropagation();
    const wasReading = !!reading;
    if (event.code === 'Space') {
      if (braking) { braking = false; scanner.brakeRelease(); return; }
      const move = space && !reversed && !ignoreRelease;
      clearTimeout(reverseTimer); clearInterval(reverseRepeat);
      space = reversed = false;
      if (move) {
        if (wasReading) stopReading(false);
        scanner.step(1);
      }
    } else {
      const choose = enter && !ignoreRelease;
      enter = false;
      if (choose) {
        if (wasReading) stopReading();
        else scanner.select();
      }
    }
    scanner.setInputHeld(!!reading || space || enter);
  }
  $('#switch-start').addEventListener('click', () => { start(); if (scanner.getState().index < 0) scanner.step(1); });
  $('#switch-next').addEventListener('click', () => { stopReading(false); scanner.step(1); });
  $('#switch-choose').addEventListener('click', () => reading ? stopReading() : scanner.select());
  $('#switch-back').addEventListener('click', returnToSections);
  $('#switch-help').addEventListener('click', openSettings);
  $('#switch-help-intro').addEventListener('click', openSettings);
  readButton.addEventListener('click', () => scanner.context?.scope && readScope(scanner.context.scope));
  ['switch-stop-reading','settings-stop-reading','photo-stop-reading'].forEach(id => {
    document.getElementById(id).addEventListener('click', () => stopReading());
  });
  settingsContext().items.forEach(item => item.element.addEventListener('click', () => { feedback = null; item.action(); }));
  $('#switch-link-cancel').addEventListener('click', goBack);
  $('#switch-link-open').addEventListener('click', () => { VM.cancel(); location.assign(linkDestination.href); });
  $('#photo-read').addEventListener('click', () => readScope($('#lightbox-caption')));
  // Mouse/touch remain direct. Explicit section links re-establish the scan position.
  document.addEventListener('click', event => {
    if (!enabled || scanAction || event.target.closest('#switch-dock,dialog,[data-switch-ignore]')) return;
    const section = event.target.closest('[data-switch-section]');
    if (!section || event.target.closest('[data-lightbox]')) return;
    if (event.target.closest('a,button,summary')) {
      stopReading(false);
      scanner.sync(rootContext(), {fresh: true, restoreId: section.id});
    }
  });
  document.addEventListener('keydown', keyDown);
  document.addEventListener('keyup', keyUp);
  document.addEventListener('narbe-input-cancelled', cancelKeys);
  window.addEventListener('blur', () => { cancelKeys(); stopReading(false); });
  window.addEventListener('pagehide', () => { cancelKeys(); stopReading(false); VM.cancel(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { cancelKeys(); stopReading(false); }
  });
  SM.subscribe(() => { cancelKeys(); syncSettings(); });
  VM.onSettingsChange(() => { if (reading) stopReading(false); syncSettings(); });
  function updateDockSize() {
    if (enabled) document.body.style.setProperty('--switch-dock-height', dock.offsetHeight + 'px');
  }
  new ResizeObserver(updateDockSize).observe(dock);
  [settingsDialog, linkDialog, lightbox].forEach(dialog => {
    const modalStatus = document.createElement('p');
    modalStatus.className = 'switch-modal-status';
    modalStatus.setAttribute('role', 'status');
    dialog.append(modalStatus);
    const message = document.createElement('p');
    message.className = 'switch-modal-back-label';
    message.textContent = 'Back — Enter returns to the previous choices.';
    message.setAttribute('role', 'status');
    message.hidden = true;
    dialog.append(message);
  });
  document.body.setAttribute('data-scan-exclude', '');
  syncSettings();
  document.body.classList.add('switch-ready');
})();
