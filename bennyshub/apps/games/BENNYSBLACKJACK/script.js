/**
 * Benny's Blackjack — Switch-Accessible Single-Player Blackjack
 *
 * Implements Benny's Hub universal accessibility contract:
 * - 2-switch mode (Auto Scan OFF): Space advances highlight on release, hold Space (~3s) scans backward, Enter selects on release.
 * - 1-switch mode (Auto Scan ON): Automatic highlight advancement at scan speed, Enter selects on release.
 * - Enter hold (~5s) or on-screen Pause button triggers Pause menu.
 * - Full speech via NarbeVoiceManager, sound effects via SafeAudio.
 * - Tie goes to the player!
 * - Statistics and settings persistent in localStorage.
 */

(function () {
  'use strict';

  /* ── CONSTANTS & TUNING ───────────────────────────────────────────────── */

  const STATS_KEY = 'bennys_blackjack_stats';
  const SCAN_BACK_HOLD_MS = 3000;
  const PAUSE_HOLD_MS = 5000;
  const PAUSE_HOLD_SHOW_MS = 1400;

  const SUITS = [
    { symbol: '♠', name: 'Spades', isRed: false },
    { symbol: '♥', name: 'Hearts', isRed: true },
    { symbol: '♦', name: 'Diamonds', isRed: true },
    { symbol: '♣', name: 'Clubs', isRed: false }
  ];

  const RANKS = [
    { symbol: 'A', name: 'Ace', value: 11 },
    { symbol: '2', name: '2', value: 2 },
    { symbol: '3', name: '3', value: 3 },
    { symbol: '4', name: '4', value: 4 },
    { symbol: '5', name: '5', value: 5 },
    { symbol: '6', name: '6', value: 6 },
    { symbol: '7', name: '7', value: 7 },
    { symbol: '8', name: '8', value: 8 },
    { symbol: '9', name: '9', value: 9 },
    { symbol: '10', name: '10', value: 10 },
    { symbol: 'J', name: 'Jack', value: 10 },
    { symbol: 'Q', name: 'Queen', value: 10 },
    { symbol: 'K', name: 'King', value: 10 }
  ];

  /* ── GAME STATE ───────────────────────────────────────────────────────── */

  const state = {
    screen: 'menu', // 'menu', 'game', 'howto', 'settings', 'pause'
    previousScreen: 'menu',
    roundPhase: 'IDLE', // 'IDLE', 'DEALING', 'PLAYER_TURN', 'DEALER_TURN', 'ROUND_OVER'
    
    deck: [],
    playerHand: [],
    dealerHand: [],
    
    stats: {
      handsWon: 0,
      handsLost: 0,
      streak: 0,
      bestStreak: 0
    },
    
    // Accessibility & Scanning
    scannables: [],
    scanIndex: 0,
    autoScanTimer: null,
    
    // Input holds
    spaceDownTime: 0,
    enterDownTime: 0,
    didBackHold: false,
    didPauseHold: false,
    backHoldTimeout: null,
    backRepeatTimer: null,
    pauseHoldTimeout: null,
    pauseShowTimeout: null,
    pauseProgressTimer: null,
    pauseBeepStep: 0,
    
    // Settings state helpers
    resetArmedTime: 0,
    
    // Async gameplay timers
    dealTimeouts: [],
    dealerActionTimeout: null,
    autoStandTimeout: null
  };

  /* ── AUDIO & TTS HELPERS ──────────────────────────────────────────────── */

  function playSound(name, vol = 1.0) {
    if (window.SafeAudio && typeof window.SafeAudio.play === 'function') {
      try {
        window.SafeAudio.play(name, vol);
      } catch (e) {
        console.warn("SafeAudio playback error", e);
      }
    }
  }

  function cleanTextForTTS(text) {
    if (!text) return '';
    return String(text)
      .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
      .replace(/[▶⚙❓🏠⏸➕✋🚪🔄◀▲▼►◄♠♥♦♣]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function speak(text, interrupt = true) {
    const clean = cleanTextForTTS(text);
    if (!clean) return;

    // Wake up/resume speech engine if suspended or paused
    if ('speechSynthesis' in window) {
      try {
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
      } catch (e) {}
    }

    // 1. Primary: Use NarbeVoiceManager if loaded
    if (window.NarbeVoiceManager && typeof window.NarbeVoiceManager.speak === 'function') {
      try {
        window.NarbeVoiceManager.speak(clean);
        return;
      } catch (e) {
        console.warn("NarbeVoiceManager speak error", e);
      }
    }

    // 2. Fallback: Browser native SpeechSynthesis
    if ('speechSynthesis' in window) {
      try {
        if (interrupt) {
          window.speechSynthesis.cancel();
        }
        const utterance = new SpeechSynthesisUtterance(clean);
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;
        // Keep reference on window to prevent Chrome GC bug
        window._activeUtterance = utterance;
        utterance.onend = () => { if (window._activeUtterance === utterance) window._activeUtterance = null; };
        utterance.onerror = () => { if (window._activeUtterance === utterance) window._activeUtterance = null; };
        window.speechSynthesis.speak(utterance);
      } catch (e) {
        console.warn("Native SpeechSynthesis error", e);
      }
    }
  }

  function playPauseBeep(step) {
    // Play rising blip cues during pause hold
    playSound('hover', 0.25 + step * 0.15);
  }

  /* ── STATS & LOCALSTORAGE ─────────────────────────────────────────────── */

  function loadStats() {
    try {
      const saved = localStorage.getItem(STATS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        state.stats.handsWon = Number(parsed.handsWon) || 0;
        state.stats.handsLost = Number(parsed.handsLost) || 0;
        state.stats.streak = Number(parsed.streak) || 0;
        state.stats.bestStreak = Number(parsed.bestStreak) || 0;
      }
    } catch (e) {
      console.warn("Could not load stats from localStorage", e);
    }
    updateScoreboardUI();
  }

  function saveStats() {
    try {
      localStorage.setItem(STATS_KEY, JSON.stringify(state.stats));
    } catch (e) {
      console.warn("Could not save stats to localStorage", e);
    }
    updateScoreboardUI();
  }

  function updateScoreboardUI() {
    const elWon = document.getElementById('stat-won');
    const elLost = document.getElementById('stat-lost');
    const elStreak = document.getElementById('stat-streak');
    if (elWon) elWon.textContent = state.stats.handsWon;
    if (elLost) elLost.textContent = state.stats.handsLost;
    if (elStreak) elStreak.textContent = state.stats.streak;
  }

  function resetStats() {
    state.stats.handsWon = 0;
    state.stats.handsLost = 0;
    state.stats.streak = 0;
    state.stats.bestStreak = 0;
    saveStats();
  }

  /* ── CARD ENGINE & HAND VALUATION ─────────────────────────────────────── */

  function createFreshDeck() {
    const deck = [];
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        deck.push({
          suit,
          rank,
          hidden: false,
          id: `${rank.symbol}_${suit.symbol}_${Math.random().toString(36).substring(2, 7)}`
        });
      }
    }
    return shuffle(deck);
  }

  function shuffle(cards) {
    const deck = [...cards];
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }

  function drawCard(hidden = false) {
    if (!state.deck || state.deck.length === 0) {
      state.deck = createFreshDeck();
    }
    const card = state.deck.pop();
    card.hidden = hidden;
    return card;
  }

  /**
   * Calculates Blackjack hand value with dynamic Ace scoring (11 or 1).
   * Hidden cards are ignored for valuation (for dealer hole card).
   */
  function calculateHandValue(hand) {
    if (!hand || !Array.isArray(hand)) {
      return { total: 0, isBust: false, isSoft: false, isBlackjack: false };
    }

    let total = 0;
    let aces = 0;
    let visibleCount = 0;

    for (const card of hand) {
      if (!card || card.hidden) continue;
      visibleCount++;
      total += (card.rank && card.rank.value) || 0;
      if (card.rank && card.rank.symbol === 'A') {
        aces++;
      }
    }

    while (total > 21 && aces > 0) {
      total -= 10;
      aces--;
    }

    const isBust = total > 21;
    const isSoft = aces > 0;
    const isBlackjack = (visibleCount === 2 && total === 21 && hand.length === 2 && !hand.some(c => c && c.hidden));

    return {
      total,
      isBust,
      isSoft,
      isBlackjack
    };
  }

  /* ── DOM RENDERING ────────────────────────────────────────────────────── */

  function renderCardElement(card) {
    const el = document.createElement('div');
    el.className = 'playing-card';

    // Only apply dealing animation once per card to prevent existing cards from re-animating
    if (card && !card._hasAnimated) {
      el.classList.add('card-deal-anim');
      card._hasAnimated = true;
    }

    if (!card || card.hidden) {
      el.classList.add('card-back');
      el.setAttribute('aria-label', 'Dealer hole card face down');
      return el;
    }

    const isRed = card.suit ? !!card.suit.isRed : false;
    const suitSymbol = card.suit ? card.suit.symbol : '♠';
    const suitName = card.suit ? card.suit.name : 'Spades';
    const rankSymbol = card.rank ? card.rank.symbol : '';
    const rankName = card.rank ? card.rank.name : rankSymbol;

    el.classList.add(isRed ? 'red' : 'black');
    el.setAttribute('aria-label', `${rankName} of ${suitName}`);

    // Top-left corner
    const topLeft = document.createElement('div');
    topLeft.className = 'card-corner top-left';
    topLeft.innerHTML = `<span class="card-rank">${rankSymbol}</span><span class="card-suit-mini">${suitSymbol}</span>`;

    // Center suit
    const centerSuit = document.createElement('div');
    centerSuit.className = 'card-center-suit';
    centerSuit.textContent = suitSymbol;

    // Bottom-right corner
    const bottomRight = document.createElement('div');
    bottomRight.className = 'card-corner bottom-right';
    bottomRight.innerHTML = `<span class="card-rank">${rankSymbol}</span><span class="card-suit-mini">${suitSymbol}</span>`;

    el.appendChild(topLeft);
    el.appendChild(centerSuit);
    el.appendChild(bottomRight);
    return el;
  }

  function updateTableUI() {
    // Render Dealer cards
    const dealerContainer = document.getElementById('dealer-cards');
    if (dealerContainer) {
      dealerContainer.innerHTML = '';
      state.dealerHand.forEach(card => {
        dealerContainer.appendChild(renderCardElement(card));
      });
    }

    // Render Player cards
    const playerContainer = document.getElementById('player-cards');
    if (playerContainer) {
      playerContainer.innerHTML = '';
      state.playerHand.forEach(card => {
        playerContainer.appendChild(renderCardElement(card));
      });
    }

    // Update Badges
    const pVal = calculateHandValue(state.playerHand);
    const dVal = calculateHandValue(state.dealerHand);

    const playerBadge = document.getElementById('player-badge');
    if (playerBadge) {
      playerBadge.textContent = pVal.total;
      playerBadge.className = 'hand-badge';
      if (pVal.isBust) playerBadge.classList.add('bust');
      if (pVal.isBlackjack) playerBadge.classList.add('blackjack');
    }

    const dealerBadge = document.getElementById('dealer-badge');
    if (dealerBadge) {
      dealerBadge.textContent = dVal.total;
      dealerBadge.className = 'hand-badge';
      if (dVal.isBust) dealerBadge.classList.add('bust');
      if (dVal.isBlackjack) dealerBadge.classList.add('blackjack');
    }
  }

  function setStatus(text, type = '') {
    const banner = document.getElementById('status-banner');
    const statusText = document.getElementById('status-text');
    if (statusText) statusText.textContent = text;
    if (banner) {
      banner.className = '';
      if (type) banner.classList.add(type);
    }
  }

  function updateButtonsForPhase() {
    const btnHit = document.getElementById('btn-hit');
    const btnStand = document.getElementById('btn-stand');
    const btnNext = document.getElementById('btn-next');
    const btnPause = document.getElementById('btn-pause');

    if (state.roundPhase === 'PLAYER_TURN') {
      if (btnHit) btnHit.style.display = 'inline-flex';
      if (btnStand) btnStand.style.display = 'inline-flex';
      if (btnNext) btnNext.style.display = 'none';
      if (btnPause) btnPause.style.display = 'inline-flex';
      updateScannables([btnHit, btnStand, btnPause]);
    } else if (state.roundPhase === 'ROUND_OVER') {
      if (btnHit) btnHit.style.display = 'none';
      if (btnStand) btnStand.style.display = 'none';
      if (btnNext) btnNext.style.display = 'inline-flex';
      if (btnPause) btnPause.style.display = 'inline-flex';
      updateScannables([btnNext, btnPause]);
    } else {
      // Dealing or dealer turn: no player play action buttons active
      if (btnHit) btnHit.style.display = 'none';
      if (btnStand) btnStand.style.display = 'none';
      if (btnNext) btnNext.style.display = 'none';
      if (btnPause) btnPause.style.display = 'inline-flex';
      updateScannables([btnPause]);
    }
  }

  /* ── ASYNC TIMERS CLEANUP ─────────────────────────────────────────────── */

  function clearDealTimeouts() {
    if (state.dealTimeouts && state.dealTimeouts.length) {
      state.dealTimeouts.forEach(t => clearTimeout(t));
      state.dealTimeouts = [];
    }
  }

  function clearDealerTimeout() {
    if (state.dealerActionTimeout) {
      clearTimeout(state.dealerActionTimeout);
      state.dealerActionTimeout = null;
    }
  }

  function clearAutoStandTimeout() {
    if (state.autoStandTimeout) {
      clearTimeout(state.autoStandTimeout);
      state.autoStandTimeout = null;
    }
  }

  function clearGameplayTimers() {
    clearDealTimeouts();
    clearDealerTimeout();
    clearAutoStandTimeout();
  }

  /* ── GAMEPLAY ROUND LOGIC ─────────────────────────────────────────────── */

  function startNewRound() {
    clearGameplayTimers();
    if (state.deck.length < 15) {
      state.deck = createFreshDeck();
    }
    state.roundPhase = 'DEALING';
    state.playerHand = [];
    state.dealerHand = [];

    updateTableUI();
    setStatus("Dealing cards...", "");
    updateButtonsForPhase();
    setFocus(0, false);

    // Deal 4 cards sequentially: Player, Dealer Up, Player, Dealer Hole
    state.dealTimeouts.push(setTimeout(() => {
      // 1. Player Card 1
      state.playerHand.push(drawCard(false));
      playSound('score', 0.4);
      updateTableUI();

      state.dealTimeouts.push(setTimeout(() => {
        // 2. Dealer Card 1 (Face Up)
        state.dealerHand.push(drawCard(false));
        playSound('score', 0.4);
        updateTableUI();

        state.dealTimeouts.push(setTimeout(() => {
          // 3. Player Card 2
          state.playerHand.push(drawCard(false));
          playSound('score', 0.4);
          updateTableUI();

          state.dealTimeouts.push(setTimeout(() => {
            // 4. Dealer Card 2 (Hole card face down)
            state.dealerHand.push(drawCard(true));
            playSound('score', 0.4);
            updateTableUI();

            state.dealTimeouts.push(setTimeout(() => {
              finishInitialDeal();
            }, 350));
          }, 350));
        }, 350));
      }, 350));
    }, 200));
  }

  function finishInitialDeal() {
    if (state.roundPhase !== 'DEALING') return;

    const pVal = calculateHandValue(state.playerHand);
    const dUp = state.dealerHand[0];

    // Check for natural Blackjack (21)
    if (pVal.isBlackjack) {
      // Reveal dealer's hole card immediately
      if (state.dealerHand[1]) {
        state.dealerHand[1].hidden = false;
      }
      updateTableUI();
      const dVal = calculateHandValue(state.dealerHand);

      if (dVal.isBlackjack || dVal.total === 21) {
        // Tie goes to the player!
        state.stats.handsWon++;
        state.stats.streak++;
        if (state.stats.streak > state.stats.bestStreak) state.stats.bestStreak = state.stats.streak;
        saveStats();

        setStatus("Blackjack tie! Tie goes to Player! You win!", "tie");
        playSound('win');
        speak("Blackjack tie! Tie goes to player! You win!");
      } else {
        state.stats.handsWon++;
        state.stats.streak++;
        if (state.stats.streak > state.stats.bestStreak) state.stats.bestStreak = state.stats.streak;
        saveStats();

        setStatus("Blackjack! Player wins!", "win");
        playSound('win');
        speak("Blackjack! Player wins!");
      }

      state.roundPhase = 'ROUND_OVER';
      updateButtonsForPhase();
      setFocus(0, false); // Focus Next Hand
      return;
    }

    // Normal player turn
    state.roundPhase = 'PLAYER_TURN';
    setStatus(`Your turn (Total: ${pVal.total}). Hit or Stand?`, "");
    updateButtonsForPhase();
    setFocus(0, false); // Focus Hit button

    const pCard1Name = (state.playerHand[0] && state.playerHand[0].rank) ? state.playerHand[0].rank.name : '';
    const pCard2Name = (state.playerHand[1] && state.playerHand[1].rank) ? state.playerHand[1].rank.name : '';
    const dUpName = (dUp && dUp.rank) ? dUp.rank.name : '';
    const speechText = `Player dealt ${pCard1Name} and ${pCard2Name}. Total ${pVal.total}. Dealer shows ${dUpName}. Hit or Stand?`;
    speak(speechText);
  }

  function handleHit() {
    if (state.roundPhase !== 'PLAYER_TURN') return;

    const card = drawCard(false);
    state.playerHand.push(card);
    playSound('score', 0.4);
    updateTableUI();

    const pVal = calculateHandValue(state.playerHand);

    if (pVal.isBust) {
      // Player busts immediately -> round ends in loss, dealer does NOT draw
      state.roundPhase = 'ROUND_OVER';
      state.stats.handsLost++;
      state.stats.streak = 0;
      saveStats();

      setStatus(`Player busts with ${pVal.total}! Dealer wins.`, "lose");
      playSound('bust');
      setTimeout(() => playSound('lose'), 400);

      speak(`You hit ${card.rank.name} of ${card.suit.name}. Total ${pVal.total}. Bust! Dealer wins.`);
      updateButtonsForPhase();
      setFocus(0, false); // Focus Next Hand
    } else if (pVal.total === 21) {
      // Automatically proceed to stand on 21 after brief visual clarity
      state.roundPhase = 'DEALER_TURN';
      updateButtonsForPhase();
      setStatus("21! Dealer's turn...", "");
      speak(`You hit ${card.rank.name} of ${card.suit.name}. Total 21.`);
      
      clearAutoStandTimeout();
      state.autoStandTimeout = setTimeout(() => {
        handleStand();
      }, 900);
    } else {
      setStatus(`Total: ${pVal.total}. Hit or Stand?`, "");
      speak(`You hit ${card.rank.name} of ${card.suit.name}. Total ${pVal.total}. Hit or Stand?`);
    }
  }

  function handleStand() {
    if (state.roundPhase !== 'PLAYER_TURN' && state.roundPhase !== 'DEALER_TURN') return;
    clearAutoStandTimeout();

    state.roundPhase = 'DEALER_TURN';
    updateButtonsForPhase();

    // Reveal Dealer hole card
    if (state.dealerHand[1]) {
      state.dealerHand[1].hidden = false;
    }
    playSound('score', 0.4);
    updateTableUI();

    const pVal = calculateHandValue(state.playerHand);
    const dVal = calculateHandValue(state.dealerHand);
    const holeRankName = (state.dealerHand[1] && state.dealerHand[1].rank) ? state.dealerHand[1].rank.name : '';
    const holeSuitName = (state.dealerHand[1] && state.dealerHand[1].suit) ? state.dealerHand[1].suit.name : '';

    setStatus(`Player stands on ${pVal.total}. Dealer reveals ${holeRankName}.`, "");
    speak(`Player stands on ${pVal.total}. Dealer reveals ${holeRankName} of ${holeSuitName}. Dealer total ${dVal.total}.`);

    clearDealerTimeout();
    state.dealerActionTimeout = setTimeout(() => {
      runDealerStep();
    }, 1200);
  }

  function runDealerStep() {
    if (state.roundPhase !== 'DEALER_TURN') return;

    let dVal = calculateHandValue(state.dealerHand);

    // Dealer hits on <= 16, stands on >= 17
    if (dVal.total < 17) {
      const card = drawCard(false);
      state.dealerHand.push(card);
      playSound('score', 0.4);
      updateTableUI();

      dVal = calculateHandValue(state.dealerHand);
      setStatus(`Dealer draws ${card.rank.name}. Dealer total: ${dVal.total}`, "");
      speak(`Dealer draws ${card.rank.name} of ${card.suit.name}. Dealer total ${dVal.total}.`);

      clearDealerTimeout();
      state.dealerActionTimeout = setTimeout(() => {
        runDealerStep();
      }, 1200);
    } else {
      // Dealer has finished drawing (>= 17 or bust)
      resolveHandOutcome();
    }
  }

  function resolveHandOutcome() {
    if (state.roundPhase !== 'DEALER_TURN') return;

    // Defensively ensure all dealer cards are revealed
    state.dealerHand.forEach(card => {
      if (card) card.hidden = false;
    });
    updateTableUI();

    const pVal = calculateHandValue(state.playerHand);
    const dVal = calculateHandValue(state.dealerHand);

    state.roundPhase = 'ROUND_OVER';

    if (dVal.isBust) {
      // Dealer Busts -> Player Wins
      state.stats.handsWon++;
      state.stats.streak++;
      if (state.stats.streak > state.stats.bestStreak) state.stats.bestStreak = state.stats.streak;
      saveStats();

      setStatus(`Dealer busts with ${dVal.total}! Player wins!`, "win");
      playSound('win');
      speak(`Dealer busts with ${dVal.total}! Player wins!`);
    } else if (pVal.total > dVal.total) {
      // Player higher -> Player Wins
      state.stats.handsWon++;
      state.stats.streak++;
      if (state.stats.streak > state.stats.bestStreak) state.stats.bestStreak = state.stats.streak;
      saveStats();

      setStatus(`Player has ${pVal.total}, Dealer has ${dVal.total}. Player wins!`, "win");
      playSound('win');
      speak(`Player has ${pVal.total}, Dealer has ${dVal.total}. Player wins!`);
    } else if (pVal.total === dVal.total) {
      // Equal total -> Tie goes to the player!
      state.stats.handsWon++;
      state.stats.streak++;
      if (state.stats.streak > state.stats.bestStreak) state.stats.bestStreak = state.stats.streak;
      saveStats();

      setStatus(`Tie at ${pVal.total}! Tie goes to Player! Player wins!`, "tie");
      playSound('win');
      speak(`Tie at ${pVal.total}! Player wins!`);
    } else {
      // Dealer higher -> Dealer Wins
      state.stats.handsLost++;
      state.stats.streak = 0;
      saveStats();

      setStatus(`Dealer has ${dVal.total}, Player has ${pVal.total}. Dealer wins.`, "lose");
      playSound('lose');
      speak(`Dealer has ${dVal.total}, Player has ${pVal.total}. Dealer wins.`);
    }

    updateButtonsForPhase();
    setFocus(0, false); // Focus Next Hand
  }

  /* ── NAVIGATION & SCREEN MANAGEMENT ───────────────────────────────────── */

  function setScreen(screenName) {
    // Clear active gameplay timers if moving to non-game or pause
    if (screenName !== 'game' && screenName !== 'pause') {
      clearGameplayTimers();
      if (screenName === 'menu') {
        state.roundPhase = 'IDLE';
      }
    } else if (screenName === 'pause') {
      clearGameplayTimers();
      clearPauseHoldTimers();
      showPauseHoldRing(false);
    }

    state.previousScreen = state.screen;
    state.screen = screenName;

    // Toggle screen DOM views
    const screens = {
      menu: document.getElementById('screen-menu'),
      game: document.getElementById('screen-game'),
      howto: document.getElementById('screen-howto'),
      settings: document.getElementById('screen-settings'),
      pause: document.getElementById('screen-pause')
    };

    Object.keys(screens).forEach(key => {
      if (screens[key]) {
        screens[key].classList.toggle('active', key === screenName);
      }
    });

    // Populate scannables & announce
    if (screenName === 'menu') {
      const items = Array.from(document.querySelectorAll('#main-menu-options .scannable'));
      updateScannables(items);
      setFocus(0, false);
      speak("Benny's Blackjack. Play Game, How to Play, Settings, or Exit Game.");
    } else if (screenName === 'game') {
      updateButtonsForPhase();
      setFocus(0, false);

      if (state.previousScreen === 'pause') {
        // Resume dealer turn drawing if paused during dealer turn
        if (state.roundPhase === 'DEALER_TURN') {
          clearDealerTimeout();
          // If dealer hole card was not revealed before pause (e.g. hit to 21 autoStand pause), reveal now
          if (state.dealerHand[1] && state.dealerHand[1].hidden) {
            handleStand();
          } else {
            state.dealerActionTimeout = setTimeout(() => {
              runDealerStep();
            }, 600);
          }
        } else if (state.roundPhase === 'DEALING' || state.roundPhase === 'IDLE') {
          startNewRound();
        }
      } else if (state.roundPhase === 'IDLE') {
        startNewRound();
      }
    } else if (screenName === 'howto') {
      const items = Array.from(document.querySelectorAll('#screen-howto .scannable'));
      updateScannables(items);
      setFocus(0, false);
      speak("How to play. Get as close to 21 as possible without busting. Aces count as 11 or 1. Dealer stands on 17. Ties go to the player.");
    } else if (screenName === 'settings') {
      updateSettingsDisplay();
      const items = Array.from(document.querySelectorAll('#screen-settings .scannable'));
      updateScannables(items);
      setFocus(0, false);
      speak("Settings.");
    } else if (screenName === 'pause') {
      const items = Array.from(document.querySelectorAll('#screen-pause .scannable'));
      updateScannables(items);
      setFocus(0, false);
      speak("Paused. Continue, Restart Hand, Settings, Main Menu, or Exit Game.");
    }

    restartAutoScan();
  }

  function updateSettingsDisplay() {
    const vm = window.NarbeVoiceManager;
    const sm = window.NarbeScanManager;
    const sa = window.SafeAudio;

    const elTTS = document.getElementById('val-tts');
    const elVoice = document.getElementById('val-voice');
    const elAutoScan = document.getElementById('val-autoscan');
    const elSpeed = document.getElementById('val-speed');
    const elSound = document.getElementById('val-sound');
    const elReset = document.getElementById('val-reset');

    if (elTTS && vm && typeof vm.getSettings === 'function') {
      elTTS.textContent = vm.getSettings().ttsEnabled ? 'On' : 'Off';
    }
    if (elVoice && vm && typeof vm.getCurrentVoice === 'function') {
      const curVoice = vm.getCurrentVoice();
      elVoice.textContent = vm.getVoiceDisplayName(curVoice);
    }
    if (elAutoScan && sm && typeof sm.getSettings === 'function') {
      elAutoScan.textContent = sm.getSettings().autoScan ? 'On — One Switch' : 'Off — Two Switches';
    }
    if (elSpeed && sm && typeof sm.getScanInterval === 'function') {
      elSpeed.textContent = (sm.getScanInterval() / 1000).toFixed(1) + 's';
    }
    if (elSound && sa && typeof sa.isEnabled === 'function') {
      elSound.textContent = sa.isEnabled() ? 'On' : 'Off';
    }
    if (elReset) {
      const isArmed = state.resetArmedTime && (Date.now() - state.resetArmedTime < 6000);
      elReset.textContent = isArmed ? 'Sure?' : 'Reset';
    }
  }

  function exitGame() {
    playSound('select');
    speak("Exiting game.");
    if (window.parent && window.parent !== window) {
      try {
        window.parent.postMessage({ action: 'focusBackButton' }, '*');
      } catch (e) {
        console.warn("Could not postMessage to parent", e);
      }
    } else {
      window.location.href = '../../../index.html';
    }
  }

  /* ── SCANNING ENGINE (UNIVERSAL HUB CONTRACT) ─────────────────────────── */

  function updateScannables(items) {
    state.scannables = (items || []).filter(el => el && el.offsetParent !== null && !el.disabled);
    if (state.scanIndex >= state.scannables.length) {
      state.scanIndex = Math.max(0, state.scannables.length - 1);
    }
  }

  function setFocus(index, speakFocused = true) {
    state.scannables.forEach((el, idx) => {
      el.classList.toggle('focused', idx === index);
    });

    state.scanIndex = index;

    if (index >= 0 && index < state.scannables.length) {
      const target = state.scannables[index];
      if (speakFocused) {
        playSound('hover', 0.2);
        announceFocusedItem(target);
      }
    }
  }

  function announceFocusedItem(el) {
    if (!el) return;
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) {
      speak(ariaLabel);
      return;
    }
    const btnText = el.querySelector && el.querySelector('.btn-text');
    if (btnText && btnText.textContent) {
      speak(btnText.textContent.trim());
      return;
    }
    const settingTitle = el.querySelector && el.querySelector('.setting-title');
    const settingVal = el.querySelector && el.querySelector('.setting-val');
    if (settingTitle && settingVal) {
      speak(`${settingTitle.textContent.trim()}: ${settingVal.textContent.trim()}`);
      return;
    }
    const text = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
    if (text) {
      speak(text);
    }
  }

  function step(delta = 1) {
    if (!state.scannables.length) return;
    if (state.scannables.length === 1) {
      setFocus(0, false);
      return;
    }
    let next = state.scanIndex + delta;
    if (next < 0) next = state.scannables.length - 1;
    if (next >= state.scannables.length) next = 0;
    setFocus(next, true);

    if (!state.didBackHold) {
      restartAutoScan();
    }
  }

  function activateFocused() {
    if (state.scanIndex < 0 || state.scanIndex >= state.scannables.length) {
      return;
    }
    const el = state.scannables[state.scanIndex];
    if (!el) return;

    playSound('select');
    executeAction(el.getAttribute('data-action'), el);
  }

  function executeAction(action, el) {
    if (!action) return;

    switch (action) {
      // Main menu
      case 'play':
        setScreen('game');
        break;
      case 'howto':
        setScreen('howto');
        break;
      case 'settings':
        setScreen('settings');
        break;
      case 'exit':
        exitGame();
        break;

      // In-game actions
      case 'hit':
        handleHit();
        break;
      case 'stand':
        handleStand();
        break;
      case 'next':
        startNewRound();
        break;
      case 'pause':
        setScreen('pause');
        break;

      // Howto actions
      case 'back-to-menu':
        setScreen('menu');
        break;

      // Settings actions
      case 'toggle-tts':
        if (window.NarbeVoiceManager) {
          window.NarbeVoiceManager.toggleTTS();
          updateSettingsDisplay();
          speak(window.NarbeVoiceManager.getSettings().ttsEnabled ? "Text to speech on" : "");
        }
        break;
      case 'cycle-voice':
        if (window.NarbeVoiceManager) {
          window.NarbeVoiceManager.cycleVoice();
          updateSettingsDisplay();
          const voice = window.NarbeVoiceManager.getCurrentVoice();
          speak(`Voice ${window.NarbeVoiceManager.getVoiceDisplayName(voice)}`);
        }
        break;
      case 'toggle-autoscan':
        if (window.NarbeScanManager) {
          window.NarbeScanManager.toggleAutoScan();
          updateSettingsDisplay();
          const autoOn = window.NarbeScanManager.getSettings().autoScan;
          speak(autoOn ? "Auto scan on. One switch. Enter plays." : "Auto scan off. Two switches. Space to scan, Enter to select.");
          restartAutoScan();
        }
        break;
      case 'cycle-speed':
        if (window.NarbeScanManager) {
          window.NarbeScanManager.cycleScanSpeed();
          updateSettingsDisplay();
          const speedSec = (window.NarbeScanManager.getScanInterval() / 1000).toFixed(0);
          speak(`Scan speed ${speedSec} seconds`);
          restartAutoScan();
        }
        break;
      case 'toggle-sound':
        if (window.SafeAudio) {
          const nowOn = !window.SafeAudio.isEnabled();
          window.SafeAudio.setEnabled(nowOn);
          updateSettingsDisplay();
          speak(nowOn ? "Sound effects on" : "Sound effects off");
        }
        break;
      case 'reset-stats':
        const now = Date.now();
        if (state.resetArmedTime && (now - state.resetArmedTime < 6000)) {
          resetStats();
          state.resetArmedTime = 0;
          updateSettingsDisplay();
          speak("Stats reset.");
        } else {
          state.resetArmedTime = now;
          updateSettingsDisplay();
          speak("Select again to erase all statistics.");
        }
        break;
      case 'back-settings':
        state.resetArmedTime = 0;
        setScreen(state.previousScreen === 'pause' ? 'pause' : 'menu');
        break;

      // Pause menu actions
      case 'pause-continue':
        setScreen('game');
        break;
      case 'pause-restart':
        clearGameplayTimers();
        state.roundPhase = 'IDLE';
        setScreen('game');
        break;
      case 'pause-settings':
        setScreen('settings');
        break;
      case 'pause-menu':
        setScreen('menu');
        break;
    }
  }

  /* ── AUTO SCAN CONTROLLER ─────────────────────────────────────────────── */

  function startAutoScan() {
    stopAutoScan();
    const sm = window.NarbeScanManager;
    if (!sm || !sm.getSettings || !sm.getSettings().autoScan) return;
    const interval = sm.getScanInterval ? sm.getScanInterval() : 2000;

    state.autoScanTimer = setInterval(() => {
      if (state.scannables.length > 1) {
        step(1);
      }
    }, interval);
  }

  function stopAutoScan() {
    if (state.autoScanTimer) {
      clearInterval(state.autoScanTimer);
      state.autoScanTimer = null;
    }
  }

  function restartAutoScan() {
    stopAutoScan();
    startAutoScan();
  }

  /* ── PAUSE HOLD PROGRESS RING ─────────────────────────────────────────── */

  function showPauseHoldRing(show) {
    const overlay = document.getElementById('pause-hold-indicator');
    const bar = document.getElementById('pause-ring-bar');
    if (!overlay || !bar) return;

    if (show) {
      overlay.classList.add('active');
    } else {
      overlay.classList.remove('active');
      bar.style.strokeDashoffset = 314.159;
    }
  }

  function updatePauseHoldProgress(elapsed) {
    const bar = document.getElementById('pause-ring-bar');
    if (!bar) return;
    const max = PAUSE_HOLD_MS;
    const progress = Math.min(1, Math.max(0, elapsed / max));
    const circumference = 314.159;
    bar.style.strokeDashoffset = circumference - (circumference * progress);
  }

  function clearPauseHoldTimers() {
    clearTimeout(state.pauseHoldTimeout);
    clearTimeout(state.pauseShowTimeout);
    clearInterval(state.pauseProgressTimer);
  }

  /* ── INPUT EVENT LISTENERS (KEYUP CONTRACT) ───────────────────────────── */

  let audioUnlocked = false;
  function unlockAudioEngine() {
    if (audioUnlocked) return;
    audioUnlocked = true;
    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.resume();
        const silent = new SpeechSynthesisUtterance('');
        silent.volume = 0;
        silent.rate = 10;
        window.speechSynthesis.speak(silent);
      } catch (e) {}
    }
  }

  function setupInputEvents() {
    // Keydown: track holds for backward scan and in-game pause
    window.addEventListener('keydown', (e) => {
      unlockAudioEngine();
      if (e.code === 'Space') {
        e.preventDefault();
        if (!state.spaceDownTime) {
          state.spaceDownTime = Date.now();
          state.didBackHold = false;

          // Start hold timer for backwards scan (~3s)
          state.backHoldTimeout = setTimeout(() => {
            state.didBackHold = true;
            step(-1);
            const sm = window.NarbeScanManager;
            const repeatRate = sm && sm.getScanInterval ? sm.getScanInterval() : 2000;
            state.backRepeatTimer = setInterval(() => {
              step(-1);
            }, repeatRate);
          }, SCAN_BACK_HOLD_MS);
        }
      } else if (e.code === 'Enter' || e.code === 'NumpadEnter') {
        e.preventDefault();
        if (!state.enterDownTime) {
          state.enterDownTime = Date.now();
          state.didPauseHold = false;
          state.pauseBeepStep = 0;

          // In-game pause hold (~5s)
          if (state.screen === 'game') {
            state.pauseShowTimeout = setTimeout(() => {
              showPauseHoldRing(true);
            }, PAUSE_HOLD_SHOW_MS);

            state.pauseProgressTimer = setInterval(() => {
              const elapsed = Date.now() - state.enterDownTime;
              updatePauseHoldProgress(elapsed);

              // Rising beeps each second
              const stepSec = Math.floor(elapsed / 1000);
              if (stepSec > state.pauseBeepStep && stepSec < 5) {
                state.pauseBeepStep = stepSec;
                playPauseBeep(stepSec);
              }
            }, 50);

            state.pauseHoldTimeout = setTimeout(() => {
              state.didPauseHold = true;
              clearPauseHoldTimers();
              showPauseHoldRing(false);
              setScreen('pause');
            }, PAUSE_HOLD_MS);
          }
        }
      }
    });

    // Keyup: execute actions on release
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        clearTimeout(state.backHoldTimeout);
        clearInterval(state.backRepeatTimer);
        state.spaceDownTime = 0;

        if (state.didBackHold) {
          state.didBackHold = false;
          return;
        }

        // Standard forward step
        step(1);
      } else if (e.code === 'Enter' || e.code === 'NumpadEnter') {
        e.preventDefault();
        clearPauseHoldTimers();
        showPauseHoldRing(false);
        state.enterDownTime = 0;

        if (state.didPauseHold) {
          state.didPauseHold = false;
          return;
        }

        // Standard select on release
        activateFocused();
      }
    });

    // Window blur: reset all hold states and timers so keys don't get stuck
    window.addEventListener('blur', () => {
      clearTimeout(state.backHoldTimeout);
      clearInterval(state.backRepeatTimer);
      state.spaceDownTime = 0;
      state.didBackHold = false;

      clearPauseHoldTimers();
      showPauseHoldRing(false);
      state.enterDownTime = 0;
      state.didPauseHold = false;
    });

    // Direct mouse / touch tap handling
    document.addEventListener('click', (e) => {
      unlockAudioEngine();
      const scannable = e.target.closest('.scannable');
      if (scannable && state.scannables.includes(scannable)) {
        const index = state.scannables.indexOf(scannable);
        if (index >= 0) {
          state.scanIndex = index;
          setFocus(index, false);
          activateFocused();
        }
      }
    });

    // Mouse hover updates visual focus (without spamming TTS)
    document.addEventListener('mouseover', (e) => {
      const scannable = e.target.closest('.scannable');
      if (scannable && state.scannables.includes(scannable)) {
        const index = state.scannables.indexOf(scannable);
        if (index >= 0 && index !== state.scanIndex) {
          state.scanIndex = index;
          state.scannables.forEach((el, idx) => el.classList.toggle('focused', idx === index));
        }
      }
    });
  }

  /* ── INITIALIZATION ───────────────────────────────────────────────────── */

  function init() {
    loadStats();
    state.deck = createFreshDeck();
    setupInputEvents();

    // Subscribe to scan manager changes (Auto scan on/off, scan speed)
    if (window.NarbeScanManager && typeof window.NarbeScanManager.subscribe === 'function') {
      window.NarbeScanManager.subscribe(() => {
        updateSettingsDisplay();
        restartAutoScan();
      });
    }

    // Subscribe to voice manager settings
    if (window.NarbeVoiceManager && typeof window.NarbeVoiceManager.onSettingsChange === 'function') {
      window.NarbeVoiceManager.onSettingsChange(() => {
        updateSettingsDisplay();
      });
    }

    // Start on Main Menu
    setScreen('menu');
  }

  // Launch when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Export game API for automated test runners
  window.BennysBlackjack = {
    calculateHandValue,
    createFreshDeck,
    shuffle,
    state,
    startNewRound,
    finishInitialDeal,
    handleHit,
    handleStand,
    runDealerStep,
    resolveHandOutcome,
    setScreen,
    resetStats,
    step,
    activateFocused,
    executeAction,
    updateSettingsDisplay,
    clearGameplayTimers
  };

})();
