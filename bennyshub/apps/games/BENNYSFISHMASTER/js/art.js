/**
 * Benny's FishMaster — pond painting.
 *
 * Everything the canvas shows is drawn here in plain canvas-2D paths: there is
 * no image file, no sprite sheet and no build step anywhere in this game, so
 * "art" means code that draws a naturalistic pond — an irregular shoreline
 * with boulder edging, layered water, gravel, lily pads and marginal reeds.
 *
 * Two rules shape this whole file:
 *
 *  1. **Nothing here invents geometry.** A lake is still the same five sectors
 *     by three distance bands that lakegen.js generates and game.js aims into;
 *     this module only decides what those cells *look* like. Every shape is a
 *     pure function of the lake's stored seed, so a pond redraws identically
 *     after a reload, and the highlighted cell always sits exactly where the
 *     game says you are casting.
 *
 *  2. **Colour always comes from the theme.** Same `css()` / CSS-variable
 *     contract the rest of the game uses (see index.html), so all four colour
 *     profiles repaint the pond. High Contrast passes `flat: true`, which
 *     keeps every silhouette but drops gradients, texture and decoration in
 *     favour of solid fills and heavy outlines.
 *
 * The static pond is expensive to paint and never changes mid-session, so
 * game.js builds it once into an offscreen bitmap (buildLakeBitmap) and blits
 * that each frame; only the boat, the aim highlight and the ripples are drawn
 * live.
 */
