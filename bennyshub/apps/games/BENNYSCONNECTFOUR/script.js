// --- Benny's Connect Four ---
// Based on Chess/Checkers template with scan/select accessibility

// --- Configuration & Constants ---
const config = {
    longPress: 3000,     // 3 seconds for backward scanning intent
    repeatInterval: 2000, // Default fallback
    enterLongPress: 5000, // 5 seconds to open pause menu
    scanSpeeds: [
        { label: '1 Second', val: 1000 },
        { label: '2 Seconds', val: 2000 },
        { label: '3 Seconds', val: 3000 },
        { label: '5 Seconds', val: 5000 }
    ],
    rows: 6,
    cols: 7,
    winLength: 4
};

const themes = [
    { name: 'Default', bg: 'linear-gradient(135deg, #ff4b1f, #ff9068)' },
    { name: 'Ocean', bg: 'linear-gradient(135deg, #2193b0, #6dd5ed)' },
    { name: 'Midnight', bg: 'linear-gradient(135deg, #232526, #414345)' },
    { name: 'Forest', bg: 'linear-gradient(135deg, #134e5e, #71b280)' },
    { name: 'Sunset', bg: 'linear-gradient(135deg, #f12711, #f5af19)' },
    { name: 'Lavender', bg: 'linear-gradient(135deg, #834d9b, #d04ed6)' },
    { name: 'Classic Blue', bg: 'linear-gradient(135deg, #1a237e, #3949ab)' }
];

const highlightColors = [
    'Yellow', 'Cyan', 'Lime', 'Magenta', 'Red', 'Orange', 'Gold', 'DeepSkyBlue', 'SpringGreen', 'Violet'
];

const playerColors = [
    { name: 'Red', hex: '#d32f2f' },
    { name: 'Yellow', hex: '#fbc02d' },
    { name: 'Blue', hex: '#1976d2' },
    { name: 'Green', hex: '#388e3c' },
    { name: 'Purple', hex: '#7b1fa2' },
    { name: 'Orange', hex: '#f57c00' },
    { name: 'Pink', hex: '#e91e63' },
    { name: 'Teal', hex: '#00897b' }
];

// --- Game State ---
const state = {
    mode: 'menu', // menu, game, pause, gameover
    menuState: 'main', // main, settings
    gameMode: 'single', // single, two
    
    // Board: 6 rows x 7 columns, 0 = empty, 1 = P1, -1 = P2
    board: [],
    
    turn: 1, // 1 for Player 1, -1 for Player 2
    
    // Scanning state
    scanIndex: 0, // Current column being scanned (0-6)
    scanItems: [], // List of available columns
    
    // Menu indices
    menuIndex: 0,
    pauseIndex: 0,
    pauseMenuState: 'main',
    
    // Winning cells for animation
    winningCells: [],

    input: {
        spaceHeld: false,
        enterHeld: false,
        spaceTime: 0,
        enterTime: 0,
        enterLongTriggered: false
    },
    timers: {
        space: null,
        enter: null,
        autoScan: null,
        spaceRepeat: null,
        status: null
    }
};

const settings = {
    themeIndex: 0,
    tts: true,
    sound: true,
    p1ColorIndex: 0, // Red
    p2ColorIndex: 1, // Yellow
    highlightColorIndex: 0, // Yellow
    autoScan: false,
    scanSpeedIndex: 1, // Default 2 Seconds
    highlightStyle: 'outline' // 'outline' or 'full'
};

// --- Sounds ---
let audioCtx = null;
function getAudioCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(()=>{});
    return audioCtx;
}

window.addEventListener('touchstart', () => { getAudioCtx(); }, { once: true, passive: true });
window.addEventListener('click', () => { getAudioCtx(); }, { once: true });

function playSound(type) {
    if (!settings.sound) return;
    
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    osc.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    if (type === 'scan') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
        osc.start();
        osc.stop(ctx.currentTime + 0.05);
    } else if (type === 'select') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(660, ctx.currentTime);
        gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
        osc.start();
        osc.stop(ctx.currentTime + 0.1);
    } else if (type === 'drop') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(500, ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(200, ctx.currentTime + 0.3);
        gainNode.gain.setValueAtTime(0.2, ctx.currentTime);
        osc.start();
        osc.stop(ctx.currentTime + 0.3);
    } else if (type === 'win') {
        // Victory fanfare
        const notes = [523, 659, 784, 1047]; // C5, E5, G5, C6
        notes.forEach((freq, i) => {
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.connect(g);
            g.connect(ctx.destination);
            o.type = 'sine';
            o.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.15);
            g.gain.setValueAtTime(0.15, ctx.currentTime + i * 0.15);
            g.gain.linearRampToValueAtTime(0, ctx.currentTime + i * 0.15 + 0.3);
            o.start(ctx.currentTime + i * 0.15);
            o.stop(ctx.currentTime + i * 0.15 + 0.3);
        });
    } else if (type === 'error') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200, ctx.currentTime);
        gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
        osc.start();
        osc.stop(ctx.currentTime + 0.15);
    }
}

