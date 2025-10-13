/**
 * Minimal iOS Game Audio Fix
 * Only handles game audio (music/sound effects), does not interfere with TTS
 */
(function() {
  'use strict';
  
  // Prevent multiple initializations
  if (window.iOSGameAudio) return;
  
  const iOSGameAudio = {
    isIOS: /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream,
    gameAudioUnlocked: false,
    
    // Unlock ONLY game audio context (not global audio)
    async unlockGameAudio(audioContext) {
      if (!this.isIOS || this.gameAudioUnlocked || !audioContext) return true;
      
      try {
        if (audioContext.state === 'suspended') {
          await audioContext.resume();
        }
        this.gameAudioUnlocked = true;
        console.log('Game audio unlocked for iOS');
        return true;
      } catch (error) {
        console.warn('Failed to unlock game audio:', error);
        return false;
      }
    },
    
    // Setup user interaction listeners for a specific audio context
    setupForAudioContext(audioContext) {
      if (!this.isIOS || !audioContext) return;
      
      const unlockOnInteraction = () => {
        this.unlockGameAudio(audioContext);
        // Remove listeners after first interaction
        document.removeEventListener('touchstart', unlockOnInteraction);
        document.removeEventListener('click', unlockOnInteraction);
        document.removeEventListener('keydown', unlockOnInteraction);
      };
      
      // Listen for any user interaction
      document.addEventListener('touchstart', unlockOnInteraction, { once: true });
      document.addEventListener('click', unlockOnInteraction, { once: true });
      document.addEventListener('keydown', unlockOnInteraction, { once: true });
    }
  };
  
  // Export globally
  window.iOSGameAudio = iOSGameAudio;
  
})();