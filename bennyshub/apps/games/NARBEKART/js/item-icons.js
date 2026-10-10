/**
 * NARBE Racer — item icons for the HUD (item slot, roulette reel).
 *
 * Our own drawn icons in place of system emoji, which every platform draws
 * differently (tilted, off-centre). Chunky cartoon style to match the HUD: a
 * dark ink outline (about 4.5 % of the square), bold fills lit from the upper
 * left, a soft highlight on each body. Colours follow the in-world models in
 * js/art-items.js so the icon looks like the thing on the track.
 *
 * Every drawing is centred by its ink: BOX holds each drawing's measured ink
 * bounds (design units) and draw() scales that box to fill FILL of the square
 * and centres it, so diagonal shapes (rocket, jet) sit in the middle too.
 *
 *   NK.itemIcons.IDS                  the 15 item ids
 *   NK.itemIcons.draw(ctx, id, size)  paint into (0,0)-(size,size), transparent;
 *                                     unknown ids get a "?" bubble; never throws
 *   NK.itemIcons.canvas(id, cssSize)  a new <canvas> drawn at device resolution
 *
 * Canvas subset only (paths, fills, strokes, gradients, transforms, alpha) so
 * the Node preview renderer (tools/node_render.cjs) draws them too: no text,
 * clip, shadows, filters or images. No dependencies; load before js/hud.js.
 */