// --- Initialization ---

window.onload = init;

function init() {
    loadSettings();
    applyTheme();
    setupInput();
    createDOMStructure();
    
    // Scan Manager Integration - restart auto-scan when settings change
    if (window.NarbeScanManager) {
        window.NarbeScanManager.subscribe(() => {
            if (window.NarbeScanManager.getSettings().autoScan) {
                startAutoScan();
            } else {
                resetAutoScan();
            }
            // Refresh menu display if in settings
            if (state.mode === 'menu' && state.menuState === 'settings') {
                refreshCurrentMenu();
            } else if (state.mode === 'pause' && state.pauseMenuState === 'settings') {
                refreshCurrentMenu();
            }
        });
    }
    
    showMainMenu();
}

function loadSettings() {
    try {
        const saved = localStorage.getItem('bennys_connectfour_settings');
        if (saved) {
            const parsed = JSON.parse(saved);
            Object.assign(settings, parsed);
            
            const check = (key, max, def) => {
                if (typeof settings[key] !== 'number' || settings[key] < 0 || settings[key] >= max) {
                    settings[key] = def;
                }
            };

            check('themeIndex', themes.length, 0);
            check('p1ColorIndex', playerColors.length, 0);
            check('p2ColorIndex', playerColors.length, 1);
            check('highlightColorIndex', highlightColors.length, 0);
            check('scanSpeedIndex', config.scanSpeeds.length, 1);
            
            if (settings.highlightStyle !== 'outline' && settings.highlightStyle !== 'full') {
                settings.highlightStyle = 'outline';
            }
        } else {
            saveSettings();
        }
    } catch(e) { 
        console.error("Error loading settings:", e);
        saveSettings();
    }
}

function saveSettings() {
    localStorage.setItem('bennys_connectfour_settings', JSON.stringify(settings));
}

function createDOMStructure() {
    const mainContent = document.getElementById('main-content');
    
    // Menu
    const menuContainer = document.createElement('div');
    menuContainer.id = 'menu-container';
    menuContainer.className = 'menu-container';
    mainContent.appendChild(menuContainer);
    
    // Game Board Container
    const gameContainer = document.createElement('div');
    gameContainer.id = 'game-board-container';
    gameContainer.className = 'game-container';
    gameContainer.style.display = 'none';
    
    // Turn Indicator
    const turnIndicator = document.createElement('div');
    turnIndicator.id = 'turn-indicator';
    turnIndicator.className = 'turn-indicator';
    gameContainer.appendChild(turnIndicator);
    
    // Column Selector (arrows above board)
    const columnSelector = document.createElement('div');
    columnSelector.id = 'column-selector';
    columnSelector.className = 'column-selector';
    for (let c = 0; c < config.cols; c++) {
        const arrow = document.createElement('div');
        arrow.id = `arrow-${c}`;
        arrow.className = 'column-arrow';
        arrow.innerHTML = '▼';
        arrow.onclick = () => handleColumnClick(c);
        columnSelector.appendChild(arrow);
    }
    gameContainer.appendChild(columnSelector);
    
    // Board
    const board = document.createElement('div');
    board.id = 'connect-four-board';
    board.className = 'connect-four-board';
    gameContainer.appendChild(board);
    
    mainContent.appendChild(gameContainer);
    
    // Pause Overlay
    const pauseOverlay = document.createElement('div');
    pauseOverlay.id = 'pause-overlay';
    pauseOverlay.className = 'pause-overlay';
    pauseOverlay.style.display = 'none';
    document.body.appendChild(pauseOverlay);

    // Pause Icon
    const pauseIcon = document.createElement('div');
    pauseIcon.id = 'pause-button-icon';
    pauseIcon.className = 'pause-button-icon';
    pauseIcon.innerHTML = 'll'; 
    pauseIcon.title = "Pause Game";
    pauseIcon.style.display = 'none';
    pauseIcon.onclick = () => {
        if (state.mode === 'game') {
            openPauseMenu();
        }
    };
    document.body.appendChild(pauseIcon);
}

// --- Menu System ---

