/**
 * NARBE Space Explorer - the page interface over the 3D view.
 * (Card, button, scan and speech patterns from NARBE Build n Ride.)
 *
 * Every screen is a stationary choice scan (js/input.js). Scan order:
 *   Main menu   Start/Keep Exploring, Logbook, How to Play, Settings, Exit Game
 *   (Kept short: every stop costs a switch user time on every pass; the user asked for it.)
 *   Flying      Next Stop, Explore System (Nearby Stars in deep space), Warp, Steer,
 *               Pause (top right)
 *   Steer       Turn Left, Turn Right, Up, Down, Speed (cycles), Back
 *   Explore     (no card: the camera rises over the system and each world is a ring
 *               in the picture, highlighted where it is) the star and each planet
 *               (or the nearest star systems), Back
 *   Gliding     Pause (into or out of orbit, by itself)
 *   Prompt      Yes, No ("Do you want to go here?"; the scan stays inside it)
 *   Orbit       Fly Low, Scan, Visit a Moon / Back to <planet> (when there is one),
 *               Leave Orbit, Pause
 *   Moons       each moon, Back
 *   Fly Low     Scan, Turn Left, Turn Right, Back to Orbit, Pause
 *   Scanner     Next Creature (when there is more than one), Back
 *   Alien call  Wave Hello, Say Goodbye
 *   Galaxy map  Warp to a New Star, Warp to a New Galaxy, Back
 *   New galaxy  (seen from outside) Fly In, Find Another Galaxy
 *   Pause       Continue, View (Cockpit / Chase / Wide), Logbook, Settings,
 *               How to Play, I Need Help, Main Menu, Exit Game
 *   Logbook     3x3 picture pages, More Pages, Back; an entry: Next, Previous,
 *               Visit Again, Back
 *   Settings    the hub's canonical order (TTS, Voice, game options, Auto
 *               Scan, Scan Speed, Sound...), Reset Logbook (two steps), Back
 * Menus are cards scaled to fit, so nothing ever scrolls.
 */

window.NSE = window.NSE || {};

