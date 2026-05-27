// Battleship game script - Combined Grid Interface with Scan/Select Accessibility
// Configuration
const config = {
    longPress: 3000,     // 3 seconds for backward scanning
    enterLongPress: 3000, // 3 seconds for going back
    pauseLongPress: 5000  // 5 seconds to open pause menu (during gameplay only)
};

// DOM references
let placementBoard, attackGrid, defenseGrid, statusText;

const letters = ['A','B','C','D','E','F','G','H','I','J'];
const numbers = ['1','2','3','4','5','6','7','8','9','10'];

// Ship definitions for each player
const shipSpecs = [
    { id: 'destroyer', label: 'Destroyer', length: 2, emoji: '🚤' },
    { id: 'submarine', label: 'Submarine', length: 3, emoji: '🔱' },
    { id: 'cruiser', label: 'Cruiser', length: 3, emoji: '⛵' },
    { id: 'battleship', label: 'Battleship', length: 4, emoji: '🚢' },
    { id: 'carrier', label: 'Carrier', length: 5, emoji: '✈️' }
];

// Game mode: '1p' or '2p'
let gameMode = '1p';

// Current game phase: 'attack' or 'defense'
let gamePhase = 'attack';

// Player 1 data (always the human in 1P, first human in 2P)
let player1 = {
    ships: [],
    cells: [],
    attacks: []  // Where this player has fired
};

// Player 2 data (AI in 1P, second human in 2P)
let player2 = {
    ships: [],
    cells: [],
    attacks: []  // Where this player has fired
};

// Current player (1 or 2)
let currentPlayer = 1;

// Legacy aliases for compatibility
let ships = [];        // Current player's ships during placement
let playerCells = [];  // Current player's cells
let enemyCells = [];   // Enemy's cells

let currentShipIndex = 0;
let placementOrientation = 'horizontal';
let gameStarted = false;
let playerTurn = true;
let enemyShips = [];  // AI ships in 1P mode
let awaitingEnemy = false;
let movingShip = false;
let firstAttackTurn = true;  // Track first turn to start in deadzone

// AI targeting state
let aiTargetQueue = [];
let aiHitStack = [];

// =========================================
// SETTINGS
// =========================================
const themes = [
    { name: 'Ocean', background: 'linear-gradient(135deg, #0a1628 0%, #1a3a5c 50%, #0d2137 100%)', cardBg: 'rgba(0, 40, 80, 0.7)', menuBg: 'radial-gradient(circle at top, #0a2a4b 0%, #02111f 60%)', buttonBg: 'linear-gradient(135deg, #1c4d8a 0%, #2563a8 100%)' },
    { name: 'Classic', background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f0f1a 100%)', cardBg: 'rgba(30, 30, 50, 0.7)', menuBg: 'radial-gradient(circle at top, #1a1a2e 0%, #0f0f1a 60%)', buttonBg: 'linear-gradient(135deg, #3a3a5e 0%, #4a4a7e 100%)' },
    { name: 'Sunset', background: 'linear-gradient(135deg, #2d1b4e 0%, #4a2c6e 50%, #1a1030 100%)', cardBg: 'rgba(60, 30, 80, 0.7)', menuBg: 'radial-gradient(circle at top, #4a2c6e 0%, #1a1030 60%)', buttonBg: 'linear-gradient(135deg, #6b3fa0 0%, #8b5fbf 100%)' },
    { name: 'Forest', background: 'linear-gradient(135deg, #0d2818 0%, #1a4a2e 50%, #0a1f15 100%)', cardBg: 'rgba(20, 60, 40, 0.7)', menuBg: 'radial-gradient(circle at top, #1a4a2e 0%, #0a1f15 60%)', buttonBg: 'linear-gradient(135deg, #2a6a4a 0%, #3a8a5a 100%)' }
];

const highlightColors = [
    { name: 'Gold', color: '#ffd700' },
    { name: 'Cyan', color: '#00ffff' },
    { name: 'Magenta', color: '#ff00ff' },
    { name: 'Lime', color: '#00ff00' },
    { name: 'Orange', color: '#ff8800' }
];

const highlightStyles = [
    { name: 'Glow', style: 'glow' },
    { name: 'Outline', style: 'outline' },
    { name: 'Solid', style: 'solid' }
];

const scanSpeeds = [
    { name: '1 Second', interval: 1000 },
    { name: '2 Seconds', interval: 2000 },
    { name: '3 Seconds', interval: 3000 },
    { name: '4 Seconds', interval: 4000 }
];

const settings = {
    tts: true,
    sound: true,
    themeIndex: 0,
    highlightColorIndex: 0,
    highlightStyleIndex: 0,
    scanSpeedIndex: 1  // 2 Seconds default
};

function loadSettings() {
    const saved = localStorage.getItem('battleBoatsSettings');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            Object.assign(settings, parsed);
        } catch (e) {
            console.error('Failed to load settings:', e);
        }
    }
    applyTheme();
    applyHighlightStyle();
}

function saveSettings() {
    localStorage.setItem('battleBoatsSettings', JSON.stringify(settings));
}

function applyTheme() {
    const theme = themes[settings.themeIndex];
    document.body.style.background = theme.background;
    document.documentElement.style.setProperty('--card-bg', theme.cardBg);
    document.documentElement.style.setProperty('--menu-bg', theme.menuBg);
    document.documentElement.style.setProperty('--button-bg', theme.buttonBg);
    
    // Apply to menu screens
    document.querySelectorAll('.menu-screen').forEach(screen => {
        screen.style.background = theme.menuBg;
    });
    
    // Apply to menu buttons
    document.querySelectorAll('.menu-button').forEach(btn => {
        btn.style.background = theme.buttonBg;
    });
}

function applyHighlightStyle() {
    const color = highlightColors[settings.highlightColorIndex].color;
    const style = highlightStyles[settings.highlightStyleIndex].style;
    
    document.documentElement.style.setProperty('--highlight-color', color);
    document.documentElement.style.setProperty('--highlight-style', style);
    
    // Update CSS variables for scan highlight
    const root = document.documentElement;
    root.style.setProperty('--scan-highlight-color', color);
    
    // Remove previous style classes
    document.body.classList.remove('highlight-glow', 'highlight-outline', 'highlight-solid');
    document.body.classList.add(`highlight-${style}`);
}

function toggleTTS() {
    settings.tts = !settings.tts;
    saveSettings();
    updateSettingsDisplay();
    if (settings.tts) speak('Text to speech on');
}

function toggleSound() {
    settings.sound = !settings.sound;
    saveSettings();
    updateSettingsDisplay();
    if (settings.sound) playSound('select');
}

function cycleTheme() {
    settings.themeIndex = (settings.themeIndex + 1) % themes.length;
    saveSettings();
    applyTheme();
    updateSettingsDisplay();
    speak(themes[settings.themeIndex].name + ' theme');
}

function cycleHighlightColor() {
    settings.highlightColorIndex = (settings.highlightColorIndex + 1) % highlightColors.length;
    saveSettings();
    applyHighlightStyle();
    updateSettingsDisplay();
    speak(highlightColors[settings.highlightColorIndex].name);
}

function cycleHighlightStyle() {
    settings.highlightStyleIndex = (settings.highlightStyleIndex + 1) % highlightStyles.length;
    saveSettings();
    applyHighlightStyle();
    updateSettingsDisplay();
    speak(highlightStyles[settings.highlightStyleIndex].name + ' style');
}

function toggleAutoScan() {
    // Toggle via scan-manager
    if (window.NarbeScanManager) {
        const currentSettings = window.NarbeScanManager.getSettings();
        window.NarbeScanManager.updateSettings({ autoScan: !currentSettings.autoScan });
    }
    updateSettingsDisplay();
    const isOn = window.NarbeScanManager ? window.NarbeScanManager.getSettings().autoScan : false;
    speak(isOn ? 'Auto scan on' : 'Auto scan off');
    restartAutoScan();
}

function cycleScanSpeed() {
    if (window.NarbeScanManager) {
        window.NarbeScanManager.cycleScanSpeed();
        const speedSeconds = window.NarbeScanManager.getScanInterval() / 1000;
        speak(`${speedSeconds} seconds`);
    } else {
        settings.scanSpeedIndex = (settings.scanSpeedIndex + 1) % scanSpeeds.length;
        saveSettings();
        speak(scanSpeeds[settings.scanSpeedIndex].name);
    }
    updateSettingsDisplay();
    updatePauseSettingsDisplay();
    restartAutoScan();
}

function updateSettingsDisplay() {
    const ttsBtn = document.getElementById('ttsBtn');
    const soundBtn = document.getElementById('soundBtn');
    const themeBtn = document.getElementById('themeBtn');
    const highlightStyleBtn = document.getElementById('highlightStyleBtn');
    const highlightColorBtn = document.getElementById('highlightColorBtn');
    const autoScanBtn = document.getElementById('autoScanBtn');
    const scanSpeedBtn = document.getElementById('scanSpeedBtn');
    
    const autoScanOn = window.NarbeScanManager ? window.NarbeScanManager.getSettings().autoScan : false;
    const scanSpeedText = window.NarbeScanManager ? 
        `${window.NarbeScanManager.getScanInterval() / 1000} Seconds` : 
        scanSpeeds[settings.scanSpeedIndex].name;
    
    if (ttsBtn) ttsBtn.textContent = `TTS: ${settings.tts ? 'On' : 'Off'}`;
    if (soundBtn) soundBtn.textContent = `Sound: ${settings.sound ? 'On' : 'Off'}`;
    if (themeBtn) themeBtn.textContent = `Theme: ${themes[settings.themeIndex].name}`;
    if (highlightStyleBtn) highlightStyleBtn.textContent = `Style: ${highlightStyles[settings.highlightStyleIndex].name}`;
    if (highlightColorBtn) highlightColorBtn.textContent = `Color: ${highlightColors[settings.highlightColorIndex].name}`;
    if (autoScanBtn) autoScanBtn.textContent = `Auto Scan: ${autoScanOn ? 'On' : 'Off'}`;
    if (scanSpeedBtn) scanSpeedBtn.textContent = `Speed: ${scanSpeedText}`;
}

// =========================================
// SCANNING STATE & ACCESSIBILITY
// =========================================
const scanState = {
    // Current scan mode
    mode: 'main-menu',  // 'main-menu', 'settings-menu', 'buttons', 'ships', 'modal', 'row', 'cell', 'game-row', 'game-cell', 'game-over', 'pause', 'cover'
    
    // Indices
    scanIndex: -1,           // Current scan position
    rowIndex: -1,            // Selected row for cell scanning (A-J)
    cellIndex: -1,           // Current cell in row (column 1-10)
    
    // Additional timer for Enter long-press
    enterTimer: null,
    
    // Scannable items
    mainMenuButtons: [],     // Main menu buttons [1 Player, 2 Players, Settings, Exit]
    settingsButtons: [],     // Settings menu buttons
    menuButtons: [],         // [Back, Randomize, Place Ships] buttons
    shipButtons: [],         // Ship cells on grid (for selecting ships)
    modalButtons: [],        // Modal action buttons
    gameOverButtons: [],     // Game over modal buttons
    pauseButtons: [],        // Pause modal buttons
    pauseSettingsButtons: [], // Pause settings modal buttons
    coverButtons: [],        // Cover screen ready button
    
    // Input tracking
    spaceHeld: false,
    spaceStartTime: 0,
    enterHeld: false,
    enterStartTime: 0,
    enterLongTriggered: false,
    lastInputTime: 0,        // Anti-tremor: track last valid input time
    
    // Timers
    spaceTimer: null,
    spaceRepeatInterval: null,
    autoScanTimer: null,
    
    // Previous mode (for returning from settings accessed via pause)
    previousMode: null
};

// =========================================
// AUDIO CONTEXT FOR SOUNDS
// =========================================
let audioCtx = null;
function getAudioCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(()=>{});
    return audioCtx;
}

window.addEventListener('touchstart', () => { getAudioCtx(); }, { once: true, passive: true });
window.addEventListener('click', () => { getAudioCtx(); }, { once: true });

