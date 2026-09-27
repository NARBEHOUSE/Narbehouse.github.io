// Prediction system for GitHub Pages using localStorage-first approach
class LocalPredictionSystem {
  constructor() {
    this.baseData = { frequent_words: {}, bigrams: {}, trigrams: {} };
    this.userData = { frequent_words: {}, bigrams: {}, trigrams: {} };
    this.mergedData = { frequent_words: {}, bigrams: {}, trigrams: {} };
    this.dataLoaded = false;
    this.ready = this.initializeData();
  }

  async initializeData() {
    // Try to load user data from localStorage first
    this.loadUserData();

    // Load base data from GitHub
    await this.loadBaseData();

    // Merge the data
    this.mergeData();

    this.dataLoaded = true;
    window.dispatchEvent(new Event('benny-predictions-ready'));
  }

  loadUserData() {
    try {
      const stored = localStorage.getItem('userKeyboardData');
      if (stored) {
        this.userData = JSON.parse(stored);
      }
    } catch (error) {
      this.userData = { frequent_words: {}, bigrams: {}, trigrams: {} };
    }
  }

  async loadBaseData() {
    let cached;
    try {
      const value = localStorage.getItem('baseKeyboardData');
      if (value) cached = JSON.parse(value);
      const time = Number(localStorage.getItem('baseKeyboardDataTime'));
      if (cached?.frequent_words && Date.now() - time < 86400000) { this.baseData = cached; return; }
    } catch { /* The bundled dictionary also works when storage is unavailable. */ }
    try {
      const response = await fetch('./web_keyboard_predictions.json');
      if (!response.ok) throw Error('Dictionary unavailable');
      const data = await response.json();
      if (!data?.frequent_words) throw Error('Invalid dictionary');
      this.baseData = data;
      try {
        localStorage.setItem('baseKeyboardData', JSON.stringify(data));
        localStorage.setItem('baseKeyboardDataTime', String(Date.now()));
      } catch { /* PWA asset caching does not require localStorage quota. */ }
    } catch {
      if (cached?.frequent_words) this.baseData = cached;
    }
  }

  mergeData() {
    // Create a merged dataset that prioritizes user data
    this.mergedData = {
      frequent_words: { ...this.baseData.frequent_words },
      bigrams: { ...this.baseData.bigrams },
      trigrams: { ...this.baseData.trigrams }
    };

    // Merge user's frequent words with higher weight
    for (const [word, userData] of Object.entries(this.userData.frequent_words || {})) {
      if (this.mergedData.frequent_words[word]) {
        // Combine counts, giving user data 3x weight
        const baseCount = this.mergedData.frequent_words[word].count || 0;
        const userCount = (userData.count || 0) * 3;
        this.mergedData.frequent_words[word] = {
          count: baseCount + userCount,
          last_used: userData.last_used || this.mergedData.frequent_words[word].last_used,
          user_count: userData.count || 0
        };
      } else {
        // New word from user
        this.mergedData.frequent_words[word] = {
          ...userData,
          count: (userData.count || 0) * 3,
          user_count: userData.count || 0
        };
      }
    }

    // Merge bigrams with user priority
    for (const [bigram, userData] of Object.entries(this.userData.bigrams || {})) {
      if (this.mergedData.bigrams[bigram]) {
        const baseCount = this.mergedData.bigrams[bigram].count || 0;
        const userCount = (userData.count || 0) * 3;
        this.mergedData.bigrams[bigram] = {
          count: baseCount + userCount,
          last_used: userData.last_used || this.mergedData.bigrams[bigram].last_used,
          user_count: userData.count || 0
        };
      } else {
        this.mergedData.bigrams[bigram] = {
          ...userData,
          count: (userData.count || 0) * 3,
          user_count: userData.count || 0
        };
      }
    }

    // Merge trigrams with user priority
    for (const [trigram, userData] of Object.entries(this.userData.trigrams || {})) {
      if (this.mergedData.trigrams[trigram]) {
        const baseCount = this.mergedData.trigrams[trigram].count || 0;
        const userCount = (userData.count || 0) * 3;
        this.mergedData.trigrams[trigram] = {
          count: baseCount + userCount,
          last_used: userData.last_used || this.mergedData.trigrams[trigram].last_used,
          user_count: userData.count || 0
        };
      } else {
        this.mergedData.trigrams[trigram] = {
          ...userData,
          count: (userData.count || 0) * 3,
          user_count: userData.count || 0
        };
      }
    }

  }