const menus = {
    main: [
        { text: "Single Player", action: () => startGame('single') },
        { text: "Two Player", action: () => startGame('two') },
        { text: "Settings", action: () => showMenu('settings') },
        { text: "Exit", action: () => { 
            speak("Exiting to Hub");
            setTimeout(() => {
                if (window.parent && window.parent !== window) {
                    window.parent.postMessage({ action: 'focusBackButton' }, '*');
                } else {
                    window.location.href = '../../../index.html';
                }
            }, 500);
        } }
    ],
    settings: [
        { 
            text: () => `TTS: ${window.NarbeVoiceManager ? (window.NarbeVoiceManager.getSettings().ttsEnabled ? 'On' : 'Off') : (settings.tts ? 'On' : 'Off')}`, 
            action: () => toggleSetting('tts'), 
            onPrev: () => toggleSetting('tts') 
        },
        { 
            text: () => `Sound: ${settings.sound ? 'On' : 'Off'}`,
            action: () => toggleSetting('sound'),
            onPrev: () => toggleSetting('sound')
        },
        {
            text: () => `Theme: ${themes[settings.themeIndex].name}`,
            action: () => cycleSetting('themeIndex', 1, themes.length),
            onPrev: () => cycleSetting('themeIndex', -1, themes.length)
        },
        {
            text: () => `Highlight: ${settings.highlightStyle === 'outline' ? 'Outline' : 'Full Cell'}`,
            action: () => toggleHighlightStyle(),
            onPrev: () => toggleHighlightStyle()
        },
        {
            text: () => `P1 Color: ${playerColors[settings.p1ColorIndex].name} <span class="color-swatch-circle" style="background-color:${playerColors[settings.p1ColorIndex].hex};"></span>`,
            action: () => cycleColor('p1ColorIndex', 1),
            onPrev: () => cycleColor('p1ColorIndex', -1)
        },
        {
            text: () => `P2 Color: ${playerColors[settings.p2ColorIndex].name} <span class="color-swatch-circle" style="background-color:${playerColors[settings.p2ColorIndex].hex};"></span>`,
            action: () => cycleColor('p2ColorIndex', 1),
            onPrev: () => cycleColor('p2ColorIndex', -1)
        },
        {
            text: () => `Highlight Color: ${highlightColors[settings.highlightColorIndex]}`,
            action: () => cycleSetting('highlightColorIndex', 1, highlightColors.length),
            onPrev: () => cycleSetting('highlightColorIndex', -1, highlightColors.length)
        },
        {
            text: () => {
                if(window.NarbeScanManager) return `Auto Scan: ${window.NarbeScanManager.getSettings().autoScan ? 'On' : 'Off'}`;
                return `Auto Scan: ${settings.autoScan ? 'On' : 'Off'}`;
            },
            action: () => {
                if(window.NarbeScanManager) {
                     window.NarbeScanManager.updateSettings({autoScan: !window.NarbeScanManager.getSettings().autoScan});
                     refreshCurrentMenu();
                } else {
                     toggleSetting('autoScan');
                }
            },
            onPrev: () => {
                 if(window.NarbeScanManager) {
                     window.NarbeScanManager.updateSettings({autoScan: !window.NarbeScanManager.getSettings().autoScan});
                     refreshCurrentMenu();
                } else {
                     toggleSetting('autoScan');
                }
            }
        },
        {
            text: () => {
                 if(window.NarbeScanManager) return `Scan Speed: ${window.NarbeScanManager.getScanInterval()/1000} Seconds`;
                 return `Scan Speed: ${config.scanSpeeds[settings.scanSpeedIndex].label}`;
            },
            action: () => {
                if(window.NarbeScanManager) {
                    window.NarbeScanManager.cycleScanSpeed();
                    refreshCurrentMenu();
                }
                else cycleSetting('scanSpeedIndex', 1, config.scanSpeeds.length);
            },
            onPrev: () => {
                if(window.NarbeScanManager) {
                    window.NarbeScanManager.cycleScanSpeed();
                    refreshCurrentMenu();
                }
                else cycleSetting('scanSpeedIndex', -1, config.scanSpeeds.length);
            }
        },
        { text: "Back", action: () => showMainMenu() }
    ],
    pause: [
        { text: "Continue Game", action: () => resumeGame() },
        { text: "Reset Game", action: () => restartGame() },
        { text: "Settings", action: () => showPauseSettings() },
        { text: "Main Menu", action: () => showMainMenu() }
    ],
    pauseSettings: []
};

// Fill pauseSettings based on settings logic
menus.pauseSettings = menus.settings.map(item => {
    if (item.text === "Back") return { text: "Back", action: () => openPauseMenu() };
    return item;
});


