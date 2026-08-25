// --- Configuration & Constants ---
const themes = [
    { name: 'Ocean', bg: 'linear-gradient(135deg, #2193b0, #6dd5ed)', highlight: '#ffff00' },
    { name: 'Default', bg: 'linear-gradient(135deg, #ff4b1f, #ff9068)', highlight: '#ffff00' },
    { name: 'Midnight', bg: 'linear-gradient(135deg, #232526, #414345)', highlight: '#00ff00' },
    { name: 'Forest', bg: 'linear-gradient(135deg, #134e5e, #71b280)', highlight: '#ffcc00' },
    { name: 'Sunset', bg: 'linear-gradient(135deg, #f12711, #f5af19)', highlight: '#ffff00' },
    { name: 'Lavender', bg: 'linear-gradient(135deg, #834d9b, #d04ed6)', highlight: '#00ffff' },
    { name: 'Mint', bg: 'linear-gradient(135deg, #00b09b, #96c93d)', highlight: '#ffffff' },
    { name: 'Dark Blue', bg: 'linear-gradient(135deg, #0f2027, #203a43, #2c5364)', highlight: '#00ffcc' }
];

const highlightColors = [
    { name: 'Theme Default', val: 'var(--theme-highlight)' },
    { name: 'Yellow', val: '#ffff00' },
    { name: 'White', val: '#ffffff' },
    { name: 'Cyan', val: '#00ffff' },
    { name: 'Lime', val: '#00ff00' },
    { name: 'Magenta', val: '#ff00ff' },
    { name: 'Orange', val: '#ffa500' },
    { name: 'Blue', val: '#3366ff' },
    { name: 'Red', val: '#ff0000' },
    { name: 'Pink', val: '#ffc0cb' },
    { name: 'Purple', val: '#cc33ff' }
];

const scanSpeeds = [
    { label: '1s', val: 1000, spoken: '1 second' },
    { label: '2s', val: 2000, spoken: '2 seconds' },
    { label: '3s', val: 3000, spoken: '3 seconds' },
    { label: '5s', val: 5000, spoken: '5 seconds' }
];

// The aimer rotates clockwise through these. Index order matters: entry N+1 is
// 45 degrees clockwise from entry N, which is what keeps the arrow sweeping
// smoothly instead of snapping backwards.
const DIRECTIONS = [
    { name: 'Right', dr: 0, dc: 1, spoken: 'right' },
    { name: 'Down Right', dr: 1, dc: 1, spoken: 'down and right' },
    { name: 'Down', dr: 1, dc: 0, spoken: 'down' },
    { name: 'Down Left', dr: 1, dc: -1, spoken: 'down and left' },
    { name: 'Left', dr: 0, dc: -1, spoken: 'backwards' },
    { name: 'Up Left', dr: -1, dc: -1, spoken: 'up and left' },
    { name: 'Up', dr: -1, dc: 0, spoken: 'up' },
    { name: 'Up Right', dr: -1, dc: 1, spoken: 'up and right' }
];

// Every difficulty uses all eight directions: words run diagonally and in
// reverse at every level, so the aimer always has the full compass to offer.
// Difficulty is grid size and how many words are hidden, not which way they run.
const ALL_DIRS = [0, 1, 2, 3, 4, 5, 6, 7];

// Difficulty moves three dials at once: grid size, how many words are hidden,
// and how long those words are.
const difficulties = [
    { key: 'easy', label: 'Easy', size: 8, wordCount: 5, minWordLen: 3, maxWordLen: 5, dirs: ALL_DIRS },
    { key: 'medium', label: 'Medium', size: 11, wordCount: 10, minWordLen: 5, maxWordLen: 7, dirs: ALL_DIRS },
    { key: 'hard', label: 'Hard', size: 15, wordCount: 20, minWordLen: 6, maxWordLen: 10, dirs: ALL_DIRS }
];

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// Hold thresholds. scan-manager.js owns the debounce but not these; every game
// in the hub hard-codes its own, and 3000/5000 is what the rest of them use.
const SCAN_BACK_HOLD = 3000;
const PAUSE_HOLD = 5000;

// --- Game Class ---
class WordSearchGame {
    constructor() {
        // Library data
        this.builtInLibrary = null;
        this.library = { categories: [] };
        this.customFileName = '';

        // Puzzle state
        this.grid = [];
        this.gridSize = 0;
        this.targets = [];      // [{ word, found }]
        this.foundCells = new Map(); // "r,c" -> true
        this.categoryName = '';
        this.allowedDirs = [];
        this.score = 0;
        this.streak = 0;
        this.misses = 0;
        this.bestScore = 0;

        // Selection state
        // Word-bank readout state, and whether it has parked the scan.
        this.readout = null;
        this.bankPark = false;

        this.phase = 'row';     // 'row' | 'cell' | 'aim' | 'extend'
        this.phaseIndex = 0;
        this.startR = 0;
        this.startC = 0;
        this.dirIndex = 0;
        this.aimAngle = 0;

        this.settings = {
            themeIndex: 0,
            tts: true,
            autoScan: false,
            scanSpeedIndex: 1,
            highlightStyle: 'outline',
            highlightColorIndex: 0,
            difficultyIndex: 1,
            rowLetters: true,
            categoryIndex: -1,   // -1 = Surprise Me
            currentSourceId: 'online_default',
            lastCategoryIndex: 0
        };

        this.state = {
            mode: 'menu',
            menuIndex: 0,
            settingsIndex: 0,
            modeSelectIndex: 0,
            pauseIndex: 0,
            warningIndex: -1,
            menuButtons: [],
            pauseButtons: [],
            warningButtons: [],
            inputFrozen: false,
            fromPause: false,
            input: {
                spaceHeld: false, enterHeld: false,
                spaceLongPressFired: false, enterLongPressFired: false
            },
            timers: { space: null, spaceRepeat: null, enter: null, autoScan: null }
        };

        this.mainContent = document.getElementById('main-content');
        this.createPauseOverlay();
        this.createMenuBackdrop();

        this.loadSettings();
        this.init();
    }

    // --- Audio ---
    // Built-in SafeAudio voices only. Web Audio is off limits here: an
    // AudioContext can take down the renderer in the Electron desktop build.
    playSystemSound(type) {
        if (!window.SafeAudio) return;
        const map = { step: 'select', found: 'score', miss: 'bust', win: 'win' };
        const name = map[type];
        if (name) window.SafeAudio.play(name, type === 'step' ? 0.45 : 0.7);
    }

    createPauseOverlay() {
        this.pauseOverlay = document.createElement('div');
        this.pauseOverlay.className = 'pause-overlay';
        this.pauseOverlay.style.display = 'none';
        this.pauseOverlay.id = 'pause-overlay';
        document.body.appendChild(this.pauseOverlay);
    }

