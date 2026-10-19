/* Custom Speaker voices added from a Voice Studio export (.pocketvoice.json). The voice print stays on this device
   (IndexedDB); the voice list itself lives in the Speaker settings. communication-pocket.js reads the print back. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.NarbeCustomVoices = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const DB = 'narbe-communication-voices', STORE = 'prints', DIM = 1024, MAX_FRAMES = 400, MAX_FILE = 4_000_000;
  // Read and check a Voice Studio export. Throws a message fit to show the person adding it.
  function parse(text) {
    if (typeof text !== 'string' || text.length > MAX_FILE) throw Error('That file is too large to be a voice file.');
    let v;
    try { v = JSON.parse(text); } catch (_) { throw Error('That is not a Voice Studio voice file.'); }
    if (!v || v.format !== 'pocket-tts-voice-print') throw Error('That is not a Voice Studio voice file.');
    if (v.version !== 1) throw Error('This voice file is from a newer Voice Studio. Update the Hub and try again.');
    if (v.dim !== DIM || v.dtype !== 'float32-le' || !Number.isInteger(v.frames) || v.frames < 1 || v.frames > MAX_FRAMES || typeof v.data !== 'string') throw Error('This voice file is not for this voice model.');
    let bytes;
    try { bytes = Uint8Array.from(atob(v.data), c => c.charCodeAt(0)); } catch (_) { throw Error('This voice file is damaged.'); }
    if (bytes.length !== v.frames * DIM * 4) throw Error('This voice file is incomplete.');
    const data = new Float32Array(bytes.buffer);
    for (const x of data) if (!Number.isFinite(x) || Math.abs(x) > 1000) throw Error('This voice file is damaged.');
    const name = String(typeof v.name === 'string' ? v.name : '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40) || 'Custom voice';
    const recorded = v.made_from === 'a recording';
    return { name, recorded, frames: v.frames, data };
  }
  function open() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  async function change(fn) {
    const db = await open();
    try {
      await new Promise((resolve, reject) => {
        const t = db.transaction(STORE, 'readwrite'); fn(t.objectStore(STORE));
        t.oncomplete = resolve; t.onerror = t.onabort = () => reject(t.error || Error('The voice could not be saved on this device.'));
      });
    } finally { db.close(); }
  }
  // Ids look like "pocket:user-1a2b3c4d5e6f"; the print is stored under the part after "pocket:".
  const newId = () => 'pocket:user-' + Array.from(crypto.getRandomValues(new Uint8Array(6)), b => b.toString(16).padStart(2, '0')).join('');
  const key = id => id.slice('pocket:'.length);
  return {
    parse, newId,
    isCustomId: id => /^pocket:user-[a-f0-9]{12}$/.test(String(id)),
    save: (id, voice) => change(store => store.put({ frames: voice.frames, data: voice.data.buffer.slice(0) }, key(id))),
    remove: id => change(store => store.delete(key(id)))
  };
});
