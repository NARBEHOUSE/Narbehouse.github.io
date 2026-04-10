// ============================================
// BENNY'S MEGA SLOTS - Ultimate Casino Experience
// Sound Effects, Visual Effects, Diamond Bonus Mode
// ============================================

// --- Audio Context & Sound System ---
let audioCtx = null;
let bgMusicGain = null;
let sfxGain = null;
let bgMusicOscillators = [];
let isMusicPlaying = false;

function initAudio() {
    if (audioCtx) return;
    try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        
        // Master gains
        bgMusicGain = audioCtx.createGain();
        bgMusicGain.gain.value = 0.15;
        bgMusicGain.connect(audioCtx.destination);
        
        sfxGain = audioCtx.createGain();
        sfxGain.gain.value = 0.4;
        sfxGain.connect(audioCtx.destination);
    } catch (e) {
        console.log('Audio not supported');
    }
}

// Sound effect functions
function playSound(type) {
    if (!audioCtx || !settings.sound) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    
    const now = audioCtx.currentTime;
    
    switch(type) {
        case 'spin':
            // Exciting spin start sound - rising whoosh
            for (let i = 0; i < 3; i++) {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(150 + i * 100, now);
                osc.frequency.exponentialRampToValueAtTime(800 + i * 200, now + 0.3);
                gain.gain.setValueAtTime(0.15, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
                osc.connect(gain);
                gain.connect(sfxGain);
                osc.start(now + i * 0.05);
                osc.stop(now + 0.5);
            }
            break;
            
        case 'reelStop':
            // Satisfying click/thud for each reel
            const clickOsc = audioCtx.createOscillator();
            const clickGain = audioCtx.createGain();
            const clickFilter = audioCtx.createBiquadFilter();
            clickOsc.type = 'square';
            clickOsc.frequency.setValueAtTime(150, now);
            clickOsc.frequency.exponentialRampToValueAtTime(50, now + 0.1);
            clickFilter.type = 'lowpass';
            clickFilter.frequency.value = 800;
            clickGain.gain.setValueAtTime(0.3, now);
            clickGain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
            clickOsc.connect(clickFilter);
            clickFilter.connect(clickGain);
            clickGain.connect(sfxGain);
            clickOsc.start(now);
            clickOsc.stop(now + 0.2);
            break;
            
        case 'reelSpin':
            // Continuous spinning sound tick
            const tickOsc = audioCtx.createOscillator();
            const tickGain = audioCtx.createGain();
            tickOsc.type = 'triangle';
            tickOsc.frequency.value = 800 + Math.random() * 400;
            tickGain.gain.setValueAtTime(0.05, now);
            tickGain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
            tickOsc.connect(tickGain);
            tickGain.connect(sfxGain);
            tickOsc.start(now);
            tickOsc.stop(now + 0.06);
            break;
            
        case 'win':
            // Cheerful win jingle
            const winNotes = [523, 659, 784, 1047];
            winNotes.forEach((freq, i) => {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.type = 'sine';
                osc.frequency.value = freq;
                gain.gain.setValueAtTime(0, now + i * 0.1);
                gain.gain.linearRampToValueAtTime(0.2, now + i * 0.1 + 0.05);
                gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.1 + 0.3);
                osc.connect(gain);
                gain.connect(sfxGain);
                osc.start(now + i * 0.1);
                osc.stop(now + i * 0.1 + 0.4);
            });
            break;
            
        case 'bigWin':
            // Epic big win fanfare
            const bigWinNotes = [392, 494, 587, 784, 988, 1175];
            bigWinNotes.forEach((freq, i) => {
                const osc = audioCtx.createOscillator();
                const osc2 = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.type = 'sawtooth';
                osc2.type = 'sine';
                osc.frequency.value = freq;
                osc2.frequency.value = freq * 2;
                gain.gain.setValueAtTime(0, now + i * 0.08);
                gain.gain.linearRampToValueAtTime(0.15, now + i * 0.08 + 0.05);
                gain.gain.setValueAtTime(0.15, now + i * 0.08 + 0.2);
                gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.08 + 0.5);
                osc.connect(gain);
                osc2.connect(gain);
                gain.connect(sfxGain);
                osc.start(now + i * 0.08);
                osc2.start(now + i * 0.08);
                osc.stop(now + i * 0.08 + 0.6);
                osc2.stop(now + i * 0.08 + 0.6);
            });
            break;
            
        case 'megaWin':
            // Insane mega win - full orchestra hit
            for (let i = 0; i < 8; i++) {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.type = i % 2 === 0 ? 'sawtooth' : 'square';
                const baseFreq = [261, 329, 392, 523, 659, 784, 1047, 1318][i];
                osc.frequency.value = baseFreq;
                gain.gain.setValueAtTime(0.12, now);
                gain.gain.setValueAtTime(0.12, now + 0.3);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 1.5);
                osc.connect(gain);
                gain.connect(sfxGain);
                osc.start(now);
                osc.stop(now + 1.6);
            }
            // Add impact
            const impact = audioCtx.createOscillator();
            const impactGain = audioCtx.createGain();
            impact.type = 'sawtooth';
            impact.frequency.setValueAtTime(80, now);
            impact.frequency.exponentialRampToValueAtTime(30, now + 0.5);
            impactGain.gain.setValueAtTime(0.3, now);
            impactGain.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
            impact.connect(impactGain);
            impactGain.connect(sfxGain);
            impact.start(now);
            impact.stop(now + 0.7);
            break;
            
        case 'bonusTrigger':
            // Magical bonus trigger sound
            for (let i = 0; i < 12; i++) {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(400 + i * 150, now + i * 0.06);
                osc.frequency.exponentialRampToValueAtTime(2000, now + i * 0.06 + 0.3);
                gain.gain.setValueAtTime(0.15, now + i * 0.06);
                gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.06 + 0.4);
                osc.connect(gain);
                gain.connect(sfxGain);
                osc.start(now + i * 0.06);
                osc.stop(now + i * 0.06 + 0.5);
            }
            break;
            
        case 'bonusSpin':
            // Sparkly bonus spin sound
            for (let i = 0; i < 5; i++) {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.type = 'sine';
                osc.frequency.value = 800 + i * 200 + Math.random() * 200;
                gain.gain.setValueAtTime(0.1, now + i * 0.03);
                gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.03 + 0.2);
                osc.connect(gain);
                gain.connect(sfxGain);
                osc.start(now + i * 0.03);
                osc.stop(now + i * 0.03 + 0.25);
            }
            break;
            
        case 'lose':
            // Sad trombone-ish sound
            const loseOsc = audioCtx.createOscillator();
            const loseGain = audioCtx.createGain();
            loseOsc.type = 'sawtooth';
            loseOsc.frequency.setValueAtTime(300, now);
            loseOsc.frequency.exponentialRampToValueAtTime(100, now + 0.5);
            loseGain.gain.setValueAtTime(0.1, now);
            loseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
            loseOsc.connect(loseGain);
            loseGain.connect(sfxGain);
            loseOsc.start(now);
            loseOsc.stop(now + 0.7);
            break;
            
        case 'click':
            // UI click
            const uiOsc = audioCtx.createOscillator();
            const uiGain = audioCtx.createGain();
            uiOsc.type = 'sine';
            uiOsc.frequency.value = 600;
            uiGain.gain.setValueAtTime(0.15, now);
            uiGain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
            uiOsc.connect(uiGain);
            uiGain.connect(sfxGain);
            uiOsc.start(now);
            uiOsc.stop(now + 0.12);
            break;
            
        case 'select':
            // UI select
            const selOsc = audioCtx.createOscillator();
            const selOsc2 = audioCtx.createOscillator();
            const selGain = audioCtx.createGain();
            selOsc.type = 'sine';
            selOsc2.type = 'sine';
            selOsc.frequency.value = 800;
            selOsc2.frequency.value = 1200;
            selGain.gain.setValueAtTime(0.12, now);
            selGain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
            selOsc.connect(selGain);
            selOsc2.connect(selGain);
            selGain.connect(sfxGain);
            selOsc.start(now);
            selOsc2.start(now + 0.05);
            selOsc.stop(now + 0.1);
            selOsc2.stop(now + 0.2);
            break;
            
        case 'coinAdd':
            // Coin/credit add sound
            for (let i = 0; i < 4; i++) {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.type = 'sine';
                osc.frequency.value = 1200 + i * 300;
                gain.gain.setValueAtTime(0.1, now + i * 0.05);
                gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.05 + 0.1);
                osc.connect(gain);
                gain.connect(sfxGain);
                osc.start(now + i * 0.05);
                osc.stop(now + i * 0.05 + 0.15);
            }
            break;
            
        case 'suspense':
            // Dramatic suspense sound - building tension for possible bonus
            const susFilter = audioCtx.createBiquadFilter();
            susFilter.type = 'lowpass';
            susFilter.frequency.setValueAtTime(200, now);
            susFilter.frequency.exponentialRampToValueAtTime(2000, now + 1.2);
            
            // Deep rumble
            const rumble = audioCtx.createOscillator();
            const rumbleGain = audioCtx.createGain();
            rumble.type = 'sawtooth';
            rumble.frequency.setValueAtTime(50, now);
            rumble.frequency.linearRampToValueAtTime(100, now + 1.2);
            rumbleGain.gain.setValueAtTime(0.15, now);
            rumbleGain.gain.linearRampToValueAtTime(0.25, now + 1.0);
            rumbleGain.gain.exponentialRampToValueAtTime(0.01, now + 1.4);
            rumble.connect(susFilter);
            susFilter.connect(rumbleGain);
            rumbleGain.connect(sfxGain);
            rumble.start(now);
            rumble.stop(now + 1.5);
            
            // Rising tension notes
            const tensionNotes = [220, 277, 330, 415, 523];
            tensionNotes.forEach((freq, i) => {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.type = 'sine';
                osc.frequency.value = freq;
                gain.gain.setValueAtTime(0, now + i * 0.2);
                gain.gain.linearRampToValueAtTime(0.08, now + i * 0.2 + 0.1);
                gain.gain.setValueAtTime(0.08, now + i * 0.2 + 0.15);
                gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.2 + 0.3);
                osc.connect(gain);
                gain.connect(sfxGain);
                osc.start(now + i * 0.2);
                osc.stop(now + i * 0.2 + 0.35);
            });
            break;
    }
}

// Background music - casino ambiance
function startBackgroundMusic() {
    if (!audioCtx || !settings.sound || isMusicPlaying) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    
    isMusicPlaying = true;
    
    // Create a chill, casino-like ambient loop
    const playMusicLoop = () => {
        if (!isMusicPlaying || !settings.sound) return;
        
        const now = audioCtx.currentTime;
        const loopLength = 8; // 8 second loop
        
        // Bass line
        const bassNotes = [65, 65, 82, 82, 73, 73, 87, 87];
        bassNotes.forEach((freq, i) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0.08, now + i);
            gain.gain.setValueAtTime(0.08, now + i + 0.8);
            gain.gain.linearRampToValueAtTime(0.02, now + i + 0.95);
            osc.connect(gain);
            gain.connect(bgMusicGain);
            osc.start(now + i);
            osc.stop(now + i + 1);
        });
        
        // Pad chords
        const chordFreqs = [[196, 247, 294], [196, 247, 294], [220, 277, 330], [220, 277, 330]];
        chordFreqs.forEach((chord, i) => {
            chord.forEach(freq => {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                const filter = audioCtx.createBiquadFilter();
                osc.type = 'sine';
                osc.frequency.value = freq;
                filter.type = 'lowpass';
                filter.frequency.value = 1000;
                gain.gain.setValueAtTime(0.03, now + i * 2);
                gain.gain.linearRampToValueAtTime(0.05, now + i * 2 + 0.5);
                gain.gain.linearRampToValueAtTime(0.02, now + i * 2 + 1.8);
                osc.connect(filter);
                filter.connect(gain);
                gain.connect(bgMusicGain);
                osc.start(now + i * 2);
                osc.stop(now + i * 2 + 2);
            });
        });
        
        // Schedule next loop
        setTimeout(playMusicLoop, loopLength * 1000 - 100);
    };
    
    playMusicLoop();
}