function playSound(type) {
    if (!settings.sound && type !== 'scan') return;  // Always allow scan sound for feedback
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
    } else if (type === 'place') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(523, ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(784, ctx.currentTime + 0.15);
        gainNode.gain.setValueAtTime(0.15, ctx.currentTime);
        osc.start();
        osc.stop(ctx.currentTime + 0.2);
    } else if (type === 'hit') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(300, ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(150, ctx.currentTime + 0.3);
        gainNode.gain.setValueAtTime(0.2, ctx.currentTime);
        osc.start();
        osc.stop(ctx.currentTime + 0.3);
    } else if (type === 'miss') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(200, ctx.currentTime);
        gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
        osc.start();
        osc.stop(ctx.currentTime + 0.15);
    } else if (type === 'win') {
        const notes = [523, 659, 784, 1047];
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

// =========================================
// TTS (Text-to-Speech)
// =========================================
function speak(text) {
    if (!settings.tts) return;  // Respect TTS setting
    if (window.NarbeVoiceManager) {
        window.NarbeVoiceManager.speak(text);
    } else if ('speechSynthesis' in window) {
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        speechSynthesis.speak(u);
    }
}

function updateTurnIndicator() {
    const indicator = document.getElementById('turnIndicator');
    if (!indicator) return;
    
    if (!gameStarted) {
        indicator.textContent = '';
        indicator.className = 'turn-indicator';
        return;
    }
    
    if (playerTurn && !awaitingEnemy) {
        indicator.textContent = '🎯 Your Turn';
        indicator.className = 'turn-indicator player-turn';
    } else {
        indicator.textContent = '💣 Enemy Turn';
        indicator.className = 'turn-indicator enemy-turn';
    }
}

function createGrid(container, isPlayer, isAttackGrid = false) {
    container.innerHTML = '';
    for (let row = -1; row < 10; row++) {
        for (let col = -1; col < 10; col++) {
            const cell = document.createElement('div');
            if (row === -1 && col === -1) {
                cell.className = 'grid-label';
                cell.textContent = '';
            } else if (row === -1) {
                cell.className = 'grid-label';
                cell.textContent = numbers[col];
            } else if (col === -1) {
                cell.className = 'grid-label';
                cell.textContent = letters[row];
            } else {
                cell.className = 'grid-cell';
                cell.dataset.row = row;
                cell.dataset.col = col;
                if (isPlayer) {
                    cell.addEventListener('click', () => handlePlayerGridClick(row, col));
                } else if (isAttackGrid) {
                    cell.addEventListener('click', () => handleAttackGridClick(row, col));
                }
            }
            container.appendChild(cell);
        }
    }
}

function handleAttackGridClick(row, col) {
    // Only allow clicks during attack phase and when it's player's turn
    if (!gameStarted) return;
    if (gamePhase !== 'attack') return;
    if (awaitingEnemy) return;
    
    // Check if already fired here
    if (isCellAlreadyFired(row, col)) {
        playSound('error');
        speak('Already fired here.');
        return;
    }
    
    fireAtEnemy(row, col);
}

function initBoardArrays() {
    playerCells = Array.from({ length: 10 }, () => Array.from({ length: 10 }, () => ({ occupied: false, hit: false, miss: false }))); 
    enemyCells = Array.from({ length: 10 }, () => Array.from({ length: 10 }, () => ({ occupied: false, hit: false, miss: false })));
}

function renderBoards() {
    // Use placementBoard during placement, otherwise playerBoard
    const board = placementBoard || playerBoard;
    if (!board) return;
    const playerTiles = board.querySelectorAll('.grid-cell');
    playerTiles.forEach(tile => {
        const row = Number(tile.dataset.row);
        const col = Number(tile.dataset.col);
        const p = playerCells[row][col];
        const e = (enemyCells && enemyCells[row]) ? enemyCells[row][col] : null;
        
        // Clear previous classes
        tile.classList.remove('occupied', 'selected-ship', 'player-hit', 'enemy-hit', 'player-miss');
        
        tile.classList.toggle('occupied', !!p.occupied);
        tile.classList.toggle('player-hit', !!(p.hit || p.miss));
        tile.classList.toggle('enemy-hit', !!(e && e.hit));
        tile.classList.toggle('player-miss', !!(e && e.miss));
        
        // Highlight selected ship during placement phase (only when actively placing/moving a ship)
        // Don't highlight when in buttons mode or ships scanning mode
        if (!gameStarted && (scanState.mode === 'row' || scanState.mode === 'cell' || scanState.mode === 'modal')) {
            const currentShip = ships[currentShipIndex];
            if (currentShip && currentShip.placed) {
                const isPartOfSelected = currentShip.coords.some(c => c.row === row && c.col === col);
                tile.classList.toggle('selected-ship', isPartOfSelected);
            }
        }
    });
}

function updateShipDisplay() {
    // Ship display UI has been removed - this function is now a no-op
    // Keeping for backwards compatibility with existing code
}

function cycleShip(direction) {
    currentShipIndex += direction;
    if (currentShipIndex < 0) currentShipIndex = ships.length - 1;
    if (currentShipIndex >= ships.length) currentShipIndex = 0;
    
    // Get orientation from current ship if placed
    const ship = ships[currentShipIndex];
    if (ship.placed && ship.coords.length > 1) {
        const isHorizontal = ship.coords[0].row === ship.coords[1].row;
        placementOrientation = isHorizontal ? 'horizontal' : 'vertical';
    }
    
    updateShipDisplay();
    renderBoards();
    updateStatus(`Selected: ${ship.label}. Click grid to reposition or rotate.`);
}

function rotateCurrentShip() {
    const ship = ships[currentShipIndex];
    
    if (ship.placed) {
        // Rotate placed ship
        if (rotatePlacedShip(ship)) {
            // Update orientation display
            const isHorizontal = ship.coords[0].row === ship.coords[1].row;
            placementOrientation = isHorizontal ? 'horizontal' : 'vertical';
            updateShipDisplay();
            renderBoards();
            updateStatus(`Rotated ${ship.label}.`);
        } else {
            updateStatus(`Cannot rotate ${ship.label} - not enough space.`);
        }
    } else {
        // Just toggle orientation for next placement
        placementOrientation = placementOrientation === 'horizontal' ? 'vertical' : 'horizontal';
        updateShipDisplay();
    }
}

function rotatePlacedShip(ship) {
    if (!ship.placed) return false;
    const horizontal = ship.coords.every(coord => coord.row === ship.coords[0].row);
    const orientation = horizontal ? 'vertical' : 'horizontal';
    const anchor = ship.coords.reduce((best, coord) => {
        if (!best) return coord;
        if (coord.row < best.row || (coord.row === best.row && coord.col < best.col)) return coord;
        return best;
    }, null);
    
    // Clear current position
    ship.coords.forEach(coord => { playerCells[coord.row][coord.col].occupied = false; });
    
    const origin = getPlacementOrigin(anchor.row, anchor.col, ship.length, orientation);
    if (!canPlaceShip(origin.row, origin.col, ship.length, orientation)) {
        // Restore original position
        ship.coords.forEach(coord => { playerCells[coord.row][coord.col].occupied = true; });
        return false;
    }
    
    const rotatedCoords = [];
    for (let offset = 0; offset < ship.length; offset++) {
        const r = orientation === 'vertical' ? origin.row + offset : origin.row;
        const c = orientation === 'horizontal' ? origin.col + offset : origin.col;
        playerCells[r][c].occupied = true;
        rotatedCoords.push({ row: r, col: c, hit: false });
    }
    ship.coords = rotatedCoords;
    return true;
}

function updateStatus(message) {
    if (statusText) statusText.textContent = message;
}

function getCellLabel(row, col) { return `${letters[row]}${numbers[col]}`; }

function getPlacementOrigin(row, col, shipLength, orientation) {
    if (orientation === 'horizontal') return { row, col: Math.min(col, 10 - shipLength) };
    return { row: Math.min(row, 10 - shipLength), col };
}

function canPlaceShip(row, col, shipLength, orientation, excludeShipId = null) {
    const origin = getPlacementOrigin(row, col, shipLength, orientation);
    const rowMax = orientation === 'vertical' ? origin.row + shipLength - 1 : origin.row;
    const colMax = orientation === 'horizontal' ? origin.col + shipLength - 1 : origin.col;
    if (rowMax > 9 || colMax > 9) return false;
    
    for (let offset = 0; offset < shipLength; offset++) {
        const r = orientation === 'vertical' ? origin.row + offset : origin.row;
        const c = orientation === 'horizontal' ? origin.col + offset : origin.col;
        if (playerCells[r][c].occupied) {
            // Check if this cell belongs to the ship we're moving
            if (excludeShipId) {
                const excludeShip = ships.find(s => s.id === excludeShipId);
                if (excludeShip && excludeShip.coords.some(coord => coord.row === r && coord.col === c)) {
                    continue; // Allow overlap with self
                }
            }
            return false;
        }
    }
    return true;
}

function placeShipAt(row, col) {
    const ship = ships[currentShipIndex];
    
    // Clear current position if placed
    if (ship.placed) {
        ship.coords.forEach(coord => { playerCells[coord.row][coord.col].occupied = false; });
        ship.coords = [];
        ship.placed = false;
    }
    
    const origin = getPlacementOrigin(row, col, ship.length, placementOrientation);
    if (!canPlaceShip(origin.row, origin.col, ship.length, placementOrientation)) {
        updateStatus('Cannot place here - collision or out of bounds.');
        return false;
    }
    
    const coords = [];
    for (let offset = 0; offset < ship.length; offset++) {
        const r = placementOrientation === 'vertical' ? origin.row + offset : origin.row;
        const c = placementOrientation === 'horizontal' ? origin.col + offset : origin.col;
        playerCells[r][c].occupied = true;
        coords.push({ row: r, col: c, hit: false });
    }
    ship.placed = true;
    ship.coords = coords;
    
    renderBoards();
    updateStatus(`Placed ${ship.label}. Use arrows to select another ship.`);
    return true;
}

function randomizeAllShips() {
    // Clear all placements
    ships.forEach(s => {
        if (s.placed) {
            s.coords.forEach(coord => { playerCells[coord.row][coord.col].occupied = false; });
        }
        s.placed = false;
        s.sunk = false;
        s.coords = [];
    });
    
    // Randomize each ship
    ships.forEach(ship => {
        let placed = false;
        let attempts = 0;
        while (!placed && attempts < 2000) {
            attempts++;
            const orientation = Math.random() < 0.5 ? 'horizontal' : 'vertical';
            const startRow = Math.floor(Math.random() * 10);
            const startCol = Math.floor(Math.random() * 10);
            
            const origin = getPlacementOrigin(startRow, startCol, ship.length, orientation);
            if (!canPlaceShip(origin.row, origin.col, ship.length, orientation)) continue;
            
            const coords = [];
            for (let offset = 0; offset < ship.length; offset++) {
                const r = orientation === 'vertical' ? origin.row + offset : origin.row;
                const c = orientation === 'horizontal' ? origin.col + offset : origin.col;
                playerCells[r][c].occupied = true;
                coords.push({ row: r, col: c, hit: false });
            }
            ship.placed = true;
            ship.coords = coords;
            placed = true;
        }
    });
    
    // Update display for current ship
    const ship = ships[currentShipIndex];
    if (ship.placed && ship.coords.length > 1) {
        const isHorizontal = ship.coords[0].row === ship.coords[1].row;
        placementOrientation = isHorizontal ? 'horizontal' : 'vertical';
    }
    
    movingShip = false;
    updateShipDisplay();
    renderBoards();
    updateStatus('Ships randomized! Click a ship to modify.');
}

function findShipAtCell(row, col) {
    for (let i = 0; i < ships.length; i++) {
        const ship = ships[i];
        if (ship.placed && ship.coords.some(c => c.row === row && c.col === col)) {
            return i;
        }
    }
    return -1;
}

function handlePlayerGridClick(row, col) {
    if (!gameStarted) {
        // Placement phase
        if (movingShip) {
            // We're in move mode - place the ship here
            placeShipAt(row, col);
            movingShip = false;
            updateStatus(`Placed ${ships[currentShipIndex].label}. Click a ship to modify.`);
            return;
        }
        
        const clickedShipIndex = findShipAtCell(row, col);
        
        if (clickedShipIndex !== -1) {
            // Clicked on a ship - select it and show modal
            currentShipIndex = clickedShipIndex;
            const ship = ships[currentShipIndex];
            
            // Update orientation based on ship's current orientation
            if (ship.coords.length > 1) {
                const isHorizontal = ship.coords[0].row === ship.coords[1].row;
                placementOrientation = isHorizontal ? 'horizontal' : 'vertical';
            }
            
            updateShipDisplay();
            renderBoards();
            showShipActionModal(ship);
        } else {
            // Clicked on empty cell - do nothing unless moving
            updateStatus('Click on a ship to select it.');
        }
    } else {
        // Game phase - fire at enemy
        fireAtEnemy(row, col);
    }
}

function showShipActionModal(ship) {
    const modal = document.getElementById('shipActionModal');
    const title = document.getElementById('shipActionTitle');
    const preview = document.getElementById('shipActionPreview');
    
    if (title) title.textContent = ship.label;
    
    if (preview) {
        const isHorizontal = ship.coords.length > 1 && ship.coords[0].row === ship.coords[1].row;
        const orientClass = isHorizontal ? '' : 'vertical';
        let html = `<div class="ship-graphic ${orientClass}">`;
        for (let i = 0; i < ship.length; i++) {
            html += '<div class="ship-cell"></div>';
        }
        html += '</div>';
        preview.innerHTML = html;
    }
    
    if (modal) modal.style.display = 'flex';
    
    // Switch to modal scanning mode
    scanState.mode = 'modal';
    scanState.scanIndex = -1;
    clearAllHighlights();
    speak(`${ship.label} selected. Rotate Ship, Move Ship, or Cancel.`);
    startAutoScan();
}

function hideShipActionModal() {
    const modal = document.getElementById('shipActionModal');
    if (modal) modal.style.display = 'none';
    
    // Return to button scanning mode
    scanState.mode = 'buttons';
    scanState.scanIndex = -1;
    clearAllHighlights();
    startAutoScan();
}

function rotateFromModal() {
    rotateCurrentShip();
    // Update preview in modal
    const ship = ships[currentShipIndex];
    const preview = document.getElementById('shipActionPreview');
    if (preview && ship.placed) {
        const isHorizontal = ship.coords[0].row === ship.coords[1].row;
        const orientClass = isHorizontal ? '' : 'vertical';
        let html = `<div class="ship-graphic ${orientClass}">`;
        for (let i = 0; i < ship.length; i++) {
            html += '<div class="ship-cell"></div>';
        }
        html += '</div>';
        preview.innerHTML = html;
    }
    renderBoards();
    
    // Announce rotation
    const orientation = ship.coords[0].row === ship.coords[1].row ? 'horizontal' : 'vertical';
    speak(`Ship rotated to ${orientation}.`);
}

function moveFromModal() {
    hideShipActionModal();
    movingShip = true;
    
    // Switch to row scanning mode for placement - start in deadzone
    scanState.mode = 'row';
    scanState.rowIndex = -1;  // Start in deadzone so first scan goes to row A
    clearAllHighlights();
    speak(`Moving ${ships[currentShipIndex].label}. Scan rows with Space. Press Enter to select row.`);
    updateStatus(`Scan rows to place ${ships[currentShipIndex].label}.`);
    startAutoScan();
}

function startGame() {
    // Check all ships are placed
    const allPlaced = ships.every(s => s.placed);
    if (!allPlaced) {
        updateStatus('Place all ships before starting!');
        speak('Place all ships before starting!');
        return;
    }
    
    if (gameMode === '2p') {
        // 2-Player mode: Handle ship placement for both players
        if (currentPlayer === 1) {
            // Save Player 1's ships and cells
            player1.ships = ships.map(s => ({...s, coords: s.coords.map(c => ({...c}))}));
            player1.cells = playerCells.map(row => row.map(cell => ({...cell})));
            
            // Switch to Player 2 placement
            currentPlayer = 2;
            ships = player2.ships;
            playerCells = player2.cells = Array.from({ length: 10 }, () => 
                Array.from({ length: 10 }, () => ({ occupied: false, hit: false, miss: false }))
            );
            
            // Show cover screen for Player 2 to place ships
            showCoverScreen(1, 2, 'placement');
            return;
        } else {
            // Player 2 finished placing - save their ships
            player2.ships = ships.map(s => ({...s, coords: s.coords.map(c => ({...c}))}));
            player2.cells = playerCells.map(row => row.map(cell => ({...cell})));
            
            // Initialize attacks arrays for both players
            player1.attacks = Array.from({ length: 10 }, () => 
                Array.from({ length: 10 }, () => ({ fired: false, hit: false }))
            );
            player2.attacks = Array.from({ length: 10 }, () => 
                Array.from({ length: 10 }, () => ({ fired: false, hit: false }))
            );
            
            // Start the game with Player 1 attacking
            currentPlayer = 1;
            startBattlePhase();
            return;
        }
    }
    
    // 1-Player mode: Sync player1 data with placed ships, then generate AI enemy and start
    player1.ships = ships.map(s => ({...s, coords: s.coords.map(c => ({...c}))}));
    player1.cells = playerCells;  // Use same reference so hits are reflected
    generateEnemyFleet();
    startBattlePhase();
}

function startBattlePhase() {
    gameStarted = true;
    gamePhase = 'attack';
    
    // Hide placement screen
    document.getElementById('placementScreen').classList.add('hidden');
    
    // Initialize grids
    attackGrid = document.getElementById('attackGrid');
    defenseGrid = document.getElementById('defenseGrid');
    createGrid(attackGrid, false, true);  // Attack grid with click handlers for firing
    createGrid(defenseGrid, false);        // Defense grid (view only, no clicks)
    
    // Initialize ship status displays
    initShipStatusDisplays();
    
    // Show attack phase screen
    switchToAttackPhase();
}

function initShipStatusDisplays() {
    // Enemy ship status (what we've sunk)
    const enemyStatus = document.getElementById('enemyShipStatus');
    if (enemyStatus) {
        enemyStatus.innerHTML = '';
        const enemyShipList = gameMode === '2p' ? player2.ships : enemyShips;
        enemyShipList.forEach(ship => {
            const icon = document.createElement('div');
            icon.className = 'ship-icon';
            icon.id = `enemy-ship-${ship.id}`;
            icon.innerHTML = `
                <span class="ship-icon-emoji">${ship.emoji || '🚢'}</span>
                <span class="ship-icon-name">${ship.label}</span>
            `;
            enemyStatus.appendChild(icon);
        });
    }
    
    // Player ship status (what enemy has sunk)
    const playerStatus = document.getElementById('playerShipStatus');
    if (playerStatus) {
        playerStatus.innerHTML = '';
        const playerShipList = gameMode === '2p' ? player1.ships : ships;
        playerShipList.forEach(ship => {
            const icon = document.createElement('div');
            icon.className = 'ship-icon';
            icon.id = `player-ship-${ship.id}`;
            icon.innerHTML = `
                <span class="ship-icon-emoji">${ship.emoji || '🚢'}</span>
                <span class="ship-icon-name">${ship.label}</span>
            `;
            playerStatus.appendChild(icon);
        });
    }
}

function updateShipStatusDisplaysFor2P() {
    // In 2P mode, update displays based on current player
    const enemyShips = currentPlayer === 1 ? player2.ships : player1.ships;
    const myShips = currentPlayer === 1 ? player1.ships : player2.ships;
    
    // Update enemy ship status (ships we're attacking)
    const enemyStatus = document.getElementById('enemyShipStatus');
    if (enemyStatus) {
        enemyStatus.innerHTML = '';
        enemyShips.forEach(ship => {
            const icon = document.createElement('div');
            icon.className = 'ship-icon' + (ship.sunk ? ' sunk' : '');
            icon.id = `enemy-ship-${ship.id}`;
            icon.innerHTML = `
                <span class="ship-icon-emoji">${ship.emoji || '🚢'}</span>
                <span class="ship-icon-name">${ship.label}</span>
            `;
            enemyStatus.appendChild(icon);
        });
    }
    
    // Update player ship status (our ships)
    const playerStatus = document.getElementById('playerShipStatus');
    if (playerStatus) {
        playerStatus.innerHTML = '';
        myShips.forEach(ship => {
            const icon = document.createElement('div');
            icon.className = 'ship-icon' + (ship.sunk ? ' sunk' : '');
            icon.id = `player-ship-${ship.id}`;
            icon.innerHTML = `
                <span class="ship-icon-emoji">${ship.emoji || '🚢'}</span>
                <span class="ship-icon-name">${ship.label}</span>
            `;
            playerStatus.appendChild(icon);
        });
    }
}

function switchToAttackPhase() {
    stopAutoScan();
    clearAllHighlights();
    gamePhase = 'attack';
    awaitingEnemy = false;
    
    // Clear any pending enter timer to prevent accidental pause
    if (scanState.enterTimer) {
        clearTimeout(scanState.enterTimer);
        scanState.enterTimer = null;
    }
    scanState.enterHeld = false;
    scanState.enterLongTriggered = false;
    
    // Hide other screens
    document.getElementById('placementScreen').classList.add('hidden');
    document.getElementById('defensePhaseScreen').classList.add('hidden');
    document.getElementById('coverScreen').classList.add('hidden');
    
    // Show attack phase screen
    document.getElementById('attackPhaseScreen').classList.remove('hidden');
    
    // Update header text based on game mode
    const phaseText = document.querySelector('#attackPhaseScreen .phase-text');
    if (phaseText) {
        if (gameMode === '2p') {
            phaseText.textContent = `PLAYER ${currentPlayer} - ATTACK`;
        } else {
            phaseText.textContent = 'YOUR TURN - ATTACK';
        }
    }
    
    // Refresh ship status displays for current player
    if (gameMode === '2p') {
        updateShipStatusDisplaysFor2P();
    }
    
    // Render the attack grid
    renderAttackGrid();
    
    // Enable scanning - only start in deadzone on first turn, otherwise keep last position
    scanState.mode = 'game-row';
    if (firstAttackTurn) {
        scanState.rowIndex = -1;
        firstAttackTurn = false;
    }
    scanState.cellIndex = -1;
    highlightGameRow();
    
    const statusText = document.getElementById('attackStatusText');
    if (statusText) statusText.textContent = 'Scan rows to target enemy fleet.';
    
    const turnAnnouncement = gameMode === '2p' ? `Player ${currentPlayer}'s turn.` : 'Your turn.';
    speak(`${turnAnnouncement} Scan rows to target enemy fleet.`);
    startAutoScan();
}

function switchToDefensePhase() {
    stopAutoScan();
    clearAllHighlights();
    gamePhase = 'defense';
    
    // Clear any pending enter timer to prevent accidental pause
    if (scanState.enterTimer) {
        clearTimeout(scanState.enterTimer);
        scanState.enterTimer = null;
    }
    scanState.enterHeld = false;
    scanState.enterLongTriggered = false;
    
    // Hide other screens
    document.getElementById('attackPhaseScreen').classList.add('hidden');
    document.getElementById('coverScreen').classList.add('hidden');
    
    // Show defense phase screen
    document.getElementById('defensePhaseScreen').classList.remove('hidden');
    
    // Render the defense grid (shows our ships)
    renderDefenseGrid();
    
    const statusText = document.getElementById('defenseStatusText');
    if (statusText) statusText.textContent = 'Enemy is targeting...';
}

function renderAttackGrid() {
    if (!attackGrid) return;
    const tiles = attackGrid.querySelectorAll('.grid-cell');
    
    // In 2P mode, show current player's attacks on the opponent
    const attacks = gameMode === '2p' ? 
        (currentPlayer === 1 ? player1.attacks : player2.attacks) : player1.attacks;
    const enemyShipList = gameMode === '2p' ? 
        (currentPlayer === 1 ? player2.ships : player1.ships) : enemyShips;
    
    tiles.forEach(tile => {
        const row = Number(tile.dataset.row);
        const col = Number(tile.dataset.col);
        const attack = attacks[row][col];
        
        // Clear previous classes
        tile.classList.remove('attack-hit', 'attack-miss', 'enemy-sunk');
        
        if (attack.fired) {
            if (attack.hit) {
                tile.classList.add('attack-hit');
                // Check if part of sunk ship
                for (const ship of enemyShipList) {
                    if (ship.sunk && ship.coords.some(c => c.row === row && c.col === col)) {
                        tile.classList.add('enemy-sunk');
                        break;
                    }
                }
            } else {
                tile.classList.add('attack-miss');
            }
        }
    });
}

function renderDefenseGrid() {
    if (!defenseGrid) return;
    const tiles = defenseGrid.querySelectorAll('.grid-cell');
    
    // In 2P mode, show current player's ships being attacked
    const myCells = gameMode === '2p' ? 
        (currentPlayer === 1 ? player1.cells : player2.cells) : playerCells;
    const myShips = gameMode === '2p' ? 
        (currentPlayer === 1 ? player1.ships : player2.ships) : ships;
    const enemyAttacks = gameMode === '2p' ? 
        (currentPlayer === 1 ? player2.attacks : player1.attacks) : [];
    
    tiles.forEach(tile => {
        const row = Number(tile.dataset.row);
        const col = Number(tile.dataset.col);
        const cell = myCells[row][col];
        
        // Clear previous classes
        tile.classList.remove('occupied', 'defense-hit', 'defense-miss', 'player-sunk');
        
        // Show our ships
        if (cell.occupied) {
            tile.classList.add('occupied');
            // Check if this ship is sunk
            for (const ship of myShips) {
                if (ship.sunk && ship.coords.some(c => c.row === row && c.col === col)) {
                    tile.classList.add('player-sunk');
                    break;
                }
            }
        }
        
        // Show where enemy has attacked
        if (cell.hit) {
            tile.classList.add('defense-hit');
        } else if (cell.miss) {
            tile.classList.add('defense-miss');
        }
    });
}

function generateEnemyFleet() {
    enemyShips = [];
    enemyCells = Array.from({ length: 10 }, () => Array.from({ length: 10 }, () => ({ occupied: false, hit: false, miss: false })));
    
    // Initialize player1 attacks array
    player1.attacks = Array.from({ length: 10 }, () => 
        Array.from({ length: 10 }, () => ({ fired: false, hit: false }))
    );
    
    const specs = shipSpecs.map(s => ({ id: s.id, label: s.label, length: s.length, emoji: s.emoji }));
    specs.forEach(spec => {
        let placed = false;
        while (!placed) {
            const orientation = Math.random() < 0.5 ? 'horizontal' : 'vertical';
            const startRow = Math.floor(Math.random() * 10);
            const startCol = Math.floor(Math.random() * 10);
            const rowMax = orientation === 'vertical' ? startRow + spec.length - 1 : startRow;
            const colMax = orientation === 'horizontal' ? startCol + spec.length - 1 : startCol;
            if (rowMax > 9 || colMax > 9) continue;
            
            let canPlace = true;
            for (let offset = 0; offset < spec.length; offset++) {
                const r = orientation === 'vertical' ? startRow + offset : startRow;
                const c = orientation === 'horizontal' ? startCol + offset : startCol;
                if (enemyCells[r][c].occupied) { canPlace = false; break; }
            }
            if (!canPlace) continue;
            
            const coords = [];
            for (let offset = 0; offset < spec.length; offset++) {
                const r = orientation === 'vertical' ? startRow + offset : startRow;
                const c = orientation === 'horizontal' ? startCol + offset : startCol;
                enemyCells[r][c].occupied = true;
                coords.push({ row: r, col: c, hit: false });
            }
            enemyShips.push({ id: spec.id, label: spec.label, length: spec.length, emoji: spec.emoji, coords, sunk: false });
            placed = true;
        }
    });
}

// =========================================
// COVER SCREEN (2-Player Mode)
// =========================================
let coverCallback = null;

function showCoverScreen(lookAwayPlayer, readyPlayer, nextAction) {
    stopAutoScan();
    clearAllHighlights();
    
    // Hide all other screens
    document.getElementById('mainMenuScreen').classList.add('hidden');
    document.getElementById('settingsScreen').classList.add('hidden');
    document.getElementById('placementScreen').classList.add('hidden');
    document.getElementById('attackPhaseScreen').classList.add('hidden');
    document.getElementById('defensePhaseScreen').classList.add('hidden');
    
    // Show cover screen
    document.getElementById('coverScreen').classList.remove('hidden');
    
    // Update text
    const playerText = document.getElementById('coverPlayerText');
    const instructionText = document.getElementById('coverInstruction');
    
    if (playerText) playerText.textContent = `PLAYER ${lookAwayPlayer}, LOOK AWAY!`;
    if (instructionText) instructionText.textContent = `Player ${readyPlayer}, press Ready when Player ${lookAwayPlayer} isn't looking`;
    
    // Set up callback for when ready is pressed
    coverCallback = nextAction;
    
    // Set up scanning for cover screen
    scanState.mode = 'cover';
    scanState.scanIndex = 0;
    scanState.coverButtons = [{ element: document.getElementById('coverReadyBtn'), label: 'Ready', action: 'ready' }];
    
    // Highlight the Ready button
    highlightCoverButton();
    
    speak(`Cover your eyes Player ${lookAwayPlayer}. Player ${readyPlayer}'s turn.`);
    startAutoScan();
}

function onCoverReady() {
    stopAutoScan();
    
    if (coverCallback === 'player1-placement') {
        // Player 1 needs to place ships (start of 2P game)
        document.getElementById('coverScreen').classList.add('hidden');
        currentPlayer = 1;
        ships = player1.ships;
        playerCells = player1.cells;
        showPlacementScreen();
    } else if (coverCallback === 'placement') {
        // Player 2 needs to place ships
        document.getElementById('coverScreen').classList.add('hidden');
        document.getElementById('placementScreen').classList.remove('hidden');
        
        // Reset for Player 2's placement
        ships = player2.ships;
        playerCells = player2.cells;
        currentShipIndex = 0;
        
        // Re-initialize the placement board
        initBoardArrays();
        createGrid(placementBoard, true);
        randomizeAllShips();
        
        // Update indicator
        const indicator = document.getElementById('placementIndicator');
        if (indicator) indicator.textContent = 'Player 2 - Place Your Ships';
        
        scanState.mode = 'buttons';
        scanState.scanIndex = -1;
        updateMenuButtonsList();
        
        speak('Player 2, place your ships.');
        startAutoScan();
    }
    
    coverCallback = null;
}

function updateShipStatusIcon(shipId, isPlayerShip) {
    const prefix = isPlayerShip ? 'player' : 'enemy';
    const icon = document.getElementById(`${prefix}-ship-${shipId}`);
    if (icon) {
        icon.classList.add('sunk');
    }
}

function fireAtEnemy(row, col) {
    if (!gameStarted) return;
    if (awaitingEnemy) return;
    
    // Determine target cells based on game mode
    const targetCells = gameMode === '2p' ? 
        (currentPlayer === 1 ? player2.cells : player1.cells) : enemyCells;
    const targetShips = gameMode === '2p' ?
        (currentPlayer === 1 ? player2.ships : player1.ships) : enemyShips;
    const attackArray = gameMode === '2p' ?
        (currentPlayer === 1 ? player1.attacks : player2.attacks) : player1.attacks;
    
    // Check if already fired here
    if (attackArray[row][col].fired) return;
    
    awaitingEnemy = true;
    stopAutoScan();
    
    // Mark as fired
    attackArray[row][col].fired = true;
    
    let shipSunk = false;
    const cell = targetCells[row][col];
    
    if (cell.occupied) {
        cell.hit = true;
        attackArray[row][col].hit = true;
        playSound('hit');
        speak('Hit!');
        
        // Check if ship is sunk
        for (const ship of targetShips) {
            const coord = ship.coords.find(c => c.row === row && c.col === col);
            if (coord) {
                coord.hit = true;
                if (!ship.sunk && ship.coords.every(c => c.hit)) {
                    ship.sunk = true;
                    shipSunk = true;
                    updateShipStatusIcon(ship.id, false);
                    
                    const allSunk = targetShips.every(s => s.sunk);
                    if (!allSunk) {
                        showSunkToast(`You sank their ${ship.label}!`);
                        speak(`You sank their ${ship.label}!`);
                    }
                }
                break;
            }
        }
    } else {
        cell.miss = true;
        playSound('miss');
        speak('Miss.');
    }
    
    // Update the attack grid display
    renderAttackGrid();
    
    // Check win condition
    if (targetShips.every(s => s.sunk)) {
        awaitingEnemy = false;
        const winner = gameMode === '2p' ? `Player ${currentPlayer}` : 'You';
        showGameOverModal('Victory!', `${winner} sank the enemy fleet!`);
        return;
    }
    
    // Transition to defense phase after a delay
    const cooldown = shipSunk ? 3500 : 1500;
    
    setTimeout(() => {
        if (gameMode === '2p') {
            // 2-Player: Switch to next player's attack directly (no cover screen needed during gameplay)
            const nextPlayer = currentPlayer === 1 ? 2 : 1;
            currentPlayer = nextPlayer;
            switchToAttackPhase();
        } else {
            // 1-Player: Switch to defense phase for AI turn
            switchToDefensePhase();
            speak('Enemy turn.');
            setTimeout(enemyFire, 1000);
        }
    }, cooldown);
}

function markEnemyShipHit(row, col) {
    let shipWasSunk = false;
    enemyShips.forEach(ship => {
        ship.coords.forEach(coord => {
            if (coord.row === row && coord.col === col) coord.hit = true;
        });
        if (!ship.sunk && ship.coords.every(c => c.hit)) {
            ship.sunk = true;
            shipWasSunk = true;
            // Mark all ship cells as sunk (change circles to Xs)
            ship.coords.forEach(coord => {
                if (playerBoard) {
                    const tile = playerBoard.querySelector(`.grid-cell[data-row="${coord.row}"][data-col="${coord.col}"]`);
                    if (tile) tile.classList.add('enemy-sunk');
                }
            });
            // Only show sunk toast if this isn't the last ship (victory will show instead)
            const allSunk = enemyShips.every(s => s.sunk);
            if (!allSunk) {
                showSunkToast(`You sank their ${ship.label}!`);
                speak(`You sank their ${ship.label}!`);
            }
        }
    });
    return shipWasSunk;
}

function showSunkToast(message, isEnemySunk = false) {
    const toast = document.getElementById('sunkToast');
    if (!toast) return;
    
    toast.textContent = message;
    toast.classList.remove('enemy-sunk-toast');
    if (isEnemySunk) {
        toast.classList.add('enemy-sunk-toast');
    }
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 2000);
}

