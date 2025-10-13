/**
 * iOS Audio Fix Utility
 * Handles iOS Safari audio restrictions and unlocks audio playback
 */
(function() {
  'use strict';
  
  // Prevent multiple initializations
  if (window.iOSAudioHelper) return;
  
  const iOSAudioHelper = {
    isIOS: /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream,
    audioContext: null,
    isUnlocked: false,
    
    // Initialize audio context with iOS compatibility
    createAudioContext() {
      if (this.audioContext) return this.audioContext;
      
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return null;
      
      this.audioContext = new AudioContext();
      return this.audioContext;
    },
    
    // Unlock audio on iOS (must be called from user interaction)
    async unlock() {
      if (this.isUnlocked) return true;
      
      try {
        // Create audio context if needed
        if (!this.audioContext) {
          this.createAudioContext();
        }
        
        if (this.audioContext && this.audioContext.state === 'suspended') {
          await this.audioContext.resume();
        }
        
        // Play a silent audio to unlock HTML5 audio elements
        if (this.isIOS) {
          const silentAudio = new Audio();
          silentAudio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQQAAAAAAAA=';
          silentAudio.volume = 0;
          
          try {
            await silentAudio.play();
            silentAudio.pause();
          } catch (e) {
            // Ignore play errors, we just need to trigger the unlock
          }
        }
        
        this.isUnlocked = true;
        console.log('iOS Audio unlocked successfully');
        return true;
        
      } catch (error) {
        console.warn('Failed to unlock iOS audio:', error);
        return false;
      }
    },
    
    // Prepare an audio element for iOS
    prepareAudio(audio) {
      if (!audio) return;
      
      // Set iOS-specific attributes
      audio.setAttribute('playsinline', '');
      audio.setAttribute('webkit-playsinline', '');
      audio.preload = 'auto';
      
      return audio;
    },
    
    // Safe audio play with iOS fallback
    async playAudio(audio) {
      if (!audio) return false;
      
      // Ensure audio is unlocked first
      if (!this.isUnlocked) {
        await this.unlock();
      }
      
      try {
        audio.currentTime = 0;
        const playPromise = audio.play();
        
        if (playPromise !== undefined) {
          await playPromise;
        }
        
        return true;
        
      } catch (error) {
        console.warn('Audio play failed:', error);
        
        // On iOS, retry on next user interaction
        if (this.isIOS) {
          const retryPlay = async () => {
            try {
              await this.unlock();
              audio.currentTime = 0;
              await audio.play();
            } catch (e) {
              console.warn('Audio retry failed:', e);
            }
          };
          
          // Add one-time listeners for next user interaction
          document.addEventListener('touchstart', retryPlay, { once: true });
          document.addEventListener('click', retryPlay, { once: true });
        }
        
        return false;
      }
    },
    
    // Initialize on first user interaction
    setupUserInteractionListeners() {
      const unlockOnInteraction = () => {
        this.unlock();
        // Remove listeners after first interaction
        document.removeEventListener('touchstart', unlockOnInteraction);
        document.removeEventListener('touchend', unlockOnInteraction);
        document.removeEventListener('click', unlockOnInteraction);
        document.removeEventListener('keydown', unlockOnInteraction);
      };
      
      // Listen for any user interaction
      document.addEventListener('touchstart', unlockOnInteraction, { once: true });
      document.addEventListener('touchend', unlockOnInteraction, { once: true });
      document.addEventListener('click', unlockOnInteraction, { once: true });
      document.addEventListener('keydown', unlockOnInteraction, { once: true });
    }
  };
  
  // Auto-setup interaction listeners
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      iOSAudioHelper.setupUserInteractionListeners();
    });
  } else {
    iOSAudioHelper.setupUserInteractionListeners();
  }
  
  // Export globally
  window.iOSAudioHelper = iOSAudioHelper;
  
})();