function renderMenu(menuName, menuItems, containerId = 'menu-container') {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    
    if (menuName === 'settings') {
        container.classList.add('settings-layout');
        container.style.display = 'grid';
        container.style.gridTemplateColumns = '1fr 1fr';
        container.style.alignContent = 'center';
    } else {
        container.classList.remove('settings-layout');
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
    }
    
    // Add Title
    const title = document.createElement('div');
    title.className = state.mode === 'menu' ? 'menu-title' : 'pause-title';
    
    if (menuName === 'main') {
        title.innerHTML = `BENNY'S<br>CONNECT FOUR`;
    } else {
        title.innerHTML = menuName === 'settings' ? "SETTINGS" :
                          menuName === 'pause' ? "PAUSED" : 
                          menuName === 'gameover' ? "GAME OVER" : "SETTINGS";
    }
    container.appendChild(title);

    // Add Buttons
    menuItems.forEach((item, idx) => {
        const btn = document.createElement('button');
        btn.className = 'menu-button';
        btn.id = `btn-${containerId}-${idx}`;
        const txt = typeof item.text === 'function' ? item.text() : item.text;
        btn.innerHTML = txt;
        
        btn.onclick = () => {
           if (state.mode === 'menu') state.menuIndex = idx;
           else if (state.mode === 'pause') state.pauseIndex = idx;
           item.action();
        };

        container.appendChild(btn);
    });
    
    updateHighlights();
}

function showMainMenu() {
    state.mode = 'menu';
    state.menuState = 'main';
    state.menuIndex = 0;
    
    document.getElementById('menu-container').style.display = 'flex';
    document.getElementById('game-board-container').style.display = 'none';
    document.getElementById('pause-overlay').style.display = 'none';
    
    const pauseIcon = document.getElementById('pause-button-icon');
    if (pauseIcon) pauseIcon.style.display = 'none';
    
    renderMenu('main', menus.main);
    speak("Benny's Connect Four. Single Player.");
    
    state.scanItems = menus.main;
    startAutoScan();
}

function showMenu(menuName) {
    state.mode = 'menu';
    state.menuState = menuName;
    state.menuIndex = 0;
    
    const pauseIcon = document.getElementById('pause-button-icon');
    if (pauseIcon) pauseIcon.style.display = 'none';

    renderMenu(menuName, menus[menuName]);
    state.scanItems = menus[menuName];
    announceCurrentMenuItem();
    startAutoScan();
}

function openPauseMenu() {
    state.mode = 'pause';
    state.pauseMenuState = 'main';
    state.pauseIndex = -1;
    
    const ov = document.getElementById('pause-overlay');
    ov.style.display = 'flex';
    
    renderMenu('pause', menus.pause, 'pause-overlay');
    state.scanItems = menus.pause;
    speak("Paused");
    startAutoScan();
}

function showPauseSettings() {
    state.pauseMenuState = 'settings';
    state.pauseIndex = 0;
    renderMenu('settings', menus.pauseSettings, 'pause-overlay');
    state.scanItems = menus.pauseSettings;
    announceCurrentMenuItem();
    startAutoScan();
}

function resumeGame() {
    document.getElementById('pause-overlay').style.display = 'none';
    state.mode = 'game';
    updateGameScanItems();
    speak("Resuming Game.");
    startAutoScan();
}

// --- Settings Logic ---

function toggleSetting(key) {
    if (key === 'tts' && window.NarbeVoiceManager) {
        window.NarbeVoiceManager.toggleTTS();
        settings.tts = window.NarbeVoiceManager.getSettings().ttsEnabled;
    } else {
        settings[key] = !settings[key];
    }
    saveSettings();
    refreshCurrentMenu();
}

function cycleSetting(key, dir, max) {
    settings[key] = (settings[key] + dir + max) % max;
    saveSettings();
    if (key === 'themeIndex') applyTheme();
    refreshCurrentMenu();
}

function cycleColor(key, dir) {
    const otherKey = key === 'p1ColorIndex' ? 'p2ColorIndex' : 'p1ColorIndex';
    let nextVal = settings[key];
    
    do {
        nextVal = (nextVal + dir + playerColors.length) % playerColors.length;
    } while(nextVal === settings[otherKey]);
    
    settings[key] = nextVal;
    saveSettings();
    refreshCurrentMenu();
}

function refreshCurrentMenu() {
    if (state.mode === 'menu') {
        renderMenu(state.menuState, menus[state.menuState]);
        state.scanItems = menus[state.menuState];
        announceCurrentMenuItem();
    } else if (state.mode === 'pause') {
        const m = state.pauseMenuState === 'main' ? menus.pause : menus.pauseSettings;
        renderMenu(state.pauseMenuState === 'main' ? 'pause' : 'settings', m, 'pause-overlay');
        state.scanItems = m;
        announceCurrentMenuItem();
    }
}

function toggleHighlightStyle() {
    settings.highlightStyle = settings.highlightStyle === 'outline' ? 'full' : 'outline';
    saveSettings();
    refreshCurrentMenu();
    updateGameHighlights();
}

// --- Game Logic ---

function initBoard() {
    state.board = [];
    for (let r = 0; r < config.rows; r++) {
        state.board.push(Array(config.cols).fill(0));
    }
    state.winningCells = [];
}