function stopBackgroundMusic() {
    isMusicPlaying = false;
}

// --- Configuration & Constants ---
const config = {
    longPress: 3000,
    repeatInterval: 2000,
    NUM_REELS: 5,
    MIN_BET: 1,
    MAX_BET: 10000,
    STARTING_CREDITS: 1000,
    REFILL_COOLDOWN: 24 * 60 * 60 * 1000,
    REFILL_AMOUNT: 500,
    BUY_COOLDOWN: 24 * 60 * 60 * 1000
};

const themes = [
    { name: 'Casino Nights', bg: 'linear-gradient(135deg, #0a0a1a 0%, #1a0a2e 50%, #0a1a2e 100%)' },
    { name: 'Vegas Neon', bg: 'linear-gradient(135deg, #ff0844, #ffb199)' },
    { name: 'Royal Purple', bg: 'linear-gradient(135deg, #667eea, #764ba2)' },
    { name: 'Ocean Blue', bg: 'linear-gradient(135deg, #2193b0, #6dd5ed)' },
    { name: 'Emerald', bg: 'linear-gradient(135deg, #11998e, #38ef7d)' },
    { name: 'Midnight', bg: 'linear-gradient(135deg, #232526, #414345)' }
];

const highlightColors = [
    { name: 'Gold', color: '#ffd700' },
    { name: 'Cyan', color: '#00ffff' },
    { name: 'Magenta', color: '#ff00ff' },
    { name: 'Lime', color: '#00ff00' },
    { name: 'Red', color: '#ff3333' },
    { name: 'Orange', color: '#ff8800' },
    { name: 'Pink', color: '#ff69b4' },
    { name: 'White', color: '#ffffff' }
];

// Symbols - Diamond is special for bonus mode, Wild substitutes for others
// Weights are tightened for standard play - hot streak loosens them up
const symbols = [
    { emoji: '🍒', name: 'Cherry', weight: 35, payout: 2 },
    { emoji: '🍋', name: 'Lemon', weight: 30, payout: 2 },
    { emoji: '🍊', name: 'Orange', weight: 25, payout: 3 },
    { emoji: '🍇', name: 'Grapes', weight: 20, payout: 4 },
    { emoji: '🔔', name: 'Bell', weight: 8, payout: 8 },
    { emoji: '⭐', name: 'Star', weight: 4, payout: 15 },
    { emoji: '7️⃣', name: 'Seven', weight: 2, payout: 40 },
    { emoji: '🃏', name: 'Wild', weight: 2, payout: 60, isWild: true }, // Very rare wild card
    { emoji: '💎', name: 'Diamond', weight: 1, payout: 100, isBonus: true } // Very rare bonus trigger
];

const totalWeight = symbols.reduce((sum, s) => sum + s.weight, 0);

// --- Silent Hot Streak System ---
// Randomly occurs within any 60-minute window, lasts 3-10 minutes
// Significantly boosts ALL win chances including bonuses
// Resets if a bonus is triggered during hot streak
let hotStreakState = {
    active: false,
    startTime: 0,
    duration: 0,
    // Use a "window" system - each window is ~60 mins, hot streak happens randomly within it
    windowStart: 0,
    windowDuration: 0,
    streakScheduledAt: 0 // When in the window the streak will start
};

// --- Progressive Bonus Boost System ---
// After 100 consecutive spins without bonus, increase bonus chance by 10% every 10 spins
// This guarantees a bonus by spin 200 (100% boost = guaranteed at that point)
let bonusBoostState = {
    consecutiveSpinsWithoutBonus: 0
};

// Calculate progressive bonus multiplier based on spins without bonus
function getBonusBoostMultiplier() {
    const spins = bonusBoostState.consecutiveSpinsWithoutBonus;
    if (spins < 100) return 1.0; // No boost before 100 spins
    
    // After 100 spins: +10% every 10 spins
    // 100-109 spins = 10% boost (1.1x)
    // 110-119 spins = 20% boost (1.2x)
    // ...
    // 190-199 spins = 100% boost (2.0x) - but we force bonus at 200
    const tensOver100 = Math.floor((spins - 100) / 10);
    const boostPercent = Math.min(tensOver100 + 1, 10) * 0.1; // Cap at 100% (10 * 10%)
    return 1.0 + boostPercent;
}

// Get number of bonus diamonds to force based on progressive system
function getProgressiveDiamondCount() {
    const spins = bonusBoostState.consecutiveSpinsWithoutBonus;
    if (spins < 199) return 0; // Not forcing yet
    
    // At 200 spins, guarantee 3 diamonds
    // At 200+ we shouldn't get here since bonus would trigger, but just in case:
    // Very slight chance for 4 or 5 diamonds at higher spin counts
    if (spins >= 199) {
        const extraChance = Math.random();
        if (extraChance < 0.05) return 5; // 5% chance for 5 diamonds
        if (extraChance < 0.15) return 4; // 10% chance for 4 diamonds
        return 3; // 85% chance for 3 diamonds
    }
    return 3;
}

// Initialize hot streak window system
function initHotStreak() {
    scheduleNewHotStreakWindow();
}

// Schedule a new 60-minute window with a random hot streak inside it
function scheduleNewHotStreakWindow() {
    const now = Date.now();
    
    // Window is 45-75 minutes (randomized to prevent tracking)
    hotStreakState.windowStart = now;
    hotStreakState.windowDuration = (45 + Math.random() * 30) * 60 * 1000;
    
    // Schedule hot streak to start at random point within the window
    // But not in the first 5 minutes or last 15 minutes
    const safeStart = 5 * 60 * 1000;
    const safeEnd = hotStreakState.windowDuration - 15 * 60 * 1000;
    const randomOffset = safeStart + Math.random() * (safeEnd - safeStart);
    hotStreakState.streakScheduledAt = now + randomOffset;
    
    // Duration: 5-12 minutes (longer than before for better experience)
    hotStreakState.duration = (5 + Math.random() * 7) * 60 * 1000;
    
    hotStreakState.active = false;
}

// Check hot streak status - called on each spin
function checkHotStreak() {
    const now = Date.now();
    
    // Check if current window has expired
    if (now >= hotStreakState.windowStart + hotStreakState.windowDuration) {
        // Start a new window
        scheduleNewHotStreakWindow();
        return;
    }
    
    // If hot streak is active, check if it should end
    if (hotStreakState.active) {
        if (now >= hotStreakState.startTime + hotStreakState.duration) {
            hotStreakState.active = false;
            // Don't schedule new window yet - let current window finish
        }
    } else {
        // Check if we should start the hot streak
        if (now >= hotStreakState.streakScheduledAt && 
            now < hotStreakState.streakScheduledAt + hotStreakState.duration) {
            hotStreakState.active = true;
            hotStreakState.startTime = now;
        }
    }
}

// Reset hot streak when bonus is triggered (ends the lucky period)
function resetHotStreak() {
    hotStreakState.active = false;
    // Schedule new window immediately so player can get another hot streak later
    scheduleNewHotStreakWindow();
}

function isHotStreakActive() {
    // Check status first
    checkHotStreak();
    return hotStreakState.active;
}

// --- State Management ---
const state = {
    mode: 'menu',
    menuState: 'main',
    menuIndex: 0,
    pauseIndex: 0,
    pauseMenuState: 'main',

    credits: config.STARTING_CREDITS,
    bet: config.MIN_BET,
    reels: [[0,0,0], [0,0,0], [0,0,0], [0,0,0], [0,0,0]],
    spinning: false,
    scanIndex: 0,
    gameActions: ['Spin', 'Bet -', 'Bet +', 'MAX', 'Auto', 'Pause'],
    lastWin: 0,
    reelTimers: [null, null, null, null, null],
    spinSoundTimer: null,
    
    // Diamond Bonus Mode
    bonusMode: false,
    bonusSpinsLeft: 0,
    bonusMultiplier: 1,
    bonusTotalWin: 0,
    bonusBet: 0, // The bet amount locked in for bonus rounds
    bonusAutoTimer: null, // Timer for auto-spinning bonus rounds
    
    // Diamond Suspense
    diamondSuspense: false,
    diamondsFound: 0,
    
    // Autoplay
    autoplayActive: false,
    autoplayRemaining: 0,
    autoplayMode: null, // '10', '20', '50', '100', 'bonus'
    autoplayTimer: null,
    autoplayMenuIndex: 0,
    
    // Persistence
    lastRefillTime: 0,
    lastBuyTime: 0,

    input: {
        spaceHeld: false,
        enterHeld: false,
        spaceTime: 0,
        enterTime: 0
    },
    timers: {
        space: null,
        enter: null,
        spaceRepeat: null,
        enterRepeat: null,
        autoScan: null
    }
};

const settings = {
    themeIndex: 0,
    tts: true,
    sound: true,
    highlightColorIndex: 0,
    highlightStyle: 'outline'
};

// Particle systems
let particles = [];
let particleCanvas, particleCtx;
let effectCanvas, effectCtx;
let animationFrameId = null;

// --- Initialization ---
function init() {
    loadSettings();
    loadCredits();
    setupParticleSystem();
    createBackgroundParticles();
    createDOMStructure();
    applyTheme();
    setupInput();
    initHotStreak();

    if (window.NarbeScanManager) {
        window.NarbeScanManager.subscribe(function() {
            if (window.NarbeScanManager.getSettings().autoScan) {
                startAutoScan();
            } else {
                stopAutoScan();
            }
            if (state.mode === 'menu' && state.menuState === 'settings') refreshMenu();
            if (state.mode === 'pause' && state.pauseMenuState === 'settings') refreshPauseMenu();
        });
    }

    showMainMenu();
}

function loadSettings() {
    try {
        const saved = localStorage.getItem('megaslots_settings_v2');
        if (saved) Object.assign(settings, JSON.parse(saved));
    } catch (e) {
        console.error("Failed to load settings", e);
    }
}

function loadCredits() {
    try {
        const savedCredits = localStorage.getItem('megaslots_credits_v2');
        const savedRefillTime = localStorage.getItem('megaslots_lastRefill_v2');
        const savedBuyTime = localStorage.getItem('megaslots_lastBuy_v2');
        
        if (savedCredits !== null) state.credits = parseInt(savedCredits, 10);
        if (savedRefillTime !== null) state.lastRefillTime = parseInt(savedRefillTime, 10);
        if (savedBuyTime !== null) state.lastBuyTime = parseInt(savedBuyTime, 10);
        
        if (state.credits <= 0) state.credits = 0;
    } catch (e) {
        console.error("Failed to load credits", e);
        state.credits = config.STARTING_CREDITS;
    }
}

function saveSettings() {
    localStorage.setItem('megaslots_settings_v2', JSON.stringify(settings));
}

function saveCredits() {
    localStorage.setItem('megaslots_credits_v2', state.credits.toString());
    localStorage.setItem('megaslots_lastRefill_v2', state.lastRefillTime.toString());
    localStorage.setItem('megaslots_lastBuy_v2', state.lastBuyTime.toString());
}

