/** Free Play is a CHOICE surface: every piano key plays on selection/release.
 * Sound uses the existing piano WAVs; the visible history follows actual choices.
 */
window.NSS = window.NSS || {};
NSS.FreePlay = (function () {
    'use strict';
    const NS = 'http://www.w3.org/2000/svg';
    const FIRST_NOTE = 60, LAST_NOTE = 84;
    const NAMES = ['C', 'C sharp', 'D', 'D sharp', 'E', 'F', 'F sharp', 'G', 'G sharp', 'A', 'A sharp', 'B'];
    const LABELS = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
    const NOTES = Array.from({ length: LAST_NOTE - FIRST_NOTE + 1 }, function (_, i) {
        const midi = FIRST_NOTE + i, pitch = midi % 12, octave = Math.floor(midi / 12) - 1;
        return {
            midi: midi,
            name: midi === FIRST_NOTE ? 'Low C' : midi === LAST_NOTE ? 'High C' : NAMES[pitch] + ' ' + octave,
            label: LABELS[pitch] + octave,
            black: [1, 3, 6, 8, 10].includes(pitch)
        };
    });
    const WHITE_KEYS = NOTES.filter(note => !note.black).length;
    const NOTE_SHAPE = 'M65 22h10v91c0 17-38 25-42 7-3-16 18-25 32-20z';
    const HISTORY_LIMIT = 10, STORAGE_KEY = 'nss-freeplay-v1';
    let sequence = 0, savedNotes = [], noteIds = [], symbolCount = 0, keys = [], stage, hero, trail, historyTitle, caption, keyboard, options, replayButton, deleteButton, hint;
    let keyTimer = null, motionTimer = null, replayFrame = null, replaying = false, replayIndex = -1;
    let deleting = false, noteChoices = [], choosingKeys = false, openingKeys = false;
    let holdBar;
    const KEY_HINT = 'Choose a key. Hold down the space bar to go back. Your last 10 notes are saved.';
    const DEFAULT_HINT = 'Choose the keyboard, then press Enter to choose individual keys. Or scan to the buttons below.';
    function idleHint() { return choosingKeys ? KEY_HINT : DEFAULT_HINT; }

    function loadNotes() {
        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
            if (!saved || !Array.isArray(saved.notes) || !saved.notes.every(m => Number.isInteger(m) && m >= FIRST_NOTE && m <= LAST_NOTE)) return;
            savedNotes = saved.notes.slice(-HISTORY_LIMIT);
            sequence = Number.isSafeInteger(saved.sequence) && saved.sequence >= savedNotes.length ? saved.sequence : savedNotes.length;
            // Older saves only have pitches. Keep each occurrence distinct, even
            // when the same key was chosen twice or a middle note is removed.
            const ids = Array.isArray(saved.ids) ? saved.ids.slice(-HISTORY_LIMIT) : [];
            noteIds = ids.length === savedNotes.length && ids.every((id, i) => Number.isSafeInteger(id) && id > 0 && id <= sequence && (!i || id > ids[i - 1]))
                ? ids : savedNotes.map((_, i) => sequence - savedNotes.length + 1 + i);
        } catch (e) { /* an unavailable or invalid save starts empty */ }
    }

    function saveNotes() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ notes: savedNotes, ids: noteIds, sequence: sequence })); }
        catch (e) { /* keep the current song available for this session */ }
    }

    function node(tag, cls, parent, text) {
        const el = document.createElement(tag);
        el.className = cls;
        if (text !== undefined) el.textContent = text;
        if (parent) parent.appendChild(el);
        return el;
    }

    /** Crisp at every tablet size; the gradient shares the piano artwork's palette. */
    function symbol() {
        const svg = document.createElementNS(NS, 'svg');
        svg.setAttribute('viewBox', '0 0 144 144');
        svg.setAttribute('width', '144'); svg.setAttribute('height', '144');
        svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
        const id = 'nss-free-gradient-' + ++symbolCount;
        const defs = document.createElementNS(NS, 'defs');
        const gradient = document.createElementNS(NS, 'linearGradient');
        gradient.id = id;
        gradient.setAttribute('x1', '0'); gradient.setAttribute('y1', '0');
        gradient.setAttribute('x2', '1'); gradient.setAttribute('y2', '1');
        [['0%', 'var(--free-light, #e2fbff)'], ['35%', 'var(--free-main, #6be6ff)'], ['72%', 'var(--free-deep, #9174ff)'], ['100%', 'var(--free-light, #ffbcdf)']].forEach(function (values) {
            const stop = document.createElementNS(NS, 'stop');
            stop.setAttribute('offset', values[0]); stop.setAttribute('stop-color', values[1]); gradient.appendChild(stop);
        });
        defs.appendChild(gradient);
        const path = document.createElementNS(NS, 'path');
        path.setAttribute('d', NOTE_SHAPE);
        path.setAttribute('fill', 'url(#' + id + ')'); path.setAttribute('fill-rule', 'evenodd');
        path.setAttribute('stroke', 'var(--free-light, #d5f7ff)'); path.setAttribute('stroke-width', '1.2');
        svg.append(defs, path);
        return svg;
    }

    function build(parent) {
        loadNotes();
        stage = node('div', 'nss-free-stage', parent);
        const staff = node('div', 'nss-free-staff', stage);
        staff.setAttribute('aria-hidden', 'true');
        for (let i = 0; i < 5; i++) node('i', '', staff);
        const currentNote = node('div', 'nss-free-current', stage);
        hero = node('div', 'nss-free-symbol', currentNote);
        hero.setAttribute('aria-hidden', 'true');
        hero.appendChild(symbol());
        caption = node('div', 'nss-free-note-name', currentNote, 'Your music');
        const history = node('div', 'nss-free-history', stage);
        historyTitle = node('div', 'nss-free-history-title', history, 'Your notes, in order');
        historyTitle.id = 'nss-free-history-title';
        trail = node('ol', 'nss-free-trail', history);
        trail.setAttribute('aria-labelledby', historyTitle.id);

        keyboard = node('div', 'nss-piano-scroll nss-free-scroll', parent);
        keyboard.setAttribute('role', 'group'); keyboard.setAttribute('aria-label', 'Keyboard. Choose individual keys');
        const piano = node('div', 'nss-free-piano', keyboard);
        piano.style.setProperty('--white-keys', WHITE_KEYS);
        let white = 0;
        keys = NOTES.map(function (note) {
            const key = node('button', 'nss-btn nss-key nss-free-key ' + (note.black ? 'black' : 'white'), piano);
            key.type = 'button'; key.dataset.midi = note.midi;
            key.setAttribute('aria-label', note.name);
            key.style.setProperty('--key-left', (note.black ? white - .31 : white) * 100 / WHITE_KEYS + '%');
            // Narrow portrait screens show both octaves as two complete rows.
            const secondRow = note.midi >= 72, rowWhites = secondRow ? 8 : 7;
            const rowWhite = white - (secondRow ? 7 : 0);
            key.style.setProperty('--row-left', (note.black ? rowWhite - .31 : rowWhite) * 100 / rowWhites + '%');
            key.style.setProperty('--row-width', (note.black ? .62 : 1) * 100 / rowWhites + '%');
            key.style.setProperty('--row-top', secondRow ? 'calc(50% + 5px)' : '0px');
            key.style.setProperty('--note-color', 'hsl(' + ((note.midi - 60) * 27 + 170) % 360 + ' 90% 62%)');
            node('span', 'nss-key-label', key, note.label);
            // Pointer users can play any visible key even while the switch scan
            // treats the keyboard as one choice. Own this click exactly once.
            key.dataset.nssWired = '1';
            key.addEventListener('click', function (event) {
                event.preventDefault(); event.stopPropagation();
                if (NSS.UI.current() !== 'free') return;
                NSS.Input.leaveGroups();
                chooseKeys(note.midi);
                play(note.midi);
            });
            if (!note.black) white++;
            return key;
        });
        const foot = node('div', 'nss-song-foot', parent);
        hint = node('p', 'nss-hint', foot, DEFAULT_HINT);
        const actions = node('div', 'nss-song-actions', foot);
        replayButton = node('button', 'nss-btn nss-ctrl nss-listen', actions, 'Replay My Song');
        replayButton.type = 'button';
        replayButton.disabled = !savedNotes.length;
        replayButton.setAttribute('aria-pressed', 'false');
        deleteButton = node('button', 'nss-btn nss-ctrl nss-delete-note', actions, 'Delete Note');
        deleteButton.type = 'button'; deleteButton.disabled = !savedNotes.length;
        options = node('button', 'nss-btn nss-ctrl nss-options', actions, 'Options');
        options.type = 'button';
        holdBar = node('span', 'nss-hold', options);
        holdBar.setAttribute('aria-hidden', 'true');
        window.addEventListener('blur', stop);
        window.addEventListener('pagehide', stop);
        document.addEventListener('narbe-input-cancelled', stop);
        document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); });
    }

    function holdRing(p) {
        if (!holdBar) return;
        holdBar.style.setProperty('--p', p.toFixed(3));
        options.classList.toggle('holding', p > 0);
    }

    function stop() {
        const wasReplaying = replaying;
        replaying = false;
        cancelAnimationFrame(replayFrame); replayFrame = null; replayIndex = -1;
        if (wasReplaying) NSS.Sound.stopListening();
        clearTimeout(keyTimer); clearTimeout(motionTimer);
        keyTimer = motionTimer = null;
        keys.forEach(key => key.classList.remove('pressed'));
        if (hero) hero.classList.remove('playing');
        if (trail) Array.from(trail.children).forEach(mark => mark.classList.remove('arriving'));
        if (wasReplaying) {
            renderHistory();
            if (savedNotes.length) showNote(savedNotes[savedNotes.length - 1]);
            updateReplayButton();
            hint.textContent = idleHint();
        }
    }

    function leave() { choosingKeys = false; stop(); if (deleting) endDelete(); }

    function reset() {
        leave();
        hero.replaceChildren(symbol());
        caption.textContent = 'Your music';
        renderHistory();
        stage.removeAttribute('style');
        if (savedNotes.length) showNote(savedNotes[savedNotes.length - 1]);
        hint.textContent = idleHint();
        keyboard.scrollLeft = 0;
    }

    function renderHistory(arriving) {
        trail.replaceChildren();
        noteChoices = [];
        trail.start = noteIds[0] || 1;
        savedNotes.forEach(function (midi, i) {
            const index = midi - 60, note = NOTES[index], number = noteIds[i];
            const mark = node('li', 'nss-free-history-key ' + (note.black ? 'black' : 'white'), trail);
            mark.dataset.midi = midi; mark.value = number;
            if (!deleting) mark.setAttribute('aria-label', number + ': ' + note.name);
            if (!deleting && i === savedNotes.length - 1) {
                mark.setAttribute('aria-current', 'true');
                if (arriving) mark.classList.add('arriving');
            }
            mark.style.setProperty('--note-color', 'hsl(' + (index * 27 + 170) % 360 + ' 90% 62%)');
            const target = deleting ? node('button', 'nss-free-history-pick', mark) : mark;
            if (deleting) {
                target.type = 'button';
                const label = 'Delete note ' + number + ': ' + note.name;
                target.setAttribute('aria-label', label);
                noteChoices.push({ id: 'free:note:' + number, el: target, speak: label, action: function () { deleteNote(number); } });
                target.addEventListener('click', function (event) {
                    event.preventDefault(); event.stopPropagation(); deleteNote(number);
                });
            }
            node('span', 'nss-free-history-number', target, String(number));
            node('span', 'nss-free-history-note', target, midi === FIRST_NOTE || midi === LAST_NOTE ? note.name : note.label);
        });
        historyTitle.textContent = deleting ? 'Choose a note to delete' : sequence > HISTORY_LIMIT ? 'Your last 10 notes, in order' : 'Your notes, in order';
    }

    function beginDelete() {
        if (deleting || !savedNotes.length) return;
        stop(); deleting = true;
        stage.classList.add('deleting');
        caption.textContent = 'Delete a note';
        hint.textContent = 'Choose a note to delete. Choose Back to keep your notes.';
        renderHistory();
        if (!NSS.Input.enterGroup('free:delete-notes', noteChoices)) endDelete();
    }

    function endDelete() {
        deleting = false; stage.classList.remove('deleting');
        renderHistory();
        if (savedNotes.length) showNote(savedNotes[savedNotes.length - 1]);
        else caption.textContent = 'Your music';
        hint.textContent = DEFAULT_HINT;
    }

    function deleteNote(id) {
        if (!deleting || NSS.UI.current() !== 'free') return;
        const index = noteIds.indexOf(id);
        if (index < 0) return;
        const name = NOTES[savedNotes[index] - 60].name;
        savedNotes.splice(index, 1); noteIds.splice(index, 1); saveNotes();
        NSS.Input.back(); // restores Delete Note; onScan closes the editor
        updateReplayButton();
        NSS.Input.announce('Deleted note ' + id + ': ' + name + '. ' + (savedNotes.length ? 'Delete Note' : 'No saved notes'));
    }

    function onScan(state) {
        if (deleting && state.depth === 0) endDelete();
        // Finish a pass through the keys at the whole-keyboard stop. Outside
        // that pass, keys never enter the scan until the player chooses them.
        // Keep this in the existing root loop so passing the keyboard reaches
        // Replay/Delete/Options in both manual and Auto Scan.
        if (choosingKeys && !openingKeys && !String(state.id || '').startsWith('free:key:')) {
            choosingKeys = false;
            NSS.Input.refresh(false); // retain this choice, brake and root parking state
        }
        if (!deleting && !replaying) hint.textContent = idleHint();
    }

    function chooseKeys(midi) {
        choosingKeys = true;
        openingKeys = true;
        try {
            NSS.Input.refresh(false);
            NSS.Input.align('free:key:' + (midi === undefined ? FIRST_NOTE : midi));
        } finally { openingKeys = false; }
    }

    function showNote(midi) {
        const index = midi - 60, hue = (index * 27 + 170) % 360;
        stage.style.setProperty('--free-main', 'hsl(' + hue + ' 90% 65%)');
        stage.style.setProperty('--free-deep', 'hsl(' + ((hue + 60) % 360) + ' 78% 54%)');
        stage.style.setProperty('--free-light', 'hsl(' + hue + ' 95% 88%)');
        caption.textContent = NOTES[index].name;
    }

    function updateReplayButton() {
        replayButton.textContent = replaying ? 'Stop Replay' : 'Replay My Song';
        replayButton.setAttribute('aria-pressed', String(replaying));
        replayButton.disabled = !savedNotes.length;
        deleteButton.disabled = !savedNotes.length;
        if (NSS.UI.current() === 'free') NSS.Input.refresh(false);
    }

    function drawReplay() {
        if (!replaying || NSS.UI.current() !== 'free') return;
        const position = NSS.Sound.listeningPosition();
        if (!position) { stop(); return; }
        const midi = savedNotes[position.index], key = keys[midi - 60];
        if (position.index !== replayIndex) {
            replayIndex = position.index; showNote(midi);
            Array.from(trail.children).forEach(function (mark, i) {
                if (i === replayIndex) mark.setAttribute('aria-current', 'true');
                else mark.removeAttribute('aria-current');
            });
            const scroll = key.parentElement.parentElement;
            if (key.offsetLeft < scroll.scrollLeft || key.offsetLeft + key.offsetWidth > scroll.scrollLeft + scroll.clientWidth)
                scroll.scrollLeft = key.offsetLeft - (scroll.clientWidth - key.offsetWidth) / 2;
        }
        const down = position.time - position.start < Math.min(.4, (position.next - position.start) * .8);
        keys.forEach(k => k.classList.toggle('pressed', k === key && down));
        replayFrame = requestAnimationFrame(drawReplay);
    }

    function toggleReplay() {
        if (replaying) { stop(); return; }
        if (!savedNotes.length || NSS.UI.current() !== 'free') return;
        if (!NSS.Settings.get('sound')) {
            hint.textContent = 'Turn sound on in Settings to replay your song.';
            NSS.Voice.speak(hint.textContent); return;
        }
        stop(); replaying = true;
        // An even beat omits the time spent scanning between chosen keys.
        const song = { id: 'free:' + savedNotes.join(','), notes: savedNotes.slice(), beats: savedNotes.map(() => 1), bpm: 100 };
        NSS.Sound.listenSong(song, function (reason) {
            stop();
            if (reason === 'error' && NSS.UI.current() === 'free') {
                hint.textContent = 'Could not replay your song. Choose Replay My Song to try again.';
                NSS.Voice.speak(hint.textContent);
            }
        });
        updateReplayButton();
        if (replaying) { hint.textContent = 'Playing your saved notes.'; drawReplay(); }
    }

    function play(midi) {
        if (NSS.UI.current() !== 'free') return;
        const index = NOTES.findIndex(note => note.midi === midi);
        if (index < 0) return;
        stop();
        NSS.Sound.bell(midi);
        keys[index].classList.add('pressed');
        keyTimer = setTimeout(function () { keys[index].classList.remove('pressed'); keyTimer = null; }, 400);
        // A note keeps the same symbol and colour each time; history records pitch,
        // not decorative note lengths that could be mistaken for a different tune.
        showNote(midi);
        const first = !savedNotes.length;
        savedNotes.push(midi); savedNotes = savedNotes.slice(-HISTORY_LIMIT);
        noteIds.push(++sequence); noteIds = noteIds.slice(-HISTORY_LIMIT);
        saveNotes(); renderHistory(true);
        if (first) updateReplayButton();
        void hero.offsetWidth;
        hero.classList.add('playing');
        motionTimer = setTimeout(function () { hero.classList.remove('playing'); motionTimer = null; }, 650);
    }

    function scannables() {
        const individualKeys = choosingKeys ? NOTES.map(function (note, i) {
            return { id: 'free:key:' + note.midi, el: keys[i], speak: note.name, quiet: true, action: function () { play(note.midi); } };
        }) : [];
        return individualKeys.concat([{ id: 'free:restart', el: keyboard, speak: 'Keyboard. Choose individual keys', quiet: true, action: function () { chooseKeys(); } }])
          .concat(savedNotes.length ? [
              { id: 'free:replay', el: replayButton, speak: function () { return replaying ? 'Stop Replay' : 'Replay My Song'; }, quiet: true, action: toggleReplay },
              { id: 'free:delete', el: deleteButton, speak: 'Delete Note', action: beginDelete }
          ] : [])
          .concat([{ id: 'free:options', el: options, speak: 'Options', action: function () { NSS.Game.pause(); } }]);
    }

    return { build: build, reset: reset, stop: stop, leave: leave, onScan: onScan, play: play, scannables: scannables, symbol: symbol, holdRing: holdRing };
})();
