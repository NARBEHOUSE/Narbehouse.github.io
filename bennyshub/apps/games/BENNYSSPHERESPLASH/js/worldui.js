/** Benny's Sphere Splash - UI pinned to the 3D world.
 *
 * Choices in a match are not a menu bar: they sit on the scene. The choice cluster
 * hangs beside the ball carrier with a tail pointing at them, a number badge floats
 * over every player, and one focus marker - Fish Mystery's corner brackets - slides
 * between whatever is focused, whether that is a swimmer in the water or a button
 * on screen. One marker, one meaning, everywhere.
 *
 * Everything here is a DOM element positioned each frame from a projected world
 * point, so it stays crisp, big and readable at any distance and never clips into
 * geometry. The cluster is ONE element laid out by CSS, so its plates can never
 * overlap each other, and it is clamped so it is always wholly on screen.
 */
SS.worldui = (function () {
  'use strict';

  const _v = new THREE.Vector3(), _head = new THREE.Vector3();
  let camera, layer, frame, badges = [], cluster = null;

  function init(cam) {
    camera = cam;
    layer = document.getElementById('worldLayer');
    frame = document.getElementById('scanFrame');
  }

  /** World point -> CSS pixels, or null when it is behind the camera. */
  function toScreen(p) {
    _v.copy(p).project(camera);
    if (_v.z > 1) return null;
    return { x: (_v.x * 0.5 + 0.5) * window.innerWidth, y: (0.5 - _v.y * 0.5) * window.innerHeight };
  }

  /** Screen rectangle round a set of world points (a swimmer's bones), padded and clamped. */
  function rectOfPoints(pts, pad) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, seen = 0;
    pts.forEach(p => { const s = toScreen(p); if (!s) return; seen++; x0 = Math.min(x0, s.x); x1 = Math.max(x1, s.x); y0 = Math.min(y0, s.y); y1 = Math.max(y1, s.y); });
    if (!seen) return null;
    const W = window.innerWidth, H = window.innerHeight, m = pad == null ? 18 : pad;
    const minSize = 64;                                   // a target is never framed smaller than a finger
    let cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, w = Math.max(minSize, x1 - x0 + m * 2), h = Math.max(minSize, y1 - y0 + m * 2);
    cx = Math.min(W - w / 2 - 6, Math.max(w / 2 + 6, cx)); cy = Math.min(H - h / 2 - 6, Math.max(h / 2 + 6, cy));
    return { x: cx - w / 2, y: cy - h / 2, w, h };
  }

  /* ── number badges over every swimmer ─────────────────────────────────── */
  /** Teams differ in shape (round / diamond) as well as colour - never colour alone. */
  function addBadge(anchor, { number, team, colour, ink, lift = 0.55 }) {
    const el = document.createElement('div');
    el.className = 'badge team-' + team + ' ' + (team ? 'diamond' : 'round');
    el.style.setProperty('--bg', colour);
    el.style.color = ink || '#14161f';
    el.innerHTML = '<span class="n"></span><span class="mk"></span>';
    el.querySelector('.n').textContent = number;
    layer.appendChild(el);
    const b = { el, anchor, lift, tap: null,
      /** A pass candidate shows its odds on its badge as a shape AND a word. */
      mark(word) {
        el.classList.toggle('candidate', !!word);
        el.dataset.odds = word ? word.toLowerCase().replace(/\s+/g, '-') : '';
        el.querySelector('.mk').textContent = word ? ({ 'good-chance': '▲', fair: '●', risky: '▼' }[el.dataset.odds] || '') : '';
      },
      blocker(on) { el.classList.toggle('blocker', !!on); },
      carrier(on) { el.classList.toggle('has-ball', !!on); },
      onTap(fn) { b.tap = fn; el.style.pointerEvents = fn ? 'auto' : ''; },
    };
    SS.util.addTap(el, e => { if (b.tap) { e.stopPropagation(); b.tap(); } });
    badges.push(b);
    return b;
  }
  function clearBadges() { badges.forEach(b => b.el.remove()); badges = []; }

  /* ── the choice cluster, beside the carrier ────────────────────────────── */
  /** `el` is built by ui.js. It sits above the anchor's head, or below it when there
   *  is no room above, with its tail pointing at the anchor. */
  function setCluster(anchor, el) {
    if (cluster && cluster.el !== el) cluster.el.remove();
    cluster = el ? { anchor, el } : null;
    if (el && el.parentNode !== layer) layer.appendChild(el);
  }
  function placeCluster() {
    if (!cluster) return;
    const el = cluster.el, W = window.innerWidth, H = window.innerHeight, m = 10;
    const s = toScreen(anchorPoint(cluster.anchor, 0.2));
    const w = el.offsetWidth, h = el.offsetHeight, gap = Math.max(58, H * 0.07);
    let ax = s ? s.x : W / 2, ay = s ? s.y : H / 2;
    let below = ay - gap - h < m + H * 0.11;                 // keep clear of the score bug
    let y = below ? ay + gap : ay - gap - h;
    y = Math.min(H - h - m, Math.max(m, y));
    const x = Math.min(W - w - m, Math.max(m, ax - w / 2));
    el.classList.toggle('below', below);
    el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    el.style.setProperty('--tail', Math.min(w - 30, Math.max(30, ax - x)).toFixed(0) + 'px');
  }

  /* ── focus: one bracket marker for world objects and DOM alike ─────────── */
  let focus = null;              // { el } | { pts: () => Vector3[] } | null
  function setFocus(target) {
    focus = target;
    frame.classList.toggle('on', !!target);
    if (target) placeFrame();
  }
  function placeFrame() {
    if (!focus) return;
    let r = null;
    if (focus.el) {
      const b = focus.el.getBoundingClientRect();
      if (b.width && b.height) r = { x: b.left - 9, y: b.top - 9, w: b.width + 18, h: b.height + 18 };
    } else if (focus.pts) r = rectOfPoints(focus.pts());
    if (!r) { frame.classList.remove('on'); return; }
    frame.classList.add('on');
    Object.assign(frame.style, { left: r.x.toFixed(1) + 'px', top: r.y.toFixed(1) + 'px', width: r.w.toFixed(1) + 'px', height: r.h.toFixed(1) + 'px' });
  }

  function anchorPoint(anchor, lift) {
    if (anchor.isVector3) return _head.copy(anchor);
    anchor.getWorldPosition(_head); _head.y += lift; return _head;
  }

  /** Called once per frame after the camera moves. */
  function update() {
    badges.forEach(b => {
      const s = toScreen(anchorPoint(b.anchor, b.lift));
      b.el.style.display = s ? '' : 'none';
      if (s) b.el.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px) translate(-50%, -100%)`;
    });
    placeCluster();
    placeFrame();
  }

  return { init, addBadge, clearBadges, setCluster, setFocus, update, toScreen, rectOfPoints,
    get badges() { return badges; }, get cluster() { return cluster; } };
})();