  calculateScore(data, isUserData = false) {
    // Calculate a score based on frequency and recency
    const count = data.count || 0;
    const userCount = data.user_count || 0;
    const lastUsed = data.last_used ? new Date(data.last_used) : new Date(0);
    const daysSinceUse = (Date.now() - lastUsed.getTime()) / (1000 * 60 * 60 * 24);

    // Recency boost: more recent = higher score
    const recencyMultiplier = Math.max(0.5, 1 - (daysSinceUse / 365));

    // User data gets MASSIVE weight - increase from 5x to 100x for absolute priority
    const userMultiplier = userCount > 0 ? 100 : 1;

    return count * recencyMultiplier * userMultiplier;
  }

  // Keep older cached callers working during a PWA update.
  async getHybridPredictions(buffer) {
    return this.getLocalPredictions(buffer);
  }

  async getLocalPredictions(buffer) {
    // Use mergedData instead of webData
    const tail = buffer.toUpperCase().replace(/\|/g, '').split(/[.!?\n]/).pop();
    const hasTrailingSpace = /\s$/.test(tail);
    const words = tail.match(/[A-Z]+(?:'[A-Z]+)*/g) || [];
    const cleaned = words.join(' ');


    const DEFAULT_WORDS = ["YES", "NO", "HELP", "THE", "I", "YOU"];

    if (!words.length) {
      return DEFAULT_WORDS;
    }

    let context = '';
    let currentWord = '';

    if (hasTrailingSpace) {
      context = cleaned;
      currentWord = '';
    } else {
      currentWord = words[words.length - 1];
      context = words.slice(0, -1).join(' ');
    }


    // TIER 1: N-gram predictions from merged data
    const predictionsNgram = {};

    if (context && (hasTrailingSpace || context !== currentWord)) {
      const ctxWords = context.split(' ');

      // Trigrams - highest priority
      if (ctxWords.length >= 2) {
        const triCtx = ctxWords.slice(-2).join(' ');

        for (const [key, data] of Object.entries(this.mergedData.trigrams || {})) {
          const trigramParts = key.split(' ');
          if (trigramParts.length === 3) {
            const trigramContext = trigramParts.slice(0, 2).join(' ');
            const nextWord = trigramParts[2];

            if (trigramContext === triCtx) {
              if ((!currentWord || nextWord.startsWith(currentWord)) && nextWord.length >= 2) {
                const score = this.calculateScore(data) * 10000000;
                predictionsNgram[nextWord] = (predictionsNgram[nextWord] || 0) + score;
              }
            }
          }
        }
      }

      // Bigrams - medium priority
      if (ctxWords.length >= 1) {
        const biCtx = ctxWords[ctxWords.length - 1];

        for (const [key, data] of Object.entries(this.mergedData.bigrams || {})) {
          if (key.startsWith(biCtx + ' ')) {
            const nextWord = key.split(' ').pop();
            if ((!currentWord || nextWord.startsWith(currentWord)) && nextWord.length >= 2) {
              const score = this.calculateScore(data) * 500000;
              predictionsNgram[nextWord] = (predictionsNgram[nextWord] || 0) + score;
            }
          }
        }
      }
    }

    // TIER 2: Frequent word completions (for partial words)
    const predictionsFreq = {};
    if (currentWord && currentWord.length >= 1) {

      // Check ALL words in merged data (which includes user data with high priority)
      for (const [word, data] of Object.entries(this.mergedData.frequent_words || {})) {
        // Check if word starts with the current partial word
        if (word.startsWith(currentWord) && word !== currentWord && word.length >= 2) {
          // Calculate score with user data getting massive boost
          const score = this.calculateScore(data) * 100000;
          predictionsFreq[word] = score;

          // Special logging for user words
          if (data.user_count && data.user_count > 0) {
          }
        }
      }

    }

    // TIER 3: Most frequent words (when after a space with no partial word)
    const predictionsCommon = {};
    if (hasTrailingSpace && !currentWord) {
      // Sort frequent words by score (frequency + recency)
      const sortedWords = Object.entries(this.mergedData.frequent_words || {})
        .filter(([word, data]) => word.length >= 2)
        .map(([word, data]) => [word, this.calculateScore(data)])
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20);

      for (const [word, score] of sortedWords) {
        predictionsCommon[word] = score * 10000;
      }
    }

    // Combine all predictions
    let finalPredictions = [];

    // First add n-gram predictions (highest priority)
    const sortedNgrams = Object.entries(predictionsNgram)
      .sort((a, b) => b[1] - a[1])
      .map(([word]) => word);
    finalPredictions.push(...sortedNgrams);

    // Then add frequency-based completions
    if (finalPredictions.length < 6) {
      const sortedFreq = Object.entries(predictionsFreq)
        .sort((a, b) => b[1] - a[1])
        .map(([word]) => word);

      for (const word of sortedFreq) {
        if (!finalPredictions.includes(word)) {
          finalPredictions.push(word);
          if (finalPredictions.length >= 6) break;
        }
      }
    }

    // Then add common words
    if (finalPredictions.length < 6) {
      const sortedCommon = Object.entries(predictionsCommon)
        .sort((a, b) => b[1] - a[1])
        .map(([word]) => word);

      for (const word of sortedCommon) {
        if (!finalPredictions.includes(word)) {
          finalPredictions.push(word);
          if (finalPredictions.length >= 6) break;
        }
      }
    }

    // Finally, add default words if still need more
    for (const word of DEFAULT_WORDS) {
      if (finalPredictions.length >= 6) break;
      if (!finalPredictions.includes(word)) {
        // If we're typing a partial word, only show defaults that match
        if (currentWord) {
          if (word.startsWith(currentWord)) {
            finalPredictions.push(word);
          }
        } else {
          finalPredictions.push(word);
        }
      }
    }

    // A completed word is not useful as its own completion or next suggestion.
    const lastWord = words[words.length - 1];
    finalPredictions = finalPredictions.filter(word => word !== lastWord);

    // Ensure we always return 6 predictions (empty strings if needed)
    while (finalPredictions.length < 6) {
      finalPredictions.push('');
    }

    return finalPredictions.slice(0, 6);
  }

  recordLocalWord(word) {
    try {
      const upperWord = word.toUpperCase();
      const timestamp = new Date().toISOString();

      // Update user data
      if (!this.userData.frequent_words) {
        this.userData.frequent_words = {};
      }

      if (!this.userData.frequent_words[upperWord]) {
        this.userData.frequent_words[upperWord] = { count: 0, last_used: timestamp };
      }
      this.userData.frequent_words[upperWord].count++;
      this.userData.frequent_words[upperWord].last_used = timestamp;


      // Save to localStorage IMMEDIATELY
      this.saveUserData();

      // Re-merge data to reflect changes immediately
      this.mergeData();

    } catch (error) {
    }
  }

  recordNgram(context, nextWord) {
    try {
      const ctxWords = context.toUpperCase().split(' ').filter(w => w);
      const nextUpper = nextWord.toUpperCase();
      const timestamp = new Date().toISOString();

      // Record bigram in user data
      if (ctxWords.length >= 1) {
        const bigramKey = `${ctxWords[ctxWords.length - 1]} ${nextUpper}`;
        if (!this.userData.bigrams[bigramKey]) {
          this.userData.bigrams[bigramKey] = { count: 0, last_used: timestamp };
        }
        this.userData.bigrams[bigramKey].count++;
        this.userData.bigrams[bigramKey].last_used = timestamp;
      }

      // Record trigram in user data
      if (ctxWords.length >= 2) {
        const trigramKey = `${ctxWords.slice(-2).join(' ')} ${nextUpper}`;
        if (!this.userData.trigrams[trigramKey]) {
          this.userData.trigrams[trigramKey] = { count: 0, last_used: timestamp };
        }
        this.userData.trigrams[trigramKey].count++;
        this.userData.trigrams[trigramKey].last_used = timestamp;
      }

      // Save to localStorage
      this.saveUserData();

      // Re-merge data
      this.mergeData();
    } catch (error) {
    }
  }

  saveUserData() {
    try {
      // Clean up old entries (optional: remove items not used in 90 days)
      const THREE_MONTHS = 90 * 24 * 60 * 60 * 1000;
      const now = Date.now();

      // Clean old words with very low counts
      for (const [word, data] of Object.entries(this.userData.frequent_words)) {
        if (data.last_used) {
          const lastUsed = new Date(data.last_used).getTime();
          if (now - lastUsed > THREE_MONTHS && (data.count || 0) < 3) {
            delete this.userData.frequent_words[word];
          }
        }
      }

      // Save to localStorage
      localStorage.setItem('userKeyboardData', JSON.stringify(this.userData));
    } catch (error) {
    }
  }

  // Method to export user data (for backup)
  exportUserData() {
    return JSON.stringify(this.userData, null, 2);
  }

  // Method to import user data (for restore)
  importUserData(jsonString) {
    try {
      const imported = JSON.parse(jsonString);
      this.userData = imported;
      this.saveUserData();
      this.mergeData();
    } catch (error) {
    }
  }

  // Method to clear user data
  clearUserData() {
    this.userData = { frequent_words: {}, bigrams: {}, trigrams: {} };
    localStorage.removeItem('userKeyboardData');
    this.mergeData();
  }

  // Method to clear cache (alias for clearUserData for the Clear Cache button)
  clearCache() {
    this.clearUserData();
  }

}

window.predictionSystem = new LocalPredictionSystem();
