/**
 * Test Suite for Benny's Blackjack
 * Runs in Node.js to verify core mechanics, Ace valuation, dealer rules, ties, stats, and accessibility.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('🧪 Running Benny\'s Blackjack Extended Adversarial Test Suite...\n');

// Mock browser environment
let eventListeners = {};
global.window = {
  addEventListener: (type, fn) => {
    if (!eventListeners[type]) eventListeners[type] = [];
    eventListeners[type].push(fn);
  },
  removeEventListener: (type, fn) => {
    if (eventListeners[type]) {
      eventListeners[type] = eventListeners[type].filter(cb => cb !== fn);
    }
  },
  SafeAudio: {
    play: () => {},
    isEnabled: () => true,
    setEnabled: () => {}
  },
  NarbeVoiceManager: {
    speak: () => {},
    getSettings: () => ({ ttsEnabled: true }),
    getCurrentVoice: () => ({ name: 'Default' }),
    getVoiceDisplayName: () => 'Default',
    toggleTTS: () => {},
    cycleVoice: () => {},
    onSettingsChange: () => {}
  },
  NarbeScanManager: {
    getSettings: () => ({ autoScan: false, scanSpeedIndex: 1 }),
    getScanInterval: () => 2000,
    toggleAutoScan: () => {},
    cycleScanSpeed: () => {},
    subscribe: () => {}
  },
  parent: null,
  location: { href: '' }
};

global.localStorage = {
  store: {},
  getItem(key) { return this.store[key] || null; },
  setItem(key, val) { this.store[key] = String(val); },
  removeItem(key) { delete this.store[key]; },
  clear() { this.store = {}; }
};

global.document = {
  readyState: 'complete',
  addEventListener: () => {},
  removeEventListener: () => {},
  createElement: (tag) => ({
    tagName: tag.toUpperCase(),
    className: '',
    classList: {
      add: () => {},
      remove: () => {},
      toggle: () => {}
    },
    setAttribute: () => {},
    getAttribute: () => null,
    style: {},
    innerHTML: '',
    appendChild: () => {}
  }),
  getElementById: (id) => ({
    id,
    textContent: '',
    className: '',
    classList: {
      add: () => {},
      remove: () => {},
      toggle: () => {}
    },
    setAttribute: () => {},
    getAttribute: () => null,
    style: {},
    innerHTML: '',
    appendChild: () => {}
  }),
  querySelectorAll: () => []
};

// Load the script
const scriptContent = fs.readFileSync(path.join(__dirname, 'script.js'), 'utf8');
eval(scriptContent);

const BJ = window.BennysBlackjack;

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ ${name}`);
    console.error(err);
    failed++;
  }
}

// ── 1. DECK GENERATION & SHUFFLE ──────────────────────────────────────────

test('Deck creates 52 distinct cards with 4 suits and 13 ranks each', () => {
  const deck = BJ.createFreshDeck();
  assert.strictEqual(deck.length, 52, 'Deck should contain exactly 52 cards');

  const suitsCount = {};
  const ranksCount = {};

  for (const card of deck) {
    suitsCount[card.suit.name] = (suitsCount[card.suit.name] || 0) + 1;
    ranksCount[card.rank.symbol] = (ranksCount[card.rank.symbol] || 0) + 1;
  }

  assert.strictEqual(suitsCount['Spades'], 13);
  assert.strictEqual(suitsCount['Hearts'], 13);
  assert.strictEqual(suitsCount['Diamonds'], 13);
  assert.strictEqual(suitsCount['Clubs'], 13);

  ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'].forEach(r => {
    assert.strictEqual(ranksCount[r], 4, `Rank ${r} should appear exactly 4 times`);
  });
});

test('Card values correspond to Blackjack rules', () => {
  const deck = BJ.createFreshDeck();
  const rankMap = {};
  deck.forEach(c => rankMap[c.rank.symbol] = c.rank.value);

  assert.strictEqual(rankMap['A'], 11);
  assert.strictEqual(rankMap['K'], 10);
  assert.strictEqual(rankMap['Q'], 10);
  assert.strictEqual(rankMap['J'], 10);
  assert.strictEqual(rankMap['10'], 10);
  assert.strictEqual(rankMap['9'], 9);
  assert.strictEqual(rankMap['2'], 2);
});

// ── 2. ACE VALUATION & HAND CALCULATIONS ──────────────────────────────────

test('Single Ace calculated as 11 when total <= 21 (Soft hand)', () => {
  const hand = [
    { rank: { symbol: 'A', value: 11 }, hidden: false },
    { rank: { symbol: '7', value: 7 }, hidden: false }
  ];
  const val = BJ.calculateHandValue(hand);
  assert.strictEqual(val.total, 18);
  assert.strictEqual(val.isSoft, true);
  assert.strictEqual(val.isBust, false);
  assert.strictEqual(val.isBlackjack, false);
});

test('Single Ace reduces to 1 when total exceeds 21 (Hard hand)', () => {
  const hand = [
    { rank: { symbol: 'A', value: 11 }, hidden: false },
    { rank: { symbol: '7', value: 7 }, hidden: false },
    { rank: { symbol: '8', value: 8 }, hidden: false }
  ];
  const val = BJ.calculateHandValue(hand);
  assert.strictEqual(val.total, 16); // 1 + 7 + 8
  assert.strictEqual(val.isSoft, false);
  assert.strictEqual(val.isBust, false);
});

test('Multiple Aces: Ace + Ace = 12', () => {
  const hand = [
    { rank: { symbol: 'A', value: 11 }, hidden: false },
    { rank: { symbol: 'A', value: 11 }, hidden: false }
  ];
  const val = BJ.calculateHandValue(hand);
  assert.strictEqual(val.total, 12); // 11 + 1
  assert.strictEqual(val.isSoft, true);
});

test('Multiple Aces: Ace + Ace + 9 = 21', () => {
  const hand = [
    { rank: { symbol: 'A', value: 11 }, hidden: false },
    { rank: { symbol: 'A', value: 11 }, hidden: false },
    { rank: { symbol: '9', value: 9 }, hidden: false }
  ];
  const val = BJ.calculateHandValue(hand);
  assert.strictEqual(val.total, 21); // 11 + 1 + 9
  assert.strictEqual(val.isSoft, true);
  assert.strictEqual(val.isBlackjack, false, '3 cards totaling 21 is not natural Blackjack');
});

test('Multiple Aces: 4 Aces = 14 (11 + 1 + 1 + 1)', () => {
  const hand = [
    { rank: { symbol: 'A', value: 11 }, hidden: false },
    { rank: { symbol: 'A', value: 11 }, hidden: false },
    { rank: { symbol: 'A', value: 11 }, hidden: false },
    { rank: { symbol: 'A', value: 11 }, hidden: false }
  ];
  const val = BJ.calculateHandValue(hand);
  assert.strictEqual(val.total, 14);
  assert.strictEqual(val.isSoft, true);
});

test('Multiple Aces with hard cards: 4 Aces + 8 = 12 (1 + 1 + 1 + 1 + 8)', () => {
  const hand = [
    { rank: { symbol: 'A', value: 11 }, hidden: false },
    { rank: { symbol: 'A', value: 11 }, hidden: false },
    { rank: { symbol: 'A', value: 11 }, hidden: false },
    { rank: { symbol: 'A', value: 11 }, hidden: false },
    { rank: { symbol: '8', value: 8 }, hidden: false }
  ];
  const val = BJ.calculateHandValue(hand);
  assert.strictEqual(val.total, 12);
  assert.strictEqual(val.isSoft, false);
  assert.strictEqual(val.isBust, false);
});

test('Natural Blackjack detection on 2 cards (Ace + 10/J/Q/K)', () => {
  const blackjackHands = [
    [{ rank: { symbol: 'A', value: 11 }, hidden: false }, { rank: { symbol: 'K', value: 10 }, hidden: false }],
    [{ rank: { symbol: 'A', value: 11 }, hidden: false }, { rank: { symbol: 'Q', value: 10 }, hidden: false }],
    [{ rank: { symbol: 'A', value: 11 }, hidden: false }, { rank: { symbol: 'J', value: 10 }, hidden: false }],
    [{ rank: { symbol: 'A', value: 11 }, hidden: false }, { rank: { symbol: '10', value: 10 }, hidden: false }]
  ];

  for (const hand of blackjackHands) {
    const val = BJ.calculateHandValue(hand);
    assert.strictEqual(val.total, 21);
    assert.strictEqual(val.isBlackjack, true, 'Should be recognized as Blackjack');
  }
});

test('Bust detection (> 21)', () => {
  const bustHand = [
    { rank: { symbol: '10', value: 10 }, hidden: false },
    { rank: { symbol: '7', value: 7 }, hidden: false },
    { rank: { symbol: '5', value: 5 }, hidden: false }
  ];
  const val = BJ.calculateHandValue(bustHand);
  assert.strictEqual(val.total, 22);
  assert.strictEqual(val.isBust, true);
});

test('Hidden hole card is excluded from value calculation until revealed', () => {
  const dealerHand = [
    { rank: { symbol: '7', value: 7 }, hidden: false },
    { rank: { symbol: 'K', value: 10 }, hidden: true }
  ];
  const unrevealedVal = BJ.calculateHandValue(dealerHand);
  assert.strictEqual(unrevealedVal.total, 7);

  dealerHand[1].hidden = false;
  const revealedVal = BJ.calculateHandValue(dealerHand);
  assert.strictEqual(revealedVal.total, 17);
});

// ── 3. RULES & TIE RESOLUTION (TIE GOES TO PLAYER) ────────────────────────

test('Tie goes to the player: Equal hand totals award Win to player', () => {
  BJ.state.stats.handsWon = 0;
  BJ.state.stats.handsLost = 0;
  BJ.state.stats.streak = 0;

  BJ.state.roundPhase = 'DEALER_TURN';
  BJ.state.playerHand = [
    { rank: { symbol: '10', name: 'Ten', value: 10 }, suit: { name: 'Spades', symbol: '♠', isRed: false }, hidden: false },
    { rank: { symbol: '8', name: 'Eight', value: 8 }, suit: { name: 'Hearts', symbol: '♥', isRed: true }, hidden: false }
  ];
  BJ.state.dealerHand = [
    { rank: { symbol: '10', name: 'Ten', value: 10 }, suit: { name: 'Clubs', symbol: '♣', isRed: false }, hidden: false },
    { rank: { symbol: '8', name: 'Eight', value: 8 }, suit: { name: 'Diamonds', symbol: '♦', isRed: true }, hidden: false }
  ];

  // Resolve outcome
  BJ.resolveHandOutcome();

  // Stats should reflect a win for the player on tie
  assert.strictEqual(BJ.state.stats.handsWon, 1, 'Player should win on tie');
  assert.strictEqual(BJ.state.stats.handsLost, 0);
  assert.strictEqual(BJ.state.stats.streak, 1);
  assert.strictEqual(BJ.state.roundPhase, 'ROUND_OVER');
});

test('Player Bust immediately loses without dealer drawing', () => {
  BJ.state.stats.handsWon = 0;
  BJ.state.stats.handsLost = 0;

  BJ.state.playerHand = [
    { rank: { symbol: '10', name: 'Ten', value: 10 }, suit: { name: 'Spades', symbol: '♠', isRed: false }, hidden: false },
    { rank: { symbol: '6', name: 'Six', value: 6 }, suit: { name: 'Hearts', symbol: '♥', isRed: true }, hidden: false }
  ];
  BJ.state.dealerHand = [
    { rank: { symbol: '5', name: 'Five', value: 5 }, suit: { name: 'Diamonds', symbol: '♦', isRed: true }, hidden: false },
    { rank: { symbol: '6', name: 'Six', value: 6 }, suit: { name: 'Clubs', symbol: '♣', isRed: false }, hidden: true }
  ];
  BJ.state.deck = [
    { rank: { symbol: '10', name: 'Ten', value: 10 }, suit: { name: 'Spades', symbol: '♠', isRed: false }, hidden: false }
  ];

  BJ.state.roundPhase = 'PLAYER_TURN';
  BJ.handleHit();

  const pVal = BJ.calculateHandValue(BJ.state.playerHand);
  assert.strictEqual(pVal.total, 26);
  assert.strictEqual(pVal.isBust, true);
  assert.strictEqual(BJ.state.roundPhase, 'ROUND_OVER');
  assert.strictEqual(BJ.state.stats.handsLost, 1);
  assert.strictEqual(BJ.state.dealerHand.length, 2, 'Dealer should not draw any cards after player bust');
});

test('Dealer Busts (> 21) awards Win to Player', () => {
  BJ.state.stats.handsWon = 0;
  BJ.state.stats.handsLost = 0;
  BJ.state.stats.streak = 0;

  BJ.state.roundPhase = 'DEALER_TURN';
  BJ.state.playerHand = [
    { rank: { symbol: '10', name: 'Ten', value: 10 }, suit: { name: 'Spades', symbol: '♠', isRed: false }, hidden: false },
    { rank: { symbol: '9', name: 'Nine', value: 9 }, suit: { name: 'Hearts', symbol: '♥', isRed: true }, hidden: false }
  ];
  BJ.state.dealerHand = [
    { rank: { symbol: '10', name: 'Ten', value: 10 }, suit: { name: 'Clubs', symbol: '♣', isRed: false }, hidden: false },
    { rank: { symbol: '6', name: 'Six', value: 6 }, suit: { name: 'Diamonds', symbol: '♦', isRed: true }, hidden: false },
    { rank: { symbol: '7', name: 'Seven', value: 7 }, suit: { name: 'Spades', symbol: '♠', isRed: false }, hidden: false }
  ];

  BJ.resolveHandOutcome();

  assert.strictEqual(BJ.state.stats.handsWon, 1, 'Player should win when dealer busts');
  assert.strictEqual(BJ.state.stats.handsLost, 0);
  assert.strictEqual(BJ.state.stats.streak, 1);
});

test('Dealer hits on <= 16 and stands on >= 17', () => {
  BJ.state.roundPhase = 'DEALER_TURN';
  BJ.state.playerHand = [
    { rank: { symbol: '10', name: 'Ten', value: 10 }, suit: { name: 'Spades', symbol: '♠', isRed: false }, hidden: false },
    { rank: { symbol: '8', name: 'Eight', value: 8 }, suit: { name: 'Hearts', symbol: '♥', isRed: true }, hidden: false }
  ];
  BJ.state.dealerHand = [
    { rank: { symbol: 'A', name: 'Ace', value: 11 }, suit: { name: 'Clubs', symbol: '♣', isRed: false }, hidden: false },
    { rank: { symbol: '5', name: 'Five', value: 5 }, suit: { name: 'Diamonds', symbol: '♦', isRed: true }, hidden: false }
  ]; // Total 16 -> must hit
  BJ.state.deck = [
    { rank: { symbol: '3', name: 'Three', value: 3 }, suit: { name: 'Hearts', symbol: '♥', isRed: true }, hidden: false }
  ];

  BJ.runDealerStep(); // draws 3 -> total becomes 19 (>= 17) -> finishes
  assert.strictEqual(BJ.state.dealerHand.length, 3);
  const dVal = BJ.calculateHandValue(BJ.state.dealerHand);
  assert.strictEqual(dVal.total, 19);
});

test('Stats persistence in localStorage across resets and plays', () => {
  BJ.state.stats.handsWon = 5;
  BJ.state.stats.handsLost = 2;
  BJ.state.stats.streak = 3;

  // Trigger reset
  BJ.resetStats();
  assert.strictEqual(BJ.state.stats.handsWon, 0);
  assert.strictEqual(BJ.state.stats.handsLost, 0);
  assert.strictEqual(BJ.state.stats.streak, 0);

  const stored = JSON.parse(localStorage.getItem('bennys_blackjack_stats'));
  assert.strictEqual(stored.handsWon, 0);
  assert.strictEqual(stored.handsLost, 0);
});

// ── 4. SCREEN NAVIGATION & ACCESSIBILITY SCANNING ─────────────────────────

test('Screen transitions update active screen and previous screen', () => {
  BJ.setScreen('menu');
  assert.strictEqual(BJ.state.screen, 'menu');

  BJ.setScreen('howto');
  assert.strictEqual(BJ.state.screen, 'howto');
  assert.strictEqual(BJ.state.previousScreen, 'menu');

  BJ.setScreen('settings');
  assert.strictEqual(BJ.state.screen, 'settings');
  assert.strictEqual(BJ.state.previousScreen, 'howto');

  BJ.setScreen('pause');
  assert.strictEqual(BJ.state.screen, 'pause');
  assert.strictEqual(BJ.state.previousScreen, 'settings');
});

test('Scanning step forward (+1) and backward (-1) wraps correctly', () => {
  const dummyElements = [
    { classList: { toggle: () => {} }, getAttribute: () => 'action-1', innerText: 'Item 1' },
    { classList: { toggle: () => {} }, getAttribute: () => 'action-2', innerText: 'Item 2' },
    { classList: { toggle: () => {} }, getAttribute: () => 'action-3', innerText: 'Item 3' }
  ];

  BJ.state.scannables = dummyElements;
  BJ.state.scanIndex = 0;

  BJ.step(1);
  assert.strictEqual(BJ.state.scanIndex, 1);

  BJ.step(1);
  assert.strictEqual(BJ.state.scanIndex, 2);

  BJ.step(1);
  assert.strictEqual(BJ.state.scanIndex, 0, 'Step should wrap around to index 0');

  BJ.step(-1);
  assert.strictEqual(BJ.state.scanIndex, 2, 'Backward step from 0 should wrap to end');
});

test('Exit Game sends focusBackButton postMessage to parent window', () => {
  let postedMessage = null;
  global.window.parent = {
    postMessage: (msg, origin) => {
      postedMessage = msg;
    }
  };

  // Trigger exit
  const exitBtn = { getAttribute: () => 'exit', innerText: 'Exit Game' };
  BJ.state.scannables = [exitBtn];
  BJ.state.scanIndex = 0;
  BJ.activateFocused();

  assert.deepStrictEqual(postedMessage, { action: 'focusBackButton' }, 'Should post focusBackButton to parent');
});

// ── 5. ADVERSARIAL EDGE CASE TESTS ────────────────────────────────────────

test('Keyboard events call preventDefault for Space and Enter', () => {
  let spacePrevented = false;
  let enterPrevented = false;

  const keydownListeners = eventListeners['keydown'] || [];
  assert(keydownListeners.length > 0, 'Keydown listeners should be registered');

  keydownListeners.forEach(listener => {
    listener({ code: 'Space', preventDefault: () => { spacePrevented = true; } });
    listener({ code: 'Enter', preventDefault: () => { enterPrevented = true; } });
  });

  assert.strictEqual(spacePrevented, true, 'Space keydown should call preventDefault');
  assert.strictEqual(enterPrevented, true, 'Enter keydown should call preventDefault');
});

test('Actions are blocked during DEALING, DEALER_TURN, and ROUND_OVER phases', () => {
  BJ.state.roundPhase = 'DEALING';
  const initialPlayerCardsCount = BJ.state.playerHand.length;
  BJ.handleHit();
  assert.strictEqual(BJ.state.playerHand.length, initialPlayerCardsCount, 'Hit should be ignored during DEALING');

  BJ.handleStand();
  assert.strictEqual(BJ.state.roundPhase, 'DEALING', 'Stand should be ignored during DEALING');

  BJ.state.roundPhase = 'ROUND_OVER';
  BJ.handleHit();
  assert.strictEqual(BJ.state.playerHand.length, initialPlayerCardsCount, 'Hit should be ignored when ROUND_OVER');
});

test('Pausing during dealer turn suspends dealer drawings cleanly', () => {
  BJ.state.roundPhase = 'DEALER_TURN';
  BJ.state.dealerActionTimeout = setTimeout(() => {}, 10000);

  BJ.setScreen('pause');
  assert.strictEqual(BJ.state.dealerActionTimeout, null, 'Dealer action timeout should be cleared on pause');
});

test('2-Step stats reset arms and executes on second confirmation', () => {
  BJ.state.stats.handsWon = 10;
  BJ.state.resetArmedTime = 0;

  // Step 1: Arm
  BJ.executeAction('reset-stats');
  assert(BJ.state.resetArmedTime > 0, 'Stats reset should be armed');
  assert.strictEqual(BJ.state.stats.handsWon, 10, 'Stats should not be erased on step 1');

  // Step 2: Confirm
  BJ.executeAction('reset-stats');
  assert.strictEqual(BJ.state.stats.handsWon, 0, 'Stats should be reset on step 2');
  assert.strictEqual(BJ.state.resetArmedTime, 0, 'Reset armed state should be cleared');
});

test('Natural 21 Blackjack tie awards win to player immediately on deal', () => {
  BJ.state.stats.handsWon = 0;
  BJ.state.roundPhase = 'DEALING';
  BJ.state.playerHand = [
    { rank: { symbol: 'A', name: 'Ace', value: 11 }, suit: { name: 'Spades', symbol: '♠' }, hidden: false },
    { rank: { symbol: 'K', name: 'King', value: 10 }, suit: { name: 'Hearts', symbol: '♥' }, hidden: false }
  ];
  BJ.state.dealerHand = [
    { rank: { symbol: 'A', name: 'Ace', value: 11 }, suit: { name: 'Clubs', symbol: '♣' }, hidden: false },
    { rank: { symbol: 'Q', name: 'Queen', value: 10 }, suit: { name: 'Diamonds', symbol: '♦' }, hidden: true }
  ];

  BJ.finishInitialDeal();

  assert.strictEqual(BJ.state.roundPhase, 'ROUND_OVER');
  assert.strictEqual(BJ.state.dealerHand[1].hidden, false, 'Dealer hole card should be revealed');
  assert.strictEqual(BJ.state.stats.handsWon, 1, 'Player should win on natural blackjack tie');
});

test('Pausing during hit-to-21 autoStand transition properly reveals dealer hole card upon resuming', () => {
  BJ.state.roundPhase = 'PLAYER_TURN';
  BJ.state.playerHand = [
    { rank: { symbol: '10', name: 'Ten', value: 10 }, suit: { name: 'Spades', symbol: '♠' }, hidden: false },
    { rank: { symbol: '6', name: 'Six', value: 6 }, suit: { name: 'Hearts', symbol: '♥' }, hidden: false }
  ];
  BJ.state.dealerHand = [
    { rank: { symbol: '10', name: 'Ten', value: 10 }, suit: { name: 'Clubs', symbol: '♣' }, hidden: false },
    { rank: { symbol: '7', name: 'Seven', value: 7 }, suit: { name: 'Diamonds', symbol: '♦' }, hidden: true }
  ];
  BJ.state.deck = [
    { rank: { symbol: '5', name: 'Five', value: 5 }, suit: { name: 'Hearts', symbol: '♥' }, hidden: false }
  ];

  // Hit to reach 21 (10 + 6 + 5 = 21)
  BJ.handleHit();
  assert.strictEqual(BJ.state.roundPhase, 'DEALER_TURN');
  assert.strictEqual(BJ.state.dealerHand[1].hidden, true, 'Hole card should still be hidden during transition buffer');

  // Pause during the 900ms buffer
  BJ.setScreen('pause');
  assert.strictEqual(BJ.state.autoStandTimeout, null, 'Auto-stand timeout should be cleared on pause');

  // Resume game
  BJ.setScreen('game');
  assert.strictEqual(BJ.state.dealerHand[1].hidden, false, 'Hole card must be revealed upon resuming dealer turn');
  const dVal = BJ.calculateHandValue(BJ.state.dealerHand);
  assert.strictEqual(dVal.total, 17, 'Dealer total should count revealed hole card (10 + 7 = 17)');
});

test('Pausing during DEALING phase cancels all dealing timeouts immediately', () => {
  BJ.state.dealTimeouts = [
    setTimeout(() => {}, 5000),
    setTimeout(() => {}, 5000)
  ];
  BJ.state.roundPhase = 'DEALING';

  BJ.setScreen('pause');
  assert.strictEqual(BJ.state.dealTimeouts.length, 0, 'All dealing timeouts must be cleared on pause');
});

test('Restart Hand from pause menu resets phase and initializes a clean round', () => {
  BJ.state.roundPhase = 'DEALER_TURN';
  BJ.setScreen('pause');

  BJ.executeAction('pause-restart');
  assert.strictEqual(BJ.state.screen, 'game');
  assert.strictEqual(BJ.state.roundPhase, 'DEALING', 'Phase should transition cleanly to DEALING');
  assert.strictEqual(BJ.state.dealerActionTimeout, null, 'No leftover dealer action timeouts should exist');
});

test('Window blur cancels active Space backward scan and Enter pause hold timers', () => {
  const blurListeners = eventListeners['blur'] || [];
  assert(blurListeners.length > 0, 'Blur listener must be registered on window');

  BJ.state.spaceDownTime = Date.now();
  BJ.state.didBackHold = true;
  BJ.state.enterDownTime = Date.now();
  BJ.state.didPauseHold = true;

  blurListeners.forEach(listener => listener());

  assert.strictEqual(BJ.state.spaceDownTime, 0, 'Space down time must reset on blur');
  assert.strictEqual(BJ.state.didBackHold, false, 'didBackHold must reset on blur');
  assert.strictEqual(BJ.state.enterDownTime, 0, 'Enter down time must reset on blur');
  assert.strictEqual(BJ.state.didPauseHold, false, 'didPauseHold must reset on blur');
});

test('Auto Scan does not cycle when there is only 1 scannable item', () => {
  const singleItem = { classList: { toggle: () => {} }, getAttribute: () => 'pause', innerText: 'Pause' };
  BJ.state.scannables = [singleItem];
  BJ.state.scanIndex = 0;

  BJ.step(1);
  assert.strictEqual(BJ.state.scanIndex, 0, 'Scan index should remain at 0 for single item');
});

test('resolveHandOutcome ensures all dealer cards are revealed and counted', () => {
  BJ.state.stats.handsWon = 0;
  BJ.state.roundPhase = 'DEALER_TURN';
  BJ.state.playerHand = [
    { rank: { symbol: '10', name: 'Ten', value: 10 }, suit: { name: 'Spades', symbol: '♠' }, hidden: false },
    { rank: { symbol: '9', name: 'Nine', value: 9 }, suit: { name: 'Hearts', symbol: '♥' }, hidden: false }
  ];
  BJ.state.dealerHand = [
    { rank: { symbol: '10', name: 'Ten', value: 10 }, suit: { name: 'Clubs', symbol: '♣' }, hidden: false },
    { rank: { symbol: '8', name: 'Eight', value: 8 }, suit: { name: 'Diamonds', symbol: '♦' }, hidden: true }
  ];

  BJ.resolveHandOutcome();
  assert.strictEqual(BJ.state.dealerHand[1].hidden, false, 'Dealer hole card must be revealed in outcome');
  assert.strictEqual(BJ.state.stats.handsWon, 1, 'Player with 19 should beat dealer with 18');
});

// ── 6. COMPREHENSIVE COMBINATORIAL & SETTINGS COVERAGE ────────────────────

test('calculateHandValue handles empty/null hands and 5-6 Aces correctly', () => {
  assert.strictEqual(BJ.calculateHandValue(null).total, 0);
  assert.strictEqual(BJ.calculateHandValue([]).total, 0);

  // 5 Aces = 11 + 1 + 1 + 1 + 1 = 15
  const fiveAces = Array(5).fill({ rank: { symbol: 'A', value: 11 }, hidden: false });
  assert.strictEqual(BJ.calculateHandValue(fiveAces).total, 15);
  assert.strictEqual(BJ.calculateHandValue(fiveAces).isSoft, true);

  // 6 Aces = 11 + 1 + 1 + 1 + 1 + 1 = 16
  const sixAces = Array(6).fill({ rank: { symbol: 'A', value: 11 }, hidden: false });
  assert.strictEqual(BJ.calculateHandValue(sixAces).total, 16);

  // A + A + A + 8 = 11 + 1 + 1 + 8 = 21
  const threeAcesEight = [
    { rank: { symbol: 'A', value: 11 }, hidden: false },
    { rank: { symbol: 'A', value: 11 }, hidden: false },
    { rank: { symbol: 'A', value: 11 }, hidden: false },
    { rank: { symbol: '8', value: 8 }, hidden: false }
  ];
  assert.strictEqual(BJ.calculateHandValue(threeAcesEight).total, 21);
  assert.strictEqual(BJ.calculateHandValue(threeAcesEight).isSoft, true);
  assert.strictEqual(BJ.calculateHandValue(threeAcesEight).isBlackjack, false);
});

test('Dealer stands on soft 17 (Ace + 6)', () => {
  BJ.state.stats.handsWon = 0;
  BJ.state.stats.handsLost = 0;
  BJ.state.roundPhase = 'DEALER_TURN';
  BJ.state.playerHand = [
    { rank: { symbol: '10', name: 'Ten', value: 10 }, hidden: false },
    { rank: { symbol: '7', name: 'Seven', value: 7 }, hidden: false }
  ];
  BJ.state.dealerHand = [
    { rank: { symbol: 'A', name: 'Ace', value: 11 }, hidden: false },
    { rank: { symbol: '6', name: 'Six', value: 6 }, hidden: false }
  ]; // Total 17 -> must stand (stands on >= 17)

  BJ.runDealerStep();
  assert.strictEqual(BJ.state.dealerHand.length, 2, 'Dealer should stand on 17 without drawing');
  assert.strictEqual(BJ.state.roundPhase, 'ROUND_OVER');
  assert.strictEqual(BJ.state.stats.handsWon, 1, 'Tie at 17 goes to player');
});

test('Multiple tie totals resolve as player wins', () => {
  const tieTotals = [17, 18, 19, 20, 21];

  for (const total of tieTotals) {
    BJ.state.stats.handsWon = 0;
    BJ.state.roundPhase = 'DEALER_TURN';
    BJ.state.playerHand = [{ rank: { symbol: String(total), value: total }, hidden: false }];
    BJ.state.dealerHand = [{ rank: { symbol: String(total), value: total }, hidden: false }];

    BJ.resolveHandOutcome();
    assert.strictEqual(BJ.state.stats.handsWon, 1, `Tie at ${total} should award Win to player`);
  }
});

test('Settings actions trigger appropriate managers', () => {
  let ttsToggled = false;
  let voiceCycled = false;
  let autoScanToggled = false;
  let speedCycled = false;
  let soundEnabled = false;

  window.NarbeVoiceManager.toggleTTS = () => { ttsToggled = true; };
  window.NarbeVoiceManager.cycleVoice = () => { voiceCycled = true; };
  window.NarbeScanManager.toggleAutoScan = () => { autoScanToggled = true; };
  window.NarbeScanManager.cycleScanSpeed = () => { speedCycled = true; };
  window.SafeAudio.setEnabled = (val) => { soundEnabled = val; };

  BJ.executeAction('toggle-tts');
  assert.strictEqual(ttsToggled, true, 'toggle-tts should call NarbeVoiceManager.toggleTTS');

  BJ.executeAction('cycle-voice');
  assert.strictEqual(voiceCycled, true, 'cycle-voice should call NarbeVoiceManager.cycleVoice');

  BJ.executeAction('toggle-autoscan');
  assert.strictEqual(autoScanToggled, true, 'toggle-autoscan should call NarbeScanManager.toggleAutoScan');

  BJ.executeAction('cycle-speed');
  assert.strictEqual(speedCycled, true, 'cycle-speed should call NarbeScanManager.cycleScanSpeed');

  BJ.executeAction('toggle-sound');
  assert.strictEqual(soundEnabled, false, 'toggle-sound should toggle SafeAudio');
});

test('HTML file contains all required accessible UI containers and IDs', () => {
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  const requiredIds = [
    'app-header', 'scoreboard-banner', 'stat-won', 'stat-lost', 'stat-streak',
    'screen-menu', 'screen-game', 'screen-howto', 'screen-settings', 'screen-pause',
    'status-banner', 'status-text', 'blackjack-table',
    'dealer-area', 'dealer-badge', 'dealer-cards',
    'player-area', 'player-badge', 'player-cards',
    'in-game-actions', 'btn-hit', 'btn-stand', 'btn-next', 'btn-pause',
    'val-tts', 'val-voice', 'val-autoscan', 'val-speed', 'val-sound', 'val-reset',
    'pause-hold-indicator', 'pause-ring-bar', 'app-footer'
  ];

  requiredIds.forEach(id => {
    assert(html.includes(`id="${id}"`), `index.html must contain element with id="${id}"`);
  });
});

console.log(`\nResults: ${passed} passed, ${failed} failed.`);

if (failed > 0) {
  process.exit(1);
} else {
  console.log('🎉 All automated tests passed successfully!\n');
  process.exit(0);
}

