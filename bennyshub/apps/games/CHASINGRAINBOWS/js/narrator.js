/** Chasing Rainbows - the narrator: one spoken line at a time, each shown as a caption.
 *
 *  The shared voice manager cancels whatever is speaking when anything new is said, so the
 *  game's play-by-play queues here instead: a line starts only when the last one finished
 *  (plus a short breath), and the game waits on idle() before the next computer move or
 *  before opening the player's menu. Scenes never cut a line off.
 *
 *  The player's own scanning wins: hush() drops the queue the moment the scanner speaks a
 *  label (the hub rule - only scan and selection speech interrupts). "What just happened"
 *  replays anything that was talked over.
 *
 *  With speech off, lines are paced by reading time so the captions can be read.
 */
window.CRNarrator = (function () {
  'use strict';
  const vm = () => window.NarbeVoiceManager || null;
  const MAX_LINE_MS = 12000;      // a stuck engine never freezes the game
  let queue = [], current = null, waiters = [], history = [];
  let captionEl = null, captionsOn = true, breath = 350;

  function init(el) { captionEl = el; }
  function setCaptions(on) {
    captionsOn = !!on;
    if (captionEl) captionEl.classList.toggle('off', !captionsOn);
  }
  /** Gap between lines, in ms (the Turn pace setting). */
  function setBreath(ms) { breath = ms; }

  function caption(text) {
    if (!captionEl) return;
    captionEl.textContent = text;
    captionEl.classList.remove('flash');
    void captionEl.offsetWidth;
    captionEl.classList.add('flash');
  }

  /** Queue a line. opts.quiet: caption and history only. */
  function say(text, opts) {
    if (!text) return;
    history.push(text);
    if (history.length > 40) history.shift();
    if (opts && opts.quiet) { caption(text); return; }
    queue.push(text);
    pump();
  }

  function readingTime(text) { return Math.max(1100, String(text).split(/\s+/).length * 300); }

  function pump() {
    if (current) return;
    if (!queue.length) { release(); return; }
    const text = queue.shift();
    const token = current = { text };
    caption(text);
    const v = vm();
    const speaking = v && v.getSettings().ttsEnabled;
    const finish = () => {
      if (current !== token) return;
      setTimeout(() => { if (current !== token) return; current = null; pump(); }, breath);
    };
    const cap = setTimeout(finish, MAX_LINE_MS);
    if (speaking) {
      let ticket = null;
      try { ticket = v.speak(text); } catch (e) { ticket = null; }
      const done = r => { clearTimeout(cap); if (r && r.started === false && r.reason !== 'cancelled') setTimeout(finish, readingTime(text)); else finish(); };
      if (ticket && ticket.finished) Promise.resolve(ticket.finished).then(done, done);
      else setTimeout(() => { clearTimeout(cap); finish(); }, readingTime(text));
    } else {
      setTimeout(() => { clearTimeout(cap); finish(); }, readingTime(text));
    }
  }
  function release() {
    if (current || queue.length) return;
    const w = waiters; waiters = [];
    w.forEach(fn => fn());
  }

  /** Resolves when everything queued has been said. */
  function idle() {
    if (!current && !queue.length) return Promise.resolve();
    return new Promise(resolve => waiters.push(resolve));
  }
  const busy = () => !!current || queue.length > 0;

  /** The scanner is speaking: drop the play-by-play (it stays in the history). */
  function hush() {
    queue = [];
    current = null;
    release();
  }

  const recent = n => history.slice(-(n || 6));
  function clearHistory() { history = []; }

  return { init, say, idle, busy, hush, recent, clearHistory, setCaptions, setBreath, caption };
})();
