/** Chasing Rainbows - the big moments: callouts, confetti, reactions, the "Your turn" sweep.
 *
 *  Layered feedback in the style of mainstream card games (Balatro's "juice stack", UNO's big
 *  callouts and emotes): when something happens, several channels fire together - the card
 *  moves, a word pops, particles burst, a sound plays, a player reacts - so it reads at a
 *  glance and feels good. All of it is decoration on top of the narration and captions, which
 *  carry the actual information.
 *
 *  Animations setting (and the device's reduced-motion request, via app.js):
 *    full  everything;
 *    calm  no particles, bumps or rings; callouts and sweeps fade instead of bouncing;
 *    off   no callouts, sweeps, particles or bumps; reactions still show, standing still.
 *  Nothing flashes: no white frames, no strobing, only transform and opacity animations.
 *  DOM only (transform/opacity), a capped number of particles, all removed when done.
 */
window.CRFX = (function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const RAINBOW = ['#ff0a3c', '#ff8000', '#ffde00', '#92d800', '#00b4e8', '#7a4ad8', '#d548d6'];
  const MAX_PARTICLES = 140;
  let motion = 'full', live = 0;

  function setMotion(m) { motion = m; }
  const layer = () => $('fxLayer');
  const center = el => {
    if (!el) return { x: innerWidth / 2, y: innerHeight / 2, w: 0, h: 0 };
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, top: r.top };
  };
  function later(el, ms) { setTimeout(() => el.remove(), ms); }

  /** A big word over the table: "RAINBOW!", "BLOCKED!". tone picks the colours. */
  function callout(text, tone, o) {
    o = o || {};
    if (motion === 'off' || !layer()) return Promise.resolve();
    const at = center(o.over || $('felt'));
    const el = document.createElement('div');
    el.className = 'callout tone-' + (tone || 'rainbow') + (motion === 'calm' ? ' calm' : '');
    el.innerHTML = '<span></span>';
    el.firstChild.textContent = text;
    el.style.left = at.x + 'px';
    el.style.top = (at.y + (o.dy || 0)) + 'px';
    layer().appendChild(el);
    const ms = o.ms || 1300;
    later(el, ms);
    return new Promise(r => setTimeout(r, Math.min(ms, 700)));
  }

  /** Confetti, stars or drops bursting from a point (an element or {x, y}). */
  function burst(from, o) {
    o = o || {};
    if (motion !== 'full' || !layer()) return;
    const at = from && from.nodeType === 1 ? center(from) : from || center($('felt'));
    const colors = o.colors || RAINBOW, count = Math.min(o.count || 26, MAX_PARTICLES - live);
    for (let i = 0; i < count; i++) {
      const p = document.createElement('i');
      p.className = 'particle ' + (o.shape || 'confetti');
      const a = Math.random() * Math.PI * 2, d = (o.spread || 170) * (0.45 + Math.random() * 0.75);
      p.style.left = at.x + 'px';
      p.style.top = at.y + 'px';
      p.style.setProperty('--dx', Math.cos(a) * d + 'px');
      p.style.setProperty('--dy', Math.sin(a) * d - (o.lift || 60) + 'px');
      p.style.setProperty('--rot', (Math.random() * 720 - 360) + 'deg');
      p.style.setProperty('--c', colors[i % colors.length]);
      p.style.setProperty('--ms', (700 + Math.random() * 500) + 'ms');
      layer().appendChild(p);
      live++;
      setTimeout(() => { p.remove(); live--; }, 1300);
    }
  }

  /** Rainbow confetti falling over the whole screen (a win). */
  function confetti(o) {
    o = o || {};
    if (motion !== 'full' || !layer()) return;
    const count = Math.min(o.count || 90, MAX_PARTICLES - live);
    for (let i = 0; i < count; i++) {
      const p = document.createElement('i');
      p.className = 'particle fall';
      p.style.left = Math.random() * innerWidth + 'px';
      p.style.top = '-20px';
      p.style.setProperty('--dx', (Math.random() * 160 - 80) + 'px');
      p.style.setProperty('--dy', (innerHeight + 60) + 'px');
      p.style.setProperty('--rot', (Math.random() * 1080 - 540) + 'deg');
      p.style.setProperty('--c', RAINBOW[i % RAINBOW.length]);
      const ms = 2200 + Math.random() * 1800, delay = Math.random() * (o.spreadMs || 1400);
      p.style.setProperty('--ms', ms + 'ms');
      p.style.animationDelay = delay + 'ms';
      layer().appendChild(p);
      live++;
      setTimeout(() => { p.remove(); live--; }, ms + delay + 100);
    }
  }

  /** A ring of light spreading from a point: a card landed. */
  function ring(from, color) {
    if (motion !== 'full' || !layer()) return;
    const at = from && from.nodeType === 1 ? center(from) : from;
    if (!at) return;
    const el = document.createElement('i');
    el.className = 'shockring';
    el.style.left = at.x + 'px';
    el.style.top = at.y + 'px';
    el.style.setProperty('--c', color || '#fff6c8');
    layer().appendChild(el);
    later(el, 800);
  }

  /** A tiny bump of an element (the table, in a Storm). Never more than 3 px. */
  function bump(el) {
    if (motion !== 'full' || !el) return;
    el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
    setTimeout(() => el.classList.remove('bump'), 520);
  }

  /** "Your turn" sweeps across the table. */
  function sweep(text, color) {
    if (motion === 'off' || !layer()) return;
    const at = center($('felt'));
    const el = document.createElement('div');
    el.className = 'sweep' + (motion === 'calm' ? ' calm' : '');
    el.style.top = at.y + 'px';
    el.style.setProperty('--pc', color || '#ffd54f');
    el.innerHTML = '<span></span>';
    el.firstChild.textContent = text;
    layer().appendChild(el);
    later(el, 1500);
  }

  /** A player reacts: an emoji bubble pops up over their nameplate (or your rainbow). */
  function react(el, emoji) {
    if (!el || !layer()) return;
    const at = center(el);
    const b = document.createElement('div');
    b.className = 'react' + (motion === 'off' ? ' still' : '');
    b.textContent = emoji;
    b.style.left = (at.x + Math.min(at.w / 2, 70) - 10) + 'px';
    b.style.top = (at.top !== undefined ? at.top : at.y) + 'px';
    layer().appendChild(b);
    later(b, 1800);
  }

  /** Dots on a computer player's nameplate while it decides. */
  function thinking(el, on) {
    if (!el) return;
    el.classList.toggle('thinking', !!on);
  }

  function clear() {
    const l = layer();
    if (l) l.innerHTML = '';
    live = 0;
  }

  return { setMotion, callout, burst, confetti, ring, bump, sweep, react, thinking, clear, RAINBOW };
})();
