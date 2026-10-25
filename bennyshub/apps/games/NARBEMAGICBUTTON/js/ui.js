/**
 * NARBE Magic Button - the DOM interface on top of the scene.
 *
 * Screens: menu, play, settings, pause, help. Every menu is a frosted card
 * over the live scene, scaled to fit the window so nothing ever scrolls.
 * The scan list for whichever screen is up comes from scannables().
 *
 * Scanning reads each choice simply: just what the button says, plus a
 * setting's current value. What an option means is said after it is chosen.
 */

window.NMB = window.NMB || {};

NMB.UI = (function () {
    'use strict';

    let screen = 'menu';
    let settingsFrom = 'menu';
    const el = {};

    function S() { return NMB.Settings; }
    function scanMode() { return S().get('pauseMode') === 'scan'; }

    const MAGIC = [
        { id: 'fireworks', name: 'Fireworks' },
        { id: 'bubbles', name: 'Bubbles' },
        { id: 'flowers', name: 'Flowers' }
    ];
    function magicName(id) { return (MAGIC.find(m => m.id === id) || MAGIC[0]).name; }

    // --- helpers -------------------------------------------------------------------

    function node(tag, cls, parent, text) {
        const n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text !== undefined) n.textContent = text;
        if (parent) parent.appendChild(n);
        return n;
    }

    function button(cls, parent, label) {
        const b = node('button', 'nmb-btn ' + (cls || ''), parent);
        b.type = 'button';
        if (label !== undefined) b.textContent = label;
        return b;
    }

    function onOff(v) { return v ? 'On' : 'Off'; }

    const ICON = (function () {
        const svg = body => '<svg class="nmb-icon" viewBox="0 0 48 48" aria-hidden="true" focusable="false">' + body + '</svg>';
        let teeth = '';
        for (let i = 0; i < 8; i++) {
            const a = Math.PI / 4 * i;
            teeth += '<line x1="' + (24 + Math.cos(a) * 13.5).toFixed(1) + '" y1="' + (24 + Math.sin(a) * 13.5).toFixed(1) +
                '" x2="' + (24 + Math.cos(a) * 18.5).toFixed(1) + '" y2="' + (24 + Math.sin(a) * 18.5).toFixed(1) + '" stroke-width="5.5"/>';
        }
        return {
            help: svg('<circle cx="24" cy="24" r="17"/><path d="M19 19a5 5 0 1 1 5 7v2"/><circle cx="24" cy="34" r="1.8" class="nmb-dot"/>'),
            settings: svg('<circle cx="24" cy="24" r="14"/><circle cx="24" cy="24" r="5.5"/>' + teeth),
            exit: svg('<path d="M28 10H12v28h16"/><path d="M24 24h14"/><path d="M32 18l6 6-6 6"/>'),
            play: svg('<circle cx="24" cy="24" r="17"/><path d="M20 17l12 7-12 7z"/>'),
            home: svg('<path d="M8 23 24 10l16 13"/><path d="M12 23v17h24V23"/><path d="M20 40V30h8v10"/>'),
            back: svg('<path d="M30 12 18 24l12 12"/>'),
            check: svg('<circle cx="24" cy="24" r="17"/><path d="M16 24.5l6 6 11-13"/>'),
            cross: svg('<circle cx="24" cy="24" r="17"/><path d="M18 18l12 12"/><path d="M30 18L18 30"/>'),
            speaker: svg('<path d="M9 19h7l9-7v24l-9-7H9z"/><path d="M32 18a9 9 0 0 1 0 12"/><path d="M37 13a16 16 0 0 1 0 22"/>'),
            pause: '<svg class="nmb-icon" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><rect x="13" y="10" width="8" height="28" rx="3" class="nmb-fill"/><rect x="27" y="10" width="8" height="28" rx="3" class="nmb-fill"/></svg>',
            sparkle: '<svg class="nmb-icon" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><path class="nmb-fill" d="M24 4c2 10 6 14 16 16-10 2-14 6-16 16-2-10-6-14-16-16 10-2 14-6 16-16z"/><path class="nmb-fill" d="M38 30c1 4 2.5 5.5 6.5 6.5-4 1-5.5 2.5-6.5 6.5-1-4-2.5-5.5-6.5-6.5 4-1 5.5-2.5 6.5-6.5z"/></svg>'
        };
    })();

    /** Little animated windows onto each magic, for the menu tiles. */
    const PICTURE = {
        fireworks: function () {
            let rays = '';
            const cols = ['#ff4d6d', '#ffd23f', '#3bceac', '#5aa9ff', '#c77dff', '#ff8c42'];
            for (let i = 0; i < 12; i++) {
                const a = i / 12 * Math.PI * 2;
                rays += '<line x1="' + (60 + Math.cos(a) * 8).toFixed(1) + '" y1="' + (34 + Math.sin(a) * 8).toFixed(1) +
                    '" x2="' + (60 + Math.cos(a) * 24).toFixed(1) + '" y2="' + (34 + Math.sin(a) * 24).toFixed(1) +
                    '" stroke="' + cols[i % cols.length] + '"/><circle cx="' + (60 + Math.cos(a) * 28).toFixed(1) + '" cy="' +
                    (34 + Math.sin(a) * 28).toFixed(1) + '" r="2.2" fill="' + cols[(i + 2) % cols.length] + '"/>';
            }
            let small = '';
            for (let i = 0; i < 8; i++) {
                const a = i / 8 * Math.PI * 2;
                small += '<line x1="' + (24 + Math.cos(a) * 4).toFixed(1) + '" y1="' + (22 + Math.sin(a) * 4).toFixed(1) +
                    '" x2="' + (24 + Math.cos(a) * 12).toFixed(1) + '" y2="' + (22 + Math.sin(a) * 12).toFixed(1) + '" stroke="#ffe08a"/>';
            }
            return '<svg viewBox="0 0 120 80" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">' +
                '<circle cx="98" cy="16" r="6" fill="#fff4d6"/>' +
                '<g class="nmb-burst" stroke-width="2.6" stroke-linecap="round">' + rays + '</g>' +
                '<g class="nmb-burst nmb-burst-2" stroke-width="2" stroke-linecap="round">' + small + '</g>' +
                '<path d="M0 80V66h10v-8h8v12h9V60h10v20h8V64h12v-6h6v22h10V62h9v8h8V56h10v24h12V66h8v14z" fill="#120e35"/></svg>';
        },
        bubbles: function () {
            return '<span class="nmb-pic-bubble b1"></span><span class="nmb-pic-bubble b2"></span><span class="nmb-pic-bubble b3"></span>' +
                '<svg viewBox="0 0 120 80" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false" class="nmb-pic-floor">' +
                '<path d="M8 80c4-14-4-22 2-34M18 80c-4-12 4-18-1-30" stroke="#3dbb7c" stroke-width="4" fill="none" stroke-linecap="round"/>' +
                '<g class="nmb-fishy"><ellipse cx="88" cy="40" rx="10" ry="6.5" fill="#ffb300"/><path d="M78 40l-8-6v12z" fill="#ff7043"/><circle cx="93" cy="38" r="1.8" fill="#1a1a2e"/></g>' +
                '<path d="M0 80V72c20-6 40 2 60-2s40-6 60 0v10z" fill="#e9d49c"/></svg>';
        },
        flowers: function () {
            let petals = '';
            for (let i = 0; i < 7; i++) {
                const a = i / 7 * Math.PI * 2;
                petals += '<circle cx="' + (60 + Math.cos(a) * 11).toFixed(1) + '" cy="' + (30 + Math.sin(a) * 11).toFixed(1) + '" r="8" fill="#ff5d8f"/>';
            }
            return '<svg viewBox="0 0 120 80" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">' +
                '<circle cx="102" cy="14" r="8" fill="#ffd94a"/>' +
                '<path d="M0 80V64c30-8 60-8 120 0v16z" fill="#5cbf5a"/>' +
                '<path d="M60 40c0 14 2 22 0 32" stroke="#2f8f3a" stroke-width="3.5" fill="none"/>' +
                '<ellipse cx="68" cy="58" rx="7" ry="3" fill="#3fae4a" transform="rotate(-30 68 58)"/>' +
                '<g class="nmb-sway">' + petals + '<circle cx="60" cy="30" r="9" fill="#ffd23f"/>' +
                '<circle cx="57" cy="28.5" r="1.3" fill="#4a2c1a"/><circle cx="63" cy="28.5" r="1.3" fill="#4a2c1a"/>' +
                '<path d="M56.5 32a4 4 0 0 0 7 0" stroke="#4a2c1a" stroke-width="1.3" fill="none" stroke-linecap="round"/></g>' +
                '<g transform="translate(24 52)"><circle r="5" fill="#ffb703"/><circle r="2" fill="#fff3c4"/></g>' +
                '<g transform="translate(96 56)"><circle r="4.5" fill="#b06cf5"/><circle r="1.8" fill="#fff3c4"/></g></svg>';
        }
    };

    function menuItem(parent, label, icon, tone) {
        const b = button('nmb-menu-item', parent);
        if (tone) b.dataset.tone = tone;
        node('span', 'nmb-icon-chip', b).innerHTML = ICON[icon] || '';
        node('span', 'nmb-menu-label', b, label);
        return b;
    }

    function card(screenEl, title, sub) {
        const c = node('div', 'nmb-card', screenEl);
        if (title) node('h2', 'nmb-title', c, title);
        if (sub !== undefined) node('p', 'nmb-sub', c, sub);
        return c;
    }

    // --- build -----------------------------------------------------------------------

    function build() {
        el.root = document.getElementById('nmb');
        el.stage = node('canvas', 'nmb-stage', el.root);
        el.stage.setAttribute('aria-hidden', 'true');

        // Play: the prompt, the Magic button (Scan to Pause only) and Pause.
        el.hud = node('div', 'nmb-hud', el.root);
        el.prompt = node('div', 'nmb-prompt', el.hud, 'Press for magic!');
        el.magicBtn = button('nmb-magic-btn', el.hud);
        el.magicBtn.innerHTML = ICON.sparkle + '<span>Magic!</span>';
        el.pauseBtn = button('nmb-pause-btn', el.hud);
        el.pauseBtn.setAttribute('aria-label', 'Pause');
        el.ring = node('span', 'nmb-ring', el.pauseBtn);
        node('span', 'nmb-pause-icon', el.pauseBtn).innerHTML = ICON.pause;
        node('span', 'nmb-pause-label', el.pauseBtn, 'Pause');
        el.pauseTip = node('span', 'nmb-pause-tip', el.hud);
        el.pauseTip.id = 'nmb-pause-tip';
        el.pauseBtn.setAttribute('aria-describedby', el.pauseTip.id);

        // Main menu.
        el.menu = node('section', 'nmb-screen nmb-screen-menu', el.root);
        const mc = node('div', 'nmb-card nmb-card-menu', el.menu);
        const head = node('div', 'nmb-brand', mc);
        node('span', 'nmb-logo', head).innerHTML = ICON.sparkle;
        const words = node('div', 'nmb-brand-words', head);
        node('span', 'nmb-brand-narbe', words, 'NARBE');
        node('h1', 'nmb-brand-title', words, 'Magic Button');
        node('p', 'nmb-sub', mc, 'Choose your magic.');
        el.tiles = node('div', 'nmb-tiles', mc);
        MAGIC.forEach(function (m) {
            const t = button('nmb-tile', el.tiles);
            t.dataset.magic = m.id;
            node('span', 'nmb-pic nmb-pic-' + m.id, t).innerHTML = PICTURE[m.id]();
            node('span', 'nmb-tile-label', t, m.name);
        });
        el.menuUtil = node('div', 'nmb-util', mc);
        menuItem(el.menuUtil, 'How to Play', 'help', 'teal').dataset.menu = 'help';
        menuItem(el.menuUtil, 'Settings', 'settings', 'plum').dataset.menu = 'settings';
        menuItem(el.menuUtil, 'Exit Game', 'exit', 'slate').dataset.menu = 'exit';

        // Settings.
        el.settings = node('section', 'nmb-screen', el.root);
        el.settingsCard = card(el.settings, 'Settings');
        el.settingsCard.classList.add('nmb-card-settings');
        el.settingsList = node('div', 'nmb-settings-list', el.settingsCard);

        // Pause.
        el.pause = node('section', 'nmb-screen', el.root);
        const pc = card(el.pause, 'Paused');
        pc.classList.add('nmb-card-narrow');
        el.pauseList = node('div', 'nmb-list', pc);
        PAUSE_ITEMS.forEach(function (m, i) { menuItem(el.pauseList, m.label, m.icon, m.tone).dataset.pause = String(i); });

        // How to play.
        el.help = node('section', 'nmb-screen', el.root);
        const hc = node('div', 'nmb-card nmb-card-narrow', el.help);
        el.helpTitle = button('nmb-help-title', hc);
        el.helpTitle.innerHTML = '<span class="nmb-icon-chip">' + ICON.speaker + '</span><span>How to Play</span>';
        el.helpBody = node('div', 'nmb-help-body', hc);
        el.helpBack = menuItem(hc, 'Back', 'back', 'slate');

        // Sky Word: a scannable keyboard, row first, then a key in that row.
        el.word = node('section', 'nmb-screen', el.root);
        const wc = card(el.word, 'Sky Word');
        wc.classList.add('nmb-card-word');
        el.wordShow = node('div', 'nmb-word-show', wc);
        el.wordKeys = node('div', 'nmb-keys', wc);
        WORD_ROWS.forEach(function (keys, ri) {
            const r = node('div', 'nmb-key-row', el.wordKeys);
            r.dataset.row = String(ri);
            keys.forEach(function (k) {
                const b = button('nmb-key' + (k.length > 1 ? ' nmb-key-wide' : ''), r, k === 'Delete' ? '⌫ Delete' : k);
                b.dataset.key = k;
            });
        });
        const wb = node('div', 'nmb-word-buttons', wc);
        menuItem(wb, 'Done', 'check', 'green').dataset.word = 'done';
        menuItem(wb, 'Clear', 'cross', 'slate').dataset.word = 'clear';
        // A tap or click on a key types it, without moving a switch user's highlight.
        el.wordKeys.addEventListener('click', function (e) {
            const key = e.target.closest && e.target.closest('.nmb-key');
            if (!key) return;
            e.preventDefault();
            e.stopPropagation();
            typeKey(key.dataset.key);
        }, true);
        // A caregiver at a keyboard can simply type.
        document.addEventListener('keydown', function (e) {
            if (screen !== 'word' || e.ctrlKey || e.metaKey || e.altKey) return;
            if (/^[a-z0-9]$/i.test(e.key)) { e.preventDefault(); typeKey(e.key.toUpperCase()); }
            else if (e.key === 'Backspace') { e.preventDefault(); typeKey('Delete'); }
        });

        // A tap anywhere on the scene during play makes magic; the Pause
        // button opens Pause. Buttons in the scan handle their own clicks.
        el.root.addEventListener('pointerdown', function (e) {
            if (screen !== 'play' || e.button > 0) return;
            if (e.target.closest && e.target.closest('button')) return;
            e.preventDefault();
            NMB.Game.magic();
        });
        el.pauseBtn.addEventListener('click', function (e) {
            if (!NMB.Input.isFreePlay()) return;     // in the scan it is a scan item
            e.preventDefault();
            NMB.Game.pause();
        });
        el.magicBtn.addEventListener('pointerdown', function (e) { e.preventDefault(); });
        window.addEventListener('contextmenu', function (e) { if (screen === 'play') e.preventDefault(); });

        window.addEventListener('resize', fit);
        try {
            window.NarbeVoiceManager.onSettingsChange(refreshSettingsValues);
            window.NarbeScanManager.subscribe(refreshSettingsValues);
        } catch (e) { /* managers missing */ }
    }

    function refreshSettingsValues() {
        if (screen !== 'settings') return;
        renderSettings();
        NMB.Input.refresh(false);
    }

    // --- screens ----------------------------------------------------------------------

    function show(name) {
        screen = name;
        ['menu', 'settings', 'pause', 'help', 'word'].forEach(function (k) { el[k].classList.toggle('show', k === name); });
        el.hud.classList.toggle('show', name === 'play');
        el.root.dataset.screen = name;
        el.root.dataset.pauseMode = S().get('pauseMode');
        el.pauseTip.textContent = scanMode()
            ? 'Choose Pause, hold Enter for 5 seconds, or click or tap Pause to open the menu.'
            : 'Hold Enter for 5 seconds or click or tap Pause to open the menu.';
        el.root.dataset.look = S().get('look');

        if (name === 'settings') renderSettings();
        if (name === 'help') renderHelp();
        if (name === 'word') { wordDraft = S().get('skyWord'); renderWord(); }
        if (name === 'play') prompt(!scanMode());

        fit();
        NMB.Input.refresh(true);

        const line = {
            menu: 'Magic Button. Choose your magic.',
            settings: 'Settings.',
            pause: 'Paused.',
            help: 'How to play. Choose the title to hear the directions.',
            word: 'Sky word. Choose a row, then a letter or number. Choose Done to keep it.',
            play: magicName(S().get('mode')) + '. ' + (scanMode() ? 'Choose Magic.' : 'Press for magic!')
        }[name];
        if (line) NMB.Input.announce(line);
    }

    function current() { return screen; }

    /** Scale the card to fit the window, so nothing is ever cut off or scrolled. */
    function fit() {
        const sec = el[screen];
        const c = sec && sec.querySelector && sec.querySelector('.nmb-card');
        if (!c) return;
        c.style.setProperty('--card-scale', '1');
        const w = c.offsetWidth, h = c.offsetHeight;
        if (!w || !h) return;
        const s = Math.min(1, (window.innerWidth - 16) / w, (window.innerHeight - 16) / h);
        c.style.setProperty('--card-scale', s.toFixed(3));
    }

    function prompt(on) { el.prompt.classList.toggle('hidden', !on); }
    function promptShown() { return !el.prompt.classList.contains('hidden'); }

    function holdRing(p) {
        p = Math.max(0, Math.min(1, p || 0));
        el.ring.style.setProperty('--p', p.toFixed(3));
        el.pauseBtn.classList.toggle('holding', p > 0);
    }

    function bumpMagic() {
        el.magicBtn.classList.remove('bump');
        void el.magicBtn.offsetWidth;
        el.magicBtn.classList.add('bump');
    }

    // --- main menu --------------------------------------------------------------------

    function menuScannables() {
        const list = MAGIC.map(function (m) {
            return {
                id: 'menu:' + m.id,
                el: el.tiles.querySelector('[data-magic="' + m.id + '"]'),
                speak: m.name,
                // Resting on a magic turns the scene behind the menu into it.
                onFocus: function () { NMB.Game.preview(m.id); },
                action: function () { NMB.Game.start(m.id); }
            };
        });
        return list.concat([
            { id: 'menu:help', el: el.menuUtil.querySelector('[data-menu="help"]'), speak: 'How to Play', action: function () { show('help'); } },
            { id: 'menu:settings', el: el.menuUtil.querySelector('[data-menu="settings"]'), speak: 'Settings', action: function () { settingsFrom = 'menu'; show('settings'); } },
            { id: 'menu:exit', el: el.menuUtil.querySelector('[data-menu="exit"]'), speak: 'Exit Game', action: function () { NMB.Game.exit(); } }
        ]);
    }

    // --- pause ------------------------------------------------------------------------

    const PAUSE_ITEMS = [
        { label: 'Continue', icon: 'play', tone: 'green' },
        { label: 'Settings', icon: 'settings', tone: 'plum' },
        { label: 'How to Play', icon: 'help', tone: 'teal' },
        { label: 'Main Menu', icon: 'home', tone: 'blue' },
        { label: 'Exit Game', icon: 'exit', tone: 'slate' }
    ];

    function pauseScannables() {
        const at = i => el.pauseList.querySelector('[data-pause="' + i + '"]');
        const actions = [
            function () { show('play'); },
            function () { settingsFrom = 'pause'; show('settings'); },
            function () { show('help'); },
            function () { NMB.Game.toMenu(); },
            function () { NMB.Game.exit(); }
        ];
        return PAUSE_ITEMS.map(function (m, i) {
            return { id: 'pause:' + i, el: at(i), speak: m.label, action: actions[i] };
        });
    }

    // --- how to play ------------------------------------------------------------------

    /** Printed AND read aloud from these same lines, so the two never drift. */
    function helpLines() {
        let auto = false;
        try { auto = !!window.NarbeScanManager.getSettings().autoScan; } catch (e) { /* no scan manager */ }
        const lines = ['Choose *Fireworks*, *Bubbles* or *Flowers*.'];
        if (scanMode()) {
            lines.push(auto ? 'In the game, the highlight moves between *Magic* and *Pause* by itself.'
                            : 'In the game, *Space* moves the highlight between *Magic* and *Pause*.');
            lines.push('*Enter* on *Magic* makes magic. *Enter* on *Pause* stops the game.');
        } else {
            lines.push('In the game, *every press* of a switch, key or touch makes magic.');
            lines.push('*Hold Enter* to pause.');
        }
        lines.push('*Fireworks*: bursts, rings and spirals, and shapes like a star, a smiley face or a paw print.');
        lines.push('*Bubbles*: the whale blows bubbles. Some carry a fish, a starfish or a duck, and sometimes a giant bubble floats up.');
        lines.push('*Flowers*: each press grows a flower. A full garden gets a surprise, and the next press clears it for a new one.');
        lines.push('In *Settings*, *Sky Word* spells a name or an age in fireworks.');
        lines.push('*Look: Simple High Contrast* shows one big bright shape on black for each press.');
        lines.push(auto ? 'In the menus, the highlight moves by itself. *Enter* chooses.'
                        : 'In the menus, *tap Space* to move the highlight and *hold Space* to go back. *Enter* chooses.');
        lines.push('There is no score, no timer and no way to lose.');
        return lines;
    }

    function renderHelp() {
        el.helpBody.innerHTML = helpLines().map(function (line) {
            return '<p>' + line.replace(/\*([^*]+)\*/g, '<b>$1</b>') + '</p>';
        }).join('');
    }

    /** Read the directions, holding the scanner still; any press stops it. */
    function readAloud() {
        const text = helpLines().map(l => l.replace(/\*/g, '')).join(' ');
        const ticket = NMB.Voice.speak(text);
        if (!ticket) return;
        let released = false;
        const release = function () {
            if (released) return;
            released = true;
            clearTimeout(timer);
            document.removeEventListener('keydown', onPress, true);
            document.removeEventListener('pointerdown', onPress, true);
            NMB.Input.setEnabled(true);
        };
        const onPress = function () { NMB.Voice.cancel(); release(); };
        NMB.Input.setEnabled(false);
        const timer = setTimeout(release, Math.ceil(text.length / 13 * 1000) + 800);
        Promise.resolve(ticket.finished).then(function (r) { if (r && r.reason !== 'timeout') release(); });
        document.addEventListener('keydown', onPress, true);
        document.addEventListener('pointerdown', onPress, true);
    }

    function helpScannables() {
        return [
            { id: 'help:read', el: el.helpTitle, speak: 'How to Play', action: readAloud },
            {
                id: 'help:back', el: el.helpBack, speak: 'Back',
                action: function () { NMB.Voice.cancel(); show(NMB.Game.started() ? 'pause' : 'menu'); }
            }
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
     * Auto Scan, Scan Speed, Sound Effects, Back. `after` is what is said once
     * an option is chosen - the explanation lives there, not in the scan.
     */
    function settingsItems() {
        const s = S();
        return [
            {
                id: 'tts', label: 'Speaking', value: () => onOff(ttsOn()),
                action: () => { try { vm().toggleTTS(); } catch (e) { /* none */ } },
                after: () => ttsOn() ? 'Speaking on. Everything is read aloud.' : ''
            },
            {
                id: 'voice', label: 'Voice', value: voiceName,
                action: () => { try { vm().cycleVoice(); } catch (e) { /* none */ } },
                after: () => 'Voice, ' + voiceName() + '. This is the voice you will hear.'
            },
            {
                id: 'pause', label: 'Pause', value: () => scanMode() ? 'Scan to Pause' : 'Hold Enter',
                action: () => s.set('pauseMode', scanMode() ? 'hold' : 'scan'),
                after: () => scanMode()
                    ? 'Pause, scan to pause. In the game, the highlight moves between Magic and Pause.'
                    : 'Pause, hold Enter. In the game, every press makes magic. Hold Enter to pause.'
            },
            {
                id: 'skyword', label: 'Sky Word', value: () => s.get('skyWord').trim() || 'Off',
                action: () => { wordFrom = 'settings'; show('word'); }
            },
            {
                id: 'look', label: 'Look', value: () => s.get('look') === 'simple' ? 'Simple High Contrast' : 'Regular',
                action: () => s.set('look', s.get('look') === 'simple' ? 'regular' : 'simple'),
                after: () => s.get('look') === 'simple'
                    ? 'Look, simple high contrast. In the game, a plain black screen with one big bright shape for each press.'
                    : 'Look, regular. The full, colourful scenes.'
            },
            ...(s.get('look') === 'simple' ? [{
                id: 'simplecolor', label: 'Simple Color', value: () => s.simpleColorName(),
                action: () => s.cycle('simpleColorIndex', s.SIMPLE_COLORS.length),
                after: () => 'Simple color, ' + s.simpleColorName() + '.'
            }] : []),
            {
                id: 'hlstyle', label: 'Highlight Style', value: () => s.get('highlightStyle') === 'full' ? 'Block' : 'Bold Band',
                action: () => s.set('highlightStyle', s.get('highlightStyle') === 'full' ? 'outline' : 'full'),
                after: () => s.get('highlightStyle') === 'full'
                    ? 'Highlight style, block. The whole button fills with colour.'
                    : 'Highlight style, bold band. A thick band goes around the button.'
            },
            {
                id: 'hlcolor', label: 'Highlight Color', value: () => s.highlightColorName(),
                action: () => s.cycle('highlightColorIndex', s.HIGHLIGHT_COLORS.length),
                after: () => 'Highlight color, ' + s.highlightColorName() + '.'
            },
            {
                id: 'auto', label: 'Auto Scan', value: () => autoOn() ? 'On — One Switch' : 'Off — Two Switches',
                action: () => { try { sm().toggleAutoScan(); } catch (e) { /* none */ } },
                after: () => autoOn()
                    ? 'Auto scan on. One switch. The highlight moves by itself and Enter chooses.'
                    : 'Auto scan off. Two switches. Space moves the highlight and Enter chooses.'
            },
            {
                id: 'speed', label: 'Scan Speed', value: speedLabel,
                action: () => { try { sm().cycleScanSpeed(); } catch (e) { /* none */ } },
                after: () => 'Scan speed, ' + speedLabel() + '.'
            },
            {
                id: 'sound', label: 'Sound Effects', value: () => onOff(s.get('sound')),
                action: () => { s.toggle('sound'); NMB.Sound.sample(); },
                after: () => s.get('sound') ? 'Sound effects on.' : 'Sound effects off.'
            },
            {
                id: 'volume', label: 'Volume', value: () => s.volumeName(),
                action: () => { s.cycle('volumeIndex', s.VOLUMES.length); NMB.Sound.sample(); },
                after: () => 'Volume, ' + s.volumeName() + '.'
            },
            {
                id: 'back', label: '← Back', value: () => '', nav: true,
                action: () => show(settingsFrom === 'pause' ? 'pause' : 'menu')
            }
        ];
    }

    function renderSettings() {
        settingsCache = settingsItems();
        el.settingsList.innerHTML = '';
        settingsCache.forEach(function (item) {
            const b = button('nmb-row' + (item.nav ? ' nmb-row-nav' : ''), el.settingsList);
            b.dataset.setting = item.id;
            node('span', 'nmb-row-label', b, item.label);
            node('span', 'nmb-row-value', b, item.value());
        });
        fit();
    }

    function settingsScannables() {
        return settingsCache.map(function (item) {
            return {
                id: 'set:' + item.id,
                el: el.settingsList.querySelector('[data-setting="' + item.id + '"]'),
                speak: function () { const v = item.value(); return v ? item.label + ', ' + v : 'Back'; },
                action: function () {
                    item.action();
                    if (item.nav || screen !== 'settings') return;
                    // Redraw and stay on the same row, then say what it means now.
                    renderSettings();
                    NMB.Input.refresh(false);
                    const line = item.after && item.after();
                    if (line) NMB.Input.announce(line);
                }
            };
        });
    }

    // --- sky word ---------------------------------------------------------------------
    //
    // ABC order like the hub's own keyboards. Scan the rows, choose one, then
    // scan its keys; the shared scan adds a spoken Back stop after the last
    // key. Done keeps the word; nothing changes until Done is chosen.

    const WORD_ROWS = [
        ['A', 'B', 'C', 'D', 'E', 'F'],
        ['G', 'H', 'I', 'J', 'K', 'L'],
        ['M', 'N', 'O', 'P', 'Q', 'R'],
        ['S', 'T', 'U', 'V', 'W', 'X'],
        ['Y', 'Z', '0', '1', '2', '3'],
        ['4', '5', '6', '7', '8', '9'],
        ['Space', 'Delete']
    ];
    let wordDraft = '', wordFrom = 'settings';

    function renderWord() {
        el.wordShow.textContent = wordDraft || 'Spell a name, word or age';
        el.wordShow.classList.toggle('empty', !wordDraft);
        fit();
    }

    function typeKey(k) {
        if (k === 'Delete') wordDraft = wordDraft.slice(0, -1);
        else if (k === 'Space') { if (wordDraft && !/ $/.test(wordDraft)) wordDraft += ' '; }
        else if (wordDraft.length < S().WORD_MAX) wordDraft += k;
        wordDraft = wordDraft.slice(0, S().WORD_MAX);
        NMB.Sound.blip();
        renderWord();
    }

    function rowLabel(keys) { return keys.length > 2 ? keys.join(', ') : keys.join(' and '); }

    function wordScannables() {
        const rows = Array.prototype.slice.call(el.wordKeys.querySelectorAll('.nmb-key-row'));
        const list = rows.map(function (rowEl, ri) {
            const keys = WORD_ROWS[ri];
            return {
                id: 'word:row:' + ri,
                el: rowEl,
                speak: rowLabel(keys),
                action: function () {
                    NMB.Input.enterGroup('word:keys:' + ri, keys.map(function (k) {
                        return {
                            id: 'word:key:' + k,
                            el: rowEl.querySelector('[data-key="' + k + '"]'),
                            speak: k,
                            action: function () { typeKey(k); NMB.Input.back(); }
                        };
                    }));
                }
            };
        });
        const done = el.word.querySelector('[data-word="done"]'), clear = el.word.querySelector('[data-word="clear"]');
        list.push({
            id: 'word:done', el: done, speak: 'Done',
            action: function () {
                S().set('skyWord', wordDraft.trim());
                const w = S().get('skyWord');
                show(wordFrom);
                NMB.Input.announce(w ? 'Sky word, ' + w + '. Every few fireworks spell it.' : 'Sky word off.');
            }
        });
        list.push({
            id: 'word:clear', el: clear, speak: 'Clear',
            action: function () { wordDraft = ''; renderWord(); NMB.Input.announce('Cleared.'); }
        });
        return list;
    }

    // --- play -------------------------------------------------------------------------

    function playScannables() {
        if (!scanMode()) return [];
        return [
            { id: 'play:magic', el: el.magicBtn, speak: 'Magic', action: function () { NMB.Game.magic(); } },
            { id: 'play:pause', el: el.pauseBtn, speak: 'Pause', action: function () { NMB.Game.pause(); } }
        ];
    }

    function scannables() {
        switch (screen) {
            case 'menu': return menuScannables();
            case 'settings': return settingsScannables();
            case 'pause': return pauseScannables();
            case 'help': return helpScannables();
            case 'word': return wordScannables();
            case 'play': return playScannables();
            default: return [];
        }
    }

    let scanHost = null;
    /** Where the shared "Parked" badge lives, outside the choices. */
    function scanContext() {
        if (!scanHost) scanHost = node('div', 'nmb-scan-status');
        const parent = screen === 'play' ? el.hud : el[screen] && el[screen].querySelector('.nmb-card');
        if (parent && scanHost.parentElement !== parent) parent.prepend(scanHost);
        return { key: screen + (screen === 'play' ? ':' + S().get('pauseMode') : ''), host: scanHost };
    }

    return {
        build: build,
        show: show,
        current: current,
        scannables: scannables,
        scanContext: scanContext,
        prompt: prompt,
        promptShown: promptShown,
        holdRing: holdRing,
        bumpMagic: bumpMagic,
        stageEl: function () { return el.stage; },
        magicName: magicName
    };
})();