function setupParticleSystem() {
    particleCanvas = document.getElementById('particle-canvas');
    effectCanvas = document.getElementById('effect-canvas');
    if (particleCanvas) {
        particleCtx = particleCanvas.getContext('2d');
        resizeCanvas();
    }
    if (effectCanvas) {
        effectCtx = effectCanvas.getContext('2d');
    }
    window.addEventListener('resize', resizeCanvas);
}

function resizeCanvas() {
    if (particleCanvas) {
        particleCanvas.width = window.innerWidth;
        particleCanvas.height = window.innerHeight;
    }
    if (effectCanvas) {
        effectCanvas.width = window.innerWidth;
        effectCanvas.height = window.innerHeight;
    }
}

function createBackgroundParticles() {
    const container = document.getElementById('bg-particles');
    if (!container) return;
    
    for (let i = 0; i < 30; i++) {
        const particle = document.createElement('div');
        particle.className = 'bg-particle';
        particle.style.left = Math.random() * 100 + '%';
        particle.style.animationDelay = Math.random() * 15 + 's';
        particle.style.animationDuration = (10 + Math.random() * 10) + 's';
        const colors = ['#ffd700', '#ff00ff', '#00ffff', '#ff3366'];
        particle.style.background = colors[Math.floor(Math.random() * colors.length)];
        particle.style.width = (2 + Math.random() * 4) + 'px';
        particle.style.height = particle.style.width;
        container.appendChild(particle);
    }
}

function createDOMStructure() {
    const mainContent = document.getElementById('main-content');

    // Menu Container
    const menuContainer = document.createElement('div');
    menuContainer.id = 'menu-container';
    menuContainer.className = 'menu-container';
    mainContent.appendChild(menuContainer);

    // Game Container
    const gameContainer = document.createElement('div');
    gameContainer.id = 'game-container-inner';
    gameContainer.className = 'game-container';
    gameContainer.style.display = 'none';
    
    let reelsHTML = '';
    for (let i = 0; i < config.NUM_REELS; i++) {
        reelsHTML += `
            <div class="reel-container" id="reel-container-${i}">
                <div class="reel" id="reel-${i}">
                    <div class="symbol-row" id="symbol-${i}-0">${symbols[0].emoji}</div>
                    <div class="symbol-row" id="symbol-${i}-1">${symbols[0].emoji}</div>
                    <div class="symbol-row" id="symbol-${i}-2">${symbols[0].emoji}</div>
                </div>
            </div>`;
    }
    
    gameContainer.innerHTML = `
        <div class="slot-machine" id="slot-machine">
            <div class="machine-top">
                <div class="logo-container">
                    <div class="game-logo">💎 MEGA SLOTS 💎</div>
                </div>
                <div class="credits-bet-container">
                    <div class="credits-display" id="credits-display">
                        <span class="credit-icon">🪙</span>
                        <span id="credit-amount">${state.credits}</span>
                    </div>
                    <div class="multiplier-display" id="multiplier-display"></div>
                </div>
            </div>
            <div class="slot-display-wrapper">
                <div class="slot-display" id="slot-display">
                    ${reelsHTML}
                </div>
            </div>
            <div class="bottom-panel">
                <div class="bet-display" id="bet-display">BET: ${state.bet}</div>
                <div class="win-display" id="win-display"></div>
                <div class="bonus-indicator" id="bonus-indicator"></div>
            </div>
        </div>
        <div class="game-actions" id="game-actions">
            <button class="action-button spin-button" id="spin-button">🎰 SPIN</button>
            <button class="action-button bet-button" id="bet-decrease">➖</button>
            <button class="action-button bet-button" id="bet-increase">➕</button>
            <button class="action-button bet-button" id="bet-max">MAX</button>
            <button class="action-button autoplay-button" id="autoplay-button">🔄 AUTO</button>
            <button class="action-button pause-scan-button" id="pause-scan-button">⏸️</button>
        </div>
        <div class="info-panel" id="info-panel">
            <div class="info-item">20 PAYLINES</div>
            <div class="info-item">🃏 WILD</div>
            <div class="info-item">💎 3+ = BONUS</div>
        </div>`;
    mainContent.appendChild(gameContainer);

    // Click handlers - don't move scan, just perform action (disabled during bonus)
    document.getElementById('spin-button').onclick = () => {
        if (state.mode === 'game' && !state.spinning && !state.bonusMode) {
            doSpin();
        }
    };
    document.getElementById('bet-decrease').onclick = () => {
        if (state.mode === 'game' && !state.spinning && !state.bonusMode) {
            decreaseBet();
        }
    };
    document.getElementById('bet-increase').onclick = () => {
        if (state.mode === 'game' && !state.spinning && !state.bonusMode) {
            increaseBet();
        }
    };
    document.getElementById('bet-max').onclick = () => {
        if (state.mode === 'game' && !state.spinning && !state.bonusMode) {
            setMaxBet();
        }
    };
    document.getElementById('autoplay-button').onclick = () => {
        if (state.mode === 'game' && !state.spinning && !state.bonusMode) {
            handleAutoplayButton();
        }
    };
    document.getElementById('pause-scan-button').onclick = () => {
        if (state.mode === 'game' && !state.bonusMode) {
            if (state.autoplayActive) {
                stopAutoplay();
            }
            showPauseMenu();
        }
    };

    // Pause Overlay
    const pauseOverlay = document.createElement('div');
    pauseOverlay.id = 'pause-overlay';
    pauseOverlay.className = 'pause-overlay';
    pauseOverlay.style.display = 'none';
    document.body.appendChild(pauseOverlay);
}

function applyTheme() {
    const bg = document.querySelector('.animated-bg');
    if (bg) bg.style.background = themes[settings.themeIndex].bg;
    updateHighlights();
}

// --- Menu System ---
const menus = {
    main: [
        { text: "🎰 PLAY", action: () => startGame() },
        { text: "⚙️ Settings", action: () => showSettingsMenu() },
        { text: "🚪 Exit", action: () => exitGame() }
    ],
    settings: [
        { text: () => `🎨 Theme: ${themes[settings.themeIndex].name}`, action: () => cycleTheme(1), onPrev: () => cycleTheme(-1) },
        { text: () => `🔊 Sound: ${settings.sound ? 'ON' : 'OFF'}`, action: () => toggleSound(), onPrev: () => toggleSound() },
        { text: () => `🗣️ TTS: ${settings.tts ? 'ON' : 'OFF'}`, action: () => toggleTTS(), onPrev: () => toggleTTS() },
        { text: () => `📡 Auto Scan: ${window.NarbeScanManager?.getSettings().autoScan ? 'ON' : 'OFF'}`, action: () => toggleAutoScan(), onPrev: () => toggleAutoScan() },
        { text: () => `⏱️ Scan Speed: ${window.NarbeScanManager ? (window.NarbeScanManager.getScanInterval() / 1000) + 's' : '2s'}`, action: () => cycleScanSpeed(), onPrev: () => cycleScanSpeed() },
        { text: () => `✨ Highlight: ${settings.highlightStyle === 'outline' ? 'Outline' : 'Full'}`, action: () => toggleHighlightStyle(), onPrev: () => toggleHighlightStyle() },
        { text: () => `🎯 Color: ${highlightColors[settings.highlightColorIndex].name}`, action: () => cycleHighlightColor(1), onPrev: () => cycleHighlightColor(-1) },
        { text: "⬅️ Back", action: () => showMainMenu() }
    ],
    pause: [
        { text: "▶️ Continue", action: () => resumeGame() },
        { text: () => canBuyCredits() ? "💵 Buy 500 Credits" : `⏳ ${getTimeUntilBuy()}`, action: () => buyCredits() },
        { text: "⚙️ Settings", action: () => showPauseSettings() },
        { text: "🏠 Main Menu", action: () => showMainMenu() },
        { text: "🚪 Exit", action: () => exitGame() }
    ],
    pauseSettings: [
        { text: () => `🎨 Theme: ${themes[settings.themeIndex].name}`, action: () => cycleTheme(1, true), onPrev: () => cycleTheme(-1, true) },
        { text: () => `🔊 Sound: ${settings.sound ? 'ON' : 'OFF'}`, action: () => toggleSound(true), onPrev: () => toggleSound(true) },
        { text: () => `🗣️ TTS: ${settings.tts ? 'ON' : 'OFF'}`, action: () => toggleTTS(true), onPrev: () => toggleTTS(true) },
        { text: () => `📡 Auto Scan: ${window.NarbeScanManager?.getSettings().autoScan ? 'ON' : 'OFF'}`, action: () => toggleAutoScan(true), onPrev: () => toggleAutoScan(true) },
        { text: () => `⏱️ Scan Speed: ${window.NarbeScanManager ? (window.NarbeScanManager.getScanInterval() / 1000) + 's' : '2s'}`, action: () => cycleScanSpeed(true), onPrev: () => cycleScanSpeed(true) },
        { text: () => `✨ Highlight: ${settings.highlightStyle === 'outline' ? 'Outline' : 'Full'}`, action: () => toggleHighlightStyle(true), onPrev: () => toggleHighlightStyle(true) },
        { text: () => `🎯 Color: ${highlightColors[settings.highlightColorIndex].name}`, action: () => cycleHighlightColor(1, true), onPrev: () => cycleHighlightColor(-1, true) },
        { text: "⬅️ Back", action: () => showPauseMenu() }
    ],
    gameover: [
        { text: () => canGetFreeCredits() ? "🎁 Get Free Credits" : `⏳ ${getTimeUntilRefill()}`, action: () => tryGetFreeCredits() },
        { text: "🏠 Main Menu", action: () => showMainMenu() }
    ]
};

function exitGame() {
    speak("Exiting to Hub");
    stopBackgroundMusic();
    setTimeout(() => {
        if (window.parent && window.parent !== window) {
            window.parent.postMessage({ action: 'focusBackButton' }, '*');
        } else {
            window.location.href = '../../../index.html';
        }
    }, 500);
}

function renderMenu(containerId, items, titleText, subtitleText) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = '';

    if (titleText) {
        const title = document.createElement('div');
        title.className = state.mode === 'menu' ? 'menu-title' : 'pause-title';
        title.innerHTML = titleText;
        container.appendChild(title);
    }
    
    if (subtitleText) {
        const subtitle = document.createElement('div');
        subtitle.className = 'menu-subtitle';
        subtitle.innerHTML = subtitleText;
        container.appendChild(subtitle);
    }

    let buttonContainer = container;
    const isSettings = (state.mode === 'pause' && state.pauseMenuState === 'settings') || 
                       (state.mode === 'menu' && state.menuState === 'settings');

    if (isSettings) {
        buttonContainer = document.createElement('div');
        buttonContainer.className = 'menu-grid';
        container.appendChild(buttonContainer);
    }

    items.forEach((item, index) => {
        const btn = document.createElement('button');
        btn.className = 'menu-button';
        btn.id = `btn-${containerId}-${index}`;
        btn.innerHTML = typeof item.text === 'function' ? item.text() : item.text;

        btn.onclick = () => {
            playSound('select');
            // Don't move scan index on click - just perform action
            if (item.action) item.action();
        };

        if (isSettings && index === items.length - 1) {
            btn.classList.add('span-two-cols');
        }

        buttonContainer.appendChild(btn);
    });

    updateHighlights();
}

function showMainMenu() {
    state.mode = 'menu';
    state.menuState = 'main';
    state.menuIndex = 0;
    state.spinning = false;
    state.bonusMode = false;

    clearReelTimers();
    stopBackgroundMusic();
    stopAutoplay();

    document.getElementById('menu-container').style.display = 'flex';
    document.getElementById('game-container-inner').style.display = 'none';
    document.getElementById('pause-overlay').style.display = 'none';
    document.getElementById('slot-machine')?.classList.remove('bonus-mode');

    renderMenu('menu-container', menus.main, "MEGA SLOTS", `💰 Credits: ${state.credits}`);
    speak("Mega Slots. Play");
    startAutoScan();
}

