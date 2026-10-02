/**
 * Benny's P3GL — symbols.
 *
 * One painter for every symbol in the game, drawn with 2D canvas paths so it
 * is crisp at any size. The 3D board bakes these into a texture atlas for the
 * peg faces; the HUD, How to Play and the editor use them as images. Colour
 * is never the only signal: every power, hazard and special peg has its own
 * shape here.
 *
 *   P3.icons.glyph(ctx, type, cx, cy, size, opts)     the symbol alone (white with a dark edge)
 *   P3.icons.item(ctx, item|type, cx, cy, size, opts) the full look: coloured body + symbol
 *   P3.icons.url(type, size, opts) → data URL          cached, for <img>
 *   P3.icons.colorOf(item|type) → '#rrggbb'
 */
(function (root) {
  'use strict';

  const P3 = root.P3 = root.P3 || {};
  const C = P3.catalog;

  function colorOf(it) {
    const item = typeof it === 'string' ? { t: it } : it;
    const t = item.t, def = C.TYPES[t];
    if (!def) return '#888888';
    if (t === 'peg') return C.PEG_COLORS[item.c || 'blue'].hex;
    if (t === 'key' || t === 'gate') return C.PEG_COLORS[item.k || 'blue'].hex;
    if (t === 'portal') return C.PORTAL_COLORS[item.p || 0];
    if (t === 'brick') return C.BRICK_HP[item.hp || 1].hex;
    return def.color || '#cccccc';
  }

  /* ── Path helpers ─────────────────────────────────────────────────────── */

  function star(g, cx, cy, ro, ri, n, rot) {
    g.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const r = i % 2 ? ri : ro, a = rot + i * Math.PI / n;
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      if (i) g.lineTo(x, y); else g.moveTo(x, y);
    }
    g.closePath();
  }

  function stroke(g, w, color) { g.lineWidth = w; g.strokeStyle = color; g.stroke(); }
  function fill(g, color) { g.fillStyle = color; g.fill(); }

  /** Fill white with a dark keyline: readable on any peg colour. */
  function ink(g, s, keyline) {
    g.lineJoin = 'round'; g.lineCap = 'round';
    stroke(g, s * (keyline || 0.16), 'rgba(10,10,25,0.85)');
    fill(g, '#ffffff');
  }
  function line(g, s, w) {
    g.lineJoin = 'round'; g.lineCap = 'round';
    stroke(g, s * (w || 0.12) + s * 0.12, 'rgba(10,10,25,0.85)');
    stroke(g, s * (w || 0.12), '#ffffff');
  }

  /* ── Glyphs ───────────────────────────────────────────────────────────── */
  // Each draws centred on (0,0) in a box of half-size s (so it spans -s..s).

  const G = {
    target(g, s) { star(g, 0, 0, s * 0.62, s * 0.27, 5, -Math.PI / 2); ink(g, s); },
    gem(g, s) {
      g.beginPath(); g.moveTo(-s * 0.6, -s * 0.18); g.lineTo(-s * 0.3, -s * 0.52); g.lineTo(s * 0.3, -s * 0.52); g.lineTo(s * 0.6, -s * 0.18); g.lineTo(0, s * 0.62); g.closePath();
      ink(g, s);
      g.beginPath(); g.moveTo(-s * 0.6, -s * 0.18); g.lineTo(s * 0.6, -s * 0.18); g.moveTo(-s * 0.18, -s * 0.52); g.lineTo(-s * 0.26, -s * 0.18); g.lineTo(0, s * 0.62); g.lineTo(s * 0.26, -s * 0.18); g.lineTo(s * 0.18, -s * 0.52);
      stroke(g, s * 0.07, 'rgba(40,120,170,0.9)');
    },
    lantern(g, s) {
      g.beginPath(); g.ellipse(0, s * 0.05, s * 0.42, s * 0.5, 0, 0, Math.PI * 2); ink(g, s);
      g.beginPath(); g.rect(-s * 0.2, -s * 0.62, s * 0.4, s * 0.14); g.rect(-s * 0.16, s * 0.52, s * 0.32, s * 0.12); ink(g, s, 0.1);
      g.beginPath(); for (const x of [-0.2, 0, 0.2]) { g.moveTo(x * s, -s * 0.38); g.quadraticCurveTo(x * s * 1.6, s * 0.05, x * s, s * 0.48); }
      stroke(g, s * 0.06, 'rgba(200,110,30,0.9)');
    },
    key(g, s) {
      g.beginPath(); g.arc(-s * 0.28, -s * 0.2, s * 0.3, 0, Math.PI * 2); g.moveTo(-s * 0.08, 0); g.lineTo(s * 0.55, s * 0.55);
      g.moveTo(s * 0.3, s * 0.3); g.lineTo(s * 0.16, s * 0.44); g.moveTo(s * 0.45, s * 0.45); g.lineTo(s * 0.31, s * 0.59);
      line(g, s, 0.16);
    },
    bumper(g, s) {
      g.beginPath(); g.arc(0, 0, s * 0.55, 0, Math.PI * 2); line(g, s, 0.13);
      g.beginPath(); g.arc(0, 0, s * 0.22, 0, Math.PI * 2); ink(g, s);
    },
    steel(g, s) {
      for (const [x, y] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) { g.beginPath(); g.arc(x * s, y * s, s * 0.12, 0, Math.PI * 2); ink(g, s, 0.08); }
    },
    portal(g, s) {
      g.beginPath();
      for (let i = 0; i <= 60; i++) { const a = i / 60 * Math.PI * 3.2, r = s * (0.1 + i / 60 * 0.52); const x = Math.cos(a) * r, y = Math.sin(a) * r; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
      line(g, s, 0.12);
    },
    multiball(g, s) {
      for (const [x, y] of [[0, -0.32], [-0.34, 0.24], [0.34, 0.24]]) { g.beginPath(); g.arc(x * s, y * s, s * 0.24, 0, Math.PI * 2); ink(g, s, 0.12); }
    },
    extra(g, s) {
      g.beginPath(); g.moveTo(-s * 0.62, 0); g.lineTo(-s * 0.08, 0); g.moveTo(-s * 0.35, -s * 0.27); g.lineTo(-s * 0.35, s * 0.27); line(g, s, 0.15);
      g.beginPath(); g.moveTo(s * 0.12, -s * 0.28); g.lineTo(s * 0.34, -s * 0.48); g.lineTo(s * 0.34, s * 0.5); line(g, s, 0.15);
    },
    multiplier(g, s) {
      g.beginPath(); g.moveTo(-s * 0.62, -s * 0.25); g.lineTo(-s * 0.18, s * 0.25); g.moveTo(-s * 0.18, -s * 0.25); g.lineTo(-s * 0.62, s * 0.25); line(g, s, 0.13);
      g.beginPath(); g.moveTo(s * 0.02, -s * 0.22); g.quadraticCurveTo(s * 0.06, -s * 0.5, s * 0.32, -s * 0.5); g.quadraticCurveTo(s * 0.62, -s * 0.48, s * 0.56, -s * 0.18); g.lineTo(s * 0.04, s * 0.48); g.lineTo(s * 0.62, s * 0.48);
      line(g, s, 0.13);
    },
    zap(g, s) {
      g.beginPath(); g.moveTo(s * 0.18, -s * 0.68); g.lineTo(-s * 0.36, s * 0.08); g.lineTo(-s * 0.02, s * 0.08); g.lineTo(-s * 0.2, s * 0.68); g.lineTo(s * 0.4, -s * 0.12); g.lineTo(s * 0.04, -s * 0.12); g.closePath();
      ink(g, s);
    },
    spray(g, s) {
      g.beginPath();
      for (const a of [-0.55, 0, 0.55]) { const dx = Math.sin(a), dy = Math.cos(a); g.moveTo(0, -s * 0.62); g.lineTo(dx * s * 0.55, -s * 0.62 + dy * s * 0.95); }
      line(g, s, 0.14);
      for (const a of [-0.55, 0, 0.55]) { g.beginPath(); g.arc(Math.sin(a) * s * 0.55, -s * 0.62 + Math.cos(a) * s * 0.95, s * 0.17, 0, Math.PI * 2); ink(g, s, 0.1); }
    },
    net(g, s) {
      g.beginPath(); g.moveTo(-s * 0.65, -s * 0.1); g.quadraticCurveTo(0, s * 0.75, s * 0.65, -s * 0.1);
      for (const x of [-0.35, 0, 0.35]) { g.moveTo(x * s, -s * 0.2); g.lineTo(x * s * 0.9, s * 0.32 - Math.abs(x) * s * 0.3); }
      g.moveTo(-s * 0.5, s * 0.1); g.quadraticCurveTo(0, s * 0.45, s * 0.5, s * 0.1);
      line(g, s, 0.09);
      g.beginPath(); g.arc(0, -s * 0.42, s * 0.18, 0, Math.PI * 2); ink(g, s, 0.1);
    },
    blast(g, s) { star(g, 0, 0, s * 0.68, s * 0.34, 8, -Math.PI / 2); ink(g, s); g.beginPath(); g.arc(0, 0, s * 0.16, 0, Math.PI * 2); fill(g, 'rgba(255,120,40,0.95)'); },
    fire(g, s) {
      g.beginPath(); g.moveTo(0, s * 0.66);
      g.bezierCurveTo(-s * 0.62, s * 0.6, -s * 0.5, -s * 0.05, -s * 0.12, -s * 0.66);
      g.bezierCurveTo(-s * 0.08, -s * 0.25, s * 0.18, -s * 0.2, s * 0.2, -s * 0.48);
      g.bezierCurveTo(s * 0.6, -s * 0.1, s * 0.62, s * 0.6, 0, s * 0.66);
      ink(g, s);
      g.beginPath(); g.ellipse(0, s * 0.32, s * 0.18, s * 0.26, 0, 0, Math.PI * 2); fill(g, 'rgba(255,110,30,0.95)');
    },
    guide(g, s) {
      for (let i = 0; i < 6; i++) { const u = i / 5, x = -s * 0.6 + u * s * 1.2, y = s * 0.5 - Math.sin(u * Math.PI) * s * 0.85; g.beginPath(); g.arc(x, y, s * (0.07 + u * 0.06), 0, Math.PI * 2); ink(g, s, 0.08); }
    },
    thief(g, s) {
      g.beginPath(); g.moveTo(-s * 0.68, -s * 0.12); g.quadraticCurveTo(-s * 0.6, s * 0.32, -s * 0.2, s * 0.24); g.quadraticCurveTo(0, s * 0.08, s * 0.2, s * 0.24); g.quadraticCurveTo(s * 0.6, s * 0.32, s * 0.68, -s * 0.12); g.quadraticCurveTo(0, -s * 0.3, -s * 0.68, -s * 0.12); g.closePath();
      ink(g, s);
      g.beginPath(); g.ellipse(-s * 0.32, s * 0.02, s * 0.12, s * 0.08, 0, 0, Math.PI * 2); g.ellipse(s * 0.32, s * 0.02, s * 0.12, s * 0.08, 0, 0, Math.PI * 2); fill(g, 'rgba(20,20,30,0.95)');
    },
    shrink(g, s) {
      g.beginPath();
      for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { g.moveTo(dx * s * 0.62, dy * s * 0.62); g.lineTo(dx * s * 0.24, dy * s * 0.24); g.moveTo(dx * s * 0.24, dy * s * 0.48); g.lineTo(dx * s * 0.24, dy * s * 0.24); g.lineTo(dx * s * 0.48, dy * s * 0.24); }
      line(g, s, 0.11);
    },
    sludge(g, s) {
      g.beginPath(); g.moveTo(-s * 0.6, -s * 0.4); g.lineTo(s * 0.6, -s * 0.4); g.lineTo(s * 0.6, -s * 0.05);
      g.quadraticCurveTo(s * 0.45, s * 0.1, s * 0.38, -s * 0.02); g.lineTo(s * 0.34, s * 0.4); g.arc(s * 0.22, s * 0.4, s * 0.12, 0, Math.PI); g.lineTo(s * 0.1, 0);
      g.quadraticCurveTo(-s * 0.1, s * 0.12, -s * 0.2, 0); g.lineTo(-s * 0.24, s * 0.24); g.arc(-s * 0.35, s * 0.24, s * 0.11, 0, Math.PI); g.lineTo(-s * 0.46, -s * 0.02); g.quadraticCurveTo(-s * 0.55, s * 0.05, -s * 0.6, -s * 0.05); g.closePath();
      ink(g, s);
    },
    spike(g, s) { star(g, 0, 0, s * 0.7, s * 0.3, 7, -Math.PI / 2); ink(g, s); },
    hole(g, s) {
      g.beginPath();
      for (let k = 0; k < 3; k++) {
        for (let i = 0; i <= 24; i++) { const a = k * 2.094 + i / 24 * 2.4, r = s * (0.66 - i / 24 * 0.5); const x = Math.cos(a) * r, y = Math.sin(a) * r; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
      }
      line(g, s, 0.09);
    },
    armor(g, s) {
      g.beginPath(); g.moveTo(0, -s * 0.62); g.lineTo(s * 0.52, -s * 0.36); g.lineTo(s * 0.44, s * 0.2); g.lineTo(0, s * 0.62); g.lineTo(-s * 0.44, s * 0.2); g.lineTo(-s * 0.52, -s * 0.36); g.closePath();
      ink(g, s);
    },
    glass(g, s) { g.beginPath(); g.moveTo(-s * 0.5, s * 0.3); g.lineTo(-s * 0.1, -s * 0.3); g.moveTo(-s * 0.1, s * 0.35); g.lineTo(s * 0.3, -s * 0.25); line(g, s, 0.1); },
    wall(g, s) { G.steel(g, s); },
    gate(g, s) {
      g.beginPath(); g.arc(0, -s * 0.14, s * 0.24, 0, Math.PI * 2); ink(g, s, 0.12);
      g.beginPath(); g.moveTo(-s * 0.14, -s * 0.02); g.lineTo(-s * 0.22, s * 0.56); g.lineTo(s * 0.22, s * 0.56); g.lineTo(s * 0.14, -s * 0.02); g.closePath(); ink(g, s, 0.12);
      g.beginPath(); g.arc(0, -s * 0.14, s * 0.09, 0, Math.PI * 2); fill(g, 'rgba(20,20,30,0.95)');
    },
    pause(g, s) { g.beginPath(); g.rect(-s * 0.4, -s * 0.5, s * 0.28, s * 1.0); g.rect(s * 0.12, -s * 0.5, s * 0.28, s * 1.0); ink(g, s, 0.1); },
    ball(g, s) { g.beginPath(); g.arc(0, 0, s * 0.55, 0, Math.PI * 2); ink(g, s, 0.1); }
  };

  function glyph(g, type, cx, cy, size, opts) {
    const fn = G[type];
    if (!fn) return false;
    g.save();
    g.translate(cx, cy);
    if (opts && opts.rotate) g.rotate(opts.rotate);
    fn(g, size / 2);
    g.restore();
    return true;
  }

  /** Shade a colour toward white (k > 0) or black (k < 0). */
  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, gg = (n >> 8) & 255, b = n & 255;
    if (k > 0) { r += (255 - r) * k; gg += (255 - gg) * k; b += (255 - b) * k; }
    else { r *= 1 + k; gg *= 1 + k; b *= 1 + k; }
    return 'rgb(' + Math.round(r) + ',' + Math.round(gg) + ',' + Math.round(b) + ')';
  }

  /** The full look of an item, as a flat icon (HUD, legend, editor). */
  function item(g, it, cx, cy, size, opts) {
    opts = opts || {};
    const itm = typeof it === 'string' ? { t: it } : it;
    const t = itm.t, def = C.TYPES[t];
    if (!def) return;
    const col = colorOf(itm), s = size / 2;
    g.save();
    if (def.shape === 'peg') {
      if (t === 'spike') {
        star(g, cx, cy, s * 0.98, s * 0.6, 9, -Math.PI / 2);
        const grd = g.createRadialGradient(cx - s * 0.3, cy - s * 0.3, s * 0.1, cx, cy, s);
        grd.addColorStop(0, shade(col, 0.45)); grd.addColorStop(1, shade(col, -0.35));
        g.fillStyle = grd; g.fill(); stroke(g, Math.max(1, s * 0.08), 'rgba(0,0,0,0.6)');
      } else if (t === 'hole') {
        const grd = g.createRadialGradient(cx, cy, s * 0.1, cx, cy, s);
        grd.addColorStop(0, '#000'); grd.addColorStop(0.6, '#1a0f2e'); grd.addColorStop(0.85, '#8a4dff'); grd.addColorStop(1, 'rgba(138,77,255,0)');
        g.beginPath(); g.arc(cx, cy, s, 0, Math.PI * 2); g.fillStyle = grd; g.fill();
      } else if (t === 'gem') {
        g.beginPath(); g.moveTo(cx, cy - s * 0.98); g.lineTo(cx + s * 0.9, cy); g.lineTo(cx, cy + s * 0.98); g.lineTo(cx - s * 0.9, cy); g.closePath();
        const grd = g.createLinearGradient(cx - s, cy - s, cx + s, cy + s);
        grd.addColorStop(0, shade(col, 0.6)); grd.addColorStop(0.5, col); grd.addColorStop(1, shade(col, -0.4));
        g.fillStyle = grd; g.fill(); stroke(g, Math.max(1, s * 0.08), 'rgba(0,0,0,0.55)');
      } else {
        g.beginPath(); g.arc(cx, cy, s * 0.96, 0, Math.PI * 2);
        const lit = opts.lit;
        const grd = g.createRadialGradient(cx - s * 0.35, cy - s * 0.4, s * 0.08, cx, cy, s);
        grd.addColorStop(0, shade(col, lit ? 0.85 : 0.5)); grd.addColorStop(0.55, lit ? shade(col, 0.35) : col); grd.addColorStop(1, shade(col, lit ? 0 : -0.4));
        g.fillStyle = grd; g.fill();
        stroke(g, Math.max(1, s * 0.08), lit ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.55)');
        if (t === 'portal') { g.beginPath(); g.arc(cx, cy, s * 0.62, 0, Math.PI * 2); g.fillStyle = 'rgba(0,0,0,0.55)'; g.fill(); }
      }
      const sym = t === 'peg' ? (opts.target ? 'target' : null) : (t === 'gem' ? null : t);
      if (sym) glyph(g, sym, cx, cy, size * (t === 'hole' ? 0.7 : 0.62));
    } else {
      // Bricks: a rounded bar, symbol in the middle, dots for hits left.
      const w = opts.w || size * 1.6, h = opts.h || size * 0.62;
      const r = Math.min(h * 0.3, 8);
      g.beginPath();
      g.moveTo(cx - w / 2 + r, cy - h / 2); g.arcTo(cx + w / 2, cy - h / 2, cx + w / 2, cy + h / 2, r); g.arcTo(cx + w / 2, cy + h / 2, cx - w / 2, cy + h / 2, r);
      g.arcTo(cx - w / 2, cy + h / 2, cx - w / 2, cy - h / 2, r); g.arcTo(cx - w / 2, cy - h / 2, cx + w / 2, cy - h / 2, r); g.closePath();
      const grd = g.createLinearGradient(cx, cy - h / 2, cx, cy + h / 2);
      grd.addColorStop(0, shade(col, t === 'glass' ? 0.6 : 0.35)); grd.addColorStop(1, shade(col, -0.35));
      g.fillStyle = t === 'glass' ? 'rgba(191,239,255,0.55)' : grd; g.fill();
      stroke(g, Math.max(1, h * 0.08), 'rgba(0,0,0,0.55)');
      if (t === 'brick') {
        const n = itm.hp || 1, d = h * 0.2;
        for (let i = 0; i < n; i++) { g.beginPath(); g.arc(cx + (i - (n - 1) / 2) * d * 2.4, cy, d, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill(); stroke(g, d * 0.4, 'rgba(0,0,0,0.6)'); }
      } else {
        glyph(g, t, cx, cy, h * 0.9);
      }
    }
    g.restore();
  }

  const cache = {};
  function url(type, size, opts) {
    const key = JSON.stringify([type, size, opts || {}]);
    if (cache[key]) return cache[key];
    if (!root.document) return '';
    const c = root.document.createElement('canvas');
    const isBrick = C.TYPES[typeof type === 'string' ? type : type.t] && C.TYPES[typeof type === 'string' ? type : type.t].shape === 'brick';
    c.width = isBrick ? size * 2 : size; c.height = size;
    const g = c.getContext('2d');
    if (opts && opts.glyphOnly) glyph(g, typeof type === 'string' ? type : type.t, size / 2, size / 2, size * 0.86);
    else item(g, type, c.width / 2, size / 2, size * 0.92, Object.assign({}, opts, isBrick ? { w: size * 1.84, h: size * 0.7 } : {}));
    cache[key] = c.toDataURL('image/png');
    return cache[key];
  }

  P3.icons = { glyph, item, url, colorOf, shade, GLYPHS: Object.keys(G) };
})(typeof window !== 'undefined' ? window : globalThis);
