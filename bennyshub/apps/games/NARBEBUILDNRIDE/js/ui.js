/**
 * NARBE Build n Ride - the DOM interface on top of the 3D stage.
 * (Built from NARBE Build n Bash's ui.js: same cards, buttons, scan and speech.)
 *
 * Screens: loading, error, menu, select, play, build, track, confirm, pause,
 * settings, help. Menus are frosted cards over the live scene, scaled to fit
 * so nothing ever scrolls. The scan list for whatever is showing comes from
 * scannables().
 *
 * Main menu: Ride, Quick Build, Build, My Tracks, Settings, Exit Game.
 * The picture grid (select) serves three lists, a paged 3x3 grid each, tile by
 *   tile, then More... (past 9) and Back: Pick a Ride (routes, with how long a
 *   lap takes and how many stations), Pick a Design (Quick Build) and My Tracks.
 * My Tracks: a track's own card (Ride, Delete, Back); Delete asks first, with
 *   Keep It first so a stray press keeps the track.
 * Play (Ride): View, Look, Horn and Speed along the bottom, Pause at the top
 *   right, scanned in that order.
 * Build: Straight, Long Straight, Turn Left, Turn Right, Undo, Connect, Pause.
 *   While Connect lays the way home only Pause is in the scan; once the loop is
 *   closed: Ride and Pause. Quick Build: Build (hold Enter to keep building),
 *   Pause; then Ride and Pause.
 * Pause: Resume, Settings, I Need Help, How to Play, (Build: New Track), Main
 *   Menu, Exit Game.
 */

window.BNR = window.BNR || {};