function renderBoard() {
    const boardEl = document.getElementById('connect-four-board');
    boardEl.innerHTML = '';
    
    for (let r = 0; r < config.rows; r++) {
        for (let c = 0; c < config.cols; c++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            cell.id = `cell-${r}-${c}`;
            
            cell.onclick = () => handleColumnClick(c);
            
            const pieceVal = state.board[r][c];
            if (pieceVal !== 0) {
                const piece = document.createElement('div');
                piece.className = 'piece';
                piece.id = `piece-${r}-${c}`;
                
                const colorIndex = pieceVal === 1 ? settings.p1ColorIndex : settings.p2ColorIndex;
                piece.style.backgroundColor = playerColors[colorIndex].hex;
                
                // Check if this is a winning cell
                if (state.winningCells.some(wc => wc.r === r && wc.c === c)) {
                    piece.classList.add('winning');
                }
                
                cell.appendChild(piece);
            }
            
            boardEl.appendChild(cell);
        }
    }
    
    updateTurnIndicator();
    updateGameHighlights();
}

function updateTurnIndicator() {
    const indicator = document.getElementById('turn-indicator');
    if (!indicator) return;
    
    const playerName = state.turn === 1 ? "Player 1" : (state.gameMode === 'single' ? "Computer" : "Player 2");
    const colorIndex = state.turn === 1 ? settings.p1ColorIndex : settings.p2ColorIndex;
    
    indicator.innerHTML = `${playerName}'s Turn <div class="preview-piece" style="background-color: ${playerColors[colorIndex].hex}"></div>`;
}

function startGame(mode) {
    state.gameMode = mode;
    state.mode = 'game';
    state.turn = 1;
    state.scanIndex = 0;
    state.winningCells = [];
    
    document.getElementById('menu-container').style.display = 'none';
    document.getElementById('game-board-container').style.display = 'flex';
    
    const pauseIcon = document.getElementById('pause-button-icon');
    if (pauseIcon) pauseIcon.style.display = 'flex';

    initBoard();
    updateGameScanItems();
    renderBoard();
    
    showTurnNotification("Player 1's Turn");
    speak("Game Started. Player 1's Turn.");
    
    startAutoScan();
}

function restartGame() {
    document.getElementById('pause-overlay').style.display = 'none';
    startGame(state.gameMode);
}

function updateGameScanItems() {
    if (state.mode !== 'game') return;
    
    state.scanItems = [];
    
    // Find columns that are not full
    for (let c = 0; c < config.cols; c++) {
        if (state.board[0][c] === 0) {
            state.scanItems.push({
                type: 'column',
                col: c,
                text: `Column ${c + 1}`
            });
        }
    }
    
    // If no valid scan index, reset to 0
    if (state.scanIndex >= state.scanItems.length) {
        state.scanIndex = 0;
    }
}

function handleColumnClick(col) {
    if (state.mode !== 'game') return;
    if (state.gameMode === 'single' && state.turn === -1) return; // Computer's turn
    
    // Check if column is full
    if (state.board[0][col] !== 0) {
        playSound('error');
        speak("Column full");
        return;
    }
    
    dropPiece(col);
}

function dropPiece(col) {
    // Find the lowest empty row in this column
    let targetRow = -1;
    for (let r = config.rows - 1; r >= 0; r--) {
        if (state.board[r][col] === 0) {
            targetRow = r;
            break;
        }
    }
    
    if (targetRow === -1) return; // Column full
    
    // Place piece
    state.board[targetRow][col] = state.turn;
    
    playSound('drop');
    renderBoard();
    
    // Animate the drop
    const piece = document.getElementById(`piece-${targetRow}-${col}`);
    if (piece) {
        piece.classList.add('dropping');
        setTimeout(() => piece.classList.remove('dropping'), 500);
    }
    
    // Check for win
    const winResult = checkWin(targetRow, col);
    if (winResult) {
        state.winningCells = winResult;
        renderBoard(); // Re-render to show winning animation
        
        const winner = state.turn === 1 ? "Player 1" : (state.gameMode === 'single' ? "Computer" : "Player 2");
        gameOver(`${winner} Wins!`);
        return;
    }
    
    // Check for draw
    if (isBoardFull()) {
        gameOver("It's a Draw!");
        return;
    }
    
    // Switch turns
    endTurn();
}

