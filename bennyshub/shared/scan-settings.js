/**
 * Portable, manager-owned Scan settings cards. The host supplies scanning,
 * speech and navigation; this component owns no storage or scan clock.
 */
window.NarbeScanSettings = (function () {
  'use strict';
  const mounted = new WeakMap();
  const parkingModes = ['off', 'chosen', 'auto'];
  const parkingLabels = { off: 'Off', chosen: 'Park when chosen', auto: 'Auto park' };

  function mount(host, { manager = window.NarbeScanManager, onChange, onAnnounce } = {}) {
    if (!host?.ownerDocument || !manager?.getSettings || !manager?.updateSettings) {
      throw new Error('Scan settings require a DOM host and Scan Manager');
    }
    mounted.get(host)?.dispose();
    const document = host.ownerDocument;
    const speeds = manager.getAvailableSpeeds();
    const sensitivities = manager.getAvailableSensitivities();
    const cards = new Map(), listeners = [];
    let disposed = false, revision = 0;

    function node(tag, className, text) {
      const element = document.createElement(tag);
      if (className) element.className = className;
      if (text !== undefined) element.textContent = text;
      return element;
    }
    function grid(label) {
      const element = node('div', 'grid');
      element.setAttribute('role', 'group');
      element.setAttribute('aria-label', label);
      return element;
    }
    function card(id, title, description, mutate) {
      const button = node('button', 'card-btn');
      button.type = 'button';
      button.id = id + '-toggle';
      const kicker = node('span', 'kicker', 'Setting');
      const heading = node('div', 'btn-title', title);
      const row = node('div', 'row');
      const detail = node('p', 'desc', description);
      const value = node('span', 'pill');
      value.id = id + '-status';
      row.append(detail, value);
      button.append(kicker, heading, row);
      const click = () => {
        if (disposed || button.disabled) return;
        const before = revision;
        manager.updateSettings(mutate(manager.getSettings()));
        // Scan Manager normally notifies synchronously. Rendering here also
        // supports compatible adapters which notify on a later task.
        if (revision === before) render();
        const entry = cards.get(id);
        onAnnounce?.(entry.announcement, button, manager.getSettings());
      };
      button.addEventListener('click', click);
      listeners.push(() => button.removeEventListener('click', click));
      cards.set(id, { button, value, title, description, announcement: '' });
      return button;
    }
    function setValue(id, value, spokenValue = value, pressed) {
      const entry = cards.get(id);
      entry.value.textContent = String(value);
      entry.announcement = entry.title + ': ' + spokenValue;
      entry.button.setAttribute('aria-label', entry.announcement + '. ' + entry.description);
      if (pressed !== undefined) entry.button.setAttribute('aria-pressed', String(pressed));
    }
    const heading = node('h2', '', 'Scan');
    heading.id = 'scan-settings-heading';
    const modeGroup = grid('Scan mode and timing');
    const autoOptions = grid('Auto Scan options');
    autoOptions.id = 'auto-scan-options';

    const mode = card('autoscan', 'Auto Scan',
      'Scan choices automatically, or use Space to move one choice at a time.',
      settings => ({ autoScan: !settings.autoScan }));
    mode.setAttribute('aria-controls', autoOptions.id);
    modeGroup.append(mode);
    autoOptions.append(
      card('parking', 'Parking', 'Keep scanning, park when chosen, or park after complete loops.',
        settings => ({ parking: parkingModes[(parkingModes.indexOf(settings.parking) + 1) % parkingModes.length] })),
      card('parking-loops', 'Loops before parking', 'Park after this many complete scans.',
        settings => ({ loopsBeforeParking: settings.loopsBeforeParking % 3 + 1 })),
      card('spacebrake', 'Space brake', 'Tap Space to pause or resume the scan. Hold Space to pause while held.',
        settings => ({ spaceBrake: !settings.spaceBrake })),
      card('waitspeech', 'Wait for speech', 'Wait for each item to finish speaking before starting its scan timer.',
        settings => ({ waitForSpeech: !settings.waitForSpeech }))
    );
    modeGroup.append(card('sensitivity', 'Input Sensitivity',
      'Ignore switch bounce and very rapid repeat presses.',
      settings => ({ inputSensitivityIndex: (settings.inputSensitivityIndex + 1) % sensitivities.length })));
    modeGroup.append(card('scanspeed', 'Scan Speed', 'Time between automatic or backward scan steps.',
      settings => ({ scanSpeedIndex: (settings.scanSpeedIndex + 1) % speeds.length })));
    const owned = [heading, modeGroup, autoOptions];
    host.replaceChildren(...owned);

    function render() {
      if (disposed) return;
      const settings = manager.getSettings();
      const seconds = speeds[settings.scanSpeedIndex] / 1000;
      const sensitivity = sensitivities[settings.inputSensitivityIndex];
      setValue('autoscan', settings.autoScan ? 'On' : 'Off', undefined, settings.autoScan);
      setValue('scanspeed', seconds + ' sec', seconds + (seconds === 1 ? ' second' : ' seconds'));
      setValue('parking', parkingLabels[settings.parking]);
      setValue('parking-loops', settings.loopsBeforeParking);
      setValue('spacebrake', settings.spaceBrake ? 'On' : 'Off', undefined, settings.spaceBrake);
      setValue('waitspeech', settings.waitForSpeech ? 'On' : 'Off', undefined, settings.waitForSpeech);
      setValue('sensitivity', sensitivity + ' ms', sensitivity + ' milliseconds');
      // Keep the layout stable. Unavailable choices remain visible, but native
      // disabled buttons cannot activate and are omitted from switch scanning.
      for (const id of ['parking', 'parking-loops', 'spacebrake', 'waitspeech']) {
        cards.get(id).button.disabled = !settings.autoScan;
      }
      cards.get('parking-loops').button.disabled = !settings.autoScan || settings.parking !== 'auto';
      revision++;
      onChange?.(settings);
    }
    const api = {
      render,
      dispose() {
        if (disposed) return;
        disposed = true;
        manager.unsubscribe(render);
        for (const remove of listeners) remove();
        for (const element of owned) element.remove();
        if (mounted.get(host) === api) mounted.delete(host);
      }
    };
    mounted.set(host, api);
    manager.subscribe(render);
    render();
    return api;
  }
  return { mount };
})();
