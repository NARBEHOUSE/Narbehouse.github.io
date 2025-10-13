/**
 * Minimal iOS Web Audio unlock for synthesized sounds
 * Specifically targets Web Audio API oscillators and synthesized audio
 */
(function() {
  'use strict';
  
  const iOSAudioUnlock = {
    isIOS: /iPad|iPhone|iPod/.test(navigator.userAgent) || 
           (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
    
    async unlockContext(audioContext) {
      if (!this.isIOS || !audioContext) return true;
      
      try {
        // Play a brief silent oscillator to unlock iOS Web Audio
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        
        osc.connect(gain);
        gain.connect(audioContext.destination);
        gain.gain.setValueAtTime(0, audioContext.currentTime);
        
        osc.frequency.setValueAtTime(440, audioContext.currentTime);
        osc.start(audioContext.currentTime);
        osc.stop(audioContext.currentTime + 0.1);
        
        // Resume the context if suspended
        if (audioContext.state === 'suspended') {
          await audioContext.resume();
        }
        
        console.log('iOS Web Audio unlocked');
        return true;
      } catch (error) {
        console.warn('iOS audio unlock failed:', error);
        return false;
      }
    }
  };
  
  // Export globally
  window.iOSAudioUnlock = iOSAudioUnlock;
  
})();