function showSettingsMenu() {
    state.menuState = 'settings';
    state.menuIndex = 0;
    renderMenu('menu-container', menus.settings, "⚙️ SETTINGS");
    announceCurrentMenuItem();
    startAutoScan();
}

function showPauseMenu() {
    state.mode = 'pause';
    state.pauseMenuState = 'main';
    state.pauseIndex = 0;

    document.getElementById('pause-overlay').style.display = 'flex';
    document.getElementById('pause-overlay').innerHTML = '';

    renderMenu('pause-overlay', menus.pause, "⏸️ PAUSED");
    speak("Paused. Continue");
    startAutoScan();
}

function showPauseSettings() {
    state.pauseMenuState = 'settings';
    state.pauseIndex = 0;
    renderMenu('pause-overlay', menus.pauseSettings, "⚙️ SETTINGS");
    announceCurrentPauseItem();
    startAutoScan();
}

function showGameOver() {
    state.mode = 'gameover';
    state.gameoverIndex = 0;

    saveCredits();
    stopBackgroundMusic();

    document.getElementById('pause-overlay').style.display = 'flex';
    document.getElementById('pause-overlay').innerHTML = '';

    const canRefill = canGetFreeCredits();
    renderMenu('pause-overlay', menus.gameover, "💸 OUT OF CREDITS!", 
        canRefill ? "Free credits available!" : `Next free credits: ${getTimeUntilRefill()}`);
    
    playSound('lose');
    speak("Out of credits! " + (canRefill ? "Get free credits" : `Come back in ${getTimeUntilRefill()}`));
    startAutoScan();
}

// Credit management
function canGetFreeCredits() {
    return (Date.now() - state.lastRefillTime) >= config.REFILL_COOLDOWN;
}

function canBuyCredits() {
    return (Date.now() - state.lastBuyTime) >= config.BUY_COOLDOWN;
}