function checkWinCondition() {
    const allSunk = enemyShips.length > 0 && enemyShips.every(ship => ship.coords.every(c => c.hit));
    if (allSunk) {
        gameStarted = false;
        updateTurnIndicator();
        stopAutoScan();
        playSound('win');
        showGameOverModal('Victory!', 'You sank the enemy fleet!');
        return true;
    }
    return false;
}

function markPlayerShipHit(row, col) {
    for (const ship of ships) {
        for (const coord of ship.coords) {
            if (coord.row === row && coord.col === col) {
                coord.hit = true;
                if (!ship.sunk && ship.coords.every(p => p.hit)) {
                    ship.sunk = true;
                    // Mark all ship cells as player-sunk (muted red highlight)
                    ship.coords.forEach(c => {
                        if (playerBoard) {
                            const tile = playerBoard.querySelector(`.grid-cell[data-row="${c.row}"][data-col="${c.col}"]`);
                            if (tile) tile.classList.add('player-sunk');
                        }
                    });
                    // Only show sunk toast if this isn't the last ship (defeat will show instead)
                    const allSunk = ships.every(s => s.sunk);
                    if (!allSunk) {
                        showSunkToast(`Your ${ship.label} was sunk!`, true);
                        speak(`Your ${ship.label} was sunk!`);
                    }
                    return true; // Ship was sunk
                }
                return false; // Hit but not sunk
            }
        }
    }
    return false;
}

