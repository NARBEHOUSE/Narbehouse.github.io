class InputHandler {
    constructor() {
        this.keys = {};
        this.mode = 'MENU'; // 'MENU' or 'GAMEPLAY'
        
        // State tracking
        // NOTE: All input debouncing is handled by scan-manager.js - do NOT add local debounce
        this.spacePressed = false;
        this.spaceHoldStartTime = 0;
        this.spaceHoldTimeout = null;
        this.backwardScanInterval = null;
        
        this.enterPressed = false;
        this.enterHoldStart = 0;
        this.pauseHoldTimeout = null;
        this.pauseTriggered = false;

        // Callbacks
        this.onEvent = null; // (eventType, data) => {}

        this.setupListeners();
    }

    setMode(mode) {
        this.mode = mode;
        // Reset states on mode switch to prevent stuck inputs
        this.spacePressed = false;
        this.enterPressed = false;
        this.stopBackwardScan();
        if (this.spaceHoldTimeout) {
            clearTimeout(this.spaceHoldTimeout);
            this.spaceHoldTimeout = null;
        }
        if (this.pauseHoldTimeout) {
            clearTimeout(this.pauseHoldTimeout);
            this.pauseHoldTimeout = null;
        }
    }

    setupListeners() {
        window.addEventListener('keydown', (e) => this.handleKeyDown(e));
        window.addEventListener('keyup', (e) => this.handleKeyUp(e));
        
        // Listen for cancelled inputs from scan-manager (e.g., too-short presses blocked by anti-tremor)
        document.addEventListener('narbe-input-cancelled', (e) => {
            if (e.detail && (e.detail.key === ' ' || e.detail.code === 'Space')) {
                const wasBackwardScanning = this.backwardScanInterval !== null;
                this.spacePressed = false;
                this.spaceHoldStartTime = 0;
                this.keys['Space'] = false;
                this.stopBackwardScan();
                if (this.spaceHoldTimeout) {
                    clearTimeout(this.spaceHoldTimeout);
                    this.spaceHoldTimeout = null;
                }
                // If cancelled due to 'too-short', still perform forward scan in menu mode - user intended to press
                if (e.detail.reason === 'too-short' && !wasBackwardScanning && this.mode === 'MENU') {
                    this.trigger('SCAN_NEXT');
                }
            }
            if (e.detail && (e.detail.key === 'Enter' || e.detail.code === 'Enter' || e.detail.code === 'NumpadEnter')) {
                const wasPauseTriggered = this.pauseTriggered;
                this.enterPressed = false;
                this.enterHoldStart = 0;
                this.keys['Enter'] = false;
                this.pauseTriggered = false;
                if (this.pauseHoldTimeout) {
                    clearTimeout(this.pauseHoldTimeout);
                    this.pauseHoldTimeout = null;
                }
                // If cancelled due to 'too-short', still perform select in menu mode - user intended to press
                if (e.detail.reason === 'too-short' && !wasPauseTriggered && this.mode === 'MENU') {
                    this.trigger('SELECT');
                }
            }
        });
    }

    handleKeyDown(e) {
        if (e.repeat) return; // Ignore auto-repeat
        if (this.keys[e.code]) return; // Already down
        this.keys[e.code] = true;

        if (e.code === 'Space' && !this.spacePressed) {
            this.spacePressed = true;
            this.spaceHoldStartTime = Date.now();
            
            if (this.mode === 'MENU') {
                // Set timeout for backwards scanning - only if not already active
                if (!this.spaceHoldTimeout && !this.backwardScanInterval) {
                    this.spaceHoldTimeout = setTimeout(() => {
                        if (this.spacePressed && this.mode === 'MENU') {
                            this.startBackwardScan();
                        }
                        this.spaceHoldTimeout = null;
                    }, 3000);
                }
            } else {
                this.trigger('GAME_SPACE_DOWN');
            }
        }

        if (e.code === 'Enter' && !this.enterPressed) {
            this.enterPressed = true;
            this.enterHoldStart = Date.now();
            this.pauseTriggered = false;

            if (this.mode === 'GAMEPLAY') {
                // Set timeout for pause - only if not already active
                if (!this.pauseHoldTimeout) {
                    this.pauseHoldTimeout = setTimeout(() => {
                        if (this.enterPressed && !this.pauseTriggered) {
                            this.pauseTriggered = true;
                            this.trigger('PAUSE');
                        }
                        this.pauseHoldTimeout = null;
                    }, 6000); // 6 seconds for pause menu
                }
                this.trigger('GAME_ENTER_DOWN');
            }
        }
    }

    handleKeyUp(e) {
        this.keys[e.code] = false;

        if (e.code === 'Space' && this.spacePressed) {
            this.spacePressed = false;
            const duration = Date.now() - this.spaceHoldStartTime;
            
            // Clear backwards scan timeout
            if (this.spaceHoldTimeout) {
                clearTimeout(this.spaceHoldTimeout);
                this.spaceHoldTimeout = null;
            }

            if (this.mode === 'MENU') {
                const wasBackwardScanning = this.backwardScanInterval !== null;
                this.stopBackwardScan();

                if (!wasBackwardScanning && duration < 3000) {
                    this.trigger('SCAN_NEXT');
                }
            } else {
                this.trigger('GAME_SPACE_UP');
            }
            this.spaceHoldStartTime = 0;
        }

        if (e.code === 'Enter' && this.enterPressed) {
            this.enterPressed = false;
            
            // Clear pause timeout
            if (this.pauseHoldTimeout) {
                clearTimeout(this.pauseHoldTimeout);
                this.pauseHoldTimeout = null;
            }
            
            if (this.mode === 'MENU') {
                if (!this.pauseTriggered) {
                    this.trigger('SELECT');
                }
            } else {
                if (!this.pauseTriggered) {
                    this.trigger('GAME_ENTER_UP');
                }
            }
            this.pauseTriggered = false;
        }
    }

    startBackwardScan() {
        if (typeof window.NarbeVoiceManager !== 'undefined') {
            window.NarbeVoiceManager.speak('Backwards scanning');
        }
        this.trigger('SCAN_PREV'); // Immediate first backward scan
        
        let interval = 2000;
        if (typeof window.NarbeScanManager !== 'undefined') {
            interval = window.NarbeScanManager.getScanInterval();
        }

        this.backwardScanInterval = setInterval(() => {
            if (this.spacePressed && this.mode === 'MENU') {
                this.trigger('SCAN_PREV');
            } else {
                this.stopBackwardScan();
            }
        }, interval);
    }

    stopBackwardScan() {
        if (this.backwardScanInterval) {
            clearInterval(this.backwardScanInterval);
            this.backwardScanInterval = null;
        }
    }

    trigger(event, data) {
        if (this.onEvent) {
            this.onEvent(event, data);
        }
    }

    // Helper for polling if needed (though we use events now)
    isDown(code) {
        return !!this.keys[code];
    }
}

const Input = new InputHandler();
