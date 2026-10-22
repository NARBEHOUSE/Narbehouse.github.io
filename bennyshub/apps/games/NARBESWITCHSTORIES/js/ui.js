/**
 * Switch Stories - the DOM interface on top of the scene.
 *
 * Screens: library, filters, lengths, story, settings, pause, help. Every menu is a plain,
 * dark card, scaled to fit the window so nothing ever scrolls. Plain and calm
 * on purpose, as in Glow Pop: many players have CVI.
 *
 * The library shows big cover tiles (a few per screen, with More Stories when
 * there are more), then How to Play, Settings and Exit Game.
 *
 * Settings are grouped into short pages (Reading, Pages, How It Looks,
 * Switches, Sound & Voice) so the rows stay big. How It Looks has a small
 * live picture of the story screen, so a caregiver sees each change.
 *
 * Scanning reads each choice simply: just what the button says, plus a
 * setting's current value. What a choice means is said after it is chosen.
 */

window.NSS = window.NSS || {};

NSS.UI = (function () {
    'use strict';

    let screen = 'library';
    let settingsFrom = 'library';
    let page = 'top';
    let libraryPage = 0;
    let librarySize = 3;
    let libraryTag = '';
    let libraryNewest = false;
    let libraryLength = '';
    let filterPage = 0;
    let filterSize = 6;
    const PAGE_RANGES = [
        { key: '1-5', label: '1–5 pages', speak: '1 to 5 pages', min: 1, max: 5 },
        { key: '6-10', label: '6–10 pages', speak: '6 to 10 pages', min: 6, max: 10 },
        { key: '11-20', label: '11–20 pages', speak: '11 to 20 pages', min: 11, max: 20 },
        { key: '21-plus', label: '21+ pages', speak: '21 or more pages', min: 21, max: Infinity }
    ];
    const el = {};

    function S() { return NSS.Settings; }
    const C = NSS.CONFIG;
    const displayScale = () => Math.max(1, Math.min(window.innerWidth / 1440, window.innerHeight / 900));
    function scaleDisplay() { el.root.style.setProperty('--display-scale', displayScale()); }
    function scanMode() { return S().get('pauseMode') === 'scan'; }

    /** A page to show in the How It Looks preview. */
    const SAMPLE_PAGE = { text: 'This is Rocky.', action: 'wag', object: null, bg: '#ffc9dc' };

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

    function onOff(v) { return v ? 'On' : 'Off'; }

    const ICON = (function () {
        const svg = body => '<svg class="nss-icon" viewBox="0 0 48 48" aria-hidden="true" focusable="false">' + body + '</svg>';
        let teeth = '';
        for (let i = 0; i < 8; i++) {
            const a = Math.PI / 4 * i;
            teeth += '<line x1="' + (24 + Math.cos(a) * 13.5).toFixed(1) + '" y1="' + (24 + Math.sin(a) * 13.5).toFixed(1) +
                '" x2="' + (24 + Math.cos(a) * 18.5).toFixed(1) + '" y2="' + (24 + Math.sin(a) * 18.5).toFixed(1) + '" stroke-width="5.5"/>';
        }
        return {
            help: svg('<circle cx="24" cy="24" r="17"/><path d="M19 19a5 5 0 1 1 5 7v2"/><circle cx="24" cy="34" r="1.8" class="nss-dot"/>'),
            settings: svg('<circle cx="24" cy="24" r="14"/><circle cx="24" cy="24" r="5.5"/>' + teeth),
            exit: svg('<path d="M28 10H12v28h16"/><path d="M24 24h14"/><path d="M32 18l6 6-6 6"/>'),
            play: svg('<circle cx="24" cy="24" r="17"/><path d="M20 17l12 7-12 7z"/>'),
            back: svg('<path d="M30 12 18 24l12 12"/>'),
            more: svg('<path d="M18 12l12 12-12 12"/>'),
            restart: svg('<path d="M12 24a12 12 0 1 0 4-9"/><path d="M12 9v7h7"/>'),
            book: svg('<path d="M24 14c-4-3-10-4-16-3v24c6-1 12 0 16 3 4-3 10-4 16-3V11c-6-1-12 0-16 3z"/><path d="M24 14v24"/>'),
            books: svg('<rect x="8" y="10" width="8" height="28" rx="2"/><rect x="19" y="10" width="8" height="28" rx="2"/><path d="M31 12l7-2 6 26-7 2z"/>'),
            filter: svg('<path d="M7 11h34L28 26v10l-8 5V26z"/>'),
            pages: svg('<path d="M10 10h18l10 10v18H10z"/><path d="M28 10v10h10"/>'),
            speaker: svg('<path d="M9 19h7l9-7v24l-9-7H9z"/><path d="M32 18a9 9 0 0 1 0 12"/><path d="M37 13a16 16 0 0 1 0 22"/>'),
            eye: svg('<path d="M4 24s7-12 20-12 20 12 20 12-7 12-20 12S4 24 4 24z"/><circle cx="24" cy="24" r="6"/>'),
            switch: svg('<ellipse cx="24" cy="33" rx="17" ry="7"/><path d="M11 32v-6a13 8 0 0 1 26 0v6"/>'),
            pause: '<svg class="nss-icon" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><rect x="13" y="10" width="8" height="28" rx="3" class="nss-fill"/><rect x="27" y="10" width="8" height="28" rx="3" class="nss-fill"/></svg>'
        };
    })();

    function menuItem(parent, label, icon) {
        const b = button('nss-menu-item', parent);
        node('span', 'nss-icon-chip', b).innerHTML = ICON[icon] || '';
        node('span', 'nss-menu-label', b, label);
        return b;
    }

    function card(screenEl, title, sub) {
        const c = node('div', 'nss-card', screenEl);
        if (title) node('h2', 'nss-title', c, title);
        if (sub !== undefined) node('p', 'nss-sub', c, sub);
        return c;
    }

    /** A canvas sized to its box, for still pictures drawn by the scene. */
    function sizedContext(canvas) {
        const w = canvas.clientWidth, h = canvas.clientHeight;
        if (!w || !h) return null;
        const visualScale = Math.max(1, canvas.getBoundingClientRect().width / w);
        const dpr = Math.min(window.devicePixelRatio || 1, C.maxPixelRatio) * visualScale;
        const pw = Math.round(w * dpr), ph = Math.round(h * dpr);
        if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; }
        const c = canvas.getContext('2d');
        c.setTransform(dpr, 0, 0, dpr, 0, 0);
        return { c: c, w: w, h: h };
    }

    // --- build -----------------------------------------------------------------------

    function build() {
        el.root = document.getElementById('nss');
        scaleDisplay();
        el.stage = node('canvas', 'nss-stage', el.root);
        el.stage.setAttribute('aria-hidden', 'true');
        buildMenuBackground();

        // The story: the words at the bottom, over the picture.
        el.story = node('section', 'nss-story', el.root);
        el.pageBtn = button('nss-page-btn', el.story);          // Scan to Pause: the page itself
        el.pageBtn.setAttribute('aria-label', 'Story');
        el.textbox = node('div', 'nss-textbox', el.story);
        el.textbox.setAttribute('aria-live', 'polite');
        el.pageNo = node('div', 'nss-pageno', el.textbox);
        el.words = node('p', 'nss-words', el.textbox);
        el.hint = node('p', 'nss-hint', el.textbox);
        el.credits = node('div', 'nss-credits', el.textbox);
        el.credits.hidden = true;
        // Attribution is for a helper using a mouse, outside the switch scan.
        el.credits.addEventListener('pointerdown', e => e.stopPropagation());
        el.credits.addEventListener('click', function (e) {
            const a = e.target.closest('a');
            if (!a) return;
            e.stopPropagation();
            if (window.electronAPI && window.electronAPI.openExternal) {
                e.preventDefault();
                Promise.resolve(window.electronAPI.openExternal(a.href)).catch(err => console.warn('Could not open credit link:', err));
            }
            a.blur();
        });
        el.endChoices = node('div', 'nss-end-choices', el.textbox);
        el.againBtn = menuItem(el.endChoices, 'Read Again', 'restart');
        el.libraryBtn = menuItem(el.endChoices, 'Pick a Different Story', 'books');
        el.pauseBtn = button('nss-pause-btn', el.story);
        el.pauseBtn.setAttribute('aria-label', 'Pause');
        el.ring = node('span', 'nss-ring', el.pauseBtn);
        node('span', 'nss-pause-icon', el.pauseBtn).innerHTML = ICON.pause;
        node('span', 'nss-pause-label', el.pauseBtn, 'Pause');
        // How to get to the menu, in both looks. Hidden in Scan to Pause, where Pause is scanned.
        el.pauseTip = node('span', 'nss-pause-tip', el.story, 'Hold Enter or tap Pause to bring up the menu.');
        el.pauseTip.setAttribute('aria-hidden', 'true');

        // The library.
        el.library = node('section', 'nss-screen nss-screen-library', el.root);
        const lc = node('div', 'nss-card nss-card-library', el.library);
        const head = node('div', 'nss-brand', lc);
        node('span', 'nss-logo', head).innerHTML = ICON.book;
        node('h1', 'nss-brand-title', head, 'Switch Stories');
        const intro = node('p', 'nss-library-intro', lc);
        node('span', '', intro, 'New stories every month. Books created and adapted for switches,');
        node('br', '', intro);
        node('span', '', intro, 'with cause and effect animations in every story.');
        const browseHeader = node('div', 'nss-library-header', lc);
        const browse = node('div', 'nss-library-browse nss-library-filters', browseHeader);
        el.filterBtn = menuItem(browse, 'Filter Stories', 'filter');
        el.clearFilter = menuItem(browse, 'Show All', 'books');
        el.librarySub = node('p', 'nss-sub', browseHeader, 'Choose a story.');
        el.librarySub.setAttribute('aria-live', 'polite');
        el.tiles = node('div', 'nss-tiles', lc);
        el.libraryEmpty = node('p', 'nss-sub', lc, 'No stories match this filter. Choose another filter or show all stories.');
        el.libraryPaging = node('div', 'nss-library-browse nss-library-paging', lc);
        el.more = menuItem(el.libraryPaging, 'More Stories', 'more');
        el.more.classList.add('nss-more');
        node('p', 'nss-library-note', lc, 'Choose by interest and reading support. Page counts include title and ending pages.');
        el.libraryUtil = node('div', 'nss-util', lc);
        menuItem(el.libraryUtil, 'How to Play', 'help').dataset.menu = 'help';
        menuItem(el.libraryUtil, 'Settings', 'settings').dataset.menu = 'settings';
        // The standalone copy (opened from a file, outside the hub) has no hub to go back to.
        if (!NSS.STANDALONE) menuItem(el.libraryUtil, 'Exit Game', 'exit').dataset.menu = 'exit';
        else el.libraryUtil.style.gridTemplateColumns = 'repeat(2, minmax(0, 1fr))';

        el.filters = node('section', 'nss-screen', el.root);
        const fc = card(el.filters, 'Filter Stories', 'Browse by newest, page count, or tag.');
        fc.classList.add('nss-card-filters');
        el.filterStatus = node('p', 'nss-filter-status', fc);
        el.filterChoices = node('div', 'nss-filter-choices', fc);
        const filterNav = node('div', 'nss-filter-navigation', fc);
        el.filterMore = menuItem(filterNav, 'More Tags', 'more');
        el.filterMore.classList.add('nss-filter-more');
        el.filterBack = menuItem(filterNav, 'Back to Stories', 'back');

        el.lengths = node('section', 'nss-screen', el.root);
        const lengthsCard = card(el.lengths, 'By Page Count', 'Page counts include title and ending pages.');
        lengthsCard.classList.add('nss-card-filters');
        el.lengthStatus = node('p', 'nss-filter-status', lengthsCard);
        el.lengthChoices = node('div', 'nss-filter-choices nss-page-ranges', lengthsCard);
        const lengthNav = node('div', 'nss-filter-navigation', lengthsCard);
        el.lengthBack = menuItem(lengthNav, 'Back to Filters', 'back');

        // Settings: one card, redrawn for each page.
        el.settings = node('section', 'nss-screen', el.root);
        el.settingsCard = node('div', 'nss-card nss-card-settings', el.settings);
        el.settingsTitle = node('h2', 'nss-title', el.settingsCard);
        el.settingsBody = node('div', 'nss-settings-body', el.settingsCard);
        el.settingsList = node('div', 'nss-settings-list', el.settingsBody);
        el.preview = node('div', 'nss-preview', el.settingsBody);
        el.previewPic = node('canvas', 'nss-preview-pic', el.preview);
        el.previewPic.setAttribute('aria-hidden', 'true');

        // Pause.
        el.pause = node('section', 'nss-screen', el.root);
        const pc = card(el.pause, 'Paused');
        pc.classList.add('nss-card-narrow');
        el.pauseList = node('div', 'nss-list', pc);
        PAUSE_ITEMS.forEach(function (m, i) { menuItem(el.pauseList, m.label, m.icon).dataset.pause = String(i); });

        // How to play.
        el.help = node('section', 'nss-screen', el.root);
        const hc = node('div', 'nss-card nss-card-narrow', el.help);
        el.helpTitle = button('nss-help-title', hc);
        el.helpTitle.innerHTML = '<span class="nss-icon-chip">' + ICON.speaker + '</span><span>How to Play</span>';
        el.helpBody = node('div', 'nss-help-body', hc);
        el.helpBack = menuItem(hc, 'Back', 'back');

        // A tap anywhere on the story counts as a press. Buttons in the scan
        // handle their own clicks.
        el.story.addEventListener('pointerdown', function (e) {
            if (screen !== 'story' || e.button > 0 || !NSS.Input.isFreePlay()) return;
            if (e.target.closest && e.target.closest('button, a, .nss-credits')) return;
            e.preventDefault();
            NSS.Story.press();
        });
        // Two ways to the menu, both always there: a helper clicks or taps the
        // on-screen Pause button, and the switch user holds Enter (with the
        // filling ring). In Scan to Pause, Pause is also a scan item.
        el.pauseBtn.addEventListener('click', function (e) {
            if (screen !== 'story') return;
            // In Scan to Pause, Pause is a scan item and the scan handles its click
            // - except on the end choices, where Pause is not one of the choices.
            if (!NSS.Input.isFreePlay() && !NSS.Story.isChoosing()) return;
            e.preventDefault();
            NSS.Game.pause();
        });
        window.addEventListener('contextmenu', function (e) { if (screen === 'story') e.preventDefault(); });

        window.addEventListener('resize', function () {
            scaleDisplay();
            if (screen === 'library') {
                const focusedId = NSS.Input.state().id;
                renderLibrary();
                NSS.Input.refresh(false, focusedId);
            }
            if (screen === 'filters') {
                const focusedId = NSS.Input.state().id;
                renderFilters();
                NSS.Input.refresh(false, focusedId);
            }
            if (screen === 'settings') sizePreview();
            placePageButton();
            fit();
            paintPictures();
        });
        // Page text, font size and ending choices can all change caption height.
        // Keep the scan target in the clear picture area after each reflow.
        new ResizeObserver(placePageButton).observe(el.textbox, { box: 'border-box' });
        try {
            window.NarbeVoiceManager.onSettingsChange(refreshSettingsValues);
            window.NarbeScanManager.subscribe(refreshSettingsValues);
        } catch (e) { /* managers missing */ }
        applyLook();
    }

    /**
     * The menus' picture: a storybook forest behind the library, Settings and
     * How to Play (not Pause, which shows the story it paused). It holds still
     * (moving it made the user dizzy); a few soft fireflies rise and fade to
     * catch the player's eye. It only shows in the Picture Book look, and only
     * once the picture loads; Simple High Contrast menus are plain black.
     */
    function buildMenuBackground() {
        const bg = el.menuBg = node('div', 'nss-menu-bg', el.root);
        bg.setAttribute('aria-hidden', 'true');
        const pic = node('img', 'nss-menu-pic', bg);
        pic.alt = '';
        pic.onload = function () { bg.classList.add('ready'); };
        pic.onerror = function () { bg.classList.remove('ready'); };
        pic.src = C.libraryBackground;
        // Spread along the sides and the bottom, mostly clear of the card.
        for (let i = 0; i < C.fireflies; i++) {
            const f = node('span', 'nss-firefly', bg);
            const side = i % 3;     // left, right, bottom
            const x = side === 0 ? 3 + (i * 7) % 16 : side === 1 ? 81 + (i * 5) % 16 : 22 + (i * 13) % 56;
            const y = side === 2 ? 82 + (i * 3) % 12 : 30 + (i * 11) % 60;
            f.style.setProperty('--x', x + '%');
            f.style.setProperty('--y', y + '%');
            f.style.setProperty('--dx', ((i % 2 ? 1 : -1) * (2 + i % 4)) + 'vw');
            f.style.setProperty('--d', (9 + (i * 7) % 7) + 's');
            f.style.setProperty('--delay', (-(i * 1.7) % 12).toFixed(1) + 's');
        }
    }

    function refreshSettingsValues() {
        if (screen !== 'settings') return;
        renderSettings();
        NSS.Input.refresh(false);
    }

    /** The Look and Text Size settings, on the story screen. */
    function applyLook() {
        el.root.classList.toggle('cvi', S().cvi());
        el.root.classList.toggle('xl', S().is('textSize', 'xl'));
    }

    // --- screens ----------------------------------------------------------------------

    function show(name) {
        screen = name;
        ['library', 'filters', 'lengths', 'story', 'settings', 'pause', 'help'].forEach(function (k) { el[k].classList.toggle('show', k === name); });
        el.root.dataset.screen = name;
        el.root.dataset.pauseMode = S().get('pauseMode');
        el.root.classList.toggle('story-open', NSS.Story.active());
        applyLook();

        if (name === 'settings') { openPage('top'); return; }
        if (name === 'help') renderHelp();
        if (name === 'library') renderLibrary();
        if (name === 'filters') renderFilters();
        if (name === 'lengths') renderLengths();
        if (name === 'story') placePageButton();

        fit();
        NSS.Input.refresh(true);
        paintPictures();

        const line = {
            library: librarySummary() + '. Choose a story.',
            filters: 'Filter Stories. Browse by newest, page count, or tag, or show all stories.',
            lengths: 'By Page Count. Choose how many pages. Counts include title and ending pages.',
            pause: 'Paused.',
            help: 'How to play. Choose the title to hear the directions.'
        }[name];
        if (line) NSS.Input.announce(line);
    }

    function current() { return screen; }

    /** Scale the card to fit the window, so nothing is ever cut off or scrolled. */
    function fit() {
        const sec = el[screen];
        const c = sec && sec.querySelector && sec.querySelector('.nss-card');
        if (!c) return;
        c.style.setProperty('--card-scale', '1');
        const w = c.offsetWidth, h = c.offsetHeight;
        if (!w || !h) return;
        const s = Math.min(displayScale(), (window.innerWidth - 16) / w, (window.innerHeight - 16) / h);
        c.style.setProperty('--card-scale', s.toFixed(3));
    }

    function holdRing(p) {
        p = Math.max(0, Math.min(1, p || 0));
        el.ring.style.setProperty('--p', p.toFixed(3));
        el.pauseBtn.classList.toggle('holding', p > 0);
    }

    /** Still pictures (cover tiles, settings preview) are drawn when they change, not every frame. */
    function paintPictures() {
        requestAnimationFrame(function () {
            if (screen === 'library') {
                el.tiles.querySelectorAll('.nss-tile').forEach(function (t) {
                    const story = NSS.Library.get(t.dataset.story);
                    const s = story && sizedContext(t.querySelector('.nss-pic'));
                    if (s) NSS.Scene.paintStill(s.c, s.w, s.h, story.pages[0], { cover: true });
                });
            } else if (screen === 'settings' && page === 'look') {
                const s = sizedContext(el.previewPic);
                const first = NSS.Library.all()[0];
                if (s) NSS.Scene.paintPreview(s.c, s.w, s.h, first && first.pages[1] ? first.pages[1] : SAMPLE_PAGE);
            }
        });
    }

    // --- library ---------------------------------------------------------------------

    function storyCount(n) { return n + (n === 1 ? ' story' : ' stories'); }

    function inPageRange(story, range) { return story.pageCount >= range.min && story.pageCount <= range.max; }
    function hasLibraryFilter() { return !!(libraryTag || libraryNewest || libraryLength); }

    function filteredStories() {
        const range = PAGE_RANGES.find(r => r.key === libraryLength);
        const stories = NSS.Library.all().filter(story =>
            (!libraryTag || story.tags.some(tag => tag.toLowerCase() === libraryTag)) && (!range || inPageRange(story, range)));
        if (libraryNewest) stories.sort((a, b) => b.availableOn.localeCompare(a.availableOn));
        return stories;
    }

    function filterTags() {
        const tags = new Map();
        NSS.Library.all().forEach(story => story.tags.forEach(label => {
            const key = label.toLowerCase();
            if (!tags.has(key)) tags.set(key, { key: key, label: label, count: 0 });
            tags.get(key).count++;
        }));
        return Array.from(tags.values()).sort((a, b) => a.label.localeCompare(b.label));
    }

    function librarySummary() {
        const tag = filterTags().find(t => t.key === libraryTag);
        const range = PAGE_RANGES.find(r => r.key === libraryLength);
        return (range ? range.label : libraryNewest ? 'Newest' : tag ? tag.label : 'All stories') + ' · ' + storyCount(filteredStories().length);
    }

    function libraryCapacity() {
        if (window.innerWidth <= 620 || window.innerHeight < 600) return 1;
        if (window.innerWidth < 1000) return Math.min(C.storiesPerScreen, 2);
        return Math.min(C.storiesPerScreen, window.innerWidth >= 1200 && window.innerHeight >= 900 ? 6 : 3);
    }

    function libraryPages() { return Math.max(1, Math.ceil(filteredStories().length / librarySize)); }

    function storiesOnScreen() {
        const all = filteredStories();
        libraryPage = Math.min(libraryPage, libraryPages() - 1);
        return all.slice(libraryPage * librarySize, (libraryPage + 1) * librarySize);
    }

    function renderLibrary() {
        const nextSize = libraryCapacity();
        libraryPage = Math.floor(libraryPage * librarySize / nextSize);
        librarySize = nextSize;
        const list = storiesOnScreen();
        el.tiles.innerHTML = '';
        el.library.classList.toggle('nss-library-single', librarySize === 1);
        el.library.classList.toggle('nss-library-grid', list.length > 3);
        el.tiles.style.setProperty('--tiles', String(Math.max(1, Math.min(3, list.length))));
        list.forEach(function (story) {
            const t = button('nss-tile', el.tiles);
            t.dataset.story = story.id;
            t.setAttribute('aria-label', story.title);
            node('canvas', 'nss-pic', t).setAttribute('aria-hidden', 'true');
            const copy = node('span', 'nss-tile-copy', t);
            node('span', 'nss-tile-label', copy, story.title);
            const description = node('span', 'nss-tile-description', copy, story.description);
            description.id = 'description-' + story.id;
            const badges = node('span', 'nss-story-tags', copy);
            badges.id = 'tags-' + story.id;
            node('span', 'nss-story-tag nss-page-count', badges, story.pageCount + (story.pageCount === 1 ? ' page' : ' pages'));
            story.tags.forEach(tag => {
                const reading = tag.toLowerCase() === story.readingTag.toLowerCase();
                const badge = node('span', 'nss-story-tag' + (reading ? ' nss-reading-tag' : ''), badges, tag);
                if (reading) badge.title = 'Reading support: ' + tag;
            });
            t.setAttribute('aria-describedby', [description.id, badges.id].join(' '));
        });
        const none = !NSS.Library.all().length;
        el.librarySub.textContent = none ? 'No stories yet.' : librarySummary() +
            (libraryPages() > 1 ? ' · Page ' + (libraryPage + 1) + ' of ' + libraryPages() : '');
        el.libraryEmpty.hidden = none || list.length > 0;
        el.more.style.display = libraryPages() > 1 ? '' : 'none';
        el.libraryPaging.hidden = libraryPages() <= 1;
        el.clearFilter.style.display = hasLibraryFilter() ? '' : 'none';
        el.filterBtn.querySelector('.nss-menu-label').textContent = hasLibraryFilter() ? 'Change Filter' : 'Filter Stories';
    }

    function chooseLibraryFilter(options) {
        const next = options || {};
        libraryTag = next.tag || '';
        libraryNewest = !!next.newest;
        libraryLength = next.length || '';
        libraryPage = 0;
        show('library');
    }

    function renderFilters() {
        const nextSize = window.innerHeight < 600 ? 2 : 6;
        filterPage = Math.floor(filterPage * filterSize / nextSize);
        filterSize = nextSize;
        const tags = filterTags();
        const pages = Math.max(1, Math.ceil(tags.length / filterSize));
        filterPage = Math.min(filterPage, pages - 1);
        el.filterStatus.textContent = 'Showing: ' + librarySummary() + (pages > 1 ? ' · Tags ' + (filterPage + 1) + ' of ' + pages : '');
        el.filterChoices.innerHTML = '';
        [{ key: '', label: 'All Stories', count: NSS.Library.all().length },
            { key: null, label: 'Newest', count: NSS.Library.all().length },
            { pageCounts: true, label: 'By Page Count' }]
            .concat(tags.slice(filterPage * filterSize, (filterPage + 1) * filterSize))
            .forEach(tag => {
                const b = button('nss-menu-item nss-filter-choice', el.filterChoices);
                const newest = tag.key === null, pageCounts = !!tag.pageCounts;
                const selected = pageCounts ? !!libraryLength : newest ? libraryNewest : !libraryNewest && !libraryLength && tag.key === libraryTag;
                if (pageCounts) b.dataset.pageCounts = 'true';
                else if (newest) b.dataset.sort = 'newest';
                else b.dataset.tag = tag.key;
                b.setAttribute('aria-pressed', String(selected));
                b.setAttribute('aria-label', tag.label + '. ' + (pageCounts ? 'Choose a page range' : storyCount(tag.count)) + (selected ? '. Selected.' : '.'));
                const label = node('span', 'nss-menu-label', b, tag.label);
                if (selected) node('span', 'nss-filter-selected', label, 'Selected');
                node('span', 'nss-filter-count', b, pageCounts ? 'Choose ›' : storyCount(tag.count));
            });
        el.filterMore.style.display = pages > 1 ? '' : 'none';
    }

    function filterScannables() {
        const list = Array.from(el.filterChoices.children).map(b => ({
            id: b.dataset.pageCounts ? 'filter:page-count' : b.dataset.sort === 'newest' ? 'filter:newest' : 'filter:tag:' + b.dataset.tag, el: b,
            speak: b.getAttribute('aria-label'),
            action: function () {
                if (b.dataset.pageCounts) show('lengths');
                else chooseLibraryFilter({ tag: b.dataset.tag, newest: b.dataset.sort === 'newest' });
            }
        }));
        if (filterTags().length > filterSize) list.push({
            id: 'filter:more', el: el.filterMore, speak: 'More Tags',
            action: function () {
                filterPage = (filterPage + 1) % Math.ceil(filterTags().length / filterSize);
                renderFilters(); fit(); NSS.Input.refresh(true);
                NSS.Input.announce('More tags. ' + el.filterStatus.textContent);
            }
        });
        list.push({ id: 'filter:back', el: el.filterBack, speak: 'Back to Stories', action: function () {
            show('library'); NSS.Input.refresh(true, 'library:filter');
        } });
        return list;
    }

    function renderLengths() {
        el.lengthStatus.textContent = 'Showing: ' + librarySummary();
        el.lengthChoices.innerHTML = '';
        PAGE_RANGES.forEach(range => {
            const count = NSS.Library.all().filter(story => inPageRange(story, range)).length;
            const selected = libraryLength === range.key;
            const b = button('nss-menu-item nss-filter-choice', el.lengthChoices);
            b.dataset.range = range.key;
            b.setAttribute('aria-pressed', String(selected));
            b.setAttribute('aria-label', range.speak + '. ' + storyCount(count) + (selected ? '. Selected.' : '.'));
            const label = node('span', 'nss-menu-label', b, range.label);
            if (selected) node('span', 'nss-filter-selected', label, 'Selected');
            node('span', 'nss-filter-count', b, storyCount(count));
        });
    }

    function lengthScannables() {
        const list = Array.from(el.lengthChoices.children).map(b => ({
            id: 'length:' + b.dataset.range, el: b, speak: b.getAttribute('aria-label'),
            action: function () { chooseLibraryFilter({ length: b.dataset.range }); }
        }));
        list.push({ id: 'length:back', el: el.lengthBack, speak: 'Back to Filters', action: function () {
            show('filters'); NSS.Input.refresh(true, 'filter:page-count');
        } });
        return list;
    }

    function libraryScannables() {
        const list = [{ id: 'library:filter', el: el.filterBtn, speak: hasLibraryFilter() ? 'Change Filter' : 'Filter Stories',
            action: function () { filterPage = 0; show('filters'); } }];
        if (hasLibraryFilter()) list.push({ id: 'library:clear', el: el.clearFilter, speak: 'Show All Stories', action: function () { chooseLibraryFilter(); } });
        storiesOnScreen().forEach(function (story) {
            list.push({
                id: 'library:' + story.id,
                el: el.tiles.querySelector('[data-story="' + CSS.escape(story.id) + '"]'),
                speak: story.title,
                action: function () { NSS.Game.openStory(story.id); }
            });
        });
        if (libraryPages() > 1) {
            list.push({
                id: 'library:more', el: el.more, speak: 'More Stories',
                action: function () {
                    libraryPage = (libraryPage + 1) % libraryPages();
                    renderLibrary();
                    fit();
                    NSS.Input.refresh(true);
                    paintPictures();
                    NSS.Input.announce(el.librarySub.textContent + '. ' + storiesOnScreen().map(s => s.title).join('. ') + '.');
                }
            });
        }
        return list.concat([
            { id: 'library:help', el: el.libraryUtil.querySelector('[data-menu="help"]'), speak: 'How to Play', action: function () { show('help'); } },
            { id: 'library:settings', el: el.libraryUtil.querySelector('[data-menu="settings"]'), speak: 'Settings', action: function () { settingsFrom = 'library'; show('settings'); } },
            { id: 'library:exit', el: el.libraryUtil.querySelector('[data-menu="exit"]'), speak: 'Exit Game', action: function () { NSS.Game.exit(); } }
        ]);
    }

    // --- the story screen ---------------------------------------------------------------

    /** Put a page's words on screen. */
    function setWords(text) { el.words.textContent = text; }

    function setCredits(credits) {
        el.credits.replaceChildren();
        el.credits.hidden = !credits;
        if (!credits) return;
        node('span', '', el.credits, credits.text + ' ');
        credits.links.forEach(function (link, i) {
            if (i) el.credits.appendChild(document.createTextNode(' · '));
            const a = node('a', '', el.credits, link.label);
            a.href = link.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
            a.tabIndex = -1; a.dataset.scanIgnore = 'true';
        });
    }

    function setHint(text) { el.hint.textContent = text || ''; }
    function setPageNo(text) {
        el.pageNo.textContent = text || '';
        el.textbox.classList.toggle('numbered', !!text);
    }
    function fadeWords(on) { el.textbox.classList.toggle('fade', !!on); }

    /** Read Again and Pick a Different Story, after The End. */
    function showEndChoices(on) {
        el.textbox.classList.toggle('choosing', !!on);
        el.story.classList.toggle('choosing', !!on);
        placePageButton();
    }

    /** Foreground action space above the caption. Backgrounds fill the viewport. */
    let lastPictureHeight = 0;
    function pictureHeight() {
        // While a menu covers the story, its words are hidden: keep the last height.
        if (el.textbox.offsetParent !== null) lastPictureHeight = Math.max(80, el.textbox.offsetTop - 18);
        return lastPictureHeight || Math.max(80, window.innerHeight * 0.7 - 10);
    }

    // Short landscape screens have room beside Pause, rather than underneath it.
    let lastPictureWidth = 0;
    let lastPictureControls = [];
    function pictureControls() {
        const controls = [el.pauseBtn, el.pauseTip].filter(control => control.offsetParent !== null);
        if (controls.length) lastPictureControls = controls.map(control => {
            const r = control.getBoundingClientRect();
            return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
        });
        return lastPictureControls;
    }
    function pictureWidth() {
        if (window.innerHeight > 500 || window.innerWidth <= window.innerHeight) return window.innerWidth;
        const controls = pictureControls();
        if (controls.length) lastPictureWidth = Math.max(80,
            Math.min.apply(null, controls.map(control => control.left)) - 12);
        return Math.min(window.innerWidth, lastPictureWidth || window.innerWidth);
    }

    /** In Scan to Pause, the page itself is a choice: an outline around the picture. */
    function placePageButton() {
        const h = pictureHeight();
        el.pageBtn.style.height = Math.max(60, h - 12) + 'px';
    }

    function storyScannables() {
        if (NSS.Story.isChoosing()) {
            return [
                { id: 'end:again', el: el.againBtn, speak: 'Read Again', action: function () { NSS.Story.readAgain(); } },
                { id: 'end:library', el: el.libraryBtn, speak: 'Pick a Different Story', action: function () { NSS.Game.toLibrary(); } }
            ];
        }
        if (!scanMode()) return [];
        return [
            { id: 'story:page', el: el.pageBtn, speak: 'Story', action: function () { NSS.Story.press(); } },
            { id: 'story:pause', el: el.pauseBtn, speak: 'Pause', action: function () { NSS.Game.pause(); } }
        ];
    }

    // --- pause ------------------------------------------------------------------------

    const PAUSE_ITEMS = [
        { label: 'Continue', icon: 'play', action: function () { NSS.Game.resume(); } },
        { label: 'Start Over', icon: 'restart', action: function () { NSS.Game.startOver(); } },
        { label: 'Settings', icon: 'settings', action: function () { settingsFrom = 'pause'; show('settings'); } },
        { label: 'How to Play', icon: 'help', action: function () { show('help'); } },
        { label: 'Story Library', icon: 'books', action: function () { NSS.Game.toLibrary(); } },
        { label: 'Exit Game', icon: 'exit', hub: true, action: function () { NSS.Game.exit(); } }
    ].filter(function (m) { return !(m.hub && NSS.STANDALONE); });

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
        const lines = ['Choose a story. Its title is read, and a press turns to the first page.'];
        if (scanMode()) {
            lines.push(auto ? 'In the story, the highlight moves between the *Story* and *Pause* by itself. *Enter* on the *Story* is a press.'
                            : 'In the story, *Space* moves the highlight between the *Story* and *Pause*. *Enter* on the *Story* is a press.');
        } else {
            lines.push('In the story, *every press* of a switch, key or touch counts. *Hold Enter*, or tap the *Pause* button, to bring up the menu.');
        }
        lines.push('The words are read aloud. Then *press* to make something happen, and *press again* to turn the page.');
        lines.push('At *The End*, choose *Read Again* or *Pick a Different Story*.');
        lines.push(auto ? 'In the menus, the highlight moves by itself. *Enter* chooses.'
                        : 'In the menus, *tap Space* to move the highlight and *hold Space* to go back. *Enter* chooses.');
        lines.push('In *Settings*, you or a helper can change how the story is read, how it looks, and how the switches work.');
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
        const ticket = NSS.Voice.speak(text);
        if (!ticket) return;
        let released = false;
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
                action: function () { NSS.Voice.cancel(); show(NSS.Story.active() ? 'pause' : 'library'); }
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
        reading: { title: 'Reading', icon: 'book' },
        look: { title: 'How It Looks', icon: 'eye' },
        switches: { title: 'Switches', icon: 'switch' },
        sound: { title: 'Sound & Voice', icon: 'speaker' }
    };
    const PAGE_ORDER = ['reading', 'look', 'switches', 'sound'];

    /**
     * One of this game's own settings. Enter moves it on to the next choice;
     * the choice's note (or `extra`) is said after.
     */
    function gameSetting(key, label, extra) {
        return {
            id: key, label: label,
            value: () => S().label(key),
            action: () => { S().next(key); settingChanged(key); },
            after: () => {
                const o = S().option(key);
                const more = extra ? extra() : o.note;
                return label + ', ' + o.label.toLowerCase() + '.' + (more ? ' ' + more : '');
            }
        };
    }

    /** What else needs to happen when one of this game's settings changes. */
    function settingChanged(key) {
        if (/^(look|textSize|outline|characterSize)$/.test(key)) { applyLook(); NSS.Scene.refresh(); }
        if (NSS.Story.settingChanged) NSS.Story.settingChanged(key);
    }

    function backItem() {
        return {
            id: 'back', label: '← Back', icon: 'back', nav: true,
            action: () => {
                if (page === 'top') show(settingsFrom === 'pause' ? 'pause' : 'library');
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
            return PAGE_ORDER.map(function (p) {
                return { id: p, label: PAGES[p].title, icon: PAGES[p].icon, nav: true, action: () => openPage(p) };
            }).concat([backItem()]);
        }
        if (page === 'reading') {
            return [
                gameSetting('readAloud', 'Read Aloud'),
                gameSetting('rate', 'Reading Speed', () => 'This is how fast the computer voice reads.'),
                backItem()
            ];
        }
        if (page === 'look') {
            return [
                gameSetting('look', 'Look'),
                gameSetting('textSize', 'Text Size', () => ''),
                // These choices belong to the simplified accessibility look.
                ...(S().cvi() ? [gameSetting('outline', 'Outline'), gameSetting('characterSize', 'Character Size')] : []),
                backItem()
            ];
        }
        if (page === 'switches') {
            return [
                {
                    id: 'pause', label: 'Pause', value: () => scanMode() ? 'Scan to Pause' : 'Hold Enter',
                    action: () => s.set('pauseMode', scanMode() ? 'hold' : 'scan'),
                    after: () => scanMode()
                        ? 'Pause, scan to pause. In the story, the highlight moves between the story and Pause.'
                        : 'Pause, hold Enter. In the story, every press counts. Hold Enter to pause.'
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
                backItem()
            ];
        }
        return [
            {
                id: 'tts', label: 'Speak Menus', value: () => onOff(ttsOn()),
                action: () => { try { vm().toggleTTS(); } catch (e) { /* none */ } },
                after: () => ttsOn() ? 'Speak menus on. Menus and choices are read aloud.' : ''
            },
            {
                id: 'voice', label: 'Voice', value: voiceName,
                action: () => { try { vm().cycleVoice(); } catch (e) { /* none */ } },
                after: () => 'Voice, ' + voiceName() + '. This is the voice you will hear.'
            },
            {
                id: 'sound', label: 'Sound Effects', value: () => onOff(s.get('sound')),
                action: () => { s.toggle('sound'); NSS.Sound.sample(); },
                after: () => s.get('sound') ? 'Sound effects on.' : 'Sound effects off.'
            },
            {
                id: 'volume', label: 'Volume', value: () => s.volumeName(),
                action: () => { s.cycle('volumeIndex', s.VOLUMES.length); NSS.Sound.sample(); },
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
        NSS.Input.refresh(true, restoreId);
        if (!restoreId) NSS.Input.announce(PAGES[page].title + '.');
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
            h = Math.min(300, window.innerHeight * 0.28);
            w = h * aspect;
        }
        el.preview.style.width = Math.round(w) + 'px';
        el.preview.style.height = Math.round(h) + 'px';
    }

    function renderSettings() {
        settingsCache = pageItems();
        el.settingsTitle.textContent = PAGES[page].title;
        el.settingsCard.classList.toggle('nss-card-top', page === 'top');
        el.settingsCard.classList.toggle('with-preview', page === 'look');
        el.settingsList.innerHTML = '';
        settingsCache.forEach(function (item) {
            let b;
            if (page === 'top' && item.icon) {
                b = menuItem(el.settingsList, item.id === 'back' ? 'Back' : item.label, item.icon);
            } else {
                b = button('nss-row' + (item.nav ? ' nss-row-nav' : ''), el.settingsList);
                node('span', 'nss-row-label', b, item.label);
                if (item.value) {
                    const v = node('span', 'nss-row-value', b);
                    const sw = item.swatch && item.swatch();
                    if (sw) node('span', 'nss-swatch', v).style.background = sw;
                    node('span', '', v, item.value());
                }
            }
            b.dataset.setting = item.id;
        });
        sizePreview();
        fit();
        paintPictures();
    }

    function settingsScannables() {
        return settingsCache.map(function (item) {
            return {
                id: 'set:' + item.id,
                el: el.settingsList.querySelector('[data-setting="' + item.id + '"]'),
                speak: function () {
                    if (!item.value) return item.id === 'back' ? 'Back' : item.label;
                    return item.label + ', ' + item.value();
                },
                action: function () {
                    const before = page;
                    item.action();
                    if (item.nav || screen !== 'settings' || page !== before) return;
                    // Redraw and stay on the same row, then say what it means now.
                    renderSettings();
                    NSS.Input.refresh(false);
                    const line = item.after && item.after();
                    if (line) NSS.Input.announce(line);
                }
            };
        });
    }

    // --- scanning ---------------------------------------------------------------------

    function scannables() {
        switch (screen) {
            case 'library': return libraryScannables();
            case 'filters': return filterScannables();
            case 'lengths': return lengthScannables();
            case 'story': return storyScannables();
            case 'settings': return settingsScannables();
            case 'pause': return pauseScannables();
            case 'help': return helpScannables();
            default: return [];
        }
    }

    let scanHost = null;
    /** Where the shared "Parked" badge lives, outside the choices. */
    function scanContext() {
        if (!scanHost) scanHost = node('div', 'nss-scan-status');
        const parent = screen === 'story' ? el.story : el[screen] && el[screen].querySelector('.nss-card');
        if (parent && scanHost.parentElement !== parent) parent.prepend(scanHost);
        let key = screen;
        if (screen === 'story') key = NSS.Story.isChoosing() ? 'story:end' : 'story:' + S().get('pauseMode');
        else if (screen === 'settings') key = 'settings:' + page;
        else if (screen === 'library') key = 'library:' + (libraryLength ? 'pages:' + libraryLength : libraryNewest ? 'newest' : 'tag:' + libraryTag) + ':' + libraryPage;
        else if (screen === 'filters') key = 'filters:' + filterPage;
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
        paintPictures: paintPictures,
        stageEl: function () { return el.stage; },
        setWords: setWords,
        setCredits: setCredits,
        setHint: setHint,
        setPageNo: setPageNo,
        fadeWords: fadeWords,
        showEndChoices: showEndChoices,
        pictureHeight: pictureHeight,
        pictureWidth: pictureWidth,
        pictureControls: pictureControls
    };
})();