window.FishMasterArt = (function () {
  'use strict';

  const LG = window.FishMasterLakeGen;
  const TAU = Math.PI * 2;

  /* ── Projection ──────────────────────────────────────────────────────────
     The player is sitting in the boat, not looking straight down, so distance
     compresses vertically. project() is the single place a (bearing, radius)
     gameplay coordinate becomes a pixel — game.js's landing preview calls it
     too, which is what keeps the bobber on the patch of water the game just
     narrated. Tuned so the far bank stays on screen even for the widest lake
     (radiusMul 1.3) instead of running off the top of the frame. */
  const SQUASH_Y = 0.78;
  const SPREAD_X = 0.85;

  // How far inside the bank a cast may actually land. Without it a `far` cast
  // (BAND_FRAC 1.0) would land exactly on the shoreline, i.e. on the rocks.
  const WATER_INSET = 0.88;
  const SHORE_MARGIN = 70;  // px of bank kept on screen in every direction
  const MIN_SHORE_R = 120;

  function project(bearingDeg, r, geom) {
    const a = bearingDeg * Math.PI / 180;
    return {
      x: geom.boatX + Math.sin(a) * r * SPREAD_X,
      y: geom.boatY - Math.cos(a) * r * SQUASH_Y
    };
  }

  /**
   * How far the ray at this bearing can travel before it leaves the frame
   * through the top or a side. The bottom edge is deliberately ignored: the
   * near shore is behind the player and is *meant* to run off the bottom of
   * the canvas, so clamping against it would draw a bank right beside the boat.
   */
  function edgeDistance(bearingDeg, geom) {
    const a = bearingDeg * Math.PI / 180;
    const dx = Math.sin(a) * SPREAD_X;
    const dy = -Math.cos(a) * SQUASH_Y;
    let best = Infinity;
    if (dx > 1e-6) best = Math.min(best, (geom.W - geom.boatX) / dx);
    if (dx < -1e-6) best = Math.min(best, -geom.boatX / dx);
    if (dy < -1e-6) best = Math.min(best, -geom.boatY / dy);
    return best;
  }

  /* ── Colour helpers ──────────────────────────────────────────────────────
     Theme variables give us one tone per material; highlights and shadows are
     derived from it here rather than adding three more variables per material
     to every one of the four profiles. */
  function parseColor(c) {
    if (typeof c !== 'string') return null;
    const s = c.trim();
    if (s[0] === '#') {
      const h = s.slice(1);
      if (h.length === 3) return { r: parseInt(h[0] + h[0], 16), g: parseInt(h[1] + h[1], 16), b: parseInt(h[2] + h[2], 16) };
      if (h.length === 6) return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
      return null;
    }
    const m = s.match(/rgba?\(([^)]+)\)/);
    if (m) {
      const p = m[1].split(',').map(x => parseFloat(x));
      if (p.length >= 3) return { r: p[0], g: p[1], b: p[2] };
    }
    return null;
  }
  const clamp255 = n => Math.max(0, Math.min(255, Math.round(n)));

  /** amt > 0 lightens toward white, amt < 0 darkens toward black. */
  function shade(c, amt) {
    const p = parseColor(c);
    if (!p) return c;
    const t = amt > 0 ? 255 : 0;
    const k = Math.abs(amt);
    return `rgb(${clamp255(p.r + (t - p.r) * k)},${clamp255(p.g + (t - p.g) * k)},${clamp255(p.b + (t - p.b) * k)})`;
  }
  function alpha(c, a) {
    const p = parseColor(c);
    if (!p) return c;
    return `rgba(${clamp255(p.r)},${clamp255(p.g)},${clamp255(p.b)},${a})`;
  }

  /* ── Path helpers ────────────────────────────────────────────────────────
     Organic closed shapes are point lists smoothed with the midpoint-quadratic
     trick BENNYSMINIGOLF already uses for its course shapes: aim each curve at
     the point itself and end it halfway to the next one, so the outline passes
     smoothly through every gap with no crease at the vertices. */
  function blobPath(ctx, pts) {
    const n = pts.length;
    if (n < 3) return;
    const last = pts[n - 1], first = pts[0];
    ctx.moveTo((last.x + first.x) / 2, (last.y + first.y) / 2);
    for (let i = 0; i < n; i++) {
      const p = pts[i], q = pts[(i + 1) % n];
      ctx.quadraticCurveTo(p.x, p.y, (p.x + q.x) / 2, (p.y + q.y) / 2);
    }
    ctx.closePath();
  }

  /* ── Shoreline ───────────────────────────────────────────────────────────
     The bank radius at any bearing: the sector radiusMul values lakegen
     produced, cosine-interpolated between sectors, times a few seeded sine
     octaves — the same hand-rolled stand-in for Perlin noise lakegen uses, so
     the shape stays reproducible from the seed alone. Past the ±70° gameplay
     fan the radius flares out so the bank leaves the frame at the sides
     instead of closing into a visible circle behind the boat. */
  function shoreRadius(lake, bearing, geom) {
    const clamped = Math.max(-70, Math.min(70, bearing));
    const mul = LG.radiusMulAt(lake, clamped);
    const over = Math.max(0, Math.abs(bearing) - 70) / 34;
    const flare = 1 + over * over * 0.9;
    const s = lake.seed;
    const n = 0.055 * Math.sin(s * 0.013 + bearing * 0.09)
            + 0.035 * Math.sin(s * 0.037 + bearing * 0.21)
            + 0.020 * Math.sin(s * 0.071 + bearing * 0.47);
    const raw = geom.maxR * mul * flare * (1 + n);
    // A lake whose radiusMul runs to 1.3 would otherwise push the far bank off
    // the top of a 720-tall frame; clamp so there is always a strip of bank to
    // see, without touching the radiusMul values gameplay is built on.
    const ceiling = edgeDistance(bearing, geom) - SHORE_MARGIN;
    return Math.max(MIN_SHORE_R, Math.min(raw, ceiling));
  }

  /** The furthest a lure can land at this bearing — always inside the bank. */
  function waterRadius(lake, bearing, geom) {
    return shoreRadius(lake, bearing, geom) * WATER_INSET;
  }

  /**
   * The landing radius for one sector/band. game.js's computeLanding() uses
   * this instead of `maxR × bandFrac × radiusMul` so the bobber lands on the
   * painted water rather than wherever the un-clamped maths happened to point.
   * The near/mid/far proportions themselves (CFG.BAND_FRAC) are unchanged.
   */
  function bandRadius(lake, sectorIx, band, geom) {
    const s = lake.sectors[sectorIx] || lake.sectors[0];
    return waterRadius(lake, s.bearing, geom) * geom.bandFrac[band];
  }

  function shorelinePoints(lake, geom) {
    const pts = [];
    for (let b = -104; b <= 104; b += 2) pts.push(project(b, shoreRadius(lake, b, geom), geom));
    // Close the loop well outside the frame so the water reaches the bottom
    // edge — the near shore is behind the player, not something they can see.
    pts.push({ x: geom.W + 260, y: geom.H + 260 });
    pts.push({ x: -260, y: geom.H + 260 });
    return pts;
  }

  function shorelinePath(ctx, lake, geom) {
    ctx.beginPath();
    blobPath(ctx, shorelinePoints(lake, geom));
  }

  /* ── Cell geometry ───────────────────────────────────────────────────────
     One sector × one band = one patch of water the player can aim at. Each
     cell gets its own PRNG keyed off the lake seed and the cell's coordinates,
     rather than drawing from one shared stream: that way the aim highlight can
     rebuild exactly the blob the static bitmap already painted, without having
     to replay every random call that came before it. */
  function cellRand(lake, sectorIx, bandIx) {
    return LG.mulberry32((lake.seed >>> 0) + sectorIx * 7919 + bandIx * 104729 + 17);
  }

  function cellSpan(lake, sectorIx, band, geom) {
    const sectors = lake.sectors;
    const s = sectors[sectorIx];
    const half = (LG.ARC_DEG / (sectors.length - 1)) / 2;
    const bands = LG.BANDS;
    const bi = bands.indexOf(band);
    const fOuter = geom.bandFrac[band];
    const fInner = bi <= 0 ? 0 : geom.bandFrac[bands[bi - 1]];
    // Radii are per-bearing rather than one value for the whole cell, so a
    // cell's outer edge follows the organic shoreline instead of cutting a
    // circular arc across it.
    return {
      bandIx: bi,
      a0: s.bearing - half,
      a1: s.bearing + half,
      rOutAt: b => waterRadius(lake, b, geom) * fOuter,
      rInAt:  b => waterRadius(lake, b, geom) * fInner
    };
  }

  /**
   * An irregular blob covering one cell. Deliberately drawn a little larger
   * than the cell it represents so neighbouring patches overlap and blend
   * instead of tiling into visible wedges again.
   */
  function cellBlobPoints(lake, sectorIx, band, geom) {
    const c = cellSpan(lake, sectorIx, band, geom);
    const rand = cellRand(lake, sectorIx, c.bandIx);
    const pad = (c.a1 - c.a0) * 0.14;
    const a0 = c.a0 - pad, a1 = c.a1 + pad;
    const N = 10;
    const pts = [];
    for (let k = 0; k <= N; k++) {
      const b = a0 + (a1 - a0) * (k / N);
      pts.push(project(b, c.rOutAt(b) * 1.04 * (1 + (rand() - 0.5) * 0.10), geom));
    }
    for (let k = N; k >= 0; k--) {
      const b = a0 + (a1 - a0) * (k / N);
      pts.push(project(b, Math.max(46, c.rInAt(b) * 0.92) * (1 + (rand() - 0.5) * 0.10), geom));
    }
    return pts;
  }

  /** A random point inside a cell, for scattering decoration across it. */
  function cellSample(c, rand, geom, inset) {
    const k = inset === undefined ? 0.12 : inset;
    const b = c.a0 + (c.a1 - c.a0) * (k + rand() * (1 - 2 * k));
    const rIn = c.rInAt(b), rOut = c.rOutAt(b);
    const r = rIn + (rOut - rIn) * (k + rand() * (1 - 2 * k));
    return project(b, r, geom);
  }

  /* ── Small painted things ────────────────────────────────────────────────
     Each of these draws in absolute canvas coordinates and cleans up after
     itself, so they can be scattered anywhere without the caller tracking
     transform state. */
  function boulder(ctx, x, y, w, h, rot, css, rand, flat) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    if (!flat) {
      ctx.fillStyle = alpha(css('--rock-dark'), 0.45);
      ctx.beginPath(); ctx.ellipse(0, h * 0.36, w * 1.02, h * 0.58, 0, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = flat ? css('--rock-mid') : shade(css('--rock-mid'), (rand() - 0.5) * 0.3);
    ctx.beginPath(); ctx.ellipse(0, 0, w, h, 0, 0, TAU); ctx.fill();
    if (flat) {
      ctx.strokeStyle = css('--line'); ctx.lineWidth = 3; ctx.stroke();
    } else {
      ctx.fillStyle = alpha(css('--rock-light'), 0.55);
      ctx.beginPath(); ctx.ellipse(-w * 0.2, -h * 0.28, w * 0.5, h * 0.38, -0.4, 0, TAU); ctx.fill();
      ctx.strokeStyle = alpha(css('--rock-dark'), 0.5); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(0, 0, w, h, 0, 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }

  function lilyPad(ctx, x, y, r, rot, css, flat) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(1, 0.62); // pads lie flat on the water, so perspective squashes them
    const notch = 0.34;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, r, notch, TAU - notch);
    ctx.closePath();
    ctx.fillStyle = css('--lily');
    ctx.fill();
    if (flat) {
      ctx.strokeStyle = css('--line'); ctx.lineWidth = 2.5; ctx.stroke();
    } else {
      ctx.strokeStyle = alpha(shade(css('--lily'), -0.45), 0.8); ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = alpha(shade(css('--lily'), 0.35), 0.45);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, r * 0.66, Math.PI * 0.95, Math.PI * 1.7);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function reedClump(ctx, x, y, h, count, css, rand, flat) {
    ctx.save();
    ctx.translate(x, y);
    for (let i = 0; i < count; i++) {
      const dx = (rand() - 0.5) * 22;
      const len = h * (0.65 + rand() * 0.55);
      const lean = (rand() - 0.5) * 26;
      ctx.strokeStyle = flat ? css('--reed') : shade(css('--reed'), (rand() - 0.5) * 0.35);
      ctx.lineWidth = 2.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(dx, 0);
      ctx.quadraticCurveTo(dx + lean * 0.4, -len * 0.6, dx + lean, -len);
      ctx.stroke();
      // every third stalk gets a cattail head, which is what reads as "pond"
      // rather than "grass" at this size
      if (i % 3 === 0) {
        ctx.fillStyle = flat ? css('--log') : shade(css('--log'), 0.1);
        ctx.beginPath();
        ctx.ellipse(dx + lean, -len - 5, 3.2, 8, lean * 0.01, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function foliageClump(ctx, x, y, r, css, rand, flat) {
    if (flat) return; // High Contrast keeps the bank empty so the rim reads
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = css('--foliage-dark');
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU + rand();
      ctx.beginPath();
      ctx.ellipse(Math.cos(a) * r * 0.45, Math.sin(a) * r * 0.3, r * (0.55 + rand() * 0.3), r * (0.45 + rand() * 0.25), a, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = alpha(css('--foliage-light'), 0.55);
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.ellipse(-r * 0.2 + (rand() - 0.5) * r * 0.5, -r * 0.3 + (rand() - 0.5) * r * 0.3, r * 0.4, r * 0.28, rand(), 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  /* ── Biome decoration ────────────────────────────────────────────────────
     What actually distinguishes one patch of water from another once the flat
     wedge colours are gone. Counts scale with the cell's on-screen size so a
     near cell isn't as sparse as a far one. */
  function decorateCell(ctx, lake, sectorIx, band, biomeId, geom, css, flat) {
    const c = cellSpan(lake, sectorIx, band, geom);
    const rand = cellRand(lake, sectorIx, c.bandIx);
    // Same seed as the blob's own wobble, so nudge the stream on a few steps:
    // decoration that lined up with the edge wobble would look mechanical.
    rand(); rand(); rand();
    const midB = (c.a0 + c.a1) / 2;
    const mid = project(midB, (c.rInAt(midB) + c.rOutAt(midB)) / 2, geom);
    const depth = Math.max(0.25, Math.min(1, mid.y / geom.H)); // nearer = bigger
    const density = flat ? 0.35 : 1;

    if (biomeId === 'shallows') {
      ctx.fillStyle = alpha(css('--sand'), flat ? 0.5 : 0.3);
      const pts = cellBlobPoints(lake, sectorIx, band, geom);
      ctx.beginPath(); blobPath(ctx, pts.map(p => ({ x: mid.x + (p.x - mid.x) * 0.72, y: mid.y + (p.y - mid.y) * 0.72 }))); ctx.fill();
      if (flat) return;
      for (let i = 0; i < 22 * density; i++) {
        const p = cellSample(c, rand, geom);
        ctx.fillStyle = alpha(shade(css('--sand'), (rand() - 0.5) * 0.5), 0.55);
        ctx.beginPath(); ctx.ellipse(p.x, p.y, 2.4 * depth + 1, 1.7 * depth + 0.8, 0, 0, TAU); ctx.fill();
      }
      ctx.strokeStyle = alpha(css('--glint'), 0.16);
      ctx.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        const p = cellSample(c, rand, geom);
        const w = 26 + rand() * 34;
        ctx.beginPath();
        ctx.moveTo(p.x - w / 2, p.y);
        ctx.quadraticCurveTo(p.x, p.y - 5 * depth, p.x + w / 2, p.y);
        ctx.stroke();
      }

    } else if (biomeId === 'weedbed') {
      if (!flat) {
        for (let i = 0; i < 16; i++) { // submerged grass, drawn under the pads
          const p = cellSample(c, rand, geom);
          ctx.strokeStyle = alpha(shade(css('--reed'), -0.25), 0.4);
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.quadraticCurveTo(p.x + (rand() - 0.5) * 16, p.y - 14 * depth, p.x + (rand() - 0.5) * 26, p.y - 24 * depth);
          ctx.stroke();
        }
      }
      const pads = Math.round(7 * density) + 2;
      for (let i = 0; i < pads; i++) {
        const p = cellSample(c, rand, geom);
        lilyPad(ctx, p.x, p.y, (11 + rand() * 12) * (0.6 + depth * 0.7), rand() * TAU, css, flat);
      }
      const clumps = Math.round(3 * density) + 1;
      for (let i = 0; i < clumps; i++) {
        const b = c.a0 + (c.a1 - c.a0) * rand();
        const p = project(b, c.rOutAt(b) * (0.9 + rand() * 0.08), geom);
        reedClump(ctx, p.x, p.y, 34 * (0.6 + depth * 0.7), 5, css, rand, flat);
      }

    } else if (biomeId === 'dropoff') {
      // The bottom falling away, painted as a gradient running along the cell's
      // own ray — light where the shelf still holds, dark where it drops. An
      // earlier version stroked a dark crescent here and it read as a bar lying
      // on the water rather than as depth.
      ctx.save();
      ctx.beginPath();
      blobPath(ctx, cellBlobPoints(lake, sectorIx, band, geom));
      ctx.clip();
      if (!flat) {
        const nearP = project(midB, c.rInAt(midB), geom);
        const farP = project(midB, c.rOutAt(midB), geom);
        const deep = css('--water-deep');
        const g = ctx.createLinearGradient(nearP.x, nearP.y, farP.x, farP.y);
        g.addColorStop(0, alpha(deep, 0));
        g.addColorStop(0.4, alpha(deep, 0.16));
        g.addColorStop(1, alpha(deep, 0.46));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, geom.W, geom.H);
      }
      // The lip itself: one line where the shelf breaks. In High Contrast this
      // is the *only* drop-off marking — a dark depth gradient there would bury
      // the biome's identifying colour under near-black.
      ctx.strokeStyle = flat ? css('--line') : alpha(css('--glint'), 0.14);
      ctx.lineWidth = flat ? 3 : 2.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let k = 0; k <= 12; k++) {
        const b = c.a0 + (c.a1 - c.a0) * (k / 12);
        const rIn = c.rInAt(b);
        const p = project(b, rIn + (c.rOutAt(b) - rIn) * 0.3, geom);
        if (k === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
      ctx.restore();

    } else if (biomeId === 'rockyshore') {
      const rocks = Math.round(7 * density) + 2;
      for (let i = 0; i < rocks; i++) {
        const p = cellSample(c, rand, geom);
        const w = (10 + rand() * 16) * (0.6 + depth * 0.8);
        ctx.save();
        ctx.globalAlpha = flat ? 1 : 0.82; // submerged, so slightly veiled
        boulder(ctx, p.x, p.y, w, w * 0.66, rand() * TAU, css, rand, flat);
        ctx.restore();
      }
      if (flat) return;
      for (let i = 0; i < 26; i++) {
        const p = cellSample(c, rand, geom);
        ctx.fillStyle = alpha(shade(css('--rock-light'), (rand() - 0.5) * 0.4), 0.4);
        ctx.beginPath(); ctx.ellipse(p.x, p.y, 2.2 * depth + 1, 1.6 * depth + 0.7, 0, 0, TAU); ctx.fill();
      }

    } else if (biomeId === 'deepchannel') {
      if (flat) return;
      const p = cellSample(c, rand, geom, 0.3);
      const len = 60 * (0.6 + depth * 0.7);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((rand() - 0.5) * 1.2);
      ctx.fillStyle = alpha(css('--log'), 0.5);
      ctx.beginPath(); ctx.ellipse(0, 0, len, 9 * (0.6 + depth * 0.6), 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = alpha(shade(css('--log'), -0.4), 0.5); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-len * 0.6, -3); ctx.lineTo(len * 0.5, 1); ctx.stroke();
      ctx.restore();
      for (let i = 0; i < 7; i++) { // a few rising bubbles for depth cueing
        const q = cellSample(c, rand, geom);
        ctx.strokeStyle = alpha(css('--glint'), 0.14);
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(q.x, q.y, 2 + rand() * 3, 0, TAU); ctx.stroke();
      }
    }
  }

  /* ══════════════════════════════════════════════════════════════════════════
     THE STATIC POND
     ══════════════════════════════════════════════════════════════════════════ */

  /**
   * Paints the whole unchanging pond — bank, plantings, water, biome patches,
   * rock rim — into an offscreen canvas. Called once per lake and again on a
   * theme change, never per frame.
   *
   * Supersampled 2× because the visible canvas is itself DPR-scaled up to 2×;
   * blitting a 1× bitmap into that would soften every edge in the scene.
   */
  function buildLakeBitmap(lake, css, geom, opts) {
    const flat = !!(opts && opts.flat);
    const SUPER = 2;
    const cv = document.createElement('canvas');
    cv.width = geom.W * SUPER;
    cv.height = geom.H * SUPER;
    const ctx = cv.getContext('2d');
    ctx.scale(SUPER, SUPER);

    paintBank(ctx, lake, geom, css, flat);
    paintWater(ctx, lake, geom, css, flat);
    paintRockRim(ctx, lake, geom, css, flat);
    if (!flat) paintFinish(ctx, lake, geom, css);
    if (flat) paintSectorGuides(ctx, lake, geom, css);
    paintHudBand(ctx, geom, css);

    return cv;
  }

  /**
   * The HUD pills float over the top of the canvas, which used to be plain
   * dark water and is now textured bank and foliage. A soft darkening band
   * behind them keeps them readable without touching the pill CSS — and in the
   * light profile it lightens instead, since the pills go white there.
   */
  function paintHudBand(ctx, geom, css) {
    const light = parseColor(css('--bg'));
    const dark = !light || (light.r + light.g + light.b) / 3 < 128;
    const g = ctx.createLinearGradient(0, 0, 0, 120);
    g.addColorStop(0, dark ? 'rgba(0,0,0,.34)' : 'rgba(255,255,255,.42)');
    g.addColorStop(1, dark ? 'rgba(0,0,0,0)' : 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, geom.W, 120);
  }

  function paintBank(ctx, lake, geom, css, flat) {
    if (flat) {
      ctx.fillStyle = css('--bg');
      ctx.fillRect(0, 0, geom.W, geom.H);
      return;
    }
    const g = ctx.createLinearGradient(0, 0, 0, geom.H);
    g.addColorStop(0, shade(css('--foliage-dark'), -0.15));
    g.addColorStop(0.30, css('--bank-grass'));
    g.addColorStop(0.75, shade(css('--bank-grass'), -0.12));
    g.addColorStop(1, css('--bank-soil'));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, geom.W, geom.H);

    // Treeline across the top, then a ring of plantings hugging the bank —
    // between them they're what makes the water read as a pond in a garden
    // rather than a shape floating on a green rectangle.
    const rand = LG.mulberry32((lake.seed >>> 0) + 991);
    for (let x = -40; x < geom.W + 80; x += 62) {
      foliageClump(ctx, x + (rand() - 0.5) * 40, 10 + rand() * 40, 46 + rand() * 34, css, rand, flat);
    }
    for (let b = -104; b <= 104; b += 7) {
      const r = shoreRadius(lake, b, geom) * (1.05 + rand() * 0.2);
      const p = project(b, r, geom);
      if (p.y > geom.H + 60) continue;
      foliageClump(ctx, p.x, p.y, 22 + rand() * 30, css, rand, flat);
    }
  }

  function paintWater(ctx, lake, geom, css, flat) {
    ctx.save();
    shorelinePath(ctx, lake, geom);
    ctx.clip();

    if (flat) {
      ctx.fillStyle = css('--water-deep');
      ctx.fillRect(0, 0, geom.W, geom.H);
    } else {
      // Far is deep, near is shallow — the gradient runs with the perspective
      // rather than with a radius, which is what gives the pond a floor.
      const g = ctx.createLinearGradient(0, 0, 0, geom.boatY);
      g.addColorStop(0, css('--water-deep'));
      g.addColorStop(0.55, css('--water-mid'));
      g.addColorStop(1, css('--water-shallow'));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, geom.W, geom.H);
    }

    // Biome patches, far band first so nearer water overlaps it. Each patch is
    // filled with a radial gradient that fades to fully transparent at its own
    // rim: a flat fill would give every patch a hard edge and the pond would
    // look like sheets of coloured cellophane rather than water. This is also
    // why there's no blur anywhere in this file — a transparent gradient stop
    // costs nothing and works on every device the hub ships to.
    const bands = LG.BANDS.slice().reverse();
    lake.sectors.forEach(s => {
      bands.forEach(band => {
        const biomeId = s.biomesByBand[band];
        const biome = window.FishMasterData.BIOMES[biomeId];
        const pts = cellBlobPoints(lake, s.index, band, geom);
        ctx.save();
        ctx.beginPath();
        blobPath(ctx, pts);
        if (flat) {
          ctx.fillStyle = css(biome.cssVar);
        } else {
          let cx = 0, cy = 0;
          pts.forEach(p => { cx += p.x; cy += p.y; });
          cx /= pts.length; cy /= pts.length;
          let far = 0;
          pts.forEach(p => { far = Math.max(far, Math.hypot(p.x - cx, p.y - cy)); });
          const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, far * 1.02);
          const col = css(biome.cssVar);
          g.addColorStop(0, alpha(col, 0.44));
          g.addColorStop(0.55, alpha(col, 0.36));
          g.addColorStop(1, alpha(col, 0));
          ctx.fillStyle = g;
        }
        ctx.fill();
        // High Contrast needs a hard border between neighbouring patches —
        // two flat fills of similar value would otherwise merge into one shape
        // for a low-vision player.
        if (flat) {
          ctx.strokeStyle = css('--line');
          ctx.lineWidth = 2.5;
          ctx.stroke();
        }
        ctx.restore();
      });
    });

    lake.sectors.forEach(s => {
      bands.forEach(band => decorateCell(ctx, lake, s.index, band, s.biomesByBand[band], geom, css, flat));
    });

    // Inner shadow along the bank: a wide stroke on the shoreline whose outer
    // half the clip throws away. Two passes fake a falloff without paying for
    // a blur on every pixel of the frame.
    if (!flat) {
      shorelinePath(ctx, lake, geom);
      ctx.strokeStyle = alpha(css('--water-deep'), 0.35);
      ctx.lineWidth = 54; ctx.stroke();
      ctx.strokeStyle = alpha(css('--water-deep'), 0.3);
      ctx.lineWidth = 22; ctx.stroke();
    }
    ctx.restore();

    if (flat) {
      shorelinePath(ctx, lake, geom);
      ctx.strokeStyle = css('--line');
      ctx.lineWidth = 5;
      ctx.stroke();
    }
  }

  function paintRockRim(ctx, lake, geom, css, flat) {
    const rand = LG.mulberry32((lake.seed >>> 0) + 4241);
    for (let b = -104; b <= 104; b += 4.2) {
      const r = shoreRadius(lake, b, geom) * (0.985 + rand() * 0.035);
      const p = project(b, r, geom);
      if (p.y > geom.H + 70 || p.x < -90 || p.x > geom.W + 90) continue;
      // Perspective: rocks along the near edge of the pond are closer to the
      // camera, so they're drawn bigger.
      const depth = Math.max(0.3, Math.min(1, p.y / geom.H));
      const w = (16 + rand() * 16) * (0.55 + depth * 0.8);
      boulder(ctx, p.x, p.y, w, w * (0.55 + rand() * 0.2), (rand() - 0.5) * 1.2, css, rand, flat);
    }
    if (flat) return;
    // A handful of marginal plants overhanging the rim, drawn last so they sit
    // in front of the boulders the way they do in a real planted pond.
    for (let b = -100; b <= 100; b += 13) {
      if (rand() < 0.45) continue;
      const p = project(b, shoreRadius(lake, b, geom) * 0.99, geom);
      if (p.y > geom.H + 20) continue;
      reedClump(ctx, p.x, p.y, 30 + rand() * 26, 6, css, rand, flat);
    }
  }

  function paintFinish(ctx, lake, geom, css) {
    ctx.save();
    shorelinePath(ctx, lake, geom);
    ctx.clip();
    const rand = LG.mulberry32((lake.seed >>> 0) + 77);
    ctx.strokeStyle = alpha(css('--glint'), 0.1);
    ctx.lineCap = 'round';
    for (let i = 0; i < 16; i++) {
      const x = rand() * geom.W;
      const y = 40 + rand() * (geom.boatY - 40);
      const w = 40 + rand() * 130;
      ctx.lineWidth = 2 + rand() * 5;
      ctx.beginPath();
      ctx.moveTo(x - w / 2, y);
      ctx.quadraticCurveTo(x, y - 4, x + w / 2, y);
      ctx.stroke();
    }
    ctx.restore();

    const v = ctx.createRadialGradient(geom.W / 2, geom.H * 0.45, geom.H * 0.25, geom.W / 2, geom.H * 0.45, geom.W * 0.72);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,.3)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, geom.W, geom.H);
  }

  /** High Contrast only: the old hard sector dividers, kept as a legibility aid. */
  function paintSectorGuides(ctx, lake, geom, css) {
    const half = (LG.ARC_DEG / (lake.sectors.length - 1)) / 2;
    ctx.strokeStyle = alpha(css('--line'), 0.55);
    ctx.lineWidth = 2;
    lake.sectors.forEach(s => {
      [s.bearing - half, s.bearing + half].forEach(b => {
        const p = project(b, waterRadius(lake, b, geom), geom);
        ctx.beginPath();
        ctx.moveTo(geom.boatX, geom.boatY);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      });
    });
  }

  /* ══════════════════════════════════════════════════════════════════════════
     LIVE LAYERS — drawn over the bitmap every frame
     ══════════════════════════════════════════════════════════════════════════ */

  /**
   * The aim highlight. With the hard wedge dividers gone this is how the
   * player sees which patch of water the cast is pointed at — it rebuilds the
   * exact blob the bitmap already painted for that cell, so the highlight and
   * the water patch are the same shape. Purely a visual aid: the biome is also
   * spoken by announceFocus() and printed on the cast chips.
   */
  function paintFocusCell(ctx, lake, sectorIx, band, css, geom, opts) {
    const flat = !!(opts && opts.flat);
    ctx.save();
    // Clipped to the shoreline like the painted patches are, so the highlight
    // never spills onto the bank at the wide sectors.
    shorelinePath(ctx, lake, geom);
    ctx.clip();
    ctx.beginPath();
    blobPath(ctx, cellBlobPoints(lake, sectorIx, band, geom));
    ctx.fillStyle = alpha(css('--focus'), flat ? 0.3 : 0.2);
    ctx.fill();
    ctx.strokeStyle = css('--focus');
    ctx.lineWidth = flat ? 5 : 3;
    if (!flat) ctx.setLineDash([10, 8]);
    ctx.stroke();
    ctx.restore();
  }

  /** Slow surface drift. Skipped entirely under reduced motion or High Contrast. */
  function paintSurface(ctx, lake, t, css, geom) {
    ctx.save();
    shorelinePath(ctx, lake, geom);
    ctx.clip();
    ctx.strokeStyle = alpha(css('--glint'), 0.07);
    ctx.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      const y = 120 + i * 130;
      const drift = Math.sin(t * 0.22 + i * 1.7) * 46;
      ctx.lineWidth = 3 + i;
      ctx.beginPath();
      ctx.moveTo(-40 + drift, y);
      ctx.quadraticCurveTo(geom.W / 2 + drift, y - 12 - i * 3, geom.W + 40 + drift, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * The boat, seen from behind with the angler in it. Returns the rod tip so
   * the caller can run the cast line from the rod rather than from the hull.
   */
  function paintBoat(ctx, css, geom, opts) {
    const flat = !!(opts && opts.flat);
    const aim = opts && opts.aim;
    const x = geom.boatX, y = geom.boatY;

    if (!flat) {
      ctx.fillStyle = alpha(css('--glint'), 0.16);
      ctx.beginPath(); ctx.ellipse(x, y + 22, 78, 17, 0, 0, TAU); ctx.fill();
    }

    ctx.save();
    ctx.translate(x, y);

    const hull = () => {
      ctx.beginPath();
      ctx.moveTo(-46, 18);
      ctx.quadraticCurveTo(0, 42, 46, 18);     // transom, nearest the viewer
      ctx.quadraticCurveTo(41, -20, 23, -40);  // starboard gunwale
      ctx.quadraticCurveTo(0, -52, -23, -40);  // bow
      ctx.quadraticCurveTo(-41, -20, -46, 18); // port gunwale
      ctx.closePath();
    };

    hull();
    ctx.fillStyle = css('--boat');
    ctx.fill();
    ctx.strokeStyle = flat ? css('--line') : css('--boat-dark');
    ctx.lineWidth = flat ? 4 : 3;
    ctx.stroke();

    ctx.save();          // inner hull, so the boat reads as open, not a slab
    ctx.scale(0.8, 0.8);
    hull();
    ctx.fillStyle = flat ? css('--bg') : shade(css('--boat'), -0.4);
    ctx.fill();
    if (flat) { ctx.strokeStyle = css('--line'); ctx.lineWidth = 4; ctx.stroke(); }
    ctx.restore();

    ctx.fillStyle = css('--boat');                       // thwarts
    ctx.fillRect(-30, -14, 60, 7);
    ctx.fillRect(-33, 6, 66, 7);

    // The angler, from behind: shoulders, head, cap.
    ctx.fillStyle = css('--accent');
    ctx.beginPath(); ctx.ellipse(0, -2, 20, 17, 0, 0, TAU); ctx.fill();
    if (flat) { ctx.strokeStyle = css('--line'); ctx.lineWidth = 3; ctx.stroke(); }
    ctx.fillStyle = css('--angler');
    ctx.beginPath(); ctx.arc(0, -22, 11, 0, TAU); ctx.fill();
    if (flat) ctx.stroke();
    ctx.fillStyle = css('--accent2');
    ctx.beginPath(); ctx.arc(0, -24, 11, Math.PI, TAU); ctx.fill();
    if (flat) ctx.stroke();

    ctx.restore();

    // Rod: a curve leaning toward wherever the cast is aimed, so the boat
    // visibly points at the highlighted water.
    const lean = aim ? Math.max(-1, Math.min(1, (aim.x - x) / 460)) : 0;
    const gripX = x + 16, gripY = y - 10;
    const tipX = gripX + lean * 96, tipY = gripY - 104;
    ctx.save();
    ctx.strokeStyle = flat ? css('--line') : shade(css('--boat'), -0.3);
    ctx.lineCap = 'round';
    // Two passes, the second shorter and thinner, so the rod tapers toward the
    // tip instead of reading as a black bar planted in the boat.
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(gripX, gripY);
    ctx.quadraticCurveTo(gripX + lean * 34, gripY - 62, gripX + lean * 62, gripY - 66);
    ctx.stroke();
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(gripX + lean * 52, gripY - 56);
    ctx.quadraticCurveTo(gripX + lean * 76, gripY - 88, tipX, tipY);
    ctx.stroke();
    ctx.restore();

    return { x: tipX, y: tipY };
  }

  /** Dashed cast preview line from the rod tip to the landing point. */
  function paintCastLine(ctx, from, to, css) {
    ctx.save();
    ctx.setLineDash([7, 9]);
    ctx.strokeStyle = css('--focus');
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.quadraticCurveTo((from.x + to.x) / 2, Math.min(from.y, to.y) - 34, to.x, to.y);
    ctx.stroke();
    ctx.restore();
  }

  /** The float sitting where the lure will land / has landed. */
  function paintBobber(ctx, x, y, css, opts) {
    const flat = !!(opts && opts.flat);
    ctx.save();
    ctx.strokeStyle = alpha(css('--glint'), 0.5);
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(x, y + 3, 15, 6, 0, 0, TAU); ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, 8, Math.PI, TAU);
    ctx.fillStyle = css('--bad'); ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI);
    ctx.fillStyle = flat ? css('--text') : '#f4f6fa'; ctx.fill();
    ctx.strokeStyle = flat ? css('--line') : 'rgba(0,0,0,.45)';
    ctx.lineWidth = flat ? 3 : 2;
    ctx.beginPath(); ctx.arc(x, y, 8, 0, TAU); ctx.stroke();
    ctx.restore();
  }

  /**
   * Rings spreading from the bobber while something is biting. Squashed to
   * match the water's perspective. With reduced motion on, this settles into
   * two still rings instead — the bite is never signalled by movement alone,
   * it's always spoken as well.
   */
  function paintRipples(ctx, x, y, t, css, opts) {
    const still = !!(opts && opts.still);
    ctx.save();
    ctx.strokeStyle = css('--accent2');
    ctx.lineWidth = 2;
    if (still) {
      [26, 46].forEach(r => {
        ctx.globalAlpha = 0.5;
        ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.42, 0, 0, TAU); ctx.stroke();
      });
    } else {
      for (let k = 0; k < 3; k++) {
        const rr = 8 + (t * 130 + k * 22) % 66;
        ctx.globalAlpha = Math.max(0, 1 - rr / 66);
        ctx.beginPath(); ctx.ellipse(x, y, rr, rr * 0.42, 0, 0, TAU); ctx.stroke();
      }
    }
    ctx.restore();
  }

  return {
    project,
    bandRadius,
    waterRadius,
    buildLakeBitmap,
    paintBoat,
    paintFocusCell,
    paintSurface,
    paintCastLine,
    paintBobber,
    paintRipples,
    // exported for any later art work (fish, items) that wants the same helpers
    shade, alpha, blobPath
  };
})();