function checkWin(row, col) {
    const player = state.board[row][col];
    const directions = [
        [0, 1],  // Horizontal
        [1, 0],  // Vertical
        [1, 1],  // Diagonal down-right
        [1, -1]  // Diagonal down-left
    ];
    
    for (const [dr, dc] of directions) {
        const cells = [{r: row, c: col}];
        
        // Check in positive direction
        for (let i = 1; i < config.winLength; i++) {
            const r = row + dr * i;
            const c = col + dc * i;
            if (r >= 0 && r < config.rows && c >= 0 && c < config.cols && state.board[r][c] === player) {
                cells.push({r, c});
            } else {
                break;
            }
        }
        
        // Check in negative direction
        for (let i = 1; i < config.winLength; i++) {
            const r = row - dr * i;
            const c = col - dc * i;
            if (r >= 0 && r < config.rows && c >= 0 && c < config.cols && state.board[r][c] === player) {
                cells.push({r, c});
            } else {
                break;
            }
        }
        
        if (cells.length >= config.winLength) {
            return cells;
        }
    }
    
    return null;
}

function isBoardFull() {
    for (let c = 0; c < config.cols; c++) {
        if (state.board[0][c] === 0) return false;
    }
    return true;
}

function endTurn() {
    state.turn = state.turn === 1 ? -1 : 1;
    
    updateGameScanItems();
    state.scanIndex = 0;
    
    renderBoard();
    
    setTimeout(() => {
        let playerText = state.turn === 1 ? "Player 1" : "Player 2";
        if (state.gameMode === 'single' && state.turn === -1) {
            playerText = "Computer";
        }
        
        showTurnNotification(`${playerText}'s Turn`);
        
        if (state.gameMode === 'single' && state.turn === -1) {
            speak("Computer's Turn.");
            setTimeout(computerMove, 800);
        } else {
            speak(`${playerText}'s Turn.`);
            startAutoScan();
        }
    }, 300);
}

function computerMove() {
    // Simple AI: Try to win, block opponent wins, or pick best strategic move
    const validCols = [];
    for (let c = 0; c < config.cols; c++) {
        if (state.board[0][c] === 0) validCols.push(c);
    }
    
    if (validCols.length === 0) return;
    
    // Try to win
    for (const col of validCols) {
        const row = getDropRow(col);
        if (row !== -1) {
            state.board[row][col] = -1;
            if (checkWin(row, col)) {
                state.board[row][col] = 0;
                dropPiece(col);
                return;
            }
            state.board[row][col] = 0;
        }
    }
    
    // Block opponent win
    for (const col of validCols) {
        const row = getDropRow(col);
        if (row !== -1) {
            state.board[row][col] = 1;
            if (checkWin(row, col)) {
                state.board[row][col] = 0;
                dropPiece(col);
                return;
            }
            state.board[row][col] = 0;
        }
    }
    
    // Prefer center columns
    const centerPref = [3, 2, 4, 1, 5, 0, 6];
    for (const col of centerPref) {
        if (validCols.includes(col)) {
            dropPiece(col);
            return;
        }
    }
    
    // Random fallback
    const randomCol = validCols[Math.floor(Math.random() * validCols.length)];
    dropPiece(randomCol);
}

function getDropRow(col) {
    for (let r = config.rows - 1; r >= 0; r--) {
        if (state.board[r][col] === 0) return r;
    }
    return -1;
}

function gameOver(msg) {
    state.mode = 'gameover';
    playSound('win');
    speak("Game Over. " + msg);
    showTurnNotification(msg, 5000);
    
    setTimeout(() => {
        speak("Returning to Main Menu");
        showMainMenu();
    }, 4000);
}

// --- Input Handling & Scanning ---

function setupInput() {
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    
    document.addEventListener('narbe-input-cancelled', (e) => {
        if (e.detail && (e.detail.key === ' ' || e.detail.code === 'Space')) {
            clearTimeout(state.timers.space);
            clearInterval(state.timers.spaceRepeat);
            const wasBackwardScanning = state.timers.spaceRepeat !== null;
            state.timers.spaceRepeat = null;
            state.input.spaceHeld = false;
            if (e.detail.reason === 'too-short' && !wasBackwardScanning) {
                scanNext();
            }
        }
        if (e.detail && (e.detail.key === 'Enter' || e.detail.code === 'Enter' || e.detail.code === 'NumpadEnter')) {
            if (state.timers.enter) clearTimeout(state.timers.enter);
            state.timers.enter = null;
            const wasLongTriggered = state.input.enterLongTriggered;
            state.input.enterLongTriggered = false;
            state.input.enterHeld = false;
            if (e.detail.reason === 'too-short' && !wasLongTriggered) {
                selectCurrentItem();
            }
        }
    });
}

