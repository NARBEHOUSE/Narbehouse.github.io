/** Familiar melody phrases, one pitch per switch press. No lyrics or recordings.
 * Short verses/refrains and classical themes keep completion within reach.
 * See README for melody references and artwork provenance.
 */
window.NSS = window.NSS || {};
NSS.SongLibrary = (function () {
    'use strict';
    const CATEGORIES = [
        { id: 'nursery', name: 'Nursery Rhymes' },
        { id: 'playtime', name: 'Playtime' },
        { id: 'singalongs', name: 'Sing-Alongs' },
        { id: 'holidays', name: 'Holidays' },
        { id: 'calm', name: 'Calm Songs' },
        { id: 'classics', name: 'Famous Classics' }
    ];
    CATEGORIES.forEach(category => { category.scene = 'images/collections/' + category.id + '.webp'; });
    const SONGS = [];
    const pitch = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
    function add(category, id, name, phrase) {
        const notes = phrase.trim().split(/\s+/).map(function (note) {
            const match = /^([A-G])([#b]?)([3-6])$/.exec(note);
            if (!match) throw new Error('Invalid note in ' + id + ': ' + note);
            return (Number(match[3]) + 1) * 12 + pitch[match[1]] + (match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0);
        });
        const low = Math.min(...notes), high = Math.max(...notes);
        const shift = low < 60 ? 60 - low : high > 83 ? 83 - high : 0;
        if (high - low > 23) throw new Error('Piano range: ' + id);
        SONGS.push({ category, id, name, scene: id, notes: notes.map(note => note + shift) });
    }

    // Nursery Rhymes — familiar sung variants, including their repeated notes.
    add('nursery', 'twinkle', 'Twinkle Twinkle', `
        C4 C4 G4 G4 A4 A4 G4 F4 F4 E4 E4 D4 D4 C4
        G4 G4 F4 F4 E4 E4 D4 G4 G4 F4 F4 E4 E4 D4
        C4 C4 G4 G4 A4 A4 G4 F4 F4 E4 E4 D4 D4 C4`);
    add('nursery', 'abc', 'ABC Song', `
        C4 C4 G4 G4 A4 A4 G4 F4 F4 E4 E4 D4 D4 D4 D4 C4
        G4 G4 F4 E4 E4 D4 G4 G4 F4 E4 E4 D4
        C4 C4 G4 G4 A4 A4 G4 F4 F4 E4 E4 D4 D4 C4`);
    add('nursery', 'baabaa', 'Baa Baa Black Sheep', `
        C4 C4 G4 G4 A4 A4 A4 A4 G4 F4 F4 E4 E4 D4 D4 C4
        C4 C4 G4 G4 A4 A4 A4 A4 G4 F4 F4 E4 E4 D4 D4 C4`);
    add('nursery', 'mary', 'Mary Had a Little Lamb', `
        E4 D4 C4 D4 E4 E4 E4 D4 D4 D4 E4 G4 G4
        E4 D4 C4 D4 E4 E4 E4 E4 D4 D4 E4 D4 C4`);
    add('nursery', 'hotcross', 'Hot Cross Buns', `
        E4 D4 C4 E4 D4 C4 C4 C4 C4 C4 D4 D4 D4 D4 E4 D4 C4`);
    add('nursery', 'rowboat', 'Row Row Row Your Boat', `
        C4 C4 C4 D4 E4 E4 D4 E4 F4 G4
        C5 C5 C5 G4 G4 G4 E4 E4 E4 C4 C4 C4 G4 F4 E4 D4 C4`);
    add('nursery', 'spider', 'Itsy Bitsy Spider', `
        G4 C5 C5 C5 D5 E5 E5 E5 D5 C5 D5 E5 C5
        E5 E5 F5 G5 G5 F5 E5 F5 G5 E5
        C5 C5 D5 E5 E5 D5 C5 D5 E5 C5
        G4 G4 C5 C5 C5 D5 E5 E5 E5 D5 C5 D5 E5 C5`);
    add('nursery', 'frere', 'Frère Jacques', `
        C4 D4 E4 C4 C4 D4 E4 C4 E4 F4 G4 E4 F4 G4
        G4 A4 G4 F4 E4 C4 G4 A4 G4 F4 E4 C4 C4 G3 C4 C4 G3 C4`);

    // Playtime — one verse each, with no timed gaps or skipped switch presses.
    add('playtime', 'macdonald', 'Old MacDonald', `
        C4 C4 C4 G3 A3 A3 G3 E4 E4 D4 D4 C4
        C4 C4 C4 G3 A3 A3 G3 E4 E4 D4 D4 C4`);
    add('playtime', 'bingo', 'BINGO', `
        G3 C4 C4 C4 G3 A3 A3 G3 G3 C4 C4 D4 E4 C4
        E4 E4 F4 F4 G4 G4 E4 E4 F4 F4 G4 G4 E4 E4 F4 F4 G4 F4 E4 C4 D4 B3 C4`);
    add('playtime', 'farmer', 'The Farmer in the Dell', `
        G3 C4 C4 C4 C4 C4 D4 E4 E4 E4 E4 E4 G4 G4 A4 G4 E4 C4 D4 E4 E4 D4 D4 C4`);
    add('playtime', 'littledog', 'Oh Where Has My Little Dog Gone?', `
        E4 G4 E4 C4 B3 C4 D4 D4 B3 G3 G3 A3 G3 F4 E4 D4 G4
        G4 E4 F4 G4 E4 C4 B3 C4 D4 B3 G3 G3 A3 G3 F4 E4 D4 C4`);
    add('playtime', 'london', 'London Bridge', `
        G4 A4 G4 F4 E4 F4 G4 D4 E4 F4 E4 F4 G4
        G4 A4 G4 F4 E4 F4 G4 D4 G4 E4 C4`);
    add('playtime', 'weasel', 'Pop Goes the Weasel', `
        G3 C4 C4 D4 D4 E4 G4 E4 C4 G3 C4 C4 D4 F4 E4 C4
        G3 C4 C4 D4 D4 E4 G4 E4 C4 A4 D4 F4 E4 C4`);
    add('playtime', 'oldman', 'This Old Man', `
        G4 E4 G4 G4 E4 G4 A4 G4 F4 E4 D4 E4 F4 E4 F4 G4 C4 C4 C4
        C4 D4 E4 F4 G4 G4 D4 D4 F4 E4 D4 C4`);
    add('playtime', 'muffin', 'The Muffin Man', `
        C4 F4 F4 G4 A4 F4 F4 E4 D4 G4 G4 E4 C4 F4 F4
        C4 F4 F4 G4 A4 F4 F4 E4 D4 G4 G4 E4 C4 F4`);

    // Sing-Alongs — melody only; the player supplies the rhythm.
    add('singalongs', 'mountain', 'She’ll Be Coming Round the Mountain', `
        G3 A3 C4 C4 C4 C4 A3 G3 E3 G3 C4
        C4 D4 E4 E4 E4 G4 E4 D4 C4 D4
        E4 F4 F4 F4 F4 A4 A4 G4 G4 G4 G4 E4 C4 C4 C4 C4 A3 G3 D4 E4 D4 C4`);
    add('singalongs', 'ants', 'The Ants Go Marching', `
        A3 D4 D4 D4 E4 F4 F4 E4 F4 D4 E4 E4 E4 F4 G4 F4 E4 F4 D4
        D4 D4 A4 A4 A4 G4 G4 G4 F4 F4 F4 E4 E4 E4 F4 E4 D4 C4 D4`);
    add('singalongs', 'yankee', 'Yankee Doodle', `
        C4 C4 D4 E4 C4 E4 D4 G3 C4 C4 D4 E4 C4 B3
        C4 C4 D4 E4 F4 E4 D4 C4 B3 G3 A3 B3 C4 C4`);
    add('singalongs', 'ballgame', 'Take Me Out to the Ball Game', `
        C4 C5 A4 G4 E4 G4 D4 C4 C5 A4 G4 E4 G4
        G4 A4 B4 C5 B4 A4 G4 A4 B4 C5 A4 G4 E4 G4 C5`);
    add('singalongs', 'saints', 'When the Saints', `
        C4 E4 F4 G4 C4 E4 F4 G4 C4 E4 F4 G4 E4 C4 E4 D4
        E4 E4 D4 C4 C4 E4 G4 G4 F4 E4 F4 G4 E4 C4 D4 C4`);
    add('singalongs', 'skip', 'Skip to My Lou', `
        E4 E4 C4 C4 E4 E4 G4 D4 D4 B3 B3 D4 D4 F4
        E4 E4 C4 C4 E4 E4 G4 F4 E4 D4 C4 B3 G3 C4`);
    // Denza's refrain, upper melody of the published tune, transposed to G.
    add('singalongs', 'funiculi', 'Funiculì, Funiculà', `
        F#5 E5 F#5 E5 G5 F#5 E5 G5 F#5
        F#5 E5 F#5 E5 G5 F#5 E5 G5 D5 B4 B4 B4
        B4 B4 B4 B4 B4 B4 B4 B4 B4 B4 B4 B4 G5
        A5 G5 E5 G5 D5 B4 B4 C5 D5 C5 B4 A4 G4`);

    // Holidays.
    add('holidays', 'birthday', 'Happy Birthday', `
        G4 G4 A4 G4 C5 B4 G4 G4 A4 G4 D5 C5 G4 G4 G5 E5 C5 B4 A4 F5 F5 E5 C5 D5 C5`);
    add('holidays', 'jingle', 'Jingle Bells', `
        E4 E4 E4 E4 E4 E4 E4 G4 C4 D4 E4
        F4 F4 F4 F4 F4 E4 E4 E4 E4 G4 G4 F4 D4 C4`);
    add('holidays', 'deck', 'Deck the Halls', `
        G4 F4 E4 D4 C4 D4 E4 C4 D4 E4 F4 D4 E4 D4 C4
        G4 F4 E4 D4 C4 D4 E4 C4 A4 A4 A4 A4 G4 F4 E4 D4 C4`);
    add('holidays', 'merry', 'We Wish You a Merry Christmas', `
        G4 C5 C5 D5 C5 B4 A4 A4 A4 D5 D5 E5 D5 C5 B4 G4
        G4 E5 E5 F5 E5 D5 C5 A4 G4 G4 A4 D5 B4 C5`);
    add('holidays', 'housetop', 'Up on the Housetop', `
        F4 F4 A4 G4 G4 G4 E4 D4 F4 F4 E4 G4 G4 C4 E4
        G4 G4 A4 G4 E4 F4 G4 A4 G4 G4 A4 G4 E4 E4 D4 G4 C4`);

    // Calm Songs.
    add('calm', 'lullaby', 'Brahms’ Lullaby', `
        E4 E4 G4 E4 E4 G4 E4 G4 C5 B4 A4 A4 G4 D4 E4 F4
        D4 D4 E4 F4 D4 F4 B4 A4 G4 B4 C5`);
    add('calm', 'grace', 'Amazing Grace', `
        D4 G4 B4 G4 B4 A4 G4 E4 D4 D4 G4 B4 G4 B4 A4 D5
        B4 D5 B4 D5 B4 G4 D4 E4 G4 E4 D4 D4 G4 B4 G4 B4 A4 G4`);
    add('calm', 'greensleeves', 'Greensleeves', `
        A4 C5 D5 E5 F5 E5 D5 B4 G4 A4 B4 C5 A4 A4 G#4 A4 B4 G#4 E4
        A4 C5 D5 E5 F5 E5 D5 B4 G4 A4 B4 C5 B4 A4 G#4 F#4 G#4 A4 A4`);
    add('calm', 'range', 'Home on the Range', `
        G3 G3 C4 D4 E4 C4 B3 A3 F4 F4 F4 E4 F4 G4 C4 C4 C4 B3 C4 D4 E4 D4 C4 B3 C4`);
    add('calm', 'bonnie', 'My Bonnie Lies Over the Ocean', `
        G4 E5 D5 C5 D5 C5 A4 G4 E4 G4 E5 D5 C5 C5 B4 C5 D5
        G4 E5 D5 C5 D5 C5 A4 G4 E4 G4 A4 D5 C5 B4 A4 B4 C5`);

    // Famous Classics — a recognizable theme rather than an entire concert work.
    add('classics', 'ode', 'Ode to Joy', `
        E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 E4 D4 D4
        E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 D4 C4 C4`);
    add('classics', 'elise', 'Für Elise', `
        E5 D#5 E5 D#5 E5 B4 D5 C5 A4 C4 E4 A4 B4 E4 G#4 B4 C5
        E4 E5 D#5 E5 D#5 E5 B4 D5 C5 A4 C4 E4 A4 B4 E4 C5 B4 A4`);
    add('classics', 'entertainer', 'The Entertainer', `
        D4 D#4 E4 C5 E4 C5 E4 C5 C5 D5 D#5 E5 C5 D5 E5 B4 D5 C5
        D4 D#4 E4 C5 E4 C5 E4 C5 C5 D5 D#5 E5 C5 D5 E5 B4 D5 C5`);
    add('classics', 'cancan', 'Can-Can', `
        C4 C4 D4 F4 E4 D4 G4 G4 G4 A4 E4 F4 D4 D4 D4 F4 E4 D4 C4 C5 B4 A4 G4 F4 E4 D4 C4`);
    add('classics', 'mountainking', 'Hall of the Mountain King', `
        A4 B4 C5 D5 E5 C5 E5 D#5 B4 D#5 D5 Bb4 D5
        A4 B4 C5 D5 E5 C5 E5 A5 G5 E5 C5 E5 G5`);
    add('classics', 'williamtell', 'William Tell Overture', `
        G4 G4 G4 G4 G4 G4 G4 C5 D5 E5 G4 G4 G4 G4 G4 C5 E5 D5 B4 G4 G4 G4
        G4 G4 G4 G4 G4 C5 D5 E5 C5 E5 G5 F5 E5 D5 C5 E5 C5`);
    add('classics', 'toreador', 'Toreador Song', `
        G4 A4 G4 E4 E4 E4 D4 E4 F4 E4 F4 D4 G4 E4 C4 A3
        D4 G3 D4 D4 A4 G4 F4 E4 D4 E4 F4 E4`);
    // The march's well-known trio melody, in C for the same comfortable bell range.
    add('classics', 'starsstripes', 'Stars and Stripes Forever', `
        G4 F4 E4 E4 D#4 E4 E4 D#4 E4 E4 D#4 E4 F4 E4 D4 B4 D4 C4 C4
        C4 B3 C4 Eb4 D4 C4 C5 C4 D4 E4 G4 C4 D4 E4 G4 G3 A3 E4 D4 C4`);

    // Listening arrangements use the same complete melody as switch play.
    // Beat lengths affect only Listen to Song; the player still sets their own
    // rhythm when pressing individual notes. These are short piano arrangements.
    function timing(id, bpm, beats) {
        const song = SONGS.find(s => s.id === id);
        song.bpm = bpm;
        song.beats = beats.trim().split(/\s+/).map(Number);
        if (song.beats.length !== song.notes.length || song.beats.some(b => !(b > 0))) {
            throw new Error('Listening rhythm does not match ' + id);
        }
    }
    timing('twinkle', 112, '1 1 1 1 1 1 2  1 1 1 1 1 1 2  1 1 1 1 1 1 2  1 1 1 1 1 1 2  1 1 1 1 1 1 2  1 1 1 1 1 1 2');
    timing('abc', 112, '1 1 1 1 1 1 2  1 1 1 1 .5 .5 .5 .5 2  1 1 2 1 1 2  1 1 2 1 1 2  1 1 1 1 1 1 2  1 1 1 1 1 1 2');
    timing('baabaa', 108, '1 1 1 1 .5 .5 .5 .5 2  1 1 1 1 1 1 2  1 1 1 1 .5 .5 .5 .5 2  1 1 1 1 1 1 2');
    timing('mary', 112, '1 1 1 1 1 1 2  1 1 2 1 1 2  1 1 1 1 1 1 1 1 1 1 1 1 2');
    timing('hotcross', 112, '1 1 2 1 1 2 .5 .5 .5 .5 .5 .5 .5 .5 1 1 2');
    timing('rowboat', 100, '1.5 1.5 1 .5 1.5  1 .5 1 .5 3  .5 .5 .5 .5 .5 .5 .5 .5 .5 .5 .5 .5  1 .5 1 .5 3');
    timing('spider', 108, '.5 .5 .5 .5 .5 1 .5 1 .5 .5 .5 .5 2  .5 .5 1 1 1 .5 .5 .5 .5 2  .5 .5 1 1 1 .5 .5 .5 .5 2  .5 .5 .5 .5 .5 .5 1 .5 1 .5 .5 .5 .5 2');
    timing('frere', 112, '1 1 1 1 1 1 1 1 1 1 2 1 1 2  .5 .5 .5 .5 1 1 .5 .5 .5 .5 1 1  1 1 2 1 1 2');
    timing('macdonald', 112, '1 1 1 1 1 1 2 .5 .5 1 1 2 1 1 1 1 1 1 2 .5 .5 1 1 2');
    timing('bingo', 116, '.5 .5 .5 .5 1 1 1 1 .5 .5 .5 .5 1 2  1 1 1 1 1 2 1 1 1 1 1 2 1 1 1 1 1 .5 .5 .5 .5 1 2');
    timing('farmer', 116, '1 1 1 1 1 1 .5 .5 1 1 1 2 1 1 1 1 1 1 .5 .5 1 1 1 2');
    timing('littledog', 132, '1 1 1 2 1 1 1 2 1 1 1 1 1 2 1 1 2  1 1 1 1 2 1 1 1 2 1 1 1 1 1 2 1 1 3');
    timing('london', 116, '1.5 .5 1 1 1 1 2 1 1 2 1 1 2  1.5 .5 1 1 1 1 2 1 1 1 3');
    timing('weasel', 132, '1 1 1 1 1 1 1 1 2 1 1 1 1 1 1 3  1 1 1 1 1 1 1 1 2 2 1 1 1 3');
    timing('oldman', 120, '1 1 2 1 1 2  1 1 1 1 2 .5 .5 .5 .5 1 1 .5 .5 2  .5 .5 1 1 1 1 1 1 1 1 2');
    timing('muffin', 120, '.5 1 .5 1 1 1 1 1 1 1 1 1 1 1 2  .5 1 .5 1 1 1 1 1 1 1 1 1 1 2');
    timing('mountain', 116, '.5 .5 1 1 .5 .5 1 1 1 1 2  .5 .5 1 1 .5 .5 1 1 1 2  .5 .5 1 1 .5 .5 1 1 1 1 .5 .5 1 1 .5 .5 1 1 .5 .5 1 2');
    timing('ants', 120, '1 1 1 1 1 1 2 1 1 2 1 1 1 1 1 2 1 1 2  1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 3');
    timing('yankee', 120, '1 1 1 1 1 1 2 1 1 1 1 1 1 2 1 1 1 1 1 1 1 1 1 1 1 1 1 2');
    timing('ballgame', 144, '1 2 1 1 1 3 3 1 2 1 1 1 3 3 1 1 1 1 1 1 2 1 1 2 1 1 1 3');
    timing('saints', 116, '1 1 1 4 1 1 1 4 1 1 1 2 2 2 2 4 1 1 2 2 1 1 2 2 2 1 1 2 2 2 2 4');
    timing('skip', 120, '1 1 1 1 1 1 2 1 1 1 1 1 1 2 1 1 1 1 1 1 2 1 1 1 1 1 1 2');
    timing('funiculi', 144, '1 1 1 1 1 1 1 1 2  1 1 1 1 1 1 1 1 1 1 1 3  1 1 1 1 1 1 1 1 1 1 1 1 1 3  1 1 1 1 1 1 1 1 1 1 1 3');
    timing('birthday', 112, '.75 .25 1 1 1 2 .75 .25 1 1 1 2 .75 .25 1 1 1 1 2 .75 .25 1 1 1 2');
    timing('jingle', 120, '1 1 2 1 1 2 1 1 1.5 .5 4 1 1 1.5 .5 1 1 1 .5 .5 1 1 1 1 2');
    timing('deck', 132, '1.5 .5 1 1 1 1 1 1  .5 .5 .5 .5 1 1 2  1.5 .5 1 1 1 1 1 1  .5 .5 .5 .5 1 1 1 1 2');
    timing('merry', 144, '1 1 1 .5 .5 .5 .5 1 1 1 1 .5 .5 .5 .5 1  1 1 1 .5 .5 .5 .5 1 1 1 1 1 1 2');
    timing('housetop', 124, '1 1 1 1 .5 .5 1 1 1 1 1 1 1 1 1  1 1 1 1 1 1 2 .5 .5 1 1 1 1 1 1 1 2');
    timing('lullaby', 96, '1 1 3 1 1 3 1 1 2 1 1 2 2 1 1 2  1 1 1 2 1 1 2 1 1 2 3');
    timing('grace', 100, '1 2 .5 .5 2 1 2 1 2 1 2 .5 .5 2 1 3  2 1 2 .5 .5 2 1 2 .5 .5 2 1 2 .5 .5 2 1 3');
    timing('greensleeves', 132, '1 2 1 1.5 .5 1 2 1 1.5 .5 1 2 1 1.5 .5 1 2 1 3  1 2 1 1.5 .5 1 2 1 1.5 .5 1 1.5 .5 1 1.5 .5 1 2 3');
    timing('range', 116, '.5 .5 1 1 1 1 1 1 1 1 1 1 1 3 1 1 1 1 1 1 1 1 1 1 3');
    timing('bonnie', 132, '1 2 1 1 1 1 2 1 2 1 2 1 1.5 .5 1 3 1  1 2 1 1 1 1 2 1 2 1 2 1 1.5 .5 1 1 3');
    timing('ode', 116, '1 1 1 1 1 1 1 1 1 1 1 1 1.5 .5 2 1 1 1 1 1 1 1 1 1 1 1 1 1.5 .5 2');
    timing('elise', 100, '.5 .5 .5 .5 .5 .5 .5 .5 1.5 .5 .5 .5 1.5 .5 .5 .5 1.5  .5 .5 .5 .5 .5 .5 .5 .5 .5 1.5 .5 .5 .5 1.5 .5 .5 .5 2');
    timing('entertainer', 100, '.5 .5 .5 1 .5 1 .5 2 .5 .5 .5 1 .5 .5 1 .5 .5 2  .5 .5 .5 1 .5 1 .5 2 .5 .5 .5 1 .5 .5 1 .5 .5 2');
    timing('cancan', 144, '1 .5 .5 .5 .5 .5 1 .5 .5 .5 .5 .5 1 .5 .5 .5 .5 .5 1 .5 .5 .5 .5 .5 .5 .5 2');
    timing('mountainking', 120, '.5 .5 .5 .5 .5 .5 1 .5 .5 1 .5 .5 1  .5 .5 .5 .5 .5 .5 .5 .5 .5 .5 .5 .5 2');
    timing('williamtell', 120, '.25 .25 .5 .25 .25 .5 .5 .5 .5 1 .25 .25 .5 .25 .25 .5 .5 .5 .5 1 .25 .25  .5 .25 .25 .5 .5 .5 .5 1 .5 .5 .5 .5 .5 .5 .5 .5 2');
    timing('toreador', 108, '1.5 .5 1 1 1 1 .5 .5 1 .5 .5 1 1 1 1 2  1 1 1 1 1.5 .5 1 1 1 .5 .5 2');
    timing('starsstripes', 120, '1.5 .5 1 1 .5 .5 1 .5 .5 1 .5 .5 1 1 1 1 1 1 2  1 .5 .5 1 1 1 2 1 1 1 2 1 1 1 2 1 1 1 1 2');

    return { CATEGORIES: CATEGORIES, SONGS: SONGS };
})();
