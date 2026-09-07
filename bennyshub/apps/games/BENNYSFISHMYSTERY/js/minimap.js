/**
 * Benny's FishMaster — the chart in the corner.
 *
 * One lake, drawn once from the same chart the world and the cue read, then
 * cropped round the boat every frame. North is up and stays up: a chart that
 * turns with the boat is a chart you have to re-read every time you steer,
 * and this game is played by people who need to be able to glance.
 *
 * What is on it: the water by depth band (the four zones, in the same colours
 * as the words), the bank, the dock, the shoals near the boat, the job's
 * place as a ring, and the boat as an arrow with the depth under it. How much
 * of the lake shows depends on how far the vessel can go - on foot you see the
 * dock and the reed beds; in the motorboat you see the whole lake.
 *
 * Nothing here is authoritative. It is a picture of what game.js already
 * knows, and if the two ever disagree the chart is the one that is wrong.
 */
window.RT = window.RT || {};

RT.minimap = (function () {
  'use strict';

  let cv = null, ctx = null, chart = null;
  /* The whole lake, rasterised once: an offscreen canvas and the square of
     world it covers. `raster === false` means the picture could not be made
     (a headless run, a browser with no ImageData) and the crop paints flat. */
  let raster = null, rExt = null;
  const R = 384;                    // pixels across the whole-lake picture

  const COL = {
    land: '#c9bd93', bank: '#a3b478',
    shoreline: '#92d6ea', bay: '#4ea6cc', dropoff: '#2b6f9b', trench: '#12395c',
    dock: '#5a3a22', boat: '#ffffff', target: '#ffd23f', other: '#e8f4ff', ink: '#10202c',
    /* Piled timber. Wood against every water in the palette, and against the
       chart's paper - it has to read as an obstruction on both. */
    jam: '#7a5a3a',
  };

  function init(canvas) {
    cv = canvas || (typeof document !== 'undefined' && document.getElementById('minimap')) || null;
    ctx = cv && cv.getContext ? cv.getContext('2d') : null;
  }

  /** A new chart: forget the picture and draw it again on the next frame. */
  function setChart(c) {
    if (c === chart) return;
    chart = c;
    raster = null;
  }

  function waterCol(ft) {
    if (ft < 10) return COL.shoreline;
    if (ft < 35) return COL.bay;
    if (ft < 75) return COL.dropoff;
    return COL.trench;
  }
  function hex(h) {
    const n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  /**
   * The lake as a picture: one pixel per patch of water, coloured by depth.
   *
   * Square, and covering the whole chart, so the same picture serves the crop
   * in the corner and the map spread across the screen - they are the same
   * lake and must never disagree about the shape of it.
   *
   * @returns {{img: HTMLCanvasElement, ext: object}} or null if it cannot be
   *          made (a headless run, or a browser with no ImageData).
   */
  function makeRaster(c, px) {
    const e = c.extent;
    const pad = 80;
    const w = e.maxX - e.minX + pad * 2, h = e.maxZ - e.minZ + pad * 2;
    const side = Math.max(w, h);
    const cx = (e.minX + e.maxX) / 2, cz = (e.minZ + e.maxZ) / 2;
    const ext = { x0: cx - side / 2, z0: cz - side / 2, side: side };
    try {
      const off = document.createElement('canvas');
      off.width = px; off.height = px;
      const g = off.getContext('2d');
      const img = g.createImageData(px, px);
      if (!img || !img.data) return null;
      const d = img.data;
      for (let j = 0; j < px; j++) {
        for (let i = 0; i < px; i++) {
          const x = ext.x0 + (i + 0.5) / px * side;
          const z = ext.z0 + (j + 0.5) / px * side;
          const ft = c.depthAt(x, z);
          let col;
          if (ft > 0) col = waterCol(ft);
          else col = c.toShore(x, z) < 45 ? COL.bank : COL.land;
          const rgb = hex(col);
          const k = (j * px + i) * 4;
          d[k] = rgb[0]; d[k + 1] = rgb[1]; d[k + 2] = rgb[2]; d[k + 3] = 255;
        }
      }
      g.putImageData(img, 0, 0);
      return { img: off, ext: ext };
    } catch (e2) {
      return null;
    }
  }

  function buildRaster() {
    const made = makeRaster(chart, R);
    raster = made ? made.img : false;
    rExt = made ? made.ext : { x0: chart.extent.minX, z0: chart.extent.minZ,
                               side: Math.max(chart.extent.maxX - chart.extent.minX,
                                              chart.extent.maxZ - chart.extent.minZ) };
  }

  /**
   * Draw the chart round the boat.
   *
   * @param lake   the built world (or anything with `.chart`)
   * @param x,z    where the boat is
   * @param head   which way it points (0 = north = -Z)
   * @param spots  what game.js's pendingForMap() returns: shoals with x, z,
   *               fishColor, isTarget, isPlace, and spent/cued on the spot
   * @param view   how far this vessel can go, in units - sets the crop
   */
  function update(lake, x, z, head, spots, view, quest) {
    if (!cv) init();
    if (!cv || !ctx) return;
    const c = lake && lake.chart;
    if (c) setChart(c);
    if (!chart) return;
    if (raster === null) buildRaster();
    if (cv.style && cv.style.display === 'none') cv.style.display = '';

    const W = cv.width || 200, H = cv.height || 200;
    /* On foot the crop is tight round the dock; the motorboat sees the lake.
       Never wider than the picture, never so tight the boat fills it. */
    const rad = Math.max(150, Math.min((view || 600) * 0.6, rExt ? rExt.side / 2 : 900));
    const sc = W / (rad * 2);
    const px = (wx) => (wx - x) * sc + W / 2;
    const pz = (wz) => (wz - z) * sc + H / 2;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = COL.land;
    ctx.fillRect(0, 0, W, H);
    if (raster) {
      const sx = (x - rad - rExt.x0) / rExt.side * R;
      const sz = (z - rad - rExt.z0) / rExt.side * R;
      const ss = (rad * 2) / rExt.side * R;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(raster, sx, sz, ss, ss, 0, 0, W, H);
    }

    // The dock.
    const dk = chart.dock || { x: 0, z: 0 };
    ctx.fillStyle = COL.dock;
    ctx.fillRect(px(dk.x) - 3, pz(dk.z) - 3, 6, 6);

    /* THE LOG JAM. Drawn from the chart's own barrier, so the gap on the
       picture is the gap the hull goes through. Hatched across, the way a
       chart marks an obstruction, with the channel left plainly open. */
    (chart.barriers || []).forEach(function (b) {
      const Z = pz(b.z);
      if (Z < -10 || Z > H + 10) return;
      ctx.strokeStyle = COL.jam || '#6b5330';
      ctx.lineWidth = 3;
      ctx.lineCap = 'butt';
      [[b.fromX, b.gapX - b.gapHalf], [b.gapX + b.gapHalf, b.toX]].forEach(function (arm) {
        const A = px(arm[0]), B = px(arm[1]);
        if (B < -10 || A > W + 10) return;
        ctx.beginPath();
        ctx.moveTo(A, Z);
        ctx.lineTo(B, Z);
        ctx.stroke();
        /* Teeth, so it reads as piled timber rather than a drawn line. */
        ctx.lineWidth = 1.4;
        for (let X = A; X <= B; X += 5) {
          ctx.beginPath();
          ctx.moveTo(X, Z - 3);
          ctx.lineTo(X + 3, Z + 3);
          ctx.stroke();
        }
        ctx.lineWidth = 3;
      });
    });

    // Shoals, and the job's place.
    (spots || []).forEach(function (sp) {
      (sp.shoals || []).forEach(function (sh) {
        const X = px(sh.x), Z = pz(sh.z);
        if (X < -8 || Z < -8 || X > W + 8 || Z > H + 8) return;
        ctx.beginPath();
        if (sh.isPlace) {
          ctx.strokeStyle = COL.target;
          ctx.lineWidth = 2;
          ctx.arc(X, Z, 6.5, 0, Math.PI * 2);
          ctx.stroke();
          return;
        }
        ctx.globalAlpha = sp.spent ? 0.4 : 1;
        ctx.fillStyle = sh.isTarget ? COL.target : (sh.fishColor || COL.other);
        ctx.arc(X, Z, sh.isTarget ? 4 : 3, 0, Math.PI * 2);
        ctx.fill();
        if (sh.isTarget) { ctx.strokeStyle = COL.ink; ctx.lineWidth = 1; ctx.stroke(); }
        ctx.globalAlpha = 1;
      });
    });

    /* THE JOB'S SPOT, RINGED - the same mark as on the full chart. When it is
       off the crop it is drawn at the edge, in its direction, so the corner
       map still answers "which way, and how far off the picture". */
    if (quest) {
      const qx = px(quest.x), qz = pz(quest.z);
      const inside = qx > 8 && qx < W - 8 && qz > 8 && qz < H - 8;
      if (inside) {
        questRing(ctx, qx, qz, 9);
      } else {
        const dx = qx - W / 2, dz = qz - H / 2;
        const m = Math.max(Math.abs(dx), Math.abs(dz)) || 1;
        const k = (Math.min(W, H) / 2 - 11) / m;
        questRing(ctx, W / 2 + dx * k, H / 2 + dz * k, 6, 0.75);
      }
    }

    // The boat: an arrow, pointing the way it is going.
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(head || 0);
    ctx.fillStyle = COL.boat;
    ctx.strokeStyle = COL.ink;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -8); ctx.lineTo(6, 7); ctx.lineTo(0, 4); ctx.lineTo(-6, 7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // The depth under the boat, and which way is north.
    const ft = Math.max(0, Math.round(chart.depthAt(x, z)));
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    ctx.fillRect(4, H - 20, 58, 16);
    ctx.fillStyle = '#fff';
    ctx.fillText(ft + ' ft', 8, H - 5);
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    ctx.fillRect(W - 20, 4, 16, 16);
    ctx.fillStyle = '#fff';
    ctx.fillText('N', W - 17, 6);
  }

  /* ======================================================================
     THE MAP OF THE LAKE

     What Walt hands over in the first conversation: a chart of Whispering
     Lake, north up, drawn from the same data the boat drives on so it cannot
     be out of date or out of true.

     DRAWN AS A CHART, NOT AS A PICTURE OF ONE. The first version of this was
     the corner minimap's raster - a 512-pixel bitmap of coloured depths -
     stretched over a screen twice that wide, and it looked exactly like what
     it was: soft, blocky, and blurred at every edge. A chart is line work.
     So the water is bounded by the shoreline spline itself, the depth bands
     are filled between contours traced through the soundings, every contour
     is drawn as a line, and spot depths are printed on it the way they are on
     a real chart. Nothing is resampled, so nothing is soft: it is as sharp as
     the screen it is drawn on, at any size.

     What it does NOT show is fish. It is a map of the lake, not a map of the
     answers: finding them is the job.
     ====================================================================== */

  /* Depth bands, in the same feet the water is coloured by. Their NAMES come
     from the lake's own stages, so the map calls the water what Walt calls it,
     and a rewrite of the content renames the map along with him. */
  const BAND_FT = [0, 10, 35, 75];
  const BAND_FALLBACK = ['The Shoreline', 'The Shallow Bay', 'The Deep Drop-Off', 'The Abyssal Trench'];

  /* The chart's own palette: paper and ink, and water that goes from a pale
     shelf to a near-black trench. Deliberately not the minimap's colours -
     that one is a glance at speed, this one is meant to be read. */
  const CHART = {
    paper: '#e8dfc4', land: '#ded2ae', bank: '#cfc49c',
    /* The four waters, taken straight from the corner chart's palette so the
       glance and the study agree about what colour thirty feet is - and so
       the key on the map matches the wash, which is drawn from that same
       picture. */
    w1: COL.shoreline, w2: COL.bay, w3: COL.dropoff, w4: COL.trench,
    line: 'rgba(20,45,62,.40)', shore: '#16303f', sand: '#efe3bd',
    sound: 'rgba(12,30,42,.62)', ink: '#10202c',
    jam: '#6b4a26'
  };

  function bandsOf(c) {
    const st = (c && c.stages) || [];
    return BAND_FT.map(function (ft, k) {
      const s = st.find(function (x) { return x.depthFt && x.depthFt[0] === ft; });
      return { name: (s && s.name) || BAND_FALLBACK[k], min: ft,
               max: k + 1 < BAND_FT.length ? BAND_FT[k + 1] : 1e9 };
    });
  }

  /** A point out of the chart's own splines, which store [x, z] pairs. */
  function px2(p) { return p && p.x !== undefined ? [p.x, p.z] : p; }

  /* ── The grid everything is traced from ──────────────────────────────── */

  const GW = 168;                       // samples across the lake

  function sampleGrid(c) {
    const e = c.extent;
    const GH = Math.max(24, Math.round(GW * (e.maxZ - e.minZ) / (e.maxX - e.minX)));
    const cw = (e.maxX - e.minX) / GW, ch = (e.maxZ - e.minZ) / GH;
    const g = new Float32Array((GW + 1) * (GH + 1));
    for (let j = 0; j <= GH; j++) {
      for (let i = 0; i <= GW; i++) {
        g[j * (GW + 1) + i] = c.depthAt(e.minX + i * cw, e.minZ + j * ch);
      }
    }
    return { g: g, GW: GW, GH: GH, cw: cw, ch: ch, x0: e.minX, z0: e.minZ };
  }

  /**
   * Every line at one depth, traced through the grid.
   *
   * Marching squares: each cell of the grid is looked at in turn, the corners
   * are sorted into deeper-than and shallower-than, and the crossing points on
   * the cell's edges are joined. What comes back is the set of little segments
   * that make up the contour - a real isobath, traced through the soundings,
   * rather than the boundary between two colours of pixel.
   *
   * They are NOT chained into loops. Chaining is only needed to FILL a
   * contour, and an attempt at it produced closed shapes that were not there:
   * runs joined that do not belong together and leftovers closed across open
   * water, so the lake came out as a scatter of dark triangles. Drawing needs
   * no chaining, and the fill underneath is a wash.
   */
  function contoursAt(grid, level) {
    const { g, GW: W, GH: H, cw, ch, x0, z0 } = grid;
    const at = function (i, j) { return g[j * (W + 1) + i]; };
    const wx = function (i) { return x0 + i * cw; };
    const wz = function (j) { return z0 + j * ch; };
    const segs = [];
    const lerp = function (a, b, va, vb) {
      const t = (level - va) / ((vb - va) || 1e-6);
      return a + (b - a) * Math.max(0, Math.min(1, t));
    };

    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) {
        const d0 = at(i, j), d1 = at(i + 1, j), d2 = at(i + 1, j + 1), d3 = at(i, j + 1);
        let k = 0;
        if (d0 >= level) k |= 8;
        if (d1 >= level) k |= 4;
        if (d2 >= level) k |= 2;
        if (d3 >= level) k |= 1;
        if (k === 0 || k === 15) continue;
        // Where the line crosses each edge of this cell.
        const top    = [lerp(wx(i), wx(i + 1), d0, d1), wz(j)];
        const right  = [wx(i + 1), lerp(wz(j), wz(j + 1), d1, d2)];
        const bottom = [lerp(wx(i), wx(i + 1), d3, d2), wz(j + 1)];
        const left   = [wx(i), lerp(wz(j), wz(j + 1), d0, d3)];
        const push = function (a, b) { segs.push([a, b]); };
        switch (k) {
          case 1: case 14: push(left, bottom); break;
          case 2: case 13: push(bottom, right); break;
          case 3: case 12: push(left, right); break;
          case 4: case 11: push(top, right); break;
          case 5:          push(left, top); push(bottom, right); break;
          case 6: case 9:  push(top, bottom); break;
          case 7: case 8:  push(left, top); break;
          case 10:         push(left, bottom); push(top, right); break;
        }
      }
    }

    return segs;
  }

  /**
   * Where to write each band's name: the middle of it.
   *
   * "The middle" here means the point furthest from any water of a different
   * depth - found by measuring, on the same grid the contours come from, how
   * far every cell is from the nearest cell that is not in this band, and
   * taking the winner. A label placed that way sits in open water of its own
   * colour however oddly the band is shaped, which a centroid does not: the
   * trench wraps round the island, and the mean of it lands on the island.
   */
  function bandAnchors(c, grid) {
    const { g, GW: W, GH: H, cw, ch, x0, z0 } = grid;
    const bands = bandsOf(c);
    const cell = new Int8Array((W + 1) * (H + 1));
    for (let n = 0; n < cell.length; n++) {
      const ft = g[n];
      let b = -1;
      if (ft > 0) for (let k = 0; k < bands.length; k++) if (ft >= bands[k].min && ft < bands[k].max) b = k;
      cell[n] = b;
    }
    const CW = W + 1, CH = H + 1;
    /* Two passes of a chamfer distance transform - forward, then back - which
       is all it takes to give every cell its distance to the nearest cell of
       another band. The edge of the grid counts as another band, so a label
       never ends up half off the paper. */
    return bands.map(function (b, k) {
      const D = new Float32Array(CW * CH);
      for (let n = 0; n < D.length; n++) D[n] = cell[n] === k ? 1e6 : 0;
      for (let j = 0; j < CH; j++) for (let i = 0; i < CW; i++) {
        const n = j * CW + i;
        if (!D[n]) continue;
        let v = Math.min(i, j) + 1;
        if (i) v = Math.min(v, D[n - 1] + 1);
        if (j) v = Math.min(v, D[n - CW] + 1);
        if (i && j) v = Math.min(v, D[n - CW - 1] + 1.41);
        if (j && i < CW - 1) v = Math.min(v, D[n - CW + 1] + 1.41);
        D[n] = Math.min(D[n], v);
      }
      for (let j = CH - 1; j >= 0; j--) for (let i = CW - 1; i >= 0; i--) {
        const n = j * CW + i;
        if (!D[n]) continue;
        let v = Math.min(CW - 1 - i, CH - 1 - j) + 1;
        if (i < CW - 1) v = Math.min(v, D[n + 1] + 1);
        if (j < CH - 1) v = Math.min(v, D[n + CW] + 1);
        if (i < CW - 1 && j < CH - 1) v = Math.min(v, D[n + CW + 1] + 1.41);
        if (i && j < CH - 1) v = Math.min(v, D[n + CW - 1] + 1.41);
        D[n] = Math.min(D[n], v);
      }
      let best = -1, bv = 0;
      for (let n = 0; n < D.length; n++) if (D[n] > bv) { bv = D[n]; best = n; }
      if (best < 0) return null;
      return { name: b.name, room: bv, cw: cw,
               x: x0 + (best % CW) * cw,
               z: z0 + ((best / CW) | 0) * ch };
    }).filter(Boolean);
  }


  /* ── The country round the lake ───────────────────────────────────────
     Timber, high ground, marsh and the track down to the dock. Invented, and
     drawn like a chart's own faint furniture rather than like scenery: it is
     there so the eye has somewhere to rest between the water and the edge of
     the paper, and so the lake reads as a lake in a place.

     Laid down BEFORE the water, so nothing has to be clipped: whatever of it
     lands over the lake is painted over by the lake.

     One true thing in it: the timber is thickest behind the tackle shop,
     which is where the woods are in the world you can actually see. */

  /** An irregular closed blob: a centre, a radius, and a wobble per angle. */
  function blob(r, cx, cz, rad, squash) {
    const n = 18, wob = [];
    for (let i = 0; i < n; i++) wob.push(r.range(0.68, 1.3));
    /* Smoothed round the ring, so it is a wood rather than a starfish. */
    const smooth = wob.map(function (_w, i) {
      return (wob[(i - 1 + n) % n] + wob[i] * 2 + wob[(i + 1) % n]) / 4;
    });
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const k = i % n, a = k / n * Math.PI * 2;
      pts.push([cx + Math.cos(a) * rad * smooth[k],
                cz + Math.sin(a) * rad * smooth[k] * (squash || 1)]);
    }
    return { pts: pts, cx: cx, cz: cz, rad: rad, wob: smooth, squash: squash || 1, n: n };
  }

  /** A point inside a blob, roughly evenly spread. */
  function inBlob(r, b) {
    const a = r.range(0, Math.PI * 2);
    const k = Math.round(a / (Math.PI * 2) * b.n) % b.n;
    const d = Math.sqrt(r.next()) * b.rad * b.wob[k] * 0.92;
    return [b.cx + Math.cos(a) * d, b.cz + Math.sin(a) * d * b.squash];
  }

  function landDetail(c) {
    const e = c.extent;
    /* minimap.js has no other reason to touch the toolbox, so it is picked up
       here rather than aliased at the top of the file. */
    const U2 = RT.util;
    const r = U2.rng(U2.hash('whispering:shore-country'));
    const dry = function (x, z) { return c.depthAt(x, z) <= 0; };
    const clear = function (x, z, from) { return dry(x, z) && c.toShore(x, z) > (from || 26); };

    const out = { woods: [], hills: [], marsh: [], track: null, streams: [] };
    const W = e.maxX - e.minX, H = e.maxZ - e.minZ;
    const dk = c.dock || { x: 0, z: 0 };

    /* THE TIMBER, as five stands rather than a thousand freckles. */
    const stands = [
      { x: dk.x - 30,          z: dk.z + 150,        rad: 240, n: 26 },   // behind Walt's
      { x: e.minX + W * 0.15,  z: e.minZ + H * 0.34, rad: 460, n: 42 },
      { x: e.maxX - W * 0.13,  z: e.minZ + H * 0.60, rad: 500, n: 46 },
      { x: e.minX + W * 0.24,  z: e.minZ + H * 0.82, rad: 380, n: 34 },
      { x: e.maxX - W * 0.18,  z: e.minZ + H * 0.12, rad: 430, n: 38 },
      { x: e.maxX - W * 0.07,  z: e.minZ + H * 0.42, rad: 380, n: 32 },
      { x: e.minX + W * 0.40,  z: e.maxZ + 260,      rad: 340, n: 28 },
      { x: e.maxX - W * 0.30,  z: e.maxZ + 220,      rad: 300, n: 24 },
      /* The eastern shoulder, which the lake's own outline leaves bare. */
      { x: e.maxX + 90,        z: e.minZ + H * 0.24, rad: 320, n: 26 },
      { x: e.maxX + 60,        z: e.minZ + H * 0.72, rad: 300, n: 24 },
      { x: e.minX - 60,        z: e.minZ + H * 0.66, rad: 280, n: 22 },
    ];
    stands.forEach(function (s2) {
      if (!clear(s2.x, s2.z, 60)) return;
      const b = blob(r, s2.x, s2.z, s2.rad, r.range(0.7, 1.0));
      const trees = [];
      for (let i = 0; i < s2.n * 4 && trees.length < s2.n; i++) {
        const p = inBlob(r, b);
        if (!clear(p[0], p[1], 30)) continue;
        trees.push({ x: p[0], z: p[1], fir: r.next() < 0.7, s: r.range(0.85, 1.3) });
      }
      out.woods.push({ blob: b.pts, trees: trees });
    });

    /* HIGH GROUND, as a chart draws it: closed rings, one inside the other. */
    [
      { x: e.minX + W * 0.09, z: e.minZ + H * 0.52, rad: 300 },
      { x: e.maxX - W * 0.08, z: e.minZ + H * 0.30, rad: 250 },
      { x: e.maxX - W * 0.11, z: e.minZ + H * 0.78, rad: 230 },
      { x: e.minX + W * 0.34, z: e.minZ + H * 0.04, rad: 260 },
      { x: e.minX + W * 0.12, z: e.minZ + H * 0.14, rad: 240 },
      { x: e.maxX - W * 0.06, z: e.minZ + H * 0.52, rad: 210 },
      { x: e.minX + W * 0.10, z: e.minZ + H * 0.86, rad: 220 },
      { x: e.maxX + 110,      z: e.minZ + H * 0.46, rad: 240 },
      { x: e.maxX - W * 0.02, z: e.minZ + H * 0.06, rad: 230 },
    ].forEach(function (h) {
      if (!clear(h.x, h.z, 140)) return;
      const rings = [];
      for (let k = 0; k < 3; k++) {
        rings.push(blob(r, h.x, h.z, h.rad * (1 - k * 0.3), 0.68).pts);
      }
      out.hills.push(rings);
    });

    /* MARSH, at the water's edge where marsh is, and in ONE place. Scattered
       round the whole lake it read as dashes on the paper rather than as wet
       ground: a marsh is a corner of a lake, not a border round it. */
    let mx = null, mz = null;
    for (let i = 0; i < 3000 && mx === null; i++) {
      const x = e.minX + r.range(0, W * 0.45);
      const z = e.minZ + H * 0.45 + r.range(0, H * 0.4);
      if (!dry(x, z)) continue;
      const d = c.toShore(x, z);
      if (d > 55 || d < 14) continue;
      mx = x; mz = z;
    }
    if (mx !== null) {
      out.marsh.push({ x: mx, z: mz });
      for (let i = 0; i < 2000 && out.marsh.length < 34; i++) {
        const x = mx + r.range(-260, 260), z = mz + r.range(-190, 190);
        if (!dry(x, z)) continue;
        const d = c.toShore(x, z);
        if (d > 110 || d < 10) continue;
        out.marsh.push({ x: x, z: z });
      }
    }

    /* Two streams, downhill until they reach the lake. */
    [[e.minX + W * 0.09, e.minZ + H * 0.52], [e.maxX - W * 0.08, e.minZ + H * 0.30]]
      .forEach(function (h) {
        const pts = [];
        let x = h[0], z = h[1], a = Math.atan2(dk.z - z, dk.x - x);
        for (let i = 0; i < 60; i++) {
          a += r.range(-0.4, 0.4);
          x += Math.cos(a) * 55; z += Math.sin(a) * 55;
          pts.push([x, z]);
          if (!dry(x, z)) break;
        }
        if (pts.length > 4) out.streams.push(pts);
      });

    /* THE TRACK: in from the bottom of the paper, down to the dock, which is
       the only way anybody gets to this lake at all. */
    const track = [];
    /* From well off the bottom of the paper, so it reads as a road arriving
       from somewhere rather than as a mark that starts in a field. */
    const z0 = e.maxZ + 420, z1 = dk.z + 80;
    for (let i = 0; i <= 12; i++) {
      const k = i / 12;
      track.push([dk.x + 70 - 70 * k + Math.sin(k * 4.2) * 120 * (1 - k * 0.7),
                  z0 + (z1 - z0) * k]);
    }
    out.track = track;
    return out;
  }

  /** Draw the invented country. World coordinates in, chart ink out. */
  function drawLand(g, land, px, pz, sc) {
    const path = function (pts, close) {
      g.beginPath();
      pts.forEach(function (p, i) {
        const X = px(p[0]), Y = pz(p[1]);
        if (i === 0) g.moveTo(X, Y); else g.lineTo(X, Y);
      });
      if (close) g.closePath();
    };

    // High ground first: the rings sit under everything else.
    g.strokeStyle = 'rgba(122,101,64,.42)';
    g.lineWidth = 1.3;
    land.hills.forEach(function (rings) {
      rings.forEach(function (pts) { path(pts, true); g.stroke(); });
    });

    // The wash of timber, then the trees that say what the wash is.
    land.woods.forEach(function (w) {
      path(w.blob, true);
      g.fillStyle = 'rgba(122,146,88,.20)';
      g.fill();
      g.strokeStyle = 'rgba(104,126,74,.28)';
      g.lineWidth = 1;
      g.stroke();
    });

    // Streams, and the track down to the dock.
    g.strokeStyle = 'rgba(70,120,140,.5)';
    g.lineWidth = 1.5;
    land.streams.forEach(function (pts) { path(pts, false); g.stroke(); });
    if (land.track) {
      g.strokeStyle = 'rgba(126,98,58,.7)';
      g.lineWidth = 2.6;
      g.setLineDash([9, 6]);
      path(land.track, false);
      g.stroke();
      g.setLineDash([]);
    }

    // Marsh: the tufts a chart uses for wet ground.
    g.strokeStyle = 'rgba(80,112,70,.55)';
    g.lineWidth = 1.1;
    land.marsh.forEach(function (m) {
      const X = px(m.x), Y = pz(m.z);
      g.beginPath();
      for (let k = -1; k <= 1; k++) { g.moveTo(X - 5, Y + k * 3); g.lineTo(X + 5, Y + k * 3); }
      g.stroke();
    });

    /* The trees themselves: a fir is a spike, a hardwood a round crown. Drawn
       big enough to be read as trees - the first attempt used a thousand of
       them at three pixels and it looked like dust on the lens. */
    const h = Math.max(5, 34 * sc);
    land.woods.forEach(function (w) {
      w.trees.forEach(function (t) {
        const X = px(t.x), Y = pz(t.z), S = h * t.s;
        g.strokeStyle = 'rgba(58,78,46,.6)';
        g.lineWidth = 1;
        if (t.fir) {
          g.beginPath();
          g.moveTo(X, Y - S);
          g.lineTo(X + S * 0.42, Y + S * 0.3);
          g.lineTo(X - S * 0.42, Y + S * 0.3);
          g.closePath();
          g.fillStyle = 'rgba(74,96,58,.5)';
          g.fill();
          g.stroke();
        } else {
          g.beginPath();
          g.arc(X, Y - S * 0.2, S * 0.42, 0, Math.PI * 2);
          g.fillStyle = 'rgba(104,124,68,.45)';
          g.fill();
          g.stroke();
          g.beginPath();
          g.moveTo(X, Y + S * 0.32); g.lineTo(X, Y + S * 0.14);
          g.stroke();
        }
      });
    });
  }

  /* All of it is dear to work out and none of it changes while the lake does
     not, so the whole chart is traced once and kept. */
  let mapCache = null;

  function mapDataFor(c) {
    if (mapCache && mapCache.chart === c) return mapCache;
    const grid = sampleGrid(c);
    /* THE WASH, AND WHAT IT COSTS. It is one sample of the lake per pixel,
       and a sample is a spline through the soundings - about ten microseconds
       each. A 768-pixel picture is six hundred thousand of them: six seconds
       of a frozen game the first time somebody opens the map, which is not a
       price worth paying for a soft-edged fill that has crisp contour lines
       drawn over it anyway.
       So the map shares the ONE picture the corner chart already builds. If
       the player has been out on the water it is made and waiting; if this is
       their first look at the map from the dock, it costs a second, once, and
       is then kept for the session. */
    setChart(c);
    if (raster === null) buildRaster();
    mapCache = {
      chart: c, grid: grid,
      img: raster || null, ext: rExt,
      anchors: bandAnchors(c, grid),
      islandAt: islandCentre(c),
      land: landDetail(c),
      contours: BAND_FT.slice(1).map(function (ft) {
        return { ft: ft, segs: contoursAt(grid, ft) };
      })
    };
    return mapCache;
  }

  /** The middle of the island, if the lake has one. */
  function islandCentre(c) {
    const pts = c.island;
    if (!pts || !pts.length) return null;
    let sx = 0, sz = 0, n = 0;
    pts.forEach(function (p) {
      const q = px2(p);
      sx += q[0]; sz += q[1]; n++;
    });
    return n ? { x: sx / n, z: sz / n } : null;
  }

  function label(g, text, X, Z, size, col, track) {
    g.font = 'bold ' + size + 'px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = Math.max(3, size * 0.36);
    g.lineJoin = 'round';
    g.strokeStyle = 'rgba(246,240,222,.92)';
    g.strokeText(text, X, Z);
    g.fillStyle = col || CHART.shore;
    g.fillText(text, X, Z);
    if (track) return;
  }

  function textWidth(g, text, size) {
    g.font = 'bold ' + size + 'px system-ui, sans-serif';
    const m = g.measureText(text);
    return (m && m.width) || text.length * size * 0.55;
  }

  /**
   * Somewhere to put a name where there is not already one.
   *
   * Type that lands on other type is worse than no type: on the first cut of
   * this map the words "You are here" sat straight across "The Shoreline" and
   * one of the lake's four waters had no readable name at all. So every label
   * claims a box, and the ones that can move - the island, the dock, you -
   * try their preferred spot first and then a short list of alternatives.
   *
   * @param spots  [dx, dy] offsets from the mark, best first
   * @returns the box it took, or the first choice if nothing was free
   */
  function placeLabel(taken, g, text, size, X, Y, spots) {
    const w = textWidth(g, text, size) + 8;
    const h = size * 1.35;
    const clear = function (x, y) {
      return !taken.some(function (b) {
        return Math.abs(x - b.x) < (w + b.w) / 2 && Math.abs(y - b.y) < (h + b.h) / 2;
      });
    };
    for (let i = 0; i < spots.length; i++) {
      const x = X + spots[i][0], y = Y + spots[i][1];
      if (clear(x, y)) { const b = { x: x, y: y, w: w, h: h }; taken.push(b); return b; }
    }
    const b = { x: X + spots[0][0], y: Y + spots[0][1], w: w, h: h };
    taken.push(b);
    return b;
  }

  /**
   * Draw the whole lake into `canvas`.
   *
   * @param canvas  where to draw it - sized by the caller
   * @param c       the chart (RT.lake.chart), the same one the boat drives on
   * @param you     {x, z, head, label} - where the player is standing or afloat
   * @returns a note of what it drew - every label with both its place on the
   *          paper and its place on the lake, and the scale bar's length. The
   *          map is only worth having if it is TRUE, and that is checkable:
   *          tools/mapcheck.js asks the chart what is at each label's spot.
   */
  /**
   * The ring round the job's own spot.
   *
   * Drawn the same way on the corner map and on the full chart, because a
   * player who learns what it means on one should not have to learn it again
   * on the other: a broken gold ring, a little bigger than anything else on
   * the water, with a cross in the middle of it.
   */
  function questRing(g, X, Z, R, alpha) {
    g.save();
    g.globalAlpha = alpha === undefined ? 1 : alpha;
    g.lineWidth = Math.max(2, R * 0.22);
    g.strokeStyle = '#d8a11f';
    g.setLineDash([R * 0.85, R * 0.5]);
    g.beginPath();
    g.arc(X, Z, R, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
    /* A cross in the middle, so the ring reads as "here" rather than as a
       hole in the water. */
    g.lineWidth = Math.max(1.5, R * 0.16);
    g.beginPath();
    g.moveTo(X - R * 0.42, Z); g.lineTo(X + R * 0.42, Z);
    g.moveTo(X, Z - R * 0.42); g.lineTo(X, Z + R * 0.42);
    g.stroke();
    g.restore();
  }

  function drawMap(canvas, c, you, quest) {
    if (!canvas || !c || !canvas.getContext) return null;
    const g = canvas.getContext('2d');
    if (!g) return null;
    const drawn = [];
    const W = canvas.width, H = canvas.height;
    const data = mapDataFor(c);
    const e = c.extent;

    /* North up, the whole lake on the paper, square pixels - and a belt of
       country round it. The chart's extent is the extent of the WATER, and
       the dock sits sixty units from the bottom edge of it, so fitting the
       lake exactly left no land at all on the side the road comes in from. */
    const M = Math.round(Math.min(W, H) * 0.045) + 8;
    const shoulder = Math.max(e.maxX - e.minX, e.maxZ - e.minZ) * 0.075;
    const spanX = (e.maxX - e.minX) + shoulder * 2;
    const spanZ = (e.maxZ - e.minZ) + shoulder * 2;
    const sc = Math.min((W - M * 2) / spanX, (H - M * 2) / spanZ);
    const cx = (e.minX + e.maxX) / 2, cz = (e.minZ + e.maxZ) / 2;
    const px = function (wx) { return (wx - cx) * sc + W / 2; };
    const pz = function (wz) { return (wz - cz) * sc + H / 2; };

    // Paper.
    g.clearRect(0, 0, W, H);
    g.fillStyle = CHART.paper;
    g.fillRect(0, 0, W, H);

    /* The land, as a wash rather than a flat fill: the bank a shade darker
       than the paper, so a shoreline reads even before the ink goes on. */
    g.fillStyle = CHART.land;
    g.fillRect(0, 0, W, H);

    /* The country round the lake - timber, high ground, marsh, the track in.
       Invented, and drawn before the water so that anything of it that
       strays over the shoreline is simply painted over. */
    if (data.land) drawLand(g, data.land, px, pz, sc);

    const trace = function (pts, close) {
      g.beginPath();
      pts.forEach(function (p, i) {
        const q = px2(p);
        const X = px(q[0]), Y = pz(q[1]);
        if (i === 0) g.moveTo(X, Y); else g.lineTo(X, Y);
      });
      if (close !== false) g.closePath();
    };

    // The water, inside the shoreline itself - no resampling, so no blur.
    if (c.shore && c.shore.length) {
      /* A soft sandy margin just outside the waterline, which is what makes
         a chart look like a chart rather than like a filled shape. */
      trace(c.shore);
      g.strokeStyle = CHART.sand;
      g.lineWidth = Math.max(6, sc * 9);
      g.lineJoin = 'round';
      g.stroke();
      trace(c.shore);
      g.fillStyle = CHART.w1;
      g.fill();
    }

    /* The depths, as a wash inside the shoreline. It is a resampled picture
       and it is soft, which is exactly what a wash should be - the crisp part
       of a chart is the line work, and that goes on next. */
    if (data.img) {
      g.save();
      if (c.shore && c.shore.length) { trace(c.shore); g.clip(); }
      g.globalAlpha = 0.92;
      g.imageSmoothingEnabled = true;
      g.drawImage(data.img, px(data.ext.x0), pz(data.ext.z0),
                  data.ext.side * sc, data.ext.side * sc);
      g.globalAlpha = 1;
      g.restore();
    }

    /* THE CONTOURS: ten feet, thirty-five, seventy-five - the same three
       depths the waters are named for, and the same three the boats are
       limited by. Stroked segment by segment, each one exact. */
    g.lineJoin = 'round';
    g.lineCap = 'round';
    data.contours.forEach(function (band, k) {
      g.beginPath();
      band.segs.forEach(function (s) {
        g.moveTo(px(s[0][0]), pz(s[0][1]));
        g.lineTo(px(s[1][0]), pz(s[1][1]));
      });
      g.strokeStyle = CHART.line;
      g.lineWidth = k === 2 ? 1.9 : 1.2;      // the deep edge drawn heaviest
      g.stroke();
    });
    g.lineCap = 'butt';

    // The island: land again, on top of the water it sits in.
    if (c.island && c.island.length) {
      trace(c.island);
      g.fillStyle = CHART.land;
      g.fill();
      g.strokeStyle = CHART.shore;
      g.lineWidth = 1.8;
      g.stroke();
    }

    /* THE LOG JAM, as a chart marks an obstruction: hatched across the water
       with the channel through it left open. Drawn from the same barrier the
       boat is stopped by - a chart that disagreed with the lake about where
       the way through is would be worse than no chart. */
    (c.barriers || []).forEach(function (b) {
      const Z = pz(b.z);
      g.strokeStyle = CHART.jam || '#6b5330';
      [[b.fromX, b.gapX - b.gapHalf], [b.gapX + b.gapHalf, b.toX]].forEach(function (arm) {
        const A = px(arm[0]), B = px(arm[1]);
        g.lineWidth = 2.6;
        g.beginPath();
        g.moveTo(A, Z);
        g.lineTo(B, Z);
        g.stroke();
        g.lineWidth = 1.5;
        for (let X = A; X <= B; X += 7) {
          g.beginPath();
          g.moveTo(X, Z - 4.5);
          g.lineTo(X + 4, Z + 4.5);
          g.stroke();
        }
      });
    });

    // The waterline, in ink.
    if (c.shore && c.shore.length) {
      trace(c.shore);
      g.strokeStyle = CHART.shore;
      g.lineWidth = 2.2;
      g.stroke();
    }

    /* SPOT DEPTHS. The soundings the chart is built from, printed where they
       were taken - which is what a chart of a lake actually carries, and what
       tells you the deep water is deep. */
    const sounds = c.soundings || [];
    g.font = '600 ' + Math.max(9, Math.round(Math.min(W, H) / 74)) + 'px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = CHART.sound;
    sounds.forEach(function (s) {
      const ft = s.ft !== undefined ? s.ft : s[2];
      const sx = s.x !== undefined ? s.x : s[0];
      const sz = s.z !== undefined ? s.z : s[1];
      if (!(ft > 0)) return;
      g.fillText(String(Math.round(ft)), px(sx), pz(sz));
    });

    const base = Math.max(13, Math.min(26, Math.round(Math.min(W, H) / 34)));
    const taken = [];
    const note = function (text, kind, box, wx, wz) {
      drawn.push({ text: text, kind: kind, x: box.x, y: box.y, w: box.w, h: box.h,
                   wx: wx, wz: wz });
    };

    /* THE WATERS FIRST, and each one sized to the water it names. The distance
       transform that found the anchor also measured how much room there is
       round it; a name wider than that hangs over the next band down, which is
       how "The Deep Drop-Off" came to sit half over the trench. */
    data.anchors.forEach(function (a) {
      const roomPx = Math.max(60, a.room * a.cw * sc * 1.9);
      let size = base;
      while (size > 11 && textWidth(g, a.name, size) > roomPx) size -= 1;
      const box = placeLabel(taken, g, a.name, size, px(a.x), pz(a.z), [[0, 0]]);
      label(g, a.name, box.x, box.y, size);
      note(a.name, 'water', box, a.x, a.z);
    });

    if (data.islandAt) {
      const ix = px(data.islandAt.x), iy = pz(data.islandAt.z);
      const size = base * 0.85;
      const box = placeLabel(taken, g, 'The Island', size, ix, iy,
                             [[0, 0], [0, -size * 1.6], [0, size * 1.6]]);
      label(g, 'The Island', box.x, box.y, size, CHART.shore);
      note('The Island', 'island', box, data.islandAt.x, data.islandAt.z);
    }

    /* The dock: a little pier, drawn in ink so it reads on the pale shelf. */
    const dk = c.dock || { x: 0, z: 0 };
    const dx = px(dk.x), dz = pz(dk.z);
    g.strokeStyle = CHART.shore;
    g.lineWidth = 3.5;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(dx, dz - 15); g.lineTo(dx, dz + 11);
    g.moveTo(dx - 8, dz - 13); g.lineTo(dx + 8, dz - 13);
    g.stroke();
    g.lineCap = 'butt';
    {
      const size = base * 0.8;
      const box = placeLabel(taken, g, "Walt's Dock", size, dx, dz,
                             [[0, 28], [0, -30], [0, 46], [0, -48]]);
      label(g, "Walt's Dock", box.x, box.y, size, CHART.shore);
      note("Walt's Dock", 'dock', box, dk.x, dk.z);
    }

    /* WHERE THE JOB IS. Drawn before the boat, so that when you are standing
       on top of it the boat is the thing on top. */
    if (quest) {
      const qx = px(quest.x), qz = pz(quest.z);
      const QR = Math.max(13, base * 0.95);
      questRing(g, qx, qz, QR);
      const qs = base * 0.72;
      const qbox = placeLabel(taken, g, quest.label, qs, qx, qz,
                              [[0, -QR - qs], [0, QR + qs],
                               [QR + qs * 2, 0], [-QR - qs * 2, 0]]);
      label(g, quest.label, qbox.x, qbox.y, qs, '#9a6f10');
      note(quest.label, 'quest', qbox, quest.x, quest.z);
    }

    /* WHERE YOU ARE - the one thing on the map that answers a question, so it
       is the boldest mark on it: a white disc with a red ring round it, which
       carries over the pale shelf and the black trench alike, and an arrow in
       the middle pointing the way the boat is heading. */
    if (you) {
      const yx = px(you.x), yz = pz(you.z);
      const R2 = Math.max(15, base * 0.85);
      g.save();
      g.translate(yx, yz);
      g.beginPath();
      g.arc(0, 0, R2, 0, Math.PI * 2);
      g.fillStyle = 'rgba(255,255,255,.94)';
      g.fill();
      g.lineWidth = 4;
      g.strokeStyle = '#d8342a';
      g.stroke();
      g.rotate(you.head || 0);
      g.beginPath();
      g.moveTo(0, -R2 * 0.62); g.lineTo(R2 * 0.45, R2 * 0.55);
      g.lineTo(0, R2 * 0.3); g.lineTo(-R2 * 0.45, R2 * 0.55);
      g.closePath();
      g.fillStyle = '#d8342a';
      g.fill();
      g.restore();
      const size = base * 0.8;
      const text = you.label || 'You are here';
      const off = R2 + size;
      const box = placeLabel(taken, g, text, size, yx, yz,
                             [[0, -off], [0, off], [0, -off - size * 1.5],
                              [0, off + size * 1.5]]);
      label(g, text, box.x, box.y, size, '#b02a20');
      note(text, 'you', box, you.x, you.z);
    }

    /* A key to the colours, because a chart with unnamed bands is a picture.
       Bottom right, out of the way of the lake itself. */
    const keyFt = ['0-10 ft', '10-35 ft', '35-75 ft', '75 ft +'];
    const keyCol = [CHART.w1, CHART.w2, CHART.w3, CHART.w4];
    /* Top right, under the compass - NOT bottom right, which is where the
       Close button lives: the button sat squarely over the two deepest rows
       of the key, so the map explained its own pale water and hid the fact
       that the dark water meant seventy-five feet and more. */
    const kw = Math.max(96, base * 5.2), kh = base * 1.15;
    const rose = Math.max(22, base * 1.5);
    const kx = W - kw - 16, ky = rose * 2 + 42;
    g.fillStyle = 'rgba(246,240,222,.88)';
    g.strokeStyle = CHART.shore;
    g.lineWidth = 1.5;
    g.fillRect(kx - 8, ky - 8, kw + 16, kh * 4 + 16);
    g.strokeRect(kx - 8, ky - 8, kw + 16, kh * 4 + 16);
    g.textAlign = 'left';
    g.font = '600 ' + Math.round(base * 0.62) + 'px system-ui, sans-serif';
    keyFt.forEach(function (t, i) {
      g.fillStyle = keyCol[i];
      g.fillRect(kx, ky + i * kh + kh * 0.18, kh * 0.8, kh * 0.64);
      g.strokeStyle = CHART.line;
      g.lineWidth = 1;
      g.strokeRect(kx, ky + i * kh + kh * 0.18, kh * 0.8, kh * 0.64);
      g.fillStyle = CHART.shore;
      g.fillText(t, kx + kh * 1.2, ky + i * kh + kh * 0.55);
    });
    g.textAlign = 'center';

    // North, and how far a thing is: a lake with no scale is a picture.
    const NR = Math.max(22, base * 1.5);
    g.save();
    g.translate(W - NR - 18, NR + 18);
    g.beginPath();
    g.arc(0, 0, NR, 0, Math.PI * 2);
    g.fillStyle = 'rgba(246,240,222,.9)';
    g.fill();
    g.strokeStyle = CHART.shore;
    g.lineWidth = 1.8;
    g.stroke();
    g.beginPath();
    g.moveTo(0, -NR * 0.66); g.lineTo(NR * 0.28, NR * 0.38); g.lineTo(0, NR * 0.14);
    g.lineTo(-NR * 0.28, NR * 0.38);
    g.closePath();
    g.fillStyle = '#d8342a';
    g.fill();
    label(g, 'N', 0, -NR * 0.8, base * 0.72, CHART.shore);
    g.restore();

    /* A scale bar in feet, because every distance this game says out loud is
       in feet - a cast, a rod's reach, the depth under the boat. */
    const FT = 0.61;                       // world units per foot, as js/data.js has it
    const want = [100, 250, 500, 1000, 2000];
    const barFt = want.find(function (f) { return f * FT * sc > W * 0.12; }) || 2000;
    const barPx = barFt * FT * sc;
    const bx = 18, by = H - 24;
    g.fillStyle = 'rgba(246,240,222,.88)';
    g.strokeStyle = CHART.shore;
    g.lineWidth = 1.5;
    g.fillRect(bx - 8, by - 20, barPx + 16, 34);
    g.strokeRect(bx - 8, by - 20, barPx + 16, 34);
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(bx, by); g.lineTo(bx + barPx, by);
    g.moveTo(bx, by - 6); g.lineTo(bx, by + 6);
    g.moveTo(bx + barPx, by - 6); g.lineTo(bx + barPx, by + 6);
    g.stroke();
    label(g, barFt + ' ft', bx + barPx / 2, by - 11, base * 0.66, CHART.shore);

    // A ruled border, the way a chart is trimmed.
    g.strokeStyle = CHART.shore;
    g.lineWidth = 3;
    g.strokeRect(6, 6, W - 12, H - 12);
    g.lineWidth = 1;
    g.strokeRect(12, 12, W - 24, H - 24);

    return { labels: drawn, scaleFt: barFt, scalePx: barPx, pxPerUnit: sc,
             bands: data.anchors.map(function (a) { return a.name; }),
             contours: data.contours.map(function (b) {
               return { ft: b.ft, segs: b.segs.length };
             }) };
  }

  /**
   * Trace the lake before anybody asks for it.
   *
   * The picture of the depths costs about a second to make - one spline
   * through the soundings per pixel - and it is made the first time either
   * chart wants it. Called a moment after the game settles, that second is
   * spent while the player is reading the dock instead of while they are
   * waiting for a map they have just asked for.
   */
  function warm(c) {
    if (!c) return false;
    setChart(c);
    if (raster === null) buildRaster();
    return true;
  }

  function show(on) { if (cv && cv.style) cv.style.display = on ? '' : 'none'; }

  return { init: init, setChart: setChart, update: update, show: show, drawMap: drawMap, warm: warm,
           /* Kept for callers written against the old zoned chart. */
           setZone: function () {} };
})();