BNR.UI = (function () {
    'use strict';

    let screen = 'loading';
    let settingsFrom = 'menu', helpFrom = 'pause', pauseFrom = 'play';
    let page = 0;
    let selectMode = 'ride';        // ride | quick | tracks
    let trackId = null;             // the My Tracks card showing
    let ask = null;                 // the confirm card: { title, text, yes, no, onYes, onNo }
    const PER_PAGE = 9;
    const el = {};
    const thumbs = {};

    function S() { return BNR.Settings; }

    // --- helpers -----------------------------------------------------------------------

    function node(tag, cls, parent, text) {
        const n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text !== undefined) n.textContent = text;
        if (parent) parent.appendChild(n);
        return n;
    }

    function button(cls, parent, label) {
        const b = node('button', 'bnr-btn ' + (cls || ''), parent);
        b.type = 'button';
        if (label !== undefined) b.textContent = label;
        return b;
    }

    function onOff(v) { return v ? 'On' : 'Off'; }

    const ICON = (function () {
        const svg = body => '<svg class="bnr-icon" viewBox="0 0 48 48" aria-hidden="true" focusable="false">' + body + '</svg>';
        let teeth = '';
        for (let i = 0; i < 8; i++) {
            const a = Math.PI / 4 * i;
            teeth += '<line x1="' + (24 + Math.cos(a) * 13.5).toFixed(1) + '" y1="' + (24 + Math.sin(a) * 13.5).toFixed(1) +
                '" x2="' + (24 + Math.cos(a) * 18.5).toFixed(1) + '" y2="' + (24 + Math.sin(a) * 18.5).toFixed(1) + '" stroke-width="5.5"/>';
        }
        return {
            train: '<svg class="bnr-icon" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><rect x="6" y="20" width="24" height="14" rx="3" class="bnr-f2"/><rect x="28" y="12" width="13" height="22" rx="2.5" class="bnr-f2"/><rect x="11" y="10" width="6" height="11" rx="1.5" class="bnr-f3"/><circle cx="14" cy="37" r="5" class="bnr-f1"/><circle cx="33" cy="37" r="5" class="bnr-f1"/></svg>',
            ride: svg('<path d="M10 33h28"/><path d="M14 33l3-15h14l3 15"/><circle cx="18" cy="38" r="3.2"/><circle cx="30" cy="38" r="3.2"/><path d="M19 18v-6h10v6"/>'),
            settings: svg('<circle cx="24" cy="24" r="14"/><circle cx="24" cy="24" r="5.5"/>' + teeth),
            exit: svg('<path d="M28 10H12v28h16"/><path d="M24 24h14"/><path d="M32 18l6 6-6 6"/>'),
            play: svg('<circle cx="24" cy="24" r="17"/><path d="M20 17l12 7-12 7z"/>'),
            home: svg('<path d="M8 23 24 10l16 13"/><path d="M12 23v17h24V23"/><path d="M20 40V30h8v10"/>'),
            back: svg('<path d="M30 12 18 24l12 12"/>'),
            help: svg('<circle cx="24" cy="24" r="17"/><path d="M19 19a5 5 0 1 1 5 7v2"/><circle cx="24" cy="34" r="1.8" class="bnr-dot"/>'),
            hand: svg('<path d="M17 25V12a3 3 0 0 1 6 0v10M23 21V9a3 3 0 0 1 6 0v12M29 21v-8a3 3 0 0 1 6 0v14c0 8-5 13-12 13-5 0-8-3-11-8l-4-7a3 3 0 0 1 5-3l3 4"/>'),
            speaker: svg('<path d="M9 19h7l9-7v24l-9-7H9z"/><path d="M32 18a9 9 0 0 1 0 12"/><path d="M37 13a16 16 0 0 1 0 22"/>'),
            camera: svg('<rect x="6" y="15" width="28" height="20" rx="4"/><path d="M34 21l9-5v18l-9-5"/><circle cx="18" cy="25" r="4.5"/>'),
            eye: svg('<path d="M4 24c5-9 12-13 20-13s15 4 20 13c-5 9-12 13-20 13S9 33 4 24z"/><circle cx="24" cy="24" r="6.5"/><circle cx="24" cy="24" r="2" class="bnr-dot"/>'),
            horn: '<svg class="bnr-icon" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><path class="bnr-f1" d="M8 20h7l16-9v26l-16-9H8z"/><circle cx="37" cy="13" r="4" class="bnr-fill"/><circle cx="41" cy="22" r="3" class="bnr-fill"/><circle cx="39" cy="31" r="3.5" class="bnr-fill"/></svg>',
            speed: svg('<path d="M8 33a16 16 0 0 1 32 0"/><path d="M24 33l9-10"/><circle cx="24" cy="33" r="2.6" class="bnr-dot"/>'),
            next: svg('<path d="M18 12l12 12-12 12"/>'),
            straight: svg('<path d="M18 42V8M30 42V8"/><path d="M14 14h20M14 24h20M14 34h20"/>'),
            long: svg('<path d="M18 44V4M30 44V4"/><path d="M14 9h20M14 17h20M14 25h20M14 33h20M14 41h20"/>'),
            left: svg('<path d="M32 42V30a12 12 0 0 0-12-12H10"/><path d="M17 11l-7 7 7 7"/>'),
            right: svg('<path d="M16 42V30a12 12 0 0 1 12-12h10"/><path d="M31 11l7 7-7 7"/>'),
            undo: svg('<path d="M14 18h17a9 9 0 0 1 0 18H18"/><path d="M20 11l-7 7 7 7"/>'),
            connect: svg('<path d="M24 8c9 0 16 7 16 16s-7 16-16 16S8 33 8 24c0-5 2-9 6-12"/><path d="M8 9l6 3-2 6"/>'),
            quick: svg('<path d="M27 5 12 27h11l-3 16 16-23H25z"/>'),
            build: svg('<path d="M8 34h32"/><path d="M12 34V20h24v14"/><path d="M18 20v-8h12v8"/><path d="M8 42h32"/>'),
            tracks: svg('<rect x="7" y="9" width="14" height="13" rx="3"/><rect x="27" y="9" width="14" height="13" rx="3"/><rect x="7" y="27" width="14" height="13" rx="3"/><rect x="27" y="27" width="14" height="13" rx="3"/>'),
            trash: svg('<path d="M10 14h28"/><path d="M19 14V9h10v5"/><path d="M13 14l2 25h18l2-25"/><path d="M21 21v12M27 21v12"/>'),
            star: svg('<path d="M24 7l5 11 12 1-9 8 3 12-11-7-11 7 3-12-9-8 12-1z"/>'),
            zoom: svg('<circle cx="21" cy="21" r="12"/><path d="M30 30l11 11"/><path d="M15 21h12M21 15v12"/>'),
            pause: '<svg class="bnr-icon" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><rect x="13" y="10" width="8" height="28" rx="3" class="bnr-fill"/><rect x="27" y="10" width="8" height="28" rx="3" class="bnr-fill"/></svg>'
        };
    })();

    function menuItem(parent, label, icon, tone) {
        const b = button('bnr-menu-item', parent);
        if (tone) b.dataset.tone = tone;
        node('span', 'bnr-icon-chip', b).innerHTML = ICON[icon] || '';
        node('span', 'bnr-menu-label', b, label);
        return b;
    }

    function card(screenEl, title, sub) {
        const c = node('div', 'bnr-card', screenEl);
        if (title) node('h2', 'bnr-title', c, title);
        if (sub !== undefined) node('p', 'bnr-sub', c, sub);
        return c;
    }

    function actionButton(cls, icon, label) {
        const b = button('bnr-ride-btn ' + cls, el.rideBar);
        node('span', 'bnr-ride-icon', b).innerHTML = ICON[icon];
        const words = node('span', 'bnr-ride-words', b);
        node('span', 'bnr-ride-label', words, label);
        node('span', 'bnr-ride-value', words, '');
        return b;
    }

    // --- build ---------------------------------------------------------------------------

    function build() {
        el.root = document.getElementById('bnr');
        el.stage = node('div', 'bnr-stage', el.root);

        // Play: HUD.
        el.hud = node('div', 'bnr-hud', el.root);
        el.info = node('div', 'bnr-info', el.hud);
        el.infoName = node('div', 'bnr-info-name', el.info);
        el.infoView = node('div', 'bnr-info-count', el.info);
        el.pauseBtn = button('bnr-pause-btn', el.hud);
        el.pauseBtn.setAttribute('aria-label', 'Pause');
        node('span', 'bnr-pause-icon', el.pauseBtn).innerHTML = ICON.pause;
        node('span', 'bnr-pause-label', el.pauseBtn, 'Pause');
        el.rideBar = node('div', 'bnr-ride-bar', el.hud);
        el.viewBtn = actionButton('bnr-view-btn', 'camera', 'View');
        el.lookBtn = actionButton('bnr-look-btn', 'eye', 'Look');
        el.hornBtn = actionButton('bnr-horn-btn', 'horn', 'Horn');
        el.speedBtn = actionButton('bnr-speed-btn', 'speed', 'Speed');
        // Build: the pieces, Undo and Connect; Quick Build's big Build; Ride once a loop is done.
        el.buildBar = node('div', 'bnr-build-bar', el.hud);
        const buildButton = function (cls, icon, label, tone) {
            const b = button('bnr-build-btn ' + cls, el.buildBar);
            b.dataset.tone = tone;
            node('span', 'bnr-ride-icon', b).innerHTML = ICON[icon];
            node('span', 'bnr-build-label', b, label);
            return b;
        };
        el.bStraight = buildButton('', 'straight', 'Straight', 'blue');
        el.bLong = buildButton('', 'long', 'Long Straight', 'teal');
        el.bLeft = buildButton('', 'left', 'Turn Left', 'plum');
        el.bRight = buildButton('', 'right', 'Turn Right', 'help');
        el.bUndo = buildButton('', 'undo', 'Undo', 'slate');
        el.bConnect = buildButton('', 'connect', 'Connect', 'green');
        el.bZoom = buildButton('', 'zoom', 'Zoom', 'slate');
        el.bZoomValue = node('span', 'bnr-build-value', el.bZoom, '');
        el.bQuick = buildButton('bnr-build-big', 'build', 'Build', 'help');
        el.bRide = buildButton('bnr-build-big', 'ride', 'Ride', 'green');
        el.infoNext = node('div', 'bnr-info-next', el.info);
        el.callout = node('div', 'bnr-callout', el.hud);
        el.callout.setAttribute('aria-live', 'polite');

        // Loading and error.
        el.loading = node('section', 'bnr-screen bnr-screen-loading', el.root);
        const lc = node('div', 'bnr-loading', el.loading);
        node('div', 'bnr-loading-blocks', lc).innerHTML = '<span></span><span></span><span></span>';
        el.loadingText = node('p', 'bnr-loading-text', lc, 'Laying the tracks…');
        el.error = node('section', 'bnr-screen', el.root);
        const ec = card(el.error, 'Build n Ride can’t start', '');
        ec.classList.add('bnr-card-narrow');
        el.errorText = ec.querySelector('.bnr-sub');
        el.errorExit = menuItem(ec, 'Exit Game', 'exit', 'slate');

        // Main menu.
        el.menu = node('section', 'bnr-screen bnr-screen-menu', el.root);
        const mc = node('div', 'bnr-card bnr-card-menu', el.menu);
        const head = node('div', 'bnr-brand', mc);
        node('span', 'bnr-logo', head).innerHTML = ICON.train;
        const words = node('div', 'bnr-brand-words', head);
        node('span', 'bnr-brand-narbe', words, 'NARBE');
        node('h1', 'bnr-brand-title', words, 'Build n Ride');
        node('p', 'bnr-sub bnr-tagline', mc, 'Lay the track. Ride the rails.');
        el.menuList = node('div', 'bnr-list bnr-menu-list', mc);
        menuItem(el.menuList, 'Ride', 'ride', 'green').dataset.menu = 'ride';
        menuItem(el.menuList, 'Quick Build', 'quick', 'help').dataset.menu = 'quick';
        menuItem(el.menuList, 'Build', 'build', 'blue').dataset.menu = 'build';
        menuItem(el.menuList, 'My Tracks', 'tracks', 'teal').dataset.menu = 'tracks';
        menuItem(el.menuList, 'Settings', 'settings', 'plum').dataset.menu = 'settings';
        menuItem(el.menuList, 'Exit Game', 'exit', 'slate').dataset.menu = 'exit';

        // Pick a Ride.
        el.select = node('section', 'bnr-screen', el.root);
        const sc = node('div', 'bnr-card bnr-card-select', el.select);
        const sh = node('div', 'bnr-select-head', sc);
        el.selectTitle = node('h2', 'bnr-title', sh, 'Pick a Ride');
        el.pageLabel = node('span', 'bnr-page-label', sh);
        el.selectEmpty = node('p', 'bnr-sub bnr-select-empty', sc, 'No tracks yet. Choose Build on the main menu, lay a loop, and it is saved here by itself.');
        el.grid = node('div', 'bnr-grid', sc);
        el.selectFoot = node('div', 'bnr-select-foot', sc);
        el.pageBtn = menuItem(el.selectFoot, 'More Rides', 'next', 'blue');
        el.selectBack = menuItem(el.selectFoot, 'Back', 'back', 'slate');

        // One of My Tracks: its picture, then Ride, Delete, Back.
        el.track = node('section', 'bnr-screen', el.root);
        const tk = card(el.track, 'My Track', '');
        tk.classList.add('bnr-card-track');
        el.trackTitle = tk.querySelector('.bnr-title');
        el.trackInfo = tk.querySelector('.bnr-sub');
        el.trackPic = node('div', 'bnr-thumb bnr-track-pic', tk);
        el.trackList = node('div', 'bnr-list bnr-track-list', tk);
        el.trackRide = menuItem(el.trackList, 'Ride', 'ride', 'green');
        el.trackKeep = menuItem(el.trackList, 'Keep Building', 'build', 'green');
        el.trackEdit = menuItem(el.trackList, 'Edit', 'build', 'blue');
        el.trackDelete = menuItem(el.trackList, 'Delete', 'trash', 'red');
        el.trackBack = menuItem(el.trackList, 'Back', 'back', 'slate');

        // Are you sure? (Keep It first.)
        el.confirm = node('section', 'bnr-screen', el.root);
        const cf = card(el.confirm, 'Are you sure?', '');
        cf.classList.add('bnr-card-narrow');
        el.confirmTitle = cf.querySelector('.bnr-title');
        el.confirmText = cf.querySelector('.bnr-sub');
        el.confirmList = node('div', 'bnr-list', cf);
        el.confirmNo = menuItem(el.confirmList, 'Keep It', 'back', 'green');
        el.confirmYes = menuItem(el.confirmList, 'Delete', 'trash', 'red');

        // Pause.
        el.pause = node('section', 'bnr-screen', el.root);
        const pc = card(el.pause, 'Paused');
        pc.classList.add('bnr-card-pause');
        el.pauseList = node('div', 'bnr-list bnr-pause-list', pc);

        // Settings.
        el.settings = node('section', 'bnr-screen', el.root);
        el.settingsCard = card(el.settings, 'Settings');
        el.settingsCard.classList.add('bnr-card-settings');
        el.settingsList = node('div', 'bnr-settings-list', el.settingsCard);

        // How to play.
        el.help = node('section', 'bnr-screen', el.root);
        const hc = node('div', 'bnr-card bnr-card-narrow', el.help);
        el.helpTitle = button('bnr-help-title', hc);
        el.helpTitle.innerHTML = '<span class="bnr-icon-chip">' + ICON.speaker + '</span><span>How to Play</span>';
        el.helpBody = node('div', 'bnr-help-body', hc);
        el.helpBack = menuItem(hc, 'Back', 'back', 'slate');

        window.addEventListener('contextmenu', function (e) { if (screen === 'play' || screen === 'build') e.preventDefault(); });
        window.addEventListener('resize', fit);
        try {
            window.NarbeVoiceManager.onSettingsChange(refreshSettingsValues);
            window.NarbeScanManager.subscribe(refreshSettingsValues);
        } catch (e) { /* managers missing */ }
        try {
            const q = BNR.Stage.quality();
            if (q) q.subscribe(refreshSettingsValues);
        } catch (e) { /* no graphics manager yet */ }
    }

    function refreshSettingsValues() {
        if (screen !== 'settings') return;
        renderSettings();
        BNR.Input.refresh(false);
    }

    // --- screens ------------------------------------------------------------------------------

    const SCREENS = ['loading', 'error', 'menu', 'select', 'track', 'confirm', 'pause', 'settings', 'help'];

    /** Show a screen. o.restore: an item id to land on (coming back to a screen's own row). */
    function show(name, o) {
        o = o || {};
        const prev = screen;
        screen = name;
        SCREENS.forEach(k => el[k].classList.toggle('show', k === name));
        el.hud.classList.toggle('show', name === 'play' || name === 'build');
        el.hud.dataset.mode = name === 'build' ? 'build' : 'ride';
        el.root.dataset.screen = name;
        if (name === 'select') renderSelect();
        if (name === 'track') renderTrack();
        if (name === 'confirm') renderConfirm();
        if (name === 'pause') renderPause();
        if (name === 'settings') renderSettings();
        if (name === 'help') renderHelp();
        if (name === 'play') refreshPlay();
        if (name === 'build') refreshBuild();
        fit();
        BNR.Input.refresh(true, o.restore);
        const line = o.line !== undefined ? o.line : {
            menu: 'Build n Ride.',
            select: selectLine(),
            track: trackLine(),
            confirm: ask ? ask.title + ' ' + (ask.text || '') : '',
            pause: 'Paused.',
            settings: 'Settings.',
            help: 'How to play. Choose the title to hear the directions.',
            error: 'Build n Ride can’t start. ' + (el.errorText.textContent || '') + ' Choose Exit Game.'
        }[name];
        if (line) BNR.Input.announce(line);
        return prev;
    }

    function current() { return screen; }

    /** Scale each card to fit the window, so nothing is ever cut off or scrolled. */
    function fit() {
        const sec = el[screen];
        const c = sec && sec.querySelector && sec.querySelector('.bnr-card');
        if (!c) return;
        c.style.setProperty('--card-scale', '1');
        const w = c.offsetWidth, h = c.offsetHeight;
        if (!w || !h) return;
        const s = Math.min(1, (window.innerWidth - 20) / w, (window.innerHeight - 20) / h);
        c.style.setProperty('--card-scale', s.toFixed(3));
    }

    // --- main menu ----------------------------------------------------------------------------

    function menuScannables() {
        const at = k => el.menuList.querySelector('[data-menu="' + k + '"]');
        return [
            { id: 'menu:ride', el: at('ride'), speak: 'Ride', action: function () { openSelect('ride'); } },
            { id: 'menu:quick', el: at('quick'), speak: 'Quick Build', action: function () { openSelect('quick'); } },
            { id: 'menu:build', el: at('build'), speak: 'Build', action: function () { BNR.Game.startBuild(); } },
            { id: 'menu:tracks', el: at('tracks'), speak: 'My Tracks', action: function () { openSelect('tracks'); } },
            { id: 'menu:settings', el: at('settings'), speak: 'Settings', action: function () { settingsFrom = 'menu'; show('settings'); } },
            { id: 'menu:exit', el: at('exit'), speak: 'Exit Game', action: function () { BNR.Game.exit(); } }
        ];
    }

    // --- pick a ride ----------------------------------------------------------------------------

    function openSelect(mode) { selectMode = mode; page = 0; show('select'); }

    /** What the grid holds: routes (Ride, Quick Build) or saved tracks. */
    function entries() {
        if (selectMode === 'tracks') return BNR.Tracks.list().map(r => ({ id: r.id, name: r.name, rec: r }));
        return BNR.Routes.LIST.map(r => ({ id: r.id, name: r.name, route: r }));
    }
    function pages() { return Math.max(1, Math.ceil(entries().length / PER_PAGE)); }
    const WORD = { ride: 'Rides', quick: 'Designs', tracks: 'Tracks' };

    function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }
    /** "About 5 min · 5 stations" (what the tile says) and its spoken form. */
    function factsOf(e) {
        if (e.rec && e.rec.finished === false) {
            // Still being built: it can't be ridden until it is connected.
            const n = (e.rec.presses || '').length;
            return { short: 'Unfinished · ' + plural(n, 'piece'), say: 'Unfinished, ' + plural(n, 'piece') + '.' };
        }
        if (e.rec) return { short: 'About ' + (e.rec.minutes || 1) + ' min · ' + plural(e.rec.stations || 1, 'station'), say: 'About ' + plural(e.rec.minutes || 1, 'minute') + ', ' + plural(e.rec.stations || 1, 'station') + '.' };
        if (selectMode === 'quick') {
            // A design's pieces: one for each press of Build.
            const q = BNR.Build.quickFacts ? BNR.Build.quickFacts(e.id, true) : null;
            if (!q) return { short: '', say: '' };
            return { short: plural(q.presses, 'piece') + ' · ' + plural(q.stations, 'station'), say: plural(q.presses, 'piece') + ' to lay, ' + plural(q.stations, 'station') + '.' };
        }
        const f = BNR.Routes.facts ? BNR.Routes.facts(e.id, true) : null;
        if (!f) return { short: '', say: '' };
        return { short: 'About ' + f.minutes + ' min · ' + plural(f.stations, 'station'), say: 'About ' + plural(f.minutes, 'minute') + ', ' + plural(f.stations, 'station') + '.' };
    }
    function tileSpeech(e) {
        const f = factsOf(e);
        return e.name + '. ' + f.say + (e.route && selectMode === 'ride' ? ' ' + e.route.blurb : '');
    }
    function selectLine() {
        const pg = pages() > 1 ? ' Page ' + (page + 1) + ' of ' + pages() + '.' : '';
        if (selectMode === 'quick') return 'Quick Build. Pick a design.' + pg;
        if (selectMode === 'tracks') return entries().length ? 'My Tracks.' + pg : 'My Tracks. No tracks yet. Build a loop and it is saved here.';
        return 'Pick a ride.' + pg;
    }

    function renderSelect() {
        page = Math.max(0, Math.min(pages() - 1, page));
        el.selectTitle.textContent = { ride: 'Pick a Ride', quick: 'Quick Build: Pick a Design', tracks: 'My Tracks' }[selectMode];
        el.grid.innerHTML = '';
        const all = entries();
        const list = all.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE);
        el.selectEmpty.hidden = !(selectMode === 'tracks' && !all.length);
        el.grid.hidden = selectMode === 'tracks' && !all.length;
        for (let i = 0; i < PER_PAGE; i++) {
            const e = list[i];
            if (!e) { node('div', 'bnr-tile bnr-tile-empty', el.grid); continue; }
            const t = button('bnr-tile', el.grid);
            t.dataset.route = e.id;
            const pic = node('span', 'bnr-thumb', t);
            const src = e.rec ? e.rec.picture : thumbs[e.id];
            if (src) { const img = node('img', '', pic); img.src = src; img.alt = ''; }
            else { pic.classList.add('waiting'); pic.innerHTML = ICON.train; }
            const cap = node('span', 'bnr-tile-cap', t);
            node('span', 'bnr-tile-name', cap, e.name);
            node('span', 'bnr-tile-count', cap, factsOf(e).short);
        }
        el.pageLabel.textContent = pages() > 1 ? 'Page ' + (page + 1) + ' of ' + pages() : '';
        el.pageBtn.querySelector('.bnr-menu-label').textContent = page < pages() - 1 ? 'More ' + WORD[selectMode] : 'First ' + WORD[selectMode];
        el.pageBtn.hidden = pages() < 2;
        fit();
    }

    function selectScannables() {
        const list = entries().slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE).map(function (e) {
            return {
                id: 'select:' + e.id,
                el: el.grid.querySelector('[data-route="' + e.id + '"]'),
                speak: function () { return tileSpeech(e); },
                action: function () {
                    if (selectMode === 'quick') BNR.Game.startQuick(e.id);
                    else if (selectMode === 'tracks') { trackId = e.id; show('track'); }
                    else BNR.Game.startRide(e.id);
                }
            };
        });
        if (pages() > 1) {
            list.push({
                id: 'select:page', el: el.pageBtn,
                speak: function () { return (page < pages() - 1 ? 'More ' : 'First ') + WORD[selectMode].toLowerCase(); },
                action: function () { page = page < pages() - 1 ? page + 1 : 0; show('select'); }
            });
        }
        list.push({ id: 'select:back', el: el.selectBack, speak: 'Back', action: function () { BNR.Game.toMenu(); } });
        return list;
    }

    // --- one of My Tracks, and Are You Sure? ---------------------------------------------------

    function currentTrack() { return trackId ? BNR.Tracks.get(trackId) : null; }
    function trackLine() {
        const r = currentTrack();
        return r ? r.name + '. ' + factsOf({ rec: r }).say : '';
    }
    function renderTrack() {
        const r = currentTrack();
        if (!r) return;
        el.trackTitle.textContent = r.name;
        el.trackInfo.textContent = factsOf({ rec: r }).short;
        el.trackPic.innerHTML = '';
        el.trackPic.classList.toggle('waiting', !r.picture);
        if (r.picture) { const img = node('img', '', el.trackPic); img.src = r.picture; img.alt = ''; }
        else el.trackPic.innerHTML = ICON.train;
        // A finished loop: Ride or Edit. One still being built: Keep Building.
        const done = r.finished !== false;
        el.trackRide.hidden = !done; el.trackEdit.hidden = !done; el.trackKeep.hidden = done;
        fit();
    }
    function trackScannables() {
        const r = currentTrack();
        const done = !r || r.finished !== false;
        const first = done ? [
            { id: 'track:ride', el: el.trackRide, speak: 'Ride', action: function () { if (r) BNR.Game.rideTrack(r.id); } },
            {
                id: 'track:edit', el: el.trackEdit, speak: 'Edit',
                action: function () {
                    if (!r) return;
                    confirm({
                        title: 'Edit ' + r.name + '?', text: 'It opens where Connect took over, to take pieces back and build on. You can ride it again once it is connected.',
                        no: 'Keep It', yes: 'Edit', yesIcon: 'build',
                        onNo: function () { show('track'); },
                        onYes: function () { BNR.Game.editTrack(r.id); }
                    });
                }
            }
        ] : [
            { id: 'track:keep', el: el.trackKeep, speak: 'Keep Building', action: function () { if (r) BNR.Game.keepBuilding(r.id); } }
        ];
        return first.concat([
            {
                id: 'track:delete', el: el.trackDelete, speak: 'Delete',
                action: function () {
                    if (!r) return;
                    confirm({
                        title: 'Delete ' + r.name + '?', text: 'It will be gone for good.', no: 'Keep It', yes: 'Delete',
                        onNo: function () { show('track'); },
                        onYes: function () { BNR.Tracks.remove(r.id); trackId = null; selectMode = 'tracks'; show('select', { line: r.name + ' deleted. ' + selectLine() }); }
                    });
                }
            },
            { id: 'track:back', el: el.trackBack, speak: 'Back', action: function () { selectMode = 'tracks'; show('select', { restore: 'select:' + (r ? r.id : '') }); } }
        ]);
    }

    /** Ask first. o: { title, text, no, yes, onNo, onYes, yesIcon }. "No" is always first in the scan. */
    function confirm(o) { ask = o; show('confirm'); }
    function renderConfirm() {
        if (!ask) return;
        el.confirmTitle.textContent = ask.title;
        el.confirmText.textContent = ask.text || '';
        el.confirmNo.querySelector('.bnr-menu-label').textContent = ask.no || 'Keep It';
        el.confirmYes.querySelector('.bnr-menu-label').textContent = ask.yes || 'Delete';
        el.confirmYes.querySelector('.bnr-icon-chip').innerHTML = ICON[ask.yesIcon || 'trash'];
        fit();
    }
    function confirmScannables() {
        const a = ask || {};
        return [
            { id: 'confirm:no', el: el.confirmNo, speak: a.no || 'Keep It', action: function () { const f = a.onNo; ask = null; if (f) f(); } },
            { id: 'confirm:yes', el: el.confirmYes, speak: a.yes || 'Delete', action: function () { const f = a.onYes; ask = null; if (f) f(); } }
        ];
    }

    /** A route's picture is ready. */
    function setThumb(id, url) {
        if (!url) return;
        thumbs[id] = url;
        if (screen !== 'select') return;
        const t = el.grid.querySelector('[data-route="' + id + '"] .bnr-thumb');
        if (!t) return;
        t.classList.remove('waiting');
        t.innerHTML = '';
        const img = node('img', '', t);
        img.src = url;
        img.alt = '';
    }

    // --- play ---------------------------------------------------------------------------------

    function refreshPlay() {
        const r = BNR.Scene.route();
        el.infoName.textContent = r ? r.name : 'My Track';
        const rig = BNR.Stage.rig();
        el.infoView.textContent = rig ? rig.viewName() + ' view' : '';
        const ride = BNR.Scene.ride();
        const nx = ride && ride.next();
        el.infoNext.textContent = ride && ride.phase === 'dwell' && ride.station ? 'At ' + ride.station.name : nx ? 'Next: ' + nx.station.name : '';
        el.viewBtn.querySelector('.bnr-ride-value').textContent = rig ? rig.viewName() : '';
        el.lookBtn.querySelector('.bnr-ride-value').textContent = rig ? rig.lookName() : '';
        el.speedBtn.querySelector('.bnr-ride-value').textContent = ride ? ride.speedName() : '';
        el.hornBtn.querySelector('.bnr-ride-value').textContent = 'Toot!';
    }

    function playScannables() {
        return [
            { id: 'play:view', el: el.viewBtn, speak: 'View', quiet: true, action: function () { BNR.Game.nextView(); } },
            { id: 'play:look', el: el.lookBtn, speak: 'Look', quiet: true, action: function () { BNR.Game.look(); } },
            { id: 'play:horn', el: el.hornBtn, speak: 'Horn', quiet: true, action: function () { BNR.Game.horn(); } },
            { id: 'play:speed', el: el.speedBtn, speak: function () { return 'Speed, ' + BNR.Scene.ride().speedName(); }, quiet: true, action: function () { BNR.Game.speed(); } },
            { id: 'play:pause', el: el.pauseBtn, speak: 'Pause', action: function () { BNR.Game.pause(); } }
        ];
    }

    // --- build -------------------------------------------------------------------------------------

    function refreshBuild() {
        const b = BNR.Game.buildState();
        if (!b) return;
        el.infoName.textContent = b.mode === 'quick' ? b.name : 'Build';
        // Pieces: one a press. Build: so many of the player's limit (Connect is free).
        el.infoView.textContent = b.mode === 'quick' ? b.pieces + ' of ' + plural(b.total, 'piece') :
            b.pieces + ' of ' + plural(b.max, 'piece') + ' · ' + plural(b.stations, 'station');
        el.infoNext.textContent = b.closed ? 'Loop complete!' : b.busy ? 'Connecting…' : '';
        const pieces = b.mode === 'build' && !b.closed && !b.busy;
        [el.bStraight, el.bLong, el.bLeft, el.bRight, el.bUndo, el.bConnect].forEach(x => { x.hidden = !(b.mode === 'build' && !b.closed); x.classList.toggle('bnr-dim', !pieces); });
        el.bUndo.classList.toggle('bnr-dim', !pieces || !b.canUndo);
        // A piece that can't go down now (too high, no way on, too steep, out of track) is dimmed;
        // it stays in the scan, which says why, and choosing it says what to try instead.
        const bl = b.blocked || {};
        [['S', el.bStraight], ['LS', el.bLong], ['L', el.bLeft], ['R', el.bRight]].forEach(function (p) {
            if (pieces && bl[p[0]]) p[1].classList.add('bnr-dim');
        });
        el.bQuick.hidden = !(b.mode === 'quick' && !b.closed);
        el.bRide.hidden = !b.closed;
        el.bZoom.hidden = false;
        el.bZoom.classList.remove('bnr-dim');
        el.bZoomValue.textContent = BNR.Settings.zoomName();
    }

    function buildScannables() {
        const b = BNR.Game.buildState();
        const pause = { id: 'build:pause', el: el.pauseBtn, speak: 'Pause', action: function () { BNR.Game.pause(); } };
        // Zoom is there whatever else is (even while Connect lays the way home).
        const zoom = { id: 'build:zoom', el: el.bZoom, quiet: true, speak: function () { return 'Zoom, ' + BNR.Settings.zoomName(); }, action: function () { BNR.Game.zoom(); } };
        if (!b) return [pause];
        if (b.busy) return [zoom, pause];
        if (b.closed) return [{ id: 'build:ride', el: el.bRide, speak: 'Ride', action: function () { BNR.Game.rideBuilt(); } }, zoom, pause];
        if (b.mode === 'quick') {
            return [{ id: 'build:quick', el: el.bQuick, speak: 'Build', quiet: true, hold: true, action: function () { BNR.Game.quickNext(); } }, zoom, pause];
        }
        const WHY = { high: 'too high', stuck: 'no way on', steep: 'too steep', full: 'out of track' };
        const piece = (id, el2, words, kind) => ({
            id: 'build:' + id, el: el2, quiet: true,
            speak: function () { const st = BNR.Game.buildState(); const w = st && st.blocked ? st.blocked[kind] : null; return w ? words + ', ' + WHY[w] : words; },
            action: function () { BNR.Game.placePiece(kind); }
        });
        return [
            piece('S', el.bStraight, 'Straight', 'S'),
            piece('LS', el.bLong, 'Long Straight', 'LS'),
            piece('L', el.bLeft, 'Turn Left', 'L'),
            piece('R', el.bRight, 'Turn Right', 'R'),
            // Hold Enter on Undo and it keeps taking pieces back, quickly: rewind to where to change.
            { id: 'build:undo', el: el.bUndo, speak: 'Undo', quiet: true, hold: true, holdStart: 1500, holdEvery: 350, action: function () { BNR.Game.undoPiece(); } },
            { id: 'build:connect', el: el.bConnect, speak: 'Connect', quiet: true, action: function () { BNR.Game.connect(); } },
            zoom,
            pause
        ];
    }

    /** A ride button bounces when it is chosen. */
    function bounce(which) {
        const B = { horn: el.hornBtn, speed: el.speedBtn, look: el.lookBtn, view: el.viewBtn, S: el.bStraight, LS: el.bLong, L: el.bLeft, R: el.bRight, undo: el.bUndo, connect: el.bConnect, zoom: el.bZoom, quick: el.bQuick, ride: el.bRide };
        const b = B[which] || el.viewBtn;
        b.classList.remove('bnr-bounce');
        void b.offsetWidth;
        b.classList.add('bnr-bounce');
    }

    let calloutTimer = null;
    /** A big, friendly word at the top of the screen (also spoken by the caller). */
    function callout(text, tone) {
        el.callout.textContent = text;
        el.callout.dataset.tone = tone || '';
        el.callout.classList.remove('show');
        void el.callout.offsetWidth;
        el.callout.classList.add('show');
        clearTimeout(calloutTimer);
        calloutTimer = setTimeout(function () { el.callout.classList.remove('show'); }, 2600);
    }

    // --- pause ---------------------------------------------------------------------------------

    let pauseItems = [];
    function renderPause() {
        const building = BNR.Game.mode() === 'build';
        const list = [
            { id: 'resume', label: 'Resume', icon: 'play', tone: 'green', action: function () { BNR.Game.resume(); } },
            { id: 'settings', label: 'Settings', icon: 'settings', tone: 'plum', action: function () { settingsFrom = 'pause'; show('settings'); } },
            {
                id: 'need-help', label: 'I Need Help', icon: 'hand', tone: 'help', quiet: true,
                speak: 'I need help. Choose this to call a helper.',
                action: function () {
                    const message = 'I need help, please! I need help, please!';
                    const fallback = function () { return BNR.Voice.speak(message); };
                    if (window.NarbeCommunicationSpeech) window.NarbeCommunicationSpeech.help(fallback, message);
                    else fallback();
                }
            },
            { id: 'help', label: 'How to Play', icon: 'help', tone: 'teal', action: function () { helpFrom = 'pause'; show('help'); } }
        ];
        if (building) {
            list.push({
                id: 'new', label: 'New Track', icon: 'build', tone: 'help',
                action: function () {
                    confirm({
                        title: 'Start a new track?', text: 'This one is not finished, so it will not be saved.', no: 'Keep Building', yes: 'New Track', yesIcon: 'build',
                        onNo: function () { show('pause'); }, onYes: function () { BNR.Game.newTrack(); }
                    });
                }
            });
        }
        list.push(
            { id: 'menu', label: 'Main Menu', icon: 'home', tone: 'blue', action: function () { BNR.Game.toMenu(); } },
            { id: 'exit', label: 'Exit Game', icon: 'exit', tone: 'slate', action: function () { BNR.Game.exit(); } }
        );
        el.pauseList.innerHTML = '';
        pauseItems = list.map(function (it) {
            const b = menuItem(el.pauseList, it.label, it.icon, it.tone);
            return { id: 'pause:' + it.id, el: b, speak: it.speak || it.label, quiet: it.quiet, action: it.action };
        });
    }

    // --- how to play -----------------------------------------------------------------------------

    function autoOn() { try { return !!window.NarbeScanManager.getSettings().autoScan; } catch (e) { return false; } }

    /** Printed AND read aloud from these same lines, so the two never drift. */
    function helpLines() {
        const mode = BNR.Game.mode();
        let lines;
        if (mode === 'build') {
            lines = [
                'Lay the track one piece at a time: *Straight*, *Long Straight* (three times as long), *Turn Left* and *Turn Right*. When a button is lit, a see-through piece shows where it will go.',
                'Go anywhere you like. Bridges, tunnels and crossings happen by themselves, and the track can cross over itself.',
                'Stations appear by themselves when the track reaches new country.',
                'Your track is saved in *My Tracks* as you build: leave it and come back to it any time. Edit a finished loop there to change it.',
                'You have ' + BNR.Build.MAX_PIECES + ' pieces: each press uses one. *Undo* takes back the last piece (hold Enter on it to keep going back). *Connect* finishes the loop for you, back to the start station, and is free.',
                '*Zoom* stands the camera Close, Far or Very Far, to see more of the land.',
                'When the loop is finished it is saved in *My Tracks*. Then choose *Ride*!',
                '*Pause* is always in the scan, at the top right.'
            ];
        } else if (mode === 'quick') {
            lines = [
                'Each press of *Build* lays the next piece of the design. Hold *Enter* on Build and it keeps building by itself.',
                '*Zoom* stands the camera Close, Far or Very Far, to see more of the land.',
                'When the loop is finished, choose *Ride* to ride it.',
                '*Pause* is always in the scan, at the top right.'
            ];
        } else {
            lines = [
                'Choose *Ride*, then pick a ride. The train sets off round the line by itself and keeps going.',
                '*Horn* toots the whistle. *Speed* goes *Slow*, *Medium* or *Fast*.',
                '*View* changes the camera: *Bird’s Eye* from high above, *Third Person* just behind the train, and *Conductor* from the cab window.',
                '*Look* turns to look around. After a few seconds it turns back by itself.',
                'The train stops at every station. Watch for things to see along the way.',
                '*Pause* is always in the scan, at the top right.'
            ];
        }
        lines.push(autoOn() ? 'The highlight moves by itself. *Enter* chooses.'
            : '*Tap Space* to move the highlight and *hold Space* to go back. *Enter* chooses.');
        lines.push('There is no score, no timer and no way to lose.');
        return lines;
    }

    function renderHelp() {
        el.helpBody.innerHTML = helpLines().map(l => '<p>' + l.replace(/\*([^*]+)\*/g, '<b>$1</b>') + '</p>').join('');
    }

    /** Read the directions, holding the scanner still; any press stops it. */
    function readAloud() {
        const text = helpLines().map(l => l.replace(/\*/g, '')).join(' ');
        const ticket = BNR.Voice.speak(text);
        if (!ticket) return;
        let released = false;
        const release = function () {
            if (released) return;
            released = true;
            clearTimeout(timer);
            document.removeEventListener('keydown', onPress, true);
            document.removeEventListener('pointerdown', onPress, true);
            BNR.Input.setEnabled(true);
        };
        const onPress = function () { BNR.Voice.cancel(); release(); };
        BNR.Input.setEnabled(false);
        const timer = setTimeout(release, Math.ceil(text.length / 13 * 1000) + 800);
        Promise.resolve(ticket.finished).then(function (r) { if (r && r.reason !== 'timeout') release(); });
        document.addEventListener('keydown', onPress, true);
        document.addEventListener('pointerdown', onPress, true);
    }

    function helpScannables() {
        return [
            { id: 'help:read', el: el.helpTitle, speak: 'How to Play', action: readAloud },
            { id: 'help:back', el: el.helpBack, speak: 'Back', action: function () { BNR.Voice.cancel(); show(helpFrom); } }
        ];
    }

    // --- settings ----------------------------------------------------------------------------------

    function vm() { return window.NarbeVoiceManager; }
    function sm() { return window.NarbeScanManager; }
    function ttsOn() { try { return !!vm().getSettings().ttsEnabled; } catch (e) { return false; } }
    function voiceName() { try { return vm().getVoiceDisplayName(vm().getCurrentVoice()); } catch (e) { return 'Default'; } }
    function speedLabel() { try { return (sm().getScanInterval() / 1000) + ' s'; } catch (e) { return '2 s'; } }
    function graphicsLabel() {
        try { const q = BNR.Stage.quality(); return q ? q.label().replace(/^Graphics quality:\s*/, '') : 'High'; } catch (e) { return 'High'; }
    }

    let settingsCache = [];

    /**
     * Hub canonical order: Text to Speech, Voice, the game's own options,
     * Auto Scan, Scan Speed, Sound Effects, Back. `after` is what is said once
     * an option is chosen: the explanation lives there.
     */
    function settingsItems() {
        const s = S();
        return [
            { id: 'tts', label: 'Speaking', value: () => onOff(ttsOn()), action: () => { try { vm().toggleTTS(); } catch (e) { /* none */ } },
                after: () => ttsOn() ? 'Speaking on. Everything is read aloud.' : '' },
            { id: 'voice', label: 'Voice', value: voiceName, action: () => { try { vm().cycleVoice(); } catch (e) { /* none */ } },
                after: () => 'Voice, ' + voiceName() + '. This is the voice you will hear.' },
            { id: 'time', label: 'Time of Day', value: () => s.timeName(),
                action: () => { s.cycle('timeIndex', s.TIMES.length); BNR.Weather.setModes(s.weatherModes()); },
                after: () => 'Time of day, ' + s.timeName() + '. ' + ({
                    auto: 'Morning, day, sunset and night roll by as you ride.', morning: 'Soft early light.', day: 'Bright sunshine.',
                    sunset: 'A warm orange sky.', night: 'Stars, a moon, and lights in the windows.'
                })[s.weatherModes().time] },
            { id: 'season', label: 'Season', value: () => s.seasonName(),
                action: () => { s.cycle('seasonIndex', s.SEASONS.length); BNR.Weather.setModes(s.weatherModes()); },
                after: () => 'Season, ' + s.seasonName() + '. ' + ({
                    auto: 'Spring, summer, fall and winter take turns, changing slowly with snow, rain and falling leaves.', spring: 'Fresh green leaves and flowers.', summer: 'Deep green and sunny.',
                    fall: 'Orange, red and yellow leaves.', winter: 'Snow on the ground and frozen lakes.'
                })[s.weatherModes().season] },
            { id: 'weather', label: 'Weather', value: () => s.weatherName(),
                action: () => { s.cycle('weatherIndex', s.WEATHERS.length); BNR.Weather.setModes(s.weatherModes()); },
                after: () => 'Weather, ' + s.weatherName() + '. ' + ({
                    auto: 'Sometimes sunny, sometimes rain or fog, and snow in winter.', clear: 'Blue skies.', rain: 'Gentle rain, and a rainbow when it stops.',
                    snow: 'Snow falls in winter and on snowy land. Other times the sky stays cloudy.', fog: 'Soft, misty fog.'
                })[s.weatherModes().weather] },
            { id: 'comfort', label: 'Comfort Mode', value: () => onOff(s.get('comfort')), action: () => s.toggle('comfort'),
                after: () => s.get('comfort') ? 'Comfort mode on. No camera bob, and gentler turns in the Conductor view.' : 'Comfort mode off.' },
            { id: 'graphics', label: 'Graphics', value: graphicsLabel,
                action: () => { try { const q = BNR.Stage.quality(); if (q) q.cycle(); } catch (e) { /* none */ } },
                after: () => 'Graphics, ' + graphicsLabel() + '.' },
            { id: 'hlstyle', label: 'Highlight Style', value: () => s.get('highlightStyle') === 'full' ? 'Block' : 'Bold Band',
                action: () => s.set('highlightStyle', s.get('highlightStyle') === 'full' ? 'outline' : 'full'),
                after: () => s.get('highlightStyle') === 'full' ? 'Highlight style, block. The whole button fills with colour.' : 'Highlight style, bold band. A thick band goes around the button.' },
            { id: 'hlcolor', label: 'Highlight Color', value: () => s.highlightColorName(), swatch: () => s.highlightColor(),
                action: () => s.cycle('highlightColorIndex', s.HIGHLIGHT_COLORS.length), after: () => 'Highlight color, ' + s.highlightColorName() + '.' },
            { id: 'auto', label: 'Auto Scan', value: () => autoOn() ? 'On — One Switch' : 'Off — Two Switches',
                action: () => { try { sm().toggleAutoScan(); } catch (e) { /* none */ } },
                after: () => autoOn() ? 'Auto scan on. One switch. The highlight moves by itself and Enter chooses.' : 'Auto scan off. Two switches. Space moves the highlight and Enter chooses.' },
            { id: 'speed', label: 'Scan Speed', value: speedLabel, action: () => { try { sm().cycleScanSpeed(); } catch (e) { /* none */ } },
                after: () => 'Scan speed, ' + speedLabel() + '.' },
            { id: 'sound', label: 'Sound Effects', value: () => onOff(s.get('sound')), action: () => { s.toggle('sound'); BNR.Sound.sample(); },
                after: () => s.get('sound') ? 'Sound effects on.' : 'Sound effects off.' },
            { id: 'volume', label: 'Volume', value: () => s.volumeName(), action: () => { s.cycle('volumeIndex', s.VOLUMES.length); BNR.Sound.sample(); },
                after: () => 'Volume, ' + s.volumeName() + '. For the horn, the stations and the menus.' },
            { id: 'train', label: 'Train Sounds', value: () => s.trainVolumeName(), action: () => { s.cycle('trainVolumeIndex', s.LEVELS.length); BNR.Sound.sampleTrain(); },
                after: () => s.trainVolume() > 0 ? 'Train sounds, ' + s.trainVolumeName() + '. The chuffing and the clickety clack.' : 'Train sounds off.' },
            { id: 'ambient', label: 'Ambient', value: () => s.ambientVolumeName(), action: () => s.cycle('ambientVolumeIndex', s.LEVELS.length),
                after: () => s.ambientVolume() > 0 ? 'Ambient, ' + s.ambientVolumeName() + '. Soft background music for each place.' : 'Ambient off.' },
            { id: 'back', label: '← Back', value: () => '', nav: true,
                action: () => { show(settingsFrom === 'pause' ? 'pause' : 'menu'); } }
        ];
    }

    function renderSettings() {
        settingsCache = settingsItems();
        el.settingsList.style.setProperty('--rows', String(Math.ceil(settingsCache.length / 2)));
        el.settingsList.innerHTML = '';
        settingsCache.forEach(function (item) {
            const b = button('bnr-row' + (item.nav ? ' bnr-row-nav' : ''), el.settingsList);
            b.dataset.setting = item.id;
            node('span', 'bnr-row-label', b, item.label);
            const v = node('span', 'bnr-row-value', b);
            const sw = item.swatch && item.swatch();
            if (sw) { const dot = node('span', 'bnr-swatch', v); dot.style.background = sw; }
            node('span', '', v, item.value());
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
                    renderSettings();
                    BNR.Input.refresh(false);
                    const fresh = settingsCache.find(x => x.id === item.id);
                    const line = fresh && fresh.after && fresh.after();
                    if (line) BNR.Input.announce(line);
                }
            };
        });
    }

    function errorScannables() {
        return [{ id: 'error:exit', el: el.errorExit, speak: 'Exit Game', action: function () { BNR.Game.exit(); } }];
    }

    function scannables() {
        switch (screen) {
            case 'menu': return menuScannables();
            case 'select': return selectScannables();
            case 'play': return playScannables();
            case 'build': return buildScannables();
            case 'track': return trackScannables();
            case 'confirm': return confirmScannables();
            case 'pause': return pauseItems;
            case 'settings': return settingsScannables();
            case 'help': return helpScannables();
            case 'error': return errorScannables();
            default: return [];
        }
    }

    let scanHost = null;
    /** Where the shared "Parked" badge lives, outside the choices. */
    function scanContext() {
        if (!scanHost) scanHost = node('div', 'bnr-scan-status');
        const parent = screen === 'play' || screen === 'build' ? el.hud : el[screen] && el[screen].querySelector('.bnr-card');
        if (parent && scanHost.parentElement !== parent) parent.prepend(scanHost);
        return { key: screen === 'select' ? 'select:' + selectMode + ':' + page : screen, host: scanHost || el.root };
    }

    function showError(message) {
        el.errorText.textContent = message;
        show('error');
    }

    return {
        build: build,
        show: show,
        current: current,
        scannables: scannables,
        scanContext: scanContext,
        refreshPlay: refreshPlay,
        refreshBuild: refreshBuild,
        confirm: confirm,
        openSelect: openSelect,
        callout: callout,
        bounce: bounce,
        setThumb: setThumb,
        showError: showError,
        setLoading: function (text) { if (el.loadingText) el.loadingText.textContent = text; },
        stageEl: function () { return el.stage; }
    };
})();