    // --- Ambient menu backdrop ---
    createMenuBackdrop() {
        this.bg = document.createElement('div');
        this.bg.id = 'menu-bg';
        this.bg.setAttribute('aria-hidden', 'true');
        this.bg.innerHTML = '<div id="menu-bg-grid"></div><div id="menu-bg-veil"></div>';
        document.body.appendChild(this.bg);

        this.bgGrid = document.getElementById('menu-bg-grid');
        this.bgCells = [];
        this.bgCols = 0;
        this.bgRows = 0;
        this.bgTimers = [];
        this.bgActive = false;

        this.buildMenuBackdrop();

        let resizeTimer = null;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                if (!this.bgActive) return;
                this.buildMenuBackdrop();
            }, 250);
        });
    }

    buildMenuBackdrop() {
        const size = Math.max(30, Math.round(Math.min(window.innerWidth, window.innerHeight) * 0.045));
        this.bgCols = Math.ceil(window.innerWidth / size) + 2;
        this.bgRows = Math.ceil(window.innerHeight / size) + 2;

        this.bgGrid.style.gridTemplateColumns = `repeat(${this.bgCols}, ${size}px)`;
        this.bgGrid.style.gridTemplateRows = `repeat(${this.bgRows}, ${size}px)`;
        this.bgGrid.style.fontSize = Math.round(size * 0.54) + 'px';

        const total = this.bgCols * this.bgRows;
        let html = '';
        for (let i = 0; i < total; i++) {
            html += `<span class="bg-cell">${ALPHABET[Math.floor(Math.random() * 26)]}</span>`;
        }
        this.bgGrid.innerHTML = html;
        this.bgCells = Array.from(this.bgGrid.children);
    }

    prefersReducedMotion() {
        return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }

    startMenuBackdrop() {
        if (this.bgActive) return;
        this.bgActive = true;
        this.bg.classList.add('on');

        // Someone who has asked for less motion still gets the letter field, just
        // without anything moving in it.
        if (this.prefersReducedMotion()) return;

        // Two independent hunters, offset so they never march in step.
        this.bgTimers = [
            setTimeout(() => this.backdropHunt(0), 500),
            setTimeout(() => this.backdropHunt(1), 2900)
        ];
    }

    stopMenuBackdrop() {
        this.bgActive = false;
        this.bg.classList.remove('on');
        this.bgTimers.forEach(clearTimeout);
        this.bgTimers = [];
        this.bgCells.forEach(el => el.classList.remove('lit'));
    }

    randomBackdropWord() {
        const cats = this.library.categories;
        for (let i = 0; i < 12 && cats.length; i++) {
            const cat = cats[Math.floor(Math.random() * cats.length)];
            const w = cat.words[Math.floor(Math.random() * cat.words.length)];
            if (w && w.length >= 3 && w.length <= 8) return w;
        }
        return 'SEARCH';
    }

    placeBackdropWord(word) {
        for (let tries = 0; tries < 40; tries++) {
            const d = DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)];
            const r = Math.floor(Math.random() * this.bgRows);
            const c = Math.floor(Math.random() * this.bgCols);
            const endR = r + d.dr * (word.length - 1);
            const endC = c + d.dc * (word.length - 1);
            if (endR < 0 || endR >= this.bgRows || endC < 0 || endC >= this.bgCols) continue;

            const cells = [];
            for (let i = 0; i < word.length; i++) {
                cells.push(this.bgCells[(r + d.dr * i) * this.bgCols + (c + d.dc * i)]);
            }
            // Never write over a run another hunter is still lighting up.
            if (cells.some(el => !el || el.classList.contains('lit'))) continue;

            cells.forEach((el, i) => { el.textContent = word[i]; });
            return cells;
        }
        return null;
    }

    backdropHunt(slot) {
        if (!this.bgActive) return;

        const cells = this.placeBackdropWord(this.randomBackdropWord());
        if (!cells) {
            this.bgTimers[slot] = setTimeout(() => this.backdropHunt(slot), 700);
            return;
        }

        const step = 240;
        cells.forEach((el, i) => {
            const t = setTimeout(() => { if (this.bgActive) el.classList.add('lit'); }, i * step);
            this.bgTimers.push(t);
        });

        this.bgTimers[slot] = setTimeout(() => {
            if (!this.bgActive) return;
            cells.forEach(el => el.classList.remove('lit'));

            // Scramble the word back into noise once it has faded, so the same
            // find does not sit there between cycles.
            const scramble = setTimeout(() => {
                if (!this.bgActive) return;
                cells.forEach(el => { el.textContent = ALPHABET[Math.floor(Math.random() * 26)]; });
            }, 650);
            this.bgTimers.push(scramble);

            this.bgTimers[slot] = setTimeout(() => this.backdropHunt(slot), 1100);
        }, cells.length * step + 1500);
    }

    // --- Settings ---
    loadSettings() {
        try {
            const s = localStorage.getItem('elouise_wordsearch_settings');
            if (s) Object.assign(this.settings, JSON.parse(s));
            if (this.settings.scanSpeedIndex >= scanSpeeds.length) this.settings.scanSpeedIndex = 1;
            if (this.settings.difficultyIndex >= difficulties.length) this.settings.difficultyIndex = 1;
        } catch (e) { console.error(e); }
        this.applyTheme();
    }

    saveSettings() {
        try {
            localStorage.setItem('elouise_wordsearch_settings', JSON.stringify(this.settings));
        } catch (e) { console.error(e); }
    }

    applyTheme() {
        const t = themes[this.settings.themeIndex];
        document.body.style.background = t.bg;
        document.documentElement.style.setProperty('--theme-highlight', t.highlight);

        const hc = highlightColors[this.settings.highlightColorIndex];
        const val = hc.val === 'var(--theme-highlight)' ? t.highlight : hc.val;
        document.documentElement.style.setProperty('--highlight-color', val);

        if ((this.settings.highlightStyle || 'outline') === 'outline') {
            document.documentElement.style.setProperty('--highlight-bg-mode', '#ffffff');
            document.documentElement.style.setProperty('--highlight-text-mode', '#333333');
            document.documentElement.style.setProperty('--highlight-box-shadow',
                `0 0 1.5vh ${val}, inset 0 0 1vh rgba(255, 255, 255, 0.5)`);
        } else {
            document.documentElement.style.setProperty('--highlight-bg-mode', val);
            document.documentElement.style.setProperty('--highlight-text-mode', '#000000');
            document.documentElement.style.setProperty('--highlight-box-shadow', `0 0 2vh ${val}`);
        }
    }

    async init() {
        try {
            const response = await fetch('categories.json');
            this.builtInLibrary = await response.json();
        } catch (error) {
            console.error('Failed to load categories.json', error);
            this.builtInLibrary = { categories: [] };
        }
        this.loadLibrary();
        this.setupInput();

        // scan-manager also fires this on a `storage` event, so a change made in
        // the hub or another tab reaches a game already running.
        if (window.NarbeScanManager) {
            window.NarbeScanManager.subscribe(() => {
                if (window.NarbeScanManager.getSettings().autoScan) this.startAutoScan();
                else this.stopAutoScan();
            });
        }
        if (window.NarbeVoiceManager) {
            window.NarbeVoiceManager.onSettingsChange(() => {
                if (this.state.mode === 'settings') this.renderSettingsMenu();
            });
        }

        this.reportSpeechState();
        this.showMainMenu();
    }

    // TTS failing is otherwise completely silent — no error, just no voice. Say
    // out loud in the console which of the three possible causes it is.
    reportSpeechState() {
        const vm = window.NarbeVoiceManager;
        if (!('speechSynthesis' in window)) {
            return console.warn('[WordSearch] TTS: this browser has no speechSynthesis. No voice available.');
        }
        if (!vm) {
            return console.warn('[WordSearch] TTS: NarbeVoiceManager did not load; falling back to the plain browser voice.');
        }
        if (!vm.getSettings().ttsEnabled) {
            return console.warn('[WordSearch] TTS is switched OFF in the hub-wide voice settings ' +
                '(localStorage "narbe-voice-settings"). Turn it back on with Settings -> TTS.');
        }
        console.log('[WordSearch] TTS on. Voices loaded:', vm.areVoicesLoaded ? vm.areVoicesLoaded() : 'unknown');
    }

    // --- Word list sources ---
    getAvailableSources() {
        const sources = [{ id: 'online_default', type: 'online', name: 'Built In' }];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('wordsearch_list_')) {
                sources.push({ id: key, type: 'local', name: key.replace('wordsearch_list_', '') });
            }
        }
        return sources;
    }

    loadLibrary() {
        const sources = this.getAvailableSources();
        let active = sources.find(s => s.id === this.settings.currentSourceId);
        if (!active) {
            active = sources[0];
            this.settings.currentSourceId = active.id;
        }

        if (active.type === 'online') {
            this.library = this.builtInLibrary || { categories: [] };
        } else {
            try {
                this.library = JSON.parse(localStorage.getItem(active.id)) || { categories: [] };
            } catch (e) {
                console.error('Failed to load local library', e);
                this.library = { categories: [] };
            }
        }

        if (!Array.isArray(this.library.categories)) this.library.categories = [];
        this.library.categories = this.library.categories.filter(c => c && Array.isArray(c.words) && c.words.length);

        if (this.settings.lastCategoryIndex >= this.library.categories.length) {
            this.settings.lastCategoryIndex = 0;
        }
        // A saved pick can point past the end of a different word list.
        if (this.settings.categoryIndex >= this.library.categories.length) {
            this.settings.categoryIndex = -1;
        }
    }

    toggleDataSource() {
        const sources = this.getAvailableSources();
        const ids = sources.map(s => s.id);
        let idx = ids.indexOf(this.settings.currentSourceId);
        if (idx === -1) idx = 0;
        const next = sources[(idx + 1) % sources.length];
        this.settings.currentSourceId = next.id;
        this.saveSettings();
        this.loadLibrary();
        this.renderSettingsMenu();
        this.speak('Source: ' + next.name);
    }

    getSourceLabel() {
        const active = this.getAvailableSources().find(s => s.id === this.settings.currentSourceId);
        return active ? active.name : 'Unknown';
    }

    uploadCustomFile() {
        const self = this;
        this.showMouseWarning(() => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json,application/json';
            input.onchange = (e) => {
                const file = e.target.files[0];
                if (!file) return;
                self.customFileName = file.name;
                const reader = new FileReader();
                reader.onload = (ev) => {
                    try {
                        let jsonStr = String(ev.target.result).trim();
                        if (jsonStr.charCodeAt(0) === 0xFEFF) jsonStr = jsonStr.slice(1);
                        const data = JSON.parse(jsonStr);
                        const cats = Array.isArray(data) ? data : data.categories;
                        if (!Array.isArray(cats) || !cats.length) throw new Error('No categories found.');
                        if (!Array.isArray(cats[0].words)) throw new Error('First category has no "words" array.');

                        const clean = file.name.replace(/\.json$/i, '').trim() || 'Custom';
                        const key = 'wordsearch_list_' + clean;
                        localStorage.setItem(key, JSON.stringify({ version: 1, name: clean, categories: cats }));
                        self.settings.currentSourceId = key;
                        self.settings.lastCategoryIndex = 0;
                        self.saveSettings();
                        self.loadLibrary();
                        self.renderSettingsMenu();
                        self.speak('Loaded ' + clean);
                    } catch (err) {
                        console.error('JSON Load Error', err);
                        alert('Invalid JSON: ' + err.message);
                    }
                };
                reader.readAsText(file);
            };
            input.click();
        }, 'settings');
    }

    // --- Input ---
    // Act on release, never on press: a held switch must not become a runaway
    // repeat. The *LongPressFired flags are what suppress the short press, not a
    // duration comparison, so a hold that has already acted can never also act
    // again on the way up.
    setupInput() {
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space') {
                if (!this.state.input.spaceHeld) {
                    this.state.input.spaceHeld = true;
                    this.state.input.spaceLongPressFired = false;
                    this.state.timers.space = setTimeout(() => this.onSpaceLongPress(), SCAN_BACK_HOLD);
                }
                e.preventDefault();
            } else if (e.code === 'Enter' || e.code === 'NumpadEnter') {
                if (!this.state.input.enterHeld) {
                    this.state.input.enterHeld = true;
                    this.state.input.enterLongPressFired = false;
                    this.state.timers.enter = setTimeout(() => this.onEnterLongPress(), PAUSE_HOLD);
                }
                e.preventDefault();
            }
        });

        document.addEventListener('keyup', (e) => {
            if (e.code === 'Space') {
                clearTimeout(this.state.timers.space);
                clearInterval(this.state.timers.spaceRepeat);
                this.state.input.spaceHeld = false;
                if (!this.state.input.spaceLongPressFired) this.onSpaceShortPress();
                this.state.input.spaceLongPressFired = false;
            } else if (e.code === 'Enter' || e.code === 'NumpadEnter') {
                clearTimeout(this.state.timers.enter);
                this.state.input.enterHeld = false;
                if (!this.state.input.enterLongPressFired) this.onEnterShortPress();
                this.state.input.enterLongPressFired = false;
            }
        });
    }

    scanInterval() {
        if (typeof NarbeScanManager !== 'undefined') return NarbeScanManager.getScanInterval();
        return scanSpeeds[this.settings.scanSpeedIndex].val;
    }

    autoScanEnabled() {
        if (typeof NarbeScanManager !== 'undefined') return NarbeScanManager.getSettings().autoScan;
        return this.settings.autoScan;
    }

    startAutoScan() {
        this.stopAutoScan();
        if (!this.autoScanEnabled()) return;

        this.state.timers.autoScan = setInterval(() => {
            // A tick skips rather than reschedules while a switch is physically
            // held, so the timer never steals a hold in progress.
            if (this.state.input.spaceHeld || this.state.input.enterHeld) return;
            if (this.state.inputFrozen || document.visibilityState !== 'visible') return;
            this.moveScan(1);
        }, this.scanInterval());
    }

    stopAutoScan() {
        clearInterval(this.state.timers.autoScan);
        this.state.timers.autoScan = null;
    }

    onSpaceShortPress() {
        if (this.state.inputFrozen) return;
        if (this.cancelWordBankReadout()) return;
        // Space always means "move on", so it quietly releases a parked scan.
        this.releaseBankPark(true);
        this.startAutoScan();
        this.moveScan(1);
    }

    onSpaceLongPress() {
        this.state.input.spaceLongPressFired = true;
        if (this.state.inputFrozen) return;
        this.cancelWordBankReadout();
        this.releaseBankPark(true);
        this.stopAutoScan();
        this.moveScan(-1);
        this.state.timers.spaceRepeat = setInterval(() => this.moveScan(-1), this.scanInterval());
    }

    onEnterShortPress() {
        if (this.state.inputFrozen) return;
        // One press stops a readout in progress; one press on a finished readout
        // sets the scan going again. Either way, it never also selects.
        if (this.cancelWordBankReadout()) return;
        if (this.releaseBankPark()) return;
        this.startAutoScan();
        this.triggerSelection();
    }

    onEnterLongPress() {
        this.state.input.enterLongPressFired = true;
        if (this.state.inputFrozen) return;
        this.cancelWordBankReadout();
        this.releaseBankPark(true);
        if (this.state.mode === 'game') this.stepBack();
        else if (this.state.mode === 'pause') this.resumeGame();
    }

    // Holding Enter abandons the attempt in progress and drops back one level:
    // aiming or stretching returns to picking a letter, and picking a letter
    // returns to picking a row. Pausing lives on the scan list instead, so a
    // long hold never has to double as two different things.
    stepBack() {
        if (this.phase === 'aim' || this.phase === 'extend') {
            this.goToLetterScan('Starting over. Pick a letter.');
        } else {
            this.goToRowScan('Starting over. Pick a row.');
        }
    }

    // Both back-out routes keep their place, so the scan resumes where the
    // player already was instead of restarting from the first row or column.
    goToLetterScan(message) {
        this.enterPhase('cell', true);
        const at = this.getPhaseList().findIndex(i => i.type === 'cell' && i.c === this.startC);
        if (at !== -1) this.phaseIndex = at;
        this.updateGameHighlights();
        this.renderPanel();
        if (message) this.speak(message);
    }

    goToRowScan(message) {
        this.enterPhase('row', true);
        const at = this.getPhaseList().findIndex(i => i.type === 'row' && i.r === this.startR);
        if (at !== -1) this.phaseIndex = at;
        this.updateGameHighlights();
        this.renderPanel();
        if (message) this.speak(message);
    }

    // --- Navigation ---
    cycleIndex(current, length, direction) {
        if (length === 0) return 0;
        return (current + direction + length) % length;
    }

    moveScan(direction) {
        const m = this.state.mode;
        if (m === 'menu') {
            this.state.menuIndex = this.cycleIndex(this.state.menuIndex, this.state.menuButtons.length, direction);
            this.updateMenuHighlights();
            this.speakButton(this.state.menuButtons[this.state.menuIndex]);
        } else if (m === 'settings') {
            this.state.settingsIndex = this.cycleIndex(this.state.settingsIndex, this.state.menuButtons.length, direction);
            this.updateMenuHighlights();
            this.speakButton(this.state.menuButtons[this.state.settingsIndex]);
        } else if (m === 'mode_select' || m === 'howto') {
            this.state.modeSelectIndex = this.cycleIndex(this.state.modeSelectIndex, this.state.menuButtons.length, direction);
            this.updateMenuHighlights();
            this.speakButton(this.state.menuButtons[this.state.modeSelectIndex]);
        } else if (m === 'game') {
            this.movePhaseScan(direction);
        } else if (m === 'pause' || m === 'complete') {
            this.state.pauseIndex = this.cycleIndex(this.state.pauseIndex, this.state.pauseButtons.length, direction);
            this.updatePauseHighlights();
            this.speakButton(this.state.pauseButtons[this.state.pauseIndex]);
        } else if (m === 'warning') {
            this.state.warningIndex = this.cycleIndex(this.state.warningIndex, this.state.warningButtons.length, direction);
            this.updateWarningHighlights();
            this.speakButton(this.state.warningButtons[this.state.warningIndex]);
        }
    }

    triggerSelection() {
        const m = this.state.mode;
        if (m === 'menu' || m === 'settings' || m === 'mode_select' || m === 'howto') {
            const idx = m === 'menu' ? this.state.menuIndex
                : (m === 'settings' ? this.state.settingsIndex : this.state.modeSelectIndex);
            const btn = this.state.menuButtons[idx];
            if (btn) btn.click();
        } else if (m === 'game') {
            this.selectPhaseItem();
        } else if (m === 'pause' || m === 'complete') {
            const btn = this.state.pauseButtons[this.state.pauseIndex];
            if (btn) btn.click();
        } else if (m === 'warning') {
            const btn = this.state.warningButtons[this.state.warningIndex];
            if (btn) btn.click();
        }
    }

    speakButton(btn) {
        if (!btn) return;
        this.speak(btn.getAttribute('data-spoken') || btn.innerText);
    }

    updateMenuHighlights() {
        if (this.state.mode === 'warning') return this.updateWarningHighlights();
        const buttons = this.state.menuButtons;
        const m = this.state.mode;
        const index = m === 'menu' ? this.state.menuIndex
            : (m === 'settings' ? this.state.settingsIndex : this.state.modeSelectIndex);
        buttons.forEach((btn, idx) => {
            if (index === idx) {
                btn.classList.add('highlight');
                // rAF: the button may have been created by the innerHTML swap
                // in this same tick, before layout knows where it is.
                requestAnimationFrame(() => btn.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
            } else {
                btn.classList.remove('highlight');
            }
        });
    }

    updatePauseHighlights() {
        this.state.pauseButtons.forEach((btn, idx) => {
            if (idx === this.state.pauseIndex) btn.classList.add('highlight');
            else btn.classList.remove('highlight');
        });
    }

    updateWarningHighlights() {
        if (!this.state.warningButtons) return;
        this.state.warningButtons.forEach((btn, idx) => {
            if (idx === this.state.warningIndex) btn.classList.add('highlight');
            else btn.classList.remove('highlight');
        });
    }

    // --- Menus ---
    showMainMenu() {
        this.state.mode = 'menu';
        this.state.menuIndex = 0;
        this.clearBankState();
        this.stopAutoScan();
        this.startMenuBackdrop();
        this.pauseOverlay.style.display = 'none';

        this.mainContent.innerHTML = `
            <div class="menu-title">Elouise's Word Search</div>
            <div id="menu-list" style="display:flex; flex-direction:column; align-items:center;">
                <button class="menu-button" onclick="game.showPlayMenu()">Play Game</button>
                <button class="menu-button" onclick="game.showHowTo()">How To Play</button>
                <button class="menu-button" onclick="game.showSettingsMenu()">Settings</button>
                <button class="menu-button" onclick="game.exitGame()">Exit</button>
            </div>
        `;
        this.state.menuButtons = Array.from(document.querySelectorAll('#menu-list .menu-button'));
        this.updateMenuHighlights();
        this.speak("Elouise's Word Search. Main Menu.");
        this.startAutoScan();
    }

    showPlayMenu() {
        this.state.mode = 'mode_select';
        this.state.modeSelectIndex = 0;
        this.startMenuBackdrop();
        this.renderPlayMenu();
        this.speak('Play Game. Pick a category and a difficulty, then start.');
        this.startAutoScan();
    }

    renderPlayMenu() {
        this.state.screen = 'play';
        const d = difficulties[this.settings.difficultyIndex];
        const catLabel = this.categoryLabel();
        this.mainContent.innerHTML = `
            <div class="menu-title">Play Game</div>
            <div id="menu-list" style="display:flex; flex-direction:column; align-items:center;">
                <button class="menu-button" onclick="game.toggleCategory()" data-spoken="Category: ${this.esc(catLabel)}">Category: ${this.esc(catLabel)}</button>
                <button class="menu-button" onclick="game.toggleDifficulty()" data-spoken="Difficulty ${d.label}. ${this.difficultyBlurb(d)}">Difficulty: ${d.label} &mdash; ${this.difficultyBlurb(d)}</button>
                <button class="menu-button" onclick="game.startSelectedPuzzle()">Start Game</button>
                <button class="menu-button" onclick="game.showMainMenu()">Back</button>
            </div>
        `;
        this.state.menuButtons = Array.from(document.querySelectorAll('#menu-list .menu-button'));
        this.updateMenuHighlights();
    }

    // categoryIndex -1 is "Surprise Me": the toggle starts there and cycles
    // through every category in the current word list before coming back round.
    categoryLabel() {
        const i = this.settings.categoryIndex;
        if (i < 0) return 'Surprise Me';
        const cat = this.library.categories[i];
        return cat ? cat.name : 'Surprise Me';
    }

    toggleCategory() {
        const n = this.library.categories.length;
        let next = this.settings.categoryIndex + 1;
        if (next >= n) next = -1;
        this.settings.categoryIndex = next;
        this.saveSettings();
        this.renderPlayMenu();

        // Just the name. The category's total word count is not the number the
        // player will meet in the puzzle, so announcing it only misleads.
        this.speak(this.categoryLabel());
    }

    startSelectedPuzzle() {
        const i = this.settings.categoryIndex;
        if (i < 0) return this.startRandomPuzzle();
        this.startPuzzle(i);
    }

    difficultyBlurb(d) {
        return `${d.wordCount} words, ${d.minWordLen} to ${d.maxWordLen} letters`;
    }

    toggleDifficulty() {
        this.settings.difficultyIndex = (this.settings.difficultyIndex + 1) % difficulties.length;
        this.saveSettings();
        const d = difficulties[this.settings.difficultyIndex];
        if (this.state.screen === 'settings') this.renderSettingsMenu();
        else this.renderPlayMenu();
        this.speak(`Difficulty ${d.label}. ${this.difficultyBlurb(d)}, on a ${d.size} by ${d.size} grid.`);
    }

    showHowTo() {
        this.state.mode = 'howto';
        this.state.modeSelectIndex = 0;
        this.startMenuBackdrop();
        this.mainContent.innerHTML = `
            <div class="menu-title" style="font-size:6vmin; margin-bottom:2vh;">How To Play</div>
            <div class="howto-body">
                <h3>Four steps to find a word</h3>
                <ul>
                    <li><b>1. Pick a row.</b> The board starts quiet, and your first press moves to the top row. The scan then works down one row at a time, reading out that row's letters as it goes. Select the row your word starts in.</li>
                    <li><b>2. Pick a letter.</b> The scan moves across that row. Select the first letter of your word.</li>
                    <li><b>3. Aim.</b> An arrow spins all the way around your letter. Select it when it points the way your word runs &mdash; words hide sideways, up, down, diagonally, and spelled backwards.</li>
                    <li><b>4. Stretch it out.</b> Each press adds one more letter in that direction. The moment the lit letters spell a word from the list it is claimed for you &mdash; there is nothing to confirm.</li>
                </ul>
                <p style="margin: 1vh 0 0 0;">Enter still works as a check: press it on a run you think is right and you will be told whether it is on the list.</p>
                <h3>Two switches</h3>
                <ul>
                    <li><b>Space</b> moves the scan forward. <b>Enter</b> selects.</li>
                    <li><b>Hold Space</b> to scan backwards.</li>
                    <li><b>Hold Enter</b> to start the word over &mdash; back to picking a letter, or back to picking a row.</li>
                    <li>The <b>pause button</b> and the <b>word bank</b> are stops on the row scan. Select the word bank to hear what is still hidden; each word lights up as it is read, and words you have already found are left out.</li>
                </ul>
                <h3>One switch</h3>
                <ul>
                    <li>Turn <b>Auto Scan</b> on in Settings. Every step then moves by itself, and your one switch (Enter) does all the selecting.</li>
                    <li>With Auto Scan on, selecting the <b>word bank</b> also holds the scan there so it cannot walk off while the list is being read. Press again to set it scanning.</li>
                </ul>
                <h3>Mouse or touch</h3>
                <ul>
                    <li>Tap the letters of a word as you read them. When they spell a word from the list it is claimed for you, so a wrong tap costs nothing.</li>
                    <li>Tap any other letter to start a new word from there.</li>
                    <li><b>Tap the letter you started from</b> to back out one step at a time: first it clears the letters you stretched out, then it returns to picking a letter, then to picking a row. Keep tapping the same letter to go all the way back.</li>
                </ul>
                <h3>Picking what to play</h3>
                <ul>
                    <li>On the <b>Play Game</b> screen, the <b>Category</b> button starts on <i>Surprise Me</i> and cycles through every topic in the word list each time you press it.</li>
                    <li><b>Difficulty</b> sets the grid size, how many words are hidden, and how long they are.</li>
                </ul>
                <h3>Helpful settings</h3>
                <ul>
                    <li><b>Read Row Letters</b> speaks every letter in a row as you scan past it. Turn it off for a quicker scan.</li>
                    <li><b>Speed</b> sets how long each auto scan step waits. Turn it up if you want the row letters read all the way out.</li>
                    <li><b>Open Word List Editor</b> is in Settings, for building your own categories.</li>
                </ul>
            </div>
            <div id="menu-list" style="display:flex; flex-direction:column; align-items:center;">
                <button class="menu-button" style="width:40vw; font-size:3.2vmin;" onclick="game.showMainMenu()">Back</button>
            </div>
        `;
        this.state.menuButtons = Array.from(document.querySelectorAll('#menu-list .menu-button'));
        this.updateMenuHighlights();
        this.speak('How to play. Pick a row, pick a letter, aim the arrow, then stretch out the word and press enter.');
        this.startAutoScan();
    }

    showSettingsMenu(fromPause = false) {
        this.state.fromPause = fromPause;
        this.state.mode = 'settings';
        this.state.settingsIndex = 0;
        this.startMenuBackdrop();
        this.renderSettingsMenu();
        this.speak('Settings');
        this.startAutoScan();
    }

    backFromSettings() {
        if (this.state.fromPause) {
            this.state.fromPause = false;
            this.showPauseMenu();
        } else {
            this.showMainMenu();
        }
    }

    renderSettingsMenu() {
        this.state.screen = 'settings';
        const s = this.settings;

        let currentAutoScan = s.autoScan;
        let speedLabel = scanSpeeds[s.scanSpeedIndex].label;
        let speedSpoken = scanSpeeds[s.scanSpeedIndex].spoken;
        if (typeof NarbeScanManager !== 'undefined') {
            currentAutoScan = NarbeScanManager.getSettings().autoScan;
            const interval = NarbeScanManager.getScanInterval();
            speedLabel = (interval / 1000) + 's';
            speedSpoken = (interval / 1000) + ' seconds';
        }

        const ttsOn = window.NarbeVoiceManager
            ? window.NarbeVoiceManager.getSettings().ttsEnabled : s.tts;
        const hColor = highlightColors[s.highlightColorIndex];
        const swatch = `background-color: ${hColor.val}; width: 3vmin; height: 3vmin; display: inline-block; vertical-align: middle; border: 2px solid white; box-shadow: 0 0 5px #000;`;
        const d = difficulties[s.difficultyIndex];

        this.mainContent.innerHTML = `
            <div class="menu-title" style="margin-bottom: 2vh; font-size: 6vmin;">Settings</div>
            <div id="menu-list" class="grid-menu">
                <button class="menu-button" onclick="game.toggleTheme()">Theme: ${themes[s.themeIndex].name}</button>
                <button class="menu-button" onclick="game.toggleTTS()">TTS: ${ttsOn ? 'On' : 'Off'}</button>
                <button class="menu-button" onclick="game.toggleAutoScan()">Auto Scan: ${currentAutoScan ? 'On' : 'Off'}</button>
                <button class="menu-button" onclick="game.toggleScanSpeed()" data-spoken="Scan Speed: ${speedSpoken}">Speed: ${speedLabel}</button>
                <button class="menu-button" onclick="game.toggleHighlightColor()" data-spoken="Highlight Color: ${hColor.name}">Color: <div class="color-swatch" style="${swatch}"></div></button>
                <button class="menu-button" onclick="game.toggleHighlightStyle()">Style: ${s.highlightStyle === 'outline' ? 'Outline' : 'Full'}</button>
                <button class="menu-button" onclick="game.toggleDifficulty()" data-spoken="Difficulty ${d.label}">Difficulty: ${d.label}</button>
                <button class="menu-button" onclick="game.toggleRowLetters()" data-spoken="Read Row Letters: ${s.rowLetters ? 'On' : 'Off'}. Reads every letter in a row as you scan past it.">Read Row Letters: ${s.rowLetters ? 'On' : 'Off'}</button>
                <button class="menu-button" onclick="game.toggleDataSource()">Word List: ${this.esc(this.getSourceLabel())}</button>
                <button class="menu-button" onclick="game.uploadCustomFile()">Load File...</button>
                <button class="menu-button span-2" onclick="game.openEditor()">Open Word List Editor</button>
                <button class="menu-button span-2" style="border: 2px solid #ff6666;" onclick="game.clearGameData()">Clear Saved Lists and Scores</button>
                <button class="menu-button span-2" style="width:50%; margin:0 auto;" onclick="game.backFromSettings()">Back</button>
            </div>
        `;
        this.state.menuButtons = Array.from(document.querySelectorAll('#menu-list .menu-button'));
        this.updateMenuHighlights();
    }

    toggleTheme() {
        this.settings.themeIndex = (this.settings.themeIndex + 1) % themes.length;
        this.applyTheme();
        this.saveSettings();
        this.renderSettingsMenu();
        this.speak('Theme: ' + themes[this.settings.themeIndex].name);
    }

    toggleTTS() {
        if (window.NarbeVoiceManager) {
            window.NarbeVoiceManager.toggleTTS();
            this.settings.tts = window.NarbeVoiceManager.getSettings().ttsEnabled;
        } else {
            this.settings.tts = !this.settings.tts;
        }
        this.saveSettings();
        this.renderSettingsMenu();
        this.speak('TTS: ' + (this.settings.tts ? 'On' : 'Off'));
    }

    toggleAutoScan() {
        if (typeof NarbeScanManager === 'undefined') return;
        NarbeScanManager.setAutoScan(!NarbeScanManager.getSettings().autoScan);
        const on = NarbeScanManager.getSettings().autoScan;
        this.renderSettingsMenu();
        this.speak('Auto Scan: ' + (on ? 'On' : 'Off'));
        if (on) this.startAutoScan();
        else this.stopAutoScan();
    }

    toggleScanSpeed() {
        if (typeof NarbeScanManager === 'undefined') return;
        NarbeScanManager.cycleScanSpeed();
        const interval = NarbeScanManager.getScanInterval();
        this.renderSettingsMenu();
        this.speak('Scan Speed: ' + (interval / 1000) + ' seconds');
        if (this.state.timers.autoScan) {
            this.stopAutoScan();
            this.startAutoScan();
        }
    }

    toggleHighlightColor() {
        this.settings.highlightColorIndex = (this.settings.highlightColorIndex + 1) % highlightColors.length;
        this.applyTheme();
        this.saveSettings();
        this.renderSettingsMenu();
        this.speak('Highlight Color: ' + highlightColors[this.settings.highlightColorIndex].name);
    }

    toggleHighlightStyle() {
        this.settings.highlightStyle = this.settings.highlightStyle === 'outline' ? 'full' : 'outline';
        this.applyTheme();
        this.saveSettings();
        this.renderSettingsMenu();
        this.speak('Highlight Style: ' + (this.settings.highlightStyle === 'outline' ? 'Outline' : 'Full Cell'));
    }

    clearGameData() {
        if (!confirm('Clear all word lists saved in this browser, plus your saved best scores? Files saved to your computer are not affected.')) return;
        try {
            const keys = [];
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k && (k.startsWith('wordsearch_list_') || k === 'elouise_wordsearch_scores')) keys.push(k);
            }
            keys.forEach(k => localStorage.removeItem(k));
            this.settings.currentSourceId = 'online_default';
            this.saveSettings();
            this.loadLibrary();
            this.renderSettingsMenu();
            this.speak('Saved lists and scores cleared');
        } catch (e) {
            console.error(e);
            alert('Error clearing saved data.');
        }
    }

    toggleRowLetters() {
        this.settings.rowLetters = !this.settings.rowLetters;
        this.saveSettings();
        this.renderSettingsMenu();
        this.speak('Read Row Letters: ' + (this.settings.rowLetters ? 'On' : 'Off'));
    }

    openEditor() {
        this.showMouseWarning(() => window.open('editor.html', '_blank'), 'settings');
    }

    showMouseWarning(callback, returnMode = 'settings') {
        this.stopAutoScan();
        this.state.mode = 'warning';
        this.state.warningCallback = callback;
        this.state.returnMode = returnMode;
        this.state.warningIndex = -1;

        const overlay = document.createElement('div');
        overlay.id = 'warning-overlay';
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.9); z-index: 2000;
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            text-align: center; color: white;
        `;
        overlay.innerHTML = `
            <div style="font-size: 5vmin; margin-bottom: 5vh; max-width: 80%;">
                Warning: This feature requires a mouse or touch input. It is not fully accessible with switch controls.
            </div>
            <div id="warning-buttons" style="display: flex; flex-direction: column; gap: 2vh;">
                <button class="menu-button" id="warning-cancel" onclick="game.closeWarning()">Cancel</button>
                <button class="menu-button" id="warning-proceed">Proceed</button>
            </div>
        `;
        document.body.appendChild(overlay);

        document.getElementById('warning-proceed').onclick = () => {
            document.body.removeChild(overlay);
            if (this.state.warningCallback) this.state.warningCallback();
            this.state.warningCallback = null;
            if (this.state.returnMode === 'menu') this.showMainMenu();
            else this.renderSettingsMenu();
        };

        this.state.warningButtons = [
            document.getElementById('warning-cancel'),
            document.getElementById('warning-proceed')
        ];

        this.speak('Warning. This feature requires mouse input. Cancel. Proceed.');
        this.updateWarningHighlights();
        this.startAutoScan();
    }

    closeWarning() {
        const overlay = document.getElementById('warning-overlay');
        if (overlay) document.body.removeChild(overlay);
        const mode = this.state.returnMode || 'settings';
        this.state.warningCallback = null;
        if (mode === 'menu') {
            this.showMainMenu();
        } else {
            this.state.mode = 'settings';
            this.renderSettingsMenu();
        }
    }

    // --- Puzzle setup ---
    startRandomPuzzle() {
        const n = this.library.categories.length;
        if (!n) return this.speak('There are no categories in this word list.');
        this.startPuzzle(Math.floor(Math.random() * n));
    }

    startPuzzle(categoryIndex) {
        const cat = this.library.categories[categoryIndex];
        if (!cat) return this.speak('That category is empty.');
        this.clearBankState();

        this.settings.lastCategoryIndex = categoryIndex;
        this.saveSettings();

        this.categoryName = cat.name || 'Word Search';
        const d = difficulties[this.settings.difficultyIndex];
        this.allowedDirs = d.dirs.slice();

        this.buildPuzzle(cat.words, d);

        this.score = 0;
        this.streak = 0;
        this.misses = 0;
        this.foundCells = new Map();
        this.loadBestScore();

        this.state.mode = 'game';
        this.state.inputFrozen = false;
        this.pauseOverlay.style.display = 'none';
        this.stopMenuBackdrop();

        this.renderGameScreen();
        this.enterPhase('row', true);
        this.speak(`${this.categoryName}. Find ${this.targets.length} words. Pick a row to start.`);
        this.startAutoScan();
    }

    buildPuzzle(sourceWords, d) {
        this.gridSize = d.size;
        const size = d.size;

        const clean = Array.from(new Set(sourceWords
            .map(w => String(w).toUpperCase().replace(/[^A-Z]/g, ''))
            .filter(w => w.length >= 3 && w.length <= size)));

        // Keep to the difficulty's length band, but widen it rather than hand
        // back a half-empty grid when a category is thin at that length.
        let lo = d.minWordLen;
        let hi = Math.min(d.maxWordLen, size);
        let pool = clean.filter(w => w.length >= lo && w.length <= hi);
        while (pool.length < d.wordCount * 2 && (lo > 3 || hi < size)) {
            lo = Math.max(3, lo - 1);
            hi = Math.min(size, hi + 1);
            pool = clean.filter(w => w.length >= lo && w.length <= hi);
        }
        if (!pool.length) pool = clean;

        // A fresh random draw every game is what makes the grid different each
        // time. Only the drawn words are then sorted longest-first, because a
        // long word needs the emptiest grid to fit — sorting the whole pool
        // would hand back the same longest words every single round.
        const shuffled = this.shuffle(pool);
        const primary = shuffled.slice(0, d.wordCount).sort((a, b) => b.length - a.length);
        const spares = shuffled.slice(d.wordCount);

        this.grid = Array.from({ length: size }, () => new Array(size).fill(''));
        this.targets = [];

        for (const word of primary) {
            if (this.placeWord(word)) this.targets.push({ word, found: false });
        }
        // Spares only ever cover for a word that would not fit.
        for (const word of spares) {
            if (this.targets.length >= d.wordCount) break;
            if (this.placeWord(word)) this.targets.push({ word, found: false });
        }

        // Fill the gaps with letters drawn from the puzzle's own words so the
        // filler blends in instead of reading as obvious noise.
        const letterPool = this.targets.map(t => t.word).join('') || ALPHABET;
        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                if (this.grid[r][c]) continue;
                this.grid[r][c] = Math.random() < 0.7
                    ? letterPool[Math.floor(Math.random() * letterPool.length)]
                    : ALPHABET[Math.floor(Math.random() * 26)];
            }
        }

        this.targets.sort((a, b) => a.word.localeCompare(b.word));
    }

    placeWord(word) {
        const size = this.gridSize;
        for (let attempt = 0; attempt < 300; attempt++) {
            const dirIdx = this.allowedDirs[Math.floor(Math.random() * this.allowedDirs.length)];
            const d = DIRECTIONS[dirIdx];
            const r = Math.floor(Math.random() * size);
            const c = Math.floor(Math.random() * size);

            const endR = r + d.dr * (word.length - 1);
            const endC = c + d.dc * (word.length - 1);
            if (endR < 0 || endR >= size || endC < 0 || endC >= size) continue;

            let ok = true;
            for (let i = 0; i < word.length; i++) {
                const cur = this.grid[r + d.dr * i][c + d.dc * i];
                if (cur && cur !== word[i]) { ok = false; break; }
            }
            if (!ok) continue;

            for (let i = 0; i < word.length; i++) {
                this.grid[r + d.dr * i][c + d.dc * i] = word[i];
            }
            return true;
        }
        return false;
    }

    shuffle(arr) {
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    // --- Rendering ---
    renderGameScreen() {
        document.documentElement.style.setProperty('--grid-n', this.gridSize);

        let cells = '';
        for (let r = 0; r < this.gridSize; r++) {
            for (let c = 0; c < this.gridSize; c++) {
                cells += `<div class="cell" id="c-${r}-${c}" onclick="game.onCellClick(${r},${c})">${this.grid[r][c]}</div>`;
            }
        }

        const d = difficulties[this.settings.difficultyIndex];
        this.mainContent.innerHTML = `
            <div id="game-header">
                <span id="header-category">${this.esc(this.categoryName)}</span>
                <span id="header-difficulty">${d.label}</span>
            </div>
            <div id="play-area">
                <div id="board-wrap">
                    <div id="board">${cells}</div>
                    <div id="aimer"><div class="shaft"></div><div class="head"></div></div>
                </div>
                <div id="side-panel">
                    <div class="panel-card" id="word-bank-card" onclick="game.readWordBank()" style="cursor:pointer;">
                        <div class="panel-heading" id="bank-heading"></div>
                        <div id="word-list"></div>
                    </div>
                </div>
            </div>
            <div id="result-message"></div>
            <div id="pause-button" onclick="game.showPauseMenu()"><div class="bars"></div></div>
        `;

        this.renderPanel();
    }

    renderPanel() {
        // The word bank is the only panel on screen, so progress rides along in
        // its heading rather than taking a card of its own.
        const found = this.targets.filter(t => t.found).length;
        const heading = document.getElementById('bank-heading');
        if (heading) heading.textContent = `Find These Words — ${found} of ${this.targets.length}`;

        const wl = document.getElementById('word-list');
        if (wl) {
            wl.innerHTML = this.targets
                .map((t, i) => `<span class="wl-word${t.found ? ' done' : ''}" id="wl-${i}">${t.word}</span>`)
                .join('');
        }
    }

    // --- Phase machinery ---
    enterPhase(phase, silent = false) {
        this.phase = phase;
        // The row scan opens at rest: index -1 means nothing is highlighted, so
        // the board is quiet until the player acts and the very first press
        // lands on the top row rather than skipping past it.
        this.phaseIndex = phase === 'row' ? -1 : 0;

        if (phase === 'aim') {
            const dirs = this.availableDirs();
            this.dirIndex = dirs.length ? dirs[0] : 0;
            this.aimAngle = this.baseAngle(this.dirIndex);
        }

        this.updateGameHighlights();
        this.renderPanel();
        if (!silent) this.announcePhaseItem();
    }

    // Each phase is a flat list of scannable items so one moveScan/select pair
    // drives all four steps.
    getPhaseList() {
        if (this.phase === 'row') {
            const list = [];
            for (let r = 0; r < this.gridSize; r++) list.push({ type: 'row', r });
            list.push({ type: 'readwords' });
            list.push({ type: 'pause' });
            return list;
        }

        if (this.phase === 'cell') {
            const list = [];
            for (let c = 0; c < this.gridSize; c++) list.push({ type: 'cell', r: this.startR, c });
            list.push({ type: 'back' });
            return list;
        }

        if (this.phase === 'aim') {
            const list = this.availableDirs().map(d => ({ type: 'dir', dir: d }));
            list.push({ type: 'back' });
            return list;
        }

        const list = [];
        for (let n = 2; n <= this.maxExtend(); n++) list.push({ type: 'len', n });
        list.push({ type: 'back' });
        return list;
    }

    currentItem() {
        const list = this.getPhaseList();
        if (this.phaseIndex < 0) return null;   // at rest, nothing highlighted
        if (this.phaseIndex >= list.length) this.phaseIndex = 0;
        return list[this.phaseIndex];
    }

    movePhaseScan(direction) {
        const list = this.getPhaseList();
        const prev = this.phaseIndex >= 0 ? list[this.phaseIndex] : null;

        if (this.phaseIndex < 0) {
            // Leaving the rest state: forward starts at the top, backward wraps
            // round to the bottom.
            this.phaseIndex = direction >= 0 ? 0 : list.length - 1;
        } else {
            this.phaseIndex = this.cycleIndex(this.phaseIndex, list.length, direction);
        }
        const next = list[this.phaseIndex];

        if (this.phase === 'aim') {
            // Keep the arrow sweeping the same way the scan is moving, even
            // when it wraps past due north.
            if (next.type === 'dir') {
                const from = prev && prev.type === 'dir' ? prev.dir : this.dirIndex;
                this.aimAngle += this.angleStep(from, next.dir, direction);
                this.dirIndex = next.dir;
            }
        }

        this.updateGameHighlights();
        this.renderPanel();
        this.announcePhaseItem();

        if (this.phase === 'extend' && next.type === 'len') this.tryAutoAccept();
    }

    selectPhaseItem() {
        const item = this.currentItem();
        // Selecting while at rest just starts the scan, so a player who only
        // has the select switch is never stuck on a quiet board.
        if (!item) return this.movePhaseScan(1);

        if (item.type === 'pause') return this.showPauseMenu();

        if (item.type === 'readwords') return this.readWordBank();

        if (item.type === 'back') {
            if (this.phase === 'cell') return this.enterPhase('row');
            if (this.phase === 'aim') return this.enterPhase('cell');
            return this.enterPhase('aim');
        }

        if (item.type === 'row') {
            this.startR = item.r;
            this.playSystemSound('step');
            return this.enterPhase('cell');
        }

        if (item.type === 'cell') {
            this.startC = item.c;
            this.playSystemSound('step');
            const dirs = this.availableDirs();
            if (!dirs.length) {
                this.speak('No room for a word from that letter. Pick another.');
                return this.enterPhase('cell');
            }
            return this.enterPhase('aim');
        }

        if (item.type === 'dir') {
            this.dirIndex = item.dir;
            this.playSystemSound('step');
            this.enterPhase('extend');
            this.phaseIndex = 0; // length 2
            this.updateGameHighlights();
            this.renderPanel();
            this.announcePhaseItem();
            this.tryAutoAccept();
            return;
        }

        if (item.type === 'len') return this.submitSelection();
    }

    announcePhaseItem() {
        const item = this.currentItem();
        if (!item) return;

        if (item.type === 'row') this.speak(this.rowSpeech(item.r));
        else if (item.type === 'cell') this.speak(this.grid[item.r][item.c]);
        else if (item.type === 'dir') this.speak(DIRECTIONS[item.dir].spoken);
        else if (item.type === 'len') this.speak(this.grid[this.pathCell(item.n - 1).r][this.pathCell(item.n - 1).c]);
        else if (item.type === 'back') this.speak('Back');
        else if (item.type === 'pause') this.speak('Pause menu');
        else if (item.type === 'readwords') {
            const left = this.targets.filter(t => !t.found).length;
            this.speak(left ? `Word bank. ${left} still to find.` : 'Word bank. All found.');
        }
    }

    // A player who cannot read the grid needs to hear it. Landing on a row reads
    // its letters left to right, comma separated so the voice pauses between
    // them instead of trying to pronounce the row as one word.
    rowSpeech(r) {
        if (!this.settings.rowLetters) return 'Row ' + (r + 1);
        return `Row ${r + 1}. ${this.grid[r].join(', ')}`;
    }

    // Reads out only what is still hidden, so a word already found never comes
    // back around on a second listen. Each word lights up as it is spoken, which
    // is the whole point of the readout for anyone who cannot scan the list by
    // eye — so the speech has to be driven one utterance at a time.
    readWordBank() {
        this.cancelWordBankReadout();
        this.bankPark = false;

        // The readout owns this highlight rather than leaving it to the scan, so
        // a tap on the panel looks exactly like the scan landing on it.
        this.setBankCardLit(true);

        const remaining = this.targets
            .map((t, i) => ({ text: t.word, idx: i, found: t.found }))
            .filter(t => !t.found);

        if (!remaining.length) {
            this.speak('You found them all!');
            // Still flash the panel so a tap always gets a visible answer.
            setTimeout(() => { if (!this.readout) this.updateGameHighlights(); }, 1200);
            return;
        }

        // With auto scan on, hearing the list also parks the scan on the word
        // bank: the readout is no use if the scan walks off mid-sentence, and a
        // one-switch player has no second key to hold it there. The next press
        // releases it. With auto scan off there is nothing to park.
        this.bankPark = this.autoScanEnabled();
        this.stopAutoScan();

        this.readout = {
            active: true,
            timer: null,
            step: -1,
            steps: [{ text: 'Still to find', idx: -1 }].concat(
                remaining.map(t => ({ text: t.text, idx: t.idx }))
            )
        };
        this.advanceWordBankReadout();
    }

    advanceWordBankReadout() {
        const ro = this.readout;
        if (!ro || !ro.active) return;

        ro.step++;
        if (ro.step >= ro.steps.length) return this.finishWordBankReadout();

        const item = ro.steps[ro.step];
        this.highlightBankWord(item.idx);

        // Both the utterance ending and the watchdog below race to move on; the
        // first one through wins and the other is ignored.
        const at = ro.step;
        let moved = false;
        const next = () => {
            if (moved) return;
            moved = true;
            if (this.readout !== ro || !ro.active || ro.step !== at) return;
            clearTimeout(ro.timer);
            ro.timer = setTimeout(() => this.advanceWordBankReadout(), 170);
        };

        // Only the first utterance cancels what came before. Repeating
        // cancel-then-speak is what wedges the speech engine in Chrome, and by
        // definition nothing is speaking once onend has fired.
        const spoke = this.speakOne(item.text, next, ro.step === 0);

        // If onend never arrives the readout would sit there with the scan held
        // off, so always keep a fallback in flight.
        ro.timer = setTimeout(next, spoke ? 1300 + item.text.length * 130 : 700);
    }

    // Speaks one item and calls back when it finishes. NarbeVoiceManager.speak()
    // cancels any speech in progress on every call, so it cannot chain — this
    // talks to the speech API directly while borrowing the player's voice
    // settings so the readout sounds like the rest of the game.
    speakOne(text, onDone, cancelFirst) {
        const vm = window.NarbeVoiceManager;
        if (vm ? !vm.getSettings().ttsEnabled : !this.settings.tts) return false;
        if (!('speechSynthesis' in window)) return false;

        try {
            if (cancelFirst) window.speechSynthesis.cancel();
            const u = new SpeechSynthesisUtterance(String(text));
            const s = vm ? vm.getSettings() : null;
            u.rate = (s && s.rate) || 0.9;
            if (s && s.pitch) u.pitch = s.pitch;
            if (s && s.volume) u.volume = s.volume;
            const voice = vm && vm.getCurrentVoice ? vm.getCurrentVoice() : null;
            if (voice) u.voice = voice;
            u.onend = onDone;
            u.onerror = onDone;
            window.speechSynthesis.speak(u);
            return true;
        } catch (e) {
            return false;
        }
    }

    setBankCardLit(on) {
        const card = document.getElementById('word-bank-card');
        if (card) card.classList.toggle('highlight', !!on);
    }

    highlightBankWord(idx) {
        this.targets.forEach((t, i) => {
            const el = document.getElementById('wl-' + i);
            if (!el) return;

            const on = i === idx;
            el.classList.toggle('reading', on);

            // A twenty word list scrolls, so the word being read has to be
            // brought into view or the highlight is pointing at nothing.
            if (!on || !el.scrollIntoView) return;
            try {
                el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
            } catch (e) {
                el.scrollIntoView();
            }
        });
    }

    finishWordBankReadout() {
        if (this.readout) clearTimeout(this.readout.timer);
        this.readout = null;
        this.highlightBankWord(-1);

        // Parked: stay on the word bank, lit, and say so — silence from a
        // stopped scan is otherwise indistinguishable from a broken game.
        if (this.bankPark) return this.speak('Paused. Press to keep scanning.');

        // Otherwise hand the highlight back to whatever the scan is really on,
        // which also un-lights the panel when the readout came from a tap.
        this.updateGameHighlights();
        this.startAutoScan();
    }

    // Releases a parked scan. Returns true when it actually released one, so the
    // press that did it is spent on resuming rather than also selecting.
    releaseBankPark(silent) {
        if (!this.bankPark) return false;
        this.bankPark = false;
        this.updateGameHighlights();
        this.startAutoScan();
        if (!silent) this.speak('Scanning');
        return true;
    }

    // Returns true when it actually stopped a readout, so the press that
    // interrupted it is spent on stopping rather than also moving the scan.
    cancelWordBankReadout() {
        if (!this.readout || !this.readout.active) return false;
        this.readout.active = false;
        clearTimeout(this.readout.timer);
        this.readout = null;
        this.highlightBankWord(-1);
        if ('speechSynthesis' in window) {
            try { window.speechSynthesis.cancel(); } catch (e) { /* nothing to stop */ }
        }
        // Interrupting mid-readout resumes the scan too, so one press always
        // means the same thing: carry on.
        this.bankPark = false;
        this.updateGameHighlights();
        this.startAutoScan();
        return true;
    }

    // Used when leaving the board entirely, where neither state should survive.
    clearBankState() {
        this.cancelWordBankReadout();
        this.bankPark = false;
        this.setBankCardLit(false);
    }

    // --- Geometry helpers ---
    runLength(r, c, dirIdx) {
        const d = DIRECTIONS[dirIdx];
        let n = 0;
        while (r + d.dr * n >= 0 && r + d.dr * n < this.gridSize &&
               c + d.dc * n >= 0 && c + d.dc * n < this.gridSize) n++;
        return n;
    }

    availableDirs() {
        const remaining = this.targets.filter(t => !t.found).map(t => t.word.length);
        const minLen = remaining.length ? Math.min(...remaining) : 3;
        const fits = this.allowedDirs.filter(d => this.runLength(this.startR, this.startC, d) >= minLen);
        if (fits.length) return fits;
        return this.allowedDirs.filter(d => this.runLength(this.startR, this.startC, d) >= 2);
    }

    maxExtend() {
        const remaining = this.targets.filter(t => !t.found).map(t => t.word.length);
        const longest = remaining.length ? Math.max(...remaining) : this.gridSize;
        return Math.max(2, Math.min(this.runLength(this.startR, this.startC, this.dirIndex), longest));
    }

    pathCell(i) {
        const d = DIRECTIONS[this.dirIndex];
        return { r: this.startR + d.dr * i, c: this.startC + d.dc * i };
    }

    currentPathCells() {
        if (this.phase === 'aim') {
            // Two cells is the preview: enough to read the direction without
            // committing to a length.
            const len = Math.min(2, this.runLength(this.startR, this.startC, this.dirIndex));
            return Array.from({ length: len }, (_, i) => this.pathCell(i));
        }
        if (this.phase === 'extend') {
            const item = this.currentItem();
            const n = item && item.type === 'len' ? item.n : 1;
            return Array.from({ length: n }, (_, i) => this.pathCell(i));
        }
        return [];
    }

    currentPathLetters() {
        return this.currentPathCells().map(p => this.grid[p.r][p.c]).join('');
    }

    baseAngle(dirIdx) {
        const d = DIRECTIONS[dirIdx];
        return Math.atan2(d.dr, d.dc) * 180 / Math.PI;
    }

    // Shortest sweep from one compass index to another that still travels in
    // the scan's direction, so the arrow never jerks the wrong way.
    angleStep(fromDir, toDir, direction) {
        if (direction >= 0) return (((toDir - fromDir) % 8) + 8) % 8 * 45;
        return -((((fromDir - toDir) % 8) + 8) % 8) * 45;
    }

    // --- Highlighting ---
    updateGameHighlights() {
        if (!this.grid.length) return;

        const pathCells = this.currentPathCells();
        const pathKeys = new Set(pathCells.map(p => `${p.r},${p.c}`));
        const item = this.currentItem();
        const isAimPreview = this.phase === 'aim';

        let cursorR = -1, cursorC = -1;
        if (this.phase === 'cell' && item && item.type === 'cell') {
            cursorR = item.r; cursorC = item.c;
        } else if (this.phase === 'aim' || this.phase === 'extend') {
            cursorR = this.startR; cursorC = this.startC;
        }

        const scanRow = (this.phase === 'row' && item && item.type === 'row') ? item.r : -1;

        for (let r = 0; r < this.gridSize; r++) {
            for (let c = 0; c < this.gridSize; c++) {
                const el = document.getElementById(`c-${r}-${c}`);
                if (!el) continue;
                const cls = ['cell'];
                if (this.foundCells.has(`${r},${c}`)) cls.push('found');
                if (r === scanRow) {
                    cls.push('row-scan', 'row-edge-top', 'row-edge-bottom');
                    if (c === 0) cls.push('row-edge-left');
                    if (c === this.gridSize - 1) cls.push('row-edge-right');
                }
                if (pathKeys.has(`${r},${c}`)) cls.push(isAimPreview ? 'aim' : 'path');
                if (r === cursorR && c === cursorC) {
                    cls.push('cursor');
                    if (this.phase === 'extend') cls.push('path-start');
                }
                el.className = cls.join(' ');
            }
        }

        // The word bank and the pause button are stops on the same scan list, so
        // they light up the same way a grid row does.
        // Lit while the scan is on it, and also for the whole time it is being
        // read or parked, so a recompute mid-readout cannot steal the highlight
        // out from under a tap.
        const bank = document.getElementById('word-bank-card');
        if (bank) {
            bank.classList.toggle('highlight',
                !!this.readout || this.bankPark || (!!item && item.type === 'readwords'));
        }
        const pauseBtn = document.getElementById('pause-button');
        if (pauseBtn) pauseBtn.classList.toggle('highlight', !!item && item.type === 'pause');

        this.updateAimer();
    }

    updateAimer() {
        const aimer = document.getElementById('aimer');
        if (!aimer) return;

        if (this.phase !== 'aim') {
            aimer.style.display = 'none';
            return;
        }

        const wrap = document.getElementById('board-wrap');
        const cellEl = document.getElementById(`c-${this.startR}-${this.startC}`);
        if (!wrap || !cellEl) return;

        const wr = wrap.getBoundingClientRect();
        const cr = cellEl.getBoundingClientRect();
        const cx = cr.left - wr.left + cr.width / 2;
        const cy = cr.top - wr.top + cr.height / 2;

        aimer.style.display = 'block';
        aimer.style.left = (cx - cr.width * 0.45) + 'px';
        aimer.style.top = (cy - cr.width * 0.45) + 'px';
        aimer.style.transform = `rotate(${this.aimAngle}deg)`;
    }

    // --- Submitting a word ---
    // The moment the lit letters spell something on the list, the word is
    // claimed. No confirming press is needed from either input route, which is
    // the whole point: reaching the last letter *is* the answer.
    tryAutoAccept() {
        if (this.matchTarget(this.currentPathLetters())) this.submitSelection();
    }

    matchTarget(letters) {
        if (letters.length < 3) return null;
        const reversed = letters.split('').reverse().join('');
        return this.targets.find(t => !t.found && (t.word === letters || t.word === reversed)) || null;
    }

    submitSelection() {
        const cells = this.currentPathCells();
        const letters = cells.map(p => this.grid[p.r][p.c]).join('');
        const target = this.matchTarget(letters);
        const msg = document.getElementById('result-message');

        if (target) {
            target.found = true;
            cells.forEach(p => this.foundCells.set(`${p.r},${p.c}`, true));

            this.streak++;
            const points = target.word.length * 10 + (this.streak - 1) * 25;
            this.score += points;
            this.saveBestScore();

            this.playSystemSound('found');
            if (msg) {
                msg.style.color = '#ccffcc';
                msg.textContent = `${target.word}! +${points}` + (this.streak > 1 ? ` (streak x${this.streak})` : '');
            }
            this.speak(`${target.word}. Nice find.`);

            if (this.targets.every(t => t.found)) return this.finishPuzzle();

            this.enterPhase('row', true);
            return;
        }

        this.streak = 0;
        this.misses++;
        this.playSystemSound('miss');
        if (msg) {
            msg.style.color = '#ffdddd';
            msg.textContent = letters ? `${letters} is not on the list. Try another direction.` : 'Try again.';
        }
        this.speak('Not on the list. Try again.');

        cells.forEach(p => {
            const el = document.getElementById(`c-${p.r}-${p.c}`);
            if (el) el.classList.add('wrong');
        });
        setTimeout(() => {
            if (this.state.mode === 'game') this.enterPhase('aim', true);
        }, 550);
    }

    finishPuzzle() {
        this.clearBankState();
        this.stopAutoScan();
        this.state.inputFrozen = true;
        this.playSystemSound('win');
        this.updateGameHighlights();
        this.renderPanel();
        this.speak(`All words found! Your score is ${this.score}.`);

        setTimeout(() => {
            this.state.inputFrozen = false;
            this.state.mode = 'complete';
            this.state.pauseIndex = 0;
            this.pauseOverlay.style.display = 'flex';
            this.pauseOverlay.innerHTML = `
                <div class="pause-title">SOLVED!</div>
                <div style="font-size:4vmin; margin-bottom:3vh; text-align:center;">
                    ${this.esc(this.categoryName)} &mdash; ${this.targets.length} words<br>
                    Score ${this.score} &nbsp;|&nbsp; Best ${this.bestScore} &nbsp;|&nbsp; Misses ${this.misses}
                </div>
                <button class="menu-button" onclick="game.startPuzzle(${this.settings.lastCategoryIndex})">Play This Category Again</button>
                <button class="menu-button" onclick="game.startRandomPuzzle()">New Random Category</button>
                <button class="menu-button" onclick="game.showMainMenu()">Main Menu</button>
            `;
            this.state.pauseButtons = Array.from(this.pauseOverlay.getElementsByClassName('menu-button'));
            this.updatePauseHighlights();
            this.startAutoScan();
        }, 1800);
    }

    revealSolution() {
        this.targets.forEach(t => { t.found = true; });
        // Only the letters that are actually part of a listed word get marked,
        // so the reveal reads as the answer key rather than a wash of colour.
        this.targets.forEach(t => {
            for (let r = 0; r < this.gridSize; r++) {
                for (let c = 0; c < this.gridSize; c++) {
                    for (const dirIdx of this.allowedDirs) {
                        const d = DIRECTIONS[dirIdx];
                        if (this.runLength(r, c, dirIdx) < t.word.length) continue;
                        let hit = true;
                        for (let i = 0; i < t.word.length; i++) {
                            if (this.grid[r + d.dr * i][c + d.dc * i] !== t.word[i]) { hit = false; break; }
                        }
                        if (!hit) continue;
                        for (let i = 0; i < t.word.length; i++) {
                            this.foundCells.set(`${r + d.dr * i},${c + d.dc * i}`, true);
                        }
                    }
                }
            }
        });
        this.resumeGame();
        this.renderPanel();
        this.updateGameHighlights();
        this.speak('Solution revealed.');
    }

    // --- Scores ---
    getScoreKey() {
        return `${this.settings.currentSourceId}|${this.categoryName}|${difficulties[this.settings.difficultyIndex].key}`;
    }

    loadBestScore() {
        try {
            const data = JSON.parse(localStorage.getItem('elouise_wordsearch_scores') || '{}');
            this.bestScore = data[this.getScoreKey()] || 0;
        } catch (e) { this.bestScore = 0; }
    }

    saveBestScore() {
        if (this.score <= this.bestScore) return;
        this.bestScore = this.score;
        try {
            const data = JSON.parse(localStorage.getItem('elouise_wordsearch_scores') || '{}');
            data[this.getScoreKey()] = this.bestScore;
            localStorage.setItem('elouise_wordsearch_scores', JSON.stringify(data));
        } catch (e) { console.error(e); }
    }

    // --- Mouse / touch ---
    // Tap letters as you read them. The run is only ever submitted when it
    // spells a word that is actually on the list, so a wrong tap costs nothing
    // and never counts as a miss. Tapping the first letter again wipes the
    // attempt so you can start that word over.
    onCellClick(r, c) {
        if (this.state.mode !== 'game' || this.state.inputFrozen) return;
        this.clearBankState();

        const committed = this.phase === 'aim' || this.phase === 'extend';

        // Tapping the letter you started from walks back out one rung at a time,
        // so repeatedly tapping the same letter undoes the run, then the letter,
        // then the row. No need to know which mode you are in.
        if (r === this.startR && c === this.startC &&
            (committed || this.phase === 'cell')) {
            this.playSystemSound('step');
            if (this.phase === 'extend') {
                this.enterPhase('aim');
                this.speak('Cleared. Aiming from ' + this.grid[r][c]);
            } else if (this.phase === 'aim') {
                this.goToLetterScan('Pick a letter');
            } else {
                this.goToRowScan('Pick a row');
            }
            return;
        }

        // Only the very next letter along the run counts as carrying on. Anything
        // else starts a new word, so a tap is never quietly swallowed into an
        // attempt the player has already moved on from — which is what any cell
        // merely in line with a stale starting letter used to do.
        if (this.phase === 'extend') {
            const next = this.pathCell(this.currentPathCells().length);
            if (next.r === r && next.c === c && this.growRun(this.currentPathCells().length + 1)) return;
        } else if (committed) {
            const dr = r - this.startR;
            const dc = c - this.startC;
            if (Math.abs(dr) <= 1 && Math.abs(dc) <= 1) {
                const dirIdx = DIRECTIONS.findIndex(d => d.dr === dr && d.dc === dc);
                if (dirIdx !== -1 && this.allowedDirs.includes(dirIdx)) {
                    const prevDir = this.dirIndex;
                    this.dirIndex = dirIdx;
                    if (this.growRun(2)) {
                        this.aimAngle = this.baseAngle(dirIdx);
                        return;
                    }
                    this.dirIndex = prevDir;
                }
            }
        }

        // Anything else is read as the start of a fresh word.
        this.startR = r;
        this.startC = c;
        this.playSystemSound('step');
        this.enterPhase(this.availableDirs().length ? 'aim' : 'cell');
    }

    // Take the run out to `n` letters and claim it if it now spells something on
    // the list. Returns false when that length is not reachable, leaving the
    // selection untouched.
    growRun(n) {
        // getPhaseList() is keyed off this.phase, so the phase has to move before
        // asking for it — otherwise aiming hands back directions, not lengths.
        const prev = { phase: this.phase, index: this.phaseIndex };
        this.phase = 'extend';
        const at = this.getPhaseList().findIndex(i => i.type === 'len' && i.n === n);
        if (at === -1) {
            this.phase = prev.phase;
            this.phaseIndex = prev.index;
            return false;
        }

        this.phaseIndex = at;
        this.playSystemSound('step');
        this.updateGameHighlights();
        this.renderPanel();
        if (this.matchTarget(this.currentPathLetters())) this.submitSelection();
        return true;
    }

    // --- Pause ---
    showPauseMenu() {
        this.clearBankState();
        this.stopAutoScan();
        this.state.mode = 'pause';
        this.state.pauseIndex = 0;
        this.pauseOverlay.style.display = 'flex';
        this.pauseOverlay.innerHTML = `
            <div class="pause-title">PAUSED</div>
            <button class="menu-button" onclick="game.resumeGame()">Continue Game</button>
            <button class="menu-button" onclick="game.showSettingsMenu(true)">Settings</button>
            <button class="menu-button" onclick="game.startPuzzle(${this.settings.lastCategoryIndex})">New Puzzle</button>
            <button class="menu-button" onclick="game.revealSolution()">Show Answers</button>
            <button class="menu-button" onclick="game.showMainMenu()">Main Menu</button>
        `;
        this.state.pauseButtons = Array.from(this.pauseOverlay.getElementsByClassName('menu-button'));
        this.updatePauseHighlights();
        this.speak('Game Paused');
        this.startAutoScan();
    }

    resumeGame() {
        this.pauseOverlay.style.display = 'none';
        this.state.mode = 'game';
        this.stopMenuBackdrop();

        // Opening Settings from the pause menu replaces #main-content, which
        // takes the board with it. Rebuild it before resuming, or the player
        // comes back to an empty screen.
        if (!document.getElementById('board')) this.renderGameScreen();

        this.updateGameHighlights();
        this.renderPanel();
        this.startAutoScan();
    }

    // --- Utility ---
    esc(str) {
        return String(str).replace(/[&<>"']/g, ch => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[ch]));
    }

    speak(text) {
        if (!text) return;
        const vm = window.NarbeVoiceManager;

        if (!vm) return this.speakWithBrowser(text);

        // Respect the hub-wide TTS switch. This lives in the shared
        // `narbe-voice-settings` key, so turning it off in any game turns it off
        // in all of them — it is the usual reason a game seems to have gone mute.
        if (!vm.getSettings().ttsEnabled) return;

        // Until the voice list arrives, NarbeVoiceManager.speak() parks the
        // utterance in a 100ms polling loop that can easily outlive the moment it
        // was meant for, and never speaks at all if the list stays empty. Say it
        // with the plain browser voice instead so the announcement is not lost.
        if (typeof vm.areVoicesLoaded === 'function' && !vm.areVoicesLoaded()) {
            return this.speakWithBrowser(text, true);
        }

        vm.speak(text);
    }

    speakWithBrowser(text, force = false) {
        if (!force && !this.settings.tts) return;
        if (!('speechSynthesis' in window)) return;
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(String(text));
        u.rate = 0.9;
        window.speechSynthesis.speak(u);
    }

    exitGame() {
        this.stopAutoScan();
        this.speak('Exiting to Hub');
        setTimeout(() => {
            if (window.parent && window.parent !== window) {
                window.parent.postMessage({ action: 'focusBackButton' }, '*');
            } else {
                window.location.href = '../../../index.html';
            }
        }, 500);
    }
}

const game = new WordSearchGame();
window.addEventListener('resize', () => game.updateAimer());
