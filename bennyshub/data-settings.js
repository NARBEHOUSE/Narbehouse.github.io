(() => {
  const groups = {
    keyboard: { label: 'Keyboard', keys: ['userKeyboardData', 'kb_settings'] },
    journal: { label: 'Journal', keys: ['benny-web:v1:journal.settings', 'benny-web:v1:journal.usedQuestions', 'benny-web:v1:journal.predictions'] },
    streaming: { label: 'Streaming', prefix: 'benny-web:v1:streaming.' },
    dayhub: { label: 'Day Hub', keys: ['dayhub_weather_web_v2'] },
    convo: { label: 'Removed app', prefix: 'benny-web:v1:conv_' }
  };
  const keys = group => group.keys || Object.keys(localStorage).filter(key => key.startsWith(group.prefix));
  const dialog = document.getElementById('confirm');
  const eraseButton = document.getElementById('erase');
  const importInput = document.getElementById('journal-import');
  const restoreDialog = document.getElementById('restore-confirm');
  const restoreApply = document.getElementById('restore-apply');
  let pendingRestore;
  const appCards = new Map();
  let selected, journalSnapshot, journalBusy = false, journalRead;
  let journalExport, journalClear, journalStorage, journalReminder, journalLastExport;

  function button(label, run) {
    const element = document.createElement('button');
    element.textContent = label;
    element.onclick = run;
    return element;
  }

  function appBusy(app, busy) {
    const card = appCards.get(app);
    if (!card) return;
    card.busy = busy;
    for (const control of card.controls) control.disabled = busy || !card.snapshot;
  }

  function renderApp(app, snapshot) {
    const card = appCards.get(app);
    card.snapshot = snapshot;
    card.source.textContent = snapshot.mode === 'companion'
      ? 'Saved in Companion, with a working copy in this browser.'
      : snapshot.mode === 'pending'
        ? 'Saved on this device; Companion synchronization is pending. ' + (snapshot.error || 'Keep this browser data until the copy has saved in Companion.')
        : 'Saved in website storage. Update to the latest Companion 1.0.8 package to keep a separate copy.';
    appBusy(app, card.busy);
  }

  async function refreshApp(app) {
    const card = appCards.get(app);
    if (card.reading) return card.reading;
    card.reading = (async () => {
      try { renderApp(app, await BennyAppStorage.read(app)); }
      catch (error) {
        card.snapshot = null;
        card.source.textContent = groupLabel(app) + ' storage is unavailable. ' + error.message;
        appBusy(app, false);
      } finally { card.reading = null; }
    })();
    return card.reading;
  }

  const groupLabel = app => groups[app].label;
  async function exportApp(app) {
    const card = appCards.get(app);
    if (card.busy) return;
    appBusy(app, true);
    try {
      const { backup, snapshot } = await BennyAppStorage.exportBackup(app);
      BennyData.download('benny-' + app + '-data.json', backup);
      renderApp(app, snapshot);
      BennyUI.status(groupLabel(app) + ' backup download requested. Check that the file was saved and keep it somewhere private.');
    } catch (error) { BennyUI.status(groupLabel(app) + ' was not exported. ' + error.message); }
    finally { appBusy(app, false); }
  }

  async function confirmClearApp(app) {
    const card = appCards.get(app);
    if (card.busy) return;
    appBusy(app, true);
    try {
      const snapshot = await BennyAppStorage.read(app);
      renderApp(app, snapshot);
      selected = { app, group: groups[app], revision: snapshot.revision };
      document.getElementById('clear-description').textContent = 'This removes ' + groupLabel(app) + ' data from ' +
        (snapshot.mode === 'browser' ? 'this browser' : 'Companion and its working copy in this browser') +
        '. Export first if you want to keep a backup. Downloaded backup files and other apps are kept.';
      dialog.showModal();
    } catch (error) { BennyUI.status(groupLabel(app) + ' was not cleared. ' + error.message); }
    finally { appBusy(app, false); }
  }

  function restoreControl(app, group) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.hidden = true;
    const trigger = button('Restore ' + group.label, () => input.click());
    input.onchange = async event => {
      const file = event.target.files[0];
      if (!file) return;
      appBusy(app, true);
      try {
        const maxBytes = BennyBackup.maxBytes(app);
        if (file.size > maxBytes) throw Error('Choose a file smaller than ' + maxBytes / 1_000_000 + ' MB.');
        const original = JSON.parse(await file.text());
        const backup = BennyBackup.validate(original, app);
        const imported = Object.entries(backup.values);
        if (!imported.length && !backup.migrationArchives?.length) {
          BennyUI.status('This ' + group.label + ' backup has no saved data to restore.');
          return;
        }
        const snapshot = await BennyAppStorage.read(app);
        renderApp(app, snapshot);
        pendingRestore = { app, label: group.label, backup: original, revision: snapshot.revision };
        restoreApply.disabled = false;
        document.getElementById('restore-error').hidden = true;
        document.getElementById('restore-title').textContent = 'Restore ' + group.label + ' data?';
        document.getElementById('restore-description').textContent = 'This will replace ' + imported.length +
          (imported.length === 1 ? ' saved data section' : ' saved data sections') + ' in ' + group.label +
          ' with the contents of this backup. Data sections not included in the file and other apps are kept. Export your current ' +
          group.label + ' data first if you want to keep a copy. Reopen the app after restoring.' +
          (backup.migrationArchives?.length ? ' This backup also contains ' + backup.migrationArchives.length + ' preserved migration copies.' : '');
        restoreDialog.showModal();
      } catch (error) { BennyUI.status(group.label + ' was not restored. ' + error.message); }
      finally { event.target.value = ''; appBusy(app, false); }
    };
    return [trigger, input];
  }

  function updateJournalControls() {
    const disabled = journalBusy || !journalSnapshot;
    journalExport.disabled = disabled;
    journalClear.disabled = disabled;
    importInput.disabled = disabled;
  }

  function renderJournal(snapshot) {
    journalSnapshot = snapshot;
    const hasWork = snapshot.entries.length > 0 || Boolean(snapshot.draft?.answer?.trim());
    journalStorage.textContent = snapshot.mode === 'companion'
      ? 'Entries and drafts save automatically in Companion. Journal preferences stay in this browser.'
      : 'Saved in website storage. Update to the latest Companion 1.0.8 package for separate journal storage.';
    journalReminder.textContent = !hasWork
      ? 'No journal entries or draft to back up yet.'
      : snapshot.exportRevision == null || snapshot.exportRevision < snapshot.revision
        ? 'Backup reminder: Export Journal to keep a copy of your latest work.'
        : 'Keep the downloaded backup somewhere private.';
    journalLastExport.textContent = snapshot.lastExportAt
      ? 'Last backup export: ' + new Date(snapshot.lastExportAt).toLocaleString() + '. Check that the downloaded file was kept.'
      : 'No backup has been exported here yet.';
    updateJournalControls();
  }

  async function refreshJournal() {
    if (journalRead) return journalRead;
    journalRead = (async () => {
      try { renderJournal(await BennyJournalStorage.read()); }
      catch (error) {
        journalSnapshot = null;
        journalStorage.textContent = 'Journal storage is unavailable. ' + error.message;
        journalReminder.textContent = 'Reconnect Companion and reload this page before exporting, restoring or clearing journal data.';
        journalLastExport.textContent = '';
        updateJournalControls();
      }
      finally { journalRead = null; }
    })();
    return journalRead;
  }

  async function exportJournal() {
    if (journalBusy) return;
    journalBusy = true;
    updateJournalControls();
    try {
      const { backup, snapshot } = await BennyJournalStorage.exportBackup();
      BennyData.download('benny-journal-data.json', backup);
      try {
        renderJournal(await BennyJournalStorage.markExport(snapshot.revision));
        BennyUI.status('Journal backup download requested. Check that the file was saved and keep it somewhere private.');
      } catch (error) {
        BennyUI.status('Journal backup download requested, but its reminder could not be updated. Check that the file was saved. ' + error.message);
      }
    } catch (error) { BennyUI.status('Journal was not exported. ' + error.message); }
    finally { journalBusy = false; updateJournalControls(); }
  }

  async function confirmClearJournal() {
    if (journalBusy) return;
    journalBusy = true;
    updateJournalControls();
    try {
      const snapshot = await BennyJournalStorage.read();
      renderJournal(snapshot);
      selected = { group: groups.journal, revision: snapshot.revision };
      document.getElementById('clear-description').textContent = 'This removes all journal entries and the saved draft from ' +
        (snapshot.mode === 'companion' ? 'Companion' : 'website storage') +
        ', plus journal preferences in this browser. Export Journal first if you want to keep a backup. Downloaded backup files are kept.';
      dialog.showModal();
    } catch (error) { BennyUI.status('Journal was not cleared. ' + error.message); }
    finally { journalBusy = false; updateJournalControls(); }
  }

  for (const [id, group] of Object.entries(groups)) {
    if (id === 'convo' && !keys(group).length) continue;
    const card = document.createElement('section');
    card.className = 'card';
    const heading = document.createElement('h2');
    heading.textContent = group.label;
    const actions = document.createElement('div');
    actions.className = 'toolbar';
    card.append(heading);
    if (id === 'journal') {
      card.id = 'journal-backup';
      journalStorage = document.createElement('p');
      journalStorage.id = 'journal-storage';
      journalStorage.textContent = 'Checking journal storage…';
      journalReminder = document.createElement('p');
      journalReminder.id = 'journal-backup-reminder';
      journalLastExport = document.createElement('p');
      journalLastExport.id = 'journal-last-export';
      journalLastExport.className = 'small';
      journalExport = button('Export Journal', exportJournal);
      journalClear = button('Clear Journal', confirmClearJournal);
      actions.append(journalExport, journalClear);
      card.append(journalStorage, journalReminder, journalLastExport);
    } else if (id !== 'convo') {
      const source = document.createElement('p');
      source.id = id + '-storage';
      source.textContent = 'Checking ' + group.label + ' storage…';
      const exportControl = button('Export ' + group.label, () => exportApp(id));
      const restoreControls = restoreControl(id, group);
      const clearControl = button('Clear ' + group.label, () => confirmClearApp(id));
      appCards.set(id, { source, snapshot: null, controls: [exportControl, ...restoreControls, clearControl], busy: false, reading: null });
      actions.append(exportControl, ...restoreControls, clearControl);
      card.append(source);
      appBusy(id, false);
    } else {
      actions.append(button('Export ' + group.label, () => {
        const data = {};
        for (const key of keys(group)) {
          const value = localStorage.getItem(key);
          if (value !== null) {
            try { data[key] = JSON.parse(value); } catch { data[key] = value; }
          }
        }
        BennyData.download('benny-' + id + '-data.json', { version: 1, app: id, data });
      }));
      actions.append(button('Clear ' + group.label, () => {
        selected = { group };
        document.getElementById('clear-description').textContent = 'This removes ' + group.label + ' data from this browser. Export first if you want to keep a backup.';
        dialog.showModal();
      }));
    }
    card.append(actions);
    document.getElementById('groups').append(card);
  }

  eraseButton.onclick = async () => {
    if (!selected || eraseButton.disabled) return;
    const target = selected;
    eraseButton.disabled = true;
    if (target.group === groups.journal) { journalBusy = true; updateJournalControls(); }
    if (target.app) appBusy(target.app, true);
    try {
      if (target.group === groups.journal) renderJournal(await BennyJournalStorage.clear(target.revision));
      if (target.app) renderApp(target.app, await BennyAppStorage.clear(target.app, target.revision));
      else for (const key of keys(target.group)) localStorage.removeItem(key);
      dialog.close();
      BennyUI.status(target.group.label + ' data cleared. Reopen the app for the empty state.');
    } catch (error) {
      dialog.close();
      BennyUI.status('Could not finish clearing ' + target.group.label + ' data. ' + error.message);
      if (target.group === groups.journal) await refreshJournal();
      if (target.app) await refreshApp(target.app);
    } finally {
      eraseButton.disabled = false;
      journalBusy = false;
      updateJournalControls();
      if (target.app) appBusy(target.app, false);
    }
  };
  document.getElementById('cancel').onclick = () => dialog.close();
  document.getElementById('restore-cancel').onclick = () => restoreDialog.close();
  restoreDialog.addEventListener('close', () => { pendingRestore = null; });
  restoreApply.onclick = async () => {
    if (!pendingRestore || restoreApply.disabled) return;
    const target = pendingRestore;
    restoreApply.disabled = true;
    appBusy(target.app, true);
    try {
      renderApp(target.app, await BennyAppStorage.restore(target.backup, target.revision));
      BennyUI.status(target.label + ' data restored. Reopen the app to use it.');
      restoreDialog.close();
    } catch (error) {
      pendingRestore = null;
      const message = document.getElementById('restore-error');
      message.textContent = target.label + ' restore did not finish. ' + error.message +
        ' Close this dialog and choose the file again to review the latest saved data.';
      message.hidden = false;
      await refreshApp(target.app);
    } finally { appBusy(target.app, false); }
  };
  document.getElementById('back').onclick = () => {
    if (parent !== window) parent.postMessage({ action: 'focusBackButton' }, location.origin);
    else location.href = 'index.html';
  };
  importInput.onchange = async event => {
    const file = event.target.files[0];
    if (!file || journalBusy) return;
    journalBusy = true;
    updateJournalControls();
    try {
      if (file.size > 8 * 1024 * 1024) throw Error('Choose a file smaller than 8 MB.');
      const backup = JSON.parse(await file.text());
      renderJournal(await BennyJournalStorage.restore(backup));
      BennyUI.status('Journal backup restored. Existing entries were kept.');
    } catch (error) { BennyUI.status('Journal was not restored. ' + error.message); }
    finally { event.target.value = ''; journalBusy = false; updateJournalControls(); }
  };
  updateJournalControls();
  BennyJournalStorage.subscribe(renderJournal);
  addEventListener('focus', refreshJournal);
  addEventListener('benny-extension-change', refreshJournal);
  refreshJournal();
  const refreshApps = () => { for (const app of appCards.keys()) refreshApp(app); };
  addEventListener('focus', refreshApps);
  addEventListener('benny-extension-change', refreshApps);
  refreshApps();
})();