function handleKeyDown(e) {
    if (e.repeat) return;
    
    if (e.code === 'Space') {
        if (!state.input.spaceHeld && !state.timers.space && !state.timers.spaceRepeat) {
            state.input.spaceHeld = true;
            state.input.spaceTime = Date.now();
            state.timers.space = setTimeout(() => {
                startBackwardScanLoop();
                state.timers.space = null;
            }, config.longPress);
        }
    } 
    else if (e.code === 'Enter') {
        if (!state.input.enterHeld && !state.timers.enter) {
            state.input.enterHeld = true;
            state.input.enterTime = Date.now();
            state.timers.enter = setTimeout(() => {
                state.timers.enter = null;
                state.input.enterLongTriggered = true;
                if (state.mode === 'game') openPauseMenu();
            }, config.enterLongPress);
        }
    }
}

function handleKeyUp(e) {
    if (e.code === 'Space') {
        clearTimeout(state.timers.space);
        state.timers.space = null;
        
        const wasBackwardScanning = state.timers.spaceRepeat !== null;
        if (state.timers.spaceRepeat) {
            clearInterval(state.timers.spaceRepeat);
            state.timers.spaceRepeat = null;
        }
        
        if (!wasBackwardScanning) {
            scanNext();
        }
        state.input.spaceHeld = false;
    }
    else if (e.code === 'Enter') {
        if (state.timers.enter) {
            clearTimeout(state.timers.enter);
            state.timers.enter = null;
        }
        
        if (!state.input.enterLongTriggered) {
            selectCurrentItem();
        }
        state.input.enterLongTriggered = false;
        state.input.enterHeld = false;
    }
}

function scanNext() {
    playSound('scan');
    
    if (state.mode === 'game') {
        if (state.scanItems.length === 0) return;
        state.scanIndex = (state.scanIndex + 1) % state.scanItems.length;
        updateGameHighlights();
        announceCurrentGameItem();
    } else {
        const menuLen = state.scanItems.length;
        if (state.mode === 'menu') {
            state.menuIndex = (state.menuIndex + 1) % menuLen;
        } else if (state.mode === 'pause') {
            state.pauseIndex = (state.pauseIndex + 1) % menuLen;
        }
        updateHighlights();
        announceCurrentMenuItem();
    }
    resetAutoScan();
}

function scanPrev() {
    playSound('scan');
    
    if (state.mode === 'game') {
        if (state.scanItems.length === 0) return;
        state.scanIndex = (state.scanIndex - 1 + state.scanItems.length) % state.scanItems.length;
        updateGameHighlights();
        announceCurrentGameItem();
    } else {
        const menuLen = state.scanItems.length;
        if (state.mode === 'menu') {
            state.menuIndex = (state.menuIndex - 1 + menuLen) % menuLen;
        } else if (state.mode === 'pause') {
            state.pauseIndex = (state.pauseIndex - 1 + menuLen) % menuLen;
        }
        updateHighlights();
        announceCurrentMenuItem();
    }
}

function startBackwardScanLoop() {
    scanPrev();
    const interval = window.NarbeScanManager ? window.NarbeScanManager.getScanInterval() : config.scanSpeeds[settings.scanSpeedIndex].val;
    
    state.timers.spaceRepeat = setInterval(() => {
        scanPrev();
    }, interval);
}

function selectCurrentItem() {
    if (state.mode === 'game') {
        if (state.scanItems.length === 0 || state.scanIndex < 0) return;
        const item = state.scanItems[state.scanIndex];
        if (item.type === 'column') {
            playSound('select');
            handleColumnClick(item.col);
        }
    } else {
        let item;
        if (state.mode === 'menu') {
            if (state.menuIndex < 0) return;
            item = menus[state.menuState][state.menuIndex];
        } else if (state.mode === 'pause') {
            if (state.pauseIndex < 0) return;
            const m = state.pauseMenuState === 'main' ? menus.pause : menus.pauseSettings;
            item = m[state.pauseIndex];
        }
        
        if (item && item.action) {
            playSound('select');
            item.action();
        }
    }
}

// --- Highlighting UI ---

function updateHighlights() {
    if (state.mode === 'menu' || state.mode === 'pause') {
        document.querySelectorAll('.menu-button').forEach(b => {
            b.classList.remove('highlight');
            b.style.borderColor = 'transparent';
            b.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
            b.style.color = '#333';
        });
        
        let container = state.mode === 'menu' ? 'menu-container' : 'pause-overlay';
        let idx = state.mode === 'menu' ? state.menuIndex : state.pauseIndex;
        
        const btn = document.getElementById(`btn-${container}-${idx}`);
        if (!btn) {
            const c = document.getElementById(container === 'pause-overlay' ? 'pause-overlay' : 'menu-container');
            const buttons = c.querySelectorAll('button');
            if (buttons[idx]) {
                highlightButton(buttons[idx]);
            }
        } else {
            highlightButton(btn);
        }
    }
}