function getTimeUntilRefill() {
    const timeLeft = config.REFILL_COOLDOWN - (Date.now() - state.lastRefillTime);
    if (timeLeft <= 0) return "Ready!";
    const hours = Math.floor(timeLeft / (60 * 60 * 1000));
    const minutes = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function getTimeUntilBuy() {
    const timeLeft = config.BUY_COOLDOWN - (Date.now() - state.lastBuyTime);
    if (timeLeft <= 0) return "Ready!";
    const hours = Math.floor(timeLeft / (60 * 60 * 1000));
    const minutes = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function tryGetFreeCredits() {
    if (canGetFreeCredits()) {
        state.credits = config.REFILL_AMOUNT;
        state.lastRefillTime = Date.now();
        state.bet = config.MIN_BET;
        saveCredits();
        playSound('coinAdd');
        createCelebrationParticles('refill');
        speak(`${config.REFILL_AMOUNT} free credits! Good luck!`);
        
        document.getElementById('pause-overlay').style.display = 'none';
        state.mode = 'game';
        state.scanIndex = 0;
        updateGameUI();
        updateHighlights();
        startAutoScan();
        startBackgroundMusic();
    } else {
        speak("Credits not ready. " + getTimeUntilRefill() + " remaining");
    }
}

function buyCredits() {
    if (canBuyCredits()) {
        state.credits += 500;
        state.lastBuyTime = Date.now();
        saveCredits();
        playSound('coinAdd');
        speak("500 credits added!");
        updateGameUI();
        refreshPauseMenu();
    } else {
        speak("Can only buy once per day. " + getTimeUntilBuy() + " remaining");
    }
}

// Settings functions
function cycleTheme(dir, isPause) {
    settings.themeIndex = (settings.themeIndex + dir + themes.length) % themes.length;
    applyTheme();
    saveSettings();
    playSound('click');
    isPause ? refreshPauseMenu() : refreshMenu();
}

function toggleSound(isPause) {
    settings.sound = !settings.sound;
    saveSettings();
    if (settings.sound) {
        initAudio();
        playSound('click');
        if (state.mode === 'game') startBackgroundMusic();
    } else {
        stopBackgroundMusic();
    }
    isPause ? refreshPauseMenu() : refreshMenu();
}

function toggleTTS(isPause) {
    settings.tts = !settings.tts;
    saveSettings();
    playSound('click');
    isPause ? refreshPauseMenu() : refreshMenu();
}

function toggleHighlightStyle(isPause) {
    settings.highlightStyle = settings.highlightStyle === 'outline' ? 'full' : 'outline';
    saveSettings();
    updateHighlights();
    playSound('click');
    isPause ? refreshPauseMenu() : refreshMenu();
}

function cycleHighlightColor(dir, isPause) {
    settings.highlightColorIndex = (settings.highlightColorIndex + dir + highlightColors.length) % highlightColors.length;
    saveSettings();
    updateHighlights();
    playSound('click');
    isPause ? refreshPauseMenu() : refreshMenu();
}

function toggleAutoScan(isPause) {
    if (window.NarbeScanManager) {
        window.NarbeScanManager.setAutoScan(!window.NarbeScanManager.getSettings().autoScan);
        playSound('click');
        isPause ? refreshPauseMenu() : refreshMenu();
        startAutoScan();
    }
}

function cycleScanSpeed(isPause) {
    if (window.NarbeScanManager) {
        window.NarbeScanManager.cycleScanSpeed();
        playSound('click');
        isPause ? refreshPauseMenu() : refreshMenu();
        startAutoScan();
    }
}

function refreshMenu() {
    const items = menus[state.menuState];
    items.forEach((item, index) => {
        const btn = document.getElementById(`btn-menu-container-${index}`);
        if (btn) btn.innerHTML = typeof item.text === 'function' ? item.text() : item.text;
    });
    announceCurrentMenuItem();
}

function refreshPauseMenu() {
    const items = state.pauseMenuState === 'settings' ? menus.pauseSettings : menus.pause;
    items.forEach((item, index) => {
        const btn = document.getElementById(`btn-pause-overlay-${index}`);
        if (btn) btn.innerHTML = typeof item.text === 'function' ? item.text() : item.text;
    });
    announceCurrentPauseItem();
}

function announceCurrentMenuItem() {
    const items = menus[state.menuState];
    const item = items[state.menuIndex];
    if (item) {
        const text = (typeof item.text === 'function' ? item.text() : item.text).replace(/<[^>]*>/g, "").replace(/[🎰⚙️🚪🎨🔊🗣️📡⏱️✨🎯⬅️💎💵▶️🏠⏳🎁💸💰]/g, "").trim();
        speak(text);
    }
}

function announceCurrentPauseItem() {
    const items = state.pauseMenuState === 'settings' ? menus.pauseSettings : menus.pause;
    const item = items[state.pauseIndex];
    if (item) {
        const text = (typeof item.text === 'function' ? item.text() : item.text).replace(/<[^>]*>/g, "").replace(/[🎰⚙️🚪🎨🔊🗣️📡⏱️✨🎯⬅️💎💵▶️🏠⏳🎁💸💰⏸️]/g, "").trim();
        speak(text);
    }
}

// --- Auto Scan ---
function startAutoScan() {
    stopAutoScan();
    
    // Only start auto-scan if NarbeScanManager says autoScan is enabled
    // When autoScan is OFF, spacebar short-press steps forward, long-press scans backward
    if (!window.NarbeScanManager || !window.NarbeScanManager.getSettings().autoScan) {
        return; // Do NOT auto-scan when autoScan is disabled
    }
    
    const speed = window.NarbeScanManager.getScanInterval();
    if (speed > 0) {
        state.timers.autoScan = setInterval(() => {
            // Skip this scan tick if spinning or if user is holding spacebar/enter
            if (state.spinning || state.input.spaceHeld || state.input.enterHeld) return;
            scanForward();
        }, speed);
    }
}

function stopAutoScan() {
    if (state.timers.autoScan) {
        clearInterval(state.timers.autoScan);
        state.timers.autoScan = null;
    }
}

function resetAutoScan() {
    stopAutoScan();
    startAutoScan();
}

// --- Game Logic ---
function startGame() {
    initAudio();
    
    // Reset input state to prevent stuck scanning from previous state
    state.input.spaceHeld = false;
    state.input.enterHeld = false;
    clearTimeout(state.timers.space);
    clearTimeout(state.timers.enter);
    clearInterval(state.timers.spaceRepeat);
    clearInterval(state.timers.enterRepeat);
    
    state.mode = 'game';
    if (state.credits <= 0) {
        if (canGetFreeCredits()) {
            state.credits = config.REFILL_AMOUNT;
            state.lastRefillTime = Date.now();
            saveCredits();
        } else {
            showGameOver();
            return;
        }
    }
    
    state.bet = Math.min(state.bet, state.credits);
    if (state.bet < config.MIN_BET) state.bet = config.MIN_BET;
    state.scanIndex = 0;
    state.spinning = false;
    state.bonusMode = false;
    state.bonusSpinsLeft = 0;
    state.bonusMultiplier = 1;

    for (let i = 0; i < config.NUM_REELS; i++) {
        state.reels[i] = [0, 0, 0];
    }

    document.getElementById('menu-container').style.display = 'none';
    document.getElementById('game-container-inner').style.display = 'flex';
    document.getElementById('pause-overlay').style.display = 'none';
    document.getElementById('slot-machine').classList.remove('bonus-mode');

    updateGameUI();
    updateHighlights();
    startAutoScan();
    startBackgroundMusic();

    speak(`Let's play! ${state.credits} credits. Spin`);
}

function resumeGame() {
    state.mode = 'game';
    document.getElementById('pause-overlay').style.display = 'none';
    updateHighlights();
    speak("Resumed");
    startAutoScan();
}

function clearReelTimers() {
    for (let i = 0; i < config.NUM_REELS; i++) {
        if (state.reelTimers[i]) {
            clearInterval(state.reelTimers[i]);
            state.reelTimers[i] = null;
        }
    }
    if (state.spinSoundTimer) {
        clearInterval(state.spinSoundTimer);
        state.spinSoundTimer = null;
    }
}

// --- Random Symbol ---
function getRandomSymbolIndex(forceBonus = false) {
    // Force diamond if requested
    if (forceBonus) {
        return symbols.findIndex(s => s.isBonus);
    }
    
    // Check hot streak status (this updates the state)
    const hotActive = isHotStreakActive();
    
    // Get progressive bonus boost multiplier (increases every 10 spins after 100)
    const bonusBoostMultiplier = getBonusBoostMultiplier();
    
    // Calculate adjusted weights
    let adjustedWeights = symbols.map((s, i) => {
        let w = s.weight;
        
        // HOT STREAK BOOST - significantly increases ALL good outcomes
        if (hotActive) {
            if (s.isBonus) {
                w *= 4.0; // 4x diamond chance during hot streak!
            } else if (s.isWild) {
                w *= 3.0; // 3x wild chance
            } else if (s.payout >= 40) {
                w *= 3.0; // Sevens - big boost
            } else if (s.payout >= 15) {
                w *= 2.5; // Stars
            } else if (s.payout >= 8) {
                w *= 2.0; // Bells
            } else if (s.payout >= 4) {
                w *= 1.5; // Grapes
            }
            // Lower symbols stay the same - shifts odds toward wins
        }
        
        // Progressive bonus boost: increases diamond weight after 100 spins
        if (s.isBonus && bonusBoostMultiplier > 1.0) {
            w *= bonusBoostMultiplier;
        }
        return w;
    });
    
    const adjustedTotal = adjustedWeights.reduce((sum, w) => sum + w, 0);
    const rand = Math.random() * adjustedTotal;
    let cumulative = 0;
    
    for (let i = 0; i < symbols.length; i++) {
        cumulative += adjustedWeights[i];
        if (rand < cumulative) return i;
    }
    return symbols.length - 1;
}

// --- Bet Controls ---
const betLevels = [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];

function decreaseBet() {
    if (state.spinning) return;
    
    // Find current index and go down
    let currentIndex = betLevels.indexOf(state.bet);
    if (currentIndex === -1) {
        // Find closest lower bet level
        currentIndex = betLevels.findIndex(b => b >= state.bet);
        if (currentIndex === -1) currentIndex = betLevels.length;
    }
    
    let newIndex = Math.max(0, currentIndex - 1);
    state.bet = betLevels[newIndex];
    
    updateGameUI();
    playSound('click');
    speak("Bet " + state.bet);
}

function increaseBet() {
    if (state.spinning) return;
    
    // Find current index and go up
    let currentIndex = betLevels.indexOf(state.bet);
    if (currentIndex === -1) {
        // Find closest lower bet level
        currentIndex = betLevels.findIndex(b => b > state.bet) - 1;
        if (currentIndex < 0) currentIndex = 0;
    }
    
    let newIndex = Math.min(betLevels.length - 1, currentIndex + 1);
    let newBet = betLevels[newIndex];
    
    // Don't exceed credits
    while (newBet > state.credits && newIndex > 0) {
        newIndex--;
        newBet = betLevels[newIndex];
    }
    
    state.bet = newBet;
    updateGameUI();
    playSound('click');
    speak("Bet " + state.bet);
}

function setMaxBet() {
    if (state.spinning) return;
    
    // Find highest bet level that doesn't exceed credits
    let maxBet = betLevels[0];
    for (let i = betLevels.length - 1; i >= 0; i--) {
        if (betLevels[i] <= state.credits) {
            maxBet = betLevels[i];
            break;
        }
    }
    
    state.bet = maxBet;
    updateGameUI();
    playSound('click');
    speak("Max bet " + state.bet);
}

// --- Autoplay System ---
const autoplayOptions = [
    { label: '10 Spins', value: 10, mode: '10' },
    { label: '20 Spins', value: 20, mode: '20' },
    { label: '50 Spins', value: 50, mode: '50' },
    { label: '100 Spins', value: 100, mode: '100' },
    { label: '∞ Until Bonus', value: Infinity, mode: 'bonus' }
];

function handleAutoplayButton() {
    if (state.autoplayActive) {
        stopAutoplay();
        speak("Autoplay stopped");
    } else {
        showAutoplayMenu();
    }
}

function showAutoplayMenu() {
    state.mode = 'autoplay-menu';
    state.autoplayMenuIndex = 0;
    
    const pauseOverlay = document.getElementById('pause-overlay');
    pauseOverlay.style.display = 'flex';
    pauseOverlay.innerHTML = '';
    
    const title = document.createElement('div');
    title.className = 'pause-title';
    title.innerHTML = '🔄 AUTOPLAY';
    pauseOverlay.appendChild(title);
    
    const subtitle = document.createElement('div');
    subtitle.className = 'menu-subtitle';
    subtitle.innerHTML = `Current Bet: ${state.bet}`;
    pauseOverlay.appendChild(subtitle);
    
    autoplayOptions.forEach((opt, index) => {
        const btn = document.createElement('button');
        btn.className = 'menu-button';
        btn.id = `btn-autoplay-${index}`;
        btn.innerHTML = opt.label;
        btn.onclick = () => {
            playSound('select');
            // Don't move scan index on click - just perform action
            startAutoplay(opt.mode, opt.value);
        };
        pauseOverlay.appendChild(btn);
    });
    
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'menu-button';
    cancelBtn.id = 'btn-autoplay-cancel';
    cancelBtn.innerHTML = '❌ Cancel';
    cancelBtn.onclick = () => {
        playSound('click');
        closeAutoplayMenu();
    };
    pauseOverlay.appendChild(cancelBtn);
    
    updateHighlights();
    speak("Autoplay. 10 spins");
    startAutoScan();
}

function closeAutoplayMenu() {
    state.mode = 'game';
    document.getElementById('pause-overlay').style.display = 'none';
    state.scanIndex = 4;
    updateHighlights();
    startAutoScan();
}

function startAutoplay(mode, count) {
    state.autoplayActive = true;
    state.autoplayMode = mode;
    state.autoplayRemaining = count;
    
    document.getElementById('pause-overlay').style.display = 'none';
    state.mode = 'game';
    
    updateAutoplayButton();
    
    const modeText = mode === 'bonus' ? 'until bonus' : `${count} spins`;
    speak(`Autoplay started. ${modeText}`);
    
    // Start the first spin
    setTimeout(() => {
        if (state.autoplayActive && !state.spinning) {
            doAutoplaySpin();
        }
    }, 500);
}

function stopAutoplay() {
    state.autoplayActive = false;
    state.autoplayMode = null;
    state.autoplayRemaining = 0;
    
    if (state.autoplayTimer) {
        clearTimeout(state.autoplayTimer);
        state.autoplayTimer = null;
    }
    
    updateAutoplayButton();
}

function updateAutoplayButton() {
    const btn = document.getElementById('autoplay-button');
    if (state.autoplayActive) {
        if (state.autoplayMode === 'bonus') {
            btn.innerHTML = '⏹️ STOP (∞)';
        } else {
            btn.innerHTML = `⏹️ STOP (${state.autoplayRemaining})`;
        }
        btn.classList.add('active');
    } else {
        btn.innerHTML = '🔄 AUTO';
        btn.classList.remove('active');
    }
}

function doAutoplaySpin() {
    if (!state.autoplayActive) return;
    if (state.spinning) return;
    if (state.bonusMode) return; // Let bonus mode play out
    if (state.mode !== 'game') return;
    
    // Check if we should stop
    if (state.autoplayMode !== 'bonus' && state.autoplayRemaining <= 0) {
        stopAutoplay();
        speak("Autoplay complete");
        return;
    }
    
    // Check if we have enough credits
    if (state.credits < state.bet) {
        stopAutoplay();
        speak("Not enough credits. Autoplay stopped");
        return;
    }
    
    // Decrement counter for non-bonus modes
    if (state.autoplayMode !== 'bonus') {
        state.autoplayRemaining--;
    }
    
    updateAutoplayButton();
    doSpin();
}

function scheduleNextAutoplaySpin() {
    if (!state.autoplayActive) return;
    if (state.bonusMode) return; // Bonus mode handles itself
    
    // Schedule next spin after a delay
    state.autoplayTimer = setTimeout(() => {
        if (state.autoplayActive && !state.spinning && state.mode === 'game') {
            doAutoplaySpin();
        }
    }, 1500);
}

// --- Spinning ---
function doSpin() {
    if (state.spinning) return;
    
    const isBonusSpin = state.bonusMode && state.bonusSpinsLeft > 0;
    
    if (!isBonusSpin && state.credits < state.bet) {
        speak("Not enough credits");
        return;
    }

    state.spinning = true;
    
    if (!isBonusSpin) {
        state.credits -= state.bet;
    } else {
        state.bonusSpinsLeft--;
        updateBonusIndicator();
    }
    
    state.lastWin = 0;

    // Clear displays
    const winDisplay = document.getElementById('win-display');
    winDisplay.innerText = '';
    winDisplay.className = 'win-display';

    // Clear reel classes
    for (let r = 0; r < config.NUM_REELS; r++) {
        const rc = document.getElementById(`reel-container-${r}`);
        rc.classList.remove('winning', 'stopped');
        for (let row = 0; row < 3; row++) {
            document.getElementById(`symbol-${r}-${row}`).classList.remove('winning-symbol', 'diamond-glow', 'wild-glow');
        }
    }

    updateGameUI();
    
    // Play spin sound
    playSound(isBonusSpin ? 'bonusSpin' : 'spin');
    document.getElementById('spin-button').classList.add('spinning');

    // Start spinning visuals
    for (let i = 0; i < config.NUM_REELS; i++) {
        startReelSpin(i);
    }
    
    // Spinning tick sound
    state.spinSoundTimer = setInterval(() => playSound('reelSpin'), 100);

    // Check if we need to force a bonus (200 spins without bonus = guaranteed)
    const forceBonus = !state.bonusMode && bonusBoostState.consecutiveSpinsWithoutBonus >= 199;
    
    // Generate results
    const finalResults = [];
    const diamondIndex = symbols.findIndex(s => s.isBonus);
    
    if (forceBonus) {
        // Determine how many diamonds to force (progressive chance for 4-5)
        const forcedDiamondCount = getProgressiveDiamondCount();
        
        // Generate all random positions first
        for (let j = 0; j < config.NUM_REELS; j++) {
            finalResults.push([getRandomSymbolIndex(), getRandomSymbolIndex(), getRandomSymbolIndex()]);
        }
        
        // Now place diamonds at random positions across all reels
        // Create array of all possible positions
        const allPositions = [];
        for (let reel = 0; reel < config.NUM_REELS; reel++) {
            for (let row = 0; row < 3; row++) {
                allPositions.push({ reel, row });
            }
        }
        
        // Shuffle positions randomly
        for (let i = allPositions.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [allPositions[i], allPositions[j]] = [allPositions[j], allPositions[i]];
        }
        
        // Place diamonds at first N random positions
        for (let i = 0; i < forcedDiamondCount && i < allPositions.length; i++) {
            const pos = allPositions[i];
            finalResults[pos.reel][pos.row] = diamondIndex;
        }
    } else {
        // Normal random generation with progressive boost applied in getRandomSymbolIndex
        for (let j = 0; j < config.NUM_REELS; j++) {
            finalResults.push([getRandomSymbolIndex(), getRandomSymbolIndex(), getRandomSymbolIndex()]);
        }
    }
    
    // Pre-count diamonds to determine if we need suspense animation
    let totalDiamonds = 0;
    for (let r = 0; r < config.NUM_REELS; r++) {
        for (let row = 0; row < 3; row++) {
            if (symbols[finalResults[r][row]].name === 'Diamond') {
                totalDiamonds++;
            }
        }
    }
    
    // Track diamonds as reels stop for suspense
    state.diamondsFound = 0;
    state.diamondSuspense = false;

    // Stop reels sequentially with suspense for potential bonus
    const baseDelay = 600;
    let reelDelay = 350;
    let currentDelay = baseDelay;
    
    for (let k = 0; k < config.NUM_REELS; k++) {
        ((reelIndex, results, delay) => {
            setTimeout(() => {
                stopReel(reelIndex, results);
                playSound('reelStop');
                
                // Count diamonds in this reel
                let reelDiamonds = 0;
                for (let row = 0; row < 3; row++) {
                    if (symbols[results[row]].name === 'Diamond') {
                        reelDiamonds++;
                        state.diamondsFound++;
                    }
                }
                
                // If we have 2 diamonds and more reels to go, trigger suspense!
                if (state.diamondsFound === 2 && reelIndex < config.NUM_REELS - 1 && !state.bonusMode) {
                    state.diamondSuspense = true;
                    playSound('suspense');
                    showDiamondSuspense();
                }
                
                // If in suspense and we just got the 3rd diamond, celebrate!
                if (state.diamondSuspense && state.diamondsFound >= 3) {
                    state.diamondSuspense = false;
                    hideDiamondSuspense();
                }
            }, delay);
        })(k, finalResults[k], currentDelay);
        
        // Add extra delay if we're in suspense territory (after 2 diamonds found)
        // This is calculated before stopping, based on what diamonds will be found
        let diamondsUpToHere = 0;
        for (let r = 0; r <= k; r++) {
            for (let row = 0; row < 3; row++) {
                if (symbols[finalResults[r][row]].name === 'Diamond') {
                    diamondsUpToHere++;
                }
            }
        }
        
        if (diamondsUpToHere === 2 && k < config.NUM_REELS - 1 && !state.bonusMode) {
            // Add dramatic pause before next reel
            currentDelay += reelDelay + 1500; // Extra 1.5 second suspense
        } else {
            currentDelay += reelDelay;
        }
    }

    // Evaluate after all reels stop (with adjusted timing)
    setTimeout(() => {
        clearInterval(state.spinSoundTimer);
        document.getElementById('spin-button').classList.remove('spinning');
        state.diamondSuspense = false;
        hideDiamondSuspense();
        evaluateResults(finalResults);
    }, currentDelay + 300);
}

function showDiamondSuspense() {
    const suspenseEl = document.getElementById('diamond-suspense');
    if (suspenseEl) {
        suspenseEl.classList.remove('hidden');
    }
    // Add suspense class to slot machine
    document.getElementById('slot-machine').classList.add('diamond-suspense');
}

function hideDiamondSuspense() {
    const suspenseEl = document.getElementById('diamond-suspense');
    if (suspenseEl) {
        suspenseEl.classList.add('hidden');
    }
    document.getElementById('slot-machine').classList.remove('diamond-suspense');
}

function startReelSpin(reelIndex) {
    const container = document.getElementById(`reel-container-${reelIndex}`);
    container.classList.add('spinning');
    container.classList.remove('stopped');

    state.reelTimers[reelIndex] = setInterval(() => {
        for (let row = 0; row < 3; row++) {
            const symbolEl = document.getElementById(`symbol-${reelIndex}-${row}`);
            symbolEl.innerText = symbols[Math.floor(Math.random() * symbols.length)].emoji;
        }
    }, 50);
}

function stopReel(reelIndex, finalSymbols) {
    const container = document.getElementById(`reel-container-${reelIndex}`);

    if (state.reelTimers[reelIndex]) {
        clearInterval(state.reelTimers[reelIndex]);
        state.reelTimers[reelIndex] = null;
    }

    for (let row = 0; row < 3; row++) {
        const symbolEl = document.getElementById(`symbol-${reelIndex}-${row}`);
        symbolEl.innerText = symbols[finalSymbols[row]].emoji;
        state.reels[reelIndex][row] = finalSymbols[row];
    }

    container.classList.remove('spinning');
    container.classList.add('stopped');
}

function evaluateResults(finalResults) {
    let totalWin = 0;
    let diamondCount = 0;
    let winningLines = [];
    let allWinningPositions = new Set();
    
    // Count diamonds across ALL positions
    for (let r = 0; r < config.NUM_REELS; r++) {
        for (let row = 0; row < 3; row++) {
            if (symbols[finalResults[r][row]].name === 'Diamond') {
                diamondCount++;
            }
        }
    }
    
    // Define all 20 paylines (Vegas-style)
    // Each payline is an array of [row] for each reel (0=top, 1=middle, 2=bottom)
    const paylines = [
        // Straight lines
        [1, 1, 1, 1, 1],  // Line 1: Middle (main)
        [0, 0, 0, 0, 0],  // Line 2: Top
        [2, 2, 2, 2, 2],  // Line 3: Bottom
        
        // True diagonals (3-symbol patterns that extend)
        [0, 1, 2, 0, 1],  // Line 4: Diagonal down then reset
        [2, 1, 0, 2, 1],  // Line 5: Diagonal up then reset
        
        // V shapes
        [0, 1, 2, 1, 0],  // Line 6: V shape
        [2, 1, 0, 1, 2],  // Line 7: Inverted V (^)
        
        // Gradual slopes
        [0, 0, 1, 1, 2],  // Line 8: Gentle slope down
        [2, 2, 1, 1, 0],  // Line 9: Gentle slope up
        
        // Zigzags
        [0, 1, 0, 1, 0],  // Line 10: Zigzag top
        [2, 1, 2, 1, 2],  // Line 11: Zigzag bottom
        [1, 0, 1, 0, 1],  // Line 12: Zigzag middle-top
        [1, 2, 1, 2, 1],  // Line 13: Zigzag middle-bottom
        
        // W and M shapes
        [0, 2, 0, 2, 0],  // Line 14: W shape
        [2, 0, 2, 0, 2],  // Line 15: M shape
        
        // Mixed patterns
        [0, 1, 1, 1, 2],  // Line 16: Slight dip
        [2, 1, 1, 1, 0],  // Line 17: Slight rise
        
        // Steps
        [1, 0, 0, 0, 1],  // Line 18: Top plateau
        [1, 2, 2, 2, 1],  // Line 19: Bottom plateau
        [0, 0, 0, 1, 2],  // Line 20: Late slope down
    ];
    
    // Evaluate each payline
    paylines.forEach((payline, lineIndex) => {
        const lineSymbols = payline.map((row, reelIndex) => finalResults[reelIndex][row]);
        const lineResult = evaluateLine(lineSymbols);
        
        if (lineResult.win > 0) {
            let multiplier = state.bonusMode ? state.bonusMultiplier : 1;
            // Use bonusBet during bonus mode, otherwise use regular bet
            const currentBet = state.bonusMode ? state.bonusBet : state.bet;
            // Calculate line win - divide by 10 to tighten payouts
            const rawWin = lineResult.win * currentBet * multiplier;
            const lineWin = Math.max(1, Math.floor(rawWin / 10));
            totalWin += lineWin;
            
            winningLines.push({
                lineIndex: lineIndex + 1,
                payline: payline,
                matchCount: lineResult.matchCount,
                symbol: lineResult.symbol,
                win: lineWin
            });
            
            // Track winning positions
            for (let i = 0; i < lineResult.matchCount; i++) {
                allWinningPositions.add(`${i}-${payline[i]}`);
            }
        }
    });
    
    // Highlight all winning symbols
    allWinningPositions.forEach(pos => {
        const [reel, row] = pos.split('-').map(Number);
        const symbolEl = document.getElementById(`symbol-${reel}-${row}`);
        symbolEl.classList.add('winning-symbol');
        document.getElementById(`reel-container-${reel}`).classList.add('winning');
        
        // Add wild glow if it's a wild card
        if (symbols[finalResults[reel][row]].isWild) {
            symbolEl.classList.add('wild-glow');
        }
    });
    
    // Also highlight diamonds and wilds that appear
    for (let r = 0; r < config.NUM_REELS; r++) {
        for (let row = 0; row < 3; row++) {
            const sym = symbols[finalResults[r][row]];
            if (sym.name === 'Diamond') {
                document.getElementById(`symbol-${r}-${row}`).classList.add('winning-symbol', 'diamond-glow');
            } else if (sym.isWild) {
                document.getElementById(`symbol-${r}-${row}`).classList.add('wild-glow');
            }
        }
    }
    
    // Check for bonus trigger (3+ diamonds anywhere) - only in normal mode
    if (!state.bonusMode && diamondCount >= 3) {
        // Bonus triggered! Reset the consecutive spins counter
        bonusBoostState.consecutiveSpinsWithoutBonus = 0;
        
        // Also reset hot streak - bonus ends the lucky period
        resetHotStreak();
        
        // Add any wins before triggering bonus
        if (totalWin > 0) {
            state.credits += totalWin;
            state.lastWin = totalWin;
        }
        triggerDiamondBonus(diamondCount);
        return; // Bonus handles the rest
    }
    
    // Track consecutive spins without bonus (only in normal mode)
    // Progressive boost system: after 100 spins, bonus chance increases 10% every 10 spins
    if (!state.bonusMode) {
        bonusBoostState.consecutiveSpinsWithoutBonus++;
    }
    
    // Check for retrigger during bonus mode (3+ diamonds adds more spins)
    if (state.bonusMode && diamondCount >= 3) {
        addBonusSpins(diamondCount);
    }
    
    // 2 diamonds anywhere = 2x bet back (consolation prize) - only in normal mode
    if (diamondCount === 2 && !state.bonusMode) {
        const diamondBonus = state.bet * 2;
        totalWin += diamondBonus;
    }
    
    // Apply wins
    const winDisplay = document.getElementById('win-display');
    
    if (totalWin > 0) {
        state.credits += totalWin;
        state.lastWin = totalWin;
        
        if (state.bonusMode) {
            state.bonusTotalWin += totalWin;
        }
        
        const linesWon = winningLines.length;
        const currentBetForDisplay = state.bonusMode ? state.bonusBet : state.bet;
        // Win multiplier based on actual credits won vs bet amount
        const winMultiplier = totalWin / currentBetForDisplay;
        
        // Win tiers based ONLY on actual credit multiplier (not line count)
        // MEGA WIN: 50x+ the bet
        // BIG WIN: 10x+ the bet  
        // NICE WIN: 5x+ the bet
        if (winMultiplier >= 50) {
            winDisplay.className = 'win-display mega-win';
            winDisplay.innerHTML = `🎉 MEGA WIN! 🎉<br>${linesWon} LINES! +${totalWin}`;
            playSound('megaWin');
            showScreenFlash('mega');
            createCelebrationParticles('mega');
            speak(`Mega win! ${linesWon} lines! ${totalWin} credits!`);
        } else if (winMultiplier >= 10) {
            winDisplay.className = 'win-display big-win';
            winDisplay.innerHTML = `✨ BIG WIN! ✨<br>${linesWon} LINES! +${totalWin}`;
            playSound('bigWin');
            showScreenFlash('win');
            createCelebrationParticles('big');
            speak(`Big win! ${linesWon} lines! ${totalWin} credits!`);
        } else if (winMultiplier >= 5) {
            winDisplay.className = 'win-display nice-win';
            winDisplay.innerHTML = `🌟 NICE! ${linesWon} LINES! +${totalWin}`;
            playSound('win');
            createCelebrationParticles('nice');
            speak(`Nice! ${linesWon} lines! ${totalWin} credits!`);
        } else {
            winDisplay.className = 'win-display active';
            if (linesWon > 1) {
                winDisplay.innerText = `${linesWon} LINES! +${totalWin}`;
            } else {
                winDisplay.innerText = `+${totalWin}`;
            }
            playSound('win');
            createCelebrationParticles('small');
            speak(`Win ${totalWin}`);
        }
    } else {
        winDisplay.innerText = '';
    }

    state.spinning = false;
    updateGameUI();
    saveCredits();

    // Check bonus mode end
    if (state.bonusMode && state.bonusSpinsLeft <= 0) {
        setTimeout(() => endBonusMode(), 1500);
        return;
    }
    
    // Schedule next bonus spin if in bonus mode
    if (state.bonusMode && state.bonusSpinsLeft > 0) {
        scheduleBonusSpin();
        return;
    }

    // Check game over
    if (state.credits <= 0 && !state.bonusMode) {
        stopAutoplay();
        setTimeout(() => {
            showGameOver();
        }, 2000);
        return;
    }
    
    // Schedule next autoplay spin if active (normal mode only)
    if (state.autoplayActive && !state.bonusMode) {
        scheduleNextAutoplaySpin();
    }
}

function evaluateLine(symbolIndices) {
    // Find the first non-wild symbol to match against
    let baseSymbolIndex = -1;
    for (let i = 0; i < symbolIndices.length; i++) {
        if (!symbols[symbolIndices[i]].isWild && !symbols[symbolIndices[i]].isBonus) {
            baseSymbolIndex = symbolIndices[i];
            break;
        }
    }
    
    // If all wilds, use wild payout
    if (baseSymbolIndex === -1) {
        const wildIndex = symbols.findIndex(s => s.isWild);
        if (wildIndex !== -1) {
            baseSymbolIndex = wildIndex;
        } else {
            return { win: 0, matchCount: 0, symbol: null };
        }
    }
    
    const baseSymbol = symbols[baseSymbolIndex];
    let matchCount = 0;
    
    // Count matches from left, treating Wilds as matches (but not Diamonds)
    for (let i = 0; i < symbolIndices.length; i++) {
        const sym = symbols[symbolIndices[i]];
        // Wild matches anything except for bonus purposes
        // Diamonds don't match as wilds (they're bonus symbols)
        if (symbolIndices[i] === baseSymbolIndex || (sym.isWild && !baseSymbol.isBonus)) {
            matchCount++;
        } else if (sym.isBonus) {
            // Diamonds break the chain unless base is diamond
            if (baseSymbol.isBonus) {
                matchCount++;
            } else {
                break;
            }
        } else {
            break;
        }
    }
    
    if (matchCount >= 3) {
        const payoutMultiplier = matchCount === 3 ? 1 : (matchCount === 4 ? 5 : 25);
        // Hot streak boost (hidden) - 40% boost to payouts
        let hotBoost = isHotStreakActive() ? 1.4 : 1.0;
        return {
            win: Math.floor(baseSymbol.payout * payoutMultiplier * hotBoost),
            matchCount: matchCount,
            symbol: baseSymbol
        };
    }
    
    return { win: 0, matchCount: 0, symbol: null };
}

// --- Diamond Bonus Mode ---
function triggerDiamondBonus(diamondCount) {
    state.bonusMode = true;
    state.bonusSpinsLeft = 10;
    state.bonusTotalWin = 0;
    state.bonusBet = state.bet; // Lock in the current bet for all bonus spins
    
    // Set multiplier based on diamond count
    if (diamondCount === 3) {
        state.bonusMultiplier = 10;
    } else if (diamondCount === 4) {
        state.bonusMultiplier = 50;
    } else { // 5+
        state.bonusMultiplier = 100;
    }
    
    state.spinning = false;
    
    // Stop any active autoplay - bonus has its own auto-spin
    if (state.autoplayActive) {
        stopAutoplay();
    }
    
    // Epic effects
    playSound('bonusTrigger');
    showScreenFlash('bonus');
    createCelebrationParticles('bonus');
    
    // Show bonus overlay
    const bonusOverlay = document.getElementById('bonus-overlay');
    bonusOverlay.classList.remove('hidden');
    bonusOverlay.querySelector('.bonus-info').innerHTML = `${diamondCount} DIAMONDS!`;
    bonusOverlay.querySelector('.bonus-multiplier-display').innerHTML = `${state.bonusMultiplier}x`;
    bonusOverlay.querySelector('.bonus-spins-left').innerHTML = `10 FREE SPINS!`;
    
    document.getElementById('slot-machine').classList.add('bonus-mode');
    
    speak(`Diamond Bonus! ${diamondCount} diamonds! ${state.bonusMultiplier} times multiplier! 10 free spins!`);
    
    // Hide overlay after delay and start auto-spinning bonus
    setTimeout(() => {
        bonusOverlay.classList.add('hidden');
        updateBonusIndicator();
        updateGameUI();
        // Start auto-spinning the bonus rounds
        scheduleBonusSpin();
    }, 4000);
}

function addBonusSpins(diamondCount) {
    // Retrigger during bonus - add more spins!
    let addedSpins = 0;
    if (diamondCount === 3) {
        addedSpins = 10;
    } else if (diamondCount === 4) {
        addedSpins = 20;
    } else { // 5+
        addedSpins = 30;
    }
    
    state.bonusSpinsLeft += addedSpins;
    
    // Show retrigger celebration
    playSound('bonusTrigger');
    showScreenFlash('bonus');
    createCelebrationParticles('bonus');
    
    const winDisplay = document.getElementById('win-display');
    winDisplay.className = 'win-display bonus-trigger';
    winDisplay.innerHTML = `💎 +${addedSpins} FREE SPINS! 💎`;
    
    speak(`Retrigger! ${addedSpins} more free spins! ${state.bonusSpinsLeft} total!`);
    
    updateBonusIndicator();
}

function scheduleBonusSpin() {
    if (!state.bonusMode || state.bonusSpinsLeft <= 0) return;
    if (state.spinning) return;
    
    // Schedule next bonus spin
    state.bonusAutoTimer = setTimeout(() => {
        if (state.bonusMode && state.bonusSpinsLeft > 0 && !state.spinning) {
            doSpin();
        }
    }, 1500);
}

function endBonusMode() {
    const totalWon = state.bonusTotalWin;
    
    // Clear bonus auto-spin timer
    if (state.bonusAutoTimer) {
        clearTimeout(state.bonusAutoTimer);
        state.bonusAutoTimer = null;
    }
    
    state.bonusMode = false;
    state.bonusMultiplier = 1;
    state.bonusSpinsLeft = 0;
    state.bonusBet = 0;
    
    document.getElementById('slot-machine').classList.remove('bonus-mode');
    
    // Show celebration
    const celebration = document.getElementById('win-celebration');
    celebration.classList.remove('hidden');
    celebration.querySelector('.celebration-title').innerText = '💎 BONUS COMPLETE! 💎';
    celebration.querySelector('.celebration-amount').innerText = `Total Won: ${totalWon}`;
    celebration.querySelector('.celebration-multiplier').innerText = '';
    
    if (totalWon > 0) {
        playSound('megaWin');
        createCelebrationParticles('mega');
    }
    
    speak(`Bonus complete! Total won: ${totalWon} credits!`);
    
    setTimeout(() => {
        celebration.classList.add('hidden');
        updateBonusIndicator();
        
        if (state.credits <= 0) {
            stopAutoplay();
            showGameOver();
        } else if (state.autoplayActive) {
            // Continue autoplay after bonus
            scheduleNextAutoplaySpin();
        }
    }, 4000);
}

function updateBonusIndicator() {
    const indicator = document.getElementById('bonus-indicator');
    const multiplierDisplay = document.getElementById('multiplier-display');
    
    if (state.bonusMode && state.bonusSpinsLeft > 0) {
        indicator.innerHTML = `🎰 ${state.bonusSpinsLeft} BONUS SPINS`;
        indicator.classList.add('active');
        multiplierDisplay.innerHTML = `${state.bonusMultiplier}x`;
        multiplierDisplay.classList.add('active');
    } else {
        indicator.innerHTML = '';
        indicator.classList.remove('active');
        multiplierDisplay.innerHTML = '';
        multiplierDisplay.classList.remove('active');
    }
}

// --- Visual Effects ---
function showScreenFlash(type) {
    const flash = document.getElementById('screen-flash');
    flash.className = 'screen-flash';
    
    if (type === 'win') {
        flash.classList.add('win-flash');
    } else if (type === 'bonus') {
        flash.classList.add('bonus-flash');
    } else if (type === 'mega') {
        flash.classList.add('mega-flash');
    }
    
    setTimeout(() => {
        flash.className = 'screen-flash';
    }, 1000);
}

function createCelebrationParticles(type) {
    if (!particleCanvas || !particleCtx) return;
    
    let colors, count, speed, size;
    
    switch(type) {
        case 'mega':
            colors = ['#FFD700', '#FF00FF', '#00FFFF', '#FF3366', '#00FF88', '#FF8800'];
            count = 200;
            speed = 12;
            size = 15;
            break;
        case 'big':
            colors = ['#FFD700', '#FF00FF', '#00FFFF'];
            count = 100;
            speed = 8;
            size = 12;
            break;
        case 'nice':
            colors = ['#FFD700', '#00FFFF'];
            count = 60;
            speed = 6;
            size = 10;
            break;
        case 'bonus':
            colors = ['#FF00FF', '#00FFFF', '#FFD700', '#FF3366', '#9933FF'];
            count = 250;
            speed = 15;
            size = 18;
            break;
        case 'refill':
            colors = ['#00FF88', '#00FFFF', '#FFD700'];
            count = 80;
            speed = 7;
            size = 10;
            break;
        default:
            colors = ['#FFD700'];
            count = 30;
            speed = 5;
            size = 8;
    }
    
    for (let i = 0; i < count; i++) {
        particles.push({
            x: particleCanvas.width / 2 + (Math.random() - 0.5) * 300,
            y: particleCanvas.height / 2 + (Math.random() - 0.5) * 200,
            vx: (Math.random() - 0.5) * speed * 2,
            vy: (Math.random() - 0.5) * speed * 2 - speed / 2,
            size: Math.random() * size + 4,
            color: colors[Math.floor(Math.random() * colors.length)],
            alpha: 1,
            rotation: Math.random() * 360,
            rotationSpeed: (Math.random() - 0.5) * 15,
            shape: Math.random() > 0.3 ? 'circle' : 'star',
            gravity: 0.15 + Math.random() * 0.1
        });
    }
    
    if (!animationFrameId) {
        animateParticles();
    }
}

function animateParticles() {
    if (!particleCtx || particles.length === 0) {
        animationFrameId = null;
        return;
    }
    
    particleCtx.clearRect(0, 0, particleCanvas.width, particleCanvas.height);
    
    particles = particles.filter(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += p.gravity;
        p.alpha -= 0.012;
        p.rotation += p.rotationSpeed;
        
        if (p.alpha > 0) {
            particleCtx.save();
            particleCtx.translate(p.x, p.y);
            particleCtx.rotate(p.rotation * Math.PI / 180);
            particleCtx.globalAlpha = p.alpha;
            particleCtx.fillStyle = p.color;
            
            if (p.shape === 'circle') {
                particleCtx.beginPath();
                particleCtx.arc(0, 0, p.size, 0, Math.PI * 2);
                particleCtx.fill();
            } else {
                drawStar(particleCtx, 0, 0, 5, p.size, p.size / 2);
            }
            
            particleCtx.restore();
            return true;
        }
        return false;
    });
    
    animationFrameId = requestAnimationFrame(animateParticles);
}

function drawStar(ctx, cx, cy, spikes, outerRadius, innerRadius) {
    let rot = Math.PI / 2 * 3;
    const step = Math.PI / spikes;

    ctx.beginPath();
    ctx.moveTo(cx, cy - outerRadius);
    for (let i = 0; i < spikes; i++) {
        ctx.lineTo(cx + Math.cos(rot) * outerRadius, cy + Math.sin(rot) * outerRadius);
        rot += step;
        ctx.lineTo(cx + Math.cos(rot) * innerRadius, cy + Math.sin(rot) * innerRadius);
        rot += step;
    }
    ctx.lineTo(cx, cy - outerRadius);
    ctx.closePath();
    ctx.fill();
}

// --- UI Updates ---
function getHighlightColor() {
    return highlightColors[settings.highlightColorIndex].color;
}

function updateHighlights() {
    // Clear ALL buttons that might have highlight styles
    document.querySelectorAll('.menu-button, .action-button, .spin-button, .autoplay-button, .bet-button, .pause-scan-button, .highlight, .highlight-full').forEach(el => {
        el.classList.remove('highlight', 'highlight-full');
        el.style.borderColor = '';
        el.style.backgroundColor = '';
        el.style.background = '';
        el.style.color = '';
        el.style.boxShadow = '';
        el.style.transform = '';
    });

    let target = null;

    if (state.mode === 'menu') {
        target = document.getElementById(`btn-menu-container-${state.menuIndex}`);
    } else if (state.mode === 'game') {
        const ids = ['spin-button', 'bet-decrease', 'bet-increase', 'bet-max', 'autoplay-button', 'pause-scan-button'];
        target = document.getElementById(ids[state.scanIndex]);
    } else if (state.mode === 'pause') {
        target = document.getElementById(`btn-pause-overlay-${state.pauseIndex}`);
    } else if (state.mode === 'gameover') {
        target = document.getElementById(`btn-pause-overlay-${state.gameoverIndex}`);
    } else if (state.mode === 'autoplay-menu') {
        const totalOptions = autoplayOptions.length + 1; // +1 for cancel
        if (state.autoplayMenuIndex < autoplayOptions.length) {
            target = document.getElementById(`btn-autoplay-${state.autoplayMenuIndex}`);
        } else {
            target = document.getElementById('btn-autoplay-cancel');
        }
    }

    if (target) {
        const color = getHighlightColor();

        if (settings.highlightStyle === 'full') {
            target.classList.add('highlight-full');
            target.style.background = color; // Use 'background' to override gradients
            target.style.borderColor = '#ffffff';
            target.style.color = '#000000';
        } else {
            target.classList.add('highlight');
            target.style.borderColor = color;
            target.style.boxShadow = `0 0 30px ${color}80, 0 0 60px ${color}40`;
        }
    }
}

function updateGameUI() {
    const creditAmount = document.getElementById('credit-amount');
    if (creditAmount) creditAmount.innerText = state.credits;

    const betDisplay = document.getElementById('bet-display');
    if (betDisplay) betDisplay.innerText = `BET: ${state.bet}`;

    document.getElementById('status-display').innerText = `💎 Credits: ${state.credits}`;
}

// --- Input Handling ---
// Note: The scan-manager (scan-manager.js) intercepts keydown/keyup events and applies
// anti-tremor filtering. If a press is too short (below sensitivity threshold), it blocks
// the event and fires 'narbe-input-cancelled'. We must listen for both normal keyup AND
// the cancelled event to properly handle all cases.

function setupInput() {
    document.addEventListener('keydown', e => {
        if (e.repeat) return; // Ignore auto-repeat from held keys
        
        if (e.code === 'Space') {
            // Only set spaceHeld if not already held and no backward scan in progress
            if (!state.input.spaceHeld && !state.timers.spaceRepeat) {
                state.input.spaceHeld = true;
                state.input.spaceTime = Date.now();
                resetAutoScan();
                e.preventDefault();
                // Start timer for long press (backward scan)
                state.timers.space = setTimeout(() => {
                    if (state.input.spaceHeld) {
                        startBackwardsScan();
                    }
                    state.timers.space = null;
                }, config.longPress);
            }
        } else if (e.code === 'Enter' || e.code === 'NumpadEnter') {
            if (!state.input.enterHeld) {
                state.input.enterHeld = true;
                state.input.enterTime = Date.now();
                resetAutoScan();
                e.preventDefault();
                // Long press for backwards toggle in menus
                if (state.mode === 'menu' || state.mode === 'pause') {
                    state.timers.enter = setTimeout(() => {
                        if (state.input.enterHeld) {
                            startBackwardsToggle();
                        }
                        state.timers.enter = null;
                    }, config.longPress);
                }
            }
        }
    });

    document.addEventListener('keyup', e => {
        if (e.code === 'Space') {
            // Clear the hold timeout
            if (state.timers.space) {
                clearTimeout(state.timers.space);
                state.timers.space = null;
            }
            
            // Check if we were backward scanning
            const wasBackwardScanning = state.timers.spaceRepeat !== null;
            stopBackwardsScan();
            
            // Only forward scan on short press if NOT backward scanning
            if (state.input.spaceHeld && !wasBackwardScanning) {
                const duration = Date.now() - state.input.spaceTime;
                if (duration < config.longPress) {
                    scanForward();
                }
            }
            
            state.input.spaceHeld = false;
            resetAutoScan();
        } else if (e.code === 'Enter' || e.code === 'NumpadEnter') {
            // Clear the hold timeout
            if (state.timers.enter) {
                clearTimeout(state.timers.enter);
                state.timers.enter = null;
            }
            
            // Check if we were doing backwards toggle
            const wasBackwardsToggle = state.timers.enterRepeat !== null;
            stopBackwardsToggle();
            
            // Only select on short press if NOT backwards toggling
            if (state.input.enterHeld && !wasBackwardsToggle) {
                const duration = Date.now() - state.input.enterTime;
                if (duration < config.longPress) {
                    selectItem();
                }
            }
            
            state.input.enterHeld = false;
            resetAutoScan();
        }
    });
    
    // Listen for cancelled inputs from scan-manager (anti-tremor filtering)
    // When the scan-manager blocks a too-short press, it fires this event
    document.addEventListener('narbe-input-cancelled', (e) => {
        if (e.detail && (e.detail.key === ' ' || e.detail.code === 'Space')) {
            // Clear timers and state
            if (state.timers.space) {
                clearTimeout(state.timers.space);
                state.timers.space = null;
            }
            const wasBackwardScanning = state.timers.spaceRepeat !== null;
            stopBackwardsScan();
            state.input.spaceHeld = false;
            
            // If cancelled due to 'too-short', we should NOT scan forward
            // This is the anti-tremor behavior - quick taps are ignored
        }
        if (e.detail && (e.detail.key === 'Enter' || e.detail.code === 'Enter' || e.detail.code === 'NumpadEnter')) {
            // Clear timers and state
            if (state.timers.enter) {
                clearTimeout(state.timers.enter);
                state.timers.enter = null;
            }
            stopBackwardsToggle();
            state.input.enterHeld = false;
            
            // If cancelled due to 'too-short', we should NOT select
            // This is the anti-tremor behavior - quick taps are ignored
        }
    });
    
    // Touch/click to init audio
    document.addEventListener('click', () => initAudio(), { once: true });
    document.addEventListener('touchstart', () => initAudio(), { once: true });
}

function stopBackwardsScan() {
    if (state.timers.spaceRepeat) {
        clearInterval(state.timers.spaceRepeat);
        state.timers.spaceRepeat = null;
    }
}

function stopBackwardsToggle() {
    if (state.timers.enterRepeat) {
        clearInterval(state.timers.enterRepeat);
        state.timers.enterRepeat = null;
    }
}

function scanForward() {
    playSound('click');
    
    if (state.mode === 'menu') {
        const items = menus[state.menuState];
        state.menuIndex = (state.menuIndex + 1) % items.length;
        announceCurrentMenuItem();
    } else if (state.mode === 'game') {
        state.scanIndex = (state.scanIndex + 1) % state.gameActions.length;
        announceGameAction();
    } else if (state.mode === 'pause') {
        const items = state.pauseMenuState === 'settings' ? menus.pauseSettings : menus.pause;
        state.pauseIndex = (state.pauseIndex + 1) % items.length;
        announceCurrentPauseItem();
    } else if (state.mode === 'gameover') {
        state.gameoverIndex = (state.gameoverIndex + 1) % menus.gameover.length;
        const item = menus.gameover[state.gameoverIndex];
        const txt = (typeof item.text === 'function' ? item.text() : item.text).replace(/[🎁🏠⏳]/g, '');
        speak(txt);
    } else if (state.mode === 'autoplay-menu') {
        const totalOptions = autoplayOptions.length + 1; // +1 for cancel
        state.autoplayMenuIndex = (state.autoplayMenuIndex + 1) % totalOptions;
        announceAutoplayOption();
    }
    updateHighlights();
}

function scanBackward() {
    playSound('click');
    
    if (state.mode === 'menu') {
        const items = menus[state.menuState];
        state.menuIndex = (state.menuIndex - 1 + items.length) % items.length;
        announceCurrentMenuItem();
    } else if (state.mode === 'game') {
        state.scanIndex = (state.scanIndex - 1 + state.gameActions.length) % state.gameActions.length;
        announceGameAction();
    } else if (state.mode === 'pause') {
        const items = state.pauseMenuState === 'settings' ? menus.pauseSettings : menus.pause;
        state.pauseIndex = (state.pauseIndex - 1 + items.length) % items.length;
        announceCurrentPauseItem();
    } else if (state.mode === 'gameover') {
        state.gameoverIndex = (state.gameoverIndex - 1 + menus.gameover.length) % menus.gameover.length;
        const item = menus.gameover[state.gameoverIndex];
        const txt = (typeof item.text === 'function' ? item.text() : item.text).replace(/[🎁🏠⏳]/g, '');
        speak(txt);
    } else if (state.mode === 'autoplay-menu') {
        const totalOptions = autoplayOptions.length + 1; // +1 for cancel
        state.autoplayMenuIndex = (state.autoplayMenuIndex - 1 + totalOptions) % totalOptions;
        announceAutoplayOption();
    }
    updateHighlights();
}

function announceAutoplayOption() {
    if (state.autoplayMenuIndex < autoplayOptions.length) {
        speak(autoplayOptions[state.autoplayMenuIndex].label);
    } else {
        speak("Cancel");
    }
}

function announceGameAction() {
    const actions = ['Spin', 'Decrease Bet', 'Increase Bet', 'Max Bet', state.autoplayActive ? 'Stop Autoplay' : 'Autoplay', 'Pause'];
    speak(actions[state.scanIndex] + (state.scanIndex > 0 && state.scanIndex < 5 ? `. Bet ${state.bet}` : ''));
}

function startBackwardsScan() {
    scanBackward();
    state.timers.spaceRepeat = setInterval(scanBackward, config.repeatInterval);
}

function selectItem() {
    playSound('select');
    
    if (state.mode === 'menu') {
        const item = menus[state.menuState][state.menuIndex];
        if (item?.action) item.action();
    } else if (state.mode === 'game') {
        // Block all actions during bonus mode
        if (state.bonusMode) return;
        
        // Allow pause even while spinning, but block other actions
        if (state.scanIndex === 5) {
            // Pause - allowed when not in bonus
            if (state.autoplayActive) {
                stopAutoplay();
            }
            showPauseMenu();
            return;
        }
        if (state.spinning) return;
        switch (state.scanIndex) {
            case 0: doSpin(); break;
            case 1: decreaseBet(); break;
            case 2: increaseBet(); break;
            case 3: setMaxBet(); break;
            case 4: handleAutoplayButton(); break;
        }
    } else if (state.mode === 'pause') {
        const items = state.pauseMenuState === 'settings' ? menus.pauseSettings : menus.pause;
        const item = items[state.pauseIndex];
        if (item?.action) item.action();
    } else if (state.mode === 'gameover') {
        const item = menus.gameover[state.gameoverIndex];
        if (item?.action) item.action();
    } else if (state.mode === 'autoplay-menu') {
        if (state.autoplayMenuIndex < autoplayOptions.length) {
            const opt = autoplayOptions[state.autoplayMenuIndex];
            startAutoplay(opt.mode, opt.value);
        } else {
            closeAutoplayMenu();
        }
    }
}

function startBackwardsToggle() {
    performBackwardsToggle();
    state.timers.enterRepeat = setInterval(performBackwardsToggle, config.repeatInterval);
}

function performBackwardsToggle() {
    if (state.mode === 'menu') {
        const item = menus[state.menuState][state.menuIndex];
        if (item?.onPrev) item.onPrev();
    } else if (state.mode === 'pause') {
        const items = state.pauseMenuState === 'settings' ? menus.pauseSettings : menus.pause;
        const item = items[state.pauseIndex];
        if (item?.onPrev) item.onPrev();
    }
}

// --- TTS ---
function speak(text) {
    // Check NarbeVoiceManager first (it has its own ttsEnabled check)
    if (window.NarbeVoiceManager) {
        window.NarbeVoiceManager.speak(text);
    } else if (settings.tts && 'speechSynthesis' in window) {
        // Fallback to native speech synthesis
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        speechSynthesis.speak(u);
    }
}

window.onload = init;