function checkLoseCondition() {
    const allSunk = ships.every(ship => ship.sunk);
    if (allSunk) {
        gameStarted = false;
        updateTurnIndicator();
        stopAutoScan();
        showGameOverModal('Defeat!', 'The enemy sank your fleet.');
        return true;
    }
    return false;
}

function showGameOverModal(title, message) {
    const modal = document.getElementById('gameOverModal');
    const titleEl = document.getElementById('gameOverTitle');
    const messageEl = document.getElementById('gameOverMessage');
    const okBtn = document.getElementById('gameOverOkBtn');
    
    stopAutoScan();
    clearAllHighlights();
    
    if (titleEl) {
        titleEl.textContent = title;
        // Set color based on win/lose
        if (title.includes('Victory')) {
            titleEl.style.color = '#2ecc40';
            titleEl.style.textShadow = '0 0 20px rgba(46, 204, 64, 0.6)';
            speak('Victory! You sank the enemy fleet!');
        } else {
            titleEl.style.color = '#f25042';
            titleEl.style.textShadow = '0 0 20px rgba(242, 80, 66, 0.6)';
            speak('Defeat. The enemy sank your fleet.');
        }
    }
    if (messageEl) messageEl.textContent = message;
    if (modal) modal.style.display = 'flex';
    
    // Switch to game-over scanning mode
    scanState.mode = 'game-over';
    scanState.scanIndex = -1;
    updateGameOverButtonsList();
    
    // Start scanning the OK button
    setTimeout(() => {
        speak('Press Enter or scan to return to main menu.');
        startAutoScan();
    }, 2000);
}

function updateGameOverButtonsList() {
    scanState.gameOverButtons = [];
    const okBtn = document.getElementById('gameOverOkBtn');
    if (okBtn) {
        scanState.gameOverButtons.push({ element: okBtn, label: 'OK', action: 'ok' });
    }
}

function hideGameOverModal() {
    const modal = document.getElementById('gameOverModal');
    if (modal) modal.style.display = 'none';
}

// =========================================
// PAUSE MODAL
// =========================================
function showPauseModal() {
    // Don't show pause during defense phase (enemy's turn)
    if (gamePhase === 'defense') return;
    
    // Don't show pause if modal is already visible
    const modal = document.getElementById('pauseModal');
    if (modal && modal.style.display === 'flex') return;
    
    stopAutoScan();
    clearAllHighlights();
    
    if (modal) modal.style.display = 'flex';
    
    // Switch to pause scanning mode
    scanState.mode = 'pause';
    scanState.scanIndex = -1;
    updatePauseButtonsList();
    
    speak('Game paused. Continue, Settings, or Main Menu.');
    startAutoScan();
}

function hidePauseModal() {
    const modal = document.getElementById('pauseModal');
    if (modal) modal.style.display = 'none';
    
    // Return to previous mode
    if (gameStarted) {
        scanState.mode = 'game-row';
        scanState.scanIndex = -1;
        highlightGameRow();
        speak('Game resumed. Your turn.');
    } else {
        scanState.mode = 'buttons';
        scanState.scanIndex = -1;
        speak('Resuming. Scan buttons.');
    }
    startAutoScan();
}

function showSettingsFromPause() {
    // Show settings view inside pause modal
    const pauseMainView = document.getElementById('pauseMainView');
    const pauseSettingsView = document.getElementById('pauseSettingsView');
    
    if (pauseMainView) pauseMainView.style.display = 'none';
    if (pauseSettingsView) pauseSettingsView.style.display = 'block';
    
    // Update settings display
    updatePauseSettingsDisplay();
    
    // Switch to pause-settings scanning mode
    scanState.mode = 'pause-settings';
    scanState.scanIndex = -1;
    updatePauseSettingsButtonsList();
    
    speak('Settings. Press Space to scan options.');
    startAutoScan();
}

function goBackToPauseMenu() {
    // Show main pause view
    const pauseMainView = document.getElementById('pauseMainView');
    const pauseSettingsView = document.getElementById('pauseSettingsView');
    
    if (pauseMainView) pauseMainView.style.display = 'block';
    if (pauseSettingsView) pauseSettingsView.style.display = 'none';
    
    // Switch back to pause scanning mode
    scanState.mode = 'pause';
    scanState.scanIndex = -1;
    updatePauseButtonsList();
    
    speak('Pause menu.');
    startAutoScan();
}

function updatePauseSettingsButtonsList() {
    scanState.pauseSettingsButtons = [];
    const ttsBtn = document.getElementById('pauseTtsBtn');
    const soundBtn = document.getElementById('pauseSoundBtn');
    const themeBtn = document.getElementById('pauseThemeBtn');
    const highlightStyleBtn = document.getElementById('pauseHighlightStyleBtn');
    const highlightColorBtn = document.getElementById('pauseHighlightColorBtn');
    const scanSpeedBtn = document.getElementById('pauseScanSpeedBtn');
    const backBtn = document.getElementById('pauseSettingsBackBtn');
    
    const scanSpeedLabel = window.NarbeScanManager ? 
        `Speed ${window.NarbeScanManager.getScanInterval() / 1000} Seconds` : 
        `Speed ${scanSpeeds[settings.scanSpeedIndex].name}`;
    
    if (ttsBtn) scanState.pauseSettingsButtons.push({ element: ttsBtn, label: settings.tts ? 'TTS On' : 'TTS Off', action: 'tts' });
    if (soundBtn) scanState.pauseSettingsButtons.push({ element: soundBtn, label: settings.sound ? 'Sound On' : 'Sound Off', action: 'sound' });
    if (themeBtn) scanState.pauseSettingsButtons.push({ element: themeBtn, label: `Theme ${themes[settings.themeIndex].name}`, action: 'theme' });
    if (highlightStyleBtn) scanState.pauseSettingsButtons.push({ element: highlightStyleBtn, label: `Style ${highlightStyles[settings.highlightStyleIndex].name}`, action: 'highlightStyle' });
    if (highlightColorBtn) scanState.pauseSettingsButtons.push({ element: highlightColorBtn, label: `Color ${highlightColors[settings.highlightColorIndex].name}`, action: 'highlightColor' });
    if (scanSpeedBtn) scanState.pauseSettingsButtons.push({ element: scanSpeedBtn, label: scanSpeedLabel, action: 'scanSpeed' });
    if (backBtn) scanState.pauseSettingsButtons.push({ element: backBtn, label: 'Back', action: 'back' });
}

function updatePauseSettingsDisplay() {
    const ttsBtn = document.getElementById('pauseTtsBtn');
    const soundBtn = document.getElementById('pauseSoundBtn');
    const themeBtn = document.getElementById('pauseThemeBtn');
    const highlightStyleBtn = document.getElementById('pauseHighlightStyleBtn');
    const highlightColorBtn = document.getElementById('pauseHighlightColorBtn');
    const scanSpeedBtn = document.getElementById('pauseScanSpeedBtn');
    
    if (ttsBtn) ttsBtn.textContent = `TTS: ${settings.tts ? 'On' : 'Off'}`;
    if (soundBtn) soundBtn.textContent = `Sound: ${settings.sound ? 'On' : 'Off'}`;
    if (themeBtn) themeBtn.textContent = `Theme: ${themes[settings.themeIndex].name}`;
    if (highlightStyleBtn) highlightStyleBtn.textContent = `Style: ${highlightStyles[settings.highlightStyleIndex].name}`;
    if (highlightColorBtn) highlightColorBtn.textContent = `Color: ${highlightColors[settings.highlightColorIndex].name}`;
    
    const scanSpeedText = window.NarbeScanManager ? 
        `${window.NarbeScanManager.getScanInterval() / 1000} Seconds` : 
        scanSpeeds[settings.scanSpeedIndex].name;
    if (scanSpeedBtn) scanSpeedBtn.textContent = `Speed: ${scanSpeedText}`;
}

function returnToMainMenuFromPause() {
    const modal = document.getElementById('pauseModal');
    if (modal) modal.style.display = 'none';
    
    returnToMainMenu();
}

function goBackFromSettings() {
    // If we came from the pause menu during a game, return to the game
    if (scanState.previousMode === 'game-row' || scanState.previousMode === 'buttons') {
        document.getElementById('settingsScreen').classList.add('hidden');
        
        // Show appropriate game screen
        if (gameStarted) {
            document.getElementById('attackPhaseScreen')?.classList.remove('hidden');
        } else {
            document.getElementById('placementScreen')?.classList.remove('hidden');
        }
        
        scanState.mode = scanState.previousMode;
        scanState.scanIndex = -1;
        scanState.previousMode = null;
        clearAllHighlights();
        
        if (gameStarted) {
            highlightGameRow();
            speak('Back to game. Your turn.');
        } else {
            speak('Back to ship placement.');
        }
        startAutoScan();
    } else {
        // Otherwise go to main menu
        showMainMenu();
    }
}

function updatePauseButtonsList() {
    scanState.pauseButtons = [];
    const continueBtn = document.getElementById('pauseContinueBtn');
    const settingsBtn = document.getElementById('pauseSettingsBtn');
    const mainMenuBtn = document.getElementById('pauseMainMenuBtn');
    
    if (continueBtn) scanState.pauseButtons.push({ element: continueBtn, label: 'Continue', action: 'continue' });
    if (settingsBtn) scanState.pauseButtons.push({ element: settingsBtn, label: 'Settings', action: 'settings' });
    if (mainMenuBtn) scanState.pauseButtons.push({ element: mainMenuBtn, label: 'Main Menu', action: 'mainMenu' });
}

function enemyFire() {
    let row, col;
    let shipSunk = false;
    
    // Target player 1's cells (always the human in 1P mode)
    const targetCells = player1.cells.length ? player1.cells : playerCells;
    const targetShips = player1.ships.length ? player1.ships : ships;
    
    // Smart targeting: if we have targets queued, use them
    if (aiTargetQueue.length > 0) {
        let foundTarget = false;
        while (aiTargetQueue.length > 0 && !foundTarget) {
            const target = aiTargetQueue.shift();
            row = target.row;
            col = target.col;
            if (row >= 0 && row < 10 && col >= 0 && col < 10 &&
                !targetCells[row][col].hit && !targetCells[row][col].miss) {
                foundTarget = true;
            }
        }
        if (!foundTarget) {
            do {
                row = Math.floor(Math.random() * 10);
                col = Math.floor(Math.random() * 10);
            } while (targetCells[row][col].hit || targetCells[row][col].miss);
        }
    } else {
        do {
            row = Math.floor(Math.random() * 10);
            col = Math.floor(Math.random() * 10);
        } while (targetCells[row][col].hit || targetCells[row][col].miss);
    }
    
    const cell = targetCells[row][col];
    
    if (cell.occupied) {
        cell.hit = true;
        aiHitStack.push({ row, col });
        addAdjacentTargets(row, col);
        
        playSound('hit');
        speak('Hit!');
        
        // Check if ship is sunk
        for (const ship of targetShips) {
            const coord = ship.coords.find(c => c.row === row && c.col === col);
            if (coord) {
                coord.hit = true;
                if (!ship.sunk && ship.coords.every(c => c.hit)) {
                    ship.sunk = true;
                    shipSunk = true;
                    updateShipStatusIcon(ship.id, true);
                    cleanupSunkShipHits();
                    
                    const allSunk = targetShips.every(s => s.sunk);
                    if (!allSunk) {
                        showSunkToast(`Your ${ship.label} was sunk!`, true);
                        speak(`Your ${ship.label} was sunk!`);
                    }
                }
                break;
            }
        }
    } else {
        cell.miss = true;
        playSound('miss');
        speak('Miss.');
    }
    
    // Update the defense grid display
    renderDefenseGrid();
    
    awaitingEnemy = false;
    
    // Check lose condition
    if (targetShips.every(s => s.sunk)) {
        showGameOverModal('Defeat!', 'The enemy sank your fleet.');
        return;
    }
    
    // After showing the result, transition back to attack phase
    const cooldown = shipSunk ? 3500 : 2000;
    
    setTimeout(() => {
        switchToAttackPhase();
    }, cooldown);
}

function addAdjacentTargets(row, col) {
    const directions = [
        { dr: -1, dc: 0 },  // up
        { dr: 1, dc: 0 },   // down
        { dr: 0, dc: -1 },  // left
        { dr: 0, dc: 1 }    // right
    ];
    
    // Check if we have multiple hits in a line to determine direction
    const hitDirection = getHitDirection();
    
    // If we know the direction, prioritize cells in that direction
    if (hitDirection) {
        // Add cells in the determined direction first (at front of queue)
        const priorityTargets = [];
        const otherTargets = [];
        
        for (const dir of directions) {
            const newRow = row + dir.dr;
            const newCol = col + dir.dc;
            
            if (newRow >= 0 && newRow < 10 && newCol >= 0 && newCol < 10 &&
                !playerCells[newRow][newCol].hit && !playerCells[newRow][newCol].miss) {
                
                // Check if this direction matches our hit pattern
                if ((hitDirection === 'horizontal' && dir.dr === 0) ||
                    (hitDirection === 'vertical' && dir.dc === 0)) {
                    priorityTargets.push({ row: newRow, col: newCol });
                } else {
                    otherTargets.push({ row: newRow, col: newCol });
                }
            }
        }
        
        // Add priority targets first, then others
        aiTargetQueue = [...priorityTargets, ...aiTargetQueue, ...otherTargets];
    } else {
        // No direction known yet, add all adjacent cells
        for (const dir of directions) {
            const newRow = row + dir.dr;
            const newCol = col + dir.dc;
            
            if (newRow >= 0 && newRow < 10 && newCol >= 0 && newCol < 10 &&
                !playerCells[newRow][newCol].hit && !playerCells[newRow][newCol].miss &&
                !aiTargetQueue.some(t => t.row === newRow && t.col === newCol)) {
                aiTargetQueue.push({ row: newRow, col: newCol });
            }
        }
    }
}

function getHitDirection() {
    if (aiHitStack.length < 2) return null;
    
    // Check if hits are in a line
    const rows = aiHitStack.map(h => h.row);
    const cols = aiHitStack.map(h => h.col);
    
    const sameRow = rows.every(r => r === rows[0]);
    const sameCol = cols.every(c => c === cols[0]);
    
    if (sameRow && !sameCol) return 'horizontal';
    if (sameCol && !sameRow) return 'vertical';
    
    return null;
}

function cleanupSunkShipHits() {
    // Check each ship to see if it was just sunk
    for (const ship of ships) {
        if (ship.sunk) {
            // Remove this ship's coordinates from the hit stack
            aiHitStack = aiHitStack.filter(hit => {
                return !ship.coords.some(coord => 
                    coord.row === hit.row && coord.col === hit.col
                );
            });
        }
    }
    
    // If all tracked hits were from sunk ships, clear the target queue too
    if (aiHitStack.length === 0) {
        aiTargetQueue = [];
    }
}