NSE.UI = (function () {
    'use strict';

    const U = NSE.Util;
    let screen = 'loading';
    let settingsFrom = 'menu', helpFrom = 'menu', logFrom = 'menu';
    let data = {};             // what the current card shows (prompt, scan, hail, map, entry)
    let logPage = 0, entryIndex = 0;
    let resetArmed = false;
    const PER_PAGE = 9;
    const el = {};

    function S() { return NSE.Settings; }
    function G() { return NSE.Game; }

    // --- helpers -----------------------------------------------------------------------------

    function node(tag, cls, parent, text) {
        const n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text !== undefined) n.textContent = text;
        if (parent) parent.appendChild(n);
        return n;
    }
    function button(cls, parent, label) {
        const b = node('button', 'nse-btn ' + (cls || ''), parent);
        b.type = 'button';
        if (label !== undefined) b.textContent = label;
        return b;
    }
    function onOff(v) { return v ? 'On' : 'Off'; }

    const ICON = (function () {
        const svg = body => '<svg class="nse-icon" viewBox="0 0 48 48" aria-hidden="true" focusable="false">' + body + '</svg>';
        return {
            rocket: svg('<path d="M24 5c7 6 9 15 7 25H17c-2-10 0-19 7-25z"/><circle cx="24" cy="18" r="3.5"/><path d="M17 27l-6 7 7-1M31 27l6 7-7-1"/><path d="M20 34l4 9 4-9"/>'),
            next: svg('<path d="M10 24h22"/><path d="M26 15l9 9-9 9"/><circle cx="40" cy="24" r="3" class="nse-dot"/>'),
            left: svg('<path d="M30 40V26a10 10 0 0 0-10-10H9"/><path d="M16 9l-7 7 7 7"/>'),
            right: svg('<path d="M18 40V26a10 10 0 0 1 10-10h11"/><path d="M32 9l7 7-7 7"/>'),
            up: svg('<path d="M24 40V10"/><path d="M13 20l11-11 11 11"/>'),
            down: svg('<path d="M24 8v30"/><path d="M13 28l11 11 11-11"/>'),
            faster: svg('<path d="M8 12l12 12-12 12"/><path d="M24 12l12 12-12 12"/>'),
            slower: svg('<path d="M14 10v28M34 10v28"/>'),
            warp: svg('<circle cx="24" cy="24" r="5"/><path d="M24 6v8M24 34v8M6 24h8M34 24h8M11 11l6 6M31 31l6 6M37 11l-6 6M17 31l-6 6"/>'),
            camera: svg('<rect x="6" y="15" width="28" height="20" rx="4"/><path d="M34 21l9-5v18l-9-5"/><circle cx="18" cy="25" r="4.5"/>'),
            pause: '<svg class="nse-icon" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><rect x="13" y="10" width="8" height="28" rx="3" class="nse-fill"/><rect x="27" y="10" width="8" height="28" rx="3" class="nse-fill"/></svg>',
            low: svg('<path d="M5 36c6-5 10-5 16 0s10 5 16 0 6-4 6-4"/><path d="M14 22l12-6 10 2-10 6z"/>'),
            scan: svg('<circle cx="21" cy="21" r="12"/><path d="M30 30l11 11"/><path d="M15 21a6 6 0 0 1 6-6"/>'),
            moon: svg('<path d="M30 8a16 16 0 1 0 10 26A13 13 0 0 1 30 8z"/>'),
            leave: svg('<circle cx="16" cy="30" r="9"/><path d="M24 22l14-14"/><path d="M28 8h10v10"/>'),
            back: svg('<path d="M30 12 18 24l12 12"/>'),
            yes: svg('<path d="M10 25l9 9 19-20"/>'),
            no: svg('<path d="M13 13l22 22M35 13 13 35"/>'),
            book: svg('<path d="M8 10h13a4 4 0 0 1 4 4v26a3 3 0 0 0-3-3H8z"/><path d="M40 10H27a4 4 0 0 0-4 4v26a3 3 0 0 1 3-3h14z"/>'),
            help: svg('<circle cx="24" cy="24" r="17"/><path d="M19 19a5 5 0 1 1 5 7v2"/><circle cx="24" cy="34" r="1.8" class="nse-dot"/>'),
            settings: svg('<circle cx="24" cy="24" r="14"/><circle cx="24" cy="24" r="5.5"/><path d="M24 4v6M24 38v6M4 24h6M38 24h6M10 10l4 4M34 34l4 4M38 10l-4 4M14 34l-4 4"/>'),
            exit: svg('<path d="M28 10H12v28h16"/><path d="M24 24h14"/><path d="M32 18l6 6-6 6"/>'),
            home: svg('<path d="M8 23 24 10l16 13"/><path d="M12 23v17h24V23"/><path d="M20 40V30h8v10"/>'),
            hand: svg('<path d="M17 25V12a3 3 0 0 1 6 0v10M23 21V9a3 3 0 0 1 6 0v12M29 21v-8a3 3 0 0 1 6 0v14c0 8-5 13-12 13-5 0-8-3-11-8l-4-7a3 3 0 0 1 5-3l3 4"/>'),
            speaker: svg('<path d="M9 19h7l9-7v24l-9-7H9z"/><path d="M32 18a9 9 0 0 1 0 12"/><path d="M37 13a16 16 0 0 1 0 22"/>'),
            play: svg('<circle cx="24" cy="24" r="17"/><path d="M20 17l12 7-12 7z"/>'),
            wave: svg('<path d="M17 25V12a3 3 0 0 1 6 0v10M23 21V9a3 3 0 0 1 6 0v12M29 21v-8a3 3 0 0 1 6 0v14c0 8-5 13-12 13-5 0-8-3-11-8l-4-7a3 3 0 0 1 5-3l3 4"/><path d="M38 6c3 2 4 5 4 8M6 34c0 3 1 5 3 7"/>'),
            bye: svg('<path d="M12 12l24 24M36 12 12 36"/><circle cx="24" cy="24" r="18"/>'),
            star: svg('<path d="M24 7l5 11 12 1-9 8 3 12-11-7-11 7 3-12-9-8 12-1z"/>'),
            galaxy: svg('<path d="M24 24c0-6 8-8 12-3 5 6-1 17-12 17S6 30 8 20 22 4 32 8"/><circle cx="24" cy="24" r="3" class="nse-dot"/>'),
            prev: svg('<path d="M30 12 18 24l12 12"/>'),
            fwd: svg('<path d="M18 12l12 12-12 12"/>'),
            planet: svg('<circle cx="24" cy="24" r="11"/><ellipse cx="24" cy="24" rx="21" ry="7" transform="rotate(-20 24 24)"/>'),
            // The Field Guide and what is in it.
            guide: svg('<path d="M8 10h13a4 4 0 0 1 4 4v26a3 3 0 0 0-3-3H8z"/><path d="M40 10H27a4 4 0 0 0-4 4v26a3 3 0 0 1 3-3h14z"/><path d="M29 30c0-7 4-11 9-12 0 7-3 11-9 12z"/>'),
            paw: svg('<circle cx="14" cy="20" r="3.6"/><circle cx="21" cy="13" r="3.6"/><circle cx="29" cy="13" r="3.6"/><circle cx="36" cy="20" r="3.6"/><path d="M14 34c0-6 5-11 11-11s11 5 11 11c0 4-4 6-11 6s-11-2-11-6z"/>'),
            leaf: svg('<path d="M10 38C10 20 22 9 40 8c0 18-11 30-29 30z"/><path d="M10 38 30 18"/>'),
            city: svg('<path d="M5 41h38"/><path d="M9 41V24h8v17M20 41V11h8v30M31 41V27h8v14"/><path d="M24 11V5"/><path d="M23 17h2M23 23h2M23 29h2"/>'),
            sparkle: svg('<path d="M22 6l3.5 11.5L37 21l-11.5 3.5L22 36l-3.5-11.5L7 21l11.5-3.5z"/><path d="M38 32l1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5z"/>'),
            comet: svg('<circle cx="34" cy="14" r="5.5"/><path d="M29 18 8 40M33 20 17 41M27 15 7 32"/>'),
            whale: svg('<path d="M5 25c3-8 14-12 24-9 6 2 8 6 8 9-6 7-22 9-32 0z"/><path d="M37 24l6-7v14z"/><circle cx="13" cy="23" r="1.8" class="nse-dot"/><path d="M14 30c2 3 4 4 7 4"/>'),
            rainbow: svg('<path d="M5 37a19 19 0 0 1 38 0"/><path d="M11 37a13 13 0 0 1 26 0"/><path d="M17 37a7 7 0 0 1 14 0"/>'),
            rings2: svg('<circle cx="24" cy="24" r="8"/><ellipse cx="24" cy="24" rx="20" ry="6" transform="rotate(-20 24 24)"/><ellipse cx="24" cy="24" rx="16" ry="4.5" transform="rotate(28 24 24)"/>'),
            glowsea: svg('<path d="M5 31c5-4 9-4 14 0s9 4 14 0 8-4 10-1"/><path d="M5 39c5-4 9-4 14 0s9 4 14 0 8-4 10-1"/><circle cx="15" cy="18" r="2.2" class="nse-dot"/><circle cx="28" cy="13" r="2.2" class="nse-dot"/><circle cx="37" cy="21" r="1.8" class="nse-dot"/>'),
            aurora: svg('<path d="M5 29c6-14 10-18 14-6s8 8 12-4 8-6 12 2"/><path d="M5 39c6-10 10-12 14-4s8 6 12-2 8-4 12 2"/>'),
            ringmoon: svg('<path d="M27 12a11 11 0 1 0 7 19 9 9 0 0 1-7-19z"/><ellipse cx="24" cy="24" rx="20" ry="5.5" transform="rotate(-15 24 24)"/>'),
            giant: svg('<path d="M5 34c0-10 8-18 20-18 8 0 14 5 15 12l3 1-3 2v5H5z"/><path d="M11 34v6M19 34v6M29 34v6M37 34v6"/><circle cx="34" cy="24" r="1.8" class="nse-dot"/>'),
            train: svg('<rect x="7" y="13" width="34" height="17" rx="8"/><path d="M6 37h36"/><path d="M14 21h7M26 21h7"/>'),
            elevator: svg('<circle cx="24" cy="39" r="5"/><path d="M24 34V5"/><rect x="19" y="13" width="10" height="6" rx="2"/>'),
            drone: svg('<rect x="17" y="21" width="14" height="9" rx="3"/><path d="M8 16h10M30 16h10M13 16v7M35 16v7"/>'),
            skyship: svg('<path d="M7 21c0-5 8-8 17-8s17 3 17 8-8 8-17 8-17-3-17-8z"/><path d="M17 29l-2 7h18l-2-7"/>'),
            beacon: svg('<path d="M19 43l3-26h4l3 26z"/><path d="M24 11V5M13 9l5 4M35 9l-5 4"/>'),
            solar: svg('<path d="M7 35l6-17h28l-6 17z"/><path d="M10 27h28M21 18l-4 17M31 18l-4 17"/>'),
            farm: svg('<rect x="6" y="10" width="36" height="28" rx="3"/><path d="M6 24h36M24 10v28M6 17h18M24 31h18"/>'),
            dome: svg('<path d="M8 38a16 16 0 0 1 32 0z"/><path d="M5 38h38"/><path d="M20 38v-6h8v6M16 26h16"/>'),
            tree: svg('<path d="M24 42V24"/><path d="M24 26c-9 0-14-5-14-11 0-5 6-9 14-9s14 4 14 9c0 6-5 11-14 11z"/><path d="M18 30l6-4 6 4"/>')
        };
    })();

    /** Each Field Guide find's picture when there is no photo or model: an icon. */
    const FIND_ICON = {
        'rare:comet': 'comet', 'rare:whales': 'whale', 'rare:rainbow': 'planet', 'rare:doublering': 'rings2', 'rare:glowsea': 'glowsea', 'rare:aurora': 'aurora',
        'rare:ringedmoon': 'ringmoon', 'rare:rainbowsky': 'rainbow', 'rare:golden': 'sparkle', 'rare:giant': 'giant',
        'civ:spires': 'city', 'civ:organic': 'tree', 'civ:domes': 'dome', 'civ:arcology': 'city', 'civ:floating': 'skyship', 'civ:crystal': 'sparkle',
        'tech:ring': 'planet', 'tech:elevator': 'elevator', 'tech:maglev': 'train', 'tech:skyships': 'skyship', 'tech:drones': 'drone', 'tech:beacons': 'beacon', 'tech:solar': 'solar', 'tech:farms': 'farm'
    };

    function menuItem(parent, label, icon, tone) {
        const b = button('nse-menu-item', parent);
        if (tone) b.dataset.tone = tone;
        node('span', 'nse-icon-chip', b).innerHTML = ICON[icon] || '';
        node('span', 'nse-menu-label', b, label);
        return b;
    }
    function card(screenEl, title, sub) {
        const c = node('div', 'nse-card', screenEl);
        if (title !== undefined) node('h2', 'nse-title', c, title);
        if (sub !== undefined) node('p', 'nse-sub', c, sub);
        return c;
    }
    function hudButton(bar, icon, label, tone) {
        const b = button('nse-hud-btn', bar);
        b.dataset.tone = tone || 'blue';
        node('span', 'nse-hud-icon', b).innerHTML = ICON[icon];
        node('span', 'nse-hud-label', b, label);
        return b;
    }

    // --- build ---------------------------------------------------------------------------------

    function build() {
        el.root = document.getElementById('nse');
        el.stage = node('div', 'nse-stage', el.root);

        // The cockpit: a light canopy, under the controls. A thin rim along the top, two slim curved
        // struts in the corners (behind the title box and Pause), a low console only where the
        // button bar already is, and a faint tint at the edges of the glass. It used to be a heavy
        // frame and dashboard that hid the planet (the user: "a very subtle cockpit view with less
        // blocking"); it stays the same in Fly Low.
        el.cockpit = node('div', 'nse-cockpit', el.root);
        el.cockpit.innerHTML = '<svg viewBox="0 0 1600 900" preserveAspectRatio="none" aria-hidden="true" focusable="false">' +
            '<defs>' +
            '<radialGradient id="nse-cp-vig" cx="50%" cy="42%" r="78%"><stop offset="62%" stop-color="#040918" stop-opacity="0"/><stop offset="100%" stop-color="#040918" stop-opacity="0.5"/></radialGradient>' +
            '<linearGradient id="nse-cp-glint" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#cfe6ff" stop-opacity="0"/><stop offset="0.5" stop-color="#cfe6ff" stop-opacity="0.06"/><stop offset="1" stop-color="#cfe6ff" stop-opacity="0"/></linearGradient>' +
            '<linearGradient id="nse-cp-con" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#28355a"/><stop offset="1" stop-color="#10172a"/></linearGradient>' +
            '</defs>' +
            '<rect class="nse-cp-vignette" width="1600" height="900" fill="url(#nse-cp-vig)"/>' +
            '<path class="nse-cp-glint" d="M1180 0H1330L1010 560H860Z" fill="url(#nse-cp-glint)"/>' +
            '<path class="nse-cp-rim" d="M0 0H1600V28Q800 -6 0 28Z"/>' +
            '<path class="nse-cp-bow" d="M380 -30Q150 150 -30 620M1220 -30Q1450 150 1630 620"/>' +
            '<path class="nse-cp-bow-hi" d="M380 -30Q150 150 -30 620M1220 -30Q1450 150 1630 620"/>' +
            '<path class="nse-cp-console" d="M0 900V812Q800 748 1600 812V900Z" fill="url(#nse-cp-con)"/>' +
            '<path class="nse-cp-console-edge" d="M0 812Q800 748 1600 812"/>' +
            '<g class="nse-cp-lights"><rect x="120" y="842" width="22" height="12" rx="6"/><rect x="160" y="838" width="22" height="12" rx="6"/><rect x="1418" y="838" width="22" height="12" rx="6"/><rect x="1458" y="842" width="22" height="12" rx="6"/></g>' +
            '</svg>';

        // The target marker: a ring round where Next Stop is heading, or the place being asked about.
        el.marker = node('div', 'nse-marker', el.root);
        node('div', 'nse-marker-ring', el.marker);
        el.markerLabel = node('div', 'nse-marker-label', el.marker);

        // HUD.
        el.hud = node('div', 'nse-hud', el.root);
        el.info = node('div', 'nse-info', el.hud);
        el.infoName = node('div', 'nse-info-name', el.info);
        el.infoSub = node('div', 'nse-info-sub', el.info);
        el.pauseBtn = button('nse-pause-btn', el.hud);
        el.pauseBtn.setAttribute('aria-label', 'Pause');
        node('span', 'nse-pause-icon', el.pauseBtn).innerHTML = ICON.pause;
        node('span', 'nse-pause-label', el.pauseBtn, 'Pause');

        el.flyBar = node('div', 'nse-bar nse-fly-bar', el.hud);
        el.fNext = hudButton(el.flyBar, 'next', 'Next Stop', 'green');
        el.fExplore = hudButton(el.flyBar, 'planet', 'Explore System', 'teal');
        el.fExploreLabel = el.fExplore.querySelector('.nse-hud-label');
        el.fWarp = hudButton(el.flyBar, 'warp', 'Warp', 'help');
        el.fSteer = hudButton(el.flyBar, 'rocket', 'Steer', 'blue');

        // Steering, only when wanted.
        el.steerBar = node('div', 'nse-bar nse-steer-bar', el.hud);
        el.sLeft = hudButton(el.steerBar, 'left', 'Turn Left', 'blue');
        el.sRight = hudButton(el.steerBar, 'right', 'Turn Right', 'blue');
        el.sUp = hudButton(el.steerBar, 'up', 'Up', 'teal');
        el.sDown = hudButton(el.steerBar, 'down', 'Down', 'teal');
        el.sSpeed = hudButton(el.steerBar, 'faster', 'Speed', 'plum');
        el.sSpeedLabel = el.sSpeed.querySelector('.nse-hud-label');
        el.steerBack = hudButton(el.steerBar, 'back', 'Back', 'slate');   // (el.sBack is the scanner's Back)

        el.orbitBar = node('div', 'nse-bar nse-orbit-bar', el.hud);
        el.oLow = hudButton(el.orbitBar, 'low', 'Fly Low', 'green');
        el.oScan = hudButton(el.orbitBar, 'scan', 'Scan', 'teal');
        el.oMoon = hudButton(el.orbitBar, 'moon', 'Visit a Moon', 'plum');
        el.oMoonLabel = el.oMoon.querySelector('.nse-hud-label');
        el.oLeave = hudButton(el.orbitBar, 'leave', 'Leave Orbit', 'help');

        el.lowBar = node('div', 'nse-bar nse-low-bar', el.hud);
        el.lScan = hudButton(el.lowBar, 'scan', 'Scan', 'teal');
        el.lLeft = hudButton(el.lowBar, 'left', 'Turn Left', 'blue');
        el.lRight = hudButton(el.lowBar, 'right', 'Turn Right', 'blue');
        el.lBack = hudButton(el.lowBar, 'planet', 'Back to Orbit', 'help');


        el.callout = node('div', 'nse-callout', el.hud);
        el.callout.setAttribute('aria-live', 'polite');

        // Loading and error.
        el.loading = node('section', 'nse-screen nse-screen-loading', el.root);
        const lc = node('div', 'nse-loading', el.loading);
        node('div', 'nse-loading-orbit', lc).innerHTML = '<span></span>';
        el.loadingText = node('p', 'nse-loading-text', lc, 'Warming up the engines…');
        el.error = node('section', 'nse-screen', el.root);
        const ec = card(el.error, 'Space Explorer can’t start', '');
        ec.classList.add('nse-card-narrow');
        el.errorText = ec.querySelector('.nse-sub');
        el.errorExit = menuItem(ec, 'Exit Game', 'exit', 'slate');

        // Main menu.
        el.menu = node('section', 'nse-screen nse-screen-menu', el.root);
        const mc = node('div', 'nse-card nse-card-menu', el.menu);
        const head = node('div', 'nse-brand', mc);
        node('span', 'nse-logo', head).innerHTML = ICON.rocket;
        const words = node('div', 'nse-brand-words', head);
        node('span', 'nse-brand-narbe', words, 'NARBE');
        node('h1', 'nse-brand-title', words, 'Space Explorer');
        el.tagline = node('p', 'nse-sub nse-tagline', mc, 'Somewhere new, every time.');
        el.menuList = node('div', 'nse-list nse-menu-list', mc);
        el.mStart = menuItem(el.menuList, 'Start Exploring', 'rocket', 'green');
        el.mStartLabel = el.mStart.querySelector('.nse-menu-label');
        el.mLog = menuItem(el.menuList, 'Logbook', 'book', 'teal');
        el.mHelp = menuItem(el.menuList, 'How to Play', 'help', 'blue');
        el.mSettings = menuItem(el.menuList, 'Settings', 'settings', 'plum');
        el.mExit = menuItem(el.menuList, 'Exit Game', 'exit', 'slate');

        // Do you want to go here?
        el.prompt = node('section', 'nse-screen nse-screen-prompt', el.root);
        const pc = node('div', 'nse-card nse-card-prompt', el.prompt);
        el.promptKind = node('div', 'nse-prompt-kind', pc);
        el.promptName = node('div', 'nse-prompt-name', pc);
        el.promptWhat = node('div', 'nse-prompt-what', pc);
        node('h2', 'nse-title nse-prompt-q', pc, 'Do you want to go here?');
        el.promptList = node('div', 'nse-prompt-list', pc);
        el.pYes = menuItem(el.promptList, 'Yes', 'yes', 'green');
        el.pNo = menuItem(el.promptList, 'No', 'no', 'slate');

        // Moons.
        el.moons = node('section', 'nse-screen', el.root);
        const moc = card(el.moons, 'Visit a Moon', '');
        moc.classList.add('nse-card-narrow');
        el.moonsSub = moc.querySelector('.nse-sub');
        el.moonList = node('div', 'nse-list', moc);

        // Scanner.
        el.scanner = node('section', 'nse-screen nse-screen-scanner', el.root);
        const scc = node('div', 'nse-card nse-card-scanner', el.scanner);
        const scHead = node('div', 'nse-scan-head', scc);
        node('span', 'nse-scan-tag', scHead, 'SCANNER');
        el.scanCount = node('span', 'nse-scan-count', scHead);
        const scBody = node('div', 'nse-scan-body', scc);
        el.viewerWin = node('div', 'nse-viewer', scBody);
        node('div', 'nse-viewer-grid', el.viewerWin);
        const scText = node('div', 'nse-scan-text', scBody);
        el.scanName = node('div', 'nse-scan-name', scText);
        el.scanWhat = node('div', 'nse-scan-what', scText);
        el.scanFacts = node('ul', 'nse-scan-facts', scText);
        el.scanList = node('div', 'nse-scan-list', scc);
        el.sNext = menuItem(el.scanList, 'Next Creature', 'fwd', 'teal');
        el.sBack = menuItem(el.scanList, 'Back', 'back', 'slate');

        // An alien calls.
        el.hail = node('section', 'nse-screen nse-screen-hail', el.root);
        const hc = node('div', 'nse-card nse-card-hail', el.hail);
        node('div', 'nse-hail-tag', hc, 'INCOMING CALL');
        const hb = node('div', 'nse-hail-body', hc);
        el.hailCanvas = node('canvas', 'nse-hail-face', hb);
        el.hailCanvas.width = 320; el.hailCanvas.height = 320;
        const ht = node('div', 'nse-hail-text', hb);
        el.hailWho = node('div', 'nse-hail-who', ht);
        el.hailAlien = node('div', 'nse-hail-alien', ht);
        el.hailSays = node('div', 'nse-hail-says', ht);
        el.hailList = node('div', 'nse-hail-list', hc);
        el.hWave = menuItem(el.hailList, 'Wave Hello', 'wave', 'green');
        el.hBye = menuItem(el.hailList, 'Say Goodbye', 'bye', 'slate');

        // Galaxy map.
        el.map = node('section', 'nse-screen', el.root);
        const gc = node('div', 'nse-card nse-card-map', el.map);
        el.mapTitle = node('h2', 'nse-title', gc, 'Galaxy Map');
        el.mapSub = node('p', 'nse-sub', gc, '');
        const mb = node('div', 'nse-map-body', gc);
        el.mapCanvas = node('canvas', 'nse-map-canvas', mb);
        el.mapCanvas.width = 560; el.mapCanvas.height = 420;
        el.mapList = node('div', 'nse-list nse-map-list', mb);
        el.gStar = menuItem(el.mapList, 'Warp to a New Star', 'star', 'help');
        el.gGalaxy = menuItem(el.mapList, 'Warp to a New Galaxy', 'galaxy', 'plum');
        el.gBack = menuItem(el.mapList, 'Back', 'back', 'slate');

        // A new galaxy, seen from outside: fly in?
        el.galaxy = node('section', 'nse-screen nse-screen-bottom', el.root);
        const nc = node('div', 'nse-card nse-card-galaxy', el.galaxy);
        el.galaxyKind = node('div', 'nse-prompt-kind', nc, 'A new galaxy!');
        el.galaxyName = node('div', 'nse-prompt-name', nc);
        el.galaxyWhat = node('div', 'nse-prompt-what', nc);
        node('h2', 'nse-title nse-prompt-q', nc, 'Do you want to fly in and explore?');
        el.galaxyList = node('div', 'nse-prompt-list', nc);
        el.nIn = menuItem(el.galaxyList, 'Fly In', 'rocket', 'green');
        el.nOther = menuItem(el.galaxyList, 'Find Another Galaxy', 'galaxy', 'plum');

        // Explore System (the worlds here) / Nearby Stars (the closest systems). No card over the
        // view: the camera rises over the system (js/stage.js) and each world is a ring in the
        // picture that lights up where it is as the scan reaches it (the user's idea). A small
        // panel at the bottom says what the highlighted world is, beside Back.
        el.system = node('section', 'nse-screen nse-screen-survey', el.root);
        el.surveyHead = node('div', 'nse-info nse-survey-head', el.system);
        el.surveyName = node('div', 'nse-info-name', el.surveyHead);
        el.surveySub = node('div', 'nse-info-sub', el.surveyHead);
        el.pins = node('div', 'nse-pins', el.system);
        const xc = node('div', 'nse-card nse-card-survey', el.system);
        el.cap = node('div', 'nse-survey-cap', xc);
        el.capOrb = node('span', 'nse-cap-orb', el.cap);
        const capText = node('div', 'nse-cap-text', el.cap);
        el.capName = node('div', 'nse-cap-name', capText);
        el.capWhat = node('div', 'nse-cap-what', capText);
        el.capTags = node('div', 'nse-cap-tags', capText);
        el.systemBack = menuItem(xc, 'Back', 'back', 'slate');

        // A soft fade (through a world's sky colour, or dark), for going down into an atmosphere.
        el.fade = node('div', 'nse-fade', el.root);

        // Pause.
        el.pause = node('section', 'nse-screen', el.root);
        const pac = card(el.pause, 'Paused');
        pac.classList.add('nse-card-pause');
        el.pauseList = node('div', 'nse-list nse-pause-list', pac);
        el.zContinue = menuItem(el.pauseList, 'Continue', 'play', 'green');
        el.zView = menuItem(el.pauseList, 'View', 'camera', 'slate');
        el.zViewLabel = el.zView.querySelector('.nse-menu-label');
        el.zLog = menuItem(el.pauseList, 'Logbook', 'book', 'teal');
        el.zSettings = menuItem(el.pauseList, 'Settings', 'settings', 'plum');
        el.zHelp = menuItem(el.pauseList, 'How to Play', 'help', 'blue');
        el.zNeed = menuItem(el.pauseList, 'I Need Help', 'hand', 'help');
        el.zMenu = menuItem(el.pauseList, 'Main Menu', 'home', 'blue');
        el.zExit = menuItem(el.pauseList, 'Exit Game', 'exit', 'slate');

        // Logbook.
        el.logbook = node('section', 'nse-screen', el.root);
        const lb = node('div', 'nse-card nse-card-log', el.logbook);
        const lh = node('div', 'nse-log-head', lb);
        node('h2', 'nse-title', lh, 'Logbook');
        el.logPageLabel = node('span', 'nse-page-label', lh);
        el.logStats = node('p', 'nse-sub nse-log-stats', lb, '');
        el.logEmpty = node('p', 'nse-sub nse-log-empty', lb, 'Nothing here yet. Go into orbit around a star, planet or moon and it is written in your logbook by itself.');
        el.logGrid = node('div', 'nse-grid', lb);
        el.logFoot = node('div', 'nse-log-foot', lb);
        el.logMore = menuItem(el.logFoot, 'More Pages', 'fwd', 'blue');
        el.logGuide = menuItem(el.logFoot, 'Field Guide', 'guide', 'help');
        el.logBack = menuItem(el.logFoot, 'Back', 'back', 'slate');

        // The Field Guide: its sections (Worlds, Landscapes, Stars, Animals, Plants, Civilisations,
        // Rare Sights), each with how many of its finds you have.
        el.guide = node('section', 'nse-screen', el.root);
        const gd = node('div', 'nse-card nse-card-guide', el.guide);
        node('h2', 'nse-title', gd, 'Field Guide');
        el.guideStats = node('p', 'nse-sub nse-guide-stats', gd, '');
        el.guideCats = node('div', 'nse-guide-cats', gd);
        el.guideBack = menuItem(gd, 'Back', 'back', 'slate');
        el.guideBack.classList.add('nse-guide-back');

        // One section: pages of finds (silhouettes with a hint until found).
        el.gpage = node('section', 'nse-screen', el.root);
        const gp = node('div', 'nse-card nse-card-log nse-card-gpage', el.gpage);
        const gph = node('div', 'nse-log-head', gp);
        el.gpTitle = node('h2', 'nse-title', gph, '');
        el.gpPage = node('span', 'nse-page-label', gph);
        el.gpStats = node('p', 'nse-sub nse-log-stats', gp, '');
        el.gpGrid = node('div', 'nse-grid nse-guide-grid', gp);
        const gpf = node('div', 'nse-log-foot', gp);
        el.gpMore = menuItem(gpf, 'More Pages', 'fwd', 'blue');
        el.gpBack = menuItem(gpf, 'Back', 'back', 'slate');

        // One find: its picture, what it is, where you found it, and Visit Again.
        el.gitem = node('section', 'nse-screen', el.root);
        const gi = node('div', 'nse-card nse-card-entry nse-card-gitem', el.gitem);
        const gib = node('div', 'nse-entry-body', gi);
        el.giPic = node('div', 'nse-thumb nse-entry-pic nse-guide-pic', gib);
        const git = node('div', 'nse-entry-text', gib);
        el.giTag = node('div', 'nse-guide-tag', git);
        el.giName = node('h2', 'nse-title nse-entry-name', git);
        el.giWhat = node('div', 'nse-entry-what', git);
        el.giWhere = node('div', 'nse-entry-where', git);
        el.giList = node('div', 'nse-entry-list nse-gitem-list', gi);
        el.giVisit = menuItem(el.giList, 'Visit Again', 'rocket', 'green');
        el.giBack = menuItem(el.giList, 'Back', 'back', 'slate');

        // One logbook entry.
        el.entry = node('section', 'nse-screen', el.root);
        const en = node('div', 'nse-card nse-card-entry', el.entry);
        const enb = node('div', 'nse-entry-body', en);
        el.entryPic = node('div', 'nse-thumb nse-entry-pic', enb);
        const ent = node('div', 'nse-entry-text', enb);
        el.entryName = node('h2', 'nse-title nse-entry-name', ent);
        el.entryWhat = node('div', 'nse-entry-what', ent);
        el.entryWhere = node('div', 'nse-entry-where', ent);
        el.entryFacts = node('div', 'nse-entry-facts', ent);
        el.entryLife = node('div', 'nse-entry-life', ent);
        el.entryList = node('div', 'nse-entry-list', en);
        el.eNext = menuItem(el.entryList, 'Next', 'fwd', 'blue');
        el.ePrev = menuItem(el.entryList, 'Previous', 'prev', 'blue');
        el.eVisit = menuItem(el.entryList, 'Visit Again', 'rocket', 'green');
        el.eBack = menuItem(el.entryList, 'Back', 'back', 'slate');

        // Settings.
        el.settings = node('section', 'nse-screen', el.root);
        el.settingsCard = card(el.settings, 'Settings');
        el.settingsCard.classList.add('nse-card-settings');
        el.settingsList = node('div', 'nse-settings-list', el.settingsCard);

        // How to play.
        el.help = node('section', 'nse-screen', el.root);
        const hpc = node('div', 'nse-card nse-card-narrow nse-card-help', el.help);
        el.helpTitle = button('nse-help-title', hpc);
        el.helpTitle.innerHTML = '<span class="nse-icon-chip">' + ICON.speaker + '</span><span>How to Play</span>';
        el.helpBody = node('div', 'nse-help-body', hpc);
        el.helpBack = menuItem(hpc, 'Back', 'back', 'slate');

        window.addEventListener('contextmenu', function (e) { if (inPlay()) e.preventDefault(); });
        window.addEventListener('resize', fit);
        try {
            window.NarbeVoiceManager.onSettingsChange(refreshSettingsValues);
            window.NarbeScanManager.subscribe(refreshSettingsValues);
        } catch (e) { /* managers missing */ }
        try { const q = NSE.Stage.quality(); if (q) q.subscribe(refreshSettingsValues); } catch (e) { /* none yet */ }
        applyMotion();
    }

    function refreshSettingsValues() {
        if (screen !== 'settings') return;
        renderSettings();
        NSE.Input.refresh(false);
    }

    function applyMotion() { if (el.root) el.root.dataset.motion = S().calm() ? 'calm' : 'full'; }

    // --- screens ------------------------------------------------------------------------------

    const CARDS = ['loading', 'error', 'menu', 'prompt', 'moons', 'scanner', 'hail', 'map', 'galaxy', 'system', 'pause', 'logbook', 'entry', 'guide', 'gpage', 'gitem', 'settings', 'help'];
    /** HUD screens (the 3D view with buttons): fly, glide, orbit, low; warp shows nothing. */
    const HUDS = ['fly', 'steer', 'glide', 'orbit', 'low'];

    function show(name, o) {
        o = o || {};
        if (o.data) data = o.data;
        const prev = screen;
        screen = name;
        CARDS.forEach(k => el[k].classList.toggle('show', k === name));
        const hud = HUDS.indexOf(name) >= 0 || name === 'prompt' || name === 'hail' || name === 'warp';
        el.hud.classList.toggle('show', hud);
        el.hud.dataset.mode = name;
        el.root.dataset.screen = name;
        // Lift the picture above whatever covers the bottom of the screen.
        // (Explore System frames its own shot between its title and its panel: no lift there.)
        NSE.Stage.setLift(HUDS.indexOf(name) >= 0 || name === 'prompt' || name === 'galaxy');
        if (name !== 'scanner') NSE.Stage.hideViewer();
        if (name === 'galaxy') renderGalaxyCard();
        if (name === 'system') renderSystem();
        if (name === 'pause') el.zViewLabel.textContent = 'View: ' + viewName();
        if (name === 'settings') { resetArmed = false; renderSettings(); }
        if (name === 'help') renderHelp();
        if (name === 'logbook') renderLogbook();
        if (name === 'entry') renderEntry();
        if (name === 'guide') renderGuide();
        if (name === 'gpage') renderGuidePage();
        if (name === 'gitem') renderGuideItem();
        if (name === 'prompt') renderPrompt();
        if (name === 'moons') renderMoons();
        if (name === 'scanner') renderScanner();
        if (name === 'hail') renderHail();
        if (name === 'map') renderMap();
        if (name === 'menu') el.mStartLabel.textContent = G().hasSave() ? 'Keep Exploring' : 'Start Exploring';
        refreshHUD();
        fit();
        NSE.Input.refresh(true, o.restore);
        const line = o.line !== undefined ? o.line : defaultLine(name);
        if (line) NSE.Input.announce(line);
        return prev;
    }

    function defaultLine(name) {
        switch (name) {
            case 'menu': return 'Space Explorer.';
            case 'pause': return 'Paused.';
            case 'settings': return 'Settings.';
            case 'help': return 'How to play. Choose the title to hear the directions.';
            case 'logbook': return logLine();
            case 'entry': return entrySpeech();
            case 'guide': return guideLine();
            case 'gpage': return guidePageLine();
            case 'gitem': return guideItemSpeech();
            case 'map': return mapLine();
            case 'moons': return 'Visit a moon. Pick one.';
            case 'system': return systemLine();
            case 'galaxy': return data.galaxy ? 'Welcome to ' + NSE.Universe.galaxyLabel(data.galaxy) + '! ' + capital(kindWords(data.galaxy)) + '. Do you want to fly in and explore?' : '';
            case 'error': return 'Space Explorer can’t start. ' + (el.errorText.textContent || '') + ' Choose Exit Game.';
            default: return '';
        }
    }

    function current() { return screen; }
    function inPlay() { return HUDS.indexOf(screen) >= 0; }

    /** Scale each card to fit the window, so nothing is cut off or scrolled. */
    function fit() {
        const sec = el[screen];
        const c = sec && sec.querySelector && sec.querySelector('.nse-card');
        if (!c) return;
        c.style.setProperty('--card-scale', '1');
        const w = c.offsetWidth, h = c.offsetHeight;
        if (!w || !h) return;
        const s = Math.min(1, (window.innerWidth - 20) / w, (window.innerHeight - 20) / h);
        c.style.setProperty('--card-scale', s.toFixed(3));
    }

    // --- HUD ---------------------------------------------------------------------------------------

    function refreshHUD() {
        const st = G().hudState ? G().hudState() : null;
        if (!st) return;
        el.infoName.textContent = st.title || '';
        el.infoSub.textContent = st.sub || '';
        if (screen === 'orbit') {
            el.oMoon.hidden = !st.moonLabel;
            el.oMoonLabel.textContent = st.moonLabel || 'Visit a Moon';
            el.oLow.hidden = !st.canFlyLow;
        }
        if (screen === 'fly') el.fExploreLabel.textContent = st.inSystem ? 'Explore System' : 'Nearby Stars';
        if (screen === 'steer') el.sSpeedLabel.textContent = 'Speed: ' + NSE.Settings.speedName();
        const v = NSE.Stage.view();
        // Also in Fly Low and on the way down and back up, so the cockpit never just disappears.
        // (Not over a whole galaxy seen from outside: that is not the view from the ship.)
        const cockpitShown = v === 'cockpit' && NSE.Stage.mode() !== 'galaxy' && (screen === 'fly' || screen === 'steer' || screen === 'glide' || screen === 'orbit' || screen === 'low' || screen === 'prompt' || screen === 'hail' || screen === 'warp');
        el.cockpit.classList.toggle('show', cockpitShown);
    }

    /** Every frame: move the target marker over whatever is being headed for or asked about. */
    function tick() {
        if (screen === 'hail') drawHail();   // the alien's face talks and blinks
        if (screen === 'system') tickPins(); // the rings follow their worlds as the camera moves
        const m = G().marker ? G().marker() : null;
        if (!m || !(inPlay() || screen === 'prompt')) { el.marker.classList.remove('show'); return; }
        const p = NSE.Stage.project(m.pos);
        if (!p.on) { el.marker.classList.remove('show'); return; }
        el.marker.classList.add('show');
        el.marker.style.transform = 'translate(' + Math.round(p.x) + 'px,' + Math.round(p.y) + 'px)';
        if (el.markerLabel.textContent !== m.name) el.markerLabel.textContent = m.name;
        el.marker.dataset.tone = m.tone || '';
    }

    let calloutTimer = null;
    /** A big word across the top of the screen (the caller speaks it too). */
    function callout(text, tone) {
        el.callout.textContent = text;
        el.callout.dataset.tone = tone || '';
        el.callout.classList.remove('show');
        void el.callout.offsetWidth;
        el.callout.classList.add('show');
        clearTimeout(calloutTimer);
        calloutTimer = setTimeout(function () { el.callout.classList.remove('show'); }, 2800);
    }

    function bounce(b) {
        if (!b) return;
        b.classList.remove('nse-bounce');
        void b.offsetWidth;
        b.classList.add('nse-bounce');
    }

    function hudItem(id, elx, speak, action, o) {
        o = o || {};
        return { id: id, el: elx, speak: speak, quiet: o.quiet, action: function () { bounce(elx); action(); } };
    }

    function pauseItem() { return { id: 'hud:pause', el: el.pauseBtn, speak: 'Pause', action: function () { G().pause(); } }; }

    function flyScannables() {
        const inSys = () => (G().hudState() || {}).inSystem;
        return [
            hudItem('fly:next', el.fNext, 'Next Stop', () => G().nextStop()),
            hudItem('fly:explore', el.fExplore, () => inSys() ? 'Explore System. Pick a world to fly to.' : 'Nearby Stars. Pick a star to fly to.', () => G().explore()),
            hudItem('fly:warp', el.fWarp, 'Warp. Opens the galaxy map.', () => G().openMap()),
            hudItem('fly:steer', el.fSteer, 'Steer', () => G().openSteer()),
            pauseItem()
        ];
    }
    function steerScannables() {
        return [
            hudItem('steer:left', el.sLeft, 'Turn Left', () => G().turn(1), { quiet: true }),
            hudItem('steer:right', el.sRight, 'Turn Right', () => G().turn(-1), { quiet: true }),
            hudItem('steer:up', el.sUp, 'Up', () => G().climb(1), { quiet: true }),
            hudItem('steer:down', el.sDown, 'Down', () => G().climb(-1), { quiet: true }),
            hudItem('steer:speed', el.sSpeed, () => 'Speed, ' + NSE.Settings.speedName(), () => G().cycleSpeed(), { quiet: true }),
            hudItem('steer:back', el.steerBack, 'Back', () => G().closeSteer()),
            pauseItem()
        ];
    }
    function glideScannables() { return [pauseItem()]; }
    function orbitScannables() {
        const st = G().hudState();
        const list = [];
        if (st.canFlyLow) list.push(hudItem('orbit:low', el.oLow, 'Fly Low', () => G().flyLow()));
        list.push(hudItem('orbit:scan', el.oScan, 'Scan', () => G().scan()));
        if (st.moonLabel) list.push(hudItem('orbit:moon', el.oMoon, st.moonLabel, () => G().moonButton()));
        list.push(hudItem('orbit:leave', el.oLeave, 'Leave Orbit', () => G().leaveOrbit()));
        list.push(pauseItem());
        return list;
    }
    function lowScannables() {
        return [
            hudItem('low:scan', el.lScan, 'Scan', () => G().scan()),
            hudItem('low:left', el.lLeft, 'Turn Left', () => G().steerLow(1), { quiet: true }),
            hudItem('low:right', el.lRight, 'Turn Right', () => G().steerLow(-1), { quiet: true }),
            hudItem('low:back', el.lBack, 'Back to Orbit', () => G().backToOrbit()),
            pauseItem()
        ];
    }
    function viewName() { return { cockpit: 'Cockpit', chase: 'Chase', wide: 'Wide' }[NSE.Stage.view()]; }

    // --- main menu -----------------------------------------------------------------------------

    function menuScannables() {
        return [
            { id: 'menu:start', el: el.mStart, speak: () => el.mStartLabel.textContent, action: () => G().startExploring() },
            { id: 'menu:log', el: el.mLog, speak: 'Logbook', action: () => openLogbook('menu') },
            { id: 'menu:help', el: el.mHelp, speak: 'How to Play', action: () => { helpFrom = 'menu'; show('help'); } },
            { id: 'menu:settings', el: el.mSettings, speak: 'Settings', action: () => { settingsFrom = 'menu'; show('settings'); } },
            { id: 'menu:exit', el: el.mExit, speak: 'Exit Game', action: () => G().exit() }
        ];
    }

    // --- prompt ------------------------------------------------------------------------------------

    function renderPrompt() {
        const o = data.obj;
        if (!o) return;
        el.promptKind.textContent = o.kind === 'star' ? (o.special === 'blackhole' ? 'A black hole!' : o.special === 'nebula' ? 'A nebula!' : o.pair ? 'Two stars!' : 'A star!') : 'A planet!';
        el.promptName.textContent = o.name;
        el.promptWhat.textContent = o.kind === 'planet' ? capital(o.label) + (o.world.rings ? ' with rings' : '') : capital(o.label);
    }
    function capital(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }
    function promptScannables() {
        return [
            { id: 'prompt:yes', el: el.pYes, speak: () => 'Yes, go to ' + (data.obj ? data.obj.name : 'it'), action: () => G().answer(true) },
            { id: 'prompt:no', el: el.pNo, speak: 'No, keep flying', action: () => G().answer(false) }
        ];
    }

    // --- moons -------------------------------------------------------------------------------------

    let moonItems = [];
    function renderMoons() {
        const p = data.planet;
        el.moonsSub.textContent = p ? p.name + ' has ' + U.plural(p.moons.length, 'moon') + '.' : '';
        el.moonList.innerHTML = '';
        moonItems = [];
        if (!p) return;
        p.moons.forEach(function (m, i) {
            const b = menuItem(el.moonList, m.name, 'moon', ['plum', 'teal', 'blue', 'help'][i % 4]);
            node('span', 'nse-menu-note', b, m.short);
            moonItems.push({ id: 'moon:' + i, el: b, speak: m.name + ', ' + m.label, action: () => G().visitMoon(i) });
        });
        const back = menuItem(el.moonList, 'Back', 'back', 'slate');
        moonItems.push({ id: 'moon:back', el: back, speak: 'Back', action: () => G().closeMoons() });
    }

    // --- scanner -----------------------------------------------------------------------------------

    function renderScanner() {
        const d = data;
        el.scanName.textContent = d.name || '';
        el.scanWhat.textContent = d.what || '';
        el.scanFacts.innerHTML = '';
        (d.lines || []).forEach(l => node('li', '', el.scanFacts, l));
        el.scanCount.textContent = d.count > 1 ? (d.index + 1) + ' of ' + d.count : '';
        el.sNext.hidden = !(d.count > 1);
        el.sNext.querySelector('.nse-menu-label').textContent = d.nextLabel || 'Next Creature';
        // The 3D view fills the viewer box once the card is laid out.
        requestAnimationFrame(function () { if (screen === 'scanner' && d.viewer) NSE.Stage.showViewer(d.viewer.kind, d.viewer.subject, el.viewerWin, d.viewer.extra); });
    }
    function scannerScannables() {
        const list = [];
        if (data.count > 1) list.push({ id: 'scan:next', el: el.sNext, speak: () => data.nextLabel || 'Next Creature', action: () => G().scanNext() });
        list.push({ id: 'scan:back', el: el.sBack, speak: 'Back', action: () => G().closeScanner() });
        return list;
    }

    // --- alien call ----------------------------------------------------------------------------------

    let hailT = 0;
    function renderHail() {
        const d = data;
        el.hailWho.textContent = d.alien ? 'One of the ' + d.alien.people : '';
        el.hailAlien.textContent = d.line ? '“' + d.line.alien + '”' : '';
        el.hailSays.textContent = d.line ? d.line.translation : '';
        el.hWave.hidden = !!d.waved;
        hailT = 0;
        drawHail();
    }
    function drawHail() {
        const d = data;
        if (!d.alien || !el.hailCanvas.getContext) return;
        const ctx = el.hailCanvas.getContext('2d');
        if (!ctx) return;
        hailT += 1 / 60;
        try { d.alien.draw(ctx, 320, 320, hailT, G().alienTalking()); } catch (e) { /* drawing is decoration */ }
    }
    function hailScannables() {
        const list = [];
        if (!data.waved) list.push({ id: 'hail:wave', el: el.hWave, speak: 'Wave Hello', action: () => G().hailWave() });
        list.push({ id: 'hail:bye', el: el.hBye, speak: 'Say Goodbye', action: () => G().hailBye() });
        return list;
    }

    // --- galaxy map ------------------------------------------------------------------------------------

    function mapLine() {
        const g = data.galaxy;
        if (!g) return 'Galaxy map.';
        return 'Galaxy map. You are in ' + NSE.Universe.galaxyLabel(g) + ', ' + kindWords(g) + '.';
    }
    function kindWords(g) { return (g.kind === 'elliptical' || g.kind === 'irregular' ? 'an ' : 'a ') + g.kind + ' galaxy with about ' + g.billions + ' billion stars'; }

    function renderMap() {
        const g = data.galaxy;
        if (!g) return;
        el.mapTitle.textContent = 'The ' + g.name + ' Galaxy';
        el.mapSub.textContent = capital(kindWords(g)) + '.';
        drawGalaxy(el.mapCanvas, g, data.shipPos);
    }

    /** A picture of the galaxy (its arms from its seed) with a You Are Here marker. */
    function drawGalaxy(cv, g, shipPos) {
        const ctx = cv.getContext && cv.getContext('2d');
        if (!ctx) return;
        const W = cv.width, H = cv.height, cx = W / 2, cy = H / 2;
        ctx.fillStyle = '#03050f';
        ctx.fillRect(0, 0, W, H);
        const r = U.rng(U.hash('map', g.seed));
        const glow = ctx.createRadialGradient(cx, cy, 4, cx, cy, W * 0.45);
        glow.addColorStop(0, g.core);
        glow.addColorStop(0.18, g.core + '88');
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, W, H);
        const R = Math.min(W, H) * 0.44;
        // The same stars, clusters, nebulae and companions as the galaxy seen from outside.
        const pts = NSE.Universe.galaxyPoints(g, 3200);
        const tilt = 0.62;
        const toHex = c => 'rgb(' + Math.round(c[0] * 255) + ',' + Math.round(c[1] * 255) + ',' + Math.round(c[2] * 255) + ')';
        (g.companions || []).forEach(function (c) {
            const cx2 = cx + Math.cos(c.a) * R * Math.min(1.05, c.dist * 0.55), cy2 = cy + Math.sin(c.a) * R * tilt * Math.min(1.05, c.dist * 0.55);
            const cg = ctx.createRadialGradient(cx2, cy2, 1, cx2, cy2, R * c.size * 0.6);
            cg.addColorStop(0, c.color);
            cg.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = cg;
            ctx.fillRect(cx2 - R, cy2 - R, R * 2, R * 2);
        });
        pts.nebulae.forEach(function (nb) {
            const nx = cx + nb.x * R, ny = cy + nb.z * R * tilt;
            const ng = ctx.createRadialGradient(nx, ny, 1, nx, ny, R * nb.size);
            ng.addColorStop(0, nb.color + 'aa');
            ng.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = ng;
            ctx.fillRect(nx - R * nb.size, ny - R * nb.size, R * nb.size * 2, R * nb.size * 2);
        });
        for (let i = 0; i < pts.n; i++) {
            const x = pts.pos[i * 3], z = pts.pos[i * 3 + 2];
            const c = [pts.col[i * 3], pts.col[i * 3 + 1], pts.col[i * 3 + 2]];
            ctx.globalAlpha = 0.9;
            ctx.fillStyle = toHex(c);
            ctx.beginPath();
            ctx.arc(cx + x * R, cy + z * R * tilt, 0.8 + (i % 5) * 0.3, 0, Math.PI * 2);
            ctx.fill();
        }
        pts.clusters.forEach(function (cl) {
            ctx.globalAlpha = 0.95;
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(cx + cl.x * R, cy + cl.z * R * tilt, 2.6, 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.globalAlpha = 1;
        // You are here: the ship's place, folded into the picture.
        if (shipPos) {
            const S = NSE.Universe.SECTOR * 40;
            const fx = Math.tanh(shipPos.x / S) * R * 0.85, fy = Math.tanh(shipPos.z / S) * R * 0.55;
            const t = (Date.now() % 1600) / 1600;
            ctx.strokeStyle = '#ffe14a';
            ctx.lineWidth = 4;
            ctx.beginPath(); ctx.arc(cx + fx, cy + fy, 10 + t * 8, 0, Math.PI * 2); ctx.stroke();
            ctx.fillStyle = '#ffe14a';
            ctx.beginPath(); ctx.arc(cx + fx, cy + fy, 6, 0, Math.PI * 2); ctx.fill();
            ctx.font = 'bold 22px "Baloo 2", sans-serif';
            ctx.fillStyle = '#ffffff';
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 5;
            const label = 'You are here';
            const lx = U.clamp(cx + fx + 16, 8, W - 150), ly = U.clamp(cy + fy - 14, 24, H - 8);
            ctx.strokeText(label, lx, ly);
            ctx.fillText(label, lx, ly);
        }
    }
    function mapScannables() {
        return [
            { id: 'map:star', el: el.gStar, speak: 'Warp to a new star', action: () => G().warp('star') },
            { id: 'map:galaxy', el: el.gGalaxy, speak: 'Warp to a new galaxy', action: () => G().warp('galaxy') },
            { id: 'map:back', el: el.gBack, speak: 'Back', action: () => G().closeMap() }
        ];
    }

    // --- a new galaxy ---------------------------------------------------------------------------------

    function renderGalaxyCard() {
        const g = data.galaxy;
        if (!g) return;
        el.galaxyName.textContent = 'The ' + g.name + ' Galaxy';
        el.galaxyWhat.textContent = capital(kindWords(g));
    }
    function galaxyScannables() {
        return [
            { id: 'galaxy:in', el: el.nIn, speak: 'Fly in', action: () => G().flyIn() },
            { id: 'galaxy:another', el: el.nOther, speak: 'Find another galaxy', action: () => G().anotherGalaxy() }
        ];
    }

    let fadeTimer = null;
    /** Fade the screen to a colour (on) or back to the picture (off). Gentle, never a flash. */
    function fade(on, color) {
        if (color) el.fade.style.background = color;
        el.fade.style.transition = '';
        el.fade.style.opacity = '';
        el.fade.classList.toggle('show', !!on);
    }
    /** A see-through haze of the sky's colour, k 0..1 (the air thickening as the ship comes down). */
    function haze(k, color) {
        if (color) el.fade.style.background = color;
        el.fade.classList.remove('show');
        el.fade.style.transition = 'opacity 120ms linear';
        el.fade.style.opacity = String(Math.max(0, Math.min(1, k)));
    }

    // --- Explore System / Nearby Stars ---------------------------------------------------------------

    let systemItems = [];
    function systemLine() {
        const d = data;
        if (d.mode === 'stars') return d.list && d.list.length ? 'Nearby stars. Pick one to fly to.' : 'No stars close by. Try Warp.';
        const sys = d.sys;
        return (d.arrived ? 'You have reached the ' : 'The ') + sys.name + ' system: ' + sysWords(sys) + '. Pick a world to fly to.';
    }
    function sysWords(sys) {
        const star = sys.kind === 'binary' ? 'two stars' : sys.kind === 'nebula' ? 'a star in a glowing nebula' : sys.stars[0].label;
        return star + (sys.planets.length ? ' with ' + U.plural(sys.planets.length, 'planet') : ' and no planets');
    }
    /** A little picture of a world or star, drawn with CSS from its colours. */
    function orb(parent, o) {
        const d = node('span', 'nse-orb', parent);
        if (o.kind === 'system' || o.kind === 'star') {
            const sys = o.sys;
            if (sys.kind === 'blackhole') { d.classList.add('nse-orb-hole'); d.style.setProperty('--glow', sys.disk.color); return d; }
            const c = sys.kind === 'nebula' ? sys.nebula.a : sys.stars[0].color;
            d.classList.add('nse-orb-star');
            d.style.background = 'radial-gradient(circle at 50% 50%, #ffffff, ' + sys.stars[0].color + ' 55%, ' + sys.stars[0].color + ')';
            d.style.setProperty('--glow', c);
            if (sys.kind === 'binary') d.classList.add('nse-orb-pair');
            return d;
        }
        const w = o.world;
        d.style.background = 'radial-gradient(circle at 35% 30%, ' + w.palette.high + ', ' + w.palette.mid + ' 45%, ' + (w.seaLevel > 0.3 ? w.palette.sea : w.palette.low) + ' 80%, #05060f 100%)';
        if (w.rings) node('span', 'nse-orb-ring', d);
        return d;
    }
    /**
     * One ring in the picture over a world (or a star system), with its name under it. It is a
     * button, so the scan highlights it where it is (and a mouse or finger can choose it too).
     */
    let pins = [], youPin = null, capFor = null;
    function makePin(name) {
        const b = button('nse-pin', el.pins);
        b.setAttribute('aria-label', name);
        node('span', 'nse-pin-ring', b);
        node('span', 'nse-pin-name', b, name);
        return b;
    }
    /** How big a star's ring is, before the camera's distance: round its glow (or both stars of a pair). */
    function starPinRadius(o) {
        const sys = o.sys;
        if (sys.kind === 'blackhole') return sys.disk.outer;
        return o.pair ? o.radius + sys.stars[1].radius : o.radius * 1.4;
    }

    function renderSystem() {
        const d = data;
        el.pins.innerHTML = '';
        el.pins.style.opacity = '0';
        el.pins._op = 0;
        systemItems = [];
        pins = [];
        if (d.mode === 'stars') {
            el.surveyName.textContent = 'Nearby Stars';
            el.surveySub.textContent = (d.list || []).length ? 'The nearest star systems' : 'No stars close by';
            (d.list || []).forEach(function (it, i) {
                const sys = it.sys;
                const pin = makePin(sys.name);
                pins.push({ el: pin, pos: sys.pos, r: 0, id: null });
                systemItems.push({
                    id: 'sys:s' + i, el: pin, speak: 'The ' + sys.name + ' system: ' + sysWords(sys) + '. ' + capital(it.far) + '.',
                    action: () => G().chooseStar(i),
                    cap: { orb: { kind: 'system', sys: sys }, name: 'The ' + sys.name + ' System', what: capital(sysWords(sys)), tags: capital(it.far) }
                });
            });
        } else {
            const sys = d.sys;
            el.surveyName.textContent = 'The ' + sys.name + ' System';
            el.surveySub.textContent = capital(sysWords(sys));
            (d.objs || []).forEach(function (o, i) {
                const tags = [];
                const words = [o.name + ', ' + o.label];
                if (o.kind === 'planet') {
                    const w = o.world;
                    if (w.moons.length) { tags.push(U.plural(w.moons.length, 'moon')); words.push(U.plural(w.moons.length, 'moon')); }
                    if (w.civ) { tags.push('People'); words.push('people live here'); }
                    else if (w.life) { tags.push('Life'); words.push('something lives here'); }
                    if (w.rare) { tags.push('Rare!'); words.push('something rare here: ' + (NSE.Universe.RARE_NAMES[w.rare] || 'a rare sight').toLowerCase()); }
                } else words.push('the star');
                if (NSE.Logbook.get(o.id)) { tags.push('Visited'); words.push('visited'); }
                const pin = makePin(o.name);
                const star = o.kind === 'star';
                pins.push({ el: pin, pos: o.pos, r: star ? starPinRadius(o) : (o.world.rings ? o.world.rings.outer : o.radius * 1.1), id: star ? (o.special === 'blackhole' ? null : 'star') : o.id, planet: !star });
                systemItems.push({
                    id: 'sys:w' + i, el: pin, speak: words.join(', ') + '.', action: () => G().chooseWorld(i),
                    cap: { orb: o, name: o.name, what: capital(star ? o.label : o.label + (o.world.rings ? ' with rings' : '')), tags: tags.join(' · ') }
                });
            });
        }
        // You are here: a marker on the ship, not a choice.
        youPin = node('div', 'nse-pin-you', el.pins);
        node('span', 'nse-pin-name', youPin, 'You');
        systemItems.push({ id: 'sys:back', el: el.systemBack, speak: 'Back', action: () => G().closeExplore(), cap: { back: true } });
        showCaption(null);
        capFor = null;
    }

    /** The bottom panel: what the highlighted ring is (or how to choose, before anything is). */
    function showCaption(item) {
        const c = item && item.cap;
        el.capOrb.innerHTML = '';
        if (!c || c.back) {
            const none = !c && data.mode === 'stars' && !(data.list || []).length;
            el.cap.dataset.kind = c ? 'back' : 'none';
            el.capName.textContent = c ? 'Back' : none ? 'No stars close by' : data.mode === 'stars' ? 'Pick a star to fly to' : 'Pick a world to fly to';
            el.capWhat.textContent = c ? 'Back to flying' : none ? 'Try Warp, from the flying controls' : 'The ship flies there by itself';
            el.capTags.textContent = '';
            return;
        }
        el.cap.dataset.kind = 'world';
        orb(el.capOrb, c.orb);
        el.capName.textContent = c.name;
        el.capWhat.textContent = c.what;
        el.capTags.textContent = c.tags || '';
    }

    /** Every frame on Explore: keep each ring over its world, sized to it, and the panel on the highlight. */
    function tickPins() {
        const op = U.clamp((NSE.Stage.surveyAmount() - 0.35) / 0.45, 0, 1);
        if (el.pins._op !== op) { el.pins._op = op; el.pins.style.opacity = op.toFixed(2); }
        for (let i = 0; i < pins.length; i++) {
            const p = pins[i];
            const pos = p.planet ? NSE.Space.shownPos(p.id) || p.pos : p.pos;     // planets spread out in the shot
            placePin(p.el, pos, p.r * (p.id ? NSE.Space.shownScale(p.id) : 1), 26);
        }
        if (youPin) {
            placePin(youPin, G().shipPos(), 0, 11);
            // Left out of the shot (outside the planets): never half-hidden behind the bottom panel.
            const under = !youPin._off && youPin._cy > window.innerHeight * 0.8;
            if (youPin._under !== under) { youPin._under = under; youPin.classList.toggle('off', under || youPin._off); }
        }
        quietNames();
        const id = (NSE.Input.state() || {}).id || null;
        if (id !== capFor) { capFor = id; showCaption(systemItems.find(x => x.id === id) || null); }
    }

    function placePin(pinEl, pos, r, min) {
        const p = NSE.Stage.projectSphere(pos, r);
        const off = !p.on;
        if (pinEl._off !== off) { pinEl._off = off; pinEl.classList.toggle('off', off); }
        if (off) return;
        const R = Math.max(min, Math.round(p.r * 1.15 + 6));
        if (pinEl._r !== R) { pinEl._r = R; pinEl.style.width = pinEl.style.height = (2 * R) + 'px'; }
        pinEl._cx = p.x; pinEl._cy = p.y;
        pinEl.style.transform = 'translate(' + Math.round(p.x - R) + 'px,' + Math.round(p.y - R) + 'px)';
    }

    /**
     * A name that would land on another world's ring or name stays hidden until its own world is
     * highlighted (the highlighted name always shows, big). Bigger worlds keep their names first.
     */
    function quietNames() {
        const shown = pins.filter(p => !p.el._off && p.el._r);
        const lit = p => p.el.classList.contains('nse-focus') || p.el.classList.contains('nse-focus-full');
        const width = p => {
            if (!p.lw) { const n = p.el.querySelector('.nse-pin-name'); p.lw = (n && n.offsetWidth) || n.textContent.length * 11; }
            return p.lw;
        };
        shown.sort((a, b) => (lit(b) - lit(a)) || (b.el._r - a.el._r));
        const taken = [];
        const hit = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
        shown.forEach(function (p) {
            const big = lit(p), cx = p.el._cx, cy = p.el._cy, R = p.el._r;
            const lw = width(p) * (big ? 1.75 : 1) + (big ? 32 : 4);
            const box = { x0: cx - lw / 2, x1: cx + lw / 2, y0: cy + R + (big ? 18 : 4), y1: cy + R + (big ? 66 : 28) };
            // (A ring is round: test against the square inside it, not the one around it.)
            const clash = !big && (taken.some(t => hit(t, box)) || shown.some(q => q !== p && hit(box, { x0: q.el._cx - q.el._r * 0.8, x1: q.el._cx + q.el._r * 0.8, y0: q.el._cy - q.el._r * 0.8, y1: q.el._cy + q.el._r * 0.8 })));
            if (p.el._quiet !== clash) { p.el._quiet = clash; p.el.classList.toggle('nse-pin-quiet', clash); }
            if (!clash) taken.push(box);
        });
    }

    // --- pause ----------------------------------------------------------------------------------------

    function pauseScannables() {
        return [
            { id: 'pause:continue', el: el.zContinue, speak: 'Continue', action: () => G().resume() },
            {
                id: 'pause:view', el: el.zView, speak: () => 'View, ' + viewName(),
                action: () => { G().switchView(); el.zViewLabel.textContent = 'View: ' + viewName(); }
            },
            { id: 'pause:log', el: el.zLog, speak: 'Logbook', action: () => openLogbook('pause') },
            { id: 'pause:settings', el: el.zSettings, speak: 'Settings', action: () => { settingsFrom = 'pause'; show('settings'); } },
            { id: 'pause:help', el: el.zHelp, speak: 'How to Play', action: () => { helpFrom = 'pause'; show('help'); } },
            {
                id: 'pause:need', el: el.zNeed, quiet: true, speak: 'I need help. Choose this to call a helper.',
                action: function () {
                    const message = 'I need help, please! I need help, please!';
                    const fallback = function () { return NSE.Voice.speak(message); };
                    if (window.NarbeCommunicationSpeech) window.NarbeCommunicationSpeech.help(fallback, message);
                    else fallback();
                }
            },
            { id: 'pause:menu', el: el.zMenu, speak: 'Main Menu', action: () => G().toMenu() },
            { id: 'pause:exit', el: el.zExit, speak: 'Exit Game', action: () => G().exit() }
        ];
    }

    // --- logbook ------------------------------------------------------------------------------------------

    function openLogbook(from) { logFrom = from; logPage = 0; show('logbook'); }
    function logPages() { return Math.max(1, Math.ceil(NSE.Logbook.list().length / PER_PAGE)); }
    function logLine() {
        const n = NSE.Logbook.list().length;
        if (!n) return 'Logbook. Nothing here yet. Go into orbit somewhere and it is written here by itself. The Field Guide is here too.';
        const st = NSE.Logbook.stats(), g = NSE.Guide.stats();
        return 'Logbook. ' + U.plural(st.places, 'place') + ' visited' + (st.creatures ? ', ' + U.plural(st.creatures, 'creature') + ' scanned' : '') + '. Field Guide, ' + g.found + ' of ' + g.total + ' found.' + (logPages() > 1 ? ' Page ' + (logPage + 1) + ' of ' + logPages() + '.' : '');
    }

    let logItems = [];
    function renderLogbook() {
        const all = NSE.Logbook.list();
        logPage = Math.max(0, Math.min(logPages() - 1, logPage));
        const st = NSE.Logbook.stats();
        el.logStats.textContent = all.length ? [U.plural(st.planets, 'planet'), U.plural(st.moons, 'moon'), U.plural(st.stars, 'star'), U.plural(st.creatures, 'creature'), U.plural(st.galaxies, 'galaxy', 'galaxies')].join(' · ') : '';
        el.logEmpty.hidden = all.length > 0;
        el.logGrid.hidden = !all.length;
        el.logGrid.innerHTML = '';
        el.logPageLabel.textContent = logPages() > 1 ? 'Page ' + (logPage + 1) + ' of ' + logPages() : '';
        logItems = [];
        const slice = all.slice(logPage * PER_PAGE, logPage * PER_PAGE + PER_PAGE);
        for (let i = 0; i < PER_PAGE; i++) {
            const e = slice[i];
            if (!e) { node('div', 'nse-tile nse-tile-empty', el.logGrid); continue; }
            const t = button('nse-tile', el.logGrid);
            const pic = node('span', 'nse-thumb', t);
            if (e.picture) { const img = node('img', '', pic); img.src = e.picture; img.alt = ''; }
            else { pic.classList.add('waiting'); pic.innerHTML = e.kind === 'star' ? ICON.star : e.kind === 'moon' ? ICON.moon : ICON.planet; }
            const cap = node('span', 'nse-tile-cap', t);
            node('span', 'nse-tile-name', cap, e.name);
            node('span', 'nse-tile-count', cap, e.short + (e.creatures.length ? ' · ' + U.plural(e.creatures.length, 'creature') : ''));
            const index = logPage * PER_PAGE + i;
            logItems.push({ id: 'log:' + e.id, el: t, speak: e.name + ', ' + e.label + '.', action: () => { entryIndex = index; show('entry'); } });
        }
        el.logMore.hidden = logPages() < 2;
    }
    function logScannables() {
        const list = logItems.slice();
        if (logPages() > 1) list.push({ id: 'log:more', el: el.logMore, speak: () => 'More pages. Page ' + ((logPage + 1) % logPages() + 1) + ' of ' + logPages(), action: () => { logPage = (logPage + 1) % logPages(); show('logbook'); } });
        list.push({ id: 'log:guide', el: el.logGuide, speak: () => { const g = NSE.Guide.stats(); return 'Field Guide. ' + g.found + ' of ' + g.total + ' found.'; }, action: () => show('guide') });
        list.push({ id: 'log:back', el: el.logBack, speak: 'Back', action: () => show(logFrom === 'pause' ? 'pause' : 'menu') });
        return list;
    }

    // --- the Field Guide ---------------------------------------------------------------------------------

    let guideCat = 0, guidePage = 0, guideItemId = null;
    const GPER = 9;
    const pics = new Map();       // picture cache (portraits are drawn once)

    function gcats() { return NSE.Guide.cats(); }
    function gcat() { const c = gcats(); return c[Math.max(0, Math.min(c.length - 1, guideCat))]; }
    function gpages() { return Math.max(1, Math.ceil(gcat().items.length / GPER)); }

    function guideLine() {
        const g = NSE.Guide.stats();
        return 'Field Guide. You have found ' + g.found + ' of ' + g.total + '.' + (g.animals || g.plants ? ' ' + U.plural(g.animals, 'kind') + ' of animal and ' + U.plural(g.plants, 'kind') + ' of plant identified.' : ' Explore, scan and fly low to fill it in.');
    }
    function guidePageLine() {
        const c = gcat();
        return c.name + '. ' + NSE.Guide.count(c) + ' of ' + c.items.length + ' found.' + (gpages() > 1 ? ' Page ' + (guidePage + 1) + ' of ' + gpages() + '.' : '');
    }

    function capsuleWords(g) {
        return g.found + ' of ' + g.total + ' found' + (g.animals || g.plants ? ' · ' + U.plural(g.animals, 'animal') + ' and ' + U.plural(g.plants, 'plant') + ' identified' : '');
    }

    let guideItems = [];
    function renderGuide() {
        const g = NSE.Guide.stats();
        el.guideStats.textContent = capsuleWords(g);
        el.guideCats.innerHTML = '';
        guideItems = [];
        gcats().forEach(function (c, i) {
            const n = NSE.Guide.count(c), all = c.items.length;
            const b = button('nse-guide-cat', el.guideCats);
            b.dataset.tone = c.tone;
            node('span', 'nse-icon-chip', b).innerHTML = ICON[c.icon] || ICON.star;
            const t = node('span', 'nse-guide-cat-text', b);
            node('span', 'nse-guide-cat-name', t, c.name);
            node('span', 'nse-guide-cat-count', t, n + ' of ' + all);
            const bar = node('span', 'nse-guide-bar', t);
            node('span', 'nse-guide-bar-fill', bar).style.width = Math.round(n / Math.max(1, all) * 100) + '%';
            guideItems.push({ id: 'guide:' + c.id, el: b, speak: c.name + ', ' + n + ' of ' + all + ' found', action: () => { guideCat = i; guidePage = 0; show('gpage'); } });
        });
        guideItems.push({ id: 'guide:back', el: el.guideBack, speak: 'Back', action: () => show('logbook', { restore: 'log:guide' }) });
    }

    /** The world (planet or moon) a find was made on, rebuilt from its id (worlds come from seeds). */
    function worldAt(id) {
        try { const f = NSE.Universe.findById(id); return f ? (f.moon || f.planet || null) : null; } catch (e) { return null; }
    }

    /** A CSS planet from a remembered palette (or a dark silhouette). */
    function lookOrb(parent, look, unknown) {
        const d = node('span', 'nse-orb nse-guide-orb', parent);
        if (unknown || !look) { d.classList.add('nse-orb-unknown'); node('span', 'nse-orb-q', d, '?'); return d; }
        if (look.pal) {
            const p = look.pal;
            d.style.background = 'radial-gradient(circle at 35% 30%, ' + p.high + ', ' + p.mid + ' 45%, ' + (look.sea > 0.3 ? p.sea : p.low) + ' 80%, #05060f 100%)';
            if (look.rings) node('span', 'nse-orb-ring', d);
        } else if (look.kind === 'blackhole') {
            d.classList.add('nse-orb-hole'); d.style.setProperty('--glow', look.disk || '#ffb070');
        } else if (look.color) {
            d.classList.add('nse-orb-star');
            d.style.background = 'radial-gradient(circle at 50% 50%, #ffffff, ' + look.color + ' 55%, ' + look.color + ')';
            d.style.setProperty('--glow', look.neb || look.color);
            if (look.kind === 'binary') d.classList.add('nse-orb-pair');
            if (look.kind === 'nebula') d.classList.add('nse-orb-neb');
        }
        return d;
    }

    /** An image (portrait or logbook photo) into a picture box; false if there is none. */
    function putImg(box, url) {
        if (!url) return false;
        const img = node('img', '', box);
        img.src = url;
        img.alt = '';
        return true;
    }

    /** A creature or plant portrait (cached): its model, or its silhouette if not found yet. */
    function portraitOf(kind, spec, silhouette) {
        if (!spec || !NSE.Stage.portrait) return null;
        const key = kind + ':' + (spec.seed >>> 0) + ':' + (spec.variant || spec.kind || '') + (silhouette ? ':s' : '');
        if (pics.has(key)) return pics.get(key);
        const url = NSE.Stage.portrait(kind === 'plant' ? 'plant' : 'creature', spec, { silhouette: silhouette });
        pics.set(key, url);
        return url;
    }

    /**
     * The picture for a find: a logbook photo of where it was found, a portrait of the creature or
     * plant, a coloured planet or star, or its icon. Not found yet: a dark silhouette.
     */
    function guidePicture(box, cat, it) {
        box.innerHTML = '';
        box.classList.remove('waiting', 'unfound', 'portrait');
        const rec = NSE.Guide.get(it.id);
        const found = !!rec;
        if (!found) box.classList.add('unfound');
        const photo = rec && rec.where && rec.where.id && NSE.Logbook.get(rec.where.id);
        try {
            if (cat.id === 'animals' || cat.id === 'plants' || it.id === 'rare:golden' || it.id === 'rare:giant') {
                const isPlant = cat.id === 'plants';
                let spec = null;
                if (found && rec.look && rec.look.seed !== undefined) {
                    const w = worldAt(rec.where && rec.where.id);
                    spec = isPlant ? (NSE.Flora && w ? NSE.Flora.spec(rec.look.seed, w) : null) : (NSE.Creatures && w ? NSE.Creatures.spec(rec.look.seed, w) : null);
                } else if (!found && (cat.id === 'animals' || cat.id === 'plants')) {
                    const M = isPlant ? NSE.Flora : NSE.Creatures;
                    spec = M && M.example ? M.example(it.kind) : null;
                }
                if (spec && putImg(box, portraitOf(isPlant ? 'plant' : 'creature', spec, !found))) { box.classList.add('portrait'); return; }
            }
            if (cat.id === 'worlds' || cat.id === 'lands') {
                if (found && photo && photo.picture && putImg(box, photo.picture)) return;
                box.classList.add('waiting');
                lookOrb(box, rec && rec.look, !found);
                return;
            }
            if (cat.id === 'stars') { box.classList.add('waiting'); lookOrb(box, rec && rec.look, !found); return; }
            if (found && photo && photo.picture && it.id !== 'rare:comet' && it.id !== 'rare:whales' && it.id !== 'rare:rainbowsky' && putImg(box, photo.picture)) return;
        } catch (e) { box.innerHTML = ''; }
        box.classList.add('waiting');
        box.innerHTML = ICON[FIND_ICON[it.id] || (cat.id === 'plants' ? 'leaf' : cat.id === 'animals' ? 'paw' : cat.icon)] || ICON.star;
        if (!found) node('span', 'nse-orb-q nse-thumb-q', box, '?');
    }

    function whereLine(rec) {
        if (!rec || !rec.where) return '';
        const w = rec.where;
        return 'Found at ' + w.name + (w.galaxyName ? ' in the ' + w.galaxyName + ' Galaxy' : '') + '.';
    }

    let gpageItems = [];
    function renderGuidePage() {
        const c = gcat();
        guidePage = Math.max(0, Math.min(gpages() - 1, guidePage));
        el.gpTitle.textContent = c.name;
        el.gpPage.textContent = gpages() > 1 ? 'Page ' + (guidePage + 1) + ' of ' + gpages() : '';
        el.gpStats.textContent = NSE.Guide.count(c) + ' of ' + c.items.length + ' found';
        el.gpGrid.innerHTML = '';
        gpageItems = [];
        const slice = c.items.slice(guidePage * GPER, guidePage * GPER + GPER);
        for (let i = 0; i < GPER; i++) {
            const it = slice[i];
            if (!it) { node('div', 'nse-tile nse-tile-empty', el.gpGrid); continue; }
            const rec = NSE.Guide.get(it.id);
            const t = button('nse-tile nse-guide-tile' + (rec ? '' : ' nse-tile-unfound'), el.gpGrid);
            guidePicture(node('span', 'nse-thumb', t), c, it);
            const cap = node('span', 'nse-tile-cap', t);
            node('span', 'nse-tile-name', cap, it.name);
            node('span', 'nse-tile-count', cap, rec ? (rec.where ? 'Found at ' + rec.where.name : 'Found') : it.hint || 'Not found yet');
            gpageItems.push({
                id: 'gp:' + it.id, el: t,
                speak: rec ? it.name + '. ' + whereLine(rec) : 'Not found yet: ' + it.name + '. ' + (it.hint || ''),
                action: rec ? () => { guideItemId = it.id; show('gitem'); } : () => NSE.Input.announce(it.name + ': not found yet. ' + (it.hint || 'Keep exploring!'))
            });
        }
        el.gpMore.hidden = gpages() < 2;
    }
    function gpageScannables() {
        const list = gpageItems.slice();
        if (gpages() > 1) list.push({ id: 'gp:more', el: el.gpMore, speak: () => 'More pages. Page ' + ((guidePage + 1) % gpages() + 1) + ' of ' + gpages(), action: () => { guidePage = (guidePage + 1) % gpages(); show('gpage', { restore: 'gp:more' }); } });
        list.push({ id: 'gp:back', el: el.gpBack, speak: 'Back', action: () => show('guide', { restore: 'guide:' + gcat().id }) });
        return list;
    }

    function guideItemSpeech() {
        const f = NSE.Guide.item(guideItemId), rec = NSE.Guide.get(guideItemId);
        if (!f) return '';
        return f.item.name + '. ' + (f.item.hint || '') + ' ' + whereLine(rec);
    }
    function renderGuideItem() {
        const f = NSE.Guide.item(guideItemId), rec = NSE.Guide.get(guideItemId);
        if (!f) return;
        guidePicture(el.giPic, f.cat, f.item);
        el.giTag.textContent = f.cat.name;
        el.giName.textContent = f.item.name;
        el.giWhat.textContent = f.item.hint || '';
        el.giWhere.textContent = whereLine(rec);
        el.giVisit.hidden = !(rec && rec.where && rec.where.id);
    }
    function gitemScannables() {
        const rec = NSE.Guide.get(guideItemId), list = [];
        if (rec && rec.where && rec.where.id) list.push({ id: 'gi:visit', el: el.giVisit, speak: () => 'Visit ' + rec.where.name + ' again', action: () => G().visitAgain(rec.where.id) });
        list.push({ id: 'gi:back', el: el.giBack, speak: 'Back', action: () => show('gpage', { restore: 'gp:' + guideItemId }) });
        return list;
    }

    function entry() { return NSE.Logbook.list()[entryIndex] || null; }
    function whereWords(e) {
        const g = e.galaxyName ? ' in the ' + e.galaxyName + ' Galaxy' : '';
        if (e.kind === 'moon') return 'A moon of ' + e.parentName + g + '.';
        if (e.kind === 'planet') return 'In the ' + e.systemName + ' system' + g + '.';
        return (e.galaxyName ? 'In the ' + e.galaxyName + ' Galaxy' : '') + '.';
    }
    function entrySpeech() {
        const e = entry();
        if (!e) return '';
        let s = e.name + '. ' + capital(e.label) + '. ' + whereWords(e) + ' ';
        (e.facts || []).forEach(f => { if (f.say) s += f.say + ' '; });
        if (e.creatures.length) s += 'Creatures scanned: ' + e.creatures.join(', ') + '. ';
        if (e.metAliens && e.civ) s += 'You met the ' + e.civ + '. ';
        if (e.visits > 1) s += 'Visited ' + e.visits + ' times.';
        return s;
    }
    function renderEntry() {
        const e = entry();
        if (!e) return;
        el.entryPic.innerHTML = '';
        el.entryPic.classList.toggle('waiting', !e.picture);
        if (e.picture) { const img = node('img', '', el.entryPic); img.src = e.picture; img.alt = ''; }
        else el.entryPic.innerHTML = e.kind === 'star' ? ICON.star : ICON.planet;
        el.entryName.textContent = e.name;
        el.entryWhat.textContent = capital(e.label);
        el.entryWhere.textContent = whereWords(e);
        el.entryFacts.innerHTML = '';
        (e.facts || []).forEach(f => {
            const chip = node('span', 'nse-chip', el.entryFacts);
            node('b', '', chip, f.k);
            node('span', '', chip, f.v);
        });
        el.entryLife.textContent = e.creatures.length ? 'Creatures: ' + e.creatures.join(', ') : (e.metAliens && e.civ ? '' : '');
        if (e.metAliens && e.civ) el.entryLife.textContent += (el.entryLife.textContent ? ' · ' : '') + 'Met the ' + e.civ;
        const n = NSE.Logbook.list().length;
        el.eNext.hidden = el.ePrev.hidden = n < 2;
    }
    function entryScannables() {
        const n = NSE.Logbook.list().length;
        const list = [];
        if (n > 1) {
            list.push({ id: 'entry:next', el: el.eNext, speak: 'Next', action: () => { entryIndex = (entryIndex + 1) % n; show('entry', { restore: 'entry:next' }); } });
            list.push({ id: 'entry:prev', el: el.ePrev, speak: 'Previous', action: () => { entryIndex = (entryIndex - 1 + n) % n; show('entry', { restore: 'entry:prev' }); } });
        }
        list.push({ id: 'entry:visit', el: el.eVisit, speak: () => 'Visit ' + (entry() ? entry().name : 'it') + ' again', action: () => { const e = entry(); if (e) G().visitAgain(e.id); } });
        list.push({ id: 'entry:back', el: el.eBack, speak: 'Back', action: () => { logPage = Math.floor(entryIndex / PER_PAGE); show('logbook'); } });
        return list;
    }

    // --- how to play ---------------------------------------------------------------------------------

    function autoOn() { try { return !!window.NarbeScanManager.getSettings().autoScan; } catch (e) { return false; } }
    /** Printed AND read aloud from the same lines, so they never drift apart. */
    function helpLines() {
        const lines = [
            'Your ship flies by itself. You are exploring a universe of galaxies, stars, planets and moons, and somewhere new is always ahead.',
            '*Next Stop* points the ship at the nearest place you have not been yet. *Explore System* flies the camera up over the whole system: the star and each planet light up in turn, so pick one and the ship flies there. In deep space it shows the *Nearby Stars*.',
            '*Steer* opens *Turn Left*, *Turn Right*, *Up*, *Down* and *Speed*, if you want to fly yourself.',
            'When you come near a star or planet you are asked: *Do you want to go here?* Choose *Yes* to fly into orbit, or *No* to keep flying.',
            'In orbit: *Fly Low* skims over the surface, *Scan* looks closer at creatures and the world, *Visit a Moon* flies to one of its moons, and *Leave Orbit* flies on.',
            '*View*, in the Pause menu, changes the camera: the *Cockpit*, *Chase* behind the ship, or a *Wide* view for sightseeing.',
            '*Warp* opens the galaxy map. From there, jump to a new star or a whole new galaxy!',
            'A few planets have whole civilisations, with cities and amazing technology. Sometimes their people call you up to say hello. Or to tell you to go away.',
            'Everywhere you visit goes in your *Logbook*, with a picture and every creature you scanned. You can visit any of them again.',
            'The *Field Guide*, in the Logbook, collects every kind of world, landscape, star, animal, plant and civilisation you find. *Scan* animals and plants to identify them. Some sights are rare: comets, star whales, golden creatures and more. Can you find them all?'
        ];
        lines.push(autoOn() ? 'The highlight moves by itself. *Enter* chooses.'
            : '*Tap Space* to move the highlight and *hold Space* to go back. *Enter* chooses.');
        lines.push('*Pause* is always there, at the top right. There is no score, no timer and nothing to lose.');
        return lines;
    }
    function renderHelp() {
        el.helpBody.innerHTML = helpLines().map(l => '<p>' + l.replace(/\*([^*]+)\*/g, '<b>$1</b>') + '</p>').join('');
    }
    /** Read the directions while holding the scanner still; any press stops it. */
    function readAloud() {
        const text = helpLines().map(l => l.replace(/\*/g, '')).join(' ');
        const ticket = NSE.Voice.speak(text);
        if (!ticket) return;
        let released = false;
        const release = function () {
            if (released) return;
            released = true;
            clearTimeout(timer);
            document.removeEventListener('keydown', onPress, true);
            document.removeEventListener('pointerdown', onPress, true);
            NSE.Input.setEnabled(true);
        };
        const onPress = function () { NSE.Voice.cancel(); release(); };
        NSE.Input.setEnabled(false);
        const timer = setTimeout(release, Math.ceil(text.length / 13 * 1000) + 800);
        Promise.resolve(ticket.finished).then(function (r) { if (r && r.reason !== 'timeout') release(); });
        document.addEventListener('keydown', onPress, true);
        document.addEventListener('pointerdown', onPress, true);
    }
    function helpScannables() {
        return [
            { id: 'help:read', el: el.helpTitle, speak: 'How to Play', action: readAloud },
            { id: 'help:back', el: el.helpBack, speak: 'Back', action: () => { NSE.Voice.cancel(); show(helpFrom); } }
        ];
    }

    // --- settings ---------------------------------------------------------------------------------------

    function vm() { return window.NarbeVoiceManager; }
    function sm() { return window.NarbeScanManager; }
    function ttsOn() { try { return !!vm().getSettings().ttsEnabled; } catch (e) { return false; } }
    function voiceName() { try { return vm().getVoiceDisplayName(vm().getCurrentVoice()); } catch (e) { return 'Default'; } }
    function speedLabel() { try { return (sm().getScanInterval() / 1000) + ' s'; } catch (e) { return '2 s'; } }
    function graphicsLabel() {
        try { const q = NSE.Stage.quality(); return q ? q.label().replace(/^Graphics quality:\s*/, '') : 'High'; } catch (e) { return 'High'; }
    }

    let settingsCache = [];
    /** Hub canonical order: TTS, Voice, game options, Auto Scan, Scan Speed, Sound, Reset, Back. */
    function settingsItems() {
        const s = S();
        return [
            { id: 'tts', label: 'Text to Speech', value: () => onOff(ttsOn()), action: () => { try { vm().toggleTTS(); } catch (e) { /* none */ } },
                after: () => ttsOn() ? 'Text to speech on. Everything is read aloud.' : '' },
            { id: 'voice', label: 'Voice', value: voiceName, action: () => { try { vm().cycleVoice(); } catch (e) { /* none */ } },
                after: () => 'Voice, ' + voiceName() + '. This is the voice you will hear.' },
            { id: 'flight', label: 'Flight Speed', value: () => s.speedName(), action: () => G().setSpeedIndex((s.get('speedIndex') + 1) % s.SPEEDS.length),
                after: () => 'Flight speed, ' + s.speedName() + '. How fast the ship flies by itself.' },
            { id: 'hails', label: 'Alien Calls', value: () => s.hailsName(), action: () => s.cycleHails(),
                after: () => 'Alien calls, ' + s.hailsName() + '. ' + ({ often: 'Aliens call you up a lot.', sometimes: 'Aliens call you up now and then.', off: 'Aliens never call.' })[s.get('hails')] },
            { id: 'facts', label: 'Spoken Facts', value: () => onOff(s.get('facts')), action: () => s.toggle('facts'),
                after: () => s.get('facts') ? 'Spoken facts on. Arriving somewhere, you hear about it.' : 'Spoken facts off. Arriving somewhere, you only hear its name.' },
            { id: 'motion', label: 'Motion', value: () => s.motionName(), action: () => { s.cycleMotion(); G().applyMotion(); applyMotion(); },
                after: () => s.calm() ? 'Motion, calm. Gentler turns, no leaning and softer warps.' : 'Motion, full.' },
            { id: 'graphics', label: 'Graphics', value: graphicsLabel, action: () => { try { const q = NSE.Stage.quality(); if (q) q.cycle(); } catch (e) { /* none */ } },
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
            { id: 'sound', label: 'Sound Effects', value: () => onOff(s.get('sound')), action: () => { s.toggle('sound'); NSE.Sound.sample(); },
                after: () => s.get('sound') ? 'Sound effects on.' : 'Sound effects off.' },
            { id: 'volume', label: 'Volume', value: () => s.volumeName(), action: () => { s.cycle('volumeIndex', s.VOLUMES.length); NSE.Sound.sample(); },
                after: () => 'Volume, ' + s.volumeName() + '.' },
            { id: 'music', label: 'Music', value: () => s.musicName(), action: () => s.cycle('musicIndex', s.LEVELS.length),
                after: () => s.musicVolume() > 0 ? 'Music, ' + s.musicName() + '. Calm space music.' : 'Music off.' },
            { id: 'reset', label: 'Reset Logbook', danger: true,
                value: () => resetArmed ? 'Choose again to erase' : (NSE.Logbook.list().length || NSE.Guide.stats().found ? U.plural(NSE.Logbook.list().length, 'place') + ', ' + U.plural(NSE.Guide.stats().found, 'find') : 'Empty'),
                action: () => {
                    if (!resetArmed) { resetArmed = true; return; }
                    resetArmed = false;
                    NSE.Logbook.clear();
                    NSE.Guide.clear();
                    pics.clear();
                },
                after: () => resetArmed ? 'Are you sure? This erases every place in your logbook and everything in your field guide. Choose Reset Logbook again to erase it, or move on to keep it.' : 'Logbook and field guide erased.' },
            { id: 'back', label: '← Back', value: () => '', nav: true, action: () => show(settingsFrom === 'pause' ? 'pause' : 'menu') }
        ];
    }

    function renderSettings() {
        settingsCache = settingsItems();
        el.settingsList.style.setProperty('--rows', String(Math.ceil(settingsCache.length / 2)));
        el.settingsList.innerHTML = '';
        settingsCache.forEach(function (item) {
            const b = button('nse-row' + (item.nav ? ' nse-row-nav' : '') + (item.danger ? ' nse-row-danger' : '') + (item.danger && resetArmed ? ' nse-row-armed' : ''), el.settingsList);
            b.dataset.setting = item.id;
            node('span', 'nse-row-label', b, item.label);
            const v = node('span', 'nse-row-value', b);
            const sw = item.swatch && item.swatch();
            if (sw) { const dot = node('span', 'nse-swatch', v); dot.style.background = sw; }
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
                onFocus: function () {
                    // Moving off an armed Reset disarms it (a stray scan never erases).
                    if (resetArmed && item.id !== 'reset') { resetArmed = false; renderSettings(); NSE.Input.refresh(false); }
                },
                action: function () {
                    item.action();
                    if (item.nav || screen !== 'settings') return;
                    renderSettings();
                    NSE.Input.refresh(false);
                    const fresh = settingsCache.find(x => x.id === item.id);
                    const line = fresh && fresh.after && fresh.after();
                    if (line) NSE.Input.announce(line);
                }
            };
        });
    }

    function errorScannables() { return [{ id: 'error:exit', el: el.errorExit, speak: 'Exit Game', action: () => G().exit() }]; }

    function scannables() {
        switch (screen) {
            case 'menu': return menuScannables();
            case 'fly': return flyScannables();
            case 'glide': return glideScannables();
            case 'steer': return steerScannables();
            case 'system': return systemItems;
            case 'orbit': return orbitScannables();
            case 'low': return lowScannables();
            case 'prompt': return promptScannables();
            case 'moons': return moonItems;
            case 'scanner': return scannerScannables();
            case 'hail': return hailScannables();
            case 'map': return mapScannables();
            case 'galaxy': return galaxyScannables();
            case 'pause': return pauseScannables();
            case 'logbook': return logScannables();
            case 'entry': return entryScannables();
            case 'guide': return guideItems;
            case 'gpage': return gpageScannables();
            case 'gitem': return gitemScannables();
            case 'settings': return settingsScannables();
            case 'help': return helpScannables();
            case 'error': return errorScannables();
            default: return [];
        }
    }

    let scanHost = null;
    /** Where the shared "Parked" badge lives, outside the choices. */
    function scanContext() {
        if (!scanHost) scanHost = node('div', 'nse-scan-status');
        const parent = HUDS.indexOf(screen) >= 0 ? el.hud : el[screen] && el[screen].querySelector && el[screen].querySelector('.nse-card');
        if (parent && scanHost.parentElement !== parent) parent.prepend(scanHost);
        const key = screen === 'logbook' ? 'logbook:' + logPage : screen === 'entry' ? 'entry:' + entryIndex
            : screen === 'gpage' ? 'gpage:' + guideCat + ':' + guidePage : screen === 'gitem' ? 'gitem:' + guideItemId : screen;
        return { key: key, host: scanHost || el.root };
    }

    function showError(message) { el.errorText.textContent = message; show('error'); }

    return {
        build: build,
        show: show,
        current: current,
        inPlay: inPlay,
        scannables: scannables,
        scanContext: scanContext,
        refreshHUD: refreshHUD,
        tick: tick,
        callout: callout,
        openLogbook: openLogbook,
        showError: showError,
        data: function () { return data; },
        setData: function (d) { data = d; },
        rerender: function () { if (screen === 'hail') renderHail(); if (screen === 'scanner') renderScanner(); },
        setLoading: function (text) { if (el.loadingText) el.loadingText.textContent = text; },
        stageEl: function () { return el.stage; },
        drawGalaxy: drawGalaxy,
        fade: fade,
        haze: haze
    };
})();
