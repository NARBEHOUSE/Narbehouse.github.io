/**
 * NARBE Switch Songs - the screens.
 *
 * Screens: menu, categories, songs, song, free, songend, pause, settings, help.
 * The scan list for whichever screen is up comes from scannables().
 * Every screen keeps a status slot outside its choices for the hub's
 * "Parked" badge and the Ready light that shows on the blank park step,
 * so a player can see the scan is still running when nothing is lit.
 */

window.NSS = window.NSS || {};

NSS.UI = (function () {
    'use strict';

    const SCREENS = ['menu', 'categories', 'songs', 'song', 'free', 'songend', 'pause', 'settings', 'help'];
    let screen = 'menu';
    let settingsFrom = 'menu', helpFrom = 'menu', pauseFrom = 'song';
    let songCategory = 'nursery';
    let resizeFrame = null;
    const el = {};

    function S() { return NSS.Settings; }
    function M() { return NSS.Music; }

    // --- helpers -------------------------------------------------------------------

    function node(tag, cls, parent, text) {
        const n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text !== undefined) n.textContent = text;
        if (parent) parent.appendChild(n);
        return n;
    }

    function button(cls, parent, label) {
        const b = node('button', 'nss-btn ' + (cls || ''), parent);
        b.type = 'button';
        if (label !== undefined) b.textContent = label;
        return b;
    }

    /** A button with a label and a smaller value line under it. */
    function valueButton(cls, parent, label, tone) {
        const b = button(cls, parent);
        if (tone) b.style.setProperty('--tone', tone);
        node('span', 'nss-btn-label', b, label);
        node('span', 'nss-btn-value', b, '');
        return b;
    }
    function setValue(b, label, value) {
        b.querySelector('.nss-btn-label').textContent = label;
        const v = b.querySelector('.nss-btn-value');
        v.textContent = value || '';
        v.hidden = !value;
    }

    function onOff(v) { return v ? 'On' : 'Off'; }

    function choiceArt(element, file) {
        const image = node('img', 'nss-choice-art');
        image.src = file;
        image.alt = '';
        image.width = 1280;
        image.height = 800;
        image.draggable = false;
        element.prepend(image);
    }

    function bar(parent, title) {
        const h = node('header', 'nss-bar', parent);
        const t = node('h1', 'nss-bar-title', h, title);
        node('div', 'nss-status-slot', h);
        return t;
    }

    function card(parent, title) {
        const c = node('div', 'nss-card', parent);
        const top = node('div', 'nss-card-top', c);
        const t = node('h2', 'nss-title', top, title || '');
        node('div', 'nss-status-slot', top);
        c._title = t;
        return c;
    }

    // --- build -----------------------------------------------------------------------

    function build() {
        el.root = document.getElementById('nss');
        applyLook();

        // Main menu.
        el.menu = node('section', 'nss-screen nss-center nss-menu', el.root);
        const mc = node('div', 'nss-card nss-card-menu', el.menu);
        const top = node('div', 'nss-card-top', mc);
        const brand = node('div', 'nss-brand', top);
        node('span', 'nss-brand-narbe', brand, 'NARBE');
        node('h1', 'nss-brand-title', brand, 'Switch Songs');
        node('div', 'nss-status-slot', top);
        const pianoArt = node('img', 'nss-menu-piano', mc);
        pianoArt.src = 'images/menu/piano-playful.webp';
        pianoArt.alt = '';
        pianoArt.width = 1920;
        pianoArt.height = 640;
        pianoArt.draggable = false;
        const tiles = node('div', 'nss-tiles', mc);
        el.tileSong = button('nss-tile nss-tile-song', tiles);
        node('span', 'nss-tile-label', el.tileSong, 'Play Songs');
        node('span', 'nss-tile-description', el.tileSong, 'Play a song you know.');
        el.tileFree = button('nss-tile nss-tile-free', tiles);
        node('span', 'nss-tile-label', el.tileFree, 'Free Play');
        node('span', 'nss-tile-description', el.tileFree, 'Make your own music.');
        const util = node('div', 'nss-util', mc);
        el.menuHelp = button('nss-item', util, 'How to Play');
        el.menuSettings = button('nss-item', util, 'Settings');
        el.menuExit = button('nss-item', util, 'Exit Game');

        // Six small collections keep switch browsing manageable.
        el.categories = node('section', 'nss-screen nss-center', el.root);
        const cc = card(el.categories, 'Familiar Favorites');
        cc.classList.add('nss-card-wide');
        node('p', 'nss-sub', cc, 'Choose a collection. Find your song.');
        el.categoryList = node('div', 'nss-songlist', cc);
        M().CATEGORIES.forEach(function (category) {
            const b = valueButton('nss-item nss-song-choice', el.categoryList, category.name);
            b.dataset.category = category.id;
            setValue(b, category.name, M().SONGS.filter(s => s.category === category.id).length + ' songs');
            choiceArt(b, category.scene);
        });
        el.categoriesBack = button('nss-item nss-item-nav', cc, 'Back');

        // Songs in the selected collection.
        el.songs = node('section', 'nss-screen nss-center', el.root);
        const sc = card(el.songs, '');
        el.songsTitle = sc._title;
        sc.classList.add('nss-card-wide');
        node('p', 'nss-sub', sc, 'Choose a song. Play it your way.');
        el.songList = node('div', 'nss-songlist', sc);
        el.songsBack = button('nss-item nss-item-nav', sc, 'Back');

        // Playing a song.
        el.song = node('section', 'nss-screen nss-song', el.root);
        el.songTitle = bar(el.song, '');
        el.scene = node('div', 'nss-scene', el.song);
        el.scene.setAttribute('aria-hidden', 'true');
        el.progress = node('progress', 'nss-progress', el.song);
        el.progress.setAttribute('aria-label', 'Song progress');
        el.pianoScroll = node('div', 'nss-piano-scroll', el.song);
        el.piano = button('nss-piano', el.pianoScroll);
        el.piano.setAttribute('aria-label', 'Play the next note');
        el.keys = {};
        let white = 0;
        const names = ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
        for (let midi = 60; midi <= 83; midi++) {
            const black = [1,3,6,8,10].includes(midi % 12);
            const key = node('span', 'nss-key ' + (black ? 'black' : 'white'), el.piano);
            key.dataset.midi = midi;
            key.style.setProperty('--key-left', (black ? white - 0.3 : white) * 100 / 14 + '%');
            key.style.setProperty('--note-color', noteColor(midi));
            node('span', 'nss-key-label', key, names[midi % 12]);
            el.keys[midi] = key;
            if (!black) white++;
        }
        const foot = node('div', 'nss-song-foot', el.song);
        el.songHint = node('p', 'nss-hint', foot, '');
        const songActions = node('div', 'nss-song-actions', foot);
        el.songListen = valueButton('nss-ctrl nss-listen', songActions, 'Listen to Song');
        el.songListen.setAttribute('aria-pressed', 'false');
        el.songOptions = valueButton('nss-ctrl nss-options', songActions, 'Options');
        el.hold = node('span', 'nss-hold', el.songOptions);

        // Each Free Play key is an independent choice in the shared scanner.
        el.free = node('section', 'nss-screen nss-free', el.root);
        bar(el.free, 'Free Play');
        NSS.FreePlay.build(el.free);

        // Song finished.
        el.songend = node('section', 'nss-screen nss-center nss-songend', el.root);
        el.endCelebration = node('div', 'nss-celebration', el.songend);
        el.endCelebration.setAttribute('aria-hidden', 'true');
        const ec = card(el.songend, '');
        ec.classList.add('nss-card-narrow');
        el.endTitle = ec._title;
        el.endBadge = node('span', 'nss-achievement', ec);
        el.endBadge.setAttribute('aria-hidden', 'true');
        el.endMessage = node('p', 'nss-end-message', ec, '');
        el.endList = node('div', 'nss-list', ec);
        el.endAgain = button('nss-item', el.endList, 'Play Again');
        el.endAnother = button('nss-item', el.endList, 'Another Song');
        el.endMenu = button('nss-item', el.endList, 'Main Menu');

        // Pause.
        el.pause = node('section', 'nss-screen nss-center', el.root);
        const pc = card(el.pause, 'Paused');
        pc.classList.add('nss-card-narrow');
        el.pauseList = node('div', 'nss-list', pc);

        // Settings.
        el.settings = node('section', 'nss-screen nss-center', el.root);
        const stc = card(el.settings, 'Settings');
        stc.classList.add('nss-card-wide');
        el.settingsList = node('div', 'nss-settings-list', stc);

        // How to play.
        el.help = node('section', 'nss-screen nss-center', el.root);
        const hc = card(el.help, '');
        hc.classList.add('nss-card-narrow');
        el.helpTitle = button('nss-help-title', hc, 'How to Play');
        el.helpBody = node('div', 'nss-help-body', hc);
        el.helpBack = button('nss-item nss-item-nav', hc, 'Back');

        // A tap on the song stage (outside its buttons) plays the next note.
        el.root.addEventListener('pointerdown', function (e) {
            if (e.button > 0) return;
            if (screen === 'song' && (el.scene.contains(e.target) || el.piano.contains(e.target))) {
                e.preventDefault();
                NSS.Input.align('song:play');
                NSS.Game.note();
            }
        });
        window.addEventListener('contextmenu', function (e) { if (screen === 'song') e.preventDefault(); });
        // Rotation and browser chrome can resize the viewport without a scan
        // step. Reveal the same choice; do not reopen or advance the scan.
        const resized = function () {
            cancelAnimationFrame(resizeFrame);
            resizeFrame = requestAnimationFrame(function () {
                NSS.Input.paint(true);
                if (screen === 'song') {
                    const cur = NSS.Song.current(), position = NSS.Sound.listeningPosition();
                    const midi = position ? cur.song.notes[position.index] : cur.song.notes[Math.min(cur.i, cur.song.notes.length - 1)];
                    if (el.keys[midi]) showKey(el.keys[midi]);
                }
            });
        };
        new ResizeObserver(resized).observe(el.root);

        try {
            window.NarbeVoiceManager.onSettingsChange(refreshSettingsValues);
            window.NarbeScanManager.subscribe(refreshSettingsValues);
        } catch (e) { /* managers missing */ }

    }

    function refreshSettingsValues() {
        if (screen !== 'settings') return;
        renderSettings();
        NSS.Input.refresh(false);
    }

    // --- screens ----------------------------------------------------------------------

    function show(name) {
        NSS.Celebration.stop();
        NSS.FreePlay.leave();
        screen = name;
        SCREENS.forEach(function (k) { el[k].classList.toggle('show', k === name); });
        el.root.dataset.screen = name;

        if (name === 'song') NSS.Song.enter();
        else NSS.Sound.stop();

        if (name === 'songs') renderSongs();
        if (name === 'song') refreshSong();
        if (name === 'songend') renderSongEnd();
        if (name === 'pause') renderPause();
        if (name === 'settings') renderSettings();
        if (name === 'help') renderHelp();

        NSS.Input.refresh(true);
        el[name].scrollTop = 0;

        const song = NSS.Song.current();
        const line = {
            menu: 'NARBE Switch Songs. Play Songs or Free Play.',
            categories: 'Familiar favorites. Choose a collection.',
            songs: el.songsTitle.textContent + '. Choose a song.',
            song: song ? song.song.name + '. Press to play each note.' : '',
            free: 'Free Play. Choose any piano key. After the last key, choose the whole keyboard to start again, or scan to Replay My Song, Delete Note and Options. Your last ten notes are saved.',
            songend: song ? 'You played ' + song.song.name + '. ' + el.endMessage.textContent : '',
            pause: 'Paused.',
            settings: 'Settings.',
            help: 'How to play. Choose the title to hear the directions.'
        }[name];
        if (line) NSS.Input.announce(line);
    }

    function current() { return screen; }

    function applyLook() { document.documentElement.dataset.look = S().get('look'); }

    /** From the scanner: which row is open, and whether the park step is showing. */
    function onScan(state) { if (screen === 'free') NSS.FreePlay.onScan(state); }

    // --- main menu --------------------------------------------------------------------

    function menuScannables() {
        return [
            { id: 'menu:song', el: el.tileSong, speak: 'Play Songs', action: function () { NSS.Game.openSongs(); } },
            { id: 'menu:free', el: el.tileFree, speak: 'Free Play', action: function () { NSS.Game.openFreePlay(); } },
            { id: 'menu:help', el: el.menuHelp, speak: 'How to Play', action: function () { helpFrom = 'menu'; show('help'); } },
            { id: 'menu:settings', el: el.menuSettings, speak: 'Settings', action: function () { settingsFrom = 'menu'; show('settings'); } },
            { id: 'menu:exit', el: el.menuExit, speak: 'Exit Game', action: function () { NSS.Game.exit(); } }
        ];
    }

    // --- songs ------------------------------------------------------------------------

    function openCategory(id) {
        if (!M().CATEGORIES.some(category => category.id === id)) return;
        songCategory = id;
        show('songs');
    }

    function categoriesScannables() {
        return M().CATEGORIES.map(function (category) {
            return {
                id: 'categories:' + category.id,
                el: el.categoryList.querySelector('[data-category="' + category.id + '"]'),
                speak: category.name,
                action: function () { openCategory(category.id); }
            };
        }).concat([{ id: 'categories:back', el: el.categoriesBack, speak: 'Back', action: function () { show('menu'); } }]);
    }

    function categorySongs() { return M().SONGS.filter(s => s.category === songCategory); }

    function renderSongs() {
        el.songsTitle.textContent = M().CATEGORIES.find(category => category.id === songCategory).name;
        el.songList.replaceChildren();
        categorySongs().forEach(function (song, i) {
            const b = button('nss-item nss-song-choice', el.songList);
            node('span', 'nss-btn-label', b, song.name);
            b.dataset.song = song.id;
            choiceArt(b, 'images/scenes/' + song.scene + '.webp');
            b.style.setProperty('--tone', ['#ff859f','#ffe296','#8de5db','#b0a0ff','#7edbff'][i % 5]);
        });
    }

    function songsScannables() {
        const list = categorySongs().map(function (s) {
            return {
                id: 'songs:' + s.id, el: el.songList.querySelector('[data-song="' + s.id + '"]'),
                speak: s.name, action: function () { NSS.Game.startSong(s.id); }
            };
        });
        list.push({ id: 'songs:back', el: el.songsBack, speak: 'Back', action: function () { show('categories'); } });
        return list;
    }

    const NOTE_HUES = [0, 30, 55, 90, 140, 175, 195, 215, 250, 280, 310, 335];
    function noteColor(m) { return 'hsl(' + NOTE_HUES[m % 12] + ', 100%, 55%)'; }

    function refreshSong() {
        const cur = NSS.Song.current();
        if (!cur) return;
        songCategory = cur.song.category;
        el.songTitle.textContent = cur.song.name;
        NSS.Scenes.mount(el.scene, cur.song);
        el.piano.dataset.labels = String(S().get('keyLabels'));
        el.progress.max = cur.song.notes.length;
        updatePiano();
        refreshListening();
    }

    function refreshListening(message) {
        const listening = NSS.Sound.isListening();
        setValue(el.songListen, listening ? 'Stop Listening' : 'Listen to Song');
        el.songListen.setAttribute('aria-pressed', String(listening));
        el.songHint.textContent = message || (listening ? 'Listening to the song. Your place is saved.' : 'Press to play the next note. Hold Enter to pause.');
        if (listening && listeningFrame === null) {
            clearTimeout(keyTimer);
            listeningIndex = -1;
            drawListening();
        } else if (!listening) {
            cancelAnimationFrame(listeningFrame);
            listeningFrame = null;
            Object.values(el.keys).forEach(key => key.classList.remove('pressed'));
            if (NSS.Song.current()) updatePiano();
        }
        if (screen === 'song') NSS.Input.refresh(false);
    }

    function updatePiano() {
        const cur = NSS.Song.current();
        el.progress.max = cur.song.notes.length;
        el.progress.value = cur.i;
        el.progress.setAttribute('aria-label', 'Song progress');
        Object.values(el.keys).forEach(key => key.classList.toggle('next', S().get('showNextKey') && Number(key.dataset.midi) === cur.song.notes[cur.i]));
    }

    let keyTimer = null, listeningFrame = null, listeningIndex = -1;
    function showKey(key) {
        const left = key.offsetLeft, right = left + key.offsetWidth;
        if (left < el.pianoScroll.scrollLeft || right > el.pianoScroll.scrollLeft + el.pianoScroll.clientWidth)
            el.pianoScroll.scrollLeft = left - el.pianoScroll.clientWidth / 2 + key.offsetWidth / 2;
    }

    function drawListening() {
        const position = NSS.Sound.listeningPosition();
        if (!position || screen !== 'song') { listeningFrame = null; return; }
        const song = NSS.Song.current().song, midi = song.notes[position.index];
        el.progress.max = position.duration;
        el.progress.value = position.time;
        el.progress.setAttribute('aria-label', 'Listening progress');
        if (listeningIndex !== position.index) {
            listeningIndex = position.index;
            showKey(el.keys[midi]);
        }
        // Lift between repeated notes, so the same key visibly plays again.
        const down = position.time - position.start < Math.min(.4, (position.next - position.start) * .8);
        Object.values(el.keys).forEach(function (key) {
            key.classList.toggle('pressed', down && Number(key.dataset.midi) === midi);
            key.classList.toggle('next', S().get('showNextKey') && Number(key.dataset.midi) === song.notes[position.index + 1]);
        });
        listeningFrame = requestAnimationFrame(drawListening);
    }
    function songNote(midi) {
        const cur = NSS.Song.current(), key = el.keys[midi];
        clearTimeout(keyTimer);
        Object.values(el.keys).forEach(k => k.classList.remove('pressed'));
        void key.offsetWidth;
        key.classList.add('pressed');
        // Keep the active key visible without shrinking tablet keys below 64px.
        showKey(key);
        keyTimer = setTimeout(() => key.classList.remove('pressed'), 400);
        updatePiano();
    }

    function holdRing(p) {
        p = Math.max(0, Math.min(1, p || 0));
        el.hold.style.setProperty('--p', p.toFixed(3));
        el.songOptions.classList.toggle('holding', p > 0);
    }

    function songScannables() {
        return [
            { id: 'song:play', el: el.piano, speak: 'Play', quiet: true, action: function () { NSS.Game.note(); } },
            { id: 'song:listen', el: el.songListen, speak: function () { return NSS.Sound.isListening() ? 'Stop Listening' : 'Listen to Song'; }, action: function () { NSS.Song.toggleListening(); } },
            { id: 'song:options', el: el.songOptions, speak: 'Options', action: function () { NSS.Game.pause(); } }
        ];
    }

    function renderSongEnd() {
        const cur = NSS.Song.current();
        el.endTitle.textContent = cur ? 'You played ' + cur.song.name : 'Song finished';
        el.endMessage.textContent = NSS.Celebration.start(el.endCelebration, el.endBadge);
    }

    function songendScannables() {
        const cur = NSS.Song.current();
        return [
            { id: 'end:again', el: el.endAgain, speak: 'Play Again', action: function () { NSS.Game.restartSong(); } },
            { id: 'end:another', el: el.endAnother, speak: 'Another Song', action: function () { show('songs'); } },
            { id: 'end:menu', el: el.endMenu, speak: 'Main Menu', action: function () { show('menu'); } }
        ].filter(function () { return !!cur; });
    }

    // --- pause ------------------------------------------------------------------------

    let pauseItems = [];

    function renderPause() {
        pauseFrom = NSS.Game.pausedFrom();
        const list = [{ id: 'continue', label: 'Continue', action: function () { NSS.Game.resume(); } }];
        if (pauseFrom === 'song') list.push({ id: 'restart', label: 'Restart Song', action: function () { NSS.Game.restartSong(); } });
        list.push(
            { id: 'settings', label: 'Settings', action: function () { settingsFrom = 'pause'; show('settings'); } },
            { id: 'help', label: 'How to Play', action: function () { helpFrom = 'pause'; show('help'); } }
        );
        if (pauseFrom === 'song') list.push({ id: 'songs', label: 'Another Song', action: function () { show('songs'); } });
        list.push(
            { id: 'menu', label: 'Main Menu', action: function () { show('menu'); } },
            { id: 'exit', label: 'Exit Game', action: function () { NSS.Game.exit(); } }
        );
        el.pauseList.innerHTML = '';
        pauseItems = list.map(function (it) {
            const b = button('nss-item', el.pauseList, it.label);
            return { id: 'pause:' + it.id, el: b, speak: it.label, action: it.action };
        });
    }

    // --- how to play ------------------------------------------------------------------

    /** Printed AND read aloud from these same lines, so the two never drift. */
    function helpLines() {
        let auto = false;
        try { auto = !!window.NarbeScanManager.getSettings().autoScan; } catch (e) { /* no scan manager */ }
        return [
            'Choose a collection, then a song.',
            'Or choose *Free Play*. Scan to any piano key and select it, or click a key, to make your own music. Your last ten notes are saved. After the last key, the whole keyboard highlights. Select it to return to Low C, or scan on to the buttons below. *Replay My Song* plays your notes once at an even pace. *Stop Replay* ends playback. Choose *Delete Note*, then scan to a saved note and select it to remove it. The *Back* stop keeps your notes and returns to Delete Note. *Options* comes next.',
            'Press to play each note. The piano key lights up.',
            'Play as fast or as slow as you like.',
            'Choose *Listen to Song* to hear it once. *Stop Listening* ends playback. Your place is saved.',
            'In a song, *hold Enter* to pause, or choose *Options*.',
            auto ? 'In the menus, the highlight moves by itself. *Enter* chooses.'
                 : 'In the menus, *tap Space* to move the highlight and *hold Space* to go back. *Enter* chooses.',
            'There is no score, no timer and no way to lose.'
        ];
    }

    function renderHelp() {
        el.helpBody.innerHTML = helpLines().map(function (line) {
            return '<p>' + line.replace(/\*([^*]+)\*/g, '<b>$1</b>') + '</p>';
        }).join('');
    }

    /** Read the directions, holding the scanner still; any press stops it. */
    function readAloud() {
        const text = helpLines().map(function (l) { return l.replace(/\*/g, ''); }).join(' ');
        const ticket = NSS.Voice.speak(text);
        if (!ticket) return;
        let released = false, timer = null;
        const release = function () {
            if (released) return;
            released = true;
            clearTimeout(timer);
            document.removeEventListener('keydown', onPress, true);
            document.removeEventListener('pointerdown', onPress, true);
            NSS.Input.setEnabled(true);
        };
        const onPress = function () { NSS.Voice.cancel(); release(); };
        NSS.Input.setEnabled(false);
        timer = setTimeout(release, Math.ceil(text.length / 13 * 1000) + 800);
        Promise.resolve(ticket.finished).then(function (r) { if (r && r.reason !== 'timeout') release(); });
        document.addEventListener('keydown', onPress, true);
        document.addEventListener('pointerdown', onPress, true);
    }

    function helpScannables() {
        return [
            { id: 'help:read', el: el.helpTitle, speak: 'How to Play', action: readAloud },
            { id: 'help:back', el: el.helpBack, speak: 'Back', action: function () { NSS.Voice.cancel(); show(helpFrom); } }
        ];
    }

    // --- settings ---------------------------------------------------------------------

    function vm() { return window.NarbeVoiceManager; }
    function sm() { return window.NarbeScanManager; }
    function ttsOn() { try { return !!vm().getSettings().ttsEnabled; } catch (e) { return false; } }
    function voiceName() { try { return vm().getVoiceDisplayName(vm().getCurrentVoice()); } catch (e) { return 'Default'; } }
    function autoOn() { try { return !!sm().getSettings().autoScan; } catch (e) { return false; } }
    function speedLabel() { try { return (sm().getScanInterval() / 1000) + ' s'; } catch (e) { return '2 s'; } }

    let settingsCache = [];

    /**
     * Hub canonical order: Text to Speech, Voice, the game's own options,
     * Auto Scan, Scan Speed, Sound Effects, Reset (two steps), Back.
     * `after` is said once an option is chosen.
     */
    function settingsItems() {
        const s = S();
        return [
            {
                id: 'tts', label: 'Speaking', value: function () { return onOff(ttsOn()); },
                action: function () { try { vm().toggleTTS(); } catch (e) { /* none */ } },
                after: function () { return ttsOn() ? 'Speaking on. Everything is read aloud.' : ''; }
            },
            {
                id: 'voice', label: 'Voice', value: voiceName,
                action: function () { try { vm().cycleVoice(); } catch (e) { /* none */ } },
                after: function () { return 'Voice, ' + voiceName() + '. This is the voice you will hear.'; }
            },
            {
                id: 'look', label: 'Look', value: function () { return s.get('look') === 'contrast' ? 'Simple High Contrast' : 'Scenes'; },
                action: function () { s.set('look', s.get('look') === 'studio' ? 'contrast' : 'studio'); applyLook(); },
                after: function () { return 'Look, ' + (s.get('look') === 'contrast' ? 'Simple High Contrast' : 'Scenes') + '.'; }
            },
            {
                id: 'nextkey', label: 'Show Next Key', value: function () { return onOff(s.get('showNextKey')); },
                action: function () { s.toggle('showNextKey'); },
                after: function () { return s.get('showNextKey') ? 'Show next key on. The next key glows so you can see where the song goes.' : 'Show next key off.'; }
            },
            {
                id: 'labels', label: 'Key Labels', value: function () { return s.get('keyLabels') ? 'Letters' : 'Off'; },
                action: function () { s.toggle('keyLabels'); },
                after: function () { return s.get('keyLabels') ? 'Key labels, letters. Each key shows its note name.' : 'Key labels off.'; }
            },
            {
                id: 'hlstyle', label: 'Highlight Style', value: function () { return s.get('highlightStyle') === 'full' ? 'Block' : 'Bold Band'; },
                action: function () { s.set('highlightStyle', s.get('highlightStyle') === 'full' ? 'outline' : 'full'); },
                after: function () {
                    return s.get('highlightStyle') === 'full' ? 'Highlight style, block. The whole button fills with colour.'
                        : 'Highlight style, bold band. A thick band goes around the button.';
                }
            },
            {
                id: 'hlcolor', label: 'Highlight Color', value: function () { return s.highlightColorName(); },
                action: function () { s.cycle('highlightColorIndex', s.HIGHLIGHT_COLORS.length); },
                after: function () { return 'Highlight color, ' + s.highlightColorName() + '.'; }
            },
            {
                id: 'auto', label: 'Auto Scan', value: function () { return autoOn() ? 'One Switch' : 'Two Switches'; },
                action: function () { try { sm().toggleAutoScan(); } catch (e) { /* none */ } },
                after: function () {
                    return autoOn() ? 'Auto scan on. One switch. The highlight moves by itself and Enter chooses.'
                        : 'Auto scan off. Two switches. Space moves the highlight and Enter chooses.';
                }
            },
            {
                id: 'speed', label: 'Scan Speed', value: speedLabel,
                action: function () { try { sm().cycleScanSpeed(); } catch (e) { /* none */ } },
                after: function () { return 'Scan speed, ' + speedLabel() + '.'; }
            },
            {
                id: 'sound', label: 'Sound', value: function () { return onOff(s.get('sound')); },
                action: function () { s.toggle('sound'); NSS.Sound.applyVolume(); NSS.Sound.bell(67); },
                after: function () { return s.get('sound') ? 'Sound on.' : 'Sound off.'; }
            },
            {
                id: 'volume', label: 'Volume', value: function () { return s.volumeName(); },
                action: function () { s.cycle('volumeIndex', s.VOLUMES.length); NSS.Sound.applyVolume(); NSS.Sound.bell(67); },
                after: function () { return 'Volume, ' + s.volumeName() + '.'; }
            },
            { id: 'back', label: 'Back', value: function () { return ''; }, nav: true, action: function () { show(settingsFrom); } }
        ];
    }

    function renderSettings() {
        settingsCache = settingsItems();
        el.settingsList.innerHTML = '';
        settingsCache.forEach(function (item) {
            const b = button('nss-set' + (item.nav ? ' nss-item-nav' : ''), el.settingsList);
            b.dataset.setting = item.id;
            node('span', 'nss-set-label', b, item.label);
            node('span', 'nss-set-value', b, item.value());
        });
    }

    function settingsScannables() {
        return settingsCache.map(function (item) {
            return {
                id: 'set:' + item.id,
                el: el.settingsList.querySelector('[data-setting="' + item.id + '"]'),
                speak: function () { const v = item.value(); return v ? item.label + ', ' + v : item.label; },
                action: function () {
                    item.action();
                    if (item.nav || screen !== 'settings') return;
                    renderSettings();
                    NSS.Input.refresh(false);
                    const line = item.after && item.after();
                    if (line) NSS.Input.announce(line);
                }
            };
        });
    }

    // --- scan lists -------------------------------------------------------------------

    function scannables() {
        switch (screen) {
            case 'menu': return menuScannables();
            case 'categories': return categoriesScannables();
            case 'songs': return songsScannables();
            case 'song': return songScannables();
            case 'free': return NSS.FreePlay.scannables();
            case 'songend': return songendScannables();
            case 'pause': return pauseItems;
            case 'settings': return settingsScannables();
            case 'help': return helpScannables();
            default: return [];
        }
    }

    let scanHost = null;
    /** Where the shared "Parked" badge and the Ready light live, outside the choices. */
    function scanContext() {
        if (!scanHost) {
            scanHost = node('div', 'nss-scan-status');
            const ready = node('span', 'nss-ready', scanHost);
            node('i', '', ready);
            node('span', '', ready, 'Ready');
        }
        const slot = el[screen] && el[screen].querySelector('.nss-status-slot');
        if (slot && scanHost.parentElement !== slot) slot.appendChild(scanHost);
        return { key: screen, host: scanHost };
    }

    return {
        build: build,
        show: show,
        current: current,
        scannables: scannables,
        scanContext: scanContext,
        onScan: onScan,
        songNote: songNote,
        refreshListening: refreshListening,
        holdRing: holdRing
    };
})();
