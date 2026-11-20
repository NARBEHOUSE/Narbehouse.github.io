/**
 * NARBE Space Explorer - the logbook of everywhere visited (localStorage).
 *
 * One entry per place (star, planet or moon), newest visit first: name, what
 * it is, where it is, a small picture taken on arrival, key facts (gravity,
 * moons, day length...), every creature scanned there and any aliens met.
 * Visiting again moves it to the front and counts the visit. Because places
 * come from seeds, every entry can be visited again (Visit Again).
 *
 * Storage is small and shared, so pictures are small JPEGs, only the newest
 * PICTURES entries keep theirs, and if the browser's storage is full the
 * oldest pictures go first; an entry itself is never lost to make room.
 */

window.NSE = window.NSE || {};

NSE.Logbook = (function () {
    'use strict';

    const KEY = 'nse-logbook-v1';
    const MAX = 300;
    const PICTURES = 140;

    let book = { entries: [], galaxies: [], creatures: 0 };

    function load() {
        try {
            const raw = localStorage.getItem(KEY);
            if (raw) {
                const b = JSON.parse(raw);
                if (b && Array.isArray(b.entries)) book = { entries: b.entries, galaxies: b.galaxies || [], creatures: b.creatures | 0 };
            }
        } catch (e) { /* unreadable: start a fresh book */ }
    }

    function save() {
        for (let tries = 0; tries < 60; tries++) {
            try { localStorage.setItem(KEY, JSON.stringify(book)); return true; }
            catch (e) {
                // Full: drop the oldest remaining picture and try again.
                let dropped = false;
                for (let i = book.entries.length - 1; i >= 0; i--) {
                    if (book.entries[i].picture) { book.entries[i].picture = null; dropped = true; break; }
                }
                if (!dropped) return false;
            }
        }
        return false;
    }

    function trim() {
        if (book.entries.length > MAX) book.entries.length = MAX;
        book.entries.forEach((e, i) => { if (i >= PICTURES) e.picture = null; });
    }

    function find(id) { return book.entries.find(e => e.id === id) || null; }

    /**
     * Record a visit. info = { id, kind, name, type, short, label, galaxy, galaxyName,
     * systemName, parentName, facts: [{k,v}], civ }. Returns { entry, first }.
     */
    function visit(info) {
        let e = find(info.id);
        const first = !e;
        const now = Date.now();
        if (!e) {
            e = { id: info.id, first: now, visits: 0, creatures: [], picture: null, metAliens: false };
        } else {
            book.entries.splice(book.entries.indexOf(e), 1);
        }
        Object.assign(e, {
            kind: info.kind, name: info.name, type: info.type || '', short: info.short || '', label: info.label || '',
            galaxy: info.galaxy, galaxyName: info.galaxyName || '', systemName: info.systemName || '', parentName: info.parentName || '',
            facts: info.facts || [], civ: info.civ || null, last: now
        });
        e.visits++;
        book.entries.unshift(e);
        if (book.galaxies.indexOf(info.galaxy) < 0) book.galaxies.push(info.galaxy);
        trim();
        save();
        return { entry: e, first: first };
    }

    function setPicture(id, dataUrl) {
        const e = find(id);
        if (!e || !dataUrl || dataUrl.length < 200) return;
        e.picture = dataUrl;
        trim();
        save();
    }

    /** A creature scanned at a place. Returns true the first time it is logged there. */
    function addCreature(id, name) {
        const e = find(id);
        if (!e || e.creatures.indexOf(name) >= 0) return false;
        e.creatures.push(name);
        book.creatures++;
        save();
        return true;
    }

    function metAliens(id) {
        const e = find(id);
        if (!e || e.metAliens) return;
        e.metAliens = true;
        save();
    }

    function clear() {
        book = { entries: [], galaxies: [], creatures: 0 };
        try { localStorage.removeItem(KEY); } catch (e) { /* none */ }
    }

    function stats() {
        const c = { star: 0, planet: 0, moon: 0 };
        book.entries.forEach(e => { c[e.kind] = (c[e.kind] || 0) + 1; });
        return { places: book.entries.length, stars: c.star, planets: c.planet, moons: c.moon, creatures: book.creatures, galaxies: book.galaxies.length };
    }

    load();

    return {
        list: function () { return book.entries.slice(); },
        get: find,
        visit: visit,
        setPicture: setPicture,
        addCreature: addCreature,
        metAliens: metAliens,
        clear: clear,
        stats: stats,
        _reload: load
    };
})();
