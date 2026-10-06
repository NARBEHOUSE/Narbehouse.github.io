#!/usr/bin/env node
// Checks the Matchy Match packs listed in assetManifest.json.
//
//   node tools/check-packs.cjs               every card's picture and sound file exists,
//                                            titles are unique, category sizes; notes any
//                                            sound over 6 seconds (fine for hand-made packs,
//                                            but library sounds should stay under it)
//   node tools/check-packs.cjs --todo        also list cards still marked soundTodo
//   node tools/check-packs.cjs --write-todo  rewrite packs/SOUNDS-TODO.md from the packs
//
// Exits 1 if a file is missing or a title is used twice (the game keys sounds by title,
// so two cards with one title would share a sound in "All Categories").
'use strict';
const fs = require('fs');
const path = require('path');

const GAME = path.resolve(__dirname, '..');
const MIN_CARDS = 30;
const MAX_SOUND_SECONDS = 6;
const args = new Set(process.argv.slice(2));

// Sound length in seconds: ffprobe when installed, otherwise the WAV header or the
// MP3 bitrate of the first frame (exact for the constant-bitrate files the packs use).
let hasFfprobe = null;
function soundSeconds(file) {
    if (hasFfprobe !== false) {
        const r = require('child_process').spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' });
        hasFfprobe = !r.error;
        if (hasFfprobe && r.status === 0 && r.stdout.trim()) return parseFloat(r.stdout);
    }
    const buf = fs.readFileSync(file);
    if (buf.toString('ascii', 0, 4) === 'RIFF') {
        let byteRate = 0;
        for (let i = 12; i + 8 <= buf.length;) {
            const id = buf.toString('ascii', i, i + 4), size = buf.readUInt32LE(i + 4);
            if (id === 'fmt ') byteRate = buf.readUInt32LE(i + 16);
            if (id === 'data' && byteRate) return size / byteRate;
            i += 8 + size + (size % 2);
        }
        return null;
    }
    let start = 0;
    if (buf.toString('ascii', 0, 3) === 'ID3') start = 10 + ((buf[6] << 21) | (buf[7] << 14) | (buf[8] << 7) | buf[9]);
    for (let i = start; i + 4 < buf.length; i++) {
        if (buf[i] === 0xff && (buf[i + 1] & 0xe0) === 0xe0) {
            const mpeg1 = (buf[i + 1] & 0x18) === 0x18;
            const rates = mpeg1 ? [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
                                : [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
            const kbps = rates[buf[i + 2] >> 4];
            return kbps ? ((buf.length - i) * 8) / (kbps * 1000) : null;
        }
    }
    return null;
}

// Same as categoryToFolderName() in script.js and editor_new.js.
function categoryToFolderName(catName) {
    if (!catName || catName === 'Unassigned') return '';
    const mappings = {
        'The Simpsons': 'simpsons',
        'Aqua Teen Hunger Force': 'athf',
        'Family Guy': 'familyguy',
        'South Park': 'southpark',
        'Futurama': 'futurama',
        'Jen Hamilton': 'jenhamilton'
    };
    if (mappings[catName]) return mappings[catName];
    return catName.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Same as the pack base path logic in loadPack() in script.js.
function packBasePath(packFile) {
    const parts = packFile.split('/');
    return parts.length >= 3 ? parts.slice(0, -1).join('/') + '/' : 'packs/';
}

function resolve(packFile, cat, file) {
    if (/^(https?:|data:)/.test(file)) return null;
    if (file.startsWith('packs/') || file.startsWith('assets/')) return path.join(GAME, file);
    const folder = categoryToFolderName(cat);
    return path.join(GAME, packBasePath(packFile) + (folder ? folder + '/' : '') + file);
}

const manifest = JSON.parse(fs.readFileSync(path.join(GAME, 'assetManifest.json'), 'utf8'));
const problems = [];
const longSounds = [];
const titles = new Map();
const todo = [];
let cardCount = 0;
let soundCount = 0;

for (const packFile of manifest.packs) {
    const pack = JSON.parse(fs.readFileSync(path.join(GAME, packFile), 'utf8'));
    for (const [cat, cards] of Object.entries(pack.categories || {})) {
        if (cat === 'Unassigned') continue;
        const note = cards.length < MIN_CARDS ? `  (under ${MIN_CARDS})` : '';
        console.log(`${packFile.padEnd(48)} ${cat.padEnd(22)} ${String(cards.length).padStart(3)} cards${note}`);
        for (const card of cards) {
            cardCount++;
            const where = `${packFile} > ${cat} > ${card.title}`;
            const t = (card.title || '').trim().toLowerCase();
            if (!t) problems.push(`no title: ${where}`);
            if (titles.has(t)) problems.push(`title "${card.title}" used twice: ${titles.get(t)} and ${where}`);
            titles.set(t, where);

            const img = card.image && resolve(packFile, cat, card.image);
            if (!card.image) problems.push(`no picture: ${where}`);
            else if (img && !fs.existsSync(img)) problems.push(`missing picture ${path.relative(GAME, img)}: ${where}`);

            const sounds = card.sound ? (Array.isArray(card.sound) ? card.sound : [card.sound]) : [];
            for (const s of sounds) {
                const p = resolve(packFile, cat, s);
                if (p && !fs.existsSync(p)) problems.push(`missing sound ${path.relative(GAME, p)}: ${where}`);
                else if (p) {
                    const secs = soundSeconds(p);
                    if (secs && secs > MAX_SOUND_SECONDS) longSounds.push(`${secs.toFixed(1)}s ${path.relative(GAME, p)}: ${where}`);
                }
            }
            if (sounds.length) soundCount++;
            else if (card.soundTodo) todo.push({ pack: packFile, cat, title: card.title, idea: card.soundTodo });
        }
    }
}

console.log(`\n${cardCount} cards, ${soundCount} with their own sound, ${todo.length} marked soundTodo (they speak their name).`);

if (longSounds.length) {
    console.log(`\nNote: ${longSounds.length} sound(s) longer than ${MAX_SOUND_SECONDS} seconds (not an error):`);
    for (const l of longSounds) console.log('  ' + l);
}

if (args.has('--todo')) {
    console.log('\nCards that still need a sound:');
    for (const t of todo) console.log(`  ${t.cat} / ${t.title}: ${t.idea}`);
}

if (args.has('--write-todo')) {
    const byCat = new Map();
    for (const t of todo) {
        if (!byCat.has(t.cat)) byCat.set(t.cat, []);
        byCat.get(t.cat).push(t);
    }
    const lines = [
        '# Matchy Match: cards that still need a sound',
        '',
        'These cards have no sound file yet, so on a match the game plays the success beep and speaks the card name.',
        'Each one carries a `soundTodo` field in its pack JSON saying what sound would fit. The editor shows it',
        'as "Needs a sound: ..." under the card, and the field clears itself when a sound is attached there.',
        '',
        '- `voice: ...` means a short recorded or ElevenLabs voice line would be the right sound.',
        '- Anything else describes a sound effect to record, find on Freesound, or make with ElevenLabs.',
        '',
        'Regenerate this list with `node tools/check-packs.cjs --write-todo`.',
        ''
    ];
    for (const [cat, list] of byCat) {
        lines.push(`## ${cat} (${list.length})`, '', '| Card | Sound idea |', '|---|---|');
        for (const t of list) lines.push(`| ${t.title} | ${t.idea} |`);
        lines.push('');
    }
    fs.writeFileSync(path.join(GAME, 'packs', 'SOUNDS-TODO.md'), lines.join('\n'));
    console.log('Wrote packs/SOUNDS-TODO.md');
}

if (problems.length) {
    console.log(`\n${problems.length} problem(s):`);
    for (const p of problems) console.log('  ' + p);
    process.exit(1);
}
console.log('All picture and sound files found; titles are unique.');