function showPlayAgain() {
    const menuButtons = document.getElementById('menuButtons');
    if (menuButtons) {
        menuButtons.classList.remove('hidden');
        const startBtn = document.getElementById('startGameBtn');
        if (startBtn) startBtn.textContent = 'Play Again';
    }
}

// =========================================
// MENU NAVIGATION
// =========================================
function showMainMenu() {
    stopAutoScan();
    clearAllHighlights();
    
    // Hide pause button
    const pauseBtn = document.getElementById('pauseButton');
    if (pauseBtn) pauseBtn.style.display = 'none';
    
    // Hide all game screens
    document.getElementById('settingsScreen')?.classList.add('hidden');
    document.getElementById('placementScreen')?.classList.add('hidden');
    document.getElementById('attackPhaseScreen')?.classList.add('hidden');
    document.getElementById('defensePhaseScreen')?.classList.add('hidden');
    document.getElementById('coverScreen')?.classList.add('hidden');
    
    // Show main menu
    document.getElementById('mainMenuScreen').classList.remove('hidden');
    
    // Reset scanning state for main menu
    scanState.mode = 'main-menu';
    scanState.scanIndex = -1;
    updateMainMenuButtonsList();
    
    speak("Benny's Battle Boats. Main menu.");
    startAutoScan();
}

function showSettings() {
    stopAutoScan();
    clearAllHighlights();
    
    // Hide other screens
    document.getElementById('mainMenuScreen')?.classList.add('hidden');
    document.getElementById('placementScreen')?.classList.add('hidden');
    document.getElementById('attackPhaseScreen')?.classList.add('hidden');
    document.getElementById('defensePhaseScreen')?.classList.add('hidden');
    document.getElementById('coverScreen')?.classList.add('hidden');
    
    // Show settings
    document.getElementById('settingsScreen').classList.remove('hidden');
    
    // Update settings display
    updateSettingsDisplay();
    
    // Reset scanning state for settings
    scanState.mode = 'settings-menu';
    scanState.scanIndex = -1;
    updateSettingsButtonsList();
    
    speak('Settings menu. Press Space to scan options.');
    startAutoScan();
}

function showGame(mode) {
    gameMode = mode;
    stopAutoScan();
    clearAllHighlights();
    
    // Reset game state
    resetGameState();
    
    // Initialize player data
    initPlayerData();
    
    // In 2P mode, show cover screen first so Player 2 looks away
    if (mode === '2p') {
        showCoverScreen(2, 1, 'player1-placement');
        return;
    }
    
    // 1P mode - go directly to placement
    showPlacementScreen();
}

function showPlacementScreen() {
    // Hide all screens
    document.getElementById('mainMenuScreen').classList.add('hidden');
    document.getElementById('settingsScreen').classList.add('hidden');
    document.getElementById('attackPhaseScreen').classList.add('hidden');
    document.getElementById('defensePhaseScreen').classList.add('hidden');
    document.getElementById('coverScreen').classList.add('hidden');
    
    // Show placement screen
    document.getElementById('placementScreen').classList.remove('hidden');
    
    // Show pause button
    const pauseBtn = document.getElementById('pauseButton');
    if (pauseBtn) pauseBtn.style.display = 'flex';
    
    // Show menu buttons for placement phase
    const menuButtons = document.getElementById('menuButtons');
    if (menuButtons) menuButtons.classList.remove('hidden');
    
    // Initialize placement board
    placementBoard = document.getElementById('placementBoard');
    initBoardArrays();
    createGrid(placementBoard, true);
    randomizeAllShips();
    updateShipDisplay();
    
    // Update placement indicator
    const indicator = document.getElementById('placementIndicator');
    if (indicator) {
        indicator.textContent = gameMode === '2p' ? `Player ${currentPlayer} - Place Your Ships` : 'Place Your Ships';
    }
    
    // Reset scanning for game buttons
    scanState.mode = 'buttons';
    scanState.scanIndex = -1;
    updateMenuButtonsList();
    
    updateStatus('Ships randomized! Press Space to scan, Enter to select.');
    speak(gameMode === '2p' ? `Player ${currentPlayer}, place your ships.` : 'Ships randomized. Press Space to scan buttons.');
    startAutoScan();
}

function initPlayerData() {
    // Create fresh ship arrays for both players
    player1.ships = shipSpecs.map(spec => ({
        id: spec.id,
        label: spec.label,
        length: spec.length,
        emoji: spec.emoji,
        placed: false,
        sunk: false,
        coords: []
    }));
    
    player1.cells = Array.from({ length: 10 }, () => 
        Array.from({ length: 10 }, () => ({ occupied: false, hit: false, miss: false }))
    );
    player1.attacks = Array.from({ length: 10 }, () => 
        Array.from({ length: 10 }, () => ({ fired: false, hit: false }))
    );
    
    player2.ships = shipSpecs.map(spec => ({
        id: spec.id,
        label: spec.label,
        length: spec.length,
        emoji: spec.emoji,
        placed: false,
        sunk: false,
        coords: []
    }));
    
    player2.cells = Array.from({ length: 10 }, () => 
        Array.from({ length: 10 }, () => ({ occupied: false, hit: false, miss: false }))
    );
    player2.attacks = Array.from({ length: 10 }, () => 
        Array.from({ length: 10 }, () => ({ fired: false, hit: false }))
    );
    
    // Set current player's data as active
    currentPlayer = 1;
    ships = player1.ships;
    playerCells = player1.cells;
}

function resetGameState() {
    gameStarted = false;
    playerTurn = true;
    awaitingEnemy = false;
    movingShip = false;
    firstAttackTurn = true;
    currentShipIndex = 0;
    placementOrientation = 'horizontal';
    currentPlayer = 1;
    gamePhase = 'attack';
    
    // Reset AI targeting state
    aiTargetQueue = [];
    aiHitStack = [];
    enemyShips = [];
}

function returnToMainMenu() {
    // Hide game over modal if showing
    hideGameOverModal();
    
    // Hide all phase screens
    document.getElementById('attackPhaseScreen')?.classList.add('hidden');
    document.getElementById('defensePhaseScreen')?.classList.add('hidden');
    document.getElementById('coverScreen')?.classList.add('hidden');
    document.getElementById('placementScreen')?.classList.add('hidden');
    
    // Reset everything and show main menu
    resetGameState();
    showMainMenu();
}

function exitGame() {
    speak("Exiting to Hub");
    setTimeout(() => {
        if (window.parent && window.parent !== window) {
            window.parent.postMessage({ action: 'focusBackButton' }, '*');
        } else {
            window.location.href = '../../../index.html';
        }
    }, 500);
}

function updateMainMenuButtonsList() {
    scanState.mainMenuButtons = [];
    const onePlayerBtn = document.getElementById('onePlayerBtn');
    const twoPlayerBtn = document.getElementById('twoPlayerBtn');
    const settingsBtn = document.getElementById('settingsBtn');
    const exitBtn = document.getElementById('exitBtn');
    
    if (onePlayerBtn) scanState.mainMenuButtons.push({ element: onePlayerBtn, label: '1 Player', action: '1p' });
    if (twoPlayerBtn) scanState.mainMenuButtons.push({ element: twoPlayerBtn, label: '2 Players', action: '2p' });
    if (settingsBtn) scanState.mainMenuButtons.push({ element: settingsBtn, label: 'Settings', action: 'settings' });
    if (exitBtn) scanState.mainMenuButtons.push({ element: exitBtn, label: 'Exit', action: 'exit' });
}

function updateSettingsButtonsList() {
    scanState.settingsButtons = [];
    const ttsBtn = document.getElementById('ttsBtn');
    const soundBtn = document.getElementById('soundBtn');
    const themeBtn = document.getElementById('themeBtn');
    const highlightStyleBtn = document.getElementById('highlightStyleBtn');
    const highlightColorBtn = document.getElementById('highlightColorBtn');
    const autoScanBtn = document.getElementById('autoScanBtn');
    const scanSpeedBtn = document.getElementById('scanSpeedBtn');
    const backBtn = document.getElementById('settingsBackBtn');
    
    const autoScanOn = window.NarbeScanManager ? window.NarbeScanManager.getSettings().autoScan : false;
    
    if (ttsBtn) scanState.settingsButtons.push({ element: ttsBtn, label: `TTS: ${settings.tts ? 'On' : 'Off'}`, action: 'tts' });
    if (soundBtn) scanState.settingsButtons.push({ element: soundBtn, label: `Sound: ${settings.sound ? 'On' : 'Off'}`, action: 'sound' });
    if (themeBtn) scanState.settingsButtons.push({ element: themeBtn, label: `Theme: ${themes[settings.themeIndex].name}`, action: 'theme' });
    if (highlightStyleBtn) scanState.settingsButtons.push({ element: highlightStyleBtn, label: `Style: ${highlightStyles[settings.highlightStyleIndex].name}`, action: 'highlightStyle' });
    if (highlightColorBtn) scanState.settingsButtons.push({ element: highlightColorBtn, label: `Color: ${highlightColors[settings.highlightColorIndex].name}`, action: 'highlightColor' });
    if (autoScanBtn) scanState.settingsButtons.push({ element: autoScanBtn, label: `Auto Scan: ${autoScanOn ? 'On' : 'Off'}`, action: 'autoScan' });
    if (scanSpeedBtn) scanState.settingsButtons.push({ element: scanSpeedBtn, label: `Speed: ${scanSpeeds[settings.scanSpeedIndex].name}`, action: 'scanSpeed' });
    if (backBtn) scanState.settingsButtons.push({ element: backBtn, label: 'Back', action: 'back' });
}

function resetForNewGame() {
    ships.forEach(ship => {
        ship.placed = false;
        ship.sunk = false;
        ship.coords = [];
    });
    enemyShips = [];
    gameStarted = false;
    playerTurn = true;
    awaitingEnemy = false;
    movingShip = false;
    currentShipIndex = 0;
    placementOrientation = 'horizontal';
    
    // Reset AI targeting state
    aiTargetQueue = [];
    aiHitStack = [];
    
    initBoardArrays();
    createGrid(playerBoard, true);
    randomizeAllShips();
    
    const menuButtons = document.getElementById('menuButtons');
    if (menuButtons) menuButtons.classList.remove('hidden');
    
    const startBtn = document.getElementById('startGameBtn');
    if (startBtn) startBtn.textContent = 'Place Ships';
    
    updateTurnIndicator();
    updateStatus('Ships randomized! Press Space to scan, Enter to select.');
    
    // Reset scanning state
    scanState.mode = 'buttons';
    scanState.scanIndex = -1;
    scanState.rowIndex = -1;
    scanState.cellIndex = -1;
    clearAllHighlights();
    
    speak('New game. Ships randomized. Press Space to scan buttons.');
    startAutoScan();
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    // Load settings first
    loadSettings();
    
    // Get DOM references
    placementBoard = document.getElementById('placementBoard');
    attackGrid = document.getElementById('attackGrid');
    defenseGrid = document.getElementById('defenseGrid');
    statusText = document.getElementById('statusText');
    
    // Main menu button handlers
    const onePlayerBtn = document.getElementById('onePlayerBtn');
    const twoPlayerBtn = document.getElementById('twoPlayerBtn');
    const settingsBtn = document.getElementById('settingsBtn');
    const exitBtn = document.getElementById('exitBtn');
    
    if (onePlayerBtn) onePlayerBtn.addEventListener('click', () => showGame('1p'));
    if (twoPlayerBtn) twoPlayerBtn.addEventListener('click', () => showGame('2p'));
    if (settingsBtn) settingsBtn.addEventListener('click', showSettings);
    if (exitBtn) exitBtn.addEventListener('click', exitGame);
    
    // Settings button handlers
    const ttsBtn = document.getElementById('ttsBtn');
    const soundBtn = document.getElementById('soundBtn');
    const themeBtn = document.getElementById('themeBtn');
    const highlightStyleBtn = document.getElementById('highlightStyleBtn');
    const highlightColorBtn = document.getElementById('highlightColorBtn');
    const autoScanBtn = document.getElementById('autoScanBtn');
    const scanSpeedBtn = document.getElementById('scanSpeedBtn');
    const settingsBackBtn = document.getElementById('settingsBackBtn');
    
    if (ttsBtn) ttsBtn.addEventListener('click', toggleTTS);
    if (soundBtn) soundBtn.addEventListener('click', toggleSound);
    if (themeBtn) themeBtn.addEventListener('click', cycleTheme);
    if (highlightStyleBtn) highlightStyleBtn.addEventListener('click', cycleHighlightStyle);
    if (highlightColorBtn) highlightColorBtn.addEventListener('click', cycleHighlightColor);
    if (autoScanBtn) autoScanBtn.addEventListener('click', toggleAutoScan);
    if (scanSpeedBtn) scanSpeedBtn.addEventListener('click', cycleScanSpeed);
    if (settingsBackBtn) settingsBackBtn.addEventListener('click', goBackFromSettings);
    
    // Game button handlers
    const backToMenuBtn = document.getElementById('backToMenuBtn');
    const randomizeBtn = document.getElementById('randomizeBtn');
    const startGameBtn = document.getElementById('startGameBtn');
    
    // Modal button handlers
    const rotateShipModalBtn = document.getElementById('rotateShipModalBtn');
    const moveShipModalBtn = document.getElementById('moveShipModalBtn');
    const cancelShipModalBtn = document.getElementById('cancelShipModalBtn');
    
    // Game over button handler
    const gameOverOkBtn = document.getElementById('gameOverOkBtn');
    if (gameOverOkBtn) gameOverOkBtn.addEventListener('click', returnToMainMenu);
    
    // Pause modal button handlers
    const pauseContinueBtn = document.getElementById('pauseContinueBtn');
    const pauseSettingsBtn = document.getElementById('pauseSettingsBtn');
    const pauseMainMenuBtn = document.getElementById('pauseMainMenuBtn');
    
    if (pauseContinueBtn) pauseContinueBtn.addEventListener('click', hidePauseModal);
    if (pauseSettingsBtn) pauseSettingsBtn.addEventListener('click', showSettingsFromPause);
    if (pauseMainMenuBtn) pauseMainMenuBtn.addEventListener('click', returnToMainMenuFromPause);
    
    // Pause button in corner (clickable icon)
    const pauseButton = document.getElementById('pauseButton');
    if (pauseButton) pauseButton.addEventListener('click', showPauseModal);
    
    // Pause settings buttons (inside pause modal)
    const pauseTtsBtn = document.getElementById('pauseTtsBtn');
    const pauseSoundBtn = document.getElementById('pauseSoundBtn');
    const pauseThemeBtn = document.getElementById('pauseThemeBtn');
    const pauseHighlightStyleBtn = document.getElementById('pauseHighlightStyleBtn');
    const pauseHighlightColorBtn = document.getElementById('pauseHighlightColorBtn');
    const pauseScanSpeedBtn = document.getElementById('pauseScanSpeedBtn');
    const pauseSettingsBackBtn = document.getElementById('pauseSettingsBackBtn');
    
    if (pauseTtsBtn) pauseTtsBtn.addEventListener('click', () => { toggleTTS(); updatePauseSettingsDisplay(); });
    if (pauseSoundBtn) pauseSoundBtn.addEventListener('click', () => { toggleSound(); updatePauseSettingsDisplay(); });
    if (pauseThemeBtn) pauseThemeBtn.addEventListener('click', () => { cycleTheme(); updatePauseSettingsDisplay(); });
    if (pauseHighlightStyleBtn) pauseHighlightStyleBtn.addEventListener('click', () => { cycleHighlightStyle(); updatePauseSettingsDisplay(); });
    if (pauseHighlightColorBtn) pauseHighlightColorBtn.addEventListener('click', () => { cycleHighlightColor(); updatePauseSettingsDisplay(); });
    if (pauseScanSpeedBtn) pauseScanSpeedBtn.addEventListener('click', () => { cycleScanSpeed(); updatePauseSettingsDisplay(); });
    if (pauseSettingsBackBtn) pauseSettingsBackBtn.addEventListener('click', goBackToPauseMenu);
    
    // Cover screen ready button
    const coverReadyBtn = document.getElementById('coverReadyBtn');
    if (coverReadyBtn) coverReadyBtn.addEventListener('click', onCoverReady);
    
    if (backToMenuBtn) backToMenuBtn.addEventListener('click', showMainMenu);
    if (randomizeBtn) randomizeBtn.addEventListener('click', randomizeAllShips);
    if (rotateShipModalBtn) rotateShipModalBtn.addEventListener('click', rotateFromModal);
    if (moveShipModalBtn) moveShipModalBtn.addEventListener('click', moveFromModal);
    if (cancelShipModalBtn) cancelShipModalBtn.addEventListener('click', hideShipActionModal);
    if (startGameBtn) startGameBtn.addEventListener('click', () => {
        if (gameStarted) {
            // Play Again was clicked
            resetForNewGame();
        } else {
            startGame();
        }
    });
    
    // =========================================
    // SCANNING SETUP
    // =========================================
    setupScanningInput();
    
    // Subscribe to scan manager setting changes
    if (window.NarbeScanManager) {
        window.NarbeScanManager.subscribe(() => {
            restartAutoScan();
        });
    }
    
    // Update settings display
    updateSettingsDisplay();
    
    // Start with main menu
    showMainMenu();
});