function highlightButton(btn) {
    btn.classList.add('highlight');
    const uiColor = highlightColors[settings.highlightColorIndex];
    
    if (settings.highlightStyle === 'full') {
        btn.style.backgroundColor = uiColor;
        btn.style.color = '#000';
        btn.style.borderColor = 'transparent';
    } else {
        btn.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
        btn.style.color = '#333';
        btn.style.borderColor = uiColor;
        btn.style.borderWidth = '6px';
    }
}

function updateGameHighlights() {
    // Clear old highlights on arrows
    document.querySelectorAll('.column-arrow').forEach(a => {
        a.classList.remove('highlight-outline', 'highlight-full');
        a.style.boxShadow = '';
        a.style.backgroundColor = '';
    });
    
    // Clear old preview pieces and target cells
    document.querySelectorAll('.piece.preview').forEach(p => p.remove());
    document.querySelectorAll('.cell.preview-target').forEach(c => c.classList.remove('preview-target'));
    
    // Update disabled state
    for (let c = 0; c < config.cols; c++) {
        const arrow = document.getElementById(`arrow-${c}`);
        if (arrow) {
            if (state.board[0][c] !== 0) {
                arrow.classList.add('disabled');
            } else {
                arrow.classList.remove('disabled');
            }
        }
    }
    
    if (state.scanItems.length === 0) return;
    if (state.scanIndex < 0 || state.scanIndex >= state.scanItems.length) return;
    
    const item = state.scanItems[state.scanIndex];
    if (item.type === 'column') {
        const color = highlightColors[settings.highlightColorIndex];
        
        // Highlight the arrow
        const arrow = document.getElementById(`arrow-${item.col}`);
        if (arrow) {
            if (settings.highlightStyle === 'full') {
                arrow.classList.add('highlight-full');
                arrow.style.backgroundColor = color;
            } else {
                arrow.classList.add('highlight-outline');
                arrow.style.boxShadow = `inset 0 0 0 6px ${color}, 0 0 20px ${color}`;
            }
        }
        
        // Show preview piece where it will land
        const targetRow = getDropRow(item.col);
        if (targetRow !== -1) {
            const cell = document.getElementById(`cell-${targetRow}-${item.col}`);
            if (cell) {
                cell.classList.add('preview-target');
                
                // Add preview piece
                const preview = document.createElement('div');
                preview.className = 'piece preview';
                const colorIndex = state.turn === 1 ? settings.p1ColorIndex : settings.p2ColorIndex;
                preview.style.backgroundColor = playerColors[colorIndex].hex;
                preview.style.color = playerColors[colorIndex].hex; // For box-shadow currentColor
                cell.appendChild(preview);
            }
        }
    }
}

// --- TTS & Autoscan ---

function speak(text) {
    if (window.NarbeVoiceManager) {
        window.NarbeVoiceManager.speak(text);
    } else if (settings.tts && 'speechSynthesis' in window) {
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        speechSynthesis.speak(u);
    }
}

function announceCurrentMenuItem() {
    let item;
    if (state.mode === 'menu') item = menus[state.menuState][state.menuIndex];
    else if (state.mode === 'pause') {
        const m = state.pauseMenuState === 'main' ? menus.pause : menus.pauseSettings;
        item = m[state.pauseIndex];
    }
    
    if (item) {
        let t = typeof item.text === 'function' ? item.text() : item.text;
        t = t.replace(/<[^>]*>?/gm, '');
        speak(t);
    }
}

function announceCurrentGameItem() {
    if (state.scanItems.length === 0) return;
    const item = state.scanItems[state.scanIndex];
    if (item && item.text) {
        speak(item.text);
    }
}

function startAutoScan() {
    resetAutoScan(); 
}

function resetAutoScan() {
    if (state.timers.autoScan) clearInterval(state.timers.autoScan);
    
    const isAuto = (typeof window.NarbeScanManager !== 'undefined') ? window.NarbeScanManager.getSettings().autoScan : settings.autoScan;

    if (isAuto) {
        const interval = (typeof window.NarbeScanManager !== 'undefined') ? window.NarbeScanManager.getScanInterval() : config.scanSpeeds[settings.scanSpeedIndex].val;
        if (interval > 0) {
            state.timers.autoScan = setInterval(() => {
                scanNext();
            }, interval);
        }
    }
}

function applyTheme() {
    const theme = themes[settings.themeIndex];
    if (theme) {
        document.body.style.background = theme.bg;
        document.body.style.backgroundSize = "cover";
        document.body.style.backgroundAttachment = "fixed";
    }
}

function showTurnNotification(text, duration = 1500) {
    const el = document.getElementById('status-display');
    if (!el) return;
    el.innerText = text;
    el.classList.add('visible');
    
    if (state.timers.status) clearTimeout(state.timers.status);
    
    state.timers.status = setTimeout(() => {
        el.classList.remove('visible');
    }, duration);
}
