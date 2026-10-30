'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const source = fs.readFileSync(path.resolve(__dirname, '../bennyshub/apps/games/NARBESWITCHSTORIES/js/reading-history.js'), 'utf8');
const key = 'nss-reading-history-v1';
function load(storage) {
    const listeners = {}, NSS = {};
    const context = vm.createContext({ NSS, localStorage: storage, window: { NSS, addEventListener: (name, fn) => listeners[name] = fn } });
    vm.runInContext(source, context);
    return { history: NSS.ReadingHistory, storageEvent: listeners.storage };
}
let saved = null;
const storage = { getItem: name => { assert.equal(name, key); return saved; }, setItem: (name, value) => { assert.equal(name, key); saved = value; } };
let { history } = load(storage);
assert.equal(history.count('rocky-says-hello'), 0);
history.record('rocky-says-hello');history.record('rocky-says-hello');history.record('lily-loves-books');
assert.deepEqual(JSON.parse(saved), { 'rocky-says-hello': 2, 'lily-loves-books': 1 });
history = load(storage).history;
assert.equal(history.count('rocky-says-hello'), 2, 'counts survive a fresh module load');
history.record('rocky-says-hello');assert.equal(history.count('rocky-says-hello'), 3);
for (const invalid of ['broken JSON', 'null', '[]', '"text"', '{"rocky-says-hello":-1,"lily-loves-books":"9","the-bright-night":1.5}']) {
    saved = invalid;history = load(storage).history;
    assert.equal(history.count('rocky-says-hello'), 0);
    assert.equal(history.count('lily-loves-books'), 0);
    assert.equal(history.count('the-bright-night'), 0);
    history.record('rocky-says-hello');assert.equal(JSON.parse(saved)['rocky-says-hello'], 1, 'damaged history recovers');
}
history = load({ getItem() { throw Error('storage disabled'); }, setItem() { throw Error('quota or access denied'); } }).history;
history.record('rocky-says-hello');history.record('rocky-says-hello');
assert.equal(history.count('rocky-says-hello'), 2, 'storage failures retain session counts without blocking the game');
const shared = load(storage);
shared.storageEvent({ key, newValue: '{"the-bright-night":7}' });
assert.equal(shared.history.count('the-bright-night'), 7, 'other tabs update this browser\'s history');
shared.storageEvent({ key: 'unrelated-setting', newValue: null });
assert.equal(shared.history.count('the-bright-night'), 7);
shared.storageEvent({ key: null, newValue: null });
assert.equal(shared.history.count('the-bright-night'), 0, 'clearing browser data clears history');
saved = '{"rocky-says-hello":9007199254740991}';history = load(storage).history;
history.record('rocky-says-hello');assert.equal(history.count('rocky-says-hello'), Number.MAX_SAFE_INTEGER);
console.log('Reading history: persistence, separate story counts, invalid data, unavailable storage, cross-tab updates and browser-data clearing passed.');