// =========================================
// SCANNING MODE INITIALIZATION
// =========================================
function updateMenuButtonsList() {
    scanState.menuButtons = [];
    const backToMenuBtn = document.getElementById('backToMenuBtn');
    const randomizeBtn = document.getElementById('randomizeBtn');
    const startGameBtn = document.getElementById('startGameBtn');
    
    if (backToMenuBtn && backToMenuBtn.offsetParent !== null) {
        scanState.menuButtons.push({ element: backToMenuBtn, label: 'Back to Main Menu', action: 'back' });
    }
    
    if (randomizeBtn && randomizeBtn.offsetParent !== null) {
        scanState.menuButtons.push({ element: randomizeBtn, label: 'Randomize Ships', action: 'randomize' });
    }
    
    // Add virtual "Select Ship" button to scan ships for modification
    scanState.menuButtons.push({ element: null, label: 'Select Ship to Modify', action: 'selectShip' });
    
    if (startGameBtn && startGameBtn.offsetParent !== null) {
        scanState.menuButtons.push({ element: startGameBtn, label: 'Place Ships', action: 'start' });
    }
}

// =========================================
// SCANNING INPUT HANDLING
// =========================================
function setupScanningInput() {
    // Use window instead of document for better iframe compatibility
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    // Listen for postMessage from parent hub (web app iframe support)
    window.addEventListener('message', (event) => {
        if (!event.data || !event.data.type) return;
        
        // Handle input messages from parent hub
        if (event.data.type === 'gamehub-input-down') {
            const action = event.data.action?.toLowerCase();
            if (action === 'space' || action === 'scan') {
                // Simulate space keydown
                const fakeEvent = { code: 'Space', key: ' ', repeat: false, preventDefault: () => {} };
                handleKeyDown(fakeEvent);
            } else if (action === 'enter' || action === 'select' || action === 'return') {
                // Simulate enter keydown
                const fakeEvent = { code: 'Enter', key: 'Enter', repeat: false, preventDefault: () => {} };
                handleKeyDown(fakeEvent);
            }
        } else if (event.data.type === 'gamehub-input-up') {
            const action = event.data.action?.toLowerCase();
            if (action === 'space' || action === 'scan') {
                // Simulate space keyup
                const fakeEvent = { code: 'Space', key: ' ', preventDefault: () => {} };
                handleKeyUp(fakeEvent);
            } else if (action === 'enter' || action === 'select' || action === 'return') {
                // Simulate enter keyup
                const fakeEvent = { code: 'Enter', key: 'Enter', preventDefault: () => {} };
                handleKeyUp(fakeEvent);
            }
        } else if (event.data.type === 'gamehub-input') {
            // Legacy single-shot input (press + release)
            const action = event.data.action?.toLowerCase();
            if (action === 'space' || action === 'scan') {
                scanForward();
            } else if (action === 'enter' || action === 'select' || action === 'return') {
                selectCurrentItem();
            }
        } else if (event.data.type === 'narbe-voice-settings-changed') {
            // Handle voice settings from hub
            if (window.NarbeVoiceManager && event.data.settings) {
                window.NarbeVoiceManager.applySettings(event.data.settings);
            }
        }
    });
    
    // Handle input cancelled events from scan-manager (anti-tremor)
    document.addEventListener('narbe-input-cancelled', (e) => {
        if (e.detail && (e.detail.key === ' ' || e.detail.code === 'Space')) {
            if (scanState.spaceTimer) {
                clearTimeout(scanState.spaceTimer);
                scanState.spaceTimer = null;
            }
            const wasBackwardScanning = scanState.spaceRepeatInterval !== null;
            if (scanState.spaceRepeatInterval) {
                clearInterval(scanState.spaceRepeatInterval);
                scanState.spaceRepeatInterval = null;
            }
            scanState.spaceHeld = false;
            
            // If cancelled due to 'too-short' but wasn't backward scanning, do a forward scan
            if (e.detail.reason === 'too-short' && !wasBackwardScanning) {
                scanState.lastInputTime = Date.now();
                scanForward();
            }
        }
        if (e.detail && (e.detail.key === 'Enter' || e.detail.code === 'Enter' || e.detail.code === 'NumpadEnter')) {
            // Clear enter timer to prevent accidental pause
            if (scanState.enterTimer) {
                clearTimeout(scanState.enterTimer);
                scanState.enterTimer = null;
            }
            scanState.enterHeld = false;
            scanState.enterLongTriggered = false;
            
            if (e.detail.reason === 'too-short') {
                scanState.lastInputTime = Date.now();
                selectCurrentItem();
            }
        }
    });
}

function handleKeyDown(e) {
    if (e.repeat) return;
    
    // Anti-tremor: check minimum time between inputs
    const now = Date.now();
    const sensitivity = window.NarbeScanManager ? window.NarbeScanManager.getInputSensitivity() : 50;
    if (now - scanState.lastInputTime < sensitivity) {
        return; // Ignore input - too fast (anti-tremor)
    }
    
    if (e.code === 'Space') {
        e.preventDefault();
        if (!scanState.spaceHeld && !scanState.spaceTimer && !scanState.spaceRepeatInterval) {
            scanState.lastInputTime = now;
            scanState.spaceHeld = true;
            scanState.spaceStartTime = Date.now();
            
            // Set up long press for backward scanning
            scanState.spaceTimer = setTimeout(() => {
                startBackwardScanLoop();
                scanState.spaceTimer = null;
            }, config.longPress);
        }
    } else if (e.code === 'Enter' || e.code === 'NumpadEnter') {
        e.preventDefault();
        if (!scanState.enterHeld) {
            scanState.lastInputTime = now;
            scanState.enterHeld = true;
            scanState.enterStartTime = Date.now();
            
            // During gameplay (attack phase only), set up 5-second hold for pause menu
            // Don't allow pause during defense phase (enemy's turn)
            if ((scanState.mode === 'game-row' || scanState.mode === 'game-cell') && gamePhase === 'attack') {
                scanState.enterTimer = setTimeout(() => {
                    scanState.enterLongTriggered = true;
                    showPauseModal();
                }, config.pauseLongPress);
            } else if (gamePhase !== 'defense') {
                // Set up long press for going back (in cell modes during placement)
                scanState.enterTimer = setTimeout(() => {
                    scanState.enterLongTriggered = true;
                    handleEnterLongPress();
                }, config.enterLongPress);
            }
        }
    } else if (e.code === 'Escape') {
        // Cancel current scanning mode and go back
        handleEscapeKey();
    }
}

function handleEscapeKey() {
    switch (scanState.mode) {
        case 'settings-menu':
            // Go back to main menu
            showMainMenu();
            break;
        case 'buttons':
            // Go back to main menu from game
            showMainMenu();
            break;
        case 'cell':
            // Go back to row scanning
            scanState.mode = 'row';
            scanState.cellIndex = -1;
            clearAllHighlights();
            highlightRow();
            speak('Back to row selection.');
            announceCurrentItem();
            startAutoScan();
            break;
        case 'row':
            // Go back to button scanning
            scanState.mode = 'buttons';
            scanState.scanIndex = -1;
            scanState.rowIndex = -1;
            movingShip = false;
            clearAllHighlights();
            speak('Placement cancelled. Back to menu.');
            startAutoScan();
            break;
        case 'ships':
            // Go back to button scanning
            scanState.mode = 'buttons';
            scanState.scanIndex = -1;
            clearAllHighlights();
            speak('Back to menu.');
            startAutoScan();
            break;
        case 'modal':
            // Close modal
            hideShipActionModal();
            break;
        case 'game-cell':
            // Go back to row scanning
            scanState.mode = 'game-row';
            scanState.cellIndex = -1;
            clearAllHighlights();
            speak('Back to row selection.');
            highlightGameRow();
            break;
        case 'game-row':
            // During gameplay, ESC goes back to pause button focus or does nothing
            // Pause is triggered by holding Enter for 5 seconds instead
            speak('Hold Enter for 5 seconds to pause.');
            break;
        case 'game-over':
            // Return to main menu
            returnToMainMenu();
            break;
        case 'pause':
            // Close pause modal and continue
            hidePauseModal();
            break;
    }
}

function handleKeyUp(e) {
    if (e.code === 'Space') {
        e.preventDefault();
        clearTimeout(scanState.spaceTimer);
        scanState.spaceTimer = null;
        
        const wasBackwardScanning = scanState.spaceRepeatInterval !== null;
        if (scanState.spaceRepeatInterval) {
            clearInterval(scanState.spaceRepeatInterval);
            scanState.spaceRepeatInterval = null;
        }
        
        // Perform forward scan on space release (unless we were backward scanning)
        if (!wasBackwardScanning) {
            scanForward();
        }
        scanState.spaceHeld = false;
    } else if (e.code === 'Enter' || e.code === 'NumpadEnter') {
        e.preventDefault();
        // Clear the long-press timer
        if (scanState.enterTimer) {
            clearTimeout(scanState.enterTimer);
            scanState.enterTimer = null;
        }
        
        // Perform selection on enter release (unless long press already triggered)
        if (!scanState.enterLongTriggered) {
            selectCurrentItem();
        }
        scanState.enterHeld = false;
        scanState.enterLongTriggered = false;
    }
}

function handleEnterLongPress() {
    // Long-hold Enter goes back to row scanning in cell modes
    switch (scanState.mode) {
        case 'cell':
            scanState.mode = 'row';
            scanState.cellIndex = -1;
            clearAllHighlights();
            highlightRow();
            speak('Back to row selection.');
            announceCurrentItem();
            startAutoScan();
            break;
        case 'game-cell':
            scanState.mode = 'game-row';
            scanState.cellIndex = -1;
            clearAllHighlights();
            highlightGameRow();
            speak('Back to row selection.');
            announceCurrentItem();
            startAutoScan();
            break;
    }
}

function startBackwardScanLoop() {
    scanBackward();
    const interval = getScanInterval();
    scanState.spaceRepeatInterval = setInterval(() => {
        scanBackward();
    }, interval);
}

function getScanInterval() {
    // Use scan-manager settings
    if (window.NarbeScanManager) {
        return window.NarbeScanManager.getScanInterval();
    }
    // Fallback to local settings
    return scanSpeeds[settings.scanSpeedIndex].interval;
}

function isAutoScanEnabled() {
    // Use scan-manager settings
    if (window.NarbeScanManager) {
        return window.NarbeScanManager.getSettings().autoScan;
    }
    return false;
}

// =========================================
// AUTO-SCAN
// =========================================
function startAutoScan() {
    stopAutoScan();
    
    if (isAutoScanEnabled()) {
        const interval = getScanInterval();
        scanState.autoScanTimer = setInterval(() => {
            scanForward();
        }, interval);
    }
}

function stopAutoScan() {
    if (scanState.autoScanTimer) {
        clearInterval(scanState.autoScanTimer);
        scanState.autoScanTimer = null;
    }
}

function restartAutoScan() {
    startAutoScan();
}

// =========================================
// SCAN FORWARD / BACKWARD
// =========================================
function scanForward() {
    // Block scanning during defense phase (enemy's turn) in active game, except for pause menus
    if (gameStarted && gamePhase === 'defense' && scanState.mode !== 'pause' && scanState.mode !== 'pause-settings') return;
    
    playSound('scan');
    
    switch (scanState.mode) {
        case 'main-menu':
            scanMainMenuForward();
            break;
        case 'settings-menu':
            scanSettingsMenuForward();
            break;
        case 'buttons':
            scanMenuButtonsForward();
            break;
        case 'ships':
            scanShipsForward();
            break;
        case 'modal':
            scanModalForward();
            break;
        case 'row':
            scanRowForward();
            break;
        case 'cell':
            scanCellForward();
            break;
        case 'game-row':
            scanGameRowForward();
            break;
        case 'game-cell':
            scanGameCellForward();
            break;
        case 'game-over':
            scanGameOverForward();
            break;
        case 'pause':
            scanPauseForward();
            break;
        case 'cover':
            // Cover screen only has one button - just highlight it
            highlightCoverButton();
            break;
        case 'pause-settings':
            scanPauseSettingsForward();
            break;
    }
    
    restartAutoScan();
}

function scanBackward() {
    // Block scanning during defense phase (enemy's turn) in active game, except for pause menus
    if (gameStarted && gamePhase === 'defense' && scanState.mode !== 'pause' && scanState.mode !== 'pause-settings') return;
    
    playSound('scan');
    
    switch (scanState.mode) {
        case 'main-menu':
            scanMainMenuBackward();
            break;
        case 'settings-menu':
            scanSettingsMenuBackward();
            break;
        case 'buttons':
            scanMenuButtonsBackward();
            break;
        case 'ships':
            scanShipsBackward();
            break;
        case 'modal':
            scanModalBackward();
            break;
        case 'row':
            scanRowBackward();
            break;
        case 'cell':
            scanCellBackward();
            break;
        case 'game-row':
            scanGameRowBackward();
            break;
        case 'game-cell':
            scanGameCellBackward();
            break;
        case 'game-over':
            scanGameOverBackward();
            break;
        case 'pause':
            scanPauseBackward();
            break;
        case 'cover':
            // Cover screen only has one button - just highlight it
            highlightCoverButton();
            break;
        case 'pause-settings':
            scanPauseSettingsBackward();
            break;
    }
}

// =========================================
// MAIN MENU SCANNING
// =========================================
function scanMainMenuForward() {
    updateMainMenuButtonsList();
    if (scanState.mainMenuButtons.length === 0) return;
    
    scanState.scanIndex = (scanState.scanIndex + 1) % scanState.mainMenuButtons.length;
    highlightMainMenuButton();
    announceCurrentItem();
}

function scanMainMenuBackward() {
    updateMainMenuButtonsList();
    if (scanState.mainMenuButtons.length === 0) return;
    
    scanState.scanIndex = (scanState.scanIndex - 1 + scanState.mainMenuButtons.length) % scanState.mainMenuButtons.length;
    highlightMainMenuButton();
    announceCurrentItem();
}

