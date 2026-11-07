/**
 * NARBE Build n Bash - the DOM interface on top of the 3D stage.
 *
 * Screens: loading, menu, select, play, pause, settings, help, done, error.
 * Menus are frosted cards over the live scene, scaled to fit so nothing ever
 * scrolls. The scan list for whatever is showing comes from scannables().
 *
 * Main menu (designer's spec): Build, Settings, Exit.
 * Build Select: a 3x3 grid of picture tiles over two pages, smallest build
 *   first; each tile shows its size as a stack of one to four blocks.
 * Play: Build (bottom left), Destroy (bottom right), Pause (top right), scanned
 *   in that order. Build disappears once the build is finished (or once
 *   knocking down has begun); Destroy waits for the first block.
 * Done: after everything is knocked down - Build Again or Pick Another.
 */

window.BNB = window.BNB || {};

BNB.UI = (function () {
    'use strict';

    let screen = 'loading';
    let settingsFrom = 'menu', helpFrom = 'pause';
    let page = 0;
    const PER_PAGE = 9;
    const el = {};
    const thumbs = {};

    function S() { return BNB.Settings; }

    // --- helpers -----------------------------------------------------------------------

    function node(tag, cls, parent, text) {
        const n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text !== undefined) n.textContent = text;
        if (parent) parent.appendChild(n);
        return n;
    }

    function button(cls, parent, label) {
        const b = node('button', 'bnb-btn ' + (cls || ''), parent);
        b.type = 'button';
        if (label !== undefined) b.textContent = label;
        return b;
    }

    function onOff(v) { return v ? 'On' : 'Off'; }

    const ICON = (function () {
        const svg = body => '<svg class="bnb-icon" viewBox="0 0 48 48" aria-hidden="true" focusable="false">' + body + '</svg>';
        let teeth = '';
        for (let i = 0; i < 8; i++) {
            const a = Math.PI / 4 * i;
            teeth += '<line x1="' + (24 + Math.cos(a) * 13.5).toFixed(1) + '" y1="' + (24 + Math.sin(a) * 13.5).toFixed(1) +
                '" x2="' + (24 + Math.cos(a) * 18.5).toFixed(1) + '" y2="' + (24 + Math.sin(a) * 18.5).toFixed(1) + '" stroke-width="5.5"/>';
        }
        return {
            blocks: '<svg class="bnb-icon" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><rect x="7" y="27" width="15" height="14" rx="2.5" class="bnb-f1"/><rect x="25" y="27" width="15" height="14" rx="2.5" class="bnb-f2"/><rect x="16" y="11" width="15" height="14" rx="2.5" class="bnb-f3"/></svg>',
            build: '<svg class="bnb-icon" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><rect x="9" y="29" width="30" height="13" rx="3" class="bnb-f2"/><rect x="15" y="6" width="18" height="15" rx="3" class="bnb-f1"/><path d="M24 22v4" stroke-width="4"/><path d="M18 24l6 5 6-5" stroke-width="4" fill="none"/></svg>',
            destroy: '<svg class="bnb-icon" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><path class="bnb-f1" d="M24 3l4.6 11.2 11.6-5-4.2 11.8 11 4.6-11.4 4.3 4.8 11.8-11.6-4.6L24 45l-4.8-11.9-11.6 4.6 4.8-11.8L1 21.6l11-4.6L7.8 5.2l11.6 5z"/><rect x="18" y="18" width="12" height="12" rx="2" transform="rotate(18 24 24)" class="bnb-f3"/></svg>',
            settings: svg('<circle cx="24" cy="24" r="14"/><circle cx="24" cy="24" r="5.5"/>' + teeth),
            exit: svg('<path d="M28 10H12v28h16"/><path d="M24 24h14"/><path d="M32 18l6 6-6 6"/>'),
            play: svg('<circle cx="24" cy="24" r="17"/><path d="M20 17l12 7-12 7z"/>'),
            home: svg('<path d="M8 23 24 10l16 13"/><path d="M12 23v17h24V23"/><path d="M20 40V30h8v10"/>'),
            back: svg('<path d="M30 12 18 24l12 12"/>'),
            next: svg('<path d="M18 12l12 12-12 12"/>'),
            again: svg('<path d="M37 24a13 13 0 1 1-4-9.4"/><path d="M34 6v9h-9"/>'),
            grid: '<svg class="bnb-icon" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><rect x="7" y="7" width="14" height="14" rx="3" class="bnb-fill"/><rect x="27" y="7" width="14" height="14" rx="3" class="bnb-fill"/><rect x="7" y="27" width="14" height="14" rx="3" class="bnb-fill"/><rect x="27" y="27" width="14" height="14" rx="3" class="bnb-fill"/></svg>',
            help: svg('<circle cx="24" cy="24" r="17"/><path d="M19 19a5 5 0 1 1 5 7v2"/><circle cx="24" cy="34" r="1.8" class="bnb-dot"/>'),
            hand: svg('<path d="M17 25V12a3 3 0 0 1 6 0v10M23 21V9a3 3 0 0 1 6 0v12M29 21v-8a3 3 0 0 1 6 0v14c0 8-5 13-12 13-5 0-8-3-11-8l-4-7a3 3 0 0 1 5-3l3 4"/>'),
            speaker: svg('<path d="M9 19h7l9-7v24l-9-7H9z"/><path d="M32 18a9 9 0 0 1 0 12"/><path d="M37 13a16 16 0 0 1 0 22"/>'),
            pause: '<svg class="bnb-icon" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><rect x="13" y="10" width="8" height="28" rx="3" class="bnb-fill"/><rect x="27" y="10" width="8" height="28" rx="3" class="bnb-fill"/></svg>',
            check: svg('<path d="M12 25l8 8 16-18"/>')
        };
    })();

    /** The size badge: a stack of one to four blocks (Small, Medium, Large, Huge). */
    function sizeStack(tier) {
        const cols = ['#e2453c', '#f6c833', '#2f6fd0', '#3fa84f'];
        let out = '<svg class="bnb-stack" viewBox="0 0 30 46" aria-hidden="true" focusable="false">';
        for (let i = 0; i < tier; i++) {
            const y = 36 - i * 10.5, x = i % 2 ? 6.5 : 5;
            out += '<rect x="' + x + '" y="' + y + '" width="19" height="9.5" rx="2" fill="' + cols[i] + '" stroke="#1d1a14" stroke-width="1.6"/>';
        }
        return out + '</svg>';
    }

    function menuItem(parent, label, icon, tone) {
        const b = button('bnb-menu-item', parent);
        if (tone) b.dataset.tone = tone;
        node('span', 'bnb-icon-chip', b).innerHTML = ICON[icon] || '';
        node('span', 'bnb-menu-label', b, label);
        return b;
    }

    function card(screenEl, title, sub) {
        const c = node('div', 'bnb-card', screenEl);
        if (title) node('h2', 'bnb-title', c, title);
        if (sub !== undefined) node('p', 'bnb-sub', c, sub);
        return c;
    }

    // --- build ---------------------------------------------------------------------------

    function build() {
        el.root = document.getElementById('bnb');
        el.stage = node('div', 'bnb-stage', el.root);

        // Play: HUD.
        el.hud = node('div', 'bnb-hud', el.root);
        el.info = node('div', 'bnb-info', el.hud);
        el.infoName = node('div', 'bnb-info-name', el.info);
        el.infoStack = node('span', 'bnb-info-stack', el.info);
        el.bar = node('div', 'bnb-bar', el.info);
        el.barFill = node('div', 'bnb-bar-fill', el.bar);
        el.infoCount = node('div', 'bnb-info-count', el.info);
        el.pauseBtn = button('bnb-pause-btn', el.hud);
        el.pauseBtn.setAttribute('aria-label', 'Pause');
        node('span', 'bnb-pause-icon', el.pauseBtn).innerHTML = ICON.pause;
        node('span', 'bnb-pause-label', el.pauseBtn, 'Pause');
        el.buildBtn = button('bnb-action bnb-build-btn', el.hud);
        node('span', 'bnb-action-icon', el.buildBtn).innerHTML = ICON.build;
        node('span', 'bnb-action-label', el.buildBtn, 'Build');
        // Hold to Build: fills while Enter is held, then once per block while it builds by itself.
        const meter = node('span', 'bnb-hold-meter', el.buildBtn);
        meter.setAttribute('aria-hidden', 'true');
        node('i', '', meter);
        el.destroyBtn = button('bnb-action bnb-destroy-btn', el.hud);
        node('span', 'bnb-action-icon', el.destroyBtn).innerHTML = ICON.destroy;
        node('span', 'bnb-action-label', el.destroyBtn, 'Destroy');
        el.destroyPips = node('span', 'bnb-pips', el.destroyBtn);
        el.callout = node('div', 'bnb-callout', el.hud);
        el.callout.setAttribute('aria-live', 'polite');

        // Loading and error.
        el.loading = node('section', 'bnb-screen bnb-screen-loading', el.root);
        const lc = node('div', 'bnb-loading', el.loading);
        node('div', 'bnb-loading-blocks', lc).innerHTML = '<span></span><span></span><span></span>';
        node('p', 'bnb-loading-text', lc, 'Getting the blocks ready…');
        el.error = node('section', 'bnb-screen', el.root);
        const ec = card(el.error, 'Build n Bash can’t start', '');
        ec.classList.add('bnb-card-narrow');
        el.errorText = ec.querySelector('.bnb-sub');
        el.errorExit = menuItem(ec, 'Exit Game', 'exit', 'slate');

        // Main menu.
        el.menu = node('section', 'bnb-screen bnb-screen-menu', el.root);
        const mc = node('div', 'bnb-card bnb-card-menu', el.menu);
        const head = node('div', 'bnb-brand', mc);
        node('span', 'bnb-logo', head).innerHTML = ICON.blocks;
        const words = node('div', 'bnb-brand-words', head);
        node('span', 'bnb-brand-narbe', words, 'NARBE');
        node('h1', 'bnb-brand-title', words, 'Build n Bash');
        node('p', 'bnb-sub bnb-tagline', mc, 'Build it up. Knock it down.');
        el.menuList = node('div', 'bnb-list bnb-menu-list', mc);
        menuItem(el.menuList, 'Build', 'blocks', 'green').dataset.menu = 'build';
        menuItem(el.menuList, 'Settings', 'settings', 'plum').dataset.menu = 'settings';
        menuItem(el.menuList, 'Exit Game', 'exit', 'slate').dataset.menu = 'exit';

        // Build select.
        el.select = node('section', 'bnb-screen', el.root);
        const sc = node('div', 'bnb-card bnb-card-select', el.select);
        const sh = node('div', 'bnb-select-head', sc);
        node('h2', 'bnb-title', sh, 'Pick a Build');
        el.pageLabel = node('span', 'bnb-page-label', sh);
        el.grid = node('div', 'bnb-grid', sc);
        el.selectFoot = node('div', 'bnb-select-foot', sc);
        el.pageBtn = menuItem(el.selectFoot, 'More Builds', 'next', 'blue');
        el.selectBack = menuItem(el.selectFoot, 'Back', 'back', 'slate');

        // Pause.
        el.pause = node('section', 'bnb-screen', el.root);
        const pc = card(el.pause, 'Paused');
        pc.classList.add('bnb-card-pause');
        el.pauseList = node('div', 'bnb-list bnb-pause-list', pc);

        // Settings.
        el.settings = node('section', 'bnb-screen', el.root);
        el.settingsCard = card(el.settings, 'Settings');
        el.settingsCard.classList.add('bnb-card-settings');
        el.settingsList = node('div', 'bnb-settings-list', el.settingsCard);

        // How to play.
        el.help = node('section', 'bnb-screen', el.root);
        const hc = node('div', 'bnb-card bnb-card-narrow', el.help);
        el.helpTitle = button('bnb-help-title', hc);
        el.helpTitle.innerHTML = '<span class="bnb-icon-chip">' + ICON.speaker + '</span><span>How to Play</span>';
        el.helpBody = node('div', 'bnb-help-body', hc);
        el.helpBack = menuItem(hc, 'Back', 'back', 'slate');

        // All knocked down.
        el.done = node('section', 'bnb-screen bnb-screen-done', el.root);
        const dc = card(el.done, 'All knocked down!', 'Build it again, or pick another?');
        dc.classList.add('bnb-card-done');
        el.doneTitle = dc.querySelector('.bnb-title');
        el.doneList = node('div', 'bnb-done-list', dc);
        el.againBtn = menuItem(el.doneList, 'Build Again', 'again', 'green');
        el.anotherBtn = menuItem(el.doneList, 'Pick Another', 'grid', 'blue');

        // Pointer: clicking Pause pauses; tapping the scene does nothing (no accidental builds).
        window.addEventListener('contextmenu', function (e) { if (screen === 'play') e.preventDefault(); });
        window.addEventListener('resize', fit);
        try {
            window.NarbeVoiceManager.onSettingsChange(refreshSettingsValues);
            window.NarbeScanManager.subscribe(refreshSettingsValues);
        } catch (e) { /* managers missing */ }
        try {
            const q = BNB.Stage.quality();
            if (q) q.subscribe(refreshSettingsValues);
        } catch (e) { /* no graphics manager yet */ }
    }

    function refreshSettingsValues() {
        if (screen !== 'settings') return;
        renderSettings();
        BNB.Input.refresh(false);
    }

    // --- screens ------------------------------------------------------------------------------

    const SCREENS = ['loading', 'error', 'menu', 'select', 'pause', 'settings', 'help', 'done'];

    /** Show a screen. o.restore: an item id to land on (coming back to a screen's own row). */
    function show(name, o) {
        o = o || {};
        const prev = screen;
        screen = name;
        SCREENS.forEach(k => el[k].classList.toggle('show', k === name));
        el.hud.classList.toggle('show', name === 'play' || name === 'done');
        el.root.dataset.screen = name;
        if (name === 'select') renderSelect();
        if (name === 'pause') renderPause();
        if (name === 'settings') renderSettings();
        if (name === 'help') renderHelp();
        if (name === 'play' || name === 'done') refreshPlay();
        fit();
        BNB.Input.refresh(true, o.restore);
        if (name !== 'play') BNB.Sim.setGhost(false);
        const line = o.line !== undefined ? o.line : {
            menu: 'Build n Bash.',
            select: 'Pick a build. Page ' + (page + 1) + ' of ' + pages() + '.',
            pause: 'Paused.',
            settings: 'Settings.',
            help: 'How to play. Choose the title to hear the directions.',
            done: 'All knocked down! Build it again, or pick another?',
            error: 'Build n Bash can’t start. ' + (el.errorText.textContent || '') + ' Choose Exit Game.'
        }[name];
        if (line) BNB.Input.announce(line);
        return prev;
    }

    function current() { return screen; }

    /** Scale each card to fit the window, so nothing is ever cut off or scrolled. */
    function fit() {
        const sec = el[screen];
        const c = sec && sec.querySelector && sec.querySelector('.bnb-card');
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
            { id: 'menu:build', el: at('build'), speak: 'Build', action: function () { page = 0; show('select'); } },
            { id: 'menu:settings', el: at('settings'), speak: 'Settings', action: function () { settingsFrom = 'menu'; show('settings'); } },
            { id: 'menu:exit', el: at('exit'), speak: 'Exit Game', action: function () { BNB.Game.exit(); } }
        ];
    }

    // --- build select -------------------------------------------------------------------------

    function pages() { return Math.ceil(BNB.Builds.LIST.length / PER_PAGE); }

    function tileSpeech(b) {
        const times = S().timesBuilt(b.id);
        return b.name + '. ' + BNB.Builds.tierName(b) + ', ' + b.blocks.length + ' blocks.' + (times ? ' You built this before.' : '');
    }

    function renderSelect() {
        page = Math.max(0, Math.min(pages() - 1, page));
        el.grid.innerHTML = '';
        const list = BNB.Builds.LIST.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE);
        for (let i = 0; i < PER_PAGE; i++) {
            const b = list[i];
            if (!b) { node('div', 'bnb-tile bnb-tile-empty', el.grid); continue; }
            const t = button('bnb-tile', el.grid);
            t.dataset.build = b.id;
            const pic = node('span', 'bnb-thumb', t);
            if (thumbs[b.id]) { const img = node('img', '', pic); img.src = thumbs[b.id]; img.alt = ''; }
            else { pic.classList.add('waiting'); pic.innerHTML = ICON.blocks; }
            const size = node('span', 'bnb-size', t);
            size.innerHTML = sizeStack(b.tier);
            size.title = BNB.Builds.tierName(b);
            if (S().timesBuilt(b.id)) node('span', 'bnb-built', t).innerHTML = ICON.check;
            const cap = node('span', 'bnb-tile-cap', t);
            node('span', 'bnb-tile-name', cap, b.name);
            node('span', 'bnb-tile-count', cap, BNB.Builds.tierName(b) + ' · ' + b.blocks.length + ' blocks');
        }
        el.pageLabel.textContent = 'Page ' + (page + 1) + ' of ' + pages();
        el.pageBtn.querySelector('.bnb-menu-label').textContent = page < pages() - 1 ? 'More Builds' : 'First Builds';
        el.pageBtn.querySelector('.bnb-icon-chip').innerHTML = page < pages() - 1 ? ICON.next : ICON.back;
        el.pageBtn.hidden = pages() < 2;
        fit();
    }

    function selectScannables() {
        const list = BNB.Builds.LIST.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE).map(function (b) {
            return {
                id: 'select:' + b.id,
                el: el.grid.querySelector('[data-build="' + b.id + '"]'),
                speak: function () { return tileSpeech(b); },
                action: function () { BNB.Game.startBuild(b.id); }
            };
        });
        if (pages() > 1) {
            list.push({
                id: 'select:page', el: el.pageBtn,
                speak: function () { return page < pages() - 1 ? 'More builds' : 'First builds'; },
                action: function () {
                    page = page < pages() - 1 ? page + 1 : 0;
                    show('select');
                }
            });
        }
        list.push({ id: 'select:back', el: el.selectBack, speak: 'Back', action: function () { BNB.Game.toMenu(); } });
        return list;
    }

    /** A Build Select picture is ready. */
    function setThumb(id, url) {
        thumbs[id] = url;
        if (screen !== 'select') return;
        const t = el.grid.querySelector('[data-build="' + id + '"] .bnb-thumb');
        if (!t) return;
        t.classList.remove('waiting');
        t.innerHTML = '';
        const img = node('img', '', t);
        img.src = url;
        img.alt = '';
    }

    // --- play ---------------------------------------------------------------------------------

    function refreshPlay() {
        const b = BNB.Sim.build();
        if (!b) return;
        const placed = BNB.Sim.placed(), total = BNB.Sim.total(), st = BNB.Sim.state();
        el.infoName.textContent = b.name;
        el.infoStack.innerHTML = sizeStack(b.tier);
        el.infoCount.textContent = st === 'bashing' || st === 'settling' || st === 'down' || st === 'clearing'
            ? 'Knocking down!' : placed + ' of ' + total;
        el.barFill.style.width = (total ? placed / total * 100 : 0).toFixed(1) + '%';
        el.info.classList.toggle('finished', placed === total && st === 'complete');
        el.buildBtn.hidden = !BNB.Sim.canBuild();
        const canDestroy = BNB.Sim.canDestroy();
        el.destroyBtn.classList.toggle('is-disabled', !canDestroy);
        el.destroyBtn.setAttribute('aria-disabled', String(!canDestroy));
        // Pips: how many Destroy presses this build takes from here.
        const left = placed ? BNB.Sim.chunksLeft() : 0;
        el.destroyPips.innerHTML = left > 1 ? new Array(left + 1).join('<i></i>') : '';
        el.destroyPips.setAttribute('aria-hidden', 'true');
    }

    function playScannables() {
        const list = [];
        if (BNB.Sim.canBuild()) {
            list.push({
                id: 'play:build', el: el.buildBtn, quiet: true, speak: 'Build',
                hold: !!S().get('holdBuild'),
                action: function () { BNB.Game.build(); }
            });
        }
        if (BNB.Sim.canDestroy()) {
            list.push({
                id: 'play:destroy', el: el.destroyBtn, quiet: true, speak: 'Destroy',
                action: function () { BNB.Game.destroy(); }
            });
        }
        list.push({ id: 'play:pause', el: el.pauseBtn, speak: 'Pause', action: function () { BNB.Game.pause(); } });
        return list;
    }

    /** The play scan changes as the build goes up and comes down; keep the highlight's identity. */
    function playChanged() {
        if (screen !== 'play') return;
        refreshPlay();
        BNB.Input.refresh(false);
    }

    let calloutTimer = null;
    /** A big, friendly word in the middle of the top of the screen (also spoken by the caller). */
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
        const list = [
            { id: 'continue', label: 'Continue', icon: 'play', tone: 'green', action: function () { BNB.Game.resume(); } },
            { id: 'restart', label: 'Start Over', icon: 'again', tone: 'teal', action: function () { BNB.Game.startOver(); } },
            { id: 'another', label: 'Pick Another', icon: 'grid', tone: 'blue', action: function () { BNB.Game.pickAnother(); } },
            {
                id: 'need-help', label: 'I Need Help', icon: 'hand', tone: 'help', quiet: true,
                speak: 'I need help. Choose this to call a helper.',
                action: function () {
                    const message = 'I need help, please! I need help, please!';
                    const fallback = function () { return BNB.Voice.speak(message); };
                    if (window.NarbeCommunicationSpeech) window.NarbeCommunicationSpeech.help(fallback, message);
                    else fallback();
                }
            },
            { id: 'settings', label: 'Settings', icon: 'settings', tone: 'plum', action: function () { settingsFrom = 'pause'; show('settings'); } },
            { id: 'help', label: 'How to Play', icon: 'help', tone: 'teal', action: function () { helpFrom = 'pause'; show('help'); } },
            { id: 'menu', label: 'Main Menu', icon: 'home', tone: 'blue', action: function () { BNB.Game.toMenu(); } },
            { id: 'exit', label: 'Exit Game', icon: 'exit', tone: 'slate', action: function () { BNB.Game.exit(); } }
        ];
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
        const auto = autoOn();
        const lines = [
            'Pick a build. Choose *Build* to put the next block in place, and keep choosing it to finish.'
        ];
        if (S().get('holdBuild')) lines.push('Or hold *Enter* on *Build*. After 3 seconds it keeps building, one block every second, until you let go or it is finished.');
        lines.push('Choose *Destroy* any time, even halfway, and something silly knocks it all down.');
        if (S().get('chunked')) lines.push('Big builds come down in chunks. Choose *Destroy* again for each chunk.');
        lines.push('When it is all knocked down, choose *Build Again* or *Pick Another*.');
        lines.push('*Pause* is always in the scan, at the top right.');
        lines.push(auto ? 'The highlight moves by itself. *Enter* chooses.'
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
        const ticket = BNB.Voice.speak(text);
        if (!ticket) return;
        let released = false;
        const release = function () {
            if (released) return;
            released = true;
            clearTimeout(timer);
            document.removeEventListener('keydown', onPress, true);
            document.removeEventListener('pointerdown', onPress, true);
            BNB.Input.setEnabled(true);
        };
        const onPress = function () { BNB.Voice.cancel(); release(); };
        BNB.Input.setEnabled(false);
        const timer = setTimeout(release, Math.ceil(text.length / 13 * 1000) + 800);
        Promise.resolve(ticket.finished).then(function (r) { if (r && r.reason !== 'timeout') release(); });
        document.addEventListener('keydown', onPress, true);
        document.addEventListener('pointerdown', onPress, true);
    }

    function helpScannables() {
        return [
            { id: 'help:read', el: el.helpTitle, speak: 'How to Play', action: readAloud },
            { id: 'help:back', el: el.helpBack, speak: 'Back', action: function () { BNB.Voice.cancel(); show(helpFrom); } }
        ];
    }

    // --- settings ----------------------------------------------------------------------------------

    function vm() { return window.NarbeVoiceManager; }
    function sm() { return window.NarbeScanManager; }
    function ttsOn() { try { return !!vm().getSettings().ttsEnabled; } catch (e) { return false; } }
    function voiceName() { try { return vm().getVoiceDisplayName(vm().getCurrentVoice()); } catch (e) { return 'Default'; } }
    function speedLabel() { try { return (sm().getScanInterval() / 1000) + ' s'; } catch (e) { return '2 s'; } }
    function graphicsLabel() {
        try { const q = BNB.Stage.quality(); return q ? q.label().replace(/^Graphics quality:\s*/, '') : 'High'; } catch (e) { return 'High'; }
    }

    let settingsCache = [];
    let resetArmed = false, resetTimer = null;

    /**
     * Hub canonical order: Text to Speech, Voice, the game's own options,
     * Auto Scan, Scan Speed, Sound Effects, Reset Progress, Back. `after` is
     * what is said once an option is chosen: the explanation lives there.
     */
    function settingsItems() {
        const s = S();
        return [
            { id: 'tts', label: 'Speaking', value: () => onOff(ttsOn()), action: () => { try { vm().toggleTTS(); } catch (e) { /* none */ } },
                after: () => ttsOn() ? 'Speaking on. Everything is read aloud.' : '' },
            { id: 'voice', label: 'Voice', value: voiceName, action: () => { try { vm().cycleVoice(); } catch (e) { /* none */ } },
                after: () => 'Voice, ' + voiceName() + '. This is the voice you will hear.' },
            { id: 'hold', label: 'Hold to Build', value: () => onOff(s.get('holdBuild')), action: () => s.toggle('holdBuild'),
                after: () => s.get('holdBuild') ? 'Hold to build on. A press builds one block. Hold Enter on Build for 3 seconds and it keeps building, one block every second.' : 'Hold to build off. Every press builds one block, however long it is held.' },
            { id: 'names', label: 'Piece Names', value: () => onOff(s.get('pieceNames')), action: () => s.toggle('pieceNames'),
                after: () => s.get('pieceNames') ? 'Piece names on. Special pieces, like a door or a roof, are said as they land.' : 'Piece names off.' },
            { id: 'chunks', label: 'Big Builds Fall', value: () => s.get('chunked') ? 'In Chunks' : 'All at Once',
                action: () => { s.toggle('chunked'); BNB.Game.applySettings(); },
                after: () => s.get('chunked') ? 'In chunks. Big builds take a few Destroy presses, one chunk at a time.' : 'All at once. One Destroy press knocks down the whole build.' },
            { id: 'hint', label: 'Next Block Hint', value: () => onOff(s.get('hint')), action: () => s.toggle('hint'),
                after: () => s.get('hint') ? 'Hint on. A glowing outline shows where the next block goes.' : 'Hint off.' },
            { id: 'motion', label: 'Motion', value: () => s.get('motion') === 'calm' ? 'Calm' : 'Full',
                action: () => { s.set('motion', s.get('motion') === 'calm' ? 'full' : 'calm'); BNB.Game.applySettings(); },
                after: () => s.get('motion') === 'calm' ? 'Motion calm. No camera shake, a steadier camera and fewer effects.' : 'Motion full. Camera shake and every effect.' },
            { id: 'graphics', label: 'Graphics', value: graphicsLabel,
                action: () => { try { const q = BNB.Stage.quality(); if (q) q.cycle(); } catch (e) { /* none */ } },
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
            { id: 'sound', label: 'Sound Effects', value: () => onOff(s.get('sound')), action: () => { s.toggle('sound'); BNB.Sound.sample(); },
                after: () => s.get('sound') ? 'Sound effects on.' : 'Sound effects off.' },
            { id: 'volume', label: 'Volume', value: () => s.volumeName(), action: () => { s.cycle('volumeIndex', s.VOLUMES.length); BNB.Sound.sample(); },
                after: () => 'Volume, ' + s.volumeName() + '.' },
            { id: 'reset', label: resetArmed ? 'Reset Progress?' : 'Reset Progress', value: () => resetArmed ? 'Choose again to erase' : s.builtCount() + ' built',
                danger: resetArmed,
                action: () => {
                    if (!resetArmed) {
                        resetArmed = true;
                        clearTimeout(resetTimer);
                        resetTimer = setTimeout(disarmReset, 10000);
                        return;
                    }
                    disarmReset(true);
                    s.resetProgress();
                },
                after: () => resetArmed ? 'Are you sure? Choose Reset Progress again to erase the check marks for builds you have finished.' : 'Progress erased.' },
            { id: 'back', label: '← Back', value: () => '', nav: true,
                action: () => { disarmReset(true); show(settingsFrom === 'pause' ? 'pause' : 'menu'); } }
        ];
    }

    function disarmReset(quiet) {
        clearTimeout(resetTimer);
        if (!resetArmed) return;
        resetArmed = false;
        if (!quiet && screen === 'settings') { renderSettings(); BNB.Input.refresh(false); }
    }

    function renderSettings() {
        settingsCache = settingsItems();
        el.settingsList.style.setProperty('--rows', String(Math.ceil(settingsCache.length / 2)));
        el.settingsList.innerHTML = '';
        settingsCache.forEach(function (item) {
            const b = button('bnb-row' + (item.nav ? ' bnb-row-nav' : '') + (item.danger ? ' bnb-row-danger' : ''), el.settingsList);
            b.dataset.setting = item.id;
            node('span', 'bnb-row-label', b, item.label);
            const v = node('span', 'bnb-row-value', b);
            const sw = item.swatch && item.swatch();
            if (sw) { const dot = node('span', 'bnb-swatch', v); dot.style.background = sw; }
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
                onFocus: function () { if (item.id !== 'reset') disarmReset(); },
                action: function () {
                    item.action();
                    if (item.nav || screen !== 'settings') return;
                    renderSettings();
                    BNB.Input.refresh(false);
                    const fresh = settingsCache.find(x => x.id === item.id);
                    const line = fresh && fresh.after && fresh.after();
                    if (line) BNB.Input.announce(line);
                }
            };
        });
    }

    // --- done ------------------------------------------------------------------------------------

    function doneScannables() {
        return [
            { id: 'done:again', el: el.againBtn, speak: 'Build again', action: function () { BNB.Game.buildAgain(); } },
            { id: 'done:another', el: el.anotherBtn, speak: 'Pick another', action: function () { BNB.Game.pickAnother(); } }
        ];
    }

    function errorScannables() {
        return [{ id: 'error:exit', el: el.errorExit, speak: 'Exit Game', action: function () { BNB.Game.exit(); } }];
    }

    function scannables() {
        switch (screen) {
            case 'menu': return menuScannables();
            case 'select': return selectScannables();
            case 'play': return playScannables();
            case 'pause': return pauseItems;
            case 'settings': return settingsScannables();
            case 'help': return helpScannables();
            case 'done': return doneScannables();
            case 'error': return errorScannables();
            default: return [];
        }
    }

    let scanHost = null;
    /** Where the shared "Parked" badge lives, outside the choices. */
    function scanContext() {
        if (!scanHost) scanHost = node('div', 'bnb-scan-status');
        const parent = screen === 'play' ? el.hud : el[screen] && el[screen].querySelector('.bnb-card');
        if (parent && scanHost.parentElement !== parent) parent.prepend(scanHost);
        return { key: screen === 'select' ? 'select:' + page : screen, host: scanHost || el.root };
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
        playChanged: playChanged,
        callout: callout,
        setThumb: setThumb,
        showError: showError,
        doneTitle: function (text) { el.doneTitle.textContent = text; },
        stageEl: function () { return el.stage; },
        page: function () { return page; }
    };
})();
