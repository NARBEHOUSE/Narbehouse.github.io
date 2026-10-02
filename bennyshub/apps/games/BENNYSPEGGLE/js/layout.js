/**
 * Benny's P3GL — where the board goes on this screen.
 *
 * The board is always scaled uniformly (never stretched). Wide screens get
 * side panels for the HUD; tall screens (phones held upright, tablets in
 * portrait) stack the HUD above and below the board. The base plate and the
 * Pause button never overlap: the bottom-left corner belongs to Pause.
 *
 *   P3.layout.compute(w, h, safe) → {
 *     w, h, orient: 'wide'|'tall', scale,               scale = CSS px per board px
 *     board: { x, y, w, h },                            CSS px, top-left origin
 *     left: { x, y, w, h }, right: {...},               side panels (wide)
 *     top: {...}, bottom: {...}                         bars (tall)
 *   }
 *   P3.layout.toScreen(L, bx, by) → { x, y }            board px → CSS px
 *   P3.layout.toBoard(L, sx, sy) → { x, y }             CSS px → board px
 */
(function (root) {
  'use strict';

  const P3 = root.P3 = root.P3 || {};
  const C = P3.catalog;
  const BW = C.BOARD.W, BH = C.BOARD.H;
  const ASPECT = BW / BH;

  function compute(w, h, safe) {
    safe = safe || { top: 0, right: 0, bottom: 0, left: 0 };
    const L = { w, h };
    const availW = w - safe.left - safe.right, availH = h - safe.top - safe.bottom;
    const wide = availW / availH > 1.18;
    if (wide) {
      L.orient = 'wide';
      const pad = Math.max(8, Math.round(availH * 0.018));
      let bh = availH - pad * 2;
      let bw = bh * ASPECT;
      const minSide = Math.max(150, Math.min(300, availW * 0.16));
      if (availW - bw < minSide * 2) { bw = availW - minSide * 2; bh = bw / ASPECT; }
      const bx = safe.left + (availW - bw) / 2, by = safe.top + (availH - bh) / 2;
      L.board = { x: bx, y: by, w: bw, h: bh };
      L.left = { x: safe.left, y: safe.top, w: bx - safe.left, h: availH };
      L.right = { x: bx + bw, y: safe.top, w: w - safe.right - (bx + bw), h: availH };
      L.top = null; L.bottom = null;
    } else {
      L.orient = 'tall';
      const topBar = Math.max(64, Math.min(110, availH * 0.09));
      const bottomBar = 184;
      const side = Math.max(6, Math.round(availW * 0.012));
      let bw = availW - side * 2;
      let bh = bw / ASPECT;
      const roomH = availH - topBar - bottomBar;
      if (bh > roomH) { bh = roomH; bw = bh * ASPECT; }
      const bx = safe.left + (availW - bw) / 2;
      const spare = roomH - bh;
      const by = safe.top + topBar + spare * 0.45;
      L.board = { x: bx, y: by, w: bw, h: bh };
      L.top = { x: safe.left, y: safe.top, w: availW, h: by - safe.top };
      L.bottom = { x: safe.left, y: by + bh, w: availW, h: h - safe.bottom - (by + bh) };
      L.left = null; L.right = null;
    }
    L.scale = L.board.w / BW;
    return L;
  }

  function toScreen(L, bx, by) { return { x: L.board.x + bx * L.scale, y: L.board.y + by * L.scale }; }
  function toBoard(L, sx, sy) { return { x: (sx - L.board.x) / L.scale, y: (sy - L.board.y) / L.scale }; }

  /** Orthographic frustum (board px, y up) that maps the board into its rect. */
  function frustum(L) {
    const s = L.scale;
    const left = -L.board.x / s, top = L.board.y / s;
    return { left, right: left + L.w / s, top, bottom: top - L.h / s };
  }

  P3.layout = { compute, toScreen, toBoard, frustum, ASPECT };
})(typeof window !== 'undefined' ? window : globalThis);
