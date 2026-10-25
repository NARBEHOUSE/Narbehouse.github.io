/** Named copies of loop templates. Existing beat/song libraries are untouched. */
window.NL = window.NL || {};
NL.Loops = (function () {
    'use strict';
    const KEY = 'nl-loops-v1';
    const copy = value => JSON.parse(JSON.stringify(value));
    function read() {
        const stored = localStorage.getItem(KEY);
        if (!stored) return [];
        const data = JSON.parse(stored);
        if (!data || data.version !== 1 || !Array.isArray(data.loops)) throw Error('Saved loops could not be read.');
        const ids = new Set();
        return data.loops.filter(record => {
            if (!record || !Number.isSafeInteger(record.number) || record.number < 1 || record.id !== 'loop-' + record.number || ids.has(record.id) || !NL.Beat.validSnapshot(record.beat)) return false;
            ids.add(record.id); return true;
        });
    }
    function save() {
        const loops = read(), number = loops.reduce((n, loop) => Math.max(n, loop.number), 0) + 1;
        const record = { id: 'loop-' + number, number, beat: NL.Beat.snapshot() };
        localStorage.setItem(KEY, JSON.stringify({ version: 1, loops: loops.concat(record) }));
        return copy(record);
    }
    function open(id) {
        const record = read().find(loop => loop.id === id);
        if (!record) throw Error('This saved loop could not be found.');
        NL.Beat.restore(record.beat);
        return copy(record);
    }
    return { list: () => copy(read()), save, open };
})();
