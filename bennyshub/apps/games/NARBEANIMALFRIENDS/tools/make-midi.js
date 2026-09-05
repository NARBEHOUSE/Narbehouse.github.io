/**
 * Write music/theme.mid and music/<zone>.mid from the tunes in js/music.js and
 * js/gamesong.js.
 *
 *     node tools/make-midi.js
 *
 * The note data lives in exactly two places - js/music.js for the menu theme,
 * js/gamesong.js for the three zone themes - and this reads both rather than
 * restating them, so the .mid files and what the game actually plays cannot
 * drift apart. Re-run it whenever a tune changes.
 *
 * Every .mid here is the score, for opening in a DAW and rendering a proper
 * recorded theme. None of them is what the game plays: a browser has no MIDI
 * synthesiser, and the one way to get one - Web Audio plus a soundfont - is
 * banned in this app because an AudioContext can take down the Electron
 * renderer. See the header of js/music.js.
 *
 * Standard MIDI File, format 1: a conductor track carrying the tempo, then one
 * track per voice.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'music');

// --- loading a browser module outside a browser -------------------------------

/**
 * js/music.js and js/gamesong.js are browser modules: each hangs itself off
 * `window` and then refers to the bare global `NAF`. Both have to be in scope
 * for either to evaluate here. Nothing else is needed - Audio, btoa and
 * setTimeout are only touched at PLAY time, and reading a tune's note data
 * plays nothing.
 */
function loadModule(file, prop) {
    const src = fs.readFileSync(path.join(ROOT, 'js', file), 'utf8');
    const NAF = {};
    const shim = { NAF: NAF };
    const fn = new Function('window', 'NAF', 'console',
        src + '\n;return NAF.' + prop + ';');
    return fn(shim, NAF, console);
}

// --- SMF primitives ----------------------------------------------------------

/** MIDI variable-length quantity: seven bits a byte, high bit means "more". */
function vlq(n) {
    const out = [n & 0x7f];
    n >>= 7;
    while (n > 0) {
        out.unshift((n & 0x7f) | 0x80);
        n >>= 7;
    }
    return out;
}

function chunk(id, body) {
    const head = Buffer.alloc(8);
    head.write(id, 0, 4, 'ascii');
    head.writeUInt32BE(body.length, 4);
    return Buffer.concat([head, Buffer.from(body)]);
}

function textEvent(type, s) {
    const bytes = Array.from(Buffer.from(s, 'ascii'));
    return [0xff, type].concat(vlq(bytes.length), bytes);
}

/**
 * Turn absolute-tick events into a track body. Events are sorted by tick, and
 * note-offs sort BEFORE note-ons at the same tick so a repeated note retriggers
 * instead of being cut short by its own predecessor's release.
 */
function trackBody(events, trailing) {
    events.sort(function (a, b) {
        if (a.tick !== b.tick) return a.tick - b.tick;
        return a.order - b.order;
    });
    let body = [];
    let last = 0;
    events.forEach(function (e) {
        body = body.concat(vlq(e.tick - last), e.bytes);
        last = e.tick;
    });
    body = body.concat(vlq(0), trailing || [], [0xff, 0x2f, 0x00]);
    return body;
}

const TPQ = 480;   // ticks per quarter note

/**
 * Write one Standard MIDI File from a {beats, bpm, ...} track set and a list
 * of {name, notes, program, velocity, channel} voices.
 */
