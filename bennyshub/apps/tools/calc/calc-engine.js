/* Calculator engine: the math only, no DOM, so Node tests can load it.
 *
 * A standard calculator that shows the whole sum as it is built
 * ("2 + 3 × 4") and works it out with the usual order of operations
 * (times and divide before plus and minus), so 2 + 3 × 4 = 14.
 *
 * Percent works like a phone calculator: 50 + 10% = 55 (10% of 50 is added),
 * and anywhere else a percent is that number divided by 100 (200 × 5% = 10).
 *
 * Every action returns { ok, say } where `say` is short speech describing what
 * happened, so a switch user always hears the effect of a press.
 */
(function (root) {
  'use strict';

  const MAX_DIGITS = 15;
  const HISTORY_LIMIT = 20;
  const OP_SYMBOL = { '+': '+', '-': '−', '*': '×', '/': '÷' };
  const OP_WORD = { '+': 'plus', '-': 'minus', '*': 'times', '/': 'divided by' };

  class CalcError extends Error {}

  /** Rounds away floating-point noise: 0.1 + 0.2 gives 0.3, not 0.30000000000000004. */
  function tidy(value) {
    if (!Number.isFinite(value)) return value;
    const rounded = Number(value.toPrecision(12));
    return Object.is(rounded, -0) ? 0 : rounded;
  }

  function groupDigits(intPart) {
    return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  /** A typed entry ("-1234.50") as shown on screen ("−1,234.50"). */
  function showEntry(text) {
    const negative = text.startsWith('-');
    const body = negative ? text.slice(1) : text;
    const [intPart, fraction] = body.split('.');
    return (negative ? '−' : '') + groupDigits(intPart || '0') + (fraction !== undefined ? '.' + fraction : '');
  }

  /** Very large or very small answers use scientific form. */
  function isScientific(value) {
    const size = Math.abs(value);
    return size !== 0 && (size >= 1e15 || size < 1e-6);
  }
  function scientificParts(value) {
    const [mantissa, exponent] = value.toExponential(9).split('e');
    return { mantissa: mantissa.replace(/\.?0+$/, ''), exponent: Number(exponent) };
  }

  /** An answer as an editable entry string ("1234.5"), or null when it is
   *  too big or small to keep editing digit by digit. */
  function entryText(value) {
    if (!Number.isFinite(value) || isScientific(value)) return null;
    return String(tidy(value));
  }

  function formatNumber(value) {
    if (!Number.isFinite(value)) return '';
    value = tidy(value);
    if (isScientific(value)) {
      const { mantissa, exponent } = scientificParts(value);
      return showEntry(mantissa) + ' × 10^' + exponent;
    }
    return showEntry(String(value));
  }

  function speakNumberText(text) {
    let spoken = text;
    let prefix = '';
    if (spoken.startsWith('-')) { prefix = 'negative '; spoken = spoken.slice(1); }
    if (spoken.endsWith('.')) spoken = spoken.slice(0, -1) + ' point';
    return prefix + spoken;
  }

  function speakNumber(value) {
    if (!Number.isFinite(value)) return '';
    value = tidy(value);
    if (isScientific(value)) {
      const { mantissa, exponent } = scientificParts(value);
      return speakNumberText(mantissa) + ' times 10 to the power of ' + speakNumberText(String(exponent));
    }
    return speakNumberText(String(value));
  }

  const numToken = (text, pct = false) => ({ type: 'num', text, pct });
  const opToken = op => ({ type: 'op', op });
  const valueOf = token => Number(token.text === '-' ? '0' : token.text);

  /** Works out a list of tokens. Throws CalcError for divide by zero or overflow. */
  function evaluate(tokens) {
    const list = tokens.slice();
    while (list.length && list[list.length - 1].type === 'op') list.pop();
    if (!list.length) return 0;

    let sum = 0;
    let sign = 1;
    let termIndex = 0;
    let term = null;   // the value of the times/divide chain being built
    let factors = 0;   // how many numbers are in that chain
    let lonePercent = null; // the chain is a single percent number

    const factor = token => (token.pct ? valueOf(token) / 100 : valueOf(token));
    const closeTerm = () => {
      // "50 + 10%" adds 10% of the 50 before it.
      const value = termIndex > 0 && factors === 1 && lonePercent !== null ? sum * lonePercent / 100 : term;
      sum += sign * value;
      termIndex++;
    };

    let pendingOp = null;
    for (const token of list) {
      if (token.type === 'op') { pendingOp = token.op; continue; }
      if (term === null) {
        term = factor(token); factors = 1; lonePercent = token.pct ? valueOf(token) : null;
      } else if (pendingOp === '*' || pendingOp === '/') {
        const next = factor(token);
        if (pendingOp === '/') {
          if (next === 0) throw new CalcError('divide-by-zero');
          term /= next;
        } else term *= next;
        factors++;
      } else {
        closeTerm();
        sign = pendingOp === '-' ? -1 : 1;
        term = factor(token); factors = 1; lonePercent = token.pct ? valueOf(token) : null;
      }
      pendingOp = null;
    }
    closeTerm();
    const result = tidy(sum);
    if (!Number.isFinite(result)) throw new CalcError('too-big');
    return result;
  }

  function create() {
    let tokens = [];
    let done = null;      // { expression, speech, value } after "="
    let error = null;     // 'divide-by-zero' | 'too-big'
    const history = [];

    const last = () => tokens[tokens.length - 1];
    const lastNum = () => (last() && last().type === 'num' ? last() : null);
    const digitCount = text => text.replace(/[^0-9]/g, '').length;

    function reset() { tokens = []; done = null; error = null; }

    /** After "=", the answer becomes the start of the next sum. */
    function continueFromAnswer() {
      if (!done) return true;
      const text = entryText(done.value);
      done = null;
      if (text === null) { tokens = []; return false; }
      tokens = [numToken(text)];
      return true;
    }

    function tokenText(token, index) {
      if (token.type === 'op') return OP_SYMBOL[token.op];
      const shown = showEntry(token.text) + (token.pct ? '%' : '');
      // A negative number after a sign is wrapped: 3 − (−5).
      return index > 0 && token.text.startsWith('-') ? '(' + shown + ')' : shown;
    }
    function tokenSpeech(token) {
      if (token.type === 'op') return OP_WORD[token.op];
      return speakNumberText(token.text) + (token.pct ? ' percent' : '');
    }
    const expressionText = () => tokens.map(tokenText).join(' ');
    const expressionSpeech = () => tokens.map(tokenSpeech).join(' ');

    /** What the screen shows. */
    function view() {
      if (error) {
        return { expression: done ? done.expression : expressionText(), main: error === 'divide-by-zero' ? "Can't divide by 0" : 'Too big!', preview: '', state: 'error' };
      }
      if (done) return { expression: done.expression + ' =', main: formatNumber(done.value), preview: '', state: 'answer' };
      const n = lastNum();
      const main = n ? showEntry(n.text) + (n.pct ? '%' : '') : tokens.length ? OP_SYMBOL[last().op] : '0';
      let preview = '';
      if (tokens.some(token => token.type === 'op') && lastNum()) {
        try { preview = '= ' + formatNumber(evaluate(tokens)); } catch { preview = ''; }
      }
      return { expression: expressionText(), main, preview, state: tokens.length ? 'typing' : 'empty' };
    }

    /** Everything on the screen, as one sentence. */
    function speech() {
      if (error) return error === 'divide-by-zero' ? "You can't divide by zero. Press clear to start again." : 'That number is too big. Press clear to start again.';
      if (done) return done.speech;
      if (!tokens.length) return 'zero';
      return expressionSpeech();
    }

    function entrySpeech() {
      const n = lastNum();
      if (!n) return tokens.length ? OP_WORD[last().op] : 'zero';
      return tokenSpeech(n);
    }

    const ok = say => ({ ok: true, say });
    const no = say => ({ ok: false, say });

    function digit(d) {
      d = String(d);
      if (!/^[0-9]$/.test(d)) return no('');
      if (error) reset();
      if (done) { done = null; tokens = []; }
      const n = lastNum();
      if (n && n.pct) return no('Choose plus, minus, times or divide first');
      if (!n) { tokens.push(numToken(d)); return ok(entrySpeech()); }
      if (digitCount(n.text) >= MAX_DIGITS) return no('That is the most digits');
      if (n.text === '0') n.text = d;
      else if (n.text === '-0') n.text = '-' + d;
      else n.text += d;
      return ok(entrySpeech());
    }

    function point() {
      if (error) reset();
      if (done) { done = null; tokens = []; }
      const n = lastNum();
      if (!n) { tokens.push(numToken('0.')); return ok('0 point'); }
      if (n.pct) return no('Choose plus, minus, times or divide first');
      if (n.text.includes('.')) return no('This number already has a point');
      n.text += '.';
      return ok(entrySpeech());
    }

    function operator(op) {
      if (!OP_WORD[op]) return no('');
      if (error) return no(speech());
      if (done && !continueFromAnswer()) return no('That answer is too big to use. Press clear.');
      if (!tokens.length) tokens.push(numToken('0'));
      const t = last();
      if (t.type === 'op') { t.op = op; return ok(OP_WORD[op]); }
      if (t.text.endsWith('.')) t.text = t.text.slice(0, -1);
      if (t.text === '-0') t.text = '0';
      tokens.push(opToken(op));
      return ok(OP_WORD[op]);
    }

    function percent() {
      if (error) return no(speech());
      if (done && !continueFromAnswer()) return no('That answer is too big to use. Press clear.');
      const n = lastNum();
      if (!n) return no('Type a number first');
      if (n.pct) return no('That number is already a percent');
      if (n.text.endsWith('.')) n.text = n.text.slice(0, -1);
      n.pct = true;
      return ok(entrySpeech());
    }

    function negate() {
      if (error) reset();
      if (done && !continueFromAnswer()) return no('That answer is too big to use. Press clear.');
      const n = lastNum();
      if (!n) { tokens.push(numToken('-0')); return ok('negative'); }
      n.text = n.text.startsWith('-') ? n.text.slice(1) : '-' + n.text;
      const value = valueOf(n);
      if (value === 0 && !n.text.includes('.')) return ok(n.text.startsWith('-') ? 'negative' : 'positive');
      return ok(entrySpeech());
    }

    function backspace() {
      if (error) { reset(); return ok('cleared'); }
      if (done && !continueFromAnswer()) return ok('cleared');
      const t = last();
      if (!t) return no('Nothing to delete');
      if (t.type === 'op') tokens.pop();
      else if (t.pct) t.pct = false;
      else {
        t.text = t.text.slice(0, -1);
        if (t.text === '' || t.text === '-') tokens.pop();
      }
      return ok(tokens.length ? entrySpeech() : 'zero');
    }

    function clear() { reset(); return ok('cleared'); }

    function equals() {
      if (error) return no(speech());
      if (done) return ok(done.speech);
      if (!tokens.some(token => token.type === 'num')) return ok('zero');
      while (tokens.length && last().type === 'op') tokens.pop();
      const t = last();
      if (t.text.endsWith('.')) t.text = t.text.slice(0, -1);
      if (t.text === '-0') t.text = '0';
      const expression = expressionText();
      const said = expressionSpeech();
      try {
        const value = evaluate(tokens);
        done = { expression, value, speech: (tokens.length > 1 ? said + ' equals ' : '') + speakNumber(value) };
        history.unshift({ expression, result: formatNumber(value), value });
        history.length = Math.min(history.length, HISTORY_LIMIT);
        return ok(done.speech);
      } catch (e) {
        if (!(e instanceof CalcError)) throw e;
        error = e.message;
        done = { expression, value: NaN, speech: '' };
        return no(speech());
      }
    }

    function press(key) {
      if (/^[0-9]$/.test(key)) return digit(key);
      switch (key) {
        case '.': return point();
        case '+': case '-': case '*': case '/': return operator(key);
        case '%': return percent();
        case 'negate': return negate();
        case 'del': return backspace();
        case 'clear': return clear();
        case '=': return equals();
        default: return no('');
      }
    }

    return {
      press, view, speech,
      history: () => history.slice(),
      isFresh: () => !tokens.length && !done && !error,
      // For tests and troubleshooting.
      debug: () => ({ tokens: tokens.map(t => ({ ...t })), done: done && { ...done }, error })
    };
  }

  const api = { create, evaluate, formatNumber, speakNumber, tidy, MAX_DIGITS };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.NarbeCalcEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