function highlightMainMenuButton() {
    clearAllHighlights();
    
    if (scanState.scanIndex >= 0 && scanState.scanIndex < scanState.mainMenuButtons.length) {
        const btn = scanState.mainMenuButtons[scanState.scanIndex].element;
        if (btn) btn.classList.add('scan-highlight');
    }
}

// =========================================
// SETTINGS MENU SCANNING
// =========================================
function scanSettingsMenuForward() {
    updateSettingsButtonsList();
    if (scanState.settingsButtons.length === 0) return;
    
    scanState.scanIndex = (scanState.scanIndex + 1) % scanState.settingsButtons.length;
    highlightSettingsButton();
    announceCurrentItem();
}

function scanSettingsMenuBackward() {
    updateSettingsButtonsList();
    if (scanState.settingsButtons.length === 0) return;
    
    scanState.scanIndex = (scanState.scanIndex - 1 + scanState.settingsButtons.length) % scanState.settingsButtons.length;
    highlightSettingsButton();
    announceCurrentItem();
}

function highlightSettingsButton() {
    clearAllHighlights();
    
    if (scanState.scanIndex >= 0 && scanState.scanIndex < scanState.settingsButtons.length) {
        const btn = scanState.settingsButtons[scanState.scanIndex].element;
        if (btn) btn.classList.add('scan-highlight');
    }
}

// =========================================
// GAME OVER SCANNING
// =========================================
function scanGameOverForward() {
    updateGameOverButtonsList();
    if (scanState.gameOverButtons.length === 0) return;
    
    scanState.scanIndex = (scanState.scanIndex + 1) % scanState.gameOverButtons.length;
    highlightGameOverButton();
    announceCurrentItem();
}

function scanGameOverBackward() {
    updateGameOverButtonsList();
    if (scanState.gameOverButtons.length === 0) return;
    
    scanState.scanIndex = (scanState.scanIndex - 1 + scanState.gameOverButtons.length) % scanState.gameOverButtons.length;
    highlightGameOverButton();
    announceCurrentItem();
}

function highlightGameOverButton() {
    clearAllHighlights();
    
    if (scanState.scanIndex >= 0 && scanState.scanIndex < scanState.gameOverButtons.length) {
        const btn = scanState.gameOverButtons[scanState.scanIndex].element;
        if (btn) btn.classList.add('scan-highlight');
    }
}

// =========================================
// PAUSE SCANNING
// =========================================
function scanPauseForward() {
    updatePauseButtonsList();
    if (scanState.pauseButtons.length === 0) return;
    
    scanState.scanIndex = (scanState.scanIndex + 1) % scanState.pauseButtons.length;
    highlightPauseButton();
    announceCurrentItem();
}

function scanPauseBackward() {
    updatePauseButtonsList();
    if (scanState.pauseButtons.length === 0) return;
    
    scanState.scanIndex = (scanState.scanIndex - 1 + scanState.pauseButtons.length) % scanState.pauseButtons.length;
    highlightPauseButton();
    announceCurrentItem();
}

function highlightPauseButton() {
    clearAllHighlights();
    
    if (scanState.scanIndex >= 0 && scanState.scanIndex < scanState.pauseButtons.length) {
        const btn = scanState.pauseButtons[scanState.scanIndex].element;
        if (btn) btn.classList.add('scan-highlight');
    }
}

// =========================================
// PAUSE SETTINGS SCANNING
// =========================================
function scanPauseSettingsForward() {
    updatePauseSettingsButtonsList();
    if (scanState.pauseSettingsButtons.length === 0) return;
    
    scanState.scanIndex = (scanState.scanIndex + 1) % scanState.pauseSettingsButtons.length;
    highlightPauseSettingsButton();
    announceCurrentItem();
}

function scanPauseSettingsBackward() {
    updatePauseSettingsButtonsList();
    if (scanState.pauseSettingsButtons.length === 0) return;
    
    scanState.scanIndex = (scanState.scanIndex - 1 + scanState.pauseSettingsButtons.length) % scanState.pauseSettingsButtons.length;
    highlightPauseSettingsButton();
    announceCurrentItem();
}

function highlightPauseSettingsButton() {
    clearAllHighlights();
    
    if (scanState.scanIndex >= 0 && scanState.scanIndex < scanState.pauseSettingsButtons.length) {
        const btn = scanState.pauseSettingsButtons[scanState.scanIndex].element;
        if (btn) btn.classList.add('scan-highlight');
    }
}

// =========================================
// COVER SCREEN SCANNING
// =========================================
function highlightCoverButton() {
    clearAllHighlights();
    
    // Cover screen only has one button - highlight the Ready button
    if (scanState.coverButtons && scanState.coverButtons.length > 0) {
        const btn = scanState.coverButtons[0].element;
        if (btn) btn.classList.add('scan-highlight');
    }
}

// =========================================
// MENU BUTTON SCANNING (Back, Randomize, Place Ships)
// =========================================
function scanMenuButtonsForward() {
    updateMenuButtonsList();
    if (scanState.menuButtons.length === 0) return;
    
    scanState.scanIndex = (scanState.scanIndex + 1) % scanState.menuButtons.length;
    highlightMenuButton();
    announceCurrentItem();
}

function scanMenuButtonsBackward() {
    updateMenuButtonsList();
    if (scanState.menuButtons.length === 0) return;
    
    scanState.scanIndex = (scanState.scanIndex - 1 + scanState.menuButtons.length) % scanState.menuButtons.length;
    highlightMenuButton();
    announceCurrentItem();
}

function highlightMenuButton() {
    clearAllHighlights();
    
    // Use placementBoard during placement
    const board = placementBoard || playerBoard;
    
    if (scanState.scanIndex >= 0 && scanState.scanIndex < scanState.menuButtons.length) {
        const item = scanState.menuButtons[scanState.scanIndex];
        if (item.element) {
            // Real button - add highlight class
            item.element.classList.add('scan-highlight');
        } else if (item.action === 'selectShip' && board) {
            // Virtual "Select Ship" button - highlight all ships on grid
            ships.forEach(ship => {
                if (ship.placed) {
                    ship.coords.forEach(coord => {
                        const cell = board.querySelector(`.grid-cell[data-row="${coord.row}"][data-col="${coord.col}"]`);
                        if (cell) {
                            cell.classList.add('scan-highlight');
                        }
                    });
                }
            });
        }
    }
}

// =========================================
// SHIP SCANNING (for selecting ships on grid)
// =========================================
function buildShipScanList() {
    // Build list of ships that are placed
    scanState.shipButtons = [];
    ships.forEach((ship, idx) => {
        if (ship.placed && ship.coords.length > 0) {
            scanState.shipButtons.push({
                shipIndex: idx,
                ship: ship,
                label: ship.label,
                action: 'select'
            });
        }
    });
    
    // Add "Back" option to return to button scanning
    scanState.shipButtons.push({
        shipIndex: -1,
        ship: null,
        label: 'Back to Menu',
        action: 'back'
    });
}

function scanShipsForward() {
    buildShipScanList();
    if (scanState.shipButtons.length === 0) return;
    
    scanState.scanIndex = (scanState.scanIndex + 1) % scanState.shipButtons.length;
    highlightShip();
    announceCurrentItem();
}

function scanShipsBackward() {
    buildShipScanList();
    if (scanState.shipButtons.length === 0) return;
    
    scanState.scanIndex = (scanState.scanIndex - 1 + scanState.shipButtons.length) % scanState.shipButtons.length;
    highlightShip();
    announceCurrentItem();
}

function highlightShip() {
    clearAllHighlights();
    
    // Use placementBoard during placement
    const board = placementBoard || playerBoard;
    if (!board) return;
    
    if (scanState.scanIndex >= 0 && scanState.scanIndex < scanState.shipButtons.length) {
        const shipData = scanState.shipButtons[scanState.scanIndex];
        
        if (shipData.action === 'back') {
            // Highlight the menu buttons area for "Back" option
            const randomizeBtn = document.getElementById('randomizeBtn');
            const startGameBtn = document.getElementById('startGameBtn');
            if (randomizeBtn) randomizeBtn.classList.add('scan-highlight');
            if (startGameBtn) startGameBtn.classList.add('scan-highlight');
        } else if (shipData.ship && shipData.ship.coords) {
            // Highlight all cells of THIS specific ship only
            const shipToHighlight = shipData.ship;
            shipToHighlight.coords.forEach(coord => {
                const cell = board.querySelector(`.grid-cell[data-row="${coord.row}"][data-col="${coord.col}"]`);
                if (cell) {
                    cell.classList.add('scan-highlight');
                }
            });
        }
    }
}

// =========================================
// MODAL SCANNING (Rotate, Move, Cancel)
// =========================================
function updateModalButtonsList() {
    scanState.modalButtons = [];
    const rotateBtn = document.getElementById('rotateShipModalBtn');
    const moveBtn = document.getElementById('moveShipModalBtn');
    const cancelBtn = document.getElementById('cancelShipModalBtn');
    
    if (rotateBtn) scanState.modalButtons.push({ element: rotateBtn, label: 'Rotate Ship' });
    if (moveBtn) scanState.modalButtons.push({ element: moveBtn, label: 'Move Ship' });
    if (cancelBtn) scanState.modalButtons.push({ element: cancelBtn, label: 'Cancel' });
}

function scanModalForward() {
    updateModalButtonsList();
    if (scanState.modalButtons.length === 0) return;
    
    scanState.scanIndex = (scanState.scanIndex + 1) % scanState.modalButtons.length;
    highlightModalButton();
    announceCurrentItem();
}

function scanModalBackward() {
    updateModalButtonsList();
    if (scanState.modalButtons.length === 0) return;
    
    scanState.scanIndex = (scanState.scanIndex - 1 + scanState.modalButtons.length) % scanState.modalButtons.length;
    highlightModalButton();
    announceCurrentItem();
}

function highlightModalButton() {
    clearAllHighlights();
    
    if (scanState.scanIndex >= 0 && scanState.scanIndex < scanState.modalButtons.length) {
        const btn = scanState.modalButtons[scanState.scanIndex].element;
        btn.classList.add('scan-highlight');
    }
}

// =========================================
// ROW SCANNING (for ship placement)
// =========================================
function scanRowForward() {
    // Row indices: -1 (deadzone), 0-9 (rows A-J)
    // Total of 11 virtual positions
    let currentVirtual = scanState.rowIndex === -1 ? 10 : scanState.rowIndex;
    currentVirtual = (currentVirtual + 1) % 11;
    scanState.rowIndex = currentVirtual === 10 ? -1 : currentVirtual;
    highlightRow();
    announceCurrentItem();
}

function scanRowBackward() {
    // Row indices: -1 (deadzone), 0-9 (rows A-J)
    // Total of 11 virtual positions
    let currentVirtual = scanState.rowIndex === -1 ? 10 : scanState.rowIndex;
    currentVirtual = (currentVirtual - 1 + 11) % 11;
    scanState.rowIndex = currentVirtual === 10 ? -1 : currentVirtual;
    highlightRow();
    announceCurrentItem();
}

function highlightRow() {
    clearAllHighlights();
    
    // Deadzone: no highlighting
    if (scanState.rowIndex === -1) return;
    
    // Use placementBoard during placement, otherwise playerBoard
    const board = placementBoard || playerBoard;
    if (!board) return;
    
    // Highlight entire row (A-J)
    for (let col = 0; col < 10; col++) {
        const cell = board.querySelector(`.grid-cell[data-row="${scanState.rowIndex}"][data-col="${col}"]`);
        if (cell) {
            cell.classList.add('row-highlight');
        }
    }
}

// =========================================
// CELL SCANNING (within selected row)
// =========================================
function scanCellForward() {
    const nextIndex = scanState.cellIndex + 1;
    if (nextIndex >= 10) {
        // Wrapped around - go back to row mode
        scanState.mode = 'row';
        scanState.cellIndex = -1;
        clearAllHighlights();
        highlightRow();
        speak('Back to row selection.');
        announceCurrentItem();
        return;
    }
    scanState.cellIndex = nextIndex;
    highlightCell();
    announceCurrentItem();
}

function scanCellBackward() {
    const nextIndex = scanState.cellIndex - 1;
    if (nextIndex < 0) {
        // Wrapped around - go back to row mode
        scanState.mode = 'row';
        scanState.cellIndex = -1;
        clearAllHighlights();
        highlightRow();
        speak('Back to row selection.');
        announceCurrentItem();
        return;
    }
    scanState.cellIndex = nextIndex;
    highlightCell();
    announceCurrentItem();
}

function highlightCell() {
    clearAllHighlights();
    
    // Use placementBoard during placement, otherwise playerBoard
    const board = placementBoard || playerBoard;
    if (!board) return;
    
    // rowIndex = row (A-J), cellIndex = column (1-10)
    const cell = board.querySelector(`.grid-cell[data-row="${scanState.rowIndex}"][data-col="${scanState.cellIndex}"]`);
    if (cell) {
        cell.classList.add('scan-highlight');
    }
    
    // Also show preview of ship placement
    previewShipPlacement(scanState.rowIndex, scanState.cellIndex);
}

function previewShipPlacement(row, col) {
    // Use placementBoard during placement, otherwise playerBoard
    const board = placementBoard || playerBoard;
    if (!board) return;
    
    // Clear previous previews
    board.querySelectorAll('.placement-preview').forEach(el => el.classList.remove('placement-preview'));
    
    const ship = ships[currentShipIndex];
    const origin = getPlacementOrigin(row, col, ship.length, placementOrientation);
    
    // Show preview cells
    for (let offset = 0; offset < ship.length; offset++) {
        const r = placementOrientation === 'vertical' ? origin.row + offset : origin.row;
        const c = placementOrientation === 'horizontal' ? origin.col + offset : origin.col;
        
        if (r >= 0 && r < 10 && c >= 0 && c < 10) {
            const previewCell = board.querySelector(`.grid-cell[data-row="${r}"][data-col="${c}"]`);
            if (previewCell) {
                previewCell.classList.add('placement-preview');
            }
        }
    }
}

// =========================================
// GAME ROW SCANNING (for firing at enemy)
// =========================================
function scanGameRowForward() {
    // Row indices: -1 (deadzone), 0-9 (rows A-J)
    // Total of 11 virtual positions
    let currentVirtual = scanState.rowIndex === -1 ? 10 : scanState.rowIndex;
    let attempts = 0;
    
    do {
        currentVirtual = (currentVirtual + 1) % 11;
        attempts++;
        // Stop if we've checked all positions (avoid infinite loop)
        if (attempts > 11) break;
    } while (currentVirtual !== 10 && isRowFullyFired(currentVirtual));
    
    scanState.rowIndex = currentVirtual === 10 ? -1 : currentVirtual;
    highlightGameRow();
    announceCurrentItem();
}

function scanGameRowBackward() {
    // Row indices: -1 (deadzone), 0-9 (rows A-J)
    // Total of 11 virtual positions
    let currentVirtual = scanState.rowIndex === -1 ? 10 : scanState.rowIndex;
    let attempts = 0;
    
    do {
        currentVirtual = (currentVirtual - 1 + 11) % 11;
        attempts++;
        // Stop if we've checked all positions (avoid infinite loop)
        if (attempts > 11) break;
    } while (currentVirtual !== 10 && isRowFullyFired(currentVirtual));
    
    scanState.rowIndex = currentVirtual === 10 ? -1 : currentVirtual;
    highlightGameRow();
    announceCurrentItem();
}

function isRowFullyFired(row) {
    // Check if all cells in this row have been fired at
    for (let col = 0; col < 10; col++) {
        if (!isCellAlreadyFired(row, col)) {
            return false; // Found an unfired cell
        }
    }
    return true; // All cells fired
}