function writeMidi(outName, title, t, voices) {
    const micros = Math.round(60000000 / t.bpm);
    const tracks = [];

    tracks.push(chunk('MTrk', trackBody([
        { tick: 0, order: 0, bytes: textEvent(0x03, title) },
        { tick: 0, order: 1, bytes: [0xff, 0x51, 0x03,
            (micros >> 16) & 0xff, (micros >> 8) & 0xff, micros & 0xff] },
        // 4/4: numerator 4, denominator 2^2, 24 MIDI clocks/beat, 8 32nds/beat.
        { tick: 0, order: 2, bytes: [0xff, 0x58, 0x04, 0x04, 0x02, 0x18, 0x08] }
    ])));

    voices.forEach(function (v) {
        const events = [
            { tick: 0, order: 0, bytes: textEvent(0x03, v.name) },
            { tick: 0, order: 1, bytes: [0xc0 | v.channel, v.program] }
        ];
        v.notes.forEach(function (n) {
            const on = Math.round(n.at * TPQ);
            // A hair short, so repeated notes of the same pitch articulate.
            const off = Math.max(on + 1, Math.round((n.at + n.dur) * TPQ) - 6);
            events.push({ tick: on, order: 3, bytes: [0x90 | v.channel, n.midi, v.velocity] });
            events.push({ tick: off, order: 2, bytes: [0x80 | v.channel, n.midi, 0x00] });
        });
        tracks.push(chunk('MTrk', trackBody(events)));
    });

    const header = Buffer.alloc(6);
    header.writeUInt16BE(1, 0);              // format 1
    header.writeUInt16BE(tracks.length, 2);
    header.writeUInt16BE(TPQ, 4);

    const midi = Buffer.concat([chunk('MThd', header)].concat(tracks));

    if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
    const outFile = path.join(OUT_DIR, outName);
    fs.writeFileSync(outFile, midi);

    const bars = t.beats / 4;
    const seconds = t.beats * 60 / t.bpm;
    console.log('Wrote ' + path.relative(ROOT, outFile) + '  (' + midi.length + ' bytes)');
    console.log('  format 1, ' + tracks.length + ' tracks, ' + TPQ + ' ticks/quarter');
    console.log('  ' + t.bpm + ' BPM, ' + bars + ' bars, ' + seconds.toFixed(1) + ' seconds');
    voices.forEach(function (v) {
        console.log('  ' + v.name.padEnd(9) + v.notes.length + ' notes, GM program ' +
            (v.program + 1) + ', channel ' + (v.channel + 1));
    });
    console.log('');
}

// --- the menu theme (js/music.js) --------------------------------------------

const Music = loadModule('music.js', 'Music');
const menuTracks = Music.tracks();
writeMidi('theme.mid', 'NARBE Animal Friends - Menu Theme', menuTracks, [
    { name: 'Melody', notes: menuTracks.melody, program: 73, velocity: 92, channel: 0 },
    { name: 'Octave', notes: menuTracks.harmony, program: 9, velocity: 58, channel: 1 },
    { name: 'Bass', notes: menuTracks.bass, program: 32, velocity: 78, channel: 2 },
    { name: 'Arpeggio', notes: menuTracks.arp, program: 12, velocity: 62, channel: 3 }
]);

// --- the three zone themes (js/gamesong.js) ----------------------------------
//
// Same four-voice recipe as the menu theme, so the whole game shares one
// instrumental palette - a recorder-like lead, a glockenspiel doubling it an
// octave up in each theme's reprise, an upright bass, a marimba arpeggio.

const GameSong = loadModule('gamesong.js', 'GameSong');
const ZONE_TITLES = {
    barn: 'NARBE Animal Friends - Barn Theme',
    aquarium: 'NARBE Animal Friends - Aquarium Theme',
    safari: 'NARBE Animal Friends - Safari Theme'
};

GameSong.ZONE_IDS.forEach(function (zoneId) {
    const t = GameSong.tracks(zoneId);
    writeMidi(zoneId + '.mid', ZONE_TITLES[zoneId] || zoneId, t, [
        { name: 'Melody', notes: t.melody, program: 73, velocity: 92, channel: 0 },
        { name: 'Octave', notes: t.harmony, program: 9, velocity: 58, channel: 1 },
        { name: 'Bass', notes: t.bass, program: 32, velocity: 78, channel: 2 },
        { name: 'Arpeggio', notes: t.arp, program: 12, velocity: 62, channel: 3 }
    ]);
});
