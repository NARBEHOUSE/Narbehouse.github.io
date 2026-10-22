/**
 * NARBE Glow Pop - the DOM interface on top of the scene.
 *
 * Screens: menu, play, settings, pause, help. Every menu is a plain, dark
 * card over the dimmed scene, scaled to fit the window so nothing ever
 * scrolls. Plain and calm on purpose: Glow Pop is for players with CVI.
 *
 * Settings are grouped into short pages (How It Looks, How It Plays,
 * Switches, Sound & Voice) so the rows stay big. How It Looks has a small
 * live picture of the screen, so a caregiver sees each change as it is made.
 *
 * Scanning reads each choice simply: just what the button says, plus a
 * setting's current value. What an option means is said after it is chosen.
 */

window.NGP = window.NGP || {};

NGP.UI = (function () {
    'use strict';

    let screen = 'menu';
    let settingsFrom = 'menu';
    let page = 'top';
    let helpPage = 0;
    const el = {};

    function S() { return NGP.Settings; }
    const C = NGP.CONFIG;
    function scanMode() { return S().get('pauseMode') === 'scan'; }

    const SHAPES = Object.keys(C.shapes);
    function shapeName(id) { return (C.shapes[id] || C.shapes.ball).label; }

    // --- helpers -------------------------------------------------------------------

    function node(tag, cls, parent, text) {
        const n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text !== undefined) n.textContent = text;
        if (parent) parent.appendChild(n);
        return n;
    }

    function button(cls, parent, label) {
        const b = node('button', 'ngp-btn ' + (cls || ''), parent);
        b.type = 'button';
        if (label !== undefined) b.textContent = label;
        return b;
    }

    function onOff(v) { return v ? 'On' : 'Off'; }

    const ICON = (function () {
        const svg = body => '<svg class="ngp-icon" viewBox="0 0 48 48" aria-hidden="true" focusable="false">' + body + '</svg>';
        let teeth = '';
        for (let i = 0; i < 8; i++) {
            const a = Math.PI / 4 * i;
            teeth += '<line x1="' + (24 + Math.cos(a) * 13.5).toFixed(1) + '" y1="' + (24 + Math.sin(a) * 13.5).toFixed(1) +
                '" x2="' + (24 + Math.cos(a) * 18.5).toFixed(1) + '" y2="' + (24 + Math.sin(a) * 18.5).toFixed(1) + '" stroke-width="5.5"/>';
        }
        let rays = '';
        for (let i = 0; i < 8; i++) {
            const a = Math.PI / 4 * i;
            rays += '<line x1="' + (24 + Math.cos(a) * 13).toFixed(1) + '" y1="' + (24 + Math.sin(a) * 13).toFixed(1) +
                '" x2="' + (24 + Math.cos(a) * 19).toFixed(1) + '" y2="' + (24 + Math.sin(a) * 19).toFixed(1) + '"/>';
        }
        return {
            help: svg('<circle cx="24" cy="24" r="17"/><path d="M19 19a5 5 0 1 1 5 7v2"/><circle cx="24" cy="34" r="1.8" class="ngp-dot"/>'),
            settings: svg('<circle cx="24" cy="24" r="14"/><circle cx="24" cy="24" r="5.5"/>' + teeth),
            exit: svg('<path d="M28 10H12v28h16"/><path d="M24 24h14"/><path d="M32 18l6 6-6 6"/>'),
            play: svg('<circle cx="24" cy="24" r="17"/><path d="M20 17l12 7-12 7z"/>'),
            home: svg('<path d="M8 23 24 10l16 13"/><path d="M12 23v17h24V23"/><path d="M20 40V30h8v10"/>'),
            back: svg('<path d="M30 12 18 24l12 12"/>'),
            speaker: svg('<path d="M9 19h7l9-7v24l-9-7H9z"/><path d="M32 18a9 9 0 0 1 0 12"/><path d="M37 13a16 16 0 0 1 0 22"/>'),
            eye: svg('<path d="M4 24s7-12 20-12 20 12 20 12-7 12-20 12S4 24 4 24z"/><circle cx="24" cy="24" r="6"/>'),
            pop: svg('<circle cx="24" cy="24" r="7"/>' + rays),
            switch: svg('<ellipse cx="24" cy="33" rx="17" ry="7"/><path d="M11 32v-6a13 8 0 0 1 26 0v6"/>'),
            pause: '<svg class="ngp-icon" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><rect x="13" y="10" width="8" height="28" rx="3" class="ngp-fill"/><rect x="27" y="10" width="8" height="28" rx="3" class="ngp-fill"/></svg>'
        };
    })();

    function menuItem(parent, label, icon) {
        const b = button('ngp-menu-item', parent);
        node('span', 'ngp-icon-chip', b).innerHTML = ICON[icon] || '';
        node('span', 'ngp-menu-label', b, label);
        return b;
    }

    function card(screenEl, title, sub) {
        const c = node('div', 'ngp-card', screenEl);
        if (title) node('h2', 'ngp-title', c, title);
        if (sub !== undefined) node('p', 'ngp-sub', c, sub);
        return c;
    }

    /** A canvas sized to its box, for still pictures drawn by the scene. */
    function sizedContext(canvas) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = canvas.clientWidth, h = canvas.clientHeight;
        if (!w || !h) return null;
        const pw = Math.round(w * dpr), ph = Math.round(h * dpr);
        if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; }
        const c = canvas.getContext('2d');
        c.setTransform(dpr, 0, 0, dpr, 0, 0);
        return { c: c, w: w, h: h };
    }

    // --- build -----------------------------------------------------------------------

    function build() {
        el.root = document.getElementById('ngp');
        el.stage = node('canvas', 'ngp-stage', el.root);
        el.stage.setAttribute('aria-hidden', 'true');

        // Play: Pop (Scan to Pause only - an optional ring around the shape) and Pause.
        el.hud = node('div', 'ngp-hud', el.root);
        el.popBtn = button('ngp-pop-btn', el.hud);
        el.popBtn.setAttribute('aria-label', 'Pop');
        el.pauseBtn = button('ngp-pause-btn', el.hud);
        el.pauseBtn.setAttribute('aria-label', 'Pause');
        el.ring = node('span', 'ngp-ring', el.pauseBtn);
        node('span', 'ngp-pause-icon', el.pauseBtn).innerHTML = ICON.pause;
        node('span', 'ngp-pause-label', el.pauseBtn, 'Pause');
        el.pauseTip = node('span', 'ngp-pause-tip', el.hud);
        el.pauseTip.id = 'ngp-pause-tip';
        el.pauseBtn.setAttribute('aria-describedby', el.pauseTip.id);

        // Main menu.
        el.menu = node('section', 'ngp-screen ngp-screen-menu', el.root);
        const mc = node('div', 'ngp-card ngp-card-menu', el.menu);
        const head = node('div', 'ngp-brand', mc);
        node('span', 'ngp-logo', head);
        const words = node('div', 'ngp-brand-words', head);
        node('span', 'ngp-brand-narbe', words, 'NARBE');
        node('h1', 'ngp-brand-title', words, 'Glow Pop');
        node('p', 'ngp-sub', mc, 'Choose one to pop.');
        el.tiles = node('div', 'ngp-tiles', mc);
        el.tilePics = [];
        SHAPES.forEach(function (id) {
            const t = button('ngp-tile', el.tiles);
            t.dataset.shape = id;
            const pic = node('canvas', 'ngp-pic', t);
            pic.setAttribute('aria-hidden', 'true');
            el.tilePics.push({ canvas: pic, shape: id });
            node('span', 'ngp-tile-label', t, shapeName(id));
        });
        el.menuUtil = node('div', 'ngp-util', mc);
        menuItem(el.menuUtil, 'How to Play', 'help').dataset.menu = 'help';
        const settingsButton = menuItem(el.menuUtil, 'Settings', 'settings');
        settingsButton.dataset.menu = 'settings';
        // The standalone copy (opened from a file, outside the hub) has no hub to go back to.
        if (!NGP.STANDALONE) menuItem(el.menuUtil, 'Exit Game', 'exit').dataset.menu = 'exit';
        else el.menuUtil.style.gridTemplateColumns = 'repeat(2, minmax(0, 1fr))';
        const settingsNote = node('p', 'ngp-settings-note', mc,
            'Use Settings to adjust colors, size, sound and play to suit the switch user.');
        settingsNote.id = 'ngp-settings-note';
        settingsButton.setAttribute('aria-describedby', settingsNote.id);

        // Settings: one card, redrawn for each page.
        el.settings = node('section', 'ngp-screen', el.root);
        el.settingsCard = node('div', 'ngp-card ngp-card-settings', el.settings);
        el.settingsTitle = node('h2', 'ngp-title', el.settingsCard);
        el.settingsBody = node('div', 'ngp-settings-body', el.settingsCard);
        el.settingsList = node('div', 'ngp-settings-list', el.settingsBody);
        el.preview = node('div', 'ngp-preview', el.settingsBody);
        el.previewPic = node('canvas', 'ngp-preview-pic', el.preview);
        el.previewPic.setAttribute('aria-hidden', 'true');

        // Pause.
        el.pause = node('section', 'ngp-screen', el.root);
        const pc = card(el.pause, 'Paused');
        pc.classList.add('ngp-card-narrow');
        el.pauseList = node('div', 'ngp-list', pc);
        PAUSE_ITEMS.forEach(function (m, i) { menuItem(el.pauseList, m.label, m.icon).dataset.pause = String(i); });

        // How to play.
        el.help = node('section', 'ngp-screen', el.root);
        const hc = node('div', 'ngp-card ngp-card-narrow', el.help);
        hc.classList.add('ngp-card-help');
        el.helpTitle = button('ngp-help-title', hc);
        el.helpTitle.innerHTML = '<span class="ngp-icon-chip">' + ICON.speaker + '</span><span>How to Play</span>';
        el.helpStep = node('p', 'ngp-help-step', hc);
        el.helpBody = node('div', 'ngp-help-body', hc);
        const helpNav = node('div', 'ngp-help-nav', hc);
        el.helpMore = menuItem(helpNav, 'More Help', 'play');
        el.helpBack = menuItem(helpNav, 'Back', 'back');

        // A tap anywhere on the scene during play pops it. Buttons in the
        // scan handle their own clicks.
        el.root.addEventListener('pointerdown', function (e) {
            if (screen !== 'play' || e.button > 0) return;
            if (e.target.closest && e.target.closest('button')) return;
            e.preventDefault();
            NGP.Game.pop();
        });
        el.pauseBtn.addEventListener('click', function (e) {
            if (!NGP.Input.isFreePlay()) return;     // in the scan it is a scan item
            e.preventDefault();
            NGP.Game.pause();
        });
        window.addEventListener('contextmenu', function (e) { if (screen === 'play') e.preventDefault(); });

        window.addEventListener('resize', function () {
            if (screen === 'settings') sizePreview();
            fit();
        });
        try {
            window.NarbeVoiceManager.onSettingsChange(refreshSettingsValues);
            window.NarbeScanManager.subscribe(refreshSettingsValues);
        } catch (e) { /* managers missing */ }
    }

    function refreshSettingsValues() {
        if (screen !== 'settings') return;
        renderSettings();
        NGP.Input.refresh(false);
    }

    // --- screens ----------------------------------------------------------------------

    function show(name) {
        screen = name;
        ['menu', 'settings', 'pause', 'help'].forEach(function (k) { el[k].classList.toggle('show', k === name); });
        el.hud.classList.toggle('show', name === 'play');
        el.root.dataset.screen = name;
        el.root.dataset.pauseMode = S().get('pauseMode');
        el.pauseTip.textContent = scanMode()
            ? 'Choose Pause, hold Enter for 5 seconds, or click or tap Pause to open the menu.'
            : 'Hold Enter for 5 seconds or click or tap Pause to open the menu.';
        NGP.Scene.setLive(name === 'play');

        if (name === 'settings') { openPage('top'); return; }
        if (name === 'help') { helpPage = 0; renderHelp(); }
        if (name === 'play') placePopButton();

        fit();
        NGP.Input.refresh(true);

        const line = {
            menu: 'Glow Pop. Choose one to pop.',
            pause: 'Paused.',
            help: 'How to play. Choose the title to hear the directions.',
            play: shapeName(S().get('shape')) + '. ' + (scanMode() ? 'Choose Pop.' : 'Press to pop!')
        }[name];
        if (line) NGP.Input.announce(line);
    }

    function current() { return screen; }

    /** Scale the card to fit the window, so nothing is ever cut off or scrolled. */
    function fit() {
        const sec = el[screen];
        const c = sec && sec.querySelector && sec.querySelector('.ngp-card');
        if (!c) return;
        c.style.setProperty('--card-scale', '1');
        const w = c.offsetWidth, h = c.offsetHeight;
        if (!w || !h) return;
        const s = Math.min(1, (window.innerWidth - 16) / w, (window.innerHeight - 16) / h);
        c.style.setProperty('--card-scale', s.toFixed(3));
    }

    function holdRing(p) {
        p = Math.max(0, Math.min(1, p || 0));
        el.ring.style.setProperty('--p', p.toFixed(3));
        el.pauseBtn.classList.toggle('holding', p > 0);
    }

    /** In Scan to Pause, Pop covers the shape, with an optional selection ring. */
    function placePopButton() {
        const g = NGP.Scene.geometry();
        const d = g.R * 2.2;
        el.popBtn.style.left = (g.x - d / 2) + 'px';
        el.popBtn.style.top = (g.y - d / 2) + 'px';
        el.popBtn.style.width = d + 'px';
        el.popBtn.style.height = d + 'px';
    }

    /** Called by the scene every frame: keeps the pictures alive. */
    function frame() {
        if (screen === 'menu') {
            const turns = S().get('color') === 'turns' ? NGP.Scene.turnColors() : null;
            el.tilePics.forEach(function (t, i) {
                const s = sizedContext(t.canvas);
                if (s) NGP.Scene.paintStill(s.c, s.w, s.h, { shape: t.shape, fill: 0.3, color: turns ? turns[(i * 2) % turns.length] : null });
            });
        } else if (screen === 'settings' && page === 'look') {
            const s = sizedContext(el.previewPic);
            if (s) NGP.Scene.paintStill(s.c, s.w, s.h, { screen: true });
        } else if (screen === 'play') {
            placePopButton();
        }
    }

    // --- main menu --------------------------------------------------------------------

    function menuScannables() {
        const list = SHAPES.map(function (id) {
            return {
                id: 'menu:' + id,
                el: el.tiles.querySelector('[data-shape="' + id + '"]'),
                speak: shapeName(id),
                action: function () { NGP.Game.start(id); }
            };
        });
        return list.concat([
            { id: 'menu:help', el: el.menuUtil.querySelector('[data-menu="help"]'), speak: 'How to Play', action: function () { show('help'); } },
            { id: 'menu:settings', el: el.menuUtil.querySelector('[data-menu="settings"]'), speak: 'Settings', action: function () { settingsFrom = 'menu'; show('settings'); } },
            { id: 'menu:exit', el: el.menuUtil.querySelector('[data-menu="exit"]'), speak: 'Exit Game', action: function () { NGP.Game.exit(); } }
        ]);
    }

    // --- pause ------------------------------------------------------------------------

    const PAUSE_ITEMS = [
        { label: 'Continue', icon: 'play', action: function () { show('play'); } },
        { label: 'Settings', icon: 'settings', action: function () { settingsFrom = 'pause'; show('settings'); } },
        { label: 'How to Play', icon: 'help', action: function () { show('help'); } },
        { label: 'Main Menu', icon: 'home', action: function () { NGP.Game.toMenu(); } },
        { label: 'Exit Game', icon: 'exit', hub: true, action: function () { NGP.Game.exit(); } }
    ].filter(function (m) { return !(m.hub && NGP.STANDALONE); });

    function pauseScannables() {
        const at = i => el.pauseList.querySelector('[data-pause="' + i + '"]');
        return PAUSE_ITEMS.map(function (m, i) {
            return { id: 'pause:' + i, el: at(i), speak: m.label, action: m.action };
        });
    }

    // --- how to play ------------------------------------------------------------------

    /** Printed AND read aloud from these same lines, so the two never drift. */
    function helpLines() {
        let auto = false;
        try { auto = !!window.NarbeScanManager.getSettings().autoScan; } catch (e) { /* no scan manager */ }
        const lines = ['Choose the *Ball*, the *Ladybug* or the *Bee*.'];
        if (scanMode()) {
            lines.push((auto ? '*Pop* and *Pause* highlight automatically. ' : '*Space* highlights *Pop* or *Pause*. ') +
                '*Enter* chooses. You can also *click or tap* these buttons.');
        } else {
            lines.push('Press a *switch* or *key*, or *click or tap* the picture to play. Release before pressing again.');
        }
        lines.push({
            every: '*Every Press Counts*: pop it! Pressing while it comes back makes a smaller burst.',
            build: '*Build Up*: each press makes it grow. *' + C.buildUpTaps + ' presses* make a big pop.',
            wait: '*Wait for It*: wait until it *lights up*' + (S().get('sound') ? ' and you hear the *chime*' : '') +
                ', then press to pop. Early presses make a small burst.'
        }[S().get('tapStyle')]);
        const popShapes = S().get('popShape') === 'variety' ? 'a variety of shapes' : S().label('popShape').toLowerCase();
        lines.push('Pops burst into *' + popShapes + '*. ' + (S().get('reactions') === 'same'
            ? '*Same Every Time* repeats a familiar pattern' + (S().get('sound') ? ' and sound.' : '.')
            : '*Mix It Up* varies the motion' + (S().get('sound') ? ' and playful sounds.' : '.')));
        lines.push('*Hold Enter for 5 seconds* or *click or tap Pause* to open the menu.');
        lines.push(auto ? 'In the menus, the highlight moves by itself. *Enter* chooses.'
                        : 'In the menus, *tap Space* to move the highlight and *hold Space* to go back. *Enter* chooses.');
        lines.push('Use *Settings* to adjust colors, size, position, pop shapes, sound and play.');
        lines.push('There is no score, no timer and no way to lose.');
        return lines;
    }

    function visibleHelpLines() { return helpLines().slice(helpPage * 4, helpPage * 4 + 4); }

    function renderHelp() {
        el.helpStep.textContent = helpPage === 0 ? 'Playing · 1 of 2' : 'Menus and Settings · 2 of 2';
        el.helpMore.querySelector('.ngp-menu-label').textContent = helpPage === 0 ? 'More Help' : 'First Page';
        el.helpBody.innerHTML = visibleHelpLines().map(function (line) {
            return '<p>' + line.replace(/\*([^*]+)\*/g, '<b>$1</b>') + '</p>';
        }).join('');
    }

    /** Read the directions, holding the scanner still; any press stops it. */
    function readAloud() {
        const text = el.helpStep.textContent + '. ' + visibleHelpLines().map(l => l.replace(/\*/g, '')).join(' ');
        const ticket = NGP.Voice.speak(text);
        if (!ticket) return;
        let released = false;
        const release = function () {
            if (released) return;
            released = true;
            clearTimeout(timer);
            document.removeEventListener('keydown', onPress, true);
            document.removeEventListener('pointerdown', onPress, true);
            NGP.Input.setEnabled(true);
        };
        const onPress = function () { NGP.Voice.cancel(); release(); };
        NGP.Input.setEnabled(false);
        const timer = setTimeout(release, Math.ceil(text.length / 13 * 1000) + 800);
        Promise.resolve(ticket.finished).then(function (r) { if (r && r.reason !== 'timeout') release(); });
        document.addEventListener('keydown', onPress, true);
        document.addEventListener('pointerdown', onPress, true);
    }

    function helpScannables() {
        return [
            { id: 'help:read', el: el.helpTitle, speak: 'How to Play', action: readAloud },
            {
                id: 'help:more', el: el.helpMore, speak: helpPage === 0 ? 'More Help' : 'First Page',
                action: function () {
                    NGP.Voice.cancel(); helpPage = 1 - helpPage;
                    renderHelp(); fit(); NGP.Input.refresh(true, 'help:more');
                    NGP.Input.announce(el.helpStep.textContent);
                }
            },
            {
                id: 'help:back', el: el.helpBack, speak: 'Back',
                action: function () { NGP.Voice.cancel(); show(NGP.Game.started() ? 'pause' : 'menu'); }
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

    const PAGES = {
        top: { title: 'Settings' },
        look: { title: 'How It Looks', icon: 'eye' },
        play: { title: 'How It Plays', icon: 'pop' },
        switches: { title: 'Switches', icon: 'switch' },
        sound: { title: 'Sound & Voice', icon: 'speaker' }
    };

    /**
     * One of this game's own look-and-play settings. Enter moves it on to the
     * next option; `note` adds what the new option means, said after.
     */
    function gameSetting(key, label, note) {
        const spoken = () => { const o = S().option(key); return o.speak || o.label.toLowerCase(); };
        return {
            id: key, label: label,
            value: () => S().label(key),
            speakValue: () => { const o = S().option(key); return o.speak || o.label; },
            swatch: () => (key === 'color' || key === 'background' || key === 'outline' || key === 'selectionRing') ? (S().option(key).hex || (key === 'color' ? 'turns' : 'none')) : null,
            action: () => { S().next(key); NGP.Scene.settingChanged(key); },
            after: () => label + ', ' + spoken() + '.' + (note ? ' ' + (note() || '') : '')
        };
    }

    function backItem() {
        return {
            id: 'back', label: '← Back', nav: true,
            action: () => {
                if (page === 'top') show(settingsFrom === 'pause' ? 'pause' : 'menu');
                else openPage('top', 'set:' + page);
            }
        };
    }

    /**
     * Each page's rows. Hub order within the pages: the game's own options
     * first, then switches, then Text to Speech, Voice and sound.
     */
    function pageItems() {
        const s = S();
        if (page === 'top') {
            return ['look', 'play', 'switches', 'sound'].map(function (p) {
                return { id: p, label: PAGES[p].title, icon: PAGES[p].icon, nav: true, action: () => openPage(p) };
            }).concat([backItem()]);
        }
        if (page === 'look') {
            return [
                gameSetting('shape', 'Shape'),
                gameSetting('size', 'Size'),
                gameSetting('color', 'Color', () => s.get('color') === 'turns' ? 'Each one is a new color.' : ''),
                gameSetting('background', 'Background'),
                gameSetting('outline', 'Outline', () => s.get('outline') !== 'off' ? 'A bold edge can make it easier to pick out, especially in a bright room.' : ''),
                gameSetting('position', 'Where It Appears', () => 'Move it to the part of the screen the player sees best.'),
                backItem()
            ];
        }
        if (page === 'play') {
            const list = [gameSetting('tapStyle', 'Tap Style', () => s.option('tapStyle').note)];
            if (s.get('tapStyle') === 'wait') {
                list.push(gameSetting('waitTime', 'Wait Time', () => 'Start short. Make it a little longer as the player gets used to waiting.'));
            }
            return list.concat([
                gameSetting('comesBack', 'Comes Back'),
                gameSetting('reactions', 'Reactions', () => s.option('reactions').note),
                gameSetting('popShape', 'Pop Shapes', () => s.get('popShape') === 'variety'
                    ? 'Same Every Time repeats a mix of shapes. Mix It Up changes the shape on each burst.'
                    : 'Each burst uses ' + s.label('popShape').toLowerCase() + '.'),
                backItem()
            ]);
        }
        if (page === 'switches') {
            return [
                {
                    id: 'pause', label: 'Pause', value: () => scanMode() ? 'Scan to Pause' : 'Hold Enter',
                    action: () => s.set('pauseMode', scanMode() ? 'hold' : 'scan'),
                    after: () => scanMode()
                        ? 'Pause, scan to pause. In the game, the highlight moves between Pop and Pause.'
                        : 'Pause, hold Enter. In the game, every press pops. Hold Enter to pause.'
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
                    id: 'hlstyle', label: 'Highlight Style', value: () => s.get('highlightStyle') === 'full' ? 'Block' : 'Bold Band',
                    action: () => s.set('highlightStyle', s.get('highlightStyle') === 'full' ? 'outline' : 'full'),
                    after: () => s.get('highlightStyle') === 'full'
                        ? 'Highlight style, block. The whole button fills with colour.'
                        : 'Highlight style, bold band. A thick band goes around the button.'
                },
                {
                    id: 'hlcolor', label: 'Highlight Color', value: () => s.highlightColorName(),
                    swatch: () => s.highlightColor(),
                    action: () => s.cycle('highlightColorIndex', s.HIGHLIGHT_COLORS.length),
                    after: () => 'Highlight color, ' + s.highlightColorName() + '.'
                },
                gameSetting('selectionRing', 'Object Ring', () => s.get('selectionRing') === 'off'
                    ? 'No ring around the selected object.'
                    : 'A ring around the object when Pop is selected in Scan to Pause.'),
                backItem()
            ];
        }
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
                id: 'sound', label: 'Sound Effects', value: () => onOff(s.get('sound')),
                action: () => { s.toggle('sound'); NGP.Sound.sample(); },
                after: () => s.get('sound') ? 'Sound effects on.' : 'Sound effects off.'
            },
            {
                id: 'volume', label: 'Volume', value: () => s.volumeName(),
                action: () => { s.cycle('volumeIndex', s.VOLUMES.length); NGP.Sound.sample(); },
                after: () => 'Volume, ' + s.volumeName() + '.'
            },
            backItem()
        ];
    }

    let settingsCache = [];

    /** Show a settings page. Coming back to the top lands on the page's own row. */
    function openPage(next, restoreId) {
        page = next;
        el.root.dataset.page = page;
        renderSettings();
        NGP.Input.refresh(true, restoreId);
        if (!restoreId) NGP.Input.announce(PAGES[page].title + '.');
    }

    /** The preview is a small copy of the whole screen, the same shape as it. */
    function sizePreview() {
        if (page !== 'look') return;
        const aspect = window.innerWidth / Math.max(1, window.innerHeight);
        let w, h;
        if (aspect >= 1) {
            w = Math.min(380, window.innerWidth * 0.34);
            h = w / aspect;
        } else {
            h = Math.min(260, window.innerHeight * 0.22);
            w = h * aspect;
        }
        el.preview.style.width = Math.round(w) + 'px';
        el.preview.style.height = Math.round(h) + 'px';
    }

    function renderSettings() {
        settingsCache = pageItems();
        el.settingsTitle.textContent = PAGES[page].title;
        el.settingsCard.classList.toggle('ngp-card-top', page === 'top');
        el.settingsCard.classList.toggle('with-preview', page === 'look');
        el.settingsList.innerHTML = '';
        settingsCache.forEach(function (item) {
            let b;
            if (page === 'top' && item.icon) {
                b = menuItem(el.settingsList, item.label, item.icon);
            } else {
                b = button('ngp-row' + (item.nav ? ' ngp-row-nav' : ''), el.settingsList);
                node('span', 'ngp-row-label', b, item.label);
                if (item.value) {
                    const v = node('span', 'ngp-row-value', b);
                    const sw = item.swatch && item.swatch();
                    if (sw) {
                        const dot = node('span', 'ngp-swatch' + (sw === 'turns' ? ' turns' : sw === 'none' ? ' none' : ''), v);
                        if (sw !== 'turns' && sw !== 'none') dot.style.background = sw;
                    }
                    node('span', '', v, item.value());
                }
            }
            b.dataset.setting = item.id;
        });
        sizePreview();
        fit();
    }

    function settingsScannables() {
        return settingsCache.map(function (item) {
            return {
                id: 'set:' + item.id,
                el: el.settingsList.querySelector('[data-setting="' + item.id + '"]'),
                speak: function () {
                    if (!item.value) return item.id === 'back' ? 'Back' : item.label;
                    return item.label + ', ' + (item.speakValue ? item.speakValue() : item.value());
                },
                action: function () {
                    const before = page;
                    item.action();
                    if (item.nav || screen !== 'settings' || page !== before) return;
                    // Redraw and stay on the same row, then say what it means now.
                    renderSettings();
                    NGP.Input.refresh(false);
                    const line = item.after && item.after();
                    if (line) NGP.Input.announce(line);
                }
            };
        });
    }

    // --- play -------------------------------------------------------------------------

    function playScannables() {
        if (!scanMode()) return [];
        return [
            { id: 'play:pop', el: el.popBtn, speak: 'Pop', action: function () { NGP.Game.pop(); } },
            { id: 'play:pause', el: el.pauseBtn, speak: 'Pause', action: function () { NGP.Game.pause(); } }
        ];
    }

    function scannables() {
        switch (screen) {
            case 'menu': return menuScannables();
            case 'settings': return settingsScannables();
            case 'pause': return pauseScannables();
            case 'help': return helpScannables();
            case 'play': return playScannables();
            default: return [];
        }
    }

    let scanHost = null;
    /** Where the shared "Parked" badge lives, outside the choices. */
    function scanContext() {
        if (!scanHost) scanHost = node('div', 'ngp-scan-status');
        const parent = screen === 'play' ? el.hud : el[screen] && el[screen].querySelector('.ngp-card');
        if (parent && scanHost.parentElement !== parent) parent.prepend(scanHost);
        const key = screen === 'play' ? 'play:' + S().get('pauseMode') : screen === 'settings' ? 'settings:' + page : screen;
        return { key: key, host: scanHost };
    }

    return {
        build: build,
        show: show,
        current: current,
        page: function () { return page; },
        scannables: scannables,
        scanContext: scanContext,
        holdRing: holdRing,
        frame: frame,
        stageEl: function () { return el.stage; },
        shapeName: shapeName
    };
})();