function highlightGameRow() {
    clearAllHighlights();
    
    // Deadzone: no highlighting
    if (scanState.rowIndex === -1) return;
    
    // Highlight row on attack grid (where player fires) - only unfired cells
    const grid = attackGrid || playerBoard;
    if (!grid) return;
    for (let col = 0; col < 10; col++) {
        // Skip already fired cells
        if (isCellAlreadyFired(scanState.rowIndex, col)) continue;
        
        const cell = grid.querySelector(`.grid-cell[data-row="${scanState.rowIndex}"][data-col="${col}"]`);
        if (cell) {
            cell.classList.add('row-highlight');
        }
    }
}

// =========================================
// GAME CELL SCANNING (for firing at enemy)
// =========================================
function scanGameCellForward() {
    // Find next unfired cell in row (scanning columns 1-10)
    const startIndex = scanState.cellIndex;
    let nextIndex = scanState.cellIndex + 1;
    
    // Skip already fired cells
    while (nextIndex < 10 && isCellAlreadyFired(scanState.rowIndex, nextIndex)) {
        nextIndex++;
    }
    
    if (nextIndex >= 10) {
        // Wrapped around or no more cells - go back to row mode
        scanState.mode = 'game-row';
        scanState.cellIndex = -1;
        clearAllHighlights();
        highlightGameRow();
        speak('Back to row selection.');
        announceCurrentItem();
        return;
    }
    
    scanState.cellIndex = nextIndex;
    highlightGameCell();
    announceCurrentItem();
}

function scanGameCellBackward() {
    const startIndex = scanState.cellIndex;
    let nextIndex = scanState.cellIndex - 1;
    
    // Skip already fired cells
    while (nextIndex >= 0 && isCellAlreadyFired(scanState.rowIndex, nextIndex)) {
        nextIndex--;
    }
    
    if (nextIndex < 0) {
        // Wrap to column 10 (index 9) and continue scanning backward
        nextIndex = 9;
        while (nextIndex >= 0 && isCellAlreadyFired(scanState.rowIndex, nextIndex)) {
            nextIndex--;
        }
        
        // If we've wrapped all the way back to start or no cells left, go to row mode
        if (nextIndex < 0 || nextIndex === startIndex) {
            scanState.mode = 'game-row';
            scanState.cellIndex = -1;
            clearAllHighlights();
            highlightGameRow();
            speak('Back to row selection.');
            announceCurrentItem();
            return;
        }
    }
    
    scanState.cellIndex = nextIndex;
    highlightGameCell();
    announceCurrentItem();
}

function isCellAlreadyFired(row, col) {
    // In 1P mode, check player1's attacks on enemy
    // In 2P mode, check current player's attacks
    let attacks;
    if (gameMode === '2p') {
        attacks = currentPlayer === 1 ? player1.attacks : player2.attacks;
    } else {
        attacks = player1.attacks;
    }
    
    // Check if this cell has been fired at (attacks is a 2D array)
    if (attacks && attacks[row] && attacks[row][col]) {
        return attacks[row][col].fired;
    }
    
    // Fallback to old system
    const cell = enemyCells[row] && enemyCells[row][col];
    return cell ? (cell.hit || cell.miss) : false;
}

function highlightGameCell() {
    clearAllHighlights();
    
    // rowIndex = row (A-J), cellIndex = column (1-10)
    // Highlight on attack grid (where player fires)
    const grid = attackGrid || playerBoard;
    if (!grid) return;
    const cell = grid.querySelector(`.grid-cell[data-row="${scanState.rowIndex}"][data-col="${scanState.cellIndex}"]`);
    if (cell) {
        cell.classList.add('scan-highlight');
    }
}

// =========================================
// SELECT CURRENT ITEM
// =========================================
function selectCurrentItem() {
    // Block selection during defense phase (enemy's turn) in active game, except for pause menus
    if (gameStarted && gamePhase === 'defense' && scanState.mode !== 'pause' && scanState.mode !== 'pause-settings') return;
    
    playSound('select');
    
    switch (scanState.mode) {
        case 'main-menu':
            selectMainMenuButton();
            break;
        case 'settings-menu':
            selectSettingsButton();
            break;
        case 'buttons':
            selectMenuButton();
            break;
        case 'ships':
            selectShip();
            break;
        case 'modal':
            selectModalButton();
            break;
        case 'row':
            enterCellMode();
            break;
        case 'cell':
            placeShipAtCurrentCell();
            break;
        case 'game-row':
            enterGameCellMode();
            break;
        case 'game-cell':
            fireAtCurrentCell();
            break;
        case 'game-over':
            selectGameOverButton();
            break;
        case 'pause':
            selectPauseButton();
            break;
        case 'cover':
            selectCoverButton();
            break;
        case 'pause-settings':
            selectPauseSettingsButton();
            break;
    }
}

function selectCoverButton() {
    // Cover screen only has one button - Ready
    if (scanState.coverButtons && scanState.coverButtons.length > 0) {
        onCoverReady();
    }
}

function selectPauseButton() {
    if (scanState.scanIndex >= 0 && scanState.scanIndex < scanState.pauseButtons.length) {
        const item = scanState.pauseButtons[scanState.scanIndex];
        
        switch (item.action) {
            case 'continue':
                hidePauseModal();
                break;
            case 'settings':
                showSettingsFromPause();
                break;
            case 'mainMenu':
                returnToMainMenuFromPause();
                break;
        }
    }
}

function selectPauseSettingsButton() {
    if (scanState.scanIndex >= 0 && scanState.scanIndex < scanState.pauseSettingsButtons.length) {
        const item = scanState.pauseSettingsButtons[scanState.scanIndex];
        
        switch (item.action) {
            case 'tts':
                toggleTTS();
                updatePauseSettingsDisplay();
                updatePauseSettingsButtonsList();
                break;
            case 'sound':
                toggleSound();
                updatePauseSettingsDisplay();
                updatePauseSettingsButtonsList();
                break;
            case 'theme':
                cycleTheme();
                updatePauseSettingsDisplay();
                updatePauseSettingsButtonsList();
                break;
            case 'highlightStyle':
                cycleHighlightStyle();
                updatePauseSettingsDisplay();
                updatePauseSettingsButtonsList();
                break;
            case 'highlightColor':
                cycleHighlightColor();
                updatePauseSettingsDisplay();
                updatePauseSettingsButtonsList();
                break;
            case 'scanSpeed':
                cycleScanSpeed();
                updatePauseSettingsDisplay();
                updatePauseSettingsButtonsList();
                break;
            case 'back':
                goBackToPauseMenu();
                break;
        }
    }
}

function selectMainMenuButton() {
    if (scanState.scanIndex >= 0 && scanState.scanIndex < scanState.mainMenuButtons.length) {
        const item = scanState.mainMenuButtons[scanState.scanIndex];
        if (item.action === '1p') {
            showGame('1p');
        } else if (item.action === '2p') {
            showGame('2p');
        } else if (item.action === 'settings') {
            showSettings();
        } else if (item.action === 'exit') {
            exitGame();
        }
    }
}

function selectSettingsButton() {
    if (scanState.scanIndex >= 0 && scanState.scanIndex < scanState.settingsButtons.length) {
        const item = scanState.settingsButtons[scanState.scanIndex];
        
        switch (item.action) {
            case 'tts':
                toggleTTS();
                updateSettingsButtonsList();
                break;
            case 'sound':
                toggleSound();
                updateSettingsButtonsList();
                break;
            case 'theme':
                cycleTheme();
                updateSettingsButtonsList();
                break;
            case 'highlightStyle':
                cycleHighlightStyle();
                updateSettingsButtonsList();
                break;
            case 'highlightColor':
                cycleHighlightColor();
                updateSettingsButtonsList();
                break;
            case 'autoScan':
                toggleAutoScan();
                updateSettingsButtonsList();
                break;
            case 'scanSpeed':
                cycleScanSpeed();
                updateSettingsButtonsList();
                break;
            case 'back':
                goBackFromSettings();
                break;
        }
        
        // Re-highlight the current button after toggling
        highlightSettingsButton();
    }
}

function selectGameOverButton() {
    if (scanState.scanIndex >= 0 && scanState.scanIndex < scanState.gameOverButtons.length) {
        const item = scanState.gameOverButtons[scanState.scanIndex];
        if (item.action === 'ok') {
            returnToMainMenu();
        }
    }
}

function selectMenuButton() {
    if (scanState.scanIndex >= 0 && scanState.scanIndex < scanState.menuButtons.length) {
        const item = scanState.menuButtons[scanState.scanIndex];
        
        if (item.action === 'selectShip') {
            // Switch to ship selection mode
            enterShipSelectionMode();
        } else if (item.action === 'back') {
            // Go back to main menu
            showMainMenu();
        } else if (item.element) {
            // Click the actual button
            item.element.click();
        }
    }
}

function selectShip() {
    if (scanState.scanIndex >= 0 && scanState.scanIndex < scanState.shipButtons.length) {
        const shipData = scanState.shipButtons[scanState.scanIndex];
        
        if (shipData.action === 'back') {
            // Return to button scanning mode
            scanState.mode = 'buttons';
            scanState.scanIndex = -1;
            clearAllHighlights();
            speak('Back to menu. Scan buttons.');
            startAutoScan();
            return;
        }
        
        currentShipIndex = shipData.shipIndex;
        
        // Update orientation based on ship
        const ship = ships[currentShipIndex];
        if (ship.coords.length > 1) {
            const isHorizontal = ship.coords[0].row === ship.coords[1].row;
            placementOrientation = isHorizontal ? 'horizontal' : 'vertical';
        }
        
        renderBoards();
        showShipActionModal(ship);
    }
}

function selectModalButton() {
    if (scanState.scanIndex >= 0 && scanState.scanIndex < scanState.modalButtons.length) {
        const btn = scanState.modalButtons[scanState.scanIndex].element;
        btn.click();
    }
}

function enterCellMode() {
    // Don't enter cell mode if in deadzone
    if (scanState.rowIndex === -1) {
        speak('No row selected. Scan to select a row first.');
        return;
    }
    scanState.mode = 'cell';
    scanState.cellIndex = -1;
    speak(`Row ${letters[scanState.rowIndex]} selected. Scan columns. Press Enter to place. Hold Enter to go back.`);
    scanForward(); // Move to first cell
}

function placeShipAtCurrentCell() {
    const row = scanState.rowIndex;
    const col = scanState.cellIndex;
    
    // Change mode BEFORE placing so renderBoards doesn't highlight the ship
    const previousMode = scanState.mode;
    scanState.mode = 'buttons';
    
    if (placeShipAt(row, col)) {
        playSound('place');
        speak(`${ships[currentShipIndex].label} placed at ${getCellLabel(row, col)}.`);
        
        // Return to button scanning
        scanState.scanIndex = -1;
        movingShip = false;
        clearAllHighlights();
        startAutoScan();
    } else {
        // Restore mode if placement failed
        scanState.mode = previousMode;
        playSound('error');
        speak('Cannot place here. Try another position.');
    }
}

function enterGameCellMode() {
    // Don't enter cell mode if in deadzone
    if (scanState.rowIndex === -1) {
        speak('No row selected. Scan to select a row first.');
        return;
    }
    scanState.mode = 'game-cell';
    scanState.cellIndex = -1;
    speak(`Row ${letters[scanState.rowIndex]} selected. Scan columns. Press Enter to fire. Hold Enter to go back.`);
    scanForward(); // Move to first unfired cell
}

function fireAtCurrentCell() {
    const row = scanState.rowIndex;
    const col = scanState.cellIndex;
    
    if (isCellAlreadyFired(row, col)) {
        playSound('error');
        speak('Already fired here. Choose another cell.');
        return;
    }
    
    fireAtEnemy(row, col);
    
    // Return to row scanning
    scanState.mode = 'game-row';
    scanState.scanIndex = scanState.rowIndex;
    clearAllHighlights();
}

// =========================================
// CLEAR HIGHLIGHTS
// =========================================
function clearAllHighlights() {
    document.querySelectorAll('.scan-highlight').forEach(el => el.classList.remove('scan-highlight'));
    document.querySelectorAll('.row-highlight').forEach(el => el.classList.remove('row-highlight'));
    document.querySelectorAll('.placement-preview').forEach(el => el.classList.remove('placement-preview'));
    
    // Restore status text if it was changed by pause highlight
    const statusEl = document.getElementById('statusText');
    if (statusEl && statusEl.textContent === '⏸ PAUSE') {
        if (gameStarted) {
            statusEl.textContent = 'Your turn - scan rows to fire!';
        } else {
            statusEl.textContent = 'Ships randomized! Press Space to scan, Enter to select.';
        }
    }
}

// =========================================
// ANNOUNCE CURRENT ITEM (TTS)
// =========================================
function announceCurrentItem() {
    let text = '';
    
    switch (scanState.mode) {
        case 'main-menu':
            if (scanState.scanIndex >= 0 && scanState.scanIndex < scanState.mainMenuButtons.length) {
                text = scanState.mainMenuButtons[scanState.scanIndex].label;
            }
            break;
        case 'settings-menu':
            if (scanState.scanIndex >= 0 && scanState.scanIndex < scanState.settingsButtons.length) {
                text = scanState.settingsButtons[scanState.scanIndex].label;
            }
            break;
        case 'buttons':
            if (scanState.scanIndex >= 0 && scanState.scanIndex < scanState.menuButtons.length) {
                text = scanState.menuButtons[scanState.scanIndex].label;
            }
            break;
        case 'ships':
            if (scanState.scanIndex >= 0 && scanState.scanIndex < scanState.shipButtons.length) {
                const shipData = scanState.shipButtons[scanState.scanIndex];
                text = shipData.label;
            }
            break;
        case 'modal':
            if (scanState.scanIndex >= 0 && scanState.scanIndex < scanState.modalButtons.length) {
                text = scanState.modalButtons[scanState.scanIndex].label;
            }
            break;
        case 'row':
        case 'game-row':
            if (scanState.rowIndex === -1) {
                // In deadzone - don't announce
                return;
            }
            text = `Row ${letters[scanState.rowIndex]}`;
            break;
        case 'cell':
        case 'game-cell':
            text = getCellLabel(scanState.rowIndex, scanState.cellIndex);
            break;
        case 'game-over':
            if (scanState.scanIndex >= 0 && scanState.scanIndex < scanState.gameOverButtons.length) {
                text = scanState.gameOverButtons[scanState.scanIndex].label;
            }
            break;
        case 'pause':
            if (scanState.scanIndex >= 0 && scanState.scanIndex < scanState.pauseButtons.length) {
                text = scanState.pauseButtons[scanState.scanIndex].label;
            }
            break;
        case 'cover':
            if (scanState.coverButtons && scanState.coverButtons.length > 0) {
                text = scanState.coverButtons[0].label;
            }
            break;
        case 'pause-settings':
            if (scanState.scanIndex >= 0 && scanState.scanIndex < scanState.pauseSettingsButtons.length) {
                text = scanState.pauseSettingsButtons[scanState.scanIndex].label;
            }
            break;
    }
    
    if (text) speak(text);
}

// =========================================
// MODE TRANSITIONS
// =========================================
function enterShipSelectionMode() {
    scanState.mode = 'ships';
    scanState.scanIndex = -1;
    buildShipScanList();
    speak('Select a ship to modify. Press Space to scan ships.');
    startAutoScan();
}

function enterRowScanMode() {
    scanState.mode = 'row';
    scanState.rowIndex = -1;  // Start in deadzone so first scan goes to row A
    clearAllHighlights();
    speak('Scan rows. Press Enter to select row.');
    startAutoScan();
}

function enterGameMode() {
    scanState.mode = 'game-row';
    scanState.rowIndex = 0;  // Start at row A
    clearAllHighlights();
    highlightGameRow();
    speak('Your turn. Scan rows to target enemy.');
    announceCurrentItem();
    startAutoScan();
}
