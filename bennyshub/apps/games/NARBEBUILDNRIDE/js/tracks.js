/**
 * NARBE Build n Ride - My Tracks: finished home-made loops, kept on this computer.
 *
 * Each Build track is saved by itself (localStorage, newest first, up to MAX): the
 * world's seed, the pieces and every joint's lift (BNR.Build.record), the player's presses,
 * its stations, a name ("Meadow Loop", "Desert Loop 2") and a picture: a little map of the
 * track over its landscape, drawn on a 2D canvas (no 3D needed, so it is quick and always
 * works). A track still being built is saved too (finished: false): it can be built on
 * again, but not ridden until it is connected; when it is, it is saved over itself.
 *
 *   BNR.Tracks.list() / get(id) / save(record, world, track) / put(record, world, track, id) / remove(id)
 *   BNR.Tracks.mapPicture(world, track, sites, w, h) -> a data URL
 */

window.BNR = window.BNR || {};

BNR.Tracks = (function () {
    'use strict';

    const KEY = 'bnr-tracks-v1';
    const MAX = 27;                 // three pages of nine

    function readAll() {
        try {
            const v = JSON.parse(localStorage.getItem(KEY) || '[]');
            return Array.isArray(v) ? v.filter(r => r && r.id && r.types && r.lifts) : [];
        } catch (e) { return []; }
    }

    /** Store the list; if the browser's storage is full, drop the oldest pictures, then the oldest tracks. */
    function writeAll(list) {
        for (let tries = 0; tries < list.length + 2; tries++) {
            try { localStorage.setItem(KEY, JSON.stringify(list)); return true; } catch (e) {
                const withPic = list.slice().reverse().find(r => r.picture);
                if (withPic) withPic.picture = null; else if (list.length > 1) list.pop(); else return false;
            }
        }
        return false;
    }

    /** "Meadow Loop", or "Meadow Loop 2" if there is one already: named for where most of its stations are. */
    function nameFor(rec, list) {
        const count = {};
        (rec.sites || []).forEach(s => { count[s.biome] = (count[s.biome] || 0) + 1; });
        let best = 'meadow', n = -1;
        Object.keys(count).forEach(b => { if (count[b] > n || (count[b] === n && b !== 'meadow')) { n = count[b]; best = b; } });
        const base = (BNR.Biomes.get(best).name || 'Track') + ' Loop';
        const names = new Set(list.map(r => r.name));
        if (!names.has(base)) return base;
        let k = 2;
        while (names.has(base + ' ' + k)) k++;
        return base + ' ' + k;
    }

    /** About how long a lap takes at Medium, in minutes (the same sum as the route tiles: 7 s a station). */
    function minutes(rec) {
        const speed = BNR.Ride ? BNR.Ride.SPEEDS[1].v : 9;
        const secs = (rec.length || 0) / speed + (rec.stations || 0) * 7;
        return Math.max(1, Math.round(secs / 60));
    }

    /**
     * A little map of the loop: the land's colours, water, the track (darker on bridges,
     * dashed in tunnels) and a dot for each station (the start station a star).
     */
    function mapPicture(world, track, sites, w, h) {
        w = w || 360; h = h || 240;
        let cv;
        try { cv = document.createElement('canvas'); } catch (e) { return null; }
        cv.width = w; cv.height = h;
        const g = cv.getContext && cv.getContext('2d');
        if (!g) return null;
        const c = track.centerline();
        let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
        for (let i = 0; i < c.n; i++) { x0 = Math.min(x0, c.x[i]); x1 = Math.max(x1, c.x[i]); z0 = Math.min(z0, c.z[i]); z1 = Math.max(z1, c.z[i]); }
        const pad = 40;
        x0 -= pad; z0 -= pad; x1 += pad; z1 += pad;
        const sc = Math.min(w / (x1 - x0), h / (z1 - z0));
        const ox = (w - (x1 - x0) * sc) / 2, oz = (h - (z1 - z0) * sc) / 2;
        const X = x => ox + (x - x0) * sc, Z = z => oz + (z - z0) * sc;
        // The land, in blocks of a few pixels.
        const B = 6;
        const hex = v => ('0' + Math.max(0, Math.min(255, Math.round(v * 255))).toString(16)).slice(-2);
        for (let py = 0; py < h; py += B) {
            for (let px = 0; px < w; px += B) {
                const x = x0 + (px + B / 2 - ox) / sc, z = z0 + (py + B / 2 - oz) / sc;
                const smp = world.sample(x, z);
                let col;
                if (smp.wet && smp.water - smp.h > 0.6) col = [0.27, 0.58, 0.82];
                else col = world.colorAt(x, z, smp, 0, (BNR.Weather && BNR.Weather.season()) || 'summer');
                g.fillStyle = '#' + hex(col[0]) + hex(col[1]) + hex(col[2]);
                g.fillRect(px, py, B, B);
            }
        }
        // The track: a dark casing, then the rails' colour; tunnels dashed.
        const line = function (width, colour, kinds, dash) {
            g.lineWidth = width; g.strokeStyle = colour; g.lineCap = 'round'; g.lineJoin = 'round';
            if (g.setLineDash) g.setLineDash(dash || []);
            g.beginPath();
            let on = false;
            for (let i = 0; i <= c.n; i++) {
                const k = i % c.n;
                if (i === c.n && !c.closed) break;
                const ok = !kinds || kinds.indexOf(c.struct[k]) >= 0;
                if (ok && !on) { g.moveTo(X(c.x[k]), Z(c.z[k])); on = true; } else if (ok) g.lineTo(X(c.x[k]), Z(c.z[k])); else on = false;
            }
            g.stroke();
            if (g.setLineDash) g.setLineDash([]);
        };
        line(7, '#2b2b33');
        line(3.5, '#f2ead6', ['ground']);
        line(3.5, '#ffb347', ['bridge']);
        line(3.5, '#8a8f99', ['tunnel'], [4, 4]);
        // Stations.
        (sites || []).forEach(function (s) {
            const p = BNR.Track.piecePoint(track.pieces[s.piece], s.at || 0.5);
            const px = X(p.x), pz = Z(p.z);
            g.fillStyle = s.start ? '#ffd84a' : '#e2453c';
            g.strokeStyle = '#ffffff'; g.lineWidth = 2;
            g.beginPath();
            if (s.start) {
                for (let k = 0; k < 10; k++) {
                    const a = -Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? 4 : 9;
                    if (k) g.lineTo(px + Math.cos(a) * r, pz + Math.sin(a) * r); else g.moveTo(px + Math.cos(a) * r, pz + Math.sin(a) * r);
                }
                g.closePath();
            } else g.arc(px, pz, 6, 0, Math.PI * 2);
            g.fill(); g.stroke();
        });
        try { return cv.toDataURL('image/jpeg', 0.85); } catch (e) { return null; }
    }

    function put(rec, world, track, id) {
        const list = readAll();
        const at = id ? list.findIndex(r => r.id === id) : -1;
        const out = Object.assign({}, rec);
        if (at >= 0) { out.id = id; out.created = list[at].created; out.name = list[at].name; }
        else {
            out.id = 't' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
            out.created = Date.now();
            out.name = nameFor(out, list);
        }
        out.minutes = minutes(out);
        try { out.picture = world && track ? mapPicture(world, track, rec.sites.map(s => Object.assign({}, s, { at: 0.5 })), 360, 240) : null; } catch (e) { out.picture = null; }
        if (at >= 0) list[at] = out;
        else { list.unshift(out); while (list.length > MAX) list.pop(); }
        out.saved = writeAll(list);
        return out;
    }

    return {
        MAX: MAX,
        list: function () { return readAll(); },
        get: function (id) { return readAll().find(r => r.id === id) || null; },
        /** Save a track as a new one, first in the list. Returns the saved record (with its id and name). */
        save: function (rec, world, track) { return put(rec, world, track, null); },
        /** Save a track over `id` when it is there (its name and place kept), else as a new one. */
        put: put,
        remove: function (id) { const list = readAll().filter(r => r.id !== id); return writeAll(list); },
        mapPicture: mapPicture,
        minutes: minutes
    };
})();