window.NK = window.NK || {};
NK.itemIcons = (function () {
  'use strict';

  const IDS = ['rocket', 'rocket3', 'goldrocket', 'peel', 'peel3', 'ball', 'bee', 'zapper',
    'star', 'shrink', 'jet', 'horn', 'mega', 'coins', 'bomb'];

  const INK = '#1d1b2e';
  const TAU = Math.PI * 2;
  const FILL = 0.81;      // share of the square the longer side of the ink box fills
  const INK_W = 0.045;    // outline width as a share of the square

  /* Ink bounds of each drawing [x0, y0, x1, y1] in design units, measured by
     the Node preview (scratch harness) — re-measure after changing a drawing. */
  const BOX = {
    rocket: [-38, -35.9, 35.9, 38],
    rocket3: [-47.9, -38.3, 38.3, 47.9],
    goldrocket: [-41.8, -49.4, 39, 38.7],
    peel: [-46.2, -47.2, 46.3, 47.1],
    peel3: [-51, -49.4, 51, 44.5],
    ball: [-45.2, -45.2, 45.2, 45.2],
    bee: [-47.9, -49.1, 33.8, 37.7],
    zapper: [-36.6, -51.6, 36.6, 51.6],
    star: [-44.8, -42.9, 44.8, 42.9],
    shrink: [-45.4, -37.5, 52.3, 44.4],
    jet: [-47.8, -37.5, 37.5, 47.8],
    horn: [-49.1, -31.6, 45.3, 30.8],
    mega: [-43.9, -49.2, 43.9, 45.2],
    coins: [-36.5, -39.7, 38.7, 45.6],
    bomb: [-45, -48.5, 44.9, 32.9],
    unknown: [-42.2, -46.3, 42.2, 47.2]
  };
  /* Per-icon fill where the optical size needs it (compact round shapes look
     bigger than spiky ones at the same box). */
  const FIT = { ball: 0.79, unknown: 0.8 };

  /* ── Drawing state and helpers ─────────────────────────────────────────── */
  let c = null;       // the context being drawn into
  let ink = 4.6;      // outline width, design units, for the current drawing
  let depth = 0;      // save() depth, so a failure can unwind cleanly

  function push() { c.save(); depth++; }
  function pop() { if (depth > 0) { depth--; c.restore(); } }

  function stops(g, list) {
    for (let i = 0; i < list.length; i += 2) g.addColorStop(list[i], list[i + 1]);
    return g;
  }
  function lin(x0, y0, x1, y1, list) { return stops(c.createLinearGradient(x0, y0, x1, y1), list); }
  /** Concentric radial gradient (the offset-highlight look comes from moving the centre). */
  function rad(x, y, r, list) { return stops(c.createRadialGradient(x, y, 0, x, y, r), list); }

  /** Trace a closed shape, ink it (the outline sits outside the fill), then fill it. */
  function body(trace, fill, w) {
    c.beginPath(); trace();
    c.strokeStyle = INK; c.lineWidth = 2 * (w === undefined ? ink : w); c.stroke();
    c.fillStyle = fill; c.fill();
  }
  /** Fill only (inner details sitting inside an inked body). */
  function blob(trace, fill) { c.beginPath(); trace(); c.fillStyle = fill; c.fill(); }
  /** A thick open stroke with an ink outline (fuses, arcs, handles). */
  function cord(trace, colour, w) {
    c.beginPath(); trace();
    c.strokeStyle = INK; c.lineWidth = w + 2 * ink; c.stroke();
    if (colour) { c.strokeStyle = colour; c.lineWidth = w; c.stroke(); }
  }
  /** A soft white highlight stroke. */
  function glint(trace, alpha, w) {
    c.beginPath(); trace();
    c.strokeStyle = 'rgba(255,255,255,' + alpha + ')'; c.lineWidth = w; c.stroke();
  }

  function circle(x, y, r) { c.moveTo(x + r, y); c.arc(x, y, r, 0, TAU); }
  function oval(x, y, rx, ry, rot) {
    rot = rot || 0;
    c.moveTo(x + rx * Math.cos(rot), y + rx * Math.sin(rot));
    c.ellipse(x, y, rx, ry, rot, 0, TAU);
  }
  function poly(pts) {
    c.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
    c.closePath();
  }
  function rrect(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.moveTo(x + r, y);
    c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y);
    c.closePath();
  }
  /** Four-point twinkle. */
  function twinkle(x, y, r, fill) {
    const k = r * 0.2;
    body(() => {
      c.moveTo(x, y - r);
      c.quadraticCurveTo(x + k, y - k, x + r, y);
      c.quadraticCurveTo(x + k, y + k, x, y + r);
      c.quadraticCurveTo(x - k, y + k, x - r, y);
      c.quadraticCurveTo(x - k, y - k, x, y - r);
      c.closePath();
    }, fill || '#fff27a', ink * 0.8);
  }
  /** Draw fn at (x, y), rotated and scaled, keeping the outline width constant. */
  function at(x, y, s, rot, fn) {
    push();
    c.translate(x, y); if (rot) c.rotate(rot); c.scale(s, s);
    const keep = ink; ink = ink / s;
    try { fn(); } finally { ink = keep; pop(); }
  }
  function mix(a, b, t) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    let out = '#';
    for (let sh = 16; sh >= 0; sh -= 8) {
      const v = Math.round(((pa >> sh) & 255) * (1 - t) + ((pb >> sh) & 255) * t);
      out += (v < 16 ? '0' : '') + v.toString(16);
    }
    return out;
  }
  const shade3 = (x0, x1, three) => lin(x0, 0, x1, 0, [0, three[0], 0.45, three[1], 1, three[2]]);

  /* ── Rockets ───────────────────────────────────────────────────────────── */
  const RED_ROCKET = { body: ['#ffffff', '#f2efe8', '#c2bdd2'], trim: ['#ff6b6b', '#d62839', '#8e1420'] };
  const GOLD_ROCKET = { body: ['#fff8cc', '#ffd23a', '#d48a00'], trim: ['#ff9b5c', '#ef4a1a', '#9e2a00'] };

  /** A rocket pointing up (-y), about 50 wide and 95 long, centred near the origin. */
  function rocketBody(pal) {
    body(() => {
      c.moveTo(-9, 15); c.bezierCurveTo(-11, 27, -5, 37, 0, 48); c.bezierCurveTo(5, 37, 11, 27, 9, 15); c.closePath();
    }, lin(0, 15, 0, 46, [0, '#fff3a0', 0.45, '#ffb000', 1, '#ff5a1a']));
    blob(() => {
      c.moveTo(-5, 16); c.bezierCurveTo(-5, 24, -2, 30, 0, 36); c.bezierCurveTo(2, 30, 5, 24, 5, 16); c.closePath();
    }, '#fff8d8');
    const fin = shade3(-25, 25, pal.trim);
    [-1, 1].forEach((s) => body(() => poly([[s * 11, -6], [s * 25, 8], [s * 25, 19], [s * 11, 13]]), fin));
    body(() => rrect(-8, 12, 16, 7, 2), '#4a4f63');
    body(() => {
      c.moveTo(-13, -16); c.lineTo(13, -16); c.lineTo(13, 11); c.quadraticCurveTo(13, 16, 8, 16);
      c.lineTo(-8, 16); c.quadraticCurveTo(-13, 16, -13, 11); c.closePath();
    }, shade3(-13, 13, pal.body));
    body(() => {
      c.moveTo(-13, -14); c.bezierCurveTo(-13, -28, -6, -38, 0, -45); c.bezierCurveTo(6, -38, 13, -28, 13, -14);
      c.quadraticCurveTo(0, -9, -13, -14); c.closePath();
    }, shade3(-13, 13, pal.trim));
    glint(() => { c.moveTo(-7, -17); c.quadraticCurveTo(-7, -26, -3, -33); }, 0.6, 3.2);
    body(() => circle(0, 0, 6.5), rad(-2, -2, 9, [0, '#d8f8ff', 0.5, '#5cc8f5', 1, '#1f5fc0']));
    blob(() => circle(-2.2, -2.2, 1.9), '#ffffff');
  }

  function rocket() { at(0, 0, 1, Math.PI / 4, () => rocketBody(RED_ROCKET)); }

  function rocket3() {
    // A tidy formation of three, the middle one leading.
    at(0, 0, 1, Math.PI / 4, () => {
      at(-31, 6, 0.5, 0, () => rocketBody(RED_ROCKET));
      at(31, 6, 0.5, 0, () => rocketBody(RED_ROCKET));
      at(0, -4, 0.5, 0, () => rocketBody(RED_ROCKET));
    });
  }

  function goldrocket() {
    at(0, 0, 1, Math.PI / 4, () => rocketBody(GOLD_ROCKET));
    twinkle(-27, -25, 11, '#fff27a');
    twinkle(27, 25, 8, '#ffffff');
    twinkle(-12, -40, 5.5, '#ffffff');
  }

  /* ── Banana peels ──────────────────────────────────────────────────────── */
  const YELLOW = ['#fff27a', '#f2c200', '#c99400'];
  const PEEL_BROWN = '#6b3f1d';

  /** Peel flap colour along root → tip, ending in the brown tip. */
  const flapFill = (x0, y0, x1, y1) => lin(x0, y0, x1, y1,
    [0, '#fff27a', 0.5, '#f2c200', 0.82, '#d9a800', 0.84, PEEL_BROWN, 1, PEEL_BROWN]);

  function peelBody() {
    const flap = (s) => {
      body(() => {
        c.moveTo(s * 8, -3); c.bezierCurveTo(s * 22, -7, s * 36, 7, s * 41, 30);
        c.bezierCurveTo(s * 30, 33, s * 16, 27, s * 6, 20); c.closePath();
      }, flapFill(s * 6, 8, s * 41, 31));
      blob(() => {
        c.moveTo(s * 10, 1); c.bezierCurveTo(s * 21, -1, s * 30, 9, s * 33, 22);
        c.bezierCurveTo(s * 26, 18, s * 17, 13, s * 9, 11); c.closePath();
      }, lin(s * 10, 0, s * 33, 22, [0, '#fff6d0', 1, '#ffe08a']));
    };
    flap(-1); flap(1);
    body(() => rrect(-4, -42, 8, 14, 2.5), lin(-4, 0, 4, 0, [0, '#9a6a3a', 1, PEEL_BROWN]));
    body(() => {
      c.moveTo(-12, 16); c.bezierCurveTo(-13, -4, -10, -22, -5, -30); c.lineTo(5, -30);
      c.bezierCurveTo(10, -22, 13, -4, 12, 16); c.closePath();
    }, shade3(-12, 12, YELLOW));
    glint(() => { c.moveTo(-6, 8); c.bezierCurveTo(-7, -4, -6, -14, -3, -22); }, 0.6, 3.2);
    body(() => {
      c.moveTo(-13, 10); c.bezierCurveTo(-16, 24, -9, 36, 0, 42); c.bezierCurveTo(9, 36, 16, 24, 13, 10);
      c.quadraticCurveTo(0, 15, -13, 10); c.closePath();
    }, flapFill(-4, 12, 2, 42));
    glint(() => { c.moveTo(-8, 17); c.quadraticCurveTo(-8, 25, -4, 31); }, 0.55, 3);
  }

  function peel() { peelBody(); }

  function peel3() {
    at(0, -22, 0.52, 0, peelBody);
    at(-24, 17, 0.52, 0, peelBody);
    at(24, 17, 0.52, 0, peelBody);
  }

  /* ── Bumper ball ───────────────────────────────────────────────────────── */
  /** A band across a sphere of radius R: edges meet the rim at angles t (top)
      and b (bottom) and sag by sT / sB in the middle, so it wraps round. */
  function band(R, t, b, sT, sB) {
    const xT = R * Math.cos(t), yT = -R * Math.sin(t), xB = R * Math.cos(b), yB = R * Math.sin(b);
    c.moveTo(-xT, yT);
    c.quadraticCurveTo(0, yT + 2 * sT, xT, yT);
    c.arc(0, 0, R, -t, b, false);
    c.quadraticCurveTo(0, yB + 2 * sB, -xB, yB);
    c.arc(0, 0, R, Math.PI - b, Math.PI + t, false);
    c.closePath();
  }

  function ball() {
    const R = 40;
    body(() => circle(0, 0, R), rad(-14, -16, 60, [0, '#8ef09a', 0.3, '#2fb54a', 0.75, '#1f8a3a', 1, '#16602a']));
    blob(() => band(R, 0.32, 0.12, 8, 12), '#1c6b2e');
    blob(() => band(R, 0.17, -0.03, 9, 11.5), lin(0, -8, 0, 12, [0, '#ffffff', 1, '#d9dde8']));
    [-1, 1].forEach((s) => {
      body(() => oval(s * 11, -18, 6.5, 8, 0), '#ffffff', ink * 0.7);
      blob(() => circle(s * 10, -17, 4), INK);
      cord(() => { c.moveTo(s * 5, -27); c.lineTo(s * 17, -31); }, null, 0);
    });
    glint(() => { c.moveTo(-31, -14); c.quadraticCurveTo(-28, -26, -18, -32); }, 0.65, 4.5);
  }

  /* ── Homing bee ────────────────────────────────────────────────────────── */
  /** Vertical stripe [xa, xb] of the ellipse (cx, cy, rx, ry). */
  function stripe(cx, cy, rx, ry, xa, xb) {
    const yAt = (x) => ry * Math.sqrt(Math.max(0, 1 - ((x - cx) / rx) * ((x - cx) / rx)));
    const n = 8;
    for (let i = 0; i <= n; i++) {
      const x = xa + (xb - xa) * i / n;
      if (i === 0) c.moveTo(x, cy - yAt(x)); else c.lineTo(x, cy - yAt(x));
    }
    for (let i = n; i >= 0; i--) {
      const x = xa + (xb - xa) * i / n;
      c.lineTo(x, cy + yAt(x));
    }
    c.closePath();
  }

  function bee() {
    const wing = lin(0, -45, 0, -10, [0, '#ffffff', 1, '#bfe6ff']);
    body(() => oval(-9, -25, 11, 17, -0.4), wing);
    body(() => oval(7, -27, 12, 18, 0.35), wing);
    cord(() => { c.moveTo(12, -12); c.quadraticCurveTo(14, -24, 22, -30); }, null, 0);
    blob(() => circle(22, -30, 3.6), INK);
    body(() => poly([[-30, 1], [-43, 8], [-30, 14]]), INK);
    const cx = -2, cy = 7, rx = 31, ry = 26;
    body(() => oval(cx, cy, rx, ry, 0), rad(-12, -6, 46, [0, '#ffe680', 0.4, '#f2b600', 1, '#c98a00']));
    blob(() => stripe(cx, cy, rx, ry, -23, -15), INK);
    blob(() => stripe(cx, cy, rx, ry, -7, 1), INK);
    glint(() => { c.moveTo(-8, -12); c.quadraticCurveTo(2, -17, 12, -14); }, 0.55, 3.5);
    body(() => circle(15, 2, 8), '#ffffff', ink * 0.7);
    blob(() => circle(17, 3, 4.8), INK);
    blob(() => circle(18.6, 1.2, 1.6), '#ffffff');
    blob(() => oval(20, 15, 4.5, 3, 0), 'rgba(255,128,160,0.85)');
  }

  /* ── Leader zapper ─────────────────────────────────────────────────────── */
  function zapper() {
    body(() => circle(0, 0, 31), rad(-10, -10, 44, [0, '#9c86ff', 0.4, '#4a3ad6', 1, '#1f1a7a']));
    glint(() => { c.moveTo(-24, -6); c.quadraticCurveTo(-20, -20, -6, -25); }, 0.4, 4);
    body(() => poly([[2, -46], [-22, 4], [-3, 4], [-12, 46], [24, -8], [5, -8], [18, -46]]),
      lin(0, -46, 0, 46, [0, '#fffbd0', 0.45, '#ffe14d', 1, '#ffa800']));
    glint(() => { c.moveTo(4, -38); c.lineTo(-11, -4); }, 0.7, 3);
  }

  /* ── Super star ────────────────────────────────────────────────────────── */
  function star() {
    const cy = 4, R = 42, r = 20;
    blob(() => circle(0, cy, 50), rad(0, cy, 50, [0, 'rgba(255,226,92,0.45)', 0.7, 'rgba(255,226,92,0.3)', 1, 'rgba(255,226,92,0)']));
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5, d = i % 2 ? r : R;
      pts.push([Math.cos(a) * d, cy + Math.sin(a) * d]);
    }
    body(() => poly(pts), '#ffc93c');
    for (let i = 0; i < 10; i++) {
      const p = pts[i], q = pts[(i + 1) % 10];
      const dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy) || 1;
      const lit = (dy / L) * -0.6 + (-dx / L) * -0.8;     // outward normal · light (upper left)
      blob(() => poly([[0, cy], p, q]), mix('#e08a00', '#fff3a0', 0.5 + 0.45 * lit));
    }
  }

  /* ── Shrink ray ────────────────────────────────────────────────────────── */
  const PURPLE = ['#d2b0ff', '#a66cff', '#5f2bc0'];
  const PINK = '#ff7fd0';

  function shrink() {
    body(() => poly([[-22, -4], [-7, -4], [-13, 28], [-28, 28]]), lin(-28, 0, -7, 0, [0, '#6b7088', 1, '#3b3f58']));
    body(() => poly([[-34, -18], [-40, -32], [-26, -32], [-21, -18]]), PINK);
    body(() => rrect(-40, -22, 50, 22, 11), lin(0, -22, 0, 0, [0, PURPLE[0], 0.45, PURPLE[1], 1, PURPLE[2]]));
    glint(() => { c.moveTo(-32, -16); c.lineTo(-10, -16); }, 0.6, 3.2);
    body(() => rrect(-6, -25, 6, 28, 3), PINK);
    body(() => poly([[8, -17], [24, -28], [24, 6], [8, -5]]), lin(0, -28, 0, 6, [0, PURPLE[0], 1, PURPLE[2]]));
    body(() => oval(24, -11, 4.5, 17, 0), lin(0, -28, 0, 6, [0, '#e8fdff', 1, '#5fe3ff']));
    twinkle(38, -11, 10, '#ffe14d');
    body(() => poly([[21, 4], [31, 4], [31, 18], [41, 18], [26, 39], [11, 18], [21, 18]]), lin(11, 0, 41, 0, [0, '#ffa6e0', 1, '#e0409a']));
  }

  /* ── Jet ───────────────────────────────────────────────────────────────── */
  function jetBody() {
    body(() => {
      c.moveTo(-7, 30); c.bezierCurveTo(-8, 39, -4, 45, 0, 52); c.bezierCurveTo(4, 45, 8, 39, 7, 30); c.closePath();
    }, lin(0, 30, 0, 50, [0, '#fff3a0', 0.45, '#ffb000', 1, '#ff5a1a']));
    const red = shade3(-40, 40, ['#ff6b6b', '#d62839', '#8e1420']);
    [-1, 1].forEach((s) => body(() => poly([[s * 6, -12], [s * 40, 12], [s * 40, 21], [s * 6, 9]]), red));
    const blue = shade3(-18, 18, ['#6b8cff', '#2449d6', '#16308f']);
    [-1, 1].forEach((s) => body(() => poly([[s * 5, 21], [s * 18, 32], [s * 18, 37], [s * 5, 32]]), blue));
    body(() => {
      c.moveTo(0, -46); c.bezierCurveTo(7, -41, 10, -30, 10, -16); c.lineTo(9, 30); c.quadraticCurveTo(9, 34, 5, 34);
      c.lineTo(-5, 34); c.quadraticCurveTo(-9, 34, -9, 30); c.lineTo(-10, -16); c.bezierCurveTo(-10, -30, -7, -41, 0, -46);
      c.closePath();
    }, shade3(-10, 10, ['#ffffff', '#f4f6fb', '#c2c8da']));
    body(() => oval(0, -21, 5.5, 10, 0), rad(-1.5, -24, 12, [0, '#e0fbff', 0.5, '#7fdcff', 1, '#2a8ce0']), ink * 0.8);
    blob(() => oval(-1.8, -25, 1.6, 3.2, 0), '#ffffff');
  }

  function jet() { at(0, 0, 1, Math.PI / 4, jetBody); }

  /* ── Honk horn ─────────────────────────────────────────────────────────── */
  function horn() { at(0, 0, 1, -0.3, hornBody); }

  function hornBody() {
    [18, 28].forEach((r) => cord(() => { c.moveTo(10 + r * Math.cos(-0.55), r * Math.sin(-0.55)); c.arc(10, 0, r, -0.55, 0.55); }, '#ffe14d', 5));
    body(() => oval(-30, 0, 15, 17, 0), rad(-35, -6, 24, [0, '#ff8a8a', 0.45, '#d62839', 1, '#8e1420']));
    glint(() => { c.moveTo(-39, -6); c.quadraticCurveTo(-37, -12, -31, -14); }, 0.65, 3.5);
    body(() => {
      c.moveTo(-14, -5); c.quadraticCurveTo(2, -6, 10, -22); c.lineTo(10, 22); c.quadraticCurveTo(2, 6, -14, 5); c.closePath();
    }, lin(0, -22, 0, 22, [0, '#fff09a', 0.45, '#ffc93c', 1, '#d48a00']));
    body(() => rrect(-18, -7, 7, 14, 2), '#4a4f63');
    body(() => oval(10, 0, 6, 22, 0), lin(0, -22, 0, 22, [0, '#ffd23a', 1, '#ff7a00']));
    blob(() => oval(11, 0, 3.5, 16, 0), '#9a2e00');
  }

  /* ── Mega grow ─────────────────────────────────────────────────────────── */
  function mega() {
    body(() => poly([[0, -44], [38, -4], [16, -4], [16, 40], [-16, 40], [-16, -4], [-38, -4]]),
      lin(-38, -44, 38, 40, [0, '#ffd36b', 0.45, '#ff9a1a', 1, '#d8500a']));
    glint(() => { c.moveTo(-5, -34); c.lineTo(-25, -12); }, 0.6, 4);
    glint(() => { c.moveTo(-8, 2); c.lineTo(-8, 30); }, 0.45, 4);
    // "Growing!" pop lines off both slopes of the head.
    c.beginPath();
    [[0.25, 7, 5], [0.5, 9, 9], [0.75, 7, 5]].forEach(([t, gap, len]) => {
      [-1, 1].forEach((s) => {
        const ex = s * 38 * t, ey = -44 + 40 * t, nx = s * 0.72, ny = -0.69;
        c.moveTo(ex + nx * (ink + gap), ey + ny * (ink + gap));
        c.lineTo(ex + nx * (ink + gap + len), ey + ny * (ink + gap + len));
      });
    });
    c.strokeStyle = INK; c.lineWidth = ink * 1.15; c.stroke();
  }

  /* ── Coin bag ──────────────────────────────────────────────────────────── */
  function coins() {
    const sack = rad(-12, -2, 52, [0, '#f2d3a0', 0.45, '#c8955a', 1, '#7a4a26']);
    body(() => poly([[-12, -16], [-19, -31], [-8, -26], [0, -35], [8, -26], [19, -31], [12, -16]]), sack);
    body(() => {
      c.moveTo(-12, -16); c.bezierCurveTo(-34, -6, -40, 34, -18, 40); c.lineTo(18, 40);
      c.bezierCurveTo(40, 34, 34, -6, 12, -16); c.closePath();
    }, sack);
    body(() => rrect(-15, -20, 30, 8, 4), '#7a4a26');
    glint(() => { c.moveTo(-24, 10); c.quadraticCurveTo(-23, -2, -15, -8); }, 0.45, 4);
    body(() => circle(17, 24, 17), rad(12, 19, 24, [0, '#fff3a0', 0.45, '#ffc21a', 1, '#d08a00']));
    body(() => circle(17, 24, 10.5), rad(14, 21, 14, [0, '#fff6c0', 1, '#ffd84a']), ink * 0.55);
  }

  /* ── Boom box (the in-world bomb: a red boom box with a lit fuse) ──────── */
  function bomb() {
    cord(() => { c.moveTo(22, -20); c.bezierCurveTo(28, -25, 24, -30, 30, -34); }, '#d8b27a', 4);
    blob(() => circle(31, -36, 12), rad(31, -36, 12, [0, 'rgba(255,157,42,0.5)', 1, 'rgba(255,157,42,0)']));
    const spark = [];
    for (let i = 0; i < 16; i++) {
      const a = i * Math.PI / 8, d = i % 2 ? 3.6 : 9;
      spark.push([31 + Math.cos(a) * d, -36 + Math.sin(a) * d]);
    }
    body(() => poly(spark), '#ffe066', ink * 0.7);
    cord(() => { c.moveTo(-22, -20); c.bezierCurveTo(-20, -38, 20, -38, 22, -20); }, null, 1);
    body(() => rrect(-40, -20, 80, 48, 9), lin(0, -20, 0, 28, [0, '#ff6464', 0.5, '#d8262e', 1, '#9e1b22']));
    body(() => rrect(-9, -15, 18, 9, 2), '#2a2c40', ink * 0.6);
    blob(() => circle(-4, -10.5, 2.2), '#ffffff');
    blob(() => circle(4, -10.5, 2.2), '#ffffff');
    [-1, 1].forEach((s) => {
      blob(() => circle(s * 21, 7, 14), INK);
      blob(() => circle(s * 21, 7, 10.5), rad(s * 21 - 3, 4, 14, [0, '#d9dde8', 0.5, '#8a90a6', 1, '#4a4f63']));
      blob(() => circle(s * 21, 7, 4), INK);
    });
  }

  /* ── Unknown: a friendly "?" bubble ───────────────────────────────────── */
  function unknown() {
    const fill = rad(-12, -16, 60, [0, '#ffffff', 0.5, '#e6e1ff', 1, '#a99cf0']);
    c.beginPath(); circle(0, -4, 37); poly([[-24, 22], [-32, 42], [-6, 30]]);
    c.strokeStyle = INK; c.lineWidth = 2 * ink; c.stroke();
    c.fillStyle = fill; c.fill();
    cord(() => { c.moveTo(-11, -15); c.bezierCurveTo(-11, -31, 12, -32, 11, -17); c.bezierCurveTo(10, -8, 0, -7, 0, 3); }, '#6a2fd6', 9);
    body(() => circle(0, 17, 6), '#6a2fd6');
  }

  const ART = { rocket, rocket3, goldrocket, peel, peel3, ball, bee, zapper, star, shrink, jet, horn, mega, coins, bomb, unknown };

  /* ── API ───────────────────────────────────────────────────────────────── */
  function draw(ctx, id, size) {
    size = +size;
    if (!ctx || typeof ctx.beginPath !== 'function' || !(size > 0) || !isFinite(size)) return;
    const key = typeof id === 'string' && Object.prototype.hasOwnProperty.call(ART, id) ? id : 'unknown';
    const box = BOX[key];
    const k = size * (FIT[key] || FILL) / Math.max(box[2] - box[0], box[3] - box[1]);
    const keepC = c, keepInk = ink, keepDepth = depth;
    c = ctx; depth = 0;
    try {
      push();
      c.translate(size / 2, size / 2);
      c.scale(k, k);
      c.translate(-(box[0] + box[2]) / 2, -(box[1] + box[3]) / 2);
      c.lineJoin = 'round'; c.lineCap = 'round'; c.globalAlpha = 1;
      ink = INK_W * size / k;
      ART[key]();
    } catch (e) {
      /* a broken context must never break the HUD */
    } finally {
      try { while (depth > 0) pop(); } catch (e) { /* ignore */ }
      c = keepC; ink = keepInk; depth = keepDepth;
    }
  }

  function canvas(id, cssSize) {
    const css = +cssSize > 0 && isFinite(+cssSize) ? +cssSize : 64;
    const dpr = Math.min(3, (typeof window !== 'undefined' && +window.devicePixelRatio) || 1);
    const px = Math.max(1, Math.round(css * dpr));
    const cv = document.createElement('canvas');
    cv.width = px; cv.height = px;
    cv.style.width = css + 'px'; cv.style.height = css + 'px';
    const ctx = cv.getContext && cv.getContext('2d');
    if (ctx) draw(ctx, id, px);
    return cv;
  }

  return { IDS, draw, canvas };
})();
